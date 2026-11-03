const engine = require('../game/engine');
const { chooseMove } = require('../game/bot');

const MODE_COLORS = {
  2: ['red', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};
const TURN_MS = 20000;
const QUEUE_WAIT_MS = 8000;
const SKIP_MS = 1200;
const MAX_MISSED = 3;

const rooms = new Map();
const queues = { 2: [], 4: [] };
const queueTimers = { 2: null, 4: null };
let roomCounter = 0;

// ---------- Friend rooms (private lobbies) ----------

const lobbies = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O or 1/I
const cleanName = (n) => String(n || 'Player').trim().slice(0, 15) || 'Player';

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (lobbies.has(code));
  return code;
}

function broadcastLobby(io, lobby) {
  io.to('lobby_' + lobby.code).emit('lobby_update', {
    code: lobby.code,
    mode: lobby.mode,
    hostId: lobby.hostId,
    players: lobby.players.map((p) => ({ id: p.socket.id, name: p.name })),
  });
}

function leaveLobby(io, socket) {
  const code = socket.data.lobbyCode;
  if (!code) return;
  socket.data.lobbyCode = null;
  socket.leave('lobby_' + code);
  const lobby = lobbies.get(code);
  if (!lobby) return;
  lobby.players = lobby.players.filter((p) => p.socket.id !== socket.id);
  if (lobby.players.length === 0) {
    lobbies.delete(code);
    return;
  }
  if (lobby.hostId === socket.id) lobby.hostId = lobby.players[0].socket.id; // pass host role on
  broadcastLobby(io, lobby);
}

function joinLobby(io, lobby, socket, name) {
  lobby.players.push({ socket, name: cleanName(name) });
  socket.data.lobbyCode = lobby.code;
  socket.join('lobby_' + lobby.code);
  broadcastLobby(io, lobby);
}

// ---------- Game helpers ----------

function seatOf(room, color) {
  return room.seats.find((s) => s.color === color);
}

function publicState(room) {
  return {
    roomId: room.id,
    seats: room.seats.map((s) => ({ color: s.color, name: s.name, isBot: s.isBot })),
    tokens: room.game.tokens,
    turn: room.game.turn,
    phase: room.phase, // roll | move | skip | over
    dice: room.dice,
    validMoves: room.validMoves,
    lastMove: room.lastMove,
    winner: room.game.winner,
    timeLeftMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
  };
}

function broadcast(io, room) {
  io.to(room.id).emit('game_update', publicState(room));
}

// ---------- Turn flow ----------

function schedule(io, room) {
  clearTimeout(room.timer);
  if (room.game.winner) return;
  const seat = seatOf(room, room.game.turn);
  const delay = seat.isBot ? 1000 + Math.random() * 1500 : TURN_MS;
  room.deadline = seat.isBot ? null : Date.now() + delay;

  room.timer = setTimeout(() => {
    if (!seat.isBot) {
      seat.missed++;
      if (seat.missed >= MAX_MISSED) {
        seat.isBot = true;
        io.to(room.id).emit('notice', `${seat.name} was inactive. A bot is playing for them.`);
      }
    }
    autoAct(io, room);
  }, delay);
}

function startTurn(io, room) {
  room.phase = 'roll';
  room.dice = null;
  room.validMoves = [];
  schedule(io, room);
  broadcast(io, room);
}

function autoAct(io, room) {
  if (room.phase === 'roll') {
    doRoll(io, room);
  } else if (room.phase === 'move') {
    const seat = seatOf(room, room.game.turn);
    const idx = chooseMove(room.game, room.game.turn, room.dice, seat.level);
    doMove(io, room, idx);
  }
}

function doRoll(io, room) {
  const color = room.game.turn;
  const dice = engine.rollDice();
  const moves = engine.getValidMoves(room.game, color, dice);
  room.dice = dice;
  room.validMoves = moves;

  if (moves.length === 0) {
    // No legal move: show the dice briefly, then pass the turn
    clearTimeout(room.timer);
    room.phase = 'skip';
    room.deadline = null;
    broadcast(io, room);
    room.timer = setTimeout(() => {
      engine.nextTurn(room.game, false);
      startTurn(io, room);
    }, SKIP_MS);
    return;
  }

  room.phase = 'move';
  schedule(io, room);
  broadcast(io, room);
}

function doMove(io, room, tokenIdx) {
  const color = room.game.turn;
  const result = engine.applyMove(room.game, color, tokenIdx, room.dice);
  room.lastMove = { color, tokenIdx, dice: room.dice, captured: result.captured };

  if (room.game.winner) {
    finishGame(io, room);
    return;
  }
  engine.nextTurn(room.game, result.extraTurn);
  startTurn(io, room);
}

function finishGame(io, room) {
  clearTimeout(room.timer);
  room.phase = 'over';
  room.deadline = null;
  broadcast(io, room);
  io.to(room.id).emit('game_over', { winner: room.game.winner });
  destroyRoom(io, room);
}

function destroyRoom(io, room) {
  clearTimeout(room.timer);
  for (const seat of room.seats) {
    if (!seat.socketId) continue;
    const s = io.sockets.sockets.get(seat.socketId);
    if (s) {
      s.leave(room.id);
      s.data.roomId = null;
      s.data.color = null;
    }
  }
  rooms.delete(room.id);
}

// ---------- Rooms and matchmaking ----------

function createRoom(io, players, mode) {
  const colors = MODE_COLORS[mode];
  const id = 'room_' + ++roomCounter;

  const seats = colors.map((color, i) => {
    const p = players[i];
    return p
      ? { color, name: p.name, socketId: p.socket.id, isBot: false, missed: 0, level: 'medium' }
      : { color, name: 'Bot ' + (i + 1), socketId: null, isBot: true, missed: 0, level: 'expert' };
  });

  const room = {
    id, mode, seats,
    game: engine.createGame(colors),
    phase: 'roll', dice: null, validMoves: [], lastMove: null,
    timer: null, deadline: null,
  };
  rooms.set(id, room);

  players.forEach((p, i) => {
    p.socket.join(id);
    p.socket.data.roomId = id;
    p.socket.data.color = colors[i];
    p.socket.emit('match_found', { roomId: id, yourColor: colors[i] });
  });

  startTurn(io, room);
}

function checkQueue(io, mode) {
  const q = queues[mode];
  while (q.length >= mode) createRoom(io, q.splice(0, mode), mode);

  if (q.length === 0) {
    clearTimeout(queueTimers[mode]);
    queueTimers[mode] = null;
    return;
  }
  if (!queueTimers[mode]) {
    queueTimers[mode] = setTimeout(() => {
      queueTimers[mode] = null;
      const players = q.splice(0, mode);
      if (players.length) createRoom(io, players, mode); // bots fill the rest
      checkQueue(io, mode);
    }, QUEUE_WAIT_MS);
  }
}

function removeFromQueues(socket) {
  for (const mode of [2, 4]) {
    queues[mode] = queues[mode].filter((p) => p.socket.id !== socket.id);
  }
}

// ---------- Socket events ----------

function registerHandlers(io, socket) {
  socket.on('find_match', ({ mode, name } = {}) => {
    if (socket.data.roomId) return;
    leaveLobby(io, socket);
    removeFromQueues(socket);
    const m = mode === 4 ? 4 : 2;
    queues[m].push({ socket, name: cleanName(name) });
    socket.emit('queued', { mode: m, waitMs: QUEUE_WAIT_MS });
    checkQueue(io, m);
  });

  socket.on('cancel_match', () => {
    removeFromQueues(socket);
  });

  // ----- Friend rooms -----

  socket.on('create_room', ({ mode, name } = {}) => {
    if (socket.data.roomId) return;
    removeFromQueues(socket);
    leaveLobby(io, socket);
    const lobby = {
      code: makeCode(),
      mode: mode === 4 ? 4 : 2,
      hostId: socket.id,
      players: [],
    };
    lobbies.set(lobby.code, lobby);
    joinLobby(io, lobby, socket, name);
  });

  socket.on('join_room', ({ code, name } = {}) => {
    if (socket.data.roomId) return;
    const lobby = lobbies.get(String(code || '').trim().toUpperCase());
    if (!lobby) return socket.emit('lobby_error', 'Room not found. Check the code.');
    if (lobby.players.some((p) => p.socket.id === socket.id)) return;
    if (lobby.players.length >= lobby.mode) return socket.emit('lobby_error', 'Room is full.');
    removeFromQueues(socket);
    leaveLobby(io, socket);
    joinLobby(io, lobby, socket, name);
  });

  socket.on('leave_room', () => leaveLobby(io, socket));

  socket.on('start_room', () => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) return; // only the host can start
    lobbies.delete(lobby.code);
    lobby.players.forEach((p) => {
      p.socket.data.lobbyCode = null;
      p.socket.leave('lobby_' + lobby.code);
    });
    createRoom(io, lobby.players, lobby.mode); // empty seats become bots
  });

  // ----- Chat -----

  socket.on('chat_message', ({ text } = {}) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean) return;

    // Simple anti-spam: at most one message every 700ms per player
    const now = Date.now();
    if (now - (socket.data.lastChat || 0) < 700) return;
    socket.data.lastChat = now;

    let target, name, color = null;
    if (socket.data.roomId) {
      const room = rooms.get(socket.data.roomId);
      const seat = room && room.seats.find((s) => s.socketId === socket.id);
      if (!seat) return;
      target = room.id;
      name = seat.name;
      color = seat.color;
    } else if (socket.data.lobbyCode) {
      const lobby = lobbies.get(socket.data.lobbyCode);
      const p = lobby && lobby.players.find((x) => x.socket.id === socket.id);
      if (!p) return;
      target = 'lobby_' + lobby.code;
      name = p.name;
    } else {
      return; // not in a lobby or a game
    }

    io.to(target).emit('chat_message', {
      id: now + '-' + socket.id,
      from: socket.id,
      name,
      color,
      text: clean,
    });
  });

  // ----- Gameplay -----

  socket.on('roll_dice', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'roll') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    seat.isBot = false;
    seat.missed = 0;
    doRoll(io, room);
  });

  socket.on('move_token', ({ tokenIdx } = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'move') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    if (!Number.isInteger(tokenIdx) || !room.validMoves.includes(tokenIdx)) return;
    seat.isBot = false;
    seat.missed = 0;
    doMove(io, room, tokenIdx);
  });

  socket.on('disconnect', () => {
    leaveLobby(io, socket);
    removeFromQueues(socket);
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const seat = room.seats.find((s) => s.socketId === socket.id);
    if (!seat) return;

    const name = seat.name;
    seat.socketId = null;
    seat.isBot = true;
    seat.name = name + ' (bot)';

    if (!room.seats.some((s) => s.socketId)) {
      destroyRoom(io, room); // no humans left
      return;
    }
    io.to(room.id).emit('notice', `${name} left. A bot took over.`);

    if (room.game.turn === seat.color && (room.phase === 'roll' || room.phase === 'move')) {
      schedule(io, room);
    }
    broadcast(io, room);
  });
}

module.exports = { registerHandlers };
const engine = require('../game/engine');
const { chooseTurnMove, scoreMove } = require('../game/bot');
const { randomUUID } = require('node:crypto');
const { WagerError, createWageredMatch, settleWageredMatch, refundWageredMatch } = require('../game/wager');

const MODE_COLORS = {
  2: ['red', 'yellow'],
};
const TURN_MS = 20000;
const QUEUE_WAIT_MS = { normal: 15000, tournament: 20000 };
const SKIP_MS = 1200;
const MOVE_STEP_MS = 250;
const MOVE_SETTLE_MS = 350;
const MAX_MISSED = 1;
const RECONNECT_MS = 60000; // how long an empty room waits for players to come back
const GAME_CHAT_ENABLED = false;
const BOT_SIX_CHANCE = {
  expert: 0.7,
  hard: 0.5,
  medium: 0.4,
};

const BOT_NAMES = [
  'Ahsan', 'Ahmed', 'Kashif', 'Hassan', 'Usman', 'Bilal', 'Hamza', 'Zain',
  'Saad', 'Abdullah', 'Ibrahim', 'Umar', 'Huzaifa', 'Ayan', 'Danish', 'Farhan',
  'Fahad', 'Imran', 'Salman', 'Asad', 'Taha', 'Raza', 'Shahzaib', 'Arham',
  'Mustafa', 'Adeel', 'Aqib', 'Waleed', 'Rehan', 'Sameer', 'Ayesha', 'Fatima',
  'Maryam', 'Zainab', 'Hira', 'Sana', 'Noor', 'Mahnoor', 'Eman', 'Iqra',
  'Laiba', 'Amna', 'Dua', 'Mehwish', 'Areeba', 'Anaya', 'Rabia', 'Komal',
];
const rooms = new Map();
const sessions = new Map(); // clientId -> roomId (for reconnecting)
const botNamesByClientId = new Map();
const queues = { normal: [], tournament: [] };
const queueTimers = { normal: null, tournament: null };
const processingQueues = new Set();
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

function findCaptureDice(game, color, maxDice = 6) {
  let bestDice = null;
  let bestScore = -Infinity;

  for (let dice = 1; dice <= maxDice; dice++) {
    const moves = engine.getValidMoves(game, color, dice);
    for (const tokenIdx of moves) {
      const state = {
        ...game,
        tokens: Object.fromEntries(
          game.colors.map((playerColor) => [
            playerColor,
            game.tokens[playerColor].slice(),
          ])
        ),
        captures: { ...game.captures },
      };
      if (engine.applyMove(state, color, tokenIdx, dice).captured.length === 0) continue;

      const score = scoreMove(game, color, tokenIdx, dice);
      if (score > bestScore) {
        bestDice = dice;
        bestScore = score;
      }
    }
  }
  return bestDice;
}

function rollDiceForCurrentPlayer(room) {
  const seat = seatOf(room, room.game.turn);
  const sixChance = seat?.isBot ? BOT_SIX_CHANCE[seat.level] : null;
  if (sixChance === undefined || sixChance === null) return engine.rollDice();
  const expertSixCooldown = seat.level === 'expert'
    ? Math.max(0, seat.sixCooldown || 0)
    : 0;
  const finishBotRoll = (value) => {
    if (seat.level === 'expert') {
      if (value === 6) {
        seat.sixCooldown = Math.random() < 0.5 ? 1 : 2;
      } else if (room.phase === 'roll' && expertSixCooldown > 0) {
        seat.sixCooldown = expertSixCooldown - 1;
      }
    }
    return value;
  };

  const consecutiveSixes = (
    room.phase === 'bonus-roll'
    && room.rolledDice.slice(-2).length === 2
    && room.rolledDice.slice(-2).every((value) => value === 6)
  ) || (
    room.phase === 'capture-roll'
    && room.captureBonusSixes >= 2
  );
  const afterSix = (
    room.phase === 'bonus-roll'
    && room.rolledDice[room.rolledDice.length - 1] === 6
  ) || (
    room.phase === 'capture-roll'
    && room.captureBonusSixes >= 1
  );
  const adjustedSixChance = consecutiveSixes
    || expertSixCooldown > 0
    ? 0
    : afterSix ? sixChance * 0.25 : sixChance;

  const captureDice = findCaptureDice(
    room.game,
    seat.color,
    consecutiveSixes || expertSixCooldown > 0 ? 5 : 6
  );
  if (captureDice !== null) return finishBotRoll(captureDice);

  if (Math.random() < adjustedSixChance) return finishBotRoll(6);

  const weights = [1, 2, 3, 4, 5].map((dice) => {
    const moves = engine.getValidMoves(room.game, seat.color, dice);
    const bestMoveScore = moves.length
      ? Math.max(...moves.map((tokenIdx) =>
        scoreMove(room.game, seat.color, tokenIdx, dice)
      ))
      : 0;
    return 1 + dice / 5 + Math.max(0, bestMoveScore) / 30;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return finishBotRoll(i + 1);
  }

  return finishBotRoll(5);
}

function pickBotName(usedNames) {
  const availableNames = BOT_NAMES.filter((name) => !usedNames.has(name.toLowerCase()));
  let name;
  if (availableNames.length > 0) {
    name = availableNames[Math.floor(Math.random() * availableNames.length)];
  } else {
    let suffix = 2;
    do {
      name = `${BOT_NAMES[(suffix - 2) % BOT_NAMES.length]} ${suffix}`;
      suffix += 1;
    } while (usedNames.has(name.toLowerCase()));
  }
  usedNames.add(name.toLowerCase());
  return name;
}

function publicState(room, viewerSocketId) {
  return {
    roomId: room.id,
    seats: room.seats.map((s) => {
      const takeoverHidden = s.isBot && s.level === 'takeover';
      return {
        color: s.color,
        name: takeoverHidden ? s.baseName : s.name,
        isBot: takeoverHidden ? s.socketId === viewerSocketId : s.isBot,
        isTakeover: takeoverHidden && s.socketId === viewerSocketId,
      };
    }),
    tokens: room.game.tokens,
    captures: room.game.captures,
    turn: room.game.turn,
    phase: room.phase, // roll | move | moving | skip | over
    dice: room.dice,
    dieRollId: room.dieRollId,
    doubleRoll: room.doubleRoll,
    rolledDice: room.rolledDice || [],
    rolledDiceIds: room.rolledDiceIds || (room.rolledDice || []).map((_, index) => index),
    usedDiceIds: room.usedDiceIds || [],
    diceOptions: room.diceOptions,
    rollId: room.rollId,
    validMoves: room.validMoves,
    lastMove: room.lastMove,
    winner: room.game.winner,
    timeLeftMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
  };
}

function broadcast(io, room) {
  for (const seat of room.seats) {
    if (seat.socketId) {
      io.to(seat.socketId).emit('game_update', publicState(room, seat.socketId));
    }
  }
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
        seat.level = 'takeover';
        io.to(seat.socketId).emit('notice', {
          title: 'Bot takeover',
          message: 'You missed a turn. A bot is temporarily playing your seat.',
          type: 'info',
        });
      }
    }
    autoAct(io, room);
  }, delay);
}

function startTurn(io, room) {
  room.phase = 'roll';
  room.dice = null;
  room.doubleRoll = false;
  room.diceOptions = [];
  room.pendingDiceOptions = [];
  room.captureDiceOptions = [];
  room.rolledDice = [];
  room.rolledDiceIds = [];
  room.usedDiceIds = [];
  room.captureBonusSixes = 0;
  room.validMoves = [];
  room.bonusTurn = false;
  schedule(io, room);
  broadcast(io, room);
}

function autoAct(io, room) {
  if (room.phase === 'roll') {
    doRoll(io, room);
  } else if (room.phase === 'bonus-roll') {
    rollBonusDie(io, room);
  } else if (room.phase === 'capture-roll') {
    rollCaptureBonusDie(io, room);
  } else if (room.phase === 'move') {
    const seat = seatOf(room, room.game.turn);

    const best = chooseTurnMove(
      room.game,
      room.game.turn,
      room.diceOptions,
      seat?.level || 'expert'
    );

    if (best) {
      doMove(io, room, best.tokenIdx, best.id);
    }
  }
}

function forfeitTurnAfterThreeSixes(io, room, color) {
  const seat = seatOf(room, color);
  room.diceOptions = [];
  room.pendingDiceOptions = [];
  room.captureDiceOptions = [];
  room.validMoves = [];
  room.phase = 'skip';
  room.deadline = null;
  io.to(room.id).emit('notice', {
    title: 'Turn forfeited',
    message: `Three consecutive sixes. ${(seat.baseName || seat.name)}'s turn has been forfeited.`,
    type: 'warning',
  });
  broadcast(io, room);
  room.timer = setTimeout(() => {
    engine.nextTurn(room.game, false);
    startTurn(io, room);
  }, SKIP_MS);
}

function doRoll(io, room) {
  const color = room.game.turn;
  const first = rollDiceForCurrentPlayer(room);
  room.rollId = (room.rollId || 0) + 1;
  room.dieRollId = (room.dieRollId || 0) + 1;
  room.dice = first;
  room.rolledDice = [first];
  room.rolledDiceIds = [0];
  room.usedDiceIds = [];
  room.bonusTurn = false;
  room.diceOptions = [];
  room.validMoves = [];

  if (first === 6) {
    room.doubleRoll = true;
    room.phase = 'bonus-roll';
    schedule(io, room);
    broadcast(io, room);
    return;
  }

  room.doubleRoll = false;
  room.diceOptions = [{
    id: 0,
    value: first,
    moves: engine.getValidMoves(room.game, color, first),
  }];
  room.validMoves = room.diceOptions[0].moves;
  showRollMoves(io, room);
}

function rollBonusDie(io, room) {
  if (room.phase !== 'bonus-roll') return;
  clearTimeout(room.timer);
  const second = rollDiceForCurrentPlayer(room);
  const color = room.game.turn;
  room.dice = second;
  room.rolledDiceIds = room.rolledDiceIds || room.rolledDice.map((_, index) => index);
  room.rolledDiceIds.push(room.rolledDice.length);
  room.rolledDice.push(second);
  room.dieRollId = (room.dieRollId || 0) + 1;
  room.pendingDiceOptions = room.rolledDice.map((value, id) => ({
    id,
    value,
    moves: engine.getValidMoves(room.game, color, value),
  }));
  room.diceOptions = [];
  room.validMoves = [];
  room.phase = 'bonus-reveal';
  room.deadline = null;
  broadcast(io, room);
  room.timer = setTimeout(() => {
    if (second === 6 && room.rolledDice.length < 3) {
      room.phase = 'bonus-roll';
      schedule(io, room);
      broadcast(io, room);
      return;
    }

    if (second === 6 && room.rolledDice.length === 3) {
      forfeitTurnAfterThreeSixes(io, room, color);
      return;
    }

    room.diceOptions = room.pendingDiceOptions;
    room.pendingDiceOptions = [];
    room.validMoves = [...new Set(room.diceOptions.flatMap((option) => option.moves))];
    showRollMoves(io, room);
  }, 650);
}

function showRollMoves(io, room) {
  if (room.validMoves.length === 0) {
    // Let the final die animation finish before passing the turn.
    clearTimeout(room.timer);
    room.phase = 'skip';
    room.deadline = null;
    broadcast(io, room);
    room.timer = setTimeout(() => {
      engine.nextTurn(room.game, room.bonusTurn);
      startTurn(io, room);
    }, SKIP_MS);
    return;
  }

  room.phase = 'move';
  schedule(io, room);
  broadcast(io, room);
}

function moveAnimationDuration(from, to, captures) {
  let position = from;
  let steps = 0;
  while (position !== to && steps < 60) {
    if (captures > 0 && position === 50 && to > 51) position = 52;
    else if (position >= 0 && to > position) position += 1;
    else if (position >= 46 && to < 6) position = (position + 1) % 52;
    else position = to;
    steps += 1;
  }
  return steps * MOVE_STEP_MS + MOVE_SETTLE_MS;
}

function doMove(io, room, tokenIdx, diceId) {
  const color = room.game.turn;
  const option = room.diceOptions.find((candidate) => candidate.id === diceId);
  if (!option || !option.moves.includes(tokenIdx)) return;
  const dice = option.value;
  const from = room.game.tokens[color][tokenIdx];
  const previousTokens = Object.fromEntries(
    Object.entries(room.game.tokens).map(([tokenColor, positions]) => [tokenColor, [...positions]])
  );
  const result = engine.applyMove(room.game, color, tokenIdx, dice);
  room.lastMove = {
    id: (room.moveId = (room.moveId || 0) + 1),
    color,
    tokenIdx,
    dice,
    diceId,
    captured: result.captured.map((token) => ({
      ...token,
      pos: previousTokens[token.color][token.tokenIdx],
    })),
  };
  room.usedDiceIds = [...(room.usedDiceIds || []), diceId];

  room.bonusTurn = room.bonusTurn
    || result.captured.length > 0
    || result.reachedFinish;
  room.diceOptions = room.diceOptions
    .filter((candidate) => candidate.id !== diceId)
    .map((candidate) => ({
      ...candidate,
      moves: engine.getValidMoves(room.game, color, candidate.value),
    }));
  room.validMoves = [...new Set(room.diceOptions.flatMap((candidate) => candidate.moves))];
  room.dice = room.diceOptions[0]?.value ?? null;

  if (room.game.winner) {
    finishGame(io, room);
    return;
  }

  if (result.captured.length > 0) {
    room.captureDiceOptions = room.diceOptions;
    room.captureBonusSixes = 0;
    room.diceOptions = [];
    room.validMoves = [];
    room.bonusTurn = false;
  }

  clearTimeout(room.timer);
  room.deadline = null;
  room.dice = dice;
  room.phase = 'moving';
  broadcast(io, room);

  const to = room.game.tokens[color][tokenIdx];
  room.timer = setTimeout(() => {
    if (result.captured.length > 0) {
      room.dice = null;
      room.phase = 'capture-roll';
      schedule(io, room);
      broadcast(io, room);
      return;
    }

    if (room.validMoves.length > 0) {
      room.phase = 'move';
      schedule(io, room);
      broadcast(io, room);
      return;
    }

    engine.nextTurn(room.game, room.bonusTurn);
    startTurn(io, room);
  }, moveAnimationDuration(from, to, room.game.captures[color]));
}

function finishGame(io, room) {
  if (room.finishing) return;
  room.finishing = true;
  clearTimeout(room.timer);
  clearTimeout(room.settlementTimer);
  room.deadline = null;

  const finish = async () => {
    let wagerResult = null;
    if (room.match) {
      const winner = seatOf(room, room.game.winner);
      try {
        wagerResult = await settleWageredMatch(room.match.id, winner?.playerId);
      } catch (error) {
        console.error(`Could not settle wagered match ${room.match.code}:`, error);
        room.phase = 'settlement-error';
        room.finishing = false;
        broadcast(io, room);
        io.to(room.id).emit('settlement_error',
          'Game ended, but the wallet settlement is still processing. Your credits have not been lost.');
        room.settlementTimer = setTimeout(() => finishGame(io, room), 10000);
        return;
      }
    }

    room.phase = 'over';
    broadcast(io, room);
    io.to(room.id).emit('game_over', {
      winner: room.game.winner,
      wager: wagerResult,
    });
    destroyRoom(io, room);
  };

  finish().catch((error) => {
    room.finishing = false;
    room.phase = 'settlement-error';
    console.error(`Could not finish game ${room.id}:`, error);
    broadcast(io, room);
    io.to(room.id).emit('settlement_error',
      'Game ended, but its result could not be recorded. Please contact support.');
    room.settlementTimer = setTimeout(() => finishGame(io, room), 10000);
  });
}

function forfeitGame(io, room, seat, socket) {
  const opponent = room.seats.find((candidate) => candidate.color !== seat.color);
  if (!opponent || room.finishing || room.game.winner) return false;

  room.game.winner = opponent.color;
  seat.socketId = null;
  seat.isBot = false;
  if (seat.clientId && sessions.get(seat.clientId) === room.id) sessions.delete(seat.clientId);
  seat.clientId = null;
  seat.matchmakingId = null;
  socket.leave(room.id);
  socket.data.roomId = null;
  socket.data.color = null;
  finishGame(io, room);
  return true;
}

function rollCaptureBonusDie(io, room) {
  if (room.phase !== 'capture-roll') return;
  clearTimeout(room.timer);
  const value = rollDiceForCurrentPlayer(room);
  const color = room.game.turn;
  const diceId = `capture-${(room.rollId || 0) + 1}`;
  room.rolledDiceIds = room.rolledDiceIds || room.rolledDice.map((_, index) => index);
  room.rolledDice.push(value);
  room.rollId = (room.rollId || 0) + 1;
  room.rolledDiceIds.push(diceId);
  room.dieRollId = (room.dieRollId || 0) + 1;
  room.dice = value;
  room.diceOptions = [];
  room.validMoves = [];
  room.pendingDiceOptions = [
    ...(room.captureDiceOptions || []),
    {
      id: diceId,
      value,
      moves: engine.getValidMoves(room.game, color, value),
    },
  ].map((option) => ({
    ...option,
    moves: engine.getValidMoves(room.game, color, option.value),
  }));
  room.captureDiceOptions = [];
  room.phase = 'capture-reveal';
  room.deadline = null;
  broadcast(io, room);
  room.timer = setTimeout(() => {
    if (value === 6) {
      room.captureBonusSixes = (room.captureBonusSixes || 0) + 1;
      if (room.captureBonusSixes === 3) {
        forfeitTurnAfterThreeSixes(io, room, color);
        return;
      }

      room.captureDiceOptions = room.pendingDiceOptions;
      room.pendingDiceOptions = [];
      room.phase = 'capture-roll';
      schedule(io, room);
      broadcast(io, room);
      return;
    }

    room.captureBonusSixes = 0;
    room.diceOptions = room.pendingDiceOptions;
    room.pendingDiceOptions = [];
    room.validMoves = [...new Set(room.diceOptions.flatMap((option) => option.moves))];
    showRollMoves(io, room);
  }, 650);
}

function destroyRoom(io, room) {
  clearTimeout(room.timer);
  clearTimeout(room.emptyTimer);
  clearTimeout(room.settlementTimer);
  if (room.match && room.phase !== 'over') {
    refundWageredMatch(room.match.id).catch((error) => {
      console.error(`Could not refund wagered match ${room.match.code}:`, error);
    });
  }
  for (const seat of room.seats) {
    if (seat.clientId && sessions.get(seat.clientId) === room.id) sessions.delete(seat.clientId);
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

function createRoom(io, players, { tokensToWin = 4, wager = null } = {}) {
  const mode = 2;
  const colors = MODE_COLORS[mode];
  const id = 'room_' + ++roomCounter;
  const usedNames = new Set(players.map((player) => player.name.toLocaleLowerCase()));
  players.forEach((player) => {
    const clientId = player.socket.data.clientId;
    botNamesByClientId.get(clientId)?.forEach((name) => usedNames.add(name.toLowerCase()));
  });

  const seats = colors.map((color, i) => {
    const p = players[i];
    if (p) {
      return {
        color, name: p.name, baseName: p.name,
        clientId: p.socket.data.clientId || null,
        playerId: p.playerId || null,
        masterId: p.masterId || null,
        matchmakingId: p.matchmakingId || null,
        socketId: p.socket.id, isBot: false, missed: 0, level: 'medium',
      };
    }

    const name = pickBotName(usedNames);
    players.forEach((player) => {
      const clientId = player.socket.data.clientId;
      if (!clientId) return;
      if (!botNamesByClientId.has(clientId)) botNamesByClientId.set(clientId, new Set());
      botNamesByClientId.get(clientId).add(name.toLowerCase());
    });
    return {
      color, name, baseName: name,
      clientId: null,
      socketId: null, isBot: true, missed: 0, level: 'expert',
    };
  });

  const room = {
    id, mode, seats,
    match: wager,
    game: engine.createGame(colors, { tokensToWin }),
    phase: 'roll', dice: null, diceOptions: [], pendingDiceOptions: [], captureDiceOptions: [], dieRollId: 0,
    rolledDice: [], rolledDiceIds: [], usedDiceIds: [], rollId: 0, validMoves: [], lastMove: null,
    bonusTurn: false, doubleRoll: false, captureBonusSixes: 0,
    timer: null, deadline: null, emptyTimer: null,
  };
  rooms.set(id, room);

  players.forEach((p, i) => {
    p.socket.join(id);
    p.socket.data.roomId = id;
    p.socket.data.color = colors[i];
    if (p.socket.data.clientId) sessions.set(p.socket.data.clientId, id);
    p.socket.emit('match_found', {
      roomId: id,
      yourColor: colors[i],
      requestId: p.matchmakingId || undefined,
      wager: wager ? {
        bet: wager.bet,
        feePerPlayer: wager.feePerPlayer,
        payout: wager.payout,
      } : null,
    });
    if (!wager && players.length === 1 && p.playerId && p.matchmakingId) {
      p.socket.emit('notice', {
        title: 'Free bot match',
        message: 'No human opponent was found. This match is free: no bet was charged and there is no platform fee or payout.',
        type: 'info',
      });
    }
  });

  startTurn(io, room);
}

function checkQueue(io, queueType) {
  const q = queues[queueType];
  const tokensToWin = queueType === 'tournament' ? 1 : 4;
  if (processingQueues.has(queueType)) return;

  let pair;
  for (let first = 0; first < q.length && !pair; first += 1) {
    for (let second = first + 1; second < q.length; second += 1) {
      if (
        q[first].playerId !== q[second].playerId
        && q[first].masterId === q[second].masterId
        && q[first].bet === q[second].bet
      ) {
        pair = [first, second];
        break;
      }
    }
  }

  if (pair) {
    const [first, second] = pair;
    const players = [q[first], q[second]];
    q.splice(second, 1);
    q.splice(first, 1);
    processingQueues.add(queueType);
    startWageredRoom(io, players, tokensToWin)
      .catch((error) => {
        const message = error instanceof WagerError
          ? error.message
          : 'Could not start the wagered match. Please try again.';
        if (!(error instanceof WagerError)) {
          console.error('Could not start wagered match:', error);
        }
        players.forEach((player) => player.socket.emit('match_error', message));
      })
      .finally(() => {
        processingQueues.delete(queueType);
        checkQueue(io, queueType);
      });
    return;
  }

  const expiredIndex = q.findIndex((player) =>
    Date.now() - player.queuedAt >= QUEUE_WAIT_MS[queueType]
  );
  if (expiredIndex !== -1) {
    const [player] = q.splice(expiredIndex, 1);
    createRoom(io, [player], { tokensToWin });
    setImmediate(() => checkQueue(io, queueType));
    return;
  }

  if (q.length === 0) {
    clearTimeout(queueTimers[queueType]);
    queueTimers[queueType] = null;
    return;
  }
  if (!queueTimers[queueType]) {
    const remainingWait = Math.min(...q.map((player) =>
      QUEUE_WAIT_MS[queueType] - (Date.now() - player.queuedAt)
    ));
    queueTimers[queueType] = setTimeout(() => {
      queueTimers[queueType] = null;
      checkQueue(io, queueType);
    }, Math.max(1, remainingWait));
  }
}

async function startWageredRoom(io, players, tokensToWin) {
  if (players.some((player) => !player.socket.connected)) {
    throw new WagerError('A player disconnected before the match could start.');
  }
  const matchCode = `LUD-${randomUUID()}`;
  const wager = await createWageredMatch(
    players,
    players[0].bet,
    matchCode,
    players[0].queueType
  );
  try {
    createRoom(io, players, { tokensToWin, wager });
  } catch (error) {
    try {
      await refundWageredMatch(wager.id);
    } catch (refundError) {
      console.error(`Could not refund wagered match ${matchCode}:`, refundError);
      throw new WagerError('Match setup failed and the bet refund is pending. Please contact support.');
    }
    throw new WagerError('Match setup failed. Your bet has been refunded.');
  }
}

function removeFromQueues(io, socket, requestId) {
  for (const queueType of Object.keys(queues)) {
    const queue = queues[queueType];
    for (let i = queue.length - 1; i >= 0; i--) {
      const player = queue[i];
      if (player.socket.id === socket.id && (!requestId || player.matchmakingId === requestId)) {
        queue.splice(i, 1);
      }
    }
    checkQueue(io, queueType);
  }
}

function replaceWithBot(io, socket) {
  const room = rooms.get(socket.data.roomId);
  const seat = room && room.seats.find((s) => s.socketId === socket.id);
  if (!room || !seat) return false;

  seat.socketId = null;
  seat.isBot = true;
  seat.name = seat.baseName + ' (bot)';
  if (seat.clientId && sessions.get(seat.clientId) === room.id) sessions.delete(seat.clientId);
  seat.clientId = null;
  seat.matchmakingId = null;

  socket.leave(room.id);
  socket.data.roomId = null;
  socket.data.color = null;
  if (!room.seats.some((s) => s.socketId)) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = setTimeout(() => destroyRoom(io, room), RECONNECT_MS);
    return true;
  }

  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
  if (room.game.turn === seat.color && ['roll', 'bonus-roll', 'capture-roll', 'move'].includes(room.phase)) {
    schedule(io, room);
  }
  broadcast(io, room);
  return true;
}

function takeOverDisconnectedSeat(io, room, socket) {
  const seat = room.seats.find((candidate) => candidate.socketId === socket.id);
  if (!seat) return false;

  seat.socketId = null;
  seat.isBot = true;
  seat.level = 'takeover';
  seat.name = seat.baseName + ' (bot)';

  if (!room.seats.some((candidate) => candidate.socketId)) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  if (room.game.turn === seat.color && ['roll', 'bonus-roll', 'capture-roll', 'move'].includes(room.phase)) {
    schedule(io, room);
  }
  broadcast(io, room);
  return true;
}

function restoreSeatControl(seat, socket) {
  const wasTakenOver = seat.isBot && seat.level === 'takeover';
  seat.isBot = false;
  seat.level = 'medium';
  seat.missed = 0;
  seat.name = seat.baseName;

  if (wasTakenOver) {
    socket.emit('notice', {
      title: 'Control restored',
      message: 'You are back in control. A bot handled your seat while you were away.',
      type: 'success',
    });
  }
}

// ---------- Reconnect ----------

function resumeGame(io, socket) {
  const clientId = socket.data.clientId;
  const roomId = clientId && sessions.get(clientId);
  const room = roomId && rooms.get(roomId);
  const seat = room && room.seats.find((s) => s.clientId === clientId);
  if (!seat) {
    socket.emit('no_game');
    return;
  }

  // Take over from an older connection of the same player (for example, a refresh)
  if (seat.socketId && seat.socketId !== socket.id) {
    const old = io.sockets.sockets.get(seat.socketId);
    if (old) {
      old.leave(room.id);
      old.data.roomId = null;
      old.data.color = null;
      old.emit('no_game');
    }
  }

  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;

  seat.socketId = socket.id;
  restoreSeatControl(seat, socket);

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.color = seat.color;

  socket.emit('match_found', { roomId: room.id, yourColor: seat.color });
  // If it is their turn, give them a human timer again instead of the bot's
  if (room.game.turn === seat.color && ['roll', 'bonus-roll', 'capture-roll', 'move'].includes(room.phase)) {
    schedule(io, room);
  }
  broadcast(io, room);
}

// ---------- Socket events ----------

function registerHandlers(io, socket) {
  // Private ID sent by the client when it connects
  socket.data.clientId = String(socket.handshake.auth?.clientId || '').slice(0, 64) || null;

  socket.on('resume_game', () => resumeGame(io, socket));

  socket.on('find_match', ({ name, requestId, queueType, bet } = {}) => {
    if (socket.data.roomId) return;
    if (!socket.data.playerId || !socket.data.masterId) {
      socket.emit('match_error', 'Sign in as a Player to place a bet.');
      return;
    }
    const betAmount = Number(bet);
    if (!Number.isSafeInteger(betAmount) || betAmount <= 0 || betAmount > 5000) {
      socket.emit('match_error', 'Choose a valid bet from 300 to 5,000 credits.');
      return;
    }
    leaveLobby(io, socket);
    removeFromQueues(io, socket);
    const matchmakingId = String(requestId || '').slice(0, 80);
    const type = queueType === 'tournament' ? 'tournament' : 'normal';
    queues[type].push({
      socket,
      name: cleanName(name),
      matchmakingId,
      playerId: socket.data.playerId,
      masterId: socket.data.masterId,
      bet: betAmount,
      queueType: type,
      queuedAt: Date.now(),
    });
    socket.emit('queued', { mode: 2, waitMs: QUEUE_WAIT_MS[type], requestId: matchmakingId });
    checkQueue(io, type);
  });

  socket.on('cancel_match', ({ requestId } = {}) => {
    const matchmakingId = String(requestId || '').slice(0, 80);
    removeFromQueues(io, socket, matchmakingId);
    const room = rooms.get(socket.data.roomId);
    const seat = room?.seats.find((s) =>
      s.socketId === socket.id && s.matchmakingId === matchmakingId
    );
    if (seat) {
      if (room.match) forfeitGame(io, room, seat, socket);
      else replaceWithBot(io, socket);
    }
  });

  // ----- Friend rooms -----

  socket.on('create_room', ({ name } = {}) => {
    if (socket.data.roomId) return;
    removeFromQueues(io, socket);
    leaveLobby(io, socket);
    const lobby = {
      code: makeCode(),
      mode: 2,
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
    removeFromQueues(io, socket);
    leaveLobby(io, socket);
    joinLobby(io, lobby, socket, name);
  });

  socket.on('leave_room', () => leaveLobby(io, socket));

  socket.on('leave_game', (ack) => {
    const acknowledge = () => {
      if (typeof ack === 'function') ack({ ok: true });
    };
    const room = rooms.get(socket.data.roomId);
    const seat = room?.seats.find((candidate) => candidate.socketId === socket.id);
    if (room && seat) forfeitGame(io, room, seat, socket);
    acknowledge();
  });

  socket.on('start_room', () => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) return; // only the host can start
    lobbies.delete(lobby.code);
    lobby.players.forEach((p) => {
      p.socket.data.lobbyCode = null;
      p.socket.leave('lobby_' + lobby.code);
    });
    createRoom(io, lobby.players); // empty seats become bots
  });

  // ----- Chat -----

  if (GAME_CHAT_ENABLED) socket.on('chat_message', ({ text } = {}) => {
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

  socket.on('disable_auto_mode', () => {
    const room = rooms.get(socket.data.roomId);
    const seat = room && room.seats.find((candidate) => candidate.socketId === socket.id);
    if (!room || !seat || !seat.isBot || seat.level !== 'takeover') return;

    restoreSeatControl(seat, socket);
    if (room.game.turn === seat.color && ['roll', 'bonus-roll', 'capture-roll', 'move'].includes(room.phase)) {
      schedule(io, room);
    }
    broadcast(io, room);
  });

  socket.on('roll_dice', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'roll') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    restoreSeatControl(seat, socket);
    doRoll(io, room);
  });

  socket.on('roll_bonus_dice', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'bonus-roll') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    restoreSeatControl(seat, socket);
    rollBonusDie(io, room);
  });

  socket.on('roll_capture_bonus', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'capture-roll') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    restoreSeatControl(seat, socket);
    rollCaptureBonusDie(io, room);
  });

  socket.on('move_token', ({ tokenIdx, diceId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== 'move') return;
    const seat = seatOf(room, socket.data.color);
    if (!seat || seat.socketId !== socket.id || room.game.turn !== seat.color) return;
    const option = room.diceOptions.find((candidate) => candidate.id === diceId);
    if (!Number.isInteger(tokenIdx) || !option || !option.moves.includes(tokenIdx)) return;
    restoreSeatControl(seat, socket);
    doMove(io, room, tokenIdx, diceId);
  });

  socket.on('disconnect', () => {
    leaveLobby(io, socket);
    removeFromQueues(io, socket);
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    takeOverDisconnectedSeat(io, room, socket);
  });
}

module.exports = {
  registerHandlers, autoAct, publicState, pickBotName, forfeitGame,
  rollDiceForCurrentPlayer, takeOverDisconnectedSeat, restoreSeatControl, BOT_NAMES,
};
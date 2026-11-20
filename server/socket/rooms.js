const engine = require('../game/engine');
const { chooseTurnMove, scoreMove } = require('../game/bot');
const { randomUUID } = require('node:crypto');
const { WagerError, createWageredMatch, settleWageredMatch, refundWageredMatch } = require('../game/wager');
const {
  TournamentError,
  cancelTournament,
  completeTournamentMatch,
  createTournament,
  startTournamentMatch,
} = require('../game/tournament-store');
const {
  buildParticipants,
  createBracketPreview,
  createRoundPairs,
} = require('../game/tournament-bracket');

const MODE_COLORS = {
  2: ['red', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};
const TURN_MS = 20000;
const QUEUE_WAIT_MS = { normal: 15000, tournament: 20000 };
const TOURNAMENT_PREVIEW_MS = 5000;
const SKIP_MS = 1200;
const MOVE_STEP_MS = 250;
const MOVE_SETTLE_MS = 350;
const MAX_MISSED = 1;
const RECONNECT_MS = 60000; // how long an empty room waits for players to come back
const GAME_CHAT_ENABLED = false;
const MIN_BET = 30;
const HUMAN_SIX_CHANCE = 0.20;
const BOT_SIX_CHANCE = {
  expert: 0.65,
  hard: 0.5,
  medium: 0.3,
};

const BOT_NAMES_BY_LEVEL = {
  expert: [
    'Ehsan', 'Ehtesham', 'Ebad', 'Ejaz', 'Emaan', 'Erum', 'Esha', 'Eshal', 'Eman', 'Eshaal',
    'Ebrahim', 'Ehtisham', 'Eijaz', 'Ehtiram', 'Ezzah', 'Eiliyah', 'Eshna', 'Eshaan', 'Eshraq',
    'Ebadullah', 'Ebtisam', 'Eshrat', 'Ehsan Ali', 'Ehsan Ahmed', 'Ehsan Khan', 'Ehsan Malik',
    'Ehsan Shah', 'Ehtesham Ali', 'Ehtesham Ahmed', 'Ehtesham Khan',
  ],
  hard: [
    'Hamza', 'Hassan', 'Hammad', 'Haris', 'Haseeb', 'Huzaifa', 'Hira', 'Hina', 'Hania', 'Hareem',
    'Habib', 'Haroon', 'Hashim', 'Hadi', 'Hoorain', 'Hafsa', 'Humaira', 'Hamid', 'Husnain',
    'Hassanain', 'Hamza Ali', 'Hamza Ahmed', 'Hassan Ali', 'Hassan Ahmed', 'Hammad Ali',
    'Haris Khan', 'Haseeb Ali', 'Hina Noor', 'Hira Noor', 'Hania Fatima',
  ],
  medium: [
    'Muhammad', 'Mustafa', 'Mahnoor', 'Maryam', 'Mehwish', 'Muneeb', 'Maira', 'Maham', 'Muzammil',
    'Mubashir', 'Mansoor', 'Murtaza', 'Mikaal', 'Momin', 'Maaz', 'Moiz', 'Minahil', 'Mishal',
    'Mishaal', 'Madiha', 'Muhammad Ali', 'Muhammad Ahmed', 'Muhammad Khan', 'Mustafa Ali',
    'Mustafa Ahmed', 'Muneeb Khan', 'Maira Noor', 'Maham Fatima', 'Maryam Noor', 'Mahnoor Ali',
  ],
};
const BOT_NAMES = Object.values(BOT_NAMES_BY_LEVEL).flat();
const BOT_LEVELS = ['hard', 'medium'];
const rooms = new Map();
const sessions = new Map(); // clientId -> roomId (for reconnecting)
const botNamesByClientId = new Map();
const botFallbackCounts = new Map();
const queues = { normal: [], tournament: [] };
const queueTimers = { normal: null, tournament: null };
const processingQueues = new Set();
const tournaments = new Map();
const tournamentByClientId = new Map();
let roomCounter = 0;

function pickBotLevel(fallbackCount, randomValue = Math.random()) {
  if ((fallbackCount + 1) % 3 === 0) return 'expert';
  return BOT_LEVELS[Math.floor(randomValue * BOT_LEVELS.length)];
}

function canStartPrivateRoom(mode, playerCount) {
  return mode === 2
    ? playerCount === 2
    : mode === 4 && playerCount >= 2 && playerCount <= 4;
}

// ---------- Friend rooms (private lobbies) ----------

const lobbies = new Map();
const startedLobbyCodes = new Map();
const STARTED_LOBBY_CODE_TTL = 24 * 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O or 1/I
const cleanName = (n) => String(n || 'Player').trim().slice(0, 15) || 'Player';

function isPrivateRoomStarted(lobby, startedAt, now = Date.now()) {
  return Boolean(
    (lobby && (lobby.starting || lobby.started))
    || (startedAt != null && now - startedAt < STARTED_LOBBY_CODE_TTL)
  );
}

function makeCode() {
  const now = Date.now();
  for (const [code, startedAt] of startedLobbyCodes) {
    if (now - startedAt >= STARTED_LOBBY_CODE_TTL) startedLobbyCodes.delete(code);
  }

  let code;
  do {
    code = Array.from({ length: 5 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (lobbies.has(code) || startedLobbyCodes.has(code));
  return code;
}

function broadcastLobby(io, lobby) {
  io.to('lobby_' + lobby.code).emit('lobby_update', {
    code: lobby.code,
    mode: lobby.mode,
    bet: lobby.bet,
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
  lobby.players.push({
    socket,
    name: cleanName(name),
    playerId: socket.data.playerId,
    masterId: socket.data.masterId,
  });
  socket.data.lobbyCode = lobby.code;
  socket.join('lobby_' + lobby.code);
  broadcastLobby(io, lobby);
}

function hasActivePlayerSession(socket) {
  return Boolean(
    socket.data.playerId
    && socket.data.masterId
    && socket.data.authExpiresAt
    && socket.data.authExpiresAt > Math.floor(Date.now() / 1000)
  );
}

// ---------- Game helpers ----------

function seatOf(room, color) {
  return room.seats.find((s) => s.color === color);
}

function recordHardForcedCapture(room, color, capturedCount) {
  if (capturedCount < 1 || room.pendingForcedCaptureColor !== color) return false;
  const seat = seatOf(room, color);
  if (seat?.level !== 'hard') return false;
  seat.forcedCaptureCount = (seat.forcedCaptureCount || 0) + 1;
  room.pendingForcedCaptureColor = null;
  return true;
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
  if (!seat?.isBot) {
    if (Math.random() < HUMAN_SIX_CHANCE) return 6;
    return Math.floor(Math.random() * 5) + 1;
  }
  const sixChance = BOT_SIX_CHANCE[seat.level];
  if (sixChance === undefined || sixChance === null) return engine.rollDice();
  const expertSixCooldown = seat.level === 'expert'
    ? Math.max(0, seat.sixCooldown || 0)
    : 0;
  const hardMediumSixCooldown = ['hard', 'medium'].includes(seat.level)
    ? Math.max(0, seat.sixCooldown || 0)
    : 0;
  const finishBotRoll = (value) => {
    if (['expert', 'hard', 'medium'].includes(seat.level)) {
      if (value === 6) {
        seat.sixCooldown = seat.level === 'medium'
          ? 1
          : seat.level === 'hard'
            ? (Math.random() < 0.5 ? 1 : 2)
            : (Math.random() < 0.5 ? 1 : 2);
      } else if (
        room.phase === 'roll'
        && (expertSixCooldown > 0 || hardMediumSixCooldown > 0)
      ) {
        seat.sixCooldown = Math.max(0, (seat.level === 'expert'
          ? expertSixCooldown
          : hardMediumSixCooldown) - 1);
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
    || hardMediumSixCooldown > 0
    ? 0
    : afterSix ? sixChance * 0.25 : sixChance;

  const canForceCapture = seat.level === 'expert'
    || (
      seat.level === 'hard'
      && (seat.forcedCaptureCount || 0) < (seat.forcedCaptureLimit || 1)
      && room.pendingForcedCaptureColor !== seat.color
    );
  if (canForceCapture) {
    const captureDice = findCaptureDice(
      room.game,
      seat.color,
      consecutiveSixes
        || expertSixCooldown > 0
        || hardMediumSixCooldown > 0
        ? 5
        : 6
    );
    if (captureDice !== null) {
      if (seat.level === 'hard') room.pendingForcedCaptureColor = seat.color;
      return finishBotRoll(captureDice);
    }
  }

  if (Math.random() < adjustedSixChance) return finishBotRoll(6);
  if (seat.level === 'medium') {
    return finishBotRoll(Math.floor(Math.random() * 5) + 1);
  }

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

function pickBotName(usedNames, level = 'expert') {
  const names = BOT_NAMES_BY_LEVEL[level] || BOT_NAMES_BY_LEVEL.expert;
  const availableNames = names.filter((name) => !usedNames.has(name.toLowerCase()));
  let name;
  if (availableNames.length > 0) {
    name = availableNames[Math.floor(Math.random() * availableNames.length)];
  } else {
    let suffix = 2;
    do {
      name = `${names[(suffix - 2) % names.length]} ${suffix}`;
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
      const isOwnTakeover = takeoverHidden && s.socketId === viewerSocketId;
      return {
        color: s.color,
        name: s.isBot ? s.baseName : s.name,
        isBot: isOwnTakeover,
        isTakeover: isOwnTakeover,
        isLeft: Boolean(s.isLeft),
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
  for (const socketId of room.spectators || []) {
    io.to(socketId).emit('game_update', publicState(room, socketId));
  }
}

function emitRoomEvent(io, room, event, payload) {
  io.to(room.id).emit(event, payload);
  for (const socketId of room.spectators || []) {
    io.to(socketId).emit(event, payload);
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
  room.pendingForcedCaptureColor = null;
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

function advanceTurn(room, extraTurn = false) {
  engine.nextTurn(room.game, extraTurn);
  if (extraTurn && !room.game.winner) return;

  for (let attempts = 0; attempts < room.game.colors.length; attempts += 1) {
    const seat = seatOf(room, room.game.turn);
    if (seat && !seat.isLeft) return;
    engine.nextTurn(room.game, false);
  }
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
    advanceTurn(room);
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
      advanceTurn(room, room.bonusTurn);
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
  recordHardForcedCapture(room, color, result.captured.length);
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

    advanceTurn(room, room.bonusTurn);
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
    let tournamentResult = null;
    if (room.tournamentMatch) {
      const winner = seatOf(room, room.game.winner);
      if (!winner?.tournamentSlot) throw new TournamentError('The tournament match winner could not be found.');
      tournamentResult = await completeTournamentMatch(
        room.tournamentMatch.tournamentId,
        room.tournamentMatch.roundNo,
        room.tournamentMatch.matchNo,
        winner.tournamentSlot
      );
    } else if (room.match) {
      const winner = seatOf(room, room.game.winner);
      try {
        wagerResult = await settleWageredMatch(room.match.id, winner?.playerId);
      } catch (error) {
        console.error(`Could not settle wagered match ${room.match.code}:`, error);
        room.phase = 'settlement-error';
        room.finishing = false;
        broadcast(io, room);
        emitRoomEvent(io, room, 'settlement_error',
          'Game ended, but the wallet settlement is still processing. Your credits have not been lost.');
        room.settlementTimer = setTimeout(() => finishGame(io, room), 10000);
        return;
      }
      if (wagerResult.cancelled) {
        room.phase = 'over';
        broadcast(io, room);
        emitRoomEvent(io, room, 'game_over', { winner: null, cancelled: true, wager: null });
        destroyRoom(io, room);
        return;
      }
    }

    room.phase = 'over';
    broadcast(io, room);
    emitRoomEvent(io, room, 'game_over', {
      winner: room.game.winner,
      wager: wagerResult,
      tournament: room.tournamentMatch ? {
        id: room.tournamentMatch.tournamentId,
        round: room.tournamentMatch.roundNo,
        match: room.tournamentMatch.matchNo,
        status: tournamentResult?.status || 'IN_PROGRESS',
      } : null,
    });
    destroyRoom(io, room);
    if (room.tournamentMatch && tournamentResult) {
      try {
        await finishTournamentMatch(io, room, tournamentResult);
      } catch (error) {
        console.error(`Could not advance tournament ${room.tournamentMatch.tournamentId}:`, error);
        const runtime = tournaments.get(room.tournamentMatch.tournamentId);
        if (runtime) {
          try {
            await abortTournamentRuntime(io, runtime, 'The tournament could not continue. Entry fees are being refunded.');
          } catch (refundError) {
            console.error(`Could not refund tournament ${runtime.id}:`, refundError);
            emitTournamentUpdate(runtime, {
              status: 'ERROR',
              onlySlots: runtime.participants.filter((participant) => !participant.isBot)
                .map((participant) => participant.slot),
              message: 'Tournament processing needs support. Please contact support before playing again.',
            });
          }
        }
      }
    }
  };

  finish().catch((error) => {
    room.finishing = false;
    room.phase = 'settlement-error';
    console.error(`Could not finish game ${room.id}:`, error);
    broadcast(io, room);
    emitRoomEvent(io, room, 'settlement_error',
      'Game ended, but its result could not be recorded. Please contact support.');
    room.settlementTimer = setTimeout(() => finishGame(io, room), 10000);
  });
}

function forfeitGame(io, room, seat, socket) {
  if (room.finishing || room.game.winner) return false;
  if (room.mode > 2) {
    seat.socketId = null;
    seat.isBot = false;
    seat.isLeft = true;
    if (seat.clientId && sessions.get(seat.clientId) === room.id) sessions.delete(seat.clientId);
    seat.clientId = null;
    seat.matchmakingId = null;
    socket.leave(room.id);
    socket.data.roomId = null;
    socket.data.color = null;

    const remainingSeats = room.seats.filter((candidate) => !candidate.isLeft);
    if (remainingSeats.length === 1) {
      room.game.winner = remainingSeats[0].color;
      finishGame(io, room);
      return true;
    }

    if (room.game.turn === seat.color) {
      advanceTurn(room);
      startTurn(io, room);
    } else {
      broadcast(io, room);
    }
    return true;
  }

  const opponent = room.seats.find((candidate) => candidate.color !== seat.color);
  if (!opponent) return false;

  room.game.winner = opponent.color;
  seat.socketId = null;
  seat.isBot = false;
  seat.isLeft = true;
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
  for (const socketId of room.spectators || []) {
    const spectator = io.sockets.sockets.get(socketId);
    if (spectator?.data.spectatingRoomId === room.id) {
      spectator.data.spectatingRoomId = null;
    }
  }
  room.spectators?.clear();
  rooms.delete(room.id);
}

// ---------- Rooms and matchmaking ----------

function createRoom(io, players, {
  tokensToWin = 4, wager = null, mode = 2, botLevel = 'expert', botOpponent = false,
  tournamentParticipants = null, tournamentMatch = null,
} = {}) {
  const colors = MODE_COLORS[mode];
  if (!colors) throw new RangeError('Room mode must be 2 or 4 players.');
  const id = 'room_' + ++roomCounter;
  const usedNames = new Set(players.map((player) => player.name.toLocaleLowerCase()));
  players.forEach((player) => {
    const clientId = player.socket.data.clientId;
    botNamesByClientId.get(clientId)?.forEach((name) => usedNames.add(name.toLowerCase()));
  });

  const roster = tournamentParticipants || players.map((player) => ({
    ...player,
    isBot: false,
    level: 'medium',
  }));
  if (!tournamentParticipants && botOpponent) {
    const level = botLevel;
    const name = pickBotName(usedNames, level);
    players.forEach((player) => {
      const clientId = player.socket.data.clientId;
      if (!clientId) return;
      if (!botNamesByClientId.has(clientId)) botNamesByClientId.set(clientId, new Set());
      botNamesByClientId.get(clientId).add(name.toLowerCase());
    });
    roster.push({ name, isBot: true, level });
  }
  if (
    (tournamentParticipants && roster.length !== colors.length)
    || roster.length > colors.length
  ) {
    throw new RangeError('The room participant count does not match its mode.');
  }

  const seats = roster.map((participant, index) => {
    const socket = participant.socket;
    const connected = Boolean(socket?.connected);
    const isBot = Boolean(participant.isBot || (!participant.isBot && !connected));
    return {
      color: colors[index],
      name: participant.name,
      baseName: participant.name,
      clientId: participant.clientId || socket?.data.clientId || null,
      playerId: participant.playerId || null,
      masterId: participant.masterId || null,
      matchmakingId: participant.matchmakingId || null,
      tournamentSlot: participant.slot || null,
      socketId: connected ? socket.id : null,
      isBot,
      missed: 0,
      level: participant.level || (isBot ? 'takeover' : 'medium'),
      forcedCaptureCount: 0,
      forcedCaptureLimit: participant.level === 'hard'
        ? (Math.random() < 0.5 ? 1 : 2)
        : 0,
    };
  });

  const room = {
    id, mode, seats,
    match: wager,
    tournamentMatch,
    spectators: new Set(),
    game: engine.createGame(seats.map((seat) => seat.color), { tokensToWin }),
    phase: 'roll', dice: null, diceOptions: [], pendingDiceOptions: [], captureDiceOptions: [], dieRollId: 0,
    rolledDice: [], rolledDiceIds: [], usedDiceIds: [], rollId: 0, validMoves: [], lastMove: null,
    bonusTurn: false, doubleRoll: false, captureBonusSixes: 0,
    timer: null, deadline: null, emptyTimer: null,
  };
  rooms.set(id, room);

  roster.forEach((participant, i) => {
    const socket = participant.socket;
    if (!socket?.connected || seats[i].isBot) return;
    socket.join(id);
    socket.data.roomId = id;
    socket.data.color = colors[i];
    if (socket.data.clientId) sessions.set(socket.data.clientId, id);
    if (tournamentMatch) {
      socket.data.tournamentId = tournamentMatch.tournamentId;
      socket.data.tournamentSlot = participant.slot;
      const clientId = String(socket.data.clientId || '');
      if (clientId) {
        tournamentByClientId.set(clientId, {
          tournamentId: tournamentMatch.tournamentId,
          slot: participant.slot,
        });
      }
    }
    socket.emit('match_found', {
      roomId: id,
      yourColor: colors[i],
      requestId: tournamentMatch && tournamentMatch.roundNo > 1
        ? undefined
        : participant.matchmakingId || undefined,
      tournament: tournamentMatch ? {
        id: tournamentMatch.tournamentId,
        round: tournamentMatch.roundNo,
        match: tournamentMatch.matchNo,
        prizePool: tournamentMatch.prizePool,
      } : undefined,
      wager: wager ? {
        bet: wager.bet,
        feePerPlayer: wager.feePerPlayer,
        payout: wager.payout,
      } : null,
    });
  });

  if (players.length > 1) {
    players.forEach((player) => botFallbackCounts.delete(String(player.playerId)));
  } else if (botOpponent) {
    const playerId = String(players[0].playerId);
    const nextCount = ((botFallbackCounts.get(playerId) || 0) + 1) % 3;
    if (nextCount === 0) botFallbackCounts.delete(playerId);
    else botFallbackCounts.set(playerId, nextCount);
  }

  startTurn(io, room);
  return room;
}

const TOURNAMENT_ROUND_NAMES = {
  1: 'Quarter-Finals',
  2: 'Semi-Finals',
  3: 'Final',
};

function emitTournamentUpdate(runtime, {
  status, message, roundNo = runtime.currentRound, matchNo = null, onlySlots = null, payout = null,
} = {}) {
  for (const participant of runtime.participants) {
    if (participant.isBot || !participant.socket?.connected) continue;
    if (onlySlots && !onlySlots.includes(participant.slot)) continue;
    const participantMessage = typeof message === 'function' ? message(participant) : message;
    if (!participantMessage) continue;
    participant.socket.emit('tournament_update', {
      tournamentId: runtime.id,
      status,
      round: roundNo,
      match: matchNo,
      participantStatus: participant.status,
      championName: runtime.championName || null,
      payout,
      message: participantMessage,
    });
  }
}

function activeTournamentParticipant(socket) {
  const clientId = String(socket.data.clientId || '');
  const reference = clientId ? tournamentByClientId.get(clientId) : null;
  const runtime = reference && tournaments.get(reference.tournamentId);
  return runtime?.status === 'IN_PROGRESS'
    ? runtime.participants.find((participant) =>
      participant.slot === reference.slot
      && ['WAITING', 'IN_PROGRESS'].includes(participant.status)
    ) || null
    : null;
}

function isTournamentGroupReady(group, now = Date.now()) {
  return group.length >= 2
    || now - group[0].queuedAt >= QUEUE_WAIT_MS.tournament;
}

function findReadyTournamentGroup(queue, now = Date.now()) {
  const groups = new Map();
  queue.forEach((player) => {
    const key = String(player.bet);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(player);
  });
  return [...groups.values()]
    .sort((left, right) => left[0].queuedAt - right[0].queuedAt)
    .find((group) => isTournamentGroupReady(group, now)) || null;
}

async function launchTournamentRound(io, runtime, roundNo, roundMatches) {
  runtime.currentRound = roundNo;
  const results = await Promise.allSettled(roundMatches.map(async (match) => {
    const key = `${roundNo}:${match.match_no}`;
    if (runtime.matches.has(key)) return false;
    const tournamentMatch = await startTournamentMatch(runtime.id, roundNo, match.match_no);
    if (!tournamentMatch) return false;
    const participants = [
      runtime.participants.find((participant) => participant.slot === tournamentMatch.player1Slot),
      runtime.participants.find((participant) => participant.slot === tournamentMatch.player2Slot),
    ];
    if (participants.some((participant) => !participant)) {
      throw new TournamentError('A tournament match participant could not be found.');
    }

    participants.forEach((participant) => { participant.status = 'IN_PROGRESS'; });
    const livePlayers = participants.filter((participant) =>
      !participant.isBot && participant.socket?.connected
    );
    runtime.matches.set(key, { status: 'IN_PROGRESS' });
    try {
      createRoom(io, livePlayers, {
        mode: 2,
        tokensToWin: 1,
        tournamentParticipants: participants,
        tournamentMatch: {
          tournamentId: runtime.id,
          roundNo,
          matchNo: match.match_no,
          prizePool: runtime.prizePool,
        },
      });
    } catch (error) {
      runtime.matches.delete(key);
      throw error;
    }
    return true;
  }));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  const started = results.map((result) => result.value);
  if (started.some(Boolean)) {
    emitTournamentUpdate(runtime, {
      status: 'ROUND_STARTED',
      roundNo,
      message: (participant) => participant.status === 'ELIMINATED'
        ? null
        : roundNo === 3
          ? 'Both semi-finals are complete. The final is starting now.'
          : `${TOURNAMENT_ROUND_NAMES[roundNo]} have started.`,
    });
  }
}

async function beginTournament(io, queuedPlayers) {
  const humans = queuedPlayers.filter((player) => player.socket.connected);
  if (humans.length === 0) return;

  const usedNames = new Set(humans.map((player) => player.name.toLocaleLowerCase()));
  humans.forEach((player) => {
    botNamesByClientId.get(player.socket.data.clientId)?.forEach((name) =>
      usedNames.add(name.toLowerCase())
    );
  });
  const participants = buildParticipants(humans, (level) => ({
    name: pickBotName(usedNames, level),
  }));
  const id = randomUUID();
  const tournament = await createTournament({
    id,
    entryFee: humans[0].bet,
    participants,
  });
  const runtime = {
    id,
    entryFee: tournament.entryFee,
    humanCount: tournament.humanCount,
    prizePool: tournament.prizePool,
    participants: participants.map((participant) => ({ ...participant, status: 'WAITING' })),
    currentRound: 1,
    status: 'IN_PROGRESS',
    matches: new Map(),
    startedAt: Date.now(),
    championName: null,
  };
  tournaments.set(id, runtime);
  for (const participant of runtime.participants) {
    if (participant.isBot) continue;
    const clientId = String(participant.socket?.data.clientId || '');
    if (!clientId) continue;
    tournamentByClientId.set(clientId, { tournamentId: id, slot: participant.slot });
    participant.socket.data.tournamentId = id;
    participant.socket.data.tournamentSlot = participant.slot;
  }

  const matches = createRoundPairs(1, runtime.participants.map((participant) => participant.slot))
    .map(([player1Slot, player2Slot], index) => ({
      round_no: 1,
      match_no: index + 1,
      player1_slot: player1Slot,
      player2_slot: player2Slot,
    }));
  try {
    for (const participant of runtime.participants) {
      if (participant.isBot || !participant.socket?.connected) continue;
        participant.socket.emit(
          'tournament_bracket',
          createBracketPreview(runtime.participants, matches, participant.slot)
        );
    }
    await new Promise((resolve) => setTimeout(resolve, TOURNAMENT_PREVIEW_MS));
    await launchTournamentRound(io, runtime, 1, matches);
  } catch (error) {
    console.error(`Could not start tournament ${id}:`, error);
    try {
      await abortTournamentRuntime(
        io,
        runtime,
        'Tournament could not start. Entry fees are being refunded.'
      );
    } catch (refundError) {
      console.error(`Could not refund tournament ${id}:`, refundError);
    }
    throw new TournamentError('The tournament could not start. Please try again.');
  }
}

async function finishTournamentMatch(io, room, storeResult) {
  const runtime = tournaments.get(room.tournamentMatch.tournamentId);
  if (!runtime) return;
  const winnerSeat = seatOf(room, room.game.winner);
  if (!winnerSeat) throw new TournamentError('The tournament match winner could not be found.');
  const winner = runtime.participants.find((participant) =>
    participant.slot === winnerSeat.tournamentSlot
  );
  if (!winner) throw new TournamentError('The tournament winner could not be found.');
  winner.status = 'WAITING';
  const matchParticipants = room.seats.map((seat) => seat.tournamentSlot);
  const loser = runtime.participants.find((participant) =>
    matchParticipants.includes(participant.slot) && participant.slot !== winner.slot
  );
  if (loser) loser.status = 'ELIMINATED';

  runtime.matches.set(`${room.tournamentMatch.roundNo}:${room.tournamentMatch.matchNo}`, {
    status: 'COMPLETED',
    winnerSlot: winner.slot,
  });

  if (storeResult.status === 'WAITING') {
    emitTournamentUpdate(runtime, {
      status: 'WAITING',
      roundNo: room.tournamentMatch.roundNo,
      matchNo: room.tournamentMatch.matchNo,
      onlySlots: matchParticipants,
      message: (participant) => participant.slot === winner.slot
        ? `You qualified and are waiting for all ${TOURNAMENT_ROUND_NAMES[room.tournamentMatch.roundNo].toLowerCase()} matches to finish.`
        : 'You were eliminated from the tournament.',
    });
    return;
  }

  if (storeResult.status === 'ROUND_READY') {
    runtime.currentRound = storeResult.roundNo;
    const nextSlots = storeResult.matches.flatMap((match) => [
      match.player1_slot,
      match.player2_slot,
    ]);
    for (const participant of runtime.participants) {
      if (nextSlots.includes(participant.slot)) participant.status = 'WAITING';
    }
    emitTournamentUpdate(runtime, {
      status: 'ROUND_READY',
      roundNo: storeResult.roundNo,
      message: (participant) => {
        if (participant.slot === loser?.slot) return 'You were eliminated from the tournament.';
        if (participant.status === 'ELIMINATED') return null;
        if (storeResult.roundNo === 3) {
          return 'Both semi-finals are complete. The final is starting now.';
        }
        return 'All quarter-finals are complete. The semi-finals are starting now.';
      },
    });
    await launchTournamentRound(io, runtime, storeResult.roundNo, storeResult.matches);
    return;
  }

  if (storeResult.status === 'COMPLETED') {
    runtime.status = 'COMPLETED';
    runtime.championName = storeResult.championName;
    const champion = runtime.participants.find((participant) =>
      participant.slot === storeResult.championSlot
    );
    if (champion) champion.status = 'CHAMPION';
    for (const participant of runtime.participants) {
      if (participant.status !== 'CHAMPION') participant.status = 'ELIMINATED';
    }
    emitTournamentUpdate(runtime, {
      status: 'COMPLETED',
      roundNo: 3,
      onlySlots: champion && !champion.isBot ? [champion.slot] : [],
      payout: storeResult.payout,
      message: `${storeResult.championName} is the tournament champion and wins ${storeResult.payout} credits.`,
    });
    for (const participant of runtime.participants) {
      if (participant.isBot) continue;
      const clientId = String(participant.socket?.data.clientId || '');
      if (clientId && tournamentByClientId.get(clientId)?.tournamentId === runtime.id) {
        tournamentByClientId.delete(clientId);
      }
      if (participant.socket?.data.tournamentId === runtime.id) {
        participant.socket.data.tournamentId = null;
        participant.socket.data.tournamentSlot = null;
      }
    }
  }
}

async function abortTournamentRuntime(io, runtime, message) {
  const cancelled = await cancelTournament(runtime.id, message);
  if (!cancelled) return false;
  runtime.status = 'CANCELLED';
  for (const room of [...rooms.values()]) {
    if (room.tournamentMatch?.tournamentId !== runtime.id) continue;
    room.finishing = true;
    room.phase = 'over';
    clearTimeout(room.timer);
    broadcast(io, room);
    emitRoomEvent(io, room, 'game_over', { winner: null, cancelled: true, wager: null });
    destroyRoom(io, room);
  }
  for (const participant of runtime.participants) {
    if (participant.isBot) continue;
    const clientId = String(participant.socket?.data.clientId || '');
    if (clientId && tournamentByClientId.get(clientId)?.tournamentId === runtime.id) {
      tournamentByClientId.delete(clientId);
    }
    if (participant.socket?.data.tournamentId === runtime.id) {
      participant.socket.data.tournamentId = null;
      participant.socket.data.tournamentSlot = null;
    }
    participant.status = 'ELIMINATED';
  }
  emitTournamentUpdate(runtime, {
    status: 'CANCELLED',
    roundNo: runtime.currentRound,
    onlySlots: runtime.participants.filter((participant) => !participant.isBot)
      .map((participant) => participant.slot),
    message,
  });
  return true;
}

function checkTournamentQueue(io) {
  const queueType = 'tournament';
  const queue = queues[queueType];
  if (processingQueues.has(queueType)) return;

  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index].socket.connected) continue;
    queue.splice(index, 1);
  }

  const readyGroup = findReadyTournamentGroup(queue);

  if (readyGroup) {
    const entrants = readyGroup.slice(0, 7);
    const selected = new Set(entrants);
    queues[queueType] = queue.filter((player) => !selected.has(player));
    processingQueues.add(queueType);
    beginTournament(io, entrants)
      .catch((error) => {
        if (!(error instanceof TournamentError)) {
          console.error('Could not create tournament:', error);
        }
        entrants.forEach((player) => player.socket.emit('match_error',
          error instanceof TournamentError
            ? error.message
            : 'Could not start the tournament. Please try again.'
        ));
      })
      .finally(() => {
        processingQueues.delete(queueType);
        checkTournamentQueue(io);
      });
    return;
  }

  if (queue.length === 0) {
    clearTimeout(queueTimers[queueType]);
    queueTimers[queueType] = null;
    return;
  }
  const remainingWait = Math.min(...queue.map((player) =>
    QUEUE_WAIT_MS.tournament - (Date.now() - player.queuedAt)
  ));
  clearTimeout(queueTimers[queueType]);
  queueTimers[queueType] = setTimeout(() => {
    queueTimers[queueType] = null;
    checkTournamentQueue(io);
  }, Math.max(1, remainingWait));
}

function checkQueue(io, queueType) {
  if (queueType === 'tournament') {
    checkTournamentQueue(io);
    return;
  }
  const q = queues[queueType];
  const tokensToWin = 4;
  if (processingQueues.has(queueType)) return;

  let pair;
  for (let first = 0; first < q.length && !pair; first += 1) {
    for (let second = first + 1; second < q.length; second += 1) {
      if (
        q[first].playerId !== q[second].playerId
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
    beginWageredMatch(io, queueType, players, tokensToWin, false);
    return;
  }

  const expiredIndex = q.findIndex((player) =>
    Date.now() - player.queuedAt >= QUEUE_WAIT_MS[queueType]
  );
  if (expiredIndex !== -1) {
    const [player] = q.splice(expiredIndex, 1);
   const fallbackCount = botFallbackCounts.get(String(player.playerId)) || 0;

beginWageredMatch(
  io,
  queueType,
  [player],
  tokensToWin,
  true,
  fallbackCount
);
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

function beginWageredMatch(
  io,
  queueType,
  players,
  tokensToWin,
  botOpponent,
  fallbackCount
) {
  processingQueues.add(queueType);

  startWageredRoom(
    io,
    players,
    tokensToWin,
    botOpponent,
    fallbackCount
  )
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
}

async function startWageredRoom(io, players, tokensToWin, botOpponent, fallbackCount) {
  if (players.some((player) => !player.socket.connected)) {
    throw new WagerError('A player disconnected before the match could start.');
  }
  const matchCode = `LUD-${randomUUID()}`;
  const wager = await createWageredMatch(
    players,
    players[0].bet,
    matchCode,
    players[0].queueType,
    { botOpponent }
  );
  const botLevel = botOpponent
  ? (
      Number(wager.projectedBalance) >= 2000
        ? 'expert'
        : pickBotLevel(fallbackCount)
    )
  : undefined;
  try {
    createRoom(io, players, { tokensToWin, wager, botLevel, botOpponent });
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

async function startPrivateWageredRoom(io, lobby) {
  const players = lobby.players.map((player) => ({
    ...player,
    bet: lobby.bet,
    queueType: 'private',
  }));
  if (players.some((player) => !hasActivePlayerSession(player.socket))) {
    throw new WagerError('A player must sign in again before the table can start.');
  }
  if (players.some((player) => !player.socket.connected)) {
    throw new WagerError('A player disconnected before the table could start.');
  }

  const matchCode = `LUD-${randomUUID()}`;
  const wager = await createWageredMatch(
    players,
    lobby.bet,
    matchCode,
    'private',
    { playerCount: players.length }
  );
  try {
    createRoom(io, players, { mode: lobby.mode, wager });
  } catch (error) {
    try {
      await refundWageredMatch(wager.id);
    } catch (refundError) {
      console.error(`Could not refund private-table wager ${matchCode}:`, refundError);
      throw new WagerError('Table setup failed and the bet refund is pending. Please contact support.');
    }
    throw new WagerError('Table setup failed. Your bet has been refunded.');
  }

  lobby.started = true;
  startedLobbyCodes.set(lobby.code, Date.now());
  lobbies.delete(lobby.code);
  players.forEach((player) => {
    player.socket.data.lobbyCode = null;
    player.socket.leave('lobby_' + lobby.code);
  });
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

  return releaseSeatToBot(io, room, seat, socket);
}

function releaseSeatToBot(io, room, seat, socket) {
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
  let tournamentRef = clientId && tournamentByClientId.get(String(clientId));
  let tournamentRuntime = tournamentRef && tournaments.get(tournamentRef.tournamentId);
  let tournamentParticipant = tournamentRuntime?.participants.find((participant) =>
    participant.slot === tournamentRef.slot
  );
  if (!tournamentParticipant && socket.data.playerId) {
    tournamentRuntime = [...tournaments.values()].find((runtime) =>
      runtime.status === 'IN_PROGRESS'
      && findHumanTournamentParticipant(runtime, socket.data.playerId)
    );
    tournamentParticipant = findHumanTournamentParticipant(tournamentRuntime, socket.data.playerId);
    if (tournamentRuntime && tournamentParticipant) {
      tournamentRef = { tournamentId: tournamentRuntime.id, slot: tournamentParticipant.slot };
      if (clientId) tournamentByClientId.set(String(clientId), tournamentRef);
    }
  }
  if (tournamentParticipant) {
    tournamentParticipant.socket = socket;
    socket.data.tournamentId = tournamentRuntime.id;
    socket.data.tournamentSlot = tournamentParticipant.slot;
  }
  let roomId = clientId && sessions.get(clientId);
  let room = roomId && rooms.get(roomId);
  let seat = room && room.seats.find((candidate) => candidate.clientId === clientId);
  if (
    (!seat || seat.playerId && String(seat.playerId) !== String(socket.data.playerId))
    && socket.data.playerId
  ) {
    const activeSeat = [...rooms.values()]
      .map((candidateRoom) => ({
        room: candidateRoom,
        seat: candidateRoom.seats.find((candidate) =>
          candidate.playerId
          && String(candidate.playerId) === String(socket.data.playerId)
          && candidate.clientId
        ),
      }))
      .find(({ room: candidateRoom, seat: candidateSeat }) =>
        candidateSeat && candidateRoom.phase !== 'over'
      );
    if (activeSeat) {
      room = activeSeat.room;
      seat = activeSeat.seat;
      roomId = room.id;
      const previousClientId = seat.clientId;
      if (previousClientId && sessions.get(previousClientId) === room.id) {
        sessions.delete(previousClientId);
      }
      seat.clientId = String(clientId || previousClientId);
      if (clientId) sessions.set(String(clientId), room.id);
      if (tournamentRuntime && tournamentParticipant && clientId) {
        tournamentByClientId.set(String(clientId), {
          tournamentId: tournamentRuntime.id,
          slot: tournamentParticipant.slot,
        });
      }
    }
  }
  if (!seat) {
    if (tournamentRuntime && tournamentParticipant) {
      emitTournamentUpdate(tournamentRuntime, {
        status: tournamentParticipant.status,
        roundNo: tournamentRuntime.currentRound,
        onlySlots: [tournamentParticipant.slot],
        message: tournamentParticipant.status === 'WAITING'
          ? `You qualified and are waiting for ${TOURNAMENT_ROUND_NAMES[tournamentRuntime.currentRound]?.toLowerCase() || 'the next round'}.`
          : tournamentParticipant.status === 'ELIMINATED'
            ? 'You have been eliminated from the tournament.'
            : 'Your tournament match is being prepared.',
      });
      return;
    }
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

  socket.emit('match_found', {
    roomId: room.id,
    yourColor: seat.color,
    tournament: room.tournamentMatch ? {
      id: room.tournamentMatch.tournamentId,
      round: room.tournamentMatch.roundNo,
      match: room.tournamentMatch.matchNo,
      prizePool: room.tournamentMatch.prizePool,
    } : undefined,
    wager: room.match ? {
      bet: room.match.bet,
      feePerPlayer: room.match.feePerPlayer,
      payout: room.match.payout,
    } : null,
  });
  // If it is their turn, give them a human timer again instead of the bot's
  if (room.game.turn === seat.color && ['roll', 'bonus-roll', 'capture-roll', 'move'].includes(room.phase)) {
    schedule(io, room);
  }
  broadcast(io, room);
}

function findHumanTournamentParticipant(runtime, playerId) {
  if (!playerId) return null;
  return runtime?.participants.find((entry) =>
    !entry.isBot && String(entry.playerId) === String(playerId)
  ) || null;
}

function watchTournamentMatch(io, socket, {
  tournamentId,
  roundNo,
  matchNo,
} = {}) {
  const id = String(tournamentId || '');
  const round = Number(roundNo);
  const match = Number(matchNo);
  const runtime = tournaments.get(id);
  if (!runtime || runtime.status !== 'IN_PROGRESS') {
    socket.emit('tournament_watch_error', 'This tournament is no longer active. Refresh the tournament page.');
    return;
  }
  const participant = findHumanTournamentParticipant(runtime, socket.data.playerId);
  if (!participant) {
    socket.emit('tournament_watch_error', 'You can only watch matches in your tournament.');
    return;
  }
  if (socket.data.roomId) {
    socket.emit('tournament_watch_error', 'Leave your current match before watching another.');
    return;
  }
  if (!Number.isInteger(round) || round < 1 || round > 3 || !Number.isInteger(match) || match < 1) {
    socket.emit('tournament_watch_error', 'That tournament match is not available to watch.');
    return;
  }

  const room = [...rooms.values()].find((candidate) =>
    candidate.tournamentMatch?.tournamentId === id
    && candidate.tournamentMatch.roundNo === round
    && candidate.tournamentMatch.matchNo === match
    && !candidate.game.winner
    && candidate.phase !== 'over'
  );
  if (!room) {
    socket.emit('tournament_watch_error', 'That match is no longer live.');
    return;
  }
  if (room.seats.some((seat) => String(seat.playerId) === String(socket.data.playerId))) {
    socket.emit('tournament_watch_error', 'Open your own match to play.');
    return;
  }

  const previousRoom = rooms.get(socket.data.spectatingRoomId);
  previousRoom?.spectators?.delete(socket.id);
  room.spectators.add(socket.id);
  socket.data.spectatingRoomId = room.id;
  socket.emit('tournament_watch_started', { tournamentId: id, roundNo: round, matchNo: match });
  socket.emit('game_update', publicState(room, socket.id));
}

// ---------- Socket events ----------

function registerHandlers(io, socket) {
  // Private ID sent by the client when it connects
  socket.data.clientId = String(socket.handshake.auth?.clientId || '').slice(0, 64) || null;

  socket.on('resume_game', () => resumeGame(io, socket));
  socket.on('watch_tournament_match', (match) => watchTournamentMatch(io, socket, match));
  socket.on('stop_watching_tournament_match', () => {
    const room = rooms.get(socket.data.spectatingRoomId);
    room?.spectators?.delete(socket.id);
    socket.data.spectatingRoomId = null;
  });

  socket.on('find_match', ({ name, requestId, queueType, bet } = {}) => {
    if (socket.data.roomId || socket.data.spectatingRoomId) return;
    if (
      !socket.data.playerId
      || !socket.data.masterId
      || !socket.data.authExpiresAt
      || socket.data.authExpiresAt <= Math.floor(Date.now() / 1000)
    ) {
      socket.emit('match_error', 'Sign in again as a Player to place a bet.');
      return;
    }
    const betAmount = Number(bet);
    if (!Number.isSafeInteger(betAmount) || betAmount < MIN_BET || betAmount > 5000) {
      socket.emit('match_error', 'Choose a valid bet from 70 to 5,000 rupees.');
      return;
    }
    if (activeTournamentParticipant(socket)) {
      socket.emit('match_error', 'Finish your current tournament match before joining another game.');
      return;
    }
    leaveLobby(io, socket);
    removeFromQueues(io, socket);
    const matchmakingId = String(requestId || '').slice(0, 80);
    const type = queueType === 'tournament' ? 'tournament' : 'normal';
    if (
      type === 'tournament'
      && (
        queues.tournament.some((player) => String(player.playerId) === String(socket.data.playerId))
      )
    ) {
      socket.emit('match_error', 'You are already queued for or playing in a tournament.');
      return;
    }
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
    socket.emit('queued', {
      mode: 2,
      waitMs: QUEUE_WAIT_MS[type],
      requestId: matchmakingId,
      queueType: type,
    });
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
      if (room.match || room.tournamentMatch) forfeitGame(io, room, seat, socket);
      else replaceWithBot(io, socket);
    }
  });

  // ----- Friend rooms -----

  socket.on('create_room', ({ mode = 2, name, bet } = {}) => {
    if (socket.data.roomId) return;
    if (!hasActivePlayerSession(socket)) {
      return socket.emit('lobby_error', 'Sign in again as a Player to create a wagered table.');
    }
    if (activeTournamentParticipant(socket)) {
      return socket.emit('lobby_error', 'Finish your current tournament match before creating another table.');
    }
    const playerCount = Number(mode);
    if (!MODE_COLORS[playerCount]) {
      return socket.emit('lobby_error', 'Choose a 2-player or 4-player table.');
    }
    const betAmount = Number(bet);
    if (!Number.isSafeInteger(betAmount) || betAmount < MIN_BET || betAmount > 5000) {
      return socket.emit('lobby_error', 'Choose a bet between 30 and 5,000 rupees.');
    }
    removeFromQueues(io, socket);
    leaveLobby(io, socket);
    const lobby = {
      code: makeCode(),
      mode: playerCount,
      bet: betAmount,
      hostId: socket.id,
      players: [],
    };
    lobbies.set(lobby.code, lobby);
    joinLobby(io, lobby, socket, name);
  });

  socket.on('join_room', ({ code, name } = {}) => {
    if (socket.data.roomId) return;
    if (!hasActivePlayerSession(socket)) {
      return socket.emit('lobby_error', 'Sign in again as a Player to join a wagered table.');
    }
    if (activeTournamentParticipant(socket)) {
      return socket.emit('lobby_error', 'Finish your current tournament match before joining another table.');
    }
    const roomCode = String(code || '').trim().toUpperCase();
    const lobby = lobbies.get(roomCode);
    const startedAt = startedLobbyCodes.get(roomCode);
    if (isPrivateRoomStarted(lobby, startedAt)) {
      return socket.emit('lobby_error', 'This game has already started.');
    }
    if (startedAt != null) startedLobbyCodes.delete(roomCode);
    if (!lobby) return socket.emit('lobby_error', 'Room not found. Check the code.');
    if (lobby.players.some((p) => p.socket.id === socket.id)) return;
    if (lobby.players.some((p) => String(p.playerId) === String(socket.data.playerId))) {
      return socket.emit('lobby_error', 'This player has already joined the table.');
    }
    if (lobby.players.length >= lobby.mode) return socket.emit('lobby_error', 'Room is full.');
    removeFromQueues(io, socket);
    leaveLobby(io, socket);
    joinLobby(io, lobby, socket, name);
  });

  socket.on('leave_room', () => leaveLobby(io, socket));

  socket.on('leave_game', (ack) => {
    const acknowledge = (result = { ok: true }) => {
      if (typeof ack === 'function') ack(result);
    };
    const room = rooms.get(socket.data.roomId);
    const seat = room?.seats.find((candidate) => candidate.socketId === socket.id);
    const forfeited = Boolean(room && seat && forfeitGame(io, room, seat, socket));
    acknowledge({
      ok: true,
      forfeited,
      winner: room?.game?.winner ?? null,
    });
  });

  socket.on('start_room', async () => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) return; // only the host can start
    if (lobby.starting) return;
    if (!canStartPrivateRoom(lobby.mode, lobby.players.length)) {
      return socket.emit('lobby_error', 'At least two players are required to start a private table.');
    }
    lobby.starting = true;
    try {
      await startPrivateWageredRoom(io, lobby);
    } catch (error) {
      lobby.starting = false;
      const message = error instanceof WagerError
        ? error.message
        : 'Could not start the private table. Please try again.';
      if (!(error instanceof WagerError)) {
        console.error(`Could not start private table ${lobby.code}:`, error);
      }
      io.to('lobby_' + lobby.code).emit('lobby_error', message);
    }
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
    const watchedRoom = rooms.get(socket.data.spectatingRoomId);
    watchedRoom?.spectators?.delete(socket.id);
    socket.data.spectatingRoomId = null;
    const clientId = String(socket.data.clientId || '');
    const tournamentRef = clientId ? tournamentByClientId.get(clientId) : null;
    const tournamentRuntime = tournamentRef && tournaments.get(tournamentRef.tournamentId);
    const participant = tournamentRuntime?.participants.find((candidate) =>
      candidate.slot === tournamentRef.slot
    );
    if (participant?.socket === socket) participant.socket = null;
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    takeOverDisconnectedSeat(io, room, socket);
  });
}

module.exports = {
  registerHandlers, autoAct, publicState, pickBotName, forfeitGame,
  rollDiceForCurrentPlayer, takeOverDisconnectedSeat, restoreSeatControl, BOT_NAMES, HUMAN_SIX_CHANCE,
  pickBotLevel, canStartPrivateRoom, isPrivateRoomStarted, createRoom, advanceTurn,
  isTournamentGroupReady, findReadyTournamentGroup,
  recordHardForcedCapture, findHumanTournamentParticipant, emitTournamentUpdate,
};

const assert = require('assert');
const engine = require('../game/engine');
const { calculateWager } = require('../game/wager');
const {
  registerHandlers, autoAct, publicState, pickBotName, forfeitGame, rollDiceForCurrentPlayer,
  takeOverDisconnectedSeat, restoreSeatControl, BOT_NAMES, HUMAN_SIX_CHANCE, pickBotLevel,
  canStartPrivateRoom, isPrivateRoomStarted, createRoom, advanceTurn,
  isTournamentGroupReady, findReadyTournamentGroup,
} = require('./rooms');

function makeLobbyTestSocket(id, io) {
  const handlers = {};
  const emitted = [];
  const socket = {
    id,
    data: {
      playerId: id,
      masterId: 'test-master',
      authExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    connected: true,
    handshake: { auth: {} },
    on: (event, handler) => { handlers[event] = handler; },
    emit: (event, payload) => emitted.push({ event, payload }),
    join: () => {},
    leave: () => {},
  };
  registerHandlers(io, socket);
  return { handlers, emitted, socket };
}

const lobbyEvents = [];
const lobbyTestIo = {
  to: (target) => ({
    emit: (event, payload) => lobbyEvents.push({ target, event, payload }),
  }),
  sockets: { sockets: new Map() },
};

for (const mode of [2, 4]) {
  const host = makeLobbyTestSocket(`host-${mode}`, lobbyTestIo);
  const guests = [];
  host.handlers.create_room({ mode, bet: 300, name: 'Host' });
  const lobbyUpdate = lobbyEvents.filter(({ event }) => event === 'lobby_update').at(-1).payload;
  assert.strictEqual(lobbyUpdate.mode, mode, `${mode}-player private tables should keep their selected mode`);
  assert.strictEqual(lobbyUpdate.bet, 300, 'private tables should publish their per-player bet');
  host.handlers.start_room();
  assert.ok(host.emitted.some(({ event, payload }) =>
    event === 'lobby_error' && payload === 'At least two players are required to start a private table.'
  ), `${mode}-player private tables should require at least two players`);

  for (let index = 1; index < mode; index++) {
    const guest = makeLobbyTestSocket(`guest-${mode}-${index}`, lobbyTestIo);
    guest.handlers.join_room({ code: lobbyUpdate.code, name: `Guest ${index}` });
    guests.push(guest);
  }
  const fullLobby = lobbyEvents.filter(({ event }) => event === 'lobby_update').at(-1).payload;
  assert.strictEqual(fullLobby.players.length, mode, `${mode}-player private tables should accept the correct number of players`);

  const overflow = makeLobbyTestSocket(`overflow-${mode}`, lobbyTestIo);
  overflow.handlers.join_room({ code: lobbyUpdate.code, name: 'Overflow' });
  assert.ok(overflow.emitted.some(({ event, payload }) =>
    event === 'lobby_error' && payload === 'Room is full.'
  ));

  [host, ...guests, overflow].forEach(({ handlers }) => handlers.disconnect());
}

const invalidBetHost = makeLobbyTestSocket('invalid-bet-host', lobbyTestIo);
invalidBetHost.handlers.create_room({ mode: 2, bet: 299, name: 'Host' });
assert.ok(invalidBetHost.emitted.some(({ event, payload }) =>
  event === 'lobby_error' && payload === 'Choose a bet between 300 and 5,000 credits.'
));
invalidBetHost.handlers.disconnect();

const invalidMode = makeLobbyTestSocket('invalid-mode', lobbyTestIo);
invalidMode.handlers.create_room({ mode: 3, bet: 300, name: 'Player' });
assert.ok(invalidMode.emitted.some(({ event, payload }) =>
  event === 'lobby_error' && payload === 'Choose a 2-player or 4-player table.'
));
console.log('PASS: private tables support two and four players and reject invalid modes');

for (const playerCount of [2, 3]) {
  const players = Array.from({ length: playerCount }, (_, index) => {
    const testSocket = makeLobbyTestSocket(`partial-${playerCount}-${index}`, lobbyTestIo);
    return {
      name: `Player ${index + 1}`,
      playerId: testSocket.socket.data.playerId,
      socket: testSocket.socket,
    };
  });
  const room = createRoom(lobbyTestIo, players, { mode: 4 });
  assert.strictEqual(room.seats.length, playerCount);
  assert.strictEqual(room.seats.some((seat) => seat.isBot), false);
  assert.deepStrictEqual(room.game.colors, room.seats.map((seat) => seat.color));
  clearTimeout(room.timer);
}
const fallbackSocket = makeLobbyTestSocket('fallback-bot-player', lobbyTestIo);
const fallbackRoom = createRoom(lobbyTestIo, [{
  name: 'Queue player',
  playerId: fallbackSocket.socket.data.playerId,
  socket: fallbackSocket.socket,
}], { botOpponent: true });
assert.deepStrictEqual(fallbackRoom.seats.map((seat) => seat.isBot), [false, true]);
clearTimeout(fallbackRoom.timer);

const tournamentHumanSocket = makeLobbyTestSocket('tournament-human', lobbyTestIo);
const tournamentHuman = {
  name: 'Tournament Human',
  playerId: tournamentHumanSocket.socket.data.playerId,
  masterId: tournamentHumanSocket.socket.data.masterId,
  matchmakingId: 'tournament-request',
  socket: tournamentHumanSocket.socket,
  isBot: false,
  slot: 1,
};
const humanBotTournamentRoom = createRoom(lobbyTestIo, [tournamentHuman], {
  tokensToWin: 1,
  tournamentParticipants: [
    tournamentHuman,
    { name: 'Expert Bot', isBot: true, level: 'expert', slot: 2 },
  ],
  tournamentMatch: { tournamentId: 'test-tournament', roundNo: 1, matchNo: 1 },
});
assert.deepStrictEqual(humanBotTournamentRoom.seats.map((seat) => seat.isBot), [false, true]);
assert.strictEqual(humanBotTournamentRoom.game.tokensToWin, 1);
clearTimeout(humanBotTournamentRoom.timer);

const botTournamentRoom = createRoom(lobbyTestIo, [], {
  tokensToWin: 1,
  tournamentParticipants: [
    { name: 'Hard Bot', isBot: true, level: 'hard', slot: 1 },
    { name: 'Medium Bot', isBot: true, level: 'medium', slot: 2 },
  ],
  tournamentMatch: { tournamentId: 'test-tournament', roundNo: 1, matchNo: 2 },
});
assert.deepStrictEqual(botTournamentRoom.seats.map((seat) => seat.isBot), [true, true]);
assert.strictEqual(botTournamentRoom.game.tokensToWin, 1);
clearTimeout(botTournamentRoom.timer);
console.log('PASS: tournament rooms support human-vs-bot and bot-vs-bot 1v1 matches');
assert.strictEqual(isTournamentGroupReady([
  { masterId: 'master-a', queuedAt: 1000 },
  { masterId: 'master-b', queuedAt: 2000 },
], 2000), true, 'same-bet tournament players from different masters should start together');
assert.strictEqual(isTournamentGroupReady([{ queuedAt: 1000 }], 2000), false);
assert.strictEqual(isTournamentGroupReady([{ queuedAt: 1000 }], 21000), true);
const crossMasterTournamentQueue = [
  { playerId: 'player-a', masterId: 'master-a', bet: 500, queuedAt: 1000 },
  { playerId: 'player-b', masterId: 'master-b', bet: 500, queuedAt: 1100 },
  { playerId: 'player-c', masterId: 'master-c', bet: 1000, queuedAt: 900 },
];
assert.deepStrictEqual(
  findReadyTournamentGroup(crossMasterTournamentQueue, 1200)
    .map((player) => player.playerId),
  ['player-a', 'player-b'],
  'same-bet players from different masters should be selected together'
);
assert.strictEqual(
  findReadyTournamentGroup([
    { playerId: 'player-a', bet: 500, queuedAt: 1000 },
    { playerId: 'player-b', bet: 1000, queuedAt: 1000 },
  ], 1200),
  null,
  'players with different bets should remain in separate tournament queues'
);
console.log('PASS: tournament auto-matches same-bet players across masters');

assert.strictEqual(canStartPrivateRoom(2, 1), false, '2-player tables require both human players');
assert.strictEqual(canStartPrivateRoom(2, 2), true, '2-player tables start when full');
assert.strictEqual(canStartPrivateRoom(4, 1), false, '4-player tables require at least two human players');
for (const playerCount of [2, 3, 4]) {
  assert.strictEqual(
    canStartPrivateRoom(4, playerCount),
    true,
    `4-player tables should start with ${playerCount} human players`
  );
}
assert.strictEqual(isPrivateRoomStarted({ starting: true }, null), true);
assert.strictEqual(isPrivateRoomStarted(null, 1000, 2000), true);
assert.strictEqual(isPrivateRoomStarted(null, 1000, 1000 + 24 * 60 * 60 * 1000), false);
assert.strictEqual(isPrivateRoomStarted({ starting: false }, null), false);

assert.deepStrictEqual(calculateWager(300, 10), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 570,
});
assert.deepStrictEqual(calculateWager(300, 10, false, 4), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 1170,
});
assert.deepStrictEqual(calculateWager(300, 10, true), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 570,
});
assert.deepStrictEqual(calculateWager(300, 10, true, 4), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 1170,
});
assert.deepStrictEqual(calculateWager(300, 10, false, 3), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 870,
});
assert.deepStrictEqual(calculateWager(300, 0), {
  feePerPlayer: 0,
  platformFee: 0,
  payout: 600,
});

const originalRandomForDiceTest = Math.random;
try {
  for (const [level, sixThreshold] of [
    ['expert', 0.649],
    ['hard', 0.499],
    ['medium', 0.299],
  ]) {
    Math.random = () => sixThreshold;
    assert.strictEqual(rollDiceForCurrentPlayer({
      game: engine.createGame(['red', 'yellow']),
      seats: [{ color: 'red', isBot: true, level }],
    }), 6, `${level} bots should have an increased chance of rolling 6`);

    Math.random = () => 0.999;
    assert.strictEqual(rollDiceForCurrentPlayer({
      game: engine.createGame(['red', 'yellow']),
      seats: [{ color: 'red', isBot: true, level }],
    }), 5, `${level} bot should favor higher non-six rolls`);
  }

  Math.random = () => 0.65;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
  }), 6, 'expert six chance should be 65%, not 70%');

  Math.random = () => 0.5;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'hard' }],
  }), 6, 'hard six chance should be 50%, not 40%');

  Math.random = () => 0.3;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'medium' }],
  }), 6, 'medium six chance should be 30%');

  Math.random = () => 0.15;
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
    phase: 'bonus-roll',
    rolledDice: [6],
  }), 6, 'bot should sometimes roll 6 on an extra roll');

  Math.random = () => 0;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
    phase: 'bonus-roll',
    rolledDice: [6, 6],
  }), 6, 'bot should avoid forfeiting a turn on a third consecutive 6');

  Math.random = () => 0.15;
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
    phase: 'capture-roll',
    captureBonusSixes: 1,
  }), 6, 'bot should sometimes roll 6 on a capture bonus roll');

  Math.random = () => 0;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
    phase: 'capture-roll',
    captureBonusSixes: 2,
  }), 6, 'bot should avoid forfeiting a capture bonus turn on a third 6');

  for (const [cooldownRoll, expectedCooldown] of [[0.2, 1], [0.7, 2]]) {
    const expertSeat = { color: 'red', isBot: true, level: 'expert' };
    const expertDiceRoom = {
      game: engine.createGame(['red', 'yellow']),
      seats: [expertSeat],
      phase: 'roll',
      rolledDice: [],
    };
    let randomValues = [0.2, cooldownRoll];
    Math.random = () => randomValues.shift() ?? 0;
    assert.strictEqual(rollDiceForCurrentPlayer(expertDiceRoom), 6);
    assert.strictEqual(expertSeat.sixCooldown, expectedCooldown);

    expertDiceRoom.phase = 'bonus-roll';
    expertDiceRoom.rolledDice = [6];
    Math.random = () => 0;
    assert.notStrictEqual(rollDiceForCurrentPlayer(expertDiceRoom), 6);
    assert.strictEqual(expertSeat.sixCooldown, expectedCooldown, 'same-turn bonus rolls do not consume the gap');

    expertDiceRoom.phase = 'roll';
    expertDiceRoom.rolledDice = [];
    for (let remaining = expectedCooldown; remaining > 0; remaining--) {
      assert.notStrictEqual(rollDiceForCurrentPlayer(expertDiceRoom), 6);
      assert.strictEqual(expertSeat.sixCooldown, remaining - 1);
    }

    randomValues = [0.2, 0.2];
    Math.random = () => randomValues.shift() ?? 0;
    assert.strictEqual(rollDiceForCurrentPlayer(expertDiceRoom), 6);
  }
  console.log('PASS: expert bot randomly spaces sixes by one or two turns');

  const captureGame = engine.createGame(['red', 'yellow']);
  captureGame.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
  captureGame.tokens.red[0] = 4;
  captureGame.tokens.yellow[0] = 33;
  Math.random = () => 0.999;
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: captureGame,
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
  }), 3, 'bot should guarantee the die value needed to capture');

  Math.random = () => 0.999;
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: captureGame,
    seats: [{ color: 'red', isBot: true, level: 'medium' }],
  }), 5, 'medium bot should not force a capture die when a human token is in range');

  Math.random = () => HUMAN_SIX_CHANCE - 0.001;
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: false, level: 'medium' }],
  }), 6, 'human dice should roll 6 within the configured 20% chance');

  const humanRollValues = [HUMAN_SIX_CHANCE, 0.999];
  Math.random = () => humanRollValues.shift();
  assert.strictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: false, level: 'medium' }],
  }), 5, 'human rolls outside the 20% six chance should produce a non-six');
  console.log('PASS: bots keep their configured six chances and humans have a 20% six chance');
} finally {
  Math.random = originalRandomForDiceTest;
}

const originalRandomForNames = Math.random;
Math.random = () => 0;
try {
  assert.strictEqual(pickBotLevel(0, 0), 'expert');
  assert.strictEqual(pickBotLevel(0, 0.5), 'hard');
  assert.strictEqual(pickBotLevel(0, 0.99), 'medium');
  assert.strictEqual(pickBotLevel(1, 0), 'expert');
  assert.strictEqual(pickBotLevel(2, 0.99), 'expert');
  console.log('PASS: bot fallback levels are random twice, then expert on every third fallback');

  const usedNames = new Set(['ehsan']);
  const botNames = [pickBotName(usedNames), pickBotName(usedNames)];
  assert.deepStrictEqual(botNames, ['Ehtesham', 'Ebad']);
  assert.strictEqual(new Set(botNames.map((name) => name.toLowerCase())).size, botNames.length);
  for (const [level, initial] of [['expert', 'E'], ['hard', 'H'], ['medium', 'M']]) {
    assert.ok(pickBotName(new Set(), level).startsWith(initial), `${level} bot names should start with ${initial}`);
    assert.strictEqual(
      BOT_NAMES.filter((name) => name.startsWith(initial)).length,
      30,
      `${level} should have 30 names`
    );
  }
  const previousGames = new Set(['ehsan', ...botNames.map((name) => name.toLowerCase())]);
  assert.strictEqual(pickBotName(previousGames), 'Ejaz');
  const expertNames = BOT_NAMES.filter((name) => name.startsWith('E'));
  const exhaustedNames = new Set([
    ...expertNames.map((name) => name.toLowerCase()),
    ...Array.from({ length: expertNames.length }, (_, index) =>
      `${expertNames[index]} ${index + 2}`.toLowerCase()
    ),
  ]);
  assert.strictEqual(pickBotName(exhaustedNames), `${expertNames[0]} ${expertNames.length + 2}`);
  console.log('PASS: bot names are unique, Pakistani, and prefixed by difficulty level');
} finally {
  Math.random = originalRandomForNames;
}

const takeoverRoom = {
  id: 'takeover-visibility-test',
  game: engine.createGame(['red', 'yellow']),
  phase: 'roll',
  rolledDice: [6, 2],
  rolledDiceIds: [0, 1],
  usedDiceIds: [0],
  seats: [
    { color: 'red', name: 'Player (bot)', baseName: 'Player', isBot: true, level: 'takeover', socketId: 'player-socket' },
    { color: 'yellow', name: 'Opponent', baseName: 'Opponent', isBot: false, level: 'medium', socketId: 'opponent-socket' },
  ],
};
const playerView = publicState(takeoverRoom, 'player-socket');
const opponentView = publicState(takeoverRoom, 'opponent-socket');
assert.deepStrictEqual(playerView.rolledDice, [6, 2]);
assert.deepStrictEqual(playerView.rolledDiceIds, [0, 1]);
assert.deepStrictEqual(playerView.usedDiceIds, [0]);
assert.deepStrictEqual(playerView.seats[0], {
  color: 'red', name: 'Player', isBot: true, isTakeover: true, isLeft: false,
});
assert.deepStrictEqual(opponentView.seats[0], {
  color: 'red', name: 'Player', isBot: false, isTakeover: false, isLeft: false,
});
const botOpponentRoom = {
  ...takeoverRoom,
  seats: [
    { color: 'red', name: 'Player', baseName: 'Player', isBot: false, socketId: 'player-socket' },
    { color: 'yellow', name: 'Ahmed', baseName: 'Ahmed', isBot: true, level: 'expert', socketId: null },
  ],
};
assert.deepStrictEqual(publicState(botOpponentRoom, 'player-socket').seats[1], {
  color: 'yellow', name: 'Ahmed', isBot: false, isTakeover: false, isLeft: false,
});
console.log('PASS: takeover status is visible only to the affected player');

const takeoverNoticeSeat = {
  color: 'red',
  baseName: 'Player',
  name: 'Player (bot)',
  isBot: true,
  level: 'takeover',
  missed: 1,
};
const takeoverNotices = [];
restoreSeatControl(takeoverNoticeSeat, {
  emit: (event, payload) => takeoverNotices.push({ event, payload }),
});
assert.strictEqual(takeoverNoticeSeat.name, 'Player');
assert.strictEqual(takeoverNoticeSeat.isBot, false);
assert.strictEqual(takeoverNoticeSeat.level, 'medium');
assert.strictEqual(takeoverNoticeSeat.missed, 0);
assert.ok(takeoverNotices.some(({ event, payload }) =>
  event === 'notice' && payload.title === 'Control restored'
));
console.log('PASS: player gets a control-restored popup after reclaiming a takeover seat');

const disconnectedRoom = {
  id: 'disconnect-takeover-test',
  game: engine.createGame(['red', 'yellow']),
  phase: 'roll',
  seats: [
    { color: 'red', name: 'Player (bot)', baseName: 'Player', isBot: true, level: 'takeover', socketId: 'player-socket' },
    { color: 'yellow', name: 'Opponent (bot)', baseName: 'Opponent', isBot: true, level: 'takeover', socketId: null },
  ],
  timer: null,
  emptyTimer: null,
  deadline: null,
};
assert.strictEqual(takeOverDisconnectedSeat({
  to: () => ({ emit: () => {} }),
  sockets: { sockets: new Map() },
}, disconnectedRoom, { id: 'player-socket' }), true);
assert.strictEqual(disconnectedRoom.seats[0].isBot, true);
assert.strictEqual(disconnectedRoom.seats[0].level, 'takeover');
assert.ok(disconnectedRoom.timer, 'takeover bot should schedule a turn when all players disconnect');
assert.strictEqual(disconnectedRoom.emptyTimer, null, 'disconnected game should not expire before bot play continues');
clearTimeout(disconnectedRoom.timer);
console.log('PASS: takeover bots keep the game running after all players disconnect');

const forfeitRoom = {
  id: 'forfeit-test',
  game: engine.createGame(['red', 'yellow']),
  phase: 'move',
  timer: null,
  deadline: Date.now() + 1000,
  seats: [
    { color: 'red', name: 'Leaving player', clientId: null, socketId: 'leaving-socket', isBot: false },
    { color: 'yellow', name: 'Opponent', clientId: null, socketId: 'opponent-socket', isBot: false },
  ],
};
const emitted = [];
const forfeitIo = {
  to: (target) => ({
    emit: (event, payload) => emitted.push({ target, event, payload }),
  }),
  sockets: { sockets: new Map() },
};
const leavingSocket = {
  id: 'leaving-socket',
  data: { roomId: forfeitRoom.id, color: 'red' },
  leave: () => {},
};
assert.strictEqual(forfeitGame(forfeitIo, forfeitRoom, forfeitRoom.seats[0], leavingSocket), true);
assert.strictEqual(forfeitRoom.game.winner, 'yellow');
assert.strictEqual(forfeitRoom.phase, 'over');
assert.strictEqual(forfeitRoom.seats[0].socketId, null);
assert.strictEqual(forfeitRoom.seats[0].isLeft, true);
assert.strictEqual(leavingSocket.data.roomId, null);
assert.ok(emitted.some(({ event, payload }) => event === 'game_over' && payload.winner === 'yellow'));
console.log('PASS: quitting ends the game and awards the opponent a win');

const fourPlayerForfeitRoom = {
  id: 'four-player-forfeit-test',
  mode: 4,
  game: engine.createGame(['red', 'green', 'yellow', 'blue']),
  phase: 'move',
  timer: null,
  deadline: Date.now() + 1000,
  seats: ['red', 'green', 'yellow', 'blue'].map((color) => ({
    color,
    name: `${color} player`,
    baseName: `${color} player`,
    clientId: null,
    socketId: `${color}-socket`,
    isBot: false,
  })),
};
fourPlayerForfeitRoom.game.turn = 'yellow';
const fourPlayerLeavingSocket = {
  id: 'red-socket',
  data: { roomId: fourPlayerForfeitRoom.id, color: 'red' },
  leave: () => {},
};
assert.strictEqual(
  forfeitGame(forfeitIo, fourPlayerForfeitRoom, fourPlayerForfeitRoom.seats[0], fourPlayerLeavingSocket),
  true
);
assert.strictEqual(fourPlayerForfeitRoom.game.winner, null);
assert.strictEqual(fourPlayerForfeitRoom.seats[0].isBot, false);
assert.strictEqual(fourPlayerForfeitRoom.seats[0].isLeft, true);
assert.strictEqual(fourPlayerLeavingSocket.data.roomId, null);
assert.strictEqual(
  publicState(fourPlayerForfeitRoom, 'green-socket').seats[0].isLeft,
  true,
  'other players should see a left status on the departed player profile'
);
assert.ok(emitted.some(({ target, event }) =>
  target === 'green-socket' && event === 'game_update'
), 'the remaining players should continue the four-player game');
clearTimeout(fourPlayerForfeitRoom.timer);
console.log('PASS: leaving a four-player game marks the seat left and continues without a bot');

const lastPlayerFourModeRoom = {
  id: 'last-player-four-mode-test',
  mode: 4,
  game: engine.createGame(['red', 'green']),
  phase: 'roll',
  timer: null,
  seats: [
    { color: 'red', name: 'Leaving player', socketId: 'last-leaving-socket', isBot: false },
    { color: 'green', name: 'Remaining player', socketId: 'last-player-socket', isBot: false },
  ],
};
const lastLeavingSocket = {
  id: 'last-leaving-socket',
  data: { roomId: lastPlayerFourModeRoom.id, color: 'red' },
  leave: () => {},
};
assert.strictEqual(
  forfeitGame(forfeitIo, lastPlayerFourModeRoom, lastPlayerFourModeRoom.seats[0], lastLeavingSocket),
  true
);
assert.strictEqual(lastPlayerFourModeRoom.seats[0].isLeft, true);
assert.strictEqual(lastPlayerFourModeRoom.seats[0].isBot, false);
assert.strictEqual(lastPlayerFourModeRoom.game.winner, 'green');

const skippedLeftSeatRoom = {
  game: engine.createGame(['red', 'green', 'yellow', 'blue']),
  seats: [
    { color: 'red', isLeft: false },
    { color: 'green', isLeft: true },
    { color: 'yellow', isLeft: false },
    { color: 'blue', isLeft: false },
  ],
};
skippedLeftSeatRoom.game.turn = 'red';
advanceTurn(skippedLeftSeatRoom);
assert.strictEqual(skippedLeftSeatRoom.game.turn, 'yellow');

const game = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
game.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
game.tokens.red[0] = 54;

const room = {
  id: 'auto-act-test',
  game,
  phase: 'move',
  diceOptions: [
    { id: 0, value: 2, moves: [0] },
    { id: 1, value: 3, moves: [0] },
  ],
  validMoves: [0],
  rolledDice: [2, 3],
  rolledDiceIds: [0, 1],
  usedDiceIds: [],
  seats: [{ color: 'red', name: 'Bot', isBot: true, level: 'expert' }],
  timer: null,
  deadline: null,
  bonusTurn: false,
};

const io = {
  to: () => ({ emit: () => {} }),
  sockets: { sockets: new Map() },
};

const originalRandom = Math.random;
Math.random = () => 0;
try {
  for (let move = 0; move < 2 && !room.game.winner; move++) {
    if (room.timer) clearTimeout(room.timer);
    autoAct(io, room);
  }
} finally {
  Math.random = originalRandom;
  if (room.timer) clearTimeout(room.timer);
}

assert.strictEqual(room.game.winner, 'red');
assert.strictEqual(room.phase, 'over');
assert.deepStrictEqual(room.usedDiceIds, [room.lastMove.diceId]);
console.log('PASS: autoAct uses turn planning to finish a multi-dice winning turn');

async function testCaptureBonusSixGrantsAnotherRoll() {
  const captureGame = engine.createGame(['red', 'yellow']);
  captureGame.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
  captureGame.tokens.red[0] = 10;

  const captureRoom = {
    id: 'capture-bonus-test',
    game: captureGame,
    phase: 'capture-roll',
    captureDiceOptions: [{
      id: 0,
      value: 4,
      moves: engine.getValidMoves(captureGame, 'red', 4),
    }],
    diceOptions: [],
    pendingDiceOptions: [],
    rolledDice: [],
    rolledDiceIds: [],
    usedDiceIds: [],
    seats: [{ color: 'red', name: 'Human', isBot: false, level: 'medium' }],
    timer: null,
    deadline: null,
    rollId: 0,
    dieRollId: 0,
    captureBonusSixes: 0,
    bonusTurn: false,
  };
  const notices = [];
  const captureIo = {
    to: () => ({ emit: (event, message) => {
      if (event === 'notice') notices.push(message);
    } }),
    sockets: { sockets: new Map() },
  };
  const originalRandomForCaptureTest = Math.random;

  try {
    Math.random = () => 0.1;
    autoAct(captureIo, captureRoom);
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.strictEqual(captureRoom.phase, 'capture-roll');

    const secondRollRandomValues = [0.3, 0.2];
    Math.random = () => secondRollRandomValues.shift();
    autoAct(captureIo, captureRoom);
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.strictEqual(captureRoom.phase, 'move');
    assert.deepStrictEqual(captureRoom.rolledDice, [6, 2]);
    assert.deepStrictEqual(captureRoom.rolledDiceIds, ['capture-1', 'capture-2']);
    assert.deepStrictEqual(
      captureRoom.diceOptions.map(({ value }) => value),
      [4, 6, 2]
    );
    assert.deepStrictEqual(notices, []);
  } finally {
    Math.random = originalRandomForCaptureTest;
    if (captureRoom.timer) clearTimeout(captureRoom.timer);
  }
}

testCaptureBonusSixGrantsAnotherRoll()
  .then(() => console.log('PASS: capture bonus 6 grants another roll and keeps available dice'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

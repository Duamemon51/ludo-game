const assert = require('assert');
const engine = require('../game/engine');
const {
  autoAct, publicState, pickBotName, forfeitGame, rollDiceForCurrentPlayer,
  takeOverDisconnectedSeat, BOT_NAMES,
} = require('./rooms');

const originalRandomForDiceTest = Math.random;
try {
  for (const [level, sixThreshold] of [
    ['expert', 0.799],
    ['hard', 0.399],
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
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: false, level: 'medium' }],
  }), 6);
  console.log('PASS: bots guarantee available captures and humans keep fair dice');
} finally {
  Math.random = originalRandomForDiceTest;
}

const originalRandomForNames = Math.random;
Math.random = () => 0;
try {
  const usedNames = new Set(['oliver']);
  const botNames = [pickBotName(usedNames), pickBotName(usedNames)];
  assert.deepStrictEqual(botNames, ['Ethan', 'Liam']);
  assert.strictEqual(new Set(botNames.map((name) => name.toLowerCase())).size, botNames.length);
  const previousGames = new Set(['oliver', ...botNames.map((name) => name.toLowerCase())]);
  assert.strictEqual(pickBotName(previousGames), 'Noah');
  const exhaustedNames = new Set([
    ...BOT_NAMES.map((name) => name.toLowerCase()),
    ...Array.from({ length: BOT_NAMES.length }, (_, index) =>
      `${BOT_NAMES[index]} ${index + 2}`.toLowerCase()
    ),
  ]);
  assert.strictEqual(pickBotName(exhaustedNames), 'Oliver 48');
  console.log('PASS: bots get unique English names that do not collide with player names');
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
  color: 'red', name: 'Player', isBot: true, isTakeover: true,
});
assert.deepStrictEqual(opponentView.seats[0], {
  color: 'red', name: 'Player', isBot: false, isTakeover: false,
});
console.log('PASS: takeover status is visible only to the affected player');

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
assert.strictEqual(leavingSocket.data.roomId, null);
assert.ok(emitted.some(({ event, payload }) => event === 'game_over' && payload.winner === 'yellow'));
console.log('PASS: quitting ends the game and awards the opponent a win');

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
    Math.random = () => 0.999;
    autoAct(captureIo, captureRoom);
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.strictEqual(captureRoom.phase, 'capture-roll');

    Math.random = () => 0.2;
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

const assert = require('assert');
const engine = require('../game/engine');
const { calculateWager } = require('../game/wager');
const {
  autoAct, publicState, pickBotName, forfeitGame, rollDiceForCurrentPlayer,
  takeOverDisconnectedSeat, restoreSeatControl, BOT_NAMES,
} = require('./rooms');

assert.deepStrictEqual(calculateWager(300, 10), {
  feePerPlayer: 30,
  platformFee: 60,
  payout: 540,
});
assert.deepStrictEqual(calculateWager(300, 10, true), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 540,
});
assert.deepStrictEqual(calculateWager(300, 0), {
  feePerPlayer: 0,
  platformFee: 0,
  payout: 600,
});

const originalRandomForDiceTest = Math.random;
try {
  for (const [level, sixThreshold] of [
    ['expert', 0.699],
    ['hard', 0.499],
    ['medium', 0.399],
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

  Math.random = () => 0.7;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'expert' }],
  }), 6, 'expert six chance should be 70%, not 80%');

  Math.random = () => 0.5;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'hard' }],
  }), 6, 'hard six chance should be 50%, not 40%');

  Math.random = () => 0.4;
  assert.notStrictEqual(rollDiceForCurrentPlayer({
    game: engine.createGame(['red', 'yellow']),
    seats: [{ color: 'red', isBot: true, level: 'medium' }],
  }), 6, 'medium six chance should be 40%, not 30%');

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
  const usedNames = new Set(['ahsan']);
  const botNames = [pickBotName(usedNames), pickBotName(usedNames)];
  assert.deepStrictEqual(botNames, ['Ahmed', 'Kashif']);
  assert.strictEqual(new Set(botNames.map((name) => name.toLowerCase())).size, botNames.length);
  const previousGames = new Set(['ahsan', ...botNames.map((name) => name.toLowerCase())]);
  assert.strictEqual(pickBotName(previousGames), 'Hassan');
  const exhaustedNames = new Set([
    ...BOT_NAMES.map((name) => name.toLowerCase()),
    ...Array.from({ length: BOT_NAMES.length }, (_, index) =>
      `${BOT_NAMES[index]} ${index + 2}`.toLowerCase()
    ),
  ]);
  assert.strictEqual(pickBotName(exhaustedNames), `${BOT_NAMES[0]} ${BOT_NAMES.length + 2}`);
  console.log('PASS: bots get unique Pakistani names that do not collide with player names');
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
const botOpponentRoom = {
  ...takeoverRoom,
  seats: [
    { color: 'red', name: 'Player', baseName: 'Player', isBot: false, socketId: 'player-socket' },
    { color: 'yellow', name: 'Ahmed', baseName: 'Ahmed', isBot: true, level: 'expert', socketId: null },
  ],
};
assert.deepStrictEqual(publicState(botOpponentRoom, 'player-socket').seats[1], {
  color: 'yellow', name: 'Ahmed', isBot: false, isTakeover: false,
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

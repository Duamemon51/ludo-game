const assert = require('assert');
const engine = require('../game/engine');
const { autoAct, publicState } = require('./rooms');

const takeoverRoom = {
  id: 'takeover-visibility-test',
  game: engine.createGame(['red', 'yellow']),
  phase: 'roll',
  seats: [
    { color: 'red', name: 'Player (bot)', baseName: 'Player', isBot: true, level: 'takeover', socketId: 'player-socket' },
    { color: 'yellow', name: 'Opponent', baseName: 'Opponent', isBot: false, level: 'medium', socketId: 'opponent-socket' },
  ],
};
const playerView = publicState(takeoverRoom, 'player-socket');
const opponentView = publicState(takeoverRoom, 'opponent-socket');
assert.deepStrictEqual(playerView.seats[0], { color: 'red', name: 'Player', isBot: true });
assert.deepStrictEqual(opponentView.seats[0], { color: 'red', name: 'Player', isBot: false });
console.log('PASS: takeover status is visible only to the affected player');

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

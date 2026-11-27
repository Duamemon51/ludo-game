const assert = require('assert');
const engine = require('./engine');
const {
  chooseMove,
  chooseTurnMove,
  evaluateExpertReply,
  findCaptureDicePair,
  scoreMove,
} = require('./bot');

// Test 1: bot prefers a capture
let s = engine.createGame(['red', 'yellow']);
s.tokens.red = [2, 20, -1, -1];
s.tokens.yellow = [31, -1, -1, -1]; // yellow at abs 5
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot captures when it can');

// Do not award the bot a capture bonus for landing on an opponent double.
s = engine.createGame(['red', 'yellow']);
s.tokens.red[0] = 2;
s.tokens.yellow = [31, 31, -1, -1];
const doubleCaptureScore = scoreMove(s, 'red', 0, 3);
s.tokens.yellow = [-1, -1, -1, -1];
assert.strictEqual(doubleCaptureScore, scoreMove(s, 'red', 0, 3));
console.log('PASS: bot does not treat an opponent double as a capturable target');

// Test 2: bot prefers reaching home
s = engine.createGame(['red', 'yellow']);
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red = [engine.FINISH - 3, 10, -1, -1];
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot goes home when it can');

// Bot avoids moving a token onto a square an opponent can immediately capture.
s = engine.createGame(['red', 'yellow']);
s.tokens.red = [8, 20, -1, -1];
s.tokens.yellow[0] = 32; // yellow at abs 6 can hit red at abs 10
assert.deepStrictEqual(
  chooseTurnMove(s, 'red', [{ id: 0, value: 2 }], 'expert'),
  { tokenIdx: 1, id: 0 }
);
console.log('PASS: expert bot avoids an immediately threatened destination');

// Prefer capturing the opponent token that has advanced furthest.
s = engine.createGame(['red', 'yellow', 'blue']);
s.tokens.red = [2, 8, -1, -1];
s.tokens.yellow[0] = 37; // yellow at abs 11
s.tokens.blue[0] = 18; // blue at abs 5, less advanced than yellow
assert.deepStrictEqual(
  chooseTurnMove(s, 'red', [{ id: 0, value: 3 }], 'expert'),
  { tokenIdx: 1, id: 0 }
);
console.log("PASS: expert prioritizes capturing the opponent's most advanced token");

// Expert takes a legal capture over a non-winning move into home.
s = engine.createGame(['red', 'yellow']);
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red = [2, 54, -1, -1];
s.tokens.yellow[0] = 31;
assert.deepStrictEqual(
  chooseTurnMove(s, 'red', [{ id: 0, value: 1 }, { id: 1, value: 3 }], 'expert'),
  { tokenIdx: 0, id: 1 }
);
console.log('PASS: expert always captures when a legal capture is available');

// Expert can use both dice in sequence to reach and capture a target seven spaces away.
s = engine.createGame(['red', 'yellow']);
s.tokens.red[0] = 2;
s.tokens.yellow[0] = 35;
const capturePair = findCaptureDicePair(s, 'red');
assert.strictEqual(capturePair[0] + capturePair[1], 7);
let captureDiceOptions = capturePair.map((value, id) => ({ id, value }));
let capturedInTurn = false;
while (captureDiceOptions.length > 0) {
  const plannedMove = chooseTurnMove(s, 'red', captureDiceOptions, 'expert');
  if (!plannedMove) break;
  const option = captureDiceOptions.find(({ id }) => id === plannedMove.id);
  const result = engine.applyMove(s, 'red', plannedMove.tokenIdx, option.value);
  capturedInTurn = capturedInTurn || result.captured.length > 0;
  captureDiceOptions = captureDiceOptions.filter(({ id }) => id !== plannedMove.id);
}
assert.ok(capturedInTurn, 'expert should capture using a two-die sequence');
console.log('PASS: expert forces paired dice to capture targets beyond one-die range');

// Before unlocking the home lane, expert moves toward opponents it can capture.
s = engine.createGame(['red', 'yellow']);
s.tokens.red = [10, 35, -1, -1];
s.tokens.yellow[0] = 41; // yellow at abs 15; red at 11 can reach it with a future roll
assert.deepStrictEqual(
  chooseTurnMove(s, 'red', [{ id: 0, value: 1 }], 'expert'),
  { tokenIdx: 0, id: 0 }
);
console.log('PASS: expert sets up a capture before unlocking its home lane');

// Expert plans against the opponent's next fair roll, including an immediate win.
s = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
s.captures.yellow = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.yellow[0] = 54;
assert.ok(
  evaluateExpertReply(s, 'red') < -10000,
  'expert reply evaluation should heavily penalize an opponent winning next turn'
);
console.log('PASS: expert evaluates opponent replies and imminent wins');

// Quick 1v1 bot recognizes finishing one token as a win.
s = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red = [54, 10, -1, -1];
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot chooses the winning move in Quick 1v1');

// Multi-dice planning finds a sequence that wins with the available dice.
s = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red[0] = 54;
let diceOptions = [
  { id: 0, value: 2 },
  { id: 1, value: 3 },
];
const originalRandom = Math.random;
Math.random = () => 0;
try {
  while (!s.winner && diceOptions.length > 0) {
    const plannedMove = chooseTurnMove(s, 'red', diceOptions, 'expert');
    assert.ok(plannedMove, 'planner should return a move while a winning sequence exists');
    const option = diceOptions.find(({ id }) => id === plannedMove.id);
    assert.ok(option, 'planner should return an available die');
    engine.applyMove(s, 'red', plannedMove.tokenIdx, option.value);
    diceOptions = diceOptions.filter(({ id }) => id !== plannedMove.id);
  }
} finally {
  Math.random = originalRandom;
}
assert.strictEqual(s.winner, 'red');
console.log('PASS: multi-dice planner finds a winning sequence');

// Hard and expert use the same search without depending on randomness.
const noRandomGame = engine.createGame(['red', 'yellow']);
noRandomGame.tokens.red = [0, 1, -1, -1];
noRandomGame.tokens.yellow[0] = 0;
const originalRandomForHardTest = Math.random;
try {
  Math.random = () => { throw new Error('Hard move selection must be deterministic'); };
  const hardPlan = chooseTurnMove(noRandomGame, 'red', [{ id: 0, value: 1 }], 'hard');
  assert.deepStrictEqual(hardPlan, { tokenIdx: 1, id: 0 });
  assert.deepStrictEqual(
    chooseTurnMove(noRandomGame, 'red', [{ id: 0, value: 1 }], 'expert'),
    hardPlan
  );
  assert.ok(Number.isInteger(chooseMove(noRandomGame, 'red', 1, 'hard')));
} finally {
  Math.random = originalRandomForHardTest;
}
console.log('PASS: hard and expert use the same deterministic search plan');

// Hard and expert choose the best-scored plan; lower levels retain some randomness.
const quickGame = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
quickGame.tokens.red = [0, 1, -1, -1];
quickGame.tokens.yellow[0] = 0;
const normalGame = { ...quickGame, tokensToWin: 4 };
const originalRandomForQuickTest = Math.random;
try {
  for (const [level, quickThreshold] of [
    ['expert', 0.999],
    ['hard', 0.999],
    ['medium', 0.749],
    ['easy', 0.229],
    ['takeover', 0.099],
  ]) {
    Math.random = () => quickThreshold;
    assert.deepStrictEqual(
      chooseTurnMove(quickGame, 'red', [{ id: 0, value: 1 }], level),
      { tokenIdx: 1, id: 0 },
      `Quick ${level} should select the best-scored plan at its configured threshold`
    );
    Math.random = () => 0.999;
    const expectedTokenIdx = ['expert', 'hard'].includes(level) ? 1 : 0;
    assert.deepStrictEqual(
      chooseTurnMove(normalGame, 'red', [{ id: 0, value: 1 }], level),
      { tokenIdx: expectedTokenIdx, id: 0 },
      `Normal ${level} should use the expected plan selection`
    );
  }
} finally {
  Math.random = originalRandomForQuickTest;
}
console.log('PASS: hard and expert select the best plan while lower levels retain randomness');

// Test 3: bot returns null when it has no moves
s = engine.createGame(['red', 'yellow']);
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), null);
console.log('PASS: bot returns null with no moves');

// Simulation: 1 bot (red) vs 3 random players
function playGame(botLevel) {
  const game = engine.createGame(['red', 'green', 'yellow', 'blue']);
  let turns = 0;
  while (!game.winner && turns < 100000) {
    const color = game.turn;
    const dice = engine.rollDice();
    let idx;
    if (color === 'red') {
      idx = chooseMove(game, color, dice, botLevel);
    } else {
      const moves = engine.getValidMoves(game, color, dice);
      idx = moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
    }
    let extra = false;
    if (idx !== null) extra = engine.applyMove(game, color, idx, dice).extraTurn;
    engine.nextTurn(game, extra);
    turns++;
  }
  return game.winner;
}

const GAMES = 300;
for (const level of ['easy', 'medium', 'hard']) {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) if (playGame(level) === 'red') wins++;
  console.log(`${level} bot won ${wins}/${GAMES} (${((wins / GAMES) * 100).toFixed(0)}%) vs 3 random players`);
}
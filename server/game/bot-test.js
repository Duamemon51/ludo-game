const assert = require('assert');
const engine = require('./engine');
const { chooseMove, chooseTurnMove, evaluateExpertReply } = require('./bot');

// Test 1: bot prefers a capture
let s = engine.createGame(['red', 'yellow']);
s.tokens.red = [2, 20, -1, -1];
s.tokens.yellow = [31, -1, -1, -1]; // yellow at abs 5
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot captures when it can');

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

// Quick and Normal difficulties keep distinct plan-selection strengths.
const quickGame = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
quickGame.tokens.red = [0, 1, -1, -1];
quickGame.tokens.yellow[0] = 0;
const normalGame = { ...quickGame, tokensToWin: 4 };
const originalRandomForQuickTest = Math.random;
try {
  for (const [level, quickThreshold] of [
    ['expert', 0.999],
    ['hard', 0.729],
    ['medium', 0.469],
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
    const expectedTokenIdx = level === 'expert' ? 1 : 0;
    assert.deepStrictEqual(
      chooseTurnMove(normalGame, 'red', [{ id: 0, value: 1 }], level),
      { tokenIdx: expectedTokenIdx, id: 0 },
      `Normal ${level} should use the expected plan selection`
    );
  }
} finally {
  Math.random = originalRandomForQuickTest;
}
console.log('PASS: difficulty levels use distinct Quick and Normal plan selection');

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
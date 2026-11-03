const assert = require('assert');
const engine = require('./engine');

// Test 1: capture on a normal square
let s = engine.createGame(['red', 'yellow']);
s.tokens.red = [2, -1, -1, -1];     // red at abs 2
s.tokens.yellow = [31, -1, -1, -1]; // yellow at abs (26+31)%52 = 5
let r = engine.applyMove(s, 'red', 0, 3); // red moves to abs 5
assert.strictEqual(r.captured.length, 1);
assert.strictEqual(s.tokens.yellow[0], -1);
console.log('PASS: capture works');

// Test 2: no capture on a safe square
s = engine.createGame(['red', 'yellow']);
s.tokens.red = [5, -1, -1, -1];     // moves to abs 8 (safe)
s.tokens.yellow = [34, -1, -1, -1]; // yellow at abs (26+34)%52 = 8
r = engine.applyMove(s, 'red', 0, 3);
assert.strictEqual(r.captured.length, 0);
assert.strictEqual(s.tokens.yellow[0], 34);
console.log('PASS: safe square protects');

// Test 3: leaving base needs a 6
s = engine.createGame(['red', 'yellow']);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 3), []);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 6), [0, 1, 2, 3]);
console.log('PASS: base exit needs a 6');

// Test 4: cannot overshoot the finish
s = engine.createGame(['red', 'yellow']);
s.tokens.red = [54, -1, -1, -1];
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 3), []);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 2), [0]);
console.log('PASS: no overshoot');

// Simulation: random full game
const game = engine.createGame(['red', 'green', 'yellow', 'blue']);
let turns = 0;
while (!game.winner && turns < 100000) {
  const color = game.turn;
  const dice = engine.rollDice();
  const moves = engine.getValidMoves(game, color, dice);
  let extra = false;
  if (moves.length) {
    const idx = moves[Math.floor(Math.random() * moves.length)];
    extra = engine.applyMove(game, color, idx, dice).extraTurn;
  }
  engine.nextTurn(game, extra);
  turns++;
}
console.log('Winner:', game.winner, 'after', turns, 'turns');
console.log('Final tokens:', game.tokens);
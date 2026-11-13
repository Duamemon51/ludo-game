const assert = require('assert');
const engine = require('./engine');

// Test 1: capture on a normal square
let s = engine.createGame(['red', 'yellow']);
s.tokens.red = [2, -1, -1, -1];     // red at abs 2
s.tokens.yellow = [31, -1, -1, -1]; // yellow at abs (26+31)%52 = 5
let r = engine.applyMove(s, 'red', 0, 3); // red moves to abs 5
assert.strictEqual(r.captured.length, 1);
assert.strictEqual(s.tokens.yellow[0], -1);
assert.strictEqual(s.tokens.red[0], 5);
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
s.tokens.red = [55, -1, -1, -1];
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 3), []);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 2), [0]);
console.log('PASS: no overshoot');

// Test 5: without a capture, players keep circling the 52-square track
s = engine.createGame(['red', 'yellow']);
s.tokens.red[0] = 50;
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 4), [0]);
r = engine.applyMove(s, 'red', 0, 4);
assert.strictEqual(s.tokens.red[0], 2);
assert.strictEqual(s.captures.red, 0);
assert.strictEqual(r.reachedFinish, false);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 2), [0]);
console.log('PASS: track wraps until the player captures');

// A token past the gate must finish another lap after a teammate unlocks home.
s = engine.createGame(['red', 'yellow']);
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red[0] = 51;
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 1), [0]);
r = engine.applyMove(s, 'red', 0, 1);
assert.strictEqual(s.tokens.red[0], 0);
s.tokens.red[0] = 50;
r = engine.applyMove(s, 'red', 0, 1);
assert.strictEqual(s.tokens.red[0], 52);
console.log('PASS: a token at 51 loops before entering an unlocked home lane');

// A first capture unlocks the home lane without teleporting the token there.
s = engine.createGame(['red', 'yellow']);
s.tokens.red[0] = 2;
s.tokens.yellow[0] = 31; // red can capture yellow by moving from 2 to 5
r = engine.applyMove(s, 'red', 0, 3);
assert.strictEqual(r.captured.length, 1);
assert.strictEqual(s.captures.red, engine.CAPTURES_TO_UNLOCK_HOME);
assert.strictEqual(s.tokens.red[0], 5);
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 2), [0]);
r = engine.applyMove(s, 'red', 0, 2);
assert.strictEqual(s.tokens.red[0], 7);
console.log('PASS: capture unlocks the home lane without teleporting');

// After a capture, tokens follow the track to the home gate before entering the lane.
s = engine.createGame(['red', 'yellow']);
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red[0] = 18;
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 3), [0]);
r = engine.applyMove(s, 'red', 0, 3);
assert.strictEqual(s.tokens.red[0], 21);
s.tokens.red[0] = 49;
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 2), [0]);
r = engine.applyMove(s, 'red', 0, 2);
assert.strictEqual(s.tokens.red[0], 52);
s.tokens.red[0] = 50;
assert.deepStrictEqual(engine.getValidMoves(s, 'red', 1), [0]);
r = engine.applyMove(s, 'red', 0, 1);
assert.strictEqual(s.tokens.red[0], 52);
console.log('PASS: after a capture, tokens skip the final track square when entering home');

// Quick 1v1 is won when the first token reaches the finish.
s = engine.createGame(['red', 'yellow'], { tokensToWin: 1 });
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red[0] = 52;
s.tokens.red[1] = 12;
r = engine.applyMove(s, 'red', 0, 5);
assert.strictEqual(s.tokens.red[0], engine.FINISH);
assert.strictEqual(s.winner, 'red');
assert.notStrictEqual(s.tokens.red[1], engine.FINISH);
console.log('PASS: Quick 1v1 is won by finishing one token');

// Regular 1v1 keeps the default four-token victory rule.
s = engine.createGame(['red', 'yellow']);
s.captures.red = engine.CAPTURES_TO_UNLOCK_HOME;
s.tokens.red[0] = 52;
r = engine.applyMove(s, 'red', 0, 5);
assert.strictEqual(s.tokens.red[0], engine.FINISH);
assert.strictEqual(s.winner, null);
for (let i = 1; i < 4; i++) {
  s.tokens.red[i] = 56;
  r = engine.applyMove(s, 'red', i, 1);
}
assert.strictEqual(s.winner, 'red');
console.log('PASS: regular 1v1 requires four tokens to finish');

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
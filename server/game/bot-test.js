const assert = require('assert');
const engine = require('./engine');
const { chooseMove } = require('./bot');

// Test 1: bot prefers a capture
let s = engine.createGame(['red', 'yellow']);
s.tokens.red = [2, 20, -1, -1];
s.tokens.yellow = [31, -1, -1, -1]; // yellow at abs 5
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot captures when it can');

// Test 2: bot prefers reaching home
s = engine.createGame(['red', 'yellow']);
s.tokens.red = [53, 10, -1, -1];
assert.strictEqual(chooseMove(s, 'red', 3, 'hard'), 0);
console.log('PASS: bot goes home when it can');

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
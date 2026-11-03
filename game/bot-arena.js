const engine = require('./engine');
const { chooseMove } = require('./bot');

function randomMove(state, color, dice) {
  const moves = engine.getValidMoves(state, color, dice);
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
}

function play(levelA, levelB, aColor) {
  const game = engine.createGame(['red', 'yellow']);
  let turns = 0;
  while (!game.winner && turns < 20000) {
    const color = game.turn;
    const level = color === aColor ? levelA : levelB;
    const dice = engine.rollDice();
    const idx = level === 'random' ? randomMove(game, color, dice) : chooseMove(game, color, dice, level);
    let extra = false;
    if (idx !== null) extra = engine.applyMove(game, color, idx, dice).extraTurn;
    engine.nextTurn(game, extra);
    turns++;
  }
  return game.winner;
}

function match(levelA, levelB, games) {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const aColor = i % 2 === 0 ? 'red' : 'yellow';
    if (play(levelA, levelB, aColor) === aColor) wins++;
  }
  console.log(`${levelA} vs ${levelB}: ${levelA} won ${wins}/${games} (${Math.round((wins / games) * 100)}%)`);
}

const GAMES = Number(process.argv[2]) || 30;
match('medium', 'random', GAMES);
match('hard', 'medium', GAMES);
match('expert', 'medium', GAMES);
match('expert', 'hard', GAMES);
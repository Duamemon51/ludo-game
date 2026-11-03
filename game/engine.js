const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47]; // absolute safe squares
const BASE = -1;
const LAST_TRACK = 50;
const FINISH = 56;

// Create a new game for the given colors, e.g. ['red', 'yellow']
function createGame(colors) {
  const tokens = {};
  colors.forEach((c) => (tokens[c] = [BASE, BASE, BASE, BASE]));
  return { colors, tokens, turn: colors[0], winner: null };
}

// Dice is always rolled on the server
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// Convert a color's relative position (0-50) to the shared board square (0-51)
function toAbs(color, rel) {
  return (START[color] + rel) % 52;
}

// Which tokens can move with this dice value? Returns token indexes.
function getValidMoves(state, color, dice) {
  const moves = [];
  state.tokens[color].forEach((pos, i) => {
    if (pos === BASE) {
      if (dice === 6) moves.push(i);
    } else if (pos + dice <= FINISH) {
      moves.push(i);
    }
  });
  return moves;
}

// Apply a move. Returns { captured, reachedFinish, extraTurn }
function applyMove(state, color, tokenIdx, dice) {
  const mine = state.tokens[color];
  const from = mine[tokenIdx];
  const to = from === BASE ? 0 : from + dice;
  mine[tokenIdx] = to;

  // Capture: only on the main track and not on a safe square
  const captured = [];
  if (to <= LAST_TRACK) {
    const abs = toAbs(color, to);
    if (!SAFE.includes(abs)) {
      for (const other of state.colors) {
        if (other === color) continue;
        state.tokens[other].forEach((p, i) => {
          if (p >= 0 && p <= LAST_TRACK && toAbs(other, p) === abs) {
            state.tokens[other][i] = BASE;
            captured.push({ color: other, tokenIdx: i });
          }
        });
      }
    }
  }

  const reachedFinish = to === FINISH;
  if (mine.every((p) => p === FINISH)) state.winner = color;

  // Extra turn on a 6, a capture, or reaching home
  const extraTurn = dice === 6 || captured.length > 0 || reachedFinish;
  return { captured, reachedFinish, extraTurn };
}

// Pass the turn on (or keep it if the player earned an extra turn)
function nextTurn(state, extraTurn) {
  if (extraTurn && !state.winner) return;
  const i = state.colors.indexOf(state.turn);
  state.turn = state.colors[(i + 1) % state.colors.length];
}

module.exports = {
  COLORS, START, SAFE, BASE, FINISH,
  createGame, rollDice, toAbs, getValidMoves, applyMove, nextTurn,
};
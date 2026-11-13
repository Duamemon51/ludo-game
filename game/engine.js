const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47]; // absolute safe squares
const BASE = -1;
const LAST_TRACK = 51;
const FINISH = 57;
const CAPTURES_TO_UNLOCK_HOME = 1;

// Create a new game for the given colors, e.g. ['red', 'yellow']
function createGame(colors, { tokensToWin = 4 } = {}) {
  const tokens = {};
  const captures = {};
  colors.forEach((c) => {
    tokens[c] = [BASE, BASE, BASE, BASE];
    captures[c] = 0;
  });
  return { colors, tokens, captures, tokensToWin, turn: colors[0], winner: null };
}

// Dice is always rolled on the server
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// Convert a color's relative position (0-51) to the shared board square (0-51)
function toAbs(color, rel) {
  return (START[color] + rel) % 52;
}

function getMoveDestination(state, color, from, dice) {
  if (from === BASE) return 0;
  const to = from + dice;
  if (state.captures[color] < CAPTURES_TO_UNLOCK_HOME && from <= LAST_TRACK) {
    return to % (LAST_TRACK + 1);
  }
  if (from === LAST_TRACK) return to % (LAST_TRACK + 1);
  if (from <= LAST_TRACK - 1 && to > LAST_TRACK - 1) return to + 1;
  return to;
}

// Which tokens can move with this dice value? Returns token indexes.
function getValidMoves(state, color, dice) {
  const moves = [];
  state.tokens[color].forEach((pos, i) => {
    if (pos === BASE) {
      if (dice === 6) moves.push(i);
    } else {
      const to = getMoveDestination(state, color, pos, dice);
      if (to <= FINISH) moves.push(i);
    }
  });
  return moves;
}

// Apply a move. A capture unlocks the home lane but does not move the capturing token.
function applyMove(state, color, tokenIdx, dice) {
  const mine = state.tokens[color];
  const from = mine[tokenIdx];
  const to = getMoveDestination(state, color, from, dice);
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

  state.captures[color] += captured.length;
  const reachedFinish = mine[tokenIdx] === FINISH;
  if (mine.filter((p) => p === FINISH).length >= state.tokensToWin) state.winner = color;

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
  COLORS, START, SAFE, BASE, LAST_TRACK, FINISH,
  CAPTURES_TO_UNLOCK_HOME,
  createGame, rollDice, toAbs, getMoveDestination, getValidMoves, applyMove, nextTurn,
};
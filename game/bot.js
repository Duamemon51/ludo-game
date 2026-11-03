const { SAFE, BASE, FINISH, toAbs, getValidMoves, applyMove, nextTurn } = require('./engine');

const LAST_TRACK = 50;
// Time budget for the expert bot (ms). Override with the LUDO_BOT_MS environment variable.
const EXPERT_MS = Number(process.env.LUDO_BOT_MS) || 350;

/* ------------------------------------------------------------------ */
/*  Simple scoring bot (used for easy / medium)                        */
/* ------------------------------------------------------------------ */

function isThreatened(state, color, rel) {
  if (rel < 0 || rel > LAST_TRACK) return false;
  const abs = toAbs(color, rel);
  if (SAFE.includes(abs)) return false;
  for (const other of state.colors) {
    if (other === color) continue;
    for (const p of state.tokens[other]) {
      if (p < 0 || p > LAST_TRACK) continue;
      const distance = (abs - toAbs(other, p) + 52) % 52;
      if (distance >= 1 && distance <= 6) return true;
    }
  }
  return false;
}

function capturesAt(state, color, to) {
  if (to > LAST_TRACK) return 0;
  const abs = toAbs(color, to);
  if (SAFE.includes(abs)) return 0;
  let count = 0;
  for (const other of state.colors) {
    if (other === color) continue;
    for (const p of state.tokens[other]) {
      if (p >= 0 && p <= LAST_TRACK && toAbs(other, p) === abs) count++;
    }
  }
  return count;
}

function scoreMove(state, color, tokenIdx, dice) {
  const from = state.tokens[color][tokenIdx];
  const to = from === BASE ? 0 : from + dice;
  let score = 0;
  score += capturesAt(state, color, to) * 50;
  if (to === FINISH) score += 40;
  if (from === BASE) score += 30;
  if (to <= LAST_TRACK && SAFE.includes(toAbs(color, to))) score += 20;
  if (to > LAST_TRACK && to < FINISH) score += 15;
  if (isThreatened(state, color, from)) score += 25;
  if (isThreatened(state, color, to)) score -= 30;
  score += dice;
  return score;
}

function scoringMove(state, color, dice, moves) {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const i of moves) {
    const s = scoreMove(state, color, i, dice) + Math.random() * 2;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Look-ahead bot (used for hard / expert)                            */
/* ------------------------------------------------------------------ */

function cloneState(state) {
  const tokens = {};
  for (const c of state.colors) tokens[c] = state.tokens[c].slice();
  return { colors: state.colors, tokens, turn: state.turn, winner: state.winner };
}

// Chance that this token is captured on the opponents' next roll.
// Each distinct dice value that lets an opponent land on it is a 1/6 chance.
function hitRisk(state, color, rel) {
  if (rel < 0 || rel > LAST_TRACK) return 0;
  const abs = toAbs(color, rel);
  if (SAFE.includes(abs)) return 0;
  const hits = new Set();
  for (const other of state.colors) {
    if (other === color) continue;
    for (const p of state.tokens[other]) {
      if (p < 0 || p > LAST_TRACK) continue;
      const d = (abs - toAbs(other, p) + 52) % 52;
      if (d >= 1 && d <= 6 && p + d <= LAST_TRACK) hits.add(d);
    }
  }
  return hits.size / 6;
}

function tokenValue(pos) {
  if (pos === BASE) return 0;
  if (pos === FINISH) return 85; // finished tokens can never be lost
  return pos + 1 + 8;            // progress + bonus for being out of base
}

function sideScore(state, color) {
  let s = 0;
  for (const pos of state.tokens[color]) {
    const v = tokenValue(pos);
    s += v;
    if (pos >= 0 && pos < FINISH) {
      if (pos > LAST_TRACK) s += 4;                             // home lane: untouchable
      else if (SAFE.includes(toAbs(color, pos))) s += 3;        // safe square
      else s -= v * hitRisk(state, color, pos) * 0.9;           // expected loss if captured
    }
  }
  return s;
}

// Higher = better for `me`. Compares me with the average and strongest opponent.
function evaluate(state, me) {
  const opps = state.colors.filter((c) => c !== me);
  let sum = 0;
  let best = -Infinity;
  for (const c of opps) {
    const s = sideScore(state, c);
    sum += s;
    if (s > best) best = s;
  }
  return sideScore(state, me) - 0.6 * (sum / opps.length) - 0.4 * best;
}

// Expected value of a position before the next dice roll
function chanceValue(state, depth, me, ctx) {
  if (state.winner) return state.winner === me ? 100000 + depth : -100000 - depth;
  if (depth === 0) return evaluate(state, me);
  if (Date.now() > ctx.deadline) {
    ctx.timedOut = true;
    return evaluate(state, me);
  }

  const color = state.turn;
  const maximizing = color === me;
  let total = 0;

  for (let dice = 1; dice <= 6; dice++) {
    const moves = getValidMoves(state, color, dice);
    if (moves.length === 0) {
      const next = cloneState(state);
      nextTurn(next, false);
      total += chanceValue(next, depth - 1, me, ctx);
      continue;
    }
    let best = maximizing ? -Infinity : Infinity;
    for (const idx of moves) {
      const next = cloneState(state);
      const { extraTurn } = applyMove(next, color, idx, dice);
      nextTurn(next, extraTurn);
      const v = chanceValue(next, depth - 1, me, ctx);
      if (maximizing ? v > best : v < best) best = v;
    }
    total += best;
  }
  return total / 6;
}

// Iterative deepening: search 1 turn deep, then 2, then 3...
// Keep the answer from the deepest search that finished inside the time budget.
function searchMove(state, color, dice, moves, maxDepth, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let bestMove = scoringMove(state, color, dice, moves); // fallback

  for (let depth = 1; depth <= maxDepth; depth++) {
    const ctx = { deadline, timedOut: false };
    let depthBest = null;
    let depthBestVal = -Infinity;

    for (const idx of moves) {
      const next = cloneState(state);
      const { extraTurn } = applyMove(next, color, idx, dice);
      nextTurn(next, extraTurn);
      const v = chanceValue(next, depth, color, ctx);
      if (v > depthBestVal) {
        depthBestVal = v;
        depthBest = idx;
      }
    }
    if (ctx.timedOut) break; // incomplete search: discard it
    bestMove = depthBest;
  }
  return bestMove;
}

/* ------------------------------------------------------------------ */

// Returns the token index to move, or null if there is no valid move
function chooseMove(state, color, dice, level = 'medium') {
  const moves = getValidMoves(state, color, dice);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  if (level === 'expert') return searchMove(state, color, dice, moves, 8, EXPERT_MS);
  if (level === 'hard') return searchMove(state, color, dice, moves, 2, 120);

  if (level === 'easy' && Math.random() < 0.3) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  return scoringMove(state, color, dice, moves);
}

module.exports = { chooseMove, scoreMove, isThreatened };
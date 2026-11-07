const {
  SAFE,
  BASE,
  LAST_TRACK,
  FINISH,
  toAbs,
  getMoveDestination,
  getValidMoves,
  applyMove,
  nextTurn,
} = require('./engine');

// Expert bot time budget.
const EXPERT_MS = Number(process.env.LUDO_BOT_MS) || 350;

/* -------------------------------------------------- */
/* Difficulty settings                                */
/* -------------------------------------------------- */

const LEVEL_STRENGTH = {
  expert: 0.95,
  hard: 0.75,
  medium: 0.50,
  easy: 0.25,
  takeover: 0.25,
};

const QUICK_LEVEL_STRENGTH = {
  expert: 1,
  hard: 0.73,
  medium: 0.47,
  easy: 0.23,
};

const NORMAL_LEVEL_STRENGTH = {
  expert: 0.88,
  hard: 0.60,
  medium: 0.41,
  easy: 0.25,
};

function normalizeLevel(level = 'medium') {
  return LEVEL_STRENGTH[level] !== undefined ? level : 'medium';
}

/*
 * With the configured probability, select the highest-scoring move.
 * Otherwise, select a random alternative.
 *
 * These are move-selection probabilities, not guaranteed match win rates.
 */
function selectPlan(candidates, level = 'medium', strengthOverride) {
  if (!candidates || candidates.length === 0) return null;

  candidates.sort((a, b) => b.value - a.value);

  const best = candidates[0];
  const strength = strengthOverride ?? LEVEL_STRENGTH[normalizeLevel(level)];

  if (candidates.length === 1 || Math.random() < strength) {
    return best;
  }

  const alternatives = candidates.slice(1);

  return alternatives[
    Math.floor(Math.random() * alternatives.length)
  ];
}

/* -------------------------------------------------- */
/* Threat and capture detection                       */
/* -------------------------------------------------- */

function isThreatened(state, color, rel) {
  if (rel < 0 || rel > LAST_TRACK) return false;

  const abs = toAbs(color, rel);

  if (SAFE.includes(abs)) return false;

  for (const other of state.colors) {
    if (other === color) continue;

    for (const p of state.tokens[other]) {
      if (p < 0 || p > LAST_TRACK) continue;

      const distance =
        (abs - toAbs(other, p) + 52) % 52;

      if (distance >= 1 && distance <= 6) {
        return true;
      }
    }
  }

  return false;
}

function capturesAt(state, color, to) {
  if (to > LAST_TRACK || to < 0) return 0;

  const abs = toAbs(color, to);

  if (SAFE.includes(abs)) return 0;

  let count = 0;

  for (const other of state.colors) {
    if (other === color) continue;

    for (const p of state.tokens[other]) {
      if (
        p >= 0 &&
        p <= LAST_TRACK &&
        toAbs(other, p) === abs
      ) {
        count++;
      }
    }
  }

  return count;
}

/* -------------------------------------------------- */
/* Move scoring                                       */
/* -------------------------------------------------- */

function scoreMove(state, color, tokenIdx, dice) {
  const from = state.tokens[color][tokenIdx];

  const to = getMoveDestination(
    state,
    color,
    from,
    dice
  );

  let score = 0;

  // Capture opponent tokens.
  score += capturesAt(state, color, to) * 50;

  // Finish a token.
  if (to === FINISH) {
    score += 40;
  }

  // Bring a token out of base.
  if (from === BASE) {
    score += 30;
  }

  // Reach a safe square.
  if (
    to >= 0 &&
    to <= LAST_TRACK &&
    SAFE.includes(toAbs(color, to))
  ) {
    score += 20;
  }

  // Move into home lane.
  if (to > LAST_TRACK && to < FINISH) {
    score += 15;
  }

  // Move a threatened token away.
  if (isThreatened(state, color, from)) {
    score += 25;
  }

  // Avoid landing on a threatened square.
  if (isThreatened(state, color, to)) {
    score -= 30;
  }

  score += dice;

  return score;
}

function scoringMove(state, color, dice, moves) {
  let best = moves[0];
  let bestScore = -Infinity;

  for (const tokenIdx of moves) {
    const score =
      scoreMove(state, color, tokenIdx, dice) +
      Math.random() * 2;

    if (score > bestScore) {
      bestScore = score;
      best = tokenIdx;
    }
  }

  return best;
}

/* -------------------------------------------------- */
/* State cloning                                      */
/* -------------------------------------------------- */

function cloneState(state) {
  const tokens = {};

  for (const color of state.colors) {
    tokens[color] = state.tokens[color].slice();
  }

  return {
    colors: state.colors,
    tokens,
    captures: { ...state.captures },
    tokensToWin: state.tokensToWin,
    turn: state.turn,
    winner: state.winner,
  };
}

/* -------------------------------------------------- */
/* Opponent capture risk                               */
/* -------------------------------------------------- */

function hitRisk(state, color, rel) {
  if (rel < 0 || rel > LAST_TRACK) return 0;

  const abs = toAbs(color, rel);

  if (SAFE.includes(abs)) return 0;

  const hits = new Set();

  for (const other of state.colors) {
    if (other === color) continue;

    for (const p of state.tokens[other]) {
      if (p < 0 || p > LAST_TRACK) continue;

      const distance =
        (abs - toAbs(other, p) + 52) % 52;

      if (
        distance >= 1 &&
        distance <= 6 &&
        getMoveDestination(state, other, p, distance) <= LAST_TRACK
      ) {
        hits.add(distance);
      }
    }
  }

  return hits.size / 6;
}

/* -------------------------------------------------- */
/* Position evaluation                                */
/* -------------------------------------------------- */

function tokenValue(pos) {
  if (pos === BASE) return 0;

  if (pos === FINISH) {
    return 85;
  }

  return pos + 1 + 8;
}

function sideScore(state, color) {
  let score = 0;

  for (const pos of state.tokens[color]) {
    const value = tokenValue(pos);

    score += value;

    if (pos >= 0 && pos < FINISH) {
      // Home lane is safe.
      if (pos > LAST_TRACK) {
        score += 4;
      }

      // Safe square.
      else if (SAFE.includes(toAbs(color, pos))) {
        score += 3;
      }

      // Possible opponent capture.
      else {
        score -= value * hitRisk(state, color, pos) * 0.9;
      }
    }
  }

  return score;
}

function evaluate(state, me) {
  const opponents = state.colors.filter(
    (color) => color !== me
  );

  let total = 0;
  let strongestOpponent = -Infinity;

  for (const color of opponents) {
    const score = sideScore(state, color);

    total += score;

    if (score > strongestOpponent) {
      strongestOpponent = score;
    }
  }

  if (opponents.length === 0) {
    return sideScore(state, me);
  }

  return (
    sideScore(state, me) -
    0.6 * (total / opponents.length) -
    0.4 * strongestOpponent
  );
}

/* -------------------------------------------------- */
/* Look-ahead search                                  */
/* -------------------------------------------------- */

function chanceValue(state, depth, me, ctx) {
  if (state.winner) {
    return state.winner === me
      ? 100000 + depth
      : -100000 - depth;
  }

  if (depth === 0) {
    return evaluate(state, me);
  }

  if (Date.now() > ctx.deadline) {
    ctx.timedOut = true;
    return evaluate(state, me);
  }

  const color = state.turn;
  const maximizing = color === me;

  let total = 0;

  for (let dice = 1; dice <= 6; dice++) {
    if (Date.now() > ctx.deadline) {
      ctx.timedOut = true;
      return evaluate(state, me);
    }

    const moves = getValidMoves(state, color, dice);

    if (moves.length === 0) {
      const next = cloneState(state);

      nextTurn(next, false);

      total += chanceValue(
        next,
        depth - 1,
        me,
        ctx
      );

      continue;
    }

    let best = maximizing
      ? -Infinity
      : Infinity;

    for (const tokenIdx of moves) {
      const next = cloneState(state);

      const { extraTurn } = applyMove(
        next,
        color,
        tokenIdx,
        dice
      );

      nextTurn(next, extraTurn);

      const value = chanceValue(
        next,
        depth - 1,
        me,
        ctx
      );

      if (maximizing) {
        best = Math.max(best, value);
      } else {
        best = Math.min(best, value);
      }

      if (ctx.timedOut) {
        return evaluate(state, me);
      }
    }

    total += best;
  }

  return total / 6;
}

/* -------------------------------------------------- */
/* Iterative deepening                                */
/* -------------------------------------------------- */

function searchMove(
  state,
  color,
  dice,
  moves,
  maxDepth,
  budgetMs
) {
  const deadline = Date.now() + budgetMs;

  let bestMove = scoringMove(
    state,
    color,
    dice,
    moves
  );

  for (let depth = 1; depth <= maxDepth; depth++) {
    const ctx = {
      deadline,
      timedOut: false,
    };

    let depthBest = null;
    let depthBestValue = -Infinity;

    for (const tokenIdx of moves) {
      if (Date.now() > deadline) {
        ctx.timedOut = true;
        break;
      }

      const next = cloneState(state);

      const { extraTurn } = applyMove(
        next,
        color,
        tokenIdx,
        dice
      );

      nextTurn(next, extraTurn);

      const value = chanceValue(
        next,
        depth,
        color,
        ctx
      );

      if (value > depthBestValue) {
        depthBestValue = value;
        depthBest = tokenIdx;
      }

      if (ctx.timedOut) break;
    }

    // Keep only fully completed searches.
    if (ctx.timedOut || depthBest === null) {
      break;
    }

    bestMove = depthBest;
  }

  return bestMove;
}

/* -------------------------------------------------- */
/* Full-turn planning                                 */
/* -------------------------------------------------- */

/*
 * Plans moves across all currently available dice options.
 *
 * Returns:
 * {
 *   tokenIdx: number,
 *   id: diceOptionId
 * }
 *
 * The server can continue calling this after each move.
 */

function chooseTurnMove(
  state,
  color,
  diceOptions,
  level = 'medium'
) {
  if (!Array.isArray(diceOptions) || diceOptions.length === 0) {
    return null;
  }

  level = normalizeLevel(level);

  const options = diceOptions.map(({ id, value }) => ({
    id,
    value,
  }));

  // Keep the best complete-turn plan for each possible first move.
  const candidateMap = new Map();

  function saveCandidate(firstMove, value) {
    if (!firstMove) return;

    const key = `${firstMove.id}:${firstMove.tokenIdx}`;

    const existing = candidateMap.get(key);

    if (!existing || value > existing.value) {
      candidateMap.set(key, {
        firstMove,
        value,
      });
    }
  }

  function search(
    current,
    remaining,
    firstMove,
    tacticalScore
  ) {
    if (current.winner) {
      saveCandidate(
        firstMove,
        current.winner === color
          ? 100000 + tacticalScore
          : -100000 + tacticalScore
      );

      return;
    }

    const choices = remaining.flatMap((option) =>
      getValidMoves(
        current,
        color,
        option.value
      ).map((tokenIdx) => ({
        ...option,
        tokenIdx,
      }))
    );

    // No remaining usable dice.
    if (choices.length === 0) {
      if (firstMove) {
        saveCandidate(
          firstMove,
          evaluate(current, color) + tacticalScore
        );
      }

      return;
    }

    for (const choice of choices) {
      const next = cloneState(current);

      applyMove(
        next,
        color,
        choice.tokenIdx,
        choice.value
      );

      const nextFirstMove = firstMove || {
        tokenIdx: choice.tokenIdx,
        id: choice.id,
      };

      const moveScore = scoreMove(
        current,
        color,
        choice.tokenIdx,
        choice.value
      );

      const nextRemaining = remaining.filter(
        (option) => option.id !== choice.id
      );

      search(
        next,
        nextRemaining,
        nextFirstMove,
        tacticalScore + moveScore * 0.15
      );
    }
  }

  search(
    state,
    options,
    null,
    0
  );

  const candidates = Array.from(candidateMap.values());
  const strength = state.tokensToWin === 1
    ? QUICK_LEVEL_STRENGTH[level]
    : NORMAL_LEVEL_STRENGTH[level];

  const selected = selectPlan(
    candidates,
    level,
    strength
  );

  return selected
    ? selected.firstMove
    : null;
}

/* -------------------------------------------------- */
/* Single-dice move selection                         */
/* -------------------------------------------------- */

function chooseMove(
  state,
  color,
  dice,
  level = 'medium'
) {
  const moves = getValidMoves(
    state,
    color,
    dice
  );

  if (moves.length === 0) return null;

  if (moves.length === 1) {
    return moves[0];
  }

  level = normalizeLevel(level);

  if (level === 'expert') {
    return searchMove(
      state,
      color,
      dice,
      moves,
      8,
      EXPERT_MS
    );
  }

  if (level === 'hard') {
    return searchMove(
      state,
      color,
      dice,
      moves,
      2,
      120
    );
  }

  const candidates = moves.map((tokenIdx) => ({
    tokenIdx,
    value: scoreMove(
      state,
      color,
      tokenIdx,
      dice
    ),
  }));

  const selected = selectPlan(
    candidates,
    level
  );

  return selected
    ? selected.tokenIdx
    : moves[0];
}

/* -------------------------------------------------- */
/* Exports                                            */
/* -------------------------------------------------- */

module.exports = {
  chooseMove,
  chooseTurnMove,
  scoreMove,
  isThreatened,
  LEVEL_STRENGTH,
};
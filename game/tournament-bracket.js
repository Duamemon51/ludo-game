const TOURNAMENT_SIZE = 8;
const MAX_HUMANS = TOURNAMENT_SIZE - 1;
const BOT_LEVELS = ['expert', 'hard', 'medium'];

function allocateBotLevels(humanCount) {
  if (!Number.isInteger(humanCount) || humanCount < 1 || humanCount > MAX_HUMANS) {
    throw new RangeError(`A tournament needs between 1 and ${MAX_HUMANS} human players.`);
  }

  const botCount = TOURNAMENT_SIZE - humanCount;
  const levels = ['expert'];
  const hardCount = botCount === 2 ? 1 : Math.min(2, Math.max(0, botCount - 2));
  for (let count = 0; count < hardCount; count += 1) levels.push('hard');
  while (levels.length < botCount) levels.push('medium');
  return levels;
}

function buildParticipants(humans, makeBot, random = Math.random) {
  if (!Array.isArray(humans) || humans.length < 1 || humans.length > MAX_HUMANS) {
    throw new RangeError(`A tournament needs between 1 and ${MAX_HUMANS} human players.`);
  }

  const participants = humans.map((human) => ({ ...human, isBot: false, level: null }));
  for (const level of allocateBotLevels(humans.length)) {
    participants.push({ ...makeBot(level), isBot: true, level, playerId: null });
  }

  for (let index = participants.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [participants[index], participants[swapIndex]] = [participants[swapIndex], participants[index]];
  }

  return participants.map((participant, index) => ({ ...participant, slot: index + 1 }));
}

function createRoundPairs(round, winners) {
  if (!Number.isInteger(round) || round < 1 || round > 3 || !Array.isArray(winners)) {
    throw new RangeError('A tournament round must be between 1 and 3.');
  }

  const expectedWinners = TOURNAMENT_SIZE / (2 ** (round - 1));
  if (winners.length !== expectedWinners) {
    throw new RangeError(`Round ${round} needs ${expectedWinners} participant slots.`);
  }

  return Array.from({ length: expectedWinners / 2 }, (_, index) => [
    winners[index * 2],
    winners[index * 2 + 1],
  ]);
}

function nextRoundMatches(round, completedMatches) {
  if (!Array.isArray(completedMatches) || completedMatches.length !== (round === 1 ? 4 : round === 2 ? 2 : 1)) {
    return null;
  }
  if (completedMatches.some((match) => match.status !== 'COMPLETED' || !Number.isInteger(match.winner_slot))) {
    return null;
  }
  if (round === 3) return [];

  const pairs = createRoundPairs(round + 1, completedMatches
    .slice()
    .sort((left, right) => left.match_no - right.match_no)
    .map((match) => match.winner_slot));
  return pairs.map(([player1Slot, player2Slot], index) => ({
    round_no: round + 1,
    match_no: index + 1,
    player1_slot: player1Slot,
    player2_slot: player2Slot,
    status: 'WAITING',
  }));
}

module.exports = {
  BOT_LEVELS,
  MAX_HUMANS,
  TOURNAMENT_SIZE,
  allocateBotLevels,
  buildParticipants,
  createRoundPairs,
  nextRoundMatches,
};

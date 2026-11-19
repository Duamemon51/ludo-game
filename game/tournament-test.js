const assert = require('node:assert/strict');
const { calculateWager } = require('./wager');
const {
  allocateBotLevels,
  buildParticipants,
  createRoundPairs,
  nextRoundMatches,
} = require('./tournament-bracket');
const { createTournament, TournamentError } = require('./tournament-store');

assert.deepEqual(allocateBotLevels(7), ['expert']);
assert.deepEqual(allocateBotLevels(6), ['expert', 'hard']);
assert.deepEqual(allocateBotLevels(5), ['expert', 'hard', 'medium']);
assert.deepEqual(allocateBotLevels(4), ['expert', 'hard', 'hard', 'medium']);
assert.deepEqual(allocateBotLevels(3), ['expert', 'hard', 'hard', 'medium', 'medium']);
assert.deepEqual(allocateBotLevels(1), ['expert', 'hard', 'hard', 'medium', 'medium', 'medium', 'medium']);
assert.throws(() => allocateBotLevels(0), RangeError);
assert.throws(() => allocateBotLevels(8), RangeError);
console.log('PASS: bot allocation keeps eight seats and always includes one expert');

const participants = buildParticipants(
  Array.from({ length: 5 }, (_, index) => ({
    name: `Player ${index + 1}`,
    playerId: String(index + 1),
  })),
  (level) => ({ name: `${level} bot` }),
  () => 0
);
assert.equal(participants.length, 8);
assert.equal(new Set(participants.map(({ slot }) => slot)).size, 8);
assert.equal(participants.filter(({ isBot, level }) => isBot && level === 'expert').length, 1);
assert.equal(participants.filter(({ isBot }) => !isBot).length, 5);
console.log('PASS: participant allocation creates eight uniquely slotted entrants');

assert.deepEqual(createRoundPairs(1, [1, 2, 3, 4, 5, 6, 7, 8]), [
  [1, 2], [3, 4], [5, 6], [7, 8],
]);
assert.deepEqual(createRoundPairs(2, [2, 4, 6, 8]), [[2, 4], [6, 8]]);
assert.deepEqual(createRoundPairs(3, [4, 8]), [[4, 8]]);

const quarterFinals = [
  { match_no: 1, status: 'COMPLETED', winner_slot: 2 },
  { match_no: 2, status: 'IN_PROGRESS', winner_slot: null },
  { match_no: 3, status: 'COMPLETED', winner_slot: 6 },
  { match_no: 4, status: 'IN_PROGRESS', winner_slot: null },
];
assert.equal(nextRoundMatches(1, quarterFinals), null, 'winners must wait for every quarter-final');
quarterFinals[1] = { match_no: 2, status: 'COMPLETED', winner_slot: 4 };
quarterFinals[3] = { match_no: 4, status: 'COMPLETED', winner_slot: 8 };
assert.deepEqual(nextRoundMatches(1, quarterFinals), [
  { round_no: 2, match_no: 1, player1_slot: 2, player2_slot: 4, status: 'WAITING' },
  { round_no: 2, match_no: 2, player1_slot: 6, player2_slot: 8, status: 'WAITING' },
]);

const semiFinals = [
  { match_no: 1, status: 'COMPLETED', winner_slot: 4 },
  { match_no: 2, status: 'COMPLETED', winner_slot: 8 },
];
assert.deepEqual(nextRoundMatches(2, semiFinals), [
  { round_no: 3, match_no: 1, player1_slot: 4, player2_slot: 8, status: 'WAITING' },
]);
assert.equal(nextRoundMatches(3, [
  { match_no: 1, status: 'IN_PROGRESS', winner_slot: null },
]), null);
assert.deepEqual(nextRoundMatches(3, [
  { match_no: 1, status: 'COMPLETED', winner_slot: 4 },
]), []);
console.log('PASS: round barrier waits for all results before creating the next round');

async function testParticipantValidation() {
  const invalidBotParticipants = participants.map((participant) => ({ ...participant }));
  invalidBotParticipants.find((participant) => participant.isBot && participant.level === 'hard').level = 'unknown';
  await assert.rejects(
    createTournament({ id: 'invalid-bot', entryFee: 300, participants: invalidBotParticipants }),
    TournamentError
  );

  const invalidHumanParticipants = participants.map((participant) => ({ ...participant }));
  invalidHumanParticipants.find((participant) => !participant.isBot).level = 'medium';
  await assert.rejects(
    createTournament({ id: 'invalid-human', entryFee: 300, participants: invalidHumanParticipants }),
    TournamentError
  );
  console.log('PASS: tournament entry validation rejects invalid participant records');
}

testParticipantValidation().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert.deepEqual(calculateWager(1000, 10, false, 5), {
  feePerPlayer: 100,
  platformFee: 100,
  payout: 4900,
});
console.log('PASS: tournament uses the same one-entry fee and net payout as regular matches');

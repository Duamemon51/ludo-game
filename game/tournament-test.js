const assert = require('node:assert/strict');
const { calculateWager, minimumBetFromSetting } = require('./wager');
const {
  allocateBotLevels,
  buildParticipants,
  createBracketPreview,
  createRoundPairs,
  nextRoundMatches,
} = require('./tournament-bracket');
const {
  cancelInterruptedTournaments,
  createTournament,
  TournamentError,
} = require('./tournament-store');
const { pool } = require('../db/pool');

assert.equal(minimumBetFromSetting('300'), 30);
assert.equal(minimumBetFromSetting('100'), 100);
assert.equal(minimumBetFromSetting('70'), 30);
assert.equal(minimumBetFromSetting(undefined), 30);
console.log('PASS: legacy minimum bet settings now resolve to 30');

assert.deepEqual(allocateBotLevels(7), ['expert']);
assert.deepEqual(allocateBotLevels(6), ['expert', 'medium']);
assert.deepEqual(allocateBotLevels(5), ['expert', 'medium', 'medium']);
assert.deepEqual(allocateBotLevels(4), ['expert', 'medium', 'medium', 'medium']);
assert.deepEqual(allocateBotLevels(3), ['expert', 'medium', 'medium', 'medium', 'medium']);
assert.deepEqual(allocateBotLevels(1), ['expert', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium']);
assert.ok(
  [1, 2, 3, 4, 5, 6, 7].every((humanCount) =>
    allocateBotLevels(humanCount).slice(1).every((level) => level === 'medium')
  )
);
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
const preview = createBracketPreview(
  participants,
  createRoundPairs(1, participants.map(({ slot }) => slot)).map(
    ([player1_slot, player2_slot], index) => ({
      match_no: index + 1,
      player1_slot,
      player2_slot,
    })
  ),
  participants[0].slot
);
assert.equal(preview.matches.length, 4);
assert.equal(preview.matches.flatMap(({ players }) => players).length, 8);
assert.deepEqual(preview.matches[0].players.map(({ slot }) => slot), [1, 2]);
assert.equal(preview.yourSlot, participants[0].slot);
assert.ok(preview.matches.flatMap(({ players }) => players).every((player) =>
  Object.keys(player).sort().join(',') === 'name,slot'
), 'preview contains names and slots without exposing participant bot flags');
assert.throws(
  () => createBracketPreview(participants, [{
    match_no: 1,
    player1_slot: 1,
    player2_slot: 9,
  }], 1),
  RangeError
);
console.log('PASS: tournament preview contains four name-only first-round pairings');

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
  invalidBotParticipants.find((participant) => participant.isBot && participant.level !== 'expert').level = 'unknown';
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

async function testInterruptedTournamentCancellation() {
  const originalExecute = pool.execute;
  const cancelled = [];
  pool.execute = async (query) => {
    assert.match(query, /status = 'IN_PROGRESS'/);
    return [[{ id: 'stale-one' }, { id: 'stale-two' }]];
  };
  try {
    const ids = await cancelInterruptedTournaments(async (id, reason) => {
      cancelled.push({ id, reason });
      return id === 'stale-one';
    });
    assert.deepEqual(ids, ['stale-one']);
    assert.deepEqual(cancelled.map(({ id }) => id), ['stale-one', 'stale-two']);
    assert.ok(cancelled.every(({ reason }) => reason.includes('Entry fee refunded')));
  } finally {
    pool.execute = originalExecute;
  }
  console.log('PASS: interrupted tournaments are cancelled and refunded before server startup');
}

testParticipantValidation().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
testInterruptedTournamentCancellation().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert.deepEqual(calculateWager(1000, 10, false, 5), {
  feePerPlayer: 100,
  platformFee: 100,
  payout: 4900,
});
assert.deepEqual(calculateWager(300, 10, false, 8), {
  feePerPlayer: 30,
  platformFee: 30,
  payout: 2370,
});
console.log('PASS: tournament prize counts all eight bracket slots, including bot seats');

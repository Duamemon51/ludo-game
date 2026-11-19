const { transaction } = require('../db/pool');
const { calculateWager } = require('./wager');
const { createRoundPairs, nextRoundMatches } = require('./tournament-bracket');

class TournamentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TournamentError';
  }
}

const roundCredits = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

async function createTournament({ id, entryFee, participants }) {
  if (
    !Array.isArray(participants)
    || participants.length !== 8
    || participants.some((participant) => !participant || typeof participant !== 'object')
    || participants.filter((participant) => !participant.isBot).length < 1
    || participants.filter((participant) => !participant.isBot).length > 7
    || participants.filter((participant) => participant.isBot && participant.level === 'expert').length !== 1
    || participants.some((participant, index) => (
      participant.slot !== index + 1
      || typeof participant.isBot !== 'boolean'
      || typeof participant.name !== 'string'
      || !participant.name.trim()
      || participant.name.length > 50
      || (participant.isBot
        ? participant.playerId != null || !['expert', 'hard', 'medium'].includes(participant.level)
        : !String(participant.playerId || '') || participant.level != null)
    ))
  ) {
    throw new TournamentError('The tournament bracket is not valid.');
  }

  const humanIds = participants
    .filter((participant) => !participant.isBot)
    .map((participant) => String(participant.playerId || ''));
  if (humanIds.some((playerId) => !playerId) || new Set(humanIds).size !== humanIds.length) {
    throw new TournamentError('Each tournament player must be signed in only once.');
  }
  if (!Number.isSafeInteger(entryFee) || entryFee <= 0 || entryFee > 5000) {
    throw new TournamentError('Choose a valid tournament entry amount.');
  }

  return transaction(async (connection) => {
    const [settings] = await connection.execute(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('minimum_bet', 'platform_fee_percent', 'tournament_enabled')`
    );
    const values = Object.fromEntries(settings.map((row) => [row.setting_key, row.setting_value]));
    const minimumBet = Number(values.minimum_bet ?? 300);
    const feePercent = Number(values.platform_fee_percent ?? 10);
    if (values.tournament_enabled !== 'true') {
      throw new TournamentError('Tournament matchmaking is currently unavailable.');
    }
    if (!Number.isFinite(minimumBet) || entryFee < minimumBet) {
      throw new TournamentError(`The minimum bet is ${minimumBet} credits.`);
    }
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      throw new TournamentError('The platform fee is not configured correctly.');
    }

    const placeholders = humanIds.map(() => '?').join(', ');
    const [accounts] = await connection.execute(
      `SELECT p.id, p.master_id, p.status, m.status AS master_status
       FROM accounts p
       JOIN accounts m ON m.id = p.master_id AND m.role = 'MASTER'
       WHERE p.id IN (${placeholders}) AND p.role = 'PLAYER'
       ORDER BY p.id FOR UPDATE`,
      humanIds
    );
    if (accounts.length !== humanIds.length) {
      throw new TournamentError('A tournament player account could not be verified.');
    }
    if (accounts.some((account) => account.status !== 'ACTIVE' || account.master_status !== 'ACTIVE')) {
      throw new TournamentError('All tournament players must have active accounts.');
    }
    const [activeEntries] = await connection.execute(
      `SELECT tp.player_id FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id AND t.status = 'IN_PROGRESS'
       WHERE tp.player_id IN (${placeholders}) AND tp.status <> 'ELIMINATED'
       LIMIT 1 FOR UPDATE`,
      humanIds
    );
    if (activeEntries.length > 0) {
      throw new TournamentError('A player is already participating in an active tournament.');
    }

    const [wallets] = await connection.execute(
      `SELECT account_id, balance FROM wallets
       WHERE account_id IN (${placeholders})
       ORDER BY account_id FOR UPDATE`,
      humanIds
    );
    if (wallets.length !== humanIds.length) {
      throw new TournamentError('A tournament player wallet could not be found.');
    }

    const [heldRows] = await connection.execute(
      `SELECT user_id, SUM(amount) AS held
       FROM user_withdrawal_requests
       WHERE user_id IN (${placeholders}) AND request_type = 'WITHDRAWAL' AND status = 'PENDING'
       GROUP BY user_id`,
      humanIds
    );
    const heldByPlayer = new Map(heldRows.map((row) => [String(row.user_id), Number(row.held)]));
    const walletByPlayer = new Map(wallets.map((row) => [String(row.account_id), Number(row.balance)]));
    for (const playerId of humanIds) {
      const available = walletByPlayer.get(playerId) - (heldByPlayer.get(playerId) || 0);
      if (available < entryFee) {
        throw new TournamentError('A tournament player does not have enough available credits.');
      }
    }

    const { platformFee, payout: prizePool } = calculateWager(
      entryFee,
      feePercent,
      false,
      humanIds.length
    );
    const masterId = accounts[0].master_id;
    await connection.execute(
      `INSERT INTO tournaments
        (id, master_id, entry_fee, human_count, platform_fee, prize_pool, current_round, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'IN_PROGRESS')`,
      [id, masterId, entryFee, humanIds.length, platformFee, prizePool]
    );

    for (const participant of participants) {
      const playerId = participant.isBot ? null : String(participant.playerId);
      await connection.execute(
        `INSERT INTO tournament_participants
          (tournament_id, slot, player_id, participant_name, is_bot, bot_level, status, entry_paid)
         VALUES (?, ?, ?, ?, ?, ?, 'WAITING', ?)`,
        [
          id,
          participant.slot,
          playerId,
          participant.name,
          participant.isBot ? 1 : 0,
          participant.isBot ? participant.level : null,
          participant.isBot ? 0 : 1,
        ]
      );
    }

    for (const [index, [player1Slot, player2Slot]] of createRoundPairs(
      1,
      participants.map((participant) => participant.slot)
    ).entries()) {
      await connection.execute(
        `INSERT INTO tournament_matches
          (tournament_id, round_no, match_no, player1_slot, player2_slot, status)
         VALUES (?, 1, ?, ?, ?, 'WAITING')`,
        [id, index + 1, player1Slot, player2Slot]
      );
    }

    for (const playerId of humanIds) {
      const balanceAfter = roundCredits(walletByPlayer.get(playerId) - entryFee);
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, playerId]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
         VALUES (?, ?, 'BET', ?, ?)`,
        [playerId, -entryFee, balanceAfter, `Tournament ${id} entry fee`]
      );
    }

    return {
      id,
      entryFee,
      humanCount: humanIds.length,
      platformFee,
      prizePool,
    };
  });
}

async function startTournamentMatch(tournamentId, roundNo, matchNo) {
  return transaction(async (connection) => {
    const [tournaments] = await connection.execute(
      'SELECT current_round, status FROM tournaments WHERE id = ? FOR UPDATE',
      [tournamentId]
    );
    const tournament = tournaments[0];
    if (!tournament || tournament.status !== 'IN_PROGRESS' || Number(tournament.current_round) !== roundNo) {
      return null;
    }
    const [matches] = await connection.execute(
      `SELECT player1_slot, player2_slot, status FROM tournament_matches
       WHERE tournament_id = ? AND round_no = ? AND match_no = ? FOR UPDATE`,
      [tournamentId, roundNo, matchNo]
    );
    const match = matches[0];
    if (!match || match.status !== 'WAITING') return null;
    await connection.execute(
      `UPDATE tournament_matches SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP
       WHERE tournament_id = ? AND round_no = ? AND match_no = ? AND status = 'WAITING'`,
      [tournamentId, roundNo, matchNo]
    );
    await connection.execute(
      `UPDATE tournament_participants SET status = 'IN_PROGRESS'
       WHERE tournament_id = ? AND slot IN (?, ?) AND status = 'WAITING'`,
      [tournamentId, match.player1_slot, match.player2_slot]
    );
    return {
      tournamentId,
      roundNo,
      matchNo,
      player1Slot: Number(match.player1_slot),
      player2Slot: Number(match.player2_slot),
    };
  });
}

async function completeTournamentMatch(tournamentId, roundNo, matchNo, winnerSlot) {
  return transaction(async (connection) => {
    const [tournaments] = await connection.execute(
      `SELECT id, entry_fee, human_count, platform_fee, prize_pool, payout,
        current_round, status, champion_slot
       FROM tournaments WHERE id = ? FOR UPDATE`,
      [tournamentId]
    );
    const tournament = tournaments[0];
    if (!tournament) throw new TournamentError('The tournament record could not be found.');
    if (tournament.status !== 'IN_PROGRESS') {
      if (tournament.status === 'COMPLETED') {
        const [champions] = await connection.execute(
          `SELECT player_id, participant_name, is_bot FROM tournament_participants
           WHERE tournament_id = ? AND slot = ?`,
          [tournamentId, tournament.champion_slot]
        );
        const champion = champions[0];
        return {
          duplicate: true,
          status: 'COMPLETED',
          championSlot: Number(tournament.champion_slot),
          championId: champion?.player_id == null ? null : String(champion.player_id),
          championName: champion?.participant_name || 'A bot',
          championIsBot: Boolean(champion?.is_bot),
          payout: Number(tournament.payout),
          entryFee: Number(tournament.entry_fee),
          platformFee: Number(tournament.platform_fee),
          prizePool: Number(tournament.prize_pool),
        };
      }
      return { duplicate: true, status: tournament.status };
    }

    const currentRound = Number(tournament.current_round);
    const [matches] = await connection.execute(
      `SELECT match_no, player1_slot, player2_slot, status, winner_slot
       FROM tournament_matches
       WHERE tournament_id = ? AND round_no = ? AND match_no = ? FOR UPDATE`,
      [tournamentId, roundNo, matchNo]
    );
    const match = matches[0];
    if (!match) throw new TournamentError('The tournament match record could not be found.');
    if (match.status === 'COMPLETED') {
      if (currentRound > roundNo) {
        const [nextMatches] = await connection.execute(
          `SELECT round_no, match_no, player1_slot, player2_slot, status
           FROM tournament_matches
           WHERE tournament_id = ? AND round_no = ? ORDER BY match_no`,
          [tournamentId, currentRound]
        );
        return {
          duplicate: true,
          status: 'ROUND_READY',
          roundNo: currentRound,
          matches: nextMatches.map((row) => ({
            round_no: Number(row.round_no),
            match_no: Number(row.match_no),
            player1_slot: Number(row.player1_slot),
            player2_slot: Number(row.player2_slot),
            status: row.status,
          })),
        };
      }
      return { duplicate: true, status: 'WAITING', roundNo, winnerSlot: Number(match.winner_slot) };
    }
    if (roundNo !== currentRound || match.status !== 'IN_PROGRESS') {
      throw new TournamentError('The tournament match is not active.');
    }
    if (![Number(match.player1_slot), Number(match.player2_slot)].includes(winnerSlot)) {
      throw new TournamentError('The match winner is not a tournament participant.');
    }

    await connection.execute(
      `UPDATE tournament_matches SET status = 'COMPLETED', winner_slot = ?, finished_at = CURRENT_TIMESTAMP
       WHERE tournament_id = ? AND round_no = ? AND match_no = ? AND status = 'IN_PROGRESS'`,
      [winnerSlot, tournamentId, roundNo, matchNo]
    );
    const loserSlot = Number(match.player1_slot) === winnerSlot
      ? Number(match.player2_slot)
      : Number(match.player1_slot);
    await connection.execute(
      `UPDATE tournament_participants SET status = 'ELIMINATED'
       WHERE tournament_id = ? AND slot = ?`,
      [tournamentId, loserSlot]
    );
    await connection.execute(
      `UPDATE tournament_participants SET status = 'WAITING'
       WHERE tournament_id = ? AND slot = ?`,
      [tournamentId, winnerSlot]
    );

    const [roundMatches] = await connection.execute(
      `SELECT match_no, status, winner_slot FROM tournament_matches
       WHERE tournament_id = ? AND round_no = ? ORDER BY match_no FOR UPDATE`,
      [tournamentId, roundNo]
    );
    const nextMatches = nextRoundMatches(roundNo, roundMatches.map((row) => ({
      match_no: Number(row.match_no),
      status: row.status,
      winner_slot: row.winner_slot == null ? null : Number(row.winner_slot),
    })));
    if (nextMatches === null) {
      return { status: 'WAITING', roundNo, winnerSlot };
    }

    if (roundNo < 3) {
      for (const nextMatch of nextMatches) {
        await connection.execute(
          `INSERT INTO tournament_matches
            (tournament_id, round_no, match_no, player1_slot, player2_slot, status)
           VALUES (?, ?, ?, ?, ?, 'WAITING')`,
          [
            tournamentId,
            nextMatch.round_no,
            nextMatch.match_no,
            nextMatch.player1_slot,
            nextMatch.player2_slot,
          ]
        );
      }
      await connection.execute(
        'UPDATE tournaments SET current_round = ? WHERE id = ? AND current_round = ?',
        [roundNo + 1, tournamentId, roundNo]
      );
      return {
        status: 'ROUND_READY',
        roundNo: roundNo + 1,
        matches: nextMatches,
      };
    }

    const championSlot = winnerSlot;
    const [champions] = await connection.execute(
      `SELECT player_id, participant_name, is_bot FROM tournament_participants
       WHERE tournament_id = ? AND slot = ? FOR UPDATE`,
      [tournamentId, championSlot]
    );
    const champion = champions[0];
    if (!champion) throw new TournamentError('The tournament champion could not be found.');

    const payout = champion.player_id == null ? 0 : Number(tournament.prize_pool);
    if (champion.player_id != null) {
      const [wallets] = await connection.execute(
        'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
        [champion.player_id]
      );
      if (!wallets[0]) throw new TournamentError('The champion wallet could not be found.');
      const balanceAfter = roundCredits(Number(wallets[0].balance) + payout);
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [
        balanceAfter,
        champion.player_id,
      ]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
         VALUES (?, ?, 'WIN', ?, ?)`,
        [champion.player_id, payout, balanceAfter, `Tournament ${tournamentId} prize`]
      );
    }
    await connection.execute(
      `UPDATE tournament_participants SET status = 'CHAMPION'
       WHERE tournament_id = ? AND slot = ?`,
      [tournamentId, championSlot]
    );
    await connection.execute(
      `UPDATE tournaments SET status = 'COMPLETED', champion_slot = ?, champion_id = ?,
        payout = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'IN_PROGRESS'`,
      [championSlot, champion.player_id, payout, tournamentId]
    );
    return {
      status: 'COMPLETED',
      roundNo,
      championSlot,
      championId: champion.player_id == null ? null : String(champion.player_id),
      championName: champion.participant_name,
      championIsBot: Boolean(champion.is_bot),
      payout,
      entryFee: Number(tournament.entry_fee),
      platformFee: Number(tournament.platform_fee),
      prizePool: Number(tournament.prize_pool),
    };
  });
}

async function cancelTournament(tournamentId, reason) {
  return transaction(async (connection) => {
    const [tournaments] = await connection.execute(
      'SELECT entry_fee, status FROM tournaments WHERE id = ? FOR UPDATE',
      [tournamentId]
    );
    const tournament = tournaments[0];
    if (!tournament || tournament.status !== 'IN_PROGRESS') return false;
    const [participants] = await connection.execute(
      `SELECT player_id FROM tournament_participants
       WHERE tournament_id = ? AND entry_paid = 1 FOR UPDATE`,
      [tournamentId]
    );
    for (const { player_id: playerId } of participants) {
      const [wallets] = await connection.execute(
        'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
        [playerId]
      );
      if (!wallets[0]) throw new TournamentError('A tournament entry refund wallet could not be found.');
      const balanceAfter = roundCredits(Number(wallets[0].balance) + Number(tournament.entry_fee));
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, playerId]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
         VALUES (?, ?, 'BET', ?, ?)`,
        [
          playerId,
          Number(tournament.entry_fee),
          balanceAfter,
          `Refund for cancelled tournament ${tournamentId}: ${String(reason || 'Tournament cancelled').slice(0, 200)}`,
        ]
      );
    }
    await connection.execute(
      `UPDATE tournament_matches SET status = 'CANCELLED'
       WHERE tournament_id = ? AND status IN ('WAITING', 'IN_PROGRESS')`,
      [tournamentId]
    );
    await connection.execute(
      `UPDATE tournaments SET status = 'CANCELLED', prize_pool = 0, payout = 0,
        finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [tournamentId]
    );
    await connection.execute(
      `UPDATE tournament_participants SET status = 'ELIMINATED'
       WHERE tournament_id = ? AND status <> 'CHAMPION'`,
      [tournamentId]
    );
    return true;
  });
}

module.exports = {
  TournamentError,
  cancelTournament,
  completeTournamentMatch,
  createTournament,
  startTournamentMatch,
};

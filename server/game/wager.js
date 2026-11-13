const { transaction } = require('../db/pool');

const MAX_BET = 5000;

class WagerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WagerError';
  }
}

const roundCredits = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

function calculateWager(bet, feePercent, botOpponent = false) {
  const feePerPlayer = roundCredits((bet * feePercent) / 100);
  const totalFee = roundCredits(feePerPlayer * 2);
  return {
    feePerPlayer,
    platformFee: botOpponent ? feePerPlayer : totalFee,
    payout: roundCredits((bet * 2) - totalFee),
  };
}

async function createWageredMatch(players, bet, matchCode, queueType, { botOpponent = false } = {}) {
  if (!Number.isSafeInteger(bet) || bet <= 0 || bet > MAX_BET) {
    throw new WagerError(`Bet must be between the minimum bet and ${MAX_BET} credits.`);
  }
  const playerIds = players.map((player) => String(player.playerId));
  const expectedPlayers = botOpponent ? 1 : 2;
  if (
    players.length !== expectedPlayers
    || !playerIds.every(Boolean)
    || new Set(playerIds).size !== playerIds.length
  ) {
    throw new WagerError(`A wagered match needs ${expectedPlayers} signed-in player${expectedPlayers === 1 ? '' : 's'}.`);
  }
  const playerPlaceholders = playerIds.map(() => '?').join(', ');

  return transaction(async (connection) => {
    const [settings] = await connection.execute(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('minimum_bet', 'platform_fee_percent', 'tournament_enabled')`
    );
    const values = Object.fromEntries(settings.map((row) => [row.setting_key, row.setting_value]));
    const minimumBet = Number(values.minimum_bet ?? 300);
    const feePercent = Number(values.platform_fee_percent ?? 10);
    if (!Number.isFinite(minimumBet) || bet < minimumBet) {
      throw new WagerError(`The minimum bet is ${minimumBet} credits.`);
    }
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
      throw new WagerError('The platform fee is not configured correctly.');
    }
    if (queueType === 'tournament' && values.tournament_enabled !== 'true') {
      throw new WagerError('Tournament matchmaking is currently unavailable.');
    }

    const [accounts] = await connection.execute(
      `SELECT p.id, p.master_id, p.status, m.status AS master_status
       FROM accounts p
       JOIN accounts m ON m.id = p.master_id AND m.role = 'MASTER'
       WHERE p.id IN (${playerPlaceholders}) AND p.role = 'PLAYER'
       ORDER BY p.id
       FOR UPDATE`,
      playerIds
    );
    if (accounts.length !== expectedPlayers) throw new WagerError('A player account could not be verified.');
    if (accounts.some((account) => account.status !== 'ACTIVE' || account.master_status !== 'ACTIVE')) {
      throw new WagerError('All players must have active accounts to place a bet.');
    }
    if (!botOpponent && String(accounts[0].master_id) !== String(accounts[1].master_id)) {
      throw new WagerError('Players must belong to the same Master to play for credits.');
    }

    const [wallets] = await connection.execute(
      `SELECT account_id, balance FROM wallets
       WHERE account_id IN (${playerPlaceholders})
       ORDER BY account_id
       FOR UPDATE`,
      playerIds
    );
    if (wallets.length !== expectedPlayers) throw new WagerError('A player wallet could not be found.');

    const [heldRows] = await connection.execute(
      `SELECT user_id, SUM(amount) AS held
       FROM user_withdrawal_requests
       WHERE user_id IN (${playerPlaceholders}) AND request_type = 'WITHDRAWAL' AND status = 'PENDING'
       GROUP BY user_id`,
      playerIds
    );
    const heldByPlayer = new Map(heldRows.map((row) => [String(row.user_id), Number(row.held)]));
    const walletByPlayer = new Map(wallets.map((row) => [String(row.account_id), Number(row.balance)]));
    for (const playerId of playerIds) {
      const available = walletByPlayer.get(playerId) - (heldByPlayer.get(playerId) || 0);
      if (available < bet) throw new WagerError('A player does not have enough available credits for this bet.');
    }

    const { feePerPlayer, platformFee, payout } = calculateWager(bet, feePercent, botOpponent);
    const [matchResult] = await connection.execute(
      `INSERT INTO matches
        (match_code, master_id, bet_per_player, platform_fee, payout, opponent_is_bot, status)
       VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS')`,
      [matchCode, accounts[0].master_id, bet, platformFee, payout, botOpponent ? 1 : 0]
    );
    const matchId = String(matchResult.insertId);

    for (const playerId of playerIds) {
      const balanceAfter = roundCredits(walletByPlayer.get(playerId) - bet);
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, playerId]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
         VALUES (?, ?, 'BET', ?, ?)`,
        [playerId, -bet, balanceAfter, `Bet for match ${matchCode}`]
      );
      await connection.execute('INSERT INTO match_players (match_id, player_id) VALUES (?, ?)', [matchId, playerId]);
    }

    return {
      id: matchId,
      code: matchCode,
      bet,
      feePerPlayer,
      platformFee,
      payout,
      botOpponent,
    };
  });
}

async function settleWageredMatch(matchId, winnerId) {
  return transaction(async (connection) => {
    const [matches] = await connection.execute(
      `SELECT id, match_code, bet_per_player, platform_fee, payout, winner_id,
        opponent_is_bot, status
       FROM matches WHERE id = ? FOR UPDATE`,
      [matchId]
    );
    const match = matches[0];
    if (!match) throw new WagerError('The wagered match record could not be found.');
    if (match.status === 'CANCELLED') {
      return {
        cancelled: true,
        bet: Number(match.bet_per_player),
        feePerPlayer: 0,
        platformFee: 0,
        payout: 0,
        botWon: false,
      };
    }
    if (match.status === 'COMPLETED') {
      return {
        bet: Number(match.bet_per_player),
        feePerPlayer: Number(match.platform_fee) / (match.opponent_is_bot ? 1 : 2),
        platformFee: Number(match.platform_fee),
        payout: Number(match.payout),
        botWon: Boolean(match.opponent_is_bot && match.winner_id == null),
      };
    }

    if (match.opponent_is_bot && winnerId == null) {
      await connection.execute(
        `UPDATE matches SET payout = 0, status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [matchId]
      );
      return {
        bet: Number(match.bet_per_player),
        feePerPlayer: Number(match.platform_fee) / (match.opponent_is_bot ? 1 : 2),
        platformFee: Number(match.platform_fee),
        payout: 0,
        botWon: true,
      };
    }

    const [players] = await connection.execute(
      'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY player_id FOR UPDATE',
      [matchId]
    );
    if (!players.some((player) => String(player.player_id) === String(winnerId))) {
      throw new WagerError('The game winner does not match a player in this wagered match.');
    }
    const [wallets] = await connection.execute(
      'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
      [winnerId]
    );
    if (!wallets[0]) throw new WagerError('The winner wallet could not be found.');

    const payout = Number(match.payout);
    const balanceAfter = roundCredits(Number(wallets[0].balance) + payout);
    await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, winnerId]);
    await connection.execute(
      `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
       VALUES (?, ?, 'WIN', ?, ?)`,
      [winnerId, payout, balanceAfter, `Winnings for match ${match.match_code}`]
    );
    await connection.execute(
      `UPDATE matches SET winner_id = ?, status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [winnerId, matchId]
    );

    return {
      cancelled: false,
      bet: Number(match.bet_per_player),
      feePerPlayer: Number(match.platform_fee) / (match.opponent_is_bot ? 1 : 2),
      platformFee: Number(match.platform_fee),
      payout,
      botWon: false,
    };
  });
}

async function refundWageredMatch(matchId) {
  return transaction(async (connection) => {
    const [matches] = await connection.execute(
      `SELECT id, match_code, bet_per_player, opponent_is_bot, status
       FROM matches WHERE id = ? FOR UPDATE`,
      [matchId]
    );
    const match = matches[0];
    if (!match) throw new WagerError('The wagered match record could not be found.');
    if (match.status !== 'IN_PROGRESS') return false;

    const [players] = await connection.execute(
      'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY player_id FOR UPDATE',
      [matchId]
    );
    const expectedPlayers = match.opponent_is_bot ? 1 : 2;
    if (players.length !== expectedPlayers) throw new WagerError('The wagered match player records are incomplete.');
    const bet = Number(match.bet_per_player);

    for (const { player_id: playerId } of players) {
      const [wallets] = await connection.execute(
        'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
        [playerId]
      );
      if (!wallets[0]) throw new WagerError('A player wallet could not be found for the bet refund.');
      const balanceAfter = roundCredits(Number(wallets[0].balance) + bet);
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, playerId]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, note)
         VALUES (?, ?, 'BET', ?, ?)`,
        [playerId, bet, balanceAfter, `Refund for cancelled match ${match.match_code}`]
      );
    }

    await connection.execute(
      `UPDATE matches SET platform_fee = 0, payout = 0, status = 'CANCELLED',
        finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [matchId]
    );
    return true;
  });
}

module.exports = {
  WagerError,
  calculateWager,
  createWageredMatch,
  settleWageredMatch,
  refundWageredMatch,
};

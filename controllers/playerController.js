const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { pool, transaction } = require('../db/pool');

const MAX_AMOUNT = 999999999999.99;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Player authentication is not configured. Set a 32+ character JWT_SECRET.');
  }
  return secret;
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function authenticatePlayer(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please sign in as a Player.');
    const claims = jwt.verify(token, requireJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'ludo-game',
      audience: 'ludo-player',
    });
    if (claims.role !== 'PLAYER' || !claims.sub) throw new HttpError(403, 'Player access is required.');
    req.playerId = claims.sub;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
      return next(new HttpError(401, 'Player session is no longer valid.'));
    }
    next(error);
  }
}

async function playerAccount(playerId) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.login_id, p.display_name, p.status, p.status_before_block, p.master_id,
      m.status AS master_status, COALESCE(w.balance, 0) AS balance,
      COALESCE((SELECT SUM(r.amount) FROM user_withdrawal_requests r
        WHERE r.user_id = p.id AND r.request_type = 'WITHDRAWAL' AND r.status = 'PENDING'), 0) AS held
     FROM accounts p
     JOIN accounts m ON m.id = p.master_id AND m.role = 'MASTER'
     LEFT JOIN wallets w ON w.account_id = p.id
     WHERE p.id = ? AND p.role = 'PLAYER' LIMIT 1`,
    [playerId]
  );
  const player = rows[0];
  if (!player || player.status === 'BLOCKED' || player.master_status === 'BLOCKED') {
    throw new HttpError(401, 'Player session is no longer valid.');
  }
  return player;
}

async function createWalletRequest(req, res, next, forcedType) {
  try {
    const type = forcedType || String(req.body?.type || '').toLowerCase();
    if (!['deposit', 'withdrawal'].includes(type)) {
      throw new HttpError(400, 'Request type must be deposit or withdrawal.');
    }
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new HttpError(400, 'Request amount must be greater than zero and within the supported limit.');
    }
    const value = Math.round(amount * 100) / 100;
    const requestId = randomUUID();
    const result = await transaction(async (connection) => {
      const [players] = await connection.execute(
        `SELECT p.id, p.status, p.master_id, m.status AS master_status, w.balance
         FROM accounts p
         JOIN accounts m ON m.id = p.master_id AND m.role = 'MASTER'
         JOIN wallets w ON w.account_id = p.id
         WHERE p.id = ? AND p.role = 'PLAYER' FOR UPDATE`,
        [req.playerId]
      );
      const player = players[0];
      if (!player || player.status !== 'ACTIVE' || player.master_status === 'BLOCKED') {
        throw new HttpError(403, 'Only active Players can request wallet deposits or withdrawals.');
      }
      if (type === 'withdrawal') {
        const [[pending]] = await connection.execute(
          `SELECT COALESCE(SUM(amount), 0) AS held FROM user_withdrawal_requests
           WHERE user_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
          [player.id]
        );
        const available = Number(player.balance) - Number(pending.held);
        if (value > available) throw new HttpError(409, 'Withdrawal exceeds your available balance.');
      }

      await connection.execute(
        `INSERT INTO user_withdrawal_requests (id, master_id, user_id, request_type, amount, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [requestId, player.master_id, player.id, type === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL', value]
      );
      await connection.execute(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip_address)
         VALUES (?, ?, 'USER_WALLET_REQUEST', ?, ?, ?)`,
        [player.id, `PLAYER_${type.toUpperCase()}_REQUESTED`, requestId, `${value} credits requested`, req.ip || null]
      );
      return {
        id: requestId,
        type: type === 'deposit' ? 'Deposit' : 'Withdrawal',
        amount: value,
        status: 'Pending',
        date: dateLabel(new Date()),
        reason: '',
      };
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const player = await playerAccount(req.playerId);
    res.json({
      id: String(player.id),
      loginId: player.login_id,
      name: player.display_name,
      status: player.status === 'ACTIVE' ? 'Active' : 'Inactive',
      masterStatus: player.master_status,
      wallet: Number(player.balance),
      heldAmount: Number(player.held),
      availableBalance: Math.max(0, Number(player.balance) - Number(player.held)),
    });
  } catch (error) {
    next(error);
  }
}

async function getTournaments(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT setting_key, setting_value FROM platform_settings
       WHERE setting_key IN ('tournament_enabled', 'tournament_entry', 'platform_fee_percent')`
    );
    const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    res.json({
      enabled: values.tournament_enabled === 'true',
      entryFee: Number(values.tournament_entry ?? 300),
      feePercent: Number(values.platform_fee_percent ?? 10),
      mode: 'Quick 1 vs 1',
    });
  } catch (error) {
    next(error);
  }
}

async function getWallet(req, res, next) {
  try {
    const player = await playerAccount(req.playerId);
    const [ledger] = await pool.execute(
      `SELECT id, entry_type, amount, balance_after, note, created_at
       FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT 200`,
      [player.id]
    );
    const [requests] = await pool.execute(
      `SELECT id, request_type, amount, status, requested_at, reviewed_at, reason
       FROM user_withdrawal_requests WHERE user_id = ? ORDER BY requested_at DESC`,
      [player.id]
    );
    const balance = Number(player.balance);
    const held = Number(player.held);
    res.json({
      balance,
      heldAmount: held,
      availableBalance: Math.max(0, balance - held),
      ledger: ledger.map((entry) => ({
        id: String(entry.id),
        type: entry.entry_type,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balance_after),
        note: entry.note,
        date: dateLabel(entry.created_at),
      })),
      requests: requests.map((request) => ({
        id: request.id,
        type: request.request_type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
        amount: Number(request.amount),
        status: request.status[0] + request.status.slice(1).toLowerCase(),
        date: dateLabel(request.requested_at),
        reviewedAt: dateLabel(request.reviewed_at),
        reason: request.reason || '',
      })),
      withdrawals: requests.filter((request) => request.request_type === 'WITHDRAWAL').map((request) => ({
        id: request.id,
        amount: Number(request.amount),
        status: request.status[0] + request.status.slice(1).toLowerCase(),
        date: dateLabel(request.requested_at),
        reviewedAt: dateLabel(request.reviewed_at),
        reason: request.reason || '',
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function getMatches(req, res, next) {
  try {
    const player = await playerAccount(req.playerId);
    const [rows] = await pool.execute(
      `SELECT m.match_code, m.bet_per_player, m.platform_fee, m.payout, m.winner_id,
        m.status, m.started_at, m.finished_at,
        GROUP_CONCAT(DISTINCT opponent.display_name ORDER BY opponent.id SEPARATOR ', ') AS opponents
       FROM match_players own
       JOIN matches m ON m.id = own.match_id
       LEFT JOIN match_players other ON other.match_id = m.id AND other.player_id <> own.player_id
       LEFT JOIN accounts opponent ON opponent.id = other.player_id
       WHERE own.player_id = ? AND m.master_id = ?
       GROUP BY m.id ORDER BY m.started_at DESC LIMIT 500`,
      [player.id, player.master_id]
    );
    res.json(rows.map((match) => ({
      id: match.match_code,
      opponent: match.opponents || '—',
      bet: Number(match.bet_per_player),
      fee: Number(match.platform_fee),
      result: match.winner_id == null ? 'In progress' : String(match.winner_id) === String(player.id) ? 'Won' : 'Lost',
      amount: match.winner_id == null ? 0 : String(match.winner_id) === String(player.id) ? Number(match.payout) : -Number(match.bet_per_player),
      payout: Number(match.payout),
      status: match.status === 'IN_PROGRESS' ? 'Live' : match.status === 'COMPLETED' ? 'Finished' : 'Cancelled',
      date: dateLabel(match.finished_at || match.started_at),
    })));
  } catch (error) {
    next(error);
  }
}

function postRequests(req, res, next) { return createWalletRequest(req, res, next); }

function postWithdrawals(req, res, next) { return createWalletRequest(req, res, next, 'withdrawal'); }

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Player database unavailable:', error.code);
    return res.status(503).json({ error: 'Database is unavailable. Check XAMPP MariaDB and server database settings.' });
  }
  console.error('Player API error:', error);
  return res.status(500).json({ error: 'The request could not be completed.' });
}

module.exports = {
  authenticatePlayer,
  getMatches,
  getMe,
  getTournaments,
  getWallet,
  handleError,
  postRequests,
  postWithdrawals,
};

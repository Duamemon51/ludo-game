const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { pool, transaction } = require('../db/pool');

const MAX_AMOUNT = 999999999999.99;
const STATUS_LABELS = { ACTIVE: 'Active', INACTIVE: 'Inactive', BLOCKED: 'Blocked' };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, field, max = 500, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value == null || value === '')) return '';
    throw new HttpError(400, `${field} is required.`);
  }
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return result;
}

function amount(value, field = 'Amount', allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number > MAX_AMOUNT || (allowZero ? number < 0 : number <= 0)) {
    throw new HttpError(400, `${field} must be ${allowZero ? 'zero or more' : 'greater than zero'} and within the supported limit.`);
  }
  return Math.round(number * 100) / 100;
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function timeLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function requestStatus(value) {
  return value[0] + value.slice(1).toLowerCase();
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Master authentication is not configured. Set a 32+ character JWT_SECRET.');
  }
  return secret;
}

async function audit(executor, req, masterId, action, targetType, targetId, details) {
  await executor.execute(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [masterId, action, targetType, String(targetId || ''), details, req.ip || null]
  );
}

async function authenticatedMaster(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please sign in as Master.');
    const claims = jwt.verify(token, requireJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'ludo-game',
      audience: 'ludo-master',
    });
    if (claims.role !== 'MASTER' || !claims.sub) throw new HttpError(403, 'Master access is required.');

    const [rows] = await pool.execute(
      `SELECT id, login_id, display_name, phone, status
       FROM accounts WHERE id = ? AND role = 'MASTER' LIMIT 1`,
      [claims.sub]
    );
    const master = rows[0];
    if (!master || master.status !== 'ACTIVE') throw new HttpError(401, 'Master session is no longer valid.');
    req.master = {
      id: String(master.id),
      loginId: master.login_id,
      name: master.display_name,
      phone: master.phone || '',
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
      return next(new HttpError(401, 'Master session is no longer valid.'));
    }
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const [[row]] = await pool.execute(
      `SELECT a.id, a.login_id, a.display_name, a.phone, a.status, a.created_at,
        COALESCE(w.balance, 0) AS balance
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.id = ? AND a.role = 'MASTER'`,
      [req.master.id]
    );
    if (!row) throw new HttpError(404, 'Master account not found.');
    res.json({
      id: String(row.id),
      loginId: row.login_id,
      name: row.display_name,
      phone: row.phone || '',
      status: STATUS_LABELS[row.status],
      wallet: Number(row.balance),
      createdAt: dateLabel(row.created_at),
    });
  } catch (error) {
    next(error);
  }
}

async function getDashboard(req, res, next) {
  try {
    const [[wallet]] = await pool.execute(
      `SELECT COALESCE(balance, 0) AS balance FROM wallets WHERE account_id = ?`,
      [req.master.id]
    );
    const [[users]] = await pool.execute(
      `SELECT COUNT(*) AS total, SUM(status = 'ACTIVE') AS active
       FROM accounts WHERE master_id = ? AND role = 'PLAYER'`,
      [req.master.id]
    );
    const [[matches]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM matches
       WHERE master_id = ? AND started_at >= CURRENT_DATE()
       AND started_at < CURRENT_DATE() + INTERVAL 1 DAY`,
      [req.master.id]
    );
    const [[userWithdrawals]] = await pool.execute(
      `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
       FROM user_withdrawal_requests
       WHERE master_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
      [req.master.id]
    );
    const [[masterWithdrawals]] = await pool.execute(
      `SELECT COALESCE(SUM(amount), 0) AS amount
       FROM withdrawal_requests WHERE master_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
      [req.master.id]
    );
    const balance = Number(wallet?.balance || 0);
    const heldByAdmin = Number(masterWithdrawals.amount || 0);
    res.json({
      wallet: balance,
      availableWallet: Math.max(0, balance - heldByAdmin),
      pendingMasterWithdrawals: heldByAdmin,
      totalUsers: Number(users.total || 0),
      activeUsers: Number(users.active || 0),
      matchesToday: Number(matches.total || 0),
      pendingUserWithdrawals: Number(userWithdrawals.total || 0),
      pendingUserWithdrawalAmount: Number(userWithdrawals.amount || 0),
    });
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.display_name, a.login_id, a.phone, a.status, a.status_before_block, a.created_at,
        COALESCE(w.balance, 0) AS balance,
        (SELECT MAX(m.started_at) FROM match_players mp
          JOIN matches m ON m.id = mp.match_id WHERE mp.player_id = a.id) AS last_played,
        EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = a.id AND m.status = 'IN_PROGRESS') AS is_playing,
        COALESCE((SELECT SUM(ur.amount) FROM user_withdrawal_requests ur
          WHERE ur.user_id = a.id AND ur.request_type = 'WITHDRAWAL' AND ur.status = 'PENDING'), 0) AS held_amount
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.master_id = ? AND a.role = 'PLAYER'
       ORDER BY a.created_at DESC, a.id DESC`,
      [req.master.id]
    );
    res.json(rows.map((row) => ({
      id: String(row.id),
      name: row.display_name,
      loginId: row.login_id,
      phone: row.phone || '',
      status: STATUS_LABELS[row.status],
      statusBeforeBlock: row.status === 'BLOCKED' ? STATUS_LABELS[row.status_before_block || 'ACTIVE'] : undefined,
      wallet: Number(row.balance),
      heldAmount: Number(row.held_amount),
      gameState: row.is_playing ? 'Playing' : 'Idle',
      lastPlayed: dateLabel(row.last_played) || '—',
      createdAt: dateLabel(row.created_at),
    })));
  } catch (error) {
    next(error);
  }
}

async function postUsers(req, res, next) {
  try {
    const name = text(req.body?.name, 'Name', 100);
    const loginId = text(req.body?.loginId, 'Login ID', 50).toLowerCase();
    const password = text(req.body?.password, 'Password', 200);
    const phone = text(req.body?.phone || '', 'Phone', 30, false);
    const status = String(req.body?.status || 'ACTIVE').toUpperCase();
    const startingDeposit = amount(req.body?.startingDeposit || 0, 'Starting deposit', true);
    const note = text(req.body?.note || 'Starting deposit', 'Deposit note', 500);
    const validLoginId = /^[a-z0-9._-]{3,50}$/.test(loginId)
      || /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(loginId);
    if (!validLoginId) throw new HttpError(400, 'Enter a valid Login ID or email address.');
    if (password.length < 8) throw new HttpError(400, 'User password must be at least 8 characters.');
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new HttpError(400, 'New users can be Active or Inactive.');
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await transaction(async (connection) => {
      const [[masterWallet]] = await connection.execute(
        'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
        [req.master.id]
      );
      if (!masterWallet) throw new HttpError(404, 'Master wallet not found.');
      const masterBalance = Number(masterWallet.balance);
      if (startingDeposit > masterBalance) throw new HttpError(409, 'Master wallet has insufficient available balance.');
      const [created] = await connection.execute(
        `INSERT INTO accounts (login_id, display_name, phone, password_hash, role, status, master_id)
         VALUES (?, ?, ?, ?, 'PLAYER', ?, ?)`,
        [loginId, name, phone || null, passwordHash, status, req.master.id]
      );
      const userId = created.insertId;
      await connection.execute('INSERT INTO wallets (account_id, balance) VALUES (?, ?)', [userId, startingDeposit]);
      if (startingDeposit > 0) {
        const nextMasterBalance = masterBalance - startingDeposit;
        await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [nextMasterBalance, req.master.id]);
        await connection.execute(
          `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
           VALUES (?, ?, 'DEDUCT', ?, ?, ?), (?, ?, 'DEPOSIT', ?, ?, ?)`,
          [req.master.id, -startingDeposit, nextMasterBalance, req.master.id, `Starting deposit for ${name}: ${note}`,
            userId, startingDeposit, startingDeposit, req.master.id, note]
        );
      }
      await audit(connection, req, req.master.id, 'USER_CREATED', 'PLAYER', userId, `Login ID: ${loginId}; starting deposit: ${startingDeposit}`);
      return {
        id: String(userId),
        name,
        loginId,
        phone,
        status: STATUS_LABELS[status],
        wallet: startingDeposit,
        heldAmount: 0,
        gameState: 'Idle',
        lastPlayed: '—',
        createdAt: dateLabel(new Date()),
      };
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(new HttpError(409, 'That Login ID is already in use.'));
    next(error);
  }
}

async function getUsersById(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.display_name, a.login_id, a.phone, a.status, a.status_before_block,
        COALESCE(w.balance, 0) AS balance
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.id = ? AND a.master_id = ? AND a.role = 'PLAYER' LIMIT 1`,
      [req.params.id, req.master.id]
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, 'User not found.');
    const [ledger] = await pool.execute(
      `SELECT id, amount, entry_type, balance_after, note, created_at
       FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT 200`,
      [user.id]
    );
    const [matches] = await pool.execute(
      `SELECT m.match_code, m.bet_per_player, m.platform_fee, m.payout, m.winner_id,
        m.status, m.started_at, m.finished_at, winner.display_name AS winner_name,
        GROUP_CONCAT(DISTINCT player.display_name ORDER BY player.id SEPARATOR ' vs ') AS players
       FROM match_players own
       JOIN matches m ON m.id = own.match_id
       JOIN match_players mp ON mp.match_id = m.id
       JOIN accounts player ON player.id = mp.player_id
       LEFT JOIN accounts winner ON winner.id = m.winner_id
       WHERE own.player_id = ? AND m.master_id = ?
       GROUP BY m.id ORDER BY m.started_at DESC`,
      [user.id, req.master.id]
    );
    res.json({
      id: String(user.id),
      name: user.display_name,
      loginId: user.login_id,
      phone: user.phone || '',
      status: STATUS_LABELS[user.status],
      statusBeforeBlock: user.status === 'BLOCKED' ? STATUS_LABELS[user.status_before_block || 'ACTIVE'] : undefined,
      wallet: Number(user.balance),
      ledger: ledger.map((entry) => ({
        id: String(entry.id),
        type: entry.entry_type,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balance_after),
        note: entry.note,
        date: dateLabel(entry.created_at),
      })),
      games: matches.map((match) => ({
        id: match.match_code,
        players: match.players || user.display_name,
        bet: Number(match.bet_per_player),
        fee: Number(match.platform_fee),
        winner: match.winner_name || '',
        result: match.winner_id == null ? 'In progress' : String(match.winner_id) === String(user.id) ? 'Won' : 'Lost',
        payout: Number(match.payout),
        status: match.status === 'IN_PROGRESS' ? 'Live' : 'Finished',
        date: dateLabel(match.finished_at || match.started_at),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function patchUsersById(req, res, next) {
  try {
    const name = text(req.body?.name, 'Name', 100);
    const loginId = text(req.body?.loginId, 'Login ID', 50).toLowerCase();
    const phone = text(req.body?.phone || '', 'Phone', 30, false);
    const status = String(req.body?.status || '').toUpperCase();
    const validLoginId = /^[a-z0-9._-]{3,50}$/.test(loginId)
      || /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(loginId);
    if (!validLoginId) throw new HttpError(400, 'Enter a valid Login ID or email address.');
    if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new HttpError(400, 'Users can be Active or Inactive.');
    await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id FROM accounts WHERE id = ? AND master_id = ? AND role = 'PLAYER' FOR UPDATE`,
        [req.params.id, req.master.id]
      );
      if (!rows[0]) throw new HttpError(404, 'User not found.');
      const [[playing]] = await connection.execute(
        `SELECT EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = ? AND m.status = 'IN_PROGRESS') AS active`,
        [req.params.id]
      );
      if (playing.active) throw new HttpError(409, 'This user is in a live match. Try again after it finishes.');
      await connection.execute(
        `UPDATE accounts SET display_name = ?, login_id = ?, phone = ?, status = ?,
          status_before_block = NULL WHERE id = ? AND master_id = ? AND role = 'PLAYER'`,
        [name, loginId, phone || null, status, req.params.id, req.master.id]
      );
      await audit(connection, req, req.master.id, 'USER_UPDATED', 'PLAYER', req.params.id, `Status: ${status}; Login ID: ${loginId}`);
    });
    res.json({ ok: true, status: STATUS_LABELS[status] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(new HttpError(409, 'That Login ID is already in use.'));
    next(error);
  }
}

async function patchUsersByIdStatus(req, res, next) {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    if (!['block', 'unblock'].includes(action)) throw new HttpError(400, 'Action must be block or unblock.');
    const status = await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, display_name, status, status_before_block FROM accounts
         WHERE id = ? AND master_id = ? AND role = 'PLAYER' FOR UPDATE`,
        [req.params.id, req.master.id]
      );
      const user = rows[0];
      if (!user) throw new HttpError(404, 'User not found under this Master.');
      const [[playing]] = await connection.execute(
        `SELECT EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = ? AND m.status = 'IN_PROGRESS') AS active`,
        [user.id]
      );
      if (playing.active) throw new HttpError(409, 'This user is in a live match. The block can be applied after it finishes.');
      let nextStatus = user.status;
      if (action === 'block' && user.status !== 'BLOCKED') {
        nextStatus = 'BLOCKED';
        await connection.execute(
          `UPDATE accounts SET status_before_block = ?, status = 'BLOCKED' WHERE id = ?`,
          [user.status, user.id]
        );
      } else if (action === 'unblock' && user.status === 'BLOCKED') {
        nextStatus = user.status_before_block || 'ACTIVE';
        await connection.execute(
          `UPDATE accounts SET status = ?, status_before_block = NULL WHERE id = ?`,
          [nextStatus, user.id]
        );
      }
      await audit(connection, req, req.master.id, action === 'block' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
        'PLAYER', user.id, `User status: ${nextStatus}`);
      return nextStatus;
    });
    res.json({ ok: true, status: STATUS_LABELS[status] });
  } catch (error) {
    next(error);
  }
}

async function postUsersByIdWallet(req, res, next) {
  try {
    const type = String(req.body?.type || '').toLowerCase();
    if (!['deposit', 'withdraw'].includes(type)) throw new HttpError(400, 'Wallet action must be deposit or withdraw.');
    const value = amount(req.body?.amount);
    const note = text(req.body?.note, 'Transaction note', 500);
    const result = await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT a.id, a.display_name, a.status, uw.balance AS user_balance, mw.balance AS master_balance
         FROM accounts a
         JOIN wallets uw ON uw.account_id = a.id
         JOIN wallets mw ON mw.account_id = ?
         WHERE a.id = ? AND a.master_id = ? AND a.role = 'PLAYER'
         FOR UPDATE`,
        [req.master.id, req.params.id, req.master.id]
      );
      const user = rows[0];
      if (!user) throw new HttpError(404, 'User not found under this Master.');
      if (user.status === 'BLOCKED') throw new HttpError(409, 'Wallet actions are disabled for blocked users.');
      let userBalance = Number(user.user_balance);
      let masterBalance = Number(user.master_balance);
      if (type === 'deposit') {
        if (value > masterBalance) throw new HttpError(409, 'Master wallet has insufficient balance.');
        masterBalance -= value;
        userBalance += value;
      } else {
        const [[held]] = await connection.execute(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM user_withdrawal_requests
           WHERE user_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
          [user.id]
        );
        if (value > userBalance - Number(held.total)) {
          throw new HttpError(409, 'Withdrawal exceeds the user balance available after pending requests.');
        }
        userBalance -= value;
        masterBalance += value;
      }
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [userBalance, user.id]);
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [masterBalance, req.master.id]);
      const userType = type === 'deposit' ? 'DEPOSIT' : 'WITHDRAW';
      const masterType = type === 'deposit' ? 'DEDUCT' : 'ADD';
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
         VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
        [user.id, type === 'deposit' ? value : -value, userType, userBalance, req.master.id, note,
          req.master.id, type === 'deposit' ? -value : value, masterType, masterBalance, req.master.id, `${user.display_name}: ${note}`]
      );
      await audit(connection, req, req.master.id, `USER_WALLET_${type.toUpperCase()}`, 'PLAYER', user.id,
        `${value} credits; ${note}`);
      return { userBalance, masterBalance };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getUserWithdrawals(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.user_id, u.display_name AS user_name, r.request_type, r.amount, r.status, r.requested_at,
        r.reviewed_at, r.reason, COALESCE(w.balance, 0) AS user_balance
       FROM user_withdrawal_requests r
       JOIN accounts u ON u.id = r.user_id AND u.master_id = r.master_id AND u.role = 'PLAYER'
       LEFT JOIN wallets w ON w.account_id = r.user_id
       WHERE r.master_id = ? ORDER BY r.requested_at DESC`,
      [req.master.id]
    );
    res.json(rows.map((row) => ({
      id: row.id,
      userId: String(row.user_id),
      userName: row.user_name,
      type: row.request_type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
      amount: Number(row.amount),
      status: requestStatus(row.status),
      date: dateLabel(row.requested_at),
      userBalance: Number(row.user_balance),
      reason: row.reason || '',
      reviewedAt: dateLabel(row.reviewed_at),
    })));
  } catch (error) {
    next(error);
  }
}

async function patchUserWithdrawalsById(req, res, next) {
  try {
    const decision = String(req.body?.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Decision must be approve or reject.');
    const reason = text(req.body?.reason || '', 'Reason', 500, decision === 'REJECTED');
    const result = await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id, user_id, request_type, amount, status FROM user_withdrawal_requests
         WHERE id = ? AND master_id = ? FOR UPDATE`,
        [req.params.id, req.master.id]
      );
      const request = rows[0];
      if (!request) throw new HttpError(404, 'Wallet request not found under this Master.');
      if (request.status !== 'PENDING') throw new HttpError(409, 'This wallet request has already been reviewed.');
      const [wallets] = await connection.execute(
        `SELECT u.display_name, u.status AS user_status,
          uw.balance AS user_balance, mw.balance AS master_balance
         FROM accounts u JOIN wallets uw ON uw.account_id = u.id
         JOIN wallets mw ON mw.account_id = ?
         WHERE u.id = ? AND u.master_id = ? AND u.role = 'PLAYER'
         FOR UPDATE`,
        [req.master.id, request.user_id, req.master.id]
      );
      const user = wallets[0];
      if (!user) throw new HttpError(404, 'User not found under this Master.');
      let userBalance = Number(user.user_balance);
      let masterBalance = Number(user.master_balance);
      if (decision === 'APPROVED') {
        if (user.user_status === 'BLOCKED') throw new HttpError(409, 'Wallet requests cannot be approved for blocked users.');
        if (request.request_type === 'WITHDRAWAL') {
          const [[held]] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM user_withdrawal_requests
             WHERE user_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
            [request.user_id]
          );
          if (Number(held.total) > userBalance) throw new HttpError(409, 'User wallet no longer covers its pending withdrawal requests.');
          userBalance -= Number(request.amount);
          masterBalance += Number(request.amount);
        } else {
          const [[held]] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
             WHERE master_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
            [req.master.id]
          );
          if (Number(request.amount) > masterBalance - Number(held.total)) {
            throw new HttpError(409, 'Master wallet has insufficient available balance to approve this deposit.');
          }
          userBalance += Number(request.amount);
          masterBalance -= Number(request.amount);
        }
        await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [userBalance, request.user_id]);
        await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [masterBalance, req.master.id]);
        const isWithdrawal = request.request_type === 'WITHDRAWAL';
        await connection.execute(
          `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
           VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
          [request.user_id, isWithdrawal ? -Number(request.amount) : Number(request.amount),
            isWithdrawal ? 'WITHDRAW' : 'DEPOSIT', userBalance, req.master.id, reason || `${request.request_type} ${request.id}`,
            req.master.id, isWithdrawal ? Number(request.amount) : -Number(request.amount),
            isWithdrawal ? 'ADD' : 'DEDUCT', masterBalance, req.master.id,
            `${user.display_name}: ${reason || `${request.request_type} ${request.id}`}`]
        );
      }
      await connection.execute(
        `UPDATE user_withdrawal_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = ?, reason = ? WHERE id = ?`,
        [decision, req.master.id, reason || null, request.id]
      );
      await audit(connection, req, req.master.id, `USER_${request.request_type}_${decision}`, 'USER_WALLET_REQUEST', request.id,
        `${user.display_name}; ${request.amount} credits${reason ? `; ${reason}` : ''}`);
      return { id: request.id, status: requestStatus(decision), userBalance, masterBalance };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function postWithdrawals(req, res, next) {
  try {
    const type = String(req.body?.type || 'withdrawal').toLowerCase();
    if (!['deposit', 'withdrawal'].includes(type)) throw new HttpError(400, 'Request type must be deposit or withdrawal.');
    const value = amount(req.body?.amount);
    const requestId = randomUUID();
    const result = await transaction(async (connection) => {
      const [walletRows] = await connection.execute(
        'SELECT balance FROM wallets WHERE account_id = ? FOR UPDATE',
        [req.master.id]
      );
      const wallet = walletRows[0];
      if (!wallet) throw new HttpError(404, 'Master wallet not found.');
      const [[held]] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
         WHERE master_id = ? AND request_type = 'WITHDRAWAL' AND status = 'PENDING'`,
        [req.master.id]
      );
      const available = Number(wallet.balance) - Number(held.total);
      if (type === 'withdrawal' && value > available) {
        throw new HttpError(409, 'Withdrawal request exceeds available balance.');
      }
      await connection.execute(
        `INSERT INTO withdrawal_requests (id, master_id, amount, request_type, status)
         VALUES (?, ?, ?, ?, 'PENDING')`,
        [requestId, req.master.id, value, type === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL']
      );
      await audit(connection, req, req.master.id, `MASTER_${type.toUpperCase()}_REQUESTED`, 'WALLET_REQUEST', requestId,
        `${value} credits requested from Super Admin`);
      return { id: requestId, type, amount: value, status: 'Pending', date: dateLabel(new Date()), masterId: req.master.id };
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function getWallet(req, res, next) {
  try {
    const [ledger] = await pool.execute(
      `SELECT id, entry_type, amount, balance_after, note, created_at
       FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT 200`,
      [req.master.id]
    );
    const [withdrawals] = await pool.execute(
      `SELECT id, amount, status, requested_at, reviewed_at, reason, request_type
       FROM withdrawal_requests WHERE master_id = ? ORDER BY requested_at DESC`,
      [req.master.id]
    );
    const [[wallet]] = await pool.execute('SELECT balance FROM wallets WHERE account_id = ?', [req.master.id]);
    res.json({
      balance: Number(wallet?.balance || 0),
      ledger: ledger.map((row) => ({
        id: String(row.id),
        type: row.entry_type,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        note: row.note,
        date: dateLabel(row.created_at),
      })),
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        type: row.request_type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
        amount: Number(row.amount),
        status: requestStatus(row.status),
        date: dateLabel(row.requested_at),
        reviewedAt: dateLabel(row.reviewed_at),
        reason: row.reason || '',
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function getMatches(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT m.id, m.match_code, m.bet_per_player, m.platform_fee, m.payout, m.winner_id,
        m.status, m.started_at, m.finished_at, winner.display_name AS winner_name,
        GROUP_CONCAT(DISTINCT player.display_name ORDER BY player.id SEPARATOR ' vs ') AS players
       FROM matches m
       LEFT JOIN match_players mp ON mp.match_id = m.id
       LEFT JOIN accounts player ON player.id = mp.player_id
       LEFT JOIN accounts winner ON winner.id = m.winner_id
       WHERE m.master_id = ?
       GROUP BY m.id ORDER BY m.started_at DESC LIMIT 500`,
      [req.master.id]
    );
    res.json(rows.map((row) => ({
      id: row.match_code,
      players: row.players || '—',
      bet: Number(row.bet_per_player),
      fee: Number(row.platform_fee),
      winner: row.winner_name || '',
      payout: Number(row.payout),
      status: row.status === 'IN_PROGRESS' ? 'Live' : row.status === 'COMPLETED' ? 'Finished' : 'Cancelled',
      result: row.winner_name ? `Won: ${row.winner_name}` : row.status === 'IN_PROGRESS' ? 'In progress' : row.status,
      date: dateLabel(row.finished_at || row.started_at),
      time: timeLabel(row.finished_at || row.started_at),
      startedAt: row.started_at,
    })));
  } catch (error) {
    next(error);
  }
}

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That account or request already exists.' });
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Master database unavailable:', error.code);
    return res.status(503).json({ error: 'Database is unavailable. Check XAMPP MariaDB and server database settings.' });
  }
  console.error('Master API error:', error);
  return res.status(500).json({ error: 'The request could not be completed.' });
}

module.exports = {
  authenticatedMaster,
  getDashboard,
  getMatches,
  getMe,
  getUserWithdrawals,
  getUsers,
  getUsersById,
  getWallet,
  handleError,
  patchUserWithdrawalsById,
  patchUsersById,
  patchUsersByIdStatus,
  postUsers,
  postUsersByIdWallet,
  postWithdrawals,
};

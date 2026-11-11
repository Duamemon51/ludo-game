const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const { pool, transaction } = require('../db/pool');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AMOUNT = 999999999999.99;
const STATUS_LABELS = { ACTIVE: 'Active', INACTIVE: 'Inactive', BLOCKED: 'Blocked' };
const createTemporaryPassword = () => randomBytes(24).toString('base64url');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Super Admin authentication is not configured. Set a 32+ character JWT_SECRET.');
  }
  return secret;
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

function passwordText(value, required = true) {
  if (typeof value !== 'string' || (required && !value.length) || value.length > 200) {
    throw new HttpError(400, 'Password must be between 1 and 200 characters.');
  }
  return value;
}

function amount(value, field = 'Amount', allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number > MAX_AMOUNT || (allowZero ? number < 0 : number <= 0)) {
    throw new HttpError(400, `${field} must be ${allowZero ? 'zero or more' : 'greater than zero'} and within the supported limit.`);
  }
  return Math.round(number * 100) / 100;
}

function accountStatus(value) {
  const status = String(value || '').toUpperCase();
  if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(status)) {
    throw new HttpError(400, 'Invalid account status.');
  }
  return status;
}

function dateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function mapRequest(row) {
  return {
    id: row.id,
    masterId: String(row.master_id),
    masterName: row.master_name,
    type: row.request_type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal',
    amount: Number(row.amount),
    status: row.status[0] + row.status.slice(1).toLowerCase(),
    date: dateLabel(row.requested_at),
    reason: row.reason || '',
    reviewedAt: dateLabel(row.reviewed_at),
  };
}

async function audit(executor, req, actorId, action, targetType, targetId, details) {
  await executor.execute(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId || null, action, targetType, String(targetId || ''), details, req.ip || null]
  );
}

async function authenticatedSuperAdmin(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) throw new HttpError(401, 'Please sign in as Super Admin.');
    const claims = jwt.verify(token, requireJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'ludo-game',
      audience: 'ludo-superadmin',
    });
    if (claims.role !== 'SUPER_ADMIN' || !claims.sub) {
      throw new HttpError(403, 'Super Admin access is required.');
    }

    const [rows] = await pool.execute(
      'SELECT id, login_id, display_name, role, status FROM accounts WHERE id = ? LIMIT 1',
      [claims.sub]
    );
    const account = rows[0];
    if (!account || account.role !== 'SUPER_ADMIN' || account.status !== 'ACTIVE') {
      throw new HttpError(401, 'Super Admin session is no longer valid.');
    }
    req.admin = { id: account.id, loginId: account.login_id, name: account.display_name };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
      return next(new HttpError(401, 'Super Admin session is no longer valid.'));
    }
    next(error);
  }
}

function getAuthMe(req, res) { return res.json({ admin: req.admin }); }

async function getDashboard(req, res, next) {
  try {
    const [[masterStats]] = await pool.execute(
      `SELECT COUNT(*) AS total,
        SUM(status = 'ACTIVE') AS active
       FROM accounts WHERE role = 'MASTER'`
    );
    const [[userStats]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM accounts WHERE role = 'PLAYER'`
    );
    const [[matchStats]] = await pool.execute(
      `SELECT COUNT(*) AS matches_today, COALESCE(SUM(platform_fee), 0) AS fee_today
       FROM matches WHERE started_at >= CURRENT_DATE() AND started_at < CURRENT_DATE() + INTERVAL 1 DAY`
    );
    const [[withdrawalStats]] = await pool.execute(
      `SELECT COUNT(*) AS pending FROM withdrawal_requests WHERE status = 'PENDING'`
    );
    const [chartRows] = await pool.execute(
      `SELECT DATE(started_at) AS day, COUNT(*) AS matches_count,
        COALESCE(SUM(platform_fee), 0) AS fee_income
       FROM matches WHERE started_at >= CURRENT_DATE() - INTERVAL 6 DAY
       GROUP BY DATE(started_at) ORDER BY day`
    );
    res.json({
      totalMasters: Number(masterStats.total || 0),
      activeMasters: Number(masterStats.active || 0),
      totalUsers: Number(userStats.total || 0),
      matchesToday: Number(matchStats.matches_today || 0),
      platformFeeToday: Number(matchStats.fee_today || 0),
      pendingWithdrawals: Number(withdrawalStats.pending || 0),
      chart: chartRows.map((row) => ({
        day: new Date(row.day).toISOString().slice(0, 10),
        matches: Number(row.matches_count),
        fee: Number(row.fee_income),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function getMasters(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.display_name, a.login_id, a.phone, a.status, a.created_at, a.password_hash,
        COALESCE(w.balance, 0) AS wallet,
        (SELECT COUNT(*) FROM accounts p WHERE p.master_id = a.id AND p.role = 'PLAYER') AS user_count
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.role = 'MASTER' ORDER BY a.created_at DESC, a.id DESC`
    );
    res.json(rows.map((row) => ({
      id: String(row.id),
      name: row.display_name,
      loginId: row.login_id,
      phone: row.phone || '',
      password: row.password_hash || '',
      status: STATUS_LABELS[row.status],
      wallet: Number(row.wallet),
      users: Number(row.user_count),
      createdAt: dateLabel(row.created_at),
    })));
  } catch (error) {
    next(error);
  }
}

async function postMasters(req, res, next) {
  try {
    const name = text(req.body?.name, 'Name', 100);
    const loginId = text(req.body?.loginId, 'Login ID', 50).toLowerCase();
    const generateTemporaryPassword = req.body?.generateTemporaryPassword === true;
    const password = generateTemporaryPassword
      ? createTemporaryPassword()
      : text(req.body?.password, 'Password', 200);
    const phone = text(req.body?.phone || '', 'Phone', 30, false);
    const startingBalance = amount(req.body?.startingBalance || 0, 'Starting balance', true);
    const reason = text(req.body?.reason || 'Starting balance', 'Reason', 500);
    if (loginId.length < 3 || !/^[a-z0-9._-]+$/.test(loginId)) {
      throw new HttpError(400, 'Login ID must be 3–50 characters using letters, numbers, dots, underscores or hyphens.');
    }
    if (password.length < 8) throw new HttpError(400, 'Master password must be at least 8 characters.');

    const master = await transaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO accounts (login_id, display_name, phone, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'MASTER', 'ACTIVE')`,
        [loginId, name, phone || null, password]
      );
      const id = result.insertId;
      await connection.execute('INSERT INTO wallets (account_id, balance) VALUES (?, ?)', [id, startingBalance]);
      if (startingBalance > 0) {
        await connection.execute(
          `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
           VALUES (?, ?, 'ADD', ?, ?, ?)`,
          [id, startingBalance, startingBalance, req.admin.id, reason]
        );
      }
      await audit(connection, req, req.admin.id, 'MASTER_CREATED', 'MASTER', id, `Login ID: ${loginId}; starting balance: ${startingBalance}; note: ${reason}`);
      return { id: String(id), name, loginId, phone, status: 'Active', wallet: startingBalance, users: 0, createdAt: dateLabel(new Date()) };
    });
    if (generateTemporaryPassword) res.set('Cache-Control', 'no-store');
    res.status(201).json({
      ...master,
      ...(generateTemporaryPassword ? { temporaryPassword: password } : {}),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(new HttpError(409, 'That login ID is already in use.'));
    next(error);
  }
}

async function getMastersById(req, res, next) {
  try {
    const [masters] = await pool.execute(
      `SELECT a.id, a.display_name, a.login_id, a.phone, a.status, a.created_at, a.password_hash,
        COALESCE(w.balance, 0) AS wallet
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.id = ? AND a.role = 'MASTER' LIMIT 1`,
      [req.params.id]
    );
    const master = masters[0];
    if (!master) throw new HttpError(404, 'Master not found.');

    const [users] = await pool.execute(
      `SELECT a.id, a.display_name, a.login_id, a.status, a.status_before_block, COALESCE(w.balance, 0) AS balance,
        EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = a.id AND m.status = 'IN_PROGRESS') AS is_playing
       FROM accounts a LEFT JOIN wallets w ON w.account_id = a.id
       WHERE a.master_id = ? AND a.role = 'PLAYER' ORDER BY a.created_at DESC`,
      [master.id]
    );
    const [ledger] = await pool.execute(
      `SELECT l.id, l.amount, l.entry_type, l.balance_after, l.note, l.created_at,
        actor.display_name AS actor_name
       FROM ledger l LEFT JOIN accounts actor ON actor.id = l.actor_id
       WHERE l.account_id = ? ORDER BY l.id DESC LIMIT 200`,
      [master.id]
    );
    const [withdrawals] = await pool.execute(
      `SELECT wr.*, a.display_name AS master_name
       FROM withdrawal_requests wr JOIN accounts a ON a.id = wr.master_id
       WHERE wr.master_id = ? ORDER BY wr.requested_at DESC`,
      [master.id]
    );

    res.json({
      id: String(master.id),
      name: master.display_name,
      loginId: master.login_id,
      phone: master.phone || '',
      password: master.password_hash || '',
      status: STATUS_LABELS[master.status],
      wallet: Number(master.wallet),
      createdAt: dateLabel(master.created_at),
      users: users.map((user) => ({
        id: String(user.id),
        name: user.display_name,
        loginId: user.login_id,
        status: STATUS_LABELS[user.status],
        previousStatus: STATUS_LABELS[user.status === 'BLOCKED' ? (user.status_before_block || 'ACTIVE') : user.status],
        balance: Number(user.balance),
        gameState: user.is_playing ? 'Playing' : 'Idle',
      })),
      ledger: ledger.map((row) => ({
        id: String(row.id),
        type: row.entry_type.toLowerCase(),
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        actor: row.actor_name || 'System',
        reason: row.note,
        date: dateLabel(row.created_at),
      })),
      withdrawals: withdrawals.map(mapRequest),
    });
  } catch (error) {
    next(error);
  }
}

async function patchMastersById(req, res, next) {
  try {
    const name = text(req.body?.name, 'Name', 100);
    const loginId = text(req.body?.loginId, 'Login ID', 50).toLowerCase();
    const phone = text(req.body?.phone || '', 'Phone', 30, false);
    const generateTemporaryPassword = req.body?.generateTemporaryPassword === true;
    const password = generateTemporaryPassword ? createTemporaryPassword() : req.body?.password;
    if (!/^[a-z0-9._-]{3,50}$/.test(loginId)) {
      throw new HttpError(400, 'Invalid login ID format.');
    }
    if (password !== undefined && password !== '' && (
      typeof password !== 'string' || password.length < 8 || password.length > 200
    )) {
      throw new HttpError(400, 'New password must be between 8 and 200 characters.');
    }
    const passwordUpdate = password ? ', password_hash = ?' : '';
    const params = [name, loginId, phone || null];
    if (password) params.push(password);
    params.push(req.params.id);
    const [result] = await pool.execute(
      `UPDATE accounts SET display_name = ?, login_id = ?, phone = ?${passwordUpdate}
       WHERE id = ? AND role = 'MASTER'`,
      params
    );
    if (!result.affectedRows) throw new HttpError(404, 'Master not found.');
    await audit(
      pool,
      req,
      req.admin.id,
      'MASTER_UPDATED',
      'MASTER',
      req.params.id,
      `Updated master profile; login ID: ${loginId}${password ? '; password reset' : ''}`
    );
    if (generateTemporaryPassword) res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      ...(generateTemporaryPassword ? { temporaryPassword: password } : {}),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return next(new HttpError(409, 'That login ID is already in use.'));
    next(error);
  }
}

async function patchMastersByIdStatus(req, res, next) {
  try {
    const status = accountStatus(req.body?.status);
    if (!['ACTIVE', 'BLOCKED'].includes(status)) throw new HttpError(400, 'Masters can only be active or blocked.');
    const [result] = await pool.execute(
      `UPDATE accounts SET status = ? WHERE id = ? AND role = 'MASTER'`,
      [status, req.params.id]
    );
    if (!result.affectedRows) throw new HttpError(404, 'Master not found.');
    await audit(pool, req, req.admin.id, status === 'BLOCKED' ? 'MASTER_BLOCKED' : 'MASTER_UNBLOCKED', 'MASTER', req.params.id,
      status === 'BLOCKED' ? 'Master access blocked; linked users inherit blocked effective access.' : 'Master unblocked; linked users retain their own account status.');
    res.json({ ok: true, status: STATUS_LABELS[status] });
  } catch (error) {
    next(error);
  }
}

async function postMastersByIdWallet(req, res, next) {
  try {
    const type = String(req.body?.type || '').toLowerCase();
    if (!['add', 'deduct'].includes(type)) throw new HttpError(400, 'Wallet action must be add or deduct.');
    const value = amount(req.body?.amount);
    const reason = text(req.body?.reason, 'Reason', 500);
    const wallet = await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT a.id, a.display_name, a.role, w.balance
         FROM accounts a JOIN wallets w ON w.account_id = a.id
         WHERE a.id = ? FOR UPDATE`,
        [req.params.id]
      );
      const master = rows[0];
      if (!master || master.role !== 'MASTER') throw new HttpError(404, 'Master not found.');
      let held = 0;
      if (type === 'deduct') {
        const [[pending]] = await connection.execute(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawal_requests
           WHERE master_id = ? AND status = 'PENDING'`,
          [master.id]
        );
        held = Number(pending.total);
      }
      const balanceBefore = Number(master.balance);
      const balanceAfter = balanceBefore + (type === 'add' ? value : -value);
      if (type === 'deduct' && value > balanceBefore - held) {
        throw new HttpError(409, 'Deduction exceeds available balance after pending withdrawals.');
      }
      await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, master.id]);
      await connection.execute(
        `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [master.id, type === 'add' ? value : -value, type === 'add' ? 'ADD' : 'DEDUCT', balanceAfter, req.admin.id, reason]
      );
      await audit(connection, req, req.admin.id, type === 'add' ? 'MASTER_WALLET_CREDITED' : 'MASTER_WALLET_DEBITED',
        'MASTER', master.id, `${value} credits; ${reason}`);
      return { balance: balanceAfter };
    });
    res.json(wallet);
  } catch (error) {
    next(error);
  }
}

async function getWithdrawals(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new HttpError(400, 'Invalid withdrawal status.');
    const where = status ? 'WHERE wr.status = ?' : '';
    const params = status ? [status] : [];
    const [rows] = await pool.execute(
      `SELECT wr.*, a.display_name AS master_name
       FROM withdrawal_requests wr
       JOIN accounts a ON a.id = wr.master_id AND a.role = 'MASTER'
      ${where} ORDER BY wr.requested_at DESC`,
      params
    );
    res.json(rows.map(mapRequest));
  } catch (error) {
    next(error);
  }
}

async function patchWithdrawalsById(req, res, next) {
  try {
    const decision = String(req.body?.decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Decision must be approve or reject.');
    const reason = text(req.body?.reason || '', 'Reason', 500, decision !== 'REJECTED');
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        'SELECT id, master_id, amount, request_type, status FROM withdrawal_requests WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      const request = requests[0];
      if (!request) throw new HttpError(404, 'Withdrawal request not found.');
      if (request.status !== 'PENDING') throw new HttpError(409, 'This withdrawal request has already been reviewed.');

      const [wallets] = await connection.execute(
        `SELECT w.balance, a.display_name FROM wallets w JOIN accounts a ON a.id = w.account_id
         WHERE w.account_id = ? AND a.role = 'MASTER' FOR UPDATE`,
        [request.master_id]
      );
      if (!wallets[0]) throw new HttpError(404, 'Master wallet not found.');
      let balanceAfter = Number(wallets[0].balance);
      if (decision === 'APPROVED') {
        const isDeposit = request.request_type === 'DEPOSIT';
        if (!isDeposit && balanceAfter < Number(request.amount)) {
          throw new HttpError(409, 'Master wallet has insufficient balance.');
        }
        balanceAfter += isDeposit ? Number(request.amount) : -Number(request.amount);
        await connection.execute('UPDATE wallets SET balance = ? WHERE account_id = ?', [balanceAfter, request.master_id]);
        await connection.execute(
          `INSERT INTO ledger (account_id, amount, entry_type, balance_after, actor_id, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [request.master_id, isDeposit ? Number(request.amount) : -Number(request.amount), isDeposit ? 'ADD' : 'WITHDRAW', balanceAfter, req.admin.id,
            reason || `Approved ${isDeposit ? 'deposit' : 'withdrawal'} request ${request.id}`]
        );
      }
      await connection.execute(
        `UPDATE withdrawal_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = ?, reason = ? WHERE id = ?`,
        [decision, req.admin.id, reason || null, request.id]
      );
      const requestType = request.request_type === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL';
      await audit(connection, req, req.admin.id, `MASTER_${requestType}_${decision}`, 'WALLET_REQUEST', request.id,
        `${wallets[0].display_name}; ${request.amount} credits${reason ? `; ${reason}` : ''}`);
      return { id: request.id, type: requestType[0] + requestType.slice(1).toLowerCase(), status: decision[0] + decision.slice(1).toLowerCase(), balance: balanceAfter };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.display_name, p.login_id, p.status, p.status_before_block, p.master_id,
        m.display_name AS master_name, m.status AS master_status, COALESCE(w.balance, 0) AS balance,
        EXISTS(SELECT 1 FROM match_players mp JOIN matches gm ON gm.id = mp.match_id
          WHERE mp.player_id = p.id AND gm.status = 'IN_PROGRESS') AS is_playing
       FROM accounts p JOIN accounts m ON m.id = p.master_id
       LEFT JOIN wallets w ON w.account_id = p.id
       WHERE p.role = 'PLAYER' ORDER BY p.created_at DESC`
    );
    res.json(rows.map((row) => ({
      id: String(row.id),
      name: row.display_name,
      loginId: row.login_id,
      masterId: String(row.master_id),
      masterName: row.master_name,
      status: STATUS_LABELS[row.status],
      previousStatus: STATUS_LABELS[row.status === 'BLOCKED' ? (row.status_before_block || 'ACTIVE') : row.status],
      effectiveStatus: row.master_status === 'BLOCKED' ? 'Blocked' : STATUS_LABELS[row.status],
      balance: Number(row.balance),
      gameState: row.is_playing ? 'Playing' : 'Idle',
    })));
  } catch (error) {
    next(error);
  }
}

async function patchUsersByIdStatus(req, res, next) {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    if (!['block', 'unblock'].includes(action)) throw new HttpError(400, 'Action must be block or unblock.');
    const status = await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT status, status_before_block FROM accounts
         WHERE id = ? AND role = 'PLAYER' FOR UPDATE`,
        [req.params.id]
      );
      if (!rows[0]) throw new HttpError(404, 'Player not found.');
      const current = rows[0];
      let nextStatus;
      if (action === 'block') {
        if (current.status !== 'BLOCKED') {
          await connection.execute(
            `UPDATE accounts SET status_before_block = ?, status = 'BLOCKED' WHERE id = ?`,
            [current.status, req.params.id]
          );
        }
        nextStatus = 'BLOCKED';
      } else {
        nextStatus = current.status === 'BLOCKED' ? (current.status_before_block || 'ACTIVE') : current.status;
        if (current.status === 'BLOCKED') {
          await connection.execute(
            `UPDATE accounts SET status = ?, status_before_block = NULL WHERE id = ?`,
            [nextStatus, req.params.id]
          );
        }
      }
      await audit(connection, req, req.admin.id, action === 'block' ? 'PLAYER_BLOCKED' : 'PLAYER_UNBLOCKED',
        'PLAYER', req.params.id, `Player own status set to ${nextStatus}`);
      return nextStatus;
    });
    res.json({ ok: true, status: STATUS_LABELS[status] });
  } catch (error) {
    next(error);
  }
}

async function getMatches(req, res, next) {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const params = [];
    let filter = '';
    if (search) {
      filter = `WHERE gm.match_code LIKE ? OR master.display_name LIKE ? OR EXISTS (
        SELECT 1 FROM match_players sf JOIN accounts sa ON sa.id = sf.player_id
        WHERE sf.match_id = gm.id AND sa.display_name LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.execute(
      `SELECT gm.id, gm.match_code, gm.master_id, master.display_name AS master_name,
        gm.bet_per_player, gm.platform_fee, gm.payout, gm.status, gm.started_at,
        winner.display_name AS winner_name,
        GROUP_CONCAT(player.display_name ORDER BY player.display_name SEPARATOR ', ') AS player_names
       FROM matches gm JOIN accounts master ON master.id = gm.master_id
       LEFT JOIN accounts winner ON winner.id = gm.winner_id
       LEFT JOIN match_players mp ON mp.match_id = gm.id
       LEFT JOIN accounts player ON player.id = mp.player_id
       ${filter}
       GROUP BY gm.id ORDER BY gm.started_at DESC LIMIT 500`,
      params
    );
    res.json(rows.map((row) => ({
      id: row.match_code,
      masterId: String(row.master_id),
      masterName: row.master_name,
      users: row.player_names ? row.player_names.split(', ') : [],
      bet: Number(row.bet_per_player) * (row.player_names ? row.player_names.split(', ').length : 0),
      fee: Number(row.platform_fee),
      payout: Number(row.payout),
      winner: row.winner_name || '',
      result: row.status === 'IN_PROGRESS' ? 'In progress' : row.status === 'COMPLETED' ? 'Completed' : 'Cancelled',
      date: dateLabel(row.started_at),
    })));
  } catch (error) {
    next(error);
  }
}

async function getMoney(req, res, next) {
  try {
    const [[row]] = await pool.execute(
      `SELECT
        COALESCE((SELECT SUM(platform_fee) FROM matches), 0) AS platform_fees,
        COALESCE((SELECT SUM(amount) FROM ledger WHERE entry_type = 'ADD'), 0) AS master_credits,
        COALESCE((SELECT SUM(amount) FROM ledger WHERE entry_type = 'WITHDRAW'), 0) AS withdrawals,
        COALESCE((SELECT SUM(balance) FROM wallets w JOIN accounts a ON a.id = w.account_id
          WHERE a.role = 'MASTER'), 0) AS held_balance`
    );
    res.json({
      platformFees: Number(row.platform_fees),
      deposits: Number(row.master_credits),
      withdrawals: Math.abs(Number(row.withdrawals)),
      totalHeld: Number(row.held_balance),
    });
  } catch (error) {
    next(error);
  }
}

async function getAudit(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.ip_address, al.created_at,
        COALESCE(a.display_name, 'System') AS actor
       FROM audit_log al LEFT JOIN accounts a ON a.id = al.actor_id
       ORDER BY al.id DESC LIMIT 1000`
    );
    res.json(rows.map((row) => ({
      id: String(row.id),
      action: row.action,
      actor: row.actor,
      target: row.target_id || row.target_type,
      detail: row.details,
      ip: row.ip_address,
      date: dateLabel(row.created_at),
    })));
  } catch (error) {
    next(error);
  }
}

async function getSettings(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM platform_settings');
    const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    res.json({
      minimumBet: Number(values.minimum_bet ?? 300),
      feePercent: Number(values.platform_fee_percent ?? 10),
      tournamentEnabled: values.tournament_enabled === 'true',
      tournamentEntry: Number(values.tournament_entry ?? 300),
    });
  } catch (error) {
    next(error);
  }
}

async function putSettings(req, res, next) {
  try {
    const minimumBet = amount(req.body?.minimumBet, 'Minimum bet', true);
    const feePercent = amount(req.body?.feePercent, 'Platform fee', true);
    const tournamentEntry = amount(req.body?.tournamentEntry, 'Tournament entry', true);
    const tournamentEnabled = req.body?.tournamentEnabled;
    if (feePercent > 100) throw new HttpError(400, 'Platform fee cannot exceed 100%.');
    if (typeof tournamentEnabled !== 'boolean') throw new HttpError(400, 'Tournament enabled must be true or false.');

    await transaction(async (connection) => {
      const settings = [
        ['minimum_bet', String(minimumBet)],
        ['platform_fee_percent', String(feePercent)],
        ['tournament_enabled', String(tournamentEnabled)],
        ['tournament_entry', String(tournamentEntry)],
      ];
      for (const [key, value] of settings) {
        await connection.execute(
          `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
          [key, value, req.admin.id]
        );
      }
      await audit(connection, req, req.admin.id, 'SETTINGS_UPDATED', 'PLATFORM', 'settings',
        `Minimum bet ${minimumBet}; fee ${feePercent}%; tournament ${tournamentEnabled ? 'enabled' : 'disabled'}`);
    });
    res.json({ minimumBet, feePercent, tournamentEnabled, tournamentEntry });
  } catch (error) {
    next(error);
  }
}

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Super Admin database unavailable:', error.code);
    return res.status(503).json({ error: 'Database is unavailable. Check XAMPP MariaDB and server database settings.' });
  }
  console.error('Super Admin API error:', error);
  return res.status(500).json({ error: 'The request could not be completed.' });
}

module.exports = {
  authenticatedSuperAdmin,
  getAudit,
  getAuthMe,
  getDashboard,
  getMasters,
  getMastersById,
  getMatches,
  getMoney,
  getSettings,
  getUsers,
  getWithdrawals,
  handleError,
  patchMastersById,
  patchMastersByIdStatus,
  patchUsersByIdStatus,
  patchWithdrawalsById,
  postMasters,
  postMastersByIdWallet,
  putSettings,
};
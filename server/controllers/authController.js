const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('node:crypto');
const { pool } = require('../db/pool');

const LOGIN_FAILURE = 'Invalid login ID or password.';
const dummyHashPromise = bcrypt.hash(`invalid-${randomUUID()}`, 10);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Authentication is not configured. Set a 32+ character JWT_SECRET.');
  }
  return secret;
}

async function postLogin(req, res, next) {
  try {
    const loginId = typeof req.body?.loginId === 'string'
      ? req.body.loginId.trim().toLowerCase()
      : '';
    const password = req.body?.password;
    if (!loginId || loginId.length > 50 || typeof password !== 'string' || !password.length || password.length > 200) {
      throw new HttpError(400, 'Enter a valid Login ID and password.');
    }

    const [rows] = await pool.execute(
      `SELECT account.id, account.login_id, account.display_name, account.password_hash,
        account.role, account.status, master.status AS master_status
       FROM accounts account
       LEFT JOIN accounts master ON master.id = account.master_id
       WHERE account.login_id = ? LIMIT 1`,
      [loginId]
    );
    const account = rows[0];
    const validPassword = await bcrypt.compare(password, account?.password_hash || await dummyHashPromise);
    const canSignIn = account
      && validPassword
      && account.status !== 'BLOCKED'
      && (account.role === 'PLAYER'
        ? account.master_status === 'ACTIVE' || account.master_status === 'INACTIVE'
        : account.status === 'ACTIVE');
    if (!canSignIn) throw new HttpError(401, LOGIN_FAILURE);

    const audience = account.role === 'SUPER_ADMIN'
      ? 'ludo-superadmin'
      : `ludo-${account.role.toLowerCase()}`;
    const token = jwt.sign(
      { role: account.role },
      requireJwtSecret(),
      {
        subject: String(account.id),
        issuer: 'ludo-game',
        audience,
        expiresIn: '30m',
        algorithm: 'HS256',
      }
    );
    await pool.execute(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip_address)
       VALUES (?, 'ACCOUNT_LOGIN', 'ACCOUNT', ?, ?, ?)`,
      [account.id, String(account.id), `${account.role} signed in`, req.ip || null]
    );

    res.json({
      token,
      account: {
        id: String(account.id),
        loginId: account.login_id,
        name: account.display_name,
        role: account.role,
        status: account.status,
      },
      expiresIn: 1800,
    });
  } catch (error) {
    next(error);
  }
}

function handleError(error, req, res, next) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.status === 429) return res.status(429).json({ error: error.message });
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Authentication database unavailable:', error.code);
    return res.status(503).json({ error: 'Database is unavailable. Check XAMPP MariaDB and server database settings.' });
  }
  console.error('Authentication API error:', error);
  return res.status(500).json({ error: 'The request could not be completed.' });
}

module.exports = {
  handleError,
  loginLimiter,
  postLogin,
};

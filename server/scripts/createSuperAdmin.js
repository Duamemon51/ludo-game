require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');

async function createSuperAdmin() {
  const loginId = String(process.env.SUPERADMIN_LOGIN_ID || '').trim().toLowerCase();
  const name = String(process.env.SUPERADMIN_NAME || '').trim();
  const password = process.env.SUPERADMIN_PASSWORD || '';
  const validLoginId = /^[a-z0-9._-]{3,50}$/.test(loginId)
    || /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(loginId);
  if (!validLoginId) {
    throw new Error('Set SUPERADMIN_LOGIN_ID to a valid 3–50 character ID or email address.');
  }
  if (!name || name.length > 100) throw new Error('Set SUPERADMIN_NAME (1–100 characters).');
  if (password.length < 12 || password.length > 200) {
    throw new Error('Set SUPERADMIN_PASSWORD to a password between 12 and 200 characters.');
  }

  const [existing] = await pool.execute(
    `SELECT id FROM accounts WHERE role = 'SUPER_ADMIN' LIMIT 1`
  );
  if (existing.length) throw new Error('A Super Admin already exists. A second account cannot be created.');

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO accounts (login_id, display_name, password_hash, role, status)
     VALUES (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE')`,
    [loginId, name, passwordHash]
  );
  console.log(`Super Admin "${loginId}" created. Keep the password secret and remove its environment value.`);
}

createSuperAdmin()
  .catch((error) => {
    console.error(`Super Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

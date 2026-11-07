const { pool } = require('../db/pool');

function getRoot(req, res) {
  res.send('Ludo server is running');
}

async function getHealth(req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
}

module.exports = { getHealth, getRoot };

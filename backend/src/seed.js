require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function ensureUser(email, password, role) {
  if (!password || password.length < 8) throw new Error('Set a password (8+ chars) in .env for ' + email);
  const existing = await pool.query('select id from users where email = $1', [email]);
  if (existing.rows[0]) return console.log('exists:', email);
  const hash = await bcrypt.hash(password, 12);
  await pool.query('insert into users(email, password_hash, role) values ($1,$2,$3)', [email, hash, role]);
  console.log('created:', email, role);
}

async function main() {
  // The system "cash" account is the other side of every deposit and withdrawal.
  const sys = await pool.query('select id from accounts where is_system = true');
  if (!sys.rows[0]) {
    await pool.query('insert into accounts(is_system) values (true)');
    console.log('created system account');
  }
  await ensureUser('admin@ledgerline.test', process.env.SEED_ADMIN_PASSWORD, 'admin');
  await ensureUser('auditor@ledgerline.test', process.env.SEED_AUDITOR_PASSWORD, 'auditor');
  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
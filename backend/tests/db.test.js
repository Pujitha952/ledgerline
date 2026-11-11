require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const pool = require('../src/db');

test.after(() => pool.end());

async function mustReject(sql) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    let rejected = false;
    try { await c.query(sql); } catch (e) { rejected = /append-only/.test(e.message); }
    assert.ok(rejected, 'should have been rejected: ' + sql);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

test('audit_log is append-only (update, delete, truncate rejected)', async () => {
  await mustReject('update audit_log set action = action');
  await mustReject('delete from audit_log');
  await mustReject('truncate audit_log');
});

test('ledger_entries is append-only (update, delete, truncate rejected)', async () => {
  await mustReject('update ledger_entries set amount_minor = amount_minor');
  await mustReject('delete from ledger_entries');
  await mustReject('truncate ledger_entries');
});
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const PASSWORD = 'Passw0rd!123';

async function api(method, path, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function newUser() {
  const email = 't' + crypto.randomUUID().slice(0, 8) + '@test.com';
  await api('POST', '/api/auth/register', { body: { email, password: PASSWORD } });
  const r = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  return { token: r.json.token, id: r.json.user.id };
}
const key = () => crypto.randomUUID();

async function newFundedAccount(user, amount) {
  const acc = await api('POST', '/api/accounts', { token: user.token });
  await api('POST', '/api/transactions/deposit', { token: user.token, key: key(), body: { account_id: acc.json.id, amount_minor: amount } });
  return acc.json.id;
}
async function balance(user, id) {
  const r = await api('GET', '/api/accounts/' + id, { token: user.token });
  return Number(r.json.balance_minor);
}

test('deposit increases balance', async () => {
  const u = await newUser();
  const id = await newFundedAccount(u, 10000);
  assert.strictEqual(await balance(u, id), 10000);
});

test('same idempotency key pays only once', async () => {
  const u = await newUser();
  const id = await newFundedAccount(u, 10000);
  const k = key();
  const body = { account_id: id, amount_minor: 2000 };
  const a = await api('POST', '/api/transactions/withdraw', { token: u.token, key: k, body });
  const b = await api('POST', '/api/transactions/withdraw', { token: u.token, key: k, body });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 201);
  assert.strictEqual(a.json.transfer_id, b.json.transfer_id);
  assert.strictEqual(await balance(u, id), 8000);
});

test('same key with a different body is rejected', async () => {
  const u = await newUser();
  const id = await newFundedAccount(u, 10000);
  const k = key();
  await api('POST', '/api/transactions/withdraw', { token: u.token, key: k, body: { account_id: id, amount_minor: 100 } });
  const r = await api('POST', '/api/transactions/withdraw', { token: u.token, key: k, body: { account_id: id, amount_minor: 200 } });
  assert.strictEqual(r.status, 409);
});

test('10 simultaneous withdrawals can never overdraw', async () => {
  const u = await newUser();
  const id = await newFundedAccount(u, 10000);
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      api('POST', '/api/transactions/withdraw', { token: u.token, key: key(), body: { account_id: id, amount_minor: 3000 } })
    )
  );
  const ok = results.filter((r) => r.status === 201).length;
  assert.strictEqual(ok, 3);
  assert.strictEqual(await balance(u, id), 1000);
});

test('negative, zero, fractional amounts and extra fields are rejected', async () => {
  const u = await newUser();
  const id = await newFundedAccount(u, 1000);
  for (const body of [
    { account_id: id, amount_minor: -5 },
    { account_id: id, amount_minor: 0 },
    { account_id: id, amount_minor: 1.5 },
    { account_id: id, amount_minor: 5, owner_id: 'x' },
  ]) {
    const r = await api('POST', '/api/transactions/withdraw', { token: u.token, key: key(), body });
    assert.strictEqual(r.status, 400);
  }
});

test("a user cannot read or spend another user's account", async () => {
  const a = await newUser();
  const b = await newUser();
  const id = await newFundedAccount(a, 5000);
  const read = await api('GET', '/api/accounts/' + id, { token: b.token });
  assert.strictEqual(read.status, 404);
  const spend = await api('POST', '/api/transactions/withdraw', { token: b.token, key: key(), body: { account_id: id, amount_minor: 100 } });
  assert.strictEqual(spend.status, 404);
  assert.strictEqual(await balance(a, id), 5000);
});

test('transfer moves money and the ledger stays balanced', async () => {
  const a = await newUser();
  const b = await newUser();
  const from = await newFundedAccount(a, 5000);
  const to = (await api('POST', '/api/accounts', { token: b.token })).json.id;
  const r = await api('POST', '/api/transactions/transfer', { token: a.token, key: key(), body: { from_account_id: from, to_account_id: to, amount_minor: 1500 } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.entries.reduce((s, e) => s + e.amount_minor, 0), 0);
  assert.strictEqual(await balance(a, from), 3500);
  assert.strictEqual(await balance(b, to), 1500);
});

test('holders cannot read the audit log, auditor can, and money is conserved', async () => {
  const u = await newUser();
  assert.strictEqual((await api('GET', '/api/audit', { token: u.token })).status, 403);
  const login = await api('POST', '/api/auth/login', { body: { email: 'auditor@ledgerline.test', password: process.env.SEED_AUDITOR_PASSWORD } });
  const token = login.json.token;
  assert.strictEqual((await api('GET', '/api/audit', { token })).status, 200);
  const integrity = await api('GET', '/api/audit/integrity', { token });
  assert.strictEqual(integrity.json.ok, true);
});
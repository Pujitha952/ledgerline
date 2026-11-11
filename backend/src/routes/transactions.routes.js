const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const pool = require('../db');
const audit = require('../audit');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

class Fail extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const uuid = z.string().uuid();
const amount = z.number().int().positive().max(100000000);

// .strict() rejects unknown fields, so a client can't smuggle in extra data.
const singleSchema = z.object({ account_id: uuid, amount_minor: amount }).strict();
const transferSchema = z
  .object({ from_account_id: uuid, to_account_id: uuid, amount_minor: amount })
  .strict()
  .refine((b) => b.from_account_id !== b.to_account_id, { message: 'Cannot transfer to the same account' });

// Decides the two ledger entries (they always sum to zero). Runs AFTER the rows are locked.
function plan(kind, body, user, byId, sysId) {
  const amt = body.amount_minor;
  if (kind === 'transfer') {
    const from = byId[body.from_account_id];
    const to = byId[body.to_account_id];
    if (!from || from.is_system || from.owner_id !== user.id) throw new Fail(404, 'Account not found');
    if (!to || to.is_system) throw new Fail(404, 'Account not found');
    if (Number(from.balance_minor) < amt) throw new Fail(422, 'Insufficient funds');
    return [[from.id, -amt], [to.id, amt]];
  }
  const acct = byId[body.account_id];
  if (!acct || acct.is_system || acct.owner_id !== user.id) throw new Fail(404, 'Account not found');
  if (kind === 'deposit') return [[sysId, -amt], [acct.id, amt]];
  if (Number(acct.balance_minor) < amt) throw new Fail(422, 'Insufficient funds');
  return [[acct.id, -amt], [sysId, amt]];
}

async function run(req, res, next, kind, schema) {
  if (req.user.role !== 'holder') return res.status(403).json({ error: 'Forbidden' });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues.map((i) => i.message) });
  }
  const body = parsed.data;
  const key = req.get('Idempotency-Key');
  if (!key || key.length < 8 || key.length > 100) {
    return res.status(400).json({ error: 'Idempotency-Key header (8-100 characters) is required' });
  }
  const hash = crypto.createHash('sha256').update(kind + JSON.stringify(body)).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1) Idempotency: claim the key. A second identical request waits here until the first commits.
    const claim = await client.query(
      'insert into idempotency_keys(user_id, key, request_hash) values ($1,$2,$3) on conflict do nothing returning key',
      [req.user.id, key, hash]
    );
    if (!claim.rows[0]) {
      const ex = await client.query(
        'select request_hash, status_code, response from idempotency_keys where user_id = $1 and key = $2',
        [req.user.id, key]
      );
      await client.query('rollback');
      const row = ex.rows[0];
      if (row.request_hash !== hash) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
      }
      return res.status(row.status_code).set('Idempotent-Replay', 'true').json(row.response);
    }

    // 2) Lock every account involved, always in the same (sorted) order so two requests can't deadlock.
    const sys = (await client.query('select id from accounts where is_system = true limit 1')).rows[0];
    const wanted = [body.account_id, body.from_account_id, body.to_account_id, sys.id].filter(Boolean);
    const ids = [...new Set(wanted)];
    const locked = await client.query(
      'select id, owner_id, balance_minor, is_system from accounts where id = any($1::uuid[]) order by id for update',
      [ids]
    );
    const byId = Object.fromEntries(locked.rows.map((a) => [a.id, a]));

    // 3) Checks happen AFTER locking, so the balance we read can't change under us.
    const entries = plan(kind, body, req.user, byId, sys.id);

    // 4) Write the transfer, the two ledger rows and the new balances in the same transaction.
    const t = (
      await client.query(
        'insert into transfers(kind, amount_minor, created_by) values ($1,$2,$3) returning id, kind, amount_minor, created_at',
        [kind, body.amount_minor, req.user.id]
      )
    ).rows[0];
    for (const [accountId, delta] of entries) {
      await client.query('insert into ledger_entries(transfer_id, account_id, amount_minor) values ($1,$2,$3)', [t.id, accountId, delta]);
      await client.query('update accounts set balance_minor = balance_minor + $1 where id = $2', [delta, accountId]);
    }

    const response = {
      transfer_id: t.id,
      kind: t.kind,
      amount_minor: Number(t.amount_minor),
      created_at: t.created_at,
      entries: entries.map(([account_id, amount_minor]) => ({ account_id, amount_minor })),
    };
    await client.query('update idempotency_keys set status_code = 201, response = $3 where user_id = $1 and key = $2', [
      req.user.id, key, JSON.stringify(response),
    ]);
    await audit(req.user.id, 'money.' + kind, 'transfer', t.id, { amount_minor: body.amount_minor }, client);

    await client.query('commit');
    res.status(201).json(response);
  } catch (e) {
    try { await client.query('rollback'); } catch (_) {}
    if (e instanceof Fail) return res.status(e.status).json({ error: e.message });
    if (e.code === '23514') return res.status(422).json({ error: 'Insufficient funds' }); // DB safety net
    next(e);
  } finally {
    client.release();
  }
}

router.post('/deposit', (req, res, next) => run(req, res, next, 'deposit', singleSchema));
router.post('/withdraw', (req, res, next) => run(req, res, next, 'withdrawal', singleSchema));
router.post('/transfer', (req, res, next) => run(req, res, next, 'transfer', transferSchema));

// Statement: ledger rows for one account. Holders only for their own; admin/auditor for any customer account.
router.get('/account/:id', async (req, res, next) => {
  try {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid account id' });
    const a = (await pool.query('select id, owner_id from accounts where id = $1 and is_system = false', [req.params.id])).rows[0];
    const staff = req.user.role === 'admin' || req.user.role === 'auditor';
    if (!a || (!staff && a.owner_id !== req.user.id)) return res.status(404).json({ error: 'Account not found' });
    const r = await pool.query(
      `select le.id, le.transfer_id, t.kind, le.amount_minor, le.created_at
       from ledger_entries le join transfers t on t.id = le.transfer_id
       where le.account_id = $1 order by le.id desc limit 100`,
      [a.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

module.exports = router;
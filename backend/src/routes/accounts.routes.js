const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const audit = require('../audit');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const idSchema = z.string().uuid();
const isStaff = (user) => user.role === 'admin' || user.role === 'auditor';

// Only holders open accounts, and only for themselves.
router.post('/', requireRole('holder'), async (req, res, next) => {
  try {
    const count = await pool.query('select count(*)::int as n from accounts where owner_id = $1', [req.user.id]);
    if (count.rows[0].n >= 5) return res.status(400).json({ error: 'Account limit reached' });
    const r = await pool.query(
      'insert into accounts(owner_id) values ($1) returning id, owner_id, balance_minor, created_at',
      [req.user.id]
    );
    await audit(req.user.id, 'account.create', 'account', r.rows[0].id, null);
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// Holders see only their own accounts. Admin and auditor see all customer accounts.
router.get('/', async (req, res, next) => {
  try {
    const r = isStaff(req.user)
      ? await pool.query('select id, owner_id, balance_minor, created_at from accounts where is_system = false order by created_at')
      : await pool.query('select id, owner_id, balance_minor, created_at from accounts where owner_id = $1 and is_system = false order by created_at', [req.user.id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid account id' });
    const r = await pool.query(
      'select id, owner_id, balance_minor, created_at from accounts where id = $1 and is_system = false',
      [req.params.id]
    );
    const account = r.rows[0];
    // 404 (not 403) for someone else's account, so ids can't be probed.
    if (!account || (!isStaff(req.user) && account.owner_id !== req.user.id)) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (e) { next(e); }
});

module.exports = router;
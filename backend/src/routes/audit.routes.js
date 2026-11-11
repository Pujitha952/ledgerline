const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'auditor'));

router.get('/', async (req, res, next) => {
  try {
    const r = await pool.query('select id, actor_id, action, entity, entity_id, details, created_at from audit_log order by id desc limit 200');
    res.json(r.rows);
  } catch (e) { next(e); }
});

// Money-conservation check: ledger sums to zero, and every balance equals its ledger entries.
router.get('/integrity', async (req, res, next) => {
  try {
    const r = await pool.query(
      `select
         (select coalesce(sum(amount_minor),0) from ledger_entries)::text as ledger_total,
         (select count(*) from accounts a
            where a.balance_minor <> coalesce((select sum(amount_minor) from ledger_entries le where le.account_id = a.id),0))::int as mismatched_accounts`
    );
    const { ledger_total, mismatched_accounts } = r.rows[0];
    res.json({ ledger_total, mismatched_accounts, ok: ledger_total === '0' && mismatched_accounts === 0 });
  } catch (e) { next(e); }
});

module.exports = router;
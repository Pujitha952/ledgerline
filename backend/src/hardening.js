const pool = require('./db');

const sql = `
drop trigger if exists audit_no_truncate on audit_log;
drop trigger if exists ledger_no_truncate on ledger_entries;
create trigger audit_no_truncate before truncate on audit_log
  for each statement execute function block_changes();
create trigger ledger_no_truncate before truncate on ledger_entries
  for each statement execute function block_changes();
`;

pool.query(sql)
  .then(() => { console.log('Truncate protection added.'); return pool.end(); })
  .catch((e) => { console.error(e.message); return pool.end(); });
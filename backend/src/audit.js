const pool = require('./db');

// Writes one row to the append-only audit_log table.
async function audit(actorId, action, entity, entityId, details, db = pool) {
  await db.query(
    'insert into audit_log(actor_id, action, entity, entity_id, details) values ($1,$2,$3,$4,$5)',
    [actorId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = audit;
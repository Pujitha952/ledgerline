const pool = require('./db');
pool.query('select now()').then(r => {
  console.log('DB connected:', r.rows[0]);
  pool.end();
}).catch(e => { console.error('DB error:', e.message); pool.end(); });
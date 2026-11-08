const jwt = require('jsonwebtoken');
const pool = require('./db');

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

// Checks the token, then loads the user's role from the DATABASE (never trusts the token for the role).
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const r = await pool.query('select id, email, role from users where id = $1', [payload.sub]);
    if (!r.rows[0]) return res.status(401).json({ error: 'Invalid token' });
    req.user = r.rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
}

module.exports = { signToken, requireAuth, requireRole };
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const pool = require('../db');
const audit = require('../audit');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

const credentials = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(72),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
});

// Public sign-up ALWAYS creates a 'holder'. A client can never choose its own role.
router.post('/register', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password (min 8 characters)' });
    const { email, password } = parsed.data;
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      "insert into users(email, password_hash, role) values ($1,$2,'holder') returning id, email, role",
      [email, hash]
    );
    await audit(r.rows[0].id, 'user.register', 'user', r.rows[0].id, null);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(e);
  }
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password' });
    const { email, password } = parsed.data;
    const r = await pool.query('select id, email, role, password_hash from users where email = $1', [email]);
    const user = r.rows[0];
    // Always run bcrypt so a wrong email takes the same time as a wrong password.
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      await audit(user ? user.id : null, 'user.login_failed', 'user', user ? user.id : null, { email });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await audit(user.id, 'user.login', 'user', user.id, null);
    res.json({ token: signToken(user), user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = router;
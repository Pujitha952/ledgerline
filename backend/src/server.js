require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'upgrade-insecure-requests': null },
    },
    hsts: false,
  })
);
app.use(express.json({ limit: '10kb' }));

// Serves the web screen from backend/public
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/accounts', require('./routes/accounts.routes'));
app.use('/api/transactions', require('./routes/transactions.routes'));
app.use('/api/audit', require('./routes/audit.routes'));

// Last-resort error handler: never leak internals to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = process.env.PORT || 8080;
const server = app.listen(port);
server.on('listening', () => console.log('API running on port ' + port));
server.on('error', (err) => {
  console.error('Could not start server:', err.message);
  process.exit(1);
});
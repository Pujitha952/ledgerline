require('dotenv').config();
const express = require('express');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/accounts', require('./routes/accounts.routes'));

// Last-resort error handler: never leak internals to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('API running on port ' + port));
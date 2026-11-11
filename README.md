# LedgerLine

A small money-movement web app: holders deposit, withdraw and transfer money, every movement is a balanced double-entry ledger record, repeated requests never pay twice, and an append-only audit log records who did what.

Live: https://ledgerline-poojitha.onrender.com (free plan: the first load can take about a minute)
Test login: auditor@ledgerline.test / <YOUR AUDITOR PASSWORD>. Anyone can register as a holder.

## What works
- Register and login. Public sign-up always creates a holder; the server never accepts a role from the client.
- Roles enforced on the server: holder (own accounts only); auditor and admin (read-only views of accounts, audit log and integrity check).
- Accounts, deposit, withdraw, transfer, and an account statement.
- Double-entry ledger: every movement writes two rows that sum to zero.
- Idempotency: an Idempotency-Key header is required; the same key never pays twice, and the same key with a different body returns 409.
- Concurrency: accounts are row-locked in a database transaction; 10 simultaneous withdrawals never overdraw.
- Negative balances blocked in code and by a database CHECK constraint.
- Append-only audit log and ledger: database triggers reject update, delete and truncate.
- Integrity endpoint: the ledger total is 0 and every balance matches its ledger rows.
- 10 automated tests (money rules, access control, append-only tables).

## Run locally
1. Node 20+ and a PostgreSQL database.
2. cd backend && npm install
3. Create backend/.env with DATABASE_URL, JWT_SECRET, SEED_ADMIN_PASSWORD, SEED_AUDITOR_PASSWORD
4. Run the SQL in backend/schema.sql on your database, then: node src/seed.js
5. node src/server.js and open http://localhost:8080
6. With the server running: npm test

## Not finished
- No admin screen to create users or accounts for others.
- No password reset or email verification.
- Login tokens last 1 hour and cannot be revoked early.
- Failed money attempts (wrong owner, insufficient funds) are not written to the audit log; only successful movements are.
- The web screen is minimal.
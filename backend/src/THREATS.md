# THREATS.md

| Threat | Attack | Defence | Test |
|--------|--------|---------|------|
| Self-promotion | Register with role=admin | Server always creates holders; role is read from the database on every request | Checked by hand: registered with role admin, got holder |
| Reading or spending another user's account | Guess an account id | Ownership check; 404 for non-owners | money.test.js: "a user cannot read or spend another user's account" |
| Probing which accounts exist | Compare error messages for missing accounts | One "Account not found" message for source and destination | No automated test |
| Duplicate payment | Send the same request twice | Idempotency key stored per user with a request hash | money.test.js: "same idempotency key pays only once" |
| Key reuse with a different amount | Reuse a key with a new body | Request hash mismatch returns 409 | money.test.js: "same key with a different body is rejected" |
| Overdraw by racing requests | 10 withdrawals at once | Row locks in sorted order, balance checked after locking, DB CHECK as a backstop | money.test.js: "10 simultaneous withdrawals can never overdraw" |
| Bad amounts | Negative, zero, fractional, extra fields | Strict schema validation, integer minor units | money.test.js: "negative, zero, fractional amounts and extra fields are rejected" |
| Rewriting history | Update, delete or truncate ledger or audit rows | Database triggers reject all three | db.test.js: both append-only tests |
| Reading the audit log as a holder | Call /api/audit | Role check returns 403 | money.test.js: "holders cannot read the audit log..." |
| Money created or lost | Bug in a transaction | Two ledger rows sum to zero; integrity endpoint checks totals | money.test.js: integrity check |
| Password guessing | Many login attempts | Rate limit on login, bcrypt, same error for wrong email or password | No automated test |
| Leaked secrets | Committing .env | .env is git-ignored | Checked with git status |
| Stolen token | Reuse a token for up to 1 hour | Short expiry; role loaded from the database on each request | Known limit: no revocation |
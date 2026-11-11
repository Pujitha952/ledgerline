# PROMPTS.md

## 2026-11-08: Neon connection string
- Asked: how to connect the backend to a Neon Postgres database.
- AI produced: a connection string ending in channel_binding=require.
- Wrong: Node's pg library can fail with that option; I also pasted my database password into the chat by mistake.
- Did: removed channel_binding, reset the database password, kept the string only in backend/.env (git-ignored).

## 2026-11-11: PowerShell command
- Asked: how to list the files in a folder.
- AI produced: `dir src\routes /b`.
- Wrong: /b is a Command Prompt option and fails in PowerShell.
- Did: used `(Get-ChildItem src\routes).Name` instead.

## 2026-11-11: Test command
- Asked: how to run my test file.
- AI produced: `node --test tests/` and a package.json scripts edit.
- Wrong: on Node 24 giving --test a folder name failed without running any tests, and my edit put the command in the wrong place in package.json.
- Did: set "test": "node --test" in scripts and ran `npm test`; all tests then ran.

## 2026-11-11: Server started but the page showed "Cannot GET /"
- Asked: how to serve a web page from the API.
- AI produced: startup code that printed "API running" without checking the port was free.
- Wrong: an old server copy still held port 8080; the message looked like success.
- Did: stopped all node processes and added an `error` handler on the server so a failed start exits with a message. I saw it work later ("Could not start server: EADDRINUSE").

## 2026-11-11: Authorisation review, transfer errors
- Asked: AI to write the transfer endpoint with ownership checks.
- AI produced: separate messages, "Account not found" for the source and "Destination account not found" for the target.
- Wrong: the different messages let a logged-in user probe which account ids exist.
- Did: made both return "Account not found". Commit: https://github.com/Pujitha952/ledgerline/commit/d8bb7c9

## 2026-11-11: Audit trail review, truncate
- Asked: AI to make the audit log and ledger append-only.
- AI produced: triggers that reject UPDATE and DELETE.
- Wrong: TRUNCATE bypasses row triggers, so the whole audit log could still be erased.
- Did: added statement-level BEFORE TRUNCATE triggers (https://github.com/Pujitha952/ledgerline/commit/4730d19) and a test that runs update, delete and truncate inside a rolled-back transaction and checks all three are rejected (https://github.com/Pujitha952/ledgerline/commit/a8722d9). My first commit message mentioned the test before I had created the file, so I added it in a follow-up commit.
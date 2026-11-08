# PROMPTS.md

## 2026-11-08: Neon connection string
- Asked: how to connect the backend to a Neon Postgres database.
- AI produced: a connection string ending in channel_binding=require.
- Wrong: Node's pg library can fail with that option, and I also pasted my password into the chat by mistake.
- Fixed: removed channel_binding, reset the database password, and kept the string only in backend/.env (git-ignored).
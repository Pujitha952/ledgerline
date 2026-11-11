create table users(
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin','holder','auditor')),
  created_at timestamptz default now());

create table accounts(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id),
  is_system boolean not null default false,
  balance_minor bigint not null default 0,
  created_at timestamptz default now(),
  check (is_system or balance_minor >= 0));

create table transfers(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('deposit','withdrawal','transfer')),
  amount_minor bigint not null check (amount_minor > 0),
  created_by uuid not null references users(id),
  created_at timestamptz default now());

create table ledger_entries(
  id bigserial primary key,
  transfer_id uuid not null references transfers(id),
  account_id uuid not null references accounts(id),
  amount_minor bigint not null,
  created_at timestamptz default now());

create table idempotency_keys(
  user_id uuid not null references users(id),
  key text not null,
  request_hash text not null,
  status_code int,
  response jsonb,
  primary key (user_id, key));

create table audit_log(
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz default now());

create function block_changes() returns trigger as $$
begin raise exception 'append-only table'; end $$ language plpgsql;

create trigger audit_append_only before update or delete on audit_log
  for each row execute function block_changes();
create trigger ledger_append_only before update or delete on ledger_entries
  for each row execute function block_changes();
create trigger audit_append_only before update or delete on audit_log
  for each row execute function block_changes();
create trigger ledger_append_only before update or delete on ledger_entries
  for each row execute function block_changes();

create trigger audit_no_truncate before truncate on audit_log
  for each statement execute function block_changes();
create trigger ledger_no_truncate before truncate on ledger_entries
  for each statement execute function block_changes();
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('token');
let user = JSON.parse(sessionStorage.getItem('user') || 'null');

const fmt = (minor) => (Number(minor) / 100).toFixed(2);
const show = (el, yes) => { el.hidden = !yes; };
function msg(text, ok) { const m = $('msg'); m.textContent = text || ''; m.className = ok ? 'ok' : 'err'; }

async function api(method, path, body, key) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  return data;
}

async function doAuth(register) {
  try {
    const email = $('email').value.trim();
    const password = $('password').value;
    if (register) await api('POST', '/auth/register', { email, password });
    const r = await api('POST', '/auth/login', { email, password });
    token = r.token;
    user = r.user;
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
    $('password').value = '';
    msg('', true);
    await start();
  } catch (e) { msg(e.message, false); }
}

function logout() {
  token = null; user = null;
  sessionStorage.clear();
  start();
}

async function loadAccounts() {
  const list = await api('GET', '/accounts');
  const box = $('accounts');
  const sel = $('fromAccount');
  box.replaceChildren();
  sel.replaceChildren();
  if (!list.length) { const p = document.createElement('p'); p.textContent = 'No accounts yet.'; box.append(p); }
  for (const a of list) {
    const row = document.createElement('div');
    row.className = 'row';
    const id = document.createElement('code'); id.textContent = a.id;
    const bal = document.createElement('strong'); bal.textContent = '₹' + fmt(a.balance_minor);
    const btn = document.createElement('button'); btn.textContent = 'Statement';
    btn.onclick = () => statement(a.id);
    row.append(id, bal, btn);
    box.append(row);
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.id.slice(0, 8) + '… ₹' + fmt(a.balance_minor);
    sel.append(o);
  }
}

async function statement(id) {
  try {
    const rows = await api('GET', '/transactions/account/' + id);
    $('statement').textContent = rows.length
      ? rows.map((r) => new Date(r.created_at).toLocaleString() + '  ' + r.kind.padEnd(10) + (r.amount_minor > 0 ? '+' : '') + fmt(r.amount_minor)).join('\n')
      : 'No transactions yet.';
  } catch (e) { msg(e.message, false); }
}

async function start() {
  const loggedIn = !!token && !!user;
  show($('authView'), !loggedIn);
  show($('appView'), loggedIn);
  show($('logout'), loggedIn);
  $('who').textContent = loggedIn ? user.email + ' (' + user.role + ')' : '';
  if (!loggedIn) return;
  const holder = user.role === 'holder';
  show($('holderTools'), holder);
  show($('newAccount'), holder);
  show($('staffTools'), !holder);
  try { await loadAccounts(); }
  catch (e) { if (/Not logged in|Invalid token/.test(e.message)) logout(); else msg(e.message, false); }
}

$('authForm').addEventListener('submit', (e) => { e.preventDefault(); doAuth(false); });
$('registerBtn').addEventListener('click', () => doAuth(true));
$('logout').addEventListener('click', logout);
$('kind').addEventListener('change', () => show($('toWrap'), $('kind').value === 'transfer'));

$('newAccount').addEventListener('click', async () => {
  try { await api('POST', '/accounts'); msg('Account opened.', true); await loadAccounts(); }
  catch (e) { msg(e.message, false); }
});

$('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kind = $('kind').value;
  const raw = $('amount').value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return msg('Enter a valid amount like 100 or 100.50', false);
  const amount_minor = Math.round(Number(raw) * 100);
  const from = $('fromAccount').value;
  try {
    let path, body;
    if (kind === 'transfer') {
      path = '/transactions/transfer';
      body = { from_account_id: from, to_account_id: $('toAccount').value.trim(), amount_minor };
    } else {
      path = '/transactions/' + kind;
      body = { account_id: from, amount_minor };
    }
    await api('POST', path, body, crypto.randomUUID());
    msg('Done.', true);
    $('amount').value = '';
    await loadAccounts();
  } catch (err) { msg(err.message, false); }
});

$('loadAudit').addEventListener('click', async () => {
  try {
    const rows = await api('GET', '/audit');
    $('staffOut').textContent = rows.map((r) => r.created_at + '  ' + r.action + '  ' + (r.entity_id || '')).join('\n');
  } catch (e) { msg(e.message, false); }
});

$('loadIntegrity').addEventListener('click', async () => {
  try { $('staffOut').textContent = JSON.stringify(await api('GET', '/audit/integrity'), null, 2); }
  catch (e) { msg(e.message, false); }
});

start();
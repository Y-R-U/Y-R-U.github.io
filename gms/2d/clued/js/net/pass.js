// br8t Pass gift codes. The Pass belongs to the br8t account (all br8t games), so a code
// used here also counts in RAGDOJO and the rest. Same-origin only: /api/br8t/ lives on games.br8t.com.
const API = '/api/br8t/';

async function token() {
  const m = await import('/lib/auth/auth.js').catch(() => null);
  if (!m) return null;
  try { await Promise.race([m.auth.ready(), new Promise((_, no) => setTimeout(no, 5000))]); } catch (e) { return null; }
  if (!m.auth.signedIn) return null;
  return Promise.race([m.auth.getIdToken().catch(() => null), new Promise(r => setTimeout(() => r(null), 5000))]);
}

// Resolves to the Pass end (unix s) or 0; null when signed out or unreachable.
export async function passUntil() {
  const tok = await token();
  if (!tok) return null;
  try {
    const res = await fetch(API + 'entitlement', { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) return null;
    const d = await res.json();
    return d.pass?.active ? d.pass.periodEnd || 0 : 0;
  } catch (e) { return null; }
}

export async function redeemCode(code) {
  const tok = await token();
  if (!tok) throw new Error('Sign in first, so the Pass goes on your br8t account.');
  let res;
  try {
    res = await fetch(API + 'redeem', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  } catch (e) { throw new Error('Codes are unavailable right now. Try again later.'); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Codes are unavailable right now. Try again later.');
  return d.until;
}

export const fmtDate = s => new Date(s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/* ------------------------------------------------- online-game allowance */
// The host's account spends one use per online game started; a Pass is unlimited. Server rooms and
// leaderboard challenges are spent by the Clued server; device rooms spend here, before the start.
export const GAME = 'clued';

// Resolves to the allowance state, or null when signed out, unreachable or not configured.
export async function allowanceState() {
  const tok = await token();
  if (!tok) return null;
  try {
    const res = await fetch(`${API}allowance?game=${GAME}`, { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}

// Is the allowance service here at all? (Pages has no /api/br8t/: device rooms there stay open.)
let liveP = null;
export const allowanceLive = () => liveP || (liveP = fetch(API + 'health', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null)).then(d => !!d?.ok).catch(() => false));

// { status: 'ok' | 'denied' | 'signin' | 'open', allowance }. Anything unclear is 'open': play never waits on payments.
export async function spendGame(id) {
  const tok = await token();
  if (!tok) return { status: (await allowanceLive()) ? 'signin' : 'open' };
  try {
    const res = await fetch(API + 'allowance', { method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ game: GAME, id }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 429) return { status: 'denied', allowance: d.allowance };
    return { status: res.ok ? 'ok' : 'open', allowance: d.allowance };
  } catch (e) { return { status: 'open' }; }
}

export function allowanceText(a) {
  if (!a) return '';
  if (a.unlimited) return 'Unlimited online games with your br8t Pass';
  const extra = a.topUpExtra > 0 ? ` (${a.perDay - a.topUpExtra} free + ${a.topUpExtra} extra)` : '';
  return `Online games today: ${Math.max(0, a.remaining)} of ${a.perDay} left${extra}`;
}

export const outOfGames = a => !!a && !a.unlimited && a.remaining <= 0;
// Can this account claim a free top-up right now? (topUpSize 0 = the payments service has none for Clued)
export const canTopUp = a => outOfGames(a) && a.topUpSize > 0 && a.topUpsLeft > 0;
// Out of games and every free top-up claimed today.
export const doneForToday = a => outOfGames(a) && a.topUpSize > 0 && a.topUpsLeft <= 0;

// Claims a free top-up (the payments service grants topUpSize more games today, at 0 left, up to topUpMax a day).
// { status: 'ok' | 'cap' | 'left' | 'unlimited' | 'signin' | 'error', allowance }. A retried claim reuses its id.
export async function topUp(id = uuid()) {
  const tok = await token();
  if (!tok) return { status: 'signin' };
  try {
    const res = await fetch(API + 'allowance/topup', { method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ game: GAME, id }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) return { status: 'ok', allowance: d.allowance, granted: d.granted };
    const status = { topup_cap: 'cap', games_left: 'left', unlimited: 'unlimited' }[d.code] || 'error';
    return { status, allowance: d.allowance };
  } catch (e) { return { status: 'error' }; }
}
export const uuid = () => crypto.randomUUID?.() || '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

// The br8t Pass prices ({ monthly, yearly } display strings), or {} when the shop is unreachable.
let offerP = null;
export const passPrices = () => offerP || (offerP = fetch(API + 'offer', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
  const out = {};
  for (const it of d?.items || []) {
    if (it.entitlement !== 'br8t_pass' || !it.amount) continue;
    const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: String(it.currency || 'aud').toUpperCase() }).format(it.amount / 100);
    out[it.interval === 'year' ? 'yearly' : 'monthly'] = money;
  }
  return out;
}).catch(() => { offerP = null; return {}; }));

// Opens Stripe Checkout for a br8t Pass (product 'br8t_pass_monthly' | 'br8t_pass_yearly'); resolves only on failure.
export async function buyPass(product) {
  const tok = await token();
  if (!tok) throw new Error('Sign in first, so the Pass goes on your br8t account.');
  const post = game => fetch(API + 'checkout', { method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product, game }) });
  let res;
  try {
    res = await post('clued');
    if (res.status === 400) res = await post('hub');   // a payments build without Clued's return page
  } catch (e) { throw new Error('The shop is unavailable right now. Try again later.'); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error || 'The shop is unavailable right now. Try again later.');
  location.assign(d.url);
}

// Local time the allowance resets (the next UTC midnight).
export const resetTime = (a, opts = { hour: 'numeric', minute: '2-digit' }) =>
  a?.resetsAt ? new Date(a.resetsAt * 1000).toLocaleTimeString(undefined, opts) : '';

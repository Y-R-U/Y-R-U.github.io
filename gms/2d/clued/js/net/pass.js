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

const shortDay = ymd => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function allowanceText(a) {
  if (!a) return '';
  if (a.unlimited) return 'Unlimited online games with your br8t Pass';
  const base = a.perDay - (a.promoPerDay || 0);
  const parts = a.promoPerDay > 0 ? ` (${base} free + ${a.promoPerDay} bonus until ${shortDay(a.promoUntil)})` : '';
  return `Online games today: ${Math.max(0, a.remaining)} of ${a.perDay} left${parts}`;
}

export const outOfGames = a => !!a && !a.unlimited && a.remaining <= 0;

// Local time the allowance resets (the next UTC midnight).
export const resetTime = (a, opts = { hour: 'numeric', minute: '2-digit' }) =>
  a?.resetsAt ? new Date(a.resetsAt * 1000).toLocaleTimeString(undefined, opts) : '';

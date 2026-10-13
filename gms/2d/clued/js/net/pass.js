// br8t Pass gift codes. The Pass belongs to the br8t account (all br8t games), so a code
// used here also counts in RAGDOJO and the rest. Same-origin only: /api/br8t/ lives on games.br8t.com.
const API = '/api/br8t/';

async function token() {
  const m = await import('/lib/auth/auth.js').catch(() => null);
  if (!m) return null;
  try { await m.auth.ready(); } catch (e) { return null; }
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

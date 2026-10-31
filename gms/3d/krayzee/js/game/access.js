// br8t Pass access (D36, docs/ACCESS.md). One in-memory instance per page; nothing here is ever saved.
// Free: intro + Missions 1–4, Free Flight, every airport, 3 online games a day (counted by the room server).
// Pass: Missions 5+ and unlimited online. Planes, ranks and tasks are never gated.
// Fail-open: unless data/access.js says 'on', limits only apply while the payments API reports LIVE (testMode false).
import { ACCESS } from '../../data/access.js';

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/;

export function accessConfig(loc = globalThis.location) {
  let Q;
  try { Q = new URLSearchParams(loc?.search || ''); } catch (e) { Q = new URLSearchParams(); }
  const host = loc?.hostname || '';
  const enforce = ['on', 'off', 'auto'].includes(Q.get('access')) ? Q.get('access') : ACCESS.enforce;
  // A test payments API is honoured only from a local page and only when it is itself local.
  let api = ACCESS.api, testApi = false;
  const pa = Q.get('payapi');
  if (pa && LOCAL.test(host)) { try { const u = new URL(pa); if (LOCAL.test(u.hostname)) { api = u.href.replace(/\/?$/, '/'); testApi = true; } } catch (e) { /* ignored */ } }
  const onHub = ACCESS.liveHosts.includes(host) || testApi;
  const devUid = testApi && /^[\w-]{1,40}$/.test(Q.get('uid') || '') ? Q.get('uid') : null;
  return { enforce, api, onHub, testApi, devUid, noAccount: Q.has('noaccount') };
}

export const missionNeedsPass = (id) => Number(id) > ACCESS.freeMissions;

const fmtPrice = (it) => `A$${(it.amount / 100).toFixed(2)}${it.interval ? `/${it.interval === 'year' ? 'year' : 'month'}` : ''}`;

// deps (tests): { cfg, fetch, auth } — auth is /lib/auth's `auth` (signedIn, user, getIdToken, onChange)
export function createAccess(deps = {}) {
  const cfg = deps.cfg || accessConfig();
  const request = deps.fetch || ((...a) => fetch(...a));
  let authP = null;
  const getAuth = () => {
    if (deps.auth) return Promise.resolve(deps.auth);
    if (cfg.devUid || cfg.noAccount) return Promise.resolve(null);
    return (authP ||= import('/lib/auth/auth.js').then((m) => m.auth).catch(() => null));
  };
  const S = { probed: false, live: false, testMode: null, offer: [], pass: false, passKnown: false, allowance: null, focus: null, uid: null };
  const subs = new Set();
  const emit = () => { for (const f of subs) { try { f(api); } catch (e) { console.warn('[access]', e); } } };
  let probeP = null, authHooked = false;

  async function signedIn() {
    if (cfg.devUid) return true;
    const a = await getAuth();
    return !!a?.signedIn;
  }
  async function token() {
    if (cfg.devUid) return `dev:${cfg.devUid}`;
    const a = await getAuth();
    if (!a?.signedIn) return null;
    try { return await a.getIdToken(); } catch (e) { return null; }
  }
  async function hookAuth() {
    if (authHooked) return;
    authHooked = true;
    const a = await getAuth();
    // A different account (or signing out) forgets what the last one owned, and asks again.
    a?.onChange?.((u) => { const uid = u && !u.anon ? u.uid : null; if (uid === S.uid) return; S.uid = uid; S.pass = false; S.passKnown = false; S.allowance = null; emit(); if (uid) api.refresh().catch(() => {}); });
  }

  // One offer probe per page (Ragdojo's rule): missing, failing, or test mode = not live, and no polling.
  function probe() {
    if (probeP) return probeP;
    probeP = (async () => {
      if (cfg.onHub) {
        try {
          const r = await request(cfg.api + 'offer', { cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            S.testMode = d.testMode !== false;
            S.offer = (Array.isArray(d.items) ? d.items : []).filter((it) => it && it.entitlement === 'br8t_pass' && ACCESS.products.includes(it.key));
            S.live = !S.testMode && S.offer.length > 0;
          }
        } catch (e) { S.live = false; }
      }
      S.probed = true;
      if (api.enforcing) { hookAuth(); await api.refresh().catch(() => {}); }
      emit();
      return api;
    })();
    return probeP;
  }

  const api = {
    cfg,
    probe,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    get probed() { return S.probed; },
    // payments can actually take money right now
    get live() { return S.live; },
    get testMode() { return S.testMode; },
    get enforcing() { return cfg.enforce === 'on' || (cfg.enforce === 'auto' && S.live); },
    get pass() { return S.pass; },
    get passKnown() { return S.passKnown; },
    get allowanceState() { return S.allowance; },
    get offers() { return S.offer.map((it) => ({ key: it.key, interval: it.interval, label: fmtPrice(it) })); },
    // 'open' = nothing locked (payments not live), 'pass' = has the Pass, 'free' = limits apply
    get tier() { return !api.enforcing ? 'open' : S.pass ? 'pass' : 'free'; },
    missionOpen: (id) => !missionNeedsPass(id) || !api.enforcing || S.pass,
    // runMission's gate: remembers which mission the picker should open its card on
    blocks(id) { if (api.missionOpen(id)) return false; S.focus = Number(id); emit(); return true; },
    takeFocus() { const f = S.focus; S.focus = null; return f; },
    signedIn,
    token,

    // Entitlement: only a definitive 200 changes it; a failed check keeps what this page last saw.
    async refresh() {
      if (!cfg.onHub) return S.pass;
      const tok = await token();
      if (!tok) { S.pass = false; S.passKnown = true; emit(); return false; }
      const r = await request(cfg.api + 'entitlement', { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' });
      if (!r.ok) throw new Error(`entitlement ${r.status}`);
      const d = await r.json();
      S.pass = d?.entitlements?.br8t_pass === true;
      S.passKnown = true;
      emit();
      return S.pass;
    },
    // {remaining, perDay, unlimited, resetsAt} | null (signed out, not configured for krayzee, or unreachable)
    async allowance() {
      if (!cfg.onHub) return null;
      const tok = await token();
      if (!tok) return null;
      try {
        const r = await request(`${cfg.api}allowance?game=${encodeURIComponent(ACCESS.game)}`, { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' });
        if (!r.ok) { S.allowance = null; return null; }
        const d = await r.json();
        S.allowance = { remaining: d.remaining, perDay: d.perDay, unlimited: !!d.unlimited, resetsAt: d.resetsAt || 0, tier: d.tier };
        if (d.unlimited && d.tier === 'pass') S.pass = true;
      } catch (e) { S.allowance = null; }
      emit();
      return S.allowance;
    },
    noteAllowance(a) { if (a && typeof a === 'object') { S.allowance = { remaining: a.remaining, perDay: a.perDay, unlimited: !!a.unlimited, resetsAt: a.resetsAt || 0, tier: a.tier }; emit(); } },
    async checkout(product = ACCESS.products[0]) {
      const tok = await token();
      if (!tok) throw new Error('Sign in with your br8t account first.');
      const post = (game) => request(cfg.api + 'checkout', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product, game }) });
      let r = await post(ACCESS.checkoutGame);
      if (r.status === 400 && ACCESS.checkoutGame !== 'hub') r = await post('hub'); // payments service without a krayzee return path yet
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.url !== 'string') throw new Error(d.error || 'The Pass shop is shut just now. Try again later.');
      const u = new URL(d.url);
      if (u.origin !== 'https://checkout.stripe.com' && !cfg.testApi) throw new Error('The Pass shop is shut just now.');
      return u.href;
    },
    _state: S,
  };
  return api;
}

let shared = null;
export function access() { return (shared ||= createAccess()); }
// Story hooks (js/story/index.js, picker.js): tiny functions so the STORY lane's files carry one line each.
export const missionBlocked = (id) => access().blocks(id);

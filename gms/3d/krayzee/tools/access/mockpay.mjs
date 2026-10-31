// A stand-in for the br8t payments service (~/cc/ionos/ragdojo-payments), for tests only: the same /api/br8t/ routes
// and shapes Krayzee uses, bearer tokens "dev:<uid>", in memory. CORS open (the game page is on another port).
//   import { startMockPay } from './mockpay.mjs';
//   const pay = await startMockPay({ port, live: true, perDay: 3, pass: ['uidP'] });
//   pay.state  → { live, perDay, pass:Set, used:Map, ids:Set, calls:[] };  pay.close()
// Standalone: node tools/access/mockpay.mjs [port] [--test-mode]
import { createServer } from 'node:http';

export function startMockPay({ port = 0, live = true, perDay = 3, pass = [] } = {}) {
  const state = { live, perDay, pass: new Set(pass), used: new Map(), ids: new Set(), calls: [] };
  const uidOf = (req) => { const m = /^Bearer dev:([\w-]+)$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };
  const allowance = (uid) => {
    const p = state.pass.has(uid), used = state.used.get(uid) || 0;
    const day = new Date().toISOString().slice(0, 10), resetsAt = Math.floor(Date.parse(day + 'T00:00:00Z') / 1000) + 86400;
    return { game: 'krayzee', day, tier: p ? 'pass' : 'free', perDay: p ? -1 : state.perDay, usedToday: used, remaining: p ? -1 : Math.max(0, state.perDay - used), unlimited: p, resetsAt, pass: p, freePerDay: state.perDay };
  };
  const srv = createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
      res.end(body == null ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x'), path = url.pathname.replace(/^\/api\/br8t\//, '');
      const uid = uidOf(req);
      state.calls.push({ method: req.method, path, uid });
      if (path === 'offer') return send(200, { testMode: !state.live, items: [
        { key: 'br8t_pass_monthly', entitlement: 'br8t_pass', mode: 'subscription', interval: 'month', currency: 'aud', amount: 149, taxInclusive: true },
        { key: 'br8t_pass_yearly', entitlement: 'br8t_pass', mode: 'subscription', interval: 'year', currency: 'aud', amount: 499, taxInclusive: true }] });
      if (path === 'health') return send(200, { ok: true, testMode: !state.live });
      if (!uid) return send(401, { error: 'sign in to your account' });
      if (path === 'entitlement' && req.method === 'GET') return send(200, { testMode: !state.live, entitlements: { ragdojo_supporter: false, br8t_pass: state.pass.has(uid) }, pass: state.pass.has(uid) ? { active: true, status: 'active', interval: 'month' } : null, owned: state.pass.has(uid) });
      if (path === 'allowance' && req.method === 'GET') return url.searchParams.get('game') === 'krayzee' ? send(200, allowance(uid)) : send(404, { error: 'no allowance for this game' });
      if (path === 'allowance' && req.method === 'POST') {
        let b = {};
        try { b = JSON.parse(raw); } catch (e) { return send(400, { error: 'bad body' }); }
        if (b.game !== 'krayzee' || !b.id) return send(400, { error: 'bad body' });
        if (state.pass.has(uid)) return send(200, { ok: true, allowance: allowance(uid) });
        if (!state.ids.has(b.id)) {
          if ((state.used.get(uid) || 0) >= state.perDay) return send(429, { ok: false, error: 'no online games left today', allowance: allowance(uid) });
          state.ids.add(b.id); state.used.set(uid, (state.used.get(uid) || 0) + 1);
        }
        return send(200, { ok: true, allowance: allowance(uid) });
      }
      if (path === 'checkout' && req.method === 'POST') return send(200, { url: `http://127.0.0.1:${srv.address().port}/fake-checkout?uid=${uid}`, testMode: true });
      send(404, { error: 'not found' });
    });
  });
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => res({ port: srv.address().port, state, url: `http://127.0.0.1:${srv.address().port}/api/br8t/`, close: () => new Promise((r) => srv.close(r)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = await startMockPay({ port: +process.argv[2] || 8799, live: !process.argv.includes('--test-mode') });
  console.log(`mock payments on ${p.url}`);
}

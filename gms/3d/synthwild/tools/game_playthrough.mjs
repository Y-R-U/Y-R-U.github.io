// First-hour playthrough in the real game (lane 4). Needs headless Chrome on port 9314:
//   ~/.claude/bin/cdp start --port 9314 -- --use-angle=metal
//   node tools/game_playthrough.mjs [seed] [easy,normal]
const [seed = 'synthwild', diffs = 'easy,normal'] = process.argv.slice(2);
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const t = (await (await fetch('http://127.0.0.1:9314/json/list')).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 600000 }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result?.result?.value; };
await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}?noshell=1&q=low&seed=${seed}` });
for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); if (await ev('!!window.__game?.ctx?.session?.playing')) break; }

const out = {};
for (const d of diffs.split(',')) {
  for (const shelter of [true, false]) {
    const r = await ev(`import('${BASE}tools/game_playthrough_bot.js?v=${Date.now()}').then((m) => m.run(${JSON.stringify({ difficulty: d, seed, shelter })}))`);
    out[`${d}${shelter ? '' : '-noshelter'}`] = r;
    console.log(`\n=== ${d}${shelter ? '' : ' (no shelter)'}: ${Math.round(r.T / 60)} min model time, deaths ${r.deaths}`);
    for (const l of r.log) console.log('  ' + l);
    console.log('  goals:', r.goals.map((g) => `${g.id}@${Math.round(g.t / 60 * 10) / 10}m`).join(' '));
    console.log('  night:', JSON.stringify(r.night));
    console.log('  damage:', r.dmg.map((x) => `${x.src}:${x.a}@${x.t}`).join(' '));
    console.log('  charge (t, charge, integrity):', r.charge.filter((_, i) => i % 4 === 0).map((c) => c.join('/')).join(' '));
    if (!shelter) break;
  }
}

// FPS at night with the hostile cap filled, real rendering.
const fps = await ev(`(async () => {
  const c = __game.ctx, g = c.game;
  c.session.meta.difficulty = 'normal';
  c.sky.setTime(0.8); c.session.paused = false;
  const P = c.player.pos;
  for (let i = 0; i < 7; i++) g.spawnMob(['reboot', 'archer', 'spider', 'glitchfuse'][i % 4], 6 + i * 2);
  for (let i = 0; i < 4; i++) g.spawnMob(['ibis', 'bull'][i % 2], 10 + i * 3);
  await new Promise((r) => setTimeout(r, 3000));
  const s = []; for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 500)); s.push(c.stats.fps); }
  return { mobs: g.mobs.list.length, calls: c.stats.calls, fps: s.map((x) => Math.round(x)) };
})()`);
console.log('\nfps with', fps.mobs, 'mobs:', fps.fps.join(' '), 'draw calls', fps.calls);
if (errs.length) console.log('page errors:', errs.slice(0, 5));
(await import('fs')).writeFileSync(process.env.OUT || '/dev/null', JSON.stringify({ out, fps }, null, 1));
ws.close();

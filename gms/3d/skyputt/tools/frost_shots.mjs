#!/usr/bin/env node
// Frost Fair checks inside the REAL game (raw CDP). Start Chrome first:
//   ~/.claude/bin/cdp start --port 9534
//   node tools/frost_shots.mjs [--holes=1-9] [--sizes=p,l] [--q=low] [--out=docs/notes/frost_shots] [--tag=x] [--t=seconds]
// For each hole and size: a tee screenshot plus draw calls / triangles from renderer.info, and the
// console errors. Exits 1 on errors.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9534);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/';
const OUT = args.out || new URL('../docs/notes/frost_shots', import.meta.url).pathname;
const THEME = args.theme || 'frost';
const TAG = args.tag ? args.tag + '-' : '';
const [h0, h1] = String(args.holes || '1-3').split('-').map(Number);
const SIZES = String(args.sizes || 'p,l').split(',');
const Q = args.q === 'low' ? '&q=low' : '';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    let page = list.find(t => t.type === 'page');
    if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) { const p = c.pending.get(m.id); c.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method) c.handlers.forEach(h => h(m));
    };
    return c;
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(fn) { this.handlers.push(fn); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

const errors = [];
const c = await CDP.open();
await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
c.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert', 'warning'].includes(m.params.type))
    errors.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 400));
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
async function waitFor(expr, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
const DIMS = { p: [412, 915, true], l: [1440, 900, false] };
try {
  for (const s of SIZES) {
    const [w, h, mob] = DIMS[s];
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: mob });
    for (let i = h0; i <= h1; i++) {
      await c.send('Page.navigate', { url: `${BASE}?theme=${THEME}&hole=${i}${Q}&t=${Date.now()}` });
      await sleep(500);
      await waitFor('window.__booted === true', 40000);
      await sleep(1500);
      if (!args.fly) await c.eval(`(() => { const r = __skyputt.round; if (r && r.state === 'flyover') r.endFlyover(); })()`).catch(() => {});
      await sleep(+(args.t || 3) * 1000);
      if (args.look) {   // optional: swing the camera to look along the hole (debug)
        await c.eval(`(() => { const r = __skyputt.app.rig; r.lookYaw = ${+args.look}; })()`).catch(() => {});
        await sleep(1500);
      }
      const info = await c.eval(`(() => { const ri = __skyputt.app.renderer.info; return { calls: ri.render.calls, tris: ri.render.triangles, geos: ri.memory.geometries, tex: ri.memory.textures, theme: __skyputt.themeId, fps: __skyputt.fps }; })()`);
      if (args.breakdown) {   // triangles per top-level theme mesh (name → tris), largest first
        const bd = await c.eval(`(() => { const out = {}; __skyputt.app.scene.traverse(o => { if (!o.isMesh || !o.geometry) return;
          const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          const k = o.name || o.parent?.name || '?'; out[k] = (out[k] || 0) + Math.round(n); });
          return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25); })()`);
        console.log('  ' + bd.map(([k, n]) => k + ' ' + n).join('\n  '));
      }
      const r = await c.send('Page.captureScreenshot', { format: 'png' });
      const name = `${TAG}${s}-hole${i}${Q ? '-low' : ''}`;
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
      console.log(name, JSON.stringify(info));
      if (args.shoot) {   // --shoot=speed:ms,ms,...  putt straight down the tee frame, screenshot after each delay
        const [sp, ds] = String(args.shoot).split(':');
        await c.eval(`(() => { const r = __skyputt.round, f = r.hole.teeFrame.f; r.debugShoot(Math.atan2(f[0], -f[2]) * 180 / Math.PI, ${+sp}); })()`);
        let t0 = 0;
        for (const d of (ds || '600').split(',').map(Number)) {
          await sleep(d - t0); t0 = d;
          const r2 = await c.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(`${OUT}/${name}-shot${d}.png`, Buffer.from(r2.data, 'base64'));
        }
      }
    }
  }
} catch (e) { errors.push('driver: ' + e.message); }
if (errors.length) { console.log('ERRORS:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('no console errors');
process.exit(0);

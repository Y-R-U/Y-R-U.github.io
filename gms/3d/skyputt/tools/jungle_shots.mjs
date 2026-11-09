#!/usr/bin/env node
// Jungle Temple checks (adapted from tools/star_shots.mjs) inside the REAL game (raw CDP), in a target of its own (closed at the end).
// Start Chrome first:
//   ~/.claude/bin/cdp start --port 9630
//   node tools/jungle_shots.mjs [--holes=1-18] [--sizes=p,l] [--q=low] [--out=docs/notes/jungle_shots] [--tag=x] [--t=seconds]
//   node tools/jungle_shots.mjs --swap        # title screen: swap jungle → sky → spooky → frost → candy → volcano → reef → star → jungle (dispose check)
//   --course=festival|woods|sugar|reef|star plays (default star) that course (hole numbers are per course); --theme=frost|sky|spooky works too; --sizes=lp is an 844x390 landscape phone; --eval='js' runs after the fly-over
//   node tools/jungle_shots.mjs --preview='view=row&hud=0&t=2' --sizes=l   # tools/theme_preview.html instead of the game
// For each hole and size: a tee screenshot plus draw calls / triangles from renderer.info, and the
// console errors. Exits 1 on errors.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9630);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/';
const OUT = args.out || new URL('../docs/notes/jungle_shots', import.meta.url).pathname;
const THEME = args.theme || 'jungle';
const TAG = args.tag ? args.tag + '-' : '';
const [h0, h1] = String(args.holes || '1-3').split('-').map(Number);
const SIZES = String(args.sizes || 'p,l').split(',');
const Q = args.q === 'low' ? '&q=low' : '';
const COURSE = args.course === 'sky' ? '' : '&course=' + (args.course || 'jungle');   // festival | woods | sugar | reef | star ...
const CTAG = (args.course || 'jungle') + '-';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open() {
    const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    CDP.targetId = page.id;
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
const DIMS = { p: [412, 915, true], l: [1440, 900, false], lp: [844, 390, true], lp2: [740, 360, true], pl: [915, 412, true] };   // pl = the portrait phone turned sideways   // lp/lp2 = landscape phones
try {
  if (args.swap) {   // title-screen theme swaps exercise theme.dispose() + env dispose; any throw shows up as an error
    await c.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
    await c.send('Page.navigate', { url: `${BASE}?theme=${THEME}&t=${Date.now()}` });
    await sleep(500);
    await waitFor('window.__booted === true', 40000);
    for (const id of ['sky', 'spooky', 'frost', 'candy', 'volcano', 'reef', 'star', THEME]) {
      await c.eval(`__skyputt.setTheme(${JSON.stringify(id)})`);
      await sleep(2500);
      console.log('swapped to', await c.eval('__skyputt.themeId'), JSON.stringify(await c.eval(`(() => { const ri = __skyputt.app.renderer.info; return { geos: ri.memory.geometries, tex: ri.memory.textures }; })()`)));
    }
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${TAG}title-swap.png`, Buffer.from(r.data, 'base64'));
  }
  if (args.map) {   // course map at 412x915: 8 course tabs wrap (.seg.nines), nothing wider than the viewport
    await c.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
    await c.send('Page.navigate', { url: `${BASE}?theme=${THEME}&t=${Date.now()}` });
    await sleep(500);
    await waitFor('window.__booted === true', 40000);
    await c.eval(`__skyputt.showCourseMap(__skyputt.course)`);
    await sleep(1500);
    const m = await c.eval(`(() => { const t = document.querySelector('#map .seg.nines'); const bs = t ? [...t.querySelectorAll('button')] : [];
      const rows = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)));
      const wide = [...document.querySelectorAll('#map *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length;
      return { tabs: bs.map(b => b.textContent.trim()), rows: rows.size, docW: document.documentElement.scrollWidth, vw: innerWidth, wide }; })()`);
    console.log('map', JSON.stringify(m));
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${TAG}map.png`, Buffer.from(r.data, 'base64'));
  }
  if (args.skins) {   // triangles + draw calls per skin (built in a blank page from the theme module)
    await c.send('Page.navigate', { url: `${BASE}tools/theme_preview.html?theme=${THEME}&view=row&hud=0${Q}&r=${Date.now()}` });
    await sleep(5000);
    const res = await c.eval(`(async () => {
      const THREE = await import('three');
      const { default: create } = await import('/gms/3d/skyputt/js/themes/${THEME}/index.js');
      const th = create({ THREE, quality: '${Q ? 'low' : 'high'}' });
      const count = o => { let t = 0, m = 0; o.traverse(x => { if (x.isMesh) { m++; const g = x.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return [Math.round(t), m]; };
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,-1), new THREE.Vector3(2,-0.5,-3)]);
      const S = th.skins, out = {};
      out.windmill = count(S.windmill({}).object); out.loop = count(S.loop({ radius: 0.6, width: 0.5, sideShift: 0.65 }));
      out.tube = count(S.tube({ curve, radius: 0.15 })); out.flag = count(S.flag({ poleHeight: 0.9 }).object);
      out.pickup = count(S.pickup({}).object); out.bumper = count(S.bumper({ radius: 0.12, height: 0.2 }));
      out.teePad = count(S.teePad({ radius: 0.32 })); out.mover = count(S.mover({ width: 0.4, height: 0.16, depth: 0.2 }));
      return out; })()`);
    console.log('skins [tris, meshes]', JSON.stringify(res));
  }
  if (args.preview) {
    for (const s of SIZES) {
      const [w, h, mob] = DIMS[s];
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
      await c.send('Page.navigate', { url: `${BASE}tools/theme_preview.html?theme=${THEME}&${args.preview}${Q}&r=${Date.now()}` });
      await sleep(+(args.wait || 7000));
      const r = await c.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT}/${TAG}preview-${s}${Q ? '-low' : ''}.png`, Buffer.from(r.data, 'base64'));
      console.log('preview', s, await c.eval('document.getElementById("hud")?.textContent || ""').catch(() => ''));
    }
  }
  for (const s of (args.swap || args.preview || args.skins || args.map ? [] : SIZES)) {
    const [w, h, mob] = DIMS[s];
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: mob });
    for (let i = h0; i <= h1; i++) {
      await c.send('Page.navigate', { url: `${BASE}?theme=${THEME}&hole=${i}${Q}${COURSE}&t=${Date.now()}` });
      await sleep(500);
      await waitFor('window.__booted === true', 40000);
      await sleep(1500);
      if (!args.fly) await c.eval(`(() => { const r = __skyputt.round; if (r && r.state === 'flyover') r.endFlyover(); })()`).catch(() => {});
      if (args.eval) {   // e.g. tweak or measure camera params; a returned value is printed
        const ev = await c.eval(String(args.eval)).catch(e => errors.push('--eval: ' + e.message));
        if (ev !== undefined && ev !== true && typeof ev !== 'number') console.log('  eval:', ev);
      }
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
      const name = `${TAG}${CTAG}${s}-hole${i}${Q ? '-low' : ''}`;
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
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${CDP.targetId}`); } catch { /* ignore */ }
if (errors.length) { console.log('ERRORS:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('no console errors');
process.exit(0);

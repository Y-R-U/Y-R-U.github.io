// battle-1 test harness (battle-2: BT.raw(true) measures un-normalised battle lengths): headless Chrome over raw CDP.
//   ~/.claude/bin/cdp start --port 9519 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   CDP_PORT=9519 node tools/battle_cdp.mjs <outDir> <spec.json | JSON>
// spec: [{name, url?, w, h, mobile?, wait?, eval?, evalWait?, shot?}] — like board_cdp.mjs, plus:
//   every navigation injects window.BT (helpers below) and clears the browser cache first.
// BT.battle({fen, move, anim, speed, view}) starts a capture battle without awaiting it
// (forces theme.battleAnims to the named anim); BT.done() awaits it; BT.stats() returns
// scene/renderer counters; BT.stress(n, speed) runs n random battles and returns stats.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';

const PORT = +(process.env.CDP_PORT || 9519);
const [, , outDir = '.', specArg = '[]'] = process.argv;
const spec = JSON.parse(existsSync(specArg) ? readFileSync(specArg, 'utf8') : specArg);
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HELPERS = `
window.BT = (() => {
  let running = null;
  const board = () => G.boards[0];
  async function theme() { const id = G.state.theme; return (await import('/gms/3d/gambit/js/themes/' + id + '/index.js')).default; }
  let orig = null;
  async function battle({ fen, move, anim, speed = 1, view = 'top', cap = 0 }) {
    const b = board(), t = await theme();
    orig = orig || t.battleAnims.slice();
    t.battleAnims = anim ? orig.filter(f => f.name === anim).slice(0, 1) : orig;
    if (!t.battleAnims.length) throw new Error('no anim ' + anim);
    if (cap) { const fn = t.battleAnims[0]; t.battleAnims = [c => fn({ ...c, capMs: cap })]; }   // simulate a D24 cap signal
    b.camera.preset(view);
    b.setAnimSpeed(speed);
    const { Chess } = await import('/gms/3d/gambit/js/chess/chess.js');
    const ch = new Chess(fen);
    await b.setPosition(fen); b.highlight({ lastMove: null });
    await new Promise(r => setTimeout(r, 400));
    const v = ch.move(move);
    if (!v) throw new Error('illegal ' + move);
    running = b.applyMove(v, { battle: true });
    return v.san;
  }
  function stats() {
    const b = board(), r = b.renderer, s = b.scene;
    let n = 0; s.traverse(() => n++);
    return { sceneChildren: s.children.length, nodes: n, geometries: r.info.memory.geometries, textures: r.info.memory.textures,
      programs: r.info.programs?.length, fxActive: b.fx.active, animating: b.isAnimating() };
  }
  async function done() { const t0 = performance.now(); await running; return Math.round(performance.now() - t0); }
  async function stress(n = 30, speed = 2, view = 'top') {
    const b = board(), t = await theme(); orig = orig || t.battleAnims.slice(); t.battleAnims = orig;
    b.camera.preset(view); b.setAnimSpeed(speed);
    const { Chess } = await import('/gms/3d/gambit/js/chess/chess.js');
    const before = stats(); const times = [];
    let longest = 0, frames = [], last = performance.now(), worst = 0;
    let rafOn = true; const tick = now => { const d = now - last; last = now; worst = Math.max(worst, d); frames.push(d); if (rafOn) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const ch = new Chess();
    const picks = [];
    for (let i = 0; i < n; i++) {
      let caps = [];
      for (let guard = 0; guard < 200 && !caps.length; guard++) {
        if (ch.isGameOver()) { ch.reset(); await b.setPosition(ch.fen()); }
        const ms = ch.moves({ verbose: true }); caps = ms.filter(m => m.captured);
        if (!caps.length) { const m = ms[(Math.random() * ms.length) | 0]; ch.move(m.lan); }
      }
      await b.setPosition(ch.fen());
      const m = caps[(Math.random() * caps.length) | 0];
      const v = ch.move(m.lan);
      const t0 = performance.now();
      if (i % 7 === 3) { const p = b.applyMove(v, { battle: true }); await new Promise(r => setTimeout(r, 250)); b.skip(); await p; picks.push('skip'); }
      else await b.applyMove(v, { battle: true });
      times.push(Math.round(performance.now() - t0));
      await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 3500));   // let scorches / particles fade
    rafOn = false;
    frames.sort((a, b) => b - a);
    return { before, after: stats(), times, worstFrameMs: Math.round(worst), p99: Math.round(frames[Math.floor(frames.length * 0.01)] || 0), frames: frames.length, picks };
  }
  function raw(on = true) { globalThis.__BATTLE_RAW = on; return on; }
  return { battle, done, stats, stress, board, raw };
})();
'injected'`;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find(t => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    errors.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('[log] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const s of spec) {
  if (s.w) {
    await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr || (s.mobile ? 2 : 1), mobile: !!s.mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile, maxTouchPoints: s.mobile ? 5 : 0 });
  }
  if (s.url) {
    await send('Network.clearBrowserCache');
    await send('Page.navigate', { url: s.url }); await sleep(s.wait ?? 5000);
    await ev(HELPERS);
  }
  if (s.eval) { const v = await ev(s.eval); if (v !== undefined) console.log(s.name, '=>', typeof v === 'string' ? v : JSON.stringify(v)); }
  if (s.evalWait) await sleep(s.evalWait);
  if (s.shot !== false) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(`${outDir}/${s.name}.jpg`, Buffer.from(r.result.data, 'base64'));
    console.log('shot', `${outDir}/${s.name}.jpg`);
  }
}
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'console clean');
ws.close();
process.exit(errors.some(e => !e.startsWith('[warning]')) ? 1 : 0);

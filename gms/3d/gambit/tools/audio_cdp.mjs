#!/usr/bin/env node
// audio agent test driver (raw CDP, like tools/ui_cdp.mjs). Start Chrome first:
//   ~/.claude/bin/cdp start --port 9524 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/audio_cdp.mjs [--out=DIR] [--wav]      (--wav also writes every rendered sound as WAV)
// Checks: no AudioContext before a gesture; unlock on first click; every sound of every theme
// renders and is normalised (peak <= -3 dBFS); settings (sound off, volume, music) work; a real
// game move plays through playMove; battle sfx at speed 1/2/5; zero console errors / warnings.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9524);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-audio';
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
  async click(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

const errors = [], fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };
const c = await CDP.open();
await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
c.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert', 'warning'].includes(m.params.type)) {
    const txt = m.params.args.map(a => a.value ?? a.description).join(' ');
    if (!/account layer/.test(txt)) errors.push(`console.${m.params.type}: ${txt}`);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) errors.push(`log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
});
await c.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });

// fresh profile state
await c.send('Page.navigate', { url: BASE + '?nocloud' });
await sleep(1500);
await c.eval(`localStorage.clear(); true`);
await c.send('Page.navigate', { url: BASE + '?nocloud#/home' });
await sleep(4000);
const A = `(await import('${new URL('js/audio/index.js', BASE).pathname}'))`;

let st = await c.eval(`(async () => ${A}.debugState())()`);
ok(st.ctx === 'none', `no AudioContext before a gesture (state=${st.ctx})`);
ok(await c.eval(`(async () => ${A}.sfx('move'))()`) === false, 'sfx before gesture is a silent no-op');
await c.click(5, 400);
await sleep(600);
st = await c.eval(`(async () => ${A}.debugState())()`);
ok(st.ctx === 'running', `AudioContext running after first click (state=${st.ctx})`);

// render + measure every sound in every theme
const rows = [];
for (const theme of ['classic', 'fantasy', 'halloween', 'scifi']) {
  const r = await c.eval(`(async () => ${A}.debugRenderAll('${theme}'))()`);
  for (const x of r) rows.push({ theme, ...x });
}
const uniq = new Map(rows.map(r => [r.key, r]));
console.log(`\nrendered ${uniq.size} unique buffers`);
console.log('key'.padEnd(26), 'peak'.padStart(6), 'loud'.padStart(6), 'lvl'.padStart(4), 'dur'.padStart(5));
for (const r of uniq.values()) console.log(r.key.padEnd(26), String(r.peakDb).padStart(6), String(r.loudDb).padStart(6), String(r.lvl).padStart(4), r.dur.toFixed(2).padStart(5), r.limited ? 'peak-limited' : '');
ok([...uniq.values()].every(r => r.peakDb <= -2.95), 'every sound peaks at or below -3 dBFS');
ok([...uniq.values()].every(r => r.loudDb > -40), 'no sound is silent / broken (loudness > -40)');
writeFileSync(`${OUT}/levels.json`, JSON.stringify([...uniq.values()], null, 1));

if (args.wav) {
  mkdirSync(`${OUT}/wav`, { recursive: true });
  for (const key of uniq.keys()) {
    const b64 = await c.eval(`(async () => { const b = ${A}.debugBuffer(${JSON.stringify(key)}); if (!b) return null;
      const n = b.length, ch = b.numberOfChannels, sr = b.sampleRate, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
      const W = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      W(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); W(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
      out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
      W(36, 'data'); out.setUint32(40, n * ch * 2, true);
      const d = [...Array(ch)].map((_, i) => b.getChannelData(i)); let o = 44;
      for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { out.setInt16(o, Math.max(-1, Math.min(1, d[k][i])) * 32767, true); o += 2; }
      let s = ''; const u = new Uint8Array(out.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })()`);
    if (b64) writeFileSync(`${OUT}/wav/${key.replace(/:/g, '_')}.wav`, Buffer.from(b64, 'base64'));
  }
  console.log(`WAVs in ${OUT}/wav`);
}

// battle API at each speed, aliases, unknown names
const bat = await c.eval(`(async () => { const a = ${A}; const r = [];
  for (const sp of [1, 2, 5]) for (const n of ['clash', 'zap', 'fire', 'explosion', 'bats', 'wail', 'creak', 'pop', 'thud', 'stone', 'sword', 'magic'])
    { r.push(a.sfx(n, { speed: sp, at: { x: 2.5, y: 0, z: 0 } })); await new Promise(z => setTimeout(z, 35)); }
  const fakeTl = { rate: 2, instant: true, items: [], finish() {} };
  const skipped = a.sfx('fire', { ctx: { tl: fakeTl } });
  return { all: r.every(Boolean), skipped, state: a.debugState() }; })()`);
ok(bat.all, 'battle sounds play at speeds 1/2/5 (incl. aliases sword/magic)');
ok(bat.skipped === false, 'sfx on a finished/skipped battle timeline is dropped');

// settings: sound off -> nothing plays; volume persists
await c.eval(`(async () => { const s = await import('${new URL('js/app/store.js', BASE).pathname}'); s.setSettings({ sound: false }); })()`);
ok(await c.eval(`(async () => ${A}.sfx('move'))()`) === false, 'sound off: sfx is muted');
await c.eval(`(async () => { const s = await import('${new URL('js/app/store.js', BASE).pathname}'); s.setSettings({ sound: true }); })()`);
ok(await c.eval(`(async () => ${A}.sfx('move'))()`) === true, 'sound on again: sfx plays');

await c.eval(`location.hash = '#/settings'`); await sleep(1200);
const ui = await c.eval(`(() => { const v = document.querySelector('[data-vol="volume"]'), m = document.querySelector('.tgl[data-name="music"]'), mv = document.querySelector('[data-vol="musicVolume"]');
  return { vol: !!v, music: !!m, mvol: !!mv, musicOn: m && m.classList.contains('on') }; })()`);
ok(ui.vol && ui.music && ui.mvol, 'settings shows effects volume, music toggle, music volume');
ok(ui.musicOn === false, 'music is off by default');
await c.eval(`(() => { const v = document.querySelector('[data-vol="volume"]'); v.value = 40; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const saved = await c.eval(`JSON.parse(localStorage.getItem('gambit.settings')).volume`);
ok(Math.abs(saved - 0.4) < 1e-6, `volume slider saves (volume=${saved})`);

// music: on -> loads current theme loop; theme switch swaps; off stops
const tgl = await c.eval(`(() => { const r = document.querySelector('.tgl[data-name="music"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
await c.eval(`document.querySelector('.tgl[data-name="music"]').scrollIntoView({block:'center'})`); await sleep(200);
const tgl2 = await c.eval(`(() => { const r = document.querySelector('.tgl[data-name="music"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
await c.click(tgl2[0], tgl2[1]);
await sleep(2500);
let ms = await c.eval(`(async () => ${A}.music.state())()`);
ok(ms.playing && ms.theme === 'classic', `music on -> classic loop playing (${JSON.stringify(ms)})`);
await c.eval(`(async () => { const s = await import('${new URL('js/app/store.js', BASE).pathname}'); s.setSettings({ theme: 'halloween' }); })()`);
await sleep(2500);
ms = await c.eval(`(async () => ${A}.music.state())()`);
ok(ms.playing && ms.theme === 'halloween', `theme switch -> halloween loop (${JSON.stringify(ms)})`);
await c.eval(`(async () => { const s = await import('${new URL('js/app/store.js', BASE).pathname}'); s.setSettings({ theme: 'fantasy' }); })()`);
await sleep(2500);
ms = await c.eval(`(async () => ${A}.music.state())()`);
ok(ms.playing && ms.theme === 'fantasy', `theme switch -> fantasy loop (${JSON.stringify(ms)})`);
await c.eval(`(async () => { const s = await import('${new URL('js/app/store.js', BASE).pathname}'); s.setSettings({ music: false, theme: 'classic' }); })()`);
await sleep(500);
ms = await c.eval(`(async () => ${A}.music.state())()`);
ok(!ms.playing, 'music off -> stopped');

// a real game: moves go through playMove with the attached board
await c.eval(`location.hash = '#/play/bot/pip'`); await sleep(1200);
await c.eval(`document.querySelector('[data-act="play"]').click()`);
for (let i = 0; i < 80 && !(await c.eval(`!!(window.__gambitTest && window.__gambitTest() && window.__gambitTest().ready)`)); i++) await sleep(500);
const game = await c.eval(`(async () => { const t = () => window.__gambitTest(); if (!t()) return 'no test hook';
  const a = ${A}; let plays = 0; const seen = [];
  for (let i = 0; i < 16 && plays < 4 && !t().over; i++) { if (t().myTurn) { t().playAny(); plays++; } await new Promise(r => setTimeout(r, 900)); seen.push(...a.debugState().played); }
  return { plies: t().plies, plays, moveSounds: seen.filter(n => ['move', 'capture', 'castle', 'promote', 'check', 'start'].includes(n)).length, recent: a.debugState().played }; })()`);
ok(typeof game === 'object' && game.plies >= 4 && game.moveSounds > 0, `game moves play sounds via playMove (${JSON.stringify(game)})`);

await sleep(500);
ok(errors.length === 0, `zero console errors/warnings${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);

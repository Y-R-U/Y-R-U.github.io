#!/usr/bin/env node
// Headless check of the SKYPUTT audio module through tools/sound_preview.html.
//   ~/.claude/bin/cdp start --port 9541
//   CDP_PORT=9541 node tools/sound_preview_cdp.mjs [--wav=DIR]
// Checks: no AudioContext before a gesture, play() is a no-op before unlock, unlock on a click,
// every sound plays live, offline renders of every sfx / roll surface / 40 s of music are
// non-silent with peak < 1.0, and zero console errors or warnings.
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = +(process.env.CDP_PORT || 9541);
const URL_ = process.env.URL || 'http://192.168.0.236:8888/gms/3d/skyputt/tools/sound_preview.html';
const WAV = (process.argv.find(a => a.startsWith('--wav=')) || '').slice(6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find(t => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('close', e => { console.log('CDP socket closed', e.code, e.reason); process.exit(2); });
let id = 0; const pend = new Map(), errors = [], fails = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
    errors.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level) && !/favicon/.test(m.params.entry.url || ''))
    errors.push(`[log.${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails.push(msg); };

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 80 && !(await ev('!!window.__ready').catch(() => false)); i++) await sleep(250);

let st = await ev('window.__audio.debugState()');
ok(st.ctx === 'none', `no AudioContext before a gesture (${st.ctx})`);
ok(await ev(`window.__audio.play('putt', {power: 1})`) === false, 'play() before unlock is a silent no-op');
await ev(`(window.__audio.roll(3, 'grass'), window.__audio.stopRoll(), window.__audio.music.start('sky'), window.__audio.music.duck(true), window.__audio.music.duck(false), window.__audio.setVolume({sfx: 1}), true)`);
ok(true, 'roll/stopRoll/music/duck/setVolume before unlock do not throw');

for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: 200, y: 400, button: 'left', clickCount: 1 });
await sleep(800);
st = await ev('window.__audio.debugState()');
ok(st.ctx === 'running', `AudioContext running after the first click (${st.ctx})`);
ok(st.music === 'sky', `music.start() called before unlock begins on unlock (${st.music})`);

// live: every sound schedules
const live = await ev(`(async () => { const a = window.__audio, r = {};
  for (const n of window.__names) { r[n] = a.play(n, { power: .7, speed: 3, material: 'metal', n: 2 }); await new Promise(z => setTimeout(z, 120)); }
  for (const s of ['grass','sand','ice','wood','metal','glass','tube', 0, 7, 11]) { for (let i = 0; i < 20; i++) { a.roll(3, s); await new Promise(z => setTimeout(z, 16)); } }
  a.roll(0, 'grass'); a.music.duck(true); await new Promise(z => setTimeout(z, 300)); a.music.duck(false); a.mute(true); const muted = a.play('click'); a.mute(false);
  return { r, muted, st: a.debugState() }; })()`);
const notPlayed = Object.entries(live.r).filter(([, v]) => !v).map(([k]) => k);
ok(notPlayed.length === 0, `every sfx plays live (${Object.keys(live.r).length} names)${notPlayed.length ? ' missing: ' + notPlayed : ''}`);
ok(live.muted === false, 'mute(true) silences play()');
await sleep(4500);
st = await ev('window.__audio.debugState()');
ok(st.active === 0, `voice counter drains back to 0 (${st.active})`);
const themes = await ev(`(async () => { const a = window.__audio, r = [];
  for (const th of ['spooky', 'frost', 'candy', 'volcano', 'reef', 'star', 'sky']) { a.music.start(th); await new Promise(z => setTimeout(z, 1500)); r.push(a.music.theme); } return r; })()`);
ok(themes.join() === 'spooky,frost,candy,volcano,reef,star,sky', `music themes switch live (${themes})`);
await ev('window.__audio.music.stop(), true');

// offline renders
const t0 = Date.now();
const rows = await ev('window.__renderAll({ music: 90 })');
console.log(`\noffline renders: ${rows.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
console.log('sound'.padEnd(30), 'peak'.padStart(7), 'peakdB'.padStart(7), 'rmsdB'.padStart(7), 'prePk'.padStart(7), 'len'.padStart(6));
for (const r of rows) console.log(r.key.padEnd(30), r.post.peak.toFixed(3).padStart(7), String(r.post.peakDb).padStart(7), String(r.post.rmsDb).padStart(7), r.pre.peak.toFixed(3).padStart(7), r.post.active.toFixed(2).padStart(6));
const loud = rows.filter(r => r.post.peak >= 1), quiet = rows.filter(r => !(r.post.rmsDb > -50));
ok(loud.length === 0, `no render clips (peak < 1.0)${loud.length ? ': ' + loud.map(r => r.key) : ''}`);
ok(quiet.length === 0, `no render is silent (RMS > -50 dBFS)${quiet.length ? ': ' + quiet.map(r => r.key) : ''}`);
writeFileSync(new URL('./sound_preview_levels.json', import.meta.url), JSON.stringify(rows, null, 1));

await sleep(300);
ok(errors.length === 0, `zero console errors/warnings${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);

if (WAV) {
  mkdirSync(WAV, { recursive: true });
  const names = await ev(`window.__names`);
  for (const n of [...names, 'music', 'music_spooky', 'music_frost', 'music_candy', 'music_volcano', 'music_reef', 'music_star']) {
    const b64 = await ev(`(async () => { const A = await import('/gms/3d/skyputt/js/audio/index.js');
      const r = '${n}'.startsWith('music') ? await A.renderMusic('${n}'.split('_')[1] || 'sky', 12) : await A.renderSfx('${n}', { power: .8, speed: 4, material: 'wood', n: 3 });
      const b = r.buf, L = b.length, out = new DataView(new ArrayBuffer(44 + L * 4));
      const W = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      W(0,'RIFF'); out.setUint32(4, 36 + L*4, true); W(8,'WAVEfmt '); out.setUint32(16,16,true); out.setUint16(20,1,true); out.setUint16(22,2,true);
      out.setUint32(24,b.sampleRate,true); out.setUint32(28,b.sampleRate*4,true); out.setUint16(32,4,true); out.setUint16(34,16,true); W(36,'data'); out.setUint32(40,L*4,true);
      const l = b.getChannelData(0), rr = b.getChannelData(1); let o = 44;
      for (let i = 0; i < L; i++) { out.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 32767, true); out.setInt16(o + 2, Math.max(-1, Math.min(1, rr[i])) * 32767, true); o += 4; }
      const u = new Uint8Array(out.buffer); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })()`);
    writeFileSync(`${WAV}/${n}.wav`, Buffer.from(b64, 'base64'));
  }
  console.log('WAVs in', WAV);
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
ws.close();
process.exit(fails.length ? 1 : 0);

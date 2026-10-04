#!/usr/bin/env node
// Browser checks for AU in headless Chrome (port 9405, started with --autoplay-policy=no-user-gesture-required):
//  - piano pieces rendered offline: right pitches at the right times, no clicks; WAVs written to --out
//  - Apple previews, Commons files and piano samples actually load and play (media events, currentTime advancing)
//   node tools/au_browser.mjs [--out DIR] [--pieces a,b] [--apple N] [--skip-media]
import fs from 'node:fs';
import { connect } from './au_cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '/tmp/au_wav');
const BASE = 'http://localhost:8888/gms/2d/clued/';
fs.mkdirSync(OUT, { recursive: true });

const c = await connect(+arg('port', 9405));
await c.goto(BASE + 'js/audio/dev.html', 'window.__au && window.__au.packs && Object.keys(window.__au.packs).length > 0');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

const ANALYSE = `
async function analyse(src, seconds) {
  const { piano } = window.__au;
  const piece = await piano.loadPiece(src);
  const buf = await piano.render(piece, { seconds });
  const sr = buf.sampleRate, d = buf.getChannelData(0), lead = 0.05, k = 60 / piece.bpm;
  // top voice: highest pitch at each onset
  const byT = new Map();
  for (const [b, m] of piece.notes) { const t = Math.round(b * 1000) / 1000; if (b * k > seconds - 0.3) continue; byT.set(t, Math.max(byT.get(t) ?? 0, m)); }
  const onsets = [...byT.entries()].sort((a, b) => a[0] - b[0]);
  const goertzel = (f, s0, n) => { const w = 2 * Math.PI * f / sr, cw = 2 * Math.cos(w); let a = 0, b = 0; for (let i = 0; i < n; i++) { const x = d[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); const y = x + cw * a - b; b = a; a = y; } return Math.sqrt(a * a + b * b - cw * a * b); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let pitchOk = 0, timeOk = 0, checked = 0;
  const env = (t) => { const s = Math.floor(t * sr), n = Math.floor(0.012 * sr); let e = 0; for (let i = 0; i < n; i++) e += (d[s + i] || 0) ** 2; return Math.sqrt(e / n); };
  const bad = [];
  for (const [b, m] of onsets.slice(0, 40)) {
    const low = m < 52, t = lead + b * k, s0 = Math.floor((t + 0.03) * sr), n = Math.floor((low ? 0.14 : 0.09) * sr);
    if (s0 + n >= d.length) break;
    checked++;
    // low notes: sum harmonics 2-5, where a semitone is several analysis bins wide
    const sc = (mm) => low ? [2, 3, 4, 5].reduce((s, hh) => s + goertzel(hz(mm) * hh, s0, n), 0) : goertzel(hz(mm), s0, n);
    const e = sc(m), lo = sc(m - 1), hi = sc(m + 1);
    if (e > lo && e > hi) pitchOk++; else bad.push(m + '@' + b);
    // onset: energy just after t clearly above energy just before, or loud enough
    const before = env(t - 0.03), after = env(t + 0.008);
    if (after > before * 1.12 || after > 0.05) timeOk++;
  }
  // clicks: sample-to-sample jumps far above the local high-frequency level
  // note attacks are legitimately sharp, so only spikes away from any onset count
  const starts = piece.notes.map(([b]) => Math.floor((lead + b * k) * sr)).sort((a, b) => a - b);
  const nearOnset = (i) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return starts[lo] <= i && i - starts[lo] < 0.03 * sr; };
  let clicks = 0, peak = 0;
  const W = 512;
  for (let s = W; s < d.length - W; s += W) {
    let acc = 0, mx = 0, at = 0;
    for (let i = s; i < s + W; i++) { const df = Math.abs(d[i] - 2 * d[i - 1] + d[i - 2]); acc += df; if (df > mx) { mx = df; at = i; } }
    if (mx > 0.004 && mx > (acc / W) * 14 && !nearOnset(at)) clicks++;
  }
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  // 16-bit mono WAV
  const N = d.length, wav = new DataView(new ArrayBuffer(44 + N * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); wav.setUint32(4, 36 + N * 2, true); str(8, 'WAVEfmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
  wav.setUint32(24, sr, true); wav.setUint32(28, sr * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); str(36, 'data'); wav.setUint32(40, N * 2, true);
  for (let i = 0; i < N; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  const bytes = new Uint8Array(wav.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { title: piece.title, bpm: piece.bpm, checked, pitchOk, timeOk, clicks, peak: +peak.toFixed(3), bad: bad.slice(0, 8), wav: btoa(bin), dur: +(N / sr).toFixed(2) };
}`;
await c.evaluate(ANALYSE + '; window.__analyse = analyse; true');

const pieces = (arg('pieces', 'twinkle-twinkle,ode-to-joy,happy-birthday,canon-in-d,fur-elise,silent-night,greensleeves,the-entertainer,eine-kleine-nachtmusik,minuet-in-g')).split(',');
for (const p of pieces) {
  const r = await c.evaluate(`window.__analyse('data/music/notes/${p}.json', 14)`, 120000);
  fs.writeFileSync(`${OUT}/${p}.wav`, Buffer.from(r.wav, 'base64'));
  const pr = r.pitchOk / r.checked, tr = r.timeOk / r.checked;
  ok(pr >= 0.75 && tr >= 0.65 && r.clicks === 0 && r.peak > 0.05 && r.peak < 1,
    `piano ${p}: pitch ${r.pitchOk}/${r.checked}, onsets ${r.timeOk}/${r.checked}, clicks ${r.clicks}, peak ${r.peak} ${r.bad.length ? 'off:' + r.bad.join(' ') : ''}`);
}

if (!process.argv.includes('--skip-media')) {
  // piano samples decode
  const ps = await c.evaluate(`(async () => { const urls = window.__au.piano.sampleUrls(); let n = 0; for (const u of urls) { const r = await fetch(u); if (r.ok && (await (window.__au.clip ? new (window.AudioContext)().decodeAudioData(await r.arrayBuffer()) : null))) n++; } return [n, urls.length]; })()`, 120000);
  ok(ps[0] === ps[1], `piano samples decode ${ps[0]}/${ps[1]}`);

  const PLAY = `async (src, start, kind) => {
    const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; const ev = [];
    ['loadedmetadata','canplay','playing','error','stalled'].forEach(e => a.addEventListener(e, () => ev.push(e)));
    a.src = src; a.muted = true;
    try { await new Promise((res, rej) => { a.addEventListener('canplay', res, { once: true }); a.addEventListener('error', () => rej(new Error('media error ' + (a.error && a.error.code))), { once: true }); setTimeout(() => rej(new Error('timeout')), 15000); }); } catch (e) { return { ok: false, err: e.message, ev }; }
    try { a.currentTime = start; } catch {}
    try { await a.play(); } catch (e) { return { ok: false, err: 'play: ' + e.message, ev }; }
    const t0 = a.currentTime; await new Promise(r => setTimeout(r, 1500)); const t1 = a.currentTime; a.pause();
    // decode path used by the listen format
    let decoded = false; try { const r = await fetch(src, { mode: 'cors' }); decoded = !!(await new AudioContext().decodeAudioData(await r.arrayBuffer())).duration; } catch (e) {}
    return { ok: t1 - t0 > 0.8, adv: +(t1 - t0).toFixed(2), dur: a.duration, ev, decoded };
  }`;
  const sample = await c.evaluate(`(() => {
    const P = window.__au.packs, out = [];
    const take = (id, n) => { const it = (P[id]?.items || []).filter(x => x.media?.audio?.[0]?.src); for (let i = 0; i < n && it.length; i++) { const x = it[Math.floor(i * it.length / n)]; out.push([id, x.id, x.media.audio[0].src, x.media.audio[0].type || '']); } };
    for (const id of ['hits-1960s','hits-1980s','hits-2000s','hits-2020s','music-artists','screen-themes','kids-film-tv','one-hit-wonders']) take(id, ${+arg('apple', 2)});
    for (const id of ['anthems','classical-recordings','instruments']) take(id, 3);
    return out; })()`);
  for (const [pack, id, src, type] of sample) {
    if (type === 'piano') continue;
    const r = await c.evaluate(`(${PLAY})(${JSON.stringify(src.startsWith('http') ? src : BASE + src)}, 3)`, 60000);
    ok(r.ok && r.decoded, `play ${pack}/${id}: ${r.ok ? `advanced ${r.adv}s of ${Math.round(r.dur)}s, decode ${r.decoded}` : r.err} [${(r.ev || []).join(',')}]`);
  }
  // the real listen pipeline: generate + render a question and see the clip play
  const lq = await c.evaluate(`(async () => {
    const { listen, packs } = window.__au; const res = [];
    for (const id of ['hits-1990s', 'classical-piano', 'anthems']) {
      if (!packs[id]) continue;
      document.querySelector('#lpack').value = id;
      [...document.querySelector('#lpack').options].forEach(o => o.selected = o.value === id);
      document.querySelector('#lgo').click();
      await new Promise(r => setTimeout(r, 6000));
      const ring = getComputedStyle(document.querySelector('.au-ring')).getPropertyValue('--p');
      res.push([id, document.querySelector('.au-status')?.textContent, +ring]);
    }
    return res; })()`, 90000);
  for (const [id, status, p] of lq) ok(p > 0.2 || /Pick/.test(status), `listen render ${id}: status "${status}", progress ${p}`);
}
console.log(c.logs.filter((l) => /EXC|error/i.test(l)).slice(0, 10).join('\n'));
console.log(fails ? `${fails} FAILED` : 'all passed');
c.close();
process.exit(fails ? 1 : 0);

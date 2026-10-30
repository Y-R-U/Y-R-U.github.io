// GAMBIT audio — ambient theme music. Owner: audio agent.
// Off by default (setting `music`). Lazy: nothing is fetched until music is on AND audio is
// unlocked by a gesture. One track decoded at a time; switching theme or turning music off
// fades out and releases it.
//
// A theme's sounds.js declares  music: { file: 'fantasy', loop: 60, xfade: 3 }
// -> assets/audio/music/fantasy.ogg (Opus) or .m4a (AAC, Safari). The file is `loop + xfade`
// seconds long: the last `xfade` seconds are the musical continuation of the loop point, so
// we start a new copy every `loop` seconds and equal-power crossfade the tail into the head.
// That makes the loop seamless regardless of encoder padding (AAC priming etc).

const BASE = new URL('../../assets/audio/music/', import.meta.url).href;
let C = null, bus = null, cfg = null;
let cur = null;           // {id, buf, L, X, next, timer, srcs:[]}
let want = null, busy = null;
const noMusic = new Set();    // themes without a track (or whose file failed): don't retry

export function init(ctx, out) { C = ctx; bus = out; }
export function configure(c) { cfg = c; }
export function state() { return cur ? { theme: cur.id, playing: true, loop: cur.L } : { playing: false, loading: !!busy }; }

function ext() {
  try {
    const a = document.createElement('audio');
    if (a.canPlayType('audio/ogg; codecs="opus"')) return 'ogg';
  } catch { /* */ }
  return 'm4a';
}
function decode(ab) {
  return new Promise((res, rej) => { const p = C.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}
const curveCache = {};
function curve(dir) {
  if (curveCache[dir]) return curveCache[dir];
  const n = 64, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = i / (n - 1); c[i] = dir === 'in' ? Math.sin(k * Math.PI / 2) : Math.cos(k * Math.PI / 2); }
  c[0] = dir === 'in' ? 0.0001 : c[0]; c[n - 1] = dir === 'in' ? 1 : 0.0001;
  return (curveCache[dir] = c);
}

function segment(m, t, fadeIn) {
  const src = C.createBufferSource(); src.buffer = m.buf;
  const g = C.createGain(); g.gain.value = 0.0001;
  src.connect(g).connect(bus);
  g.gain.setValueCurveAtTime(curve('in'), t, fadeIn);
  const outAt = t + m.L;
  g.gain.setValueAtTime(1, outAt);
  g.gain.setValueCurveAtTime(curve('out'), outAt, m.X);
  src.start(t); src.stop(outAt + m.X + 0.05);
  const rec = { src, g };
  m.srcs.push(rec);
  src.onended = () => { const i = m.srcs.indexOf(rec); if (i >= 0) m.srcs.splice(i, 1); try { g.disconnect(); } catch { /* */ } };
}
function pump(m) {
  if (cur !== m) return;
  const ahead = m.next - C.currentTime;
  if (ahead < 3) { segment(m, m.next, m.X); m.next += m.L; }
  // re-check well before the next boundary (suspended contexts just re-arm)
  m.timer = setTimeout(() => pump(m), Math.max(500, (m.next - C.currentTime - 3) * 1000));
}
function stop(fade = 1.2) {
  const m = cur; cur = null;
  if (!m) return;
  clearTimeout(m.timer);
  const t = C.currentTime;
  for (const { src, g } of m.srcs) {
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); src.stop(t + fade + 0.05); } catch { /* */ }
  }
}

export async function refresh() {
  if (!cfg) return;
  const on = cfg.enabled();
  want = on ? cfg.theme() : null;
  if (cur && cur.id === want) return;
  if (!want || noMusic.has(want)) { if (C) stop(); return; }
  if (!C) { if (!cfg.ctx()) return; }            // not unlocked yet: the first gesture calls us again
  if (busy) return busy;
  busy = (async () => {
    const id = want;
    try {
      const m = await cfg.themeMusic(id);
      if (want !== id) return;
      if (!m || !m.file) { noMusic.add(id); stop(); return; }
      const res = await fetch(BASE + m.file + '.' + ext());
      if (!res.ok) throw new Error(`music ${m.file}: HTTP ${res.status}`);
      const buf = await decode(await res.arrayBuffer());
      if (want !== id) return;
      stop();
      const L = Math.min(m.loop || buf.duration, buf.duration - 0.5), X = Math.min(m.xfade || 3, buf.duration - L);
      const t0 = C.currentTime + 0.1;
      cur = { id, buf, L, X, next: t0 + L, timer: 0, srcs: [] };
      segment(cur, t0, 2.5);          // gentle first fade-in
      pump(cur);
    } catch (e) {
      noMusic.add(id);
      console.warn('[gambit] music unavailable', e && e.message);
    } finally { busy = null; }
    if ((cur ? cur.id : null) !== want && !noMusic.has(want)) refresh();
  })();
  return busy;
}

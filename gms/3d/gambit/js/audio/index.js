// GAMBIT audio engine. Owner: audio agent. Public API (see docs/notes/audio.md):
//
//   sfx(name, {ctx, at, speed, delay, gain, pan, rate})  -> boolean (played?)
//   playMove(verboseMove, {now})       move / capture / castle / promote (+ check overlay), timed
//                                      to land with the board animation when a board is attached
//   attachBoard(board)                 lets the engine follow battles, skips and orientation
//   unlock()                           call from a user gesture (done automatically on import)
//   prewarm(themeId?)                  render the common sounds ahead of time (idle)
//   music.refresh()                    re-evaluate ambient music (settings/theme changes do it)
//
// Sounds are recipes (dsp.js) rendered once per (theme, name, variant) into AudioBuffers in an
// OfflineAudioContext, then loudness-normalised: peak <= -3 dBFS, short-term loudness to the
// recipe's `lvl`. Playback = one BufferSource -> gain -> panner -> bus -> limiter.
import { getSettings, onSettings } from '../app/store.js';
import { loadTheme } from '../themes/index.js';
import { makeSynth } from './dsp.js';
import { CORE, ALIASES } from './core.js';
import { BATTLE, BATTLE_ALIASES } from './battle.js';
import * as musicMod from './music.js';

const PEAK = Math.pow(10, -3 / 20);        // -3 dBFS
const REF_LOUD = -15;                       // dBFS (50 ms RMS window, crude K-weighting) of lvl 0

let ctx = null, sfxBus = null, musicBus = null, limiter = null;
let unlocked = false;
const vol = () => { const s = getSettings(); const v = s.volume ?? 0.8; return Math.max(0, Math.min(1, v)) ** 2; };
const musicVol = () => { const s = getSettings(); const v = s.musicVolume ?? 0.5; return Math.max(0, Math.min(1, v)) ** 2 * 0.6; };
const soundOn = () => getSettings().sound !== false;

// ---------------------------------------------------------------- context + unlock
function canStart() {
  // creating an AudioContext before a gesture logs a console warning in Chrome; avoid it
  return unlocked || (navigator.userActivation ? navigator.userActivation.hasBeenActive : false);
}
function ensureCtx() {
  if (ctx) return ctx;
  if (!canStart()) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return null; } }
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 4; limiter.ratio.value = 12;
  limiter.attack.value = 0.002; limiter.release.value = 0.12;
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol();
  musicBus = ctx.createGain(); musicBus.gain.value = musicVol();
  sfxBus.connect(limiter).connect(ctx.destination);
  musicBus.connect(ctx.destination);
  musicMod.init(ctx, musicBus);
  ctx.onstatechange = () => { if (ctx.state === 'running') { unlocked = true; } else if (document.visibilityState === 'visible') listen(); };
  return ctx;
}
function silentKick(c) {
  try { const b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ignore */ }
}
const GESTURES = ['pointerdown', 'touchend', 'keydown', 'click'];
let listening = false;
function onGesture() {
  unlocked = true;
  const c = ensureCtx(); if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  silentKick(c);
  if (c.state === 'running' || c.state === 'suspended') {
    // iOS needs the resume inside the gesture; once running we can stop listening
    Promise.resolve().then(() => { if (c.state === 'running') unlisten(); });
  }
  musicMod.refresh();
  idlePrewarm();
}
function listen() { if (listening) return; listening = true; for (const g of GESTURES) document.addEventListener(g, onGesture, { capture: true, passive: true }); }
function unlisten() { if (!listening) return; listening = false; for (const g of GESTURES) document.removeEventListener(g, onGesture, { capture: true }); }
export function unlock() { onGesture(); }

if (typeof document !== 'undefined') {
  listen();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
    else ctx.resume().then(() => { if (ctx.state !== 'running') listen(); }).catch(() => listen());
  });
  onSettings((s, patch) => {
    if (sfxBus && ('volume' in patch || 'sound' in patch)) sfxBus.gain.setTargetAtTime(vol(), ctx.currentTime, 0.03);
    if (musicBus && 'musicVolume' in patch) musicBus.gain.setTargetAtTime(musicVol(), ctx.currentTime, 0.05);
    if ('music' in patch || 'theme' in patch || 'sound' in patch) musicMod.refresh();
    if ('theme' in patch) idlePrewarm();
  });
}

// ---------------------------------------------------------------- recipes
const themeSounds = new Map();   // themeId -> Promise<object|null>
function themeSoundsFor(id) {
  if (!themeSounds.has(id)) {
    themeSounds.set(id, loadTheme(id).then(async t => {
      let s = t && t.sounds;
      if (typeof s === 'function') s = await s();
      if (s && s.default) s = s.default;
      return s && typeof s === 'object' ? s : null;
    }).catch(() => null));
  }
  return themeSounds.get(id);
}
const resolvedThemes = new Map();  // sync view once loaded
function currentTheme() { return getSettings().theme || 'classic'; }
function lookup(id, name) {
  const ts = resolvedThemes.get(id);
  const n1 = name;
  const n2 = ALIASES[name] || BATTLE_ALIASES[name] || name;
  for (const n of [n1, n2]) {
    if (ts && ts[n] && ts[n].build) return { key: `${id}:${n}`, r: ts[n] };
    if (CORE[n]) return { key: `core:${n}`, r: CORE[n] };
    if (BATTLE[n]) return { key: `core:${n}`, r: BATTLE[n] };
  }
  return null;
}
export async function themeReady(id = currentTheme()) {
  const s = await themeSoundsFor(id);
  resolvedThemes.set(id, s);
  return s;
}
export function themeMusic(id = currentTheme()) { return themeSoundsFor(id).then(s => (s && s.music) || null); }

// ---------------------------------------------------------------- rendering + normalising
const buffers = new Map();       // key:v -> AudioBuffer | Promise
const stats = new Map();         // key:v -> {peakDb, loudDb, gainDb, dur}
function kWeightLoud(buf) {
  // max 50 ms RMS of the mid channel after a 2nd-order high-pass (~120 Hz) and +4 dB shelf (> 2 kHz)
  const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels;
  const L = buf.getChannelData(0), R = ch > 1 ? buf.getChannelData(1) : L;
  const hp = biquad('hp', 120, 0.7, sr), hs = biquad('hs', 2000, 0.7, sr, 4);
  const win = Math.max(1, Math.round(sr * 0.05)), sq = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b;
    const m = hs(hp((L[i] + R[i]) * 0.5)); sq[i] = m * m;
  }
  let acc = 0, best = 0;
  for (let i = 0; i < n; i++) { acc += sq[i]; if (i >= win) acc -= sq[i - win]; if (acc > best) best = acc; }
  return { peak, loud: Math.sqrt(best / win) };
}
function biquad(type, f, Q, sr, dbGain = 0) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), A = Math.pow(10, dbGain / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
async function render(key, r, v, sr) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const dur = r.dur || 0.5;
  const oc = new OAC(2, Math.ceil(sr * (dur + 0.05)), sr);
  const s = makeSynth(oc, hash(key) + v * 101);
  r.build(s, v);
  const buf = await oc.startRendering();
  if (r.punch) saturate(buf, r.punch);
  const { peak, loud } = kWeightLoud(buf);
  const target = Math.pow(10, (REF_LOUD + (r.lvl || 0)) / 20);
  let g = loud > 0 ? target / loud : 1;
  if (peak * g > PEAK) g = PEAK / peak;
  // apply gain + 4 ms fade-out guard at the very end (no clicks if a tail is truncated)
  const fadeN = Math.round(sr * 0.004);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    for (let i = 0; i < fadeN; i++) d[d.length - 1 - i] *= i / fadeN;
  }
  stats.set(`${key}:${v}`, { peakDb: db(peak * g), loudDb: db(loud * g), gainDb: db(g), dur: buf.duration, lvl: r.lvl || 0, limited: peak * g >= PEAK * 0.999 });
  return buf;
}
// `punch` (dB): drive the sound into a tanh soft-clipper so the 2-3 ms strike transient stops
// dictating the peak; impacts can then sit louder at the same -3 dBFS ceiling.
function saturate(buf, punchDb) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  if (!peak) return;
  const drive = Math.pow(10, punchDb / 20) / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive); }
}
const db = x => Math.round(20 * Math.log10(Math.max(1e-9, x)) * 10) / 10;
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function getBuffer(key, r, v) {
  const k = `${key}:${v}`;
  let b = buffers.get(k);
  if (!b) {
    const sr = ctx ? ctx.sampleRate : 48000;
    b = render(key, r, v, sr).then(buf => { buffers.set(k, buf); return buf; }).catch(e => { buffers.delete(k); console.warn('[gambit] sound render', key, e); return null; });
    buffers.set(k, b);
  }
  return b;
}

// ---------------------------------------------------------------- voices
const voices = [];              // {src, g, end, tl, name}
const lastPlay = new Map();     // name -> ctx time
const lastVariant = new Map();
const MAX_VOICES = 14;
const played = [];             // recent voice names (debugState)
let battle = null;              // {count} while a board battle is running
const MOVE_NAMES = new Set(['move', 'capture', 'castle', 'promote', 'check', 'tap', 'lowtime', 'tick', 'illegal']);

function startVoice(buf, { name, gain = 1, pan = 0, rate = 1, delay = 0, maxDur, tl }) {
  const c = ctx, t = c.currentTime + Math.max(0, delay);
  const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = c.createGain(); g.gain.value = gain;
  let node = g;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
  node.connect(sfxBus);
  src.connect(g);
  const len = buf.duration / rate;
  let end = t + len;
  if (maxDur && maxDur < len) { end = t + maxDur; g.gain.setValueAtTime(gain, Math.max(t, end - 0.12)); g.gain.linearRampToValueAtTime(0.0001, end); }
  src.start(t); src.stop(end + 0.02);
  const vo = { src, g, end, tl, name };
  played.push(name); if (played.length > 50) played.shift();
  voices.push(vo);
  src.onended = () => { const i = voices.indexOf(vo); if (i >= 0) voices.splice(i, 1); try { node.disconnect(); } catch { /* */ } };
  while (voices.length > MAX_VOICES) stopVoice(voices.shift(), 0.03);
  if (tl) watchTimeline(tl);
  return vo;
}
function stopVoice(vo, fade = 0.08) {
  if (!vo || !ctx) return;
  const t = ctx.currentTime;
  try { vo.g.gain.cancelScheduledValues(t); vo.g.gain.setValueAtTime(vo.g.gain.value, t); vo.g.gain.linearRampToValueAtTime(0.0001, t + fade); vo.src.stop(t + fade + 0.01); } catch { /* already stopped */ }
}
// a skipped battle (board.skip / tap) calls tl.finish() while tweens are still pending: cut its sounds
const watched = new WeakSet();
function watchTimeline(tl) {
  if (watched.has(tl) || typeof tl.finish !== 'function') return;
  watched.add(tl);
  const fin = tl.finish;
  tl.finish = function () {
    if (this.items && this.items.length) for (const vo of voices.slice()) if (vo.tl === this) stopVoice(vo, 0.12);
    return fin.apply(this, arguments);
  };
}

function panFor(at) {
  if (at == null) return 0;
  const x = typeof at === 'number' ? at : (typeof at === 'string' ? ('abcdefgh'.indexOf(at[0]) - 3.5) : at.x);
  if (!(x === x)) return 0;
  const flip = attached && attached.orientation === 'b' ? -1 : 1;
  return Math.max(-1, Math.min(1, x / 4)) * 0.45 * flip;
}

/**
 * Play a named sound. name: any core, battle or theme sound (see docs/notes/audio.md).
 * opts.ctx    a battle/move anim ctx: supplies speed (ctx.tl.rate), skip detection, nothing else needed
 * opts.at     where it happens: Vector3 (world x is used), square 'e4', or board x in [-4, 4] -> subtle pan
 * opts.speed  battle speed 1|2|5 (default: ctx.tl.rate or 1). Faster = slightly higher pitch, shorter tail
 * opts.delay  seconds from now; opts.gain (linear, 1 = normal); opts.pan (-1..1, overrides at); opts.rate
 */
export function sfx(name, opts = {}) {
  if (!soundOn()) return false;
  const c = ensureCtx(); if (!c) return false;
  if (c.state === 'suspended' && document.visibilityState === 'visible') c.resume().catch(() => {});
  const tl = opts.ctx && opts.ctx.tl;
  if (tl && tl.instant) return false;                    // battle was skipped / finished
  const id = opts.theme || currentTheme();
  if (!resolvedThemes.has(id)) themeReady(id);           // first use: core sound now, theme ones once loaded
  const found = lookup(id, name);
  if (!found) { console.warn('[gambit] unknown sound', name); return false; }
  const now = c.currentTime;
  if (now - (lastPlay.get(found.key) ?? -1) < 0.03) return false;   // a burst of identical calls
  lastPlay.set(found.key, now);
  if (battle && !MOVE_NAMES.has(ALIASES[name] || name)) battle.count++;
  const nv = found.r.variants || 1;
  let v = Math.floor(Math.random() * nv);
  if (nv > 1 && v === lastVariant.get(found.key)) v = (v + 1) % nv;
  lastVariant.set(found.key, v);
  const speed = Math.max(1, Number(opts.speed ?? (tl ? tl.rate : opts.ctx?.speed) ?? 1) || 1);
  const rate = (opts.rate ?? 1) * Math.min(1.45, Math.pow(speed, 0.22)) * (1 + (Math.random() * 2 - 1) * 0.025);
  const gain = (opts.gain ?? 1) * (speed >= 4 ? 0.84 : 1) * (1 + (Math.random() * 2 - 1) * 0.06);
  const pan = opts.pan ?? panFor(opts.at);
  const maxDur = speed > 1 ? (found.r.dur || 1) / Math.pow(speed, 0.6) : undefined;
  const go = buf => { if (buf && !(tl && tl.instant)) startVoice(buf, { name, gain, pan, rate, delay: opts.delay || 0, maxDur, tl }); };
  const b = getBuffer(found.key, found.r, v);
  if (b instanceof AudioBuffer) go(b); else b.then(go);
  return true;
}
export const play = (name, opts) => sfx(name, opts);

// ---------------------------------------------------------------- moves
let attached = null;
export function attachBoard(b) {
  if (!b || attached === b || typeof b.on !== 'function') return;
  attached = b;
  b.on('battlestart', () => { battle = { count: 0 }; });
  b.on('battleend', () => { /* playMove's own listener reads battle.count first */ setTimeout(() => { battle = null; }, 0); });
}
function moveKind(v) {
  const flags = v.flags || '';
  if (/[kq]/.test(flags) || v.rookFrom) return 'castle';
  if (v.promotion) return 'promote';
  if (v.captured || /[ce]/.test(flags)) return 'capture';
  return 'move';
}
const sameMove = (d, v) => d && d.move && (d.move === v || (d.move.from === v.from && d.move.to === v.to));
/** Move sound for a verbose move. Lands with the board animation when a board is attached. */
export function playMove(v, { now = false } = {}) {
  if (!v || !soundOn()) return;
  const kind = moveKind(v), san = v.san || '';
  const check = /[+#]/.test(san);
  const fire = (battleHadSound) => {
    if (!battleHadSound) sfx(kind === 'promote' && v.captured ? 'capture' : kind);
    if (kind === 'promote' && v.captured && !battleHadSound) sfx('promote', { delay: 0.08 });
    if (check) sfx('check', { delay: battleHadSound ? 0 : 0.04 });
  };
  const b = attached;
  if (now || !b) { fire(false); return; }
  let done = false, timer = 0;
  const offs = [];
  const finish = had => { if (done) return; done = true; clearTimeout(timer); offs.forEach(f => { try { f(); } catch { /* */ } }); fire(had); };
  const arm = ms => { clearTimeout(timer); timer = setTimeout(() => finish(false), ms); };
  offs.push(b.on('animstart', d => { if (sameMove(d, v)) arm(2500); }));
  offs.push(b.on('battlestart', d => { if (sameMove(d, v)) arm(12000); }));
  offs.push(b.on('battleend', d => { if (sameMove(d, v)) finish(!!(battle && battle.count)); }));
  offs.push(b.on('animend', d => { if (sameMove(d, v)) finish(false); }));
  arm(450);
}

// ---------------------------------------------------------------- prewarm + debug
const COMMON = ['move', 'capture', 'castle', 'check', 'tap', 'start', 'illegal', 'promote', 'lowtime'];
let warmT = 0;
function idlePrewarm() {
  clearTimeout(warmT);
  warmT = setTimeout(() => prewarm().catch(() => {}), 300);
}
export async function prewarm(id = currentTheme(), names = COMMON) {
  await themeReady(id);
  for (const n of names) {
    const f = lookup(id, n); if (!f) continue;
    for (let v = 0; v < (f.r.variants || 1); v++) await getBuffer(f.key, f.r, v);
  }
}
/** Test hook: render every sound of a theme; returns [{key, peakDb, loudDb, ...}] */
export async function debugRenderAll(id = currentTheme()) {
  const ts = await themeReady(id);
  const names = new Set([...Object.keys(CORE), ...Object.keys(BATTLE), ...Object.keys(ts || {}).filter(k => ts[k] && ts[k].build)]);
  const out = [];
  for (const n of names) {
    const f = lookup(id, n);
    for (let v = 0; v < (f.r.variants || 1); v++) { await getBuffer(f.key, f.r, v); out.push({ name: n, key: `${f.key}:${v}`, ...stats.get(`${f.key}:${v}`) }); }
  }
  return out;
}
export function debugBuffer(key) { const b = buffers.get(key); return b instanceof AudioBuffer ? b : null; }
export function debugState() { return { ctx: ctx ? ctx.state : 'none', unlocked, voices: voices.length, buffers: buffers.size, played: played.slice(-12), music: musicMod.state() }; }

export const music = { refresh: () => musicMod.refresh(), state: () => musicMod.state() };
musicMod.configure({ themeMusic, enabled: () => soundOn() && !!getSettings().music, theme: currentTheme, ctx: () => ensureCtx() });

// Sampled piano: Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0), every minor third A0..C7, two velocity layers.
// Plays note JSON: { title, composer, bpm, notes: [[beat, midi, beats, vel], ...], pedal? }
import { getCtx, buses, reverbIR, begin, end } from './ctx.js?v=202610081134';

const ROOT = new URL('../../audio/piano/', import.meta.url);
const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const SAMPLED = [];
for (let m = 21; m <= 96; m += 3) SAMPLED.push(m);
const fileOf = (m, layer) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}${layer}.mp3`;

export const CREDIT = {
  credit: 'Salamander Grand Piano V3 by Alexander Holm',
  license: 'CC BY 3.0',
  page: 'https://archive.org/details/SalamanderGrandPianoV3',
};

const buffers = new Map(); // 'm:layer' -> Promise<AudioBuffer>
let decoder = null;

function load(m, layer) {
  const k = m + layer;
  if (!buffers.has(k)) {
    const p = fetch(new URL(fileOf(m, layer), ROOT)).then((r) => {
      if (!r.ok) throw new Error('piano sample ' + r.status);
      return r.arrayBuffer();
    }).then((ab) => (decoder || getCtx()).decodeAudioData(ab));
    p.catch(() => buffers.delete(k));
    buffers.set(k, p);
  }
  return buffers.get(k);
}

const nearest = (m) => SAMPLED.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
const layerOf = (vel) => (vel >= 84 ? 'f' : 'p');

export function samplesFor(notes) {
  const need = new Set();
  for (const [, m, , v = 80] of notes) need.add(nearest(m) + layerOf(v));
  return [...need];
}

export function preload(piece) {
  const keys = piece ? samplesFor(piece.notes) : SAMPLED.flatMap((m) => [m + 'p', m + 'f']);
  return Promise.all(keys.map((k) => load(parseInt(k), k.slice(-1))));
}

export const sampleUrls = () => SAMPLED.flatMap((m) => ['p', 'f'].map((l) => new URL(fileOf(m, l), ROOT).href));

function chain(c, dest) {
  const dry = c.createGain(); dry.gain.value = 0.62;
  const send = c.createGain(); send.gain.value = 0.18;
  const rv = c.createConvolver(); rv.buffer = c === getCtx() ? reverbIR() : makeIR(c);
  dry.connect(dest); send.connect(rv); rv.connect(dest);
  return { dry, send };
}

function makeIR(c) {
  const len = Math.floor(c.sampleRate * 1.6), b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let s = 99 + ch;
    for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  }
  return b;
}

function voice(c, io, buf, m, sm, t, dur, vel, release) {
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (m - sm) / 12);
  const g = c.createGain();
  // the soft layer is recorded ~8 dB quieter; close most of that gap so quiet pieces stay audible
  const amp = (0.18 + 0.82 * Math.pow(vel / 127, 1.6)) * (vel >= 84 ? 1 : 2);
  // soft notes on the forte layer are darker, so tame the top end a little as velocity drops
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = 2500 + 14000 * Math.pow(vel / 127, 2);
  const end = t + dur;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.004);
  g.gain.setValueAtTime(amp, end);
  g.gain.setTargetAtTime(0, end, release / 4);
  src.connect(lp); lp.connect(g); g.connect(io.dry); g.connect(io.send);
  src.start(t);
  src.stop(end + release + 0.05);
  return { src, g };
}

const spb = (piece) => 60 / (piece.bpm || 100);

// dense pieces (big chords, pedal) get turned down so the mix doesn't clip
function level(piece) {
  if (piece._lvl) return piece._lvl;
  const ev = [];
  for (const [b, , d, v = 80] of piece.notes) { const w = (v / 127) ** 1.6; ev.push([b, w], [b + d + (piece.pedal ? 0.5 : 0.2), -w]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, mx = 0, sum = 0;
  for (const [, w] of ev) { cur += w; mx = Math.max(mx, cur); if (w > 0) sum += w; }
  // quiet (pp) pieces are lifted towards a mezzo-forte average, then dense ones turned down
  const g = Math.min(3, 0.53 / Math.max(0.05, sum / piece.notes.length));
  return (piece._lvl = g * Math.min(1, 1.6 / Math.sqrt(Math.max(1, mx * g))));
}

export function duration(piece) {
  const s = spb(piece);
  return piece.notes.reduce((mx, [b, , d]) => Math.max(mx, (b + d) * s), 0);
}

// opts: { from: seconds offset into the piece, seconds: clip length, rate: tempo multiplier, dest, ctx, fadeOut }
export async function play(piece, opts = {}) {
  const c = opts.ctx || getCtx();
  if (!c) return null;
  if (opts.ctx) decoder = c;
  await preload(piece);
  if (opts.ctx) decoder = null;
  const k = spb(piece) / (opts.rate || 1);
  const from = opts.from || 0;
  const until = opts.seconds ? from + opts.seconds : Infinity;
  const out = c.createGain();
  out.gain.value = level(piece);
  out.connect(opts.dest || buses().music);
  const io = chain(c, out);
  const t0 = c.currentTime + (opts.lead ?? 0.06);
  const pedal = !!piece.pedal;
  let voices = [];
  const todo = [];
  for (const [b, m, d, v = 80] of piece.notes) {
    const ts = b * k;
    if (ts < from - 0.001 || ts >= until) continue;
    todo.push([ts, m, d, v, await buffers.get(nearest(m) + layerOf(v))]);
  }
  todo.sort((a, b) => a[0] - b[0]);
  let next = 0, pumpId = 0;
  // long pieces are scheduled a few seconds ahead instead of building thousands of nodes up front
  const pump = (ahead) => {
    const horizon = c.currentTime - t0 + from + ahead;
    while (next < todo.length && todo[next][0] < horizon) {
      const [ts, m, d, v, buf] = todo[next++];
      let dur = Math.max(0.08, d * k * (pedal ? 1.15 : 0.96));
      dur = Math.min(dur, until - ts + 0.4);
      voices.push(voice(c, io, buf, m, nearest(m), t0 + ts - from, dur, v, pedal ? 0.6 : 0.3));
    }
    if (voices.length > 400) voices = voices.slice(-200);
    if (next >= todo.length) clearInterval(pumpId);
  };
  if (opts.ctx || todo.length < 300) pump(Infinity);
  else { pump(8); pumpId = setInterval(() => pump(8), 2000); }
  const len = Math.min(until, duration(piece)) - from;
  if (opts.seconds) {
    const fe = t0 + opts.seconds;
    out.gain.setValueAtTime(out.gain.value, fe - 0.25);
    out.gain.linearRampToValueAtTime(0, fe + 0.2);
  }
  let stopped = false;
  const h = {
    startedAt: t0, length: len, ctx: c, output: out,
    elapsed: () => Math.max(0, c.currentTime - t0),
    stop(fade = 0.12) {
      if (stopped) return; stopped = true;
      clearInterval(pumpId);
      const n = c.currentTime;
      out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n);
      out.gain.linearRampToValueAtTime(0, n + fade);
      setTimeout(() => { voices.forEach((x) => { try { x.src.stop(); } catch {} }); out.disconnect(); }, fade * 1000 + 60);
    },
    done: null,
  };
  h.done = new Promise((res) => { h._res = res; setTimeout(res, (len + 0.5) * 1000 + 60); });
  if (!opts.ctx && !opts.bgm) {
    const tag = 'piano' + Math.random().toString(36).slice(2);
    begin(tag);
    let over = false;
    const fin = () => { if (!over) { over = true; end(tag); } };
    h.done.then(fin);
    const st = h.stop;
    h.stop = (f) => { st(f); fin(); h._res(); };
  }
  return h;
}

export async function render(piece, opts = {}) {
  const len = Math.min(opts.seconds || Infinity, duration(piece) - (opts.from || 0)) + 1.5;
  const OC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const c = new OC(2, Math.ceil(44100 * len), 44100);
  await play(piece, { ...opts, ctx: c, dest: c.destination, lead: 0.05 });
  return c.startRendering();
}

const cache = new Map();
export function loadPiece(src) {
  const url = new URL(src, new URL('../../', import.meta.url)).href;
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error('piece ' + r.status); return r.json(); });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}

export default { play, render, preload, loadPiece, duration, sampleUrls, CREDIT };

// Clip player: fetch + decode a sound once, keep only the slice a question needs, play it with an analyser.
// Works for Apple previews, Commons/self-hosted files and piano note JSON (audio object {type:'piano', src}).
import { getCtx, buses, begin, end } from './ctx.js?v=202610050139';
import { previewUrl } from './apple.js?v=202610050139';
import * as piano from './piano.js?v=202610050139';

const GAME_ROOT = new URL('../../', import.meta.url);
export const resolve = (src) => new URL(src, GAME_ROOT).href;
export const isPiano = (a) => a?.type === 'piano' || /\/notes\/[^/]+\.json$/.test(a?.src || '');

const slices = new Map(); // key -> Promise<{buffer, duration}>
const MAX_SLICES = 40;

async function fetchDecode(url) {
  const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  const ab = await r.arrayBuffer();
  return getCtx().decodeAudioData(ab);
}

function slice(buf, start, len) {
  const c = getCtx(), sr = buf.sampleRate;
  const s0 = Math.max(0, Math.min(buf.length - 1, Math.floor(start * sr)));
  const n = Math.max(1, Math.min(buf.length - s0, Math.floor((len + 0.25) * sr)));
  const out = c.createBuffer(buf.numberOfChannels, n, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(s0, s0 + n), ch);
  return out;
}

// start may be a number (seconds) or 'auto' → picked by the caller; len = clip seconds (0 = whole file)
export function load(a, { start = 0, len = 0 } = {}) {
  const key = `${a.apple?.trackId || a.src}|${start}|${len}`;
  if (slices.has(key)) return slices.get(key);
  const p = (async () => {
    if (isPiano(a)) {
      const piece = await piano.loadPiece(a.src);
      await piano.preload(piece);
      return { piece, duration: piano.duration(piece) };
    }
    let buf;
    try {
      buf = await fetchDecode(resolve(await previewUrl(a)));
    } catch (e) {
      if (!a.apple?.trackId) throw e;
      a.src = '';
      buf = await fetchDecode(await previewUrl(a));
    }
    const duration = buf.duration;
    return { buffer: len ? slice(buf, Math.min(start, Math.max(0, duration - len)), len) : buf, duration };
  })();
  p.catch(() => slices.delete(key));
  slices.set(key, p);
  if (slices.size > MAX_SLICES) slices.delete(slices.keys().next().value);
  return p;
}

export const preload = (list) => Promise.allSettled(list.map(([a, o]) => load(a, o)));

let current = null;
export function stopAll() { if (current) { current.stop(); current = null; } }

// play a loaded clip; returns { stop, analyser, elapsed(), done }
// len = the loaded slice; playLen (optional, ≤ len) = how much of it to play, so growing clips share one decode
export async function play(a, { start = 0, len = 0, playLen = 0, fade = 0.08 } = {}) {
  stopAll();
  const c = getCtx();
  if (c.state !== 'running') await c.resume().catch(() => {});
  const clip = await load(a, { start, len });
  const an = c.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.7;
  an.connect(buses().music);
  let h;
  if (clip.piece) {
    const ph = await piano.play(clip.piece, { from: start, seconds: playLen || len || undefined, dest: an });
    h = { stop: (f) => ph.stop(f), elapsed: ph.elapsed, done: ph.done, length: ph.length };
  } else {
    const g = c.createGain(), src = c.createBufferSource();
    src.buffer = clip.buffer;
    const dur = Math.min(playLen || len || clip.buffer.duration, clip.buffer.duration), t = c.currentTime + 0.02;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + fade);
    g.gain.setValueAtTime(1, t + dur - fade);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(g); g.connect(an);
    src.start(t, len ? 0 : start, dur + 0.05);
    let res; const done = new Promise((r) => (res = r));
    const tag = 'clip' + Math.random().toString(36).slice(2);
    begin(tag);
    let ended = false;
    src.onended = () => { if (!ended) { ended = true; end(tag); } res(); };
    h = {
      length: dur,
      elapsed: () => Math.max(0, c.currentTime - t),
      stop(f = 0.06) {
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + f);
        try { src.stop(n + f + 0.02); } catch {}
      },
      done,
    };
  }
  h.analyser = an;
  current = h;
  h.done.then(() => { if (current === h) current = null; });
  return h;
}

// reveal / "keep listening": stream the whole preview through an <audio> element (no decode, low memory)
let el = null;
export async function stream(a, { start = 0 } = {}) {
  stopAll();
  if (isPiano(a)) return play(a, { start: 0 });
  if (!el) { el = new Audio(); el.dataset.clued = '1'; el.preload = 'auto'; el.crossOrigin = 'anonymous'; }
  el.src = resolve(await previewUrl(a));
  el.currentTime = start;
  el.volume = Math.min(1, buses().master.gain.value);
  await el.play();
  const h = { stop: () => el.pause(), elapsed: () => el.currentTime - start, done: new Promise((r) => el.addEventListener('ended', r, { once: true })), element: el };
  current = h;
  return h;
}

// pick a deterministic start (seconds) inside a clip; Apple previews skip their first ~3 s
export function pickStart(a, len, rnd, duration = 30) {
  if (typeof a.start === 'number') return a.start;
  if (!a.apple && !a.dur) return 0;
  const lo = a.apple ? 3 : (a.minStart ?? 0);
  const hi = Math.max(lo, Math.min(a.maxStart ?? Infinity, (a.dur || duration) - len - (a.apple ? 1.5 : 0.5)));
  return Math.round((lo + rnd * (hi - lo)) * 10) / 10;
}

// One place that turns a clip plus a character's voicePitch into sound.
//
// Pitch is not a kokoro parameter. It is a resample: playbackRate = 2^(semitones/12). The take on
// disk was synthesised at the inverse speed (vo.js synthSpeed), so the resample lands back on the
// original duration. Both halves have to agree or the clip runs long — which is why generation and
// playback are the two ends of this one file, and why the game's bark runtime must play through
// here rather than with a bare <audio src>.
//
// An HTMLMediaElement will NOT do: `preservesPitch` defaults to true, so playbackRate time-stretches
// and the pitch never moves. A buffer source always resamples.

import { pitchRate } from './vo.js';

// The clip paths in the index are relative to the game root (audio/vo/…), and this module can be
// imported from a page anywhere under it, so they are resolved against the root rather than the
// document.
const rootURL = rel => (/^[a-z]+:|^\//i.test(rel) ? rel
  : new URL(`../../../${rel}`, import.meta.url).href);

let ac = null;
const buffers = new Map();
let current = null;

function context() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

export async function loadClip(url, { bust = false } = {}) {
  const abs = rootURL(url);
  const key = bust ? `${abs}?${Date.now()}` : abs;
  if (!bust && buffers.has(url)) return buffers.get(url);
  const r = await fetch(key, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = await context().decodeAudioData(await r.arrayBuffer());
  buffers.set(url, buf);
  return buf;
}

export function stop() {
  try { current?.stop(); } catch { /* already finished */ }
  current = null;
}

export async function playClip(url, { pitch = 0, gain = 1, bust = false } = {}) {
  const buf = await loadClip(url, { bust });
  const c = context();
  stop();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitchRate(pitch);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.start();
  current = src;
  return { seconds: buf.duration / pitchRate(pitch), source: src };
}

export function forget(url) { buffers.delete(url); }

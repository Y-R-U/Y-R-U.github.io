// One place that turns a clip plus a character's voicePitch into sound.
//
// It lives in js/game/ rather than js/dev/ because the shipped game plays voice lines and
// DEVTOOLS §1 promises that nothing under js/dev/ but gate.js is fetched on a live origin.
// js/dev/chars/play.js is a re-export of this file, so the dev tools' one import path still works.
//
// Pitch is not a kokoro parameter. It is a resample: playbackRate = 2^(semitones/12). The take on
// disk was synthesised at the inverse speed (vo.js synthSpeed), so the resample lands back on the
// original duration. Both halves have to agree or the clip runs long, which is why js/dev/chars/vo.js
// takes pitchRate from here rather than keeping its own copy.
//
// An HTMLMediaElement will NOT do: `preservesPitch` defaults to true, so playbackRate time-stretches
// and the pitch never moves. A buffer source always resamples.

// What a shipped clip is. It lives here, with the decoder that has to read it, so the runtime, the
// tools and the encoder cannot disagree about the extension — they have three times already.
// Opus at 24 kbps measures 17x smaller than the wav on a speech take, twice what mp3 manages at
// the same listening quality. `voice` (mp3) is the fallback if Opus-in-Ogg ever fails a browser's
// decodeAudioData, which is the call this file makes to apply pitch.
export const CODEC = { profile: 'voice-opus', ext: '.ogg' };

export const pitchRate = semitones => Math.pow(2, Math.min(4, Math.max(-4, +semitones || 0)) / 12);

// Clip paths are relative to the game root (audio/vo/…) and this module can be imported from a
// page anywhere under it, so they resolve against the root rather than against the document.
const rootURL = rel => (/^[a-z]+:|^\//i.test(rel) ? rel
  : new URL(`../../${rel}`, import.meta.url).href);

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

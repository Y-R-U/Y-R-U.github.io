// Every sound in HOMEBOUND is built out of oscillators and one noise buffer.
// Nothing is downloaded, which is the point: a gate runner fires ten shots a
// second and a 40 KB wav per shot is both a network bill and a decode stall on
// the first volley. Synthesis costs a few dozen float ops per voice and is
// tunable from here rather than from a sample library.
//
// TWO HARD RULES, both browser policy rather than taste:
//   1. No AudioContext exists until the player has touched the screen. Creating
//      one earlier gets it born `suspended` on iOS and Chrome logs a warning on
//      every load — including the headless screenshot harness, which never
//      gestures at all.
//   2. Voice count is capped and rate-limited. 26 shooters at 3 volleys a
//      second is 78 note-ons; past about a dozen simultaneous voices WebAudio
//      on a phone starts glitching and the mix turns to mud anyway.

import { P } from './save.js';
import { TIERS } from './config.js';

let actx = null;             // created on the first gesture, never before
let master = null;           // everything routes through here so mute is one node
let musicGain = null;
let sfxGain = null;
let noiseBuf = null;         // one second of white noise, shared by every voice
let muted = false;
let armed = false;           // a gesture listener is attached
let voices = 0;              // live oscillator count, for the cap
let curTrack = null;
let musicTimer = 0;
let musicStep = 0;
let musicNext = 0;

const MAX_VOICES = 18;
const RATE_LIMIT = {};       // name → earliest allowed context time

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initAudio() {
  const s = P()?.settings;
  muted = !(s?.sfx ?? true);
  if (armed) return;
  armed = true;
  // `once` on each: whichever gesture arrives first builds the graph and the
  // rest unsubscribe themselves.
  const wake = () => { ensure(); };
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
    window.addEventListener(ev, wake, { once: true, passive: true });
  }
}

function ensure() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return actx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }

  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(actx.destination);

  sfxGain = actx.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(master);

  musicGain = actx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);

  // One noise buffer for the whole game. Gunfire, explosions, debris and the
  // barrier crash are all this buffer through different filters — which is also
  // why they sound like they belong to the same game.
  const n = actx.sampleRate | 0;
  noiseBuf = actx.createBuffer(1, n, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

  if (curTrack) music(curTrack);
  return actx;
}

// Callable before the first gesture: the flag is remembered and `ensure()`
// applies it when the graph finally exists. A settings toggle on the main menu
// must not be the thing that creates an AudioContext.
export function setMuted(b) {
  muted = !!b;
  if (actx && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, actx.currentTime, 0.02);
  if (actx && musicGain && muted) musicGain.gain.setTargetAtTime(0, actx.currentTime, 0.05);
  else if (actx && curTrack && !muted) music(curTrack);
  return muted;
}

// --------------------------------------------------------------------------
// Voice primitives
// --------------------------------------------------------------------------

// A gain node that ramps 0 → peak → 0 and disconnects itself. Every voice ends
// through one of these, so nothing in this file can leak a running node.
function env(dest, t0, peak, attack, decay) {
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(dest);
  return g;
}

function tone(type, f0, f1, t0, dur, peak, dest = sfxGain, detune = 0) {
  if (voices >= MAX_VOICES) return null;
  voices++;
  const o = actx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = env(dest, t0, peak, Math.min(0.008, dur * 0.2), dur);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
  o.onended = () => { voices--; g.disconnect(); };
  return o;
}

function noise(t0, dur, peak, filterType, f0, f1, q = 1, dest = sfxGain) {
  if (voices >= MAX_VOICES) return null;
  voices++;
  const s = actx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.85 + Math.random() * 0.3;
  s.loop = true;
  const bp = actx.createBiquadFilter();
  bp.type = filterType;
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = env(dest, t0, peak, 0.003, dur);
  s.connect(bp); bp.connect(g);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.05);
  s.onended = () => { voices--; bp.disconnect(); g.disconnect(); };
  return s;
}

// Rate limit in *context* time, not wall time, so a paused tab cannot bank up
// a hundred pending cracks and fire them all on resume.
function gate(name, minGap) {
  const t = actx.currentTime;
  if ((RATE_LIMIT[name] || 0) > t) return false;
  RATE_LIMIT[name] = t + minGap;
  return true;
}

// --------------------------------------------------------------------------
// The kit
// --------------------------------------------------------------------------

export function sfx(name, opts) {
  if (!actx || muted || !noiseBuf) return null;
  const t = actx.currentTime + 0.001;
  const tier = (opts && opts.tier) || 0;
  const vol = (opts && opts.vol) != null ? opts.vol : 1;

  switch (name) {
    // A rifle crack is a click plus a short filtered noise tail. Heavier tiers
    // drop the band and stretch the tail, which is the whole reason a tank
    // volley feels different from a rifleman volley without a second sample.
    case 'shot': {
      if (!gate('shot', 0.055)) return null;
      const heavy = Math.min(1, tier / (TIERS.length - 1));
      const f = 2600 - heavy * 1700;
      noise(t, 0.05 + heavy * 0.11, 0.32 * vol, 'bandpass', f, f * 0.35, 1.1);
      tone('square', 220 - heavy * 110, 60, t, 0.05 + heavy * 0.09, 0.10 * vol);
      if (heavy > 0.35) tone('sine', 90, 42, t, 0.16, 0.16 * vol * heavy);
      break;
    }
    case 'enemyShot': {
      if (!gate('enemyShot', 0.11)) return null;
      noise(t, 0.05, 0.13 * vol, 'bandpass', 1500, 700, 1.4);
      break;
    }
    case 'impact': {
      if (!gate('impact', 0.045)) return null;
      noise(t, 0.045, 0.14 * vol, 'highpass', 2400, 1100, 0.7);
      break;
    }
    // Enemy death: a wet thud with a little pitch under it, deliberately quiet
    // because at a hundred kills a second anything louder is a buzzsaw.
    case 'kill': {
      if (!gate('kill', 0.07)) return null;
      noise(t, 0.09, 0.11 * vol, 'lowpass', 900, 260, 0.9);
      tone('triangle', 150, 70, t, 0.09, 0.05 * vol);
      break;
    }
    case 'hurt': {
      if (!gate('hurt', 0.14)) return null;
      noise(t, 0.14, 0.16 * vol, 'lowpass', 700, 180, 1.2);
      tone('sawtooth', 130, 58, t, 0.14, 0.07 * vol);
      break;
    }
    // The gate chime is the only pure-tone thing in the mix. That contrast is
    // deliberate: it is the sound of the economy, and it must cut through fire.
    case 'gate': {
      const base = 660;
      tone('triangle', base, base, t, 0.16, 0.16 * vol);
      tone('sine', base * 1.5, base * 1.5, t + 0.045, 0.2, 0.12 * vol);
      break;
    }
    case 'grow': {
      if (!gate('grow', 0.08)) return null;
      const step = Math.min(11, (opts && opts.step) || 0);
      tone('sine', 520 * Math.pow(1.0595, step), 0, t, 0.09, 0.10 * vol);
      break;
    }
    case 'promote': {
      // Rising major triad — the one unambiguously happy sound in the game.
      [0, 4, 7, 12].forEach((semi, i) => {
        tone('triangle', 392 * Math.pow(2, semi / 12), 392 * Math.pow(2, semi / 12), t + i * 0.065, 0.34, 0.15 * vol);
      });
      break;
    }
    case 'barrier': {
      noise(t, 0.42, 0.30 * vol, 'lowpass', 1500, 160, 0.8);
      tone('square', 120, 44, t, 0.26, 0.14 * vol);
      break;
    }
    case 'boom': {
      const s = Math.min(2.2, (opts && opts.scale) || 1);
      if (!gate('boom', 0.05)) return null;
      noise(t, 0.30 + s * 0.35, 0.42 * vol, 'lowpass', 1300 + s * 400, 90, 0.7);
      tone('sine', 130 * (1.3 - s * 0.25), 32, t, 0.34 + s * 0.3, 0.34 * vol);
      tone('sawtooth', 74, 28, t + 0.02, 0.24, 0.12 * vol);
      break;
    }
    case 'bossHit': {
      if (!gate('bossHit', 0.09)) return null;
      noise(t, 0.07, 0.12 * vol, 'bandpass', 900, 420, 2.4);
      tone('square', 180, 120, t, 0.07, 0.06 * vol);
      break;
    }
    case 'bossPhase': {
      tone('sawtooth', 70, 190, t, 0.7, 0.24 * vol);
      noise(t, 0.7, 0.2 * vol, 'lowpass', 400, 1600, 1.0);
      break;
    }
    case 'pickup': {
      tone('sine', 880, 1320, t, 0.11, 0.12 * vol);
      break;
    }
    case 'win': {
      [0, 4, 7, 12, 16].forEach((s2, i) =>
        tone('triangle', 330 * Math.pow(2, s2 / 12), 330 * Math.pow(2, s2 / 12), t + i * 0.11, 0.55, 0.17 * vol));
      break;
    }
    case 'lose': {
      [0, -3, -7, -12].forEach((s2, i) =>
        tone('sawtooth', 300 * Math.pow(2, s2 / 12), 300 * Math.pow(2, s2 / 12), t + i * 0.16, 0.6, 0.14 * vol));
      break;
    }
    default: return null;
  }
  return true;
}

// --------------------------------------------------------------------------
// Music — a two-bar drone loop, scheduled with a lookahead
// --------------------------------------------------------------------------
//
// setInterval alone cannot schedule music: its jitter is tens of milliseconds
// and the loop audibly limps. The standard fix is a coarse timer that schedules
// *ahead* on the audio clock, which is what this is. It is deliberately tiny —
// a drone, a heartbeat and a sparse minor motif, enough to sit under gunfire
// without competing with it.

const RUN_NOTES = [0, 0, 3, 0, 5, 0, 3, -2];
const MENU_NOTES = [0, 7, 5, 3, 0, 7, 10, 7];
const ROOT = 98;             // G2, low enough to leave the whole midrange free

export function music(track) {
  curTrack = track;
  if (!actx) return null;    // remembered; ensure() replays this on first gesture
  clearInterval(musicTimer);
  musicTimer = 0;
  if (!track) {
    musicGain.gain.setTargetAtTime(0, actx.currentTime, 0.25);
    return null;
  }
  const on = P()?.settings?.music !== false;
  musicGain.gain.setTargetAtTime(on && !muted ? (track === 'run' ? 0.16 : 0.20) : 0, actx.currentTime, 0.4);

  // The drone is one long-lived pair of detuned saws behind a lowpass. It is
  // started once and left running; only the motif is re-scheduled.
  startDrone(track);

  musicStep = 0;
  musicNext = actx.currentTime + 0.1;
  musicTimer = setInterval(() => schedule(track), 90);
  return track;
}

let droneNodes = null;
function startDrone(track) {
  stopDrone();
  const t = actx.currentTime;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = track === 'run' ? 420 : 300; lp.Q.value = 0.8;
  const g = actx.createGain();
  g.gain.value = 0.5;
  lp.connect(g); g.connect(musicGain);
  const os = [];
  for (const d of [-7, 6]) {
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = ROOT / 2;
    o.detune.value = d;
    o.connect(lp); o.start(t);
    os.push(o);
  }
  // A slow filter sweep is what stops a drone reading as a stuck note.
  const lfo = actx.createOscillator();
  lfo.type = 'sine'; lfo.frequency.value = 0.06;
  const lg = actx.createGain(); lg.gain.value = 140;
  lfo.connect(lg); lg.connect(lp.frequency);
  lfo.start(t);
  droneNodes = { os, lfo, lp, g, lg };
}
function stopDrone() {
  if (!droneNodes) return;
  const t = actx.currentTime;
  droneNodes.g.gain.setTargetAtTime(0, t, 0.2);
  for (const o of droneNodes.os) o.stop(t + 0.8);
  droneNodes.lfo.stop(t + 0.8);
  droneNodes = null;
}

const STEP = 0.34;
function schedule(track) {
  const notes = track === 'run' ? RUN_NOTES : MENU_NOTES;
  const ahead = actx.currentTime + 0.25;
  let guard = 0;
  while (musicNext < ahead && guard++ < 8) {
    const i = musicStep % notes.length;
    const f = ROOT * Math.pow(2, notes[i] / 12);
    // Beat 0 and 4 get a kick; the motif plays on the off-beats so the two
    // never mask each other.
    if (i % 4 === 0) {
      const o = actx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, musicNext);
      o.frequency.exponentialRampToValueAtTime(42, musicNext + 0.16);
      const g = env(musicGain, musicNext, 0.5, 0.004, 0.16);
      o.connect(g); o.start(musicNext); o.stop(musicNext + 0.24);
      o.onended = () => g.disconnect();
    } else if (i % 2 === 1) {
      const o = actx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * 2;
      const g = env(musicGain, musicNext, 0.18, 0.02, 0.34);
      o.connect(g); o.start(musicNext); o.stop(musicNext + 0.42);
      o.onended = () => g.disconnect();
    }
    musicNext += STEP;
    musicStep++;
  }
}

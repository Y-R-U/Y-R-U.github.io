// Procedural audio. No files: an engine built from two detuned saws through a
// filter, a crowd built from noise, impacts built from noise bursts, and a
// two-line sequencer for the music.

import { profile } from './save.js';
import { state } from './state.js';
import { on } from './bus.js';
import { DEV_MODE } from './config.js';
import { clamp, clamp01, lerp, rand } from './utils.js';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let musicDuck = null;
let crowdBus = null;
let noiseBuf = null;

let engine = null;
let crowd = null;
let wind = null;
let grind = null;
let squeal = null;
let tension = null;
let music = null;
let started = false;

// Transient dips, decayed on the audio clock so ?speed=N does not rush them.
let crowdDip = 0;
let musicDip = 0;
let clockAt = 0;
const invest = { on: false, t: 0 };
let onAirAt = -9;
let wasOnAir = false;

// Cue counter for headless runs; nothing allocates it unless ?dev=1.
const tel = DEV_MODE ? {} : null;
if (tel) window.__audio = tel;
function count(k) { if (tel) tel[k] = (tel[k] || 0) + 1; }

// ---------------------------------------------------------------------------
export function initAudio() {
  const arm = () => {
    if (started) return;
    started = true;
    try { build(); } catch (e) { console.warn('[audio] unavailable', e); }
  };
  window.addEventListener('pointerdown', arm, { once: true });
  window.addEventListener('keydown', arm, { once: true });
  window.addEventListener('touchstart', arm, { once: true, passive: true });
  wireEvents();
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = profile.settings.sfx ? 0.85 : 0;
  sfxBus.connect(master);

  // The duck is a separate node so the per-frame settings gain never fights it.
  musicDuck = ctx.createGain();
  musicDuck.gain.value = 1;
  musicDuck.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = profile.settings.music ? 0.32 : 0;
  musicBus.connect(musicDuck);

  // shared noise buffer
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  buildEngine();
  buildCrowd();
  buildWind();
  buildGrind();
  buildSqueal();
  buildTension();
  if (pendingMusic) playMusic(pendingMusic);
}

function buildEngine() {
  const g = ctx.createGain();
  g.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 3.5;

  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 70;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 35;
  const o2g = ctx.createGain();
  o2g.gain.value = 0.35;

  // a little grit
  const rasp = ctx.createBufferSource();
  rasp.buffer = noiseBuf;
  rasp.loop = true;
  const raspG = ctx.createGain();
  raspG.gain.value = 0.05;

  o1.connect(filter);
  o2.connect(o2g).connect(filter);
  rasp.connect(raspG).connect(filter);
  filter.connect(g).connect(sfxBus);
  o1.start(); o2.start(); rasp.start();

  engine = { g, filter, o1, o2, level: 0 };
}

// The crowd is a bed plus two reaction voices. Everything is the same noise
// through the same bus, because it is meant to be the same people: a cheer is
// the bed leaning forward, not a sample played over the top of it.
function buildCrowd() {
  crowdBus = ctx.createGain();
  crowdBus.gain.value = 1;
  crowdBus.connect(sfxBus);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(g).connect(crowdBus);
  src.start();
  crowd = { g, bp, voices: [crowdVoice(), crowdVoice()] };
}

function crowdVoice() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  // The shriek on top of a roar. Turned down for a groan, which is all chest.
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 2400;
  peak.Q.value = 1.1;
  peak.gain.value = 0;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(peak).connect(g).connect(crowdBus);
  src.start(ctx.currentTime, rand(0, 1.6));   // two voices, uncorrelated noise
  return { bp, peak, g, freeAt: 0 };
}

function buildGrind() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1600;
  bp.Q.value = 1.1;
  const ring = ctx.createBiquadFilter();   // steel on tarmac has a pitch to it
  ring.type = 'peaking';
  ring.frequency.value = 3100;
  ring.Q.value = 5;
  ring.gain.value = 9;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(ring).connect(g).connect(sfxBus);
  src.start();
  grind = { g, bp, ring };
}

function buildSqueal() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 9;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(g).connect(sfxBus);
  src.start();
  squeal = { g, bp };
}

// The investigation bed: a rising "ohhhh" over a drone. Open-ended on purpose —
// it holds until a verdict arrives, however long that turns out to be.
function buildTension() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 380;
  bp.Q.value = 1.6;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(g).connect(crowdBus);
  src.start();

  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 44;
  const dg = ctx.createGain();
  dg.gain.value = 0;
  drone.connect(dg).connect(sfxBus);
  drone.start();

  tension = { g, bp, drone, dg };
}

function buildWind() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(lp).connect(g).connect(sfxBus);
  src.start();
  wind = { g, lp };
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------
function noiseBurst(dur, freq, q, gain, sweepTo) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start();
  src.stop(ctx.currentTime + dur + 0.02);
}

function tone(freq, dur, type = 'sine', gain = 0.2, sweepTo = null, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// ---------------------------------------------------------------------------
// Crowd reactions
// ---------------------------------------------------------------------------
// Each one is an envelope on a voice that is already running, so a reaction
// costs no nodes and can never pile up. `f0 -> f1` is the shape of the sound:
// a roar opens upward, a gasp shuts, a groan falls into the chest.
const REACT = {
  roar:   { g: 0.30, atk: 0.10, dec: 1.9, f0: 700,  f1: 1500, q: 0.7, br: 8 },
  cheer:  { g: 0.33, atk: 0.07, dec: 2.6, f0: 820,  f1: 1750, q: 0.6, br: 10 },
  gasp:   { g: 0.17, atk: 0.04, dec: 0.6, f0: 1500, f1: 950,  q: 1.1, br: 4 },
  groan:  { g: 0.26, atk: 0.20, dec: 2.0, f0: 430,  f1: 250,  q: 0.9, br: -7 },
  murmur: { g: 0.11, atk: 0.24, dec: 1.1, f0: 620,  f1: 820,  q: 0.9, br: 0 },
};

let reactAt = -9;

function crowdReact(kind, intensity = 1, force = false) {
  if (!ctx || !crowd || !profile.settings.sfx) return;
  const r = REACT[kind];
  if (!r) return;
  const now = ctx.currentTime;
  if (!force && now - reactAt < 0.14) return;   // one crowd, not a stack of them
  reactAt = now;
  count(kind);

  let v = crowd.voices[0];
  for (const c of crowd.voices) if (c.freeAt < v.freeAt) v = c;

  const size = 0.55 + clamp01(state.hype / 100) * 0.45;   // a full house is louder
  const peak = clamp(r.g * intensity * size, 0.008, 0.4);
  const dec = r.dec * (0.7 + clamp(intensity, 0.2, 1.6) * 0.3);
  const end = now + r.atk + dec;
  v.freeAt = end;
  v.bp.Q.value = r.q;
  v.peak.gain.value = r.br;

  const gp = v.g.gain;
  gp.cancelScheduledValues(now);
  gp.setValueAtTime(Math.max(0.0001, gp.value), now);
  gp.linearRampToValueAtTime(peak, now + r.atk);
  gp.exponentialRampToValueAtTime(0.0004, end);

  const fp = v.bp.frequency;
  fp.cancelScheduledValues(now);
  fp.setValueAtTime(r.f0, now);
  fp.linearRampToValueAtTime(r.f1, now + r.atk + dec * 0.4);
  fp.linearRampToValueAtTime(r.f0 * 0.9, end);

  // The bed leans out of the way and comes back, which is what makes the
  // reaction sound like it came from the same stand.
  crowdDip = Math.max(crowdDip, clamp01(intensity * 0.9));
}

// The one piece of feedback the game had none of. Four tiers, and they are
// meant to be identifiable with your eyes on the road: a shrug, a tut, a
// three-note "that's a look", and a klaxon.
function foulSting(susp, cover) {
  if (!ctx || !profile.settings.sfx) return;
  const tier = susp < 8 ? 0 : susp < 22 ? 1 : susp < 48 ? 2 : 3;
  count('foul' + tier);
  switch (tier) {
    case 0:
      tone(150, 0.1, 'triangle', 0.06);
      break;
    case 1:
      tone(392, 0.07, 'square', 0.08);
      tone(330, 0.09, 'square', 0.07, null, 0.07);
      break;
    case 2:
      [520, 415, 330].forEach((f, k) => tone(f, 0.11, 'square', 0.1, null, k * 0.075));
      noiseBurst(0.16, 1500, 2, 0.06, 600);
      break;
    default:
      tone(320, 0.34, 'sawtooth', 0.17, 190);
      tone(240, 0.3, 'square', 0.11, 150, 0.16);
      noiseBurst(0.46, 900, 0.8, 0.14, 160);
      crowdReact('gasp', 1.1, true);
      musicDip = 1;
      break;
  }
  // …and whether the cameras had it, which is the other half of the risk.
  if (cover > 0.3) {
    noiseBurst(0.05, 5200, 4, 0.06);
    tone(1560, 0.05, 'square', 0.045, null, 0.05);
  }
}

export function sfx(kind, intensity = 1) {
  if (!ctx || !profile.settings.sfx) return;
  count(kind);
  const i = clamp(intensity, 0.1, 2);
  switch (kind) {
    case 'hit': noiseBurst(0.16 * i, 320, 1.1, 0.34 * i, 90); tone(74, 0.13, 'square', 0.16 * i, 40); break;
    case 'scrape': noiseBurst(0.2, 2600, 6, 0.13 * i, 1400); break;
    case 'crash': noiseBurst(0.5 * i, 240, 0.7, 0.5, 60); tone(58, 0.35, 'sawtooth', 0.22, 26); break;
    case 'partoff': noiseBurst(0.18, 1400, 3, 0.2, 500); break;
    case 'boost': tone(180, 0.5, 'sawtooth', 0.16, 900); noiseBurst(0.42, 700, 1, 0.12, 3200); break;
    case 'pad': tone(520, 0.22, 'triangle', 0.16, 1200); break;
    case 'pickup': tone(700, 0.1, 'square', 0.13); tone(1050, 0.12, 'square', 0.1, null, 0.08); break;
    case 'chest': [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.3, 'triangle', 0.16, null, k * 0.09)); break;
    case 'attack': noiseBurst(0.24, 900, 2, 0.24, 220); tone(140, 0.2, 'sawtooth', 0.14, 50); break;
    case 'alarm': tone(880, 0.14, 'square', 0.14); tone(660, 0.16, 'square', 0.14, null, 0.16); break;
    case 'fine': tone(300, 0.5, 'sawtooth', 0.2, 90); noiseBurst(0.4, 400, 1, 0.14, 120); break;
    case 'cleared': [660, 880, 1100].forEach((f, k) => tone(f, 0.26, 'triangle', 0.15, null, k * 0.08)); break;
    case 'light': tone(440, 0.13, 'square', 0.18); break;
    case 'go': tone(880, 0.42, 'square', 0.22); break;
    case 'ui': tone(620, 0.05, 'square', 0.07); break;
    case 'cine': tone(120, 0.9, 'sine', 0.11, 70); break;
    case 'lap': tone(760, 0.12, 'triangle', 0.13); tone(1010, 0.16, 'triangle', 0.11, null, 0.1); break;
    case 'onair': tone(740, 0.07, 'triangle', 0.06); tone(1110, 0.1, 'triangle', 0.05, null, 0.07); break;
    case 'lastlap': [880, 1170, 1560].forEach((f, k) => tone(f, 0.22, 'triangle', 0.13, null, k * 0.11)); break;
    case 'flag': [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.34, 'triangle', 0.15, null, k * 0.1)); break;
    default: break;
  }
}

function wireEvents() {
  on('car:railHit', ({ impact }) => sfx(impact > 12 ? 'hit' : 'scrape', clamp(impact / 14, 0.3, 1.6)));
  on('race:contact', ({ closing, a, b }) => {
    if (a.isPlayer || b.isPlayer) sfx('hit', clamp(closing / 16, 0.3, 1.5));
  });
  on('car:wreck', ({ car }) => {
    if (car.isPlayer || Math.random() < 0.6) sfx('crash', car.isPlayer ? 1.4 : 0.8);
    crowdReact('roar', car.isPlayer ? 0.95 : 1.15);
    if (car.isPlayer) musicDip = 1;
  });
  on('car:partOff', ({ car }) => sfx('partoff', car.isPlayer ? 1.2 : 0.7));
  on('car:landed', ({ car, air, peak }) => {
    if (car.isPlayer && (peak > 1.6 || air > 1.1)) crowdReact('roar', clamp(peak / 3.2, 0.5, 1.3));
  });
  on('car:driftEnd', ({ car, time }) => {
    if (car.isPlayer && time > 1.5) crowdReact('murmur', clamp(time / 3, 0.5, 1.1));
  });
  on('race:nearMiss', ({ gap }) => crowdReact('gasp', clamp(1.3 - gap, 0.5, 1.2)));
  // Taking the lead is the moment they came for; the rest is a ripple.
  on('race:overtake', ({ position }) => crowdReact(position === 1 ? 'roar' : 'murmur', 0.7));
  on('car:boost', ({ car }) => { if (car.isPlayer) { sfx('boost'); if (music) music.lift = 1; } });
  on('car:padBoost', ({ car }) => { if (car.isPlayer) sfx('pad'); });
  on('pickup:boost', () => sfx('pickup'));
  on('pickup:chest', () => sfx('pickup', 1.3));
  on('attack:fired', ({ car }) => { if (car.isPlayer) sfx('attack'); });
  on('steward:foul', ({ car, susp, cover }) => { if (car.isPlayer) foulSting(susp, cover); });
  on('steward:investigating', () => { sfx('alarm'); invest.on = true; invest.t = 0; });
  on('steward:verdict', ({ cleared }) => {
    sfx(cleared ? 'cleared' : 'fine');
    if (invest.on) crowdReact(cleared ? 'cheer' : 'groan', cleared ? 1.25 : 1, true);
    invest.on = false;      // the tension bed releases from updateInvestigation
  });
  on('car:lap', ({ car }) => {
    if (!car.isPlayer) return;
    if (state.laps > 1 && car.lap === state.laps - 1) { sfx('lastlap'); crowdReact('murmur', 0.9); }
    else sfx('lap');
  });
  on('race:playerFinish', ({ position }) => {
    sfx('flag');
    crowdReact('cheer', position === 1 ? 1.35 : position <= 3 ? 1 : 0.7, true);
    finishFanfare();
  });
  on('race:go', () => sfx('go'));
  // playMusic('race') is a no-op when the race tune is already running, so the
  // per-race music flags are cleared here or a rematch starts on the outro.
  on('race:start', () => {
    invest.on = false;
    wasOnAir = false;
    if (music) { music.post = false; music.lift = 0; }
  });
}

// ---------------------------------------------------------------------------
// Continuous layers
// ---------------------------------------------------------------------------
export function updateAudio(dt) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  // Everything that decays runs on the audio clock, not on `dt`, which carries
  // ?speed=N and would rush every recovery with it.
  const adt = clockAt ? Math.min(0.1, ctx.currentTime - clockAt) : 0.016;
  clockAt = ctx.currentTime;
  crowdDip = Math.max(0, crowdDip - adt * 1.3);
  musicDip = Math.max(0, musicDip - adt * 0.9);

  if (sfxBus) sfxBus.gain.value = profile.settings.sfx ? 0.85 : 0;
  if (musicBus) musicBus.gain.value = profile.settings.music ? 0.3 : 0;

  const p = state.player;
  const racing = state.screen === 'race' && p && !state.paused;

  if (engine) {
    if (racing) {
      const v = Math.max(0, p.forwardSpeed);
      const rev = 62 + (v % 22) * 6 + Math.min(v, 74) * 1.4;
      engine.o1.frequency.setTargetAtTime(rev, ctx.currentTime, 0.05);
      engine.o2.frequency.setTargetAtTime(rev * 0.5, ctx.currentTime, 0.05);
      engine.filter.frequency.setTargetAtTime(500 + v * 26 + (p.boosting ? 1400 : 0), ctx.currentTime, 0.08);
      const want = (p.mode === 'grid' ? 0.03 : 0.1 + clamp01(v / 74) * 0.14) * (p.stun > 0 ? 0.2 : 1);
      engine.g.gain.setTargetAtTime(want, ctx.currentTime, 0.09);
    } else {
      engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
  }

  if (crowd) {
    // The bed is quieter than it was: the reactions need somewhere to go.
    const base = racing ? 0.02 + clamp01(state.hype / 100) * 0.1 : (state.screen === 'race' ? 0.02 : 0);
    crowd.g.gain.setTargetAtTime(base * (1 - crowdDip * 0.55), ctx.currentTime, 0.25);
    crowd.bp.frequency.setTargetAtTime(700 + clamp01(state.hype / 100) * 900, ctx.currentTime, 0.5);
  }

  if (wind) {
    const v = racing ? Math.max(0, p.forwardSpeed) : 0;
    wind.g.gain.setTargetAtTime(clamp01(v / 74) * 0.07, ctx.currentTime, 0.15);
    wind.lp.frequency.setTargetAtTime(300 + v * 14, ctx.currentTime, 0.2);
  }

  updateGrind(racing, p);
  updateInvestigation(adt);
  updateBroadcast(racing);

  if (musicDuck) {
    const want = invest.on ? 0.45 : 1 - musicDip * 0.4;
    musicDuck.gain.setTargetAtTime(want, ctx.currentTime, 0.14);
  }

  if (music) {
    if (music.lift) music.lift = Math.max(0, music.lift - adt * 0.5);
    stepMusic();
  }
}

// Bare rims and tortured tyres. Both are one running chain apiece with a gate
// on the front, so a race with three wheels missing costs the same as a clean
// one — and both stop dead when the car does.
function updateGrind(racing, p) {
  const now = ctx.currentTime;
  const v = racing ? Math.abs(p.forwardSpeed) : 0;

  if (grind) {
    const n = racing && p.stumps ? p.stumps.length : 0;
    const on = n > 0 && v > 3.5 && p.h < 0.3 && p.mode !== 'wreck' && p.mode !== 'out';
    const heat = clamp01(v / 45);
    const want = on ? Math.min(0.14, (0.035 + heat * 0.06) * (1 + (n - 1) * 0.3)) : 0;
    grind.g.gain.setTargetAtTime(want, now, on ? 0.06 : 0.1);
    if (on) {
      grind.bp.frequency.setTargetAtTime(900 + v * 34, now, 0.12);
      grind.ring.frequency.setTargetAtTime(2400 + v * 26 + n * 120, now, 0.15);
    }
  }

  if (squeal) {
    const on = racing && p.driftTime > 0 && v > 12;
    const want = on ? clamp01(p.driftTime / 0.8) * (0.02 + clamp01(v / 60) * 0.045) : 0;
    squeal.g.gain.setTargetAtTime(want, now, on ? 0.07 : 0.12);
    if (on) squeal.bp.frequency.setTargetAtTime(2200 + v * 12, now, 0.2);
  }
}

// The stewards are looking at it. This holds — it does not run to a fixed
// length — because the intention is that a later pass makes the verdict
// something the crowd decides while this is playing.
function updateInvestigation(adt) {
  if (!tension) return;
  const now = ctx.currentTime;
  if (invest.on && (state.screen !== 'race' || (invest.t > 0.8 && state.investigating <= 0))) invest.on = false;
  // Paused releases the bed but keeps the review open: the clock is not running.
  if (invest.on && !state.paused) {
    invest.t += adt;
    const heat = clamp01(invest.t / 3);
    const mob = 0.4 + clamp01(state.hype / 100) * 0.6;     // how many of them care
    tension.g.gain.setTargetAtTime(0.075 * (0.35 + heat * 0.65) * mob, now, 0.3);
    tension.bp.frequency.setTargetAtTime(360 + heat * 520 * mob, now, 0.45);
    tension.bp.Q.value = 1.6 - heat * 0.7;
    tension.dg.gain.setTargetAtTime(0.05 * (0.3 + heat * 0.7), now, 0.35);
    tension.drone.frequency.setTargetAtTime(44 + heat * 13, now, 0.6);
  } else if (tension.g.gain.value > 0.0005 || tension.dg.gain.value > 0.0005) {
    tension.g.gain.setTargetAtTime(0, now, 0.18);
    tension.dg.gain.setTargetAtTime(0, now, 0.2);
  }
}

function updateBroadcast(racing) {
  const on = racing && state.phase === 'racing' && state.inCameraCone;
  if (on && !wasOnAir && ctx.currentTime - onAirAt > 3.5) {
    onAirAt = ctx.currentTime;
    sfx('onair');
    crowdReact('murmur', 0.45);
  }
  wasOnAir = on;
}

// ---------------------------------------------------------------------------
// Music: a two-bar loop scheduled a beat at a time.
// ---------------------------------------------------------------------------
const TUNES = {
  menu: { bpm: 96, bass: [0, 0, 7, 5, 3, 3, 7, 5], lead: [12, 15, 19, 15, 14, 12, 10, 12], root: 55, drums: 0.4 },
  race: { bpm: 148, bass: [0, 0, 3, 0, 5, 5, 3, 7], lead: [12, 12, 15, 17, 19, 17, 15, 12], root: 49, drums: 1 },
};

let pendingMusic = null;

export function playMusic(name) {
  if (!ctx) { pendingMusic = name; return; }
  const tune = TUNES[name];
  if (!tune) return;
  if (music && music.name === name) return;
  music = { name, tune, step: 0, next: ctx.currentTime + 0.08, lift: 0, post: false };
}

export function stopMusic() { music = null; }

function finishFanfare() {
  if (!ctx || !music) return;
  music.post = true;
  const t = ctx.currentTime + 0.05;
  const root = music.tune.root * 2;
  [0, 4, 7, 12].forEach((n, k) => mNote(root * Math.pow(2, n / 12), 0.5, 'square', 0.07, t + k * 0.12, 3000));
  mNoise(0.3, 180, 0.6, 0.18, t);
}

// The last lap takes the lead line off the top and puts a hat under it — same
// tune, no new notes, but it stops sounding like the middle of the race.
function lastLap() {
  const p = state.player;
  return !!p && !music.post && state.screen === 'race' && state.phase === 'racing'
    && state.laps > 1 && p.lap >= state.laps - 1;
}

function stepMusic() {
  const { tune } = music;
  const beat = 60 / tune.bpm / 2;
  const last = lastLap();
  const lift = music.lift || 0;
  let guard = 0;
  while (music.next < ctx.currentTime + 0.25 && guard++ < 8) {
    const t = music.next;
    const i = music.step % 8;
    const semi = (n) => tune.root * Math.pow(2, n / 12);

    mNote(semi(tune.bass[i]), beat * 0.9, 'sawtooth', 0.15, t, 260 + lift * 700);
    if (!last && (music.step % 2 === 0 || music.post)) {
      mNote(semi(tune.lead[i]) * 2, beat * 0.55, 'square', music.post ? 0.055 : 0.045, t, 2400);
    }
    if (tune.drums) {
      if (i % 4 === 0) mNoise(0.1, 140, 0.7, 0.22 * tune.drums, t);
      if (i % 4 === 2) mNoise(0.07, 2200, 1.4, 0.1 * tune.drums, t);
      if (last || music.post) {
        mNoise(0.028, 8000, 1.2, (i % 2 ? 0.05 : 0.03) * tune.drums, t);
        if (last && i === 7) mNoise(0.09, 150, 0.8, 0.15 * tune.drums, t + beat * 0.5);
      }
    }
    music.next += beat;
    music.step++;
  }
}

function mNote(freq, dur, type, gain, t, cutoff) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function mNoise(dur, freq, q, gain, t) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

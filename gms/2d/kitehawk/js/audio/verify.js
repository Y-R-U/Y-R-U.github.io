// Renders every effect through the real master chain in an OfflineAudioContext and measures it.
// A broken envelope is silent and looks fine in source; this is the only thing that catches it.
//
// The one-shot half is the forge_test harness, unchanged in behaviour. The sustained half is new
// and is not the same test: a continuous source that makes a noise is not necessarily working. It
// has to RESPOND. So each source is rendered while one parameter is stepped across its whole range
// and the per-step measurements have to move; it is flown past the listener and the pitch has to
// rise on the way in and fall on the way out; and it has to actually go quiet when released.

import { createAudioEngine, SFX, SRC, defaults } from './registry.js';
import { createAudio, KEYS } from './facade.js';

const SR = 48000;

// The engine seeds its noise buffer, its reverb IR and every loop's start offset from Math.random.
// That is right for the game and wrong for a harness: two renders of the same thing differ, so a
// control render cannot cancel anything and a threshold has to be set above run-to-run drift
// instead of above the real floor. Swapping in a seeded generator for the synchronous graph-build
// makes every render reproducible and makes the doppler control render exact.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function analyse(buf) {
  const d = buf.getChannelData(0);
  const n = d.length;
  let sum = 0, peak = 0, nan = 0, dc = 0, first = -1, last = -1, clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = d[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v);
    sum += v * v; dc += v;
    if (a > peak) peak = a;
    if (a > 1) clipped++;
    if (a > 0.002) { if (first < 0) first = i; last = i; }
  }
  let tail = 0;
  const tn = Math.min(n, Math.floor(SR * 0.02));
  for (let i = n - tn; i < n; i++) tail += d[i] * d[i];
  let on = 0;
  if (first >= 0) { for (let i = first; i <= last; i++) on += d[i] * d[i]; on = Math.sqrt(on / (last - first + 1)); }
  return {
    rms: +Math.sqrt(sum / n).toFixed(5),
    rmsOn: +on.toFixed(5),
    peak: +peak.toFixed(4),
    dc: +(dc / n).toFixed(5),
    nan, clipped,
    onset: first < 0 ? null : +(first / SR).toFixed(3),
    sound: last < 0 ? 0 : +((last - first) / SR).toFixed(3),
    head: +Math.abs(d[0]).toFixed(4),
    tailRms: +Math.sqrt(tail / tn).toFixed(5),
  };
}

// `bright` is a cheap spectral-centroid stand-in: for a sine it is proportional to frequency, so a
// doppler shift moves it. Cheaper and far more robust than an FFT for what this needs to prove.
// `mod` is envelope modulation depth over 20 ms blocks. Mean level is the WRONG instrument for an
// intermittent parameter: a misfire that guts the engine 20% of the time barely moves the average,
// which is how a parameter wired to nothing and one wired to a dramatic effect can measure the
// same. This is the metric that tells them apart.
const BLOCK = 960;

function window_(d, from, to) {
  const a = Math.max(0, Math.floor(from * SR)), b = Math.min(d.length, Math.floor(to * SR));
  let sum = 0, peak = 0, absSum = 0, diffSum = 0, zc = 0, prev = 0;
  const n = Math.max(1, b - a);
  const blocks = [];
  let bs = 0, bn = 0;
  for (let i = a; i < b; i++) {
    const v = Number.isFinite(d[i]) ? d[i] : 0;
    sum += v * v; absSum += Math.abs(v);
    if (Math.abs(v) > peak) peak = Math.abs(v);
    if (i > a) diffSum += Math.abs(v - prev);
    if (i > a && ((v >= 0) !== (prev >= 0))) zc++;
    prev = v;
    bs += v * v;
    if (++bn === BLOCK) { blocks.push(Math.sqrt(bs / bn)); bs = 0; bn = 0; }
  }
  let mod = 0;
  if (blocks.length >= 8) {
    const s = blocks.slice().sort((x, y) => x - y);
    const p10 = s[Math.floor(s.length * 0.1)], p90 = s[Math.floor(s.length * 0.9)];
    mod = p90 > 1e-9 ? (p90 - p10) / p90 : 0;
  }
  return {
    rms: Math.sqrt(sum / n),
    peak,
    bright: absSum > 1e-9 ? diffSum / absSum : 0,
    zcr: zc / (n / SR),
    mod,
  };
}

// A pitch proxy has to be a real spectrum. The time-domain proxies are not good enough to judge
// doppler on a source built from six near-harmonic low tones — the beating between the zeppelin's
// detuned engines swings mean|dv|/mean|v| by more than the pitch does, and it came out
// non-monotonic in pitch across a sweep that raised every frequency by 90%. A single Goertzel per
// bin is not good enough either: over a 2.5 s window each bin is 0.4 Hz wide, so a bank of them
// samples forty arbitrary slivers rather than a spectrum. So: Hann-windowed 4096-point FFT,
// power-averaged over overlapping blocks, centroid over 30 Hz - 8 kHz. A spectrum that scales by
// alpha moves this by exactly alpha.
const NFFT = 4096;
const HANN = (() => { const w = new Float64Array(NFFT); for (let i = 0; i < NFFT; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NFFT); return w; })();

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function centroid(d, from, to) {
  const a = Math.max(0, Math.floor(from * SR)), b = Math.min(d.length, Math.floor(to * SR));
  const half = NFFT / 2, hop = half;
  const pow = new Float64Array(half);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  let blocks = 0;
  for (let s = a; s + NFFT <= b; s += hop) {
    for (let i = 0; i < NFFT; i++) { const v = d[s + i]; re[i] = (Number.isFinite(v) ? v : 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < half; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    blocks++;
  }
  if (!blocks) return 0;
  const lo = Math.max(1, Math.floor(30 * NFFT / SR)), hi = Math.min(half - 1, Math.ceil(8000 * NFFT / SR));
  let num = 0, den = 0;
  for (let k = lo; k <= hi; k++) {
    const amp = Math.sqrt(pow[k] / blocks);
    num += (k * SR / NFFT) * amp; den += amp;
  }
  return den > 1e-12 ? num / den : 0;
}

const spread = arr => {
  const mx = Math.max(...arr), mn = Math.min(...arr);
  return mx > 1e-9 ? (mx - mn) / mx : 0;
};

// `fill` must be synchronous: Math.random is only swapped for the graph build, and every random
// draw the engine makes happens there.
async function render(seconds, fill, seed = 1) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const real = Math.random;
  let eng;
  try {
    Math.random = mulberry32(seed);
    eng = createAudioEngine(ctx);
    fill(eng);
  } finally { Math.random = real; }
  const buf = await ctx.startRendering();
  const a = analyse(buf);
  a.voices = eng.live.length;
  a.leaked = eng.live.filter(v => !Number.isFinite(v.e)).length;
  a.maxTail = +Math.max(0, ...eng.live.map(v => v.e)).toFixed(2);
  return { a, buf, eng };
}

// ── one-shots ────────────────────────────────────────────────

export async function verifySfx() {
  const out = [];
  for (const id in SFX) {
    const s = SFX[id];
    const o = defaults(s);
    o.t = 0.05; o.vel = 1;
    const secs = (s.dur || 2) + 1.5;
    const { a } = await render(secs, eng => s.play(eng, o), hash(id));
    out.push({ id, name: s.name, group: s.group, ...a });
  }
  return out;
}

// ── sustained ────────────────────────────────────────────────

const STEP = 0.9;        // seconds a swept value is held
const STEPS = 8;
const T0 = 0.05;
// The master chain's hall is 2.6 s long, so the render has to outlast the reverb before the tail
// can be read as "did the source stop". Measuring at 1 s post-release measures the room instead.
const TAIL = 3.2;

// Step one parameter across its full range and measure each plateau. The point is not that it
// makes a sound — it is that the sound changes when the number changes.
export async function verifySweep(id, key) {
  const def = SRC[id], spec = def.params[key];
  const sweepEnd = T0 + STEPS * STEP;
  const secs = sweepEnd + TAIL;
  const { a, buf, eng } = await render(secs, eng => {
    const h = eng.source(id, { ...defaults(def), t: T0, x: 0, y: 0 });
    for (let i = 0; i < STEPS; i++) {
      const v = spec.min + (spec.max - spec.min) * (i / (STEPS - 1));
      h.set({ [key]: v }, T0 + i * STEP);
    }
    h.stop(0.25, sweepEnd);
    eng.sources.reap(secs);
  }, hash(id + key));
  const d = buf.getChannelData(0);
  const plateaus = [];
  for (let i = 0; i < STEPS; i++) {
    const s = T0 + i * STEP;
    plateaus.push(window_(d, s + STEP * 0.5, s + STEP - 0.05));
  }
  const rmsSeq = plateaus.map(p => p.rms);
  const brSeq = plateaus.map(p => p.bright);
  const modSeq = plateaus.map(p => p.mod);
  const rel = window_(d, secs - 0.4, secs);
  return {
    id: `${id}.${key}`, name: `${def.name} — ${spec.label || key}`, group: def.group,
    kind: 'sweep',
    rms: +a.rms.toFixed(5), peak: a.peak, dc: a.dc, nan: a.nan,
    respRms: +spread(rmsSeq).toFixed(4),
    respBright: +spread(brSeq).toFixed(4),
    respMod: +spread(modSeq).toFixed(4),
    resp: +Math.max(spread(rmsSeq), spread(brSeq), spread(modSeq)).toFixed(4),
    release: +rel.rms.toFixed(5),
    liveAfter: eng.sources.live.length,
    seq: rmsSeq.map(v => +v.toFixed(4)),
    brights: brSeq.map(v => +v.toFixed(3)),
    mods: modSeq.map(v => +v.toFixed(3)),
  };
}

// Fly the source past the listener at 700 wu/s (105 m/s). The motion is purely radial, so the
// doppler factor is CONSTANT at 1.45 all the way in and 0.76 all the way out, and the two halves
// sweep an identical range of distances. That lets the approach and recede windows be wide and
// mirrored rather than two 0.2 s snapshots — which matters, because a 0.2 s snapshot of the
// zeppelin lands somewhere random in the 2.3 s beat between its detuned engines and measures the
// beat instead of the doppler. A wide mirrored window averages the beat out and the distance
// profile cancels exactly.
// The same flyby is rendered TWICE — once normally and once with the pool's doppler clamped to 1 —
// and the answer is the ratio of the two approach/recede ratios. Anything asymmetric that is not
// doppler (the master saturator responding to level, an automation ramp lagging, the beat between
// the zeppelin's detuned engines landing differently either side of the pass) appears identically
// in both renders and divides out. Without this the zeppelin measured 1.31 with doppler switched
// off, which is a row that looks like a pass and is measuring something else entirely.
export async function verifyFlyby(id) {
  const def = SRC[id];
  const SPEED = 700, FROM = -2400, TO = 2400;
  const secs = (TO - FROM) / SPEED + 0.6;
  const tPass = -FROM / SPEED + T0;
  const HALF = 2.5, SKIP = 0.3;   // skip the pass itself, where radial velocity flips
  const DT = 1 / 60;

  // both renders take the same seed, so the only difference between them is the doppler factor
  const fly = noDoppler => render(secs, eng => {
    if (noDoppler) { eng.sources.dopplerMin = 1; eng.sources.dopplerMax = 1; }
    const h = eng.source(id, { ...defaults(def), t: T0, x: 0, y: FROM, vy: SPEED, priority: 9 });
    for (let t = T0; t < secs - 0.3; t += DT) h.at(0, FROM + SPEED * (t - T0), 0, SPEED, t);
  }, hash(id + 'flyby'));

  const halves = buf => {
    const d = buf.getChannelData(0);
    return {
      cIn: centroid(d, tPass - SKIP - HALF, tPass - SKIP),
      cOut: centroid(d, tPass + SKIP, tPass + SKIP + HALF),
      near: window_(d, tPass - 0.15, tPass + 0.15),
      far: window_(d, T0 + 0.15, T0 + 0.45),
    };
  };

  const { a, buf } = await fly(false);
  const { buf: ref } = await fly(true);
  const H = halves(buf), R = halves(ref);

  const raw = H.cOut > 1e-9 ? H.cIn / H.cOut : 0;
  const base = R.cOut > 1e-9 ? R.cIn / R.cOut : 0;
  return {
    id: `${id}.flyby`, name: `${def.name} — flyby`, group: def.group, kind: 'flyby',
    rms: +a.rms.toFixed(5), peak: a.peak, dc: a.dc, nan: a.nan,
    doppler: def.verify.doppler,
    pitchRatio: +(base > 1e-9 ? raw / base : 0).toFixed(3),
    rawRatio: +raw.toFixed(3), refRatio: +base.toFixed(3),
    centIn: Math.round(H.cIn), centOut: Math.round(H.cOut),
    distRatio: +(H.far.rms > 1e-9 ? H.near.rms / H.far.rms : 0).toFixed(3),
    nearRms: +H.near.rms.toFixed(5), farRms: +H.far.rms.toFixed(5),
  };
}

// A hundred aircraft may not open a hundred oscillators.
export async function verifyCap() {
  const CAP = 12, ASK = CAP + 10;
  let live = 0, refused = 0, stolen = 0, real = 0;
  const { a } = await render(2.5, eng => {
    eng.sources.cap = CAP;
    eng.sources.setListener(0, 0, 300);
    for (let i = 0; i < ASK; i++) {
      // spread them out so the stealing rule has something to rank on
      const h = eng.source('rotary', { t: T0, x: (i - ASK / 2) * 180, y: i * 90, rpm: 0.5 + i * 0.01 });
      if (h.real) real++;
    }
    live = eng.sources.live.length;
    refused = eng.sources.refused;
    stolen = eng.sources.stolen;
    eng.sources.stopAll(0.2, 1.6);
    eng.sources.reap(2.4);
  }, hash('cap'));
  return {
    id: 'pool.cap', name: 'Pool cap and stealing', group: 'Pool', kind: 'pool',
    cap: CAP, asked: ASK, live, refused, stolen, granted: real,
    rms: +a.rms.toFixed(5), peak: a.peak, nan: a.nan,
  };
}

// A source that is released has to go quiet and give its slot back. A stuck engine is the single
// worst failure this layer can have, because nothing on screen shows it.
export async function verifyRelease() {
  const secs = 4;
  const { buf, eng } = await render(secs, eng => {
    const a = eng.source('rotary', { t: T0, x: 0, y: 0, rpm: 0.8 });
    const b = eng.source('slipstream', { t: T0, x: 0, y: 0, speed: 0.9 });
    a.stop(0.3, 1.2); b.stop(0.3, 1.2);
    eng.sources.reap(3.0);
  }, hash('release'));
  const d = buf.getChannelData(0);
  const before = window_(d, 0.8, 1.15);
  const after = window_(d, 3.4, 3.95);
  return {
    id: 'pool.release', name: 'Release goes silent', group: 'Pool', kind: 'pool',
    rmsBefore: +before.rms.toFixed(5),
    rmsAfter: +after.rms.toFixed(6),
    drop: +(before.rms > 1e-9 ? after.rms / before.rms : 1).toFixed(5),
    live: eng.sources.live.length, dying: eng.sources.dying.length, idle: eng.sources.idle.length,
  };
}

export async function verifySustained() {
  const sweeps = [], flybys = [];
  for (const id in SRC) {
    for (const k of SRC[id].verify.sweeps) sweeps.push(await verifySweep(id, k));
    flybys.push(await verifyFlyby(id));
  }
  return { sweeps, flybys, pool: [await verifyCap(), await verifyRelease()] };
}

// D7 is the one rule that cannot be checked by rendering audio, because the thing it asserts is
// what happens when there IS no audio. So: build the facade with the context disabled, call every
// method on it, and require that nothing throws and every return keeps its shape.
export async function verifyFacade() {
  const out = { throws: [], };
  const exercise = (a, tag) => {
    const r = {};
    const t = (name, fn) => { try { r[name] = fn(); } catch (e) { out.throws.push(tag + '.' + name + ': ' + e.message); r[name] = 'THREW'; } };
    t('sfx', () => a.sfx('gun.vickers'));
    t('sfxUnknown', () => a.sfx('no.such.key'));
    t('loop', () => a.loop('loop.engine', { x: 0, y: 0 }));
    t('param', () => a.param(r.loop, { rpm: 0.9 }));
    t('place', () => a.place(r.loop, 100, 40, 0, 200));
    t('handle', () => typeof a.handle(r.loop).set);
    t('update', () => a.update(0.016));
    t('voice', () => JSON.stringify(a.voice('a1-04.open')));
    t('hasTake', () => a.hasTake('drach'));
    t('music', () => a.music('patrol'));
    t('ambience', () => a.ambience('front-line'));
    t('setIntensity', () => a.setIntensity(0.5));
    t('setListener', () => a.setListener(0, 0, 300));
    t('followCamera', () => a.followCamera(true));
    t('duck', () => a.duck(0.4, 0.2));
    t('hitstop', () => a.hitstop(0.6, 0.08));
    t('setVolume', () => a.setVolume('sfx', 0.8));
    t('getVolume', () => a.getVolume('sfx'));
    t('setMuted', () => a.setMuted(false));
    t('stop', () => a.stop(r.loop, 0.1));
    t('stopAll', () => a.stopAll(0.1));
    t('report', () => typeof a.report().available);
    r._calls = Object.keys(r).length;   // JSON drops undefined returns, so count before serialising
    return r;
  };

  const off = await createAudio({ audio: { disabled: true, noManifest: true } });
  out.offAvailable = off.available;
  out.offReady = off.ready;
  out.off = exercise(off, 'off');

  const on = await createAudio({ audio: { noManifest: true } });
  out.onAvailable = on.available;
  out.on = exercise(on, 'on');

  // every mapped key must exist in one of the two registries, or it is a silent dead end
  out.keys = Object.keys(KEYS).length;
  out.deadKeys = Object.entries(KEYS).filter(([, id]) => !SFX[id] && !SRC[id]).map(([k]) => k);
  // the shapes that matter: false rather than undefined, and voice() always an object
  out.shapesOk =
    off.available === false && off.ready === false &&
    out.off.sfx === false && out.off.loop === false && out.off.param === false &&
    out.off.voice === '{"playing":false,"len":0}' && out.off.hasTake === false &&
    out.off.handle === 'function' && out.off.report === 'boolean' &&
    out.on.available !== 'THREW';
  return out;
}

export async function runAll() {
  const sfx = await verifySfx();
  const sus = await verifySustained();
  const facade = await verifyFacade();
  return { sfx, ...sus, facade };
}

// All sound. Procedural Web Audio SFX voices + real mp3 music playback on two crossfading decks.
// CONTRACTS §11 signature, extended with music(), setIntensity(), setDisabledTracks(),
// stopMusic() and nowPlaying(). Nothing here may throw before unlock(), and nothing here may
// ever break the frame — a missing file falls through to the next track and then to silence.

let ctx = null, master = null, sfxBus = null, musicBus = null;
let sfxOn = true, musicOn = true, unlocked = false;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function env(node, t0, a, d, peak) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function noiseBuffer(secs) {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function blip({ f0, f1, dur, type = 'square', gain = 0.18, t0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(g, t0, 0.006, dur, gain);
  o.connect(g).connect(sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function boom({ dur = 0.7, gain = 0.5, t0, lo = 180 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lo * 6, t0);
  lp.frequency.exponentialRampToValueAtTime(lo, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, 0.01, dur, gain);
  src.connect(lp).connect(g).connect(sfxBus);
  src.start(t0); src.stop(t0 + dur);
}

const VOICES = {
  gun:    (t) => blip({ f0: rand(700, 900), f1: 180, dur: 0.05, type: 'square', gain: 0.06, t0: t }),
  cannon: (t) => { blip({ f0: 300, f1: 90, dur: 0.09, type: 'sawtooth', gain: 0.12, t0: t }); boom({ dur: 0.14, gain: 0.16, lo: 260, t0: t }); },
  drop:   (t) => blip({ f0: 900, f1: 220, dur: 0.28, type: 'sine', gain: 0.1, t0: t }),
  rocket: (t) => { blip({ f0: 240, f1: 1400, dur: 0.3, type: 'sawtooth', gain: 0.1, t0: t }); },
  boom:   (t) => boom({ dur: 0.75, gain: 0.5, lo: 130, t0: t }),
  bigboom:(t) => { boom({ dur: 1.5, gain: 0.7, lo: 70, t0: t }); blip({ f0: 120, f1: 34, dur: 0.9, type: 'sine', gain: 0.3, t0: t }); },
  hit:    (t) => blip({ f0: 420, f1: 150, dur: 0.06, type: 'triangle', gain: 0.09, t0: t }),
  hurt:   (t) => { blip({ f0: 200, f1: 70, dur: 0.2, type: 'sawtooth', gain: 0.16, t0: t }); },
  pickup: (t) => { blip({ f0: 660, f1: 990, dur: 0.1, type: 'sine', gain: 0.16, t0: t }); blip({ f0: 990, f1: 1320, dur: 0.12, type: 'sine', gain: 0.12, t0: t + 0.07 }); },
  ui:     (t) => blip({ f0: 520, f1: 700, dur: 0.06, type: 'sine', gain: 0.1, t0: t }),
  win:    (t) => [0, 0.12, 0.24, 0.42].forEach((d, i) => blip({ f0: 440 * Math.pow(1.26, i), dur: 0.3, type: 'triangle', gain: 0.16, t0: t + d })),
  lose:   (t) => [0, 0.16, 0.34].forEach((d, i) => blip({ f0: 380 / Math.pow(1.22, i), f1: 90, dur: 0.4, type: 'sawtooth', gain: 0.18, t0: t + d })),
  land:   (t) => { boom({ dur: 0.4, gain: 0.25, lo: 200, t0: t }); },
};

/* ==========================================================================================
   MUSIC — file playback
   ==========================================================================================

   Two decks, A and B. Each is an HTMLAudioElement (streams; a decoded 2-minute PCM buffer is
   ~11 MB and this game has to run on a phone) into a MediaElementAudioSourceNode into its own
   GainNode into the shared musicBus, so setMusic() and duck() keep working untouched.

   Every handover is the same primitive: one deck fades up while the other fades down. Track
   changes, the march -> heavy drop, and the cross-loop of a track into itself all use it.
*/

const MUSIC_BUS_GAIN = 0.5;

/** Aaron's drop. Rise at 0.6, fall at 0.35, and a dwell so one flak burst cannot strobe it. */
const HEAVY = { up: 0.6, down: 0.35, dwell: 5.0, fade: 0.9 };
const CONTEXT_FADE = 1.2;       // ordinary track change
const LOAD_TIMEOUT = 8.0;       // seconds before a deck that never starts is called dead
const MAX_REPICKS = 6;          // failures tolerated per request before we accept silence

let MUSIC = [], pickTrack = null, pairedTrack = null, manifestReady = false;
let BUG = '';                   // only ever set by window.__audio.bug(), used to falsify the gate
let pinned = null;              // window.__audio.pin(x): hold intensity against main.js's combat heat

// Dynamic, not static: a broken generated manifest must not be able to stop core/audio.js from
// evaluating, which would take main.js and the whole game down with it.
const manifestLoad = import('../data/music.js')
  .then((m) => {
    MUSIC = m.MUSIC || [];
    pickTrack = m.pickTrack;
    pairedTrack = m.pairedTrack;
    manifestReady = true;
    if (want.pending) applyRequest();
  })
  .catch((e) => { log('manifest-fail', { why: String(e && e.message || e) }); });

const decks = [];
const bad = Object.create(null);        // trackIds whose file would not play
let disabled = Object.create(null);     // trackIds the player switched off
let intensity = 0, heavy = false, lastSwitch = -1e9, clock = 0;
let musicPaused = false;                // decks parked because setMusic(false)
const want = { pending: false, context: 'battle', act: 1, fade: CONTEXT_FADE };
const events = [];
let lastExternalTick = -1e9, safetyTimer = 0;

function log(e, extra) {
  events.push(Object.assign({ t: clock.toFixed(2) * 1, e }, extra));
  if (events.length > 240) events.shift();
}

function trackUrl(t) {
  const rel = t.file && t.file.includes('/') ? t.file : 'assets/audio/music/' + (t.file || '');
  try { return new URL('../../' + rel, import.meta.url).href; } catch { return rel; }
}

function makeDeck(name) {
  const el = new Audio();
  el.preload = 'auto';
  el.loop = false;
  const src = ctx.createMediaElementSource(el);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(musicBus);
  const d = {
    name, el, src, gain,
    track: null, state: 'idle',        // idle | live | out
    from: 0, to: 0, t0: 0, dur: 0,     // the fade currently scheduled, for the analytic readback
    startedAt: -1, looping: false, wantPlay: false,
    gen: 0, timer: 0, seekTo: 0,
  };
  el.addEventListener('error', () => onDeckError(d));
  el.addEventListener('ended', () => { if (d.state === 'live' && d.track) hardWrap(d); });
  decks.push(d);
  return d;
}

/** The gain we asked for, computed in JS. Cross-checked against gain.value in the debug hook. */
function gainOf(d) {
  if (!d.dur) return d.to;
  const x = clamp01((ctx.currentTime - d.t0) / d.dur);
  const w = d.to > d.from ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2);
  return d.from + (d.to - d.from) * w;
}

/**
 * Equal-power fade from wherever the deck is now to `to`, over `dur`.
 * Equal power, not linear: two decks at 0.707 sum to unity POWER, which is what the ear reads as
 * constant loudness across a handover. A linear crossfade dips 3 dB in the middle.
 */
function fadeTo(d, to, dur) {
  const g = d.gain.gain, now = ctx.currentTime, from = gainOf(d);
  d.from = from; d.to = to; d.t0 = now; d.dur = Math.max(0.01, dur);
  try { g.cancelAndHoldAtTime(now); } catch { try { g.cancelScheduledValues(now); } catch { /* nothing scheduled */ } }
  try {
    g.setValueAtTime(from, now);
    const n = 65, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const w = to > from ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2);
      c[i] = from + (to - from) * w;
    }
    g.setValueCurveAtTime(c, now, d.dur);
    g.setValueAtTime(to, now + d.dur + 0.001);
  } catch {
    // Some engines refuse a curve that overlaps a live one. A straight ramp is worse but audible.
    try { g.cancelScheduledValues(now); g.setValueAtTime(from, now); g.linearRampToValueAtTime(to, now + d.dur); } catch { /* give up quietly */ }
  }
}

function release(d) {
  d.state = 'idle'; d.track = null; d.looping = false; d.wantPlay = false;
  d.from = d.to = 0; d.dur = 0; d.startedAt = -1; d.gen++;
  if (d.timer) { clearInterval(d.timer); d.timer = 0; }
  try { d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.value = 0; } catch { /* graph gone */ }
  try { d.el.pause(); } catch { /* already stopped */ }
}

function liveDeck() { return decks.find((d) => d.state === 'live') || null; }

/** A deck we may use. Prefers idle; otherwise steals the one already on its way out. */
function freeDeck(exclude) {
  let d = decks.find((x) => x.state === 'idle' && x !== exclude);
  if (d) return d;
  d = decks.find((x) => x.state === 'out' && x !== exclude);
  if (d) { release(d); return d; }
  return null;
}

function loadInto(d, track, seekTo) {
  const url = trackUrl(track);
  d.track = track;
  d.looping = false;
  d.wantPlay = true;
  d.startedAt = clock;
  d.seekTo = Math.max(0, seekTo || 0);
  d.gen++;
  if (d.timer) { clearInterval(d.timer); d.timer = 0; }
  try {
    if (d.el.src !== url) {
      d.el.src = url;
      try { d.el.load(); } catch { /* some engines auto-load */ }
    } else if (Math.abs(d.el.currentTime - d.seekTo) > 0.15 && !seekableTo(d.el, d.seekTo)) {
      // Rewinding a deck that already holds this file — which is every other cross-loop pass.
      // load() resets it to 0 without needing a Range request, so the loop still works on a host
      // that cannot seek. Cached, so it is not a second download.
      try { d.el.load(); } catch { /* nothing else to try */ }
    }
    armStart(d);
  } catch (e) { onDeckError(d, e); }
}

function seekableTo(el, t) {
  try { return el.seekable.length > 0 && el.seekable.end(el.seekable.length - 1) > t + 0.05; }
  catch { return false; }
}

/**
 * GOTCHA, and it cost an hour. `el.currentTime = startAt` is SILENTLY DISCARDED unless the media
 * is seekable, and "seekable" means the server answered with `Accept-Ranges: bytes`. The
 * readback right after the assignment still says 0 because seeking is async, so the failure is
 * invisible — a fully buffered 119 s track reported `seekable.end(0) === 0` and every seek went
 * to the top. Neither `loadedmetadata`, `canplay` nor a `#t=` media fragment gets round it.
 *
 * GitHub Pages does serve ranges, so `startAt` works in the shipped game. Where it does not, the
 * deadline below starts the track from the top: a couple of seconds of intro, never a stall.
 *
 * This runs on its own interval rather than on tick(), because main.js only reaches audio.tick()
 * from render(), which returns early when there is no world — the title screen has no game loop.
 */
function armStart(d) {
  const el = d.el, gen = d.gen, target = d.seekTo;
  const t0 = nowMs();
  const covered = () => {
    try {
      const b = el.buffered;
      for (let i = 0; i < b.length; i++) if (b.start(i) <= target && b.end(i) > target + 0.05) return true;
    } catch { /* nothing buffered yet */ }
    return false;
  };
  const go = (why) => {
    if (d.gen !== gen) return;
    if (d.timer) { clearInterval(d.timer); d.timer = 0; }
    if (Math.abs(el.currentTime - target) > 0.15) { try { el.currentTime = target; } catch { /* clamped; play from the top */ } }
    const p = el.play();
    if (p && p.catch) p.catch((e) => onPlayReject(d, e));
    log('start', { deck: d.name, id: d.track && d.track.id, at: target, why });
  };
  if (target <= 0.01 && Math.abs(el.currentTime - target) <= 0.15) { go('immediate'); return; }
  d.timer = setInterval(() => {
    if (d.gen !== gen) { clearInterval(d.timer); d.timer = 0; return; }
    if (el.readyState >= 1 && covered() && (target <= 0.01 || seekableTo(el, target))) go('seekable');
    else if (nowMs() - t0 > 1200) go('deadline');
  }, 25);
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function onPlayReject(d, e) {
  const name = (e && e.name) || '';
  // NotAllowedError is the autoplay policy, not a broken file. Leave it armed; the next unlock
  // or the tick watchdog will try again.
  if (name === 'NotAllowedError' || name === 'AbortError') { log('play-deferred', { deck: d.name, id: d.track && d.track.id, why: name }); return; }
  onDeckError(d, e);
}

function onDeckError(d, e) {
  const id = d.track && d.track.id;
  const code = (d.el.error && d.el.error.code) || (e && e.name) || 'unknown';
  if (!id) return;
  bad[id] = true;
  log('track-fail', { deck: d.name, id, code: String(code) });
  const wasLive = d.state === 'live' || d.wantPlay;
  release(d);
  if (wasLive) applyRequest();      // fall through to the next candidate, then to silence
}

/** Start `track` on a free deck and hand over from whatever is playing. */
function start(track, fade) {
  if (!track) return false;
  const cur = liveDeck();
  if (cur && cur.track && cur.track.id === track.id && cur.state === 'live') return true;
  const d = freeDeck(cur);
  if (!d) { log('no-deck', { id: track.id }); return false; }
  loadInto(d, track, track.startAt || 0);
  d.state = 'live';
  d.gain.gain.cancelScheduledValues(ctx.currentTime);
  d.gain.gain.value = 0; d.from = 0; d.to = 0; d.dur = 0;
  const target = musicPaused ? 0 : trimOf(track);
  // Test seams (tools/audiogate.mjs --falsify). BUG is only ever set from window.__audio.bug().
  if (BUG === 'gap') { fadeTo(d, 0, 0.01); setTimeout(() => fadeTo(d, target, fade), fade * 1000); }
  else fadeTo(d, target, fade);
  if (cur) { cur.state = 'out'; fadeTo(cur, 0, BUG === 'double' ? fade * 5 : fade); }
  heavy = track.intensity === 'heavy';     // whatever is on the decks IS the current state
  log('play', { deck: d.name, id: track.id, from: cur && cur.track ? cur.track.id : null, fade });
  return true;
}

function trimOf(t) { const g = Number(t && t.gainTrim); return g > 0 ? g : 1; }

/** Resolve the standing request into an actual track, skipping dead files and disabled ids. */
function applyRequest() {
  if (!unlocked || !manifestReady || !pickTrack) { want.pending = true; return; }
  want.pending = false;
  const skip = Object.assign(Object.create(null), disabled, bad);
  for (let i = 0; i < MAX_REPICKS; i++) {
    const t = pickTrack({
      context: want.context, act: want.act,
      intensity: heavy ? 'heavy' : 'march',
      disabled: skip, rng: Math.random,
    });
    if (!t) break;
    if (skip[t.id]) { continue; }
    if (start(t, want.fade)) return;
    skip[t.id] = true;                 // no deck / would not start — do not offer it again
  }
  log('silence', { context: want.context });
  stopAllMusic(want.fade);
}

function stopAllMusic(fade) {
  for (const d of decks) {
    if (d.state === 'idle') continue;
    d.state = 'out';
    fadeTo(d, 0, Math.max(0.05, fade));
  }
}

/**
 * Cross-loop a track into itself. 14 of the 22 tracks stop dead at full volume and a hard wrap
 * clicks; the manifest's loopEnd also sits before any trailing dead air so we never loop silence.
 */
function crossLoop(d) {
  const t = d.track;
  const other = decks.find((x) => x !== d && x.state === 'idle');
  if (!other) { d.looping = true; return; }     // a change is in flight; the wrap fallback covers it
  d.looping = true;
  loadInto(other, t, t.startAt || 0);
  other.state = 'live';
  other.gain.gain.cancelScheduledValues(ctx.currentTime);
  other.gain.gain.value = 0; other.from = 0; other.to = 0; other.dur = 0;
  fadeTo(other, musicPaused ? 0 : trimOf(t), t.loopFadeS);
  d.state = 'out';
  fadeTo(d, 0, t.loopFadeS);
  log('loop', { deck: d.name, to: other.name, id: t.id, at: Number(d.el.currentTime.toFixed(2)) });
}

/** Last resort when both decks are busy at the loop point: a 120 ms dip, then jump. No click. */
function hardWrap(d) {
  const t = d.track;
  if (!t || !t.loop) { release(d); return; }
  const target = gainOf(d);
  fadeTo(d, 0, 0.06);
  setTimeout(() => {
    if (d.track !== t || d.state !== 'live') return;
    try { d.el.currentTime = t.startAt || 0; } catch { /* metadata gone */ }
    if (d.el.paused) { const p = d.el.play(); if (p && p.catch) p.catch(() => {}); }
    fadeTo(d, target, 0.06);
    d.looping = false;
    log('wrap', { deck: d.name, id: t.id });
  }, 70);
}

function tickMusic(dt) {
  clock += dt;

  // 1. retire finished fade-outs
  for (const d of decks) {
    if (d.state === 'out' && ctx.currentTime >= d.t0 + d.dur) release(d);
  }

  // 2. the march -> heavy drop
  const live = liveDeck();
  if (live && live.track && !musicPaused) {
    const wantHeavy = heavy ? intensity > HEAVY.down : intensity >= HEAVY.up;
    if (wantHeavy !== heavy && clock - lastSwitch >= HEAVY.dwell && pairedTrack) {
      const other = pairedTrack(live.track.id, wantHeavy ? 'heavy' : 'march', Object.assign(Object.create(null), disabled, bad));
      if (other && other.id !== live.track.id) {
        heavy = wantHeavy; lastSwitch = clock;
        log('drop', { to: other.id, heavy, intensity: Number(intensity.toFixed(2)) });
        start(other, HEAVY.fade);
      } else {
        // No pair, or we are already on the right half. Record the state anyway — leaving `heavy`
        // stale here deadlocks the drop: it can never disagree with the intensity again.
        heavy = wantHeavy; lastSwitch = clock;
      }
    }
  }

  // 3. loop + health
  for (const d of decks) {
    if (d.state !== 'live' || !d.track) continue;
    const t = d.track;
    if (d.wantPlay && d.el.paused && !musicPaused && !d.timer) {
      const p = d.el.play(); if (p && p.catch) p.catch(() => {});
    }
    if (d.wantPlay && d.startedAt >= 0 && clock - d.startedAt > LOAD_TIMEOUT
        && d.el.readyState < 2 && d.el.currentTime <= (t.startAt || 0) + 0.01) {
      onDeckError(d);                                     // never started; treat as a dead file
      continue;
    }
    if (!t.loop) continue;
    const ct = d.el.currentTime;
    if (!d.looping && ct >= t.loopEnd - t.loopFadeS) crossLoop(d);
    else if (d.looping && ct >= t.loopEnd + 0.05 && d.state === 'live') hardWrap(d);
  }
}

/* -------------------------------------------------------------------- debug hook for the gate */
function snapshot() {
  const live = liveDeck();
  const g = decks.map((d) => gainOf(d));
  const sum = g.reduce((a, b) => a + b, 0);
  return {
    ready: unlocked, manifestReady, ctxState: ctx ? ctx.state : null,
    now: live && live.track ? { id: live.track.id, name: live.track.name } : null,
    intensity, heavy, musicOn, musicPaused, clock, sinceSwitch: clock - lastSwitch, bug: BUG,
    ticker: safetyTimer ? (nowMs() - lastExternalTick < 350 ? 'frame' : 'safety') : 'none',
    musicBus: musicBus ? musicBus.gain.value : null,
    master: master ? master.gain.value : null,
    linSum: sum, powSum: Math.sqrt(g.reduce((a, b) => a + b * b, 0)),
    bad: Object.keys(bad), disabled: Object.keys(disabled),
    decks: decks.map((d, i) => ({
      name: d.name, state: d.state, id: d.track ? d.track.id : null,
      gain: g[i], gainRead: d.gain.gain.value,
      time: d.el.currentTime, paused: d.el.paused, readyState: d.el.readyState,
      err: d.el.error ? d.el.error.code : 0, src: d.el.currentSrc ? d.el.currentSrc.split('/').pop() : '',
    })),
    events: events.slice(-40),
  };
}

let sampler = null;
function record(ms) {
  const out = [];
  const t0 = performance.now();
  const step = () => {
    const g = decks.map((d) => gainOf(d));
    out.push({
      t: Number(((performance.now() - t0) / 1000).toFixed(3)),
      a: g[0], b: g[1],
      ar: decks[0] ? decks[0].gain.gain.value : 0,
      br: decks[1] ? decks[1].gain.gain.value : 0,
      ida: decks[0] && decks[0].track ? decks[0].track.id : null,
      idb: decks[1] && decks[1].track ? decks[1].track.id : null,
      sa: decks[0] ? decks[0].state : '', sb: decks[1] ? decks[1].state : '',
    });
    if (performance.now() - t0 < ms) requestAnimationFrame(step);
  };
  sampler = out;
  requestAnimationFrame(step);
  return true;
}

/* ==================================================================================== exports */

export const audio = {
  get ready() { return unlocked; },

  unlock() {
    if (unlocked) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_BUS_GAIN : 0; musicBus.connect(master);
      if (ctx.state === 'suspended') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
      makeDeck('A'); makeDeck('B');
      // main.js only reaches audio.tick() from render(), which returns early when there is no
      // world — so on the title screen and in the hangar nothing would drive the loop or the
      // drop. This 5 Hz safety ticker covers exactly that gap and stands down whenever the real
      // frame loop is calling us.
      safetyTimer = setInterval(() => {
        if (nowMs() - lastExternalTick < 350) return;
        try { tickMusic(0.2); } catch (e) { log('tick-throw', { why: String(e && e.message || e) }); }
      }, 200);
      unlocked = true;
    } catch { return false; }
    if (want.pending) applyRequest();
    return true;
  },

  sfx(id, opts = {}) {
    if (!unlocked || !sfxOn || !ctx) return;
    const v = VOICES[id];
    if (!v) return;
    const t = ctx.currentTime + (opts.delay || 0);
    try { v(t); } catch { /* a starved audio graph must never break the frame */ }
  },

  /**
   * music(context, { act, intensity, fade })
   * context: 'title'|'hangar'|'brief'|'battle'|'boss'|'victory'|'defeat' — an unknown context
   * (main.js still says 'flight') falls back to 'battle' rather than going silent.
   * A bare track id is also accepted, so the old music(trackId) call still means something.
   */
  music(context, opts = {}) {
    try {
      const CTXMAP = { flight: 'battle', brief: 'hangar', victory: 'sting_win', defeat: 'sting_lose', win: 'sting_win', lose: 'sting_lose' };
      const known = ['title', 'battle', 'boss', 'hangar', 'sting_win', 'sting_lose'];
      let c = String(context || 'battle');
      c = CTXMAP[c] || c;

      if (opts.intensity !== undefined) {
        if (typeof opts.intensity === 'number') { intensity = clamp01(opts.intensity); heavy = intensity >= HEAVY.up; }
        else heavy = opts.intensity === 'heavy';
      }
      want.act = Number(opts.act) > 0 ? Number(opts.act) : 1;
      want.fade = Number(opts.fade) > 0 ? Number(opts.fade) : CONTEXT_FADE;

      // A literal track id wins over context matching.
      const direct = manifestReady && MUSIC.find((t) => t.id === context);
      if (direct && !disabled[direct.id] && !bad[direct.id]) {
        want.context = direct.context;
        lastSwitch = clock;
        if (unlocked) start(direct, want.fade); else want.pending = true;
        return;
      }
      want.context = known.includes(c) ? c : 'battle';
      lastSwitch = clock;              // a fresh context restarts the dwell window
      applyRequest();
    } catch (e) { log('music-throw', { why: String(e && e.message || e) }); }
  },

  /** 0..1 combat intensity. Safe to call every frame; the drop has hysteresis and a dwell. */
  setIntensity(x) {
    if (pinned !== null) return;          // the gate is driving it; ignore main.js's combat heat
    const v = Number(x);
    intensity = Number.isFinite(v) ? clamp01(v) : 0;
  },

  /** { [trackId]: true } from prefs. Fades off the current track if the player just killed it. */
  setDisabledTracks(map) {
    try {
      disabled = Object.create(null);
      if (map) for (const k of Object.keys(map)) if (map[k]) disabled[k] = true;
      const live = liveDeck();
      if (live && live.track && disabled[live.track.id]) { log('disabled-current', { id: live.track.id }); applyRequest(); }
    } catch { /* a bad prefs blob must not break audio */ }
  },

  stopMusic(opts = {}) {
    want.pending = false;
    if (!unlocked) return;
    stopAllMusic(Number(opts.fade) >= 0 ? Number(opts.fade) : 0.6);
    log('stop', {});
  },

  nowPlaying() {
    const d = liveDeck();
    return d && d.track ? { id: d.track.id, name: d.track.name } : null;
  },

  setMusic(on) {
    musicOn = !!on;
    musicPaused = !musicOn;
    if (!musicBus) return;
    try {
      const now = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      musicBus.gain.linearRampToValueAtTime(musicOn ? MUSIC_BUS_GAIN : 0, now + 0.25);
    } catch { musicBus.gain.value = musicOn ? MUSIC_BUS_GAIN : 0; }
    // Park the elements when off — a phone should not be decoding mp3 nobody can hear.
    for (const d of decks) {
      if (!musicOn) { setTimeout(() => { if (!musicOn) { try { d.el.pause(); } catch { /* gone */ } } }, 280); }
      else if (d.state === 'live' && d.wantPlay) { const p = d.el.play(); if (p && p.catch) p.catch(() => {}); }
    }
    if (musicOn && !liveDeck() && want.context) applyRequest();
  },

  setSfx(on) { sfxOn = !!on; if (sfxBus) sfxBus.gain.value = sfxOn ? 1 : 0; },
  duck(x) { if (master) master.gain.value = 0.85 * (1 - clamp01(x)); },

  /** main.js calls this once per frame. Everything time-based about music happens here. */
  tick(dt) {
    if (!unlocked || !ctx) return;
    lastExternalTick = nowMs();
    try { tickMusic(Number(dt) > 0 ? Number(dt) : 1 / 60); }
    catch (e) { log('tick-throw', { why: String(e && e.message || e) }); }
  },
};

if (typeof window !== 'undefined') {
  window.__audio = {
    api: audio,
    snap: snapshot,
    record,
    samples: () => sampler || [],
    manifest: () => manifestLoad.then(() => MUSIC.map((t) => t.id)),
    rows: () => MUSIC,
    /** Test seam: point a track at a file that is not there, to prove the 404 path is real. */
    breakTrack: (id, file) => { const t = MUSIC.find((x) => x.id === id); if (t) { t.file = file || 'nope_' + id + '.mp3'; delete bad[id]; return true; } return false; },
    /** Test seam: '' | 'gap' | 'double'. Deliberately breaks the crossfade so the gate can go red. */
    bug: (name) => { BUG = String(name || ''); return BUG; },
    /** Test seam: hold intensity at x (null releases). main.js feeds combat heat every frame and
     *  would otherwise overwrite anything the gate sets between two evals. */
    pin: (x) => { pinned = x === null || x === undefined ? null : clamp01(Number(x) || 0); if (pinned !== null) intensity = pinned; return pinned; },
  };
}

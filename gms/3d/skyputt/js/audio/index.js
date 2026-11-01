// SKYPUTT audio — public API. Procedural Web Audio, no files. See docs/notes/sound.md.
//
//   import { createAudio } from './audio/index.js';
//   const audio = createAudio();
//   addEventListener('pointerdown', () => audio.unlock());   // cheap; call on every gesture
//   audio.play('putt', { power: 0.8 });
//   audio.roll(ball.speed, 'grass');  // every frame
//   audio.music.start('sky');
//
// Every method is safe before unlock() (silent no-op; music.start is remembered and begins on
// unlock) and safe when Web Audio is missing entirely.
import { buildGraph, setPair } from './graph.js';
import { SFX, SFX_NAMES, THROTTLE, AUTODUCK } from './sfx.js';
import { Roll, ROLL_SURFACES } from './roll.js';
import { createMusic, THEMES } from './music.js';
import { clamp, holdParam } from './core.js';

export { SFX_NAMES, ROLL_SURFACES };
export const MUSIC_THEMES = Object.keys(THEMES);
export { renderSfx, renderRoll, renderMusic, measure } from './offline.js';

const MAX_VOICES = 28;          // one-shots in flight; extra plays are dropped
const DUCK = 0.25;              // music level while ducked (-12 dB)

export function createAudio({ master = 0.9, sfx = 1, music = 0.6 } = {}) {
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  let ctx = null, E = null, rollEng = null, mus = null;
  let muted = false, ducked = false, autoUntil = 0, wantTheme = null, active = 0, duckTimer = 0;
  const vol = { master, sfx, music };
  const last = {};

  const running = () => !!ctx && ctx.state === 'running';

  function applyMaster(tau = 0.05) {
    if (!E) return;
    const t = ctx.currentTime, g = E.master.gain;
    holdParam(g, t); g.setTargetAtTime(muted ? 0 : clamp(vol.master), t, tau);
  }
  function applyMusic(tau) {
    if (!E) return;
    const d = ducked || ctx.currentTime < autoUntil;
    setPair(E.music, clamp(vol.music) * (d ? DUCK : 1), tau ?? (d ? 0.12 : 0.5));
  }

  function init() {
    if (ctx || !AC) return !!ctx;
    try {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
      E = buildGraph(ctx);
      rollEng = new Roll(E);
      mus = createMusic(E);
      E.master.gain.value = muted ? 0 : clamp(vol.master);
      setPair(E.sfx, clamp(vol.sfx), 0.01);
      applyMusic(0.01);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!ctx) return;
          if (document.hidden) ctx.suspend().catch(() => {});
          else ctx.resume().catch(() => {});
        });
      }
      return true;
    } catch (e) {
      ctx = null; E = null;
      return false;
    }
  }

  const api = {
    get supported() { return !!AC; },
    get ready() { return running(); },
    get context() { return ctx; },

    // Call from a user gesture (pointerdown/touchend/keydown). Idempotent and cheap, so calling it
    // on every gesture also recovers iOS "interrupted" contexts after a phone call.
    unlock() {
      if (!init()) return false;
      if (ctx.state !== 'running') {
        ctx.resume().then(() => { if (wantTheme && !mus.playing) mus.start(wantTheme); }).catch(() => {});
        try {   // iOS: play one silent sample inside the gesture
          const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
          s.buffer = b; s.connect(ctx.destination); s.start(0);
        } catch { /* */ }
      }
      if (running() && wantTheme && !mus.playing) mus.start(wantTheme);
      return true;
    },

    setVolume({ master: m, sfx: s, music: mu } = {}) {
      if (m !== undefined) vol.master = clamp(+m || 0);
      if (s !== undefined) vol.sfx = clamp(+s || 0);
      if (mu !== undefined) vol.music = clamp(+mu || 0);
      if (!E) return;
      applyMaster(); setPair(E.sfx, vol.sfx); applyMusic(0.08);
    },
    getVolume() { return { ...vol, muted }; },

    mute(on = true) { muted = !!on; applyMaster(0.03); },

    // play(name, params) -> true if it was scheduled. params.pan (-1..1) is optional for any sound.
    play(name, params = {}) {
      if (!running() || muted) return false;
      const fn = SFX[name];
      if (!fn) return false;
      const t = ctx.currentTime;
      if (last[name] !== undefined && t - last[name] < (THROTTLE[name] ?? 0.02)) return false;
      if (active >= MAX_VOICES) return false;
      last[name] = t;
      try {
        const end = fn(E, t + 0.005, params || {});
        active++;
        setTimeout(() => { active--; }, Math.max(50, (end - t) * 1000));
        if (AUTODUCK[name] && mus.playing) {
          autoUntil = Math.max(autoUntil, t + AUTODUCK[name]);
          applyMusic();
          clearTimeout(duckTimer);
          duckTimer = setTimeout(() => applyMusic(), AUTODUCK[name] * 1000 + 30);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // Call every frame with the ball speed (m/s) and surface ('grass'|'sand'|'ice'|'wood'|'metal'|
    // 'glass'|'tube', or an engine MAT id). Speed 0 (or airborne) fades out smoothly.
    roll(speed, surface = 'grass') {
      if (!running()) return;
      try { rollEng.update(muted ? 0 : speed, surface); } catch { /* */ }
    },
    stopRoll() { if (rollEng && ctx) rollEng.fadeOut(ctx.currentTime, 0.04); },

    music: {
      start(themeId = 'sky') {
        wantTheme = themeId;
        if (running()) mus.start(themeId);
      },
      stop() { wantTheme = null; if (mus) mus.stop(); },
      duck(on = true) { ducked = !!on; applyMusic(); },
      get playing() { return !!mus && mus.playing; },
      get theme() { return mus ? mus.theme : null; },
    },

    debugGraph() { return E; },
    debugState() {
      return { ctx: ctx ? ctx.state : 'none', active, muted, vol: { ...vol }, ducked, music: mus ? mus.theme : null, roll: !!(rollEng && rollEng.g) };
    },
  };
  return api;
}

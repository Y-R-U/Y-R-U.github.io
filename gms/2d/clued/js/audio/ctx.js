// Shared AudioContext, buses and the mobile unlock. sfx, piano and clips all route through here.
let ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
const state = { volume: 0.8, sfx: 1, music: 1, muted: false };
const unlockCbs = [];
let unlocked = false;

export function getCtx() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  // iOS mutes Web Audio under the ringer's silent switch unless the session is "playback" (Safari 16.4+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx = new AC({ latencyHint: 'interactive' });
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4;
  comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(master); musicBus.connect(master);
  master.connect(comp); comp.connect(ctx.destination);
  apply();
  return ctx;
}

export const buses = () => (getCtx(), { master, sfx: sfxBus, music: musicBus });

function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(state.muted ? 0 : state.volume, t, 0.02);
  sfxBus.gain.setTargetAtTime(state.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(state.music, t, 0.02);
}

export function setVolume(v) { state.volume = clamp(v); apply(); }
export function setSfxVolume(v) { state.sfx = clamp(v); apply(); }
export function setMusicVolume(v) { state.music = clamp(v); apply(); }
export function mute(on = true) { state.muted = !!on; apply(); for (const el of document.querySelectorAll?.('audio[data-clued]') || []) el.muted = state.muted; }
export const isMuted = () => state.muted;
export const volumes = () => ({ ...state });

// settings object from A: { volume, sfxVolume, musicVolume, muted } (any subset, 0..1 or 0..100)
export function applySettings(s = {}) {
  const n = (x) => (x > 1 ? x / 100 : x);
  if (s.volume != null) state.volume = clamp(n(s.volume));
  if (s.sfxVolume != null) state.sfx = clamp(n(s.sfxVolume));
  if (s.musicVolume != null) state.music = clamp(n(s.musicVolume));
  if (s.muted != null || s.sound != null) state.muted = !!s.muted || s.sound === false;
  apply();
}

const clamp = (v) => Math.max(0, Math.min(1, +v || 0));

export function onUnlock(cb) { unlocked ? cb() : unlockCbs.push(cb); }
export const isUnlocked = () => unlocked && ctx && ctx.state === 'running';

export function unlock() {
  const c = getCtx();
  if (!c) return Promise.resolve(false);
  // a silent one-sample buffer started inside the gesture is what iOS wants
  try {
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch {}
  if (!navigator.audioSession) silentKeepAlive();
  return c.resume().then(() => {
    if (!unlocked) { unlocked = true; unlockCbs.splice(0).forEach((f) => { try { f(); } catch {} }); }
    return true;
  }).catch(() => false);
}

// Older iOS: a looping silent <audio> started in a gesture moves the session to playback so Web Audio ignores
// the silent switch. Flagged __cluedBgm so the media patch doesn't treat it as "something is playing".
let keepAlive = null;
function silentKeepAlive() {
  if (keepAlive || !/iP(hone|ad|od)|Macintosh.*Mobile/.test(navigator.userAgent || '')) return;
  const n = 2000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  keepAlive = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  keepAlive.__cluedBgm = true; keepAlive.loop = true; keepAlive.setAttribute('playsinline', '');
  keepAlive.play()?.catch?.(() => { keepAlive = null; });
}

// call once at boot; resumes on the first real gesture (and again after iOS interruptions)
let installed = false;
export function installUnlock(target = globalThis.document) {
  if (installed || !target) return;
  installed = true;
  const h = () => { unlock(); if (ctx && ctx.state === 'running') ['pointerdown', 'touchend', 'keydown'].forEach((e) => target.removeEventListener(e, h, true)); };
  ['pointerdown', 'touchend', 'keydown'].forEach((e) => target.addEventListener(e, h, true));
  target.addEventListener('visibilitychange', () => {
    if (target.visibilityState === 'visible' && ctx && ctx.state !== 'running' && unlocked) ctx.resume().catch(() => {});
  });
}
if (globalThis.document) installUnlock();

// impulse response for a small, light room (shared by piano and clip reveal)
let ir = null;
export function reverbIR() {
  const c = getCtx();
  if (ir || !c) return ir;
  const len = Math.floor(c.sampleRate * 1.6);
  ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let seed = 1234 + ch * 77;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const t = i / len;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1);
    }
  }
  return ir;
}

// "something with sound is playing" bus: bgm pauses while busy and ducks while speech is talking.
// Media elements and speechSynthesis are patched here so other lanes' players are covered without changes.
const busyTags = new Map(), duckTags = new Map(), busyFns = new Set();
const emit = () => busyFns.forEach((f) => { try { f(); } catch {} });
export const onBusy = (fn) => (busyFns.add(fn), () => busyFns.delete(fn));
export const busy = () => busyTags.size > 0;
export const ducked = () => duckTags.size > 0;
export function begin(tag) { busyTags.set(tag, (busyTags.get(tag) || 0) + 1); emit(); }
export function end(tag) { const n = (busyTags.get(tag) || 0) - 1; n > 0 ? busyTags.set(tag, n) : busyTags.delete(tag); emit(); }
export function duckBegin(tag) { duckTags.set(tag, 1); emit(); }
export function duckEnd(tag) { duckTags.delete(tag); emit(); }

let mediaSeq = 0;
function patchMedia() {
  const M = globalThis.HTMLMediaElement;
  if (!M || M.prototype.__cluedPatched) return;
  M.prototype.__cluedPatched = true;
  const orig = M.prototype.play;
  M.prototype.play = function (...args) {
    if (!this.__cluedBgm && !this.__cluedTag) {
      const tag = this.__cluedTag = 'media' + (++mediaSeq);
      begin(tag);
      const off = () => {
        if (this.__cluedTag !== tag) return;
        this.__cluedTag = null;
        ['pause', 'ended', 'error', 'emptied'].forEach((e) => this.removeEventListener(e, off));
        end(tag);
      };
      ['pause', 'ended', 'error', 'emptied'].forEach((e) => this.addEventListener(e, off));
      const p = orig.apply(this, args);
      p?.catch?.(off);
      return p;
    }
    return orig.apply(this, args);
  };
}

function patchSpeech() {
  const s = globalThis.speechSynthesis;
  if (!s || s.__cluedPatched) return;
  s.__cluedPatched = true;
  const speak = s.speak.bind(s), cancel = s.cancel.bind(s);
  let n = 0;
  s.speak = (u) => {
    const tag = 'speech' + (++n);
    duckBegin(tag);
    const off = () => duckEnd(tag);
    u.addEventListener?.('end', off); u.addEventListener?.('error', off);
    setTimeout(off, 30000);
    return speak(u);
  };
  s.cancel = () => { [...duckTags.keys()].filter((k) => k.startsWith('speech')).forEach(duckEnd); return cancel(); };
}
if (globalThis.document) { patchMedia(); patchSpeech(); }

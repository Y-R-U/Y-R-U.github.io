// ctx.audio: music(name) with crossfade, sfx(name, {pos, vol, mat}), vo(key) -> Promise, unlock().
import { settings } from '../ui/settings.js';
import { SFX, familyOf } from './sfx.js';

const BASE = new URL('../../audio/', import.meta.url).href;
const PLAYLISTS = {
  title: ['music/title.mp3'],
  day: ['music/day_a.mp3', 'music/day_b.mp3'],
  night: ['music/night.mp3'],
  intro: ['music/day_a.mp3'],
};
const LEVEL = { title: 0.9, day: 0.75, night: 0.8, intro: 0.45 };
const FADE = 2.5;
const MAX_VOICES = 24;

let ac = null, master, busMusic, busSfx, busVoice, duck;
let ctxRef = null, blocks = null;
let cur = null;               // { name, el, src, gain, idx }
let wanted = null;
let live = 0;
const lastPlayed = new Map();

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC({ latencyHint: 'interactive' });
  master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  busMusic = ac.createGain(); duck = ac.createGain();
  busMusic.connect(duck).connect(master);
  busSfx = ac.createGain(); busSfx.connect(master);
  busVoice = ac.createGain(); busVoice.connect(master);
  applyVolumes();
  return ac;
}

function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(settings.get('muteAll') ? 0 : 1, t, 0.05);
  busMusic.gain.setTargetAtTime(settings.gain('music') ** 1.5, t, 0.08);
  busSfx.gain.setTargetAtTime(settings.gain('sfx') ** 1.5, t, 0.05);
  busVoice.gain.setTargetAtTime(settings.gain('voice') ** 1.2, t, 0.05);
}

function makeTrack(name, idx) {
  const list = PLAYLISTS[name];
  const el = new Audio(BASE + list[idx % list.length]);
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.loop = list.length === 1;
  const src = ac.createMediaElementSource(el);
  const gain = ac.createGain();
  gain.gain.value = 0.0001;
  src.connect(gain).connect(busMusic);
  const tr = { name, el, src, gain, idx };
  if (!el.loop) el.addEventListener('ended', () => { if (cur === tr) startTrack(name, idx + 1); });
  return tr;
}

function fadeOut(tr) {
  const t = ac.currentTime;
  tr.gain.gain.cancelScheduledValues(t);
  tr.gain.gain.setValueAtTime(tr.gain.gain.value, t);
  tr.gain.gain.linearRampToValueAtTime(0.0001, t + FADE);
  setTimeout(() => { tr.el.pause(); tr.src.disconnect(); tr.el.src = ''; }, FADE * 1000 + 100);
}

function startTrack(name, idx = 0) {
  if (cur) fadeOut(cur);
  if (!name || !PLAYLISTS[name]) { cur = null; return; }
  const tr = makeTrack(name, idx);
  cur = tr;
  const t = ac.currentTime;
  tr.gain.gain.setValueAtTime(0.0001, t);
  tr.gain.gain.linearRampToValueAtTime(LEVEL[name] ?? 0.8, t + FADE);
  tr.el.play().catch(() => {});
}

function listenerSpace(pos) {
  const cam = ctxRef?.camera;
  if (!cam || !pos) return { att: 1, pan: 0 };
  const p = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
  const e = cam.matrixWorld.elements;
  const dx = p[0] - e[12], dy = p[1] - e[13], dz = p[2] - e[14];
  const dist = Math.hypot(dx, dy, dz);
  const right = (dx * e[0] + dy * e[1] + dz * e[2]) / (dist || 1);
  const att = dist < 2 ? 1 : Math.max(0, 1 - (dist - 2) / 30) ** 1.6;
  return { att, pan: Math.max(-0.85, Math.min(0.85, right * 0.9)) };
}

export const audio = {
  get ctx() { return ac; },
  init(ctx) {
    ctxRef = ctx || ctxRef;
    blocks = ctx?.world?.blocks || ctx?.blocks || blocks;
    settings.on('*', (v, k) => { if (/^(music|sfx|voice|muteAll)/.test(k)) applyVolumes(); });
    const bus = ctx?.bus;
    if (bus && !audio._wired) {
      audio._wired = true;
      bus.on('block:break', (d) => audio.sfx('break', { pos: d.pos, mat: d.removed?.[0]?.mat }));
      bus.on('block:place', (d) => { audio.sfx('place', { pos: d.pos || centreOf(d), mat: d.mat }); audio.sfx('hologram', { pos: d.pos || centreOf(d), vol: 0.6 }); });
      bus.on('player:damage', () => audio.sfx('hurt'));
      bus.on('player:death', () => audio.sfx('death'));
      bus.on('player:respawn', () => audio.sfx('respawn'));
      bus.on('item:pickup', () => audio.sfx('pickup'));
      bus.on('time:night', () => { audio.sfx('night'); if (wanted === 'day') audio.music('night'); });
      bus.on('time:day', () => { if (wanted === 'night') audio.music('day'); });
    }
    if (!audio._gesture) {
      audio._gesture = true;
      const go = () => audio.unlock();
      for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, { capture: true, passive: true });
    }
  },
  update() {},
  unlock() {
    if (!ensure()) return;
    if (ac.state !== 'running') ac.resume().catch(() => {});
    if (wanted && (!cur || cur.name !== wanted)) startTrack(wanted);
    else if (cur && cur.el.paused) cur.el.play().catch(() => {});
  },
  // 'title' | 'day' | 'night' | 'intro' | null (stop)
  music(name) {
    wanted = name;
    if (!ac || ac.state !== 'running') { ensure(); return; }
    if (cur && cur.name === name) return;
    startTrack(name);
  },
  get musicName() { return wanted; },
  duck(on, amount = 0.35) {
    if (!ac) return;
    duck.gain.setTargetAtTime(on ? amount : 1, ac.currentTime, on ? 0.15 : 0.6);
  },
  sfx(name, opt = {}) {
    if (!ac || ac.state !== 'running' || !SFX[name]) return;
    if (settings.gain('sfx') <= 0) return;
    const now = performance.now();
    const minGap = name === 'step' ? 60 : name === 'tick' ? 25 : 18;
    if (now - (lastPlayed.get(name) || 0) < minGap) return;
    lastPlayed.set(name, now);
    if (live >= MAX_VOICES) return;
    const { att, pan } = listenerSpace(opt.pos);
    const vol = (opt.vol ?? 1) * att;
    if (vol < 0.01) return;
    const g = ac.createGain(); g.gain.value = vol;
    let out = g;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(busSfx);
    const fam = opt.fam || (opt.mat != null ? familyOf(blockDef(opt.mat)) : undefined);
    live++;
    try { SFX[name](ac, g, ac.currentTime + 0.005, { ...opt, fam }); } catch (e) { console.warn('[sfx]', name, e); }
    setTimeout(() => { live--; out.disconnect(); }, Math.max(2.2, (opt.dur || 0) + 0.6) * 1000);
  },
  // audio/vo/<narrator>/ for the current `narrator` setting ('baritone' | 'female').
  voBase(who = settings.get('narrator')) { return BASE + 'vo/' + (who === 'female' ? 'female' : 'baritone') + '/'; },
  // Plays <voBase>/<key>.mp3. Resolves when it ends (or fails). Muted voice still plays silently, so timing holds.
  vo(key, { onStart, who } = {}) {
    ensure();
    audio._vo?.stop();
    return new Promise((resolve) => {
      const el = new Audio(audio.voBase(who) + key + '.mp3');
      el.crossOrigin = 'anonymous';
      let src = null, done = false;
      const fin = () => {
        if (done) return; done = true;
        audio.duck(false); audio._vo = null;
        try { src?.disconnect(); } catch {}
        resolve();
      };
      try { src = ac.createMediaElementSource(el); src.connect(busVoice); } catch { el.volume = settings.gain('voice'); }
      el.addEventListener('ended', fin);
      el.addEventListener('error', fin);
      el.addEventListener('playing', () => onStart?.(el.duration), { once: true });
      audio._vo = { el, stop: () => { el.pause(); fin(); } };
      audio.duck(true);
      el.play().catch(fin);
    });
  },
  stopVo() { audio._vo?.stop(); },
  familyOf,
};

function blockDef(mat) {
  const b = blocks || ctxRef?.blocks;
  return Array.isArray(b) ? b[mat] : b?.[mat] || null;
}
function centreOf(d) {
  if (!d?.minSub || !d?.maxSub) return null;
  return [0, 1, 2].map((i) => (d.minSub[i] + d.maxSub[i]) / 8);
}
export async function attachBlocks() {
  try { blocks = (await import('../data/blocks.js')).BLOCKS; } catch {}
}
attachBlocks();

export default audio;

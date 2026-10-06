// Web Audio: music / sfx / voice buses, crossfaded music, VO from audio/vo/manifest.json, procedural SFX.
import { SFX, LEVEL } from './sfx.js';

const BASE = new URL('../../audio/', import.meta.url).href;
const MUSIC = {
  menu: { file: 'music/menu.mp3', loop: true, gain: 0.9 },
  sneak: { file: 'music/sneak.mp3', loop: true, gain: 0.8 },
  chase: { file: 'music/chase.mp3', loop: true, gain: 0.85 },
  cutscene: { file: 'music/cutscene.mp3', loop: true, gain: 0.75 },
  victory: { file: 'music/victory.mp3', loop: false, gain: 1 },
  fanfare: { file: 'music/fanfare.mp3', loop: false, gain: 1 },
  title: { file: 'music/title_song.mp3', loop: true, gain: 0.85 },
};

let ctx = null, master, musicBus, sfxBus, voiceBus, duck, thoughtFx;
const vol = { music: 0.35, sfx: 0.8, voice: 1 };
let musicOn = true, customNames = false, hiddenMuted = false;
const buffers = new Map();      // url → Promise<AudioBuffer|null>
let cur = null;                 // {name, src, g}
let wanted = null;              // last requested music name (replayed after unlock / music-on)
const voPlaying = new Map();    // who → {src, resolve}
let listener = null;

const voLines = {};
const ready = fetch(BASE + 'vo/manifest.json').then((r) => r.ok ? r.json() : {}).then((m) => {
  for (const [k, v] of Object.entries(m)) voLines[k] = { who: v.who, text: v.text, file: v.file, dur: v.dur };
  return voLines;
}).catch(() => voLines);

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = hiddenMuted ? 0 : 1;
  master.connect(comp); comp.connect(ctx.destination);
  duck = ctx.createGain(); duck.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(duck);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  voiceBus = ctx.createGain(); voiceBus.connect(master);
  // Garfield's thought voice: a touch of soft room so it reads as "inside his head".
  thoughtFx = makeThoughtFx();
  applyVolumes(0);
  return ctx;
}

function makeThoughtFx() {
  const inp = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 0.9;
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 0.45), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.12;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  inp.connect(dry); dry.connect(voiceBus);
  inp.connect(conv); conv.connect(lp); lp.connect(wet); wet.connect(voiceBus);
  return inp;
}

function applyVolumes(t = 0.15) {
  if (!ctx) return;
  const now = ctx.currentTime;
  musicBus.gain.setTargetAtTime(musicOn ? vol.music : 0, now, t || 0.01);
  sfxBus.gain.setTargetAtTime(vol.sfx, now, t || 0.01);
  voiceBus.gain.setTargetAtTime(vol.voice, now, t || 0.01);
}

function load(url) {
  if (!buffers.has(url)) {
    buffers.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? decode(ab) : null)).catch(() => null));
  }
  return buffers.get(url);
}
function decode(ab) {
  ensure();
  return new Promise((res) => {
    const p = ctx.decodeAudioData(ab, res, () => res(null));
    if (p && p.then) p.then(res, () => res(null));
  });
}

function setDuck(on) {
  if (!ctx) return;
  duck.gain.setTargetAtTime(on ? 0.55 : 1, ctx.currentTime, on ? 0.08 : 0.5);
}

async function playMusic(name, fade) {
  const def = MUSIC[name];
  const old = cur;
  cur = null;
  if (old) {
    const t = ctx.currentTime;
    old.g.gain.cancelScheduledValues(t);
    old.g.gain.setValueAtTime(old.g.gain.value, t);
    old.g.gain.linearRampToValueAtTime(0, t + fade);
    try { old.src.stop(t + fade + 0.05); } catch {}
  }
  if (!def) return;
  const buf = await load(BASE + def.file);
  if (!buf || wanted !== name) return;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = def.loop;
  // Decoders that don't strip MP3 encoder padding (Safari) leave ~25 ms at the head: skip it so loops stay gapless.
  if (def.loop && def.len && buf.duration - def.len > 0.005) {
    src.loopStart = Math.min(0.026, buf.duration - def.len);
    src.loopEnd = src.loopStart + def.len;
  }
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(def.gain, t + Math.max(0.05, fade));
  src.connect(g); g.connect(musicBus);
  src.start(t);
  const me = { name, src, g };
  cur = me;
  if (!def.loop) src.onended = () => { if (cur === me) { cur = null; if (wanted === name) wanted = null; } };
}

function spatial(pos) {
  if (!pos || !listener) return { gain: 1, pan: 0 };
  const e = listener.matrixWorld?.elements;
  if (!e) return { gain: 1, pan: 0 };
  const dx = pos.x - e[12], dy = pos.y - e[13], dz = pos.z - e[14];
  const d = Math.hypot(dx, dy, dz);
  const gain = Math.min(1, 2.2 / Math.max(2.2, d)) ** 0.8;
  const right = (dx * e[0] + dy * e[1] + dz * e[2]) / (d || 1);
  return { gain, pan: Math.max(-0.8, Math.min(0.8, right * 0.8)) };
}

function estimateDur(text) { return Math.max(1.2, (text || '').length * 0.06 + 0.5); }

document.addEventListener('visibilitychange', () => {
  hiddenMuted = document.hidden;
  if (!ctx) return;
  master.gain.setTargetAtTime(hiddenMuted ? 0 : 1, ctx.currentTime, 0.05);
  if (hiddenMuted) setTimeout(() => { if (document.hidden) ctx.suspend?.(); }, 300);
  else ctx.resume?.();
});

export const audio = {
  ready,
  voLines,
  get ctx() { return ctx; },
  get state() { return { ctx: ctx?.state || 'none', music: cur?.name || null, wanted, vol: { ...vol }, musicOn, customNames }; },

  unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running' && !document.hidden) ctx.resume?.();
    // iOS: play a silent buffer inside the gesture.
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    if (wanted && !cur) playMusic(wanted, 1);
  },

  music(name, { fade = 1.2 } = {}) {
    name = name || null;
    if (name === wanted && (cur?.name === name || !ctx)) return;
    wanted = name;
    if (!ensure()) return;
    playMusic(name, fade);
  },

  sfx(name, { vol: v = 1, rate = 1, pos = null, delay = 0 } = {}) {
    if (!ensure() || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    const { gain, pan } = spatial(pos);
    const out = ctx.createGain(); out.gain.value = v * gain * (LEVEL[name] || 1);
    let node = out;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); node = p; }
    node.connect(sfxBus);
    const t = ctx.currentTime + 0.005 + delay;
    const len = fn(ctx, out, t, rate) || 1;
    setTimeout(() => { try { out.disconnect(); node.disconnect(); } catch {} }, (len + delay + 0.5) * 1000);
  },

  async vo(key) {
    if (customNames && voLines[key + '_nn']) key = key + '_nn';
    const line = voLines[key];
    const text = line?.text || '';
    if (!ensure() || !line?.file || ctx.state !== 'running') {
      const dur = line?.dur || estimateDur(text);
      await new Promise((r) => setTimeout(r, dur * 1000));
      return { dur, key, text, silent: true };
    }
    const buf = await load(new URL('../../' + line.file, import.meta.url).href);
    if (!buf) {
      const dur = line.dur || estimateDur(text);
      await new Promise((r) => setTimeout(r, dur * 1000));
      return { dur, key, text, silent: true };
    }
    const who = line.who;
    audio.stopVo(who);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(who === 'garfield' ? thoughtFx : voiceBus);
    setDuck(true);
    return new Promise((resolve) => {
      const rec = { src, resolve: () => resolve({ dur: buf.duration, key, text }) };
      voPlaying.set(who, rec);
      src.onended = () => {
        if (voPlaying.get(who) === rec) voPlaying.delete(who);
        if (!voPlaying.size) setDuck(false);
        rec.resolve();
      };
      src.start();
    });
  },

  stopVo(who) {
    for (const [w, rec] of [...voPlaying]) {
      if (who && w !== who) continue;
      voPlaying.delete(w);
      try { rec.src.onended = null; rec.src.stop(); } catch {}
      rec.resolve();
    }
    if (!voPlaying.size) setDuck(false);
  },

  // All manifest keys of a bark family: family('g_idle') → ['g_idle_01', …] (excludes _nn takes).
  family(prefix) {
    const re = new RegExp('^' + prefix + '_[a-z]*\\d+$');
    return Object.keys(voLines).filter((k) => re.test(k));
  },

  preload(keys) {
    if (!ensure()) return;
    for (const k of keys) { const l = voLines[k]; if (l?.file) load(new URL('../../' + l.file, import.meta.url).href); }
  },
  preloadMusic(names = Object.keys(MUSIC)) { if (ensure()) for (const n of names) if (MUSIC[n]) load(BASE + MUSIC[n].file); },

  setVolumes(v = {}) {
    for (const k of ['music', 'sfx', 'voice']) if (typeof v[k] === 'number') vol[k] = Math.max(0, Math.min(1, v[k]));
    applyVolumes();
  },
  setMusicOn(on) { musicOn = !!on; applyVolumes(0.3); },
  setCustomNames(on) { customNames = !!on; },
  setListener(obj3d) { listener = obj3d; },
  sfxNames: Object.keys(SFX),
  musicNames: Object.keys(MUSIC),
};

if (typeof window !== 'undefined') window.__audio = audio;

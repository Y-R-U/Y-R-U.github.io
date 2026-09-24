const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export function createAudio(settings) {
  let ctx = null, master, musicBus, voBus, sfxBus, windGain, windFilter;
  const tracks = {};
  let current = null;
  const voCache = new Map();
  let voSrc = null, duck = 1, voCount = 0, wanted = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.connect(ctx.destination);
    musicBus = ctx.createGain(); voBus = ctx.createGain(); sfxBus = ctx.createGain();
    [musicBus, voBus, sfxBus].forEach((b) => b.connect(master));
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(sfxBus); noise.start();
    api.noiseBuf = buf;
    applyVolumes();
    if (wanted) music(wanted, 1.5);
  }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(settings.music * 0.55 * duck, t, 0.25);
    voBus.gain.setTargetAtTime(settings.voice * 1.1, t, 0.05);
    sfxBus.gain.setTargetAtTime(settings.sfx * 0.6, t, 0.05);
  }
  function track(name) {
    if (tracks[name]) return tracks[name];
    const el = new Audio(`audio/music/${name}.mp3`);
    el.loop = !['win', 'fail'].includes(name); el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el), g = ctx.createGain(); g.gain.value = 0;
    src.connect(g).connect(musicBus);
    return (tracks[name] = { el, g });
  }
  function music(name, fade = 2) {
    if (!ctx) { wanted = name; return; }
    if (current === name) return;
    const t = ctx.currentTime;
    if (current && tracks[current]) {
      const old = tracks[current]; old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { if (current !== old.name) old.el.pause(); }, fade * 1000 + 100);
    }
    current = name;
    if (!name) return;
    const tr = track(name); tr.name = name;
    tr.el.currentTime = 0; tr.el.play().catch(() => {});
    tr.g.gain.cancelScheduledValues(t); tr.g.gain.setValueAtTime(0, t); tr.g.gain.linearRampToValueAtTime(1, t + fade);
  }
  async function loadVO(file) {
    if (voCache.has(file)) return voCache.get(file);
    const p = fetch(`audio/vo/${file}`).then((r) => { if (!r.ok) throw new Error(file); return r.arrayBuffer(); })
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
    voCache.set(file, p);
    return p;
  }
  function vo(file) {
    if (!ctx) return Promise.resolve(0);
    return loadVO(file).then((buf) => new Promise((res) => {
      if (voSrc) try { voSrc.stop(); } catch (e) { /* already stopped */ }
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voBus);
      voSrc = s; voCount++; duck = 0.4; applyVolumes();
      s.onended = () => { voCount--; if (voCount <= 0) { voCount = 0; duck = 1; applyVolumes(); } res(buf.duration); };
      s.start();
    })).catch(() => 0);
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  let chimeIdx = 0, lastChime = 0;
  const sfx = {
    mote() {
      if (!ctx) return; const t = ctx.currentTime;
      if (t - lastChime > 1.2) chimeIdx = 0; lastChime = t;
      const f = 660 * Math.pow(2, PENTA[chimeIdx++ % PENTA.length] / 12);
      [1, 2.01, 3.02].forEach((h, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h; o.connect(g).connect(sfxBus); env(g, t, 0.005, 0.18 / (i + 1), 0.6 - i * 0.15); o.start(t); o.stop(t + 0.8); });
    },
    shine() {
      if (!ctx) return; const t = ctx.currentTime;
      const n = ctx.createBufferSource(); n.buffer = api.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.35); const g = ctx.createGain();
      n.connect(f).connect(g).connect(sfxBus); env(g, t, 0.02, 0.5, 0.6); n.start(t); n.stop(t + 0.8);
      [523, 784, 1046].forEach((fr, i) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'triangle'; o.frequency.value = fr; o.connect(gg).connect(sfxBus); env(gg, t + i * 0.04, 0.01, 0.12, 0.9); o.start(t); o.stop(t + 1.2); });
    },
    hit() {
      if (!ctx) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      o.connect(g).connect(sfxBus); env(g, t, 0.005, 0.7, 0.35); o.start(t); o.stop(t + 0.5);
      const n = ctx.createBufferSource(); n.buffer = api.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const gn = ctx.createGain();
      n.connect(f).connect(gn).connect(sfxBus); env(gn, t, 0.005, 0.35, 0.25); n.start(t); n.stop(t + 0.4);
    },
    jump() {
      if (!ctx) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.15);
      o.connect(g).connect(sfxBus); env(g, t, 0.01, 0.14, 0.2); o.start(t); o.stop(t + 0.3);
    },
    splash() {
      if (!ctx) return; const t = ctx.currentTime;
      const n = ctx.createBufferSource(); n.buffer = api.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200; const g = ctx.createGain();
      n.connect(f).connect(g).connect(sfxBus); env(g, t, 0.01, 0.3, 0.45); n.start(t); n.stop(t + 0.6);
    },
    free() {
      if (!ctx) return; const t = ctx.currentTime;
      [392, 494, 587, 784, 988].forEach((fr, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fr; o.connect(g).connect(sfxBus); env(g, t + i * 0.09, 0.01, 0.16, 1.4); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1.6); });
    },
  };
  const api = {
    init, music, vo, sfx, applyVolumes, loadVO: (f) => ctx && loadVO(f),
    wind(level, freq = 500) { if (!ctx) return; windGain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.4); windFilter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.4); },
    stopVO() { if (voSrc) try { voSrc.stop(); } catch (e) { /* already stopped */ } },
    get ready() { return !!ctx; },
  };
  return api;
}

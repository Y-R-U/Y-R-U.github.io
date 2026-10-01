// Procedural WebAudio SFX. Each voice builds a tiny graph into `out` and frees itself.
let noiseBuf = null;
function noise(ac) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
const rnd = (a, b) => a + Math.random() * (b - a);

function env(ac, g, t, a, peak, dur, curve = 'exp') {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  else g.gain.linearRampToValueAtTime(0.0001, t + a + dur);
}
function nz(ac, out, t, { dur = 0.15, a = 0.003, peak = 0.5, type = 'bandpass', f = 1200, f2 = null, q = 1, rate = 1 }) {
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  s.playbackRate.value = rate;
  const fl = ac.createBiquadFilter();
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
  const g = ac.createGain();
  env(ac, g, t, a, peak, dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 0.8, a + dur + 0.05);
}
function tone(ac, out, t, { type = 'sine', f = 440, f2 = null, dur = 0.2, a = 0.005, peak = 0.3, det = 0, lp = null }) {
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
  const g = ac.createGain();
  env(ac, g, t, a, peak, dur);
  let n = o;
  if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; n = o.connect(fl); }
  n.connect(g).connect(out);
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}

// Material families: how a block sounds when broken, placed or stepped on.
const FAM = {
  soft: { f: 700, q: 0.7, dur: 0.16, ring: 0 },           // moss, loam, leaves, plants
  sand: { f: 3200, q: 0.5, dur: 0.2, ring: 0, type: 'highpass' },
  stone: { f: 1600, q: 1.4, dur: 0.11, ring: 0 },
  wood: { f: 420, q: 2.2, dur: 0.12, ring: 180 },          // lattice wood / carbon bark
  metal: { f: 2600, q: 6, dur: 0.12, ring: 1400 },         // chrome, ferrite, mirror
  glass: { f: 4200, q: 4, dur: 0.1, ring: 2600 },
  gel: { f: 500, q: 3, dur: 0.18, ring: 0 },
};

export function familyOf(b) {
  if (!b) return 'stone';
  if (b.sound) return b.sound;
  const k = b.key || '';
  if (/glass|crystal|qubit|film/.test(k) && b.transparent) return 'glass';
  if (/mirror|chrome|ferrite|aurum|metal|wire|panel|plate/.test(k)) return 'metal';
  if (/sand|grain|silt|dust/.test(k)) return 'sand';
  if (/lattice|bark|wood|log|plank|fibre/.test(k)) return 'wood';
  if (/kelp|gel|slime/.test(k)) return 'gel';
  if (b.plant || b.cutout || b.tool === 'scoop' || /moss|loam|leaf|leaves|vine|bloom/.test(k)) return 'soft';
  return 'stone';
}

export const SFX = {
  break(ac, o, t, p) {
    const F = FAM[p.fam] || FAM.stone;
    nz(ac, o, t, { dur: F.dur * 1.4, peak: 0.55, f: F.f * rnd(0.85, 1.15), q: F.q, type: F.type || 'bandpass', f2: F.f * 0.5 });
    nz(ac, o, t + 0.035, { dur: F.dur, peak: 0.3, f: F.f * 0.6, q: 1 });
    if (F.ring) tone(ac, o, t, { type: 'triangle', f: F.ring * rnd(0.9, 1.1), f2: F.ring * 0.7, dur: 0.18, peak: 0.12 });
    tone(ac, o, t + 0.02, { type: 'sine', f: 1900, f2: 3800, dur: 0.07, peak: 0.05 });
  },
  place(ac, o, t, p) {
    const F = FAM[p.fam] || FAM.stone;
    nz(ac, o, t, { dur: F.dur * 0.8, peak: 0.45, f: F.f * 0.7, q: F.q * 0.8 });
    tone(ac, o, t, { type: 'sine', f: 180, f2: 90, dur: 0.09, peak: 0.35 });
    if (F.ring) tone(ac, o, t, { type: 'triangle', f: F.ring, dur: 0.12, peak: 0.07 });
  },
  hologram(ac, o, t) {
    [0, 4, 7, 12].forEach((s, i) => tone(ac, o, t + i * 0.035, { type: 'triangle', f: 660 * 2 ** (s / 12), dur: 0.16, peak: 0.07 }));
    nz(ac, o, t + 0.14, { dur: 0.08, peak: 0.12, f: 5000, q: 2 });
  },
  step(ac, o, t, p) {
    const F = FAM[p.fam] || FAM.soft;
    nz(ac, o, t, { dur: 0.06, a: 0.002, peak: 0.22, f: F.f * rnd(0.7, 1.2), q: 0.9, type: F.type || 'bandpass' });
    if (p.fam === 'metal' || p.fam === 'glass') tone(ac, o, t, { type: 'triangle', f: F.ring * rnd(0.9, 1.1), dur: 0.06, peak: 0.03 });
  },
  splash(ac, o, t) {
    nz(ac, o, t, { dur: 0.45, a: 0.01, peak: 0.5, type: 'lowpass', f: 3500, f2: 400, q: 0.5 });
    for (let i = 0; i < 4; i++) tone(ac, o, t + rnd(0.05, 0.3), { f: rnd(700, 1400), f2: rnd(1500, 2400), dur: 0.05, peak: 0.05 });
  },
  hurt(ac, o, t) {
    tone(ac, o, t, { type: 'square', f: 420, f2: 160, dur: 0.18, peak: 0.16, lp: 2200 });
    nz(ac, o, t, { dur: 0.12, peak: 0.3, f: 900, q: 1 });
    tone(ac, o, t + 0.03, { type: 'sawtooth', f: 90, f2: 60, dur: 0.18, peak: 0.12, lp: 600 });
  },
  eat(ac, o, t) {
    for (let i = 0; i < 3; i++) nz(ac, o, t + i * 0.13, { dur: 0.07, peak: 0.35, f: rnd(1200, 2400), q: 1.6 });
    tone(ac, o, t + 0.42, { f: 520, f2: 880, dur: 0.12, peak: 0.08 });
  },
  pickup(ac, o, t) {
    tone(ac, o, t, { type: 'triangle', f: 880, dur: 0.07, peak: 0.12 });
    tone(ac, o, t + 0.06, { type: 'triangle', f: 1320, dur: 0.12, peak: 0.12 });
  },
  fuse(ac, o, t, p) {
    const d = p.dur || 1.5;
    const s = ac.createBufferSource(); s.buffer = noise(ac); s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 3;
    fl.frequency.setValueAtTime(2000, t); fl.frequency.exponentialRampToValueAtTime(7000, t + d);
    const g = ac.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.linearRampToValueAtTime(0.4, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.05);
    s.connect(fl).connect(g).connect(o); s.start(t); s.stop(t + d + 0.1);
    for (let k = 0, x = 0; x < d; k++) { tone(ac, o, t + x, { type: 'square', f: 1800 + k * 90, dur: 0.03, peak: 0.05, lp: 5000 }); x += Math.max(0.05, 0.22 - k * 0.018); }
  },
  emp(ac, o, t) {
    tone(ac, o, t, { type: 'sine', f: 120, f2: 30, dur: 0.9, peak: 0.8 });
    nz(ac, o, t, { dur: 0.7, a: 0.004, peak: 0.6, type: 'lowpass', f: 6000, f2: 200, q: 0.4 });
    tone(ac, o, t, { type: 'sawtooth', f: 2400, f2: 120, dur: 0.35, peak: 0.12, lp: 6000 });
    for (let i = 0; i < 6; i++) nz(ac, o, t + 0.1 + i * rnd(0.04, 0.09), { dur: 0.03, peak: 0.15, f: rnd(3000, 8000), q: 4 });
  },
  groan(ac, o, t) {
    const d = rnd(0.8, 1.2);
    const osc = ac.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(rnd(85, 100), t); osc.frequency.linearRampToValueAtTime(rnd(55, 70), t + d);
    const lfo = ac.createOscillator(); lfo.frequency.value = 7; const lg = ac.createGain(); lg.gain.value = 6;
    lfo.connect(lg).connect(osc.frequency);
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(600, t); f1.frequency.linearRampToValueAtTime(350, t + d);
    const g = ac.createGain(); env(ac, g, t, 0.12, 0.35, d, 'lin');
    osc.connect(f1).connect(g).connect(o);
    nz(ac, o, t, { dur: d, a: 0.1, peak: 0.05, f: 300, q: 3 });
    osc.start(t); lfo.start(t); osc.stop(t + d + 0.2); lfo.stop(t + d + 0.2);
  },
  chirp(ac, o, t) {
    const n = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const f = rnd(2200, 3200);
      tone(ac, o, t + i * 0.11, { type: 'sine', f, f2: f * rnd(1.3, 1.6), dur: 0.06, peak: 0.12 });
      tone(ac, o, t + i * 0.11 + 0.02, { type: 'square', f: f * 2, dur: 0.02, peak: 0.02, lp: 6000 });
    }
  },
  fuseCancel(ac, o, t) {
    tone(ac, o, t, { type: 'sine', f: 2400, f2: 500, dur: 0.35, peak: 0.12 });
    nz(ac, o, t, { dur: 0.3, peak: 0.12, type: 'bandpass', f: 5000, f2: 900, q: 3 });
  },
  visor(ac, o, t) {
    tone(ac, o, t, { type: 'sawtooth', f: 330, f2: 990, dur: 0.38, peak: 0.12, lp: 2500 });
    tone(ac, o, t + 0.02, { type: 'square', f: 1980, dur: 0.05, peak: 0.04, lp: 6000 });
  },
  whiff(ac, o, t) { nz(ac, o, t, { dur: 0.16, a: 0.04, peak: 0.22, f: 700, f2: 2200, q: 1.4 }); },
  mobHit(ac, o, t) {
    nz(ac, o, t, { dur: 0.09, peak: 0.45, f: 1400, q: 1.2 });
    tone(ac, o, t, { type: 'square', f: 300, f2: 150, dur: 0.08, peak: 0.1, lp: 1800 });
    tone(ac, o, t + 0.01, { type: 'triangle', f: 2600, f2: 1800, dur: 0.06, peak: 0.05 });
  },
  mobDeath(ac, o, t) {
    tone(ac, o, t, { type: 'sawtooth', f: 600, f2: 70, dur: 0.6, peak: 0.16, lp: 2200 });
    for (let i = 0; i < 6; i++) nz(ac, o, t + 0.05 + i * rnd(0.04, 0.08), { dur: 0.03, peak: 0.16, f: rnd(2500, 7000), q: 5 });
  },
  burnout(ac, o, t) {
    const s = ac.createBufferSource(); s.buffer = noise(ac); s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 3000;
    const g = ac.createGain(); env(ac, g, t, 0.05, 0.25, 1.2, 'lin');
    s.connect(fl).connect(g).connect(o); s.start(t); s.stop(t + 1.4);
    for (let i = 0; i < 10; i++) tone(ac, o, t + rnd(0, 1.1), { type: 'square', f: rnd(2000, 5000), dur: 0.02, peak: 0.05, lp: 8000 });
    tone(ac, o, t + 1, { type: 'sine', f: 400, f2: 60, dur: 0.4, peak: 0.12 });
  },
  cache(ac, o, t) {
    [0, 4, 7, 11, 14].forEach((s, i) => tone(ac, o, t + i * 0.06, { type: 'triangle', f: 523 * 2 ** (s / 12), dur: 0.35, peak: 0.08 }));
    nz(ac, o, t, { dur: 0.5, a: 0.05, peak: 0.08, f: 6000, q: 1 });
  },
  bowDraw(ac, o, t) {
    tone(ac, o, t, { type: 'sine', f: 220, f2: 660, dur: 0.9, a: 0.05, peak: 0.07 });
    nz(ac, o, t, { dur: 0.8, a: 0.1, peak: 0.05, f: 1500, f2: 4000, q: 4 });
  },
  bowFire(ac, o, t) {
    tone(ac, o, t, { type: 'sawtooth', f: 1800, f2: 300, dur: 0.22, peak: 0.14, lp: 5000 });
    nz(ac, o, t, { dur: 0.12, peak: 0.2, f: 3000, f2: 900, q: 1.5 });
  },
  pulseHit(ac, o, t) { tone(ac, o, t, { type: 'square', f: 1400, f2: 500, dur: 0.1, peak: 0.1, lp: 4000 }); nz(ac, o, t, { dur: 0.08, peak: 0.3, f: 2400, q: 2 }); },
  archerCharge(ac, o, t) { tone(ac, o, t, { type: 'sawtooth', f: 300, f2: 1300, dur: 0.95, a: 0.05, peak: 0.08, lp: 3000 }); },
  archerFire(ac, o, t) { tone(ac, o, t, { type: 'square', f: 1600, f2: 200, dur: 0.25, peak: 0.12, lp: 4500 }); },
  spiderHiss(ac, o, t) { nz(ac, o, t, { dur: 0.5, a: 0.05, peak: 0.3, type: 'highpass', f: 4000, q: 0.7 }); for (let i = 0; i < 5; i++) nz(ac, o, t + i * 0.06, { dur: 0.02, peak: 0.12, f: 6000, q: 6 }); },
  spiderLeap(ac, o, t) { nz(ac, o, t, { dur: 0.2, a: 0.02, peak: 0.3, f: 800, f2: 3000, q: 1.5 }); for (let i = 0; i < 4; i++) tone(ac, o, t + i * 0.03, { type: 'square', f: rnd(3000, 5000), dur: 0.015, peak: 0.04, lp: 8000 }); },
  voidShimmer(ac, o, t) { [0, 1, 6, 7].forEach((s, i) => tone(ac, o, t + i * 0.05, { type: 'sine', f: 880 * 2 ** (s / 12), dur: 0.5, peak: 0.05, det: rnd(-30, 30) })); },
  voidTeleport(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 1600, f2: 120, dur: 0.3, peak: 0.16 }); tone(ac, o, t + 0.25, { type: 'sine', f: 120, f2: 1600, dur: 0.25, peak: 0.12 }); nz(ac, o, t, { dur: 0.5, peak: 0.1, f: 5000, q: 3 }); },
  gelHop(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 160, f2: 420, dur: 0.14, peak: 0.25 }); nz(ac, o, t + 0.1, { dur: 0.1, peak: 0.15, type: 'lowpass', f: 900, q: 1 }); },
  fabricate(ac, o, t) {
    [0, 7, 12].forEach((s, i) => tone(ac, o, t + i * 0.07, { type: 'triangle', f: 440 * 2 ** (s / 12), dur: 0.18, peak: 0.08 }));
    nz(ac, o, t, { dur: 0.25, a: 0.02, peak: 0.1, f: 2500, f2: 6000, q: 2 });
    tone(ac, o, t + 0.22, { type: 'sine', f: 1760, dur: 0.12, peak: 0.06 });
  },
  goal(ac, o, t) {
    [0, 4, 7, 12].forEach((s, i) => tone(ac, o, t + i * 0.075, { type: 'sine', f: 784 * 2 ** (s / 12), dur: 0.4, peak: 0.09 }));
    tone(ac, o, t + 0.3, { type: 'triangle', f: 2093, dur: 0.5, peak: 0.04 });
  },
  till(ac, o, t) { nz(ac, o, t, { dur: 0.14, peak: 0.4, f: 600, q: 0.8 }); nz(ac, o, t + 0.09, { dur: 0.12, peak: 0.25, f: 900, q: 0.8 }); },
  plant(ac, o, t) { nz(ac, o, t, { dur: 0.08, peak: 0.25, f: 700, q: 1 }); tone(ac, o, t + 0.05, { type: 'sine', f: 660, f2: 990, dur: 0.15, peak: 0.08 }); },
  treeGrow(ac, o, t) {
    for (let i = 0; i < 8; i++) tone(ac, o, t + i * 0.07, { type: 'triangle', f: 330 * 2 ** ([0, 2, 4, 7, 9, 12, 14, 16][i] / 12), dur: 0.25, peak: 0.06 });
    nz(ac, o, t, { dur: 0.7, a: 0.2, peak: 0.08, type: 'lowpass', f: 500, f2: 2500, q: 1 });
  },
  treeFall(ac, o, t) {
    for (let i = 0; i < 6; i++) nz(ac, o, t + i * 0.09, { dur: 0.08, peak: 0.2 + i * 0.03, f: 500 - i * 40, q: 2 });
    nz(ac, o, t + 0.55, { dur: 0.8, a: 0.01, peak: 0.6, type: 'lowpass', f: 900, f2: 120, q: 0.6 });
    tone(ac, o, t + 0.55, { type: 'sine', f: 90, f2: 40, dur: 0.6, peak: 0.45 });
    for (let i = 0; i < 5; i++) nz(ac, o, t + 0.6 + Math.random() * 0.6, { dur: 0.1, peak: 0.12, f: rnd(1500, 4000), q: 1.5 });
  },
  swing(ac, o, t) { nz(ac, o, t, { dur: 0.14, a: 0.03, peak: 0.25, f: 900, f2: 2500, q: 1.2 }); },
  hit(ac, o, t) { nz(ac, o, t, { dur: 0.1, peak: 0.45, f: 1200, q: 1 }); tone(ac, o, t, { type: 'square', f: 240, f2: 120, dur: 0.08, peak: 0.1, lp: 1500 }); },
  death(ac, o, t) { [0, -3, -7, -12].forEach((s, i) => tone(ac, o, t + i * 0.16, { type: 'triangle', f: 440 * 2 ** (s / 12), dur: 0.25, peak: 0.14 })); },
  respawn(ac, o, t) { [0, 7, 12, 16, 19].forEach((s, i) => tone(ac, o, t + i * 0.07, { type: 'sine', f: 392 * 2 ** (s / 12), dur: 0.4, peak: 0.09 })); },
  // UI
  click(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 1500, f2: 1100, dur: 0.035, peak: 0.12 }); nz(ac, o, t, { dur: 0.02, peak: 0.08, f: 6000, q: 2 }); },
  tick(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 2200, dur: 0.02, peak: 0.07 }); },
  back(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 1100, f2: 700, dur: 0.06, peak: 0.1 }); },
  open(ac, o, t) { tone(ac, o, t, { type: 'triangle', f: 520, f2: 1040, dur: 0.12, peak: 0.1 }); nz(ac, o, t, { dur: 0.12, a: 0.02, peak: 0.06, f: 3000, f2: 7000, q: 1 }); },
  close(ac, o, t) { tone(ac, o, t, { type: 'triangle', f: 900, f2: 450, dur: 0.1, peak: 0.09 }); },
  select(ac, o, t) { tone(ac, o, t, { type: 'triangle', f: 1320, dur: 0.04, peak: 0.07 }); },
  deny(ac, o, t) { tone(ac, o, t, { type: 'square', f: 200, dur: 0.07, peak: 0.08, lp: 1200 }); tone(ac, o, t + 0.09, { type: 'square', f: 160, dur: 0.09, peak: 0.08, lp: 1200 }); },
  toast(ac, o, t) { tone(ac, o, t, { type: 'sine', f: 988, dur: 0.08, peak: 0.07 }); tone(ac, o, t + 0.07, { type: 'sine', f: 1318, dur: 0.14, peak: 0.07 }); },
  night(ac, o, t) { [0, -5, -9].forEach((s, i) => tone(ac, o, t + i * 0.25, { type: 'sine', f: 330 * 2 ** (s / 12), dur: 0.9, peak: 0.07 })); },
};

// Krayzee audio: one AudioContext, four buses, procedural aircraft sounds and the radio voice chain.
import { ENGINE_BASE_RPM, noiseBuffer, engineExhaustBuffer, propBuffer, bumpBuffer, softClipCurve } from './synth.js';

export const IDLE_RPM = 700, MAX_RPM = 2700;
export const rpmFromThrottle = (t) => IDLE_RPM + clamp01(t) * (MAX_RPM - IDLE_RPM);
const SPEED_OF_SOUND = 343;

const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
const v3 = (v) => (!v ? [0, 0, 0] : Array.isArray(v) ? v : [v.x || 0, v.y || 0, v.z || 0]);

let sys = null;
let unlockArmed = false;
const unlockCbs = [];

// Builds the whole graph on any BaseAudioContext (an OfflineAudioContext works for tests).
export function createAudioSystem(ctx, opts = {}) {
  const S = { ctx, voiceCap: opts.voiceCap || 6, engines: new Set(), listener: { pos: [0, 0, 0], vel: [0, 0, 0] } };
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const now = () => ctx.currentTime;
  // PERF #6: while the context is suspended currentTime is frozen and every setTargetAtTime piles up; also skip re-sends
  // of (nearly) the same target, which most per-frame calls are.
  const ramp = (p, v, tau = 0.05) => {
    if (ctx.state !== 'running') return;
    const last = p._kz;
    if (last !== undefined && Math.abs(v - last) <= Math.abs(last) * 0.005 + 1e-5) return;
    p._kz = v;
    p.setTargetAtTime(v, now(), tau);
  };

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12;
  limiter.attack.value = 0.002; limiter.release.value = 0.15;
  S.master = g(0.9); S.master.connect(limiter); limiter.connect(ctx.destination);
  S.buses = {};
  S.duck = {};
  for (const name of ['sfx', 'radio', 'music']) {
    const vol = g(name === 'music' ? 0.6 : 1), duck = g(1);
    vol.connect(duck); duck.connect(S.master);
    S.buses[name] = vol; S.duck[name] = duck;
  }

  const buf = {
    white: noiseBuffer(ctx, 2, 'white', 3),
    pink: noiseBuffer(ctx, 3, 'pink', 5),
    brown: noiseBuffer(ctx, 3, 'brown', 9),
    exhaust: engineExhaustBuffer(ctx),
    prop: propBuffer(ctx),
    bumps: bumpBuffer(ctx),
  };
  S.buffers = buf;

  const loop = (b, rate = 1, offset = Math.random() * b.duration) => {
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(now(), offset);
    return s;
  };
  const filt = (type, f, q = 0.707, gain = 0) => {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = gain; return n;
  };
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };

  function makePanner() {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 12; p.rolloffFactor = 1; p.maxDistance = 10000;
    setPannerPos(p, [0, 0, -1]);
    return p;
  }
  function setPannerPos(p, [x, y, z]) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }
  // Sources are placed relative to the listener, so ctx.listener stays at the origin and only its orientation changes.
  S.setListener = ({ position, velocity, forward, up } = {}) => {
    if (ctx.state !== 'running') return;
    if (position) S.listener.pos = v3(position);
    if (velocity) S.listener.vel = v3(velocity);
    if (forward) {
      const L = ctx.listener, f = v3(forward), u = v3(up || [0, 1, 0]);
      if (L.forwardX) {
        L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2];
        L.upX.value = u[0]; L.upY.value = u[1]; L.upZ.value = u[2];
      } else L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
    }
  };

  // ---------- engine voices ----------
  S.createEngineVoice = (o = {}) => {
    const out = g(0), panner = makePanner();
    const load = filt('lowpass', 1400, 0.9);
    const cabin = filt('peaking', 115, 1.2, 0);
    const air = filt('lowpass', 18000, 0.5);
    const exG = g(0.9), prG = g(0.4);
    exG.connect(load); prG.connect(load);
    chain(load, cabin, air, out, panner, S.buses.sfx);
    const st = { rpm: 0, load: 0, interior: false, dist: 0, doppler: 1, active: false, src: [], gainScale: o.gain ?? 1, priority: o.priority || 0 };
    const voice = { _st: st };

    function start() {
      if (st.active) return;
      st.active = true;
      const r = rate();
      st.src = [loop(buf.exhaust, r), loop(buf.prop, r)];
      st.src[0].connect(exG); st.src[1].connect(prG);
      apply(0.02);
    }
    function stop() {
      if (!st.active) return;
      st.active = false;
      out.gain.cancelScheduledValues(now()); out.gain.setValueAtTime(out.gain.value, now()); out.gain.linearRampToValueAtTime(0, now() + 0.08);
      const s = st.src; st.src = [];
      for (const x of s) { try { x.stop(now() + 0.1); } catch {} }
    }
    const rate = () => Math.max(0.05, (Math.max(st.rpm, 1) / ENGINE_BASE_RPM) * st.doppler);
    function apply(tau = 0.06) {
      if (!st.active) return;
      const r = rate(), on = st.rpm > 50 ? 1 : 0;
      for (const s of st.src) ramp(s.playbackRate, r, tau);
      const rn = st.rpm / MAX_RPM;
      ramp(load.frequency, 500 + 600 * rn + 3200 * st.load * rn, tau);
      ramp(prG.gain, 0.12 + 0.75 * rn * rn, tau);
      ramp(exG.gain, 0.55 + 0.45 * st.load, tau);
      const level = (0.35 + 0.45 * rn + 0.2 * st.load) * on * st.gainScale;
      if (st.interior) {
        ramp(cabin.gain, 7, 0.1); ramp(air.frequency, 650, 0.1); ramp(out.gain, level * 0.9, tau);
      } else {
        ramp(cabin.gain, 0, 0.1);
        ramp(air.frequency, Math.max(700, 18000 * Math.exp(-st.dist / 700)), 0.1);
        ramp(out.gain, level * 1.5, tau);
      }
    }
    voice.setRPM = (rpm, loadFrac) => {
      st.rpm = Math.max(0, +rpm || 0);
      st.load = loadFrac == null ? clamp01((st.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM)) : clamp01(loadFrac);
      apply();
    };
    voice.setThrottle = (t) => voice.setRPM(rpmFromThrottle(t), t);
    voice.setInterior = (on) => {
      st.interior = !!on;
      if (on) { setPannerPos(panner, [0, -0.2, -1.5]); st.doppler = 1; st.dist = 0; }
      apply(0.08);
      scheduleCap();
    };
    voice.setGain = (v) => { st.gainScale = Math.max(0, v); apply(); };
    voice.update = (listenerPos, listenerVel, sourcePos, sourceVel) => {
      const lp = listenerPos ? v3(listenerPos) : S.listener.pos, lv = listenerVel ? v3(listenerVel) : S.listener.vel;
      const sp = v3(sourcePos), sv = v3(sourceVel);
      const d = [sp[0] - lp[0], sp[1] - lp[1], sp[2] - lp[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      if (!st.interior) {
        st.dist = dist;
        setPannerPos(panner, dist < 0.01 ? [0, 0, -0.01] : d);
        if (dist > 0.5) {
          const u = d.map((x) => x / dist);
          const vl = lv[0] * u[0] + lv[1] * u[1] + lv[2] * u[2];
          const vs = sv[0] * u[0] + sv[1] * u[1] + sv[2] * u[2];
          st.doppler = Math.max(0.6, Math.min(1.6, (SPEED_OF_SOUND + vl) / Math.max(60, SPEED_OF_SOUND + vs)));
        }
      }
      apply(0.08);
      scheduleCap();
    };
    voice.dispose = () => { stop(); S.engines.delete(voice); try { panner.disconnect(); } catch {} scheduleCap(); };
    voice._start = start; voice._stop = stop;
    S.engines.add(voice);
    scheduleCap();
    return voice;
  };

  // Nearest engines win; runs once after the current frame's update() calls.
  let capQueued = false;
  function scheduleCap() {
    if (capQueued) return;
    capQueued = true;
    queueMicrotask(() => {
      capQueued = false;
      const list = [...S.engines].sort((a, b) => score(a) - score(b));
      list.forEach((v, i) => (i < S.voiceCap && v._st.dist < 4000 ? v._start() : v._stop()));
    });
  }
  const score = (v) => (v._st.interior ? -1e9 : v._st.dist - v._st.priority * 1e6);
  S.setVoiceCap = (n) => { S.voiceCap = Math.max(1, n | 0); scheduleCap(); };

  // ---------- continuous beds ----------
  const wind = (() => {
    const src = loop(buf.pink), src2 = loop(buf.white, 0.5);
    const bp = filt('bandpass', 500, 0.6), lp = filt('lowpass', 1500, 0.5), hiss = filt('highpass', 3000, 0.7);
    const gBody = g(0), gHiss = g(0), out = g(1);
    chain(src, bp, lp, gBody, out); chain(src2, hiss, gHiss, out);
    const gust = ctx.createOscillator(), gustG = g(0);
    gust.frequency.value = 0.23; gust.connect(gustG); gustG.connect(gBody.gain); gust.start();
    out.connect(S.buses.sfx);
    return { bp, lp, gBody, gHiss, gustG };
  })();
  S.setWind = (kt, o = {}) => {
    const s = Math.max(0, +kt || 0), n = Math.min(1, s / 140), interior = !!o.interior;
    const body = (interior ? 0.18 : 0.5) * Math.pow(n, 1.6);
    ramp(wind.gBody.gain, body, 0.15);
    ramp(wind.gustG.gain, body * 0.25, 0.3);
    ramp(wind.gHiss.gain, (interior ? 0.015 : 0.09) * n * n, 0.15);
    ramp(wind.bp.frequency, 250 + 1100 * n, 0.2);
    ramp(wind.lp.frequency, interior ? 700 + 500 * n : 1200 + 3500 * n, 0.2);
  };

  // D23/D25: the old reed horn (1.5 kHz saw through a clipper) was the squeal. Now a soft, low two-tone hum that pulses.
  const horn = (() => {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = 440; o2.frequency.value = 554;
    const lp = filt('lowpass', 900, 0.5), out = g(0), pulse = g(0.5), depth = g(0.5);
    lfo.type = 'sine'; lfo.frequency.value = 3;
    lfo.connect(depth); depth.connect(pulse.gain);
    const m2 = g(0.4); o2.connect(m2); m2.connect(lp); o1.connect(lp);
    chain(lp, pulse, out, S.buses.sfx);
    o1.start(); o2.start(); lfo.start();
    return { o1, o2, out };
  })();
  S.setStallHorn = (intensity) => {
    const i = clamp01(intensity === true ? 1 : intensity);
    ramp(horn.out.gain, i > 0.05 ? 0.012 + 0.03 * i : 0, 0.12);
  };

  const roll = (() => {
    const tar = loop(buf.brown), grass = loop(buf.pink), bumps = loop(buf.bumps);
    const tarLp = filt('lowpass', 300, 0.8), grassBp = filt('bandpass', 900, 0.5), bumpLp = filt('lowpass', 160);
    const gTar = g(0), gGrass = g(0), gBump = g(0), out = g(1);
    chain(tar, tarLp, gTar, out); chain(grass, grassBp, gGrass, out); chain(bumps, bumpLp, gBump, out);
    out.connect(S.buses.sfx);
    return { tarLp, grassBp, bumps, gTar, gGrass, gBump };
  })();
  S.setRolling = (speedMs, surface = 'runway', o = {}) => {
    const s = Math.max(0, +speedMs || 0), n = Math.min(1, s / 35), k = o.interior ? 0.6 : 1;
    const hard = surface === 'runway' || surface === 'taxiway' || surface === 'apron';
    const on = s > 0.3 && surface !== 'water' ? 1 : 0;
    ramp(roll.gTar.gain, hard ? 0.35 * n * on * k : 0, 0.08);
    ramp(roll.tarLp.frequency, 120 + 300 * n, 0.1);
    ramp(roll.gGrass.gain, hard ? 0 : 0.16 * Math.sqrt(n) * on * k, 0.08);
    ramp(roll.gBump.gain, (hard ? 0.12 : 0.7) * Math.sqrt(n) * on * k, 0.08);
    ramp(roll.bumps.playbackRate, 0.4 + 1.6 * n, 0.1);
  };

  const flaps = (() => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 180;
    const bp = filt('bandpass', 900, 3), out = g(0), n = loop(buf.white), nb = filt('bandpass', 2400, 4), ng = g(0.25);
    chain(o, bp, out); chain(n, nb, ng, out); out.connect(S.buses.sfx); o.start();
    return { o, out };
  })();
  S.setFlapsMotor = (on) => {
    ramp(flaps.out.gain, on ? 0.08 : 0, 0.04);
    ramp(flaps.o.frequency, on ? 210 : 140, on ? 0.25 : 0.05);
  };

  // ---------- one-shots ----------
  function oneShotOut(o = {}, gain = 1) {
    const out = g(gain);
    if (o.position) {
      const p = makePanner(), sp = v3(o.position), lp = S.listener.pos;
      setPannerPos(p, [sp[0] - lp[0], sp[1] - lp[1], sp[2] - lp[2]]);
      out.connect(p); p.connect(o.bus || S.buses.sfx);
      setTimeout(() => { try { p.disconnect(); } catch {} }, 4000);
    } else out.connect(o.bus || S.buses.sfx);
    return out;
  }
  function burst(b, t, dur, { rate = 1, filter, gain = 1, attack = 0.002, out }) {
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const e = g(0);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filter) { s.connect(filter); filter.connect(e); } else s.connect(e);
    e.connect(out);
    s.start(t, Math.random() * (b.duration - dur - 0.05 > 0 ? b.duration - dur - 0.05 : 0)); s.stop(t + dur + 0.05);
    return s;
  }
  function tone(type, f0, f1, t, dur, gain, out, attack = 0.003) {
    const o = ctx.createOscillator(), e = g(0);
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain, t + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  S.playTouchdown = (intensity = 0.5, o = {}) => {
    const i = clamp01(intensity), t = now() + (o.delay || 0), out = oneShotOut(o, 0.25 + 0.6 * i);
    const dur = 0.12 + 0.45 * i;
    burst(buf.white, t, dur, { filter: filt('bandpass', 1800 + 900 * i, 2.5), gain: 0.8, attack: 0.01, out });
    const sq = tone('sawtooth', 1150 + 300 * i, 950, t, dur * 0.9, 0.12 * i, out, 0.008);
    sq.detune.value = (Math.random() - 0.5) * 80;
    if (i > 0.15) tone('sine', 90, 45, t, 0.18, 0.6 * i, out);
  };
  S.playGearThump = (o = {}) => {
    const t = now() + (o.delay || 0), out = oneShotOut(o, o.gain ?? 0.7);
    tone('sine', 95, 38, t, 0.22, 0.9, out);
    burst(buf.white, t, 0.06, { filter: filt('lowpass', 1800), gain: 0.35, out });
    burst(buf.white, t + 0.03, 0.05, { filter: filt('bandpass', 3200, 6), gain: 0.15, out });
  };
  S.playCrash = (intensity = 1, o = {}) => {
    const i = clamp01(intensity), t = now() + (o.delay || 0), out = oneShotOut(o, 0.4 + 0.6 * i);
    tone('sine', 70, 28, t, 0.9, 1, out);
    burst(buf.brown, t, 1.4 * (0.5 + i), { filter: filt('lowpass', 900), gain: 1, out });
    for (let k = 0; k < 6 + i * 8; k++) {
      const tk = t + Math.random() * 0.6 * (0.4 + i);
      burst(buf.white, tk, 0.05 + Math.random() * 0.15, { filter: filt('bandpass', 600 + Math.random() * 3500, 3), gain: 0.5 + Math.random() * 0.5, out });
    }
    for (const f of [523, 1187, 1873, 2649]) tone('triangle', f * (0.95 + Math.random() * 0.1), f * 0.97, t + 0.02, 0.6 + Math.random() * 0.6, 0.06, out);
  };
  S.playBoing = (intensity = 0.7, o = {}) => {
    const i = clamp01(intensity), t = now() + (o.delay || 0), out = oneShotOut(o, 0.35 + 0.45 * i);
    const dur = 0.45 + 0.4 * i, base = 110 + 50 * (1 - i);
    const osc = ctx.createOscillator(), e = g(0), lfo = ctx.createOscillator(), lg = g(0);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t); osc.frequency.exponentialRampToValueAtTime(base * 3.2, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(base * 2.1, t + dur);
    lfo.frequency.setValueAtTime(18, t); lfo.frequency.linearRampToValueAtTime(9, t + dur);
    lg.gain.setValueAtTime(base * 0.9, t); lg.gain.exponentialRampToValueAtTime(2, t + dur);
    lfo.connect(lg); lg.connect(osc.frequency);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.9, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = filt('lowpass', 2200, 4);
    chain(osc, lp, e, out);
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    tone('sine', 70, 40, t, 0.15, 0.5, out);
  };
  S.playUI = (kind = 'click') => {
    const t = now(), out = oneShotOut({}, 0.5);
    if (kind === 'confirm') { tone('sine', 660, 660, t, 0.12, 0.4, out); tone('sine', 990, 990, t + 0.08, 0.2, 0.35, out); }
    else if (kind === 'back') { tone('sine', 700, 700, t, 0.1, 0.35, out); tone('sine', 470, 470, t + 0.07, 0.16, 0.3, out); }
    else if (kind === 'error') { tone('square', 220, 200, t, 0.12, 0.12, out); tone('square', 180, 170, t + 0.12, 0.18, 0.12, out); }
    else if (kind === 'toggle') tone('triangle', 1200, 900, t, 0.05, 0.4, out);
    else { tone('triangle', 1800, 1200, t, 0.03, 0.45, out); burst(buf.white, t, 0.015, { filter: filt('highpass', 4000), gain: 0.2, out }); }
  };
  S.playSquelch = (kind = 'on', o = {}) => {
    const t = (o.at ?? now()), out = oneShotOut({ bus: S.buses.radio }, 0.6);
    const bp = filt('bandpass', 1900, 0.8);
    if (kind === 'on') {
      tone('square', 2400, 2400, t, 0.012, 0.2, out, 0.001);
      burst(buf.white, t + 0.005, 0.07, { filter: bp, gain: 0.35, out });
    } else {
      burst(buf.white, t, 0.17, { filter: bp, gain: 0.5, attack: 0.005, out });
      tone('square', 1800, 1800, t + 0.16, 0.012, 0.2, out, 0.001);
    }
    return t + (kind === 'on' ? 0.08 : 0.19);
  };

  // ---------- radio ----------
  const rx = (() => {
    const inp = g(1), hp = filt('highpass', 300, 0.9), hp2 = filt('highpass', 300, 0.9), lp = filt('lowpass', 3400, 0.9), lp2 = filt('lowpass', 3400, 0.9);
    const pres = filt('peaking', 1800, 1, 5), drive = g(2.2), shp = ctx.createWaveShaper(), post = g(0.55);
    shp.curve = softClipCurve(2.2); shp.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.12; comp.knee.value = 6;
    chain(inp, hp, hp2, pres, drive, shp, lp, lp2, comp, post, S.buses.radio);
    const stat = loop(buf.white), sbp = filt('bandpass', 2200, 0.6), sg = g(0);
    chain(stat, sbp, sg, S.buses.radio);
    return { inp, sg };
  })();
  const radioEvents = (typeof EventTarget !== 'undefined') ? new EventTarget() : null;
  S.radioEvents = radioEvents;
  const cache = new Map();
  S.loadBuffer = (url) => {
    if (!cache.has(url)) {
      const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); })
        .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
      p.catch(() => cache.delete(url));
      cache.set(url, p);
    }
    return cache.get(url);
  };
  S.preload = (urls) => Promise.allSettled([].concat(urls).map(S.loadBuffer));

  const queue = [];
  let current = null, seq = 0;
  const duckTo = (v) => { ramp(S.duck.sfx.gain, v, 0.12); ramp(S.duck.music.gain, v, 0.12); };
  const emit = (type, tx) => radioEvents?.dispatchEvent(Object.assign(new Event(type), { detail: tx.info }));

  S.playRadio = (src, o = {}) => new Promise((resolve) => {
    const tx = {
      id: ++seq, src, o, resolve, priority: o.priority || 0,
      info: { id: seq, speaker: o.speaker || 'pilot', voiceId: o.voiceId || null, text: o.text || '', channel: o.channel || null },
    };
    tx.ready = resolveSource(tx);
    if (current && tx.priority > current.priority) {
      if (o.interrupt === 'queue') queue.unshift(tx); else { queue.unshift(tx); stepOn(current); }
    } else {
      let i = queue.findIndex((q) => q.priority < tx.priority);
      if (i < 0) i = queue.length;
      queue.splice(i, 0, tx);
    }
    pump();
  });
  function resolveSource(tx) {
    const s = tx.src;
    if (s && typeof s === 'object' && 'getChannelData' in s) return Promise.resolve(s);
    if (typeof s === 'string') return S.loadBuffer(s).catch(() => null);
    return Promise.resolve(null);
  }
  S.stopRadio = () => {
    for (const q of queue.splice(0)) { q.resolve({ id: q.id, played: false, cancelled: true }); }
    if (current) finish(current, { interrupted: true }, true);
  };
  S.radioBusy = () => !!current || queue.length > 0;

  function stepOn(tx) {
    if (!tx.src0) return;
    const t = now();
    const het = ctx.createOscillator(), hg = g(0);
    het.type = 'sawtooth'; het.frequency.setValueAtTime(900, t); het.frequency.linearRampToValueAtTime(1500, t + 0.45);
    hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.1, t + 0.05); hg.gain.linearRampToValueAtTime(0, t + 0.5);
    het.connect(hg); hg.connect(rx.inp); het.start(t); het.stop(t + 0.55);
    tx.vg.gain.setTargetAtTime(0, t + 0.35, 0.05);
    tx.stepTimer = setTimeout(() => finish(tx, { interrupted: true, steppedOn: true }), 500);
  }
  async function pump() {
    if (current || !queue.length) return;
    const tx = queue.shift();
    current = tx;
    const b = await tx.ready;
    if (current !== tx || tx.done) return;
    const tStart = Math.max(now(), tx.o.at || 0) + 0.02;
    duckTo(0.65);
    ramp(rx.sg.gain, 0.012, 0.05);
    const tVoice = S.playSquelch('on', { at: tStart });
    const vg = g(tx.o.gain ?? 1); vg.connect(rx.inp); tx.vg = vg;
    let dur;
    if (b) {
      const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = tx.o.rate || 1; s.connect(vg);
      s.start(tVoice); tx.src0 = s;
      dur = b.duration / (tx.o.rate || 1);
    } else {
      dur = tx.o.duration || Math.max(1, (tx.o.text || '').length * 0.06);
      if (tx.o.tone === true) {
        const o = ctx.createOscillator(); o.frequency.value = 800; o.connect(vg); o.start(tVoice); o.stop(tVoice + dur); tx.src0 = o;
        vg.gain.value = 0.15;
      } else tx.src0 = { stop() {} };
    }
    tx.tEnd = tVoice + dur;
    tx.info.duration = dur; tx.info.missing = !b;
    const lead = Math.max(0, (tVoice - now()) * 1000);
    tx.startTimer = setTimeout(() => { tx.o.onStart?.(tx.info); emit('start', tx); }, lead);
    tx.endTimer = setTimeout(() => finish(tx, {}), lead + dur * 1000);
  }
  function finish(tx, res, hardStop) {
    if (tx.done) return;
    tx.done = true;
    clearTimeout(tx.startTimer); clearTimeout(tx.endTimer); clearTimeout(tx.stepTimer);
    if (hardStop || res.interrupted) { try { tx.src0?.stop(); } catch {} }
    const tOff = res.steppedOn ? now() : S.playSquelch('off');
    setTimeout(() => {
      if (current === tx) current = null;
      if (!queue.length) { duckTo(1); ramp(rx.sg.gain, 0, 0.05); }
      try { tx.vg?.disconnect(); } catch {}
      tx.o.onEnd?.({ ...tx.info, ...res });
      tx.info = { ...tx.info, ...res };
      emit('end', tx);
      tx.resolve({ ...tx.info, played: true, ...res });
      setTimeout(pump, tx.o.gap ?? 250);
    }, Math.max(0, (tOff - now()) * 1000));
  }

  // ---------- music ----------
  let music = null;
  S.playMusic = async (src, o = {}) => {
    const b = typeof src === 'string' ? await S.loadBuffer(src).catch(() => null) : src;
    S.stopMusic(o.fade ?? 1.5);
    if (!b) return null;
    const s = ctx.createBufferSource(), e = g(0);
    s.buffer = b; s.loop = o.loop !== false; s.connect(e); e.connect(S.buses.music);
    e.gain.linearRampToValueAtTime(o.gain ?? 1, now() + (o.fade ?? 1.5));
    s.start();
    music = { s, e };
    return s;
  };
  S.stopMusic = (fade = 1) => {
    if (!music) return;
    const m = music; music = null;
    m.e.gain.cancelScheduledValues(now()); m.e.gain.setValueAtTime(m.e.gain.value, now());
    m.e.gain.linearRampToValueAtTime(0, now() + fade);
    try { m.s.stop(now() + fade + 0.05); } catch {}
  };

  S.setVolumes = (v = {}) => {
    const n = (x) => clamp01(x > 1 ? x / 100 : x);
    if (v.master != null) ramp(S.master.gain, n(v.master) * 0.9, 0.03);
    if (v.sfx != null) ramp(S.buses.sfx.gain, n(v.sfx), 0.03);
    if (v.voice != null) ramp(S.buses.radio.gain, n(v.voice), 0.03);
    if (v.radio != null) ramp(S.buses.radio.gain, n(v.radio), 0.03);
    if (v.music != null) ramp(S.buses.music.gain, n(v.music) * 0.6, 0.03);
  };
  return S;
}

// ---------- live singleton + mobile unlock ----------
export function initAudio(opts = {}) {
  if (sys) return sys;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  // iOS mutes Web Audio under the silent switch unless the session is 'playback' (Safari 16.4+); must precede the context.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  const ctx = new AC({ latencyHint: 'interactive' });
  sys = createAudioSystem(ctx, opts);
  armUnlock();
  return sys;
}

// Touch pointerdown/touchstart are NOT user activation on Android; listeners stay for the page lifetime
// because iOS re-suspends after an app switch and only resumes inside a gesture.
function armUnlock() {
  if (unlockArmed || typeof document === 'undefined') return;
  unlockArmed = true;
  const kick = () => unlock();
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown', 'mousedown']) document.addEventListener(ev, kick, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!sys) return;
    if (document.visibilityState === 'hidden') sys.ctx.suspend?.().catch(() => {});
    else if (sys.ctx.state !== 'running' && sysUnlocked) sys.ctx.resume().catch(() => {});
  });
  globalThis.addEventListener?.('pageshow', () => { if (sys && sysUnlocked) sys.ctx.resume().catch(() => {}); });
}
let sysUnlocked = false, silentEl = null;
export function unlock() {
  const s = initAudio();
  if (!s) return Promise.resolve(false);
  const ctx = s.ctx;
  if (ctx.state === 'running' && sysUnlocked) return Promise.resolve(true);
  try { const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch {}
  if (!navigator.audioSession && /iP(hone|ad|od)/.test(navigator.userAgent) && !silentEl) {
    try {
      silentEl = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      silentEl.loop = true; silentEl.dataset.silent = '1'; silentEl.play().catch(() => {});
    } catch {}
  }
  return ctx.resume().then(() => {
    if (ctx.state !== 'running') return false;
    if (!sysUnlocked) { sysUnlocked = true; unlockCbs.splice(0).forEach((f) => { try { f(s); } catch {} }); }
    return true;
  }).catch(() => false);
}
export const isUnlocked = () => !!sys && sysUnlocked && sys.ctx.state === 'running';
export function onUnlock(cb) { if (isUnlocked()) cb(sys); else unlockCbs.push(cb); }
export const getAudio = () => sys || initAudio();

const call = (name) => (...a) => { const s = getAudio(); return s ? s[name](...a) : undefined; };
export const setVolumes = call('setVolumes');
export const setListener = call('setListener');
export const createEngineVoice = call('createEngineVoice');
export const setVoiceCap = call('setVoiceCap');
export const setWind = call('setWind');
export const setStallHorn = call('setStallHorn');
export const setRolling = call('setRolling');
export const setFlapsMotor = call('setFlapsMotor');
export const playTouchdown = call('playTouchdown');
export const playGearThump = call('playGearThump');
export const playCrash = call('playCrash');
export const playBoing = call('playBoing');
export const playUI = call('playUI');
export const playSquelch = call('playSquelch');
export const playRadio = (src, o) => { const s = getAudio(); return s ? s.playRadio(src, o) : Promise.resolve({ played: false }); };
export const stopRadio = call('stopRadio');
export const radioBusy = () => !!sys && sys.radioBusy();
export const loadBuffer = (u) => { const s = getAudio(); return s ? s.loadBuffer(u) : Promise.reject(new Error('no audio')); };
export const preload = (u) => { const s = getAudio(); return s ? s.preload(u) : Promise.resolve([]); };
export const playMusic = call('playMusic');
export const stopMusic = call('stopMusic');
export const onRadio = (type, fn) => { const s = getAudio(); s?.radioEvents?.addEventListener(type, (e) => fn(e.detail)); };

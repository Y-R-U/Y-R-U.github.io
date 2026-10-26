// Jet and turboprop engine voices (D33): turbofan (Royal Jumbo), turboprop (Hercules), fighter (F-35).
// Same contract as the piston voice so the voice cap, listener and dispose all work unchanged.
import { JET_BASE_N1, fanBuffer, buzzBuffer, turbopropBuffer, turbineWhineBuffer, howlBuffer, afterburnerBuffer, boomBuffer } from './synth.js';

const SPEED_OF_SOUND = 343;
const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// idle/max are N1 % as JETCORE reports it (ac.n1 × 100; turboprop n1 = power, idle 30). spool = seconds time-constant used by setThrottle (setN1 follows directly).
// ref = panner refDistance (m), air = distance scale of the air-absorption lowpass, cull = silent beyond (m).
export const JET_KINDS = {
  turbofan:  { idle: 22, max: 100, spool: 2.2, ref: 30, air: 1300, cull: 9000, inLp: 500, inGain: 0.32 },
  turboprop: { idle: 30, max: 100, spool: 0.9, ref: 25, air: 1100, cull: 7000, inLp: 700, inGain: 0.75 },
  fighter:   { idle: 30, max: 100, spool: 0.7, ref: 30, air: 1300, cull: 9000, inLp: 450, inGain: 0.45 },
};

export function jetBuffers(S) {
  if (!S._jetBuf) {
    const c = S.ctx;
    S._jetBuf = {
      fan: fanBuffer(c), buzz: buzzBuffer(c), prop: turbopropBuffer(c), whine: turbineWhineBuffer(c),
      howl: howlBuffer(c), ab: afterburnerBuffer(c),
    };
  }
  return S._jetBuf;
}

export function createJetVoice(S, H, o = {}) {
  const { g, filt, loop, chain, ramp, now, makePanner, setPannerPos, scheduleCap, v3 } = H;
  const kind = o.kind, K = JET_KINDS[kind];
  const B = jetBuffers(S), pink = S.buffers.pink;
  const out = g(0), panner = makePanner(), mix = g(1), muffle = filt('lowpass', 18000, 0.6);
  panner.refDistance = K.ref;
  chain(mix, muffle, out, panner, S.buses.sfx);

  // layers: name -> { b: buffer, g: gain, inp: node the looping source feeds, src }
  const L = {};
  const layer = (name, b, filter = null, dest = mix) => {
    const gn = g(0);
    if (filter) filter.connect(gn);
    gn.connect(dest);
    L[name] = { b, g: gn, inp: filter || gn, src: null };
  };
  const F = {};
  if (kind === 'turbofan') {
    F.rumbleLp = filt('lowpass', 300, 0.6);
    layer('rumble', pink, F.rumbleLp); layer('fan', B.fan); layer('buzz', B.buzz);
  } else if (kind === 'turboprop') {
    F.loadLp = filt('lowpass', 800, 0.8); F.loadLp.connect(mix);
    layer('prop', B.prop, null, F.loadLp); layer('rumble', pink, null, F.loadLp); layer('whine', B.whine);
  } else {
    F.roarLp = filt('lowpass', 500, 0.6);
    layer('roar', pink, F.roarLp); layer('howl', B.howl); layer('ab', B.ab);
  }
  const names = Object.keys(L);

  const st = {
    kind, n1: 0, target: 0, spoolTau: 0, fresh: true, tPrev: now(), load: null, ab: 0, lift: 0, interior: false, dist: 0, doppler: 1, front: 0,
    fwd: null, active: false, gainScale: o.gain ?? 1, priority: o.priority || 0, cull: K.cull, engines: o.engines || 0,
  };
  const voice = { _st: st, kind };

  function start() {
    if (st.active) return;
    st.active = true;
    for (const k of names) { const l = L[k]; l.src = loop(l.b, 1); l.src.connect(l.inp); }
    if (lift) lift.src = startLift();
    apply(0.02);
  }
  function stop() {
    if (!st.active) return;
    st.active = false;
    out.gain.cancelScheduledValues(now()); out.gain.setValueAtTime(out.gain.value, now()); out.gain.linearRampToValueAtTime(0, now() + 0.08);
    for (const k of names) { const s = L[k].src; L[k].src = null; try { s.stop(now() + 0.1); } catch {} }
    if (lift?.src) { try { lift.src.stop(now() + 0.1); } catch {} lift.src = null; }
    out.gain._kz = undefined;
  }

  // STOVL lift fan: created on the first non-zero setLiftFan (3 nodes), silent and absent until then.
  let lift = null;
  function startLift() { const s = loop(pink, 0.8); s.connect(lift.bp); return s; }
  function ensureLift() {
    if (lift || kind !== 'fighter') return;
    lift = { bp: filt('bandpass', 600, 0.7), g: g(0), src: null };
    chain(lift.bp, lift.g, mix);
    if (st.active) lift.src = startLift();
  }

  const r = (k, v, tau) => { const l = L[k]; if (l?.src) ramp(l.src.playbackRate, Math.max(0.05, v), tau); };
  function apply(tau = 0.06) {
    // spool: setThrottle eases n1 toward its target on the audio clock (frozen while suspended); setN1 sets it directly
    const t = now(), dt = Math.max(0, Math.min(0.5, t - st.tPrev));
    st.tPrev = t;
    st.n1 = st.spoolTau > 0 ? st.n1 + (st.target - st.n1) * (1 - Math.exp(-dt / st.spoolTau)) : st.target;
    if (!st.active) return;
    const n1 = st.n1, n = clamp01((n1 - K.idle) / (K.max - K.idle)), on = n1 > 5 ? 1 : 0;
    const load = st.load == null ? n : st.load, dop = st.doppler;
    const fr = st.interior ? 0.5 : (st.front + 1) / 2;   // 1 = listener ahead of the nose, 0 = behind the tail
    const spin = clamp01(n1 / Math.max(1, K.idle));      // run-up below idle (start / shutdown)
    let level;
    if (kind === 'turbofan') {
      const rr = (n1 / JET_BASE_N1) * dop;
      r('fan', rr, tau); r('buzz', rr, tau); r('rumble', (0.7 + 0.5 * n) * dop, tau);
      ramp(F.rumbleLp.frequency, (220 + 1900 * n ** 1.5) * dop, tau);
      ramp(L.rumble.g.gain, (0.12 + 0.62 * n ** 1.3) * (1.2 - 0.5 * fr) * spin, tau);
      ramp(L.fan.g.gain, (0.18 + 0.3 * n) * (0.55 + 0.7 * fr) * spin, tau);
      ramp(L.buzz.g.gain, st.interior ? 0.03 * smooth(0.75, 0.95, n) : 0.42 * smooth(0.72, 0.95, n) * fr ** 1.5, tau);
      level = st.interior ? 0.75 + 0.25 * n : 0.5 + 0.5 * n;
    } else if (kind === 'turboprop') {
      const prop = (0.72 + 0.28 * smooth(0, 0.35, n)) * Math.min(1, spin);
      r('prop', prop * dop, tau); r('whine', (0.88 + 0.16 * n) * Math.max(0.3, spin) * dop, tau); r('rumble', (0.8 + 0.3 * load) * dop, tau);
      ramp(F.loadLp.frequency, (450 + 2600 * load) * dop, tau);
      ramp(L.prop.g.gain, (0.45 + 0.65 * load) * spin, tau);
      ramp(L.rumble.g.gain, (0.08 + 0.35 * load) * spin, tau);
      ramp(L.whine.g.gain, (0.1 + 0.12 * n) * (0.7 + 0.5 * fr) * Math.max(0.3, spin), tau);
      level = 0.55 + 0.35 * load + 0.1 * n;
    } else {
      const ab = st.ab;
      r('howl', (n1 / JET_BASE_N1) * dop, tau); r('roar', (0.75 + 0.45 * n + 0.1 * ab) * dop, tau); r('ab', (0.9 + 0.2 * ab) * dop, tau);
      ramp(F.roarLp.frequency, (280 + 3600 * n ** 1.4 + 4500 * ab) * dop, tau);
      ramp(L.roar.g.gain, (0.1 + 0.62 * n ** 1.5) * (1 - 0.1 * ab) * (1.2 - 0.5 * fr) * spin, tau);
      ramp(L.howl.g.gain, 0.3 * (1 - 0.65 * n) * (0.5 + 0.7 * fr) * spin, tau);
      ramp(L.ab.g.gain, (st.interior ? 0.8 : 0.92) * ab * (1.15 - 0.3 * fr), tau);
      if (lift) {
        if (lift.src) ramp(lift.src.playbackRate, (0.7 + 0.5 * st.lift) * dop, tau);
        ramp(lift.bp.frequency, (450 + 700 * st.lift) * dop, tau);
        ramp(lift.g.gain, 0.9 * st.lift, tau);
      }
      level = (0.45 + 0.55 * n + 0.2 * st.lift) * 0.8;
    }
    level *= on * st.gainScale;
    if (st.interior) {
      ramp(muffle.frequency, K.inLp, 0.1); ramp(out.gain, level * K.inGain, tau);
    } else {
      ramp(muffle.frequency, Math.max(600, 18000 * Math.exp(-st.dist / K.air)), 0.1);
      ramp(out.gain, level, tau);
    }
  }

  const n1Of = (v) => { v = Math.max(0, +v || 0); return v > 0 && v <= 1.5 ? v * 100 : v; };
  voice.setN1 = (pct, loadFrac) => {
    st.target = n1Of(pct); st.spoolTau = 0; st.fresh = false;
    st.load = loadFrac == null ? null : clamp01(loadFrac);
    apply();
  };
  voice.setRPM = voice.setN1;                       // for jets the "rpm" is N1 %
  voice.setThrottle = (thr, o2 = {}) => {
    const t = clamp01(thr);
    st.target = o2.off ? 0 : K.idle + t * (K.max - K.idle);
    st.spoolTau = o2.spool ?? K.spool; st.load = t;
    if (st.fresh || o2.snap) { st.n1 = st.target; st.fresh = false; }   // a new voice starts at its first setting, not from off
    apply();
  };
  voice.setAfterburner = (v) => { if (kind === 'fighter') { st.ab = clamp01(v === true ? 1 : v); apply(); } };
  voice.setLiftFan = (v) => { if (kind !== 'fighter') return; st.lift = clamp01(v === true ? 1 : v); if (st.lift > 0) ensureLift(); apply(); };
  voice.setForward = (f) => { st.fwd = f ? v3(f) : null; };
  voice.getN1 = () => st.n1;
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
        st.doppler = Math.max(0.5, Math.min(2, (SPEED_OF_SOUND + vl) / Math.max(40, SPEED_OF_SOUND + vs)));
        // nose direction: setForward() if given, else the velocity when moving
        const sp2 = Math.hypot(sv[0], sv[1], sv[2]);
        const f = st.fwd || (sp2 > 3 ? sv.map((x) => x / sp2) : null);
        if (f) st.front = -(f[0] * u[0] + f[1] * u[1] + f[2] * u[2]);
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
}

// Fast flyby past the listener: doppler-swept roar, crackling tail, and a double sonic boom when intensity >= 0.95
// (or o.boom). intensity 0..1 ~ speed. o: { position, dir, delay, boom, gain }. ~4 s long.
export function playFlyby(S, H, intensity = 1, o = {}) {
  const { g, filt, now, makePanner, setPannerPos, v3 } = H;
  const ctx = S.ctx, i = clamp01(intensity), t = now() + (o.delay || 0), tp = t + 1.4, end = t + 4.2;
  // o.position = closest point of approach (world), o.dir = flight direction; the panner travels along it
  const out = g((o.gain ?? 1) * (0.45 + 0.55 * i));
  if (o.position) {
    const p = makePanner(), lp = S.listener.pos, P = v3(o.position), D = v3(o.dir || [1, 0, 0]);
    const dl = Math.hypot(D[0], D[1], D[2]) || 1, at = (k) => [0, 1, 2].map((j) => P[j] - lp[j] + (D[j] / dl) * k);
    p.refDistance = 40;
    setPannerPos(p, at(-220));
    if (p.positionX) [p.positionX, p.positionY, p.positionZ].forEach((ax, j) => {
      ax.setValueAtTime(at(-220)[j], t); ax.linearRampToValueAtTime(at(0)[j], tp); ax.linearRampToValueAtTime(at(330)[j], end);
    });
    out.connect(p); p.connect(S.buses.sfx);
    setTimeout(() => { try { p.disconnect(); } catch {} }, (end - now() + 0.5) * 1000);
  } else out.connect(S.buses.sfx);
  const B = jetBuffers(S);
  const src = (b, rate) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; return s; };
  const env = (peakT, peak, rise, fall) => {
    const e = g(0);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(peak * 0.15, peakT - rise * 0.4);
    e.gain.exponentialRampToValueAtTime(peak, peakT); e.gain.exponentialRampToValueAtTime(0.0001, Math.min(end, peakT + fall));
    return e;
  };
  // doppler sweep: high and bright approaching, dropping hard as it passes
  const hi = 1 + 0.6 * i, lo = 1 / (1 + 0.5 * i);
  const roar = src(S.buffers.pink, hi), lp = filt('lowpass', 2500, 0.7), eR = env(tp, 1, 1.2, 2.6);
  roar.playbackRate.setValueAtTime(hi, t); roar.playbackRate.setValueAtTime(hi, tp - 0.25);
  roar.playbackRate.exponentialRampToValueAtTime(lo, tp + 0.35);
  lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(9000, tp); lp.frequency.exponentialRampToValueAtTime(900, end);
  roar.connect(lp); lp.connect(eR); eR.connect(out);
  const howl = src(B.howl, 2.4 * hi), eH = env(tp - 0.1, 0.25, 0.9, 0.5);
  howl.playbackRate.setValueAtTime(2.4 * hi, tp - 0.3); howl.playbackRate.exponentialRampToValueAtTime(2.4 * lo, tp + 0.3);
  howl.connect(eH); eH.connect(out);
  const ab = src(B.ab, 0.85), eA = env(tp + 0.4, 0.7 * i, 0.6, 3);
  ab.connect(eA); eA.connect(out);
  const all = [roar, howl, ab];
  for (const s of all) { s.start(t, Math.random()); s.stop(end + 0.05); }
  if (o.boom ?? i >= 0.95) {
    if (!S._jetBoom) S._jetBoom = boomBuffer(ctx);
    const b = ctx.createBufferSource(), bg = g(1.0);
    b.buffer = S._jetBoom; b.connect(bg); bg.connect(out); b.start(tp - 0.05);
  }
  return end - now();
}

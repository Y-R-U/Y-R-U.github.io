// Offline checks for the jet voices (JETSOUND). Loaded by tools/sounds.html?test=1 → window.__jetTest.
// Measured on the raw mix (limiter bypassed) so headroom problems can't hide behind it.
// falsify: 'loud' (voices ×6 → peak check must fail), 'flat' (N1 pinned at 60 % → rise checks must fail),
// 'nodoppler' (AI flyby sourceVel zeroed → doppler check must fail).
import { createAudioSystem } from './index.js';

const SR = 48000;

// ---- analysis ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// Mean spectral centroid (Hz) and the fraction of energy in [lo, hi] Hz, over 4096-sample Hann frames.
function spectrum(x, lo = 0, hi = 0) {
  const N = 4096, w = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let num = 0, den = 0, band = 0;
  for (let s = 0; s + N <= x.length; s += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * w[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k], f = (k * SR) / N;
      num += f * p; den += p; if (f >= lo && f <= hi) band += p;
    }
  }
  return { centroid: den ? num / den : 0, band: den ? band / den : 0 };
}
// BS.1770 K-weighting (48 kHz coefficients), ungated: "LUFS-ish".
function lufs(chs) {
  const kw = (x) => {
    const st = (b, a, inp) => { const o = new Float32Array(inp.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < inp.length; i++) { const y = b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = inp[i]; y2 = y1; y1 = y; o[i] = y; } return o; };
    const s1 = st([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x);
    return st([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], s1);
  };
  let sum = 0;
  for (const c of chs) { const y = kw(c); let m = 0; for (let i = 0; i < y.length; i++) m += y[i] * y[i]; sum += m / y.length; }
  return -0.691 + 10 * Math.log10(sum || 1e-12);
}
const db = (v) => +(20 * Math.log10(v || 1e-9)).toFixed(1);
function measure(buf, from = 1, to = buf.duration, band = [0, 0]) {
  const a = Math.round(from * SR), b = Math.round(to * SR);
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  let peak = 0, sum = 0, nan = 0, m3 = 0;
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
    peak = Math.max(peak, Math.abs(l), Math.abs(r)); sum += l * l + r * r; mono[i] = (l + r) / 2;
  }
  const rms = Math.sqrt(sum / (2 * L.length)), sp = spectrum(mono, band[0], band[1]);
  // waveform skewness of the high-passed mono: jet crackle is defined by strongly positive pressure skewness
  let hp = 0, prev = 0, s2 = 0; const yy = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) { hp = 0.95 * (hp + mono[i] - prev); prev = mono[i]; yy[i] = hp; s2 += hp * hp; }
  s2 /= mono.length; for (let i = 0; i < yy.length; i++) m3 += yy[i] ** 3; m3 /= yy.length;
  return { peak: +peak.toFixed(3), peakDb: db(peak), rmsDb: db(rms), lufs: +lufs([L, R]).toFixed(1), crestDb: +(db(peak) - db(rms)).toFixed(1),
    centroid: Math.round(sp.centroid), band: +sp.band.toFixed(3), skew: +(m3 / (s2 ** 1.5 || 1)).toFixed(2), nan };
}
// Envelope modulation depth of the 40–400 Hz band in 200 ms windows (std/mean): the turboprop beat.
function beatDepth(buf, from, to) {
  const x = buf.getChannelData(0).slice(Math.round(from * SR), Math.round(to * SR));
  let lp = 0, hp = 0; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { lp += 0.05 * (x[i] - lp); hp += 0.005 * (lp - hp); y[i] = lp - hp; }
  const W = Math.round(0.2 * SR), env = [];   // 200 ms: averages out blade-pass/firing pulses, keeps the slow beat
  for (let s = 0; s + W <= y.length; s += W) { let m = 0; for (let i = 0; i < W; i++) m += y[s + i] * y[s + i]; env.push(Math.sqrt(m / W)); }
  const mean = env.reduce((a, b) => a + b, 0) / env.length, sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length);
  return +(sd / mean).toFixed(3);
}

// ---- rendering ----
function countNodes(ctx) {
  const c = { n: 0 };
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!/^create(?!Buffer$|PeriodicWave$)/.test(k) || typeof ctx[k] !== 'function') continue;
    const f = ctx[k].bind(ctx);
    ctx[k] = (...a) => { c.n++; return f(...a); };
  }
  return c;
}
async function render(seconds, setup, { frames = null, raw = true } = {}) {
  const oc = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const S = createAudioSystem(oc);
  if (raw) { S.master.disconnect(); S.master.connect(oc.destination); }
  const step = await setup(S, oc);
  await new Promise((r) => setTimeout(r, 0));
  if (frames && step) for (let t = frames; t < seconds; t += frames) oc.suspend(t).then(() => { step(t); return new Promise((r) => setTimeout(r, 0)).then(() => oc.resume()); });
  return oc.startRendering();
}

const LST = [0, 2, 0];
// Listener 25 m from the aircraft; ahead of its nose (front) or behind its tail (rear). Aircraft points -Z.
function jet(kind, { n1 = null, thr = null, ab = 0, lift = 0, inside = false, rear = false, gain = 1, falsify } = {}) {
  return (S) => {
    const v = S.createEngineVoice({ kind, gain: falsify === 'loud' ? gain * 6 : gain });
    v.setForward([0, 0, -1]);
    const p = falsify === 'flat' ? 60 : n1;
    if (p != null) v.setN1(p, thr ?? undefined); else v.setThrottle(thr);
    if (ab) v.setAfterburner(ab);
    if (lift) v.setLiftFan(lift);
    v.setInterior(inside);
    if (!inside) v.update(LST, [0, 0, 0], [0, 2, rear ? -25 : 25], [0, 0, 0]);
    return null;
  };
}
const piston = (t) => (S) => { const v = S.createEngineVoice(); v.setThrottle(t); v.update([0, 2, 12], [0, 0, 0], [0, 0, 0], [0, 0, 0]); };

export async function runJetTest(falsify = '') {
  const R = { falsify, scen: {}, checks: [], nodes: {}, perf: {} };
  const scen = {
    pistonIdle: piston(0), pistonFull: piston(1),
    fanIdleFront: jet('turbofan', { n1: 22, falsify }), fanMidFront: jet('turbofan', { n1: 60, falsify }),
    fanToFront: jet('turbofan', { n1: 100, falsify }), fanToRear: jet('turbofan', { n1: 100, rear: true, falsify }),
    fanToInside: jet('turbofan', { n1: 100, inside: true, falsify }), fanIdleInside: jet('turbofan', { n1: 22, inside: true, falsify }),
    propIdle: jet('turboprop', { n1: 30, thr: 0, falsify }), propFull: jet('turboprop', { n1: 100, thr: 1, falsify }),
    propFullInside: jet('turboprop', { n1: 100, thr: 1, inside: true, falsify }),
    f35Idle: jet('fighter', { n1: 30, falsify }), f35Mil: jet('fighter', { n1: 100, rear: true, falsify }), f35MilFront: jet('fighter', { n1: 100, falsify }),
    f35Ab: jet('fighter', { n1: 100, ab: 1, rear: true, falsify }), f35AbInside: jet('fighter', { n1: 100, ab: 1, inside: true, falsify }),
    f35LiftFan: jet('fighter', { n1: 90, lift: 1, falsify }),
  };
  for (const [name, fn] of Object.entries(scen)) R.scen[name] = measure(await render(3, fn), 1, 3, [250, 2500]);
  // the turboprop beat: 4 s window
  R.scen.propFull.beat = beatDepth(await render(9, scen.propFull), 1, 9);
  R.scen.pistonFull.beat = beatDepth(await render(9, scen.pistonFull), 1, 9);

  // flyby one-shot (limiter on, as heard)
  const fb = await render(5, (S) => { S.playFlyby(1, { position: [0, 20, -60] }); }, { raw: false });
  R.scen.flyby = { ...measure(fb, 0, 5), boomWindowPeakDb: measure(fb, 1.3, 1.8).peakDb, leadInPeakDb: measure(fb, 0, 0.5).peakDb };

  // AI F-35 passing at 150 m/s, 60 m abeam: per-frame update() via offline suspends. Doppler → howl higher approaching.
  const fly = await render(6, (S) => {
    const v = S.createEngineVoice({ kind: 'fighter', gain: 0.8 });
    v.setN1(85); v.setForward([0, 1, 0]); let x = -450;     // nose up: directivity equal both sides, only doppler differs
    const step = (t) => { x = -450 + 150 * t; v.update([0, 0, 0], [0, 0, 0], [x, 30, -60], falsify === 'nodoppler' ? [0, 0, 0] : [150, 0, 0]); };
    step(0);
    return step;
  }, { frames: 0.05 });
  const appr = measure(fly, 0.5, 2.0), close = measure(fly, 2.6, 3.4), rec = measure(fly, 4.0, 5.5);
  R.scen.aiFlyby = { approachCentroid: appr.centroid, recedeCentroid: rec.centroid, approachRms: appr.rmsDb, closeRms: close.rmsDb, recedeRms: rec.rmsDb, peakDb: close.peakDb };

  // node counts per voice (persistent nodes while sounding) + flyby transient
  for (const kind of ['piston', 'turbofan', 'turboprop', 'fighter']) {
    const oc = new OfflineAudioContext(2, SR, SR), S = createAudioSystem(oc);
    if (kind !== 'piston') S.createEngineVoice({ kind }).dispose();      // build the shared buffers first
    const c = countNodes(oc);
    const v = S.createEngineVoice({ kind }); v.setN1?.(60);
    v.update([0, 0, 0], [0, 0, 0], [0, 0, -50], [0, 0, 0]);
    await Promise.resolve(); await new Promise((r) => setTimeout(r, 0));
    R.nodes[kind] = { nodes: c.n, active: v._st.active };
    if (kind === 'fighter') { const n0 = c.n; v.setLiftFan(0.5); R.nodes.fighterLiftFan = c.n - n0; }
  }
  {
    const oc = new OfflineAudioContext(2, SR, SR), S = createAudioSystem(oc);
    S.playFlyby(1); const c = countNodes(oc); S.playFlyby(1); R.nodes.flybyOneShot = c.n;
  }

  // CPU: 10 s stereo with player F-35 (AB) + 2 jumbo + 2 herc + 3 fighter AI + wind/rolling beds; vs 8 pistons
  const t0 = performance.now();
  await render(10, (S) => {
    const add = (kind, i, n1) => { const v = S.createEngineVoice({ kind }); v.setN1(n1); v.update([0, 0, 0], [0, 0, 0], [200 * i, 50, -300], [0, 0, 0]); return v; };
    const p = S.createEngineVoice({ kind: 'fighter', priority: 1 }); p.setN1(102); p.setAfterburner(1); p.setInterior(false); p.update([0, 0, 0], [0, 0, 0], [0, 0, -15], [0, 0, -100]);
    add('turbofan', 1, 80); add('turbofan', 2, 40); add('turboprop', 3, 95); add('turboprop', 4, 80); add('fighter', 5, 60); add('fighter', 6, 90); add('fighter', 7, 70);
    S.setWind(300); S.setRolling(20, 'runway');
  }, { raw: false });
  R.perf.jets8 = { ms: Math.round(performance.now() - t0) };
  const t1 = performance.now();
  await render(10, (S) => {
    for (let i = 0; i < 8; i++) { const v = S.createEngineVoice(); v.setThrottle(0.8); v.update([0, 0, 0], [0, 0, 0], [200 * i, 50, -300], [0, 0, 0]); }
    S.setWind(100); S.setRolling(20, 'runway');
  }, { raw: false });
  R.perf.piston8 = { ms: Math.round(performance.now() - t1) };
  R.perf.jets8.xRealtime = +(10000 / R.perf.jets8.ms).toFixed(1);
  R.perf.piston8.xRealtime = +(10000 / R.perf.piston8.ms).toFixed(1);

  // ---- checks ----
  const s = R.scen, ck = (name, ok, detail) => R.checks.push({ name, ok: !!ok, detail });
  const ref = s.pistonFull.lufs;
  for (const [k, m] of Object.entries(s)) {
    if (m.peak === undefined) continue;
    ck(`${k}: not silent`, m.rmsDb > -45, `rms ${m.rmsDb} dBFS`);
    if (!k.startsWith('piston')) ck(`${k}: no clipping (raw peak < 1)`, m.peak < 1, `peak ${m.peak}`);   // the piston reference itself peaks ~1.0–1.06 raw
    ck(`${k}: no NaN`, m.nan === 0, `nan ${m.nan}`);
  }
  for (const k of ['fanToFront', 'propFull', 'f35Mil', 'f35Ab']) ck(`${k}: loudness within ±8 LU of piston full`, Math.abs(s[k].lufs - ref) <= 8, `${s[k].lufs} vs ${ref}`);
  ck('turbofan: centroid rises idle → mid → takeoff (×1.1 each)', s.fanIdleFront.centroid * 1.1 < s.fanMidFront.centroid && s.fanMidFront.centroid * 1.1 < s.fanToFront.centroid,
    `${s.fanIdleFront.centroid} → ${s.fanMidFront.centroid} → ${s.fanToFront.centroid} Hz`);
  ck('turbofan: louder at takeoff than idle (+6 dB)', s.fanToFront.lufs - s.fanIdleFront.lufs >= 6, `${s.fanIdleFront.lufs} → ${s.fanToFront.lufs}`);
  ck('turbofan: buzzsaw — front has more 250–2500 Hz energy than rear', s.fanToFront.band > s.fanToRear.band * 1.15, `front ${s.fanToFront.band} rear ${s.fanToRear.band}`);
  ck('turbofan: inside ≥ 10 dB quieter and darker', s.fanToFront.lufs - s.fanToInside.lufs >= 10 && s.fanToInside.centroid < s.fanToFront.centroid / 2,
    `${s.fanToInside.lufs} LUFS, ${s.fanToInside.centroid} Hz`);
  ck('turboprop: centroid rises idle → full (×1.2)', s.propIdle.centroid * 1.2 < s.propFull.centroid, `${s.propIdle.centroid} → ${s.propFull.centroid}`);
  ck('turboprop: louder at full (+4 dB)', s.propFull.lufs - s.propIdle.lufs >= 4, `${s.propIdle.lufs} → ${s.propFull.lufs}`);
  ck('turboprop: engine beat (slow envelope depth > 2× piston)', s.propFull.beat > s.pistonFull.beat * 2, `prop ${s.propFull.beat} piston ${s.pistonFull.beat}`);
  ck('fighter: centroid rises idle → mil (same spot, ×1.3)', s.f35Idle.centroid * 1.3 < s.f35MilFront.centroid, `${s.f35Idle.centroid} → ${s.f35MilFront.centroid} Hz`);
  ck('fighter: louder at mil (+6 dB)', s.f35MilFront.lufs - s.f35Idle.lufs >= 6, `${s.f35Idle.lufs} → ${s.f35MilFront.lufs}`);
  ck('fighter: afterburner louder (+2 LU) than mil', s.f35Ab.lufs - s.f35Mil.lufs >= 2, `${s.f35Mil.lufs} → ${s.f35Ab.lufs}`);
  ck('fighter: afterburner crackles (waveform skewness ≥ 0.3 and > mil + 0.25)', s.f35Ab.skew >= 0.3 && s.f35Ab.skew > s.f35Mil.skew + 0.25, `skew ${s.f35Mil.skew} → ${s.f35Ab.skew}`);
  ck('fighter: AB inside quieter than outside (≥ 6 dB)', s.f35Ab.lufs - s.f35AbInside.lufs >= 6, `${s.f35AbInside.lufs}`);
  ck('fighter: lift fan adds level', s.f35LiftFan.lufs > -60, `${s.f35LiftFan.lufs}`);
  ck('flyby: boom transient loudest just after the pass', s.flyby.boomWindowPeakDb > s.flyby.leadInPeakDb + 10, `boom ${s.flyby.boomWindowPeakDb} lead-in ${s.flyby.leadInPeakDb}`);
  const a = s.aiFlyby;
  ck('AI jet doppler: brighter approaching than receding (×1.25)', a.approachCentroid > a.recedeCentroid * 1.25, `${a.approachCentroid} vs ${a.recedeCentroid} Hz`);
  ck('AI jet distance: loudest when closest (+6 dB over both ends)', a.closeRms > a.approachRms + 6 && a.closeRms > a.recedeRms + 6, `${a.approachRms} / ${a.closeRms} / ${a.recedeRms}`);
  for (const k of ['turbofan', 'turboprop', 'fighter']) ck(`${k}: ≤ 14 nodes per voice`, R.nodes[k].nodes <= 14 && R.nodes[k].active, `${R.nodes[k].nodes}`);
  R.pass = R.checks.filter((c) => c.ok).length; R.total = R.checks.length;
  return R;
}

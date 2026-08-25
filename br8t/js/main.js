// main.js — the engine. One canvas, eight shader scenes, one scroll.
// Scroll position is the story clock: it is mapped onto scene weights,
// uniform choreography, typography windows, the mission clock and counters.

import { createGL } from './gl.js';
import { FRAGS, POINT_VS, POINT_FS } from './shaders.js';
import { AudioBed } from './audio.js';

// ————————————————————————————————————————————— helpers
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const remap = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

// ————————————————————————————————————————————— boot
const canvas = document.getElementById('gl');
let R;
try { R = createGL(canvas); } catch (e) { R = null; }
if (!R) {
  const nogl = document.getElementById('nogl');
  nogl.hidden = false;
  if (location.search.includes('diag')) nogl.querySelector('h1').textContent = 'DIAG: no WebGL2 context';
  canvas.remove();
} else {
  start(R);
}

function start({ gl, program }) {
  // scene boundaries in scroll progress, and crossfade widths
  const E = { core: 0.105, walk: 0.210, escape: 0.345, space: 0.425, sky: 0.665, iris: 0.782, outro: 0.895 };
  const F = { core: 0.030, walk: 0.028, escape: 0.016, space: 0.045, sky: 0.035, iris: 0.030, outro: 0.035 };

  const params = new URLSearchParams(location.search);
  let progs;
  try {
    progs = Object.fromEntries(Object.entries(FRAGS).map(([k, src]) => [k, program(src)]));
  } catch (err) {
    console.error(err);
    const nogl = document.getElementById('nogl');
    nogl.hidden = false;
    if (params.has('diag')) nogl.querySelector('p').textContent = String(err.message || err);
    return;
  }

  // ——————————————————————————— random-walk trail (point stream)
  const N = 2600;
  const trail = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) trail[i * 3 + 2] = -100;
  let head = 0;
  const photon = { x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const pointProg = program(POINT_FS, POINT_VS);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, trail, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ——————————————————————————— sizing / adaptive quality
  let W = 0, H = 0, scale = 1, quality = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const base = innerWidth * innerHeight * dpr * dpr;
    const s = Math.min(1, Math.sqrt(2300000 / base)); // cap ~2.3 MP
    scale = dpr * s * quality;
    W = canvas.width = Math.max(2, Math.round(innerWidth * scale));
    H = canvas.height = Math.max(2, Math.round(innerHeight * scale));
  }
  resize();
  addEventListener('resize', resize);
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);

  // ——————————————————————————— input: cursor in st units, idle lissajous
  const cur = { x: 0, y: 0.05, tx: 0, ty: 0.05, lastInput: -10 };
  const toSt = (cx, cy) => [
    (cx / innerWidth - 0.5) * (innerWidth / innerHeight),
    0.5 - cy / innerHeight,
  ];
  addEventListener('pointermove', (e) => {
    [cur.tx, cur.ty] = toSt(e.clientX, e.clientY);
    cur.lastInput = tNow;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) { [cur.tx, cur.ty] = toSt(t.clientX, t.clientY); cur.lastInput = tNow; }
  }, { passive: true });

  // ——————————————————————————— scroll → progress
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  let p = 0, pS = 0, snap = 0;

  const dbgP = parseFloat(params.get('p'));
  if (!Number.isNaN(dbgP)) {
    requestAnimationFrame(() => { scrollTo(0, dbgP * maxScroll()); snap = 20; });
  }

  function scrollTween(to, ms) {
    const from = scrollY, t0 = performance.now();
    (function step() {
      const u = Math.min(1, (performance.now() - t0) / ms);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      scrollTo(0, from + (to - from) * e);
      if (u < 1) requestAnimationFrame(step);
    })();
  }

  // ——————————————————————————— DOM: chapters, HUD, counters
  const chapters = [...document.querySelectorAll('.ch')].map((el) => ({
    el, inner: el.querySelector('.inner'),
    a: parseFloat(el.dataset.a), b: parseFloat(el.dataset.b),
  }));
  const railFill = document.getElementById('railFill');
  const rail = document.getElementById('rail');
  const readout = document.getElementById('readout');
  const roT = document.getElementById('roT');
  const roKM = document.getElementById('roKM');
  const cue = document.getElementById('cue');
  const yearsEl = document.getElementById('years');
  const photonsEl = document.getElementById('photons');
  const depEls = [...document.querySelectorAll('.dep')];

  // rail ticks
  const TICKS = [
    [0.002, 'SUN'], [E.core, 'CORE'], [E.walk, 'THE WALK'], [E.escape, 'SURFACE'],
    [0.495, 'MERCURY'], [0.6075, 'VENUS'], [E.sky, 'EARTH'], [E.iris, 'EYE'],
  ];
  for (const [tp, label] of TICKS) {
    const d = document.createElement('button');
    d.className = 'tick';
    d.style.top = `${tp * 100}%`;
    d.dataset.l = label;
    d.setAttribute('aria-label', label);
    d.addEventListener('click', () => scrollTween(tp * maxScroll(), 1700));
    rail.appendChild(d);
  }
  const tickEls = [...rail.querySelectorAll('.tick')];

  // departure clock — light now arriving left the sun 8m20s ago
  function depClock() {
    const d = new Date(Date.now() - 500 * 1000);
    const s = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    for (const el of depEls) el.textContent = s;
  }
  depClock();
  setInterval(depClock, 1000);

  // T+ mission clock (piecewise through the flybys)
  const TT = [[E.escape, 0], [0.495, 193], [0.6075, 361], [E.sky, 497], [E.iris, 499.3], [0.85, 499.94]];
  function missionT(pp) {
    if (pp <= TT[0][0]) return 0;
    for (let i = 1; i < TT.length; i++) {
      if (pp <= TT[i][0]) {
        const [a, ta] = TT[i - 1], [b, tb] = TT[i];
        return lerp(ta, tb, (pp - a) / (b - a));
      }
    }
    return TT[TT.length - 1][1];
  }
  const fmtT = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60), cs = Math.floor((s * 100) % 100);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  // outro photon counter — ~2.3e12 photons/s into your pupils off a bright sky
  const loadT = performance.now();
  function fmtPhotons() {
    const n = ((performance.now() - loadT) / 1000 + 1) * 2.3e12;
    const exp = Math.floor(Math.log10(n));
    const man = (n / 10 ** exp).toFixed(2);
    return `${man} × 10<sup>${exp}</sup>`;
  }

  // ——————————————————————————— audio
  const audio = new AudioBed();
  const sndBtn = document.getElementById('snd');
  sndBtn.addEventListener('click', () => {
    const on = audio.toggle();
    sndBtn.querySelector('b').textContent = on ? 'ON' : 'OFF';
    sndBtn.classList.toggle('on', on);
  });

  // ——————————————————————————— scene table
  const motionPref = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
  const scenes = [
    { n: 'sun', a: 0, b: E.core, fi: 0, fo: F.core },
    { n: 'core', a: E.core, b: E.walk, fi: F.core, fo: F.walk },
    { n: 'walk', a: E.walk, b: E.escape, fi: F.walk, fo: F.escape },
    { n: 'escape', a: E.escape, b: E.space, fi: F.escape, fo: F.space },
    { n: 'space', a: E.space, b: E.sky, fi: F.space, fo: F.sky },
    { n: 'sky', a: E.sky, b: E.iris, fi: F.sky, fo: F.iris },
    { n: 'iris', a: E.iris, b: E.outro, fi: F.iris, fo: F.outro },
    { n: 'outro', a: E.outro, b: 1.001, fi: F.outro, fo: 0 },
  ];
  const weight = (s, pp) => {
    const win = s.fi === 0 ? 1 : ss(s.a - s.fi / 2, s.a + s.fi / 2, pp);
    const wout = s.fo === 0 ? 1 : 1 - ss(s.b - s.fo / 2, s.b + s.fo / 2, pp);
    return win * wout;
  };

  // per-scene uniform choreography — q is local progress in [0,1]
  let pupilS = 0.24;
  const choreo = {
    sun: (q) => ({ uZoom: 1 + ss(0.7, 1, q) * 1.1, uBoost: Math.pow(ss(0.72, 1, q), 2) * 1.6 }),
    core: (q) => ({ uBoost: (1 - ss(0, 0.2, q)) * 1.4, uDim: 1 - ss(0.8, 1, q) * 0.5 }),
    walk: (q) => ({ uPhoton: [photon.x - cam.x, photon.y - cam.y], uRise: ss(0.6, 1, q) }),
    escape: (q) => ({ uFlash: Math.pow(Math.max(0, 1 - q / 0.12), 2) }),
    space: (q) => {
      const sp = ss(0, 0.3, q);
      const out = { uSunPos: [lerp(0, -0.62, sp), lerp(0.10, -0.30, sp)], uPA: [0, 0, 0, 0], uPB: [0, 0, 0, 0] };
      const qm = remap(q, 0.06, 0.50);
      const qv = remap(q, 0.50, 0.92);
      if (q >= 0.04 && q < 0.50) {
        const e = Math.pow(qm, 2.5);
        out.uPA = [lerp(-0.05, 3.4, e), lerp(-0.03, -1.6, e), 0.014 * Math.exp(qm * 5.0), 0];
      } else if (q >= 0.50) {
        const e = Math.pow(qv, 2.5);
        out.uPA = [lerp(0.03, -3.4, e), lerp(0.02, 1.4, e), 0.013 * Math.exp(qv * 5.2), 1];
      }
      const qe = remap(q, 0.72, 1);
      if (qe > 0) out.uPB = [0, 0.01, 0.004 * Math.exp(qe * 7.3), 2];
      return out;
    },
    sky: () => ({}),
    iris: (q, dt) => {
      const flash = Math.pow(Math.max(0, 1 - q / 0.16), 2);
      const r = Math.hypot(cur.x, cur.y);
      let target = lerp(0.17, 0.30, ss(0.06, 0.5, r));
      target = lerp(0.17, target, ss(0.05, 0.25, q)); // constrict on arrival
      pupilS += (target + 0.008 * Math.sin(tNow * 0.9) - pupilS) * Math.min(1, dt * 3);
      const fit = innerHeight > innerWidth ? 0.82 : 1;  // portrait shows more iris
      return { uPupil: pupilS, uFlash: flash, uZoomI: (1 + Math.pow(ss(0.78, 1, q), 2) * 6) * fit };
    },
    outro: () => ({}),
  };

  // ——————————————————————————— render loop
  let tNow = 0, last = performance.now(), ema = 16, frames = 0;
  let running = true, prevP = 0;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  function stepWalk(dt, q, dp) {
    const stepsF = 5 + Math.min(60, Math.abs(dp) * 9000);
    const steps = Math.max(1, Math.round(stepsF));
    const bias = Math.pow(ss(0.72, 1, q), 2) * 1.5;
    for (let i = 0; i < steps; i++) {
      const ang = Math.random() * Math.PI * 2;
      let dx = Math.cos(ang), dy = Math.sin(ang) + bias * 0.9;
      const il = 1 / Math.hypot(dx, dy);
      const len = 0.0034 * (1 + q * q * 5) * (0.7 + 0.6 * Math.random());
      photon.x += dx * il * len;
      photon.y += dy * il * len;
      trail[head * 3] = photon.x;
      trail[head * 3 + 1] = photon.y;
      trail[head * 3 + 2] = tNow;
      head = (head + 1) % N;
    }
    if (Math.random() < 0.10) audio.tick();
    const k = 1 - Math.pow(0.002, dt);
    cam.x += (photon.x - cam.x) * k;
    cam.y += (photon.y - cam.y) * k;
  }

  function frame(now) {
    if (!running) return;
    const dtms = clamp(now - last, 0, 60);
    last = now;
    const dt = dtms / 1000;
    tNow += dt;

    // adaptive quality (pinned when a debug ?p= is forced, so shots stay crisp)
    ema = ema * 0.95 + dtms * 0.05;
    if (++frames % 90 === 0 && Number.isNaN(dbgP)) {
      if (ema > 27 && quality > 0.45) { quality *= 0.82; resize(); }
      else if (ema < 15 && quality < 1) { quality = Math.min(1, quality * 1.08); resize(); }
    }

    // progress
    p = clamp(scrollY / maxScroll(), 0, 1);
    if (snap > 0) { pS = p; snap--; }
    else pS += (p - pS) * (1 - Math.pow(0.0012, dt));
    const dp = pS - prevP;

    // whoosh at the photosphere
    if (prevP < E.escape && pS >= E.escape) audio.whoosh();
    prevP = pS;

    // cursor: eased, with idle drift so the plasma never sits still
    if (tNow - cur.lastInput > 3.5) {
      cur.tx = 0.26 * Math.sin(tNow * 0.21) * motionPref;
      cur.ty = 0.18 * Math.sin(tNow * 0.157 + 1.3) * motionPref + 0.04;
    }
    cur.x += (cur.tx - cur.x) * Math.min(1, dt * 3.2);
    cur.y += (cur.ty - cur.y) * Math.min(1, dt * 3.2);
    const mousePx = [cur.x * H + 0.5 * W, cur.y * H + 0.5 * H];

    // draw
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);

    const w = {};
    for (const s of scenes) {
      const wt = w[s.n] = weight(s, pS);
      if (wt < 0.004) continue;
      const q = remap(pS, s.a, s.b);
      if (s.n === 'walk') stepWalk(dt, q, dp);
      const prog = progs[s.n];
      prog.use();
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      prog.set({
        uRes: [W, H], uTime: tNow, uMouse: mousePx,
        uAlpha: wt, uQ: q, uMotion: motionPref,
        ...choreo[s.n](q, dt),
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (s.n === 'walk') {
        // trail on top, additive
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, trail);
        pointProg.use();
        pointProg.set({
          uRes: [W, H], uCam: [cam.x, cam.y], uNow: tNow,
          uCur: [cur.x + cam.x, cur.y + cam.y], uScale: scale, uA: wt,
        });
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.POINTS, 0, N);
        gl.bindVertexArray(null);
      }
    }

    // ————————— DOM choreography
    for (const c of chapters) {
      const u = (pS - c.a) / (c.b - c.a);
      if (u < -0.02 || u > 1.02) {
        if (c.el.style.visibility !== 'hidden') { c.el.style.visibility = 'hidden'; c.inner.style.opacity = 0; }
        continue;
      }
      const wIn = ss(0, 0.16, u), wOut = 1 - ss(0.84, 1, u);
      const o = clamp(wIn * wOut, 0, 1);
      c.el.style.visibility = o > 0.004 ? 'visible' : 'hidden';
      c.inner.style.opacity = o.toFixed(3);
      c.inner.style.transform = `translateY(${((0.5 - u) * 44).toFixed(1)}px)`;
    }

    railFill.style.height = `${(pS * 100).toFixed(2)}%`;
    for (let i = 0; i < tickEls.length; i++) tickEls[i].classList.toggle('past', pS >= TICKS[i][0]);

    cue.classList.toggle('hide', p > 0.012);

    const roVis = pS > 0.348 && pS < 0.80;
    readout.classList.toggle('show', roVis);
    if (roVis) {
      const T = missionT(pS);
      roT.textContent = `T+ ${fmtT(T)}`;
      roKM.textContent = `${Math.round(T * 299792.458).toLocaleString('en-US')} km`;
    }

    if (w.walk > 0.01 && yearsEl) {
      const qw = remap(pS, E.walk, E.escape);
      yearsEl.textContent = Math.round(Math.pow(qw, 1.35) * 127400).toLocaleString('en-US');
    }
    if (w.outro > 0.01 && photonsEl) photonsEl.innerHTML = fmtPhotons();

    // audio beds follow the scenery
    audio.mix(w);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // replay — rewind the whole journey
  document.getElementById('again').addEventListener('click', () => scrollTween(0, 4200));
}

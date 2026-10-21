import * as THREE from 'three';
import { Builder, monotone, naca, airfoilLoop, sweepRings, streamline, circle, latheRings, lerp, clamp, srgb } from './geom.js';
import { FUSELAGE, WING, STAB, FIN, GEAR, THRUST_Y } from './spec.js';
import { REG, uvSide, uvPlan, uvSwatch } from './livery.js';

const KEYS = FUSELAGE.map((k) => k[0]);
const F = [1, 2, 3, 4, 5, 6].map((c) => monotone(KEYS, FUSELAGE.map((k) => k[c])));
export function fusSec(s) {
  return { w: F[0](s), yt: F[1](s), yb: F[2](s), yw: F[3](s), nt: F[4](s), nb: F[5](s) };
}
export function ringPoint(sec, s, t, inset = 0) {
  const sn = Math.sin(t), cs = Math.cos(t), top = cs >= 0;
  const e = 2 / (top ? sec.nt : sec.nb);
  const x = (sec.w - inset) * Math.sign(sn) * Math.abs(sn) ** e;
  const y = top ? sec.yw + (sec.yt - inset - sec.yw) * Math.abs(cs) ** e : sec.yw - (sec.yw - sec.yb - inset) * Math.abs(cs) ** e;
  return [x, y, s];
}
// half-width of the fuselage at station s and height y (for placing things on the skin)
export function fusHalfWidth(s, y) {
  const sec = fusSec(s);
  const top = y >= sec.yw;
  const h = top ? (y - sec.yw) / (sec.yt - sec.yw) : (sec.yw - y) / (sec.yw - sec.yb);
  const n = top ? sec.nt : sec.nb;
  return sec.w * Math.max(0, 1 - Math.min(1, h) ** n) ** (1 / n);
}

const C = {
  tire: srgb('#17181a'), hub: srgb('#8d9297'), metal: srgb('#b9bec4'), dark: srgb('#1d1f22'), inlet: srgb('#0c0d0f'),
  exhaust: srgb('#6b5c50'), black: srgb('#0d0e10'), white: srgb('#ececec'), red: srgb('#c11d22'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

function wingSec(x) {
  const ax = Math.abs(x), W = WING;
  let c = ax <= W.taperStart ? W.rootChord : lerp(W.rootChord, W.tipChord, (Math.min(ax, W.tipX) - W.taperStart) / (W.tipX - W.taperStart));
  let te = W.te, thk = 1, y = W.y + ax * W.dihedral;
  if (ax > W.tipX) {
    const k = (ax - W.tipX) / (W.halfSpan - W.tipX);
    const le = te - c + 0.14 * k * k;
    te -= 0.05 * k ** 3;
    c = te - le;
    thk = Math.sqrt(Math.max(0.02, 1 - k ** 2.2));
    y -= 0.035 * k;
  }
  return { c, le: te - c, y, thk };
}

function spanSamples(a, b, step) {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
  const r = [];
  for (let i = 0; i <= n; i++) r.push(a + ((b - a) * i) / n);
  return r;
}

export function buildExterior({ quality, mats }) {
  const high = quality !== 'low';
  const body = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const M = high ? 24 : 14;

  // ---------- fuselage ----------
  const stations = [0.255, 0.258, 0.263, 0.27, 0.28, 0.295, 0.32, 0.35, 0.39, 0.44];
  const step = high ? 0.075 : 0.16;
  for (let s = 0.5; s < 7.9; s += step) stations.push(s);
  stations.push(7.93, 7.95);
  const rings = stations.map((s) => {
    const sec = fusSec(s);
    const r = [];
    for (let j = 0; j < 2 * M; j++) r.push(ringPoint(sec, s, (j / (2 * M)) * Math.PI * 2));
    return r;
  });
  body.loft(rings, {
    out: (p) => [p[0], p[1] - 1.2, 0],
    splits: [[0, M, (p) => uvSide(REG.fusR, p[2], p[1])], [M, 2 * M, (p) => uvSide(REG.fusL, p[2], p[1])]],
    capStart: true, capEnd: true, capUV: () => uvSwatch('primary'),
  });

  // cabin glass, slightly inside the skin; only the upper arc
  {
    const g = [];
    const arc = Math.round(M * 0.66);
    for (let s = 1.49; s <= 4.72; s += high ? 0.06 : 0.12) {
      const sec = fusSec(s), r = [];
      for (let j = -arc; j <= arc; j++) r.push(ringPoint(sec, s, (j / (2 * M)) * Math.PI * 2, 0.006));
      g.push(r);
    }
    glass.loft(g, { closed: false, out: (p) => [p[0], p[1] - 1.2, 0] });
  }

  // ---------- wing ----------
  const foil = naca(0.02, 0.4, 0.12);
  const nC = high ? 22 : 11;
  const wingStep = high ? 0.32 : 0.7;
  const wingRing = (x, loop) => {
    const w = wingSec(x);
    return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk, w.le + xc * w.c]);
  };
  const wingUV = (topCount) => [
    [0, topCount, (p) => uvPlan(REG.wingT, p[0], p[2])],
    [topCount, null, (p) => uvPlan(REG.wingB, p[0], p[2])],
  ];
  const wingPanel = (B, xs, cFrom, cTo, roundNose, caps = [true, true]) => {
    const { loop, topCount } = airfoilLoop(foil, nC, cFrom, cTo, roundNose);
    const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
    const sp = wingUV(top);
    sp[1][1] = loop.length;
    B.loft(xs.map((x) => wingRing(x, loop)), {
      out: () => [0, 1, 0], splits: sp, capStart: caps[0], capEnd: caps[1],
      capUV: (p) => uvPlan(p[1] > wingSec(p[0]).y ? REG.wingT : REG.wingB, p[0], p[2]),
    });
  };
  const H = WING.hingeChord;
  const tipXs = (sign) => {
    const r = spanSamples(5.12, WING.tipX, wingStep);
    for (let k = 1; k <= (high ? 6 : 3); k++) r.push(WING.tipX + (WING.halfSpan - WING.tipX) * (k / (high ? 6 : 3)));
    return r.map((x) => x * sign);
  };
  wingPanel(body, spanSamples(-WING.flap[0], WING.flap[0], 0.6), 0, 1, false);
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg);
    const flapXs = spanSamples(WING.flap[0], WING.flap[1], wingStep);
    if (!flapXs.includes(WING.taperStart)) { flapXs.push(WING.taperStart); flapXs.sort((a, b) => a - b); }
    wingPanel(body, S(flapXs.filter((x) => x <= WING.flap[1])), 0, H, false);
    wingPanel(body, S([WING.flap[1], WING.aileron[0]]), 0, 1, false);
    wingPanel(body, S(spanSamples(WING.aileron[0], WING.aileron[1], wingStep)), 0, H, false);
    wingPanel(body, tipXs(sg), 0, 1, false, [true, true]);
  }
  const surface = (xs, cFrom) => { const b = new Builder(); wingPanel(b, xs, cFrom, 1, true); return b; };
  const hingePt = (x, f) => { const w = wingSec(x); const [yu, yl] = foil(f); return [x, w.y + ((yu + yl) / 2) * w.c, w.le + f * w.c]; };
  const pieces = {};
  for (const [name, span, sg] of [['flapR', WING.flap, 1], ['flapL', WING.flap, -1], ['ailR', WING.aileron, 1], ['ailL', WING.aileron, -1]]) {
    const a = span[0] + 0.015, b = span[1] - 0.015;
    const xs = spanSamples(a, b, wingStep).map((x) => x * sg);
    const B = surface(xs, H + 0.006);
    const pA = hingePt(sg > 0 ? a : -b, H + 0.012), pB = hingePt(sg > 0 ? b : -a, H + 0.012);
    pieces[name] = { builder: B, a: pA, b: pB };
  }

  // ---------- horizontal tail ----------
  const sym9 = naca(0, 0.4, 0.095);
  const stabSec = (x) => {
    const ax = Math.abs(x), k = clamp((ax - 0.22) / (STAB.halfSpan - 0.22), 0, 1);
    let le = lerp(STAB.rootLe, STAB.tipLe, k), te = lerp(STAB.te, STAB.tipTe, k), thk = 1;
    if (ax > STAB.halfSpan - 0.12) { const q = (ax - (STAB.halfSpan - 0.12)) / 0.12; le += 0.12 * q * q; te -= 0.06 * q * q; thk = Math.sqrt(Math.max(0.05, 1 - q * q)); }
    return { le, te, c: te - le, thk };
  };
  const tailRing = (x, f0, f1, roundNose) => {
    const s = stabSec(x);
    const fh = (STAB.hinge - s.le) / s.c;
    const { loop } = airfoilLoop(sym9, high ? 14 : 8, f0 === 'h' ? fh + 0.012 : f0, f1 === 'h' ? fh : f1, roundNose);
    return loop.map(([xc, yv]) => [x, STAB.y + yv * s.c * s.thk, s.le + xc * s.c]);
  };
  const stabXs = [];
  for (let k = 0; k <= (high ? 14 : 7); k++) { const t = k / (high ? 14 : 7); stabXs.push(-STAB.halfSpan + 2 * STAB.halfSpan * (0.5 - 0.5 * Math.cos(Math.PI * t))); }
  const swP = () => uvSwatch('primary');
  body.loft(stabXs.map((x) => tailRing(x, 0, 'h', false)), { out: () => [0, 1, 0], uv: swP, capStart: true, capEnd: true, capUV: swP });
  const elev = new Builder();
  for (const sg of [1, -1]) {
    const xs = stabXs.filter((x) => x * sg >= 0.1).map((x) => x);
    if (sg > 0) xs.unshift(0.1); else xs.push(-0.1);
    elev.loft(xs.map((x) => tailRing(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: swP, capStart: true, capEnd: true, capUV: swP });
  }
  pieces.elevator = { builder: elev, a: [-1, STAB.y, STAB.hinge + 0.01], b: [1, STAB.y, STAB.hinge + 0.01] };

  // ---------- vertical tail ----------
  const sym10 = naca(0, 0.4, 0.1);
  const finLe = (y) => lerp(FIN.leBase, FIN.leTop, (y - FIN.base) / (FIN.top - FIN.base));
  const finHinge = (y) => lerp(FIN.hingeBase, FIN.hingeTop, (y - FIN.base) / (FIN.top - FIN.base));
  const finTe = (y) => {
    let te = lerp(FIN.teBase, FIN.teTop, (y - FIN.base) / (FIN.top - FIN.base));
    const r = 0.2, y0 = FIN.top - 0.06 - r;
    if (y > y0) te -= r - Math.sqrt(Math.max(0, r * r - (y - y0) ** 2));
    return te;
  };
  const finSplits = (L, mid) => [[0, mid, (p) => uvSide(REG.finR, p[2], p[1])], [mid, L, (p) => uvSide(REG.finL, p[2], p[1])]];
  const finRing = (y, part, thkMul = 1) => {
    const le = finLe(y), te = finTe(y), c = te - le, fh = (finHinge(y) - le) / c;
    const { loop, topCount } = airfoilLoop(sym10, high ? 14 : 8, part === 'rudder' ? fh + 0.012 : 0, part === 'rudder' ? 1 : fh, part === 'rudder');
    return { pts: loop.map(([xc, yv]) => [yv * c * thkMul, y, le + xc * c]), topCount };
  };
  {
    const ys = [];
    const n = high ? 12 : 6;
    for (let k = 0; k <= n; k++) ys.push(FIN.base + (FIN.top - 0.035 - FIN.base) * (k / n));
    ys.push(FIN.top - 0.012, FIN.top);
    const mul = (y) => (y > FIN.top - 0.04 ? Math.sqrt(Math.max(0.05, 1 - ((y - (FIN.top - 0.04)) / 0.04) ** 2)) : 1);
    const R = ys.map((y) => finRing(y, 'fin', mul(y)));
    body.loft(R.map((r) => r.pts), { out: () => [1, 0, 0], splits: finSplits(R[0].pts.length, R[0].topCount - 1), capEnd: true, capUV: swP });
    const ry = [];
    const rb = 1.36, rt = FIN.top - 0.07;
    for (let k = 0; k <= n; k++) ry.push(rb + (rt - rb) * (k / n));
    const rud = new Builder();
    const RR = ry.map((y) => finRing(Math.max(y, FIN.base), 'rudder'));
    RR.forEach((r, i) => { if (ry[i] < FIN.base) for (const p of r.pts) p[1] = ry[i]; });
    rud.loft(RR.map((r) => r.pts), { out: () => [1, 0, 0], splits: finSplits(RR[0].pts.length, RR[0].topCount + 2), capStart: true, capEnd: true, capUV: swP });
    pieces.rudder = { builder: rud, a: [0, FIN.base, FIN.hingeBase + 0.015], b: [0, FIN.top, FIN.hingeTop + 0.015] };
    // dorsal fillet
    const dors = [];
    const lens = (s, yb, yt, t) => {
      const r = [];
      const N = high ? 16 : 10;
      for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; r.push([Math.sin(a) * t * (0.35 + 0.65 * Math.abs(Math.sin(a))), yb + (yt - yb) * (1 - Math.cos(a)) / 2, s]); }
      return r;
    };
    const ds = [];
    for (let k = 0; k <= (high ? 10 : 5); k++) ds.push(lerp(5.25, 7.2, k / (high ? 10 : 5)));
    for (const s of ds) {
      const yb = fusSec(s).yt - 0.04;
      const k = (s - 5.25) / (7.2 - 5.25);
      const yt = Math.max(yb + 0.004, Math.min(lerp(yb + 0.004, 2.06, k ** 1.6), s > finLe(FIN.base) ? FIN.base + (s - FIN.leBase) * (FIN.top - FIN.base) / (FIN.leTop - FIN.leBase) : 9));
      dors.push(lens(s, yb, yt, 0.012 + 0.03 * Math.sin(Math.PI * Math.min(1, k * 1.2))));
    }
    const L = dors[0].length;
    body.loft(dors, { out: () => [1, 0, 0], splits: [[0, L / 2, (p) => uvSide(REG.finR, p[2], Math.min(p[1], 1.6))], [L / 2, L, (p) => uvSide(REG.finL, p[2], Math.min(p[1], 1.6))]] });
  }

  // ---------- struts ----------
  const swS = () => uvSwatch('primary');
  for (const sg of [1, -1]) {
    const xw = 2.5, w = wingSec(xw);
    const a = [sg * 0.5, 0.8, 2.6], b = [sg * xw, w.y - 0.06, w.le + 0.27 * w.c];
    const path = [];
    for (let k = 0; k <= 6; k++) path.push([lerp(a[0], b[0], k / 6), lerp(a[1], b[1], k / 6), lerp(a[2], b[2], k / 6)]);
    const prof = streamline(high ? 14 : 8, 0.1, 0.034).map(([u, v]) => [u, v]);
    body.loft(sweepRings(path, prof, { upHint: [0, 0, 1], scale: (i, n) => (i === 0 || i === n - 1 ? 1.25 : 1) }), { uv: swS, capStart: true, capEnd: true, capUV: swS });
    // fuselage strut fitting fairing
    const fit = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; fit.push([sg * (0.44 + 0.12 * t), 0.8 + 0.04 * t, 2.6]); }
    body.loft(sweepRings(fit, streamline(10, 0.22, 0.09), { upHint: [0, 0, 1], scale: (i) => 1 - i * 0.12 }), { uv: swS, capStart: true, capEnd: true, capUV: swS });
  }

  // ---------- landing gear ----------
  const wheel = (B, x, y, s, r, w) => {
    const tire = new THREE.TorusGeometry(r - w * 0.42, w * 0.42, high ? 10 : 6, high ? 26 : 14);
    tire.scale(1, 1, 1.25);
    B.addGeo(tire, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, y, s), [0, 0], C.tire);
    const hub = new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 0.92, high ? 18 : 10);
    B.addGeo(hub, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(x, y, s), [0, 0], C.hub);
    const cap = new THREE.SphereGeometry(r * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const d of [1, -1]) B.addGeo(cap.clone(), new THREE.Matrix4().makeRotationZ(-d * Math.PI / 2).scale(new THREE.Vector3(1, 0.35, 1)).setPosition(x + d * w * 0.46, y, s), [0, 0], C.metal);
    cap.dispose();
  };
  const fairing = (B, x, y, s, len, wid, hgt, front, uv) => {
    const R = [], N = high ? 20 : 12, ks = high ? 16 : 9;
    for (let k = 0; k <= ks; k++) {
      const t = k / ks;
      const z = s - front + t * len;
      const nose = front / len;
      const prof = t < nose ? Math.sqrt(Math.max(0, 1 - ((nose - t) / nose) ** 2)) : Math.cos(((t - nose) / (1 - nose)) * Math.PI / 2) ** 0.8;
      const sw = Math.max(0.004, wid * prof), sh = Math.max(0.004, hgt * (0.25 + 0.75 * prof));
      const yc = y + 0.04 + Math.max(0, t - nose) * 0.12;
      R.push(circle(N, 1).map(([cx, cy]) => {
        const e = Math.sign(cy) * Math.abs(cy) ** 0.8;
        return [x + Math.sign(cx) * Math.abs(cx) ** 0.85 * sw, yc + e * sh * (cy < 0 ? 0.9 : 1) * (t > nose ? 1 - (t - nose) * 0.35 : 1), z];
      }));
    }
    B.loft(R, { uv, capStart: false, capEnd: true, capUV: uv });
  };
  const g = GEAR;
  for (const sg of [1, -1]) {
    const ax = sg * g.track / 2;
    const top = [sg * 0.36, 0.66, g.mainS - 0.04], bot = [ax - sg * 0.06, g.wheelR + 0.02, g.mainS + 0.02];
    const path = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; path.push([lerp(top[0], bot[0], t), lerp(top[1], bot[1], t) - Math.sin(t * Math.PI) * 0.03, lerp(top[2], bot[2], t)]); }
    const leg = [[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]];
    body.loft(sweepRings(path, leg, { upHint: [0, 0, 1], scale: (i, n) => [0.042 - 0.016 * (i / (n - 1)), 0.05] }), { uv: swS, capStart: true, capEnd: true, capUV: swS });
    wheel(trim, ax, g.wheelR, g.mainS, g.wheelR, 0.14);
    fairing(body, ax, g.wheelR, g.mainS, 0.92, 0.105, 0.205, 0.3, () => uvSwatch('primary'));
    // step on the leg
    const step = new THREE.BoxGeometry(0.1, 0.01, 0.07);
    trim.addGeo(step, new THREE.Matrix4().setPosition(sg * 0.66, 0.5, g.mainS - 0.075), [0, 0], C.metal);
    const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6);
    trim.addGeo(stem, new THREE.Matrix4().makeRotationZ(sg * 0.9).setPosition(sg * 0.63, 0.52, g.mainS - 0.06), [0, 0], C.metal);
  }
  // nose gear: oleo, torque links, fork, wheel, pant
  {
    const ns = g.noseS;
    const tilt = new THREE.Matrix4().makeRotationX(-0.1);
    const at = (y, z) => new THREE.Matrix4().makeTranslation(0, y, z).multiply(tilt);
    trim.addGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.3, 14), at(0.52, ns - 0.035), [0, 0], C.metal);
    trim.addGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.16, 14), at(0.69, ns - 0.055), [0, 0], C.dark);
    trim.addGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), at(0.6, ns - 0.045), [0, 0], C.dark);
    for (const [y, r] of [[0.5, 0.5], [0.58, -0.5]]) trim.addGeo(new THREE.BoxGeometry(0.018, 0.1, 0.022), new THREE.Matrix4().makeRotationX(r).setPosition(0, y, ns - 0.085), [0, 0], C.dark);
    wheel(trim, 0, g.noseR, ns, g.noseR, 0.12);
    fairing(body, 0, g.noseR, ns, 0.7, 0.088, 0.175, 0.27, () => uvSwatch('primary'));
  }

  // ---------- cowl details ----------
  for (const sg of [1, -1]) {
    const inlet = new THREE.SphereGeometry(1, high ? 18 : 10, high ? 10 : 6);
    trim.addGeo(inlet, new THREE.Matrix4().makeRotationY(sg * 0.5).scale(new THREE.Vector3(0.1, 0.062, 0.03)).setPosition(sg * 0.27, 1.21, 0.305), [0, 0], C.inlet);
  }
  {
    const lower = new THREE.SphereGeometry(1, 14, 8);
    trim.addGeo(lower, new THREE.Matrix4().scale(new THREE.Vector3(0.1, 0.035, 0.05)).setPosition(0, 0.86, 0.42), [0, 0], C.inlet);
    const exPath = [[0.16, 0.8, 1.2], [0.2, 0.68, 1.3], [0.22, 0.62, 1.38]];
    const R = sweepRings(exPath, circle(10, 0.026));
    trim.loft(R, { out: (p) => [p[0] - 0.2, p[1] - 0.7, 0], color: C.exhaust, capStart: true, capEnd: false });
  }
  // antennas, pitot, tie-downs, tail skid
  {
    const ant = (s, y, h, rake) => {
      const g2 = new THREE.CylinderGeometry(0.004, 0.012, h, 8);
      trim.addGeo(g2, new THREE.Matrix4().makeRotationX(rake).setPosition(0, y + h / 2 * Math.cos(rake), s + (h / 2) * Math.sin(rake)), [0, 0], C.black);
    };
    ant(4.6, fusSec(4.6).yt - 0.01, 0.42, 0.55);
    ant(5.3, fusSec(5.3).yt - 0.01, 0.36, 0.55);
    const blade = new THREE.BoxGeometry(0.006, 0.08, 0.06);
    trim.addGeo(blade, new THREE.Matrix4().makeRotationX(0.3).setPosition(0, fusSec(3.4).yb - 0.025, 3.4), [0, 0], C.black);
    const pit = new THREE.CylinderGeometry(0.008, 0.008, 0.35, 8);
    const pw = wingSec(-3.4);
    trim.addGeo(pit, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-3.4, pw.y - 0.12, pw.le + 0.1), [0, 0], C.metal);
    const pstem = new THREE.BoxGeometry(0.01, 0.1, 0.04);
    trim.addGeo(pstem, new THREE.Matrix4().setPosition(-3.4, pw.y - 0.08, pw.le + 0.25), [0, 0], C.metal);
    for (const [x, w] of [[-1.55, 0.13], [-1.75, 0.13]]) {
      const ws = wingSec(x);
      const lens = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      trim.addGeo(lens, new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(new THREE.Vector3(w / 2, 0.045, 0.03)).setPosition(x, ws.y + 0.005, ws.le + 0.012), [0, 0], [0.75, 0.78, 0.8]);
    }
    {
      const ws = wingSec(-2.2);
      trim.addGeo(new THREE.BoxGeometry(0.06, 0.012, 0.01), new THREE.Matrix4().setPosition(-2.2, ws.y + 0.0, ws.le + 0.004), [0, 0], C.black);
    }
    const skid = new THREE.BoxGeometry(0.03, 0.1, 0.14);
    trim.addGeo(skid, new THREE.Matrix4().makeRotationX(-0.4).setPosition(0, fusSec(7.6).yb - 0.04, 7.6), [0, 0], C.dark);
  }

  // ---------- lights ----------
  const lightPts = [];
  {
    const tipW = wingSec(WING.halfSpan - 0.04);
    for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
      const p = [sg * (WING.halfSpan - 0.02), tipW.y, tipW.le + 0.1];
      const lens = new THREE.SphereGeometry(0.035, 10, 8);
      lights.addGeo(lens, new THREE.Matrix4().makeScale(0.8, 0.8, 1.3).setPosition(...p), [0, 0], col);
      lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
      const strobe = new THREE.SphereGeometry(0.02, 8, 6);
      const ps = [sg * (WING.halfSpan - 0.01), tipW.y, tipW.le + tipW.c * 0.65];
      lights.addGeo(strobe, new THREE.Matrix4().setPosition(...ps), [0, 0], [1.6, 1.6, 1.6]);
      lightPts.push({ p: ps, col: [1, 1, 1], kind: 'strobe' });
    }
    const tail = [0, 1.42, 8.2];
    const tl = new THREE.SphereGeometry(0.028, 10, 8);
    lights.addGeo(tl, new THREE.Matrix4().setPosition(...tail), [0, 0], C.lensW);
    lightPts.push({ p: tail, col: [1, 1, 0.92], kind: 'nav' });
  }
  const beaconPos = [0, FIN.top + 0.035, (FIN.leTop + FIN.hingeTop) / 2];
  const beaconGeo = new Builder();
  beaconGeo.addGeo(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 14), new THREE.Matrix4().setPosition(...beaconPos), [0, 0]);
  trim.addGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 14), new THREE.Matrix4().setPosition(beaconPos[0], beaconPos[1] - 0.04, beaconPos[2]), [0, 0], C.dark);
  lightPts.push({ p: beaconPos, col: [1, 0.1, 0.05], kind: 'beacon' });

  // ---------- propeller ----------
  const prop = new Builder();
  const spinnerProfile = [];
  for (let k = 0; k <= (high ? 14 : 8); k++) {
    const u = 0.015 + (0.985 * k) / (high ? 14 : 8);
    spinnerProfile.push([-0.265 * (1 - u), 0.172 * (1 - (1 - u) ** 2.3) ** 0.55]);
  }
  spinnerProfile.push([0, 0.172]);
  const spinRings = latheRings(spinnerProfile, high ? 28 : 16);
  const spin = new Builder();
  spin.loft(spinRings, { out: (p) => [p[0], p[1], 0], color: C.white, capEnd: true });
  spin.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, -0.27), [0, 0], C.white);
  const pfoil = (t) => naca(0.04, 0.4, t);
  const bladeR = [];
  for (let k = 0; k <= (high ? 18 : 9); k++) bladeR.push(lerp(0.12, 0.95, k / (high ? 18 : 9)));
  bladeR.splice(bladeR.length - 1, 0, 0.935, 0.945);
  for (const rot of [0, Math.PI]) {
    const R = [];
    let topC = 0;
    for (const r of bladeR) {
      const u = (r - 0.12) / 0.83;
      let c = r < 0.2 ? lerp(0.07, 0.12, (r - 0.12) / 0.08) : 0.12 + 0.045 * Math.sin(Math.PI * Math.min(1, (r - 0.2) / 0.75)) - 0.03 * u * u;
      if (r > 0.9) c *= Math.sqrt(Math.max(0.12, 1 - ((r - 0.9) / 0.052) ** 2));
      const t = lerp(0.3, 0.075, Math.min(1, u * 1.5));
      const phi = Math.atan(1.6 / (2 * Math.PI * r));
      const { loop, topCount } = airfoilLoop(pfoil(t), high ? 10 : 6, 0, 1, false);
      topC = topCount;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      R.push(loop.map(([xc, yv]) => {
        const a = (xc - 0.3) * c, b = yv * c;
        const x = -cp * a - sp * b, z = sp * a - cp * b - 0.07;
        return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z];
      }));
    }
    prop.loft(R, {
      out: (p) => [0, 0, -1], capEnd: true, capStart: true,
      color: (p, i, j) => {
        const r = Math.hypot(p[0], p[1]);
        if (r > 0.83) return r > 0.87 && r < 0.91 ? C.white : C.red;
        return j >= 0 && j < topC ? srgb('#8e949b') : C.black;
      },
    });
  }

  // ---------- assemble ----------
  const meshes = {};
  const mk = (name, B, mat, opts = {}) => {
    const m = new THREE.Mesh(B.build(), mat);
    m.name = name;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = !!opts.receive;
    meshes[name] = m;
    return m;
  };
  const group = new THREE.Group();
  group.add(mk('body', body, mats.paint, { receive: true }));
  group.add(mk('trim', trim, mats.trim, { receive: true }));
  const glassMesh = mk('glass', glass, mats.glass, { cast: false });
  glassMesh.renderOrder = 2;
  group.add(glassMesh);
  group.add(mk('lights', lights, mats.lights, { cast: false }));
  group.add(mk('beacon', beaconGeo, mats.beacon, { cast: false }));

  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) {
    const pivot = new THREE.Object3D();
    pivot.position.set(...pc.a);
    const dir = new THREE.Vector3(...pc.b).sub(pivot.position).normalize();
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    pivot.updateMatrix();
    const geo = pc.builder.build();
    geo.applyMatrix4(pivot.matrix.clone().invert());
    const m = new THREE.Mesh(geo, mats.paint);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    pivot.add(m);
    group.add(pivot);
    hinges[name] = m;
    meshes[name] = m;
  }

  const propGroup = new THREE.Group();
  propGroup.position.set(0, THRUST_Y, 0.27);
  const propGeo = prop.build();
  const propMesh = new THREE.Mesh(propGeo, mats.prop);
  propMesh.castShadow = true;
  propMesh.name = 'prop';
  const spinnerMesh = new THREE.Mesh(spin.build(), mats.prop);
  spinnerMesh.castShadow = true;
  spinnerMesh.name = 'spinner';
  propGroup.add(propMesh, spinnerMesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, high ? 48 : 28), mats.disc);
  disc.position.z = -0.07;
  disc.renderOrder = 3;
  disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);

  return { group, meshes, hinges, propGroup, propMesh, disc, spinnerMesh, lightPts, beaconPos };
}

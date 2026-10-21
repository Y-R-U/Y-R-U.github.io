import { RUNWAYS, TAXIWAYS, TAXIWAY_WIDTH, HOLD_OFFSET, headingToVec, threshold } from './layout.js';
import { segInRect } from './util.js';

export const HOLD_DIST = HOLD_OFFSET;
export const PAD_LEN = 45;

export const FRAMES = RUNWAYS.map((rw) => {
  const [dx, dz] = headingToVec(rw.heading);
  const W = rw.width, L = rw.length;
  const shoulder = W >= 30 ? 6 : 4;
  return {
    rw, id: rw.id, cx: rw.center[0], cz: rw.center[2], dx, dz, rx: -dz, rz: dx, L, W, shoulder,
    rect: { cx: rw.center[0], cz: rw.center[2], dx, dz, len: L, wid: W },
    strip: { cx: rw.center[0], cz: rw.center[2], dx, dz, len: L + 2 * PAD_LEN, wid: W + 2 * shoulder },
  };
});

// Point at distance a past threshold of end e (0|1), tp metres right of centreline from that pilot's view.
export function rwPt(F, e, a, tp) {
  const sg = e === 0 ? 1 : -1;
  const s = sg * (a - F.L / 2), t = sg * tp;
  return [F.cx + F.dx * s + F.rx * t, F.cz + F.dz * s + F.rz * t];
}

export function rwDir(F, e) {
  return e === 0 ? [F.dx, F.dz] : [-F.dx, -F.dz];
}

export const SEGMENTS = TAXIWAYS.map((t) => {
  const [p0, p1] = t.points;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const dx = (p1[0] - p0[0]) / len, dz = (p1[1] - p0[1]) / len;
  return {
    id: t.id, p0, p1, dx, dz, len,
    rect: { cx: (p0[0] + p1[0]) / 2, cz: (p0[1] + p1[1]) / 2, dx, dz, len: len + TAXIWAY_WIDTH, wid: TAXIWAY_WIDTH },
  };
});

// Runway holding positions: where a taxiway centreline that enters a runway crosses HOLD_DIST from its centreline.
export const HOLDS = [];
for (const S of SEGMENTS) {
  for (const F of FRAMES) {
    if (!segInRect(S.p0, S.p1, F.rect)) continue;
    const d0 = (S.p0[0] - F.cx) * F.rx + (S.p0[1] - F.cz) * F.rz;
    const d1 = (S.p1[0] - F.cx) * F.rx + (S.p1[1] - F.cz) * F.rz;
    for (const target of [-HOLD_DIST, HOLD_DIST]) {
      if (Math.abs(d1 - d0) < 1e-6) continue;
      const t = (target - d0) / (d1 - d0);
      if (t < 0 || t > 1) continue;
      const x = S.p0[0] + (S.p1[0] - S.p0[0]) * t, z = S.p0[1] + (S.p1[1] - S.p0[1]) * t;
      const toward = Math.sign(-target * (d1 - d0)) > 0 ? 1 : -1;
      const hx = S.dx * toward, hz = S.dz * toward;
      const lx = hz, lz = -hx;
      const [e0, e1] = F.rw.ends;
      const t0 = threshold(F.rw, e0);
      const leftIs0 = (t0[0] - x) * lx + (t0[1] - z) * lz > 0;
      HOLDS.push({ x, z, hx, hz, runway: F.id, taxiway: S.id, text: leftIs0 ? `${e0}-${e1}` : `${e1}-${e0}` });
    }
  }
}

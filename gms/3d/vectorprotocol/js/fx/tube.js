import * as THREE from 'three';

// Tapered tube along a path (battle-7): shared by the fx.tube pool (roots / vines that grow) and static scenery (hanging vines, roots).
// samplePath(points|curve, n) -> n+1 evenly spaced { p, t } with parallel-transported frames (no Frenet flips on straight runs).
export function samplePath(path, n) {
  const curve = path?.isCurve ? path : new THREE.CatmullRomCurve3(path.map((p) => p.clone()), false, 'centripetal');
  const pts = curve.getSpacedPoints(n);
  const T = [], N = [], B = [];
  for (let i = 0; i <= n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  // initial normal: any vector perpendicular to the first tangent
  const t0 = T[0], up = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(new THREE.Vector3().crossVectors(t0, up).normalize());
  B.push(new THREE.Vector3().crossVectors(t0, N[0]).normalize());
  const q = new THREE.Quaternion();
  for (let i = 1; i <= n; i++) {
    q.setFromUnitVectors(T[i - 1], T[i]);
    const nn = N[i - 1].clone().applyQuaternion(q).normalize();
    N.push(nn); B.push(new THREE.Vector3().crossVectors(T[i], nn).normalize());
  }
  let len = 0;
  const S = [0];
  for (let i = 1; i <= n; i++) { len += pts[i].distanceTo(pts[i - 1]); S.push(len); }
  return { pts, T, N, B, S, len };
}

// Static tube geometry: radius r0 -> r1 along the path (tip closes to a point when r1 = 0), `rad` sides. uv = (angle, metres along).
// Optional `bulge(t)` multiplies the radius (knots, root flare).
export function tubeGeometry(path, { r0 = 0.1, r1 = 0.02, seg = 16, rad = 6, bulge = null } = {}) {
  const P = samplePath(path, seg);
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = (r0 + (r1 - r0) * t) * (bulge ? bulge(t) : 1);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = P.N[i].x * c + P.B[i].x * s, ny = P.N[i].y * c + P.B[i].y * s, nz = P.N[i].z * c + P.B[i].z * s;
      pos.push(P.pts[i].x + nx * r, P.pts[i].y + ny * r, P.pts[i].z + nz * r);
      nrm.push(nx, ny, nz); uv.push(j / rad, P.S[i]);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

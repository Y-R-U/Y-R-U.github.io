import * as THREE from 'three';

// Angles use the "theta" convention everywhere in js/world: point = (cx + r sin θ, cz + r cos θ).
export const D2R = Math.PI / 180;
export const polar = (cx, cz, r, th) => [cx + r * Math.sin(th), cz + r * Math.cos(th)];

// Annular-sector slab between y0 and y1.
export function arcSlab(r0, r1, th0, th1, y0, y1, segs = 48) {
  const s = new THREE.Shape();
  for (let i = 0; i <= segs; i++) { const t = th0 + (th1 - th0) * i / segs; const p = [r1 * Math.sin(t), -r1 * Math.cos(t)]; i ? s.lineTo(...p) : s.moveTo(...p); }
  for (let i = segs; i >= 0; i--) { const t = th0 + (th1 - th0) * i / segs; s.lineTo(r0 * Math.sin(t), -r0 * Math.cos(t)); }
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

// Vertical curved wall / glass panel (open cylinder segment).
export function arcWall(r, th0, th1, y0, y1, segs = 48, flip = false) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, segs, 1, true, th0, th1 - th0);
  g.translate(0, (y0 + y1) / 2, 0);
  if (flip) flipNormals(g);
  return g;
}

export function flipNormals(g) {
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const idx = g.index; if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); }
  return g;
}

// Tube along an arc at a given height (handrails, trims).
export function arcTube(r, th0, th1, y, rad = 0.05, segs = 64) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const t = th0 + (th1 - th0) * i / segs; pts.push(new THREE.Vector3(r * Math.sin(t), y, r * Math.cos(t))); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, rad, 6, false);
}

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, x = 0, y = 0, z = 0, segs = 16) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs);
  g.translate(x, y + h / 2, z);
  return g;
}

// Rounded-profile planter/curb along a straight line; returns geometry centred at origin, long axis X.
export function roundedBar(len, w, h, r = 0.25) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, h - r); s.quadraticCurveTo(hw, h, hw - r, h);
  s.lineTo(-hw + r, h); s.quadraticCurveTo(-hw, h, -hw, h - r); s.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export function lathe(points, segs = 24) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

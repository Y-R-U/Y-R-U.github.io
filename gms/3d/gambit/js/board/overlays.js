// GAMBIT board overlays: square tints (last move, selection, hint, hover), check glow,
// legal-move dots / capture rings, arrows. Flat meshes just above y=0, few draw calls.
import * as THREE from 'three';
import * as kit from '../themes/kit.js';

const Y = 0.004;
const _m = new THREE.Matrix4();

function sqXZ(sq) { return [sq.charCodeAt(0) - 97 - 3.5, 3.5 - (sq.charCodeAt(1) - 49)]; }

class SquareLayer {
  constructor(parent, geom, color, opacity, y, order, depthTest = true) {
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geom, this.mat, 64);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.y = y;
    parent.add(this.mesh);
  }
  set(squares) {
    let i = 0;
    for (const sq of squares || []) {
      if (!sq || i >= 64) continue;
      const [x, z] = sqXZ(sq);
      _m.makeTranslation(x, this.y, z); this.mesh.setMatrixAt(i++, _m);
    }
    this.mesh.count = i; this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Overlays {
  constructor(scene, style = {}) {
    this.group = new THREE.Group(); this.group.name = 'overlays';
    scene.add(this.group);
    const sqGeom = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.geoms = [sqGeom];
    const s = { lastMove: '#f6d743', select: '#f6d743', hint: '#4fb3ff', hover: '#ffffff', dot: '#1b1b1b', ...style };
    this.lastMove = new SquareLayer(this.group, sqGeom, s.lastMove, 0.42, Y, 1);
    this.select = new SquareLayer(this.group, sqGeom, s.select, 0.55, Y + 0.0005, 1);
    this.hint = new SquareLayer(this.group, sqGeom, s.hint, 0.45, Y + 0.001, 1);
    const hoverG = new THREE.RingGeometry(0.43, 0.5, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2); this.geoms.push(hoverG);
    hoverG.scale(Math.SQRT2, 1, Math.SQRT2);
    this.hover = new SquareLayer(this.group, hoverG, s.hover, 0.75, Y + 0.0015, 2);
    const dotG = new THREE.CircleGeometry(0.15, 28).rotateX(-Math.PI / 2); this.geoms.push(dotG);
    this.dots = new SquareLayer(this.group, dotG, s.dot, 0.28, Y + 0.002, 2);
    const ringG = new THREE.RingGeometry(0.39, 0.48, 40).rotateX(-Math.PI / 2); this.geoms.push(ringG);
    this.rings = new SquareLayer(this.group, ringG, s.dot, 0.30, Y + 0.002, 2);
    // check glow: radial gradient
    const tex = kit.canvasTexture(128, 128, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,40,30,1)'); g.addColorStop(0.45, 'rgba(240,30,20,0.75)'); g.addColorStop(1, 'rgba(200,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    // checkalert: the glow is unlit + not tone-mapped so it stays a saturated red in every theme
    this.checkMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.check = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), this.checkMat);
    this.check.visible = false; this.check.renderOrder = 1; this.group.add(this.check);
    // checkalert: solid red fill + thick red frame on the king's square (readable on the flat Plain
    // theme and from overhead at phone size), lighter fill + frame on each checking piece's square,
    // and a red arrow from each checker to the king (two for a double check; knights get a direct arrow:
    // the L would cross the pieces beside the king).
    const frameG = (inner) => { const g = new THREE.RingGeometry(inner, 0.5, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2); g.scale(Math.SQRT2, 1, Math.SQRT2); this.geoms.push(g); return g; };
    const red = (layer) => { layer.mat.toneMapped = false; return layer; };
    this.checkFill = red(new SquareLayer(this.group, sqGeom, '#ff1f12', 0.42, Y + 0.0009, 1));
    this.checkFrame = red(new SquareLayer(this.group, frameG(0.405), '#ff2a1a', 0.95, Y + 0.0018, 2));
    this.checkerFill = red(new SquareLayer(this.group, sqGeom, '#ff3a22', 0.34, Y + 0.0009, 1));
    this.checkerFrame = red(new SquareLayer(this.group, frameG(0.44), '#ff2a1a', 0.85, Y + 0.0018, 2));
    this.checkArrowGroup = new THREE.Group(); this.checkArrowGroup.name = 'check-links'; this.group.add(this.checkArrowGroup);
    this.checkArrowMat = new THREE.MeshBasicMaterial({ color: '#ff2414', transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.checkArrowEdge = new THREE.MeshBasicMaterial({ color: '#2a0303', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.arrowGroup = new THREE.Group(); this.group.add(this.arrowGroup);
    this.arrowMats = new Map();
  }
  /** Re-colour for a new theme's overlayStyle (ui-4: was only read from the first theme loaded). */
  setStyle(style = {}) {
    const s = { lastMove: '#f6d743', select: '#f6d743', hint: '#4fb3ff', hover: '#ffffff', dot: '#1b1b1b', ...style };
    this.lastMove.mat.color.set(s.lastMove); this.select.mat.color.set(s.select); this.hint.mat.color.set(s.hint);
    this.hover.mat.color.set(s.hover); this.dots.mat.color.set(s.dot); this.rings.mat.color.set(s.dot);
  }
  setCheck(sq) {
    this.checkFill.set(sq ? [sq] : []); this.checkFrame.set(sq ? [sq] : []);
    if (!sq) { this.check.visible = false; return; }
    const [x, z] = sqXZ(sq); this.check.position.set(x, Y + 0.0008, z); this.check.visible = true;
  }
  /** checkalert: tint the checking pieces' squares and draw a red link from each to the king. */
  setCheckers(king, checkers) {
    const list = king ? (checkers || []).filter(Boolean) : [];
    this.checkerFill.set(list); this.checkerFrame.set(list);
    for (const c of [...this.checkArrowGroup.children]) { this.checkArrowGroup.remove(c); c.geometry.dispose(); }
    for (const from of list) {
      const [x0, z0] = sqXZ(from), [x1, z1] = sqXZ(king);
      const k = Math.hypot(x1 - x0, z1 - z0) < 1.2 ? 0.66 : 1;   // adjacent orthogonal checker: shorter gaps + head
      const edge = new THREE.Mesh(arrowGeometry(from, king, 0.25, { start: 0.3 * k, end: 0.3 * k, head: 0.5 * k, y: 0.049, straight: true }), this.checkArrowEdge);
      const core = new THREE.Mesh(arrowGeometry(from, king, 0.15, { start: 0.32 * k, end: 0.34 * k, head: 0.42 * k, y: 0.05, straight: true }), this.checkArrowMat);
      edge.renderOrder = 7; core.renderOrder = 8; edge.name = 'check-link-edge'; core.name = 'check-link';
      this.checkArrowGroup.add(edge, core);
    }
  }
  /** occupied(sq) -> bool decides dot vs capture ring. */
  setTargets(targets, occupied) {
    const dots = [], rings = [];
    for (const t of targets || []) (occupied(t) ? rings : dots).push(t);
    this.dots.set(dots); this.rings.set(rings);
  }
  /** arrows: [{from, to, color?, opacity?, width?}] */
  setArrows(arrows) {
    for (const c of [...this.arrowGroup.children]) { this.arrowGroup.remove(c); c.geometry.dispose(); }
    for (const a of arrows || []) {
      if (!a || !a.from || !a.to || a.from === a.to) continue;
      const color = a.color || '#ffa81f', op = a.opacity ?? 0.82;
      const key = color + op;
      if (!this.arrowMats.has(key)) this.arrowMats.set(key, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(arrowGeometry(a.from, a.to, a.width ?? 0.2), this.arrowMats.get(key));
      mesh.renderOrder = 8; this.arrowGroup.add(mesh);
    }
  }
  dispose() {
    this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose?.(); } });
    for (const m of this.arrowMats.values()) m.dispose();
    this.checkArrowMat.dispose(); this.checkArrowEdge.dispose();
    this.group.parent?.remove(this.group);
  }
}

/** Flat arrow (straight, or L-shaped for knight jumps), lying at y≈0.05.
 *  opt (checkalert): start = gap at the tail, end = gap before `to`'s centre, head = head length, y. */
function arrowGeometry(from, to, w, opt = {}) {
  const [x0, z0] = sqXZ(from), [x1, z1] = sqXZ(to);
  const dx = x1 - x0, dz = z1 - z0;
  const pts = [[x0, z0]];
  if (!opt.straight && ((Math.abs(dx) === 1 && Math.abs(dz) === 2) || (Math.abs(dx) === 2 && Math.abs(dz) === 1))) {
    if (Math.abs(dz) > Math.abs(dx)) pts.push([x0, z1]); else pts.push([x1, z0]);
  }
  pts.push([x1, z1]);
  // shorten start a little, stop the shaft before the head
  const head = opt.head ?? 0.42, hw = w * 2.3, startGap = opt.start ?? 0.28, endGap = opt.end ?? 0;
  const shape = new THREE.Shape();
  // build as a polyline outline: left side forward, right side back
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  const first = segs[0], last = segs[segs.length - 1];
  const norm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const d0 = norm(first[0], first[1]); first[0] = [first[0][0] + d0[0] * startGap, first[0][1] + d0[1] * startGap];
  const dl = norm(last[0], last[1]);
  const tip = [last[1][0] - dl[0] * endGap, last[1][1] - dl[1] * endGap]; last[1] = [tip[0] - dl[0] * head, tip[1] - dl[1] * head];
  const L = [], R = [];
  const path = [segs[0][0], ...segs.map(s => s[1])];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let d = norm(i === 0 ? path[0] : a, i === 0 ? path[1] : b);
    let ox = -d[1] * w / 2, oz = d[0] * w / 2;
    if (i > 0 && i < path.length - 1) { // miter at the L corner
      const d1 = norm(path[i - 1], path[i]), d2 = norm(path[i], path[i + 1]);
      ox = (-d1[1] - d2[1]) * w / 2; oz = (d1[0] + d2[0]) * w / 2;
    }
    L.push([path[i][0] + ox, path[i][1] + oz]); R.push([path[i][0] - ox, path[i][1] - oz]);
  }
  const end = path[path.length - 1];
  const hx = -dl[1] * hw / 2, hz = dl[0] * hw / 2;
  const outline = [...L, [end[0] + hx, end[1] + hz], tip, [end[0] - hx, end[1] - hz], ...R.reverse()];
  shape.moveTo(outline[0][0], -outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], -outline[i][1]);
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2); // shape y = -z  → world z
  g.translate(0, opt.y ?? 0.05, 0);
  return g;
}

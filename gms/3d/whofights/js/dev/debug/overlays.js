// Wireframe overlays drawn into the live scene: hotspot shapes, the camera-ray collider boxes,
// the interior wall slabs, a walkability probe, the ground-height probe and a world grid.
//
// Exposed on window.__wf.debug.overlays and shared by convention — if another tab wants hotspot
// wireframes it should call show('hotspots', true) rather than drawing a second set.

import * as THREE from 'three';
import { walkStep } from '../../world/colliders.js';

const COL = {
  enter: 0x4bd07a, exit: 0x6fb7ff, interact: 0xffc861, click: 0xffc861, always: 0xd08bff,
  collider: 0xff7a7a, interior: 0xff9ad0, walk: 0xff5a5a, grid: 0x2a3a4d, probe: 0x6cc0ff,
  character: 0x8fe0dc,
};

const NOOP = () => {};

export const KINDS = ['hotspots', 'colliders', 'interior', 'walk', 'probe', 'grid', 'characters'];

export class Overlays {
  constructor(g) {
    this.g = g;
    this.on = new Set();
    this.root = new THREE.Group();
    this.root.name = 'wf-debug-overlays';
    this.root.renderOrder = 999;
    this.groups = Object.fromEntries(KINDS.map(k => {
      const gr = new THREE.Group();
      gr.name = `dbg:${k}`;
      gr.visible = false;
      this.root.add(gr);
      return [k, gr];
    }));
    this.mats = new Map();
    g.scene?.add(this.root);
    this.probeMesh = null;
  }

  mat(hex, opacity = 0.85) {
    const key = `${hex}:${opacity}`;
    if (!this.mats.has(key)) {
      this.mats.set(key, new THREE.LineBasicMaterial({
        color: hex, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false,
      }));
    }
    return this.mats.get(key);
  }

  visible(kind) { return this.on.has(kind); }

  show(kind, want = true) {
    if (!this.groups[kind]) return false;
    if (want) this.on.add(kind); else this.on.delete(kind);
    this.groups[kind].visible = want;
    if (want) this.build(kind);
    else clearGroup(this.groups[kind]);
    return true;
  }

  toggle(kind) { return this.show(kind, !this.on.has(kind)); }

  refresh() { for (const k of this.on) { clearGroup(this.groups[k]); this.build(k); } }

  // Called from the panel's own timer, not the game loop: only the probe moves with the player,
  // and rebuilding a few hundred lines every frame is not worth a debug marker.
  tick() { if (this.on.has('probe')) { clearGroup(this.groups.probe); this.build('probe'); } }

  build(kind) {
    const g = this.groups[kind];
    try { this[`build_${kind}`]?.(g); }
    catch (e) { console.warn(`[debug] overlay ${kind} failed: ${e.message}`); }
    // A debug wireframe must never be what a pick ray hits, here or anywhere else.
    g.traverse(o => { o.raycast = NOOP; o.userData.wfDebug = true; });
  }

  build_hotspots(out) {
    const list = this.g.session?.hotspots?.list || this.g.level?.hotspots || [];
    for (const h of list) {
      const shape = this.g.session?.hotspots?.shapeOf?.(h) || h.shape;
      if (!shape) continue;
      const col = COL[h.trigger] || 0xffffff;
      const y = this.groundAt(shape.k === 'circle' ? shape.x : (shape.x0 + shape.x1) / 2,
        shape.k === 'circle' ? shape.z : (shape.z0 + shape.z1) / 2) + 0.08;
      if (shape.k === 'circle') out.add(this.ring(shape.x, y, shape.z, shape.r, col), this.pillar(shape.x, y, shape.z, col));
      else {
        out.add(this.rect(shape.x0, shape.z0, shape.x1, shape.z1, y, col));
        out.add(this.pillar((shape.x0 + shape.x1) / 2, y, (shape.z0 + shape.z1) / 2, col));
      }
    }
  }

  build_colliders(out) {
    for (const b of this.g.doors?.colliders?.boxes || []) out.add(this.box(b, COL.collider));
  }

  build_interior(out) {
    for (const b of this.g.doors?.colliders?.extra || []) out.add(this.box(b, COL.interior));
  }

  // Walkability sampled rather than drawn from the boxes: the walk grid lives in a module-local
  // index with no accessor, and probing the same function the player walks through is the more
  // honest answer anyway.
  build_walk(out) {
    const p = this.g.player?.pos;
    if (!p) return;
    const N = 13, STEP = 1.6, E = 0.35;
    const pts = [];
    for (let i = -N; i <= N; i++) {
      for (let j = -N; j <= N; j++) {
        const x = p.x + i * STEP, z = p.z + j * STEP;
        const r = walkStep(x, z, x + E, z, p.y, 0.34);
        if (Math.abs(r.x - (x + E)) < 1e-3 && Math.abs(r.z - z) < 1e-3) continue;
        const y = this.groundAt(x, z) + 0.1;
        pts.push(x - 0.35, y, z, x + 0.35, y, z, x, y, z - 0.35, x, y, z + 0.35);
      }
    }
    if (pts.length) out.add(new THREE.LineSegments(geom(pts), this.mat(COL.walk, 0.7)));
  }

  build_probe(out) {
    const p = this.g.player?.pos;
    if (!p) return;
    const t = this.g.world?.terrain;
    const surf = t?.surfaceY ? t.surfaceY(p.x, p.z) : 0;
    out.add(this.ring(p.x, surf + 0.02, p.z, 0.34, COL.probe));
    out.add(this.ring(p.x, p.y + 0.02, p.z, 0.5, p.y - surf > 0.05 ? COL.walk : COL.probe));
    out.add(new THREE.LineSegments(geom([p.x, surf, p.z, p.x, p.y + 2.2, p.z]), this.mat(COL.probe)));
  }

  build_characters(out) {
    const c = this.g.characters;
    if (!c) return;
    for (const [, a] of c.bodies || []) {
      const y = this.groundAt(a.x, a.z);
      out.add(this.ring(a.x, y + 0.05, a.z, 0.5, COL.character));
      out.add(new THREE.LineSegments(geom([a.x, y, a.z, a.x, y + 2.4, a.z]), this.mat(COL.character, 0.6)));
    }
  }

  build_grid(out) {
    const p = this.g.player?.pos || { x: 0, z: 0 };
    const cx = Math.round(p.x / 10) * 10, cz = Math.round(p.z / 10) * 10;
    const R = 60, pts = [];
    for (let i = -R; i <= R; i += 10) {
      for (let t = -R; t < R; t += 5) {
        pts.push(cx + i, this.groundAt(cx + i, cz + t) + 0.05, cz + t, cx + i, this.groundAt(cx + i, cz + t + 5) + 0.05, cz + t + 5);
        pts.push(cx + t, this.groundAt(cx + t, cz + i) + 0.05, cz + i, cx + t + 5, this.groundAt(cx + t + 5, cz + i) + 0.05, cz + i);
      }
    }
    out.add(new THREE.LineSegments(geom(pts), this.mat(COL.grid, 0.5)));
  }

  groundAt(x, z) {
    const t = this.g.world?.terrain;
    try { return t?.surfaceY ? t.surfaceY(x, z) : 0; } catch { return 0; }
  }

  ring(x, y, z, r, col, n = 48) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      pts.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r);
    }
    return new THREE.LineSegments(geom(pts), this.mat(col));
  }

  pillar(x, y, z, col) {
    return new THREE.LineSegments(geom([x, y, z, x, y + 3, z]), this.mat(col, 0.5));
  }

  rect(x0, z0, x1, z1, y, col) {
    return new THREE.LineSegments(geom([
      x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0,
    ]), this.mat(col));
  }

  // A collider box is oriented in the xz plane and axis-aligned in y — twelve edges from its own
  // half-extents, rotated by the cos/sin it already carries.
  box(b, col) {
    const { hw, hd, c, s } = b;
    const y0 = b.y0 ?? 0, y1 = b.y1 ?? y0 + 1;
    const corner = (sx, sz) => [b.x + sx * hw * c + sz * hd * s, b.z - sx * hw * s + sz * hd * c];
    const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const a = cs[i], d = cs[(i + 1) % 4];
      pts.push(a[0], y0, a[1], d[0], y0, d[1]);
      pts.push(a[0], y1, a[1], d[0], y1, d[1]);
      pts.push(a[0], y0, a[1], a[0], y1, a[1]);
    }
    return new THREE.LineSegments(geom(pts), this.mat(col, 0.55));
  }

  dispose() {
    for (const k of KINDS) clearGroup(this.groups[k]);
    this.root.parent?.remove(this.root);
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

function geom(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.geometry?.dispose?.();
  }
}

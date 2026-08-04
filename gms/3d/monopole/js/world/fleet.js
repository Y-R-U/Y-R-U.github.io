// fleet() — formations of hulls, and the per-tick mover that flies the live company's ships
// between sites.
//
// The whole component is about draw calls. A hauler is ten meshes at LOD 0 and there is nothing
// left to win inside one hull, so a fleet merges *across* ships: every mesh in the formation is
// baked into fleet space and merged per material. Twenty-four hulls of one class cost the same
// ten calls as one, and the count only grows with the number of distinct classes in the set.
//
// Instancing was the other option and it does not work here: the ship shader recomputes vWP from
// modelMatrix × transformed and never sees instanceMatrix, so every instance would light as if it
// were at the mesh origin.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shipClass, lodForDistance } from './kit/ship.js';
import { beams } from './fx.js';

// x, y, z in hull lengths; ry in radians; lod is a hint the caller can override.
const FORMATIONS = {
  // abreast, the classic broadside rank
  line: (i, n) => ({ x: (i - (n - 1) / 2) * 1.9, y: ((i % 3) - 1) * 0.10, z: (i % 2) * 0.35, ry: 0, lod: 0 }),

  // one behind another down the lens — the cheapest scale cue there is
  column: (i, n) => ({ x: ((i % 2) - 0.5) * 0.5, y: (i % 3) * 0.12, z: -i * 3.1, ry: 0, lod: i < 2 ? 0 : i < 5 ? 1 : 2 }),

  // a V opening away from the camera
  wedge: (i, n) => {
    const s = i === 0 ? 0 : (i % 2 ? 1 : -1);
    const r = Math.ceil(i / 2);
    return { x: s * r * 1.7, y: -r * 0.16, z: -r * 2.2, ry: 0, lod: r < 2 ? 0 : r < 4 ? 1 : 2 };
  },

  // a diagonal stack, every hull clear of the one in front
  echelon: (i, n) => ({ x: i * 1.55, y: i * 0.22, z: -i * 1.85, ry: 0, lod: i < 3 ? 0 : i < 6 ? 1 : 2 }),

  // 1840080_02's read: rows receding into the backdrop, each row wider and higher than the last,
  // so the eye gets four distinct depth planes rather than one smear
  ranks: (i, n) => {
    const rows = Math.max(1, Math.round(Math.sqrt(n * 0.85)));
    const per = Math.ceil(n / rows);
    const r = Math.floor(i / per), c = i % per;
    const w = per + r * 0.8;
    return {
      x: (c - (per - 1) / 2) * (1.5 + r * 0.24) + (r % 2 ? 0.7 : 0),
      y: r * 0.36 - (c % 2) * 0.14,
      z: -r * 2.6 - (c % 3) * 0.55,
      ry: 0, lod: r === 0 ? 0 : r < 3 ? 1 : 2,
    };
  },

  // loose, for a yard or a holding pattern
  swarm: (i, n) => {
    const a = i * 2.399963;
    const r = Math.sqrt(i + 0.6) * 1.6;
    return { x: Math.cos(a) * r, y: Math.sin(a * 1.7) * 0.7, z: -Math.sin(a) * r * 2.2, ry: a * 0.3, lod: r > 5 ? 1 : 0 };
  },
};

export const allFormations = () => Object.keys(FORMATIONS);

const LEN = { hauler: 84, rig: 62, escort: 38 };

// A ship's meshes carry three kinds of material: the cached kit ones (named palette:surface:class),
// the emissive buckets that are rebuilt per ship but identical in every respect, and the decal
// sheet which differs only by its map. Keying on what actually distinguishes them is what lets a
// 24-hull fleet collapse to twenty calls instead of two hundred.
function matKey(m) {
  if (m.name) return m.name;
  const u = m.userData || {};
  return `${u.palette || '-'}:${u.surface || m.type}:${m.map?.uuid || '-'}`;
}

const WANT = ['position', 'normal', 'uv', 'color'];

function conform(g) {
  for (const k of Object.keys(g.attributes)) if (!WANT.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3); c.fill(1);
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  }
  return g;
}

// Bakes every mesh under `src` into one mesh per material. `src` must be at the identity or the
// baked matrices land in the wrong space.
export function mergeAcross(src) {
  src.updateMatrixWorld(true);
  const buckets = new Map();
  src.traverse(n => {
    if (!n.isMesh || !n.geometry) return;
    const k = matKey(n.material);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { material: n.material, geos: [], order: 0 }));
    b.order = Math.max(b.order, n.renderOrder || 0);
    const g = conform(n.geometry.clone());
    g.applyMatrix4(n.matrixWorld);
    b.geos.push(g);
  });

  const out = new THREE.Group();
  for (const [, b] of buckets) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.renderOrder = b.order;
    out.add(mesh);
    for (const g of b.geos) if (g !== merged) g.dispose();
  }
  src.traverse(n => { if (n.isMesh) n.geometry.dispose(); });
  return out;
}

/**
 * fleet(formationId, entries, { spacing })
 * entries: 'hauler' | { class, palette, lod, seed, scale, ry, pos }
 * Returns an Object3D whose origin is the lead hull.
 */
export function fleet(formationId, entries, { spacing = 1, merge = true, gap = 1 } = {}) {
  const f = FORMATIONS[formationId] || FORMATIONS.line;
  const list = (entries || []).map((e, i) => (typeof e === 'string' ? { class: e } : { ...e }));
  const n = list.length;
  const staging = new THREE.Group();

  // one unit for the whole set, not per hull: spacing off each ship's own length collapses the
  // rank wherever an escort lands and the formation stops reading as a formation
  const L = list.reduce((m, e) => Math.max(m, LEN[e.class || 'hauler'] || 60), 0) * gap * spacing;

  list.forEach((e, i) => {
    const slot = f(i, n);
    const cls = e.class || 'hauler';
    const lod = e.lod ?? slot.lod ?? 0;
    const o = shipClass(cls, { palette: e.palette || 'ferrous', lod, seed: e.seed ?? i * 37 + 5 });
    const p = e.pos || [slot.x * L, slot.y * L, slot.z * L];
    o.position.set(p[0], p[1], p[2]);
    o.rotation.set((i % 3 - 1) * 0.02, e.ry ?? slot.ry ?? 0, (i % 2 ? 1 : -1) * 0.018);
    if (e.scale) o.scale.setScalar(e.scale);
    staging.add(o);
  });

  if (!merge) { staging.name = `fleet:${formationId}`; return staging; }
  const out = mergeAcross(staging);
  out.name = `fleet:${formationId}`;
  out.userData = { formation: formationId, hulls: n };
  return out;
}

/* ── the per-tick mover ──────────────────────────────────────────────────────
   The 3D never reads sim state; it replays events. `depart` puts a hull on a curve, `arrive`
   docks it, `mine` holds a beam. Between ticks the hull lerps along the curve by the clock's
   fraction, so the scene stays alive at every speed and identical at all of them. */

const UP = new THREE.Vector3(0, 1, 0);

export function routeCurve(a, b, arc = 0) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const d = b.clone().sub(a);
  const len = d.length() || 1;
  const side = new THREE.Vector3().crossVectors(d, UP).normalize();
  if (!isFinite(side.x)) side.set(1, 0, 0);
  mid.addScaledVector(side, arc * len * 0.5).addScaledVector(UP, arc * len * 0.16);
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

export function shipMover({ root, anchor, build, beamTarget = null, beamColor = '#8df0c8' }) {
  const avatars = new Map();
  const P = new THREE.Vector3(), Q = new THREE.Vector3();

  const ensure = (id, classId, palette) => {
    let a = avatars.get(id);
    if (a) return a;
    const obj = build(id, classId, palette);
    root.add(obj);
    a = { id, classId, obj, at: null, leg: null, curve: null, elapsed: 0, mining: 0, beam: null, bob: Math.random() * 6.28 };
    avatars.set(id, a);
    return a;
  };

  const dock = (a, siteId) => {
    a.at = siteId;
    a.leg = null;
    a.curve = null;
    const p = anchor(siteId, a);
    a.obj.position.copy(p.pos);
    if (p.face) faceAt(a.obj, p.face);
  };

  const setBeam = (a, on) => {
    if (on && !a.beam && beamTarget) {
      const t = beamTarget(a);
      if (t) {
        a.beam = beams([
          { from: a.obj.position.clone().add(new THREE.Vector3(7, 5, -12)), to: t },
          { from: a.obj.position.clone().add(new THREE.Vector3(-7, -3, 9)), to: t.clone().add(new THREE.Vector3(16, -13, 7)) },
        ], { color: beamColor, width: 1.0, glow: 1, dust: 1 });
        root.add(a.beam);
      }
    }
    if (a.beam) a.beam.visible = !!on;
  };

  return {
    avatars,
    get(id) { return avatars.get(id); },
    all() { return [...avatars.values()]; },

    // Seed the scene from a fresh game: everything docked where it starts. This is the one place
    // that reads a state snapshot, and only to place hulls before the first tick.
    seed(ships) {
      for (const sh of ships) {
        const a = ensure(sh.id, sh.class);
        dock(a, sh.at);
      }
    },

    // One tick's worth. Advance first, then replay: an `arrive` in this tick's list means the hull
    // reached the end of its curve during the gap that just finished.
    apply(events) {
      for (const a of avatars.values()) {
        if (a.leg) a.elapsed = Math.min(a.leg.weeks, a.elapsed + 1);
        a.mining = Math.max(0, a.mining - 1);
      }
      for (const e of events) {
        if (e.t === 'ship') ensure(e.ship, e.class);
        else if (e.t === 'arrive') { const a = ensure(e.ship, e.class); dock(a, e.site); setBeam(a, false); }
        else if (e.t === 'depart') {
          const a = ensure(e.ship, e.class);
          setBeam(a, false);
          const from = anchor(e.from, a).pos, to = anchor(e.to, a).pos;
          a.leg = { from: e.from, to: e.to, weeks: Math.max(1, e.weeks) };
          a.curve = routeCurve(from, to, e.arc || 0);
          a.elapsed = 0;
          a.at = null;
        } else if (e.t === 'mine') {
          const a = ensure(e.ship);
          a.mining = 2;
        } else if (e.t === 'scrap') {
          const a = avatars.get(e.ship);
          if (a) { root.remove(a.obj); if (a.beam) root.remove(a.beam); avatars.delete(e.ship); }
        } else if (e.t === 'layup') {
          const a = ensure(e.ship, e.class);
          if (e.site) dock(a, e.site);
          a.leg = null; a.curve = null; a.mining = 0; a.laidUp = true;
        }
      }
      for (const a of avatars.values()) setBeam(a, a.mining > 0);
    },

    // f is 0..1 through the current week; t is wall time, for the drift that keeps a docked hull
    // from looking frozen.
    update(f, t) {
      for (const a of avatars.values()) {
        const trail = a.trail !== undefined ? a.trail : (a.trail = a.obj.getObjectByName('trails') || null);
        if (trail) trail.visible = !!a.leg;
        if (a.leg && a.curve) {
          const u = Math.max(0, Math.min(1, (a.elapsed + f) / a.leg.weeks));
          a.curve.getPoint(u, P);
          a.curve.getPoint(Math.min(1, u + 0.004), Q);
          a.obj.position.copy(P);
          if (Q.distanceToSquared(P) > 1e-6) faceAt(a.obj, Q);
        } else {
          a.obj.position.y += Math.sin(t * 0.35 + a.bob) * 0.012;
        }
        if (a.beam?.visible) a.beam.scale.setScalar(1 + Math.sin(t * 3.1 + a.bob) * 0.012);
      }
    },

    clear() {
      for (const a of avatars.values()) { root.remove(a.obj); if (a.beam) root.remove(a.beam); }
      avatars.clear();
    },
  };
}

// Object3D.lookAt points +Z at the target; the kit's hulls are −Z forward, so aim the far side.
export function faceAt(obj, target) {
  obj.lookAt(obj.position.x * 2 - target.x, obj.position.y * 2 - target.y, obj.position.z * 2 - target.z);
}

export { lodForDistance };
export default fleet;

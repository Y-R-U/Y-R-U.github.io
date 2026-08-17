// §3.3 — the eight building prototypes, plus the LOD1/LOD2 unit box.
//
// Every prototype is authored in the SAME unit cell — x,z in [-0.5, 0.5], y in [0, 1] — and is
// placed by a non-uniform instance matrix (W, H, D) with its base on the ground. Detail comes
// from emissive, never from tris (§3.0), so a prototype is a handful of boxes and nothing more.
//
// The one non-obvious thing in this file is the UV baking, and it is §3.10 #1 — the window pitch
// is the game's primary scale cue and it is 3.6 m per row and 3.2 m per column on EVERY face of
// EVERY building. A single vec2 per-instance UV scale cannot do that: a 120 x 80 m mass scales x
// and z differently, so its two wall orientations need two different column scales. So each
// vertex carries `aFace`:
//
//   0 — a wall whose horizontal axis is world X   → uv.x scales by iUvScale.x
//   1 — a wall whose horizontal axis is world Z   → uv.x scales by iUvScale.z
//   2 — a roof or a floor                         → no window grid at all
//
// uv.x is the vertex's own unit-space coordinate along that axis (+0.5 so it lands in 0..1), and
// uv.y is its unit-space height. Sub-boxes therefore share one continuous UV field: a ledge at
// 55 % height lands at uv.y = 0.55 and its windows line up with the mass below it.

import * as THREE from 'three';

// The two tables live in city.js, not here: city.js must import cleanly into node for the
// determinism gate, and this file imports three.js. Re-exported so nothing downstream cares.
import { PROTO_IDS, PROTO_TRAITS } from './city.js';
export { PROTO_IDS, PROTO_TRAITS };

// ── the box builder ────────────────────────────────────────────────────────

class Mesher {
  constructor() { this.p = []; this.n = []; this.uv = []; this.f = []; this.i = []; this.boxes = []; }

  // One quad. `corners` are CCW from outside; `face` is the aFace code above.
  quad(nx, ny, nz, corners, face) {
    const base = this.p.length / 3;
    for (const c of corners) {
      this.p.push(c[0], c[1], c[2]);
      this.n.push(nx, ny, nz);
      this.f.push(face);
      if (face === 1) this.uv.push(c[2] + 0.5, c[1]);
      else if (face === 0) this.uv.push(c[0] + 0.5, c[1]);
      else this.uv.push(c[0] + 0.5, c[2] + 0.5);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // An axis-aligned box. `skip` drops faces that are never seen — the underside of anything
  // sitting on the ground or on another box, which is 2 tris each across 610 instances.
  box(x0, y0, z0, x1, y1, z1, skip = { bottom: true }) {
    this.boxes.push({ x0, y0, z0, x1, y1, z1 });
    this.quad(1, 0, 0, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1);
    this.quad(-1, 0, 0, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 1);
    this.quad(0, 0, 1, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0);
    this.quad(0, 0, -1, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0);
    if (!skip.top) this.quad(0, 1, 0, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 2);
    if (!skip.bottom) this.quad(0, -1, 0, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 2);
    return this;
  }

  // A centred box, the common case: half-extents in x/z, a y span.
  sym(hx, hz, y0, y1, skip) { return this.box(-hx, y0, -hz, hx, y1, hz, skip); }

  // An n-gon prism. uv.x runs 0..PI around the circumference, which is the perimeter of a
  // unit-diameter circle — so iUvScale.x = W/3.2/32 gives the same 3.2 m column pitch a flat wall
  // gets, and a drum reads at the same scale as the slab beside it.
  prism(sides, r, y0, y1, cap = true) {
    this.boxes.push({ x0: -r, y0, z0: -r, x1: r, y1, z1: r, round: true });
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
      const L = Math.hypot(mx, mz) || 1;
      const base = this.p.length / 3;
      const u0 = (i / sides) * Math.PI, u1 = ((i + 1) / sides) * Math.PI;
      const put = (x, y, z, u) => { this.p.push(x, y, z); this.n.push(mx / L, 0, mz / L); this.uv.push(u, y); this.f.push(0); };
      put(x0, y0, z0, u0); put(x1, y0, z1, u1); put(x1, y1, z1, u1); put(x0, y1, z0, u0);
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (cap) {
      const c = this.p.length / 3;
      this.p.push(0, y1, 0); this.n.push(0, 1, 0); this.uv.push(0.5, 0.5); this.f.push(2);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        this.p.push(Math.cos(a) * r, y1, Math.sin(a) * r); this.n.push(0, 1, 0);
        this.uv.push(Math.cos(a) * r + 0.5, Math.sin(a) * r + 0.5); this.f.push(2);
      }
      for (let i = 0; i < sides; i++) this.i.push(c, c + 1 + ((i + 1) % sides), c + 1 + i);
    }
    return this;
  }

  geometry(name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.f, 1));
    g.setIndex(this.i);
    g.name = name;
    // Every field sets frustumCulled = false (§3.2.3), but three still wants a sphere for
    // raycasting and for anything that later asks.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.87);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    return g;
  }
}

// ── the eight ──────────────────────────────────────────────────────────────
// The numbers are silhouette, not decoration. Setbacks, cornices and ledges are the repeated
// horizontal ticks of §3.10 #7 — repetition is what makes a 400 m facade countable.

const BUILD = {
  // ~35 % of all buildings. Body, cornice lip, chamfered cap, roof plant.
  slab: m => m
    .sym(0.46, 0.46, 0, 0.93)
    .sym(0.50, 0.50, 0.90, 0.945)
    .sym(0.38, 0.38, 0.945, 0.99, { bottom: true })
    .box(-0.17, 0.99, -0.10, 0.13, 1.0, 0.20, { bottom: true }),

  // The classic setback tower — three stacked masses, each 12 % narrower, with a lip at each step.
  taper: m => m
    .sym(0.50, 0.50, 0, 0.42)
    .sym(0.47, 0.47, 0.42, 0.452)
    .sym(0.44, 0.44, 0.452, 0.72)
    .sym(0.412, 0.412, 0.72, 0.752)
    .sym(0.387, 0.387, 0.752, 0.94)
    .sym(0.34, 0.34, 0.94, 0.985, { bottom: true })
    .box(-0.03, 0.985, -0.03, 0.03, 1.0, 0.03, { bottom: true }),

  // The strongest scale cue in the game: SIX masses with a ledge between each pair. Six and not
  // four because §3.10 #7 wants a ledge every 40-70 m and §3.1.1 pins the Ladder at 380 m with
  // ledges every 48 m — six segments puts the Ladder at 63 m and a 300 m seeded stack at 50 m,
  // and city.js will not choose `stack` below 200 m, where the rhythm would close up.
  stack: m => m
    .sym(0.500, 0.500, 0, 0.160)
    .sym(0.520, 0.520, 0.160, 0.170)
    .sym(0.478, 0.478, 0.170, 0.325)
    .sym(0.498, 0.498, 0.325, 0.335)
    .sym(0.456, 0.456, 0.335, 0.490)
    .sym(0.476, 0.476, 0.490, 0.500)
    .sym(0.434, 0.434, 0.500, 0.655)
    .sym(0.454, 0.454, 0.655, 0.665)
    .sym(0.412, 0.412, 0.665, 0.820)
    .sym(0.432, 0.432, 0.820, 0.830)
    .sym(0.390, 0.390, 0.830, 0.960)
    .sym(0.330, 0.330, 0.960, 1.0, { bottom: true }),

  // Rare, tall, gets the hero billboards. Wide base, mid mass, a narrow 30 % upper shaft, a mast.
  spire: m => m
    .sym(0.50, 0.50, 0, 0.34)
    .sym(0.50, 0.50, 0.34, 0.362)
    .sym(0.36, 0.36, 0.362, 0.62)
    .sym(0.30, 0.30, 0.62, 0.642)
    .sym(0.22, 0.22, 0.642, 0.90)
    .sym(0.16, 0.16, 0.90, 0.945, { bottom: true })
    .box(-0.022, 0.945, -0.022, 0.022, 1.0, 0.022, { bottom: true }),

  // Breaks the box rhythm. A 10-gon with a mid ledge and a flat cap.
  drum: m => m
    .prism(10, 0.5, 0, 0.50, false)
    .prism(10, 0.52, 0.50, 0.515, false)
    .prism(10, 0.5, 0.515, 0.93, true)
    .sym(0.30, 0.30, 0.93, 0.985, { bottom: true })
    .box(-0.09, 0.985, -0.09, 0.09, 1.0, 0.09, { bottom: true }),

  // Asymmetric: sheer on -x, stepping back on +x. Fills corner lots and makes canyons.
  terrace: m => m
    .box(-0.50, 0, -0.50, 0.50, 0.30, 0.50)
    .box(-0.50, 0.30, -0.50, 0.52, 0.315, 0.52, { bottom: true })
    .box(-0.50, 0.315, -0.45, 0.28, 0.56, 0.45, { bottom: true })
    .box(-0.50, 0.56, -0.47, 0.30, 0.575, 0.47, { bottom: true })
    .box(-0.50, 0.575, -0.40, 0.10, 0.80, 0.40, { bottom: true })
    .box(-0.50, 0.80, -0.42, 0.12, 0.815, 0.42, { bottom: true })
    .box(-0.50, 0.815, -0.35, -0.08, 0.97, 0.35, { bottom: true })
    .box(-0.50, 0.97, -0.30, -0.20, 1.0, 0.30, { bottom: true }),

  // Wide three-storey base plus a thin off-centre tower. The base is P3a's street-level signage.
  podium: m => m
    .sym(0.50, 0.50, 0, 0.10)
    .sym(0.475, 0.475, 0.10, 0.19)
    .sym(0.45, 0.45, 0.19, 0.27)
    .sym(0.50, 0.50, 0.27, 0.30, { bottom: true })
    .box(-0.02, 0.30, -0.30, 0.34, 0.955, 0.16, { bottom: true })
    .box(-0.06, 0.955, -0.34, 0.38, 0.98, 0.20, { bottom: true })
    .box(0.06, 0.98, -0.22, 0.26, 1.0, 0.08, { bottom: true }),

  // Two slabs and a sky bridge at 55 % height. One of the strongest depth cues in the game.
  bridged: m => m
    .box(-0.50, 0, -0.50, -0.16, 0.95, 0.50)
    .box(-0.52, 0.95, -0.52, -0.14, 0.985, 0.52, { bottom: true })
    .box(0.16, 0, -0.50, 0.50, 0.88, 0.50)
    .box(0.14, 0.88, -0.52, 0.52, 0.915, 0.52, { bottom: true })
    .box(-0.16, 0.55, -0.22, 0.16, 0.60, 0.22, { bottom: false })
    .box(-0.16, 0.52, -0.07, 0.16, 0.55, 0.07, { bottom: false }),
};

// ── build ──────────────────────────────────────────────────────────────────

export function buildPrototypes() {
  const out = [];
  for (const id of PROTO_IDS) {
    const m = new Mesher();
    BUILD[id](m);
    const geo = m.geometry(id);
    out.push({ id, geo, tris: geo.index.count / 3, traits: PROTO_TRAITS[id], boxes: m.boxes });
  }
  return out;
}

// ── the P3a surface interface ──────────────────────────────────────────────
//
// A sign has to find a WALL, and a wall is not the building's bounding box: `taper` steps in
// twice, `terrace` is sheer on -x and stepped on +x, `podium` has a thin tower off-centre. A sign
// placed on the bounding box floats in front of all three.
//
// `surfaceAt(proto, t)` answers "at this fraction of the building's height, where is the skin?".
// It returns half-extents in UNIT space plus the box's own centre offset, so a caller multiplies
// by the instance's (W, H, D) and gets a world-space wall:
//
//   const s = surfaceAt('taper', 0.55);
//   const wallZ = b.z + s.cz * b.d + s.hz * b.d;      // the +Z facade at that height
//   const wallW = s.hx * 2 * b.w;                     // how wide the sign may be
//
// `y0` / `y1` are the unit-space span of the box the surface belongs to, so a sign can be sized
// to stay on one continuous face instead of straddling a setback.
//
// It returns the LARGEST mass at that height. `bridged` and `podium` have more than one mass at
// the same height (two towers; a base and an off-centre tower) — for those, walk `protoBoxes(id)`
// directly rather than taking the one answer.
export function surfaceAt(protoOrBoxes, t) {
  const boxes = Array.isArray(protoOrBoxes) ? protoOrBoxes : protoBoxes(protoOrBoxes);
  if (!boxes) return null;
  let best = null;
  for (const b of boxes) {
    if (t < b.y0 || t > b.y1) continue;
    const hx = (b.x1 - b.x0) / 2, hz = (b.z1 - b.z0) / 2;
    // The OUTERMOST box wins: a cornice or a ledge is the surface you would actually hit.
    if (!best || hx * hz > best.hx * best.hz) {
      best = { hx, hz, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, y0: b.y0, y1: b.y1, round: !!b.round };
    }
  }
  return best;
}

// The full box list for a prototype, in unit space, built on first ask and cached. Same numbers
// the geometry uses because they come from the same BUILD call.
let _boxes = null;
export function protoBoxes(id) {
  if (!_boxes) {
    _boxes = {};
    for (const k of PROTO_IDS) { const m = new Mesher(); BUILD[k](m); _boxes[k] = m.boxes; }
  }
  return id === undefined ? _boxes : _boxes[id];
}

// LOD1 and LOD2 are the LOD0 prototype's BOUNDING BOX and nothing else (§3.2.2 part 1). Same unit
// cell, same UV field, same aFace codes — so the shell material samples the same atlas cell at the
// same 3.6 m / 3.2 m pitch and the only thing that changes across the boundary is that a chamfer
// flattens out.
export function buildLodBox() {
  return new Mesher().sym(0.5, 0.5, 0, 1, { bottom: true }).geometry('lodbox');
}

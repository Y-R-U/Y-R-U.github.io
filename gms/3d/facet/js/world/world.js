// Assembles the diorama and defines the contract every art module implements.
//
//   export function populate(ctx)   // pushes geometry into ctx.batch
//
// Modules run in the order listed in MODULES and share one occupancy registry, so a module that
// runs later can see what the earlier ones claimed. That ordering is the composition: the village
// stakes its ground first, water fills what is below the line, nature grows in what is left, and
// life is placed last against everything already standing.

import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Batch, makeMaterials } from './batch.js';
import { palette } from './palette.js';
import { makeRng } from './rng.js';
import { matrix } from './shape.js';
import { defineScenario, frameCamera } from '../scenarios.js';

import * as buildings from './buildings.js';
import * as water from './water.js';
import * as nature from './nature.js';
import * as life from './life.js';

const MODULES = [
  ['buildings', buildings],
  ['water', water],
  ['nature', nature],
  ['life', life],
];

// `?only=nature,life` builds just those. Two people tuning two modules at once should not have
// to look at each other's work to see their own.
const ONLY = new URLSearchParams(location.search).get('only');
const active = () => MODULES.filter(([id]) => !ONLY || ONLY.split(',').includes(id));

const SHOTS = [
  { id: 'village_day', label: 'Village, midday', pal: 'meadow', target: [4, 3, 2], az: 45, el: 30, height: 46 },
  { id: 'island_wide', label: 'The whole island', pal: 'meadow', target: [0, 4, 0], az: 38, el: 31, height: 134 },
  { id: 'shore_dusk', label: 'Shore at dusk', pal: 'dusk', target: [-26, 2, 28], az: 310, el: 21, height: 54 },
  { id: 'woods_autumn', label: 'Woods in autumn', pal: 'autumn', target: [30, 3, -26], az: 155, el: 26, height: 56 },
  { id: 'craft_macro', label: 'Close craft', pal: 'meadow', target: [4, 2.5, 2], az: 62, el: 24, height: 17 },
  { id: 'frost_ridge', label: 'Frost ridge', pal: 'frost', target: [6, 3, -4], az: 214, el: 30, height: 80 },
];

// Runs from the high ground past the village shelf, through the lake, and out through the slab's
// edge. The water module traces it; nature keeps its banks clear.
const RIVER = [[32, -42], [27, -26], [22, -11], [18, 3], [12, 16], [2, 27], [-12, 34], [-28, 44], [-46, 62]];

export class World {
  constructor(app, { seed = 'facet-01', paletteId = 'meadow' } = {}) {
    this.app = app;
    this.seed = seed;
    this.object3D = new THREE.Group();
    this.paletteId = paletteId;
    this.materials = makeMaterials();
    this.build();
    this.registerScenarios();
  }

  build() {
    this.dispose();
    const p = palette(this.paletteId);
    const q = this.app.quality.settings;

    this.terrain = new Terrain({ seed: this.seed, paletteId: this.paletteId, detail: q.detail ?? 1 });
    this.terrain.waterY = -1.2;
    this.terrain.flatten(4, 2, 17, { falloff: 2.4 });
    this.terrain.flatten(-27, 31, 15, { y: -3.6, falloff: 1.4 });
    this.terrain.carve(RIVER, { width: 8.5, depth: 5.2, floor: -2.6, bank: 2.6 });
    this.terrain.build();

    this.batch = new Batch(this.materials);
    this.dynamic = new THREE.Group();
    this.claims = [];
    this.village = { plots: [], paths: [], centre: { x: 4, z: 2 } };
    const ctx = this.makeCtx(p, q);
    this.report = {};
    this.animated = [];
    for (const [id, mod] of active()) {
      if (!mod.populate) continue;
      const before = this.batch.tris;
      ctx.rng = makeRng(`${this.seed}:${id}`);
      ctx.id = id;
      mod.populate(ctx);
      if (mod.update) this.animated.push(mod);
      this.report[id] = Math.round(this.batch.tris - before);
    }

    // Last, so the ground can bake every claim the modules made into its own vertex colours.
    const ground = this.terrain.surface(this.claims);
    this.report.terrain = Math.round(ground.attributes.position.count / 3);
    this.batch.push(ground, null, 'solid');

    this.batch.build();
    this.object3D.add(this.batch.object3D);
    this.object3D.add(this.dynamic);
    this.report.total = Math.round(this.batch.tris);
  }

  makeCtx(p, q) {
    const t = this.terrain;
    const claims = this.claims;
    const self = this;
    return {
      p, terrain: t, batch: this.batch, quality: q,
      detail: q.detail ?? 1, scatter: q.scatter ?? 1, life: q.life ?? 1,
      village: this.village,

      // Claim a circle of ground. Later modules test against it so a tree never grows through a
      // roof and a chicken never stands in the millpond.
      // `ao` scales how hard the terrain darkens under this claim. A river channel wants far more
      // than a crate does, and the strength is most of what makes a valley read.
      occupy(x, z, r, tag = '', { ao = undefined } = {}) { claims.push({ x, z, r, tag, aoStrength: ao }); },
      free(x, z, r, { ignore = null } = {}) {
        for (const c of claims) {
          if (ignore && c.tag === ignore) continue;
          if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
        }
        return true;
      },
      claims,

      // Drops a geometry onto the ground at (x, z). `sink` pushes it down so a form with a flat
      // base still meets sloped ground without a gap — the cheapest possible contact fix.
      place(geo, { x = 0, z = 0, ry = 0, rx = 0, rz = 0, scale = 1, y = null, sink = 0, cls = 'solid' } = {}) {
        const gy = (y ?? t.heightAt(x, z)) - sink;
        self.batch.push(geo, matrix({ pos: [x, gy, z], ry, rx, rz, scale }), cls);
      },
      raw(geo, m, cls = 'solid') { self.batch.push(geo, m, cls); },

      // Anything that has to move cannot be merged into the batch. Keep the count small — each
      // one of these is its own draw call, and the budget allows about a dozen.
      dynamic(obj) { self.dynamic.add(obj); return obj; },
      materials: self.materials,
    };
  }

  registerScenarios() {
    for (const s of SHOTS) {
      defineScenario({
        ...s,
        setup: app => {
          if (s.pal && s.pal !== this.paletteId) app.quality.set('palette', s.pal);
          // Resolved here, not at registration: a palette change rebuilds the terrain, and a
          // target left at its authored y ends up buried inside a hillside.
          const [x, up, z] = s.target;
          frameCamera(app, { ...s, target: [x, this.terrain.heightAt(x, z) + up, z] });
        },
      });
    }
  }

  setPalette(id) {
    if (id === this.paletteId) return;
    this.paletteId = id;
    this.build();
  }

  update(dt, app) {
    for (const m of this.animated || []) m.update(dt, app, this);
  }

  dispose() {
    this.batch?.dispose();
    this.dynamic?.traverse(o => { if (o.geometry && o.userData.own !== false) o.geometry.dispose(); });
    this.dynamic?.clear();
    this.object3D.clear();
    this.animated = [];
  }

  registerKnobs(q, app) {
    q.register({ key: 'seed', label: 'Seed', type: 'range', min: 1, max: 40, step: 1, default: 1, group: 'World' },
      v => { const s = `facet-${String(v).padStart(2, '0')}`; if (s !== this.seed) { this.seed = s; this.build?.(); } });
    q.register({ key: 'scatter', label: 'Scatter density', type: 'range', min: 0, max: 1.6, step: 0.05, group: 'World' },
      () => this.rebuildSoon());
    q.register({ key: 'detail', label: 'Detail', type: 'select', options: [0, 1, 2], group: 'World' },
      () => this.rebuildSoon());
  }

  // Knob application fires during construction too, so a rebuild has to be deferred past it.
  rebuildSoon() {
    if (!this.batch) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.build(), 30);
  }
}

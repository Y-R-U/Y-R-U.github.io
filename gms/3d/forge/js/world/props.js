// The things quests ask the player to act on: lamps, crates, posts, fonts, sluices. Seventeen
// parameterised types rather than one model per id, built from the same Batch/surface vocabulary
// the buildings use, so a prop takes its look from its zone and nowhere else.
//
// Everything in a zone merges onto the three surfaces the kit uses — wood, trim, crest — so the
// valley's forty-eight props are nine meshes, plus one instanced glow per zone that has a lamp.

import * as THREE from 'three';
import { Batch, T, taperBox, rng, span } from './details.js';
import { ZONE_IDS, zone } from './zones.js';
import { zoneAt, heightAt } from './terrain.js';
import { groundAt, collidersReady } from './colliders.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 6, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg);
const lump = r => new THREE.IcosahedronGeometry(r, 0);
const at = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(T(x, y, z, ry, rx, rz));

// Each builder draws its type around a local origin on the ground, +z facing the way the entry's
// `ry` points. `glow` is the only piece of state the geometry carries: where a lit lamp burns.
const KIT = {
  lamp(b, m, R, v, out) {
    b.add('wood', box(0.18, 2.3, 0.18), at(m, 0, 1.15, 0));
    b.add('crest', box(0.07, 0.07, 0.52), at(m, 0, 2.2, 0.26));
    b.add('trim', taperBox(0.3, 0.3, 0.38, 0.22, 0.22), at(m, 0, 1.95, 0.5));
    b.add('crest', new THREE.ConeGeometry(0.22, 0.16, 4).rotateY(Math.PI / 4), at(m, 0, 2.22, 0.5));
    out.glow = [0, 1.98, 0.5];
    if (v === 'deep') b.add('trim', taperBox(1.0, 1.0, 0.3, 1.4, 1.4), at(m, 0, 0.15, 0));
  },

  post(b, m, R, v) {
    const h = v === 'gauge' ? 1.9 : 1.6;
    b.add('wood', box(0.2, h, 0.2), at(m, 0, h / 2, 0));
    b.add('trim', taperBox(0.46, 0.46, 0.22, 0.68, 0.68), at(m, 0, 0.11, 0));
    if (v === 'chalk') {
      b.add('wood', box(1.2, 0.85, 0.07), at(m, 0, h - 0.4, 0.13));
      b.add('wood', box(1.28, 0.09, 0.11), at(m, 0, h + 0.06, 0.13));
    }
    if (v === 'gauge') for (let i = 1; i <= 4; i++) b.add('crest', box(0.24, 0.05, 0.05), at(m, 0, i * 0.36, 0.12));
  },

  crate(b, m, R, v) {
    if (v === 'sacks') {
      for (let i = 0; i < 4; i++) {
        const g = lump(span(R, 0.3, 0.42));
        g.scale(1, 0.72, 1);
        b.add('wood', g, at(m, span(R, -0.5, 0.5), 0.24, span(R, -0.4, 0.4), span(R, 0, 6.28)));
      }
      return;
    }
    b.add('wood', box(0.92, 0.7, 0.72), at(m, 0, 0.35, 0));
    b.add('crest', box(0.96, 0.06, 0.06), at(m, 0, 0.52, 0.37));
    if (v === 'chest') {
      b.add('wood', taperBox(0.8, 0.62, 0.22, 0.92, 0.72), at(m, 0, 0.81, 0));
      b.add('crest', box(0.1, 0.16, 0.1), at(m, 0, 0.7, 0.38));
      return;
    }
    b.add('wood', box(0.8, 0.6, 0.62), at(m, 0.12, 1.0, 0.06, 0.4));
  },

  barrel(b, m, R, v) {
    const s = v === 'bowl' ? 0.5 : 1;
    if (v === 'bowl') {
      b.add('wood', box(1.5, 0.11, 0.8), at(m, 0, 0.82, 0));
      for (const sx of [-1, 1]) b.add('wood', box(0.14, 0.76, 0.66), at(m, sx * 0.58, 0.38, 0));
    }
    const y0 = v === 'bowl' ? 0.88 : 0;
    b.add('wood', cyl(0.44 * s, 1.0 * s, 8, 0.37 * s), at(m, 0, y0 + 0.5 * s, 0));
    for (const k of [0.26, 0.76]) b.add('crest', cyl(0.46 * s, 0.07, 8), at(m, 0, y0 + k * s, 0));
  },

  table(b, m, R, v) {
    const w = v === 'stall' ? 2.4 : 3.0;
    b.add('wood', box(w, 0.12, 1.0), at(m, 0, 0.86, 0));
    for (const sx of [-1, 1]) {
      b.add('wood', box(0.16, 0.8, 0.84), at(m, sx * (w / 2 - 0.3), 0.4, 0));
      b.add('wood', box(0.12, 0.1, 1.1), at(m, sx * (w / 2 - 0.3), 0.06, 0));
    }
    if (v !== 'stall') return;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add('wood', box(0.11, 2.1, 0.11), at(m, sx * (w / 2 - 0.1), 1.05, sz * 0.62));
    }
    b.add('wood', box(w + 0.5, 0.1, 1.7), at(m, 0, 2.14, 0));
  },

  shelf(b, m, R) {
    for (const sx of [-1, 1]) b.add('wood', box(0.14, 2.0, 0.5), at(m, sx * 1.15, 1.0, 0));
    for (let i = 0; i < 3; i++) {
      b.add('wood', box(2.5, 0.09, 0.52), at(m, 0, 0.52 + i * 0.62, 0));
      b.add('wood', box(0.42, 0.34, 0.34), at(m, span(R, -0.9, 0.9), 0.73 + i * 0.62, 0));
    }
  },

  board(b, m, R, v) {
    if (v === 'slate') {
      for (let i = 0; i < 5; i++) {
        b.add('trim', box(0.66, 0.05, 0.44), at(m, span(R, -0.2, 0.2), 0.04 + i * 0.06, span(R, -0.15, 0.15), span(R, -0.3, 0.3)));
      }
      b.add('wood', box(0.14, 1.1, 0.14), at(m, 0.6, 0.55, 0, 0.3));
      return;
    }
    if (v === 'lectern') {
      b.add('wood', box(0.22, 1.05, 0.22), at(m, 0, 0.52, 0));
      b.add('wood', taperBox(0.9, 0.7, 0.1, 0.9, 0.7), at(m, 0, 1.1, 0, 0, -0.5));
      b.add('trim', box(0.62, 0.09, 0.44), at(m, 0, 1.2, -0.06, 0, -0.5));
      return;
    }
    for (const sx of [-1, 1]) b.add('wood', box(0.14, 1.9, 0.14), at(m, sx * 0.85, 0.95, 0));
    b.add('wood', box(1.9, 1.15, 0.09), at(m, 0, 1.35, 0.05));
    b.add('wood', box(2.0, 0.12, 0.16), at(m, 0, 2.0, 0.05));
  },

  door(b, m, R, v) {
    for (const sx of [-1, 1]) b.add('trim', box(0.28, 2.6, 0.4), at(m, sx * 0.85, 1.3, 0));
    b.add('trim', box(2.0, 0.32, 0.4), at(m, 0, 2.74, 0));
    // Ajar, because a closed slab in an unbuilt wall reads as a fallen plank.
    b.add('wood', box(1.4, 2.5, 0.1), at(m, -0.28, 1.25, 0.55, 0.5));
    if (v === 'lock') b.add('crest', box(0.3, 0.4, 0.08), at(m, 0.16, 1.25, 0.75, 0.5));
    if (v === 'hinge') for (const y of [0.5, 2.0]) b.add('crest', box(0.9, 0.12, 0.06), at(m, -0.5, y, 0.6, 0.5));
  },

  hurdle(b, m, R) {
    for (const sx of [-1, 1]) b.add('wood', box(0.14, 1.5, 0.14), at(m, sx * 1.25, 0.75, 0));
    for (let i = 0; i < 4; i++) b.add('wood', box(2.5, 0.11, 0.08), at(m, 0, 0.3 + i * 0.32, 0));
    b.add('wood', box(2.5, 0.1, 0.08), at(m, 0, 0.78, 0, 0, 0.55));
  },

  kerb(b, m, R) {
    for (let i = 0; i < 6; i++) {
      b.add('trim', taperBox(0.7, 0.32, 0.26, 0.76, 0.4), at(m, -1.75 + i * 0.7, 0.13, span(R, -0.05, 0.05), span(R, -0.06, 0.06)));
    }
  },

  font(b, m, R, v) {
    if (v === 'hearth') {
      for (const [x, z, w, d] of [[0, -0.8, 1.8, 0.24], [-0.8, 0, 0.24, 1.8], [0.8, 0, 0.24, 1.8]]) {
        b.add('trim', box(w, 0.5, d), at(m, x, 0.25, z));
      }
      for (let i = 0; i < 3; i++) b.add('wood', box(0.12, 0.12, 1.1), at(m, span(R, -0.4, 0.4), 0.1, 0, span(R, -0.6, 0.6)));
      return;
    }
    b.add('trim', cyl(0.42, 0.9, 8, 0.55), at(m, 0, 0.45, 0));
    b.add('trim', cyl(0.86, 0.36, 10, 0.66), at(m, 0, 1.08, 0));
    b.add('crest', cyl(0.72, 0.06, 10), at(m, 0, 1.27, 0));
  },

  stone(b, m, R, v) {
    b.add('trim', taperBox(1.5, 1.2, 0.26, 1.7, 1.4), at(m, 0, 0.13, 0));
    if (v === 'plot') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.add('wood', box(0.1, 0.9, 0.1), at(m, sx * 1.5, 0.45, sz * 1.2));
      }
      return;
    }
    b.add('trim', taperBox(0.34, 0.34, 0.8, 0.5, 0.5), at(m, 0, 0.65, 0));
    if (v !== 'floor') b.add('crest', box(0.4, 0.05, 0.05), at(m, 0, 1.0, 0.2));
  },

  rubble(b, m, R, v) {
    for (let i = 0; i < 7; i++) {
      const s = span(R, 0.22, 0.5);
      const g = lump(s);
      g.scale(span(R, 0.9, 1.5), span(R, 0.5, 0.8), span(R, 0.9, 1.5));
      b.add('trim', g, at(m, span(R, -1.1, 1.1), s * 0.4, span(R, -0.9, 0.9), span(R, 0, 6.28)));
    }
    if (v !== 'spit') return;
    b.add('wood', box(0.08, 1.3, 0.14), at(m, 0.7, 0.68, -0.4, 0, 0, 0.22));
    b.add('crest', box(0.26, 0.4, 0.05), at(m, 0.86, 0.16, -0.4, 0, 0, 0.22));
  },

  sluice(b, m, R) {
    for (const sx of [-1, 1]) b.add('wood', box(0.22, 1.7, 0.22), at(m, sx * 0.95, 0.85, 0));
    b.add('wood', box(2.1, 0.16, 0.22), at(m, 0, 1.72, 0));
    b.add('wood', box(1.7, 0.9, 0.12), at(m, 0, 0.75, 0));
    b.add('crest', cyl(0.34, 0.08, 8), at(m, 0, 1.72, 0.3));
    for (const sx of [-1, 1]) b.add('trim', taperBox(0.5, 1.8, 0.4, 0.7, 2.0), at(m, sx * 1.35, 0.2, 0));
  },

  timber(b, m, R) {
    for (const sx of [-1, 1]) b.add('wood', box(0.26, 2.3, 0.26), at(m, sx * 0.9, 1.15, 0));
    b.add('wood', box(2.3, 0.26, 0.3), at(m, 0, 2.42, 0));
    b.add('wood', box(0.7, 0.16, 0.16), at(m, -0.62, 1.95, 0, 0, 0, 0.75));
  },

  sapling(b, m, R, v) {
    b.add('wood', cyl(0.13, 1.4, 6, 0.09), at(m, 0, 0.7, 0));
    const n = v === 'thorn' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      b.add('wood', cyl(0.05, 0.85, 4, 0.02), at(m, Math.sin(a) * 0.2, 1.6, Math.cos(a) * 0.2, a, 0.5));
    }
    if (v !== 'thorn') b.add('crest', box(0.1, 0.06, 0.06), at(m, 0, 1.4, 0.1));
  },

  hatch(b, m, R) {
    b.add('trim', box(1.9, 0.16, 1.5), at(m, 0, 0.08, 0));
    b.add('wood', box(1.5, 0.12, 1.15), at(m, 0, 0.2, 0));
    b.add('crest', box(1.5, 0.06, 0.09), at(m, 0, 0.27, 0.4));
    b.add('crest', new THREE.TorusGeometry(0.14, 0.035, 3, 7).rotateX(Math.PI / 2), at(m, 0, 0.28, -0.35));
  },
};

const GLOW_SEG = 6;

export class Props {
  constructor(terrain, entries = []) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'props';
    this.items = [];
    this.lit = new Set();
    this.glowLevel = 1;
    this.build(entries);
  }

  groundY(x, z) {
    const fall = this.terrain ? this.terrain.surfaceY(x, z) : heightAt(x, z);
    return collidersReady() ? groundAt(x, z, fall) : fall;
  }

  build(entries) {
    const batches = new Map();
    const glow = new Map();
    let tris = 0;

    for (const e of entries) {
      const kit = KIT[e.kit];
      if (!kit) { console.warn(`props: ${e.id} wants unknown kit ${e.kit}`); continue; }
      const zoneId = e.town || ZONE_IDS[zoneAt(e.x, e.z)];
      const y = this.groundY(e.x, e.z);
      const b = batches.get(zoneId) || batches.set(zoneId, new Batch(zoneId)).get(zoneId);
      const out = {};
      const before = count(b);
      kit(b, T(e.x, y, e.z, e.ry), rng(hash(e.id)), e.variant || '', out);
      tris += count(b) - before;
      const item = {
        id: e.id, kit: e.kit, area: e.area, zoneId, label: e.label || 'use',
        kind: e.kind || 'interact', x: e.x, y, z: e.z, range: e.range || 3.6,
      };
      if (out.glow) {
        const p = new THREE.Vector3(...out.glow).applyMatrix4(T(e.x, y, e.z, e.ry));
        item.glow = p;
        (glow.get(zoneId) || glow.set(zoneId, []).get(zoneId)).push(item);
      }
      this.items.push(item);
    }

    for (const [zoneId, b] of batches) {
      const g = b.build();
      g.name = `props:${zoneId}`;
      this.object3D.add(g);
    }
    this.buildGlow(glow);
    this.tris = tris;
    // Nothing here moves, so the context button gets the same array every frame rather than 48
    // fresh objects.
    this.list = this.items.map(i => ({ id: i.id, kind: i.kind, label: i.label, x: i.x, z: i.z, range: i.range }));
  }

  // One instanced sphere per zone, drawn only while something in that zone is alight. A lamp the
  // player has just lit has to look lit or "relight the lamp" has no answer on screen.
  buildGlow(glow) {
    this.glow = [];
    for (const [zoneId, items] of glow) {
      const mat = new THREE.MeshBasicMaterial({ color: zone(zoneId).window.litColor, toneMapped: false });
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, GLOW_SEG, GLOW_SEG - 2), mat, items.length);
      mesh.name = `props:glow:${zoneId}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.object3D.add(mesh);
      this.glow.push({ mesh, items });
    }
    this.drawGlow();
  }

  drawGlow() {
    const m4 = new THREE.Matrix4();
    const s = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const g of this.glow) {
      let n = 0;
      for (const it of g.items) {
        if (!this.lit.has(it.id)) continue;
        s.setScalar(this.glowLevel);
        m4.compose(it.glow, q, s);
        g.mesh.setMatrixAt(n++, m4);
      }
      g.mesh.count = n;
      g.mesh.visible = n > 0 && this.glowLevel > 0;
      g.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  find(id) { return this.items.find(i => i.id === id) || null; }

  // The context button acted on this prop. A lamp answers to Kindle and to nothing else, which is
  // also the school every step that names one asks for; nothing else in the kit has state.
  use(id, verb) {
    const it = this.find(id);
    if (!it?.glow || verb !== 'kindle' || this.lit.has(id)) return false;
    this.lit.add(id);
    this.drawGlow();
    return true;
  }

  // §9.4's `recover: arm` — put the object back the way the step found it.
  arm(id) {
    const it = this.find(id);
    if (!it) return false;
    if (this.lit.delete(id)) this.drawGlow();
    return true;
  }

  targets() { return this.list; }

  registerKnobs(q) {
    q.register({ key: 'propGlow', label: 'Lit prop glow', type: 'range', min: 0, max: 3, step: 0.1, default: 1, group: 'World' },
      v => { this.glowLevel = v; this.drawGlow(); });
  }
}

const hash = id => id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// Batch keeps its parts as raw geometry until build(), so the triangles a kit added are countable
// before anything is merged.
function count(b) {
  let n = 0;
  for (const arr of b.parts.values()) for (const g of arr) n += g.attributes.position.count / 3;
  return n;
}

// Fishing spots, forage patches, rock seams and hearth fires as geometry. Four parameterised kits
// built from the same Batch/surface vocabulary the props and the buildings use, so a node takes
// its look from its zone and nowhere else.
//
// What a node *yields* is js/game/gathering.js. What the context button reads off one — its reach,
// its verb, what it says when it is spent — is js/world/nodestate.js, because this file imports
// three and no node test can reach it. Nothing in that pair is decided here.
//
// Nothing here touches the water plane. A node stands on the bank, so fishing costs no fill rate.

import * as THREE from 'three';
import { Batch, T, rng, span } from './details.js';
import { ZONE_IDS, zone } from './zones.js';
import { zoneAt, heightAt } from './terrain.js';
import { groundAt, collidersReady } from './colliders.js';
import { nodeItem, targetList, findNode, pipped } from './nodestate.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 6, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg);
const lump = r => new THREE.IcosahedronGeometry(r, 0);
const at = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(T(x, y, z, ry, rx, rz));

// Each kit draws around a local origin on the ground with +z facing the entry's `ry`; for a fishing
// spot that is the water. `out.mark` is where the ready pip sits; `out.flame` asks for a fire.
const KIT = {
  fish(b, m, R, out) {
    // Low, because a pair of posts with a rail at head height reads as a gallows rather than as
    // the rail at the top of a set of steps.
    for (const sx of [-1, 1]) b.add('wood', box(0.14, 0.78, 0.14), at(m, sx * 0.62, 0.37, 0.15));
    b.add('wood', box(1.4, 0.1, 0.16), at(m, 0, 0.72, 0.15));
    b.add('wood', box(1.2, 0.1, 0.62), at(m, 0, 0.12, -0.3));
    b.add('wood', box(1.2, 0.1, 0.5), at(m, 0, -0.16, 0.32));
    // The rod is the thing you can read at thirty metres: it leans out over the channel, and the
    // ready pip sits at its tip so it reads as the float on the line rather than as a hovering dot.
    b.add('wood', cyl(0.05, 2.4, 4, 0.02), at(m, 0.66, 0.8, 0.4, 0, 1.16));
    b.add('trim', cyl(0.26, 0.34, 6, 0.2), at(m, -0.78, 0.17, -0.42));
    b.add('trim', cyl(0.28, 0.05, 6), at(m, -0.78, 0.36, -0.42));
    for (let i = 0; i < 3; i++) {
      const s = span(R, 0.22, 0.36);
      const g = lump(s);
      g.scale(1.3, 0.5, 1.3);
      b.add('trim', g, at(m, span(R, -1.2, 1.2), s * 0.25, span(R, -0.9, -0.4), span(R, 0, 6.28)));
    }
    out.mark = [0.66, 1.29, 1.52];
  },

  // Upright, not a mound: five stems out of a low clump. A ground-hugging blob of the same
  // colour as the bank reads as spoil, and the player has to see it from the path.
  forage(b, m, R, out) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + R() * 0.5;
      const h = span(R, 0.55, 0.85);
      const dx = Math.sin(a) * 0.2, dz = Math.cos(a) * 0.2;
      b.add('wood', cyl(0.035, h, 3, 0.02), at(m, dx, h / 2, dz, a, 0.2));
      const leaf = lump(span(R, 0.15, 0.24));
      leaf.scale(1.3, 0.7, 1.3);
      b.add('bush', leaf, at(m, dx * 1.8, h * 0.94, dz * 1.8, span(R, 0, 6.28)));
    }
    const base = lump(0.3);
    base.scale(1.5, 0.45, 1.5);
    b.add('bush', base, at(m, 0, 0.1, 0));
    out.mark = [0, 1.15, 0];
  },

  // Low and wide with bedding slabs tilted out of it: ground broken open along the seam. Built
  // tall and even it read as a cairn, and on `trim` it took the zone's masonry, so the same chalk
  // was a pale cone in Whitewall and a dark boulder in Longacre. Its rock picks the surface now.
  rock(b, m, R, out, e) {
    const s = `rock:${e.rock}`;
    for (let i = 0; i < 7; i++) {
      const r = span(R, 0, 1.05);
      const a = span(R, 0, 6.28);
      const w = span(R, 0.16, 0.34);
      const g = lump(w);
      g.scale(span(R, 1.0, 1.7), span(R, 0.5, 0.9), span(R, 1.0, 1.7));
      b.add(s, g, at(m, Math.sin(a) * r, w * 0.34 + (1.05 - r) * span(R, 0.1, 0.34), Math.cos(a) * r,
        a, span(R, -0.2, 0.2), span(R, -0.25, 0.25)));
    }
    for (let i = 0; i < 3; i++) {
      b.add(s, box(span(R, 0.7, 1.05), 0.13, span(R, 0.5, 0.85)),
        at(m, span(R, -0.4, 0.4), span(R, 0.2, 0.5), span(R, -0.4, 0.4),
          span(R, 0, 6.28), span(R, 0.2, 0.44), span(R, -0.22, 0.22)));
    }
    for (let i = 0; i < 3; i++) {
      const g = lump(span(R, 0.14, 0.2));
      g.scale(0.7, span(R, 2.4, 3.6), 0.7);
      b.add(s, g, at(m, span(R, -0.45, 0.45), span(R, 0.5, 0.8), span(R, -0.4, 0.4),
        span(R, 0, 6.28), span(R, -0.35, 0.35), span(R, -0.4, 0.4)));
    }
    out.mark = [0, 1.25, 0];
  },

  hearth(b, m, R, out) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add('trim', lump(span(R, 0.2, 0.28)), at(m, Math.sin(a) * 0.72, 0.1, Math.cos(a) * 0.72, a));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      b.add('wood', box(0.13, 0.13, 0.9), at(m, Math.sin(a) * 0.16, 0.16, Math.cos(a) * 0.16, a, 0, 0.3));
    }
    // Wood, not trim: three 5 cm members take the masonry at world scale, and Whitewall's courses
    // are contrasty enough that the spit came out of it as three barber poles.
    for (const sx of [-1, 1]) b.add('wood', cyl(0.05, 1.3, 4), at(m, sx * 0.8, 0.65, 0, 0, 0, sx * 0.22));
    b.add('wood', cyl(0.045, 1.7, 4), at(m, 0, 1.26, 0, 0, 0, 1.571));
    out.flame = true;
  },
};

const PIP_R = 0.12;

// A fire drawn in the zone's own window colour comes out white in Whitewall, so the flame carries
// that colour this far toward ember for its outer tongues and toward yellow for its core.
const EMBER = '#ff4a06', EMBER_MIX = 0.72;
const CORE = '#ffcc2e', CORE_MIX = 0.66;

export class Nodes {
  constructor(terrain, entries = []) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'nodes';
    this.items = [];
    this.glints = [];
    this.pipLevel = 1;
    this.build(entries);
  }

  groundY(x, z) {
    const fall = this.terrain ? this.terrain.surfaceY(x, z) : heightAt(x, z);
    return collidersReady() ? groundAt(x, z, fall) : fall;
  }

  build(entries) {
    const batches = new Map();
    let tris = 0;

    for (const e of entries) {
      const kit = KIT[e.kind];
      const zoneId = e.town || ZONE_IDS[zoneAt(e.x, e.z)];
      const y = this.groundY(e.x, e.z);
      const item = kit ? nodeItem(e, y, zoneId) : null;
      if (!item) { console.warn(`nodes: ${e.id} wants unknown kind ${e.kind}`); continue; }
      // A seam is drawn in its own rock's colour rather than the zone's, so it cannot share the
      // zone batch. Its own mesh also has a seam-sized bounding sphere instead of a valley-sized
      // one, so most of the time it culls; the zone batches do not.
      const key = e.kind === 'rock' ? e.id : zoneId;
      const b = batches.get(key) || batches.set(key, new Batch(zoneId)).get(key);
      const out = {};
      const before = count(b);
      const m = T(e.x, y, e.z, e.ry || 0);
      kit(b, m, rng(hash(e.id)), out, e);
      tris += count(b) - before;
      if (out.flame) this.addFlame(zoneId, m, rng(hash(e.id) + 7));
      if (out.mark && pipped(item)) {
        item.pip = new THREE.Vector3(...out.mark).applyMatrix4(m);
        this.glints.push({ item, pos: item.pip, quat: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
          colour: new THREE.Color(zone(zoneId).window.litColor) });
      }
      this.items.push(item);
    }

    for (const [key, b] of batches) {
      const g = b.build();
      g.name = `nodes:${key}`;
      this.object3D.add(g);
    }
    this.buildGlints();
    this.tris = tris + this.glints.length * 8;
    this.retarget();
  }

  // Six tongues over the logs, out of the same octahedron the pips are drawn from so the whole
  // emissive layer stays one instanced draw. A cooking fire is the hearth's entire identity and
  // the old kit had none — what read as a flame in the first renders was the ready pip.
  addFlame(zoneId, m, R) {
    const lit = new THREE.Color(zone(zoneId).window.litColor);
    const ember = lit.clone().lerp(new THREE.Color(EMBER), EMBER_MIX);
    const core = lit.clone().lerp(new THREE.Color(CORE), CORE_MIX);
    for (let i = 0; i < 6; i++) {
      // The core tongues stand taller than the ones around them, or the orange closes over the
      // yellow and the fire goes back to being one flat silhouette.
      const inner = i % 2 === 1;
      const h = inner ? span(R, 0.5, 0.78) : span(R, 0.3, 0.56);
      const a = (i / 6) * Math.PI * 2 + R();
      const r = inner ? span(R, 0, 0.09) : span(R, 0.13, 0.27);
      const t = at(m, Math.sin(a) * r, 0.16 + h / 2, Math.cos(a) * r,
        span(R, 0, 6.28), span(R, -0.2, 0.2), span(R, -0.2, 0.2));
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), s = new THREE.Vector3();
      t.decompose(pos, quat, s);
      const w = inner ? span(R, 0.5, 0.7) : span(R, 0.62, 0.95);
      this.glints.push({ item: null, pos, quat, scale: new THREE.Vector3(w, h / PIP_R * 0.5, w),
        colour: inner ? core : ember });
    }
  }

  // Ready pips and hearth flames in one opaque instanced draw — SYSTEMS §6.1's "ready" tell as
  // solid geometry rather than as a particle, so none of it costs fill rate. Colour rides on the
  // instance, which is what lets three zone tints and three fires share the mesh.
  buildGlints() {
    this.glintMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(PIP_R, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      Math.max(1, this.glints.length),
    );
    this.glintMesh.name = 'nodes:glint';
    this.glintMesh.castShadow = false;
    this.glintMesh.receiveShadow = false;
    this.glintMesh.frustumCulled = false;
    this.glintMesh.count = this.glints.length;
    this.glints.forEach((g, i) => this.glintMesh.setColorAt(i, g.colour));
    if (this.glintMesh.instanceColor) this.glintMesh.instanceColor.needsUpdate = true;
    this.object3D.add(this.glintMesh);
    this.drawPips();
  }

  // A pip that is not ready is drawn at zero scale rather than dropped, so every instance keeps
  // the slot its colour was written into. A fire is not a pip and the knob does not reach it.
  drawPips() {
    const m4 = new THREE.Matrix4(), s = new THREE.Vector3();
    this.glints.forEach((g, i) => {
      const k = g.item ? (g.item.state === 'ready' ? this.pipLevel : 0) : 1;
      m4.compose(g.pos, g.quat, s.copy(g.scale).multiplyScalar(k));
      this.glintMesh.setMatrixAt(i, m4);
    });
    this.glintMesh.instanceMatrix.needsUpdate = true;
  }

  find(id) { return findNode(this.items, id); }

  setState(id, state) {
    const it = this.find(id);
    if (!it || it.state === state) return false;
    it.state = state;
    this.drawPips();
    this.retarget();
    return true;
  }

  retarget() { this.list = targetList(this.items); }

  targets() { return this.list; }

  registerKnobs(q) {
    q.register({ key: 'nodePip', label: 'Ready-node pip', type: 'range', min: 0, max: 2, step: 0.1, default: 1, group: 'World' },
      v => { this.pipLevel = v; this.drawPips(); });
  }
}

const hash = id => id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

function count(b) {
  let n = 0;
  for (const arr of b.parts.values()) for (const g of arr) n += g.attributes.position.count / 3;
  return n;
}

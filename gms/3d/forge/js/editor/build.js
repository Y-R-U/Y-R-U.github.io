// Scene document → geometry. A district is one static batch; an object under edit is left out
// of it and rebuilt on its own.

import * as THREE from 'three';
import { wallRun, tower, house, beginBatch, endBatch, dressing } from '../world/buildings.js';
import {
  T, taperBox, rng, span, addRubble, addSteps, roofSlab, gableShape, extrude, addChimney,
} from '../world/details.js';
import { zone } from '../world/zones.js';
import { heightAt, waterY } from '../world/terrain.js';
import { footprint } from './scene.js';

const BUILDERS = { wallRun, tower, house };

export class SceneBuilder {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'scene';
    this.groups = [];
    this.held = 0;
    this.doc = null;
  }

  // `register` seeds the terrain with roads and footprints, which it can only accept before it
  // is triangulated — so it is true exactly once, at boot.
  buildAll(doc, register = false) {
    this.doc = doc;
    for (const g of this.groups) { this.object3D.remove(g); dispose(g); }
    this.groups = [];
    for (let i = 0; i < doc.districts.length; i++) this.district(i, register);
  }

  objectsIn(di) { return this.doc.objects.filter(o => o.dist === di); }

  district(di, register = false) {
    const T2 = this.terrain;
    const d = this.doc.districts[di];
    const old = this.groups[di];
    if (old) { this.object3D.remove(old); dispose(old); }

    const g = new THREE.Group();
    g.name = `district${di}`;
    this.object3D.add(g);
    this.groups[di] = g;

    if (register && d.road) T2.addPath(d.road, d.roadWidth, d.zone);

    beginBatch();
    const beds = [], masses = [], here = this.objectsIn(di);
    for (const o of here) {
      const [hw, hd] = footprint(o);
      const r = T2.range(o.x, o.z, hw, hd, o.ry);
      if (register) T2.addFootprint(o.x, o.z, hw, hd, o.ry);
      if (o.id === this.held) continue;
      if (o.type === 'mass') {
        masses.push(massRec(o, r));
      } else {
        const b = BUILDERS[o.type](o.zone, { ...o.p, seed: o.seed });
        b.position.set(o.x, r.hi, o.z);
        b.rotation.y = o.ry;
        b.userData.sceneId = o.id;
        g.add(b);
        beds.push({ x: o.x, z: o.z, hw, hd, rot: o.ry, top: r.hi, bot: r.lo });
      }
    }

    for (const m of masses) g.add(dressing(m.zone, b => plainHouse(b, rng(m.seed), zone(m.zone), m), m.seed));

    g.add(dressing(d.zone, b => {
      const R = rng(d.dressSeed);
      for (const bd of beds) foundation(b, bd);
      for (const k of d.kerbs) kerb(b, R, k);
      if (d.bridge) bridge(b, R, d.bridge);
      for (const o of here) {
        if (o.rubble && o.type === 'wallRun' && o.id !== this.held) wallRubble(b, rng(o.rubbleSeed || o.seed), o);
      }
    }, d.dressSeed));

    const merged = endBatch(this.object3D);
    if (merged) g.add(merged);

    if (register && d.bridge) {
      T2.addFootprint(d.bridge.x, d.bridge.z, 4.2, 9, 0, { ao: 0.28, grow: 3.0 });
      T2.addReflection(d.bridge.x, d.bridge.z, 7.6, 2.7);
    }
  }

  // A standalone, unmerged copy of one object, built at the origin so the editor can drag it by
  // its root. Its seed is the same one the batch uses, so it is the same building.
  liveObject(o) {
    const root = new THREE.Group();
    root.name = 'live';
    if (o.type === 'mass') {
      const r = this.seat(o);
      const local = { ...massRec(o, r), x: 0, z: 0, rot: 0, top: 0, bot: r.lo - r.hi };
      root.add(dressing(o.zone, b => plainHouse(b, rng(o.seed), zone(o.zone), local), o.seed));
    } else {
      root.add(BUILDERS[o.type](o.zone, { ...o.p, seed: o.seed }));
    }
    return root;
  }

  // The contact collar under every building. Cheap to redo, and without it a freshly placed
  // object reads as a sticker lying on the grass.
  refreshDecals(opacity = 1) {
    const T2 = this.terrain;
    const old = T2.object3D.getObjectByName('contactAO');
    if (old) { T2.object3D.remove(old); old.geometry.dispose(); old.material.dispose(); }
    T2.decalRings.length = 0;
    for (const o of this.doc.objects) {
      if (o.id === this.held) continue;
      const [hw, hd] = footprint(o);
      T2.decalRings.push({ x: o.x, z: o.z, hw, hd, rot: o.ry, ao: 1, grow: 0.4 });
    }
    for (const d of this.doc.districts) {
      if (d.bridge) T2.decalRings.push({ x: d.bridge.x, z: d.bridge.z, hw: 4.2, hd: 9, rot: 0, ao: 0.28, grow: 3.0 });
    }
    T2.finish();
    if (T2.decalMat) T2.decalMat.opacity = opacity;
  }

  seat(o) {
    const [hw, hd] = footprint(o);
    return this.terrain.range(o.x, o.z, hw, hd, o.ry);
  }
}

const massRec = (o, r) => ({ zone: o.zone, seed: o.seed, x: o.x, z: o.z, rot: o.ry, ...o.p, top: r.hi, bot: r.lo });

// Replays the pre-v2 shared district stream — masses, then kerbs, bridge and wall rubble — to
// record the seed each of them was standing on. Once stamped, the objects are independent and
// this never runs again. `skips` is how far the generator's own layout advanced the stream.
export function seedDocument(doc, skips = []) {
  const sink = { add() { return this; } };
  for (const [di, d] of doc.districts.entries()) {
    const here = doc.objects.filter(o => o.dist === di);
    const R = rng(d.seed);
    for (let i = 0; i < (skips[di] || 0); i++) R();
    let n = 0;
    for (const o of here) {
      if (o.type !== 'mass') { o.seed = ++n; continue; }
      o.seed = R.state();
      plainHouse(sink, R, zone(o.zone), { ...o.p, x: 0, z: 0, rot: 0, top: 0, bot: 0 });
    }
    d.dressSeed = R.state();
    for (const k of d.kerbs) kerb(sink, R, k);
    if (d.bridge) bridge(sink, R, d.bridge);
    for (const o of here) {
      if (!o.rubble || o.type !== 'wallRun') continue;
      o.rubbleSeed = R.state();
      wallRubble(sink, R, o);
    }
  }
  return doc;
}

export function dispose(root) {
  root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
}

function foundation(b, bd) {
  const h = bd.top - (bd.bot - 0.5);
  if (h < 0.12) return;
  const y = bd.bot - 0.5;
  b.add('wall', taperBox(bd.hw * 2 + 0.4, bd.hd * 2 + 0.4, h, bd.hw * 2 + 1.5, bd.hd * 2 + 1.5),
    T(bd.x, y + h / 2, bd.z, bd.rot));
}

function kerb(b, R, k) {
  const ry = heightAt(k.x, k.z);
  const drop = k.top - ry;
  if (drop < 0.4) return;
  const hh = drop + 0.35;
  b.add('wall', taperBox(0.55, k.len, hh, 0.95, k.len), T(k.x, ry - 0.3 + hh / 2, k.z));
  b.add('trim', new THREE.BoxGeometry(0.8, 0.16, k.len), T(k.x, ry - 0.3 + hh + 0.08, k.z));
  if (drop > 0.75) {
    addSteps(b, {
      m: T(k.x, ry - 0.3 + hh, k.z + span(R, -k.len * 0.3, k.len * 0.3), -k.side * Math.PI / 2),
      w: 1.6, count: Math.round(drop / 0.19), surface: 'trim',
    });
  }
}

function wallRubble(b, R, o) {
  const y = heightAt(o.x, o.z);
  const out = o.p.thickness / 2 + 2.2;
  for (const s of [-1, 1]) {
    addRubble(b, R, {
      m: T(o.x, y, o.z, o.ry).multiply(T(0, 0, s * out)),
      length: o.p.length - 2, offset: s * 1.1, count: 22, size: 0.5, surface: 'wall',
    });
  }
}

function plainHouse(b, R, z, { x, z: zz, w, d, h, rot, top, bot }) {
  const m = T(x, top, zz, rot);
  const foot = top - (bot - 0.5);
  const profile = z.edges === 'curved' ? 'curved' : 'flat';
  const th = z.roof.tile === 'thatch' ? 0.5 : 0.3;
  const ridgeX = w >= d;
  const spanW = ridgeX ? d : w, ridgeLen = ridgeX ? w : d;
  const rise = Math.min(spanW * (z.edges === 'sharp' ? 0.9 : 0.62) * span(R, 0.85, 1.2), h * 0.95);

  b.add('wall', taperBox(w + 0.3, d + 0.3, foot + 0.3, w + 1.2, d + 1.2), m.clone().multiply(T(0, -foot / 2 + 0.15, 0)));
  b.add('wall', new THREE.BoxGeometry(w, h, d), m.clone().multiply(T(0, h / 2, 0)));

  const roof = roofSlab({ w: spanW, d: ridgeLen, rise, over: 0.45, th, profile });
  if (ridgeX) roof.rotateY(Math.PI / 2);
  b.add('roof', roof, m.clone().multiply(T(0, h, 0)), true);
  const gm = ridgeX
    ? [T(w / 2, h, 0, Math.PI / 2), T(-w / 2, h, 0, -Math.PI / 2)]
    : [T(0, h, d / 2), T(0, h, -d / 2, Math.PI)];
  for (const q of gm) b.add('wall', extrude(gableShape(spanW, rise, 0.45, profile, th), 0.12), m.clone().multiply(q));
  b.add('trim', new THREE.BoxGeometry(ridgeLen + 0.7, 0.18, 0.36), m.clone().multiply(ridgeX ? T(0, h + rise - 0.06, 0) : T(0, h + rise - 0.06, 0, Math.PI / 2)));

  // a few panes so the block lights up after dark like everything else
  const rows = h > 6 ? [1.4, h * 0.62] : [h * 0.42];
  for (const face of ridgeX ? [0, 2] : [1, 3]) {
    const along = face % 2 ? d : w;
    const fm = [T(0, 0, d / 2), T(w / 2, 0, 0, Math.PI / 2), T(0, 0, -d / 2, Math.PI), T(-w / 2, 0, 0, -Math.PI / 2)][face];
    const n = Math.max(1, Math.floor(along / 3.4));
    for (let i = 1; i <= n; i++) {
      for (const ry of rows) {
        if (R() < 0.28) continue;
        const wm = m.clone().multiply(fm).multiply(T(-along / 2 + along * i / (n + 1), ry, 0));
        b.add('trim', new THREE.BoxGeometry(1.02, 1.5, 0.11), wm.clone().multiply(T(0, 0, 0.02)));
        b.add('glass', new THREE.PlaneGeometry(0.66, 1.06), wm.clone().multiply(T(0, 0, 0.09)));
      }
    }
  }
  if (R() < 0.55) {
    addChimney(b, R, {
      m: m.clone().multiply(T(span(R, -ridgeLen * 0.3, ridgeLen * 0.3) * (ridgeX ? 1 : 0), h + rise - 0.5, span(R, -ridgeLen * 0.3, ridgeLen * 0.3) * (ridgeX ? 0 : 1))),
      w: 0.85, h: span(R, 1.5, 2.6), surface: 'wall', cap: 'trim',
    });
  }
}

function bridge(b, R, { x, z: cz, halfSpan }) {
  const wy = waterY(x);
  const deck = wy + 1.55;
  const len = halfSpan * 2 + 7;
  const w = 7.2;
  const bedY = wy - 1.9;

  for (const s of [-1, 1]) {
    const az = cz + s * (halfSpan + 2.6);
    const gh = heightAt(x, cz + s * (halfSpan + 5.5));
    const abut = deck - Math.min(bedY, gh - 1);
    b.add('wall', taperBox(w, 5.2, abut, w + 1.1, 6.6), T(x, deck - abut / 2, az));
  }
  for (const s of [-1, 1]) {
    b.add('wall', taperBox(2.0, 1.5, deck - bedY, 2.8, 2.2), T(x, bedY + (deck - bedY) / 2, cz + s * 2.9));
  }
  b.add('wall', new THREE.BoxGeometry(w, 0.55, len), T(x, deck - 0.28, cz));
  b.add('trim', new THREE.BoxGeometry(w + 0.5, 0.2, len + 0.4), T(x, deck + 0.06, cz));
  for (const s of [-1, 1]) {
    b.add('wall', new THREE.BoxGeometry(0.42, 0.85, len), T(x + s * (w / 2 - 0.2), deck + 0.5, cz));
    b.add('trim', new THREE.BoxGeometry(0.62, 0.16, len), T(x + s * (w / 2 - 0.2), deck + 1.0, cz));
  }
  addRubble(b, R, { m: T(x, bedY + 0.2, cz - halfSpan - 2.6), length: w, offset: -1.6, count: 8, size: 0.55, surface: 'wall' });
  addRubble(b, R, { m: T(x, bedY + 0.2, cz + halfSpan + 2.6), length: w, offset: 1.6, count: 8, size: 0.55, surface: 'wall' });
}

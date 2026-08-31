// Scene document → geometry. A district is built as a set of 60 m blocks, each of which merges
// into a `base` / `detail` / `proxy` triple that js/world/stream.js switches between; an object
// under edit is left out and rebuilt on its own.

import * as THREE from 'three';
import { wallRun, tower, house, beginBatch, endBatch, dressing, emitBatch } from '../world/buildings.js';
import {
  Batch, T, taperBox, rng, span, addRubble, addSteps, roofSlab, gableShape, extrude, addChimney,
} from '../world/details.js';
import { zone } from '../world/zones.js';
import { signPost, boardPanel } from '../world/boards.js';
import { heightAt, waterY } from '../world/terrain.js';
import { footprint, blockOf } from './scene.js';

// v3's six new types. Each is a `dressing` batch of the shared kit rather than a builder in
// buildings.js, because none of them has an interior or a door — they are furniture for a town,
// not architecture. Nothing here branches on zone: the materials do that.
const kit = fn => (zoneId, p) => dressing(zoneId, b => fn(b, rng(p.seed || 1), p), p.seed || 1);

const BUILDERS = {
  wallRun, tower, house,
  mill: kit(mill), barn: kit(barn), pen: kit(pen),
  cross: kit(cross), arcade: kit(arcade), retaining: kit(retaining),
  // Not `kit()`: a lettered board needs its own texture, so it cannot merge into a shared batch.
  sign: signPost, billboard: boardPanel,
};

// Shared with colliders.js, which used to carry its own copy of these and drift from them.
export const BRIDGE = {
  deck: 2.33,        // above the water line
  trimTop: 0.24,     // deck slab trim, i.e. the surface you actually walk on
  w: 10.8,
  overhang: 5.25,    // half the deck's length past the span
  parapetT: 0.63,
  parapetX: () => BRIDGE.w / 2 - 0.3,
};

export const KERB = { minDrop: 0.6, sink: 0.45 };

// Stays out of the main render list because three skips a material with `visible` false — and
// stays *in* the shadow pass because App flips it back on for the duration. That is the only gap
// there is: three reads material.visible in both passes, but projectObject has already run by the
// time shadowMap.render does. Layers cannot do it — the shadow pass tests them against the view
// camera, so a layer excludes from both passes or from neither.
export const shadowOnly = new THREE.MeshBasicMaterial({ visible: false });

// One depth-only mesh for a whole LOD set: positions only, in `holder` space, from every mesh
// under it that was casting on its own. wall, trim, roof and wood all write the same depth.
function mergeShadow(holder) {
  const parts = [];
  holder.traverse(o => { if (o.isMesh && o.castShadow) parts.push(o); });
  if (!parts.length) return;
  holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();

  let n = 0;
  for (const m of parts) n += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  const out = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  let at = 0;
  for (const m of parts) {
    m.castShadow = false;
    const g = m.geometry, p = g.attributes.position, idx = g.index;
    const local = inv.clone().multiply(m.matrixWorld);
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(local);
      out[at++] = v.x; out[at++] = v.y; out[at++] = v.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  const mesh = new THREE.Mesh(geo, shadowOnly);
  mesh.name = 'shadowDepth';
  mesh.castShadow = true;
  holder.add(mesh);
}

export class SceneBuilder {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'scene';
    this.groups = [];
    this.blocks = [];
    this.held = 0;
    this.doc = null;
  }

  // `register` seeds the terrain with roads and footprints, which it can only accept before it
  // is triangulated — so it is true exactly once, at boot.
  buildAll(doc, register = false) {
    this.doc = doc;
    for (const g of this.groups) { this.object3D.remove(g); dispose(g); }
    this.groups = [];
    this.blocks = [];
    for (let i = 0; i < doc.districts.length; i++) this.district(i, register);
  }

  // `inside` objects are furniture for a house's interior; interior.js builds those when the
  // house is opened, so the outdoor world must not.
  objectsIn(di) { return this.doc.objects.filter(o => o.dist === di && !o.inside); }

  insideOf(id) { return this.doc.objects.filter(o => o.inside === id); }

  district(di, register = false) {
    const T2 = this.terrain;
    const d = this.doc.districts[di];
    const old = this.groups[di];
    if (old) { this.object3D.remove(old); dispose(old); }
    this.blocks = this.blocks.filter(b => b.di !== di);

    const g = new THREE.Group();
    g.name = `district${di}`;
    this.object3D.add(g);
    this.groups[di] = g;

    if (register && d.road && d.roadWidth > 0) T2.addPath(d.road, d.roadWidth, d.zone);

    // Seating and footprint registration run over the whole district in document order, before
    // anything is partitioned: scatter walks terrain.footprints with its own RNG, so reordering
    // them re-rolls every clump in the world.
    const here = this.objectsIn(di);
    const seats = new Map();
    for (const o of here) {
      const [hw, hd] = footprint(o);
      seats.set(o.id, { r: T2.range(o.x, o.z, hw, hd, o.ry), hw, hd });
      if (register) T2.addFootprint(o.x, o.z, hw, hd, o.ry, { hollow: !!o.p?.hall });
    }

    const cells = new Map();
    const cellOf = (x, z) => {
      const k = blockOf(x, z);
      let c = cells.get(k);
      if (!c) cells.set(k, c = { key: k, objects: [], dress: new Batch(d.zone) });
      return c;
    };

    for (const o of here) if (o.id !== this.held) cellOf(o.x, o.z).objects.push(o);

    // One RNG stream feeds the whole district's dressing, in the order seedDocument recorded, but
    // each piece is routed to the block it stands in so it culls with that block.
    const R = rng(d.dressSeed);
    for (const o of here) {
      if (o.id === this.held || o.type === 'mass') continue;
      const s = seats.get(o.id);
      foundation(cellOf(o.x, o.z).dress, { x: o.x, z: o.z, hw: s.hw, hd: s.hd, rot: o.ry, top: s.r.hi, bot: s.r.lo });
    }
    for (const k of d.kerbs) kerb(cellOf(k.x, k.z).dress, R, k);
    if (d.bridge) bridge(cellOf(d.bridge.x, d.bridge.z).dress, R, d.bridge);
    for (const o of here) {
      if (o.rubble && o.type === 'wallRun' && o.id !== this.held) {
        wallRubble(cellOf(o.x, o.z).dress, rng(o.rubbleSeed || o.seed), o);
      }
    }

    for (const c of cells.values()) this.blocks.push(this.block(g, di, d, c, seats));

    if (register && d.bridge) {
      T2.addFootprint(d.bridge.x, d.bridge.z, 6.3, 13.5, d.bridge.ry || 0, { ao: 0.28, grow: 4.5 });
      T2.addReflection(d.bridge.x, d.bridge.z, 11.4, 4.05);
    }
  }

  // Two merged sets per 60 m block, the same buildings at two costs. Exactly one is ever visible,
  // so a block costs one set of draw calls however far away it is; stream.js flips `.visible` and
  // nothing rebuilds. The infill and the ground dressing are in both — carrying them in a third
  // always-on set halved the triangles but doubled the calls, which is the wrong trade.
  block(g, di, d, c, seats) {
    const rec = { di, key: c.key, detail: null, proxy: null, c: new THREE.Vector3(), r: 0 };
    const lod = (name, fill) => {
      beginBatch();
      const holder = new THREE.Group();
      holder.name = `blk${c.key}:${name}`;
      g.add(holder);
      fill(holder);
      const merged = endBatch(this.object3D, name === 'proxy' ? PROXY_FOLD : null);
      if (merged) holder.add(merged);
      mergeShadow(holder);
      rec[name] = holder;
    };

    const full = (holder, o) => {
      const b = BUILDERS[o.type](o.zone, { ...o.p, seed: o.seed });
      b.position.set(o.x, seats.get(o.id).r.hi, o.z);
      b.rotation.y = o.ry;
      b.userData.sceneId = o.id;
      holder.add(b);
    };
    const stub = (holder, o) => {
      const m = proxyRec(o, seats.get(o.id).r);
      if (m) holder.add(dressing(o.zone, b => proxyPart(b, rng(o.seed), zone(o.zone), m), o.seed));
    };

    // `lod` on the object overrides the distance rule by picking which builder both sets get.
    const level = (holder, near) => {
      for (const o of c.objects) {
        const want = o.type === 'mass' ? 'mass' : o.lod === 'full' ? 'full' : o.lod === 'proxy' ? 'proxy' : (near ? 'full' : 'proxy');
        if (want === 'mass') {
          const m = massRec(o, seats.get(o.id).r);
          holder.add(dressing(o.zone, b => plainHouse(b, rng(o.seed), zone(o.zone), m), o.seed));
        } else if (want === 'full') full(holder, o);
        else stub(holder, o);
      }
    };

    // The dressing's geometry is built once — its RNG stream has already been consumed — and
    // cloned for the second set.
    lod('detail', holder => { level(holder, true); holder.add(emitBatch(d.zone, cloneBatch(c.dress))); });
    lod('proxy', holder => { level(holder, false); holder.add(emitBatch(d.zone, c.dress)); });

    const box = new THREE.Box3();
    for (const name of ['detail', 'proxy']) {
      rec[name].updateMatrixWorld(true);
      box.expandByObject(rec[name]);
    }
    if (!box.isEmpty()) {
      box.getCenter(rec.c);
      rec.r = box.getSize(new THREE.Vector3()).length() / 2;
    }
    return rec;
  }

  // A standalone, unmerged copy of one object, built at the origin so the editor can drag it by
  // its root. Its seed is the same one the batch uses, so it is the same building.
  liveObject(o) {
    const root = new THREE.Group();
    root.name = 'live';
    const r = this.seat(o);
    if (o.type === 'mass') {
      const local = { ...massRec(o, r), x: 0, z: 0, rot: 0, top: 0, bot: r.lo - r.hi };
      root.add(dressing(o.zone, b => plainHouse(b, rng(o.seed), zone(o.zone), local), o.seed));
    } else {
      root.add(BUILDERS[o.type](o.zone, { ...o.p, seed: o.seed }));
      // the batch builds this object's skirt into the district's dressing, which it is currently
      // lifted out of, so the live copy carries its own and takes it along on a drag
      const [hw, hd] = footprint(o);
      const dz = this.doc.districts[o.dist].zone;
      root.add(dressing(dz, b => foundation(b, { x: 0, z: 0, hw, hd, rot: 0, top: 0, bot: r.lo - r.hi })));
    }
    return root;
  }

  // The contact collar under every building. Cheap to redo, and without it a freshly placed
  // object reads as a sticker lying on the grass.
  // `skip` is for an object under the finger: its collar would otherwise sit where it was
  // picked up. A merely selected object still gets one, or it reads as floating while you edit it.
  refreshDecals(opacity = 1, skip = 0) {
    const T2 = this.terrain;
    T2.decalRings.length = 0;
    for (const o of this.doc.objects) {
      if (o.id === skip) continue;
      const [hw, hd] = footprint(o);
      T2.decalRings.push({ x: o.x, z: o.z, hw, hd, rot: o.ry, ao: 1, grow: 0.6 });
    }
    for (const d of this.doc.districts) {
      if (d.bridge) T2.decalRings.push({ x: d.bridge.x, z: d.bridge.z, hw: 6.3, hd: 13.5, rot: d.bridge.ry || 0, ao: 0.28, grow: 4.5 });
    }
    T2.finish();
    if (T2.decalMat) T2.decalMat.opacity = opacity;
  }

  seat(o) {
    const [hw, hd] = footprint(o);
    return this.terrain.range(o.x, o.z, hw, hd, o.ry);
  }
}

// A proxy set is never seen closer than stream.js's `lodDetail`, where a 0.27 m ridge cap and a
// 1.53 m window surround are a pixel or two of slightly different stone. Folding every dressing
// surface back into the wall there takes a distant block from four merged meshes to two.
// `glass` is in the fold: measured at 87 changed pixels of 921,600 on a night view from 225 m,
// against 14 draw calls across three towns. Near windows still light up — they are in the detail
// set. docs/NOTES_A8_LONGACRE.md §1.
const PROXY_FOLD = { trim: 'wall', crest: 'wall', glass: 'wall' };

const massRec = (o, r) => ({ zone: o.zone, seed: o.seed, x: o.x, z: o.z, rot: o.ry, ...o.p, top: r.hi, bot: r.lo });

function cloneBatch(src) {
  const b = new Batch(src.zoneId);
  for (const [surface, arr] of src.parts) b.parts.set(surface, arr.map(g => g.clone()));
  return b;
}

// The silhouette a block shows past `lodDetail`. Anything that reads as a building becomes the
// same plain gabled block a `mass` already is; the two shapes that plainly are not — a tower and
// a wall — get their own two-primitive stand-in. Ground furniture (pen, cross) has no silhouette
// at 70 m and is simply dropped.
function proxyRec(o, r) {
  const p = o.p;
  const base = { x: o.x, z: o.z, rot: o.ry, top: r.hi, bot: r.lo };
  switch (o.type) {
    case 'house': case 'mill': case 'barn': return { ...base, kind: 'block', w: p.w, d: p.d, h: p.h };
    case 'arcade': return { ...base, kind: 'block', w: p.length, d: p.depth, h: p.height };
    case 'tower': return { ...base, kind: 'tower', radius: p.radius, height: p.height, sides: p.sides };
    case 'wallRun': return { ...base, kind: 'wall', length: p.length, height: p.height, thickness: p.thickness };
    case 'retaining': return { ...base, kind: 'wall', length: p.length, height: p.height, thickness: p.height * p.batter * 2 + 1.8 };
    default: return null;
  }
}

function proxyPart(b, R, z, m) {
  if (m.kind === 'block') return plainHouse(b, R, z, m);
  const foot = m.top - (m.bot - 0.75);
  const at = T(m.x, m.top, m.z, m.rot);
  if (m.kind === 'tower') {
    const n = Math.max(6, Math.min(12, m.sides | 0 || 8));
    const h = m.height + foot;
    // The roof has to reach where the real one does. tower() puts its lathe roof 2.4 m above the
    // machicolation and rises `radius · pitch` again; a cone stopping at the shaft left a 3.4 m
    // gap, which at 110 m was the entire part of a campanile that clears the roofs in front of it.
    const pitch = z.edges === 'sharp' ? 2.6 : z.edges === 'curved' ? 1.2 : 0.9;
    const cone = m.radius * pitch + 2.4;
    b.add('wall', new THREE.CylinderGeometry(m.radius * 1.05, m.radius * 1.25, h, n), at.clone().multiply(T(0, h / 2 - foot, 0)));
    b.add('trim', new THREE.CylinderGeometry(m.radius * 1.26, m.radius * 1.1, 0.9, n), at.clone().multiply(T(0, m.height + 0.45, 0)));
    b.add('roof', new THREE.ConeGeometry(m.radius * 1.2, cone, n), at.clone().multiply(T(0, m.height + 0.9 + cone / 2, 0)));
  } else {
    const h = m.height + foot;
    b.add('wall', taperBox(m.length, m.thickness, h, m.length, m.thickness + 1.5), at.clone().multiply(T(0, h / 2 - foot, 0)));
    b.add('trim', new THREE.BoxGeometry(m.length, 0.5, m.thickness + 1.4), at.clone().multiply(T(0, m.height + 0.25, 0)));
  }
}

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
  const h = bd.top - (bd.bot - 0.75);
  if (h < 0.18) return;
  const y = bd.bot - 0.75;
  b.add('wall', taperBox(bd.hw * 2 + 0.6, bd.hd * 2 + 0.6, h, bd.hw * 2 + 2.25, bd.hd * 2 + 2.25),
    T(bd.x, y + h / 2, bd.z, bd.rot));
}

function kerb(b, R, k) {
  const ry = heightAt(k.x, k.z);
  const drop = k.top - ry;
  if (drop < KERB.minDrop) return;
  const hh = drop + 0.53;
  b.add('wall', taperBox(0.83, k.len, hh, 1.43, k.len), T(k.x, ry - KERB.sink + hh / 2, k.z));
  b.add('trim', new THREE.BoxGeometry(1.2, 0.24, k.len), T(k.x, ry - KERB.sink + hh + 0.12, k.z));
  // step rise stays 0.19, so a 1.5× drop simply gets 1.5× the steps
  if (drop > 1.13) {
    addSteps(b, {
      m: T(k.x, ry - KERB.sink + hh, k.z + span(R, -k.len * 0.3, k.len * 0.3), -k.side * Math.PI / 2),
      w: 2.4, count: Math.round(drop / 0.19), surface: 'trim',
    });
  }
}

function wallRubble(b, R, o) {
  const y = heightAt(o.x, o.z);
  const out = o.p.thickness / 2 + 3.3;
  for (const s of [-1, 1]) {
    addRubble(b, R, {
      m: T(o.x, y, o.z, o.ry).multiply(T(0, 0, s * out)),
      length: o.p.length - 3, offset: s * 1.65, count: 22, size: 0.75, surface: 'wall',
    });
  }
}

function plainHouse(b, R, z, { x, z: zz, w, d, h, rot, top, bot }) {
  const m = T(x, top, zz, rot);
  const foot = top - (bot - 0.75);
  const profile = z.edges === 'curved' ? 'curved' : 'flat';
  const th = z.roof.tile === 'thatch' ? 0.75 : 0.45;
  const ridgeX = w >= d;
  const spanW = ridgeX ? d : w, ridgeLen = ridgeX ? w : d;
  const rise = Math.min(spanW * (z.edges === 'sharp' ? 0.9 : 0.62) * span(R, 0.85, 1.2), h * 0.95);
  const over = z.roof.overhang ?? 0.68;

  b.add('wall', taperBox(w + 0.45, d + 0.45, foot + 0.45, w + 1.8, d + 1.8), m.clone().multiply(T(0, -foot / 2 + 0.23, 0)));
  b.add('wall', new THREE.BoxGeometry(w, h, d), m.clone().multiply(T(0, h / 2, 0)));

  const roof = roofSlab({ w: spanW, d: ridgeLen, rise, over, th, profile });
  if (ridgeX) roof.rotateY(Math.PI / 2);
  b.add('roof', roof, m.clone().multiply(T(0, h, 0)), true);
  const gm = ridgeX
    ? [T(w / 2, h, 0, Math.PI / 2), T(-w / 2, h, 0, -Math.PI / 2)]
    : [T(0, h, d / 2), T(0, h, -d / 2, Math.PI)];
  for (const q of gm) b.add('wall', extrude(gableShape(spanW, rise, over, profile, th), 0.18), m.clone().multiply(q));
  b.add('trim', new THREE.BoxGeometry(ridgeLen + 1.05, 0.27, 0.54), m.clone().multiply(ridgeX ? T(0, h + rise - 0.09, 0) : T(0, h + rise - 0.09, 0, Math.PI / 2)));

  // a few panes so the block lights up after dark like everything else
  const rows = h > 9 ? [2.1, h * 0.62] : [h * 0.42];
  for (const face of ridgeX ? [0, 2] : [1, 3]) {
    const along = face % 2 ? d : w;
    const fm = [T(0, 0, d / 2), T(w / 2, 0, 0, Math.PI / 2), T(0, 0, -d / 2, Math.PI), T(-w / 2, 0, 0, -Math.PI / 2)][face];
    const n = Math.max(1, Math.floor(along / 5.1));
    for (let i = 1; i <= n; i++) {
      for (const ry of rows) {
        if (R() < 0.28) continue;
        const wm = m.clone().multiply(fm).multiply(T(-along / 2 + along * i / (n + 1), ry, 0));
        b.add('trim', new THREE.BoxGeometry(1.53, 2.25, 0.165), wm.clone().multiply(T(0, 0, 0.03)));
        b.add('glass', new THREE.PlaneGeometry(0.99, 1.59), wm.clone().multiply(T(0, 0, 0.135)));
      }
    }
  }
  if (R() < 0.55) {
    addChimney(b, R, {
      m: m.clone().multiply(T(span(R, -ridgeLen * 0.3, ridgeLen * 0.3) * (ridgeX ? 1 : 0), h + rise - 0.75, span(R, -ridgeLen * 0.3, ridgeLen * 0.3) * (ridgeX ? 0 : 1))),
      w: 1.28, h: span(R, 2.25, 3.9), surface: 'wall', cap: 'trim',
    });
  }
}

// `ry` turns the deck to face the water. It used to be built axis-aligned in z, which was fine
// while the creek ran along x; the Vail crosses Millbridge at 45° and an unrotated deck spans
// dry land beside the channel.
function bridge(b, R, { x, z: cz, halfSpan, deck: high, ry = 0 }) {
  const wy = waterY(x);
  const deck = wy + (high || BRIDGE.deck);
  const len = halfSpan * 2 + BRIDGE.overhang * 2;
  const w = BRIDGE.w;
  const bedY = wy - 2.85;
  const px = BRIDGE.parapetX();
  const base = T(x, 0, cz, ry);
  const at = (lx, y, lz) => base.clone().multiply(T(lx, y, lz));
  const cos = Math.cos(ry), sin = Math.sin(ry);

  for (const s of [-1, 1]) {
    const d = s * (halfSpan + 8.25);
    const gh = heightAt(x - sin * d, cz + cos * d);
    const abut = deck - Math.min(bedY, gh - 1.5);
    b.add('wall', taperBox(w, 7.8, abut, w + 1.65, 9.9), at(0, deck - abut / 2, s * (halfSpan + 3.9)));
  }
  for (const s of [-1, 1]) {
    b.add('wall', taperBox(3.0, 2.25, deck - bedY, 4.2, 3.3), at(0, bedY + (deck - bedY) / 2, s * 4.35));
  }
  b.add('wall', new THREE.BoxGeometry(w, 0.83, len), at(0, deck - 0.42, 0));
  b.add('trim', new THREE.BoxGeometry(w + 0.75, 0.3, len + 0.6), at(0, deck + 0.09, 0));
  for (const s of [-1, 1]) {
    b.add('wall', new THREE.BoxGeometry(BRIDGE.parapetT, 1.28, len), at(s * px, deck + 0.75, 0));
    b.add('trim', new THREE.BoxGeometry(0.93, 0.24, len), at(s * px, deck + 1.5, 0));
  }
  for (const s of [-1, 1]) {
    addRubble(b, R, { m: at(0, bedY + 0.3, s * (halfSpan + 3.9)), length: w, offset: s * 2.4, count: 8, size: 0.83, surface: 'wall' });
  }
}

// --- v3 object types -------------------------------------------------------------------------

function gabled(b, R, { w, d, h, thatch = false, over = 0.68 }) {
  const ridgeX = w >= d;
  const spanW = ridgeX ? d : w, ridgeLen = ridgeX ? w : d;
  const rise = spanW * 0.55;
  const th = thatch ? 0.75 : 0.45;
  b.add('wall', new THREE.BoxGeometry(w, h, d), T(0, h / 2, 0));
  const roof = roofSlab({ w: spanW, d: ridgeLen, rise, over, th, profile: 'flat' });
  if (ridgeX) roof.rotateY(Math.PI / 2);
  b.add('roof', roof, T(0, h, 0), true);
  const gm = ridgeX
    ? [T(w / 2, h, 0, Math.PI / 2), T(-w / 2, h, 0, -Math.PI / 2)]
    : [T(0, h, d / 2), T(0, h, -d / 2, Math.PI)];
  for (const q of gm) b.add('wall', extrude(gableShape(spanW, rise, over, 'flat', th), 0.18), q);
  b.add('trim', new THREE.BoxGeometry(ridgeLen + 1.05, 0.27, 0.54),
    ridgeX ? T(0, h + rise - 0.09, 0) : T(0, h + rise - 0.09, 0, Math.PI / 2));
  return rise;
}

// A gabled house with an overshot wheel on its +x face and the launder that feeds it.
function mill(b, R, { w, d, h, wheel }) {
  gabled(b, R, { w, d, h });
  const hub = w / 2 + 0.9;
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    b.add('wood', new THREE.BoxGeometry(0.28, wheel * 2 - 0.5, 0.9),
      T(hub, wheel + 0.6, 0).multiply(T(0, 0, 0, 0, 0, a)));
    b.add('wood', new THREE.BoxGeometry(0.5, 0.9, 1.5),
      T(hub + 0.1, wheel + 0.6 + Math.cos(a) * (wheel - 0.2), Math.sin(a) * (wheel - 0.2)));
  }
  for (const s of [-1, 1]) {
    b.add('trim', new THREE.CylinderGeometry(wheel, wheel, 0.22, 20),
      T(hub + s * 0.7, wheel + 0.6, 0, 0, 0, Math.PI / 2));
  }
  b.add('wood', new THREE.BoxGeometry(5.4, 0.5, 1.8), T(hub + 2.4, wheel * 2 + 0.5, 0));
  addChimney(b, R, { m: T(span(R, -w * 0.2, w * 0.2), h + 1.2, 0), w: 1.28, h: 3.0, surface: 'wall', cap: 'trim' });

  // Without these, three of a mill's four faces are blank: gabled() emits no opening anywhere and
  // the wheel and its launder are both on +x. That is 11.5 m of blank stone at Longacre's size,
  // on the face you walk up to. `barn()` already makes the same trade with its cart doors. They
  // go on ±z, so they can never land on the wheel. The lucam is the hoist housing sacks come up
  // into, and the stub is the beam it swings from.
  const side = d / 2;
  const dw = Math.min(3.0, w * 0.2), dh = Math.min(h - 2.4, 3.9);
  for (const s of [-1, 1]) {
    b.add('wood', new THREE.BoxGeometry(dw, dh, 0.24), T(0, dh / 2, s * (side + 0.06)));
  }
  b.add('wood', new THREE.BoxGeometry(dw * 0.8, dh * 0.75, 0.3), T(0, h - dh * 0.5, side + 0.1));
  b.add('wall', new THREE.BoxGeometry(dw + 1.0, 2.7, 2.6), T(0, h + 1.35, side - 0.9));
  b.add('wood', new THREE.BoxGeometry(0.4, 0.4, 3.4), T(0, h + 2.3, side + 1.1));
}

// Long, tall, no windows, and a cart-sized opening in the middle of each long side.
function barn(b, R, { w, d, h }) {
  gabled(b, R, { w, d, h, thatch: true, over: 1.05 });
  const dw = Math.min(6, w * 0.3), dh = Math.min(h - 0.6, 6.6);
  for (const s of [-1, 1]) {
    b.add('wood', new THREE.BoxGeometry(dw, dh, 0.24), T(0, dh / 2, s * (d / 2 + 0.06)));
    b.add('trim', new THREE.BoxGeometry(dw + 0.8, 0.34, 0.5), T(0, dh + 0.17, s * (d / 2 + 0.1)));
  }
  const posts = Math.max(2, Math.round(w / 5));
  for (let i = 0; i <= posts; i++) {
    const x = -w / 2 + (w * i) / posts;
    if (Math.abs(x) < dw / 2 + 0.6) continue;
    for (const s of [-1, 1]) b.add('wood', new THREE.BoxGeometry(0.36, h, 0.2), T(x, h / 2, s * (d / 2 + 0.05)));
  }
}

function pen(b, R, { w, d, h }) {
  const put = (x, z) => b.add('wood', new THREE.BoxGeometry(0.22, h + 0.3, 0.22), T(x, (h + 0.3) / 2, z));
  const rail = (x, z, len, ry) => {
    for (const y of [h * 0.45, h * 0.92]) {
      b.add('wood', new THREE.BoxGeometry(len, 0.14, 0.1), T(x, y + span(R, -0.04, 0.04), z, ry));
    }
  };
  const nx = Math.max(2, Math.round(w / 3.2)), nz = Math.max(2, Math.round(d / 3.2));
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w * i) / nx;
    put(x, -d / 2); put(x, d / 2);
    if (i < nx) { rail(x + w / nx / 2, -d / 2, w / nx, 0); rail(x + w / nx / 2, d / 2, w / nx, 0); }
  }
  for (let i = 1; i < nz; i++) {
    const z = -d / 2 + (d * i) / nz;
    put(-w / 2, z); put(w / 2, z);
  }
  for (let i = 0; i < nz; i++) {
    const z = -d / 2 + (d * (i + 0.5)) / nz;
    rail(-w / 2, z, d / nz, Math.PI / 2); rail(w / 2, z, d / nz, Math.PI / 2);
  }
}

// Stepped octagonal base, a tapering shaft, a head. The one thing every market square has.
function cross(b, R, { steps, height, radius }) {
  let y = 0;
  for (let i = 0; i < steps; i++) {
    const r = radius * (1 - i / (steps + 1.6));
    b.add('trim', new THREE.CylinderGeometry(r, r + 0.06, 0.28, 8), T(0, y + 0.14, 0));
    y += 0.28;
  }
  b.add('wall', new THREE.CylinderGeometry(0.52, 0.72, 0.9, 8), T(0, y + 0.45, 0));
  y += 0.9;
  b.add('wall', new THREE.CylinderGeometry(0.26, 0.44, height, 8), T(0, y + height / 2, 0));
  y += height;
  b.add('trim', new THREE.CylinderGeometry(0.62, 0.30, 0.7, 8), T(0, y + 0.35, 0));
  b.add('trim', new THREE.BoxGeometry(0.34, 1.1, 0.34), T(0, y + 1.2, 0));
  b.add('trim', new THREE.BoxGeometry(1.0, 0.3, 0.3), T(0, y + 1.35, 0));
}

// A run of piers under a flat lean-to: the market frontage, and the cheapest way to make a
// street read as a street rather than a row of boxes.
function arcade(b, R, { length, height, depth, bays }) {
  const pitch = length / bays;
  const pw = Math.min(1.2, pitch * 0.22);
  for (let i = 0; i <= bays; i++) {
    const x = -length / 2 + pitch * i;
    b.add('wall', taperBox(pw, depth * 0.55, height, pw * 1.5, depth * 0.75), T(x, height / 2, 0));
  }
  b.add('wall', new THREE.BoxGeometry(length + pw, 0.75, depth * 0.6), T(0, height + 0.375, 0));
  b.add('trim', new THREE.BoxGeometry(length + pw + 0.5, 0.26, depth * 0.7), T(0, height + 0.88, 0));
  // the arch heads, as a chamfer block between each pair of piers
  for (let i = 0; i < bays; i++) {
    const x = -length / 2 + pitch * (i + 0.5);
    b.add('wall', taperBox(pitch - pw, depth * 0.5, 0.6, pitch - pw * 2.6, depth * 0.5), T(x, height - 0.3, 0));
  }
  for (const s of [-1, 1]) {
    b.add('wall', new THREE.BoxGeometry(pw, height + 0.75, depth * 0.55), T(s * (length / 2), (height + 0.75) / 2, -depth * 0.24));
  }
}

// Holds a terrace up. Battered face, a coping course, and buttresses every 8 m — the thing
// Blackstone's three levels need if the ground between them is not to read as a grass ramp.
function retaining(b, R, { length, height, batter }) {
  const foot = height * batter + 0.9;
  b.add('wall', taperBox(length, foot * 2, height, length, 1.2), T(0, height / 2, 0));
  b.add('trim', new THREE.BoxGeometry(length + 0.4, 0.34, 1.6), T(0, height + 0.17, 0));
  const n = Math.max(1, Math.round(length / 8));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length * i) / n;
    b.add('wall', taperBox(1.1, foot * 2 + 1.1, height * 0.82, 1.1, 0.9),
      T(x, height * 0.41, -foot * 0.4 + span(R, -0.05, 0.05)));
  }
}


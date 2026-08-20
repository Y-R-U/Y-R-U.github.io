// §3.2 / §3.6 — the city as it reaches the GPU.
//
// THREE GLOBAL INSTANCED FIELDS, and chunks own slot ranges inside them. The obvious scheme —
// one InstancedMesh per chunk per material — is the wrong architecture here and §3.2 says so:
// 25 near chunks x 4 material classes is 100 draw calls before a single sign. Because every
// building shares one atlas and one material we can do the opposite:
//
//   LOD0  8 InstancedMesh, one per §3.3 prototype   — full geometry, windows, collision AABBs
//   LOD1  1 InstancedMesh, the prototype bounding box, tallest 40 % of each chunk
//   LOD2  1 InstancedMesh, six far towers per 1024 m far chunk, unlit
//   ground 1 Mesh
//
// Eleven draw calls for the entire city at any distance.
//
// Slot allocation is a dense swap-remove, not a free list. `renderer.info.triangles` is
// `mesh.count x geometry tris`, so a field with holes in it bills for the holes; keeping every
// field packed into [0, n) is what makes the triangle gate mean something.

import * as THREE from 'three';
import { CHUNK, FAR_CHUNK, PROTO_IDS } from './city.js';
import { buildPrototypes, buildLodBox, PROTO_TRAITS } from './blocks.js';
import { shellMaterial, farMaterial, uvScale3, U } from './materials.js';
import { COLS_PER_CELL, ROWS_PER_CELL, GRID, cellOffset } from './atlas.js';

// Sized from the HIGH preset unconditionally, so `__game.setQuality('high')` after a downgrade
// does not have to reallocate. The whole set is ~0.5 MB of typed array.
const PROTO_SHARE = { slab: 0.35, taper: 0.14, stack: 0.12, terrace: 0.12, podium: 0.10, drum: 0.07, bridged: 0.06, spire: 0.04 };
const MAX_PER_CHUNK = 34;             // 25 lots x the split roll, plus two landmark parts
const HEADROOM = 2.2;                 // a chunk is not the average chunk

const FAR_ATTRS = [{ name: 'iTint', size: 3 }];

const SHELL_ATTRS = [
  { name: 'iUvOffset', size: 2 },
  { name: 'iUvScale', size: 3 },
  { name: 'iEmissive', size: 3 },
  { name: 'iSeed', size: 1 },
  { name: 'iChunk', size: 2 },
  // P11 §1 — the second colour zone and the three world-Y boundaries that cut a facade into up to
  // four reads. Seven floats on ~4,000 live instances is 112 KB of typed array and zero draws;
  // this is instance data, not geometry, which is the constraint ART_PASS sets on the whole pass.
  { name: 'iEmissive2', size: 3 },
  { name: 'iZone', size: 4 },        // (split, band0, band1, crown) in metres above y = 0
];

// ── one instanced field ────────────────────────────────────────────────────

export class Field {
  constructor(name, geo, mat, cap, attrs) {
    this.name = name; this.cap = cap; this.n = 0; this.attrSpec = attrs;
    this.geo = geo;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;     // §3.2.3 — a global field has no meaningful sphere
    this.mesh.matrixAutoUpdate = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.attr = {};
    // A flat [array, itemSize] list beside the named map. `free` runs ~1,350 times in the frame a
    // near chunk is demoted, and a string key lookup per attribute per free is not free.
    this.raw = [];
    for (const a of attrs) {
      const ba = new THREE.InstancedBufferAttribute(new Float32Array(cap * a.size), a.size);
      ba.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(a.name, ba);
      this.attr[a.name] = ba;
      this.raw.push([ba.array, a.size]);
    }
    this.ownerArr = new Array(cap).fill(null);
    this.ownerIdx = new Int32Array(cap);
    this.d0 = Infinity; this.d1 = -1;
    this.overflow = 0;
    this.tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  touch(s) { if (s < this.d0) this.d0 = s; if (s > this.d1) this.d1 = s; }

  alloc(arr, idx) {
    if (this.n >= this.cap) { this.overflow++; return -1; }
    const s = this.n++;
    this.ownerArr[s] = arr; this.ownerIdx[s] = idx;
    this.touch(s);
    return s;
  }

  // Swap-remove: the last live instance moves into the freed slot and its owner is told where it
  // went. O(1), and the field stays packed.
  // Hand-rolled copies, not copyWithin. For a 1-4 element move the typed-array method call costs
  // more than the copy: releasing one near chunk frees ~270 signage instances across six fields,
  // and at seven copyWithin calls each that was ~2 ms inside retarget() — measured, and well over
  // §3.2.3's whole per-frame generation budget.
  free(s) {
    const last = --this.n;
    if (s !== last) {
      const m = this.mesh.instanceMatrix.array;
      const ma = s * 16, mb = last * 16;
      for (let i = 0; i < 16; i++) m[ma + i] = m[mb + i];
      for (let k = 0; k < this.raw.length; k++) {
        const b = this.raw[k][0], sz = this.raw[k][1], x = s * sz, y = last * sz;
        for (let i = 0; i < sz; i++) b[x + i] = b[y + i];
      }
      const arr = this.ownerArr[last], i = this.ownerIdx[last];
      arr[i] = s;
      this.ownerArr[s] = arr; this.ownerIdx[s] = i;
      this.touch(s);
    }
    this.ownerArr[last] = null;
    this.touch(last);
  }

  set(name, s, a, b, c, d) {
    const at = this.attr[name], k = s * at.itemSize;
    at.array[k] = a;
    if (at.itemSize > 1) at.array[k + 1] = b;
    if (at.itemSize > 2) at.array[k + 2] = c;
    if (at.itemSize > 3) at.array[k + 3] = d;
  }

  flush() {
    this.mesh.count = this.n;
    if (this.d1 < 0) return;
    const off = this.d0, cnt = this.d1 - this.d0 + 1;
    // addUpdateRange, not the `updateRange` object — r160 deprecated the latter and warns on
    // every touch, and a console.warn per attribute per frame is its own perf problem.
    const mark = (at, size) => {
      if (at.addUpdateRange) at.addUpdateRange(off * size, cnt * size);
      at.needsUpdate = true;
    };
    mark(this.mesh.instanceMatrix, 16);
    for (const a of this.attrSpec) mark(this.attr[a.name], a.size);
    this.d0 = Infinity; this.d1 = -1;
  }

  dispose() { this.geo.dispose(); this.mesh.dispose(); }
}

// ── the city renderer ──────────────────────────────────────────────────────

export class CityRenderer {
  constructor(scene, Q, atlas, city, sky, groundMat) {
    this.scene = scene; this.Q = Q; this.atlas = atlas; this.city = city;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this.matL0 = shellMaterial(atlas, sky.env, 'lod0');
    this.matL1 = shellMaterial(atlas, sky.env, 'lod1');
    this.matL2 = farMaterial();

    // LOD0 — one field per prototype. §3.8's "8 draws" line.
    const nearCap = 25 * MAX_PER_CHUNK;    // the HIGH 5x5 ring
    this.protos = buildPrototypes();
    this.lod0 = this.protos.map(p => {
      const cap = Math.max(96, Math.round(nearCap * PROTO_SHARE[p.id] * HEADROOM));
      const f = new Field('lod0:' + p.id, p.geo, this.matL0, cap, SHELL_ATTRS);
      this.group.add(f.mesh);
      return f;
    });
    this.protoIndex = Object.fromEntries(this.protos.map((p, i) => [p.id, i]));

    // LOD1 — 13x13 minus nothing: every chunk in the mid ring AND every near chunk, because the
    // cross-fade needs both halves live inside the 77 m band and a near chunk's centre can be
    // 543 m out (§3.2.2). Discarded wholesale by the dither when vFade is 0, at no upload cost.
    const midCap = 169 * Math.ceil(MAX_PER_CHUNK * 0.4 + 2);
    this.lod1 = new Field('lod1', buildLodBox(), this.matL1, midCap, SHELL_ATTRS);
    this.group.add(this.lod1.mesh);

    // LOD2 — the fog-swallowed skyline. Absent entirely on LOW (`Q.ringFar = 0`).
    this.lod2 = new Field('lod2', buildLodBox(), this.matL2, 9 * 9 * 6 + 40, FAR_ATTRS);
    this.group.add(this.lod2.mesh);

    // §3.6 — a 1400 m deck following the camera in 256 m snaps so the texture never swims.
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.frustumCulled = false;
    this.ground.matrixAutoUpdate = false;
    // §3.7(b)'s draw order: the road is FIRST in the opaque list and does not write depth, so the
    // mirror group at y < 0 survives it. Nothing in the game is ever behind the road.
    this.ground.renderOrder = -1;
    this.group.add(this.ground);
    this.onSnap = null;              // P3b's water film rides the same 256 m snap

    this.live = new Map();       // key -> near/mid chunk record
    this.queue = [];             // records with work outstanding
    this.far = new Map();        // key -> far chunk record
    this.farQueue = [];
    this.ccx = NaN; this.ccz = NaN;
    this.ffx = NaN; this.ffz = NaN;
    this.msGen = 0;
    // The worst each §3.2.3 work unit has actually cost, so `pump` can refuse to start one that
    // will not fit in what is left of the frame's 1.2 ms.
    this.stageMs = [0, 0, 0, 0, 0];
    // The same worsts, but FLIGHT-SCOPED and diagnostic-only. `stageMs` is the predictive cap's
    // memory and must never be cleared — seeded at zero it would let the first signage unit of a
    // flight run unbounded — but it also carries the BOOT PRE-WARM, where units run back to back
    // with no cap at all and stage 0 measures 1.6 ms. A gate reading it was therefore reading the
    // loading bar and calling it a flight. This one is cleared by resetPerf() and written only by
    // pump(), so what it holds is the worst work unit of the run under test.
    this.stagePeak = [0, 0, 0, 0, 0];
    this.farMs = 0;
    this.relMs = 0;
    this.retargetMs = 0;
    this.sgDying = [];           // chunks whose signage slots are waiting to be freed
    this.fadeHard = false;       // the gate's hard-swap control (§3.2.2), never a runtime option

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._uv = [0, 0, 0];
    this._col = new THREE.Color();

    this.applyQuality(Q);
  }

  // P3a attaches after construction (main.js), because the signage sheet is a fetch and the city
  // renderer must exist before the loading bar's pre-warm. Nothing in this file imports signage.js.
  attachSignage(sig) {
    while (this.sgDying.length) this.drainDying();
    this.signage = sig;
    for (const rec of this.live.values()) { this.signage.release(rec); rec.stage = Math.min(rec.stage, 2); }
    this.ccx = NaN;
    return sig;
  }

  applyQuality(Q) {
    this.Q = Q;
    this.ringNear = Q.ringNear;
    this.ringMid = Q.ringMid;
    this.ringFar = Q.ringFar;
    this.R0 = Q.ringNearRadius;
    U.uR0.value = this.R0;
    this.lod2.mesh.visible = this.ringFar >= 2;
    if (!this.lod2.mesh.visible) {
      for (const r of this.far.values()) this.releaseFar(r);
      this.far.clear(); this.farQueue.length = 0;
    }
    // Q.signDensity changed, so every chunk's signage has to be re-rolled, not merely re-culled.
    if (this.signage) {
      while (this.sgDying.length) this.drainDying();
      this.signage.applyQuality(Q);
      for (const rec of this.live.values()) { this.signage.release(rec); rec.stage = Math.min(rec.stage, 2); }
    }
    this.ccx = NaN;                  // force a retarget on the next update
    this.ffx = NaN;
  }

  // ── the per-frame entry point ────────────────────────────────────────────
  // `frameStart` is the frame's own t0, so the §3.2.3 deferral rule ("skip the next unit if the
  // frame is already past 6 ms") is measured against the frame and not against this function.
  update(camPos, frameStart) {
    U.uCamXZ.value.set(camPos.x, camPos.z);
    U.uR0.value = this.R0;
    U.uFadeHard.value = this.fadeHard ? 1 : 0;
    this.snapGround(camPos);

    const t0 = performance.now();

    const cx = Math.floor(camPos.x / CHUNK), cz = Math.floor(camPos.z / CHUNK);
    if (cx !== this.ccx || cz !== this.ccz) {
      const r0 = performance.now();
      this.ccx = cx; this.ccz = cz; this.retarget();
      const rms = performance.now() - r0;
      if (rms > this.retargetMs) this.retargetMs = rms;
    }

    if (this.ringFar >= 2) {
      const fx = Math.floor(camPos.x / FAR_CHUNK), fz = Math.floor(camPos.z / FAR_CHUNK);
      if (fx !== this.ffx || fz !== this.ffz) { this.ffx = fx; this.ffz = fz; this.retargetFar(); }
    }

    this.pump(t0, frameStart);
    this.msGen = performance.now() - t0;

    for (const f of this.lod0) f.flush();
    this.lod1.flush();
    this.lod2.flush();
    this.signage?.flush();
    return this.msGen;
  }

  snapGround(camPos) {
    const gx = Math.round(camPos.x / CHUNK) * CHUNK, gz = Math.round(camPos.z / CHUNK) * CHUNK;
    if (this.ground.position.x !== gx || this.ground.position.z !== gz) {
      this.ground.position.set(gx, 0, gz);
      this.ground.updateMatrix();
    }
    this.onSnap?.(gx, gz);
  }

  // ── the want set ─────────────────────────────────────────────────────────
  retarget() {
    const { ccx, ccz, ringNear, ringMid } = this;
    const want = new Set();
    for (let dz = -ringMid; dz <= ringMid; dz++) {
      for (let dx = -ringMid; dx <= ringMid; dx++) {
        want.add((ccx + dx) + ',' + (ccz + dz));
      }
    }
    for (const [key, rec] of this.live) {
      if (!want.has(key)) { this.releaseChunk(rec); this.live.delete(key); }
    }
    this.queue.length = 0;
    for (let dz = -ringMid; dz <= ringMid; dz++) {
      for (let dx = -ringMid; dx <= ringMid; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        const key = cx + ',' + cz;
        const near = Math.max(Math.abs(dx), Math.abs(dz)) <= ringNear;
        let rec = this.live.get(key);
        if (!rec) {
          rec = { cx, cz, key, near, stage: 0, desc: null, l0f: [], l0s: [], l1s: [], aabbs: null,
            d2: dx * dx + dz * dz };
          this.live.set(key, rec);
        } else {
          rec.d2 = dx * dx + dz * dz;
          if (rec.near !== near) {
            rec.near = near;
            // Back to stage 0, not stage 1: the collision AABBs are built in unit (1) alongside
            // the descriptors and a chunk promoted from the mid ring has none. Re-running unit (1)
            // is a Map lookup — generateChunk is memoised — so this costs nothing and a promotion
            // that skipped it left a hole in the collision store you only find by flying into it.
            if (!near) this.releaseLod0(rec);
            rec.stage = 0;
          }
        }
        if (rec.stage < 5) this.queue.push(rec);
      }
    }
    // Nearest LAST, because `pump` works from the end of the array: the chunk you are about to
    // fly into is the one that must exist first.
    this.queue.sort((a, b) => b.d2 - a.d2);
  }

  // P3a's signage, strips, strobes and structures are LOD0-only (§3.2), so they are freed with
  // the LOD0 slots and rebuilt by the same stage reset when a chunk is promoted back to near.
  // RELEASE IS DEFERRED, all of it. retarget() decides what changed; the pump does the work.
  //
  // A near chunk holds ~29 LOD0 instances and ~250 signage/strip/strobe/structure instances, and
  // one boundary crossing demotes five of them. Freeing that inside retarget() measured 1.3 ms in
  // a single frame — and retarget() is not one of §3.2.3's yieldable work units, it runs whole or
  // not at all, so there is nowhere inside it to stop. Deferring it makes the frees budgeted work
  // like everything else. The instances stay live for a frame or two at a distance where §3.2.2
  // has already ramped them to zero and where the chunk is rendering as LOD1 anyway, so nothing
  // is visible; the fields carry 2.2x headroom for the slots that stay allocated meanwhile.
  releaseLod0(rec) {
    if (rec.l0s.length || rec.signed || rec.extra || rec.sgAt) this.sgDying.push(rec);
  }

  // Free one deferred chunk. If it came back into the near ring before we got here, everything it
  // holds is still correct — placement is a pure function of the building — so keep it and rebuild
  // nothing, which is also what makes flying back and forth across one boundary cheap.
  drainDying() {
    const rec = this.sgDying.pop();
    if (!rec) return;
    if (this.live.get(rec.key) === rec && rec.near) return;
    for (let i = rec.l0s.length - 1; i >= 0; i--) this.lod0[rec.l0f[i]].free(rec.l0s[i]);
    rec.l0f.length = 0; rec.l0s.length = 0;
    rec.aabbs = null;
    this.signage?.release(rec);
    // An evicted chunk is gone from `live` and its LOD1 slots go with it.
    if (this.live.get(rec.key) !== rec) {
      for (let i = rec.l1s.length - 1; i >= 0; i--) this.lod1.free(rec.l1s[i]);
      rec.l1s.length = 0;
    }
  }

  // An evicted chunk always goes through the deferred queue, because its LOD1 slots have to be
  // freed AFTER `live` no longer holds it — that is how drainDying tells eviction from demotion.
  releaseChunk(rec) { this.sgDying.push(rec); }

  // ── §3.2.3's four work units ─────────────────────────────────────────────
  // Each unit is bounded; the CAP IS PER FRAME, not per chunk — at most 1.2 ms of generation
  // work in any frame, however many units that is. The first draft budgeted 1.5 ms in §3.11 and
  // permitted 4 ms here; 1.2 is the reconciled number and it sits BELOW the budget line.
  // The cap is PREDICTIVE, and it has to be. Checking only the time already spent lets a unit
  // begin at 1.19 ms and finish at 2.2 ms — measured: P3a's signage unit costs up to 1.0 ms on a
  // dense chunk, and pairing it with a second unit put worst `ms.gen` at 1.7 against a 1.4 gate.
  // `stageMs` is the worst each stage has ACTUALLY cost this session, so the prediction is a
  // measurement rather than an assumption, and one unit is always allowed through so the stream
  // can never stall.
  pump(t0, frameStart) {
    const CAP = 1.2, DEFER = 6.0;
    let ran = 0;
    while (this.queue.length || this.farQueue.length || this.sgDying.length) {
      const now = performance.now();
      if (ran && now - frameStart > DEFER) break;
      {
        const rec = this.sgDying.length ? null
          : (this.queue.length ? this.queue[this.queue.length - 1] : null);
        // 1.4x plus a floor, not the bare measurement: `stageMs` is the worst SEEN, and the frame
        // that sets a new worst is exactly the frame that overruns. A margin costs a little
        // streaming throughput and buys the property §3.2.3 actually asks for — the cap sits below
        // the budget rather than above it.
        const est = this.sgDying.length ? this.relMs : (rec ? this.stageMs[rec.stage] : this.farMs);
        const room = CAP - (now - t0);
        // One unit is forced through so the stream can never stall — but only while most of the
        // budget is still free. `retarget()` is inside this window and is not yieldable, so on the
        // frame it fires it can eat 1.1 ms on its own; forcing a unit on top of that was the last
        // remaining way to land a 1.7 ms `ms.gen`.
        if (est * 1.4 + 0.05 > room && !(ran === 0 && room > 0.85)) break;
      }
      const s0 = performance.now();
      let stage = -1;
      if (this.sgDying.length) {
        stage = -2;
        this.drainDying();
      } else if (this.queue.length) {
        const rec = this.queue[this.queue.length - 1];
        stage = rec.stage;
        this.step(rec);
        if (rec.stage >= 5) this.queue.pop();
      } else {
        this.stepFar(this.farQueue.pop());
      }
      const ms = performance.now() - s0;
      if (stage === -2) this.relMs = Math.max(this.relMs, ms);
      else if (stage < 0) this.farMs = Math.max(this.farMs, ms);
      else {
        if (ms > this.stageMs[stage]) this.stageMs[stage] = ms;
        if (ms > this.stagePeak[stage]) this.stagePeak[stage] = ms;
      }
      ran++;
    }
  }

  // Cleared by main.js's resetPerf(). Only the flight-scoped copy — the predictive cap keeps its
  // memory, which is the whole reason there are two arrays.
  resetStagePeak() { this.stagePeak = [0, 0, 0, 0, 0]; return this.stagePeak; }

  step(rec) {
    switch (rec.stage) {
      case 0:                                    // (1) descriptors + collision AABBs
        rec.desc = this.city.generateChunk(rec.cx, rec.cz);
        if (rec.near) rec.aabbs = rec.desc.buildings.map(b => ({
          x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2,
          top: b.h, proto: b.proto, landmark: b.landmark,
        }));
        rec.stage = 1;
        break;
      case 1:                                    // (2) LOD0 matrices and per-instance attributes
        if (rec.near && !rec.l0s.length) this.writeLod0(rec);
        rec.stage = 2;
        break;
      case 2:                                    // LOD1
        if (!rec.l1s.length) this.writeLod1(rec);
        rec.stage = 3;
        break;
      case 3:                                    // (3) signage placement and matrices
        // Its OWN unit, not bolted onto the LOD1 pass. §3.2.3 lists signage as work unit (3) and
        // caps a unit at 1.2 ms; running it with LOD1 measured 1.70 ms worst `ms.gen` against a
        // 1.4 ms gate. The cap has to sit below the budget, not above it (§3.2.3).
        //
        // §3.2 gives LOD1 no signage: past the near ring a sign is a smear the window emissive
        // already provides, so signage is allocated and freed with the chunk's LOD0 slots.
        if (!rec.near || !this.signage || this.signage.writeSigns(rec)) rec.stage = 4;
        break;
      default:                                   // (4) P3a: strips, strobes, antennae, bridges
        if (rec.near && this.signage) this.signage.writeExtras(rec);
        rec.stage = 5;
    }
  }

  prewarm() {
    // The 5x5 near ring is generated at boot behind the loading bar, so the first flight frame is
    // never the first generation frame (§3.2.3).
    const t0 = performance.now();
    let guard = 0;
    // Timed exactly as `pump` times it, so the per-unit estimates the predictive cap depends on
    // are already populated before the first flight frame. Seeded at zero they would let the first
    // release or the first signage unit of the flight run unbounded, which is the same "the first
    // flight frame must not be the first generation frame" rule one level down.
    while ((this.queue.length || this.farQueue.length || this.sgDying.length) && guard++ < 40000) {
      const s0 = performance.now();
      let stage = -1;
      if (this.sgDying.length) {
        stage = -2;
        this.drainDying();
      } else if (this.queue.length) {
        const rec = this.queue[this.queue.length - 1];
        stage = rec.stage;
        this.step(rec);
        if (rec.stage >= 5) this.queue.pop();
      } else {
        this.stepFar(this.farQueue.pop());
      }
      const ms = performance.now() - s0;
      if (stage === -2) this.relMs = Math.max(this.relMs, ms);
      else if (stage < 0) this.farMs = Math.max(this.farMs, ms);
      else if (ms > this.stageMs[stage]) this.stageMs[stage] = ms;
    }
    // §3.2.3 says the first flight frame must never be the first GENERATION frame. It is equally
    // true that it must not be the first EVICTION frame: the release, deferred-drain and
    // re-generation paths are only reached when a chunk boundary is crossed, so on the first
    // crossing they compile, and that showed up as a 2.3 ms `ms.gen` against a 1.4 ms gate while
    // the steady state was 0.7. One synthetic crossing here — a shift east and back, behind the
    // loading bar, with generateChunk memoised so the descriptors are free — compiles all of it.
    const cx0 = this.ccx, cz0 = this.ccz;
    for (const d of [1, -1]) {
      this.ccx = cx0 + d;
      this.retarget();
      let g2 = 0;
      while ((this.queue.length || this.sgDying.length) && g2++ < 40000) {
        if (this.sgDying.length) this.drainDying();
        else { const rec = this.queue[this.queue.length - 1]; this.step(rec); if (rec.stage >= 5) this.queue.pop(); }
      }
    }
    this.ccx = cx0; this.ccz = cz0;

    for (const f of this.lod0) f.flush();
    this.lod1.flush();
    this.lod2.flush();
    this.signage?.flush();
    return +(performance.now() - t0).toFixed(2);
  }

  // ── instance writing ─────────────────────────────────────────────────────

  writeLod0(rec) {
    const { buildings } = rec.desc;
    const ccx = rec.desc.cxWorld, ccz = rec.desc.czWorld;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const fi = this.protoIndex[b.proto] ?? 0;
      const f = this.lod0[fi];
      const idx = rec.l0s.length;
      const slot = f.alloc(rec.l0s, idx);
      if (slot < 0) continue;
      rec.l0f.push(fi); rec.l0s.push(slot);
      this.writeShell(f, slot, b, ccx, ccz);
    }
  }

  writeLod1(rec) {
    const keep = this.city.tallIndices(rec.desc, 0.4);
    const ccx = rec.desc.cxWorld, ccz = rec.desc.czWorld;
    for (const i of keep) {
      const b = rec.desc.buildings[i];
      const idx = rec.l1s.length;
      const slot = this.lod1.alloc(rec.l1s, idx);
      if (slot < 0) break;
      rec.l1s.push(slot);
      this.writeShell(this.lod1, slot, b, ccx, ccz);
    }
  }

  // LOD0 and LOD1 write IDENTICAL per-instance data: same matrix, same atlas cell, same UV pitch
  // (§3.2.2 part 1, and §3.10 #1 — the pitch is never halved at LOD1, whatever an earlier draft
  // of the plan said). The only difference between the two fields is the geometry.
  writeShell(f, slot, b, ccx, ccz) {
    this._p.set(b.x, 0, b.z);
    this._s.set(b.w, b.h, b.d);
    this._m4.compose(this._p, this._q, this._s);
    this._m4.toArray(f.mesh.instanceMatrix.array, slot * 16);

    const o = cellOffset(this.atlas.windows, b.cell % (GRID * GRID));
    f.set('iUvOffset', slot, o[0], o[1]);

    uvScale3(b.w, b.h, b.d, COLS_PER_CELL, ROWS_PER_CELL, this._uv);
    f.set('iUvScale', slot, this._uv[0], this._uv[1], this._uv[2]);

    // P11 §1. `districts.paint()` put six fields on the descriptor; this is the whole cost of
    // reading them. The old ±14 % `b.jitter` is gone from the emissive path — it survives in the
    // descriptor because `hashRegion` mixes it and the golden hash must not move.
    //
    // NOT clamped to 1 any more. The spread is 0.55-1.50 by design: a hot hotel and a half-empty
    // office block at 2 a.m. are not the same value, and clamping the top of the range back to
    // 1.0 would delete exactly the half of the spread that reads as hierarchy. The target is
    // HalfFloat and the value feeds §4.4's bloom, which is where it should show.
    const jA = b.tintA === undefined ? b.jitter : b.tintA;
    const jB = b.tintB === undefined ? b.jitter : b.tintB;
    const t2 = b.tint2 === undefined ? b.tint : b.tint2;
    f.set('iEmissive', slot,
      ((b.tint >> 16) & 255) / 255 * jA,
      ((b.tint >> 8) & 255) / 255 * jA,
      (b.tint & 255) / 255 * jA);
    f.set('iEmissive2', slot,
      ((t2 >> 16) & 255) / 255 * jB,
      ((t2 >> 8) & 255) / 255 * jB,
      (t2 & 255) / 255 * jB);
    // A descriptor with no paint (a fixture, or a landmark part authored before P11) gets a split
    // below the ground and a crown above the roof, which is exactly "one colour, no bands".
    f.set('iZone', slot,
      b.split === undefined ? -1 : b.split,
      b.band0 === undefined ? 0 : b.band0,
      b.band1 === undefined ? 0 : b.band1,
      b.crown === undefined ? 1e6 : b.crown);

    f.set('iSeed', slot, b.seed);
    f.set('iChunk', slot, ccx, ccz);
    f.touch(slot);
  }

  // ── LOD2 ─────────────────────────────────────────────────────────────────
  // Far chunks own slots exactly the way near chunks do, and for the same reason: rebuilding all
  // 72 of them in the frame that crosses a 1024 m boundary is a 3.4 ms spike — measured — and it
  // also makes the whole far skyline blink. Crossing now touches one 9-chunk row.
  //
  // The central 3x3 is excluded, not the "central 4" §3.2 quotes: a far chunk one step away can
  // have its nearest edge 0 m from the camera when the camera sits on a far-chunk boundary, which
  // would put an unlit 10-triangle box in the player's face.
  retargetFar() {
    const R = this.ringFar;
    const want = new Set();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) continue;
        want.add((this.ffx + dx) + ',' + (this.ffz + dz));
      }
    }
    for (const [key, rec] of this.far) {
      if (!want.has(key)) { this.releaseFar(rec); this.far.delete(key); }
    }
    this.farQueue.length = 0;
    for (const key of want) {
      if (this.far.has(key)) continue;
      const [fx, fz] = key.split(',').map(Number);
      const rec = { fx, fz, key, slots: [] };
      this.far.set(key, rec);
      this.farQueue.push(rec);
    }
  }

  releaseFar(rec) {
    for (let i = rec.slots.length - 1; i >= 0; i--) this.lod2.free(rec.slots[i]);
    rec.slots.length = 0;
  }

  stepFar(rec) {
    const f = this.lod2;
    for (const t of this.city.farTowers(rec.fx, rec.fz, 6)) {
      const slot = f.alloc(rec.slots, rec.slots.length);
      if (slot < 0) return;
      rec.slots.push(slot);
      this._p.set(t.x, 0, t.z);
      this._s.set(t.w, t.h, t.d);
      this._m4.compose(this._p, this._q, this._s);
      this._m4.toArray(f.mesh.instanceMatrix.array, slot * 16);
      this._col.setHex(t.tint).convertSRGBToLinear();
      f.set('iTint', slot, this._col.r, this._col.g, this._col.b);
      f.touch(slot);
    }
  }

  // ── queries ──────────────────────────────────────────────────────────────
  // §3.6 / §2.2's collision AABB store. LOD0 chunks only — §3.2 gives LOD1 no collision, and a
  // craft that is 768 m from a building is not about to hit it. Chunk-keyed rather than a
  // spatial hash: the chunk grid IS the spatial hash, and eviction is then free.
  aabbsNear(x, z, r = 32, out = []) {
    out.length = 0;
    const c0 = Math.floor((x - r) / CHUNK), c1 = Math.floor((x + r) / CHUNK);
    const z0 = Math.floor((z - r) / CHUNK), z1 = Math.floor((z + r) / CHUNK);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const rec = this.live.get(cx + ',' + cz);
        if (!rec || !rec.aabbs) continue;
        for (const a of rec.aabbs) {
          if (a.x1 < x - r || a.x0 > x + r || a.z1 < z - r || a.z0 > z + r) continue;
          out.push(a);
        }
      }
    }
    return out;
  }

  // Is a point inside any near-ring building? The spawn gate asks exactly this.
  solidAt(x, y, z, pad = 0) {
    const list = this.aabbsNear(x, z, 8 + pad);
    for (const a of list) {
      if (x >= a.x0 - pad && x <= a.x1 + pad && z >= a.z0 - pad && z <= a.z1 + pad && y <= a.top + pad) return a;
    }
    return null;
  }

  // ── reporting ────────────────────────────────────────────────────────────
  breakdown() {
    const rows = this.lod0.map((f, i) => ({
      field: f.name, draws: f.n ? 1 : 0, instances: f.n, geoTris: f.tris, tris: f.n * f.tris,
      cap: f.cap, overflow: f.overflow,
    }));
    rows.push({ field: 'lod1', draws: this.lod1.n ? 1 : 0, instances: this.lod1.n, geoTris: this.lod1.tris,
      tris: this.lod1.n * this.lod1.tris, cap: this.lod1.cap, overflow: this.lod1.overflow });
    rows.push({ field: 'lod2', draws: this.lod2.n && this.lod2.mesh.visible ? 1 : 0, instances: this.lod2.n,
      geoTris: this.lod2.tris, tris: this.lod2.n * this.lod2.tris, cap: this.lod2.cap, overflow: this.lod2.overflow });
    rows.push({ field: 'ground', draws: 1, instances: 1, geoTris: 2, tris: 2, cap: 1, overflow: 0 });
    if (this.signage) for (const r of this.signage.breakdown().rows) rows.push(r);
    return {
      rows,
      draws: rows.reduce((a, r) => a + r.draws, 0),
      tris: rows.reduce((a, r) => a + r.tris, 0),
      overflow: rows.reduce((a, r) => a + r.overflow, 0),
    };
  }

  state() {
    let lod0 = 0;
    for (const f of this.lod0) lod0 += f.n;
    let aabbs = 0, near = 0, overflow = this.lod1.overflow + this.lod2.overflow;
    for (const f of this.lod0) overflow += f.overflow;
    for (const rec of this.live.values()) if (rec.aabbs) { aabbs += rec.aabbs.length; near++; }
    return {
      chunks: this.live.size, near, queued: this.queue.length + this.farQueue.length,
      farChunks: this.far.size,
      lod0, lod1: this.lod1.n, lod2: this.lod2.mesh.visible ? this.lod2.n : 0,
      aabbs, gen: +this.msGen.toFixed(3),
      ring: [this.ringNear, this.ringMid, this.ringFar], r0: this.R0,
      overflow, fadeHard: this.fadeHard,
      stageMs: this.stageMs.map(v => +v.toFixed(3)),
      stagePeak: this.stagePeak.map(v => +v.toFixed(3)), farMs: +this.farMs.toFixed(3),
      relMs: +this.relMs.toFixed(3), retargetMs: +this.retargetMs.toFixed(3), dying: this.sgDying.length,
      signage: this.signage ? this.signage.state() : null,
    };
  }

  // Gate-only. §3.2.2's fade depends on d / R0, so sweeping R0 at a FIXED camera walks every
  // chunk across the band with zero parallax — which is the only way to measure what the dither
  // is worth without the frame's ordinary motion swamping it.
  setR0(v) { this.R0 = v > 0 ? v : this.Q.ringNearRadius; U.uR0.value = this.R0; return this.R0; }

  setFadeHard(on) { this.fadeHard = !!on; U.uFadeHard.value = this.fadeHard ? 1 : 0; return this.fadeHard; }

  dispose() {
    this.signage?.dispose();
    for (const f of this.lod0) f.dispose();
    this.lod1.dispose(); this.lod2.dispose();
    this.matL0.dispose(); this.matL1.dispose(); this.matL2.dispose();
    this.ground.geometry.dispose();
    this.scene.remove(this.group);
  }
}

export { PROTO_IDS, PROTO_TRAITS };

// §5.5 — traffic, and where the line between a mesh and a smear of light sits.
//
// ── the one idea ───────────────────────────────────────────────────────────
//
// There is ONE population. A craft is not spawned as a streak and re-spawned as a mesh when it
// gets close; every craft in the world is a streak, and the nearest handful are ALSO drawn as real
// geometry. §5.5's 220 m line is therefore a REPRESENTATION SWAP, not a lifecycle event: nothing
// is created or destroyed at the boundary, so nothing can pop into existence there, and the mesh
// budget can be exceeded without a craft vanishing — the overflow simply stays a streak.
//
// ── why the positions are analytic, and what that buys ─────────────────────
//
// A craft's world position is a pure function of (WORLD_SEED, index, time, camera position). No
// integration, no spawn table, no per-frame state — so "traffic is deterministic from the seed"
// is not a claim about a simulation being reproducible, it is arithmetic. Two page loads at the
// same sim time produce bit-identical traffic, which is what `__game.trafficHash()` proves and
// what tools/gates_p5.mjs asserts against a DIFFERENT seed to show the hash can move at all.
//
// The field is periodic: `W_TILE` metres along a lane and `NC * CORR` across it. The tile is
// snapped to the camera, so the traffic that exists is always the traffic near the player, and
// because the snap moves in whole periods the wrap happens at the tile EDGE — 1,024 m along and
// 819 m across, both past `fogFar` in every variant. A wrap you can see is a wrap in the wrong
// place, not a reason to abandon the scheme.
//
// ── §3.10 #2, which is the reason the lanes exist at all ───────────────────
//
// "Fourteen lanes at fixed altitudes — 30, 55, 85, 120, 160, 210, 270 m, two directions each.
// Craft on them are a known 6 m long. Seven stacked lanes between the street and a tower's
// midpoint says 'that is a 500 m building' without a word." The altitudes are a SCALE CUE and are
// not tunable for a local aesthetic win.
//
// ── DECISIONS decision 6 — police ──────────────────────────────────────────
//
// `patrol` is a traffic type with a different light rig and nothing else. It has no steering, no
// awareness of the player, no heat, no pursuit. The only force in this file that is a function of
// the player's position is the §5.5 YIELD, and it points strictly AWAY. gates_p5 proves that by
// flipping a debug `pursue` flag and showing the same assertion fails.

import * as THREE from 'three';
import { patch, patchFog } from './materials.js';
import { CRAFT_DEFS, BODY_TINTS, TRIM_TINTS, TRIM_RUNS } from './craft.js';
import { hash2i, clamp, smoothstep } from './utils.js';

// §3.10 #2's altitudes, and the geometry of the road grid they hang off. `CORR` is four §3.1 lots
// — the road canyons are on a 51.2 m lattice, so a lane centred on a multiple of 51.2 is centred
// on a road and not on a building.
const ALT = [30, 55, 85, 120, 160, 210, 270];
const LOT = 51.2;
const CORR = LOT * 4;            // 204.8 m between corridors of one lane family
const NC = 8;                    // corridors per cross tile
const CT = NC * CORR;            // 1638.4 m — the cross period, +/- 819 m of the camera
const W_TILE = 2048;             // the along period, +/- 1024 m of the camera
const LANE_SEP = 3.4;            // the two directions of one altitude, side by side in one canyon

// Lower lanes carry more traffic: the canyon shots are the ones the plates are made of, and a
// 270 m lane is three pixels of glow. Normalised at build time, so the totals still add to
// `Q.trafficFar`.
const ALT_WEIGHT = [1.5, 1.35, 1.2, 1.0, 0.85, 0.62, 0.48];

const NEAR_LINE = 220;           // §5.5's line
const NEAR_MAX = 260;            // mesh hysteresis — a craft keeps its mesh a little past the line
const STREAK_IN = 190, STREAK_OUT = 250;   // the crossfade band for a PROMOTED craft's streak

// §5.5's yield. "up to 12 m/s² of lateral acceleration away from the player inside 25 m."
const YIELD_R = 25, YIELD_ACC = 12, YIELD_SPRING = 2.2, YIELD_DAMP = 2.6, YIELD_MAX = 9;

const TYPES = [
  { id: 'taxi_ai', w: 0.60 },
  { id: 'hauler_ai', w: 0.32 },
  { id: 'patrol', w: 0.08 },     // §5.2's "lower spawn weight", and nothing else differs
];

const WARM = 0xffb45a, COOL = 0x9fd8ff;

// ── the streak field's material (§5.5) ─────────────────────────────────────
//
// One stretched additive quad per craft. It is built in VIEW space from the instance's position
// and its lane direction, so it is always broadside to the camera AND correctly foreshortened:
// a craft flying straight at you must not draw a 30 m streak across the frame, and `fs` — the
// fraction of the direction that survives projection — is what stops it.

const STREAK_DECL = /* glsl */`
attribute vec3 iCol;
attribute float iInt;
attribute vec3 iDir;
attribute vec2 iSize;
varying vec3 vCol;
varying float vI;
varying vec2 vQ;
`;

const STREAK_BEGIN = /* glsl */`
#include <begin_vertex>
  vCol = iCol; vI = iInt; vQ = position.xy;
`;

// mvPosition, not a local name: fog_vertex reads it for vFogDepth.
const STREAK_PROJECT = /* glsl */`
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  vec3 dv = ( modelViewMatrix * vec4( iDir, 0.0 ) ).xyz;
  float dl = length( dv.xy );
  float fs = dl / max( length( dv ), 1e-4 );
  vec2 d2 = dl > 1e-4 ? dv.xy / dl : vec2( 1.0, 0.0 );
  vec2 p2 = vec2( -d2.y, d2.x );
  mvPosition.xy += position.x * iSize.x * fs * d2 + position.y * iSize.y * p2;
  gl_Position = projectionMatrix * mvPosition;
`;

const STREAK_FRAG = /* glsl */`
  float ax = abs( vQ.x ) * 2.0, ay = abs( vQ.y ) * 2.0;
  float fall = ( 1.0 - ax * ax ) * exp( -ay * ay * 3.0 );
  fall = max( fall, 0.0 );
  diffuseColor.rgb = vCol * vI * fall;
  diffuseColor.a = fall;
`;

function streakMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true, toneMapped: false,
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = patch(sh.vertexShader, '#include <common>',
      '#include <common>' + STREAK_DECL, 'streak/vert-decl');
    sh.vertexShader = patch(sh.vertexShader, '#include <begin_vertex>',
      STREAK_BEGIN, 'streak/vert-begin');
    sh.vertexShader = patch(sh.vertexShader, '#include <project_vertex>',
      STREAK_PROJECT, 'streak/project');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vCol;\nvarying float vI;\nvarying vec2 vQ;', 'streak/frag-decl');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <map_fragment>',
      STREAK_FRAG, 'streak/frag-body');
  };
  m.userData.patches = ['streak'];
  m.customProgramCacheKey = () => 'MeshBasicMaterial|streak';
  patchFog(m, 'additive');
  return m;
}

// ── the lanes ──────────────────────────────────────────────────────────────

function buildLanes(seed) {
  const lanes = [];
  for (let i = 0; i < 14; i++) {
    const a = i >> 1;
    lanes.push({
      i,
      alt: ALT[a],
      dir: (i & 1) ? 1 : -1,
      axis: a & 1,                                  // 0 — runs along X · 1 — runs along Z
      phase: (hash2i(a, 7, seed ^ 0x2f11) % 4) * LOT,
      weight: ALT_WEIGHT[a],
      n: 0, first: 0, nAlong: 1,
    });
  }
  return lanes;
}

const CAP_STREAK = 1024;

export class Traffic {
  constructor(scene, Q, seed, cityR = null) {
    this.Q = Q;
    this.seed = seed | 0;
    this.cityR = cityR;
    this.lanes = buildLanes(this.seed);
    this.pursue = false;          // gates_p5's falsification switch — see the header
    this.avoid = true;
    this.yieldOn = true;
    this.on = true;

    this.mat = streakMaterial();
    this.geo = new THREE.PlaneGeometry(1, 1);
    for (const [n, size] of [['iCol', 3], ['iInt', 1], ['iDir', 3], ['iSize', 2]]) {
      const ba = new THREE.InstancedBufferAttribute(new Float32Array(CAP_STREAK * size), size);
      ba.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(n, ba);
    }
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, CAP_STREAK);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    // The instance matrix is a pure translation for every streak — the quad is built in the
    // vertex shader — so the scale block is written once at boot and never again. Three floats
    // per craft per frame instead of sixteen.
    const im = this.mesh.instanceMatrix.array;
    for (let i = 0; i < CAP_STREAK; i++) { im[i * 16] = 1; im[i * 16 + 5] = 1; im[i * 16 + 10] = 1; im[i * 16 + 15] = 1; }

    // Per-craft constants, all derived from (seed, index) and never written again.
    this.N = 0;
    this.tSpeed = new Float32Array(CAP_STREAK);
    this.tType = new Uint8Array(CAP_STREAK);
    this.tLane = new Uint8Array(CAP_STREAK);
    this.tU = new Float32Array(CAP_STREAK);
    this.tYJit = new Float32Array(CAP_STREAK);
    // Aaron's variety note, as three bytes per craft: a near-black body hue, a trim neon, and a
    // trim RUN (one of which is "none"). Derived from the seed like everything else, so a fleet is
    // reproducible and no two adjacent craft are guaranteed to match.
    this.tBody = new Uint8Array(CAP_STREAK);
    this.tTrim = new Uint8Array(CAP_STREAK);
    this.tRun = new Uint8Array(CAP_STREAK);
    // Live state — and the ONLY state in this file. Two offsets per craft, both springs to zero.
    this.offC = new Float32Array(CAP_STREAK);
    this.offV = new Float32Array(CAP_STREAK);
    this.offY = new Float32Array(CAP_STREAK);
    this.offYV = new Float32Array(CAP_STREAK);

    // Scratch, reused: no allocation in the frame path.
    this.px = new Float32Array(CAP_STREAK);
    this.py = new Float32Array(CAP_STREAK);
    this.pz = new Float32Array(CAP_STREAK);
    this.pd = new Float32Array(CAP_STREAK);
    this.cand = new Int32Array(128);
    this.nearIdx = new Int32Array(64);
    this.nearN = 0;
    this._col = new THREE.Color();
    this._pose = { def: null, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
      throttle: 0.55, brake: false, boost: false, t: 0,
      tint: undefined, trim: undefined, run: undefined };

    this.stats = { streaks: 0, meshes: 0, patrol: 0, patrolNear: Infinity, yields: 0, avoided: 0 };
    this.msSim = 0;
    this.applyQuality(Q);
  }

  // §2.5 — the caps come from the preset. The buffers are sized from HIGH unconditionally (they
  // are 30 KB), so a live quality switch is a count change and not a reallocation.
  applyQuality(Q) {
    this.Q = Q;
    const total = Math.min(CAP_STREAK, Q.trafficFar);
    const wsum = this.lanes.reduce((a, l) => a + l.weight, 0);
    let at = 0;
    for (const l of this.lanes) {
      l.n = Math.max(2, Math.floor(total * l.weight / wsum));
      l.first = at;
      l.nAlong = Math.max(1, Math.ceil(l.n / NC));
      at += l.n;
    }
    this.N = Math.min(CAP_STREAK, at);
    this._derive();
    return this.N;
  }

  // Every per-craft constant, from (seed, lane, slot) and nothing else.
  _derive() {
    let pick = 0;
    for (const l of this.lanes) {
      for (let j = 0; j < l.n; j++) {
        const gi = l.first + j;
        if (gi >= this.N) break;
        const h = hash2i(l.i, j, this.seed ^ 0x71c3);
        const h2 = hash2i(j, l.i, this.seed ^ 0x19af);
        const k = j % NC, m = (j / NC) | 0;
        const jitter = ((h & 0xffff) / 65535 - 0.5) * 0.8;
        this.tU[gi] = (m + 0.5 + jitter) / l.nAlong;
        this.tLane[gi] = l.i;
        this.tSpeed[gi] = 20 + ((h >>> 16) / 65536) * 26;
        this.tYJit[gi] = (((h2 >>> 8) & 0xffff) / 65535 - 0.5) * 2.4;
        const u = (h2 & 0xffff) / 65536;
        let acc = 0, ty = 0;
        for (let ti = 0; ti < TYPES.length; ti++) { acc += TYPES[ti].w; if (u < acc) { ty = ti; break; } ty = ti; }
        this.tType[gi] = ty;
        const h3 = hash2i(l.i * 31 + j, this.seed & 0xffff, 0x3d17);
        this.tBody[gi] = h3 % BODY_TINTS.length;
        this.tTrim[gi] = (h3 >>> 5) % TRIM_TINTS.length;
        // Weighted, so "no trim" is a fifth of the fleet rather than a sixth of the table.
        {
          let u2 = ((h3 >>> 11) & 0xffff) / 65536, acc2 = 0, r = TRIM_RUNS.length - 1;
          for (let ri = 0; ri < TRIM_RUNS.length; ri++) { acc2 += TRIM_RUNS[ri].w; if (u2 < acc2) { r = ri; break; } }
          this.tRun[gi] = r;
        }
        // `k` is the corridor slot; kept out of a second array because it is j % NC everywhere.
        void k; pick++;
      }
    }
    this.stats.patrol = 0;
    for (let i = 0; i < this.N; i++) if (TYPES[this.tType[i]].id === 'patrol') this.stats.patrol++;
    this._writeStatic();
    return pick;
  }

  // Everything about a streak that does not change: its colour (warm one way, cool the other — the
  // two ribbons in `746850_03`), its lane direction and its length. Written on build and on a
  // quality change, never in the frame.
  _writeStatic() {
    const A = this.geo.attributes;
    const col = A.iCol.array, dir = A.iDir.array, size = A.iSize.array;
    for (let i = 0; i < this.N; i++) {
      const l = this.laneOf(i);
      dir[i * 3] = l.axis === 0 ? l.dir : 0;
      dir[i * 3 + 1] = 0;
      dir[i * 3 + 2] = l.axis === 0 ? 0 : l.dir;
      size[i * 2] = 5 + this.tSpeed[i] * 0.52;      // §5.5's "length proportional to speed"
      size[i * 2 + 1] = 1.15;
      const c = this._col.setHex(l.dir > 0 ? WARM : COOL).convertSRGBToLinear();
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    A.iCol.needsUpdate = true; A.iDir.needsUpdate = true; A.iSize.needsUpdate = true;
  }

  laneOf(i) { return this.lanes[this.tLane[i]]; }
  corridorOf(i) { return (i - this.lanes[this.tLane[i]].first) % NC; }

  // ── the analytic position (§5.5) ─────────────────────────────────────────
  // Pure. No frame state is read and none is written. `out` gets [x, y, z, dx, dy, dz].
  posOf(i, t, camX, camZ, out) {
    const l = this.laneOf(i);
    const along0 = l.axis === 0 ? camX : camZ;
    const cross0 = l.axis === 0 ? camZ : camX;
    const s = (((this.tU[i] * W_TILE + l.dir * this.tSpeed[i] * t) % W_TILE) + W_TILE) % W_TILE;
    const tileA = Math.round(along0 / W_TILE) * W_TILE - W_TILE / 2;
    const tileC = Math.round((cross0 - l.phase) / CT) * CT - CT / 2;
    const along = tileA + s;
    const cross = tileC + l.phase + this.corridorOf(i) * CORR + l.dir * LANE_SEP;
    if (l.axis === 0) {
      out[0] = along; out[2] = cross; out[3] = l.dir; out[5] = 0;
    } else {
      out[2] = along; out[0] = cross; out[3] = 0; out[5] = l.dir;
    }
    out[1] = l.alt + this.tYJit[i];
    out[4] = 0;
    return out;
  }

  // The mesh yaw for a lane direction. Forward is -Z (craft.js), matching flight.lookDir.
  yawOf(i) {
    const l = this.laneOf(i);
    if (l.axis === 0) return l.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    return l.dir > 0 ? Math.PI : 0;
  }

  // ── the frame ────────────────────────────────────────────────────────────

  update(dt, t, cam, fields, player) {
    if (!this.on) { this.mesh.count = 0; this.stats.streaks = 0; this.stats.meshes = 0; return; }
    const t0 = performance.now();
    const cx = cam.x, cy = cam.y, cz = cam.z;
    const N = this.N;
    const p = [0, 0, 0, 0, 0, 0];
    const px = this.px, py = this.py, pz = this.pz, pd = this.pd;

    // 1. every craft's analytic position, and its distance to the eye.
    for (let i = 0; i < N; i++) {
      this.posOf(i, t, cx, cz, p);
      px[i] = p[0]; py[i] = p[1]; pz[i] = p[2];
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
      pd[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // 2. the near set: the closest `Q.trafficNear` inside NEAR_MAX. A partial selection, not a
    //    sort of the whole population — the candidate list is a couple of dozen entries.
    let nc = 0;
    for (let i = 0; i < N && nc < this.cand.length; i++) if (pd[i] < NEAR_MAX) this.cand[nc++] = i;
    const want = Math.min(this.Q.trafficNear, this.nearIdx.length, nc);
    // selection sort over `want` — 26 passes of ~40, and it leaves `cand` in a useful order.
    for (let a = 0; a < want; a++) {
      let best = a;
      for (let b = a + 1; b < nc; b++) if (pd[this.cand[b]] < pd[this.cand[best]]) best = b;
      const sw = this.cand[a]; this.cand[a] = this.cand[best]; this.cand[best] = sw;
      this.nearIdx[a] = this.cand[a];
    }
    this.nearN = want;

    // 3. the near craft: yield, facade avoidance, and a real mesh each.
    this.stats.meshes = 0; this.stats.yields = 0; this.stats.avoided = 0;
    this.stats.patrolNear = Infinity;
    const pose = this._pose;
    for (let a = 0; a < want; a++) {
      const i = this.nearIdx[a];
      const l = this.laneOf(i);
      let ox = 0, oy = 0;
      if (player) {
        ox = this._yield(i, l, dt, px[i], py[i], pz[i], player);
        oy = this.offY[i];
      }
      // The lateral offset is applied ACROSS the lane, never along it — traffic never speeds up
      // or slows down for the player, because a lane whose speed is a function of the player is a
      // lane the player can herd.
      let wx = px[i], wy = py[i] + oy, wz = pz[i];
      if (l.axis === 0) wz += ox; else wx += ox;
      if (this.avoid && this.cityR) {
        const hit = this.cityR.solidAt(wx, wy, wz, 3.0);
        if (hit) {
          // Straight up and out of the facade. A craft clipping a tower is the one traffic defect
          // that reads instantly, and 26 point tests is the whole cost.
          const push = Math.min(14, (hit.top + 4.5) - wy);
          if (push > 0) wy += push;
          this.stats.avoided++;
        }
      }
      const def = CRAFT_DEFS[TYPES[this.tType[i]].id];
      pose.def = def;
      pose.x = wx; pose.y = wy; pose.z = wz;
      pose.yaw = this.yawOf(i);
      pose.pitch = 0;
      pose.roll = clamp(-ox * 0.02, -0.28, 0.28);   // a lean into the avoidance, decoration only
      pose.throttle = 0.30 + 0.5 * (this.tSpeed[i] / 46);
      pose.t = t;
      // `patrol` keeps its own def colours (§5.3: the police hull stays black, and its trim has to
      // be recognisable); every civilian craft takes its own from the seeded palettes.
      if (def.police) { pose.tint = undefined; pose.trim = undefined; pose.run = undefined; }
      else {
        pose.tint = BODY_TINTS[this.tBody[i]];
        pose.trim = TRIM_TINTS[this.tTrim[i]];
        pose.run = this.tRun[i];
      }
      if (fields) fields.write(pose);
      this.stats.meshes++;
      if (def.police) this.stats.patrolNear = Math.min(this.stats.patrolNear, pd[i]);
    }

    // 4. every craft as a streak. Colour, direction and length are CONSTANTS of the craft and were
    //    written once by `_writeStatic`; the frame path touches three floats of translation and
    //    one intensity, which is §5.5's "one matrix write loop per frame" taken literally.
    const im = this.mesh.instanceMatrix.array;
    const A = this.geo.attributes;
    const inten = A.iInt.array;
    for (let i = 0; i < N; i++) {
      const o = i * 16;
      im[o + 12] = px[i]; im[o + 13] = py[i]; im[o + 14] = pz[i];
      inten[i] = 1.35;
    }
    // Promoted craft: their streak fades out as the mesh takes over. A second pass over 26 indices
    // rather than an `isPromoted` test inside the 900-craft loop.
    for (let a = 0; a < want; a++) {
      const i = this.nearIdx[a];
      inten[i] = 1.35 * smoothstep((pd[i] - STREAK_IN) / (STREAK_OUT - STREAK_IN));
    }
    this.mesh.count = N;
    this.mesh.instanceMatrix.needsUpdate = true;
    A.iInt.needsUpdate = true;
    this.stats.streaks = N;
    this.msSim = performance.now() - t0;
  }

  // §5.5's yield, and the ONLY line in this file that reads the player's position.
  //
  // The sign is asserted, not assumed: `dirn` is the component of (craft - player) across the
  // lane, and the acceleration is `+YIELD_ACC * sign(dirn)`, so it can only ever grow the gap.
  // `this.pursue` flips that sign and exists solely so gates_p5 can show the assertion failing —
  // a test that cannot fail is not a test (and there is no code path that sets it in the game).
  _yield(i, l, dt, x, y, z, player) {
    const dx = x - player.x, dz = z - player.z, dy = y - player.y;
    const across = l.axis === 0 ? dz : dx;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let acc = 0, accY = 0;
    if (this.yieldOn && d < YIELD_R && d > 1e-3) {
      const k = 1 - d / YIELD_R;
      const s = this.pursue ? -1 : 1;
      acc = s * YIELD_ACC * k * (across >= 0 ? 1 : -1);
      accY = s * YIELD_ACC * 0.45 * k * (dy >= 0 ? 1 : -1);
      this.stats.yields++;
    }
    // spring back to the lane, always
    acc += -YIELD_SPRING * this.offC[i] - YIELD_DAMP * this.offV[i];
    accY += -YIELD_SPRING * this.offY[i] - YIELD_DAMP * this.offYV[i];
    this.offV[i] = clamp(this.offV[i] + acc * dt, -YIELD_MAX, YIELD_MAX);
    this.offYV[i] = clamp(this.offYV[i] + accY * dt, -YIELD_MAX, YIELD_MAX);
    this.offC[i] = clamp(this.offC[i] + this.offV[i] * dt, -18, 18);
    this.offY[i] = clamp(this.offY[i] + this.offYV[i] * dt, -12, 12);
    return this.offC[i];
  }

  setVisible(on) { this.mesh.visible = !!on; return this.mesh.visible; }
  setEnabled(on) { this.on = !!on; this.mesh.visible = !!on; return this.on; }

  // An order-independent hash of the whole live population, straight off the GPU buffers plus the
  // analytic positions. Order-independent so a change to how the array is walked can never look
  // like a change to the traffic.
  hash(t, camX, camZ) {
    const p = [0, 0, 0, 0, 0, 0];
    const keys = [];
    for (let i = 0; i < this.N; i++) {
      this.posOf(i, t, camX, camZ, p);
      keys.push(`${TYPES[this.tType[i]].id}|${Math.round(p[0] * 64)},${Math.round(p[1] * 64)},${Math.round(p[2] * 64)}`
        + `|${p[3]},${p[5]}|${Math.round(this.tSpeed[i] * 256)}|${this.tBody[i]},${this.tTrim[i]},${this.tRun[i]}`);
    }
    keys.sort();
    let h = 0x811c9dc5 >>> 0;
    for (const s of keys) for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
    return { n: this.N, hash: ('00000000' + h.toString(16)).slice(-8) };
  }

  // The NEAR set only, written into caller-owned scratch — no allocation, no strings, no toFixed.
  // §8.6's minimap rear arc runs at 15 Hz and only ever wants near traffic; calling `list()` for
  // that walks the whole 892-craft population and builds 892 objects a frame, which measured at
  // 0.9 ms of the minimap's 1.28 ms. `list()` stays exactly as it is for the gates, where the
  // whole population and the derived fields are the point.
  nearList(t, cam, out = []) {
    const p = [0, 0, 0, 0, 0, 0];
    out.length = 0;
    for (let a = 0; a < this.nearN; a++) {
      const i = this.nearIdx[a];
      this.posOf(i, t, cam.x, cam.z, p);
      const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
      out.push({ i, x: p[0], y: p[1], z: p[2], dx: p[3], dz: p[5],
        d: Math.sqrt(dx * dx + dy * dy + dz * dz) });
    }
    return out;
  }

  // Every live craft, for the gates. `patrol` rows carry the distance so a soak can assert
  // decision 6 without re-deriving the lane arithmetic.
  list(t, cam, limit = 0) {
    const p = [0, 0, 0, 0, 0, 0];
    const out = [];
    for (let i = 0; i < this.N; i++) {
      this.posOf(i, t, cam.x, cam.z, p);
      const l = this.laneOf(i);
      const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
      out.push({
        i, type: TYPES[this.tType[i]].id, lane: l.i, alt: l.alt, dir: l.dir, axis: l.axis,
        body: BODY_TINTS[this.tBody[i]], trim: TRIM_TINTS[this.tTrim[i]], run: this.tRun[i],
      x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: +p[2].toFixed(2),
        dx: p[3], dz: p[5], speed: +this.tSpeed[i].toFixed(2),
        d: +Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(2),
        offC: +this.offC[i].toFixed(3), offY: +this.offY[i].toFixed(3),
        near: this.nearIdx.slice(0, this.nearN).includes(i),
      });
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  // The variety, as a count rather than an impression: how many distinct body colours, trim
  // colours and trim runs are live, and what share of the fleet carries no trim at all.
  palette() {
    const body = new Array(BODY_TINTS.length).fill(0);
    const trim = new Array(TRIM_TINTS.length).fill(0);
    const run = new Array(TRIM_RUNS.length).fill(0);
    let police = 0;
    for (let i = 0; i < this.N; i++) {
      if (TYPES[this.tType[i]].id === 'patrol') { police++; continue; }
      body[this.tBody[i]]++; trim[this.tTrim[i]]++; run[this.tRun[i]]++;
    }
    const civil = this.N - police;
    return {
      n: this.N, civil, police, body, trim, run,
      bodyDistinct: body.filter(v => v > 0).length,
      trimDistinct: trim.filter(v => v > 0).length,
      runDistinct: run.filter(v => v > 0).length,
      noTrim: run[TRIM_RUNS.findIndex(r => r.amt === 0)] || 0,
      noTrimFrac: civil ? +((run[TRIM_RUNS.findIndex(r => r.amt === 0)] || 0) / civil).toFixed(3) : 0,
    };
  }

  breakdown() {
    return {
      rows: [{ field: 'streaks', draws: this.mesh.count && this.mesh.visible ? 1 : 0,
        instances: this.mesh.count, geoTris: 2, tris: this.mesh.count * 2, cap: CAP_STREAK }],
      draws: this.mesh.count && this.mesh.visible ? 1 : 0,
      tris: this.mesh.count * 2,
    };
  }

  state() {
    return {
      on: this.on, n: this.N, near: this.nearN, streaks: this.mesh.count,
      lanes: this.lanes.length, alts: ALT, nearLine: NEAR_LINE,
      meshes: this.stats.meshes, patrol: this.stats.patrol,
      patrolNear: Number.isFinite(this.stats.patrolNear) ? +this.stats.patrolNear.toFixed(2) : null,
      yields: this.stats.yields, avoided: this.stats.avoided,
      ms: +this.msSim.toFixed(3), pursue: this.pursue, yieldOn: this.yieldOn, avoid: this.avoid,
    };
  }

  dispose() {
    this.geo.dispose(); this.mat.dispose(); this.mesh.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

export { ALT, CORR, NC, CT, W_TILE, NEAR_LINE, TYPES };

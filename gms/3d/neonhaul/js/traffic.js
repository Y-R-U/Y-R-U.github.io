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
//
// S2-F MOVED THESE TO `js/lanes.js` and changed none of them. The autopilot routes along the same
// lattice this file fills with traffic, and two copies of a lattice is exactly the sort of pair
// that agrees for four phases and then does not. They are re-exported at the bottom of this file,
// so every existing `import { ALT } from './traffic.js'` still resolves.
import { ALT, LOT, CORR, NC, CT, W_TILE, LANE_SEP, lanePhase,
  R_LANE, R_NC, R_CT, roadPhase, R_SPEED, R_SLOTS, R_YIELD_AXIS, R_HOLD, R_HOLD_W,
  R_HOLD_BASE, roadSlotBase, roadXings } from './lanes.js';

// Lower lanes carry more traffic: the canyon shots are the ones the plates are made of, and a
// 270 m lane is three pixels of glow. Normalised at build time, so the totals still add to
// `Q.trafficFar`.
const ALT_WEIGHT = [1.5, 1.35, 1.2, 1.0, 0.85, 0.62, 0.48];

const NEAR_LINE = 220;           // §5.5's line
const NEAR_MAX = 260;            // mesh hysteresis — a craft keeps its mesh a little past the line
const STREAK_IN = 190, STREAK_OUT = 250;   // the crossfade band for a PROMOTED craft's streak

// §5.5's yield. "up to 12 m/s² of lateral acceleration away from the player inside 25 m."
const YIELD_R = 25, YIELD_ACC = 12, YIELD_SPRING = 2.2, YIELD_DAMP = 2.6, YIELD_MAX = 9;

// ── S2-R — the lateral clearance steer ─────────────────────────────────────
//
// Aaron, on the shipped build: *"cars are now flying through buildings? … they should be flying
// between buildings"*, and of the street population: *"we cannot have trains going next to
// buildings or into the edge of a building. They need to go on the black … either by reversing if
// needed or indeed turning"*. One primitive answers both, because both are the same defect — an
// analytic lane that knows nothing about the city it runs through.
//
// ── why the shipped avoidance could not have worked ────────────────────────
//
// It pushed an intersecting craft STRAIGHT UP by `min(14, top + 4.5 - y)`. Fourteen metres. The
// masses that actually sit on a lane are 160-450 m tall, so the push lifted a craft from 55 m to
// 69 m and left it ninety to four hundred metres inside the tower — while incrementing
// `stats.avoided`. Measured on the shipped build before any of this: SIX of the twenty-six
// mesh-drawn craft were inside a mass, and ALL SIX were still inside after the push ran. A cap
// that silently turns a correction into a no-op is the same failure as a gate that cannot go red,
// and it is why `trapped` below is counted rather than assumed away.
//
// ── what it does instead ───────────────────────────────────────────────────
//
// A lane runs down a street; a mass that intrudes on one hardly ever spans it. So the clearance is
// SIDEWAYS, not up: find the near edge of the offending box and offset across the lane by just
// enough to pass it. Climbing survives only for what climbing is for — a low podium, where a hop
// over the roof reads correctly — and is bounded by a height a craft could plausibly hop.
//
// Three properties are load-bearing, and each is a bug not made:
//
//   1. IT MUST NOT SNAP. The taps sample the lane from 14 m behind the hull to 26 m ahead and
//      weight each by where it sits in that window, so the offset ramps in over the two seconds
//      before the wall and ramps out behind it. A steer evaluated only at the craft's own position
//      is a 6 m teleport at the corner, twice.
//   2. IT MUST STAY A PURE FUNCTION OF POSITION. Every term is read from the world position and
//      the city's boxes; nothing integrates, nothing remembers the previous frame. `posOf` is
//      still the definition of where a craft is and `hash()` still re-derives it, so the
//      determinism gate keeps meaning what it says. This is a RENDER-TIME displacement against
//      streamed geometry — which is exactly why it is deliberately OUTSIDE the hash, and why
//      `roadList` must not report it as though it were the analytic position.
//   3. A CORRIDOR IT CANNOT CLEAR HAS TO SAY SO. When a mass needs more than the budget the offset
//      is REFUSED, never clamped to something that still intersects. `stats.trapped` counts every
//      one, so "the steer handles it" is a number in a gate rather than a hope.
// The kernel taps exist for ONE job — to ramp the offset in before the obstruction and out after
// it, so the manoeuvre is a lane change and not a teleport. They are a fixed ladder in metres, and
// a fixed ladder cannot know how long the hull using it is. Two measured failures came from asking
// them to:
//
//   * a 32 m haulier's NOSE is 16 m ahead of its centre, so with the plateau starting at 14 m the
//     manoeuvre was still at 0.875 weight when the nose reached the wall;
//   * a 22 m tram's TAIL is 11 m behind its centre, so with the plateau ending at -8 the offset
//     had already begun decaying while the tail was still alongside the corner — measured at 0.149
//     of the 0.9 m it needed, still grazing.
//
// So the hull's own two ends are sampled EXPLICITLY, at full weight, in addition to the ladder.
// The ladder shapes the approach; the two hull taps are what actually guarantee that no part of
// this particular vehicle is in the mass. A ladder alone is a sampling rate, and a sampling rate
// is not a guarantee.
const STEER_TAPS = [-24, -12, 4, 16, 28, 40];
const STEER_W = STEER_TAPS.map(v => Math.max(0,
  v > 28 ? 1 - (v - 28) / 18 : v < -12 ? 1 - (-12 - v) / 16 : 1));
// The budget, sized from the city rather than from a round number. A SEEDED mass reaches at most
// 8.36 m past the street centreline (tools/probe_enc.mjs, measured over 4,132 footprints), and a
// lane sits LANE_SEP = 3.4 m off that centreline, so clearing the worst seeded encroachment from
// the lane it actually blocks costs 8.36 - 3.4 + hull half + 0.5 ~= 7.1 m. Nine is that plus
// headroom; much more would push a craft over the far kerb and into the block opposite, which the
// post-steer re-test would then have to catch as `trapped` — a wider budget is not a safer one.
let STEER_AIR = 9.0;
// The STREET's budget was 5.4 — half a 13.2 m carriageway, less the widest hull. That number
// described a road that no longer exists: S2-R deleted the carriageway along with the markings
// (materials.js ROAD_BODY), and Aaron's brief is that the transports *"need to go on the black"*,
// which is now the whole deck. So the only real constraint is not driving into the block opposite,
// and that is enforced by measurement — `_clearOffset` re-tests the side it chooses — rather than
// by a budget small enough to guarantee it.
let STEER_ROAD = 11.0;
// As far as the near ring streams collision boxes. `solidAt` answers null past it whatever this
// says, so the number is a cost guard and not a policy — 520 was leaving a bus grazing a corner at
// 544 m, which is exactly the sort of edge a round number invents.
const R_STEER_MAX_D = 620;
// The ALONG margin every tap is softened over: how far ahead of a mass a tap starts to feel it, in
// metres. It is what turns each tap's contribution from a step into a ramp — see _clearOffset.
const SOFT = 7.0;
// A podium is worth hopping; a tower is not, and pretending otherwise is what the 14 m cap did.
let CLIMB_MAX = 26;

// S2-C. Aaron, having flown it: "The cars/vehicles have little variation from what I can see …
// some different height/length vehicles? Maybe 2 or 3 other shapes as well". This table WAS two
// civilian silhouettes for the whole city — the seeded colour variety at `_derive` below landed
// last pass and was painting two shapes. Five now, spread deliberately across proportion rather
// than across size: 2.2 m of length per metre of width on the van, 5.6 on the limo.
const TYPES = [
  { id: 'taxi_ai', w: 0.32 },
  { id: 'hauler_ai', w: 0.18 },
  { id: 'pod_ai', w: 0.17 },
  { id: 'limo_ai', w: 0.11 },
  { id: 'van_ai', w: 0.14 },
  { id: 'patrol', w: 0.08 },     // §5.2's "lower spawn weight", and nothing else differs
];

// The road transports, which travel the STREETS and not the lanes. Aaron: "for now I just want a
// few longer vehicles that could represent buses/trams/long transports - but traveling on the
// roads". They are a second analytic population in this file rather than a module of their own,
// because they share the streak field, the craft fields and the tiling arithmetic — which is what
// keeps §3.8's five-draw vehicle layer at five draws.
const ROAD_TYPES = [
  { id: 'bus_road', w: 0.52 },
  { id: 'tram_road', w: 0.30 },
  { id: 'haul_road', w: 0.18 },
];

// The six edge-light modes of craft.js's `iVar.z`, and how much of the fleet carries each. Aaron:
// "i mention possible lights highlighting some edges that could be varied per vehicle". Mode 0 is
// the shipped shoulder run, so the fleet still contains what it contained; the rest are new.
//   0 shoulder · 1 shoulder + spine · 2 keel (underglow) · 3 spine · 4 shoulder + keel · 5 keel + spine
const EDGE_W = [0.30, 0.16, 0.18, 0.12, 0.16, 0.08];
const PULSE_FRAC = 0.22;         // how much of the fleet carries a travelling bead on its trim

const WARM = 0xffb45a, COOL = 0x9fd8ff;
// Street level reads differently from the lanes on purpose: headlights one way, tail lamps the
// other, so a canyon shot has two colours of street traffic under seven altitudes of lane traffic.
const R_HEAD = 0xfff0d0, R_TAIL = 0xff5a3a;

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
      phase: lanePhase(a, seed),
      weight: ALT_WEIGHT[a],
      n: 0, first: 0, nAlong: 1,
    });
  }
  return lanes;
}

// ── the road population's own geometry ─────────────────────────────────────
//
// The streets are the gaps city.js leaves between its lots: `LOT` 51.2 m pitch, a 13.2 m
// carriageway, and materials.js's ROAD_BODY paints the dashed centreline at exactly a multiple of
// 51.2 (uRoad.x). A road corridor is therefore `CORR` — four lots, the same pitch the flying
// lanes use, chosen there for the same reason — and R_LANE puts a vehicle on the correct side of
// the centreline it is driving beside. Get R_LANE wrong and the buses drive down the paint.
// S2-N MOVED `R_LANE`, `R_NC`, `R_CT` and the family phase to `js/lanes.js`, unchanged, for the
// same reason S2-F moved the flying lattice: `js/tunnels.js` has to put a tunnel mouth on exactly
// the line a bus drives down, and a second copy of that arithmetic is a pair that agrees until it
// does not. Two corridors per cross tile rather than the flying field's eight — the road
// population is a tenth the size, and spreading it over eight would put a bus every kilometre.
const R_NL = 8;                  // road lanes: four corridor families x two directions
const R_NEAR = 200;              // road vehicles promote later than the flying 220 m line
const R_NEAR_MAX = 240;
// How far up the priority street a crosser still counts as "coming". Under about 40 m nothing ever
// qualifies: the crossing constant in lanes.js keeps the pair LOT metres apart in F ∓ G, so a
// priority vehicle sitting on the junction at the moment this one arrives is arithmetically
// impossible. 80 m catches the ones that are a couple of seconds out.
const R_YIELD_R = 80;

function buildRoadLanes(seed) {
  const lanes = [];
  for (let i = 0; i < R_NL; i++) {
    const a = i >> 1;
    const axis = a & 1, phase = roadPhase(a, seed);
    lanes.push({
      i, dir: (i & 1) ? 1 : -1, axis, phase,
      slotBase: roadSlotBase(axis, phase),
      n: 0, first: 0, nAlong: 1,
    });
  }
  return lanes;
}

const CAP_STREAK = 1024;
// The road population's ceiling. It shares CAP_STREAK with the flying one, so the live count is
// whichever of this and the remaining streak slots is smaller — see applyQuality.
const CAP_ROAD = 96;

// gates_steer's falsification levers, and they are OVERRIDES rather than settings: nothing in the
// frame writes them back, so the game loop cannot undo a gate's fixture — CLAUDE.md's rule, and
// the one that `setZones`/`setSignVisible`/`setShopForce` each had to learn.
//
// Zeroing the lateral budget is how the CLIMB branch is proved to exist at all. On the shipped
// city it never fires — every seeded crossing is solved sideways and every landmark crossing is
// refused — so without this it would be an untested branch that a reader has to take on trust,
// which is precisely the kind of code this project has been bitten by.
export function setSteerBudget(air, road, climb) {
  if (air !== undefined && air !== null) STEER_AIR = +air;
  if (road !== undefined && road !== null) STEER_ROAD = +road;
  if (climb !== undefined && climb !== null) CLIMB_MAX = +climb;
  return { air: STEER_AIR, road: STEER_ROAD, climb: CLIMB_MAX };
}

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
    // S2-C's fourth and fifth bytes: WHICH edge this craft lights, and whether the light travels.
    this.tEdge = new Uint8Array(CAP_STREAK);
    this.tPulse = new Float32Array(CAP_STREAK);
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
      tint: undefined, trim: undefined, run: undefined, edge: 0, pulse: 0 };

    // ── the road population ────────────────────────────────────────────────
    // Its own arrays, its own lanes, its own near set. It shares the streak InstancedMesh (its
    // instances sit at [N, N + rN)), the craft fields, and nothing else — so every existing gate
    // that walks the flying population keeps measuring exactly what it measured before.
    this.rLanes = buildRoadLanes(this.seed);
    // Where a yielding vehicle meets cross traffic, per direction. Derived once: it is a property
    // of the seed's four road phases and nothing else.
    this.rXing = { '-1': roadXings(this.seed, -1), 1: roadXings(this.seed, 1) };
    // gates_road's two falsification switches. `roadVariety` puts the per-vehicle speed spread
    // back (see `_deriveRoad`); `holdScale` multiplies the give-way, and past 1 it spends more
    // than the LOT-metre crossing margin lanes.js proves — which is how the sweep is shown able to
    // find the CROSSING case Aaron described and not only the rear-end one.
    this.roadVariety = false;
    this.holdScale = 1;
    this.rN = 0;
    this.rType = new Uint8Array(CAP_ROAD);
    this.rLane = new Uint8Array(CAP_ROAD);
    this.rU = new Float32Array(CAP_ROAD);
    this.rSpeed = new Float32Array(CAP_ROAD);
    this.rBody = new Uint8Array(CAP_ROAD);
    this.rTrim = new Uint8Array(CAP_ROAD);
    this.rEdge = new Uint8Array(CAP_ROAD);
    this.rx = new Float32Array(CAP_ROAD);
    this.ry = new Float32Array(CAP_ROAD);
    this.rz = new Float32Array(CAP_ROAD);
    this.rd = new Float32Array(CAP_ROAD);
    this.rCand = new Int32Array(CAP_ROAD);
    // S2-N. Set by main.js once js/tunnels.js exists. Null is the SHIPPED-BEFORE behaviour and
    // not a degraded one: with no tunnel layer every road vehicle falls back to the centre-point
    // `solidAt` suppression this file has always used.
    this.tunnels = null;
    // Per-vehicle, rewritten every frame by `_updateRoad`: 1 while the transport is entirely
    // between a bore's two portals. The STREAK loop reads it too — a bus inside a tunnel must not
    // leave a headlight smear on the outside of the wall.
    this.rHid = new Uint8Array(CAP_ROAD);
    // Which road vehicles actually got a mesh written THIS frame. `near` is "in the promotion
    // set"; this is "geometry was submitted", and the difference between the two is exactly what
    // a gate asserting "you cannot see it inside the building" has to read.
    this.rDrawn = new Uint8Array(CAP_ROAD);
    // S2-R. The lateral offset actually applied to this vehicle this frame. Frame state, exactly
    // like rHid — `roadList` reports it only when reading the LIVE clock, for the reason spelled
    // out there.
    this.rOff = new Float32Array(CAP_ROAD);
    this.rNearIdx = new Int32Array(16);
    this.rNearN = 0;
    // S2-R. Where each promoted FLYING craft was actually drawn, after the yield, the steer and
    // any climb — i.e. the pose that went to the GPU, not the analytic position `list()` reports.
    // Without this a gate asking "is a craft inside a building" can only read `posOf`, which is
    // the position BEFORE the thing under test ran, and would score a working steer as broken.
    // Fixed-size and rewritten in place: 26 entries, no per-frame allocation.
    this.drawN = 0;
    this.drawI = new Int32Array(64);
    this.drawX = new Float32Array(64);
    this.drawY = new Float32Array(64);
    this.drawZ = new Float32Array(64);
    this.drawOff = new Float32Array(64);
    this.drawFlag = new Uint8Array(64);   // 1 steered · 2 climbed · 4 trapped (not drawn)
    this._aabbs = [];                    // _clearOffset's scratch — reused, never allocated per tap

    this.stats = { streaks: 0, meshes: 0, patrol: 0, patrolNear: Infinity, yields: 0, avoided: 0,
      road: 0, roadMeshes: 0, roadHidden: 0,
      // S2-R. `steered` is how many took a lateral offset, `climbed` how many hopped a low mass
      // anyway, and `trapped` how many the steer could NOT clear and were therefore not drawn.
      // `trapped` is the one that matters: it is the residue the feature does not handle, and a
      // gate reads it rather than inferring from a screenshot that everything is fine.
      steered: 0, climbed: 0, trapped: 0, trappedLm: 0, avoidedPartial: 0, roadSteered: 0 };
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
    // Road transports are a few LONG vehicles, not a second fleet: they scale off the same preset
    // number so LOW gets proportionally fewer, and they never take a streak slot the flying
    // population wanted. A shipped preset lands at 89 (HIGH) and 32 (LOW).
    const wantRoad = Math.max(8, Math.round(Q.trafficFar * 0.10));
    const budget = Math.max(0, Math.min(CAP_ROAD, wantRoad, CAP_STREAK - this.N));
    let ra = 0;
    for (const l of this.rLanes) {
      l.n = Math.max(2, Math.floor(budget / R_NL));
      l.first = ra;
      l.nAlong = Math.max(1, Math.ceil(l.n / R_NC));
      ra += l.n;
    }
    this.rN = Math.min(CAP_ROAD, CAP_STREAK - this.N, ra);
    // Six near road meshes at HIGH, three at LOW. They are big — a 32 m transport is three times
    // the length of anything in the flying set — so a handful is what "a few longer vehicles"
    // asked for, and they compete with the 26 flying meshes for the 56 body slots.
    this.roadNear = Math.max(2, Math.round(Q.trafficNear * 0.24));
    this._derive();
    this._deriveRoad();
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
        // S2-C — which EDGE carries the light, and whether it travels. A fourth seeded byte from
        // its own hash, so adding it does not shift the colours the last pass already produced
        // for a given (lane, slot): a rehash of h3 would have repainted the whole fleet.
        {
          const h4 = hash2i(j * 17 + l.i, this.seed ^ 0x6d4f, 0x51ab);
          const h5 = hash2i(l.i * 7 + j, this.seed ^ 0x0b3d, 0x27e5);
          let u3 = (h4 & 0xffff) / 65536, acc3 = 0, e = 0;
          for (let ei = 0; ei < EDGE_W.length; ei++) { acc3 += EDGE_W[ei]; if (u3 < acc3) { e = ei; break; } e = ei; }
          this.tEdge[gi] = e;
          // `h5 >>> 16` is SIXTEEN bits, so u is uniform over [0, 1). The first cut wrote
          // `(h4 >>> 17) & 0xffff` — fifteen bits over a 65536 divisor, i.e. uniform over [0, 0.5)
          // — which doubled every threshold taken against it and put a pulse on 43 % of the fleet
          // instead of 22 %. gates_s2c B1 caught it, which is the only reason it is a comment and
          // not a shipped defect: a wrong-range hash produces a perfectly plausible-looking fleet.
          const up = (h5 >>> 16) / 65536;
          this.tPulse[gi] = up < PULSE_FRAC ? 0.35 + (h5 & 0xff) / 255 * 0.55 : 0;
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

  // The road population's constants, same shape and same discipline: a pure function of
  // (seed, lane, slot), written once, never touched in the frame.
  _deriveRoad() {
    for (const l of this.rLanes) {
      for (let j = 0; j < l.n; j++) {
        const gi = l.first + j;
        if (gi >= this.rN) break;
        const h = hash2i(l.i, j, this.seed ^ 0x1e77);
        const h2 = hash2i(j, l.i, this.seed ^ 0x40c9);
        const m = (j / R_NC) | 0;
        // The along lattice. `m` is the slot index within this vehicle's own travel line, and the
        // seeded `step` (coprime with R_SLOTS, so the map is injective while nAlong <= R_SLOTS,
        // which CAP_ROAD/R_NL/R_NC = 6 guarantees) is what stops the line reading as a conveyor of
        // evenly spaced vehicles. lanes.js's header has why the offset is `slotBase`.
        const hs = hash2i(l.i * 5 + ((gi - l.first) % R_NC), 91, this.seed ^ 0x63b1);
        const slot = (m * [1, 3, 7, 9][hs % 4] + ((hs >>> 8) % R_SLOTS)) % R_SLOTS;
        this.rU[gi] = (l.slotBase + slot * CORR) / W_TILE;
        this.rLane[gi] = l.i;
        // ONE speed for the whole street population — see the block in lanes.js. This WAS
        // `8 + u * 9`, and that 2x spread is the whole of Aaron's rear-end defect: two vehicles on
        // one line at different speeds close on each other and there is no following behaviour to
        // stop them. The variety it carried has moved to the yield, which is per-junction.
        this.rSpeed[gi] = this.roadVariety ? 8 + ((h >>> 16) / 65536) * 9 : R_SPEED;
        let u = (h2 & 0xffff) / 65536, acc = 0, ty = 0;
        for (let ti = 0; ti < ROAD_TYPES.length; ti++) { acc += ROAD_TYPES[ti].w; if (u < acc) { ty = ti; break; } ty = ti; }
        this.rType[gi] = ty;
        this.rBody[gi] = (h2 >>> 7) % BODY_TINTS.length;
        this.rTrim[gi] = (h2 >>> 13) % TRIM_TINTS.length;
        // Road forms have no spine channel — it carries the window band — so their edge modes are
        // limited to the ones that use the shoulder and keel: 0, 2 and 4.
        this.rEdge[gi] = [0, 2, 4][(h >>> 8) % 3];
      }
    }
    this.stats.road = this.rN;
    this._writeStaticRoad();
    return this.rN;
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

  // The road population's streaks live at [N, N + rN) of the SAME instanced mesh, which is what
  // keeps the whole vehicle layer at five draws. Shorter than a flying streak because they are
  // slower, and a different pair of colours because a street is not a lane.
  _writeStaticRoad() {
    const A = this.geo.attributes;
    const col = A.iCol.array, dir = A.iDir.array, size = A.iSize.array;
    for (let i = 0; i < this.rN; i++) {
      const s = this.N + i;
      const l = this.rLaneOf(i);
      dir[s * 3] = l.axis === 0 ? l.dir : 0;
      dir[s * 3 + 1] = 0;
      dir[s * 3 + 2] = l.axis === 0 ? 0 : l.dir;
      // Length, not speed. A flying streak is "length proportional to speed" (§5.5) because the
      // flying fleet still HAS a speed spread; the street population no longer does, and a fleet
      // of identical 7.1 m smears throws away the one silhouette cue the road types carry. A
      // 32 m haulier now smears further than a 12 m bus, which is what it looked like before.
      size[s * 2] = 3.2 + CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id].L * 0.16;
      size[s * 2 + 1] = 0.95;
      const c = this._col.setHex(l.dir > 0 ? R_HEAD : R_TAIL).convertSRGBToLinear();
      col[s * 3] = c.r; col[s * 3 + 1] = c.g; col[s * 3 + 2] = c.b;
    }
    A.iCol.needsUpdate = true; A.iDir.needsUpdate = true; A.iSize.needsUpdate = true;
  }

  laneOf(i) { return this.lanes[this.tLane[i]]; }
  corridorOf(i) { return (i - this.lanes[this.tLane[i]].first) % NC; }
  rLaneOf(i) { return this.rLanes[this.rLane[i]]; }
  rCorridorOf(i) { return (i - this.rLanes[this.rLane[i]].first) % R_NC; }
  // The physical length of road vehicle `i`. js/tunnels.js drives its doors off it — a 32 m
  // haulier has to hold a doorway open more than twice as long as a 12 m bus, and that difference
  // is the whole reason the door is not on a timer.
  roadLength(i) { return CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id].L; }
  // Its half WIDTH, which is what decides whether a corner grazes it. Read from the same def table
  // as the length rather than from a literal, so a new road hull cannot be half-registered.
  roadHalfWidth(i) { return CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id].W * 0.5; }

  // The road position, on exactly the same tiling arithmetic as posOf and for the same reason:
  // it is a pure function of (seed, index, time, camera), so street traffic is as deterministic
  // as lane traffic and `hash()` covers both.
  //
  // `y` is the vehicle's own half-height above a flat deck — the ground plane in this game is
  // y = 0 everywhere (render_city.js's `ground`), so a road vehicle needs no terrain query.
  roadPosOf(i, t, camX, camZ, out) {
    const l = this.rLaneOf(i);
    const along0 = l.axis === 0 ? camX : camZ;
    const cross0 = l.axis === 0 ? camZ : camX;
    const a = this.rU[i] * W_TILE + l.dir * this.rSpeed[i] * t;
    const lag = this.roadLag(i, l.dir * a, camX, camZ);
    const s = (((a - l.dir * lag) % W_TILE) + W_TILE) % W_TILE;
    const tileA = Math.round(along0 / W_TILE) * W_TILE - W_TILE / 2;
    const tileC = Math.round((cross0 - l.phase) / R_CT) * R_CT - R_CT / 2;
    const along = tileA + s;
    const cross = tileC + l.phase + this.rCorridorOf(i) * CORR + l.dir * R_LANE;
    if (l.axis === 0) { out[0] = along; out[2] = cross; out[3] = l.dir; out[5] = 0; }
    else { out[2] = along; out[0] = cross; out[3] = 0; out[5] = l.dir; }
    out[1] = CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id].H * 0.5;
    out[4] = 0;
    return out;
  }

  // ── the give-way ─────────────────────────────────────────────────────────
  //
  // How far behind its free-running position vehicle `i` is, in metres, given its progress `q`
  // (= dir * along, so it always increases). Zero on the priority axis.
  //
  // This is a HOLD, not a decision: it is a pure function of the vehicle's own progress, so it
  // costs no state, cannot depend on how long the page has been open, and is bit-identical across
  // page loads — which is the property `trafficHash` and gates_p5 exist to protect. It is bounded
  // by R_HOLD because the crossing proof in lanes.js is only worth `LOT` metres of margin and a
  // pair of hauliers already eats 35 of it.
  //
  // The profile is a smoothstep down into the stop line and a longer smoothstep back out, and the
  // two meet at exactly `gap` so consecutive junctions are contiguous with no seam. Both ends have
  // zero slope, so the amplitude may change from one junction to the next without the vehicle
  // jumping — which is what lets `roadYield` answer differently at each one.
  roadLag(i, q, camX, camZ) {
    const l = this.rLaneOf(i);
    if (l.axis !== R_YIELD_AXIS) return 0;
    const cs = this.rXing[l.dir];
    // Half a hull, half a carriageway, and a nose-to-kerb margin: where the vehicle stops.
    const clear = CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id].L * 0.5 + R_LANE + 4.1;
    for (let k = 0; k < cs.length; k++) {
      const gap = k + 1 < cs.length ? cs[k + 1] - cs[k] : CORR - cs[k] + cs[0];
      const base = (((cs[k] - clear + R_HOLD * 0.5) % CORR) + CORR) % CORR;
      const x = ((((q - base + CORR * 0.5) % CORR) + CORR) % CORR) - CORR * 0.5;
      if (x < -R_HOLD_W * 0.5 || x > gap - R_HOLD_W * 0.5) continue;
      const amp = this.roadYield(i, q - x + clear - R_HOLD * 0.5, camX, camZ) * this.holdScale;
      return x <= R_HOLD_W * 0.5
        ? amp * R_HOLD * smoothstep((x + R_HOLD_W * 0.5) / R_HOLD_W)
        : amp * R_HOLD * (1 - smoothstep((x - R_HOLD_W * 0.5) / (gap - R_HOLD_W)));
    }
    return 0;
  }

  // How hard vehicle `i` yields at the junction whose progress coordinate is `qc`: a full stop if
  // a priority vehicle is genuinely closing on that junction when this one would reach it, and
  // R_HOLD_BASE otherwise. Constant across the whole hold, because `qc` is.
  //
  // Be clear about what this is worth: the lattice has ALREADY made the collision impossible, so
  // a real closing crosser turns up at about 1.4 % of junction passes and the base ease is what
  // is on screen almost all the time. The test is here so that when a bus does stop dead there is
  // something crossing in front of it.
  roadYield(i, qc, camX, camZ) {
    const l = this.rLaneOf(i);
    const tArr = (qc - l.dir * this.rU[i] * W_TILE) / this.rSpeed[i];
    const tileAx = Math.round(camX / W_TILE) * W_TILE - W_TILE / 2;
    const tileAz = Math.round(camZ / W_TILE) * W_TILE - W_TILE / 2;
    const cross0 = l.axis === 0 ? camZ : camX;
    // Where this vehicle will be across the priority axis, and which junction line it is at.
    const mine = (Math.round((cross0 - l.phase) / R_CT) * R_CT - R_CT / 2)
      + l.phase + this.rCorridorOf(i) * CORR + l.dir * R_LANE;
    const jn = (l.axis === 0 ? tileAx : tileAz)
      + (((((l.dir * qc) % W_TILE) + W_TILE) % W_TILE));
    for (let p = 0; p < this.rN; p++) {
      const pl = this.rLaneOf(p);
      if (pl.axis === l.axis) continue;
      const line = (Math.round(((pl.axis === 0 ? camZ : camX) - pl.phase) / R_CT) * R_CT - R_CT / 2)
        + pl.phase + this.rCorridorOf(p) * CORR + pl.dir * R_LANE;
      if (Math.abs(line - jn) > R_LANE * 1.5) continue;
      const half = CRAFT_DEFS[ROAD_TYPES[this.rType[p]].id].L * 0.5;
      const at = (pl.axis === 0 ? tileAx : tileAz)
        + ((((this.rU[p] * W_TILE + pl.dir * this.rSpeed[p] * tArr) % W_TILE) + W_TILE) % W_TILE);
      const closing = (mine - at) * pl.dir;          // + = still short of the junction
      if (closing > -half && closing < R_YIELD_R + half) return 1;
    }
    return R_HOLD_BASE;
  }

  // The heading correction for a steered transport: atan of how fast its offset is changing along
  // the lane. Zero for the unsteered, which is every vehicle on a clear street.
  _roadSteerYaw(i) {
    const off = this.rOff[i];
    if (!off || !this.cityR) return 0;
    const l = this.rLaneOf(i);
    const LOOK = 8;
    // Re-evaluated from the UNSTEERED position 8 m on, so the two samples are on the same curve.
    const bx = l.axis === 0 ? this.rx[i] + l.dir * LOOK : this.rx[i] - off;
    const bz = l.axis === 0 ? this.rz[i] - off : this.rz[i] + l.dir * LOOK;
    const ahead = this._clearOffset(l.axis, bx, this.ry[i], bz, this.roadHalfWidth(i), STEER_ROAD,
      this.roadLength(i) * 0.5);
    const slope = (ahead - off) / LOOK;
    // ── the sign, derived rather than guessed ────────────────────────────────
    //
    // `roadYawOf` encodes a model whose nose is local -Z: at axis 1 / dir +1 it returns PI, and
    // rotating (0,-1) by PI gives (0,+1), which is the +Z the vehicle is travelling. Under this
    // file's rotation convention the nose is (-sin(yaw), -cos(yaw)), so d(nose)/d(yaw) is
    // (-cos(yaw), +sin(yaw)) — and evaluating that at each of the four (axis, dir) headings gives
    // the factor below. It is the OPPOSITE of the first draft's, which turned every weaving
    // transport away from the gap it was steering into.
    //
    //   axis 1, dir +1  yaw PI     d(nose)/dyaw = (+1, 0)  ->  +yaw turns toward +x  ->  + slope
    //   axis 1, dir -1  yaw 0      d(nose)/dyaw = (-1, 0)  ->  -slope
    //   axis 0, dir +1  yaw -PI/2  d(nose)/dyaw = (0, -1)  ->  -slope
    //   axis 0, dir -1  yaw +PI/2  d(nose)/dyaw = (0, +1)  ->  +slope
    //
    // 0.30 rad is about as far as a 32 m haulier can be turned before the hull reads as skidding
    // rather than steering.
    return clamp(Math.atan(slope) * (l.axis === 0 ? -l.dir : l.dir), -0.30, 0.30);
  }

  roadYawOf(i) {
    const l = this.rLaneOf(i);
    if (l.axis === 0) return l.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    return l.dir > 0 ? Math.PI : 0;
  }

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
    this.stats.steered = 0; this.stats.climbed = 0; this.stats.trapped = 0;
    this.stats.trappedLm = 0; this.stats.avoidedPartial = 0;
    this.drawN = 0;
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
      const def = CRAFT_DEFS[TYPES[this.tType[i]].id];
      // S2-R. Sideways first, then a hop, then — for the mass that is neither — nothing drawn at
      // all. See the STEER_TAPS header for why the old vertical push could not work.
      let steer = 0;
      if (this.avoid && this.cityR) {
        const half = def.W * 0.5 + 0.8;
        steer = this._clearOffset(l.axis, wx, wy, wz, half, STEER_AIR, def.L * 0.5);
        if (steer) { if (l.axis === 0) wz += steer; else wx += steer; this.stats.steered++; }
        // Re-test AFTER the offset, because the offset is what has to be shown to work. A steer
        // that reports success without this line is the fourteen-metre push again.
        const hit = this.cityR.solidAt(wx, wy, wz, half);
        if (hit) {
          this.stats.avoided++;
          const climb = (hit.top + 6) - wy;
          if (climb <= CLIMB_MAX) { wy += climb; this.stats.climbed++; }
          else if (this._fullyInside(l.axis, wx, wy, wz, half, def.L * 0.5)) {
            // A mass this craft cannot get round or over, and it is now entirely inside one. It is
            // drawn NOTHING rather than drawn inside the wall: its streak stays in the buffer and
            // is depth-tested, so it is behind the facade and invisible, and the mesh — the half
            // that pokes out of the far face and reads instantly — is simply not submitted.
            // `mesh.count` and the hash are untouched either way.
            //
            // Split by CAUSE, because the two have different answers and lumping them hides that.
            // A seeded mass is at most 38 m across and a lateral steer should have cleared it —
            // one landing here is a budget that is too small, i.e. a bug. A LANDMARK is 80-120 m
            // across and up to 470 m tall; no lateral offset inside a street's width clears one,
            // and no climb that keeps §3.10 #2's altitudes does either. So `trappedLm` is the
            // known, bounded residue and `trapped - trappedLm` is the part that has to be zero.
            this.stats.trapped++;
            if (hit.landmark) this.stats.trappedLm++;
            this._recordDraw(i, wx, wy, wz, steer, 4);
            continue;
          } else {
            // Touching the mass, not yet swallowed by it. Withholding HERE is a pop: the hull is
            // 6-9 m long and its centre reaches the facade with three or four metres still out in
            // the open, so the craft would blink out with its tail plainly outside the wall.
            // Drawn instead — the facade writes depth, so the part inside is occluded and the part
            // outside is exactly what should still be on screen. Same argument js/tunnels.js makes
            // about a bore's two portal planes, and for the same reason: a wall is a better cutter
            // than a flag.
            this.stats.avoidedPartial++;
          }
        }
      }
      pose.def = def;
      pose.x = wx; pose.y = wy; pose.z = wz;
      pose.yaw = this.yawOf(i);
      pose.pitch = 0;
      pose.roll = clamp(-(ox + steer) * 0.02, -0.28, 0.28);   // a lean into yield AND weave, decoration only
      pose.throttle = 0.30 + 0.5 * (this.tSpeed[i] / 46);
      pose.t = t;
      // `patrol` keeps its own def colours (§5.3: the police hull stays black, and its trim has to
      // be recognisable); every civilian craft takes its own from the seeded palettes.
      if (def.police) {
        pose.tint = undefined; pose.trim = undefined; pose.run = undefined;
        pose.edge = 0; pose.pulse = 0;
      } else {
        pose.tint = BODY_TINTS[this.tBody[i]];
        pose.trim = TRIM_TINTS[this.tTrim[i]];
        pose.run = this.tRun[i];
        pose.edge = this.tEdge[i];
        pose.pulse = this.tPulse[i];
      }
      if (fields) fields.write(pose);
      this._recordDraw(i, wx, wy, wz, steer, (steer ? 1 : 0) | (wy !== py[i] + oy ? 2 : 0));
      this.stats.meshes++;
      if (def.police) this.stats.patrolNear = Math.min(this.stats.patrolNear, pd[i]);
    }

    // 3b. the road population. Positions, a near set, and a mesh for the closest handful. No
    //     yield and no facade avoidance: a bus on a street is not going to dodge the player, and
    //     the streets are the gaps city.js left between its lots, so there is nothing to hit.
    this._updateRoad(t, cx, cy, cz, fields);

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
    // 5. the road streaks, in the same buffer at [N, N + rN). Dimmer than a lane streak: a
    //    headlight at street level is under the whole city and should not out-shine a lane.
    for (let i = 0; i < this.rN; i++) {
      const o = (N + i) * 16;
      im[o + 12] = this.rx[i]; im[o + 13] = this.ry[i]; im[o + 14] = this.rz[i];
      // S2-N. A streak is additive and depth-TESTED, so a wall already hides one — but a bore's
      // own portal panel is only 5.5 m wide and the streak is up to 9 m long, so a transport a
      // metre inside a short tunnel could still smear past the jamb. Zero, not dimmed: it is in a
      // tunnel, and the instance stays in the buffer so `mesh.count` and the hash do not move.
      inten[N + i] = this.rHid[i] ? 0 : 0.95;
    }
    for (let a = 0; a < this.rNearN; a++) {
      const i = this.rNearIdx[a];
      if (this.rHid[i]) continue;
      inten[N + i] = 0.95 * smoothstep((this.rd[i] - (R_NEAR - 30)) / 30);
    }
    this.mesh.count = N + this.rN;
    this.mesh.instanceMatrix.needsUpdate = true;
    A.iInt.needsUpdate = true;
    this.stats.streaks = N;
    this.msSim = performance.now() - t0;
  }

  // The road population's frame. Same three steps as the flying one minus the two forces: the
  // positions, the closest few, a mesh each.
  _updateRoad(t, cx, cy, cz, fields) {
    this.stats.roadMeshes = 0;
    this.rNearN = 0;
    this.rDrawn.fill(0);
    if (!this.rN) return;
    const p = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.rN; i++) {
      this.roadPosOf(i, t, cx, cz, p);
      this.rx[i] = p[0]; this.ry[i] = p[1]; this.rz[i] = p[2];
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
      this.rd[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    // ── S2-R — the street steer ──────────────────────────────────────────────
    //
    // Applied to the STORED position, so the mesh, the streak, the suppression test and
    // `roadList`'s live reading all see one number instead of four that agree until they do not.
    // It runs BEFORE `_roadHidden` for that reason: a vehicle that has just steered clear of a
    // corner must not then be suppressed for being inside it.
    //
    // The one place it must NOT fire is a dressed crossing. There the wall already has a mouth on
    // the exact line this vehicle drives, and a steer would put it into the jamb — so `spanAt`'s
    // default 40 m margin is used as-is, which holds the vehicle straight through the approach as
    // well as through the bore itself. That is the same margin the doors lead on.
    this.stats.roadSteered = 0;
    if (this.avoid && this.cityR) {
      for (let i = 0; i < this.rN; i++) {
        this.rOff[i] = 0;
        // The near RING, not the promotion ring. A streak is depth-TESTED so a wall hides the part
        // of it that is inside — but the part still outside a corner keeps drawing, and at 350-550 m
        // that was the whole of the residue the first pass left behind. `solidAt` cannot answer
        // past the streamed ring anyway, so this is the real edge of what is knowable rather than
        // a number chosen for cost. Measured at 520 m: no change to any figure in budget.mjs.
        if (this.rd[i] > R_STEER_MAX_D) continue;
        const l = this.rLaneOf(i);
        const cross = l.axis === 0 ? this.rz[i] : this.rx[i];
        const along = l.axis === 0 ? this.rx[i] : this.rz[i];
        // The bore suppression is a RAMP, not a switch. Cutting the offset to zero the instant
        // spanAt starts answering was a 1.6 m sideways step in a thirtieth of a second — the
        // largest single discontinuity gates_steer S5 found, and it came from the one place the
        // steer is supposed to politely get out of the way. Queried 22 m wider than the window it
        // has to respect, and faded across that margin.
        let boreW = 1;
        if (this.tunnels) {
          const sp = this.tunnels.spanAt(l.axis, cross, along, 62);
          if (sp) {
            const d = along < sp.a0 ? sp.a0 - along : along > sp.a1 ? along - sp.a1 : 0;
            boreW = clamp((d - 40) / 22, 0, 1);
          }
        }
        if (boreW <= 0) continue;
        const off = this._clearOffset(l.axis, this.rx[i], this.ry[i], this.rz[i],
          this.roadHalfWidth(i), STEER_ROAD, this.roadLength(i) * 0.5) * boreW;
        if (!off) continue;
        // ── AND THE RESULT HAS TO BE BETTER THAN THE START ────────────────────
        //
        // The offset clears the mass the taps found. It says nothing about what is on the side it
        // moves toward, and on a street narrowed from both sides it can walk a bus straight out of
        // one mass and into the one opposite. gates_tunnel T7 caught exactly that — one transport
        // suppressed while its ANALYTIC position stood in open air, because the suppression was
        // reading the steered position and the steer had put it somewhere worse.
        //
        // The air path has re-tested since it was written, for the same reason its predecessor
        // failed: a correction that reports success without checking is the fourteen-metre push.
        // The street path now does too, and REFUSES rather than half-applying — a vehicle held on
        // its lane is a vehicle the existing centre-point suppression already knows how to handle.
        const half = this.roadHalfWidth(i);
        const nx = l.axis === 0 ? this.rx[i] : this.rx[i] + off;
        const nz = l.axis === 0 ? this.rz[i] + off : this.rz[i];
        if (this._fullyInside(l.axis, nx, this.ry[i], nz, half, 0)
          && !this._fullyInside(l.axis, this.rx[i], this.ry[i], this.rz[i], half, 0)) continue;
        this.rOff[i] = off;
        this.rx[i] = nx; this.rz[i] = nz;
        this.stats.roadSteered++;
      }
    } else this.rOff.fill(0);

    // S2-N. Whether each transport is INSIDE a tunnel, decided once here and read by both the
    // mesh loop below and the streak loop in `update`. See `_roadHidden`.
    this.stats.roadHidden = 0;
    for (let i = 0; i < this.rN; i++) {
      this.rHid[i] = this._roadHidden(i) ? 1 : 0;
      this.stats.roadHidden += this.rHid[i];
    }
    let nc = 0;
    for (let i = 0; i < this.rN && nc < this.rCand.length; i++) if (this.rd[i] < R_NEAR_MAX) this.rCand[nc++] = i;
    const want = Math.min(this.roadNear, this.rNearIdx.length, nc);
    for (let a = 0; a < want; a++) {
      let best = a;
      for (let b = a + 1; b < nc; b++) if (this.rd[this.rCand[b]] < this.rd[this.rCand[best]]) best = b;
      const sw = this.rCand[a]; this.rCand[a] = this.rCand[best]; this.rCand[best] = sw;
      this.rNearIdx[a] = this.rCand[a];
    }
    this.rNearN = want;
    if (!fields) return;
    const pose = this._pose;
    for (let a = 0; a < want; a++) {
      const i = this.rNearIdx[a];
      const def = CRAFT_DEFS[ROAD_TYPES[this.rType[i]].id];
      // A landmark podium or a dock skirt can sit over a street the generator thought was clear.
      // A 32 m transport half-buried in a plinth is the one road defect that reads instantly, so
      // it simply does not get a mesh — its streak stays, and it is underneath a building anyway.
      //
      // `solidAt` returns null for an UNGENERATED chunk, which is indistinguishable from open air
      // — the gotcha that once concluded a defect did not exist across 242 pads. Here that null
      // means "draw the transport", which is the safe direction, and it cannot bite: R_NEAR_MAX is
      // 240 m and the near ring streams to 512 m, so every road vehicle that reaches this line is
      // standing on a live chunk.
      //
      // S2-N moved the decision itself into `_roadHidden`, because at a DRESSED crossing this
      // centre-point test is exactly the defect: it cut a 32 m haulier in half at the wall and
      // popped the remaining half out of existence. Where there is a bore, the mouth and the wall
      // do the cutting and the mesh survives until the whole vehicle is inside.
      if (this.rHid[i]) continue;
      pose.def = def;
      pose.x = this.rx[i]; pose.y = this.ry[i]; pose.z = this.rz[i];
      // S2-R. Aaron asked for the transports to turn rather than slide, so a steered vehicle is
      // yawed by the SLOPE of its own offset — sampled 8 m further down the lane, which is the
      // derivative the taps already imply. Only steered vehicles pay for the second evaluation,
      // and on a normal frame that is none of them.
      pose.yaw = this.roadYawOf(i) + this._roadSteerYaw(i);
      pose.pitch = 0; pose.roll = 0;
      pose.throttle = 0;              // no plume: `nac` is 0 on a road def, so there is nothing to light
      pose.t = t;
      pose.tint = BODY_TINTS[this.rBody[i]];
      pose.trim = TRIM_TINTS[this.rTrim[i]];
      pose.run = 0;
      pose.edge = this.rEdge[i];
      pose.pulse = 0;
      if (fields.write(pose)) { this.stats.roadMeshes++; this.rDrawn[i] = 1; }
    }
  }

  // ── S2-N — is this transport inside a building, and does that building have a bore? ──────
  //
  // Two rules, and which one applies is decided by whether `js/tunnels.js` actually dressed this
  // crossing. That is the invariant the whole feature rests on: **hide only where a portal
  // exists**, or a bus disappears in open air, which is a worse defect than the one being fixed.
  //
  //   a bore   hidden only when the vehicle is ENTIRELY between the two portal planes. It is
  //            already invisible by then — the far wall and the near portal panel are opaque and
  //            write depth, so at the instant this flips the vehicle is behind both of them. That
  //            is what makes it a fade-free swap rather than a pop, and it is why the test is on
  //            the ENDS of the hull (`along -/+ L/2`) and not on its centre.
  //   no bore  the shipped centre-point `solidAt` suppression, unchanged, so a corridor that
  //            clips a corner or runs under a landmark plinth behaves exactly as it always has.
  _roadHidden(i) {
    const t = this.tunnels;
    if (t) {
      const l = this.rLaneOf(i);
      const cross = l.axis === 0 ? this.rz[i] : this.rx[i];
      const along = l.axis === 0 ? this.rx[i] : this.rz[i];
      // `spanAt` answers "is this crossing DRESSED"; `enclosed` answers "am I inside one of the
      // bores on this line". Two questions, because the second one has to consider every bore and
      // the first only has to find one.
      if (t.spanAt(l.axis, cross, along)) return t.enclosed(l.axis, cross, along, this.roadLength(i) * 0.5);
    }
    return !!(this.avoid && this.cityR && this.cityR.solidAt(this.rx[i], this.ry[i], this.rz[i], 1.5));
  }

  // Is the WHOLE hull inside a mass? Both ends, on the lane's own axis — the test tunnels.js uses
  // to decide a vehicle is between a bore's two portals, applied to a solid mass instead.
  _fullyInside(axis, x, y, z, half, hl) {
    const ax = axis === 0 ? x - hl : x, az = axis === 0 ? z : z - hl;
    const bx = axis === 0 ? x + hl : x, bz = axis === 0 ? z : z + hl;
    return !!(this.cityR.solidAt(ax, y, az, half) && this.cityR.solidAt(bx, y, bz, half));
  }

  _recordDraw(i, x, y, z, off, flag) {
    const k = this.drawN;
    if (k >= this.drawI.length) return;
    this.drawI[k] = i; this.drawX[k] = x; this.drawY[k] = y; this.drawZ[k] = z;
    this.drawOff[k] = off; this.drawFlag[k] = flag;
    this.drawN = k + 1;
  }

  // The promoted craft as they were DRAWN this frame. Frame state — the same clock caveat
  // `roadList` spells out applies, so there is deliberately no `t` argument to get it wrong with.
  drawnList() {
    const out = [];
    for (let k = 0; k < this.drawN; k++) {
      const i = this.drawI[k], l = this.laneOf(i);
      out.push({ i, type: TYPES[this.tType[i]].id, lane: l.i, alt: l.alt, axis: l.axis,
        x: +this.drawX[k].toFixed(2), y: +this.drawY[k].toFixed(2), z: +this.drawZ[k].toFixed(2),
        w: CRAFT_DEFS[TYPES[this.tType[i]].id].W,
        off: +this.drawOff[k].toFixed(3),
        steered: !!(this.drawFlag[k] & 1), climbed: !!(this.drawFlag[k] & 2),
        trapped: !!(this.drawFlag[k] & 4) });
    }
    return out;
  }

  // ── S2-R — how far across the lane this hull has to move to pass what is in front of it ──
  //
  // Returns metres across the lane (signed), or 0 for a clear corridor and for one too blocked to
  // clear. Pure: (axis, position, hull half width, budget) and the city's boxes, nothing else.
  // `hl` is the hull's half LENGTH: pass it and the vehicle's own nose and tail are sampled at
  // full weight, which is what makes the answer a statement about this hull rather than about the
  // ladder's spacing. Omitting it falls back to the ladder alone.
  _clearOffset(axis, x, y, z, half, cap, hl = 0) {
    if (!this.cityR) return 0;
    const cross = axis === 0 ? z : x;
    let best = 0;
    const nT = STEER_TAPS.length + (hl ? 2 : 0);
    for (let k = 0; k < nT; k++) {
      // The two extra taps are the hull's ends, a metre proud, and they carry weight 1.
      const s = k < STEER_TAPS.length ? STEER_TAPS[k]
        : (k === STEER_TAPS.length ? -(hl + 1) : hl + 1);
      const px = axis === 0 ? x + s : x, pz = axis === 0 ? z : z + s;
      // EVERY box near the tap, rather than the one `solidAt` would have returned. Two masses
      // routinely overlap a tap's query, and which of them comes back first changes as the query
      // point moves — a jump in the offset with nothing behind it in the world. The pad is what
      // lets this see a corner graze at all: it is a skirt around the box, so the question asked
      // is "is any part of a hull this wide near the mass", not "is the centreline inside it".
      // js/tunnels.js counts that case as `partial` and declines to dress it, which makes it the
      // one with no other cover — and it is what Aaron reported as a train going into the very
      // edge of a building.
      const pad = Math.max(half, SOFT);
      const boxes = this.cityR.aabbsNear(px, pz, 8 + pad, this._aabbs);
      for (let b = 0; b < boxes.length; b++) {
        const hit = boxes[b];
        if (y > hit.top + pad) continue;
        if (px < hit.x0 - pad || px > hit.x1 + pad || pz < hit.z0 - pad || pz > hit.z1 + pad) continue;
        const c0 = axis === 0 ? hit.z0 : hit.x0, c1 = axis === 0 ? hit.z1 : hit.x1;
        const a0 = axis === 0 ? hit.x0 : hit.z0, a1 = axis === 0 ? hit.x1 : hit.z1;
        const at = axis === 0 ? px : pz;

        // ── every term below has to fall to zero SMOOTHLY ────────────────────
        //
        // gates_steer S5 walks the offset at 1/30 s and bounds the largest single-step change,
        // because "it eases rather than snaps" is the one property no still frame can show. The
        // first draft failed at 2.11 m in a thirtieth of a second — a vehicle covers 0.4 m in that
        // time — and every metre came from a term that switched instead of ramping: the tap being
        // inside the mass's along extent or not; the requirement staying large right up until the
        // hull was clear and then vanishing; and the over-budget case dropped with a bare
        // `continue`. A max over continuous functions is itself continuous, which is what makes
        // taking the strongest tap safe once each one behaves.

        // 1 — along. How much this tap feels a mass it has not reached yet.
        const dAlong = at < a0 ? a0 - at : at > a1 ? at - a1 : 0;
        const wAlong = 1 - dAlong / SOFT;
        if (wAlong <= 0) continue;

        // 2 — across. How far the mass reaches into the hull's own band, each way. These go to
        // zero exactly as the hull clears, so a vehicle that no longer needs the offset stops
        // asking for it gradually rather than dropping it.
        const overR = (c1 + half + 0.5) - cross, overL = cross - (c0 - half - 0.5);
        if (overR <= 0 || overL <= 0) continue;        // already clear across — nothing to ask for

        // Nearest side first, then the other. Taking only the nearer and refusing when it does not
        // fit throws away the case this is most needed for: a mass reaching deep past the
        // centreline leaves almost nothing on the side it came from and most of the deck on the
        // other. A tram was measured still grazing a 10.7 m corner for exactly that reason.
        const near = overR <= overL ? overR : -overL;
        const far = overR <= overL ? -overL : overR;
        const pick = Math.abs(near) <= cap ? near : Math.abs(far) <= cap ? far : null;
        if (pick === null) continue;           // blocked, not obstructed — say so by refusing

        // 3 — budget. Faded over its last two metres rather than dropped off its edge.
        const wCap = clamp((cap - Math.abs(pick)) * 0.5 + 1, 0, 1);
        const v = pick * (k < STEER_TAPS.length ? STEER_W[k] : 1) * wAlong * wCap;
        if (Math.abs(v) > Math.abs(best)) best = v;
      }
    }
    return best;
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
        + `|${p[3]},${p[5]}|${Math.round(this.tSpeed[i] * 256)}|${this.tBody[i]},${this.tTrim[i]},${this.tRun[i]}`
        + `|${this.tEdge[i]},${Math.round(this.tPulse[i] * 256)}`);
    }
    // The road population is inside the hash, not beside it: street traffic is derived from the
    // same seed by the same arithmetic, so a change that makes it non-deterministic has to be
    // visible to the determinism gate rather than to a second gate somebody might not run.
    for (let i = 0; i < this.rN; i++) {
      this.roadPosOf(i, t, camX, camZ, p);
      keys.push(`R:${ROAD_TYPES[this.rType[i]].id}|${Math.round(p[0] * 64)},${Math.round(p[1] * 64)},${Math.round(p[2] * 64)}`
        + `|${p[3]},${p[5]}|${Math.round(this.rSpeed[i] * 256)}|${this.rBody[i]},${this.rTrim[i]},${this.rEdge[i]}`);
    }
    keys.sort();
    let h = 0x811c9dc5 >>> 0;
    for (const s of keys) for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
    return { n: this.N, road: this.rN, hash: ('00000000' + h.toString(16)).slice(-8) };
  }

  // Every live ROAD vehicle, for the gates. Same shape as list().
  // ── every live ROAD vehicle, for the gates ────────────────────────────────
  //
  // TWO CLOCKS LIVE IN THIS ROW AND THEY ARE NOT THE SAME CLOCK. `x/y/z`, `lag` and everything
  // else derived from `roadPosOf` are recomputed at whatever `t` the caller passes. `hidden`,
  // `drawn`, `streak` and `off` are FRAME STATE, written by the last `_updateRoad` at the live
  // vehicle clock, and they know nothing about a `t` given here.
  //
  // That cost a real measurement during S2-R: a 40-moment sweep read `hidden` alongside positions
  // at 40 different `t` values and concluded that 83 vehicles were driving unsuppressed through
  // walls. They were not — the sweep was reading one moment's suppression against another moment's
  // positions. So the frame-state fields are now NULL whenever an explicit `t` is passed, which
  // turns a plausible wrong number into an obviously missing one. To sample them at a moment, pin
  // the population first: `__game.stepVehicles(t)` then `roadList()` with no `t` at all.
  roadList(t, cam, limit = 0, live = true) {
    const p = [0, 0, 0, 0, 0, 0];
    const out = [];
    for (let i = 0; i < this.rN; i++) {
      this.roadPosOf(i, t, cam.x, cam.z, p);
      const l = this.rLaneOf(i);
      const id = ROAD_TYPES[this.rType[i]].id;
      const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
      // How far the vehicle is from the nearest road CENTRELINE, which is the one thing that
      // proves it is on a street rather than on a plausible-looking arbitrary line.
      const cross = l.axis === 0 ? p[2] : p[0];
      const offRoad = Math.abs(((cross / LOT) - Math.round(cross / LOT)) * LOT);
      out.push({
        i, type: id, lane: l.i, dir: l.dir, axis: l.axis, L: CRAFT_DEFS[id].L,
        x: +p[0].toFixed(2), y: +p[1].toFixed(2), z: +p[2].toFixed(2),
        speed: +this.rSpeed[i].toFixed(2), edge: this.rEdge[i],
        // The give-way hold, in metres behind the free-running position. A gate that wants to
        // prove the hold is doing anything has to read this, not infer it from a position.
        lag: +this.roadLag(i, l.dir * (this.rU[i] * W_TILE + l.dir * this.rSpeed[i] * t),
          cam.x, cam.z).toFixed(3),
        body: BODY_TINTS[this.rBody[i]], trim: TRIM_TINTS[this.rTrim[i]],
        offRoad: +offRoad.toFixed(3),
        d: +Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(2),
        near: live ? this.rNearIdx.slice(0, this.rNearN).includes(i) : null,
        hidden: live ? !!this.rHid[i] : null, drawn: live ? !!this.rDrawn[i] : null,
        // S2-R. The lateral offset applied this frame, and the position it actually drew at.
        // Frame state, so it follows the same rule as `hidden` above.
        off: live ? +this.rOff[i].toFixed(3) : null,
        // The yaw actually written to the pose, steering correction included, so gates_steer S10
        // can check the heading against the path instead of re-deriving the formula it is testing.
        yaw: live ? +(this.roadYawOf(i) + this._roadSteerYaw(i)).toFixed(4) : null,
        sx: live ? +(this.rx[i]).toFixed(2) : null, sz: live ? +(this.rz[i]).toFixed(2) : null,
        // The streak's own intensity, straight off the GPU buffer at its instance slot. A gate
        // asserting "and its streak is gone too" must read the buffer, not this file's intent.
        streak: live ? +this.geo.attributes.iInt.array[this.N + i].toFixed(4) : null,
      });
      if (limit && out.length >= limit) break;
    }
    return out;
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
        edge: this.tEdge[i], pulse: +this.tPulse[i].toFixed(3),
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
    const edge = new Array(EDGE_W.length).fill(0);
    const shape = {};
    let police = 0, pulsed = 0;
    for (let i = 0; i < this.N; i++) {
      const id = TYPES[this.tType[i]].id;
      shape[id] = (shape[id] || 0) + 1;
      if (id === 'patrol') { police++; continue; }
      body[this.tBody[i]]++; trim[this.tTrim[i]]++; run[this.tRun[i]]++;
      edge[this.tEdge[i]]++;
      if (this.tPulse[i] > 0) pulsed++;
    }
    const roadShape = {};
    for (let i = 0; i < this.rN; i++) {
      const id = ROAD_TYPES[this.rType[i]].id;
      roadShape[id] = (roadShape[id] || 0) + 1;
    }
    const civil = this.N - police;
    return {
      n: this.N, civil, police, body, trim, run, edge, shape, roadShape, road: this.rN, pulsed,
      bodyDistinct: body.filter(v => v > 0).length,
      trimDistinct: trim.filter(v => v > 0).length,
      runDistinct: run.filter(v => v > 0).length,
      // S2-C's two new axes, counted rather than asserted by eye: how many distinct SILHOUETTES
      // are live (the complaint was that there were two), and how many distinct lit edges.
      shapeDistinct: Object.keys(shape).length,
      roadShapeDistinct: Object.keys(roadShape).length,
      edgeDistinct: edge.filter(v => v > 0).length,
      pulsedFrac: civil ? +(pulsed / civil).toFixed(3) : 0,
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
      on: this.on, n: this.N, near: this.nearN, streaks: this.stats.streaks,
      lanes: this.lanes.length, alts: ALT, nearLine: NEAR_LINE,
      // The road population, reported separately from `n` on purpose: every gate that asserts
      // "all N craft are also in the streak field" is about the FLYING population and must keep
      // measuring exactly that. `streakTotal` is what the InstancedMesh actually draws.
      road: this.rN, roadNear: this.rNearN, roadMeshes: this.stats.roadMeshes,
      roadHidden: this.stats.roadHidden, tunnels: !!this.tunnels,
      roadLanes: this.rLanes.length, streakTotal: this.mesh.count,
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

export { ALT, CORR, NC, CT, W_TILE, LANE_SEP, NEAR_LINE, TYPES, ROAD_TYPES, EDGE_W,
  R_LANE, R_NC, R_CT, R_NEAR, R_SPEED, R_SLOTS, R_YIELD_AXIS, R_HOLD, R_YIELD_R };

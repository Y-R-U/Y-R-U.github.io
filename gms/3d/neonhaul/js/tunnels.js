// S2-N — where a street runs through a building.
//
// Aaron, on the shipped build: *"Trains going through buildings, that is fine as long as an auto
// door slides open and train goes into a dark tunnel?"*
//
// ── the defect this exists to dress ────────────────────────────────────────
//
// `traffic.js`'s road transports drive DEAD STRAIGHT down a fixed corridor forever. `roadPosOf`
// is a pure function of (seed, index, time, camera) with no steering and no knowledge of the
// city, so where a corridor crosses a building footprint the vehicle drives through the building.
// Measured over 196 chunks of real descriptors, the corridors cross a ground-floor mass often
// enough that it is the general case and not an authoring mistake — and the buildings it happens
// to are ordinary seeded towers, mostly the `split` pairs whose second half is thrown clear of
// its own lot and over the street line.
//
// Nothing here steers a vehicle. It puts a **hole with doors** where the corridor meets the wall
// and lets the wall do what a wall does.
//
// ── the fact the whole file rests on ───────────────────────────────────────
//
// A road corridor's cross coordinate is FIXED IN WORLD SPACE. `roadPosOf` snaps its cross tile to
// the camera, which looks like it moves — but the snap moves in whole `R_CT` steps and
// `R_CT = R_NC * CORR`, so the set of cross coordinates it can produce is `roadPhase(a) + n*CORR`
// for integer n, whatever the camera does. Camera motion changes WHICH corridors of a family are
// populated, never where they are. That is what makes a portal a static property of a building
// and not a thing that has to chase the player. `lanes.js` owns that lattice; this file and
// `traffic.js` both read it rather than each keeping a copy.
//
// ── placement discipline, verbatim from js/shops.js ────────────────────────
//
// PLACEMENT IS A HASH OR A GEOMETRIC FACT, NEVER A DRAW FROM THE CITY'S RNG. One extra draw from
// `city.js`'s xorshift stream moves every building in the world and the golden determinism hash
// with it. Everything below comes from the building's own (x, z, w, d, proto) and the corridor
// lattice; the only seeded number is a per-portal decoration hash of the quantised position.
//
// A PORTAL THAT DOES NOT FIT IS DROPPED, NEVER SHRUNK — and `state().skipped` reports every
// reason it was dropped, so the residue is a number in a gate rather than something you have to
// go looking for. `hide ⇔ portal` is the invariant that matters: `traffic.js` may only hide a
// transport inside a footprint that actually has a mouth on both faces, or a bus will vanish in
// open air.
//
// ── one draw ──────────────────────────────────────────────────────────────
//
// One `Field`, one instanced quad per portal, the frame and the leaves and the bore all fragment
// work inside it (materials.js `patchTunnel`). The layer costs exactly one draw call.

import * as THREE from 'three';
import { Field } from './render_city.js';
import { protoBoxes } from './blocks.js';
import { tunnelMaterial } from './materials.js';
import { hash2i, hashf, clamp } from './utils.js';
import { CORR, R_LANE, roadLines } from './lanes.js';
import { CRAFT_DEFS } from './craft.js';
import { ROAD_TYPES } from './traffic.js';

const AXIS_Y = new THREE.Vector3(0, 1, 0);

const TUNNEL_ATTRS = [
  { name: 'iTun', size: 4 },     // (quad w, quad h, opening w, opening h) in metres
  { name: 'iDoor', size: 2 },    // (openness 0..1 — written EVERY frame, decoration seed)
  { name: 'iGlow', size: 3 },    // the reveal / lamp tint, linear
  { name: 'iChunk', size: 2 },   // §3.2.2's dither, shared with the LOD0 shell
];

// The envelope, taken from the LARGEST road transport rather than from a round number:
// `haul_road` is 32.0 x 3.00 x 3.40 in craft.js, and a mouth sized for the bus would swallow the
// bus and shear the haulier.
const BIG = ROAD_TYPES.reduce((a, r) => {
  const d = CRAFT_DEFS[r.id];
  return { L: Math.max(a.L, d.L), W: Math.max(a.W, d.W), H: Math.max(a.H, d.H) };
}, { L: 0, W: 0, H: 0 });

export const OPEN_W = +(BIG.W + 1.8).toFixed(2);   // 4.80 m — the haulier plus 0.9 m each side
export const OPEN_H = +(BIG.H + 1.6).toFixed(2);   // 5.00 m — 1.6 m of headroom over the roof
const JAMB = 0.35;                                 // the lit reveal around the bore
const LINTEL = 0.80;                               // wall above the opening, carrying the hazard band
const QUAD_W = OPEN_W + JAMB * 2;                  // 5.50 m
const QUAD_H = OPEN_H + LINTEL;                    // 5.80 m
const PROUD = 0.30;                                // how far the panel stands off the wall
// A round mass's face is a 10-gon facet and the panel is flat: over QUAD_W the sagitta of a drum
// of radius r is QUAD_W^2 / 8r, which is under PROUD for every drum the city builds. Past 0.30 of
// the radius the facet runs out and the panel would hang in the air, so the crossing is dropped.
const ROUND_LIMIT = 0.30;
// How far the mouth may be nudged off the vehicle's own line to stay on the face. Half the
// clearance either side, so the transport still passes through the middle of the opening.
const NUDGE = (OPEN_W - BIG.W) * 0.5 - 0.30;       // 0.60 m
// The panel has to land on the face with wall left BESIDE it, not merely inside it. Clamping the
// centre to `c0 + QUAD_W/2` stands the frame's outer edge exactly on the building's corner, and on
// the shipped ring a THIRD of the crossings came out exactly there — a fit test whose answer is
// its own limit is a clamp with a condition bolted on. It also made the check unmeasurable:
// `list()` reports to the centimetre, so "flush" and "5 mm over the corner" were the same number,
// and gates_tunnel T2 flagged one of the two flush mouths and not the other purely on which way
// toFixed rounded. JAMB is the frame's own lit reveal; below that much undressed wall each side
// the mouth reads as a chamfer off the corner rather than a doorway in a facade, so the crossing
// is DROPPED and counted, which is this file's rule everywhere else.
const EDGE = JAMB;
const MIN_LEN = BIG.W + 2.0;                       // a bore shorter than this is a notch, not a tunnel

// The doors. `LEAD` is how far ahead of the mouth a vehicle starts the leaf moving and `TRAIL` is
// how far past it the leaf waits before closing. At the road population's 8-17 m/s, LEAD buys
// 1.6-3.4 s of warning against a `DOOR_T` of 0.85 s — so the door is always fully open before the
// nose reaches it, at every speed in the fleet, which is the thing a timer could not promise.
const LEAD = 28;
const TRAIL = 7;
const DOOR_T = 0.85;

const lin = (hex, out) => out.setHex(hex).convertSRGBToLinear();

// The reveal tints. Deliberately cold, dim and few: a service portal is infrastructure, not a
// shop, and a row of differently-coloured tunnel mouths would read as decoration. The saturated
// greens and magentas of the signage palette are deliberately NOT here — a lit rectangle in a
// primary is exactly the "every light source is a sticker" note SCORES.md round 7 leads with.
const GLOWS = [0x9fd8ff, 0x35e6ff, 0xcfe4ff, 0xffb04a];

// ── the pure geometry ──────────────────────────────────────────────────────

// The along-extent of one unit-space ground box at a cross line, in world metres, or null if the
// line misses it. `half` is the half-width of the band that has to be covered — a transport is
// only inside the building when the whole of its WIDTH is, which is what stops a corridor that
// clips a corner by 200 mm from being dressed as a tunnel.
//
// Round boxes are the 10-gon `blocks.js` builds, intersected exactly rather than approximated by
// its bounding square: a drum's bounding square is 27 % larger than the drum.
function boxSpan(bx, b, axis, line, half, out) {
  const cScale = axis === 0 ? b.d : b.w;             // cross axis: 0 travels along X, so cross is z
  const aScale = axis === 0 ? b.w : b.d;
  const cCentre = axis === 0 ? b.z : b.x;
  const aCentre = axis === 0 ? b.x : b.z;
  const uc = (line - cCentre) / cScale;              // the line in the box's own unit space

  if (bx.round) {
    const r = (bx.x1 - bx.x0) * 0.5;                 // unit radius, always 0.5 for a prism
    if (Math.abs(uc) + half / cScale > r * ROUND_LIMIT * 2) return null;
    const SIDES = 10;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * Math.PI * 2, a1 = ((i + 1) / SIDES) * Math.PI * 2;
      // The prism's own vertex order: cos -> unit x, sin -> unit z.
      const cx0 = Math.cos(a0) * r, cz0 = Math.sin(a0) * r;
      const cx1 = Math.cos(a1) * r, cz1 = Math.sin(a1) * r;
      const c0 = axis === 0 ? cz0 : cx0, c1 = axis === 0 ? cz1 : cx1;
      const p0 = axis === 0 ? cx0 : cz0, p1 = axis === 0 ? cx1 : cz1;
      if ((c0 - uc) * (c1 - uc) > 0) continue;
      const t = c1 === c0 ? 0 : (uc - c0) / (c1 - c0);
      const a = p0 + (p1 - p0) * t;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
    if (!isFinite(lo) || hi - lo < 1e-4) return null;
    out[0] = aCentre + lo * aScale;
    out[1] = aCentre + hi * aScale;
    out[2] = cCentre + (axis === 0 ? bx.z0 : bx.x0) * cScale;   // the bounding face, for the fit test
    out[3] = cCentre + (axis === 0 ? bx.z1 : bx.x1) * cScale;
    out[4] = 1;
    return out;
  }

  const c0 = cCentre + (axis === 0 ? bx.z0 : bx.x0) * cScale;
  const c1 = cCentre + (axis === 0 ? bx.z1 : bx.x1) * cScale;
  if (line - half < c0 || line + half > c1) return null;         // the band is not fully covered
  out[0] = aCentre + (axis === 0 ? bx.x0 : bx.z0) * aScale;
  out[1] = aCentre + (axis === 0 ? bx.x1 : bx.z1) * aScale;
  out[2] = c0; out[3] = c1; out[4] = 0;
  return out;
}

// ── the layer ──────────────────────────────────────────────────────────────

export class Tunnels {
  // `seed` is the TRAFFIC seed (`trafficSeed(city.seed)`), not the world seed. Handed the world
  // seed this file produces a perfectly plausible lattice that is 50 m from every street.
  constructor(Q, seed, noiseTex, keepMeta = false) {
    this.Q = Q;
    this.seed = seed | 0;
    this.keepMeta = !!keepMeta;
    this.lines = roadLines(this.seed);
    this.mat = tunnelMaterial(noiseTex);
    // Measured: 196 chunks of real descriptors carry ~0.6 placeable crossings each, so a HIGH 5x5
    // ring is ~30 portals. 256 is eight times the worst ring and the field reports overflow, so a
    // cap that turns out to be wrong says so in a gate instead of silently deleting a doorway.
    this.field = new Field('tunnels', new THREE.PlaneGeometry(1, 1), this.mat, 256, TUNNEL_ATTRS);
    this.field.mesh.renderOrder = 0;
    this.mesh = this.field.mesh;

    // The two flat lists every frame walks. Kept flat rather than chunk-keyed because a building
    // straddles chunks and a bore is up to 60 m long: a 3x3 chunk probe around a vehicle is three
    // more chances to look in the wrong box for no gain at this population.
    this.portals = [];
    this.spans = [];
    this._cand = [];
    this._span = [0, 0, 0, 0, 0];
    this._iv = [];
    this._veh = [];      // reused per frame: {axis, line, s, dirSign, half}
    this._vn = 0;

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.stats = { portals: 0, bores: 0, buildings: 0, peak: 0,
      skipShort: 0, skipNarrow: 0, skipStub: 0, skipRound: 0, nested: 0, partial: 0 };
    this.msDoor = 0;
  }

  applyQuality(Q) { this.Q = Q; }
  flush() { this.field.flush(); }

  prepare(rec) { if (!rec.tnQ) { rec.tnQ = []; rec.tnMeta = []; } }

  release(rec) {
    if (!rec.tnQ) return;
    for (let i = rec.tnQ.length - 1; i >= 0; i--) this.field.free(rec.tnQ[i]);
    rec.tnQ.length = 0;
    rec.tnMeta.length = 0;
    if (!rec.tnN) return;
    // Compacted in place, the same shape signage.js uses for its poster sites: a chunk that has
    // gone must not leave a door swinging behind you, and it must not leave a span that would let
    // traffic.js hide a bus inside a building that is no longer there.
    let w = 0;
    for (let i = 0; i < this.portals.length; i++) if (this.portals[i].rec !== rec) this.portals[w++] = this.portals[i];
    this.portals.length = w;
    w = 0;
    for (let i = 0; i < this.spans.length; i++) if (this.spans[i].rec !== rec) this.spans[w++] = this.spans[i];
    this.spans.length = w;
    rec.tnN = 0;
  }

  // ── one building's crossings ─────────────────────────────────────────────
  //
  // Returns the portals placed for THIS building, in `this._cand`, so signage.js can hand them to
  // shops.js — a shopfront and a tunnel mouth are both opaque panels 0.1-0.3 m off the same wall
  // and two of them on the same square metre is a z-fight, not a street.
  writeBuilding(rec, b, ccx, ccz) {
    this._cand.length = 0;
    const boxes = protoBoxes(b.proto);
    if (!boxes) return this._cand;
    const ground = [];
    for (const bx of boxes) if (bx.y0 < 0.005) ground.push(bx);
    if (!ground.length) return this._cand;

    const half = BIG.W * 0.5 + 0.3;
    let placed = 0;
    for (let axis = 0; axis < 2; axis++) {
      const cCentre = axis === 0 ? b.z : b.x;
      const cHalf = (axis === 0 ? b.d : b.w) * 0.5;
      for (const L of this.lines) {
        if (L.axis !== axis) continue;
        const k0 = Math.ceil((cCentre - cHalf - half - L.off) / CORR);
        const k1 = Math.floor((cCentre + cHalf + half - L.off) / CORR);
        for (let k = k0; k <= k1; k++) placed += this.line(rec, b, axis, L.off + k * CORR, ground, ccx, ccz);
      }
    }
    if (placed) this.stats.buildings++;
    if (this.field.n > this.stats.peak) this.stats.peak = this.field.n;
    return this._cand;
  }

  // One corridor line against one building. Every ground mass the line fully covers contributes an
  // along-interval; OVERLAPPING intervals merge and each merged run becomes one bore with a mouth
  // at each end. `bridged` is two towers with a gap between them, and merging across that gap
  // would let traffic.js hide a transport in the open air the sky bridge spans.
  line(rec, b, axis, line, ground, ccx, ccz) {
    const half = BIG.W * 0.5 + 0.3;
    const iv = this._iv;
    iv.length = 0;
    for (const bx of ground) {
      const cScale = axis === 0 ? b.d : b.w, cCentre = axis === 0 ? b.z : b.x;
      const c0 = cCentre + (axis === 0 ? bx.z0 : bx.x0) * cScale;
      const c1 = cCentre + (axis === 0 ? bx.z1 : bx.x1) * cScale;
      if (line + half < c0 || line - half > c1) continue;      // the band misses this mass entirely
      const s = boxSpan(bx, b, axis, line, half, this._span);
      if (!s) { if (bx.round) this.stats.skipRound++; else this.stats.partial++; continue; }
      // A mass too short to carry the opening is dropped rather than squashed to fit — §3.10 #4's
      // rule, and shops.js' MIN_GROUND for the same reason.
      if (bx.y1 * b.h < QUAD_H + 0.2) { this.stats.skipShort++; continue; }
      iv.push({ a0: s[0], a1: s[1], c0: s[2], c1: s[3], round: s[4] });
    }
    if (!iv.length) return 0;
    iv.sort((p, q) => p.a0 - q.a0);

    let n = 0;
    let cur = { a0: iv[0].a0, a1: iv[0].a1, c0: iv[0].c0, c1: iv[0].c1, round: iv[0].round };
    for (let i = 1; i <= iv.length; i++) {
      if (i < iv.length && iv[i].a0 <= cur.a1 + 0.05) {
        if (iv[i].a1 > cur.a1) cur.a1 = iv[i].a1;
        cur.c0 = Math.max(cur.c0, iv[i].c0);
        cur.c1 = Math.min(cur.c1, iv[i].c1);
        cur.round = cur.round || iv[i].round;
        continue;
      }
      n += this.bore(rec, b, axis, line, cur, ccx, ccz) ? 1 : 0;
      if (i < iv.length) cur = { a0: iv[i].a0, a1: iv[i].a1, c0: iv[i].c0, c1: iv[i].c1, round: iv[i].round };
    }
    return n;
  }

  // One merged run: two portals and the span traffic.js hides inside.
  bore(rec, b, axis, line, run, ccx, ccz) {
    if (run.a1 - run.a0 < MIN_LEN) { this.stats.skipStub++; return false; }
    // The mouth must sit on the face, and it may be nudged at most NUDGE off the vehicle's own
    // line to get there — beyond that the transport would clip the jamb, so the crossing is left
    // undressed and traffic.js keeps its old centre-point suppression for it.
    const hq = QUAD_W * 0.5 + EDGE;
    const centre = clamp(line, run.c0 + hq, run.c1 - hq);
    if (!(run.c1 - run.c0 >= QUAD_W + EDGE * 2) || Math.abs(centre - line) > NUDGE) {
      this.stats.skipNarrow++;
      return false;
    }
    // A run entirely inside a run that is already dressed gets nothing. The Spindle is the case
    // that found this: its 186 x 210 m slab and the 74 m spire standing in it are two parts of one
    // landmark, and the spire's two mouths land 90 m inside the slab's solid volume where they can
    // never be seen. The outer bore already hides the vehicle over the whole of the inner one.
    const inner = this.spanAt(axis, line, (run.a0 + run.a1) * 0.5, 0);
    if (inner && inner.a0 <= run.a0 + 0.05 && inner.a1 >= run.a1 - 0.05) { this.stats.nested++; return false; }
    // A bore is TWO mouths or it is nothing: `traffic.js` may only hide a transport between a
    // pair, so half a bore would be a bus vanishing into a blank wall — the defect, with a door
    // bolted to one end of it. The capacity check is therefore for both, before either.
    if (this.field.n + 2 > this.field.cap) { this.field.overflow += 2; return false; }
    const proud = run.round ? PROUD : 0.18;
    const g = GLOWS[hash2i(Math.round(b.x * 4), Math.round(b.z * 4), 0x7d11) % GLOWS.length];
    const seed = hashf(Math.round(centre * 4), Math.round(run.a0 * 4), 0x31c7) * 64;

    // yaw convention is signage.js `flatFace`'s and shops.js', verbatim: the quad's local +Z is
    // its outward normal, so the portal at the LOW end of the run faces down the -along axis.
    const lo = this.portal(rec, b, axis, centre, run.a0 - proud, -1, g, seed, ccx, ccz);
    const hi = this.portal(rec, b, axis, centre, run.a1 + proud, +1, g, seed, ccx, ccz);

    this.spans.push({ rec, axis, line, a0: run.a0, a1: run.a1, lo, hi,
      lm: b.landmark || null, proto: b.proto, bx: b.x, bz: b.z, bw: b.w, bd: b.d, bh: b.h });
    rec.tnN = (rec.tnN || 0) + 1;
    this.stats.bores++;
    return true;
  }

  // `nrm` is +1 when the panel faces the +along direction. `ap` is the plane the leaves stand in.
  portal(rec, b, axis, cross, ap, nrm, glow, seed, ccx, ccz) {
    this.prepare(rec);
    const qi = rec.tnQ.length;
    const slot = this.field.alloc(rec.tnQ, qi);
    if (slot < 0) return null;
    rec.tnQ.push(slot);

    const x = axis === 0 ? ap : cross;
    const z = axis === 0 ? cross : ap;
    // axis 0 runs along X, so an outward normal of +X is yaw +PI/2 (shops.js face 0); axis 1 runs
    // along Z, so +Z is yaw 0 and -Z is yaw PI.
    const yaw = axis === 0 ? (nrm > 0 ? Math.PI / 2 : -Math.PI / 2) : (nrm > 0 ? 0 : Math.PI);
    this._q.setFromAxisAngle(AXIS_Y, yaw);
    this._p.set(x, QUAD_H * 0.5, z);
    this._s.set(QUAD_W, QUAD_H, 1);
    this._m4.compose(this._p, this._q, this._s);
    this._m4.toArray(this.field.mesh.instanceMatrix.array, slot * 16);

    this.field.set('iTun', slot, QUAD_W, QUAD_H, OPEN_W, OPEN_H);
    this.field.set('iDoor', slot, 0, seed);
    lin(glow, this._c);
    this.field.set('iGlow', slot, this._c.r, this._c.g, this._c.b);
    this.field.set('iChunk', slot, ccx, ccz);
    this.field.touch(slot);

    // `qi`, NOT the slot. `Field.free` swap-removes: it moves the last live instance into the
    // freed one and repairs the OWNER array it was allocated with — `rec.tnQ` — and nothing else.
    // A slot cached here as well goes stale the first time a neighbouring chunk is released, and
    // then every frame writes this leaf's openness onto some other portal's instance: the door in
    // front of you never moves and a door across the street opens for nothing. It reads exactly
    // like the shader ignoring iDoor, which is what gates_tunnel T8b caught it as.
    const p = { rec, qi, axis, line: cross, ap, nrm, seed, open: 0, want: 0 };
    this.portals.push(p);
    this._cand.push({ x, z, axis, hw: QUAD_W * 0.5, nrm });
    this.stats.portals++;
    if (this.keepMeta) rec.tnMeta.push({ x, z, yaw, axis, cross, ap, nrm, w: QUAD_W, h: QUAD_H,
      openW: OPEN_W, openH: OPEN_H, proto: b.proto, bx: b.x, bz: b.z, bw: b.w, bd: b.d, bh: b.h });
    return p;
  }

  // ── the frame ────────────────────────────────────────────────────────────
  //
  // The door is driven off the vehicles' ACTUAL distance and direction, never a clock. For each
  // portal, a leaf is wanted open while any transport on that exact line occupies
  //
  //     [ -(L/2 + lead) , +(L/2 + trail) ]
  //
  // in the portal's own inward coordinate, where `lead` is on the side the vehicle is coming FROM
  // and `trail` on the side it is going to. That is symmetric in direction by construction, so
  // the same rule opens a mouth for a bus arriving from the street and for the same bus leaving
  // the far end 30 m later, and a 22 m tram holds both leaves open for exactly as long as it
  // takes to clear them.
  update(dt, traffic) {
    const t0 = performance.now();
    const V = this._veh;
    this._vn = 0;
    if (traffic && traffic.on) {
      for (let i = 0; i < traffic.rN; i++) {
        const l = traffic.rLaneOf(i);
        const cross = l.axis === 0 ? traffic.rz[i] : traffic.rx[i];
        const along = l.axis === 0 ? traffic.rx[i] : traffic.rz[i];
        let v = V[this._vn];
        if (!v) v = V[this._vn] = { axis: 0, cross: 0, along: 0, dir: 1, half: 0 };
        v.axis = l.axis; v.cross = cross; v.along = along; v.dir = l.dir;
        v.half = traffic.roadLength(i) * 0.5;
        this._vn++;
      }
    }
    const rate = dt / DOOR_T;
    for (const p of this.portals) {
      // `p.nrm` is the panel's OUTWARD direction along the axis, so -nrm points into the bore.
      const into = -p.nrm;
      let want = 0;
      for (let k = 0; k < this._vn; k++) {
        const v = V[k];
        if (v.axis !== p.axis || Math.abs(v.cross - p.line) > R_LANE * 0.5) continue;
        const u = (v.along - p.ap) * into;           // + = inside the bore, - = still on the street
        const in2 = v.dir * into;                    // +1 = this vehicle is driving IN through here
        const lo = -(v.half + (in2 > 0 ? LEAD : TRAIL));
        const hi = v.half + (in2 > 0 ? TRAIL : LEAD);
        if (u >= lo && u <= hi) { want = 1; break; }
      }
      p.want = want;
      const d = want - p.open;
      p.open = Math.abs(d) <= rate ? want : p.open + (d > 0 ? rate : -rate);
      const slot = p.rec.tnQ[p.qi];
      this.field.set('iDoor', slot, p.open, p.seed);
      this.field.touch(slot);
    }
    this.msDoor = performance.now() - t0;
  }

  // ── the query traffic.js hides against ───────────────────────────────────
  //
  // The bore nearest `along` on this exact line, or null. `margin` is generous on purpose: the
  // caller needs the span while the vehicle is still OUTSIDE the mouth, because the whole point
  // is that the tunnel rule outranks the old centre-point `solidAt` suppression that used to cut
  // a 32 m haulier in half at the wall.
  // Is a hull of half-length `half` centred on `along` entirely inside SOME bore on this line?
  // Not "inside the nearest bore": two masses of one landmark can overlap, and a transport fully
  // swallowed by the outer one while only half inside the inner one is still inside a building.
  // Asking the nearest span alone would draw it through a wall.
  enclosed(axis, cross, along, half) {
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      if (s.axis !== axis || Math.abs(s.line - cross) > R_LANE * 0.5) continue;
      if (along - half > s.a0 + 0.15 && along + half < s.a1 - 0.15) return true;
    }
    return false;
  }

  spanAt(axis, cross, along, margin = 40) {
    let best = null, bd = Infinity;
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      if (s.axis !== axis || Math.abs(s.line - cross) > R_LANE * 0.5) continue;
      const d = along < s.a0 ? s.a0 - along : along > s.a1 ? along - s.a1 : 0;
      if (d > margin || d >= bd) continue;
      bd = d; best = s;
    }
    return best;
  }

  // ── the gate surface ─────────────────────────────────────────────────────

  setVisible(on) { this.mesh.visible = !!on; return this.mesh.visible; }

  slotOf(p) { return p.rec.tnQ[p.qi]; }

  // Does the FIELD agree that each mouth owns the instance this layer writes its door to? The
  // field repairs `rec.tnQ` on a swap-remove and nothing else, so this is the one statement that
  // a second, private copy of a slot cannot satisfy — and a mis-aimed per-frame write is invisible
  // in every other number the layer reports.
  slotsBad() {
    const f = this.field;
    let bad = 0;
    for (const p of this.portals) {
      const s = this.slotOf(p);
      if (!(s >= 0 && s < f.n && f.ownerArr[s] === p.rec.tnQ && f.ownerIdx[s] === p.qi)) bad++;
    }
    return bad;
  }

  // Every live portal and bore, so a gate can fly to one rather than hunt for it.
  list() {
    return this.spans.map(s => ({
      axis: s.axis, line: +s.line.toFixed(2), a0: +s.a0.toFixed(2), a1: +s.a1.toFixed(2),
      len: +(s.a1 - s.a0).toFixed(2), lm: s.lm, proto: s.proto,
      b: { x: s.bx, z: s.bz, w: s.bw, d: s.bd, h: s.bh },
      proud: +(s.axis === 0 ? s.lo.ap - s.a0 : s.lo.ap - s.a0).toFixed(3),
      lo: { x: +(s.axis === 0 ? s.lo.ap : s.lo.line).toFixed(2), z: +(s.axis === 0 ? s.lo.line : s.lo.ap).toFixed(2),
        open: +s.lo.open.toFixed(3), want: s.lo.want, nrm: s.lo.nrm,
        slot: this.slotOf(s.lo), buf: +this.field.attr.iDoor.array[this.slotOf(s.lo) * 2].toFixed(3) },
      hi: { x: +(s.axis === 0 ? s.hi.ap : s.hi.line).toFixed(2), z: +(s.axis === 0 ? s.hi.line : s.hi.ap).toFixed(2),
        open: +s.hi.open.toFixed(3), want: s.hi.want, nrm: s.hi.nrm,
        slot: this.slotOf(s.hi), buf: +this.field.attr.iDoor.array[this.slotOf(s.hi) * 2].toFixed(3) },
      // The mouth CENTRE at full precision. `x`/`z` above are rounded for reading, and T2's fit
      // test is a containment to the millimetre: asserting on the rounded pair once reported a
      // panel 5 mm off a face it was exactly flush with.
      cross: s.lo.line,
    }));
  }

  state() {
    return {
      n: this.field.n, cap: this.field.cap, overflow: this.field.overflow,
      tris: this.field.tris, visible: this.mesh.visible,
      portals: this.portals.length, bores: this.spans.length, slotsBad: this.slotsBad(),
      openW: OPEN_W, openH: OPEN_H, quadW: QUAD_W, quadH: QUAD_H, edge: EDGE, nudge: NUDGE,
      envelope: BIG, lead: LEAD, trail: TRAIL, doorT: DOOR_T,
      lines: this.lines.map(l => ({ axis: l.axis, off: +l.off.toFixed(2) })),
      msDoor: +this.msDoor.toFixed(3),
      stats: Object.assign({}, this.stats),
    };
  }

  breakdown() {
    return { field: 'tunnels', draws: this.field.n && this.mesh.visible ? 1 : 0,
      instances: this.field.n, geoTris: this.field.tris, tris: this.field.tris * this.field.n,
      cap: this.field.cap, overflow: this.field.overflow };
  }

  dispose() { this.field.dispose(); this.mat.dispose(); }
}

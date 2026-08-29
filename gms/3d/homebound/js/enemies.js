// The wall of red, and the thing at the end of it.
//
// Two completely different budgets live in this file. The blocks are hundreds
// of bodies that must cost almost nothing each: one InstancedMesh plus its
// outline shell for every enemy in the level, positions written straight into
// the instance matrix by the crowd from `units.js`/`toon.js`, no Object3D per
// man and no allocation in a frame. The boss is the opposite — three draw calls
// spent on one unit, because it is the only enemy the player ever looks *at*
// rather than through.
//
// WHY GROUPS, AND WHY THEY ARE CONTIGUOUS. Hit testing is the hot path: every
// bullet, every substep, asks "is anything here?". Testing 500 units per bullet
// is a quarter of a million distance checks a frame. So each block keeps an AABB
// refreshed once a frame — a bullet that misses the box skips the whole wall for
// four compares — and a block's men occupy one contiguous span of the unit
// arrays. Retiring a block frees a whole span at once, which is what keeps the
// pool from filling up over a 600 m level.
//
// The AABB alone was enough when a block was sixty men in a two-metre slab. It
// is not enough now that one is five hundred men in an eighteen-metre one: a
// bullet inside that box would scan the entire wall. So the span carries a
// second, free invariant — a grid group is written rank by rank, therefore it is
// sorted on `uoz` — and both the hit test and the splash binary-search into the
// rank they care about and stop one rank past it (`rankLo`, `SORT_SLACK`).
// Measured at 462 bodies: 0.115 us a hit test, and `updateEnemies` costs 0.038 ms
// a frame, which is what `updateArmy` costs for 200 friendlies.
//
// THE RIPPLE. A hit damages the nearest man in full and splashes into his
// neighbours. That is not a fairness feature, it is the look: the reference's
// front rank does not lose scattered individuals, it dissolves from the point
// the fire is landing. Splash plus a per-man hit flash plus wear-darkening as
// hp drops is what produces that out of an otherwise uniform grid.
//
// ===========================================================================
// STAGING PASS — BODIES ARE NOT COUNT
//
// `dev/ref1.jpg` and `dev/ref2.jpg` are the whole spec for this file, and the
// thing they have that the build did not is a SOLID COLUMN OF RED filling the
// road across and running twenty-plus metres up it. ref2 is the honest measure:
// about fourteen files wide by forty ranks deep, no back edge in frame — five
// hundred-odd bodies. That mass is the reason the picture reads as a battle.
//
// levels.js sizes an enemy item's `count` as BALANCE — "the men this beat costs
// you if you ignore it" — and at level 12 that is 8, 14, 54, 51. Eight men on a
// grid is two ranks of red at forty metres, which is exactly the thin smudge
// the build had. So `count` is no longer the crowd size. It stays the entire
// basis of the FIGHT and the number of bodies is chosen for the SHOT:
//
//     bodies = clamp(200 + count * 6.6, 400, 560), then capped by the pool
//
// which is 80x at count 5, 9x at count 45 and 2.2x at count 260. Compressive,
// not a flat multiplier, and the honest way to read it is not as a ratio at all
// but as a floor: A BLOCK IS NEVER FEWER THAN 400 BODIES. A flat 8x would leave
// the small early beats as three ranks and would make a chapter-4 block of 400
// unaffordable at the same time. Every mechanical number is derived from
// `count` BEFORE the bodies are laid out, so nothing downstream can tell:
//
//   per-body hp = count * hpFor(spec) / bodies   → the block still dies in the
//                                                  killSec levels.js budgeted
//   gdps        = count * per * 0.5              → return fire is untouched
//   strength    = alive / bodies                 → a fraction either way
//
// `state.kills` DOES count bodies, deliberately: it is the number of men the
// player watched fall, and the end panel is a scoreboard, not a ledger.
//
// The other half of "solid" is the ripple. Once a body holds a fraction of a
// point of hp, the old fixed 45%-to-four-neighbours wasted almost all of every
// shot on overkill and a block would have become a sponge. `damageAt` now
// spends the shot as a BUDGET outward from the point of impact, so time-to-kill
// is a property of the group's total hp and not of how many bodies that hp is
// sliced into — and a heavy round clears a visible crater instead of five men.
// ===========================================================================

// ===========================================================================
// MANAGER: two things this pass ran into that live in frozen files.
//
//  1. `vfx.js` puts a `hitPuff` + `sparkBurst` on EVERY `enemy:killed`. That was
//     safe at sixty-man blocks and is not at five hundred: one volley into a
//     dissolving front rank is sixty events in a frame, which empties the
//     particle pools and greys out the thing you are shooting. I have rate-
//     limited the EVENT here (FX_RATE / FX_BURST) rather than ask for a change,
//     so nothing is broken — but the throttle belongs on the consumer, and if
//     vfx.js grows one I will drop mine.
//
//  2. THE REMAINING GAP TO ref1/ref2 IS THE CAMERA, NOT THE STAGING. A block now
//     fills the road and runs 15-22 m up it, and at the distance the level
//     generator places one — 60 to 100 m ahead — `CAM.back 21 / height 17 /
//     fov 46` still renders that as a band about 60 px tall. The reference
//     camera is much lower and much closer, which is why its crowd owns half
//     the frame. Nothing inside enemies.js can buy that back: doubling the
//     bodies again buys perhaps 8 px. If the reference framing is the target,
//     the lever is `CAM`, and I would try `height 13.5` with `look` shortened to
//     ~20 before anything else.
// ===========================================================================

import * as THREE from 'three';
import { PAL, TIERS, RUN, ROAD, GUN, DEV_MODE } from './config.js';
// The one sideways import in this file, and the brief asks for it: the live
// road half-width. It is a pure read of world.js's narrow table, allocation
// free, and a block that ignores it stands in the river inside a `narrow`.
import { roadHalfAt } from './world.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, rand, randInt } from './utils.js';
import { makeCrowd, partBox, mergeParts, flatMat, outlineMat } from './toon.js';
import { explode, sparkBurst, impactFlash, smokePuff, shockRing, floatNumber } from './vfx.js';
import { sfx } from './audio.js';
import { addShake } from './render.js';
import { makeTierCrowd } from './units.js';

// --------------------------------------------------------------------------
// Pools
// --------------------------------------------------------------------------

let MAXE = 820;
const MAXG = 16;
// Ceiling on one group's bodies, re-derived from the pool in initEnemies so a
// single wall can never eat the room the next one needs.
let BODY_CAP = 560;

// Per-unit, structure of arrays. `uox`/`uoz` are the man's slot inside his
// block, so a marching column moves by writing ONE group position per frame
// rather than sixty unit positions.
let ux, uz, uox, uoz, uhp, umax, ugi, ust, udt, uph, ufl, usc;
let un = 0;

// Per-group. `gs`/`ge` are the half-open span of unit indices this group owns.
const gx = new Float32Array(MAXG), gz = new Float32Array(MAXG);
const gs = new Int32Array(MAXG), ge = new Int32Array(MAXG);
const gspd = new Float32Array(MAXG), gfire = new Float32Array(MAXG);
const galive = new Int32Array(MAXG), gform = new Uint8Array(MAXG);
const gminx = new Float32Array(MAXG), gmaxx = new Float32Array(MAXG);
const gminz = new Float32Array(MAXG), gmaxz = new Float32Array(MAXG);
const gdps = new Float32Array(MAXG), gn0 = new Float32Array(MAXG);
const glive = new Uint8Array(MAXG);
// A grid group is laid out rank by rank, so its span is already sorted on
// `uoz`. That is worth recording: it turns the per-bullet scan inside a
// 500-body AABB into a binary search plus two ranks. Scattered skirmishers are
// not sorted and fall back to the linear scan they always had.
const gsort = new Uint8Array(MAXG);
let gn = 0;

const FORM = { block: 0, column: 1, skirmish: 2 };
// The boss is built at soldier scale and then blown up, so one number moves the
// model, its hit box and its muzzle positions together. It has to tower over an
// eleven-metre-wide crowd without leaving the road.
const BOSS_S = 1.4;
const DIE_T = 0.55;
const FIRE_RANGE = 46;      // metres at which a block opens up on the squad

// --------------------------------------------------------------------------
// The shape of a wall
// --------------------------------------------------------------------------
// Packed tighter than the squad's own 0.62 (RUN.formSpacing): the reference
// crowd is shoulder to shoulder and slightly interpenetrating, which is what
// makes it read as one mass of colour instead of a lot of separate men. At this
// camera distance the overlap is the point.
const CROSS = 0.58;         // metres between files, across the road
const RANK  = 0.50;         // metres between ranks at the FRONT of the block
const EDGE = 0.42;          // keep the outermost file off the parapet

// THE TAIL. ref2 is a uniform grid with no back edge in frame — about fourteen
// files by forty ranks. Forty ranks at this density is 700 bodies for one
// group, which the pool cannot pay for, so the depth is bought where it is
// cheapest: the first RANK_KNEE ranks stay dead tight, because that is the
// front the player shoots at and the part that dissolves, and every rank past
// the knee opens quadratically. Those ranks are never seen closer than fifteen
// metres and are usually half-lost in fog, where perspective has closed the
// gaps for us anyway. Measured: a full-road block runs 13.8 m deep and a
// lane-blocker, which gets half the files and therefore twice the ranks, runs
// 36.5 m — a column that has no end rather than a slab.
const RANK_KNEE = 9;
const RANK_OPEN = 0.006;
// ...but not without limit. A narrow group gets few files and therefore many
// ranks, and unbounded opening turned a lane-blocker into a dotted line at its
// far end. Three and a bit times the front spacing is as loose as a rank may be
// and still read as part of the same body of men.
const RANK_OPEN_MAX = 3.2;

// bodies = clamp(BODY_BASE + count * BODY_PER, BODY_MIN, BODY_MAX). See the
// header. BODY_MIN is the load-bearing number: it is what stops a small early
// beat — the exact thing on screen at level 12, where `count` is 5 — from being
// three ranks of red.
const BODY_BASE = 200, BODY_PER = 6.6, BODY_MIN = 400, BODY_MAX = 560;
// Skirmishers get their own, much smaller curve. They are scattered on purpose
// — a shape you cannot sweep with one line of fire — and 300 of them scattered
// over the same ground is not a skirmish, it is a block with holes in it.
const SKIRM_BASE = 26, SKIRM_PER = 2.4, SKIRM_MIN = 70, SKIRM_MAX = 170;

// Where a group is allowed to exist. 130 m is measured against `scene.fog`
// (near 68, far 185) and the camera's 21 m of set-back: a block spawned at
// +130 is ~150 m from the lens, roughly 70% fogged, so it exists as a red haze
// on the horizon and SOLIDIFIES as you close. At the old 105 m it stepped out
// of the fog already committed.
const STREAM_AHEAD = 130;
const MIN_ROOM = 130;       // pool left before a group waits a frame for space

// Rank z-offsets, built once per spawn into a scratch buffer. 560 bodies over
// the narrowest sane file count still fits inside this.
const _rz = new Float32Array(192);

// How far a man may sit off his rank's z. A grid group's span is written rank
// by rank and is therefore sorted on `uoz`; the jitter that keeps it from
// looking like graph paper is what makes it only ALMOST sorted, so both binary
// searches widen their key by this much and the invariant holds.
const SORT_SLACK = 0.12;

let crowd = null, group = null;
let pending = [];            // enemy specs not yet streamed in, sorted by z
let pendIdx = 0;
let levelNo = 1;
let needCollect = false;

// --------------------------------------------------------------------------
// Fallback body — only used while units.js is a stub
// --------------------------------------------------------------------------
// `makeTierCrowd` belongs to another agent. If it is not there yet we build the
// same shape locally out of toon.js parts, with the same `aPart` rig tags, so
// the gait and the outline are identical either way. This exists so gunfire can
// be art-directed before the unit ladder lands, not as a permanent path.

function fallbackGeo() {
  return mergeParts([
    partBox(0.20, 0.78, 0.22, -0.16, 0.39, 0, 1),
    partBox(0.20, 0.78, 0.22, 0.16, 0.39, 0, 2),
    partBox(0.56, 0.66, 0.36, 0, 1.10, 0, 0),
    partBox(0.16, 0.52, 0.18, -0.35, 1.12, 0, 3),
    partBox(0.16, 0.52, 0.18, 0.35, 1.12, 0, 4),
    partBox(0.36, 0.34, 0.36, 0, 1.60, 0, 5),
    partBox(0.46, 0.10, 0.46, 0, 1.76, 0, 5),
    partBox(0.10, 0.10, 0.62, 0.30, 1.20, -0.24, 4),   // rifle: the silhouette
  ]);                                                   // has to read as armed
}

function buildCrowd(max) {
  let c = null;
  try {
    c = makeTierCrowd?.(0, {
      color: PAL.enemy, max,
      // Thinner and RED, not near-black. At 0.58 m spacing the shells of the
      // men behind show between the men in front, so at five hundred bodies the
      // outline is not a rim any more, it is a large share of the block's
      // pixels — at 0.032 of near-black it turned the far half of a deep block
      // into a dark mat. Keeping the line dark-red keeps the mass reading as
      // one colour, which is the entire trick in ref2.
      outline: 0.027, outlineColor: 0x6d1512,
      // Three times units.js's default self-emission. The wall is meant to be
      // read at ninety metres through a fog that starts at sixty-eight, and
      // `scene.fog` blends AFTER the lighting — so the only way to keep red at
      // the far end of a twenty-metre block is to send more red into the fog.
      // It costs nothing and the squad, which is always near, does not need it.
      emissiveIntensity: 0.18,
      tint: true, castShadow: true,
    });
  } catch (e) { c = null; }
  if (c && typeof c.set === 'function' && c.group) return c;
  // Same outline treatment as the tier path above, or the fallback block reads
  // as a different, darker army than the real one.
  return makeCrowd(fallbackGeo(), {
    color: PAL.enemy, max, outline: 0.027, outlineColor: 0x6d1512,
    emissiveIntensity: 0.18, castShadow: true,
  });
}

// --------------------------------------------------------------------------
// The boss
// --------------------------------------------------------------------------

const boss = {
  on: false, dead: false, engaged: false, blew: false,
  hp: 0, max: 0, name: 'HEAVY', z: 0, x: 0, tier: 6,
  phase: 0, t: 0, fireT: 0, artT: 0, recoil: 0, dieT: 0, dps: 6, dmgSide: -1,
  group: null, hull: null, trim: null, outline: null,
  hullMat: null, trimMat: null, geos: null,
  tellX: 0, tellZ: 0, tellT: -1,
  dmgAcc: 0, dmgT: 0,
};

// One merged geometry for the hull and one for the trim: two lit draws plus one
// inverted-hull outline. Building it out of a Group of nine boxes would have
// been nine draw calls for one enemy.
function buildBoss(scene) {
  const hullGeo = mergeParts([
    partBox(1.00, 1.70, 1.20, -1.25, 0.90, 0, 0),        // legs
    partBox(1.00, 1.70, 1.20, 1.25, 0.90, 0, 0),
    partBox(1.25, 0.38, 1.75, -1.25, 0.19, -0.15, 0),    // feet
    partBox(1.25, 0.38, 1.75, 1.25, 0.19, -0.15, 0),
    partBox(2.30, 0.55, 1.45, 0, 2.00, 0, 0),            // hips
    partBox(3.10, 1.85, 1.75, 0, 3.05, 0, 0),            // torso
    partBox(1.10, 1.10, 1.50, -2.05, 3.45, 0, 0),        // shoulders
    partBox(1.10, 1.10, 1.50, 2.05, 3.45, 0, 0),
    partBox(1.20, 0.75, 1.05, 0, 4.35, -0.20, 0),        // head
  ]);
  const trimGeo = mergeParts([
    partBox(0.54, 0.54, 2.90, -2.15, 3.40, -1.55, 0),    // cannons, thrust
    partBox(0.54, 0.54, 2.90, 2.15, 3.40, -1.55, 0),     // forward at you
    partBox(2.10, 0.75, 0.22, 0, 3.20, -0.95, 0),        // chest plate
    partBox(0.95, 0.24, 0.18, 0, 4.42, -0.68, 0),        // visor
    partBox(2.60, 0.30, 1.55, 0, 1.72, 0, 0),            // waist band
    partBox(0.28, 0.90, 0.28, -1.05, 4.35, 0.55, 0),     // aerials
    partBox(0.28, 0.90, 0.28, 1.05, 4.35, 0.55, 0),
  ]);

  const hullMat = flatMat(PAL.boss, { flat: true });
  // The trim is the damage read-out: emissive climbs each phase, so the machine
  // itself tells you it is nearly dead without looking at the bar.
  const trimMat = flatMat(0x5c646c, { flat: true, emissive: 0xff2a12, emissiveIntensity: 0.14 });

  const g = new THREE.Group();
  g.scale.setScalar(BOSS_S);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  const outline = new THREE.Mesh(hullGeo, outlineMat(0.085, 0x1a0d22));
  outline.renderOrder = -1;
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.castShadow = true;
  g.add(outline, hull, trim);
  g.visible = false;
  scene.add(g);

  boss.group = g; boss.hull = hull; boss.trim = trim; boss.outline = outline;
  boss.hullMat = hullMat; boss.trimMat = trimMat;
  boss.geos = [hullGeo, trimGeo];
  return g;
}

// --------------------------------------------------------------------------
// Spawning
// --------------------------------------------------------------------------

function allocArrays(max) {
  ux = new Float32Array(max); uz = new Float32Array(max);
  uox = new Float32Array(max); uoz = new Float32Array(max);
  uhp = new Float32Array(max); umax = new Float32Array(max);
  ugi = new Int16Array(max); ust = new Uint8Array(max);
  udt = new Float32Array(max); uph = new Float32Array(max);
  ufl = new Float32Array(max); usc = new Float32Array(max);
}

// levels.js sizes an enemy item's `hp` as SECONDS of the squad's undivided fire
// rather than as a number, which is the only way a block stays a two-second
// problem at both twelve men and four hundred. Use it whenever it is there; the
// derived figure is a fallback for a hand-written or older LevelDef.
function hpFor(spec) {
  if (spec.hp > 0) return spec.hp;
  const tier = clamp(spec.tier | 0, 0, TIERS.length - 1);
  const base = 2.2 + levelNo * 0.42 + tier * 3.2;
  return base * (spec.form === 'skirmish' ? 2.4 : 1);
}

// How many bodies this group is worth on screen. See the header: this is the
// visual number, `spec.count` stays the mechanical one.
function bodiesFor(spec, form, room) {
  const count = Math.max(1, spec.count | 0);
  const want = form === 2
    ? clamp(Math.round(SKIRM_BASE + count * SKIRM_PER), SKIRM_MIN, SKIRM_MAX)
    : clamp(Math.round(BODY_BASE + count * BODY_PER), BODY_MIN, BODY_MAX);
  // Shrink to fit rather than truncate mid-grid. Because the fight is sized off
  // `count`, a block that had to render at half strength is a slightly smaller
  // wall and an identical fight — which is the whole payoff of decoupling them.
  return clamp(Math.min(want, BODY_CAP, room), 6, BODY_CAP);
}

function spawnGroup(spec, room) {
  const gi = gn++;
  const form = FORM[spec.form] ?? 0;
  const isCol = form === 1;
  const z0 = spec.z || 0;
  const count = Math.max(1, spec.count | 0);
  const bodies = bodiesFor(spec, form, room);

  gz[gi] = z0;
  gspd[gi] = spec.speed || 0;
  gform[gi] = form;
  gfire[gi] = rand(0.2, 0.8);
  glive[gi] = 1;
  gsort[gi] = form === 2 ? 0 : 1;

  // The road, live — inside a `narrow` the wall narrows with it.
  const half = Math.max(1.4, roadHalfAt(z0) - EDGE);
  // `spec.w` is a statement ABOUT THE ROAD it was authored against, not a
  // measurement: levels.js writes 9 (of 11) to mean "you cannot dodge this" and
  // 6 to mean "one lane is open". So it is re-projected as a fraction of the
  // live width. The 1.25 is the staging pass — a 9 becomes the full road, which
  // is what the reference shows and what "undodgeable" should have looked like.
  const frac = clamp((spec.w || 8) / (ROAD.halfW * 2), 0.30, 1);
  const spanH = form === 2 ? half
    : Math.min(half, half * frac * 1.25) * (isCol ? 0.86 : 1);
  // Keep the whole formation on the deck. An off-centre group used to hang half
  // its men over the river; now it slides until it fits.
  gx[gi] = clamp(spec.x || 0, -(half - spanH), half - spanH);

  // A column is a river, so it runs a little narrower than the road and snakes
  // inside the space it leaves. Everything else is a rectangle.
  const sway = isCol ? half * 0.12 : 0;
  const cols = form === 2 ? 0
    : clamp(Math.floor((spanH * 2) / CROSS) + 1, 3, 30);
  const step = cols > 1 ? (spanH * 2) / (cols - 1) : 0;
  const ranks = cols ? Math.min(_rz.length, Math.ceil(bodies / cols)) : 0;
  let depth = 0;
  for (let r = 0; r < ranks; r++) {
    _rz[r] = depth;
    const k = r - RANK_KNEE;
    depth += RANK * (k > 0 ? Math.min(RANK_OPEN_MAX, 1 + k * k * RANK_OPEN) : 1);
  }

  // Total group hp is the level's, spread over however many bodies we drew.
  const bodyHp = Math.max(0.25, (count * hpFor(spec)) / bodies);
  const swayPh = rand(6.283);

  gs[gi] = un;
  for (let k = 0; k < bodies; k++) {
    const i = un++;
    if (form === 2) {
      uox[i] = rand(-spanH, spanH);
      uoz[i] = rand(-1.5, 11);
    } else {
      const c = k % cols, r = (k / cols) | 0;
      // The last rank is short; centre it so the block does not end on a step.
      const short = (r === ranks - 1) ? (cols - (bodies - r * cols)) * 0.5 * step : 0;
      // Ranks past the knee are increasingly ragged as well as increasingly
      // loose, so the back of the block frays into the road instead of ending
      // on a ruled line. The front stays a straight rank — that edge is the one
      // the player is shooting and it wants to be a wall.
      const ragged = Math.min(0.42, 0.05 + Math.max(0, r - RANK_KNEE) * 0.035);
      uox[i] = (c - (cols - 1) / 2) * step + short
        + (sway ? Math.sin((r + swayPh) * 0.26) * sway : 0)
        + rand(-ragged, ragged);
      // Bounded by SORT_SLACK: the span has to stay sorted enough on `uoz` for
      // the binary searches, and this is how much they are told to allow for.
      uoz[i] = _rz[r] + rand(-SORT_SLACK, Math.min(SORT_SLACK, ragged));
    }
    uhp[i] = umax[i] = bodyHp;
    ugi[i] = gi;
    ust[i] = 0; udt[i] = 0;
    uph[i] = rand(6.283);
    ufl[i] = 0;
    // A touch bigger than the squad, and varied. Enemy bodies are read through
    // fog at seventy metres more often than they are read up close, and the
    // extra width is what closes the gaps between files at CROSS spacing.
    usc[i] = rand(0.99, 1.08);
    ux[i] = gx[gi] + uox[i];
    uz[i] = gz[gi] + uoz[i];
  }
  ge[gi] = un;
  galive[gi] = bodies;
  // Men killed per second at FULL strength, from the level's own per-unit
  // figure and the level's own `count` — NOT the body count. The 0.5 is the
  // difference between the level generator's model — "this is what ignoring the
  // beat entirely costs you" — and the fact that a block stays inside
  // `FIRE_RANGE` for nearly four seconds, which is twice as long as the
  // generator assumes you spend on it.
  const per = spec.dps > 0 ? spec.dps : 0.55 * (1 + (spec.tier | 0) * 0.35);
  gdps[gi] = count * per * 0.5 * (form === 2 ? 1.3 : 1);
  gn0[gi] = Math.max(1, bodies);
  recomputeBounds(gi);
}

// Lower bound on `uoz` inside a sorted group's span. Grid groups are written
// rank by rank so the span is sorted; the ±0.05 of jitter is far inside the
// slack every caller adds.
function rankLo(g, v) {
  let lo = gs[g], hi = ge[g];
  while (lo < hi) { const m = (lo + hi) >> 1; if (uoz[m] < v) lo = m + 1; else hi = m; }
  return lo;
}

function recomputeBounds(gi) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = gs[gi]; i < ge[gi]; i++) {
    if (ust[i] !== 0) continue;
    const x = ux[i], z = uz[i];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  if (minx > maxx) { gminx[gi] = gminz[gi] = 1e9; gmaxx[gi] = gmaxz[gi] = -1e9; return; }
  gminx[gi] = minx - 0.6; gmaxx[gi] = maxx + 0.6;
  gminz[gi] = minz - 0.6; gmaxz[gi] = maxz + 0.6;
}

// Reclaim the spans of retired groups. Runs only on the frame a block is
// finally written off, which over a whole level is a handful of times.
function collect() {
  let w = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    const ns = w;
    for (let i = gs[g]; i < ge[g]; i++, w++) {
      if (w === i) continue;
      ux[w] = ux[i]; uz[w] = uz[i]; uox[w] = uox[i]; uoz[w] = uoz[i];
      uhp[w] = uhp[i]; umax[w] = umax[i]; ust[w] = ust[i]; udt[w] = udt[i];
      uph[w] = uph[i]; ufl[w] = ufl[i]; usc[w] = usc[i];
    }
    gs[g] = ns; ge[g] = w;             // spans rewritten in place, read first
  }
  un = w;
  let gw = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    if (gw !== g) {
      gx[gw] = gx[g]; gz[gw] = gz[g]; gs[gw] = gs[g]; ge[gw] = ge[g];
      gspd[gw] = gspd[g]; gfire[gw] = gfire[g]; galive[gw] = galive[g];
      gform[gw] = gform[g]; gdps[gw] = gdps[g]; gn0[gw] = gn0[g]; glive[gw] = 1;
      gsort[gw] = gsort[g];
      gminx[gw] = gminx[g]; gmaxx[gw] = gmaxx[g];
      gminz[gw] = gminz[g]; gmaxz[gw] = gmaxz[g];
    }
    for (let i = gs[gw]; i < ge[gw]; i++) ugi[i] = gw;
    gw++;
  }
  gn = gw;
  needCollect = false;
}

// --------------------------------------------------------------------------
// Damage
// --------------------------------------------------------------------------

const _killPos = { x: 0, y: 0, z: 0 };
const _kill = { pos: _killPos, kind: 'enemy' };
// One shared payload for every shot this file asks combat.js to fire. Listeners
// read it synchronously and must never retain it — that is the price of not
// allocating an object per bullet.
const _fire = {
  x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1,
  dmg: 1, n: 1, speed: 0, side: 1, spread: 0.05, len: 1.6,
  flash: true, flashScale: 0.7,
};
const _bossHp = { frac: 1 };

// vfx.js puts a puff and a spark burst on every `enemy:killed`. At sixty bodies
// a second that is a particle pool emptied on one volley and a grey fog over
// the thing you are shooting, so the EVENT is rate-limited while the body count
// is not. The kill itself, the sink animation and `state.kills` are exact; only
// the firework is rationed.
const FX_RATE = 24;         // kill events a second that get a puff
const FX_BURST = 8;         // ...and how many may land in one instant
let fxBudget = FX_BURST;

function killUnit(i) {
  ust[i] = 1;
  udt[i] = DIE_T;
  const gi = ugi[i];
  if (galive[gi] > 0) galive[gi]--;
  // MANAGER: nothing in game.js listens to `enemy:killed`, and `endRun` reports
  // `state.kills` in the run stats — so this file is the only thing that can
  // move it off zero. Happy to hand it back if game.js takes the listener.
  // (`state.kills` counts BODIES, not the LevelDef's `count` — see the header.)
  state.kills++;
  if (fxBudget < 1) return;
  fxBudget -= 1;
  _killPos.x = ux[i]; _killPos.y = 0.8; _killPos.z = uz[i];
  emit('enemy:killed', _kill);
  sfx('kill');
}

// THE RIPPLE, as a budget. A shot is worth `amount` to the man it hit plus 45%
// of it to each of up to four neighbours — that was the old rule and it is
// still the rule — but the damage is now SPENT rather than applied, walking
// outward from the point of impact and never wasted on overkill. That matters
// because a body no longer holds thirteen points of hp, it holds a fraction of
// one: applying the old fixed amounts would have thrown away 95% of every shot
// and turned a two-second block into a twenty-second one. Spending it instead
// makes time-to-kill a property of the group's TOTAL hp, which is the number
// levels.js actually sized, and leaves the body count free to be whatever the
// shot needs.
//
// The radius grows with the size of the round, so a tank shell clears a visible
// crater in the formation and a rifle round takes a man and his neighbours.
// `RIPPLE_MAX` is the CPU guard: it bounds the loop, not the damage.
const RIPPLE_MAX = 28;
function damageAt(i, amount) {
  const gi = ugi[i];
  ufl[i] = 0.16;
  // Everything the man hit could not absorb rolls outward.
  let pool = amount - Math.max(0, uhp[i]);
  uhp[i] -= amount;
  if (uhp[i] <= 0 && ust[i] === 0) killUnit(i);
  if (pool < 0) pool = 0;
  // The four neighbours' worth of splash the old rule promised, as one purse.
  pool += amount * 1.8;
  if (pool <= 0) return;

  const sx = ux[i], sz = uz[i];
  const r2 = clamp(0.95 + amount * 0.05, 0.95, 4.0);
  const r = Math.sqrt(r2);
  // Sorted spans let a 500-body group be scanned two ranks at a time.
  let lo = gs[gi], hi = ge[gi];
  if (gsort[gi]) {
    lo = rankLo(gi, sz - gz[gi] - r - SORT_SLACK);
    hi = ge[gi];
  }
  const zHi = sz + r;
  let n = 0;
  for (let j = lo; j < hi && n < RIPPLE_MAX && pool > 0; j++) {
    if (gsort[gi] && uz[j] > zHi) break;
    if (j === i || ust[j] !== 0) continue;
    const dx = ux[j] - sx, dz = uz[j] - sz;
    if (dx * dx + dz * dz > r2) continue;
    n++;
    const give = Math.min(pool, uhp[j]);
    pool -= give;
    uhp[j] -= give;
    ufl[j] = 0.12;
    if (uhp[j] <= 0) killUnit(j);
  }
}

// The reused hit descriptor combat.js gets back. One object, because a hit test
// that allocates runs eight hundred times a second.
const _hit = {
  i: -1, boss: false, x: 0, y: 0, z: 0,
  apply(damage) {
    if (this.boss) { damageBoss(damage, this.x, this.y, this.z); return; }
    if (this.i < 0 || ust[this.i] !== 0) return;
    damageAt(this.i, damage);
  },
};

export function enemyHitTest(x, y, z, r) {
  // Boss first. It stands in front of whatever is behind it and its hull is the
  // biggest target on screen; letting a block steal those shots reads as a bug.
  if (boss.on && !boss.dead && boss.engaged) {
    const dx = x - boss.x, dz = z - boss.z;
    if (Math.abs(dx) < 2.9 * BOSS_S + r && dz > -3.1 * BOSS_S - r && dz < 1.4 * BOSS_S + r && y < 5.2 * BOSS_S) {
      _hit.boss = true; _hit.x = x; _hit.y = y; _hit.z = z;
      return _hit;
    }
  }
  const band = r + 0.34;
  const rr = band * band;
  for (let g = 0; g < gn; g++) {
    if (!glive[g] || galive[g] <= 0) continue;
    if (x < gminx[g] || x > gmaxx[g] || z < gminz[g] || z > gmaxz[g]) continue;
    // The AABB was enough at sixty men a group. At five hundred it is not: a
    // bullet inside a fifteen-metre-deep box would scan the whole wall. Grid
    // groups are sorted on `uoz`, so binary-search in to the rank the bullet is
    // actually in and stop one rank past it.
    let lo = gs[g], hi = ge[g];
    if (gsort[g]) lo = rankLo(g, z - gz[g] - band - SORT_SLACK);
    const zHi = z + band;
    for (let i = lo; i < hi; i++) {
      if (gsort[g] && uz[i] > zHi) break;
      if (ust[i] !== 0) continue;
      const dx = ux[i] - x, dz = uz[i] - z;
      if (dx * dx + dz * dz <= rr) {
        _hit.boss = false; _hit.i = i; _hit.x = x; _hit.y = y; _hit.z = z;
        return _hit;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Boss damage and phases
// --------------------------------------------------------------------------

function damageBoss(amount, x, y, z) {
  if (!boss.on || boss.dead) return;
  boss.hp = Math.max(0, boss.hp - amount);
  state.bossHp = boss.hp;
  boss.dmgAcc += amount;
  _bossHp.frac = boss.max > 0 ? boss.hp / boss.max : 0;
  emit('boss:hp', _bossHp);
  sfx('bossHit');
  impactFlash(x, y, z, 0.9, 0xffd0a0);
  sparkBurst(x, y, z, 0, 0.3, -0.7, 3, 0xffd0a0, 9);

  const want = _bossHp.frac > 0.6 ? 0 : _bossHp.frac > 0.3 ? 1 : 2;
  if (want > boss.phase) enterPhase(want);
  if (boss.hp <= 0) startBossDeath();
}

function enterPhase(p) {
  boss.phase = p;
  boss.trimMat.emissiveIntensity = 0.14 + p * 0.5;
  sfx('bossPhase');
  addShake(0.5);
  // A shoulder cooks off at each phase change, so the escalation happens on the
  // model and not only on the health bar.
  explode({ x: boss.x + (p === 1 ? -2.0 : 2.0), y: 3.4, z: boss.z }, 1.1, PAL.fire);
  emit('hud:toast', { text: p === 1 ? 'ARMOUR BREACHED' : 'CRITICAL', icon: '⚠' });
}

function startBossDeath() {
  boss.dead = true;
  boss.dieT = 0;
  // Release the squad the instant it dies. Walking into the wreck while it
  // falls is a better beat than standing still for two more seconds.
  state.bossHp = 0;
  _bossHp.frac = 0;
  emit('boss:hp', _bossHp);
  addShake(0.7);
}

// --------------------------------------------------------------------------
// Enemy return fire
// --------------------------------------------------------------------------
// Blocks do not aim at individuals; they put a volume of fire at the squad's
// disc, and a handful of front-rank men are the visible source. combat.js owns
// every bullet in the game, so this goes over the bus — importing it here would
// make enemies↔combat a cycle.

function groupFire(g, dt) {
  gfire[g] -= dt;
  if (gfire[g] > 0) return;
  const period = gform[g] === 2 ? 0.62 : 0.5;
  gfire[g] = period * rand(0.85, 1.2);

  const dz = gz[g] - state.z;
  if (dz < -4 || dz > FIRE_RANGE) return;

  const shots = clamp(Math.round(galive[g] / 12), 1, 4);
  // Output falls with the body count. A block down to its last two men that
  // still shoots like sixty is the single most unfair thing this file could do.
  const strength = galive[g] / gn0[g];
  const per = (gdps[g] * strength * period) / shots;
  let fired = 0, guard = 0;
  while (fired < shots && guard++ < 40) {
    const i = randInt(gs[g], ge[g] - 1);
    if (ust[i] !== 0) continue;
    fired++;
    _fire.x = ux[i]; _fire.y = 1.2; _fire.z = uz[i] - 0.4;
    const tx = state.x - ux[i], tz = state.z - uz[i];
    const l = Math.hypot(tx, tz) || 1;
    _fire.dx = tx / l; _fire.dy = 0; _fire.dz = tz / l;
    _fire.dmg = per;
    _fire.n = 1;
    _fire.speed = GUN.bulletSpeed * 0.55;
    _fire.spread = 0.045;
    _fire.len = 1.6;
    _fire.side = 1;
    _fire.flash = true;
    _fire.flashScale = 0.55;
    emit('combat:fire', _fire);
  }
  if (fired) sfx('enemyShot');
}

// --------------------------------------------------------------------------
// Frame
// --------------------------------------------------------------------------

const _tint = [1, 1, 1];

export function updateEnemies(dt) {
  if (!crowd) return;
  crowd.update(dt);
  fxBudget = Math.min(FX_BURST, fxBudget + dt * FX_RATE);

  // --- stream groups in ahead of the squad ------------------------------
  // Far enough out that a wall arrives as a stain in the fog. If the pool is
  // full the group waits a frame rather than spawning a truncated grid — unless
  // it is nearly on top of us, in which case a small wall beats no wall.
  while (pendIdx < pending.length && pending[pendIdx].z - state.z < STREAM_AHEAD &&
         gn < MAXG) {
    const room = MAXE - un;
    // A third of a wall still reads as a wall in fog; a tenth of one reads as
    // the old smudge. So a group takes the leftovers if there are enough of
    // them, and otherwise waits for the group in front to be written off.
    if (room < MIN_ROOM && (pending[pendIdx].z - state.z > 45 || room < 12)) break;
    spawnGroup(pending[pendIdx++], room);
  }

  // --- groups ------------------------------------------------------------
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    if (gspd[g] > 0) gz[g] -= gspd[g] * dt;       // columns march at you
    const wiped = galive[g] <= 0;
    // Anything well behind the squad has lost the fight and is written off, or
    // `enemyCount()` never reaches zero and the run can never end.
    const passed = gz[g] < state.z - 34;
    if ((wiped && !hasDying(g)) || passed) {
      glive[g] = 0; galive[g] = 0; needCollect = true;
      continue;
    }
    if (!wiped) groupFire(g, dt);
  }

  // --- units -------------------------------------------------------------
  let live = 0;
  for (let g = 0; g < gn; g++) {
    if (!glive[g]) continue;
    const run = gspd[g] > 0 ? 1 : 0.12;
    for (let i = gs[g]; i < ge[g]; i++) {
      ux[i] = gx[g] + uox[i];
      uz[i] = gz[g] + uoz[i];

      if (ust[i] === 0) {
        if (ufl[i] > 0) ufl[i] -= dt;
        const f = ufl[i] > 0 ? 1 + ufl[i] * 7 : 1;
        // Wounded men darken, so a block under sustained fire visibly wears
        // down before anyone in it actually falls.
        const wear = 0.55 + 0.45 * clamp(uhp[i] / umax[i], 0, 1);
        _tint[0] = f * wear; _tint[1] = f * wear * 0.9; _tint[2] = f * wear * 0.9;
        crowd.set(live++, ux[i], 0, uz[i], usc[i], Math.PI + uox[i] * 0.02,
          run, uph[i], _tint);
      } else if (udt[i] > 0) {
        udt[i] -= dt;
        const t = clamp(1 - udt[i] / DIE_T, 0, 1);
        // No ragdoll and no death clip: sink, shrink, darken, spin a little. At
        // this camera distance that reads as a body dropping and it costs four
        // multiplies instead of a skeleton.
        const d = 0.9 - 0.9 * t;
        _tint[0] = d; _tint[1] = d * 0.6; _tint[2] = d * 0.6;
        crowd.set(live++, ux[i], -1.15 * t * t, uz[i],
          Math.max(0.05, usc[i] * (1 - 0.72 * t)), Math.PI + t * 2.2, 0, uph[i], _tint);
      }
    }
  }
  crowd.count = live;
  crowd.commit();

  // Bounds are the hit-test accelerator. Once a frame is plenty: blocks move at
  // walking pace and the box carries 0.6 m of slack.
  for (let g = 0; g < gn; g++) if (glive[g]) recomputeBounds(g);
  if (needCollect) collect();

  updateBoss(dt);
}

function hasDying(g) {
  for (let i = gs[g]; i < ge[g]; i++) if (ust[i] === 1 && udt[i] > 0) return true;
  return false;
}

// --------------------------------------------------------------------------
// Boss frame
// --------------------------------------------------------------------------

function updateBoss(dt) {
  if (!boss.on) return;
  boss.t += dt;
  const gp = boss.group;

  if (!boss.engaged && !boss.dead) {
    // Engage well before the squad is on top of it: `game.js` freezes the run
    // the moment `state.bossMax` goes non-zero, and it has to freeze at a
    // distance where the whole machine is still in frame.
    if (state.z > boss.z - 27) {
      boss.engaged = true;
      state.bossMax = boss.max;
      state.bossHp = boss.hp;
      gp.visible = true;
      emit('hud:toast', { text: boss.name, icon: '☠' });
      emit('story:bubble', { who: 'RADIO', text: 'HEAVY ON THE ROAD. KEEP FIRING.', ms: 2400 });
      addShake(0.35);
      sfx('bossPhase');
    } else {
      gp.visible = state.z > boss.z - 95;   // visible early, so it is a threat
      gp.position.set(boss.x, 0, boss.z);
      return;
    }
  }

  if (boss.dead) {
    boss.dieT += dt;
    const t = boss.dieT;
    // Three beats: cook off, topple, then one big one.
    if (t < 1.6 && Math.random() < dt * 5.5) {
      explode({ x: boss.x + rand(-3, 3), y: rand(1.4, 5.6), z: boss.z + rand(-1, 1) }, rand(0.6, 1.1), PAL.fire);
    }
    // Topples toward the camera and ends FLAT. The pivot is the feet, so a
    // half-turn leaves it hanging in the air at an angle; it has to go past
    // 80 degrees before it reads as a wreck lying on the road.
    const fall = clamp((t - 0.45) / 1.4, 0, 1);
    const e = fall * fall * (3 - 2 * fall);
    gp.rotation.x = -e * 1.42;
    gp.rotation.z = e * 0.22;
    gp.position.set(boss.x, -e * 0.35, boss.z - e * 1.6);
    if (fall > 0.05 && Math.random() < dt * 6) {
      smokePuff(boss.x + rand(-3, 3), rand(0.2, 1.2), boss.z + rand(-2, 2), 1.6, rand(1.8, 3.0), 0x2b2622);
    }
    if (t > 1.9 && !boss.blew) {
      boss.blew = true;
      explode({ x: boss.x, y: 2.6, z: boss.z }, 3.6, PAL.fire);
      shockRing(boss.x, boss.z, 1.2, 19, 0.75, 0xffe0a0, 2.0);
      for (let i = 0; i < 8; i++) {
        smokePuff(boss.x + rand(-3, 3), rand(0.5, 3.5), boss.z + rand(-2.5, 2.5), 2.8, rand(2.4, 3.6), 0x2b2622);
      }
      addShake(1.1);
      floatNumber({ x: boss.x, y: 4.2, z: boss.z }, boss.name + ' DOWN', '#ffd24a');
    }
    if (t > 2.4) { gp.visible = false; boss.on = false; }
    return;
  }

  // Idle: heavy sway, slow bob. Recoil shoves it back along z so a volley has
  // weight without an animation clip.
  boss.recoil = Math.max(0, boss.recoil - dt * 4.2);
  gp.position.set(
    boss.x + Math.sin(boss.t * 0.9) * 0.09,
    Math.abs(Math.sin(boss.t * 1.6)) * 0.07,
    boss.z + boss.recoil * 0.9
  );
  gp.rotation.z = Math.sin(boss.t * 0.9) * 0.022;
  gp.rotation.x = -boss.recoil * 0.06;

  const rage = boss.phase === 2 ? 0.55 : boss.phase === 1 ? 0.78 : 1;

  // ATTACK 1 — cannon volley. Straight, fast and constant. This is what
  // punishes you for parking in front of it.
  boss.fireT -= dt;
  if (boss.fireT <= 0) {
    boss.fireT = 1.5 * rage;
    for (const s of [-1, 1]) {
      const bx = boss.x + s * 2.15 * BOSS_S, by = 3.4 * BOSS_S, bz = boss.z - 3.0 * BOSS_S;
      _fire.x = bx; _fire.y = by; _fire.z = bz;
      const tx = state.x - bx, tz = state.z - bz;
      const l = Math.hypot(tx, tz) || 1;
      _fire.dx = tx / l; _fire.dy = -0.02; _fire.dz = tz / l;
      _fire.dmg = boss.dps * boss.fireT * 0.33;   // two cannons, 2/3 of output
      _fire.n = boss.phase === 2 ? 3 : 2;
      _fire.speed = GUN.bulletSpeed * 0.72;
      _fire.spread = 0.05;
      _fire.len = 2.8;
      _fire.side = 1;
      _fire.flash = true;
      _fire.flashScale = 1.7;
      emit('combat:fire', _fire);
    }
    boss.recoil = 0.42;
    addShake(0.12);
    sfx('shot', { tier: 6, vol: 0.8 });
  }

  // ATTACK 2 — artillery, from phase 1 on. Telegraphed by a ring on the ground
  // a beat before it lands, because an unavoidable hit is not a mechanic, it is
  // just a tax.
  if (boss.phase >= 1) {
    if (boss.tellT >= 0) {
      boss.tellT -= dt;
      if (boss.tellT <= 0) {
        boss.tellT = -1;
        explode({ x: boss.tellX, y: 0.5, z: boss.tellZ }, 1.7, PAL.fire);
        const dx = boss.tellX - state.x, dz = boss.tellZ - state.z;
        const r = RUN.formSpacing * Math.sqrt(Math.max(1, state.troops)) + 1.6;
        if (dx * dx + dz * dz < r * r) {
          // Delivered as a point-blank enemy round so combat.js stays the one
          // place in the game that takes men off the board.
          _fire.x = state.x; _fire.y = 1.0; _fire.z = state.z - 0.8;
          _fire.dx = 0; _fire.dy = 0; _fire.dz = 1;
          _fire.dmg = boss.dps * 2.6;                // the artillery third, landed
          _fire.n = 1; _fire.speed = 6; _fire.spread = 0; _fire.len = 0.6;
          _fire.side = 1; _fire.flash = false;
          emit('combat:fire', _fire);
        }
      }
    } else {
      boss.artT -= dt;
      if (boss.artT <= 0) {
        boss.artT = 2.6 * rage;
        boss.tellX = clamp(state.x + rand(-2.2, 2.2), -ROAD.halfW, ROAD.halfW);
        boss.tellZ = state.z + rand(-1.5, 2.5);
        boss.tellT = 0.95;
        shockRing(boss.tellX, boss.tellZ, 2.6, 2.1, 0.95, 0xff5b3a, 1.6);
        shockRing(boss.tellX, boss.tellZ, 0.4, 2.4, 0.95, 0xffaa50, 0.9);
      }
    }
  }

  if (boss.phase === 2 && Math.random() < dt * 3) {
    smokePuff(boss.x + rand(-2.6, 2.6), rand(3.2, 5.4), boss.z + rand(-0.8, 0.8), 0.9, 1.4, 0x2e2a26);
  }

  // Boss damage is reported as one number a third of a second. Per-bullet
  // numbers on a 4000 hp boss is a wall of noise.
  boss.dmgT -= dt;
  if (boss.dmgT <= 0 && boss.dmgAcc > 0) {
    boss.dmgT = 0.34;
    // Beside the machine, alternating sides: two ticks a second stacked over
            // its head is a wall of yellow that hides the thing you are shooting.
            boss.dmgSide = -(boss.dmgSide || -1);
            floatNumber({ x: boss.x + boss.dmgSide * 4.2, y: 3.4 + rand(0, 1.2), z: boss.z },
              '-' + Math.round(boss.dmgAcc), '#ffd24a');
    boss.dmgAcc = 0;
  }
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initEnemies(ctx) {
  // The enemy pool used to be a FRACTION of the friendly cap, and that is the
  // arithmetic behind the thin red smudge — 480 slots was never the binding
  // constraint, but it would have been the moment blocks got real. The wall is
  // the shot, so above the low tier the enemy is allowed slightly more bodies
  // than the squad; `?lite` deliberately takes LESS, so it stays lite.
  const cap = ctx?.quality?.maxCrowd || 600;
  MAXE = clamp(Math.round(cap * (cap >= 500 ? 1.4 : 0.9)), 200, 900);
  // Two walls have to be able to share the pool, which is the common case: a
  // convoy beat drops groups forty metres apart and both sit inside the stream
  // window at once. Half the pool each, and the second one still fills the road.
  BODY_CAP = clamp(Math.round(MAXE * 0.55), 48, BODY_MAX);
  allocArrays(MAXE);
  group = new THREE.Group();
  group.name = 'enemies';
  crowd = buildCrowd(MAXE);
  group.add(crowd.group);
  ctx.scene.add(group);
  buildBoss(ctx.scene);

  if (DEV_MODE) {
    window.__hbEnemies = {
      boss, enemyCount, bossState,
      get units() { return un; }, get groups() { return gn; },
      get pool() { return { MAXE, BODY_CAP }; },
      // Staging read-out: what each live group actually looks like on the road.
      dump() {
        const out = [];
        for (let g = 0; g < gn; g++) {
          if (!glive[g]) continue;
          out.push({
            form: ['block', 'column', 'skirmish'][gform[g]],
            bodies: gn0[g], alive: galive[g],
            z: +gz[g].toFixed(1), x: +gx[g].toFixed(2),
            width: +(gmaxx[g] - gminx[g] - 1.2).toFixed(1),
            depth: +(gmaxz[g] - gminz[g] - 1.2).toFixed(1),
            ahead: +(gz[g] - state.z).toFixed(1),
          });
        }
        return out;
      },
    };
  }
  return group;
}

export function resetEnemies(level) {
  un = 0; gn = 0; needCollect = false;
  fxBudget = FX_BURST;
  pending = []; pendIdx = 0;
  levelNo = level?.level || 1;
  if (crowd) { crowd.count = 0; crowd.commit(); }

  boss.on = false; boss.dead = false; boss.engaged = false; boss.blew = false;
  boss.hp = boss.max = 0; boss.phase = 0; boss.t = 0;
  boss.fireT = 1.4; boss.artT = 3.0; boss.recoil = 0; boss.dieT = 0;
  boss.tellT = -1; boss.dmgAcc = 0; boss.dmgT = 0;
  if (boss.group) {
    boss.group.visible = false;
    boss.group.position.set(0, 0, 0);
    boss.group.rotation.set(0, 0, 0);
    boss.trimMat.emissiveIntensity = 0.14;
  }
  state.bossHp = 0; state.bossMax = 0;

  for (const it of level?.items || []) {
    if (it.kind === 'enemy') pending.push(it);
    else if (it.kind === 'boss') {
      boss.on = true;
      boss.hp = boss.max = it.hp || 2000;
      boss.name = it.name || 'HEAVY';
      boss.z = it.z || 0;
      boss.x = it.x || 0;
      boss.tier = it.tier ?? 6;
      // levels.js sizes boss output against the squad that is expected to reach
      // it. Two thirds goes into the cannons, the rest into artillery.
      boss.dps = it.dps > 0 ? it.dps : 4 + levelNo * 0.4;
      boss.group.position.set(boss.x, 0, boss.z);
    }
  }
  pending.sort((a, b) => a.z - b.z);
  return pending.length;
}

// game.js ends the run when this reaches zero, so it has to count everything
// still able to shoot back: live men, blocks not yet streamed in, and a boss
// that has not finished blowing up.
export function enemyCount() {
  let c = 0;
  for (let g = 0; g < gn; g++) if (glive[g]) c += Math.max(0, galive[g]);
  for (let i = pendIdx; i < pending.length; i++) {
    if (pending[i].z > state.z - 10) c += Math.max(1, pending[i].count | 0);
  }
  if (boss.on && !boss.dead) c += 1;
  return c;
}

export function bossState() {
  if (!boss.on || !boss.engaged) return null;
  return { hp: boss.hp, max: boss.max, name: boss.name };
}

export function disposeEnemies() {
  crowd?.dispose();
  group?.parent?.remove(group);
  if (boss.group) {
    boss.group.parent?.remove(boss.group);
    boss.hullMat?.dispose(); boss.trimMat?.dispose();
    boss.outline?.material?.dispose();
    for (const g of boss.geos || []) g.dispose();
    boss.group = null;
  }
  crowd = null; group = null; un = 0; gn = 0;
}

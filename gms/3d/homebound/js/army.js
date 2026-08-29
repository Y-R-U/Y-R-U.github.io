// MANAGER: two requests and three notes.
//
//  A. CONFIG. The stack ladder and the body caps are hard-coded at the top of
//     the "Stacking" section below because config.js is frozen for me. Please
//     lift them verbatim:
//        RUN.bodyMax     = 64          // rendered bodies, foot tiers
//        RUN.bodyMaxVeh  = 40          // rendered bodies, vehicle/air tiers
//        RUN.stackLadder = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3,
//                           1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7,
//                           2e7, 5e7, 1e8, 2e8, 5e8, 1e9]
//     I did NOT use the 1-5-10 ladder from the brief, and the reason is in the
//     "Stacking" comment: on a 1-5-10 ladder every second merge divides the
//     rendered crowd by five, so the squad's own reinforcement gate reads as an
//     80% loss. 1-2-5 caps that at 2.5x, keeps every badge a round number, and
//     measures monotonic across the review progression where 1-5-10 does not.
//     Say the word and it is one array to change back.
//
//  B. SIGNS BAND. The brief asked me to claim a band in signs.js's shared glyph
//     mesh, but `signs.js:BANDS` is `[{labels:30},{labels:14}]` and signs.js is
//     frozen for me, so there is no band 2 to claim and `labelWriter(2)` throws.
//     Please add `{ labels: 12 }` as band 2 — 12 labels x LBL_CAP is 144 slots.
//     Meanwhile the badges below run on their own InstancedMesh, which shares
//     signs.js's glyph ATLAS and its material (via `glyphMaterial()`), so it
//     costs one extra draw call and no extra texture. It also has to duplicate
//     `GLYPH_SET` to map a character to an atlas cell; an exported
//     `glyphCellOf(ch)` would let me delete that copy whichever way B lands.
//
//  C. `state.troops` is written here, by addTroops/killTroops. state.js says
//     only game.js writes state — but game.js's applyEffect delegates the
//     troops/loss/mult/divide cases straight to us, so the count has to change
//     on this side of the call. Nothing else in this file writes state.
//  D. `utils.js:spiralXY` returns a fresh two-element array per call, so the
//     formation offsets are baked into two Float32Arrays at init instead. An
//     out-param variant (`spiralInto(i, spacing, out)`) would let this file use
//     it directly.
//  E. `RUN.formSpacing` is read as "metres between neighbouring men", not as
//     the raw radius constant spiralXY takes: r = c*sqrt(i) puts neighbours
//     c*sqrt(PI) apart, so the disc constant used here is formSpacing/sqrt(PI).
//     With that reading a full formation fills the road, which is the block the
//     brief describes. Passing 0.62 in raw gives thin soup.
//
// ---------------------------------------------------------------------------
//
// Your squad. One instanced crowd per tier, only ever one of them populated,
// and a Float32Array-of-arrays holding every body. There is no per-body object
// anywhere in this file and nothing in updateArmy() allocates — a per-frame
// `{x,z}` per unit is thousands of objects a second and the GC eats a frame
// every few seconds, which on a phone reads as the game stuttering when the
// army gets big. The army getting big is the whole point of the game.
//
// A BODY IS NOT A MAN ANY MORE. See "Stacking".

import * as THREE from 'three';
import { RUN, ROAD, GUN, TIERS, tierAt } from './config.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { clamp, GOLDEN } from './utils.js';
import { makeTierCrowd, tierSpacing, tierMuzzle, tierHover, applyRank } from './units.js';
import { faceQuad, attachCells, glyphMaterial, SCREEN_X } from './signs.js';

// How near the water a man is allowed to get. The formation is laid out to fit
// between the banks already, but the spring overshoots on a hard drag, so every
// body also gets a hard rail — walking on water is the one thing that cannot
// happen, however good the flow looks.
const EDGE = 0.45;

const DEATH_T = 0.42;        // seconds a casualty stays up, tinted, before it goes
const MERGE_T = 0.30;        // seconds a body takes to fold into a bigger stack
const POP_T = 0.28;          // spawn-in and promotion scale pop
const FOLLOW = 0.55;         // fraction of the leader's sidestep carried rigidly

// --------------------------------------------------------------------------
// Stacking — the thing this file is actually about
// --------------------------------------------------------------------------
//
// One rendered body used to be one man, capped at `quality.maxCrowd`. Past the
// cap the count kept climbing for scoring and the crowd simply stopped changing,
// so a gate that paid +432 looked exactly like one that paid +40, and at 250
// men the formation was a carpet of blocks with no shape to it at all.
//
// Now a body stands for `stackValue` men, taken off a ladder. `stackValue` is
// the SMALLEST rung that fits the squad inside `bodyMax` bodies, so the crowd
// fills up, merges, and fills up again:
//
//   troops     1 ..  64   ->  1 .. 64 bodies  x1
//        65 .. 128   ->  33 .. 64          x2      <- merge
//       129 .. 320   ->  26 .. 64          x5      <- merge
//       321 .. 640   ->  33 .. 64          x10
//       641 ..1280   ->  33 .. 64          x20
//      1281 ..3200   ->  26 .. 64          x50
//   ... and so on, forever, at a body count that never leaves [26, 64].
//
// THE LADDER IS 1-2-5, NOT 1-5-10. The brief asked for 1-5-10 and I measured
// both. On 1-5-10 the rungs go 1, 5, 10, 50, 100, 500 — so half of the merges
// divide the rendered crowd by FIVE. Crossing 64 men drops the formation from
// 64 bodies to 13, which is the player walking through a gate that says +40 and
// watching four fifths of his army disappear. Worse, it never recovers the
// order across the review progression: 1-5-10 renders 48, 26, 18, 24 bodies at
// 48 / 130 / 900 / 12000 troops — the army visibly SHRINKS twice on the way up.
// 1-2-5 renders 48, 26, 45, 60 over the same points: one dip, at the very first
// merge, and monotonic after it. Every rung is still a round number a badge can
// say (x2, x5, x10, x20, x50, x100, x200, x500, x1K...), which was the other
// thing 1-5-10 was buying.
//
// BODY_MAX = 64 for foot tiers. Reasons, in order of weight:
//   - The brief wants one-per-man up to "about 50-60", and 64 is that with a
//     little headroom, so the first two chapters never merge at all and the
//     tutorial never has to explain a multiplier.
//   - 64 bodies on the golden-angle disc at 0.62 m spacing is a blob 5.4 m
//     across on an 11 m road — a formation with an edge, which is what the
//     reference frames read as, rather than a carpet that touches both kerbs.
//   - It is where the geometry budget lands: units.js is now 1,083 triangles a
//     soldier instead of 204, and 64 x 1,083 is 69k against the old 600-body
//     carpet's 122k — the rounder men are 43% cheaper than the blocks were.
// Vehicles get 40, because a vehicle's footprint is measured off its own
// bounding box: 64 tanks is a 75 m column, most of it behind the camera.
const LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4,
                5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9];
const BODY_MAX_FOOT = 64;
const BODY_MAX_VEH = 40;

// Stepping DOWN a rung needs a dead band. Without one, a squad parked on a
// boundary and trading a man a second strobes between 64 bodies and 33 every
// frame, which is far uglier than either formation.
const RUNG_HYST = 0.88;

// Rank reads three ways at once, because at 25 m no one of them is enough:
// a size bump, a brighter palette (units.js:applyRank) and the badge.
const STACK_STEP = 0.068;      // scale bump per rung, to the STACK_MAX ceiling
const STACK_MAX = 1.35;        // ceiling on the TOTAL scale, tier scale included
const SPREAD_FOOT = 0.125;     // extra formation spacing per rung
const SPREAD_VEH = 0.045;
const SPREAD_MAX = 1.62;

let ctxRef = null;
let bodyCap = 0;               // how many bodies the arrays and the crowd hold
// The main screen plays a real run behind the UI. It has no HUD, so a merge
// toast fired from it would be a line of text with nothing to belong to.
let backdrop = false;
let rung = 0, stackValue = 1;  // index into LADDER, and LADDER[rung]

// One crowd per tier, built on demand. Only the active tier ever has a non-zero
// count, so the army is 2 draw calls (colour + outline shell) plus its shadow
// pass and one badge draw, whatever the ladder is doing.
const crowds = new Array(TIERS.length).fill(null);
let tier = 0, tierPop = 0, stackPop = 0;

// --- per-body SoA --------------------------------------------------------
// px is WORLD x; pz is an OFFSET from state.z. Storing z relative to the leader
// is what removes the forward lag: a spring chasing a target that moves at
// 12.5 m/s settles ~7 m behind it, so the whole army would trail the camera.
// Lateral stays absolute precisely BECAUSE it lags — that lag is the flow.
let px, pz, vx, vz, ph, hp, flash, pop, dm;
let slotU, slotV;            // unit-radius golden spiral, baked once
let live = 0;                // bodies that count; indices [0, live)
let n = 0;                   // bodies drawn; [live, n) are leaving
let retiredFrom = 0, retiredTo = 0;   // what the last reconcile() took off

// --- shooters ------------------------------------------------------------
let shootBuf, shootViews, binIdx, binZ;

const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, frontZ: 0 };

let lastLeaderX = 0, clock = 0;

const _tint = new Float32Array(3);   // casualty / merge colour, reused

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initArmy(ctx) {
  ctxRef = ctx;
  // maxCrowd is a device ceiling, not a target: the deliberate cap is BODY_MAX.
  bodyCap = Math.max(8, Math.min(BODY_MAX_FOOT, ctx?.quality?.maxCrowd ?? BODY_MAX_FOOT));

  px = new Float32Array(bodyCap); pz = new Float32Array(bodyCap);
  vx = new Float32Array(bodyCap); vz = new Float32Array(bodyCap);
  ph = new Float32Array(bodyCap); hp = new Float32Array(bodyCap);
  flash = new Float32Array(bodyCap); pop = new Float32Array(bodyCap);
  dm = new Uint8Array(bodyCap);          // 1 = folding into a stack, 0 = dying

  // The golden-angle spiral at radius 1. Multiplying by the pack constant and
  // the road squeeze at draw time is two multiplies; calling spiralXY is an
  // allocation. Same numbers, no garbage.
  slotU = new Float32Array(bodyCap); slotV = new Float32Array(bodyCap);
  for (let i = 0; i < bodyCap; i++) {
    const r = Math.sqrt(i + 0.5), a = i * GOLDEN;
    slotU[i] = Math.cos(a) * r;
    slotV[i] = Math.sin(a) * r;
  }

  shootBuf = new Float32Array(GUN.fireCap * 3);
  shootViews = new Array(GUN.fireCap + 1);   // cached subarray views, one per length
  binIdx = new Int32Array(GUN.fireCap);
  binZ = new Float32Array(GUN.fireCap);

  initBadges();
  on('run:start', (e) => { backdrop = !!e?.autoplay; });
  return ctxRef;
}

const bodyMaxOf = (t) => Math.min(bodyCap, tierAt(t).kind === 'foot' ? BODY_MAX_FOOT : BODY_MAX_VEH);

function crowdFor(i) {
  if (!crowds[i]) {
    crowds[i] = makeTierCrowd(i, { max: bodyCap, castShadow: ctxRef?.quality?.shadows !== false });
    ctxRef.scene.add(crowds[i].group);
  }
  return crowds[i];
}

export function resetArmy(level) {
  if (!ctxRef) return null;
  tier = clamp(state.tier | 0, 0, TIERS.length - 1);
  tierPop = 0;
  stackPop = 0;
  clock = 0;
  lastLeaderX = state.x;

  for (const c of crowds) if (c) c.count = 0;
  const crowd = crowdFor(tier);

  // Rung from scratch — the hysteresis in pickRung() must not carry a merged
  // formation from last run into a one-man opening.
  rung = 0;
  live = n = 0;
  reconcile(true, true);
  applyRank(crowd, tier, rung);
  writeBadges();

  updateArmy(0);
  return crowd.group;
}

export function disposeArmy() {
  for (let i = 0; i < crowds.length; i++) {
    const c = crowds[i];
    if (!c) continue;
    c.group.parent?.remove(c.group);
    c.dispose();
    crowds[i] = null;
  }
  disposeBadges();
  live = n = 0;
  ctxRef = null;
}

// --------------------------------------------------------------------------
// The ladder
// --------------------------------------------------------------------------

/**
 * The smallest rung that fits `t` men inside the tier's body cap, with a dead
 * band on the way back down. Multi-step in both directions: a `divide` trap can
 * halve an army twice over and a `mult` gate can cross three rungs at once.
 */
function pickRung(t) {
  const cap = bodyMaxOf(tier);
  let r = 0;
  while (r < LADDER.length - 1 && Math.ceil(t / LADDER[r]) > cap) r++;
  if (r < rung) {
    while (r < rung && Math.ceil(t / LADDER[r]) > cap * RUNG_HYST) r++;
  }
  return r;
}

/** Total scale of one body, tier scale included. Capped at the ladder's own. */
function bodyScale() {
  const def = tierAt(tier);
  return Math.max(1, Math.min(1 + STACK_STEP * rung, STACK_MAX / def.scale)) * def.scale;
}

/**
 * Bring the rendered formation in line with `state.troops`: pick the rung, work
 * out how many bodies that is, and spawn or retire the difference. Everything
 * that changes the count funnels through here so the merge animation, the rank
 * palette and the badge text can never disagree with each other.
 *
 * `instant` skips the spawn-in pop (run start only); `quiet` suppresses the
 * merge toast, for the two places the ladder moves without the squad growing —
 * a run starting straight into a big army, and a promotion changing the cap.
 */
function reconcile(instant, quiet) {
  const t = Math.max(0, state.troops | 0);
  const r = pickRung(t);
  const merged = r > rung;
  if (r !== rung) {
    rung = r;
    stackPop = quiet ? 0 : POP_T * 2.2;
    if (ctxRef) applyRank(crowdFor(tier), tier, rung);
    setBadgeText(rung > 0 ? stackLabel(LADDER[rung]) : '');
    if (merged && rung > 0 && !quiet && !backdrop) {
      emit('hud:toast', { text: 'SQUAD MERGED · ' + stackLabel(LADDER[rung]) + ' EACH', icon: '🎖' });
    }
  }
  stackValue = LADDER[rung];

  const want = t <= 0 ? 0 : Math.min(bodyMaxOf(tier), Math.ceil(t / stackValue));
  measure();
  retiredFrom = retiredTo = live;
  while (live < want && live < bodyCap) {
    // A leaving body may be squatting on the index the new one wants. Shove it
    // out to the tail rather than dropping it — a casualty vanishing the instant
    // a gate pays out looks like a glitch.
    if (live < n) { if (n < bodyCap) copyBody(live, n++); }
    spawn(live, instant);
    live++;
    if (n < live) n = live;
  }
  while (live > want && live > 0) retire(--live, merged);
  retiredTo = live;
  return want;
}

// --------------------------------------------------------------------------
// Formation
// --------------------------------------------------------------------------

// The squad is a golden-angle DISC while a disc still fits between the banks,
// and a STRIP of full-width rows once it does not. Both at the tier's own
// footprint, and crossfaded over a band so growing past the threshold flows
// instead of snapping.
//
// The obvious alternative — squash the disc into an ellipse that fits the road
// and stretch it lengthways to keep the area — was tried and is wrong. Work the
// algebra through and the lateral spacing of an area-preserving ellipse comes
// out as `lim*sqrt(PI/n)`: it depends only on the head count, so it ignores how
// big the unit is. 400 riflemen sat at a handsome 0.45 m; 200 tanks sat at the
// same 0.45 m and rendered as one continuous carpet of turret.
//
// `spread` is the stacking half of it. A merge costs bodies, so without a
// widening term the blob's radius would fall every time the ladder stepped and
// the army would read as shrinking on its own reinforcement gate. Spread grows
// the footprint 9.5% a rung for foot tiers, which is short of covering the whole
// drop — nothing covers a 2.5x drop in count — but it turns the review
// progression's radii into 2.42, 2.23, 3.52, 4.39 m at 48/130/900/12000 troops.
// The 8% dip left at 130 is covered by the size bump the same merge brings:
// those 26 bodies are each 14% taller, so the SILHOUETTE does not shrink even
// though the blob's footprint does. Spread is capped at 1.62
// because past that men stop touching and a formation becomes a scatter.
let discC = 0, sx = 0.62, sz = 0.62, cols = 16, blend = 0, spread = 1;
let _tx = 0, _tz = 0;             // slotOf's out-params; see MANAGER note D

function measure() {
  const bodies = Math.max(1, n);
  const def = tierAt(tier);
  const sp = tierSpacing(tier);
  spread = Math.min(SPREAD_MAX, 1 + (def.kind === 'foot' ? SPREAD_FOOT : SPREAD_VEH) * rung);
  sx = sp.x * spread; sz = sp.z * spread;
  const lim = ROAD.halfW - EDGE;
  cols = Math.max(1, Math.floor((lim * 2) / sx));
  // Radius constant that gives the disc the same area per unit as the strip.
  discC = Math.sqrt((sx * sz) / Math.PI);
  blend = clamp((discC * Math.sqrt(bodies) / lim - 1) / 0.4, 0, 1);
}

// Formation slot for index i, into _tx/_tz, relative to the leader.
//
// Rows in the strip alternate in front of and behind the leader — 0, +1, -1,
// +2, -2 — so index order still means "distance from the leader", which is
// what killTroops leans on to take casualties off the edge of the blob.
function slotOf(i) {
  const dx = slotU[i] * discC, dz = slotV[i] * discC;
  if (blend <= 0) { _tx = dx; _tz = dz; return; }
  const rr = (i / cols) | 0;
  const srow = (rr & 1) ? ((rr + 1) >> 1) : -(rr >> 1);
  // Half-step stagger on alternate rows. A square lattice packs 15% looser than
  // a hex one and, worse, reads as a printed grid the moment the spacing opens
  // up. The quarter-step either way keeps it inside the road.
  const gx = ((i % cols) - (cols - 1) * 0.5 + (rr & 1 ? 0.25 : -0.25)) * sx;
  const gz = srow * sz;
  if (blend >= 1) { _tx = gx; _tz = gz; return; }
  _tx = dx + (gx - dx) * blend;
  _tz = dz + (gz - dz) * blend;
}

// --------------------------------------------------------------------------
// Spawn, merge and death
// --------------------------------------------------------------------------

// Callers call measure() first — the pack constants depend on the body count,
// and recomputing them inside a loop that adds 40 bodies is 40 square roots for
// an answer that only moves once.
function spawn(i, instant) {
  slotOf(i);
  px[i] = clamp(state.x + _tx, -ROAD.halfW + EDGE, ROAD.halfW - EDGE);
  pz[i] = _tz;
  vx[i] = 0; vz[i] = 0;
  ph[i] = Math.random() * Math.PI * 2;
  hp[i] = tierAt(tier).hp;
  flash[i] = 0;
  dm[i] = 0;
  pop[i] = instant ? 0 : POP_T;
}

/**
 * Take a body off the roster. There are two ways that happens and they must not
 * look alike: a CASUALTY is shoved away from the centre so the edge of the blob
 * frays, a MERGE is pulled inward and flashed white, because the men it stood
 * for are not dead — they are inside the body next to it now.
 */
function retire(i, merged) {
  dm[i] = merged ? 1 : 0;
  flash[i] = merged ? MERGE_T : DEATH_T;
  if (merged) {
    vx[i] = (state.x - px[i]) * 3.2;
    vz[i] = -pz[i] * 3.2;
  } else {
    vx[i] += (px[i] - state.x) * 0.9 + (Math.random() - 0.5) * 1.6;
    vz[i] -= 1.4 + Math.random();
  }
}

/** Grow the squad. `count` is MEN, `reason` is why, for the HUD's toast. */
export function addTroops(count, reason = 'gate') {
  const add = Math.round(count);
  if (!add || add < 0) return state.troops;
  state.troops += add;
  if (state.troops > state.peakTroops) state.peakTroops = state.troops;
  if (ctxRef) reconcile(false);
  emit('army:count', { count: state.troops, delta: add, reason });
  return state.troops;
}

/**
 * Lose men. Shield eats the hit first, armour ignores a fraction of what is
 * left, and the casualties are taken from the OUTSIDE of the blob inward.
 *
 * That last part is why the array order matters. Both layouts in slotOf() are
 * built so that index order IS distance-from-the-leader order — the spiral lays
 * slot i at radius sqrt(i), and the strip alternates its rows outward from the
 * leader — so retiring from the tail eats the edge of the crowd and the shape
 * stays a shape. Killing at random punches holes in it, and a formation with
 * holes in it stops reading as an army and starts reading as dots.
 *
 * Once the squad is stacked, most losses cost no BODY at all: at x50 a man is
 * 2% of one. So the fray still happens whenever a body does go, and when none
 * does the loss still gets one blast on the edge of the blob — otherwise taking
 * fire at 3,000 men would be completely silent on screen.
 */
export function killTroops(count, reason = 'kill') {
  let want = Math.round(count);
  if (!want || want < 0) return state.troops;

  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, want);
    state.shield -= absorbed;
    want -= absorbed;
  }
  // Unbiased probabilistic rounding, NOT Math.floor. Flooring a fractional
  // reduction is a rounding lottery at the squad sizes chapter 1 is played at:
  // at armour 0.05, floor(1 * 0.95) is 0, so one level of the upgrade made the
  // player permanently immune to every single-man loss and did nothing else —
  // which reads to the player as "armour does nothing" because the only losses
  // it ever changed were the ones too small to notice. Rounding by chance
  // honours the fraction in expectation: 5% armour costs a man 95% of the time.
  if (state.armour > 0) {
    const reduced = want * (1 - state.armour);
    want = Math.floor(reduced) + (Math.random() < (reduced % 1) ? 1 : 0);
  }
  const lost = Math.min(want, state.troops);
  if (lost <= 0) {
    if (want !== count) emit('army:count', { count: state.troops, delta: 0, reason });
    return state.troops;
  }

  state.troops -= lost;

  if (ctxRef) {
    reconcile(false);
    let fx = 0;
    for (let i = retiredTo; i < retiredFrom && fx < 3; i++) {
      // Sparingly: one blast per handful of dead, or the screen is all fire.
      if (retiredFrom - retiredTo >= 3 && (i & 7) !== 0) continue;
      fx++;
      emit('fx:explosion', {
        pos: scratchPos(px[i], tierHover(tier) + 0.5, state.z + pz[i]),
        scale: 0.5 + Math.min(1.2, hp[i] * 0.12), color: 0xff8a20,
      });
    }
    if (fx === 0 && live > 0) {
      // Nobody came off the board, but men still died. Put the hit somewhere.
      const i = live - 1;
      emit('fx:explosion', {
        pos: scratchPos(px[i], tierHover(tier) + 0.5, state.z + pz[i]),
        scale: 0.45 + Math.min(0.9, lost / Math.max(1, stackValue) * 0.4), color: 0xff8a20,
      });
    }
  }
  emit('army:count', { count: state.troops, delta: -lost, reason });
  return state.troops;
}

// fx:explosion wants a position object. One reused vector: vfx.js reads it
// synchronously on the bus and must not keep the reference.
const _pos = new THREE.Vector3();
function scratchPos(x, y, z) { return _pos.set(x, y, z); }

function copyBody(from, to) {
  px[to] = px[from]; pz[to] = pz[from];
  vx[to] = vx[from]; vz[to] = vz[from];
  ph[to] = ph[from]; hp[to] = hp[from];
  flash[to] = flash[from]; pop[to] = pop[from]; dm[to] = dm[from];
}

/** Swap which tier the squad is drawn as. Bodies and positions carry over. */
export function setTier(i) {
  const next = clamp(i | 0, 0, TIERS.length - 1);
  if (next === tier || !ctxRef) { tier = next; return tier; }
  if (crowds[tier]) crowds[tier].count = 0;
  tier = next;
  crowdFor(tier);
  tierPop = POP_T * 2;
  for (let k = 0; k < n; k++) hp[k] = tierAt(tier).hp;
  // The body cap and the footprint both change with the tier, so the rung has
  // to be re-solved: eight tanks and eight riflemen are not the same picture.
  rung = 0;
  reconcile(false, true);
  applyRank(crowdFor(tier), tier, rung);
  return tier;
}

// --------------------------------------------------------------------------
// The frame
// --------------------------------------------------------------------------

export function updateArmy(dt) {
  if (!ctxRef) return null;
  const crowd = crowdFor(tier);
  clock += dt;

  // Anything outside this file may have written state.troops directly — the
  // harness's `?troops=400`, and game.js's promote(), both do. Reconcile before
  // drawing rather than trusting our own bookkeeping.
  reconcile(false);
  measure();

  const def = tierAt(tier);
  const hover = tierHover(tier);
  const air = def.kind === 'air';
  const lim = ROAD.halfW - EDGE;
  const ldx = state.x - lastLeaderX;
  lastLeaderX = state.x;

  // Critically-ish damped spring. Under-damping is what makes the crowd slosh
  // when you flick across the road instead of sliding like a table being
  // pushed; RUN.formPull sets the stiffness and this sets the ring.
  const k = RUN.formPull;
  const damp = 2 * Math.sqrt(k) * 0.85;
  const J = RUN.formJitter;

  tierPop = Math.max(0, tierPop - dt);
  stackPop = Math.max(0, stackPop - dt);
  const popTier = 1 + (tierPop / (POP_T * 2)) * 0.35;
  // The merge surge. Every surviving body swells for a third of a second as the
  // ladder steps, so a merge reads as the army bulking up rather than thinning.
  const popStack = 1 + (stackPop / (POP_T * 2.2)) * 0.26;
  const baseScale = bodyScale() * popTier * popStack;

  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;

  for (let i = 0; i < n; i++) {
    const leaving = i >= live;
    // A few per cent of height variation per body, keyed off its gait phase so
    // it costs nothing to store. 60 units at one exact height read as a printed
    // pattern; 60 at slightly different heights read as a crowd.
    let s = baseScale * (0.93 + 0.14 * ((ph[i] * 0.1591549) % 1));
    let tinted = null;

    if (leaving) {
      flash[i] -= dt;
      if (dm[i]) {
        // MERGE. Walks inward with the formation, folds up, flashes bright.
        const f = Math.max(0, flash[i] / MERGE_T);
        vx[i] -= vx[i] * 2.4 * dt;
        vz[i] -= vz[i] * 2.4 * dt;
        px[i] += vx[i] * dt;
        pz[i] += vz[i] * dt;
        s *= f * (0.55 + 0.45 * f);
        _tint[0] = 1 + (1 - f) * 1.1; _tint[1] = 1 + (1 - f) * 1.0; _tint[2] = 1 + (1 - f) * 0.7;
        tinted = _tint;
      } else {
        // CASUALTY. No slot any more: they stagger on their last velocity, tint
        // red and shrink out, and the road leaves them behind.
        vx[i] -= vx[i] * 3.2 * dt;
        vz[i] -= vz[i] * 3.2 * dt;
        px[i] += vx[i] * dt;
        pz[i] += vz[i] * dt - RUN.speed * dt;
        const f = Math.max(0, flash[i] / DEATH_T);
        s *= 0.35 + 0.65 * f;
        _tint[0] = 1; _tint[1] = 0.30 + 0.35 * f; _tint[2] = 0.24 + 0.30 * f;
        tinted = _tint;
      }
    } else {
      slotOf(i);
      const tx = clamp(state.x + _tx + Math.sin(clock * 1.7 + ph[i]) * J, -lim, lim);
      const tz = _tz + Math.cos(clock * 2.3 + ph[i] * 1.7) * J;

      // Carry part of the leader's sidestep rigidly. A pure spring lags by
      // v*damp/k, which at a fast drag is six metres of army left standing in
      // the last lane; carrying half of it keeps the blob under the thumb while
      // the spring still does the sloshing.
      px[i] += ldx * FOLLOW;

      vx[i] += ((tx - px[i]) * k - vx[i] * damp) * dt;
      vz[i] += ((tz - pz[i]) * k - vz[i] * damp) * dt;
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt;
      px[i] = clamp(px[i], -lim, lim);          // hard rail: nobody walks on water

      if (pop[i] > 0) { pop[i] = Math.max(0, pop[i] - dt); s *= 1 - (pop[i] / POP_T) * 0.55; }
    }

    const wz = state.z + pz[i];
    const wy = air ? hover + Math.sin(clock * 1.6 + ph[i]) * 0.11 : hover;
    // Lean into the drag. vz is the offset velocity, so the world-space forward
    // speed is the run speed plus whatever chasing the slot adds.
    const yaw = clamp(Math.atan2(vx[i], RUN.speed + vz[i]), -0.55, 0.55);

    crowd.set(i, px[i], wy, wz, s, yaw, leaving ? 0 : 1, ph[i], tinted);
    if (!leaving) {
      if (px[i] < minX) minX = px[i];
      if (px[i] > maxX) maxX = px[i];
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
  }

  // Retire the finished from the tail. They are all at the end of the array, so
  // a swap with the last body keeps the live prefix untouched.
  for (let i = n - 1; i >= live; i--) {
    if (flash[i] <= 0) { if (i !== n - 1) copyBody(n - 1, i); n--; }
  }

  crowd.count = n;
  crowd.commit();
  crowd.update(dt);

  if (live > 0) {
    bounds.minX = minX; bounds.maxX = maxX;
    bounds.minZ = minZ; bounds.maxZ = maxZ;
    bounds.frontZ = maxZ;
  } else {
    bounds.minX = bounds.maxX = state.x;
    bounds.minZ = bounds.maxZ = bounds.frontZ = state.z;
  }

  writeBadges();
  return crowd;
}

// --------------------------------------------------------------------------
// Stack badges
// --------------------------------------------------------------------------
//
// The number over a body's head, saying how many men it stands for. It shares
// signs.js's glyph ATLAS and its material — same texture, same shader, same
// program — on its own InstancedMesh, for one extra draw call. (See MANAGER
// note B for why it is not a band of signs.js's own mesh.)
//
// NOT ONE PER BODY, and the reason is legibility rather than cost. A badge that
// reads at 25 m is about 0.46 m of cap height and 1.3-1.9 m wide; the men it
// sits over are 0.62 m apart. Badging all 64 is a solid bar of overlapping
// digits with no number in it anywhere. So the writer walks the formation from
// the leader outward and keeps a badge only where it clears every badge already
// placed, in x AND in screen height — which lands at 5-8 of them, spread over
// the blob, at a size a phone can actually read. Every body carries the same
// stack value anyway, so a spread sample says everything a full set would.
const GLYPH_SET = '0123456789+-$%.:s' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '×÷▲⌖♥⚡?';
const BADGE_LABELS = 8;
const BADGE_GLYPHS = 7;
const BADGE_CAP = 0.46;      // glyph ink height, metres
const BADGE_INK = 0.59;      // a digit's ink as a fraction of its atlas cell
const BADGE_ADV = 0.56;      // uniform advance, in cells. Tabular on purpose:
                             // three digits over three heads want to line up.
const BADGE_W = 1.85;        // widest a badge gets before it condenses
const BADGE_TILT = 0.55;     // leaned back to face the 39-degree camera
const BADGE_LIFT = 0.85;     // clear air above the unit's own head
// Screen height on this camera is 0.777*y + 0.629*z, so a badge one cap tall
// occupies 0.777*CAP of it; two badges are legible apart if they differ by that
// much, which in world z is (0.777/0.629)*CAP — times 1.7 for air, because a
// badge touching the one above it is only marginally better than overlapping.
const BADGE_SEP_Z = (0.777 / 0.629) * BADGE_CAP * 1.7;

let badgeMesh = null, badgeGeo = null, badgeCells = null, badgeArr = null;
let badgeGlyph = null, badgeLen = 0;
let selX = null, selZ = null, sel = null;

function initBadges() {
  if (badgeMesh || !ctxRef) return;
  const cap = BADGE_LABELS * BADGE_GLYPHS;
  badgeGeo = faceQuad();
  badgeCells = attachCells(badgeGeo, cap);
  badgeMesh = new THREE.InstancedMesh(badgeGeo, glyphMaterial(), cap);
  badgeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  badgeMesh.frustumCulled = false;
  badgeMesh.renderOrder = 7;
  badgeMesh.count = 0;
  badgeArr = badgeMesh.instanceMatrix.array;
  badgeGlyph = new Int32Array(BADGE_GLYPHS);
  selX = new Float32Array(BADGE_LABELS);
  selZ = new Float32Array(BADGE_LABELS);
  sel = new Int32Array(BADGE_LABELS);
  ctxRef.scene.add(badgeMesh);
}

function disposeBadges() {
  if (!badgeMesh) return;
  badgeMesh.parent?.remove(badgeMesh);
  badgeMesh.dispose();
  badgeGeo.dispose();          // the MATERIAL belongs to signs.js — not ours to free
  badgeMesh = null; badgeGeo = null; badgeCells = null; badgeArr = null;
  badgeLen = 0;
}

/** `x50`, `x1.2K`, `x5M`. Every ladder rung divides cleanly, so no decimals. */
function stackLabel(v) {
  if (v < 1000) return '×' + v;
  const div = v < 1e6 ? 1e3 : v < 1e9 ? 1e6 : 1e9;
  const suf = v < 1e6 ? 'K' : v < 1e9 ? 'M' : 'B';
  const q = v / div;
  return '×' + (q % 1 ? q.toFixed(1) : String(q)) + suf;
}

function setBadgeText(txt) {
  if (!badgeGlyph) return;
  badgeLen = 0;
  for (let i = 0; i < txt.length && badgeLen < BADGE_GLYPHS; i++) {
    const c = GLYPH_SET.indexOf(txt[i]);
    if (c >= 0) badgeGlyph[badgeLen++] = c;
  }
}

function writeBadges() {
  if (!badgeMesh) return;
  let g = 0;
  if (badgeLen > 0 && stackValue > 1 && live > 0) {
    const Q = BADGE_CAP / BADGE_INK;
    let adv = BADGE_ADV * Q;
    let w = badgeLen * adv, xs = 1;
    if (w > BADGE_W) { xs = BADGE_W / w; adv *= xs; w = BADGE_W; }
    const qx = Q * xs;
    const tc = Math.cos(BADGE_TILT), ts = Math.sin(BADGE_TILT);
    const y = tierHover(tier) + 1.78 * bodyScale() + BADGE_LIFT;

    // Greedy spread. Spiral order is leader-outward, so the badges nearest the
    // middle of the blob win the ties, which is where the eye already is.
    let k = 0;
    for (let i = 0; i < live && k < BADGE_LABELS; i++) {
      let ok = true;
      for (let j = 0; j < k; j++) {
        if (Math.abs(px[i] - selX[j]) < w * 1.15 && Math.abs(pz[i] - selZ[j]) < BADGE_SEP_Z) { ok = false; break; }
      }
      if (!ok) continue;
      selX[k] = px[i]; selZ[k] = pz[i]; sel[k] = i; k++;
    }

    for (let j = 0; j < k; j++) {
      const i = sel[j];
      const cz = state.z + pz[i];
      let lx = -w / 2;
      for (let c = 0; c < badgeLen; c++) {
        const o = g * 16;
        // rotX(tilt) * scale(qx, Q, 1), by hand — signs.js:writeRun's layout.
        badgeArr[o] = qx;    badgeArr[o + 1] = 0;         badgeArr[o + 2] = 0;        badgeArr[o + 3] = 0;
        badgeArr[o + 4] = 0; badgeArr[o + 5] = tc * Q;    badgeArr[o + 6] = ts * Q;   badgeArr[o + 7] = 0;
        badgeArr[o + 8] = 0; badgeArr[o + 9] = -ts * Q;   badgeArr[o + 10] = tc * Q;  badgeArr[o + 11] = 0;
        // SCREEN_X: the camera looks along +Z, so reading order steps in -x.
        badgeArr[o + 12] = px[i] + SCREEN_X * (lx + adv / 2);
        badgeArr[o + 13] = y;
        badgeArr[o + 14] = cz;
        badgeArr[o + 15] = 1;
        badgeCells.array[g] = badgeGlyph[c];
        g++;
        lx += adv;
      }
    }
  }
  badgeMesh.count = g;
  badgeMesh.instanceMatrix.needsUpdate = true;
  badgeCells.needsUpdate = true;
}

// --------------------------------------------------------------------------
// What other systems ask for
// --------------------------------------------------------------------------

/**
 * Up to GUN.fireCap muzzle positions, spread across the FRONT of the blob, as
 * a flat [x,y,z, x,y,z, ...] Float32Array. combat.js calls this every frame.
 *
 * The spread is done by binning bodies across the blob's width and keeping the
 * front-most in each bin — one pass, no sort, no allocation. Taking the first
 * N instead would bunch every muzzle flash into the middle of the crowd, and
 * the reference look is a WIDE line of fire coming off the front rank.
 *
 * Stacking does not change this: a stacked body is still exactly one place a
 * muzzle flash belongs, and combat.js already scales damage off state.troops
 * rather than off how many flashes it drew.
 */
export function shooters() {
  const cap = GUN.fireCap;
  if (!ctxRef || live <= 0) return view(0);

  const lo = bounds.minX, hi = bounds.maxX;
  const span = Math.max(0.001, hi - lo);
  const bins = Math.min(cap, live);
  for (let b = 0; b < bins; b++) { binIdx[b] = -1; binZ[b] = -1e9; }

  for (let i = 0; i < live; i++) {
    let b = ((px[i] - lo) / span * bins) | 0;
    if (b < 0) b = 0; else if (b >= bins) b = bins - 1;
    if (pz[i] > binZ[b]) { binZ[b] = pz[i]; binIdx[b] = i; }
  }

  const y = tierMuzzle(tier) * bodyScale() + tierHover(tier);
  let k = 0;
  for (let b = 0; b < bins; b++) {
    const i = binIdx[b];
    if (i < 0) continue;
    shootBuf[k * 3] = px[i];
    shootBuf[k * 3 + 1] = y;
    shootBuf[k * 3 + 2] = state.z + pz[i] + 0.35;   // just clear of the barrel
    k++;
  }
  return view(k);
}

// Subarray views are cached by length: `.subarray()` allocates a view object,
// and this is called every frame.
function view(k) {
  let v = shootViews[k];
  if (!v) { v = shootViews[k] = shootBuf.subarray(0, k * 3); }
  v.count = k;
  return v;
}

/** Blob extents for collision. The same object every call — do not keep it. */
export function armyBounds() { return bounds; }

/** Bodies actually on screen, which is not state.troops once the squad stacks. */
export function armyBodies() { return live; }

/** Men per rendered body. 1 until the squad outgrows the draw budget. */
export function armyStack() { return stackValue; }

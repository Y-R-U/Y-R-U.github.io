// MANAGER: three notes, none of them blocking.
//   1. `state.troops` is written here, by addTroops/killTroops. state.js says
//      only game.js writes state — but game.js's applyEffect delegates the
//      troops/loss/mult/divide cases straight to us, so the count has to change
//      on this side of the call. Nothing else in this file writes state.
//   2. `utils.js:spiralXY` returns a fresh two-element array per call. At 900
//      men that is 54,000 arrays a second, so the formation offsets are baked
//      into two Float32Arrays at init instead. An out-param variant
//      (`spiralInto(i, spacing, out)`) would let this file use it directly.
//   3. `RUN.formSpacing` is read as "metres between neighbouring men", not as
//      the raw radius constant spiralXY takes: r = c*sqrt(i) puts neighbours
//      c*sqrt(PI) apart, so the disc constant used here is formSpacing/sqrt(PI).
//      With that reading 300 men fill an 11 m road ~10 m deep, which is the
//      block the brief describes. Passing 0.62 in raw gives 33 m of thin soup.
//
// ---------------------------------------------------------------------------
//
// Your squad. One instanced crowd per tier, only ever one of them populated,
// and a Float32Array-of-arrays holding every man. There is no per-man object
// anywhere in this file and nothing in updateArmy() allocates — at 900 men a
// single `{x,z}` per frame is 54,000 objects a second and the GC eats a frame
// every few seconds, which on a phone reads as the game stuttering when the
// army gets big. The army getting big is the whole point of the game.

import * as THREE from 'three';
import { RUN, ROAD, GUN, TIERS, tierAt } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, GOLDEN } from './utils.js';
import { makeTierCrowd, tierSpacing, tierMuzzle, tierHover } from './units.js';

// How near the water a man is allowed to get. The formation is laid out to fit
// between the banks already, but the spring overshoots on a hard drag, so every
// man also gets a hard rail — walking on water is the one thing that cannot
// happen, however good the flow looks.
const EDGE = 0.45;

const DEATH_T = 0.42;        // seconds a casualty stays up, tinted, before it goes
const POP_T = 0.28;          // spawn-in and promotion scale pop
const FOLLOW = 0.55;         // fraction of the leader's sidestep carried rigidly

let ctxRef = null;
let bodyCap = 0;

// One crowd per tier, built on demand. Only the active tier ever has a non-zero
// count, so the army is 2 draw calls (colour + outline shell) plus its shadow
// pass, whatever the ladder is doing.
const crowds = new Array(TIERS.length).fill(null);
let tier = 0, tierPop = 0;

// --- per-man SoA --------------------------------------------------------
// px is WORLD x; pz is an OFFSET from state.z. Storing z relative to the leader
// is what removes the forward lag: a spring chasing a target that moves at
// 12.5 m/s settles ~7 m behind it, so the whole army would trail the camera.
// Lateral stays absolute precisely BECAUSE it lags — that lag is the flow.
let px, pz, vx, vz, ph, hp, flash, pop;
let slotU, slotV;            // unit-radius golden spiral, baked once
let live = 0;                // men that count; indices [0, live)
let n = 0;                   // bodies drawn; [live, n) are dying

// --- shooters ------------------------------------------------------------
let shootBuf, shootViews, binIdx, binZ;

const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, frontZ: 0 };

let lastLeaderX = 0, clock = 0;

const _tint = new Float32Array(3);   // casualty colour, reused

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initArmy(ctx) {
  ctxRef = ctx;
  bodyCap = Math.max(8, Math.min(RUN.maxTroops, ctx?.quality?.maxCrowd ?? RUN.maxTroops));

  px = new Float32Array(bodyCap); pz = new Float32Array(bodyCap);
  vx = new Float32Array(bodyCap); vz = new Float32Array(bodyCap);
  ph = new Float32Array(bodyCap); hp = new Float32Array(bodyCap);
  flash = new Float32Array(bodyCap); pop = new Float32Array(bodyCap);

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

  return ctxRef;
}

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
  clock = 0;
  lastLeaderX = state.x;

  for (const c of crowds) if (c) c.count = 0;
  const crowd = crowdFor(tier);

  // Count first, then place: measure() reads `n`, and a squad built one man at
  // a time would lay every slot out as if it were a squad of one.
  live = n = Math.max(0, Math.min(state.troops | 0, bodyCap));
  measure();
  for (let i = 0; i < n; i++) spawn(i, true);

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
  live = n = 0;
  ctxRef = null;
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
let discC = 0, sx = 0.62, sz = 0.62, cols = 16, blend = 0;
let _tx = 0, _tz = 0;             // slotOf's out-params; see MANAGER note 2

function measure() {
  const bodies = Math.max(1, n);
  // Above the body cap the count keeps climbing for scoring but no more men
  // spawn. Widening the spacing is the cheap lie that keeps the blob growing.
  const over = state.troops > bodyCap ? Math.min(1.22, Math.sqrt(state.troops / bodyCap)) : 1;
  const sp = tierSpacing(tier);
  sx = sp.x * over; sz = sp.z * over;
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
  // up past the body cap. The quarter-step either way keeps it inside the road.
  const gx = ((i % cols) - (cols - 1) * 0.5 + (rr & 1 ? 0.25 : -0.25)) * sx;
  const gz = srow * sz;
  if (blend >= 1) { _tx = gx; _tz = gz; return; }
  _tx = dx + (gx - dx) * blend;
  _tz = dz + (gz - dz) * blend;
}

// --------------------------------------------------------------------------
// Spawn and death
// --------------------------------------------------------------------------

// Callers call measure() first — the pack constants depend on the body count,
// and recomputing them inside a loop that adds 400 men is 400 square roots for
// an answer that only moves once.
function spawn(i, instant) {
  slotOf(i);
  px[i] = clamp(state.x + _tx, -ROAD.halfW + EDGE, ROAD.halfW - EDGE);
  pz[i] = _tz;
  vx[i] = 0; vz[i] = 0;
  ph[i] = Math.random() * Math.PI * 2;
  hp[i] = tierAt(tier).hp;
  flash[i] = 0;
  pop[i] = instant ? 0 : POP_T;
}

/** Grow the squad. `n` is men, `reason` is why, for the HUD's toast. */
export function addTroops(count, reason = 'gate') {
  const add = Math.round(count);
  if (!add || add < 0) return state.troops;
  state.troops += add;
  if (state.troops > state.peakTroops) state.peakTroops = state.troops;

  if (ctxRef) {
    const want = Math.min(state.troops, bodyCap);
    measure();
    while (live < want) {
      // A dying man may be squatting on the index the new man wants. Shove him
      // out to the tail rather than dropping him — a casualty vanishing the
      // instant a gate pays out looks like a glitch.
      if (live < n) { if (n < bodyCap) copyBody(live, n++); }
      spawn(live, false);
      live++;
      if (n < live) n = live;
    }
  }
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
 * leader — so killing from the tail eats the edge of the crowd and the shape
 * stays a shape. Killing at random punches holes in it, and 200 men with holes
 * in them stop reading as an army and start reading as 200 dots.
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
    const want2 = Math.min(state.troops, bodyCap);
    let fx = 0;
    while (live > want2 && live > 0) {
      const i = --live;
      flash[i] = DEATH_T;
      // A shove away from the centre, so the edge of the blob visibly frays.
      vx[i] += (px[i] - state.x) * 0.9 + (Math.random() - 0.5) * 1.6;
      vz[i] -= 1.4 + Math.random();
      // Sparingly: one blast per handful of dead, or the screen is all fire.
      if (fx < 3 && (lost < 3 || (i & 7) === 0)) {
        fx++;
        emit('fx:explosion', {
          pos: scratchPos(px[i], tierHover(tier) + 0.5, state.z + pz[i]),
          scale: 0.5 + Math.min(1.2, hp[i] * 0.12), color: 0xff8a20,
        });
      }
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
  flash[to] = flash[from]; pop[to] = pop[from];
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
  const want = Math.min(Math.max(0, state.troops | 0), bodyCap);
  if (want !== live) {
    measure();
    while (live < want) { if (live < n && n < bodyCap) copyBody(live, n++); spawn(live, false); live++; if (n < live) n = live; }
    while (live > want) { const i = --live; if (flash[i] <= 0) flash[i] = DEATH_T; }
  }

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
  const popTier = 1 + (tierPop / (POP_T * 2)) * 0.35;
  const baseScale = def.scale * popTier;

  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;

  for (let i = 0; i < n; i++) {
    const dying = i >= live;
    // A few per cent of height variation per man, keyed off his gait phase so
    // it costs nothing to store. 400 units at one exact height read as a
    // printed pattern; 400 at slightly different heights read as a crowd.
    let s = baseScale * (0.93 + 0.14 * ((ph[i] * 0.1591549) % 1));

    if (dying) {
      // No slot any more: they stagger on their last velocity and shrink out.
      flash[i] -= dt;
      vx[i] -= vx[i] * 3.2 * dt;
      vz[i] -= vz[i] * 3.2 * dt;
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt - RUN.speed * dt;    // the road leaves them behind
      const f = Math.max(0, flash[i] / DEATH_T);
      s *= 0.35 + 0.65 * f;
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

    if (dying) {
      const f = Math.max(0, flash[i] / DEATH_T);
      _tint[0] = 1; _tint[1] = 0.30 + 0.35 * f; _tint[2] = 0.24 + 0.30 * f;
      crowd.set(i, px[i], wy, wz, s, yaw, 0, ph[i], _tint);
    } else {
      crowd.set(i, px[i], wy, wz, s, yaw, 1, ph[i], null);
      if (px[i] < minX) minX = px[i];
      if (px[i] > maxX) maxX = px[i];
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
  }

  // Retire the dead from the tail. They are all at the end of the array, so a
  // swap with the last body keeps the live prefix untouched.
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
  return crowd;
}

// --------------------------------------------------------------------------
// What other systems ask for
// --------------------------------------------------------------------------

/**
 * Up to GUN.fireCap muzzle positions, spread across the FRONT of the blob, as
 * a flat [x,y,z, x,y,z, ...] Float32Array. combat.js calls this every frame.
 *
 * The spread is done by binning men across the blob's width and keeping the
 * front-most in each bin — one pass, no sort, no allocation. Taking the first
 * N men instead would bunch every muzzle flash into the middle of the crowd,
 * and the reference look is a WIDE line of fire coming off the front rank.
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

  const y = tierMuzzle(tier) * tierAt(tier).scale + tierHover(tier);
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

/** Bodies actually on screen, which is not state.troops once past the cap. */
export function armyBodies() { return live; }

/**
 * P9 deliverable 5 — beats fire on camera X, seeded, on the pooled entity
 * contract (W8).
 *
 * ARCHITECTURE §7.1: *"a beat fires when the camera passes `x`"*. Three
 * properties follow and each is load-bearing:
 *
 *   ONE FORWARD CURSOR   `next` only ever advances, and it advances against the
 *                        FURTHEST camera X seen, not the current one — the
 *                        aeroplane turns round constantly and a level must not
 *                        re-fire its first wave every time the player doubles
 *                        back. `js/data/validate.js` refuses an out-of-order
 *                        beat for the same reason: a beat behind the cursor
 *                        never fires at all.
 *   SEEDED               every jitter comes from `world.ctx.rng`, so a level is
 *                        reproducible from (id, seed) alone — W3.
 *   POOLED               nothing here allocates per beat or per tick. The spawn
 *                        options are ONE scratch object reused in place, and
 *                        `world.spawn` draws from the fixed pool.
 *
 * Level coordinates are **world units**; `js/sim/` flies in **SI metres**
 * (`flight.sx`, `flight.sy`). Everything crossing that line goes through
 * `M_PER_WU` — D26's rule, in the direction a level file has to run in.
 *
 * Pure `js/sim/`: no DOM, no renderer, nothing from `js/gfx/` or `js/ui/`.
 */

import { M_PER_WU } from '../core/math.js';
import { BANDS, CRUISE_MS } from '../core/bands.js';
import { ENEMY_BY_ID } from './entities.js';
import { GUN_WU } from './weapons.js';

/**
 * How far ahead of the camera a spawn is placed, DERIVED from two measured
 * numbers rather than chosen:
 *
 *   frame forward reach   888 wu — landscape at the clamp floor (D121, measured;
 *                         portrait reaches 404, so landscape is the binding case
 *                         under D123)
 *   effective gun range   GUN_WU.rangeEff = 440 wu (js/sim/weapons.js — imported,
 *                         because a second copy of 440 is the D131 defect)
 *   lead                  888 + 440 = 1,328 wu
 *
 * An attacker placed there cannot open fire until it has closed 440 wu, and it
 * has been inside the frame for every metre of that. **That is §4.4.2 P2 —
 * "an attacker must not reach gun range having never been on screen" — restated
 * as a distance the spawner can honour**, and P2 is the criterion the whole
 * portrait pivot turned on (D121). Spawning at the frame edge instead would
 * reproduce exactly the failure D121 measured at 25.7%.
 */
export const FRAME_REACH_WU = 888;
export const SPAWN_LEAD_WU = FRAME_REACH_WU + GUN_WU.rangeEff;

/** `from: 'above'` — one frame-height up, so the dive starts off the top edge. */
export const SPAWN_ABOVE_WU = 560;      // landscape worldH (D126); the binding profile

/** Lateral stagger inside a group, if the beat does not name one. */
export const GROUP_SPACING_WU = 130 / M_PER_WU;   // 130 m — entities.js's own line-up

const BAND_BY_ID = Object.fromEntries(BANDS.map((b) => [b.id, b]));
const wu2m = (wu) => wu * M_PER_WU;

/**
 * Where in a band an enemy is placed. The band CENTRE, jittered by up to a
 * quarter of its thickness, because a band is a place and the whole point of
 * six of them is that they read differently — putting every spawn on the exact
 * centre line makes a 2,500 wu Lane look like a 700 wu Mud.
 */
function bandY(band, rng) {
  const b = BAND_BY_ID[band] || BAND_BY_ID.belt;
  const mid = (b.y0 + b.y1) / 2;
  const quarter = Math.abs(b.y1 - b.y0) / 4;
  return mid + (rng.next() * 2 - 1) * quarter;
}

export function createSpawner(world, level, opts = {}) {
  const beats = level.beats || [];
  const rng = (world.ctx && world.ctx.rng) || opts.rng;
  if (!rng) throw new Error('createSpawner: no rng — a level must be reproducible from (id, seed)');

  const state = {
    next: 0,                 // the one forward cursor
    maxCamWu: -Infinity,     // the furthest the camera has BEEN, not where it is
    fired: 0,
    poolMisses: 0,           // world.spawn returning null, counted and never swallowed
    unknownTypes: 0,         // a beat naming an enemy the roster does not have
    lastBeat: null,
  };

  // ONE scratch object, reused. Allocating a fresh options literal per spawn is
  // what W8's "no new entity objects after warm-up" is about at the margin, and
  // `world.spawn` copies every field it reads onto the pooled entity.
  const o = { id: '', side: -1, xM: 0, yM: 0, speed: CRUISE_MS, theta: Math.PI, k: 0.6, morale: 0.7 };
  let seq = 0;

  function spawnGroup(b, camWu) {
    const type = ENEMY_BY_ID[b.spawn];
    // Two different faults, two counters. `validate.js` refuses an unknown
    // enemy id at author time; this is the belt to that braces, and lumping it
    // in with pool exhaustion would make a typo look like a capacity problem.
    if (!type) { state.unknownTypes++; return; }
    const n = b.n || 1;
    const spacing = b.spacing !== undefined ? b.spacing : GROUP_SPACING_WU;
    const above = b.from === 'above';
    const leadWu = above ? SPAWN_LEAD_WU / 2 : SPAWN_LEAD_WU;
    for (let i = 0; i < n; i++) {
      const yWu = above ? bandY(b.band, rng) - SPAWN_ABOVE_WU : bandY(b.band, rng);
      o.id = 'b' + state.next + '_' + (seq++);
      o.side = -1;
      o.xM = wu2m(camWu + leadWu + i * spacing);
      o.yM = wu2m(yWu) - i * (spacing * M_PER_WU * 0.5);
      o.speed = CRUISE_MS;
      o.theta = Math.PI;                       // facing back down the level, into the player
      o.k = b.k ?? 0.6;
      o.morale = b.morale ?? 0.7;
      const e = world.spawn(type, o);
      if (!e) { state.poolMisses++; return; }  // pool exhausted — REPORTED, never silent
      if (b.hp) { e.hp.structure = b.hp; e.hpMax.structure = b.hp; }
      if (opts.onSpawn) opts.onSpawn(e, b);
    }
  }

  function fire(b, camWu) {
    state.fired++;
    state.lastBeat = b;
    if (b.spawn) return spawnGroup(b, camWu);
    if (b.crate) {
      // The one crate implementation. `js/sim/crates.js` owns the drop, the
      // canopy and the wind; a second one here is W5's defect in another system.
      const f = world.crates;
      if (f) f.drop({ xM: wu2m(camWu + SPAWN_LEAD_WU), yM: wu2m(b.crate.y), kind: b.crate.kind });
      return;
    }
    // `event`, `boss` and `line` are handed out rather than acted on: they are
    // P10's (the mode shell), P12's (story) and P15's (audio). The spawner's job
    // is to say WHEN, exactly once, in order.
    if (opts.onBeat) opts.onBeat(b, camWu);
  }

  /**
   * Call once per tick with the camera's X in **world units**. Returns how many
   * beats fired this tick. Monotone: a camera that retreats fires nothing, and a
   * camera that returns to ground it has already covered fires nothing either.
   */
  function update(camWu) {
    if (!(camWu > state.maxCamWu)) return 0;
    state.maxCamWu = camWu;
    let n = 0;
    while (state.next < beats.length && beats[state.next].x <= camWu) {
      fire(beats[state.next], camWu);
      state.next++;
      n++;
    }
    return n;
  }

  return {
    update,
    state,
    get remaining() { return beats.length - state.next; },
    get done() { return state.next >= beats.length; },
    reset() {
      state.next = 0; state.maxCamWu = -Infinity;
      state.fired = 0; state.poolMisses = 0; state.unknownTypes = 0; seq = 0;
    },
  };
}

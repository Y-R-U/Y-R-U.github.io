// The FLYING LANE LATTICE — the geometry only, with no traffic on it and no three.js anywhere near
// it, so both the population that fills the lanes (`traffic.js`) and the autopilot that routes
// along them (`autopilot.js`) read one definition instead of two that agree until they do not.
//
// It was all inside `traffic.js` until S2-F. The numbers have not moved: §3.10 #2's seven
// altitudes are a SCALE CUE, not a tunable, and `CORR` is four §3.1 lots because the road canyons
// are on a 51.2 m lattice. `traffic.js` now imports from here and re-exports, so nothing that
// already imported `ALT` from it had to change.
//
// ── the one fact the router needs ─────────────────────────────────────────
//
// A lane FAMILY is an altitude plus the axis it runs along: `a = 0..6`, `alt = ALT[a]`,
// `axis = a & 1` (0 runs along X, 1 runs along Z). Each family's corridors sit at cross
// coordinates congruent to `lanePhase(a, seed)` modulo `CORR`, and the two directions of one
// corridor sit `LANE_SEP` either side of it. `traffic.js` derives its craft positions from exactly
// that, which is why `laneCross()` below can place a route on a real lane rather than near one.
//
// Note what falls out: the phases are multiples of `LOT` and `CORR`/`CT` are whole multiples of
// `LOT` too, so every corridor centre lands on a multiple of 51.2 — which is where
// `materials.js` paints the road centreline. The lanes are directly over the streets. That is not
// a coincidence to rely on quietly, so it is asserted in gates_s2f rather than assumed here.

import { hash2i } from './utils.js';

export const ALT = [30, 55, 85, 120, 160, 210, 270];
export const LOT = 51.2;
export const CORR = LOT * 4;      // 204.8 m between corridors of one lane family
export const NC = 8;              // corridors per cross tile
export const CT = NC * CORR;      // 1638.4 m — the cross period
export const W_TILE = 2048;       // the along period
export const LANE_SEP = 3.4;      // the two directions of one altitude, side by side in one canyon

// Families that run along X, and families that run along Z. `axis = a & 1`, so this is a reading
// of that rule and not a second copy of it.
export const FAM_X = ALT.map((_, a) => a).filter(a => (a & 1) === 0);   // 30, 85, 160, 270
export const FAM_Z = ALT.map((_, a) => a).filter(a => (a & 1) === 1);   // 55, 120, 210

// The per-family corridor offset. `traffic.js`'s `buildLanes` calls this; so does the router.
export function lanePhase(family, seed) {
  return (hash2i(family, 7, seed ^ 0x2f11) % 4) * LOT;
}

// The nearest legal corridor centre of `family` to a cross coordinate. For an X family the cross
// coordinate is z; for a Z family it is x.
export function laneCross(family, seed, v) {
  const p = lanePhase(family, seed);
  return p + Math.round((v - p) / CORR) * CORR;
}

// Which side of the corridor a craft travelling in `dir` (+1 / -1) along the axis belongs on.
export const laneSide = (cross, dir) => cross + (dir >= 0 ? 1 : -1) * LANE_SEP;

// ── the ROAD corridor lattice ─────────────────────────────────────────────
//
// The street population in `traffic.js` is tiled the same way the flying one is, and the same
// argument applies: `js/tunnels.js` has to place a tunnel mouth on exactly the line a bus drives
// down, so the two must not each own a copy of the arithmetic.
//
// The non-obvious fact, and the one the tunnel placement rests on: a road corridor's cross
// coordinate is FIXED IN WORLD SPACE even though `roadPosOf` snaps its tile to the camera. The
// snap moves in whole `R_CT` steps and `R_CT` is exactly `R_NC * CORR`, so the set of cross
// coordinates the snap can produce is `roadPhase(a) + n * CORR` for integer n, whatever the camera
// does. Camera motion changes WHICH two corridors of a family are populated, never where they are.
//
// A vehicle then sits `R_LANE` to its own side of that centre, so the line it actually drives —
// `roadLine` — is what a portal has to be centred on. `roadPhase` IS what `buildRoadLanes` calls,
// so there is one derivation rather than two that agree until they do not; gates_tunnel T1 still
// asserts the portal lattice against the population's own lanes, because one function being used
// twice is a reason to expect agreement and not evidence of it.
export const R_LANE = 3.3;        // half the 13.2 m carriageway, minus a kerb margin
export const R_NC = 2;            // corridors per cross tile — a tenth the flying field's traffic
export const R_CT = R_NC * CORR;  // 409.6 m
export const R_FAM = 4;           // four families x two directions = traffic.js's R_NL

// `js/traffic.js` is NOT built with the world seed — main.js salts it, and the salt lives here
// now rather than as a literal at three call sites. `roadPhase`'s `seed` is therefore the TRAFFIC
// seed, i.e. `trafficSeed(city.seed)`, and passing the world seed instead silently produces a
// plausible lattice that is nowhere near the streets the buses actually drive.
export const TRAFFIC_SALT = 0x7a11;
export const trafficSeed = citySeed => (citySeed ^ TRAFFIC_SALT) | 0;

// The `^ 0x5b21` is `buildRoadLanes`'s own, carried over unchanged. S2-N briefly had a second
// `^ 0x2ab7` in here as well, from a mistaken belief that this would be called with the WORLD seed
// and had to compensate; it is called with the traffic seed at both sites. The extra salt was
// harmless to the FEATURE — both consumers read the same function, so the portals sat on the lanes
// either way — and that is exactly why nothing caught it: every gate compares the build against
// itself. What it actually did was move all four road families off the streets the shipped build
// drove, silently. gates_tunnel T1b now pins the phases to the shipped values.
export function roadPhase(family, seed) {
  return (hash2i(family, 23, seed ^ 0x5b21) % 4) * LOT;
}

// The distinct road TRAVEL lines — deduplicated, because two families CAN roll the same phase on
// the same axis and then drive down the same street, and a portal placed once per family would be
// two coplanar quads z-fighting. This comment used to say families 1 and 3 do exactly that on the
// shipped seed; they do not — the phases are 102.4, 0, 0, 153.6, so the collision is between 1 and
// 2, which are different axes and never shared a line. The dedup is still right, and gates_road R7
// asserts the case it guards against does not arise on this seed rather than leaving it to a
// comment: two families on ONE axis sharing a phase would put twelve vehicles into ten slots.
export function roadLines(seed) {
  const out = [], seen = new Set();
  for (let a = 0; a < R_FAM; a++) {
    const axis = a & 1, phase = roadPhase(a, seed);
    for (const dir of [-1, 1]) {
      const key = axis + ':' + Math.round((phase + dir * R_LANE) * 16);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ axis, phase, dir, off: phase + dir * R_LANE });
    }
  }
  return out;
}

// ── why the street population moves on a lattice, at one speed ────────────
//
// Aaron, on the shipped build: *"trains go through each other, one needs to wait for the other."*
// Measured off the real `roadList` over 100 s: 1,570 overlapping pairs SAME LANE SAME DIRECTION
// (a 16.5 m/s tram driving through a 10.6 m/s bus from behind — there is no following behaviour
// and there cannot be one, because `roadPosOf` is a pure function of time) and 77 at a crossing.
//
// Both fall out of one arithmetic fact. Write an axis-0 vehicle's offset from a junction as
// `F` and an axis-1 vehicle's offset from the same junction as `G`. If the two share a speed then
// `F - G` (same direction sign) or `F + G` (opposite) is CONSTANT for all time — the `vt` terms
// cancel. An overlap needs `|F| < h1` and `|G| < h0` at the same instant, so it needs
// `|F ∓ G| < h0 + h1`; keep that constant away from zero and the pair can never touch, forever,
// with no state and no integration. `h0 + h1` is at worst `(32 + 3)/2 * 2 = 35 m`, two hauliers.
//
// What the constant is: the tile snaps are whole multiples of `CORR` and the ±`R_LANE` terms
// cancel with the direction, so it reduces to `(phase_p ∓ phase_q) + (A_p ∓ A_q)` mod `CORR`,
// where `A` is a vehicle's along offset. Give every vehicle an `A` on the `CORR` lattice with the
// per-lane offset below — its axis's base MINUS its own family phase, which is what absorbs the
// phase term — and the constant is ±`LOT` for every crossing pair on every seed.
//
// `LOT` (51.2 m) is the ceiling, not a choice. The four road phases are multiples of `LOT`, and
// the opposite-direction case picks up `2*(phase_p + phase_q)`, which is `0` or `2*LOT` mod
// `CORR`; a margin that has to clear both is at most `LOT/2` away from each, i.e. `LOT`. So the
// budget for the give-way hold below is `LOT - 35 = 16.2 m`, and R_HOLD spends 12 of it.
//
// Same lane, same direction falls out for free: one speed means constant spacing, and the lattice
// puts the closest two vehicles a whole `CORR` = 204.8 m apart — six times the longest hull.
export const R_SPEED = 12;             // m/s — 43 km/h, the mean of the 8–17 m/s spread it replaces
export const R_SLOTS = W_TILE / CORR;  // 10 along slots per tile

// Which axis yields. Aaron: *"perhaps have one direction always give way to another to keep it
// simple?"* — so it is a fixed rule and not a negotiation. Axis 1 is the one that can carry it:
// the junctions on a Z street are the X families' phases, and on the shipped seed those are
// evenly spaced at 102.4 m, where the X street's junctions are not.
export const R_YIELD_AXIS = 1;
export const R_HOLD = 12;              // metres of lag at a full yield — see the budget above
// The width of the deceleration ramp. A smoothstep's peak slope is 1.5, so `dλ/du` peaks at
// `1.5 * R_HOLD / R_HOLD_W`; at 0.97 the vehicle is down to 3 % of R_SPEED at the stop line and
// AT 1.0 IT WOULD RUN BACKWARDS. That is the only hard constraint on this number.
export const R_HOLD_W = 1.5 * R_HOLD / 0.97;
export const R_HOLD_BASE = 0.4;        // amplitude at a junction with nothing crossing it

// A road lane's along-lattice offset: the axis base, minus the family phase that would otherwise
// land in the crossing constant.
export function roadSlotBase(axis, phase) {
  return ((((axis === R_YIELD_AXIS ? LOT : 0) - phase) % CORR) + CORR) % CORR;
}

// Where a yielding vehicle travelling in `dir` meets cross traffic, as offsets in its own
// increasing-progress coordinate, sorted. One entry per distinct family phase on the other axis:
// a family's two directions sit ±R_LANE either side of its phase, which is one junction and not
// two.
export function roadXings(seed, dir) {
  const out = [];
  for (let a = 0; a < R_FAM; a++) {
    if ((a & 1) === R_YIELD_AXIS) continue;
    const q = (((dir * roadPhase(a, seed)) % CORR) + CORR) % CORR;
    if (!out.some(v => Math.abs(v - q) < 1e-6)) out.push(q);
  }
  return out.sort((p, q) => p - q);
}

// Every travel line of `lines` whose band [line - half, line + half] touches [c0, c1].
export function roadLinesIn(lines, axis, c0, c1, half, out = []) {
  out.length = 0;
  for (const L of lines) {
    if (L.axis !== axis) continue;
    const k0 = Math.ceil((c0 - half - L.off) / CORR), k1 = Math.floor((c1 + half - L.off) / CORR);
    for (let k = k0; k <= k1; k++) out.push({ axis, dir: L.dir, line: L.off + k * CORR });
  }
  return out;
}

// ── the autopilot ladder ──────────────────────────────────────────────────
//
// Four rungs, L0 free. The brief: *"a very slow version is enabled from the start"*, and the
// upgrade buys **intelligence and speed**, never the right to leave the lanes — otherwise the
// ladder would end by turning the autopilot into hand-flying, and hand-flying being the fast
// option is the whole design. `speed` is a fraction of the hull's own MAX_FWD, so a better hull
// makes every rung faster without changing the ordering.
//
//   smart 0  fixed X-then-Z, corridors snapped to the endpoints
//   smart 1  picks the leg order that costs less off-lane alignment
//   smart 2  drops a leg entirely when the trip is already near-aligned on that axis
export const AUTO_LEVELS = [
  { name: 'DRONE', speed: 0.32, famX: 6, famZ: 5, smart: 0 },       // 270 / 210 — over everything
  { name: 'RELAY', speed: 0.50, famX: 4, famZ: 5, smart: 0 },       // 160 / 210
  { name: 'PILOT', speed: 0.70, famX: 4, famZ: 3, smart: 1 },       // 160 / 120
  { name: 'LANEWISE', speed: 0.88, famX: 2, famZ: 3, smart: 2 },    // 85 / 120 — the low fast pair
];

export const autoSpec = lv => AUTO_LEVELS[Math.max(0, Math.min(AUTO_LEVELS.length - 1, lv | 0))];

// ── the router ────────────────────────────────────────────────────────────
//
// Pure: same arguments in, same waypoints out, no THREE and no DOM, so `tools/sim_s2f.mjs` sweeps
// it in node against the same code the browser flies.
//
// Every waypoint carries a `kind`, and the kinds are the honest accounting of what "respects the
// lanes" is actually worth:
//
//   `climb` / `drop`   vertical, over the pad — not on a lane and never claimed to be
//   `align`            the jog onto the corridor. At most CORR/2 + LANE_SEP = 105.8 m, twice
//   `lane`             on a real lane, at a real lane altitude, on the correct side for the
//                      direction of travel
//
// gates_s2f measures the flown path against this classification instead of trusting it.
export function planLaneRoute(from, to, { seed = 0, level = 0 } = {}) {
  const s = autoSpec(level);
  const altX = ALT[s.famX], altZ = ALT[s.famZ];
  const dx = to.x - from.x, dz = to.z - from.z;

  // smart 2 drops an axis the trip barely moves on. Under CORR/2 the alignment jog would be
  // longer than the leg it is aligning for, which is a detour dressed up as a route.
  const skipX = s.smart >= 2 && Math.abs(dx) < CORR / 2;
  const skipZ = s.smart >= 2 && Math.abs(dz) < CORR / 2;

  // A leg shorter than this is a jog, not a lane run, and is labelled `align` — it can be under
  // `2 * LANE_SEP` long, at which point the SIDE of the corridor it should sit on is no longer
  // determined by the direction it travels. The first sweep of 16,000 routes found 231 legs like
  // that, every one of them 6.8 m — exactly `2 * LANE_SEP` — off the lattice, because the side was
  // being taken from the direction of the whole TRIP and the leg was going the other way.
  const MIN_LANE = 12;

  const build = order => {
    const w = [];
    const push = (x, y, z, kind) => w.push({ x, y, z, kind });
    const runX = !skipX, runZ = !skipZ;

    if (!runX && !runZ) {                       // both axes tiny: straight up, across, down
      const y = Math.max(altZ, to.y + 40);
      push(from.x, y, from.z, 'climb');
      push(to.x, y, to.z, 'align');
      push(to.x, to.y, to.z, 'drop');
      return w;
    }

    if (!runX || !runZ) {                       // one leg only
      const alongX = runX;
      const alt = alongX ? altX : altZ;
      // Snapped to the DESTINATION: a single-leg route ends on this corridor, so the jog belongs
      // at the start where the craft is climbing anyway.
      const centre = laneCross(alongX ? s.famX : s.famZ, seed, alongX ? to.z : to.x);
      const dir = alongX ? (dx >= 0 ? 1 : -1) : (dz >= 0 ? 1 : -1);
      const cross = laneSide(centre, dir);
      push(from.x, alt, from.z, 'climb');
      if (alongX) {
        push(from.x, alt, cross, 'align');
        push(to.x, alt, cross, Math.abs(to.x - from.x) >= MIN_LANE ? 'lane' : 'align');
        push(to.x, alt, to.z, 'align');
      } else {
        push(cross, alt, from.z, 'align');
        push(cross, alt, to.z, Math.abs(to.z - from.z) >= MIN_LANE ? 'lane' : 'align');
        push(to.x, alt, to.z, 'align');
      }
      push(to.x, to.y, to.z, 'drop');
      return w;
    }

    // Two legs. The corridor CENTRES come first and the sides second, because the side encodes the
    // direction of the leg that will run on it — and that direction is the sign of the distance to
    // the corridor, which is not the sign of the trip.
    if (order === 'xz') {
      const cz = laneCross(s.famX, seed, from.z);   // the X run's corridor (a z)
      const cx = laneCross(s.famZ, seed, to.x);     // the Z run's corridor (an x)
      const runZc = laneSide(cz, cx - from.x >= 0 ? 1 : -1);
      const runXc = laneSide(cx, to.z - cz >= 0 ? 1 : -1);
      push(from.x, altX, from.z, 'climb');
      push(from.x, altX, runZc, 'align');
      push(runXc, altX, runZc, Math.abs(runXc - from.x) >= MIN_LANE ? 'lane' : 'align');
      push(runXc, altZ, runZc, 'turn');
      push(runXc, altZ, to.z, Math.abs(to.z - runZc) >= MIN_LANE ? 'lane' : 'align');
      push(to.x, altZ, to.z, 'align');
      push(to.x, to.y, to.z, 'drop');
    } else {
      const cx = laneCross(s.famZ, seed, from.x);   // the Z run's corridor (an x)
      const cz = laneCross(s.famX, seed, to.z);     // the X run's corridor (a z)
      const runXc = laneSide(cx, cz - from.z >= 0 ? 1 : -1);
      const runZc = laneSide(cz, to.x - cx >= 0 ? 1 : -1);
      push(from.x, altZ, from.z, 'climb');
      push(runXc, altZ, from.z, 'align');
      push(runXc, altZ, runZc, Math.abs(runZc - from.z) >= MIN_LANE ? 'lane' : 'align');
      push(runXc, altX, runZc, 'turn');
      push(to.x, altX, runZc, Math.abs(to.x - runXc) >= MIN_LANE ? 'lane' : 'align');
      push(to.x, altX, to.z, 'align');
      push(to.x, to.y, to.z, 'drop');
    }
    return w;
  };

  const score = w => {
    let total = 0, lane = 0, off = 0, vert = 0;
    let p = from;
    for (const q of w) {
      const d = Math.hypot(q.x - p.x, q.z - p.z), dy = Math.abs(q.y - p.y);
      total += d + dy;
      if (q.kind === 'lane') lane += d;
      else if (q.kind === 'align') off += d;
      vert += dy;
      p = q;
    }
    return { total, lane, off, vert };
  };

  // smart 0 never chooses. The order is a real lever — it decides which end pays which alignment
  // jog — and a pilot that cannot see that is what "intelligence" is being bought away from.
  const xz = build('xz');
  if (s.smart < 1) return { legs: xz, order: 'xz', level: s, ...score(xz) };
  const zx = build('zx');
  const a = score(xz), b = score(zx);
  return b.total < a.total
    ? { legs: zx, order: 'zx', level: s, ...b }
    : { legs: xz, order: 'xz', level: s, ...a };
}

// Straight-line distance a hand-flying player would cover, for the comparison the design rests on:
// the autopilot has to be the SLOW option at every rung.
export function directLength(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z) + Math.abs(to.y - from.y);
}

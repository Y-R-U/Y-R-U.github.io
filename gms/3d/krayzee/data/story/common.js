// Shared bits for story missions 2+: route geometry around the active runway and the landing/finish steps.
import { runwayEnd, fromRunway } from '../../js/flight/routes.js';
import { DEFAULT_SPOT } from '../../js/game/finish.js';
import * as L from '../../js/world/layout.js';
import { terrainHeight } from '../../js/world/terrain.js';
import { KINGDOM, offsetM } from '../airports/kingdom.js';

export const KT = 0.514444;
export const CRIMES = new Set(['tower_buzz', 'terminal_buzz', 'low_pass', 'cut_in_final', 'queue_jump', 'unauth_takeoff', 'runway_steal', 'formation', 'near_miss', 'forced_goaround', 'intersection_dash', 'double_occupancy', 'closed_runway', 'wrong_way']);
export const CHURCH = [125, 60, -1605];
export const CASTLE_GATE = [780, 175, -2300];
export const d2 = (s, p) => Math.hypot(s.x - p[0], s.z - p[p.length === 3 ? 2 : 1]);
export const rwEnd = runwayEnd;

// fromRunway (s along the landing direction from the threshold, l lateral) on the circuit side: south of the field
// for both 09 and 27 (circuits never fly over the terminal). side: 'south' | 'north'.
export function at(e, s, l, side = 'south') {
  const a = fromRunway(e, s, l), b = fromRunway(e, s, -l);
  return (side === 'south') === (a[1] > b[1]) ? a : b;
}
// runway-frame position of a snapshot / entity: { s, l } with l signed (south +)
export function rwPos(e, x, z) {
  const dx = x - e.thr[0], dz = z - e.thr[1];
  let nx = -e.u[1], nz = e.u[0];
  if (nz < 0 || (nz === 0 && nx < 0)) { nx = -nx; nz = -nz; }
  return { s: dx * e.u[0] + dz * e.u[1], l: dx * nx + dz * nz };
}

// Line up on `end` from `side`, PRESS LAND window on the centreline, then a racetrack until LAND is pressed.
// Returns legs + the index of the line-up leg (the route's loop target) and of the LAND window leg.
export function lineUpLegs(e, side = 'south', base = 0, near = false, heavy = false) {
  if (heavy) return heavyLineUp(e, side, base, typeof heavy === 'number' ? heavy : 1);
  const k = near ? 0.72 : 1;
  const [p0x, p0z] = at(e, -3400 * k, 900 * k, side), [p1x, p1z] = fromRunway(e, -2600 * k, 0), [p2x, p2z] = fromRunway(e, -1500 * k, 0);
  const [p3x, p3z] = at(e, -1100 * k, 1000, side), [p4x, p4z] = at(e, -3300 * k, 1000, side);
  return {
    legs: [
      { kind: 'fly', to: [p0x, 230, p0z], speed: 95, flaps: 0, label: 'POSITIONING' },
      { kind: 'fly', to: [p1x, near ? 160 : 210, p1z], speed: 88, flaps: 0, label: 'LINE UP' },
      { kind: 'fly', to: [p2x, near ? 110 : 170, p2z], speed: 80, flaps: 0, clearance: near ? 60 : undefined, label: 'PRESS LAND' },
      { kind: 'fly', to: [p3x, 220, p3z], speed: 88, flaps: 0, label: 'GO ROUND' },
      { kind: 'fly', to: [p4x, 230, p4z], speed: 92, flaps: 0, label: 'GO ROUND' },
    ],
    lineUp: base + 1, landWindow: base + 2,
  };
}

// Heavies (Herc, Jumbo) turn wide: line up 4 km out so they are straight by the LAND window, press LAND ~1.3 km out.
// k < 1 pulls the racetrack in (C-Tower 1: hills beyond 5 km east)
function heavyLineUp(e, side, base, k = 1) {
  const P = (s, l, a, label, speed) => { const [x, z] = l ? at(e, s * (s < -1300 ? k : 1), l * k, side) : fromRunway(e, s < -1300 ? s * k : s, 0); return { kind: 'fly', to: [x, a, z], speed, flaps: 0, label }; };
  return {
    legs: [
      P(-5600, 1500, 300, 'POSITIONING', 95), P(-4200, 0, 250, 'LINE UP', 88), { ...P(-1250, 0, 125, 'PRESS LAND', 80), clearance: 60 },
      P(-1500, 1500, 260, 'GO ROUND', 90), P(-5200, 1500, 300, 'GO ROUND', 92),
    ],
    lineUp: base + 1, landWindow: base + 2,
  };
}

// Back into the air from wherever the plane stopped: towed to the runway first when it is far off (D22 skip),
// then DEMAND TAKEOFF. Returns true when it towed.
export function relaunch(c) {
  const e = rwEnd(c.route.end), p = rwPos(e, c.s.x, c.s.z);
  const far = Math.abs(p.l) > 250 || p.s < -400 || p.s > e.len + 400;
  if (far) c.host.skipToRunway();
  setTimeout(() => c.host.demandTakeoff(), far ? 600 : 0);
  return far;
}

// Runway dead ahead: lined up within 25° and 350 m of the centreline, still short of the threshold. LAND goes for the
// runway from here (from anywhere else it may pick a field). Sets c.mflag.landCue (tests read it).
export function landCue(c) {
  const e = runwayEnd(c.route.end), p = rwPos(e, c.s.x, c.s.z);
  const dh = Math.abs(((c.s.heading - e.hdg + 540) % 360) - 180);
  // heavies (route.heavy) turn too wide to be dead straight 1.6 km out: LAND plans its own long final from further away
  const ok = c.route.heavy ? !c.s.onGround && dh < 55 && Math.abs(p.l) < 900 && p.s < -900 && p.s > -4500
    : !c.s.onGround && dh < 25 && Math.abs(p.l) < 300 && p.s < -350 && p.s > -1600;
  c.mflag.landCue = ok;
  return ok;
}

// The tail every mission shares: press LAND (when the route has a LAND window), touch down, stop, DEMAND IT.
export function finishSteps({ landCoach, landTick = null, demandCoach, demandTick = 'land', onDemand = null } = {}) {
  return [
    {
      id: 'land',
      coach: landCoach || (() => 'The autopilot lines you up: press <b>LAND</b> once the runway is dead ahead.'),
      target: (c) => ({ pos: c.route.threshold, label: `RWY ${c.route.end}` }),
      enter: (c) => { c.host.clearArrivals(); if (!c.s.landing && c.route.marks.lineUp != null && c.s.legIndex < c.route.marks.lineUp - 1) c.host.setRoute(c.route, c.route.marks.lineUp - 1); },
      update: (c) => { landCue(c); c.showLandButton(c.s.landing || c.s.legIndex >= c.route.marks.landWindow); },
      done: (c) => c.s.landing || c.s.onGround,
      hint: { after: 50, text: () => 'Point the nose at the runway, then press <b>LAND</b>.' },
      tick: landTick,
    },
    {
      id: 'touchdown',
      noRelaunch: true,
      coach: () => 'Hands off. The autopilot flies the approach, flares, and stops.',
      enter: (c) => c.host.clearArrivals(),
      // keep the runway clear, and if the approach keeps going round (traffic, a busy tower), set it up again
      update: (c) => {
        if ((c.flag.clrT = (c.flag.clrT || 0) + 1) % 600 === 0) c.host.clearArrivals();
        // never pull a low approach out from under the autopilot (a low, slow hand-back ends in RECOVERY)
        if (c.stepT > 200 && !c.s.onGround && c.s.agl > 150 && !c.flag.redo) {
          c.flag.redo = 1; c.host.cancelLand(); c.host.setRoute(c.route, c.route.marks.lineUp != null ? c.route.marks.lineUp - 1 : 0);
          c.setCoach('Gone round once too often. The autopilot sets you up again.'); c.goto('land');
        }
      },
      done: (c) => c.s.onGround && c.s.gsKt < 6,
      warpHold: 'Landing',
    },
    {
      id: 'stop',
      noRelaunch: true,
      coach: (c) => ({ easy: 'Stopped near the runway. That will do nicely.', medium: 'You must stop <b>on the runway</b> or the terminal apron.', hard: 'Hard rules: taxi to the <b>marked stand</b> at the terminal.' })[c.diff],
      target: (c) => (c.diff === 'hard' ? { pos: [DEFAULT_SPOT.x, 2, DEFAULT_SPOT.z], label: DEFAULT_SPOT.id } : null),
      enter: (c) => { if (c.diff === 'hard') c.host.taxiTo(DEFAULT_SPOT.id); },
      // LAND picked a field instead of the runway: DEMAND TAKEOFF out of it and go round for the runway
      update: (c) => {
        const s = c.s;
        if (!c.flag.lost && s.onGround && s.gsKt < 4 && c.stepT > 8 && s.finishState && s.finishState !== 'ready' && c.diff !== 'hard') {
          c.flag.lost = 1; c.flag.lostT = c.stepT;
          c.setCoach('Lovely field. Wrong one. The Royal Tow Truck is on its way; then back up for the runway.');
        }
        if (c.flag.lost === 1 && c.stepT - c.flag.lostT > 3) { c.flag.lost = 2; relaunch(c); }
        if (c.flag.lost && !s.onGround && s.agl > 40) { c.flag.lost = 0; c.host.setRoute(c.route, c.route.marks.lineUp != null ? c.route.marks.lineUp - 1 : 0); c.goto('land'); }
      },
      done: (c) => !c.flag.lost && (c.s.finishState === 'ready' || (c.s.finishState == null && c.s.onGround && c.s.gsKt < 4 && c.stepT > 1)),
    },
    {
      id: 'demand',
      noRelaunch: true,
      coach: demandCoach || (() => 'Now press <b>LANDED — DEMAND IT</b> to bank your Privilege.'),
      update: (c) => { c.showDemandButton(c.s.finishState == null); },
      done: (c) => c.count('finished') > 0 && (!onDemand || onDemand(c)),
      tick: demandTick,
    },
  ];
}

// "Is the player (or a rival) on/near final for `e`?" helper for missions that play with the approach.
export function onFinal(e, x, z, maxOut = 5000, halfW = 350) {
  const p = rwPos(e, x, z);
  return p.s < 200 && p.s > -maxOut && Math.abs(p.l) < halfW ? p : null;
}

// ---------- STORY3: the Kingdom Map (D29) — trips between airports and low passes over their towers ----------
export const here = () => L.AIRPORT?.id || 'royal';
// metres above the ground at (x, z) (the airfield's own height when no point is given), as the AP's altitude
export const msl = (agl, x = 0, z = 0) => { try { return terrainHeight(x, z) + agl; } catch (e) { return (L.ELEV || 0) + agl; } };
const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
export const towerXZ = () => [L.TOWER.position[0], L.TOWER.position[2]];
// unit vector from airport `from` to `to` (kingdom km)
export function tripDir(from, to) { const [ox, oz] = offsetM(from, to), n = Math.hypot(ox, oz) || 1; return [ox / n, oz / n]; }

// The leg out of here toward airport `to`, well past the magic-cloud line (js/map/index.js swaps at 4 km out).
export function tripLeg(to, a = 330, speed = 100) {
  const [ux, uz] = tripDir(here(), to), c = L.AIRPORT.center || [0, 0];
  return { kind: 'fly', to: [c[0] + ux * 8500, msl(a), c[1] + uz * 8500], speed, flaps: 0, label: `TO ${KINGDOM[to].short.toUpperCase()}` };
}
// airborne start `out` m from here, already pointing at airport `to`
export function tripStart(to, { a = 240, speedKt = 95, out = 1300, throttle = 0.7 } = {}) {
  const [ux, uz] = tripDir(here(), to), c = L.AIRPORT.center || [0, 0];
  return { air: { x: c[0] + ux * out, z: c[1] + uz * out, alt: msl(a), heading: bearingOf(ux, uz), speedKt, throttle } };
}
// where a trip from `from` comes out of the clouds here (~5.5 km out on the line between the two airports)
export function arrivalPoint(from) {
  const [ux, uz] = tripDir(from, here()), c = L.AIRPORT.center || [0, 0];
  return [c[0] - ux * 5500, c[1] - uz * 5500];
}

// A low pass by point T coming from `from` ([x, z]): lead-in, the pass (`off` m to the side, `a` m up), climb away.
// clearance: the AP will not sink below ground + clearance + 40 m (Autopilot._fly floor), so a short tower needs a small one
export function passLegs(T, from, { off = 20, a = 40, lead = 900, leadA = a + 35, speed = 85, clearance = Math.max(0, Math.min(25, (L.TOWER?.height ?? 38) - 12)), label = 'TOWER' } = {}) {
  let ux = T[0] - from[0], uz = T[1] - from[1];
  const n = Math.hypot(ux, uz) || 1; ux /= n; uz /= n;
  const px = T[0] - uz * off, pz = T[1] + ux * off, g = msl(0, T[0], T[1]);   // heights over the tower's ground
  return [
    { kind: 'fly', to: [px - ux * lead, g + leadA, pz - uz * lead], speed, flaps: 0, clearance: 40, label: `TO THE ${label}` },
    { kind: 'fly', to: [px - ux * 250, g + a, pz - uz * 250], speed, flaps: 0, clearance, label },
    { kind: 'fly', to: [px, g + a, pz], speed, flaps: 0, clearance, label },
    { kind: 'fly', to: [px + ux * 800, g + a + 70, pz + uz * 800], speed: speed + 5, flaps: 0, label: 'CLIMB AWAY' },
  ];
}

// A tower pass with a way back round: [round 1, round 2, lead-in, pass, pass, climb away]. Start at `arrive` (the
// lead-in); a missed pass goes back to `towerIn` (round 1: out past the tower and back in behind the lead-in).
export function towerRun(from, o = {}) {
  const T = towerXZ(), pass = passLegs(T, from, o), g = msl(0, T[0], T[1]);
  let ux = T[0] - from[0], uz = T[1] - from[1];
  const n = Math.hypot(ux, uz) || 1; ux /= n; uz /= n;
  const lead = o.lead ?? 900, w = (o.wide ?? 1100) * (o.side ?? 1), a = (o.a ?? 40) + 110;
  const round = [
    { kind: 'fly', to: [T[0] + ux * 1400 - uz * w, g + a, T[1] + uz * 1400 + ux * w], speed: o.speed ?? 85, flaps: 0, label: 'ROUND AGAIN' },
    { kind: 'fly', to: [T[0] - ux * (lead + 1300) - uz * w, g + a, T[1] - uz * (lead + 1300) + ux * w], speed: o.speed ?? 85, flaps: 0, label: 'ROUND AGAIN' },
  ];
  return { legs: [...round, ...pass], arrive: 2, towerIn: 0, towerOut: round.length + pass.length - 1 };
}

// The magic-cloud step: the autopilot flies the trip leg, the map swaps the airport, the route is rebuilt there.
export function tripStep(to, { id = 'clouds', coach, tick = null, hint, agl } = {}) {
  return {
    id, tick,
    coach: coach || (() => `Hands off: the autopilot heads for <b>${KINGDOM[to].short}</b>. Magic clouds roll in about 4 km out. Tap <b>5×</b> if you are in a hurry.`),
    enter: (c) => { if (c.host.airport() !== to) c.trip(to, agl); },
    target: (c) => { const t = c.host.tripTarget(); return t ? { pos: t.pos, label: t.label } : null; },
    update: (c) => { if (c.host.airport() === to && !c.mflag.arrived) c.mflag.arrived = to; },
    done: (c) => c.host.airport() === to && c.mflag.arrived === to && !c.host.tripPhase(),
    hint: hint || { after: 150, text: () => `Keep going: the gold marker is <b>${KINGDOM[to].short}</b>. The clouds come about 4 km out.` },
  };
}

// The tower buzz at whatever airport is loaded: the route flies the pass (low on Easy); missed → round again.
// lo: { easy: { off, a }, medium, hard }; the tick is the mission's (onEvent tower_buzz), this only steers and loops.
export function buzzStep({ id = 'buzz', obj, coach, lo, label = 'C-TOWER' }) {
  return {
    id,
    coach,
    target: () => { const [x, z] = towerXZ(); return { pos: [x, msl(L.TOWER.height + 8, x, z), z], label }; },
    update: (c) => {
      const m = c.route.marks;
      if (c.ticked(obj) || c.s.onGround || m.towerIn == null) return;
      if (c.s.legIndex > m.towerOut && !c.flag.loop) {
        c.flag.loop = 1;
        c.setCoach(Math.abs(lo?.[c.diff]?.off ?? 0) > 60 ? 'Missed. Round again: <b>lower</b>, and right over the tower.' : 'Not close enough. The autopilot goes round for another pass.');
        c.host.setRoute(c.route, m.towerIn);
      }
      if (c.s.legIndex <= m.towerOut) c.flag.loop = 0;
    },
    done: (c) => c.ticked(obj),
    hint: { after: 120, text: () => 'Get <b>low</b> and right over the tower: under 40 m above it, within 80 m.' },
  };
}

// Line-up racetrack for `e` from leg `base`, then a takeoff leg (a relaunch after a crash or a wrong field starts there;
// in flight the AP skips it straight back into the racetrack).
export function landingTail(e, base, side = 'south', near = true, heavy = false) {
  const L = lineUpLegs(e, side, base, near, heavy);
  return { legs: [...L.legs, { kind: 'takeoff', end: e.id, label: 'TAKEOFF' }], loop: base, lineUp: L.lineUp, landWindow: L.landWindow, relaunch: base + L.legs.length };
}

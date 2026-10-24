// Shared bits for story missions 2+: route geometry around the active runway and the landing/finish steps.
import { runwayEnd, fromRunway } from '../../js/flight/routes.js';
import { DEFAULT_SPOT } from '../../js/game/finish.js';

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
export function lineUpLegs(e, side = 'south', base = 0, near = false) {
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
  const ok = !c.s.onGround && dh < 25 && Math.abs(p.l) < 300 && p.s < -350 && p.s > -1600;
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

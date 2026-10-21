// D17 guided first mission. Steps run in order; each shows one short coach line. Spec + framework: docs/STORY.md.
// c = mission context: c.s (snapshot), c.diff ('easy'|'medium'|'hard'), c.touch, c.stepT, c.since(type, pred?), c.host, c.flag.
import { runwayEnd, fromRunway } from '../../js/flight/routes.js';
import { TOWER, STANDS } from '../../js/world/layout.js';
import { CASTLE } from '../../js/world/terrain.js';
import { DEFAULT_SPOT } from '../../js/game/finish.js';

const KT = 0.514444;
const CRIMES = new Set(['tower_buzz', 'terminal_buzz', 'low_pass', 'cut_in_final', 'queue_jump', 'unauth_takeoff', 'runway_steal', 'formation', 'near_miss', 'forced_goaround', 'intersection_dash', 'double_occupancy', 'closed_runway', 'wrong_way']);
const d2 = (s, p) => Math.hypot(s.x - p[0], s.z - p[2]);

// Tower pass by difficulty: Easy flies straight over the cab low enough to count; Medium/Hard leave the crime to you.
const TOWER_PASS = { easy: { off: 40, alt: 62 }, medium: { off: 150, alt: 115 }, hard: { off: 240, alt: 150 } };
export const CASTLE_PT = [CASTLE.x, CASTLE.top + 40, CASTLE.z];
export const TOWER_PT = [TOWER.position[0], TOWER.height + 6, TOWER.position[2]];

// The mission's autopilot route for departure/landing end `end`. Index markers are returned so steps can rewind.
export function mission1Route(end = '27', diff = 'medium') {
  const e = runwayEnd(end);
  const [cx, cz] = fromRunway(e, e.len + 700, 0);
  const tp = TOWER_PASS[diff] || TOWER_PASS.medium;
  const tx = TOWER.position[0], tz = TOWER.position[2];
  const ix = -300, iz = -950;
  const ux = tx - ix, uz = tz - iz, ul = Math.hypot(ux, uz), dx = ux / ul, dz = uz / ul;
  const px = tx + dz * tp.off, pz = tz - dx * tp.off;
  const south = (s, l) => { const a = fromRunway(e, s, l), b = fromRunway(e, s, -l); return a[1] > b[1] ? a : b; };
  // landing setup: line up on `end` from the far side, then a racetrack until LAND is pressed
  const [p0x, p0z] = south(-3500, 800), [p1x, p1z] = fromRunway(e, -2600, 0), [p2x, p2z] = fromRunway(e, -1500, 0);
  const [p3x, p3z] = south(-1100, 1000), [p4x, p4z] = south(-3300, 1000);
  const legs = [
    { kind: 'taxi', dest: { hold: end }, label: 'TAXI' },
    { kind: 'hold', end, seconds: 3, untilClear: true, label: 'HOLD SHORT' },
    { kind: 'takeoff', end, label: 'TAKEOFF' },
    { kind: 'fly', to: [cx, 170, cz], speed: 76, flaps: 0, label: 'CLIMB OUT' },
    { kind: 'fly', to: [-250, 250, -1600], speed: 92, flaps: 0, label: 'TO THE CASTLE' },
    { kind: 'fly', to: [480, 200, -2050], speed: 90, flaps: 0, label: 'CASTLE' },
    { kind: 'fly', to: [1120, 200, -1980], speed: 90, flaps: 0, label: 'CASTLE' },
    { kind: 'fly', to: [ix, Math.max(90, tp.alt + 20), iz], speed: 88, flaps: 0, clearance: 40, label: 'TO THE TOWER' },
    { kind: 'fly', to: [px - dx * 700, tp.alt - 8, pz - dz * 700], speed: 85, flaps: 0, clearance: 25, label: 'TOWER' },
    { kind: 'fly', to: [px, tp.alt - 8, pz], speed: 85, flaps: 0, clearance: 25, label: 'TOWER' },
    { kind: 'fly', to: [px + dx * 700, tp.alt + 60, pz + dz * 700], speed: 90, flaps: 0, label: 'CLIMB AWAY' },
    { kind: 'fly', to: [p0x, 230, p0z], speed: 95, flaps: 0, label: 'POSITIONING' },
    { kind: 'fly', to: [p1x, 210, p1z], speed: 88, flaps: 0, label: 'LINE UP' },
    { kind: 'fly', to: [p2x, 170, p2z], speed: 80, flaps: 0, label: 'PRESS LAND' },
    { kind: 'fly', to: [p3x, 220, p3z], speed: 88, flaps: 0, label: 'GO ROUND' },
    { kind: 'fly', to: [p4x, 230, p4z], speed: 92, flaps: 0, label: 'GO ROUND' },
  ];
  return { name: `mission 1 ${end}`, legs, loop: 12, marks: { castle: 4, towerIn: 7, towerOut: 11, lineUp: 12, landWindow: 13 }, threshold: [e.thr[0], 1, e.thr[1]], end };
}

export const MISSION_1 = {
  id: 1,
  title: 'Letters Patent',
  subtitle: 'Your first flight as a peer of the realm',
  tower: 'toby',
  start: { stand: 'S6', heading: 180 },
  route: mission1Route,
  reward: { pp: 400, label: 'Letters Patent sealed' },
  steps: [
    {
      id: 'taxi',
      coach: (c) => c.s.canDemandTakeoff
        ? 'The autopilot taxis you out and waits its turn. Or press <b>DEMAND TAKEOFF</b>: queues are for commoners.'
        : 'The autopilot taxis you out and waits its turn. Tap <b>2×</b> or <b>5×</b> to hurry things along.',
      target: (c) => ({ pos: c.route.threshold, label: `RWY ${c.route.end}` }),
      done: (c) => !c.s.onGround || (c.s.leg === 'takeoff' && c.s.gsKt > 30),
      hint: { after: 45, text: () => 'Stuck behind someone? <b>SKIP TO RUNWAY</b> puts you there at once.' },
    },
    {
      id: 'takeoff',
      coach: () => 'Full power. The autopilot does the takeoff for you.',
      done: (c) => !c.s.onGround && c.s.agl > 120,
    },
    {
      id: 'turn',
      coach: (c) => (c.touch ? '<b>Your turn.</b> Drag the stick to bank towards the castle.' : '<b>Your turn.</b> Arrow keys or WASD: bank towards the castle.'),
      target: () => ({ pos: CASTLE_PT, label: 'CASTLE' }),
      enter: (c) => { c.flag.hdg0 = c.s.heading; c.flag.manualT = 0; c.flag.turned = 0; },
      update: (c, dt) => {
        if (c.s.stick) { c.flag.manualT += dt; c.flag.turned = Math.max(c.flag.turned, Math.abs((((c.s.heading - c.flag.hdg0) + 540) % 360) - 180)); }
      },
      done: (c) => c.flag.manualT > 1.2 && (c.flag.turned > 15 || c.flag.manualT > 3.5),
      hint: { after: 14, text: (c) => (c.touch ? 'Put a thumb on the left side of the screen and drag. Anywhere there.' : 'Press an arrow key and hold it.') },
      warpHold: 'Your turn',
    },
    {
      id: 'letgo',
      coach: () => '<b>Now let go.</b> The autopilot takes back over from wherever you are.',
      done: (c) => !c.s.stick && c.s.apMode === 'AUTOPILOT',
    },
    {
      id: 'radio',
      resumeLeg: (c) => c.route.marks.castle,
      coach: () => 'Lord Rupert Pomfrey-Smythe is on the radio, being rude. <b>Answer him</b>: tap a reply.',
      enter: (c) => {
        if (c.s.legIndex < c.route.marks.castle || c.s.legIndex >= c.route.marks.towerIn) c.host.setRoute(c.route, c.route.marks.castle);
        c.flag.tries = 0; c.flag.next = 0;
      },
      update: (c) => {
        if (c.s.radioWindow) c.flag.win = 1;
        // the radio drops a bark that lands too soon after another response window: ask again until one opens
        if (!c.flag.win && c.flag.tries < 3 && c.stepT >= c.flag.next) { c.host.rivalBark('insult'); c.flag.tries++; c.flag.next = c.stepT + 9; }
        if (!c.flag.again && !c.s.radioWindow && c.stepT > 9 && (c.flag.win || c.flag.tries >= 3)) { c.flag.again = 1; c.setCoach('Tap <b>RADIO</b> and say something to him. Anything.'); }
      },
      done: (c) => c.since('barked') > 0,
      warpHold: 'Radio',
    },
    {
      id: 'castle',
      resumeLeg: (c) => c.route.marks.castle,
      coach: () => 'Follow the <b>gold marker</b> to the castle. Wave at Mother.',
      target: () => ({ pos: CASTLE_PT, label: 'CASTLE' }),
      done: (c) => d2(c.s, CASTLE_PT) < 650,
    },
    {
      id: 'crime',
      resumeLeg: (c) => c.route.marks.towerIn,
      coach: (c) => (c.diff === 'easy'
        ? 'Now a small crime. The autopilot is heading for the <b>control tower</b>. Low. Enjoy it.'
        : 'Now a small crime: <b>buzz the control tower</b>. Steer for it and get down low.'),
      target: () => ({ pos: TOWER_PT, label: 'TOWER' }),
      update: (c) => {
        if (c.s.legIndex >= c.route.marks.towerOut && !c.since('pp', (e) => CRIMES.has(e.id))) {
          c.flag.laps = (c.flag.laps || 0) + 1;
          c.host.setRoute(c.route, c.route.marks.towerIn);
          c.setCoach('Missed it. Round again: <b>lower</b>, and right at the tower.');
        }
      },
      done: (c) => c.since('pp', (e) => CRIMES.has(e.id)) > 0,
      warpHold: (c) => d2(c.s, TOWER_PT) < 1200 && 'Tower ahead',
    },
    {
      id: 'land',
      resumeLeg: (c) => c.route.marks.towerOut,
      coach: () => 'The tower is speechless. The autopilot lines you up: press <b>LAND</b> once the runway is dead ahead.',
      target: (c) => ({ pos: c.route.threshold, label: `RWY ${c.route.end}` }),
      enter: (c) => { if (c.s.legIndex < c.route.marks.towerOut) c.host.setRoute(c.route, c.route.marks.towerOut); },
      update: (c) => { c.showLandButton(c.s.legIndex >= c.route.marks.landWindow); },
      done: (c) => c.s.landing || (c.s.onGround && c.s.leg === 'approach'),
      hint: { after: 50, text: () => 'Point the nose at the runway, then press <b>LAND</b>.' },
    },
    {
      id: 'touchdown',
      noRelaunch: true,
      coach: () => 'Hands off. The autopilot flies the approach, flares, and stops.',
      done: (c) => c.s.onGround && c.s.gsKt < 6,
      warpHold: 'Landing',
    },
    {
      id: 'stop',
      noRelaunch: true,
      coach: (c) => ({ easy: 'Stopped near the runway. That will do nicely.', medium: 'You must stop <b>on the runway</b> or the terminal apron.', hard: 'Hard rules: taxi to the <b>marked stand</b> at the terminal.' })[c.diff],
      target: (c) => (c.diff === 'hard' ? { pos: [DEFAULT_SPOT.x, 2, DEFAULT_SPOT.z], label: DEFAULT_SPOT.id } : null),
      enter: (c) => { if (c.diff === 'hard') c.host.taxiTo(DEFAULT_SPOT.id); },
      done: (c) => c.s.finishState === 'ready' || (c.s.finishState == null && c.s.onGround && c.s.gsKt < 4 && c.stepT > 1),
    },
    {
      id: 'demand',
      noRelaunch: true,
      coach: () => 'Now press <b>LANDED — DEMAND IT</b>. It banks your Privilege, and they refuel you. Naturally.',
      update: (c) => { c.showDemandButton(c.s.finishState == null); },
      done: (c) => c.since('finished') > 0,
    },
  ],
};

export const MISSIONS = { 1: MISSION_1 };
export const STAND_OF = (id) => STANDS.find((s) => s.id === id) || STANDS[5];

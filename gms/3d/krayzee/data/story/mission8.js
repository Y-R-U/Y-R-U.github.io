// Mission 8 "The Owls Evacuate": the Royal Jumbo starts at RAF Much Snoring (C-Tower 4) with four hundred foreign
// royals for the coronation. DEMAND TAKEOFF, home through the magic clouds, buzz C-Tower 1 in the Jumbo (rule-break:
// tower_buzz; Gerald's owls), and land it on C-Tower 1's 1400 m, which it just fits.
import { holdPoint, departureRoute } from '../../js/flight/routes.js';
import * as L from '../../js/world/layout.js';
import { rwEnd, landingTail, finishSteps, tripLeg, tripStep, buzzStep, passLegs, towerXZ, here, msl } from './common.js';

const PASS = { easy: { off: 45, a: 62 }, medium: { off: 170, a: 120 }, hard: { off: 240, a: 150 } };
const TAKEOFFS = new Set(['queue_jump', 'unauth_takeoff', 'runway_steal', 'double_occupancy']);
const QUEUE = [{ type: 'c172', gap: 0 }, { type: 'herc', gap: 75 }];

// the departure queue on the parallel taxiway behind the hold for `end`: two RAF aircraft, then the Jumbo
function queueSlots(end) {
  const h = holdPoint(end), tw = L.TAXIWAYS.find((t) => t.id === L.PARALLEL), tz = tw ? tw.points[0][1] : h[1] - 90;
  const dir = -Math.sign(h[0]) || 1, hdg = dir > 0 ? 270 : 90;
  const e = rwEnd(end), hd = (Math.atan2(e.thr[0] - h[0], -(e.thr[1] - h[1])) * 180 / Math.PI + 360) % 360;
  // the first RAF aircraft already holding short, the second on the taxiway behind, then the Jumbo
  const slots = [{ x: h[0], z: h[1], heading: hd }];
  let x = h[0] + dir * 75;
  for (let k = 1; k < QUEUE.length; k++) { x += dir * QUEUE[k].gap; slots.push({ x, z: tz, heading: hdg }); }
  slots.push({ x: x + dir * 110, z: tz, heading: hdg });
  return slots;
}

export function mission8Route(end = '27', diff = 'medium') {
  const e = rwEnd(end);
  if (here() !== 'royal') {
    return { name: 'mission 8 out', loop: null, end, threshold: [e.thr[0], 1, e.thr[1]], marks: { relaunch: 2, trip: 3 },
      legs: [{ kind: 'taxi', dest: { hold: end }, label: 'TAXI' }, { kind: 'hold', end, seconds: 4, untilClear: true, label: 'HOLD SHORT' },
        { kind: 'takeoff', end, label: 'TAKEOFF' }, tripLeg('royal', 300, 100)] };
  }
  // out of the hills from the east: a wide descending loop south of the field, then the pass eastbound along the runway
  // (the 09 approach, clear of the castle), the tower off the left wing; a Jumbo needs ~10 km to get down to 60 m
  const [tx, tz] = towerXZ(), g = msl(0, tx, tz);
  const down = [
    { kind: 'fly', to: [tx + 2500, g + 300, tz + 3200], speed: 95, flaps: 0, label: 'DESCENDING' },
    { kind: 'fly', to: [tx - 5600, g + 240, tz + 3200], speed: 92, flaps: 0, label: 'DESCENDING' },
    { kind: 'fly', to: [tx - 7000, g + 200, tz + PASS.easy.off], speed: 90, flaps: 0, label: 'DESCENDING' },
  ];
  const pass = passLegs([tx, tz], [tx - 9000, tz], { ...(PASS[diff] || PASS.medium), speed: 90, lead: 3800, leadA: 170, label: 'TOWER' });
  const base = down.length + pass.length, T = landingTail(e, base, 'south', false, 0.72);
  return { name: `mission 8 home ${end}`, heavy: true, legs: [...down, ...pass, ...T.legs], loop: T.loop, end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { arrive: 0, towerIn: 0, towerOut: base - 1, relaunch: T.relaunch, lineUp: T.lineUp, landWindow: T.landWindow } };
}

export const MISSION_8 = {
  id: 8,
  title: 'The Owls Evacuate',
  subtitle: 'Four hundred royals, one Jumbo, one tower',
  tower: 'imogen',
  towerLabel: 'Much Snoring → Gerald',
  aircraft: 'jumbo',
  airport: 'airbase',
  brief: 'Four hundred foreign royals are waiting at RAF Much Snoring with their luggage. Fly them home to Krayzee Royal for the coronation, and give the tower a proper view of the wings.',
  narration: ['n81', 'n82'],
  objectives: [
    { id: 'go', text: 'Jump the RAF\'s queue: DEMAND TAKEOFF', done: 'Pushed past the RAF' },
    { id: 'clouds', text: 'Fly home through the magic clouds', done: 'Home through the clouds' },
    { id: 'buzz', text: 'Buzz C-Tower 1 in the Jumbo', done: 'The owls evacuated' },
    { id: 'land', text: 'Land on 1400 m and DEMAND IT', done: 'Four hundred royals delivered' },
  ],
  diffNote: { easy: 'the autopilot flies the pass by the tower for you.', medium: 'the pass is wide and high: put the Jumbo by the tower yourself.', hard: 'the low pass is yours, and real metal: no bouncing.' },
  outro: 'Forty owls, evacuated in an orderly line. Gerald went with them.',
  start: (c) => ({ ground: queueSlots(c.route.end)[QUEUE.length] }),
  route: mission8Route,
  arriveTower: { royal: 'gerald' },
  reward: { pp: 1100, label: 'Royals delivered' },
  setup: async (c) => {
    const end = c.route.end, e = rwEnd(end), slots = queueSlots(end);
    c.host.clearTraffic((t) => (t.ac.onGround ? Math.hypot(t.ac.pos.x - e.thr[0], t.ac.pos.z - e.thr[1]) < 900 && t.ap.leg?.kind !== 'park' : t.ap.leg?.kind === 'approach'));
    for (let k = 0; k < QUEUE.length; k++) {
      const r = departureRoute(end, { outHeading: e.hdg + (k ? -40 : 35) });
      await c.host.spawn({ id: `raf${k + 1}`, type: QUEUE[k].type, place: slots[k], route: r, gate: () => !!c.mflag.gone });
    }
  },
  onGo: (c) => { setTimeout(() => c.host.say('tower', 'i_jumbo'), 2500); },
  onArrive: (c) => { c.host.clearTraffic((t) => !t.ac.onGround); setTimeout(() => c.host.say('tower', 't_jumbo'), 6000); },
  onEvent: (c, type, d) => {
    if (type === 'pp' && TAKEOFFS.has(d.id) && c.host.airport() === 'airbase') c.tick('go');
    if (type === 'pp' && d.id === 'tower_buzz' && c.host.airport() === 'royal' && !c.ticked('buzz')) { c.tick('buzz'); setTimeout(() => c.host.say('tower', 'g_owls'), 2500); }
  },
  steps: [
    {
      id: 'queue',
      coach: () => 'Third in the queue, behind the RAF. Four hundred royals have trains to catch: press <b>DEMAND TAKEOFF</b>.',
      target: (c) => ({ pos: c.route.threshold, label: `RWY ${c.route.end}` }),
      done: (c) => c.s.demanded || (!c.s.onGround && c.s.agl > 5) || (c.s.leg === 'takeoff' && c.s.gsKt > 35),
      hint: { after: 20, text: () => 'The guests are ringing for the steward. <b>DEMAND TAKEOFF</b>: the button by your thumb.' },
      warpHold: 'Your move',
    },
    {
      id: 'roll',
      coach: () => 'Full power. The Jumbo wants most of the runway, and then some.',
      done: (c) => !c.s.onGround && c.s.agl > 80,
      update: (c) => { if (!c.s.onGround && c.s.agl > 30) c.mflag.gone = 1; },
    },
    tripStep('royal', { tick: 'clouds', agl: 260, coach: () => 'The autopilot heads <b>west-south-west</b>, home to Krayzee Royal. Magic clouds about 4 km out.' }),
    buzzStep({ obj: 'buzz', label: 'C-TOWER 1', lo: PASS,
      coach: (c) => (c.diff === 'easy' ? 'C-Tower 1. The autopilot brings the Jumbo <b>low past the tower</b>. Wave to Gerald.' : 'C-Tower 1. Put the Jumbo <b>low past the tower</b>: within 80 m, under 40 m above it.') }),
    ...finishSteps({
      landCoach: () => 'Owls evacuated. Now 1400 m of runway for four hundred tonnes: press <b>LAND</b> when it is dead ahead.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. Mind the luggage.',
    }),
  ],
};

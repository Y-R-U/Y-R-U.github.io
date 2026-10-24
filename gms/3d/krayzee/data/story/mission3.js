// Mission 3 "Queue Is a Commoner's Word": fifth in the departure queue with nearly empty tanks (D20 fuel).
// DEMAND TAKEOFF out of turn (rule-break: queue_jump / unauth_takeoff), bless the church, LAND, and DEMAND IT,
// which refuels you. The tank is the clock: it drains several times faster than real.
import { holdPoint, departureRoute } from '../../js/flight/routes.js';
import { CHURCH, at, d2, rwEnd, lineUpLegs, finishSteps } from './common.js';

const FUEL = { easy: [0.14, 5], medium: [0.12, 7], hard: [0.1, 8] };
const JUMPS = new Set(['queue_jump', 'unauth_takeoff', 'runway_steal', 'double_occupancy']);
const QUEUE = 3;

// queue slots on the parallel taxiway behind the hold for `end`, nearest first, then the player's slot
function queueSlots(end) {
  const e = rwEnd(end), h = holdPoint(end), tz = -110;
  const dir = -Math.sign(h[0]) || 1;
  const hdg = dir > 0 ? 270 : 90;
  const slots = [];
  for (let k = 0; k <= QUEUE; k++) slots.push({ x: h[0] + dir * (62 + k * 52), z: tz, heading: hdg });
  void e;
  return slots;
}

export function mission3Route(end = '27', diff = 'medium') {
  const e = rwEnd(end);
  const [cx, cz] = at(e, e.len - 100, 300, 'north');
  const L = lineUpLegs(e, 'north', 5, true);
  const legs = [
    { kind: 'taxi', dest: { hold: end }, label: 'TAXI' },
    { kind: 'hold', end, seconds: 3, untilClear: true, label: 'HOLD SHORT' },
    { kind: 'takeoff', end, label: 'TAKEOFF' },
    { kind: 'fly', to: [cx, 140, cz], speed: 80, flaps: 0, label: 'CLIMB OUT' },
    { kind: 'fly', to: [CHURCH[0], 120, CHURCH[2]], speed: 88, flaps: 0, clearance: 50, label: 'TO THE CHURCH' },
    ...L.legs,
  ];
  void diff;
  return { name: `mission 3 ${end}`, legs, loop: L.lineUp, end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { church: 4, lineUp: L.lineUp, landWindow: L.landWindow, relaunch: 2 } };
}

export const MISSION_3 = {
  id: 3,
  title: "Queue Is a Commoner's Word",
  subtitle: 'Taking off out of turn, on fumes',
  tower: 'imogen',
  brief: 'The Bishop is waiting for his blessing flypast. There is a queue for the runway, and nobody has filled up your tank.',
  narration: ['n31', 'n32'],
  objectives: [
    { id: 'jump', text: 'Jump the queue: DEMAND TAKEOFF', done: 'Jumped the queue' },
    { id: 'bless', text: 'Fly over the village church', done: 'Blessed by the Bishop' },
    { id: 'land', text: 'Land before the tank runs dry and DEMAND IT', done: 'Landed and refuelled' },
  ],
  diffNote: { easy: 'plenty of fumes, and a fuel bowser if you run dry.', medium: 'less fuel, but the bowser still comes.', hard: 'very little fuel, no bowser. Run dry and it is over.' },
  outro: 'Refuelled on the Crown\'s account. The Crown has been informed.',
  start: (c) => ({ ground: queueSlots(c.route.end)[QUEUE] }),
  route: mission3Route,
  reward: { pp: 600, label: 'Blessing delivered' },
  setup: async (c) => {
    const end = c.route.end, slots = queueSlots(end);
    c.host.clearTraffic((t) => t.ac.onGround && Math.hypot(t.ac.pos.x - slots[0].x, t.ac.pos.z - slots[0].z) < 500 && t.ap.leg?.kind !== 'park');
    const [f, burn] = FUEL[c.diff] || FUEL.medium;
    c.mflag.fuel0 = c.host.fuel(f, burn);
    c.mflag.queue = [];
    for (let k = 0; k < QUEUE; k++) {
      const r = departureRoute(end, { outHeading: rwEnd(end).hdg + (k % 2 ? -50 : 40) });
      const ent = await c.host.spawn({ id: `q${k + 1}`, type: k === 1 ? 'tiger' : 'c172', place: slots[k], route: r });
      if (ent) c.mflag.queue.push(ent);
    }
  },
  cleanup: (c) => { if (c.mflag.fuel0) c.host.fuel(null, c.mflag.fuel0.burn); },
  onEvent: (c, type, d) => {
    if (type === 'pp' && JUMPS.has(d.id)) c.tick('jump');
    if (type === 'finished') c.host.say('tower', 'i_fuel');
  },
  update: (c) => {
    const s = c.s; if (!s || s.onGround) return;
    const f = c.host.fuelLeft();
    if (f == null) return;
    if (f < 0.02 && !c.mflag.bowser && c.diff !== 'hard') {
      c.mflag.bowser = 1;
      c.host.fuel(0.07);
      c.host.say('tower', 'i_bowser');
      c.setCoach('Bone dry. The Royal Fuel Bowser has topped you up from somewhere. Do not ask. Get down.');
    }
    if (f <= 0.0005 && c.diff === 'hard') c.fail('The tank ran dry. The Bishop blessed your glider instead.');
  },
  steps: [
    {
      id: 'queue',
      coach: (c) => (c.s.canDemandTakeoff ? 'A queue ahead of you, and the fuel gauge says <b>"optimistic"</b>. Commoners queue. Press <b>DEMAND TAKEOFF</b>.' : 'A queue ahead of you, and the fuel gauge says <b>"optimistic"</b>. The autopilot joins the queue.'),
      target: (c) => ({ pos: c.route.threshold, label: `RWY ${c.route.end}` }),
      done: (c) => c.s.demanded || (!c.s.onGround && c.s.agl > 5) || (c.s.leg === 'takeoff' && c.s.gsKt > 35),
      hint: { after: 18, text: () => 'Waiting burns fuel. <b>DEMAND TAKEOFF</b>: the button by your thumb.' },
      warpHold: 'Your move',
    },
    {
      id: 'roll',
      coach: () => 'By royal prerogative. The queue may watch. <b>Watch the fuel gauge</b>: it is the clock today.',
      enter: (c) => { c.mflag.sayJump = c.t + 6; },
      update: (c) => { if (c.mflag.sayJump && c.t > c.mflag.sayJump) { c.mflag.sayJump = 0; c.host.say('tower', 'i_jump'); } },
      done: (c) => !c.s.onGround && c.s.agl > 60,
    },
    {
      id: 'bless',
      resumeLeg: (c) => c.route.marks.church,
      coach: () => 'Now the Bishop. Follow the gold marker to the <b>church</b>. He likes to see the wheels.',
      target: () => ({ pos: CHURCH, label: 'CHURCH' }),
      // the AP is past the church leg (hand-flown elsewhere, relaunched): send it back to the church
      update: (c) => { if (!c.s.landing && !c.s.onGround && c.s.legIndex > c.route.marks.church && d2(c.s, CHURCH) > 400 && c.stepT > 2 && !c.flag.back) { c.flag.back = 1; c.host.setRoute(c.route, c.route.marks.church); c.setCoach('Not that way. Back to the <b>church</b>: the Bishop is waving.'); } if (c.s.legIndex <= c.route.marks.church) c.flag.back = 0; },
      done: (c) => d2(c.s, CHURCH) < 260,
      tick: 'bless',
    },
    ...finishSteps({
      landCoach: () => 'Blessed. Now get down before the tank runs dry: the autopilot lines you up. Press <b>LAND</b>.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. It banks your Privilege, and they fill you up. Naturally.',
      onDemand: (c) => (c.host.fuelLeft() ?? 1) > 0.9 || c.stepT > 4,
    }),
  ],
};

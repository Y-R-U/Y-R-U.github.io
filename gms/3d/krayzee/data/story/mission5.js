// Mission 5 "Cream Tea at Muckle Bottom": Grandfather's Moth from C-Tower 1 through the magic clouds (D29) to the farm
// strip (C-Tower 2, Farmer Mudge). Buzz his water-tank tower (rule-break: tower_buzz), land on the grass, DEMAND IT.
import { rwEnd, landingTail, finishSteps, tripLeg, tripStart, tripStep, buzzStep, towerRun, arrivalPoint, here } from './common.js';

// tower pass at the farm: Easy flies it low for you; Medium/Hard pass wide and high, and the low bit is yours
const PASS = { easy: { off: 15, a: 34 }, medium: { off: 160, a: 95 }, hard: { off: 240, a: 120 } };

export function mission5Route(end = '27', diff = 'medium', { from } = {}) {
  const e = rwEnd(end);
  if (here() !== 'farm') {
    return { name: 'mission 5 out', legs: [{ kind: 'takeoff', end, label: 'TAKEOFF' }, tripLeg('farm', 300, 92)], loop: null, end,
      threshold: [e.thr[0], 1, e.thr[1]], marks: { relaunch: 0, trip: 1 } };
  }
  const R = towerRun(arrivalPoint(from || 'royal'), { ...(PASS[diff] || PASS.medium), speed: 80, label: 'WATER TANK' });
  const T = landingTail(e, R.legs.length);
  return { name: `mission 5 farm ${end}`, legs: [...R.legs, ...T.legs], loop: T.loop, end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { arrive: R.arrive, towerIn: R.towerIn, towerOut: R.towerOut, relaunch: T.relaunch, lineUp: T.lineUp, landWindow: T.landWindow } };
}

export const MISSION_5 = {
  id: 5,
  title: 'Cream Tea at Muckle Bottom',
  subtitle: 'Through the magic clouds, in Grandfather\'s Moth',
  tower: 'toby',
  towerLabel: 'Toby → Farmer Mudge',
  aircraft: 'tiger',
  brief: 'The Queen has announced a coronation, and the tea must be perfect. The cream comes from Muckle Bottom farm. Fetch it, and say hello to Farmer Mudge on the way in.',
  narration: ['n51', 'n52'],
  objectives: [
    { id: 'clouds', text: 'Fly through the magic clouds to Muckle Bottom', done: 'Through the magic clouds' },
    { id: 'buzz', text: 'Buzz Farmer Mudge\'s water-tank tower', done: 'Blew Mudge\'s hat into the pond' },
    { id: 'land', text: 'Land on the grass strip and DEMAND IT', done: 'Cream collected' },
  ],
  diffNote: { easy: 'the autopilot flies the low pass over the water tank for you.', medium: 'the pass is wide and high: get low over the tank yourself.', hard: 'get low yourself, and real metal: no bouncing.' },
  outro: 'Two pots of clotted cream. The Crown owes Farmer Mudge for a hat.',
  start: () => tripStart('farm', { a: 220, speedKt: 75 }),
  routeStart: 1,
  route: mission5Route,
  arriveTower: { farm: 'mudge' },
  reward: { pp: 800, label: 'Cream fetched' },
  onGo: (c) => { setTimeout(() => c.host.say('tower', 't_leave'), 4000); },
  onArrive: (c) => { setTimeout(() => c.host.say('tower', 'm_hello'), 4500); },
  onEvent: (c, type, d) => {
    if (type === 'pp' && d.id === 'tower_buzz' && c.host.airport() === 'farm' && !c.ticked('buzz')) { c.tick('buzz'); setTimeout(() => c.host.say('tower', 'm_buzz'), 2500); }
    if (type === 'finished' && c.host.airport() === 'farm') c.host.say('tower', 'm_cream');
  },
  steps: [
    tripStep('farm', { tick: 'clouds', agl: 170, coach: () => 'An open cockpit and a scarf. The autopilot heads <b>west-south-west</b> for Muckle Bottom: magic clouds about 4 km out.' }),
    buzzStep({ obj: 'buzz', label: 'WATER TANK', lo: PASS,
      coach: (c) => (c.diff === 'easy' ? 'Muckle Bottom. The autopilot takes you <b>low past the water tank</b>: that is the tower. Say hello.' : 'Muckle Bottom. The tower is the <b>water tank</b>. Get down low and go right over it.') }),
    ...finishSteps({
      landCoach: () => 'Hat in the pond. Now the strip: grass, 620 m, sheep optional. Press <b>LAND</b> when it is dead ahead.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. The cream is on the Crown\'s account.',
    }),
  ],
};

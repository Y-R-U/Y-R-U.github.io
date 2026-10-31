// Mission 6 "The Royal Wardrobe": the coronation robes in the Hercules, C-Tower 1 → RAF Much Snoring (C-Tower 4).
// The trip comes in from the west, so land straight in on runway 09 while everyone else uses 27 (rule-break: wrong_way).
import { rwEnd, landingTail, finishSteps, tripLeg, tripStart, tripStep, landCue, here } from './common.js';

const opposite = (end) => ({ '09': '27', '27': '09', '07': '25', '25': '07', '04': '22', '22': '04' })[end] || end;

export function mission6Route(end = '27', diff = 'medium') {
  if (here() !== 'airbase') {
    const e = rwEnd(end);
    return { name: 'mission 6 out', legs: [{ kind: 'takeoff', end, label: 'TAKEOFF' }, tripLeg('airbase', 380, 100)], loop: null, end,
      threshold: [e.thr[0], 1, e.thr[1]], marks: { relaunch: 0, trip: 1 } };
  }
  // the wrong end: against the active runway
  const w = opposite(end), e = rwEnd(w);
  const T = landingTail(e, 0, 'south', false, true);
  void diff;
  return { name: `mission 6 wrong way ${w}`, heavy: true, legs: T.legs, loop: T.loop, end: w, active: end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { arrive: 0, relaunch: T.relaunch, lineUp: T.lineUp, landWindow: T.landWindow } };
}

export const MISSION_6 = {
  id: 6,
  title: 'The Royal Wardrobe',
  subtitle: 'Four engines, one runway, the wrong way',
  tower: 'gerald',
  towerLabel: 'Gerald → Much Snoring',
  aircraft: 'herc',
  brief: 'The coronation robes weigh four hundred pounds and need pressing by the Royal Air Force. Only the Wardrobe can carry them to Much Snoring.',
  narration: ['n61', 'n62'],
  objectives: [
    { id: 'clouds', text: 'Fly the robes through the magic clouds to RAF Much Snoring', done: 'Robes through the clouds' },
    { id: 'wrong', text: 'Land the wrong way, against the runway in use', done: 'Wrong way, Your Grace' },
    { id: 'land', text: 'Stop and DEMAND IT', done: 'Robes delivered' },
  ],
  diffNote: { easy: 'the autopilot lines you up the wrong way. Press LAND.', medium: 'stop on the runway or the apron.', hard: 'taxi to the marked stand, and real metal: no bouncing.' },
  outro: 'The robes are pressed. The pressing squadron has fainted. Standard procedure.',
  start: () => tripStart('airbase', { a: 300, speedKt: 160, out: 1500, throttle: 0.75 }),
  routeStart: 1,
  route: mission6Route,
  arriveTower: { airbase: 'imogen' },
  reward: { pp: 900, label: 'Robes delivered' },
  onGo: (c) => { setTimeout(() => c.host.say('tower', 'g_robes'), 3500); },
  onArrive: (c) => { c.host.clearArrivals(); },
  onEvent: (c, type, d) => {
    if (type === 'pp' && d.id === 'wrong_way' && c.host.airport() === 'airbase' && !c.ticked('wrong')) { c.tick('wrong'); setTimeout(() => c.host.say('tower', 'i_wrong2'), 3000); }
    if (type === 'finished' && c.host.airport() === 'airbase') c.host.say('tower', 'i_robes');
  },
  update: (c) => {
    if (c.mflag.arrived && !c.mflag.warned && c.s?.landing) { c.mflag.warned = 1; c.host.say('tower', 'i_wrong'); }
  },
  steps: [
    tripStep('airbase', { tick: 'clouds', coach: () => 'The Wardrobe: four engines, four hundred pounds of ermine. The autopilot heads <b>east-north-east</b> for Much Snoring.' }),
    ...finishSteps({
      landCoach: (c) => `Much Snoring lands on <b>${c.route.active}</b>. The robes come from the west, so: <b>${c.route.end}</b>. Press <b>LAND</b> when it is dead ahead.`,
      landTick: null,
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. The RAF will press the robes. And the complaint.',
    }).map((s) => (s.id === 'land' ? { ...s, update: (c) => { landCue(c); c.showLandButton(c.s.landing || c.s.legIndex >= c.route.marks.landWindow); if (c.s.landing && (c.flag.clr = (c.flag.clr || 0) + 1) % 300 === 1) c.host.clearArrivals(); } } : s)),
  ],
};

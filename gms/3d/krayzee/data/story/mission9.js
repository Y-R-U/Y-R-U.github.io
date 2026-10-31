// Mission 9 "Please Do Come": coronation invitations in the Royal Runabout, delivered the royal way: low over every
// tower in the kingdom, in one flight (two tower_buzz rule-breaks). C-Tower 1 → Muckle Bottom → RAF Much Snoring,
// two magic-cloud trips (D29), then land at Much Snoring and DEMAND IT. Lord Rupert has been un-inviting people.
import { rwEnd, landingTail, finishSteps, tripLeg, tripStart, tripStep, buzzStep, towerRun, arrivalPoint, here } from './common.js';

const PASS = { easy: { off: 15, a: 36 }, medium: { off: 160, a: 100 }, hard: { off: 240, a: 125 } };
const PASS_RAF = { easy: { off: 25, a: 48 }, medium: { off: 170, a: 110 }, hard: { off: 250, a: 135 } };

export function mission9Route(end = '27', diff = 'medium', { from } = {}) {
  const e = rwEnd(end), at = here(), thr = [e.thr[0], 1, e.thr[1]];
  if (at === 'royal') {
    return { name: 'mission 9 out', legs: [{ kind: 'takeoff', end, label: 'TAKEOFF' }, tripLeg('farm', 300, 95)], loop: null, end, threshold: thr, marks: { relaunch: 0, trip: 1 } };
  }
  if (at === 'farm') {
    const R = towerRun(arrivalPoint(from || 'royal'), { ...(PASS[diff] || PASS.medium), speed: 85, label: 'WATER TANK' }), n = R.legs.length;
    return { name: `mission 9 farm ${end}`, legs: [...R.legs, tripLeg('airbase', 300, 95), { kind: 'takeoff', end, label: 'TAKEOFF' }], loop: n, end, threshold: thr,
      marks: { arrive: R.arrive, towerIn: R.towerIn, towerOut: R.towerOut, trip: n, relaunch: n + 1 } };
  }
  const R = towerRun(arrivalPoint(from || 'farm'), { ...(PASS_RAF[diff] || PASS_RAF.medium), speed: 85, lead: 1300, label: 'TOWER' });
  const T = landingTail(e, R.legs.length, 'south', true);
  return { name: `mission 9 airbase ${end}`, legs: [...R.legs, ...T.legs], loop: T.loop, end, threshold: thr,
    marks: { arrive: R.arrive, towerIn: R.towerIn, towerOut: R.towerOut, relaunch: T.relaunch, lineUp: T.lineUp, landWindow: T.landWindow } };
}

export const MISSION_9 = {
  id: 9,
  title: 'Please Do Come',
  subtitle: 'Every tower in the kingdom, in one flight',
  tower: 'toby',
  towerLabel: 'Toby → Mudge → Much Snoring',
  aircraft: 'c172',
  brief: 'Lord Rupert is un-inviting people from the coronation. Personally. In mauve. Re-invite them the royal way: low over every tower in the kingdom, in one flight.',
  narration: ['n91', 'n92'],
  objectives: [
    { id: 'mudge', text: 'Invite Farmer Mudge: buzz the Muckle Bottom water tank', done: 'Mudge is coming (with cream)' },
    { id: 'raf', text: 'Invite the RAF: buzz the Much Snoring tower', done: 'The RAF will attend, pressed' },
    { id: 'land', text: 'Land at Much Snoring and DEMAND IT', done: 'Invitations delivered' },
  ],
  diffNote: { easy: 'the autopilot flies both low passes for you.', medium: 'the passes are wide and high: get low over each tower yourself.', hard: 'both low passes are yours, and real metal: no bouncing.' },
  outro: 'Everyone is coming. Mudge is bringing cream. The RAF are bringing a band.',
  start: () => tripStart('farm', { a: 250, speedKt: 100 }),
  routeStart: 1,
  route: mission9Route,
  arriveTower: { farm: 'mudge', airbase: 'imogen' },
  reward: { pp: 1200, label: 'Invitations delivered' },
  onGo: (c) => { c.host.voiceRival('rupert'); setTimeout(() => c.host.say('rupert', 'r_uninvite'), 4000); },
  onArrive: (c) => { c.host.clearTraffic((t) => !t.ac.onGround); },
  onEvent: (c, type, d) => {
    if (type !== 'pp' || d.id !== 'tower_buzz') return;
    const at = c.host.airport();
    if (at === 'farm' && !c.ticked('mudge')) { c.tick('mudge'); setTimeout(() => c.host.say('tower', 'm_invite'), 2500); }
    if (at === 'airbase' && !c.ticked('raf')) { c.tick('raf'); setTimeout(() => c.host.say('tower', 'i_invite'), 2500); }
  },
  steps: [
    tripStep('farm', { agl: 170, coach: () => 'Invitations on the back seat. First stop: <b>Muckle Bottom</b>, west-south-west, through the magic clouds.' }),
    buzzStep({ id: 'buzz', obj: 'mudge', label: 'WATER TANK', lo: PASS,
      coach: (c) => (c.diff === 'easy' ? 'Muckle Bottom. The autopilot drops the invitation <b>low past the water tank</b>.' : 'Muckle Bottom. Deliver it the royal way: <b>low over the water tank</b>.') }),
    tripStep('airbase', { id: 'clouds2', agl: 200, coach: () => 'One down. Now <b>RAF Much Snoring</b>, east-north-east: the long way, through the clouds again.' }),
    buzzStep({ id: 'buzz2', obj: 'raf', label: 'C-TOWER 4', lo: PASS_RAF,
      coach: (c) => (c.diff === 'easy' ? 'Much Snoring. The autopilot takes you <b>low past the tower</b>. Salute.' : 'Much Snoring. <b>Low past the tower</b>: within 80 m, under 40 m above it.') }),
    ...finishSteps({
      landCoach: () => 'Everyone invited. Land at Much Snoring: press <b>LAND</b> when the runway is dead ahead.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. RSVP by return of tower.',
    }),
  ],
};

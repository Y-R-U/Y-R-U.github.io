// Mission 7 "Not Till That Jet Learns to Hover": the F-35 (STOVL, D35) to Muckle Bottom, which refuses jets on its
// 620 m of grass. HOVER, then LAND HERE: on Easy in Mudge's turnip field, on Medium/Hard in his farmyard (rule-break:
// grass_landing / apron_landing). The F-35's context button does it all (docs/STOVL.md); no runway in this one.
import { finishSteps, tripLeg, tripStart, tripStep, here, msl, rwEnd } from './common.js';

const KT = 0.514444;
// the pads in the farm's frame (data/airports/farm.js is laid out along +X, then turned 20°): a field south of the
// strip, inside Easy's 300 m finishing ring, and the farmyard apron in front of the barn (Medium/Hard's finish area)
const FARM_ROT = -20 * Math.PI / 180;
const farmXZ = ([x, z]) => [x * Math.cos(FARM_ROT) - z * Math.sin(FARM_ROT), x * Math.sin(FARM_ROT) + z * Math.cos(FARM_ROT)];
export const PADS = { field: { xz: farmXZ([-300, 140]), label: 'TURNIP FIELD' }, yard: { xz: farmXZ([-110, -135]), label: 'FARMYARD' } };
const padFor = (diff) => (diff === 'easy' ? PADS.field : PADS.yard);
const LANDINGS = new Set(['grass_landing', 'apron_landing', 'taxiway_landing']);
const dPad = (c) => { const p = padFor(c.diff).xz; return Math.hypot(c.s.x - p[0], c.s.z - p[1]); };
// HOVER from wing-borne flight slows at ~1.3–2 m/s² in practice (conversion + the jets catching up): metres to a stop
export const hoverStop = (kt) => { const v = (kt || 0) * KT; return (v * v) / 4 + 100; };

// straight in over the pad from the east-north-east (the way the clouds let you out), then round again
export function mission7Route(end = '25', diff = 'medium') {
  const e = rwEnd(end);
  if (here() !== 'farm') {
    return { name: 'mission 7 out', legs: [{ kind: 'takeoff', end, label: 'TAKEOFF' }, tripLeg('farm', 330, 95)], loop: null, end,
      threshold: [e.thr[0], 1, e.thr[1]], marks: { relaunch: 0, trip: 1 } };
  }
  const [px, pz] = padFor(diff).xz, h = 252 * Math.PI / 180, ux = Math.sin(h), uz = -Math.cos(h);
  const g = msl(0, px, pz), leg = (s, l, a, label, speed = 85) => ({ kind: 'fly', to: [px + ux * s - uz * l, g + a, pz + uz * s + ux * l], speed, flaps: 0, clearance: 40, label });
  const legs = [
    leg(-5200, 0, 170, 'TO THE TURNIPS'),
    leg(-1300, 0, 140, 'HOVER SOON'),
    leg(1800, 0, 120, 'PRESS HOVER'),
    leg(3200, -2200, 220, 'ROUND AGAIN', 95),
    leg(-6000, -2200, 220, 'ROUND AGAIN', 95),
  ];
  return { name: `mission 7 farm ${end}`, legs, loop: 0, end, threshold: [e.thr[0], 1, e.thr[1]], marks: { arrive: 0, relaunch: 0, pad: 2 } };
}

export const MISSION_7 = {
  id: 7,
  title: 'Not Till That Jet Learns to Hover',
  subtitle: 'The Royal Tantrum, straight down',
  tower: 'imogen',
  towerLabel: 'Imogen → Farmer Mudge',
  aircraft: 'f35',
  brief: 'Lord Rupert has told Farmer Mudge that jets cannot hover, and Mudge has stopped the coronation cream. Take the Tantrum to Muckle Bottom and land it straight down, somewhere he will notice.',
  narration: ['n71', 'n72'],
  objectives: [
    { id: 'clouds', text: 'Fly the Tantrum through the magic clouds to Muckle Bottom', done: 'Through the magic clouds' },
    { id: 'hover', text: 'Press HOVER and stop in mid-air', done: 'Hovered over Muckle Bottom' },
    { id: 'vland', text: 'LAND HERE: straight down onto Mudge\'s land', done: 'Straight down onto the turnips' },
    { id: 'land', text: 'DEMAND IT', done: 'The cream is back on' },
  ],
  diffNote: { easy: 'the turnip field beside the strip. The flight computer edges you over it.', medium: 'the farmyard, in front of the barn. The flight computer edges you over it.', hard: 'the farmyard. You fly the hover yourself, it drifts in the wind, and the jets run hot.' },
  outro: 'A tractor from heaven, says Mudge. The cream is back on.',
  start: () => tripStart('farm', { a: 300, speedKt: 230, out: 1500, throttle: 0.6 }),
  routeStart: 1,
  route: mission7Route,
  arriveTower: { farm: 'mudge' },
  reward: { pp: 1000, label: 'Turnips flattened' },
  onGo: (c) => { c.host.voiceRival('rupert'); setTimeout(() => c.host.say('rupert', 'r_jets'), 5000); },
  onArrive: (c) => { c.host.clearTraffic((t) => !t.ac.onGround); setTimeout(() => c.host.say('tower', 'm_nojets'), 3500); },
  onEvent: (c, type, d) => {
    if (type === 'pp' && LANDINGS.has(d.id) && c.mflag.hovered && c.host.airport() === 'farm') c.mflag.crime = d.id;
  },
  update: (c) => {
    const m = c.host.stovl();
    if (m === 'hover' && c.mflag.pressed && !c.mflag.hovered) { c.mflag.hovered = 1; c.tick('hover'); c.host.say('tower', 'm_hover'); }
    if (m === 'land' || m === 'landed') c.mflag.down = 1;
  },
  steps: [
    tripStep('farm', { tick: 'clouds', agl: 200, coach: () => 'The Royal Tantrum. Supersonic, stealthy, and today a milk float. The autopilot heads for <b>Muckle Bottom</b>.' }),
    {
      id: 'hover',
      coach: (c) => `The gold marker is Mudge's <b>${padFor(c.diff).label.toLowerCase()}</b>. A jet takes a while to stop: press <b>HOVER</b> when told, about 3 km out.`,
      target: (c) => { const p = padFor(c.diff); return { pos: [p.xz[0], msl(6, p.xz[0], p.xz[1]), p.xz[1]], label: p.label }; },
      update: (c) => {
        if (c.host.stovl() === 'convert' || c.host.stovl() === 'hover') c.mflag.pressed = 1;
        const d = dPad(c), stop = hoverStop(c.s.speedKt);
        if (!c.mflag.pressed && !c.flag.now && d < stop + 250 && c.s.legIndex <= 2) { c.flag.now = 1; c.setCoach(`<b>HOVER now!</b> At this speed it takes about ${(stop / 1000).toFixed(1)} km to stop.`); }
        if (c.flag.now && c.s.legIndex > 2) { c.flag.now = 0; c.setCoach('Overshot. The autopilot comes round again: press <b>HOVER</b> about 3 km before the marker.'); }
      },
      done: (c) => !!c.mflag.hovered,
      hint: { after: 140, text: () => 'The button by your thumb says <b>HOVER</b> (or HOVER on the little pill under LAND): tap it as you near the marker.' },
      warpHold: (c) => (c.s && dPad(c) < 3000 ? 'Hover' : false),
    },
    {
      id: 'over',
      coach: (c) => (c.diff === 'hard' ? 'In a hover. Stick forward/back moves you, left/right turns: get right over the <b>gold marker</b>.' : 'In a hover. The flight computer edges you over the <b>gold marker</b>. Nudge the stick to help.'),
      target: (c) => { const p = padFor(c.diff); return { pos: [p.xz[0], msl(6, p.xz[0], p.xz[1]), p.xz[1]], label: p.label }; },
      update: (c) => {
        const p = padFor(c.diff).xz;
        if (c.diff !== 'hard' && !c.s.stick && (c.flag.nT = (c.flag.nT || 0) - 1) <= 0) { c.flag.nT = 30; c.host.hoverHold(p[0], p[1]); }
        if (!c.host.stovl() && !c.s.onGround) { c.mflag.pressed = 0; c.mflag.hovered = 0; c.goto('hover'); }
      },
      done: (c) => dPad(c) < 35 || c.mflag.down || (c.s.onGround && c.stepT > 2),
      // far off (an early or late HOVER): push the stick toward the marker, 14 m/s instead of the computer's 6
      hint: { after: 45, text: (c) => (dPad(c) > 250 ? 'A long way off: push the <b>stick</b> towards the marker to hover-taxi faster.' : 'Close enough? Press <b>LAND HERE</b>: it picks the clear ground beside you.') },
      warpHold: 'Hover',
    },
    {
      id: 'landhere',
      coach: () => 'Right over it. Press <b>LAND HERE</b>: straight down.',
      target: (c) => { const p = padFor(c.diff); return { pos: [p.xz[0], msl(6, p.xz[0], p.xz[1]), p.xz[1]], label: p.label }; },
      update: (c) => { if (!c.host.stovl() && !c.s.onGround) { c.mflag.pressed = 0; c.mflag.hovered = 0; c.goto('hover'); } },
      done: (c) => c.s.onGround && !c.host.stovl() && c.mflag.down,
      hint: { after: 40, text: () => 'The button by your thumb: <b>LAND HERE</b>. Greyed? Nudge the stick off the hedge or the sheep.' },
      warpHold: 'Landing',
    },
    {
      id: 'stop',
      noRelaunch: true,
      coach: () => 'Down, on Mudge\'s land. Let the dust settle.',
      enter: (c) => { if (dPad(c) < 200) { c.tick('vland'); setTimeout(() => c.host.say('tower', 'm_landed'), 2500); } },
      update: (c) => {
        // the finish rules want somewhere else (Medium: runway/apron, Hard: the farmyard): back up and try again
        if (c.stepT > 6 && ((c.s.finishState && c.s.finishState !== 'ready') || !c.ticked('vland')) && !c.flag.again) {
          c.flag.again = 1; c.mflag.down = 0; c.mflag.pressed = 0; c.mflag.hovered = 0;
          c.setCoach(c.ticked('vland') ? 'Wrong spot for these rules. Up again: hover over the gold marker and <b>LAND HERE</b>.' : 'Mudge cannot see you from there. Up again: hover over the gold marker and <b>LAND HERE</b>.');
          c.host.verticalTakeoff();
        }
        if (c.flag.again && c.host.stovl() === 'hover') { c.mflag.pressed = 1; c.goto('over'); }
      },
      done: (c) => !c.flag.again && (c.s.finishState === 'ready' || (c.s.finishState == null && c.s.onGround && c.stepT > 1)),
    },
    finishSteps({ demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. Mudge is already counting the turnips.' }).find((s) => s.id === 'demand'),
  ],
};

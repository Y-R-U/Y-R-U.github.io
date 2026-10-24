// Mission 4 "The Castle Cup": a race against Lord Rupert's mauve Tiger Moth — church, castle, then back over the
// runway. You start at the hold while he is already rolling: DEMAND TAKEOFF onto his runway (rule-break: runway_steal),
// then the new system: push the THROTTLE lever up yourself while the autopilot steers. Then LAND and DEMAND IT.
import { fromRunway, holdPoint, onRunway } from '../../js/flight/routes.js';
import { CHURCH, CASTLE_GATE, at, rwEnd, rwPos, finishSteps } from './common.js';

// Rupert's leg speed (route knots; the Moth flies them scaled by its cruise) and head start after "Fly", per difficulty.
const RUPERT = { easy: { speed: 62, wait: 8 }, medium: { speed: 82, wait: 3 }, hard: { speed: 92, wait: 1 } };
const STEALS = new Set(['runway_steal', 'double_occupancy', 'unauth_takeoff', 'queue_jump']);
const GATE_R = 280;

// the finish line is the runway itself, crossed on the way back from the castle: first over it wins
const finishPoint = (e) => { const s = Math.max(150, Math.min(e.len - 150, rwPos(e, CASTLE_GATE[0] - 180, 0).s)); return fromRunway(e, s, 0); };
export function raceGates(end = '27') {
  const [fx, fz] = finishPoint(rwEnd(end));
  return [
    { id: 'church', label: 'GATE 1 · CHURCH', pos: [CHURCH[0], 130, CHURCH[2]] },
    { id: 'castle', label: 'GATE 2 · CASTLE', pos: CASTLE_GATE },
    { id: 'finish', label: 'FINISH · RUNWAY ' + end, pos: [fx, 60, fz] },
  ];
}

function raceLegs(e, speed) {
  const G = raceGates(e.id);
  return G.map((g) => ({ kind: 'fly', to: g.pos.slice(), speed, flaps: 0, clearance: g.id === 'finish' ? 35 : 60, label: g.label }));
}

export function mission4Route(end = '27', diff = 'medium') {
  const e = rwEnd(end);
  const P = (s, l, a, label, speed, clearance) => { const [x, z] = at(e, s, l); return { kind: 'fly', to: [x, a, z], speed, flaps: 0, label, ...(clearance ? { clearance } : {}) }; };
  const race = raceLegs(e, 92);
  const lap = [
    P(-300, 950, 200, 'VICTORY LAP', 90),
    P(-1250, 800, 170, 'BASE', 85),
    P(-1500, 250, 130, 'FINAL', 82, 45),
    P(-500, 0, 70, 'PRESS LAND', 78, 30),
  ];
  const r0 = 2, l0 = r0 + race.length;
  const legs = [
    { kind: 'hold', end, seconds: 2, untilClear: true, label: 'HOLD SHORT' },
    { kind: 'takeoff', end, alt: 45, label: 'TAKEOFF' },
    ...race, ...lap,
  ];
  void diff;
  return { name: `mission 4 ${end}`, legs, loop: l0, end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { race: r0, lineUp: l0 + 1, landWindow: l0 + 2, relaunch: 1 } };
}

function rupertRoute(end, diff) {
  const e = rwEnd(end), sp = (RUPERT[diff] || RUPERT.medium).speed;
  const [ax, az] = at(e, -2500, 2600, 'north'), [vx, vz] = fromRunway(e, e.len + 600, 0);
  return { name: 'story rupert race', loop: null, legs: [
    { kind: 'takeoff', end, alt: 45, label: 'TAKEOFF' },
    ...raceLegs(e, sp),
    { kind: 'fly', to: [vx, 160, vz], speed: 95, flaps: 0, label: 'VICTORY LAP' },
    { kind: 'fly', to: [ax, 400, az], speed: 95, flaps: 0, label: 'HOME TO MOTHER' },
    { kind: 'despawn', label: 'GONE' },
  ] };
}

function overRunway(end, x, z) {
  const e = rwEnd(end), p = rwPos(e, x, z);
  return p.s > -60 && p.s < e.len && Math.abs(p.l) < 90;
}

// gate progress for the player and Rupert; first through all three wins
// metres still to fly: to the next gate, then gate to gate
function remaining(G, i, x, z) {
  if (i >= G.length) return 0;
  let d = Math.hypot(x - G[i].pos[0], z - G[i].pos[2]);
  for (let k = i + 1; k < G.length; k++) d += Math.hypot(G[k].pos[0] - G[k - 1].pos[0], G[k].pos[2] - G[k - 1].pos[2]);
  return d;
}

function raceUpdate(c) {
  const R = c.mflag.race; if (!R || R.over) return;
  const G = raceGates(c.route.end);
  // Easy: Rupert never runs away with it. Ahead of you (or close), he dawdles (waves at Mother); behind, he flies his pace.
  const ru0 = c.mflag.rupert;
  if (c.diff === 'easy' && ru0?.ap?.route && !ru0.ac.onGround) {
    const lead = remaining(G, R.me, c.s.x, c.s.z) - remaining(G, R.him, ru0.ac.pos.x, ru0.ac.pos.z);
    const sp = lead > -250 ? 40 : (RUPERT.easy.speed);
    for (const l of ru0.ap.route.legs) if (l.kind === 'fly' && /GATE|FINISH/.test(l.label || '')) l.speed = sp;
  }
  const pass = (who, x, z, air) => {
    const i = R[who]; if (i >= G.length) return false;
    const ok = G[i].id === 'finish' ? overRunway(c.route.end, x, z) : air && Math.hypot(x - G[i].pos[0], z - G[i].pos[2]) < GATE_R;
    if (ok) { R[who]++; return true; }
    return false;
  };
  // the AP flew past a gate it never counted (hand-flown wide, a go-round): back to that gate
  if (R.me < G.length && !c.s.onGround && !c.s.landing && c.s.legIndex > c.route.marks.race + R.me && c.s.legIndex < c.route.marks.lineUp && !c.mflag.regate) {
    c.mflag.regate = 1; c.host.setRoute(c.route, c.route.marks.race + R.me); setTimeout(() => { c.mflag.regate = 0; }, 3000);
  }
  const ru = c.mflag.rupert?.ac;
  const me = pass('me', c.s.x, c.s.z, !c.s.onGround);
  const him = ru && pass('him', ru.pos.x, ru.pos.z, !ru.onGround);
  if (me) {
    c.log('gate', { who: 'me', n: R.me });
    const lead = R.me > R.him ? 'You lead.' : R.me === R.him ? 'Wingtip to wingtip.' : 'He is ahead.';
    if (R.me === 2) c.setCoach(`Castle! ${lead} Last leg: back to the airfield. First over <b>runway ${c.route.end}</b> wins.`);
    else if (R.me < G.length) c.setCoach(`Gate ${R.me}/3. ${lead} Next: <b>${G[R.me].label.split(' · ')[1].toLowerCase()}</b>.`);
  }
  if (him) c.log('gate', { who: 'him', n: R.him });
  if (R.me >= G.length && !R.over) {
    R.over = 'won'; c.tick('race');
    c.host.autoThrottle();
    c.host.say('tower', 't_win');
    setTimeout(() => c.host.say('rupert', 'r_lose'), 5000);
  } else if (R.him >= G.length && !R.over) {
    R.over = 'lost';
    c.host.say('rupert', 'r_win');
    c.fail('Lord Rupert crossed the line first. He will mention it at dinner. For years.');
  }
}

export const MISSION_4 = {
  id: 4,
  title: 'The Castle Cup',
  subtitle: 'A race, with a borrowed runway',
  tower: 'toby',
  brief: 'Lord Rupert has bought a biplane. It is mauve. He has challenged you to a race: the church, the castle, and home.',
  narration: ['n41', 'n42'],
  objectives: [
    { id: 'steal', text: 'Take off while he is still on the runway', done: 'Borrowed his runway' },
    { id: 'throttle', text: 'Push the THROTTLE lever up: more speed', done: 'Full throttle, by hand' },
    { id: 'race', text: 'Beat him round the church and castle to the runway', done: 'Won the Castle Cup' },
    { id: 'land', text: 'Land, stop and DEMAND IT', done: 'Landed and demanded it' },
  ],
  diffNote: { easy: 'his Moth is slow. You will win, but push the throttle anyway.', medium: 'he is quick: you need the throttle.', hard: 'he is quick and starts at once. Throttle, and fly tight.' },
  outro: 'The Castle Cup is yours. Toby announced it on frequency. Twice.',
  failLine: 'Two hundred years of breeding, apparently.',
  start: (c) => {
    const e = rwEnd(c.route.end), h = holdPoint(c.route.end);
    const hd = Math.atan2(e.thr[0] - h[0], -(e.thr[1] - h[1])) * 180 / Math.PI;
    return { ground: { x: h[0], z: h[1], heading: (hd + 360) % 360 } };
  },
  route: mission4Route,
  reward: { pp: 700, label: 'The Castle Cup' },
  setup: async (c) => {
    const end = c.route.end, e = rwEnd(end);
    c.host.clearTraffic((t) => t.ac.onGround ? Math.hypot(t.ac.pos.x - e.thr[0], t.ac.pos.z - e.thr[1]) < 700 || !!onRunway(t.ac.pos.x, t.ac.pos.z) : t.ap.leg?.kind === 'approach');
    const [x, z] = fromRunway(e, 160, 0);
    const go = { on: false };
    c.mflag.release = go;
    c.mflag.race = { me: 0, him: 0, over: null };
    c.mflag.rupert = await c.host.spawn({ who: 'rupert', type: 'tiger', place: { x, z, heading: e.hdg }, route: rupertRoute(end, c.diff), noAvoid: true, gate: () => go.on });
  },
  onGo: (c) => {
    const wait = (RUPERT[c.diff] || RUPERT.medium).wait;
    setTimeout(() => { if (c.mflag.release) c.mflag.release.on = true; c.host.say('rupert', 'r_race'); }, wait * 1000);
  },
  onEvent: (c, type, d) => {
    if (type === 'pp' && STEALS.has(d.id)) c.tick('steal');
  },
  update: (c, dt) => {
    raceUpdate(c);
    const th = c.host.throttle();
    const mine = th && (th.mode === 'latched' || th.mode === 'manual');
    // the autopilot holds each leg's speed (with extra power it would only climb): the lever sets the race pace instead
    const pace = mine && !c.mflag.race?.over ? 92 + 40 * th.val : 92;
    for (let i = c.route.marks.race; i < c.route.marks.lineUp - 1; i++) c.route.legs[i].speed = pace;
    if (mine && th.val > 0.9 && !c.s.onGround) {
      c.mflag.thrT = (c.mflag.thrT || 0) + dt;
      if (c.mflag.thrT > 0.8) c.tick('throttle');
    }
    if (c.s && !c.s.onGround && c.s.agl > 20 && c.mflag.rupert && !c.mflag.toby) { c.mflag.toby = 1; c.host.say('tower', 't_race'); }
  },
  steps: [
    {
      id: 'start',
      coach: () => 'He is rolling already. Do not wait for Toby: press <b>DEMAND TAKEOFF</b>, right onto his runway.',
      target: (c) => { const R = c.mflag.rupert; return R ? { pos: [R.ac.pos.x, R.ac.pos.y + 8, R.ac.pos.z], label: 'LORD RUPERT' } : null; },
      done: (c) => c.s.demanded || (c.s.leg === 'takeoff' && c.s.gsKt > 20) || !c.s.onGround,
      hint: { after: 10, text: () => 'Every second here is a second to Rupert. <b>DEMAND TAKEOFF</b>.' },
      warpHold: 'Race',
    },
    {
      id: 'climb',
      coach: () => 'Off you go. The autopilot flies the course: gold marker, <b>Gate 1, the church</b>.',
      target: (c) => ({ pos: raceGates(c.route.end)[0].pos, label: raceGates(c.route.end)[0].label }),
      done: (c) => !c.s.onGround && c.s.agl > 50,
      warpHold: 'Race',
    },
    {
      id: 'throttle',
      coach: (c) => (c.touch ? 'Faster: drag the <b>THROTTLE</b> lever all the way up. The autopilot keeps steering; you keep the power.' : 'Faster: hold <b>Shift</b> (or <b>=</b>) to push the <b>THROTTLE</b> to full. The autopilot keeps steering.'),
      target: (c) => { const g = raceGates(c.route.end)[Math.min(2, c.mflag.race?.me || 0)]; return { pos: g.pos, label: g.label }; },
      done: (c) => c.ticked('throttle') || c.mflag.race?.over,
      hint: { after: 14, text: (c) => (c.touch ? 'The tall lever on the right: thumb on it, slide to the top, let go. It stays there.' : 'Hold <b>Shift</b> until the lever reads 100.') },
      warpHold: 'Race',
    },
    {
      id: 'race',
      coach: (c) => { const R = c.mflag.race; const g = raceGates(c.route.end)[Math.min(2, R?.me || 0)]; return `Full chat. Gate ${R?.me || 0}/3, Rupert ${R?.him || 0}/3. Next: <b>${g.label.split(' · ')[1].toLowerCase()}</b>.`; },
      target: (c) => { const g = raceGates(c.route.end)[Math.min(2, c.mflag.race?.me || 0)]; return { pos: g.pos, label: g.label }; },
      resumeLeg: (c) => c.route.marks.race + Math.min(2, c.mflag.race?.me || 0),
      done: (c) => c.mflag.race?.over === 'won',
      warpHold: 'Race',
    },
    ...finishSteps({
      landCoach: () => 'The Castle Cup is yours. The autopilot has the throttle back and lines you up: press <b>LAND</b>.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. Winners bank.',
    }),
  ],
};

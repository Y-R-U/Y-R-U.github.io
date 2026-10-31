// Mission 10 "Coronation Day" (finale): the Royal Bathtub Derby at C-Tower 1, by the statute of 1907. Lord Rupert in a
// mauve bathtub, lined up and rolling; you at the hold. DEMAND TAKEOFF onto his runway, push the throttle, round the
// church and the castle (the Queen on the battlements), finish LOW past the tower (rule-break: tower_buzz), land,
// DEMAND IT, and be crowned. Built for the castle hill as it is now; docs/STORY.md says how it moves to the Palace Lawn.
import { fromRunway, onRunway } from '../../js/flight/routes.js';
import { CHURCH, CASTLE_GATE, rwEnd, at, landingTail, finishSteps, passLegs, towerXZ } from './common.js';

// Rupert's leg speed (route knots: a bathtub flies them at half, never under ~45 kt) and when he lets the brakes off:
// Easy once you are rolling, Medium once you have DEMANDED, Hard straight away
const RUPERT = { easy: { speed: 90, after: 'rolling', wait: 3 }, medium: { speed: 90, after: 'demanded', wait: 1 }, hard: { speed: 96, after: 'go', wait: 1.5 } };
const BASE = 110;   // the player's race pace with the lever at AUTO; +40 at full lever
const STEALS = new Set(['runway_steal', 'double_occupancy', 'unauth_takeoff', 'queue_jump']);
const GATE_R = 260, TOWER_R = 170;

export function derbyGates() {
  const [tx, tz] = towerXZ();
  return [
    { id: 'church', label: 'GATE 1 · CHURCH', pos: [CHURCH[0], 120, CHURCH[2]] },
    { id: 'castle', label: 'GATE 2 · THE QUEEN', pos: CASTLE_GATE },
    { id: 'tower', label: 'FINISH · PAST THE TOWER', pos: [tx, 50, tz] },
  ];
}
// the low line past the tower, from the castle; Rupert flies it 70 m wide and 25 m higher (no bathtub-on-bathtub)
const towerPass = (wide = 0) => passLegs(towerXZ(), [CASTLE_GATE[0], CASTLE_GATE[2]], { off: 18 + wide, a: 46 + wide * 0.35, lead: 700, leadA: 90 + wide * 0.35, speed: BASE, label: 'FINISH' });

export function mission10Route(end = '27', diff = 'medium') {
  const e = rwEnd(end);
  const g = derbyGates();
  const race = [
    { kind: 'fly', to: g[0].pos.slice(), speed: BASE, flaps: 0, clearance: 60, label: g[0].label },
    { kind: 'fly', to: g[1].pos.slice(), speed: BASE, flaps: 0, clearance: 60, label: g[1].label },
    ...towerPass(0),
  ];
  const r0 = 2, base = r0 + race.length;
  const T = landingTail(e, base, 'south', true);
  void diff;
  return { name: `mission 10 derby ${end}`, end, threshold: [e.thr[0], 1, e.thr[1]], loop: T.loop,
    legs: [{ kind: 'hold', end, seconds: 2, untilClear: true, label: 'HOLD SHORT' }, { kind: 'takeoff', end, alt: 40, label: 'TAKEOFF' }, ...race, ...T.legs],
    marks: { race: r0, towerIn: r0 + 2, towerOut: base - 1, lineUp: T.lineUp, landWindow: T.landWindow, relaunch: 1 } };
}

function rupertRoute(end, diff) {
  const e = rwEnd(end), sp = (RUPERT[diff] || RUPERT.medium).speed, g = derbyGates();
  const [ax, az] = at(e, -2500, 2600, 'north'), [vx, vz] = fromRunway(e, e.len + 600, 0);
  return { name: 'story rupert derby', loop: null, legs: [
    { kind: 'takeoff', end, alt: 40, label: 'TAKEOFF' },
    { kind: 'fly', to: g[0].pos.map((v, i) => (i === 1 ? v + 15 : v + 40)), speed: sp, flaps: 0, clearance: 60, label: 'DERBY GATE' },
    { kind: 'fly', to: g[1].pos.map((v, i) => (i === 1 ? v + 15 : v - 40)), speed: sp, flaps: 0, clearance: 60, label: 'DERBY GATE' },
    ...towerPass(70).map((l) => ({ ...l, speed: sp, label: 'DERBY FINISH' })),
    { kind: 'fly', to: [vx, 160, vz], speed: 95, flaps: 0, label: 'LAP OF HONOUR' },
    { kind: 'fly', to: [ax, 400, az], speed: 95, flaps: 0, label: 'HOME TO MOTHER' },
    { kind: 'despawn', label: 'GONE' },
  ] };
}

function remaining(G, i, x, z) {
  if (i >= G.length) return 0;
  let d = Math.hypot(x - G[i].pos[0], z - G[i].pos[2]);
  for (let k = i + 1; k < G.length; k++) d += Math.hypot(G[k].pos[0] - G[k - 1].pos[0], G[k].pos[2] - G[k - 1].pos[2]);
  return d;
}

function raceUpdate(c) {
  const R = c.mflag.race; if (!R || R.over) return;
  const G = derbyGates(), ru = c.mflag.rupert;
  // Easy: Rupert stops to wave at Mother whenever he is ahead (he cannot fly slower than a bathtub flies)
  if (c.diff === 'easy' && ru?.ap?.route && !ru.ac.onGround) {
    const lead = remaining(G, R.me, c.s.x, c.s.z) - remaining(G, R.him, ru.ac.pos.x, ru.ac.pos.z);
    const sp = lead > -300 ? 40 : RUPERT.easy.speed;
    for (const l of ru.ap.route.legs) if (l.kind === 'fly' && /DERBY/.test(l.label || '')) l.speed = sp;
  }
  const pass = (who, x, z, agl, air) => {
    const i = R[who]; if (i >= G.length || !air) return false;
    const g = G[i], d = Math.hypot(x - g.pos[0], z - g.pos[2]);
    if (g.id === 'tower' ? d < TOWER_R && agl < 140 : d < GATE_R) { R[who]++; return true; }
    return false;
  };
  // the AP flew past a gate it never counted (hand-flown wide, a go-round): back to that gate
  const last = [c.route.marks.race, c.route.marks.race + 1, c.route.marks.towerOut - 1][R.me];
  if (R.me < G.length && !c.s.onGround && !c.s.landing && c.s.legIndex > last && c.s.legIndex <= c.route.marks.towerOut && !c.mflag.regate) {
    c.mflag.regate = 1; c.host.setRoute(c.route, R.me >= 2 ? c.route.marks.towerIn : c.route.marks.race + R.me); setTimeout(() => { c.mflag.regate = 0; }, 3000);
  }
  const me = pass('me', c.s.x, c.s.z, c.s.agl, !c.s.onGround);
  const him = ru && pass('him', ru.ac.pos.x, ru.ac.pos.z, ru.ac.agl, !ru.ac.onGround);
  if (me) {
    c.log('gate', { who: 'me', n: R.me });
    const lead = R.me > R.him ? 'You lead.' : R.me === R.him ? 'Taps to taps.' : 'He is ahead.';
    if (R.me === 1) c.setCoach(`The Bishop blesses the bathwater. ${lead} Next: <b>the castle</b>, where the Queen is watching.`);
    if (R.me === 2) { c.setCoach(`The Queen waves! ${lead} Last leg: <b>low past the tower</b>. First past it is crowned.`); if (!c.mflag.mum) { c.mflag.mum = 1; c.host.say('hyacinth', 'h_derby'); } }
  }
  if (him) c.log('gate', { who: 'him', n: R.him });
  if (R.me >= G.length) {
    R.over = 'won'; c.tick('race');
    c.host.autoThrottle();
    setTimeout(() => c.host.say('tower', 't_crown'), 3500);
    setTimeout(() => c.host.say('rupert', 'r_crown'), 9000);
    setTimeout(() => c.host.say('hyacinth', 'h_crown'), 13000);
  } else if (R.him >= G.length) {
    R.over = 'lost';
    c.host.say('rupert', 'r_crownwin');
    c.fail('Lord Rupert\'s bathtub crossed the line first. The crown wobbles onto his head. Mother is insufferable.');
  }
}

export const MISSION_10 = {
  id: 10,
  title: 'Coronation Day',
  subtitle: 'The Royal Bathtub Derby, for the crown',
  tower: 'toby',
  aircraft: 'bathtub',
  brief: 'By the statute of 1907, the crown goes to the winner of the Royal Bathtub Derby: the church, the castle, and low past the tower. Lord Rupert has been practising in the bath since he was four. The Queen is watching.',
  narration: ['n101', 'n102'],
  objectives: [
    { id: 'steal', text: 'DEMAND TAKEOFF with his bathtub still on the runway', done: 'Borrowed the runway, one last time' },
    { id: 'race', text: 'Beat Rupert round the church and the castle', done: 'Won the Royal Bathtub Derby' },
    { id: 'buzz', text: 'Finish LOW past the tower, in front of the Queen', done: 'Buzzed the tower for the Queen' },
    { id: 'land', text: 'Land, stop and DEMAND IT', done: 'Crowned' },
  ],
  diffNote: { easy: 'his bathtub leaks: you will win. Push the throttle anyway; the autopilot flies the low pass.', medium: 'he is quick: push the THROTTLE lever up.', hard: 'he is quick and starts at once. Throttle, fly tight, and real metal: no bouncing.' },
  outro: 'Long may you reign. The tower has requested a lie-down.',
  failLine: 'Two hundred years of bath-time, apparently.',
  // lined up on the runway behind his bathtub (from the hold a bathtub could wander off on a field run past him)
  start: (c) => { const e = rwEnd(c.route.end), [x, z] = fromRunway(e, 12, 0); return { ground: { x, z, heading: e.hdg } }; },
  routeStart: 1,
  route: mission10Route,
  reward: { pp: 2500, label: 'The Crown' },
  setup: async (c) => {
    const end = c.route.end, e = rwEnd(end);
    c.host.clearTraffic((t) => (t.ac.onGround ? Math.hypot(t.ac.pos.x - e.thr[0], t.ac.pos.z - e.thr[1]) < 700 || !!onRunway(t.ac.pos.x, t.ac.pos.z) : t.ap.leg?.kind === 'approach' || Math.hypot(t.ac.pos.x - 400, t.ac.pos.z + 1300) < 2500));
    const [x, z] = fromRunway(e, 160, 0);
    const go = { on: false };
    c.mflag.release = go;
    c.mflag.race = { me: 0, him: 0, over: null };
    c.host.voiceRival('hyacinth');
    c.mflag.rupert = await c.host.spawn({ who: 'rupert', type: 'bathtub', place: { x, z, heading: e.hdg }, route: rupertRoute(end, c.diff), noAvoid: true, gate: () => go.on });
  },
  onGo: (c) => { c.mflag.goT = c.t; },
  onEvent: (c, type, d) => {
    if (type === 'pp' && STEALS.has(d.id)) c.tick('steal');
    if (type === 'pp' && d.id === 'tower_buzz') c.tick('buzz');
  },
  onComplete: (c) => { try { c.host.career()?.setStoryComplete?.(); } catch (e) { /* the crown is ceremonial */ } },
  update: (c, dt) => {
    const R0 = RUPERT[c.diff] || RUPERT.medium, rel = c.mflag.release;
    if (rel && !rel.on && c.s) {
      const cue = R0.after === 'go' || (R0.after === 'demanded' && (c.s.demanded || c.s.leg === 'takeoff' || !c.s.onGround)) || (R0.after === 'rolling' && (c.s.gsKt > 15 || !c.s.onGround));
      if (cue && c.mflag.relT == null) c.mflag.relT = c.t;
      if (c.mflag.relT != null && c.t - c.mflag.relT >= R0.wait) { rel.on = true; c.host.say('rupert', 'r_derby'); }
    }
    raceUpdate(c);
    const th = c.host.throttle();
    const mine = th && (th.mode === 'latched' || th.mode === 'manual');
    const pace = mine && !c.mflag.race?.over ? BASE + 40 * th.val : BASE;
    for (let i = c.route.marks.race; i < c.route.marks.lineUp - 1; i++) c.route.legs[i].speed = pace;
    if (mine && th.val > 0.9 && !c.s.onGround) { c.mflag.thrT = (c.mflag.thrT || 0) + dt; if (c.mflag.thrT > 0.8) c.mflag.thr = 1; }
    if (c.s && !c.s.onGround && c.s.agl > 20 && c.mflag.rupert && !c.mflag.toby) { c.mflag.toby = 1; c.host.say('tower', 't_derby'); }
  },
  ending: {
    kicker: 'The Peerage · The End',
    title: 'Coronation Day',
    crowned: 'Long live {who}, <b>Sovereign of the Skies</b>.',
    step: 0.85,
    lines: [
      { who: 'The Queen', text: 'placed the crown, slightly damp, and said "Splendid. Do it again next year."' },
      { who: 'Lord Rupert', text: 'told Mother. Mother thought it was marvellous.' },
      { who: 'Gerald Calloway', text: 'retired to his owls, all forty. He sends postcards. They say "no".' },
      { who: 'Imogen Frost', text: 'raised her voice, once, to shout "Bravo". It has been filed.' },
      { who: 'Toby Wren', text: 'laminated the moment.' },
      { who: 'Farmer Mudge', text: 'sent the cream, and an invoice for a hat.' },
      { who: 'The Royal Flying Bathtub', text: 'is yours to fly in Free Flight. Mind the plug.' },
    ],
    fin: 'Every rule of the air was written for other people. Now you get to write them.',
    button: 'Long may you reign',
  },
  steps: [
    {
      id: 'start',
      coach: () => 'Two bathtubs, one runway, and his is in front. Do not wait for Toby: <b>DEMAND TAKEOFF</b>.',
      target: (c) => { const R = c.mflag.rupert; return R ? { pos: [R.ac.pos.x, R.ac.pos.y + 8, R.ac.pos.z], label: 'LORD RUPERT' } : null; },
      done: (c) => c.s.demanded || (c.s.leg === 'takeoff' && c.s.gsKt > 20) || !c.s.onGround,
      hint: { after: 10, text: () => 'Every second here is a second to Rupert. <b>DEMAND TAKEOFF</b>.' },
      warpHold: 'Race',
    },
    {
      id: 'climb',
      coach: () => 'Airborne, in a bath. The autopilot flies the course: gold marker, <b>Gate 1, the church</b>.',
      target: () => ({ pos: derbyGates()[0].pos, label: derbyGates()[0].label }),
      done: (c) => !c.s.onGround && c.s.agl > 70,
      warpHold: 'Race',
    },
    {
      id: 'throttle',
      coach: (c) => (c.touch ? 'Faster: drag the <b>THROTTLE</b> lever all the way up. The autopilot steers; you keep the power.' : 'Faster: hold <b>Shift</b> (or <b>=</b>) to push the <b>THROTTLE</b> to full. The autopilot steers.'),
      target: (c) => { const g = derbyGates()[Math.min(2, c.mflag.race?.me || 0)]; return { pos: g.pos, label: g.label }; },
      done: (c) => !!c.mflag.thr || !!c.mflag.race?.over || c.stepT > 40,
      hint: { after: 14, text: (c) => (c.touch ? 'The tall lever on the right: thumb on it, slide to the top, let go. It stays there.' : 'Hold <b>Shift</b> until the lever reads 100.') },
      warpHold: 'Race',
    },
    {
      id: 'race',
      coach: (c) => { const R = c.mflag.race; const g = derbyGates()[Math.min(2, R?.me || 0)]; return `Taps open. Gate ${R?.me || 0}/3, Rupert ${R?.him || 0}/3. Next: <b>${g.label.split(' · ')[1].toLowerCase()}</b>.`; },
      target: (c) => { const g = derbyGates()[Math.min(2, c.mflag.race?.me || 0)]; return { pos: g.pos, label: g.label }; },
      resumeLeg: (c) => ((c.mflag.race?.me || 0) >= 2 ? c.route.marks.towerIn : c.route.marks.race + (c.mflag.race?.me || 0)),
      done: (c) => c.mflag.race?.over === 'won',
      warpHold: 'Race',
    },
    ...finishSteps({
      landCoach: () => 'The crown is yours, nearly. Land it like a monarch: press <b>LAND</b> when the runway is dead ahead.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. The Queen is waiting with the crown.',
    }),
  ],
};

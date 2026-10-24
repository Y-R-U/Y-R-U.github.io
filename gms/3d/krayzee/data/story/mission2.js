// Mission 2 "The Pomfrey-Smythe Welcome": start on the downwind leg, Lord Rupert on a long final ahead of you in the
// sequence. Cut in front of him (rule-break: cut_in_final, often forced_goaround too), then LAND and DEMAND IT.
// Easy: the autopilot turns in early by itself. Medium/Hard: it flies the polite long way round; you turn in by hand.
import { fromRunway, aiSpawn } from '../../js/flight/routes.js';
import { at, rwPos, finishSteps, rwEnd, landCue, relaunch } from './common.js';

const RUPERT_OUT = { easy: 4600, medium: 4200, hard: 3900 };
const isCut = (e) => e.id === 'cut_in_final' || e.id === 'forced_goaround';

export function mission2Route(end = '27', diff = 'medium') {
  const e = rwEnd(end);
  const P = (s, l) => at(e, s, l);
  const easy = diff === 'easy';
  const legs = [];
  const leg = (s, l, a, label, speed = 88, clearance) => { const [x, z] = P(s, l); legs.push({ kind: 'fly', to: [x, a, z], speed, flaps: 0, label, ...(clearance ? { clearance } : {}) }); };
  leg(-250, 1100, 280, 'DOWNWIND', 90);
  if (easy) {
    leg(-1000, 1050, 220, 'TURNING IN');
    leg(-1450, 300, 130, 'CUTTING IN', 82, 45);
  } else {
    leg(-2900, 1100, 280, 'DOWNWIND');
    leg(-3500, 450, 260, 'BASE');
    leg(-3300, 0, 240, 'NUMBER TWO');
  }
  const cutAt = legs.length;
  leg(-500, 0, 70, 'PRESS LAND', 78, 30);
  leg(e.len + 500, 0, 200, 'GO ROUND', 85);
  leg(e.len + 500, 1100, 280, 'GO ROUND', 90);
  const relaunch = legs.length;
  legs.push({ kind: 'takeoff', end, label: 'TAKEOFF' });
  leg(e.len - 100, 1100, 290, 'DOWNWIND', 90);
  return { name: `mission 2 ${end}`, legs, loop: 0, end, threshold: [e.thr[0], 1, e.thr[1]],
    marks: { cutAt, landWindow: cutAt, relaunch, downwind: relaunch + 1 } };
}

const ahead = (c) => {
  const R = c.mflag.rupert; if (!R) return null;
  const e = rwEnd(c.route.end), p = rwPos(e, c.s.x, c.s.z), r = rwPos(e, R.ac.pos.x, R.ac.pos.z);
  return { p, r, gap: p.s - r.s, rOnGround: R.ac.onGround };
};

async function spawnRupert(c, out) {
  const old = c.mflag.rupert; c.mflag.rupert = null;
  if (old) c.host.despawn(old);
  const plan = aiSpawn('final', c.route.end, { dist: out, type: 'c172' });
  c.mflag.rupert = await c.host.spawn({ who: 'rupert', type: 'c172', place: plan.place, route: plan.route });
  c.mflag.rupertT = c.t;
}

export const MISSION_2 = {
  id: 2,
  title: 'The Pomfrey-Smythe Welcome',
  subtitle: 'Cutting in, with traffic',
  tower: 'gerald',
  brief: 'Lord Rupert cut in front of you on your first day. He is on final approach right now. Return the favour.',
  narration: ['n21', 'n22'],
  objectives: [
    { id: 'cut', text: 'Cut in front of Lord Rupert on final', done: 'Cut in front of Lord Rupert' },
    { id: 'land', text: 'Land, stop and DEMAND IT', done: 'Landed and demanded it' },
  ],
  diffNote: { easy: 'the autopilot turns in early for you. Just press LAND.', medium: 'the autopilot queues politely behind him. Turn in yourself.', hard: 'turn in yourself, and real metal: no bouncing.' },
  outro: 'Gerald has written it down. In ink.',
  start: (c) => {
    const e = rwEnd(c.route.end), [x, z] = at(e, 650, 1100);
    return { air: { x, z, alt: 290, heading: (e.hdg + 180) % 360, speedKt: 90, throttle: 0.6 } };
  },
  route: mission2Route,
  reward: { pp: 500, label: 'Favour returned' },
  setup: async (c) => {
    const e = rwEnd(c.route.end);
    c.host.clearTraffic((t) => !t.ac.onGround || Math.hypot(t.ac.pos.x - e.thr[0], t.ac.pos.z - e.thr[1]) < 300);
    await spawnRupert(c, RUPERT_OUT[c.diff] || 4200);
  },
  onEvent: (c, type, d) => {
    if (type === 'pp' && isCut(d) && !c.mflag.cutT) {
      c.mflag.cutT = c.t;
      c.tick('cut');
    }
  },
  update: (c) => {
    if (c.mflag.cutT && !c.mflag.said && c.t - c.mflag.cutT > 5) { c.mflag.said = 1; c.host.say('rupert', 'r_cut'); }
    if (c.mflag.said === 1 && c.t - c.mflag.cutT > 10) { c.mflag.said = 2; c.host.say('tower', 'g_cut'); }
    if (c.mflag.said === 2 && c.s?.landing && c.t - c.mflag.cutT > 18) { c.mflag.said = 3; c.host.say('tower', 'g_land'); }
  },
  steps: [
    {
      id: 'spot',
      coach: () => 'That <b>mauve marker</b> on final is Lord Rupert. You are on the downwind leg, behind him in the queue.',
      target: (c) => { const R = c.mflag.rupert; return R ? { pos: [R.ac.pos.x, R.ac.pos.y + 20, R.ac.pos.z], label: 'LORD RUPERT' } : null; },
      done: (c) => c.stepT > 7,
    },
    {
      id: 'cut',
      coach: (c) => (c.diff === 'easy'
        ? 'Watch the autopilot <b>turn in early</b>, in front of him. Press <b>LAND</b> as soon as the runway is ahead.'
        : (c.touch ? '<b>Turn in now</b>: drag the stick towards the gold <b>CUT IN</b> marker, then press <b>LAND</b>.' : '<b>Turn in now</b>: arrow keys towards the gold <b>CUT IN</b> marker, then press <b>LAND</b>.')),
      target: (c) => { const [x, z] = fromRunway(rwEnd(c.route.end), -1400, 0); return { pos: [x, 120, z], label: 'CUT IN' }; },
      update: (c, dt) => {
        const a = ahead(c);
        const cue = landCue(c);
        c.showLandButton(c.s.landing || cue);
        if (cue && !c.s.landing && !c.flag.cued) { c.flag.cued = 1; c.setCoach('Runway dead ahead, Rupert behind you: press <b>LAND</b> now!'); }
        if (c.ticked('cut')) return;
        // landed without cutting in (LAND pressed behind him): back up for another go
        if (c.s.onGround && c.s.gsKt < 25 && !c.flag.relaunch) { c.flag.relaunch = 1; c.flag.relT = c.stepT; c.setCoach('Landed behind him? Far too polite. Back up you go: round again, and in front this time.'); }
        if (c.flag.relaunch === 1 && c.stepT - c.flag.relT > 3) { c.flag.relaunch = 2; relaunch(c); }
        if (c.flag.relaunch === 2 && !c.s.onGround && c.s.agl > 60) {
          c.flag.relaunch = 0; c.flag.cued = 0; c.flag.respawn = 1;
          c.host.setRoute(c.route, c.route.marks.downwind);
        }
        // a fresh Rupert once you are back on the downwind, as far out as at the start (you are 650 m further back)
        if (c.flag.respawn === 1 && c.s.legIndex === 0 && !c.s.onGround) {
          c.flag.respawn = 2;
          spawnRupert(c, (RUPERT_OUT[c.diff] || 4200) + 500).then(() => { c.flag.respawn = 0; c.flag.missed = 0; });
        }
        if (!a || c.flag.relaunch || c.flag.respawn) return;
        // ATC judges the cut-in; if it never got the two of you in its final cone with the order kept, the story does
        if (c.s.landing && landCue(c) && a.gap > 300 && a.p.s > -1800 && a.r.s > -4200 && Math.abs(a.r.l) < 300 && !a.rOnGround) {
          c.flag.aheadT = (c.flag.aheadT || 0) + dt;
          if (c.flag.aheadT > 6) { const ev = c.host.atcReport('cut_in_final', { victim: c.host.idOf(c.mflag.rupert), data: { gap: Math.round(a.gap), runwayEnd: c.route.end, close: a.gap < 400 } }); c.flag.aheadT = ev ? -1e9 : 4; } // null = ATC grace (just placed): try again
        }
        // too polite: he got there first. Gerald sends him round for another go and you fly the downwind again.
        if ((a.rOnGround || (a.r.s > -250 && a.gap < 0)) && !c.flag.missed) {
          c.flag.missed = 1;
          c.setCoach('Far too polite. He is down first. Round again: Gerald is sending him back out.');
          if (c.s.landing) c.host.cancelLand();
          c.host.setRoute(c.route, c.route.marks.downwind);
          c.flag.respawn = 1; c.flag.cued = 0;
        }
      },
      done: (c) => c.ticked('cut'),
      hint: { after: 45, text: (c) => (c.diff === 'easy' ? 'Press <b>LAND</b>: you need to be on final before he is.' : 'Steer at the <b>CUT IN</b> marker, between Rupert and the runway. Then <b>LAND</b>.') },
      warpHold: 'Traffic',
    },
    ...finishSteps({
      landCoach: () => 'Cut in. Now press <b>LAND</b> and get down before he does.',
      demandCoach: () => 'Press <b>LANDED — DEMAND IT</b>. Rupert can wait. He is used to it now.',
    }).map((s) => (s.id === 'land' ? { ...s, enter: (c) => c.host.clearArrivals(), done: (c) => c.s.landing || c.s.onGround,
      update: (c) => { if (landCue(c) && !c.flag.cued) { c.flag.cued = 1; c.setCoach('Runway dead ahead: press <b>LAND</b> now!'); } c.showLandButton(true); } } : s)),
  ],
};

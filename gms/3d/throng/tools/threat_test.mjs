// node tools/threat_test.mjs [--break=rule|lead]
// Proves js/ui/threat.js (the HUD's nearby-crowd tint) agrees with the real sim: two crowds are parked on top
// of each other and the sim decides who takes from whom. Also checks outrightLeader (no crown on a tie).
import { createSim, SIM_DT } from '../js/sim/sim.js';
import { makePlayers } from '../js/sim/match.js';
import { generateMap } from './stub_map.js';
import { threatOf, outrightLeader } from '../js/ui/threat.js';

const BREAK = (process.argv.find((a) => a.startsWith('--break=')) || '').slice(8);
const rule = BREAK === 'rule' ? (me, o, mode) => threatOf(me, o, mode, 0) : threatOf;
const fails = [];
let trials = 0, steals = 0;

const CASES = [
  // [mode, myCount, otherCount, setup]
  ['classic', 10, 10], ['classic', 100, 104], ['classic', 100, 105], ['classic', 100, 107], ['classic', 100, 115],
  ['classic', 40, 12], ['classic', 12, 40], ['classic', 30, 29], ['koth', 60, 20], ['lcs', 20, 60], ['lcs', 50, 52],
  ['teams', 80, 10, 'same'], ['teams', 10, 80, 'same'], ['teams', 80, 10, 'other'], ['teams', 10, 80, 'other'],
  ['infection', 60, 15, 'hh'], ['infection', 15, 60, 'hh'], ['infection', 60, 15, 'hs'], ['infection', 15, 60, 'hs'],
  ['infection', 60, 15, 'sh'], ['infection', 60, 15, 'ss'], ['infection', 15, 60, 'ss'],
  ['classic', 60, 15, 'protect'],
];

for (const [mode, a, b, setup] of CASES) {
  trials++;
  const seed = 11 + trials;
  const map = generateMap(seed);
  const { players } = makePlayers({ seed, mode, allBots: true });
  const sim = createSim({ seed, map, players, mode, countdown: 0, config: { neutralStart: 0, neutralRespawn: 0, pickupCount: 0 } });
  sim.step(); sim.drainEvents();
  const S = sim.state, me = S.crowds[0], o = S.crowds[1];
  if (mode === 'teams') { me.team = 0; o.team = setup === 'same' ? 0 : 1; }
  if (mode === 'infection') {
    for (const c of S.crowds) { c.horde = false; c.team = 0; }
    if (setup[0] === 'h') { me.horde = true; me.team = 1; }
    if (setup[1] === 'h') { o.horde = true; o.team = 1; }
    S.crowds[7].horde = true; S.crowds[7].team = 1;
  }
  S.crowds.forEach((c, i) => {
    c.alive = true; c.out = false; c.protect = 0; c.respawnIn = 0;
    const far = i >= 2;
    c.x = c.px = far ? -100 + (i % 3) * 100 : 0; c.z = c.pz = far ? (i < 5 ? -100 : 100) : 0;
    sim.setInput(i, 0, 0);
  });
  me.count = a; o.count = b;
  me.radius = sim.radiusOf(a); o.radius = sim.radiusOf(b);
  if (setup === 'protect') o.protect = 1;
  const want = rule(me, o, mode);
  const want2 = setup === 'protect' ? 'even' : want;
  let first = null;
  for (let t = 0; t < Math.round(4 / SIM_DT) && !first; t++) {
    me.x = o.x = 0; me.z = o.z = 0;
    if (setup === 'protect') o.protect = 1;
    sim.step();
    for (const e of sim.drainEvents()) {
      if (e.type !== 'steal') continue;
      const pair = (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0);
      if (!pair) continue;
      first = { got: e.to === 1 ? 'danger' : 'prey' };
      steals++;
      break;
    }
  }
  const got = first ? first.got : 'none';
  const ok = want2 === 'danger' || want2 === 'prey' ? got === want2 : got === 'none';
  if (!ok) fails.push(`${mode} ${a} v ${b} ${setup || ''}: HUD says ${want2}, sim did ${got}`);
}

// outrightLeader: ties have no crown; a strict lead does.
const lead = BREAK === 'lead' ? (s) => s.leader : outrightLeader;
const mk = (counts, extra = {}) => ({ mode: 'classic', leader: 0, crowds: counts.map((n, i) => ({ index: i, count: n, alive: true, score: 0, out: false, team: i % 2 })), ...extra });
const L = [
  [mk([4, 4, 4, 4]), -1], [mk([5, 4, 4, 4]), 0], [mk([9, 9, 3]), -1],
  [{ ...mk([4, 4]), mode: 'koth' }, -1],
  [(() => { const s = mk([4, 4]); s.mode = 'koth'; s.crowds[0].score = 2; return s; })(), 0],
  [(() => { const s = mk([4, 4]); s.mode = 'teams'; s.teams = [{ score: 4 }, { score: 4 }]; return s; })(), -1],
];
for (const [s, want] of L) { const g = lead(s); if (g !== want) fails.push(`outrightLeader ${JSON.stringify(s.crowds.map((c) => c.count))} ${s.mode}: ${g} != ${want}`); }

console.log(`threat_test: ${trials} sim cases (${steals} produced a steal), ${L.length} crown cases`);
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS');

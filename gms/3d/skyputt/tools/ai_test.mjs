#!/usr/bin/env node
// Ghost AI sanity test: every golfer personality at several skills plays every hole, N rounds each,
// with seeded RNGs. Prints strokes vs par, OOB and aces per round, planner cost, and checks:
//   The Pro at skill 1 averages near or under par · low skill is well over par · skill helps ·
//   Bertha has more OOB and more aces than Carl · runs are deterministic · plans fit the budget.
//   node tools/ai_test.mjs [--rounds=20] [--skills=0.1,0.4,0.7,1] [--golfers=pro,carl] [--holes=sky1,sky9] [--course=festival] [--jobs=6] [--json=FILE]
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildHole } from '../js/course/builder.js';
import { COURSES } from '../js/course/holes/index.js';
import { Planner } from '../js/ai/planner.js';
import { AIGolfer, PERSONALITY_IDS, PERSONALITIES, ratingOf, rankOf } from '../js/ai/golfers.js';
import { playHoleSync } from '../js/ai/round.js';
import { hashStr } from '../js/ai/rng.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const ROUNDS = +(args.rounds || 20);
const SKILLS = (args.skills || '0.1,0.4,0.7,1').split(',').map(Number);
const GOLFERS = args.golfers ? args.golfers.split(',') : PERSONALITY_IDS;
const COURSE = COURSES[args.course] || COURSES.sky;   // events2: --course=festival (or --holes from any course)
const ALL_HOLES = Object.values(COURSES).flatMap(c => c.holes);
const HOLES = args.holes ? ALL_HOLES.filter(h => args.holes.split(',').includes(h.id)) : COURSE.holes;
const PAR = HOLES.reduce((a, h) => a + h.par, 0);

// ---- one job = one golfer at one skill, ROUNDS rounds of every hole
function runJob(pid, skill, rounds = ROUNDS) {
  const res = { pid, skill, strokes: [], perHole: {}, oob: 0, aces: 0, picked: 0, plans: 0, planMs: 0, planMax: 0, steps: 0, stepsMax: 0, walls: 0, shots: 0 };
  for (const def of HOLES) {
    const planner = new Planner(buildHole(def));
    res.perHole[def.id] = [];
    for (let r = 0; r < rounds; r++) {
      const g = new AIGolfer({ personality: pid, skill, seed: hashStr(`${pid}:${skill}:${def.id}:${r}`) });
      const rec = playHoleSync({ planner, golfer: g, t0: r * 1.37, trace: false });
      res.perHole[def.id].push(rec.strokes);
      res.oob += rec.oob; res.aces += rec.ace ? 1 : 0; res.picked += rec.pickedUp ? 1 : 0;
      for (const s of rec.shots) {
        res.plans++; res.planMs += s.plan.ms; res.planMax = Math.max(res.planMax, s.plan.ms);
        res.steps += s.plan.steps; res.stepsMax = Math.max(res.stepsMax, s.plan.steps);
        res.walls += s.walls; res.shots++;
      }
    }
  }
  for (let r = 0; r < rounds; r++) res.strokes.push(HOLES.reduce((a, h) => a + res.perHole[h.id][r], 0));
  return res;
}

if (process.env.AI_TEST_CHILD) {
  process.on('message', ({ jobs }) => {
    const out = jobs.map(([pid, sk]) => runJob(pid, sk));
    process.send(out, () => process.exit(0));
  });
} else {
  const t0 = Date.now();
  const jobs = [];
  for (const pid of GOLFERS) for (const sk of SKILLS) jobs.push([pid, sk]);
  const nProc = Math.max(1, Math.min(+(args.jobs || 6), jobs.length));
  // round-robin so every process gets a mix of cheap and expensive jobs
  const parts = Array.from({ length: nProc }, () => []);
  jobs.forEach((j, i) => parts[i % nProc].push(j));
  const self = fileURLToPath(import.meta.url);
  const results = (await Promise.all(parts.map(p => new Promise((res, rej) => {
    const c = fork(self, process.argv.slice(2), { env: { ...process.env, AI_TEST_CHILD: '1' } });
    c.on('message', res); c.on('error', rej);
    c.send({ jobs: p });
  })))).flat();
  const R = {};
  for (const r of results) R[`${r.pid}@${r.skill}`] = r;
  const get = (pid, sk) => R[`${pid}@${sk}`];
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);

  console.log(`SKYPUTT ghost AI test: ${HOLES.length} holes (par ${PAR}), ${ROUNDS} rounds per golfer per skill, ${nProc} processes`);
  console.log('\nAverage strokes per round vs par  [OOB/round  aces/round  bank-bounces/shot]');
  const head = 'golfer          ' + SKILLS.map(s => `skill ${s.toFixed(1)} (${ratingOf(s)} ${rankOf(s)})`.padEnd(30)).join('');
  console.log(head);
  for (const pid of GOLFERS) {
    let line = PERSONALITIES[pid].name.padEnd(16);
    for (const sk of SKILLS) {
      const r = get(pid, sk);
      const a = avg(r.strokes);
      line += `${a.toFixed(1)} ${sgn(a - PAR).padStart(6)} [${(r.oob / ROUNDS).toFixed(1)} ${(r.aces / ROUNDS).toFixed(1)} ${(r.walls / r.shots).toFixed(1)}]`.padEnd(30);
    }
    console.log(line);
  }
  console.log('\nPer hole, average vs par (skill ' + SKILLS.join(' / ') + ')');
  console.log('golfer          ' + HOLES.map(h => `${h.id}(${h.par})`.padEnd(22)).join(''));
  for (const pid of GOLFERS) {
    let line = PERSONALITIES[pid].name.padEnd(16);
    for (const h of HOLES) line += SKILLS.map(sk => sgn(avg(get(pid, sk).perHole[h.id]) - h.par)).join(' ').padEnd(22);
    console.log(line);
  }
  console.log('\nPlanner cost per shot (node, this machine): avg ms / max ms / avg steps / max steps; mid phone ≈ x4');
  for (const pid of GOLFERS) {
    let line = PERSONALITIES[pid].name.padEnd(16);
    for (const sk of SKILLS) { const r = get(pid, sk); line += `${(r.planMs / r.plans).toFixed(0)} / ${r.planMax.toFixed(0)} / ${(r.steps / r.plans / 1000).toFixed(0)}k / ${(r.stepsMax / 1000).toFixed(0)}k`.padEnd(30); }
    console.log(line);
  }

  // ---- checks
  const fails = [];
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
  console.log('');
  const lo = Math.min(...SKILLS), hi = Math.max(...SKILLS);
  if (get('pro', hi)) check(avg(get('pro', hi).strokes) <= PAR + 0.15 * HOLES.length, `The Pro at skill ${hi} averages near or under par (${sgn(avg(get('pro', hi).strokes) - PAR)})`);
  for (const pid of GOLFERS) {
    const a = avg(get(pid, lo).strokes) - PAR;
    if (lo <= 0.2) check(a >= 0.4 * HOLES.length, `${PERSONALITIES[pid].name} at skill ${lo} is well over par (${sgn(a)})`);
    if (lo < hi) check(avg(get(pid, hi).strokes) < avg(get(pid, lo).strokes) - 0.1 * HOLES.length, `${PERSONALITIES[pid].name}: skill ${hi} beats skill ${lo} by a clear margin`);
  }
  if (GOLFERS.includes('bertha') && GOLFERS.includes('carl')) {
    const sum = (pid, k) => SKILLS.reduce((a, sk) => a + get(pid, sk)[k], 0);
    check(sum('bertha', 'oob') > sum('carl', 'oob'), `Bertha goes OOB more than Carl (${sum('bertha', 'oob')} vs ${sum('carl', 'oob')} over all skills, x${(sum('bertha', 'oob') / Math.max(1, sum('carl', 'oob'))).toFixed(2)})`);
    check(sum('bertha', 'aces') > sum('carl', 'aces'), `Bertha makes more holes-in-one than Carl (${sum('bertha', 'aces')} vs ${sum('carl', 'aces')})`);
  }
  if (GOLFERS.includes('banks') && GOLFERS.includes('pro')) {
    const wb = SKILLS.reduce((a, sk) => a + get('banks', sk).walls / get('banks', sk).shots, 0), wp = SKILLS.reduce((a, sk) => a + get('pro', sk).walls / get('pro', sk).shots, 0);
    check(wb > wp * 1.15, `Banks bounces off more walls per shot than The Pro (${(wb / SKILLS.length).toFixed(2)} vs ${(wp / SKILLS.length).toFixed(2)})`);
  }
  if (GOLFERS.includes('lou') && GOLFERS.includes('pro')) {
    const sd = a => { const m = avg(a); return Math.sqrt(avg(a.map(v => (v - m) ** 2))); };
    const mid = SKILLS[Math.floor(SKILLS.length / 2)];
    check(sd(get('lou', mid).strokes) > sd(get('pro', mid).strokes), `Lucky Lou is streakier than The Pro at skill ${mid} (round sd ${sd(get('lou', mid).strokes).toFixed(2)} vs ${sd(get('pro', mid).strokes).toFixed(2)})`);
  }
  // determinism: re-run one job inline and compare every hole score
  {
    const pid = GOLFERS.includes('lou') ? 'lou' : GOLFERS[0], sk = SKILLS[Math.floor(SKILLS.length / 2)];
    const again = runJob(pid, sk, Math.min(4, ROUNDS));
    const ref = get(pid, sk);
    const same = HOLES.every(h => again.perHole[h.id].every((v, i) => v === ref.perHole[h.id][i]));
    check(same, `deterministic: ${PERSONALITIES[pid].name} @ ${sk} replays identically (inline vs child process)`);
  }
  // history-independent: a plan on a planner that has already planned for other golfers equals a fresh one
  {
    const def = HOLES.find(h => h.id === 'sky9') || HOLES[0], h = buildHole(def);
    const g = new AIGolfer({ personality: 'pro', skill: 0.6, seed: 1 }), other = new AIGolfer({ personality: 'bertha', skill: 0.9, seed: 2 });
    const tee = { x: h.tee.x, y: h.tee.y, z: h.tee.z };
    const fresh = new Planner(h).plan(tee, { t0: 1, ...g.style() });
    const warm = new Planner(h);
    warm.plan(tee, { t0: 1, ...other.style() }); warm.plan(tee, { t0: 2.5, ...g.style() });
    const again = warm.plan(tee, { t0: 1, ...g.style() });
    check(fresh.aim === again.aim && fresh.power === again.power && fresh.wait === again.wait, 'plans do not depend on what the planner planned before (sim cache)');
  }
  // budget
  {
    let maxSteps = 0, worst = '';
    for (const r of results) if (r.stepsMax > maxSteps) { maxSteps = r.stepsMax; worst = `${r.pid}@${r.skill}`; }
    check(maxSteps <= 1.25 * 60000 * 1.5 + 20000, `plans stay within their step budget (max ${maxSteps} steps, ${worst})`);
  }
  console.log(`\n${fails.length ? fails.length + ' check(s) failed' : 'all checks passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (args.json) writeFileSync(args.json, JSON.stringify(results.map(r => ({ ...r })), null, 1));
  process.exit(fails.length ? 1 : 0);
}

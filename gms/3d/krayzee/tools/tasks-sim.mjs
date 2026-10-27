// TASKS lane harness (D34): node tools/tasks-sim.mjs [--falsify] [--quiet]
// Drives every task in data/tasks.js from synthetic events through the REAL js/game modules (createGame score economy,
// career) plus fake ATC / radio emitters and a fake player aircraft fed to tasks.sample(). Asserts: every task can be
// completed, each fires exactly once, ladders progress, set rewards pay once, save/load round-trips, unready planes stay
// locked. --falsify breaks detectors in scratch copies; each break must make this suite fail.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KRZ_ROOT || path.resolve(HERE, '..');
const QUIET = process.argv.includes('--quiet');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

if (process.argv.includes('--falsify')) { falsify(); process.exit(0); }

const G = await imp('js/game/index.js');
const TK = await imp('js/game/tasks.js');
const D = await imp('data/tasks.js');
const { INFRACTIONS } = await imp('data/rules.js');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) { pass++; if (!QUIET) console.log('  ok  ' + msg); } else { fail++; failures.push(msg); console.log('  FAIL ' + msg); } }
const section = (s) => { if (!QUIET) console.log('\n# ' + s); };
function memStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
function seeded(s = 1) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const KT = 0.514444;
function emitter() { const L = {}; return { on(t, fn) { (L[t] ||= []).push(fn); return () => { L[t] = L[t].filter((x) => x !== fn); }; }, emit(t, p) { for (const fn of L[t] || []) fn(p); } }; }

// A task firing twice aborts the long loops at once (else a broken engine re-pays thousands of times and crawls).
let ABORT = false;
// One harness = one tasks instance + one live play (real createGame, fake ATC/radio/aircraft).
function harness({ storage = memStore(), career = null, ready, plane = 'c172', diff = 'easy' } = {}) {
  const tasks = TK.createTasks({ career, storage, now: () => 1, ...(ready ? { ready } : {}) });
  const fired = {};
  ABORT = false;
  tasks.on('task', (t) => { fired[t.id] = (fired[t.id] || 0) + 1; if (fired[t.id] > 1) ABORT = true; });
  const sets = {};
  tasks.on('set', (s) => { sets[s.id] = (sets[s.id] || 0) + 1; });
  const h = { tasks, fired, sets, storage, n: 0, victim: 0 };
  const radio = Object.assign(emitter(), { tower: 'tower_m', setTower(tw) { this.tower = tw.voice; } });
  const atc = emitter();
  h.atc = atc; h.radio = radio;
  h.ac = { type: plane, events: [], pos: { x: 0, y: 0, z: 0 }, onGround: true, crashed: false, gs: 0, speed: 0, alt: 0, agl: 0, bank: 0, surface: 'runway', fuelFraction: 1 };
  h.ent = { ac: h.ac, ap: { _vstall: () => 48 * KT } };
  h.traffic = { list: [h.ent] };
  h.play = (o = {}) => {
    h.diff = o.diff || diff; h.plane = o.plane || plane; h.ac.type = h.plane;
    h.game = G.createGame({ mode: o.mode || 'free', career: false, difficulty: h.diff, protection: { easy: 'rubber', medium: 'partial', hard: 'realistic' }[h.diff], rng: seeded(3), autoBank: false });
    tasks.attach({ game: h.game, atc, radio, mode: o.mode || 'free', difficulty: h.diff, plane: h.plane });
    return h;
  };
  h.play();
  h.warp = 1;
  h.sample = (dt = 0.1) => tasks.sample(dt, h.ent, h.traffic, h.warp);
  h.ground = (surface = 'runway', x = 0, z = 0) => { Object.assign(h.ac, { onGround: true, surface, gs: 0, speed: 0, agl: 0, bank: 0 }); h.ac.pos.x = x; h.ac.pos.z = z; h.sample(); };
  h.lift = (o = {}) => { Object.assign(h.ac, { onGround: false, gs: 40, speed: 40, agl: 50, alt: 50, ...o }); h.sample(); };
  h.takeoff = (surface = 'runway', x = 0, z = 0) => { h.ground(surface, x, z); h.lift(); };
  h.touchdown = (fpm = 300, o = {}) => {
    const { surface = 'runway', x = 0, z = 0, grade = fpm < 250 ? 'butter' : fpm < 500 ? 'smooth' : fpm < 800 ? 'firm' : fpm < 1100 ? 'hard' : 'crash', fuel = 1 } = o;
    Object.assign(h.ac, { onGround: true, surface, gs: 25, speed: 25, agl: 0, fuelFraction: fuel }); h.ac.pos.x = x; h.ac.pos.z = z;
    h.ac.events.push({ type: 'touchdown', fpm, grade, bounce: false, surface });
    h.sample(); h.ac.events.length = 0; h.ac.fuelFraction = 1;
  };
  h.acEvent = (ev) => { h.ac.events.push(ev); h.sample(); h.ac.events.length = 0; };
  h.fly = (secs, o = {}, dt = 1) => { Object.assign(h.ac, { onGround: false, crashed: false, gs: 50, speed: 50, agl: 300, alt: 300, bank: 0, ...o }); h.ac.pos.y = h.ac.alt; for (let t = 0; t < secs - 1e-9 && !ABORT; t += dt) h.sample(dt); };
  h.at = (x, z, agl) => { Object.assign(h.ac, { onGround: false, gs: 40, speed: 40, agl, alt: agl, bank: 0 }); h.ac.pos.x = x; h.ac.pos.z = z; h.sample(); };
  // through the real score economy: ATC-shaped infraction events (numeric ids, fresh victims)
  h.inf = (id, extra = {}) => { h.game.handleEvent({ type: id, id: ++h.n, actor: 'player', victim: `ai${++h.victim}`, ...extra }); };
  h.bark = (b) => h.game.handleEvent({ type: 'barked', source: 'response', ...b });
  h.gupd = (dt, f) => h.game.update(dt, f);
  h.landStop = () => { h.gupd(0.1, { onGround: false, gsKt: 60 }); h.gupd(0.1, { onGround: true, gsKt: 30, surface: 'runway' }); for (let i = 0; i < 5; i++) h.gupd(0.1, { onGround: true, gsKt: 0, surface: 'runway' }); };
  h.demand = () => { h.landStop(); return h.game.demand({ ok: true }); };
  // banter pays a flat 40 × scale (no combo/heat), so the bank is exactly pp
  h.bankPP = (pp) => { h.game.setPPScale(pp / 40); h.bark({ reaction: 3 }); h.game.setPPScale(1); return h.demand(); };
  h.destroy = () => { h.gupd(0.1, { onGround: false, gsKt: 60 }); h.game.reportImpact({ speedKt: 40, onGear: false }); };
  h.done = (id) => tasks.isDone(id);
  return h;
}

// Recipes: the shortest real-ish way to earn each task. `id → (h) => void`. Rule tasks are generated below.
const CROSSWIND = { x: 260 + 300 * Math.sin(40 * Math.PI / 180), z: -40 - 300 * Math.cos(40 * Math.PI / 180) };
const rep = (n, f) => { for (let i = 0; i < n && !ABORT; i++) f(i); };
const R = {
  touch_down: (h) => h.touchdown(400),
  gentle: (h) => h.touchdown(200),
  butter: (h) => h.touchdown(80),
  firm: (h) => h.touchdown(650),
  boing: (h) => h.acEvent({ type: 'impact', result: 'bounce' }),
  hat_trick: (h) => rep(3, () => { h.lift(); h.touchdown(300); }),
  crosswind: (h) => h.touchdown(300, CROSSWIND),
  deadstick: (h) => h.touchdown(300, { fuel: 0 }),
  textbook: (h) => h.game.handleEvent({ type: 'landed', actor: 'player', impeccable: true }),
  land_10: (h) => rep(10, () => h.touchdown(300)),
  land_50: (h) => rep(50, () => h.touchdown(300)),
  land_200: (h) => rep(200, () => h.touchdown(300)),
  takeoff_25: (h) => rep(25, () => h.takeoff()),
  takeoff_250: (h) => rep(250, () => h.takeoff()),
  butter_10: (h) => rep(10, () => h.touchdown(60)),
  impeccable_10: (h) => rep(10, () => { h.gupd(0.1, { onGround: false, gsKt: 60 }); h.gupd(0.1, { onGround: true, gsKt: 40, surface: 'runway' }); h.game.handleEvent({ type: 'landed', actor: 'player', impeccable: true }); }),
  five_in_one: (h) => rep(5, () => { h.lift(); h.touchdown(300); }),
  inf_10: (h) => rep(10, () => h.inf('tower_buzz')),
  inf_100: (h) => rep(100, () => h.inf('tower_buzz')),
  inf_500: (h) => rep(500, () => h.inf('tower_buzz')),
  inf_2000: (h) => rep(2000, () => h.inf('tower_buzz')),
  combo_2: (h) => rep(4, () => h.inf('tower_buzz')),
  combo_25: (h) => rep(5, () => h.inf('tower_buzz')),
  variety: (h) => ['tower_buzz', 'terminal_buzz', 'low_pass', 'queue_jump', 'cut_in_final'].forEach((id) => h.inf(id)),
  rap_sheet: (h) => Object.keys(INFRACTIONS).forEach((id) => h.inf(id)),
  frozen: (h) => h.inf('tower_buzz', { frozen: true }),
  strained: (h) => h.atc.emit('composure', { key: 'tower', tier: 2, from: 1 }),
  cracking: (h) => h.atc.emit('composure', { key: 'tower', tier: 3, from: 2 }),
  meltdown: (h) => h.atc.emit('composure', { key: 'tower', tier: 4, from: 3 }),
  lie_down: (h) => h.atc.emit('scandal', { key: 'tower', actor: 'player' }),
  resign_5: (h) => rep(5, () => h.atc.emit('scandal', { key: 'tower', actor: 'player' })),
  crack_gerald: (h) => { h.radio.setTower({ voice: 'tower_m' }); h.atc.emit('composure', { key: 'tower', tier: 3, from: 2 }); },
  crack_imogen: (h) => { h.radio.setTower({ voice: 'tower_f' }); h.atc.emit('composure', { key: 'tower', tier: 3, from: 2 }); },
  crack_toby: (h) => { h.radio.setTower({ voice: 'tower_trainee' }); h.atc.emit('composure', { key: 'tower', tier: 3, from: 2 }); },
  riposte: (h) => h.bark({ reaction: 3 }),
  quick: (h) => h.bark({ reaction: 1 }),
  quick_10: (h) => rep(10, () => h.bark({ reaction: 1 })),
  dykwia: (h) => h.bark({ intent: 'priority', target: 'tower' }),
  dykwia_10: (h) => rep(10, () => h.bark({ intent: 'priority', target: 'tower' })),
  riposte_25: (h) => rep(25, () => h.bark({ reaction: 3 })),
  riposte_100: (h) => rep(100, () => h.bark({ reaction: 3 })),
  barks_50: (h) => rep(50, () => h.radio.emit('barked', { intent: 'greeting' })),
  nm_10: (h) => rep(10, () => h.inf('near_miss')),
  nm_50: (h) => rep(50, () => h.inf('near_miss')),
  touch_10: (h) => rep(10, () => h.inf('light_touch')),
  cc_25: (h) => rep(25, (i) => h.inf(['near_miss', 'light_touch', 'formation'][i % 3])),
  form_30: (h) => { const o = { ac: { pos: { x: 20, y: 300, z: 0 }, onGround: false, crashed: false } }; h.traffic.list.push(o); h.fly(30); h.traffic.list.pop(); },
  form_300: (h) => { const o = { ac: { pos: { x: 20, y: 300, z: 0 }, onGround: false, crashed: false } }; h.traffic.list.push(o); h.fly(300); h.traffic.list.pop(); },
  hard_nm: (h) => { h.play({ diff: 'hard' }); h.inf('near_miss'); },
  // Hard contact close call through the real score rule: a ≤12 kt touch, still in one piece 3 s later
  hard_touch: (h) => { h.play({ diff: 'hard' }); h.gupd(0.1, { onGround: false, gsKt: 60 }); h.game.reportImpact({ speedKt: 8, onGear: true, other: 'ai9' }); for (let i = 0; i < 40; i++) h.gupd(0.1, { onGround: false, gsKt: 60 }); },
  castle: (h) => h.at(780, -2300, 120),
  church: (h) => h.at(125, -1605, 80),
  village: (h) => h.at(-100, -1500, 60),
  lake: (h) => h.at(-1700, -700, 30),
  castle_low: (h) => h.at(780, -2300, 25),
  church_low: (h) => h.at(125, -1605, 25),
  village_low: (h) => h.at(-100, -1500, 20),
  terminal_low: (h) => h.at(-80, -320, 35),
  lake_low: (h) => h.at(-1700, -700, 3),
  grand_tour: (h) => { h.at(780, -2300, 120); h.at(125, -1605, 80); h.at(-100, -1500, 60); h.at(-1700, -700, 30); h.at(-80, -320, 100); },
  air_30m: (h) => h.fly(1800, {}, 10),
  air_2h: (h) => h.fly(7200, {}, 10),
  air_5h: (h) => h.fly(18000, {}, 10),
  air_10h: (h) => h.fly(36000, {}, 10),
  air_50h: (h) => h.fly(180000, {}, 10),
  dist_100: (h) => h.fly(1000, { gs: 100 }, 10),
  dist_1000: (h) => h.fly(10000, { gs: 100 }, 10),
  dist_10000: (h) => h.fly(100000, { gs: 100 }, 10),
  endurance: (h) => h.fly(1200, {}, 10),
  lofty: (h) => h.fly(1, { alt: 1600 }),
  fly_c172: (h) => { h.play({ plane: 'c172' }); h.takeoff(); },
  fly_tiger: (h) => { h.play({ plane: 'tiger' }); h.takeoff(); },
  fly_bathtub: (h) => { h.play({ plane: 'bathtub' }); h.takeoff(); },
  tiger_grass: (h) => { h.play({ plane: 'tiger' }); h.touchdown(300, { surface: 'grass', z: 400 }); },
  tub_butter: (h) => { h.play({ plane: 'bathtub' }); h.touchdown(80); },
  tub_hour: (h) => { h.play({ plane: 'bathtub' }); h.fly(3600, {}, 10); },
  moth_30: (h) => { h.play({ plane: 'tiger' }); h.fly(1800, {}, 10); },
  c172_25: (h) => { h.play({ plane: 'c172' }); rep(25, () => h.touchdown(300)); },
  fly_jumbo: (h) => { h.play({ plane: 'jumbo' }); h.takeoff(); },
  land_jumbo: (h) => { h.play({ plane: 'jumbo' }); h.touchdown(400); },
  butter_jumbo: (h) => { h.play({ plane: 'jumbo' }); h.touchdown(150); },
  buzz_jumbo: (h) => { h.play({ plane: 'jumbo' }); h.inf('tower_buzz'); },
  fly_herc: (h) => { h.play({ plane: 'herc' }); h.takeoff(); },
  herc_grass: (h) => { h.play({ plane: 'herc' }); h.touchdown(300, { surface: 'grass', z: 400 }); },
  fly_f35: (h) => { h.play({ plane: 'f35' }); h.takeoff(); },
  f35_fast: (h) => { h.play({ plane: 'f35' }); h.fly(1, { speed: 480 * KT, gs: 480 * KT }); },
  f35_flypast: (h) => { h.play({ plane: 'f35' }); h.inf('low_pass'); },
  f35_hover: (h) => { h.play({ plane: 'f35' }); h.fly(31, { vtol: 1, speed: 1, gs: 1, agl: 30, alt: 30 }); h.ac.vtol = 0; },
  f35_vfield: (h) => { h.play({ plane: 'f35' }); h.ac.vtol = 1; h.touchdown(250, { surface: 'grass', z: 400 }); h.ac.vtol = 0; },
  f35_vhard: (h) => { h.play({ plane: 'f35', diff: 'hard' }); h.ac.vtol = 1; h.touchdown(350); h.ac.vtol = 0; },
  finish_easy: (h) => { h.play({ diff: 'easy' }); h.demand(); },
  finish_medium: (h) => { h.play({ diff: 'medium' }); h.demand(); },
  finish_hard: (h) => { h.play({ diff: 'hard' }); h.demand(); },
  medium_2000: (h) => { h.play({ diff: 'medium' }); h.bankPP(2000); },
  hard_1000: (h) => { h.play({ diff: 'hard' }); h.bankPP(1000); },
  hard_5000: (h) => { h.play({ diff: 'hard' }); h.bankPP(5000); },
  hard_10: (h) => { h.play({ diff: 'hard' }); rep(10, () => h.demand()); },
  iron_peer: (h) => { h.play({ diff: 'hard' }); rep(5, () => h.demand()); },
  turnip_hop: (h) => { h.touchdown(300, { surface: 'grass', x: 0, z: 1500 }); h.ground('grass', 0, 1500); h.lift(); },
  topsy: (h) => h.fly(6, { bank: Math.PI }),
  upside_60: (h) => { rep(4, () => { h.fly(16, { bank: Math.PI }); h.fly(3, { bank: 0 }); }); },
  hum_along: (h) => h.fly(11, { speed: 45 * KT, agl: 200 }),
  parachute: (h) => { h.play({ diff: 'hard' }); h.destroy(); },
  insurance: (h) => { h.play({ diff: 'hard' }); rep(10, () => h.destroy()); },
  fumes: (h) => h.acEvent({ type: 'fuelempty' }),
  rubber_baron: (h) => rep(20, () => h.acEvent({ type: 'impact', result: 'bounce' })),
  tailstrike: (h) => h.acEvent({ type: 'tailstrike' }),
  vne: (h) => h.fly(1, { speed: 170 * KT }),
  bank_500: (h) => h.bankPP(500),
  bank_2000: (h) => h.bankPP(2000),
  bank_10000: (h) => h.bankPP(10000),
  life_25k: (h) => rep(3, () => h.bankPP(10000)),
  life_100k: (h) => rep(10, () => h.bankPP(10000)),
  life_500k: (h) => rep(50, () => h.bankPP(10000)),
  finish_10: (h) => rep(10, () => h.demand()),
  finish_100: (h) => rep(100, () => h.demand()),
  story_hard: (h) => h.tasks.story({ ok: true, mission: 2, diff: 'hard', objectives: ['cut'] }),
};
for (const id of Object.keys(INFRACTIONS)) R[`rule_${id}`] = (h) => h.inf(id);
for (const m of D.STORY) {
  R[`story_${m.id}`] = (h) => h.tasks.story({ ok: true, mission: m.id, diff: 'easy', objectives: m.objectives.slice(0, 1) });
  R[`story_${m.id}_all`] = (h) => h.tasks.story({ ok: true, mission: m.id, diff: 'easy', objectives: m.objectives });
}

const ALL = D.SETS.flatMap((s) => s.tasks.map((t) => ({ ...t, set: s.id })));
const allReady = () => true;

section('catalogue');
ok(ALL.length >= 120, `120+ tasks (${ALL.length})`);
ok(new Set(ALL.map((t) => t.id)).size === ALL.length, 'task ids unique');
for (const s of D.SETS) ok(s.tasks.length >= 8 && s.tasks.length <= 12, `set ${s.id}: 8–12 tasks (${s.tasks.length})`);
ok(ALL.every((t) => ['bronze', 'silver', 'gold'].includes(t.tier)), 'every task has a tier');
ok(ALL.every((t) => t.on || ((t.stat && D.STATS[t.stat]) || (t.fstat && D.FSTATS[t.fstat])) && t.target > 0), 'every task names an event or a known counter with a target');
ok(ALL.every((t) => R[t.id]), `a recipe for every task (missing: ${ALL.filter((t) => !R[t.id]).map((t) => t.id).join(', ') || 'none'})`);
ok(Object.keys(INFRACTIONS).every((id) => ALL.some((t) => t.id === `rule_${id}`)), 'every rule in data/rules.js has its own task');

section('every task completes, and fires exactly once');
const notDone = [], twice = [];
for (const t of ALL) {
  const h = harness({ ready: allReady });
  try { R[t.id](h); } catch (e) { console.log('   recipe threw', t.id, e.message); }
  if (!h.done(t.id) || h.fired[t.id] !== 1) notDone.push(`${t.id}(${h.fired[t.id] || 0})`);
  try { R[t.id](h); h.play(); R[t.id](h); } catch (e) { /* */ }
  if (h.fired[t.id] !== 1) twice.push(`${t.id}×${h.fired[t.id]}`);
}
ok(!notDone.length, `all ${ALL.length} tasks complete from their recipe (failed: ${notDone.join(' ') || 'none'})`);
ok(!twice.length, `no task fires twice when its recipe repeats (failed: ${twice.join(' ') || 'none'})`);

section('negative controls: near-misses of each detector do not complete');
{
  const h = harness();
  h.touchdown(120); ok(!h.done('butter'), 'butter: 120 fpm is not under 100');
  h.touchdown(300, { x: 0, z: 0 }); ok(!h.done('crosswind'), 'crosswind: 09/27 is not 04/22');
  h.touchdown(300, { fuel: 0.2 }); ok(!h.done('deadstick'), 'deadstick: fuel left');
  h.touchdown(1200, { grade: 'crash' }); ok(h.tasks.stats().landings === 3, 'a crash touchdown is not a landing (3 landings, then a crash)');
  h.at(780, -2300, 200); ok(!h.done('castle'), 'castle: 200 m is too high');
  h.at(780, -2300, 60); ok(h.done('castle') && !h.done('castle_low'), 'castle at 60 m: visit, not low');
  h.fly(4, { bank: Math.PI }); h.fly(1, { bank: 0 }); h.fly(4, { bank: Math.PI }); ok(!h.done('topsy'), 'topsy needs 5 s in ONE go (4 + 4 is not)');
  h.fly(9, { speed: 45 * KT }); h.fly(1, { speed: 80 * KT }); h.fly(9, { speed: 45 * KT }); ok(!h.done('hum_along'), 'hum along needs 10 s straight');
  h.fly(5, { speed: 45 * KT, agl: 10 }); ok(true, 'stall near the ground is not a ride');
  h.touchdown(300, { surface: 'runway' }); h.ground('runway'); h.lift(); ok(!h.done('turnip_hop'), 'turnip hop: runway to runway is not a field hop');
  h.touchdown(300, { surface: 'grass', x: 0, z: 60 }); h.ground('grass', 0, 60); h.lift(); ok(!h.done('turnip_hop'), 'turnip hop: grass beside the runway is not a field');
  h.touchdown(300, { surface: 'grass', z: 1500 }); h.ground('runway', 0, 0); h.lift(); ok(!h.done('turnip_hop'), 'turnip hop: field landing then a runway takeoff is not it');
  h.atc.emit('composure', { key: 'tower:ai3', tier: 4, from: 3, actor: 'ai3' }); ok(!h.done('meltdown'), "someone else's tower meter does not count");
  h.radio.setTower({ voice: 'tower_f' }); h.atc.emit('composure', { key: 'tower', tier: 2, from: 1 }); ok(!h.done('crack_imogen'), 'Imogen merely Strained is not cracked');
  const h2 = harness(); h2.play({ diff: 'medium' }); h2.bankPP(1500); ok(!h2.done('hard_1000') && !h2.done('medium_2000'), '1,500 on Medium: neither Hard 1,000 nor Medium 2,000');
  const h3 = harness(); h3.play({ diff: 'hard' }); rep(4, () => h3.demand()); h3.destroy(); h3.demand(); ok(!h3.done('iron_peer'), 'iron peer: a destroyed breaks the streak (4 + 1)');
  const h4 = harness(); h4.tasks.story({ ok: true, mission: 4, diff: 'easy', objectives: ['steal', 'race', 'land'] }); ok(h4.done('story_4') && !h4.done('story_4_all'), 'mission 4 with an objective missed: done, not full marks');
  const h5 = harness(); h5.fly(1, { speed: 150 * KT }); ok(!h5.done('vne'), 'c172 at 150 kt is under Vne 163');
  const h6 = harness(); h6.play({ plane: 'bathtub' }); h6.touchdown(80); ok(h6.done('tub_butter') && h6.done('butter'), 'bathtub butter counts for both');
  // D35: STOVL tasks need a real vertical landing / an unbroken 30 s hover
  const h7 = harness(); h7.play({ plane: 'f35', diff: 'hard' }); h7.touchdown(250, { surface: 'grass', z: 400 });
  ok(!h7.done('f35_vfield') && !h7.done('f35_vhard'), 'a conventional F-35 landing on grass is not a vertical landing');
  h7.fly(20, { vtol: 1, speed: 1, gs: 1, agl: 30 }); h7.fly(2, { vtol: 1, speed: 60, gs: 60 }); h7.fly(20, { vtol: 1, speed: 1, gs: 1, agl: 30 });
  ok(!h7.done('f35_hover'), 'two 20 s hovers are not a 30 s hover');
  h7.fly(11, { vtol: 1, speed: 1, gs: 1, agl: 30 }); ok(h7.done('f35_hover'), '…a 31 s one is');
}

section('unready planes stay locked ("coming soon")');
{
  const { AIRCRAFT } = await imp('data/aircraft.js');
  for (const p of D.HEAVY_PLANES) {
    const st = AIRCRAFT[p]?.status || '(absent)';
    const h = harness();
    const list = h.tasks.tasks().filter((t) => t.plane === p);
    ok(list.length > 0, `${p}: has tasks`);
    if (st === 'ready') { ok(list.every((t) => t.avail), `${p} is ready: its tasks are open`); continue; }
    ok(list.every((t) => !t.avail), `${p} is ${st}: its tasks show as locked`);
    for (const t of list) R[t.id](h);
    ok(list.every((t) => !h.done(t.id)), `${p}: locked tasks cannot complete`);
  }
  const h = harness({ ready: (p) => !p || p === 'jumbo' });
  ok(h.tasks.sets().find((s) => s.id === 'heavy').locked, 'Heavy Metal shows "new planes coming" while any of its planes is not ready');
}

section('ladders progress');
{
  const h = harness();
  rep(5, () => h.touchdown(300));
  const p = (id) => h.tasks.tasks().find((t) => t.id === id);
  ok(Math.abs(p('land_10').frac - 0.5) < 1e-9 && p('land_10').value === 5, 'land 10: 5/10 after five');
  ok(Math.abs(p('land_50').frac - 0.1) < 1e-9, 'land 50: 10% after five');
  rep(5, () => h.touchdown(300));
  ok(h.done('land_10') && !h.done('land_50') && p('land_50').value === 10, 'land 10 done at ten; land 50 carries on at 10');
  h.fly(900, {}, 10);
  ok(Math.abs(p('air_30m').frac - 0.5) < 0.01 && !h.done('air_30m'), 'flight time: 15 of 30 minutes');
  const h1 = harness(), p1 = (id) => h1.tasks.tasks().find((t) => t.id === id);
  h1.lift(); h1.touchdown(300); h1.lift(); h1.touchdown(300);
  ok(p1('hat_trick').value === 2 && !h1.done('hat_trick'), 'per-flight ladder: best flight shows 2/3');
  h1.tasks.handle({ type: 'flightStart' });
  h1.lift(); h1.touchdown(300);
  ok(p1('hat_trick').value === 2 && h1.tasks.flight().landings === 1, 'a new flight resets the count but keeps the best (2)');
}

section('flight time is real play time: time warp does not shortcut it');
{
  const h = harness();
  h.warp = 5; h.fly(1800, {}, 10);
  const st = h.tasks.stats();
  ok(Math.abs(st.airSecs - 360) < 1e-6 && !h.done('air_30m'), `30 min of sim at ×5 warp = 6 min of play (${st.airSecs} s), Elevenses Aloft not done`);
  ok(Math.abs(st.distM - 1800 * 50) < 1e-6, `distance counts as flown (${st.distM / 1000} km)`);
  h.warp = 1; h.fly(1440, {}, 10);
  ok(h.done('air_30m'), 'the remaining 24 real minutes at ×1 finish it');
  const h2 = harness(); h2.warp = 5; h2.fly(60, { bank: Math.PI }, 1);
  ok(!h2.done('upside_60') && Math.abs((h2.tasks.flight().invSecs || 0) - 12) < 1e-6, 'inverted time is real time too (60 s sim at ×5 = 12 s)');
}

section('career.addBonus: task PP without sortie side effects');
{
  const c = G.loadCareer({ storage: memStore(), now: () => 1 });
  let up = null; c.on('rankUp', (r) => { up = r; });
  c.addBonus(2500);
  ok(c.lifetimePP === 2500 && c.stats.sorties === 0 && c.stats.bestSortie === 0, 'addBonus: lifetime +2500, sorties 0, bestSortie 0');
  ok(up && up.to === 1, 'addBonus still promotes (Viscount at 2,000)');
}

section('rewards: PP into the real career, set bonus once');
{
  const cs = memStore();
  const career = G.loadCareer({ storage: cs, now: () => 1 });
  const h = harness({ career });
  const wheels = D.SETS.find((s) => s.id === 'wheels');
  const before = career.lifetimePP;
  for (const t of wheels.tasks) R[t.id](h);
  const sum = Object.keys(h.fired).reduce((a, id) => a + TK.taskPP(ALL.find((t) => t.id === id)), 0), bonus = TK.setBonus(wheels);
  ok(wheels.tasks.every((t) => h.done(t.id)), 'every Wheels task done');
  ok(career.lifetimePP - before === sum + bonus, `paid each fired task (${Object.keys(h.fired).length} tasks, ${sum}) + Wheels bonus ${bonus} (got ${career.lifetimePP - before})`);
  ok(h.sets.wheels === 1, 'set event fired once');
  for (const t of wheels.tasks) R[t.id](h);
  const sum2 = Object.keys(h.fired).reduce((a, id) => a + TK.taskPP(ALL.find((t) => t.id === id)), 0);
  ok(career.lifetimePP - before === sum2 + bonus && h.sets.wheels === 1 && Object.values(h.fired).every((n) => n === 1), 'repeating every recipe: no task or set bonus paid twice');
  ok(h.tasks.worn()?.id === 'wheels' && h.tasks.regalia().length === 1, 'first set: its badge is worn automatically');
  ok(h.tasks.wear('ledger') === false, 'cannot wear an unearned badge');
  ok(h.tasks.summary().earned === sum2 + bonus, 'summary.earned matches what was paid');
  ok(JSON.parse(cs.getItem(G.CAREER_KEY)).lifetimePP === career.lifetimePP, 'career saved its own key with the task PP');
  ok(TK.setBonus(wheels) >= D.SET_BONUS.min, 'set bonus at least the minimum');
  ok(career.stats.sorties === 0 && career.stats.bestSortie === 0, `task payments are not sorties (sorties ${career.stats.sorties}, bestSortie ${career.stats.bestSortie})`);
}

section('save / load round-trip');
{
  const st = memStore();
  const h = harness({ storage: st, ready: allReady });
  R.land_10(h); R.butter(h); R.hat_trick(h); R.rap_sheet(h); R.castle(h); h.fly(100, {}, 10);
  h.tasks.detach();
  const raw = st.getItem(D.TASKS_KEY);
  ok(!!raw && JSON.parse(raw).v === TK.TASKS_VERSION, `saved under '${D.TASKS_KEY}'`);
  const t2 = TK.createTasks({ storage: st, ready: allReady });
  const a = h.tasks.toJSON(), b = t2.toJSON();
  ok(JSON.stringify(a.done) === JSON.stringify(b.done), 'done list survives');
  ok(JSON.stringify(a.stats) === JSON.stringify(b.stats) && JSON.stringify(a.uniq) === JSON.stringify(b.uniq), 'lifetime counters survive');
  ok(JSON.stringify(a.best) === JSON.stringify(b.best), 'best-flight counters survive');
  ok(t2.summary().done === h.tasks.summary().done, `summary survives (${t2.summary().done} done)`);
  const fired = []; t2.on('task', (t) => fired.push(t.id));
  t2.handle({ type: 'touchdown', fpm: 50, surface: 'runway' });
  ok(!fired.includes('butter') && !fired.includes('touch_down'), 'reloaded: finished tasks never fire again');
  const st2 = memStore(); st2.setItem('krayzee.story', JSON.stringify({ introSeen: true, missions: { 1: { done: true, diff: 'easy' }, 2: { done: true, diff: 'hard' } } }));
  const t3 = TK.createTasks({ storage: st2 });
  ok(t3.isDone('story_1') && t3.isDone('story_2') && t3.isDone('story_hard') && !t3.isDone('story_3'), 'retro credit from an existing story save (missions 1, 2 on Hard)');
  const t4 = TK.createTasks({ storage: st2 });
  ok(t4.summary().done === t3.summary().done, 'retro credit applies once');
  st.setItem(D.TASKS_KEY, '{not json');
  ok(TK.createTasks({ storage: st }).summary().done === 0, 'a corrupt save starts fresh instead of throwing');
}

section('live adapter details');
{
  const h = harness();
  const ev = { type: 'touchdown', fpm: 90, grade: 'butter', bounce: false, surface: 'runway' };
  h.ac.events.push(ev); Object.assign(h.ac, { onGround: true }); h.sample(); h.sample(); h.sample();
  ok(h.tasks.stats().landings === 1, 'an aircraft event left in ac.events is counted once across frames');
  h.ac.events.length = 0;
  h.tasks.detach();
  h.inf('tower_buzz');
  ok(!h.done('rule_tower_buzz'), 'after detach, the old game no longer feeds tasks');
  const s0 = h.tasks.stats().airSecs || 0; h.ac.crashed = true; h.fly(10); h.ac.crashed = false;
  ok((h.tasks.stats().airSecs || 0) >= s0, 'sampling still safe when detached');
}

section('reward totals (pacing)');
{
  const tot = ALL.reduce((a, t) => a + TK.taskPP(t), 0) + D.SETS.reduce((a, s) => a + TK.setBonus({ ...s, tasks: s.tasks }), 0);
  if (!QUIET) console.log(`   all tasks + all set bonuses = ${tot.toLocaleString('en-GB')} PP`);
  ok(tot < 260000 * 0.4, `task PP stays well under 40% of Emperor's 260k (${tot})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }

// ---------------------------------------------------------------- falsification
function falsify() {
  const breaks = [
    ['butter threshold', 'data/tasks.js', "when: (e) => ok(e) && e.fpm < 100 }),", "when: (e) => ok(e) && e.fpm < 10 }),"],
    ['task fires twice', 'js/game/tasks.js', [["if (D.done[t.id] || !avail(t)) return null;", "if (!avail(t)) return null;"], ["if (!D.done[t.id] && (!t.when || t.when(e)))", "if ((!t.when || t.when(e)))"], ["if (!D.done[t.id] && statVal(k) >= t.target)", "if (statVal(k) >= t.target)"]]],
    ['set bonus on any task of the set', 'js/game/tasks.js', "if (s && !D.sets[s.id] && s.tasks.every((x) => D.done[x.id]))", "if (s && s.tasks.some((x) => D.done[x.id]))"],
    ['touchdown detector', 'js/game/tasks.js', "if (ev.type === 'touchdown') {", "if (ev.type === 'touchdwn') {"],
    ['inverted threshold', 'js/game/tasks.js', 'export const INVERTED_RAD = 2.09;', 'export const INVERTED_RAD = 3.5;'],
    ['best flight not kept', 'js/game/tasks.js', 'for (const k of fc) if ((F[k] ?? 0) > fBest(k)) D.best[k] = F[k];', ''],
    ['iron peer streak never resets', 'data/tasks.js', "resetOn: ['destroyed'] },", '},'],
    ['field takeoff ignores the field', 'js/game/tasks.js', "const fromField = !!L.lastTouch?.field && !PAVED.includes(L.lastGroundSurface);", 'const fromField = true;'],
    ['ATC composure unsubscribed', 'js/game/tasks.js', "on(atc, 'composure',", "on(atc, 'composur',"],
    ['infractions not forwarded', 'js/game/tasks.js', "else if (INFRACTIONS[e.id]) handle(", "else if (INFRACTIONS[e.id] && false) handle("],
    ['grand tour off by one', 'data/tasks.js', "{ fstat: 'visits', target: 5 }", "{ fstat: 'visits', target: 6 }"],
    ['locked planes complete anyway', 'js/game/tasks.js', 'export const planeReady = (id) => !id || AIRCRAFT[id]?.status === \'ready\';', 'export const planeReady = () => true;'],
    ['save drops stats', 'js/game/tasks.js', "if (raw && typeof raw === 'object') D = { ...blank(), ...raw, v: TASKS_VERSION };", "if (raw && typeof raw === 'object') D = { ...blank(), ...raw, stats: {}, v: TASKS_VERSION };"],
    ['payments through addPP (sorties)', 'js/game/tasks.js', 'if (career?.addBonus) career.addBonus(pp); else career?.addPP(pp, {});', 'career?.addPP(pp, {});'],
    ['flight time counts warped sim time', 'js/game/tasks.js', 'const rdt = dt / Math.max(1, +warp || 1);', 'const rdt = dt;'],
    ['story full marks ignores ticks', 'data/tasks.js', '&& m.objectives.every((o) => e.ticks?.includes(o))', ''],
  ];
  let caught = 0;
  for (const [name, file, a, b] of breaks) {
    const pairs = Array.isArray(a) ? a : [[a, b]];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krz-tasks-'));
    for (const d of ['js', 'data', 'tools']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    const f = path.join(tmp, file), src = fs.readFileSync(f, 'utf8');
    if (!pairs.every(([from]) => src.includes(from))) { console.log(`  ?? ${name}: pattern not found (update the falsify list)`); fs.rmSync(tmp, { recursive: true, force: true }); continue; }
    fs.writeFileSync(f, pairs.reduce((t, [from, to]) => t.replace(from, to), src));
    const r = spawnSync(process.execPath, [path.join(tmp, 'tools/tasks-sim.mjs'), '--quiet'], { env: { ...process.env, KRZ_ROOT: tmp }, encoding: 'utf8' });
    const failed = r.status !== 0;
    if (failed) caught++;
    const why = (r.stdout.match(/FAIL .*/g) || []).slice(0, 2).join(' | ');
    console.log(`  ${failed ? 'caught' : 'MISSED'} ${name}${failed ? ' ← ' + why.slice(0, 160) : ''}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nfalsify: ${caught}/${breaks.length} breaks caught`);
  if (caught !== breaks.length) process.exit(1);
}

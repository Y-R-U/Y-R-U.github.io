// node tools/sim/test.mjs [--quick]  — deterministic sim tests. Exit 1 on failure.
import { createRng } from '../../js/sim/rng.js';
import { createBattle, simulateBattle, prepareData } from '../../js/sim/battle.js';
import { activeSynergies, unitStats, squadPower } from '../../js/sim/stats.js';
import { createGame } from '../../js/sim/game_state.js';
import * as P from '../../js/sim/progression.js';
import { migrate, migrations, SAVE_VERSION } from '../../js/sim/save.js';
import { loadData, fixtureData } from '../../js/sim/data.js';
import { generateRival } from '../../js/sim/arena.js';
import { evalGoal, evalGoals, goalText, allLevels } from '../../js/sim/story.js';
import { validateData } from './validate.mjs';

const QUICK = process.argv.includes('--quick');
let pass = 0, fail = 0;
const t0 = Date.now();
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.stack?.split('\n').slice(0, 3).join('\n       ')}`); }
}
function eq(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function ok(c, m = 'assert') { if (!c) throw new Error(m); }
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

const FX = fixtureData();
const REAL = await loadData();
const S = (def, level, col, lane, rank = 1) => ({ def, level, rank, slot: { col, lane } });
const squadA = { units: [S('aegis', 8, 0, 1), S('lancer', 8, 1, 1), S('halo', 8, 1, 0), S('pyre', 8, 1, 2), S('scrapjaw', 8, 0, 0)] };
const wavesA = [{ units: [S('scrapjaw', 7, 0, 1, 0), S('viper', 7, 1, 1, 0)] }, { units: [S('monolith', 7, 0, 1), S('prism', 7, 1, 0), S('nullwave', 7, 1, 2)] }];

console.log(`sim tests (${QUICK ? 'quick' : 'full'}), data: ${REAL._source}`);

test('rng deterministic + fork', () => {
  const a = createRng(7), b = createRng(7);
  for (let i = 0; i < 100; i++) eq(a.next(), b.next());
  ok(createRng('x').next() !== createRng('y').next());
  const w = createRng(1); const c = { a: 0, b: 0 }; for (let i = 0; i < 2000; i++) c[w.weighted({ a: 3, b: 1 })]++;
  ok(c.a > 1300 && c.a < 1700, 'weighted ~75%');
});

test('battle deterministic per seed', () => {
  const run = (seed) => { const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed }); b.runToEnd(); return hash(JSON.stringify(b.events)); };
  eq(run(11), run(11)); ok(run(11) !== run(12), 'different seed differs');
});

test('event invariants', () => {
  const seeds = QUICK ? 5 : 30;
  for (let s = 0; s < seeds; s++) {
    const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: s });
    b.runToEnd();
    const dead = new Set(); const shots = new Set(); let ends = 0, lastT = 0;
    for (const e of b.events) {
      ok(e.t >= lastT, 'events in time order'); lastT = e.t;
      if (e.type === 'attack' || (e.type === 'ability' && e.kind === 'overdrive')) {
        ok(!dead.has(e.src), `dead unit ${e.src} acted`);
        ok(e.fireT >= e.t && e.impactT >= e.fireT, 'fireT/impactT order');
        shots.add(e.shot);
      }
      if (e.type === 'hit') { ok(e.hp >= 0 && e.hp <= e.maxHp, 'hp range'); ok(e.amount >= 0); if (e.shot != null) ok(shots.has(e.shot), 'hit references a shot'); }
      if (e.type === 'death') dead.add(e.dst);
      if (e.type === 'revive') dead.delete(e.dst);
      if (e.type === 'end') ends++;
    }
    eq(ends, 1, 'one end event');
    ok(b.result && b.done);
  }
});

test('front column screens the back (basic lane attacks)', () => {
  const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 3 });
  const alive = {};
  while (!b.done) {
    for (const e of b.step(1)) {
      if (e.type === 'attack') {
        const ab = FX.abilities[e.ability];
        if ((ab.target?.pick || 'lane') !== 'lane' || ab.target?.side === 'ally') continue;
        const dst = b.state.units[e.dst];
        const side = dst.side === 'player' ? b.state.player.units : b.state.enemy.units;
        const frontAlive = side.some((u) => u.alive && u.slot.col === 0 && !u.statuses.some((s) => s.id === 'stealth'));
        if (frontAlive) ok(dst.slot.col === 0, `attack on back-liner ${e.dst} while front alive (t=${e.t})`);
      }
    }
  }
  void alive;
});

test('role triangle + position bonuses', () => {
  const vs = (atkDef, tgtDef) => {
    const b = createBattle({ data: FX, player: { units: [S(atkDef, 10, 1, 1)] }, enemyWaves: [{ units: [S(tgtDef, 10, 0, 1)] }], seed: 1 });
    b.step(60);
    const hits = b.events.filter((e) => e.type === 'hit' && e.src === 'p4' && !e.dot && !e.crit);
    return hits[0];
  };
  eq(vs('lancer', 'pyre').adv, 'adv', 'archer > mage');
  eq(vs('lancer', 'aegis').adv, 'resist', 'tank resists archer');
  const b = createBattle({ data: FX, player: { units: [S('aegis', 1, 0, 1), S('lancer', 1, 1, 0)] }, enemyWaves: [{ units: [S('dock_brute', 1, 0, 1)] }], seed: 1 });
  ok(b.state.units.p1.posBonus.includes('front') && b.state.units.p3.posBonus.includes('back'));
});

test('synergies counted', () => {
  const syn = activeSynergies(FX, ['aegis', 'lancer', 'halo'].map((id) => FX.units[id]));
  ok(syn.some((s) => s.id === 'corp_link' && s.tier === 1) && syn.some((s) => s.id === 'triad'), JSON.stringify(syn.map((s) => s.id)));
});

test('waves: hp carries over + wave heal', () => {
  const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 5 });
  let hpAtClear = null;
  while (!b.done) {
    for (const e of b.step(1)) {
      if (e.type === 'wave' && e.phase === 'clear' && e.wave === 1) hpAtClear = b.state.player.units.map((u) => u.hp);
      if (e.type === 'wave' && e.phase === 'start' && e.wave === 2) {
        b.state.player.units.forEach((u, i) => { if (u.alive) ok(u.hp >= hpAtClear[i] && u.hp <= u.maxHp, 'hp carried, healed'); });
        ok(b.state.player.units.some((u, i) => u.alive && u.hp > hpAtClear[i]) || b.state.player.units.every((u) => u.hp === u.maxHp || !u.alive), 'wave heal applied');
      }
    }
  }
  ok(hpAtClear, 'wave 1 cleared');
});

test('manual overdrive + exact replay', () => {
  const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 9, auto: false });
  let fired = 0;
  while (!b.done) {
    b.step(1);
    for (const u of b.state.player.units) if (u.overdriveReady && b.t % 7 === 0) { if (b.fireOverdrive(u.id)) fired++; }
  }
  ok(fired > 0, 'fired some overdrives');
  const r1 = b.result;
  const replay = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 9, auto: false, inputs: r1.inputs });
  replay.runToEnd();
  eq(hash(JSON.stringify(replay.events)), hash(JSON.stringify(b.events)), 'replay identical');
  const noOd = simulateBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 9, auto: false });
  ok(noOd.stats.p1.overdrives === 0, 'no player overdrive without input');
});

test('progression: xp, caps, rank, ability', () => {
  const E = P.econ(FX);
  const u = { def: 'lancer', level: 1, xp: 0, rank: 0, abilityLevels: { attack: 1, passive: 1, overdrive: 1 } };
  P.addUnitXp(E, u, 1e9);
  eq(u.level, P.levelCap(E, 0), 'xp stops at cap');
  eq(P.abilityCap(E, u), 1);
  ok(unitStats(FX, { def: 'lancer', level: 10, rank: 1 }).atk > unitStats(FX, { def: 'lancer', level: 10, rank: 0 }).atk);
});

test('game_state: story flow, slots, recruit determinism, save round-trip', () => {
  let stored = null;
  const storage = { read: () => (stored ? JSON.parse(stored) : null), write: (s) => { stored = JSON.stringify(s); }, clear: () => { stored = null; } };
  const g = createGame({ data: FX, storage, now: () => 1.7e12 });
  g.newGame({ seed: 42 });
  eq(g.slots, 2);
  let guard = 0;
  while (g.nextLevel()?.id !== 'm2_l1' && guard++ < 30) {
    const cfg = g.startLevel(g.nextLevel().id);
    ok(cfg.ok, cfg.reason);
    g.completeBattle(simulateBattle(cfg));
    for (const u of g.units()) g.feedScrap(u.uid);
    g.autoFormation();
  }
  ok(g.slots >= 3, 'slot 3 unlocked by m1_l3');
  g.save.wallet.credits += 5000;
  const r1 = g.recruit('standard', 3);
  ok(r1.ok && r1.results.length === 3);
  const g2 = createGame({ data: FX, storage });
  ok(g2.load(), 'loads');
  eq(JSON.stringify(g2.save), stored);
  eq(g2.save.units.length, g.save.units.length);
  const bad = g.setFormation([{ uid: 'nope', slot: { col: 0, lane: 0 } }]);
  ok(!bad.ok);
});

test('save migrate hook', () => {
  eq(migrate({ v: SAVE_VERSION, a: 1 }).a, 1);
  migrations[SAVE_VERSION] = (s) => ({ ...s, v: SAVE_VERSION + 1, migrated: true });
  delete migrations[SAVE_VERSION];
});

test('arena rival near target power', () => {
  for (const tp of [300, 1200, 4000]) {
    const r = generateRival(REAL, { targetPower: tp, size: 4, seed: tp, maxLevel: 60 });
    const p = squadPower(REAL, r.units);
    ok(Math.abs(p - tp) / tp < 0.15 || r.units.every((u) => u.level === 1), `rival ${p} vs ${tp}`);
  }
});

test('js/data validates', () => {
  const { errors } = validateData(REAL);
  ok(!errors.length, errors.slice(0, 8).join('\n       '));
});

test('real data: every level is simulatable', () => {
  const D = REAL;
  const g = createGame({ data: D, storage: false, now: () => 1.7e12 });
  g.newGame({ seed: 1 });
  for (const l of g.levels().slice(0, QUICK ? 5 : 1000)) {
    const r = simulateBattle({ data: D, player: { units: g.squadUnits() }, enemyWaves: D.maps.flatMap((m) => m.levels).find((x) => x.id === l.id).waves, seed: 1 });
    ok(r && typeof r.win === 'boolean', l.id);
  }
});

// ---------- sim-2: star goals, chests, shard exchange, Rift banner, forfeit
const godGame = (seed = 5) => {
  const g = createGame({ data: REAL, storage: false, now: () => 1.7e12 });
  g.newGame({ seed });
  for (const u of g.save.units) { u.level = 60; u.rank = 5; u.abilityLevels = { attack: 5, passive: 5, overdrive: 5 }; }
  g.autoFormation();
  return g;
};

test('goals: evalGoal rules + text', () => {
  const ctx = { win: true, time: 30, lost: 1, deployed: 3, roles: { tank: 1, archer: 2 }, factions: { rogue: 2, corporate: 1 }, integrity: 0.55 };
  eq(evalGoal({ type: 'win' }, ctx), true);
  eq(evalGoal({ type: 'no_losses' }, ctx), false);
  eq(evalGoal({ type: 'max_lost', n: 1 }, ctx), true);
  eq(evalGoal({ type: 'time', max: 29 }, ctx), false);
  eq(evalGoal({ type: 'max_units', n: 3 }, ctx), true);
  eq(evalGoal({ type: 'no_role', role: 'mage' }, ctx), true);
  eq(evalGoal({ type: 'no_role', role: 'tank' }, ctx), false);
  eq(evalGoal({ type: 'min_faction', faction: 'rogue', n: 2 }, ctx), true);
  eq(evalGoal({ type: 'integrity', min: 0.6 }, ctx), false);
  eq(evalGoals([{ type: 'win' }, { type: 'no_losses' }], { ...ctx, win: false }).some(Boolean), false, 'nothing on a loss');
  ok(goalText({ type: 'time', max: 40 }).includes('40'));
});

test('goals: every story level has 3 goals; battle reports goals + stars', () => {
  for (const m of REAL.maps) for (const l of m.levels) eq(l.goals?.length, 3, l.id);
  const g = godGame();
  const cfg = g.startLevel('m1_l1');
  ok(cfg.ok && cfg.goals.length === 3);
  const r = simulateBattle(cfg);
  ok(r.win && Array.isArray(r.goals));
  eq(r.stars, r.goals.filter(Boolean).length);
});

test('game_state: goals persist per index, rewards once, chests auto-grant', () => {
  const g = godGame();
  const id = 'm1_l1';
  const l = g.level(id);
  // a run that wins but fails every challenge -> 1 star, then a perfect run -> the rest
  let cfg = g.startLevel(id);
  let out = g.completeBattle({ ...simulateBattle(cfg), lost: ['p0', 'p1', 'p2'], time: 999, integrity: 0.01 });
  ok(out.win && out.firstClear);
  ok(out.goals[0] && out.stars >= 1);
  const before = g.level(id).stars;
  ok(g.goalFormation(id).ok);
  cfg = g.startLevel(id);
  const chips0 = g.wallet.chips;
  out = g.completeBattle({ ...simulateBattle(cfg), lost: [], time: 1, integrity: 1 });
  eq(g.level(id).stars, 3, 'all goals now done');
  eq(out.newStars, 3 - before);
  const want = [1, 2].filter((i) => out.newGoals.includes(i)).reduce((a, i) => a + (l.goalRewards[i]?.chips || 0), 0);
  ok(g.wallet.chips - chips0 >= want, 'goal rewards paid');
  cfg = g.startLevel(id);
  out = g.completeBattle({ ...simulateBattle(cfg), lost: [], time: 1, integrity: 1 });
  eq(out.newStars, 0, 'no repeat star rewards');
  ok(g.goals(id).every((x) => x.done && x.text));
  // chests: fake every m1 level's goals except one, then the win that completes the map grants all three
  const m1 = REAL.maps[0];
  for (const lv of m1.levels) g.save.story.levels[lv.id] = { stars: 3, clears: 1, goals: [true, true, true] };
  g.save.story.levels.m1_l12 = { stars: 1, clears: 1, goals: [true, false, false] };
  ok(g.chests('m1').some((c) => c.ready), 'a chest is ready before claim');
  cfg = g.startLevel('m1_l12');
  out = g.completeBattle({ ...simulateBattle(cfg), win: true, lost: [], time: 1, integrity: 1 });
  eq(g.chests('m1').filter((c) => c.claimed).length, 3, 'all three chests claimed');
  ok(out.chests.length >= 1 && out.cards.length >= 1, 'chest card granted');
  cfg = g.startLevel('m1_l12');
  out = g.completeBattle({ ...simulateBattle(cfg), win: true, lost: [], time: 1, integrity: 1 });
  eq(out.chests.length, 0, 'chests once');
});

test('goalFormation honours squad rules', () => {
  const g = godGame();
  for (const d of ['warden', 'patch', 'lancer', 'aegis']) g.save.units.push({ uid: `x${d}`, def: d, level: 30, xp: 0, rank: 3, abilityLevels: { attack: 1, passive: 1, overdrive: 1 } });
  g.save.slots = 5;
  const f = g.autoFormation({ excludeRoles: ['tank'], maxUnits: 2, apply: false }).formation;
  eq(f.length, 2);
  ok(f.every((x) => g.unit(x.uid).role !== 'tank'));
  const f2 = g.autoFormation({ minFaction: { corporate: 3 }, apply: false }).formation;
  ok(f2.filter((x) => g.unit(x.uid).faction === 'corporate').length >= 3);
});

test('save v1 -> v2 migration keeps stars as goals', () => {
  const s = migrate({ v: 1, story: { levels: { m1_l1: { stars: 2, clears: 3 } } } });
  eq(s.v, SAVE_VERSION);
  eq(JSON.stringify(s.story.levels.m1_l1.goals), '[true,true,false]');
  ok(s.story.chests);
});

test('shard exchange: only surplus beyond max rank converts', () => {
  const g = godGame();
  const u = g.save.units[0];
  const E = P.econ(REAL);
  u.rank = P.maxRank(E, REAL.units[u.def].rarity) - 1;
  g.save.shards[u.def] = 500;
  const need = P.rankUpCost(E, u).shards;
  eq(g.surplusShards(u.def), 500 - need);
  const chips = g.wallet.chips;
  const r = g.convertShards(u.def);
  ok(r.ok && r.shards === 500 - need);
  eq(g.save.shards[u.def], need, 'keeps what the last rank-up needs');
  ok(g.wallet.chips > chips);
  eq(g.convertShards(u.def).reason, 'no_surplus');
  g.save.shards.paladin = 50;
  eq(g.convertShards('paladin').reason, 'not_owned', 'unowned shards stay banked');
});

test('Rift banner: locked, gated pool, bannerOnly kept out of "all" pools', () => {
  const g = godGame();
  g.save.wallet.chips = 1e6; g.save.wallet.credits = 1e7;
  eq(g.recruit('rift', 1).reason, 'locked');
  g.save.features.push('recruit_rift', 'recruit_street');
  eq(g.recruit('rift', 1).reason, 'empty_pool', 'nothing until a recruitable level is cleared');
  g.save.story.levels.m6_l5 = { stars: 1, clears: 1, goals: [true, false, false] };
  eq(JSON.stringify(g.bannerPool('rift')), '["dire_wolf"]');
  const r = g.recruit('rift', 5);
  ok(r.ok && r.results.every((x) => x.def === 'dire_wolf'));
  const street = g.recruit('street', 60);
  ok(street.ok && street.results.every((x) => !REAL.units[x.def].bannerOnly), 'no fantasy from street');
  ok(!g.arenaRivals().some((rv) => rv.units.some((u) => REAL.units[u.def]?.bannerOnly)), 'no fantasy rivals');
});

test('forfeit returns the end event with real stats', () => {
  const b = createBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: 4 });
  b.step(80);
  const ev = b.forfeit();
  const end = ev.find((e) => e.type === 'end');
  ok(end && end.reason === 'forfeit' && !end.win);
  ok(end.result.stats.p1 && Object.values(end.result.stats).some((s) => s.dealt > 0), 'stats carried');
  eq(end.result.time, 8);
  eq(b.forfeit().length, 0, 'second forfeit is a no-op');
});

test('focus shards go to the deployed unit closest to completing its next rank', () => {
  const lvl = allLevels(REAL)[0];
  const saved = lvl.rewards;
  lvl.rewards = { ...saved, shards: {}, focusShards: 5 };
  try {
    const E = P.econ(REAL);
    const g = createGame({ data: REAL, storage: false, now: () => 1.7e12 });
    g.newGame({ seed: 9 });
    const [a, b] = g.save.units;
    a.rank = 1; b.rank = 2; g.save.shards[a.def] = 0; g.save.shards[b.def] = 0;   // a needs 34, b needs 54
    g.autoFormation();
    const win = (cfg) => g.completeBattle({ win: true, stars: 3, time: 10, lost: [], integrity: 1, stats: {} });
    let out = win(g.startLevel(lvl.id));
    eq(out.shards[a.def], 5, 'fewest-short unit gets them'); ok(!out.shards[b.def]);
    g.save.shards[a.def] = P.rankUpCost(E, a).shards;           // a already has enough for its next rank
    out = win(g.startLevel(lvl.id));
    eq(out.shards[b.def], 3, 'skips a unit that already holds its next rank-up; replay x0.6 floored');
    a.rank = b.rank = P.maxRank(E, 'common');
    out = win(g.startLevel(lvl.id));
    eq(Object.keys(out.shards).length, 0, 'everyone maxed: no focus shards');
  } finally { lvl.rewards = saved; }
  for (const m of REAL.maps) for (const l of m.levels) {
    ok(!l.rewards.focusShards, `focus shards are first-clear only (${l.id})`);
    if (l.firstClear?.focusShards) ok(+m.id.slice(1) >= 5, `focus only late (${l.id})`);
  }
});

test('dev cheats: invulnerable, oneHit, no timer loss, never from game_state', () => {
  const weak = { units: [S('lancer', 1, 1, 1)] };
  const strong = [{ units: [S('monolith', 30, 0, 1, 3), S('pyre', 30, 1, 1, 3)] }];
  const base = simulateBattle({ data: FX, player: weak, enemyWaves: strong, seed: 3 });
  ok(!base.win && !base.cheats, 'weak squad loses without cheats');
  const b = createBattle({ data: FX, player: weak, enemyWaves: strong, seed: 3, cheats: { invulnerable: true } });
  b.runToEnd(60000);
  ok(b.events.filter((e) => e.type === 'hit' && e.dst.startsWith('p')).every((e) => e.amount === 0 && e.hp === e.maxHp), 'player takes no damage');
  ok(b.result.win && b.result.lost.length === 0, 'invulnerable wins eventually (no timeout; overtime ramps)');
  ok(b.result.time > prepareData(FX)._rules.waveTimeout, 'ran past the wave timer');
  eq(JSON.stringify(b.result.cheats), '{"invulnerable":true,"oneHit":false}');
  eq(b.state.cheats.invulnerable, true);
  const o = createBattle({ data: FX, player: weak, enemyWaves: strong, seed: 3, cheats: { oneHit: true } });
  o.runToEnd();
  const ph = o.events.filter((e) => e.type === 'hit' && e.src?.startsWith('p') && e.dst.startsWith('e'));
  ok(ph.length && ph.every((e) => e.kill), 'every player hit kills');
  // via player.cheats too (the battle scene passes cfg.player through unchanged)
  const via = simulateBattle({ data: FX, player: { ...weak, cheats: { oneHit: true, invulnerable: true } }, enemyWaves: strong, seed: 3 });
  ok(via.win && via.cheats.oneHit && via.cheats.invulnerable);
  const g = createGame({ data: REAL, storage: false }); g.newGame({ name: 't' });
  const cfg = g.startLevel(g.nextLevel().id);
  ok(cfg.ok && !cfg.cheats && !cfg.player.cheats, 'game_state never emits cheats');
});

test('perf', () => {
  const n = QUICK ? 50 : 300;
  const t = Date.now();
  for (let i = 0; i < n; i++) simulateBattle({ data: FX, player: squadA, enemyWaves: wavesA, seed: i });
  const ms = (Date.now() - t) / n;
  console.log(`       ${ms.toFixed(2)} ms/battle`);
  ok(ms < 30, 'battle under 30ms');
});

console.log(`${pass} passed, ${fail} failed (${Date.now() - t0} ms)`);
process.exit(fail ? 1 : 0);

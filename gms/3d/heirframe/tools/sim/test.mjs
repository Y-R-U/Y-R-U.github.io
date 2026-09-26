// Sim test suite. node tools/sim/test.mjs [--quick]
import { createGame, newState, loadGame } from '../../js/sim/game_state.js';
import { createRng, rngFor } from '../../js/sim/rng.js';
import { createSaveStore, memoryStorage, serialize, deserialize, migrate, SAVE_VERSION, SAVE_PREFIX } from '../../js/sim/save.js';
import { rollItem, rollKillLoot, rarityWeights, newLootState, itemFR, salvageYield } from '../../js/sim/loot.js';
import { generateBoard, validateMission, sitesFor, missionLevel } from '../../js/sim/missions.js';
import { buildStoryMission, newStoryState } from '../../js/sim/story.js';
import { enemyDef } from '../../js/sim/enemies.js';
import { xpNext } from '../../js/sim/economy.js';
import { uiConfig, toUiItem, toUiBoard, toUiWarehouse, toUiContract, toUiComplete } from '../../js/sim/ui_adapt.js';
import { RARITIES, RARITY_INDEX, SLOTS, RARITY_BANDS, POWERS } from '../../js/data/loot.js';
import { STORY_MISSIONS } from '../../js/data/story.js';
import { DISTRICTS, DISTRICT_ORDER } from '../../js/data/districts.js';
import { THREATS } from '../../js/data/missions.js';
import { runBalance, P2A_ARCH, P2A_TWISTS } from './balance.mjs';
import { FRAMES, SKILLS, SYNC_MODS } from '../../js/data/frames.js';

const QUICK = process.argv.includes('--quick');
let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); pass++; console.log(`  ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { fail++; failures.push(name); console.log(`  FAIL ${name}\n       ${e.stack?.split('\n').slice(0, 3).join('\n       ') || e}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)?.slice(0, 200)} != ${JSON.stringify(b)?.slice(0, 200)}`);
const newGame = (seed = 7) => { const g = createGame({ seed, store: createSaveStore(memoryStorage()) }); g.noAutosave = true; return g; };

// Completes the current contract through the real state machine: fires the twist at its step, picks the first non-fail choice.
function playThrough(g) {
  const c = g.state.contract;
  let guard = 0;
  while (g.state.contract && guard++ < 100) {
    const tw = c.mission.twist;
    if (tw && !c.twistFired && c.stepIndex >= (tw.atStep ?? 0)) g.fireTwist();
    const s = g.currentStep();
    let r;
    if (s?.type === 'choose') {
      const i = Math.max(0, s.options.findIndex(o => !o.fail));
      r = g.completeStep({ choice: i, outcome: s.options[i].outcome });
    } else r = g.completeStep({});
    if (r.failed) return { failed: true };
    if (r.done) return g.finishContract({ time: c.mission.parTime });
  }
  throw new Error('contract never finished');
}

console.log('determinism');
test('rng: same seed same stream, split does not advance parent', () => {
  const a = createRng('x'), b = createRng('x');
  for (let i = 0; i < 100; i++) assert(a.next() === b.next(), 'stream diverged');
  const before = a.state.slice();
  a.split('child').next();
  eq(a.state, before, 'split advanced parent');
  const s = a.state; const v = a.next(); a.state = s; assert(a.next() === v, 'state restore');
});
test('board, loot and a 2 h bot run are identical for the same seed', () => {
  const g1 = newGame(99), g2 = newGame(99);
  eq(g1.board(), g2.board(), 'board');
  const r1 = runBalance({ hours: 2, seed: 5, quiet: true }), r2 = runBalance({ hours: 2, seed: 5, quiet: true });
  eq(r1.final, r2.final, 'bot final state');
  eq(r1.hourly, r2.hourly, 'bot hourly');
  const r3 = runBalance({ hours: 2, seed: 6, quiet: true });
  assert(JSON.stringify(r3.hourly) !== JSON.stringify(r1.hourly), 'different seeds gave identical runs');
});
test('kill loot is a pure function of its rng', () => {
  const ctx = () => ({ rank: 'elite', level: 30, riderLevel: 30, q: 0.2, lootState: newLootState(), powers: [] });
  eq(rollKillLoot(rngFor('k', 1), ctx()), rollKillLoot(rngFor('k', 1), ctx()), 'kill loot');
});

console.log('save');
test('round-trip: serialize → deserialize → identical state and working game', () => {
  const g = newGame(3);
  g.acceptContract(g.board().story.id); playThrough(g);
  const text = serialize(g.state);
  const back = deserialize(text);
  eq(back, JSON.parse(JSON.stringify(g.state)), 'state');
  const store = createSaveStore(memoryStorage());
  store.save(g.state);
  const g2 = loadGame({ store });
  assert(g2, 'loadGame');
  eq(g2.hud(), g.hud(), 'hud after load');
  eq(g2.board(), g.board(), 'board after load');
});
test('corrupt save falls back to .bak, bad checksum throws', () => {
  const mem = memoryStorage(); const store = createSaveStore(mem);
  const g = newGame(4);
  store.save(g.state); g.addCredits(500); store.save(g.state);
  const w = JSON.parse(mem.getItem(SAVE_PREFIX + 'main'));
  assert(w.body.includes('"credits":500'), 'fixture');
  w.body = w.body.replace('"credits":500', '"credits":9999');
  mem.setItem(SAVE_PREFIX + 'main', JSON.stringify(w));
  const r = store.load();
  assert(r.ok && r.fromBackup && r.state.credits === 0, 'backup not used');
  let threw = false; try { deserialize('{"v":2,"sum":1,"body":"{}"}'); } catch { threw = true; }
  assert(threw, 'checksum mismatch accepted');
});
test(`migration v1 → v${SAVE_VERSION}`, () => {
  const s = JSON.parse(JSON.stringify(newState(1)));
  delete s.homesOwned; s.v = 1; s.player.level = 60; delete s.overclock;
  const m = migrate(s);
  assert(m.v === SAVE_VERSION, 'version');
  eq(m.homesOwned, ['pod'], 'homesOwned');
  assert(m.overclock.unlocked === 1, 'overclock unlocked for a level-60 save');
  const g = createGame({ state: m, store: createSaveStore(memoryStorage()) });
  assert(g.buyHome('apartment').reason === 'locked', 'homes work after migration');
  let threw = false; try { migrate({ v: SAVE_VERSION + 1 }); } catch { threw = true; }
  assert(threw, 'newer save accepted');
});

console.log('loot');
test('rarity frequencies follow the ECONOMY §6 bands (20k rolls per band)', () => {
  const rng = createRng('rar');
  for (const lvl of [1, 5, 10, 20, 30, 45, 55]) {
    const w = rarityWeights(lvl, 0); const tot = w.reduce((a, b) => a + b, 0);
    const n = QUICK ? 4000 : 20000, cnt = RARITIES.map(() => 0);
    for (let i = 0; i < n; i++) cnt[RARITY_INDEX[rollItem(rng, { ilvl: lvl }).rarity]]++;
    RARITIES.forEach((r, i) => {
      const exp = w[i] / tot, got = cnt[i] / n;
      assert(Math.abs(got - exp) < 0.02 + exp * 0.15, `L${lvl} ${r.id}: expected ${exp.toFixed(3)} got ${got.toFixed(3)}`);
      if (['relic', 'heirloom'].includes(r.id) && lvl < r.minLevel) assert(cnt[i] === 0, `L${lvl} rolled ${r.id} below its min level`);
    });
  }
});
test('items are well-formed: slots, affix counts, primaries scale, relic powers, no duplicate affixes', () => {
  const rng = createRng('items');
  for (let i = 0; i < (QUICK ? 3000 : 12000); i++) {
    const lvl = 1 + (i % 60);
    const it = rollItem(rng, { ilvl: lvl, q: (i % 7) * 0.1, lootState: newLootState() });
    const r = RARITIES[RARITY_INDEX[it.rarity]];
    assert(r, 'rarity ' + it.rarity);
    assert(SLOTS.includes(it.slot), 'slot ' + it.slot);
    if (it.rarity !== 'heirloom') assert(it.affixes.length === r.affixes, `${it.rarity} has ${it.affixes.length} affixes`);
    assert(new Set(it.affixes.map(a => a.id)).size === it.affixes.length, 'duplicate affix');
    assert(it.affixes.every(a => Number.isFinite(a.value)), 'affix NaN');
    assert(Object.values(it.primary).every(Number.isFinite), 'primary NaN');
    assert(it.name && it.uid && it.reqLevel <= lvl, 'name/uid/reqLevel');
    if (it.rarity === 'relic') assert(it.powers.length === 1 && POWERS.some(p => p.id === it.powers[0]), 'relic power');
    assert(itemFR(it) > 0, 'FR');
    const mats = salvageYield(it, rng);
    assert(Object.values(mats).every(v => v >= 0), 'salvage');
  }
  const low = rollItem(createRng('a'), { ilvl: 10, slot: 'chassis', rarity: 'custom' });
  const high = rollItem(createRng('a'), { ilvl: 40, slot: 'chassis', rarity: 'custom' });
  assert(high.primary.hp > low.primary.hp * 5, 'primary does not scale with ilvl');
});
test('relics do not repeat within the last 5; kill loot respects rank counts and ilvl cap', () => {
  const ls = newLootState(); const rng = createRng('rel'); const seen = [];
  for (let i = 0; i < 60; i++) { const it = rollItem(rng, { ilvl: 30, rarity: 'relic', lootState: ls }); assert(!seen.slice(-5).includes(it.powers[0]), 'relic repeated'); seen.push(it.powers[0]); }
  let bossItems = 0, bossRuns = 400;
  for (let i = 0; i < bossRuns; i++) {
    const d = rollKillLoot(rngFor('boss', i), { rank: 'boss', level: 50, riderLevel: 40, q: 0, lootState: newLootState(), powers: [] });
    bossItems += d.items.length;
    assert(d.items.every(it => it.ilvl <= 42), 'ilvl above rider+2');
    assert(d.items.some(it => RARITY_INDEX[it.rarity] >= RARITY_INDEX.prototype), 'boss without a Prototype+');
  }
  assert(bossItems / bossRuns >= 4, 'boss drops < 4 items');
});

console.log('missions');
test(`${QUICK ? '2k' : '10k'} generated contracts are valid and completable`, () => {
  const g = newGame(11);
  const S = g.state;
  const want = QUICK ? 2000 : 10000;
  const threats = Object.keys(THREATS);
  let n = 0, seed = 0, fails = 0;
  const archs = {}, errs = {};
  while (n < want) {
    seed++;
    const lvl = 1 + (seed * 7) % 60;
    const unlocked = DISTRICT_ORDER.filter(id => DISTRICTS[id].unlock.level <= lvl);
    const ctx = {
      seed: 'gen' + seed, shiftIndex: seed % 13, riderLevel: lvl, threat: seed % 11 === 0 && lvl >= 60 ? 'overclock:' + (1 + seed % 30) : threats[seed % threats.length],
      heatStars: seed % 6, frameArchetype: ['rental', 'brawler', 'gunner', 'ghost'][seed % 4], districts: unlocked.map(id => ({ id })),
      currentDistrict: unlocked[seed % unlocked.length], danger: {}, contractsDone: seed % 40, flags: [], sites: {}, repMul: () => 1, creditsPct: 0,
    };
    const b = generateBoard(ctx);
    assert(b.cards.length >= 5, `seed ${seed}: board has ${b.cards.length} cards`);
    for (const m of b.cards) {
      n++;
      archs[m.archetype] = (archs[m.archetype] || 0) + 1;
      const v = validateMission(m);
      if (!v.ok) { for (const e of v.errors) errs[`${m.archetype}: ${e}`] = (errs[`${m.archetype}: ${e}`] || 0) + 1; continue; }
      for (const e of [...m.enemies, ...(m.twist?.enemies || [])]) for (const u of e.units) { enemyDef(u.defId); assert(Number.isFinite(u.level) && u.level >= 1, 'unit level'); }
      if (m.target?.defId) enemyDef(m.target.defId);
      assert(m.payout.credits > 0 && m.payout.xp > 0, 'payout');
      // run it through the real state machine
      if (n % (QUICK ? 4 : 2) === 0) {
        S.contract = null;
        S.board = { shift: S.shiftIndex, reroll: 0, cards: [m], story: null };
        S.player.level = lvl;
        const acc = g.acceptContract(m.id);
        assert(acc.ok, 'accept ' + acc.reason);
        const r = playThrough(g);
        if (r.failed) fails++;
        else assert(r.ok && r.credits >= 0 && r.xp >= 0, 'finish');
      }
    }
  }
  const errList = Object.entries(errs);
  assert(!errList.length, 'invalid missions:\n       ' + errList.slice(0, 12).map(([k, v]) => `${v}× ${k}`).join('\n       '));
  assert(fails === 0, `${fails} contracts failed on the happy path`);
  assert(Object.keys(archs).length >= 12, 'only ' + Object.keys(archs).length + ' archetypes seen');
});
test('mission level follows rider level, threat and district caps', () => {
  const ctx = { riderLevel: 30, threat: 'tense', danger: {} };
  const r = createRng('ml');
  assert(missionLevel(ctx, 'street', 'aurum_plaza', r) <= DISTRICTS.aurum_plaza.maxLvl + 5, 'aurum cap');
  const l = missionLevel({ ...ctx, threat: 'lethal' }, 'elite', 'spine', r);
  assert(l >= 30 + 4, 'lethal elite offset');
});

console.log('story');
test(`all ${STORY_MISSIONS.length} story missions build, validate and play in order`, () => {
  assert(STORY_MISSIONS.length === 30, 'expected 30 story missions');
  const g = newGame(21);
  const S = g.state;
  for (const def of STORY_MISSIONS) {
    const m = buildStoryMission(def.id, { seed: 'story-test', riderLevel: def.gate, threat: 'tense', districts: [{ id: def.district }], currentDistrict: def.district, danger: {}, flags: [], sites: {}, repMul: () => 1 });
    assert(m, `${def.id} did not build`);
    const v = validateMission(m);
    assert(v.ok, `${def.id}: ${v.errors.join('; ')}`);
    if (def.boss) assert(m.boss?.defId === def.boss && m.steps.some(s => s.target === 'boss'), `${def.id}: boss step`);
    // play it for real: set the level to the gate and take the board's story card
    S.player.level = Math.max(S.player.level, def.gate);
    S.contract = null;
    g.refreshBoard();
    const card = g.board().story;
    assert(card?.story?.id === def.id, `board story card is ${card?.story?.id}, expected ${def.id}`);
    assert(g.acceptContract(card.id).ok, 'accept ' + def.id);
    const r = playThrough(g);
    assert(r.ok && r.story?.id === def.id, `${def.id} did not complete`);
  }
  assert(S.story.mission === 'endgame', 'story did not reach endgame: ' + S.story.mission);
  assert(S.districts.unlocked.includes('landfall'), 'landfall not unlocked');
  assert(S.stash.some(i => i.heirCore), 'no Heir Core');
});

console.log('game state');
test('first contract gives level 2; frames, Mk gates, homes, broker, overclock', () => {
  const g = newGame(5); const S = g.state;
  g.acceptContract(g.board().story.id); playThrough(g);
  assert(S.player.level === 2, 'level after A1-M1 is ' + S.player.level);
  assert(g.buyFrame('brawler').reason === 'level', 'frame before level 5');
  S.player.level = 5; g.addCredits(5000);
  const r = g.buyFrame('brawler');
  assert(r.ok && r.price === 1500 && g.activeFrame().frameId === 'brawler', 'buy brawler');
  assert(g.returnRental().ok && !S.frames.some(f => f.rental), 'return rental');
  assert(g.upgradeMk(g.activeFrame().uid).reason === 'gate', 'Mk II gate');
  assert(g.buyMaterial('flux', 1).reason === 'locked', 'broker before 15');
  S.player.level = 15; g.addCredits(1e6);
  const p1 = g.brokerPrice('flux'); assert(g.buyMaterial('flux', 3).ok && S.materials.flux === 3, 'broker buy');
  assert(g.brokerPrice('flux') > p1, 'broker price rises within a shift');
  assert(g.nextGoal(), 'next goal chip empty');
  S.player.level = 59; S.player.xp = 0; g.giveXp(xpNext(59) + 10, 'test');
  assert(S.player.level === 60 && S.overclock.unlocked === 1, 'overclock unlock at 60');
  assert(g.setThreat('overclock:1').ok, 'set overclock 1');
  assert(!g.setThreat('overclock:2').ok, 'overclock 2 should be locked');
  const el = g.board().cards.find(c => c.grade === 'elite');
  assert(el, 'no elite card in overclock');
  g.acceptContract(el.id); playThrough(g);
  assert(S.overclock.unlocked === 2, 'elite clear did not unlock overclock 2');
});
test('combat: player hits, enemies hit back, civilians are immune, kills pay', () => {
  const g = newGame(8);
  const p = g.playerCombatant();
  const e = g.spawnEnemy({ defId: 'knuckle', level: 1 });
  let n = 0; while (e.alive && n < 40) g.hit(p, e, p.skills.attack, { comboIndex: n++ });
  assert(!e.alive && n > 1 && n < 20, `knuckle died in ${n} hits`);
  const out = g.kill(e);
  assert(out.xp > 0, 'kill xp');
  assert(g.kill(e) === null, 'double reward');
  const civ = { ...g.spawnEnemy({ defId: 'knuckle', level: 1 }), faction: 'civilians' };
  assert(g.hit(p, civ, p.skills.attack).immune, 'civilian harmed (D15)');
  const hp = p.hp; g.hit(e.alive ? e : g.spawnEnemy({ defId: 'knuckle', level: 1 }), p, { base: 1, kind: 'melee' });
  assert(p.hp < hp, 'enemy did no damage');
});
test('ui_adapt shapes', () => {
  const g = newGame(9);
  const cfg = uiConfig();
  assert(cfg.rarities.length === 7, 'ui config rarities');
  const b = toUiBoard(g); assert(b.cards?.length || b.contracts?.length || Array.isArray(b), 'board shape');
  const w = toUiWarehouse(g); assert(w, 'warehouse shape');
  const it = toUiItem(rollItem(createRng('u'), { ilvl: 5 })); assert(it.name && it.rarity, 'item shape');
  assert(toUiContract(g.board().cards[0]).title, 'contract shape');
  g.acceptContract(g.board().story.id); const out = playThrough(g);
  assert(toUiComplete(out, g), 'complete shape');
});

console.log('P2a');
test('frame kits: every frame skill has a kind the runtime casts; sync-5 mods patch a real skill', () => {
  const KINDS = ['melee', 'ranged', 'self', 'distract', 'aoe', 'dash', 'cone', 'line', 'summon', 'blink', 'hack'];
  for (const f of Object.values(FRAMES)) for (const [slot, id] of Object.entries(f.skills)) {
    if (slot === 'heir') continue;
    assert(SKILLS[id], `${f.id} ${slot} ${id} missing`);
    assert(KINDS.includes(SKILLS[id].kind), `${id} kind ${SKILLS[id].kind}`);
  }
  for (const [fid, ranks] of Object.entries(SYNC_MODS)) for (const r of ranks) for (const o of r.options) assert(Object.values(FRAMES[fid].skills).includes(o.skill), `${fid} mod ${o.id} → ${o.skill}`);
});
test('buy, swap, Mk gate and sync mod: prices 1,500 / 12,000 / 50,000, A1-M4 discount 30%', () => {
  const g = newGame(11);
  while (g.state.player.level < 5) g.giveXp(200);
  assert(g.grantFrameDiscount().ok && g.framePrice() === 1050, 'discount price ' + g.framePrice());
  g.addCredits(200000);
  const prices = ['brawler', 'gunner', 'ghost'].map(k => { const r = g.buyFrame(k); assert(r.ok, 'buy ' + k + ' ' + r.reason); return r.price; });
  eq(prices, [1050, 12000, 50000], 'licence prices');
  const b = g.state.frames.find(f => f.frameId === 'brawler');
  assert(g.swapFrame(b.uid).ok && g.activeFrame().archetype === 'brawler', 'swap to brawler');
  assert(!g.swapFrame(g.state.frames.find(f => f.frameId === 'gunner').uid, { inCombat: true }).ok, 'no swap in combat');
  assert(g.upgradeMk(b.uid).reason === 'gate', 'Mk II gated by level 10 + sync 4');
  b.sync = 5;
  assert(g.chooseSyncMod(b.uid, 5, 'aftershock').ok && g.frameSkills(b).s1.echo, 'sync 5 mod patches Ground Slam');
});
test('P2a board scope: only runnable archetypes/twists; Act 1 story cap', () => {
  const g = newGame(12);
  g.setScope({ archetypes: P2A_ARCH, twists: P2A_TWISTS });
  g.storyActCap = 1;
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    while (g.state.player.level < 2 + (i % 12)) g.giveXp(300);
    g.state.shiftIndex++;
    for (const c of g.refreshBoard().cards) { seen.add(c.archetype); assert(P2A_ARCH.includes(c.archetype), 'archetype ' + c.archetype); if (c.twist) assert(P2A_TWISTS.includes(c.twist.id), 'twist ' + c.twist.id); }
  }
  for (const a of ['bounty', 'escort', 'sabotage', 'hack']) assert(seen.has(a), 'never rolled ' + a);
  g.state.story.done = ['a1_m1', 'a1_m2', 'a1_m3', 'a1_m4', 'a1_m5']; g.state.story.mission = 'a2_m1';
  assert(!g.storyCard(), 'Act 2 card hidden under the cap');
});
test('forced contracts: bounty/escort/sabotage/hack with T2/T3/T9 and every P2a modifier validate and complete', () => {
  const g = newGame(13);
  while (g.state.player.level < 12) g.giveXp(500);
  const combos = [['bounty', 'T2', ['fragile']], ['bounty', 'T9', ['watched']], ['escort', 'T9', ['vip']], ['sabotage', 'T3', ['collateral', 'reinforced']], ['hack', null, ['watched']], ['retrieve', 'T3', ['fragile']], ['courier', 'T9', ['reinforced']]];
  for (const [a, tw, mods] of combos) {
    const m = g.makeContract({ archetype: a, grade: a === 'sabotage' ? 'pro' : 'street', twist: tw, modifiers: mods, seed: a.length });
    assert(m, `no ${a} ${tw}`);
    const v = g.validateMission(m); assert(v.ok, `${a} ${tw}: ${v.errors.join('; ')}`);
    assert(g.acceptContract(m.id).ok, 'accept ' + a);
    // payout twists (T9) fire at finish, like js/game/runner.js finish()
    if (tw === 'T9') { while (!g.completeStep({}).done); g.fireTwist(); }
    const out = tw === 'T9' ? g.finishContract({ time: m.parTime }) : playThrough(g);
    assert(out?.ok !== false && !g.state.contract, `${a} ${tw} did not complete`);
    if (tw === 'T9') assert(out.stiffed && g.board().cards[0].id.endsWith('_collect'), 'T9 adds a Collect card');
  }
});
test('Heat: forceHeat holds the star, decays one star per 3 min, reaches 5', () => {
  const g = newGame(14);
  const stars = () => g.hud().heatStars ?? Math.ceil(g.state.factions.heat - 1e-6);
  g.forceHeat(3);
  g.tick(1);
  assert(stars() === 3, 'still 3 stars after 1 s: ' + g.state.factions.heat);
  g.tick(181);
  assert(stars() === 2, '2 stars after 3 min');
  g.forceHeat(5); g.tick(1); assert(stars() === 5, '5 stars');
  g.tick(5 * 181); assert(stars() === 0, 'cold after 15 min');
});
test('P2 pacing (bot, Tense): Act 1 in 60-100 min, first frame 45-75 min (median of 6 seeds)', () => {
  const act = [], frame = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) { const r = runBalance({ hours: 2.2, seed, quiet: true, act1: true }); act.push(r.milestones.story_a1_m5 / 60); frame.push(r.milestones.frame1 / 60); }
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`       Act 1 min: ${act.map(Math.round).join(' ')} · first frame min: ${frame.map(Math.round).join(' ')}`);
  assert(med(act) >= 60 && med(act) <= 100, 'Act 1 median ' + med(act));
  assert(med(frame) >= 45 && med(frame) <= 75, 'first frame median ' + med(frame));
  assert(act.every(x => x >= 55 && x <= 110), 'Act 1 outlier');
});

console.log(`\n${pass} passed, ${fail} failed${fail ? ': ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);

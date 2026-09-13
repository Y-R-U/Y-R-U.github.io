import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../engine.mjs";
import { WEAPONS, RELICS, getDraft } from "../content.mjs";
import { newSave, buyRelic, recordRun } from "../progression.mjs";

function advance(engine, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++)
    engine.update(1 / 30, input);
}
function inert(engine) {
  engine.spawnTimer = 1e9;
  engine.nextBossAt = 1e9;
  engine.state.weapons = {};
}

test("same seed and inputs produce identical serializable state", () => {
  const a = new GameEngine({ seed: 714 }),
    b = new GameEngine({ seed: 714 });
  advance(a, 15, { x: 0.3, y: -0.2 });
  advance(b, 15, { x: 0.3, y: -0.2 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(a.state)),
    JSON.parse(JSON.stringify(b.state)),
  );
});

test("portrait drag vectors normalize, arena clamps, pause and draft stop time", () => {
  const e = new GameEngine();
  inert(e);
  advance(e, 1, { x: 30, y: 40 });
  assert.ok(
    Math.abs(Math.hypot(e.state.player.x, e.state.player.y - 2) - 5.6) < 0.01,
  );
  advance(e, 15, { x: 1 });
  assert.equal(e.state.player.x, 23);
  const time = e.state.time;
  e.setPaused(true);
  advance(e, 2);
  assert.equal(e.state.time, time);
  e.setPaused(false);
  e.state.phase = "upgrade";
  advance(e, 2);
  assert.equal(e.state.time, time);
});

test("starter auto aim kills possessed and produces collectible XP", () => {
  const e = new GameEngine();
  e.spawnTimer = 1e9;
  e.spawnEnemy("walker", { x: 0, y: -2 });
  advance(e, 2);
  assert.equal(e.state.kills, 1);
  assert.equal(e.state.gems.length, 1);
  e.state.player.x = e.state.gems[0].x;
  e.state.player.y = e.state.gems[0].y;
  advance(e, 0.1);
  assert.equal(e.state.xp, 1);
});

test("proximity objectives charge, reward and do not repeat", () => {
  const events = [],
    e = new GameEngine({ onEvent: (event) => events.push(event) });
  inert(e);
  Object.assign(e.state.player, {
    x: e.state.objectives[0].x,
    y: e.state.objectives[0].y,
  });
  advance(e, 4);
  assert.equal(e.state.objectiveDone, 1);
  assert.equal(e.state.objectives[0].done, true);
  const emberCount = e.state.embers;
  e.chooseUpgrade(0);
  advance(e, 4);
  assert.equal(e.state.objectiveDone, 1);
  assert.equal(e.state.embers, emberCount);
  assert.equal(events.filter((event) => event.type === "objective").length, 1);
});

test("pulse is gated and clears threats, attracts souls, and grants breathing room", () => {
  const e = new GameEngine();
  inert(e);
  e.spawnEnemy("walker", { x: 1, y: 2 });
  e.projectile(1, 2, 0, { hostile: true });
  assert.equal(e.pulse(), true);
  assert.equal(e.state.kills, 1);
  assert.equal(e.state.projectiles.length, 0);
  assert.equal(e.state.gems[0].attracted, true);
  assert.ok(e.state.player.invincible > 1);
  assert.equal(e.pulse(), false);
  advance(e, 50);
  if (e.state.phase === "upgrade") e.chooseUpgrade(0);
  assert.equal(e.state.pulseCharge, 1);
});

test("level drafts freeze action and chosen ranks modify actual stats", () => {
  const e = new GameEngine();
  inert(e);
  e.state.xp = e.state.xpNext;
  advance(e, 0.1);
  assert.equal(e.state.phase, "upgrade");
  assert.equal(e.state.level, 2);
  assert.equal(e.chooseUpgrade(-1), false);
  e.state.draft = [{ kind: "passive", id: "vitality", name: "Heart" }];
  e.state.player.hp = 50;
  assert.equal(e.chooseUpgrade(0), true);
  assert.equal(e.state.player.maxHp, 135);
  assert.equal(e.state.player.hp, 75);
  assert.equal(e.state.phase, "playing");
});

test("each weapon deals damage and every valid evolution applies", () => {
  for (const weapon of WEAPONS) {
    const e = new GameEngine({ chapter: 5 });
    inert(e);
    e.state.weapons = { [weapon.id]: 5 };
    e.state.passives[weapon.evolution.requires] = 3;
    e.state.phase = "upgrade";
    e.state.draft = [
      { kind: "evolution", id: weapon.id, name: weapon.evolution.name },
    ];
    assert.equal(e.chooseUpgrade(0), true, weapon.id);
    assert.equal(e.state.evolved[weapon.id], true);
    const enemy = e.spawnEnemy("brute", { x: 2.2, y: 2 });
    const hp = enemy.hp;
    advance(e, 0.8);
    assert.ok(enemy.hp < hp, `${weapon.id} must inflict damage`);
  }
});

test("boss telegraphs danger and victory requires both boss and objectives", () => {
  const e = new GameEngine();
  inert(e);
  e.spawnBoss();
  e.state.boss.attackTimer = 0;
  advance(e, 0.1);
  assert.ok(e.state.zones.some((zone) => zone.type === "warning"));
  e.hitEnemy(e.state.boss, 1e6);
  advance(e, 0.1);
  assert.equal(e.state.phase, "playing");
  e.state.objectiveDone = e.state.objectiveTotal;
  advance(e, 0.1);
  assert.equal(e.state.phase, "won");
  assert.equal(e.state.result.victory, true);
  const result = { ...e.state.result };
  advance(e, 2);
  assert.deepEqual(e.state.result, result);
});

test("contact damage respects invincibility and death yields one final result", () => {
  const events = [],
    e = new GameEngine({ onEvent: (event) => events.push(event) });
  inert(e);
  e.state.player.invincible = 0;
  e.state.player.hp = 5;
  e.spawnEnemy("walker", { x: 0, y: 2 });
  advance(e, 0.1);
  assert.equal(e.state.phase, "lost");
  assert.equal(e.state.result.victory, false);
  advance(e, 10);
  assert.equal(events.filter((event) => event.type === "lose").length, 1);
});

test("endless continues after a boss and schedules the next breach", () => {
  const e = new GameEngine({ endless: true });
  inert(e);
  e.state.objectiveDone = e.state.objectiveTotal;
  e.spawnBoss();
  e.hitEnemy(e.state.boss, 1e6);
  advance(e, 0.1);
  assert.equal(e.state.phase, "playing");
  assert.equal(e.state.result, null);
  assert.ok(e.nextBossAt > e.state.time);
  e.state.time = e.nextBossAt;
  advance(e, 0.1);
  assert.ok(e.state.boss);
});

test("persistent relic and survivor descriptions match applied values", () => {
  const e = new GameEngine({
    survivor: "elias",
    relics: { vitality: 2, might: 2, haste: 2 },
  });
  assert.equal(e.state.player.maxHp, 155);
  assert.equal(e.state.weapons.orbit, 1);
  assert.equal(e.damageMultiplier, 1.12);
  assert.equal(e.hasteMultiplier, 1.08);
});

// This pilot uses only public input, pulse, and draft APIs. It pursues objectives
// and nearby souls, steers away from visible threats, and builds weapon synergies.
function playNaturally(engine, maxSeconds = 330) {
  const evolutions = [];
  for (
    let frame = 0;
    frame < 30 * maxSeconds && !engine.state.result;
    frame++
  ) {
    const s = engine.state,
      p = s.player;
    if (s.phase === "upgrade") {
      const score = (choice) => {
        if (choice.kind === "evolution") return 120;
        if (choice.id === "vitality" && p.hp / p.maxHp < 0.6) return 100;
        if (choice.kind === "heal" && p.hp / p.maxHp < 0.5) return 90;
        if (choice.id === "pistol") return 70;
        if (choice.id === "might") return 66;
        if (choice.id === "orbit") return 63;
        if (choice.id === "reach" && s.weapons.orbit) return 59;
        if (choice.id === "haste") return 48;
        if (choice.id === "magnet") return 40;
        if (choice.kind === "weapon")
          return 35 + (s.weapons[choice.id] || 0) * 3;
        if (choice.id === "vitality") return 31;
        return 20;
      };
      const chosen = s.draft
        .map((choice, index) => ({ index, score: score(choice) }))
        .sort((a, b) => b.score - a.score)[0].index;
      if (s.draft[chosen].kind === "evolution")
        evolutions.push({ time: s.time, weapon: s.draft[chosen].id });
      engine.chooseUpgrade(chosen);
      continue;
    }
    const distance = (at) => Math.hypot(at.x - p.x, at.y - p.y);
    const target = s.objectives
      .filter((o) => !o.done)
      .sort((a, b) => distance(a) - distance(b))[0] ||
      [...s.gems].sort((a, b) => distance(a) - distance(b))[0] ||
      s.boss || { x: 0, y: 0 };
    const dx = target.x - p.x,
      dy = target.y - p.y,
      length = Math.hypot(dx, dy);
    let x = dx / (length || 1),
      y = dy / (length || 1);
    if (target.progress !== undefined && length < 1.1) {
      x = 0;
      y = 0;
    }
    for (const enemy of s.enemies) {
      const d = distance(enemy);
      if (d < 3.5) {
        const force = ((3.5 - d) / 3.5) * 2;
        x += ((p.x - enemy.x) / (d || 1)) * force;
        y += ((p.y - enemy.y) / (d || 1)) * force;
      }
    }
    for (const zone of s.zones)
      if (zone.hostile && distance(zone) < zone.radius + 1) {
        const d = distance(zone);
        x += ((p.x - zone.x) / (d || 1)) * 3;
        y += ((p.y - zone.y) / (d || 1)) * 3;
      }
    if (
      s.pulseCharge > 0.99 &&
      (s.enemies.filter((e) => distance(e) < 6).length > 5 ||
        (s.boss && distance(s.boss) < 7))
    )
      engine.pulse();
    engine.update(1 / 30, { x, y });
  }
  return evolutions;
}

function spendEarnedEmbers(save) {
  while (true) {
    const affordable = RELICS.filter(
      (relic) => (save.relics[relic.id] || 0) < relic.max,
    )
      .map((relic) => ({
        id: relic.id,
        cost: relic.cost * ((save.relics[relic.id] || 0) + 1),
        rank: save.relics[relic.id] || 0,
      }))
      .filter((relic) => relic.cost <= save.embers)
      .sort((a, b) => a.rank - b.rank || a.cost - b.cost);
    if (!affordable.length) return;
    assert.equal(buyRelic(save, affordable[0].id), true);
  }
}

test("all six story chapters and escalating endless bosses are naturally achievable with earned relics", () => {
  const save = newSave();
  for (let chapter = 0; chapter < 6; chapter++) {
    const engine = new GameEngine({
      chapter,
      unlockedChapter: save.unlockedChapter,
      relics: save.relics,
      seed: 53 + chapter,
    });
    const evolutions = playNaturally(engine);
    assert.equal(
      engine.state.phase,
      "won",
      `chapter ${chapter + 1} must be beatable`,
    );
    assert.ok(
      evolutions.length >= 1,
      `chapter ${chapter + 1} supports natural evolution`,
    );
    assert.ok(engine.state.time <= 260);
    recordRun(save, engine.state.result);
    spendEarnedEmbers(save);
  }
  assert.deepEqual(save.completed, [0, 1, 2, 3, 4, 5]);
  assert.equal(save.stats.runs, 6);
  const bossHealth = [];
  let endless;
  endless = new GameEngine({
    chapter: 5,
    endless: true,
    relics: save.relics,
    seed: 53,
    onEvent: (event) => {
      if (event.type === "boss") bossHealth.push(endless.state.boss.maxHp);
    },
  });
  playNaturally(endless, 430);
  assert.ok(
    bossHealth.length >= 3,
    "endless naturally reaches repeated boss waves",
  );
  assert.ok(
    bossHealth[1] > bossHealth[0] && bossHealth[2] > bossHealth[1],
    "each endless boss is stronger",
  );
  assert.notEqual(
    endless.state.phase,
    "won",
    "endless cannot trigger the campaign ending",
  );
});

test("replaying an early chapter preserves the earned arsenal", () => {
  const engine = new GameEngine({ chapter: 0, unlockedChapter: 5 });
  assert.equal(engine.state.chapter, 0);
  assert.equal(engine.state.arsenalChapter, 5);
  const found = new Set();
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const choice of getDraft(engine.state, engine.random))
      if (choice.kind === "weapon") found.add(choice.id);
  }
  assert.ok(found.has("scythe"));
  assert.ok(found.has("drone"));
  assert.equal(new GameEngine({ chapter: 2 }).state.arsenalChapter, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../js/state.js";
import { SPECIES, MODES, RELICS, compatibility } from "../js/data.js";

const action = (g, type, payload = {}) => {
  const result = g.act(type, payload);
  assert.equal(result.ok, true, `${type}: ${result.reason || ""}`);
  return result;
};
function doMission(g) {
  const m = g.state.mission;
  return action(g, m.action, {
    species: m.species,
    id: m.upgrade || m.mode,
    mission: true,
  });
}
function claim(g) {
  assert.equal(
    g.state.mission.complete,
    true,
    `${g.state.chapter}: ${g.state.mission.title} is incomplete`,
  );
  return action(g, "claim");
}
function beginning() {
  const g = createGame(null, 100000);
  doMission(g);
  doMission(g);
  claim(g);
  doMission(g);
  doMission(g);
  claim(g);
  return g;
}
function advanceToDraft() {
  const g = beginning();
  doMission(g);
  g.tick(30);
  claim(g);
  doMission(g);
  g.tick(40);
  claim(g);
  action(g, "choose", { id: g.state.choices[0] });
  doMission(g);
  g.tick(90);
  claim(g);
  return g;
}
function completeMode(g, id) {
  action(g, "startMode", { id });
  if (id === "rescue") {
    action(g, "clean");
    g.tick(12);
    action(g, "clean");
    action(g, "plant");
    action(g, "feed");
  }
  for (
    let i = 0;
    i < 200 && !g.state.mode.complete && !g.state.mode.failed;
    i++
  ) {
    if (g.state.mode.choices.length)
      action(g, "draft", { species: g.state.mode.choices[0] });
    g.tick(1);
  }
  assert.equal(g.state.mode.failed, false, `${id}: ${g.state.mode.reason}`);
  assert.equal(g.state.mode.complete, true, `${id} should finish`);
  const score = g.state.mode.score;
  action(g, "endMode");
  return score;
}
function toReef() {
  const g = advanceToDraft();
  completeMode(g, "draft");
  claim(g);
  return g;
}
function toFestival() {
  const g = toReef();
  doMission(g);
  doMission(g);
  claim(g);
  g.tick(45);
  claim(g);
  completeMode(g, "rescue");
  claim(g);
  return g;
}

test("the first screen has one affordable fish, no premature tools or game modes", () => {
  const g = createGame(null, 100000);
  assert.deepEqual(g.state.unlockedSpecies, ["betta"]);
  assert.deepEqual(g.state.abilities, []);
  assert.deepEqual(g.state.modes, []);
  assert.equal(g.state.coins, g.quote("buy", { species: "betta" }));
  assert.equal(g.state.mission.action, "buy");
  for (const type of ["feed", "plant", "clean", "newTank", "release"])
    assert.equal(g.act(type).ok, false, type);
  for (const id of Object.keys(MODES))
    assert.equal(g.act("startMode", { id }).ok, false);
  assert.equal(g.act("buy", { species: "lionfish" }).ok, false);
  assert.equal(g.act("upgrade", { id: "autofeeder" }).ok, false);
  assert.equal(g.act("setSpeed", { speed: 3 }).ok, false);
});

test("buying and feeding the first fish opens a funded second tank while the first keeps earning", () => {
  const g = createGame(null, 100000),
    first = g.state.tanks[0];
  doMission(g);
  assert.equal(first.fish.length, 1);
  assert.equal(g.state.mission.action, "feed");
  assert.equal(g.act("claim").ok, false);
  doMission(g);
  assert.equal(g.state.mission.action, "claim");
  claim(g);
  assert.equal(g.state.activeTank, 1);
  assert.equal(g.state.tanks.length, 2);
  assert.ok(g.state.coins >= SPECIES.neon.cost);
  assert.equal(g.state.unlockedSpecies.includes("neon"), true);
  const before = g.state.coins;
  g.tick(20);
  assert.ok(g.state.coins > before);
  assert.equal(first.fish.length, 1);
  assert.ok(first.fish[0].age >= 20);
  assert.ok(first.health >= 95);
  assert.equal(g.act("claim").ok, false, "a claimed mission cannot be farmed");
});

test("guided mission actions select their own tank even if the player visits another one", () => {
  const g = createGame(null, 100000);
  doMission(g);
  doMission(g);
  claim(g);
  action(g, "selectTank", { index: 0 });
  assert.equal(g.state.activeTank, 0);
  doMission(g);
  assert.equal(g.state.activeTank, 1);
  assert.equal(g.state.tanks[1].fish.length, 6);
  doMission(g);
  claim(g);
});

test("care is taught gradually, then a permanent choice and automation unlock adventures", () => {
  const g = advanceToDraft();
  assert.equal(g.state.chapter, 5);
  assert.ok(g.state.abilities.includes("collection"));
  assert.ok(g.state.abilities.includes("autofeeder"));
  assert.ok(g.state.tanks[1].autofeeder);
  assert.deepEqual(g.state.modes, ["draft"]);
  assert.equal(g.state.relics.length, 1);
  assert.equal(g.state.choices.length, 0);
  assert.equal(g.act("choose", { id: g.state.relics[0] }).ok, false);
});

test("a complete 13-chapter gameplay journey unlocks all inhabitants, abilities and modes", () => {
  const g = toFestival();
  assert.equal(g.state.chapter, 9);
  completeMode(g, "festival");
  claim(g);
  assert.equal(g.state.chapter, 10);
  doMission(g);
  action(g, "feed");
  for (let i = 0; i < 110; i++) {
    g.tick(1);
    if (
      g.state.tanks[g.state.activeTank].fish.some((f) => f.hunger > 50) &&
      i % 10 === 0
    )
      g.act("feed");
  }
  assert.ok(g.state.tanks.some((t) => t.young >= 5));
  doMission(g);
  claim(g);
  assert.equal(g.state.chapter, 11);
  completeMode(g, "daily");
  claim(g);
  assert.equal(g.state.chapter, 12);
  g.tick(Math.max(1, 900 - g.state.stats.careTime));
  for (let index = 0; index < g.state.tanks.length; index++) {
    action(g, "selectTank", { index });
    g.act("feed");
    g.act("clean");
  }
  g.tick(20);
  assert.ok(
    g.state.mission.complete,
    JSON.stringify(
      g.state.tanks.map((t) => ({
        health: t.health,
        ammonia: t.ammonia,
        fish: t.fish.map((f) => ({ health: f.health, hunger: f.hunger })),
      })),
    ),
  );
  claim(g);
  assert.equal(g.state.chapter, 13);
  assert.equal(g.state.galleryStar, true);
  assert.equal(g.state.unlockedSpecies.length, 16);
  assert.equal(g.state.modes.length, 5);
  assert.equal(g.state.stats.released, 5);
  assert.ok(g.state.pearls >= 25);
  assert.equal(g.state.stats.losses, 0);
  assert.ok(g.state.tanks.every((t) => t.health >= 80));
});

test("adventure rewards require finishing, temporary tanks never replace the gallery", () => {
  const g = advanceToDraft(),
    gallery = g.state.tanks.map((t) => t.id),
    coins = g.state.coins;
  action(g, "startMode", { id: "draft" });
  assert.equal(g.state.tanks.length, 3);
  const modeWallet = g.state.mode.coins;
  g.tick(10);
  assert.equal(g.state.mode.time, 0, "draft reading time is free");
  assert.ok(g.state.coins > coins);
  action(g, "endMode");
  assert.deepEqual(
    g.state.tanks.map((t) => t.id),
    gallery,
  );
  assert.equal(g.state.stats.modeWins, 0);
  assert.equal(g.state.pearls, 0);
  completeMode(g, "draft");
  assert.equal(g.state.stats.modeWins, 1);
  assert.equal(g.state.pearls, 8);
  assert.deepEqual(
    g.state.tanks.map((t) => t.id),
    gallery,
  );
  assert.ok(modeWallet > 0);
  assert.equal(g.act("endMode").ok, false, "cannot reclaim mode rewards");
});

test("ordinary saves, corrupt saves, and active adventure saves restore safely", () => {
  const g = advanceToDraft();
  action(g, "startMode", { id: "draft" });
  action(g, "draft", { species: g.state.mode.choices[0] });
  g.tick(10);
  const loaded = createGame(g.save(), 100000);
  assert.equal(loaded.state.chapter, 5);
  assert.equal(loaded.state.mode.id, "draft");
  assert.equal(loaded.state.mode.round, 1);
  assert.equal(loaded.state.tanks.length, 3);
  assert.equal(loaded.state.mode.time, 10);
  assert.equal(createGame({ version: 999, tanks: [{}] }, 0).state.chapter, 0);
  const broken = g.save();
  broken.coins = "NaN";
  broken.tanks[0].fish.push({ species: "imaginary" });
  const safe = createGame(broken, 100000);
  assert.ok(Number.isFinite(safe.state.coins));
  assert.ok(safe.state.tanks[0].fish.every((f) => SPECIES[f.species]));
});

test("offline caretaker caps income at eight hours, preserves fish and pauses adventures", () => {
  const g = advanceToDraft();
  action(g, "startMode", { id: "draft" });
  action(g, "draft", { species: g.state.mode.choices[0] });
  g.tick(10);
  const saved = g.save(),
    before = saved.coins,
    modeTime = saved.mode.time;
  const returned = createGame(saved, saved.savedAt + 24 * 60 * 60 * 1000);
  assert.equal(returned.state.offline.seconds, 8 * 60 * 60);
  assert.equal(returned.state.offline.capped, true);
  assert.ok(returned.state.coins > before);
  assert.equal(returned.state.mode.time, modeTime);
  assert.ok(
    returned.state.tanks
      .filter((t) => !t.temporary)
      .every((t) => t.fish.every((f) => f.health >= 80 && f.hunger <= 30)),
  );
  const exactly = createGame(saved, saved.savedAt + 8 * 60 * 60 * 1000);
  assert.equal(returned.state.coins, exactly.state.coins);
  action(returned, "acknowledgeOffline");
  assert.equal(returned.state.offline, null);
});

test("money, unlock, capacity, duplicate-upgrade and compatibility gates cannot be bypassed by actions", () => {
  const g = createGame(null, 100000);
  doMission(g);
  const coins = g.state.coins;
  assert.equal(g.act("buy", { species: "betta" }).ok, false);
  assert.equal(g.act("buy", { species: "neon" }).ok, false);
  assert.equal(g.state.coins, coins);
  const reef = toReef();
  const balance = reef.state.coins;
  assert.equal(reef.act("buy", { species: "neon" }).ok, false);
  assert.equal(reef.state.coins, balance);
  assert.equal(compatibility(reef.state, "neon").level, "red");
  doMission(reef);
  doMission(reef);
  assert.equal(reef.act("upgrade", { id: "anemone" }).ok, false);
  const offered = reef.state.choices.includes("lantern");
  assert.equal(reef.act("choose", { id: "lantern" }).ok, offered);
  const full = reef.save();
  full.tanks[full.activeTank].fish = Array.from({ length: 40 }, (_, i) => ({
    ...full.tanks[full.activeTank].fish[0],
    uid: `full-${i}`,
  }));
  const loaded = createGame(full, 100000);
  assert.equal(loaded.act("buy", { species: "clownfish" }).ok, false);
});

test("prices exactly reflect permanent traits and filter levels, with no sell-back exploit", () => {
  const g = advanceToDraft();
  const saved = g.save();
  saved.relics = ["welcome", "green", "tide"];
  const bonus = createGame(saved, 100000);
  assert.equal(bonus.quote("buy", { species: "guppy" }), 47);
  assert.equal(bonus.quote("plant"), 18);
  assert.equal(bonus.quote("clean"), 0);
  const first = bonus.quote("upgrade", { id: "filter" });
  action(bonus, "upgrade", { id: "filter" });
  assert.equal(bonus.quote("upgrade", { id: "filter" }), first * 2);
  const fish = bonus.state.tanks[bonus.state.activeTank].fish[0],
    before = bonus.state.coins;
  action(bonus, "rehome", { uid: fish.uid });
  assert.equal(bonus.state.coins, before);
});

test("fixed-step simulation is invariant to frame partitioning, and pause changes nothing", () => {
  const g = beginning(),
    saved = g.save(),
    a = createGame(saved, 100000),
    b = createGame(saved, 100000);
  a.tick(30);
  for (let i = 0; i < 300; i++) b.tick(0.1);
  assert.ok(Math.abs(a.state.coins - b.state.coins) < 1e-8);
  assert.equal(a.state.time, b.state.time);
  assert.equal(a.state.tanks[1].ammonia, b.state.tanks[1].ammonia);
  action(a, "setSpeed", { speed: 0 });
  const frozen = a.save();
  a.tick(100);
  assert.equal(a.state.time, frozen.time);
  assert.equal(a.state.coins, frozen.coins);
});

test("the same daily date and actions yield the same offers and detailed score regardless of gallery traits", () => {
  const base = toFestival().save();
  base.modes.push("daily");
  base.abilities.push("release");
  base.chapter = 11;
  const a = createGame(base, Date.UTC(2026, 8, 13)),
    other = structuredClone(base);
  other.relics = Object.keys(RELICS);
  other.coins = 999999;
  const b = createGame(other, Date.UTC(2026, 8, 13));
  action(a, "startMode", { id: "daily" });
  action(b, "startMode", { id: "daily" });
  while (!a.state.mode.complete) {
    assert.deepEqual(a.state.mode.choices, b.state.mode.choices);
    if (a.state.mode.choices.length) {
      action(a, "draft", { species: a.state.mode.choices[0] });
      action(b, "draft", { species: b.state.mode.choices[0] });
    }
    a.tick(1);
    b.tick(1);
  }
  assert.deepEqual(a.state.mode.score, b.state.mode.score);
  assert.equal(a.state.mode.date, "2026-09-13");
});

test("water changes reverse a real chemistry crash, bacteria convert ammonia, and plants consume nitrate", () => {
  const g = toFestival();
  action(g, "startMode", { id: "rescue" });
  const tank = g.state.tanks[g.state.activeTank];
  assert.ok(tank.health < 70);
  const toxin = tank.ammonia;
  action(g, "clean");
  assert.ok(tank.ammonia < toxin * 0.25);
  g.tick(12);
  action(g, "clean");
  action(g, "plant");
  action(g, "feed");
  g.tick(70);
  assert.ok(tank.health > 85);
  assert.equal(g.state.mode.complete, true);
  const sample = g.save();
  sample.mode = null;
  sample.tanks = sample.tanks.filter((t) => !t.temporary);
  sample.activeTank = 1;
  sample.tanks[1].ammonia = 1;
  sample.tanks[1].nitrite = 0;
  sample.tanks[1].nitrate = 0;
  sample.tanks[1].plants = 0;
  sample.tanks[1].filter = 2;
  const cycle = createGame(sample, 100000);
  cycle.tick(30);
  assert.ok(cycle.state.tanks[1].ammonia < 1);
  assert.ok(cycle.state.tanks[1].nitrate > 0);
  const planted = structuredClone(sample);
  planted.tanks[1].plants = 6;
  const garden = createGame(planted, 100000);
  garden.tick(30);
  assert.ok(garden.state.tanks[1].nitrate < cycle.state.tanks[1].nitrate);
});

test("pearls buy one persistent trait offer, pending rewards are preserved and ownership cannot duplicate", () => {
  const g = toReef();
  while (g.state.choices.length)
    action(g, "choose", { id: g.state.choices[0] });
  assert.equal(g.act("keepsake").ok, false);
  const saved = g.save();
  saved.pearls = 20;
  const loaded = createGame(saved, 100000),
    before = loaded.state.relics.length;
  assert.equal(loaded.quote("keepsake"), 20);
  action(loaded, "keepsake");
  assert.equal(loaded.state.pearls, 0);
  assert.equal(loaded.state.choices.length, 3);
  assert.equal(loaded.act("keepsake").ok, false);
  const selected = loaded.state.choices[0];
  action(loaded, "choose", { id: selected });
  assert.equal(loaded.state.relics.length, before + 1);
  assert.equal(loaded.act("choose", { id: selected }).ok, false);
  const all = loaded.save();
  all.relics = Object.keys(RELICS);
  all.pearls = 20;
  const complete = createGame(all, 100000);
  assert.equal(complete.act("keepsake").ok, false);
  assert.equal(complete.state.pearls, 20);
});

test("reading draft cards and reviewing a finished score pause only the temporary aquarium", () => {
  const g = advanceToDraft();
  action(g, "startMode", { id: "draft" });
  const t = g.state.tanks.at(-1),
    before = g.state.coins;
  g.tick(120);
  assert.equal(t.age, 0);
  assert.equal(g.state.mode.time, 0);
  assert.ok(g.state.coins > before);
  action(g, "endMode");
  completeMode(g, "draft");
  action(g, "startMode", { id: "draft" });
  while (!g.state.mode.complete) {
    if (g.state.mode.choices.length)
      action(g, "draft", { species: g.state.mode.choices[0] });
    g.tick(1);
  }
  const frozen = structuredClone(g.state.tanks.at(-1)),
    score = structuredClone(g.state.mode.score);
  g.tick(30);
  assert.deepEqual(g.state.tanks.at(-1), frozen);
  assert.deepEqual(g.state.mode.score, score);
  assert.equal(g.act("clean").ok, false);
});

test("Zen is earned, grants a separate unlimited wallet, and safely returns to the permanent gallery", () => {
  const sample = toFestival().save();
  sample.modes.push("zen");
  const g = createGame(sample, 100000),
    before = g.state.coins;
  action(g, "startMode", { id: "zen" });
  assert.equal(g.quote("buy", { species: "lionfish" }), 0);
  action(g, "buy", { species: "lionfish" });
  action(g, "upgrade", { id: "lighting" });
  g.tick(100);
  assert.ok(
    g.state.tanks[g.state.activeTank].fish.every((f) => f.health === 100),
  );
  assert.ok(g.state.coins > before);
  action(g, "endMode");
  assert.equal(g.state.tanks.length, 3);
  assert.equal(g.state.stats.completedModes.zen, undefined);
});

test("a crowded reef gets a clear conservation recovery path instead of a blocked purchase", () => {
  const sample = toFestival().save();
  sample.chapter = 10;
  sample.abilities.push("release");
  sample.tanks[2].fish = Array.from({ length: 40 }, (_, i) => ({
    ...sample.tanks[2].fish[0],
    uid: `busy-${i}`,
  }));
  const g = createGame(sample, 100000);
  assert.equal(g.state.mission.action, "newTank");
  assert.equal(g.state.mission.theme, "reef");
  action(g, "newTank", { theme: g.state.mission.theme, mission: true });
  assert.equal(g.state.mission.action, "buy");
  assert.equal(g.state.mission.species, "cardinal");
  assert.equal(g.state.mission.tankIndex, 3);
  doMission(g);
  assert.equal(g.state.tanks[3].fish.length, 2);
});

test("malformed imported names, null tanks, duplicate fish IDs and broken mode data remain renderable", () => {
  const sample = beginning().save();
  sample.tanks[0].name = { unexpected: true };
  sample.tanks[0].fish.push(
    null,
    { species: "constructor" },
    { ...sample.tanks[0].fish[0] },
  );
  sample.tanks.push(null);
  sample.tanks[1].ph = "bad";
  sample.tanks[1].disease = {};
  sample.discoveries = [null, 5, { text: null }];
  sample.mode = { id: "daily" };
  sample.stats.completedModes = { daily: {} };
  const g = createGame(sample, 100000);
  assert.equal(g.state.mode, null);
  assert.ok(g.state.tanks.every((t) => typeof t.name === "string"));
  const ids = g.state.tanks.flatMap((t) => t.fish.map((f) => f.uid));
  assert.equal(ids.length, new Set(ids).size);
  assert.doesNotThrow(() => g.tick(10));
  assert.ok(
    g.state.tanks.every(
      (t) => Number.isFinite(t.health) && Number.isFinite(t.ph),
    ),
  );
  assert.deepEqual(g.state.discoveries, []);
  const circular = { version: 2, tanks: [{}] };
  circular.self = circular;
  assert.equal(createGame(circular, 0).state.chapter, 0);
});

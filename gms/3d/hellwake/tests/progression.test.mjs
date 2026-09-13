import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  WEAPONS,
  PASSIVES,
  SURVIVORS,
  RELICS,
  getDraft,
  relicCost,
} from "../content.mjs";
import {
  SAVE_KEY,
  newSave,
  loadSave,
  persistSave,
  validateSave,
  buyRelic,
  recordRun,
} from "../progression.mjs";

function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
  };
}
const victory = (chapter) => ({
  victory: true,
  chapter,
  kills: 100,
  seconds: 150,
  embers: 50,
  endless: false,
});

test("the campaign has a beginning, a complete ending and legal evolution recipes", () => {
  assert.equal(CHAPTERS.length, 6);
  assert.deepEqual(
    CHAPTERS.map((chapter) => chapter.id),
    [0, 1, 2, 3, 4, 5],
  );
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.intro.length >= 3 && chapter.outro.length >= 3);
    assert.ok(chapter.objective.count > 0 && chapter.duration >= 100);
  }
  assert.ok(
    CHAPTERS[5].outro.some((line) => line.text.includes("living begin again")),
  );
  assert.equal(WEAPONS.length, 8);
  assert.equal(PASSIVES.length, 6);
  for (const weapon of WEAPONS)
    assert.ok(
      PASSIVES.some((passive) => passive.id === weapon.evolution.requires),
    );
  for (const survivor of SURVIVORS)
    assert.ok(WEAPONS.some((weapon) => weapon.id === survivor.weapon));
});

test("save roundtrip persists progression and settings without sharing defaults", () => {
  const target = storage();
  const save = newSave();
  recordRun(save, victory(0));
  save.settings.sound = false;
  assert.equal(persistSave(save, target), true);
  assert.deepEqual(loadSave(target), save);
  assert.equal(newSave().settings.sound, true);
  assert.deepEqual(loadSave(storage()), newSave());
});

test("malformed storage, unavailable storage and unsupported versions recover safely", () => {
  const target = storage();
  target.setItem(SAVE_KEY, "{broken");
  assert.deepEqual(loadSave(target), newSave());
  for (const value of [null, [], "save", 3, { version: 12, embers: 500 }])
    assert.deepEqual(validateSave(value), newSave());
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("full");
    },
  };
  assert.deepEqual(loadSave(denied), newSave());
  assert.equal(persistSave(newSave(), denied), false);
  assert.equal(persistSave(newSave(), null), false);
  assert.deepEqual(loadSave(), newSave());
});

test("validation rejects malformed values, unknown ids and locked survivors", () => {
  const save = validateSave({
    version: 1,
    embers: -500,
    unlockedChapter: Infinity,
    completed: [0, 0, -1, "4", 99],
    selectedSurvivor: "vesper",
    relics: { vitality: 500, haste: "5", fake: 20 },
    settings: { sound: "no", quality: "ultra", reducedMotion: true },
    stats: { runs: 3.9, kills: -4, bestEndless: NaN },
    endingSeen: true,
  });
  assert.equal(save.embers, 0);
  assert.equal(save.unlockedChapter, 1);
  assert.deepEqual(save.completed, [0]);
  assert.deepEqual(save.relics, { vitality: 5 });
  assert.equal(save.selectedSurvivor, "mara");
  assert.deepEqual(save.settings, {
    sound: true,
    quality: "auto",
    reducedMotion: true,
  });
  assert.deepEqual(save.stats, { runs: 3, kills: 0, bestEndless: 0 });
  assert.equal(save.endingSeen, false);
});

test("relic purchases charge increasing prices, respect caps and reject unknown ids", () => {
  const save = newSave();
  assert.equal(buyRelic(save, "might"), false);
  save.embers = 10000;
  const relic = RELICS.find((item) => item.id === "might");
  for (let rank = 0; rank < relic.max; rank++) {
    const before = save.embers;
    assert.equal(buyRelic(save, relic.id), true);
    assert.equal(before - save.embers, relicCost(relic, rank));
  }
  const before = JSON.stringify(save);
  assert.equal(buyRelic(save, "might"), false);
  assert.equal(buyRelic(save, "__proto__"), false);
  assert.equal(JSON.stringify(save), before);
});

test("six consecutive victories unlock the story ending; replay gives no duplicate unlocks", () => {
  const save = newSave();
  for (let chapter = 0; chapter < 6; chapter++) {
    const result = recordRun(save, victory(chapter));
    assert.equal(result.newChapter, chapter < 5);
    if (chapter === 1) assert.ok(result.unlocks.includes("Elias Vale"));
    if (chapter === 3) assert.ok(result.unlocks.includes("Vesper"));
    if (chapter === 5) assert.ok(result.unlocks.includes("Endless Afterlight"));
  }
  assert.deepEqual(save.completed, [0, 1, 2, 3, 4, 5]);
  assert.equal(save.unlockedChapter, 5);
  assert.equal(save.stats.runs, 6);
  assert.equal(save.embers, 300);
  assert.deepEqual(recordRun(save, victory(5)), {
    newChapter: false,
    unlocks: [],
  });
  assert.equal(
    save.endingSeen,
    false,
    "only the UI should acknowledge seeing the ending",
  );
});

test("defeat, invalid chapter and endless cannot unlock campaign; best endless is retained", () => {
  const save = newSave();
  recordRun(save, { ...victory(0), victory: false });
  recordRun(save, victory(5));
  recordRun(save, { ...victory(0), endless: true, seconds: 340 });
  recordRun(save, { ...victory(0), endless: true, seconds: 50 });
  assert.equal(save.unlockedChapter, 0);
  assert.deepEqual(save.completed, []);
  assert.equal(save.stats.bestEndless, 340);
  assert.equal(save.stats.kills, 400);
  assert.equal(save.embers, 200);
});

test("first draft teaches the starter and never offers locked weapons or duplicate choices", () => {
  for (let seed = 0; seed < 20; seed++) {
    const draft = getDraft(
      { weapons: { pistol: 1 }, passives: {}, chapter: 0, level: 2 },
      () => seed / 20,
    );
    assert.equal(draft.length, 3);
    assert.equal(draft[0].id, "pistol");
    assert.equal(
      new Set(draft.map((item) => `${item.kind}:${item.id}`)).size,
      draft.length,
    );
    for (const item of draft)
      if (item.kind === "weapon")
        assert.equal(
          WEAPONS.find((weapon) => weapon.id === item.id).unlockChapter,
          0,
        );
  }
});

test("evolution is guaranteed when earned, but never offered prematurely or twice", () => {
  const run = {
    weapons: { pistol: 5 },
    passives: { might: 3 },
    chapter: 5,
    level: 15,
  };
  assert.equal(getDraft(run, () => 0.99)[0].kind, "evolution");
  assert.equal(getDraft(run, () => 0.99)[0].name, "Absolution");
  assert.ok(
    !getDraft({ ...run, passives: { might: 2 } }, () => 0).some(
      (item) => item.kind === "evolution",
    ),
  );
  assert.ok(
    !getDraft({ ...run, evolved: { pistol: true } }, () => 0).some(
      (item) => item.id === "pistol",
    ),
  );
});

test("replaying an early chapter retains the permanently unlocked arsenal and tutorial choice", () => {
  const found = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const draft = getDraft(
      {
        weapons: { pistol: 1 },
        passives: {},
        chapter: 0,
        arsenalChapter: 5,
        level: 2,
      },
      () => seed / 100,
    );
    assert.equal(
      draft[0].id,
      "pistol",
      "early chapter keeps its dependable starter upgrade",
    );
    for (const item of draft) if (item.kind === "weapon") found.add(item.id);
  }
  for (const weapon of WEAPONS)
    assert.ok(
      found.has(weapon.id),
      `${weapon.name} remains available on replay`,
    );
  const fallback = getDraft(
    { weapons: { pistol: 1 }, passives: {}, chapter: 0, level: 2 },
    () => 0.7,
  );
  assert.ok(
    fallback.every(
      (item) =>
        item.kind !== "weapon" ||
        WEAPONS.find((weapon) => weapon.id === item.id).unlockChapter === 0,
    ),
  );
});

test("full inventories offer upgrades only to owned items and maxed builds can recover", () => {
  const run = {
    chapter: 5,
    level: 40,
    weapons: { pistol: 4, orbit: 4, lightning: 4, flame: 4 },
    passives: { might: 2, reach: 2, haste: 2, vitality: 2 },
  };
  for (const item of getDraft(run, () => 0.7))
    assert.ok(
      item.kind === "weapon" ? item.id in run.weapons : item.id in run.passives,
    );
  for (const id in run.weapons) run.weapons[id] = 5;
  for (const id in run.passives) run.passives[id] = 3;
  run.evolved = Object.fromEntries(
    Object.keys(run.weapons).map((id) => [id, true]),
  );
  assert.deepEqual(
    getDraft(run).map((item) => item.kind),
    ["heal"],
  );
});

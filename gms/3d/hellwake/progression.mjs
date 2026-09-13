import { CHAPTERS, RELICS, SURVIVORS, WEAPONS, relicCost } from "./content.mjs";

export const SAVE_KEY = "hellwake-v1";
const MAX_COUNT = 999999999;
const integer = (value, fallback = 0, max = MAX_COUNT) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.floor(value)))
    : fallback;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function newSave() {
  return {
    version: 1,
    embers: 0,
    unlockedChapter: 0,
    completed: [],
    relics: {},
    selectedSurvivor: "mara",
    settings: { sound: true, quality: "auto", reducedMotion: false },
    stats: { runs: 0, kills: 0, bestEndless: 0 },
    endingSeen: false,
  };
}

/** Copy only recognized, bounded fields; malformed and future versions start safely. */
export function validateSave(input) {
  const raw = object(input);
  const save = newSave();
  if (raw.version !== 1) return save;
  save.embers = integer(raw.embers);
  save.unlockedChapter = integer(raw.unlockedChapter, 0, CHAPTERS.length - 1);
  save.completed = [
    ...new Set(
      (Array.isArray(raw.completed) ? raw.completed : []).filter(
        (id) => Number.isInteger(id) && id >= 0 && id < CHAPTERS.length,
      ),
    ),
  ].sort((a, b) => a - b);
  // A valid completion must never be stranded behind a corrupted chapter index.
  if (save.completed.length)
    save.unlockedChapter = Math.max(
      save.unlockedChapter,
      Math.min(CHAPTERS.length - 1, Math.max(...save.completed) + 1),
    );
  const relics = object(raw.relics);
  for (const relic of RELICS) {
    const level = integer(relics[relic.id], 0, relic.max);
    if (level) save.relics[relic.id] = level;
  }
  const survivor = SURVIVORS.find((item) => item.id === raw.selectedSurvivor);
  if (survivor && survivor.unlockChapter <= save.unlockedChapter)
    save.selectedSurvivor = survivor.id;
  const settings = object(raw.settings);
  if (typeof settings.sound === "boolean") save.settings.sound = settings.sound;
  if (typeof settings.reducedMotion === "boolean")
    save.settings.reducedMotion = settings.reducedMotion;
  if (["auto", "low", "high"].includes(settings.quality))
    save.settings.quality = settings.quality;
  const stats = object(raw.stats);
  for (const key of ["runs", "kills", "bestEndless"])
    save.stats[key] = integer(stats[key]);
  save.endingSeen =
    raw.endingSeen === true && save.completed.includes(CHAPTERS.length - 1);
  return save;
}

function resolveStorage(storage) {
  try {
    return storage === undefined ? globalThis.localStorage : storage;
  } catch {
    return null;
  }
}

export function loadSave(storage) {
  try {
    const raw = resolveStorage(storage)?.getItem(SAVE_KEY);
    return raw ? validateSave(JSON.parse(raw)) : newSave();
  } catch {
    return newSave();
  }
}

/** False means storage is unavailable/full; the caller retains its in-memory save. */
export function persistSave(save, storage) {
  try {
    const target = resolveStorage(storage);
    if (!target || typeof target.setItem !== "function") return false;
    target.setItem(SAVE_KEY, JSON.stringify(validateSave(save)));
    return true;
  } catch {
    return false;
  }
}

export function buyRelic(save, id) {
  const relic = RELICS.find((item) => item.id === id);
  if (!relic || !save || typeof save !== "object") return false;
  const rank = integer(object(save.relics)[id], 0, relic.max);
  const cost = relicCost(relic, rank);
  if (rank >= relic.max || integer(save.embers) < cost) return false;
  save.embers = integer(save.embers) - cost;
  if (
    !save.relics ||
    typeof save.relics !== "object" ||
    Array.isArray(save.relics)
  )
    save.relics = {};
  save.relics[id] = rank + 1;
  return true;
}

/** Called once by the result screen. Replays earn currency but not duplicate unlocks. */
export function recordRun(save, result) {
  if (
    !save ||
    typeof save !== "object" ||
    !result ||
    typeof result !== "object"
  )
    return { newChapter: false, unlocks: [] };
  const normalized = validateSave(save);
  Object.assign(save, normalized);
  const chapterValid =
    Number.isInteger(result.chapter) &&
    result.chapter >= 0 &&
    result.chapter <= save.unlockedChapter;
  save.stats.runs = integer(save.stats.runs + 1);
  save.stats.kills = integer(save.stats.kills + integer(result.kills));
  save.embers = integer(save.embers + integer(result.embers));
  if (result.endless === true) {
    save.stats.bestEndless = Math.max(
      save.stats.bestEndless,
      integer(result.seconds),
    );
    return { newChapter: false, unlocks: [] };
  }
  const unlocks = [];
  let newChapter = false;
  if (
    result.victory === true &&
    chapterValid &&
    !save.completed.includes(result.chapter)
  ) {
    const previousChapter = save.unlockedChapter;
    save.completed.push(result.chapter);
    save.completed.sort((a, b) => a - b);
    save.unlockedChapter = Math.max(
      previousChapter,
      Math.min(CHAPTERS.length - 1, result.chapter + 1),
    );
    newChapter = save.unlockedChapter > previousChapter;
    if (newChapter) {
      unlocks.push(CHAPTERS[save.unlockedChapter].title);
      for (const weapon of WEAPONS)
        if (
          weapon.unlockChapter > previousChapter &&
          weapon.unlockChapter <= save.unlockedChapter
        )
          unlocks.push(weapon.name);
      for (const survivor of SURVIVORS)
        if (
          survivor.unlockChapter > previousChapter &&
          survivor.unlockChapter <= save.unlockedChapter
        )
          unlocks.push(survivor.name);
    }
    if (result.chapter === CHAPTERS.length - 1)
      unlocks.push("Endless Afterlight");
  }
  return { newChapter, unlocks };
}

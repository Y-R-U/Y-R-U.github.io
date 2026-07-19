import { SAVE_KEY, TIERS, RACKETS, SHOES, OUTFITS } from "./const.js";
import { makeOpponent, firstOpponent } from "./names.js";
import { lerp, rand } from "./util.js";

export function newSave() {
  return {
    money: 0, rank: null, tier: 0, tierMatch: 0,     // tierMatch = index of next match in tier
    skills: { power: 1 },                             // id -> level
    loadout: ["power"],                               // equipped active skills (max 4)
    racket: "pan", shoes: "flip", outfit: "vest",
    owned: { racket: ["pan"], shoes: ["flip"], outfit: ["vest"] },
    wins: 0, losses: 0, champion: false,
    opp: null,                                        // pending opponent (persisted so it doesn't reroll)
    seenIntro: false,
    story: 1, storyDone: false,                       // story mode progress (level 1..100)
    csStart: false,                                   // opening cutscene seen
    trophies: { local: 0, national: 0, world: 0 },
    dailyWin: null,                                   // date string of last daily-challenge win
    bestSpeed: 0,                                     // fastest shot ever, km/h
    settings: { units: "kph" },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = Object.assign(newSave(), JSON.parse(raw));
      s.loadout = s.loadout.slice(0, skillSlots(s));
      return s;
    }
  } catch (e) { /* corrupted save -> fresh */ }
  return newSave();
}

/* ---- Story-gated unlocks ---- */
export const SLOT_UNLOCKS = [1, 5, 10, 20];        // story level needed for loadout slot i
export function skillSlots(save) {
  if (save.storyDone) return SLOT_UNLOCKS.length;
  let n = 0;
  for (const lvl of SLOT_UNLOCKS) if (save.story >= lvl) n++;
  return Math.max(1, n);
}

export const STAR_UNLOCKS = [5, 10, 20, 30, 40];   // story level needed for quick-match ★(i+1)
export function quickStars(save) {                  // 0 = quick match locked entirely
  if (save.storyDone) return 5;
  let n = 0;
  for (const lvl of STAR_UNLOCKS) if (save.story >= lvl) n++;
  return n;
}

/* ---- World rank, driven by story + cups (friendlies don't count) ---- */
// Tuned so the ranking matches the story beats: tour card (~L60) lands around #800,
// "crack the top 100" (~L75) actually does, and the world #2 (L90) sits at single digits.
export function rankFromStory(n) {
  return Math.max(2, Math.round(Math.pow(10, 6 * Math.pow((100 - n) / 99, 0.8))));
}

// Story result → rank movement. Returns {oldRank, newRank}.
export function applyStoryRank(save, won, level) {
  const oldRank = save.rank;
  if (won) {
    const r = level >= 100 ? 1 : rankFromStory(level);
    save.rank = save.rank === null ? Math.min(1000000, r) : Math.min(save.rank, r);
  } else if (save.rank !== null) {
    save.rank = Math.min(1000000, Math.round(save.rank * rand(1.03, 1.1)));
  }
  persist(save);
  return { oldRank, newRank: save.rank };
}

const CUP_RANK_FLOOR = { local: 20000, national: 2000, world: 50 };

// Winning a whole cup halves your rank number, down to the cup's floor.
export function applyCupRank(save, kind) {
  const oldRank = save.rank;
  const cur = save.rank === null ? 1000000 : save.rank;
  save.rank = Math.min(cur, Math.max(CUP_RANK_FLOOR[kind] || 20000, Math.round(cur * 0.5)));
  persist(save);
  return { oldRank, newRank: save.rank };
}

export function persist(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}

export function wipe() { localStorage.removeItem(SAVE_KEY); }

export function currentTier(save) { return TIERS[Math.min(save.tier, TIERS.length - 1)]; }

// Roll (and persist) the next opponent for the current tier match.
export function nextOpponent(save) {
  if (save.opp) return save.opp;
  const tier = currentTier(save);
  let opp;
  if (save.tier === 0 && save.tierMatch === 0 && save.wins === 0) opp = firstOpponent();
  else {
    const t = tier.matches <= 1 ? 1 : save.tierMatch / (tier.matches - 1);
    const stars = lerp(tier.oppStars[0], tier.oppStars[1], t) * rand(0.95, 1.05);
    opp = makeOpponent(tier, save.tierMatch, tier.matches, Math.min(5, stars));
  }
  save.opp = opp;
  persist(save);
  return opp;
}

// Apply a FRIENDLY match result (tier ladder progress only — friendlies never move
// world rank; that's earned in story mode and cups). Returns a summary for the UI.
export function applyResult(save, won, earnings) {
  const tier = currentTier(save);
  const sum = { won, earnings, tierUp: false, champion: false };
  save.money += earnings;
  save.opp = null;
  if (won) {
    save.wins++;
    save.tierMatch++;
    if (save.tierMatch >= tier.matches) {
      if (save.tier >= TIERS.length - 1) { save.champion = true; sum.champion = true; }
      else { save.tier++; save.tierMatch = 0; sum.tierUp = true; }
    }
  } else {
    save.losses++;
  }
  persist(save);
  return sum;
}

export function gearList(kind) {
  return kind === "racket" ? RACKETS : kind === "shoes" ? SHOES : OUTFITS;
}

export function gearItem(kind, id) {
  return gearList(kind).find(g => g.id === id) || gearList(kind)[0];
}

// Aggregate gear bonuses for match setup.
export function gearBonus(save) {
  const r = gearItem("racket", save.racket), s = gearItem("shoes", save.shoes), o = gearItem("outfit", save.outfit);
  return { pow: r.pow, ctl: r.ctl, spd: s.spd, hyp: o.hyp };
}

import { SAVE_KEY, TIERS, RACKETS, SHOES, OUTFITS } from "./const.js";
import { makeOpponent, firstOpponent, rankDropForWin } from "./names.js";
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
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(newSave(), JSON.parse(raw));
  } catch (e) { /* corrupted save -> fresh */ }
  return newSave();
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

// Apply a match result. Returns a summary object for the UI.
export function applyResult(save, won, earnings) {
  const tier = currentTier(save);
  const sum = { won, earnings, oldRank: save.rank, newRank: save.rank, tierUp: false, champion: false };
  save.money += earnings;
  save.opp = null;
  if (won) {
    save.wins++;
    save.tierMatch++;
    // Rank movement
    if (save.rank === null) { save.rank = 1000000; sum.newRank = 1000000; sum.firstRank = true; }
    else {
      const target = tier.rankEnd;
      const left = tier.matches - save.tierMatch + 1;
      save.rank = rankDropForWin(save.rank, target, left);
      sum.newRank = save.rank;
    }
    if (save.tierMatch >= tier.matches) {
      save.rank = tier.rankEnd;
      sum.newRank = save.rank;
      if (save.tier >= TIERS.length - 1) { save.champion = true; sum.champion = true; }
      else { save.tier++; save.tierMatch = 0; sum.tierUp = true; }
    }
  } else {
    save.losses++;
    // Losing stings a little: rank drifts up (worse), never past tier start
    if (save.rank !== null) {
      const cap = tier.rankStart || 1000000;
      save.rank = Math.min(cap, Math.round(save.rank * rand(1.05, 1.18)));
      sum.newRank = save.rank;
    }
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

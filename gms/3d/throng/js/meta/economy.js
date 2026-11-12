export const ECON = {
  placeCoins: [50, 35, 26, 20, 15, 12, 10, 8],
  killCoins: 8,
  peakPer: 40, peakCap: 40,          // +1 coin per 40 peak people, at most 40
  firstWinCoins: 120, firstWinXp: 100,
  placeXp: (place) => 30 + (9 - place) * 8,
  killXp: 10,
  peakXpPer: 25, peakXpCap: 60,
  levelCoins: (level) => 40 + 10 * level,
  forfeitCoins: 0,
};

export const xpToNext = (level) => 120 + 30 * (level - 1);

export function matchPayout({ place, kills = 0, best = 0, left = false }) {
  if (left) return { coins: [], xp: 10 };
  const coins = [
    { id: 'place', label: 'Placement', n: ECON.placeCoins[Math.max(0, Math.min(7, place - 1))] },
    { id: 'kills', label: 'Crowds absorbed', n: kills * ECON.killCoins },
    { id: 'peak', label: 'Peak crowd', n: Math.min(ECON.peakCap, Math.floor(best / ECON.peakPer)) },
  ].filter((c) => c.n > 0);
  const xp = ECON.placeXp(place) + kills * ECON.killXp + Math.min(ECON.peakXpCap, Math.floor(best / ECON.peakXpPer));
  return { coins, xp };
}

// Adds XP, levelling up as many times as it covers. Returns the level-up coin rewards.
export function addXp(save, xp) {
  save.xp += Math.max(0, Math.round(xp));
  const ups = [];
  while (save.xp >= xpToNext(save.level)) {
    save.xp -= xpToNext(save.level);
    save.level++;
    ups.push({ level: save.level, coins: ECON.levelCoins(save.level) });
  }
  return ups;
}

export function earn(save, n) {
  const v = Math.max(0, Math.round(n || 0));
  save.coins += v;
  save.stats.coinsEarned += v;
  return v;
}

export function spend(save, n) {
  const v = Math.round(n);
  if (!(v >= 0) || save.coins < v) return false;
  save.coins -= v;
  return true;
}

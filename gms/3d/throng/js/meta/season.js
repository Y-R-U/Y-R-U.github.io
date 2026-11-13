// Ladder seasons: 4 weeks each, derived from the UTC date. Season 1 started Monday 2 November 2026.
import { LEAGUES, nextLeague } from './leagues.js';

export const SEASON = {
  epoch: Date.UTC(2026, 10, 2),
  length: 28,
  keep: 0.4,                                              // share of the rating above your league floor kept at rollover
  rewards: [100, 200, 300, 450, 650, 900, 1200, 1600],    // coins by peak league
};
const DAY = 86400000;

export function seasonAt(t = Date.now()) {
  const n = Math.floor((t - SEASON.epoch) / (SEASON.length * DAY)) + 1;
  const start = SEASON.epoch + (n - 1) * SEASON.length * DAY, end = start + SEASON.length * DAY;
  return { n, start, end, msLeft: end - t, daysLeft: Math.ceil((end - t) / DAY) };
}

export const softReset = (rating, league) => {
  const floor = LEAGUES[league].min;
  return Math.max(0, Math.round(floor + Math.max(0, rating - floor) * SEASON.keep));
};

// Called on boot and before every rated match. A save from an older season gets one reward for the peak
// league it reached, a trophy, and the soft reset. Returns that report, or null.
export function rollSeason(save, t = Date.now()) {
  const cur = seasonAt(t).n;
  if (!save.season || !(save.season.n >= 1)) { save.season = { n: cur, peakLeague: save.league }; return null; }
  if (save.season.n >= cur) { save.season.peakLeague = Math.max(save.season.peakLeague, save.league); return null; }
  const old = save.season.n, peak = Math.max(save.season.peakLeague, save.league);
  const played = save.stats.matches > (save.season.matchesAtStart ?? 0);
  const coins = played ? SEASON.rewards[peak] : 0;
  const before = save.rating;
  save.rating = softReset(save.rating, save.league);
  save.league = nextLeague(save.league, save.rating);
  if (played) {
    save.trophies.push({ kind: 'season', key: 'S' + old, league: peak, at: t });
    save.coins += coins; save.stats.coinsEarned += coins;
  }
  save.season = { n: cur, peakLeague: save.league, matchesAtStart: save.stats.matches };
  return { from: old, to: cur, peak, coins, played, before, after: save.rating };
}

export function notePeak(save) {
  if (save.season) save.season.peakLeague = Math.max(save.season.peakLeague || 0, save.league);
}

import { ratingDelta, rankOf, RATED } from './ladder.js';
import { CONFIG } from '../config.js';
import { LEAGUES, nextLeague } from './leagues.js';
import { matchPayout, addXp, earn, ECON } from './economy.js';
import { dayKey, trackChallenge } from './daily.js';
import { rollSeason, notePeak } from './season.js';
import { recordCup } from './events.js';

// result: { place, count, best, kills, recruited, crownSecs, left, mode, coinMul, slayer: { n, bonus }, duration }
// Classic and Last Crowd Standing move the rating (D14, D21; LCS points scaled per minute of play, RATED in
// ladder.js); the other modes pay coins and XP by placement and feed the cup. duration: the match clock in seconds
// (D20), scales the per-match payout. Mutates `save` and returns everything the results screen needs to animate.
export function applyMatch(save, result, now = Date.now()) {
  const r = { place: 8, count: 0, best: 0, kills: 0, recruited: 0, crownSecs: 0, left: false, mode: 'classic', coinMul: 1, slayer: null, duration: 0, ...result };
  const place = r.left ? 8 : r.place;
  const season = rollSeason(save, now);
  const before = { rating: save.rating, rank: rankOf(save.rating), league: save.league, level: save.level, xp: save.xp, coins: save.coins };
  const std = (CONFIG.MODES[r.mode] && CONFIG.MODES[r.mode].duration) || CONFIG.MATCH.duration;
  const lenMul = r.mode !== 'lcs' && r.duration > 0 ? r.duration / std : 1;
  // A non-standard clock never moves the rating (ratings stay comparable, D20).
  const rated = RATED[r.mode] != null && lenMul === 1;

  const delta = rated ? ratingDelta(save.rating, place, undefined, ...RATED[r.mode]) : 0;
  save.rating = Math.max(0, save.rating + delta);
  save.peakRating = Math.max(save.peakRating, save.rating);
  save.league = nextLeague(save.league, save.rating);
  notePeak(save);
  const ms = save.modeStats[r.mode] || (save.modeStats[r.mode] = { matches: 0, wins: 0, best: 0 });
  ms.matches++;
  if (!r.left && place === 1) ms.wins++;
  ms.best = Math.max(ms.best, r.best || 0);

  const st = save.stats;
  st.matches++;
  if (!r.left) {
    if (place === 1) { st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else st.streak = 0;
    if (place <= 3) st.top3++;
    st.bestCrowd = Math.max(st.bestCrowd, r.best);
    st.recruited += r.recruited;
    st.absorbed += r.kills;
    st.crownSecs += Math.round(r.crownSecs);
  } else st.streak = 0;

  const pay = matchPayout({ place, kills: r.kills, best: r.best, left: r.left, lenMul });
  const coins = pay.coins.slice();
  if (!r.left && r.coinMul > 1) {
    const base = coins.reduce((a, c) => a + c.n, 0);
    const extra = Math.round(base * (r.coinMul - 1));
    if (extra > 0) coins.push({ id: 'motd', label: `Mode of the Day ×${r.coinMul}`, n: extra });
  }
  if (!r.left && r.slayer && r.slayer.n > 0) coins.push({ id: 'slayer', label: `Giant Slayer ×${r.slayer.n}`, n: r.slayer.n * r.slayer.bonus });
  const cup = r.left ? [] : recordCup(save, place, r.mode, now);
  for (const tier of cup) coins.push({ id: 'cup-' + tier.id, label: tier.name + ' reached', n: tier.coins });
  let xp = pay.xp;
  const today = dayKey(now);
  let firstWin = false;
  if (!r.left && place === 1 && save.daily.firstWinKey !== today) {
    save.daily.firstWinKey = today;
    firstWin = true;
    coins.push({ id: 'firstwin', label: 'First win of the day', n: ECON.firstWinCoins });
    xp += ECON.firstWinXp;
  }
  const challenge = trackChallenge(save, r, now);
  if (challenge.justDone) {
    coins.push({ id: 'daily', label: 'Daily challenge', n: challenge.ch.coins });
    xp += challenge.ch.xp;
  }
  const ups = addXp(save, xp);
  for (const u of ups) coins.push({ id: 'level', label: `Level ${u.level} reached`, n: u.coins });
  let total = 0;
  for (const c of coins) total += earn(save, c.n);

  const after = { rating: save.rating, rank: rankOf(save.rating), league: save.league, level: save.level, xp: save.xp, coins: save.coins };
  save.last = { at: now, place, delta, total };
  return {
    place, left: r.left, delta, before, after, coins, total, xp, levelUps: ups, firstWin, challenge, rated, mode: r.mode, cup, season, duration: r.duration, lenMul,
    promoted: after.league > before.league ? LEAGUES[after.league] : null,
    demoted: after.league < before.league ? LEAGUES[after.league] : null,
  };
}

// Weekly ladder (PLAN 2.7, D12: the more you PLAY the higher you go). Pure: no DOM, no storage.
// A week runs Monday 00:00 local → next Monday 00:00. Each tier has its own board of generated
// players for that week (the events ladder code: named bots whose points advance with the date,
// identical on every device), plus you. At the week's end the top PROMOTE go up a tier and the
// bottom RELEGATE go down; everyone who played gets the tier reward, claimable once.
import { dayStart, countdown, ladderPlayers, botPoints } from '../events/events.js';

const DAY = 86400000;
export const BOARD = 20, PROMOTE = 4, RELEGATE = 4;
// scale = bot points multiplier (bots score like the events ladder × scale), pace = bot activity.
// Tuned so promotion needs roughly 2 / 4 / 6 / 9 / 13 front-nine rounds a week (meta_test prints it).
export const TIERS = [
  { id: 'bronze', name: 'Bronze', color: '#d08a4c', dark: '#7a4a22', scale: 1.9, pace: 1.0, coins: 60 },
  { id: 'silver', name: 'Silver', color: '#cfd6e0', dark: '#6c7686', scale: 2.6, pace: 1.3, coins: 100 },
  { id: 'gold', name: 'Gold', color: '#f2c75c', dark: '#9a6a12', scale: 3.0, pace: 1.7, coins: 150 },
  { id: 'platinum', name: 'Platinum', color: '#7fe6d8', dark: '#2a7a72', scale: 3.9, pace: 2.2, coins: 220 },
  { id: 'diamond', name: 'Diamond', color: '#8ab8ff', dark: '#3456a8', scale: 4.1, pace: 2.9, coins: 320 },
  { id: 'legend', name: 'Legend', color: '#c58cff', dark: '#6a32a8', scale: 4.2, pace: 3.6, coins: 450 },
];

// ---- dates (local) ----
const pad = n => String(n).padStart(2, '0');
export function ymd(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return ymd(new Date(y, m - 1, d + n).getTime()); }
export function weekKey(now) { const d = new Date(now); return addDays(ymd(now), -((d.getDay() + 6) % 7)); }   // that week's Monday
export const weekStart = key => dayStart(key);
export const weekEnd = key => dayStart(addDays(key, 7));
export const weekCountdown = now => countdown(weekEnd(weekKey(now)) - now);

// The tier board for a week as an events-style pseudo event (start Monday, end Sunday inclusive).
function seedOf(key, tier) { let h = 2166136261; for (const c of `${key}|${tier}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 1000003; }
export function weekBoard(key, tier) {
  const T = TIERS[tier];
  return { id: `ladder:${key}:${T.id}`, start: key, end: addDays(key, 6), ladder: { seed: seedOf(key, tier), size: BOARD - 1, pace: T.pace } };
}
export function standings(key, tier, now, you) {
  const ev = weekBoard(key, tier), sc = TIERS[tier].scale;
  const t = Math.min(now, weekEnd(key));
  const rows = ladderPlayers(ev).map(b => ({ name: b.name, points: Math.round(botPoints(b, ev, t) * sc) }));
  rows.push({ name: you.name || 'You', points: you.points | 0, you: true });
  rows.sort((a, b) => b.points - a.points || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; r.zone = zoneOf(tier, r.rank); });
  return rows;
}
export function zoneOf(tier, rank) {
  if (rank <= PROMOTE && tier < TIERS.length - 1) return 'up';
  if (rank > BOARD - RELEGATE && tier > 0) return 'down';
  return '';
}

// ---- points ----
// Harder holes pay more: by par, plus a bonus from the measured difficulty (holes_test --human).
export const HARD = { sky1: 3, sky2: 2, sky5: 1, sky7: 6, sky8: 2, sky9: 6 };
export const streakMult = days => 1 + 0.1 * Math.min(5, Math.max(0, (days | 0) - 1));   // +10% a day in a row, up to +50%
export function holePoints({ id, par, strokes, picked, stars, streak = 1 }) {
  let p;
  if (picked) p = 5;
  else p = 10 + 8 * Math.max(0, par - strokes) + (strokes === 1 ? 10 : 0) + 3 * stars + 3 * Math.max(0, par - 2) + (HARD[id] || 0);
  return Math.round(p * streakMult(streak));
}
export const roundBonus = holes => holes >= 6 ? 5 * holes : 0;

// Days played in a row: playing on consecutive local days grows it, missing a day resets it to 1.
export function touchStreak(st, today) {
  if (st.last === today) return st.days;
  st.days = st.last && addDays(st.last, 1) === today ? (st.days | 0) + 1 : 1;
  st.last = today;
  return st.days;
}

// ---- week end ----
export function freshLadder(now) { return { week: weekKey(now), tier: 0, points: 0, holes: 0, rounds: 0, best: 0, streak: { last: null, days: 0 }, results: [] }; }
export function tierReward(tier, rank, move) {
  const base = TIERS[tier].coins;
  if (move > 0) return { coins: Math.round(base * 1.5), chest: 'gold' };
  if (move < 0) return { coins: Math.round(base * 0.5) };
  return { coins: base, chest: rank <= 10 ? 'silver' : 'wood' };
}
// Close the stored week if `now` is in a later one: rank, promote / relegate, queue the reward.
// A week you didn't play at all changes nothing (no reward, no relegation). Returns the result or null.
export function settle(L, now) {
  const cur = weekKey(now);
  if (!L.week || L.week >= cur) { if (!L.week) L.week = cur; return null; }   // same week, or the clock went back
  let res = null;
  if (L.points > 0) {
    const me = standings(L.week, L.tier, weekEnd(L.week), { points: L.points }).find(r => r.you);
    const move = me.zone === 'up' ? 1 : me.zone === 'down' ? -1 : 0;
    res = { week: L.week, tier: L.tier, rank: me.rank, points: L.points, move, reward: tierReward(L.tier, me.rank, move), claimed: false };
    L.tier = Math.max(0, Math.min(TIERS.length - 1, L.tier + move));
    L.best = Math.max(L.best | 0, L.tier);
    L.results.unshift(res);
    L.results.length = Math.min(L.results.length, 6);
  }
  Object.assign(L, { week: cur, points: 0, holes: 0, rounds: 0 });
  return res;
}
export const weekLabel = key => {
  const f = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  return `${f(key)} – ${f(addDays(key, 6))}`;
};
export { DAY };

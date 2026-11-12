import { ratingAt } from './ladder.js';

// Tiers are cut by RANK (so they mean something on the curve) and stored as rating thresholds.
export const LEAGUES = [
  { id: 'bronze', name: 'Bronze', rank: Infinity, color: '#c9824a', ink: '#5a2c0a' },
  { id: 'silver', name: 'Silver', rank: 180000, color: '#c9d3e0', ink: '#3b4658' },
  { id: 'gold', name: 'Gold', rank: 100000, color: '#ffcc33', ink: '#6b4300' },
  { id: 'platinum', name: 'Platinum', rank: 50000, color: '#5fe0d0', ink: '#0b4a44' },
  { id: 'diamond', name: 'Diamond', rank: 20000, color: '#6fb5ff', ink: '#0d2f66' },
  { id: 'master', name: 'Master', rank: 5000, color: '#c47dff', ink: '#3a0d66' },
  { id: 'champion', name: 'Champion', rank: 1000, color: '#ff6b6b', ink: '#5c0b0b' },
  { id: 'legend', name: 'Legend', rank: 100, color: '#ffe680', ink: '#5a3a00' },
].map((l, i) => ({ ...l, index: i, min: l.rank === Infinity ? 0 : ratingAt(l.rank) }));

export const DEMOTE_BUFFER = 40;

export function leagueOf(rating) {
  let i = 0;
  while (i + 1 < LEAGUES.length && rating >= LEAGUES[i + 1].min) i++;
  return LEAGUES[i];
}

// With hysteresis: you are promoted on crossing the line but only demoted once you fall a buffer below it.
export function nextLeague(current, rating) {
  let i = current;
  while (i + 1 < LEAGUES.length && rating >= LEAGUES[i + 1].min) i++;
  while (i > 0 && rating < LEAGUES[i].min - DEMOTE_BUFFER) i--;
  return i;
}

// The real difficulty curve: opponents' skill and aggression by league.
export function botProfile(leagueIndex) {
  const t = leagueIndex / (LEAGUES.length - 1);
  return { skill: 0.34 + 0.56 * t, spread: 0.12, aggr: 0.9 + 0.25 * t, throttle: 0.8 + 0.2 * t };
}

export function badgeSvg(l, size = 24) {
  const pts = l.index >= 7 ? 'M12 1l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z' : null;
  const body = pts
    ? `<path d="${pts}" fill="${l.color}" stroke="${l.ink}" stroke-width="1.6" stroke-linejoin="round"/>`
    : `<path d="M12 1.5l9 3.5v6.5c0 5.5-4 9.5-9 11-5-1.5-9-5.5-9-11V5z" fill="${l.color}" stroke="${l.ink}" stroke-width="1.6" stroke-linejoin="round"/>`
      + `<path d="M12 4.5l6 2.4v4.6c0 3.9-2.7 6.8-6 7.9-3.3-1.1-6-4-6-7.9V6.9z" fill="rgba(255,255,255,.28)"/>`
      + `<text x="12" y="15.5" text-anchor="middle" font-size="9" font-weight="900" font-family="system-ui,sans-serif" fill="${l.ink}">${'I II III IV V VI VII'.split(' ')[l.index] || ''}</text>`;
  return `<svg class="lg-badge" viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="${l.name}">${body}</svg>`;
}

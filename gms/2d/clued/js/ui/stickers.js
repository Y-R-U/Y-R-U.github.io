// Kids reward loop: stars from correct answers unlock stickers. Stored inside clued.stats so it syncs.
import { getStats, updateStats } from '../core/store.js?v=202610050144';

export const STICKERS = ['🦁', '🐼', '🦄', '🐙', '🦖', '🐸', '🦋', '🐢', '🦊', '🐧', '🐝', '🦉', '🐬', '🦒', '🐨', '🌈', '🚀', '🌟', '🍩', '🎈', '🏆', '👑', '🐳', '🦜'];
export const STARS_PER = 10;

export function kidsProgress() {
  const s = getStats();
  const stars = s.kidsStars || 0;
  const have = Math.min(STICKERS.length, Math.floor(stars / STARS_PER));
  return { stars, have, next: STARS_PER - (stars % STARS_PER), stickers: STICKERS };
}

export function addStars(n) {
  const before = kidsProgress().have;
  updateStats(s => { s.kidsStars = (s.kidsStars || 0) + n; });
  const after = kidsProgress().have;
  return STICKERS.slice(before, after);
}

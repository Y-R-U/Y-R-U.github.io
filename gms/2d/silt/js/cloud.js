// Optional br8t account layer. Dynamically imported by main.js and never
// awaited — if it throws, or the player is offline, SILT plays on locally.
//
// main.js skips this import entirely under ?auto/?soak so headless runs stay
// hermetic.
import { syncLocalKeys } from '/lib/auth/localsync.js';
import { SAVE_KEYS } from './core/save.js';

// Only what is safe to carry between devices: bests, settings, lifetime stats.
// Never an in-progress board — restoring one on another device hands the player
// a half-played game with no context, and the reload lands mid-match.
let playing = false;

const describe = () => {
  try {
    const best = JSON.parse(localStorage.getItem('silt.best') || '{}');
    const stats = JSON.parse(localStorage.getItem('silt.stats') || '{}');
    const top = Object.entries(best).sort((a, b) => b[1] - a[1])[0];
    return [
      top ? `${top[0].toUpperCase()} best ${top[1].toLocaleString()}` : 'No scores yet',
      `${stats.games || 0} games, ${stats.chains || 0} chains`,
    ];
  } catch { return ['SILT save']; }
};

export const cloud = syncLocalKeys({
  gameId: 'silt',
  keys: SAVE_KEYS,
  describe,
  nudge: 'callout',                 // a non-blocking pill, never a modal
  canPester: () => !playing,        // only on menus, attract and results
});

export function setPlaying(v) { playing = !!v; }

export function gameFinished() {
  try { cloud.matchCompleted(); } catch (e) { /* offline: nothing to do */ }
}

export function checkpoint() {
  try { cloud.checkpoint && cloud.checkpoint(); } catch (e) {}
}

// navigator.vibrate, gated on the player's setting and on the API existing at all.

const PATTERNS = { hit: 8, kill: [0, 14, 30, 22], boom: [0, 26, 40, 40], ui: 6 };

let enabled = true;
const ok = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const haptics = {
  get available() { return ok; },
  setEnabled(v) { enabled = !!v; },
  buzz(pattern = 'hit') {
    if (!ok || !enabled) return;
    try { navigator.vibrate(PATTERNS[pattern] || 8); } catch { /* needs a gesture in some browsers */ }
  },
  stop() { if (ok) { try { navigator.vibrate(0); } catch { /* ignore */ } } },
};

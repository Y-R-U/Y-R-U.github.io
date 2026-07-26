// Touch feedback. A leaf module — everything that wants to buzz the phone
// calls in here, and the setting is read at the point of use so toggling it
// takes effect immediately.

import { profile } from './save.js';

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

// Chrome refuses (and logs) any vibrate before the frame has been touched, so
// the whole thing stays asleep until the first real gesture.
let armed = false;
if (can) {
  const arm = () => { armed = true; };
  window.addEventListener('touchstart', arm, { once: true, passive: true });
  window.addEventListener('pointerdown', arm, { once: true });
  window.addEventListener('keydown', arm, { once: true });
}

// Named patterns rather than raw milliseconds, so the whole game's feedback
// vocabulary is visible in one place and easy to retune.
const PATTERNS = {
  fire: 18,
  bigfire: 34,
  hit: 12,
  kill: [22, 40, 22],
  hurt: [0, 26, 30, 26],
  lock: 8,
  ui: 6,
};

export function thump(kind = 'ui') {
  if (!can || !armed) return;
  if (!profile.settings.haptics) return;
  const p = PATTERNS[kind];
  if (p == null) return;
  try { navigator.vibrate(p); } catch (e) { /* some browsers throw when hidden */ }
}

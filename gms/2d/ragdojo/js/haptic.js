// Vibration feedback. Optional in every sense: unsupported on desktop and on iOS Safari,
// off unless the player has it enabled, and silently a no-op in both cases.

export const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let on = true;
export function setEnabled(v) { on = !!v; if (!on) stop(); }

function fire(pattern) {
  if (!on || !supported) return;
  // A vibrate() call throws in some embedded webviews rather than returning false.
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}
export function stop() { if (supported) { try { navigator.vibrate(0); } catch { /* ignore */ } } }

export const tap = () => fire(8);            // a button, a menu row
export const gesture = () => fire(14);       // a special move recognised
export const hit = (power = 1) => fire(Math.round(7 + power * 9));   // you connected
export const took = (power = 1) => fire(Math.round(14 + power * 16)); // you got hit
export const down = () => fire([30, 40, 55]);  // knocked off your feet
export const ko = () => fire([40, 50, 40, 50, 90]);
export const win = () => fire([18, 60, 18, 60, 90]);

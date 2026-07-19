// Vibration feedback. navigator.vibrate is Android/Chrome only — iOS Safari has no
// equivalent, so on iPhones every call here is a silent no-op. supportsHaptics()
// lets the settings screen say so honestly instead of showing a toggle that does nothing.
let on = true;
let silent = false;   // set while the menu attract-mode match plays

export function setHaptics(v) { on = !!v; }
export function hapticsOn() { return on; }
export function supportsHaptics() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}
export function setHapticsSilent(v) { silent = !!v; }

function buzz(pattern) {
  if (!on || silent || !supportsHaptics()) return;
  try { navigator.vibrate(pattern); } catch (e) { /* blocked by the browser */ }
}

export const haptic = {
  tap()       { buzz(8); },                    // UI button press
  hit(q)      { buzz(q >= 1 ? 22 : q >= 0.45 ? 13 : 8); },   // racket contact, by timing
  perfect()   { buzz([0, 14, 30, 22]); },      // double-pulse on a PERFECT swing
  serve()     { buzz(16); },
  pointWon()  { buzz([0, 18, 40, 18]); },
  pointLost() { buzz(45); },
  ace()       { buzz([0, 25, 45, 25, 45, 55]); },
  gameWon()   { buzz([0, 30, 50, 30, 50, 60]); },
  matchWon()  { buzz([0, 45, 60, 45, 60, 45, 60, 120]); },
  matchLost() { buzz(220); },
};

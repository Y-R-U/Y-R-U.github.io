// The game's own day (DESIGN W18): a compressed ~20 min cycle driven by game time (simTime), never the phone's clock.
// A fresh save (t = 0) boots in golden hour. Pure: callers pass seconds, nothing reads the wall clock.
// Cycle fractions: golden 0–0.15, dusk 0.15–0.19, night 0.19–0.40, dawn 0.40–0.46, day 0.46–1.
export const CYCLE_SEC = 1200;
export const BOOT_F = 0.02;
// [cycle fraction, virtual hour] — the renderer's palette keys (palette.js DAY_KEYS) are written in these hours.
const MAP = [[0, 15.5], [0.15, 19], [0.19, 21.2], [0.40, 29], [0.46, 32.5], [1, 39.5]];
export const PHASES = [[0, 'golden'], [0.15, 'dusk'], [0.19, 'night'], [0.40, 'dawn'], [0.46, 'day']];

export function cycleF(sec, cycle = CYCLE_SEC) {
  const f = ((sec || 0) / cycle + BOOT_F) % 1;
  return f < 0 ? f + 1 : f;
}

// Virtual hour 0..24 for a cycle fraction.
export function hourAtF(f) {
  let i = 0;
  while (i < MAP.length - 2 && f >= MAP[i + 1][0]) i++;
  const [f0, h0] = MAP[i], [f1, h1] = MAP[i + 1];
  return (h0 + (h1 - h0) * Math.min(1, Math.max(0, (f - f0) / (f1 - f0)))) % 24;
}

export function phaseAtF(f) {
  let p = PHASES[0][1];
  for (const [f0, k] of PHASES) if (f >= f0) p = k;
  return p;
}

// Everything a consumer needs: { f, hour, phase, night (bool: dusk end → dawn), golden (bool) }.
export function gameClock(sec, cycle = CYCLE_SEC) {
  const f = cycleF(sec, cycle), hour = hourAtF(f), phase = phaseAtF(f);
  return { f, hour, phase, night: f >= 0.17 && f < 0.42, golden: phase === 'golden' };
}

// Game hour for E/U: same as gameClock(sec).hour (18:00–06:00 windows keep working on it).
export const gameHour = (sec, cycle = CYCLE_SEC) => hourAtF(cycleF(sec, cycle));

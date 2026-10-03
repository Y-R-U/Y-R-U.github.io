// W18 game clock for the economy: lane A's pure clock (data/clock.js) on game seconds, plus the Witching Hour.
// The renderer reads the same gameClock(game.simTime), or injects its own with game.setDayClock(fn).
import { gameClock, CYCLE_SEC } from '../data/clock.js?v=20261004e';

export function dayAt(sec, D) {
  const c = gameClock(sec);
  const [n0, n1] = D.night;
  const p01 = c.night ? Math.min(1, Math.max(0, (c.f - n0) / (n1 - n0))) : 0;
  return { phase: c.phase, hour: c.hour, f: c.f, night: c.night, golden: c.golden, p01, witching: c.night && p01 < D.witching, cycleSec: CYCLE_SEC };
}

// Normalises whatever an injected clock returns: a gameClock()-shaped object, {phase}, {night}, or a 0–24 hour.
export function readClock(v, D) {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    const h = ((v % 24) + 24) % 24;
    const night = h >= 21 || h < 5;
    return { phase: night ? 'night' : 'day', hour: h, night, witching: night && h >= 21, injected: true };
  }
  if (typeof v === 'object') {
    const night = v.night ?? v.phase === 'night';
    const p01 = v.p01 ?? (night && v.f != null ? (v.f - D.night[0]) / (D.night[1] - D.night[0]) : null);
    return { ...v, phase: v.phase || (night ? 'night' : 'day'), night: !!night, witching: !!(v.witching ?? (night && p01 != null && p01 < D.witching)), injected: true };
  }
  return null;
}

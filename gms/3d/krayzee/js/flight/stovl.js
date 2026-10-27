// F-35B STOVL (D35): difficulty tuning, the hover-command mapping, landing-pad search and the context button's choice.
// Pure (no three, no DOM): the flight core, the autopilot, main.js and tools/stovl-sim.mjs all share it. docs/STOVL.md.
import { clamp } from './vmath.js';

// heat: seconds of jet-borne hover before the engine runs hot (0 = never); gust: drift wind amplitude (m/s);
// comp: how much of that drift the flight computer cancels by itself; hold/land: autopilot position gains (1/s, 0 =
// hands-off drift); db: throttle-lever dead band round the middle; sink: last-metres sink rate of LAND HERE (m/s);
// autoLever: a lever let go in a hover goes back to AUTO (height hold) by itself; cushion: the computer slows any
// descent near the ground to a safe touchdown, whatever the lever says.
export const LEVELS = {
  easy: { heat: 0, gust: 0, comp: 1, hold: 0.5, land: 0.55, db: 0.12, sink: 1.1, autoLever: true, cushion: true },
  medium: { heat: 180, gust: 1.6, comp: 0.6, hold: 0.3, land: 0.4, db: 0.08, sink: 1.4, autoLever: true, cushion: true },
  hard: { heat: 70, gust: 3.2, comp: 0, hold: 0, land: 0.16, db: 0.03, sink: 1.9, autoLever: false, cushion: false },
};
export const level = (d) => LEVELS[d] || LEVELS.easy;

// Throttle lever in a hover = vertical speed command: middle holds height, up climbs, down sinks.
export function leverToVs(t, S, lv) {
  const d = t - 0.5, db = lv.db;
  if (Math.abs(d) <= db) return 0;
  const f = (Math.abs(d) - db) / (0.5 - db);
  return d > 0 ? f * S.vsUp : -f * S.vsDown;
}
export function vsToLever(vs, S, lv) {
  if (Math.abs(vs) < 0.02) return 0.5;
  const f = clamp(Math.abs(vs) / (vs > 0 ? S.vsUp : S.vsDown), 0, 1);
  return 0.5 + Math.sign(vs) * (lv.db + 0.004 + f * (0.5 - lv.db - 0.004));
}

// Deterministic drift wind for a hover (m/s, world x/z): a steady push with a slow wander, per aircraft.
export function gustAt(t, amp, seed = 0) {
  if (!amp) return [0, 0];
  const a = 0.9 + seed * 2.1, m = amp * (0.75 + 0.25 * Math.sin(0.11 * t + seed));
  const w = 0.35 * Math.sin(0.07 * t + 1.3 * seed);
  return [Math.sin(a + w) * m, -Math.cos(a + w) * m];
}

// Is (x, z) a flat, clear spot for a vertical landing? env: { groundHeightAt, surfaceAt, colliders, treeTop }.
// avoid: [[x, z, r], ...] (parked aircraft). → true | a short reason.
const OK_SURF = new Set(['grass', 'runway', 'taxiway', 'apron']);
export function padCheck(env, x, z, { avoid = [], r = 13 } = {}) {
  const s = env.surfaceAt?.(x, z) ?? 'grass';
  if (!OK_SURF.has(s)) return s === 'water' ? 'water below' : 'buildings below';
  const h0 = env.groundHeightAt(x, z);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (Math.abs(env.groundHeightAt(px, pz) - h0) > 1.6) return 'too steep';
    const ps = env.surfaceAt?.(px, pz);
    if (ps === 'water' || ps === 'building') return ps === 'water' ? 'water below' : 'buildings below';
  }
  for (const b of env.colliders || []) if (x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r) return 'buildings below';
  if (env.treeTop && env.treeTop(x, z, r) > -1e8) return 'trees below';
  for (const [ax, az, ar] of avoid) if (Math.hypot(ax - x, az - z) < r + (ar ?? 15)) return 'aircraft below';
  return true;
}

// The nearest clear pad to (x, z) within maxR (spiral search): { x, z, d } or { fail: reason }.
export function findPad(env, x, z, { maxR = 160, avoid = [] } = {}) {
  const here = padCheck(env, x, z, { avoid });
  if (here === true) return { x, z, d: 0 };
  for (let rr = 15; rr <= maxR; rr += 15) {
    const n = Math.max(8, Math.round(rr / 7));
    let best = null;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (padCheck(env, px, pz, { avoid }) === true) { best = { x: px, z: pz, d: rr }; break; }
    }
    if (best) return best;
  }
  return { fail: here };
}

// Speeds/heights where HOVER is offered: slow enough to convert and low enough to come down in a sensible time.
// With a runway LAND in reach, LAND stays first (HOVER beside it) unless already slowed right down.
export const CONVERT = { maxKt: 300, maxAgl: 900, minAgl: 8, landFirstKt: 110, vtoKt: 100 };

// The context button (D35). s: { stovl, onGround, gsKt, speedKt, agl, crashed, mode (ap stovl mode or null), pad
// (findPad result, hover only), landPlan ({ fail, hint } | plan | null), landActive, prefer (the wing-borne first choice
// shown last, kept while both stay possible: main.js passes it for 1.5 s so the order never swaps under a thumb) }.
// → { key, label, sub, state: 'idle'|'active'|'unavailable', alt: { key, label, sub } | null } | null (normal LAND)
export function contextButton(s) {
  if (!s.stovl || s.crashed) return null;
  const m = s.mode;
  if (m === 'land') return { key: 'cancel', label: 'LANDING HERE…', sub: 'tap to stop and hover', state: 'active', alt: null };
  if (m === 'landed') return { key: 'none', label: 'TOUCHDOWN', sub: '', state: 'active', alt: null };
  if (m === 'flyon') return { key: 'hover', label: 'FLYING ON…', sub: 'tap to hover again', state: 'active', alt: null };
  if (m === 'convert') return { key: 'flyon', label: 'SLOWING TO HOVER…', sub: 'tap to fly on instead', state: 'active', alt: null };
  if (s.onGround) {
    if (m === 'vto') return { key: 'none', label: 'LIFTING…', sub: '', state: 'active', alt: null };
    if (s.gsKt > CONVERT.vtoKt) return { key: 'none', label: 'VERTICAL TAKEOFF', sub: 'too fast', state: 'unavailable', alt: null };
    return { key: 'vto', label: 'VERTICAL TAKEOFF', sub: s.gsKt > 3 ? 'stops, then straight up' : 'straight up', state: 'idle', alt: null };
  }
  if (m === 'hover' || m === 'vto') {
    const fly = { key: 'flyon', label: 'FLY ON', sub: 'back to wings' };
    if (s.pad && !s.pad.fail) return { key: 'land', label: 'LAND HERE', sub: s.pad.d > 4 ? 'beside you' : 'straight down', state: 'idle', alt: fly };
    return { key: 'land', label: 'LAND HERE', sub: `no: ${s.pad?.fail || 'not clear'}`, state: 'unavailable', alt: fly };
  }
  if (s.landActive) return null;
  const canHover = s.speedKt < CONVERT.maxKt && s.agl < CONVERT.maxAgl && s.agl > CONVERT.minAgl;
  const runway = s.landPlan && !s.landPlan.fail;
  const hover = { key: 'hover', label: 'HOVER', sub: 'stop in the air' };
  if (!canHover) return runway ? null : { key: 'hover', label: 'HOVER', sub: s.agl >= CONVERT.maxAgl ? 'go lower to hover' : 'slow down to hover', state: 'unavailable', alt: null };
  if (runway && (s.prefer === 'landrw' || (s.prefer !== 'hover' && s.speedKt > CONVERT.landFirstKt))) return { key: 'landrw', label: 'LAND', sub: s.landPlan.label || '', state: 'idle', alt: hover };
  return { ...hover, state: 'idle', alt: runway ? { key: 'landrw', label: 'LAND', sub: 'on the runway' } : null };
}

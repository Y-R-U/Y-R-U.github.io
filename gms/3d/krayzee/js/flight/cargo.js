// A6 / D39 Herc ramp drop: the pure part (no THREE): when the drop is offered, the crate's fall under its chute,
// a landing predictor for the button's hint, and the Palace Lawn target. Visuals and wiring: js/world/cargodrop.js.
// Frame: world metres, +Y up, heading 0 = north (-Z).
import palace from '../../data/airports/palace.js';
import { BONUSES } from '../../data/rules.js';

export const DROP = {
  maxKt: 180, minAgl: 40, maxAgl: 900,      // offered only airborne, at or below this speed, in this height band
  rampOpen: 5.2,                           // s: the rig's ramp travel (jetkit: full travel in 5 s)
  slide: 1.1,                              // s: the crate rolls aft down the open ramp, then it is away
  chuteAt: 0.9, chuteOpen: 0.7,            // s after leaving the ramp: canopy starts / is full
  sink: 6.5,                               // m/s under the full canopy
  tauV: 0.6, tauH: 1.4,                    // s: canopy drag time constants (vertical / to the wind horizontally)
  dragFree: 0.04,                          // 1/s: horizontal drag before the chute opens
  reloadStop: 2,                           // s stopped on the ground (gs < 1.5 m/s) to load another hamper
  linger: 25,                              // s a landed hamper stays before it is cleared away
};
// The target: the croquet lawn, where the King is having a picnic (D39). In C-Tower 1's world only.
const LAWN = palace.runways[0].center;
export const TARGETS = [{ id: 'palace_lawn', world: 'royal', name: 'the Palace Lawn', x: LAWN[0], z: LAWN[2] }];

export function targetFor(worldId) { return TARGETS.find((t) => t.world === worldId) || null; }

// s: { herc, airborne, crashed, story, speedKt, agl, loaded, busy } → why the drop is not offered, or null if it is
export function dropBlock(s) {
  if (!s.herc) return 'not a Herc';
  if (s.crashed) return 'crashed';
  if (s.story) return 'story mission';
  if (!s.airborne) return 'on the ground';
  if (!s.loaded && !s.busy) return 'hold empty';
  if (s.speedKt > DROP.maxKt) return 'too fast';
  if (s.agl < DROP.minAgl) return 'too low';
  if (s.agl > DROP.maxAgl) return 'too high';
  return null;
}

// wind: { from (deg), kt } → the air's velocity (m/s), blowing toward from + 180
export function windVel(w) {
  if (!w || !w.kt) return [0, 0];
  const h = ((w.from + 180) * Math.PI) / 180, v = w.kt * 0.5144;
  return [Math.sin(h) * v, -Math.cos(h) * v];
}

export function createCrate(pos, vel) {
  return { x: pos[0], y: pos[1], z: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], t: 0, chute: 0, landed: false, landT: 0 };
}

// one step; ground(x, z) → ground height. Returns true on the step it lands.
export function stepCrate(c, dt, ground, wind = [0, 0]) {
  if (c.landed) { c.landT += dt; return false; }
  c.t += dt;
  c.chute = Math.min(1, Math.max(0, (c.t - DROP.chuteAt) / DROP.chuteOpen));
  const k = c.chute;
  // exact exponential approach, so the coarse predictor agrees with the 60 Hz fall
  if (k > 0) {
    const a = 1 - Math.exp((-k * dt) / DROP.tauH);
    c.vx += (wind[0] - c.vx) * a; c.vz += (wind[1] - c.vz) * a;
  } else {
    const a = Math.exp(-DROP.dragFree * dt);
    c.vx *= a; c.vz *= a;
  }
  c.vy += -9.81 * dt * (1 - k) + (-DROP.sink - c.vy) * (1 - Math.exp((-k * dt) / DROP.tauV));
  c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  const gy = ground(c.x, c.z);
  if (c.y <= gy) { c.y = gy; c.landed = true; c.vx = c.vy = c.vz = 0; return true; }
  return false;
}

// where a crate let go now would come down (coarse steps; ≤ 120 s)
export function predictLanding(pos, vel, ground, wind, dt = 0.1) {
  const c = createCrate(pos, vel);
  for (let i = 0; i < 1200 && !c.landed; i++) stepCrate(c, dt, ground, wind);
  return { x: c.x, z: c.z, t: c.t };
}

export const distTo = (t, x, z) => Math.hypot(x - t.x, z - t.z);

// the button hint: where the lawn is (closed ramp), or where a hamper let go now would land (ramp open)
export function dropHint(s) {
  const t = s.target;
  if (!t) return s.open ? 'anywhere you like' : 'opens the ramp';
  if (s.open && s.pred) {
    const d = distTo(t, s.pred.x, s.pred.z);
    if (d <= BONUSES.cargo_drop.radius * 0.7) return 'ON TARGET · drop now!';   // inside, with room for a thumb's delay
    return d < 3000 ? `lawn ${Math.round(d / 10) * 10} m off` : 'anywhere you like';
  }
  const d = distTo(t, s.x, s.z);
  if (d > 6000) return 'opens the ramp';
  const brg = (Math.atan2(t.x - s.x, -(t.z - s.z)) * 180) / Math.PI, rel = ((brg - s.heading) % 360 + 540) % 360 - 180;
  const side = Math.abs(rel) < 30 ? 'ahead' : Math.abs(rel) > 150 ? 'behind' : rel < 0 ? 'left' : 'right';
  return `lawn ${d >= 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'} ${side}`;
}

// the LAND slot while the drop is offered: LAND stays the main action, the drop rides the second pill (as D35's HOVER)
// s: { offered, phase: 'closed'|'opening'|'open'|'sliding'|'closing'|'empty', landActive, landPlan, hint }
export function cargoContext(s) {
  if (s.landActive) return null;
  const busy = s.phase === 'opening' || s.phase === 'sliding';
  if (!busy && !(s.offered && (s.phase === 'closed' || s.phase === 'open'))) return null;
  const lp = s.landPlan, land = lp && !lp.fail
    ? { key: 'landrw', label: 'LAND', sub: lp.label || '', state: 'idle' }
    : { key: 'landrw', label: 'LAND', sub: lp?.hint || '', state: 'unavailable' };
  let alt;
  if (s.phase === 'closed') alt = { key: 'ramp', label: 'OPEN RAMP', sub: s.hint || '' };
  else if (s.phase === 'opening') alt = { key: 'none', label: 'RAMP OPENING…', sub: s.hint || '' };
  else if (s.phase === 'open') alt = { key: 'drop', label: 'DROP HAMPER', sub: s.hint || '' };
  else alt = { key: 'none', label: 'HAMPER AWAY…', sub: '' };
  return { ...land, alt, kind: 'cargo' };
}

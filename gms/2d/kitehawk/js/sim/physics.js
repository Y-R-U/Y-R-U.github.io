/**
 * Integration, world/SI conversion and the per-tick invariants.
 *
 * The state that matters is SI (metres, m/s). `syncWorld()` derives the world-unit
 * mirror the camera and the renderer read. That direction is the whole of D26: if
 * you ever find yourself authoring a wu number and dividing back, stop.
 *
 * Pure: no DOM, no clock, no Math.random.
 */

import { M_PER_WU } from '../core/math.js';
import { G_SI, CEILING_WU } from '../data/tables.js';
import { forces } from './aero.js';

export const SUBSTEPS = 2;

export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Specific energy in J/kg: the height this aircraft could climb to if it traded all its speed. */
export const specificEnergy = (v, altM) => 0.5 * v * v + G_SI * altM;
/** ARCHITECTURE §8.1 writes it as (1/2)v^2 + g*(-y); -y is altitude. Same quantity. */
export const specificEnergyOf = (e) => specificEnergy(Math.hypot(e.svx, e.svy), -e.sy);

/**
 * One sim step for one aircraft. `qCmd` (rad/s) has already been decided by the
 * control layer, which owns the limiter; physics only integrates it.
 */
export function integrate(a, e, qCmd, throttle, dt) {
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    e.theta = wrapPi(e.theta + qCmd * h);
    // The aircraft owns its force-resolve object and this writes into it. The
    // reference must NOT be reassigned here: `e.aero` is read at the top of the
    // next `flight.update` as the gamma_dot feed-forward, and handing every
    // aircraft a shared buffer is the defect P5 found (aero.js `createForces`).
    const f = forces(a, e.sx, e.sy, e.svx, e.svy, e.theta, throttle, -e.sy, e.roll, e.aero);
    e.svx += f.ax * h;
    e.svy += f.ay * h;
    e.sx += e.svx * h;
    e.sy += e.svy * h;
  }
  e.q = qCmd;
  return e;
}

/** SI -> world units. Called once per tick, after integrate. */
export function syncWorld(e) {
  e.x = e.sx / M_PER_WU;
  e.y = e.sy / M_PER_WU;
  e.vx = e.svx / M_PER_WU;
  e.vy = e.svy / M_PER_WU;
  e.angle = e.theta;
  e.speed = Math.hypot(e.vx, e.vy);
  e.speedSI = Math.hypot(e.svx, e.svy);
  e.altM = -e.sy;
  return e;
}

/**
 * ARCHITECTURE §8.1's per-tick invariants. Returns null or a string naming the
 * first violation; the harness aborts the run with the tick number and state.
 *
 * The speed bound is NOT the literal `Vne * 1.05`. See docs/P4_NOTES.md §7: a
 * full-power vertical dive at the D28 ceiling has a terminal velocity ~12% above
 * its sea-level value because drag scales with density and weight does not, so
 * the literal constant is violated by legal flight and the check would fire on a
 * correct sim. The bound here is the airframe's terminal at the aircraft's own
 * altitude, +5%, which is the same intent evaluated where the aircraft is.
 */
export function checkInvariants(a, e, terminalAt) {
  const nums = [e.sx, e.sy, e.svx, e.svy, e.theta, e.q];
  for (let i = 0; i < nums.length; i++) {
    if (!Number.isFinite(nums[i])) return `non-finite state[${i}] = ${nums[i]}`;
  }
  const v = Math.hypot(e.svx, e.svy);
  if (v < 0) return `negative speed ${v}`;
  const cap = terminalAt(a, Math.max(0, -e.sy)) * 1.05;
  if (v > cap) return `speed ${v.toFixed(2)} m/s over terminal*1.05 (${cap.toFixed(2)}) at ${(-e.sy).toFixed(0)} m`;
  const yWu = e.sy / M_PER_WU;
  if (yWu < CEILING_WU || yWu > 400) return `y ${yWu.toFixed(1)} wu outside [${CEILING_WU}, 400]`;
  if (Math.abs(e.theta) > Math.PI + 1e-9) return `theta ${e.theta} not wrapped`;
  return null;
}

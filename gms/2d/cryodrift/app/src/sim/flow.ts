/**
 * A smooth, slowly-evolving flow field — the medium's currents. Pushes everything
 * (player, enemies, projectiles, motes), so it's a free skill layer AND the
 * background's drifting beauty. Cheap layered sinusoidal "curl"; no state.
 */
export const FLOW_STRENGTH = 46; // accel (px/s²) at full

const S1 = 0.0016;
const S2 = 0.0031;

export function flowAt(x: number, y: number, t: number, out: { x: number; y: number }): void {
  const a =
    Math.sin(x * S1 + t * 0.12) +
    Math.cos(y * S1 * 1.3 - t * 0.09) +
    Math.sin((x + y) * S2 + t * 0.15);
  const b =
    Math.cos(y * S1 - t * 0.11) +
    Math.sin(x * S1 * 1.2 + t * 0.08) +
    Math.cos((x - y) * S2 - t * 0.13);
  // normalize-ish (each term in [-1,1], 3 terms → divide by 3)
  out.x = (a / 3) * FLOW_STRENGTH;
  out.y = (b / 3) * FLOW_STRENGTH;
}

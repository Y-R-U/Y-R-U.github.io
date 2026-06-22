import type { Vec2 } from './Vec2';
import { lerpAngle } from './Vec2';

/**
 * A physical body in the simulation. `prev` holds last step's position so the
 * renderer can interpolate. Plain object → poolable + serializable.
 */
export interface Body {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  heading: number; // radians, visual facing
  radius: number;
}

/** Per-body tuning — player and every enemy run the SAME inertial model with these. */
export interface MoveParams {
  thrust: number;
  drag: number; // velocity retained per second (0..1)
  maxSpeed: number;
  capSoftness: number;
  boostThrustMult: number;
  boostMaxMult: number;
  turnResponse: number;
}

/** A movement command — InputState is a structural superset of this. */
export interface MoveCmd {
  thrustX: number;
  thrustY: number;
  throttle: number;
  boost: boolean;
}

export const makeBody = (x = 0, y = 0, radius = 26): Body => ({
  pos: { x, y },
  prev: { x, y },
  vel: { x: 0, y: 0 },
  heading: 0,
  radius,
});

/** Snapshot the position for interpolation (call once per body per step, before integrating). */
export const rememberPrev = (b: Body): void => {
  b.prev.x = b.pos.x;
  b.prev.y = b.pos.y;
};

/**
 * The inertial flight model (build plan §2). Symplectic Euler on a fixed dt:
 * thrust ADDS to velocity, exponential viscous drag bleeds it off, a SOFT cap
 * reins in cruise speed (boost lifts it), then integrate position.
 * Caller is responsible for rememberPrev() beforehand.
 */
export function stepBody(b: Body, cmd: MoveCmd, p: MoveParams, dt: number): void {
  const boosting = cmd.boost;

  const thrust = p.thrust * (boosting ? p.boostThrustMult : 1) * cmd.throttle;
  b.vel.x += cmd.thrustX * thrust * dt;
  b.vel.y += cmd.thrustY * thrust * dt;

  const retain = Math.pow(p.drag, dt);
  b.vel.x *= retain;
  b.vel.y *= retain;

  const speed = Math.hypot(b.vel.x, b.vel.y);
  const cap = p.maxSpeed * (boosting ? p.boostMaxMult : 1);
  if (speed > cap && speed > 1e-4) {
    const eased = speed + (cap - speed) * p.capSoftness;
    const k = eased / speed;
    b.vel.x *= k;
    b.vel.y *= k;
  }

  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;

  if (speed > 4) {
    b.heading = lerpAngle(b.heading, Math.atan2(b.vel.y, b.vel.x), p.turnResponse);
  }
}

export const speedOf = (b: Body): number => Math.hypot(b.vel.x, b.vel.y);

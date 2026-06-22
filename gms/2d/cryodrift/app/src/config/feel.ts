/**
 * Tunable feel constants — the single place the inertial flight model is dialed.
 *
 * This is a MUTABLE object on purpose: the dev Tweakpane panel binds to it so the
 * feel can be tuned live in the browser (and on a phone) without a rebuild. Once
 * the feel is locked in P0, these numbers become the baseline balance constants.
 *
 * Units: distance in world pixels, time in seconds.
 */
export const FEEL = {
  /** Acceleration applied along the input direction at full throttle (px/s²). */
  thrust: 820,

  /**
   * Viscous drag as the fraction of velocity RETAINED per second while coasting.
   * Applied as vel *= drag^dt, so it is frame-rate independent.
   *   lower  = heavier medium, stops sooner   (toward "instant stop")
   *   higher = thinner medium, drifts further (toward "ice rink")
   * 0.45 ⇒ ~0.85s to bleed off half your speed. The P0 sweet-spot lives near here.
   */
  drag: 0.45,

  /** Soft cap on cruising speed (px/s). Thrust pushes you here; it is not a hard wall. */
  maxSpeed: 540,

  /** How firmly the soft cap reins in over-speed each step (0 = no cap, 1 = hard clamp). */
  capSoftness: 0.18,

  /** Boost ("flagellum overdrive") multipliers — briefly exceed the cruise cap. */
  boostThrustMult: 1.85,
  boostMaxMult: 1.7,

  /** How fast the cell's heading rotates toward its velocity (0..1 per step). Visual only in P0. */
  turnResponse: 0.2,

  /** Max visual bank/lean angle (radians) from lateral velocity. Visual only. */
  bankMaxAngle: 0.5,

  /** Touch joystick geometry (screen px). */
  stickDeadzone: 0.08,
  stickMaxRadius: 95,
};

export type Feel = typeof FEEL;

/** Fixed simulation rate. Render is interpolated between steps. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * The normalized command frame — the ONLY thing the simulation consumes from input.
 * Keeping the sim's contact with input to this one struct is the multiplayer seam
 * (build plan §4/§15): a future networked build swaps the local input source for
 * received command frames without touching sim or render.
 */
export interface InputState {
  thrustX: number; // unit
  thrustY: number;
  throttle: number; // 0..1
  aimX: number; // unit (0,0 = not aiming)
  aimY: number;
  firing: boolean;
  boost: boolean;
  special: boolean;
}

export const emptyInput = (): InputState => ({
  thrustX: 0,
  thrustY: 0,
  throttle: 0,
  aimX: 1,
  aimY: 0,
  firing: false,
  boost: false,
  special: false,
});

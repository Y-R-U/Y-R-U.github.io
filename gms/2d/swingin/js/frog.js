// ============================================================
//  FROG ENTITY
// ============================================================

export const frog = {
  x: 100, y: 300,
  vx: 0, vy: 0,
  angle: 0,
  swinging: false,
  tongue: null,
  grounded: false,
  dead: false,
  eyeBlink: 0,
  mouthOpen: 0,
};

export function resetFrog(startX, startY) {
  frog.x = startX || 100;
  frog.y = startY || 300;
  frog.vx = 0;
  frog.vy = 0;
  frog.swinging = false;
  frog.tongue = null;
  frog.grounded = false;
  frog.dead = false;
  frog.mouthOpen = 0;
}

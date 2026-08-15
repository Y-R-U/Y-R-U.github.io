import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chevronDeg } from './questrunner.js';

// The chevron is what a lost player follows, so the only thing worth asserting is which way ➤
// actually points on screen. rotate(r) aims the glyph r + 90 degrees clockwise of straight up.
const aimsAt = (at, pos, camYaw) => (((chevronDeg(at, pos, camYaw) + 90) % 360) + 360) % 360;

const HERE = { x: 0, z: 0 };

// The camera looks along +(sin camYaw, cos camYaw), and screen-right is the left hand of that:
// looking down +z, right is -x. That mirror is what the old formula got backwards.
test('the chevron points at the target, not away from it', () => {
  assert.equal(aimsAt({ x: 0, z: 10 }, HERE, 0), 0, 'dead ahead reads straight up');
  assert.equal(aimsAt({ x: 0, z: -10 }, HERE, 0), 180, 'behind reads straight down');
});

test('a target to the side reads to that side', () => {
  assert.equal(aimsAt({ x: -10, z: 0 }, HERE, 0), 90, 'facing +z, -x is screen right');
  assert.equal(aimsAt({ x: 10, z: 0 }, HERE, 0), 270, 'facing +z, +x is screen left');
});

test('turning the camera turns the chevron with it', () => {
  const at = { x: 0, z: 10 };
  assert.equal(aimsAt(at, HERE, Math.PI / 2), 90, 'turn to face +x and the target falls right');
  assert.equal(aimsAt(at, HERE, -Math.PI / 2), 270);
  assert.equal(aimsAt(at, HERE, Math.PI), 180, 'turn your back and it reads behind you');
});

// The bug this file exists for: the old formula used +bearing where it needed -bearing, so it read
// correctly only dead ahead and dead behind, and was 90 degrees out at the sides. Following it
// turned you the wrong way, which grew the error, which turned you further — hence circles.
test('a player who steers by the chevron converges instead of orbiting', () => {
  const at = { x: 260, z: -180 };
  let pos = { x: 0, z: 0 }, camYaw = 0;
  let d0 = Math.hypot(at.x, at.z);
  for (let i = 0; i < 400; i++) {
    // Steer toward whatever the chevron says is ahead, then take one step that way.
    const turn = ((aimsAt(at, pos, camYaw) + 180) % 360) - 180;
    camYaw -= turn * Math.PI / 180 * 0.5;
    pos = { x: pos.x + Math.sin(camYaw) * 4, z: pos.z + Math.cos(camYaw) * 4 };
  }
  const d = Math.hypot(at.x - pos.x, at.z - pos.z);
  assert.ok(d < 12, `steering by the chevron should arrive, got ${d.toFixed(1)} m from ${d0.toFixed(0)} m`);
});

// node tools/player_sim_test.mjs — drives the real ctx.player (player.js) headless on the stub world:
// climbing vines, kelp drag, aim-assist stickiness, fixed-step jump height.
import * as THREE from '../../../lib/three/0.180.0/three.module.js';
import { StubWorld } from './player_stubworld.js';
import { BODY } from '../js/player/physics.js';

globalThis.location = { search: '' };
globalThis.innerWidth = 915; globalThis.innerHeight = 412;
const { player } = await import('../js/player/player.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const held = {};
const input = {
  move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, held: { jump: false, crouch: false, primary: false, secondary: false, sprint: false },
  device: 'touch', frame: 0, _p: {}, on() {}, pressed(a) { return this.held[a] && !this._p[a]; }, released() { return false; },
};
const vals = { aimAssist: true, autoJump: true };
const ctx = {
  THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(75, 2, 0.05, 200),
  world: new StubWorld(), input, settings: { get: k => vals[k], set: (k, v) => { vals[k] = v; }, on() {} },
  session: { mode: 'survival', paused: false }, game: {}, bus: { on() {}, emit() {} },
};
player.init(ctx);
const step = (secs, f) => {
  for (let t = 0; t < secs; t += 1 / 60) {
    f?.();
    input.frame++;
    player.update(1 / 60);
    for (const k in input.held) input._p[k] = input.held[k];
    input.look.dx = input.look.dy = 0;
  }
};
const reset = () => { for (const k in input.held) input.held[k] = false; input.move.x = input.move.y = 0; };

// spawn and settle
player.teleport(-20.5, 32.02, -20.5); step(0.3);
ok(player.onGround && Math.abs(player.pos.y - 32) < 1e-6, `settles on ground (${player.pos.y})`);

// jump height is frame-rate independent (fixed step): compare 60 Hz with 10 Hz frames
let peak = 0;
input.held.jump = true; step(0.05); input.held.jump = false;
step(0.6, () => { peak = Math.max(peak, player.pos.y - 32); });
const p60 = peak; peak = 0;
for (let i = 0; i < 12; i++) { input.held.jump = i === 0; input.frame++; player.update(0.1); peak = Math.max(peak, player.pos.y - 32); for (const k in input.held) input._p[k] = input.held[k]; }
ok(Math.abs(p60 - peak) < 0.12 && p60 > 1.15 && p60 < 1.45, `jump peak 60Hz ${p60.toFixed(3)} vs 10Hz ${peak.toFixed(3)}`);
reset(); step(0.5);

// climbing a free vine column (x 20..21, z -20..-19, y 32..40)
player.teleport(20.5, 32.02, -19.5); player.yaw = 0; step(0.2);
ok(player.climbing, 'standing in a vine = climbing');
input.move.y = 1; step(2.0); input.move.y = 0;
ok(player.pos.y > 36.5, `forward climbs up (${player.pos.y.toFixed(2)})`);
input.held.crouch = true; step(0.2);
const yHold = player.pos.y;
step(1.0); input.held.crouch = false;
ok(Math.abs(player.pos.y - yHold) < 0.1, `crouch hangs still (${(player.pos.y - yHold).toFixed(3)})`);
const ySlide = player.pos.y; step(0.5);
ok(player.pos.y < ySlide - 0.6 && player.pos.y > ySlide - 1.6, `slow slide down (${(ySlide - player.pos.y).toFixed(2)} m in 0.5 s)`);
reset(); step(3);
ok(player.onGround, 'slides to the ground');

// kelp drag: swim across the pool at kelp vs open water
const swimSpeed = (x, z) => {
  player.teleport(x, 29.6, z); player.yaw = Math.PI / 2;     // facing -x
  input.move.y = 1; step(0.3);
  const x0 = player.pos.x; step(0.5); const d = Math.abs(player.pos.x - x0); reset(); return d;
};
const open = swimSpeed(12.5, 8.5), inKelp = swimSpeed(18.9, 14.5);
ok(inKelp < open * 0.75, `kelp slows swimming (${inKelp.toFixed(2)} vs ${open.toFixed(2)})`);

// aim assist: a mob slightly off-centre pulls the crosshair on touch, not with a mouse
const mob = { pos: new THREE.Vector3(-20.5 + 0.45, 33, -23.5), def: { h: 1.2 }, dying: false };
ctx.game.mobs = { list: [mob] };
const aimRun = (dev) => {
  input.device = dev; player.teleport(-20.5, 32.02, -20.5); player.yaw = 0; player.pitch = 0; step(0.1);
  const before = player.yaw; step(1.0); return player.yaw - before;
};
const pulledTouch = aimRun('touch'), pulledMouse = aimRun('mouse');
ok(pulledTouch < -0.05 && Math.abs(pulledMouse) < 1e-9, `aim assist pulls toward mob on touch (${pulledTouch.toFixed(3)}) only (${pulledMouse})`);
vals.aimAssist = false;
ok(Math.abs(aimRun('touch')) < 1e-9, 'aimAssist off = no pull');

console.log(`player_sim_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

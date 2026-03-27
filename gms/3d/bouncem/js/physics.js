// ─── Physics: cannon-es world, bodies, collision handling ───

import * as CANNON from 'cannon-es';
import { ARENA } from './config.js';

export let world;
export const BALL_GROUP = 1;
export const BLOCK_GROUP = 2;
export const WALL_GROUP = 4;

// Collision materials
let ballMat, floorMat, wallMat, blockMat;

export function initPhysics() {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -12, 0),
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.solver.iterations = 6;

  // Materials
  ballMat = new CANNON.Material('ball');
  floorMat = new CANNON.Material('floor');
  wallMat = new CANNON.Material('wall');
  blockMat = new CANNON.Material('block');

  // Contact materials
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, floorMat, {
    friction: 0.3,
    restitution: 0.35,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wallMat, {
    friction: 0.1,
    restitution: 0.4,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, blockMat, {
    friction: 0.2,
    restitution: 0.5,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, ballMat, {
    friction: 0.1,
    restitution: 0.6,
  }));

  createWalls();
}

function createWalls() {
  const hw = ARENA.width / 2;
  const hh = ARENA.height / 2;

  // Floor — slightly angled
  const floorBody = new CANNON.Body({
    mass: 0,
    material: floorMat,
    shape: new CANNON.Box(new CANNON.Vec3(hw + 1, 0.5, 4)),
  });
  floorBody.position.set(0, -hh - 0.2, 0);
  // Tilt floor slightly to the right
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -ARENA.floorAngle);
  world.addBody(floorBody);

  // Left wall
  const leftWall = new CANNON.Body({
    mass: 0,
    material: wallMat,
    shape: new CANNON.Box(new CANNON.Vec3(0.5, hh + 2, 4)),
  });
  leftWall.position.set(-hw - 0.5, 0, 0);
  world.addBody(leftWall);

  // Right wall (with opening for suction near bottom)
  const rightWall = new CANNON.Body({
    mass: 0,
    material: wallMat,
    shape: new CANNON.Box(new CANNON.Vec3(0.5, hh + 2, 4)),
  });
  rightWall.position.set(hw + 0.5, 0, 0);
  world.addBody(rightWall);

  // Back wall
  const backWall = new CANNON.Body({
    mass: 0,
    material: wallMat,
    shape: new CANNON.Box(new CANNON.Vec3(hw + 1, hh + 2, 0.5)),
  });
  backWall.position.set(0, 0, -3);
  world.addBody(backWall);

  // Front invisible wall
  const frontWall = new CANNON.Body({
    mass: 0,
    material: wallMat,
    shape: new CANNON.Box(new CANNON.Vec3(hw + 1, hh + 2, 0.5)),
  });
  frontWall.position.set(0, 0, 3);
  world.addBody(frontWall);
}

export function createBallBody(radius, position) {
  const body = new CANNON.Body({
    mass: 1,
    material: ballMat,
    shape: new CANNON.Sphere(radius),
    linearDamping: 0.15,
    angularDamping: 0.3,
  });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  return body;
}

export function createBlockBody(shape, size, position) {
  let cannonShape;
  const hs = size / 2;
  if (shape === 'cylinder') {
    cannonShape = new CANNON.Cylinder(hs, hs, size, 8);
  } else {
    // box (used for box, rounded box, hexagonal)
    cannonShape = new CANNON.Box(new CANNON.Vec3(hs, hs, hs));
  }
  const body = new CANNON.Body({
    mass: 0, // static
    material: blockMat,
    shape: cannonShape,
  });
  body.position.set(position.x, position.y, position.z);
  world.addBody(body);
  return body;
}

export function removeBody(body) {
  world.removeBody(body);
}

export function stepPhysics(dt) {
  world.step(1 / 60, dt, 3);
}

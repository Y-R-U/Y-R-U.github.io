import * as THREE from 'three';
import RAPIER from './vendor/rapier.es.js';

function randomGenerator(seed) {
  return () => { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

export async function createGlass(parent, material) {
  await RAPIER.init({});
  const random = randomGenerator(4371);
  const world = new RAPIER.World({ x: 0, y: -7.8, z: 0 });
  world.timestep = 1 / 60;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, .06, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, .06, 12).setFriction(.7), floor);
  const balcony = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2.49, 0));
  world.createCollider(RAPIER.ColliderDesc.cylinder(.08, 1.38).setFriction(.6), balcony);
  const nodes = [];
  const columns = 6, rows = 5;
  for (let y = 0; y <= rows; y++) {
    nodes[y] = [];
    for (let x = 0; x <= columns; x++) {
      nodes[y][x] = new THREE.Vector2(-.93 + x * 1.86 / columns + (x && x < columns ? (random() - .5) * .16 : 0), 2.67 + y * 1.54 / rows + (y && y < rows ? (random() - .5) * .15 : 0));
    }
  }
  const shards = [], bodies = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = nodes[y][x], b = nodes[y][x + 1], c = nodes[y + 1][x + 1], d = nodes[y + 1][x];
    for (const points of [[a, b, c], [a, c, d]]) {
      const center = points.reduce((v, p) => v.add(p), new THREE.Vector2()).multiplyScalar(1 / 3);
      const shape = new THREE.Shape(points.map(p => p.clone().sub(center)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .003, bevelThickness: .003 });
      geometry.translate(0, 0, -.0225);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(center.x, center.y, .85);
      mesh.castShadow = false; mesh.receiveShadow = true;
      parent.add(mesh);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x, center.y, .85).setLinearDamping(.3).setAngularDamping(.35));
      const hull = RAPIER.ColliderDesc.convexHull(geometry.attributes.position.array);
      world.createCollider(hull.setDensity(1.5).setRestitution(.26).setFriction(.65), body);
      body.setLinvel({ x: center.x * 2.2 + (random() - .5) * 2.6, y: 1 + random() * 2.4, z: 1.2 + random() * 3 }, true);
      body.setAngvel({ x: (random() - .5) * 12, y: (random() - .5) * 12, z: (random() - .5) * 9 }, true);
      shards.push(mesh); bodies.push(body);
    }
  }
  // Record a bounded physical fracture once; timeline sampling never integrates backwards.
  const frameCount = 421, stride = shards.length * 7;
  const frames = new Float32Array(frameCount * stride);
  for (let frame = 0; frame < frameCount; frame++) {
    bodies.forEach((b, i) => {
      const p = b.translation(), q = b.rotation(), o = frame * stride + i * 7;
      frames.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], o);
    });
    world.step();
    if (frame % 90 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  world.free();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.54, .045), material);
  pane.position.set(0, 3.44, .85); parent.add(pane);
  const nextQ = new THREE.Quaternion();
  return {
    shards,
    sample(seconds) {
      pane.visible = seconds <= 0;
      const t = Math.max(0, Math.min(frameCount - 1, seconds * 60));
      const a = Math.floor(t), b = Math.min(a + 1, frameCount - 1), mix = t - a;
      shards.forEach((mesh, i) => {
        mesh.visible = seconds > 0;
        const oa = a * stride + i * 7, ob = b * stride + i * 7;
        mesh.position.set(THREE.MathUtils.lerp(frames[oa], frames[ob], mix), THREE.MathUtils.lerp(frames[oa + 1], frames[ob + 1], mix), THREE.MathUtils.lerp(frames[oa + 2], frames[ob + 2], mix));
        mesh.quaternion.fromArray(frames, oa + 3);
        nextQ.fromArray(frames, ob + 3);
        mesh.quaternion.slerp(nextQ, mix);
      });
    }
  };
}

import * as THREE from 'three';

const canvas = document.getElementById('game-canvas');
const menu = document.getElementById('menu');
const result = document.getElementById('result');
const hud = document.getElementById('hud');
const heatWrap = document.getElementById('heat-wrap');
const heatFill = document.getElementById('heat-fill');
const fireButton = document.getElementById('fire-button');
const stickZone = document.getElementById('stick-zone');
const stickKnob = document.getElementById('stick-knob');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const crowsEl = document.getElementById('crows');
const livesEl = document.getElementById('lives');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const resultTitle = document.getElementById('result-title');
const resultKicker = document.getElementById('result-kicker');
const resultScore = document.getElementById('result-score');
const resultWave = document.getElementById('result-wave');

const state = {
  running: false,
  gameOver: false,
  score: 0,
  wave: 1,
  lives: 3,
  heat: 0,
  fireCooldown: 0,
  nextWaveTimer: 0,
  time: 0,
  pointer: new THREE.Vector2(0, 0),
  aimWorld: new THREE.Vector3(0, 16, -12),
  move: new THREE.Vector2(0, 0),
  keys: new Set(),
  mobileFire: false,
  stickPointer: null,
  stickCenter: { x: 0, y: 0 },
  lastPointerTime: -10
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x405b61);
scene.fog = new THREE.Fog(0x405b61, 38, 132);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -16);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const bullets = [];
const crows = [];
const blasts = [];
const clouds = [];
const scenery = [];

const materials = {
  tank: new THREE.MeshStandardMaterial({ color: 0x526b45, roughness: 0.74, metalness: 0.1 }),
  tankDark: new THREE.MeshStandardMaterial({ color: 0x26301f, roughness: 0.82, metalness: 0.18 }),
  tankTrim: new THREE.MeshStandardMaterial({ color: 0xc4a24d, roughness: 0.55, metalness: 0.1 }),
  crow: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.66, metalness: 0.02 }),
  crowWing: new THREE.MeshStandardMaterial({ color: 0x10100f, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide }),
  eye: new THREE.MeshStandardMaterial({ color: 0xff1c1c, emissive: 0xff0505, emissiveIntensity: 2.2 }),
  bullet: new THREE.MeshStandardMaterial({ color: 0xffd15f, emissive: 0xff7d32, emissiveIntensity: 1.6 }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff6a38 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x556d42, roughness: 0.95 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x5d6258, roughness: 0.9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x60452c, roughness: 0.84 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x304b32, roughness: 0.82 }),
  flower: new THREE.MeshStandardMaterial({ color: 0xd89049, roughness: 0.7 }),
  cloud: new THREE.MeshBasicMaterial({ color: 0xf8f2df, transparent: true, opacity: 0.34 })
};

const geometries = {
  chassis: new THREE.BoxGeometry(2.6, 0.9, 3.5),
  tread: new THREE.BoxGeometry(0.6, 0.58, 3.8),
  turret: new THREE.CylinderGeometry(0.82, 0.98, 0.66, 8),
  barrel: new THREE.CylinderGeometry(0.12, 0.17, 2.65, 8),
  wheel: new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10),
  crowBody: new THREE.ConeGeometry(0.58, 1.18, 7),
  crowHead: new THREE.DodecahedronGeometry(0.36, 0),
  crowWing: new THREE.BufferGeometry(),
  bullet: new THREE.SphereGeometry(0.16, 10, 8),
  blast: new THREE.TetrahedronGeometry(0.24, 0),
  ground: new THREE.CylinderGeometry(42, 48, 2.2, 28),
  rock: new THREE.DodecahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.22, 0.32, 2.1, 6),
  leaf: new THREE.ConeGeometry(1.2, 2.2, 7),
  flower: new THREE.ConeGeometry(0.18, 0.42, 5),
  cloud: new THREE.IcosahedronGeometry(1, 0)
};

geometries.crowWing.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  1.6, 0.1, -0.32,
  0.18, 0.05, 0.92
], 3));
geometries.crowWing.computeVertexNormals();

const tank = createTank();
scene.add(tank.root);

initLighting();
createWorld();
bindInput();
updateHud();
if (new URLSearchParams(window.location.search).get('demo') === '1') {
  startGame();
}
requestAnimationFrame(loop);

function initLighting() {
  scene.add(new THREE.HemisphereLight(0xf8efd2, 0x172016, 1.28));

  const sun = new THREE.DirectionalLight(0xffe4b0, 2.4);
  sun.position.set(-18, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    near: 1,
    far: 95,
    left: -46,
    right: 46,
    top: 46,
    bottom: -46
  });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const redEyeFill = new THREE.PointLight(0xff3322, 1.6, 52);
  redEyeFill.position.set(0, 18, -18);
  scene.add(redEyeFill);
}

function createWorld() {
  const ground = new THREE.Mesh(geometries.ground, materials.ground);
  ground.position.y = -1.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(44.6, 0.22, 6, 60),
    new THREE.MeshStandardMaterial({ color: 0x9c7540, roughness: 0.88 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.02;
  scene.add(rim);

  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const radius = 21 + Math.random() * 21;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) < 8 && z > -8 && z < 14) continue;
    const item = Math.random() > 0.42 ? createTree() : createRock();
    item.position.set(x, 0, z);
    item.rotation.y = Math.random() * Math.PI;
    item.scale.setScalar(0.72 + Math.random() * 0.72);
    scene.add(item);
    scenery.push(item);
  }

  for (let i = 0; i < 36; i++) {
    const flower = new THREE.Mesh(geometries.flower, materials.flower);
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 28;
    flower.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
    flower.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.4);
    flower.castShadow = true;
    scene.add(flower);
  }

  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(geometries.cloud, materials.cloud);
      puff.position.set((j - 1.5) * 1.6, Math.sin(j) * 0.25, Math.cos(j * 1.8) * 0.44);
      puff.scale.setScalar(1.4 + Math.random() * 1.1);
      cloud.add(puff);
    }
    cloud.position.set(-48 + i * 11, 25 + Math.random() * 9, -44 - Math.random() * 18);
    cloud.userData.speed = 0.45 + Math.random() * 0.5;
    clouds.push(cloud);
    scene.add(cloud);
  }
}

function createTank() {
  const root = new THREE.Group();
  root.position.set(0, 0.55, 8);

  const chassis = new THREE.Mesh(geometries.chassis, materials.tank);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  chassis.position.y = 0.42;
  root.add(chassis);

  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(geometries.tread, materials.tankDark);
    tread.position.set(side * 1.38, 0.16, 0);
    tread.castShadow = true;
    tread.receiveShadow = true;
    root.add(tread);

    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Mesh(geometries.wheel, materials.tankTrim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.72, 0.16, -1.35 + i * 0.9);
      wheel.castShadow = true;
      root.add(wheel);
    }
  }

  const turretPivot = new THREE.Group();
  turretPivot.position.y = 1.06;
  root.add(turretPivot);

  const turret = new THREE.Mesh(geometries.turret, materials.tank);
  turret.castShadow = true;
  turret.position.y = 0.16;
  turretPivot.add(turret);

  const barrel = new THREE.Mesh(geometries.barrel, materials.tankDark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.25, -1.42);
  barrel.castShadow = true;
  turretPivot.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.25, -2.9);
  turretPivot.add(muzzle);

  return {
    root,
    turretPivot,
    muzzle,
    velocity: new THREE.Vector3(),
    yaw: 0,
    turretYaw: 0
  };
}

function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(geometries.trunk, materials.trunk);
  trunk.position.y = 1;
  trunk.castShadow = true;
  tree.add(trunk);

  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(geometries.leaf, materials.leaf);
    leaf.position.y = 2 + i * 0.72;
    leaf.scale.setScalar(1.08 - i * 0.2);
    leaf.castShadow = true;
    tree.add(leaf);
  }
  return tree;
}

function createRock() {
  const rock = new THREE.Mesh(geometries.rock, materials.rock);
  rock.position.y = 0.42;
  rock.scale.set(1.2, 0.62, 0.86);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function createCrow(wave, index) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(geometries.crowBody, materials.crow);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(geometries.crowHead, materials.crow);
  head.position.set(0, 0.06, -0.64);
  head.castShadow = true;
  root.add(head);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.42, 4),
    new THREE.MeshStandardMaterial({ color: 0x262016, roughness: 0.7 })
  );
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.05, -1.0);
  root.add(beak);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(geometries.crowWing, materials.crowWing);
    wing.scale.x = side;
    wing.position.set(side * 0.2, 0, -0.08);
    wing.userData.side = side;
    root.add(wing);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), materials.eye);
    eye.position.set(side * 0.13, 0.17, -0.92);
    root.add(eye);
  }

  const angle = (index * 1.92 + Math.random() * 1.2) % (Math.PI * 2);
  const radius = 28 + Math.random() * 14;
  root.position.set(Math.cos(angle) * radius, 13 + Math.random() * 9, Math.sin(angle) * radius - 8);
  root.scale.setScalar(0.92 + Math.random() * 0.2 + wave * 0.018);

  const crow = {
    root,
    hp: wave > 4 && Math.random() > 0.55 ? 2 : 1,
    radius: 0.8,
    speed: 4.5 + wave * 0.42 + Math.random() * 1.2,
    orbit: angle,
    wobble: Math.random() * 20,
    diveTimer: 1.4 + Math.random() * 3.4,
    damageCooldown: 0
  };
  scene.add(root);
  crows.push(crow);
}

function bindInput() {
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (event) => {
    state.keys.add(event.code);
    if ((event.code === 'Space' || event.code === 'Enter') && !state.running && !menu.classList.contains('hidden')) {
      startGame();
    }
    if (event.code === 'Space') {
      event.preventDefault();
      tryFire();
    }
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));

  window.addEventListener('pointermove', (event) => {
    state.lastPointerTime = performance.now() / 1000;
    state.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    updateAimFromPointer();
  }, { passive: true });

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.running) return;
    state.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    updateAimFromPointer();
    tryFire();
  });

  startButton.addEventListener('click', startGame);
  restartButton.addEventListener('click', startGame);

  fireButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.mobileFire = true;
    tryFire();
  });
  fireButton.addEventListener('pointerup', () => {
    state.mobileFire = false;
  });
  fireButton.addEventListener('pointercancel', () => {
    state.mobileFire = false;
  });

  stickZone.addEventListener('pointerdown', (event) => {
    state.stickPointer = event.pointerId;
    stickZone.setPointerCapture(event.pointerId);
    const rect = stickZone.getBoundingClientRect();
    state.stickCenter.x = rect.left + rect.width / 2;
    state.stickCenter.y = rect.top + rect.height / 2;
    updateStick(event);
  });
  stickZone.addEventListener('pointermove', (event) => {
    if (event.pointerId === state.stickPointer) updateStick(event);
  });
  stickZone.addEventListener('pointerup', resetStick);
  stickZone.addEventListener('pointercancel', resetStick);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateStick(event) {
  const dx = event.clientX - state.stickCenter.x;
  const dy = event.clientY - state.stickCenter.y;
  const length = Math.min(Math.hypot(dx, dy), 48);
  const angle = Math.atan2(dy, dx);
  const x = Math.cos(angle) * length;
  const y = Math.sin(angle) * length;
  stickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  state.move.set(x / 48, y / 48);
}

function resetStick(event) {
  if (event && event.pointerId !== state.stickPointer) return;
  state.stickPointer = null;
  state.move.set(0, 0);
  stickKnob.style.transform = 'translate(-50%, -50%)';
}

function startGame() {
  clearEntities();
  tank.root.position.set(0, 0.55, 8);
  tank.velocity.set(0, 0, 0);
  tank.yaw = 0;
  tank.root.rotation.y = 0;
  tank.turretPivot.rotation.y = 0;

  Object.assign(state, {
    running: true,
    gameOver: false,
    score: 0,
    wave: 1,
    lives: 3,
    heat: 0,
    fireCooldown: 0,
    nextWaveTimer: 0,
    time: 0,
    mobileFire: false
  });

  menu.classList.add('hidden');
  result.classList.add('hidden');
  hud.classList.remove('hidden');
  heatWrap.classList.remove('hidden');
  fireButton.classList.remove('hidden');
  stickZone.classList.remove('hidden');
  spawnWave();
  updateHud();
}

function clearEntities() {
  for (const collection of [bullets, crows, blasts]) {
    while (collection.length) {
      const item = collection.pop();
      scene.remove(item.root || item.mesh);
    }
  }
}

function spawnWave() {
  const count = Math.min(8 + state.wave * 2, 26);
  for (let i = 0; i < count; i++) createCrow(state.wave, i);
  state.nextWaveTimer = 0;
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.033);
  state.time += dt;

  if (state.running) updateGame(dt);
  updateClouds(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateGame(dt) {
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.heat = Math.max(0, state.heat - dt * 0.31);

  updateMovement(dt);
  updateAimFromPointer();
  updateTankTurret(dt);

  if (state.mobileFire || state.keys.has('Space')) tryFire();

  updateBullets(dt);
  updateCrows(dt);
  updateBlasts(dt);
  checkCollisions();

  if (crows.length === 0) {
    state.nextWaveTimer += dt;
    if (state.nextWaveTimer > 1.15) {
      state.wave += 1;
      spawnWave();
    }
  }

  updateHud();
}

function updateMovement(dt) {
  const keyboard = new THREE.Vector2(
    Number(state.keys.has('KeyD') || state.keys.has('ArrowRight')) - Number(state.keys.has('KeyA') || state.keys.has('ArrowLeft')),
    Number(state.keys.has('KeyS') || state.keys.has('ArrowDown')) - Number(state.keys.has('KeyW') || state.keys.has('ArrowUp'))
  );
  const move = keyboard.lengthSq() > 0 ? keyboard : state.move;
  if (move.lengthSq() > 1) move.normalize();

  const speed = 15;
  const desired = tmpVec.set(move.x * speed, 0, move.y * speed);
  tank.velocity.lerp(desired, 1 - Math.pow(0.001, dt));
  tank.root.position.addScaledVector(tank.velocity, dt);

  const radius = Math.hypot(tank.root.position.x, tank.root.position.z);
  if (radius > 34) {
    tank.root.position.x *= 34 / radius;
    tank.root.position.z *= 34 / radius;
    tank.velocity.multiplyScalar(0.25);
  }

  if (tank.velocity.lengthSq() > 0.4) {
    const targetYaw = Math.atan2(tank.velocity.x, tank.velocity.z);
    tank.yaw = dampAngle(tank.yaw, targetYaw, 8, dt);
    tank.root.rotation.y = tank.yaw;
  }
}

function updateAimFromPointer() {
  raycaster.setFromCamera(state.pointer, camera);
  const hit = raycaster.ray.intersectPlane(aimPlane, tmpVec2);
  if (hit) state.aimWorld.copy(hit);
  const nearest = getNearestCrow();
  if (nearest && !hasPointerMovedRecently()) {
    state.aimWorld.copy(nearest.root.position);
  }
}

function hasPointerMovedRecently() {
  return performance.now() / 1000 - state.lastPointerTime < 3;
}

function getNearestCrow() {
  let nearest = null;
  let nearestDist = Infinity;
  for (const crow of crows) {
    const dist = crow.root.position.distanceToSquared(tank.root.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = crow;
    }
  }
  return nearest;
}

function updateTankTurret(dt) {
  tank.root.worldToLocal(tmpVec.copy(state.aimWorld));
  const targetYaw = Math.atan2(tmpVec.x, tmpVec.z);
  tank.turretYaw = dampAngle(tank.turretYaw, targetYaw, 12, dt);
  tank.turretPivot.rotation.y = tank.turretYaw;
}

function tryFire() {
  if (!state.running || state.fireCooldown > 0 || state.heat > 0.96) return;
  state.fireCooldown = 0.13;
  state.heat = Math.min(1, state.heat + 0.12);

  const muzzle = tank.muzzle.getWorldPosition(new THREE.Vector3());
  const direction = state.aimWorld.clone().sub(muzzle).normalize();
  if (direction.y < 0.12) direction.y = 0.24;
  direction.normalize();

  const mesh = new THREE.Mesh(geometries.bullet, materials.bullet);
  mesh.position.copy(muzzle);
  mesh.castShadow = true;
  scene.add(mesh);

  bullets.push({
    mesh,
    velocity: direction.multiplyScalar(62),
    life: 1.45
  });

  addBlast(muzzle, 5, 0.45, 0xffd15f);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.life -= dt;
    bullet.velocity.y -= dt * 2.4;
    bullet.mesh.position.addScaledVector(bullet.velocity, dt);
    bullet.mesh.scale.setScalar(1 + Math.sin(state.time * 48) * 0.12);
    if (bullet.life <= 0 || bullet.mesh.position.length() > 96) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateCrows(dt) {
  for (let i = crows.length - 1; i >= 0; i--) {
    const crow = crows[i];
    crow.wobble += dt * (8 + state.wave * 0.28);
    crow.orbit += dt * (0.18 + state.wave * 0.012);
    crow.damageCooldown = Math.max(0, crow.damageCooldown - dt);

    const toTank = tmpVec.copy(tank.root.position).sub(crow.root.position);
    toTank.y += 8;
    const dive = crow.diveTimer <= 0;
    const orbitTarget = tmpVec2.set(
      Math.cos(crow.orbit) * (18 + Math.sin(crow.wobble * 0.3) * 9),
      15 + Math.sin(crow.wobble * 0.42) * 5 + state.wave * 0.08,
      Math.sin(crow.orbit) * 22 - 5
    );

    if (dive) {
      toTank.normalize();
      crow.root.position.addScaledVector(toTank, dt * crow.speed * 1.4);
      if (crow.root.position.y < 3.2 || crow.root.position.distanceTo(tank.root.position) < 2.2) {
        damageTank(crow.root.position);
        removeCrow(i, false);
        continue;
      }
    } else {
      crow.root.position.lerp(orbitTarget, dt * 0.42);
      crow.diveTimer -= dt;
    }

    if (crow.diveTimer < -1.2) crow.diveTimer = 2.2 + Math.random() * 3.3;

    const flyDir = dive ? toTank : orbitTarget.clone().sub(crow.root.position);
    if (flyDir.lengthSq() > 0.01) {
      flyDir.normalize();
      crow.root.rotation.y = Math.atan2(flyDir.x, flyDir.z);
      crow.root.rotation.z = Math.sin(crow.wobble) * 0.2;
    }

    const flap = Math.sin(crow.wobble * 2.7) * 0.95;
    for (const child of crow.root.children) {
      if (child.userData.side) child.rotation.z = flap * child.userData.side;
    }
  }
}

function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const p = blasts[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.velocity.y -= dt * 4;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.scale.multiplyScalar(1 + dt * 1.5);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      blasts.splice(i, 1);
    }
  }
}

function checkCollisions() {
  for (let b = bullets.length - 1; b >= 0; b--) {
    const bullet = bullets[b];
    for (let c = crows.length - 1; c >= 0; c--) {
      const crow = crows[c];
      if (bullet.mesh.position.distanceToSquared(crow.root.position) < 1.25) {
        scene.remove(bullet.mesh);
        bullets.splice(b, 1);
        crow.hp -= 1;
        crow.damageCooldown = 0.2;
        addBlast(crow.root.position, 12, 0.72, 0xff4b35);
        if (crow.hp <= 0) {
          state.score += 100 + state.wave * 15;
          removeCrow(c, true);
        }
        break;
      }
    }
  }
}

function removeCrow(index, scored) {
  const [crow] = crows.splice(index, 1);
  if (!crow) return;
  if (scored) addBlast(crow.root.position, 22, 1, 0xff2a22);
  scene.remove(crow.root);
}

function damageTank(position) {
  if (!state.running || state.gameOver) return;
  state.lives -= 1;
  addBlast(position, 28, 1.15, 0xff2a22);
  addBlast(tank.root.position, 14, 0.72, 0xffc857);
  if (state.lives <= 0) endGame(false);
}

function endGame(won) {
  state.running = false;
  state.gameOver = true;
  resultTitle.textContent = won ? 'Ridge Secured' : 'Tank Overrun';
  resultKicker.textContent = won ? 'sortie complete' : 'sortie failed';
  resultScore.textContent = state.score.toString();
  resultWave.textContent = state.wave.toString();
  hud.classList.add('hidden');
  heatWrap.classList.add('hidden');
  fireButton.classList.add('hidden');
  stickZone.classList.add('hidden');
  result.classList.remove('hidden');
}

function addBlast(position, count, force, color) {
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88
    });
    const mesh = new THREE.Mesh(geometries.blast, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(0.45 + Math.random() * 0.8);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * force * 12,
      Math.random() * force * 10,
      (Math.random() - 0.5) * force * 12
    );
    blasts.push({ mesh, velocity, life: 0.36 + Math.random() * 0.36, maxLife: 0.72 });
  }
}

function updateClouds(dt) {
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 58) cloud.position.x = -58;
  }
}

function updateCamera(dt) {
  const desired = tmpVec.set(
    tank.root.position.x,
    tank.root.position.y + 14,
    tank.root.position.z + 21
  );
  camera.position.lerp(desired, 1 - Math.pow(0.0006, dt));
  const lookAt = tmpVec2.set(tank.root.position.x, 3.2, tank.root.position.z - 4);
  camera.lookAt(lookAt);
}

function updateHud() {
  scoreEl.textContent = state.score.toString();
  waveEl.textContent = state.wave.toString();
  crowsEl.textContent = crows.length.toString();
  livesEl.textContent = '|'.repeat(Math.max(0, state.lives));
  heatFill.style.width = `${Math.round(state.heat * 100)}%`;
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

import * as THREE from 'three';

const canvas = document.getElementById('game-canvas');
const hud = document.getElementById('hud');
const menu = document.getElementById('menu');
const shop = document.getElementById('shop');
const result = document.getElementById('result');
const laneHelper = document.getElementById('lane-helper');
const strengthStat = document.getElementById('strength-stat');
const defenseStat = document.getElementById('defense-stat');
const supportStat = document.getElementById('support-stat');
const runCoinStat = document.getElementById('run-coin-stat');
const progressFill = document.getElementById('progress-fill');
const messageLine = document.getElementById('message-line');
const bankCoins = document.getElementById('bank-coins');
const shopCoins = document.getElementById('shop-coins');
const upgradeList = document.getElementById('upgrade-list');
const resultTitle = document.getElementById('result-title');
const resultKicker = document.getElementById('result-kicker');
const resultDistance = document.getElementById('result-distance');
const resultCoins = document.getElementById('result-coins');
const resultPower = document.getElementById('result-power');
const resultSupport = document.getElementById('result-support');

const startButton = document.getElementById('start-button');
const shopButton = document.getElementById('shop-button');
const shopBackButton = document.getElementById('shop-back-button');
const resetSaveButton = document.getElementById('reset-save-button');
const restartButton = document.getElementById('restart-button');
const resultShopButton = document.getElementById('result-shop-button');

const SAVE_KEY = 'codexGateTankRunnerSaveV1';
const LANES = [-4.8, 0, 4.8];
const ROAD_WIDTH = 16;
const RUN_LENGTH = 245;
const GATE_TYPES = [
  { key: 'strength', label: 'STR', icon: 'MUSCLE', color: 0xffb84f },
  { key: 'defense', label: 'ARM', icon: 'SHIELD', color: 0x54d8ff },
  { key: 'support', label: 'TANK', icon: 'MINI', color: 0x80df75 }
];
const UPGRADES = [
  { key: 'core', name: 'Hotter Cannon', desc: '+1 starting strength and higher shot damage.', max: 6, base: 55 },
  { key: 'armor', name: 'Reactive Armor', desc: '+1 starting defense and stronger collision survival.', max: 6, base: 50 },
  { key: 'bay', name: 'Escort Bay', desc: 'Start with tiny support tanks and keep a wider formation.', max: 4, base: 80 },
  { key: 'magnet', name: 'Coin Magnet', desc: 'Pull coins and glass shards from farther away.', max: 5, base: 45 },
  { key: 'bank', name: 'Salvage Contract', desc: 'Earn more coins from every enemy and finish bonus.', max: 5, base: 70 }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc6d1);
scene.fog = new THREE.Fog(0x8fc6d1, 58, 190);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 360);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const save = loadSave();
const state = {
  running: false,
  ended: false,
  demo: new URLSearchParams(window.location.search).get('demo') === '1',
  distance: 0,
  speed: 18,
  laneX: 0,
  targetX: 0,
  dragActive: false,
  dragPointerId: null,
  keys: new Set(),
  strength: 1,
  defense: 1,
  support: 0,
  peakPower: 1,
  runCoins: 0,
  shotCooldown: 0,
  spawnCursor: 0,
  messageTimer: 0,
  bossSpawned: false,
  bossDefeated: false,
  overdrive: 0,
  lastGate: '',
  gateStreak: 0,
  screenShake: 0
};

const materials = {
  road: new THREE.MeshStandardMaterial({ color: 0x384044, roughness: 0.92 }),
  roadEdge: new THREE.MeshStandardMaterial({ color: 0xd49f50, roughness: 0.78 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x486c4e, roughness: 0.98 }),
  tank: new THREE.MeshStandardMaterial({ color: 0x486c58, roughness: 0.68, metalness: 0.18 }),
  tankDark: new THREE.MeshStandardMaterial({ color: 0x1f2a2d, roughness: 0.76, metalness: 0.2 }),
  tankTrim: new THREE.MeshStandardMaterial({ color: 0xd9b75c, roughness: 0.52, metalness: 0.12 }),
  friendly: new THREE.MeshStandardMaterial({ color: 0x5fb571, roughness: 0.68, metalness: 0.16 }),
  enemy: new THREE.MeshStandardMaterial({ color: 0x9b3532, roughness: 0.7, metalness: 0.16 }),
  enemyDark: new THREE.MeshStandardMaterial({ color: 0x331b1d, roughness: 0.84, metalness: 0.16 }),
  glassGood: new THREE.MeshPhysicalMaterial({
    color: 0x70e4ff,
    roughness: 0.05,
    transmission: 0.45,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  }),
  glassBad: new THREE.MeshPhysicalMaterial({
    color: 0xff756e,
    roughness: 0.08,
    transmission: 0.35,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd15a, roughness: 0.34, metalness: 0.34, emissive: 0x4a2b00, emissiveIntensity: 0.25 }),
  shard: new THREE.MeshStandardMaterial({ color: 0xc9f8ff, roughness: 0.1, metalness: 0.02, transparent: true, opacity: 0.64 }),
  bullet: new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.34, emissive: 0xff8a32, emissiveIntensity: 1.2 }),
  tree: new THREE.MeshStandardMaterial({ color: 0x2f5837, roughness: 0.82 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x65452e, roughness: 0.84 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6b706e, roughness: 0.9 }),
  black: new THREE.MeshBasicMaterial({ color: 0x151a1c }),
  whiteText: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  redText: new THREE.MeshBasicMaterial({ color: 0xff4f49 }),
  greenText: new THREE.MeshBasicMaterial({ color: 0xb6ff9c })
};

const geometries = {
  road: new THREE.BoxGeometry(ROAD_WIDTH, 0.35, 540),
  edge: new THREE.BoxGeometry(0.22, 0.36, 540),
  grass: new THREE.BoxGeometry(90, 0.3, 540),
  chassis: new THREE.BoxGeometry(2.35, 0.72, 3.1),
  tread: new THREE.BoxGeometry(0.48, 0.54, 3.35),
  turret: new THREE.CylinderGeometry(0.72, 0.86, 0.54, 8),
  barrel: new THREE.CylinderGeometry(0.1, 0.15, 2.4, 8),
  wheel: new THREE.CylinderGeometry(0.22, 0.22, 0.09, 10),
  gatePane: new THREE.BoxGeometry(3.95, 3.45, 0.16),
  gatePost: new THREE.BoxGeometry(0.18, 3.9, 0.18),
  enemy: new THREE.BoxGeometry(2.2, 1.25, 2.4),
  drone: new THREE.TetrahedronGeometry(0.9, 0),
  bullet: new THREE.SphereGeometry(0.16, 10, 8),
  coin: new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18),
  shard: new THREE.TetrahedronGeometry(0.22, 0),
  treeTop: new THREE.ConeGeometry(1.05, 2.1, 7),
  trunk: new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6),
  rock: new THREE.DodecahedronGeometry(0.72, 0),
  boss: new THREE.BoxGeometry(5.8, 2.7, 4.2)
};

const world = new THREE.Group();
const obstacleLayer = new THREE.Group();
const projectileLayer = new THREE.Group();
const effectLayer = new THREE.Group();
scene.add(world, obstacleLayer, projectileLayer, effectLayer);

const bullets = [];
const gates = [];
const enemies = [];
const coins = [];
const shards = [];
const scenery = [];
const supportTanks = [];
let tank = null;

initLighting();
createWorld();
bindInput();
renderShop();
updateMenuCoins();
requestAnimationFrame(loop);
if (state.demo) {
  startGame();
}

function loadSave() {
  const fallback = { coins: 0, upgrades: { core: 0, armor: 0, bay: 0, magnet: 0, bank: 0 }, best: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return {
      coins: Number(parsed?.coins) || 0,
      best: Number(parsed?.best) || 0,
      upgrades: { ...fallback.upgrades, ...(parsed?.upgrades || {}) }
    };
  } catch {
    return fallback;
  }
}

function writeSave() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function initLighting() {
  scene.add(new THREE.HemisphereLight(0xe9f8ff, 0x243322, 1.55));
  const sun = new THREE.DirectionalLight(0xffe3ac, 2.8);
  sun.position.set(-18, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 115, left: -32, right: 32, top: 48, bottom: -32 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);
}

function createWorld() {
  const grass = new THREE.Mesh(geometries.grass, materials.grass);
  grass.position.set(0, -0.26, -165);
  grass.receiveShadow = true;
  world.add(grass);

  const road = new THREE.Mesh(geometries.road, materials.road);
  road.position.set(0, 0, -165);
  road.receiveShadow = true;
  world.add(road);

  for (const x of [-ROAD_WIDTH / 2, ROAD_WIDTH / 2]) {
    const edge = new THREE.Mesh(geometries.edge, materials.roadEdge);
    edge.position.set(x, 0.05, -165);
    edge.receiveShadow = true;
    world.add(edge);
  }

  for (let i = 0; i < 90; i++) {
    const item = Math.random() > 0.38 ? createTree() : createRock();
    const side = Math.random() > 0.5 ? 1 : -1;
    item.position.set(side * (10 + Math.random() * 24), 0.1, 42 - i * 6.2 - Math.random() * 3);
    item.rotation.y = Math.random() * Math.PI;
    item.scale.setScalar(0.7 + Math.random() * 0.85);
    scenery.push(item);
    world.add(item);
  }

  for (let i = 0; i < 22; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.035, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xf0d389, transparent: true, opacity: 0.4 })
    );
    stripe.position.set(0, 0.22, 35 - i * 14);
    world.add(stripe);
  }
}

function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(geometries.trunk, materials.trunk);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let i = 0; i < 2; i++) {
    const top = new THREE.Mesh(geometries.treeTop, materials.tree);
    top.position.y = 1.55 + i * 0.62;
    top.scale.setScalar(1 - i * 0.18);
    top.castShadow = true;
    tree.add(top);
  }
  return tree;
}

function createRock() {
  const rock = new THREE.Mesh(geometries.rock, materials.rock);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function createTank(material = materials.tank, scale = 1) {
  const root = new THREE.Group();
  const chassis = new THREE.Mesh(geometries.chassis, material);
  chassis.position.y = 0.62;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.add(chassis);

  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(geometries.tread, materials.tankDark);
    tread.position.set(side * 1.28, 0.36, 0);
    tread.castShadow = true;
    root.add(tread);
    for (let i = 0; i < 3; i++) {
      const wheel = new THREE.Mesh(geometries.wheel, materials.tankTrim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.55, 0.36, -1 + i);
      wheel.castShadow = true;
      root.add(wheel);
    }
  }

  const turretPivot = new THREE.Group();
  turretPivot.position.y = 1.12;
  root.add(turretPivot);
  const turret = new THREE.Mesh(geometries.turret, material);
  turret.position.y = 0.12;
  turret.castShadow = true;
  turretPivot.add(turret);
  const barrel = new THREE.Mesh(geometries.barrel, materials.tankDark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.18, -1.28);
  barrel.castShadow = true;
  turretPivot.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.18, -2.52);
  turretPivot.add(muzzle);

  root.scale.setScalar(scale);
  return { root, turretPivot, muzzle, barrel, wheels: root.children.filter((child) => child.geometry === geometries.wheel) };
}

function bindInput() {
  startButton.addEventListener('click', startGame);
  restartButton.addEventListener('click', startGame);
  shopButton.addEventListener('click', showShop);
  resultShopButton.addEventListener('click', showShop);
  shopBackButton.addEventListener('click', showMenu);
  resetSaveButton.addEventListener('click', resetSave);

  window.addEventListener('keydown', (event) => {
    state.keys.add(event.key.toLowerCase());
    if (event.key === ' ' && !state.running && !state.ended) startGame();
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.key.toLowerCase()));
  window.addEventListener('resize', resize);

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.running) return;
    event.preventDefault();
    state.dragActive = true;
    state.dragPointerId = event.pointerId;
    steerFromPointer(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.dragActive || event.pointerId !== state.dragPointerId) return;
    event.preventDefault();
    steerFromPointer(event);
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

function endDrag(event) {
  if (state.dragPointerId !== null && event.pointerId !== state.dragPointerId) return;
  state.dragActive = false;
  state.dragPointerId = null;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Capture may already be gone after pointer cancel.
  }
}

function steerFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const normalized = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  state.targetX = clamp((normalized - 0.5) * 15.4, -6.2, 6.2);
}

function startGame() {
  clearRun();
  state.running = true;
  state.ended = false;
  state.distance = 0;
  state.speed = 18 + save.upgrades.core * 0.5;
  state.targetX = 0;
  state.laneX = 0;
  state.strength = 2 + save.upgrades.core + (state.demo ? 4 : 0);
  state.defense = 3 + save.upgrades.armor + (state.demo ? 5 : 0);
  state.support = 0;
  state.peakPower = state.strength + state.defense;
  state.runCoins = 0;
  state.shotCooldown = 0.25;
  state.spawnCursor = 18;
  state.bossSpawned = false;
  state.bossDefeated = false;
  state.overdrive = 0;
  state.lastGate = '';
  state.gateStreak = 0;
  state.screenShake = 0;

  tank = createTank(materials.tank, 1);
  tank.root.position.set(0, 0, 8);
  tank.root.rotation.y = Math.PI;
  scene.add(tank.root);
  const startingSupport = Math.min(3, save.upgrades.bay + (state.demo ? 2 : 0));
  for (let i = 0; i < startingSupport; i++) addSupportTank(false);

  menu.classList.add('hidden');
  shop.classList.add('hidden');
  result.classList.add('hidden');
  hud.classList.remove('hidden');
  laneHelper.classList.remove('hidden');
  setMessage('Pick blue glass for gains. Red glass steals stats.');
  updateHud();
}

function clearRun() {
  for (const support of supportTanks) scene.remove(support.root);
  for (const group of [obstacleLayer, projectileLayer, effectLayer]) {
    while (group.children.length) group.remove(group.children[0]);
  }
  if (tank) {
    scene.remove(tank.root);
    tank = null;
  }
  bullets.length = 0;
  gates.length = 0;
  enemies.length = 0;
  coins.length = 0;
  shards.length = 0;
  supportTanks.length = 0;
}

function showMenu() {
  updateMenuCoins();
  renderShop();
  menu.classList.remove('hidden');
  shop.classList.add('hidden');
  result.classList.add('hidden');
}

function showShop() {
  state.running = false;
  updateMenuCoins();
  renderShop();
  menu.classList.add('hidden');
  result.classList.add('hidden');
  shop.classList.remove('hidden');
}

function resetSave() {
  save.coins = 0;
  save.best = 0;
  for (const upgrade of UPGRADES) save.upgrades[upgrade.key] = 0;
  writeSave();
  updateMenuCoins();
  renderShop();
}

function renderShop() {
  upgradeList.innerHTML = '';
  shopCoins.textContent = formatNumber(save.coins);
  for (const upgrade of UPGRADES) {
    const level = save.upgrades[upgrade.key] || 0;
    const maxed = level >= upgrade.max;
    const cost = getUpgradeCost(upgrade, level);
    const item = document.createElement('div');
    item.className = 'upgrade-item';
    item.innerHTML = `
      <div>
        <div class="upgrade-name">${upgrade.name} <span>${level}/${upgrade.max}</span></div>
        <div class="upgrade-desc">${upgrade.desc}</div>
      </div>
    `;
    const button = document.createElement('button');
    button.className = 'buy-button';
    button.type = 'button';
    button.textContent = maxed ? 'Maxed' : `${cost} coins`;
    button.disabled = maxed || save.coins < cost;
    button.addEventListener('click', () => buyUpgrade(upgrade, cost));
    item.appendChild(button);
    upgradeList.appendChild(item);
  }
}

function buyUpgrade(upgrade, cost) {
  if (save.coins < cost || save.upgrades[upgrade.key] >= upgrade.max) return;
  save.coins -= cost;
  save.upgrades[upgrade.key] += 1;
  writeSave();
  updateMenuCoins();
  renderShop();
}

function getUpgradeCost(upgrade, level) {
  return Math.round(upgrade.base * Math.pow(1.55, level));
}

function updateMenuCoins() {
  bankCoins.textContent = formatNumber(save.coins);
  shopCoins.textContent = formatNumber(save.coins);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  if (state.running) updateGame(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updateGame(dt) {
  state.distance += state.speed * dt;
  state.speed = Math.min(30, state.speed + dt * 0.42);
  state.overdrive = Math.max(0, state.overdrive - dt * 0.24);
  state.screenShake = Math.max(0, state.screenShake - dt * 2.8);
  state.messageTimer = Math.max(0, state.messageTimer - dt);

  handleMovement(dt);
  spawnAhead();
  updateTank(dt);
  updateSupport(dt);
  updateBullets(dt);
  updateGates(dt);
  updateEnemies(dt);
  updateCoins(dt);
  updateShards(dt);
  updateHud();

  if (!state.bossSpawned && state.distance > RUN_LENGTH - 44) spawnBoss();
  if (state.distance >= RUN_LENGTH && enemies.length === 0) endRun(true);
}

function handleMovement(dt) {
  let steer = 0;
  if (state.keys.has('arrowleft') || state.keys.has('a')) steer -= 1;
  if (state.keys.has('arrowright') || state.keys.has('d')) steer += 1;
  if (steer !== 0) state.targetX = clamp(state.targetX + steer * dt * 8.5, -6.2, 6.2);
  state.laneX = damp(state.laneX, state.targetX, 12, dt);
}

function updateTank(dt) {
  if (!tank) return;
  tank.root.position.x = state.laneX;
  tank.root.position.z = 8;
  tank.root.rotation.z = -clamp((state.laneX - tank.root.position.x) * 0.06, -0.18, 0.18);

  const target = findTarget(tank.root.position, 34);
  if (target) {
    aimTurret(tank, target.root.position, dt);
    state.shotCooldown -= dt;
    const fireRate = Math.max(0.12, 0.48 - state.strength * 0.026 - state.overdrive * 0.03);
    if (state.shotCooldown <= 0) {
      shoot(tank, target, state.strength, 1);
      state.shotCooldown = fireRate;
    }
  } else {
    tank.turretPivot.rotation.y = dampAngle(tank.turretPivot.rotation.y, 0, 8, dt);
    state.shotCooldown = Math.min(state.shotCooldown, 0.1);
  }
}

function updateSupport(dt) {
  const spacing = 1.42 + save.upgrades.bay * 0.12;
  supportTanks.forEach((support, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const targetX = clamp(state.laneX + side * spacing * (row + 1), -6.7, 6.7);
    const targetZ = 9.7 + row * 1.25;
    support.root.position.x = damp(support.root.position.x, targetX, 8, dt);
    support.root.position.z = damp(support.root.position.z, targetZ, 8, dt);
    support.root.rotation.y = Math.PI + Math.sin(state.distance * 0.09 + index) * 0.04;
    const target = findTarget(support.root.position, 25);
    if (target) {
      aimTurret(support, target.root.position, dt);
      support.cooldown -= dt;
      if (support.cooldown <= 0) {
        shoot(support, target, Math.max(1, state.strength * 0.46), 0.74);
        support.cooldown = Math.max(0.28, 0.76 - save.upgrades.bay * 0.06);
      }
    }
  });
}

function aimTurret(source, targetPos, dt) {
  const dx = targetPos.x - source.root.position.x;
  const dz = targetPos.z - source.root.position.z;
  const yaw = Math.atan2(dx, dz);
  source.turretPivot.rotation.y = dampAngle(source.turretPivot.rotation.y, yaw, 13, dt);
}

function shoot(source, target, power, scale) {
  const color = bulletColor(power);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.28,
    emissive: color,
    emissiveIntensity: 1.25
  });
  const bullet = new THREE.Mesh(geometries.bullet, material);
  bullet.scale.setScalar(scale);
  source.muzzle.getWorldPosition(bullet.position);
  bullet.userData = {
    target,
    damage: Math.max(1, power * scale),
    life: 1.4,
    velocity: new THREE.Vector3()
  };
  bullets.push(bullet);
  projectileLayer.add(bullet);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const target = bullet.userData.target;
    bullet.userData.life -= dt;
    if (!target || !target.root.parent || bullet.userData.life <= 0) {
      removeFromArray(bullets, i, projectileLayer);
      continue;
    }
    tmpVec.copy(target.root.position).add(new THREE.Vector3(0, 0.8, 0)).sub(bullet.position).normalize();
    bullet.userData.velocity.lerp(tmpVec.multiplyScalar(43), 0.22);
    bullet.position.addScaledVector(bullet.userData.velocity, dt);
    if (bullet.position.distanceTo(target.root.position) < target.radius + 0.42) {
      damageEnemy(target, bullet.userData.damage);
      spawnShardBurst(bullet.position, 3, bullet.material.color.getHex());
      removeFromArray(bullets, i, projectileLayer);
    }
  }
}

function updateGates(dt) {
  for (let i = gates.length - 1; i >= 0; i--) {
    const gate = gates[i];
    gate.root.position.z += state.speed * dt;
    gate.root.children.forEach((child, childIndex) => {
      child.rotation.y = Math.sin(state.distance * 0.06 + childIndex) * 0.045;
    });
    if (!gate.used && gate.root.position.z > 6.4 && gate.root.position.z < 10.8) {
      const panel = gate.panels.find((entry) => Math.abs(state.laneX - entry.x) < 2.15);
      if (panel) applyGate(gate, panel);
    }
    if (gate.root.position.z > 22) {
      removeFromArray(gates, i, obstacleLayer, 'root');
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.root.position.z += (state.speed + enemy.speed) * dt;
    enemy.root.rotation.y += Math.sin(state.distance * 0.04 + i) * dt * 0.35;
    if (enemy.kind === 'drone') {
      enemy.root.position.y = 1.7 + Math.sin(state.distance * 0.16 + enemy.phase) * 0.5;
      enemy.root.rotation.x += dt * 1.6;
    }
    if (enemy.root.position.z > 7.2 && enemy.root.position.z < 10.6 && Math.abs(enemy.root.position.x - state.laneX) < enemy.radius + 1.35) {
      collideEnemy(enemy);
      removeEnemy(i);
      continue;
    }
    if (enemy.root.position.z > 24) {
      removeEnemy(i);
    }
  }
}

function updateCoins(dt) {
  const magnet = 1.7 + save.upgrades.magnet * 0.85;
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += state.speed * dt;
    coin.rotation.y += dt * 5.6;
    coin.rotation.x += dt * 1.8;
    const dist = coin.position.distanceTo(tank.root.position);
    if (dist < magnet + (save.upgrades.magnet > 0 ? 2.1 : 0)) {
      coin.position.lerp(tmpVec.set(state.laneX, 1.25, 8), 0.16 + save.upgrades.magnet * 0.02);
    }
    if (dist < 1.3) {
      state.runCoins += Math.round(1 + save.upgrades.bank * 0.2);
      spawnShardBurst(coin.position, 2, 0xffd15a);
      removeFromArray(coins, i, obstacleLayer);
    } else if (coin.position.z > 24) {
      removeFromArray(coins, i, obstacleLayer);
    }
  }
}

function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const shard = shards[i];
    shard.userData.life -= dt;
    shard.position.addScaledVector(shard.userData.velocity, dt);
    shard.userData.velocity.y -= dt * 8;
    shard.rotation.x += dt * shard.userData.spin.x;
    shard.rotation.y += dt * shard.userData.spin.y;
    shard.material.opacity = Math.max(0, shard.userData.life / 0.75);
    if (shard.userData.life <= 0) removeFromArray(shards, i, effectLayer);
  }
}

function spawnAhead() {
  while (state.spawnCursor < Math.min(RUN_LENGTH - 18, state.distance + 120)) {
    const roll = Math.random();
    if (roll < 0.44) spawnGateSet(-state.spawnCursor);
    else if (roll < 0.76) spawnEnemyWave(-state.spawnCursor);
    else spawnCoinArc(-state.spawnCursor);
    state.spawnCursor += 13 + Math.random() * 10;
  }
}

function spawnGateSet(z) {
  const root = new THREE.Group();
  root.position.z = z;
  const gate = { root, panels: [], used: false };
  const lanes = shuffle([0, 1, 2]).slice(0, Math.random() > 0.72 ? 3 : 2);
  const rareSupport = Math.random() < 0.18 + save.upgrades.bay * 0.015;
  const primary = rareSupport ? 'support' : pick(['strength', 'defense', 'strength', 'defense']);
  const secondary = primary === 'strength' ? 'defense' : 'strength';

  lanes.forEach((laneIndex, panelIndex) => {
    const positive = panelIndex === 0 || Math.random() > 0.42;
    const type = panelIndex === 0 ? primary : (rareSupport && panelIndex === 1 ? 'support' : secondary);
    const amount = type === 'support' ? (positive ? 1 : -1) : randomAmount(positive, type);
    const panel = createGatePanel(LANES[laneIndex], type, amount);
    gate.panels.push({ x: LANES[laneIndex], type, amount, mesh: panel });
    root.add(panel);
  });

  obstacleLayer.add(root);
  gates.push(gate);
}

function createGatePanel(x, type, amount) {
  const good = amount > 0;
  const group = new THREE.Group();
  group.position.x = x;
  const pane = new THREE.Mesh(geometries.gatePane, good ? materials.glassGood : materials.glassBad);
  pane.position.y = 2.1;
  pane.castShadow = true;
  group.add(pane);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(geometries.gatePost, good ? materials.glassGood : materials.glassBad);
    post.position.set(side * 2.05, 2.1, 0);
    post.castShadow = true;
    group.add(post);
  }

  const typeConfig = GATE_TYPES.find((entry) => entry.key === type);
  const label = `${amount > 0 ? '+' : ''}${amount} ${typeConfig.icon}`;
  const text = makeTextSprite(label, good ? '#c7fff0' : '#ffd0cf', good ? 'rgba(12, 80, 72, 0.52)' : 'rgba(110, 18, 22, 0.52)');
  text.position.set(0, 2.2, -0.1);
  text.scale.set(2.7, 1.05, 1);
  group.add(text);

  const glow = new THREE.PointLight(typeConfig.color, good ? 1.1 : 0.7, 9);
  glow.position.set(0, 2.1, 0.4);
  group.add(glow);
  return group;
}

function randomAmount(positive, type) {
  const base = type === 'strength' ? state.strength : state.defense;
  const magnitude = Math.max(1, Math.round(Math.min(8, base * (0.18 + Math.random() * 0.18))));
  return positive ? magnitude : -Math.max(1, Math.ceil(magnitude * 0.75));
}

function applyGate(gate, panel) {
  gate.used = true;
  const oldTotal = state.strength + state.defense + supportTanks.length;
  if (panel.type === 'strength') state.strength = Math.max(1, state.strength + panel.amount);
  if (panel.type === 'defense') state.defense = Math.max(0, state.defense + panel.amount);
  if (panel.type === 'support') {
    if (panel.amount > 0) addSupportTank(true);
    else loseSupportTank();
  }

  if (panel.amount > 0) {
    if (state.lastGate === panel.type) state.gateStreak += 1;
    else state.gateStreak = 1;
    state.lastGate = panel.type;
    if (state.gateStreak >= 3) {
      state.overdrive = Math.min(4, state.overdrive + 1.6);
      setMessage(`${panel.type.toUpperCase()} streak: overdrive fire online`);
    } else {
      setMessage(`${panel.type.toUpperCase()} gate gained ${panel.amount}`);
    }
  } else {
    state.gateStreak = 0;
    setMessage(`${panel.type.toUpperCase()} gate drained ${Math.abs(panel.amount)}`);
  }

  const newTotal = state.strength + state.defense + supportTanks.length;
  if (newTotal > oldTotal) state.runCoins += Math.max(1, Math.floor((newTotal - oldTotal) * 0.8));
  state.peakPower = Math.max(state.peakPower, state.strength + state.defense + supportTanks.length);
  spawnShardBurst(panel.mesh.getWorldPosition(tmpVec), 18, panel.amount > 0 ? 0x80f0ff : 0xff6d68);
  obstacleLayer.remove(gate.root);
}

function addSupportTank(showMessage) {
  if (supportTanks.length >= 2 + save.upgrades.bay * 2) {
    state.runCoins += 8 + save.upgrades.bank;
    if (showMessage) setMessage('Escort bay full: converted mini tank to coins');
    return;
  }
  const support = createTank(materials.friendly, 0.5);
  support.root.position.set(state.laneX, 0, 10.2 + supportTanks.length * 0.7);
  support.root.rotation.y = Math.PI;
  support.cooldown = 0.3 + Math.random() * 0.4;
  supportTanks.push(support);
  scene.add(support.root);
  state.support = supportTanks.length;
  if (showMessage) setMessage('Tiny support tank joined the convoy');
}

function loseSupportTank() {
  const support = supportTanks.pop();
  if (support) {
    spawnShardBurst(support.root.position, 12, 0x7bd66f);
    scene.remove(support.root);
  } else {
    state.defense = Math.max(0, state.defense - 1);
  }
  state.support = supportTanks.length;
}

function spawnEnemyWave(z) {
  const count = Math.random() > 0.68 ? 2 : 1;
  const lanes = shuffle([0, 1, 2]);
  for (let i = 0; i < count; i++) {
    const lane = lanes[i];
    const drone = Math.random() < 0.24;
    const enemy = createEnemy(drone ? 'drone' : 'tank');
    enemy.root.position.set(LANES[lane] + (Math.random() - 0.5) * 0.8, 0, z - i * 4.5);
    obstacleLayer.add(enemy.root);
    enemies.push(enemy);
  }
}

function createEnemy(kind) {
  const root = new THREE.Group();
  const difficulty = 1 + state.distance / 54 + state.peakPower * 0.08;
  let hp = Math.round((kind === 'drone' ? 2.4 : 4.8) * difficulty);
  let radius = kind === 'drone' ? 0.9 : 1.35;
  if (kind === 'boss') {
    hp = Math.round(44 + state.peakPower * 5.4 + supportTanks.length * 7);
    radius = 3.2;
    const body = new THREE.Mesh(geometries.boss, materials.enemy);
    body.position.y = 1.4;
    body.castShadow = true;
    root.add(body);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.62, 7), materials.enemyDark);
    crown.position.y = 3.1;
    crown.castShadow = true;
    root.add(crown);
  } else if (kind === 'drone') {
    const body = new THREE.Mesh(geometries.drone, materials.enemy);
    body.position.y = 1.6;
    body.castShadow = true;
    root.add(body);
    const light = new THREE.PointLight(0xff423b, 1, 8);
    light.position.y = 1.6;
    root.add(light);
  } else {
    const body = new THREE.Mesh(geometries.enemy, materials.enemy);
    body.position.y = 0.82;
    body.castShadow = true;
    root.add(body);
    const turret = new THREE.Mesh(geometries.turret, materials.enemyDark);
    turret.position.y = 1.65;
    turret.castShadow = true;
    root.add(turret);
  }
  const barBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.08), materials.black);
  barBack.position.set(0, kind === 'boss' ? 3.85 : 2.25, 0);
  root.add(barBack);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.09), new THREE.MeshBasicMaterial({ color: 0x7bd66f }));
  bar.position.set(0, kind === 'boss' ? 3.86 : 2.26, -0.02);
  root.add(bar);
  return { root, hp, maxHp: hp, radius, kind, speed: kind === 'drone' ? 2.8 : 1.2, phase: Math.random() * 10, bar };
}

function spawnBoss() {
  state.bossSpawned = true;
  const boss = createEnemy('boss');
  boss.root.position.set(0, 0, -62);
  boss.speed = 0.3;
  obstacleLayer.add(boss.root);
  enemies.push(boss);
  setMessage('Fortress tank ahead. Focus fire.');
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
  enemy.bar.scale.x = ratio;
  enemy.bar.position.x = -(1 - ratio) * 1.25;
  enemy.bar.material.color.setHex(ratio > 0.5 ? 0x7bd66f : ratio > 0.25 ? 0xffd15a : 0xff635d);
  if (enemy.hp <= 0) {
    const index = enemies.indexOf(enemy);
    if (index !== -1) {
      const payout = enemy.kind === 'boss' ? 45 : enemy.kind === 'drone' ? 5 : 8;
      state.runCoins += Math.round(payout * (1 + save.upgrades.bank * 0.16));
      spawnCoinArc(enemy.root.position.z, enemy.root.position.x, enemy.kind === 'boss' ? 16 : 4);
      spawnShardBurst(enemy.root.position, enemy.kind === 'boss' ? 32 : 14, 0xff635d);
      if (enemy.kind === 'boss') state.bossDefeated = true;
      removeEnemy(index);
    }
  }
}

function collideEnemy(enemy) {
  state.screenShake = 0.45;
  if (supportTanks.length && Math.random() < 0.55) {
    loseSupportTank();
    setMessage('Escort intercepted the crash');
    return;
  }
  const hit = enemy.kind === 'boss' ? 5 : enemy.kind === 'drone' ? 1 : 2;
  state.defense -= hit;
  spawnShardBurst(tank.root.position, 14, 0xff635d);
  if (state.defense < 0) {
    endRun(false);
  } else {
    setMessage(`Armor absorbed ${hit} damage`);
  }
}

function spawnCoinArc(z, x = 0, count = 7) {
  for (let i = 0; i < count; i++) {
    const coin = new THREE.Mesh(geometries.coin, materials.coin);
    coin.position.set(x + (i - (count - 1) / 2) * 0.85, 1.05 + Math.sin(i) * 0.35, z - Math.abs(i - count / 2) * 0.35);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    obstacleLayer.add(coin);
    coins.push(coin);
  }
}

function spawnShardBurst(position, count, color) {
  for (let i = 0; i < count; i++) {
    const material = materials.shard.clone();
    material.color.setHex(color);
    const shard = new THREE.Mesh(geometries.shard, material);
    shard.position.copy(position);
    shard.userData = {
      life: 0.45 + Math.random() * 0.35,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8),
      spin: { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12 }
    };
    effectLayer.add(shard);
    shards.push(shard);
  }
}

function findTarget(origin, range) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of enemies) {
    if (enemy.root.position.z > origin.z + 4 || enemy.root.position.z < origin.z - range) continue;
    const dist = enemy.root.position.distanceTo(origin);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best;
}

function updateHud() {
  strengthStat.textContent = formatNumber(state.strength);
  defenseStat.textContent = formatNumber(Math.max(0, state.defense));
  supportStat.textContent = String(supportTanks.length);
  runCoinStat.textContent = formatNumber(state.runCoins);
  progressFill.style.width = `${clamp((state.distance / RUN_LENGTH) * 100, 0, 100)}%`;
  if (state.messageTimer <= 0 && state.running) {
    messageLine.textContent = 'Convoy systems armed. Cannon tracking live targets.';
  }
}

function setMessage(message) {
  messageLine.textContent = message;
  state.messageTimer = 2.4;
}

function endRun(won) {
  if (!state.running) return;
  state.running = false;
  state.ended = true;
  hud.classList.add('hidden');
  laneHelper.classList.add('hidden');
  result.classList.remove('hidden');

  const finishBonus = won ? Math.round(25 + state.peakPower * 1.4 + supportTanks.length * 8) : 0;
  const banked = Math.max(0, state.runCoins + finishBonus);
  save.coins += banked;
  save.best = Math.max(save.best, Math.floor(state.distance));
  writeSave();

  resultKicker.textContent = won ? 'fortress broken' : 'convoy wrecked';
  resultTitle.textContent = won ? 'Run Complete' : 'Armor Failed';
  resultDistance.textContent = `${Math.floor(state.distance)}m`;
  resultCoins.textContent = formatNumber(banked);
  resultPower.textContent = formatNumber(state.peakPower);
  resultSupport.textContent = String(supportTanks.length);
  updateMenuCoins();
  renderShop();
}

function updateCamera(dt) {
  const baseX = tank ? state.laneX * 0.25 : 0;
  const shakeX = (Math.random() - 0.5) * state.screenShake;
  const shakeY = (Math.random() - 0.5) * state.screenShake;
  tmpVec.set(baseX + shakeX, 11.7 + shakeY, 22.5);
  camera.position.lerp(tmpVec, 1 - Math.exp(-dt * 6));
  tmpVec2.set(baseX * 0.22, 1.45, -13.5);
  camera.lookAt(tmpVec2);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function makeTextSprite(text, fill, background) {
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 512;
  textCanvas.height = 192;
  const ctx = textCanvas.getContext('2d');
  ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
  ctx.fillStyle = background;
  roundRect(ctx, 22, 22, 468, 148, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  roundRect(ctx, 22, 22, 468, 148, 28);
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.font = '900 62px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 96);
  const texture = new THREE.CanvasTexture(textCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  return sprite;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function bulletColor(power) {
  if (power >= 18) return 0xff4fca;
  if (power >= 12) return 0x8b6fff;
  if (power >= 8) return 0x54d8ff;
  if (power >= 4) return 0xffd15a;
  return 0xff8b50;
}

function removeEnemy(index) {
  const [enemy] = enemies.splice(index, 1);
  obstacleLayer.remove(enemy.root);
}

function removeFromArray(array, index, parent, prop) {
  const [item] = array.splice(index, 1);
  parent.remove(prop ? item[prop] : item);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function shuffle(values) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatNumber(value) {
  return Math.floor(value).toLocaleString();
}

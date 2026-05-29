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
const modelDebugButton = document.getElementById('model-debug-button');
const modelGallery = document.getElementById('model-gallery');
const modelGalleryClose = document.getElementById('model-gallery-close');
const modelList = document.getElementById('model-list');
const modelPreviewCanvas = document.getElementById('model-preview-canvas');
const modelPreviewName = document.getElementById('model-preview-name');
const modelPreviewMeta = document.getElementById('model-preview-meta');
const modelMemoryStatus = document.getElementById('model-memory-status');
const modelMemoryOutput = document.getElementById('model-memory-output');

const startButton = document.getElementById('start-button');
const shopButton = document.getElementById('shop-button');
const shopBackButton = document.getElementById('shop-back-button');
const resetSaveButton = document.getElementById('reset-save-button');
const restartButton = document.getElementById('restart-button');
const resultShopButton = document.getElementById('result-shop-button');

const SAVE_KEY = 'codexGateTankRunnerSaveV1';
const MODEL_MEMORY_KEY = 'codexGateTankRunnerModelLikesV1';
const LANES = [-4.8, 0, 4.8];
const ROAD_WIDTH = 16;
const RUN_LENGTH_BASE = 820;
const RUN_LENGTH_VARIANCE = 140;
const FINISH_CLEAR_DISTANCE = 26;
const BOSS_APPROACH_DISTANCE = 150;
const WORLD_DEPTH = 1240;
const DPR_CAP = 1.25;
const PLAYER_Z = 2.6;
const PLAYER_MIN_X = -6.2;
const PLAYER_MAX_X = 6.2;
const TARGET_LOCK_RANGE = 88;
const BULLET_MAX_RANGE = 54;
const GATE_TYPES = [
  { key: 'strength', label: 'STR', color: 0xffb84f },
  { key: 'defense', label: 'ARM', color: 0x54d8ff },
  { key: 'support', label: 'TANK', color: 0x80df75 }
];
const UPGRADES = [
  { key: 'core', name: 'Hotter Cannon', desc: '+1 starting strength and higher shot damage.', max: 10, base: 55 },
  { key: 'armor', name: 'Reactive Armor', desc: '+1 starting defense, but enemies scale harder with armor installs.', max: 10, base: 50 },
  { key: 'bay', name: 'Escort Bay', desc: 'Start with tiny support tanks and keep a wider formation.', max: 10, base: 80 },
  { key: 'magnet', name: 'Coin Magnet', desc: 'Each level attracts coins 5% farther across your steering width.', max: 10, base: 45 },
  { key: 'bank', name: 'Salvage Contract', desc: 'Earn more coins from every enemy and finish bonus.', max: 10, base: 70 }
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc6d1);
scene.fog = new THREE.Fog(0x8fc6d1, 58, 190);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 360);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const screenVec = new THREE.Vector3();
const bulletMaterials = new Map();
const gateTextureCache = new Map();
const effectMaterials = new Map();
const previewMaterials = new Map();
const armorTextureCache = new Map();
let lastIdleRender = 0;

const save = loadSave();
const state = {
  running: false,
  ended: false,
  demo: new URLSearchParams(window.location.search).get('demo') === '1',
  distance: 0,
  runLength: RUN_LENGTH_BASE,
  speed: 18,
  laneX: 0,
  targetX: 0,
  dragActive: false,
  dragPointerId: null,
  keys: new Set(),
  strength: 1,
  defense: 1,
  maxDefense: 1,
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
  roadStripe: new THREE.MeshBasicMaterial({ color: 0xf0d389, transparent: true, opacity: 0.38 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x486c4e, roughness: 0.98 }),
  tank: new THREE.MeshStandardMaterial({ color: 0x486c58, roughness: 0.68, metalness: 0.18 }),
  tankDark: new THREE.MeshStandardMaterial({ color: 0x1f2a2d, roughness: 0.76, metalness: 0.2 }),
  tankTrim: new THREE.MeshStandardMaterial({ color: 0xd9b75c, roughness: 0.52, metalness: 0.12 }),
  friendly: new THREE.MeshStandardMaterial({ color: 0x5fb571, roughness: 0.68, metalness: 0.16 }),
  enemy: new THREE.MeshStandardMaterial({
    color: 0xb3493c,
    roughness: 0.62,
    metalness: 0.22,
    map: createArmorPanelTexture('enemy-red', '#9f382f', 'rgba(255, 209, 120, 0.42)', 'rgba(36, 18, 20, 0.52)')
  }),
  enemyDark: new THREE.MeshStandardMaterial({
    color: 0x24181b,
    roughness: 0.78,
    metalness: 0.2,
    map: createArmorPanelTexture('enemy-dark', '#24181b', 'rgba(255, 116, 84, 0.18)', 'rgba(0, 0, 0, 0.45)')
  }),
  enemyAccent: new THREE.MeshStandardMaterial({ color: 0xffb257, roughness: 0.42, metalness: 0.18, emissive: 0x4c1900, emissiveIntensity: 0.22 }),
  enemyGlow: new THREE.MeshStandardMaterial({ color: 0xff6a45, roughness: 0.26, metalness: 0.08, emissive: 0xff4b24, emissiveIntensity: 0.95 }),
  enemyBlade: new THREE.MeshStandardMaterial({ color: 0x5d6467, roughness: 0.58, metalness: 0.28 }),
  droneHull: new THREE.MeshStandardMaterial({
    color: 0x9d3f58,
    roughness: 0.48,
    metalness: 0.2,
    map: createArmorPanelTexture('drone-plum', '#8d334f', 'rgba(255, 184, 104, 0.3)', 'rgba(25, 15, 28, 0.54)')
  }),
  bossHull: new THREE.MeshStandardMaterial({
    color: 0x7f2e33,
    roughness: 0.66,
    metalness: 0.22,
    map: createArmorPanelTexture('boss-crimson', '#7f2e33', 'rgba(255, 211, 90, 0.32)', 'rgba(26, 13, 14, 0.56)')
  }),
  bossPlate: new THREE.MeshStandardMaterial({ color: 0xd78a45, roughness: 0.5, metalness: 0.16, emissive: 0x351000, emissiveIntensity: 0.16 }),
  glassGood: new THREE.MeshPhysicalMaterial({
    color: 0xb8f7ff,
    roughness: 0.02,
    transmission: 0.72,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    emissive: 0x0a6688,
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide
  }),
  glassBad: new THREE.MeshPhysicalMaterial({
    color: 0xffbab4,
    roughness: 0.03,
    transmission: 0.62,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    emissive: 0x8a1111,
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide
  }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd15a, roughness: 0.34, metalness: 0.34, emissive: 0x4a2b00, emissiveIntensity: 0.25 }),
  shard: new THREE.MeshStandardMaterial({ color: 0xc9f8ff, roughness: 0.1, metalness: 0.02, transparent: true, opacity: 0.64 }),
  gateTarget: new THREE.MeshBasicMaterial({ color: 0xfff2a6, transparent: true, opacity: 0.84, depthWrite: false }),
  bullet: new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.34, emissive: 0xff8a32, emissiveIntensity: 1.2 }),
  tree: new THREE.MeshStandardMaterial({ color: 0x2f5837, roughness: 0.82 }),
  treeLight: new THREE.MeshStandardMaterial({ color: 0x3f7342, roughness: 0.8 }),
  treeDark: new THREE.MeshStandardMaterial({ color: 0x24462d, roughness: 0.86 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x65452e, roughness: 0.84 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x6b706e, roughness: 0.9 }),
  finishWhite: new THREE.MeshBasicMaterial({ color: 0xf8faf4 }),
  finishBlack: new THREE.MeshBasicMaterial({ color: 0x15191d }),
  finishGold: new THREE.MeshStandardMaterial({ color: 0xf4c75d, roughness: 0.45, metalness: 0.08 }),
  finishGlow: new THREE.MeshBasicMaterial({ color: 0xfff2a6, transparent: true, opacity: 0.5, depthWrite: false }),
  black: new THREE.MeshBasicMaterial({ color: 0x151a1c }),
  whiteText: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  redText: new THREE.MeshBasicMaterial({ color: 0xff4f49 }),
  greenText: new THREE.MeshBasicMaterial({ color: 0xb6ff9c })
};

const geometries = {
  road: new THREE.BoxGeometry(ROAD_WIDTH, 0.35, WORLD_DEPTH),
  edge: new THREE.BoxGeometry(0.22, 0.36, WORLD_DEPTH),
  grass: new THREE.BoxGeometry(90, 0.3, WORLD_DEPTH),
  roadStripe: new THREE.BoxGeometry(0.22, 0.035, 2.6),
  chassis: new THREE.BoxGeometry(2.35, 0.72, 3.1),
  tread: new THREE.BoxGeometry(0.48, 0.54, 3.35),
  turret: new THREE.CylinderGeometry(0.72, 0.86, 0.54, 8),
  barrel: new THREE.CylinderGeometry(0.1, 0.15, 2.4, 8),
  wheel: new THREE.CylinderGeometry(0.22, 0.22, 0.09, 10),
  gatePane: new THREE.BoxGeometry(3.95, 3.45, 0.16),
  gatePost: new THREE.BoxGeometry(0.18, 3.9, 0.18),
  gateTargetH: new THREE.BoxGeometry(4.65, 0.16, 0.12),
  gateTargetV: new THREE.BoxGeometry(0.16, 3.85, 0.12),
  glassChip: new THREE.BoxGeometry(0.34, 0.08, 0.02),
  glassBlock: new THREE.BoxGeometry(0.52, 0.38, 0.12),
  flashRing: new THREE.RingGeometry(0.4, 2.9, 24),
  enemy: new THREE.BoxGeometry(2.2, 1.25, 2.4),
  enemyHull: new THREE.BoxGeometry(2.5, 0.86, 2.9),
  enemyCabin: new THREE.BoxGeometry(1.5, 0.52, 1.5),
  enemyArmorPlate: new THREE.BoxGeometry(0.74, 0.16, 0.58),
  enemyNose: new THREE.ConeGeometry(0.82, 1.24, 4),
  enemyPod: new THREE.BoxGeometry(0.38, 0.38, 1.28),
  enemyVent: new THREE.BoxGeometry(0.72, 0.1, 0.16),
  enemyAntenna: new THREE.CylinderGeometry(0.025, 0.045, 0.82, 5),
  enemyTread: new THREE.BoxGeometry(0.38, 0.34, 2.65),
  enemyBarBack: new THREE.BoxGeometry(2.6, 0.12, 0.08),
  enemyBarFill: new THREE.BoxGeometry(2.5, 0.1, 0.09),
  enemyBarrel: new THREE.CylinderGeometry(0.08, 0.11, 1.7, 7),
  bossCrown: new THREE.CylinderGeometry(1.4, 1.8, 0.62, 7),
  bossLower: new THREE.BoxGeometry(6.25, 1.25, 4.95),
  bossUpper: new THREE.BoxGeometry(4.8, 0.94, 3.25),
  bossSideTread: new THREE.BoxGeometry(0.78, 0.86, 5.32),
  bossNose: new THREE.ConeGeometry(1.25, 1.65, 4),
  bossPanel: new THREE.BoxGeometry(1.1, 0.18, 0.72),
  bossCannon: new THREE.CylinderGeometry(0.16, 0.26, 3.45, 9),
  droneWing: new THREE.BoxGeometry(1.9, 0.12, 0.44),
  drone: new THREE.TetrahedronGeometry(0.9, 0),
  droneCore: new THREE.OctahedronGeometry(0.9, 0),
  droneArm: new THREE.BoxGeometry(1.72, 0.12, 0.22),
  droneBlade: new THREE.BoxGeometry(1.16, 0.06, 0.22),
  droneRotor: new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10),
  droneFin: new THREE.ConeGeometry(0.42, 0.82, 3),
  bullet: new THREE.SphereGeometry(0.16, 10, 8),
  coin: new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18),
  shard: new THREE.TetrahedronGeometry(0.22, 0),
  treeTop: new THREE.ConeGeometry(1.05, 2.1, 7),
  trunk: new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6),
  rock: new THREE.DodecahedronGeometry(0.72, 0),
  boss: new THREE.BoxGeometry(5.8, 2.7, 4.2),
  finishTile: new THREE.BoxGeometry(1.02, 0.06, 1.02),
  finishPost: new THREE.BoxGeometry(0.42, 5.1, 0.42),
  finishBeam: new THREE.BoxGeometry(ROAD_WIDTH + 2.2, 0.48, 0.44),
  finishBeacon: new THREE.CylinderGeometry(0.36, 0.5, 0.5, 8),
  finishGlow: new THREE.BoxGeometry(ROAD_WIDTH + 2.6, 0.08, 3.6)
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
let finishLine = null;

const modelDebug = {
  open: false,
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  selectedIndex: 0,
  liked: new Set(loadModelLikes()),
  rotationX: -0.22,
  rotationY: 0,
  zoom: 8,
  drag: false,
  lastX: 0,
  lastY: 0
};

const MODEL_DEFS = [
  { name: 'Atlas Siege Tank', note: 'Heavy hero tank with layered armor and gold trim.', build: createPreviewAtlasTank },
  { name: 'Needle Scout Tank', note: 'Small support tank with a long fast cannon.', build: createPreviewScoutTank },
  { name: 'Marauder Gate Tank', note: 'New standard enemy tank with plow armor, pods, and hot optics.', build: createPreviewMarauderGateTank },
  { name: 'Twin Rail Ravager', note: 'Enemy rail variant with paired barrels and heavier side armor.', build: createPreviewTwinRailRavager },
  { name: 'Vanta Spear Drone', note: 'New enemy drone silhouette with rotors, fins, and a bright attack core.', build: createPreviewVantaSpearDrone },
  { name: 'Fortress Crusher', note: 'Boss-grade tracked machine with command crown.', build: createPreviewFortressCrusher },
  { name: 'Obsidian Gatebreaker', note: 'Alternate boss shape with dual cannons and a serrated front ram.', build: createPreviewObsidianGatebreaker },
  { name: 'Glassbreaker Drone', note: 'Angular hovering enemy with wing fins and hot core.', build: createPreviewGlassbreakerDrone },
  { name: 'Aegis Shield Rig', note: 'Mobile defense generator for armor upgrades.', build: createPreviewShieldRig },
  { name: 'Magnet Harvester', note: 'Coin-pulling tower with rotating collector rings.', build: createPreviewMagnetHarvester },
  { name: 'Volt Magnet Skimmer', note: 'Fast reward-tech vehicle with collector fins and charged rails.', build: createPreviewVoltMagnetSkimmer },
  { name: 'Railgun Sentry', note: 'Lane turret concept with stabilizer legs.', build: createPreviewRailgunSentry },
  { name: 'Shard Ram Roller', note: 'Compact obstacle/enemy concept with glass-crushing front teeth.', build: createPreviewShardRamRoller },
  { name: 'Crystal Gate Pylon', note: 'Glass gate support with fractured energy panes.', build: createPreviewGatePylon },
  { name: 'Prism Command Gate', note: 'Premium gate concept with floating fractured panes and icon frame.', build: createPreviewPrismCommandGate },
  { name: 'Finish Line Arch', note: 'Chunky victory arch with beacon caps.', build: createPreviewFinishArch },
  { name: 'Pine Barricade', note: 'Richer low-poly tree cluster and rock base.', build: createPreviewPineBarricade },
  { name: 'Coin Vault Truck', note: 'Reward convoy vehicle with visible cargo.', build: createPreviewCoinTruck },
  { name: 'Overdrive Core', note: 'Power-up reactor with spinning armor fins.', build: createPreviewOverdriveCore },
  { name: 'Cobalt Repair Crawler', note: 'Support-style utility crawler with tools and blue shield plates.', build: createPreviewCobaltRepairCrawler }
];

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
  scene.add(sun);
}

function createWorld() {
  const grass = new THREE.Mesh(geometries.grass, materials.grass);
  grass.position.set(0, -0.26, -460);
  grass.receiveShadow = true;
  world.add(grass);

  const road = new THREE.Mesh(geometries.road, materials.road);
  road.position.set(0, 0, -460);
  road.receiveShadow = true;
  world.add(road);

  for (const x of [-ROAD_WIDTH / 2, ROAD_WIDTH / 2]) {
    const edge = new THREE.Mesh(geometries.edge, materials.roadEdge);
    edge.position.set(x, 0.05, -460);
    edge.receiveShadow = true;
    world.add(edge);
  }

  for (let i = 0; i < 104; i++) {
    const item = Math.random() > 0.38 ? createTree() : createRock();
    const side = Math.random() > 0.5 ? 1 : -1;
    item.position.set(side * (10 + Math.random() * 24), 0.1, 42 - i * 10.4 - Math.random() * 5);
    item.rotation.y = Math.random() * Math.PI;
    item.scale.setScalar(0.7 + Math.random() * 0.85);
    scenery.push(item);
    world.add(item);
  }

  for (let i = 0; i < 74; i++) {
    const stripe = new THREE.Mesh(geometries.roadStripe, materials.roadStripe);
    stripe.position.set(0, 0.22, 35 - i * 14);
    world.add(stripe);
  }
}

function createTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(geometries.trunk, materials.trunk);
  trunk.position.y = 0.78;
  trunk.castShadow = true;
  tree.add(trunk);
  const canopyMaterials = [materials.treeDark, materials.tree, materials.treeLight];
  for (let i = 0; i < 3; i++) {
    const top = new THREE.Mesh(geometries.treeTop, canopyMaterials[i]);
    top.position.y = 1.3 + i * 0.52;
    top.rotation.y = i * 0.72;
    top.scale.set(1.12 - i * 0.17, 1 - i * 0.1, 1.12 - i * 0.17);
    top.castShadow = true;
    tree.add(top);
  }
  const lean = (Math.random() - 0.5) * 0.12;
  trunk.rotation.z = lean;
  return tree;
}

function createRock() {
  const rock = new THREE.Mesh(geometries.rock, materials.rock);
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function addModelPart(root, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
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

  const health = createHealthBar(scale < 1 ? 1.9 : 2.9, scale < 1 ? 0x7bd66f : 0x54d8ff);
  health.root.position.set(0, 2.1, 0.12);
  root.add(health.root);

  root.scale.setScalar(scale);
  return {
    root,
    turretPivot,
    muzzle,
    barrel,
    healthFill: health.fill,
    healthWidth: health.width,
    wheels: root.children.filter((child) => child.geometry === geometries.wheel)
  };
}

function createHealthBar(width, color) {
  const root = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.16, 0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x111517 })
  );
  back.position.y = 0.01;
  root.add(back);

  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color })
  );
  root.add(fill);
  return { root, fill, width };
}

function setHealthBar(unit, ratio) {
  if (!unit?.healthFill) return;
  const clamped = clamp(ratio, 0, 1);
  unit.healthFill.scale.x = Math.max(0.04, clamped);
  unit.healthFill.position.x = -(1 - clamped) * unit.healthWidth * 0.5;
  unit.healthFill.material.color.setHex(clamped > 0.52 ? 0x7bd66f : clamped > 0.24 ? 0xffd15a : 0xff635d);
}

function bindInput() {
  startButton.addEventListener('click', startGame);
  restartButton.addEventListener('click', startGame);
  shopButton.addEventListener('click', showShop);
  resultShopButton.addEventListener('click', showShop);
  shopBackButton.addEventListener('click', showMenu);
  resetSaveButton.addEventListener('click', resetSave);
  modelDebugButton.addEventListener('click', openModelGallery);
  modelGalleryClose.addEventListener('click', closeModelGallery);
  modelGallery.addEventListener('pointerdown', (event) => {
    if (event.target === modelGallery) closeModelGallery();
  });
  modelPreviewCanvas.addEventListener('pointerdown', startModelDrag);
  modelPreviewCanvas.addEventListener('pointermove', dragModelPreview);
  modelPreviewCanvas.addEventListener('pointerup', endModelDrag);
  modelPreviewCanvas.addEventListener('pointercancel', endModelDrag);
  modelPreviewCanvas.addEventListener('wheel', zoomModelPreview, { passive: false });
  renderModelList();
  updateModelMemoryField(false);

  window.addEventListener('keydown', (event) => {
    if (modelDebug.open) {
      handleModelGalleryKey(event);
      return;
    }
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
  state.targetX = clamp((normalized - 0.5) * 15.4, PLAYER_MIN_X, PLAYER_MAX_X);
}

function startGame() {
  clearRun();
  state.running = true;
  state.ended = false;
  state.distance = 0;
  state.runLength = Math.round(RUN_LENGTH_BASE + (Math.random() - 0.5) * RUN_LENGTH_VARIANCE);
  state.speed = 18 + save.upgrades.core * 0.5;
  state.targetX = 0;
  state.laneX = 0;
  state.strength = 2 + save.upgrades.core + (state.demo ? 4 : 0);
  state.defense = 3 + save.upgrades.armor + (state.demo ? 5 : 0);
  state.maxDefense = state.defense;
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
  tank.root.position.set(0, 0, PLAYER_Z);
  tank.root.rotation.y = Math.PI;
  setHealthBar(tank, 1);
  scene.add(tank.root);
  createFinishLine();
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
  finishLine = null;
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
  return Math.round(upgrade.base * Math.pow(2.15, level) + level * level * 40);
}

function updateMenuCoins() {
  bankCoins.textContent = formatNumber(save.coins);
  shopCoins.textContent = formatNumber(save.coins);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  if (state.running) updateGame(dt);
  updateModelGallery(dt);
  if (state.running || performance.now() - lastIdleRender > 250) {
    updateCamera(dt);
    renderer.render(scene, camera);
    if (!state.running) lastIdleRender = performance.now();
  }
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
  updateFinishLine(dt);
  updateHud();

  if (!state.bossSpawned && state.distance > state.runLength - BOSS_APPROACH_DISTANCE) spawnBoss();
  if (state.distance >= state.runLength + FINISH_CLEAR_DISTANCE && isFinishCleared()) endRun(true);
}

function handleMovement(dt) {
  let steer = 0;
  if (state.keys.has('arrowleft') || state.keys.has('a')) steer -= 1;
  if (state.keys.has('arrowright') || state.keys.has('d')) steer += 1;
  if (steer !== 0) state.targetX = clamp(state.targetX + steer * dt * 8.5, PLAYER_MIN_X, PLAYER_MAX_X);
  state.laneX = damp(state.laneX, state.targetX, 12, dt);
}

function updateTank(dt) {
  if (!tank) return;
  tank.root.position.x = state.laneX;
  tank.root.position.z = PLAYER_Z;
  tank.root.rotation.z = -clamp((state.laneX - tank.root.position.x) * 0.06, -0.18, 0.18);
  setHealthBar(tank, state.defense / Math.max(1, state.maxDefense));

  const target = findTarget(tank.root.position, TARGET_LOCK_RANGE);
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
  const spacing = 1.34 + save.upgrades.bay * 0.08;
  supportTanks.forEach((support, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const targetX = clamp(state.laneX + side * spacing * (row + 1), -6.7, 6.7);
    const targetZ = PLAYER_Z + 1.45 + row * 1.1;
    support.root.position.x = damp(support.root.position.x, targetX, 8, dt);
    support.root.position.z = damp(support.root.position.z, targetZ, 8, dt);
    support.root.rotation.y = Math.PI + Math.sin(state.distance * 0.09 + index) * 0.04;
    setHealthBar(support, support.hp / Math.max(1, support.maxHp));
    const target = findTarget(support.root.position, TARGET_LOCK_RANGE);
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
  const material = getBulletMaterial(color);
  const bullet = new THREE.Mesh(geometries.bullet, material);
  bullet.scale.setScalar(scale);
  source.muzzle.getWorldPosition(bullet.position);
  bullet.userData = {
    target,
    damage: Math.max(1, power * scale),
    life: BULLET_MAX_RANGE / 44,
    velocity: new THREE.Vector3()
  };
  bullets.push(bullet);
  projectileLayer.add(bullet);
}

function getBulletMaterial(color) {
  if (!bulletMaterials.has(color)) {
    bulletMaterials.set(color, new THREE.MeshStandardMaterial({
      color,
      roughness: 0.28,
      emissive: color,
      emissiveIntensity: 1.25
    }));
  }
  return bulletMaterials.get(color);
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
    bullet.userData.velocity.lerp(tmpVec.multiplyScalar(44), 0.22);
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
    const selectedPanel = pickGatePanel(gate);
    updateGateHighlight(gate, selectedPanel, dt);
    if (!gate.used && gate.root.position.z > PLAYER_Z - 1.4 && gate.root.position.z < PLAYER_Z + 2.2) {
      if (selectedPanel) applyGate(gate, selectedPanel);
    }
    if (gate.root.position.z > 22) {
      removeFromArray(gates, i, obstacleLayer, 'root');
    }
  }
}

function pickGatePanel(gate) {
  if (gate.used || gate.root.position.z < PLAYER_Z - 18 || gate.root.position.z > PLAYER_Z + 6) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const panel of gate.panels) {
    const distance = Math.abs(state.laneX - panel.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = panel;
    }
  }
  return bestDistance <= 2.55 ? best : null;
}

function updateGateHighlight(gate, selectedPanel, dt) {
  for (const panel of gate.panels) {
    const selected = panel === selectedPanel;
    const targetScale = selected ? 1.13 : 1;
    const currentScale = damp(panel.mesh.scale.x, targetScale, 12, dt);
    panel.mesh.scale.set(currentScale, currentScale, currentScale);
    if (panel.mesh.userData.targetFrame) {
      panel.mesh.userData.targetFrame.visible = selected;
      panel.mesh.userData.targetFrame.scale.setScalar(selected ? 1 + Math.sin(performance.now() * 0.012) * 0.035 : 1);
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.root.position.z += (state.speed + enemy.speed) * dt;
    enemy.root.rotation.y += Math.sin(state.distance * 0.04 + i) * dt * 0.35;
    if (enemy.wheels?.length) {
      for (const wheel of enemy.wheels) wheel.rotation.x += dt * (state.speed + enemy.speed) * 1.25;
    }
    if (enemy.kind === 'drone') {
      enemy.root.position.y = 1.7 + Math.sin(state.distance * 0.16 + enemy.phase) * 0.5;
      enemy.root.rotation.x += dt * 1.6;
      for (const rotor of enemy.rotors || []) rotor.rotation.y += dt * 9.5;
    }
    if (enemy.root.position.z > PLAYER_Z - 1.2 && enemy.root.position.z < PLAYER_Z + 2.2 && Math.abs(enemy.root.position.x - state.laneX) < enemy.radius + 1.35) {
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
  const magnetReachPx = getCoinMagnetReachPx();
  const magnetLevel = save.upgrades.magnet || 0;
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += state.speed * dt;
    coin.rotation.y += dt * 5.6;
    coin.rotation.x += dt * 1.8;
    const dist = coin.position.distanceTo(tank.root.position);
    const zClose = Math.abs(coin.position.z - PLAYER_Z) < 15 + magnetLevel * 1.6;
    const xClose = Math.abs(worldToScreenX(coin.position) - worldToScreenX(tank.root.position)) <= magnetReachPx;
    if (magnetLevel > 0 && zClose && xClose) {
      coin.position.lerp(tmpVec.set(state.laneX, 1.25, PLAYER_Z), 0.07 + magnetLevel * 0.012);
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

function getCoinMagnetReachPx() {
  const level = save.upgrades.magnet || 0;
  const tankWidthPx = Math.abs(
    worldToScreenX(tmpVec.set(state.laneX + 1.35, 1, PLAYER_Z)) -
    worldToScreenX(tmpVec2.set(state.laneX - 1.35, 1, PLAYER_Z))
  );
  const movementPx = Math.max(1, Math.abs(
    worldToScreenX(tmpVec.set(PLAYER_MAX_X, 1, PLAYER_Z)) -
    worldToScreenX(tmpVec2.set(PLAYER_MIN_X, 1, PLAYER_Z))
  ) - tankWidthPx);
  return tankWidthPx * 0.5 + movementPx * 0.05 * level;
}

function worldToScreenX(position) {
  screenVec.copy(position).project(camera);
  return (screenVec.x * 0.5 + 0.5) * window.innerWidth;
}

function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const shard = shards[i];
    shard.userData.life -= dt;
    shard.position.addScaledVector(shard.userData.velocity, dt);
    shard.userData.velocity.y -= dt * 8;
    shard.rotation.x += dt * shard.userData.spin.x;
    shard.rotation.y += dt * shard.userData.spin.y;
    if (shard.userData.expand) shard.scale.addScalar(shard.userData.expand * dt);
    if (shard.userData.shrink) shard.scale.multiplyScalar(Math.max(0.965, 1 - dt * shard.userData.shrink));
    if (!shard.userData.noFade) shard.material.opacity = Math.max(0, shard.userData.life / 0.75);
    if (shard.userData.life <= 0) removeFromArray(shards, i, effectLayer);
  }
}

function spawnAhead() {
  while (state.spawnCursor < Math.min(state.runLength - 28, state.distance + 120)) {
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
    const spec = createGateSpec(type, positive);
    const panel = createGatePanel(LANES[laneIndex], spec);
    gate.panels.push({ x: LANES[laneIndex], ...spec, mesh: panel });
    root.add(panel);
  });

  obstacleLayer.add(root);
  gates.push(gate);
}

function createGateSpec(type, positive) {
  if (type === 'support') {
    return { type, op: 'add', amount: positive ? 1 : -1 };
  }
  if (positive && Math.random() < 0.12) {
    return { type, op: 'mul', amount: 2 };
  }
  return { type, op: 'add', amount: randomAmount(positive, type) };
}

function createGatePanel(x, spec) {
  const { type, amount, op } = spec;
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
  const text = makeGateTextSprite(spec, typeConfig);
  text.position.set(0, 2.16, 0.22);
  text.scale.set(3.05, 2.2, 1);
  group.add(text);

  const targetFrame = createGateTargetFrame();
  targetFrame.visible = false;
  group.userData.targetFrame = targetFrame;
  group.add(targetFrame);

  const glow = new THREE.PointLight(typeConfig.color, good ? 1.1 : 0.7, 9);
  if (!matchMedia('(max-width: 700px)').matches) {
    glow.position.set(0, 2.1, 0.4);
    group.add(glow);
  }
  return group;
}

function createGateTargetFrame() {
  const frame = new THREE.Group();
  const bars = [
    { pos: [0, 4.02, 0.32], geometry: geometries.gateTargetH },
    { pos: [0, 0.18, 0.32], geometry: geometries.gateTargetH },
    { pos: [-2.32, 2.1, 0.32], geometry: geometries.gateTargetV },
    { pos: [2.32, 2.1, 0.32], geometry: geometries.gateTargetV }
  ];
  for (const bar of bars) {
    const mesh = new THREE.Mesh(bar.geometry, materials.gateTarget);
    mesh.position.set(...bar.pos);
    frame.add(mesh);
  }
  return frame;
}

function randomAmount(positive, type) {
  const base = type === 'strength' ? state.strength : state.defense;
  const factor = type === 'defense' ? 0.12 + Math.random() * 0.12 : 0.16 + Math.random() * 0.16;
  const magnitude = Math.max(1, Math.round(Math.min(type === 'defense' ? 5 : 8, base * factor)));
  return positive ? magnitude : -Math.max(1, Math.ceil(magnitude * 0.75));
}

function applyGate(gate, panel) {
  gate.used = true;
  const oldTotal = state.strength + state.defense + supportTanks.length;
  if (panel.type === 'strength') {
    state.strength = panel.op === 'mul' ? Math.ceil(state.strength * panel.amount) : Math.max(1, state.strength + panel.amount);
  }
  if (panel.type === 'defense') {
    if (panel.op === 'mul') {
      const nextDefense = Math.ceil(state.defense * panel.amount);
      state.maxDefense += Math.max(0, nextDefense - state.defense);
      state.defense = nextDefense;
    } else {
      state.defense = Math.max(0, state.defense + panel.amount);
      if (panel.amount > 0) state.maxDefense += panel.amount;
    }
  }
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
      setMessage(`${panel.type.toUpperCase()} gate gained ${formatGateValue(panel)}`);
    }
  } else {
    state.gateStreak = 0;
    setMessage(`${panel.type.toUpperCase()} gate drained ${Math.abs(panel.amount)}`);
  }

  const newTotal = state.strength + state.defense + supportTanks.length;
  if (newTotal > oldTotal) state.runCoins += Math.max(1, Math.floor((newTotal - oldTotal) * 0.8));
  state.peakPower = Math.max(state.peakPower, state.strength + state.defense + supportTanks.length);
  const impact = panel.mesh.getWorldPosition(tmpVec);
  impact.y = 2.15;
  spawnGlassSmash(impact, panel.amount > 0 ? 0x96f3ff : 0xff8a82);
  state.screenShake = Math.max(state.screenShake, 0.25);
  obstacleLayer.remove(gate.root);
}

function addSupportTank(showMessage) {
  if (supportTanks.length >= 2 + save.upgrades.bay * 2) {
    state.runCoins += 8 + save.upgrades.bank;
    if (showMessage) setMessage('Escort bay full: converted mini tank to coins');
    return;
  }
  const support = createTank(materials.friendly, 0.5);
  support.root.position.set(state.laneX, 0, PLAYER_Z + 1.45 + supportTanks.length * 0.55);
  support.root.rotation.y = Math.PI;
  support.cooldown = 0.3 + Math.random() * 0.4;
  support.maxHp = 1 + Math.floor(save.upgrades.armor / 5);
  support.hp = support.maxHp;
  setHealthBar(support, 1);
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

function createEnemyHealthBar(width, color) {
  const root = new THREE.Group();
  const back = new THREE.Mesh(geometries.enemyBarBack, materials.black);
  back.scale.x = width / 2.6;
  root.add(back);
  const fill = new THREE.Mesh(geometries.enemyBarFill, new THREE.MeshBasicMaterial({ color }));
  fill.position.z = -0.02;
  const fullScaleX = width / 2.5;
  fill.scale.x = fullScaleX;
  root.add(fill);
  return { root, fill, width, fullScaleX };
}

function buildMarauderEnemy(root, variant) {
  root.userData.wheels = [];
  const isRail = variant === 'rail';
  addModelPart(root, geometries.enemyHull, materials.enemy, [0, 0.82, 0.04]);
  addModelPart(root, geometries.enemyCabin, materials.enemyDark, [0, 1.36, 0.22], [0, 0.08, 0], [1.08, 1, 1.05]);
  addModelPart(root, geometries.enemyNose, materials.enemyBlade, [0, 0.86, -1.62], [-Math.PI / 2, Math.PI / 4, 0], [0.92, 0.78, 0.88]);
  addModelPart(root, geometries.enemyVent, materials.enemyGlow, [0, 1.64, -0.58], [0, 0, 0], [1.15, 1, 1]);
  for (const side of [-1, 1]) {
    addModelPart(root, geometries.enemyTread, materials.enemyDark, [side * 1.44, 0.45, 0.02], [0, 0, 0], [1.28, 1.18, 1.12]);
    addModelPart(root, geometries.enemyPod, isRail ? materials.enemyAccent : materials.enemyBlade, [side * 1.45, 1.04, -0.74], [0, side * 0.06, 0], [1, 0.92, isRail ? 1.35 : 1]);
    addModelPart(root, geometries.enemyArmorPlate, materials.enemyBlade, [side * 0.72, 1.06, -1.19], [0.04, 0, side * 0.08], [1.05, 1, 0.88]);
    addModelPart(root, geometries.enemyArmorPlate, materials.enemyBlade, [side * 0.78, 0.98, 0.92], [-0.04, 0, -side * 0.08], [0.95, 1, 0.92]);
    for (let i = 0; i < 4; i++) {
      const wheel = addModelPart(root, geometries.wheel, materials.enemyAccent, [side * 1.68, 0.43, -1.18 + i * 0.78], [0, 0, Math.PI / 2], [0.9, 0.9, 0.9]);
      root.userData.wheels.push(wheel);
    }
  }
  addModelPart(root, geometries.turret, materials.enemyDark, [0, 1.72, -0.18], [0, 0, 0], [0.88, 0.82, 0.88]);
  if (isRail) {
    addModelPart(root, geometries.enemyBarrel, materials.enemyAccent, [-0.22, 1.77, -1.56], [Math.PI / 2, 0, 0], [1.05, 1.05, 1.25]);
    addModelPart(root, geometries.enemyBarrel, materials.enemyAccent, [0.22, 1.77, -1.56], [Math.PI / 2, 0, 0], [1.05, 1.05, 1.25]);
  } else {
    addModelPart(root, geometries.enemyBarrel, materials.enemyAccent, [0, 1.77, -1.58], [Math.PI / 2, 0, 0], [1.15, 1.15, 1.18]);
  }
  for (const x of [-0.42, 0.42]) {
    addModelPart(root, geometries.bullet, materials.enemyGlow, [x, 1.22, -1.34], [0, 0, 0], [0.68, 0.68, 0.68]);
  }
  addModelPart(root, geometries.enemyAntenna, materials.enemyAccent, [-0.42, 1.94, 0.68], [0, 0.18, -0.16]);
}

function buildDroneEnemy(root) {
  root.userData.rotors = [];
  addModelPart(root, geometries.droneCore, materials.droneHull, [0, 1.58, 0], [0.1, Math.PI / 4, 0.14], [1.2, 0.78, 1.08]);
  addModelPart(root, geometries.droneWing, materials.enemyDark, [0, 1.48, 0.02], [0.04, 0, 0.08], [1.32, 1, 1.1]);
  addModelPart(root, geometries.droneArm, materials.enemyBlade, [0, 1.5, -0.5], [0, 0.04, 0], [1.18, 1, 1]);
  addModelPart(root, geometries.enemyNose, materials.enemyGlow, [0, 1.58, -0.86], [-Math.PI / 2, Math.PI / 4, 0], [0.42, 0.5, 0.42]);
  for (const side of [-1, 1]) {
    addModelPart(root, geometries.droneFin, materials.enemyDark, [side * 0.82, 1.42, 0.68], [Math.PI / 2, side * 0.2, side * 0.45], [0.82, 0.82, 0.82]);
    addModelPart(root, geometries.droneRotor, materials.enemyDark, [side * 1.72, 1.5, 0.06]);
    const bladeA = addModelPart(root, geometries.droneBlade, materials.enemyAccent, [side * 1.72, 1.58, 0.06], [0, 0, 0]);
    const bladeB = addModelPart(root, geometries.droneBlade, materials.enemyAccent, [side * 1.72, 1.6, 0.06], [0, Math.PI / 2, 0]);
    root.userData.rotors.push(bladeA, bladeB);
  }
  addModelPart(root, geometries.bullet, materials.enemyGlow, [0, 1.58, -0.48], [0, 0, 0], [1.28, 1.28, 1.28]);
}

function buildFortressEnemy(root) {
  root.userData.wheels = [];
  addModelPart(root, geometries.bossLower, materials.bossHull, [0, 0.98, 0.04]);
  addModelPart(root, geometries.bossUpper, materials.enemyDark, [0, 1.98, 0.1], [0, 0.04, 0]);
  addModelPart(root, geometries.bossNose, materials.enemyBlade, [0, 0.96, -2.62], [-Math.PI / 2, Math.PI / 4, 0], [1.1, 0.86, 1]);
  addModelPart(root, geometries.bossCrown, materials.enemyDark, [0, 3.0, 0.42], [0, Math.PI / 7, 0], [0.9, 0.82, 0.9]);
  for (const side of [-1, 1]) {
    addModelPart(root, geometries.bossSideTread, materials.enemyDark, [side * 3.38, 0.62, 0.02]);
    addModelPart(root, geometries.bossPanel, materials.bossPlate, [side * 1.6, 1.76, -1.74], [0.02, 0, side * 0.08], [1.15, 1, 1]);
    addModelPart(root, geometries.bossPanel, materials.bossPlate, [side * 1.6, 1.7, 1.22], [-0.02, 0, -side * 0.08], [1.05, 1, 1]);
    addModelPart(root, geometries.enemyPod, materials.enemyBlade, [side * 2.72, 1.74, -1.1], [0, side * 0.08, 0], [1.26, 1.36, 1.56]);
    for (let i = 0; i < 5; i++) {
      const wheel = addModelPart(root, geometries.wheel, materials.enemyAccent, [side * 3.78, 0.55, -1.76 + i * 0.88], [0, 0, Math.PI / 2], [1.05, 1.05, 1.05]);
      root.userData.wheels.push(wheel);
    }
  }
  addModelPart(root, geometries.turret, materials.enemyDark, [-0.62, 2.68, -0.52], [0, 0, 0], [1.2, 1.05, 1.2]);
  addModelPart(root, geometries.turret, materials.enemyDark, [0.62, 2.68, -0.52], [0, 0, 0], [1.2, 1.05, 1.2]);
  addModelPart(root, geometries.bossCannon, materials.enemyAccent, [-0.62, 2.72, -2.38], [Math.PI / 2, 0, 0]);
  addModelPart(root, geometries.bossCannon, materials.enemyAccent, [0.62, 2.72, -2.38], [Math.PI / 2, 0, 0]);
  addModelPart(root, geometries.finishBeam, materials.enemyGlow, [0, 1.76, -2.4], [0, 0, 0], [0.18, 0.34, 0.24]);
  for (let i = 0; i < 5; i++) {
    addModelPart(root, geometries.enemyVent, materials.enemyGlow, [(i - 2) * 0.56, 2.42, -2.0], [0, 0, 0], [0.72, 1, 1]);
  }
}

function createEnemy(kind) {
  const root = new THREE.Group();
  const upgradePressure = save.upgrades.core * 0.18 + save.upgrades.armor * 0.3 + save.upgrades.bay * 0.14;
  const difficulty = 1 + state.distance / 42 + state.peakPower * 0.15 + upgradePressure;
  let hp = Math.round((kind === 'drone' ? 3.2 : 6.2) * difficulty);
  let radius = kind === 'drone' ? 0.9 : 1.35;
  let barY = kind === 'drone' ? 2.62 : 2.46;
  let barWidth = kind === 'drone' ? 2.3 : 2.8;
  const variant = kind === 'tank' && Math.random() < 0.36 ? 'rail' : 'marauder';
  if (kind === 'boss') {
    hp = Math.round(60 + state.peakPower * 7.2 + supportTanks.length * 10 + save.upgrades.armor * 12);
    radius = 3.2;
    barY = 3.92;
    barWidth = 5.8;
    buildFortressEnemy(root);
  } else if (kind === 'drone') {
    buildDroneEnemy(root);
  } else {
    buildMarauderEnemy(root, variant);
  }
  const health = createEnemyHealthBar(barWidth, 0x7bd66f);
  health.root.position.set(0, barY, 0);
  root.add(health.root);
  return {
    root,
    hp,
    maxHp: hp,
    radius,
    kind,
    variant,
    speed: kind === 'drone' ? 2.8 : 1.2,
    phase: Math.random() * 10,
    bar: health.fill,
    barFullScale: health.fullScaleX,
    barWidth: health.width,
    wheels: root.userData.wheels || [],
    rotors: root.userData.rotors || []
  };
}

function spawnBoss() {
  state.bossSpawned = true;
  const boss = createEnemy('boss');
  boss.root.position.set(0, 0, -112);
  boss.speed = 0.3;
  obstacleLayer.add(boss.root);
  enemies.push(boss);
  setMessage('Fortress tank guarding the finish. Focus fire.');
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
  enemy.bar.scale.x = enemy.barFullScale * ratio;
  enemy.bar.position.x = -(1 - ratio) * enemy.barWidth * 0.5;
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
  const hit = getEnemyCollisionDamage(enemy);
  if (supportTanks.length && Math.random() < 0.35) {
    const support = supportTanks[supportTanks.length - 1];
    support.hp -= 1;
    spawnShardBurst(support.root.position, 10, 0x7bd66f);
    if (support.hp <= 0) {
      loseSupportTank();
      setMessage('Escort took the hit and broke away');
    } else {
      setHealthBar(support, support.hp / support.maxHp);
      setMessage('Escort armor absorbed the crash');
    }
    return;
  }
  state.defense -= hit;
  spawnShardBurst(tank.root.position, 14, 0xff635d);
  if (state.defense < 0) {
    endRun(false);
  } else {
    setMessage(`Armor absorbed ${hit} damage`);
  }
}

function getEnemyCollisionDamage(enemy) {
  const base = enemy.kind === 'boss' ? 8 : enemy.kind === 'drone' ? 2 : 3;
  return base + Math.floor(state.distance / 82) + Math.floor(state.peakPower / 16);
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

function createFinishLine() {
  const root = new THREE.Group();
  root.position.z = PLAYER_Z - state.runLength;

  const glow = new THREE.Mesh(geometries.finishGlow, materials.finishGlow);
  glow.position.set(0, 0.31, 0);
  root.add(glow);

  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const tile = new THREE.Mesh(
        geometries.finishTile,
        (ix + iz) % 2 === 0 ? materials.finishWhite : materials.finishBlack
      );
      tile.position.set(-4.6 + ix * 1.02, 0.27, -1.03 + iz * 1.02);
      root.add(tile);
    }
  }

  for (const x of [-ROAD_WIDTH * 0.5 - 0.75, ROAD_WIDTH * 0.5 + 0.75]) {
    const post = new THREE.Mesh(geometries.finishPost, materials.finishGold);
    post.position.set(x, 2.55, 0);
    root.add(post);
    const beacon = new THREE.Mesh(geometries.finishBeacon, materials.coin);
    beacon.position.set(x, 5.35, 0);
    root.add(beacon);
  }

  const beam = new THREE.Mesh(geometries.finishBeam, materials.finishGold);
  beam.position.set(0, 5.05, 0);
  root.add(beam);

  const lowerBeam = new THREE.Mesh(geometries.finishBeam, materials.finishWhite);
  lowerBeam.position.set(0, 4.28, 0);
  lowerBeam.scale.set(0.82, 0.38, 0.72);
  root.add(lowerBeam);

  const banner = makeTextSprite('FINISH', '#15191d', 'rgba(248, 250, 244, 0.9)');
  banner.position.set(0, 5.16, 0.32);
  banner.scale.set(5.5, 1.28, 1);
  root.add(banner);

  const distanceBanner = makeTextSprite(`${state.runLength}M`, '#fff8d6', 'rgba(21, 25, 29, 0.78)');
  distanceBanner.position.set(0, 4.28, 0.34);
  distanceBanner.scale.set(3.8, 0.9, 1);
  root.add(distanceBanner);

  finishLine = root;
  obstacleLayer.add(root);
}

function updateFinishLine(dt) {
  if (!finishLine) return;
  finishLine.position.z = PLAYER_Z - (state.runLength - state.distance);
  finishLine.children.forEach((child, index) => {
    if (child.geometry === geometries.finishBeacon) {
      child.rotation.y += dt * 4.4;
      child.position.y = 5.35 + Math.sin(performance.now() * 0.006 + index) * 0.12;
    }
  });
  const remaining = state.runLength - state.distance;
  if (remaining < 150 && remaining > 0 && state.messageTimer <= 0) {
    setMessage(`Finish ${Math.max(1, Math.ceil(remaining))}m ahead. Break through the arch.`);
  } else if (remaining <= 0 && !isFinishCleared() && state.messageTimer <= 0) {
    setMessage('Finish crossed. Destroy the fortress tank to bank the run.');
  }
}

function isFinishCleared() {
  return state.bossDefeated || !enemies.some((enemy) => enemy.kind === 'boss');
}

function spawnGlassSmash(position, color) {
  spawnShardBurst(position, 8, color);
  const blockMaterial = getEffectMaterial(color, 0.72);
  const columns = 5;
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const shard = new THREE.Mesh(geometries.glassBlock, blockMaterial);
      const offsetX = (column - (columns - 1) / 2) * 0.74;
      const offsetY = (row - (rows - 1) / 2) * 0.58;
      shard.position.set(position.x + offsetX, position.y + offsetY, position.z);
      const burstX = offsetX * 2.2 + (Math.random() - 0.5) * 3.6;
      const burstY = offsetY * 2.4 + 2.5 + Math.random() * 4.5;
      const burstZ = 5 + Math.random() * 8;
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shard.scale.setScalar(0.88 + Math.random() * 0.42);
      shard.userData = {
        life: 0.68 + Math.random() * 0.32,
        velocity: new THREE.Vector3(burstX, burstY, burstZ),
        spin: { x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 14 },
        noFade: true,
        shrink: 0.55
      };
      effectLayer.add(shard);
      shards.push(shard);
    }
  }

  for (let i = 0; i < 12; i++) {
    const shard = new THREE.Mesh(geometries.glassChip, blockMaterial);
    shard.position.copy(position);
    shard.scale.set(0.8 + Math.random() * 2.8, 0.55 + Math.random() * 1.9, 1);
    shard.userData = {
      life: 0.55 + Math.random() * 0.42,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 15, 3 + Math.random() * 8, (Math.random() - 0.5) * 12 + 2),
      spin: { x: (Math.random() - 0.5) * 18, y: (Math.random() - 0.5) * 18 },
      noFade: true,
      shrink: 0.72
    };
    effectLayer.add(shard);
    shards.push(shard);
  }

  const flash = new THREE.Mesh(
    geometries.flashRing,
    getEffectMaterial(color, 0.42, true)
  );
  flash.position.copy(position);
  flash.rotation.x = Math.PI / 2;
  flash.userData = {
    life: 0.28,
    velocity: new THREE.Vector3(0, 0, 0),
    spin: { x: 0, y: 0 },
    expand: 8,
    noFade: true,
    shrink: 0.3
  };
  effectLayer.add(flash);
  shards.push(flash);
}

function spawnShardBurst(position, count, color) {
  const material = getEffectMaterial(color, 0.62);
  for (let i = 0; i < count; i++) {
    const shard = new THREE.Mesh(geometries.shard, material);
    shard.position.copy(position);
    shard.userData = {
      life: 0.34 + Math.random() * 0.28,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8),
      spin: { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12 },
      noFade: true,
      shrink: 1.1
    };
    effectLayer.add(shard);
    shards.push(shard);
  }
}

function getEffectMaterial(color, opacity, doubleSide = false) {
  const key = `${color}:${opacity}:${doubleSide ? 1 : 0}`;
  if (!effectMaterials.has(key)) {
    effectMaterials.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
    }));
  }
  return effectMaterials.get(key);
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
  progressFill.style.width = `${clamp((state.distance / state.runLength) * 100, 0, 100)}%`;
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

  resultKicker.textContent = won ? 'run complete' : 'convoy wrecked';
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
  tmpVec.set(baseX + shakeX, 11.6 + shakeY, 21.4);
  camera.position.lerp(tmpVec, 1 - Math.exp(-dt * 6));
  tmpVec2.set(baseX * 0.22, 1.25, -17.8);
  camera.lookAt(tmpVec2);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeModelGallery();
}

function openModelGallery() {
  modelDebug.open = true;
  state.keys.clear();
  modelGallery.classList.remove('hidden');
  ensureModelGalleryScene();
  selectDebugModel(modelDebug.selectedIndex);
  resizeModelGallery();
  modelPreviewCanvas.focus();
}

function closeModelGallery() {
  modelDebug.open = false;
  modelGallery.classList.add('hidden');
  modelDebug.drag = false;
}

function ensureModelGalleryScene() {
  if (modelDebug.renderer) return;
  modelDebug.renderer = new THREE.WebGLRenderer({ canvas: modelPreviewCanvas, antialias: true, alpha: true });
  modelDebug.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  modelDebug.scene = new THREE.Scene();
  modelDebug.scene.background = new THREE.Color(0x11191d);
  modelDebug.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  modelDebug.camera.position.set(0, 3.4, modelDebug.zoom);
  modelDebug.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x17231c, 1.8));
  const key = new THREE.DirectionalLight(0xffe0a8, 2.2);
  key.position.set(-5, 8, 6);
  modelDebug.scene.add(key);
  const rim = new THREE.DirectionalLight(0x76d9ff, 1.2);
  rim.position.set(5, 4, -5);
  modelDebug.scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(3.8, 4.5, 0.12, 48),
    getPreviewMaterial('display-floor', 0x1b272b, 0.82, 0.02)
  );
  floor.position.y = -0.08;
  modelDebug.scene.add(floor);
}

function renderModelList() {
  modelList.innerHTML = '';
  MODEL_DEFS.forEach((model, index) => {
    const row = document.createElement('label');
    row.className = `model-row${index === modelDebug.selectedIndex ? ' is-active' : ''}`;
    row.innerHTML = `
      <input type="checkbox" ${modelDebug.liked.has(model.name) ? 'checked' : ''} aria-label="Like ${model.name}">
      <span><strong>${model.name}</strong><span>${model.note}</span></span>
    `;
    row.addEventListener('click', () => selectDebugModel(index));
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) modelDebug.liked.add(model.name);
      else modelDebug.liked.delete(model.name);
      updateModelMemoryField(true);
    });
    modelList.append(row);
  });
}

function selectDebugModel(index) {
  modelDebug.selectedIndex = clamp(index, 0, MODEL_DEFS.length - 1);
  const model = MODEL_DEFS[modelDebug.selectedIndex];
  modelPreviewName.textContent = model.name;
  modelPreviewMeta.textContent = `${model.note} Drag, wheel zoom, or use arrow keys.`;
  if (modelDebug.root) {
    modelDebug.scene.remove(modelDebug.root);
    disposePreviewModel(modelDebug.root);
  }
  modelDebug.root = model.build();
  centerPreviewModel(modelDebug.root);
  modelDebug.scene.add(modelDebug.root);
  modelDebug.rotationX = -0.22;
  modelDebug.rotationY = 0;
  renderModelList();
}

function disposePreviewModel(root) {
  root.traverse((child) => {
    if (child.geometry && !Object.values(geometries).includes(child.geometry)) child.geometry.dispose();
  });
}

function centerPreviewModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  root.scale.setScalar(Math.min(1.35, 4.2 / maxSize));
  root.position.y += 0.12;
}

function updateModelGallery(dt) {
  if (!modelDebug.open || !modelDebug.renderer || !modelDebug.root) return;
  if (!modelDebug.drag) modelDebug.rotationY += dt * 0.55;
  modelDebug.root.rotation.set(modelDebug.rotationX, modelDebug.rotationY, 0);
  modelDebug.camera.position.set(0, 2.8, modelDebug.zoom);
  modelDebug.camera.lookAt(0, 1.2, 0);
  modelDebug.renderer.render(modelDebug.scene, modelDebug.camera);
}

function resizeModelGallery() {
  if (!modelDebug.renderer) return;
  const width = Math.max(1, modelPreviewCanvas.clientWidth);
  const height = Math.max(1, modelPreviewCanvas.clientHeight);
  modelDebug.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  modelDebug.renderer.setSize(width, height, false);
  modelDebug.camera.aspect = width / height;
  modelDebug.camera.updateProjectionMatrix();
}

function startModelDrag(event) {
  if (!modelDebug.open) return;
  event.preventDefault();
  modelDebug.drag = true;
  modelDebug.lastX = event.clientX;
  modelDebug.lastY = event.clientY;
  modelPreviewCanvas.setPointerCapture(event.pointerId);
  modelPreviewCanvas.focus();
}

function dragModelPreview(event) {
  if (!modelDebug.drag) return;
  event.preventDefault();
  const dx = event.clientX - modelDebug.lastX;
  const dy = event.clientY - modelDebug.lastY;
  modelDebug.lastX = event.clientX;
  modelDebug.lastY = event.clientY;
  modelDebug.rotationY += dx * 0.012;
  modelDebug.rotationX = clamp(modelDebug.rotationX + dy * 0.01, -1.1, 0.75);
}

function endModelDrag(event) {
  if (!modelDebug.drag) return;
  modelDebug.drag = false;
  try {
    modelPreviewCanvas.releasePointerCapture(event.pointerId);
  } catch {
    // Capture can already be released after pointer cancel.
  }
}

function zoomModelPreview(event) {
  if (!modelDebug.open) return;
  event.preventDefault();
  modelDebug.zoom = clamp(modelDebug.zoom + Math.sign(event.deltaY) * 0.5, 4.5, 12);
}

function handleModelGalleryKey(event) {
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    closeModelGallery();
    event.preventDefault();
    return;
  }
  if (key === 'arrowleft') modelDebug.rotationY -= 0.18;
  else if (key === 'arrowright') modelDebug.rotationY += 0.18;
  else if (key === 'arrowup') modelDebug.rotationX = clamp(modelDebug.rotationX - 0.12, -1.1, 0.75);
  else if (key === 'arrowdown') modelDebug.rotationX = clamp(modelDebug.rotationX + 0.12, -1.1, 0.75);
  else return;
  event.preventDefault();
}

function loadModelLikes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MODEL_MEMORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

function updateModelMemoryField(copyToClipboard) {
  const names = MODEL_DEFS.map((model) => model.name).filter((name) => modelDebug.liked.has(name));
  const text = names.length ? names.join('\n') : '';
  localStorage.setItem(MODEL_MEMORY_KEY, JSON.stringify(names));
  modelMemoryOutput.value = text || 'No model selections yet.';
  modelMemoryStatus.textContent = names.length ? `${names.length} selection${names.length === 1 ? '' : 's'} saved to browser memory.` : 'Selections saved here.';
  if (copyToClipboard && navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      modelMemoryStatus.textContent = names.length ? 'Copied selection list to clipboard.' : 'Cleared selection memory.';
    }).catch(() => {
      copyModelMemoryFallback(names.length);
    });
  } else if (copyToClipboard) {
    copyModelMemoryFallback(names.length);
  }
}

function copyModelMemoryFallback(hasSelections) {
  modelMemoryOutput.focus();
  modelMemoryOutput.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  modelMemoryStatus.textContent = copied
    ? (hasSelections ? 'Copied selection list to clipboard.' : 'Cleared selection memory.')
    : 'Saved below. Copy manually if clipboard is blocked.';
}

function getPreviewMaterial(key, color, roughness = 0.62, metalness = 0.08, emissive = 0x000000) {
  const mapKey = `${key}:${color}:${roughness}:${metalness}:${emissive}`;
  if (!previewMaterials.has(mapKey)) {
    previewMaterials.set(mapKey, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.2 : 0 }));
  }
  return previewMaterials.get(mapKey);
}

function getPreviewPanelMaterial(key, color, base, line, shadow, roughness = 0.58, metalness = 0.16) {
  const mapKey = `panel:${key}:${color}:${base}:${line}:${shadow}:${roughness}:${metalness}`;
  if (!previewMaterials.has(mapKey)) {
    previewMaterials.set(mapKey, new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      map: createArmorPanelTexture(`preview-${key}`, base, line, shadow)
    }));
  }
  return previewMaterials.get(mapKey);
}

function addBox(root, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.add(mesh);
  return mesh;
}

function addCylinder(root, radiusTop, radiusBottom, height, segments, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.add(mesh);
  return mesh;
}

function addCone(root, radius, height, segments, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  root.add(mesh);
  return mesh;
}

function addSphere(root, radius, position, material, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 10), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  root.add(mesh);
  return mesh;
}

function createPreviewAtlasTank() {
  const root = new THREE.Group();
  const green = getPreviewMaterial('atlas-green', 0x526f5c, 0.58, 0.16);
  const dark = getPreviewMaterial('atlas-dark', 0x172125, 0.74, 0.18);
  const gold = getPreviewMaterial('atlas-gold', 0xd7aa52, 0.42, 0.18);
  addBox(root, [3.8, 0.58, 4.2], [0, 0.58, 0], dark);
  addBox(root, [3.18, 0.9, 3.5], [0, 1.08, 0], green);
  addBox(root, [2.35, 0.34, 2.65], [0, 1.72, -0.08], green);
  addCylinder(root, 0.92, 1.08, 0.6, 10, [0, 2.12, -0.18], green);
  addCylinder(root, 0.16, 0.22, 2.95, 10, [0, 2.18, -1.9], dark, [Math.PI / 2, 0, 0]);
  addBox(root, [0.62, 0.22, 0.46], [0, 2.18, -3.3], gold);
  for (const side of [-1, 1]) {
    addBox(root, [0.48, 0.68, 4.42], [side * 2.08, 0.66, 0], dark);
    for (let i = 0; i < 5; i++) addCylinder(root, 0.22, 0.22, 0.12, 10, [side * 2.36, 0.66, -1.65 + i * 0.82], gold, [0, 0, Math.PI / 2]);
  }
  return root;
}

function createPreviewScoutTank() {
  const root = new THREE.Group();
  const body = getPreviewMaterial('scout-body', 0x5fa977, 0.6, 0.12);
  const dark = getPreviewMaterial('scout-dark', 0x1b2b2e, 0.74, 0.16);
  const cyan = getPreviewMaterial('scout-cyan', 0x54d8ff, 0.34, 0.12, 0x164a55);
  addBox(root, [2.4, 0.52, 3.05], [0, 0.62, 0], body);
  addBox(root, [2.9, 0.34, 3.25], [0, 0.38, 0], dark);
  addCylinder(root, 0.58, 0.7, 0.44, 8, [0, 1.14, -0.2], body);
  addCylinder(root, 0.08, 0.13, 3.2, 8, [0, 1.18, -1.95], cyan, [Math.PI / 2, 0, 0]);
  addBox(root, [1.35, 0.1, 0.34], [0, 1.42, 0.45], cyan);
  for (const side of [-1, 1]) addBox(root, [0.34, 0.44, 3.18], [side * 1.45, 0.46, 0], dark);
  return root;
}

function createPreviewMarauderGateTank() {
  const root = new THREE.Group();
  const red = getPreviewPanelMaterial('marauder-red', 0xb3493c, '#9f382f', 'rgba(255, 209, 120, 0.42)', 'rgba(36, 18, 20, 0.52)');
  const dark = getPreviewPanelMaterial('marauder-dark', 0x24181b, '#24181b', 'rgba(255, 116, 84, 0.18)', 'rgba(0, 0, 0, 0.45)', 0.74, 0.18);
  const glow = getPreviewMaterial('marauder-glow', 0xff6a45, 0.28, 0.08, 0x8a2100);
  const steel = getPreviewMaterial('marauder-steel', 0x697174, 0.58, 0.24);
  addBox(root, [3.05, 0.78, 3.25], [0, 0.78, 0.04], red);
  addBox(root, [1.78, 0.56, 1.62], [0, 1.36, 0.28], dark, [0, 0.08, 0]);
  const ram = addCone(root, 0.92, 1.35, 4, [0, 0.86, -1.85], steel, [-Math.PI / 2, Math.PI / 4, 0]);
  ram.scale.set(1, 0.76, 0.9);
  for (const side of [-1, 1]) {
    addBox(root, [0.46, 0.56, 3.56], [side * 1.72, 0.52, 0.02], dark);
    addBox(root, [0.45, 0.4, 1.35], [side * 1.5, 1.04, -0.72], steel, [0, side * 0.08, 0]);
    addBox(root, [0.78, 0.16, 0.62], [side * 0.78, 1.08, -1.22], steel, [0.04, 0, side * 0.08]);
    addBox(root, [0.7, 0.16, 0.58], [side * 0.82, 0.98, 0.98], steel, [-0.04, 0, -side * 0.08]);
    for (let i = 0; i < 4; i++) addCylinder(root, 0.23, 0.23, 0.12, 10, [side * 1.95, 0.5, -1.24 + i * 0.82], glow, [0, 0, Math.PI / 2]);
  }
  addCylinder(root, 0.7, 0.86, 0.48, 8, [0, 1.78, -0.18], dark);
  addCylinder(root, 0.13, 0.19, 2.18, 9, [0, 1.82, -1.63], glow, [Math.PI / 2, 0, 0]);
  addBox(root, [1.1, 0.1, 0.18], [0, 1.64, -0.66], glow);
  for (const x of [-0.48, 0.48]) addSphere(root, 0.14, [x, 1.2, -1.45], glow, [1, 1, 1]);
  addCylinder(root, 0.03, 0.05, 0.8, 5, [-0.5, 1.98, 0.72], glow, [0, 0.12, -0.14]);
  return root;
}

function createPreviewTwinRailRavager() {
  const root = new THREE.Group();
  const red = getPreviewPanelMaterial('ravager-red', 0x8f3140, '#7c2a38', 'rgba(255, 179, 86, 0.32)', 'rgba(18, 10, 13, 0.55)');
  const dark = getPreviewMaterial('ravager-dark', 0x1a1519, 0.76, 0.2);
  const orange = getPreviewMaterial('ravager-orange', 0xffa24d, 0.34, 0.12, 0x6d2100);
  const steel = getPreviewMaterial('ravager-steel', 0x60686b, 0.58, 0.24);
  addBox(root, [3.36, 0.74, 3.6], [0, 0.76, 0.06], red);
  addBox(root, [2.22, 0.46, 2.05], [0, 1.28, 0.18], dark);
  addBox(root, [1.72, 0.2, 0.52], [0, 1.66, -1.08], orange);
  for (const side of [-1, 1]) {
    addBox(root, [0.54, 0.62, 3.88], [side * 1.9, 0.54, 0], dark);
    addBox(root, [0.44, 0.45, 1.78], [side * 1.66, 1.18, -0.88], steel);
    addBox(root, [0.28, 0.32, 1.72], [side * 0.42, 1.82, -1.68], orange, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) addCylinder(root, 0.2, 0.2, 0.12, 10, [side * 2.18, 0.52, -1.44 + i * 0.72], orange, [0, 0, Math.PI / 2]);
  }
  addCylinder(root, 0.85, 1.02, 0.54, 8, [0, 1.76, -0.28], dark);
  addCylinder(root, 0.1, 0.18, 2.9, 9, [-0.26, 1.82, -2.02], orange, [Math.PI / 2, 0, 0]);
  addCylinder(root, 0.1, 0.18, 2.9, 9, [0.26, 1.82, -2.02], orange, [Math.PI / 2, 0, 0]);
  const ram = addCone(root, 1.0, 1.55, 4, [0, 0.78, -2.04], steel, [-Math.PI / 2, Math.PI / 4, 0]);
  ram.scale.set(1.08, 0.68, 0.9);
  return root;
}

function createPreviewVantaSpearDrone() {
  const root = new THREE.Group();
  const hull = getPreviewPanelMaterial('vanta-drone', 0x9d3f58, '#8d334f', 'rgba(255, 184, 104, 0.3)', 'rgba(25, 15, 28, 0.54)', 0.5, 0.18);
  const dark = getPreviewMaterial('vanta-dark', 0x15131a, 0.74, 0.14);
  const glow = getPreviewMaterial('vanta-glow', 0xff744d, 0.26, 0.08, 0x912400);
  addSphere(root, 0.92, [0, 1.5, 0], hull, [1.28, 0.72, 1.05]);
  addBox(root, [4.2, 0.12, 0.38], [0, 1.45, 0.04], dark, [0, 0, 0.08]);
  addBox(root, [2.58, 0.12, 0.28], [0, 1.47, -0.55], dark, [0, 0.05, 0]);
  const spear = addCone(root, 0.42, 1.0, 4, [0, 1.5, -1.08], glow, [-Math.PI / 2, Math.PI / 4, 0]);
  spear.scale.set(0.76, 0.76, 0.76);
  for (const side of [-1, 1]) {
    addCylinder(root, 0.34, 0.34, 0.16, 10, [side * 1.82, 1.46, 0.08], dark);
    addBox(root, [1.16, 0.06, 0.22], [side * 1.82, 1.56, 0.08], glow, [0, side * 0.28, 0]);
    addBox(root, [1.16, 0.06, 0.22], [side * 1.82, 1.58, 0.08], glow, [0, Math.PI / 2 + side * 0.28, 0]);
    addCone(root, 0.42, 0.82, 3, [side * 0.86, 1.38, 0.72], dark, [Math.PI / 2, side * 0.2, side * 0.45]);
  }
  addSphere(root, 0.34, [0, 1.5, -0.5], glow, [1.1, 1.1, 1.1]);
  return root;
}

function createPreviewFortressCrusher() {
  const root = new THREE.Group();
  const red = getPreviewPanelMaterial('fortress-red', 0x963632, '#7f2e33', 'rgba(255, 211, 90, 0.32)', 'rgba(26, 13, 14, 0.56)', 0.64, 0.18);
  const dark = getPreviewMaterial('fortress-dark', 0x2a1619, 0.8, 0.16);
  const brass = getPreviewMaterial('fortress-brass', 0xefb75b, 0.45, 0.12);
  const steel = getPreviewMaterial('fortress-steel', 0x62686b, 0.62, 0.24);
  addBox(root, [5.8, 1.8, 4.5], [0, 1.05, 0], red);
  addBox(root, [6.7, 0.62, 4.9], [0, 0.48, 0], dark);
  const ram = addCone(root, 1.12, 1.65, 4, [0, 0.92, -2.64], steel, [-Math.PI / 2, Math.PI / 4, 0]);
  ram.scale.set(1.12, 0.78, 1);
  addCylinder(root, 1.45, 1.75, 0.72, 8, [0, 2.42, -0.25], dark);
  addCylinder(root, 0.22, 0.34, 3.5, 9, [0, 2.44, -2.35], brass, [Math.PI / 2, 0, 0]);
  addBox(root, [4.6, 0.18, 0.52], [0, 1.88, -2.34], brass);
  for (const side of [-1, 1]) {
    addBox(root, [0.72, 0.82, 5.05], [side * 3.42, 0.65, 0], dark);
    addBox(root, [1.0, 0.16, 0.64], [side * 1.55, 1.94, -1.68], brass, [0, 0, side * 0.07]);
    addBox(root, [0.42, 0.48, 1.52], [side * 2.72, 1.62, -0.98], steel);
    for (let i = 0; i < 5; i++) addCylinder(root, 0.24, 0.24, 0.14, 10, [side * 3.82, 0.58, -1.7 + i * 0.85], brass, [0, 0, Math.PI / 2]);
  }
  for (let i = 0; i < 5; i++) addBox(root, [0.45, 0.5, 0.2], [(i - 2) * 0.58, 3.0, -0.25], brass);
  return root;
}

function createPreviewObsidianGatebreaker() {
  const root = new THREE.Group();
  const black = getPreviewPanelMaterial('obsidian-black', 0x202228, '#202228', 'rgba(116, 217, 255, 0.26)', 'rgba(0, 0, 0, 0.56)', 0.62, 0.26);
  const red = getPreviewMaterial('obsidian-red', 0x9d3135, 0.56, 0.22);
  const glow = getPreviewMaterial('obsidian-glow', 0xffd15a, 0.34, 0.12, 0x7a3200);
  const steel = getPreviewMaterial('obsidian-steel', 0x6a7072, 0.58, 0.28);
  addBox(root, [6.2, 1.22, 5.0], [0, 0.88, 0], black);
  addBox(root, [4.86, 1.0, 3.12], [0, 1.84, 0.24], red);
  addBox(root, [3.7, 0.22, 0.64], [0, 2.32, -1.58], glow);
  for (let x = -1.2; x <= 1.2; x += 0.6) {
    const tooth = addCone(root, 0.28, 0.82, 4, [x, 0.7, -2.82], steel, [-Math.PI / 2, Math.PI / 4, 0]);
    tooth.scale.set(0.8, 0.8, 0.8);
  }
  for (const side of [-1, 1]) {
    addBox(root, [0.84, 0.82, 5.36], [side * 3.48, 0.58, 0], black);
    addCylinder(root, 0.18, 0.28, 3.5, 9, [side * 0.54, 2.58, -2.36], glow, [Math.PI / 2, 0, 0]);
    addCylinder(root, 0.94, 1.12, 0.5, 8, [side * 0.54, 2.48, -0.62], black);
    addBox(root, [0.5, 0.46, 1.5], [side * 2.72, 1.45, -1.2], steel);
    for (let i = 0; i < 5; i++) addCylinder(root, 0.24, 0.24, 0.14, 10, [side * 3.92, 0.54, -1.8 + i * 0.9], glow, [0, 0, Math.PI / 2]);
  }
  addCylinder(root, 1.0, 1.28, 0.88, 7, [0, 3.02, 0.52], red);
  addSphere(root, 0.38, [0, 3.58, 0.52], glow, [1, 1, 1]);
  return root;
}

function createPreviewGlassbreakerDrone() {
  const root = new THREE.Group();
  const red = getPreviewMaterial('drone-red', 0xb63e3a, 0.52, 0.18);
  const dark = getPreviewMaterial('drone-dark', 0x251b22, 0.7, 0.12);
  const glow = getPreviewMaterial('drone-core', 0xffc25d, 0.28, 0.08, 0x8a3b00);
  addSphere(root, 0.92, [0, 1.45, 0], red, [1.2, 0.72, 1.05]);
  addBox(root, [4.2, 0.12, 0.62], [0, 1.44, 0], dark, [0, 0, 0.1]);
  addBox(root, [0.62, 0.12, 3.1], [0, 1.36, 0], dark, [0.14, 0, 0]);
  addSphere(root, 0.34, [0, 1.48, -0.74], glow, [1, 1, 1]);
  for (const x of [-1.9, 1.9]) addCylinder(root, 0.22, 0.28, 0.28, 8, [x, 1.46, 0], glow);
  return root;
}

function createPreviewShieldRig() {
  const root = new THREE.Group();
  const blue = getPreviewMaterial('shield-blue', 0x54d8ff, 0.36, 0.08, 0x0c4b64);
  const steel = getPreviewMaterial('shield-steel', 0x56646a, 0.62, 0.18);
  const dark = getPreviewMaterial('shield-dark', 0x172125, 0.72, 0.12);
  addBox(root, [2.8, 0.62, 2.4], [0, 0.55, 0], steel);
  addCylinder(root, 0.55, 0.75, 1.8, 8, [0, 1.52, 0], dark);
  addCylinder(root, 1.55, 1.55, 0.08, 32, [0, 2.1, 0], blue, [Math.PI / 2, 0, 0]);
  addCylinder(root, 2.15, 2.15, 0.08, 32, [0, 2.1, 0], blue, [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) addBox(root, [0.34, 0.52, 2.6], [side * 1.58, 0.42, 0], dark);
  return root;
}

function createPreviewMagnetHarvester() {
  const root = new THREE.Group();
  const gold = getPreviewMaterial('magnet-gold', 0xf0bc52, 0.42, 0.12);
  const cyan = getPreviewMaterial('magnet-cyan', 0x54d8ff, 0.3, 0.08, 0x154858);
  const base = getPreviewMaterial('magnet-base', 0x3a474a, 0.72, 0.14);
  addBox(root, [2.5, 0.52, 2.5], [0, 0.28, 0], base);
  addCylinder(root, 0.42, 0.6, 2.3, 10, [0, 1.58, 0], gold);
  addCylinder(root, 1.42, 1.42, 0.12, 24, [0, 2.25, 0], cyan, [Math.PI / 2, 0, 0]);
  addCylinder(root, 1.1, 1.1, 0.12, 24, [0, 2.85, 0], cyan, [Math.PI / 2, 0, 0]);
  addSphere(root, 0.44, [0, 3.18, 0], gold, [1, 1, 1]);
  return root;
}

function createPreviewVoltMagnetSkimmer() {
  const root = new THREE.Group();
  const teal = getPreviewPanelMaterial('volt-teal', 0x2f8f8c, '#2a7a78', 'rgba(255, 230, 130, 0.34)', 'rgba(13, 34, 36, 0.48)', 0.48, 0.14);
  const dark = getPreviewMaterial('volt-dark', 0x19272a, 0.72, 0.16);
  const gold = getPreviewMaterial('volt-gold', 0xffd15a, 0.34, 0.18, 0x5d3100);
  const cyan = getPreviewMaterial('volt-cyan', 0x54d8ff, 0.28, 0.08, 0x164a55);
  addBox(root, [3.15, 0.5, 2.65], [0, 0.58, 0], teal);
  addBox(root, [2.16, 0.62, 1.64], [0, 1.12, -0.08], dark, [0, 0.08, 0]);
  addCylinder(root, 0.32, 0.45, 1.68, 9, [0, 1.78, 0.28], gold);
  addCylinder(root, 1.22, 1.22, 0.08, 24, [0, 2.2, 0.28], cyan, [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    addBox(root, [0.28, 0.18, 2.85], [side * 1.78, 0.8, 0], gold, [0, side * 0.08, side * 0.2]);
    addBox(root, [0.36, 0.24, 1.28], [side * 1.22, 1.22, -0.92], cyan, [0, side * 0.22, 0]);
    addCylinder(root, 0.24, 0.24, 0.14, 10, [side * 1.82, 0.44, -0.88], gold, [0, 0, Math.PI / 2]);
    addCylinder(root, 0.24, 0.24, 0.14, 10, [side * 1.82, 0.44, 0.92], gold, [0, 0, Math.PI / 2]);
  }
  addSphere(root, 0.42, [0, 1.28, -1.18], cyan, [1, 0.72, 1]);
  return root;
}

function createPreviewRailgunSentry() {
  const root = new THREE.Group();
  const steel = getPreviewMaterial('rail-steel', 0x5d6669, 0.58, 0.22);
  const dark = getPreviewMaterial('rail-dark', 0x182022, 0.72, 0.16);
  const orange = getPreviewMaterial('rail-orange', 0xff9954, 0.34, 0.08, 0x5a1f00);
  addCylinder(root, 0.9, 1.15, 0.7, 8, [0, 0.7, 0], dark);
  addBox(root, [1.7, 0.62, 1.4], [0, 1.28, 0], steel);
  addBox(root, [0.32, 0.32, 3.8], [-0.32, 1.36, -1.8], dark);
  addBox(root, [0.32, 0.32, 3.8], [0.32, 1.36, -1.8], dark);
  addBox(root, [0.92, 0.2, 0.22], [0, 1.36, -3.72], orange);
  for (const x of [-1.28, 1.28]) addBox(root, [0.24, 0.2, 2.5], [x, 0.18, 0.35], dark, [0, 0, x * 0.18]);
  return root;
}

function createPreviewShardRamRoller() {
  const root = new THREE.Group();
  const red = getPreviewMaterial('ram-red', 0x9e3832, 0.66, 0.16);
  const dark = getPreviewMaterial('ram-dark', 0x20191a, 0.82, 0.16);
  const glass = getPreviewMaterial('ram-glass', 0xa9f5ff, 0.18, 0.02, 0x155c66);
  const steel = getPreviewMaterial('ram-steel', 0x6b7172, 0.62, 0.24);
  addCylinder(root, 0.82, 0.82, 2.72, 10, [0, 0.72, 0], red, [Math.PI / 2, 0, 0]);
  addBox(root, [2.62, 0.52, 1.35], [0, 1.18, 0.14], dark);
  addBox(root, [2.9, 0.24, 0.36], [0, 1.28, -1.18], steel);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.38;
    const tooth = addCone(root, 0.16, 0.58, 4, [x, 1.1, -1.48], glass, [-Math.PI / 2, Math.PI / 4, 0]);
    tooth.scale.set(0.85, 0.85, 0.85);
  }
  for (const side of [-1, 1]) {
    addCylinder(root, 0.34, 0.34, 0.18, 12, [side * 1.55, 0.55, -0.76], glass, [0, 0, Math.PI / 2]);
    addCylinder(root, 0.34, 0.34, 0.18, 12, [side * 1.55, 0.55, 0.76], glass, [0, 0, Math.PI / 2]);
    addBox(root, [0.34, 0.18, 1.9], [side * 1.32, 1.14, 0.08], steel);
  }
  addSphere(root, 0.24, [0, 1.52, -0.72], glass, [1, 0.72, 1]);
  return root;
}

function createPreviewGatePylon() {
  const root = new THREE.Group();
  const glass = getPreviewMaterial('pylon-glass', 0x91f0ff, 0.22, 0.02, 0x12495a);
  const red = getPreviewMaterial('pylon-red', 0xff8a82, 0.26, 0.02, 0x571111);
  const post = getPreviewMaterial('pylon-post', 0x2a4d58, 0.54, 0.1);
  for (const x of [-1.7, 1.7]) addBox(root, [0.26, 3.7, 0.26], [x, 1.85, 0], post);
  addBox(root, [3.2, 2.8, 0.14], [0, 1.9, 0], glass, [0, 0.15, 0]);
  addBox(root, [1.25, 1.05, 0.16], [-0.58, 2.0, 0.12], red, [0, -0.18, 0.1]);
  addBox(root, [1.25, 1.05, 0.16], [0.74, 1.58, 0.14], glass, [0, 0.2, -0.12]);
  return root;
}

function createPreviewPrismCommandGate() {
  const root = new THREE.Group();
  const cyan = getPreviewMaterial('prism-cyan', 0x91f0ff, 0.14, 0.02, 0x12495a);
  const amber = getPreviewMaterial('prism-amber', 0xffc25d, 0.18, 0.04, 0x5c2600);
  const red = getPreviewMaterial('prism-red', 0xff8a82, 0.2, 0.02, 0x571111);
  const post = getPreviewMaterial('prism-post', 0x244c58, 0.5, 0.12);
  for (const x of [-2.0, 2.0]) {
    addBox(root, [0.34, 3.92, 0.34], [x, 1.96, 0], post);
    addCylinder(root, 0.28, 0.38, 0.42, 7, [x, 4.08, 0], amber);
  }
  addBox(root, [4.15, 0.28, 0.28], [0, 3.72, 0], post);
  addBox(root, [3.28, 2.58, 0.12], [0, 1.94, 0], cyan, [0, 0.12, 0.04]);
  addBox(root, [1.2, 1.04, 0.16], [-0.76, 2.08, 0.18], amber, [0, -0.22, 0.12]);
  addBox(root, [1.08, 0.94, 0.18], [0.82, 1.62, 0.22], red, [0, 0.24, -0.12]);
  addBox(root, [1.36, 0.18, 0.18], [0, 2.8, 0.26], amber);
  addSphere(root, 0.28, [0, 1.98, 0.34], cyan, [1, 1, 1]);
  return root;
}

function createPreviewFinishArch() {
  const root = new THREE.Group();
  const gold = getPreviewMaterial('arch-gold', 0xf4c75d, 0.44, 0.12);
  const white = getPreviewMaterial('arch-white', 0xf8faf4, 0.62, 0.04);
  const dark = getPreviewMaterial('arch-dark', 0x15191d, 0.7, 0.04);
  for (const x of [-2.8, 2.8]) {
    addBox(root, [0.36, 4.1, 0.36], [x, 2.05, 0], gold);
    addCylinder(root, 0.38, 0.5, 0.46, 8, [x, 4.38, 0], white);
  }
  addBox(root, [6.2, 0.45, 0.42], [0, 4.05, 0], gold);
  for (let i = 0; i < 8; i++) addBox(root, [0.56, 0.08, 0.56], [-2 + i * 0.58, 0.06, 0], i % 2 ? dark : white);
  return root;
}

function createPreviewPineBarricade() {
  const root = new THREE.Group();
  const greens = [
    getPreviewMaterial('pine-dark', 0x24462d, 0.86, 0.02),
    getPreviewMaterial('pine-mid', 0x2f5837, 0.82, 0.02),
    getPreviewMaterial('pine-light', 0x3f7342, 0.8, 0.02)
  ];
  const trunk = getPreviewMaterial('pine-trunk', 0x65452e, 0.84, 0.02);
  for (let t = 0; t < 3; t++) {
    const x = (t - 1) * 1.2;
    addCylinder(root, 0.16, 0.25, 1.15, 6, [x, 0.58, 0], trunk);
    for (let i = 0; i < 3; i++) addCone(root, 0.78 - i * 0.12, 1.35 - i * 0.12, 7, [x, 1.22 + i * 0.45, 0], greens[i]);
  }
  addBox(root, [4.3, 0.26, 0.52], [0, 0.17, 0.66], getPreviewMaterial('pine-log', 0x705039, 0.8, 0.02), [0, 0.12, 0]);
  return root;
}

function createPreviewCoinTruck() {
  const root = new THREE.Group();
  const green = getPreviewMaterial('truck-green', 0x486c58, 0.64, 0.14);
  const dark = getPreviewMaterial('truck-dark', 0x1d282b, 0.76, 0.18);
  const gold = getPreviewMaterial('truck-gold', 0xffd15a, 0.38, 0.22, 0x4a2b00);
  addBox(root, [3.6, 0.7, 3.4], [0, 0.62, 0], dark);
  addBox(root, [2.8, 1.05, 2.1], [0, 1.24, 0.4], green);
  addBox(root, [2.2, 0.82, 1.2], [0, 1.24, -1.45], gold);
  for (const x of [-1.9, 1.9]) for (const z of [-1.1, 1.1]) addCylinder(root, 0.28, 0.28, 0.16, 12, [x, 0.42, z], gold, [0, 0, Math.PI / 2]);
  return root;
}

function createPreviewOverdriveCore() {
  const root = new THREE.Group();
  const core = getPreviewMaterial('core-cyan', 0x54d8ff, 0.28, 0.06, 0x164a55);
  const orange = getPreviewMaterial('core-orange', 0xff8b50, 0.34, 0.08, 0x6a2400);
  const dark = getPreviewMaterial('core-dark', 0x182024, 0.72, 0.12);
  addCylinder(root, 0.92, 1.1, 0.36, 12, [0, 0.25, 0], dark);
  addSphere(root, 0.82, [0, 1.38, 0], core, [1, 1.18, 1]);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const fin = addBox(root, [0.22, 1.35, 0.58], [Math.cos(angle) * 1.05, 1.38, Math.sin(angle) * 1.05], orange, [0, angle, 0]);
    fin.rotation.z = 0.2;
  }
  addCylinder(root, 1.55, 1.55, 0.08, 24, [0, 1.38, 0], core, [Math.PI / 2, 0, 0]);
  return root;
}

function createPreviewCobaltRepairCrawler() {
  const root = new THREE.Group();
  const blue = getPreviewPanelMaterial('cobalt-blue', 0x3f7fa0, '#346f8d', 'rgba(184, 247, 255, 0.34)', 'rgba(14, 28, 36, 0.46)', 0.56, 0.14);
  const dark = getPreviewMaterial('cobalt-dark', 0x17232a, 0.76, 0.16);
  const cyan = getPreviewMaterial('cobalt-cyan', 0x54d8ff, 0.26, 0.08, 0x164a55);
  const steel = getPreviewMaterial('cobalt-steel', 0x677176, 0.62, 0.22);
  addBox(root, [3.2, 0.58, 2.85], [0, 0.58, 0], blue);
  addBox(root, [2.26, 0.76, 1.6], [0, 1.18, -0.1], dark);
  addCylinder(root, 0.55, 0.74, 0.48, 8, [0, 1.74, -0.18], blue);
  addCylinder(root, 0.1, 0.16, 1.55, 8, [0, 1.78, -1.25], cyan, [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    addBox(root, [0.42, 0.48, 3.05], [side * 1.6, 0.44, 0], dark);
    addBox(root, [0.26, 0.92, 0.18], [side * 1.18, 1.34, 0.82], steel, [0, 0, side * 0.22]);
    addSphere(root, 0.24, [side * 0.96, 1.8, 0.88], cyan, [1, 1, 1]);
    for (let i = 0; i < 4; i++) addCylinder(root, 0.2, 0.2, 0.12, 10, [side * 1.84, 0.44, -1.12 + i * 0.74], cyan, [0, 0, Math.PI / 2]);
  }
  addCylinder(root, 1.18, 1.18, 0.06, 24, [0, 1.66, 0.22], cyan, [Math.PI / 2, 0, 0]);
  return root;
}

function formatGateValue(spec) {
  if (spec.op === 'mul') return `*${spec.amount}`;
  return `${spec.amount > 0 ? '+' : ''}${spec.amount}`;
}

function makeGateTextSprite(spec, typeConfig) {
  const key = `${spec.type}:${spec.op}:${spec.amount}`;
  if (gateTextureCache.has(key)) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: gateTextureCache.get(key), transparent: true, depthWrite: false }));
  }

  const textCanvas = document.createElement('canvas');
  textCanvas.width = 512;
  textCanvas.height = 384;
  const ctx = textCanvas.getContext('2d');
  ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);

  const good = spec.amount > 0;
  ctx.fillStyle = good ? 'rgba(4, 42, 52, 0.42)' : 'rgba(78, 12, 18, 0.45)';
  roundRect(ctx, 74, 48, 364, 288, 34);
  ctx.fill();
  ctx.strokeStyle = good ? 'rgba(220, 255, 255, 0.92)' : 'rgba(255, 224, 224, 0.92)';
  ctx.lineWidth = 8;
  roundRect(ctx, 74, 48, 364, 288, 34);
  ctx.stroke();

  drawGateIcon(ctx, spec.type, typeConfig.color, 256, 136, good);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
  ctx.lineWidth = 12;
  ctx.font = '950 92px system-ui, sans-serif';
  const value = formatGateValue(spec);
  ctx.strokeText(value, 256, 260);
  ctx.fillStyle = good ? '#dffcff' : '#ffe5df';
  ctx.fillText(value, 256, 260);

  const texture = new THREE.CanvasTexture(textCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  gateTextureCache.set(key, texture);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  return sprite;
}

function drawGateIcon(ctx, type, color, x, y, good) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;

  if (type === 'strength') {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.beginPath();
    ctx.moveTo(-78, 36);
    ctx.quadraticCurveTo(-48, -26, 10, -18);
    ctx.quadraticCurveTo(72, -8, 76, 48);
    ctx.stroke();
    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(-72, 32);
    ctx.quadraticCurveTo(-46, -26, 6, -20);
    ctx.quadraticCurveTo(58, -14, 66, 32);
    ctx.stroke();
    ctx.fillStyle = good ? '#fff8dc' : '#ffe0dc';
    ctx.beginPath();
    ctx.arc(46, -34, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 12;
    ctx.stroke();
  } else if (type === 'defense') {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.moveTo(0, -78);
    ctx.lineTo(70, -44);
    ctx.lineTo(56, 32);
    ctx.quadraticCurveTo(34, 72, 0, 88);
    ctx.quadraticCurveTo(-34, 72, -56, 32);
    ctx.lineTo(-70, -44);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(0, 50);
    ctx.moveTo(-36, -16);
    ctx.lineTo(36, -16);
    ctx.stroke();
  } else {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.lineWidth = 12;
    roundRect(ctx, -76, -10, 152, 64, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-42, 58, 18, 0, Math.PI * 2);
    ctx.arc(42, 58, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -22, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(14, -28);
    ctx.lineTo(76, -54);
    ctx.stroke();
  }
  ctx.restore();
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

function createArmorPanelTexture(key, base, line, shadow) {
  if (armorTextureCache.has(key)) return armorTextureCache.get(key);
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const ctx = textureCanvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = shadow;
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(8 + i * 25, 0, 7, 128);
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  for (let y = 18; y < 128; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 14);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  for (let x = 16; x < 128; x += 32) {
    ctx.strokeRect(x, 12, 23, 22);
    ctx.strokeRect(x - 7, 62, 24, 24);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.4);
  armorTextureCache.set(key, texture);
  return texture;
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

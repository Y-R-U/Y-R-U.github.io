import * as THREE from 'three';

const canvas = document.getElementById('space-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const cockpitCtx = cockpitCanvas.getContext('2d');
const gameEl = document.getElementById('game');
const hudEl = document.getElementById('hud');
const menuEl = document.getElementById('menu');
const resultEl = document.getElementById('result');
const reticleEl = document.getElementById('reticle');
const fireButton = document.getElementById('fire-button');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const damageFlash = document.getElementById('damage-flash');

const scoreValue = document.getElementById('score-value');
const shieldValue = document.getElementById('shield-value');
const heatValue = document.getElementById('heat-value');
const shieldMeter = document.getElementById('shield-meter');
const heatMeter = document.getElementById('heat-meter');
const sectorValue = document.getElementById('sector-value');
const threatValue = document.getElementById('threat-value');
const resultScore = document.getElementById('result-score');
const resultBest = document.getElementById('result-best');
const resultWave = document.getElementById('result-wave');
const resultTitle = document.getElementById('result-title');
const resultKicker = document.getElementById('result-kicker');
const resultMessage = document.getElementById('result-message');
const resultLock = document.getElementById('result-lock');
const resultLockText = resultLock?.querySelector('span');
const resultLockBar = resultLock?.querySelector('i');

const BEST_KEY = 'outpace-best';
const LEGACY_BEST_KEY = 'void-cockpit-best';
const RESULT_LOCK_MS = 3200;
let resultUnlockTimeout = 0;
let resultCountdownTimer = 0;

const clock = new THREE.Clock();
const params = new URLSearchParams(window.location.search);
const pointer = new THREE.Vector2();
const tmpVector = new THREE.Vector3();
const tmpVectorB = new THREE.Vector3();
const tmpColor = new THREE.Color();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const state = {
  running: false,
  demo: params.has('demo'),
  demoResult: params.has('demoResult'),
  time: 0,
  score: 0,
  best: Number(localStorage.getItem(BEST_KEY) || localStorage.getItem(LEGACY_BEST_KEY) || 0),
  shield: 100,
  heat: 0,
  wave: 1,
  speed: 48,
  spawnTimer: 0,
  stationTimer: 3,
  collectTimer: 5,
  shotTimer: 0,
  threat: 0,
  shake: 0,
  flashTimer: 0,
  player: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  pointerDown: false,
  firing: false,
  resultLocked: false,
  cockpitReady: false,
  objects: [],
  beams: [],
  particles: [],
  sparks: [],
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x020205, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050608, 0.0066);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
camera.position.set(0, 0, 4);

const ambient = new THREE.HemisphereLight(0x9ee8ff, 0x27170f, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffd3a1, 3.6);
sun.position.set(-18, 26, 20);
scene.add(sun);

const cockpitLight = new THREE.PointLight(0x54dfff, 2.2, 60, 1.6);
cockpitLight.position.set(0, -4, 5);
scene.add(cockpitLight);

const warmLight = new THREE.PointLight(0xff743a, 1.4, 42, 1.7);
warmLight.position.set(7, -8, 3);
scene.add(warmLight);

const materials = {
  asteroid: [
    new THREE.MeshStandardMaterial({ color: 0x6d5b4d, roughness: 0.92, metalness: 0.08, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x50423a, roughness: 0.96, metalness: 0.04, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7c7468, roughness: 0.9, metalness: 0.1, flatShading: true }),
  ],
  drone: new THREE.MeshStandardMaterial({ color: 0x243642, roughness: 0.42, metalness: 0.72, flatShading: true }),
  droneWing: new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.48, metalness: 0.78, flatShading: true }),
  droneGlow: new THREE.MeshStandardMaterial({ color: 0xff7b39, emissive: 0xff3d1c, emissiveIntensity: 2.8, roughness: 0.22, metalness: 0.2 }),
  station: new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: 0.36, metalness: 0.86, flatShading: true }),
  stationDark: new THREE.MeshStandardMaterial({ color: 0x080c11, roughness: 0.5, metalness: 0.7, flatShading: true }),
  stationGlow: new THREE.MeshStandardMaterial({ color: 0x56e4ff, emissive: 0x19cfff, emissiveIntensity: 2.1, roughness: 0.25, metalness: 0.25 }),
  amberGlow: new THREE.MeshStandardMaterial({ color: 0xffb455, emissive: 0xff7e2f, emissiveIntensity: 2.1, roughness: 0.28, metalness: 0.25 }),
  collect: new THREE.MeshStandardMaterial({ color: 0x89ffb0, emissive: 0x39ff74, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.45 }),
};

const beamMaterial = new THREE.LineBasicMaterial({
  color: 0x88f3ff,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
});

const enemyBeamMaterial = new THREE.LineBasicMaterial({
  color: 0xff7746,
  transparent: true,
  opacity: 0.66,
  blending: THREE.AdditiveBlending,
});

const particleMaterial = new THREE.PointsMaterial({
  size: 1.1,
  color: 0xffb15c,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const starGeometry = new THREE.BufferGeometry();
const starCount = 980;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);

function resetStar(index, deep = true) {
  const i = index * 3;
  const radius = rand(8, 180);
  const angle = rand(0, Math.PI * 2);
  starPositions[i] = Math.cos(angle) * radius + rand(-16, 16);
  starPositions[i + 1] = Math.sin(angle) * radius * 0.72 + rand(-22, 22);
  starPositions[i + 2] = deep ? rand(-780, -40) : rand(-780, -620);
  tmpColor.setHSL(pick([0.08, 0.52, 0.58, 0.02]), rand(0.18, 0.72), rand(0.62, 1));
  starColors[i] = tmpColor.r;
  starColors[i + 1] = tmpColor.g;
  starColors[i + 2] = tmpColor.b;
}

for (let i = 0; i < starCount; i += 1) resetStar(i);
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    size: 0.95,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
scene.add(stars);

function createNebulaTexture(stops) {
  const texCanvas = document.createElement('canvas');
  texCanvas.width = 256;
  texCanvas.height = 256;
  const ctx = texCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(texCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const nebulaTextures = [
  createNebulaTexture([[0, 'rgba(255,154,66,0.95)'], [0.28, 'rgba(173,68,51,0.34)'], [1, 'rgba(0,0,0,0)']]),
  createNebulaTexture([[0, 'rgba(90,231,255,0.72)'], [0.34, 'rgba(39,124,142,0.22)'], [1, 'rgba(0,0,0,0)']]),
  createNebulaTexture([[0, 'rgba(210,113,255,0.48)'], [0.28, 'rgba(84,44,116,0.20)'], [1, 'rgba(0,0,0,0)']]),
];

const nebulae = [];
for (let i = 0; i < 9; i += 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: pick(nebulaTextures),
    transparent: true,
    opacity: rand(0.14, 0.32),
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.position.set(rand(-150, 150), rand(-105, 110), rand(-720, -160));
  const scale = rand(72, 160);
  sprite.scale.set(scale, scale * rand(0.58, 1.18), 1);
  sprite.userData.spin = rand(-0.04, 0.04);
  scene.add(sprite);
  nebulae.push(sprite);
}

function makeAsteroidGeometry(radius) {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    tmpVector.fromBufferAttribute(position, i).normalize();
    const crag = 0.72 + Math.random() * 0.48;
    const ridge = Math.sin(tmpVector.x * 7.1 + tmpVector.y * 4.3) * 0.12;
    position.setXYZ(i, tmpVector.x * radius * (crag + ridge), tmpVector.y * radius * (crag - ridge * 0.4), tmpVector.z * radius * (crag + ridge * 0.7));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addGlowPanel(parent, x, y, z, sx, sy, sz, material = materials.stationGlow) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  panel.position.set(x, y, z);
  parent.add(panel);
  return panel;
}

function createAsteroid() {
  const size = rand(1.25, 4.4) + state.wave * 0.07;
  const mesh = new THREE.Mesh(makeAsteroidGeometry(size), pick(materials.asteroid));
  mesh.position.set(rand(-18, 18), rand(-10, 11), rand(-185, -120));
  mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  mesh.userData = {
    kind: 'asteroid',
    radius: size * 0.9,
    spin: new THREE.Vector3(rand(-1.2, 1.2), rand(-1.2, 1.2), rand(-1.2, 1.2)),
    hp: size > 3.2 ? 2 : 1,
    value: Math.round(size * 36),
    speedScale: rand(0.86, 1.18),
    passed: false,
  };
  scene.add(mesh);
  state.objects.push(mesh);
  return mesh;
}

function createDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.05, 3.1, 4), materials.drone);
  body.rotation.x = -Math.PI / 2;
  group.add(body);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.44, 3.2), materials.droneWing);
  group.add(spine);

  const wingGeometry = new THREE.BoxGeometry(3.6, 0.22, 0.8);
  const wingA = new THREE.Mesh(wingGeometry, materials.droneWing);
  wingA.position.set(0, -0.15, -0.25);
  wingA.rotation.z = 0.16;
  group.add(wingA);

  const wingB = wingA.clone();
  wingB.rotation.z = -0.16;
  group.add(wingB);

  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), materials.droneGlow);
  engine.position.set(0, -0.02, 1.42);
  group.add(engine);

  group.position.set(rand(-16, 16), rand(-8.5, 10), rand(-170, -115));
  group.rotation.set(rand(-0.24, 0.24), rand(-0.4, 0.4), rand(-0.18, 0.18));
  group.userData = {
    kind: 'drone',
    radius: 1.65,
    hp: state.wave > 4 ? 2 : 1,
    value: 180 + state.wave * 18,
    speedScale: rand(0.98, 1.28),
    strafe: rand(0.7, 1.6),
    phase: rand(0, Math.PI * 2),
    shot: rand(0.8, 1.7),
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
  return group;
}

function createCollector() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 10, 42), materials.collect);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.54, 0), materials.collect);
  group.add(ring, core);
  group.position.set(rand(-13, 13), rand(-8, 8), rand(-145, -110));
  group.userData = {
    kind: 'collector',
    radius: 1.7,
    hp: 1,
    value: 90,
    speedScale: 1,
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
}

function createStation() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(10, 3.8, 7), materials.station);
  group.add(core);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.55, 14, 58), materials.stationDark);
  ring.position.z = -0.9;
  group.add(ring);

  const armGeometry = new THREE.BoxGeometry(18, 0.7, 1.1);
  const armA = new THREE.Mesh(armGeometry, materials.station);
  const armB = armA.clone();
  armB.rotation.z = Math.PI / 2;
  group.add(armA, armB);

  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    addGlowPanel(group, Math.cos(angle) * 8.4, Math.sin(angle) * 8.4, 0.2, 0.36, 0.72, 0.14, i % 3 ? materials.stationGlow : materials.amberGlow);
  }

  addGlowPanel(group, -2.8, 2.2, 3.75, 1.7, 0.26, 0.18, materials.stationGlow);
  addGlowPanel(group, 2.7, -2.1, 3.75, 1.5, 0.26, 0.18, materials.amberGlow);

  const side = Math.random() > 0.5 ? 1 : -1;
  group.position.set(side * rand(18, 34), rand(-7, 11), rand(-335, -245));
  group.rotation.set(rand(-0.2, 0.2), side * rand(0.28, 0.62), rand(-0.3, 0.3));
  const scale = rand(0.9, 1.45);
  group.scale.setScalar(scale);
  group.userData = {
    kind: 'station',
    radius: 10 * scale,
    hp: 999,
    value: 0,
    speedScale: 0.5,
    drift: side * rand(0.8, 1.8),
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
}

function createBeam(start, end, material = beamMaterial, ttl = 0.12) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, material.clone());
  line.userData.ttl = ttl;
  line.userData.life = ttl;
  scene.add(line);
  state.beams.push(line);
  return line;
}

function createExplosion(position, color = 0xffa356, count = 26) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push(new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)).normalize().multiplyScalar(rand(5, 18)));
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = particleMaterial.clone();
  material.color.set(color);
  const points = new THREE.Points(geometry, material);
  points.userData = { ttl: 0.68, life: 0.68, velocities };
  scene.add(points);
  state.particles.push(points);
}

function removeObject(object) {
  scene.remove(object);
  object.traverse?.((child) => {
    if (child.geometry && child !== object) child.geometry.dispose?.();
  });
  if (object.geometry) object.geometry.dispose();
}

function setGameState(nextState) {
  gameEl.dataset.state = nextState;
  document.documentElement.dataset.gameState = nextState;
}

function clearResultLock() {
  window.clearTimeout(resultUnlockTimeout);
  window.clearInterval(resultCountdownTimer);
  resultUnlockTimeout = 0;
  resultCountdownTimer = 0;
  state.resultLocked = false;
  restartButton.disabled = false;
  restartButton.textContent = 'Relaunch';
  if (resultLockText) resultLockText.textContent = 'Telemetry saved';
  if (resultLockBar) resultLockBar.style.transform = 'scaleX(1)';
}

function lockResultScreen(duration = RESULT_LOCK_MS) {
  window.clearTimeout(resultUnlockTimeout);
  window.clearInterval(resultCountdownTimer);
  const unlockAt = performance.now() + duration;
  state.resultLocked = true;
  restartButton.disabled = true;

  const update = () => {
    const remainingMs = Math.max(0, unlockAt - performance.now());
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const progress = clamp(1 - remainingMs / duration, 0, 1);
    restartButton.textContent = `Telemetry ${seconds}`;
    if (resultLockText) resultLockText.textContent = 'Saving telemetry';
    if (resultLockBar) resultLockBar.style.transform = `scaleX(${progress})`;
  };

  update();
  resultCountdownTimer = window.setInterval(update, 100);
  resultUnlockTimeout = window.setTimeout(clearResultLock, duration);
}

function resetGame() {
  if (state.resultLocked) return;
  clearResultLock();
  for (const object of state.objects) removeObject(object);
  for (const beam of state.beams) {
    scene.remove(beam);
    beam.geometry.dispose();
    beam.material.dispose();
  }
  for (const particle of state.particles) {
    scene.remove(particle);
    particle.geometry.dispose();
    particle.material.dispose();
  }
  state.objects.length = 0;
  state.beams.length = 0;
  state.particles.length = 0;
  state.running = true;
  state.time = 0;
  state.score = 0;
  state.shield = 100;
  state.heat = 0;
  state.wave = 1;
  state.speed = 48;
  state.spawnTimer = 0.2;
  state.stationTimer = 1.2;
  state.collectTimer = 3.2;
  state.threat = 0;
  state.shake = 0;
  state.player.x = 0;
  state.player.y = 0;
  state.target.x = 0;
  state.target.y = 0;

  menuEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  reticleEl.classList.remove('hidden');
  fireButton.classList.remove('hidden');
  setGameState('playing');

  for (let i = 0; i < 8; i += 1) {
    if (i % 3 === 0) createDrone();
    else createAsteroid();
  }
  if (state.demoResult) {
    window.setTimeout(() => {
      state.score = Math.max(state.score, 860);
      state.wave = Math.max(state.wave, 4);
      finishGame();
    }, 900);
  }
  updateHud();
}

function finishGame() {
  if (!state.running && gameEl.dataset.state === 'result') return;
  state.running = false;
  state.firing = false;
  state.pointerDown = false;
  const finalScore = Math.round(state.score);
  const previousBest = state.best;
  state.best = Math.max(state.best, finalScore);
  localStorage.setItem(BEST_KEY, String(state.best));
  resultScore.textContent = String(finalScore);
  resultBest.textContent = String(state.best);
  resultWave.textContent = String(state.wave);
  resultTitle.textContent = state.demo ? 'Flight Logged' : finalScore > previousBest ? 'New Record' : 'Outpaced';
  resultKicker.textContent = state.demo ? 'flight recorder' : 'run complete';
  if (resultMessage) {
    resultMessage.textContent = state.demo
      ? `Demo run sealed at ${finalScore} points through wave ${state.wave}.`
      : `You pushed through wave ${state.wave} and banked ${finalScore} points before the field caught you.`;
  }
  resultEl.classList.remove('hidden');
  fireButton.classList.add('hidden');
  setGameState('result');
  lockResultScreen();
}

function firePulse() {
  if (!state.running || state.shotTimer > 0 || state.heat > 92) return;
  state.shotTimer = 0.14;
  state.heat = clamp(state.heat + 17, 0, 100);

  const aimNdc = getAimNdc();
  let bestTarget = null;
  let bestDistance = Infinity;
  for (const object of state.objects) {
    if (object.userData.kind === 'station' || object.position.z > -4) continue;
    object.getWorldPosition(tmpVector);
    tmpVector.project(camera);
    const dx = tmpVector.x - aimNdc.x;
    const dy = tmpVector.y - aimNdc.y;
    const screenDistance = Math.hypot(dx, dy);
    const threshold = object.userData.kind === 'asteroid' ? 0.13 : 0.16;
    if (screenDistance < threshold && screenDistance < bestDistance) {
      bestDistance = screenDistance;
      bestTarget = object;
    }
  }

  const ray = new THREE.Vector3(aimNdc.x, aimNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const endpoint = camera.position.clone().add(ray.multiplyScalar(140));
  if (bestTarget) bestTarget.getWorldPosition(endpoint);
  createBeam(camera.position.clone(), endpoint, beamMaterial, 0.13);

  if (bestTarget) {
    bestTarget.userData.hp -= 1;
    state.score += bestTarget.userData.kind === 'drone' ? 45 : 20;
    cockpitLight.intensity = 4.5;
    if (bestTarget.userData.hp <= 0) {
      bestTarget.getWorldPosition(tmpVectorB);
      createExplosion(tmpVectorB, bestTarget.userData.kind === 'drone' ? 0xff7e40 : 0xffc175, bestTarget.userData.kind === 'drone' ? 34 : 24);
      state.score += bestTarget.userData.value;
      state.objects.splice(state.objects.indexOf(bestTarget), 1);
      removeObject(bestTarget);
    }
  }

  updateHud();
}

function getAimNdc() {
  return {
    x: clamp(state.target.x * 0.72, -0.84, 0.84),
    y: clamp(state.target.y * 0.62, -0.66, 0.78),
  };
}

function damage(amount) {
  state.shield = clamp(state.shield - amount, 0, 100);
  state.shake = Math.max(state.shake, amount * 0.013);
  state.flashTimer = 0.15;
  damageFlash.classList.add('active');
  updateHud();
  if (state.shield <= 0) finishGame();
}

function updateHud() {
  scoreValue.textContent = String(Math.round(state.score));
  shieldValue.textContent = String(Math.round(state.shield));
  heatValue.textContent = String(Math.round(state.heat));
  shieldMeter.style.width = `${state.shield}%`;
  heatMeter.style.width = `${state.heat}%`;
  sectorValue.textContent = `CINDERS / ${String(state.wave).padStart(2, '0')}`;
  threatValue.textContent = state.threat > 4 ? 'CONTACT' : state.threat > 1 ? 'TRACE' : 'CLEAR';
}

function updateReticle() {
  const x = window.innerWidth * 0.5 + state.target.x * window.innerWidth * 0.23;
  const y = window.innerHeight * 0.46 - state.target.y * window.innerHeight * 0.18;
  reticleEl.style.left = `${x}px`;
  reticleEl.style.top = `${y}px`;
}

function updateInputFromPointer(event) {
  const x = event.clientX / Math.max(1, window.innerWidth);
  const y = event.clientY / Math.max(1, window.innerHeight);
  state.target.x = clamp((x - 0.5) * 2.35, -1, 1);
  state.target.y = clamp((0.52 - y) * 2.35, -1, 1);
  updateReticle();
}

function onPointerDown(event) {
  if (event.target.closest('button')) return;
  state.pointerDown = true;
  updateInputFromPointer(event);
}

function onPointerMove(event) {
  if (!state.pointerDown) return;
  updateInputFromPointer(event);
}

function onPointerUp() {
  state.pointerDown = false;
}

function updateStars(delta) {
  const position = starGeometry.attributes.position;
  const boost = state.running ? state.speed : 28;
  for (let i = 0; i < starCount; i += 1) {
    const p = i * 3;
    starPositions[p] += state.player.x * delta * 0.9;
    starPositions[p + 1] += state.player.y * delta * 0.55;
    starPositions[p + 2] += boost * delta * rand(0.64, 1.58);
    if (starPositions[p + 2] > 14) resetStar(i, false);
  }
  position.needsUpdate = true;
}

function updateNebulae(delta) {
  for (const sprite of nebulae) {
    sprite.position.z += delta * (state.running ? state.speed * 0.17 : 5);
    sprite.material.rotation += sprite.userData.spin * delta;
    if (sprite.position.z > 24) {
      sprite.position.set(rand(-160, 160), rand(-120, 120), rand(-760, -560));
    }
  }
}

function spawnObjects(delta) {
  if (!state.running) return;
  state.spawnTimer -= delta;
  state.stationTimer -= delta;
  state.collectTimer -= delta;

  if (state.spawnTimer <= 0) {
    const roll = Math.random();
    if (roll < 0.26 + state.wave * 0.012) createDrone();
    else createAsteroid();
    state.spawnTimer = clamp(0.84 - state.wave * 0.045, 0.36, 0.84) * rand(0.78, 1.18);
  }

  if (state.stationTimer <= 0) {
    createStation();
    state.stationTimer = rand(9, 15);
  }

  if (state.collectTimer <= 0) {
    createCollector();
    state.collectTimer = rand(7.5, 12);
  }
}

function updateObjects(delta) {
  const playerX = state.player.x * 11;
  const playerY = state.player.y * 7.5;
  let threat = 0;

  for (let i = state.objects.length - 1; i >= 0; i -= 1) {
    const object = state.objects[i];
    const data = object.userData;
    const speed = state.speed * data.speedScale;
    object.position.z += speed * delta;

    if (data.kind === 'asteroid') {
      object.rotation.x += data.spin.x * delta;
      object.rotation.y += data.spin.y * delta;
      object.rotation.z += data.spin.z * delta;
    } else if (data.kind === 'drone') {
      data.phase += delta * data.strafe;
      object.position.x += Math.sin(data.phase) * delta * 1.9;
      object.rotation.z = Math.sin(data.phase) * 0.28;
      object.rotation.y = Math.sin(data.phase * 0.7) * 0.34;
      data.shot -= delta;
      if (data.shot <= 0 && object.position.z > -80 && object.position.z < -12) {
        object.getWorldPosition(tmpVector);
        createBeam(tmpVector.clone(), new THREE.Vector3(playerX * 0.22, playerY * 0.1, 4), enemyBeamMaterial, 0.24);
        if (Math.hypot(object.position.x - playerX, object.position.y - playerY) < 9.5) damage(4 + state.wave * 0.2);
        data.shot = rand(1.1, 2.4);
      }
    } else if (data.kind === 'station') {
      object.rotation.z += delta * 0.04;
      object.position.x -= data.drift * delta;
    } else if (data.kind === 'collector') {
      object.rotation.x += delta * 2.2;
      object.rotation.z += delta * 1.7;
    }

    if (object.position.z > -70 && object.position.z < 10 && data.kind !== 'station') threat += 1;

    const collisionWindow = object.position.z > -2.5 && object.position.z < 7.5;
    const distance = Math.hypot(object.position.x - playerX, object.position.y - playerY);
    if (collisionWindow && !data.passed && data.kind !== 'station') {
      if (data.kind === 'collector' && distance < data.radius + 1.8) {
        state.shield = clamp(state.shield + 18, 0, 100);
        state.heat = clamp(state.heat - 32, 0, 100);
        state.score += data.value;
        createExplosion(object.position.clone(), 0x82ff9e, 18);
        state.objects.splice(i, 1);
        removeObject(object);
        updateHud();
        continue;
      }
      if (data.kind !== 'collector' && distance < data.radius + 1.25) {
        data.passed = true;
        createExplosion(object.position.clone(), 0xff5d3b, 18);
        damage(data.kind === 'drone' ? 16 : 24);
      }
    }

    if (object.position.z > 22) {
      state.objects.splice(i, 1);
      removeObject(object);
    }
  }
  state.threat = threat;
}

function updateBeams(delta) {
  for (let i = state.beams.length - 1; i >= 0; i -= 1) {
    const beam = state.beams[i];
    beam.userData.life -= delta;
    beam.material.opacity = Math.max(0, beam.userData.life / beam.userData.ttl) * 0.9;
    if (beam.userData.life <= 0) {
      state.beams.splice(i, 1);
      scene.remove(beam);
      beam.geometry.dispose();
      beam.material.dispose();
    }
  }
}

function updateParticles(delta) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    const position = particle.geometry.attributes.position;
    const velocities = particle.userData.velocities;
    for (let p = 0; p < position.count; p += 1) {
      position.array[p * 3] += velocities[p].x * delta;
      position.array[p * 3 + 1] += velocities[p].y * delta;
      position.array[p * 3 + 2] += velocities[p].z * delta + state.speed * delta * 0.6;
    }
    position.needsUpdate = true;
    particle.userData.life -= delta;
    particle.material.opacity = Math.max(0, particle.userData.life / particle.userData.ttl);
    if (particle.userData.life <= 0) {
      state.particles.splice(i, 1);
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    }
  }
}

function updateFlight(delta) {
  const inputLerp = 1 - Math.exp(-delta * 4.8);
  state.player.x = lerp(state.player.x, state.target.x, inputLerp);
  state.player.y = lerp(state.player.y, state.target.y, inputLerp);

  if (!state.pointerDown && !state.demo) {
    state.target.x = lerp(state.target.x, 0, delta * 0.42);
    state.target.y = lerp(state.target.y, 0, delta * 0.42);
  }

  if (state.demo && state.running) {
    state.target.x = Math.sin(state.time * 0.8) * 0.72;
    state.target.y = Math.sin(state.time * 0.56 + 0.8) * 0.44;
    state.firing = true;
  }

  const shakeX = state.shake ? rand(-state.shake, state.shake) : 0;
  const shakeY = state.shake ? rand(-state.shake, state.shake) : 0;
  camera.position.x = state.player.x * 0.42 + shakeX;
  camera.position.y = state.player.y * 0.26 + shakeY;
  camera.position.z = 4 + Math.sin(state.time * 0.7) * 0.06;
  camera.rotation.x = state.player.y * 0.035 + shakeY * 0.04;
  camera.rotation.y = -state.player.x * 0.048 + shakeX * 0.05;
  camera.rotation.z = -state.player.x * 0.02;

  cockpitLight.intensity = lerp(cockpitLight.intensity, 2.2, delta * 4);
  warmLight.intensity = 1.2 + Math.sin(state.time * 2.1) * 0.22;
  state.shake = Math.max(0, state.shake - delta * 0.9);
  state.heat = Math.max(0, state.heat - delta * 17);
  state.shotTimer = Math.max(0, state.shotTimer - delta);
  state.speed = clamp(48 + state.time * 0.42, 48, 82);
  state.wave = Math.max(1, Math.floor(state.time / 18) + 1);

  if (state.flashTimer > 0) {
    state.flashTimer -= delta;
    if (state.flashTimer <= 0) damageFlash.classList.remove('active');
  }

  if (state.firing || (state.demo && state.running)) firePulse();
  if (state.running) state.score += delta * (8 + state.wave * 1.6);
  updateReticle();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  state.time += delta;

  updateFlight(delta);
  updateStars(delta);
  updateNebulae(delta);
  spawnObjects(delta);
  updateObjects(delta);
  updateBeams(delta);
  updateParticles(delta);

  if (state.running && Math.floor(state.time * 8) % 4 === 0) updateHud();
  if (state.demo && state.running && state.time > 18) finishGame();

  renderer.render(scene, camera);
}

function processCockpitImage(img) {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.naturalWidth;
  offscreen.height = img.naturalHeight;
  const ctx = offscreen.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
  const pixels = frame.data;
  const matte = new Uint8ClampedArray(offscreen.width * offscreen.height);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const greenDominance = g - Math.max(r, b);
    const greenRatio = g / Math.max(1, Math.max(r, b));
    let alpha = 255;
    if (g > 142 && greenDominance > 52 && greenRatio > 1.42) {
      alpha = Math.round(255 * (1 - clamp((greenDominance - 52) / 68, 0, 1)));
    } else if (g > 78 && greenDominance > 22 && greenRatio > 1.15) {
      alpha = Math.round(255 * (1 - clamp((greenDominance - 22) / 72, 0, 1) * 0.86));
    }
    pixels[i + 3] = alpha;
    matte[p] = alpha;

    if (greenDominance > 20 && g > 70 && greenRatio > 1.12) {
      pixels[i + 1] = Math.min(g, Math.round((r + b) * 0.55 + 36));
    }
  }

  const width = offscreen.width;
  const height = offscreen.height;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      if (matte[p] < 12) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const edgeGreen = g - Math.max(r, b);
      if (edgeGreen < 10) continue;
      const nearTransparent =
        matte[p - 1] < 48 || matte[p + 1] < 48 ||
        matte[p - width] < 48 || matte[p + width] < 48;
      if (nearTransparent) {
        pixels[i + 3] = Math.round(matte[p] * 0.38);
        pixels[i + 1] = Math.min(g, Math.round((r + b) * 0.5 + 20));
      }
    }
  }

  ctx.putImageData(frame, 0, 0);
  state.cockpitPlate = offscreen;
  state.cockpitReady = true;
  drawCockpit();
}

function drawCockpit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));
  cockpitCanvas.width = width;
  cockpitCanvas.height = height;
  cockpitCanvas.style.width = `${window.innerWidth}px`;
  cockpitCanvas.style.height = `${window.innerHeight}px`;
  cockpitCtx.setTransform(1, 0, 0, 1, 0, 0);
  cockpitCtx.clearRect(0, 0, width, height);
  if (!state.cockpitPlate) return;

  const img = state.cockpitPlate;
  const scale = Math.max(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const x = (width - drawWidth) * 0.5;
  const y = (height - drawHeight) * 0.5;
  cockpitCtx.drawImage(img, x, y, drawWidth, drawHeight);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.fov = height >= width ? 63 : 54;
  camera.updateProjectionMatrix();
  drawCockpit();
  updateReticle();
}

function setupEvents() {
  startButton.addEventListener('click', resetGame);
  restartButton.addEventListener('click', resetGame);
  gameEl.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('resize', resize);

  fireButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.firing = true;
    firePulse();
  });
  window.addEventListener('pointerup', () => {
    if (!state.demo) state.firing = false;
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      state.firing = true;
      firePulse();
    }
    if (event.code === 'Enter' && !state.running && !state.resultLocked) resetGame();
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.target.x = clamp(state.target.x - 0.14, -1, 1);
    if (event.code === 'ArrowRight' || event.code === 'KeyD') state.target.x = clamp(state.target.x + 0.14, -1, 1);
    if (event.code === 'ArrowUp' || event.code === 'KeyW') state.target.y = clamp(state.target.y + 0.14, -1, 1);
    if (event.code === 'ArrowDown' || event.code === 'KeyS') state.target.y = clamp(state.target.y - 0.14, -1, 1);
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') state.firing = false;
  });
}

function loadCockpit() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      processCockpitImage(img);
      resolve();
    };
    img.onerror = reject;
    img.src = 'assets/cockpit-chroma.png';
  });
}

async function boot() {
  setupEvents();
  resize();
  await loadCockpit();
  updateHud();
  document.documentElement.dataset.gameReady = '1';
  animate();

  if (state.demo) {
    setTimeout(resetGame, 350);
  }
}

boot();

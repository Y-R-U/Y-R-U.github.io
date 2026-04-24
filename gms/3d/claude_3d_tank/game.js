// Claude 3D Tank — low-poly three.js tank-vs-crows shooter
// Single-file ES module. Uses three@0.160.0 via importmap in index.html.

import * as THREE from 'three';

// ══════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════
const CFG = {
  tank: {
    hullColor: 0x4a5a32,
    hullDark: 0x3a4a24,
    trackColor: 0x1a1a1a,
    metalColor: 0x5a6a3a,
    moveSpeed: 12,
    rotSpeed: 5,
    turretSpeed: 9,
    fireCooldown: 0.22,
    maxHealth: 3,
  },
  bullet: {
    speed: 110,
    lifetime: 1.6,
    color: 0xfff2a0,
    radius: 0.08,
  },
  crow: {
    color: 0x0a0a0a,
    eyeColor: 0xff2222,
    beakColor: 0xffa822,
    speed: 7,
    diveSpeed: 20,
    spawnRingMin: 70,
    spawnRingMax: 95,
    spawnHeightMin: 16,
    spawnHeightMax: 28,
    hitRadius: 1.3,
    attackDist: 2.2,
  },
  world: {
    size: 280,
    segs: 110,
    fogColor: 0xe8c0a0,
    fogNear: 30,
    fogFar: 170,
    skyColor: 0xe8c0a0,
  },
};

const UP = new THREE.Vector3(0, 1, 0);

// ══════════════════════════════════════════════════════════════════
//  RENDERER & SCENE
// ══════════════════════════════════════════════════════════════════
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.world.skyColor);
scene.fog = new THREE.Fog(CFG.world.fogColor, CFG.world.fogNear, CFG.world.fogFar);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 14, -16);
camera.lookAt(0, 2, 0);

// ──────────── Lighting ────────────
const hemi = new THREE.HemisphereLight(0xffd6a8, 0x3a5a2a, 0.75);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffb87a, 1.35);
sun.position.set(50, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 180;
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0004;
scene.add(sun);

const ambient = new THREE.AmbientLight(0x8890a0, 0.32);
scene.add(ambient);

// sky gradient backdrop — large inverted sphere behind fog
(function addSkyDome() {
  const geom = new THREE.SphereGeometry(300, 20, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: new THREE.Color(0x6a8abf) },
      midColor:    { value: new THREE.Color(0xf2c89a) },
      bottomColor: { value: new THREE.Color(0xe37a4a) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, bottomColor;
      varying float vY;
      void main() {
        float t = clamp(vY, -1.0, 1.0);
        vec3 c = (t > 0.15)
          ? mix(midColor, topColor, smoothstep(0.15, 1.0, t))
          : mix(bottomColor, midColor, smoothstep(-0.3, 0.15, t));
        gl_FragColor = vec4(c, 1.0);
      }`,
    fog: false,
  });
  scene.add(new THREE.Mesh(geom, mat));
})();

// ══════════════════════════════════════════════════════════════════
//  TERRAIN, TREES, ROCKS, CLOUDS
// ══════════════════════════════════════════════════════════════════
function terrainHeight(x, z) {
  const d = Math.sqrt(x * x + z * z);
  const flatness = Math.min(1, Math.max(0, (d - 14) / 30));
  return (Math.sin(x * 0.07) * Math.cos(z * 0.06) * 1.8 +
          Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11 + 0.5) * 1.1 +
          Math.sin(x * 0.24 + z * 0.21) * 0.4) * flatness;
}

function buildTerrain() {
  const { size, segs } = CFG.world;
  const geom = new THREE.PlaneGeometry(size, size, segs, segs);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geom.computeVertexNormals();

  const colors = [];
  const cBase = new THREE.Color(0x6c8a44);
  const cDark = new THREE.Color(0x3f5a28);
  const cHi   = new THREE.Color(0x8ea055);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, Math.min(1, (y + 1) / 3));
    const jitter = (Math.random() - 0.5) * 0.25;
    const blend = Math.max(0, Math.min(1, t + jitter));
    const c = cDark.clone().lerp(cBase, blend).lerp(cHi, Math.max(0, blend - 0.6) * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 0,
    specular: 0x000000,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildTree() {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshPhongMaterial({ color: 0x3a2614, flatShading: true });
  const leafShades = [0x2d4a1f, 0x335224, 0x28411a, 0x3a5a26];
  const leafMat = new THREE.MeshPhongMaterial({
    color: leafShades[Math.floor(Math.random() * leafShades.length)],
    flatShading: true,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 1.3, 6),
    trunkMat
  );
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  g.add(trunk);

  const layers = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 1.4 - i * 0.3;
    const h = 1.4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leafMat);
    cone.position.y = 1.1 + i * 0.9;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

function scatterDecor() {
  const size = CFG.world.size;
  // trees in a ring (not near origin)
  for (let i = 0; i < 120; i++) {
    const r = 22 + Math.pow(Math.random(), 0.7) * (size * 0.43);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const tree = buildTree();
    tree.position.set(x, terrainHeight(x, z) - 0.1, z);
    tree.scale.setScalar(0.75 + Math.random() * 0.7);
    tree.rotation.y = Math.random() * Math.PI * 2;
    scene.add(tree);
  }
  // rocks
  const rockMat = new THREE.MeshPhongMaterial({ color: 0x6c7077, flatShading: true });
  const rockDark = new THREE.MeshPhongMaterial({ color: 0x4a4e55, flatShading: true });
  for (let i = 0; i < 70; i++) {
    const r = 16 + Math.random() * (size * 0.43);
    const a = Math.random() * Math.PI * 2;
    const size2 = 0.5 + Math.random() * 1.4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rock = new THREE.Mesh(
      Math.random() < 0.5
        ? new THREE.DodecahedronGeometry(size2, 0)
        : new THREE.IcosahedronGeometry(size2, 0),
      Math.random() < 0.6 ? rockMat : rockDark
    );
    rock.position.set(x, terrainHeight(x, z) + size2 * 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
  // grass tufts
  const grassMat = new THREE.MeshPhongMaterial({ color: 0x7da852, flatShading: true });
  for (let i = 0; i < 260; i++) {
    const x = (Math.random() - 0.5) * size * 0.75;
    const z = (Math.random() - 0.5) * size * 0.75;
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), grassMat);
    tuft.position.set(x, terrainHeight(x, z) + 0.2, z);
    tuft.rotation.y = Math.random() * Math.PI;
    scene.add(tuft);
  }
}

const clouds = [];
function buildClouds() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff3d8,
    transparent: true,
    opacity: 0.85,
    fog: false,
  });
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(2.2 + Math.random() * 1.8, 6, 4),
        mat
      );
      puff.position.set(
        j * 2.8 - puffs * 1.2 + (Math.random() - 0.5),
        (Math.random() - 0.5),
        (Math.random() - 0.5) * 1.5
      );
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(
      (Math.random() - 0.5) * 250,
      46 + Math.random() * 16,
      (Math.random() - 0.5) * 250
    );
    g.userData.drift = (0.4 + Math.random() * 1.0) * (Math.random() < 0.5 ? 1 : -1);
    scene.add(g);
    clouds.push(g);
  }
}

// ══════════════════════════════════════════════════════════════════
//  TANK
// ══════════════════════════════════════════════════════════════════
function buildTank() {
  const root = new THREE.Group();
  const hullMat = new THREE.MeshPhongMaterial({
    color: CFG.tank.hullColor,
    flatShading: true,
    shininess: 15,
  });
  const hullDarkMat = new THREE.MeshPhongMaterial({
    color: CFG.tank.hullDark,
    flatShading: true,
    shininess: 10,
  });
  const trackMat = new THREE.MeshPhongMaterial({
    color: CFG.tank.trackColor,
    flatShading: true,
    shininess: 2,
  });
  const metalMat = new THREE.MeshPhongMaterial({
    color: CFG.tank.metalColor,
    flatShading: true,
    shininess: 30,
  });

  // lower hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 4.2), hullMat);
  hull.position.y = 0.85;
  hull.castShadow = true;
  root.add(hull);

  // sloped front glacis
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.0), hullMat);
  glacis.position.set(0, 1.1, 2.1);
  glacis.rotation.x = -0.45;
  glacis.castShadow = true;
  root.add(glacis);

  // sloped rear
  const rear = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.9), hullDarkMat);
  rear.position.set(0, 1.08, -2.0);
  rear.rotation.x = 0.4;
  rear.castShadow = true;
  root.add(rear);

  // upper deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 2.6), hullDarkMat);
  deck.position.y = 1.4;
  deck.castShadow = true;
  root.add(deck);

  // fenders
  for (const sx of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 4.2), hullDarkMat);
    fender.position.set(sx * 1.4, 1.1, 0);
    root.add(fender);
  }

  // tracks & wheels
  for (const sx of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 4.4), trackMat);
    track.position.set(sx * 1.52, 0.4, 0);
    track.castShadow = true;
    root.add(track);

    // track top surface (to hide any gap)
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 4.4), hullDarkMat);
    topRail.position.set(sx * 1.52, 0.83, 0);
    root.add(topRail);

    for (let i = 0; i < 5; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10),
        metalMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.52, 0.34, -1.7 + i * 0.85);
      root.add(wheel);
    }
    // drive sprockets (slightly larger, at ends)
    for (const ez of [-2.0, 2.0]) {
      const sprocket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8),
        new THREE.MeshPhongMaterial({ color: 0x2a2a2a, flatShading: true })
      );
      sprocket.rotation.z = Math.PI / 2;
      sprocket.position.set(sx * 1.52, 0.42, ez);
      root.add(sprocket);
    }
  }

  // ── Turret (yaw pivot) ──────────────────────────────────
  const turret = new THREE.Group();
  turret.position.y = 1.58;
  root.add(turret);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, 0.35, 10),
    hullMat
  );
  turret.add(turretBase);

  const turretBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.7, 2.0),
    hullMat
  );
  turretBody.position.y = 0.42;
  turretBody.castShadow = true;
  turret.add(turretBody);

  // sloped front of turret
  const turretFront = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.65, 0.6),
    hullDarkMat
  );
  turretFront.position.set(0, 0.42, 1.15);
  turretFront.rotation.x = -0.25;
  turret.add(turretFront);

  // hatch
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10),
    metalMat
  );
  hatch.position.set(-0.45, 0.82, -0.3);
  turret.add(hatch);

  // antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  antenna.position.set(0.7, 1.2, -0.6);
  turret.add(antenna);

  // ── Barrel pivot (pitch) ───────────────────────────────
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.42, 0.7);
  turret.add(barrelPivot);

  const cannonBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.5),
    hullDarkMat
  );
  cannonBase.position.set(0, 0, 0.25);
  barrelPivot.add(cannonBase);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 2.6, 10),
    metalMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 1.7);
  barrel.castShadow = true;
  barrelPivot.add(barrel);

  // muzzle brake
  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.3, 10),
    trackMat
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0, 3.0);
  barrelPivot.add(muzzleBrake);

  root.userData.turret = turret;
  root.userData.barrelPivot = barrelPivot;
  root.userData.muzzleLocal = new THREE.Vector3(0, 0, 3.2); // in barrelPivot space

  // YXZ so local pitch/roll (from terrain) apply in tank's own frame after yaw
  root.rotation.order = 'YXZ';
  return root;
}

// ══════════════════════════════════════════════════════════════════
//  CROW
// ══════════════════════════════════════════════════════════════════
function buildCrow() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: CFG.crow.color,
    flatShading: true,
    shininess: 40,
    specular: 0x222222,
  });
  const darkMat = new THREE.MeshPhongMaterial({
    color: 0x050505,
    flatShading: true,
    shininess: 10,
  });

  // body (stretched octahedron)
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), bodyMat);
  body.scale.set(1.0, 0.55, 1.85);
  body.castShadow = true;
  g.add(body);

  // head
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), bodyMat);
  head.position.set(0, 0.18, 0.92);
  g.add(head);

  // beak
  const beakMat = new THREE.MeshPhongMaterial({
    color: CFG.crow.beakColor,
    flatShading: true,
  });
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 4), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.15, 1.26);
  g.add(beak);

  // glowing red eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: CFG.crow.eyeColor });
  for (const dx of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMat);
    eye.position.set(dx, 0.24, 1.06);
    g.add(eye);
    // inner glow
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({
        color: CFG.crow.eyeColor,
        transparent: true,
        opacity: 0.25,
      })
    );
    glow.position.copy(eye.position);
    g.add(glow);
  }

  // tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), darkMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0, -1.05);
  g.add(tail);

  // wings: triangles on each side, parented so we can flap
  const wingGeom = new THREE.BufferGeometry();
  wingGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        0, 0, 0.5,
        2.1, 0.1, -0.1,
        0, 0, -0.6,
      ]),
      3
    )
  );
  wingGeom.computeVertexNormals();

  const wingMat = new THREE.MeshPhongMaterial({
    color: 0x0a0a0a,
    side: THREE.DoubleSide,
    flatShading: true,
    shininess: 8,
  });

  // left wing: pivot at shoulder
  const leftPivot = new THREE.Group();
  leftPivot.position.set(-0.25, 0.12, 0);
  const leftWing = new THREE.Mesh(wingGeom, wingMat);
  leftWing.rotation.y = Math.PI; // mirror
  leftWing.scale.x = 1;
  leftPivot.add(leftWing);
  g.add(leftPivot);

  // right wing
  const rightPivot = new THREE.Group();
  rightPivot.position.set(0.25, 0.12, 0);
  const rightWing = new THREE.Mesh(wingGeom, wingMat);
  rightPivot.add(rightWing);
  g.add(rightPivot);

  g.userData.leftWing = leftPivot;
  g.userData.rightWing = rightPivot;

  return g;
}

// ══════════════════════════════════════════════════════════════════
//  BUILD WORLD
// ══════════════════════════════════════════════════════════════════
buildTerrain();
scatterDecor();
buildClouds();
const tank = buildTank();
scene.add(tank);

// muzzle flash reusable light
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 8, 2);
scene.add(muzzleLight);

// muzzle flash sprite (a small quad)
const muzzleFlash = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 1.6),
  new THREE.MeshBasicMaterial({
    color: 0xffdc88,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  })
);
muzzleFlash.renderOrder = 10;
scene.add(muzzleFlash);

// ══════════════════════════════════════════════════════════════════
//  AUDIO (WebAudio synthesis)
// ══════════════════════════════════════════════════════════════════
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function sfxShoot() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  // thump
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.24);

  // noise burst
  const bufferSize = audioCtx.sampleRate * 0.15;
  const buf = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const nGain = audioCtx.createGain();
  nGain.gain.setValueAtTime(0.18, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 900;
  noise.connect(filter).connect(nGain).connect(audioCtx.destination);
  noise.start(t);
  noise.stop(t + 0.15);
}

function sfxCrowHit() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.35);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.42);
}

function sfxDamage() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.3);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.4);
}

function sfxGameOver() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200 - i * 40, t + i * 0.12);
    osc.frequency.exponentialRampToValueAtTime(40, t + i * 0.12 + 0.35);
    gain.gain.setValueAtTime(0.22, t + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t + i * 0.12);
    osc.stop(t + i * 0.12 + 0.45);
  }
}

// ══════════════════════════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════════════════════════
const input = {
  keys: new Set(),
  mouse: { x: 0, y: 0, hasMoved: false },
  firing: false,
  joystick: { x: 0, y: 0, active: false },
};

addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
       'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  input.keys.add(e.code);
  if (e.code === 'Space') input.firing = true;
});
addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
  if (e.code === 'Space') input.firing = false;
});

addEventListener('mousemove', (e) => {
  input.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  input.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  input.mouse.hasMoved = true;
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (e.button === 0) input.firing = true;
});
addEventListener('mouseup', () => { input.firing = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('resize', onResize);
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

// Touch joystick
const touchLeft = document.getElementById('touch-left');
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const touchFire = document.getElementById('touch-fire');

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) {
  // touch controls will be shown on game start
  let joyId = null;
  let joyStart = { x: 0, y: 0 };

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const rect = joystickBase.getBoundingClientRect();
    joyStart.x = rect.left + rect.width / 2;
    joyStart.y = rect.top + rect.height / 2;
    input.joystick.active = true;
  });

  const joyMove = (e) => {
    if (joyId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const dx = t.clientX - joyStart.x;
      const dy = t.clientY - joyStart.y;
      const max = 55;
      const len = Math.sqrt(dx * dx + dy * dy);
      const kx = len > max ? (dx / len) * max : dx;
      const ky = len > max ? (dy / len) * max : dy;
      joystickKnob.style.transform =
        `translate(${kx - 30}px, ${ky - 30}px)`;
      input.joystick.x = kx / max;
      input.joystick.y = ky / max;
      break;
    }
  };

  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
        input.joystick.x = 0;
        input.joystick.y = 0;
        input.joystick.active = false;
      }
    }
  };

  joystickBase.addEventListener('touchmove', joyMove, { passive: false });
  joystickBase.addEventListener('touchend', joyEnd);
  joystickBase.addEventListener('touchcancel', joyEnd);

  touchFire.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.firing = true;
  });
  touchFire.addEventListener('touchend', (e) => {
    e.preventDefault();
    input.firing = false;
  });
  touchFire.addEventListener('touchcancel', () => { input.firing = false; });
}

// ══════════════════════════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════════════════════════
let state = 'title'; // 'title' | 'playing' | 'gameover'
let score = 0;
let kills = 0;
let waveNum = 0;
let health = CFG.tank.maxHealth;
let fireCooldown = 0;
let muzzleFlashTime = 0;

const bullets = [];
const crows = [];
const particles = [];

let spawnTimer = 0;
let spawnInterval = 1.0;
let crowsRemaining = 0;

// ══════════════════════════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════════════════════════
const $score = document.getElementById('score');
const $wave  = document.getElementById('wave');
const $hearts = document.getElementById('hearts');
const $hud = document.getElementById('hud');
const $crosshair = document.getElementById('crosshair');
const $banner = document.getElementById('banner');
const $bannerText = document.getElementById('banner-text');
const $titleScreen = document.getElementById('title-screen');
const $gameover = document.getElementById('gameover-popup');
const $goScore = document.getElementById('go-score');
const $goWave = document.getElementById('go-wave');
const $goKills = document.getElementById('go-kills');
const $hitFlash = document.getElementById('hit-flash');

function renderHearts() {
  $hearts.innerHTML = '';
  for (let i = 0; i < CFG.tank.maxHealth; i++) {
    const h = document.createElement('div');
    h.className = 'heart' + (i >= health ? ' empty' : '');
    $hearts.appendChild(h);
  }
}
function updateHUD() {
  $score.textContent = score.toLocaleString();
  $wave.textContent = waveNum;
}
function showBanner(text) {
  $bannerText.textContent = text;
  $banner.classList.remove('hidden');
  // restart animation
  $bannerText.style.animation = 'none';
  // force reflow
  void $bannerText.offsetWidth;
  $bannerText.style.animation = '';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => $banner.classList.add('hidden'), 1800);
}
function flashHit() {
  $hitFlash.classList.remove('hidden');
  $hitFlash.style.animation = 'none';
  void $hitFlash.offsetWidth;
  $hitFlash.style.animation = '';
  clearTimeout(flashHit._t);
  flashHit._t = setTimeout(() => $hitFlash.classList.add('hidden'), 500);
}

// ══════════════════════════════════════════════════════════════════
//  GAMEPLAY
// ══════════════════════════════════════════════════════════════════
function resetGame() {
  // clear crows
  for (const c of crows) scene.remove(c.group);
  crows.length = 0;
  // clear bullets
  for (const b of bullets) scene.remove(b.mesh);
  bullets.length = 0;
  // clear particles
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;

  score = 0;
  kills = 0;
  waveNum = 0;
  health = CFG.tank.maxHealth;
  fireCooldown = 0;
  spawnTimer = 0;
  crowsRemaining = 0;

  tank.position.set(0, 0, 0);
  tank.rotation.set(0, 0, 0);
  tank.userData.turret.rotation.set(0, 0, 0);
  tank.userData.barrelPivot.rotation.set(0, 0, 0);

  renderHearts();
  updateHUD();
}

function startGame() {
  ensureAudio();
  resetGame();
  state = 'playing';
  $titleScreen.classList.add('hidden');
  $gameover.classList.add('hidden');
  $hud.classList.remove('hidden');
  $crosshair.classList.remove('hidden');
  if (isTouch) {
    touchLeft.classList.remove('hidden');
    touchFire.classList.remove('hidden');
    $crosshair.classList.add('hidden'); // touch auto-aims
  }
  startNextWave();
}

function endGame() {
  state = 'gameover';
  sfxGameOver();
  $goScore.textContent = score.toLocaleString();
  $goWave.textContent = waveNum;
  $goKills.textContent = kills;
  $hud.classList.add('hidden');
  $crosshair.classList.add('hidden');
  touchLeft.classList.add('hidden');
  touchFire.classList.add('hidden');
  $gameover.classList.remove('hidden');
}

function showMenu() {
  state = 'title';
  $gameover.classList.add('hidden');
  $titleScreen.classList.remove('hidden');
  $hud.classList.add('hidden');
  $crosshair.classList.add('hidden');
  touchLeft.classList.add('hidden');
  touchFire.classList.add('hidden');
}

function startNextWave() {
  waveNum++;
  crowsRemaining = 4 + Math.floor(waveNum * 1.8);
  spawnInterval = Math.max(0.35, 1.1 - waveNum * 0.08);
  spawnTimer = 0.5; // small initial delay
  updateHUD();
  showBanner(`WAVE ${waveNum}`);
}

function spawnCrow() {
  const angle = Math.random() * Math.PI * 2;
  const r = CFG.crow.spawnRingMin + Math.random() * (CFG.crow.spawnRingMax - CFG.crow.spawnRingMin);
  const h = CFG.crow.spawnHeightMin + Math.random() * (CFG.crow.spawnHeightMax - CFG.crow.spawnHeightMin);
  const group = buildCrow();
  group.position.set(
    tank.position.x + Math.cos(angle) * r,
    h,
    tank.position.z + Math.sin(angle) * r
  );
  scene.add(group);

  crows.push({
    group,
    baseY: h,
    phase: Math.random() * Math.PI * 2,
    flapPhase: Math.random() * Math.PI * 2,
    diving: false,
    divingSince: 0,
    hp: 1 + Math.floor(waveNum / 4),
    speed: CFG.crow.speed * (0.85 + Math.random() * 0.4) + waveNum * 0.15,
    diveCheckCooldown: 1 + Math.random() * 2,
    dying: false,
    dyingTime: 0,
    velocity: new THREE.Vector3(),
  });
}

// ── Bullet spawning & firing ──
const _tmpV = new THREE.Vector3();
const _tmpQ = new THREE.Quaternion();
function spawnBullet() {
  const barrelPivot = tank.userData.barrelPivot;
  const muzzleLocal = tank.userData.muzzleLocal.clone();

  const worldPos = muzzleLocal.clone();
  barrelPivot.localToWorld(worldPos);

  const dir = new THREE.Vector3(0, 0, 1);
  dir.applyQuaternion(barrelPivot.getWorldQuaternion(_tmpQ));
  dir.normalize();

  const geom = new THREE.CylinderGeometry(
    CFG.bullet.radius, CFG.bullet.radius, 0.9, 6
  );
  geom.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: CFG.bullet.color,
    fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(worldPos);
  // orient along dir
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  mesh.quaternion.copy(q);
  scene.add(mesh);

  bullets.push({ mesh, dir: dir.clone(), age: 0 });

  // muzzle flash
  muzzleFlash.position.copy(worldPos).addScaledVector(dir, 0.6);
  muzzleFlash.lookAt(camera.position);
  muzzleFlash.material.opacity = 1;
  muzzleFlashTime = 0.08;
  muzzleLight.position.copy(worldPos);
  muzzleLight.intensity = 6;

  sfxShoot();
}

// ── Aiming ──
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -14); // y = 14
const _mouseV = new THREE.Vector2();
const _aimOut = new THREE.Vector3();

function getAimPointDesktop() {
  _mouseV.set(input.mouse.x, input.mouse.y);
  raycaster.setFromCamera(_mouseV, camera);
  // try crow hits first
  for (const c of crows) {
    if (c.dying) continue;
    const hitPos = _tmpV.copy(c.group.position);
    // sphere test using distance from ray
    const distToRay = raycaster.ray.distanceToPoint(hitPos);
    if (distToRay < 1.4) {
      return hitPos.clone();
    }
  }
  // fallback: intersect sky plane
  if (raycaster.ray.intersectPlane(aimPlane, _aimOut)) {
    return _aimOut.clone();
  }
  // final fallback: ground plane
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const gp = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, gp)) return gp;
  return null;
}

function getAimPointTouch() {
  // auto-aim at nearest crow (preferring ones that are alive & closest)
  let best = null;
  let bestD = Infinity;
  for (const c of crows) {
    if (c.dying) continue;
    const d = c.group.position.distanceTo(tank.position);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best) return best.group.position.clone();
  // fallback: straight ahead
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(tank.quaternion);
  return tank.position.clone().addScaledVector(fwd, 30).setY(14);
}

// ── Update loops ──
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function updateTank(dt) {
  // movement (camera-relative)
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  camFwd.y = 0; camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, UP).normalize();

  let ix = 0, iy = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) iy += 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) iy -= 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ix -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ix += 1;

  if (input.joystick.active) {
    ix += input.joystick.x;
    iy += -input.joystick.y;
  }

  const inputLen = Math.sqrt(ix * ix + iy * iy);
  if (inputLen > 0.05) {
    const scale = Math.min(1, inputLen);
    const nx = (ix / inputLen) * scale;
    const ny = (iy / inputLen) * scale;
    const moveVec = camFwd.clone().multiplyScalar(ny)
      .add(camRight.clone().multiplyScalar(nx));
    tank.position.addScaledVector(moveVec, CFG.tank.moveSpeed * dt);

    const targetYaw = Math.atan2(moveVec.x, moveVec.z);
    tank.rotation.y = lerpAngle(tank.rotation.y, targetYaw, Math.min(1, CFG.tank.rotSpeed * dt));
  }

  // clamp to world
  const HALF = CFG.world.size * 0.42;
  tank.position.x = Math.max(-HALF, Math.min(HALF, tank.position.x));
  tank.position.z = Math.max(-HALF, Math.min(HALF, tank.position.z));

  // ride the terrain — sample ground height at hull position
  const targetY = terrainHeight(tank.position.x, tank.position.z);
  tank.position.y = lerp(tank.position.y, targetY, Math.min(1, 6 * dt));

  // subtle pitch/roll from nearby terrain slope (sample fore/aft and sides)
  const sampleAhead = terrainHeight(tank.position.x + 2, tank.position.z);
  const sampleBehind = terrainHeight(tank.position.x - 2, tank.position.z);
  const sampleRight = terrainHeight(tank.position.x, tank.position.z + 2);
  const sampleLeft = terrainHeight(tank.position.x, tank.position.z - 2);
  // we can't cleanly pitch in world-space since tank has its own yaw; keep it subtle
  const slopeX = (sampleAhead - sampleBehind) * 0.1;
  const slopeZ = (sampleRight - sampleLeft) * 0.1;
  // leave rotation.y alone (yaw); apply tiny tilt via rotation.x & rotation.z
  tank.rotation.x = lerp(tank.rotation.x, -slopeX, Math.min(1, 4 * dt));
  tank.rotation.z = lerp(tank.rotation.z, slopeZ, Math.min(1, 4 * dt));

  // turret & barrel aim
  const aimPt = isTouch ? getAimPointTouch() : getAimPointDesktop();
  if (aimPt) {
    const turret = tank.userData.turret;
    const barrelPivot = tank.userData.barrelPivot;

    // direction from muzzle world → aim
    const muzzleWorld = tank.userData.muzzleLocal.clone();
    barrelPivot.localToWorld(muzzleWorld);
    const dir = aimPt.clone().sub(muzzleWorld).normalize();

    // convert to tank-local frame
    const localDir = dir.clone().applyQuaternion(tank.quaternion.clone().invert());
    const yaw = Math.atan2(localDir.x, localDir.z);
    const pitch = Math.atan2(
      localDir.y,
      Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z)
    );

    turret.rotation.y = lerpAngle(
      turret.rotation.y, yaw, Math.min(1, CFG.tank.turretSpeed * dt)
    );
    // barrel pitches up: positive world y needs negative x rotation
    const targetPitch = Math.max(-0.1, Math.min(1.2, pitch));
    barrelPivot.rotation.x = lerp(
      barrelPivot.rotation.x, -targetPitch, Math.min(1, 8 * dt)
    );
  }

  // fire
  fireCooldown = Math.max(0, fireCooldown - dt);
  if (input.firing && fireCooldown <= 0 && state === 'playing') {
    spawnBullet();
    fireCooldown = CFG.tank.fireCooldown;
  }

  // muzzle flash decay
  if (muzzleFlashTime > 0) {
    muzzleFlashTime -= dt;
    const t = Math.max(0, muzzleFlashTime / 0.08);
    muzzleFlash.material.opacity = t;
    muzzleFlash.scale.setScalar(1 + (1 - t) * 1.2);
    muzzleLight.intensity = 6 * t;
  } else {
    muzzleFlash.material.opacity = 0;
    muzzleLight.intensity = 0;
  }
}

// distance from point c to segment (p0 → p1)
const _segD = new THREE.Vector3();
const _segAB = new THREE.Vector3();
function distPointToSegment(p0, p1, c) {
  _segAB.subVectors(p1, p0);
  const lenSq = _segAB.lengthSq();
  if (lenSq < 1e-6) return c.distanceTo(p0);
  const t = Math.max(0, Math.min(1, _segD.subVectors(c, p0).dot(_segAB) / lenSq));
  _segD.copy(p0).addScaledVector(_segAB, t);
  return _segD.distanceTo(c);
}

function updateBullets(dt) {
  const step = CFG.bullet.speed * dt;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prev = b.mesh.position.clone();
    b.mesh.position.addScaledVector(b.dir, step);
    b.age += dt;
    if (b.age > CFG.bullet.lifetime) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      bullets.splice(i, 1);
      continue;
    }
    // swept crow collision
    let hit = false;
    for (const c of crows) {
      if (c.dying) continue;
      const d = distPointToSegment(prev, b.mesh.position, c.group.position);
      if (d < CFG.crow.hitRadius) {
        c.hp--;
        if (c.hp <= 0) {
          killCrow(c);
          spawnFeatherBurst(c.group.position);
          sfxCrowHit();
          kills++;
          score += 100 * waveNum;
          updateHUD();
        } else {
          spawnFeatherBurst(c.group.position, 5);
        }
        hit = true;
        break;
      }
    }
    if (hit) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      bullets.splice(i, 1);
    }
  }
}

function killCrow(c) {
  c.dying = true;
  c.dyingTime = 2.0;
  c.velocity.set(
    (Math.random() - 0.5) * 4,
    Math.random() * 2,
    (Math.random() - 0.5) * 4
  );
}

function updateCrows(dt) {
  const now = performance.now();
  for (let i = crows.length - 1; i >= 0; i--) {
    const c = crows[i];
    if (c.dying) {
      c.dyingTime -= dt;
      // gravity fall
      c.velocity.y -= 20 * dt;
      c.group.position.addScaledVector(c.velocity, dt);
      c.group.rotation.z += 6 * dt;
      c.group.rotation.x += 4 * dt;
      if (c.group.position.y < 0.3 || c.dyingTime <= 0) {
        // dust puff on impact
        spawnFeatherBurst(c.group.position, 8, 0x6a5a3a);
        scene.remove(c.group);
        crows.splice(i, 1);
      }
      continue;
    }

    const toTank = _tmpV.subVectors(tank.position, c.group.position);
    toTank.y += 0.5;
    const dist = toTank.length();
    const dir = toTank.clone().normalize();

    if (c.diving) {
      c.group.position.addScaledVector(dir, (CFG.crow.diveSpeed + waveNum * 0.3) * dt);
      c.divingSince += dt;
    } else {
      // horizontal approach + altitude wobble
      const horizDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      c.group.position.addScaledVector(horizDir, c.speed * dt);
      // drift vertical toward base altitude with sine wobble
      const targetY = c.baseY + Math.sin(now * 0.0028 + c.phase) * 2.2;
      c.group.position.y = lerp(c.group.position.y, targetY, Math.min(1, 2 * dt));

      // chance to dive when close
      c.diveCheckCooldown -= dt;
      if (c.diveCheckCooldown <= 0) {
        c.diveCheckCooldown = 0.8 + Math.random() * 1.6;
        if (dist < 35 && Math.random() < 0.18 + waveNum * 0.02) {
          c.diving = true;
          c.divingSince = 0;
        }
      }
    }

    // face velocity direction — compute flying direction
    const facingDir = c.diving
      ? dir
      : new THREE.Vector3(dir.x, 0, dir.z).normalize();
    c.group.rotation.y = Math.atan2(facingDir.x, facingDir.z);
    // slight pitch toward dive direction
    const targetPitch = c.diving ? -Math.atan2(facingDir.y, 1) * 0.6 : 0;
    c.group.rotation.x = lerp(c.group.rotation.x, targetPitch, Math.min(1, 4 * dt));

    // flap wings
    const flap = Math.sin(now * 0.02 + c.flapPhase) * 0.9 - 0.1;
    c.group.userData.leftWing.rotation.z = flap;
    c.group.userData.rightWing.rotation.z = -flap;

    // hit tank?
    if (dist < CFG.crow.attackDist + 1.3) {
      damageTank();
      scene.remove(c.group);
      crows.splice(i, 1);
    }

    // stray too far: despawn (safety)
    if (c.group.position.distanceTo(tank.position) > 180) {
      scene.remove(c.group);
      crows.splice(i, 1);
    }
  }
}

function damageTank() {
  health--;
  renderHearts();
  flashHit();
  sfxDamage();
  if (health <= 0) endGame();
}

// ── Particles (feathers / dust) ──
function spawnFeatherBurst(pos, count = 14, color = null) {
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.12;
    const geom = new THREE.BoxGeometry(size * 0.4, size * 0.15, size * 1.4);
    const mat = new THREE.MeshBasicMaterial({
      color: color !== null ? color : (Math.random() < 0.85 ? 0x0a0a0a : 0x3a2a1a),
      transparent: true,
      opacity: 1,
    });
    const p = new THREE.Mesh(geom, mat);
    p.position.copy(pos);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 3 + Math.random() * 5;
    const v = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.cos(phi) * speed + 2,
      Math.sin(phi) * Math.sin(theta) * speed
    );
    const rotV = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );
    particles.push({
      mesh: p,
      vel: v,
      rotV,
      age: 0,
      life: 1.2 + Math.random() * 0.6,
    });
    scene.add(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    // gravity + drag
    p.vel.y -= 9 * dt;
    p.vel.multiplyScalar(1 - 0.8 * dt);
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.rotV.x * dt;
    p.mesh.rotation.y += p.rotV.y * dt;
    p.mesh.rotation.z += p.rotV.z * dt;

    if (p.mesh.position.y < 0.05) {
      p.mesh.position.y = 0.05;
      p.vel.y = 0;
      p.vel.multiplyScalar(0.5);
    }

    const t = p.age / p.life;
    p.mesh.material.opacity = Math.max(0, 1 - t);
    if (p.age >= p.life) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function updateWave(dt) {
  if (state !== 'playing') return;
  if (crowsRemaining > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnCrow();
      crowsRemaining--;
      spawnTimer = spawnInterval * (0.8 + Math.random() * 0.4);
    }
  } else if (crows.length === 0) {
    startNextWave();
  }
}

function updateCamera(dt) {
  // chase cam: fixed screen-relative, slight lag
  const desired = new THREE.Vector3(
    tank.position.x,
    tank.position.y + 13,
    tank.position.z - 17
  );
  camera.position.lerp(desired, Math.min(1, 3 * dt));
  const lookTarget = new THREE.Vector3(
    tank.position.x,
    tank.position.y + 2,
    tank.position.z
  );
  // subtle look-ahead toward turret aim
  const turret = tank.userData.turret;
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(turret.getWorldQuaternion(_tmpQ));
  lookTarget.addScaledVector(fwd, 3);
  camera.lookAt(lookTarget);
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 150) c.position.x = -150;
    if (c.position.x < -150) c.position.x = 150;
  }
}

// ══════════════════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════════════════
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state === 'playing') {
    updateTank(dt);
    updateBullets(dt);
    updateCrows(dt);
    updateWave(dt);
  }
  // always: camera, particles, clouds (so menu looks alive)
  updateCamera(dt);
  updateParticles(dt);
  updateClouds(dt);

  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// ══════════════════════════════════════════════════════════════════
//  MENU WIRING
// ══════════════════════════════════════════════════════════════════
document.getElementById('btn-play').addEventListener('click', () => {
  ensureAudio();
  startGame();
});
document.getElementById('btn-retry').addEventListener('click', () => {
  ensureAudio();
  startGame();
});
document.getElementById('btn-menu').addEventListener('click', showMenu);
document.getElementById('btn-help').addEventListener('click', () => {
  document.getElementById('help-box').classList.toggle('hidden');
});

// initial hearts render for title (invisible but preloaded)
renderHearts();

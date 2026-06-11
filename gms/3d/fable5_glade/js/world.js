// Environment: gradient sky + sun glow, circular grass meadow with gentle
// height noise, dirt cliff skirt, surrounding water, instanced grass tufts,
// flowers, drifting clouds, lighting.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, SITES, LITE } from './config.js';
import { rand, canvasTexture, M } from './utils.js';
import { register } from './registry.js';

const R = CFG.terrainRadius;

// ───────── height field ─────────

function baseHeight(x, z) {
  return 0.50 * Math.sin(x * 0.16) * Math.cos(z * 0.13)
       + 0.30 * Math.sin(x * 0.31 + 1.7) * Math.sin(z * 0.26 + 0.6)
       + 0.12 * Math.sin(x * 0.83 + 0.2) * Math.cos(z * 0.71 + 1.3);
}

const FLAT_SPOTS = [SITES.house, SITES.spawn, SITES.pen];

export function groundHeight(x, z) {
  let h = baseHeight(x, z);
  for (const s of FLAT_SPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    const t = THREE.MathUtils.smoothstep(d, s.r * 0.45, s.r); // 0 inside, 1 outside
    h = THREE.MathUtils.lerp(s.h, h, t);
  }
  return h;
}

// Coherent low-frequency colour noise (0..1).
const colourNoise = (x, z) =>
  0.5 + 0.35 * Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.5 - 0.7)
      + 0.15 * Math.sin(x * 1.7 + 0.4) * Math.cos(z * 1.9 + 2.1);

// ───────── meadow disc (polar grid so interior vertices exist) ─────────

function buildMeadow() {
  const RINGS = 40, SEG = 128;
  const pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
  for (let i = 1; i <= RINGS; i++) {
    const r = (i / RINGS) * R;
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      uv.push(0.5 + (Math.cos(a) * r) / (2 * R), 0.5 + (Math.sin(a) * r) / (2 * R));
    }
  }
  const ringStart = i => 1 + (i - 1) * SEG;
  for (let j = 0; j < SEG; j++) idx.push(0, ringStart(1) + j, ringStart(1) + (j + 1) % SEG);
  for (let i = 1; i < RINGS; i++) {
    const a = ringStart(i), b = ringStart(i + 1);
    for (let j = 0; j < SEG; j++) {
      const j2 = (j + 1) % SEG;
      idx.push(a + j, b + j, b + j2, a + j, b + j2, a + j2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.rotateX(-Math.PI / 2); // face +y

  // displace + vertex colours
  const p = geo.attributes.position;
  const colours = new Float32Array(p.count * 3);
  const cA = new THREE.Color(0x4e8f3d), cB = new THREE.Color(0x74b85a),
        cDry = new THREE.Color(0x8aa84e), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = groundHeight(x, z);
    p.setY(i, h);
    const n = THREE.MathUtils.clamp(colourNoise(x, z), 0, 1);
    tmp.lerpColors(cA, cB, n);
    const dry = THREE.MathUtils.clamp(colourNoise(x * 0.6 + 40, z * 0.6 - 25), 0, 1);
    if (dry > 0.72) tmp.lerp(cDry, (dry - 0.72) * 2.2);
    tmp.multiplyScalar(0.94 + h * 0.10); // dips a touch darker
    colours[i * 3] = tmp.r; colours[i * 3 + 1] = tmp.g; colours[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();

  const grassTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * s, y = Math.random() * s, l = rand(3, 9);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(48,88,34,0.16)' : 'rgba(235,255,215,0.13)';
      g.lineWidth = rand(0.6, 1.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - l); g.stroke();
    }
  });
  grassTex.repeat.set(18, 18);

  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: grassTex, vertexColors: true, roughness: 1, metalness: 0,
  }));
  ground.receiveShadow = true;
  return ground;
}

// ───────── dirt cliff skirt around the meadow edge ─────────

function buildSkirt() {
  const SEG = 128, depth = 2.4;
  const pos = [], col = [], idx = [];
  const top = new THREE.Color(0x7d5a3a), bot = new THREE.Color(0x4c3522);
  for (let j = 0; j <= SEG; j++) {
    const a = (j / SEG) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const y = groundHeight(x, z) - 0.02;
    pos.push(x, y, z, x, -depth, z);
    col.push(top.r, top.g, top.b, bot.r, bot.g, bot.b);
  }
  for (let j = 0; j < SEG; j++) {
    const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, side: THREE.DoubleSide,
  }));
}

// ───────── sky dome with sun glow ─────────

function buildSky() {
  const sun = new THREE.Vector3(...CFG.sunDir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x3e7fd2) },
      uHorizon: { value: new THREE.Color(0xdff0f7) },
      uSun: { value: sun },
      uSunCol: { value: new THREE.Color(0xfff3cf) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uSun, uSunCol;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
        float d = max(dot(normalize(vDir), uSun), 0.0);
        col += uSunCol * (pow(d, 220.0) * 0.85 + pow(d, 9.0) * 0.16);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.userData.noWire = true;
  return new THREE.Mesh(new THREE.SphereGeometry(240, 24, 14), mat);
}

// ───────── instanced grass tufts ─────────

function tooCloseToSites(x, z) {
  if (Math.hypot(x - SITES.house.x, z - SITES.house.z) < 4.2) return true;
  if (Math.hypot(x - SITES.well.x, z - SITES.well.z) < 1.3) return true;
  if (Math.hypot(x - SITES.campfire.x, z - SITES.campfire.z) < 1.3) return true;
  return false;
}

function buildGrassTufts() {
  const blade = canvasTexture(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const xb = rand(18, 110), w = rand(4, 8), lean = rand(-18, 18), top = rand(6, 38);
      const grad = g.createLinearGradient(0, s, 0, top);
      grad.addColorStop(0, '#cfe0b0'); grad.addColorStop(1, '#f4ffe2');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(xb - w, s);
      g.quadraticCurveTo(xb - w * 0.4 + lean * 0.5, s * 0.5, xb + lean, top);
      g.quadraticCurveTo(xb + w * 0.4 + lean * 0.5, s * 0.5, xb + w, s);
      g.closePath(); g.fill();
    }
  });
  blade.wrapS = blade.wrapT = THREE.ClampToEdgeWrapping;

  const p1 = new THREE.PlaneGeometry(0.55, 0.5).translate(0, 0.25, 0);
  const p2 = p1.clone().rotateY(Math.PI / 2);
  const geo = mergeGeometries([p1, p2]);
  const mat = new THREE.MeshStandardMaterial({
    map: blade, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
  });
  const count = LITE ? 240 : 460;
  const tufts = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
        v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (R - 1.6);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (tooCloseToSites(x, z) && ++tries < 8);
    e.set(0, rand(0, Math.PI * 2), 0);
    const s = rand(0.7, 1.5);
    m.compose(v.set(x, groundHeight(x, z) - 0.02, z), q.setFromEuler(e), sc.set(s, s * rand(0.85, 1.25), s));
    tufts.setMatrixAt(i, m);
    col.setHSL(0.26 + rand(-0.02, 0.035), 0.52, rand(0.34, 0.48));
    tufts.setColorAt(i, col);
  }
  tufts.receiveShadow = true;
  return tufts;
}

// ───────── instanced flowers ─────────

function buildFlowers() {
  const count = 70;
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.022, 0.2, 5).translate(0, 0.1, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.05, 0).scale(1, 0.75, 1).translate(0, 0.22, 0);
  const stems = new THREE.InstancedMesh(stemGeo, M(0x3e7a35), count);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
  const palette = [0xf5f2e8, 0xffd95e, 0xe2606a, 0xb07ad6];
  const m = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (R - 2);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (tooCloseToSites(x, z) && ++tries < 8);
    m.makeScale(1, rand(0.8, 1.3), 1).setPosition(x, groundHeight(x, z) - 0.01, z);
    stems.setMatrixAt(i, m); heads.setMatrixAt(i, m);
    col.set(palette[i % palette.length]).offsetHSL(0, 0, rand(-0.05, 0.05));
    heads.setColorAt(i, col);
  }
  const g = new THREE.Group();
  g.add(stems, heads);
  return g;
}

// ───────── drifting clouds ─────────

function buildClouds() {
  const tex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = rand(50, 206), y = rand(54, 86), r = rand(20, 42);
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 128);
    }
    return c;
  })());
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: rand(0.5, 0.8), depthWrite: false,
    }));
    const s = rand(18, 34);
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set(rand(-90, 90), rand(28, 52), rand(-90, 90));
    sp.userData.speed = rand(0.5, 1.2);
    group.add(sp); sprites.push(sp);
  }
  group.userData.tick = (dt) => {
    for (const sp of sprites) {
      sp.position.x += sp.userData.speed * dt;
      if (sp.position.x > 110) sp.position.x = -110;
    }
  };
  return group;
}

// ───────── build everything ─────────

export function buildWorld(scene) {
  scene.fog = new THREE.Fog(0xe4f1f7, 70, 180);

  const sky = buildSky();
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8f4e, 0.65);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
  sun.position.set(...CFG.sunDir);
  if (!LITE) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -32; sc.right = sc.top = 32;
    sc.near = 5; sc.far = 90;
    sun.shadow.bias = -0.0006;
  }
  scene.add(sun);

  const ground = buildMeadow();
  scene.add(ground);

  const skirt = buildSkirt();
  scene.add(skirt);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(R + 60, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4a86b8, roughness: 0.2, metalness: 0.1 })
  );
  water.position.y = -1.7;
  scene.add(water);

  const tufts = buildGrassTufts();
  scene.add(tufts);

  const flowers = buildFlowers();
  scene.add(flowers);

  const clouds = buildClouds();
  scene.add(clouds);

  register({ name: 'Meadow Terrain', category: 'Environment', icon: '🟢', object: ground, collider: null, pickup: null, note: 'Polar-grid disc, height noise + flattened sites, vertex colours × canvas grass detail' });
  register({ name: 'Cliff Skirt', category: 'Environment', icon: '🟤', object: skirt, collider: null, pickup: null, note: 'Edge of the world — dirt wall following terrain rim' });
  register({ name: 'Water', category: 'Environment', icon: '🌊', object: water, collider: null, pickup: null, note: 'Surrounding sea disc' });
  register({ name: 'Sky Dome', category: 'Environment', icon: '🌤️', object: sky, collider: null, pickup: null, note: 'Gradient shader + sun glow' });
  register({ name: 'Grass Tufts', category: 'Environment', icon: '🌿', object: tufts, collider: null, pickup: null, note: `Instanced crossed-quad blades ×${tufts.count}` });
  register({ name: 'Flowers', category: 'Environment', icon: '🌼', object: flowers, collider: null, pickup: null, note: 'Instanced stems + tinted heads ×70' });
  register({ name: 'Clouds', category: 'Environment', icon: '☁️', object: clouds, collider: null, pickup: null, note: 'Drifting billboard sprites ×6' });

  return {
    ground, groundHeight,
    tick(dt) { clouds.userData.tick(dt); },
  };
}

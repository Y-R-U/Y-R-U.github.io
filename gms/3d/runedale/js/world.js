// The world: a rolling grass disc with a winding river, dirt roads, flattened
// town pads, a gradient sky, sun + shadows, and instanced grass.
//
// groundHeight(x,z) is THE single source of truth for terrain height — every
// prop, creature and the player sits on it. Tap-to-move raycasts a flat helper
// plane and then re-queries this for the exact y. The river is carved below
// WATER_LEVEL and blocks movement — except at the shallow FORD where the main
// road crosses. Roads and towns are painted into the terrain vertex colours.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, RIVER, ROADS, TOWNS, FORD, LITE } from './config.js';
import { canvasTexture, rand } from './utils.js';

export const WATER_LEVEL = -0.55;
const RIVER_HALF = 5.2;          // half-width of the carved channel
const BANK = 3.0;                // extra band counted as "near water"

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// closest point on a poly-line to (x,z)
function polyClosest(line, x, z) {
  let best = Infinity, cx = x, cz = z;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = x - a.x, apz = z - a.z;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz || 1)));
    const px = a.x + abx * t, pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; cx = px; cz = pz; }
  }
  return { dist: best, cx, cz };
}

export const riverClosest = (x, z) => polyClosest(RIVER, x, z);
export const riverDist = (x, z) => riverClosest(x, z).dist;
export function roadDist(x, z) {
  let best = Infinity;
  for (const r of ROADS) { const d = polyClosest(r, x, z).dist; if (d < best) best = d; }
  return best;
}

const fordDist = (x, z) => Math.hypot(x - FORD.x, z - FORD.z);

// keep a position out of the deep water channel — unless crossing the ford
export function riverBlock(pos) {
  if (fordDist(pos.x, pos.z) < FORD.r) return;
  const { dist, cx, cz } = riverClosest(pos.x, pos.z);
  if (dist >= RIVER_HALF) return;
  let dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
  if (d < 1e-4) { dx = 1; dz = 0; d = 1; }                 // exactly on the line
  pos.x = cx + (dx / d) * RIVER_HALF;
  pos.z = cz + (dz / d) * RIVER_HALF;
}

export function groundHeight(x, z) {
  // gentle rolling hills
  let h = (Math.sin(x * 0.045) * Math.cos(z * 0.041) + Math.sin(x * 0.019 + z * 0.027) * 0.7) * 0.6;
  h = Math.max(h, -0.3);   // keep dry land above the waterline — the river is the ONLY water

  // flatten town pads (smooth blend from the town height to the hills)
  for (const k in TOWNS) {
    const t = TOWNS[k];
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < t.r + 12) { const w = 1 - smooth(t.r, t.r + 12, d); h = h * (1 - w) + t.h * w; }
  }

  // carve the riverbed
  const d = riverDist(x, z);
  if (d < RIVER_HALF + BANK) {
    let bed = -1.5 + smooth(0, RIVER_HALF + BANK, d) * 1.5; // -1.5 at centre up to bank
    // the ford: a shallow gravel bar you can wade across (bed pinned at -0.58,
    // 3cm under the water, everywhere riverBlock lets you walk)
    const fd = fordDist(x, z);
    if (fd < FORD.r * 1.5) {
      const w = 1 - smooth(FORD.r, FORD.r * 1.5, fd);
      bed = bed * (1 - w) + (-0.58) * w;
    }
    h = Math.min(h, bed);
  }
  return h;
}

export const nearWater = (x, z) => riverDist(x, z) < RIVER_HALF + BANK + 0.5;
export const inWater = (x, z) => riverDist(x, z) < RIVER_HALF - 0.6 && groundHeight(x, z) < WATER_LEVEL - 0.1;

export function buildWorld(scene, renderer) {
  // ── environment map (makes the metalness/atlas material read right) ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ── sky: big gradient dome + fog ──
  scene.background = new THREE.Color(0x8fc4ee);
  scene.fog = new THREE.Fog(0xbfe0f4, 62, 150);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x4d93d6) }, bot: { value: new THREE.Color(0xdaf0fb) } },
      vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying float h; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.1+0.15,0.0,1.0)), 1.0);} `,
    })
  );
  sky.userData.noWire = true;
  scene.add(sky);

  // ── lighting ──
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x55613f, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.1);
  sun.position.set(...CFG.sunDir);
  if (!LITE) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 46;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;

  // ── terrain (subdivided, displaced, vertex-coloured) ──
  const R = CFG.worldRadius + 10;
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = [];
  const grass1 = new THREE.Color(0x6fae42), grass2 = new THREE.Color(0x5b9a39);
  const dirt = new THREE.Color(0x8a6b41), sand = new THREE.Color(0xc7b27e);
  const path = new THREE.Color(0xa08653);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const d = riverDist(x, z);
    if (d < RIVER_HALF + 0.6) c.copy(sand);
    else if (d < RIVER_HALF + BANK) c.copy(sand).lerp(grass1, smooth(RIVER_HALF + 0.6, RIVER_HALF + BANK, d));
    else {
      c.copy(Math.random() < 0.5 ? grass1 : grass2);
      if (h > 1.0) c.lerp(dirt, smooth(1.0, 2.4, h) * 0.5);
      // worn dirt roads
      const rd = roadDist(x, z);
      if (rd < 3.0) c.lerp(path, (1 - smooth(1.6, 3.0, rd)) * 0.85);
    }
    c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // flat invisible plane for tap raycasts (cheap, never misses)
  const rayPlane = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ visible: false }));
  scene.add(rayPlane);

  // ── water surface ──
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f7fb8, transparent: true, opacity: 0.82, roughness: 0.18, metalness: 0.2,
    envMapIntensity: 1.2,
  });
  const waterGeo = new THREE.PlaneGeometry(R * 2.4, R * 2.4, 1, 1).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = WATER_LEVEL;
  water.renderOrder = 1;
  scene.add(water);

  // ── instanced grass tufts ──
  let grass = null;
  if (!LITE) grass = buildGrass();

  function buildGrass() {
    // soft alpha-cut blades — reads as wispy grass, not solid green spikes
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
    const merged = mergeGeo([p1, p1.clone().rotateY(Math.PI / 2)]);
    const m = new THREE.MeshStandardMaterial({ map: blade, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    const N = LITE ? 1600 : 4200;
    const inst = new THREE.InstancedMesh(merged, m, N);
    const dummy = new THREE.Object3D();
    const cc = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * CFG.worldRadius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (riverDist(x, z) < RIVER_HALF + 1) continue;
      if (roadDist(x, z) < 2.2) continue;
      const h = groundHeight(x, z);
      if (h < WATER_LEVEL) continue;
      const s = 0.7 + Math.random() * 0.8;
      dummy.position.set(x, h - 0.02, z);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.set(s, s * (0.85 + Math.random() * 0.4), s);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      cc.setHSL(0.26 + rand(-0.02, 0.035), 0.52, rand(0.34, 0.48));
      inst.setColorAt(n, cc);
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false; inst.receiveShadow = true;
    inst.frustumCulled = false;
    scene.add(inst);
    return inst;
  }

  return {
    ground: rayPlane,
    groundVisual: ground,
    groundHeight, nearWater, inWater, riverDist, riverBlock, roadDist,
    waterLevel: WATER_LEVEL,
    sun, sunTarget, sky, water,
    tick(dt, t) {
      // subtle water shimmer
      waterMat.opacity = 0.78 + Math.sin(t * 1.3) * 0.04;
    },
  };
}

// minimal geometry merge (two small planes) without an addon dependency
function mergeGeo(geos) {
  let vCount = 0;
  for (const g of geos) vCount += g.attributes.position.count;
  const pos = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2), idx = [];
  let vo = 0;
  for (const g of geos) {
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.set([p.getX(i), p.getY(i), p.getZ(i)], (vo + i) * 3); if (u) uv.set([u.getX(i), u.getY(i)], (vo + i) * 2); }
    const gi = g.index;
    if (gi) for (let i = 0; i < gi.count; i++) idx.push(vo + gi.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(vo + i);
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

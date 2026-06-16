// The world: a rolling grass disc with a winding river, a gradient sky, sun +
// shadows, an environment map for the shared material, and instanced grass.
//
// groundHeight(x,z) is THE single source of truth for terrain height — every
// prop, creature and the player sits on it. Tap-to-move raycasts a flat helper
// plane and then re-queries this for the exact y, so gentle hills never break
// targeting. The river is carved below WATER_LEVEL; nearWater() drives the
// auto-refill + fishing systems.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, RIVER, LITE } from './config.js';
import { M } from './utils.js';

export const WATER_LEVEL = -0.55;
const RIVER_HALF = 5.2;          // half-width of the carved channel
const BANK = 3.0;                // extra band counted as "near water"

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// closest point on the river poly-line to (x,z)
export function riverClosest(x, z) {
  let best = Infinity, cx = x, cz = z;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const apx = x - a.x, apz = z - a.z;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz || 1)));
    const px = a.x + abx * t, pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; cx = px; cz = pz; }
  }
  return { dist: best, cx, cz };
}
export const riverDist = (x, z) => riverClosest(x, z).dist;

// keep a position out of the deep water channel (you stop at the bank to fish)
export function riverBlock(pos) {
  const { dist, cx, cz } = riverClosest(pos.x, pos.z);
  if (dist >= RIVER_HALF) return;
  let dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
  if (d < 1e-4) { dx = 1; dz = 0; d = 1; }                 // exactly on the line
  pos.x = cx + (dx / d) * RIVER_HALF;
  pos.z = cz + (dz / d) * RIVER_HALF;
}

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  // gentle rolling hills, flattened around the central village
  let h = (Math.sin(x * 0.055) * Math.cos(z * 0.048) + Math.sin(x * 0.021 + z * 0.03) * 0.6) * 0.45;
  h *= smooth(12, 40, r);
  // carve the riverbed
  const d = riverDist(x, z);
  if (d < RIVER_HALF + BANK) {
    const bed = -1.5 + smooth(0, RIVER_HALF + BANK, d) * 1.5; // -1.5 at centre up to bank
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
  scene.fog = new THREE.Fog(0xbfe0f4, 55, 130);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 24, 16),
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
  // A real grid of vertices so the mesh matches groundHeight everywhere — a
  // CircleGeometry has no interior verts, which made the ground look flat while
  // the player rode the hilly height function (floating / sinking).
  const R = CFG.worldRadius + 6;
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, 168, 168);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = [];
  const grass1 = new THREE.Color(0x6fae42), grass2 = new THREE.Color(0x5b9a39);
  const dirt = new THREE.Color(0x8a6b41), sand = new THREE.Color(0xc7b27e);
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
      if (h > 0.8) c.lerp(dirt, smooth(0.8, 2.2, h) * 0.5);
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
    // a little 3-plane star so each tuft reads as a grass clump, not a cube
    const blade = new THREE.PlaneGeometry(0.2, 0.7); blade.translate(0, 0.34, 0);
    const merged = mergeGeo([blade, blade.clone().rotateY(Math.PI / 3), blade.clone().rotateY(2 * Math.PI / 3)]);
    const N = 1800;
    const m = new THREE.MeshStandardMaterial({ color: 0x6aa83e, side: THREE.DoubleSide, roughness: 1 });
    const inst = new THREE.InstancedMesh(merged, m, N);
    const dummy = new THREE.Object3D();
    const cc = new THREE.Color();
    let n = 0;
    for (let i = 0; i < N * 3 && n < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * CFG.worldRadius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (riverDist(x, z) < RIVER_HALF + 1) continue;
      const h = groundHeight(x, z);
      if (h < WATER_LEVEL) continue;
      dummy.position.set(x, h, z);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.setScalar(0.7 + Math.random() * 0.9);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      cc.setHSL(0.25 + Math.random() * 0.06, 0.5, 0.36 + Math.random() * 0.12);
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
    groundHeight, nearWater, inWater, riverDist, riverBlock,
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
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; }
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

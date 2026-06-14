// The 3D dollhouse: grass meadow, sky, lighting, per-room floors, chunky low
// walls, furniture (the hiding spots), plus trees + a fence for the Glade vibe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLS, ROWS, TS, LITE } from './config.js';
import { ROOMS, SPOTS, grid, isFloor, tileToWorld } from './grid.js';
import { rand, canvasTexture, M, mesh } from './utils.js';

export const WALL_H = 0.82;
const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

// ───────── textures ─────────
function floorTexture(room) {
  const tile = room.name === 'Bathroom' || room.name === 'Kitchen';
  return canvasTexture(128, (g, s) => {
    g.fillStyle = hexCss(room.floor); g.fillRect(0, 0, s, s);
    g.strokeStyle = hexCss(room.plank);
    if (tile) {
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke();
        g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke();
      }
    } else {
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
      g.globalAlpha = 0.06;
      for (let i = 0; i < 60; i++) { g.fillStyle = '#000'; g.fillRect(rand(0, s), rand(0, s), rand(2, 10), 1); }
      g.globalAlpha = 1;
    }
  });
}
const wallTex = canvasTexture(64, (g, s) => {
  g.fillStyle = '#efe6d8'; g.fillRect(0, 0, s, s);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 40; i++) { g.fillStyle = '#000'; g.fillRect(rand(0, s), rand(0, s), 1, rand(2, 8)); }
  g.globalAlpha = 1;
  g.fillStyle = '#d8cdbb'; g.fillRect(0, s - 8, s, 8); // baseboard band
});
const grassTex = canvasTexture(256, (g, s) => {
  g.fillStyle = '#69a14e'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * s, y = Math.random() * s, l = rand(3, 9);
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(40,80,30,0.16)' : 'rgba(225,250,200,0.14)';
    g.lineWidth = rand(0.6, 1.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - l); g.stroke();
  }
}, 30);

// ───────── sky ─────────
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x4f8fd6) },
      uHorizon: { value: new THREE.Color(0xe6f2f6) },
      uSun: { value: new THREE.Vector3(-0.5, 0.85, 0.4).normalize() },
      uSunCol: { value: new THREE.Color(0xfff3cf) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uZenith,uHorizon,uSun,uSunCol; varying vec3 vDir;
      void main(){ float h=clamp(vDir.y,-1.0,1.0); vec3 c=mix(uHorizon,uZenith,pow(max(h,0.0),0.55));
        float d=max(dot(normalize(vDir),uSun),0.0); c+=uSunCol*(pow(d,220.0)*0.8+pow(d,9.0)*0.15);
        gl_FragColor=vec4(c,1.0); }`,
  });
  mat.userData.noWire = true;
  return new THREE.Mesh(new THREE.SphereGeometry(200, 24, 14), mat);
}

// ───────── furniture (each sits on its spot tile; ≤ ~0.8 tall so it reads) ─────────
function furniture(type) {
  const g = new THREE.Group();
  const box = (w, h, d, col, x = 0, y = 0, z = 0) => { const m = mesh(new THREE.BoxGeometry(w, h, d), M(col), x, y + h / 2, z); g.add(m); return m; };
  const cyl = (rt, rb, h, col, x = 0, y = 0, z = 0) => { const m = mesh(new THREE.CylinderGeometry(rt, rb, h, 12), M(col), x, y + h / 2, z); g.add(m); return m; };
  const S = TS;
  switch (type) {
    case 'couch':
      box(S * 0.92, 0.30, S * 0.6, 0x9a5a45, 0, 0, S * 0.1);
      box(S * 0.92, 0.34, S * 0.18, 0xa86a54, 0, 0, -S * 0.28);
      box(0.16, 0.28, S * 0.55, 0xa86a54, -S * 0.42, 0.18, S * 0.05);
      box(0.16, 0.28, S * 0.55, 0xa86a54, S * 0.42, 0.18, S * 0.05);
      break;
    case 'curtain':
      box(S * 0.9, 0.10, 0.18, 0x7a4a3c, 0, WALL_H - 0.1, -S * 0.36);
      for (let i = 0; i < 4; i++) box(S * 0.2, WALL_H - 0.05, 0.12, i % 2 ? 0xc98a7a : 0xb87060, -S * 0.3 + i * S * 0.2, 0, -S * 0.34);
      break;
    case 'pantry': case 'wardrobe':
      box(S * 0.74, WALL_H - 0.02, S * 0.5, type === 'pantry' ? 0x9a7048 : 0x7d5a8c, 0, 0, -S * 0.18);
      box(S * 0.30, WALL_H - 0.16, 0.04, type === 'pantry' ? 0x7c5837 : 0x654873, -S * 0.18, 0.08, S * 0.08);
      box(S * 0.30, WALL_H - 0.16, 0.04, type === 'pantry' ? 0x7c5837 : 0x654873, S * 0.18, 0.08, S * 0.08);
      break;
    case 'cupboard':
      box(S * 0.8, 0.5, S * 0.5, 0xb89b78, 0, 0, -S * 0.15);
      box(S * 0.8, 0.06, S * 0.55, 0x8a6a48, 0, 0.5, -S * 0.15);
      break;
    case 'shelf':
      box(S * 0.7, WALL_H, S * 0.36, 0x6e4a30, 0, 0, -S * 0.28);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        box(S * 0.16, 0.18, S * 0.18, [0xc0556a, 0x5a86c0, 0x6aa36a][(i + j) % 3], -S * 0.22 + j * S * 0.22, 0.1 + i * 0.24, -S * 0.25);
      break;
    case 'plant':
      cyl(S * 0.18, S * 0.22, 0.3, 0xa9683f, 0, 0, 0);
      for (const [dx, dy, r] of [[0, 0.5, 0.26], [-0.16, 0.42, 0.18], [0.16, 0.42, 0.18], [0, 0.66, 0.18]])
        g.add(mesh(new THREE.IcosahedronGeometry(r, 0), M(0x3f7a44), dx, dy, 0));
      break;
    case 'bed': case 'bunk':
      box(S * 0.8, 0.26, S * 0.95, 0xc9b48f, 0, 0, 0);
      box(S * 0.8, 0.16, S * 0.95, 0xbfe0ef, 0, 0.26, S * 0.08);
      box(S * 0.7, 0.16, S * 0.26, type === 'bunk' ? 0xe58aa8 : 0x7fa8d6, 0, 0.3, -S * 0.3); // pillow
      if (type === 'bunk') { box(0.08, WALL_H, 0.08, 0x9a7048, -S * 0.36, 0, -S * 0.4); box(0.08, WALL_H, 0.08, 0x9a7048, S * 0.36, 0, -S * 0.4); }
      break;
    case 'toybox':
      box(S * 0.66, 0.42, S * 0.5, 0xe08a3c, 0, 0, 0);
      box(S * 0.68, 0.08, S * 0.52, 0xf2a857, 0, 0.42, 0);
      break;
    case 'shower': {
      const m = mesh(new THREE.BoxGeometry(S * 0.78, WALL_H + 0.05, S * 0.6), new THREE.MeshStandardMaterial({ color: 0xbfe2e6, transparent: true, opacity: 0.4, roughness: 0.1 }), 0, (WALL_H + 0.05) / 2, -S * 0.12);
      g.add(m);
      cyl(0.05, 0.05, 0.1, 0xcfe6e4, 0, WALL_H - 0.1, -S * 0.28);
      break;
    }
    case 'basket':
      cyl(S * 0.3, S * 0.26, 0.42, 0xcdb487, 0, 0, 0);
      box(S * 0.5, 0.12, S * 0.5, 0xe9e2d4, 0, 0.36, 0); // poking laundry
      break;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ───────── build everything ─────────
export function buildHouse(scene) {
  scene.fog = new THREE.Fog(0xe6f2f6, 48, 130);
  scene.add(buildSky());

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b8f4e, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
  sun.position.set(-12, 22, 10);
  if (!LITE) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -24; sc.right = sc.top = 24; sc.near = 4; sc.far = 70;
    sun.shadow.bias = -0.0007;
  }
  scene.add(sun);

  // meadow
  const ground = mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), 0, -0.02, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const house = new THREE.Group();
  scene.add(house);

  // base floor (fills doorways/gaps) + per-room textured tops
  const fp0 = tileToWorld(0, 0), fp1 = tileToWorld(COLS - 1, ROWS - 1);
  const baseW = (fp1.x - fp0.x) + TS, baseD = (fp1.z - fp0.z) + TS;
  house.add(mesh(new THREE.BoxGeometry(baseW, 0.1, baseD), M(0xb9a07f), (fp0.x + fp1.x) / 2, -0.05, (fp0.z + fp1.z) / 2));
  for (const rm of ROOMS) {
    const a = tileToWorld(rm.c0, rm.r0), b = tileToWorld(rm.c1, rm.r1);
    const w = (b.x - a.x) + TS, d = (b.z - a.z) + TS;
    const tex = floorTexture(rm); tex.repeat.set((rm.c1 - rm.c0 + 1), (rm.r1 - rm.r0 + 1));
    const f = mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), (a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
    f.castShadow = false;
    house.add(f);
  }

  // chunky walls: every non-floor tile that borders a floor tile → merged box mesh
  const wallGeos = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] === 1) continue;
    let borders = false;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
      if (isFloor(c + dc, r + dr)) { borders = true; break; }
    if (!borders) continue;
    const w = tileToWorld(c, r);
    wallGeos.push(new THREE.BoxGeometry(TS, WALL_H, TS).translate(w.x, WALL_H / 2, w.z));
  }
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
  walls.castShadow = true; walls.receiveShadow = true;
  house.add(walls);

  // furniture / hiding spots
  const spotsWorld = SPOTS.map(s => {
    const w = tileToWorld(s.c, s.r);
    const f = furniture(s.type);
    f.position.set(w.x, 0, w.z);
    // face open side toward room interior-ish (rooms wrap walls on top/sides)
    house.add(f);
    return { x: w.x, z: w.z, mesh: f, spot: s };
  });

  // a few trees + a low fence ring for the meadow
  scene.add(buildTrees());
  scene.add(buildFence());

  return { groundY: 0, spotsWorld, house, sun };
}

function buildTrees() {
  const g = new THREE.Group();
  const spots = [[-18, -12], [19, -14], [-20, 13], [21, 12], [0, -20]];
  for (const [x, z] of spots) {
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 8), M(0x7a5436), 0, 1.2, 0));
    for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.5], [-0.9, 2.6, 0.4, 1.0], [0.9, 2.7, -0.3, 1.0], [0.2, 3.7, 0.2, 0.9]])
      t.add(mesh(new THREE.IcosahedronGeometry(r, 0), M(0x3f7e3f), dx, dy, dz));
    t.position.set(x, 0, z);
    t.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(t);
  }
  return g;
}

function buildFence() {
  const g = new THREE.Group();
  const mat = M(0xd9c4a0);
  const ringR = 30, n = 60;
  const post = new THREE.BoxGeometry(0.18, 0.9, 0.18);
  const inst = new THREE.InstancedMesh(post, mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * ringR, 0.45, Math.sin(a) * ringR);
    inst.setMatrixAt(i, m);
  }
  inst.castShadow = true;
  g.add(inst);
  return g;
}

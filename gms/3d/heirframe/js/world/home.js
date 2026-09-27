import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { makeCanvas, canvasTexture, rng } from './textures.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { lightPools, cable } from './p4_props.js';
import { HOLO_ART, createHoloMaterial, faceCamera } from './holo.js';
import { createBreakables } from './breakables.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Home: Pod 4471, Lullaby Rest (the Stacks). One small room: the coffin pod with Wren's sleeping body, the rig (link chair),
// a cracked window onto the pipe canyon (a real pod wall 30 m out, neon, fog), the family tree pinned to the wall with red
// string, a frame display rack (warehouse link), the codex screen, a trophy shelf for boss drops, and the door out.
// Walls are one-sided (facing in) so the Diablo camera sees in from any side, like the arcology.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RX = 6, RZ = 4.5, RH = 3.2;

export const HOME_LAYOUT = {
  bounds: { x0: -RX + 0.4, x1: RX - 0.4, z0: -RZ + 0.4, z1: RZ - 0.4 },
  spawn: { x: 0, z: 2.6 }, door: { x: 0, z: RZ - 0.8 },
  kiosk: { x: 3.6, z: -2.6 }, pad: { x: 4.4, z: 2.4 }, relay: { x: 0, z: 3.2 },
};

function wall(ctx, mat, x0, z0, x1, z1, y0, y1, color) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  g.rotateY(Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  ctx.batch.add(g, mat, { cast: false, color });
  g.dispose();
}

function treeCanvas() {
  const c = makeCanvas(1024, 512), g = c.getContext('2d'), R = rng(8);
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,25,10' : '150,120,80'},${0.1 + R() * 0.15})`; g.fillRect(R() * 1024, R() * 512, 2 + R() * 4, 2 + R() * 4); }
  const cards = [
    ['WREN', 'WARD-4471', 512, 330, '#e8e2d0'], ['TOMAS QUILL', 'father  †  the Sundering', 300, 190, '#e0d8c4'],
    ['LYRA VAEL', 'mother  —  ALIVE?', 724, 190, '#efe6cf'], ['MARA QUILL', 'aunt  (she knew)', 150, 360, '#e6dcc2'],
    ['IRIS VAEL', 'grandmother = HARMONY', 860, 360, '#dfe9ef'], ['?', 'who sent the key?', 512, 80, '#d8d2c0'],
  ];
  const pos = {};
  for (const [n, s, x, y, col] of cards) pos[n] = [x, y];
  g.strokeStyle = '#b01818'; g.lineWidth = 3;
  const str = (a, b) => { g.beginPath(); g.moveTo(...pos[a]); g.quadraticCurveTo((pos[a][0] + pos[b][0]) / 2, (pos[a][1] + pos[b][1]) / 2 + 30, ...pos[b]); g.stroke(); };
  str('WREN', 'TOMAS QUILL'); str('WREN', 'LYRA VAEL'); str('TOMAS QUILL', 'MARA QUILL'); str('LYRA VAEL', 'IRIS VAEL'); str('WREN', '?'); str('?', 'IRIS VAEL');
  for (const [n, s, x, y, col] of cards) {
    g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.12);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-86, -52, 180, 110);
    g.fillStyle = col; g.fillRect(-90, -56, 180, 108);
    g.fillStyle = '#556'; g.fillRect(-78, -44, 56, 60);
    g.fillStyle = '#9aa'; g.beginPath(); g.arc(-50, -22, 14, 0, 7); g.fill(); g.fillRect(-66, -6, 32, 22);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 20px sans-serif'; g.fillText(n, -12, -20);
    g.font = '14px sans-serif'; g.fillStyle = '#633'; g.fillText(s, -12, 4);
    g.fillStyle = '#c02020'; g.beginPath(); g.arc(0, -52, 6, 0, 7); g.fill();
    g.restore();
  }
  // Vael star sketch + a clipping
  g.strokeStyle = '#e8c860'; g.lineWidth = 4; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 18 : 42; g.lineTo(940 + Math.cos(a) * r, 90 + Math.sin(a) * r); }
  g.closePath(); g.stroke();
  g.fillStyle = '#ddd6c2'; g.fillRect(40, 40, 170, 90); g.fillStyle = '#222'; g.font = 'bold 15px serif'; g.fillText('212 YEARS TO LANDFALL', 50, 70);
  g.font = '12px serif'; g.fillText('(it never changes)', 60, 95);
  return c;
}

function crackCanvas() {
  const c = makeCanvas(256, 256), g = c.getContext('2d'), R = rng(3);
  g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2;
  const cx = 170, cy = 90;
  for (let i = 0; i < 9; i++) { let x = cx, y = cy, a = R() * Math.PI * 2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 18; y += Math.sin(a) * 18; g.lineTo(x, y); } g.stroke(); }
  for (let r = 10; r < 40; r += 12) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  return c;
}

function homeEnv(renderer, tier) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 11), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.045, 0.04), side: THREE.BackSide }));
  room.position.y = 1.5; s.add(room);
  const add = (w, h, c, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
  add(3, 1.6, [0.4, 0.9, 1.8], -6.9, 1.8, 0, Math.PI / 2);
  add(1.2, 0.3, [2.4, 1.6, 0.9], 0, 3.9, 0);
  add(2, 1.2, [0.3, 0.8, 1.6], 3.6, 1.8, -5.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 50, { size: Math.min(128, tier.envSize || 128) });
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}

function buildHome(ctx) {
  const { batch, M, col, scene } = ctx;
  ctx.gather ||= [];
  const L = HOME_LAYOUT;
  const mask = zoneMask({ x0: -RX, x1: RX, z0: -RZ, z1: RZ }, (P) => {
    P.rect(-RX, -RZ, RX, RZ, '#f00');
    P.rect(-1.2, RZ - 1.4, 1.2, RZ, 'rgb(0,255,255)');
  });
  createIndustrialGround(ctx, [{ rects: [[-RX, RX, -RZ, RZ]], y: 0, reflect: false, ao: true }], mask, { slab: 3, tint: [0.4, 0.4, 0.42], wet: 0, rust: 0.35, interior: true, key: 'home' });
  const wallC = new THREE.Color(0.42, 0.4, 0.38), panel = M.stone;
  // west wall has the window opening (z -1.4..1.4, y 1.0..2.6)
  wall(ctx, panel, -RX, RZ, -RX, 1.4, 0, RH, wallC); wall(ctx, panel, -RX, -1.4, -RX, -RZ, 0, RH, wallC);
  wall(ctx, panel, -RX, 1.4, -RX, -1.4, 0, 1.0, wallC); wall(ctx, panel, -RX, 1.4, -RX, -1.4, 2.6, RH, wallC);
  wall(ctx, panel, -RX, -RZ, RX, -RZ, 0, RH, wallC);
  wall(ctx, panel, RX, -RZ, RX, RZ, 0, RH, wallC);
  wall(ctx, panel, RX, RZ, 1.1, RZ, 0, RH, wallC); wall(ctx, panel, -1.1, RZ, -RX, RZ, 0, RH, wallC); wall(ctx, panel, 1.1, RZ, -1.1, RZ, 2.3, RH, wallC);
  // wall ribs + a dim warm strip light
  for (let x = -RX + 1; x < RX; x += 2) batch.put(box(0.12, RH, 0.1), M.darkMetal, V(x, RH / 2, -RZ + 0.05), 0, null, { cast: false });
  batch.put(box(2.4, 0.08, 0.2), M.warmGlow, V(0, RH - 0.1, 0), 0, null, { cast: false, color: new THREE.Color(0.9, 0.6, 0.35) });
  // window: frame, cracked glass, the canyon outside
  batch.put(box(0.18, 1.8, 3.0), M.darkMetal, V(-RX + 0.05, 1.8, 0), 0, null, { cast: false });
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6), new THREE.MeshBasicMaterial({ map: canvasTexture(crackCanvas()), transparent: true, opacity: 0.55, depthWrite: false, color: new THREE.Color(0.7, 0.85, 1.0) }));
  gl.rotation.y = Math.PI / 2; gl.position.set(-RX + 0.02, 1.8, 0); scene.add(gl);
  const out = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * vec2(38.0, 27.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec2 c = floor(vUv), f = fract(vUv);
        float lit = h(c); vec3 lc = lit < 0.5 ? vec3(0.0) : lit < 0.8 ? vec3(1.0, 0.6, 0.3) : vec3(0.3, 0.7, 1.4);
        float hatch = step(0.3, f.x) * step(f.x, 0.7) * step(0.4, f.y) * step(f.y, 0.75);
        vec3 col = vec3(0.03, 0.04, 0.06) + lc * hatch * 0.9 * (h(c + floor(uTime * 0.5)) > 0.97 ? 0.2 : 1.0);
        float haze = smoothstep(0.0, 27.0, vUv.y); col = mix(col, vec3(0.06, 0.1, 0.16), 0.35 + 0.3 * (1.0 - haze));
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  out.rotation.y = Math.PI / 2; out.position.set(-RX - 28, 6, 0); scene.add(out);
  // the coffin pod: shell, open glass lid, mattress, Wren asleep under a blanket
  const px = 3.4, pz = -3.0;
  batch.put(box(2.4, 1.1, 1.3), M.stone, V(px, 0.55, pz), 0, null, { color: new THREE.Color(0.55, 0.53, 0.5) });
  batch.put(box(2.2, 0.18, 1.1), M.stone, V(px, 1.12, pz), 0, null, { color: new THREE.Color(0.2, 0.22, 0.28) });
  const lid = new THREE.CapsuleGeometry(0.55, 1.4, 6, 16); lid.rotateZ(Math.PI / 2); lid.scale(1, 0.55, 1);
  batch.put(lid, M.glassDark, V(px, 1.62, pz - 0.2), 0, null, { cast: false });
  batch.put(new THREE.CapsuleGeometry(0.22, 1.1, 4, 10).rotateZ(Math.PI / 2), M.stone, V(px + 0.1, 1.33, pz), 0, null, { color: new THREE.Color(0.32, 0.4, 0.52) });
  batch.put(new THREE.SphereGeometry(0.13, 12, 10), M.stone, V(px - 0.85, 1.36, pz), 0, null, { color: new THREE.Color(0.78, 0.6, 0.5) });
  batch.put(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.stone, V(px - 0.88, 1.38, pz), -Math.PI / 2, null, { color: new THREE.Color(0.12, 0.08, 0.06) });
  const vit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), createHoloMaterial(HOLO_ART.sign('HR 52  •  DEBT 3,140 CR', 1024, 300), { bright: 2.4, alpha: 0.95, time: ctx.time, tint: [0.6, 1.1, 0.8] }));
  vit.position.set(px + 1.21, 0.75, pz); vit.rotation.y = Math.PI / 2; scene.add(vit);
  col.box(px, pz, 1.25, 0.7, 0, 'pod');
  // the rig: link chair with a headset arm and cables to the wall
  const rx = 0.6, rz = -3.1;
  batch.put(box(0.7, 0.45, 0.7), M.darkMetal, V(rx, 0.45, rz), 0, null, {});
  batch.put(box(0.7, 0.9, 0.15), M.darkMetal, V(rx, 1.0, rz - 0.3), 0, null, {});
  batch.put(box(0.08, 0.9, 0.08), M.chrome, V(rx + 0.3, 1.5, rz - 0.3), 0, null, { cast: false });
  batch.put(new THREE.TorusGeometry(0.16, 0.03, 6, 20, Math.PI), M.chrome, V(rx, 1.75, rz - 0.15), 0, null, { cast: false });
  batch.put(box(0.2, 0.06, 0.06), M.blueGlow, V(rx, 1.6, rz - 0.15), 0, null, { cast: false });
  for (const k of [0, 1, 2]) cable(ctx, [rx + 0.2 - k * 0.2, 0.9, rz - 0.35], [rx - 1 + k * 0.4, 2.6, -RZ + 0.1], 0.5, 0.025, M.darkMetal);
  col.box(rx, rz, 0.45, 0.45, 0, 'rig');
  // family tree wall (north, left of the rig)
  const tree = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: canvasTexture(treeCanvas()), roughness: 0.85 }));
  tree.position.set(-3.1, 1.75, -RZ + 0.03); scene.add(tree);
  batch.put(box(3.35, 1.75, 0.04), M.darkMetal, V(-3.1, 1.75, -RZ + 0.01), 0, null, { cast: false });
  ctx.interactables.push({ id: 'family_tree', label: 'Family tree', x: -3.1, z: -RZ + 1.4, r: 1.8 });
  // codex screen (east wall)
  const cdx = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), createHoloMaterial(HOLO_ART.ad('CODEX', 'EVERYTHING YOU KNOW', 21, '#123b6e'), { bright: 2.0, alpha: 0.95, time: ctx.time }));
  cdx.position.set(RX - 0.03, 1.7, 0.2); cdx.rotation.y = -Math.PI / 2; scene.add(cdx);
  batch.put(box(0.06, 1.1, 1.9), M.darkMetal, V(RX - 0.01, 1.7, 0.2), 0, null, { cast: false });
  ctx.interactables.push({ id: 'codex', label: 'Codex', x: RX - 1.4, z: 0.2, r: 1.6 });
  // trophy shelf (east wall, above the frame rack)
  for (const y of [1.1, 1.6]) batch.put(box(0.35, 0.05, 1.6), M.darkMetal, V(RX - 0.2, y, -1.8), 0, null, { cast: false });
  batch.put(new THREE.SphereGeometry(0.1, 10, 8), M.gold, V(RX - 0.2, 1.2, -2.3), 0, null, { cast: false });
  batch.put(box(0.12, 0.16, 0.12), M.warmGlow, V(RX - 0.2, 1.21, -1.9), 0, null, { cast: false, color: new THREE.Color(1.2, 0.5, 0.2) });
  batch.put(new THREE.OctahedronGeometry(0.1), M.blueGlow, V(RX - 0.2, 1.72, -1.6), 0, null, { cast: false });
  ctx.interactables.push({ id: 'trophies', label: 'Trophy shelf', x: RX - 1.2, z: -1.8, r: 1.4 });
  // frame display rack = warehouse link (south-east), a gantry with a clamp and a lit pad
  const fx = L.pad.x, fz = L.pad.z;
  for (const s of [-0.7, 0.7]) batch.put(box(0.12, 2.6, 0.12), M.darkMetal, V(fx + s, 1.3, fz - 0.6), 0, null, {});
  batch.put(box(1.6, 0.14, 0.14), M.darkMetal, V(fx, 2.6, fz - 0.6), 0, null, {});
  batch.put(box(0.3, 0.3, 0.5), M.gold, V(fx, 2.35, fz - 0.4), 0, null, { cast: false });
  const ring = ctx.makePadRing(0.9, [0.45, 0.85, 1.0], true); ring.position.set(fx, 0.03, fz); scene.add(ring);
  col.box(fx, fz - 0.6, 0.8, 0.12, 0, 'rack');
  ctx.interactables.push({ id: 'warehouse', label: 'Frame rack', x: fx, z: fz, r: 1.4 });
  // bed interactable (forces a shift refresh) at the pod; the door out
  ctx.interactables.push({ id: 'bed', label: 'Sleep (new shift)', x: px, z: pz + 1.3, r: 1.4 });
  batch.put(box(2.2, 2.3, 0.12), M.darkMetal, V(0, 1.15, RZ + 0.06), 0, null, { cast: false });
  batch.put(box(2.0, 0.06, 0.05), M.warmGlow, V(0, 2.25, RZ - 0.02), 0, null, { cast: false, color: new THREE.Color(1.2, 0.3, 0.1) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24), createHoloMaterial(HOLO_ART.sign('POD 4471'), { bright: 2.4, alpha: 0.9, time: ctx.time }));
  sign.position.set(0, 2.55, RZ - 0.05); sign.rotation.y = Math.PI; scene.add(sign); faceCamera(ctx, sign);
  ctx.interactables.push({ id: 'door', to: 'stacks', label: 'Out to the Stacks', x: L.door.x, z: L.door.z, r: 1.4 });
  // clutter: a crate table, a lamp, a hanging jacket, the rental's charging cable
  batch.put(box(0.8, 0.6, 0.6), M.crate, V(-4.4, 0.3, 2.9), 0.2, null, {});
  batch.put(cyl(0.05, 0.12, 0.4, -4.4, 0.6, 2.9, 10), M.darkMetal, V(0, 0, 0), 0, null, { cast: false });
  batch.put(new THREE.SphereGeometry(0.1, 8, 6), M.warmGlow, V(-4.4, 1.05, 2.9), 0, null, { cast: false });
  col.box(-4.4, 2.9, 0.45, 0.35, 0.2, 'table');
  cable(ctx, [RX - 0.1, 0.3, 3.8], [1.6, 0.02, 1.8], 0.0, 0.03, M.darkMetal);
  lightPools(ctx, [[-4.4, 2.9, 1.8, [1.1, 0.7, 0.4]], [-RX + 0.8, 0, 2.2, [0.25, 0.6, 1.2]], [RX - 0.8, 0.2, 1.6, [0.3, 0.6, 1.1]], [0, 0, 2.6, [0.8, 0.55, 0.35]]]);
  ctx.breakables = createBreakables(ctx, []);
  const S = [
    ['hm_home', 'home', 0, 0, 3], ['hm_pod', 'interior', px, pz + 1.2, 1.2], ['hm_rig', 'interior', rx, rz + 1, 1.2],
    ['hm_family_tree', 'interior', -3.1, -RZ + 1.2, 1.5], ['hm_codex', 'interior', RX - 1.2, 0.2, 1.2], ['hm_rack', 'link_pad', fx, fz, 1.4],
    ['hm_door', 'relay', L.door.x, L.door.z - 0.6, 1.2], ['hm_window', 'vantage', -RX + 1, 0, 1.2],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: 0, district: 'home', indoor: true }));
}

export const HOME = {
  id: 'home', name: 'Pod 4471 — Lullaby Rest', layout: HOME_LAYOUT, bounds: HOME_LAYOUT.bounds, build: buildHome, batchCell: 32,
  crowd: { loops: [[[0, 0], [1, 1]]], talk: [], count: 0 }, farCrowd: 0, adCount: 0, adOrigins: [],
  env: (r, tier) => homeEnv(r, tier),
  ambience: {
    interior: true, background: 0x020203, sunDir: [0.1, 1.0, 0.2],
    sun: [1.0, 0.78, 0.55], sunI: 0.9, hemiSky: 0x6a88c0, hemiGround: 0x3a2a20, hemiI: 0.55,
    fog: [0.05, 0.07, 0.1], fogDensity: 0.004, env: 1.0,
    gain: [1.02, 0.99, 1.0], lift: [0.006, 0.006, 0.012], sat: 1.1, contrast: 1.15,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z], door: [L.door.x, L.door.z - 0.6] }),
};

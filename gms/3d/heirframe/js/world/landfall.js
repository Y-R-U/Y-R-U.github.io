import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { addTree } from './foliage.js';
import { floodMast, lightPools, shuttle, addContainers, containerBlock } from './p4_props.js';
import { rail, holoLabel, crateStack, YELLOW, STEEL, GRAPHITE } from './p5_props.js';
import { kiosk, warehousePad } from './plaza.js';
import { relay } from './sites.js';
import { createBreakables } from './breakables.js';
import { HOLO_ART, createHoloMaterial, twoSided } from './holo.js';
import { makeCanvas, canvasTexture, rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Verdance Landfall (P6 post-game): the first colony on the real planet. A walled clearing of prefab domes, a landing pad,
// market stalls and crop plots, ringed by an alien meadow (teal moss, glowing bulb-stalks, crystal spires) and far
// blue-green hills. The ark hangs in the sky: the 40 km cylinder everyone grew up inside, seen from outside at last.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SUN = new THREE.Vector3(-0.55, 0.52, -0.42).normalize();
const ARK = new THREE.Vector3(0.3, 0.55, -0.8).normalize();

export const LF_LAYOUT = {
  bounds: { x0: -62, x1: 62, z0: -82, z1: 80 },
  spawn: { x: 0, z: 52 }, relay: { x: -12, z: 60 }, kiosk: { x: 12, z: 55, rot: -0.5 }, pad: { x: -22, z: 50 },
  landing: { x: 34, z: 40, r: 10 },
  domes: [[-26, 8, 8], [-6, -8, 5.5], [-34, -16, 5], [12, 12, 4.5], [-38, -44, 6.5]],
  market: { x: 2, z: 30 }, lockers: { x: 22, z: -8 }, tower: { x: 40, z: -30 }, plots: { x: 18, z: -52 }, solar: { x: 44, z: 6 },
};

// ---- sky: warm teal atmosphere, a gold sun, soft cloud banks, a pale moon (shared with the env map) ------------------
const skyGLSL = /* glsl */`
uniform vec3 uSun; uniform float uEnv, uTime; varying vec3 vDir;
float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fb3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
vec3 skyColor(vec3 d){
  float y = d.y;
  vec3 zen = vec3(0.12, 0.4, 0.55), hor = vec3(0.74, 0.86, 0.7), low = vec3(0.55, 0.66, 0.5);
  vec3 col = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, low, smoothstep(0.02, -0.12, y));
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.82, 0.5) * (pow(sd, 8.0) * 0.28 + pow(sd, 60.0) * 0.5) ;
  col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9993, 0.9997, sd) * 18.0;
  // cloud banks, thicker toward the horizon, lit gold on the sun side
  if (y > -0.02) {
    vec2 p = d.xz / (y + 0.12);
    float c = fb3(vec3(p * 0.9 + vec2(uTime * 0.004, 0.0), 1.3));
    c = smoothstep(0.52, 0.8, c) * smoothstep(0.75, 0.05, y);
    vec3 cc = mix(vec3(0.86, 0.9, 0.84), vec3(1.0, 0.9, 0.7), pow(sd, 3.0));
    col = mix(col, cc, c * 0.7);
  }
  // a pale moon high to the east
  vec3 md = normalize(vec3(0.62, 0.62, 0.3));
  float mc = dot(d, md);
  if (mc > 0.9994) col = mix(col, vec3(0.92, 0.95, 0.9) * (0.7 + 0.3 * n3(d * 900.0)), smoothstep(0.9994, 0.99955, mc) * 0.85);
  if (uEnv > 0.5 && y < 0.0) col = mix(vec3(0.1, 0.16, 0.08), col, smoothstep(-0.15, 0.0, y));
  return col;
}`;

function skyMaterial(time, env = false) {
  return new THREE.ShaderMaterial({
    name: 'LandfallSky',
    uniforms: { uSun: { value: SUN.clone() }, uEnv: { value: env ? 1 : 0 }, uTime: time || { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vDir;
      void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        gl_Position = (projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0)).xyww; }`,
    fragmentShader: skyGLSL + /* glsl */`void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

function landfallEnv(renderer, tier) {
  const s = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), skyMaterial(null, true));
  m.material.depthTest = false; m.renderOrder = -10; s.add(m);
  for (const [c, x, y, z, w, h, ry] of [[[1.4, 1.4, 1.35], -30, 6, 20, 12, 5, 1.0], [[0.8, 1.2, 1.0], 26, 3, -10, 8, 3, -1.0]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.rotation.y = ry; s.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 300, { size: tier.envSize || 256 });
  pm.dispose();
  s.traverse((q) => { q.geometry?.dispose(); q.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}

// ---- ground: one terrain mesh, flat where you walk, rising into hills beyond the colony fence --------------------------
function mossTexture() {
  const c = makeCanvas(512, 512), g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { const v = 105 + R() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v},0.28)`; const s = 1 + R() * 1.6; g.fillRect(R() * 512, R() * 512, s, s * (1 + R() * 2)); }
  for (let i = 0; i < 60; i++) { const v = 128 + R() * 30 | 0; g.fillStyle = `rgba(${v},${v},${v},0.08)`; g.beginPath(); g.arc(R() * 512, R() * 512, 10 + R() * 30, 0, 7); g.fill(); }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hillAt = (x, z, B) => {
  const dx = Math.max(0, B.x0 - 6 - x, x - B.x1 - 6), dz = Math.max(0, B.z0 - 6 - z, z - B.z1 - 6);
  const out = Math.hypot(dx, dz);
  const n = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) * 0.5 + Math.sin((x + z) * 0.043) * 0.25 + 0.5;
  // gentle rolling downs out to ~200 m, then the blue ridges on the horizon
  return out > 0 ? 16 * (1 - Math.exp(-out / 55)) * (0.4 + n) + Math.max(0, out - 230) * 0.28 * (0.6 + n) : 0;
};
function vnoise(seed) {
  const R = rng(seed), P = new Float32Array(256); for (let i = 0; i < 256; i++) P[i] = R();
  const h = (i, j) => P[(i * 73 + j * 151 + ((i * j) & 255)) & 255];
  const n = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v; };
  return (x, z) => n(x, z) * 0.55 + n(x * 2.1 + 7, z * 2.1 + 3) * 0.3 + n(x * 4.3 + 1, z * 4.3 + 9) * 0.15;
}
// distance to the packed-earth trails: the main street, the pad road, the plots track, the commons lane
function pathD(x, z) {
  const seg = (ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))); return Math.hypot(x - ax - vx * t, z - az - vz * t); };
  return Math.min(seg(0, 78, 0, -70) - 3, seg(0, 40, 34, 40) - 2.4, seg(18, -8, 18, -60) - 2, seg(0, 2, -30, 2) - 2.2, Math.hypot(x, z - 30) - 9);
}
const MOSS_A = new THREE.Color(0.17, 0.4, 0.33), MOSS_B = new THREE.Color(0.24, 0.5, 0.36), LICHEN = new THREE.Color(0.5, 0.52, 0.22), BLUE = new THREE.Color(0.2, 0.38, 0.46);
const EARTH = new THREE.Color(0.6, 0.47, 0.32), GRAVEL = new THREE.Color(0.46, 0.44, 0.4), FAR = new THREE.Color(0.34, 0.5, 0.52);
function groundColor(c, x, z, noise, L) {
  const k = noise(x * 0.06, z * 0.06), k2 = noise(x * 0.25 + 40, z * 0.25);
  c.copy(MOSS_A).lerp(MOSS_B, k2);
  if (k > 0.62) c.lerp(LICHEN, Math.min(1, (k - 0.62) * 4) * 0.8);
  if (k < 0.34) c.lerp(BLUE, Math.min(1, (0.34 - k) * 4) * 0.7);
  // trodden ground around the domes and along the trails, then the trails themselves
  for (const [dx, dz, r] of L.domes) { const d = Math.hypot(x - dx, z - dz) - r; if (d < 3) c.lerp(GRAVEL, (1 - Math.max(0, d) / 3) * 0.7); }
  const pd = pathD(x, z);
  if (pd < 1.5) c.lerp(GRAVEL, (1.5 - Math.max(0, pd)) / 1.5 * 0.6);
  if (pd < 0) c.copy(EARTH).lerp(GRAVEL, k2 * 0.4);
  return c;
}
function terrain(ctx, L) {
  const B = L.bounds, S = 900, N = 150, noise = vnoise(3), c = new THREE.Color();
  const tex = ctx.cache.moss = mossTexture();
  const mat = (rep) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rep, rep); ctx.cache['moss' + rep] = t;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 0.94, metalness: 0, envMapIntensity: 0.5 }); m.name = 'landfallTerrain'; return m; };
  // outer: hills to the horizon (6 m grid), sunk under the inner patch
  const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = hillAt(x, z, B), inside = x > B.x0 - 2 && x < B.x1 + 2 && z > B.z0 - 2 && z < B.z1 + 2;
    pos.setY(i, inside ? -0.4 : h - 0.02);
    groundColor(c, x, z, noise, L).lerp(FAR, Math.min(1, h / 40) * 0.7);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const outer = new THREE.Mesh(g, mat(S / 4)); outer.receiveShadow = true; outer.name = 'terrainFar';
  // inner: the walkable clearing at 1 m, flat, where the trails and gravel read
  const w = B.x1 - B.x0 + 16, d = B.z1 - B.z0 + 16;
  const gi = new THREE.PlaneGeometry(w, d, w, d); gi.rotateX(-Math.PI / 2); gi.translate((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2);
  const pi = gi.attributes.position, ci = new Float32Array(pi.count * 3);
  for (let i = 0; i < pi.count; i++) {
    const x = pi.getX(i), z = pi.getZ(i);
    pi.setY(i, hillAt(x, z, B) * 0.5);
    groundColor(c, x, z, noise, L);
    ci[i * 3] = c.r; ci[i * 3 + 1] = c.g; ci[i * 3 + 2] = c.b;
  }
  gi.setAttribute('color', new THREE.BufferAttribute(ci, 3));
  gi.computeVertexNormals();
  const inner = new THREE.Mesh(gi, mat(w / 4)); inner.receiveShadow = true; inner.name = 'terrain';
  ctx.scene.add(outer, inner);
}

// ---- alien flora (batched; uber material → a few draws per cell) -----------------------------------------------------
const TEAL = new THREE.Color(0.2, 0.62, 0.58), STALK = new THREE.Color(0.32, 0.38, 0.26), MAG = new THREE.Color(1.5, 0.35, 1.1), CYAN = new THREE.Color(0.35, 1.5, 1.4);
function bulbStalk(ctx, x, z, s, R, far) {
  const { batch, M } = ctx, y = hillAt(x, z, LF_LAYOUT.bounds), h = (3 + R() * 4) * s, key = far ? 'fl' + Math.floor(x / 150) + ',' + Math.floor(z / 150) : null;
  const lean = (R() - 0.5) * 0.3;
  batch.put(cyl(0.08 * s, 0.22 * s, h, 0, h / 2, 0, 7), M.stoneUpper, V(x, y, z), lean, null, { color: STALK, cast: !far, cellKey: key });
  const glow = R() < 0.5 ? MAG : CYAN;
  const cap = new THREE.SphereGeometry(0.9 * s, 10, 6); cap.scale(1, 0.55, 1);
  batch.put(cap, M.stoneUpper, V(x, y + h, z), 0, null, { color: TEAL, cast: !far, cellKey: key });
  batch.put(new THREE.SphereGeometry(0.42 * s, 8, 5), M.warmGlow, V(x, y + h - 0.35 * s, z), 0, null, { color: glow, cast: false, cellKey: key });
}
function frond(ctx, x, z, s, R, far) {
  const { batch, M } = ctx, y = hillAt(x, z, LF_LAYOUT.bounds), key = far ? 'fl' + Math.floor(x / 150) + ',' + Math.floor(z / 150) : null;
  const n = 5 + (R() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + R(), g = new THREE.ConeGeometry(0.28 * s, 2.6 * s, 4); g.translate(0, 1.3 * s, 0); g.rotateZ(0.55 + R() * 0.3);
    batch.put(g, M.stoneUpper, V(x, y, z), a, null, { color: new THREE.Color(0.16 + R() * 0.1, 0.5 + R() * 0.15, 0.36), cast: false, cellKey: key });
  }
}
function crystal(ctx, x, z, s, R, far) {
  const { batch, M } = ctx, y = hillAt(x, z, LF_LAYOUT.bounds), key = far ? 'fl' + Math.floor(x / 150) + ',' + Math.floor(z / 150) : null;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.OctahedronGeometry(0.6 * s, 0); g.scale(0.6, 2.6 + R() * 2, 0.6); g.rotateZ((R() - 0.5) * 0.6); g.rotateX((R() - 0.5) * 0.5);
    batch.put(g, i ? M.stoneUpper : M.blueGlow, V(x + (R() - 0.5) * 1.4 * s, y + 1.1 * s, z + (R() - 0.5) * 1.4 * s), R() * 3, null, { color: i ? new THREE.Color(0.55, 0.78, 0.86) : new THREE.Color(0.4, 1.1, 1.3), cast: !far, cellKey: key });
  }
}
function flora(ctx, L) {
  const B = L.bounds, R = rng(71);
  const colony = (x, z) => x > -48 && x < 52 && z > -62 && z < 74;
  const kinds = [bulbStalk, frond, crystal];
  // inside the fence: meadow edges only (west and north), clear of the paths
  for (let i = 0; i < 70; i++) {
    const x = B.x0 + 2 + R() * (B.x1 - B.x0 - 4), z = B.z0 + 2 + R() * (B.z1 - B.z0 - 4);
    if (colony(x, z) && !(x < -40 || z < -60)) continue;
    const k = kinds[i % 3];
    k(ctx, x, z, 0.8 + R() * 0.6, R, false);
    if (k === bulbStalk) ctx.col.circle(x, z, 0.35, 'stalk');
    if (k === crystal) ctx.col.circle(x, z, 0.9, 'crystal');
  }
  // moss tufts and pebbles on the open ground (one small cone fan each, no shadows)
  const colonyStreet = (x, z) => Math.abs(x) < 4 || (Math.abs(z - 40) < 3 && x > 0 && x < 34) || (Math.abs(z - 2) < 3 && x > -30 && x < 0);
  for (let i = 0; i < 520; i++) {
    const x = B.x0 + R() * (B.x1 - B.x0), z = B.z0 + R() * (B.z1 - B.z0);
    if (colonyStreet(x, z)) continue;
    if (R() < 0.8) {
      const g = new THREE.ConeGeometry(0.18, 0.5 + R() * 0.5, 3); g.translate(0, 0.3, 0);
      for (let k = 0; k < 3; k++) ctx.batch.put(g, ctx.M.stoneUpper, V(x + (R() - 0.5) * 0.5, 0, z + (R() - 0.5) * 0.5), R() * 3, null, { color: new THREE.Color(0.2 + R() * 0.15, 0.48 + R() * 0.2, 0.34 + R() * 0.12), cast: false });
    } else ctx.batch.put(new THREE.DodecahedronGeometry(0.2 + R() * 0.3, 0), ctx.M.stoneUpper, V(x, 0.05, z), R() * 3, null, { color: new THREE.Color(0.5, 0.48, 0.42), cast: false });
  }
  // the wild beyond the fence, out to the hills
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2, r = 80 + Math.pow(R(), 0.7) * 300, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (x > B.x0 - 4 && x < B.x1 + 4 && z > B.z0 - 4 && z < B.z1 + 4) continue;
    kinds[(R() * 3.3 | 0) % 3](ctx, x, z, 1 + R() * 1.8, R, true);
  }
}

// ---- the colony ---------------------------------------------------------------------------------------------------------
const WHITE = new THREE.Color(0.9, 0.92, 0.94), PANEL = new THREE.Color(0.2, 0.3, 0.46);
function dome(ctx, x, z, r, seed) {
  const { batch, M, col } = ctx;
  const g = new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  batch.put(g, M.stoneUpper, V(x, 0, z), 0, null, { color: WHITE });
  batch.put(new THREE.TorusGeometry(r * 0.98, 0.12, 6, 40).rotateX(Math.PI / 2), M.blueGlow, V(x, r * 0.35, z), 0, null, { cast: false, color: new THREE.Color(0.4, 1.0, 1.3) });
  batch.put(new THREE.CylinderGeometry(r * 1.02, r * 1.05, 0.5, 28), M.stoneUpper, V(x, 0.25, z), 0, null, { color: GRAPHITE });
  // entrance tunnel facing the main street (+x or −x toward x=0), a lit door
  const sd = x < 0 ? 1 : -1, ex = x + sd * r;
  batch.put(box(2.4, 2.6, 3), M.stoneUpper, V(ex, 1.3, z), Math.PI / 2, null, { color: WHITE });
  batch.put(box(1.4, 2, 0.08), M.warmGlow, V(ex + sd * 1.55, 1.1, z), Math.PI / 2, null, { cast: false, color: new THREE.Color(1.3, 0.95, 0.6) });
  batch.put(cyl(0.12, 0.12, 1.2, x + (seed % 2 ? 1 : -1) * r * 0.4, r * 0.95, z, 6), M.darkMetal, V(0, 0, 0));
  col.circle(x, z, r + 0.2, 'dome');
  col.box(ex, z, 1.5, 1.3, 0, 'domeDoor');
  return { door: [ex + sd * 2.6, z] };
}
function market(ctx, L) {
  const { batch, M, col } = ctx, P = L.market;
  const awn = [new THREE.Color(0.85, 0.35, 0.2), new THREE.Color(0.22, 0.5, 0.7), new THREE.Color(0.9, 0.7, 0.2), new THREE.Color(0.3, 0.6, 0.35)];
  for (let i = 0; i < 4; i++) {
    const x = P.x + (i % 2 ? 7 : -7), z = P.z + (i < 2 ? -4 : 4), rot = i % 2 ? -Math.PI / 2 : Math.PI / 2;
    batch.put(box(3, 1, 1.4), M.stoneUpper, V(x, 0.5, z), rot, null, { color: new THREE.Color(0.55, 0.42, 0.3) });
    for (const [dx, dz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) batch.put(box(0.08, 2.5, 0.08), M.darkMetal, V(x + (i % 2 ? dz : -dz), 1.25, z + dx), 0, null, { cast: false });
    const a = box(3.4, 0.08, 2.2); a.rotateX(0.18);
    batch.put(a, M.stoneUpper, V(x, 2.55, z), rot, null, { color: awn[i] });
    for (let k = 0; k < 3; k++) batch.put(new THREE.SphereGeometry(0.2, 8, 6), M.stoneUpper, V(x + (k - 1) * 0.1, 1.15, z + (k - 1) * 0.7), 0, null, { cast: false, color: [new THREE.Color(0.9, 0.3, 0.2), new THREE.Color(0.95, 0.8, 0.2), new THREE.Color(0.4, 0.8, 0.3)][k] });
    col.box(x, z, 0.8, 1.6, 0, 'stall');
  }
}
function lockers(ctx, L) {
  const { batch, M, col } = ctx, P = L.lockers;
  for (let i = 0; i < 6; i++) {
    const z = P.z - 6 + i * 2.4;
    batch.put(box(1.2, 2.4, 2.2), M.stoneUpper, V(P.x, 1.2, z), 0, null, { color: i % 2 ? STEEL : new THREE.Color(0.3, 0.44, 0.6) });
    batch.put(box(0.05, 0.2, 1.4), M.blueGlow, V(P.x - 0.63, 1.9, z), 0, null, { cast: false });
  }
  col.box(P.x, P.z, 0.7, 7.4, 0, 'lockers');
}
function surveyTower(ctx, L) {
  const { batch, M, col } = ctx, T = L.tower, h = 14;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) batch.put(box(0.3, h, 0.3), M.stoneUpper, V(T.x + dx * 1.4, h / 2, T.z + dz * 1.4), 0, null, { color: STEEL });
  for (let y = 3; y < h; y += 3.5) for (const r of [0, Math.PI / 2]) batch.put(box(3, 0.12, 0.12), M.stoneUpper, V(T.x, y, T.z), r, null, { color: STEEL, cast: false });
  batch.put(box(4.4, 0.4, 4.4), M.stoneUpper, V(T.x, h, T.z), 0, null, { color: GRAPHITE });
  rail(ctx, [[T.x - 2.2, T.z - 2.2], [T.x + 2.2, T.z - 2.2], [T.x + 2.2, T.z + 2.2], [T.x - 2.2, T.z + 2.2], [T.x - 2.2, T.z - 2.2]], h + 0.2, { posts: 2.2 });
  batch.put(new THREE.SphereGeometry(0.4, 8, 6), M.warmGlow, V(T.x, h + 2.4, T.z), 0, null, { cast: false, color: new THREE.Color(2, 0.25, 0.1) });
  batch.put(box(0.12, 2.2, 0.12), M.darkMetal, V(T.x, h + 1.2, T.z), 0, null, { cast: false });
  col.box(T.x, T.z, 1.7, 1.7, 0, 'tower');
}
function plots(ctx, L) {
  const { batch, M, col } = ctx, P = L.plots;
  // Earth crops in raised beds: the first things planted outside the ark
  for (let r = 0; r < 5; r++) {
    const z = P.z - 8 + r * 4;
    batch.put(box(14, 0.4, 1.8), M.stoneUpper, V(P.x + 8, 0.2, z), 0, null, { color: new THREE.Color(0.32, 0.22, 0.14) });
    for (let k = 0; k < 12; k++) batch.put(new THREE.SphereGeometry(0.34, 7, 5), M.stoneUpper, V(P.x + 2.2 + k * 1.15, 0.62, z), 0, null, { cast: false, color: new THREE.Color(0.22 + (k % 3) * 0.05, 0.55, 0.16) });
    col.box(P.x + 8, z, 7, 0.9, 0, 'bed');
  }
  rail(ctx, [[P.x, P.z - 10.5], [P.x + 16.5, P.z - 10.5], [P.x + 16.5, P.z + 10.5], [P.x + 4, P.z + 10.5]], 0, { color: new THREE.Color(0.6, 0.55, 0.45), h: 0.9, posts: 3 });
  for (const [x, z, s] of [[P.x - 6, P.z - 4, 5], [P.x - 8, P.z + 8, 9], [P.x + 22, P.z + 2, 11]]) addTree(ctx.batch, M, x, 0, z, s, 0.9);
}
function solar(ctx, L) {
  const { batch, M, col } = ctx, P = L.solar;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const x = P.x + j * 6 - 3, z = P.z - 9 + i * 6;
    const p = box(4.6, 0.1, 2.8); p.rotateX(-0.5);
    batch.put(p, M.stoneUpper, V(x, 1.4, z), 0, null, { color: PANEL });
    batch.put(box(0.12, 1.3, 0.12), M.darkMetal, V(x, 0.65, z), 0, null, { cast: false });
  }
  col.box(P.x, P.z, 5.5, 12, 0, 'solar');
}
function fence(ctx, L) {
  const { batch, M } = ctx, B = L.bounds;
  // survey beacons on the fence line: a post with a glowing cap every 10 m
  const edge = [];
  for (let x = B.x0; x <= B.x1; x += 10) edge.push([x, B.z0], [x, B.z1]);
  for (let z = B.z0 + 10; z < B.z1; z += 10) edge.push([B.x0, z], [B.x1, z]);
  for (const [x, z] of edge) {
    batch.put(box(0.16, 1.6, 0.16), M.darkMetal, V(x, 0.8, z), 0, null, { cast: false });
    batch.put(box(0.3, 0.14, 0.3), M.warmGlow, V(x, 1.66, z), 0, null, { cast: false, color: new THREE.Color(1.6, 0.9, 0.3) });
  }
}
function ark(ctx) {
  // the ark from outside: a 40 km plated cylinder with lit bands and lattice rings, far up in the northern sky. Unfogged,
  // so the haze is painted in (pale blue-grey body + an emissive lift) to keep it reading as very far and very big.
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xaab6c0, emissive: 0x4a6470, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.6, fog: false });
  mat.name = 'arkHull';
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.2, 0.9), fog: false });
  const R = 105, LEN = 3000;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, LEN, 48, 1, false), mat); body.rotation.z = Math.PI / 2; g.add(body);
  for (let i = -8; i <= 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(R + 4, 6, 6, 48), mat); r.rotation.y = Math.PI / 2; r.position.x = i * 180; g.add(r);
    if (i % 2 === 0 && i < 8) { const b = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, 18, 48, 1, true, -0.5, 1.0), lit); b.rotation.z = Math.PI / 2; b.position.x = i * 180 + 90; g.add(b); }
  }
  for (const sd of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R, 140, 48), mat); cap.rotation.z = -sd * Math.PI / 2; cap.position.x = sd * (LEN / 2 + 70); g.add(cap); }
  g.position.copy(ARK).multiplyScalar(2350); g.rotation.set(0.1, 0.62, 0.2);
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; ctx.farSky.push(o); } });
  ctx.scene.add(g);
}

function buildLandfall(ctx, onProgress = () => {}) {
  const L = LF_LAYOUT, { batch, M, col, scene } = ctx;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 20), skyMaterial(ctx.time));
  sky.frustumCulled = false; sky.renderOrder = -100; sky.name = 'landfallSky';
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);
  terrain(ctx, L);
  ark(ctx);
  onProgress(0.45, 'Breathing real air…');
  const doors = L.domes.map(([x, z, r], i) => dome(ctx, x, z, r, i));
  market(ctx, L); lockers(ctx, L); surveyTower(ctx, L); plots(ctx, L); solar(ctx, L); fence(ctx, L);
  flora(ctx, L);
  // the landing pad and the shuttle that brought the first settlers down
  const P = L.landing;
  batch.put(lathe([[0, 0], [P.r + 0.5, 0], [P.r + 0.5, 0.15], [P.r, 0.25], [0, 0.25]], 40), M.stoneUpper, V(P.x, 0, P.z), 0, null, { color: new THREE.Color(0.36, 0.37, 0.4) });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; batch.put(box(0.4, 0.1, 0.4), M.blueGlow, V(P.x + Math.sin(a) * (P.r - 0.5), 0.3, P.z + Math.cos(a) * (P.r - 0.5)), a, null, { cast: false }); }
  const sh = shuttle(0.8); sh.position.set(P.x + 1, 1.8, P.z - 1); sh.rotation.y = 2.6; scene.add(sh);
  col.box(P.x + 1, P.z - 1, 3.3, 7.5, 2.6, 'shuttle');
  floodMast(ctx, P.x - 12, P.z + 9, 10, 0.6); floodMast(ctx, -44, 20, 10, -0.4);
  const cont = [];
  containerBlock(ctx, cont, 44, 58, 0.2, 2, 1, (i, j, R) => 1 + (R() < 0.4 ? 1 : 0), 5);
  containerBlock(ctx, cont, -48, -60, -0.3, 1, 2, () => 1, 6);
  addContainers(ctx, cont);
  for (const [x, z, n] of [[-16, 40, 2], [26, 24, 1], [-40, 30, 2], [30, -40, 1], [8, -30, 2]]) crateStack(ctx, x, z, x * 0.05, n);
  // the colony sign over the main street
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), createHoloMaterial(HOLO_ART.sign('VERDANCE LANDFALL  •  YEAR ONE'), { bright: 2.4, alpha: 0.9, tint: [0.9, 1.1, 0.85], time: ctx.time }));
  sign.position.set(0, 6.2, 44); sign.layers.enable(REFLECT_LAYER); scene.add(sign); twoSided(sign);
  for (const sd of [-1, 1]) batch.put(box(0.3, 6.4, 0.3), M.stoneUpper, V(sd * 4.8, 3.2, 44), 0, null, { color: STEEL, cast: true });
  holoLabel(ctx, 'SEED VAULT', L.domes[4][0] + 7, 4.4, L.domes[4][1], 2.6, [0.9, 1.1, 0.8]);
  // street lamps down the main street and two planters of Earth trees by the arrival relay
  for (let z = 70; z > -60; z -= 12) for (const sd of [-1, 1]) {
    batch.put(cyl(0.07, 0.1, 3.6, 0, 1.8, 0, 8), M.stoneUpper, V(sd * 4.2, 0, z), 0, null, { color: STEEL, cast: false });
    batch.put(new THREE.SphereGeometry(0.22, 10, 6), M.warmGlow, V(sd * 4.2, 3.7, z), 0, null, { cast: false, color: new THREE.Color(1.8, 1.3, 0.8) });
    col.circle(sd * 4.2, z, 0.15, 'lamp');
  }
  for (const [x, z, sd] of [[-8, 44, 2], [8, 46, 5], [-7, 20, 8]]) {
    batch.put(cyl(1.7, 1.8, 0.5, 0, 0.25, 0, 16), M.stoneUpper, V(x, 0, z), 0, null, { color: new THREE.Color(0.7, 0.68, 0.62) });
    addTree(batch, M, x, 0.5, z, sd, 0.8);
    col.circle(x, z, 1.8, 'planter');
  }
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  lightPools(ctx, [[P.x, P.z, 11, [1.0, 0.95, 0.85]], [L.market.x, L.market.z, 10, [1.2, 0.9, 0.6]]]);
  ctx.gather.push({ x: L.market.x - 3, z: L.market.z, kind: 'talk' }, { x: 6, z: 56, kind: 'talk' }, { x: -14, z: 0, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: -18, z: 44, rot: 0.3 }, { kind: 'crate', x: 28, z: 26 }, { kind: 'crate', x: 10, z: -28, stack: 1 },
    { kind: 'crate', x: -44, z: -30 }, { kind: 'vending', x: 8, z: 22, rot: Math.PI }, { kind: 'holo', x: -4, z: 20, rot: 0.2 },
  ]);
  const D = L.domes;
  const S = [
    ['lf_meadow_west', 'park', -52, 30, 8], ['lf_meadow_north', 'park', -10, -72, 8], ['lf_crystal_field', 'park', 50, -64, 6],
    ['lf_main_street', 'plaza', 0, 10, 6], ['lf_market', 'market', L.market.x, L.market.z, 6], ['lf_commons', 'plaza', -14, 0, 5],
    ['lf_landing_pad', 'pad', P.x - 8, P.z, 5], ['lf_solar', 'warehouse', L.solar.x - 8, L.solar.z, 4], ['lf_depot', 'warehouse', 44, 50, 4],
    ['lf_plots', 'garden', L.plots.x + 8, L.plots.z + 12, 4], ['lf_orchard', 'garden', L.plots.x - 6, L.plots.z, 4],
    ['lf_lockers', 'locker', L.lockers.x - 2.5, L.lockers.z, 2.5], ['lf_lockers_pad', 'locker', 30, 32, 2.5],
    ['lf_dome_hall', 'interior', doors[0].door[0], doors[0].door[1], 2.5], ['lf_dome_clinic', 'interior', doors[1].door[0], doors[1].door[1], 2.5],
    ['lf_seed_vault', 'vault', doors[4].door[0], doors[4].door[1], 2.5], ['lf_dome_lab', 'lobby', doors[2].door[0], doors[2].door[1], 2.5],
    ['lf_survey_tower', 'rooftop', L.tower.x - 3, L.tower.z, 3], ['lf_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['lf_spawn_sw', 'spawn_edge', -58, 70, 3], ['lf_spawn_se', 'spawn_edge', 58, 72, 3], ['lf_spawn_nw', 'spawn_edge', -58, -76, 3], ['lf_spawn_ne', 'spawn_edge', 58, -76, 3],
    ['lf_vantage_tower', 'vantage', L.tower.x - 4, L.tower.z + 4, 2.5], ['lf_vantage_pad', 'vantage', P.x - 12, P.z - 10, 2.5],
    ['lf_hide_containers', 'hide', 40, 54, 1.5], ['lf_hide_dome', 'hide', D[0][0] - D[0][2] - 1.5, D[0][1] - 4, 1.5], ['lf_hide_stalls', 'hide', L.market.x + 10, L.market.z + 7, 1.5], ['lf_hide_crystals', 'hide', -54, -40, 1.5],
    ['lf_npc_surveyor', 'npc', 30, -30, 1.5], ['lf_npc_settler', 'npc', -4, 26, 1.5], ['lf_npc_pilot', 'npc', P.x - 6, P.z + 6, 1.5],
    ['lf_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['lf_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: 0, district: 'landfall', indoor: false }));
}

const CROWD = {
  loops: [
    [[0, 60], [0, 30], [0, 0], [0, -40], [4, -40], [4, 0], [4, 30]],
    [[-14, 2], [-20, 2], [-14, 20], [0, 20]],
    [[2, 24], [10, 30], [2, 36], [-6, 30]],
    [[12, 40], [26, 40], [26, 30], [12, 30]],
    [[18, -20], [18, -44], [10, -44], [10, -20]],
  ],
  talk: [[-3, 30], [8, 28], [-14, -2], [6, 58], [22, 38], [16, -40]],
  count: 12,
};

export const LANDFALL = {
  id: 'landfall', name: 'Verdance Landfall', layout: LF_LAYOUT, bounds: LF_LAYOUT.bounds, build: buildLandfall, crowd: CROWD, batchCell: 64,
  farCrowd: 0, adCount: 0, adOrigins: [], mirror: false,
  env: (r, tier) => landfallEnv(r, tier),
  ambience: {
    interior: true, background: 0x9fc4b0, sunDir: SUN.toArray(),
    sun: [1.0, 0.9, 0.72], sunI: 3.2, hemiSky: 0xa8dcc8, hemiGround: 0x4a5a2a, hemiI: 0.42,
    fog: [0.66, 0.8, 0.72], fogDensity: 0.0006, env: 0.8,
    gain: [0.99, 1.03, 0.96], lift: [0.004, 0.008, 0.004], sat: 1.12, contrast: 1.1,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], landing: [L.landing.x - 8, L.landing.z] }),
};

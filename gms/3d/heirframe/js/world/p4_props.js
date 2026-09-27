import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, lathe } from './geo.js';
import { makeCanvas, canvasTexture, rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Shared dressing for the P4 districts (Portside, the Stacks, Home): instanced shipping containers, dock cranes,
// shuttles, flood-light masts, additive light pools, sagging cables, leak streaks, steam vents.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CW = 2.44, CH = 2.6, CL = 6.1;

function containerTexture() {
  const c = makeCanvas(512, 256), g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 12) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, 0, 3, 256); g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 7, 0, 4, 256); }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 244, 512, 12); g.fillRect(0, 0, 10, 256); g.fillRect(502, 0, 10, 256);
  for (let i = 0; i < 26; i++) { const x = R() * 512, y = R() * 60, h = 40 + R() * 160; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(90,40,15,0.55)'); gr.addColorStop(1, 'rgba(90,40,15,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + R() * 6, h); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.1})`; g.beginPath(); g.arc(R() * 512, R() * 256, 4 + R() * 26, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 22px monospace'; g.fillText('FHLU 204417 3', 30, 50); g.fillText('45G1', 30, 78);
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const CONTAINER_COLORS = [0x8e2f1f, 0x1f3b63, 0xd8d6cf, 0xc49a3a, 0x2c6b6a, 0x5b6068, 0xa84a1c, 0x2f4a33, 0xe0b24a, 0x3a2f5c];

// list: [x, y, z, rot, colorIndex] — each one container (6.1 x 2.6 x 2.44). One instanced draw.
export function addContainers(ctx, list, { name = 'containers' } = {}) {
  if (!list.length) return null;
  const tex = ctx.cache.containerTex ||= containerTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.9 });
  mat.name = 'container';
  const g = new THREE.BoxGeometry(CL, CH, CW).translate(0, CH / 2, 0);
  const im = new THREE.InstancedMesh(g, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), one = V(1, 1, 1), c = new THREE.Color();
  list.forEach(([x, y, z, rot, ci], i) => {
    im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromAxisAngle(up, rot), one));
    im.setColorAt(i, c.set(CONTAINER_COLORS[ci % CONTAINER_COLORS.length]).multiplyScalar(0.85 + ((i * 37) % 10) * 0.03));
  });
  im.castShadow = true; im.receiveShadow = true; im.name = name;
  im.layers.enable(REFLECT_LAYER);
  im.computeBoundingSphere();
  ctx.scene.add(im);
  return im;
}

// A block of containers cols x rows, stacked to heights from hFn(i, j); returns the container list and adds a collision box.
export function containerBlock(ctx, list, x, z, rot, cols, rows, hFn, seed = 1) {
  const R = rng(seed), c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lx = (i - (cols - 1) / 2) * (CL + 0.3), lz = (j - (rows - 1) / 2) * (CW + 0.15);
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    const h = hFn(i, j, R);
    for (let k = 0; k < h; k++) list.push([wx, k * CH, wz, rot + (R() - 0.5) * 0.02, (R() * 10) | 0]);
  }
  ctx.col.box(x, z, cols * (CL + 0.3) / 2, rows * (CW + 0.15) / 2, rot, 'containers');
}

// Ship-to-shore gantry crane: legs on the quay (landside z0, waterside z1 = z0 - 14), girder at height h running from
// z0 + back to z1 - boom (over the water). An animated trolley + spreader lifts a container between the ship and the apron.
export function dockCrane(ctx, x, z0, { h = 30, boom = 42, back = 14, gauge = 16, paint = new THREE.Color(0.95, 0.93, 0.9), seed = 1 } = {}) {
  const { batch, M, col, scene, updaters } = ctx;
  const z1 = z0 - 14, top = h;
  for (const lx of [-gauge / 2, gauge / 2]) for (const lz of [z0, z1]) {
    batch.put(box(1.3, top, 1.3), M.stoneUpper, V(x + lx, top / 2, lz), 0, null, { color: paint });
    batch.put(box(2.2, 0.8, 3.2), M.darkMetal, V(x + lx, 0.4, lz));
    col.box(x + lx, lz, 1.2, 1.7, 0, 'crane');
  }
  for (const lx of [-gauge / 2, gauge / 2]) {
    batch.put(box(1.0, 1.4, 14), M.stoneUpper, V(x + lx, top * 0.42, (z0 + z1) / 2), 0, null, { color: paint });
    batch.put(box(1.2, 1.4, 1.2), M.gold, V(x + lx, top - 0.5, z0), 0, null, { cast: false });
  }
  batch.put(box(gauge + 1.3, 1.6, 1.2), M.stoneUpper, V(x, top * 0.42, z0), 0, null, { color: paint });
  batch.put(box(gauge + 1.3, 1.6, 1.2), M.stoneUpper, V(x, top * 0.42, z1), 0, null, { color: paint });
  // girder + boom, machinery house, cab, A-frame stays
  const zb0 = z0 + back, zb1 = z1 - boom, L = zb0 - zb1;
  for (const lx of [-gauge / 2 + 1, gauge / 2 - 1]) batch.put(box(1.6, 2.6, L), M.stoneUpper, V(x + lx, top + 1.3, (zb0 + zb1) / 2), 0, null, { color: paint });
  for (let z = zb1 + 2; z < zb0; z += 6) batch.put(box(gauge - 2, 0.5, 0.5), M.stoneUpper, V(x, top + 2.4, z), 0, null, { color: paint, cast: false });
  batch.put(box(gauge - 1, 4.5, 9), M.stoneUpper, V(x, top + 4.8, z0 + back - 5), 0, null, { color: paint.clone().multiplyScalar(0.92) });
  batch.put(box(gauge - 0.8, 0.18, 9.2), M.gold, V(x, top + 7.1, z0 + back - 5), 0, null, { cast: false });
  batch.put(box(gauge - 1.2, 0.4, 0.1), M.warmGlow, V(x, top + 5.5, z0 + back - 0.45), 0, null, { cast: false });
  for (const lx of [-gauge / 2 + 1, gauge / 2 - 1]) {
    batch.put(box(1.0, 14, 1.0), M.stoneUpper, V(x + lx, top + 9, z1 + 2), 0, null, { color: paint });
    const stay = (za, ya) => { const dz = za - (z1 + 2), dy = ya - (top + 16), l = Math.hypot(dz, dy); const g = box(0.25, l, 0.25); g.rotateX(Math.atan2(dz, dy)); batch.put(g, M.chrome, V(x + lx, (top + 16 + ya) / 2, (z1 + 2 + za) / 2), 0, null, { cast: false }); };
    stay(zb1 + 1, top + 2.6); stay(zb0 - 2, top + 2.6);
  }
  batch.put(box(3, 2.4, 3), M.glassDark, V(x, top - 1.4, z1 - 4), 0, null, { cast: false });
  batch.put(box(3.1, 0.2, 3.1), M.gold, V(x, top - 0.1, z1 - 4), 0, null, { cast: false });
  // red aviation beacons
  batch.put(new THREE.SphereGeometry(0.35, 8, 6), M.warmGlow, V(x, top + 16.4, z1 + 2), 0, null, { cast: false, color: new THREE.Color(1.6, 0.15, 0.05) });

  // animated trolley, hoist ropes, spreader and a container
  const g = new THREE.Group();
  const trolleyM = new THREE.MeshStandardMaterial({ color: paint.clone().multiplyScalar(0.85), roughness: 0.4, metalness: 0.3 });
  const trolley = new THREE.Mesh(box(gauge - 2.5, 1.4, 4), trolleyM); trolley.position.y = top + 3.2;
  const rope = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08).translate(0, -0.5, 0), M.darkMetal);
  const spread = new THREE.Group();
  const spMesh = new THREE.Mesh(mergeGeometries([box(CL + 0.3, 0.4, CW + 0.2), box(0.5, 0.8, 0.5, 0, 0.5, 0)]), trolleyM);
  const cont = new THREE.Mesh(new THREE.BoxGeometry(CL, CH, CW).translate(0, -CH / 2 - 0.2, 0), new THREE.MeshStandardMaterial({ map: ctx.cache.containerTex ||= containerTexture(), color: new THREE.Color(0x1f3b63), roughness: 0.55, metalness: 0.45 }));
  cont.rotation.y = Math.PI / 2; spMesh.rotation.y = Math.PI / 2;
  spread.add(spMesh, cont);
  g.add(trolley, rope, spread);
  for (const o of [trolley, spMesh, cont]) { o.castShadow = true; o.layers.enable(REFLECT_LAYER); }
  g.position.x = x;
  scene.add(g);
  const zShip = z1 - boom * 0.55, zApron = z0 - 7, R = rng(seed);
  let t = R() * 30;
  // cycle (38 s): lower on the ship, lift, run landward, lower to the apron, release, lift empty, run back
  const K = [[0, zShip, 6, 1], [6, zShip, top - 6, 1], [13, zApron, top - 6, 1], [19, zApron, 2.8, 1], [23, zApron, 2.8, 0], [27, zApron, top - 6, 0], [34, zShip, top - 6, 0], [38, zShip, 6, 1]];
  const sm = (a) => a * a * (3 - 2 * a);
  updaters.push((dt) => {
    t = (t + dt) % 38;
    let i = 0; while (i < K.length - 2 && t >= K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], u = sm((t - a[0]) / (b[0] - a[0]));
    const z = a[1] + (b[1] - a[1]) * u, y = a[2] + (b[2] - a[2]) * u;
    trolley.position.z = z; spread.position.set(0, y, z + Math.sin(t * 1.3) * 0.08);
    rope.position.set(0, top + 2.5, z); rope.scale.y = top + 2.5 - y;
    cont.visible = a[3] > 0 || t < 23;
  });
  return g;
}

// Shuttle geometry (nose +z), split by material: { hull, glass, glow, dark }.
export function shuttleGeometry(scale = 1) {
  const s = scale;
  const hull = [], glass = [], glow = [], dark = [];
  const body = lathe([[0, -9], [1.4, -8.6], [2.1, -6], [2.3, -1], [2.1, 3.5], [1.5, 6.5], [0.6, 8.6], [0, 9.1]].map(([r, y]) => [r * s, y * s]), 24);
  body.rotateX(Math.PI / 2); body.scale(1, 0.72, 1); hull.push(body);
  const wing = new THREE.Shape(); wing.moveTo(0, 3); wing.lineTo(8.5, -3.5); wing.lineTo(8.8, -6.5); wing.lineTo(0, -6); wing.lineTo(0, 3);
  for (const sd of [1, -1]) {
    const w = new THREE.ExtrudeGeometry(wing, { depth: 0.35, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 1 });
    w.rotateX(Math.PI / 2); w.scale(sd * s, s, s); w.translate(0, -0.3 * s, 0); hull.push(w);
    const pod = new THREE.CylinderGeometry(0.75 * s, 0.9 * s, 5 * s, 14); pod.rotateX(Math.PI / 2); pod.translate(sd * 5.2 * s, -0.4 * s, -4.4 * s); hull.push(pod);
    const noz = new THREE.CylinderGeometry(0.62 * s, 0.62 * s, 0.2 * s, 14); noz.rotateX(Math.PI / 2); noz.translate(sd * 5.2 * s, -0.4 * s, -7 * s); glow.push(noz);
    const tip = new THREE.BoxGeometry(0.4 * s, 0.1 * s, 2.4 * s); tip.translate(sd * 8.7 * s, -0.3 * s, -5 * s); glow.push(tip);
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-4.5, 0); fin.lineTo(-6.5, 3.8); fin.lineTo(-5, 3.8); fin.lineTo(0, 0);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.25, bevelEnabled: false }); fg.rotateY(Math.PI / 2); fg.scale(s, s, s); fg.translate(-0.12 * s, 1.2 * s, -1.5 * s); hull.push(fg);
  const cp = new THREE.SphereGeometry(1.15 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); cp.scale(1, 0.55, 2.2); cp.translate(0, 1.0 * s, 4.6 * s); glass.push(cp);
  const eng = new THREE.CylinderGeometry(1.1 * s, 1.1 * s, 0.25 * s, 18); eng.rotateX(Math.PI / 2); eng.translate(0, 0, -9.05 * s); glow.push(eng);
  for (const sd of [1, -1]) { const lg = new THREE.CylinderGeometry(0.18 * s, 0.18 * s, 1.6 * s, 8); lg.translate(sd * 1.8 * s, -1.9 * s, 2 * s); dark.push(lg); const l2 = lg.clone(); l2.translate(0, 0, -6 * s); dark.push(l2); }
  const stripe = new THREE.BoxGeometry(0.1 * s, 0.35 * s, 11 * s); for (const sd of [1, -1]) { const st = stripe.clone(); st.translate(sd * 2.12 * s, 0.1 * s, -1 * s); dark.push(st); }
  const m = (a) => mergeGeometries(a.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  return { hull: m(hull), glass: m(glass), glow: m(glow), dark: m(dark) };
}

export function shuttleMaterials() {
  return {
    hull: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.22, metalness: 0.35, envMapIntensity: 1.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.85, 1.0).multiplyScalar(4) }),
    dark: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.25, metalness: 1.0 }),
  };
}

// A shuttle as a Group (4 meshes); animate its transform yourself.
export function shuttle(scale = 1, mats = shuttleMaterials()) {
  const G = shuttleGeometry(scale), g = new THREE.Group();
  for (const k of ['hull', 'glass', 'glow', 'dark']) { const m = new THREE.Mesh(G[k], mats[k]); m.castShadow = k === 'hull'; m.layers.enable(REFLECT_LAYER); g.add(m); }
  g.userData.mats = mats;
  return g;
}

// Flood-light mast: tall pole, a head of lamps (glow) — pair with lightPool() on the ground.
export function floodMast(ctx, x, z, h = 16, rot = 0, y = 0) {
  const { batch, M, col } = ctx;
  batch.add(cyl(0.22, 0.36, h, x, y, z, 10), M.darkMetal);
  batch.put(box(3.2, 0.3, 0.6), M.darkMetal, V(x, y + h, z), rot);
  for (const o of [-1.1, 0, 1.1]) batch.put(box(0.8, 0.5, 0.25), M.warmGlow, V(x + Math.cos(rot) * o, y + h - 0.35, z - Math.sin(rot) * o), rot, null, { cast: false });
  col.circle(x, z, 0.45, 'mast');
}

// Additive ground light pools: [x, z, r, [r,g,b], y]. One draw for the whole district.
export function lightPools(ctx, list) {
  if (!list.length) return null;
  const pos = [], col = [], uv = [], idx = [];
  list.forEach(([x, z, r, c = [1, 0.7, 0.4], y = 0], i) => {
    const b = i * 4;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(x + u * r, y + 0.03, z + v * r); uv.push(u, v); col.push(...c); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute vec3 color; varying vec2 vUv; varying vec3 vC; varying float vD;
      void main(){ vUv = uv; vC = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vD = -mvPosition.z; gl_Position = projectionMatrix * mvPosition; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vD;
      void main(){ float r = length(vUv); float a = (1.0 - smoothstep(0.0, 1.0, r)); a *= a;
        gl_FragColor = vec4(vC * a * 0.55 * (1.0 - smoothstep(60.0, 160.0, vD)), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'lightPools'; mesh.renderOrder = 1; mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  return mesh;
}

// Sagging cable between two points (catenary-ish), batched.
export function cable(ctx, a, b, sag = 1.5, r = 0.05, mat = null) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 4, false);
  ctx.batch.add(g, mat || ctx.M.darkMetal, { cast: false });
  g.dispose();
}

// Falling water streaks (leaks, drips from pipes): list [x, y, z, width]; one instanced draw, all in the vertex shader.
export function leaks(ctx, list, { per = 18, color = [0.6, 0.75, 0.85] } = {}) {
  if (!list.length) return null;
  const n = list.length * per;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(n * 4), R = rng(91);
  list.forEach(([x, y, z, w], i) => { for (let k = 0; k < per; k++) A.set([x + (R() - 0.5) * w, y, z + (R() - 0.5) * w * 0.4, R()], (i * per + k) * 4); });
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Vector3(...color) } },
    vertexShader: `attribute vec4 iA; uniform float uTime; varying float vA; varying vec2 vUv;
      void main(){
        float t = fract(iA.w * 7.13 + uTime * (0.9 + iA.w * 0.5));
        float y = iA.y * (1.0 - t * t);
        float len = 0.35 + t * 0.9;
        vec3 c = vec3(iA.x, y, iA.z);
        vec3 toCam = cameraPosition - c; vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        vec3 wp = c + right * position.x * 0.03 + vec3(0.0, position.y * len, 0.0);
        vA = smoothstep(0.0, 0.08, t) * step(0.02, y);
        vUv = position.xy + vec2(0.5, 0.0);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        vA *= 1.0 - smoothstep(40.0, 90.0, -mvPosition.z);
      }`,
    fragmentShader: `uniform vec3 uC; varying float vA; varying vec2 vUv;
      void main(){ float a = vA * (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.5, vUv.y) * 0.55;
        gl_FragColor = vec4(uC * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  m.uniforms.uTime = ctx.time;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.name = 'leaks'; mesh.renderOrder = 2;
  ctx.scene.add(mesh);
  return mesh;
}

// Steam vents: soft billows rising from list [x, y, z, strength]. One Points draw.
export function steamVents(ctx, list, { per = 22, color = [0.62, 0.68, 0.74] } = {}) {
  if (!list.length) return null;
  const n = list.length * per, pos = new Float32Array(n * 3), seed = new Float32Array(n), str = new Float32Array(n), R = rng(19);
  list.forEach(([x, y, z, s = 1], i) => { for (let k = 0; k < per; k++) { const j = i * per + k; pos.set([x + (R() - 0.5) * 0.5, y, z + (R() - 0.5) * 0.5], j * 3); seed[j] = R(); str[j] = s; } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('str', new THREE.BufferAttribute(str, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uScale: { value: 1 }, uC: { value: new THREE.Vector3(...color) } }]),
    vertexShader: `attribute float seed, str; uniform float uTime, uScale; varying float vA, vS;
      #include <fog_pars_vertex>
      void main(){
        float t = fract(seed + uTime * 0.16);
        vec3 p = position; p.y += t * 5.5 * str; p.x += sin(seed * 31.0 + uTime * 0.5) * t * 1.4; p.z += cos(seed * 17.0 + uTime * 0.4) * t * 1.0;
        vA = smoothstep(0.0, 0.1, t) * (1.0 - t) * 0.16 * min(str, 1.2); vS = seed;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = min((1.2 + t * 4.0) * str * uScale / max(-mvPosition.z, 1.0), 400.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uC; varying float vA, vS;
      #include <fog_pars_fragment>
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vA;
        gl_FragColor = vec4(uC, a);
        #include <fog_fragment>
      }`,
    fog: true, transparent: true, depthWrite: false,
  });
  m.uniforms.uTime = ctx.time; m.uniforms.uScale = ctx.pxScale;
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.name = 'steam'; pts.renderOrder = 2;
  ctx.scene.add(pts);
  return pts;
}

// Mooring bollard (squat cast-iron bitt).
export function bitt(ctx, x, z, y = 0) {
  const { batch, M, col } = ctx;
  batch.put(lathe([[0, 0], [0.32, 0], [0.26, 0.1], [0.22, 0.55], [0.34, 0.66], [0.3, 0.74], [0, 0.74]], 12), M.darkMetal, V(x, y, z));
  col.circle(x, z, 0.35, 'bitt');
}

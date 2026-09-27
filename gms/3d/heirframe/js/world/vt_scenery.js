import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { rng, makeCanvas, canvasTexture } from './textures.js';
import { addTree, addShrubs, addVines } from './foliage.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// value noise for rock faces
function noise2(seed) {
  const h = (i, j) => { let n = (i * 374761393 + j * 668265263 + seed * 982451653) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const n = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sy) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sy;
  };
  return (x, y) => n(x, y) * 0.55 + n(x * 2.1, y * 2.1) * 0.28 + n(x * 4.7, y * 4.7) * 0.17;
}

// A limestone cliff face along (x0,z0)→(x1,z1), facing `side` (+1 = left of travel), y0..y1. Strata ledges, weathered
// recesses darker, moss on anything facing up. Vertex-coloured, batched as stone (uber).
export function cliffFace(ctx, x0, z0, x1, z1, y0, y1, { seed = 1, side = 1, step = 1.6, rough = 1.4, tint = [0.78, 0.66, 0.5], cast = true } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len, nx = -dz * side, nz = dx * side;
  const W = Math.max(2, Math.round(len / step)), H = Math.max(2, Math.round((y1 - y0) / step));
  const N = noise2(seed), g = new THREE.PlaneGeometry(1, 1, W, H);
  const p = g.attributes.position, uv = g.attributes.uv;
  const disp = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i) * len, v = uv.getY(i) * (y1 - y0), y = y0 + v;
    const band = Math.floor(v / 3.1 + N(u * 0.02, 3) * 1.5);
    const shelf = ((band * 0.37) % 1) * 0.9 * Math.min(1, rough);
    const edge = uv.getX(i) < 0.001 || uv.getX(i) > 0.999 || uv.getY(i) < 0.001 ? 0 : 1;
    const d = edge * (rough * (N(u * 0.04, v * 0.06) * 4 - 1.6) + shelf + rough * 0.9 * N(u * 0.18, v * 0.22));
    disp[i] = d;
    p.setXYZ(i, x0 + dx * u + nx * d, y, z0 + dz * u + nz * d);
  }
  g.setAttribute('disp', new THREE.BufferAttribute(disp, 1));
  const fg = g.toNonIndexed(); g.dispose();
  fg.computeVertexNormals();
  const nrm = fg.attributes.normal, fuv = fg.attributes.uv, fd = fg.attributes.disp.array, col = new Float32Array(fg.attributes.position.count * 3);
  for (let i = 0; i < fuv.count; i++) {
    const v = fuv.getY(i) * (y1 - y0), u = fuv.getX(i) * len;
    const band = Math.floor(v / 3.1 + N(u * 0.02, 3) * 1.5);
    const bt = 0.93 + 0.07 * (((band * 0.61) % 1)), rec = 0.62 + 0.38 * Math.min(1, Math.max(0, fd[i] / (rough * 1.2) + 0.4));
    const up = Math.max(0, nrm.getY(i)), moss = Math.min(1, Math.max(0, (up - 0.2) * 2.2) * (0.5 + 0.5 * N(u * 0.2, v * 0.2)) + Math.max(0, N(u * 0.08 + 5, v * 0.12) - 0.58) * 3.5);
    const k = bt * rec * (0.9 + 0.2 * N(u * 0.5 + 9, v * 0.5));
    col[i * 3] = tint[0] * k * (1 - moss) + 0.14 * moss;
    col[i * 3 + 1] = tint[1] * k * (1 - moss) + 0.26 * moss;
    col[i * 3 + 2] = tint[2] * k * (1 - moss) + 0.06 * moss;
  }
  fg.deleteAttribute('disp');
  fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ctx.batch.add(fg, ctx.M.stone, { vcolor: true, cast });
  fg.dispose();
}

// Ledge gardens up a cliff: trees and vine curtains on shelves at the given heights.
export function cliffGardens(ctx, x0, z0, x1, z1, ys, { seed = 1, side = 1, trees = 0.25 } = {}) {
  const { batch, M } = ctx;
  const R = rng(seed * 131 + 7), len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len, nx = -dz * side, nz = dx * side;
  ys.forEach((y, k) => {
    let s = R() * 10;
    while (s < len - 6) {
      const run = 8 + R() * 16, e = Math.min(len - 2, s + run);
      const ax = x0 + dx * s + nx * 1.2, az = z0 + dz * s + nz * 1.2, bx = x0 + dx * e + nx * 1.2, bz = z0 + dz * e + nz * 1.2;
      batch.put(box(e - s, 1.2, 3.2), M.stone, V((ax + bx) / 2 + nx * 0.2, y - 0.6, (az + bz) / 2 + nz * 0.2), Math.atan2(dx, dz) + Math.PI / 2, null, { cast: false, color: new THREE.Color(0.6, 0.54, 0.46) });
      addShrubs(batch, M, (ax + bx) / 2 + nx * 0.4, y, (az + bz) / 2 + nz * 0.4, e - s - 1, 2, Math.atan2(dx, dz) + Math.PI / 2, seed * 7 + k * 3 + (s | 0), Math.round((e - s) * 0.8));
      addVines(batch, M, ax + nx * 1.4, az + nz * 1.4, bx + nx * 1.4, bz + nz * 1.4, y, 3 + R() * 4, { seed: seed * 17 + k * 5 + (s | 0), side: -side, density: 0.8, bloom: 0.3 });
      for (let t = s + 2; t < e - 1; t += 5 + R() * 5) if (R() < trees) addTree(batch, M, x0 + dx * t + nx * 2, y, z0 + dz * t + nz * 2, (seed * 97 + t * 13) | 0, 0.9 + R() * 0.4);
      s = e + 4 + R() * 12;
    }
  });
}

// ---- memorial pieces ----
// Dark granite plaque with the names ground away: a scoured, paler rectangle, and a faint ghost of the eight-point star.
export function plaqueMaterial(ctx) {
  const W = 256, H = 192, c = makeCanvas(W, H), x = c.getContext('2d'), R = rng(606);
  x.fillStyle = '#16181b'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + R() * 0.05})`; x.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
  x.strokeStyle = '#b8924a'; x.lineWidth = 4; x.strokeRect(8, 8, W - 16, H - 16);
  // scoured field where the names were
  x.fillStyle = 'rgba(120,118,112,0.45)'; x.fillRect(30, 62, W - 60, H - 92);
  x.strokeStyle = 'rgba(190,186,176,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 140; i++) { const y = 64 + R() * (H - 96), xx = 32 + R() * (W - 64); x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + 10 + R() * 40, y + (R() - 0.5) * 4); x.stroke(); }
  // ghost of the Vael star, chiselled off
  x.save(); x.translate(W / 2, 36); x.strokeStyle = 'rgba(170,165,150,0.35)'; x.lineWidth = 2;
  x.beginPath();
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 7 : 17; i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.stroke(); x.fillStyle = 'rgba(140,136,126,0.25)'; x.fill(); x.restore();
  const rc = makeCanvas(W, H), rx = rc.getContext('2d');
  rx.fillStyle = 'rgb(40,40,40)'; rx.fillRect(0, 0, W, H);
  rx.fillStyle = 'rgb(200,200,200)'; rx.fillRect(30, 62, W - 60, H - 92);
  rx.fillStyle = 'rgb(90,90,90)'; rx.fillRect(8, 8, W - 16, 5); rx.fillRect(8, H - 13, W - 16, 5); rx.fillRect(8, 8, 5, H - 16); rx.fillRect(W - 13, 8, 5, H - 16);
  const map = canvasTexture(c), rough = canvasTexture(rc, false);
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0.15, envMapIntensity: 1.1 });
  m.name = 'plaque';
  return m;
}

// One stele: stone body, a tilted blank plaque face (UV'd for plaqueMaterial), a bronze cap.
export function stele(ctx, plaqueM, x, y, z, rot, scale = 1) {
  const { batch, M, col } = ctx;
  const s = scale, c = Math.cos(rot), sn = Math.sin(rot);
  batch.put(box(1.25 * s, 0.95 * s, 0.34 * s), M.stoneUpper, V(x, y + 0.475 * s, z), rot);
  batch.put(box(1.35 * s, 0.1, 0.44 * s), M.stone, V(x, y + 0.05, z), rot, null, { cast: false });
  batch.put(box(1.29 * s, 0.05, 0.38 * s), M.gold, V(x, y + 0.97 * s, z), rot, null, { cast: false });
  const face = new THREE.PlaneGeometry(1.05 * s, 0.72 * s);
  face.rotateX(-0.28); face.translate(0, 0.52 * s, 0.176 * s + 0.02);
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot), V(1, 1, 1));
  batch.add(face, plaqueM, { matrix: m, cast: false, reflect: false });
  col.box(x, z, 0.68 * s, 0.24 * s, rot, 'stele');
  return [x + sn * 0.45, z + c * 0.45];
}

// Memorial monument: stepped plinth, tapered obelisk with a blank bronze tablet, gold halo ring turning above, and an
// eternal flame in a bowl in front.
export function monument(ctx, plaqueM, x, y, z) {
  const { batch, M, col, scene } = ctx;
  batch.put(lathe([[0, 0], [3.4, 0], [3.4, 0.3], [2.6, 0.3], [2.6, 0.6], [1.8, 0.6], [1.8, 0.9], [0, 0.9]], 8), M.stoneUpper, V(x, y, z), Math.PI / 8);
  const ob = new THREE.CylinderGeometry(0.42, 0.78, 7.2, 4, 1); ob.rotateY(Math.PI / 4); ob.translate(0, 0.9 + 3.6, 0);
  batch.put(ob, M.stoneUpper, V(x, y, z));
  batch.put(new THREE.CylinderGeometry(0.02, 0.42, 0.7, 4).rotateY(Math.PI / 4), M.gold, V(x, y + 8.45, z));
  const tab = new THREE.PlaneGeometry(0.95, 1.3); tab.translate(0, 2.4, 0.715);
  batch.put(tab, plaqueM, V(x, y, z), 0, null, { cast: false, reflect: false });
  const tab2 = tab.clone(); tab2.rotateY(Math.PI);
  batch.put(tab2, plaqueM, V(x, y, z), 0, null, { cast: false, reflect: false });
  batch.put(new THREE.TorusGeometry(0.55, 0.06, 8, 24).rotateX(Math.PI / 2), M.gold, V(x, y + 1.3, z + 2.2), 0, null, { cast: false });
  batch.put(lathe([[0, 0], [0.18, 0], [0.12, 0.7], [0.5, 0.95], [0.55, 1.05], [0, 1.05]], 20), M.darkMetal, V(x, y + 0.3, z + 2.2));
  const halo = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * 0.35, 0.05, 8, 64), M.goldSolid);
    r.rotation.x = Math.PI / 2 + (i ? 0.25 : -0.15); r.castShadow = true; r.layers.enable(REFLECT_LAYER); halo.add(r);
  }
  halo.position.set(x, y + 9.4, z); scene.add(halo);
  const flame = flameFx(ctx, x, y + 1.38, z + 2.2);
  ctx.updaters.push((dt, t) => { halo.rotation.y = t * 0.12; halo.children[1].rotation.z = t * 0.2; halo.position.y = y + 9.4 + Math.sin(t * 0.7) * 0.1; flame(t); });
  col.circle(x, z, 3.5, 'monument');
}

// small additive flame of camera-facing points
function flameFx(ctx, x, y, z) {
  const n = 40, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([(Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time, uScale: ctx.pxScale },
    vertexShader: `attribute float seed; uniform float uTime, uScale; varying float vT;
      void main(){ float t = fract(seed + uTime * 1.3); vT = t; vec3 p = position * (1.0 - t); p.y += t * 0.9;
        p.x += sin(uTime * 7.0 + seed * 30.0) * 0.05 * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uScale * 0.35 * (1.0 - t * 0.7) / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vT; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * (1.0 - vT);
      gl_FragColor = vec4(mix(vec3(3.0, 1.6, 0.5), vec3(1.6, 0.4, 0.08), vT) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m); pts.position.set(x, y, z); pts.frustumCulled = false;
  ctx.scene.add(pts);
  return () => {};
}

// Glass conservatory dome with gold ribs and plants inside.
export function conservatory(ctx, x, y, z, r = 8) {
  const { batch, M, col } = ctx;
  batch.put(lathe([[0, 0], [r + 0.6, 0], [r + 0.6, 0.6], [r, 0.7], [0, 0.7]], 40), M.stoneUpper, V(x, y, z));
  batch.put(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glassRail, V(x, y + 0.7, z), 0, null, { cast: false, reflect: false });
  for (let i = 0; i < 12; i++) batch.put(new THREE.TorusGeometry(r + 0.04, 0.07, 5, 24, Math.PI).rotateY(i / 12 * Math.PI), M.gold, V(x, y + 0.7, z), 0, null, { cast: false });
  for (const hy of [0.35, 0.7]) {
    const rr = r * Math.cos(Math.asin(hy)); batch.put(new THREE.TorusGeometry(rr, 0.06, 5, 48).rotateX(Math.PI / 2), M.gold, V(x, y + 0.7 + r * hy, z), 0, null, { cast: false });
  }
  batch.put(lathe([[0, 0], [0.5, 0], [0.12, 1.4], [0, 1.6]], 12), M.gold, V(x, y + 0.7 + r, z));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4; addTree(batch, M, x + Math.sin(a) * r * 0.5, y + 0.7, z + Math.cos(a) * r * 0.5, 800 + i, 0.8 + (i % 2) * 0.25); }
  addShrubs(batch, M, x, y + 0.7, z, r * 1.2, r * 1.2, 0, 77, 16);
  col.circle(x, z, r + 0.8, 'conservatory');
}

// Open rotunda: 8 columns, gold dome, benches inside. Returns bench seats for the crowd.
export function pavilion(ctx, x, y, z, bench) {
  const { batch, M, col } = ctx;
  const r = 4.6;
  batch.put(lathe([[0, 0], [r + 0.9, 0], [r + 0.9, 0.25], [r + 0.5, 0.25], [r + 0.5, 0.45], [0, 0.45]], 32), M.stoneUpper, V(x, y, z));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8, cx = x + Math.sin(a) * r, cz = z + Math.cos(a) * r;
    batch.add(cyl(0.22, 0.26, 4.6, cx, y + 0.45, cz, 14), M.stoneUpper);
    batch.add(cyl(0.34, 0.34, 0.25, cx, y + 0.45, cz, 12), M.stone);
    batch.add(cyl(0.34, 0.26, 0.3, cx, y + 4.8, cz, 12), M.gold);
    col.circle(cx, cz, 0.35, 'column');
  }
  batch.put(new THREE.TorusGeometry(r, 0.3, 8, 40).rotateX(Math.PI / 2), M.stoneUpper, V(x, y + 5.25, z));
  const dome = new THREE.SphereGeometry(r + 0.3, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.55, 1);
  batch.put(dome, M.gold, V(x, y + 5.3, z));
  batch.put(lathe([[0, 0], [0.35, 0], [0.1, 1.1], [0, 1.4]], 12), M.gold, V(x, y + 5.3 + (r + 0.3) * 0.55, z));
  const seats = [];
  for (const a of [0, Math.PI]) seats.push({ x: x + Math.sin(a) * 2.2, z: z + Math.cos(a) * 2.2, seats: bench(ctx, x + Math.sin(a) * 2.2, z + Math.cos(a) * 2.2, a + Math.PI, y + 0.45), kind: 'sit', y: y + 0.45 });
  return seats;
}

// Stone footbridge over a canal running along Z (deck at y, spanning x0..x1, z centred).
export function footbridge(ctx, x0, x1, z, y, w = 3) {
  const { batch, M } = ctx;
  const len = x1 - x0, cx = (x0 + x1) / 2;
  batch.put(box(len, 0.35, w), M.stoneUpper, V(cx, y - 0.17, z));
  const arch = new THREE.CylinderGeometry(len * 0.62, len * 0.62, w, 24, 1, true, Math.PI - 0.95, 1.9); arch.rotateX(Math.PI / 2);
  batch.put(arch, M.stone, V(cx, y - len * 0.62 - 0.1, z), 0, null, { cast: false });
  for (const s of [-1, 1]) {
    batch.put(box(len, 0.55, 0.22), M.stoneUpper, V(cx, y + 0.27, z + s * (w / 2 - 0.11)));
    batch.put(box(len + 0.1, 0.05, 0.26), M.gold, V(cx, y + 0.56, z + s * (w / 2 - 0.11)), 0, null, { cast: false });
  }
}

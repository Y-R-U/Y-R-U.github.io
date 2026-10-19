import * as THREE from 'three';
import { BOARD } from '../layout.js';
import { box, merge, onLayers } from '../geo.js';
import { rng } from '../../fx/textures.js';
import { flagstoneTextures, stoneBlockTextures, pedestalTextures, foliageTexture, } from '../../fx/textures_fantasy.js';
import { createPlanarReflection, REFLECT_LAYER } from '../../fx/reflection.js';
import { buildForestEnv } from '../../engine/env.js';
import { buildFantasyBackdrop } from './fantasy_backdrop.js';
import { buildFantasyForest } from './fantasy_forest.js';
import { tubeGeometry } from '../../fx/tube.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Fantasy ruins arena (D21, map 6 "The Verdance", refs/ref_fantasy_01.jpg): cracked mossy flagstone, crumbling ivy walls
// and pillars, octagonal stone pedestals tinted per faction, warm forest light, fireflies. Same contract as scifi.js.
export const id = 'fantasy';
const FT_CACHE = new Map();
const FANTASY_UNIT_K = 1;
// BATTLE-L: the wide (landscape) board has horizontal room for bigger fantasy units (battle-7 open issue); portrait stays 1
const FANTASY_UNIT_K_WIDE = 1.12;

// world-space moss on up-facing surfaces + a damp band at the base, for any MeshStandardMaterial (instanced or not)
export function mossy(mat, { amount = 0.75, base = 0.5, scale = 1.1, color = new THREE.Color(0.05, 0.068, 0.02) } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMoss = { value: new THREE.Vector3(amount, base, scale) };
    sh.uniforms.uMossC = { value: color };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 mwp = vec4(transformed, 1.0); vec3 mwn = objectNormal;
        #ifdef USE_INSTANCING
          mwp = instanceMatrix * mwp; mwn = mat3(instanceMatrix) * mwn;
        #endif
        vWP = (modelMatrix * mwp).xyz; vWN = normalize(mat3(modelMatrix) * mwn);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform vec3 uMoss; uniform vec3 uMossC;
        float mh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float mn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(mh(i), mh(i+vec3(1,0,0)), f.x), mix(mh(i+vec3(0,1,0)), mh(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(mh(i+vec3(0,0,1)), mh(i+vec3(1,0,1)), f.x), mix(mh(i+vec3(0,1,1)), mh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = mn(vWP * uMoss.z) * 0.65 + mn(vWP * uMoss.z * 3.7) * 0.35;
          float top = smoothstep(0.25, 0.8, vWN.y) * smoothstep(0.38, 0.62, n) * uMoss.x;
          float foot = (1.0 - smoothstep(0.0, 0.9, vWP.y)) * smoothstep(0.3, 0.7, n) * uMoss.y;
          float m = clamp(max(top, foot), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uMossC * (0.65 + 0.7 * mn(vWP * 9.0)), m); }`);
  };
  mat.customProgramCacheKey = () => 'mossy';
  return mat;
}

export function createTheme(engine, { seed = 7 } = {}) {
  const tier = engine.quality;
  const lowT = tier.name === 'low';
  const group = new THREE.Group();
  const updaters = [];
  const disposables = [];
  const hw = BOARD.W / 2, bz0 = BOARD.zNear, bz1 = BOARD.zFar;
  const fz0 = bz0 + 6, fz1 = bz1 - 2.2, iW = BOARD.W + 7.5;
  const r = rng(seed * 11 + 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), eu = new THREE.Euler(), v2 = new THREE.Vector2();

  // stone has no mirror; a disabled reflection keeps the battle's preRender + material hooks happy
  const reflection = createPlanarReflection(engine.renderer, { scale: 0, planeY: 0 });

  // --- ground: one flagstone plane under the board and its wild margin ---
  const rect = { x0: -hw - 7, x1: hw + 7, zNear: fz0, zFar: fz1 - 1.5 };
  // ~190 ms on an M5 at high: cached per module (dispose() frees the GPU copy; three re-uploads it on the next battle)
  const ftKey = [lowT ? 22 : tier.name === 'med' ? 30 : 36, seed, BOARD.W, BOARD.zNear, BOARD.zFar].join();
  const ft = FT_CACHE.get(ftKey) || FT_CACHE.set(ftKey, flagstoneTextures({ rect, board: BOARD, px: +ftKey.split(',')[0], seed })).get(ftKey);
  // battle-9: the slab texture is lifted and pulled off the forest's yellow-green toward the ref's warm neutral grey (colour > 1 on purpose)
  const groundMat = new THREE.MeshStandardMaterial({ map: ft.map, normalMap: ft.normal, normalScale: new THREE.Vector2(1.1, 1.1),
    color: new THREE.Color(1.1, 1.06, 1.3), roughness: 0.88, metalness: 0.0, envMapIntensity: 0.55 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(rect.x1 - rect.x0, rect.zNear - rect.zFar), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set((rect.x0 + rect.x1) / 2, 0, (rect.zNear + rect.zFar) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // --- ruins: dressed-stone walls, broken pillars, a near ledge; one merged mesh with per-block UVs ---
  const st = stoneBlockTextures(seed);
  const stoneMat = mossy(new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normal, color: 0xb8b2a2, roughness: 0.9, metalness: 0, envMapIntensity: 0.5 }),
    { amount: 0.45, base: 0.45 });
  const G = [], tops = [], pillarTops = [];
  const block = (w, h, d, x, y, z, ry = 0) => G.push(box(w, h, d, x, y, z, ry));
  // a wall along a line: courses of blocks, ragged crumbling top from a height profile
  function wall(x0, z0, x1, z1, hFn, thick = 0.8) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), ry = -ang;
    let t = 0, course = 0;
    const CH = 0.5;
    for (let y = 0; ; y += CH, course++) {
      let any = false;
      t = course % 2 ? 0.45 : 0;
      while (t < len) {
        const bl = 0.7 + r() * 0.6, tm = Math.min(len, t + bl), mid = (t + tm) / 2;
        const top = hFn(mid / len);
        if (y + CH * 0.5 < top) {
          any = true;
          const px = x0 + Math.cos(ang) * mid, pz = z0 + Math.sin(ang) * mid;
          const shrink = y + CH > top ? 0.75 + r() * 0.2 : 1;
          block((tm - t) - 0.05, CH * shrink - 0.04, thick * (0.88 + r() * 0.12), px + (r() - 0.5) * 0.06, y + CH * shrink / 2, pz + (r() - 0.5) * 0.06, ry + (r() - 0.5) * 0.05);
          if (y + CH > top) tops.push({ x: px, y: y + CH * shrink, z: pz, ang, thick });
        }
        t = tm;
      }
      if (!any || y > 12) break;
    }
  }
  const prof = (h0, h1, wob, holes = 0) => (u) => {
    const base = h0 + (h1 - h0) * u + Math.sin(u * 17 + r() * 0.01) * wob * 0.5 + Math.sin(u * 41) * wob * 0.35;
    return holes && Math.sin(u * holes * 6.283) > 0.55 ? base * 0.25 : base;
  };
  // side walls: low near the camera (mostly off screen), rising toward the back corners
  for (const s of [-1, 1]) {
    wall(s * (hw + 1.3), bz0 - 6, s * (hw + 1.3), fz1 + 0.5, prof(0.6, 2.6, 0.9, 2.2), 0.9);
    wall(s * (hw + 3.2), bz0 - 2, s * (hw + 3.2), fz1 - 1, prof(1.2, 4.2, 1.2, 1.4), 0.9);
  }
  // back wall (behind the far row): tall in the corners, a broken gap in the middle; the backdrop seam is ~3.3 m here
  wall(-hw - 3.6, fz1 - 0.4, -2.2, fz1 - 0.4, (u) => 5.2 - u * 1.6 + Math.sin(u * 23) * 0.5, 1.0);
  wall(2.2, fz1 - 0.4, hw + 3.6, fz1 - 0.4, (u) => 3.6 + u * 1.8 + Math.sin(u * 19) * 0.5, 1.0);
  wall(-2.2, fz1 - 0.4, 2.2, fz1 - 0.4, (u) => 1.4 + Math.sin(u * 9) * 0.4, 1.0);
  // pillars (stacked drums, some broken short, a lintel on the intact ones)
  const pillar = (x, z, h, rad = 0.55, cap = false) => {
    let y = 0;
    G.push(box(rad * 2.6, 0.35, rad * 2.6, x, 0.175, z));
    y = 0.35;
    while (y < h) {
      const dh = Math.min(h - y, 0.7 + r() * 0.3);
      const c = new THREE.CylinderGeometry(rad * (0.96 + r() * 0.04), rad, dh - 0.03, 10);
      c.translate(x + (r() - 0.5) * 0.05, y + dh / 2, z + (r() - 0.5) * 0.05); G.push(c);
      y += dh;
    }
    if (cap) G.push(box(rad * 2.5, 0.4, rad * 2.5, x, y + 0.2, z));
    pillarTops.push({ x, y: y + (cap ? 0.4 : 0), z, rad: cap ? rad * 1.25 : rad });
  };
  for (const s of [-1, 1]) {
    pillar(s * (hw + 2.2), -4.5, 1.6 + r() * 0.8);
    pillar(s * (hw + 2.2), -13, 3.6 + r() * 1.5, 0.6, true);
    pillar(s * (hw + 2.2), -21.5, 2.4 + r() * 1.5);
    pillar(s * (hw + 2.4), fz1 + 0.3, 6.5 + r(), 0.75, true);
  }
  // near ledge (battle-7): a ruined kerb of uneven blocks between the floor and the HUD strip (nearRim): some tall broken stacks, gaps
  // filled with ferns, a second row behind, a few fallen stones in front; roots crawl over it (see vines below)
  const z0 = bz0 + 0.75, ledge = [], ledgeGaps = [];
  for (let x = -hw - 3; x < hw + 3;) {
    const bl = 0.7 + r() * 0.9, tall = r() < 0.2, hgt = tall ? 0.95 + r() * 0.45 : 0.42 + r() * 0.32, cx = x + bl / 2;
    if (r() < 0.13) ledgeGaps.push(cx);
    else {
      block(bl - 0.08, hgt, 1.0 + r() * 0.25, cx, hgt / 2, z0 + 0.6 + (r() - 0.5) * 0.15, (r() - 0.5) * 0.14);
      if (tall && r() < 0.6) block(bl * 0.6, 0.32, 0.7, cx + (r() - 0.5) * 0.3, hgt + 0.15, z0 + 0.72, (r() - 0.5) * 0.6);
      ledge.push({ x: cx, h: hgt, w: bl });
    }
    if (r() > 0.45) block(bl * 0.9, 0.35 + r() * 0.5, 0.9, cx + (r() - 0.5) * 0.2, 0.3, z0 + 1.8 + r() * 0.3, (r() - 0.5) * 0.2);
    if (r() < 0.14) { // a fallen, tilted stone on the ground in front (outside the board)
      const g = new THREE.BoxGeometry(0.5 + r() * 0.4, 0.3 + r() * 0.15, 0.4 + r() * 0.3);
      g.rotateZ((r() - 0.5) * 0.7); g.rotateX((r() - 0.5) * 0.4); g.rotateY(r() * 3); g.translate(cx, 0.14, z0 - 0.3 - r() * 0.25);
      G.push(g);
    }
    x += bl;
  }
  block(BOARD.W + 8, 0.24, 2.4, 0, 0.12, z0 + 2.9);
  const ruins = onLayers(new THREE.Mesh(merge(G), stoneMat), REFLECT_LAYER);
  ruins.castShadow = true; ruins.receiveShadow = true;
  group.add(ruins);

  // --- vines + roots (battle-7): hanging vines and draped loops on the inner faces of the walls and pillars, roots crawling over the near
  // ledge onto the floor. Tapered tubes (js/fx/tube.js) with vertex colours, one merged draw; ivy leaf cards along the vines go into the
  // foliage instancing below (vineLeaves). ---
  const VG = [], vineLeaves = [], cV = new THREE.Color(), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const colorize = (g, hex, k = 1) => { cV.set(hex).multiplyScalar(k); const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = cV.r; c[i * 3 + 1] = cV.g; c[i * 3 + 2] = cV.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const inward = (p) => { // unit normal of a wall top, pointing at the board
    const nx = -Math.sin(p.ang), nz = Math.cos(p.ang), s2 = nx * -p.x + nz * (BOARD.zMid - p.z) > 0 ? 1 : -1;
    return [nx * s2, nz * s2];
  };
  const leavesAlong = (pts, nx, nz, every = 0.28) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
      for (let d = r() * every; d < L; d += every * (0.7 + r() * 0.6)) {
        const p = a.clone().lerp(b, d / L);
        vineLeaves.push([p.x + nx * 0.05, p.y - 0.15, p.z + nz * 0.05, 0.28 + r() * 0.22, Math.atan2(nx, nz) + (r() - 0.5) * 0.9]);
      }
    }
  };
  const vineSeg = lowT ? 6 : 10;
  const hangCands = tops.filter((p) => p.y > 1.1);
  const nHang = Math.min(hangCands.length, lowT ? 22 : 46);
  for (let i = 0; i < nHang; i++) {
    const p = hangCands[(r() * hangCands.length) | 0], [nx, nz] = inward(p);
    const dx = Math.cos(p.ang), dz = Math.sin(p.ang), off = p.thick / 2 + 0.04;
    const ox = p.x + nx * off + dx * (r() - 0.5) * 0.6, oz = p.z + nz * off + dz * (r() - 0.5) * 0.6;
    const pts = [];
    if (r() < 0.3) { // draped loop between two points along the top
      const span = 1.2 + r() * 1.4, sag = 0.5 + r() * 0.9;
      for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V3(ox + dx * span * t + nx * 0.06 * Math.sin(t * Math.PI), p.y - 0.05 - sag * Math.sin(t * Math.PI), oz + dz * span * t + nz * 0.06 * Math.sin(t * Math.PI))); }
    } else { // hanging strand with a slight sway, standing off the face toward the bottom
      const Lh = Math.min(p.y * 0.85, 0.7 + r() * 2.3), ph = r() * 6;
      for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(V3(ox + nx * (0.03 + 0.14 * t * t) + dx * Math.sin(t * 2.5 + ph) * 0.12, p.y + 0.04 - Lh * t, oz + nz * (0.03 + 0.14 * t * t) + dz * Math.sin(t * 2.5 + ph) * 0.12)); }
    }
    VG.push(colorize(tubeGeometry(pts, { r0: 0.045, r1: 0.02, seg: vineSeg, rad: 5 }), 0x3a4a22, 0.8 + r() * 0.4));
    leavesAlong(pts, nx, nz);
  }
  // pillars: a couple of strands down the board-facing side of each tall one
  for (const p of pillarTops) if (p.y > 2.4) for (let k = 0; k < 2; k++) {
    const a = (Math.sign(-p.x) > 0 ? 0 : Math.PI) + (r() - 0.5) * 1.6, nx = Math.cos(a), nz = Math.sin(a) * 0.6, L = p.y * (0.5 + r() * 0.4);
    const pts = [0, 0.33, 0.66, 1].map((t) => V3(p.x + nx * (p.rad + 0.05 + t * 0.08), p.y - L * t, p.z + nz * (p.rad + 0.05) + Math.sin(t * 3 + k) * 0.1));
    VG.push(colorize(tubeGeometry(pts, { r0: 0.05, r1: 0.02, seg: vineSeg, rad: 5 }), 0x3a4a22));
    leavesAlong(pts, nx, nz);
  }
  // roots over the near ledge. The camera looks at the ledge from the HUD side, so a root running toward it is foreshortened to a sliver:
  // these sweep sideways instead, out of the floor on the board side, up over the block tops, along them, and down behind (under the HUD)
  const nRoots = lowT ? 5 : 9;
  for (let i = 0; i < nRoots && ledge.length; i++) {
    const L0 = ledge[(r() * ledge.length) | 0], x = L0.x, dx = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.8), h = L0.h, ph = r() * 9;
    const hAt = (xx) => { let best = ledge[0]; for (const q of ledge) if (Math.abs(q.x - xx) < Math.abs(best.x - xx)) best = q; return best.h; };
    const pts = [V3(x - dx * 0.25, 0.02, z0 - 0.75 - r() * 0.35), V3(x - dx * 0.05, 0.18, z0 - 0.25), V3(x + dx * 0.15, h + 0.1, z0 + 0.25),
      V3(x + dx * 0.5, Math.max(h, hAt(x + dx * 0.5)) + 0.08, z0 + 0.55), V3(x + dx * 0.85, Math.max(0.3, hAt(x + dx * 0.85)) + 0.06, z0 + 0.8),
      V3(x + dx * 1.05, 0.25, z0 + 1.6)];
    VG.push(colorize(tubeGeometry(pts, { r0: 0.16 + r() * 0.08, r1: 0.04, seg: lowT ? 10 : 18, rad: 7,
      bulge: (t) => 1 + 0.3 * Math.max(0, 1 - t * 5) + 0.18 * Math.sin(t * 23 + ph) }), 0x6e5538, 0.85 + r() * 0.3));
    if (r() < 0.6) { // a thinner side root creeping out across the floor toward the board
      const q = [pts[1].clone(), V3(x - dx * 0.4, 0.04, z0 - 0.5), V3(x - dx * 0.8 - 0.3, 0.03, z0 - 0.9 - r() * 0.4)];
      VG.push(colorize(tubeGeometry(q, { r0: 0.07, r1: 0.015, seg: 8, rad: 5 }), 0x6e5538));
    }
  }
  // roots spreading from the wall feet and pillar bases onto the floor margins (outside the board)
  for (let i = 0; i < (lowT ? 6 : 14); i++) {
    const s2 = r() < 0.5 ? -1 : 1, zz = bz0 - 2 - r() * (bz0 - bz1 - 4), x0 = s2 * (hw + 0.95), ph = r() * 9;
    const pts = [V3(x0, 0.45, zz), V3(x0 - s2 * 0.35, 0.12, zz + (r() - 0.5) * 0.6), V3(x0 - s2 * (0.7 + r() * 0.5), 0.04, zz + (r() - 0.5) * 1.2)];
    VG.push(colorize(tubeGeometry(pts, { r0: 0.11, r1: 0.02, seg: 8, rad: 6, bulge: (t) => 1 + 0.2 * Math.sin(t * 17 + ph) }), 0x4b3a27, 0.9));
  }
  const vineMat = mossy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.45 }), { amount: 0.35, base: 0.0, scale: 3 });
  const vines = onLayers(new THREE.Mesh(mergeGeometries(VG, false), vineMat), REFLECT_LAYER);
  for (const g of VG) g.dispose();
  vines.castShadow = true; vines.receiveShadow = true;
  group.add(vines);

  // --- rubble: instanced chunks along the walls and in the margins (never on the slots) ---
  const nRub = lowT ? 70 : 150;
  const rub = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), stoneMat, nRub);
  for (let i = 0; i < nRub; i++) {
    let x, z;
    if (i < nRub * 0.7) { const s = r() < 0.5 ? -1 : 1; x = s * (hw + 0.4 + r() * 4.5); z = bz0 - r() * (bz0 - fz1); }
    else { x = (r() - 0.5) * (BOARD.W + 6); z = fz1 + 0.6 + r() * 1.6; }
    if (Math.abs(x) < hw + 0.25 && z > bz1 + 0.3) x = Math.sign(x || 1) * (hw + 0.4 + r());
    const s = 0.25 + Math.pow(r(), 2) * 0.9;
    m4.compose(pv.set(x, s * 0.25, z), q.setFromEuler(eu.set(r() * 3, r() * 3, r() * 3)), sc.set(s * (0.8 + r() * 0.6), s * (0.5 + r() * 0.4), s * (0.8 + r() * 0.6)));
    rub.setMatrixAt(i, m4);
  }
  rub.castShadow = true; rub.receiveShadow = true;
  group.add(rub);

  // --- foliage: ivy on the ruins, grass tufts + ferns at wall feet and in the margins (one instanced draw) ---
  const folTex = foliageTexture(seed);
  const nFolBase = lowT ? 300 : 660, nFol = nFolBase + vineLeaves.length + (lowT ? 60 : 160);
  const folGeo = new THREE.PlaneGeometry(1, 1); folGeo.translate(0, 0.5, 0);
  const nrm = folGeo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 0.9, 0.42);
  const aTile = new THREE.InstancedBufferAttribute(new Float32Array(nFol), 1);
  folGeo.setAttribute('aTile', aTile);
  const folMat = new THREE.MeshStandardMaterial({ map: folTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color: 0x5e6e46, envMapIntensity: 0.3 });
  folMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); // cards light the same from both sides
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aTile) / 3.0;');
  };
  folMat.customProgramCacheKey = () => 'foliage-atlas';
  const fol = new THREE.InstancedMesh(folGeo, folMat, nFol);
  let fi = 0;
  const addFol = (tile, x, y, z, s, ry, rx = 0) => {
    if (fi >= nFol) return;
    m4.compose(pv.set(x, y, z), q.setFromEuler(eu.set(rx, ry, 0)), sc.set(s, s, s));
    fol.setMatrixAt(fi, m4); aTile.setX(fi++, tile);
  };
  // ivy clumps hugging wall faces and draping over tops
  for (let i = 0; i < nFolBase * 0.4; i++) {
    const s = r() < 0.5 ? -1 : 1, back = r() < 0.3;
    if (back) addFol(0, (r() - 0.5) * (BOARD.W + 6), r() * 3.5, fz1 + 0.15, 0.9 + r() * 1.1, (r() - 0.5) * 0.4, (r() - 0.5) * 0.3);
    else addFol(0, s * (hw + 0.85 + (r() < 0.5 ? 0 : 1.9)), r() * 2.4, bz0 - 3 - r() * (bz0 - fz1 - 3), 0.8 + r() * 1.0, s * Math.PI / 2 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.3);
  }
  // grass + ferns: wall feet, margins, and a few sparse tufts on the board (only off the slot rows)
  while (fi < nFolBase - 140) {
    const tile = r() < 0.72 ? 1 : 2;
    let x, z;
    const k = r();
    if (k < 0.6) { const s = r() < 0.5 ? -1 : 1; x = s * (hw + 0.3 + r() * 6); z = fz0 - r() * (fz0 - fz1); }
    else if (k < 0.8) { x = (r() - 0.5) * (BOARD.W + 8); z = fz1 + 0.5 + r() * 1.8; }
    else { x = (r() - 0.5) * BOARD.W; z = bz0 - r() * BOARD.L; if (Math.abs(Math.abs(x) - BOARD.colX[0]) < 1.7 || Math.abs(Math.abs(x) - BOARD.colX[1]) < 1.7 || Math.abs(x) < 0.7) continue; }
    const s = (tile === 1 ? 0.45 : 0.7) * (0.7 + r() * 0.8);
    const ry = r() * Math.PI;
    addFol(tile, x, 0, z, s, ry); addFol(tile, x, 0, z, s, ry + Math.PI / 2);
  }
  // the near ledge: big ferns in its gaps and on the block tops, grass along its foot
  for (const gx of ledgeGaps) for (let k = 0; k < 2; k++) { const s = 0.9 + r() * 0.5, ry = r() * Math.PI, x = gx + (r() - 0.5) * 0.4, z = z0 + 0.5 + r() * 0.4; addFol(2, x, 0, z, s, ry); addFol(2, x, 0, z, s, ry + Math.PI / 2); }
  for (let i = 0; i < (lowT ? 24 : 60) && ledge.length; i++) {
    const L0 = ledge[(r() * ledge.length) | 0], fern = r() < 0.55, s = fern ? 0.6 + r() * 0.55 : 0.45 + r() * 0.35, ry = r() * Math.PI;
    const onTop = r() < 0.45, x = L0.x + (r() - 0.5) * L0.w, y = onTop ? L0.h - 0.04 : 0, z = onTop ? z0 + 0.6 + (r() - 0.5) * 0.5 : z0 - 0.05 - r() * 0.35;
    addFol(fern ? 2 : 1, x, y, z, s, ry); addFol(fern ? 2 : 1, x, y, z, s, ry + Math.PI / 2);
  }
  // ivy leaves along the hanging vines
  for (const [x, y, z, s, ry] of vineLeaves) addFol(0, x, y, z, s, ry, (r() - 0.5) * 0.4);
  fol.count = fi;
  aTile.needsUpdate = true;
  fol.castShadow = false; fol.receiveShadow = true;
  group.add(fol);

  // --- fireflies + drifting motes over the board (additive points, one draw) ---
  const nFly = lowT ? 50 : 140;
  const flyGeo = new THREE.BufferGeometry();
  const fp = new Float32Array(nFly * 3), fs = new Float32Array(nFly * 4);
  for (let i = 0; i < nFly; i++) {
    fp[i * 3] = (r() - 0.5) * (BOARD.W + 8); fp[i * 3 + 1] = 0.4 + r() * 4.5; fp[i * 3 + 2] = fz0 - 2 - r() * (fz0 - fz1 - 2);
    fs[i * 4] = r() * 100; fs[i * 4 + 1] = 0.4 + r() * 0.8; fs[i * 4 + 2] = r() < 0.35 ? 1 : 0; fs[i * 4 + 3] = 0.5 + r();
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  flyGeo.setAttribute('aSeed', new THREE.BufferAttribute(fs, 4));
  const flyMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uFly: { value: new THREE.Color(2.2, 2.6, 0.7) }, uMote: { value: new THREE.Color(1.1, 0.95, 0.6) } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA; varying float vK;
      void main(){
        float t = uTime * aSeed.y + aSeed.x;
        vec3 p = position + vec3(sin(t * 0.7) * 0.9, sin(t * 1.1) * 0.5 + sin(t * 0.31) * 0.6, cos(t * 0.53) * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vK = aSeed.z;
        vA = aSeed.z > 0.5 ? smoothstep(0.2, 1.0, sin(t * 2.3 + aSeed.x) * 0.5 + 0.5) : 0.35 + 0.25 * sin(t * 1.7);
        gl_PointSize = (aSeed.z > 0.5 ? 0.22 : 0.12) * aSeed.w * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uFly; uniform vec3 uMote; varying float vA; varying float vK;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) * vA;
        gl_FragColor = vec4((vK > 0.5 ? uFly : uMote) * a, 1.0); }`,
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false; flies.renderOrder = 4;
  group.add(flies);
  updaters.push((dt, t) => { flyMat.uniforms.uTime.value = t; flyMat.uniforms.uScale.value = engine.renderer.getDrawingBufferSize(v2).y * 0.55; });

  // --- pedestals: octagonal stone slabs, flat face toward the camera; the board tints them per faction ---
  const plateH = 0.5;
  const pt = pedestalTextures(seed + 2);
  const plateMat = mossy(new THREE.MeshStandardMaterial({ map: pt.map, normalMap: pt.normal, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.6 }),
    { amount: 0.18, base: 0.0, scale: 2.2 });
  const tintHSL = {};
  const plate = {
    height: plateH, geometry: octPedestal(plateH), material: plateMat,
    // painted stone: keep the hue, cap saturation, fixed lightness so gold / blue / red / green read like the ref's plates
    tint(c, out) { c.getHSL(tintHSL); return out.setHSL(tintHSL.h, Math.min(0.85, tintHSL.s), 0.36).multiplyScalar(1.15); },
  };

  // --- backdrop ---
  const backdrop = buildFantasyBackdrop(engine, { iW, fz0, fz1, seed });
  group.add(backdrop.group);
  updaters.push(backdrop.update);

  // --- lighting: warm low sun from the front-left (units read), warm back light from the forest (unit rims), cool fill ---
  // battle-9: brighter warm key, neutral-warm hemi, stronger rim, more fill: the board was murky olive (floor 61,67,43 -> ~95,88,72;
  // ref_fantasy_01's floor is ~84,75,64). The surroundings stay moody through the texture's darker wild margins + the vignette.
  const hemi = new THREE.HemisphereLight(0xdcd6c4, 0x30281c, 0.9);
  const key = new THREE.DirectionalLight(0xffd49a, 3.6);
  key.position.set(-9, 19, 9); key.target.position.set(0, 0, BOARD.zMid);
  if (tier.shadowMap) {
    key.castShadow = true;
    key.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    const c = key.shadow.camera; c.left = -15; c.right = 15; c.top = 19; c.bottom = -19; c.near = 2; c.far = 70;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
    key.shadow.camera.layers.enable(2); // unit shadow proxies live on the mirror-only layer
  }
  const rim = new THREE.DirectionalLight(0xe6dcb0, 2.4); rim.position.set(4, 9, -30);
  const fill = new THREE.DirectionalLight(0xc8d4ff, 1.0); fill.position.set(10, 4, 22);
  group.add(hemi, key, key.target, rim, fill);
  for (const l of [hemi, key, rim, fill]) l.layers.enableAll();

  const environment = buildForestEnv(engine.renderer, Math.min(128, tier.envSize || 128));

  // OVERTIME: motes go ember, fireflies redden
  const fly0 = flyMat.uniforms.uFly.value.clone(), mote0 = flyMat.uniforms.uMote.value.clone();
  const emb = new THREE.Color(3.0, 0.6, 0.15);
  let otK = 0;
  updaters.push(() => { flyMat.uniforms.uFly.value.copy(fly0).lerp(emb, otK); flyMat.uniforms.uMote.value.copy(mote0).lerp(emb, otK * 0.8); });

  // --- battle-8: the forest beyond the side walls (fantasy_forest.js), shown on the wide (landscape) board, where the camera sees
  // past the walls, and during the D26 intro (which looks out over them). The portrait fight framing barely sees it: hidden there.
  const forest = buildFantasyForest(engine, { hw, fz0, fz1, bz0, seed, stone: stoneMat, foliage: folTex });
  forest.group.visible = false;
  const forestOn = { wide: false, intro: false };
  group.add(forest.group);
  updaters.push((dt, t) => { if (forest.group.visible) forest.update(dt, t); });
  // battle-9 S22 guard: the forest is the wide board's big triangle cost (+175k tris at high). If frames stay slow while it shows
  // (2 windows of 1.5 s under 45 fps, 90th-percentile like the engine governor), trim it a level (far leaf cards, then far crowns).
  // One-way for this battle; the dpr governor still runs on its own. `?forestTrim=N` forces a level (tests).
  const guard = { acc: 0, dts: [], slow: 0, level: 0 };
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('forestTrim') : null;
  if (forced != null) guard.level = forest.trim(+forced);
  updaters.push((dt) => {
    if (!forest.group.visible || forced != null || guard.level >= 2 || !(dt > 0)) return;
    guard.acc += dt; guard.dts.push(dt);
    if (guard.acc < 1.5) return;
    guard.dts.sort((x, y) => x - y);
    const keep = Math.max(1, Math.floor(guard.dts.length * 0.9));
    let sum = 0; for (let i = 0; i < keep; i++) sum += guard.dts[i];
    const fps = keep / sum; guard.acc = 0; guard.dts.length = 0;
    guard.slow = fps < 45 ? guard.slow + 1 : 0;
    if (guard.slow >= 2) { guard.slow = 0; guard.level = forest.trim(guard.level + 1); console.info('[battle] forest trimmed to level', guard.level, 'at', fps.toFixed(1), 'fps'); }
  });

  disposables.push(environment);
  // battle-9: the wide board wants a lighter vignette (its sides are HUD bands + forest); portrait keeps more edge darkness and contrast,
  // since the lifted floor would otherwise read flat in the tall frame
  const look = { strength: 0.5, radius: 0.35, threshold: 1.25, factors: [1, 0.7, 0.45, 0.25, 0.1], vignette: 0.66, vignetteAspect: 1.25, sat: 0.98, contrast: 1.14 };
  const setLook = (wide) => {
    look.vignette = wide ? 0.5 : 0.66; look.contrast = wide ? 1.1 : 1.14;
    const u = engine.post?.grade?.uniforms;
    if (u && engine.scene?.look === look) { u.uVignette.value = look.vignette; u.uContrast.value = look.contrast; }
  };
  return {
    // the forest shows on the wide board, and in portrait only while the D26 intro looks out over the walls (battle.js setIntro)
    setWide(on) { forestOn.wide = !!on; forest.group.visible = forestOn.wide || forestOn.intro; setLook(forestOn.wide); },
    setIntro(on) { forestOn.intro = !!on; forest.group.visible = forestOn.wide || forestOn.intro; },
    forest, get forestTrim() { return guard.level; },
    id, group, reflection, lights: { hemi, key, rim, fill }, environment, envIntensity: 1.05,
    fog: new THREE.Fog(0x5f6b4a, 48, 240),
    look,
    board: { plate, lineColor: new THREE.Color(0.55, 0.38, 0.12), ringShape: 'oct', ringK: { floor: 0, top: 0.45 }, pipFace: { y: plateH * 0.5, z: 1.065, s: 0.62 } },
    nearRim: { dz: 1.35, y: 0.66 },
    backdrop: { height: 3.0, back: 10, topAngle: 21, seam: new THREE.Vector3(0, 3.3, fz1) },
    update(dt, t) { for (const u of updaters) u(dt, t); },
    setOvertime(k) { otK = Math.max(0, Math.min(1, k)); },
    // battle-7: fantasy-realm units scale up a little on their home arena (natural creature sizes read small beside the mechs)
    wideUnitK: FANTASY_UNIT_K_WIDE,
    // the bigger units in the far lane (TREANT, ELF SAGE at 1.12) need a taller fit box to clear the top HUD
    frameWide: { boxTop: 5.6 },
    unitScale(def, k = FANTASY_UNIT_K) { return def?.realm === 'fantasy' && def.body !== 'quadruped' ? k : 1; },
    crowd: { hype: (k) => backdrop.stir?.(k), wave: () => backdrop.stir?.(1) },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { for (const k in x) if (x[k]?.isTexture) x[k].dispose(); x.dispose(); }); });
      plateMat.map?.dispose(); plateMat.normalMap?.dispose(); plateMat.dispose();
      for (const d of disposables) d.dispose?.();
      forest.dispose?.();
      reflection.rt.dispose();
    },
  };
}

// Octagonal stone pedestal, flat faces on +-x / +-z, apothem ~1.06 (the board scales it by hexR / 1.3).
// Chamfered top edge, slightly flared foot. Top UVs planar (0..1 across), side UVs run round the perimeter.
function octPedestal(h) {
  const A = 1.06, Rv = A / Math.cos(Math.PI / 8);
  const prof = [[Rv * 1.03, 0], [Rv * 1.04, h * 0.1], [Rv * 1.0, h * 0.2], [Rv * 1.0, h * 0.8], [Rv * 0.94, h], [0, h]];
  const pos = [], nrm = [], uv = [];
  const ang = (k) => Math.PI / 8 + (k / 8) * Math.PI * 2;
  for (let k = 0; k < 8; k++) {
    const a0 = ang(k), a1 = ang(k + 1), am = (a0 + a1) / 2;
    for (let s = 0; s < prof.length - 1; s++) {
      const [r0, y0] = prof[s], [r1, y1] = prof[s + 1];
      const P = (rr, y, a) => [Math.cos(a) * rr, y, Math.sin(a) * rr];
      const p00 = P(r0, y0, a0), p10 = P(r0, y0, a1), p01 = P(r1, y1, a0), p11 = P(r1, y1, a1);
      const dr = r1 - r0, dy = y1 - y0, L = Math.hypot(dr, dy) || 1;
      const nx = Math.cos(am) * (dy / L), nz = Math.sin(am) * (dy / L), ny = -dr / L;
      const top = s === prof.length - 2;
      for (const p of [p00, p01, p10, p10, p01, p11]) {
        pos.push(...p); nrm.push(top ? 0 : nx, top ? 1 : ny, top ? 0 : nz);
        if (top || s === prof.length - 3) uv.push(p[0] / (Rv * 2.1) + 0.5, 0.5 - p[2] / (Rv * 2.1));
        else uv.push(((k + (p === p10 || p === p11 ? 1 : 0)) / 8) * 3, 0.03 + p[1] / h * 0.1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

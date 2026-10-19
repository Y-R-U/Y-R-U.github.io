import * as THREE from 'three';
import { box, merge } from '../geo.js';
import { rng } from '../../fx/textures.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// battle-8: the forest beyond the fantasy arena's side walls, for the wide (landscape) board and the D26 intro. Board-camera geometry
// (not the backdrop layer): instanced trees (trunks + lumpy canopies in the battle-7 style, near + far LOD), bushes, undergrowth cards,
// mossy rocks, broken ruin fragments, forest floor and low mist sheets. Depth fades into the mist by distance from the arena, so the
// outer rows melt into the backdrop's tree bands. ~8 draws. The back ~14 m behind the back wall stays open for the backdrop (arch, Rift).
const HAZE = new THREE.Color(0x87917a);

// aerial haze by distance from the arena centre (stable while the intro camera moves), plus a low ground mist band
function hazePatch(sh, { d0 = 11, d1 = 46, max = 0.85, color = HAZE, cz = -11 } = {}) {
  sh.uniforms.uHaze = { value: new THREE.Vector4(d0, d1, max, cz) };
  sh.uniforms.uHazeC = { value: color };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 fw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        vFW = (modelMatrix * fw).xyz; }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vFW; uniform vec4 uHaze; uniform vec3 uHazeC;
      float fh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float fn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(fh(i), fh(i+vec3(1,0,0)), f.x), mix(fh(i+vec3(0,1,0)), fh(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(fh(i+vec3(0,0,1)), fh(i+vec3(1,0,1)), f.x), mix(fh(i+vec3(0,1,1)), fh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      { float rr = length(vec2(vFW.x * 1.0, (vFW.z - uHaze.w) * 0.8));
        float hz = smoothstep(uHaze.x, uHaze.y, rr) * uHaze.z;
        float lowm = (1.0 - smoothstep(0.0, 2.6, vFW.y)) * smoothstep(uHaze.x * 0.8, uHaze.y * 0.7, rr) * 0.35;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeC, clamp(max(hz, lowm), 0.0, 1.0)); }`);
}
function withHaze(mat, key, extra, o) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r); extra?.(sh); hazePatch(sh, o); };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// a lumpy canopy: n lobes (coherent sum-of-sines lumps on icospheres, squashed), darker underneath (vertex colour)
function canopyGeometry(r, { lobes = 7, detail = 2 } = {}) {
  const parts = [], dv = new THREE.Vector3();
  for (let k = 0; k < lobes; k++) {
    const a = k / lobes * Math.PI * 2 + r() * 0.8, d = k === 0 ? 0 : 0.42 + r() * 0.22;
    const R = k === 0 ? 0.62 : 0.36 + r() * 0.18, ph = r() * 50;
    const g = new THREE.IcosahedronGeometry(R, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      dv.fromBufferAttribute(p, i).normalize();
      const n = Math.sin(dv.x * 5.1 + ph) * Math.sin(dv.y * 4.3 + ph * 1.3) * Math.sin(dv.z * 4.7 + ph * 0.7) * 0.5
              + Math.sin(dv.x * 11.0 + dv.z * 9.0 + ph) * 0.12 + Math.sin(dv.y * 13.0 - dv.x * 7.0 + ph) * 0.08;
      const f = R * (0.92 + n * 0.45);
      p.setXYZ(i, dv.x * f, dv.y * f * 0.78, dv.z * f);
    }
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const w = mergeVertices(g, 1e-4); g.dispose(); w.computeVertexNormals();
    w.translate(Math.cos(a) * d, k === 0 ? 0.12 : (r() - 0.35) * 0.4, Math.sin(a) * d);
    parts.push(w.toNonIndexed()); w.dispose();
  }
  const g = mergeGeometries(parts, false);
  for (const x of parts) x.dispose();
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 0.42 + 0.58 * THREE.MathUtils.smoothstep(y, -0.55, 0.55);
    c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// tapered, slightly gnarled trunk with a flared root foot; unit height (instances scale it), base radius 1
function trunkGeometry() {
  const g = new THREE.CylinderGeometry(0.45, 1, 1, 8, 5, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const flare = 1 + 0.9 * Math.pow(1 - y, 6) * (0.6 + 0.4 * Math.abs(Math.sin(a * 2.5))), wob = 1 + 0.12 * Math.sin(y * 9 + a * 3);
    p.setXYZ(i, x * flare * wob, y, z * flare * wob);
  }
  g.computeVertexNormals();
  return g;
}

export function buildFantasyForest(engine, { hw, fz0, fz1, bz0, seed = 7, stone, foliage }) {
  const tier = engine.quality.name, lowT = tier === 'low', medT = tier === 'med';
  const K = lowT ? 0.42 : medT ? 0.68 : 1; // instance budget per tier
  const r = rng(seed * 53 + 17);
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
  const zNear = fz0 + 12, zFar = fz1 - 14; // the forest's depth along the arena; behind zFar (and between the back corners) is backdrop
  const xIn = hw + 6, xOut = hw + 42;

  // --- forest floor: leaf litter / moss / soil patches, hazed ---
  const groundMat = withHaze(new THREE.MeshStandardMaterial({ color: 0x232d19, roughness: 1, metalness: 0 }), 'forest-floor', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float n = fn(vFW * 0.18) * 0.6 + fn(vFW * 0.7) * 0.3 + fn(vFW * 3.1) * 0.1;
        vec3 litter = vec3(0.16, 0.11, 0.06), moss = vec3(0.08, 0.13, 0.04);
        diffuseColor.rgb = mix(diffuseColor.rgb, litter, smoothstep(0.55, 0.75, n) * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, moss, smoothstep(0.42, 0.25, n) * 0.7);
        diffuseColor.rgb *= 0.75 + 0.5 * fn(vFW * 6.0); }`);
  });
  {
    const gg = [];
    for (const s of [-1, 1]) {
      const x0 = hw + 6.8, x1 = xOut + 30, g = new THREE.PlaneGeometry(x1 - x0, zNear + 30 - (zFar - 4), 8, 8);
      g.rotateX(-Math.PI / 2); g.translate(s * (x0 + x1) / 2, -0.03, (zNear + 30 + zFar - 4) / 2); gg.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(gg), groundMat));
    for (const g of gg) g.dispose();
  }

  // --- trees: jittered rows, small + darker by the walls, taller + hazier outward; near LOD (detailed canopy) for the inner rows ---
  const near = [], far = [], trunks = [];
  const rowStep = 4.6;
  for (const s of [-1, 1]) {
    for (let row = 0, x = xIn; x < xOut; row++, x += rowStep * (1 + row * 0.04)) {
      for (let z = zNear; z > zFar; z -= 4.4 + r() * 1.6) {
        if (r() > K * (row === 0 ? 0.75 : 0.95)) continue;
        const tx = s * (x + (r() - 0.5) * 3.2), tz = z + (r() - 0.5) * 2.4;
        const big = 0.85 + row * 0.07 + r() * 0.45;
        // nearer the camera the trees are shorter so the board's near corners stay readable
        const nearK = THREE.MathUtils.clamp((tz - 2) / 18, 0, 1);
        const th = (3.2 + r() * 3.5) * big * (1 - 0.35 * nearK), cs = (2.6 + r() * 1.6) * big * (1 - 0.3 * nearK);
        const tr = 0.32 + r() * 0.22 * big;
        trunks.push([tx, tz, tr, th + cs * 0.3, r() * 6.28]);
        (row < 2 ? near : far).push([tx, th + cs * 0.35, tz, cs, r() * 6.28, row]);
        // a second, lower lobe cluster hanging off the side for an irregular crown
        if (r() < 0.45) (row < 2 ? near : far).push([tx + (r() - 0.5) * cs, th + cs * (r() * 0.3 - 0.1), tz + (r() - 0.5) * cs, cs * (0.55 + r() * 0.2), r() * 6.28, row]);
      }
    }
    // back corner clusters: close the gap between the side forest and the backdrop opening
    for (let i = 0; i < 10 * K; i++) {
      const tx = s * (hw + 5 + r() * 9), tz = fz1 - 3 - r() * 11, cs = 3.2 + r() * 2.2, th = 4 + r() * 4;
      trunks.push([tx, tz, 0.4 + r() * 0.2, th + cs * 0.3, r() * 6.28]);
      (r() < 0.5 ? near : far).push([tx, th + cs * 0.35, tz, cs, r() * 6.28, 1]);
    }
    // bushes: low lobe clusters filling between trunks (far LOD mesh)
    for (let i = 0; i < 40 * K; i++) {
      const tx = s * (xIn - 1 + Math.pow(r(), 0.8) * (xOut - xIn)), tz = zNear + 6 - r() * (zNear + 6 - zFar);
      const cs = 1.1 + r() * 1.6;
      far.push([tx, cs * 0.25, tz, cs, r() * 6.28, (Math.abs(tx) - xIn) / rowStep]);
    }
  }
  const barkMat = withHaze(new THREE.MeshStandardMaterial({ color: 0x4d4032, roughness: 0.95, metalness: 0, flatShading: true }), 'forest-bark');
  const trunkIM = new THREE.InstancedMesh(trunkGeometry(), barkMat, trunks.length);
  trunks.forEach(([x, z, rad, h, ry], i) => { m4.compose(pv.set(x, 0, z), q.setFromEuler(e.set((r() - 0.5) * 0.08, ry, (r() - 0.5) * 0.08)), sc.set(rad, h, rad)); trunkIM.setMatrixAt(i, m4); });
  group.add(trunkIM);

  const leafMat = withHaze(new THREE.MeshStandardMaterial({ color: 0x5c6648, vertexColors: true, roughness: 0.95, metalness: 0 }), 'forest-leaf', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float n = fn(vFW * 0.45) * 0.55 + fn(vFW * 1.7) * 0.3 + fn(vFW * 5.0) * 0.15;
        diffuseColor.rgb *= 0.45 + 1.25 * n; diffuseColor.g *= 0.95 + 0.15 * fn(vFW * 0.2); }`);
  });
  const crowns = (list, geo) => {
    const im = new THREE.InstancedMesh(geo, leafMat, Math.max(1, list.length));
    list.forEach(([x, y, z, s, ry, row], i) => {
      m4.compose(pv.set(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.25, ry, (r() - 0.5) * 0.25)), sc.set(s * (0.9 + r() * 0.25), s * (0.8 + r() * 0.35), s * (0.9 + r() * 0.25)));
      im.setMatrixAt(i, m4);
      // hue / value jitter per crown: olive to deep green, a few yellowed
      col.setHSL(0.21 + r() * 0.08 + (r() < 0.08 ? -0.05 : 0), 0.25 + r() * 0.2, 0.2 + r() * 0.13);
      im.setColorAt(i, col);
    });
    im.count = list.length;
    return im;
  };
  group.add(crowns(near, canopyGeometry(rng(seed + 3), { lobes: lowT ? 4 : 5, detail: lowT ? 1 : 2 })));
  group.add(crowns(far, canopyGeometry(rng(seed + 5), { lobes: 4, detail: 1 })));

  // leaf-cluster cards on the crown surfaces (foliage atlas tile 0) break up the lobe silhouettes, as on the backdrop giants
  const cardList = [];
  const dv = new THREE.Vector3();
  for (const [list, n] of [[near, lowT ? 4 : 9], [far, lowT ? 1 : 3]]) for (const [x, y, z, s] of list) {
    if (y < s * 0.4) continue; // bushes
    for (let k = 0; k < n; k++) {
      dv.set(r() - 0.5, r() * 0.9 - 0.15, r() - 0.5).normalize();
      cardList.push([x + dv.x * s * 0.85, y + dv.y * s * 0.62, z + dv.z * s * 0.85, s * (0.45 + r() * 0.3)]);
    }
  }
  const cGeo = new THREE.PlaneGeometry(1, 1);
  { const uv = cGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / 3); }
  const cMat = withHaze(new THREE.MeshStandardMaterial({ map: foliage, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xa3b477 }), 'forest-cards', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  });
  const cIM = new THREE.InstancedMesh(cGeo, cMat, Math.max(1, cardList.length));
  cardList.forEach(([x, y, z, s], i) => {
    m4.compose(pv.set(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 1.2, r() * 6.28, r() * 6.28)), sc.set(s, s, s)); cIM.setMatrixAt(i, m4);
    col.setHSL(0.19 + r() * 0.08, 0.3 + r() * 0.2, 0.4 + r() * 0.2); cIM.setColorAt(i, col);
  });
  cIM.count = cardList.length;
  group.add(cIM);

  // --- undergrowth: ferns + grass cards (the arena's foliage atlas) along the inner rows and under the trees ---
  const nU = Math.round(520 * K);
  const uGeo = new THREE.PlaneGeometry(1, 1); uGeo.translate(0, 0.5, 0);
  { const n = uGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.9, 0.42); }
  const aTile = new THREE.InstancedBufferAttribute(new Float32Array(nU), 1);
  uGeo.setAttribute('aTile', aTile);
  const uMat = withHaze(new THREE.MeshStandardMaterial({ map: foliage, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color: 0x56663f }), 'forest-under', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aTile) / 3.0;');
  });
  const under = new THREE.InstancedMesh(uGeo, uMat, nU);
  let ui = 0;
  while (ui < nU - 1) {
    const s = r() < 0.5 ? -1 : 1, x = s * (hw + 4.6 + Math.pow(r(), 1.6) * 30), z = zNear + 4 - r() * (zNear + 4 - zFar);
    const tile = r() < 0.55 ? 2 : 1, k = (tile === 2 ? 1.0 : 0.6) * (0.7 + r() * 0.9), ry = r() * Math.PI;
    for (const a of [ry, ry + Math.PI / 2]) { m4.compose(pv.set(x, 0, z), q.setFromEuler(e.set(0, a, 0)), sc.set(k, k, k)); under.setMatrixAt(ui, m4); aTile.setX(ui++, tile); }
  }
  under.count = ui;
  group.add(under);

  // --- rocks (mossy, instanced) and ruin fragments (toppled drums, wall stubs, a fallen lintel; one merged draw) near the walls ---
  const nRock = Math.round(70 * K);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), stone, nRock);
  for (let i = 0; i < nRock; i++) {
    const s = r() < 0.5 ? -1 : 1, x = s * (hw + 4.8 + Math.pow(r(), 1.4) * 22), z = zNear - r() * (zNear - zFar), k = 0.4 + Math.pow(r(), 2.2) * 2.2;
    m4.compose(pv.set(x, k * 0.15, z), q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3)), sc.set(k * (0.8 + r() * 0.6), k * (0.5 + r() * 0.4), k * (0.8 + r() * 0.6)));
    rocks.setMatrixAt(i, m4);
  }
  group.add(rocks);
  const G = [];
  const nFrag = lowT ? 5 : 9;
  for (const s of [-1, 1]) for (let i = 0; i < nFrag; i++) {
    const x = s * (hw + 6 + r() * 16), z = zNear - 4 - r() * (zNear - 4 - zFar - 4), ry = r() * Math.PI, kind = r();
    if (kind < 0.35) { // toppled column drums, rolled apart
      for (let k = 0; k < 2 + (r() * 3 | 0); k++) {
        const c = new THREE.CylinderGeometry(0.55, 0.55, 0.85, 10); c.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.2); c.rotateY(ry + (r() - 0.5) * 0.5);
        c.translate(x + Math.cos(ry) * k * 1.0 + (r() - 0.5) * 0.4, 0.5, z - Math.sin(ry) * k * 1.0 + (r() - 0.5) * 0.4); G.push(c);
      }
    } else if (kind < 0.75) { // a broken wall stub: a few courses, ragged top
      const len = 2 + r() * 3.5, hmax = 1 + r() * 2.4;
      for (let y = 0; y < hmax; y += 0.5) for (let t = 0; t < len;) {
        const bl = 0.6 + r() * 0.6;
        if (y < hmax * (0.4 + 0.6 * Math.sin((t / len) * Math.PI + r() * 0.3))) {
          const px = x + Math.cos(ry) * (t + bl / 2), pz = z - Math.sin(ry) * (t + bl / 2);
          G.push(box(bl - 0.05, 0.46, 0.8, px, y + 0.23, pz, ry + (r() - 0.5) * 0.06));
        }
        t += bl;
      }
    } else { // a broken pillar stump with a fallen lintel leaning on it
      const h = 1.2 + r() * 2.2;
      G.push(box(1.4, 0.35, 1.4, x, 0.175, z));
      const c = new THREE.CylinderGeometry(0.55, 0.6, h, 10); c.translate(x, 0.35 + h / 2, z); G.push(c);
      const l = new THREE.BoxGeometry(3.2, 0.5, 0.75); l.rotateZ(s * 0.35); l.rotateY(ry); l.translate(x + Math.cos(ry) * 1.3, 0.6 + h * 0.35, z - Math.sin(ry) * 1.3); G.push(l);
    }
  }
  const frags = new THREE.Mesh(merge(G), stone);
  group.add(frags);

  // --- low mist sheets over the forest floor (two heights), thicker away from the arena; one transparent draw ---
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: HAZE.clone().multiplyScalar(1.05) }, uIn: { value: hw + 5 } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uIn; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * 0.08 + vec2(uTime * 0.012, vW.y * 3.0);
        float n = n2(p) * 0.6 + n2(p * 2.7 - uTime * 0.02) * 0.4;
        float out_ = smoothstep(uIn, uIn + 22.0, abs(vW.x));
        float a = smoothstep(0.3, 0.75, n) * (0.18 + 0.5 * out_) * smoothstep(uIn - 1.0, uIn + 4.0, abs(vW.x));
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  {
    const MG = [];
    for (const s of [-1, 1]) for (const y of [0.9, 2.6]) {
      const x0 = hw + 5, x1 = xOut + 25, g = new THREE.PlaneGeometry(x1 - x0, zNear - zFar + 8);
      g.rotateX(-Math.PI / 2); g.translate(s * (x0 + x1) / 2, y, (zNear + zFar) / 2); MG.push(g);
    }
    const mist = new THREE.Mesh(mergeGeometries(MG), mistMat);
    for (const g of MG) g.dispose();
    mist.renderOrder = 3;
    group.add(mist);
  }

  for (const o of group.children) { o.castShadow = false; o.receiveShadow = false; }
  return {
    group,
    update(dt, t) { mistMat.uniforms.uTime.value = t; },
    counts: { cards: cardList.length, trees: trunks.length, crownsNear: near.length, crownsFar: far.length, under: ui, rocks: nRock },
  };
}

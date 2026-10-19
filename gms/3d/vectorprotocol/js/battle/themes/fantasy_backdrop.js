import * as THREE from 'three';
import { box, merge, toLayer, BACKDROP_LAYER } from '../geo.js';
import { rng } from '../../fx/textures.js';
import { stoneBlockTextures, treelineTexture, foliageTexture } from '../../fx/textures_fantasy.js';
import { mossy } from './fantasy.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Everything beyond the back wall of the fantasy arena, seen by the near-level backdrop camera (BACKDROP_LAYER):
// misty sky with a violet Rift tear (the sci-fi world bleeding through), layered forest silhouettes, giant ancient trees,
// ruined towers and an archway, god rays, ground mist and fireflies.
export function buildFantasyBackdrop(engine, { iW, fz0, fz1, seed = 7 }) {
  const tier = engine.quality;
  const lowT = tier.name === 'low';
  const r = rng(seed * 37 + 11);
  const group = new THREE.Group();
  const updaters = [];
  const camZ = 15; // the backdrop camera sits ~10 m behind the near edge (themes' backdrop.back)
  const stir = { k: 0 };

  // --- sky: warm haze low, cool teal high, sun glow up-left, the Rift up-right ---
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float y = vD.y;
        vec3 hor = vec3(0.78, 0.74, 0.52), mid = vec3(0.42, 0.55, 0.5), top = vec3(0.16, 0.24, 0.25);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y));
        c = mix(c, top, smoothstep(0.2, 0.7, y));
        vec2 uv = vec2(atan(vD.x, -vD.z) * 2.5, y * 6.0);
        float cl = n2(uv * 1.2 + vec2(uTime * 0.008, 0.0)) * 0.6 + n2(uv * 2.9) * 0.4;
        c = mix(c, c * 1.18 + vec3(0.04, 0.03, 0.0), smoothstep(0.5, 0.85, cl) * 0.6);
        vec3 sd = normalize(vec3(-0.42, 0.3, -1.0));
        float sun = max(0.0, dot(vD, sd));
        c += vec3(1.0, 0.82, 0.5) * (pow(sun, 8.0) * 0.55 + pow(sun, 120.0) * 1.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);
  updaters.push((dt, t) => { skyMat.uniforms.uTime.value = t; });

  // --- the Rift: a jagged tear in the sky (the sci-fi world bleeding through). battle-7: it sat under the top HUD and was additive over a
  // bright sky, so it barely read. Now it hangs in the visible sky gap between the canopies, with a dark indigo void (normal blend) holding
  // cyan hex circuitry, a hot magenta-white lip that blooms, and a soft violet halo staining the clouds around it.
  const riftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uK: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uK; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      float n1(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float y = p.y;
        // spine of the tear wanders (jagged), width bulges in the middle and pinches at the ends
        float cx = (n1(y * 2.2 + 1.7) - 0.5) * 0.3 + (n1(y * 9.0) - 0.5) * 0.08 + (n1(y * 37.0) - 0.5) * 0.035;
        float wdt = pow(1.0 - y * y, 1.6) * (0.34 + 0.06 * n1(y * 5.0 + uTime * 0.25)) + (n1(y * 29.0 + 3.0) - 0.5) * 0.04 * (1.0 - y * y);
        float d = abs(p.x - cx) - wdt;
        float core = smoothstep(0.01, -0.03, d);
        float edge = exp(-abs(d) * 34.0);
        float halo = exp(-max(d, 0.0) * 3.2) * (1.0 - y * y);
        // inside: hex circuitry of the other world, scrolling, with a pulse travelling up
        vec2 g = vUv * vec2(18.0, 38.0) + vec2(0.0, uTime * 0.2);
        vec2 f = abs(fract(g) - 0.5);
        float grid = smoothstep(0.42, 0.5, max(f.x, f.y)) * core;
        float pulse = smoothstep(0.25, 0.0, abs(fract(vUv.y * 1.5 - uTime * 0.3) - 0.5)) * core;
        float flick = 0.8 + 0.2 * sin(uTime * 3.0 + y * 8.0);
        vec3 c = vec3(0.05, 0.02, 0.14) * core + vec3(0.25, 1.4, 2.2) * grid * (0.35 + pulse) * uK
               + vec3(2.4, 0.9, 3.4) * edge * flick * uK + vec3(0.55, 0.22, 0.9) * halo * 0.45 * uK;
        float a = clamp(core * 0.95 + edge + halo * 0.3, 0.0, 1.0);
        gl_FragColor = vec4(c / max(a, 0.05), a);
      }`,
  });
  // ~85 m out: in front of the forest bands (95-260 m) so they can't hide it, behind the ruins and the giant trees
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(11, 16), riftMat);
  rift.position.set(5, 17.5, -70); rift.lookAt(0, 3, camZ); rift.rotateZ(-0.3);
  rift.renderOrder = -8;
  group.add(rift);
  updaters.push((dt, t) => { riftMat.uniforms.uTime.value = t; });

  // --- far ground (fogged) so anything below the horizon reads as forest floor ---
  const farGround = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x2c3620, roughness: 1, metalness: 0 }));
  farGround.rotation.x = -Math.PI / 2; farGround.position.set(0, -0.05, fz1 - 330);
  group.add(farGround);

  // --- forest silhouettes: three curved bands, darker + taller near, hazier far (fog does the depth) ---
  const tl = treelineTexture(seed + 1);
  // battle-9 (QL11): the bands were alpha-tested, solid dark green against the pale horizon: from the intro pose the near band read as a
  // flat hill with a hard, stair-stepped top above the ruins wall. Now alpha-blended (mip-filtered soft canopy edges), their upper part
  // hazes toward the horizon sky colour (aerial perspective), and the arc ends fade out. Drawn far -> near (renderOrder), no depth write.
  const HAZE = new THREE.Color(0.62, 0.62, 0.46);
  const band = (rad, hgt, color, rep, haze0, haze, order, yb = -1) => {
    const g = new THREE.CylinderGeometry(rad, rad, hgt, 48, 1, true, Math.PI - 1.15, 2.3);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    g.translate(0, hgt / 2 + yb, camZ);
    const mat = new THREE.MeshBasicMaterial({ map: tl, color, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHaze = { value: HAZE }; sh.uniforms.uHz = { value: new THREE.Vector3(haze, rep, haze0) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBand;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBand = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vBand; uniform vec3 uHaze; uniform vec3 uHz;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.a = smoothstep(0.2, 0.75, diffuseColor.a);
          float ends = smoothstep(0.0, 0.12, vBand.x / uHz.y) * smoothstep(1.0, 0.88, vBand.x / uHz.y);
          diffuseColor.a *= ends * smoothstep(0.99, 0.8, vBand.y); // the canvas clips the tallest crowns flat at its top row (and wraps)
          diffuseColor.rgb = mix(diffuseColor.rgb, uHaze, uHz.z + (1.0 - uHz.z) * uHz.x * smoothstep(0.25, 1.0, vBand.y));`);
    };
    mat.customProgramCacheKey = () => 'fbBand';
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order;
    return m;
  };
  // own haze instead of scene fog (fog 0x5f6b4a is far darker than the horizon sky, which made the far bands dark cut-outs)
  group.add(band(260, 50, 0x93a088, 5, 0.42, 0.6, -9), band(160, 34, 0x5d7050, 4, 0.2, 0.35, -8), band(95, 21, 0x2c3d22, 3, 0.0, 0.18, -7));

  // --- ruins beyond the wall: broken towers, a wall run with an arch, columns (stone blocks, mossy) ---
  const st = stoneBlockTextures(seed + 5, 128);
  const stoneMat = mossy(new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normal, color: 0xa8a294, roughness: 0.95, metalness: 0 }),
    { amount: 0.9, base: 0.7, scale: 0.6 });
  const G = [];
  const tower = (x, z, w, d, h, broken = 0.5) => {
    for (let y = 0; y < h; y += 0.9) {
      const k = y / h;
      for (const [sx, sz, len, ry] of [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]]) {
        const top = h - (sx + sz > 0 ? broken * h * 0.45 : 0) * (0.5 + 0.5 * Math.sin(len + y));
        if (y > top) continue;
        const win = y > h * 0.45 && y < h * 0.62 && sz > 0 ? 0 : 1; // a window gap in the face toward the arena
        for (let t = -len / 2; t < len / 2 - 0.1;) {
          const bl = Math.min(len / 2 - t, 1.0 + r() * 0.8);
          if (win || Math.abs(t + bl / 2) > 0.9) {
            const px = x + sx + (ry ? 0 : t + bl / 2), pz = z + sz + (ry ? t + bl / 2 : 0);
            G.push(box(ry ? 0.8 : bl - 0.06, 0.86, ry ? bl - 0.06 : 0.8, px, y + 0.43, pz));
          }
          t += bl;
        }
      }
      if (k > 1) break;
    }
  };
  tower(-13, fz1 - 9, 5, 5, 13, 0.6);
  tower(15, fz1 - 13, 4.5, 4.5, 10, 0.8);
  tower(-26, fz1 - 26, 6, 6, 17, 0.4);
  // archway far in the middle (two piers + voussoirs), god rays fall through it
  {
    const ax = 2, az = fz1 - 34, span = 9, ph = 7;
    for (const s of [-1, 1]) for (let y = 0; y < ph; y += 1) G.push(box(2.2, 0.96, 2.2, ax + s * span / 2, y + 0.48, az));
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * k / 10;
      if (k > 6 && k < 9) continue; // a few stones fallen out of the arch
      const g = new THREE.BoxGeometry(1.5, 1.1, 2.0); g.rotateZ(a - Math.PI / 2); g.translate(ax + Math.cos(a) * span / 2, ph + Math.sin(a) * span / 2, az);
      G.push(g);
    }
    // wall run either side of the arch
    for (const s of [-1, 1]) for (let x = 1.6; x < 16; x += 1.4) {
      const h = 6 - x * 0.28 + Math.sin(x * 2.1) * 1.4;
      for (let y = 0; y < h; y += 0.95) G.push(box(1.35, 0.9, 1.4, ax + s * (span / 2 + x), y + 0.45, az + s * x * 0.15));
    }
  }
  // columns behind the back wall
  for (const [x, z, h] of [[-7, fz1 - 6, 7], [7.5, fz1 - 7, 4.5], [-4, fz1 - 18, 9], [9, fz1 - 22, 8], [-17, fz1 - 15, 5]]) {
    G.push(box(1.9, 0.5, 1.9, x, 0.25, z));
    for (let y = 0.5; y < h; y += 1.0) { const c = new THREE.CylinderGeometry(0.66, 0.7, 0.97, 10); c.translate(x, y + 0.5, z); G.push(c); }
  }
  const ruins = new THREE.Mesh(merge(G), stoneMat);
  group.add(ruins);

  // --- giant ancient trees framing the top corners: gnarled trunks, buttress roots, dark canopy masses ---
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3d2e, roughness: 0.95, metalness: 0, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b2a10, roughness: 0.95, metalness: 0 });
  // leafy mottling in world space (clumps of lighter / darker foliage) so the lobes don't read as smooth plastic
  leafMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLW;
      float lh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float ln(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(lh(i), lh(i+vec3(1,0,0)), f.x), mix(lh(i+vec3(0,1,0)), lh(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(lh(i+vec3(0,0,1)), lh(i+vec3(1,0,1)), f.x), mix(lh(i+vec3(0,1,1)), lh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = ln(vLW * 0.45) * 0.55 + ln(vLW * 1.7) * 0.3 + ln(vLW * 5.0) * 0.15;
          diffuseColor.rgb *= 0.45 + 1.25 * n; diffuseColor.g *= 0.95 + 0.15 * ln(vLW * 0.2); }`);
  };
  leafMat.customProgramCacheKey = () => 'fantasy-leaf';
  // canopy detail: leaf-cluster cards (tile 0 of the foliage atlas) over dark cores, one instanced draw
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  { const uv = cardGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) / 3); }
  const cardMat = new THREE.MeshStandardMaterial({ map: foliageTexture(seed + 3), color: 0x6f8a4a, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  cardMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); };
  const cards = [];
  const TG = [], LG = [];
  const gnarl = (g, k) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(y * 1.3 + x * 2.0) * 0.5 + Math.sin(y * 0.7 + z * 2.6) * 0.5;
      p.setXYZ(i, x * (1 + n * k), y, z * (1 + n * k));
    }
    g.computeVertexNormals();
    return g;
  };
  const tree = (x, z, rb, h, canopyY, canopyR) => {
    TG.push(gnarl(new THREE.CylinderGeometry(rb * 0.55, rb, h, 12, 8), 0.18).translate(x, h / 2, z));
    for (let k = 0; k < 6; k++) { // roots
      const a = k / 6 * Math.PI * 2 + r();
      const g = new THREE.CylinderGeometry(rb * 0.12, rb * 0.42, rb * 2.6, 6);
      g.rotateZ(1.0); g.rotateY(a); g.translate(x + Math.cos(a) * rb * 1.1, rb * 0.45, z - Math.sin(a) * rb * 1.1);
      TG.push(g);
    }
    for (let k = 0; k < 4; k++) { // big limbs
      const a = r() * Math.PI * 2, len = canopyR * (0.6 + r() * 0.5);
      const g = new THREE.CylinderGeometry(rb * 0.12, rb * 0.3, len, 7);
      g.translate(0, len / 2, 0); g.rotateZ(0.9 + r() * 0.4); g.rotateY(a); g.translate(x, h * 0.75, z);
      TG.push(g);
    }
    // battle-7: canopy lobes were detail-2 icosahedra with per-vertex random scale (faceted, low-poly at the top of the screen).
    // Now coherent lumps (sum of sines on the sphere direction) over a detail-3 sphere, squashed, smooth normals.
    for (let k = 0; k < 12; k++) {
      const a = r() * Math.PI * 2, d = r() * canopyR * 0.9, R = canopyR * (0.35 + r() * 0.3), ph = r() * 50;
      const g = new THREE.IcosahedronGeometry(R, lowT ? 2 : 3);
      const pp = g.attributes.position, dv = new THREE.Vector3();
      for (let i = 0; i < pp.count; i++) {
        dv.fromBufferAttribute(pp, i).normalize();
        const n = Math.sin(dv.x * 5.1 + ph) * Math.sin(dv.y * 4.3 + ph * 1.3) * Math.sin(dv.z * 4.7 + ph * 0.7) * 0.5
                + Math.sin(dv.x * 11.0 + dv.z * 9.0 + ph) * 0.12 + Math.sin(dv.y * 13.0 - dv.x * 7.0 + ph) * 0.08;
        const f = R * (0.92 + n * 0.45);
        pp.setXYZ(i, dv.x * f, dv.y * f * 0.72, dv.z * f);
      }
      // battle-8: weld before computing normals (the icosphere is non-indexed, so the lobes were flat-shaded facets)
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      const w = mergeVertices(g, 1e-4); g.dispose(); w.computeVertexNormals();
      w.translate(x + Math.cos(a) * d, canopyY + (r() - 0.3) * canopyR * 0.5, z + Math.sin(a) * d * 0.6);
      LG.push(w);
    }
    for (let k = 0; k < (lowT ? 24 : 90); k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * canopyR * 1.05;
      cards.push([x + Math.cos(a) * d, canopyY - canopyR * 0.45 + r() * canopyR * 0.8, z + Math.sin(a) * d * 0.6 + canopyR * 0.3, canopyR * (0.3 + r() * 0.3), r() * 6.28]);
    }
  };
  tree(-19, fz1 - 14, 2.6, 22, 24, 13);
  tree(21, fz1 - 18, 2.9, 24, 25, 14);
  tree(-36, fz1 - 40, 3.2, 26, 28, 15);
  tree(40, fz1 - 46, 3.4, 28, 29, 16);
  tree(-26, fz1 - 75, 3.6, 30, 30, 15);
  group.add(new THREE.Mesh(merge(TG), barkMat), new THREE.Mesh(merge(LG), leafMat));
  {
    const im = new THREE.InstancedMesh(cardGeo, cardMat, cards.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    cards.forEach(([x, y, z, s, rz], i) => { m4.compose(pv.set(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.6, (r() - 0.5) * 0.8, rz)), sc.set(s, s, s)); im.setMatrixAt(i, m4); });
    group.add(im);
  }

  // --- ivy hanging from the ruins + trees: cheap dark streak quads ---
  // (skipped on low: the tree-line bands already carry the green)

  // --- god rays: long additive shafts falling from the sun gap toward the arch ---
  const rayMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.5) } },
    vertexShader: `attribute float aPh; varying vec2 vUv; varying float vPh; void main(){ vUv = uv; vPh = aPh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vPh;
      void main(){
        float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float fl = 0.65 + 0.35 * sin(uTime * 0.35 + vPh * 6.0);
        gl_FragColor = vec4(uColor * across * across * along * fl * 0.5, 1.0);
      }`,
  });
  {
    const RG = [], ph = [];
    const nR = lowT ? 3 : 7;
    for (let i = 0; i < nR; i++) {
      const top = new THREE.Vector3(-55 + i * 7 + r() * 4, 70, fz1 - 120);
      const bot = new THREE.Vector3(-8 + i * 5.5 + r() * 3, -2, fz1 - 22 - r() * 16);
      const w0 = 3 + r() * 5, w1 = 7 + r() * 10;
      const g = new THREE.PlaneGeometry(1, 1);
      // place the quad corners: top edge narrow, bottom wide, facing the camera roughly
      const p = g.attributes.position;
      const side = new THREE.Vector3(1, 0, 0.12).normalize();
      const set = (idx, base, w, sgn) => { const v = base.clone().addScaledVector(side, sgn * w / 2); p.setXYZ(idx, v.x, v.y, v.z); };
      // PlaneGeometry order: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right (uv y 1 = top)
      set(0, top, w0, -1); set(1, top, w0, 1); set(2, bot, w1, -1); set(3, bot, w1, 1);
      const uv = g.attributes.uv; uv.setXY(0, 0, 0); uv.setXY(1, 1, 0); uv.setXY(2, 0, 1); uv.setXY(3, 1, 1);
      g.setAttribute('aPh', new THREE.Float32BufferAttribute([i, i, i, i], 1));
      RG.push(g); ph.push(i);
    }
    const rays = new THREE.Mesh(mergeKeep(RG), rayMat);
    rays.renderOrder = 5; rays.frustumCulled = false;
    group.add(rays);
  }
  updaters.push((dt, t) => { rayMat.uniforms.uTime.value = t; });

  // --- ground mist: soft drifting bands between the depth layers ---
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.62, 0.68, 0.52) } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float n = n2(vec2(vW.x * 0.05 + uTime * 0.02 + vW.z * 0.01, vUv.y * 2.0)) * 0.6 + n2(vec2(vW.x * 0.13 - uTime * 0.03, vUv.y * 4.0)) * 0.4;
        float a = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.4, vUv.y) * smoothstep(0.25, 0.75, n);
        gl_FragColor = vec4(uColor, a * 0.55);
      }`,
  });
  {
    const MG = [];
    for (const [z, y, h] of [[fz1 - 6, 0.2, 5], [fz1 - 16, 0.5, 7], [fz1 - 32, 0.6, 10], [fz1 - 60, 1, 14], [fz1 - 100, 1, 20]]) {
      const g = new THREE.PlaneGeometry(240, h); g.translate(0, y + h / 2, z); MG.push(g);
    }
    const mist = new THREE.Mesh(merge(MG), mistMat);
    mist.renderOrder = 4; mist.frustumCulled = false;
    group.add(mist);
  }
  updaters.push((dt, t) => { mistMat.uniforms.uTime.value = t; });

  // --- fireflies / pollen in the backdrop ---
  const nF = lowT ? 40 : 110;
  const fp = new Float32Array(nF * 3), fs = new Float32Array(nF * 2);
  for (let i = 0; i < nF; i++) { fp[i * 3] = (r() - 0.5) * 70; fp[i * 3 + 1] = 0.5 + r() * 14; fp[i * 3 + 2] = fz1 - 3 - r() * 45; fs[i * 2] = r() * 100; fs[i * 2 + 1] = 0.5 + r(); }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 2));
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uK: { value: 1 } },
    vertexShader: `attribute vec2 aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ float t = uTime * aSeed.y + aSeed.x;
        vec3 p = position + vec3(sin(t * 0.6) * 1.2, sin(t * 0.9) * 0.8, cos(t * 0.45) * 1.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(0.1, 1.0, sin(t * 2.0) * 0.5 + 0.5);
        gl_PointSize = 0.3 * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uK; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
      gl_FragColor = vec4(vec3(2.0, 2.4, 0.7) * exp(-d * d * 4.0) * vA * uK, 1.0); }`,
  });
  const fl = new THREE.Points(fg, fMat); fl.frustumCulled = false; fl.renderOrder = 6;
  group.add(fl);
  const v2 = new THREE.Vector2();
  updaters.push((dt, t) => {
    fMat.uniforms.uTime.value = t; fMat.uniforms.uScale.value = engine.renderer.getDrawingBufferSize(v2).y * 0.55;
    stir.k = Math.max(0, stir.k - dt * 0.8);
    fMat.uniforms.uK.value = 1 + stir.k * 1.5; riftMat.uniforms.uK.value = 1 + stir.k * 0.8;
  });

  toLayer(group, BACKDROP_LAYER);
  return { group, update(dt, t) { for (const u of updaters) u(dt, t); },
    // big moments (crits, kills, Overdrive, victory): the Rift flares and the fireflies swell for a moment
    stir(k = 0.5) { stir.k = Math.min(1.5, stir.k + k); } };
}

// merge keeping a custom float attribute (geo.js merge() strips everything but position/normal/uv)
function mergeKeep(list) {
  const out = new THREE.BufferGeometry();
  const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(clean[0].attributes);
  for (const n of names) {
    const size = clean[0].attributes[n].itemSize;
    const arr = new Float32Array(clean.reduce((s, g) => s + g.attributes[n].count * size, 0));
    let o = 0; for (const g of clean) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) g.dispose();
  return out;
}

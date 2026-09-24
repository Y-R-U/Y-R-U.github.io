import * as THREE from 'three';
import { pathX, fbm, noise2, rng, smooth, mat, globalU, glowTexture, cloudTexture, rimify } from './util.js';

export const CHUNK = 50;
const glowTex = glowTexture();
const cloudTex = cloudTexture();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function windify(m, amp = 0.12, height = 0.5) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = globalU.uTime;
    sh.uniforms.uRim = globalU.uRim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hh = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float wv = sin(uTime * 1.7 + wp.x * 0.25 + wp.z * 0.18) + 0.5 * sin(uTime * 3.1 + wp.z * 0.5);
        transformed.x += wv * ${amp.toFixed(3)} * hh * hh;
        transformed.z += cos(uTime * 1.2 + wp.x * 0.3) * ${(amp * 0.5).toFixed(3)} * hh * hh;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uRim * 0.05 * pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 2.0);`);
  };
  m.customProgramCacheKey = () => 'wind' + amp;
  return m;
}

const GEO = (() => {
  const blade = new THREE.PlaneGeometry(0.09, 0.55, 1, 3);
  blade.translate(0, 0.275, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) / 0.6));
  blade.computeVertexNormals();
  const reed = new THREE.ConeGeometry(0.04, 1.6, 4); reed.translate(0, 0.8, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 6); trunk.translate(0, 1.2, 0);
  const tallTrunk = new THREE.CylinderGeometry(0.5, 1.1, 30, 7, 6); tallTrunk.translate(0, 15, 0);
  const tp = tallTrunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 0.25) * 0.8); tp.setZ(i, tp.getZ(i) + Math.cos(y * 0.18) * 0.6); }
  tallTrunk.computeVertexNormals();
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const pine = new THREE.ConeGeometry(1, 2.2, 7); pine.translate(0, 1.1, 0);
  const pad = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12);
  const flower = new THREE.IcosahedronGeometry(0.07, 0);
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const mush = new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stem = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5); stem.translate(0, 0.15, 0);
  const thorn = new THREE.ConeGeometry(0.25, 1.6, 4); thorn.translate(0, 0.7, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const paperL = new THREE.CylinderGeometry(0.55, 0.55, 1, 8); paperL.scale(1, 1, 1);
  const stone = new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7);
  return { blade, reed, trunk, tallTrunk, blob, pine, pad, flower, rock, mush, stem, thorn, box, stone, paperL };
})();

const MAT = {
  grass: windify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide })),
  reed: windify(new THREE.MeshStandardMaterial({ color: 0x3a5a48, roughness: 0.9 }), 0.25, 1.6),
  bark: mat(0x3a2a2a, { flat: true, rim: 0.6 }),
  darkBark: mat(0x1c1426, { flat: true, rim: 1.4 }),
  leaf: mat(0x1e4a4a, { flat: true, rim: 1.1 }),
  pine: mat(0x173a3a, { flat: true, rim: 1.0 }),
  hushLeaf: mat(0x1a1036, { flat: true, rim: 1.5 }),
  pad: mat(0x2f6a4a, { rim: 0.8 }),
  glowBasic: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  rock: mat(0x4a4a5a, { flat: true, rim: 0.8 }),
  islandRock: mat(0x6a4a5a, { flat: true, rim: 1.2 }),
  islandTop: mat(0x5a8a5a, { flat: true, rim: 1.0 }),
  mushCap: new THREE.MeshStandardMaterial({ color: 0x60e0ff, emissive: 0x30b0ff, emissiveIntensity: 1.6, roughness: 0.5 }),
  stem: mat(0xd8d0e0, { rim: 0.5 }),
  thorn: mat(0x120a1c, { flat: true, rim: 1.6 }),
  stone: mat(0x8a8090, { flat: true, rim: 0.6 }),
  lanternPaper: new THREE.MeshStandardMaterial({ color: 0xffa050, emissive: 0xff7a28, emissiveIntensity: 1.3, roughness: 0.8 }),
};
MAT.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });

function inst(geo, material, n) {
  const m = new THREE.InstancedMesh(geo, material, n);
  m.count = 0; m.frustumCulled = false;
  m.add1 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, col) => {
    if (m.count >= n) return;
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
    _m.compose(_p, _q, _s); m.setMatrixAt(m.count, _m);
    if (col !== undefined) m.setColorAt(m.count, _c.set(col));
    m.count++;
  };
  return m;
}

function glowPoints(list, size, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  p.frustumCulled = false;
  return p;
}

// Terrain ribbon that follows the path, so seams between chunks always line up.
function terrain(s0, height, colorFn, width = 200, segW = 56) {
  const g = new THREE.PlaneGeometry(width, CHUNK + 0.5, segW, 18);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), s = s0 - p.getZ(i) + CHUNK / 2;
    const uu = u * (1 + Math.abs(u) / width);
    const h = height(uu, s);
    p.setXYZ(i, pathX(s) + uu, h, -s);
    colorFn(uu, s, h, _c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT.terrain);
  m.receiveShadow = true;
  return m;
}

const H = {
  garden: (u, s) => {
    const d = Math.abs(u);
    return fbm(u / 26 + 3, s / 26) * 3.2 * smooth(3.5, 16, d) + smooth(18, 90, d) * 16 + noise2(u * 0.6, s * 0.6) * 0.08;
  },
  river: (u, s) => {
    const d = Math.abs(u);
    const bank = -1.6 + smooth(6.5, 10, d) * 2.1;
    return bank + fbm(u / 20, s / 20) * 2.5 * smooth(11, 24, d) + smooth(25, 90, d) * 14;
  },
  hush: (u, s) => {
    const d = Math.abs(u);
    return fbm(u / 18, s / 18) * 2.2 * smooth(3.5, 12, d) + smooth(14, 70, d) * 10 + noise2(u * 0.5, s * 0.5) * 0.12;
  },
};
const C = {
  garden: (u, s, h, c) => {
    const d = Math.abs(u), n = noise2(u * 0.15, s * 0.15) * 0.5 + 0.5;
    if (d < 2.6 + noise2(s * 0.2, 1) * 0.4) c.setRGB(0.36, 0.32, 0.3).multiplyScalar(0.8 + n * 0.3);
    else c.setRGB(0.1 + n * 0.05, 0.22 + n * 0.08, 0.2 + n * 0.04);
    if (h > 8) c.lerp(_t.setRGB(0.16, 0.18, 0.3), smooth(8, 16, h));
  },
  river: (u, s, h, c) => {
    const d = Math.abs(u), n = noise2(u * 0.2, s * 0.2) * 0.5 + 0.5;
    if (d < 8.5) c.setRGB(0.18, 0.2, 0.26).multiplyScalar(0.7 + n * 0.4);
    else c.setRGB(0.13 + n * 0.05, 0.22 + n * 0.08, 0.24);
  },
  hush: (u, s, h, c) => {
    const d = Math.abs(u), n = noise2(u * 0.2, s * 0.2) * 0.5 + 0.5;
    if (d < 2.4 + noise2(s * 0.3, 2) * 0.4) c.setRGB(0.22, 0.18, 0.3).multiplyScalar(0.8 + n * 0.3);
    else c.setRGB(0.08 + n * 0.04, 0.07 + n * 0.03, 0.16 + n * 0.06);
  },
};
const _t = new THREE.Color();
export const groundHeight = (kind, u, s) => (H[kind] ? H[kind](u, s) : 0);

function scatter(r, s0, n, minD, maxD, fn) {
  for (let i = 0; i < n; i++) {
    const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1;
    const u = side * (minD + Math.pow(r(), 1.6) * (maxD - minD));
    fn(pathX(s) + u, s, u);
  }
}

function buildGarden(s0, r, kind = 'garden') {
  const g = new THREE.Group();
  const hush = kind === 'hush';
  g.add(terrain(s0, H[kind], C[kind]));
  const grass = inst(GEO.blade, MAT.grass, 2600);
  scatter(r, s0, 2600, 2.4, 30, (x, s, u) => {
    const h = H[kind](u, s), k = r();
    const col = hush ? _c.setHSL(0.72 + k * 0.06, 0.4, 0.14 + k * 0.08).getHex() : _c.setHSL(0.36 + k * 0.1, 0.45, 0.16 + k * 0.1).getHex();
    const sc = 0.7 + r() * 0.9;
    grass.add1(x, h - 0.02, -s, sc, sc * (0.8 + r() * 0.8), sc, 0, r() * 6.28, (r() - 0.5) * 0.3, col);
  });
  g.add(grass);
  const flowers = inst(GEO.flower, MAT.glowBasic, 160);
  const pal = hush ? [0x9a70ff, 0x60d0ff, 0xff70d0] : [0x8ff0ff, 0xffa0e0, 0xfff0a0, 0xb0ffb0];
  scatter(r, s0, 160, 2.8, 20, (x, s, u) => {
    const h = H[kind](u, s);
    flowers.add1(x, h + 0.25 + r() * 0.35, -s, 1, 1, 1, 0, 0, 0, pal[(r() * pal.length) | 0]);
  });
  g.add(flowers);
  if (!hush) {
    const trunks = inst(GEO.trunk, MAT.bark, 40), blobs = inst(GEO.blob, MAT.leaf, 120), pines = inst(GEO.pine, MAT.pine, 90);
    scatter(r, s0, 34, 6.5, 55, (x, s, u) => {
      const h = H[kind](u, s) - 0.1, sc = 0.9 + r() * 1.3;
      if (r() < 0.45) {
        trunks.add1(x, h, -s, sc, sc, sc);
        for (let k = 0; k < 3; k++) blobs.add1(x + (r() - 0.5) * sc, h + 2.4 * sc + k * 0.4 * sc, -s + (r() - 0.5) * sc, sc * (1.2 - k * 0.2), sc * (1 - k * 0.15), sc * (1.2 - k * 0.2), r(), r(), r());
      } else {
        trunks.add1(x, h, -s, sc * 0.7, sc * 0.5, sc * 0.7);
        for (let k = 0; k < 3; k++) pines.add1(x, h + sc * (0.8 + k * 1.1), -s, sc * (1.3 - k * 0.3), sc * (1.3 - k * 0.25), sc * (1.3 - k * 0.3), 0, r() * 3, 0);
      }
    });
    g.add(trunks, blobs, pines);
    const stones = inst(GEO.stone, MAT.stone, 40);
    for (let i = 0; i < 40; i++) {
      const s = s0 + i * (CHUNK / 40) + r() * 0.4, u = (r() - 0.5) * 3.6;
      stones.add1(pathX(s) + u, H.garden(u, s) - 0.03, -s, 0.28 + r() * 0.2, 0.6, 0.24 + r() * 0.2, 0, r() * 3, 0);
    }
    g.add(stones);
    const posts = [], lamps = inst(GEO.paperL, MAT.lanternPaper, 4), poles = inst(GEO.box, MAT.bark, 4);
    for (let i = 0; i < 2; i++) {
      const s = s0 + 12 + i * 25, side = i % 2 ? 1 : -1, x = pathX(s) + side * 3.4;
      poles.add1(x, 1.1, -s, 0.1, 2.2, 0.1);
      lamps.add1(x, 2.2, -s, 0.26, 0.34, 0.26);
      posts.push(x, 2.2, -s);
    }
    g.add(lamps, poles, glowPoints(posts, 3.2, 0xffa050));
  } else {
    const trunks = inst(GEO.tallTrunk, MAT.darkBark, 14), canopy = inst(GEO.blob, MAT.hushLeaf, 40);
    const hang = [];
    const lanterns = inst(GEO.paperL, MAT.lanternPaper, 60);
    scatter(r, s0, 12, 6, 40, (x, s, u) => {
      const h = H.hush(u, s) - 0.5, sc = 0.8 + r() * 0.8;
      trunks.add1(x, h, -s, sc, sc * (0.8 + r() * 0.5), sc, 0, r() * 6, 0);
      for (let k = 0; k < 3; k++) canopy.add1(x + (r() - 0.5) * 8, h + 24 * sc + r() * 6, -s + (r() - 0.5) * 8, 6 + r() * 4, 3 + r() * 2, 6 + r() * 4, r(), r(), r());
      for (let k = 0; k < 4; k++) {
        const lx = x + (r() - 0.5) * 7, ly = h + 3 + r() * 9, lz = -s + (r() - 0.5) * 7;
        lanterns.add1(lx, ly, lz, 0.22, 0.3, 0.22, 0, r() * 3, 0); hang.push(lx, ly, lz);
      }
    });
    g.add(trunks, canopy, lanterns, glowPoints(hang, 2.6, 0xff9a50));
    const thorns = inst(GEO.thorn, MAT.thorn, 90);
    scatter(r, s0, 90, 3.2, 9, (x, s, u) => thorns.add1(x, H.hush(u, s) - 0.1, -s, 0.6 + r(), 0.5 + r() * 1.2, 0.6 + r(), (r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8));
    g.add(thorns);
    const caps = inst(GEO.mush, MAT.mushCap, 50), stems = inst(GEO.stem, MAT.stem, 50);
    scatter(r, s0, 50, 3, 12, (x, s, u) => {
      const h = H.hush(u, s), sc = 0.6 + r() * 1.8;
      stems.add1(x, h, -s, sc, sc, sc); caps.add1(x, h + 0.3 * sc, -s, sc, sc, sc);
    });
    g.add(caps, stems);
  }
  return g;
}

function buildRiver(s0, r) {
  const g = new THREE.Group();
  g.add(terrain(s0, H.river, C.river));
  const pads = inst(GEO.pad, MAT.pad, 60), blossoms = inst(GEO.flower, MAT.glowBasic, 60);
  for (let i = 0; i < 60; i++) {
    const s = s0 + r() * CHUNK, u = (r() < 0.5 ? -1 : 1) * (3.8 + r() * 3);
    const x = pathX(s) + u, sc = 0.5 + r() * 0.9;
    pads.add1(x, 0.03, -s, sc, 1, sc, 0, r() * 6, 0);
    if (r() < 0.55) blossoms.add1(x + 0.1, 0.15, -s, 1.3, 1.1, 1.3, 0, 0, 0, [0xffb0e0, 0xfff0c0, 0xa0f0ff][(r() * 3) | 0]);
  }
  g.add(pads, blossoms);
  const reeds = inst(GEO.reed, MAT.reed, 260);
  scatter(r, s0, 260, 6.2, 10, (x, s, u) => reeds.add1(x, H.river(u, s) - 0.1, -s, 1, 0.6 + r() * 0.9, 1, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
  g.add(reeds);
  const grass = inst(GEO.blade, MAT.grass, 1400);
  scatter(r, s0, 1400, 8.5, 30, (x, s, u) => {
    const k = r(), sc = 0.8 + r();
    grass.add1(x, H.river(u, s) - 0.02, -s, sc, sc, sc, 0, r() * 6, 0, _c.setHSL(0.42 + k * 0.08, 0.4, 0.16 + k * 0.1).getHex());
  });
  g.add(grass);
  const trunks = inst(GEO.trunk, MAT.bark, 16), willow = inst(GEO.blob, MAT.leaf, 60);
  scatter(r, s0, 14, 10, 45, (x, s, u) => {
    const h = H.river(u, s), sc = 1.2 + r();
    trunks.add1(x, h, -s, sc, sc * 1.1, sc);
    for (let k = 0; k < 4; k++) willow.add1(x + (r() - 0.5) * 2.5 * sc, h + 2.4 * sc, -s + (r() - 0.5) * 2.5 * sc, 1.4 * sc, 2.2 * sc, 1.4 * sc, 0, r() * 3, 0);
  });
  g.add(trunks, willow);
  const floats = [], paper = inst(GEO.paperL, MAT.lanternPaper, 14);
  for (let i = 0; i < 14; i++) {
    const s = s0 + r() * CHUNK, u = (r() - 0.5) * 11, x = pathX(s) + u, y = 0.2 + (r() < 0.4 ? 2 + r() * 5 : 0);
    paper.add1(x, y, -s, 0.3, 0.26, 0.3, 0, r() * 3, 0); floats.push(x, y + 0.1, -s);
  }
  g.add(paper, glowPoints(floats, 2.4, 0xffa040));
  const caps = inst(GEO.mush, MAT.mushCap, 30), stems = inst(GEO.stem, MAT.stem, 30);
  scatter(r, s0, 30, 7.5, 14, (x, s, u) => { const h = H.river(u, s), sc = 0.7 + r(); stems.add1(x, h, -s, sc, sc, sc); caps.add1(x, h + 0.3 * sc, -s, sc, sc, sc); });
  g.add(caps, stems);
  g.add(waterRibbon(s0));
  return g;
}

const waterU = { uTime: globalU.uTime, deep: { value: new THREE.Color(0x0a1030) }, shallow: { value: new THREE.Color(0x2a4a7a) }, skyC: { value: new THREE.Color(0x6a5aa0) }, glint: { value: new THREE.Color(0xfff0d0) }, sunDir: { value: new THREE.Vector3(0.4, 0.4, -1).normalize() } };
export const WATER = waterU;
const waterMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
  fog: true, transparent: false,
  vertexShader: `varying vec3 vW; varying vec3 vN; uniform float uTime;
    #include <fog_pars_vertex>
    void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0);
      w.y += sin(w.x * 0.5 + uTime * 1.3) * 0.05 + sin(w.z * 0.4 + uTime * 1.1) * 0.05;
      vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; uniform vec3 deep, shallow, skyC, glint, sunDir; varying vec3 vW;
    #include <fog_pars_fragment>
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 uv = vW.xz;
      float r1 = n(uv * 0.6 + vec2(0.0, uTime * 0.35)), r2 = n(uv * 1.7 - vec2(uTime * 0.2, uTime * 0.5));
      vec3 nrm = normalize(vec3((r1 - 0.5) * 0.5 + (r2 - 0.5) * 0.3, 1.0, (r2 - 0.5) * 0.5));
      vec3 V = normalize(cameraPosition - vW);
      float fr = pow(1.0 - max(dot(nrm, V), 0.0), 3.0);
      vec3 c = mix(deep, shallow, r1 * 0.35);
      c = mix(c, skyC, clamp(fr * 1.4 + 0.15, 0.0, 1.0));
      vec3 R = reflect(-V, nrm);
      float sp = pow(max(dot(R, normalize(sunDir)), 0.0), 60.0);
      c += glint * sp * 1.6;
      float dist = length(cameraPosition.xz - vW.xz);
      float sparkle = smoothstep(0.93, 1.0, n(uv * 5.0 + vec2(uTime * 0.6, -uTime * 0.4))) * smoothstep(0.9, 1.0, n(uv * 3.1 - uTime * 0.3)) * smoothstep(4.0, 30.0, dist);
      c += glint * sparkle * 1.2;
      gl_FragColor = vec4(c, 1.0);
      #include <fog_fragment>
    }`,
});
Object.assign(waterMat.uniforms, waterU);

function waterRibbon(s0, width = 18) {
  const g = new THREE.PlaneGeometry(width, CHUNK + 0.5, 8, 16);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), s = s0 - p.getZ(i) + CHUNK / 2; p.setXYZ(i, pathX(s) + u, 0, -s); }
  return new THREE.Mesh(g, waterMat);
}

export function makeSea() {
  const g = new THREE.PlaneGeometry(1600, 1600, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, waterMat); m.frustumCulled = false; return m;
}

function island(r, size) {
  const g = new THREE.Group();
  const rockG = new THREE.ConeGeometry(size, size * (1.6 + r()), 8, 3);
  rockG.rotateX(Math.PI);
  const p = rockG.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + (noise2(p.getX(i) * 2 + size, p.getY(i) * 2) * 0.25); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  rockG.computeVertexNormals();
  const rock = new THREE.Mesh(rockG, MAT.islandRock); rock.position.y = -size * 0.8; g.add(rock);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.05, size, size * 0.25, 9), MAT.islandTop); g.add(top);
  const n = 1 + (r() * 3) | 0;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * size * 0.6, sc = size * (0.12 + r() * 0.1);
    const tr = new THREE.Mesh(GEO.trunk, MAT.bark); tr.scale.setScalar(sc); tr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(tr);
    const bl = new THREE.Mesh(GEO.blob, MAT.leaf); bl.scale.set(sc * 1.4, sc * 1.2, sc * 1.4); bl.position.set(tr.position.x, sc * 2.6, tr.position.z); g.add(bl);
  }
  if (r() < 0.6) {
    const cr = new THREE.Mesh(GEO.rock, new THREE.MeshBasicMaterial({ color: [0x9ff0ff, 0xffb0f0, 0xfff0a0][(r() * 3) | 0] }));
    cr.scale.set(size * 0.08, size * 0.25, size * 0.08); cr.position.set((r() - 0.5) * size, -size * 0.3, (r() - 0.5) * size); g.add(cr);
  }
  return g;
}

const cloudMats = [0xd89aa8, 0xb07a98, 0xe8b0a0].map((c) => new THREE.SpriteMaterial({ map: cloudTex, color: c, transparent: true, depthWrite: false, fog: true, opacity: 0.7 }));
function buildSky(s0, r) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const s = s0 + r() * CHUNK, side = r() < 0.5 ? -1 : 1, u = side * (10 + r() * 50);
    const size = 3 + r() * 9, isl = island(r, size);
    isl.position.set(pathX(s) + u, -8 - r() * 26 + (Math.abs(u) > 30 ? 10 : 0), -s);
    isl.userData.bob = r() * 6.28;
    g.add(isl);
  }
  for (let i = 0; i < 10; i++) {
    const s = s0 + r() * CHUNK, u = (r() < 0.5 ? -1 : 1) * (22 + r() * 70);
    const sp = new THREE.Sprite(cloudMats[(r() * 3) | 0]);
    const sc = 12 + r() * 22; sp.scale.set(sc * 1.6, sc, 1);
    sp.position.set(pathX(s) + u, r() < 0.5 ? -18 - r() * 12 : 10 + r() * 16, -s); g.add(sp);
  }
  return g;
}

function buildDawn(s0, r) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = s0 + r() * CHUNK, u = (r() < 0.5 ? -1 : 1) * (18 + r() * 60);
    const rk = new THREE.Mesh(GEO.rock, MAT.rock); const sc = 3 + r() * 6;
    rk.scale.set(sc, sc * (1.5 + r() * 2), sc); rk.position.set(pathX(s) + u, -sc * 0.5, -s); g.add(rk);
  }
  for (let i = 0; i < 6; i++) {
    const s = s0 + r() * CHUNK, u = (r() - 0.5) * 160;
    if (Math.abs(u) < 12) continue;
    const sp = new THREE.Sprite(cloudMats[2]); const sc = 16 + r() * 30; sp.scale.set(sc * 1.8, sc * 0.8, 1);
    sp.position.set(pathX(s) + u, 10 + r() * 30, -s); g.add(sp);
  }
  return g;
}

const BUILDERS = { garden: (s, r) => buildGarden(s, r, 'garden'), hush: (s, r) => buildGarden(s, r, 'hush'), river: buildRiver, sky: buildSky, dawn: buildDawn };

export function createStreamer(scene) {
  const chunks = new Map();
  let kind = null;
  const api = {
    get kind() { return kind; },
    setKind(k) { if (k === kind) return; kind = k; api.clear(); },
    clear() { chunks.forEach((g) => { scene.remove(g); disposeGroup(g); }); chunks.clear(); },
    update(s, ahead = 5) {
      if (!kind) return;
      const i0 = Math.floor(s / CHUNK) - 1, i1 = i0 + ahead;
      for (const [i, g] of chunks) if (i < i0 || i > i1) { scene.remove(g); disposeGroup(g); chunks.delete(i); }
      for (let i = i0; i <= i1; i++) {
        if (chunks.has(i)) continue;
        const g = BUILDERS[kind](i * CHUNK, rng(i * 7919 + kind.length * 104729));
        chunks.set(i, g); scene.add(g);
        return;
      }
    },
    prime(s, ahead = 5) { for (let k = 0; k < ahead + 2; k++) api.update(s, ahead); },
    tick(t) {
      if (kind !== 'sky') return;
      chunks.forEach((g) => g.children.forEach((c) => { if (c.userData.bob !== undefined) c.position.y += Math.sin(t * 0.5 + c.userData.bob) * 0.004; }));
    },
  };
  return api;
}

const shared = new Set(Object.values(GEO));
function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
  });
}

export function makeHome() {
  const g = new THREE.Group();
  const white = mat(0xe8e0d8, { rim: 0.8 }), red = mat(0xb83a3a, { rim: 0.8 });
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - i * 0.18 - 0.18, 2.2 - i * 0.18, 2.6, 16), i % 2 ? red : white);
    seg.position.y = 1.3 + i * 2.6; seg.castShadow = true; g.add(seg);
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 16), mat(0x2a2a3a)); deck.position.y = 15.8; g.add(deck);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd080, emissiveIntensity: 3 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 12), lampMat); lamp.position.y = 16.8; g.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.4, 12), red); roof.position.y = 18.3; g.add(roof);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamG = new THREE.ConeGeometry(4, 60, 16, 1, true); beamG.translate(0, -30, 0); beamG.rotateZ(Math.PI / 2);
  const beam = new THREE.Group(); beam.position.y = 16.8;
  const b1 = new THREE.Mesh(beamG, beamMat); b1.position.x = 0; beam.add(b1);
  const b2 = b1.clone(); b2.rotation.y = Math.PI; beam.add(b2);
  g.add(beam);
  const halo = glowPoints([0, 16.8, 0], 14, 0xffe0a0); g.add(halo);
  const cottage = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), mat(0xd8c8b0, { rim: 0.6 })); walls.position.y = 1.5; walls.castShadow = true; cottage.add(walls);
  const roofG = new THREE.CylinderGeometry(0.01, 3.6, 2.2, 4, 1); roofG.rotateY(Math.PI / 4);
  const croof = new THREE.Mesh(roofG, mat(0x4a3040, { flat: true })); croof.position.y = 4.1; croof.scale.set(1, 1, 0.85); cottage.add(croof);
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 2 });
  [-1.3, 1.3].forEach((x) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.1), winMat); w.position.set(x, 1.7, 2.02); cottage.add(w); });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.1), mat(0x5a3a2a)); door.position.set(0, 0.85, 2.02); cottage.add(door);
  cottage.add(glowPoints([-1.3, 1.7, 2.3, 1.3, 1.7, 2.3], 3, 0xffa040));
  cottage.position.set(-7, 0, 4); cottage.rotation.y = 0.5;
  g.add(cottage);
  g.userData.beam = beam;
  g.userData.cottage = cottage;
  return g;
}

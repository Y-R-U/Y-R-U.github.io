// Four parallax cloud bands. Wide, flat, soft-edged, low contrast — never fluffy cumulus balls.
//
// Numbers carried over from the 2D agent's measured pass (ART_NOTES §4), with its one recorded
// mistake corrected: clouds get MORE opaque toward the horizon, not less, and there is a fourth
// very wide, very flat band hugging world y 60-230 so the sky just above the ground is not empty.
//
// One InstancedMesh per band, sampling a 4x4 atlas of the 16 tinted sprites: 4 draw calls total.

import * as THREE from 'three';
import { cloudAtlas, CLOUD_TILE } from './bakers.js';
import { rng } from './bake.js';
import { makeTex, makeBin } from './materials.js';
import { makeLayer } from './layer.js';

const BANDS = [
  { p: 0.03, z: -5200, n: 11, tile: 3200, yLo: 40,  yHi: 240,  sLo: 2.8, sHi: 5.0, a: 0.95, flat: 1.5 },
  { p: 0.06, z: -4200, n: 16, tile: 3700, yLo: 420, yHi: 1350, sLo: 2.4, sHi: 4.2, a: 0.62, flat: 1.0 },
  { p: 0.18, z: -2400, n: 14, tile: 4900, yLo: 300, yHi: 980,  sLo: 1.7, sHi: 3.0, a: 0.80, flat: 1.0 },
  { p: 0.55, z: -900,  n: 9,  tile: 6100, yLo: 150, yHi: 700,  sLo: 1.0, sHi: 1.9, a: 0.95, flat: 1.0 },
];

const VERT = `
attribute vec2 aTile; attribute float aAlpha;
varying vec2 vUv; varying float vA;
void main() {
  vUv = vec2((uv.x + aTile.x) * 0.25, (aTile.y + 1.0 - uv.y) * 0.25);
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const FRAG = `
uniform sampler2D map; uniform float uOpacity;
varying vec2 vUv; varying float vA;
void main() {
  vec4 c = texture2D(map, vUv);
  gl_FragColor = vec4(c.rgb, c.a * vA * uOpacity);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}
`;

export function makeClouds(camApi, seed = 0x51e7) {
  const bin = makeBin();
  const root = new THREE.Group();
  const quad = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uOpacity: { value: 0.8 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: false,
  });

  const bands = BANDS.map((b, bi) => {
    const R = rng(seed + 4001 * (bi + 1));
    const layer = makeLayer(camApi, b.z, b.p);
    const geo = new THREE.InstancedBufferGeometry().copy(quad);
    geo.instanceCount = b.n;
    const tile = new Float32Array(b.n * 2), alpha = new Float32Array(b.n);
    const list = [];
    for (let i = 0; i < b.n; i++) {
      const m = R.int(CLOUD_TILE.n);
      tile[i * 2] = m % CLOUD_TILE.cols;
      tile[i * 2 + 1] = Math.floor(m / CLOUD_TILE.cols);
      const wy = R.range(b.yLo, b.yHi);
      // more opaque toward the horizon (ART.md §1)
      const alt = 1 - Math.min(1, Math.max(0, (wy - 60) / 1500)) * 0.42;
      alpha[i] = b.a * R.range(0.78, 1) * alt;
      list.push({
        base: R.f() * b.tile, wy,
        sx: R.range(b.sLo, b.sHi) * b.flat, sy: R.range(b.sLo, b.sHi) * (b.flat > 1 ? 0.62 : 1),
        flip: R.f() < 0.5 ? -1 : 1,
      });
    }
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tile, 2));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    const mesh = new THREE.InstancedMesh(geo, mat, b.n);
    mesh.frustumCulled = false;
    mesh.renderOrder = -900 + bi;
    layer.group.add(mesh);
    root.add(layer.group);
    return { b, layer, mesh, list, geo, alpha };
  });

  const M = new THREE.Matrix4();
  let cover = 1;

  return {
    root,
    setPalette(pal, key) {
      bin.dispose();
      const tex = makeTex(cloudAtlas(pal), { aniso: 2 });
      tex.flipY = false;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      mat.uniforms.map.value = bin.keep(tex);
      mat.uniforms.uOpacity.value = pal.cloud.alpha;
      cover = pal.cloud.cover;
      for (const bd of bands) {
        const vis = Math.max(2, Math.round(bd.b.n * (0.45 + cover * 0.55)));
        bd.geo.instanceCount = vis;
      }
    },
    refit() { for (const bd of bands) bd.layer.refit(); },
    update(camX, camY) {
      for (const bd of bands) {
        const { b, layer, mesh, list } = bd;
        layer.place(camX, camY);
        const inv = layer.inv;
        const px = camX * b.p;
        const n = bd.geo.instanceCount;
        for (let i = 0; i < n; i++) {
          const c = list[i];
          const dx = c.base + b.tile * Math.round((px - c.base) / b.tile);
          M.makeScale(CLOUD_TILE.w * c.sx * inv * c.flip, CLOUD_TILE.h * c.sy * inv, 1);
          M.setPosition(dx * inv, c.wy * inv, 0);
          mesh.setMatrixAt(i, M);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    setVisible(v) { root.visible = v; },
    dispose() { bin.dispose(); quad.dispose(); mat.dispose(); for (const bd of bands) bd.geo.dispose(); },
  };
}

import * as THREE from 'three';
import { Builder, rng, mat } from './util.js';
import { BLOCK, FIELD_SEED, WOOD_T, K, hedgeOf, leafKind, unwarp, walkBlock, woods, vnoise } from './fields.js';
import { SUN_DIR } from './env.js';

// Tree record layout in the packed Float32Array.
const S = 10; // x, y, z, height, widthScale, rot, tint, species, edge(0|1), rnd
const SPECIES = [
  { name: 'broadleaf', H: 15 },
  { name: 'conifer', H: 18 },
  { name: 'poplar', H: 22 },
];
export const TREE_TIERS = {
  low: { nearR: 110, nearCap: 400, farR: 2600, farCap: 12000, shadows: false, lo: true, thin: 900, floor: 0.12 },
  medium: { nearR: 180, nearCap: 1000, farR: 3800, farCap: 22000, shadows: true, lo: false, thin: 1600, floor: 0.2 },
  high: { nearR: 260, nearCap: 2000, farR: 5200, farCap: 40000, shadows: true, lo: false, thin: 2600, floor: 0.3 },
};

function crownLumps(B, r, cx, cy, cz, rad, detail, leaf, sx = 1, sy = 1) {
  const g = new THREE.IcosahedronGeometry(rad, detail);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const hsh2 = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const d = 1 + ((hsh2 - Math.floor(hsh2)) - 0.5) * 0.28;
    p.setXYZ(k, x * d * sx, y * d * sy, z * d * sx);
  }
  g.translate(cx, cy, cz);
  const n = g.attributes.normal, c = [];
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k) - cx, y = p.getY(k) - cy, z = p.getZ(k) - cz;
    const l = Math.hypot(x, y * 0.8, z) || 1;
    const fx = n.getX(k), fy = n.getY(k), fz = n.getZ(k);
    const nx = x / l * 0.7 + fx * 0.3, ny = y / l * 0.7 + fy * 0.3, nz = z / l * 0.7 + fz * 0.3, nl = Math.hypot(nx, ny, nz);
    n.setXYZ(k, nx / nl, ny / nl, nz / nl);
    const ao = 0.62 + 0.38 * Math.max(0, Math.min(1, (p.getY(k) - (cy - rad * sy)) / (2 * rad * sy))) ;
    const v = (0.9 + r() * 0.2) * ao;
    c.push(leaf[0] * v, leaf[1] * v * (0.97 + r() * 0.06), leaf[2] * v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  B.geo(g, null, leaf);
}

function trunk(B, h, r0, r1, color, segs = 5) {
  B.geo(new THREE.CylinderGeometry(r1, r0, h, segs, 1, true), mat(0, h / 2, 0), color);
}

const LEAF = [0.15, 0.26, 0.09], LEAF2 = [0.2, 0.3, 0.1], NEEDLE = [0.08, 0.16, 0.08], POP = [0.19, 0.29, 0.1], BARK = [0.13, 0.11, 0.09];

function speciesGeometry(i, lo, seed) {
  const r = rng(seed);
  const B = new Builder();
  if (i === 0) {
    trunk(B, 6.5, 0.42, 0.28, BARK);
    const leaf = seed % 2 ? LEAF2 : LEAF;
    crownLumps(B, r, 0, 9.6, 0, 4.7, 1, leaf, 1, 0.82);
    if (!lo) {
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + r() * 0.8;
        crownLumps(B, r, Math.cos(a) * 3.0, 8.4 + r() * 3.4, Math.sin(a) * 3.0, 2.7 + r() * 0.9, 0, leaf);
      }
    }
  } else if (i === 1) {
    trunk(B, 4, 0.35, 0.25, BARK);
    const tiers = lo ? 3 : 4;
    for (let k = 0; k < tiers; k++) {
      const f = k / tiers;
      const g = new THREE.ConeGeometry(3.6 * (1 - f * 0.7), 7.5 - k * 0.9, lo ? 6 : 8, 1, true);
      g.translate(0, 3.2 + f * 11.5 + (7.5 - k * 0.9) / 2, 0);
      const p = g.attributes.position, c = [];
      for (let q = 0; q < p.count; q++) {
        const yy = (p.getY(q) - 3.2 - f * 11.5) / (7.5 - k * 0.9);
        const v = (0.55 + 0.5 * yy) * (0.92 + r() * 0.16);
        c.push(NEEDLE[0] * v, NEEDLE[1] * v, NEEDLE[2] * v);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      B.geo(g, null, NEEDLE);
    }
  } else {
    trunk(B, 5, 0.32, 0.22, BARK);
    crownLumps(B, r, 0, 13, 0, 2.6, 1, POP, 1, 3.3);
  }
  const g = B.build();
  g.computeBoundingBox();
  return g;
}

// Renders each species from the side into a 4-tile atlas; impostors sample it so near and far trees match.
function bakeAtlas(renderer, geos) {
  const T = 256;
  const rt = new THREE.WebGLRenderTarget(T * 4, T, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 0 });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#cfe3ff', '#5d6b45', 0.95));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.set(-0.5, 0.8, 1);
  scene.add(sun);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geos[0], m);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  const prev = { target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), tone: renderer.toneMapping, sh: renderer.shadowMap.enabled };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  const dims = [];
  for (let t = 0; t < 4; t++) {
    const g = geos[t];
    const bb = g.boundingBox;
    const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.04, h = (bb.max.y - bb.min.y) * 1.02;
    mesh.geometry = g;
    cam.left = -w / 2; cam.right = w / 2; cam.top = bb.max.y + h * 0.01; cam.bottom = bb.min.y - h * 0.01;
    cam.position.set(0, 0, 50);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    rt.viewport.set(t * T, 0, T, T);
    rt.scissor.set(t * T, 0, T, T);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    dims.push([w, h]);
  }
  rt.scissorTest = false;
  renderer.setRenderTarget(prev.target);
  renderer.setClearColor(prev.clear, prev.alpha);
  m.dispose();
  return { texture: rt.texture, dims };
}

function impostorMaterial(atlas, a2c) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec4 iDat;
      varying vec2 vUv; varying float vTint;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvc = modelViewMatrix * vec4(iPos.xyz + vec3(0.0, iPos.w * 0.5, 0.0), 1.0);
        vec4 mvPosition = mvc + vec4(position.x * iDat.x, position.y * iPos.w, 0.0, 0.0);
        gl_Position = projectionMatrix * mvPosition;
        vUv = vec2((iDat.y + position.x + 0.5) * 0.25, position.y + 0.5);
        vTint = iDat.z;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying float vTint;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(map, vUv);
        vec2 dx = dFdx(vUv * vec2(1024.0, 256.0)), dy = dFdy(vUv * vec2(1024.0, 256.0));
        float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
        float a = t.a * (1.0 + 0.35 * lod);
        ${a2c ? 'if (a < 0.05) discard; a = clamp((a - 0.4) / max(fwidth(a), 1e-3) + 0.5, 0.0, 1.0);' : 'if (a < 0.5) discard; a = 1.0;'}
        gl_FragColor = vec4(t.rgb / max(t.a, 0.35) * vTint, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    alphaToCoverage: a2c,
  });
  m.uniforms.map.value = atlas;
  return m;
}

// Placement. ctx: { heightAt, noGo(x,z), extra: [[x,z,species,h]] }
function plant(ctx, quality) {
  const out = [];
  const r = rng(7);
  const add = (x, z, sp, h, edge, tint = 0.78 + r() * 0.42) => {
    if (ctx.noGo(x, z)) return;
    const y = ctx.heightAt(x, z) - 0.3;
    out.push(x, y, z, h, 0.85 + r() * 0.35, r() * Math.PI * 2, tint, sp, edge, r());
  };
  const RAD = 5200;
  const w = [0, 0];
  const nb = Math.ceil(RAD / BLOCK) + 1;
  for (let bz = -nb; bz <= nb; bz++) for (let bx = -nb; bx <= nb; bx++) {
    if (Math.hypot((bx + 0.5) * BLOCK, (bz + 0.5) * BLOCK) > RAD + BLOCK) continue;
    walkBlock(bx, bz, BLOCK, FIELD_SEED, 120, 7, (pts, sh) => {
      const e = hedgeOf(sh);
      if (!e.trees) return;
      const pop = (sh >>> 24) % 9 === 0;
      for (const q of pts) {
        if (r() > (e.trees === 2 ? 0.7 : 0.17)) continue;
        unwarp(q[0], q[1], w);
        if (woods(w[0], w[1]) > WOOD_T - 0.03) continue;
        add(w[0] + (r() - 0.5) * 3, w[1] + (r() - 0.5) * 3, pop ? 2 : (r() < 0.05 ? 1 : 0), e.trees === 2 ? 11 + r() * 8 : 12 + r() * 9, 1);
      }
    }, (leaf, toQ, rc, inBlock) => {
      if (leafKind(leaf) !== K.PLANT) return;
      const sp = 7;
      for (let lz = rc[1] + 5; lz < rc[3] - 5; lz += sp) for (let lx = rc[0] + 5; lx < rc[2] - 5; lx += sp) {
        const q = toQ(lx + (r() - 0.5) * 1.5, lz + (r() - 0.5) * 1.5);
        if (!inBlock(q)) continue;
        unwarp(q[0], q[1], w);
        const edge = lx < rc[0] + 9 || lx > rc[2] - 9 || lz < rc[1] + 9 || lz > rc[3] - 9 || !inBlock(toQ(lx + 9, lz)) || !inBlock(toQ(lx - 9, lz)) || !inBlock(toQ(lx, lz + 9)) || !inBlock(toQ(lx, lz - 9));
        add(w[0], w[1], 1, 14 + r() * 6, edge ? 1 : 0);
      }
    });
  }
  const CG = 48, step = quality === 'low' ? 10 : 8.5;
  for (let gz = -RAD; gz < RAD; gz += CG) for (let gx = -RAD; gx < RAD; gx += CG) {
    if (gx * gx + gz * gz > RAD * RAD) continue;
    let mx = 0;
    for (const [ox, oz] of [[0, 0], [CG, 0], [0, CG], [CG, CG], [CG / 2, CG / 2]]) mx = Math.max(mx, woods(gx + ox, gz + oz));
    if (mx < WOOD_T - 0.05) continue;
    const con = vnoise(gx / 900, gz / 900, 0x3c3) > 0.62 ? 0.75 : 0.08;
    for (let z = gz; z < gz + CG; z += step) for (let x = gx; x < gx + CG; x += step) {
      const px = x + r() * step, pz = z + r() * step;
      const wn = woods(px, pz);
      if (wn < WOOD_T - 0.008) continue;
      if (wn < WOOD_T + 0.004) { if (r() < 0.55) add(px, pz, 0, 3.5 + r() * 3, 1); continue; }
      const edge = wn < WOOD_T + 0.012;
      const sp = r() < con ? 1 : 0;
      add(px, pz, sp, (sp === 1 ? 15 + r() * 9 : 13 + r() * 9) * (edge ? 0.85 : 1), edge ? 1 : 0);
    }
  }
  for (const [x, z, sp, h] of ctx.extra) add(x, z, sp, h * (0.85 + r() * 0.3), 1);
  return Float32Array.from(out);
}

export function buildTrees(renderer, quality, ctx) {
  const CH = 200, HALF = 6400, NC = Math.ceil(2 * HALF / CH);
  const raw = plant(ctx, quality);
  const count = raw.length / S;
  // bucket by chunk
  const counts = new Int32Array(NC * NC);
  const cid = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const ix = Math.max(0, Math.min(NC - 1, Math.floor((raw[i * S] + HALF) / CH))), iz = Math.max(0, Math.min(NC - 1, Math.floor((raw[i * S + 2] + HALF) / CH)));
    cid[i] = iz * NC + ix; counts[cid[i]]++;
  }
  const start = new Int32Array(NC * NC + 1);
  for (let c = 0; c < NC * NC; c++) start[c + 1] = start[c] + counts[c];
  const fillAt = start.slice(0, NC * NC);
  const T = new Float32Array(raw.length);
  for (let i = 0; i < count; i++) { const d = fillAt[cid[i]]++; T.set(raw.subarray(i * S, i * S + S), d * S); }
  const chunks = [];
  for (let c = 0; c < NC * NC; c++) if (counts[c]) chunks.push({ s: start[c], n: counts[c], x: -HALF + (c % NC + 0.5) * CH, z: -HALF + (Math.floor(c / NC) + 0.5) * CH, d: 0 });

  const geoHi = [speciesGeometry(0, false, 3), speciesGeometry(1, false, 5), speciesGeometry(2, false, 9)];
  const geoLo = [speciesGeometry(0, true, 3), speciesGeometry(1, true, 5), speciesGeometry(2, true, 9)];
  const atlas = bakeAtlas(renderer, [geoHi[0], speciesGeometry(0, false, 4), geoHi[1], geoHi[2]]);
  const tileOf = (sp, rnd) => (sp === 0 ? (rnd < 0.5 ? 0 : 1) : sp + 1);

  const group = new THREE.Group();
  group.name = 'trees';
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  let tier = TREE_TIERS[quality] || TREE_TIERS.medium;
  const near = [];
  function makeNear(lo) {
    for (const m of near) { group.remove(m); m.dispose(); }
    near.length = 0;
    const geos = lo ? geoLo : geoHi;
    for (let s = 0; s < 3; s++) {
      const m = new THREE.InstancedMesh(geos[s], treeMat, tier.nearCap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tier.nearCap * 3), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = tier.shadows;
      m.name = 'tree-' + SPECIES[s].name;
      near.push(m);
      group.add(m);
    }
  }
  makeNear(tier.lo);

  const MAXFAR = TREE_TIERS.high.farCap;
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXFAR * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iDat = new THREE.InstancedBufferAttribute(new Float32Array(MAXFAR * 4), 4).setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('iPos', iPos);
  quad.setAttribute('iDat', iDat);
  quad.instanceCount = 0;
  const a2c = !!renderer.getContext().getContextAttributes().antialias;
  const far = new THREE.Mesh(quad, impostorMaterial(atlas.texture, a2c));
  far.frustumCulled = false;
  far.name = 'tree-impostors';
  group.add(far);

  const nearN = [0, 0, 0];
  const last = new THREE.Vector3(1e9, 0, 0);
  let dirty = true;
  function refresh(cam) {
    const cx = cam.x, cy = cam.y, cz = cam.z;
    const groundY = ctx.heightAt(cx, cz);
    const alt = Math.max(0, cy - groundY);
    const nearR = tier.nearR, farR = tier.farR;
    const nearR2 = nearR * nearR;
    const vis = [];
    for (const c of chunks) {
      const dx = Math.max(0, Math.abs(c.x - cx) - CH * 0.71), dz = Math.max(0, Math.abs(c.z - cz) - CH * 0.71);
      c.d = Math.hypot(dx, dz, alt);
      if (c.d < farR) vis.push(c);
    }
    vis.sort((a, b) => a.d - b.d);
    nearN[0] = nearN[1] = nearN[2] = 0;
    let nf = 0;
    const P = iPos.array, D = iDat.array;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of vis) {
        if (nf >= tier.farCap) break;
        for (let i = c.s; i < c.s + c.n; i++) {
          const o = i * S;
          const x = T[o], y = T[o + 1], z = T[o + 2], h = T[o + 3], w = T[o + 4], sp = T[o + 7];
          const dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < nearR2 && (pass === 1 || nearN[sp] < tier.nearCap)) {
            if (pass === 1) continue;
            const m = near[sp], k = nearN[sp]++;
            const e = m.instanceMatrix.array, rot = T[o + 5], sh = h / SPECIES[sp].H, sw = w * sh;
            const co = Math.cos(rot) * sw, si = Math.sin(rot) * sw;
            const b = k * 16;
            e[b] = co; e[b + 1] = 0; e[b + 2] = -si; e[b + 3] = 0;
            e[b + 4] = 0; e[b + 5] = sh; e[b + 6] = 0; e[b + 7] = 0;
            e[b + 8] = si; e[b + 9] = 0; e[b + 10] = co; e[b + 11] = 0;
            e[b + 12] = x; e[b + 13] = y; e[b + 14] = z; e[b + 15] = 1;
            const t = T[o + 6], ca = m.instanceColor.array;
            ca[k * 3] = t * (0.9 + (t - 0.78) * 0.5); ca[k * 3 + 1] = t; ca[k * 3 + 2] = t * (1.05 - (t - 0.78) * 0.4);
            continue;
          }
          const edge = T[o + 8] === 1;
          if (edge !== (pass === 0)) continue;
          if (nf >= tier.farCap) break;
          const dd = Math.sqrt(d2);
          if (T[o + 9] > (edge ? Math.max(0.4, 1.5 - dd / (tier.thin * 1.5)) : Math.max(tier.floor, 1.25 - dd / tier.thin))) continue;
          const tile = tileOf(sp, T[o + 9]), dim = atlas.dims[tile];
          const sh = h / SPECIES[sp].H;
          P[nf * 4] = x; P[nf * 4 + 1] = y; P[nf * 4 + 2] = z; P[nf * 4 + 3] = dim[1] * sh;
          D[nf * 4] = dim[0] * w * sh; D[nf * 4 + 1] = tile; D[nf * 4 + 2] = T[o + 6]; D[nf * 4 + 3] = 0;
          nf++;
        }
      }
    }
    for (let s = 0; s < 3; s++) {
      const m = near[s];
      m.count = nearN[s];
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, nearN[s] * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, nearN[s] * 3); m.instanceColor.needsUpdate = true;
    }
    quad.instanceCount = nf;
    iPos.clearUpdateRanges(); iPos.addUpdateRange(0, nf * 4); iPos.needsUpdate = true;
    iDat.clearUpdateRanges(); iDat.addUpdateRange(0, nf * 4); iDat.needsUpdate = true;
    last.copy(cam);
    dirty = false;
  }

  function update(camera) {
    const p = camera.position;
    const alt = Math.max(1, p.y);
    if (dirty || last.distanceToSquared(p) > Math.pow(Math.min(60, 12 + alt * 0.08), 2)) refresh(p);
  }
  function setQuality(q) {
    const t = TREE_TIERS[q];
    if (!t || t === tier) return;
    const rebuild = t.lo !== tier.lo || t.nearCap !== tier.nearCap;
    tier = t;
    if (rebuild) makeNear(tier.lo);
    for (const m of near) m.castShadow = tier.shadows;
    dirty = true;
  }

  return { group, update, setQuality, data: T, stride: S, count, stats: () => ({ total: count, near: nearN.slice(), far: quad.instanceCount }) };
}

// Soft ground shade under trees and buildings, baked once: R channel over [-extent, extent]^2.
export function shadeTexture(extent, size, trees, boxes, gardens = []) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const k = size / (2 * extent);
  const blob = document.createElement('canvas');
  blob.width = blob.height = 32;
  const bg = blob.getContext('2d');
  const grad = bg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,0,0,0.75)');
  grad.addColorStop(0.6, 'rgba(255,0,0,0.55)');
  grad.addColorStop(1, 'rgba(255,0,0,0)');
  bg.fillStyle = grad;
  bg.fillRect(0, 0, 32, 32);
  const sx = -SUN_DIR.x / SUN_DIR.y, sz = -SUN_DIR.z / SUN_DIR.y;
  const { data: T, stride, count } = trees;
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    const x = T[o], z = T[o + 2], h = T[o + 3];
    if (!T[o + 8] || Math.abs(x) > extent || Math.abs(z) > extent) continue;
    const sp = T[o + 7];
    const hc = h * (sp === 2 ? 0.55 : 0.6), rad = (sp === 0 ? h * 0.42 : h * 0.24) * T[o + 4] * 1.2;
    const px = (x + sx * hc + extent) * k, pz = (z + sz * hc + extent) * k, pr = Math.max(1.2, rad * k);
    g.drawImage(blob, px - pr, pz - pr * (sp === 0 ? 1 : 1.6), pr * 2, pr * 2 * (sp === 0 ? 1 : 1.6));
  }
  g.fillStyle = 'rgba(255,0,0,0.5)';
  for (const b of boxes) {
    const h = b.max[1] - b.min[1];
    for (let s = 0; s <= 1.001; s += 0.25) {
      const ox = sx * h * s, oz = sz * h * s;
      g.fillRect((b.min[0] + ox + extent) * k, (b.min[2] + oz + extent) * k, Math.max(1, (b.max[0] - b.min[0]) * k), Math.max(1, (b.max[2] - b.min[2]) * k));
    }
  }
  if (gardens.length) {
    const gc = document.createElement('canvas');
    gc.width = gc.height = size;
    const gg = gc.getContext('2d');
    gg.fillStyle = '#00ff00';
    for (const h of gardens) {
      gg.save();
      gg.translate((h.x + extent) * k, (h.z + extent) * k);
      gg.rotate(-h.ry);
      gg.fillRect((-h.w / 2 - 5) * k, (-h.d / 2 - 30) * k, (h.w + 10) * k, (h.d + 40) * k);
      gg.restore();
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.filter = 'blur(1.5px)';
    g.drawImage(gc, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

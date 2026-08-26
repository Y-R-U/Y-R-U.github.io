// The ground: ONE streamed ribbon driven by world.terrain.heightAt(x), plus a mid ridge behind it,
// vegetation on the crest, and water sparkle. The sim owns the heightfield; we only draw it.
//
// ONE MESH COVERS LAND AND WATER. `heightAt` already returns the water line over sea, so the
// silhouette, the horizon curve and the shoreline junction can never disagree — the 2D agent's
// recorded mistake was curving the land horizon but not the water one (ART_NOTES §2).
//
// SHAPE PER COLUMN, and why the top edge is exactly at z = 0:
//   A (x, h,      0)    the silhouette edge — at z=0 so screen y == sim y, exactly
//   B (x, h-CH,   FZ)   lit chamfer bottom; the grassy crest that catches the low sun
//   C (x, FLOOR,  FZ)   the near-black earth face, ART.md §1's silhouette band
// Anything with z < 0 would poke ABOVE A on screen and steal the silhouette, so nothing does.

import * as THREE from 'three';
import { rng } from './bake.js';
import { mix, shade } from './palette.js';
import { MAT, patchCurve, makeTex, makeBin } from './materials.js';
import { getPlate } from './plates.js';

const CHUNK = 1200;      // world units per chunk
const STEP = 24;         // sample spacing
const CH_H = 34;         // chamfer drop
const FZ = 200;          // chamfer/front-face z
const FLOOR = -1600;
const KEEP = 2;          // chunks kept either side of the visible span

const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

// Per-biome surface treatment for the lit chamfer. This is the cheapest biome signal there is —
// it costs nothing but vertex colours and it is the difference between "a green strip" and
// "farmland". Everything here is a function of x alone, so it is stable across chunk rebuilds.
function surfaceOf(pal) {
  const b = pal.biome;
  const E = pal.earth;
  const grassTop = mix(E.grass, E.rim, 0.60);
  const grassBot = shade(E.grass, -0.34);

  if (b === 'farmland') {
    // field strips: a hedged patchwork, boundaries every ~380-900 units
    const tints = [mix(grassTop, '#8a8a48', 0.30), shade(grassTop, -0.16), mix(grassTop, E.rim, 0.28), shade(grassTop, 0.10)];
    return (x) => {
      const f = Math.floor(x / 470 + hash(Math.floor(x / 1900)) * 2);
      const edge = Math.abs((x / 470) % 1 - 0.5) > 0.46;      // the hedgerow line itself
      const c = tints[Math.floor(hash(f * 1.7) * tints.length) % tints.length];
      return [edge ? shade(pal.band.treeline, 0.05) : c, grassBot];
    };
  }
  if (b === 'city') {
    // paved blocks and rubble, cut by the odd lighter street
    const rubble = mix(E.grass, E.albedo, 0.35);
    const paved = shade(mix(E.grass, '#6a6672', 0.45), -0.05);
    return (x) => {
      const f = Math.floor(x / 210);
      const h1 = hash(f * 2.3);
      const street = h1 > 0.86;
      return [street ? shade(paved, 0.22) : (h1 > 0.45 ? paved : rubble), grassBot];
    };
  }
  if (b === 'desert') {
    // wind ripples: a long sine crossed with a short one, warm on the crests
    const hot = mix(grassTop, E.rim, 0.45), cool = shade(grassTop, -0.20);
    return (x) => [mix(cool, hot, 0.5 + 0.5 * Math.sin(x * 0.0042) * Math.sin(x * 0.017)), grassBot];
  }
  if (b === 'coast' || b === 'sea') {
    // a sand shelf near the water line, grass above it
    const sand = mix(grassTop, '#c2ac86', 0.55);
    return (x, h) => [h < 40 ? mix(sand, grassTop, Math.max(0, h / 40)) : grassTop, grassBot];
  }
  return () => [grassTop, grassBot];
}

function buildChunk(i, terrain, pal) {
  const x0 = i * CHUNK;
  const cols = Math.ceil(CHUNK / STEP) + 1;
  const pos = new Float32Array(cols * 4 * 3);
  const col = new Float32Array(cols * 4 * 3);
  const wat = new Float32Array(cols * 4);
  const idx = [];

  const isSea = terrain.waterY !== null;
  const W = pal.water;
  const faceTop = pal.earth.albedo;
  const faceBot = pal.earth.deep;
  const snow = pal.earth.snow;
  const surf = surfaceOf(pal);

  // Two passes: the shoreline needs to know about its NEIGHBOURS, and a foam line where the water
  // meets the land is most of what makes a shore read as a shore rather than as a colour change.
  const hs = new Float64Array(cols), wet = new Uint8Array(cols);
  for (let j = 0; j < cols; j++) {
    const x = x0 + j * STEP;
    hs[j] = terrain.heightAt(x);
    wet[j] = isSea && terrain.waterAt(x) !== null ? 1 : 0;
  }

  const c = new THREE.Color();
  const put = (o, hex, k) => { c.set(hex); if (k) c.multiplyScalar(k); c.toArray(col, o * 3); };

  for (let j = 0; j < cols; j++) {
    const x = x0 + j * STEP;
    const h = hs[j];
    const water = !!wet[j];
    const jt = 0.88 + hash(x * 0.037) * 0.24;
    const o = j * 4;

    pos[(o + 0) * 3] = x; pos[(o + 0) * 3 + 1] = h;        pos[(o + 0) * 3 + 2] = 0;
    pos[(o + 1) * 3] = x; pos[(o + 1) * 3 + 1] = h - CH_H;  pos[(o + 1) * 3 + 2] = FZ;
    pos[(o + 2) * 3] = x; pos[(o + 2) * 3 + 1] = h - CH_H;  pos[(o + 2) * 3 + 2] = FZ;
    pos[(o + 3) * 3] = x; pos[(o + 3) * 3 + 1] = FLOOR;     pos[(o + 3) * 3 + 2] = FZ;

    if (water) {
      const shore = (j > 0 && !wet[j - 1]) || (j < cols - 1 && !wet[j + 1]);
      const swell = 0.5 + 0.5 * Math.sin(x * 0.0031) * Math.sin(x * 0.0119 + 1.3);
      const top = W ? mix(W.shallow, W.deep, 0.15 + swell * 0.35) : '#2f6f90';
      put(o + 0, shore && W ? mix(top, W.foam, 0.62) : top, jt);
      put(o + 1, W ? mix(W.shallow, W.deep, 0.62 + swell * 0.18) : '#1f4c68', jt);
      put(o + 2, W ? mix(W.shallow, W.deep, 0.80) : '#1f4c68');
      put(o + 3, W ? W.deep : '#12293a');
      wat[o] = wat[o + 1] = wat[o + 2] = wat[o + 3] = 1;
    } else {
      const [gt, gb] = surf(x, h);
      const snowK = snow ? Math.max(0, Math.min(1, (h - 40) / 120)) : 0;
      const beach = isSea && ((j > 0 && wet[j - 1]) || (j < cols - 1 && wet[j + 1]));
      const t0 = snowK > 0.02 ? mix(gt, snow, snowK) : gt;
      put(o + 0, beach && W ? mix(t0, W.foam, 0.42) : t0, jt);
      put(o + 1, snowK > 0.02 ? mix(gb, snow, snowK * 0.6) : gb, jt);
      put(o + 2, faceTop, jt * 0.98);
      put(o + 3, faceBot);
    }

    if (j < cols - 1) {
      const a = o, b = o + 4;
      idx.push(a, a + 1, b + 1, a, b + 1, b);          // chamfer
      idx.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2); // front face
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aWater', new THREE.BufferAttribute(wat, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeTerrain(camApi) {
  const bin = makeBin();
  const root = new THREE.Group();

  const groundMat = MAT.ground();
  groundMat.shadowSide = THREE.FrontSide;

  const glintMat = patchCurve(new THREE.MeshBasicMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0,
  }));

  // A sparkle band on the sea surface: scrolling randomised streaks, not a ruled grid.
  const glintGeo = new THREE.PlaneGeometry(1, 1, 24, 1);
  const glint = patchCurve ? new THREE.Mesh(glintGeo, glintMat) : new THREE.Mesh(glintGeo, glintMat);
  glint.frustumCulled = false;
  glint.renderOrder = 5;
  glint.visible = false;
  root.add(glint);

  const chunks = new Map();   // i -> { mesh, ridge }
  let terrain = null, pal = null, palKey = '', glintTex = null, dressMat = null;

  function chunkFor(i) {
    let c = chunks.get(i);
    if (c) return c;
    const geo = buildChunk(i, terrain, pal);
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    root.add(mesh);

    c = { geo, mesh };
    chunks.set(i, c);
    return c;
  }

  function clearChunks() {
    for (const c of chunks.values()) {
      root.remove(c.mesh); c.geo.dispose();
    }
    chunks.clear();
  }

  // ---- GROUND DRESSING: two instanced slots of biome furniture standing on the crest.
  //
  // This is the second half of "biomes express themselves" (the first half is the two background
  // plates). It is what stops a city level growing bushes. Slot A is the biome's soft/organic
  // element, slot B its hard/structural one; both are ONE InstancedMesh each, so the whole thing
  // costs two draw calls however many pieces are on screen.
  const DRESS_CAP = 190;

  // kind -> unit geometry, authored around the origin and scaled at placement time.
  function dressGeo(kind) {
    switch (kind) {
      case 'conifer':  return new THREE.ConeGeometry(0.5, 1.6, 5, 1);
      case 'poplar':   return new THREE.ConeGeometry(0.30, 1.9, 5, 1);
      case 'scrub':    return new THREE.SphereGeometry(0.5, 5, 3);
      case 'boulder':  return new THREE.DodecahedronGeometry(0.55, 0);
      case 'chimney':  return new THREE.CylinderGeometry(0.16, 0.26, 1.0, 6, 1);
      case 'cactus':   return new THREE.CylinderGeometry(0.22, 0.26, 1.0, 6, 1);
      case 'block':    return new THREE.BoxGeometry(1, 1, 1);
      default:         return new THREE.SphereGeometry(0.55, 6, 4);   // broadleaf
    }
  }

  // biome -> [slotA, slotB]. `spacing` is world units between candidate sites, `k` the density
  // gate, `lo/hi` the size range, `flat` squashes width against height.
  function dressPlan(p) {
    const B = p.biome;
    const soft = [shade(mix(p.earth.grass, p.earth.deep, 0.55), -0.15), mix(p.earth.grass, p.earth.rim, 0.22)];
    const hard = [shade(p.prop.dark, -0.10), mix(p.prop.body, p.earth.rim, 0.18)];
    const rock = [shade(mix(p.earth.albedo, p.earth.grass, 0.4), -0.05), mix(p.earth.rim, p.earth.grass, 0.5)];
    if (B === 'city') return [
      // ruined masonry: boxes of wildly different heights read as broken walls, not as bushes
      { kind: 'block', col: hard, spacing: 40, k: 0.62, lo: 26, hi: 96, wide: 1.5, flat: 0.9, wet: false },
      { kind: 'chimney', col: [shade(p.prop.dark, -0.2), p.prop.roof], spacing: 150, k: 0.42, lo: 70, hi: 160, wide: 0.34, flat: 1, wet: false },
    ];
    if (B === 'alpine') return [
      { kind: 'conifer', col: soft, spacing: 44, k: 0.92, lo: 30, hi: 76, wide: 0.9, flat: 1.5, wet: false },
      { kind: 'boulder', col: rock, spacing: 130, k: 0.5, lo: 22, hi: 52, wide: 1.4, flat: 0.7, wet: false },
    ];
    if (B === 'desert') return [
      { kind: 'boulder', col: rock, spacing: 62, k: 1.0, lo: 18, hi: 46, wide: 1.5, flat: 0.6, wet: false },
      { kind: 'cactus', col: [shade(p.earth.grass, -0.3), mix(p.earth.grass, p.earth.rim, 0.3)], spacing: 130, k: 0.9, lo: 40, hi: 82, wide: 0.30, flat: 1, wet: false },
    ];
    if (B === 'coast') return [
      { kind: 'scrub', col: soft, spacing: 60, k: 0.55, lo: 20, hi: 44, wide: 1.2, flat: 0.7, wet: false },
      // pilings only where the ground is at or near the water line — a jetty in a field is worse
      // than no jetty at all.
      { kind: 'block', col: [shade(p.prop.dark, -0.15), p.prop.roof], spacing: 34, k: 0.7, lo: 26, hi: 52, wide: 0.22, flat: 1, wet: true },
    ];
    if (B === 'sea') return [null, null];
    return [   // farmland and anything unknown
      { kind: 'broadleaf', col: soft, spacing: 52, k: 0.95, lo: 26, hi: 56, wide: 1.15, flat: 0.95, wet: false },
      // hedgerows: long, low and dark. The single strongest "this is farmland" mark at 35 px.
      { kind: 'block', col: [shade(mix(p.earth.grass, p.earth.deep, 0.7), -0.2), mix(p.earth.grass, p.earth.rim, 0.15)], spacing: 96, k: 0.8, lo: 14, hi: 24, wide: 5.0, flat: 1, wet: false },
    ];
  }

  const slots = [];   // { mesh, spec }
  function buildDress() {
    for (const s of slots) { root.remove(s.mesh); s.mesh.geometry.dispose(); }
    slots.length = 0;
    if (!pal) return;
    const plan = dressPlan(pal);
    dressMat = dressMat || MAT.prop({ flatShading: true });
    for (let si = 0; si < plan.length; si++) {
      const spec = plan[si];
      if (!spec) continue;
      const g = dressGeo(spec.kind);
      const n = g.attributes.position.count;
      const cols = new Float32Array(n * 3);
      // NEAR dressing is a silhouette, so it takes its colour from the earth, not from the hazed
      // distant treeline — the distant tint made foreground trees read as pale tan blobs.
      const c1 = new THREE.Color(spec.col[0]), c2 = new THREE.Color(spec.col[1]);
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, Math.min(1, (g.attributes.position.getY(i) - lo) / Math.max(0.001, hi - lo)));
        const c = c1.clone().lerp(c2, t * 0.85);
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const mesh = new THREE.InstancedMesh(g, dressMat, DRESS_CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.userData.lo = lo; mesh.userData.hi = hi;
      root.add(mesh);
      slots.push({ mesh, spec, si });
    }
  }

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3();
  let lastVegX = 1e9;

  function placeDress(x0, x1) {
    if (!terrain || !slots.length) return;
    if (Math.abs(x0 - lastVegX) < 10) return;
    lastVegX = x0;
    const K = pal.vegK;
    for (const s of slots) {
      const sp = s.spec;
      let n = 0;
      const i0 = Math.floor(x0 / sp.spacing), i1 = Math.ceil(x1 / sp.spacing);
      const salt = 13.7 * (s.si + 1);
      for (let i = i0; i <= i1 && n < DRESS_CAP; i++) {
        // clustering: a low-frequency mask gates a high-frequency scatter
        const clump = hash(i * 0.031 + salt) * 0.6 + hash(i * 0.0071 + salt) * 0.4;
        if (clump > sp.k * (0.35 + K * 0.75) + 0.12) continue;
        if (hash(i * 7.77 + salt) > 0.74) continue;
        const x = i * sp.spacing + (hash(i * 3.3 + salt) - 0.5) * sp.spacing * 0.9;
        const wetHere = terrain.waterAt ? terrain.waterAt(x) !== null : false;
        const h = terrain.heightAt(x);
        if (sp.wet) { if (!wetHere && h > 26) continue; }
        else if (wetHere) continue;
        const sc = sp.lo + hash(i * 1.7 + salt) * (sp.hi - sp.lo);
        const hgt = sc * sp.flat;
        Pv.set(x, h + hgt * 0.5 - 6, 10 + hash(i * 5.1 + salt) * 90);
        S.set(sc * sp.wide, hgt, sc * Math.min(1.2, sp.wide));
        Q.set(0, 0, 0, 1);
        M.compose(Pv, Q, S);
        s.mesh.setMatrixAt(n++, M);
      }
      s.mesh.count = n;
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    root, groundMat,

    setPalette(p, key) {
      pal = p; palKey = key;
      bin.dispose();
      glintTex = bin.keep(makeTex(getPlate('water', p, key), { wrapX: true, wrapY: true, repeatX: 6, repeatY: 3 }));
      glintMat.map = glintTex;
      glintMat.color.set(p.water ? p.water.glint : '#ffffff');
      glintMat.opacity = p.water ? p.water.specK * 0.85 : 0;
      glintMat.visible = !!p.water;
      glintMat.needsUpdate = true;
      clearChunks();
      buildDress();
    },

    setTerrain(t) { terrain = t; clearChunks(); lastVegX = 1e9; },
    refit() {},

    update(camX, camY, vw, t) {
      if (!terrain || !pal) return;
      const x0 = camX - vw * 0.62, x1 = camX + vw * 0.62;
      const i0 = Math.floor(x0 / CHUNK), i1 = Math.floor(x1 / CHUNK);
      for (let i = i0; i <= i1; i++) chunkFor(i);
      for (const [i, c] of chunks) {
        if (i < i0 - KEEP || i > i1 + KEEP) {
          root.remove(c.mesh); c.geo.dispose();
          chunks.delete(i);
        }
      }
      placeDress(x0, x1);

      glint.visible = !!pal.water && glintMat.visible;
      if (glint.visible) {
        const gw = vw * 1.25, gh = 210;
        glint.scale.set(gw, gh, 1);
        glint.position.set(camX, -gh * 0.34, FZ + 3);
        glintTex.repeat.set(gw / 900, 1);
      }
      if (glintTex) { glintTex.offset.x = (camX * 0.0006 + t * 0.012) % 1; glintTex.offset.y = (t * 0.02) % 1; }
    },

    chunkCount() { return chunks.size; },
    setVegVisible(v) { for (const s of slots) s.mesh.visible = v; },
    dispose() {
      clearChunks(); bin.dispose(); groundMat.dispose(); glintMat.dispose();
      for (const s of slots) s.mesh.geometry.dispose();
      slots.length = 0;
      glintGeo.dispose();
      if (dressMat) dressMat.dispose();
    },
  };
}

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

function buildChunk(i, terrain, pal) {
  const x0 = i * CHUNK;
  const cols = Math.ceil(CHUNK / STEP) + 1;
  const pos = new Float32Array(cols * 4 * 3);
  const col = new Float32Array(cols * 4 * 3);
  const wat = new Float32Array(cols * 4);
  const idx = [];

  const isSea = terrain.waterY !== null;
  const W = pal.water;
  const grassTop = mix(pal.earth.grass, pal.earth.rim, 0.60);
  const grassBot = shade(pal.earth.grass, -0.34);
  const faceTop = pal.earth.albedo;
  const faceBot = pal.earth.deep;
  const snow = pal.earth.snow;

  const c = new THREE.Color();
  const put = (o, hex, k) => { c.set(hex); if (k) c.multiplyScalar(k); c.toArray(col, o * 3); };

  for (let j = 0; j < cols; j++) {
    const x = x0 + j * STEP;
    const h = terrain.heightAt(x);
    const water = isSea && terrain.waterAt(x) !== null;
    const jt = 0.88 + hash(x * 0.037) * 0.24;
    const o = j * 4;

    pos[(o + 0) * 3] = x; pos[(o + 0) * 3 + 1] = h;        pos[(o + 0) * 3 + 2] = 0;
    pos[(o + 1) * 3] = x; pos[(o + 1) * 3 + 1] = h - CH_H;  pos[(o + 1) * 3 + 2] = FZ;
    pos[(o + 2) * 3] = x; pos[(o + 2) * 3 + 1] = h - CH_H;  pos[(o + 2) * 3 + 2] = FZ;
    pos[(o + 3) * 3] = x; pos[(o + 3) * 3 + 1] = FLOOR;     pos[(o + 3) * 3 + 2] = FZ;

    if (water) {
      put(o + 0, W ? W.shallow : '#2f6f90', jt);
      put(o + 1, W ? mix(W.shallow, W.deep, 0.55) : '#1f4c68', jt);
      put(o + 2, W ? mix(W.shallow, W.deep, 0.75) : '#1f4c68');
      put(o + 3, W ? W.deep : '#12293a');
      wat[o] = wat[o + 1] = wat[o + 2] = wat[o + 3] = 1;
    } else {
      const snowK = snow ? Math.max(0, Math.min(1, (h - 40) / 120)) : 0;
      put(o + 0, snowK > 0.02 ? mix(grassTop, snow, snowK) : grassTop, jt);
      put(o + 1, snowK > 0.02 ? mix(grassBot, snow, snowK * 0.6) : grassBot, jt);
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
  let terrain = null, pal = null, palKey = '', glintTex = null, veg = null, vegMat = null;

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

  // ---- vegetation: clustered, size-varied, standing on the crest so it breaks the silhouette
  const VEG_CAP = 260;
  function buildVeg() {
    if (veg) { root.remove(veg); veg.geometry.dispose(); veg = null; }
    if (!pal || pal.vegK <= 0.02) return;
    const conifer = pal.veg === 'conifer';
    const g = conifer
      ? new THREE.ConeGeometry(0.5, 1.6, 5, 1)
      : new THREE.SphereGeometry(0.55, 6, 4);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    // NEAR vegetation is a silhouette, so it takes its colour from the earth, not from the hazed
    // distant treeline — using the distant tint made foreground trees read as pale tan blobs.
    const c1 = new THREE.Color(shade(mix(pal.earth.grass, pal.earth.deep, 0.55), -0.15));
    const c2 = new THREE.Color(mix(pal.earth.grass, pal.earth.rim, 0.22));
    for (let i = 0; i < n; i++) {
      const yy = g.attributes.position.getY(i);
      const t = Math.max(0, Math.min(1, yy + 0.5));
      const c = c1.clone().lerp(c2, t * 0.8);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    vegMat = vegMat || MAT.prop({ flatShading: true });
    veg = new THREE.InstancedMesh(g, vegMat, VEG_CAP);
    veg.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    veg.castShadow = false;
    veg.frustumCulled = false;
    veg.count = 0;
    root.add(veg);
  }

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3();
  let lastVegX = 1e9;

  function placeVeg(x0, x1) {
    if (!veg || !terrain) return;
    if (Math.abs(x0 - lastVegX) < 10) return;
    lastVegX = x0;
    const conifer = pal.veg === 'conifer';
    let n = 0;
    const SPACING = 46;
    const i0 = Math.floor(x0 / SPACING), i1 = Math.ceil(x1 / SPACING);
    for (let i = i0; i <= i1 && n < VEG_CAP; i++) {
      // clustering: a low-frequency mask gates a high-frequency scatter
      const clump = hash(i * 0.031) * 0.6 + hash(i * 0.0071) * 0.4;
      if (clump > pal.vegK * 0.95 + 0.12) continue;
      if (hash(i * 7.77) > 0.72) continue;
      const x = i * SPACING + (hash(i * 3.3) - 0.5) * SPACING * 0.9;
      if (terrain.waterAt && terrain.waterAt(x) !== null) continue;
      const h = terrain.heightAt(x);
      const sc = 26 + hash(i * 1.7) * (conifer ? 46 : 30);
      Pv.set(x, h + sc * (conifer ? 0.72 : 0.5) - 6, 10 + hash(i * 5.1) * 90);
      S.set(sc * (conifer ? 0.9 : 1.15), sc * (conifer ? 1.5 : 0.95), sc);
      Q.set(0, 0, 0, 1);
      M.compose(Pv, Q, S);
      veg.setMatrixAt(n++, M);
    }
    veg.count = n;
    veg.instanceMatrix.needsUpdate = true;
  }

  return {
    root, groundMat,

    setPalette(p, key) {
      pal = p; palKey = key;
      bin.dispose();
      glintTex = bin.keep(makeTex(getPlate('water', p, key), { wrapX: true, wrapY: true, repeatX: 6, repeatY: 3 }));
      glintMat.map = glintTex;
      glintMat.color.set(p.water ? p.water.glint : '#ffffff');
      glintMat.opacity = p.water ? p.water.specK * 0.5 : 0;
      glintMat.visible = !!p.water;
      glintMat.needsUpdate = true;
      clearChunks();
      buildVeg();
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
      placeVeg(x0, x1);

      glint.visible = !!pal.water && glintMat.visible;
      if (glint.visible) {
        const gw = vw * 1.25, gh = 150;
        glint.scale.set(gw, gh, 1);
        glint.position.set(camX, -gh * 0.42, FZ + 3);
        glintTex.repeat.set(gw / 900, 1);
      }
      if (glintTex) { glintTex.offset.x = (camX * 0.0006 + t * 0.012) % 1; glintTex.offset.y = (t * 0.02) % 1; }
    },

    chunkCount() { return chunks.size; },
    setVegVisible(v) { if (veg) veg.visible = v; },
    dispose() {
      clearChunks(); bin.dispose(); groundMat.dispose(); glintMat.dispose();
      if (veg) veg.geometry.dispose();
      glintGeo.dispose();
      if (vegMat) vegMat.dispose();
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Collects static geometry per (material, spatial cell) and merges each bucket into one mesh.
// Cells keep frustum/shadow culling useful while holding draw calls to materials x visible cells.
export function createBatcher({ cell = 48 } = {}) {
  const buckets = new Map();
  const tmpM = new THREE.Matrix4();
  const white = new THREE.Color(1, 1, 1);
  const b = {
    add(geom, material, { matrix = null, color = null, cast = 'auto', receive = true, reflect = 'auto', cellKey = null } = {}) {
      let g = geom.index ? geom.clone() : geom.clone();
      if (!g.index) { const n = g.attributes.position.count; const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (matrix) g.applyMatrix4(matrix);
      const n = g.attributes.position.count, c = color || white;
      const ca = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      g.computeBoundingSphere();
      const cen = g.boundingSphere.center, rad = g.boundingSphere.radius;
      // small props skip the mirror pass and the shadow pass; they cost draw calls, not looks
      if (reflect === 'auto') reflect = material.userData.reflect ?? rad > (material.userData.reflectMin ?? 2.2);
      if (cast === 'auto') cast = rad > 0.5;
      const ck = cellKey ?? `${Math.floor(cen.x / cell)},${Math.floor(cen.z / cell)}`;
      const key = `${material.uuid}|${ck}|${cast ? 1 : 0}${receive ? 1 : 0}${reflect ? 1 : 0}`;
      let bk = buckets.get(key);
      if (!bk) { bk = { material, geoms: [], cast, receive, reflect }; buckets.set(key, bk); }
      bk.geoms.push(g);
      return g;
    },
    // Convenience: position/rotation/scale → matrix
    put(geom, material, pos, rotY = 0, scale = null, opts = {}) {
      tmpM.compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), scale || new THREE.Vector3(1, 1, 1));
      return b.add(geom, material, { ...opts, matrix: tmpM });
    },
    build(parent) {
      let meshes = 0, tris = 0;
      for (const bk of buckets.values()) {
        const g = mergeGeometries(bk.geoms, false);
        bk.geoms.forEach((x) => x.dispose());
        if (!g) continue;
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, bk.material);
        m.castShadow = bk.cast; m.receiveShadow = bk.receive;
        m.matrixAutoUpdate = false; m.updateMatrix();
        if (bk.reflect) m.layers.enable(REFLECT_LAYER);
        parent.add(m); meshes++; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
      buckets.clear();
      return { meshes, tris };
    },
  };
  return b;
}

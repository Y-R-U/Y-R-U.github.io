// Static-geometry baking. Triangles have huge headroom on this project and draw calls have none
// (Wave C measured 132k of 260k tris against 195+ calls of 120), so anything that never moves is
// worth flattening into one mesh per material.

import * as THREE from 'three';

const M = new THREE.Matrix4();
const N = new THREE.Matrix3();

// Every geometry in a batch has to agree on its attribute set or the merged buffer is nonsense.
const ATTRS = ['position', 'normal', 'uv'];

function bakeOne(geo, matrix, out) {
  const idx = geo.index ? geo.index.array : null;
  const count = geo.attributes.position.count;
  const base = out.position.length / 3;
  N.getNormalMatrix(matrix);
  const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    out.position.push(v.x, v.y, v.z);
    v.fromBufferAttribute(n, i).applyMatrix3(N).normalize();
    out.normal.push(v.x, v.y, v.z);
    out.uv.push(u.getX(i), u.getY(i));
  }
  if (idx) for (let i = 0; i < idx.length; i++) out.index.push(base + idx[i]);
  else for (let i = 0; i < count; i++) out.index.push(base + i);
}

// Objects that share a material AND a shadow role can become one mesh. `pick` returns false for
// anything that must keep its own draw call — instance colours, per-object visibility, a renderOrder
// the merge would flatten.
export function bakeStatic(root, pick = () => true) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();

  root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || !o.visible) return;
    if (o.isInstancedMesh && o.instanceColor) return;
    const g = o.geometry;
    if (!g || ATTRS.some(a => !g.attributes[a])) return;
    if (Object.keys(g.attributes).some(a => !ATTRS.includes(a))) return;
    if (!pick(o)) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });

  let saved = 0;
  for (const list of groups.values()) {
    const total = list.reduce((n, o) => n + (o.isInstancedMesh ? o.count : 1), 0);
    if (list.length < 2 || total < 2) continue;
    const out = { position: [], normal: [], uv: [], index: [] };
    for (const o of list) {
      M.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4(), w = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im);
          bakeOne(o.geometry, w.multiplyMatrices(M, im), out);
        }
      } else bakeOne(o.geometry, M, out);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
    g.setIndex(out.index);
    g.computeBoundingSphere();

    const proto = list[0];
    const mesh = new THREE.Mesh(g, proto.material);
    mesh.castShadow = proto.castShadow;
    mesh.receiveShadow = proto.receiveShadow;
    mesh.renderOrder = proto.renderOrder;
    mesh.name = 'baked';
    // never dispose(): one BoxGeometry backs half the room's instanced meshes and other batches
    // still point at it
    for (const o of list) o.parent?.remove(o);
    root.add(mesh);
    saved += list.length - 1;
  }
  return saved;
}

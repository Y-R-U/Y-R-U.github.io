// Every static thing in the world lands here and comes out as ~5 draw calls.
//
// Vertex colours are the whole point: with colour in the geometry, a thatched roof, a rock and a
// cabbage can share one material, so the scene merges down to one mesh per material class
// regardless of how many props it contains. There are no textures to budget.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CLASSES = ['solid', 'foliage', 'glossy', 'glow', 'water'];

export function makeMaterials(shader = 'lambert') {
  const Base = shader === 'standard' ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
  const std = shader === 'standard' ? { roughness: 0.92, metalness: 0 } : {};
  return {
    solid: new Base({ vertexColors: true, ...std }),
    // Two-sided: leaf cards and grass blades are seen from behind constantly at an iso angle,
    // and a black hole in a canopy is far more expensive to the eye than the fill rate is.
    foliage: new Base({ vertexColors: true, side: THREE.DoubleSide, ...std }),
    glossy: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 34, specular: 0x2a2f33 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 34, specular: 0x9fb8c8,
      transparent: true, opacity: 0.86, depthWrite: false,
    }),
  };
}

// mergeGeometries needs every input to carry an identical attribute set, and it fails by returning
// null — which surfaces much later as a blank scene. One geometry built straight from a three
// primitive (uv, no color) is enough to take the whole batch down, so square them up on the way in.
function normalise(g) {
  if (g.index) { const f = g.toNonIndexed(); g.copy(f); f.dispose(); }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  }
  return g;
}

export class Batch {
  constructor(materials) {
    this.materials = materials;
    this.object3D = new THREE.Group();
    this.pending = new Map(CLASSES.map(c => [c, []]));
    this.meshes = {};
    this.tris = 0;
  }

  // `m` is an optional THREE.Matrix4 (see shape.matrix). The geometry is consumed — do not
  // reuse it afterwards unless you pass a matrix, which clones internally.
  push(geo, m = null, cls = 'solid') {
    if (!geo) return this;
    const g = m ? geo.clone().applyMatrix4(m) : geo;
    if (m) g.computeVertexNormals();
    normalise(g);
    this.pending.get(cls).push(g);
    this.tris += g.attributes.position.count / 3;
    return this;
  }

  build({ castShadow = true, receiveShadow = true } = {}) {
    for (const cls of CLASSES) {
      const list = this.pending.get(cls);
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      for (const g of list) if (g !== merged) g.dispose();
      const mesh = new THREE.Mesh(merged, this.materials[cls]);
      mesh.castShadow = castShadow && cls !== 'water' && cls !== 'glow';
      mesh.receiveShadow = receiveShadow && cls !== 'glow';
      mesh.name = cls;
      // A merged world mesh spans the whole diorama, so per-object culling can only ever
      // throw away a frame's worth of work by getting the bounds wrong.
      mesh.frustumCulled = false;
      this.meshes[cls] = mesh;
      this.object3D.add(mesh);
      list.length = 0;
    }
    return this.object3D;
  }

  dispose() {
    for (const m of Object.values(this.meshes)) m.geometry.dispose();
    this.object3D.clear();
    this.meshes = {};
    this.tris = 0;
  }
}

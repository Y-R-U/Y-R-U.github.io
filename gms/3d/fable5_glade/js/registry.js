// Every object placed in the glade registers here so the debug panel can
// list, count, and focus it.
//
// Entry shape:
//   { name, category, icon, object,            — object: top-level Object3D in the scene
//     collider: { r }                          — dynamic circle centred on object, or
//               { points: [{x, z, r}, ...] }   — static world-space circles, or null
//     pickup: { kind } | null,                 — collectible kind (coin/potion/...)
//     note }                                   — one-liner shown in the debug panel
// Runtime adds: id, dead, tris.

export const registry = [];

export function register(entry) {
  entry.id = registry.length;
  entry.dead = false;
  registry.push(entry);
  return entry;
}

export const liveColliders = () => registry.filter(e => e.collider && !e.dead);
export const livePickups = () => registry.filter(e => e.pickup && !e.dead);

export function countTris(object) {
  let n = 0;
  object.traverse(o => {
    if ((o.isMesh || o.isInstancedMesh) && o.geometry) {
      const g = o.geometry;
      let t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      if (o.isInstancedMesh) t *= o.count;
      n += t;
    }
  });
  return Math.round(n);
}

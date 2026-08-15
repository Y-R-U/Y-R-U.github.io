// Which agents the rig draws this frame, and which InstancedMesh seat each one gets. Split out of
// vermin.js because it is the one piece of that file a node test can reach, and because getting it
// wrong is invisible: a creature dropped out of the draw list looks like a creature that was never
// there, which is exactly what a fight must never do.

import { STATE } from '../sim/foes.js';

// Pinned means "in a fight, or still being buried" — anything the world is not finished with.
export const pinned = a => !!a.state && a.state !== STATE.dead;

// One InstancedMesh per (kind, zone), and this many bodies in it.
export const PER_MESH = 16;

// How many of that mesh's seats are still free. A creature the spawner owns holds one from the
// moment it is placed until it is removed, corpse included — count `pinned` instead and a body
// still being buried would have its seat taken by the rat that replaced it. Vermin.add() asks
// this before it agrees to place anything: an invisible enemy is worse than a missing one.
export function seatsLeft(agents, kind, zi) {
  let n = 0;
  for (const a of agents) if (a.state && a.kind === kind && a.zi === zi) n++;
  return PER_MESH - n;
}

// Anything in a fight goes to the front and stays in, whatever the ambience budget says. The rest
// is nearest-camera-first, which is all the ambient population ever needed.
export function roster(agents, count, cam = null, cap = Infinity) {
  const held = [], rest = [];
  for (const a of agents) (pinned(a) ? held : rest).push(a);
  if (cam) {
    const cx = cam.position.x, cz = cam.position.z;
    rest.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
  }
  return held.concat(rest).slice(0, Math.min(cap, Math.max(count | 0, held.length)));
}

// One mesh per (kind, zone), each carrying `perMesh` bodies. Filled in roster order, so a seat is
// never taken from a fight by a wanderer standing nearer the camera.
export function buckets(active, perMesh) {
  const by = new Map();
  for (const a of active) {
    const key = `${a.kind}:${a.zi}`;
    const list = by.get(key) || by.set(key, []).get(key);
    if (list.length < perMesh) list.push(a);
  }
  return by;
}

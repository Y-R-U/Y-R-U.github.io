// Which agents the rig draws this frame, and which InstancedMesh seat each one gets. Split out of
// vermin.js because it is the one piece of that file a node test can reach, and because getting it
// wrong is invisible: a creature dropped out of the draw list looks like a creature that was never
// there, which is exactly what a fight must never do.

// Pinned means "in a fight, or still being buried" — anything the world is not finished with.
// `state` is whatever a rig chooses to put there; only the string 'dead' releases the seat.
export const pinned = a => !!a.state && a.state !== 'dead';

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
  if (cam) nearestFirst(rest, cam);
  return held.concat(rest).slice(0, Math.min(cap, Math.max(count | 0, held.length)));
}

function nearestFirst(list, cam) {
  const cx = cam.position.x, cz = cam.position.z;
  list.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
}

// The fowl rig's draw list. A bird the world is walking home is pinned the way a fighting creature
// is: the flock knob sizes the ambience around it rather than competing with it, and at `flock = 0`
// the escorted hen is still drawn.
export function penned(agents, count, cam = null, cap = Infinity) {
  const held = [], rest = [];
  for (const a of agents) (a.pin ? held : rest).push(a);
  if (cam) nearestFirst(rest, cam);
  return held.concat(rest).slice(0, Math.min(cap, Math.max(count | 0, held.length)));
}

// Same invariant on the people rig: a named NPC is a fixed body a quest sends you to, so the crowd
// knob sizes the wanderers around it rather than competing with it.
export function crowd(agents, count) {
  const held = [], rest = [];
  for (const a of agents) (a.npc ? held : rest).push(a);
  return held.concat(rest.slice(0, Math.max(0, count | 0)));
}

// One InstancedMesh per (zone, variant) on the people rig, and this many bodies in it.
export const PER_CROWD_MESH = 32;

// The people rig's `seatsLeft`. Being in `active` is not a seat: `crowd()` only promises a named
// body is at the front of the list, and a bucket with more than PER_CROWD_MESH named bodies in it
// draws the overflow nowhere. People.place() asks this first, so an unseatable NPC is refused out
// loud instead of becoming an invisible quest-giver.
export function crowdSeatsLeft(agents, zi, vi, perMesh = PER_CROWD_MESH) {
  let n = 0;
  for (const a of agents) if (a.npc && a.zi === zi && a.vi === vi) n++;
  return perMesh - n;
}

// Everything People.setCrowd() decides: who is active at this knob setting, and what each mesh
// draws. Here rather than in people.js because people.js imports three, and the last time this
// lived there it was reverted to a bare slice with the suite still green — at `crowd = 0` that
// emptied `active` and every named body in the valley went with it.
export function crowdSeats(agents, count, pool, meshes, perMesh = PER_CROWD_MESH) {
  const active = crowd(agents, count).slice(0, pool);
  const lists = [];
  for (let mi = 0; mi < meshes; mi++) {
    lists.push(active.filter(a => a.zi === (mi >> 1) && a.vi === (mi & 1)).slice(0, perMesh));
  }
  return { active, lists };
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

// Procedural dungeon generation. Everything here is a pure function of
// (seed, depth) so a given seed always produces the same descent.
(function (global) {
  const DIRS = {
    N: { dx: 0, dy: -1, opp: "S" },
    S: { dx: 0, dy: 1, opp: "N" },
    E: { dx: 1, dy: 0, opp: "W" },
    W: { dx: -1, dy: 0, opp: "E" },
  };

  // room-kind image pool keyed by role/shape
  const FILLER_KINDS = ["hall_long", "hall_flooded", "office", "ritual", "storage"];

  const ADJ = ["silent", "weeping", "breathing", "forgotten", "humming", "cold",
    "flooded", "endless", "watching", "rotting", "patient", "hollow"];
  const NOUN = ["corridor", "chamber", "passage", "ward", "gallery", "vault",
    "threshold", "crossing", "hall", "recess"];
  const NOTES = [
    "the doors only open one way. i stopped counting them.",
    "it does not run. it does not need to.",
    "if the light dies, do not move. that is when it listens.",
    "i found my own name carved here. older than me.",
    "down is the only direction that is real.",
    "the rooms repeat but i am not the same.",
    "leave the glowing things. they are bait.",
    "i hear my footsteps after i stop walking.",
  ];

  function key(x, y) { return x + "," + y; }
  function connKey(a, b) { return [a, b].sort().join("|"); }

  function generate(seedStr, depth) {
    const R = HollowRNG.rngFrom(seedStr + "::" + depth);
    const size = Math.min(7, 4 + depth);
    const target = Math.max(6, Math.round(size * size * 0.5));
    const inb = (x, y) => x >= 0 && y >= 0 && x < size && y < size;

    const cells = new Map();                 // id -> {x,y}
    const conns = new Set();                 // normalized "idA|idB"
    let sx = R.int(size), sy = R.int(size);
    cells.set(key(sx, sy), { x: sx, y: sy });

    // grow a connected layout (randomized spanning tree)
    let guard = 0;
    while (cells.size < target && guard++ < 5000) {
      const existing = Array.from(cells.values());
      const c = R.pick(existing);
      const dir = R.pick(Object.keys(DIRS));
      const d = DIRS[dir];
      const nx = c.x + d.dx, ny = c.y + d.dy;
      if (!inb(nx, ny)) continue;
      const nid = key(nx, ny);
      if (!cells.has(nid)) {
        cells.set(nid, { x: nx, y: ny });
        conns.add(connKey(key(c.x, c.y), nid));
      }
    }

    // add a few extra doors between adjacent rooms -> loops / cycles
    for (const { x, y } of cells.values()) {
      for (const dir of ["E", "S"]) {           // each pair once
        const d = DIRS[dir];
        const nid = key(x + d.dx, y + d.dy);
        if (cells.has(nid) && R.chance(0.22)) conns.add(connKey(key(x, y), nid));
      }
    }

    const startId = key(sx, sy);

    // BFS distances + adjacency
    const neighbors = (id) => {
      const { x, y } = cells.get(id);
      const out = [];
      for (const dir of Object.keys(DIRS)) {
        const d = DIRS[dir];
        const nid = key(x + d.dx, y + d.dy);
        if (cells.has(nid) && conns.has(connKey(id, nid))) out.push({ dir, id: nid });
      }
      return out;
    };
    const dist = new Map([[startId, 0]]);
    const q = [startId];
    while (q.length) {
      const cur = q.shift();
      for (const n of neighbors(cur)) {
        if (!dist.has(n.id)) { dist.set(n.id, dist.get(cur) + 1); q.push(n.id); }
      }
    }
    // any unreached cell -> connect it to a reached neighbor (safety)
    for (const id of cells.keys()) {
      if (dist.has(id)) continue;
      const { x, y } = cells.get(id);
      for (const dir of Object.keys(DIRS)) {
        const d = DIRS[dir];
        const nid = key(x + d.dx, y + d.dy);
        if (cells.has(nid) && dist.has(nid)) {
          conns.add(connKey(id, nid));
          dist.set(id, dist.get(nid) + 1);
          break;
        }
      }
      if (!dist.has(id)) dist.set(id, 99);
    }

    // exit = farthest reachable room
    let exitId = startId, far = -1;
    for (const [id, dd] of dist) if (dd > far && id !== startId) { far = dd; exitId = id; }

    // build rooms
    const rooms = {};
    for (const [id, { x, y }] of cells) {
      const deg = neighbors(id).length;
      const doors = {};
      for (const dir of Object.keys(DIRS)) {
        const d = DIRS[dir];
        const nid = key(x + d.dx, y + d.dy);
        doors[dir] = cells.has(nid) && conns.has(connKey(id, nid)) ? nid : null;
      }
      let kind = R.pick(FILLER_KINDS);
      if (id === startId) kind = "start_chamber";
      else if (id === exitId) kind = "stairs_down";
      else if (deg >= 4) kind = "junction";
      else if (deg === 1) kind = R.chance(0.6) ? "dead_end" : kind;
      rooms[id] = {
        id, x, y, kind, doors, deg,
        seen: false, item: null, locked: false,
        title: R.pick(ADJ) + " " + R.pick(NOUN),
      };
    }
    rooms[startId].locked = false;
    rooms[exitId].locked = true;          // need the key to descend

    // contents: one key, batteries, notes, placed in non-start/non-exit rooms
    const open = Object.keys(rooms).filter((id) => id !== startId && id !== exitId);
    const bag = R.shuffle(open);
    let bi = 0;
    const place = (item) => { if (bi < bag.length) { rooms[bag[bi]].item = item; bi++; } };
    place("key");
    const batteries = Math.max(1, Math.round(target * 0.18));
    for (let i = 0; i < batteries; i++) place("battery");
    const notes = R.chance(0.85) ? 2 : 1;
    for (let i = 0; i < notes; i++) {
      if (bi < bag.length) { rooms[bag[bi]].item = "note"; rooms[bag[bi]].noteText = R.pick(NOTES); bi++; }
    }

    // entity starts far from the player
    let entityId = exitId;
    const cand = open.filter((id) => id !== exitId && dist.get(id) >= Math.max(2, far - 2));
    if (cand.length) entityId = R.pick(cand);

    return {
      seed: seedStr, depth, size, startId, exitId, entityId,
      rooms, dist,
      neighbors,
      roomCount: cells.size,
    };
  }

  global.HollowDungeon = { generate, DIRS };
})(window);

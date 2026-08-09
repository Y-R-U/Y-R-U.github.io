import { MATERIAL } from './materials.js';

/**
 * The test level: three movements in one strip so every system has something
 * to prove itself against.
 *
 *   x     0 .. 2400   Thornmere edge — flat-ish ground, trees, crates, a fence
 *   x  2400 .. 4500   the Sunderwood — verticality, a tree line to set alight
 *   x  4500 .. 7600   Ruinreach — the destruction showcase: a buttressed arch,
 *                     a pillared bridge over a chasm, walls that do not float
 */

// 340px, not 500: a running jump covers ~380px, so the gap is crossable on foot
// if you bring the bridge down. At 500 destroying your own bridge ended the run.
const CHASM_A = 5700, CHASM_B = 6040;

export function groundAt(x) {
  if (x >= CHASM_A && x <= CHASM_B) return 520;
  let y = 60;
  y += Math.sin(x * 0.00085) * 34;
  y += Math.sin(x * 0.0031 + 1.7) * 12;
  if (x > 2400 && x < 4500) y -= 40 + Math.sin((x - 2400) * 0.0022) * 90;
  if (x >= 4500) y = 20 + Math.sin(x * 0.0009) * 14;
  if (x > 7100) y += (x - 7100) * 0.18;
  return y;
}

export function buildLevel(world) {
  const T = world.terrain;
  const rng = world.rng;
  const L = world.LAYER;

  world.bounds = { x0: -240, x1: 7700, y0: -1800, y1: 780 };
  // The highest real ground in this level is y≈120, so anything past 300 means
  // the player is down in the chasm with nothing to climb.
  world.pitY = 300;

  /* ---------------- terrain ---------------- */
  T.hill(-600, 4500, groundAt, MATERIAL.ROCK, 1400, MATERIAL.EARTH, 70);
  T.hill(4500, 8200, groundAt, MATERIAL.ROCK, 1400, MATERIAL.MASONRY, 54);

  // chasm walls are cut stone, so the bridge above reads as built, not natural
  T.box(CHASM_A - 40, groundAt(CHASM_A - 60), 40, 520, MATERIAL.MASONRY);
  T.box(CHASM_B, groundAt(CHASM_B + 60), 40, 520, MATERIAL.MASONRY);

  /**
   * Sunderwood ledges — a climbing route, and every one of them is ONE-WAY.
   *
   * They used to be solid boxes at fixed world y while the ground under them
   * rises ~130px through the wood, so the first ledge ended up with its
   * underside 8px BELOW Rook's head: he could not walk under it and, at 206px
   * up, could not jump onto it either. The whole Sunderwood was sealed off by a
   * rock slab at head height, which is exactly the kind of thing you cannot see
   * is blocking you. One-way cells never block horizontally, so a mistuned
   * height can no longer wall the ground route off — the worst case is a ledge
   * you cannot reach yet.
   *
   * Heights are stepped 150px apart because a full jump clears 185px (measured
   * in `sim-test`, do not exceed ~165 without re-measuring).
   */
  T.platform(2560, -136, 300, 46, MATERIAL.ROCK, { oneWay: true });
  T.platform(2980, -286, 260, 44, MATERIAL.ROCK, { oneWay: true });
  T.platform(3320, -436, 300, 22, MATERIAL.TIMBER, { oneWay: true });
  T.platform(3760, -430, 340, 48, MATERIAL.ROCK, { oneWay: true });
  T.platform(4180, -280, 280, 22, MATERIAL.TIMBER, { oneWay: true });
  // Thornmere: 130px of head clearance over the ground below, so it stays solid.
  T.box(1560, -230, 240, 44, MATERIAL.ROCK);

  // Ruinreach: a raised platform and a broken parapet
  T.box(4300, -300, 420, 60, MATERIAL.MASONRY);
  T.box(4300, -420, 60, 120, MATERIAL.MASONRY);
  T.box(6560, -260, 460, 54, MATERIAL.MASONRY);
  T.box(6980, -470, 220, 40, MATERIAL.MASONRY);

  /* ---------------- props ---------------- */
  const place = (id, x, o) => world.props.add(id, x, groundAt(x), o);
  const placeAt = (id, x, y, o) => world.props.add(id, x, y, o);

  const marks = {};

  // --- Thornmere edge ---
  // Two short runs, not one. A fence section is 196px wide, so six of them at a
  // 200px pitch was a continuous 1200px timber wall through the whole opening
  // screen — one ember lit the lot and there was nowhere left to stand.
  for (let i = 0; i < 3; i++) place('fence', 190 + i * 200);
  const cA = place('crate', 610);
  const cB = place('crate', 706);
  placeAt('crate', 658, groundAt(640) - 78, { supportedBy: [cA, cB], needs: 1 });
  const bA = place('barrel', 812);
  const bB = place('barrel', 884);
  placeAt('barrel', 848, groundAt(848) - 73, { supportedBy: [bA, bB], needs: 1 });
  marks.lantern = place('lantern', 1090);
  place('brazier', 400);
  place('brazier', 1560);
  place('lantern', 2150);
  place('stump', 1180);
  place('rocks_small', 1340);
  world.props.addTree('tree_oak', 1480, groundAt(1480));
  world.props.addTree('tree_young', 1760, groundAt(1760));
  place('bush', 1900); place('ferns', 2010); place('mushrooms', 2260);
  place('boulder_small', 2200);
  marks.brazier = place('brazier', 2320);

  // --- Sunderwood: a tree line that must burn as one ---
  marks.treeLine = [];
  for (let i = 0; i < 7; i++) {
    const x = 2620 + i * 230 + rng.range(-30, 30);
    const t = world.props.addTree(i % 2 ? 'tree_young' : 'tree_oak', x, groundAt(x), { scale: rng.range(0.85, 1.15) });
    if (t) marks.treeLine.push(t);
    if (i % 2) place('bush', x + 90);
    if (i % 3 === 0) place('ferns', x - 70);
  }
  placeAt('crate', 2700, -190);
  placeAt('barrel', 3060, -350);
  placeAt('mushrooms', 3420, -520);
  placeAt('deadtree', 3880, -430);
  place('boulder_big', 4320);
  place('skull_pile', 4200);

  // --- Ruinreach ---
  place('rocks_small', 4620);
  marks.brazier2 = placeAt('brazier', 4420, -300);

  // the showcase arch: two buttresses, an arch, a wall course, a second arch
  const AX = 5100;
  const AS = 1.15;
  // The pillars are NOT solid: an arch is a thing you walk under, and in a side
  // view its legs stand either side of the road rather than across it. Solid,
  // they were a 385px unclimbable wall on the only path through Ruinreach —
  // break-to-pass with a starting fire spell that masonry resists at 0.15, i.e.
  // forty casts to get through a doorway. They still carry the arch, still
  // crack, and breaking one still brings the whole thing down on your head.
  const pl = place('pillar_stone', AX - 172, { scale: AS, solid: false });
  const pr = place('pillar_stone', AX + 172, { scale: AS, solid: false });
  const py = groundAt(AX) - 335 * AS;
  const a1 = placeAt('arch_stone', AX, py, { supportedBy: [pl, pr], scale: AS });
  const w1 = placeAt('wall_brick', AX - 106, py - 285 * AS, { supportedBy: [a1], scale: 0.9 });
  const w2 = placeAt('wall_brick', AX + 106, py - 285 * AS, { supportedBy: [a1], scale: 0.9 });
  const a2 = placeAt('arch_stone', AX, py - 285 * AS - 174, { supportedBy: [w1, w2], scale: 0.8 });
  placeAt('skull_pile', AX + 60, groundAt(AX + 60));
  place('brazier', AX - 330);
  place('brazier', AX + 340);
  marks.arch = { pillars: [pl, pr], arch: a1, top: a2, walls: [w1, w2], x: AX, y: py };

  // The bridge: a masonry deck on pillars over the chasm. Its walking surface is
  // the rim, so it is the road — it used to float 313px above the only ground
  // you could stand on, which made the chasm simply uncrossable.
  const deck = [];
  const bridgePillars = [];
  const deckY = groundAt(CHASM_A - 60) + 193 * 0.72;
  for (let i = 0; i < 3; i++) {
    const x = CHASM_A + 40 + i * 130;
    const p = placeAt('pillar_stone', x, 520, { });
    p.grounded = true;
    bridgePillars.push(p);
  }
  for (let i = 0; i < 4; i++) {
    const x = CHASM_A - 10 + i * 120;
    const sup = [];
    for (const p of bridgePillars) if (Math.abs(p.x - x) < 190) sup.push(p);
    const seg = placeAt('wall_brick', x, deckY, { scale: 0.72, supportedBy: sup });
    seg.grounded = false;
    deck.push(seg);
  }
  marks.bridge = { pillars: bridgePillars, deck, x: (CHASM_A + CHASM_B) * 0.5, y: deckY };

  // the acid wall: a tall brick stack with a pillar buttress
  const WX = 6420;
  // Buttress, not gate: it leans on the wall rather than standing across the
  // road, so it does not need to be a second 335px thing to chew through.
  const wb = place('pillar_stone', WX - 190, { solid: false });
  // Two courses, not three. Masonry resists fire at 0.15, so with the starting
  // emberbolt a three-course stack was 62 casts and 75 seconds of standing still
  // — the acid this wall is built for is the intended answer, but the fallback
  // has to be a fight rather than a chore. Knocking the top course down leaves
  // climbable rubble, so this reads as a gate you open, not a wall of HP.
  const wallStack = [];
  let prev = null;
  for (let i = 0; i < 2; i++) {
    const y = groundAt(WX) - i * 190;
    const seg = placeAt('wall_brick', WX, y, { supportedBy: prev ? [prev] : [], scale: 1 });
    if (i === 1) world.props.link(wb, seg);
    prev = seg;
    wallStack.push(seg);
  }
  marks.wall = { segs: wallStack, buttress: wb, x: WX, y: groundAt(WX) - 190 };

  placeAt('gate_iron', 6780, -260);
  placeAt('brazier', 6640, -260);
  placeAt('boulder_big', 7040, -470);
  place('burnt_trunk', 7180);
  place('deadtree', 7360);
  place('skull_pile', 7250);
  place('rocks_small', 7460);

  world.props.solve();

  /* ---------------- ground decals ---------------- */
  const statics = { n: 0, tex: [], u0: [], v0: [], u1: [], v1: [], x: [], y: [], w: [], h: [], r: [], g: [], b: [], a: [], layer: [], rot: [] };
  const decalFrames = ['decal_grass', 'decal_roots', 'decal_rocks', 'decal_bramble', 'decal_mush', 'decal_bones'];
  for (let i = 0; i < 190; i++) {
    const x = rng.range(-100, 7600);
    if (x > CHASM_A - 60 && x < CHASM_B + 60) continue;
    const ruin = x > 4500;
    const name = ruin
      ? decalFrames[(rng.next() * 3 | 0) + (rng.bool(0.3) ? 3 : 0)]
      : decalFrames[rng.next() * 4 | 0];
    const f = world.assets.f(name);
    if (!f) continue;
    const gy = groundAt(x);
    const s = rng.range(0.55, 1.25);
    const iw = 1 / f.tex.w, ih = 1 / f.tex.h;
    const k = statics.n++;
    statics.tex[k] = f.tex;
    statics.u0[k] = f.sx * iw; statics.v0[k] = f.sy * ih;
    statics.u1[k] = (f.sx + f.sw) * iw; statics.v1[k] = (f.sy + f.sh) * ih;
    statics.w[k] = f.sw * s; statics.h[k] = f.sh * s;
    statics.x[k] = x; statics.y[k] = gy - f.sh * s * 0.5 + 6;
    const t = rng.range(0.7, 1.05);
    statics.r[k] = t; statics.g[k] = t; statics.b[k] = t; statics.a[k] = rng.range(0.65, 1);
    statics.layer[k] = rng.bool(0.35) ? L.TERRAIN_FRONT : L.TERRAIN;
  }

  /* Foreground fringe: near-black grass along the ground line. Cheap, and it is
     the single biggest thing stopping the ground reading as a flat dark slab. */
  const streak = world.R.streak;
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-200, 7700);
    if (x > CHASM_A - 40 && x < CHASM_B + 40) continue;
    const gy = groundAt(x);
    const fg = rng.bool(0.35);
    const h = rng.range(fg ? 90 : 34, fg ? 230 : 120);
    const k = statics.n++;
    statics.tex[k] = streak;
    statics.u0[k] = 0; statics.v0[k] = 0; statics.u1[k] = 1; statics.v1[k] = 1;
    statics.w[k] = h * rng.range(0.16, 0.30); statics.h[k] = h;
    statics.x[k] = x; statics.y[k] = gy - h * 0.42;
    const tone = fg ? 0.055 : rng.range(0.11, 0.22);
    statics.r[k] = tone * 0.9; statics.g[k] = tone * 1.25; statics.b[k] = tone * 0.85;
    statics.a[k] = rng.range(0.6, 1);
    statics.layer[k] = fg ? L.FG_OCCLUDE : L.TERRAIN_FRONT;
    statics.rot = statics.rot || [];
    statics.rot[k] = rng.range(-0.42, 0.42);
  }
  for (let i = 0; i < statics.n; i++) if (statics.rot && statics.rot[i] === undefined) statics.rot[i] = 0;

  return { marks, statics };
}

/* ------------------------------------------------------------------ *
 * Scripted destruction demos — these exist so a headless screenshot can
 * reach the interesting state without a human at the keyboard.
 * ------------------------------------------------------------------ */

export function createDemos(world, marks) {
  // demos always stand the player on real ground; a demo that drops him down a
  // chasm points the camera at the wrong thing entirely
  const focus = (x, y) => {
    const p = world.player;
    if (!p) return;
    const g = world.groundY(x, y - 700, 2600);
    const fy = (isNaN(g) ? y : g) - p.h * 0.5 - 2;
    p.x = x; p.y = fy; p.px = x; p.py = fy; p.vx = 0; p.vy = 0;
    p.invuln = 3;
    world.cam.x = x; world.cam.y = fy - 90;
  };

  return {
    arch() {
      focus(marks.arch.x - 420, marks.arch.y + 330);
      const p = marks.arch.pillars[0];
      world.explode(p.x, p.y + 60, { radius: 190, damage: 240, type: 'impact', force: 700, terrain: true, terrainScale: 0.4, exclude: world.player });
      world.props.damage(p, 400, 'impact', { hitX: p.x, hitY: p.y, dirX: 1, dirY: -0.2 });
    },
    fire() {
      focus(2500, groundAt(2500) - 120);
      const t = marks.treeLine[1];
      if (t) { world.props.ignite(t, 2); world.surfaces.ignite(t.x, t.bottom - 40, 90, 1.6); }
      world.surfaces.wind = 0.7;
    },
    acid() {
      focus(marks.wall.x - 250, marks.wall.y + 120);
      world.surfaces.pour('acid', marks.wall.x, marks.wall.y - 260, 1, 130);
      for (const s of marks.wall.segs) s.acid = 1;
    },
    quake() {
      const p = world.player;
      const x = p ? p.x : 1000, y = p ? p.y + 60 : groundAt(1000);
      world.explode(x, y, { radius: 300, damage: 180, type: 'impact', force: 1200, terrain: true, terrainScale: 0.65, shake: 1.1, hitstop: 0.08 });
      world.debris.shove(x, y, 700, 900);
    },
    wall() {
      focus(marks.wall.x - 250, marks.wall.y + 120);
      world.explode(marks.wall.buttress.x, marks.wall.buttress.y, { radius: 170, damage: 260, type: 'impact', force: 800, terrain: true, exclude: world.player });
      world.props.damage(marks.wall.buttress, 400, 'impact', {});
    },
    bridge() {
      focus(CHASM_A - 130, 0);
      const p = marks.bridge.pillars[1];
      world.explode(p.x, p.y, { radius: 200, damage: 300, type: 'impact', force: 900, terrain: true, terrainScale: 0.3, exclude: world.player });
      world.props.damage(p, 500, 'impact', {});
    },
    tree() {
      focus(1300, groundAt(1300) - 120);
      const t = world.props.at(1480, groundAt(1480) - 150);
      if (t) world.props.topple(t, 1);
    },
    crates() {
      focus(500, groundAt(500) - 120);
      world.explode(760, groundAt(760) - 60, { radius: 210, damage: 120, type: 'impact', force: 800, terrain: false, exclude: world.player });
    },
  };
}

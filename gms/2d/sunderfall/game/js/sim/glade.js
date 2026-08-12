import { MATERIAL } from './materials.js';
import { FLAG } from './terrain.js';

/**
 * Movement four: the breach, the scorched approach, the Glyphglade and the
 * arena the Seam is fought in. Split out of `level.js` because the arena alone
 * is sixty-odd props of load-bearing stonework and the road file was already
 * dense enough to hide a mistake in.
 *
 * Everything here obeys the three rules the rest of `level.js` was rewritten to
 * obey, and they are worth restating because breaking any one of them is
 * invisible until someone walks the route:
 *
 *   1. A prop that stands BESIDE the road is `solid: false`. Every piece of
 *      arena stonework is scenery you fight around, not a gate you chew
 *      through — masonry resists fire at 0.15, so one solid pillar across the
 *      only path is forty casts to walk through a doorway.
 *   2. Anything raised is a ONE-WAY terrain platform. One-way cells never block
 *      horizontally, so a ledge tuned 8px wrong is a ledge you cannot reach
 *      yet, never a region sealed off at head height.
 *   3. Nothing steps more than 150px. A full jump clears 185 and a running jump
 *      covers ~380 horizontally, both measured.
 */

/* ------------------------------------------------------------------ *
 * The profile
 * ------------------------------------------------------------------ */

/**
 * The approach climbs out of Ruinreach and the arena is a bowl inside the
 * glade, so the last fight is somewhere you dropped into rather than somewhere
 * you walked to. CLIMB - BOWL = 80, which is what puts the arena floor at
 * y≈90 and therefore `bossY` (floor - 330) at -240 — the number the contract
 * fixes `marks.arena.y` to.
 */
const CLIMB = 280;
const BOWL = 200;

export const REGION = {
  gateX: 7770, gateW: 240,
  faceA: 7660, faceB: 7900,        // the rock face box, as authored on the road
  breachA: 7600, breachB: 7970,    // what openGate cuts out of it
  climbA: 7960, climbB: 8520,      // the scorched track
  gladeA: 8520, gladeB: 9100,      // the Glyphglade plateau
  gladeX: 8760, staffX: 8790, ringR: 300,
  dropA: 9100, dropB: 9500,        // down into the bowl
  arenaA: 9500, arenaX: 10300, arenaB: 11160,
  sealX: 9620,
  plugA: 9300, plugB: 9540,        // sealArena: the wall that comes down
  browB: 10260, browY: -1400,      // …and the overhang that makes it stick
  wallX: 11160,                    // the arena's east cliff
  x1: 11400,
};

/**
 * A cliff you cannot climb over — and in this level that is not the same thing
 * as a tall one.
 *
 * The wall climb is a shipped feature: kick off a wall, hold back into it,
 * repeat, and you go up anything. Worse, the terrain grid's own ceiling at
 * y=-2560 is open air, so a wall that reaches the top of the grid is not a wall
 * at all — it is a ladder to a place with no collision, where you can drift
 * sideways over everything and drop down the far side. A headless player did
 * exactly that over the arena's east wall and left the world at x=11685.
 *
 * So every vertical face out here ends in an overhang. `capY` is as high as the
 * climb can get; above it the brow projects back over the climber, and it must
 * project further than a wall jump travels while still high enough to catch the
 * far edge — that is ~350px (vy -940 into gravity ~3120 is 0.6s of airtime),
 * so the brows here are 500-700px deep. The brow always covers the wall itself
 * as well, or the wall's own top surface is a ledge you can stand on.
 */
export function cliff(T, x0, x1, floorY, capY, browX0, browX1, browH = 700) {
  T.box(x0, capY, x1 - x0, floorY - capY, MATERIAL.ROCK, FLAG.NOBREAK);
  T.box(browX0, capY - browH, browX1 - browX0, browH, MATERIAL.ROCK, FLAG.NOBREAK);
}

const sstep = (a, b, x) => {
  const t = (x - a) / (b - a);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
};

/**
 * Movement four's contribution to `groundAt`, layered on the road's. Smoothstep
 * rather than a straight ramp so the joins are not visible kinks; peak slope is
 * 1.5x the average, which is 0.75 here — the step-up solver walks anything
 * under ~3, but past ~0.9 a descent stops reading as ground and reads as a fall.
 */
export function gladeProfile(x) {
  if (x <= REGION.climbA) return 0;
  return BOWL * sstep(REGION.dropA, REGION.dropB, x) - CLIMB * sstep(REGION.climbA, REGION.climbB, x);
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

/** Clear NOBREAK over a world rect. The gate is authored unbreakable so it
 *  cannot be tunnelled around the story; `carve` honours the flag, so opening
 *  it has to lift it first. */
function unlock(T, x0, y0, x1, y1) {
  const a = T.toCellX(x0), b = T.toCellX(x1);
  const c = T.toCellY(y0), d = T.toCellY(y1);
  for (let cy = c; cy <= d; cy++) {
    for (let cx = a; cx <= b; cx++) {
      if (!T.inside(cx, cy)) continue;
      T.flag[cy * T.cols + cx] &= ~FLAG.NOBREAK;
    }
  }
}

export function buildGlyphglade(world, marks) {
  const T = world.terrain;
  const rng = world.rng;
  const L = world.LAYER;
  const g = world.groundAt;
  const R = REGION;

  const place = (id, x, o) => world.props.add(id, x, g(x), o);
  const at = (id, x, y, o) => world.props.add(id, x, y, o);

  /* ---------------- the approach: 7960 .. 8520 ---------------- */
  /**
   * Broken ward posts and burnt trunks, no foliage: this is the stretch that
   * says the land is already lost. Nothing here goes east of 8340 — the boss
   * collects its arena with a 1900px radius from (10300, -240) and sorts it
   * outward-in, so a prop at 8400 would be the FIRST thing torn down at phase
   * two, off camera, wasting the tear budget on scenery nobody can see.
   */
  for (let i = 0; i < 5; i++) {
    const x = 8020 + i * 74 + rng.range(-16, 16);
    place('standing_stone', x, { scale: rng.range(0.34, 0.46), solid: false, flip: rng.bool(0.5), grounded: true });
  }
  place('burnt_trunk', 8100, { scale: 0.9 });
  place('burnt_trunk', 8290, { scale: 1.05, flip: true });
  place('deadtree', 7998, { scale: 0.8 });
  place('stump', 8180, { solid: false });      // 88px tall: solid, it is a jump in the middle of a walk
  place('rocks_small', 8060);
  place('rocks_small', 8330);
  place('rubble_heap', 7990);
  place('skull_pile', 8230);
  place('log', 8140, { flip: true });
  // One ward post still alight. Without it the whole 600px climb has no warm
  // source at all and reads as an unlit corridor rather than a place.
  place('brazier', 8206);

  /* ---------------- the Glyphglade: 8520 .. 9100 ---------------- */
  /**
   * The clearing from the intro, overrun. `intro/stage.js`'s `clearing` preset
   * is a ring of standing glyph stones round a ward at (150, -30) with r=430
   * and Vayne slumped in the middle of it; this is that, seen from the ground
   * forty minutes later. The ring is drawn as a ring rather than a row: the far
   * arc is smaller, dimmer, sits higher in the frame and draws into
   * TERRAIN_BACK, the near arc is bigger and draws into TERRAIN_FRONT. Side-on,
   * that reads as a circle you are standing inside.
   */
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const th = (22.5 + i * 45) * Math.PI / 180;
    const dz = Math.sin(th);                     // +1 = far side of the ring
    const x = R.gladeX + 30 + Math.cos(th) * R.ringR;
    const s = 1.02 - dz * 0.20;
    const layer = dz > 0.4 ? L.TERRAIN_BACK : dz < -0.4 ? L.TERRAIN_FRONT : L.TERRAIN;
    const tint = dz > 0.4 ? [0.66, 0.72, 0.90] : null;
    // The far stones stand ABOVE the ground line, which is a lie the side view
    // needs; `grounded: true` is not optional there or `solve()` finds them
    // unsupported on the first frame and topples the whole ring.
    const p = at('standing_stone', x, g(x) - dz * 44, {
      scale: s, layer, solid: false, grounded: true, flip: i % 3 === 0, tint,
    });
    if (p) ring.push(p);
  }

  // The ward circle, burnt into the ground. `scorch` chars terrain cells, so
  // this is the real floor going black rather than a decal laid over it.
  const wc = R.gladeX + 30;
  for (let i = 0; i < 72; i++) {
    const th = i / 72 * Math.PI * 2;
    const x = wc + Math.cos(th) * R.ringR;
    T.scorch(x, g(x) + 12 + Math.sin(th) * 22, 40, 0.6);
  }
  for (let i = 0; i < 46; i++) {
    const x = wc + rng.range(-R.ringR, R.ringR);
    T.scorch(x, g(x) + 14, 54, 0.20);
  }

  /**
   * Two guttering braziers — the one warm source per scene the art direction
   * asks for, and the thing that lit the clearing in the cinematic. They flank
   * the staff at ±150 rather than sitting out on the ring: pushed to the rim
   * the middle of the glade was unlit black in both orientations, and the middle
   * of the glade is where the whole scene is played and where Rook kneels.
   * `staffX` itself stays clear — SF-STORY's staff actor stands on that spot.
   */
  marks.gladeFire = [place('brazier', R.staffX - 150), place('brazier', R.staffX + 152)];
  place('burnt_trunk', 8560, { scale: 1.1 });
  place('burnt_trunk', 9040, { scale: 0.95, flip: true });
  place('skull_pile', 8660);
  place('rubble_heap', 8960);

  /* ---------------- the bowl: 9500 .. 11160 ---------------- */
  const arena = buildArena(world, marks);

  /* The east cliff. The terrain grid ends at x=11264 and there is no ground
     past it, so this is the last thing between the player and the edge of the
     world — hence a capped cliff, not a wall. */
  cliff(T, R.wallX, 11300, g(R.wallX) + 600, R.browY, 10600, 11300);

  return { ring, arena };
}

/* ------------------------------------------------------------------ *
 * The arena
 * ------------------------------------------------------------------ */

/**
 * Six piers, five arches, a spandrel course on every arch, a gallery running
 * the whole length on the courses, a parapet on the gallery and two towers on
 * top of that — a support chain six links deep from the ground up.
 *
 * This is the most important geometry in the game. `theseam.js` collects every
 * live prop within 1900px of the arena centre, sorts it outward-in, and at each
 * phase change pulls `world.collapse` on a growing share of it; `collapse`
 * walks `supportedBy`, so taking one pier out drops the arch it carries, the
 * course on the arch, the gallery on the course and the tower on the gallery.
 * Fewer props, or props without chains, and the climax of the game is four
 * rocks falling over.
 *
 * Everything is `solid: false` and every raised surface is one-way terrain, so
 * the floor cannot become unnavigable however much of this ends up on it —
 * settled rubble is non-solid too.
 */
function buildArena(world, marks) {
  const T = world.terrain;
  const L = world.LAYER;
  const g = world.groundAt;
  const R = REGION;
  const P = world.props;

  const place = (id, x, o) => P.add(id, x, g(x), o);
  const at = (id, x, y, o) => P.add(id, x, y, o);

  const all = [];
  const keep = (p) => { if (p) all.push(p); return p; };

  /* --- the arcade --- */
  const PIER_X = [9660, 9910, 10160, 10440, 10690, 10940];
  const piers = PIER_X.map((x) => keep(place('pillar_stone', x, { solid: false, grounded: true })));

  const arches = [];
  const courses = [];
  let deckY = -Infinity;
  for (let i = 0; i < PIER_X.length - 1; i++) {
    const a = PIER_X[i], b = PIER_X[i + 1];
    const cx = (a + b) * 0.5;
    // arch width tracks the span it bridges — 298 is the authored frame width.
    // The centre bay is the widest on purpose: the tear hangs in it and the
    // boss is 150 across, so a 178px doorway would have been a coffin.
    const sc = (b - a) / 298;
    const py = g(cx) - 335;
    const arch = keep(at('arch_stone', cx, py, {
      scale: sc, solid: false, grounded: false, supportedBy: [piers[i], piers[i + 1]],
    }));
    arches.push(arch);
    const ty = py - 285 * sc;
    for (const s of [-66, 66]) {
      const w = keep(at('wall_brick', cx + s, ty, { scale: 0.72, solid: false, grounded: false, supportedBy: [arch] }));
      if (w) { courses.push(w); deckY = Math.max(deckY, w.top); }
    }
  }

  /* --- the gallery: a deck laid across the spandrel courses.
         Two bays of it are already down — an unbroken 1400px run of brick reads
         as a wall somebody is still maintaining, and this place has not been
         maintained since Vayne died in it. --- */
  const deck = [];
  const GONE = [3, 6];
  let j = 0;
  for (let x = 9699; x < 11040; x += 158, j++) {
    if (GONE.indexOf(j) >= 0) continue;
    const sup = courses.filter((c) => Math.abs(c.x - x) < 130);
    if (!sup.length) {
      let best = courses[0];
      for (const c of courses) if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
      sup.push(best);
    }
    // needs: 1 — OR semantics, so the gallery peels back a bay at a time as the
    // arcade goes rather than the whole run dropping on the first arch lost.
    const seg = keep(at('wall_brick', x, deckY, { scale: 0.60, solid: false, grounded: false, supportedBy: sup, needs: 1 }));
    if (seg) deck.push(seg);
  }

  /* --- parapet and two towers on the deck --- */
  const deckTop = deckY - 116;
  for (let i = 0; i < deck.length; i += 2) {
    keep(at('rubble_heap', deck[i].x, deckTop, { scale: 0.55, solid: false, grounded: false, supportedBy: [deck[i]] }));
  }
  const nearest = (x) => deck.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a), deck[0]);
  for (const tx of [9860, 10800]) {
    const base = nearest(tx);
    if (!base) continue;
    const t = keep(at('pillar_stone', base.x, deckTop, { scale: 0.62, solid: false, grounded: false, supportedBy: [base] }));
    keep(at('wall_brick', base.x, deckTop - 208, { scale: 0.5, solid: false, grounded: false, supportedBy: [t] }));
  }

  /* --- the east buttress: a stack against the cliff, like Ruinreach's --- */
  const bx = 11060;
  const buttress = keep(place('pillar_stone', bx, { solid: false, grounded: true }));
  let prev = null;
  for (let i = 0; i < 3; i++) {
    const seg = keep(at('wall_brick', bx + 62, g(bx + 62) - i * 190, {
      scale: 1, solid: false, grounded: i === 0 ? true : false, supportedBy: prev ? [prev] : [],
    }));
    if (i === 1 && seg) P.link(buttress, seg);
    prev = seg;
  }

  /**
   * The two raised ledges, one flight each side. Terrain, one-way, and placed
   * BETWEEN piers so they slot under the arcade's springing instead of through
   * a pier. Steps are 150 apart — a full jump clears 185.
   *
   * ROCK and thick, not thin masonry. A 40px masonry shelf is three cells deep
   * and every one of them is an exposed face, so the terrain's edge highlight
   * (body x 1.85) fires on all of it and the ledge renders as a glowing white
   * bar — it read as debug overlay, not stone. Depth is what darkens terrain,
   * so give it some: the low step is a solid plinth down to the floor and the
   * high shelf is 72 thick with pillars under its ends carrying it.
   */
  const ledge = (x, w, up, h) => {
    const top = g(x + w * 0.5) - up;
    T.platform(x, top, w, h, MATERIAL.ROCK, { oneWay: true });
    // Char it. The terrain renderer puts a bright lit lip on every exposed face,
    // which is what sells the ground line everywhere else — but a small isolated
    // block has exposed faces on all four sides, so it comes out as a glowing
    // white bar that reads as a debug overlay. Soot is both the fix and the
    // truth: this floor has had a seam burning through it.
    for (let sx = x; sx <= x + w; sx += 30) T.scorch(sx, top + h * 0.5, h * 0.9, 0.22);
  };
  for (const [x, w] of [[9715, 150], [10490, 150]]) {
    ledge(x, w, 150, 170);
    keep(place('rubble_heap', x + w + 34, { solid: false, scale: 0.8 }));
  }
  for (const [x, w] of [[9930, 220], [10700, 220]]) {
    ledge(x, w, 300, 96);
    for (const px of [x + 34, x + w - 44]) {
      keep(place('pillar_stone', px, { scale: 0.85, solid: false, grounded: true }));
    }
    // fascia on the broken ends, so the slab has a silhouette rather than a
    // ruled edge stopping in mid-air
    // `grounded: true` because it is decoration wedged into the slab — left for
    // `solve()` to work out, a prop with no supporters is unstable on frame one
    // and the fascia falls off before anyone sees the arena.
    keep(at('wall_brick', x + w + 4, g(x + w) - 204, { scale: 0.42, solid: false, grounded: true }));
  }

  /* --- clutter. Solid props in a boss arena are places to get stuck, so the
         boulders are scenery here even though they are solid on the road. --- */
  const soft = { solid: false };
  for (const x of [9580, 9760, 10080, 10420, 10760, 11000]) keep(place('rubble_heap', x, soft));
  for (const x of [9700, 10600, 10900]) keep(place('skull_pile', x, soft));
  for (const x of [9950, 10500]) keep(place('ribcage', x, soft));
  for (const x of [9860, 10250, 10680, 11080]) keep(place('rocks_small', x, soft));
  for (const x of [9620, 10980]) keep(place('boulder_small', x, soft));
  keep(place('burnt_trunk', 10380, { scale: 0.9 }));
  keep(place('burnt_trunk', 11110, { scale: 1.1, flip: true }));
  keep(place('standing_stone', 9560, { solid: false, grounded: true, scale: 0.9 }));
  keep(place('standing_stone', 11120, { solid: false, grounded: true, scale: 0.8, flip: true }));
  keep(place('brazier', 9720));
  keep(place('brazier', 10870));
  keep(at('brazier', 10040, g(10040) - 300));     // on the west ledge

  return {
    piers, arches, courses, deck, props: all,
    x: R.arenaX, y: -240, w: 1900, h: 1000,
    bossX: R.arenaX, bossY: g(R.arenaX) - 330,
  };
}

/* ------------------------------------------------------------------ *
 * openGate — the rock face cracks and the road goes on
 * ------------------------------------------------------------------ */

/**
 * A breach a player can WALK through. The failure mode this is written against
 * is a hole at head height that you can only wall-jump into: the wall climb is
 * a shipped feature but it is not an acceptable answer for the only route
 * forward in the game.
 *
 * The floor is not carved and hoped for — it is carved generously and then
 * re-laid with `hill`, which rebuilds the surface from `groundAt` down. That
 * guarantees a continuous walking surface through the tunnel no matter how the
 * carve circles happened to land on the cell grid.
 */
export function openGate(world, marks) {
  const gate = marks.gate;
  if (!gate || gate.open) return false;
  gate.open = true;

  const T = world.terrain;
  const g = world.groundAt;
  const R = REGION;

  unlock(T, R.breachA - 40, -1200, R.breachB + 40, g(R.breachB) + 500);

  // ~350px of headroom over a 152px player, so the tunnel never feels like a
  // crawl and the camera has somewhere to sit.
  for (let x = R.breachA; x <= R.breachB; x += 38) {
    T.carve(x, g(x) - 180, 200);
    T.carve(x + 19, g(x) - 300, 150);
  }
  T.hill(R.breachA, R.breachB, g, MATERIAL.ROCK, 1000, MATERIAL.MASONRY, 54);
  for (let x = R.breachA; x <= R.breachB; x += 44) T.scorch(x, g(x) - 120, 150, 0.5);

  // rubble on the threshold. Non-solid: it is a ramp you read, not one you climb
  // — the floor under it is already continuous.
  world.props.add('rubble_heap', R.faceA - 30, g(R.faceA - 30), { solid: false });
  world.props.add('rubble_heap', R.faceB + 40, g(R.faceB + 40), { solid: false, flip: true });
  world.props.add('rocks_small', R.gateX, g(R.gateX), { solid: false });
  world.props.add('boulder_small', R.faceA + 60, g(R.faceA + 60), { solid: false });

  for (let i = 0; i < 5; i++) {
    const x = R.breachA + 60 + i * 78;
    world.burstDebris(x, g(x) - 240, MATERIAL.ROCK, 7, { speed: 240, speedVar: 320, dir: -Math.PI * 0.5, spread: 1.4 });
    world.materialFx(MATERIAL.ROCK, x, g(x) - 200, 0, -1, 1.8);
  }
  world.P.emit({
    x: R.gateX, y: g(R.gateX) - 150, count: 110, speed: 210, speedVar: 360, vSpread: 2.4,
    life: 2.4, lifeVar: 1.2, size: 46, sizeEnd: 260,
    color: [0.42, 0.40, 0.38, 0.42], color2: [0.09, 0.09, 0.11, 0], gravity: -40, drag: 1.5, fadeIn: 0.12,
  });
  world.R.fx.shake(1.2, 1.8);
  world.R.fx.shockwave(R.gateX, g(R.gateX) - 200, 1.4);
  world.shoveDebris(R.gateX, g(R.gateX) - 100, 520, 620);
  world.sfx('rock_break', R.gateX, g(R.gateX) - 150);

  world.props.checkGround(R.gateX, g(R.gateX), 400);
  world.props.solve();
  world.bus.emit('gate:open', { x: R.gateX });
  return true;
}

/* ------------------------------------------------------------------ *
 * sealArena — the way closes behind him
 * ------------------------------------------------------------------ */

/**
 * The hard one, because the wall climb exists: kick off a wall, hold back into
 * it, repeat, and you climb anything. So this is not a wall.
 *
 *   PLUG  x 9300..9540, floor to above the terrain grid — no top to get over.
 *   BROW  x 9540..10260, everything above y=-1400 — an overhang 720px deep.
 *
 * The arithmetic that makes it hold: a wall jump leaves at vy -940 into gravity
 * ~3120, so the player is above his launch height for 0.6s and covers ~350px
 * of that in the air. Climbing the plug's east face tops out against the brow's
 * underside, and from there the brow's own east face is 720px away — twice what
 * the jump can cross while still high enough to catch it. From the floor the
 * brow's underside is 1490px up; the highest ledge in the arena is 300px up and
 * a fully-lifted jump is under 500.
 *
 * Both masses are NOBREAK, so it cannot be dug out either.
 */
export function sealArena(world, marks) {
  const seal = marks.seal;
  if (!seal || seal.closed) return false;
  seal.closed = true;

  const T = world.terrain;
  const g = world.groundAt;
  const R = REGION;

  // Defensive: the act machine fires this at x > 9620 but a fast player can be
  // read a frame late, and burying him inside the plug is unrecoverable.
  const p = world.player;
  if (p && p.x < R.plugB + 90) { p.x = R.plugB + 110; p.px = p.x; }

  // The brow starts at plugA, not plugB: a brow that stops where the plug does
  // leaves the plug's own top as a standable ledge at the exact height the climb
  // reaches. It has to cover what it caps.
  cliff(T, R.plugA, R.plugB, g(R.plugA) + 460, R.browY, R.plugA, R.browB);

  for (let i = 0; i < 4; i++) {
    const x = R.plugA + 40 + i * 60;
    world.burstDebris(x, g(x) - 120, MATERIAL.ROCK, 9, { speed: 300, speedVar: 380, dir: -Math.PI * 0.45, spread: 1.5 });
  }
  /**
   * A 1500px terrain face renders as a flat black rectangle — the depth ramp
   * bottoms out and there is nothing on it to catch light. What sells this as a
   * rockfall rather than a wall someone built is the debris piled against its
   * foot, so there is a lot of it, and it is all non-solid: the player is
   * standing right here when it lands.
   */
  const junk = [
    ['boulder_big', 60, 1.0], ['rubble_heap', 130, 1.1], ['boulder_small', 210, 0.9],
    ['rubble_heap', 250, 0.8], ['rocks_small', 320, 1.0], ['boulder_small', 96, 0.7],
    ['rocks_small', 175, 0.8],
  ];
  for (const [id, dx, sc] of junk) {
    world.props.add(id, R.plugB + dx, g(R.plugB + dx), { solid: false, scale: sc, flip: dx % 2 === 0 });
  }
  // …and something to see it by. The seal happens behind him at the moment the
  // arena's own light goes violet; unlit, it is a black hole in the frame.
  world.props.add('brazier', R.plugB + 290, g(R.plugB + 290), { solid: false });

  world.P.emit({
    x: R.plugB, y: g(R.plugB) - 300, count: 190, speed: 320, speedVar: 480, vSpread: 2.6,
    life: 3.0, lifeVar: 1.4, size: 60, sizeEnd: 420,
    color: [0.40, 0.38, 0.37, 0.5], color2: [0.08, 0.08, 0.10, 0], gravity: -30, drag: 1.4, fadeIn: 0.1,
  });
  world.materialFx(MATERIAL.ROCK, R.plugB, g(R.plugB) - 200, 1, -0.3, 2.4);
  world.R.fx.shake(1.6, 2.6);
  world.R.fx.timeScale(0.12, 0.10);
  world.R.fx.shockwave(R.plugB, g(R.plugB) - 200, 1.8);
  world.shoveDebris(R.plugB, g(R.plugB) - 100, 700, 900);
  world.sfx('rock_break', R.plugB, g(R.plugB) - 200);

  world.terrain.markAllDirty();
  world.props.checkGround(R.plugB, g(R.plugB), 500);
  world.props.solve();
  world.bus.emit('arena:sealed', { x: R.sealX });
  return true;
}

/* ------------------------------------------------------------------ *
 * Ground dressing
 * ------------------------------------------------------------------ */

function push(s, f, x, y, sc, r, g, b, a, layer, rot) {
  const iw = 1 / f.tex.w, ih = 1 / f.tex.h;
  const k = s.n++;
  s.tex[k] = f.tex;
  s.u0[k] = f.sx * iw; s.v0[k] = f.sy * ih;
  s.u1[k] = (f.sx + f.sw) * iw; s.v1[k] = (f.sy + f.sh) * ih;
  s.w[k] = f.sw * sc; s.h[k] = f.sh * sc;
  s.x[k] = x; s.y[k] = y;
  s.r[k] = r; s.g[k] = g; s.b[k] = b; s.a[k] = a;
  s.layer[k] = layer; s.rot[k] = rot || 0;
}

/**
 * Decals and fringe for movement four. Separate from `level.js`'s pass because
 * the palette flips twice here: scorched earth through the approach and glade,
 * then bones and broken paving on the arena floor, and no grass at all past the
 * ward circle — the fringe is what says "living ground", and none of this is.
 */
export function gladeDecals(world, statics, marks) {
  const rng = world.rng;
  const L = world.LAYER;
  const g = world.groundAt;
  const R = REGION;
  const s = statics;

  const burnt = ['decal_rocks', 'decal_bones', 'decal_bramble', 'decal_roots'];
  const paved = ['decal_rubble', 'decal_rocks', 'decal_bones'];

  for (let i = 0; i < 170; i++) {
    const x = rng.range(R.climbA - 60, R.wallX);
    const arena = x > R.arenaA;
    const name = (arena ? paved : burnt)[rng.next() * (arena ? paved.length : burnt.length) | 0];
    const f = world.assets.f(name);
    if (!f) continue;
    const sc = rng.range(0.5, 1.3);
    // charred: everything past the gate is under the same soot
    const t = rng.range(0.42, 0.78);
    push(s, f, x, g(x) - f.sh * sc * 0.5 + 6, sc, t * 0.98, t * 0.94, t * 0.98,
      rng.range(0.6, 1), rng.bool(0.35) ? L.TERRAIN_FRONT : L.TERRAIN);
  }

  /* the ward circle. `scorch` already put the burn into the terrain; this is the
     glyph line still holding in it, which is the shape a player watched crack
     for forty seconds in the cinematic. Cold blue against the braziers. */
  const streak = world.R.streak;
  const wc = R.gladeX + 30;
  for (let i = 0; i < 96; i++) {
    const th = i / 96 * Math.PI * 2;
    const cx = wc + Math.cos(th) * R.ringR;
    const cy = g(cx) + 12 + Math.sin(th) * 26;
    const tan = Math.atan2(Math.cos(th) * 26, -Math.sin(th) * R.ringR);
    const k = statics.n++;
    s.tex[k] = streak; s.u0[k] = 0; s.v0[k] = 0; s.u1[k] = 1; s.v1[k] = 1;
    s.w[k] = 6; s.h[k] = rng.range(26, 42);
    s.x[k] = cx; s.y[k] = cy;
    const a = 0.42 + rng.next() * 0.40;
    s.r[k] = 0.26 * a; s.g[k] = 0.42 * a; s.b[k] = 1.05 * a; s.a[k] = a;
    s.layer[k] = L.TERRAIN_FRONT; s.rot[k] = tan;
  }
  // eight radial ticks, one under each standing stone: the glyphs themselves
  for (let i = 0; i < 8; i++) {
    const th = (22.5 + i * 45) * Math.PI / 180;
    const cx = wc + Math.cos(th) * (R.ringR - 46);
    const k = statics.n++;
    s.tex[k] = streak; s.u0[k] = 0; s.v0[k] = 0; s.u1[k] = 1; s.v1[k] = 1;
    s.w[k] = 7; s.h[k] = 54;
    s.x[k] = cx; s.y[k] = g(cx) + 10 + Math.sin(th) * 24;
    s.r[k] = 0.20; s.g[k] = 0.32; s.b[k] = 0.86; s.a[k] = 0.55;
    s.layer[k] = L.TERRAIN_FRONT; s.rot[k] = Math.PI * 0.5 - th;
  }

  /* Burnt fringe. Sparse, near-black, and it stops at the ward circle: the
     glade floor inside the ring is ash. */
  for (let i = 0; i < 340; i++) {
    const x = rng.range(R.climbA - 60, R.dropA);
    if (Math.abs(x - wc) < R.ringR - 40) continue;
    const gy = g(x);
    const fg = rng.bool(0.30);
    const h = rng.range(fg ? 70 : 26, fg ? 190 : 96);
    const k = statics.n++;
    s.tex[k] = streak; s.u0[k] = 0; s.v0[k] = 0; s.u1[k] = 1; s.v1[k] = 1;
    s.w[k] = h * rng.range(0.14, 0.26); s.h[k] = h;
    s.x[k] = x; s.y[k] = gy - h * 0.42;
    const tone = fg ? 0.04 : rng.range(0.07, 0.14);
    s.r[k] = tone * 1.15; s.g[k] = tone * 1.0; s.b[k] = tone * 0.95;
    s.a[k] = rng.range(0.6, 1);
    s.layer[k] = fg ? L.FG_OCCLUDE : L.TERRAIN_FRONT;
    s.rot[k] = rng.range(-0.5, 0.5);
  }
  void marks;
}

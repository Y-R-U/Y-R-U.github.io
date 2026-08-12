/* SUNDERFALL — the people who are not fighting.
 *
 *   world.npcs = createNPCs(world);            // once, in sim/index.js
 *   const o = world.npcs.spawn('ostrick', 7570, null, { face: -1 });
 *   o.walkTo(7400, 130);  o.setPose('stand');  o.anchor;  o.despawn();
 *   world.npcs.update(dt);  world.npcs.render(alpha);  world.npcs.clear();
 *
 * **Not entities.** Nothing in `world.entities` means nothing can shoot Ostrick, target
 * him, collide with him, set him on fire or count him as a kill — which is the only
 * sane answer for a man who exists to say four sentences and leave. They have their own
 * list, their own update and their own render, and the only thing they share with the
 * rest of the sim is the ground and the light.
 *
 * Drawn procedurally in the same idiom as sim/player.js's renderPlayer — stacked quads,
 * two-bone limbs, discs for joints — so a spell going off next to them lights them, and
 * so a silhouette can be tuned without a sprite sheet. That file is the reference; this
 * one does not import from it.
 *
 * The whole brief for the art here is one line: **at 25% size with no colour, Ostrick
 * must not be mistakeable for Rook or for Vayne.** Rook is a thin vertical with legs and
 * a hair mop; Vayne is tall, ragged and asymmetric. Ostrick is a wide flat-topped bell —
 * squared shoulders, a straight-hemmed robe to the floor, a flat cap, a short stick out
 * in front at forty-five degrees and a satchel bump behind the hip. Every one of those is
 * a silhouette decision, not a detail; the beard and the braid are the details and they
 * are worth nothing if the bell shape is wrong.
 */

const CELL_SNAP = 12;      // how fast the feet chase the ground under them, per second

/* ---- palettes ---------------------------------------------------------- *
 * Low values on purpose: the renderer squares colours and multiplies by the light
 * buffer, so 0.13 here is a night-lit fabric, not a grey box. Matched to the player's
 * CLOTH/COAT so the cast reads as one production.                                     */

const OSTRICK = {
  robe: [0.155, 0.135, 0.106],
  yoke: [0.245, 0.215, 0.165],
  trim: [0.52, 0.41, 0.17],
  cap: [0.135, 0.122, 0.105],
  skin: [0.40, 0.30, 0.24],
  grey: [0.66, 0.64, 0.60],
  bag: [0.195, 0.160, 0.112],
  wood: [0.27, 0.21, 0.145],
};

const ELDER = {
  robe: [0.105, 0.112, 0.140],
  hood: [0.058, 0.064, 0.086],
  face: [0.012, 0.012, 0.018],
  sleeve: [0.082, 0.088, 0.112],
};

const STAFF = {
  wood: [0.145, 0.115, 0.088],
  wrap: [0.090, 0.075, 0.058],
  ember: [1.0, 0.55, 0.22],
};

const RIM = [0.52, 0.50, 0.52];

const LOOKS = {
  ostrick: { h: 144, hem: 96, speed: 132 },
  elder: { h: 176, hem: 82, speed: 118 },
  staff: { h: 150, hem: 26, speed: 0 },
};

export function createNPCs(world) {
  const list = [];
  const dead = [];
  let seq = 0;
  let ticks = 0;

  /* One driver only.
   *
   * sim/index.js drives these; the cutscene runner also offers to, because a scene with
   * a frozen Ostrick in it is a worse failure than a scene that steps him twice. The
   * first call that arrives without a `from` tag claims ownership, and from then on the
   * runner's calls are ignored — so the overlap is at most the single frame before
   * sim/index.js gets its first tick in. */
  let owner = null;

  function make(look, x, y, o = {}) {
    const def = LOOKS[look] || LOOKS.ostrick;
    const n = dead.pop() || {};
    n.id = ++seq;
    n.look = look;
    n.def = def;
    n.alive = true;
    n.x = x;
    n.y = y == null ? groundAt(x) : y;
    n.face = o.face === 1 || o.face === -1 ? o.face : -1;
    n.pose = o.pose || 'stand';
    n.phase = (n.id * 1.7) % 6.283;
    n.t = 0;
    n.bobSeed = (n.id * 2.39) % 6.283;
    n.target = null;
    n.speed = o.speed || def.speed;
    n.arrived = true;
    n.leaving = false;
    n.done = false;
    n.fade = o.fade === false ? 1 : 0;     // spawn-in is a soft fade, never a pop
    n.hidden = !!o.hidden;
    n.scale = o.scale || 1;
    n.anchor = n.anchor || { x: 0, y: 0 };
    n.taken = false;                        // 'staff' only: picked up and gone
    updateAnchor(n);
    return n;
  }

  /**
   * The surface under x, found from near the player's altitude rather than from the top
   * of the world — searching down from the sky lands an NPC on the first roof, ledge or
   * bridge deck above the ground he was meant to be standing on, which is how Ostrick
   * ended up in the tree line the first time.
   */
  function groundAt(x, fromY) {
    const base = fromY == null ? (world.player ? world.player.y - 140 : -200) : fromY;
    let g = world.groundY(x, base, 2600);
    if (!Number.isFinite(g)) g = world.groundY(x, -900, 4200);
    return Number.isFinite(g) ? g : (world.player ? world.player.y + world.player.h * 0.5 : 0);
  }

  function updateAnchor(n) {
    const h = n.def.h * n.scale * (n.pose === 'kneel' ? 0.7 : 1);
    n.anchor.x = n.x + (n.look === 'staff' ? 8 : n.face * 8);
    n.anchor.y = n.y - h * (n.look === 'staff' ? 0.94 : 0.86);
  }

  const api = {
    list,
    get count() { return list.length; },
    get ticks() { return ticks; },
    /** True once sim/index.js has claimed the tick. False means the runner is filling in. */
    get driven() { return owner === 'sim'; },

    /** spawn('ostrick', x, y|null, {face, pose, speed, scale}) */
    spawn(look, x, y, o) {
      const n = make(look, x, y, o);
      Object.assign(n, METHODS);
      list.push(n);
      return n;
    },

    /** First live NPC of a look — how a cue finds "the" Ostrick. */
    get(look) {
      for (let i = 0; i < list.length; i++) if (list[i].look === look && list[i].alive) return list[i];
      return null;
    },
    all(look) { return list.filter((n) => n.alive && (!look || n.look === look)); },

    despawn(n) {
      const i = list.indexOf(n);
      if (i < 0) return;
      list.splice(i, 1);
      n.alive = false;
      if (dead.length < 16) dead.push(n);
    },

    update(dt, from) {
      // 'story' defers to the sim once the sim has claimed the tick; 'force' is the
      // scrub hook, which has to step them itself because no sim frame is running.
      if (from === 'story' && owner === 'sim') return;
      if (from !== 'story' && from !== 'force') owner = 'sim';
      ticks++;
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        if (!n.alive) { list.splice(i, 1); continue; }
        step(n, dt);
        if (n.done) api.despawn(n);
      }
    },

    render(alpha, from) {
      if (from === 'story' && owner === 'sim') return;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (!n.alive || n.hidden || n.fade <= 0.01) continue;
        draw(n);
      }
    },

    clear() {
      for (const n of list) n.alive = false;
      list.length = 0;
      owner = null;
    },
  };

  /* ---- per-NPC methods ------------------------------------------------- */

  const METHODS = {
    /** Walk there. `npc.arrived` goes true when it gets there; nothing is awaited. */
    walkTo(x, speed) {
      this.target = x;
      this.arrived = false;
      if (speed) this.speed = speed;
      this.pose = 'walk';
      this.face = x < this.x ? -1 : 1;
      return this;
    },
    /** Walk off and stop existing. Used by `ostrick.leave`. */
    leave(dir, speed) {
      const d = dir || -1;
      this.leaving = true;
      return this.walkTo(this.x + d * 2600, speed || this.def.speed);
    },
    setPose(p) {
      this.pose = p || 'stand';
      if (p !== 'walk') { this.target = null; this.arrived = true; }
      return this;
    },
    faceTo(x) { this.face = x < this.x ? -1 : 1; return this; },
    /** Put him somewhere and stand him on the ground there. */
    placeAt(x) { this.x = x; this.y = groundAt(x); updateAnchor(this); return this; },
    /** Finish whatever it was doing, instantly. This is what skipping a scene means. */
    settle() {
      if (this.target != null) { this.x = this.target; this.y = groundAt(this.x, this.y - 100); }
      this.target = null;
      this.arrived = true;
      this.fade = 1;
      if (this.leaving) this.done = true;
      else if (this.pose === 'walk') this.pose = 'stand';
      updateAnchor(this);
      return this;
    },
    despawn() { this.done = true; this.alive = false; api.despawn(this); },
  };

  /* ---- simulation ------------------------------------------------------ */

  function step(n, dt) {
    n.t += dt;
    if (n.fade < 1) n.fade = Math.min(1, n.fade + dt * 2.4);

    if (n.target != null && n.look !== 'staff') {
      const dx = n.target - n.x;
      const dir = Math.sign(dx);
      const move = n.speed * dt;
      if (Math.abs(dx) <= move) { n.x = n.target; n.target = null; n.arrived = true; n.pose = 'stand'; }
      else { n.x += dir * move; n.face = dir; }
      n.phase += dt * 6.4;
    } else {
      n.phase += dt * 1.5;
    }

    // Feet chase the ground rather than snapping to it: the terrain is a cell grid and
    // a hard snap stair-steps a walker up a slope one cell at a time.
    const g = groundAt(n.x, n.y - 100);
    n.y += (g - n.y) * Math.min(1, dt * CELL_SNAP);

    if (n.leaving) {
      const off = Math.abs(n.x - world.cam.x) > world.halfW + 340;
      if (off || n.arrived) n.done = true;
    }
    updateAnchor(n);

    if (n.look === 'staff' && world.P && world.frame % 23 === (n.id * 7) % 23) {
      const top = staffTop(n);
      world.P.emit({
        x: top.x, y: top.y, count: 1, vx: 0, vy: -1, vSpread: 0.5,
        speed: 22, speedVar: 14, life: 1.5, lifeVar: 0.6, size: 5, sizeEnd: 0.5,
        color: [1, 0.62, 0.26, 0.85], color2: [0.5, 0.16, 0.05, 0], gravity: -14, drag: 1.2,
        add: true, glow: 0.2,
      });
    }
  }

  function staffTop(n) {
    const h = n.def.h * n.scale;
    return { x: n.x + Math.sin(0.11) * h, y: n.y - h };
  }

  /* ---- drawing --------------------------------------------------------- */

  const R = world.R, L = world.LAYER;

  function seg(x0, y0, x1, y1, w, col, a, layer) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    R.spriteRaw(R.white, 0, 0, 1, 1, (x0 + x1) * 0.5, (y0 + y1) * 0.5, len, w, Math.atan2(dy, dx),
      col[0], col[1], col[2], a, layer === undefined ? L.ACTORS : layer, false, 1);
    R.spriteRaw(R.disc, 0, 0, 1, 1, x1, y1, w, w, 0, col[0], col[1], col[2], a, layer === undefined ? L.ACTORS : layer, false, 1);
  }

  /** two-bone limb, knee/elbow placed by circle intersection — same trick as the player */
  function limb(x0, y0, x1, y1, len, w, col, a, face) {
    const dx = x1 - x0, dy = y1 - y0;
    let d = Math.hypot(dx, dy);
    const l = Math.max(len, d * 0.52);
    if (d > l * 2 - 1) d = l * 2 - 1;
    const ang = Math.atan2(dy, dx);
    const h = Math.sqrt(Math.max(0, l * l - d * d * 0.25));
    const mx = x0 + Math.cos(ang) * d * 0.5, my = y0 + Math.sin(ang) * d * 0.5;
    const kx = mx + Math.cos(ang + Math.PI * 0.5) * h * face;
    const ky = my + Math.sin(ang + Math.PI * 0.5) * h * face;
    seg(x0, y0, kx, ky, w, col, a);
    seg(kx, ky, x1, y1, w * 0.86, col, a);
  }

  function quad(x, y, w, h, rot, col, a, k, layer) {
    const m = k === undefined ? 1 : k;
    R.spriteRaw(R.white, 0, 0, 1, 1, x, y, w, h, rot || 0, col[0] * m, col[1] * m, col[2] * m, a,
      layer === undefined ? L.ACTORS : layer, false, 1);
  }
  function disc(x, y, w, h, rot, col, a, k, layer) {
    const m = k === undefined ? 1 : k;
    R.spriteRaw(R.disc, 0, 0, 1, 1, x, y, w, h, rot || 0, col[0] * m, col[1] * m, col[2] * m, a,
      layer === undefined ? L.ACTORS : layer, false, 1);
  }

  function shadow(n, w, a) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, n.x, n.y + 3, w, 20, 0, 0, 0, 0, a * 0.5 * n.fade, L.ACTORS_BACK, false, 1);
  }

  function draw(n) {
    if (n.look === 'staff') return drawStaff(n);
    if (n.look === 'elder') return drawElder(n);
    return drawOstrick(n);
  }

  /* ── Ostrick ───────────────────────────────────────────────────────────
   * Sixties, stooped, heavy well-kept robe, a short stick he leans on, a satchel.
   * A functionary — the braid on the hem is the whole of his magic. */
  function drawOstrick(n) {
    const P = OSTRICK;
    const a = n.fade;
    const s = n.scale;
    const walking = n.target != null;
    const kneel = n.pose === 'kneel';
    const work = n.pose === 'work';
    const sy = (kneel ? 0.70 : work ? 0.88 : 1) * s;
    const f = n.face;

    // the stoop. It is most of why he is not Vayne: Vayne is a vertical, this is a lean.
    const lean = (0.26 + (work ? 0.16 : 0) + (walking ? 0.04 : 0)) * f;
    const footY = n.y;
    const bob = walking ? Math.sin(n.phase * 2) * 2.4 : Math.sin(n.t * 1.4 + n.bobSeed) * 1.1;
    const Y = (frac) => footY - n.def.h * sy * frac + bob;
    const lx = (yy) => n.x + (footY - yy) * Math.sin(lean);

    const hemY = footY;
    const hipY = Y(0.44);
    const chestY = Y(0.64);
    const shldY = Y(0.72);
    const mantleY = Y(0.52);            // where the shoulder cape ends — the second tier
    const headY = Y(0.87);

    shadow(n, 104 * s, a);

    /* satchel first, and deliberately proud of the robe's back edge: the bump is the
       one thing on him that is not symmetrical, and at 25% it is what says "carrying
       the paperwork" rather than "wearing a cloak". */
    const bagX = lx(hipY) - f * 44 * s, bagY = hipY + 10 * sy;
    quad(bagX, bagY, 36 * s, 30 * sy, -lean * 0.5, P.bag, a);
    quad(bagX, bagY - 14 * sy, 38 * s, 9 * sy, -lean * 0.5, P.bag, a, 1.6);
    seg(lx(shldY) + f * 14 * s, shldY + 4, bagX, bagY - 15 * sy, 6 * s, P.bag, a);

    /* the robe: narrow at the shoulder, wide at a flat hem, no legs anywhere. Seven
       bands so the light buffer has something to fall across, and a hard bottom edge so
       the silhouette terminates in a line rather than in a pair of feet. */
    const N = 7;
    const sway = walking ? Math.sin(n.phase) * 3.4 : Math.sin(n.t * 1.1 + n.bobSeed) * 0.9;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const yy = shldY + (hemY - shldY) * t;
      const w = (48 + Math.pow(t, 1.5) * 44) * s;
      const cx = lx(yy) + sway * t * t * f;
      quad(cx, yy, w, (hemY - shldY) / (N - 1) * 1.9, -lean * 0.5, P.robe, a, 0.92 + t * 0.14);
    }
    // hem braid — the tidy in "square and tidy"
    quad(lx(hemY) + sway * f, hemY - 9 * sy, 84 * s, 8 * sy, 0, P.trim, a * 0.8);
    quad(lx(hemY) + sway * f, hemY - 2 * sy, 92 * s, 7 * sy, 0, P.robe, a, 0.62);
    // a walker's toe under the hem, and only just — he does not have legs on screen
    if (walking) {
      const toe = Math.sin(n.phase) * 15 * s;
      quad(lx(hemY) + toe, hemY - 5 * sy, 18 * s, 9 * sy, 0, P.cap, a, 0.8);
    }

    /* arms, under the mantle so only the forearms show */
    const stickTopX = n.x + f * 46 * s, stickTopY = Y(0.50) + 2 * sy;
    limb(lx(shldY) - f * 18 * s, shldY + 8 * sy, lx(hipY) - f * 24 * s, hipY + 8 * sy, 22 * sy, 12 * s, P.robe, a, -f);
    limb(lx(shldY) + f * 18 * s, shldY + 8 * sy, stickTopX, stickTopY, 22 * sy, 12 * s, P.robe, a, f);
    disc(stickTopX, stickTopY, 11 * s, 11 * s, 0, P.skin, a, 0.85);

    /* the mantle — a short shoulder cape over the robe. This is the tier that stops him
       reading as one slab, and the squared-off shoulder line is the whole silhouette. */
    const M = 6;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      const yy = shldY + (mantleY - shldY) * t;
      quad(lx(yy), yy, (54 + t * 20) * s, (mantleY - shldY) / (M - 1) * 2.0, -lean * 0.7, P.yoke, a, 1.24 - t * 0.14);
    }
    // the cape's own shadow on the robe under it — this is the step in the silhouette
    quad(lx(mantleY), mantleY + 5 * sy, 70 * s, 6 * sy, -lean * 0.6, P.robe, a, 0.45);
    // collar: a flat bar across the top of the shoulders, so the top edge is a line
    quad(lx(shldY) - f * 1 * s, shldY - 4 * sy, 46 * s, 11 * sy, -lean * 0.7, P.yoke, a, 1.5);

    /* the stick. Short — chest-high, a walking aid, not a wizard's staff. Planted well
       ahead of him so the diagonal falls outside the robe, and it plants harder on the
       stride, which is what gives the walk its limp. */
    const plant = walking ? Math.max(0, Math.sin(n.phase + 1.2)) * 9 * s : 0;
    const btmX = n.x + f * 66 * s, btmY = footY + 1 - plant;
    seg(stickTopX, stickTopY - 18 * sy, btmX, btmY, 9 * s, P.wood, a);
    disc(stickTopX, stickTopY - 19 * sy, 13 * s, 13 * s, 0, P.wood, a, 1.3);

    /* head: flat cap, grey beard, and a face mostly in shadow under the brim */
    const hx = lx(headY) + f * 7 * s;
    quad(lx(Y(0.80)) + f * 4 * s, Y(0.80), 14 * s, 15 * sy, -lean * 0.6, P.skin, a, 0.65);   // neck
    disc(hx, headY, 25 * s, 27 * sy, -lean * 0.5, P.skin, a, 0.9);
    disc(hx - f * 4 * s, headY + 11 * sy, 17 * s, 12 * sy, -lean * 0.5, P.grey, a, 0.55);  // beard
    quad(hx + f * 6 * s, headY, 4.5 * s, 5 * sy, 0, [0.04, 0.035, 0.045], a);              // eye
    // the cap: a brim and a low flat crown. Nothing pointed, nothing hooded.
    quad(hx - f * 1 * s, headY - 13 * sy, 48 * s, 8 * sy, -lean * 0.5, P.cap, a, 1.25);
    quad(hx - f * 3 * s, headY - 21 * sy, 32 * s, 11 * sy, -lean * 0.5, P.cap, a);
    disc(hx - f * 2 * s, headY - 5 * sy, 26 * s, 12 * sy, -lean * 0.5, P.skin, a, 0.45);   // brim shadow

    /* cool rim down both edges — the same trick the player uses to separate a near-black
       silhouette from a near-black background without lifting the character */
    for (let e = -1; e <= 1; e += 2) {
      const my = (mantleY + hemY) * 0.5;
      R.spriteRaw(R.blob, 0, 0, 1, 1, lx(my) + e * 36 * s, my, 11, Math.abs(hemY - mantleY) * 0.98, -lean * 0.4,
        RIM[0], RIM[1], RIM[2], (e === f ? 0.36 : 0.20) * a, L.ACTORS, false, 1);
      R.spriteRaw(R.blob, 0, 0, 1, 1, lx(shldY) + e * 29 * s, shldY + 8 * sy, 13, 30 * sy, -lean * 0.6,
        RIM[0], RIM[1], RIM[2], (e === f ? 0.34 : 0.18) * a, L.ACTORS, false, 1);
    }
  }

  /* ── elder ─────────────────────────────────────────────────────────────
   * Taller than Ostrick, hooded, faceless, and identical to the other two on purpose.
   * They arrive at the end, stand there, and never say anything. */
  function drawElder(n) {
    const P = ELDER;
    const a = n.fade, s = n.scale, f = n.face;
    const walking = n.target != null;
    const footY = n.y;
    const bob = walking ? Math.sin(n.phase * 2) * 2.0 : Math.sin(n.t * 1.1 + n.bobSeed) * 0.9;
    const Y = (frac) => footY - n.def.h * s * frac + bob;
    const lean = 0.04 * f;
    const lx = (yy) => n.x + (footY - yy) * Math.sin(lean);

    const hemY = footY, shldY = Y(0.76), chestY = Y(0.64), headY = Y(0.90);

    shadow(n, 84 * s, a);

    const N = 7;
    const sway = walking ? Math.sin(n.phase) * 4.2 : Math.sin(n.t * 0.9 + n.bobSeed) * 1.2;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const yy = shldY + (hemY - shldY) * t;
      quad(lx(yy) + sway * t * t * f, yy, (56 + t * t * 28) * s, (hemY - shldY) / (N - 1) * 1.85,
        -lean, P.robe, a, 1 - t * 0.14);
    }
    // clasped hands inside the sleeves: one horizontal bar, no skin anywhere
    quad(lx(chestY), chestY, 44 * s, 15 * s, -lean, P.sleeve, a);
    quad(lx(shldY), shldY + 6 * s, 54 * s, 22 * s, -lean, P.robe, a, 1.1);

    /* the cowl. A triangle, and the face inside it is a hole. */
    const hx = lx(headY);
    R.poly([hx - 30 * s, headY + 20 * s, hx + 30 * s, headY + 20 * s, hx + f * 4 * s, headY - 30 * s],
      { r: P.hood[0], g: P.hood[1], b: P.hood[2], a }, L.ACTORS);
    disc(hx + f * 3 * s, headY + 2 * s, 26 * s, 30 * s, 0, P.face, a);
    // one thin cool line along the hood's near edge, so the triangle has an edge at all
    seg(hx + f * 4 * s, headY - 28 * s, hx + f * 29 * s, headY + 19 * s, 3 * s, RIM, 0.20 * a);
  }

  /* ── Vayne's staff ─────────────────────────────────────────────────────
   * Not a person: the thing standing in the ground at the glade with the last of him
   * still in it. It is what Rook kneels at, and it is the only warm light in the scene. */
  function drawStaff(n) {
    const P = STAFF;
    const a = n.fade * (n.taken ? 0 : 1);
    if (a <= 0.01) return;
    const s = n.scale;
    const H = 150 * s;
    const tilt = 0.11;
    const x0 = n.x, y0 = n.y;
    const x1 = x0 + Math.sin(tilt) * H, y1 = y0 - Math.cos(tilt) * H;

    R.spriteRaw(R.blob, 0, 0, 1, 1, x0 + 4, y0 + 2, 46 * s, 14, 0, 0, 0, 0, 0.45 * a, L.ACTORS_BACK, false, 1);

    seg(x0, y0, x1, y1, 9 * s, P.wood, a);
    // three wraps up the shaft — a plain stick reads as a fence post
    for (let i = 0; i < 3; i++) {
      const t = 0.30 + i * 0.13;
      quad(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 13 * s, 6 * s, tilt, P.wrap, a);
    }
    // split head: two prongs, so the top has a shape at 25%
    seg(x1, y1, x1 - 9 * s, y1 - 16 * s, 6 * s, P.wood, a);
    seg(x1, y1, x1 + 8 * s, y1 - 14 * s, 6 * s, P.wood, a);

    const pulse = 0.72 + Math.sin(n.t * 2.1 + n.bobSeed) * 0.16;
    R.spriteRaw(R.blob, 0, 0, 1, 1, x1, y1 - 8 * s, 40 * s * pulse, 40 * s * pulse, 0,
      P.ember[0], P.ember[1], P.ember[2], 0.42 * a, L.FX, true, 1);
    R.spriteRaw(R.disc, 0, 0, 1, 1, x1, y1 - 8 * s, 7 * s, 7 * s, 0, 1, 0.86, 0.62, a, L.FX, true, 1);
    R.light({
      x: x1, y: y1 - 8 * s, radius: 230 * pulse, r: P.ember[0], g: P.ember[1], b: P.ember[2],
      intensity: 0.62 * a, flicker: 0.3,
    });
  }

  return api;
}

export default createNPCs;

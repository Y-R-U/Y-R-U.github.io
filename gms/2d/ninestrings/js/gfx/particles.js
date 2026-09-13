// Struct-of-arrays particle system. 4000 live particles at 60fps on a phone is
// only possible if the frame loop never allocates and never touches an object
// header, so every field is a lane in a typed array and a "particle" is an
// index. Death is a swap with the last live index, exactly as js/core/pool.js
// keeps its active set dense.
//
// Two draw passes, never interleaved: solid bits on 'main', glow on 'add'. The
// renderer batches per blend mode, so one additive particle drawn in the middle
// of the solid pass would split the batch in two.

const TAU = Math.PI * 2;
const rnd = Math.random;

const F_ADD = 1;     // drawn on the additive layer
const F_CHEAP = 2;   // may be culled when over budget
const F_ALIGN = 4;   // rotation tracks velocity (whips, shockwave spokes)

export function makeParticles(cap = 4000) {
  cap = Math.max(64, cap | 0);

  const px = new Float32Array(cap), py = new Float32Array(cap);
  const vx = new Float32Array(cap), vy = new Float32Array(cap);
  const drg = new Float32Array(cap), grv = new Float32Array(cap);
  const life = new Float32Array(cap), maxLife = new Float32Array(cap);
  const sz0 = new Float32Array(cap), sz1 = new Float32Array(cap);
  const rot = new Float32Array(cap), spin = new Float32Array(cap);
  const cr0 = new Float32Array(cap), cg0 = new Float32Array(cap);
  const cb0 = new Float32Array(cap), ca0 = new Float32Array(cap);
  const cr1 = new Float32Array(cap), cg1 = new Float32Array(cap);
  const cb1 = new Float32Array(cap), ca1 = new Float32Array(cap);
  const str = new Float32Array(cap);
  const sid = new Int32Array(cap);
  const flg = new Uint8Array(cap);
  const seq = new Uint32Array(cap);

  let n = 0;                 // live particles occupy [0, n)
  let budget = cap;
  let ticket = 1;            // monotonic birth order, for "drop the oldest"

  function removeAt(i) {
    const j = --n;
    if (i !== j) {
      px[i] = px[j]; py[i] = py[j]; vx[i] = vx[j]; vy[i] = vy[j];
      drg[i] = drg[j]; grv[i] = grv[j]; life[i] = life[j]; maxLife[i] = maxLife[j];
      sz0[i] = sz0[j]; sz1[i] = sz1[j]; rot[i] = rot[j]; spin[i] = spin[j];
      cr0[i] = cr0[j]; cg0[i] = cg0[j]; cb0[i] = cb0[j]; ca0[i] = ca0[j];
      cr1[i] = cr1[j]; cg1[i] = cg1[j]; cb1[i] = cb1[j]; ca1[i] = ca1[j];
      str[i] = str[j]; sid[i] = sid[j]; flg[i] = flg[j]; seq[i] = seq[j];
    }
  }

  // Make room for `want` new particles. New particles are the ones the player
  // is looking at, so an emit is never refused: instead the oldest CHEAP
  // particles (ambient embers, smoke, blood) are retired. Two linear passes and
  // an age threshold, because a sort here would allocate and a repeated
  // min-search is O(need * n).
  function trim(want) {
    let over = n + want - budget;
    if (over <= 0) return;

    for (let pass = 0; pass < 2 && over > 0; pass++) {
      const mask = pass === 0 ? F_CHEAP : 0;   // second pass: anything goes
      let lo = 0xffffffff, hi = 0, c = 0;
      for (let i = 0; i < n; i++) {
        if (mask && !(flg[i] & mask)) continue;
        const s = seq[i];
        if (s < lo) lo = s;
        if (s > hi) hi = s;
        c++;
      }
      if (!c) continue;
      const cut = lo + (hi - lo) * Math.min(1, (over + 1) / c);
      for (let i = 0; i < n && over > 0; i++) {
        if (mask && !(flg[i] & mask)) continue;
        if (seq[i] > cut) continue;
        removeAt(i); i--; over--;
      }
    }
    if (n + want > cap) return;   // caller clamps; nothing left to give
  }

  function emit(spec) {
    if (!spec) return 0;
    readSpec(spec);

    let want = S.n | 0;
    if (want <= 0) return 0;
    if (want > cap) want = cap;
    trim(want);
    if (n + want > cap) want = cap - n;
    if (want <= 0) return 0;

    const fl = (S.add ? F_ADD : 0) | (S.cheap ? F_CHEAP : 0) | (S.align ? F_ALIGN : 0);
    const inv = 1 / want;

    for (let k = 0; k < want; k++) {
      const i = n++;
      let ang, ox = 0, oy = 0;

      if (S.ring) {
        // Even spokes with a touch of wobble: a perfectly regular ring reads as
        // a gear, a fully random one reads as a smudge.
        ang = S.dir + (k + rnd() * 0.6) * inv * TAU;
        ox = Math.cos(ang) * S.r; oy = Math.sin(ang) * S.r;
      } else {
        ang = S.dir + (rnd() * 2 - 1) * S.spread;
        if (S.r > 0) {
          const pa = rnd() * TAU, pr = S.r * Math.sqrt(rnd());
          ox = Math.cos(pa) * pr; oy = Math.sin(pa) * pr;
        }
      }

      const sp = S.speed * (1 + (rnd() * 2 - 1) * S.speedVar);
      px[i] = S.x + ox; py[i] = S.y + oy;
      vx[i] = S.vx + Math.cos(ang) * sp;
      vy[i] = S.vy + Math.sin(ang) * sp;

      drg[i] = S.drag; grv[i] = S.grav;
      const lf = Math.max(0.02, S.life * (1 + (rnd() * 2 - 1) * S.lifeVar));
      life[i] = lf; maxLife[i] = lf;

      const sv = 1 + (rnd() * 2 - 1) * S.sizeVar;
      sz0[i] = S.size * sv; sz1[i] = S.size2 * sv;

      rot[i] = (fl & F_ALIGN) ? ang : S.rot + rnd() * TAU;
      spin[i] = S.spin ? S.spin * (1 + (rnd() * 2 - 1) * S.spinVar) * (rnd() < 0.5 ? -1 : 1) : 0;

      cr0[i] = S.r0; cg0[i] = S.g0; cb0[i] = S.b0; ca0[i] = S.a0;
      cr1[i] = S.r1; cg1[i] = S.g1; cb1[i] = S.b1; ca1[i] = S.a1;

      str[i] = S.stretch;
      sid[i] = S.sid;
      flg[i] = fl;
      seq[i] = ticket++;
    }
    return want;
  }

  function step(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;   // back from a hidden tab: do not teleport the field

    // Particles from one burst are contiguous and share a drag, so memoising
    // the last exp() hits nearly every iteration.
    let lastD = -1, mul = 1;

    for (let i = 0; i < n; i++) {
      const l = life[i] - dt;
      if (l <= 0) { removeAt(i); i--; continue; }
      life[i] = l;

      const d = drg[i];
      if (d !== lastD) { lastD = d; mul = d > 0 ? Math.exp(-d * dt) : 1; }

      const ux = vx[i] * mul;
      const uy = vy[i] * mul + grv[i] * dt;
      vx[i] = ux; vy[i] = uy;
      px[i] += ux * dt; py[i] += uy * dt;

      if (flg[i] & F_ALIGN) { if (ux || uy) rot[i] = Math.atan2(uy, ux); }
      else if (spin[i]) rot[i] += spin[i] * dt;
    }
  }

  function pass(r, additive) {
    for (let i = 0; i < n; i++) {
      const f = flg[i];
      if (((f & F_ADD) !== 0) !== additive) continue;

      const t = 1 - life[i] / maxLife[i];
      const a = ca0[i] + (ca1[i] - ca0[i]) * t;
      if (a <= 0.004) continue;

      const s = sz0[i] + (sz1[i] - sz0[i]) * t;
      if (s <= 0.01) continue;

      const cr = cr0[i] + (cr1[i] - cr0[i]) * t;
      const cg = cg0[i] + (cg1[i] - cg0[i]) * t;
      const cb = cb0[i] + (cb1[i] - cb0[i]) * t;
      const id = sid[i], st = str[i];

      if (id >= 0 && st === 0) {
        r.sprite(id, px[i], py[i], rot[i], s, cr, cg, cb, a);
      } else {
        // Stretched particles are quads even when a sprite id is set: `sprite`
        // takes one uniform scale, and the whip effect is entirely in the
        // difference between length and thickness.
        const w = st > 0 ? s + Math.hypot(vx[i], vy[i]) * st : s;
        r.quad(px[i], py[i], w, s, rot[i], cr, cg, cb, a);
      }
    }
  }

  return {
    emit,
    step,
    draw(r) {
      if (!n || !r) return;
      if (r.layer) r.layer('main');
      pass(r, false);
      if (r.layer) r.layer('add');
      pass(r, true);
    },
    setBudget(v) { budget = Math.max(0, Math.min(cap, v | 0)); },
    clear() { n = 0; },
    get count() { return n; },
    get budget() { return budget; },
    get capacity() { return cap; },
  };
}

// ---------------------------------------------------------------------------
// Spec merge. The caller reuses one object literal per event type, so the spec
// is read into this module-level scratch and never retained past emit().

const KEYS = [
  'n', 'x', 'y', 'r', 'ring', 'dir', 'spread', 'speed', 'speedVar', 'vx', 'vy',
  'drag', 'grav', 'life', 'lifeVar', 'size', 'size2', 'sizeVar', 'spin',
  'spinVar', 'rot', 'align', 'add', 'sprite', 'stretch', 'cheap',
];

const DEF = {
  n: 8, x: 0, y: 0, r: 0, ring: 0, dir: 0, spread: Math.PI, speed: 60,
  speedVar: 0.4, vx: 0, vy: 0, drag: 3, grav: 0, life: 0.5, lifeVar: 0.35,
  size: 3, size2: 0, sizeVar: 0.3, spin: 0, spinVar: 0.4, rot: 0, align: 0,
  add: 1, sprite: null, stretch: 0, cheap: 1,
};

const S = {
  n: 8, x: 0, y: 0, r: 0, ring: 0, dir: 0, spread: Math.PI, speed: 60,
  speedVar: 0.4, vx: 0, vy: 0, drag: 3, grav: 0, life: 0.5, lifeVar: 0.35,
  size: 3, size2: 0, sizeVar: 0.3, spin: 0, spinVar: 0.4, rot: 0, align: 0,
  add: 1, sprite: null, stretch: 0, cheap: 1,
  r0: 1, g0: 1, b0: 1, a0: 1, r1: 1, g1: 1, b1: 1, a1: 0, sid: -1,
};

function readSpec(spec) {
  const p = spec.preset ? PRESETS[spec.preset] : null;
  for (let k = 0; k < KEYS.length; k++) {
    const key = KEYS[k];
    const v = spec[key];
    if (v !== undefined) S[key] = v;
    else { const pv = p ? p[key] : undefined; S[key] = pv !== undefined ? pv : DEF[key]; }
  }

  let c = spec.col !== undefined ? spec.col : (p ? p.col : undefined);
  if (c) { S.r0 = c[0]; S.g0 = c[1]; S.b0 = c[2]; S.a0 = c.length > 3 ? c[3] : 1; }
  else { S.r0 = 1; S.g0 = 1; S.b0 = 1; S.a0 = 1; }

  c = spec.col2 !== undefined ? spec.col2 : (p ? p.col2 : undefined);
  if (c) { S.r1 = c[0]; S.g1 = c[1]; S.b1 = c[2]; S.a1 = c.length > 3 ? c[3] : 0; }
  else { S.r1 = S.r0; S.g1 = S.g0; S.b1 = S.b0; S.a1 = 0; }

  S.sid = resolve(S.sprite);
  S.sprite = null;   // never retain anything that came off the caller's object
}

// ---------------------------------------------------------------------------
// Sprite ids. particles.js deliberately imports nothing — the atlas is built by
// another lane and a static import would couple this module's load to that
// file's state. The host calls setSpriteResolver(atlas.spriteId) once the atlas
// exists; until then every preset draws as an untextured quad, which is ugly
// but never blank.

let resolver = null;
const idCache = new Map();

export function setSpriteResolver(fn) {
  resolver = typeof fn === 'function' ? fn : null;
  idCache.clear();
}

function resolve(sprite) {
  if (sprite === null || sprite === undefined) return -1;
  if (typeof sprite === 'number') return sprite | 0;
  if (!resolver) return -1;
  let id = idCache.get(sprite);
  if (id === undefined) {
    id = resolver(sprite);
    id = (typeof id === 'number' && id >= 0) ? id | 0 : -1;
    idCache.set(sprite, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// PRESETS — tweakable data, not numbers buried in call sites. scenefx passes
// `{ preset:'cut', x, y, col }` and overrides only what the event knows.
//
// `cheap: 0` marks an effect the budget culler must never eat: the signature
// beats (a thread snapping, a Conductor going down) have to survive a frame
// where the screen is full of embers.

export const PRESETS = {
  hit: {
    n: 6, speed: 95, speedVar: 0.5, drag: 9, life: 0.2, lifeVar: 0.4,
    size: 2.4, size2: 0, add: 1, stretch: 0.012, align: 1,
    col: [1, 0.96, 0.82, 1], col2: [1, 0.55, 0.22, 0],
  },

  crit: {
    n: 16, speed: 170, speedVar: 0.55, drag: 7, life: 0.32, lifeVar: 0.4,
    size: 3.2, size2: 0, add: 1, stretch: 0.02, align: 1, cheap: 0,
    col: [1, 1, 0.94, 1], col2: [1, 0.72, 0.16, 0],
  },

  // Solid, not additive: blood must read as matter against the bloom, and it
  // is the one thing on screen that should look wet rather than lit.
  blood: {
    n: 10, speed: 110, speedVar: 0.7, drag: 1.6, grav: 260, life: 0.62,
    lifeVar: 0.45, size: 2.6, size2: 1.1, add: 0, stretch: 0.008, align: 1,
    col: [0.62, 0.06, 0.09, 0.95], col2: [0.22, 0.02, 0.04, 0],
  },

  death: {
    n: 14, speed: 60, speedVar: 0.6, drag: 4.5, grav: -22, life: 0.7,
    lifeVar: 0.4, size: 3, size2: 7.5, add: 0, spin: 1.6, cheap: 0,
    col: [0.85, 0.84, 0.79, 0.8], col2: [0.24, 0.26, 0.33, 0],
  },

  // THE signature effect. A severed thread does not puff, it whips: near-white
  // at the break, very fast, very short-lived, stretched hard along velocity,
  // fading into the Choir's colour so the player learns whose string it was.
  cut: {
    n: 14, speed: 330, speedVar: 0.6, drag: 10, life: 0.19, lifeVar: 0.45,
    size: 2.2, size2: 0, add: 1, stretch: 0.055, align: 1, spread: 0.55,
    cheap: 0, col: [1, 1, 1, 1], col2: [0.65, 0.85, 1, 0],
  },

  shockwave: {
    n: 44, ring: 1, r: 6, speed: 430, speedVar: 0.14, drag: 3.6, life: 0.45,
    lifeVar: 0.2, size: 5.5, size2: 0, add: 1, stretch: 0.03, align: 1,
    cheap: 0, col: [1, 1, 1, 1], col2: [0.7, 0.78, 1, 0],
  },

  pickup: {
    n: 5, speed: 48, speedVar: 0.6, drag: 6, grav: -60, life: 0.3,
    lifeVar: 0.3, size: 1.8, size2: 0, add: 1,
    col: [0.7, 1, 0.95, 1], col2: [0.2, 0.7, 1, 0],
  },

  levelup: {
    n: 40, ring: 1, r: 5, speed: 150, speedVar: 0.35, drag: 2.4, grav: -70,
    life: 0.95, lifeVar: 0.4, size: 3, size2: 0, add: 1, spin: 3, cheap: 0,
    col: [1, 0.95, 0.72, 1], col2: [1, 1, 1, 0],
  },

  burn: {
    n: 4, speed: 34, speedVar: 0.8, drag: 2.2, grav: -95, life: 0.55,
    lifeVar: 0.5, size: 2.8, size2: 0.4, add: 1,
    col: [1, 0.72, 0.24, 0.95], col2: [0.85, 0.12, 0.03, 0],
  },

  spark: {
    n: 8, speed: 210, speedVar: 0.7, drag: 13, life: 0.24, lifeVar: 0.5,
    size: 1.6, size2: 0, add: 1, stretch: 0.03, align: 1,
    col: [1, 1, 0.9, 1], col2: [1, 0.6, 0.2, 0],
  },

  // Ambient. Cheap by definition: the budget culler eats these first and
  // nobody notices.
  ember: {
    n: 3, speed: 14, speedVar: 1, drag: 0.7, grav: -20, life: 1.7,
    lifeVar: 0.6, size: 1.5, size2: 0.2, add: 1,
    col: [1, 0.6, 0.22, 0.7], col2: [0.7, 0.2, 0.05, 0],
  },

  smoke: {
    n: 5, speed: 18, speedVar: 0.9, drag: 2.4, grav: -30, life: 1.5,
    lifeVar: 0.5, size: 4, size2: 15, add: 0, spin: 0.7,
    col: [0.16, 0.17, 0.22, 0.5], col2: [0.06, 0.06, 0.1, 0],
  },

  // Chorus: motes pulled INWARD (negative speed) toward the lattice. Slow, big
  // and bright — this is the screenshot.
  chorus: {
    n: 60, ring: 1, r: 150, speed: -95, speedVar: 0.3, drag: 0.9, life: 1.5,
    lifeVar: 0.35, size: 2, size2: 6, add: 1, cheap: 0,
    col: [0.75, 0.85, 1, 0.85], col2: [1, 1, 1, 0],
  },
};

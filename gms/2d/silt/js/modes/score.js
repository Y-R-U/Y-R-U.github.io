// Scoring is a mode concern, not a sim concern.
//
// The engine awards points itself inside World.tick on a scale nobody can read
// (a 6000-cell chain is worth ~400k). Rather than mirror the engine formula
// here — which would silently rot the day the manager tunes it — the scorer
// records the score at the end of every tick and, when a chain fires, REPLACES
// whatever the engine just added with its own award. It is formula-independent
// by construction; modesim gate S1 proves it and `--break score` proves that
// gate can go red.
//
// It also owns the combo counter. World.combo only ever increments, so it is
// really a chain counter; a combo has to expire, and only the mode layer knows
// how long a collapse takes.

export const SCORE_DEFAULTS = {
  per: 20,           // cells per point at the linear end
  curve: 8000,       // superlinear knee: a chain this big is worth 2x linear
  comboStep: 0.25,   // extra multiplier per chain in an unbroken combo
  comboWindow: 150,  // ticks; a collapse-and-reclear inside this is one combo
  comboMax: 8,
  mult: 1,           // mode multiplier
};

export function chainPoints(n, combo, o = SCORE_DEFAULTS) {
  const c = Math.min(o.comboMax, Math.max(1, combo | 0));
  const p = (n / o.per) * (1 + n / o.curve) * (1 + o.comboStep * (c - 1)) * o.mult;
  return Math.max(1, Math.round(p));
}

export function makeScorer(opts = {}) {
  const o = { ...SCORE_DEFAULTS, ...opts };
  return {
    opts: o,
    prev: 0,
    total: 0,
    combo: 0,
    best: 0,
    lastTick: -1e9,
    awards: [],

    /** Call once at mode start and once at the end of every tick. */
    sync(world) { this.prev = world.score; },

    /**
     * Call from onChain. `weight` lets a mode discount a chain (TIDE pays less
     * for water). Returns the points awarded.
     */
    award(world, n, weight = 1) {
      this.combo = (world.ticks - this.lastTick <= o.comboWindow) ? this.combo + 1 : 1;
      this.lastTick = world.ticks;
      if (this.combo > this.best) this.best = this.combo;
      const pts = Math.max(0, Math.round(chainPoints(n, this.combo, o) * weight));
      world.score = this.prev + pts;   // discards the engine's own award
      this.prev = world.score;
      this.total += pts;
      world.combo = this.combo;        // keep the HUD honest
      this.awards.push(pts);
      return pts;
    },

    /** Expire the combo when nothing has cleared for a while. */
    tick(world) {
      if (this.combo && world.ticks - this.lastTick > o.comboWindow) {
        this.combo = 0;
        world.combo = 0;
      }
      this.sync(world);
    },

    zero(world) { world.score = 0; this.prev = 0; this.combo = 0; world.combo = 0; },
  };
}

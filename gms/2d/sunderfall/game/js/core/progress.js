/* SUNDERFALL — progress that survives a refresh.
 *
 * A browser tab is not a console. It gets closed, reloaded, backgrounded until
 * iOS discards it, and every one of those threw away the run. Twenty minutes of
 * levels and ranks vanished with no warning and nothing on screen had ever
 * suggested they were only in memory.
 *
 * What is saved is what was EARNED — level, XP, the spells he knows and their
 * ranks, which circle each sits in, shards, and how far along the road he got.
 * What is not saved is the state of the world: broken props, scorched ground,
 * spent enemies. Serialising a destructible level is a different and much
 * larger job, and this game rebuilds it on every restart anyway, so resuming
 * puts him back at his last checkpoint in an intact world. That is a trade, and
 * an honest one — you keep the character, you replay the road.
 *
 * Writes are debounced and also flushed on pagehide, because a phone rarely
 * gives you an unload event and never gives you two.
 */

const KEY = 'sunderfall.progress.v1';
const VERSION = 1;
const WRITE_DELAY = 1200;

export function createProgress(ctx) {
  const bus = ctx.bus;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  // headless runs and demos must not inherit a save, or a regression test is
  // measuring whatever the last one happened to leave behind
  const enabled = !q.has('nosave') && !q.has('noenemies') && !q.has('demo') && hasStorage();

  const P = {
    enabled,
    loaded: null,        // what was on disk at boot, or null
    resumeAt: null,      // {x, y} — consumed once, by the play scene
    resumeHp: 0,
    lastMark: { x: 0, y: 0 },
    dead: false,         // saved mid-death-screen: the ward has not been paid yet
    wardOnBoot: false,
    dirty: false,

    /* Act two's place in the story. The world is deliberately not saved (see the
     * header) but *where in the story he is* is not world state, it is progress,
     * and losing it meant a refresh during the boss put him back on the road with
     * the gate shut.
     *
     *   state — the act machine's current state; sim/act.js re-enters it on boot
     *   seen  — cutscene ids played THROUGH TO THE END. A scene interrupted by a
     *           death is not in here, so it replays; one he actually watched does
     *           not. That distinction is the whole reason this is a set and not a
     *           high-water mark.
     *   wins  — how many times this save has closed the seam.
     */
    act: { state: 'road', seen: Object.create(null), wins: 0 },
    actOnBoot: null,     // what was on disk, or null — sim/act.js consumes it
  };

  function hasStorage() {
    try {
      const k = '__sf_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch { return false; }
  }

  function read() {
    if (!enabled) return null;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION) return null;
      return d;
    } catch { return null; }
  }

  function snapshot() {
    const S = ctx.spellSystem;
    if (!S || !S.serialize) return null;
    const p = ctx.world && ctx.world.player;
    return {
      v: VERSION,
      at: Date.now(),
      spells: S.serialize(),
      mark: { x: P.lastMark.x, y: P.lastMark.y },
      hp: p && p.alive ? Math.round(p.hp) : 0,
      maxHp: p ? Math.round(p.maxHp || 0) : 0,
      dead: !!P.dead,
      act: { state: P.act.state, seen: Object.assign({}, P.act.seen), wins: P.act.wins | 0 },
    };
  }

  let timer = 0;
  function flush() {
    if (!enabled) return;
    if (timer) { clearTimeout(timer); timer = 0; }
    P.dirty = false;
    const d = snapshot();
    if (!d) return;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota or private mode */ }
  }

  /** Ask for a write soon. Cheap to call from anywhere, including per-frame code. */
  P.touch = function () {
    if (!enabled || timer) return;
    P.dirty = true;
    timer = setTimeout(() => { timer = 0; flush(); }, WRITE_DELAY);
  };
  P.flush = flush;

  /** The play scene's rolling checkpoint moved. */
  P.mark = function (x, y) {
    P.lastMark.x = x; P.lastMark.y = y;
    P.touch();
  };

  /**
   * The act machine moved, or watched a scene to the end.
   * `seen` is merged, never replaced — a rewind must not un-see a cutscene.
   */
  P.setAct = function (state, seenId) {
    if (state) P.act.state = state;
    if (seenId) P.act.seen[seenId] = 1;
    P.touch();
  };
  P.recordWin = function () {
    P.act.wins = (P.act.wins | 0) + 1;
    P.act.state = 'won';
    flush();
  };

  P.clear = function () {
    P.lastMark.x = 0; P.lastMark.y = 0;
    P.resumeAt = null; P.resumeHp = 0;
    // "Nothing kept" includes the story. Leaving the act state behind would put
    // a brand-new run at the boss with an unbuilt arena.
    P.act = { state: 'road', seen: Object.create(null), wins: 0 };
    P.actOnBoot = null;
    if (!enabled) return;
    if (timer) { clearTimeout(timer); timer = 0; }
    try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  };

  /** Take the spawn point once, then forget it: a restart starts at the start. */
  P.takeSpawn = function () {
    const at = P.resumeAt;
    P.resumeAt = null;
    return at;
  };

  /**
   * Boot. Applies the saved progression to the spell system immediately (the
   * HUD is a pull-mirror, so it needs no telling) and parks the spawn point for
   * the play scene to collect.
   */
  P.boot = function () {
    const d = read();
    if (!d) return false;
    P.loaded = d;
    const S = ctx.spellSystem;
    if (!S || !S.restore || !S.restore(d.spells)) return false;
    /* Refreshing on the death screen must not be cheaper than pressing Again.
     * The save is written the moment he dies, before either button has been
     * pressed, so a reload from there would hand back the whole run with the
     * ward unpaid. Charge it on the way in instead. */
    if (d.dead && S.softReset) { S.softReset(); P.wardOnBoot = true; }
    if (d.act && typeof d.act.state === 'string') {
      P.act.state = d.act.state;
      P.act.wins = d.act.wins | 0;
      if (d.act.seen) for (const k in d.act.seen) P.act.seen[k] = 1;
      P.actOnBoot = P.act.state;
    }
    if (d.mark && d.mark.x > 0 && !d.dead) {
      P.resumeAt = { x: d.mark.x, y: d.mark.y };
      P.lastMark.x = d.mark.x; P.lastMark.y = d.mark.y;
    }
    // Never resume into a death you cannot avoid: the world is rebuilt around
    // him, so the fire he was standing in is gone but the 4hp is not.
    if (d.hp > 0 && d.maxHp > 0) P.resumeHp = Math.max(d.hp, Math.round(d.maxHp * 0.3));
    return true;
  };

  if (bus) {
    // the three things a player would be furious to lose
    for (const ev of ['spell:learn', 'spell:levelup', 'spell:slots', 'player:level']) {
      bus.on(ev, () => P.touch());
    }
    // Death rewinds the road but not the character: the ward hands back most of
    // what he was, and the level rebuilds from the top either way.
    bus.on('player:died', () => {
      P.lastMark.x = 0; P.lastMark.y = 0;
      P.resumeAt = null; P.resumeHp = 0;
      P.dead = true;
      flush();
    });
    bus.on('scene:change', (e) => { if (e && e.name === 'play') P.dead = false; });
  }

  if (typeof window !== 'undefined') {
    // pagehide is the only one iOS reliably fires; visibilitychange covers the
    // app-switch that never comes back
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  return P;
}

export { KEY as PROGRESS_KEY };

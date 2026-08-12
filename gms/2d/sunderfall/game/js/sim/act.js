/* SUNDERFALL — act two, as one state machine.
 *
 * Ostrick told Rook to keep the fire lit. The fire goes out. Nine states carry
 * that from the end of the road to the victory screen:
 *
 *   road → stones → vigil → fire → approach → glade → arena → boss → won
 *
 * Everything the act does to the world it does through three seams it does not
 * own — `story.play(id)` (SF-STORY), `openGate`/`sealArena` (SF-LEVEL), and the
 * director (already shipped). Any of the three may be missing; the machine runs
 * without them and says so once. That is not politeness, it is the only way four
 * agents can land in the same week.
 *
 * Three things in here are less obvious than they look:
 *
 * 1. **Every state must be enterable cold.** `?act=boss` has to build the world,
 *    carve the gate, seal the arena, put the boy inside it and spawn the Seam,
 *    with nobody having walked a step. `catchUp()` is what does that, and it is
 *    also what a refresh and a death both go through — so there is one code path
 *    for "arrive here", not three.
 * 2. **A cutscene is "seen" only when it finishes.** Dying under one leaves it
 *    unseen, so it replays; watching it to the end retires it forever. That is
 *    recorded in `core/progress.js`, not here, because it has to survive a tab.
 * 3. **Death rewinds to the start of the current state, not to the road.** The
 *    ward (main.js) decides what is left of the character; this decides where in
 *    the story he wakes up.
 */

import { groundAt } from './level.js';

export const ACT_STATES = ['road', 'stones', 'vigil', 'fire', 'approach', 'glade', 'arena', 'boss', 'won'];

/**
 * Mirrors `PHASES[].at` in `enemies/units/theseam.js`, which does not export
 * them. Duplicated in exactly one place on this side of the fence and passed to
 * the HUD from here, so the pips cannot disagree with the fight in two files.
 * REQUEST filed in the handoff: export PHASES from theseam.js and delete this.
 */
const SEAM_PHASES = [0.72, 0.44, 0.16];

/**
 * Where the boy stands when a state is entered without walking into it — a
 * refresh, a death, or `?act=`. Every one of these is read against `REGION` in
 * `sim/glade.js`, which owns the geometry: the breach is 7600–7970, the track
 * 7960–8520, the glade plateau 8520–9100, the drop 9100–9500, the plug
 * 9300–9540 and the seal trigger 9620. Landing on the wrong side of any of
 * those is a state you cannot play out of.
 */
const ENTRY_X = {
  road: 470,
  stones: 7380,     // west of the stones, facing them — the scene frames from here
  vigil: 7470,
  fire: 7470,
  approach: 7990,   // through the breach, at the foot of the scorched track
  glade: 8600,      // on the plateau, west of the staff at 8790
  arena: 9160,      // top of the drop; walking east from here trips the seal
  boss: 9760,       // past the plug and past the 9620 trigger, inside the bowl
  won: 10100,
};

/** Contract §3.5 shapes, used only if `sim/level.js` ever stops publishing one. */
const FALLBACK_MARKS = {
  stones: { x: 7550, brazier: null, a: 7500, b: 7600 },
  gate: { x: 7770, w: 240 },
  glade: { x: 8760, staffX: 8790, ring: [] },
  arena: { x: 10300, y: -240, w: 1900, h: 1000, bossX: 10300, bossY: -240 },
  seal: { x: 9620 },
};

const VIGIL_WAVES = [
  [{ id: 'husk', n: 3, at: 'ahead', spread: 220 }, { id: 'sporeling', n: 2, at: 'behind', spread: 160 }],
  [{ id: 'husk', n: 3, at: 'ahead', spread: 240 }, { id: 'thornhound', n: 2, at: 'behind' }, { id: 'gloamarcher', n: 1, at: 'ahead' }],
  [{ id: 'thornhound', n: 3, at: 'ahead', spread: 260 }, { id: 'gloamarcher', n: 2, at: 'behind' },
    { id: 'wispmaw', n: 2 }, { id: 'stonewarden', n: 1, at: 'ahead' }],
];
const VIGIL_LIMIT = 90;      // §3.6: the vigil ends either way after 90 seconds
const WAVE_GAP = 2.6;
const SCENE_WATCHDOG = 150;  // a runner that never resolves must not soft-lock the game

export function createAct(ctx, world, opts) {
  const o = opts || {};
  const bus = ctx.bus;
  /* Read lazily, never captured. `main.js` builds `createProgress(ctx)` AFTER
     `createPlayScene(ctx)` returns — it has to, because progress restores into the
     spell system and the play scene is what brings that up — so a `ctx.progress`
     grabbed here is null forever. That silently cost the act machine every one of
     its persistence guarantees: no saved state, no seen-cutscene set, no win
     count, and a headless run that looked perfect because nothing ever threw. */
  const prog = () => ctx.progress || null;

  let marks = o.marks || null;
  let story = o.story || null;
  let director = o.director || null;

  let state = 'road';
  let entered = 0;
  let busy = false;          // a scene is playing
  let busyT = 0;
  let epoch = 0;             // bumped on every rebuild; stale promises check it
  let live = false;          // false until the first rebuild, so update() is inert

  let gateOpen = false;
  let sealed = false;
  let bossEnt = null;
  let stubbedLevel = false;

  let waveI = 0;
  let waveGap = 0;
  let waveLive = [];

  const offs = [];
  const warned = Object.create(null);
  const warn = (k, msg) => { if (!warned[k]) { warned[k] = 1; console.warn('[act] ' + msg); } };

  const idx = (s) => ACT_STATES.indexOf(s);
  const seen = (id) => { const P = prog(); return !!(P && P.act.seen[id]); };

  /* ------------------------------------------------------------------ *
   * Marks
   * ------------------------------------------------------------------ */

  /**
   * `sim/level.js` publishes every act-two mark. This only fills a hole if one
   * ever goes missing, so that a mark typo costs one warning and a slightly
   * wrong position rather than the whole ending.
   */
  function ensureMarks() {
    stubbedLevel = false;
    if (!marks) marks = {};
    for (const k in FALLBACK_MARKS) {
      if (marks[k]) continue;
      stubbedLevel = true;
      warn('marks.' + k, 'sim/level.js published no marks.' + k + ' — using the contract value');
      marks[k] = JSON.parse(JSON.stringify(FALLBACK_MARKS[k]));
    }
    if (marks.arena.bossY == null) marks.arena.bossY = groundAt(marks.arena.bossX) - 330;
  }

  /* ------------------------------------------------------------------ *
   * The two irreversible changes to the level
   * ------------------------------------------------------------------ */

  /**
   * Both live in `sim/glade.js` and are re-exported by `sim/level.js`. (The
   * contract put them in level.js; the code on disk moved the geometry into
   * glade.js and re-exported — the same thing seen from out here.)
   *
   * They already guard themselves on `marks.gate.open` / `marks.seal.closed`, so
   * the booleans here are not the safety. They are how the act knows what it has
   * already done to a world it did not build, which is what `catchUp` needs, and
   * they are reset in `rebuild` because the level is rebuilt intact every time.
   *
   * `world.openGate` / `world.sealArena` are re-bound to these in `rebuild`, so a
   * `gate.open` cue from the runner and an `approach` transition go through one
   * door rather than two.
   */
  function openGate() {
    if (gateOpen) return;
    gateOpen = true;
    if (o.level && o.level.openGate) o.level.openGate(world, marks);
    else warn('gate', 'no openGate export — the rock face will not open');
    bus.emit('hint:tip', { text: 'The rock face has opened. East.', value: 'BREACH', life: 8 });
  }

  function sealArena() {
    if (sealed) return;
    sealed = true;
    if (o.level && o.level.sealArena) o.level.sealArena(world, marks);
    else warn('seal', 'no sealArena export — the arena will not close');
  }

  /* ------------------------------------------------------------------ *
   * Cutscenes
   * ------------------------------------------------------------------ */

  /**
   * Play a scene and move on when it ends. A scene already watched to the end is
   * not replayed — but its cues still have to have happened, which is why every
   * world change a scene causes is also applied by `catchUp` on the way in.
   */
  function playScene(id, next) {
    if (seen(id) || !story || !story.play) {
      if (!story) warn('story', 'story/runner.js is not present — cutscenes are skipped, the act still runs');
      finishScene(id, next);
      return;
    }
    busy = true;
    busyT = 0;
    const tok = epoch;
    let done = false;
    const end = () => {
      if (done || tok !== epoch) return;
      done = true;
      busy = false;
      finishScene(id, next);
    };
    try {
      Promise.resolve(story.play(id)).then(end, (err) => {
        console.error('[act] scene ' + id + ' threw', err);
        end();
      });
    } catch (err) {
      console.error('[act] scene ' + id + ' threw', err);
      end();
    }
  }

  function finishScene(id, next) {
    const P = prog();
    if (P) P.setAct(null, id);
    // A runner that returned early must never leave the player unable to move.
    world.camLock = false;
    world.playerControl = true;
    if (next) go(next);
  }

  /* ------------------------------------------------------------------ *
   * State machine
   * ------------------------------------------------------------------ */

  function go(next) {
    if (state === next) return;
    state = next;
    entered = 0;
    const P = prog();
    if (P) P.setAct(next, null);
    onEnter(next, false);
  }

  /**
   * @param cold true when the state was arrived at by boot/refresh/death rather
   *             than by playing into it — the player gets moved, and the level
   *             gets whatever the states before this one did to it.
   */
  function onEnter(name, cold) {
    switch (name) {
      case 'road':
        if (director) { director.set('pressure', true); director.setMovement('sunderwood'); }
        break;

      case 'stones':
        if (director) director.set('pressure', false);
        playScene('stones', 'vigil');
        break;

      case 'vigil':
        waveI = 0; waveGap = 0.9; waveLive = [];
        if (director) { director.set('pressure', false); director.setMovement('ruinreach'); }
        bus.emit('hint:tip', { text: 'Hold the stones', value: 'VIGIL', life: 6 });
        break;

      case 'fire':
        if (director) { director.clear(); director.set('pressure', false); }
        playScene('fire', 'approach');
        break;

      case 'approach':
        openGate();
        if (director) { director.setMovement('glyphglade'); director.set('pressure', true); director.setIntensity(0.8); }
        break;

      case 'glade':
        if (director) { director.clear(); director.set('pressure', false); }
        playScene('glade', 'arena');
        break;

      case 'arena':
        if (director) { director.set('pressure', true); director.setIntensity(1); }
        // short: the walk from the glade to the seal is about ten seconds, and a
        // hint still on screen when the boss bar arrives is two things fighting
        // for the same strip of a portrait phone
        bus.emit('hint:tip', { text: 'Something is waiting east', value: 'ARENA', life: 5 });
        break;

      case 'boss':
        sealArena();
        if (director) { director.set('pressure', false); }
        spawnBoss();
        break;

      case 'won':
        if (director) { director.clear(); director.set('pressure', false); }
        if (cold) {
          /* Resumed into a finished save. The ending is not replayed — §3.6 is
           * explicit — and the victory screen is part of the ending, so it does
           * not come back either. What it must not do is pretend nothing
           * happened: the world rebuilds intact on every boot (progress.js has
           * never saved the world), so there is no wreckage left to stand in and
           * the only honest thing is to say the run is over and let him walk.
           * "Start over" in the pause menu is the way out, and it already works. */
          world.camLock = false;
          world.playerControl = true;
          bus.emit('hint:tip', { text: 'You already closed it. Nothing left out here.', value: 'DONE', life: 9 });
        } else {
          const P = prog();
          if (P) P.recordWin();
          playScene('after', null);
          scheduleVictory();
        }
        break;
    }
  }

  /** Everything the states before `name` did to the world, done at once. */
  function catchUp(name) {
    const i = idx(name);
    if (i >= idx('approach')) openGate();
    if (i >= idx('boss')) sealArena();
    if (i >= idx('won') && marks.arena) {
      // He won here. The world rebuilds intact on every boot (progress.js only
      // ever saved the character), so the wreckage cannot be restored — the
      // honest version is an empty, quiet arena, said out loud on arrival.
      if (director) director.clear();
    }
  }

  function placePlayer(x) {
    const p = world.player;
    if (!p) return;
    /* Scan from just above the AUTHORED ground, not from the top of the world.
     *
     * `groundY` walks downward and returns the first solid cell it meets, and
     * this level is full of overhangs — the rock face's brow is a slab from
     * x 7380 to 7900 at y −2000..−1300, put there to stop the wall climb. A scan
     * that started at −1400 began *inside* that slab, so it reported the brow as
     * the ground, the physics ejected him upward, and `?act=stones` put Rook on
     * the roof of the level, from where he could walk east over a closed gate.
     * 400px of headroom is more than any prop and far under any brow. */
    const gy = world.groundY(x, groundAt(x) - 400, 1600);
    const y = (Number.isFinite(gy) ? gy : groundAt(x)) - p.h * 0.5 - 4;
    p.x = x; p.px = x; p.y = y; p.py = y; p.vx = 0; p.vy = 0;
    p.invuln = Math.max(p.invuln, 2.5);
    world.setPlayerSpawn(x, y);
    world.cam.x = x; world.cam.y = y - 260;
    const P = prog();
    if (P) P.mark(x, y);
  }

  /* ------------------------------------------------------------------ *
   * The vigil
   * ------------------------------------------------------------------ */

  function vigilAlive() {
    let n = 0;
    for (let i = 0; i < waveLive.length; i++) {
      const e = waveLive[i];
      if (e && e.alive && !e.dead) n++;
    }
    return n;
  }

  function updateVigil(dt) {
    if (entered > VIGIL_LIMIT) { go('fire'); return; }
    if (vigilAlive() > 0) return;
    if (waveI >= VIGIL_WAVES.length) { go('fire'); return; }
    waveGap -= dt;
    if (waveGap > 0) return;
    waveGap = WAVE_GAP;
    const ref = { x: (marks.stones && marks.stones.x) || 7550, y: groundAt(7550) };
    waveLive = (director && director.spawnWave(VIGIL_WAVES[waveI], { ref })) || [];
    waveI++;
    bus.emit('hint:tip', {
      text: waveI === VIGIL_WAVES.length ? 'The last of them' : 'They come again',
      value: waveI + '/' + VIGIL_WAVES.length, kind: 'warn', life: 3.4,
    });
    if (!waveLive.length) warn('director', 'no director — the vigil cannot spawn, skipping to the fire');
    if (!director) go('fire');
  }

  /* ------------------------------------------------------------------ *
   * The boss
   * ------------------------------------------------------------------ */

  function spawnBoss() {
    if (bossEnt && bossEnt.alive) return;
    if (!director || !director.spawnBoss) {
      warn('boss', 'no enemy director — the boss cannot spawn (running with ?noenemies?)');
      return;
    }
    const a = marks.arena;
    const by = a.bossY != null ? a.bossY : (groundAt(a.bossX) - 330);
    bossEnt = director.spawnBoss(a.bossX, by, a);
    if (!bossEnt) warn('boss', 'director.spawnBoss returned nothing');
  }

  function scheduleVictory() {
    // The victory screen is the last thing, after the last line of the game.
    const tok = epoch;
    const tick = () => {
      if (tok !== epoch || state !== 'won') return;
      if (busy) { setTimeout(tick, 250); return; }
      showVictory();
    };
    setTimeout(tick, 250);
  }

  let victoryShown = false;
  function showVictory() {
    if (victoryShown) return;
    victoryShown = true;
    const ui = ctx.ui;
    if (!ui || !ui.victory) { warn('ui', 'no ui.victory — the win is silent'); return; }
    ui.victory({}, {
      onStay() {
        // Stay means stay: the world is still there, he can walk it.
        world.camLock = false;
        world.playerControl = true;
        bus.emit('bark', { who: 'rook', text: 'Someone has to go back for the goats.', priority: 3 });
      },
    });
  }

  /* ------------------------------------------------------------------ *
   * Frame
   * ------------------------------------------------------------------ */

  function update(dt) {
    if (!live) return;
    entered += dt;
    if (busy) {
      busyT += dt;
      if (busyT > SCENE_WATCHDOG) {
        console.warn('[act] scene watchdog fired — the runner never resolved');
        busy = false;
      }
      return;
    }

    const p = world.player;
    if (!p || !p.alive || p.killed) return;

    switch (state) {
      case 'road':
        // 60px west of the first standing stone, so the scene starts as he
        // reaches them rather than after he has walked through them.
        if (p.x > ((marks.stones && marks.stones.a) || 7500) - 60) go('stones');
        break;
      case 'vigil':
        updateVigil(dt);
        break;
      case 'approach':
        if (p.x > ((marks.glade && marks.glade.x) || 8760) - 60) go('glade');
        break;
      case 'arena':
        if (p.x > ((marks.seal && marks.seal.x) || 9620)) go('boss');
        break;
      case 'boss':
        // `boss:dead` drives the exit; this only recovers a boss that never got
        // made (a bad arena mark, or ?noenemies) rather than hanging forever.
        if (!bossEnt && entered > 3) spawnBoss();
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  offs.push(bus.on('boss:dead', () => {
    if (state === 'boss' || state === 'arena') { bossEnt = null; go('won'); }
  }));
  /* The `boss.start` cue (§3.3). A scene can start the fight itself; if one
     does, the arena's own trigger has already been overtaken and the guard in
     `go` makes the second call a no-op. */
  offs.push(bus.on('act:boss', () => { if (idx(state) < idx('boss')) go('boss'); }));
  offs.push(bus.on('boss:spawn', () => {
    // The unit emits its own `boss:spawn` and cannot know the HUD exists, so the
    // pip positions are set here rather than adding a second bar-open call.
    const st = ctx.ui && ctx.ui.state && ctx.ui.state.boss;
    if (st) st.phases = SEAM_PHASES;
  }));
  /* Death rewinds the story to the START of the state he died in — not to the
     road, and not past a cutscene he never got to the end of. `state` is left
     exactly where it is; the restart's `rebuild` re-enters it. */
  offs.push(bus.on('player:died', () => {
    epoch++;
    busy = false;
    const P = prog();
    if (P) P.setAct(state, null);
  }));

  /* ------------------------------------------------------------------ *
   * Public
   * ------------------------------------------------------------------ */

  const act = {
    get state() { return state; },
    get stubbedLevel() { return stubbedLevel; },
    get marks() { return marks; },
    update,

    /**
     * Jump straight to a state, cold: apply everything the earlier states did to
     * the world, move the boy, then enter it. This is `?act=`, and it is also
     * how a refresh and a death arrive.
     */
    set(next, o2) {
      if (idx(next) < 0) { console.warn('[act] unknown state', next); return; }
      epoch++;
      busy = false;
      bossEnt = null;
      victoryShown = false;
      state = next;
      entered = 0;
      catchUp(next);
      if (next !== 'road' || (o2 && o2.place)) placePlayer(ENTRY_X[next]);
      const P = prog();
      if (P) P.setAct(next, null);
      onEnter(next, true);
    },

    /**
     * Called from the play scene's `enter()`, which runs again on every restart:
     * the world and the director are new objects each time, the act's place in
     * the story is not.
     */
    rebuild(deps) {
      epoch++;
      busy = false;
      gateOpen = false;      // the level was rebuilt intact
      sealed = false;
      bossEnt = null;
      victoryShown = false;
      waveI = 0; waveLive = []; waveGap = 0;
      world.camLock = false;
      if (deps) {
        if (deps.marks) marks = deps.marks;
        if (deps.director !== undefined) director = deps.director;
        if (deps.story !== undefined) story = deps.story;
        if (deps.level !== undefined) o.level = deps.level;
      }
      ensureMarks();
      world.marks = marks;
      // §3.3 `gate.open` / arena sealing are named on the world so a cue can call
      // them without the runner needing a handle on the act machine.
      world.openGate = openGate;
      world.sealArena = sealArena;
      live = true;

      /* `progress.act.state` is the truth, not the local `state` — the two are
         kept in step by every transition, but "Start over" and the victory
         screen's Again both go through `progress.clear()`, which resets the save
         and nothing else. Reading the local copy there restarted a brand-new run
         in `won`, on a victory screen, in an arena it had never walked to. */
      const P = prog();
      const saved = P && P.act && P.act.state;
      const want = (deps && deps.state) || saved || state;
      if (idx(want) <= 0) {
        state = 'road';
        entered = 0;
        if (P) P.setAct('road', null);
        onEnter('road', true);
      } else {
        act.set(want);
      }
    },

    destroy() { for (const off of offs) { try { off(); } catch { /* already gone */ } } },
  };

  return act;
}

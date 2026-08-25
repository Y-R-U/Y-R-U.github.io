/**
 * Story mode — DESIGN §7.1, §9.4.
 *
 * The mission, as a pure object: world, crates, terrain, spawner, corridor,
 * objectives, run summary. No DOM, no clock, no `Math.random`, no camera and no
 * renderer, for the same reason `duel.js` has none — the thing `tools/sim.mjs`
 * measures and the thing a person plays have to be the same object or every
 * number P11 produces is a fiction about a second game (§10, D72).
 *
 * `js/main.js`'s `play` scene owns the picture and the thumb; everything about
 * what a mission IS lives here.
 *
 * THE CORRIDOR IS THE ONE THING TO UNDERSTAND. A side-scroller level is a
 * corridor: `sim.mjs`'s `levelRun` says so in its own comment, and says that
 * telling the pilot where the level ends "is the mode shell's job and the mode
 * shell is P10". This is that shell, so the corridor lives here and both drivers
 * import it. It has three walls and a lid:
 *
 *   x < 0                 behind the start line
 *   x > level.length      past the objective
 *   y < column.ceiling    above the act's ceiling (D150)
 *
 * The lid is what D150 settled. `level.column.ceiling` has been in the format
 * since P9 and nothing read it, so DESIGN §8.2's per-act ceiling was a number no
 * code could execute — see `docs/P10_NOTES.md` §1.
 */

import { M_PER_WU } from '../core/math.js';
import { CRUISE_MS, CEILING_WU, bandIdAt, BANDS, BEST_CLIMB_WU_S } from '../core/bands.js';
import { createLevel } from '../data/level.js';
import { validateLevel, formatErrors, evalCondition } from '../data/validate.js';
import { AIRFRAME_BY_ID, REFERENCE } from '../data/tables.js';
import { createWorld, playerType } from '../sim/entities.js';
import { createCrateField, ACT_MULT } from '../sim/crates.js';
import { createSpawner } from '../sim/spawner.js';
import { createTerrain } from '../sim/terrain.js';
import { createAI } from '../sim/ai.js';
import { createPilot } from '../sim/pilot.js';
import { createRNG } from '../core/rng.js';

export const STORY = Object.freeze({
  /** §9.4 / §7.1: restart is a 1.2 s "again" card, not a modal and not a menu. */
  againSecs: 1.2,
  /** §7.1: levels over 120 s and all bosses get ONE checkpoint at 60% progress. */
  checkpointFrac: 0.60,
  checkpointMinSecs: 120,
  /** A mission that has not resolved in five minutes is over; §7.1 targets 60–200 s. */
  maxSecs: 300,
  /** §9.4's repair fee: 1 Scrip per 4 structure lost, capped at 60. */
  repairPerHp: 1 / 4,
  repairCap: 60,
  /** The wall's restitution, taken from the corridor `sim.mjs` already shipped. */
  wallRestitution: 0.6,
});

/** Objective types this shell can actually score. Anything else is REPORTED. */
export const SCORABLE = Object.freeze(['reach', 'survive', 'destroy:aircraft', 'collect:crate']);

/**
 * The corridor. Called once per aircraft per tick by whoever is driving.
 *
 * `lengthWu` and `ceilingWu` are passed rather than read off a level object so
 * the caller cannot accidentally hand it a raw document whose `column` has not
 * been defaulted yet.
 */
export function containInLevel(world, e, lengthWu, ceilingWu, opts = {}) {
  if (!e.alive) return 0;
  const f = e.flight;
  let hit = 0;

  // The lid first: it is the one an aeroplane can sit against for a long time,
  // and reflecting it after a wall reflection would fight the wall's own theta.
  if (!opts.noLid && ceilingWu < 0) {
    const ceilM = ceilingWu * M_PER_WU;
    if (f.sy < ceilM) {
      f.sy = ceilM;
      if (f.svy < 0) f.svy = -f.svy * STORY.wallRestitution;
      f.theta = Math.atan2(f.svy, f.svx);
      hit |= 1;
    }
  }

  if (!opts.noWalls) {
    const lo = 0, hi = lengthWu * M_PER_WU;
    if (f.sx <= lo || f.sx >= hi) {
      // §5.2: a hostile that reaches its own line having broken off survives and
      // comes back next level with a grudge. It does not bounce off the scenery.
      if (e.side === -1 && e.ai && e.ai.state === 'BUG_OUT') {
        e.fled = true; world.stats.fled++; world.despawn(e);
        return hit | 2;
      }
      f.sx = f.sx <= lo ? lo + 1 : hi - 1;
      f.svx = -f.svx * STORY.wallRestitution;
      f.theta = Math.atan2(f.svy, f.svx);
      hit |= 2;
    }
  }
  return hit;
}

/**
 * D31's "occupied", derived rather than picked: a band is occupied if the
 * player spent longer in it than crossing it costs at best climb. Anything less
 * is a transit, which is what a band being a *place* rather than a *step* means
 * (D27). The same arithmetic `sim.mjs` uses; exported so there is one copy.
 */
export function occupancyOf(timeInBand) {
  return BANDS.map((b) => ({
    id: b.id,
    s: timeInBand[b.id] || 0,
    transitS: +(Math.abs(b.y1 - b.y0) / BEST_CLIMB_WU_S).toFixed(2),
  }));
}

/**
 * The player's stick, as a pilot object.
 *
 * `world.update` calls `e.pilot.update(dt, e.flight)` for every aircraft, so the
 * human's aeroplane needs a pilot that reads an axis instead of solving for one.
 * This is `tools/pages/hud.html`'s shim, promoted to shipped code — the page
 * that gate H1–H12 were measured on already flew the player this way, so
 * nothing about the control path changes when it moves in here.
 */
export function createHumanPilot(advisor = null, guide = null, thumb = true) {
  const axis = { x: 0, y: 0 };
  const want = { x: 0, y: 0 };
  let intent = 'manual';
  return {
    tier: thumb ? 'human' : 'guided', axis, want,
    params: advisor ? advisor.params : { period: 0, quantum: 0, envelope: 1, gain: 1, wander: 0, lead: 1 },
    get intent() { return advisor ? advisor.intent : intent; },
    setIntent(n, v) { if (advisor) advisor.setIntent(n, v); else intent = n; return this; },
    setAxisX(v) { if (advisor) advisor.setAxisX(v); axis.x = v; },
    set(x, y) { axis.x = x; axis.y = y; },
    update(dt, ac) {
      /**
       * THE GUIDE RUNS HERE AND NOWHERE ELSE, and the position matters.
       * `world.update` calls `e.ai.update()` and THEN `e.pilot.update()`, so this
       * is the only point after the dogfight controller has spoken at which the
       * mode shell can still say where the level is. `sim.mjs` names the gap in
       * its own words — "PATROL holds the heading it inherits; it has no idea
       * where the objective is, because telling him is the mode shell's job and
       * the mode shell is P10". This is that sentence, executed.
       *
       * The advisor's stick is then always computed and, on the thumb arm, never
       * applied — a headless gate puts a REAL TOUCH where a competent pilot would
       * put a thumb, so what it measures is thumb travel rather than an invented
       * axis (`hud.html`'s `?auto=thumb`). Both arms run the same pilot, so they
       * are comparable.
       */
      if (advisor) {
        if (guide) { const pt = guide(); if (pt) advisor.setIntent('point', pt); }
        const r = advisor.update(dt, ac);
        want.y = r.axisY; want.x = r.axisX;
      }
      if (!thumb && advisor) return { axisY: want.y, axisX: want.x };
      ac.setInput(axis.y, axis.x);
      return { axisY: axis.y, axisX: axis.x };
    },
  };
}

/**
 * One mission.
 *
 * `ctx` needs `rng` and may have `bus`. Everything else is optional and the run
 * works headlessly without it, which is the point.
 */
export function createStoryRun(ctx = {}, raw = {}, opts = {}) {
  const level = raw && raw.column && raw.wind ? raw : createLevel(raw);
  const res = validateLevel(level);
  if (!res.ok) throw new Error(formatErrors(level.id, res.errors).join('\n'));

  const seed = opts.seed ?? level.seed ?? level.id;
  const rng = ctx.rng || createRNG(seed);
  const bus = ctx.bus || null;
  const bug = opts.bug || '';

  const world = createWorld({ rng, bus, bug }, {});
  /**
   * THE FRONT LINE. `js/sim/crates.js` decides who banks a LANDED crate by
   * `x < lineX` — friendly to the west — and the level format has no field for
   * it, so `sim.mjs`'s isolation harness uses 0 and every crate in a level that
   * runs from x = 0 eastward therefore lands in enemy hands. With that value
   * `stats.cutTaken` cannot increment at all: measured over 24 seeds x 3 engage
   * modes on a1-12, cuts DID happen (two bursts) and not one was banked.
   *
   * The least-invented reading is the one the corridor already implies: the
   * mission begins over your own ground and advances into theirs, so the line is
   * the level's own start. It is DERIVED from the level rather than typed, and
   * it is raised as REQUEST-3 because a front line is a design quantity and the
   * format should own it, not this file.
   */
  world.arena.lineX = level.player.start.x * M_PER_WU;
  world.arena.halfW = level.length * M_PER_WU;

  const terrain = createTerrain(level);
  const field = createCrateField(world, {
    wind: level.wind, lineX: level.player.start.x * M_PER_WU, actMult: ACT_MULT[level.act] ?? 1,
    gustPhase: level.weather.gustPhase ?? 0.7,
    gustSeed: level.weather.gustSeed ?? 7919,
    /**
     * NOBODY shoots silk by default. `engage` is what the HUD's cut/deny button
     * flips for the player (§2.6), and §5.3 makes cutting canopies ONE ace's
     * speciality rather than an enemy default — so an ordinary hostile takes a
     * crate by flying through it, which is what `cratePolicy.run` on every
     * spawned enemy already does.
     *
     * `sim.mjs`'s isolation harness passes `-1: 'take'`, which is not one of the
     * three documented modes and falls through to the canopy branch. That is
     * fine for a measurement fixture and wrong for a mission.
     */
    engage: { 1: 'none', '-1': 'none' },
    groundFire: opts.groundFire !== false,
  });

  const af = AIRFRAME_BY_ID[level.player.airframe] || REFERENCE;
  const player = world.spawn(playerType(af.id, opts.gun || 't2'), {
    id: 'player', side: 1,
    xM: level.player.start.x * M_PER_WU,
    yM: level.player.start.y * M_PER_WU,
    speed: CRUISE_MS, theta: 0, k: 1, morale: 1, aggro: 1.2,
    coolHand: !!opts.coolHand,
  });
  if (!player) throw new Error('story: the aircraft pool refused the player');
  player.noFlee = true;
  /**
   * A player is a pilot who WANTS the crate — that is the whole economy (D4).
   * `sim.mjs`'s level run sets `run: false` because it is isolating the ladder;
   * a mission is not isolating anything. Inert for a human, since only an AI
   * reads it.
   */
  player.cratePolicy = { run: true };

  /**
   * `pilot: 'ai'` hands the aeroplane to the shipping AI outright — the headless
   * arm, and what `sim.mjs` has always measured. `pilot: 'human'` puts a stick
   * on it; `advisor` additionally runs a competent pilot alongside, publishing
   * the axis it wants without ever applying it.
   */
  let pilot = null;
  const wantsAdvisor = opts.pilot === 'ai' || opts.advisor;
  if (wantsAdvisor) {
    const adv = createPilot({ rng: { fork: () => rng.fork('advisor') } }, { tier: 'competent', id: 'player' });
    pilot = createHumanPilot(adv, () => guideTo(), opts.pilot !== 'ai');
    player.pilot = pilot;
    player.ai = createAI(player, { k: 0.70, aggro: 1.2 });
  } else {
    // A real player gets a stick and NO AI: `createAI` sets `aimErrLead` on the
    // entity it drives, and §5.2 is explicit that the player's lead error is
    // zero because the player IS the lead solution.
    pilot = createHumanPilot(null, null, true);
    player.pilot = pilot;
  }

  /* ------------------------------------------------------------ the beats -- */

  const events = [];        // `event` / `boss` / `line` beats, handed to the scene
  const spawnLog = [];
  const spawner = createSpawner(world, bug === 'no-beats' ? { ...level, beats: [] } : level, {
    onSpawn: (e, b) => {
      e.ai = createAI(e, { k: b.k ?? 0.6 });
      e.cratePolicy = { run: true };
      spawnLog.push(`${world.t.toFixed(2)}|${b.x}|${e.type.id}`);
    },
    onBeat: (b) => {
      events.push({ t: world.t, x: b.x, event: b.event || '', boss: b.boss || '', line: b.line || '' });
      if (bus) bus.emit('story:beat', events[events.length - 1]);
    },
  });

  /* ------------------------------------------------------- the objectives -- */

  /**
   * An objective this shell cannot score is NAMED, never silently dropped. A
   * mission that quietly ignores "destroy the zeppelin" and reports a win is the
   * shape of defect this project keeps finding (D149's silent airframe
   * fallback); `run.unscored` is how the debrief says so out loud.
   */
  const unscored = [];
  for (const o of level.objectives) {
    const key = o.what ? `${o.type}:${o.what}` : o.type;
    if (!SCORABLE.includes(key)) unscored.push(key);
  }

  const reachX = (level.objectives.find((o) => o.type === 'reach') || {}).x ?? level.length;
  const killGoal = level.objectives.reduce((n, o) =>
    o.type === 'destroy' && o.what === 'aircraft' ? n + (o.n || 1) : n, 0);
  const crateGoal = level.objectives.reduce((n, o) =>
    o.type === 'collect' && o.what === 'crate' ? n + (o.n || 1) : n, 0);

  /**
   * WHERE THE LEVEL IS. The corridor says where it ENDS; this says which way to
   * go, and the two together are the whole of "the mode shell tells the pilot
   * about the objective".
   *
   * The rule is derived from the level's own objective list rather than chosen:
   * while a kill objective is outstanding and a hostile is alive, the dogfight
   * controller keeps the aeroplane; the moment there is nothing left it has to
   * kill, the nose goes to the far end. Returning a point rather than a heading
   * means `pilot.js`'s existing `point` intent does the flying — no second
   * controller, which is W5's rule one system over.
   *
   * Measured on `a1-01`: without this the reference pilot finishes 9 of 12 seeds
   * and a real-thumb run reached the 150 s cap once in three; with it, 12 of 12
   * and every thumb run completes.
   */
  const OBJ_PT = { xM: 0, yM: 0 };
  function guideTo() {
    if (player.target && !player.target.dead) return null;
    if (killGoal && st.kills < killGoal) {
      for (let i = 0; i < world.live.length; i++) {
        const o = world.live[i];
        if (o.side === -1 && !o.dead && o.alive) return null;   // finish the fight first
      }
    }
    /**
     * And the same for silk, which is the half the first version got wrong: it
     * deferred only to a KILL objective, so on `a1-12` — a collect-5-crates
     * level — it flew the aeroplane straight past every canopy to the far end
     * and the win rate went 6/12 to **0/12**. An objective-aware guide has to
     * know about every objective the level declares, not the one that was in
     * front of me.
     */
    /**
     * And silk, whether or not the level made it an objective. Two versions of
     * this rule were wrong before this one, and both were measured rather than
     * reasoned about:
     *
     *  - deferring only to a KILL objective flew `a1-12` — collect 5 crates —
     *    straight past every canopy: **6/12 wins to 0/12**;
     *  - deferring only while a CRATE OBJECTIVE was outstanding then ignored
     *    every crate on `a2-05`, which has none: **38 of 58 caught to 0**.
     *
     * D4 settles it. Crates are the economy, not a mission type, so a pilot
     * wants one that is in the air whatever the objective list says.
     */
    for (let i = 0; i < field.crates.length; i++) {
      const c = field.crates[i];
      if (c.alive && !c.landed && !c.pilot) return null;        // there is silk in the air
    }
    OBJ_PT.xM = reachX * M_PER_WU;
    OBJ_PT.yM = level.player.start.y * M_PER_WU;
    return OBJ_PT;
  }

  /* ------------------------------------------------------------ the state -- */

  const timeInBand = Object.fromEntries(BANDS.map((b) => [b.id, 0]));
  const alloc0 = { ...world.alloc };
  const seenDead = new Set();
  const st = {
    t: 0, camWu: level.player.start.x, kills: 0, stalls: 0, blackouts: 0, peakG: 0,
    reachedAt: 0, over: false, result: '', progress: 0,
    checkpoint: null, wallHits: 0, lidHits: 0,
    /**
     * Canopies CUT, which is not the same number as canopies cut AND BANKED.
     * `field.stats.cutTaken` only counts a cut crate that came down on the
     * friendly side of the line, and in every shipped level that is nobody —
     * see REQUEST-3. Counting the act itself is what tells the two apart.
     */
    canopiesCut: 0,
  };
  const cutSeen = new Set();
  let wasStalled = false, blackPrev = false;

  const lengthWu = level.length;
  const ceilingWu = bug === 'no-lid' ? 0 : level.column.ceiling;
  const corridorOpts = { noWalls: bug === 'no-corridor', noLid: bug === 'no-corridor' };

  /** §7.1's checkpoint rule, evaluated once at build time rather than per tick. */
  const wantsCheckpoint = (opts.durationS || 0) > STORY.checkpointMinSecs
    || level.beats.some((b) => b.boss);

  function setStick(x, y) { if (pilot) pilot.set(x, y); }

  function step(dt) {
    if (st.over) return false;
    world.update(dt);
    st.t += dt;

    const f = player.flight;
    // The reach test runs BEFORE the corridor: crossing the far end IS the
    // objective, and the wall would otherwise reflect him one metre short.
    if (!st.reachedAt && f.sx / M_PER_WU >= reachX) st.reachedAt = st.t;

    for (let i = 0; i < world.live.length; i++) {
      const h = containInLevel(world, world.live[i], lengthWu, ceilingWu, corridorOpts);
      if (h & 1) st.lidHits++;
      if (h & 2) st.wallHits++;
    }

    const xWu = f.sx / M_PER_WU;
    // The spawner reads the furthest the camera has BEEN, never where it is.
    st.camWu = Math.max(st.camWu, xWu);
    spawner.update(st.camWu);

    for (let i = 0; i < field.crates.length; i++) {
      const c = field.crates[i];
      if (c.cut && !cutSeen.has(c.id)) { cutSeen.add(c.id); st.canopiesCut++; }
    }

    timeInBand[bandIdAt(f.sy / M_PER_WU)] += dt;
    st.peakG = Math.max(st.peakG, f.stress);
    if (f.stalled && !wasStalled) st.stalls++;
    wasStalled = f.stalled;
    if (f.blackout && !blackPrev) st.blackouts++;
    blackPrev = f.blackout;

    for (let i = 0; i < world.aircraft.length; i++) {
      const e = world.aircraft[i];
      if (e.side === -1 && !e.alive && !seenDead.has(e.id)) { seenDead.add(e.id); st.kills++; }
    }

    st.progress = Math.max(0, Math.min(1,
      (xWu - level.player.start.x) / Math.max(1, reachX - level.player.start.x)));
    if (wantsCheckpoint && !st.checkpoint && st.progress >= STORY.checkpointFrac) {
      st.checkpoint = { t: st.t, x: xWu, y: f.sy / M_PER_WU, kills: st.kills };
      if (bus) bus.emit('story:checkpoint', st.checkpoint);
    }

    if (player.dead) finish('lost');
    else if (st.reachedAt) finish('reached');
    else if (st.t >= STORY.maxSecs) finish('timeout');
    return !st.over;
  }

  function finish(why) {
    st.over = true;
    st.result = why;
  }

  /** ARCHITECTURE §8.1's summary. Every field a star may name is in `RUN_STATS`. */
  function summary() {
    const cs = field.stats;
    const s = {
      level: level.id, seed, pilot: pilot ? 'human' : 'competent',
      completed: !!st.reachedAt && !player.dead,
      time: +st.t.toFixed(1),
      damageTaken: +player.flight.damageHP.toFixed(1),
      deaths: player.dead ? 1 : 0,
      kills: st.kills,
      cratesCaught: cs.playerBanked,
      cratesMissed: cs.dropped - cs.playerBanked,
      cratesDropped: cs.dropped,
      canopiesCut: st.canopiesCut,
      cratesCutBanked: cs.cutTaken,
      cratesDenied: cs.denied,
      cratesToEnemy: cs.enemyBanked,
      shotsFired: player.gun ? player.gun.fired : 0,
      hits: player.gun ? player.gun.hits : 0,
      accuracy: player.gun && player.gun.fired ? +(player.gun.hits / player.gun.fired).toFixed(3) : 0,
      ammoLeft: player.gun ? player.gun.ammo : 0,
      fuelLeft: +(player.flight.fuel / 100).toFixed(3),
      peakG: +st.peakG.toFixed(2), stalls: st.stalls, blackouts: st.blackouts,
      timeInBand: Object.fromEntries(Object.entries(timeInBand).map(([k, v]) => [k, +v.toFixed(1)])),
      difficulty: 0, abort: null,
    };
    // The objective verdict. `reach` and `survive` are the two every shipped
    // level carries; the middle one is the level's own and may be unscorable.
    s.objectives = level.objectives.map((o) => {
      const key = o.what ? `${o.type}:${o.what}` : o.type;
      if (key === 'reach') return { key, got: !!st.reachedAt, scored: true };
      if (key === 'survive') return { key, got: s.deaths <= (o.maxDeaths ?? 0), scored: true };
      if (key === 'destroy:aircraft') return { key, got: st.kills >= (o.n || 1), scored: true, n: st.kills, need: o.n || 1 };
      if (key === 'collect:crate') return { key, got: cs.playerBanked >= (o.n || 1), scored: true, n: cs.playerBanked, need: o.n || 1 };
      return { key, got: false, scored: false };
    });
    s.won = s.completed && s.objectives.every((o) => !o.scored || o.got);
    s.unscored = unscored.slice();
    /**
     * §7.1's FIRST star is "objective complete", so no star is awarded on a
     * mission that was not won. The level's own three conditions are evaluated
     * either way and reported — `met` is what the condition says, `got` is what
     * the player keeps — because a debrief that showed "Not a scratch ★" over
     * SHOT DOWN is what the first build of this screen actually did.
     */
    s.stars = level.stars.map((c) => {
      const met = evalCondition(c, s);
      return { id: c.id, desc: c.desc, met, got: met && s.won };
    });
    s.starCount = s.stars.reduce((n, x) => n + (x.got ? 1 : 0), 0);
    // §9.4's repair fee. A mission never costs progress; this is the whole bill.
    s.repair = Math.min(STORY.repairCap, Math.round(s.damageTaken * STORY.repairPerHp));
    s.scrip = s.won ? (level.reward.scrip || 0) : 0;
    s.crateValue = Math.round(cs.value);
    s.occupancy = occupancyOf(s.timeInBand);
    s.occupied = s.occupancy.filter((o) => o.s > o.transitS).map((o) => o.id);
    s.lidHits = st.lidHits; s.wallHits = st.wallHits;
    s.allocGrew = Object.keys(alloc0).some((k) => world.alloc[k] !== alloc0[k]);
    s.beatsFired = spawner.state.fired;
    s.poolMisses = spawner.state.poolMisses;
    return s;
  }

  return {
    level, world, field, terrain, spawner, player, events, pilot,
    state: st, summary, step, setStick, containKills: seenDead,
    get wantAxis() { return pilot ? pilot.want : { x: 0, y: 0 }; },
    unscored, killGoal, crateGoal, reachX, ceilingWu, lengthWu,
    get done() { return st.over; },
    /** Headless convenience: run to a verdict. `tools/` uses it; the scene does not. */
    run(dt, cap = STORY.maxSecs) {
      const n = Math.round(cap / dt);
      for (let i = 0; i < n && step(dt); i++);
      if (!st.over) finish('timeout');
      return summary();
    },
  };
}

export default createStoryRun;

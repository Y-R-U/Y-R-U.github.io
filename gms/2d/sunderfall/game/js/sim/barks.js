/* SUNDERFALL — Rook says things.
 *
 * The character has one cinematic's worth of voice and then goes silent for the
 * whole game, which makes him read as a cursor rather than as the sulking
 * fifteen-year-old the intro spends 75 seconds establishing. Barks are the
 * cheapest way to keep him in the room.
 *
 * Rules that keep them from becoming wallpaper:
 *   - one line at a time, with a long global cooldown; a bark is a punctuation
 *     mark, not a commentary track
 *   - a line never repeats until every other line for that trigger has been used
 *   - triggers fire on things the player DID, so the line always lands as a
 *     reaction rather than as an announcement
 *   - nothing fires in the first few seconds of a run, or while he is dead
 *
 * Emits `bark` on the bus; ui/index.js turns that into a speech bubble anchored
 * to him. Nothing here draws.
 *
 * `vo: [offset, length]` is where the line sits inside its take — one recording
 * with many lines in it, played a slice at a time by core/audio/vo.js. The text
 * here is what the recording actually says, so the two never disagree; if a line
 * is reworded the recording is wrong until it is regenerated, and the honest move
 * is to drop its `vo` rather than play the old words under new ones. Timings came
 * out of the take by the method in docs/VO-TIMING-RECIPE.md.
 *
 * Two things gate a line out of the pool:
 *
 *   `take`  — **every line in this game is voiced**, so a line whose recording has
 *             not been generated is not selectable at all. `rook2` does not exist
 *             yet (docs/SCRIPTS-ACT-TWO.md); those lines are dead weight until it
 *             does, and that is on purpose — a silent bubble among voiced ones
 *             reads as a bug, not as restraint.
 *   `after` — a number is a player level, a string is a story flag (a scene id from
 *             `story:done`). His voice widens as the run goes on: early Rook sulks,
 *             late Rook is grimly used to it, and the Ostrick callbacks cannot fire
 *             before he has met Ostrick.
 */

import { DAMAGE } from './materials.js';

const GLOBAL_CD = 11;       // seconds between any two barks
const PRIORITY_CD = 4;      // …unless the new line is more important than the last
const ALONE_GAP = 40;       // quiet enough, for long enough, that he starts talking to himself

const LINES = {
  selfBurn: [
    { t: 'This magic stuff sucks.', take: 'barks', vo: [0.24, 2.00] },
    { t: 'I set me on fire. Again.', take: 'barks', vo: [3.18, 2.54] },
    { t: "That's my own fire. My own fire!", take: 'barks', vo: [5.94, 3.02] },
    { t: 'Nobody saw that.', take: 'barks', vo: [8.92, 1.54] },
    { t: 'Yep. Still flammable.', take: 'rook2', vo: [0.72, 1.82], after: 5 },
    { t: 'Every time. Every single time.', take: 'rook2', vo: [2.92, 2.2], after: 5 },
  ],
  selfAcid: [
    { t: 'It is eating my boots.', take: 'barks', vo: [10.70, 1.76] },
    { t: 'Was that meant to splash?', take: 'barks', vo: [12.48, 1.64] },
  ],
  hurt: [
    { t: "That's a lot of my blood.", take: 'barks', vo: [14.04, 1.71] },
    { t: 'Ow. Properly, ow.', take: 'barks', vo: [15.66, 1.92] },
    { t: 'Vayne. You picked wrong.', take: 'barks', vo: [17.50, 1.62] },
    { t: "Fine. That's fine.", take: 'rook2', vo: [5.08, 1.24], after: 5 },
    { t: "I've had worse. Recently.", take: 'rook2', vo: [6.22, 1.6], after: 5 },
  ],
  low: [
    { t: 'I am not built for this.', take: 'barks', vo: [19.38, 1.86] },
    { t: 'Still up. Barely.', take: 'barks', vo: [21.14, 1.34] },
    { t: 'Not here. Not for this.', take: 'rook2', vo: [7.74, 2.12], after: 5 },
    { t: 'Keep the fire lit, he said.', take: 'rook2', vo: [9.84, 1.52], after: 'stones' },
  ],
  bigBreak: [
    { t: 'Nothing in Thornmere ever broke like that.', take: 'barks', vo: [22.74, 3.10] },
    { t: 'Cass could never do that.', take: 'barks', vo: [25.74, 1.56] },
    { t: 'Oh, that is going to be a problem later.', take: 'barks', vo: [27.24, 1.91] },
    { t: 'Sorry. To whoever built that.', take: 'rook2', vo: [11.54, 1.52], after: 6 },
    { t: "That was somebody's wall.", take: 'rook2', vo: [13.22, 1.56], after: 6 },
  ],
  streak: [
    { t: 'Did you see that?', take: 'barks', vo: [29.07, 1.55] },
    { t: "I'm getting good at this. Worryingly good.", take: 'barks', vo: [30.58, 2.40] },
    { t: "That's the stone. Not me.", take: 'rook2', vo: [15.3, 1.8], after: 6 },
    { t: "I don't like how easy that was.", take: 'rook2', vo: [17.02, 1.44], after: 6 },
  ],
  level: [
    { t: 'Something moved. In me, I mean.', take: 'barks', vo: [33.22, 1.82] },
    { t: 'It is getting easier to hold.', take: 'barks', vo: [34.96, 1.69] },
    { t: "It fits better now. That's worse.", take: 'rook2', vo: [18.42, 1.94], after: 6 },
    { t: 'Bigger. Great.', take: 'rook2', vo: [20.44, 1.05], after: 6 },
  ],
  pit: [
    { t: 'Not my finest.', take: 'barks', vo: [36.60, 1.24] },
    { t: 'The hole was quite obvious, in hindsight.', take: 'barks', vo: [37.82, 2.66] },
    { t: 'Down again. Fine.', take: 'rook2', vo: [21.36, 1.43], after: 4 },
    { t: 'Walls. Use the walls.', take: 'rook2', vo: [22.76, 1.62], after: 4 },
  ],
  blocked: [
    { t: 'It is a rock. I can deal with a rock.', take: 'barks', vo: [40.62, 3.24] },
    /* "Right. Through it, then." never finished generating — the take ends on the one
       word. It survives as the whole line because "Right!" reads as either sarcasm or
       resolve depending on what just blocked him. The clip runs to the last sample of
       the file, and it has to: the /t/ is a separate burst 0.8s in, and a cut before it
       turns the word into a vowel with no consonant. */
    { t: 'Right!', take: 'barks', vo: [43.84, 0.99] },
    { t: 'I know what to do with rock now.', take: 'rook2', vo: [24.4, 1.68], after: 6 },
  ],
  // Nothing near him and nothing to say for forty seconds. The pool is entirely about the
  // life he left, which is the only thing he thinks about when there is room to think.
  alone: [
    { t: 'Nobody ever needed saving from a goat.', take: 'rook2', vo: [28.04, 2.13], after: 3 },
    { t: 'Cass would hate this. Small mercy.', take: 'rook2', vo: [31.04, 1.9], after: 4 },
    { t: "I'd take the goats.", take: 'rook2', vo: [33.04, 1.19], after: 5 },
    { t: 'Keep the fire lit.', take: 'rook2', vo: [34.16, 1.1], after: 'stones' },
  ],
};

export function createBarks(world) {
  const bus = world.bus;
  const offs = [];
  const used = {};                       // trigger -> indices already spoken this cycle
  const flags = {};                      // story flag -> true, from `story:done`
  let lastAt = -99, lastPri = 0;
  let t = 0;
  let kills = 0, killAt = -99;
  let lowSaid = false;
  let level = 1;
  let nearAt = 0;                        // last time anything hostile was on screen

  const audio = () => (world.ctx && world.ctx.audio) || null;

  /**
   * Is this line's recording actually on disk? `audio.hasTake` is the authority when it
   * exists; without it, a real `vo` is the only proof a take was ever generated, which is
   * exactly the answer we want for the not-yet-recorded rook2 lines.
   */
  function voiced(line) {
    const a = audio();
    if (a && a.hasTake && a.hasTake(line.take)) return true;
    return line.vo != null;
  }

  function unlocked(line) {
    if (line.after == null) return true;
    if (typeof line.after === 'number') {
      const sys = world.ctx && world.ctx.spellSystem;   // survives a resume; `level` does not
      return (sys && sys.level != null ? sys.level : level) >= line.after;
    }
    return !!flags[line.after];
  }

  function pick(trigger) {
    const pool = LINES[trigger];
    if (!pool) return null;
    const ok = [];
    for (let i = 0; i < pool.length; i++) if (voiced(pool[i]) && unlocked(pool[i])) ok.push(i);
    if (!ok.length) return null;
    let u = used[trigger];
    // the cycle is over when every line he is currently allowed has been used, not every
    // line in the pool — otherwise unlocking one line silently re-opens all the old ones
    if (!u || ok.every((i) => u.indexOf(i) >= 0)) u = used[trigger] = [];
    let k = (world.rng.next() * ok.length) | 0;
    for (let n = 0; n < ok.length && u.indexOf(ok[k]) >= 0; n++) k = (k + 1) % ok.length;
    u.push(ok[k]);
    return pool[ok[k]];
  }

  /** priority 1 = flavour, 2 = worth interrupting flavour, 3 = always say it */
  function bark(trigger, priority) {
    const p = world.player;
    if (!p || !p.alive || p.killed || !world.playerControl) return;
    if (t < 4) return;                                   // let a run start in silence
    const cd = priority > lastPri ? PRIORITY_CD : GLOBAL_CD;
    if (world.time - lastAt < cd) return;
    const line = pick(trigger);
    if (!line) return;
    lastAt = world.time; lastPri = priority;
    const a = audio();
    if (line.vo && a && a.voice) a.voice(line.vo[0], line.vo[1], { take: line.take });
    bus.emit('bark', { text: line.t, trigger, priority });
  }

  offs.push(bus.on('player:damage', (e) => {
    const p = world.player;
    if (!p) return;
    // Own fire is the joke the user asked for, and it is knowable: he is stood in
    // burning ground that no enemy put there.
    if (e.type === DAMAGE.FIRE) {
      if (world.surfaces.amountAt('fire', p.x, p.y) > 0) bark('selfBurn', 2);
      return;
    }
    if (e.type === DAMAGE.ACID) { bark('selfAcid', 1); return; }
    if (e.amount >= 12) bark('hurt', 1);
    const frac = e.hp / (e.maxHp || 100);
    if (frac < 0.3 && !lowSaid) { lowSaid = true; bark('low', 3); }
    if (frac > 0.6) lowSaid = false;
  }));

  offs.push(bus.on('prop:break', (e) => {
    // only the things that were in the way — a smashed pot is not an event
    if (e.id && /wall|pillar|arch|gate|boulder|statue|trunk|tree/.test(e.id)) bark('bigBreak', 1);
  }));

  offs.push(bus.on('enemy:died', () => {
    if (world.time - killAt > 5) kills = 0;
    killAt = world.time;
    if (++kills >= 3) { kills = 0; bark('streak', 1); }
  }));

  offs.push(bus.on('player:level', (e) => { if (e && e.level) level = e.level; bark('level', 1); }));
  offs.push(bus.on('player:pit', () => bark('pit', 2)));
  offs.push(bus.on('hint:blocked', (e) => { if (e.action === 'BREAK') bark('blocked', 1); }));
  offs.push(bus.on('story:done', (e) => { if (e && e.id) flags[e.id] = true; }));

  /** Anything alive and hostile within a screen of him. */
  function hostileNear() {
    const p = world.player;
    const list = world.entities;
    if (!p || !list) return false;
    const rx = world.halfW || 960, ry = (world.halfH || 540) * 1.2;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e.kind !== 'enemy') continue;
      if (Math.abs(e.x - p.x) < rx && Math.abs(e.y - p.y) < ry) return true;
    }
    return false;
  }

  let scanIn = 0;

  return {
    update(dt) {
      t += dt;
      // The empty stretches between encounters are the only time he is company for himself.
      // Scanned twice a second because it walks every entity and nothing here is urgent.
      scanIn -= dt;
      if (scanIn > 0) return;
      scanIn = 0.5;
      if (!world.playerControl || hostileNear()) { nearAt = world.time; return; }
      if (world.time - nearAt >= ALONE_GAP && world.time - lastAt >= ALONE_GAP) bark('alone', 1);
    },
    /** A resume comes back mid-act with scenes already seen; SF-ACT hands those back here. */
    setFlag(id) { if (id) flags[id] = true; },
    reset() {
      t = 0; lastAt = -99; lastPri = 0; kills = 0; lowSaid = false;
      nearAt = world.time; scanIn = 0;
    },
    destroy() { for (const o of offs) o(); offs.length = 0; },
  };
}

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
 * `vo: [offset, length]` is where the line sits inside `audio/vo/barks.mp3` — one
 * take with all of them in it, played a slice at a time by core/audio/vo.js. The
 * text here is what the recording actually says, so the two never disagree; if a
 * line is reworded the recording is wrong until it is regenerated, and the honest
 * move is to drop its `vo` rather than play the old words under new ones. Timings
 * came out of the take by the method in docs/VO-TIMING-RECIPE.md.
 */

import { DAMAGE } from './materials.js';

const GLOBAL_CD = 11;       // seconds between any two barks
const PRIORITY_CD = 4;      // …unless the new line is more important than the last

const LINES = {
  selfBurn: [
    { t: 'This magic stuff sucks.', vo: [0.24, 2.00] },
    { t: 'I set me on fire. Again.', vo: [3.18, 2.54] },
    { t: "That's my own fire. My own fire!", vo: [5.94, 3.02] },
    { t: 'Nobody saw that.', vo: [8.92, 1.54] },
  ],
  selfAcid: [
    { t: 'It is eating my boots.', vo: [10.70, 1.76] },
    { t: 'Was that meant to splash?', vo: [12.48, 1.64] },
  ],
  hurt: [
    { t: "That's a lot of my blood.", vo: [14.04, 1.71] },
    { t: 'Ow. Properly, ow.', vo: [15.66, 1.92] },
    { t: 'Vayne. You picked wrong.', vo: [17.50, 1.62] },
  ],
  low: [
    { t: 'I am not built for this.', vo: [19.38, 1.86] },
    { t: 'Still up. Barely.', vo: [21.14, 1.34] },
  ],
  bigBreak: [
    { t: 'Nothing in Thornmere ever broke like that.', vo: [22.74, 3.10] },
    { t: 'Cass could never do that.', vo: [25.74, 1.56] },
    { t: 'Oh, that is going to be a problem later.', vo: [27.24, 1.91] },
  ],
  streak: [
    { t: 'Did you see that?', vo: [29.07, 1.55] },
    { t: "I'm getting good at this. Worryingly good.", vo: [30.58, 2.40] },
  ],
  level: [
    { t: 'Something moved. In me, I mean.', vo: [33.22, 1.82] },
    { t: 'It is getting easier to hold.', vo: [34.96, 1.69] },
  ],
  pit: [
    { t: 'Not my finest.', vo: [36.60, 1.24] },
    { t: 'The hole was quite obvious, in hindsight.', vo: [37.82, 2.66] },
  ],
  blocked: [
    { t: 'It is a rock. I can deal with a rock.', vo: [40.62, 3.24] },
    /* "Right. Through it, then." never finished generating — the take ends on the one
       word. It survives as the whole line because "Right!" reads as either sarcasm or
       resolve depending on what just blocked him. The clip runs to the last sample of
       the file, and it has to: the /t/ is a separate burst 0.8s in, and a cut before it
       turns the word into a vowel with no consonant. */
    { t: 'Right!', vo: [43.84, 0.99] },
  ],
};

export function createBarks(world) {
  const bus = world.bus;
  const offs = [];
  const used = {};                       // trigger -> indices already spoken this cycle
  let lastAt = -99, lastPri = 0;
  let t = 0;
  let kills = 0, killAt = -99;
  let lowSaid = false;

  function pick(trigger) {
    const pool = LINES[trigger];
    if (!pool) return null;
    let u = used[trigger];
    if (!u || u.length >= pool.length) u = used[trigger] = [];
    let i = (world.rng.next() * pool.length) | 0;
    for (let n = 0; n < pool.length && u.indexOf(i) >= 0; n++) i = (i + 1) % pool.length;
    u.push(i);
    return pool[i];
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
    const audio = world.ctx && world.ctx.audio;
    if (line.vo && audio && audio.voice) audio.voice(line.vo[0], line.vo[1]);
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

  offs.push(bus.on('player:level', () => bark('level', 1)));
  offs.push(bus.on('player:pit', () => bark('pit', 2)));
  offs.push(bus.on('hint:blocked', (e) => { if (e.action === 'BREAK') bark('blocked', 1); }));

  return {
    update(dt) { t += dt; },
    reset() { t = 0; lastAt = -99; lastPri = 0; kills = 0; lowSaid = false; },
    destroy() { for (const o of offs) o(); offs.length = 0; },
  };
}

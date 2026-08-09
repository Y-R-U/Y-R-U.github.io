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
 */

import { DAMAGE } from './materials.js';

const GLOBAL_CD = 11;       // seconds between any two barks
const PRIORITY_CD = 4;      // …unless the new line is more important than the last

const LINES = {
  selfBurn: [
    'This magic stuff sucks.',
    'I set me on fire. Again.',
    "That's my own fire. That's my own fire.",
    'Nobody saw that.',
  ],
  selfAcid: [
    'It is eating my boots.',
    'Was that meant to splash?',
  ],
  hurt: [
    "That's a lot of my blood.",
    'Ow. Properly, ow.',
    'Vayne. You picked wrong.',
  ],
  low: [
    'I am not built for this.',
    'Still up. Barely.',
  ],
  bigBreak: [
    'Nothing in Thornmere ever broke like that.',
    'Cass could never do that.',
    'Oh, that is going to be a problem later.',
  ],
  streak: [
    'Ha. Did you see that?',
    'I am getting good at this. Worryingly good.',
  ],
  level: [
    'Something moved. In me, I mean.',
    'It is getting easier to hold.',
  ],
  pit: [
    'Not my finest.',
    'The hole was quite obvious, in hindsight.',
  ],
  blocked: [
    'It is a rock. I can deal with a rock.',
    'Right. Through it, then.',
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
    const text = pick(trigger);
    if (!text) return;
    lastAt = world.time; lastPri = priority;
    bus.emit('bark', { text, trigger, priority });
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

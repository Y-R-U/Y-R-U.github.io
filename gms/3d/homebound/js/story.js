// HOMEBOUND — the story.
//
// A soldier walking home is not chatty. One line on the way out, one on the way
// in; two at most, and most levels get one or none. Everything the player needs
// to *know* is on a sign in the world, so everything said here is allowed to be
// about a person instead of a mechanic.
//
// Restraint is the whole design. The family's money trouble is two lines, not a
// scene. Nobody explains the war. Nobody says "and now, the final battle".
//
// WHERE THE LINES FIRE
//
//   `run:start`   the opening line for that level
//   `boss:hp`     (first frame only) the boss line, on boss levels
//   `run:end`     the closing line, win only
//
// That is deliberately the whole hook list. game.js does not yet dispatch
// `{kind:'bubble'}` items (see the MANAGER note in levels.js), and a story that
// depends on an unwritten hook is a story that does not ship. If that hook
// lands later, `beatAt(chapter, level, z)` below is ready for it.
//
// A beat never replays: `save.js:markStory` keeps the ids, so the second run of
// level 7 is silent. Story is not a tax on grinding.
//
// EXPORTS: initStory, beatsFor, playBeat, introBeats, beatAt, runBeats

import { on, emit } from './bus.js';
import { markStory, storySeen, P } from './save.js';
import { chapterOf } from './chapters.js';

const MS = 2600;          // default dwell. Long enough to read at a glance.
const MS_LONG = 3400;

const line = (who, text, ms = MS) => ({ who, text, ms });

// --------------------------------------------------------------------------
// CHAPTER 1 — the road.
//
// He is going the wrong way down a war. The arc is: relief → distance →
// weariness → the country he is walking through is worse than the one he left →
// the gate. `RADIO` is the army he is no longer in, still talking at him.
// --------------------------------------------------------------------------
const CH1 = {
  1:  { in: line('RADIO', 'Discharge confirmed. Good luck getting home, soldier.'),
        out: line('ME', 'Four hundred kilometres. I have walked further for less.') },
  2:  { in: line('ME', 'Roads are still theirs. Nobody told the roads it was over for me.') },
  3:  { in: line('RADIO', 'Checkpoint nine is not answering. Go around it or go through it.') },
  4:  { in: line('ME', 'They blew the bridge. Of course they blew the bridge.') },
  5:  { in: line('ME', 'Men keep falling in behind me. I did not ask for them.'),
        out: line('ME', 'I did not send them away either.') },
  6:  { in: line('ME', 'Ash the whole valley. Nothing left to hold.') },
  7:  { in: line('RADIO', 'Column moving on the crossing. Not ours.') },
  // Boss levels get the name and the answer. The distance marker that used to
  // sit here moved to level 9 — three bubbles is three bubbles even when all
  // three are good.
  8:  { in: line('RADIO', 'That is the Colonel. He does not take surrenders.'),
        boss: line('ME', 'I was decorated for less than what you did here.') },
  9:  { in: line('ME', 'Salt in my boots. Salt in the water. Keep walking.'),
        out: line('ME', 'Two hundred kilometres.') },
  10: { in: line('ME', 'Wire, mines, wire. Somebody was very frightened here.') },
  11: { in: line('FAMILY', 'Letter, six weeks old: the bank came again. We told them you were coming.') },
  12: { in: line('ME', 'Market day. No market. No day, really.') },
  13: { in: line('ME', 'These were orchards. My mother is from three towns over.') },
  14: { in: line('RADIO', 'Anyone still listening — the canal road is not safe.'),
        out: line('ME', 'Nothing is. That is not new information.') },
  15: { in: line('ME', 'Outskirts. I know the shape of this hill.') },
  16: { in: line('RADIO', 'Magda holds the tram line. She has held it since spring.'),
        boss: line('ME', 'You can keep the street. I only need to cross it.') },
  17: { in: line('ME', 'I caught the tram on this street. It cost four coins.'),
        out: line('ME', 'Eight kilometres.') },
  18: { in: line('ME', 'The rail yard. My father worked the far shed.') },
  19: { in: line('ME', 'School hill. They are using the school for something else now.') },
  20: { in: line('ME', 'The bakery is open. Somebody is still making bread.') },
  21: { in: line('ME', 'Four streets.') },
  22: { in: line('RADIO', 'Last checkpoint before the residential line. Papers.'),
        out: line('ME', 'I have a medal and a limp. Take your pick.') },
  23: { in: line('ME', 'Our road.', MS_LONG) },
  // Two in the level, never three. The homecoming itself is CH2_ARRIVE, which
  // plays on the outro screen where a scene is allowed to be a scene.
  24: { in: line('ME', 'That is my gate. Somebody is standing at it.', MS_LONG),
        boss: line('ME', 'Not here. Not at my house.') },
};

// --------------------------------------------------------------------------
// CHAPTER 2 — debt. Two lines. This is the entire money scene and it is meant
// to be over before the player has finished reading it.
// --------------------------------------------------------------------------
const CH2_ARRIVE = [
  line('FAMILY', 'You are thinner. Come inside.', MS_LONG),
  line('FAMILY', 'There is paper on the house. All of it.', MS_LONG),
  line('ME', 'Then I will go and get it.'),
];
// The end of the game, on the outro screen. Same licence as the homecoming: a
// scene is allowed where the run is over.
const CH4_END = [
  line('RADIO', 'Signed at eleven this morning. You can go home.', MS_LONG),
  line('ME', 'I have been going home for four years.'),
  line('FAMILY', 'The gate is open. It has been open a while.', MS_LONG),
];
const CH2_CLEARED = [
  line('FAMILY', 'The bank sent a man to say there is nothing left to say.', MS_LONG),
  line('ME', 'Then it is ours.'),
];

// --------------------------------------------------------------------------
// CHAPTER 3 — contract work. He is good at exactly one thing and the country
// still needs it. No flag on the sleeve now.
// --------------------------------------------------------------------------
const CH3 = {
  1: { in: line('RADIO', 'No flag, no unit, no paperwork. Half in advance.'),
       out: line('ME', 'Half is fine. It was never about the flag.') },
  2: { in: line('ME', 'They pay a soldier better when he is not one.') },
  3: { boss: line('ME', 'They always do.'),
       out: line('RADIO', 'They are offering you an army. A real one.', MS_LONG) },
};

// --------------------------------------------------------------------------
// CHAPTER 4 — the counter-offensive. He took it, and the reason is domestic.
// A beat every ten levels; the other 110 are silent on purpose.
// --------------------------------------------------------------------------
const CH4 = {
  1:   { in: line('ME', 'One condition. When it is done, I go home and stay there.'),
         out: line('RADIO', 'Understood. Move out.') },
  10:  { in: line('RADIO', 'First ridge is ours. First anything is ours.'),
         boss: line('ME', 'Push.') },
  20:  { in: line('ME', 'They are the ones walking backwards now.') },
  30:  { in: line('FAMILY', 'The roof is fixed. Do not come back to help with the roof.') },
  40:  { in: line('RADIO', 'Armour is yours as of this morning. Try not to lose it.'),
         boss: line('ME', 'Nothing on this road stops.') },
  50:  { in: line('ME', 'Half the men here were farmers in spring.') },
  60:  { in: line('RADIO', 'Halfway. They are asking for terms.'),
         out: line('ME', 'Ask them again in a month.') },
  70:  { in: line('FAMILY', 'Second plot is cleared. There is room for you in it.') },
  80:  { in: line('ME', 'I have started counting kilometres home again.') },
  90:  { in: line('RADIO', 'Their line is a rumour at this point.') },
  100: { in: line('ME', 'One more push and it is a border instead of a front.'),
         boss: line('ME', 'Last one. I mean it.') },
  110: { in: line('RADIO', 'Command is drafting a surrender. Yours to sign.') },
  120: { in: line('ME', 'Done.', MS_LONG),
         boss: line('ME', 'Move.') },
};

const TABLE = { 1: CH1, 3: CH3, 4: CH4 };

// The three lines before the first level. Told once, ever.
const INTRO = [
  line('RADIO', 'The war is not over. Your part in it is.', MS_LONG),
  line('ME', 'Then I am going home.'),
  line('RADIO', 'It is four hundred kilometres and all of it is theirs.', MS_LONG),
];

// --------------------------------------------------------------------------
// API
// --------------------------------------------------------------------------

// Every beat gets a stable id so `save.js:markStory` can retire it forever.
const idOf = (chapter, level, slot) => `s${chapter}.${level}.${slot}`;

// The beats attached to one level: { in, boss, out }, any of them absent.
export function beatsFor(chapter, level) {
  const t = TABLE[chapter];
  const raw = t && t[level];
  if (!raw) return null;
  const out = {};
  for (const slot of ['in', 'boss', 'out']) {
    if (raw[slot]) out[slot] = { ...raw[slot], id: idOf(chapter, level, slot) };
  }
  return out;
}

// Flat list, for menus.js's story log.
export function runBeats(chapter, level) {
  const b = beatsFor(chapter, level);
  return b ? ['in', 'boss', 'out'].filter((s) => b[s]).map((s) => b[s]) : [];
}

// Reserved for the `{kind:'bubble'}` hook (MANAGER note 2 in levels.js): given
// a level and a z, which beat belongs there. `in` at the start, `out` at the
// end, `boss` wherever the boss is.
export function beatAt(chapter, level, frac) {
  const b = beatsFor(chapter, level);
  if (!b) return null;
  if (frac < 0.12) return b.in || null;
  if (frac > 0.88) return b.out || null;
  return null;
}

export function introBeats() {
  return INTRO.map((l, i) => ({ ...l, id: `intro.${i}` }));
}

// The only thing that puts words on screen. Returns false if the beat has been
// read before, so callers can chain without checking.
export function playBeat(beat, delayMs = 0) {
  if (!beat || !beat.text) return false;
  if (beat.id && !markStory(beat.id)) return false;      // already read
  const fire = () => emit('story:bubble', { who: beat.who, text: beat.text, ms: beat.ms || MS });
  if (delayMs > 0) setTimeout(fire, delayMs);
  else fire();
  return true;
}

// Fire a sequence, spaced by each line's own dwell. Used for the intro and for
// the two-line debt scene.
export function playSequence(beats, startDelay = 400) {
  let t = startDelay;
  let any = false;
  for (const b of beats) {
    if (b.id && storySeen(b.id)) continue;
    any = playBeat(b, t) || any;
    t += (b.ms || MS) + 350;
  }
  return any;
}

// --------------------------------------------------------------------------
// Wiring. Three listeners, registered once at boot.
// --------------------------------------------------------------------------
let current = null;       // beats for the level in progress
let bossFired = false;

export function initStory() {
  on('run:start', ({ level, autoplay }) => {
    // The main screen's autoplay backdrop is a level running behind the UI. It
    // must never narrate — that is the fastest way to burn the whole script
    // before the player has pressed PLAY.
    if (autoplay) { current = null; return; }
    current = beatsFor(level?.chapter, level?.level);
    bossFired = false;

    const p = P();
    if (!p.story.introDone) {
      p.story.introDone = true;
      // The intro IS level one's opening line — stacking the level's own beat
      // behind it puts five bubbles on the player's first thirty seconds.
      if (current?.in?.id) markStory(current.in.id);
      playSequence(introBeats(), 500);
      return;
    }
    if (current?.in) playBeat(current.in, 600);
  });

  // First frame of the boss bar. `boss:hp` fires every frame, so the flag.
  on('boss:hp', () => {
    if (bossFired || !current?.boss) return;
    bossFired = true;
    playBeat(current.boss, 300);
  });

  on('run:end', ({ win, level }) => {
    if (!current) return;
    if (win && current.out) playBeat(current.out, 700);
    // Two scenes in the whole game, both on the outro screen where the run is
    // already over: arriving at the house, and the day the war ends.
    if (win && level?.chapter === 1 && level?.level === 24) {
      playSequence(CH2_ARRIVE.map((l, i) => ({ ...l, id: idOf(2, 0, 'arrive' + i) })), 2600);
    }
    if (win && level?.chapter === 4 && level?.level === 120) {
      playSequence(CH4_END.map((l, i) => ({ ...l, id: idOf(4, 121, 'end' + i) })), 2600);
    }
    current = null;
  });

  // Paid off. Chapter 2's only other lines.
  on('debt:paid', ({ left }) => {
    if (left > 0) return;
    playSequence(CH2_CLEARED.map((l, i) => ({ ...l, id: idOf(2, 0, 'clear' + i) })), 500);
  });

  return { beatsFor, playBeat, introBeats };
}

// Handy for the story log on the main screen: everything read so far, in order.
export function seenBeats() {
  const out = [];
  for (const ch of [1, 3, 4]) {
    const t = TABLE[ch];
    for (const lv of Object.keys(t).map(Number).sort((a, b) => a - b)) {
      for (const b of runBeats(ch, lv)) if (storySeen(b.id)) out.push({ chapter: ch, level: lv, ...b });
    }
  }
  return out;
}

// Total lines in the script, for a "story 34%" readout. Chapter 2's five lines
// are counted because the player has to earn them.
export const STORY_TOTAL = INTRO.length + CH2_ARRIVE.length + CH2_CLEARED.length + CH4_END.length +
  [1, 3, 4].reduce((a, ch) => a + Object.keys(TABLE[ch]).reduce((b, lv) => b + runBeats(ch, +lv).length, 0), 0);

export const chapterTitle = (n) => chapterOf(n).name;

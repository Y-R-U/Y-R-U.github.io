/* SUNDERFALL — the opening cinematic, as data.
 *
 * Nothing here renders anything. `intro/` reads this and plays it, so the whole cinematic can be
 * retimed, re-cut or localised without touching a line of rendering code.
 *
 * Time is seconds from the first frame. Three parallel tracks:
 *
 *   SHOTS  — what the camera is looking at. `scene` selects a preset in intro/stage.js.
 *   BEATS  — speech bubbles. `t` is when the bubble starts typing, `dur` how long it stays up.
 *   CUES   — one-shot stage directions, fired the frame time crosses `t` (see Stage.cue).
 *
 * A beat's `vo: [offset, length]` is where that line sits inside its speaker's recording
 * (VOICES below) — seconds into that FILE, not into the cinematic, which is why `retime`
 * leaves it alone. intro/vo.js plays the slice and fades both ends, because the takes have
 * a music bed under the voice and a hard cut would click. Every clip is short enough to
 * finish before the next line starts; check that again if you retime anything.
 *
 * The cut: we open COLD, mid-fight, on Vayne losing to the Darkness — the audience learns the
 * stakes eleven seconds before Rook does, which is the only reason his sulking plays as comedy.
 *
 * Retiming: `retime(SCRIPT, k)` scales everything; `shift(SCRIPT, fromT, delta)` opens or closes a
 * gap at a point. Both return new objects, they do not mutate.
 */

export const SPEAKER = {
  rook: {
    name: 'Rook',
    style: 'sharp',                 // hard angular bubble, cold ink, clipped typing
    ink: [0.88, 0.91, 0.99],
    fill: [0.075, 0.085, 0.135],
    edge: [0.58, 0.66, 0.86],
    cps: 34,
    jitter: 0,
    glow: 0,
  },
  vayne: {
    name: 'Elderman Vayne',
    style: 'shaky',                 // trembling outline, parchment, lit from inside by embers
    ink: [1.0, 0.93, 0.80],
    fill: [0.135, 0.075, 0.045],
    edge: [1.0, 0.60, 0.22],
    cps: 19,
    jitter: 1.5,
    glow: 1,
  },
  ostrick: {
    name: 'Keeper Ostrick',
    // Rigid, because he is: the same hard panel as Rook's, in office colours, and not a
    // pixel of tremble anywhere. He is faster than Vayne and slower than the boy.
    style: 'sharp',
    ink: [0.94, 0.90, 0.79],
    fill: [0.055, 0.065, 0.060],
    edge: [0.72, 0.64, 0.36],
    cps: 26,
    jitter: 0,
    glow: 0,
  },
  seam: {
    // The Seam has no bubble. Every other speaker in the game gets a panel with an edge
    // and a tail pointing at a body; this one is bare letters hanging in the air, and the
    // missing panel is the whole effect — there is nobody there to point at.
    // `style: 'none'` is the flag for that; ui/world.js currently only branches on 'sharp',
    // so until it learns 'none' this falls back to the round parchment shape with the
    // tremble switched off, which is itself the tell. Do not give it a name: a name tag
    // would be the game agreeing that somebody is speaking.
    name: '',
    style: 'none',
    ink: [0.86, 0.80, 0.72],
    fill: [0.055, 0.035, 0.070],
    edge: [0.62, 0.42, 0.86],
    cps: 19,                        // Vayne's pace, because it is Vayne's voice
    jitter: 0,                      // …and none of his tremble. That is what is wrong with it.
    glow: 0.7,
  },
};

/**
 * The intro's two recordings, one per speaker, each holding that character's whole part.
 *
 * `intro/index.js` fetches every entry in here on boot, so it must stay the intro's two —
 * anything else added would be four 404s under the cold open. Act two's takes live in
 * TAKES below.
 */
export const VOICES = {
  vayne: 'audio/vo/vayne.mp3',
  rook: 'audio/vo/rook.mp3',
};

/**
 * Every recording in the game, keyed by **take**, not by speaker: Rook has two (the
 * cinematic and everything after it) and so does Vayne (his own, and the Seam wearing it).
 * A beat's `take` names one of these; its `vo: [offset, length]` is seconds into that file.
 *
 * `rook2` and `vayne2` do not exist on disk yet. Nothing may assume a take is there —
 * see `audio.hasTake(name)`.
 */
export const TAKES = {
  vayne: 'audio/vo/vayne.mp3',
  rook: 'audio/vo/rook.mp3',
  barks: 'audio/vo/barks.mp3',
  ostrick: 'audio/vo/ostrick.mp3',
  rook2: 'audio/vo/rook2.mp3',
  vayne2: 'audio/vo/vayne2.mp3',
};

export const SHOTS = [
  { id: 'battle',   scene: 'battle',   t:  0.0,  dur: 11.0 },  // cold open — the fight, no build-up
  { id: 'seal',     scene: 'seal',     t: 11.0,  dur:  7.4 },  // he closes it, and it costs him everything
  { id: 'village',  scene: 'village',  t: 18.4,  dur:  8.0 },  // hard tonal drop: a teenager, at dusk
  { id: 'wood',     scene: 'wood',     t: 26.4,  dur:  6.0 },
  { id: 'arrive',   scene: 'clearing', t: 32.4,  dur:  6.0 },  // the reveal — he does not understand it
  { id: 'vayne',    scene: 'clearing', t: 38.4,  dur: 17.6 },
  { id: 'meld',     scene: 'meld',     t: 56.0,  dur: 10.5 },  // showpiece two
  { id: 'last',     scene: 'meld',     t: 66.5,  dur:  5.4 },
  { id: 'collapse', scene: 'collapse', t: 71.9,  dur:  4.3 },
];

export const BEATS = [
  // cold open — one word, and only because a silent scream is worse
  { t:  3.2, dur: 1.4, who: 'vayne', text: 'Hold.',                          anchor: 'vayne', ax:  40, ay: -170, vo: [1.55, 0.52] },

  // Thornmere, dusk. Everything the last twenty seconds was not.
  { t: 19.8, dur: 2.1, who: 'rook',  text: 'Cass gets the forge.',           anchor: 'rook',  ax:  55, ay: -195, vo: [0.0, 1.21] },
  { t: 22.0, dur: 2.1, who: 'rook',  text: 'Cass gets the name.',            anchor: 'rook',  ax:  55, ay: -195, vo: [1.96, 0.97] },
  { t: 24.2, dur: 2.3, who: 'rook',  text: 'I get the goats.',               anchor: 'rook',  ax:  55, ay: -195, vo: [3.52, 1.07] },

  // the Sunderwood
  { t: 27.6, dur: 1.9, who: 'rook',  text: 'Why is it so quiet?',            anchor: 'rook',  ax:  60, ay: -190, vo: [6.04, 1.39] },
  { t: 30.2, dur: 2.1, who: 'rook',  text: "That's not sunset.",             anchor: 'rook',  ax:  60, ay: -190, vo: [8.44, 1.07] },

  // the aftermath. We know exactly what he is looking at. He does not.
  { t: 36.4, dur: 2.0, who: 'rook',  text: 'What is this?',                  anchor: 'rook',  ax: -55, ay: -190, vo: [11.88, 0.91] },

  { t: 38.8, dur: 2.7, who: 'vayne', text: 'The Darkness found the seam.',   anchor: 'vayne', ax:  45, ay: -155, vo: [4.76, 1.53] },
  { t: 41.7, dur: 1.9, who: 'vayne', text: 'I pushed it back.',              anchor: 'vayne', ax:  45, ay: -155, vo: [7.44, 1.23] },
  { t: 43.8, dur: 2.6, who: 'vayne', text: 'It cost me everything I had.',   anchor: 'vayne', ax:  45, ay: -155, vo: [11.37, 1.88] },
  { t: 46.6, dur: 1.8, who: 'vayne', text: 'The wards will hold.',           anchor: 'vayne', ax:  45, ay: -155, vo: [14.6, 1.65] },
  { t: 48.6, dur: 1.4, who: 'vayne', text: 'Not long.',                      anchor: 'vayne', ax:  45, ay: -155, vo: [17.14, 1.05] },
  { t: 50.3, dur: 2.1, who: 'rook',  text: 'So get someone else.',           anchor: 'rook',  ax: -55, ay: -190, vo: [14.0, 1.29] },
  { t: 52.6, dur: 1.9, who: 'vayne', text: "You're what's here.",            anchor: 'vayne', ax:  45, ay: -155, vo: [18.92, 0.97] },
  { t: 54.7, dur: 2.1, who: 'vayne', text: "That's the whole of it.",        anchor: 'vayne', ax:  45, ay: -155, vo: [20.76, 1.59] },

  // the meld itself is silent — the picture carries it
  { t: 61.8, dur: 2.2, who: 'vayne', text: 'You can hold magic now.',        anchor: 'vayne', ax:  45, ay: -155, vo: [24.47, 1.54] },
  { t: 64.2, dur: 2.5, who: 'vayne', text: "Holding it isn't wielding it.",  anchor: 'vayne', ax:  45, ay: -155, vo: [26.36, 2.49] },

  { t: 67.0, dur: 2.4, who: 'vayne', text: "I'd have picked anyone else.",   anchor: 'vayne', ax:  45, ay: -155, vo: [30.54, 1.95] },
  { t: 69.6, dur: 2.1, who: 'vayne', text: 'Grow up. Quickly.',              anchor: 'vayne', ax:  45, ay: -155, vo: [33.8, 1.03] },
];

export const CUES = [
  // ── cold open: we are already losing
  { t:  0.02, fx: 'audio.battle' },
  { t:  0.10, fx: 'dark.slam' },        // frame one is an impact, not an establishing shot
  { t:  1.60, fx: 'dark.slam' },
  { t:  2.40, fx: 'vayne.surge' },      // he pushes back and it visibly burns him
  { t:  4.30, fx: 'dark.slam' },
  { t:  5.10, fx: 'ward.crack' },
  { t:  6.20, fx: 'dark.lash' },
  { t:  7.00, fx: 'vayne.knee' },
  { t:  8.20, fx: 'dark.slam' },
  { t:  9.10, fx: 'ward.crack' },
  { t:  9.90, fx: 'vayne.commit' },     // staff into the glyph

  // ── the seal
  { t: 11.20, fx: 'seal.charge' },
  { t: 12.60, fx: 'seal.detonate' },    // showpiece one
  { t: 14.40, fx: 'title.form' },
  { t: 16.60, fx: 'title.scatter' },
  { t: 16.90, fx: 'vayne.collapse' },
  { t: 17.60, fx: 'audio.silence' },

  // ── Thornmere
  { t: 18.45, fx: 'audio.dusk' },
  { t: 18.60, fx: 'rook.walk' },
  { t: 25.40, fx: 'rook.exit' },

  // ── the Sunderwood
  { t: 26.50, fx: 'audio.thin' },
  { t: 29.20, fx: 'wood.wrongLight' },
  { t: 31.40, fx: 'wood.push' },

  // ── the aftermath
  { t: 32.50, fx: 'clearing.reveal' },
  { t: 35.20, fx: 'rook.stop' },
  { t: 38.30, fx: 'vayne.beckon' },
  { t: 46.60, fx: 'ward.flicker' },
  { t: 48.60, fx: 'ward.flicker' },

  // ── the lifestone
  { t: 56.60, fx: 'stone.reveal' },
  { t: 57.60, fx: 'stone.press' },
  { t: 58.20, fx: 'stone.meld' },       // showpiece two
  { t: 59.60, fx: 'stone.veins' },
  { t: 61.00, fx: 'stone.settle' },

  // ── the end of him
  { t: 72.20, fx: 'vayne.die' },
  { t: 73.10, fx: 'ward.collapse' },
  { t: 74.30, fx: 'darkness.enter' },
  { t: 75.60, fx: 'cut.black' },
];

export const SCRIPT = {
  version: 2,
  duration: 76.2,
  speakers: SPEAKER,
  shots: SHOTS,
  beats: BEATS,
  cues: CUES,
};

export function retime(script, k) {
  const s = (a) => a.map((o) => ({ ...o, t: o.t * k, ...(o.dur != null ? { dur: o.dur * k } : {}) }));
  return { ...script, duration: script.duration * k, shots: s(script.shots), beats: s(script.beats), cues: s(script.cues) };
}

export function shift(script, fromT, delta) {
  const s = (a) => a.map((o) => (o.t >= fromT ? { ...o, t: o.t + delta } : o));
  return { ...script, duration: script.duration + delta, shots: s(script.shots), beats: s(script.beats), cues: s(script.cues) };
}

export function shotAt(script, t) {
  const sh = script.shots;
  for (let i = sh.length - 1; i >= 0; i--) if (t >= sh[i].t) return sh[i];
  return sh[0];
}

export default SCRIPT;

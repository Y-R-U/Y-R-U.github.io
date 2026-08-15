/* SUNDERFALL — act two's four scenes, as data.
 *
 * Same shape as the intro's BEATS, because `ui.say()` already eats it; `story/runner.js`
 * plays these the way `intro/` plays SCRIPT. Nothing here renders anything.
 *
 *   cast   — who the runner spawns for the scene, and how they get on stage
 *   beats  — speech bubbles. `t` is when the bubble starts typing, `dur` how long it holds
 *   cues   — one-shot stage directions, fired the frame time crosses `t` (contract §3.3)
 *
 * The cut: Ostrick tells him to keep a fire lit and leaves. The fire goes out, and the thing
 * behind the rock face has been leaning on it since the intro. At the glade the Seam speaks,
 * and it has no voice of its own, so it wears the last one it heard. Then it is over, and the
 * adults arrive.
 *
 * **`vo` is null on every line and every scene plays silent.** The mp3s do not exist yet.
 * Timings are written to be readable with no audio at all, so a silent play looks deliberate
 * rather than broken. When Aaron generates the takes, the only edit is the `vo: null` column:
 * each scene marks the block to paste into with a `── VO: <take> ──` comment, and the offsets
 * are seconds into that FILE, not into the scene. Nothing else changes — not a `t`, not a
 * `dur`. If a line's timing has to move to fit the recording, move it here and re-run
 * `tools/checkscenes.mjs`.
 *
 * `take` is which recording a line lives in, and a line is not selectable audio until that
 * take is on disk. Three of them are not: `ostrick`, `rook2`, `vayne2` (docs/SCRIPTS-ACT-TWO.md).
 *
 * **`cam.y` is an absolute world coordinate and the road climbs**, so it is derived from the
 * real terrain rather than picked: `cam.y = groundAt(cam.x) - K`, with K between 280 and 335.
 * That is the framing the play scene itself uses — `sim/index.js` sits the camera at
 * `player.y - halfH * lead`, and with the player's centre 76px above the ground line that works
 * out at ground-304 in landscape and ground-271 in portrait. K in that band puts the ground line
 * ~0.7–0.8 of the way down the frame in both orientations, which is where the art is composed
 * for. Ground heights when these were written (`groundAt` from sim/level.js): 7530 → 104,
 * 7560 → 110, 7740 → 144, 8780 → -91, 10250 → 98. **If the level's profile moves, re-derive
 * these**; `story/runner.js` clamps a cam.y that would leave the ground off screen and warns
 * once naming the scene, which is a safety net and not the fix.
 *
 * Timings: a bubble needs `text.length / cps` seconds to finish typing plus reading time on
 * top, so nothing here is tighter than that for its speaker (Rook 34 cps, Ostrick 26, the Seam
 * 19). Two bubbles from the same speaker never overlap. The long gaps are not slack — the hold
 * after "Take it. Just take it.", the dark after the brazier goes out, and the silence after
 * the seam closes are load-bearing, and shortening them breaks the scene they are in.
 */

export const SCENES = {

  /* ── stones ──────────────────────────────────────────────────────────────
   * x 7550. The second adult in a row hands him the job and walks away. Ostrick is petty
   * for forty seconds and frightened for the last twenty; the turn is "Take it. Just take
   * it.", which lands because it is flat. Approved prose: VOICE-AND-MUSIC.md §8b — the
   * lines below are transcribed from it and must not be reworded.
   */
  stones: {
    id: 'stones',
    duration: 67,
    letterbox: 0.10,
    cast: [
      { who: 'ostrick', x: 7570, face: -1, enter: 'stand' },
    ],
    cam: { x: 7505, y: -180, zoom: 1.45, ease: 1.2 },       // ground 104 − 284; between Rook (~7450) and Ostrick (7570)
    beats: [
      // ── VO: ostrick + rook2 — paste [offset, length] into the vo column ──
      { t: 0.6,  dur: 2.5, who: 'ostrick', text: "Don't touch the stones.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [0.38, 2.61] },
      { t: 3.4,  dur: 1.8, who: 'ostrick', text: 'Who melded you?',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [3.62, 1.42] },
      { t: 5.7,  dur: 1.6, who: 'rook',    text: 'Elderman Vayne.',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [38.7, 1.22] },
      { t: 7.9,  dur: 1.3, who: 'ostrick', text: 'No.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [6, 0.76] },
      { t: 9.6,  dur: 3.4, who: 'ostrick', text: "There's a Rite. There's a Naming. There's nine years of it.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [7.72, 3.26] },
      { t: 13.3, dur: 2.4, who: 'ostrick', text: "You got a dying man's panic.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [11.52, 2.24] },
      { t: 16.1, dur: 1.3, who: 'rook',    text: 'Yes.',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [40.455, 0.55] },
      { t: 18.0, dur: 2.8, who: 'ostrick', text: 'Vayne turned down forty years of me.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [15.34, 2.84] },
      { t: 21.0, dur: 2.6, who: 'ostrick', text: 'And gave it to what was standing there.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [18.1, 2.32] },
      { t: 23.7, dur: 2.9, who: 'rook',    text: "I had goats. Now I've got this.",
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [41.04, 3] },
      { t: 26.8, dur: 2.0, who: 'rook',    text: 'Take it. Just take it.',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [43.98, 1.81] },

      // 28.8 → 31.6 is the hold. Nobody speaks. It is the only reason the next line works.
      { t: 31.6, dur: 2.1, who: 'ostrick', text: "…You'd give it up.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [20.62, 1.14] },
      { t: 34.2, dur: 1.3, who: 'rook',    text: 'Yes.',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [46.34, 0.74] },
      { t: 36.2, dur: 2.3, who: 'ostrick', text: 'Then he was out of time.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [22.42, 1.37] },
      { t: 38.8, dur: 3.0, who: 'ostrick', text: "He'd never. Not unless there was none left.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [23.98, 2.51] },
      { t: 42.4, dur: 2.0, who: 'ostrick', text: "The seam's open.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [26.88, 1.48] },
      { t: 45.2, dur: 2.5, who: 'ostrick', text: 'Boy. Keep the fire lit.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [28.25, 2.65] },
      { t: 47.9, dur: 3.0, who: 'ostrick', text: 'Nothing crosses the stones while it burns.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [31.28, 2.92] },
      { t: 51.0, dur: 2.2, who: 'ostrick', text: "I'll bring the elders.",
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [33.89, 1.73] },
      { t: 53.6, dur: 1.5, who: 'rook',    text: 'How long?',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [46.92, 1.03] },
      { t: 55.4, dur: 2.4, who: 'ostrick', text: 'Learn something while you wait.',
        anchor: 'ostrick', ax: 40, ay: -170, take: 'ostrick', vo: [36.58, 2.24] },

      // he is already walking through that last line, and does not look back
      { t: 59.6, dur: 2.1, who: 'rook',    text: "That's the second one.",
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [50.84, 1.38] },
      { t: 62.6, dur: 2.6, who: 'rook',    text: 'The goats were fine.',
        anchor: 'rook', ax: -55, ay: -190, take: 'rook2', vo: [53.36, 1.36] },
    ],
    cues: [
      { t: 0.0,  fx: 'cam.hold' },
      { t: 0.2,  fx: 'audio.cue', key: 'explore' },
      { t: 56.6, fx: 'ostrick.leave' },
      { t: 58.8, fx: 'cam.to', x: 7530, y: -180, dur: 2.0 },   // back to the framing above

    ],
  },

  /* ── fire ────────────────────────────────────────────────────────────────
   * x 7550, straight off the back of the vigil. Short and cold. The flame bends INWARD —
   * something is drinking it, not blowing it out — and then Rook's own fire will not catch,
   * which is the moment the scene turns, because fire is the one thing he can reliably do.
   * The Seam does not speak here. Save it.
   */
  fire: {
    id: 'fire',
    duration: 29,
    letterbox: 0.10,
    cast: [],
    cam: { x: 7560, y: -190, zoom: 1.5, ease: 1.6 },        // ground 110 − 300
    beats: [
      // ── VO: rook2 — paste [offset, length] into the vo column ──
      { t: 0.8,  dur: 1.9, who: 'rook', text: "That's not the wind.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [57.34, 1.22] },
      { t: 3.0,  dur: 1.7, who: 'rook', text: "It's bending in.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [58.9, 1.31] },
      { t: 5.0,  dur: 2.0, who: 'rook', text: "Something's drinking it.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [60.06, 1.38] },

      // 7.0 → 9.0 the brazier goes out and he says nothing at all
      { t: 9.0,  dur: 1.9, who: 'rook', text: 'He said keep it lit.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [61.44, 1.14] },
      { t: 11.3, dur: 1.9, who: 'rook', text: 'Fine. I can do fire.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [62.42, 2.22] },

      // 13.2 → 14.6 he tries, and nothing happens. The gap is the whole scene.
      { t: 14.6, dur: 1.7, who: 'rook', text: "It won't take.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [65.48, 1.15] },
      { t: 16.7, dur: 2.0, who: 'rook', text: "That's never happened.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [66.52, 1.17] },
      { t: 19.8, dur: 2.3, who: 'rook', text: "Something's been leaning on that.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [67.7, 1.66] },
      { t: 23.4, dur: 2.4, who: 'rook', text: "I'm not standing here in the dark.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [69.32, 1.74] },
      { t: 26.2, dur: 1.6, who: 'rook', text: 'East, then.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [71.12, 1.24] },
    ],
    cues: [
      { t: 0.0,  fx: 'cam.hold' },
      { t: 0.2,  fx: 'audio.cue', key: 'tension' },
      { t: 7.2,  fx: 'fire.snuff' },
      { t: 7.3,  fx: 'cam.shake', a: 4, d: 0.5 },
      { t: 19.0, fx: 'gate.crack' },
      { t: 19.1, fx: 'cam.shake', a: 7, d: 0.8 },
      // A nudge east so the face fills the right of the frame, and no further. Measured:
      // the terrain surface is +112 at x=7625 and **-1200** from 7650 to 7900 — the rock face
      // is solid to 1300px above the road until `openGate` carves it. A camera sent at the
      // breach centre (7770) is therefore aimed at the top of a cliff, and the runner's
      // ground clamp drags it a thousand pixels into the sky. Ground 112 − 327.
      { t: 19.3, fx: 'cam.to', x: 7625, y: -215, dur: 1.4 },
      { t: 22.4, fx: 'gate.open' },
      { t: 22.5, fx: 'cam.shake', a: 12, d: 1.2 },
      { t: 27.0, fx: 'rook.walk', x: 7660 },
    ],
  },

  /* ── glade ───────────────────────────────────────────────────────────────
   * x 8760. Back where Vayne died, and he recognises it before he understands it. He kneels
   * at the staff and says the smallest possible thing, and then the Seam answers in Vayne's
   * voice — the last voice it heard. It gets it wrong cheaply: it repeats itself, it is too
   * even, and it says his name, which Vayne never did. He was "boy" for the whole intro.
   * That is the tell, and Rook is the one who works it out.
   *
   * Every Seam line holds for exactly 2.4s whatever its length, including the one-word ones.
   * That is deliberate — a machine reading from a card does not vary its pace — and it is why
   * checkscenes.mjs allows the Seam a longer hold than its text needs.
   */
  glade: {
    id: 'glade',
    duration: 63.5,
    letterbox: 0.12,
    cast: [
      { who: 'staff', x: 8790, face: -1, enter: 'stand' },
    ],
    // The glade plateau is 195px HIGHER than the stones (ground -91, not +104), which is the
    // whole reason cam.y cannot be eyeballed: -200 here framed the same picture as -200 there
    // and left the ring stones and the staff sitting in the bottom fifth of the screen.
    cam: { x: 8780, y: -370, zoom: 1.4, ease: 1.0 },        // ground -91 − 279
    beats: [
      // ── VO: rook2 + vayne2 — paste [offset, length] into the vo column ──
      { t: 1.2,  dur: 2.0, who: 'rook', text: 'I know these stones.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [72.26, 1.44] },
      { t: 3.6,  dur: 2.4, who: 'rook', text: "The circle's still burnt in.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [73.78, 1.86] },
      { t: 6.4,  dur: 2.3, who: 'rook', text: 'This is where he did it.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [75.62, 1.54] },

      { t: 12.6, dur: 2.2, who: 'rook', text: 'You left this standing.',
        anchor: 'rook', ax: 55, ay: -160, take: 'rook2', vo: [78.98, 1.46] },
      { t: 15.2, dur: 2.1, who: 'rook', text: 'The fire went out.',
        anchor: 'rook', ax: 55, ay: -160, take: 'rook2', vo: [80.19, 1.36] },

      // 17.3 → 19.6 nothing. Then something that is not there answers him.
      { t: 19.6, dur: 2.4, who: 'seam', text: "You're what's here.",
        anchor: 'world', ax: 8770, ay: -300, take: 'vayne2', vo: null },
      { t: 22.6, dur: 1.5, who: 'rook', text: 'Vayne.',
        anchor: 'rook', ax: 55, ay: -160, take: 'rook2', vo: [81.52, 0.68] },
      { t: 24.8, dur: 2.4, who: 'seam', text: "You're what's here.",
        anchor: 'world', ax: 8770, ay: -300, take: 'vayne2', vo: null },
      { t: 27.6, dur: 2.4, who: 'seam', text: "That's the whole of it.",
        anchor: 'world', ax: 8770, ay: -300, take: 'vayne2', vo: null },
      { t: 30.8, dur: 2.2, who: 'rook', text: 'He only said that once.',
        anchor: 'rook', ax: 55, ay: -160, take: 'rook2', vo: [82.02, 1.4] },
      { t: 33.8, dur: 2.4, who: 'seam', text: 'Rook.',
        anchor: 'world', ax: 8790, ay: -320, take: 'vayne2', vo: null },
      { t: 37.0, dur: 2.6, who: 'rook', text: "He never called me that. I was 'boy'.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [83.38, 1.84] },
      { t: 40.4, dur: 2.4, who: 'seam', text: 'Grow up. Quickly.',
        anchor: 'world', ax: 8790, ay: -320, take: 'vayne2', vo: null },
      { t: 43.4, dur: 2.8, who: 'rook', text: "You've got his voice. You haven't got him.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [87.18, 2.24] },
      { t: 47.0, dur: 2.4, who: 'seam', text: "You're what's here.",
        anchor: 'world', ax: 8810, ay: -330, take: 'vayne2', vo: null },
      { t: 50.0, dur: 1.6, who: 'rook', text: 'Stop.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [89.12, 0.83] },

      { t: 53.4, dur: 1.8, who: 'rook', text: 'He held this.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [89.79, 0.99] },
      { t: 56.0, dur: 2.6, who: 'rook', text: "It won't help. I'm taking it anyway.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [90.66, 1.88] },
      { t: 59.2, dur: 2.4, who: 'rook', text: "You don't get to keep him.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [92.48, 1.36] },
    ],
    cues: [
      { t: 0.0,  fx: 'cam.hold' },
      { t: 0.2,  fx: 'audio.cue', key: 'tension' },
      { t: 9.0,  fx: 'rook.walk', x: 8790 },
      { t: 12.0, fx: 'rook.kneel' },
      { t: 19.4, fx: 'seam.speak' },
      { t: 24.6, fx: 'seam.speak' },
      { t: 27.4, fx: 'seam.speak' },
      { t: 33.6, fx: 'seam.speak' },
      { t: 40.2, fx: 'seam.speak' },
      { t: 46.8, fx: 'seam.speak' },
      { t: 52.4, fx: 'seam.reveal' },
      { t: 55.4, fx: 'staff.take' },
      { t: 55.8, fx: 'rook.walk', x: 8820 },     // stands out of the kneel
      { t: 61.0, fx: 'rook.walk', x: 8900 },
    ],
  },

  /* ── after ───────────────────────────────────────────────────────────────
   * The arena, in pieces. Hold the silence longer than is comfortable — six seconds before
   * anyone says anything, and the scene does not need help. Ostrick arrives far too late and
   * does not apologise; he starts a procedural question, which is exactly who he is, and stops
   * himself inside it. The elders never speak, and keep never speaking. The nearest thing to
   * an apology he has is paperwork.
   *
   * Rook's "No." is the word Ostrick refused him with at the stones, handed back. The last
   * line of the game is about the goats, and it only works because "The goats were fine" was
   * planted forty minutes earlier.
   */
  after: {
    id: 'after',
    duration: 54,
    letterbox: 0.14,
    cast: [
      // spawned west and off-screen; he does not move until `ostrick.arrive`
      { who: 'ostrick', x: 9350, face: 1, enter: 'west' },
    ],
    cam: { x: 10250, y: -220, zoom: 1.3, ease: 0.8 },      // ground 98 − 318
    beats: [
      // ── VO: rook2 + ostrick — paste [offset, length] into the vo column ──
      // 0 → 6.2 is nothing. It is the longest silence in the game and it is the point.
      { t: 6.2,  dur: 1.7, who: 'rook', text: 'Is that it?',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [96.03, 0.95] },
      { t: 9.4,  dur: 2.1, who: 'rook', text: "The stone's gone out.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [97.16, 1.09] },

      { t: 17.0, dur: 1.5, who: 'ostrick', text: 'Boy.',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [39.38, 0.82] },
      { t: 19.2, dur: 2.1, who: 'ostrick', text: 'What rite did you—',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [41, 1.76] },

      // 21.3 → 24.0 he hears himself. The elders say nothing, and go on saying nothing.
      { t: 24.0, dur: 1.6, who: 'rook', text: "It's done.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [98.2, 0.84] },
      { t: 27.6, dur: 1.5, who: 'ostrick', text: '…Yes.',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [42.66, 1.14] },

      { t: 31.4, dur: 2.6, who: 'ostrick', text: "There's a Rite. There's a Naming.",
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [43.28, 2.88] },
      { t: 34.4, dur: 2.0, who: 'ostrick', text: 'If you want it.',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [46.1, 1.44] },
      { t: 37.6, dur: 1.4, who: 'rook', text: 'No.',
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [98.9, 0.56] },

      // 39.0 → 41.6 the hold. It is his word, given back to him, and he has to stand in it.
      { t: 41.6, dur: 2.2, who: 'ostrick', text: '…Then what will you do?',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [48.18, 1.46] },
      { t: 44.6, dur: 2.2, who: 'rook', text: "Nobody's fed the goats.",
        anchor: 'rook', ax: 55, ay: -190, take: 'rook2', vo: [102.68, 1.44] },
      { t: 48.6, dur: 1.6, who: 'ostrick', text: '…Boy.',
        anchor: 'ostrick', ax: -40, ay: -170, take: 'ostrick', vo: [50.62, 1] },
    ],
    cues: [
      { t: 0.0,  fx: 'cam.hold' },
      { t: 1.0,  fx: 'audio.cue', key: 'victory' },
      { t: 13.0, fx: 'ostrick.arrive' },
      { t: 13.6, fx: 'elders.arrive' },
      { t: 46.4, fx: 'rook.walk', x: 9900 },      // west. Home.
      { t: 51.5, fx: 'fade.out' },
    ],
  },
};

export default SCENES;

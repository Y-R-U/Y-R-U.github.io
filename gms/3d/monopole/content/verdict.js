// The cold open. It plays itself — no Next button anywhere in it.
//
// It is deliberately about somebody else. A player who has just been told that the biggest carrier
// in human space is being cut to a tenth of itself, lane by lane, works out on their own why there
// is suddenly room for a nobody with one rig. Saying it out loud would kill it.
//
// `shot` is an absolute camera framing, not a spline, so a skip can cut straight to the last one.
//
// The eight camera keys are ONE approach. They open on Meridian's parked fleet at four kilometres,
// where it is a row of scratches against the gas giant, and close on it a key at a time until a
// single hull fills the frame. Each step is ~28 % nearer than the last, which is the smallest
// change that reads as movement rather than a slow zoom — the first cut of this sequence closed by
// 18 % across the whole ruling and looked like a still photograph for forty seconds.
//
// Nothing local is drawn for those beats: Ledger, the Dray Yard and the belt are switched off, and
// the beat marked `here: true` cuts away and turns them all on at once. That cut is why the fleet
// can be thrown away on the same frame without the player seeing it go.
//
// ── two clocks ────────────────────────────────────────────────────────────────────────────────
//
// Every beat carries both `at` and `ms`, and only one of them is ever read in a given run:
//
//   `at`  seconds into `track`. Used when the recorded ruling is playing, and measured off the
//         voice itself — see AUDIO.md for how. Captions land 0.3–0.9 s BEFORE the line is spoken,
//         which is deliberate and is the direction to err in: a caption that arrives after its
//         line reads as a bug, one that arrives just before reads as a court record being followed.
//   `ms`  how long the beat holds when there is no sound — a muted tab, a failed fetch, `?mute=1`.
//         The silent cut runs 66 s against the track's 137 s, because silent prose is read at
//         reading speed and a spoken sentence has air around it.
//
// The two are NOT derived from one another and must be edited together. `at` is the truth about a
// file that already exists; `ms` is a judgement about reading.
//
// The prose is split far finer than the eight camera keys — twenty-two beats over eight framings.
// A beat with no `shot` holds the move it is standing in, so the camera glides across a whole group
// of captions in one continuous ease instead of pulsing once per line.

const D = [1540, 400, 3520];

// Where Meridian's fleet sits, and the axis the camera walks in along. `face` is the group's own
// yaw, set so the ranks run across the approach and the hulls read as long shapes rather than
// head-on specks. Shared with js/world/scene.js, which builds the fleet at this anchor.
export const meridian = Object.freeze({
  at: Object.freeze([-2100, 300, 3200]),
  face: 0.62,
});

// The camera for one key of the approach: distance from the fleet, bearing around it, and how far
// above its plane.
//
// Bearing is the load-bearing number and it barely moves — a bearing of about −45° is the one that
// holds Ossian and the star behind the fleet, which is what backlights the hulls, and swinging away
// from it takes the planet off the frame and leaves a black rectangle with some ships in it. The
// parallax comes from the approach itself: three ranks separate hard as the camera closes on them.
//
// `ms` is left off almost everywhere on purpose. Omitted, the move takes exactly as long as the run
// of captions it is under, in whichever clock is running — which is the only way one framing table
// can serve a 137-second recording and a 66-second silent cut. Set it only to force a cut (`0`) or
// a punch faster than its own beat.
function approach(dist, az, el, fov, ms) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  const F = meridian.at;
  return Object.freeze({
    pos: Object.freeze([
      Math.round(F[0] + dist * Math.sin(a) * Math.cos(e)),
      Math.round(F[1] + dist * Math.sin(e)),
      Math.round(F[2] + dist * Math.cos(a) * Math.cos(e)),
    ]),
    look: F,
    fov, ms,
  });
}

// The recorded ruling. Timings in `at` are only true of this file — re-generate the voice and every
// one of them has to be measured again.
export const track = Object.freeze({
  src: 'assets/audio/verdict.mp3',
  // where the last beat gives up and hands over. The file runs to 137.8 s; the last line lands at
  // 133.5 and what is left is a tail, which is better spent fading under the origin screen than
  // watched.
  end: 136.4,
  fade: 2200,
});

export const beats = Object.freeze([
  Object.freeze({
    // `at: 0` and not 2.6, where the voice actually starts. The seal is a title card and the first
    // thing the recording does is read it out, so it wants to be up under the intro bars — the
    // caption-before-line rule at its limit rather than an exception to it.
    id: 'seal', kind: 'seal', at: 0, ms: 2600,
    over: 'Universal Alliance', text: 'Competition Division',
    shot: approach(4200, -57, 6, 38, 0),
  }),

  // The case caption, then the size of the thing being sentenced — three numbers, delivered one at
  // a time with air between them, so they are three cards rather than one line.
  Object.freeze({
    id: 'docket', kind: 'record', at: 7.6, ms: 3600,
    over: 'Finding 44 · 119',
    text: 'The Alliance v. the Meridian Combine',
    shot: approach(3020, -57.6, 7.2, 39),
  }),
  Object.freeze({ id: 'years', kind: 'record', at: 16.0, ms: 1400, over: 'Finding 44 · 119', text: 'Sixty-one years.' }),
  Object.freeze({ id: 'lanes', kind: 'record', at: 19.4, ms: 1400, over: 'Finding 44 · 119', text: 'Four hundred lanes.' }),
  Object.freeze({ id: 'carrier', kind: 'record', at: 22.9, ms: 1900, over: 'Finding 44 · 119', text: 'One carrier.' }),

  Object.freeze({
    id: 'method', kind: 'record', at: 27.0, ms: 3200,
    over: 'Findings of fact · 1 of 3',
    text: 'Meridian never out-carried anyone.',
    shot: approach(2180, -58.2, 8.4, 40),
  }),
  Object.freeze({
    id: 'bought', kind: 'record', at: 32.2, ms: 3800,
    over: 'Findings of fact · 1 of 3',
    text: 'It bought the yards, then the lanes, then the people who set the tariffs.',
  }),

  Object.freeze({
    id: 'wait', kind: 'record', at: 38.3, ms: 3000,
    over: 'Findings of fact · 2 of 3',
    text: 'Where it could not buy, it waited.',
    shot: approach(1570, -58.8, 9.6, 41),
  }),
  Object.freeze({
    id: 'dock', kind: 'record', at: 43.4, ms: 3400,
    over: 'Findings of fact · 2 of 3',
    text: 'A rival that cannot dock does not have to be beaten.',
  }),

  Object.freeze({
    id: 'ration', kind: 'record', at: 48.9, ms: 3400,
    over: 'Findings of fact · 3 of 3',
    text: 'Coil filament was rationed to hold its price.',
    shot: approach(1130, -59.4, 10.8, 42),
  }),
  Object.freeze({
    id: 'burns', kind: 'record', at: 54.5, ms: 4200,
    over: 'Findings of fact · 3 of 3',
    text: 'Every lamp, every drive coil and every relay beacon in the outer systems burns filament.',
  }),

  Object.freeze({
    id: 'kalsa', kind: 'record', at: 64.0, ms: 3800, weight: true,
    over: 'Kalsa relay · the ninth year of the ration',
    text: 'The Kalsa beacon went dark and stayed dark for nine days.',
    shot: approach(810, -60, 12, 43),
  }),
  Object.freeze({
    id: 'aboard', kind: 'record', at: 73.0, ms: 4200, weight: true,
    over: 'Kalsa relay · the ninth year of the ration',
    text: 'Two thousand three hundred people were aboard the ships that could not see it.',
  }),

  // 80.6 is off the envelope, not off the transcript. The word lands 0.6 s later than the words
  // around it suggest, and a stamp is the one beat that must hit ON the voice rather than ahead of
  // it — GUILTY arriving early reads as the caption spoiling the line.
  Object.freeze({
    id: 'guilty', kind: 'stamp', at: 80.6, ms: 2800,
    text: 'Guilty', sub: 'on all forty counts',
    shot: approach(584, -60.6, 13.2, 29, 900),
  }),

  Object.freeze({
    id: 'sentence', kind: 'sentence', at: 85.7, ms: 3600,
    over: 'Order of divestiture',
    text: 'Meridian is reduced to one tenth of what it holds.',
    shot: approach(420, -61.2, 14.4, 44),
  }),
  Object.freeze({
    id: 'twelve', kind: 'sentence', at: 92.8, ms: 3400,
    over: 'Order of divestiture',
    text: 'Twelve years. Lane by lane, system by system,',
  }),
  Object.freeze({
    id: 'ready', kind: 'sentence', at: 98.2, ms: 3600,
    over: 'Order of divestiture',
    text: 'whether or not there is anyone ready to take them.',
  }),

  // The cut. `ms: 0` is doing real work here — the fleet is thrown away on this frame, and only a
  // hard cut hides that. A four-second sweep would have carried the player's eye off a convoy that
  // vanished halfway through the move.
  //
  // 104.05 is a downbeat, not a word: the ruling ends and the arrangement comes in a full 12 dB, on
  // one frame. The court finishes speaking and you are looking at the Reach with nothing written
  // over it. Everything before this is about somebody else and everything after it is about you, so
  // the one musical event in the track and the one cut in the sequence are the same instant.
  Object.freeze({
    id: 'open', kind: 'blank', at: 104.05, ms: 900, here: true,
    shot: Object.freeze({ pos: Object.freeze([520, 1480, 1980]), look: Object.freeze([260, 40, 460]), fov: 56, ms: 0 }),
  }),
  // Fifteen seconds of instrumental with no caption on it. It is the longest the player goes
  // without being told anything and it is the best the game ever looks, so the camera has to be
  // moving through all of it — a static frame that long reads as a hang, not a hold.
  Object.freeze({
    id: 'drift', kind: 'blank', at: 104.6, ms: 1800,
    shot: Object.freeze({ pos: Object.freeze([-140, 700, 1180]), look: Object.freeze([200, 30, 380]), fov: 46 }),
  }),

  Object.freeze({ id: 'reach', kind: 'land', at: 119.6, ms: 3000, text: 'Tamber Reach was released this year.' }),
  Object.freeze({
    id: 'corvain', kind: 'land', at: 123.5, ms: 3800,
    text: 'Corvain Drayage took seventy-one per cent of it in nine weeks.',
    shot: Object.freeze({
      pos: Object.freeze([D[0] - 980, D[1] - 90, D[2] - 1420]),
      look: Object.freeze([D[0] - 260, D[1] - 60, D[2] - 640]), fov: 40,
    }),
  }),
  Object.freeze({
    id: 'late', kind: 'land', at: 131.4, ms: 3600, last: true,
    text: 'You got here late.',
    shot: Object.freeze({ pos: Object.freeze([-150, 26, 250]), look: Object.freeze([130, 4, 60]), fov: 44 }),
  }),
]);

export default Object.freeze({ beats, meridian, track });

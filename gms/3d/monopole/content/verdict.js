// The cold open. It plays itself — no Next button anywhere in it.
//
// It is deliberately about somebody else. A player who has just been told that the biggest carrier
// in human space is being cut to a tenth of itself, lane by lane, works out on their own why there
// is suddenly room for a nobody with one rig. Saying it out loud would kill it.
//
// `shot` is an absolute camera framing, not a spline, so a skip can cut straight to the last one.
//
// ── how the camera moves ──────────────────────────────────────────────────────────────────────
//
// Every beat is one of three things, and they alternate on purpose:
//
//   `punch(ms, hit, drift)`  arrives on the line — a fast move, usually under a second — and then
//                            creeps for whatever is left of the beat. This is the one that reads.
//   `glide(to)`              one slow move that takes the beat's whole run. These are the pull-outs
//                            and the long sweeps; they only work next to a punch.
//   `cut(to)`                instant. Used once, at the reveal.
//
// The rule the sequence is built on is **punch in, glide out**: a hard move toward a new subject on
// the beat, then a slow one away from it. Everything in it was originally a single continuous
// approach on one bearing, closing 28 % per key, and on a desktop frame that reads as a still
// photograph — the subject barely changes size and nothing crosses the frame. Distance alone is not
// movement. What moves is a changed look target, a changed elevation and a changed lens.
//
// Nothing local is drawn for the ruling: Ledger, the Dray Yard and the belt are switched off, and
// the beat marked `here: true` cuts away and turns them all on at once. That cut is why the fleet
// can be thrown away on the same frame without the player seeing it go. Everything after it is
// framed on the real system, so the last third gets a station, a rock field and a rival's yard.
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
// Every beat now carries its own key. One without a `shot` would hold the move it is standing in,
// which is what the whole sequence used to do and is why it looked still.

const D = [1540, 400, 3520];

// Where Meridian's fleet sits, and the axis the camera walks in along. `face` is the group's own
// yaw, set so the ranks run across the approach and the hulls read as long shapes rather than
// head-on specks. Shared with js/world/scene.js, which builds the fleet at this anchor.
export const meridian = Object.freeze({
  at: Object.freeze([-2100, 300, 3200]),
  face: 0.62,
});

// Five of the fifteen hulls in world space, so a key can be aimed at one ship rather than at the
// formation's corner. They are the `ranks` layout in js/world/fleet.js run at the count and spacing
// showMeridian() uses, through that group's own transform — change either and these point at empty
// space. The group's small X and Z tilts matter: they lift the back rank about sixty metres, which
// is eleven degrees of frame at the distance the close keys work at.
const LEAD = Object.freeze([-2248, 275, 3197]);
const CORE = Object.freeze([-2466, 392, 2664]);
const FLANK = Object.freeze([-2970, 421, 2806]);
const BACK = Object.freeze([-2930, 490, 2162]);
const ESCORT = Object.freeze([-2693, 531, 1886]);

// A camera key: how far off the hull it is looking at, what bearing round it, and how far above its
// plane.
//
// Bearing has a band it has to stay in. The star sits at 148° and Ossian just under it, so a camera
// bearing near −57° is looking straight into both and every hull is backlit; past about −75° or
// −25° the planet leaves the frame and the fleet turns into scratches on black. Elevation has no
// such limit and is where most of the movement in here comes from — dropping under the ranks and
// rising back over them crosses far more of the frame than closing on them ever does.
function eye(dist, az, el, fov, look = CORE) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  return Object.freeze({
    pos: Object.freeze([
      Math.round(look[0] + dist * Math.sin(a) * Math.cos(e)),
      Math.round(look[1] + dist * Math.sin(e)),
      Math.round(look[2] + dist * Math.cos(a) * Math.cos(e)),
    ]),
    look, fov,
  });
}

// The same thing for the live system, where the subjects are at known places rather than round a
// fleet: a station, a rock field, the rival's yard.
const at = (pos, look, fov) => Object.freeze({ pos: Object.freeze(pos), look: Object.freeze(look), fov });

// Omitting `ms` is what makes one framing table serve both clocks: the move then takes exactly as
// long as the beat it is under, whether that beat is measured in the recording or in silence.
const glide = to => Object.freeze({ ...to, ease: 'linear' });
const cut = to => Object.freeze({ ...to, ms: 0 });
const punch = (ms, hit, drift = null) => Object.freeze({ ...hit, ms, ease: 'out', drift });

// Where the camera is standing when the gate's title card is over it, before the first beat starts
// moving. It is a framing rather than beat 0's own shot because beat 0 now moves off it.
export const opening = eye(4300, -57, 6, 38);

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
    shot: glide(eye(3450, -50, 10, 35)),
  }),

  // The case caption, then the size of the thing being sentenced — three numbers, delivered one at
  // a time with air between them, so they are three cards rather than one line. Each of the three
  // gets its own subject: the rank, the formation from above, and then a single hull.
  Object.freeze({
    id: 'docket', kind: 'record', at: 7.6, ms: 3600,
    over: 'Finding 44 · 119',
    text: 'The Alliance v. the Meridian Combine',
    shot: punch(1000, eye(2600, -60, 14, 42), eye(2150, -55, 11, 42)),
  }),
  Object.freeze({
    id: 'years', kind: 'record', at: 16.0, ms: 1400,
    over: 'Finding 44 · 119', text: 'Sixty-one years.',
    shot: punch(600, eye(880, -46, 6, 32, LEAD), eye(780, -41, 6, 32, LEAD)),
  }),
  Object.freeze({
    id: 'lanes', kind: 'record', at: 19.4, ms: 1400,
    over: 'Finding 44 · 119', text: 'Four hundred lanes.',
    shot: punch(600, eye(900, -66, 26, 36, BACK), eye(840, -71, 24, 36, BACK)),
  }),
  Object.freeze({
    id: 'carrier', kind: 'record', at: 22.9, ms: 1900,
    over: 'Finding 44 · 119', text: 'One carrier.',
    shot: punch(700, eye(190, -34, 5, 40, LEAD), eye(250, -26, 4, 40, LEAD)),
  }),

  Object.freeze({
    id: 'method', kind: 'record', at: 27.0, ms: 3200,
    over: 'Findings of fact · 1 of 3',
    text: 'Meridian never out-carried anyone.',
    shot: glide(eye(1400, -50, 12, 40)),
  }),
  Object.freeze({
    id: 'bought', kind: 'record', at: 32.2, ms: 3800,
    over: 'Findings of fact · 1 of 3',
    text: 'It bought the yards, then the lanes, then the people who set the tariffs.',
    shot: punch(800, eye(620, -62, 9, 38, FLANK), eye(540, -68, 8, 38, FLANK)),
  }),

  Object.freeze({
    id: 'wait', kind: 'record', at: 38.3, ms: 3000,
    over: 'Findings of fact · 2 of 3',
    text: 'Where it could not buy, it waited.',
    shot: glide(eye(1500, -58, 5, 40)),
  }),
  Object.freeze({
    id: 'dock', kind: 'record', at: 43.4, ms: 3400,
    over: 'Findings of fact · 2 of 3',
    text: 'A rival that cannot dock does not have to be beaten.',
    shot: punch(800, eye(360, -50, 4, 40, BACK), eye(310, -43, 3, 40, BACK)),
  }),

  // Under the ranks and back up over them. It is the biggest move in the ruling and it has the
  // longest beat in the ruling to make it in — nine and a half seconds of one continuous rise.
  Object.freeze({
    id: 'ration', kind: 'record', at: 48.9, ms: 3400,
    over: 'Findings of fact · 3 of 3',
    text: 'Coil filament was rationed to hold its price.',
    shot: glide(eye(1250, -46, -12, 44)),
  }),
  Object.freeze({
    id: 'burns', kind: 'record', at: 54.5, ms: 4200,
    over: 'Findings of fact · 3 of 3',
    text: 'Every lamp, every drive coil and every relay beacon in the outer systems burns filament.',
    shot: glide(eye(1900, -70, 30, 38)),
  }),

  Object.freeze({
    id: 'kalsa', kind: 'record', at: 64.0, ms: 3800, weight: true,
    over: 'Kalsa relay · the ninth year of the ration',
    text: 'The Kalsa beacon went dark and stayed dark for nine days.',
    shot: punch(900, eye(700, -60, 8, 26, LEAD), eye(480, -46, 4, 27, LEAD)),
  }),
  Object.freeze({
    id: 'aboard', kind: 'record', at: 73.0, ms: 4200, weight: true,
    over: 'Kalsa relay · the ninth year of the ration',
    text: 'Two thousand three hundred people were aboard the ships that could not see it.',
    shot: glide(eye(1150, -40, 14, 34)),
  }),

  // 80.6 is off the envelope, not off the transcript. The word lands 0.6 s later than the words
  // around it suggest, and a stamp is the one beat that must hit ON the voice rather than ahead of
  // it — GUILTY arriving early reads as the caption spoiling the line. The move under it is the
  // fastest in the sequence for the same reason.
  Object.freeze({
    id: 'guilty', kind: 'stamp', at: 80.6, ms: 2800,
    text: 'Guilty', sub: 'on all forty counts',
    shot: punch(550, eye(584, -60.6, 13.2, 29, meridian.at), eye(520, -55, 12, 29, meridian.at)),
  }),

  Object.freeze({
    id: 'sentence', kind: 'sentence', at: 85.7, ms: 3600,
    over: 'Order of divestiture',
    text: 'Meridian is reduced to one tenth of what it holds.',
    shot: glide(eye(1700, -50, 24, 40)),
  }),
  Object.freeze({
    id: 'twelve', kind: 'sentence', at: 92.8, ms: 3400,
    over: 'Order of divestiture',
    text: 'Twelve years. Lane by lane, system by system,',
    shot: punch(800, eye(760, -66, 16, 34, ESCORT), eye(700, -71, 15, 34, ESCORT)),
  }),
  Object.freeze({
    id: 'ready', kind: 'sentence', at: 98.2, ms: 3600,
    over: 'Order of divestiture',
    text: 'whether or not there is anyone ready to take them.',
    shot: glide(eye(3000, -58, 30, 44)),
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
    shot: cut(at([520, 1480, 1980], [260, 40, 460], 56)),
  }),
  // Fifteen seconds of instrumental with no caption on it. It is the longest the player goes
  // without being told anything and it is the best the game ever looks, so it is four moves rather
  // than one: down out of the reveal, on to Ledger, out to the rocks, and back off it all. A single
  // fifteen-second ease over that distance reads as a hang, not a hold.
  Object.freeze({
    id: 'drift', kind: 'blank', at: 104.6, ms: 1800,
    shot: glide(at([-140, 700, 1180], [200, 30, 380], 46)),
  }),
  Object.freeze({
    id: 'station', kind: 'blank', at: 109.6, ms: 1800,
    shot: punch(900, at([110, 128, 268], [356, -24, -26], 42), at([300, 104, 318], [520, -16, -70], 42)),
  }),
  Object.freeze({
    id: 'rocks', kind: 'blank', at: 114.0, ms: 2000,
    shot: punch(900, at([-830, 108, -1040], [-1340, 40, -1470], 44), at([-1090, 70, -1290], [-1520, 46, -1652], 44)),
  }),

  Object.freeze({
    id: 'reach', kind: 'land', at: 119.6, ms: 3000,
    text: 'Tamber Reach was released this year.',
    shot: glide(at([-560, 980, 1420], [-680, 40, -520], 50)),
  }),
  Object.freeze({
    id: 'corvain', kind: 'land', at: 123.5, ms: 3800,
    text: 'Corvain Drayage took seventy-one per cent of it in nine weeks.',
    shot: punch(900,
      at([D[0] - 980, D[1] - 90, D[2] - 1420], [D[0] - 260, D[1] - 60, D[2] - 640], 40),
      at([D[0] - 660, D[1] - 48, D[2] - 960], [D[0] - 80, D[1] - 24, D[2] - 260], 40)),
  }),
  Object.freeze({
    id: 'late', kind: 'land', at: 131.4, ms: 3600, last: true,
    text: 'You got here late.',
    shot: glide(at([-150, 26, 250], [130, 4, 60], 44)),
  }),
]);

export default Object.freeze({ beats, meridian, track, opening });

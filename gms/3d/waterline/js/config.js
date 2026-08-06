// Every tunable constant in the game. BUILD_PLAN's directory rule: if you are about to write
// `if (mode === 'classic')` or `if (kind === 'salvo')` outside this file, put the difference here
// instead and index it.
//
// NAMESPACED BY COMPONENT (REVIEW.md B9). A component writes only inside its own export and never
// edits another's — that is what keeps this file from being the merge-conflict sink it would
// otherwise be. Every export below already exists; fill in yours, do not add new top-level names
// without asking.
//
// Numbers here are the plan's, not measured. Retune freely; do not scatter them.

export const BOARD = {
  min: 6,
  max: 16,
  maxAspect: 2,
  maxShips: 12,
  occupancy: 0.35,        // total ship cells / (w*h)
  placeTries: 400,        // rejection-sampling attempts per ship before falling back to packRows
};

export const MODES = {
  classic: { w: 10, h: 10, fleet: [5, 4, 3, 3, 2] },
  custom: { w: 10, h: 10, fleet: [5, 4, 3, 3, 2] },
};

// footprint: cell offsets from the anchor. anchorInset is how far the legal anchor domain is
// pulled in from each edge, which is why a footprint is never clipped.
export const ORDNANCE = {
  shell: { size: 1, anchorInset: [0, 0], offsets: [[0, 0]], charges: null, recharge: 0 },
  heavy: {
    size: 4, anchorInset: [0, 1],           // [low, high] — r ∈ [0, h-2]
    offsets: [[0, 0], [0, 1], [1, 0], [1, 1]],
    charges: cells => Math.ceil(cells / 6), recharge: 8,
  },
  salvo: {
    size: 9, anchorInset: [1, 1],           // centre cell — r ∈ [1, h-2]
    offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]],
    charges: cells => Math.ceil(cells / 12), recharge: 0,
  },
};

export const LADDER = [
  { rung: 1, tier: 0, w: 8, h: 8, fleet: [4, 3, 3, 2] },
  { rung: 2, tier: 0, w: 8, h: 8, fleet: [4, 3, 3, 2] },
  { rung: 3, tier: 1, w: 8, h: 8, fleet: [5, 4, 3, 3, 2] },
  { rung: 4, tier: 1, w: 10, h: 10, fleet: [5, 4, 3, 3, 2] },
  { rung: 5, tier: 2, w: 10, h: 10, fleet: [5, 4, 3, 3, 2] },
  { rung: 6, tier: 2, w: 10, h: 10, fleet: [5, 4, 4, 3, 3, 2] },
  { rung: 7, tier: 3, w: 12, h: 12, fleet: [6, 5, 4, 3, 3, 2] },
  { rung: 8, tier: 4, w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2] },
];

export const AI = ['Lookout', 'Gunner', 'Fire Control', 'Admiralty', 'Ghost'];

// Ship length → hull kit. Three kits, scaled along X; not five silhouettes.
export const KIT_FOR_LENGTH = len => (len <= 2 ? 'destroyer' : len <= 4 ? 'cruiser' : 'battleship');

export const SHIP = {
  cellMetres: 12,                 // one grid cell of ship length, in world metres
  kits: {
    destroyer: { beam: 6, height: 7, guns: 2 },
    cruiser: { beam: 9, height: 10, guns: 3 },
    battleship: { beam: 13, height: 14, guns: 4 },
  },
  listMax: 0.22,                  // radians of list at full damage
};

export const TABLE = {
  cell: 0.152,                    // metres per grid cell on the physical table
  gap: 0.014,
  pegHeight: 0.032,
  height: 0.95,                   // table top above the bridge deck
  bezel: 0.100,                   // width of the metal frame around the plot surface
  chartBleed: 0.55,               // chart paper beyond the grid, in cells
  ghostColour: 0xffa63c,
  hitColour: 0xe8552f,
  missColour: 0x4a6b80,
  sunkColour: 0x8e2b1c,
  gridColour: 0x9fd8e8,
  gridChartColour: 0xffd9a0,
  latticeColour: 0xffcf8a,
};

// Pacing auto-degrades with turn count; the player can pin it back up in settings.
export const PACE = {
  full: { fromTurn: 1, ms: 9000 },
  short: { fromTurn: 4, ms: 4500 },
  instant: { fromTurn: 13, ms: 1400 },
  fastForward: 4,                 // hold-anywhere multiplier. Fast-forward, never skip
};

export const CINE = {
  // Scripted, never auto-exposed: a luminance readback is a GPU stall on mobile and reads as a bug.
  // The interior is not a dark room — C2's plotting table is self-luminous and holds the frame on
  // its own — so 1.55 rendered the bridge as a daylit cabin. One source for all three sequences
  // that cross the window (D23).
  exposure: { interior: 1.02, exterior: 0.90, ms: 600, lagMs: 260 },
  // cutAt is the fraction of the sequence at which the interior becomes the exterior.
  matchCut: { pegStretch: 8, cutAt: 0.52, interiorFrac: [0.18, 0.34], tolerance: 0.04 },
  shellMs: { full: 2600, short: 1800, instant: 0 },
  caption: { ms: 1400 },
};

// vfx `size` (1 | 4 | 9) → scale, lifetime, light intensity. Never a literal in a vfx module.
export const VFX = {
  1: { scale: 1.0, life: 1.6, light: 1.0, cards: 1.0 },
  4: { scale: 1.7, life: 2.2, light: 2.0, cards: 1.6 },
  9: { scale: 2.6, life: 3.0, light: 3.4, cards: 2.4 },
  splashHangMs: 420,
  fireSeconds: 22,
};

// C3 — the dramatised sea-side arrangement (js/world/fleet.js).
export const FLEET = {
  grid: { w: 10, h: 10 },
  cellMetres: 55,          // one grid cell of OCEAN, not of ship. Ships are much shorter than this
  standoff: 900,           // metres between the two fleets' frames
  heroRange: 600,          // past this a laid-out ship drops from hero detail to mid
  markerScale: 2.4,        // radius of the red hit indicator on your own hull
  markerFade: 6,           // seconds before it fades
};

// C6 — the look-around beat. Brief step 2 / REVIEW.md B3: drag to pan, then EASE back to the
// board after idle. A hard snap on a phone reads as a bug. No owner has built it yet.
export const LOOK = {
  idleMs: 2600,            // no input for this long before the camera returns
  easeMs: 900,
  maxYaw: 0.55,            // radians either side of the board
  maxPitch: 0.3,
  sensitivity: 0.0022,     // radians per CSS pixel dragged
};

// C7 — screens, HUD, and the pose the game is played from (D25).
export const UI = {
  toastMs: 2600,
  turnGapMs: 260,              // dead air between one side's beat ending and the next starting
  fastForward: PACE.fastForward,
  // The exposure `bridge_table` is authored at. C6's sequences rest at CINE.exposure.interior,
  // which is graded for the sequence and not for a board you have to read for a minute at a time.
  aimExposure: 0.92,

  // The play camera. Solved rather than authored: the board is 6×6 to 16×16 and the viewport is
  // anything from 390×844 to a desktop window, so what is fixed is the framing, not the pose.
  //
  // `fill`, `pad` and `centreY` are fractions of the WHOLE frame, measured on the board's projected
  // bounding box. fill is not 1.0 on purpose: the room, the window band and the crew are the game's
  // whole look, and a board fitted edge to edge deletes all three. BUILD_PLAN §7.7 asks for the
  // table in the lower middle under a band of window, and these numbers are that as arithmetic.
  //
  // Portrait cannot have the same composition and the reason is geometric, not a taste call: the
  // deckhead is 1.73 m above the chart, so the camera cannot climb, and a 1.66 m board seen from
  // 3 m away at 25° is a strip whatever the field of view. So portrait sits the board higher in
  // frame instead — every degree the aim drops below that swaps window for deckhead.
  camera: {
    landscape: { fov: 46, pitch: 44, fillW: 0.74, fillH: 0.54, centreY: -0.42, padBottom: 0.02, padTop: 0.06 },
    // Portrait runs a wide fov deliberately. Fixing the board's width fraction fixes d·tan(fov/2),
    // so the only way to make the board TALLER on screen is a shorter d — which needs a wider fov.
    // Measured: 62° puts 17% of the frame height on the board, 72° puts 23%.
    portrait: { fov: 72, pitch: 40, fillW: 0.94, fillH: 0.46, centreY: -0.44, padBottom: 0.14, padTop: 0.06 },
    fovMax: 76,
    ceiling: 1.30,             // metres above the chart before the camera is in the deckhead
    // ROOM.d is 7.2 and the table sits at z +0.15, so the after bulkhead is 3.75 m behind it.
    // 3.40 keeps a hand's width of clearance and is what lets a 10×10 board fit portrait at all.
    back: 3.40,
    handOverMs: 620,           // ease from wherever a sequence left the camera to the play pose
    // Handheld float held between turns. Deliberately smaller than a sequence's: the aim term is a
    // lateral offset of the look point, and at play distance C6's 0.12 m swings the board ±0.09 of
    // the frame — enough to move a cell out from under a thumb mid-tap.
    sway: { pos: 0.025, aim: 0.05, hz: 0.11 },
  },

  // The menu camera: the fleet at sea, turning. Nothing is scored here.
  menu: { radius: 88, height: 30, fov: 50, spin: 0.045 },

  // A stored match older than this is dropped rather than offered — nobody remembers the position.
  resumeMaxDays: 30,
};

export const SEA_STATES = [
  { label: 'glass', amp: 0.25, chop: 0.2 },
  { label: 'slight', amp: 0.7, chop: 0.5 },
  { label: 'moderate', amp: 1.5, chop: 0.85 },
  { label: 'rough', amp: 2.8, chop: 1.2 },
];

export const SAVE_KEY = 'waterline';

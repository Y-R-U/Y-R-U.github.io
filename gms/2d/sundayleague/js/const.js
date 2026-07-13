// ---- world & tuning constants ----

// pitch playing area (px). ~6.5 px per metre of a 105x68m pitch, portrait.
export const PITCH_W = 680;
export const PITCH_H = 1050;
export const MARGIN = 96;               // out-of-play surround (crowd, boards)
export const WORLD_W = PITCH_W + MARGIN * 2;
export const WORLD_H = PITCH_H + MARGIN * 2;
export const PX = MARGIN;               // pitch left
export const PY = MARGIN;               // pitch top
export const CX = WORLD_W / 2;
export const CY = WORLD_H / 2;

export const GOAL_W = 130;              // goal mouth width (post centres)
export const GOAL_DEPTH = 30;           // net depth (visual)
export const POST_R = 2.5;              // post/bar half-thickness (collision)
export const BAR_Z = 34;                // crossbar height in z units
export const BOX_W = 340, BOX_H = 150;  // penalty box
export const SIX_W = 170, SIX_H = 55;   // six yard box
export const SPOT_DIST = 105;           // penalty spot from goal line

// player physics
export const P_SPEED = 205;             // sprint px/s (modified by attrs/pitch)
export const P_ACCEL = 900;             // px/s^2 steering accel
export const P_RADIUS = 9;
export const CONTROL_RADIUS = 15;       // ball trap distance
export const DRIBBLE_AHEAD = 13;        // ball carried offset
export const SLIDE_SPEED = 430;
export const SLIDE_TIME = 0.42;
export const SLIDE_RECOVER = 0.5;
export const FALL_TIME = 1.0;
export const TAKEOVER_BLEND = 4.5;      // control blend rate (per second)

// ball physics
export const GRAVITY = 780;             // z px/s^2
export const BOUNCE = 0.55;
export const BALL_R = 5;
export const KICK_REGAIN_CD = 0.38;     // can't re-trap own kick for this long

// kick powers
export const PASS_SPEED_MIN = 330;
export const PASS_SPEED_MAX = 620;
export const SHOT_SPEED_MIN = 600;
export const SHOT_SPEED_MAX = 980;
export const SHOT_RANGE = 430;          // will attempt shot when aimed at goal within this
export const PASS_CONE = 0.62;          // radians half-angle for pass targeting
export const CHARGE_TIME = 0.75;        // seconds to full power
export const AFTERTOUCH_TIME = 0.4;     // spin window after kick

// match
export const HALF_CHOICES = [60, 90, 120, 180, 240];
export const DEFAULT_HALF = 120;        // real seconds per half
export const KEEPER_HOLD = 1.1;         // seconds keeper holds before distributing

// pitch conditions: friction = ground vel damping/s, slideMul = slide distance
export const PITCH_TYPES = {
  grass: { name: 'Lush Grass',  friction: 1.05, slideMul: 1.0,  speedMul: 1.0,  weather: null },
  wet:   { name: 'Rain-Soaked', friction: 0.78, slideMul: 1.25, speedMul: 0.97, weather: 'rain' },
  mud:   { name: 'Mud Bath',    friction: 1.55, slideMul: 0.8,  speedMul: 0.88, weather: 'rain' },
  ice:   { name: 'Frozen Over', friction: 0.45, slideMul: 1.7,  speedMul: 0.93, weather: 'snow' },
  dry:   { name: 'Sun-Baked',   friction: 0.9,  slideMul: 1.05, speedMul: 1.02, weather: null },
};

// difficulty presets -> AI modifiers (rating fills in the rest).
// cardThem/cardYou: the ref's mood. on hard the opposition gets away with more.
export const DIFFICULTY = {
  easy:   { speed: 0.92, react: 0.7, err: 1.6, keeper: 0.75, cardThem: 1.55, cardYou: 0.65 },
  normal: { speed: 1.0,  react: 1.0, err: 1.0, keeper: 1.0,  cardThem: 1.0,  cardYou: 1.0 },
  hard:   { speed: 1.06, react: 1.25, err: 0.6, keeper: 1.2, cardThem: 0.5,  cardYou: 1.3 },
};

// camera view heights (world px visible vertically)
export const ZOOMS = { near: 430, normal: 520, far: 640 };
export const RESTART_ZOOM = 1.32;       // pull back at set-pieces so you can see your team
export const GOAL_BALL_LINGER = 1.1;    // stay on the ball in the net before the celebration
export const GOAL_REPLAY_TAIL = 1.2;    // keep filming after the goal so the replay ends in the net
export const REPLAY_HOLD = 1.0;         // freeze on the last replay frame for a beat

// discipline: fraction of awarded fouls that get a card
export const YELLOW_CHANCE = 0.3;       // + more for reckless pace
export const RED_CHANCE = 0.012;        // straight red is rare: + more for reckless / last man
export const RED_CHANCE_MAX = 0.06;
export const BOOKINGS_OFF = 3;          // third booking = off (two yellows are survivable)
export const MIN_PLAYERS = 8;           // never send off below this (ref abandons at 7)

// 4-4-2, attacking frame: x 0..1 across pitch width, y 0=own goal line, 1=opponent goal line
export const FORMATION = [
  { x: 0.50, y: 0.035, role: 'GK' },
  { x: 0.15, y: 0.22, role: 'DF' }, { x: 0.38, y: 0.185, role: 'DF' },
  { x: 0.62, y: 0.185, role: 'DF' }, { x: 0.85, y: 0.22, role: 'DF' },
  { x: 0.13, y: 0.50, role: 'MF' }, { x: 0.38, y: 0.455, role: 'MF' },
  { x: 0.62, y: 0.455, role: 'MF' }, { x: 0.87, y: 0.50, role: 'MF' },
  { x: 0.40, y: 0.73, role: 'FW' }, { x: 0.60, y: 0.73, role: 'FW' },
];
// how strongly each role drifts with the ball
export const ROLE_PULL = { GK: 0.0, DF: 0.22, MF: 0.34, FW: 0.38 };

export const SAVE_KEY = 'sundayleague.career.v1';
export const SETTINGS_KEY = 'sundayleague.settings.v1';

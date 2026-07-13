// LONGSHOT — all tuning in one place.

export const BALLISTICS = {
  g: 9.81,                 // m/s² gravity
  dragK: 0.0005,           // quadratic drag coeff (m⁻¹): a = -k·|v_rel|·v_rel
  step: 1 / 240,           // sim step (s)
  maxFlight: 6,            // s before a round is written off
  soundSpeed: 343,         // m/s — panic arrives with the crack, not the shot
  headRadius: 0.14,        // m
  torsoRadius: 0.24,       // m (capsule)
};

export const SWAY = {
  base: 0.0026,            // rad amplitude at sway stat 1.0, unscoped-equivalent
  breathHz: 0.34,          // slow breathing wobble
  jitterHz: 2.1,           // fine tremor
  holdMul: 0.16,           // sway multiplier while holding breath
  emptyMul: 2.3,           // sway multiplier while winded
  fireKick: 0.011,         // rad kick per shot (scaled by rifle sway)
};

export const BREATH = { max: 3.4, recover: 1.35, windedFor: 2.2 };

export const PANIC = {
  loudRadius: 70,          // m — unsuppressed impact/muzzle scare radius
  quietRadius: 16,         // m — suppressed: only the impact noise scares
  fleeSpeed: 4.6,
  targetEscapeTime: 26,    // s for an alerted target to reach escape and void the contract
};

export const EXPOSURE = {
  perLoudShot: 13,         // guards triangulate every extra loud shot…
  perSeen: 34,             // a guard looking straight at your muzzle flash
  decay: 3.4,              // …but a patient shooter cools off between them
  failAt: 100,             // (≈7 loud shots back-to-back, or many spaced out)
};

export const SCORE = {
  kill: 1000, head: 500, distPerM: 1.5, distFrom: 150, moving: 400,
  streak: 300, streakWindow: 4, noMiss: 800, civilian: -2500,
  timeBonusPerS: 25, medals: { gold: 1.0, silver: 0.7 },  // × mission par
};

export const ECON = { cashPerScore: 0.1, firstClear: 400 };

export const RIFLES = [
  { id: 'r700', name: 'R700 "OLD FAITHFUL"', price: 0, v0: 520, sway: 1.0, chamber: 1.7, mag: 5,
    desc: 'The rifle that never let anyone down — as long as they did their part. Honest glass-bedded bolt gun.' },
  { id: 'kestrel', name: 'KESTREL M24', price: 2400, v0: 640, sway: 0.9, chamber: 1.5, mag: 5,
    desc: 'Service-grade system. Flatter arc, faster bolt, fewer excuses.' },
  { id: 'vantage', name: 'VANTAGE .300', price: 5200, v0: 720, sway: 0.72, chamber: 1.4, mag: 6,
    desc: 'Match-grade barrel and a stock that fits like a handshake. The connoisseur’s working gun.' },
  { id: 'dmr8', name: 'SILENCE DMR-8', price: 7500, v0: 580, sway: 0.95, chamber: 0.45, mag: 12, semi: true,
    desc: 'Semi-auto designated marksman rifle. When there are more problems than seconds.' },
  { id: 'whisper', name: 'GHOST-X WHISPER', price: 9800, v0: 560, sway: 0.66, chamber: 1.25, mag: 6, suppressed: true,
    desc: 'Integrally suppressed. The city hears a cough two streets over, if it hears anything at all.' },
  { id: 'longbow', name: 'LONGBOW AMR .50', price: 14000, v0: 850, sway: 1.3, chamber: 2.3, mag: 4, heavy: true,
    desc: 'Anti-materiel. Glass, vests, car doors and thin walls are a rumour to this thing.' },
  { id: 'meridian', name: 'MERIDIAN PROTOTYPE', price: 25000, v0: 980, sway: 0.5, chamber: 0.9, mag: 8, heavy: true, suppressed: true,
    desc: 'One bench-made rail rifle out of a lab that officially does not exist. Silent, flat, final.' },
];

export const SCOPES = [
  { id: 'mk2', name: 'IRON MK2 4–8×', price: 0, zmin: 4, zmax: 8,
    desc: 'Scratched, zeroed, dependable. Mil-dot reticle, no electronics.' },
  { id: 'hawk', name: 'HAWK 6–14×', price: 1800, zmin: 6, zmax: 14, rangefinder: true,
    desc: 'Laser rangefinder in the housing — the first number that matters, instantly.' },
  { id: 'falcon', name: 'FALCON 8–20×', price: 4600, zmin: 8, zmax: 20, rangefinder: true, windmeter: true,
    desc: 'Ballistic computer reads crosswind at the target, not at your cheek.' },
  { id: 'owl', name: 'OWL T5 10–28×', price: 11000, zmin: 10, zmax: 28, rangefinder: true, windmeter: true, smart: true, nv: true,
    desc: 'Tier-5 smart optic: predicted-impact dot, low-light intensifier. Cheating, in a scope.' },
];

export const AMMOS = [
  { id: 'fmj', name: 'FMJ MATCH', price: 0,
    desc: 'Standard match rounds. Glass deflects them; vests stop them.' },
  { id: 'ap', name: 'AP HARDENED', price: 3200, ap: true,
    desc: 'Tungsten core. Flies true through glass and body armour.' },
  { id: 'sub', name: 'SUBSONIC', price: 2600, sub: true, v0mul: 0.62,
    desc: 'Slow, quiet, heavy drop. With a suppressed rifle: a ghost round.' },
];

export const GEARS = [
  { id: 'sling', name: 'STEADY SLING', price: 2200, desc: 'Loop-sling shooting position. Sway −25%.' },
  { id: 'lungs', name: 'APNEA TRAINING', price: 2000, desc: 'Free-diver breathing drills. Hold breath 60% longer.' },
  { id: 'binos', name: 'LRF BINOCULARS', price: 1200, desc: 'Rangefinder works unscoped — read distances while you scan.' },
  { id: 'pulse', name: 'PULSE MONITOR', price: 1500, desc: 'Bio-tracker chip: marked targets show armour and kill confirmation.' },
  { id: 'ghillie', name: 'GHILLIE WRAP', price: 2800, desc: 'Position camouflage. Exposure builds 45% slower.' },
  { id: 'drone', name: 'SPOTTER DRONE', price: 3400, desc: 'Pre-mission flyover auto-marks every primary target.' },
];

// time-of-day looks — sky gradient, fog, lights
// Light levels are gameplay, not decoration: you must be able to SEE a man in a
// doorway 400 m out. Ambient/hemi are deliberately generous so surfaces facing
// away from a low sun still read, instead of going to silhouette.
export const TIMES = {
  day:  { skyTop: 0x4a7fc4, skyBot: 0xb8d4e8, fog: 0xa9c2d4, fogFar: 2600, sun: 0xfff2d8, sunI: 2.4,
          amb: 0xb8c8d8, ambI: 1.25, ambient: 0.5, sunPos: [0.5, 0.8, 0.3], litP: 0.06, em: 0.0, exposure: 1.05 },
  dusk: { skyTop: 0x2b3a63, skyBot: 0xe8925a, fog: 0xc98d6b, fogFar: 2200, sun: 0xffbe74, sunI: 2.5,
          amb: 0xb9a6c0, ambI: 1.2, ambient: 0.62, sunPos: [0.85, 0.3, 0.45], litP: 0.55, em: 1.0, exposure: 1.22 },
  night:{ skyTop: 0x060a18, skyBot: 0x131f3a, fog: 0x11203a, fogFar: 1900, sun: 0x9fb2d8, sunI: 0.95,
          amb: 0x6c82ad, ambI: 1.0, ambient: 0.62, sunPos: [-0.4, 0.6, -0.3], litP: 0.72, em: 1.35, exposure: 1.45 },
  rain: { skyTop: 0x3a4450, skyBot: 0x7a8794, fog: 0x717d89, fogFar: 1500, sun: 0xcfd8e0, sunI: 1.3,
          amb: 0xa3aeb9, ambI: 1.2, ambient: 0.6, sunPos: [0.3, 0.7, 0.2], litP: 0.35, em: 0.7, exposure: 1.15 },
};

export const CITY = {
  block: 46, road: 14, grid: 13,        // 13×13 blocks ≈ 780 m across
  sidewalk: 3.2,
};

// The pitch limits are gameplay, not comfort: from a 38 m roof you must be able
// to look at the pavement DIRECTLY BELOW you (−80°), or a mark in the doorway at
// the foot of your own building is unfindable. Yaw is unclamped — full 360°.
export const VIEW = {
  fov: 55, near: 0.1, far: 4000,
  sensUnscoped: 0.0032, minPitch: -1.4, maxPitch: 0.8,
};

// Walking the perch. The shooter is never a fixed tripod: he can pace the roof,
// toe the coping to look straight down, and slide left/right for parallax around
// whatever is in the way.
export const MOVE = {
  speed: 2.9,              // m/s
  scopedMul: 0.4,          // creeping while glassed
  accel: 16, damp: 11,
  eyeH: 1.62,              // eye above the surface underfoot
  // He may stand with his TOES on the lip. Anything more than a few cm back and
  // the coping he is standing on grazes his own downward sightline (atan(1.62 /
  // edge) must stay steeper than the pitch limit), which puts a strip of his own
  // roof exactly where the pavement below should be.
  edge: 0.06,
  coping: 0.32,            // the rim curb you step UP onto
  copingW: 0.55,           // its width, in from the rim
  stepUp: 0.5,             // anything shorter than this you walk on top of
  climb: 4.0,              // m/s the feet rise/fall onto a ledge
  bobHz: 1.75, bobAmp: 0.022,
};

export const FLAGS = new URLSearchParams(location.search);
export const LITE = FLAGS.has('lite');

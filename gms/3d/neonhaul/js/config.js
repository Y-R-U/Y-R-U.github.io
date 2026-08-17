// Every tuning number, the two quality presets, and URL-flag parsing. Nothing here imports.

export const WORLD_SEED = 0x4e454f4e;

export const VARIANTS = ['deepnight', 'predawn', 'daysmog', 'duskburn', 'stormnight'];

// §2.5. Each preset is flat and is handed to every module once as `Q`; a mid-session quality
// change is a rebuild, not a scatter of `if (low)`.
const HIGH = {
  name: 'high',
  pixelRatio: 2.0,
  msaa: 2,
  bloom: true,
  halos: false,
  haloCap: { signs: 0, strips: 0, strobes: 0 },
  haloScale: 1.8,
  grade: true,
  ringNear: 2,
  ringNearRadius: 512,
  ringMid: 6,
  ringFar: 4,
  fogFar: 900,
  rain: 2500,
  trafficNear: 26,
  trafficFar: 900,
  reflect: 'full',
  signDensity: 1.0,
  silhouettes: true,
  envSize: 128,
  atlasSize: 1024,
  dashFps: 12,
  holoFps: 4,
  minimapFps: 15,
  shafts: 4,
  zonesDrawn: 3,
};

const LOW = {
  name: 'low',
  pixelRatio: 1.25,
  msaa: 0,
  bloom: false,
  halos: true,
  haloCap: { signs: 400, strips: 500, strobes: 300 },
  haloScale: 1.8,
  grade: true,
  ringNear: 1,
  ringNearRadius: 256,
  ringMid: 4,
  ringFar: 0,
  fogFar: 420,          // not 520 — forced by the §3.2 fog/LOD interlock
  rain: 900,
  trafficNear: 10,
  trafficFar: 320,
  reflect: 'signs+strips',
  signDensity: 0.55,
  silhouettes: false,
  envSize: 64,
  atlasSize: 512,
  dashFps: 6,
  holoFps: 2,
  minimapFps: 8,
  shafts: 1,
  zonesDrawn: 2,
};

export function preset(low) { return { ...(low ? LOW : HIGH) }; }

// §4.6 exposure lives on the grade pass, never on the renderer (see §2.3).
// P1a replaced P0's placeholder pass (obligation T3) and moved four of these to §4.6's numbers:
// the split-tone pair are now §4.6's teal/magenta as ADDITIVE pushes, the vignette is §4.6's
// 0.28 rather than the placeholder's 0.34, and the dither is the amplitude in 1/255ths so that
// §4.6's "+/- 1/255" is literally what the shader does.
export const GRADE = {
  exposure: 1.05,
  lift: [0.008, 0.010, 0.016],
  gain: [1.02, 1.00, 1.06],
  splitShadow: [0.051, 0.165, 0.200],     // 0x0d2a33 — shadows toward teal
  splitHighlight: [0.165, 0.051, 0.122],  // 0x2a0d1f — highlights toward magenta
  splitAmount: 0.16,
  vignette: 0.28,
  dither: 1.0,          // amplitude in 1/255ths: the shader applies +/- this
  saturation: 1.06,
};

// §3.2.1 — fogNear/fogFar, uClearMul, uSmogMul and ringNear are ONE system. Change any one of
// these and the other four must be recomputed; budget.mjs re-checks C1 from this table alone,
// with no rendering. LOW overrides every variant with 420 m because its R0 is only 256 m.
// (P1a's sky.js owns the fog COLOURS; the distances live here because the gate reads them.)
export const FOG = {
  clearMul: 1.0,
  smogMul: 2.2,
  variants: {
    deepnight:  { near: 60, far: 900 },
    predawn:    { near: 60, far: 900 },
    duskburn:   { near: 60, far: 760 },
    stormnight: { near: 45, far: 560 },
    daysmog:    { near: 60, far: 520 },
  },
  lowFar: 420,
  lowNear: 60,
};

export const CAMERA = { fov: 62, near: 0.5, far: 4000 };

// §4.4. The threshold is in PRE-tone-map linear scene light, because ACES moved into the grade
// pass which runs after bloom.
//
// **0.90 blooms nothing, and §4.4's derivation of it has an error in it.** The table prices a
// source by its BRIGHTEST CHANNEL ("a neon sign at iIntensity 1-4 → 1.0-4.0") but
// LuminosityHighPassShader thresholds on LUMINANCE, `dot(rgb, vec3(0.299, 0.587, 0.114))` — and
// this game's sources are saturated by rule ("every saturated colour in frame is a light
// source"). A magenta 0xff2a9d at intensity 1.5 peaks at 1.50 in red and carries a luminance of
// 0.53. A pure blue source would need intensity 8 to reach 0.90. So the whole neon layer sat
// under the threshold and the composer bloom was, in practice, off.
//
// Measured (canyon_dive, HIGH, dpr 1, 16x12 luminance grid of the composited frame):
//
//   threshold   frame mean   brightest cell
//   0.90        0.148        0.276      ← nothing crosses; bloom is inert
//   0.45        0.170        0.390
//   0.20        0.357        0.681
//   0.05        0.468        0.781      ← the fog starts blooming, which is wrong
//
// 0.55 is the value, chosen by rendering the candidates and looking at them rather than by the
// arithmetic that produced 0.90:
//   0.30  everything blooms, including the body of every lit window — the facades turn into a
//         wash and the window grid (§3.10 #1's primary scale cue) stops being readable
//   0.55  the neon signs, the edge strips, the strobes and the BRIGHTEST window repeats bloom;
//         the median window does not; near-black stays near-black
// It is 6.5x above the brightest non-source (the daysmog sky dome at 0.084 linear), so §4.4's
// actual constraint — nothing that is not a light source may bloom — holds with more margin than
// the old number had, while the sources it was supposed to catch now actually cross it.
//
// `strength` is the base; sky.js scales it per variant (deepnight 0.95 … stormnight 1.05).
export const BLOOM = { strength: 0.85, radius: 0.55, threshold: 0.55, maxW: 768, maxH: 1664 };

// ── DECISIONS decision 10 — the far-haze tunable ───────────────────────────
//
// ONE number. It is the display-space gamma of §4.6's grade pass (P1a wired `uGamma` and left it
// at 1.0); a gamma below 1 lifts the mid-dark band the far plane lives in without touching either
// end — 0.0 stays 0.0 and a neon source at 1.0 stays 1.0 — which is exactly the lever decision 10
// asks for and the reason it is a gamma rather than a lift.
//
// MEASURED here, by the same probe gates_p1a §4.1.1 uses — the D1/D2/D3 unlit silhouettes at
// 300 / 600 / 850 m in `deepnight`, displayed luminance off the composited frame:
//
//   gamma   D1(300m)  D2(600m)  D3(far)   band = D3-D1
//   1.00    0.0356    0.0659    0.0897    0.0541    ← P1a's state
//   0.86    0.0374    0.0851    0.1166    0.0793    ← PROVISIONAL, decision 10's 0.10-0.12
//   0.78    0.0393    0.1010    0.1375    0.0982
//   0.72    0.0416    0.1160    0.1564    0.1149
//
// Correction to decision 10's premise, since the number it quotes drives the target: **0.055 was
// the BAND SPAN, not the far plane's luminance.** gates_p1a's own note says so verbatim — "the
// whole displayed range of the deepnight fog band is ~0.055" — and the far plane at gamma 1.0
// actually reads 0.0897. The decision's instruction ("land far haze around 0.10-0.12, roughly
// double our current value") therefore points at two different numbers; this file follows the
// ABSOLUTE target of 0.10-0.12 rather than the doubling, because that is the one stated against
// the plate. 0.86 lands 0.1166 and widens the band by 47 %, which is what §3.0's depth-banding
// mechanism actually needed.
//
// SWEEP THIS ONE NUMBER AND NOTHING ELSE if a critic round says flat / hazy / no depth
// separation, and record the movement in SCORES.md. `__game.setHaze(g)` moves it live.
// SWEPT at round 2 (SCORES.md). Round 1's differences list named distance separation on both
// shots — "nothing shifts in hue or contrast between near and far", "sky and background tower sit
// at almost the same value, so depth collapses" — which is decision 10's stated trigger.
//
// The sweep measured the frame as well as the probe, and that is what moved the number: at 0.86
// the fog_city frame's mean luminance is 57.2/255 against plate 746850_01's 48.7, i.e. we were
// 17 % BRIGHTER than the plate overall while still being flat. 0.94 lands 50.3 against 48.7 — a
// 3 % error — and keeps the far plane at 0.1000, the bottom of decision 10's own 0.10-0.12 band,
// with the depth band still 18 % wider than P1a's. Lifting the haze further was making the frame
// paler without making it deeper.
export const HAZE = { gamma: 0.94 };

// ── DECISIONS decision 11 — the altitude-gated aerial vista ────────────────
//
// "I would like to be able to fly high, but most of the game would not involve flying high."
// So the vista is bought with two ramps that are BOTH ZERO below `y0`, and the common path pays
// one mix() in the fog shader and one lerp on the CPU. Nothing else changes: no extra draws, no
// extra streaming, no second LOD scheme, no touching §3.2.1's static table.
//
//   rayMean   the fog's height term switches from "the fragment's height" to "the mean height of
//             the camera->fragment segment". Looking DOWN from 600 m at a tower base, the ray is
//             in clean air for most of its length and only enters the murk at the end — the
//             ground-level model charges it the full smog multiplier for the whole distance, and
//             that is why the city vanishes from above. At street level the camera and what it
//             is looking at are at the same height, so the mean IS the fragment height and the
//             term is a no-op. This is the whole trick.
//   farMul    the linear fog's far distance, scaled. LOD2 already covers +/-4 km (ringFar 4), so
//             the geometry is there and only the haze was hiding it.
//
// Both ramp over y0->y1, ~4 s of climb at §6.2's rates, which is invisible in motion.
export const AERIAL = { y0: 340, y1: 640, farMul: 2.6, rayMean: 1.0 };

// ── §6 — the flight model ──────────────────────────────────────────────────
//
// §6.2's table verbatim, plus the handful of numbers §6.3 states in prose. The one idea the
// whole block serves is §6's: **attitude is a decoration, not a state variable.** `bank` and
// `vpitch` below are read by the camera and (at P5) by the craft mesh; nothing in flight.js's
// velocity path ever reads them, and gates_p4 asserts exactly that by forcing them to an extreme.
//
// Two numbers are NOT in §6.2 and are derived rather than invented:
//   OVER_DECAY   §6.2 says "MAX_* are hard clamps". Snapping an axis down the instant its clamp
//                drops (boost released, or a 35 deg climb levelled out, which re-decomposes 35 m/s
//                of climb onto an axis capped at 22) is a visible jolt. The clamp is therefore
//                one-sided: you can never accelerate past it, and if you are already past it you
//                bleed back at 34 m/s^2. The bound is still hard; only the approach is soft.
//   HARD_FLOOR   §6.3 item 5 gives a soft assist below 4 m but no floor. Without one a fast dive
//                puts the camera under the ground plane, which is a fail state wearing a hat.
export const FLIGHT = {
  MAX_FWD: 62, MAX_BOOST: 105, MAX_REV: 18, MAX_STRAFE: 26, MAX_VERT: 22,
  ACC_FWD: 46, ACC_STRAFE: 30, ACC_VERT: 22,
  DAMP_ACTIVE: 0.9, DAMP_RELEASE: 4.5, DAMP_VERT_RELEASE: 6.0,
  STOP_SNAP: 0.6,
  OVER_DECAY: 34,
  ALT_HOLD_DELAY: 0.25, ALT_HOLD_KP: 3.2, ALT_HOLD_KD: 3.6, ALT_HOLD_CLAMP: 14,
  YAW_SENS: 0.0042, PITCH_SENS: 0.0034,
  PITCH_CLAMP: 62,          // degrees, camera
  THRUST_PITCH: 35,         // degrees, the thrust vector — separately clamped (§6.1)
  LOOK_SMOOTH: 22,
  HEADING_CHASE: 2.6,       // rad/s, the craft heading chasing the camera yaw
  ALT_MIN: 4, ALT_MAX: 760, ALT_WARN: 620,
  FLOOR_ASSIST: 20, CEIL_ASSIST: 18, HARD_FLOOR: 2.0,
  // §6.3 item 1 — cosmetic only.
  BANK_K: 0.022, BANK_MAX: 0.50, VPITCH_K: 0.010, VPITCH_MAX: 0.22, ATT_DAMP: 5.0,
  // §6.3 items 3 and 4.
  HULL_R: 3.2, REPEL_RANGE: 12, REPEL_ACC: 18, RESTITUTION: 0.35,
  // NOT in §6.3 — the tangential half of the repulsion, as a fraction of REPEL_ACC. §6.3's normal
  // term alone parks a dead-on approach against the facade; see flight.js repel() for the measured
  // before/after. This is the number that turns "I hit a wall" into "the tower went past me".
  SLIDE: 1.0,
  UNSTICK_AFTER: 0.8, UNSTICK_ACC: 26,
  SHAKE: 0.18,
  // input
  STICK_PX: 64, DEADZONE: 0.09,
  // camera rigs. `chase` is §6.5's default in save.js and becomes the shipping default at P5;
  // P4 boots in `cockpit` because there is no craft mesh yet and a 9.5 m boom behind an invisible
  // hull makes the collision hull read as an invisible wall. One line in save.js when P5 lands.
  CHASE: { dist: 9.5, height: 3.0, lag: 9.0, rollMul: 0.15 },
  // `pitchMul` MUST match what camera.js applies to the camera (`f.pitch + f.vpitch * 0.35`).
  // The cabin is anchored to the craft, so any difference between the two is RELATIVE pitch
  // between the dash and the view: at the full 0.22 rad clamp a mismatch of 0.65 swings the
  // instrument panel 8.2 deg, which on a portrait phone is 13 % of the frame and pushed the whole
  // dash off the bottom edge. Caught in the first portrait capture.
  COCKPIT: { height: 0.9, rollMul: 0.30, pitchMul: 0.35 },
  FOV: [58, 78],
  SENS: [0.5, 2.0],
};

// §5.2's `top m/s` column. P5 owns the craft themselves; the flight model only needs the speed,
// and §6.2 derives everything else from it — `ACC_FWD = 0.74 x MAX_FWD` so every craft has the
// same 1.35 s feel from rest to cruise, and boost scales in the same ratio as `wisp`'s 105/62.
export const CRAFT_SPEED = { wisp: 62, kestrel: 66, lance: 84, drayman: 54, nocturne: 72, mammoth: 46 };
export const CRAFT_DEFAULT = 'wisp';

// §7.1's six zone types, as data. P7a owns zone PLACEMENT and the world volumes; P6 needs the
// colour and the glyph now because §8.6's minimap dot and §8.3's right holo panel both carry them,
// and §7.1's rule is that **colour is never the only identifier** — six types including green, red
// and amber is unusable for ~8 % of male players, and the glyph closes that at zero cost. One
// table, so a zone dot, a HUD marker and a panel can never disagree about what a DROP looks like.
// `RUSH`, not `HOT`: there is no heat system (DECISIONS decision 6).
export const ZONE_TYPES = {
  PICKUP:   { color: 0x35d6e8, glyph: '▽', label: 'PICKUP' },
  DROP:     { color: 0x6cff9c, glyph: '△', label: 'DROP' },
  CHARGE:   { color: 0xffb04a, glyph: '◇', label: 'CHARGE' },
  WORKSHOP: { color: 0xff3fa4, glyph: '⬡', label: 'WORKSHOP' },
  HUB:      { color: 0xdfeaff, glyph: '⌂', label: 'HUB' },
  RUSH:     { color: 0xff2b3a, glyph: '⚡', label: 'RUSH' },
};

// §8 — the HUD's own numbers, in the one place the game and its gates both read.
export const HUD = {
  DASH_HZ: 12, DASH_HZ_LOW: 6,          // §8.2 — CanvasTexture redraw rate
  HOLO_HZ: 4,  HOLO_HZ_LOW: 2,          // §8.3
  MAP_HZ: 15,  MAP_HZ_LOW: 8,           // §8.6
  HOLO_FADE: 0.35,                      // §8.3 — opacity when the player is looking away
  // cos of the angle at which the fade is complete. 0.707 = 45 deg, which is the FURTHEST a panel
  // can get from the view direction once CABIN_YAW_LAG bounds the cabin's swing (25 deg nominal +
  // 20 deg of lag). Set any tighter and §8.3's floor would be unreachable in play — a fade the
  // player can never see is a fade that does not exist, however well it measures under a forced
  // look direction.
  HOLO_FADE_DOT: 0.707,
  // How far the cabin may lag the view, in radians. §6.1 has the craft heading chasing the camera
  // yaw at 2.6 rad/s, and the cabin is anchored to the CRAFT — so a sustained turn holds a steady
  // heading error, and with nothing bounding it the dash slides bodily off the screen. Seen in the
  // first portrait capture: the instrument panel was clipped by the left edge mid-turn. 20 deg is
  // enough to read as the frame leaning into the turn and small enough that the dash never leaves.
  CABIN_YAW_LAG: 20 * Math.PI / 180,
  DASH_W: 512, DASH_H: 160,             // dash canvas backing, landscape. LOW halves it
  DASH_TW: 340, DASH_TH: 212,           // …and portrait: squarer, less on it, much larger type
  HOLO_W: 384, HOLO_H: 128,             // one holo panel's cell in the shared sheet
  CABIN_Z: 1.10,                        // metres in front of the camera — see hud.js, NOT §8.1's
  // `CELL_PER_MIN` was here and is DELETED, not disabled. It was a stated placeholder for the
  // frames before P7a landed and it was wrong by 5x (28 minutes from full against §7.4.1's 5.2),
  // so leaving it beside `economy.secondsLeft()` would give the dash and the holo panel two
  // different answers to the same question. Obligation T3's rule: a placeholder goes when its
  // replacement arrives.
};

// §3.11.2 gates, so budget.mjs and the game agree on one set of numbers.
export const GATES = {
  draws: 90,
  tris: 260000,
  msGen: 1.4,
  worstFrame: 12,
  meanFrame: 6.0,
};

export const FPS_GUARD = { floor: 26, window: 1.0, pixelRatio: 1.15 };

// ── URL flags (§2.6) ───────────────────────────────────────────────────────

function parseFlags(search) {
  const q = new URLSearchParams(search);
  const has = k => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const num = (k, d) => (q.has(k) && q.get(k) !== '' && isFinite(+q.get(k)) ? +q.get(k) : d);

  let shot = q.has('shot') ? q.get('shot') : null;
  if (shot === '1' || shot === 'true' || shot === '') shot = 'hero_craft';  // brief's literal ?shot=1

  const variant = q.has('var') && VARIANTS.includes(q.get('var')) ? q.get('var') : null;

  return {
    lite: has('lite'),
    shot,
    auto: has('auto'),
    // §13's P7a soak. A NAVIGATING autopilot, separate from `?auto=1`'s fixed 120 s route because
    // four gate suites measure against that route (js/autopilot.js explains). Implies auto.
    courier: has('courier'),
    // Boot with NO audio layer at all — the control half of "does wiring the audio in cost
    // time-to-interactive". Once audio.js is genuinely wired into main.js there is no other way to
    // measure that: gates_p8's leg D used to compare a plain page against an injected one, and with
    // the wiring applied both halves of that comparison were wired.
    noaudio: has('noaudio'),
    nosave: has('nosave'),
    seed: num('seed', null),
    time: q.has('time') ? Math.max(0, Math.min(24, num('time', 0))) : null,
    variant,
    tier: q.has('tier') ? num('tier', null) : null,
    credits: q.has('crd') ? num('crd', null) : null,
    dock: q.has('dock') ? q.get('dock') : null,
    nohud: has('nohud'),
    perf: has('perf'),
    // ?probes=1 builds P1a's 40-box material probe rig INSTEAD of the city (js/probes.js).
    // tools/gates_p1a.mjs is the only thing that uses it.
    probes: has('probes'),
    dpr: q.has('dpr') ? num('dpr', null) : null,
    debug: has('debug'),
  };
}

export const FLAG = parseFlags(typeof location === 'undefined' ? '' : location.search);
export { parseFlags };

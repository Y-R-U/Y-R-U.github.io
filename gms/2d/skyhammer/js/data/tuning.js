// Every magic number the manager expects to retune during playtesting. Nothing tunable lives elsewhere.

export const CAM = {
  vh: 900,            // fixed visible world height, always
  vwMin: 1150, vwMax: 2200,
  anchorX: 0.36,      // plane sits this far across the viewport
  lookahead: 0.35,    // world units of lead per unit of vx
  lerpX: 6,
  baseY: -100,        // world y of viewport bottom at rest -> ~11% earth band, see D21
  topBand: 0.12,      // camera starts climbing when plane enters the top 12%
  lerpUp: 9, lerpDown: 2.5,
  shakeDecay: 3.2, shakeMax: 46,
};

export const PHYS = {
  gravAssist: 260,    // speed gained per second pointing straight down
  stallDrop: 1.9,     // rad/s the nose falls when below stall
  ceiling: 2400,
  ceilingBite: 0.55,  // fraction of turn rate retained above the ceiling
  aimDeadR: 40,       // finger closer than this to the nose: hold last heading
  seaLevel: 0,
};

export const COMBAT = {
  mainGunSpread: 0.012,
  tracerEvery: 3,
  friendlyBlast: 0.0,   // Aaron: you survive your own bombs. Kept as a dial, at zero.
  selfShakeFromBlast: 0.7,
  hpBarWidth: 96, hpBarHeight: 5,
};

export const ECON = {
  moneyPerKill: { ground: 25, flak: 40, fighter: 60, balloon: 35, boss: 400 },
  starTimes: [0.7, 1.0],   // fractions of level `par` for 3 and 2 stars
  upgradeCurve: 1.13,      // per-level price multiplier. 1.34^20 = 292x — see D32
};

export const CTRL = {
  deadPx: 16,     // finger within this of its anchor: hold the previous heading
  maxPx: 96,      // beyond this the anchor is dragged along behind the finger
  kbdRate: 3.0,   // synthetic offset rate for keyboard fallback
  mouseAnchorOnDown: true,
};

// Wing-levelling. VISUAL ONLY — the sim never sees this and e.ang is never touched. Once the nose
// has been committed to the other side of vertical for `dwell` seconds, the model rolls 180 deg
// about its own nose axis so the pilot ends up the right way up for the new direction of travel.
// The dwell is the whole trick: without it a loop strobes the model twice per revolution, and a
// plane wobbling either side of vertical flickers. Aaron's ruling: "shouldn't change how it flies,
// it is just a visual effect to right the plane to the direction of travel".
export const FLIP = {
  dwell: 1.2,     // seconds committed to the new direction before the roll starts
  dur: 0.42,      // seconds the 180 deg roll itself takes
  deadCos: 0.10,  // |cos(ang)| under this is "near vertical": neither commit nor reset the dwell
};

// Terrain framing. These are a LOOK constraint, not a taste preference — see D21.
// Earth band % of frame = (surfaceY - CAM.baseY) / CAM.vh. The reference sits near 10%.
export const TERRAIN = {
  meanY: 0,        // mean surface height; y = 0 stays "base ground" for level data
  minY: -90,       // valley floors, allowed to clip off the bottom of the frame
  maxY: 120,       // ordinary hill crests -> ~24% of frame at their peak
  peakY: 200,      // alpine only, and it must be rare and short
  hillWavelength: 2600,
  detailWavelength: 340,

  // Aaron: 10-30% earth band on average, "depending on the layout". So a level DECLARES its
  // character and the gate checks the generator produced what was asked for. A flat threshold
  // cannot tell a deliberately hilly level from the framing bug of D21, which sat at 26%.
  profiles: {
    flat:    { amp: 0.45, band: [0.08, 0.15] },   // coastal strips, airfields, sea
    rolling: { amp: 1.00, band: [0.10, 0.20] },   // the default — farmland, the reference frame
    hilly:   { amp: 1.65, band: [0.16, 0.28] },   // ridges, valleys worth diving into
    alpine:  { amp: 2.30, band: [0.20, 0.32] },   // peaks, rare and short
  },
  defaultProfile: 'rolling',
};

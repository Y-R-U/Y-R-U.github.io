/**
 * Cohesive art-directed palette (build plan §6). Color encodes faction/threat:
 * cold bioluminescence = organisms/identity, warm = immune/hazard danger only.
 */
export const PAL = {
  mediumDeep: 0x050a14,
  mediumMid: 0x0a1a2a,

  // player + friendly
  player: 0x5ff3d0,
  playerCore: 0xd6fffb,
  nutrient: 0x8be36b,
  nutrientSpark: 0xd6ffb0,
  mutation: 0xb98bff,

  // neutral biolum
  membrane: 0x2fa8c9,
  toxin: 0x7cf6c0,

  // danger (immune / pH)
  danger: 0xff4d5e,
  dangerWarm: 0xff8a3d,
  phZone: 0xff6a9a,

  // enemy identity tints
  seeker: 0xff6f7a,
  drifter: 0xc9d66b,
  orbiter: 0x6bd6ff,
  burster: 0xffb14d,
  macrophage: 0xff9ec4,

  // ui
  ink: 0xcfe9ff,
  inkDim: 0x5b7a93,
  reticle: 0x2a5f7a,
} as const;

/** css helpers for DOM UI */
export const css = (hex: number, alpha = 1): string =>
  `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;

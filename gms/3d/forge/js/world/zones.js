// The three city sections. Same building blocks everywhere — everything that makes a zone
// feel different lives in this file. Changing a zone must never require new geometry code.

export const ZONE_IDS = ['light', 'neutral', 'dark'];

export const ZONES = {
  light: {
    id: 'light',
    label: 'Light',
    // ── stone ──
    stone: {
      base: '#d9d7cf', // pale limestone
      dark: '#b3b2ac',
      mortar: '#c4c3bb',
      // rounded, water-worn blocks; low relief, wide joints
      blockShape: 'rounded',
      blockW: 0.9, blockH: 0.42, jointDepth: 0.55, chipping: 0.15,
      roughness: 0.72, roughVariance: 0.18,
    },
    roof: { color: '#e2e4e3', dark: '#b9bec0', tile: 'curved', roughness: 0.55 },
    trim: '#efeee9',
    // ── openings ──
    window: {
      shape: 'arch',        // full round-headed arch
      frame: '#e6e5df',
      glass: ['#7fb2d8', '#d8c98a', '#c98fa8', '#8fc9a8'], // stained-glass tints
      litColor: '#ffe9c4', litIntensity: 1.0,
    },
    // ── roofline character ──
    crest: { type: 'wing', density: 0.35, color: '#e8e8e4' },
    edges: 'curved',
    // ── ground ──
    road: 'marbleCobble',
    groundTint: '#c9c8bf',
    foliage: { grass: ['#8fa878', '#a3b98c', '#7d9668'], trunk: '#8a7f6d', leaf: '#9fbe93' },
    // ── people ──
    robe: '#dedbd2', staff: 'light',
    // ── interior ──
    wood: { base: '#cbb190', dark: '#a98f6f', roughness: 0.6 },
  },

  neutral: {
    id: 'neutral',
    label: 'Neutral',
    stone: {
      base: '#9c8f79',
      dark: '#7d715f',
      mortar: '#8c806c',
      blockShape: 'square',  // flat, square-cut, boring on purpose
      blockW: 0.7, blockH: 0.35, jointDepth: 0.4, chipping: 0.3,
      roughness: 0.85, roughVariance: 0.12,
    },
    roof: { color: '#9a8b5e', dark: '#6f6440', tile: 'thatch', roughness: 0.95 },
    trim: '#6f6552',
    window: {
      shape: 'square',
      frame: '#6d5f47',
      glass: ['#8f9a86', '#9a9276'],
      litColor: '#ffd79a', litIntensity: 0.85,
    },
    crest: { type: 'none', density: 0, color: '#8c806c' },
    edges: 'flat',
    road: 'dirt',
    groundTint: '#8b8163',
    foliage: { grass: ['#7f8a55', '#909a63', '#6c7748'], trunk: '#6b5a44', leaf: '#7f8f5c' },
    robe: '#9c8a72', staff: 'pitchfork',
    wood: { base: '#8a6f4f', dark: '#6b563d', roughness: 0.75 },
  },

  dark: {
    id: 'dark',
    label: 'Dark',
    stone: {
      base: '#4a4a50',
      dark: '#2e2e34',
      mortar: '#3a3a40',
      blockShape: 'jagged',  // sharp fractured basalt
      blockW: 0.8, blockH: 0.38, jointDepth: 0.75, chipping: 0.55,
      roughness: 0.65, roughVariance: 0.25,
    },
    roof: { color: '#22242a', dark: '#131418', tile: 'slate', roughness: 0.45 },
    trim: '#1b1c21',
    window: {
      shape: 'lancet',      // tall, pointed, narrow
      frame: '#1d1e23',
      glass: ['#7a2436', '#3d2a63', '#1f5a52', '#6b3f12'], // deep saturated
      litColor: '#ff9d5c', litIntensity: 1.15,
    },
    // Approved: start with plain black metal spikes, refine later.
    crest: { type: 'spikes', density: 0.7, color: '#15161a', metalness: 0.65 },
    edges: 'sharp',
    road: 'cobble',
    groundTint: '#4b4a46',
    foliage: { grass: ['#4e5a48', '#5c684f', '#3d4739'], trunk: '#3b342f', leaf: '#4a5745' },
    robe: '#3c3a3e', staff: 'dark',
    wood: { base: '#4a382a', dark: '#31251b', roughness: 0.55 },
  },
};

export function zone(id) { return ZONES[id] || ZONES.neutral; }

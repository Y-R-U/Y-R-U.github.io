// Two-hue palettes, per faction and per system. Frozen — additive changes only.

const FACTIONS = {
  ferrous: {
    id: 'ferrous', name: 'Ferrous Line',
    hull: '#7b7d80', hullDark: '#33353a', panel: '#63656a', trim: '#8a4f1d',
    accent: '#ff9c33', strip: '#ff8a2a', window: '#ffd49a',
    glass: '#0d1418', beam: '#ffb454', engine: '#ffbe6a',
    metal: 0.86, rough: 0.46,
  },
  corvain: {
    id: 'corvain', name: 'Corvain Drayage Co.',
    hull: '#6b737f', hullDark: '#262c36', panel: '#525a67', trim: '#26708a',
    accent: '#4fc9e8', strip: '#3fbcdd', window: '#cfe4ff',
    glass: '#0a1219', beam: '#7fd8f0', engine: '#8fd6ff',
    metal: 0.9, rough: 0.38,
  },
  // Neutral rock/ice, so the belt kit does not have to belong to a company.
  reach: {
    id: 'reach', name: 'Kestrel Reach',
    hull: '#6a6560', hullDark: '#2c2926', panel: '#575350', trim: '#6d5a3e',
    accent: '#d6a24c', strip: '#c99a4c', window: '#e8cfa0',
    glass: '#101418', beam: '#e8b464', engine: '#e8b464',
    metal: 0.5, rough: 0.72,
  },
};

// Per-system backdrop. `hot` is the colour right around the star, `deep` the near-black the
// frame falls to at the far edge; the two in between are the band hues the critic reads as
// "two or three hues per scene".
const SYSTEMS = {
  tamber: {
    id: 'tamber', name: 'Tamber Reach',
    star: '#ffd9a8', starTint: '#ffb45e', starOut: '#ff6f18',
    hot: '#ffcf8a', mid: '#d4501f', cool: '#0f7f9e', cool2: '#5b46c4', deep: '#04070e',
    fog: '#13303c',
    key: '#ffd2a0', fill: '#3f8fb8',
    seed: 3.17,
  },
};

const freeze = o => { for (const v of Object.values(o)) Object.freeze(v); return Object.freeze(o); };
freeze(FACTIONS); freeze(SYSTEMS);

export function palette(id) { return FACTIONS[id] || FACTIONS.ferrous; }
export function allPalettes() { return Object.values(FACTIONS); }
export function system(id) { return SYSTEMS[id] || SYSTEMS.tamber; }
export function allSystems() { return Object.values(SYSTEMS); }

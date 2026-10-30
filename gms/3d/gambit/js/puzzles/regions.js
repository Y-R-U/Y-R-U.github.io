// Puzzle map regions (chapters), in order. Selection rules live in tools/puzzles_build.mjs;
// this file is presentation: names, flavour text, palette, and the rating that opens a
// region early (so a strong player is not marched through sixty mate-in-ones).
export const REGIONS = [
  { id: 'first-steps', name: 'First Steps', sub: 'Mate in one and loose pieces', unlock: 0,
    hue: 140, a: '#5fbf7a', b: '#1f4a2c', glyph: 'sprout', blurb: 'Every journey starts with a single checkmate.' },
  { id: 'forks-pins', name: 'Forks & Pins', sub: 'Double attacks, pins, skewers', unlock: 1050,
    hue: 200, a: '#5fb4e6', b: '#173a52', glyph: 'fork', blurb: 'Hit two things at once, and pin what cannot move.' },
  { id: 'mating-nets', name: 'Mating Nets', sub: 'Mate in two · the named patterns', unlock: 1200,
    hue: 0, a: '#e0705f', b: '#4a1c1c', glyph: 'net', blurb: 'Back ranks, smothered kings, Arabian and Boden nets.' },
  { id: 'hidden-blades', name: 'Hidden Blades', sub: 'Discoveries, deflections, x-rays', unlock: 1350,
    hue: 275, a: '#a98bff', b: '#2c1d52', glyph: 'blade', blurb: 'The piece that moves is rarely the one that strikes.' },
  { id: 'sacrifice-cliffs', name: 'Sacrifice Cliffs', sub: 'Give material, take the king', unlock: 1500,
    hue: 25, a: '#f0954a', b: '#4f2610', glyph: 'flame', blurb: 'Morphy, Anderssen and Réti walked these cliffs.' },
  { id: 'endgame-vale', name: 'Endgame Vale', sub: 'Promotion, zugzwang, technique', unlock: 1600,
    hue: 170, a: '#5fd1b9', b: '#103f39', glyph: 'crown', blurb: 'When the board empties, every tempo matters.' },
  { id: 'storm-keep', name: 'Storm Keep', sub: 'Long lines and quiet moves', unlock: 1800,
    hue: 225, a: '#7f9cff', b: '#1a2350', glyph: 'bolt', blurb: 'Calculate deeper. The storm does not forgive.' },
  { id: 'gm-peaks', name: 'Grandmaster Peaks', sub: '2000 and beyond', unlock: 2050,
    hue: 45, a: '#f2cf6b', b: '#4a3a10', glyph: 'peak', blurb: 'The summit. Few ever see the view from here.' },
];
export const regionById = id => REGIONS.find(r => r.id === id);

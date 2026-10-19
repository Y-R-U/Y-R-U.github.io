// Stand-in MapDefs (SCHEMA.md shape) for the test page until js/data/maps.js lands. The app passes real maps.
const MAPS = [
  ['m1', 'Rust Docks', 'docks', 14, [5, 10]],
  ['m2', 'Neon Undercity', 'slums', 15, [5, 11]],
  ['m3', 'Protocol League', 'league', 14, [5, 10]],
  ['m4', 'Kestrel Skyport', 'skyport', 15, [5, 10]],
  ['m5', 'The Lattice', 'lab', 16, [5, 11]],
  ['m6', 'The Verdance', 'forest', 16, [5, 11], 'fantasy'],
  ['m7', 'Spire War', 'spirewar', 18, [6, 12]],
  ['m8', 'Protocol Core', 'core', 15, [5, 10]],
];
export const DEMO_MAPS = MAPS.map(([id, name, theme, n, elites, realm = 'scifi'], mi) => ({
  id, name, theme, realm, order: mi + 1, chapter: mi + 1,
  levels: Array.from({ length: n }, (_, i) => ({
    id: `${id}_l${i + 1}`, name: i === n - 1 ? 'Boss: ' + name.split(' ').pop() + ' Warden' : 'Contract ' + (i + 1), node: i + 1,
    elite: elites.includes(i + 1), boss: i === n - 1, power: Math.round(120 * Math.pow(1.18, mi * 14 + i)),
  })),
}));

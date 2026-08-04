// Tamber Reach. Four places, three routes, one market. `weeks` is transit at speed 1.0.

export default Object.freeze({
  id: 'tamber', name: 'Tamber Reach', palette: 'tamber',
  star: Object.freeze({ name: 'Tamber', kind: 'K', tint: '#ffb45e' }),
  sites: Object.freeze([
    Object.freeze({
      id: 'ledger', name: 'Ledger Station', kind: 'station', owner: 'player',
      station: 'ledger', palette: 'ferrous', pos: Object.freeze([0, 0, 0]),
    }),
    Object.freeze({
      id: 'kestrel', name: 'Kestrel Belt', kind: 'belt', owner: 'none',
      belt: 'kestrel', palette: 'reach', pos: Object.freeze([-1400, 60, -900]),
      yield: 1.0, reserve: 1.0,
    }),
    Object.freeze({
      id: 'ossian', name: 'Ossian Orbitals', kind: 'market', owner: 'none',
      planet: 'ossian', palette: 'reach', pos: Object.freeze([1900, -120, -1500]),
      buys: Object.freeze(['ore', 'halide', 'filament']),
    }),
    Object.freeze({
      id: 'drayyard', name: 'Dray Yard', kind: 'station', owner: 'rival',
      station: 'drayyard', palette: 'corvain', pos: Object.freeze([700, 180, 1600]),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ from: 'ledger', to: 'kestrel', weeks: 1, fuel: 140, arc: 0.22 }),
    Object.freeze({ from: 'ledger', to: 'ossian', weeks: 1, fuel: 120, arc: -0.18 }),
    Object.freeze({ from: 'ledger', to: 'drayyard', weeks: 1, fuel: 130, arc: 0.1 }),
    Object.freeze({ from: 'kestrel', to: 'ossian', weeks: 2, fuel: 240, arc: 0.3 }),
  ]),
  ticker: 'Corvain Drayage 71%. You: 4%.',
});

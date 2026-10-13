// Record source helpers (tools/rec_build.mjs reads every tools/rec_src/*.mjs default export).
// One record = { g, s, t, h, … } — see docs/notes/RECORDS.md for every field.
export const AS_OF = 2025;

// group key -> label (item.group)
export const GROUPS = {
  ath: 'Athletics', swim: 'Swimming', sport: 'Other sports', nat: 'Natural world', weather: 'Weather & climate',
  built: 'Built world', space: 'Space', ani: 'Animals', plants: 'Plants', people: 'Human body & people',
  speed: 'Speed & vehicles', mat: 'Materials', heat: 'Hot & cold', culture: 'Films, music & games',
  places: 'Countries & cities', old: 'Oldest things', food: 'Food', sound: 'Loudest & brightest',
};

// Bands for range-band questions: non-overlapping, lower bound inclusive, upper exclusive; null = open.
export const band = (...edges) => edges.slice(0, -1).map((lo, i) => [lo, edges[i + 1]]);

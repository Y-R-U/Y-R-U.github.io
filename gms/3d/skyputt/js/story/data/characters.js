// Story characters (PLAN 2.5). Portraits are drawn procedurally from these params (../portrait.js).
// skin / hair / outfit are CSS colours; hair: bun | short | spiky | long | bald | cap; extras: glasses,
// visor, beard, freckles, earring, scarf.
export const CHARACTERS = {
  mags: {
    name: 'Old Mags', role: 'Coach · ex-champion, runs the snack hut',
    portrait: { skin: '#e9b48f', hair: 'bun', hairColor: '#d9d6cf', outfit: '#2f6f8f', accent: '#f2c75c', glasses: true, visor: '#e8463a', mood: 'wry' },
  },
  carl: {
    name: 'Careful Carl', role: 'Muni regular · never misses a lay-up',
    portrait: { skin: '#f1c7a5', hair: 'short', hairColor: '#6b4a2b', outfit: '#8a8f3a', accent: '#f4f0e0', glasses: true, mood: 'smug' },
  },
  you: {
    name: 'You', role: '',
    portrait: { skin: '#c98e6a', hair: 'cap', hairColor: '#3a2a1c', outfit: '#3b6fd6', accent: '#ffffff', mood: 'happy' },
  },
};

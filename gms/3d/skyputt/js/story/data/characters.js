// Story characters (PLAN 2.5). Portraits are drawn procedurally from these params (../portrait.js).
// skin / hair / outfit are CSS colours; hair: bun | short | spiky | long | bald | cap; extras: glasses,
// visor, beard; mood: happy | wry | smug | sad.
export const CHARACTERS = {
  mags: {
    name: 'Old Mags', role: 'Coach · ex-champion, runs the snack hut',
    portrait: { skin: '#e9b48f', hair: 'bun', hairColor: '#d9d6cf', outfit: '#2f6f8f', accent: '#f2c75c', glasses: true, visor: '#e8463a', mood: 'wry' },
  },
  carl: {
    name: 'Careful Carl', role: 'Muni regular · never misses a lay-up',
    portrait: { skin: '#f1c7a5', hair: 'short', hairColor: '#6b4a2b', outfit: '#8a8f3a', accent: '#f4f0e0', glasses: true, mood: 'smug' },
  },
  lou: {
    name: 'Lucky Lou', role: 'Club Tour · chaos with a putter',
    portrait: { skin: '#d9a07a', hair: 'spiky', hairColor: '#e0a030', outfit: '#7a4fc4', accent: '#ffd84a', mood: 'happy' },
  },
  banks: {
    name: 'Remy Banks', role: 'Regional champion · former billiards prodigy',
    portrait: { skin: '#a8714f', hair: 'short', hairColor: '#1e1a1a', outfit: '#1f5f8a', accent: '#7fd1ff', beard: true, mood: 'smug' },
  },
  bertha: {
    name: 'Big Bertha', role: 'National Tour · longest hitter alive',
    portrait: { skin: '#7a4b32', hair: 'long', hairColor: '#2a1a14', outfit: '#c43a2a', accent: '#ffcf6a', visor: '#ff7a3a', mood: 'happy' },
  },
  pro: {
    name: 'Sterling Vance', role: 'The Pro · world number one',
    portrait: { skin: '#f0cfb0', hair: 'short', hairColor: '#c9b48a', outfit: '#1c1f2a', accent: '#f2c75c', mood: 'wry' },
  },
  sunny: {
    name: 'Sunny Vale', role: 'Tour announcer',
    portrait: { skin: '#e8b890', hair: 'cap', hairColor: '#8a4a20', outfit: '#e8463a', accent: '#ffffff', mood: 'happy' },
  },
  you: {
    name: 'You', role: '',
    portrait: { skin: '#c98e6a', hair: 'cap', hairColor: '#3a2a1c', outfit: '#3b6fd6', accent: '#ffffff', mood: 'happy' },
  },
};

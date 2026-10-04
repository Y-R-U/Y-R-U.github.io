export const NOT_ID = 'Not for real-world identification.';
export const INAT = { name: 'iNaturalist', url: 'https://www.inaturalist.org' };
export const WD = { name: 'Wikidata', url: 'https://www.wikidata.org' };
export const COMMONS = { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org' };
export const NASA = { name: 'NASA Image and Video Library', url: 'https://images.nasa.gov' };

export const STATUS_META = { type: 'cat', label: 'Conservation status (IUCN)', hard: true, clue: v => `Its IUCN conservation status is "${v}".` };
export const VENOM_META = { type: 'bool', label: 'Venomous', yes: 'Venomous', no: 'Not venomous', clue: v => (v ? 'It is venomous.' : 'It is not venomous.') };
export const DANGER_META = {
  type: 'cat', label: 'Danger to people', values: ['Harmless', 'Mildly venomous', 'Dangerous', 'Potentially deadly'],
  clue: v => ({ Harmless: 'It is harmless to people.', 'Mildly venomous': 'Its bite is only mildly venomous to people.', Dangerous: 'It can be dangerous to people.', 'Potentially deadly': 'Its bite or sting can kill a person.' }[v]),
};
export const REGION_META = { type: 'cat', label: 'Found in', clue: v => (v === 'Oceans' ? 'It lives in the sea.' : `It is found in ${v}.`) };
export const len = (label = 'Typical length') => ({ type: 'num', label, unit: 'm', higherLabel: 'Longer', clue: v => `${label}: about ${v < 1 ? Math.round(v * 100) + ' cm' : v + ' m'}.` });
export const lenCm = (label = 'Typical length') => ({ type: 'num', label, unit: 'cm', higherLabel: 'Longer', clue: v => `${label}: about ${v} cm.` });
export const mass = (label = 'Typical adult weight') => ({ type: 'num', label, unit: 'kg', higherLabel: 'Heavier', clue: v => `${label}: about ${v >= 1000 ? (v / 1000).toLocaleString('en-GB') + ' tonnes' : v < 1 ? Math.round(v * 1000) + ' g' : v + ' kg'}.` });

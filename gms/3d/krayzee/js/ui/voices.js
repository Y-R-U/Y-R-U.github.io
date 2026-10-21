export const VOICES = [
  { id: 'toff', name: 'The Toff', desc: 'Plummy, braying and frightfully entitled. Has never queued.' },
  { id: 'duchess', name: 'The Dowager', desc: 'Imperious grande dame. Addresses the tower as "the help".' },
  { id: 'bubba', name: 'Bubba', desc: 'Southern good ol\' boy. Flies by the seat of his overalls.' },
  { id: 'darlene', name: 'Darlene', desc: 'Loud, sassy and absolutely not yielding that runway, hon.' },
  { id: 'wingco', name: 'The Wing Co', desc: 'RAF wing commander. Handlebar moustache, wizard prang energy.' },
  { id: 'geezer', name: 'The Geezer', desc: 'Cockney wide boy. Knows a bloke who can get you a slot.' },
  { id: 'sheila', name: 'Sheila', desc: 'Brash Aussie larrikin. No worries, several collisions.' },
  { id: 'laird', name: 'The Laird', desc: 'Gruff Highland laird. Owns the hill you just clipped.' },
  { id: 'heiress', name: 'The Heiress', desc: 'Spoilt, bored, vocal fry. Daddy bought the airport.' },
  { id: 'comte', name: 'Le Comte', desc: 'Disdainful French aristocrat. Your landing was... adequate.' },
  { id: 'baronin', name: 'Die Baronin', desc: 'Stern, clipped, punctual. Expects the tower to be also.' },
  { id: 'tex', name: 'Tex', desc: 'Booming oil tycoon. Everything\'s bigger, including the crater.' },
  { id: 'nan', name: 'Nan', desc: 'Sweet Yorkshire grandma. Will cut you up on final, love.' },
  { id: 'prince', name: 'The Young Prince', desc: 'Breathless, nervous royal. Terribly sorry about the hangar.' },
  { id: 'charmer', name: 'The Charmer', desc: 'Silver-tongued Irishman. Could talk the tower into anything.' },
];

export const sampleUrl = (id) => new URL(`../../audio/voices/${id}/sample.mp3`, import.meta.url).href;

// DESIGN's roster (data/voices.json) is the source of truth for names and blurbs once it loads.
let loaded = null;
export function loadRoster() {
  loaded ||= fetch(new URL('../../data/voices.json', import.meta.url)).then((r) => r.json()).then((d) => {
    const P = d.pilots || {};
    return VOICES.map((v) => ({ ...v, name: P[v.id]?.name || v.name, desc: P[v.id]?.blurb || v.desc, line: P[v.id]?.sample || '' }));
  }).catch(() => VOICES);
  return loaded;
}

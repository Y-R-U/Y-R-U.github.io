// The tour of the square — Aaron's own addition to his son's list: "maybe have an option after
// acceptance to Iron? take tour of town, that sets targets and explains each shop."
//
// It is three targets and no walking NPC. A guide who follows you around town is a pathing
// problem, a camera problem and a conversation problem, and none of the three would teach the
// player anything the shopkeeper does not say better standing in their own shop. So: Vail offers
// it, the panel counts the three doors down, and each keeper says their piece the first time you
// come through theirs.
//
// Pure. The flags are the whole state — no quest runtime, and nothing here that a save cannot
// carry.

export const FLAG = 'society.tour';
export const DONE = 'society.tour.done';

export const STOPS = [
  { id: 'smith', flag: 'society.tour.smith', house: 60, shop: 'shop.weaponry', name: 'The Weaponry' },
  { id: 'apothecary', flag: 'society.tour.apothecary', house: 61, shop: 'shop.apothecary', name: 'The Apothecary' },
  { id: 'sundry', flag: 'society.tour.sundry', house: 62, shop: 'shop.general', name: 'General Goods' },
];

export const active = (flags = {}) => !!flags[FLAG] && !flags[DONE];
export const seen = (flags = {}, stop) => !!flags[stop.flag];
export const visited = (flags = {}) => STOPS.filter(s => seen(flags, s)).length;
export const left = (flags = {}) => STOPS.length - visited(flags);
export const complete = (flags = {}) => left(flags) === 0;

// The next door to walk into, or null when they have all been walked into.
export const next = (flags = {}) => STOPS.find(s => !seen(flags, s)) || null;

// The tour dressed as a contract, so it can use the panel the contracts already use — one
// transparent line that opens on a tap. Faking a job rather than building a second panel: the
// player has one thing in hand at a time and this is a thing in hand.
export function brief(flags = {}) {
  const n = next(flags);
  return {
    tour: true,
    job: {
      id: FLAG,
      name: 'The tour of the square',
      client: 'Registrar Vail',
      where: 'Outside the Society',
      reward: 0,
    },
    asks: n ? `Look in at ${n.name}.` : 'Back to the desk.',
    note: 'Three doors. Sella has the weapons, Ivens has the bottles, and Corvel has the one thing '
      + 'you cannot afford. Walk into each of them and they will tell you the rest themselves.',
    foes: STOPS.map(s => (seen(flags, s) ? `${s.name} ✓` : s.name)).join(' · '),
    worth: 0,
  };
}

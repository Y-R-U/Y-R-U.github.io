import { AIRCRAFT } from '../../data/aircraft.js';
import { RANKS, titleFor } from './ranks.js';
import { career } from './career.js';

// Flyable in Free Flight (model + flight model). Order = Hangar card order.
export const HANGAR = ['c172', 'tiger', 'bathtub', 'herc', 'f35', 'jumbo'];
export const SHORT = { c172: 'Runabout', tiger: 'Moth', bathtub: 'Bathtub', herc: 'Wardrobe', f35: 'Tantrum', jumbo: 'Jumbo' };
// ?allplanes: every Hangar plane unlocked, for testing
const ALL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('allplanes');
const BLURB = {
  c172: 'The sensible one. Forgiving, honest, and painted in your colours.',
  tiger: 'Open cockpit, wires, a scarf. Lands short; ground-loops if you let it.',
  bathtub: 'Clawfoot tub, propeller on the taps, rubber duck co-pilot. Wobbles.',
  herc: 'Four turboprops, a rear ramp and a royal crate. Short runways, no fuss.',
  f35: 'Stealthy, fast, afterburner. Overshoots everything; the tower hates it.',
  jumbo: 'A palace with wings. Needs the whole runway, and then some.',
};

// null when unlocked, else { text } (DESIGN §4: unlockRank per type; 'story' = finish the campaign).
export function aircraftLock(id, gender = 'm', c = career()) {
  const a = AIRCRAFT[id];
  if (!a || !HANGAR.includes(id)) return { text: 'Not in the Hangar yet' };
  if (ALL) return null;
  const need = a.unlockRank;
  if (!need) return null;
  if (need === 'story') return c.storyComplete ? null : { text: 'Finish the Story to unlock' };
  const i = RANKS.findIndex((r) => r.id === need);
  if (i < 0 || c.rankIndex >= i) return null;
  return { text: `Reach ${titleFor(gender, i)} · ${RANKS[i].minPP.toLocaleString('en-GB')} PP` };
}

export const aircraftUnlocked = (id, c) => !aircraftLock(id, 'm', c);

export function aircraftCard(id) {
  const a = AIRCRAFT[id];
  return {
    id, name: a.name, type: a.type, short: SHORT[id], blurb: BLURB[id], ppMult: a.ppMult, tail: a.gear === 'tailwheel',
    stats: [
      { k: 'Cruise', v: a.speeds.cruise, u: 'kt', f: a.speeds.cruise / 120 },
      { k: 'Climb', v: a.performance.climbFpm, u: 'fpm', f: a.performance.climbFpm / 730 },
      { k: 'Stall', v: a.speeds.vs1, u: 'kt', f: a.speeds.vs1 / 48, low: true },
    ],
  };
}

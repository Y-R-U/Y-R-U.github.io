// The showroom. A chassis decides what your car *is* — its shape, its weight
// and what it is naturally good at — and the parts you bolt on decide how good
// it is at that. Everybody starts in the same plain white saloon, on purpose:
// the first car you buy should feel like a decision, and it cannot feel like
// one if you were already driving something interesting.

// Static data only — no profile import, so save.js can own "which of these do
// you actually have" without the two files importing each other.
import { BODY_STYLES } from './carfactory.js';

export const CARS = [
  {
    id: 'kestrel', name: 'KESTREL 200', maker: 'Vega Auto',
    style: 'stock', price: 0, src: 'start',
    body: 0xf4f7fa, trim: 0xc4ccd4,
    stats: {},
    blurb: 'Somebody else’s company car with the badges taken off. It is white, it is honest, and it is yours.',
    tag: 'THE ONE YOU START WITH',
  },
  {
    id: 'cinder', name: 'CINDER GT', maker: 'Redcap',
    style: 'muscle', price: 26000, src: 'shop',
    body: 0xd8352c, trim: 0x2a1210,
    stats: { top: 4, accel: 1.06, grip: 0.95, mass: 1.06, ram: 1.06 },
    blurb: 'Enormous engine, agricultural everything else. Quick in a straight line and an argument in the corners.',
    tag: 'FAST AND STUPID',
  },
  {
    id: 'halloway', name: 'HALLOWAY HAULER', maker: 'Halloway',
    style: 'van', price: 48000, src: 'shop',
    body: 0x3d6f8f, trim: 0xe8eef2,
    stats: { top: -3, accel: 0.95, mass: 1.28, ram: 1.2, armour: 0.86, partHp: 1.25 },
    blurb: 'A panel van with a roll cage where the shelving used to be. Nothing you hit stays where it was.',
    tag: 'THE BATTERING RAM',
  },
  {
    id: 'pike', name: 'PIKE RS', maker: 'Kingfisher',
    style: 'wedge', price: 96000, src: 'shop',
    body: 0xf0b021, trim: 0x1a1508,
    stats: { top: 5, accel: 1.1, grip: 1.12, mass: 0.86, armour: 1.12, boostPow: 1.06 },
    blurb: 'A proper racing car that has been entered into an improper series. Brilliant until somebody leans on it.',
    tag: 'GLASS AND GENIUS',
  },
  {
    id: 'dustrunner', name: 'DUSTRUNNER', maker: 'Cutshaw',
    style: 'buggy', price: 132000, src: 'shop',
    body: 0xc9762e, trim: 0x2c1b0c,
    stats: { grip: 1.04, offroad: 1.7, partHp: 1.35, mass: 0.96, boostMax: 1 },
    blurb: 'Built for the quarry and the salt. Leaving the road is a tactic in this one, not a mistake.',
    tag: 'THE ROAD IS OPTIONAL',
  },
  {
    id: 'nightshift', name: 'NIGHTSHIFT', maker: 'Nightshift',
    style: 'wedge', price: 0, src: 'prize',
    body: 0x1b1f27, trim: 0x4de0b0,
    stats: { stealth: 0.82, grip: 1.06, top: 3, hypeGain: 1.1 },
    unlock: { kind: 'story', level: 60 },
    blurb: 'Matte black, no reflectors, and a transponder that reports the wrong car. The stewards hate this thing.',
    tag: 'SEASON REWARD · LEVEL 60',
  },
  {
    id: 'juggernaut', name: 'JUGGERNAUT', maker: 'Iron Pact',
    style: 'van', price: 0, src: 'prize',
    body: 0x5a5f68, trim: 0xffb020,
    stats: { mass: 1.45, ram: 1.34, armour: 0.74, partHp: 1.5, top: -5, accel: 0.9 },
    unlock: { kind: 'win', event: 'gauntlet', eventName: 'THE GAUNTLET' },
    blurb: 'Two tonnes of scrap merchant’s revenge. It does not go around people.',
    tag: 'WIN THE GAUNTLET',
  },
  {
    id: 'ringmaster', name: 'RINGMASTER', maker: 'The Circus',
    style: 'muscle', price: 0, src: 'prize',
    body: 0x8b2fd0, trim: 0xffd166,
    stats: { top: 8, accel: 1.14, grip: 1.14, mass: 1.12, ram: 1.14, armour: 0.86, stealth: 0.9, boostPow: 1.12 },
    unlock: { kind: 'story', level: 100 },
    blurb: 'Krieg’s own car, handed over on live television. Every part of it is illegal somewhere.',
    tag: 'FINISH THE SEASON',
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));
export const carById = (id) => CAR_BY_ID[id] || CARS[0];

export const STARTER_CAR = 'kestrel';

// The chassis contributes to the same stat block the parts do, so nothing
// downstream needs to know a car is a separate thing from a gearbox.
export const carStats = (id) => carById(id).stats || {};

export function bodyStyleOf(id) {
  const c = carById(id);
  return BODY_STYLES[c.style] ? c.style : 'stock';
}

// Cars that have to be won rather than bought.
export const PRIZE_CARS = CARS.filter((c) => c.src === 'prize');

// genome.js — UUID → world spec. The character-position mapping documented in
// GENOME.md lives HERE. Changing a position changes every world; don't.

import { charVal, Rand } from './prng.js';
import {
  PEOPLE, QUOTES, FACTS, BOOKS, BILLBOARD_SETS, SIGN_THEMES, POSTER_SETS,
  SHOP_THEMES, FLY_STYLES, HERO_EFFECTS, AMBIENT_EFFECTS, LANDMARKS,
  ARCH_STYLES, LAYOUTS,
} from './tables.js';
import {
  SKY_PALETTES, TIMES, WEATHERS, WATER_HUES, BUILDING_PALETTES,
  VEHICLE_PALETTES, ROOM_PALETTES, NATURE_THEMES, LIGHT_PATTERNS, SOUNDSCAPES,
} from './palettes.js';

export function decode(uuid) {
  const g = (pos) => charVal(uuid[pos]);
  const spec = {
    uuid,
    // 0–4: atmosphere & land
    sky: SKY_PALETTES[g(0)], skyIdx: g(0),
    time: TIMES[g(1)],
    weather: WEATHERS[g(2)],
    water: WATER_HUES[g(3)],
    layout: LAYOUTS[g(4)],
    // 5–10: city & traffic
    bldCount: 8 + g(5),                             // 8..70 buildings
    maxFloors: 2 + Math.round(g(6) * 48 / 61),      // 2..50 floors
    bldPal: BUILDING_PALETTES[g(7)],
    arch: ARCH_STYLES[g(8)],
    vehCount: Math.round(g(9) * 20 / 61),           // 0..20 vehicles
    vehPal: VEHICLE_PALETTES[g(10)],
    // 11–17: culture
    person: PEOPLE[g(11)], personIdx: g(11),
    quote: QUOTES[g(12)],
    posterSet: POSTER_SETS[g(13)],
    book: BOOKS[g(14)],
    fly: FLY_STYLES[g(15)],
    factIdx: g(16), fact: FACTS[g(16)],
    billboards: BILLBOARD_SETS[g(17)],
    // 18–19: generative effects
    hero: HERO_EFFECTS[g(18)],
    ambient: AMBIENT_EFFECTS[g(19)],
    // 20–26: texture of the place
    signs: SIGN_THEMES[g(20)],
    shops: SHOP_THEMES[g(21)],
    roomPal: ROOM_PALETTES[g(22)],
    sound: SOUNDSCAPES[g(23)],
    nature: NATURE_THEMES[g(24)],
    lights: LIGHT_PATTERNS[g(25)],
    landmark: LANDMARKS[g(26)],
    // 27–31 are pure entropy — they only feed the micro-variation streams,
    // which hash the WHOLE uuid, so equal prefixes still diverge everywhere.
  };
  spec.rand = (label) => new Rand(uuid, label);
  return spec;
}

// Lines for the connect overlay — the world "decompiling" in front of you.
export function readout(spec) {
  const lines = [
    ['SKY', spec.sky.name],
    ['TIME', spec.time.name],
    ['WEATHER', spec.weather.name],
    ['TERRAIN', spec.layout.name],
    ['ARCH', `${spec.arch.name} ×${spec.bldCount}`],
    ['FLY', spec.fly.name],
  ];
  if (spec.hero.fam !== 'none') lines.push(['SIGNATURE', spec.hero.name]);
  if (spec.landmark.fam !== 'none') lines.push(['LANDMARK', spec.landmark.name]);
  return lines;
}

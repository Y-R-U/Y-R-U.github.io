// js/data/relics.js — fourteen pre-run loadout items. CONTRACTS §8.4, DESIGN §5.
//
// A relic is a TRADE, never a buff. If a player can look at one and not have to
// think, it has failed and should be rewritten rather than rebalanced.
//
// `apply(stats)` is the only function in a data file (CONTRACTS §8.4). It is
// pure, mutates the passed DerivedStats in place and returns it, and touches
// nothing but the seventeen fields in CONTRACTS §7.2.
//
// Rule changes that are NOT stat maths live in `flags` — a flat declarative
// object the sim reads once at run start. Every flag used here is listed with
// its required behaviour in docs/lanes/C-meta.md; a flag the sim ignores is a
// relic that lies to the player, which is worse than no relic.
//
// `slot` is which loadout slot tier a relic becomes available in (DESIGN §5:
// one slot growing to three). Slot 1 relics are the legible ones.

export const RELICS = Object.freeze({

  // ───────────────────────────────────────────── the strings (DESIGN §2.2)

  cutters_thumb: {
    id: 'cutters_thumb', name: "Cutter's Thumb", slot: 1,
    desc: 'Ilse cut it off herself and does not discuss why. It still knows where a thread is.',
    good: 'Sever radius +60%',
    bad: 'All damage −25%',
    flags: {},
    apply(s) { s.sever *= 1.6; s.might *= 0.75; return s; }
  },

  long_thread: {
    id: 'long_thread', name: 'A Long Enough Thread', slot: 2,
    desc: 'Wound on a bobbin the size of a fist. There is no end to it that anyone has found.',
    good: 'A severed puppet stays limp for the rest of the run',
    bad: 'No puppet is ever Freed',
    flags: { limpForever: true, freedChance: 0 },
    apply(s) { s.sever *= 1.25; return s; }
  },

  widows_knot: {
    id: 'widows_knot', name: "Widow's Knot", slot: 2,
    desc: 'Tied to shorten a thread, which is one of the two things you can do to a thread.',
    good: 'Cut puppets drop a heart instead of a shard · sever radius +30%',
    bad: 'XP from shards −50%',
    flags: { cutDropsHeart: true },
    apply(s) { s.sever *= 1.3; s.growth *= 0.5; return s; }
  },

  batons_end: {
    id: 'batons_end', name: "The Baton's End", slot: 3,
    desc: 'Snapped off something that was still conducting at the time.',
    good: 'Every Conductor you kill gives +8% damage for the rest of the run',
    bad: 'Conductors have double health',
    flags: { conductorKillMight: 0.08, conductorHpMul: 2.0 },
    apply(s) { return s; }
  },

  // ───────────────────────────────────────────── the sharp ones

  dead_lamp: {
    id: 'dead_lamp', name: 'The Dead Lamp', slot: 1,
    desc: 'Wick carried it the whole first night and it did not go out. It has not been lit since.',
    good: 'All damage +50%',
    bad: 'You cannot be healed, by anything',
    flags: { noHeal: true },
    apply(s) { s.might *= 1.5; s.regen = 0; return s; }
  },

  early_grave: {
    id: 'early_grave', name: 'Early Grave', slot: 2,
    desc: 'A headstone cut before it was needed, with the second date left blank. It is no longer blank.',
    good: 'You start the run at level 5',
    bad: 'The stage clock starts at 4:00 — so does everything on it',
    flags: { startLevel: 5, timeOffset: 240 },
    apply(s) { return s; }
  },

  hollow_ribs: {
    id: 'hollow_ribs', name: 'Hollow Ribs', slot: 3,
    desc: 'The Ossuary keeps the light ones on the top shelf. Almost nothing to them.',
    good: 'Damage +100%, move speed +40%',
    bad: 'You have one hit point',
    flags: { maxHpSet: 1 },
    apply(s) { s.might *= 2.0; s.speed *= 1.4; return s; }
  },

  one_good_hand: {
    id: 'one_good_hand', name: 'One Good Hand', slot: 2,
    desc: 'Dredge lost the other one under a lid in the dark and got on with the shift.',
    good: 'Damage +100% · your weapon levels twice as fast',
    bad: 'You may only ever hold one weapon',
    flags: { maxWeapons: 1, weaponXpMul: 2 },
    apply(s) { s.might *= 2.0; return s; }
  },

  // ───────────────────────────────────────────── the shaped ones

  iron_shoes: {
    id: 'iron_shoes', name: 'Iron Shoes', slot: 1,
    desc: 'Pallbearers wear them so the box cannot pull them over. It works.',
    good: '+6 armour',
    bad: 'Move speed −30%',
    flags: {},
    apply(s) { s.armour += 6; s.speed *= 0.7; return s; }
  },

  gravedust: {
    id: 'gravedust', name: 'Gravedust', slot: 1,
    desc: 'Sold by the spoon to people who should have known better, and it worked for them too.',
    good: 'Souls +80%, luck +50%',
    bad: 'XP from shards −40%',
    flags: {},
    apply(s) { s.greed *= 1.8; s.luck *= 1.5; s.growth *= 0.6; return s; }
  },

  fasting: {
    id: 'fasting', name: 'The Fast', slot: 2,
    desc: 'Nine days without. The Order says it clarifies. The Order has never been to Bellfield Lane.',
    good: 'Shards are worth 160% more',
    bad: 'Nothing is drawn to you — you must walk onto every shard',
    flags: { noMagnet: true },
    apply(s) { s.magnet = 0; s.growth *= 2.6; return s; }
  },

  surgeons_kit: {
    id: 'surgeons_kit', name: "The Surgeon's Kit", slot: 2,
    desc: 'Laid out in order of size. The Long Hospital never stopped sterilising them.',
    good: 'Regenerate 2.5 HP per second',
    bad: 'You cannot land a critical hit',
    flags: { noCrit: true },
    apply(s) { s.regen += 2.5; s.crit = 0; s.critMult = 1; return s; }
  },

  mourners_coin: {
    id: 'mourners_coin', name: "Mourner's Coin", slot: 3,
    desc: 'Put on the eye, then taken back off. That is the part the trade frowns on.',
    good: 'One extra revival, at full health',
    bad: 'Damage −25%, Souls −30%',
    flags: { extraRevives: 1 },
    apply(s) { s.might *= 0.75; s.greed *= 0.7; return s; }
  },

  ninth_favour: {
    id: 'ninth_favour', name: "The Ninth's Favour", slot: 3,
    desc: 'Nobody offered it to you. It is simply in your coat now, and warm.',
    good: 'Souls +60%, luck +30%',
    bad: 'Everything on the stage is markedly stronger',
    flags: {},
    apply(s) { s.curse *= 1.6; s.greed *= 1.6; s.luck *= 1.3; return s; }
  }

});

export const list = Object.freeze(Object.keys(RELICS).map(k => RELICS[k]));

// Every flag key any relic in this file uses. The sim can assert it implements
// all of these at boot rather than silently no-opping one.
export const RELIC_FLAGS = Object.freeze([
  'limpForever', 'freedChance', 'cutDropsHeart', 'conductorKillMight',
  'conductorHpMul', 'noHeal', 'startLevel', 'timeOffset', 'maxHpSet',
  'maxWeapons', 'weaponXpMul', 'noMagnet', 'noCrit', 'extraRevives'
]);

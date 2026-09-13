// js/data/passives.js — twelve stat shapes, five levels each. CONTRACTS §8.4.
//
// Every level names exactly one `DerivedStats` field (CONTRACTS §7.2) and gives
// either `mul` (multiplier, composed against the 1.0 base) or `add` (flat).
// `curse` is deliberately not reachable from a passive — it belongs to relics,
// sigils and the curse tiers, where taking it on is a choice with a price.

export const PASSIVES = Object.freeze({

  graveash: {
    id: 'graveash', name: 'Grave Ash', tag: 'ASH',
    desc: 'Rubbed into the hands. Everything you hold hits like it means it.',
    levels: [
      { stat: 'might', mul: 1.12, text: '+12% damage' },
      { stat: 'might', mul: 1.12, text: '+12% damage' },
      { stat: 'might', mul: 1.13, text: '+13% damage' },
      { stat: 'might', mul: 1.13, text: '+13% damage' },
      { stat: 'might', mul: 1.15, text: '+15% damage' }
    ]
  },

  widowspan: {
    id: 'widowspan', name: "Widow's Span", tag: 'SPN',
    desc: 'The reach of a woman measuring cloth for a box. Everything you do covers more ground.',
    levels: [
      { stat: 'area', mul: 1.10, text: '+10% area' },
      { stat: 'area', mul: 1.10, text: '+10% area' },
      { stat: 'area', mul: 1.10, text: '+10% area' },
      { stat: 'area', mul: 1.12, text: '+12% area' },
      { stat: 'area', mul: 1.13, text: '+13% area' }
    ]
  },

  quickstep: {
    id: 'quickstep', name: 'Quickstep', tag: 'QCK',
    desc: 'You stopped waiting to be sure. Everything comes round again sooner.',
    levels: [
      { stat: 'haste', mul: 1.08, text: '-8% cooldowns' },
      { stat: 'haste', mul: 1.08, text: '-8% cooldowns' },
      { stat: 'haste', mul: 1.09, text: '-9% cooldowns' },
      { stat: 'haste', mul: 1.09, text: '-9% cooldowns' },
      { stat: 'haste', mul: 1.10, text: '-10% cooldowns' }
    ]
  },

  pauperboots: {
    id: 'pauperboots', name: "Pauper's Boots", tag: 'BTS',
    desc: 'Taken off somebody who had stopped needing them. They were always going to fit.',
    levels: [
      { stat: 'speed', mul: 1.07, text: '+7% move speed' },
      { stat: 'speed', mul: 1.07, text: '+7% move speed' },
      { stat: 'speed', mul: 1.07, text: '+7% move speed' },
      { stat: 'speed', mul: 1.08, text: '+8% move speed' },
      { stat: 'speed', mul: 1.08, text: '+8% move speed' }
    ]
  },

  waxseal: {
    id: 'waxseal', name: 'Wax Seal', tag: 'WAX',
    desc: 'A promise that has not been opened yet. Whatever you leave behind lasts.',
    levels: [
      { stat: 'duration', mul: 1.12, text: '+12% effect duration' },
      { stat: 'duration', mul: 1.12, text: '+12% effect duration' },
      { stat: 'duration', mul: 1.13, text: '+13% effect duration' },
      { stat: 'duration', mul: 1.13, text: '+13% effect duration' },
      { stat: 'duration', mul: 1.15, text: '+15% effect duration' }
    ]
  },

  splittongue: {
    id: 'splittongue', name: 'Split Tongue', tag: 'TNG',
    desc: 'Say the thing twice and it happens twice. Nobody has explained this and nobody asks.',
    levels: [
      { stat: 'amount', add: 1, text: '+1 projectile' },
      { stat: 'pierce', add: 1, text: '+1 pierce' },
      { stat: 'amount', add: 1, text: '+1 projectile' },
      { stat: 'pierce', add: 1, text: '+1 pierce' },
      { stat: 'amount', add: 1, text: '+1 projectile' }
    ]
  },

  boneawl: {
    id: 'boneawl', name: 'Bone Awl', tag: 'AWL',
    desc: 'For making a hole in something that was not intended to have one.',
    levels: [
      { stat: 'pierce', add: 1, text: '+1 pierce' },
      { stat: 'pierce', add: 1, text: '+1 pierce' },
      { stat: 'pierce', add: 1, text: '+1 pierce' },
      { stat: 'pierce', add: 2, text: '+2 pierce' },
      { stat: 'pierce', add: 2, text: '+2 pierce' }
    ]
  },

  lodestone: {
    id: 'lodestone', name: 'Lodestone', tag: 'LDS',
    desc: 'It pulls at everything loose. Shards come to you now, and they come heavier.',
    levels: [
      { stat: 'magnet', mul: 1.35, text: '+35% pickup range' },
      { stat: 'magnet', mul: 1.30, text: '+30% pickup range' },
      { stat: 'growth', mul: 1.10, text: '+10% XP from shards' },
      { stat: 'magnet', mul: 1.30, text: '+30% pickup range' },
      { stat: 'greed', mul: 1.20, text: '+20% Souls' }
    ]
  },

  hangedcharm: {
    id: 'hangedcharm', name: "Hanged Man's Charm", tag: 'CHM',
    desc: 'Cut from a rope that did its job. It has been lucky for everyone since.',
    levels: [
      { stat: 'luck', mul: 1.14, text: '+14% luck' },
      { stat: 'luck', mul: 1.14, text: '+14% luck' },
      { stat: 'luck', mul: 1.14, text: '+14% luck' },
      { stat: 'luck', mul: 1.15, text: '+15% luck' },
      { stat: 'luck', mul: 1.16, text: '+16% luck' }
    ]
  },

  mournerplate: {
    id: 'mournerplate', name: "Mourner's Plate", tag: 'PLT',
    desc: 'Black enamel over something that used to be a breastplate. It still remembers the shape of a blow.',
    levels: [
      { stat: 'armour', add: 2, text: '+2 armour' },
      { stat: 'regen', add: 0.4, text: '+0.4 HP/s' },
      { stat: 'armour', add: 2, text: '+2 armour' },
      { stat: 'regen', add: 0.5, text: '+0.5 HP/s' },
      { stat: 'armour', add: 3, text: '+3 armour' }
    ]
  },

  whetstone: {
    id: 'whetstone', name: 'Whetstone', tag: 'WHT',
    desc: 'Kept wet. An edge that finds the seam between two things.',
    levels: [
      { stat: 'crit', add: 0.05, text: '+5% crit chance' },
      { stat: 'crit', add: 0.05, text: '+5% crit chance' },
      { stat: 'critMult', mul: 1.20, text: '+20% crit damage' },
      { stat: 'crit', add: 0.06, text: '+6% crit chance' },
      { stat: 'critMult', mul: 1.25, text: '+25% crit damage' }
    ]
  },

  // The sever build. `sever` is the string-cut radius multiplier (CONTRACTS
  // §7.2): at 5 it is a little over double, which is where aiming at the gaps
  // stops being a skill check and starts being the whole plan.
  ilseedge: {
    id: 'ilseedge', name: "Ilse's Edge", tag: 'EDG',
    desc: 'She never explains how she finds them. She only ever says: not the body.',
    levels: [
      { stat: 'sever', mul: 1.18, text: '+18% sever radius' },
      { stat: 'sever', mul: 1.18, text: '+18% sever radius' },
      { stat: 'sever', mul: 1.18, text: '+18% sever radius' },
      { stat: 'sever', mul: 1.20, text: '+20% sever radius' },
      { stat: 'sever', mul: 1.22, text: '+22% sever radius' }
    ]
  }

});

export const list = Object.freeze(Object.keys(PASSIVES).map(k => PASSIVES[k]));

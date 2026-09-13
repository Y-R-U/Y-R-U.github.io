// js/data/characters.js — the six. CONTRACTS §8.4, DESIGN §6.
//
// `trait` is the contract shape {stat, mul} and names a real DerivedStats field
// (CONTRACTS §7.2). Two characters need more than one stat or a non-stat rule,
// so each also carries `traits` (the full list, traits[0] === trait) and an
// optional `perk` — a named behaviour the sim implements. A consumer written to
// the frozen contract still reads `trait` and gets something correct.
//
// Trait multipliers are applied LAST in stats derivation, to the final value,
// so `crit: 1.20` means "+20% of whatever your crit chance ended up being",
// not "20% of zero".

const T = (stat, mul) => ({ stat, mul });

export const CHARACTERS = Object.freeze({

  wick: {
    id: 'wick', name: 'Wick', title: 'Lamplighter',
    portrait: 'char_wick', weapon: 'emberlash',
    trait: T('area', 1.10),
    traits: [T('area', 1.10)],
    perk: null,
    unlock: { id: 'char_wick', kind: 'char', cond: { always: true }, text: 'Available from the start.' },
    blurb: 'Seventeen lamps a night, the same seventeen, and he could do the round with his eyes shut. He was out on it when the town stood up.'
  },

  vane: {
    id: 'vane', name: 'Sister Vane', title: 'Of the Order of the Quiet Hour',
    portrait: 'char_vane', weapon: 'censer',
    // Shards are her whole kit: she pulls them in, and each one is a small mercy.
    trait: T('magnet', 1.30),
    traits: [T('magnet', 1.30)],
    perk: { id: 'shardmercy', desc: 'Every shard you collect heals 0.5 HP.', params: { heal: 0.5 } },
    unlock: { id: 'char_vane', kind: 'char', cond: { stageCleared: 's3' }, text: 'Clear Ossuary Gate.' },
    blurb: 'She gave last rites to four hundred people in nine days and every one of them got up again afterwards. She has stopped asking what that makes the rites.'
  },

  dredge: {
    id: 'dredge', name: 'Dredge', title: 'Gravedigger',
    portrait: 'char_dredge', weapon: 'bonesaw',
    trait: T('crit', 1.20),
    traits: [T('crit', 1.20)],
    perk: null,
    unlock: { id: 'char_dredge', kind: 'char', cond: { killsInRun: 500 }, text: 'Kill 500 in a single run.' },
    blurb: 'He buried them. Now he has to do it twice, and he is not going to be told that this is unusual. He knows where the soft ground is.'
  },

  ilse: {
    id: 'ilse', name: 'Ilse the Quiet', title: 'Stringcutter',
    portrait: 'char_ilse', weapon: 'shears',
    trait: T('sever', 2.00),
    traits: [T('sever', 2.00), T('might', 0.85)],
    perk: null,
    unlock: { id: 'char_ilse', kind: 'char', cond: { cuts: 100 }, text: 'Cut 100 threads.' },
    blurb: 'Blind since she was six and the first person in the town to see the strings. She will not explain this. She only says: not the body.'
  },

  ash: {
    id: 'ash', name: 'Cardinal Ash', title: 'Who Ordered the Burning',
    portrait: 'char_ash', weapon: 'pyrebell',
    trait: T('might', 1.25),
    traits: [T('might', 1.25), T('speed', 0.85)],
    perk: null,
    unlock: { id: 'char_ash', kind: 'char', cond: { bossesBeaten: 3 }, text: 'Put down three Choirmasters.' },
    blurb: 'He gave the order to fire Ashgate with nine hundred people still inside it, on the grounds that it would stop the spread. It did not stop the spread.'
  },

  hand: {
    id: 'hand', name: "The Ninth's Hand", title: 'What Was Left Holding',
    portrait: 'char_hand', weapon: 'marionette',
    // luck scales the Freed roll (DESIGN §2.2); the perk makes the Freed permanent.
    trait: T('luck', 1.30),
    traits: [T('luck', 1.30), T('armour', 0.5)],
    perk: { id: 'nofraying', desc: 'Freed allies never expire.', params: {} },
    unlock: { id: 'char_hand', kind: 'char', cond: { storyComplete: true }, text: 'Finish the story.' },
    blurb: 'It does not say what it was before. It holds the threads the way you hold a door for somebody, and it is very patient about being asked to let go.'
  }

});

export const list = Object.freeze(Object.keys(CHARACTERS).map(k => CHARACTERS[k]));

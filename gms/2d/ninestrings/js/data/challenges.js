// js/data/challenges.js — twenty bounded runs. DESIGN §5.
//
// A challenge is one stage, one objective, one restriction. It is not a harder
// version of the game; it is a sentence that makes you build differently, and
// it is short enough to lose without resenting it.
//
// `objective` is what must be true for a pass; `restriction` is what the run
// setup forces. Both are declarative and use the vocabularies below, which are
// also written out in docs/lanes/C-meta.md as a work order.
//
//   objective  clear:true · survive:seconds · kills:n · cuts:n · conductors:n
//              boss:'enemyId' · level:n · noDamage:true · cutsOverKills:true
//              bossUnder:seconds
//   restriction character:'id' · weapons:['id'] (only these may be offered)
//              noWeapons:true · noPassives:true · noLevelUps:true
//              relics:['id'] (forced loadout) · sigils:['id'] (forced draft)
//              noSanctum:true · curse:n · timeLimit:seconds
//
// `requires` uses the same cond vocabulary as unlocks.js.

const C = (id, name, stage, desc, objective, restriction, souls, unlocks, requires) => ({
  id, name, stage, desc, objective, restriction,
  reward: unlocks && unlocks.length ? { souls, unlocks } : { souls },
  requires: requires || { stageCleared: stage }
});

export const CHALLENGES = Object.freeze({

  first_light: C('first_light', 'First Light', 's1',
    'The round, the way you used to walk it. Nothing added.',
    { clear: true }, { noLevelUps: true }, 200, null),

  one_breath: C('one_breath', 'One Breath', 's1',
    'Bellfield Lane without being touched once.',
    { clear: true, noDamage: true }, {}, 450, ['hollow_ribs']),

  thread_count: C('thread_count', 'Thread Count', 's2',
    'Sixty threads before the five-minute mark. Aim at the gaps.',
    { cuts: 60, survive: 300 }, { timeLimit: 300 }, 300, null),

  low_water: C('low_water', 'Low Water', 's2',
    'The Row with nothing thrown. Only what you leave on the ground.',
    { clear: true }, { weapons: ['salt', 'hexcandle', 'gravebloom'] }, 350, null),

  bare_handed: C('bare_handed', 'Bare Handed', 's3',
    'Three hundred of them at the Ossuary, and not one stat taken.',
    { kills: 300 }, { noPassives: true }, 350, null),

  quiet_hour: C('quiet_hour', 'The Quiet Hour', 's3',
    'Vane has read for four hundred of them. Let her finish one.',
    { boss: 'hollowth' }, { character: 'vane' }, 400, null),

  gravedigger: C('gravedigger', 'Gravedigger', 's4',
    'Five hundred in the marsh. Dredge knows where the soft ground is.',
    { kills: 500 }, { character: 'dredge' }, 400, ['one_good_hand']),

  saltline: C('saltline', 'Saltline', 's4',
    "Widow's Marsh with a line of salt and nothing else.",
    { clear: true }, { weapons: ['salt'] }, 450, null),

  the_fast: C('the_fast', 'The Fast', 's5',
    'Nine days without. Nothing comes to you; you go to it.',
    { clear: true }, { relics: ['fasting'] }, 450, null),

  not_the_body: C('not_the_body', 'Not the Body', 's5',
    'Finish the chapel having cut more threads than you have killed bodies.',
    { clear: true, cutsOverKills: true }, {}, 550, null),

  nine_conductors: C('nine_conductors', 'Nine Conductors', 's6',
    'Nine of them off the ceiling of the Threadworks in one run.',
    { conductors: 9 }, {}, 500, null),

  blind: C('blind', 'Blind', 's6',
    'Ilse never took a damage upgrade in her life and nobody has caught her yet.',
    { clear: true }, { character: 'ilse', noPassives: true }, 600, null),

  no_lamp: C('no_lamp', 'No Lamp', 's7',
    'Ashgate with the dead lamp. Whatever opens, stays open.',
    { clear: true }, { relics: ['dead_lamp'] }, 550, null),

  the_burning: C('the_burning', 'The Burning', 's7',
    'Ash gave the order. Ash can walk back through it on one hit point.',
    { clear: true }, { character: 'ash', relics: ['hollow_ribs'] }, 700,
    null, { allOf: [{ stageCleared: 's7' }, { challenge: 'one_breath' }] }),

  eleven_wards: C('eleven_wards', 'Eleven Wards', 's8',
    'Level forty before the Long Hospital runs out of rooms.',
    { level: 40 }, {}, 600, null),

  ledger: C('ledger', 'The Ledger', 's8',
    'Fourteen minutes in the wards with one weapon and no Sanctum behind you.',
    { survive: 840 }, { weapons: ['tolling'], noSanctum: true }, 700, null),

  full_choir: C('full_choir', 'Full Choir', 's9',
    'Twelve Conductors out of the hall before Morrow raises his arms.',
    { conductors: 12 }, {}, 800, null),

  tempo: C('tempo', 'Tempo', 's9',
    'Morrow conducts in strict time. Do not give him two minutes of it.',
    { boss: 'morrow', bossUnder: 90 }, {}, 900, null),

  read_the_loom: C('read_the_loom', 'Read the Loom', 's11',
    'Four hundred names cut off the frame in a single descent.',
    { cuts: 400 }, {}, 900, ['long_thread']),

  the_ninth: C('the_ninth', 'The Ninth', 's12',
    'The throne at Curse III. It has been waiting; keep it waiting.',
    { boss: 'ninth' }, { curse: 3 }, 2500, ['ninth_favour'],
    { allOf: [{ stageCleared: 's12' }, { curseTier: { stage: 's12', tier: 2 } }] })

});

export const list = Object.freeze(Object.keys(CHALLENGES).map(k => CHALLENGES[k]));

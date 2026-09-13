// js/data/sigils.js — eighteen rule-benders, drafted at 5/10/15 minutes.
// CONTRACTS §8.4, DESIGN §5.
//
// A passive changes a number. A sigil changes a SENTENCE. If you can express
// one as a percentage it belongs in passives.js instead.
//
// `rule` is the exact line the draft screen shows and is the contract with the
// player: the sim must do what that sentence says, and nothing in this file is
// flavour. `params` is the data the behaviour needs; `behaviour` is the hook id
// the sim registers (always equal to `id`, spelled out so a grep for
// `behaviour` finds every one of them).
//
// Tier gates the draft: tier 1 at 5:00, tier 2 at 10:00, tier 3 at 15:00, so
// Act I runs (8 min) only ever see tier 1 and the tier-3 sigils exist purely to
// make a twenty-minute Act IV run into a different game.
//
// Required sim behaviour for every entry is written out in docs/lanes/C-meta.md.

export const SIGILS = Object.freeze({

  // ══════════════════════════════════ TIER 1 — drafted at 5:00

  chainsnap: {
    id: 'chainsnap', name: 'Chainsnap', tier: 1, behaviour: 'chainsnap',
    desc: 'A cut thread is still a thread, and it is still moving.',
    rule: 'A severed thread lashes to the nearest strung puppet and cuts that thread too.',
    params: { jumps: 1, range: 130 }
  },

  slack: {
    id: 'slack', name: 'Slack', tier: 1, behaviour: 'slack',
    desc: 'Whatever did the cutting is already ready to do it again.',
    rule: 'Cutting a thread refunds 25% of the cooldown of the weapon that cut it.',
    params: { pct: 0.25 }
  },

  carrion: {
    id: 'carrion', name: 'Carrion Tithe', tier: 1, behaviour: 'carrion',
    desc: 'Nine for nothing and the tenth for everything. It has always been that way.',
    rule: 'Every tenth kill drops a shard worth ten.',
    params: { every: 10, mult: 10 }
  },

  pilgrim: {
    id: 'pilgrim', name: "The Pilgrim's Rule", tier: 1, behaviour: 'pilgrim',
    desc: 'Keep walking. It is the whole of the instruction.',
    rule: 'You take no damage while moving. Standing still doubles damage taken.',
    params: { stillMul: 2.0, graceMs: 250 }
  },

  last_rites: {
    id: 'last_rites', name: 'Last Rites', tier: 1, behaviour: 'last_rites',
    desc: 'Vane charges for them now. She has stopped pretending she does not need to.',
    rule: 'Hearts heal nothing and pay 30 Souls instead.',
    params: { souls: 30 }
  },

  quickening: {
    id: 'quickening', name: 'Quickening', tier: 1, behaviour: 'quickening',
    desc: 'Every time you get better at this, you also get further from it.',
    rule: 'Each level-up makes you 4% faster for the rest of the run.',
    params: { per: 0.04 }
  },

  // ══════════════════════════════════ TIER 2 — drafted at 10:00

  severance: {
    id: 'severance', name: 'Severance', tier: 2, behaviour: 'severance',
    desc: 'It comes down under its own weight and it is under a great deal of tension.',
    rule: 'A cut thread falls, and strikes everything it lands across for 200% weapon damage.',
    params: { mul: 2.0, width: 10 }
  },

  standing_army: {
    id: 'standing_army', name: 'Standing Army', tier: 2, behaviour: 'standing_army',
    desc: 'They were somebody an hour ago. They can be somebody again for a minute.',
    rule: 'Freed allies last three times as long and fire your weapons at half damage.',
    params: { lifeMul: 3, weaponMul: 0.5 }
  },

  conductors_debt: {
    id: 'conductors_debt', name: "The Conductor's Debt", tier: 2, behaviour: 'conductors_debt',
    desc: 'Something has to hold the space they were holding.',
    rule: 'Every Conductor you kill permanently raises your area by 6% for the rest of the run.',
    params: { per: 0.06 }
  },

  black_mass: {
    id: 'black_mass', name: 'Black Mass', tier: 2, behaviour: 'black_mass',
    desc: 'A crowd is a single object, and objects can be dropped.',
    rule: 'A kill detonates for 60% of its own maximum health, and that detonation can kill.',
    params: { radius: 42, hpMul: 0.6, chainCap: 12 }
  },

  hollow_law: {
    id: 'hollow_law', name: 'Hollow Law', tier: 2, behaviour: 'hollow_law',
    desc: 'You stopped taking anything you had not put down yourself.',
    rule: 'You cannot pick up hearts. Every kill heals you 0.4 HP instead.',
    params: { perKill: 0.4 }
  },

  understudy: {
    id: 'understudy', name: 'Understudy', tier: 2, behaviour: 'understudy',
    desc: 'The one you keep forgetting about has been practising.',
    rule: 'Your lowest-level weapon gains a level every 90 seconds.',
    params: { every: 90 }
  },

  // ══════════════════════════════════ TIER 3 — drafted at 15:00
  // These are meant to be slightly absurd. A twenty-minute run that ends the
  // same way it started is a twenty-minute run nobody takes twice.

  no_hands: {
    id: 'no_hands', name: 'No Hands', tier: 3, behaviour: 'no_hands',
    desc: 'You put them down. You can put them down.',
    rule: 'You lose every weapon. Every thread you touch is cut, every cut Frees, and Freed allies never expire.',
    params: { touchSever: true, freedChance: 1.0, freedLife: -1 /* -1 = never expires */ }
  },

  ninth_note: {
    id: 'ninth_note', name: 'The Ninth Note', tier: 3, behaviour: 'ninth_note',
    desc: 'You have heard enough of the song to sing one bar of it back.',
    rule: 'Every 30 seconds, every thread on screen is cut at once.',
    params: { every: 30 }
  },

  unravelling: {
    id: 'unravelling', name: 'Unravelling', tier: 3, behaviour: 'unravelling',
    desc: 'The threads have to run to somebody. There was never a rule about who.',
    rule: 'Severed threads re-attach to YOU. Each one bleeds its puppet for 8% of your damage a second, and each one slows you by 1%.',
    params: { dps: 0.08, slow: 0.01, cap: 40 }
  },

  apotheosis: {
    id: 'apotheosis', name: 'Apotheosis', tier: 3, behaviour: 'apotheosis',
    desc: 'You stop needing the shards. That should worry you more than it does.',
    rule: 'You level up every 20 seconds. Shards give no XP at all.',
    params: { every: 20 }
  },

  puppet_king: {
    id: 'puppet_king', name: 'Puppet King', tier: 3, behaviour: 'puppet_king',
    desc: 'It was holding nineteen of them. Now you are.',
    rule: "Kill a Conductor and its whole Choir is Freed to your side, permanently.",
    params: { permanent: true }
  },

  last_bell: {
    id: 'last_bell', name: 'The Last Bell', tier: 3, behaviour: 'last_bell',
    desc: 'Ash rang it once, at Ashgate, and did not put it down afterwards.',
    rule: 'You have 1 HP and cannot be healed. You deal triple damage, and every cut makes you untouchable for one second.',
    params: { maxHpSet: 1, noHeal: true, mightMul: 3.0, iframes: 1.0 }
  }

});

export const list = Object.freeze(Object.keys(SIGILS).map(k => SIGILS[k]));

// The three draft moments (DESIGN §5). `n` is how many are offered.
export const SIGIL_DRAFTS = Object.freeze([
  Object.freeze({ at: 300, tier: 1, n: 3 }),
  Object.freeze({ at: 600, tier: 2, n: 3 }),
  Object.freeze({ at: 900, tier: 3, n: 2 })
]);

export const byTier = (tier) => list.filter(s => s.tier === tier);

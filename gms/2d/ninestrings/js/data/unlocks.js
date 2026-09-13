// js/data/unlocks.js — the ladder. CONTRACTS §8.4, DESIGN §4 (the ramp),
// §5 (systems) and §6 (the cast).
//
// D9: nothing in the UI exists before it is earned. This file is the single
// list of what "earned" means, so a screen never has to ask a second question.
//
// `cond` is DECLARATIVE and is evaluated against the `Save` shape in
// CONTRACTS §6 by one generic evaluator that a later lane writes. Keys inside
// one cond object are ANDed. The vocabulary is fixed and documented in
// docs/lanes/C-meta.md — do not add a key here without adding it there, or the
// evaluator will silently return false and the unlock will never fire.
//
//   always              true
//   stageCleared        stage id in save.stagesCleared
//   stagesClearedCount  >= n keys in save.stagesCleared
//   bossesBeaten        >= n cleared stages that have a `boss`
//   storyComplete       s12 cleared
//   kills/cuts/runs/conductorsKilled/bestTime   >= n, from save.stats
//   killsInRun          >= n, from save.stats.bestKills   (SAVE FIELD REQUEST)
//   hasChar             char id in save.chars
//   unlocked            unlock id in save.unlocks
//   challenge           challenge id truthy in save.challenges
//   challengesDone      >= n truthy entries in save.challenges
//   curseTier           { stage, tier } — save.curse[stage] >= tier
//   anyOf / allOf       arrays of nested conds
//
// `kind` is the contract's 'char'|'weapon'|'stage'|'mode'|'sigil' plus two the
// contract does not have: 'system' for the §4 ramp items (the Sanctum,
// passives, chests, the relic slots) and 'relic' for the four relics that are
// earned rather than given. Both widenings are requested in the lane file.
//
// `effect` is optional and is read by the UI: it is how "4 choices at
// level-up" and "a second relic slot" stop being prose in DESIGN and become
// data the level-up screen can read.

import { list as charList } from './characters.js';

// The six character unlocks are defined once, on the characters themselves,
// and mirrored in here. One source, so they can never disagree.
const CHAR_UNLOCKS = charList.map(c => c.unlock);

const U = (id, kind, cond, text, effect) =>
  effect ? { id, kind, cond, text, effect } : { id, kind, cond, text };

const entries = [

  // ───────────────────────────────────────── stages (linear, one per clear)
  U('s1', 'stage', { always: true }, 'Bellfield Lane'),
  U('s2', 'stage', { stageCleared: 's1' }, 'Clear Bellfield Lane'),
  U('s3', 'stage', { stageCleared: 's2' }, 'Clear The Flooded Row'),
  U('s4', 'stage', { stageCleared: 's3' }, 'Put down Hollowth'),
  U('s5', 'stage', { stageCleared: 's4' }, "Clear Widow's Marsh"),
  U('s6', 'stage', { stageCleared: 's5' }, 'Clear The Drowned Chapel'),
  U('s7', 'stage', { stageCleared: 's6' }, 'Put down Vellish'),
  U('s8', 'stage', { stageCleared: 's7' }, 'Clear Ashgate'),
  U('s9', 'stage', { stageCleared: 's8' }, 'Clear The Long Hospital'),
  U('s10', 'stage', { stageCleared: 's9' }, 'Put down Cantor Morrow'),
  U('s11', 'stage', { stageCleared: 's10' }, 'Clear The Descent'),
  U('s12', 'stage', { stageCleared: 's11' }, 'Clear The Loom of Names'),

  // ───────────────────────────────────────── the §4 ramp
  // Each of these is the exact row of DESIGN §4's table. The ids match the
  // `rewards.unlocks` arrays in stages.js, which is the other half of the wiring.
  U('sanctum', 'system', { stageCleared: 's1' },
    'Souls are worth something now. The Sanctum opens.'),
  U('passives', 'system', { stageCleared: 's2' },
    'Passives enter the level-up pool.',
    { offers: 3 }),
  U('chests', 'system', { stageCleared: 's3' },
    'Conductors drop chests.'),
  U('evolutions', 'system', { stageCleared: 's3' },
    'A maxed weapon with the right passive can become something else.'),
  U('relics', 'system', { stageCleared: 's4' },
    'Relics. Choose before you go in.',
    { offers: 4, relicSlots: 1 }),
  U('relicslot2', 'system', { stageCleared: 's7' },
    'A second relic slot.',
    { relicSlots: 2 }),
  U('sigils', 'system', { stageCleared: 's6' },
    'Sigils. Drafted at five, ten and fifteen minutes.'),
  U('curse', 'system', { stageCleared: 's9' },
    'Curse tiers. Harder, and it pays for itself.',
    { offers: 5 }),
  U('relicslot3', 'system', { stageCleared: 's10' },
    'A third relic slot.',
    { relicSlots: 3 }),

  // ───────────────────────────────────────── the cast (DESIGN §6)
  ...CHAR_UNLOCKS,

  // ───────────────────────────────────────── modes
  U('endless', 'mode', { storyComplete: true },
    'Endless. It does not have an end and it never did.'),
  U('choirhunt', 'mode', { storyComplete: true },
    'Choir-Hunt. Conductors only, and they are all looking for you.'),

  // ───────────────────────────────────────── weapons entering the general pool
  // lantern, salt and nails are in from the first run: the opening pool has to
  // be small enough that a first level-up is a real decision and not a menu.
  U('lantern', 'weapon', { always: true }, 'Lantern'),
  U('salt', 'weapon', { always: true }, 'Sanctified Salt'),
  U('nails', 'weapon', { always: true }, 'Iron Nails'),
  U('gravepistol', 'weapon', { kills: 1000 }, 'Kill 1,000 of them'),
  U('chain', 'weapon', { cuts: 250 }, 'Cut 250 threads'),
  U('hexcandle', 'weapon', { stageCleared: 's4' }, "Clear Widow's Marsh"),
  U('kite', 'weapon', { conductorsKilled: 25 }, 'Kill 25 Conductors'),
  U('gravebloom', 'weapon', { stageCleared: 's5' }, 'Clear The Drowned Chapel'),
  U('choirbreaker', 'weapon', { conductorsKilled: 60 }, 'Kill 60 Conductors'),
  U('tolling', 'weapon', { stageCleared: 's8' }, 'Clear The Long Hospital'),

  // ───────────────────────────────────────── sigils that must be earned
  // Every other sigil is in the draft pool the moment `sigils` unlocks. These
  // three are not, because each one deletes a rule the game is built on.
  U('no_hands', 'sigil', { cuts: 1000 }, 'Cut 1,000 threads'),
  U('puppet_king', 'sigil', { conductorsKilled: 150 }, 'Kill 150 Conductors'),
  U('unravelling', 'sigil', { stageCleared: 's11' }, 'Read the Loom'),

  // ───────────────────────────────────────── relics behind challenges
  // Ten of the fourteen arrive with the `relics` system at stage 4. These four
  // are the ones that delete a rule, so they are earned rather than given.
  U('hollow_ribs', 'relic', { challenge: 'one_breath' }, 'Finish the challenge: One Breath'),
  U('one_good_hand', 'relic', { challenge: 'gravedigger' }, 'Finish the challenge: Gravedigger'),
  U('long_thread', 'relic', { challenge: 'read_the_loom' }, 'Finish the challenge: Read the Loom'),
  U('ninth_favour', 'relic', { challenge: 'the_ninth' }, 'Finish the challenge: The Ninth')
];

export const UNLOCKS = Object.freeze(
  entries.reduce((o, e) => { o[e.id] = Object.freeze(e); return o; }, {})
);

export const list = Object.freeze(Object.keys(UNLOCKS).map(k => UNLOCKS[k]));

// ──────────────────────────────────────────────────────────────────────────
// THE FIRST-RUN RAMP — DESIGN §4's first six rows.
//
// These are not save unlocks; they are in-run beats on stage 1 of a fresh
// save, fired by the sim as {t:'say', key} (CONTRACTS §7.3). `trigger.at` is
// seconds into the run; `trigger.event` fires on the first occurrence of that
// world event instead. `screen` beats are fired by the UI the first time that
// screen is shown, not by the sim.
//
// Times match stages.js s1 exactly: the first Conductor is at 180 there and at
// 180 here. If one moves, the other must.

export const TUTORIAL = Object.freeze([
  Object.freeze({ id: 'move', stage: 's1', trigger: { at: 0 }, say: 'tut_move' }),
  Object.freeze({ id: 'weapon', stage: 's1', trigger: { at: 30 }, say: 'tut_weapon', grants: 'signature' }),
  Object.freeze({ id: 'shard', stage: 's1', trigger: { event: 'pickup', kind: 'shard' }, say: 'tut_shard' }),
  Object.freeze({ id: 'levelup', stage: 's1', trigger: { event: 'levelup' }, say: 'tut_levelup', effect: { offers: 2 } }),
  // The 2:00 beat is the whole game in one second: hitstop, slow motion, and
  // the thread lit while everything else drops to near black.
  Object.freeze({ id: 'string', stage: 's1', trigger: { at: 120 }, say: 'tut_string', hitstop: 0.45, slowmo: 0.2, highlight: 'string' }),
  Object.freeze({ id: 'cut', stage: 's1', trigger: { at: 123 }, say: 'tut_cut' }),
  Object.freeze({ id: 'cutdone', stage: 's1', trigger: { event: 'cut' }, say: 'tut_cut_done' }),
  Object.freeze({ id: 'conductor', stage: 's1', trigger: { at: 180 }, say: 'tut_conductor', highlight: 'conductor' }),
  Object.freeze({ id: 'conductordown', stage: 's1', trigger: { event: 'conductorDown' }, say: 'tut_conductor_down' }),
  Object.freeze({ id: 'freed', stage: 's1', trigger: { event: 'freed' }, say: 'tut_freed' }),
  Object.freeze({ id: 'chest', stage: null, trigger: { event: 'chest' }, say: 'tut_chest' }),
  Object.freeze({ id: 'souls', stage: null, trigger: { screen: 'results' }, say: 'tut_souls' }),
  Object.freeze({ id: 'relic', stage: null, trigger: { screen: 'loadout' }, say: 'tut_relic' }),
  Object.freeze({ id: 'sigil', stage: null, trigger: { screen: 'sigildraft' }, say: 'tut_sigil' }),
  Object.freeze({ id: 'curse', stage: null, trigger: { screen: 'stageSelect', after: 'curse' }, say: 'tut_curse' })
]);

// Level-up offer count and relic slots, resolved from whatever is unlocked.
// The default is DESIGN §4's opening: two obviously-good choices and no slots.
export const BASE_OFFERS = 2;
export const BASE_RELIC_SLOTS = 0;

export function resolveEffects(unlockedIds) {
  const out = { offers: BASE_OFFERS, relicSlots: BASE_RELIC_SLOTS };
  for (const id of unlockedIds) {
    const e = UNLOCKS[id] && UNLOCKS[id].effect;
    if (!e) continue;
    if (e.offers > out.offers) out.offers = e.offers;
    if (e.relicSlots > out.relicSlots) out.relicSlots = e.relicSlots;
  }
  return out;
}

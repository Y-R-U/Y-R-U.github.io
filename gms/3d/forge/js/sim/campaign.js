// The 15 acts and the 87-quest reward catalogue. Objectives and school assignments come from
// STORY.md §8; every XP and mark amount is generated here from SYSTEMS.md §10.3's formula.
//
// This is balance data, not the quest runtime: `sim/quest.js` and data/quests/*.json own the
// objectives the player actually plays. What lives here is what each quest pays and roughly what
// work it asks for, so tools/soak.mjs can walk the campaign without a renderer or a quest pack.
//
// `work` verbs: kill catch sell cook forage rock mend evade absorb travel escort talk interact survive
// Distances are metres; WORLD.md puts the towns 505 m and 573 m apart.

import { xpToReach, MAX_LEVEL } from './xp.js';

export const TOWN_LEG = { light_neutral: 505, neutral_dark: 573, inTown: 80 };

// `mk` is the act's whole quest-pay budget, divided between its quests by weight. Sale proceeds,
// drops and cooking are separate income and belong to §7.
export const ACTS = [
  { id: 'L1', campaign: 'light',   n: 1, title: 'Take it seriously',    region: 'whitewall_low',      lead: 3,  mk: 40 },
  { id: 'L2', campaign: 'light',   n: 2, title: 'The water runs thin',  region: 'river',              lead: 5,  mk: 110 },
  { id: 'L3', campaign: 'light',   n: 3, title: 'The middle ground',    region: 'fields',             lead: 7,  mk: 170 },
  { id: 'L4', campaign: 'light',   n: 4, title: 'The far bank',         region: 'whitewall_upper',    lead: 8,  mk: 230 },
  { id: 'L5', campaign: 'light',   n: 5, title: 'The even hand',        region: 'blackstone_approach',lead: 10, mk: 340 },
  { id: 'D1', campaign: 'dark',    n: 1, title: 'Down the ladder',      region: 'blackstone_town',    lead: 11, mk: 400 },
  { id: 'D2', campaign: 'dark',    n: 2, title: 'Less every month',     region: 'blackstone_town',    lead: 12, mk: 400 },
  { id: 'D3', campaign: 'dark',    n: 3, title: 'The grain deal',       region: 'fields',             lead: 13, mk: 500 },
  { id: 'D4', campaign: 'dark',    n: 4, title: 'Water raid',           region: 'blackstone_approach',lead: 14, mk: 600 },
  { id: 'D5', campaign: 'dark',    n: 5, title: 'Hold the head',        region: 'blackstone_town',    lead: 15, mk: 800 },
  { id: 'N1', campaign: 'neutral', n: 1, title: 'A farm year',          region: 'fields',             lead: 16, mk: 500 },
  { id: 'N2', campaign: 'neutral', n: 2, title: 'Wearing Whitewall',    region: 'whitewall_upper',    lead: 17, mk: 700 },
  { id: 'N3', campaign: 'neutral', n: 3, title: 'Wearing Blackstone',   region: 'blackstone_town',    lead: 18, mk: 850 },
  { id: 'N4', campaign: 'neutral', n: 4, title: 'The root',             region: 'fields',             lead: 19, mk: 1000 },
  { id: 'N5', campaign: 'neutral', n: 5, title: 'The valley',           region: 'finale',             lead: 20, mk: 1300 },
];

export const QUESTS = [
  { id: 'L01', act: 'L1', title: 'The Granary', w: 'main', schools: ['cull', 'kindle'],
    work: [['kill', 'grain_rat', 8], ['interact', 1]] },
  { id: 'L02', act: 'L1', title: 'Line and Water', w: 'main', schools: ['line'],
    work: [['catch', 'whitewall', 8]] },
  { id: 'L03', act: 'L1', title: 'Market Day', w: 'chore', schools: ['barter'],
    work: [['travel', 120], ['sell', 'silverling', 5], ['sell', 'rat_tail', 8], ['talk', 2]] },
  { id: 'L04', act: 'L1', title: "Cook's Hands", w: 'chore', schools: ['hearth'],
    work: [['cook', 'silverling', 6], ['interact', 3]] },
  { id: 'L05', act: 'L1', title: 'Standing Watch', w: 'main', schools: ['ward', 'kindle'],
    work: [['survive', 90], ['kill', 'mire_rat', 2], ['absorb', 3, 8]] },
  { id: 'L06', act: 'L1', title: 'The Even Hand', w: 'finale', xpAll: true,
    work: [['travel', 100], ['talk', 4]] },

  { id: 'L07', act: 'L2', title: 'Low Water', w: 'main', schools: ['line', 'forage'],
    work: [['travel', 400], ['interact', 6]] },
  { id: 'L08', act: 'L2', title: 'What the Weed Says', w: 'chore', schools: ['forage'],
    work: [['forage', 'whitewall', 9]] },
  { id: 'L09', act: 'L2', title: 'The Temple Draw', w: 'main', schools: ['ward', 'setting'],
    work: [['travel', 200], ['interact', 2]] },
  { id: 'L10', act: 'L2', title: 'Two Ledgers', w: 'chore', schools: ['barter'],
    work: [['interact', 4], ['talk', 2]] },
  { id: 'L11', act: 'L2', title: 'Escort West', w: 'main', schools: ['ward'],
    work: [['escort', 500], ['kill', 'rat_knot', 4]] },
  { id: 'L12', act: 'L2', title: 'The Fish Are Wrong', w: 'finale', schools: ['hearth'],
    work: [['catch', 'whitewall', 4], ['cook', 'chalk_trout', 4]] },

  { id: 'L13', act: 'L3', title: 'Down the Valley', w: 'chore', schools: ['barter'],
    work: [['travel', 505], ['talk', 2]] },
  { id: 'L14', act: 'L3', title: "The Miller's Price", w: 'chore', schools: ['barter'],
    work: [['talk', 3]] },
  { id: 'L15', act: 'L3', title: 'Three Chores for Hana', w: 'main', schools: ['forage', 'setting'],
    work: [['forage', 'longacre', 6], ['rock', 'chalk', 4], ['escort', 120]] },
  { id: 'L16', act: 'L3', title: 'A Cousin in the Crowd', w: 'chore', schools: ['line'],
    work: [['talk', 2], ['travel', 120], ['catch', 'longacre', 8]] },
  { id: 'L25', act: 'L3', title: 'Bread for the Road', w: 'chore', schools: ['hearth'],
    work: [['cook', 'wheatglass', 6], ['travel', 200], ['interact', 2]] },
  { id: 'L17', act: 'L3', title: 'What Fen Carries', w: 'finale', schools: ['barter', 'ward'],
    work: [['escort', 505], ['interact', 6]] },

  { id: 'L18', act: 'L4', title: 'Smoke on the East Wind', w: 'main', schools: ['cull', 'kindle'],
    work: [['travel', 300], ['kill', 'sour_crow', 6], ['kill', 'blight_boar', 2]] },
  { id: 'L19', act: 'L4', title: 'The Captive', w: 'chore', xpAll: true,
    work: [['talk', 3]] },
  { id: 'L20', act: 'L4', title: "The Shaft's Mouth", w: 'main', schools: ['ward', 'glamour'],
    work: [['travel', 500], ['evade', 10, 4]] },
  { id: 'L26', act: 'L4', title: 'Feeding the Picket', w: 'chore', schools: ['hearth', 'line'],
    work: [['catch', 'whitewall', 6], ['cook', 'chalk_trout', 6], ['travel', 300], ['interact', 3]] },
  { id: 'L27', act: 'L4', title: 'The Crab Stands', w: 'main', schools: ['cull', 'line'],
    work: [['kill', 'creek_crab', 9], ['catch', 'whitewall', 4]] },
  { id: 'L21', act: 'L4', title: 'The Dry Stand', w: 'finale', schools: ['forage', 'line'],
    work: [['travel', 573], ['interact', 3], ['catch', 'blackstone', 6]] },

  { id: 'L22', act: 'L5', title: "Ivo's Room", w: 'main', schools: ['ward', 'mend'],
    work: [['interact', 4], ['mend', 3, 2]] },
  { id: 'L28', act: 'L5', title: 'Two Hundred Bowls', w: 'chore', schools: ['hearth'],
    work: [['catch', 'whitewall', 8], ['cook', 'chalk_trout', 14], ['interact', 4]] },
  { id: 'L23', act: 'L5', title: 'The Strike on Blackstone', w: 'main', schools: ['kindle', 'cull', 'ward'],
    work: [['travel', 573], ['kill', 'hollow', 6], ['kill', 'watchman', 6], ['survive', 240], ['absorb', 12, 20]] },
  { id: 'L24', act: 'L5', title: 'The Covenant, Read Again', w: 'finale', xpAll: true,
    work: [['talk', 5]], echo: 'white_cord', unlocks: 'dark' },

  { id: 'D01', act: 'D1', title: 'The Posting', w: 'main', schools: ['cull', 'kindle'],
    work: [['kill', 'mire_rat', 10], ['kill', 'creek_crab', 4]] },
  { id: 'D02', act: 'D1', title: "Sela's Question", w: 'chore', xpAll: true,
    work: [['talk', 5]] },
  { id: 'D03', act: 'D1', title: 'Night Line', w: 'main', schools: ['line'],
    work: [['catch', 'blackstone', 14]] },
  { id: 'D04', act: 'D1', title: "What It's Worth", w: 'chore', schools: ['barter'],
    work: [['sell', 'blackeel', 8], ['talk', 2]] },
  { id: 'D05', act: 'D1', title: 'Two Pots', w: 'chore', schools: ['hearth'],
    work: [['cook', 'blackeel', 8], ['interact', 8]] },
  { id: 'D06', act: 'D1', title: 'The Tally', w: 'finale', xpAll: true, schools: ['ward'],
    work: [['travel', 400], ['talk', 3]] },

  { id: 'D07', act: 'D2', title: 'Chasing the Seam', w: 'main', schools: ['setting', 'forage'],
    work: [['travel', 300], ['rock', 'iron_glass', 5], ['interact', 3]] },
  { id: 'D08', act: 'D2', title: 'Dead Water', w: 'chore', schools: ['line'],
    work: [['interact', 3], ['catch', 'blackstone', 6]] },
  { id: 'D09', act: 'D2', title: 'Upstream', w: 'main', schools: ['forage', 'line'],
    work: [['travel', 573], ['interact', 3], ['forage', 'longacre', 4], ['catch', 'longacre', 6]] },
  { id: 'D23', act: 'D2', title: 'The Old Workings', w: 'main', schools: ['cull', 'mend'],
    work: [['kill', 'mire_rat', 10], ['kill', 'rat_knot', 4], ['mend', 3, 5], ['interact', 3]] },
  { id: 'D10', act: 'D2', title: 'A Bowl for the Shift', w: 'finale', schools: ['hearth'],
    work: [['forage', 'blackstone', 8], ['cook', 'silt_carp', 10]] },

  { id: 'D11', act: 'D3', title: "The Miller's Terms", w: 'main', schools: ['barter'],
    work: [['travel', 573], ['sell', 'gravecap', 10]] },
  { id: 'D12', act: 'D3', title: 'Weighing Hana', w: 'chore', schools: ['barter'],
    work: [['talk', 3]] },
  { id: 'D13', act: 'D3', title: 'Three Chores for Hana', w: 'main', schools: ['forage', 'setting', 'mend'],
    work: [['forage', 'longacre', 6], ['rock', 'chalk', 4], ['mend', 3, 3]] },
  { id: 'D14', act: 'D3', title: 'The Face at the Board', w: 'chore', schools: ['barter', 'glamour'],
    work: [['talk', 3], ['evade', 12, 3]] },
  { id: 'D24', act: 'D3', title: 'The Quota', w: 'main', schools: ['cull', 'barter'],
    work: [['kill', 'mire_rat', 20], ['sell', 'rat_tail', 20], ['talk', 2]] },
  { id: 'D15', act: 'D3', title: "What Fen Won't Say", w: 'finale', schools: ['barter'],
    work: [['escort', 505], ['interact', 6]] },

  { id: 'D16', act: 'D4', title: 'What We Came For', w: 'main', schools: ['ward', 'glamour'],
    work: [['travel', 500], ['evade', 12, 5], ['survive', 180]] },
  { id: 'D17', act: 'D4', title: 'Sela Is Home', w: 'chore', xpAll: true,
    work: [['talk', 4]] },
  { id: 'D18', act: 'D4', title: 'The Watcher on the Ridge', w: 'main', schools: ['ward'],
    work: [['travel', 400], ['interact', 3], ['kill', 'hollow', 4]] },
  { id: 'D19', act: 'D4', title: 'Below the Bottom', w: 'finale', schools: ['setting', 'cull'],
    work: [['rock', 'obsidian', 6], ['kill', 'hollow', 8]] },

  { id: 'D20', act: 'D5', title: 'Everything Down', w: 'main', schools: ['setting', 'barter'],
    work: [['interact', 10], ['travel', 200], ['sell', 'obsidian_core', 6]] },
  { id: 'D25', act: 'D5', title: 'Feeding the Retake', w: 'chore', schools: ['hearth'],
    work: [['cook', 'blackeel', 12], ['interact', 6]] },
  { id: 'D21', act: 'D5', title: 'The Night We Came Back Up', w: 'main', schools: ['kindle', 'cull', 'ward'],
    work: [['kill', 'watchman', 12], ['survive', 300], ['absorb', 12, 30]] },
  { id: 'D22', act: 'D5', title: 'What the Root Is', w: 'finale', schools: ['setting'],
    work: [['travel', 800], ['rock', 'obsidian', 4]], echo: 'short_rope', unlocks: 'neutral' },

  { id: 'N01', act: 'N1', title: 'Coming Home', w: 'chore', xpAll: true,
    work: [['travel', 573], ['talk', 4]] },
  { id: 'N02', act: 'N1', title: 'The Seed Store', w: 'main', schools: ['cull'],
    work: [['kill', 'grain_rat', 14], ['interact', 2]] },
  { id: 'N03', act: 'N1', title: 'The Quiet Stretch', w: 'main', schools: ['line'],
    work: [['catch', 'longacre', 16]] },
  { id: 'N04', act: 'N1', title: 'Market Post', w: 'main', schools: ['barter'],
    work: [['sell', 'ford_eel', 10], ['interact', 2]] },
  { id: 'N05', act: 'N1', title: 'A Loaf From the West Field', w: 'chore', schools: ['hearth'],
    work: [['forage', 'longacre', 8], ['cook', 'wheatglass', 12]] },
  { id: 'N22', act: 'N1', title: 'Harvest Supper', w: 'main', schools: ['hearth'],
    work: [['forage', 'longacre', 8], ['cook', 'wheatglass', 14], ['interact', 4]] },
  { id: 'N06', act: 'N1', title: 'Two Guests', w: 'chore', schools: ['barter', 'ward', 'glamour'],
    work: [['talk', 6]] },
  { id: 'N07', act: 'N1', title: 'Grafting', w: 'finale', schools: ['glamour'],
    work: [['interact', 4]], grants: 'graft' },

  { id: 'N08', act: 'N2', title: 'A Cousin Called Ansel', w: 'main', schools: ['glamour'],
    work: [['travel', 505], ['interact', 2], ['evade', 12, 4]] },
  { id: 'N23', act: 'N2', title: 'The Ford Run', w: 'chore', schools: ['line', 'barter'],
    work: [['catch', 'longacre', 10], ['travel', 505], ['sell', 'ford_eel', 10]] },
  { id: 'N09', act: 'N2', title: 'Weigh the Temple', w: 'main', schools: ['barter', 'ward'],
    work: [['interact', 4], ['evade', 12, 3]] },
  { id: 'N10', act: 'N2', title: 'A Crate Both Ways', w: 'chore', schools: ['barter'],
    work: [['interact', 6]] },
  { id: 'N11', act: 'N2', title: 'The Eighth Day, From the Cart', w: 'finale', schools: ['ward', 'glamour'],
    work: [['escort', 500], ['evade', 12, 3]] },

  { id: 'N12', act: 'N3', title: 'A Face Called Sela', w: 'chore', schools: ['glamour'],
    work: [['interact', 3]] },
  { id: 'N13', act: 'N3', title: 'Down the Ladder', w: 'main', schools: ['setting', 'glamour'],
    work: [['travel', 573], ['evade', 12, 5], ['rock', 'obsidian', 3]] },
  { id: 'N25', act: 'N3', title: 'Both Kitchens', w: 'main', schools: ['hearth', 'glamour'],
    work: [['cook', 'snowbarb', 6], ['cook', 'gravecap', 6], ['evade', 12, 3], ['travel', 505]] },
  { id: 'N14', act: 'N3', title: 'Wearing Sela', w: 'main', schools: ['glamour', 'ward'],
    work: [['talk', 4], ['survive', 240]] },
  { id: 'N15', act: 'N3', title: 'Out Through the Wall', w: 'finale', schools: ['mend', 'ward', 'glamour'],
    work: [['interact', 5], ['mend', 4, 3]] },

  { id: 'N24', act: 'N4', title: 'What Feeds on It', w: 'main', schools: ['cull'],
    work: [['kill', 'brood_mother', 1], ['kill', 'grain_rat', 16]] },
  { id: 'N16', act: 'N4', title: 'The West Field', w: 'main', schools: ['forage', 'setting'],
    work: [['interact', 6], ['rock', 'chalk', 6], ['forage', 'longacre', 6]] },
  { id: 'N26', act: 'N4', title: 'The Quiet Stretch, Again', w: 'chore', schools: ['line'],
    work: [['catch', 'longacre', 12]] },
  { id: 'N17', act: 'N4', title: 'What the Household Is', w: 'chore', xpAll: true,
    work: [['talk', 6]] },
  { id: 'N18', act: 'N4', title: 'Both Cores', w: 'main', schools: ['kindle', 'cull'],
    work: [['kill', 'champion_1', 1], ['kill', 'grain_rat', 12]] },
  { id: 'N19', act: 'N4', title: 'The Two Wars You Started', w: 'main', schools: ['barter'],
    work: [['interact', 8], ['travel', 300]] },
  { id: 'N20', act: 'N4', title: "Nobody's Face", w: 'finale', schools: ['glamour'],
    work: [['talk', 4]] },

  { id: 'N21', act: 'N5', title: 'Both Towns Marching', w: 'finale', xpAll: true,
    work: [['kill', 'watchman', 10], ['kill', 'champion_3', 1], ['survive', 300], ['talk', 6], ['absorb', 17, 30]],
    echo: 'long_furrow', unlocks: 'trilogy' },
];

// Board entries scale with the player's level in the named school; `n` is rolled when offered.
export const SANDBOX = [
  { id: 'S01', title: 'Vermin Contract',   school: 'cull',    work: [['kill', 'band', 6]] },
  { id: 'S02', title: 'Fish Order',        school: 'line',    work: [['catch', 'local', 6], ['travel', 150]] },
  { id: 'S03', title: 'Long Line',         school: 'line',    work: [['catch', 'local', 3]] },
  { id: 'S04', title: 'Kitchen Order',     school: 'hearth',  work: [['cook', 'local', 3], ['travel', 120]] },
  { id: 'S05', title: 'Panel Repair',      school: 'mend',    work: [['mend', 2, 5]] },
  { id: 'S06', title: 'After the Storm',   school: 'mend',    work: [['mend', 3, 3]] },
  { id: 'S07', title: 'Kerb and Course',   school: 'setting', work: [['rock', 'chalk', 6]] },
  { id: 'S08', title: 'Raise a Shed',      school: 'setting', work: [['rock', 'chalk', 4], ['interact', 4]] },
  { id: 'S09', title: 'Forage Run',        school: 'forage',  work: [['forage', 'local', 12]] },
  { id: 'S10', title: 'Leat Clearing',     school: 'forage',  work: [['forage', 'local', 6], ['interact', 4]] },
  { id: 'S11', title: 'Firewood',          school: 'forage',  work: [['forage', 'local', 8], ['rock', 'chalk', 2]] },
  { id: 'S12', title: 'Lost Hen',          school: null,      work: [['escort', 200]] },
  { id: 'S13', title: 'Escort the Cart',   school: 'ward',    work: [['escort', 505], ['kill', 'band', 3]] },
  { id: 'S14', title: 'Night Watch',       school: 'ward',    work: [['survive', 120], ['kill', 'band', 4], ['absorb', 'band', 12]] },
  { id: 'S15', title: 'Strays on the Road', school: 'kindle', work: [['kill', 'band', 5], ['travel', 250]] },
  { id: 'S16', title: 'Price Round',       school: 'barter',  work: [['travel', 1078], ['interact', 3]] },
  { id: 'S17', title: 'Appraise the Chest', school: 'barter', work: [['interact', 4]] },
  { id: 'S18', title: 'Ferry Shift',       school: 'barter',  work: [['escort', 505], ['interact', 4]] },
  { id: 'S19', title: 'Lamp Round',        school: 'kindle',  work: [['interact', 9], ['travel', 300]] },
  { id: 'S20', title: 'A Meal for the Bridge', school: 'hearth', work: [['cook', 'local', 2], ['travel', 400]] },
];

export const BOARD_SIZE = 3;

// S02 and S04 are posted on every board rather than rolled. The soak found Line and Hearth were
// the two schools the critical path under-served, and a random roll across twenty entries did not
// reliably supply either.
export const BOARD_ALWAYS = ['S02', 'S04'];

// SYSTEMS.md §10.3. `M` is the act's lead-school level; the reward is one level's worth of XP
// scaled by the quest's weight, paid to each named school.
export const QUEST_WEIGHT = { chore: 0.15, main: 0.30, finale: 0.60 };

export const questXp = (M, weight) => {
  const hi = Math.min(MAX_LEVEL, M + 1);
  return Math.round(weight * (xpToReach(hi) - xpToReach(hi - 1)));
};

// An "everyone gains" quest pays a reduced share to all ten schools rather than the full amount
// to each, so it lands near a three-school quest instead of ten times a one-school quest.
export const ALL_SCHOOL_SHARE = 0.35;

// A quest may name schools, pay every trained school, or both — D06 walks the curtain with Nim
// (Ward) and then hears the yield read (everyone).
export function rewardXp(q) {
  const per = questXp(actOf(q.act).lead, QUEST_WEIGHT[q.w]);
  const named = Object.fromEntries((q.schools || []).map(s => [s, per]));
  return q.xpAll ? { ...named, all: Math.round(per * ALL_SCHOOL_SHARE) } : named;
}

export function rewardMk(q) {
  const act = actOf(q.act);
  const total = QUESTS.filter(x => x.act === act.id).reduce((n, x) => n + QUEST_WEIGHT[x.w], 0);
  return Math.round(act.mk * QUEST_WEIGHT[q.w] / total);
}

// SYSTEMS.md §11 as published. Regenerate with `node tools/soak.mjs --report=csv` and paste,
// then update the document in the same commit.
export const BALANCE_TABLE = [
  { act: 'L1', h: 0.40, cumH: 0.40, grasp: 25, xp: 4790, mk: 113 },
  { act: 'L2', h: 0.44, cumH: 0.84, grasp: 32, xp: 10635, mk: 258 },
  { act: 'L3', h: 0.50, cumH: 1.35, grasp: 41, xp: 19028, mk: 601 },
  { act: 'L4', h: 0.53, cumH: 1.88, grasp: 56, xp: 40632, mk: 1058 },
  { act: 'L5', h: 0.41, cumH: 2.29, grasp: 77, xp: 75006, mk: 2331 },
  { act: 'D1', h: 0.42, cumH: 2.72, grasp: 86, xp: 103104, mk: 3351 },
  { act: 'D2', h: 0.43, cumH: 3.15, grasp: 94, xp: 129455, mk: 4527 },
  { act: 'D3', h: 0.53, cumH: 3.68, grasp: 100, xp: 154507, mk: 4651 },
  { act: 'D4', h: 0.46, cumH: 4.14, grasp: 111, xp: 190289, mk: 6369 },
  { act: 'D5', h: 0.42, cumH: 4.56, grasp: 119, xp: 231904, mk: 8654 },
  { act: 'N1', h: 0.59, cumH: 5.15, grasp: 126, xp: 264472, mk: 7965 },
  { act: 'N2', h: 0.54, cumH: 5.69, grasp: 131, xp: 297800, mk: 8841 },
  { act: 'N3', h: 0.57, cumH: 6.26, grasp: 139, xp: 350777, mk: 9970 },
  { act: 'N4', h: 0.51, cumH: 6.77, grasp: 147, xp: 394073, mk: 9332 },
  { act: 'N5', h: 0.23, cumH: 7.01, grasp: 154, xp: 439271, mk: 13209 },
];

// The profile §11 was generated from: three schools at M, three at 0.7M, four at 0.4M.
export const PROFILE = { main: 3, secondary: 3, incidental: 4, secondaryMul: 0.7, incidentalMul: 0.4 };

export const questsInAct = actId => QUESTS.filter(q => q.act === actId).length;
export const actOf = id => ACTS.find(a => a.id === id);
export const questById = id => QUESTS.find(q => q.id === id);

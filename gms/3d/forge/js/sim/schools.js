// The ten schools, the affinity matrix and the 3/7/12/17 milestone table. SYSTEMS.md §2.

export const SCHOOLS = [
  'kindle', 'ward', 'line', 'forage', 'cull',
  'hearth', 'mend', 'barter', 'setting', 'glamour',
];

export const SCHOOL_NAMES = {
  kindle: 'Kindle', ward: 'Ward', line: 'Line', forage: 'Forage', cull: 'Cull',
  hearth: 'Hearth', mend: 'Mend', barter: 'Barter', setting: 'Setting', glamour: 'Glamour',
};

export const FACTIONS = ['light', 'neutral', 'dark'];

export const AFFINITY = {
  kindle:  { light:  0, neutral: 0, dark:  1 },
  ward:    { light:  1, neutral: 0, dark:  0 },
  line:    { light:  0, neutral: 1, dark:  0 },
  forage:  { light:  0, neutral: 1, dark:  0 },
  cull:    { light:  0, neutral: 0, dark:  1 },
  hearth:  { light:  1, neutral: 0, dark: -1 },
  mend:    { light:  1, neutral: 0, dark: -1 },
  barter:  { light:  0, neutral: 1, dark: -1 },
  setting: { light: -1, neutral: 0, dark:  1 },
  glamour: { light: -1, neutral: 0, dark:  0 },
};

export const AFF = { xp: 1.15, power: 1.10 };
export const PEN = { xp: 0.85, power: 0.92 };

// A Graft swaps the whole affinity row, penalties included: SYSTEMS §8.4 prices a Grafted
// Neutral at "exactly Dark's +10%". Set false to make worn cosmetic only.
export const WORN_OVERRIDES_AFFINITY = true;

const rowFor = (faction, worn) => (WORN_OVERRIDES_AFFINITY && worn ? worn : faction);

export function affinityOf(school, faction, worn) {
  const row = AFFINITY[school];
  if (!row) return 0;
  return row[rowFor(faction, worn)] ?? 0;
}

export function affinityXp(school, faction, worn) {
  const a = affinityOf(school, faction, worn);
  return a > 0 ? AFF.xp : a < 0 ? PEN.xp : 1;
}

export function affinityPower(school, faction, worn) {
  const a = affinityOf(school, faction, worn);
  return a > 0 ? AFF.power : a < 0 ? PEN.power : 1;
}

export const MILESTONE_LEVELS = [3, 7, 12, 17];

export const MILESTONES = {
  kindle:  ['split_bolt', 'ember', 'pierce', 'cinderfall'],
  ward:    ['brace', 'root', 'reflect', 'bulwark'],
  line:    ['far_spots', 'second_line', 'through_silt', 'deep_call'],
  forage:  ['ripe_glow', 'clean_cut', 'cooked_tier', 'bloom'],
  cull:    ['execute', 'scatter', 'bind', 'brood_sense'],
  hearth:  ['food_buff', 'two_pots', 'long_buff', 'feast'],
  mend:    ['reach_repair', 'hold_fast', 'restore_inert', 'reforge'],
  barter:  ['true_value', 'haggle', 'stall', 'glut_floor_up'],
  setting: ['double_yield', 'seam', 'shift', 'quarry'],
  glamour: ['dim', 'hush', 'mask', 'graft'],
};

export function unlocked(school, level) {
  const ids = MILESTONES[school] || [];
  return ids.filter((_, i) => level >= MILESTONE_LEVELS[i]);
}

export const hasMilestone = (school, level, id) => unlocked(school, level).includes(id);

// Graft is story-granted by a quest, not by Glamour 17 (SYSTEMS §2.2). Light and Dark get
// Mask at 15 m instead, so the capstone id alone never means "can disguise".
export const GRAFT_QUEST = 'N07';

export const blankSchools = () => Object.fromEntries(SCHOOLS.map(s => [s, 0]));

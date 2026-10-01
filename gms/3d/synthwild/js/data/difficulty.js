// Difficulty table (world meta.difficulty). One place to tune how hard survival is.
// mobDmg: multiplier on mob/EMP/bolt damage. capHostile: max hostiles alive. spawnRate: chance per 0.5 s spawn attempt
// in darkness. drain: Charge drain multiplier. starveFloor: Integrity starvation stops at (0 = can starve).
// regenEvery: seconds per Integrity point when Charge > 18. cooldown: multiplier on mob attack cooldowns.
// firstNight: limits on the first night only.
export const DIFFICULTY = {
  peaceful: { cooldown: 1, hostiles: false, mobDmg: 0, capHostile: 0, spawnRate: 0, drain: 0, starveFloor: 20, regenEvery: 1.5, firstNight: null },
  easy: { cooldown: 1.8, hostiles: true, mobDmg: 0.5, capHostile: 4, spawnRate: 0.08, drain: 0.6, starveFloor: 10, regenEvery: 1.8,
    firstNight: { capHostile: 2, spawnRate: 0.05, kinds: ['reboot', 'spider'] } },
  normal: { cooldown: 1, hostiles: true, mobDmg: 1, capHostile: 7, spawnRate: 0.16, drain: 1, starveFloor: 1, regenEvery: 2.5,
    firstNight: { capHostile: 4, spawnRate: 0.1, kinds: null } },
  hard: { cooldown: 0.8, hostiles: true, mobDmg: 1.5, capHostile: 10, spawnRate: 0.26, drain: 1.3, starveFloor: 0, regenEvery: 3.5, firstNight: null },
};

export const MOB_SOURCES = new Set(['reboot', 'glitchfuse', 'archer', 'spider', 'voidlinker', 'gelcore']);

export function difficultyOf(name) { return DIFFICULTY[name] || DIFFICULTY.normal; }

// Journey level table — 60 levels, generated with a hand-tuned curve.
// Every 10th level is a "boss": heavy metal spawns, huge target, extra flair.

export const LEVEL_COUNT = 60;

export function levelDef(n) {
  const boss = n % 10 === 0;
  const tier = Math.floor((n - 1) / 10);        // 0..5
  const inTier = (n - 1) % 10;                  // 0..9

  const colors = n < 8 ? 5 : 6;
  const moves = boss ? 30 : Math.max(18, 26 - tier);
  const metalChance = Math.min(0.05 + tier * 0.03 + (boss ? 0.12 : 0), 0.34);

  // target curve: gentle start, steepening tiers, bosses spike
  const base = 1200 + tier * 900 + inTier * 260;
  const target = Math.round((boss ? base * 2.1 : base) / 50) * 50;

  return {
    n, boss, colors, moves, metalChance,
    target,
    star2: Math.round(target * 1.5),
    star3: Math.round(target * 2.2),
    name: boss ? BOSS_NAMES[Math.min(tier, BOSS_NAMES.length - 1)] : null,
  };
}

const BOSS_NAMES = [
  'THE IRON GATE',
  'FORGE OF ECHOES',
  'CHROME CATHEDRAL',
  'THE SHATTER KING',
  'VAULT OF PRISMS',
  'HEART OF THE FORGE',
];

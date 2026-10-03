export const ITEMS = [
  { id: 'apron', name: 'Lucky Apron', emoji: '🥼', stat: 'speed', text: 'faster', values: [0.03, 0.08, 0.15] },
  { id: 'scale', name: 'Golden Scale', emoji: '⚖️', stat: 'price', text: 'price', values: [0.03, 0.08, 0.15] },
  { id: 'shelf', name: 'Big Shelf', emoji: '🗄️', stat: 'shelf', text: 'shelf', values: [0.25, 0.6, 1.2] },
  { id: 'whistle', name: 'Whistle', emoji: '📯', stat: 'sigma', text: 'sold on the spot', values: [0.03, 0.06, 0.12] },
  { id: 'clover', name: 'Clover', emoji: '🍀', stat: 'crit', text: 'crit sales ×3', values: [0.01, 0.025, 0.05] },
  { id: 'watch', name: 'Pocket Watch', emoji: '⌚', stat: 'offline', text: 'offline cap', values: [600, 1500, 3600] },
];
export const RARITIES = ['common', 'rare', 'epic'];
export const RARITY_SCORE = [1, 2.6, 6];
export const CRATES = {
  basic: { emoji: '📦', odds: [0.8, 0.18, 0.02], n: 1 },
  silver: { emoji: '🎁', odds: [0.4, 0.5, 0.1], n: 1 },
  gold: { emoji: '🏆', odds: [0, 0.6, 0.4], n: 2 },
};

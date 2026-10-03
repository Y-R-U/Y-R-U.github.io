// Manager equipment (proposal §5.6): six western items in three rarities. Merge 3 of a kind+rarity → 1 of the next.
export const ITEMS = [
  { id: 'hat', name: 'Big Hat', emoji: '🤠', stat: 'sigma', text: 'sold on the spot', values: [0.03, 0.06, 0.12] },
  { id: 'spurs', name: 'Jingle Spurs', emoji: '🥾', stat: 'speed', text: 'faster', values: [0.03, 0.08, 0.15] },
  { id: 'goldtooth', name: 'Gold Tooth', emoji: '🦷', stat: 'price', text: 'price', values: [0.03, 0.08, 0.15] },
  { id: 'saddlebags', name: 'Saddlebags', emoji: '👜', stat: 'shelf', text: 'shelf', values: [0.25, 0.6, 1.2] },
  { id: 'horseshoe', name: 'Lucky Horseshoe', emoji: '🧲', stat: 'crit', text: 'crit sales ×3', values: [0.01, 0.025, 0.05] },
  { id: 'watch', name: 'Pocket Watch', emoji: '⌚', stat: 'offline', text: 'offline cap', values: [600, 1500, 3600] },
];
export const RARITIES = ['common', 'rare', 'epic'];
export const RARITY_SCORE = [1, 2.6, 6];
// Strongboxes (IL2 crates). Granted unopened into state.boxes; act 'openBox' rolls the items.
export const STRONGBOXES = {
  basic: { emoji: '📦', name: 'Strongbox', odds: [0.8, 0.18, 0.02], n: 1 },
  silver: { emoji: '🧰', name: 'Silver strongbox', odds: [0.4, 0.5, 0.1], n: 1 },
  gold: { emoji: '💰', name: 'Gold strongbox', odds: [0, 0.6, 0.4], n: 2 },
};

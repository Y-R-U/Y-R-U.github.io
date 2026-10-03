// "Town Council Demands": 4 per block. A Deed needs `needContracts` of the PREVIOUS block's demands finished (not
// claimed: buying the Deed claims them). No demand needs a hidden mechanic; at most one per block needs tapping.
// Kinds (state/goals.js): ownDistrict lineLevel managers equipped, or any state.stats key (pileTaps, ejects, boxesOpened…).
export const CONTRACTS = [
  { id: 'lw1', district: 'lower', emoji: '🏘️', text: 'Open all 3 Lower Street businesses', kind: 'ownDistrict', n: 3, reward: { teeth: 3 } },
  { id: 'lw2', district: 'lower', emoji: '🥾', text: 'Spit & Shine Lv 25', kind: 'lineLevel', lineId: 'shine', n: 25, reward: { teeth: 3 } },
  { id: 'lw3', district: 'lower', emoji: '💰', text: 'Bank 10 piles', kind: 'pileTaps', n: 10, reward: { teeth: 2, box: 'basic' } },
  { id: 'lw4', district: 'lower', emoji: '🕴', text: 'Hire 2 managers', kind: 'managers', n: 2, reward: { teeth: 3 } },
  { id: 'sr1', district: 'saloonrow', emoji: '🥃', text: 'Open all 3 Saloon Row businesses', kind: 'ownDistrict', n: 3, reward: { teeth: 4 } },
  { id: 'sr2', district: 'saloonrow', emoji: '🍺', text: 'Thirsty Gizzard Lv 25', kind: 'lineLevel', lineId: 'saloon', n: 25, reward: { teeth: 4, box: 'basic' } },
  { id: 'sr3', district: 'saloonrow', emoji: '🚪', text: 'Throw out 5 drunks', kind: 'ejects', n: 5, reward: { teeth: 4 } },
  { id: 'sr4', district: 'saloonrow', emoji: '🛁', text: 'Tuppenny Tubs Lv 50', kind: 'lineLevel', lineId: 'tubs', n: 50, reward: { teeth: 4, box: 'basic' } },
  { id: 'bb1', district: 'bankblock', emoji: '🏦', text: 'Open all 3 Bank Block businesses', kind: 'ownDistrict', n: 3, reward: { teeth: 6, box: 'silver' } },
  { id: 'bb2', district: 'bankblock', emoji: '🎒', text: 'Equip 3 items', kind: 'equipped', n: 3, reward: { teeth: 6, box: 'silver' } },
  { id: 'bb3', district: 'bankblock', emoji: '⚰️', text: 'Boot Hill Undertakers Lv 50', kind: 'lineLevel', lineId: 'undertaker', n: 50, reward: { teeth: 6 } },
  { id: 'bb4', district: 'bankblock', emoji: '⭐', text: 'Sheriff & Jail Lv 50', kind: 'lineLevel', lineId: 'jail', n: 50, reward: { teeth: 5, box: 'gold' } },
];

// Presentation metadata for the theme picker. The board agent's registry
// (js/themes/index.js) decides which themes are actually installed.
export const THEME_META = [
  { id: 'classic', name: 'Classic', blurb: 'Staunton pieces on warm walnut.', light: '#ead9b9', dark: '#b0835a', w: '#fbf7ef', b: '#22201e', accent: '#f2a33a' },
  { id: 'fantasy', name: 'Fantasy', blurb: 'Wizards, witches, knights and dragons.', light: '#cfe0c3', dark: '#5f7f5a', w: '#f4efe1', b: '#3b2a52', accent: '#a98bff' },
  { id: 'halloween', name: 'Halloween', blurb: 'Pumpkins, ghouls and a haunted board.', light: '#e9a85b', dark: '#3d2a3f', w: '#f6efe3', b: '#1c1420', accent: '#ff7a1a' },
  { id: 'scifi', name: 'Sci-fi', blurb: 'Neon grid, mechs and laser battles.', light: '#2a3646', dark: '#141b26', w: '#d9f6ff', b: '#ff4fa0', accent: '#3fe0ff' },
];

// Installed theme ids: from the registry when the real board is in use, else only classic.
export function installedThemes(deps) {
  const reg = deps && deps.themes && (deps.themes.THEMES || deps.themes.default || deps.themes.registry || deps.themes);
  if (reg && typeof reg === 'object') {
    const ids = Object.keys(reg).filter(k => typeof reg[k] === 'function' || typeof reg[k] === 'object');
    if (ids.length) return ids;
  }
  return ['classic'];
}

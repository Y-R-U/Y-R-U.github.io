// Presentation metadata for the theme picker. The board agent's registry
// (js/themes/index.js) decides which themes are actually installed.
export const THEME_META = [
  // preview colours sampled from the real boards (qa, 2026-10-31): light / dark squares, white / black pieces
  { id: 'classic', name: 'Classic', blurb: 'Gold and black chrome on polished marble.', light: '#d8d4cb', dark: '#69717f', w: '#e2b85a', b: '#1c1d22', accent: '#f2a33a' },
  { id: 'fantasy', name: 'Fantasy', blurb: 'Wizards, witches, knights and dragons.', light: '#c8baa7', dark: '#4c4f57', w: '#f3ecdb', b: '#a3221d', accent: '#a98bff' },
  { id: 'halloween', name: 'Halloween', blurb: 'Pumpkins, ghouls and a haunted graveyard.', light: '#c4af9c', dark: '#58576a', w: '#f39a33', b: '#3a2350', accent: '#ff7a1a' },
  { id: 'scifi', name: 'Sci-fi', blurb: 'Sleek droids with glowing light-lines.', light: '#cdd4ea', dark: '#69718a', w: '#d9f6ff', b: '#ff4fa0', accent: '#3fe0ff' },
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

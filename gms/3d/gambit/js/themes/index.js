// GAMBIT theme registry. Owner: board agent.
// A sculptor adds ONE line here for a new theme (see MODEL_GUIDE.md):
//   mytheme: () => import('./mytheme/index.js'),
export const themes = {
  classic: () => import('./classic/index.js'),
  halloween: () => import('./halloween/index.js'),
};
export default themes;

export const themeIds = () => Object.keys(themes);

const cache = new Map();
/** loadTheme(id) -> theme object (the module's default export). Unknown ids fall back to classic. */
export async function loadTheme(id) {
  const key = themes[id] ? id : 'classic';
  if (!cache.has(key)) {
    cache.set(key, themes[key]().then(m => m.default || m).catch(e => {
      cache.delete(key);                      // a theme that fails to import falls back to classic
      if (key === 'classic') throw e;
      console.warn(`[gambit] theme "${key}" failed to load, using classic`, e);
      return loadTheme('classic');
    }));
  }
  return cache.get(key);
}

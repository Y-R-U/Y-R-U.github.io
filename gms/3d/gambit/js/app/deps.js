// Which implementation of each sibling module the shell uses.
//
// The real modules are owned by other agents (core: js/chess, js/bots; board:
// js/board). Until they exist the shell runs on ui-owned shims in ./shim/.
// Flags rather than probing so a missing file never puts a 404 in the console.
// A real module that throws on import falls back to the shim with a warning.
//
// URL overrides for testing: ?shim=all | ?shim=board,bots  (force shims)
const REAL = { chess: true, bots: true, board: true };

export const deps = { chess: null, bots: null, board: null, themes: null };
export const usingReal = {};

const force = new URLSearchParams(location.search).get('shim');
const forced = name => force === 'all' || (force || '').split(',').includes(name);

async function pick(name, real, shim) {
  usingReal[name] = false;
  if (REAL[name] && !forced(name)) {
    try { const m = await real(); usingReal[name] = true; return m; }   // (namespaces are frozen: no tagging)
    catch (e) { console.warn(`[gambit] ${name}: real module failed, using shim`, e); }
  }
  return shim();
}


export async function loadDeps() {
  const [chess, bots, board] = await Promise.all([
    pick('chess', () => import('../chess/chess.js'), () => import('./shim/chess.js')),
    pick('bots', () => import('../bots/bots.js'), () => import('./shim/bots.js')),
    pick('board', () => import('../board/board.js'), () => import('./shim/board.js')),
  ]);
  Object.assign(deps, { chess, bots, board });
  if (usingReal.board) {
    try { deps.themes = (await import('../themes/index.js')); } catch (e) { console.warn('[gambit] theme registry', e); }
  }
  return deps;
}

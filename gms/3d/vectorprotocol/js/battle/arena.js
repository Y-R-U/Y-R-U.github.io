import * as THREE from 'three';
import { buildBoard } from './board.js';
import * as scifi from './themes/scifi.js';
import * as fantasy from './themes/fantasy.js';

// Arena = swappable environment theme (D21) + the shared board furniture. Register new themes here
// (e.g. a fantasy ruins theme exporting the same createTheme contract, with stone pedestals via `board.plate`).
export const THEMES = { scifi, fantasy };
// map theme ids (js/data/maps.js `theme`) and realms -> arena theme
const ALIAS = { forest: 'fantasy', verdance: 'fantasy', rift: 'fantasy', ruins: 'fantasy' };
export function themeFor(id) { return THEMES[id] ? id : ALIAS[id] || 'scifi'; }

// battle-10: start a theme's slow procedural builds ahead (idle time), e.g. while the formation screen is open
export function prewarmArena(engine, theme = 'scifi') { return THEMES[themeFor(theme)].prewarm?.(engine) || Promise.resolve(); }

export function buildArena(engine, { theme = 'scifi', seed = 7 } = {}) {
  const mod = THEMES[themeFor(theme)];
  const env = mod.createTheme(engine, { seed });
  const board = buildBoard(engine, env.board || {});
  const group = new THREE.Group();
  group.add(env.group, board.group);
  return {
    group, theme: env, board, ready: env.ready || null, reflection: env.reflection, lights: env.lights,
    setSlot: board.setSlot, nodePulse: board.nodePulse, dimSlot: board.dimSlot, setPlace: board.setPlace, setHome: board.setHome, setRarity: board.setRarity, plateH: board.plateH,
    update(dt, t) { env.update(dt, t); board.update(dt, t); },
    dispose() {
      env.dispose?.();
      board.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    },
  };
}

// Screen manager: one DOM screen + at most one 3D scene object at a time (D16).
// A screen module exports mount(root, ctx, route) -> { scene?, unmount?(), topbar?, bg?: 'on'|'dim'|'off', title? } (may be async).
import { h, clear } from '../ui/dom.js';
import { createTopbar } from '../ui/topbar.js';
import { closeHints } from '../ui/tutorial.js';
import { closeModals } from '../ui/components.js';

const SCREENS = {
  hub: () => import('../ui/scr_hub.js'),
  map: () => import('../ui/scr_map.js'),
  chapters: () => import('../ui/scr_map.js').then((m) => ({ mount: m.mountChapters })),
  formation: () => import('../ui/scr_formation.js'),
  battle: () => import('../ui/scr_battle.js'),
  results: () => import('../ui/scr_results.js'),
  squad: () => import('../ui/scr_collection.js'),
  collection: () => import('../ui/scr_collection.js'),
  unit: () => import('../ui/scr_unit.js'),
  recruit: () => import('../ui/scr_recruit.js'),
  hq: () => import('../ui/scr_hq.js'),
  workshop: () => import('../ui/scr_workshop.js'),
  arena: () => import('../ui/scr_arena.js'),
  events: () => import('../ui/scr_events.js'),
  settings: () => import('../ui/scr_settings.js'),
};

export function createScreens(ctx) {
  const uiRoot = document.getElementById('ui-root');
  const bg = document.getElementById('screen-bg');
  const topbar = createTopbar(ctx);
  let cur = null, curName = null, curScene = null, pending = Promise.resolve();
  ctx.session = ctx.session || {};   // cross-screen hand-offs (e.g. formation -> battle -> results)
  ctx.screens = null;

  function setScene(sceneObj) {
    const eng = ctx.engine;
    const old = curScene;
    curScene = sceneObj || null;
    if (eng) {
      eng.setScene(curScene);
      if (curScene) eng.start(); else eng.stop();
    }
    if (old && old !== curScene) { try { old.dispose?.(); } catch (e) { console.warn('[screens] dispose failed', e); } }
  }

  async function show(route) {
    const name = SCREENS[route.name] ? route.name : 'hub';
    const run = async () => {
      if (ctx.router.current && ctx.router.current !== route) return;   // superseded by a newer route
      closeHints(); closeModals();
      if (cur) { try { cur.unmount?.(); } catch (e) { console.warn('[screens] unmount failed', e); } }
      const root = h('div.screen.scr-' + name);
      clear(uiRoot).appendChild(root);
      cur = null; curName = name;
      let mod;
      try { mod = await SCREENS[name](); } catch (e) { console.error('[screens] load failed', name, e); root.appendChild(h('div.scr-error', 'Screen offline: ' + name)); return; }
      let res = {};
      try { res = (await mod.mount(root, ctx, route)) || {}; }
      catch (e) { console.error('[screens] mount failed', name, e); root.appendChild(h('div.scr-error', 'Screen fault: ' + e.message)); }
      cur = res;
      setScene(res.scene || null);
      bg.className = res.scene ? (res.bg === 'dim' ? 'dim' : '') : (res.bg === 'off' ? '' : 'on');
      topbar.show(res.topbar !== false && res.topbar != null ? res.topbar : false, res.title, route);
      if (res.topbar) root.prepend(topbar.el);
    };
    pending = pending.then(run, run);
    return pending;
  }

  const api = { show, setScene, idle: () => pending, get currentName() { return curName; }, get current() { return cur; }, topbar };
  ctx.screens = api;
  return api;
}

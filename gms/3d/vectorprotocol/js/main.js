import { load, status as modStatus } from './app/modules.js';
import { loadData, data } from './app/data.js';
import { store, DEV } from './app/store.js';
import { createRouter } from './app/router.js';
import { createScreens } from './app/screens.js';
import { createPortraits } from './ui/portraits.js';
import { toast, modal } from './ui/components.js';
import { audioReady } from './app/sound.js';   // starts the lazy audio load: route music, UI taps, unlock on first gesture
import { initOrient } from './app/orient.js';
import { closeHints } from './ui/tutorial.js';

const Q = new URLSearchParams(location.search);
const boot = document.getElementById('boot');
const progress = (p, msg) => { boot.querySelector('.fill').style.width = (p * 100).toFixed(0) + '%'; if (msg) boot.querySelector('.msg').textContent = msg; };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// orientation first: its resize listener must run before the engine's ResizeObserver refits a scene (docs/LANDSCAPE.md §1.3)
const orient = initOrient({ getSetting: () => store.settings.layout || 'auto' });
store.on((what) => { if (what === 'settings') orient.refresh(); });
orient.on(() => closeHints());   // hints are anchored to rects that just moved
const vp = window.__vp = { ready: false, route: null, state: null, store, modules: modStatus, errors: window.__bootErrors, orient };
audioReady.then((a) => { vp.audio = a; });

async function start() {
  progress(0.1, 'Loading combat database…');
  await loadData();
  progress(0.3, 'Syncing company records…');
  await store.init(await load('game_state'));
  vp.state = store.state;
  // dev mode: fetched only when the URL has ?dev, so a normal boot never loads js/dev/*
  let dev = null;
  if (DEV) {
    try { dev = await import('./dev/dev.js'); dev.prepare({ store, Q }); }
    catch (e) { console.warn('[main] dev tools failed to load', e); dev = null; }
  }

  progress(0.45, 'Spinning up render core…');
  const engineMod = await load('engine');
  let engine = null;
  if (engineMod?.createEngine && !Q.has('noengine')) {
    try {
      const q = Q.get('q') || (store.settings.quality !== 'auto' ? store.settings.quality : undefined);
      engine = engineMod.createEngine(document.getElementById('game'), { quality: q, autoStart: false });
    } catch (e) { console.warn('[main] engine failed, running DOM-only', e); engine = null; }
  }
  vp.engine = engine;
  await frame();

  progress(0.65, 'Calibrating unit optics…');
  const units = await load('units');
  const portraits = createPortraits({ engine, units });

  progress(0.8, 'Plotting routes…');
  const router = createRouter({ fallback: 'hub' });
  const screens = createScreens({ engine, store, router, portraits, units, toast, modal });
  vp.router = router; vp.screens = screens;
  router.on(async (r) => { vp.route = r.path; await screens.show(r); vp.screen = screens.currentName; });
  if (dev) { try { vp.dev = dev.attach({ engine, store, router, screens, portraits, toast, modal, Q }); } catch (e) { console.warn('[main] dev panel failed', e); } }
  router.start();
  await screens.idle();

  progress(1, 'Online');
  await frame();
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 700);
  vp.ready = true;
  // br8t account avatar (hub + settings only; skipped under ?dev / test flags)
  import('./app/account.js').then((m) => m.mountAccount()).then((ok) => { vp.account = ok; }).catch(() => {});
  store.on(() => { vp.state = store.state; });
}

start().catch((e) => {
  console.error('[main] boot failed', e);
  boot.classList.add('failed');
  boot.querySelector('.msg').textContent = 'Boot failure: ' + (e?.message || e);
});

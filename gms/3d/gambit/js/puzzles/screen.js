// Puzzles screen entry. Routes (hash):
//   #/puzzles            the map
//   #/puzzles/p/<id>     play one puzzle
//
// Shell hook (js/app/main.js PLUGINS): `puzzles: () => import('../puzzles/screen.js'),`
//   mount(container, ctx) -> {route, top, leave}
//     ctx = {app, params:{rest}, setTop(top), canPester(fn)} (the ui's plug-in contract);
//     `rest` is the part after '#/puzzles/'.
//   render(app, {rest}) -> {el, route, top, leave}  (the older ROUTES contract, kept for the preview page)
import { h } from '../app/ui.js';
import { mountMap } from './map.js';
import { mountPlay, isActive } from './play.js';

export const ROUTE = 'puzzles';

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const href = new URL('./puzzles.css', import.meta.url).href;
  if (![...document.styleSheets].some(s => s.href === href)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
}

function parseSub(sub) {
  const m = String(sub || '').match(/^p\/(.+)$/);
  return m ? { play: decodeURIComponent(m[1]) } : {};
}

export function mount(container, ctx = {}) {
  ensureCss();
  const app = ctx.app || window.__gambit;
  const { play } = parseSub(ctx.params?.rest ?? ctx.rest ?? ctx.sub);
  let out;
  if (play) {
    container.classList.add('pz-screen');
    const r = mountPlay(container, app, play);
    out = { route: 'puzzle', top: { title: 'Puzzle', sub: 'Find the best move', back: '#/puzzles' }, leave: r.leave };
    ctx.canPester?.(() => !isActive());      // no account nudges mid-puzzle
  } else {
    container.classList.add('pz-screen', 'pz-map-screen');
    const r = mountMap(container, app, { focus: ctx.focus });
    out = { route: 'puzzles', top: { title: 'Puzzles', sub: 'The puzzle map', back: '#/home' }, leave: r.leave };
  }
  ctx.setTop?.(out.top);
  return out;
}

export function render(app, params = {}) {
  const el = h('<section class="screen"></section>');
  const res = mount(el, { app, ...params });
  return { el, ...res };
}

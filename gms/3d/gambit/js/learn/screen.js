// Learn screen entry (D14). Routes (hash):
//   #/learn          the course map
//   #/learn/<id>     play one lesson
// Shell hook (js/app/main.js PLUGINS): `learn: () => import('../learn/screen.js'),`
//   mount(container, ctx) -> {route, leave}; ctx = {app, params:{rest}, setTop(top), canPester(fn)}.
import { mountMap } from './map.js';
import { mountPlayer, isActive } from './player.js';

export const ROUTE = 'learn';

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const href = new URL('./learn.css', import.meta.url).href;
  if (![...document.styleSheets].some(s => s.href === href)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
}

export function mount(container, ctx = {}) {
  ensureCss();
  const app = ctx.app || window.__gambit;
  const id = decodeURIComponent(String(ctx.params?.rest || '').split('/')[0] || '');
  if (id) {
    container.classList.add('ln-screen');
    const r = mountPlayer(container, app, id, ctx);
    ctx.canPester?.(() => !isActive());          // no account nudges mid-lesson
    return { route: 'lesson', leave: r.leave };
  }
  container.classList.add('ln-screen', 'ln-map-screen');
  ctx.setTop?.({ title: 'Learn', sub: 'Chess from the first move', back: '#/home' });
  const r = mountMap(container, app);
  return { route: 'learn', leave: r.leave };
}

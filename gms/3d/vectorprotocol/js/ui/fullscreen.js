// Fullscreen toggle (HEIRFRAME js/ui/fullscreen.js pattern). iPhone Safari has no element fullscreen API, so the
// button is not created there; "Add to Home Screen" (apple-mobile-web-app-capable in index.html) is the iOS route.
// No orientation lock: the game will support landscape later.
import { ibtn } from './components.js';
import { icon } from './icons.js';

const docEl = document.documentElement;
const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
const current = () => document.fullscreenElement || document.webkitFullscreenElement;
const standalone = () => matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
export const fullscreenSupported = !!req;

export async function toggleFullscreen() {
  try {
    if (current()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await req.call(docEl, { navigationUI: 'hide' });
  } catch {}
}

// a small icon button that keeps its icon in sync; null where fullscreen can't work (or the app already runs standalone)
const live = new Set();
function syncAll() {
  const on = !!current();
  for (const btn of live) {
    if (!btn.isConnected && btn.dataset.mounted) { live.delete(btn); continue; }
    btn.querySelector('.ic')?.replaceWith(icon(on ? 'fs_exit' : 'fs_enter'));
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    btn.classList.toggle('on', on);
  }
}
if (fullscreenSupported) {
  document.addEventListener('fullscreenchange', syncAll);
  document.addEventListener('webkitfullscreenchange', syncAll);
}

export function fullscreenButton(cls = '') {
  if (!fullscreenSupported || standalone()) return null;
  const btn = ibtn('fs_enter', '', toggleFullscreen, ('fs-btn ' + cls).trim());
  live.add(btn);
  requestAnimationFrame(() => { btn.dataset.mounted = '1'; });
  syncAll();
  return btn;
}

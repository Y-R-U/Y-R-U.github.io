import { onTap, haptic } from './core.js';
import { icon } from './icons.js';

const docEl = document.documentElement;
const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
const current = () => document.fullscreenElement || document.webkitFullscreenElement;
export const fullscreenSupported = !!req;

export async function toggleFullscreen() {
  try {
    if (current()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      await req.call(docEl, { navigationUI: 'hide' });
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
  } catch {}
}

// Wires a button to toggle fullscreen and keep its icon in sync; removes it where unsupported (iPhone Safari).
export function bindFullscreen(btn, bus) {
  if (!btn) return;
  if (!fullscreenSupported) { btn.remove(); return; }
  const sync = () => {
    const on = !!current();
    btn.innerHTML = icon(on ? 'fs_exit' : 'fs_enter');
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
  onTap(btn, () => { haptic(); bus?.emit('sfx', 'click'); toggleFullscreen(); });
}

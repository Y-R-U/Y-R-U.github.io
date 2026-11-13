// Fullscreen for phones that allow it (not iPhone Safari: Add to Home Screen gives a fullscreen launch there).
const d = document, root = d.documentElement;
const req = () => root.requestFullscreen || root.webkitRequestFullscreen;
export const fsSupported = () => !!req() && (d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? true) !== false;
export const fsActive = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
export const standalone = () => {
  try { if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches) return true; } catch {}
  return navigator.standalone === true;
};

// Call straight from the tap handler: the browser needs the user gesture.
export function toggleFullscreen() {
  try {
    const p = fsActive() ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : req().call(root, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

export function onFullscreenChange(cb) {
  d.addEventListener('fullscreenchange', cb);
  d.addEventListener('webkitfullscreenchange', cb);
  return () => { d.removeEventListener('fullscreenchange', cb); d.removeEventListener('webkitfullscreenchange', cb); };
}

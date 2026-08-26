// Fullscreen + orientation lock, every call guarded. Failure here is never fatal.

export async function goFullscreen(el) {
  const e = el || document.documentElement;
  try {
    if (document.fullscreenElement) return true;
    if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: 'hide' });
    else if (e.webkitRequestFullscreen) e.webkitRequestFullscreen();
    else return false;
  } catch { return false; }
  try { await screen.orientation.lock('landscape'); } catch { /* desktop, or not allowed */ }
  return true;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function exitFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
}

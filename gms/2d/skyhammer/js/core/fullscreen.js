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
/**
 * Is this a device where fullscreen is worth taking automatically? Phones and tablets, where the
 * browser chrome eats a third of a landscape screen and there is no window to resize. On desktop
 * Aaron's ruling is that we never grab it — the player asks for it from the pause screen or the
 * first-flight chip instead.
 */
export function autoFullscreenDevice() {
  try {
    if (navigator.maxTouchPoints > 1) return true;
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch { return false; }
}

export function fullscreenSupported() {
  const e = document.documentElement;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen);
}

/** Toggle, for a button. Must be called from a real user gesture or the browser refuses. */
export async function toggleFullscreen(el) {
  if (isFullscreen()) { await exitFullscreen(); return false; }
  return !!(await goFullscreen(el));
}

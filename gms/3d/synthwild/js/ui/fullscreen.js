import { settings } from './settings.js';

const d = document;
const el = () => d.fullscreenElement || d.webkitFullscreenElement || null;
const supported = () => !!(d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen);

async function lockLandscape() {
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}

export const fullscreen = {
  supported,
  isOn: () => !!el(),
  // Must run inside a user gesture. Resolves to the resulting state.
  async toggle(want = !el()) {
    try {
      if (want && !el()) {
        const r = d.documentElement;
        await (r.requestFullscreen ? r.requestFullscreen({ navigationUI: 'hide' }) : r.webkitRequestFullscreen());
        await lockLandscape();
      } else if (!want && el()) {
        await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen());
      }
    } catch {}
    const on = !!el();
    settings.set('fullscreen', on);
    return on;
  },
  // Called on the first gesture: re-enter fullscreen if the player left it on last time.
  restore() {
    if (settings.get('fullscreen') && !el() && supported()) fullscreen.toggle(true);
  },
};

const sync = () => settings.set('fullscreen', !!el());
d.addEventListener('fullscreenchange', sync);
d.addEventListener('webkitfullscreenchange', sync);

export default fullscreen;

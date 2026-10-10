import { h } from './kit.js?v=202610101826';
import { getSettings, setSettings } from '../core/store.js?v=202610101826';

const root = document.documentElement;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
export const canFullscreen = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);

export function toggleFullscreen() {
  if (fsEl()) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  return (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' })?.catch?.(() => {});
}

let bgmMod = null;
export async function bgm() {
  if (!bgmMod) bgmMod = await import('../audio/bgm.js?v=202610101826').catch(() => null);
  return bgmMod;
}

export async function setBgm(on) {
  setSettings({ bgm: on, bgmChosen: true });
  const m = await bgm();
  on ? m?.play?.() : m?.stop?.();
}

// Browsers block autoplay, so background music starts on the first gesture.
export function armBgm() {
  const go = async () => {
    removeEventListener('pointerdown', go, true);
    if (getSettings().bgm !== false) (await bgm())?.play?.();
  };
  addEventListener('pointerdown', go, true);
}

export function toolButtons() {
  const out = [];
  const music = h('button.icon-btn', { type: 'button' });
  const paintMusic = () => {
    const on = getSettings().bgm !== false;
    music.textContent = on ? '🎵' : '🔇';
    music.setAttribute('aria-label', on ? 'Background music on (tap to turn off)' : 'Background music off (tap to turn on)');
    music.classList.toggle('off', !on);
  };
  music.addEventListener('click', async () => { await setBgm(getSettings().bgm === false); paintMusic(); });
  paintMusic();
  out.push(music);

  if (canFullscreen()) {
    const fs = h('button.icon-btn', { type: 'button', 'aria-label': 'Full screen' }, '⛶');
    const paint = () => fs.classList.toggle('on', !!fsEl());
    fs.addEventListener('click', () => toggleFullscreen());
    document.addEventListener('fullscreenchange', paint);
    document.addEventListener('webkitfullscreenchange', paint);
    paint();
    out.push(fs);
  }
  return out;
}

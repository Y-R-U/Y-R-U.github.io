import { h } from './kit.js?v=202610131439';

const root = globalThis.document?.documentElement || {};
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
export const canFullscreen = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);

export function toggleFullscreen() {
  if (fsEl()) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  return (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' })?.catch?.(() => {});
}

export function toolButtons() {
  const out = [];
  const fs = fsButton();
  if (fs) out.push(fs);
  return out;
}

// ⛶ toggle (null where the browser has no full screen, e.g. iPhone Safari). Shown in every top bar and the game HUD.
// corners pointing out (enter) or in (exit); our own static markup
const fsIcon = on => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${on
  ? '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
  : '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'}</svg>`;
function paintFs() {
  const on = !!fsEl();
  for (const b of document.querySelectorAll('.fs-btn')) {
    b.innerHTML = fsIcon(on);
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    b.classList.toggle('on', on);
  }
}
let fsWired = false;
export function fsButton(cls = '') {
  if (!canFullscreen()) return null;
  if (!fsWired) {
    fsWired = true;
    document.addEventListener('fullscreenchange', paintFs);
    document.addEventListener('webkitfullscreenchange', paintFs);
  }
  const on = !!fsEl();
  const b = h('button.icon-btn.fs-btn', { type: 'button', class: cls + (on ? ' on' : ''), dataset: { act: 'fullscreen' }, 'aria-label': on ? 'Exit full screen' : 'Full screen', onclick: () => toggleFullscreen() });
  b.innerHTML = fsIcon(on);
  return b;
}

// The two doors out of your quarters, as buttons.
//
// The room deliberately hides the whole HUD — a dock and a share meter over an interior read as
// leftovers from another screen — which left it with no visible exit at all once the front of the
// game started handing over into here. This is that exit: a bar at the bottom with the terminal and
// the way back out to the system on it, and a second state for when the player has walked up to the
// glass, where going outside is the only thing the button should say.
//
// It watches the body classes rather than being told when to appear. Four different paths put the
// player in and out of the room — the handover, the HUD button, the showroom, closing the terminal —
// and every one of them already moves `in-quarters` and `in-terminal`, so reading those is the only
// version of this that cannot be left showing over the star system.

import { quarters } from './quarters.js';
import { nav } from './nav.js';

let root = null;
let ctx = null;
let shown = null;

export const roomnav = {
  attach(o) {
    ctx = o;
    ensureRoot();
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
    return roomnav;
  },

  // The window framing is a place, not a panel: walking up to the glass is what makes "go outside"
  // the obvious next tap, so the bar changes rather than something new appearing over the top.
  atWindow() {
    nav.push('window', () => roomnav.atRoom());
    return quarters.enter('window', 900).then(sync);
  },
  atRoom() { nav.drop('window'); return quarters.enter('enter', 800).then(sync); },
};

function sync() {
  const b = document.body.classList;
  const on = b.contains('in-quarters') && !b.contains('in-terminal') && !b.contains('front');
  const want = on ? (quarters.view === 'window' ? 'window' : 'room') : null;
  if (want === shown) return;
  shown = want;
  if (!want) {
    root.classList.remove('in');
    setTimeout(() => { if (!shown) root.classList.remove('live'); }, 260);
    return;
  }
  draw(want);
  root.classList.add('live');
  requestAnimationFrame(() => root.classList.add('in'));
}

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('roomnav');
  if (!root) {
    root = document.createElement('div');
    root.id = 'roomnav';
    document.body.appendChild(root);
  }
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const a = b.dataset.r;
    if (a === 'system') return nav.backTo('system');
    if (a === 'terminal') return ctx.onTerminal?.();
    if (a === 'back') return nav.back();
  });
  return root;
}

const ICON = {
  system: '<circle cx="9" cy="9" r="3.2"/><ellipse cx="9" cy="9" rx="7.7" ry="3" transform="rotate(-28 9 9)"/>',
  terminal: '<rect x="2.4" y="3.2" width="13.2" height="9" rx="1.2"/><path d="M6.4 15.2h5.2M9 12.2v3"/>',
  back: '<path d="M11 3.6 5.6 9l5.4 5.4"/>',
};
const icon = k => `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

function draw(state) {
  root.innerHTML = state === 'window'
    ? `
<button class="rn-btn ghost" data-r="back">${icon('back')}<s>The room</s></button>
<button class="rn-btn wide" data-r="system">${icon('system')}<s>Out to the system</s></button>`
    : `
<button class="rn-btn" data-r="terminal">${icon('terminal')}<s>Terminal</s></button>
<button class="rn-btn" data-r="system">${icon('system')}<s>System view</s></button>`;
}

export default roomnav;

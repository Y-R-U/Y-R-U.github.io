// Inserts the DEV button — and only on a local origin. Nothing under js/dev/ beyond gate.js is even
// fetched until the button (or the shortcut) is used, so a player's session never downloads it.

import { isLocal } from './gate.js';

let hub = null;

export function bootDev(host = {}) {
  if (!isLocal()) return false;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./dev.css', import.meta.url).href;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.id = 'wf-dev-btn';
  btn.type = 'button';
  btn.textContent = 'DEV';
  btn.title = 'Developer tools — ` or ctrl+shift+D';
  btn.onclick = () => toggle();
  (document.body || document.documentElement).appendChild(btn);

  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    if (typing) return;
    if (e.key === '`' || (e.key.toLowerCase() === 'd' && e.shiftKey && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      toggle();
    }
  });

  const dev = { open, close, toggle, isLocal: true };
  window.__wfDev = dev;
  // app.expose() replaces window.__wf wholesale, so this is re-applied on every open rather than
  // trusted to survive from here.
  attach(dev);

  async function load() {
    if (!hub) {
      hub = await import('./hub.js');
      hub.configureHub(host);
    }
    return hub;
  }
  async function open() { (await load()).openHub(); attach(dev); }
  function close() { hub?.closeHub(); }
  async function toggle() { (await load()).toggleHub(); attach(dev); }

  return true;
}

function attach(dev) {
  if (window.__wf && !window.__wf.dev) window.__wf.dev = dev;
}

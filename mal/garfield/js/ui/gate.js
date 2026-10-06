import { h } from './util.js';
import { logo } from './menu.js';
import * as I from './icons.js';

// "Tap to Play" start gate: browsers only allow audio after a user gesture, so every visit starts here.
// onGo runs synchronously inside the gesture (audio unlock + fullscreen must happen there).
export function showGate(ui, root, { onGo } = {}) {
  const touch = ui.isTouch;
  return new Promise((resolve) => {
    const btn = h('button.big-btn.gate-btn', { 'aria-label': 'Play' },
      h('span.gate-paw', { html: I.paw ? I.paw() : '' }), touch ? 'Tap to Play' : 'Play!');
    const el = h('section.ui-gate', {},
      h('div.menu-bg'),
      h('div.gate-center', {}, logo(), btn,
        h('p.gate-sub', {}, touch ? 'Tap anywhere to start' : 'Click or press any key')),
      h('div.footer-note', {}, 'Fan-made, non-commercial. Garfield © Paws, Inc. — not affiliated.'));
    root.append(el);
    let done = false;
    const go = (e) => {
      if (done) return;
      if (e?.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      done = true;
      e?.preventDefault?.();
      try { onGo?.(); } catch (err) { console.warn('[gate]', err); }
      ui.emit('sfx', 'pop');
      removeEventListener('keydown', go, true);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, 420);
    };
    el.addEventListener('pointerup', go);
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
    ui.gate.el = el;
  });
}

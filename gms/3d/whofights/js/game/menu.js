// Pause and Settings. One overlay at a time; opening either pauses the world and dims the render
// to 40% — never to black, which on a phone reads as a crash.

import { el, clear } from './ui.js';
import { storageHealthy, storageError } from './savestore.js';
import { PRESET_ROWS, SHADOW_ROWS, resolve } from './graphics.js';

export class Menu {
  constructor(opts) {
    this.o = opts;
    this.host = opts.host;
    this.view = null;
    this.root = el('div', 'g-pause');
    this.dim = el('div', 'g-dim');
    this.sheet = el('div', 'g-sheet');
  }

  get open() { return !!this.view; }

  toggle() { return this.view ? this.close() : this.show('pause'); }

  show(view) {
    const first = !this.view;
    this.view = view;
    if (first) this.o.onOpen?.();
    if (view === 'pause') { this.sheet.remove(); this.host.append(this.dim, this.root); this.drawPause(); }
    else { this.root.remove(); this.dim.remove(); this.host.append(this.sheet); this.drawSettings(); }
  }

  close() {
    if (!this.view) return;
    this.view = null;
    this.root.remove();
    this.dim.remove();
    this.sheet.remove();
    this.o.onClose?.();
  }

  head(title) {
    const h = el('header', 'g-head');
    const x = el('button', null, '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.show('pause');
    h.append(x, el('h2', null, title));
    return h;
  }

  drawPause() {
    clear(this.root);
    const m = el('menu');
    const add = (label, fn, cls) => {
      const b = el('button', cls, label);
      b.onclick = fn;
      m.append(b);
      return b;
    };
    add('RESUME', () => this.close());
    add('Settings', () => this.show('settings'));
    add('Free yourself', () => { this.close(); this.o.onFree?.(); }, 'gap');
    this.root.append(m);
    const where = this.o.where?.() || '';
    // The editor says this in six places and FORGE's game said it in none: private-mode Safari
    // and a full quota both let a whole session play out and keep nothing.
    if (storageHealthy()) this.root.append(el('p', null, `saved · ${where}`));
    else this.root.append(el('p', 'warn', `Not saving — ${storageError()}. ${where}`));
  }

  drawSettings() {
    clear(this.sheet);
    const st = this.o.settings();
    this.sheet.append(this.head('SETTINGS'));
    const body = el('div', 'g-body');
    const set = el('div', 'g-set');

    // First, and in the settings sheet rather than the developer panel: this is the one control
    // that gets an unplayable device back to playable, and nobody finds it under a ⚙ in a corner.
    const g = resolve(st, this.o.autoPreset());
    this.selectRow(set, 'Graphics', 'preset', PRESET_ROWS, g.preset, g.custom ? 'Custom' : '');
    this.selectRow(set, 'Shadows', 'shadows', SHADOW_ROWS, g.shadows);
    this.rangeRow(set, 'Render scale', 'renderScale', g.renderScale, 0.5, 1.5, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Left-handed layout', 'flip', st.flip);
    this.toggleRow(set, 'Invert look', 'invertY', st.invertY);
    this.rangeRow(set, 'Text size', 'uiScale', st.uiScale, 0.85, 1.4, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Reduced motion', 'motion', !st.motion, v => (v ? 0 : 1));
    this.rangeRow(set, 'Volume', 'volume', st.volume, 0, 1, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Mute', 'mute', st.mute);
    this.rangeRow(set, 'Ambience', 'ambience', st.ambience, 0, 1, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Haptics', 'haptics', st.haptics);
    this.toggleRow(set, 'Developer panel', 'devPanel', document.body.classList.contains('devpanel'));
    body.append(set);
    body.append(el('p', null, this.o.presetNote?.() || ''));
    this.sheet.append(body);
  }

  selectRow(parent, label, key, rows, value, note = '') {
    const row = el('label', 'g-preset');
    const sel = el('select');
    for (const [id, text] of rows) {
      const opt = el('option', null, text);
      opt.value = id;
      sel.append(opt);
    }
    sel.value = value;
    sel.onchange = () => { this.o.onSetting(key, sel.value); this.drawSettings(); };
    row.append(el('span', null, label), sel, el('em', null, note));
    parent.append(row);
  }

  rangeRow(parent, label, key, value, min, max, step, fmt) {
    const row = el('label');
    const out = el('em', null, fmt(value));
    const input = el('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    input.oninput = () => { out.textContent = fmt(+input.value); this.o.onSetting(key, +input.value); };
    input.onchange = () => this.drawSettings();
    row.append(el('span', null, label), input, out);
    parent.append(row);
  }

  toggleRow(parent, label, key, value, map = v => v) {
    const row = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.onchange = () => this.o.onSetting(key, map(input.checked));
    row.append(el('span', null, label), input, el('em'));
    parent.append(row);
  }
}

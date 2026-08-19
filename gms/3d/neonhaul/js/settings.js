// §6.5 — the settings that affect flight, and only those. P6/P7 own the rest of the panel
// (SFX, music, chatter, chatter hold time); this builds the section, and the row helpers are
// deliberately generic so those phases append rather than rewrite.
//
// The brief's hard requirement lives here: **"a settings option flips left/right"**. It is the
// first row, it is a two-state segmented control rather than a checkbox so the current side is
// readable at a glance, and flipping it takes effect on the next touch with no reload.
//
// Never `alert()` / `confirm()` / `prompt()` (brief). This is a styled in-game panel.

import { S, save } from './save.js';
import { FLIGHT as F } from './config.js';
import { CabinPanel } from './ui.js';

export class SettingsPanel {
  constructor(el, apply) {
    this.el = el;
    this.apply = apply;          // (settings) => void — the single place changes take effect
    this.open = false;
    // §S2 — the shell is ui.js' CabinPanel, not markup owned here. A hire panel, an earnings
    // screen and a company screen all have to look like this one, and the way to make that true
    // is for them to BE this one with a different body rather than three files each doing their
    // own idea of a neon frame.
    this.shell = new CabinPanel(el, { kicker: 'CABIN', title: 'SETTINGS' });
    this._build();
  }

  s() { return S().settings; }

  _build() {
    const panel = this.shell.body;
    panel.innerHTML = '';

    this.seg(panel, 'Move side', 'flipSides',
      [['Left', false], ['Right', true]], v => `fly with the ${v ? 'right' : 'left'} thumb, look with the other`);
    this.slider(panel, 'Look speed', 'lookSens', F.SENS[0], F.SENS[1], 0.1, v => v.toFixed(1) + '×');
    this.seg(panel, 'Invert look', 'invertLook', [['Off', false], ['On', true]]);
    this.seg(panel, 'Alt buttons', 'altBtn', [['S', 48], ['M', 56], ['L', 68]]);
    // §S2 — the View row is GONE, not disabled. The switch is an on-screen button now
    // (`#btn-view`), which is the whole point: the cabin shipped behind this row and the player it
    // was built for never found it. Two ways to change one setting is also two places for it to
    // get out of step, and the settings panel is the one a player has to go looking for.
    this.slider(panel, 'Field of view', 'fov', F.FOV[0], F.FOV[1], 1, v => v.toFixed(0) + '°');
    this.seg(panel, 'Assists', 'assists', [['Full', 'on'], ['Reduced', 'reduced']],
      v => v === 'on' ? 'the craft slides off buildings for you' : 'half the nudge — for pilots who want the room');
    this.seg(panel, 'Quality', 'quality', [['Auto', 'auto'], ['High', 'high'], ['Low', 'low']]);
    // §8.6 and §8.5. `chatterHold` is the brief's "held on screen long enough for a slow reader",
    // exposed rather than assumed — the multiplier is the whole point of ui.js' holdFor().
    this.seg(panel, 'Map', 'mapRotate', [['Heading up', true], ['North up', false]]);
    // §10. save.js has stored all three of these since P0 and audio.js reads them every frame
    // through the injected getter — there was simply no UI for any of them. `apply` reaches
    // `audio.applySettings()` in main.js, so a change lands on the live mix immediately.
    this.seg(panel, 'Music', 'music', [['Off', false], ['On', true]]);
    this.seg(panel, 'Sound', 'sfx', [['Off', false], ['On', true]]);
    this.seg(panel, 'Radio', 'radio', [['Off', false], ['On', true]]);
    this.seg(panel, 'Radio hold', 'chatterHold',
      [['Normal', 'normal'], ['Long', 'long'], ['Longest', 'very long']],
      v => `a 60-character line holds for ${(6.9 * ({ normal: 1, long: 1.35, 'very long': 1.75 }[v] || 1)).toFixed(1)} s`);
    // §S2 — the stats row. It turns the ?perf overlay on, which already existed; nothing here
    // builds a second one.
    this.seg(panel, 'Stats', 'stats', [['Off', false], ['On', true]],
      v => v ? 'fps, draw calls, triangles and frame time, top-left' : 'no overlay');

  }

  row(parent, label) {
    const r = div('set-row');
    const l = div('set-label');
    l.textContent = label;
    r.appendChild(l);
    parent.appendChild(r);
    return r;
  }

  seg(parent, label, key, options, note) {
    const r = this.row(parent, label);
    const g = div('set-seg');
    const hint = note ? div('set-note') : null;
    const paint = () => {
      for (const b of g.children) b.classList.toggle('on', String(b.dataset.v) === String(this.s()[key]));
      if (hint) hint.textContent = note(this.s()[key]);
    };
    for (const [text, val] of options) {
      const b = document.createElement('button');
      b.className = 'set-opt';
      b.dataset.v = String(val);
      b.textContent = text;
      b.addEventListener('click', () => { this.s()[key] = val; save(); paint(); this.apply(this.s()); });
      g.appendChild(b);
    }
    r.appendChild(g);
    if (hint) parent.appendChild(hint);
    paint();
    this._paints = this._paints || [];
    this._paints.push(paint);
    return g;
  }

  slider(parent, label, key, min, max, step, fmt) {
    const r = this.row(parent, label);
    const wrap = div('set-seg');
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = this.s()[key];
    const out = div('set-val');
    const paint = () => { inp.value = this.s()[key]; out.textContent = fmt(+this.s()[key]); };
    inp.addEventListener('input', () => { this.s()[key] = +inp.value; out.textContent = fmt(+inp.value); this.apply(this.s()); });
    inp.addEventListener('change', save);
    wrap.appendChild(inp); wrap.appendChild(out);
    r.appendChild(wrap);
    paint();
    this._paints = this._paints || [];
    this._paints.push(paint);
    return inp;
  }

  refresh() { for (const p of this._paints || []) p(); }

  // The panel's own `open` mirrors the shell's, because gates and main.js both read it and a
  // second source of truth for "is the panel up" is a bug waiting to happen.
  show() { this.refresh(); this.shell.show(); this.open = true; }
  hide() { this.shell.hide(); this.open = false; }
  toggle() { this.open ? this.hide() : this.show(); return this.open; }
}

const div = c => { const d = document.createElement('div'); d.className = c; return d; };

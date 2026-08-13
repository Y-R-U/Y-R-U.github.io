// Pause, Settings and the character sheet. One overlay at a time; opening any of them pauses the
// clock and the sim and dims the render to 40% — never to black, which on a phone reads as a crash.

import { el, clear } from './ui.js';
import { sheetOf } from './sheet.js';
import { markOf, nameOf } from './towns.js';

const clock2 = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const cap = s => s.replace(/^./, c => c.toUpperCase());

// §1.5's four named hours. Waiting is a fade, never a wait.
const WAITS = [['Dawn', 5.5], ['Noon', 12], ['Dusk', 18], ['Night', 21]];

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
    else { this.root.remove(); this.dim.remove(); this.host.append(this.sheet); this.draw(view); }
  }

  close() {
    if (!this.view) return;
    this.view = null;
    this.root.remove();
    this.dim.remove();
    this.sheet.remove();
    this.o.onClose?.();
  }

  draw(view) {
    clear(this.sheet);
    if (view === 'character') this.drawCharacter();
    if (view === 'settings') this.drawSettings();
  }

  head(title, right = []) {
    const h = el('header', 'g-head');
    const x = el('button', null, '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.show('pause');
    h.append(x, el('h2', null, title));
    for (const r of right) h.append(el('i', null, r));
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
    add('Journal', () => { this.close(); this.o.onJournal(); });
    add('Character', () => this.show('character'));
    add('Settings', () => this.show('settings'));
    const wait = add('Wait until…', () => this.drawWait(), 'gap');
    wait.disabled = !this.o.canWait();
    add('I am stuck', () => this.drawStuck());
    this.root.append(m);

    const c = this.o.clock;
    this.root.append(el('p', null,
      `saved · Day ${c.day}, ${clock2(c.hour)} · ${nameOf(this.o.doc().campaign.current)}`));
  }

  drawWait() {
    clear(this.root);
    const m = el('menu');
    for (const [label, hour] of WAITS) {
      const b = el('button', null, `${label}  ${clock2(hour)}`);
      b.onclick = () => { this.close(); this.o.onWait(hour); };
      m.append(b);
    }
    const back = el('button', 'gap', 'Back');
    back.onclick = () => this.drawPause();
    m.append(back);
    this.root.append(m);
    this.root.append(el('p', null, 'The clock runs the gap. You watch it happen.'));
  }

  // §9.4: three different problems, three different answers. None of them is ever forced.
  drawStuck() {
    clear(this.root);
    const m = el('menu');
    const add = (label, fn, on = true) => {
      const b = el('button', null, label);
      b.disabled = !on;
      b.onclick = () => { this.close(); fn(); };
      m.append(b);
    };
    add('Free yourself', () => this.o.onFree());
    add('Show me where', () => this.o.onShow(), this.o.hasStep());
    add('Reset this step', () => this.o.onReset(), this.o.hasStep());
    const back = el('button', 'gap', 'Back');
    back.onclick = () => this.drawPause();
    m.append(back);
    this.root.append(m);
  }

  drawCharacter() {
    const doc = this.o.doc();
    const s = sheetOf(doc, { truths: this.o.truths(), day: this.o.clock.day });
    this.sheet.append(this.head('CHARACTER', [`${nameOf(doc.campaign.current)}  ${markOf(doc.campaign.current)}`]));
    const body = el('div', 'g-body');

    const top = el('div', 'g-stat');
    const stat = (label, value, note) => {
      const b = el('span');
      b.append(el('s', null, `${label}  `), el('b', null, String(value)));
      if (note) b.append(el('s', null, `  ${note}`));
      top.append(b);
    };
    stat('GRASP', s.grasp);
    stat('Health', s.hp);
    stat('Focus', s.focus, `+${s.regen.toFixed(1)}/s`);
    stat('Marks', `${s.marks} mk`);
    body.append(top);

    const cols = el('div', 'g-cols');
    const left = s.schools.slice(0, 5), right = s.schools.slice(5);
    const kit = [this.gear(s.stave.name, `${s.stave.integrity}%`), ...s.charms.map(c => this.charm(c)), el('div')];
    for (let i = 0; i < 5; i++) cols.append(this.skill(left[i]), this.skill(right[i]), kit[i]);
    body.append(cols);

    body.append(el('div', 'g-rule'));
    const foot = el('div', 'g-foot');
    foot.append(el('span', null, `Standing  ${s.standing.map(x => `${x.name} ${cap(x.band)}`).join(' · ')}`));
    foot.append(el('span', null, `Echoes   ${s.echoes.length ? s.echoes.join(', ') : 'none yet'}`));
    foot.append(el('span', null, `Truths   ${s.truths.known} of ${s.truths.total}`));
    foot.append(el('i', null, `Played  ${s.played} · Day ${s.day}`));
    body.append(foot);
    this.sheet.append(body);
  }

  skill(r) {
    const row = el('div', `g-skill${r.locked ? ' locked' : ''}`);
    row.append(el('span', null, r.name));
    if (r.locked) { row.append(el('b', null, '—'), el('span', null, 'locked')); return row; }
    row.append(el('b', null, String(r.level)));
    const bar = el('div', 'g-bar');
    const fill = el('i');
    fill.style.width = `${Math.round(r.frac * 100)}%`;
    bar.append(fill);
    row.append(bar);
    return row;
  }

  gear(name, note) {
    const row = el('div', 'g-skill g-kit');
    row.append(el('span', null, name), el('i', null, note));
    return row;
  }

  charm(c) {
    const row = el('div', `g-skill g-kit${c.filled ? '' : ' locked'}`);
    row.append(el('u', null, c.filled ? '◆' : '◇'), el('span', null, c.text));
    return row;
  }

  drawSettings() {
    const st = this.o.doc().settings;
    this.sheet.append(this.head('SETTINGS'));
    const body = el('div', 'g-body');
    const set = el('div', 'g-set');

    // Flip is first because a left-handed player has to find it, and §7 says the quality panel is
    // exactly where they will not look.
    this.toggleRow(set, 'Left-handed layout', 'flip', st.flip);
    this.rangeRow(set, 'Text size', 'uiScale', st.uiScale, 0.85, 1.4, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Reduced motion', 'motion', !st.motion, v => (v ? 0 : 1));
    this.toggleRow(set, 'Hold assist', 'holdAssist', st.holdAssist);
    this.rangeRow(set, 'Aim assist', 'aimAssist', st.aimAssist, 0, 2, 0.25, v => v.toFixed(2));
    this.toggleRow(set, 'Faction marks on people', 'factionMarks', st.factionMarks);
    this.toggleRow(set, 'Haptics', 'haptics', st.haptics);
    this.rangeRow(set, 'Volume', 'volume', st.volume, 0, 1, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Mute', 'mute', st.mute);
    this.rangeRow(set, 'Ambience', 'ambience', st.ambience, 0, 1, 0.05, v => `${Math.round(v * 100)}%`);
    this.toggleRow(set, 'Developer panel', 'devPanel', document.body.classList.contains('devpanel'));
    body.append(set);
    body.append(el('p', null, 'Hold the school dial to reach every school you have opened.'));
    this.sheet.append(body);
  }

  rangeRow(parent, label, key, value, min, max, step, fmt) {
    const row = el('label');
    const out = el('em', null, fmt(value));
    const input = el('input');
    Object.assign(input, { type: 'range', min, max, step, value });
    input.oninput = () => { out.textContent = fmt(+input.value); this.o.onSetting(key, +input.value); };
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

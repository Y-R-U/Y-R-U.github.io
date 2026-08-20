// Vitals, the day chip, the school dial and the context button. Reads state and draws it; it
// never changes any of it. §6.1's layout: the left half is locomotion and nothing else, every
// button is in the bottom-right thumb arc, and `flip` mirrors the lot.

import { el, clear } from './ui.js';
import { SCHOOL_NAMES } from '../sim/schools.js';
import { pins, cycle, basicOf } from './sheet.js';
import { low } from './vitals.js';
import { lastBell } from './clock.js';
import { SUSPICION } from '../sim/faction.js';
import { SPELLS } from '../sim/spells.js';

const BELL_NAME = { rising: 'Rising', high: 'High', setting: 'Setting', low: 'Low' };
const HORN_NAME = { rising: 'First', high: 'Second', setting: 'Third', low: '' };

export const GLYPH = { work: '✦', talk: '❝', trade: '⇄', line: '▸', climb: '↑', graft: '◑', interact: '✧',
  cook: '♨', eat: '✚', give: '⇢' };

const LONG_PRESS = 400;
const CHANNEL_AFTER = 350;
const RADIUS = 96;

const short = s => SCHOOL_NAMES[s].slice(0, 4).toUpperCase();
const ring = (r, cls) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', '0 0 100 100');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', r);
  svg.append(c);
  return { svg, c, len: 2 * Math.PI * r };
};

export class Hud {
  constructor({ host, state, onMenu = () => {}, onDial = () => {}, onAct = () => {},
    onChannel = () => {}, onFlip = () => {}, onPrompt = () => {} }) {
    this.read = state;
    this.onMenu = onMenu;
    this.onDial = onDial;
    this.onAct = onAct;
    this.onChannel = onChannel;
    this.onFlip = onFlip;
    this.onPrompt = onPrompt;
    this.context = { kind: null, label: '' };
    this.charge = 0;
    this.held = null;
    this.radial = null;
    this.was = {};
    this.build(host);
  }

  build(host) {
    this.root = el('div', 'g-hud');

    const vit = el('div', 'g-vitals');
    this.hp = this.bar(vit, 'g-hp', '♥');
    this.fp = this.bar(vit, 'g-fp', '◆');
    this.buffs = el('div', 'g-buffs');
    this.fp.row.append(this.buffs);
    this.root.append(vit);

    this.chip = el('div', 'g-chip');
    this.root.append(this.chip);

    const cog = el('button', 'g-cog', '⚙');
    cog.setAttribute('aria-label', 'Menu');
    cog.onclick = () => this.onMenu();
    this.root.append(cog);

    const right = el('div', 'g-right');
    this.dial = el('button', 'g-dial');
    this.dialName = el('b');
    this.dialCost = el('em');
    this.chargeRing = ring(46, 'g-ring');
    this.dial.append(this.chargeRing.svg, this.dialName, this.dialCost);
    this.act = el('button', 'g-act off');
    this.actGlyph = el('b');
    this.actLabel = el('em');
    this.suspRing = ring(46, 'g-ring g-susp');
    this.act.append(this.suspRing.svg, this.actGlyph, this.actLabel);
    right.append(this.dial, this.act);
    this.root.append(right);

    this.prompt = el('div', 'g-prompt gone');
    this.root.append(this.prompt);

    this.notch = el('div', 'g-notch');
    this.root.append(this.notch);

    this.bindDial();
    this.bindAct();
    host.append(this.root);
  }

  bar(parent, cls, glyph) {
    const row = el('div', 'g-vital');
    row.append(el('u', null, glyph));
    const bar = el('div', `g-bar ${cls}`);
    const fill = el('i');
    bar.append(fill);
    const num = el('em');
    row.append(bar, num);
    parent.append(row);
    return { row, bar, fill, num, glyph: row.firstChild };
  }

  bindDial() {
    let timer = null;
    this.dial.addEventListener('pointerdown', e => {
      this.dial.setPointerCapture?.(e.pointerId);
      timer = setTimeout(() => { timer = null; this.openRadial(); }, LONG_PRESS);
    });
    this.dial.addEventListener('pointermove', e => { if (this.radial) this.aimRadial(e); });
    const up = e => {
      if (timer) { clearTimeout(timer); timer = null; this.cycleDial(); }
      else if (this.radial) this.closeRadial(true, e);
    };
    this.dial.addEventListener('pointerup', up);
    this.dial.addEventListener('pointercancel', () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (this.radial) this.closeRadial(false);
    });
  }

  cycleDial() {
    const s = this.read();
    const nextSchool = cycle(s.doc, s.school);
    if (nextSchool) this.onDial(nextSchool);
  }

  openRadial() {
    const s = this.read();
    const open = pins(s.doc).length ? s.unlocked : [];
    if (open.length < 2) return;
    // Drawn centred on the screen, because a ring around a bottom-corner button hangs half of
    // itself off the edge. Aimed from the thumb, which is still on the dial — the gesture is a
    // direction, not a destination, so the two origins can differ and it still reads right.
    const box = this.dial.getBoundingClientRect();
    this.aimFrom = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    this.origin = { x: innerWidth / 2, y: innerHeight / 2 };
    this.radial = { list: open, pick: -1, buttons: [] };
    const wrap = el('div', 'g-radial');
    // Drag-and-release, not tap: at ten schools a segment is 36°, and pointing at one is easy
    // where hitting one is not.
    open.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / open.length) * Math.PI * 2;
      const b = el('button', null, SCHOOL_NAMES[id]);
      b.style.left = `${this.origin.x + Math.cos(a) * RADIUS}px`;
      b.style.top = `${this.origin.y + Math.sin(a) * RADIUS}px`;
      wrap.append(b);
      this.radial.buttons.push(b);
    });
    this.radial.el = wrap;
    this.root.append(wrap);
  }

  aimRadial(e) {
    const dx = e.clientX - this.aimFrom.x, dy = e.clientY - this.aimFrom.y;
    const n = this.radial.list.length;
    let pick = -1;
    if (Math.hypot(dx, dy) > 28) {
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      pick = ((Math.round(a / (Math.PI * 2 / n)) % n) + n) % n;
    }
    if (pick === this.radial.pick) return;
    this.radial.pick = pick;
    this.radial.buttons.forEach((b, i) => b.classList.toggle('on', i === pick));
  }

  closeRadial(commit) {
    const { list, pick, el: wrap } = this.radial;
    this.radial = null;
    wrap.remove();
    if (commit && pick >= 0) this.onDial(list[pick], true);
  }

  bindAct() {
    let timer = null;
    const start = e => {
      if (!this.context.kind) { this.onAct(null); return; }
      this.act.setPointerCapture?.(e.pointerId);
      const s = this.read();
      if (s.holdAssist && this.held) return this.finish(true);
      timer = setTimeout(() => { timer = null; this.held = { t: 0 }; this.onChannel('start', this.context.kind); }, CHANNEL_AFTER);
    };
    const end = () => {
      if (timer) { clearTimeout(timer); timer = null; this.onAct(this.context.kind); return; }
      const s = this.read();
      if (this.held && !s.holdAssist) this.finish(true);
    };
    this.act.addEventListener('pointerdown', start);
    this.act.addEventListener('pointerup', end);
    this.act.addEventListener('pointercancel', () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (this.held) this.finish(false);
    });
  }

  finish(ok) {
    this.held = null;
    this.charge = 0;
    this.onChannel(ok ? 'release' : 'cancel', this.context.kind);
  }

  setContext(kind, label) {
    if (kind === this.context.kind && label === this.context.label) return;
    this.context = { kind: kind || null, label: label || '' };
    this.actGlyph.textContent = GLYPH[kind] || '·';
    this.actLabel.textContent = (label || '').toUpperCase();
    this.act.classList.toggle('off', !kind);
    if (!kind && this.held) this.finish(false);
  }

  // §9.3: the bite window is a visual as well as a sound — the ring inverts and the button grows.
  // The charge clock restarts so the inverted ring drains over the strike window rather than
  // carrying the cast's own elapsed time into it.
  bite(on) {
    this.act.classList.toggle('big', !!on);
    this.inverted = !!on;
    if (this.held) this.held.t = 0;
  }

  pulse(kind) {
    if (kind === 'bell') {
      this.chip.classList.remove('rang');
      void this.chip.offsetWidth;
      this.chip.classList.add('rang');
    }
    if (kind === 'dial') { this.dial.classList.remove('g-nudge'); void this.dial.offsetWidth; this.dial.classList.add('g-nudge'); }
  }

  say(text) {
    const line = el('div', 'g-telegraph', text);
    this.root.append(line);
    setTimeout(() => line.remove(), 6000);
  }

  edge(angle) {
    if (angle == null) return this.notch.classList.remove('on');
    this.notch.classList.add('on');
    this.notch.style.setProperty('--nx', `${50 + Math.sin(angle) * 55}%`);
    this.notch.style.setProperty('--ny', `${50 - Math.cos(angle) * 55}%`);
  }

  drawPrompt(p) {
    const key = p ? p.id : '';
    if (key === this.was.prompt) return;
    this.was.prompt = key;
    clear(this.prompt);
    this.prompt.classList.toggle('gone', !p);
    if (!p) return;
    this.prompt.append(el('span', null, p.text));
    if (p.side) {
      const b = el('button', null, 'left-handed?');
      b.onclick = () => this.onFlip();
      this.prompt.append(b);
    }
    this.onPrompt(p);
  }

  update(dt) {
    const s = this.read();
    if (!s) return;

    const hp = s.vitals.hp / s.limits.hp;
    if (hp !== this.was.hp) {
      this.was.hp = hp;
      this.hp.fill.style.width = `${Math.max(0, hp) * 100}%`;
      this.hp.num.textContent = hp < 0.999 ? `${Math.ceil(s.vitals.hp)}/${s.limits.hp}` : '';
      this.hp.bar.classList.toggle('lowhp', low(s.vitals, s.limits));
    }
    const fp = s.vitals.focus / s.limits.focus;
    if (fp !== this.was.fp) {
      this.was.fp = fp;
      this.fp.fill.style.width = `${Math.max(0, fp) * 100}%`;
      this.fp.num.textContent = fp < 0.999 ? `${Math.round(s.vitals.focus)}/${s.limits.focus}` : '';
    }
    const gut = s.vitals.guttered > 0;
    if (gut !== this.was.gut) {
      this.was.gut = gut;
      this.fp.bar.classList.toggle('gut', gut);
      this.fp.glyph.textContent = gut ? '◇' : '◆';
    }

    const bell = lastBell(s.t);
    const names = s.town === 'dark' ? HORN_NAME : BELL_NAME;
    const chip = s.town === 'neutral' || !names[bell.id]
      ? `Day ${s.day}` : `Day ${s.day} · ${names[bell.id]}`;
    if (chip !== this.was.chip) { this.was.chip = chip; this.chip.textContent = chip; }

    const spell = this.context.kind === 'graft' ? SPELLS.graft : basicOf(s.school, s.faction);
    const dial = `${short(s.school)}|${spell ? Math.round(spell.cost) : ''}`;
    if (dial !== this.was.dial) {
      this.was.dial = dial;
      this.dialName.textContent = short(s.school);
      this.dialCost.textContent = spell ? String(Math.round(spell.cost)) : '';
    }

    if (this.held) {
      this.held.t += dt;
      this.charge = Math.min(1, this.held.t / (s.channelSeconds || 1.2));
    }
    const shown = this.inverted ? 1 - this.charge : this.charge;
    if (shown !== this.was.charge) {
      this.was.charge = shown;
      const c = this.chargeRing;
      c.c.style.strokeDasharray = `${c.len * shown} ${c.len}`;
      this.dialCost.textContent = this.held
        ? `${(1 + 0.8 * this.charge).toFixed(1)}×`
        : (spell ? String(Math.round(spell.cost)) : '');
    }

    const susp = s.suspicion > SUSPICION.showAbove ? s.suspicion / SUSPICION.max : 0;
    if (susp !== this.was.susp) {
      this.was.susp = susp;
      const c = this.suspRing;
      c.c.style.strokeDasharray = `${c.len * susp} ${c.len}`;
      c.c.style.strokeWidth = 2 + susp * 4;
    }

    if (s.buffs !== this.was.buffs) {
      this.was.buffs = s.buffs;
      clear(this.buffs);
      for (let i = 0; i < (s.buffs || 0); i++) this.buffs.append(el('b'));
    }

    this.drawPrompt(s.prompt);
  }

  show(on) { this.root.style.display = on ? '' : 'none'; }
}

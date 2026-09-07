// The bag. `I` on a keyboard, the ❖ button beside ★ on a phone.
//
// Two halves, which is exactly what Aaron's son asked for: everything you are carrying on the
// left, and a small box set aside on the right holding what is actually in your hands. Nothing is
// dragged — dragging is the one gesture that works differently on every phone — so a thing is
// selected and then sent to a slot by a button that says where it is going.
//
// The sheet does not decide anything. Every button calls back into js/game/session.js, which owns
// the save and the world; this file draws what the bag says and nothing else.

import { el, clear } from './ui.js';
import { rows as bagRows, itemOf, nameOf, purse, isWeapon, usable, countOf } from './items.js';
import { weaponOf } from './weapons.js';

const money = n => `${(n || 0).toLocaleString('en-GB')} marks`;

export class Inventory {
  constructor({ host, bag = () => ({}), gear = () => ({}), onEquip = () => {}, onHold = () => {},
    onUse = () => {}, onOpen = () => {}, onClose = () => {} }) {
    this.host = host;
    this.bag = bag;
    this.gear = gear;
    this.onEquip = onEquip;
    this.onHold = onHold;
    this.onUse = onUse;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.root = null;
    this.picked = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  toggle() { return this.root ? (this.close(), false) : this.show(); }

  show() {
    if (this.root) return true;
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    this.sheet = el('div', 'g-parch g-inv');
    this.sheet.onpointerdown = e => e.stopPropagation();
    this.root.append(this.sheet);
    this.host.append(this.root);
    addEventListener('keydown', this.onKey);
    this.draw();
    requestAnimationFrame(() => this.root?.classList.add('in'));
    this.onOpen();
    return true;
  }

  // Redrawn wholesale on every change. The bag is at most a couple of dozen rows and this runs
  // when a button is pressed, never per frame — a diff here would be three bugs and no gain.
  refresh() { if (this.root) this.draw(); }

  draw() {
    clear(this.sheet);
    const rows = bagRows(this.bag());
    if (this.picked && !rows.some(r => r.id === this.picked)) this.picked = null;

    const head = el('header', 'g-parch-head');
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, 'What you are carrying'));
    t.append(el('p', null, money(purse(this.bag()))));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x);
    this.sheet.append(head);

    const body = el('div', 'g-parch-body g-invbody');
    body.append(this.grid(rows), this.equip());
    this.sheet.append(body);
  }

  grid(rows) {
    const pane = el('div', 'g-invpane');
    if (!rows.length) {
      pane.append(el('p', 'g-invempty',
        'Nothing but the marks in your purse. The shops on the square will take some of those off you.'));
      return pane;
    }
    const grid = el('div', 'g-invgrid');
    for (const r of rows) {
      const cell = el('button', `g-invcell g-invcell-${r.kind}${this.picked === r.id ? ' on' : ''}`);
      cell.append(el('u', null, glyph(r.kind)));
      cell.append(el('span', null, r.name));
      if (r.count > 1) cell.append(el('b', null, `×${r.count}`));
      cell.onclick = () => { this.picked = this.picked === r.id ? null : r.id; this.draw(); };
      grid.append(cell);
    }
    pane.append(grid);
    pane.append(this.detail());
    return pane;
  }

  detail() {
    const box = el('div', 'g-invdesc');
    const id = this.picked;
    if (!id) {
      box.append(el('p', null, 'Pick something up to read it.'));
      return box;
    }
    const it = itemOf(id);
    box.append(el('b', null, nameOf(id)));
    if (isWeapon(id)) {
      const w = weaponOf(id);
      box.append(el('em', null, `${w.damage} damage · ${w.reach.toFixed(1)} m reach · one swing every ${w.cooldown.toFixed(2)} s`));
    }
    box.append(el('p', null, it?.blurb || ''));
    const acts = el('div', 'g-invacts');
    const g = this.gear() || {};
    if (isWeapon(id)) {
      acts.append(id === g.weapon
        ? this.act('Put it away', () => this.onEquip(''))
        : this.act('Hold it', () => this.onEquip(id)));
    }
    if (usable(id)) {
      acts.append(id === g.hand
        ? this.act('Out of hand', () => this.onHold(''))
        : this.act('To hand', () => this.onHold(id)));
      acts.append(this.act('Use one', () => this.onUse(id)));
    }
    box.append(acts);
    return box;
  }

  act(label, fn) {
    const b = el('button', 'g-invact', label);
    b.onclick = () => { fn(); this.refresh(); };
    return b;
  }

  // The box set aside. Two slots and no more: one weapon, and one thing in the other hand. A slot
  // says what would happen if you pressed it, because "left click absorbs it" is not something a
  // player can be expected to guess.
  equip() {
    const g = this.gear() || {};
    const box = el('div', 'g-invequip');
    box.append(el('h3', null, 'In hand'));

    const w = weaponOf(g.weapon);
    const wSlot = el('button', `g-invslot${g.weapon ? ' on' : ''}`);
    wSlot.append(el('u', null, '†'));
    wSlot.append(el('span', null, w.name));
    wSlot.append(el('i', null, g.weapon ? 'tap to put away' : 'bare hands'));
    wSlot.onclick = () => { this.onEquip(g.weapon ? '' : this.picked); this.refresh(); };
    box.append(wSlot);

    const held = g.hand && countOf(this.bag(), g.hand) > 0 ? g.hand : '';
    const hSlot = el('button', `g-invslot${held ? ' on' : ''}`);
    hSlot.append(el('u', null, '◇'));
    hSlot.append(el('span', null, held ? `${nameOf(held)} ×${countOf(this.bag(), held)}` : 'Nothing'));
    hSlot.append(el('i', null, held ? 'left click in the world to use it' : 'a stone, a potion, a rope'));
    hSlot.onclick = () => { this.onHold(held ? '' : this.picked); this.refresh(); };
    box.append(hSlot);

    box.append(el('p', 'g-invhint',
      'What is in your off hand is used by clicking out in the world — an awakening stone wakes '
      + 'something, a potion closes what is open, a rope holds a thing still.'));
    return box;
  }

  close() {
    if (!this.root) return;
    removeEventListener('keydown', this.onKey);
    const r = this.root;
    this.root = null;
    this.picked = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 220);
    this.onClose();
  }
}

// Typographic marks, deliberately not emoji: ⚔ and ✋ are rendered by the system's colour emoji
// font on macOS and iOS whatever the stylesheet says, and two glossy stickers on a sheet of
// parchment look like a rendering bug. Everything below has no emoji presentation to fall into.
const GLYPH = { weapon: '†', potion: '◉', stone: '❖', tool: '∿', currency: '✦' };
const glyph = kind => GLYPH[kind] || '•';

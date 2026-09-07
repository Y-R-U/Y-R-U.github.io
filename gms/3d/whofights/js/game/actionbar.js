// The combat bar along the bottom of the screen.
//
// Ten slots and a page flip, which is exactly the keyboard: 1-9 and 0 are page one, Shift with the
// same keys is page two. So the bar and the number row are the same twenty things in the same
// order, and a player who learns one has learnt the other.
//
//   tap a slot          cast it
//   hold a slot         open the twenty-grid and put something else on it
//   ⟨1/2⟩               flip to the Shift row
//   the chevron         hide the bar (desktop; the keys still work)
//   right-click the bar open the grid as two columns of ten
//
// The grid is the reorder Aaron's son asked for, and it is the same gesture on both platforms:
// hold a slot, pick what goes on it. Nothing is dragged — a drag behaves differently on every
// phone and there is no version of it that reads the same on a desktop.
//
// This file draws and reports. It never decides whether a cast is legal; js/game/casting.js does,
// and the slot shows what that answered.

import { el, clear } from './ui.js';
import { keyLabel } from '../input.js';
import { PAGE, resolve as resolveSlots } from './slots.js';

const HOLD_MS = 420;

export class ActionBar {
  constructor({ host, slots = () => [], abilities = () => [], state = () => null,
    onCast = () => {}, onAssign = () => {}, hidden = false }) {
    this.host = host;
    this.slots = slots;
    this.abilities = abilities;
    this.state = state;
    this.onCast = onCast;
    this.onAssign = onAssign;

    this.page = 0;
    this.picking = null;     // the slot the grid is open for, or null
    this.hidden = !!hidden;
    // Something full-screen is up — a conversation, a board, the bag. Separate from `hidden`,
    // which is the chevron the player pressed: a bar that came back from a conversation in the
    // wrong state would be the player's own setting being overwritten by the game.
    this.busy = false;
    this.cells = [];
    this.key = '';

    this.root = el('div', 'g-abar');
    this.root.hidden = true;
    this.strip = el('div', 'g-abar-row');
    this.root.append(this.strip);

    // Right-click on the bar opens the grid rather than the browser menu. On touch there is no
    // second button, which is what the long press is for.
    this.root.oncontextmenu = e => { e.preventDefault(); this.openGrid(null); };

    this.host.append(this.root);
    this.build();
  }

  get open() { return !!this.grid; }

  build() {
    clear(this.strip);
    this.cells = [];
    for (let c = 0; c < PAGE; c++) {
      const cell = el('button', 'g-abar-cell');
      cell.append(el('u', null, ''));       // the key it answers to
      cell.append(el('b', null, ''));       // its name
      cell.append(el('i', null, ''));       // the cooldown wash
      this.wire(cell, c);
      this.strip.append(cell);
      this.cells.push(cell);
    }

    const side = el('div', 'g-abar-side');
    this.pager = el('button', 'g-abar-page', '1/2');
    this.pager.setAttribute('aria-label', 'The other ten');
    this.pager.onclick = () => { this.page = this.page ? 0 : 1; this.draw(true); };
    const chev = el('button', 'g-abar-hide', '▾');
    chev.setAttribute('aria-label', 'Hide the bar');
    chev.onclick = () => this.toggleHidden();
    side.append(this.pager, chev);
    this.strip.append(side);
  }

  // One cell: a tap casts, a hold opens the grid on it. Both off the same pointer, because the
  // cell has to know a hold from a tap before it does either.
  wire(cell, column) {
    let timer = 0, held = false;
    const slot = () => this.page * PAGE + column;
    const stop = () => { clearTimeout(timer); timer = 0; };
    cell.onpointerdown = e => {
      if (e.button === 2) return;
      held = false;
      stop();
      timer = setTimeout(() => { held = true; this.openGrid(slot()); }, HOLD_MS);
    };
    cell.onpointerup = () => {
      stop();
      if (held) { held = false; return; }
      const a = this.at(slot());
      if (a) this.onCast(a);
      else this.openGrid(slot());
    };
    cell.onpointercancel = () => { stop(); held = false; };
    cell.onpointerleave = () => stop();
    cell.oncontextmenu = e => { e.preventDefault(); this.openGrid(slot()); };
  }

  // The twenty slots resolved to the abilities on them, memoised on the arrangement itself. This
  // is asked for every frame — resolving it each time is a Map, two arrays and a Set sixty times a
  // second for an answer that changes when somebody presses a button.
  bar(force = false) {
    const slots = this.slots();
    const list = this.abilities();
    const stamp = `${(slots || []).join(',')}|${list.length}|${list.map(a => a.id).join(',')}`;
    if (!force && this._stamp === stamp && this._bar) return this._bar;
    this._stamp = stamp;
    this._bar = resolveSlots(slots, list);
    return this._bar;
  }

  at(i) { return this.bar()[i] || null; }

  toggleHidden() {
    this.hidden = !this.hidden;
    this.draw(true);
  }

  // Pushed down out of the way while a sheet or a conversation owns the screen. The number keys
  // are refused in the same states (js/game/session.js drainCast), so a bar that stayed up would
  // be ten buttons that do nothing over the top of the thing the player is reading.
  setBusy(v) {
    const was = this.busy;
    this.busy = !!v;
    if (was !== this.busy) this.draw(true);
  }

  // Called every frame. `force` redraws the labels; otherwise only the live parts — the cooldown
  // wash and whether a slot can be paid for — are touched, because relabelling ten buttons sixty
  // times a second is the sort of thing that shows up in a frame graph.
  draw(force = false) {
    const bar = this.bar(force);
    const any = bar.some(Boolean);
    this.root.hidden = !any;
    this.root.classList.toggle('shut', this.hidden || this.busy);
    if (!any) return;

    const key = `${this.page}|${this.hidden}|${bar.map(a => a?.id || '').join(',')}`;
    if (force || key !== this.key) {
      this.key = key;
      const twoPages = bar.slice(PAGE).some(Boolean);
      this.pager.hidden = !twoPages;
      this.pager.textContent = `${this.page + 1}/2`;
      for (let c = 0; c < PAGE; c++) {
        const i = this.page * PAGE + c;
        const a = bar[i];
        const cell = this.cells[c];
        cell.querySelector('u').textContent = keyLabel(i);
        cell.querySelector('b').textContent = a ? a.name : '';
        cell.classList.toggle('empty', !a);
        cell.style.setProperty('--ess', a?.colour || 'transparent');
        cell.title = a ? `${a.name} — ${a.fromName}` : 'Hold to put something here';
      }
    }
    if (this.hidden || this.busy) return;

    for (let c = 0; c < PAGE; c++) {
      const a = bar[this.page * PAGE + c];
      const cell = this.cells[c];
      const st = a ? this.state(a) : null;
      const wash = cell.querySelector('i');
      // The wash is the cooldown draining left to right. `ready` is mana as well as time, so a
      // slot you cannot pay for reads as unavailable rather than as available and silent.
      wash.style.transform = `scaleX(${st ? (st.fraction || 0) : 0})`;
      cell.classList.toggle('cold', !!st && !st.ready);
    }
    if (this.grid) this.drawGrid();
  }

  // ── the twenty-grid ─────────────────────────────────────────────────────
  // Two columns of ten, which is the shape of the keyboard it stands for. Opened on a slot, it
  // puts what you pick onto that slot; opened on the bar itself, it is just the whole sheet.

  openGrid(slot) {
    this.closeGrid();
    this.picking = Number.isInteger(slot) ? slot : null;
    this.grid = el('div', 'g-boardwrap');
    this.grid.onpointerdown = e => { if (e.target === this.grid) this.closeGrid(); };
    this.gridSheet = el('div', 'g-parch g-slotgrid');
    this.gridSheet.onpointerdown = e => e.stopPropagation();
    this.grid.append(this.gridSheet);
    this.host.append(this.grid);
    this.onGridKey = e => { if (e.key === 'Escape') this.closeGrid(); };
    addEventListener('keydown', this.onGridKey);
    this.gridStamp = null;
    this.drawGrid(true);
    requestAnimationFrame(() => this.grid?.classList.add('in'));
    return true;
  }

  // Rebuilt only when the arrangement or the picked slot has actually moved. `draw()` calls this
  // every frame the grid is open, and clearing and rebuilding twenty rows sixty times a second is
  // exactly the sort of thing that shows up in a frame graph.
  drawGrid(force = false) {
    const bar = this.bar();
    const stamp = `${this.picking}|${bar.map(a => a?.id || '').join(',')}`;
    if (!force && this.gridStamp === stamp) return;
    this.gridStamp = stamp;
    clear(this.gridSheet);

    const head = el('header', 'g-parch-head');
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, this.picking == null ? 'What is under your fingers' : `What goes on ${keyLabel(this.picking)}`));
    t.append(el('p', null, this.picking == null
      ? 'Twenty keys. Tap one, then tap an ability, to move it.'
      : 'Tap an ability to put it here. Tap it where it already is to swap the two.'));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.closeGrid();
    head.append(x);
    this.gridSheet.append(head);

    const body = el('div', 'g-parch-body g-slotcols');
    for (let col = 0; col < 2; col++) {
      const column = el('div', 'g-slotcol');
      for (let r = 0; r < PAGE; r++) {
        const i = col * PAGE + r;
        const a = bar[i];
        const row = el('button', `g-slotrow${this.picking === i ? ' on' : ''}${a ? '' : ' empty'}`);
        row.append(el('u', null, keyLabel(i)));
        row.append(el('b', null, a ? a.name : '—'));
        row.append(el('em', null, a ? a.fromName : ''));
        if (a) row.style.setProperty('--ess', a.colour || '#8c3a2b');
        row.onclick = () => this.tapGrid(i, a);
        column.append(row);
      }
      body.append(column);
    }
    this.gridSheet.append(body);

    const foot = el('p', 'g-parch-foot', this.picking == null
      ? 'The left column is 1 to 0. The right column is the same keys with Shift held.'
      : 'Or close this and hold another slot.');
    this.gridSheet.append(foot);
  }

  // Opened on a slot: the row you tap moves onto it. Opened on nothing: the first tap picks a
  // slot and the second says where it goes, which is the same two taps in the other order.
  tapGrid(i, ability) {
    if (this.picking == null) { this.picking = i; this.drawGrid(); return; }
    if (this.picking === i) { this.picking = null; this.drawGrid(); return; }
    this.onAssign(this.picking, ability ? ability.id : null, i);
    this.picking = null;
    this.key = '';
    this.drawGrid();
    this.draw(true);
  }

  closeGrid() {
    if (!this.grid) return;
    removeEventListener('keydown', this.onGridKey);
    const g = this.grid;
    this.grid = null;
    this.picking = null;
    g.classList.remove('in');
    setTimeout(() => g.remove(), 220);
  }
}

// The contract in hand, on the play screen.
//
// Minimised by default and transparent, because it is the thing that is on screen the whole time
// the player is not reading it: one line — the contract's name and what is left standing — and it
// opens on a tap into the brief, what is in the room, and what closing it is worth.
//
// It is not a HUD panel that is always there. With no contract in hand there is nothing here at
// all, and the screen goes back to being the world.

import { el, clear } from './ui.js';

export class MissionPanel {
  constructor({ host, onOpen = () => {} }) {
    this.host = host;
    this.onOpen = onOpen;
    this.root = el('div', 'g-mission');
    this.root.hidden = true;
    this.expanded = false;
    this.brief = null;
    this.shownKey = null;
    this.root.onclick = () => this.toggle();
    host.append(this.root);
  }

  toggle() {
    this.expanded = !this.expanded;
    this.root.classList.toggle('open', this.expanded);
    this.draw(true);
    if (this.expanded) this.onOpen();
  }

  // `brief` is what js/game/missions.js `briefOf` returned, or null for nothing in hand.
  set(brief) {
    this.brief = brief;
    if (!brief) {
      this.expanded = false;
      this.root.classList.remove('open');
    }
    this.root.hidden = !brief;
    this.shownKey = null;
    this.draw();
  }

  // How the fight is going, pushed each frame by the session. Only the numbers, and only when they
  // have changed — the panel is on screen for the whole of a fight.
  progress(left, total) {
    if (this.left === left && this.total === total) return;
    this.left = left;
    this.total = total;
    this.draw();
  }

  draw(force = false) {
    const b = this.brief;
    if (!b) return;
    const key = `${this.expanded}|${this.left}|${this.total}`;
    if (!force && key === this.shownKey) return;
    this.shownKey = key;
    clear(this.root);

    const line = el('div', 'g-mission-line');
    line.append(el('u', null, this.expanded ? '▾' : '▸'));
    line.append(el('b', null, b.job.name));
    // Standing, not killed: what the player wants to know mid-fight is how many are still coming.
    if (this.total) line.append(el('em', null, this.left ? `${this.left} left` : 'clear'));
    this.root.append(line);
    if (!this.expanded) return;

    const box = el('div', 'g-mission-body');
    box.append(el('p', null, b.note));
    const row = el('div', 'g-mission-row');
    row.append(el('span', null, b.foes));
    row.append(el('em', null, `${b.worth} xp`));
    box.append(row);
    const pay = el('div', 'g-mission-row');
    pay.append(el('span', null, `${b.job.client} · ${b.job.where}`));
    pay.append(el('em', null, `${b.job.reward} marks`));
    box.append(pay);
    this.root.append(box);
  }

  clear() { this.set(null); }
}

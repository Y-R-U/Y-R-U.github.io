// The player sheet: what you are, on one page.
//
// Rank and stars first, because that is the only number in the game that other people react to —
// the stair, the clerks and the boards all read it. Then the bar to the next star, then the four
// essences and what each of them gave you.
//
// A sheet, not a dialog: the world keeps running behind it and it closes on the ✕, on Escape, or
// on a tap off it, like every other screen here.

import { el, clear } from './ui.js';
import { STARS } from './progress.js';

const money = n => `${(n || 0).toLocaleString('en-GB')} marks`;

export class PlayerSheet {
  constructor({ host, progress = () => null, essences = () => null, abilities = () => [],
    marks = () => 0, contract = () => null, played = () => 0 }) {
    this.host = host;
    this.progress = progress;
    this.essences = essences;
    this.abilities = abilities;
    this.marks = marks;
    this.contract = contract;
    this.played = played;
    this.root = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  toggle() { return this.root ? (this.close(), false) : this.show(); }

  show() {
    this.close();
    const p = this.progress();
    if (!p) return false;
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    const sheet = el('div', 'g-parch g-record');
    sheet.onpointerdown = e => e.stopPropagation();

    const head = el('header', 'g-parch-head');
    head.append(el('u', `g-seal g-seal-${p.rank}`, p.rankLabel[0]));
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, p.registered ? `${p.rankLabel} Rank` : 'Not yet an adventurer'));
    t.append(el('p', null, p.promotion));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x);
    sheet.append(head);

    const body = el('div', 'g-parch-body');
    body.append(this.standing(p));
    const c = this.contract();
    if (c) body.append(this.contractRow(c));
    body.append(this.essenceBlock());
    body.append(el('p', 'g-parch-foot',
      `${money(this.marks())} · ${hhmm(this.played())} in the field. The Society keeps the other copy.`));
    sheet.append(body);
    this.root.append(sheet);
    this.host.append(this.root);
    addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.root?.classList.add('in'));
    return true;
  }

  // The stars, and the bar between the one you have and the one you are working on. Four filled
  // pips is the whole of "ready for the rung above" and it is the first thing on the page.
  standing(p) {
    const box = el('div', `g-standing g-rankband g-rank-${p.rank}`);
    const row = el('div', 'g-stars');
    for (let i = 1; i <= STARS; i++) row.append(el('u', i <= p.stars ? 'on' : '', i <= p.stars ? '★' : '☆'));
    row.append(el('b', null, `${p.stars} of ${STARS}`));
    box.append(row);

    const bar = el('div', 'g-xpbar');
    const fill = el('i');
    fill.style.transform = `scaleX(${p.fraction.toFixed(4)})`;
    bar.append(fill);
    box.append(bar);

    box.append(el('span', null, p.next == null
      ? `${p.xp.toLocaleString('en-GB')} experience. Nothing above this here.`
      : `${p.into.toLocaleString('en-GB')} / ${p.need.toLocaleString('en-GB')} to the next star · ${p.xp.toLocaleString('en-GB')} in total`));
    return box;
  }

  contractRow(c) {
    const box = el('div', 'g-record-block');
    box.append(el('h3', null, 'Contract in hand'));
    const row = el('div', 'g-job-m');
    row.append(el('span', null, c.job.name));
    row.append(el('em', null, `${c.worth} xp`));
    box.append(row);
    box.append(el('p', null, c.note));
    return box;
  }

  essenceBlock() {
    const box = el('div', 'g-record-block');
    const held = this.essences();
    box.append(el('h3', null, 'Essences'));
    if (!held?.rows?.length) {
      box.append(el('p', null, 'None yet. Pass the proving, then take three — the fourth is whatever they come to.'));
      return box;
    }
    const strip = el('div', 'g-essrow');
    for (const r of held.rows) {
      const chip = el('u', r.confluence ? 'g-esschip g-esschip-conf' : 'g-esschip', r.name);
      chip.style.setProperty('--ess', r.colour);
      strip.append(chip);
    }
    box.append(strip);
    const list = el('div', 'g-record-abils');
    for (const a of this.abilities()) {
      const row = el('div', 'g-record-abil');
      row.append(el('b', null, a.name));
      row.append(el('em', null, a.fromName || ''));
      row.append(el('span', null, a.text));
      list.append(row);
    }
    box.append(list);
    return box;
  }

  close() {
    if (!this.root) return;
    removeEventListener('keydown', this.onKey);
    const r = this.root;
    this.root = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 220);
  }
}

const hhmm = s => {
  const m = Math.floor(Math.max(0, s) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

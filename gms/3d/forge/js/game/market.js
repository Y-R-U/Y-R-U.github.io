// The sell panel. Every number comes from `sale.js`, which gets all of its own from
// `sim/economy.js` — there is no arithmetic in this file.

import { el, clear } from './ui.js';
import { rows, quote } from './sale.js';
import { nameOf } from './towns.js';
import { levelIn } from './sheet.js';

const pips = n => '●'.repeat(n) + '○'.repeat(5 - n);

export class Market {
  constructor(opts) {
    this.o = opts;
    this.host = opts.host;
    this.root = el('div', 'g-sheet');
    this.picked = [];
    this.stall = null;
  }

  get open() { return !!this.stall; }

  // `stall` is { id, town, vendor, title } — the vendor is who the `deliver` event is credited to.
  show(stall) {
    this.stall = stall;
    this.picked = [];
    this.host.append(this.root);
    this.o.onOpen?.();
    this.draw();
  }

  close() {
    if (!this.stall) return;
    this.stall = null;
    this.root.remove();
    this.o.onClose?.();
  }

  opts() {
    return { district: this.stall.town, haggle: !!this.o.doc().flags[`haggle.${this.stall.vendor}`] };
  }

  draw() {
    const doc = this.o.doc();
    const list = rows(doc, { district: this.stall.town, now: Date.now() });
    const q = quote(list, this.picked, doc, this.opts());
    clear(this.root);

    const head = el('header', 'g-head');
    const x = el('button', null, '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x, el('h2', null, `${nameOf(this.stall.town).toUpperCase()} MARKET`));
    head.append(el('i', null, `Barter ${levelIn(doc, 'barter')}`), el('i', null, `${doc.purse.marks} mk`));
    this.root.append(head);

    const body = el('div', 'g-body');
    const wares = el('div', 'g-wares');
    if (!list.length) wares.append(el('p', 'g-empty', 'Nothing in the bag anyone here would buy.'));
    for (const r of list) {
      const on = this.picked.includes(r.id);
      const line = q.lines.find(l => l.id === r.id);
      // The unit price of a row not yet ticked still has to be the price it would fetch, so it is
      // quoted as if it were the last thing added.
      const shown = line || quote(list, [...this.picked, r.id], doc, this.opts()).lines.find(l => l.id === r.id);
      const row = el('button', `g-ware${on ? ' on' : ''}`);
      row.append(el('span', null, r.name));
      row.append(el('span', 'g-n', `× ${r.n}`));
      row.append(el('span', 'g-pips', r.pips === null ? '—' : pips(r.pips)));
      const spark = el('span', 'g-spark');
      for (const b of r.bars) {
        const u = el('u');
        u.style.height = `${2 + b * 2.2}px`;
        spark.append(u);
      }
      row.append(spark);
      row.append(el('span', 'g-unit', `${Math.round(shown.unit)} mk ea`));
      row.append(el('span', 'g-tot', `${shown.marks} mk`));
      row.append(el('span', 'g-tick', on ? '✓' : ''));
      this.bindRow(row, r);
      wares.append(row);
    }
    body.append(wares);
    this.root.append(body);

    const till = el('div', 'g-till');
    till.append(el('span', null, `${pips(5)} fresh`));
    till.append(el('s', null, '▁▄ market is full of these'));
    till.append(el('span', null, q.items ? `Selling ${q.items} items` : ''));
    till.append(el('b', null, `${q.marks} mk`));
    const sell = el('button', null, 'SELL');
    sell.disabled = !q.items;
    sell.onclick = () => this.confirm(list, q);
    till.append(sell);
    this.root.append(till);
  }

  // Whole row toggles, because selling everything of a type is what players actually do; the
  // quantity stepper is behind the long-press, which is the uncommon case.
  bindRow(row, r) {
    let timer = null;
    row.addEventListener('pointerdown', () => {
      timer = setTimeout(() => { timer = null; this.stepper(r); }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      row.addEventListener(ev, e => {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
        if (e.type !== 'pointerup') return;
        this.picked = this.picked.includes(r.id) ? this.picked.filter(p => p !== r.id) : [...this.picked, r.id];
        this.o.sound?.('uiBlip');
        this.draw();
      });
    }
  }

  stepper(r) {
    const card = el('div', 'g-card');
    let n = r.n;
    const label = el('p', null, `${r.name} × ${n}`);
    const less = el('button', null, '−');
    const more = el('button', null, '+');
    const ok = el('button', null, 'Sell these');
    const set = d => { n = Math.max(1, Math.min(r.n, n + d)); label.textContent = `${r.name} × ${n}`; };
    less.onclick = () => set(-1);
    more.onclick = () => set(1);
    ok.onclick = () => {
      card.remove();
      this.o.onSell([{ id: r.id, n }]);
      this.picked = this.picked.filter(p => p !== r.id);
      this.draw();
    };
    card.append(label, less, more, ok);
    this.root.append(card);
  }

  confirm(list, q) {
    this.o.onSell(list.filter(r => this.picked.includes(r.id)).map(r => ({ id: r.id, n: r.n })));
    this.picked = [];
    this.draw();
  }
}

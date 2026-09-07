// The interact menu: right-click in the world, or long-press on touch.
//
// It is a small list at the point you pressed, not a screen — the world keeps running behind it
// and it closes on the next thing you do. What is on it depends on what you pressed: talking to a
// wall is not an option, and neither is trading with a noticeboard.
//
// Two of the three entries are honest about being incomplete rather than opening something empty.
// "Cast a spell" lists what the save actually has, which before the essence table is nothing.

import { el, clear, toast } from './ui.js';

const LABEL = { spell: 'Cast a spell', talk: 'Talk', trade: 'Trade offer' };

// What a press at a point can answer. Pure over the little the menu needs to know, so the rule
// about which entries appear is testable without a DOM or a raycaster.
export function optionsFor({ target, abilities = [], canTrade = false, tradeWith = null }) {
  const out = [];
  out.push({
    id: 'spell',
    label: LABEL.spell,
    note: abilities.length ? `${abilities.length} awakened` : 'No essences yet',
    enabled: abilities.length > 0,
  });
  out.push({
    id: 'talk',
    label: LABEL.talk,
    note: target?.name || 'Nobody in reach',
    enabled: !!target,
  });
  // `tradeWith` is a shop id if whoever is under the pointer keeps one. The three keepers on the
  // square are the only people in the game who do, so everywhere else this stays honestly shut
  // rather than opening an empty ledger and letting the player conclude the game is broken.
  const shop = canTrade ? tradeWith : null;
  out.push({
    id: 'trade',
    label: LABEL.trade,
    note: shop ? `Look over the counter` : 'Nobody here trades',
    enabled: !!shop,
  });
  return out;
}

export class InteractMenu {
  constructor({ host, onPick = () => {}, onClose = () => {} }) {
    this.host = host;
    this.onPick = onPick;
    this.onCloseCb = onClose;
    this.root = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  // `at` is a screen point, `opts` what optionsFor() returned.
  show(at, opts) {
    this.close();
    if (!opts?.length) return false;
    this.root = el('div', 'g-imenu');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    const card = el('div', 'g-imenu-card');
    card.onpointerdown = e => e.stopPropagation();
    for (const o of opts) {
      const b = el('button', `g-imenu-b${o.enabled ? '' : ' off'}`);
      b.append(el('b', null, o.label));
      b.append(el('span', null, o.note));
      b.onclick = () => {
        if (!o.enabled) { toast(this.host, o.note, { ms: 2400, level: 'g-low' }); return; }
        this.close();
        this.onPick(o.id);
      };
      card.append(b);
    }
    this.root.append(card);
    this.host.append(this.root);
    // Placed after it is in the document, because it needs its own measured size to stay on
    // screen: at the right-hand edge a menu anchored to the press runs off it.
    requestAnimationFrame(() => {
      if (!this.root) return;
      const r = card.getBoundingClientRect();
      const x = Math.min(Math.max(8, at.x - r.width / 2), innerWidth - r.width - 8);
      const y = Math.min(Math.max(8, at.y - r.height - 12), innerHeight - r.height - 8);
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      this.root.classList.add('in');
    });
    addEventListener('keydown', this.onKey);
    return true;
  }

  close() {
    if (!this.root) return;
    removeEventListener('keydown', this.onKey);
    const r = this.root;
    this.root = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 160);
    this.onCloseCb();
  }
}

// The spell list, as its own small sheet. Every row is castable and every row says whether it is:
// what it costs, and whether the well or the cooldown is the thing standing in the way. A button
// that looks live and does nothing is worse than one that says why.
export class SpellList {
  constructor({ host, abilities = () => [], state = () => ({ ready: true }), onCast = () => {} }) {
    this.host = host;
    this.abilities = abilities;
    this.state = state;
    this.onCast = onCast;
    this.root = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  show() {
    this.close();
    const list = this.abilities();
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    const sheet = el('div', 'g-parch');
    sheet.onpointerdown = e => e.stopPropagation();
    const head = el('header', 'g-parch-head');
    head.append(el('u', 'g-seal', '✦'));
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, 'Abilities'));
    t.append(el('p', null, list.length
      ? 'Awakened. Tap one, or press its number in the world.'
      : 'You have none yet.'));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x);
    sheet.append(head);

    const body = el('div', 'g-parch-body');
    if (!list.length) {
      body.append(el('p', null, 'Pass the proving and take three essences. The fourth is whatever they come to.'));
    }
    list.forEach((a, i) => {
      const st = this.state(a) || { ready: true };
      const b = el('button', `g-abil on g-castable${st.ready ? '' : ' g-spent'}`);
      const h = el('div', 'g-abil-h');
      h.append(el('b', null, `${i + 1}. ${a.name}`));
      h.append(el('em', null, a.fromName || ''));
      b.append(h);
      b.append(el('span', 'g-abil-cost', a.cost));
      b.append(el('p', null, a.text));
      // The mana cost and the reason, on one line. `why` is whatever js/game/spells.js refused
      // with, so the sheet and the toast the number keys raise say the same thing.
      b.append(el('span', 'g-abil-state', st.ready
        ? `${st.cost} mana · ready · key ${i + 1}`
        : (st.cooling > 0 ? `${st.cost} mana · ready in ${st.cooling.toFixed(1)}s` : st.why)));
      b.onclick = () => { this.close(); this.onCast(a); };
      body.append(b);
    });
    sheet.append(body);
    this.root.append(sheet);
    this.host.append(this.root);
    addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.root?.classList.add('in'));
    return true;
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

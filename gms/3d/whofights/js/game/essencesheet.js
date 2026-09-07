// The essence table, as a screen. Same parchment idiom as the contract boards: a sheet pinned in
// front of the world, not a modal — the world keeps rendering behind it and a tap off it closes.
//
// It is deliberately not a wizard. All twelve are on screen at once with what they do, because
// this is the one irreversible choice in the game and the thing that makes it a choice is being
// able to see what you are not taking. The confluence updates as you pick, so the third essence
// is chosen against the fourth it will make rather than in ignorance of it.

import { el, clear, toast } from './ui.js';
import { confluenceFor, checkPick, resolve, held, capacity, rowsOf, MAX_PER_ESSENCE } from './essences.js';

const KIND = {
  attack: 'Attack', special: 'Special', defence: 'Defence', recovery: 'Recovery',
  movement: 'Movement', control: 'Control', affliction: 'Affliction', conjuration: 'Conjuration',
  utility: 'Utility', buff: 'Boon',
};

export class EssenceSheet {
  constructor({ host, doc, saved = () => null, onChoose = () => {}, onClose = () => {} }) {
    this.host = host;
    this.doc = doc;
    this.saved = saved;
    this.onChoose = onChoose;
    this.onCloseCb = onClose;
    this.root = null;
    this.picked = [];
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  show() {
    if (!this.doc) return false;
    this.close();
    this.picked = [];
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    this.sheet = el('div', 'g-parch g-essences');
    this.sheet.onpointerdown = e => e.stopPropagation();
    this.root.append(this.sheet);
    this.draw();
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
    this.onCloseCb();
  }

  toggle(id) {
    const i = this.picked.indexOf(id);
    if (i >= 0) this.picked.splice(i, 1);
    // Silently refusing a fourth reads as a broken button. Say why, once.
    else if (this.picked.length >= this.doc.pick) { toast(this.host, `Three. Put one back first.`, { ms: 2600, level: 'g-low' }); return; }
    else this.picked.push(id);
    this.draw();
  }

  draw() {
    const s = clear(this.sheet);
    const have = held(this.doc, this.saved());

    const head = el('header', 'g-parch-head');
    head.append(el('u', 'g-seal', '✧'));
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, have ? 'Your Essences' : 'The Essence Table'));
    t.append(el('p', null, have
      ? 'Four essences, and what each of them can still become.'
      : 'Take three. The fourth is whatever the three of them come to, and nobody chooses that one.'));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x);
    s.append(head);

    const body = el('div', 'g-parch-body');
    s.append(body);
    if (have) { this.drawHeld(body, have); return; }
    this.drawPicker(body);
  }

  // ── already chosen ──
  drawHeld(body, have) {
    // Against the CEILING, not against the table. Every essence holds more than anyone can claim
    // from it — five each — and counting the awakened against forty would tell a player they were
    // a tenth of the way through something they will finish.
    const cap = capacity(this.doc, this.saved?.() || null) || have.rows.length * MAX_PER_ESSENCE;
    body.append(this.band(`${have.count} abilit${have.count === 1 ? 'y' : 'ies'} awakened of ${cap}.`,
      `Five from each of the four, and no more. Awakening stones open them, one at a time and `
      + `never the one you asked for — the Society does not hand those out.`, true));
    for (const row of have.rows) body.append(this.essenceCard(row, { showAll: true }));
  }

  // ── choosing ──
  drawPicker(body) {
    const why = checkPick(this.doc, this.picked);
    const conf = this.picked.length === this.doc.pick ? confluenceFor(this.doc, this.picked) : null;

    const band = this.band(
      why || `${this.picked.map(id => this.doc.essences[id].name).join(', ')} — and ${conf.name}.`,
      conf ? conf.blurb : 'Pick a third and the table will tell you what it makes.',
      !why);
    body.append(band);

    if (conf) {
      // What you will wake, NOT which one. Registration draws one ability from each of the four
      // and the draw is the point — two people who take the same three essences are not meant to
      // be the same adventurer. Naming four abilities here would be a promise the desk does not
      // keep, so it names the four essences and says out loud that the rest is a draw.
      const list = el('div', 'g-grant');
      list.append(el('b', null, 'One from each, drawn when you sign:'));
      for (const r of rowsOf(this.doc, { picked: this.picked, confluence: conf.id })) {
        const li = el('div', 'g-grant-row');
        li.append(el('u', null, r.name));
        li.append(el('span', null, `one of ${r.abilities.length} now · four more with stones`));
        list.append(li);
      }
      body.append(list);

      const go = el('button', 'g-take');
      go.append(el('span', null, `Take ${this.picked.map(id => this.doc.essences[id].name).join(', ')} and ${conf.name}`));
      go.onclick = () => this.confirm();
      body.append(go);
    }

    const grid = el('div', 'g-esslist');
    for (const e of Object.values(this.doc.essences)) {
      grid.append(this.essenceCard(e, { pickable: true, on: this.picked.includes(e.id) }));
    }
    body.append(grid);
  }

  band(title, note, good) {
    const b = el('div', `g-standing${good ? '' : ' shut'}`);
    b.append(el('b', null, title));
    b.append(el('span', null, note));
    return b;
  }

  essenceCard(e, { pickable = false, on = false, showAll = false } = {}) {
    const card = el(pickable ? 'button' : 'article', `g-ess${on ? ' on' : ''}${e.confluence ? ' conf' : ''}`);
    card.style.setProperty('--ess', e.colour || '#888');
    const top = el('div', 'g-ess-h');
    top.append(el('h3', null, e.name));
    if (e.confluence) top.append(el('em', null, 'Confluence'));
    else if (pickable) top.append(el('em', null, on ? 'Taken' : 'Take'));
    card.append(top);
    card.append(el('p', null, e.blurb));

    const list = el('div', 'g-abils');
    for (const a of e.abilities) {
      // While choosing, NOTHING is lit. It used to light the first, because the first was the one
      // registration handed you; the draw is random now, so lighting one would be the sheet
      // promising an ability the desk may not give. Everything here is what the essence COULD
      // become, which is what makes an irreversible choice a choice.
      const owned = showAll ? a.owned : false;
      const row = el('div', `g-abil${owned ? ' on' : ''}`);
      const h = el('div', 'g-abil-h');
      h.append(el('b', null, a.name));
      h.append(el('em', null, KIND[a.kind] || a.kind));
      row.append(h);
      row.append(el('span', 'g-abil-cost', a.cost));
      row.append(el('p', null, a.text));
      list.append(row);
    }
    card.append(list);
    if (pickable) card.onclick = () => this.toggle(e.id);
    return card;
  }

  confirm() {
    const r = resolve(this.doc, this.picked);
    if (!r.ok) { toast(this.host, r.why, { ms: 3000 }); return; }
    this.onChoose(r);
    this.close();
  }
}

// The four board screens. A sheet of parchment pinned in front of the hall, not a dialog: the
// world keeps rendering and running behind it, and it closes on the ✕, on Escape, or on a tap
// anywhere off the sheet.
//
// Everything it shows is an example (js/game/contracts.js). The point of the screen is the ladder
// — what iron is, what gold is, and which rung you are on — so the locked state is stated once at
// the top and then worn quietly by each row rather than shouted on every one.

import { el, toast } from './ui.js';
import { BOARDS, boardView, adventurerView, RANK_LABEL } from './contracts.js';

const NEW = 'board.new';
const money = n => `${n.toLocaleString('en-GB')} marks`;
const pips = n => '◆'.repeat(n) + '◇'.repeat(Math.max(0, 5 - n));

export function boardTitle(id) {
  return id === NEW ? 'New Adventures' : (BOARDS[id]?.title || null);
}

export class Noticeboard {
  constructor({ host, flags = () => ({}), onOpen = () => {}, onClose = () => {} }) {
    this.host = host;
    this.flags = flags;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.root = null;
    this.id = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  show(id) {
    if (!BOARDS[id] && id !== NEW) return false;
    this.close();
    this.id = id;
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    const sheet = el('div', 'g-parch');
    // Stops a tap that lands on the parchment from reaching the backdrop's close.
    sheet.onpointerdown = e => e.stopPropagation();
    this.root.append(sheet);
    (id === NEW ? this.drawNew(sheet) : this.drawContracts(sheet, id));
    this.host.append(this.root);
    addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.root?.classList.add('in'));
    this.onOpen(id);
    return true;
  }

  close() {
    if (!this.root) return;
    removeEventListener('keydown', this.onKey);
    const r = this.root;
    this.root = null;
    this.id = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 220);
    this.onClose();
  }

  head(sheet, { seal, title, strap }) {
    const h = el('header', 'g-parch-head');
    h.append(el('u', 'g-seal', seal));
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, title));
    t.append(el('p', null, strap));
    h.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    h.append(x);
    sheet.append(h);
    return el('div', 'g-parch-body');
  }

  drawContracts(sheet, id) {
    const view = boardView(id, this.flags());
    const b = view.board;
    const body = this.head(sheet, { seal: b.seal[0], title: b.title, strap: b.strap });

    const band = el('div', `g-standing${view.open ? '' : ' shut'}`);
    band.append(el('b', null, view.headline));
    band.append(el('span', null, view.open
      ? 'Take one down and bring it to the desk.'
      : `Rank is earned on the board below yours. ${RANK_LABEL[b.rank]} opens when the Academy says it does.`));
    body.append(band);

    const list = el('div', 'g-jobs');
    for (const j of view.jobs) {
      const card = el('article', `g-job${j.lock ? ' locked' : ''}`);
      const top = el('div', 'g-job-h');
      top.append(el('h3', null, j.name));
      top.append(el('b', null, money(j.reward)));
      card.append(top);

      // Two rows, not one wrapping row: at 390px a single flex line put the separator dot at the
      // start of the wrapped line and pushed the difficulty pips onto a line of their own.
      card.append(el('div', 'g-job-m', j.client));
      const where = el('div', 'g-job-m');
      where.append(el('span', null, `${j.where} · ${j.days} day${j.days === 1 ? '' : 's'}`));
      where.append(el('em', null, pips(j.difficulty)));
      card.append(where);

      card.append(el('p', null, j.blurb));
      // Named once per row and no more. The band at the top already says where the player stands,
      // and five repetitions of "you are unranked" is a telling-off rather than a rule.
      if (j.lock) card.append(el('div', 'g-job-lock', `⛊ ${j.lock.why}`));
      list.append(card);
    }
    body.append(list);
    body.append(el('p', 'g-parch-foot', b.note));
    sheet.append(body);
  }

  drawNew(sheet) {
    const view = adventurerView(this.flags());
    const body = this.head(sheet, { seal: '✦', title: 'New Adventures',
      strap: 'What the Academy asks before it calls you one.' });

    const band = el('div', `g-standing${view.eligible ? '' : ' shut'}`);
    band.append(el('b', null, view.headline));
    band.append(el('span', null, view.eligible
      ? 'Bring this list to any instructor and they will sign it.'
      : 'Nothing here is barred to you. It is only unfinished.'));
    body.append(band);

    const list = el('ol', 'g-steps');
    for (const s of view.steps) {
      const li = el('li', s.done ? 'done' : '');
      li.append(el('u', null, s.done ? '✓' : ''));
      const t = el('div');
      t.append(el('b', null, s.label));
      t.append(el('span', null, s.how));
      li.append(t);
      list.append(li);
    }
    body.append(list);
    body.append(el('p', 'g-parch-foot',
      'Signed for the Academy. The list has been seven items long for two hundred years and the '
      + 'order has changed nine times.'));
    sheet.append(body);
  }
}

// The toast Aaron asked for: a nudge, never a dialog, and only on the board that has a person
// standing behind it who can actually do something about the answer.
export const NUDGE = 'Instructor Vail keeps this board. Speak to her.';
export const nudge = host => toast(host, NUDGE, { ms: 5200, level: 'g-low' });

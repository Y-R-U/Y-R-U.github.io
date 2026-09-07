// The three shops on the square: what each one stocks, and the sheet you buy from.
//
// The stock lists are here and the PRICES are not — those live in js/game/economy.js, behind the
// Economy panel in the debug tab, because how long the game takes is a thing you find out by
// watching somebody play and not a thing you type once. A row whose price comes back zero is not
// stocked at all, which is how the knife stays out of the Weaponry.
//
// Pick a row, then press Buy. Not tap-to-buy: an awakening stone is ten contracts' pay and a
// mis-tap that spends it would be the worst moment in the game.

import { el, clear } from './ui.js';
import { ITEMS, itemOf, stockPrice, countOf, purse, MARKS, STONE, POTION, DRAUGHT, ROPE } from './items.js';
import { buyableIds, weaponOf } from './weapons.js';

export const SHOPS = {
  'shop.weaponry': {
    id: 'shop.weaponry',
    title: 'The Weaponry',
    strap: 'Sella Marrow, armourer. Everything on this side of the counter is hers.',
    // Weapons in the order they cost, then the rope, which is not a weapon and is on the counter
    // by the door because she is tired of explaining that.
    stock: () => [...buyableIds().filter(id => id !== ROPE), ROPE],
  },
  'shop.apothecary': {
    id: 'shop.apothecary',
    title: 'The Apothecary',
    strap: 'Master Ivens. Mind the shelf.',
    stock: () => [POTION, DRAUGHT],
  },
  'shop.general': {
    id: 'shop.general',
    title: 'General Goods',
    strap: 'Old Corvel. Rope, lamp oil, salt, boots — and one thing you cannot afford.',
    stock: () => [STONE, ROPE],
  },
};

export const isShop = id => typeof id === 'string' && !!SHOPS[id];

// Who keeps which counter. The interact menu's "Trade offer" asks this — it is the only thing in
// the game that has to get from a body to a shop, and it belongs here rather than in whichever
// module happened to list the three of them first.
export const KEEPERS = {
  smith: 'shop.weaponry',
  apothecary: 'shop.apothecary',
  sundry: 'shop.general',
};

export const shopOf = characterId => KEEPERS[characterId] || null;

// What a shop actually has out, priced. Anything at zero is not for sale rather than free.
export function wares(id) {
  const shop = SHOPS[id];
  if (!shop) return [];
  const seen = new Set();
  const out = [];
  for (const itemId of shop.stock()) {
    if (seen.has(itemId) || !ITEMS[itemId]) continue;
    seen.add(itemId);
    const price = stockPrice(itemId);
    if (price <= 0) continue;
    out.push({ id: itemId, price, item: ITEMS[itemId] });
  }
  return out.sort((a, b) => a.price - b.price);
}

// Can this be bought, and if not, why not. A reason rather than a boolean, because it goes on the
// button and a disabled button with nothing on it is a broken one.
export function refuse(bag, id, shopId) {
  const row = wares(shopId).find(w => w.id === id);
  if (!row) return 'Not stocked here.';
  if (purse(bag) < row.price) return `${row.price - purse(bag)} marks short.`;
  return null;
}

const money = n => `${(n || 0).toLocaleString('en-GB')} marks`;

export class Shop {
  constructor({ host, bag = () => ({}), onBuy = () => false, onOpen = () => {}, onClose = () => {} }) {
    this.host = host;
    this.bag = bag;
    this.onBuy = onBuy;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.root = null;
    this.id = null;
    this.picked = null;
    this.onKey = e => { if (e.key === 'Escape') this.close(); };
  }

  get open() { return !!this.root; }

  show(id) {
    if (!SHOPS[id]) return false;
    this.close();
    this.id = id;
    this.picked = null;
    this.root = el('div', 'g-boardwrap');
    this.root.onpointerdown = e => { if (e.target === this.root) this.close(); };
    this.sheet = el('div', 'g-parch g-shop');
    this.sheet.onpointerdown = e => e.stopPropagation();
    this.root.append(this.sheet);
    this.host.append(this.root);
    addEventListener('keydown', this.onKey);
    this.draw();
    requestAnimationFrame(() => this.root?.classList.add('in'));
    this.onOpen(id);
    return true;
  }

  refresh() { if (this.root) this.draw(); }

  draw() {
    const shop = SHOPS[this.id];
    clear(this.sheet);

    const head = el('header', 'g-parch-head');
    const t = el('div', 'g-parch-title');
    t.append(el('h2', null, shop.title));
    t.append(el('p', null, shop.strap));
    head.append(t);
    const x = el('button', 'g-parch-x', '✕');
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.close();
    head.append(x);
    this.sheet.append(head);

    const body = el('div', 'g-parch-body');
    const list = el('div', 'g-wares');
    const rows = wares(this.id);
    const bag = this.bag();
    if (!rows.length) body.append(el('p', 'g-invempty', 'The shelves are bare today.'));
    for (const w of rows) {
      const row = el('button', `g-ware${this.picked === w.id ? ' on' : ''}`);
      row.append(el('span', null, w.item.name));
      row.append(el('em', null, this.line(w)));
      const held = countOf(bag, w.id);
      row.append(el('u', 'g-tot', held ? `you have ${held}` : ''));
      row.append(el('i', 'g-unit', money(w.price)));
      row.onclick = () => { this.picked = this.picked === w.id ? null : w.id; this.draw(); };
      list.append(row);
    }
    body.append(list);
    if (this.picked) {
      const it = itemOf(this.picked);
      body.append(el('p', 'g-shopnote', it?.blurb || ''));
    }
    this.sheet.append(body);

    // The till. What you have, what it costs, and one button.
    const till = el('div', 'g-till');
    till.append(el('s', null, 'Purse'));
    till.append(el('b', null, money(purse(bag))));
    const why = this.picked ? refuse(bag, this.picked, this.id) : 'Pick something';
    const buy = el('button', null, why || `Buy for ${money(rows.find(w => w.id === this.picked)?.price)}`);
    buy.disabled = !!why;
    buy.onclick = () => { if (this.onBuy(this.picked, this.id)) this.refresh(); };
    till.append(buy);
    this.sheet.append(till);
  }

  // One line saying what the thing is, in the terms that matter for that kind. A weapon is its
  // numbers; everything else is what it does.
  line(w) {
    if (w.item.kind === 'weapon') {
      const k = weaponOf(w.id);
      return `${k.damage} damage · ${k.reach.toFixed(1)} m reach`;
    }
    if (w.id === STONE) return 'wakes one ability, at random';
    if (w.id === POTION) return 'closes what is open';
  if (w.id === DRAUGHT) return 'closes rather more than a wound';
    if (w.id === ROPE) return 'holds one thing still';
    return w.item.kind;
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

export { MARKS };

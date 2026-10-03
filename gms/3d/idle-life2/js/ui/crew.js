import { el, btn } from './dom.js?v=20261004b';
import { fmtCash } from '../state/format.js?v=20261004b';
import { section, empty } from './kit.js?v=20261004b';

export function fillCrew(body, ctx) {
  const { model, game } = ctx;
  const grid = el('div', 'crew-grid');
  body.appendChild(grid);
  const bagSec = section(body, '🎒 Bag');
  const bag = el('div', 'bag-row');
  bagSec.appendChild(bag);
  let sig = '';

  function paint() {
    const ms = model.managers();
    const items = model.items();
    const key = ms.map((m) => m.owned + ':' + m.hired + ':' + m.level + ':' + model.stats(m.def.lineId).owned).join(',') + '|' + items.length + '|' + items.filter((i) => i.equippedTo).length;
    if (key === sig) return;
    sig = key;
    grid.replaceChildren();
    for (const m of ms) {
      const line = model.line(m.def.lineId);
      const owned = model.stats(m.def.lineId).owned;
      if (!owned && !m.owned) continue;
      const b = btn('crew' + (m.owned ? '' : ' unhired') + (m.owned && !m.hired ? ' idle' : ''), '', () => {
        if (m.owned) ctx.openManager(m.def.id, true);
        else ctx.openLine(m.def.lineId);
      }, m.def.name);
      const eq = model.equippedOn(m.def.id).filter(Boolean);
      b.append(
        el('span', 'crew-face', m.def.emoji),
        el('b', 'crew-n', m.def.name),
        el('small', 'crew-s', m.owned ? line.emoji + ' ' + '★'.repeat(Math.max(1, m.level)) : line.emoji + ' ' + fmtCash(model.q('hire', { lineId: m.def.lineId }).cost)),
        el('span', 'crew-gear', eq.map((i) => i.def.emoji).join('')),
      );
      grid.appendChild(b);
    }
    if (!grid.children.length) empty(grid, '🕴', 'Hire on a line card');
    bag.replaceChildren();
    const free = items.filter((i) => !i.equippedTo);
    if (!items.length) bag.appendChild(el('small', 'muted', '⏰ Rush Hour · 🎁 Deliveries'));
    for (const it of free.slice(0, 18)) {
      const s = el('span', 'item mini r' + it.rarity);
      s.append(el('span', 'item-e', it.def.emoji));
      bag.appendChild(s);
    }
    if (free.length > 18) bag.appendChild(el('small', 'muted', '+' + (free.length - 18)));
  }
  paint();
  return paint;
}

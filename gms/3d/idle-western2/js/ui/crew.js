import { el, btn } from './dom.js?v=20261004d';
import { fmtCash } from '../state/format.js?v=20261004d';
import { section, empty } from './kit.js?v=20261004d';
import { BOX_INFO } from './boxes.js?v=20261004d';

export function fillCrew(body, ctx) {
  const { model, game } = ctx;
  const boxSec = section(body, '🧰 Strongboxes');
  const boxes = el('div', 'box-row');
  boxSec.appendChild(boxes);
  const grid = el('div', 'crew-grid');
  section(body, '🕴 Managers').appendChild(grid);
  const bagSec = section(body, '🎒 Saddlebag');
  const bag = el('div', 'bag-row');
  bagSec.appendChild(bag);
  const tools = el('div', 'gear-tools');
  const auto = btn('pill gold', '✨ Auto-equip all', () => {
    const r = game.act('autoEquip', {});
    if (r.ok) { ctx.audio.sfx.pop(); sig = ''; ctx.textNow(); } else ctx.toast(r.msg || '🎒 Already the best gear');
  });
  tools.append(auto);
  bagSec.appendChild(tools);
  let sig = '';

  function paint() {
    const ms = model.managers();
    const items = model.items();
    const bx = model.boxes();
    const key = ms.map((m) => m.owned + ':' + m.hired + ':' + m.level + ':' + model.stats(m.def.lineId)?.owned).join(',') + '|' + items.map((i) => i.id + (i.equippedTo || '')).join(',') + '|' + JSON.stringify(bx) + '|' + model.teeth();
    if (key === sig) return;
    sig = key;

    boxes.replaceChildren();
    let anyBox = false;
    for (const k of ['basic', 'silver', 'gold']) {
      const n = bx[k] || 0;
      if (!n) continue;
      anyBox = true;
      const b = btn('box-btn ' + k, '', () => { ctx.openBox(k); sig = ''; }, 'Open ' + BOX_INFO[k].n);
      b.append(el('span', 'box-i', BOX_INFO[k].e), el('b', '', '×' + n), el('small', '', 'Open'));
      boxes.appendChild(b);
    }
    if (!anyBox) boxes.appendChild(el('small', 'muted', '🤠 Duels · 🍺 Brawls · 💰 Robberies'));

    grid.replaceChildren();
    for (const m of ms) {
      const line = model.line(m.def.lineId);
      const owned = model.stats(m.def.lineId)?.owned;
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
    if (!grid.children.length) empty(grid, '🕴', 'Hire on a business card');

    bag.replaceChildren();
    const free = items.filter((i) => !i.equippedTo);
    if (!items.length) bag.appendChild(el('small', 'muted', 'Open strongboxes for gear'));
    for (const it of free.slice(0, 24)) {
      const s = el('span', 'item mini r' + it.rarity);
      s.title = it.def.name;
      s.append(el('span', 'item-e', it.def.emoji));
      bag.appendChild(s);
    }
    if (free.length > 24) bag.appendChild(el('small', 'muted', '+' + (free.length - 24)));
    auto.hidden = !free.length || !ms.some((m) => m.hired);
  }
  paint();
  return paint;
}

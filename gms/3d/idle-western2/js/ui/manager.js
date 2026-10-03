import { el, btn } from './dom.js?v=20261004e';
import { section, buyRow, empty } from './kit.js?v=20261004e';

// Manager sheet: portrait, trait, Lv 1–5 (cash + 🦷), item slots, the saddlebag (equip, merge 3 → 1, auto-equip).
export function fillManager(body, ctx, managerId) {
  const { model, game } = ctx;
  const def = model.mgrById[managerId];
  const line = model.line(def.lineId);
  const STARS = game.data.managerLevels?.max || 5;
  const me = () => model.managers().find((x) => x.def.id === managerId) || { level: 0, owned: false, hired: false };
  let sel = null, sig = '';

  const card = el('div', 'mgr-card');
  const face = el('div', 'mgr-portrait', def.emoji);
  face.dataset.line = line.emoji;
  const who = el('div', 'mgr-who');
  const stars = el('div', 'stars');
  const trait = el('small', 'mgr-trait');
  who.append(el('h3', '', def.name), stars, trait);
  card.append(face, who);
  body.appendChild(card);

  const lvUp = buyRow(body, ctx, {
    icon: '⭐', label: 'Promote',
    sub: () => {
      if (me().level >= STARS) return 'Top of the pecking order';
      const q = model.q('managerLevel', { managerId });
      const lv = me().level;
      return (q.teeth ? `+ 🦷${q.teeth} · ` : '') + (lv === 2 ? '2nd item slot' : 'Earns more');
    },
    quote: () => {
      const q = model.q('managerLevel', { managerId });
      return q.teeth && model.teeth() < q.teeth ? { ...q, affordable: false, lock: '🦷 ' + q.teeth } : q;
    },
    run: () => game.act('managerLevel', { managerId }),
    done: () => me().level >= STARS,
    after: () => { sig = ''; },
  });
  const place = btn('wide-btn', '', () => {
    const r = game.act('hire', { lineId: def.lineId, managerId });
    if (r.ok) { ctx.audio.sfx.pop(); sig = ''; ctx.textNow(); } else ctx.toast(r.msg || '🙅 Not yet');
  });
  body.appendChild(place);

  const slotsSec = section(body, 'Gear');
  const slots = el('div', 'slots');
  slotsSec.appendChild(slots);
  const tools = el('div', 'gear-tools');
  const auto = btn('pill', '✨ Auto-equip', () => {
    const r = game.act('autoEquip', { managerId });
    if (r.ok) { ctx.audio.sfx.pop(); sig = ''; ctx.textNow(); } else ctx.toast(r.msg || '🎒 Already the best gear');
  });
  const merge = btn('pill gold', '🔮 Merge 3', () => {
    if (!sel) return;
    const r = game.act('merge', { itemId: sel });
    if (r.ok) { ctx.celebrate('🔮 ' + model.itemEmoji(r.item.def) + ' Merged!'); sel = null; sig = ''; ctx.textNow(); } else ctx.toast('🔮 Merge needs 3 alike');
  });
  tools.append(auto, merge);
  slotsSec.appendChild(tools);
  const grid = el('div', 'item-grid');
  section(body, 'Saddlebag').appendChild(grid);

  function equip(it) {
    const r = game.act('equip', { itemId: it.id, managerId });
    if (r.ok) { ctx.audio.sfx.pop(); ctx.buzz(8); sel = null; sig = ''; ctx.textNow(); }
    else ctx.toast(r.code === 'full' ? '🔒 Slots full' : r.msg || '🎒 Can’t equip');
  }

  function paint() {
    const m = me();
    const items = model.items();
    const lv = Math.max(1, m.level);
    const key = [lv, m.hired, m.owned, items.map((i) => i.id + i.equippedTo + i.rarity).join(','), sel].join('|');
    if (key === sig) return;
    sig = key;
    stars.textContent = '★'.repeat(lv) + '☆'.repeat(Math.max(0, STARS - lv));
    trait.textContent = `${def.trait} · ${def.text}`;
    face.classList.toggle('unhired', !m.owned);
    place.hidden = !(m.owned && !m.hired && model.stats(line.id)?.owned);
    if (!place.hidden) place.textContent = `🕴 Run ${line.emoji} ${model.lineName(line.id)}`;
    lvUp.row.hidden = !m.owned;
    slotsSec.hidden = !m.owned;

    slots.replaceChildren();
    const n = model.slotsFor(lv);
    const on = model.equippedOn(managerId);
    for (let i = 0; i < Math.max(2, n); i++) {
      const it = on[i];
      const s = btn('slot' + (i >= n ? ' locked' : '') + (it ? ' r' + it.rarity : ''), i >= n ? '🔒' : it ? it.def.emoji : '+', () => {
        if (i >= n) { ctx.toast('⭐ Second slot at manager Lv 3'); return; }
        if (it) { const r = game.act('unequip', { itemId: it.id }); if (r.ok) { sig = ''; ctx.textNow(); } }
      }, i >= n ? 'Locked slot' : it ? 'Unequip ' + it.def.name : 'Empty slot');
      if (it) s.appendChild(el('small', '', model.itemLabel(it)));
      slots.appendChild(s);
    }

    grid.replaceChildren();
    const free = items.filter((i) => !i.equippedTo);
    if (!free.length) empty(grid, '🧰', 'Open strongboxes for gear');
    for (const it of free) {
      const b = btn('item r' + it.rarity + (sel === it.id ? ' sel' : ''), '', () => {
        if (sel === it.id) equip(it);
        else { sel = it.id; sig = ''; paint(); }
      }, it.def.name);
      b.append(el('span', 'item-e', it.def.emoji), el('small', '', model.itemLabel(it)));
      grid.appendChild(b);
    }
    const selIt = items.find((i) => i.id === sel);
    const alike = selIt ? free.filter((i) => i.def.id === selIt.def.id && i.rarity === selIt.rarity).length : 0;
    merge.hidden = !(selIt && alike >= 3 && selIt.rarity < 2);
    auto.hidden = !free.length;
  }

  const update = () => { lvUp(); paint(); };
  update();
  return update;
}

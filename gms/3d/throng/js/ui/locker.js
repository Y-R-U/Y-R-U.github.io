import { esc, hex, num, UI_ICON } from './kit.js';
import { SHOP, owns, buy, equip } from '../meta/shop.js';
import { ICON } from './hud.js';

const TABS = [['color', 'Colour'], ['plate', 'Name plate'], ['badge', 'Badge'], ['emote', 'Emote'], ['toast', 'Toasts']];

function preview(slot, it, app) {
  const col = hex(slot === 'color' ? it.color : (app.colorHex()));
  switch (slot) {
    case 'color': return `<span class="pv-crowd" style="--c:${col}">${ICON.person.repeat(3)}</span>`;
    case 'plate': return `<span class="pv-plate plate-${it.id}" style="--c:${col}">${ICON.person}<i>${esc(app.playerName())}</i></span>`;
    case 'badge': return `<span class="badge me bs-${it.id} pv-badge" style="--c:${col}"><span class="b-n">128</span></span>`;
    case 'emote': return `<span class="pv-emote">${it.glyph}</span>`;
    case 'toast': return `<span class="pv-toast ts-${it.id}"><span class="toast-t">ABSORBED</span></span>`;
  }
  return '';
}

export function renderLocker(body, { app, tab = 'color' }) {
  let cur = tab, pending = null;
  body.innerHTML = `<div class="lk-coins">${UI_ICON.coin}<b></b></div>
    <div class="tabs">${TABS.map(([id, n]) => `<button type="button" data-tab="${id}">${n}</button>`).join('')}</div>
    <div class="lk-grid"></div>
    <p class="lk-note">Earn coins by playing. Every item here is cosmetic.</p>`;
  const grid = body.querySelector('.lk-grid'), coinsEl = body.querySelector('.lk-coins b');
  body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { cur = b.dataset.tab; pending = null; app.audio.ui(); draw(); }));

  function draw() {
    const s = app.save;
    coinsEl.textContent = num(s.coins);
    body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
    grid.className = 'lk-grid lk-' + cur;
    grid.innerHTML = SHOP[cur].map((it) => {
      const own = owns(s, cur, it.id), on = s.equip[cur] === it.id;
      const can = s.coins >= it.price;
      const state = on ? 'equipped' : own ? 'owned' : pending === it.id ? 'confirm' : can ? 'buy' : 'locked';
      const foot = on ? `${UI_ICON.check} Equipped` : own ? 'Equip' : pending === it.id ? `Buy ${UI_ICON.coin}${num(it.price)}?` : `${can ? '' : UI_ICON.lock}${UI_ICON.coin}${num(it.price)}`;
      return `<button type="button" class="lk-item ${state}" data-id="${it.id}"><span class="lk-pv">${preview(cur, it, app)}</span><span class="lk-n">${esc(it.name)}</span><span class="lk-f">${foot}</span></button>`;
    }).join('');
    grid.querySelectorAll('.lk-item').forEach((b) => b.addEventListener('click', () => tap(b.dataset.id)));
  }

  function tap(id) {
    const s = app.save;
    if (owns(s, cur, id)) {
      equip(s, cur, id); pending = null; app.audio.ui(); app.persist(); draw(); app.changed();
      return;
    }
    const it = SHOP[cur].find((x) => x.id === id);
    if (s.coins < it.price) { pending = null; draw(); grid.querySelector(`[data-id="${id}"]`)?.classList.add('shake'); return; }
    if (pending !== id) { pending = id; app.audio.ui(); draw(); return; }
    const r = buy(s, cur, id);
    pending = null;
    if (r.ok) { app.audio.pickup('double'); app.persist(); app.changed(); }
    draw();
    if (r.ok) grid.querySelector(`[data-id="${id}"]`)?.classList.add('bought');
  }
  draw();
}

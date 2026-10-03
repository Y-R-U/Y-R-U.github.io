import { el, btn } from './dom.js?v=20261004d';

// Strongbox opening: the box rattles three times, the lid pops, the loot fans out by rarity. Tap to close.
export const BOX_INFO = { basic: { e: '📦', n: 'Strongbox' }, silver: { e: '🧰', n: 'Silver strongbox' }, gold: { e: '💰', n: 'Gold strongbox' } };
const RARITY = ['Common', 'Rare', 'Epic'];

export function createBoxes(root, ctx) {
  const { game, model, audio } = ctx;
  let open = null;

  function close() {
    if (!open) return;
    const o = open;
    open = null;
    o.classList.add('out');
    setTimeout(() => o.remove(), 260);
  }

  function show(kind) {
    const r = game.act('openBox', { kind });
    if (!r.ok) { ctx.toast(r.msg || '📦 No strongbox'); return null; }
    close();
    const wrap = el('div', 'box-open');
    const card = el('div', 'box-card');
    const box = el('div', 'box-e', BOX_INFO[kind]?.e || '📦');
    const title = el('b', 'box-t', BOX_INFO[kind]?.n || 'Strongbox');
    const loot = el('div', 'box-loot');
    const ok = btn('pill gold', 'Yee-haw!', (e) => { e.stopPropagation(); close(); ctx.textNow(); });
    card.append(title, box, loot, ok);
    wrap.appendChild(card);
    wrap.addEventListener('click', close);
    root.appendChild(wrap);
    open = wrap;
    audio.sfx.clunk();
    setTimeout(() => audio.sfx.clunk(), 260);
    setTimeout(() => audio.sfx.clunk(), 520);
    setTimeout(() => {
      box.classList.add('popped');
      audio.stinger('st_box');
      for (const [i, it] of (r.items || []).entries()) {
        const def = model.itemById[it.def] || { emoji: '🎁', name: it.def };
        const c = el('div', 'item r' + it.rarity);
        c.style.animationDelay = i * 0.12 + 's';
        c.append(el('span', 'item-e', def.emoji), el('small', '', RARITY[it.rarity] || ''), el('small', 'item-n', def.name));
        loot.appendChild(c);
      }
      ctx.buzz(25);
    }, 820);
    return r.items;
  }

  return { show, close, get open() { return !!open; } };
}

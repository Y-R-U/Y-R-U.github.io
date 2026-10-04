import { el, btn } from './dom.js?v=20261004g';

// Strongbox opening: the box rattles three times, the lid pops, the loot fans out by rarity.
// Any tap during the rattle skips to the reveal; only the button closes, and only 400 ms after the reveal settles.
export const BOX_INFO = { basic: { e: '📦', n: 'Strongbox' }, silver: { e: '🧰', n: 'Silver strongbox' }, gold: { e: '💰', n: 'Gold strongbox' } };
const RARITY = ['Common', 'Rare', 'Epic'];
const POP_MS = 820, SETTLE_MS = 450, GUARD_MS = 400;

export function createBoxes(root, ctx) {
  const { game, model, audio } = ctx;
  let open = null;

  function close() {
    if (!open) return;
    const o = open;
    open = null;
    for (const t of o.timers) clearTimeout(t);
    o.wrap.classList.add('out');
    setTimeout(() => o.wrap.remove(), 260);
  }

  function show(kind) {
    if (open && !open.ready) { open.reveal(); return null; }
    const r = game.act('openBox', { kind });
    if (!r.ok) { ctx.toast(r.msg || '📦 No strongbox'); return null; }
    close();
    const wrap = el('div', 'box-open');
    const card = el('div', 'box-card');
    const box = el('div', 'box-e', BOX_INFO[kind]?.e || '📦');
    const title = el('b', 'box-t', BOX_INFO[kind]?.n || 'Strongbox');
    const loot = el('div', 'box-loot');
    const ok = btn('pill gold', 'Yee-haw!', (e) => { e.stopPropagation(); if (o.ready) { close(); ctx.textNow(); } else o.reveal(); });
    ok.classList.add('wait');
    ok.setAttribute('aria-disabled', 'true');
    card.append(title, box, loot, ok);
    wrap.appendChild(card);
    const o = { wrap, timers: [], popped: false, ready: false };
    const later = (fn, ms) => o.timers.push(setTimeout(fn, ms));
    o.reveal = (fast = true) => {
      if (o.popped) return;
      o.popped = true;
      for (const t of o.timers) clearTimeout(t);
      o.timers.length = 0;
      wrap.classList.toggle('fast', fast);
      box.classList.add('popped');
      audio.stinger('st_box');
      const step = fast ? 0.05 : 0.12;
      for (const [i, it] of (r.items || []).entries()) {
        const def = model.itemById[it.def] || { emoji: '🎁', name: it.def };
        const c = el('div', 'item r' + it.rarity);
        c.style.animationDelay = i * step + 's';
        c.append(el('span', 'item-e', def.emoji), el('small', '', RARITY[it.rarity] || ''), el('small', 'item-n', def.name));
        loot.appendChild(c);
      }
      ctx.buzz(25);
      const settle = (fast ? 250 : SETTLE_MS) + (r.items || []).length * step * 1000;
      later(() => { o.ready = true; ok.classList.remove('wait'); ok.removeAttribute('aria-disabled'); wrap.classList.add('ready'); }, settle + GUARD_MS);
    };
    wrap.addEventListener('pointerdown', (e) => { if (!o.popped) { e.stopPropagation(); o.reveal(); } });
    wrap.addEventListener('click', (e) => { e.stopPropagation(); if (o.ready && !card.contains(e.target)) close(); });
    root.appendChild(wrap);
    open = o;
    audio.sfx.clunk();
    later(() => audio.sfx.clunk(), 260);
    later(() => audio.sfx.clunk(), 520);
    later(() => o.reveal(false), POP_MS);
    return r.items;
  }

  return { show, close, get open() { return !!open; }, get ready() { return !!open?.ready; } };
}

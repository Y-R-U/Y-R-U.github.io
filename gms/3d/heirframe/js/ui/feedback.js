import { h, esc, fmt, clamp, RARITY, onTap, haptic, centerBanner } from './core.js';
import { icon } from './icons.js';
import { itemCardHTML, itemIcon } from './itemcard.js';

const TOAST_ICON = { info: 'sparkle', good: 'check', warn: 'heat', bad: 'skull', gold: 'credits', story: 'codex' };

export function createFeedback(bus) {
  const el = h('div.hf-fx.hf-layer');
  const dmgLayer = h('div.hf-dmg');
  const toasts = h('div.hf-toasts');
  const lootFeed = h('div.hf-lootfeed');
  const marker = h('div.hf-marker', { html: `<div class="mk-pin"><div class="mk-arrow">${icon('arrow')}</div><div class="mk-dia"></div></div><div class="mk-txt"><b></b><span class="hf-num"></span></div>` });
  const interact = h('button.hf-interact.hf-live', { html: `<span class="ii"></span><span class="il"></span><kbd>E</kbd>` });
  const banner = h('div.hf-legend');
  const cardWrap = h('div.hf-cardpop');
  el.append(dmgLayer, marker, toasts, lootFeed, banner, interact, cardWrap);

  onTap(interact, () => { haptic(12); bus.emit('sfx', 'click'); bus.emit('interact'); });

  function toast(text, kind = 'info', o = {}) {
    const t = h(`div.hf-toast.${kind}`, {
      html: `<span class="ti">${icon(o.icon || TOAST_ICON[kind] || 'sparkle')}</span><span class="tx"><b>${esc(text)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>`,
    });
    toasts.prepend(t);
    while (toasts.children.length > 3) toasts.lastChild.remove();
    bus.emit('sfx', 'toast');
    const ms = o.ms ?? (kind === 'story' ? 4200 : 2600);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
    return t;
  }

  function legend(it) { centerBanner(() => legendNow(it), 2900); }
  function legendNow(it) {
    const R = RARITY.get(it.rarity);
    banner.innerHTML = `<div class="lg r-${R.key}" style="--rc:${R.color}"><div class="beam"></div><div class="lr">${esc(R.name)} recovered</div><div class="ln">${esc(it.name)}</div><div class="ll"></div></div>`;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
    clearTimeout(legend.t); legend.t = setTimeout(() => banner.classList.remove('show'), 2800);
  }

  function loot(items) {
    let best = null;
    (items || []).forEach((it, i) => {
      const R = RARITY.get(it.rarity ?? 1);
      setTimeout(() => {
        const row = h(`div.hf-loot.hf-live.r-${R.key}`, {
          style: `--rc:${R.color}`,
          html: it.credits
            ? `<span class="li gold">${icon('credits')}</span><span class="ln hf-gold-text hf-num">+${fmt(it.credits)} cr</span>`
            : `<span class="li">${icon(itemIcon(it))}</span><span class="ln">${esc(it.name)}${it.qty > 1 ? ` <em>×${it.qty}</em>` : ''}</span>${it.upgrade === true || it.better ? `<button class="leq hf-live">${icon('up')}Equip</button>` : `<span class="lr">${esc(R.name)}</span>`}`,
        });
        if (!it.credits) onTap(row, () => { bus.emit('loot:inspect', it); });
        const eq = row.querySelector('.leq');
        if (eq) onTap(eq, () => { haptic(15); bus.emit('sfx', 'confirm'); bus.emit('loot:equip', it); row.classList.add('equipped'); eq.innerHTML = `${icon('check')}Equipped`; });
        lootFeed.append(row);
        while (lootFeed.children.length > 4) lootFeed.firstChild.remove();
        setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 450); }, eq ? 6500 : 3600);
      }, i * 140);
      if (!it.credits && (!best || RARITY.index(it.rarity) > RARITY.index(best.rarity))) best = it;
    });
    if (best && RARITY.index(best.rarity) >= RARITY.legendary) { legend(best); bus.emit('sfx', 'loot_rare'); haptic(30); }
    else bus.emit('sfx', 'loot');
  }

  const pool = [];
  let live = 0;
  function damage(x, y, amount, kind = 'normal') {
    if (live > 40) return;
    const d = pool.pop() || h('div.hf-dn');
    d.className = `hf-dn ${kind}`;
    const n = typeof amount === 'number' ? fmt(Math.abs(amount)) : amount;
    d.innerHTML = kind === 'miss' ? 'MISS' : kind === 'heal' ? `+${n}` : kind === 'shield' ? `${icon('shield')}${n}` : kind === 'crit' ? `<small>CRIT</small>${n}` : kind === 'player' ? `-${n}` : n;
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    dmgLayer.append(d);
    live++;
    const dx = (Math.random() - .5) * 50, crit = kind === 'crit';
    const a = d.animate(crit ? [
      { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 },
      { transform: 'translate(-50%,-60%) scale(.9)', opacity: 1, offset: .12 },
      { transform: 'translate(-50%,-70%) scale(1.15)', opacity: 1, offset: .22 },
      { transform: `translate(calc(-50% + ${dx}px), -260%) scale(1)`, opacity: 1, offset: .75 },
      { transform: `translate(calc(-50% + ${dx}px), -320%) scale(.9)`, opacity: 0 },
    ] : [
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-80%) scale(1.2)', opacity: 1, offset: .12 },
      { transform: `translate(calc(-50% + ${dx * .6}px), -200%) scale(1)`, opacity: 1, offset: .6 },
      { transform: `translate(calc(-50% + ${dx}px), -280%) scale(.85)`, opacity: 0 },
    ], { duration: crit ? 1100 : 850, easing: 'cubic-bezier(.2,.8,.3,1)' });
    a.onfinish = () => { d.remove(); live--; pool.push(d); };
  }

  const mk = { on: false };
  const mkPin = marker.querySelector('.mk-pin'), mkArrow = marker.querySelector('.mk-arrow');
  const mkLabel = marker.querySelector('.mk-txt b'), mkDist = marker.querySelector('.mk-txt span');
  function markerSet(sx, sy, onScreen, label = '', dist) {
    const W = innerWidth, H = innerHeight;
    if (!mk.on) { marker.classList.add('on'); mk.on = true; }
    if (label !== mk.label) { mkLabel.textContent = label; mk.label = label; }
    const dt = dist != null ? `${Math.round(dist)}m` : '';
    if (dt !== mk.dist) { mkDist.textContent = dt; mk.dist = dt; }
    marker.classList.toggle('off', !onScreen);
    let x = sx, y = sy;
    if (!onScreen) {
      const cx = W / 2, cy = H / 2;
      const mx = W / 2 - 70, myT = H / 2 - 80, myB = H / 2 - 90;
      const dx = sx - cx, dy = sy - cy;
      const my = dy < 0 ? myT : myB;
      const s = Math.min(Math.abs(dx) > 1e-3 ? mx / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-3 ? my / Math.abs(dy) : 1e9);
      x = cx + dx * s; y = cy + dy * s;
      mkArrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    } else {
      x = clamp(x, 30, W - 30); y = clamp(y, 40, H - 30);
    }
    const hs = parseFloat(el.parentElement?.style.getPropertyValue('--hs')) || 1;
    if (!onScreen && x > W - 290 * hs && y > H - 240 * hs) y = H - 240 * hs;
    if (!onScreen && x < 300 * hs && y < 190 * hs) y = 190 * hs;
    marker.style.transform = `translate(${x}px, ${y}px)`;
  }

  let cardClose = null;
  function itemCard(item, cmp, { actions = '', onAction } = {}) {
    const html = `${cmp ? itemCardHTML(cmp, null, { equipped: true }) : ''}${itemCardHTML(item, cmp, { actions })}`;
    cardWrap.innerHTML = `<div class="cp-back hf-live"></div><div class="cp-cards">${html}</div>`;
    cardWrap.classList.add('show');
    bus.emit('sfx', 'open');
    const close = () => { cardWrap.classList.remove('show'); cardClose = null; };
    cardClose = close;
    cardWrap.querySelector('.cp-back').addEventListener('click', close);
    cardWrap.querySelectorAll('[data-act]').forEach(b => onTap(b, () => { haptic(); onAction && onAction(b.dataset.act); close(); }));
    return close;
  }

  return {
    el, toast, loot, damage, itemCard,
    closeCard() { if (cardClose) { cardClose(); return true; } return false; },
    marker: { set: markerSet, hide() { marker.classList.remove('on'); mk.on = false; } },
    interact: {
      show(label, o = {}) {
        interact.querySelector('.il').textContent = label;
        interact.querySelector('.ii').innerHTML = icon(o.icon || 'interact');
        interact.querySelector('kbd').textContent = o.key || 'E';
        interact.classList.add('show');
      },
      hide() { interact.classList.remove('show'); },
    },
  };
}

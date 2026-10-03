import { el, btn, show } from './dom.js?v=20261004b';
import { fmtCash } from '../state/format.js?v=20261004b';

const MINI = { rush: 'rush', lucky: 'lucky' };

// Events are 3D actors (render/eventart.js, picked as {kind:'event'}); the UI adds an edge chip when the
// actor is off the hero frame, a floating chip when the hero is scrolled away, and runs the claim / mini-game flow.
export function createEvents(hero, ctx, { onMini, heroOn, toHero }) {
  const { game, host, model, geo } = ctx;
  const layer = el('div', 'ev-layer');
  hero.appendChild(layer);
  let floatEv = null, floatKey = '', floatT = '';
  const float = btn('ev-float', '', (ev) => { ev.stopPropagation(); if (floatEv) toHero(floatEv.lineId || 'home'); ctx.audio.sfx.whoosh(); }, 'Show event');
  float.hidden = true;
  (hero.closest('.il2') || document.body).appendChild(float);
  const live = new Map();
  let busy = null;

  function claim(e, at) {
    const kind = MINI[e.kind];
    if (kind) {
      if (busy) return;
      busy = e.id;
      onMini(kind, e);
      return;
    }
    const r = game.act('claimEvent', { eventId: e.id });
    if (!r.ok) return;
    const rw = r.reward;
    let msg;
    if (rw.cash > 0) msg = `${e.emoji} ${rw.jackpot ? 'JACKPOT ' : ''}+${fmtCash(rw.cash)}`;
    else if (rw.mult) msg = `${e.emoji} ${e.lineId ? model.line(e.lineId).emoji + ' income' : 'All income'} ×${rw.mult} · ${rw.sec}s`;
    else if (rw.tickets) msg = `${e.emoji} +${rw.tickets} tickets 🎟️`;
    else if (rw.order) msg = `${e.emoji} Bulk order for ${model.line(rw.order.lineId).emoji}!`;
    else msg = `${e.emoji} ${e.name}`;
    ctx.toast(msg, { cls: 'gold' });
    if (rw.order) ctx.cards.get(rw.order.lineId)?.want(20000);
    if (at) ctx.juice.coins(at.x, at.y, rw.cash > 0 ? 6 : 2, { big: true, step: 6 });
    ctx.audio.sfx.chime();
    ctx.buzz(15);
  }

  function ensure(e) {
    let m = live.get(e.id);
    if (m) return m;
    const edge = btn('ev-edge', '', (ev) => {
      ev.stopPropagation();
      ctx.rig().cut(e.lineId || 'home');
      ctx.audio.sfx.whoosh();
    }, 'Show ' + e.name);
    edge.append(el('span', 'ev-e', e.emoji), el('i', 'ev-arrow'));
    edge.hidden = true;
    layer.append(edge);
    m = { e, edge, life: Math.max(1, e.expires - game.simTime), t: '' };
    live.set(e.id, m);
    ctx.audio.sfx.whoosh();
    return m;
  }

  function drop(id) {
    const m = live.get(id);
    if (!m) return;
    m.edge.remove();
    live.delete(id);
  }

  game.on('event:claim', ({ event }) => { drop(event.id); if (busy === event.id) busy = null; });
  game.on('event:expire', ({ event }) => { if (busy !== event.id) drop(event.id); });

  return {
    // ~6 Hz: sync with state, place edge chips for events whose plot is off the hero frame.
    update() {
      const act = model.events();
      for (const id of live.keys()) if (busy !== id && !act.some((e) => e.id === id)) drop(id);
      for (const e of act) ensure(e);
      const away = !heroOn() && !ctx.townActive();
      let first = null, n = 0;
      if (away) for (const m of live.values()) if (busy !== m.e.id) { n++; if (!first || m.e.expires < first.e.expires) first = m; }
      floatEv = first?.e || null;
      show(float, !!first);
      if (first) {
        const key = first.e.id + ':' + n;
        if (key !== floatKey) { floatKey = key; float.replaceChildren(el('span', '', first.e.emoji), el('small', '', (n > 1 ? '+' + (n - 1) + ' ' : '') + '⤒')); }
        const t = Math.max(0, (first.e.expires - game.simTime) / first.life).toFixed(2);
        if (t !== floatT) { floatT = t; float.style.setProperty('--t', t); }
      }
      if (!live.size) return;
      const H = geo.heroH, W = geo.viewW;
      for (const m of live.values()) {
        if (away) { m.edge.hidden = true; continue; }
        if (busy === m.e.id || ctx.townActive()) { m.edge.hidden = true; continue; }
        const a = host.anchor(m.e);
        const p = a ? host.project('hero', a) : null;
        const y = p ? p.y : 0;
        const onScreen = !p || (p.visible && y > 8 && y < H - 8);
        m.edge.hidden = onScreen;
        if (onScreen) continue;
        m.edge.classList.toggle('right', p.x > W / 2);
        const t = Math.max(0, (m.e.expires - game.simTime) / m.life).toFixed(2);
        if (t !== m.t) { m.t = t; m.edge.style.setProperty('--t', t); }
      }
    },
    tryClaimHit(hit, at) {
      const id = hit.eventId || hit.id;
      const e = live.get(id)?.e || model.events().find((x) => x.id === id);
      if (!e) return false;
      claim(e, at);
      return true;
    },
    release(id) { if (busy === id) busy = null; },
    claim,
    get live() { return live; },
  };
}

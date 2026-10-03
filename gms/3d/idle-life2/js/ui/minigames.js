import { el, btn, setText } from './dom.js?v=20261004a';

const CRATE = { gold: '🏆 Gold crate', silver: '🎁 Silver crate', basic: '📦 Gear crate' };

export function createMinigames(hero, ctx) {
  const { game, host, model, audio, geo } = ctx;
  const layer = el('div', 'mini-layer');
  layer.hidden = true;
  hero.appendChild(layer);
  let cur = null;

  function restoreView(g) {
    const rg = ctx.rig();
    if (g.prevPin !== rg.pinned) g.prevPin ? rg.pin(g.prevPin) : rg.unpin();
    host.setFocus(rg.pinned || null);
  }

  function finish(score) {
    if (!cur) return;
    const g = cur;
    cur = null;
    layer.hidden = true;
    layer.replaceChildren();
    hero.classList.remove('mini-on', 'mini-soft');
    const won = g.kind === 'rush' || score >= g.need;
    const r = won ? game.act('claimEvent', { eventId: g.ev.id, score }) : null;
    ctx.releaseEvent(g.ev.id);
    const gear = (r?.reward?.items || []).map((it) => model.itemEmoji(it.def)).join('');
    if (g.kind === 'rush') {
      const tier = r?.reward?.tier || 'basic';
      ctx.toast(r?.ok ? `⏰ ${score} served · ${CRATE[tier]}` : '⏰ Rush over', { ms: 3000, cls: 'gold' });
      if (r?.ok) { ctx.celebrate(CRATE[tier] + '!'); ctx.onGear?.(r.reward?.items); }
    } else if (r?.ok) {
      ctx.toast(ctx.gearText(r.reward?.items || []) || '🎁 Caught it!', { ms: 2600, cls: 'gold' });
      ctx.onGear?.(r.reward?.items);
      audio.sfx.chime();
    } else ctx.toast('📦 The parcel got away', { ms: 1800 });
    restoreView(g);
    ctx.textNow();
  }

  // Where the event's 3D actor stands in the hero frame (falls back to its plot, then the middle).
  function center(ev, lineId) {
    const W = geo.viewW, H = geo.heroH;
    for (const a of [host.anchor(ev), lineId && host.anchor(lineId)]) {
      const p = a && host.project('hero', a);
      if (p && p.visible) return { x: Math.max(W * 0.18, Math.min(W * 0.82, p.x)), y: Math.max(H * 0.3, Math.min(H * 0.78, p.y + geo.offY)) };
    }
    return { x: W / 2, y: H * 0.55 };
  }

  function startRush(ev) {
    const lineId = ev.lineId || model.owned()[0].id;
    const rg = ctx.rig();
    cur = { kind: 'rush', ev, sec: ev.game.sec, max: ev.game.max, t0: performance.now(), score: 0, targets: [], spawnAt: 0, lineId, prevPin: rg.pinned };
    game.act('miniStart', { eventId: ev.id });
    rg.pin(lineId);
    host.setFocus(lineId);
    layer.hidden = false;
    hero.classList.add('mini-on');
    const head = el('div', 'mini-head');
    const timer = el('div', 'mini-timer');
    const fill = el('i');
    timer.appendChild(fill);
    const score = el('div', 'mini-score', '⏰ Tap customers!');
    head.append(score, timer);
    layer.appendChild(head);
    cur.ui = { fill, score, lastP: '' };
    ctx.celebrate('⏰ Rush Hour!');
    audio.sfx.sting();
    ctx.buzz(30);
  }

  function spawnTarget() {
    const g = cur;
    const c = center(g.ev, g.lineId);
    const W = geo.viewW, H = geo.heroH;
    let x = 0, y = 0;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, rr = 0.2 + Math.random() * 0.8;
      x = Math.max(32, Math.min(W - 32, c.x + Math.cos(a) * rr * Math.max(70, W * 0.24)));
      y = Math.max(70, Math.min(H - 36, c.y + Math.sin(a) * rr * Math.max(56, H * 0.2)));
      if (g.targets.every((t) => !t.node.isConnected || Math.hypot(t.x - x, t.y - y) > 64)) break;
    }
    const t = btn('mini-target', '🧍', (e) => {
      e.stopPropagation();
      if (t.dataset.hit) return;
      t.dataset.hit = '1';
      g.score = Math.min(g.max, g.score + 1);
      setText(g.ui.score, '⏰ ' + g.score + ' served');
      t.classList.add('hit');
      audio.sfx.plink(g.score % 12);
      ctx.buzz(6);
      setTimeout(() => t.remove(), 220);
    }, 'Customer');
    t.style.cssText = `--hue:${Math.floor(Math.random() * 360)};translate:${x | 0}px ${y | 0}px`;
    layer.appendChild(t);
    g.targets.push({ node: t, born: performance.now(), life: 1300 + Math.random() * 500, x, y });
  }

  function startLucky(ev) {
    game.act('miniStart', { eventId: ev.id });
    const c0 = center(ev, ev.lineId);
    cur = { kind: 'lucky', ev, need: ev.game.hits, t0: performance.now(), hits: 0, dur: 6500, prevPin: ctx.rig().pinned, x0: c0.x, y0: c0.y, dir: c0.x > geo.viewW / 2 ? -1 : 1 };
    layer.hidden = false;
    hero.classList.add('mini-on', 'mini-soft');
    const parcel = btn('parcel', '📦', (e) => {
      e.stopPropagation();
      cur.hits++;
      parcel.classList.remove('boing');
      requestAnimationFrame(() => parcel.classList.add('boing'));
      audio.sfx.pop();
      ctx.buzz(8);
      setText(pips, 'Tap it ' + cur.need + '× ' + '●'.repeat(cur.hits) + '○'.repeat(Math.max(0, cur.need - cur.hits)));
      if (cur.hits >= cur.need) finish(cur.hits);
    }, 'Runaway parcel');
    const pips = el('div', 'parcel-pips', 'Tap it ' + cur.need + '× ' + '○'.repeat(cur.need));
    layer.append(parcel, pips);
    cur.ui = { parcel, pips };
    audio.sfx.whoosh();
  }

  return {
    start(kind, ev) {
      if (cur) return;
      kind === 'rush' ? startRush(ev) : startLucky(ev);
    },
    frame(now) {
      if (!cur) return;
      const g = cur;
      const t = (now - g.t0) / 1000;
      if (g.kind === 'rush') {
        const left = Math.max(0, 1 - t / g.sec);
        const lp = left.toFixed(2);
        if (lp !== g.ui.lastP) { g.ui.lastP = lp; g.ui.fill.style.setProperty('--p', lp); }
        if (left <= 0) return finish(g.score);
        let alive = 0;
        for (const x of g.targets) {
          if (!x.node.isConnected) continue;
          if (now - x.born > x.life && !x.node.dataset.hit) { x.node.dataset.hit = 'x'; x.node.classList.add('gone'); setTimeout(() => x.node.remove(), 200); continue; }
          alive++;
        }
        if (now >= g.spawnAt && alive < 4) { spawnTarget(); g.spawnAt = now + 380 + Math.random() * 260; }
        if (g.targets.length > 12) g.targets = g.targets.filter((x) => x.node.isConnected);
      } else {
        const u = t * 1000 / g.dur;
        if (u >= 1) return finish(g.hits);
        const W = geo.viewW, H = geo.heroH;
        const span = g.dir > 0 ? W + 40 - g.x0 : g.x0 + 40;
        const x = g.x0 + g.dir * Math.pow(u, 0.85) * span;
        const y = Math.min(H - 30, g.y0) - Math.abs(Math.sin(u * Math.PI * 4.5)) * H * 0.22;
        g.ui.parcel.style.transform = `translate(${x | 0}px, ${y | 0}px) rotate(${(u * 720) | 0}deg)`;
      }
    },
    get active() { return cur ? cur.kind : null; },
    debugFinish(score) { finish(score); },
  };
}

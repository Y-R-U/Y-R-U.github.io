import { el, btn, setText, show } from './dom.js?v=20261004d';
import { fmtCash, fmtRate } from '../state/format.js?v=20261004d';

const HOLD_DELAY = 380, HOLD_START = 170, HOLD_MIN = 45;
export const STAGE_LABEL = { survey: '📐 Survey', frame: '🪵 Frame', walls: '🧱 Walls', front: '🏚️ False front', sign: '🪧 Sign' };
export const ACQ_LABEL = { poker: '🃏 Poker game', takeover: '⚰️ Takeover', bought: '✍️ Signing', rebrand: '🪧 Rebrand' };

function holdable(b, fire) {
  let timer = 0, gap = HOLD_START;
  const stop = () => { clearTimeout(timer); timer = 0; };
  const loop = () => {
    if (!fire(true)) return stop();
    gap = Math.max(HOLD_MIN, gap * 0.82);
    timer = setTimeout(loop, gap);
  };
  b.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.stopPropagation();
    gap = HOLD_START;
    fire(false);
    stop();
    timer = setTimeout(loop, HOLD_DELAY);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail === 0) fire(false); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

const setVar = (node, cache, key, v) => { if (cache[key] !== v) { cache[key] = v; node.style.setProperty('--p', v); } };

export function createLineCard(line, h) {
  const card = el('article', 'line-card');
  card.dataset.line = line.id;
  card.dataset.district = line.district;
  card.hidden = true;
  const view = el('div', 'line-view');
  view.dataset.emoji = line.emoji;
  view.addEventListener('click', (e) => h.onViewTap(line.id, e));

  const badge = el('div', 'badge');
  const bText = el('span', 'b-text');
  const bHarvest = el('span', 'b-harvest', '×1.5');
  bHarvest.hidden = true;
  badge.append(el('span', 'b-emoji', line.emoji), bText, bHarvest);

  const info = btn('corner info', 'ⓘ', (e) => { e.stopPropagation(); h.onInfo(line.id); }, 'About ' + line.name);
  const pin = btn('corner pin', '📌', (e) => { e.stopPropagation(); h.onPin(line.id); }, 'Pin main view');
  pin.hidden = true;

  const glyphs = el('div', 'glyphs');
  const mk = (act, glyph, label) => {
    const b = el('button', 'glyph');
    b.type = 'button';
    b.dataset.act = act;
    b.setAttribute('aria-label', label);
    const g = el('span', 'g', glyph), c = el('small', 'c', '');
    b.append(g, c);
    b.hidden = true;
    glyphs.appendChild(b);
    return { b, g, c };
  };
  const gLevel = mk('level', '⬆', 'Level up');
  const gQty = el('i', 'q');
  gQty.hidden = true;
  gLevel.b.appendChild(gQty);
  const gThr = mk('throughput', '+' + line.throughput[0].glyph, 'More staff');
  const gBoost = mk('boost', '+' + line.boosts[0].glyph, 'Boost');
  const gMgr = mk('hire', '🕴', 'Hire manager');
  const gHurry = mk('hurry', '🔨', 'Tap to hurry the build');
  setText(gHurry.c, 'hurry');
  holdable(gLevel.b, (held) => h.onAct('level', line.id, gLevel.b, held));
  for (const g of [gThr, gBoost, gMgr]) g.b.addEventListener('click', (e) => { e.stopPropagation(); h.onAct(g.b.dataset.act, line.id, g.b); });
  gHurry.b.addEventListener('click', (e) => { e.stopPropagation(); h.onHurry(line.id, e, gHurry.b); });

  const ghost = el('div', 'ghost-cta');
  const ghostName = el('div', 'ghost-name', line.name);
  const ghostCost = el('div', 'ghost-cost');
  const ghostBar = el('div', 'bar ghost-bar');
  const ghostFill = el('i');
  ghostBar.appendChild(ghostFill);
  const ghostSave = el('div', 'ghost-save');
  ghostSave.hidden = true;
  ghost.append(el('div', 'ghost-e', line.emoji), el('div', 'ghost-sale', 'For sale'), ghostName, ghostCost, ghostBar, ghostSave);

  const strip = el('div', 'strip');
  const sName = el('span', 'strip-name', line.emoji + ' ' + line.name);
  const sVal = el('span', 'strip-val');
  strip.append(sName, sVal);

  const prog = el('i', 'prog');
  card.append(view, prog, badge, info, pin, glyphs, ghost, strip);
  card.addEventListener('click', (e) => {
    if (card.classList.contains('ghost')) { e.stopPropagation(); h.onAct('unlock', line.id, card); }
    else if (card.classList.contains('compact')) { e.stopPropagation(); h.onExpand(line.id); }
  });

  let mode = 'hidden', wantUntil = 0, mileUntil = 0, fast = false, lastP = -1, name = line.name;
  const vars = {};

  const api = {
    card, view, line, glyphs: { level: gLevel, throughput: gThr, boost: gBoost, hire: gMgr, hurry: gHurry },
    at: 0, fps: 0,
    get mode() { return mode; },
    saveHint(text) { show(ghostSave, !!text); if (text) setText(ghostSave, text); },
    setMode(m) {
      if (m === mode) return;
      const was = mode;
      mode = m;
      card.hidden = m === 'hidden';
      card.classList.toggle('ghost', m === 'ghost');
      if (m !== 'ghost') card.classList.remove('can');
      card.classList.toggle('compact', m === 'compact');
      card.classList.toggle('building', m === 'build');
      card.tabIndex = m === 'ghost' || m === 'compact' ? 0 : -1;
      if (was === 'build' || m === 'build') { lastP = -1; prog.style.setProperty('--p', 0); }
    },
    rename(text) {
      if (text === name) return;
      name = text;
      setText(ghostName, text);
      setText(sName, line.emoji + ' ' + text);
      info.setAttribute('aria-label', 'About ' + text);
    },
    want(ms = 4000) { wantUntil = performance.now() + ms; },
    get wanted() { return performance.now() < wantUntil; },
    milestone() {
      mileUntil = performance.now() + 1600;
      card.classList.remove('mile');
      requestAnimationFrame(() => card.classList.add('mile'));
      clearTimeout(api.mileT);
      api.mileT = setTimeout(() => card.classList.remove('mile'), 1700);
    },
    // Per frame: one CSS var on a leaf, quantised so unchanged frames write nothing.
    progress(cyc) {
      if (fast || mode === 'build') return;
      const p = Math.round((cyc % 1) * 200) / 200;
      if (p !== lastP) { lastP = p; prog.style.setProperty('--p', p); }
    },
    buildProgress(p01) {
      const p = Math.round(p01 * 400) / 400;
      if (p !== lastP) { lastP = p; prog.style.setProperty('--p', p); }
    },
    update(model, ctx) {
      const s = model.stats(line.id);
      if (mode === 'ghost') {
        const qu = model.q('unlock', { lineId: line.id });
        const open = s.districtOpen;
        setText(ghostCost, (open ? '' : '🔒 ') + fmtCash(qu.cost));
        setVar(ghostFill, vars, 'g', Math.min(1, (model.cash() + model.hatCoins()) / Math.max(1, qu.cost)).toFixed(3));
        card.classList.toggle('can', open && qu.affordable);
        return;
      }
      if (mode === 'build') {
        const b = s.building;
        if (!b) return;
        const label = b.acq === 'built' ? STAGE_LABEL[b.stageName] || '🔨 Building' : ACQ_LABEL[b.acq] || '🔨';
        setText(bText, `${label} · ${Math.ceil(b.left)}s`);
        show(bHarvest, false);
        show(pin, false);
        for (const g of [gLevel, gThr, gBoost, gMgr]) show(g.b, false);
        show(gHurry.b, true);
        api.wantsAttention = true;
        return;
      }
      show(gHurry.b, false);
      if (!s.owned) return;
      const nowFast = s.cycleSec < 0.6;
      if (nowFast !== fast) { fast = nowFast; card.classList.toggle('fast', fast); }
      card.classList.toggle('full', s.full);
      const ratio = s.stockRatio;
      const pile = s.full ? '💰 FULL' : '💰 ' + Math.round(ratio * 100) + '%';
      const right = s.managed ? fmtRate(s.perSec) : fmtRate(s.perSec) + ' · ' + pile;
      setText(bText, `Lv ${s.level} · ${right}`);
      setText(sVal, `Lv ${s.level} · ${right}`);
      show(bHarvest, s.harvest && s.stock > 0);
      show(pin, ctx.pinOK);
      card.classList.toggle('pinned', ctx.pinned === line.id);

      const ql = model.q('level', { lineId: line.id, qty: ctx.qty });
      show(gLevel.b, true);
      setText(gLevel.c, fmtCash(ql.cost));
      show(gQty, ql.qty > 1);
      if (ql.qty > 1) setText(gQty, '×' + (ql.qty >= 1000 ? Math.floor(ql.qty / 1000) + 'K' : ql.qty));
      gLevel.b.classList.toggle('can', ql.affordable);
      const nearMile = !!s.nextMilestone && s.nextMilestone - s.level <= Math.max(2, ql.qty) && ql.affordable;
      card.classList.toggle('near-mile', nearMile);

      const cands = [];
      if (s.nextThroughput) { const q = model.q('throughput', { lineId: line.id }); if (ctx.revealGlyph('thr', q)) cands.push([gThr, q]); }
      if (s.nextBoost) { const q = model.q('boost', { lineId: line.id }); if (ctx.revealGlyph('boost', q)) cands.push([gBoost, q]); }
      if (!s.managed) { const q = model.q('hire', { lineId: line.id }); if (ctx.revealGlyph('mgr', q)) cands.push([gMgr, q]); }
      cands.sort((x, y) => (y[1].affordable - x[1].affordable) || (x[1].cost - y[1].cost));
      const keep = cands.slice(0, 2);
      let anyCan = ql.affordable && nearMile;
      for (const [g, q] of keep) {
        if (g !== gMgr) setText(g.g, '+' + q.glyph);
        setText(g.c, fmtCash(q.cost));
        g.b.classList.toggle('can', q.affordable);
        g.b.setAttribute('aria-label', g === gMgr ? 'Hire manager' : q.name);
      }
      for (const [, q] of cands) if (q.affordable) anyCan = true;
      for (const g of [gThr, gBoost, gMgr]) show(g.b, keep.some((k) => k[0] === g));
      api.wantsAttention = ratio >= 0.8 || anyCan || ctx.eventOn || performance.now() < mileUntil || nearMile;
    },
    wantsAttention: false,
  };
  return api;
}

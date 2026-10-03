import { el, btn, bar, setText, show } from './dom.js?v=20261004b';
import { fmtNum, fmtTime, fmtRate } from '../state/format.js?v=20261004b';
import { section } from './kit.js?v=20261004b';

const CRATE = { basic: '📦', silver: '🎁', gold: '🏆' };

function rankReward(model, r) {
  const w = r.reward || {};
  if (w.keepsake) { const k = model.D().keepsakes?.[w.keepsake]; return { emoji: k?.emoji || '🎀', name: k?.name || w.keepsake, keepsake: w.keepsake }; }
  if (w.manager) { const m = (model.D().managers || []).find((x) => x.id === w.manager); return { emoji: m?.emoji || '🕴', name: m?.name || 'Manager' }; }
  if (w.crate) return { emoji: CRATE[w.crate] || '🎁', name: w.crate + ' crate' };
  if (w.tickets) return { emoji: '🎟️', name: w.tickets + ' tickets' };
  return { emoji: '✨', name: 'Reward' };
}

export function fillSeason(body, ctx) {
  const { model, game } = ctx;
  const ss = model.season();
  if (!ss) { body.appendChild(el('p', 'lede', '🎃 Back next October')); return null; }
  const def = ss.def;
  let sig = '';

  const head = el('div', 'ssn-head');
  const moon = el('div', 'ssn-moon', '🌕');
  const info = el('div', 'ssn-info');
  const rankT = el('b', '');
  const meta = el('small', '');
  const xp = bar(0, 'gold');
  info.append(rankT, xp, meta);
  head.append(moon, info);
  body.appendChild(head);

  const go = btn('cta spooky', '', () => {
    const inside = model.season()?.active;
    const r = inside ? game.act('seasonLeave', {}) : game.act('seasonEnter', { seasonId: def.id });
    if (r.ok) { ctx.audio.sfx.sting(); ctx.sheets.close(); model.seasonDirty(); ctx.textNow(); if (!inside) scrollTo({ top: 0 }); }
    else ctx.toast(r.msg || '🎃 Not yet');
  });
  body.appendChild(go);

  const linesSec = section(body, 'Spooky stalls');
  const lr = el('div', 'ssn-lines');
  for (const l of def.lines || []) {
    const c = el('div', 'ssn-line');
    c.append(el('span', '', l.emoji), el('small', '', l.name));
    lr.appendChild(c);
  }
  linesSec.appendChild(lr);

  const trackSec = section(body, 'Ranks');
  const track = el('div', 'track');
  trackSec.appendChild(track);

  const keepSec = section(body, 'Keepsakes · forever');
  const keeps = el('div', 'keeps');
  keepSec.appendChild(keeps);
  const assign = el('div', 'assign');
  assign.hidden = true;
  keepSec.appendChild(assign);

  function openAssign(k) {
    assign.hidden = false;
    assign.replaceChildren(el('small', 'muted', `${k.emoji} ${k.name} →`));
    const row = el('div', 'assign-row');
    const pick = (target, label) => row.appendChild(btn('pill' + (sameTarget(k.target, target) ? ' gold' : ''), label, () => {
      const r = game.act('assignKeepsake', { keepsakeId: k.id, target });
      if (r?.ok) { ctx.audio.sfx.pop(); ctx.toast(`${k.emoji} ${k.name} → ${label}`); assign.hidden = true; sig = ''; paint(); ctx.textNow(); }
      else ctx.toast(r?.msg || '🙅 Not yet');
    }));
    pick({ kind: 'character' }, '🧑 You');
    for (const l of model.owned()) pick({ kind: 'line', id: l.id }, l.emoji);
    for (const m of model.managers().filter((x) => x.owned)) pick({ kind: 'manager', id: m.def.id }, '🕴' + m.def.emoji);
    assign.appendChild(row);
  }
  const sameTarget = (a, b) => !!a && a.kind === b.kind && (a.kind === 'character' || a.id === b.id);
  const targetEmoji = (t) => (!t ? '' : t.kind === 'character' ? '🧑' : t.kind === 'line' ? model.line(t.id)?.emoji || '🏪' : '🕴');

  function paint() {
    const s = model.season();
    if (!s) return;
    const ks = model.keepsakes();
    const key = [s.rank, Math.floor(s.xp), Math.floor(s.candy), s.active, s.witching, ks.map((k) => k.id + JSON.stringify(k.target)).join()].join('|');
    if (key === sig) return;
    sig = key;
    const ranks = s.ranks;
    const prevXp = s.rank > 0 ? ranks[s.rank - 1]?.xp || 0 : 0;
    rankT.textContent = `Rank ${s.rank}/${ranks.length} · ${def.token || '🍬'} ${fmtNum(s.candy)}`;
    xp.firstChild.style.setProperty('--p', Math.min(1, (s.xp - prevXp) / Math.max(1, s.xpNext - prevXp)).toFixed(3));
    meta.textContent = `⏳ ${fmtTime(s.endsIn)}` + (s.rate ? ` · ${def.token || '🍬'} ${fmtNum(s.rate)}/s` : '') + (s.witching ? ' · 🌙 ×2' : '');
    go.textContent = s.active ? '🏘️ Back to town' : '🎃 Enter Hollow’s Eve';
    track.replaceChildren();
    ranks.forEach((r, i) => {
      const rw = rankReward(model, r);
      const got = i < s.rank;
      const c = btn('rank' + (got ? ' got' : '') + (i === s.rank ? ' next' : ''), '', () => ctx.toast(`${rw.emoji} ${rw.name}`), rw.name);
      c.append(el('small', 'rank-n', String(i + 1)), el('span', 'rank-e', rw.emoji));
      track.appendChild(c);
    });
    const nextEl = track.children[Math.min(s.rank, ranks.length - 1)];
    if (nextEl) requestAnimationFrame(() => { track.scrollLeft = Math.max(0, nextEl.offsetLeft - 70); });
    keeps.replaceChildren();
    for (const k of ks) {
      const b = btn('keep', '', () => openAssign(k), k.name);
      b.append(el('span', 'keep-e', k.emoji), el('small', '', k.name), el('i', 'rank-tag', targetEmoji(k.target)));
      keeps.appendChild(b);
    }
    keepSec.hidden = !ks.length;
  }
  paint();
  return paint;
}

export function createSeasonCards(list, ctx) {
  const { model, game, host } = ctx;
  const cards = [];
  let on = false;
  const ss0 = model.season();
  const lines = ss0?.def?.lines || [];
  const head = el('div', 'ssn-banner');
  head.hidden = true;
  const hT = el('b', '');
  head.append(el('span', '', '🎃'), hT, btn('pill', '🏘️', () => { game.act('seasonLeave', {}); model.seasonDirty(); ctx.textNow(); }, 'Back to town'));
  const box = el('div', 'ssn-box');
  list.prepend(head, box);

  for (const l of lines) {
    const card = el('article', 'line-card season-card');
    card.dataset.district = 'season';
    card.hidden = true;
    const view = el('div', 'line-view');
    view.dataset.emoji = l.emoji;
    const badge = el('div', 'badge');
    const bT = el('span', 'b-text');
    badge.append(el('span', 'b-emoji', l.emoji), bT);
    const glyphs = el('div', 'glyphs');
    const mk = (act, g, label) => {
      const b = el('button', 'glyph');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      const gg = el('span', 'g', g), c = el('small', 'c', '');
      b.append(gg, c);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = game.act(act, act === 'seasonLevel' ? { lineId: l.id, qty: ctx.qty } : { lineId: l.id });
        if (r?.ok) { ctx.audio.sfx.pop(); ctx.juice.ring(b); ctx.textNow(); }
        else { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); ctx.audio.sfx.nope(); }
      });
      glyphs.appendChild(b);
      return { b, gg, c };
    };
    const gLv = mk('seasonLevel', '⬆', 'Level up');
    const gBo = mk('seasonBoost', '+🦇', 'Boost');
    const unlock = el('div', 'ghost-cta');
    const uName = el('div', 'ghost-name', l.emoji + ' ' + l.name);
    const uCost = el('div', 'ghost-cost');
    unlock.append(uName, uCost);
    const prog = el('i', 'prog');
    card.append(view, prog, badge, glyphs, unlock);
    card.addEventListener('click', () => {
      if (!card.classList.contains('ghost')) return;
      const r = game.act('seasonUnlock', { lineId: l.id });
      if (r?.ok) { ctx.audio.sfx.kaching(); ctx.celebrate(l.emoji); ctx.textNow(); } else ctx.audio.sfx.nope();
    });
    box.appendChild(card);
    cards.push({ l, card, view, bT, gLv, gBo, uCost, prog });
  }

  return {
    get on() { return on; },
    update() {
      const s = model.season();
      const inside = !!s?.active;
      if (inside !== on) {
        on = inside;
        head.hidden = !on;
        for (const c of cards) {
          c.card.hidden = !on;
          if (on) host.addView('season:' + c.l.id, c.view, { kind: 'line', lineId: c.l.basePlot });
          else host.removeView('season:' + c.l.id);
        }
      }
      if (!on) return;
      setText(hT, `Hollow’s Eve · ${s.def.token || '🍬'} ${fmtNum(s.candy)}`);
      for (const c of cards) {
        const st = game.seasonStats(c.l.id);
        c.card.classList.toggle('ghost', !st.owned);
        if (!st.owned) {
          const qu = model.q('seasonUnlock', { lineId: c.l.id });
          setText(c.uCost, `${s.def.token || '🍬'} ${fmtNum(qu.cost)}`);
          c.card.classList.toggle('can', !!qu.affordable);
          continue;
        }
        setText(c.bT, `Lv ${st.level} · ${s.def.token || '🍬'} ${fmtNum(st.perSec)}/s`);
        const ql = model.q('seasonLevel', { lineId: c.l.id, qty: ctx.qty });
        setText(c.gLv.c, `${ql.qty > 1 ? '×' + ql.qty + ' ' : ''}${fmtNum(ql.cost)}`);
        c.gLv.b.classList.toggle('can', !!ql.affordable);
        const qb = model.q('seasonBoost', { lineId: c.l.id });
        show(c.gBo.b, isFinite(qb.cost));
        if (isFinite(qb.cost)) { setText(c.gBo.gg, '+' + (qb.glyph || '✨')); setText(c.gBo.c, fmtNum(qb.cost)); c.gBo.b.classList.toggle('can', !!qb.affordable); }
        c.prog.style.setProperty('--p', (st.cycle01 % 1).toFixed(2));
      }
    },
  };
}

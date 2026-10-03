import { el, btn, bar } from './dom.js?v=20261004e';
import { fmtNum } from '../state/format.js?v=20261004e';
import { section } from './kit.js?v=20261004e';
import { BOX_INFO } from './boxes.js?v=20261004e';

// Ghost Town (W12): a main-street overlay. The sheet shows ectoplasm, the 8 ranks and the keepsake hats (who wears
// what). Hidden entirely outside the season window (the tab is only revealed while seasonInfo().live).
function rankReward(model, r) {
  if (r.keepsake) { const k = model.data.keepsakes?.[r.keepsake]; return { emoji: k?.emoji || '🎩', name: k?.name || r.keepsake }; }
  if (r.manager) { const m = model.mgrById[r.manager]; return { emoji: m?.emoji || '👻', name: m?.name || 'Manager' }; }
  if (r.box) return { emoji: BOX_INFO[r.box]?.e || '📦', name: BOX_INFO[r.box]?.n || 'Strongbox' };
  if (r.teeth) return { emoji: '🦷', name: r.teeth + ' gold teeth' };
  return { emoji: '✨', name: 'Reward' };
}

export function fillSeason(body, ctx) {
  const { model, game } = ctx;
  const ss = model.season();
  if (!ss) { body.appendChild(el('p', 'lede', '👻 The ghosts are resting. Back next October.')); return null; }
  const def = ss.def;
  let sig = '';
  const head = el('div', 'ssn-head');
  const moon = el('div', 'ssn-moon', '🌕');
  const info = el('div', 'ssn-info');
  const rankT = el('b', '');
  const xp = bar(0, 'ecto');
  const meta = el('small', '', 'Tap the ghosts drifting down Main Street. Each pays 👻 1.');
  info.append(rankT, xp, meta);
  head.append(moon, info);
  body.appendChild(head);
  const trackSec = section(body, 'Ranks');
  const track = el('div', 'track');
  trackSec.appendChild(track);
  const keepSec = section(body, 'Keepsake hats · forever');
  const keeps = el('div', 'keeps');
  keepSec.appendChild(keeps);
  const assign = el('div', 'assign');
  assign.hidden = true;
  keepSec.appendChild(assign);

  const sameTarget = (a, b) => !!a && a.kind === b.kind && (a.kind === 'character' || a.id === b.id);
  const targetEmoji = (t) => (!t ? '' : t.kind === 'character' ? '🤠' : t.kind === 'line' ? model.line(t.id)?.emoji || '🏪' : model.mgrById[t.id]?.emoji || '🕴');

  function openAssign(k) {
    assign.hidden = false;
    assign.replaceChildren(el('small', 'muted', `${k.emoji} ${k.name} → who wears it?`));
    const row = el('div', 'assign-row');
    const pick = (target, label) => row.appendChild(btn('pill' + (sameTarget(k.target, target) ? ' gold' : ''), label, () => {
      const r = game.act('assignKeepsake', { keepsakeId: k.id, target });
      if (r?.ok) { ctx.audio.sfx.pop(); ctx.toast(`${k.emoji} ${k.name} → ${label}`); assign.hidden = true; sig = ''; paint(); ctx.textNow(); }
      else ctx.toast(r?.msg || '🙅 Not yet');
    }));
    pick({ kind: 'character' }, '🤠 You');
    for (const l of model.owned()) pick({ kind: 'line', id: l.id }, l.emoji);
    for (const m of model.managers().filter((x) => x.owned)) pick({ kind: 'manager', id: m.def.id }, m.def.emoji);
    assign.appendChild(row);
  }

  function paint() {
    const s = model.season();
    if (!s) return;
    const ks = model.keepsakes();
    const key = [s.rank, s.xp, s.ecto, ks.map((k) => k.id + JSON.stringify(k.target)).join()].join('|');
    if (key === sig) return;
    sig = key;
    const ranks = def.ranks;
    const prevXp = s.rank > 0 ? ranks[s.rank - 1]?.xp || 0 : 0;
    rankT.textContent = `Rank ${s.rank}/${ranks.length} · 👻 ${fmtNum(s.ecto)}`;
    xp.firstChild.style.setProperty('--p', s.xpNext ? Math.min(1, (s.xp - prevXp) / Math.max(1, s.xpNext - prevXp)).toFixed(3) : '1');
    track.replaceChildren();
    ranks.forEach((r, i) => {
      const rw = rankReward(model, r);
      const c = btn('rank' + (i < s.rank ? ' got' : '') + (i === s.rank ? ' next' : ''), '', () => ctx.toast(`${rw.emoji} ${rw.name} · 👻 ${r.xp}`), rw.name);
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

// A DOM ghost for the hero until Spectacle draws its own (caps.ghost): drifts across, tap for ectoplasm.
export function createGhosts(hero, ctx, { canShow, spectacle }) {
  const { game } = ctx;
  let node = null, g = null;
  game.on('ghost:spawn', ({ ghost }) => {
    if (spectacle.has('ghost')) return;
    g = { ...ghost, t0: performance.now(), life: Math.max(3, (ghost.until - ghost.born) * 1000), dir: Math.random() < 0.5 ? -1 : 1, y: 0.25 + Math.random() * 0.35 };
    node?.remove();
    node = btn('ghost-actor', '👻', (e) => { e.stopPropagation(); tap(); }, 'Ghost');
    hero.appendChild(node);
  });
  game.on('ghost:gone', () => { node?.classList.add('gone'); const n = node; setTimeout(() => n?.remove(), 400); node = null; g = null; });
  function tap(id) {
    const r = game.act('ghost:tap', { id: id || g?.id });
    if (!r.ok) return false;
    const n = node;
    if (n) { n.classList.add('caught'); setTimeout(() => n.remove(), 400); }
    node = null; g = null;
    ctx.juice.float(hero, ctx.geo.viewW / 2, ctx.geo.heroH * 0.35, 0, { label: '👻 +' + (r.ecto || 1), cls: 'ecto' });
    ctx.audio.sfx.slide();
    ctx.buzz(10);
    return true;
  }
  return {
    tap,
    frame(now) {
      if (!node || !g) return;
      node.hidden = !canShow();
      const u = Math.min(1, (now - g.t0) / g.life);
      const W = ctx.geo.viewW, H = ctx.geo.heroH;
      const x = g.dir > 0 ? -40 + (W + 80) * u : W + 40 - (W + 80) * u;
      const y = H * g.y + Math.sin(u * 12) * 14;
      node.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
    },
  };
}

import { el, btn, setText } from './dom.js?v=20261004b';
import { fmtCash, fmtRate, fmtNum, fmtTime, fmtMult } from '../state/format.js?v=20261004b';
import { section, stat, buyRow, toggle } from './kit.js?v=20261004b';

export function fillLineInfo(body, ctx, lineId) {
  const { model, game } = ctx;
  const line = model.line(lineId);
  const ups = [];
  const s0 = model.stats(lineId);
  if (!s0?.owned) {
    const s = section(body);
    s.appendChild(el('p', 'lede', `${line.emoji} ${fmtCash(model.q('unlock', { lineId }).cost)}`));
    return null;
  }

  const grid = el('div', 'stats');
  body.appendChild(grid);
  const sv = {
    lv: stat(grid, '⬆', '', 'level'),
    inc: stat(grid, '💵', '', 'per sec'),
    sig: stat(grid, '🧍', '', 'sold live'),
    shelf: stat(grid, '📦', '', 'shelf'),
    cyc: stat(grid, '⏱', '', 'cycle'),
    mult: stat(grid, '✨', '', 'boost'),
  };
  const walk = el('small', 'walk-note');
  body.appendChild(walk);
  const mile = el('div', 'mile-row');
  const mileBar = el('div', 'bar gold');
  mileBar.appendChild(el('i'));
  const mileT = el('small', 'mile-t');
  mile.append(mileBar, mileT);
  body.appendChild(mile);

  const up = section(body, 'Upgrades');
  ups.push(buyRow(up, ctx, {
    icon: '⬆', label: () => (ctx.qty === 'max' ? 'Level MAX' : 'Level ×' + ctx.qty),
    sub: () => `Lv ${model.stats(lineId).level}`,
    quote: () => model.q('level', { lineId, qty: ctx.qty }),
    run: () => game.act('level', { lineId, qty: ctx.qty }),
  }));
  ups.push(buyRow(up, ctx, {
    icon: () => model.q('throughput', { lineId }).glyph || '🧍',
    label: () => model.q('throughput', { lineId }).name || 'Fully staffed',
    sub: () => { const q = model.q('throughput', { lineId }); const pre = model.stats(lineId).managed ? 'Sells' : '🕴 sells'; return q.sigma ? `${pre} ${Math.round(q.sigma * 100)}% live · ×1.1 price` : `Sells ${Math.round(model.stats(lineId).sigma * 100)}% live`; },
    quote: () => model.q('throughput', { lineId }),
    run: () => game.act('throughput', { lineId }),
    done: () => !isFinite(model.q('throughput', { lineId }).cost),
  }));
  ups.push(buyRow(up, ctx, {
    icon: () => model.q('boost', { lineId }).glyph || '✨',
    label: () => model.q('boost', { lineId }).name || 'All boosts',
    sub: () => { const q = model.q('boost', { lineId }); const have = line.boosts.slice(0, model.stats(lineId).boosts || 0).map((b) => b.glyph).join(''); return (q.mult ? `Profit ×${q.mult}` : 'Maxed') + (have ? ' · ' + have : ''); },
    quote: () => model.q('boost', { lineId }),
    run: () => game.act('boost', { lineId }),
    done: () => !isFinite(model.q('boost', { lineId }).cost),
  }));
  ups.push(buyRow(up, ctx, {
    icon: '🗄️', label: 'Bigger shelf',
    sub: () => `Holds ${fmtNum(model.stats(lineId).shelfCap)} · piles wait longer`,
    quote: () => model.q('storage', { lineId }),
    run: () => game.act('storage', { lineId }),
    done: () => !isFinite(model.q('storage', { lineId }).cost),
  }));
  const sup = model.data.supply;
  let supSwitch = null;
  if ((sup.to === lineId || sup.from.includes(lineId)) && model.districtOpen('harbour')) {
    const fromNames = sup.from.map((id) => model.line(id).emoji).join('/');
    ups.push(buyRow(up, ctx, {
      icon: '🔗', label: 'Supply link',
      sub: () => {
        const q = model.q('supplyLink', {});
        if (q.owned) return `${model.line(game.state.supply.from).emoji} → ${model.line(sup.to).emoji} ×${sup.mult} · van running`;
        return q.ready ? `${fromNames} → ${model.line(sup.to).emoji} ×${sup.mult}` : `Open ${model.line(sup.to).emoji} and ${fromNames} first`;
      },
      quote: () => model.q('supplyLink', {}),
      run: () => game.act('supplyLink', { from: sup.from.includes(lineId) ? lineId : undefined }),
      done: () => !!model.q('supplyLink', {}).owned,
    }));
    if (sup.from.includes(lineId)) {
      supSwitch = btn('wide-btn', `🔗 Feed ${model.line(sup.to).emoji} from ${line.emoji}`, () => {
        const r = game.act('supplyLink', { from: lineId });
        if (r.ok) { ctx.audio.sfx.pop(); ctx.toast(`🔗 Supply link: ${line.emoji} → ${model.line(sup.to).emoji}`); ctx.textNow(); }
      });
      up.appendChild(supSwitch);
    }
  }

  const mg = section(body, 'Manager');
  const mRow = el('div', 'mgr-row');
  mg.appendChild(mRow);
  let mgrState = null;
  const paintMgr = () => {
    const m = model.manager(lineId);
    const key = m.hired + ':' + m.level;
    if (key === mgrState) return;
    mgrState = key;
    mRow.replaceChildren();
    if (m.hired) {
      const b = btn('mgr-open', '', () => ctx.openManager(m.def.id, true));
      b.append(el('span', 'mgr-face', m.def.emoji || '🕴'), el('b', '', m.def.name), el('small', '', 'Lv ' + Math.max(1, m.level) + ' ›'));
      mRow.appendChild(b);
    } else {
      buyRow(mRow, ctx, {
        icon: '🕴', label: m.def.name, sub: 'Sells far more than walk-ins',
        quote: () => model.q('hire', { lineId }), run: () => game.act('hire', { lineId }),
        after: () => { mgrState = null; },
      });
    }
  };
  paintMgr();

  let nightUp = null;
  if (model.districtOpen('downtown')) {
    const ns = section(body, 'Night shift');
    nightUp = toggle(ns, {
      icon: '🌙', label: '×2 from 6pm to 6am',
      get: () => (game.state.nightShift || []).includes(lineId),
      set: (on) => {
        const r = game.act('nightShift', { lineId, on });
        if (!r.ok) ctx.toast(r.code === 'full' ? '🌙 Two lines at most' : '🌙 ' + (r.msg || 'Not yet'));
        ctx.textNow();
      },
    });
  }

  const pin = btn('wide-btn', '', () => {
    const rg = ctx.rig();
    rg.pinned === lineId ? rg.unpin() : rg.pin(lineId);
    ctx.textNow();
  });
  body.appendChild(pin);

  const update = () => {
    const s = model.stats(lineId);
    sv.lv(fmtNum(s.level));
    sv.inc(fmtRate(s.perSec));
    walk.hidden = s.managed;
    if (!s.managed) setText(walk, `🚶 Walk-ins buy ${Math.round(s.sigma * 100)}% · the rest piles up · tap to sell`);
    sv.sig(Math.round(s.sigma * 100) + '%');
    sv.shelf(fmtNum(s.stock) + '/' + fmtNum(s.shelfCap));
    sv.cyc(s.cycleSec < 1 ? s.cycleSec.toFixed(2) + 's' : fmtTime(s.cycleSec));
    sv.mult(fmtMult(s.boostMult || 1));
    const nm = s.nextMilestone;
    mile.hidden = !nm;
    if (nm) {
      const ms = model.data.econ.milestones;
      const prev = [...ms].reverse().find((t) => t <= s.level) || 0;
      mileBar.firstChild.style.setProperty('--p', Math.min(1, (s.level - prev) / Math.max(1, nm - prev)).toFixed(3));
      setText(mileT, `Lv ${nm} → ×2 profit`);
    }
    for (const u of ups) u();
    paintMgr();
    nightUp?.();
    if (supSwitch) supSwitch.hidden = !(game.state.supply.on && game.state.supply.from !== lineId && model.stats(lineId).owned);
    setText(pin, ctx.rig()?.pinned === lineId ? '📌 Unpin main view' : '📌 Pin main view');
  };
  update();
  return update;
}

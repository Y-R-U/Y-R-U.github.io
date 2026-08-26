// Mode select. ui.js builds the menu rows from data/modes.js; this screen routes a pick
// to the briefing with a `mode` id, which main.js hands to createWorld and sim/modes.js.

import { el, btn, topbar, toast, secs } from '../widgets.js';
import { iconCanvas, GOLD } from '../icons.js';
import * as M from '../model.js';

// Survival and Boss Rush build their own arena in sim/modes.js and ignore the level they
// are handed; they still need a real level id so the brief and debrief have something to
// look up. Time Attack is the only mode where the choice of level is the point.
const SYNTHETIC = { survival: 1, bossrush: 1 };

export function mount(root, ctx) {
  const { data, save } = ctx;
  const MODES = data.MODES || [];
  const RAW = data.modesRaw || {};

  root.appendChild(topbar(ctx, 'MODES', { back: () => ctx.go('title'), screen: 'modeselect' }));

  const body = el('div.mode-body');
  root.appendChild(body);
  showRail();

  function showRail() {
    body.textContent = '';
    const rail = el('div.mode-rail');
    for (const m of MODES) {
      const locked = m.needStars ? M.totalStars(save, data.LEVELS) < m.needStars : false;
      const card = el('div.mode-card' + (m.event ? '.event' : '') + (locked ? '.locked' : '') +
        (ctx.args.focus === m.id ? '.focus' : ''), {},
        el('div.mode-ico', {}, iconCanvas(m.icon || 'bomb', 34, locked ? 'rgba(190,175,150,0.45)' : GOLD)),
        el('div.mode-name', {}, m.name),
        el('div.mode-blurb', {}, blurb(m)),
        el('div.mode-best', {}, el('span', {}, m.event ? 'ENDS IN' : 'YOUR BEST'), best(m)),
        m.event ? el('div.mode-tag', {}, 'THIS WEEK') : null,
        locked
          ? el('div.mode-lock', {}, `${m.needStars}★ to unlock`)
          : btn('mini' + (m.id === 'story' || m.event ? ' go' : ' ghost'), label(m), () => pick(m))
      );
      if (!locked) card.addEventListener('click', (e) => { if (e.target === card || e.target.parentNode === card) pick(m); });
      rail.appendChild(card);
    }
    if (!MODES.length) rail.appendChild(el('div.empty', {}, 'No modes defined'));
    body.appendChild(rail);
  }

  function label(m) {
    if (m.id === 'story') return 'CAMPAIGN';
    if (m.id === 'timeattack') return 'PICK MISSION';
    return 'FLY';
  }

  /** The event card's blurb says what it actually does to the run, not just its flavour. */
  function blurb(m) {
    if (!m.event || !m.def) return m.blurb || '';
    const d = m.def, bits = [];
    if (d.forcesMode) bits.push(`plays as ${nameOfMode(d.forcesMode)}`);
    if (d.moneyMult) bits.push(`money x${d.moneyMult}`);
    if (d.bonusMoneyMult) bits.push(`payout x${d.bonusMoneyMult}`);
    return (m.blurb || '') + (bits.length ? `  (${bits.join(', ')})` : '');
  }

  function nameOfMode(id) {
    const r = MODES.find((x) => x.id === id);
    return r ? r.name : id;
  }

  function best(m) {
    if (m.id === 'story') {
      const done = (data.LEVELS || []).filter((l) => M.levelDone(save, l.id)).length;
      return `${done}/${(data.LEVELS || []).length} FLOWN`;
    }
    if (m.event) return m.endsIn || 'SUNDAY';
    const rec = ((M.d(save).modes || {})[m.id]) || null;
    if (!rec) return 'NOT FLOWN';
    if (m.id === 'survival' && rec.best != null) return secs(rec.best);
    if (m.id === 'bossrush' && rec.bossesDown != null) return `${rec.bossesDown}/5 BOSSES`;
    return String(rec.best != null ? rec.best : rec.score || '—');
  }

  function pick(m) {
    if (m.id === 'story') { ctx.go('levelselect'); return; }
    if (m.id === 'timeattack') { showTimeAttack(); return; }
    // A mode that builds its own arena must never be blocked by an empty campaign.
    const base = m.event && m.def && m.def.forcesMode ? m.def.forcesMode : m.id;
    const carrier = SYNTHETIC[base]
      ? (M.nextLevel(save, data.LEVELS) || (data.LEVELS || [])[0])
      : (m.levelId ? data.LEVELS.find((l) => l.id === m.levelId) : M.nextLevel(save, data.LEVELS));
    if (!carrier) { toast('No missions in data/levels.js yet', 'bad'); return; }
    ctx.go('brief', { levelId: carrier.id, mode: m.id });
  }

  /**
   * TIME_ATTACK.unlockRule is 'levelCompletedOnce', so the picker IS the unlock rule: it lists
   * only what has been beaten, with the medal thresholds the run will actually be judged against.
   */
  function showTimeAttack() {
    const A = RAW.TIME_ATTACK || { goldTimeFactor: 0.55, silverTimeFactor: 0.8 };
    body.textContent = '';
    body.appendChild(el('div.act-jump', {},
      btn('chipbtn', '‹ MODES', showRail),
      el('div.spacer'),
      el('div.chip', {}, el('span', {}, `GOLD UNDER ${Math.round(A.goldTimeFactor * 100)}% OF PAR`))
    ));

    const done = (data.LEVELS || []).filter((l) => M.levelDone(save, l.id));
    if (!done.length) {
      body.appendChild(el('div.empty', {}, 'Beat a mission in the campaign first — Time Attack replays what you have already flown.'));
      return;
    }

    const scroller = el('div.map-scroll');
    const grid = el('div.lv-grid');
    for (const level of done) {
      const rec = M.levelRecord(save, level.id) || {};
      const par = level.par || 0;
      const tile = el('div.lv.done', { title: `${level.name} — par ${par}s` },
        el('span.lv-n', {}, level.id.split('-').pop()),
        el('span.lv-name', {}, level.name),
        el('span.lv-name', {}, par ? `gold ${secs(par * A.goldTimeFactor)}` : 'no par'),
        el('span.lv-name', {}, rec.best != null && isFinite(rec.best) ? `best ${secs(rec.best)}` : 'no time yet')
      );
      tile.addEventListener('click', () => ctx.go('brief', { levelId: level.id, mode: 'timeattack' }));
      grid.appendChild(tile);
    }
    scroller.appendChild(grid);
    body.appendChild(scroller);
  }
}

export function unmount() {}

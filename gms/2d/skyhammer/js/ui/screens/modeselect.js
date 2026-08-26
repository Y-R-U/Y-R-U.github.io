// Mode select. Reads data/modes.js when DESIGN writes it; falls back to the five known modes.

import { el, btn, topbar, toast } from '../widgets.js';
import { iconCanvas, GOLD } from '../icons.js';
import * as M from '../model.js';

export function mount(root, ctx) {
  const { data, save } = ctx;
  const MODES = data.MODES || [];

  root.appendChild(topbar(ctx, 'MODES', { back: () => ctx.go('title'), screen: 'modeselect' }));

  const rail = el('div.mode-rail');
  for (const m of MODES) {
    const locked = m.needStars ? M.totalStars(save, data.LEVELS) < m.needStars : false;
    const card = el('div.mode-card' + (m.event ? '.event' : '') + (locked ? '.locked' : '') +
      (ctx.args.focus === m.id ? '.focus' : ''), {},
      el('div.mode-ico', {}, iconCanvas(m.icon || 'bomb', 34, locked ? 'rgba(190,175,150,0.45)' : GOLD)),
      el('div.mode-name', {}, m.name),
      el('div.mode-blurb', {}, m.blurb || ''),
      el('div.mode-best', {}, el('span', {}, m.event ? 'ENDS IN' : 'YOUR BEST'), best(m)),
      m.event ? el('div.mode-tag', {}, 'THIS WEEK') : null,
      locked
        ? el('div.mode-lock', {}, `${m.needStars}★ to unlock`)
        : btn('mini' + (m.id === 'story' || m.event ? ' go' : ' ghost'), m.id === 'story' ? 'CAMPAIGN' : 'FLY', () => pick(m))
    );
    if (!locked) card.addEventListener('click', (e) => { if (e.target === card || e.target.parentNode === card) pick(m); });
    rail.appendChild(card);
  }
  if (!MODES.length) rail.appendChild(el('div.empty', {}, 'No modes defined'));
  root.appendChild(rail);

  function best(m) {
    if (m.id === 'story') {
      const done = (data.LEVELS || []).filter((l) => M.levelDone(save, l.id)).length;
      return `${done}/${(data.LEVELS || []).length} FLOWN`;
    }
    if (m.event) return m.endsIn || 'SUNDAY';
    const rec = ((M.d(save).modes || {})[m.id]) || null;
    if (!rec) return 'NOT FLOWN';
    return String(rec.best != null ? rec.best : rec.score || '—');
  }

  function pick(m) {
    if (m.id === 'story') { ctx.go('levelselect'); return; }
    const lv = m.levelId ? data.LEVELS.find((l) => l.id === m.levelId) : M.nextLevel(save, data.LEVELS);
    if (!lv) { toast('Nothing to fly in this mode yet', 'bad'); return; }
    ctx.go('brief', { levelId: lv.id, mode: m.id });
  }
}

export function unmount() {}

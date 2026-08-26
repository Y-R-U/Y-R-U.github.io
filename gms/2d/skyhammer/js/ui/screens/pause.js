// Pause. Sits over the frozen game; resume / restart / settings / quit to the map.

import { el, btn, popup, secs } from '../widgets.js';
import { cash } from '../units.js';
import * as M from '../model.js';

export function mount(root, ctx) {
  const a = ctx.args || {};
  const lv = (ctx.data.LEVELS || []).find((l) => l.id === a.levelId) || null;

  root.appendChild(el('div.res-scrim.deep'));

  const stats = a.stats || {};
  root.appendChild(el('div.pause-card', {},
    el('div.res-eyebrow', {}, lv ? `${lv.id.toUpperCase()} · ${lv.name}` : 'PAUSED'),
    el('h2.pause-h', {}, 'PAUSED'),
    el('div.pause-stats', {},
      el('div.kv', {}, el('span', {}, 'TIME'), el('b', {}, secs(stats.t || 0))),
      el('div.kv', {}, el('span', {}, 'KILLS'), el('b', {}, String(stats.kills || 0))),
      el('div.kv', {}, el('span', {}, 'CASH'), el('b.gold', {}, cash(stats.money || 0)))
    ),
    el('div.pause-btns', {},
      btn('go wide', 'RESUME', () => ctx.resume()),
      btn('wide', 'RESTART', () => popup({
        title: 'Restart the mission?',
        body: 'Progress on this run is lost.',
        actions: [{ label: 'Keep flying' }, { label: 'Restart', kind: 'go', act: () => ctx.start(a.levelId, a.mode || 'story') }],
      })),
      btn('wide ghost', 'SETTINGS', () => ctx.go('settings', { from: 'pause', pauseArgs: a })),
      btn('wide danger', 'QUIT TO MAP', () => popup({
        title: 'Abandon the sortie?',
        body: 'You keep nothing from this run.',
        actions: [{ label: 'Stay up' }, { label: 'Quit', kind: 'danger', act: () => { ctx.quit(); ctx.go('levelselect'); } }],
      }))
    )
  ));

  const nudge = M.affordableNudge(ctx.save, ctx.data.PLANES, ctx.data.WEAPONS, ctx.data.UPGRADES, ctx.data.ECON);
  if (nudge && nudge.kind !== 'save') {
    root.appendChild(el('div.pause-foot', {}, `Waiting in the hangar: ${nudge.label}`));
  }
}

export function unmount() {}

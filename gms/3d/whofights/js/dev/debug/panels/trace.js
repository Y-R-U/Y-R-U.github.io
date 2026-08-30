// Everything the authored content did, in order: hotspots entered and left, hotspots that fired
// and hotspots that refused to, every action verb, every conversation node and line, every flag.
//
// The hooks are installed once for the session (js/dev/debug/install.js), so the log covers time
// spent playing with this panel shut.

import { state, traceLine, matchTrace, TRACE_KINDS } from '../core.js';
import { handles } from '../game.js';
import { h, section, button, clear, table, download, esc } from '../ui.js';
import * as hud from '../hud.js';

export const panel = {
  id: 'trace',
  label: 'Trace',
  badge: () => state.trace.size || 0,

  mount(el, ctx) {
    const off = new Set();
    const search = h('input');
    search.type = 'text';
    search.placeholder = 'search…';
    const log = h('div', 'dbg-log');
    const chips = h('div', 'dbg-chips');
    const hotspots = h('div');
    let follow = true;

    for (const k of TRACE_KINDS) {
      const c = h('button', 'dbg-chip on', k);
      c.onclick = () => {
        if (off.has(k)) off.delete(k); else off.add(k);
        c.className = `dbg-chip${off.has(k) ? '' : ' on'}`;
        paint();
      };
      chips.append(c);
    }

    const bar = h('div', 'row');
    const pause = button(state.tracing ? 'Recording' : 'Paused', state.tracing ? 'primary' : '', () => {
      state.tracing = !state.tracing;
      pause.textContent = state.tracing ? 'Recording' : 'Paused';
      pause.className = state.tracing ? 'primary' : '';
    });
    bar.append(pause,
      button('Clear', '', () => { state.trace.clear(); paint(); }),
      button('Export JSON', '', () => download(`wf-trace-${Date.now()}.json`,
        JSON.stringify(state.trace.list(), null, 2))),
      button('Follow', 'primary', e => {
        follow = !follow;
        e.target.className = follow ? 'primary' : '';
      }),
      button('Mini-HUD', hud.visible() ? 'primary' : '', e => {
        hud.show(ctx, !hud.visible());
        hud.lane('trace', true);
        e.target.className = hud.visible() ? 'primary' : '';
      }),
      search);

    el.append(
      section('Event trace', bar, chips, log,
        h('p', 'dbg-note', 'The game loop stops while this overlay is open, so nothing new arrives '
          + 'until you close it. Turn on the mini-HUD to watch the tail while you play.')),
      section('Hotspot state', hotspots));

    function paint() {
      const kinds = new Set(TRACE_KINDS.filter(k => !off.has(k)));
      const rows = state.trace.list().filter(e => matchTrace(e, { kinds, text: search.value.trim() }));
      clear(log).append(table(null, rows.map(e => {
        const l = traceLine(e, state.installedAt);
        return [
          { html: `<span class="dim">${l.time}</span>` },
          { html: `<span class="dbg-k ${l.kind}">${l.kind}</span>` },
          { html: `<b>${esc(l.id)}</b>`, cls: l.cls },
          { html: esc(l.text), cls: 'wide dim' },
        ];
      })));
      if (!rows.length) {
        clear(log).append(h('div', 'empty', state.trace.size
          ? 'nothing matches this filter'
          : 'nothing recorded yet — walk into the hall doorway with the hub closed'));
      }
      if (follow) log.scrollTop = log.scrollHeight;
      paintHotspots();
    }

    function paintHotspots() {
      const g = handles(ctx);
      const hs = g.session?.hotspots;
      if (!hs) return void clear(hotspots).append(h('div', 'dim', 'no session — the hotspot runtime is not up'));
      clear(hotspots).append(table(['hotspot', 'trigger', 'inside', 'fired', 'cooldown', 'actions'],
        hs.list.map(x => {
          const st = hs.state.get(x.id) || {};
          return [x.name || x.id, x.trigger,
            { html: st.in ? 'yes' : 'no', cls: st.in ? 'good' : 'dim' },
            String(st.fired ?? 0),
            st.cool > 0 ? `${st.cool.toFixed(1)}s` : '—',
            (x.actions || []).map(a => a.k).join(', ') || '—'];
        })));
      if (hs.log?.length) {
        hotspots.append(h('div', 'problems', hs.log.slice(-8).join('\n')));
      }
    }

    paint();
    search.oninput = paint;
    this._t = setInterval(paint, 900);
  },

  unmount() { clearInterval(this._t); },
};

// console.* and every uncaught error, captured into a ring. This is how you debug on a phone,
// where there is no devtools — turn on the mini-HUD's Console lane and the errors come to you.

import { state, matchLog, LOG_LEVELS } from '../core.js';
import { h, section, button, clear, table, download, esc } from '../ui.js';
import * as hud from '../hud.js';

export const panel = {
  id: 'console',
  label: 'Console',
  badge: () => state.counts.error || 0,

  mount(el, ctx) {
    const off = new Set();
    const search = h('input');
    search.type = 'text';
    search.placeholder = 'search…';
    const log = h('div', 'dbg-log');
    const chips = h('div', 'dbg-chips');
    let follow = true;

    for (const lv of LOG_LEVELS) {
      const c = h('button', 'dbg-chip on', lv);
      c.onclick = () => {
        if (off.has(lv)) off.delete(lv); else off.add(lv);
        c.className = `dbg-chip${off.has(lv) ? '' : ' on'}`;
        paint();
      };
      chips.append(c);
    }

    const bar = h('div', 'row');
    bar.append(
      button('Clear', '', () => { state.log.clear(); state.counts.error = state.counts.warn = 0; paint(); }),
      button('Copy all', '', async () => {
        const text = state.log.list().map(e => `[${e.level}] ${e.text}`).join('\n');
        try { await navigator.clipboard.writeText(text); ctx.toast('copied'); }
        catch { download('wf-console.txt', text, 'text/plain'); }
      }),
      button('Export', '', () => download(`wf-console-${Date.now()}.json`, JSON.stringify(state.log.list(), null, 2))),
      button('Follow', 'primary', e => { follow = !follow; e.target.className = follow ? 'primary' : ''; }),
      button('Mini-HUD', hud.visible() ? 'primary' : '', e => {
        hud.show(ctx, !hud.visible());
        hud.lane('log', true);
        e.target.className = hud.visible() ? 'primary' : '';
      }),
      button('Throw a test error', '', () => { setTimeout(() => { throw new Error('debug tab test error'); }, 0); }),
      search);

    el.append(section('Console', bar, chips, log,
      h('p', 'dbg-note', 'Capture starts when the Debug tab is first opened, so anything logged '
        + 'during boot is not in here. Everything after that is, including from a paused game.')));

    function paint() {
      const levels = new Set(LOG_LEVELS.filter(l => !off.has(l)));
      const rows = state.log.list().filter(e => matchLog(e, { levels, text: search.value.trim() }));
      clear(log).append(table(null, rows.map(e => [
        { html: `<span class="dim">${new Date(e.wall).toLocaleTimeString()}</span>` },
        { html: `<span class="dbg-k ${e.level}">${e.level}</span>` },
        { html: esc(e.text), cls: `wide ${e.level === 'error' ? 'bad' : e.level === 'warn' ? 'warnc' : ''}` },
      ])));
      if (!rows.length) {
        clear(log).append(h('div', 'empty', state.log.size ? 'nothing matches' : 'nothing captured yet'));
      }
      if (follow) log.scrollTop = log.scrollHeight;
    }

    paint();
    search.oninput = paint;
    this._t = setInterval(paint, 1000);
  },

  unmount() { clearInterval(this._t); },
};

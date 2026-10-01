// The goal chip: a small glassy pill, top-left. Tap it for the hint. Gold flash + toast when a goal is done.
import { h } from '../../ui/dom.js';

function ensureCss() {
  if (document.getElementById('sw-journal-css')) return;
  const l = document.createElement('link');
  l.id = 'sw-journal-css';
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/journal.css', import.meta.url).href;
  document.head.append(l);
}

export function createGoalChip(ctx, journal) {
  ensureCss();
  const root = ctx.uiRoot || document.getElementById('ui-root') || document.body;
  const title = h('span.t');
  const count = h('span.c');
  const hint = h('div.hint');
  const chip = h('div.sw-goal.glass', {
    onpointerdown: (e) => { e.stopPropagation(); open = !open; chip.classList.toggle('open', open); },
  }, h('div.row', {}, h('span.ic', {}, '✦'), h('span.lab', {}, 'Goal'), title, count), hint);
  root.append(chip);
  let open = false, shownId = null, celebT = 0, pending = null;

  function refresh() {
    const g = journal.current();
    const p = journal.progress();
    if (!g) { title.textContent = journal.game.creative ? 'Every build goal done!' : 'Journal complete!'; hint.textContent = 'You are a true Grower.'; }
    else { title.textContent = g.title; hint.textContent = g.hint; }
    count.textContent = `${p.done}/${p.total}`;
    if (g?.id !== shownId) { shownId = g?.id; chip.classList.remove('new'); void chip.offsetWidth; chip.classList.add('new'); open = false; chip.classList.remove('open'); }
  }

  async function toast(text) {
    try { (await import('../../ui/dom.js')).toast(text, { kind: 'ok', icon: '✦', ms: 3200 }); } catch {}
  }

  refresh();
  let modeSeen = journal.game.creative;
  return {
    refresh,
    celebrate(g, p) {
      toast(`Goal complete: ${g.title}`);
      // Hold the finished goal in gold for a moment before moving on.
      pending = g;
      celebT = 1.6;
      title.textContent = g.title;
      count.textContent = `${p.done}/${p.total}`;
      chip.classList.add('done');
    },
    update(dt) {
      if (journal.game.creative !== modeSeen) { modeSeen = journal.game.creative; refresh(); }
      chip.classList.toggle('hide', journal.hidden && celebT <= 0);
      chip.classList.toggle('build', !!journal.game.creative);
      if (celebT > 0 && (celebT -= dt) <= 0) { chip.classList.remove('done'); pending = null; refresh(); }
      else if (!pending && journal.current()?.id !== shownId) refresh();
    },
  };
}

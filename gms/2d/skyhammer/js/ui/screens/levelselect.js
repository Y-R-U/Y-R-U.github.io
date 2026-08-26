// Campaign map: every level grouped by act, locked/unlocked, stars. Scrolls vertically.

import { el, btn, topbar, toast } from '../widgets.js';
import { iconCanvas } from '../icons.js';
import * as M from '../model.js';

let scrollMemo = 0;

export function mount(root, ctx) {
  const { data, save } = ctx;
  const LEVELS = data.LEVELS;

  root.appendChild(topbar(ctx, 'CAMPAIGN', { back: () => ctx.go('title'), screen: 'levelselect' }));

  if (!LEVELS.length) {
    root.appendChild(el('div.empty', {}, 'No levels in data/levels.js yet'));
    return;
  }

  const groups = M.acts(LEVELS, data.ACTS);
  const scroller = el('div.map-scroll');

  const jump = el('div.act-jump');
  for (const g of groups) {
    jump.appendChild(btn('chipbtn', M.actLabel(g.act), () => {
      // data-act is on the STATIC section wrapper, never on the sticky .act-head: a stuck header
      // reports its stuck position from offsetTop/getBoundingClientRect, so every chip resolved to
      // roughly the same number and every jump — forwards or back — clamped to the bottom of the
      // list. .map-scroll is position:relative so this offsetTop is the scroll offset itself.
      const sec = scroller.querySelector(`.act-sec[data-act="${g.act}"]`);
      if (sec) scroller.scrollTo({ top: Math.max(0, sec.offsetTop - 4), behavior: 'smooth' });
    }));
  }
  jump.appendChild(el('div.spacer'));
  jump.appendChild(el('div.chip.stars', {}, el('span.star-dot'),
    el('span', {}, `${M.totalStars(save, LEVELS)}/${M.maxStars(LEVELS)}`)));
  root.appendChild(jump);

  for (const g of groups) {
    // ungraded levels (the tutorials, stars:false) count toward neither half of the act total
    const graded = M.gradedLevels(g.levels.map((x) => x.level));
    const got = graded.reduce((n, l) => n + M.levelStars(save, l.id), 0);
    const sec = el('section.act-sec', { dataAct: String(g.act) });
    scroller.appendChild(sec);
    sec.appendChild(el('div.act-head', {},
      el('span.act-n', {}, M.actLabel(g.act)),
      el('span.act-name', {}, g.name),
      graded.length ? el('span.act-stars', {}, `${got}/${graded.length * 3}`) : null
    ));

    const grid = el('div.lv-grid');
    for (const { level, index } of g.levels) {
      const unlocked = M.levelUnlocked(save, LEVELS, index);
      const stars = M.levelStars(save, level.id);
      const num = level.id.split('-').pop();
      const tile = el('div.lv' + (unlocked ? '' : '.locked') + (stars ? '.done' : ''), { title: level.name });
      if (unlocked) {
        tile.appendChild(el('span.lv-n', {}, num));
        tile.appendChild(el('span.lv-name', {}, level.name));
        tile.appendChild(el('span.lv-stars', {},
          el('i.s' + (stars > 0 ? '.on' : '')), el('i.s' + (stars > 1 ? '.on' : '')), el('i.s' + (stars > 2 ? '.on' : ''))));
        tile.addEventListener('click', () => {
          scrollMemo = scroller.scrollTop;
          ctx.go('brief', { levelId: level.id, mode: 'story' });
        });
      } else {
        tile.appendChild(iconCanvas('lock', 18, 'rgba(190,175,150,0.4)'));
        tile.appendChild(el('span.lv-n.dim', {}, num));
        tile.addEventListener('click', () => toast('Fly the previous mission first', 'bad'));
      }
      grid.appendChild(tile);
    }
    sec.appendChild(grid);
  }

  root.appendChild(scroller);
  requestAnimationFrame(() => { scroller.scrollTop = scrollMemo; });
}

export function unmount() {}

// Title-screen Mini-games tab: bot difficulty + a card per game (icon, blurb, minutes, best result, length chips).
import { h, click } from '../ui/dom.js';
import { g } from '../ui/glyphs.js';
import { settings } from '../ui/settings.js';
import { listGames, bests } from './registry.js';

const stars = (n) => h('span.mg-cstars', {}, [0, 1, 2].map((i) => h('span', { class: i < n ? 'on' : '' }, '★')));

export async function renderMinigameMenu(body, onPlay) {
  body.replaceChildren(h('div.sw-empty', {}, 'Loading mini-games…'));
  const games = await listGames();
  const B = bests();
  const level = settings.get('minigamesBots') || 'normal';
  const seg = h('div.sw-seg', {}, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']].map(([v, lb]) =>
    h('button', { class: level === v ? 'on' : '', onclick: (e) => { click(); settings.set('minigamesBots', v); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, lb)));
  const cards = games.map((d) => {
    const vars = d.variants || null;
    let variant = vars?.find((v) => v.default)?.id || vars?.[0]?.id || null;
    const bestEl = h('div.mg-cbest');
    const paintBest = () => {
      const b = B[variant ? `${d.id}:${variant}` : d.id];
      bestEl.replaceChildren(stars(b?.stars || 0), h('span', {}, b?.label ? 'Best ' + b.label : b?.plays ? `${b.plays} played` : 'Not played yet'));
    };
    paintBest();
    const chips = vars && h('div.mg-chips', {}, vars.map((v) => h('button', { class: v.id === variant ? 'on' : '', onclick: (e) => {
      e.stopPropagation(); click('select'); variant = v.id;
      e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      paintBest();
    } }, v.label)));
    return h('div.mg-card', { onclick: () => { click(); onPlay(d.id, { variant }); } },
      h('div.mg-cicon', {}, g(d.icon || 'play', 26)),
      h('div.mg-cbody', {},
        h('div.mg-cname', {}, d.name, h('span.mg-cmin', {}, `${d.minutes || 3} min`)),
        h('div.mg-cblurb', {}, d.blurb || ''),
        chips, bestEl),
      h('button.sw-btn.primary.small.mg-cplay', { onclick: (e) => { e.stopPropagation(); click(); onPlay(d.id, { variant }); } }, g('play', 14), 'Play'));
  });
  body.replaceChildren(
    h('div.mg-menu-top', {}, h('span', {}, 'Bots'), seg, h('span.mg-menu-tip', {}, 'Tip: type / in a game for commands')),
    cards.length ? h('div.mg-grid', {}, cards) : h('div.sw-empty', {}, 'No mini-games found.'));
}

// Learn tab entry (lane L). The shell calls openLearn(el, ctx) to render the 'learn' screen.
import { h } from '../ui/kit.js?v=202610100510';
import { defineScreen, header, go } from '../ui/app.js?v=202610100510';
import { sfx } from '../ui/fx.js?v=202610100510';
import { install, ensureCss } from './hook.js?v=202610100510';
import { badgeCount, getCards } from './model.js?v=202610100510';
import { getIndex } from '../core/packs.js?v=202610100510';
import { kidsOn } from './data.js?v=202610100510';
import { kidsProgress } from '../ui/stickers.js?v=202610100510';
import { WIDE } from './ui.js?v=202610100510';
import { BUILD } from '../build.js?v=202610100510';
import { lazyImport } from '../ui/update.js?v=202610100510';

export { install, feed } from './hook.js?v=202610100510';

const lazy = file => () => lazyImport(new URL(`./${file}.js?v=${BUILD}`, import.meta.url).href);
const SCREENS = {
  'l-guide': ['guide', 'guideHome'], 'l-pack': ['guide', 'packGrid'], 'l-item': ['item', 'itemCard'],
  'l-cards': ['cards', 'deckSetup'], 'l-review': ['cards', 'review'], 'l-mastery': ['progress', 'masteryScreen'],
  'l-look': ['look', 'lookScreen'], 'l-sound': ['sound', 'soundLab'], 'l-explore': ['explore', 'exploreScreen'],
};
let defined = false;
function defineAll() {
  if (defined) return;
  defined = true;
  for (const [name, [file, fn]] of Object.entries(SCREENS)) {
    defineScreen(name, async (el, params, cur) => {
      el.classList.toggle('l-kids', kidsOn());
      const m = await lazy(file)();
      return m[fn](el, params, cur);
    }, { pester: name !== 'l-review', cls: WIDE + ' learn-scr' });
  }
}

const TOOLS = [
  ['l-guide', '🔎', 'Field guide', 'Photos, facts and filters', '🖼️', 'Picture book'],
  ['l-cards', '🃏', 'Flashcards', 'Spaced repetition', '🃏', 'Flashcards'],
  ['l-mastery', '🏅', 'Mastery', 'Progress rings and world map', '⭐', 'My stickers'],
  ['l-look', '👯', 'Lookalikes', 'Tell similar things apart', null],
  ['l-sound', '🎧', 'Sound lab', 'Calls, anthems, instruments', '🎵', 'Sounds'],
  ['l-explore', '🗺️', 'Explore map', 'Tap a country for facts', '🌍', 'World map'],
];

export function openLearn(el, ctx) {
  ensureCss();
  install(ctx);
  defineAll();
  const kids = kidsOn();
  el.classList.add(WIDE, 'learn-scr');
  el.classList.toggle('l-kids', kids);
  el.append(header('Learn'));
  const due = badgeCount(getIndex());
  const decks = getCards().decks.length;
  const today = h('button.l-today', { type: 'button', dataset: { act: 'review' }, onclick: () => { sfx('button'); go('l-cards'); } },
    h('span.lt-ico', {}, due > 0 ? '🔥' : '✅'),
    h('span.lt-txt', {},
      h('b', {}, due > 0 ? (kids ? `${due} cards to play` : `${due} to review today`) : decks ? 'All caught up!' : (kids ? 'Make a flashcard deck' : 'Start a flashcard deck')),
      h('small', {}, due > 0 ? 'Pick which packs to study' : decks ? 'New cards arrive tomorrow' : 'Pick packs, learn a few a day')),
    h('span.lt-go', {}, due > 0 ? '▶' : '›'));
  const tiles = h('div.l-tiles', {}, ...TOOLS.filter(t => !kids || t[4]).map(([id, ico, title, blurb, kIco, kTitle]) =>
    h('button.l-tile', { type: 'button', dataset: { go: id }, onclick: () => { sfx('button'); go(id); } },
      h('span.t-ico', {}, kids ? kIco : ico), h('span.t-title', {}, kids ? kTitle : title), kids ? null : h('span.t-blurb', {}, blurb))));
  el.append(h('div.l-hub', {}, today, tiles));
  if (kids) {
    const kp = kidsProgress();
    el.append(h('p.center.muted', {}, `⭐ ${kp.stars} stars · ${kp.have} sticker${kp.have === 1 ? '' : 's'}`));
  }
}

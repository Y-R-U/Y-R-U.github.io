// The home screen's stats highlight (a different real stat each visit, tap for the stats page) and the play clock.
import { h } from './kit.js?v=202610101826';
import { go, onScreen } from './app.js?v=202610101826';
import { statsView, highlights, markPlay } from '../core/stats.js?v=202610101826';
import { getIndex, THEMES } from '../core/packs.js?v=202610101826';
import { getFormat } from '../formats/registry.js?v=202610101826';

const PLAY_SCREENS = new Set(['play', 'duel', 'challenge', 'linkchallenge', 'l-review']);
onScreen(name => { if (PLAY_SCREENS.has(name)) markPlay(); });

export function nameOf(id, kind) {
  if (kind === 'theme') return THEMES.find(t => t.id === id)?.title || id;
  if (kind === 'format') return getFormat(id)?.title || id;
  return getIndex()?.packs?.[id]?.title || id;
}

const TIP_KEY = 'clued.statsTip';   // device-only rotation counter, deliberately not synced

export function statsLine(kids) {
  const list = highlights(statsView(), { title: nameOf, kids });
  if (!list.length) return null;
  let n = 0;
  try { n = (+localStorage.getItem(TIP_KEY) || 0) + 1; localStorage.setItem(TIP_KEY, String(n)); } catch (e) {}
  const tip = list[n % list.length];
  return h('button.stats-line', { type: 'button', dataset: { tip: tip.key, act: 'stats' }, onclick: () => go('stats') },
    h('span.sl-txt', {}, tip.text), h('span.sl-go', {}, kids ? 'Tap for your stars ›' : 'Tap for your stats ›'));
}

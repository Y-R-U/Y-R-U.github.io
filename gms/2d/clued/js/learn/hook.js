// Tiny boot hook (no heavy imports): feeds finished games into mastery/flashcards and badges the Learn tile.
import { onScreen } from '../ui/app.js?v=202610081215';
import { getIndex } from '../core/packs.js?v=202610081215';
import { recordGame, badgeCount } from './model.js?v=202610081215';
import { BUILD } from '../build.js?v=202610081215';

let installed = false;
const seen = new WeakSet();

export function ensureCss() {
  if (document.getElementById('learn-css')) return;
  const link = document.createElement('link');
  link.id = 'learn-css'; link.rel = 'stylesheet';
  link.href = new URL(`../../css/learn.css?v=${BUILD}`, import.meta.url).href;
  document.head.append(link);
}

export function feed(result) {
  if (!result || seen.has(result) || result.aborted) return [];
  seen.add(result);
  try { return recordGame(result); } catch (e) { console.warn('[learn] mastery update failed', e); return []; }
}

export function badgeHome(root = document) {
  const tile = root.querySelector('.tile[data-mode="learn"]');
  if (!tile) return;
  tile.querySelector('.l-badge')?.remove();
  const n = badgeCount(getIndex());
  if (n > 0) tile.append(Object.assign(document.createElement('span'), { className: 'l-badge', textContent: n > 99 ? '99+' : String(n), title: `${n} flashcards to review today` }));
}

export function install() {
  if (installed) return;
  installed = true;
  ensureCss();
  onScreen((name, params) => {
    if (name === 'results') feed(params?.result);
    else if (name === 'home') badgeHome();
  });
  if (document.body.dataset.screen === 'home') badgeHome();
}

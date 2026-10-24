// Story mission picker: shown from the menu's Story button once Mission 1 is done. Mission n + 1 unlocks when n is done.
import { MISSIONS, MISSION_IDS } from '../../data/story/index.js';
import { ensureStoryCss, el, esc, loadProgress } from './dom.js';

export function missionList(progress = loadProgress()) {
  return MISSION_IDS.map((id, k) => {
    const p = progress.missions?.[id] || {};
    const prev = MISSION_IDS[k - 1];
    return { id, title: MISSIONS[id].title, subtitle: MISSIONS[id].subtitle || '', done: !!p.done, best: p.best || 0, diff: p.diff || null,
      unlocked: k === 0 || !!progress.missions?.[prev]?.done, needs: prev };
  });
}

/** { parent, difficulty, onPick(id), onClose() } → { el, close() } */
export function createPicker({ parent = document.body, difficulty = 'easy', onPick, onClose }) {
  ensureStoryCss();
  const list = missionList();
  const next = list.find((m) => m.unlocked && !m.done) || null;
  const fmt = (n) => Math.round(n).toLocaleString('en-GB');
  const rows = list.map((m) => {
    const tag = !m.unlocked ? `LOCKED · finish ${m.needs} first` : m.done ? `✓ ${fmt(m.best)} PP` : 'NEW';
    return `<button type="button" data-id="${m.id}" class="${m === next ? 'next' : ''}"${m.unlocked ? '' : ' disabled aria-disabled="true"'}>
      <i>${m.id}</i><span><b>${esc(m.title)}</b><small>${esc(m.subtitle)}</small></span><em>${esc(tag)}</em></button>`;
  }).join('');
  const root = el('div', 'krz-st-pick', `<div class="krz-st-card" role="dialog" aria-label="Story missions">
    <small class="k">The Peerage · Story</small><h2>Missions</h2><h3>All at C-Tower 1. Choose your crime.</h3>
    <div class="krz-st-picklist">${rows}</div>
    <p class="krz-st-pickfoot">Difficulty: <b>${esc(difficulty[0].toUpperCase() + difficulty.slice(1))}</b> (change it in Settings)</p>
    <div class="krz-st-btns"><button type="button" class="alt" data-a="close">Back to the menu</button></div></div>`);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    e.stopPropagation();
    if (b.dataset.a === 'close') { close(); onClose?.(); return; }
    const id = +b.dataset.id;
    if (id) { close(); onPick?.(id); }
  });
  parent.appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));
  function close() { root.remove(); }
  return { el: root, close, list };
}

// D21 DEMAND TAKEOFF + D22 Skip to runway: ground-only buttons in the bottom action slot.
// D19: Free Flight difficulty chips, shown parked before the first take-off only. Locked aircraft show a padlock up front.
import { aircraftLockText } from '../ui/index.js';

const LOCK = '<svg viewBox="0 0 10 12" aria-hidden="true"><rect x="1" y="5" width="8" height="6.5" rx="1.3" fill="currentColor"/><path d="M3 5V3.4a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const lockOf = (a) => { try { return aircraftLockText(a); } catch (e) { return ''; } };

export function createGroundButtons(root, { onTakeoff, onSkip, onDifficulty, onAircraft, lockText = lockOf } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-ground';
  el.hidden = true;
  el.innerHTML = `<div class="krz-diff" data-g="diff" hidden><span>DIFFICULTY</span><button type="button" data-d="easy">Easy</button><button type="button" data-d="medium">Medium</button><button type="button" data-d="hard">Hard</button></div>
    <div class="krz-diff krz-plane" data-g="plane" hidden><span>AIRCRAFT</span><button type="button" data-a="c172">Runabout</button><button type="button" data-a="tiger">Moth</button><button type="button" data-a="bathtub">Bathtub</button></div>
    <div class="krz-plane-why" data-g="why" hidden></div>
    <div class="krz-ground-row"><button type="button" class="krz-gbtn krz-gbtn-to" data-g="takeoff"><b>DEMAND TAKEOFF</b><small>Queue? How quaint.</small></button>
    <button type="button" class="krz-gbtn krz-gbtn-skip" data-g="skip"><b>SKIP TO RUNWAY</b></button></div>`;
  root.append(el);
  const to = el.querySelector('[data-g="takeoff"]'), skip = el.querySelector('[data-g="skip"]'), diff = el.querySelector('[data-g="diff"]');
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  to.addEventListener('click', (e) => { e.stopPropagation(); onTakeoff?.(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); onSkip?.(); });
  const plane = el.querySelector('[data-g="plane"]'), why = el.querySelector('[data-g="why"]');
  let whyT = 0;
  function paintLocks() {
    for (const b of plane.querySelectorAll('button')) {
      const t = lockText(b.dataset.a), name = b.dataset.name ||= b.textContent;
      if (t) { b.dataset.locked = t; b.innerHTML = `${LOCK}<span></span>`; b.lastChild.textContent = name; b.setAttribute('aria-label', `${name}, locked: ${t}`); }
      else if (b.dataset.locked !== undefined || b.hasAttribute('aria-label')) { delete b.dataset.locked; b.textContent = name; b.removeAttribute('aria-label'); }
    }
  }
  function explain(b) {
    why.textContent = `${b.dataset.name} · ${b.dataset.locked}`;
    why.hidden = false;
    requestAnimationFrame(() => why.classList.add('in'));
    b.classList.remove('nope'); b.getBoundingClientRect(); b.classList.add('nope');
    clearTimeout(whyT);
    whyT = setTimeout(() => { why.classList.remove('in'); setTimeout(() => { if (!why.classList.contains('in')) why.hidden = true; }, 220); }, 2600);
  }
  plane.addEventListener('click', (e) => {
    const b = e.target.closest('button'), a = b?.dataset.a;
    if (!a) return;
    e.stopPropagation();
    paintLocks();
    if (b.dataset.locked) return explain(b);
    onAircraft?.(a);
  });
  diff.addEventListener('click', (e) => { const d = e.target.closest('button')?.dataset.d; if (d) { e.stopPropagation(); onDifficulty?.(d); } });
  let last = '';
  return {
    el,
    set({ takeoff = false, skip: sk = false, difficulty = null, aircraft = null } = {}) {
      const k = `${takeoff}|${sk}|${difficulty}|${aircraft}`;
      if (k === last) return;
      last = k;
      to.hidden = !takeoff; skip.hidden = !sk; diff.hidden = !difficulty;
      for (const b of diff.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.d === difficulty));
      if (aircraft && plane.hidden) paintLocks();
      plane.hidden = !aircraft;
      if (!aircraft) { why.hidden = true; why.classList.remove('in'); }
      for (const b of plane.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.a === aircraft));
      el.hidden = !takeoff && !sk && !difficulty && !aircraft;
    },
    get state() { return { takeoff: !to.hidden && !el.hidden, skip: !skip.hidden && !el.hidden, difficulty: diff.hidden || el.hidden ? null : diff.querySelector('[aria-pressed="true"]')?.dataset.d, aircraft: plane.hidden || el.hidden ? null : plane.querySelector('[aria-pressed="true"]')?.dataset.a,
      locked: [...plane.querySelectorAll('button[data-locked]')].map((b) => b.dataset.a), why: why.hidden ? '' : why.textContent }; },
    refreshLocks: paintLocks,
  };
}

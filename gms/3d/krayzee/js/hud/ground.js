// D21 DEMAND TAKEOFF + D22 Skip to runway: ground-only buttons in the bottom action slot.
// D19: Free Flight difficulty chips, shown parked before the first take-off only.
export function createGroundButtons(root, { onTakeoff, onSkip, onDifficulty, onAircraft } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-ground';
  el.hidden = true;
  el.innerHTML = `<div class="krz-diff" data-g="diff" hidden><span>DIFFICULTY</span><button type="button" data-d="easy">Easy</button><button type="button" data-d="medium">Medium</button><button type="button" data-d="hard">Hard</button></div>
    <div class="krz-diff krz-plane" data-g="plane" hidden><span>AIRCRAFT</span><button type="button" data-a="c172">Runabout</button><button type="button" data-a="tiger">Moth</button><button type="button" data-a="bathtub">Bathtub</button></div>
    <div class="krz-ground-row"><button type="button" class="krz-gbtn krz-gbtn-to" data-g="takeoff"><b>DEMAND TAKEOFF</b><small>Queue? How quaint.</small></button>
    <button type="button" class="krz-gbtn krz-gbtn-skip" data-g="skip"><b>SKIP TO RUNWAY</b></button></div>`;
  root.append(el);
  const to = el.querySelector('[data-g="takeoff"]'), skip = el.querySelector('[data-g="skip"]'), diff = el.querySelector('[data-g="diff"]');
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  to.addEventListener('click', (e) => { e.stopPropagation(); onTakeoff?.(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); onSkip?.(); });
  const plane = el.querySelector('[data-g="plane"]');
  plane.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a) { e.stopPropagation(); onAircraft?.(a); } });
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
      plane.hidden = !aircraft;
      for (const b of plane.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.a === aircraft));
      el.hidden = !takeoff && !sk && !difficulty && !aircraft;
    },
    get state() { return { takeoff: !to.hidden && !el.hidden, skip: !skip.hidden && !el.hidden, difficulty: diff.hidden || el.hidden ? null : diff.querySelector('[aria-pressed="true"]')?.dataset.d, aircraft: plane.hidden || el.hidden ? null : plane.querySelector('[aria-pressed="true"]')?.dataset.a }; },
  };
}

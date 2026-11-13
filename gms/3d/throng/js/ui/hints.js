// First-match callouts. Never block: pointer-events none, each one leaves on its own.
export function createHints(root, mouseMode = () => 'drag') {
  const el = document.createElement('div');
  el.className = 'hint-pill hidden';
  root.appendChild(el);
  let step = -1, shownAt = 0, nextAt = 0, active = false, recruitedAt0 = 0;
  const fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TEXT = [
    fine ? 'Drag, or use WASD, to move' : 'Drag anywhere to move',
    'Sweep up the grey people',
    'Bigger crowds absorb smaller ones.<br><b>Run from big, chase small!</b>',
  ];

  function show(i, now) { step = i; shownAt = now; el.innerHTML = i === 0 && fine && mouseMode() === 'follow' ? 'Point where you want to go<br><small>or use WASD</small>' : TEXT[i]; el.className = 'hint-pill h' + i; void el.offsetWidth; el.classList.add('in'); }
  function hide(now, gap = 1.2) { el.classList.remove('in'); el.classList.add('out'); nextAt = now + gap; step = step + 0.5; }

  return {
    start() { active = true; step = -1; nextAt = 0; el.className = 'hint-pill hidden'; },
    stop() { active = false; el.className = 'hint-pill hidden'; },
    get done() { return step >= 2.5; },
    update(state, me, dragging) {
      if (!active || state.phase !== 'play') return;
      const t = state.time, c = state.crowds[me];
      if (step === -1) { show(0, t); return; }
      if (step === 0 && (dragging || c.travelled > 25) && t - shownAt > 1.2 || step === 0 && t - shownAt > 8) { hide(t); recruitedAt0 = c.recruited; }
      else if (step === 0.5 && t >= nextAt) show(1, t);
      else if (step === 1 && (c.recruited - recruitedAt0 >= 20 && t - shownAt > 2 || t - shownAt > 7)) hide(t, 2.5);
      else if (step === 1.5 && t >= nextAt) {
        const near = state.crowds.some((o) => o !== c && o.alive && c.alive && o.count > c.count * 1.15 && Math.hypot(o.x - c.x, o.z - c.z) - o.radius - c.radius < 30);
        if (near || state.duration - state.timeLeft > 30) show(2, t);
      } else if (step === 2 && t - shownAt > 5.5) hide(t);
      else if (step === 2.5) { el.className = 'hint-pill hidden'; active = false; }
    },
  };
}

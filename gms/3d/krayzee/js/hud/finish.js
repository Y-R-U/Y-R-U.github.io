// D19 "LANDED — DEMAND IT" button. Shares the prompt slot (bottom centre, clear of thumbs); main decides ready/greyed.
const CROWN = '<svg viewBox="0 0 24 18" aria-hidden="true"><path d="M2 16 L1 4 L7 9 L12 1 L17 9 L23 4 L22 16 Z" fill="currentColor"/></svg>';

export function createFinishButton(root, { onPress } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'krz-finish';
  el.hidden = true;
  el.innerHTML = `<span class="krz-fin-ico">${CROWN}</span><span class="krz-fin-txt"><b>LANDED — DEMAND IT</b><small></small></span>`;
  root.append(el);
  const small = el.querySelector('small');
  let state = 'hidden', reason = '';
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state === 'ready') onPress?.();
    else { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }
  });
  return {
    el,
    // s: 'hidden' | 'ready' | 'greyed'; why: reason (greyed) or the payoff line (ready)
    set(s, why = '') {
      if (s === state && why === reason) return;
      const was = state;
      state = s; reason = why;
      el.hidden = s === 'hidden';
      el.dataset.state = s;
      small.textContent = why;
      el.setAttribute('aria-disabled', String(s !== 'ready'));
      if (was === 'hidden' && s !== 'hidden') { el.classList.remove('in'); requestAnimationFrame(() => el.classList.add('in')); }
    },
    get state() { return state; },
    get reason() { return reason; },
  };
}

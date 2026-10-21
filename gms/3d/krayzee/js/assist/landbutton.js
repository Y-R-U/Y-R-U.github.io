// The LAND assist button (D13). Sits above the throttle-side controls; FLIGHT decides what a press means.

const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2.5 19.5h19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13.2l2.3-.6 2.4 2 4.6-1.2-4-6.3 2.2-.6 6.6 5.3 3.3-.9c1-.3 2 .3 2.2 1.2.2.8-.3 1.6-1.1 1.8L5.9 17.4z" fill="currentColor"/></svg>';

export function createLandButton({ container, onPress, stickRight = false } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'krz-land';
  el.setAttribute('aria-label', 'Land ahead');
  el.innerHTML = `<span class="krz-land-ico">${ICON}</span><span class="krz-land-txt"><b>LAND</b><small></small></span>`;
  const b = el.querySelector('b'), small = el.querySelector('small');
  container.appendChild(el);
  let state = 'idle', reason = '';

  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state === 'unavailable') { el.classList.remove('krz-land-nope'); void el.offsetWidth; el.classList.add('krz-land-nope'); }
    onPress?.(state, reason);
  });

  function setState(s, why = '') {
    if (s === state && why === reason) return;
    state = s; reason = why;
    el.dataset.state = s;
    if (s === 'active') { b.textContent = 'LANDING…'; small.textContent = why || 'touch controls to cancel'; }
    else if (s === 'unavailable') { b.textContent = 'LAND'; small.textContent = why; }
    else { b.textContent = 'LAND'; small.textContent = why; }
    el.setAttribute('aria-disabled', s === 'unavailable' ? 'true' : 'false');
  }
  function setSide(right) { el.dataset.side = right ? 'left' : 'right'; }
  setSide(stickRight);
  setState('idle');
  el.dataset.state = 'idle';

  return {
    el, setState, setSide,
    get state() { return state; },
    setVisible(v) { el.hidden = !v; },
    dispose() { el.remove(); },
  };
}

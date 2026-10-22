// The LAND assist button (D13). Sits above the stick zone (RADIO owns the throttle side); FLIGHT decides what a press means.

const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2.5 19.5h19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13.2l2.3-.6 2.4 2 4.6-1.2-4-6.3 2.2-.6 6.6 5.3 3.3-.9c1-.3 2 .3 2.2 1.2.2.8-.3 1.6-1.1 1.8L5.9 17.4z" fill="currentColor"/></svg>';

// LAND NOW (Aaron): while LAND flies a circuit/join, a second button directly under LAND flies straight ahead and down
// instead. main.js gets onPress('now') and plans as usual; armLandNow() makes that next planLandAhead() straight-only.
let nowArmed = false, lastPlan = null;
export function armLandNow() { nowArmed = true; }
export function takeLandNow() { const v = nowArmed; nowArmed = false; return v; }
export function noteLandPlan(p) { if (p && !p.fail) lastPlan = p; }

const CSS = `
.krz-land[data-now="1"] { translate: 0 -58px; }
.krz-land-now { position: absolute; left: -2px; top: calc(100% + 8px); min-width: calc(100% + 4px); height: 44px; box-sizing: border-box;
  display: none; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border-radius: 22px;
  border: 2px solid #ffb547; background: rgba(46, 26, 6, .88); color: #ffcf7a; font: 800 13px/1 system-ui, sans-serif;
  letter-spacing: .1em; white-space: nowrap; box-shadow: 0 4px 14px rgba(0, 0, 0, .4); touch-action: manipulation; }
.krz-land[data-now="1"] .krz-land-now { display: flex; }
.krz-land-now small { font-size: 9px; font-weight: 700; letter-spacing: .04em; color: rgba(255, 228, 180, .85); }
.krz-land-now:active { filter: brightness(1.25); }
`;

export function createLandButton({ container, onPress, stickRight = false } = {}) {
  if (!document.getElementById('krz-landnow-css')) {
    const st = document.createElement('style'); st.id = 'krz-landnow-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'krz-land';
  el.setAttribute('aria-label', 'Land ahead');
  el.innerHTML = `<span class="krz-land-ico">${ICON}</span><span class="krz-land-txt"><b>LAND</b><small></small></span><span class="krz-land-now" role="button" aria-label="Land now, straight ahead">LAND NOW <small>straight ahead</small></span>`;
  const b = el.querySelector('b'), small = el.querySelector('.krz-land-txt small'), now = el.querySelector('.krz-land-now');
  container.appendChild(el);
  let state = 'idle', reason = '';

  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (now.contains(e.target)) {
      if (state !== 'active' || el.dataset.now !== '1') return;
      armLandNow(); onPress?.('now', reason); nowArmed = false; showNow();
      return;
    }
    if (state === 'unavailable') { el.classList.remove('krz-land-nope'); void el.offsetWidth; el.classList.add('krz-land-nope'); }
    onPress?.(state, reason);
  });

  // shown only while LAND is flying a non-straight pattern (the autopilot marks plan.leg as it goes)
  let nowTimer = 0;
  function showNow() {
    const on = state === 'active' && !el.hidden && lastPlan && lastPlan.pattern !== 'straight' && lastPlan.leg !== 'approach';
    if ((el.dataset.now === '1') !== !!on) el.dataset.now = on ? '1' : '0';
  }
  function setState(s, why = '') {
    if (s === 'active' && !nowTimer) nowTimer = setInterval(showNow, 400);
    if (s !== 'active' && nowTimer) { clearInterval(nowTimer); nowTimer = 0; }
    if (s === state && why === reason) return showNow();
    state = s; reason = why;
    el.dataset.state = s;
    if (s === 'active') { b.textContent = 'LANDING…'; small.textContent = why || 'touch controls to cancel'; }
    else if (s === 'unavailable') { b.textContent = 'LAND'; small.textContent = why; }
    else { b.textContent = 'LAND'; small.textContent = why; }
    el.setAttribute('aria-disabled', s === 'unavailable' ? 'true' : 'false');
    showNow();
  }
  function setSide(stickOnRight) { el.dataset.side = stickOnRight ? 'right' : 'left'; }
  setSide(stickRight);
  setState('idle');
  el.dataset.state = 'idle';

  return {
    el, setState, setSide,
    get state() { return state; },
    setVisible(v) { if (el.hidden !== !v) { el.hidden = !v; showNow(); } },
    get nowShown() { return el.dataset.now === '1'; },
    dispose() { clearInterval(nowTimer); el.remove(); },
  };
}

// The LAND assist button (D13). Sits above the stick zone (RADIO owns the throttle side); FLIGHT decides what a press means.

const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2.5 19.5h19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 13.2l2.3-.6 2.4 2 4.6-1.2-4-6.3 2.2-.6 6.6 5.3 3.3-.9c1-.3 2 .3 2.2 1.2.2.8-.3 1.6-1.1 1.8L5.9 17.4z" fill="currentColor"/></svg>';

// LAND NOW (Aaron): while LAND flies a circuit/join, a second button directly under LAND flies straight ahead and down
// instead. main.js gets onPress('now') and plans as usual; armLandNow() makes that next planLandAhead() straight-only.
let nowArmed = false, lastPlan = null;
export function armLandNow() { nowArmed = true; }
export function takeLandNow() { const v = nowArmed; nowArmed = false; return v; }
export function noteLandPlan(p) { if (p && !p.fail) lastPlan = p; }
// JETCORE: a jet's LAND NOW that went for the runway instead of a field carries plan.quip; the button shows it a while
const quipShown = (p) => p?.quip && (p.quipAt ??= Date.now()) > Date.now() - 6000 ? p.quip : null;

// D35 F-35B context icons (the same slot reads VERTICAL TAKEOFF / HOVER / LAND HERE / FLY ON)
const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${d}</svg>`;
const JET = '<path d="M12 3.5l1.6 5.2 6.4 4.1v1.6l-6.1-1.6-.5 3.6 2 1.6v1.3L12 18.4l-3.4.9V18l2-1.6-.5-3.6-6.1 1.6v-1.6l6.4-4.1z" fill="currentColor" transform="translate(0 -1.5) scale(1 .82)"/>';
const CTX_ICONS = {
  vto: svg(`${JET}<path d="M12 23v-4.5M9.6 20.8L12 18.4l2.4 2.4" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  hover: svg(`${JET}<path d="M7 19.5h10M9 22h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`),
  land: svg(`${JET}<path d="M12 17.5v4M9.8 19.8L12 22l2.2-2.2M5 23h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  flyon: svg('<path d="M3 12h13M12 7l5 5-5 5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 6.5v11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
};
CTX_ICONS.cancel = CTX_ICONS.hover; CTX_ICONS.none = CTX_ICONS.vto;

const CSS = `
.krz-land[data-ctx] .krz-land-txt b { letter-spacing: .05em; }
.krz-land[data-ctx] { max-width: 240px; }
.krz-land[data-now="1"] { translate: 0 -58px; }
.krz-land-now { position: absolute; left: -2px; top: calc(100% + 8px); min-width: calc(100% + 4px); height: 44px; box-sizing: border-box;
  display: none; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border-radius: 22px;
  border: 2px solid #ffb547; background: rgba(46, 26, 6, .88); color: #ffcf7a; font: 800 13px/1 system-ui, sans-serif;
  letter-spacing: .1em; white-space: nowrap; box-shadow: 0 4px 14px rgba(0, 0, 0, .4); touch-action: manipulation; }
.krz-land[data-now="1"] .krz-land-now { display: flex; }
.krz-land-now small { font-size: 9px; font-weight: 700; letter-spacing: .04em; color: rgba(255, 228, 180, .85); }
.krz-land-now:active { filter: brightness(1.25); }
`;

export function createLandButton({ container, onPress, onContext, stickRight = false } = {}) {
  if (!document.getElementById('krz-landnow-css')) {
    const st = document.createElement('style'); st.id = 'krz-landnow-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'krz-land';
  el.setAttribute('aria-label', 'Land ahead');
  el.innerHTML = `<span class="krz-land-ico">${ICON}</span><span class="krz-land-txt"><b>LAND</b><small></small></span><span class="krz-land-now" role="button" aria-label="Land now, straight ahead">LAND NOW <small>straight ahead</small></span>`;
  const b = el.querySelector('b'), small = el.querySelector('.krz-land-txt small'), now = el.querySelector('.krz-land-now'), ico = el.querySelector('.krz-land-ico');
  const NOW_HTML = now.innerHTML;
  let ctx = null, ctxSig = '';
  container.appendChild(el);
  let state = 'idle', reason = '', guardAt = -1e9;
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctx) {
      if (clock() - guardAt < 700) return;
      const alt = now.contains(e.target) && ctx.alt;
      if (!alt && ctx.state === 'unavailable') { el.classList.remove('krz-land-nope'); void el.offsetWidth; el.classList.add('krz-land-nope'); }
      onContext?.(alt ? ctx.alt.key : ctx.key, alt ? 'idle' : ctx.state);
      guardAt = clock();   // the action under the thumb changes: a double tap must not hit the new one
      return;
    }
    if (now.contains(e.target)) {
      if (state !== 'active' || el.dataset.now !== '1') return;
      armLandNow(); onPress?.('now', reason); nowArmed = false; showNow();
      return;
    }
    // FLIGHTFIX3: a second tap within 0.7 s of LAND going active, or of LAND moving (LAND NOW showing/hiding slides it
    // 58 px, so LAND lands under the finger that just hit LAND NOW), is a double tap, not a cancel
    if (state === 'active' && clock() - guardAt < 700) return;
    if (state === 'unavailable') { el.classList.remove('krz-land-nope'); void el.offsetWidth; el.classList.add('krz-land-nope'); }
    onPress?.(state, reason);
  });

  // shown only while LAND is flying a non-straight pattern (the autopilot marks plan.leg as it goes)
  let nowTimer = 0;
  function showNow() {
    if (ctx) return;
    const on = state === 'active' && !el.hidden && lastPlan && lastPlan.pattern !== 'straight' && !lastPlan.nowFallback && lastPlan.leg !== 'approach';   // a LAND NOW that found nothing straight is not offered again for that plan
    if ((el.dataset.now === '1') !== !!on) { el.dataset.now = on ? '1' : '0'; guardAt = clock(); }
  }
  function setState(s, why = '') {
    if (ctx) { state = s; reason = why; return; }
    if (s === 'active' && !nowTimer) nowTimer = setInterval(showNow, 400);
    if (s !== 'active' && nowTimer) { clearInterval(nowTimer); nowTimer = 0; }
    if (s === state && why === reason) return showNow();
    if (s === 'active' && state !== 'active') guardAt = clock();
    state = s; reason = why;
    el.dataset.state = s;
    if (s === 'active') { b.textContent = 'LANDING…'; small.textContent = quipShown(lastPlan) || why || 'touch controls to cancel'; }
    else if (s === 'unavailable') { b.textContent = 'LAND'; small.textContent = why; }
    else { b.textContent = 'LAND'; small.textContent = why; }
    el.setAttribute('aria-disabled', s === 'unavailable' ? 'true' : 'false');
    showNow();
  }
  // D35: a context action (js/flight/stovl.js contextButton) takes the slot over; null hands it back to LAND
  function setContext(c) {
    const sig = c ? [c.key, c.label, c.sub, c.state, c.alt?.key, c.alt?.label, c.alt?.sub].join('|') : '';
    if (sig === ctxSig) return;
    ctxSig = sig; ctx = c || null;
    if (!c) {
      delete el.dataset.ctx; ico.innerHTML = ICON; now.innerHTML = NOW_HTML; el.setAttribute('aria-label', 'Land ahead');
      const s0 = state, r0 = reason; state = ''; setState(s0, r0);
      return;
    }
    el.dataset.ctx = c.key; el.dataset.state = c.state;
    ico.innerHTML = CTX_ICONS[c.key] || ICON;
    b.textContent = c.label; small.textContent = c.sub || '';
    el.setAttribute('aria-label', c.label.replace('…', '').toLowerCase());
    el.setAttribute('aria-disabled', c.state === 'unavailable' ? 'true' : 'false');
    if (c.alt) { now.innerHTML = `${c.alt.label} <small>${c.alt.sub || ''}</small>`; now.setAttribute('aria-label', c.alt.label.toLowerCase()); }
    if ((el.dataset.now === '1') !== !!c.alt) el.dataset.now = c.alt ? '1' : '0';
  }
  function setSide(stickOnRight) { el.dataset.side = stickOnRight ? 'right' : 'left'; }
  setSide(stickRight);
  setState('idle');
  el.dataset.state = 'idle';

  return {
    el, setState, setSide, setContext,
    get state() { return state; },
    get context() { return ctx; },
    setVisible(v) { if (el.hidden !== !v) { el.hidden = !v; showNow(); } },
    get nowShown() { return el.dataset.now === '1'; },
    dispose() { clearInterval(nowTimer); el.remove(); },
  };
}

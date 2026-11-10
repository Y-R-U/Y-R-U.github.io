// D37 AUTO button. Shows what the autopilot will do and toggles it:
//   on     AUTO          the AP is flying        tap → AUTO OFF (the plane is yours, no countdown)
//   hold   AUTO 10       a hand on the controls  tap → AUTO now
//   count  AUTO 7…1      let go, counting down   tap → AUTO now (the AP takes back at 0)
//   off    AUTO OFF      AUTO OFF                tap → AUTO on
// Sits on the stick side: portrait beside LAND (above the stick zone), landscape above LAND (inboard of the stick).
// A tap that changes the state ignores another for 0.45 s (no double-tap flip-flop).
export function createAutoButton({ root, onTap }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'krz-autobtn';
  el.dataset.state = 'on';
  el.hidden = true;
  el.setAttribute('aria-label', 'Autopilot');
  el.innerHTML = '<span class="krz-ab-ring" aria-hidden="true"></span><span class="krz-ab-txt"><b>AUTO</b><small>TAP: OFF</small></span>';
  root.append(el);
  const b = el.querySelector('b'), sm = el.querySelector('small');
  let last = '', guard = 0;
  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = performance.now();
    if (t < guard) return;
    guard = t + 450;
    onTap?.(el.dataset.state);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    el,
    get state() { return el.dataset.state; },
    setVisible(v) { if (el.hidden === !!v) el.hidden = !v; },
    setSide(right) { el.dataset.side = right ? 'right' : 'left'; },
    // a = traffic.autoState(player)
    paint(a) {
      let state, label, sub, p = 1;
      if (a.off) { state = 'off'; label = 'AUTO OFF'; sub = 'TAP: ON'; }
      else if (a.countdown != null) { state = 'count'; label = `AUTO ${Math.max(1, Math.ceil(a.countdown - 1e-6))}`; sub = 'TAP: NOW'; p = Math.max(0, Math.min(1, a.countdown / (a.wait || 10))); }
      else if (a.holding) { state = 'hold'; label = `AUTO ${Math.round(a.wait || 10)}`; sub = 'LET GO'; }
      else { state = 'on'; label = 'AUTO'; sub = 'TAP: OFF'; }
      const k = `${state}|${label}|${Math.round(p * 40)}`;
      if (k === last) return;
      last = k;
      if (el.dataset.state !== state) el.dataset.state = state;
      b.textContent = label; sm.textContent = sub;
      el.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    },
  };
}

// D18 time warp: 1× / 2× / 5× while the autopilot is flying on its own. Never online.
// Stick input, final approach and conflicts cancel the warp (level back to 1×); a radio response window, a mission
// "hold on" moment or a pause only suspend it, and it resumes when they pass.
import { ensureStoryCss } from './dom.js';

export const WARP_LEVELS = [1, 2, 5];
const DROP = { stick: 'You took the controls', final: 'Final approach', conflict: 'Traffic nearby', crash: 'Crashed' };
// short chip text when a tap is refused (LOOPTEST: a tap that silently snapped back to 1× looked broken)
const NO = { stick: 'hands on', final: 'on final', conflict: 'traffic', crash: 'crashed' };
const HOLD = { online: 'Not online', radio: 'Radio', imminent: 'Hold on…', paused: 'Paused', manual: 'Autopilot not flying' };

export function createTimeWarp({ level = 1, onChange } = {}) {
  const W = { level: 1, scale: 1, reason: '', dropped: '', blocked: '', refused: null };
  const emit = () => { try { onChange?.(W); } catch (e) { /* */ } };
  function set(n) {
    const v = WARP_LEVELS.includes(+n) ? +n : 1;
    if (v !== W.level) { W.level = v; W.dropped = ''; emit(); }
    return W.level;
  }
  set(level);
  // s = { online, apFlying, stick, radioWindow, finalApproach, conflict, imminent, paused, crashed }
  function update(s = {}) {
    let reason = '';
    // PLAYTEST_3 #10: why it dropped to 1× shows for a few seconds, not for minutes
    if (W.dropped && Date.now() - (W.droppedAt || 0) > 6000) { W.dropped = ''; emit(); }
    W.blocked = '';
    for (const k of ['stick', 'final', 'conflict', 'crash']) {
      const on = k === 'stick' ? s.stick : k === 'final' ? s.finalApproach : k === 'conflict' ? s.conflict : s.crashed;
      if (on) { reason = DROP[k]; W.blocked = k; if (W.level !== 1) { W.level = 1; W.dropped = reason; W.droppedAt = Date.now(); } break; }
    }
    if (!reason) {
      if (s.online) reason = HOLD.online;
      else if (s.paused) reason = HOLD.paused;
      else if (s.radioWindow) reason = HOLD.radio;
      else if (s.imminent) reason = typeof s.imminent === 'string' ? s.imminent : HOLD.imminent;
      else if (s.apFlying === false) reason = HOLD.manual;
    }
    const scale = reason ? 1 : W.level;
    if (scale !== W.scale || reason !== W.reason) { W.scale = scale; W.reason = reason; emit(); }
    return scale;
  }
  return {
    get level() { return W.level; },
    get scale() { return W.scale; },
    get reason() { return W.reason; },
    get dropped() { return W.dropped; },
    // { why, text, at } of the last refused tap (a cancelling condition was active), else null
    get refused() { return W.refused; },
    set, update,
    cycle() {
      if (W.blocked && W.level === 1) { W.refused = { why: W.blocked, text: NO[W.blocked], at: Date.now() }; emit(); return W.level; }
      W.refused = null;
      return set(WARP_LEVELS[(WARP_LEVELS.indexOf(W.level) + 1) % WARP_LEVELS.length]);
    },
    reset() { W.level = 1; W.scale = 1; W.reason = ''; W.dropped = ''; emit(); },
  };
}

// Derive the warp inputs from the live game objects (main.js names). extra: { online, paused, imminent, radioWindow }
export function warpStateFor({ traffic, player, extra = {} }) {
  if (!player) return { apFlying: false, ...extra };
  const ac = player.ac, ap = player.ap, axis = player.axis;
  const stick = ['aileron', 'elevator', 'rudder'].some((k) => axis[k].mode === 'manual');
  const mode = traffic.modeOf(player);
  const leg = ap?.leg;
  const finalApproach = !ac.onGround && (leg?.kind === 'approach' || !!ap?.landing) && (ac.agl < 220 || ['FINAL', 'FLARE'].includes(ap?.phase));
  let conflict = false;
  for (const e of traffic.list) {
    if (e === player || e.ac.crashed) continue;
    const dx = e.ac.pos.x - ac.pos.x, dy = e.ac.pos.y - ac.pos.y, dz = e.ac.pos.z - ac.pos.z;
    const d = Math.hypot(dx, dz);
    if (ac.onGround && e.ac.onGround) {
      const ahead = (dx * ac.vel.x + dz * ac.vel.z) / Math.max(d, 1);
      if (d < 40 && ahead > 1) { conflict = true; break; }
      continue;
    }
    if (d > 900 || Math.abs(dy) > 150) continue;
    const closing = -((dx * (e.ac.vel.x - ac.vel.x)) + (dz * (e.ac.vel.z - ac.vel.z))) / Math.max(d, 1);
    if (d < 300 || (closing > 0 && d / closing < 25)) { conflict = true; break; }
  }
  const radioWindow = extra.radioWindow ?? (typeof document !== 'undefined' && !!document.querySelector('.krz-r-panel:not([hidden])'));
  return { apFlying: mode === 'AUTOPILOT', stick, finalApproach, conflict, crashed: !!ac.crashed, ...extra, radioWindow };
}

// The small HUD chip: tap cycles 1× → 2× → 5×. Shows why it is held at 1× when the warp is suspended.
export function createWarpToggle({ container = document.body, warp, className = '' } = {}) {
  ensureStoryCss();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `krz-warp ${className}`.trim();
  el.setAttribute('aria-label', 'Time warp');
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor"/></svg><b>1×</b><small></small>';
  const b = el.querySelector('b'), small = el.querySelector('small');
  container.appendChild(el);
  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('click', (e) => {
    e.stopPropagation(); warp.cycle();
    if (warp.refused && Date.now() - warp.refused.at < 100) { el.classList.remove('no'); void el.offsetWidth; el.classList.add('no'); }
    paint();
  });
  let last = '';
  function paint() {
    const held = warp.level > 1 && warp.scale === 1;
    const no = warp.refused && Date.now() - warp.refused.at < 2500 ? warp.refused.text : '';
    const k = `${warp.level}|${warp.scale}|${warp.reason}|${warp.dropped}|${no}`;
    if (k === last) return;
    last = k;
    if (!no) el.classList.remove('no');
    b.textContent = `${warp.level}×`;
    el.dataset.level = warp.level;
    el.dataset.state = no ? 'refused' : warp.level === 1 ? 'off' : held ? 'held' : 'on';
    small.textContent = no ? `Not now · ${no}` : held ? warp.reason : warp.level === 1 && warp.dropped ? warp.dropped : '';
  }
  paint();
  return { el, paint, setVisible(v) { el.hidden = !v; }, dispose() { el.remove(); } };
}

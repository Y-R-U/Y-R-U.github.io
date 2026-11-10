// Desktop mouse aim (Settings › Mouse aim, off by default): War Thunder-style. The mouse moves an aim point in the world,
// the camera looks along it and an "instructor" flies the stick to put the nose there. instruct() is three-free (node:
// tools/controls-sim.mjs). The aim counts as manual flying only while the player is using it: after the mouse rests
// (and the nose is on the aim) it lets go, and D37's AUTO countdown runs like a lifted thumb. Under AUTO OFF it keeps
// flying the aim. Pointer lock on a click on the view; Esc frees the mouse (the browser's own key), so LAND / DEMAND
// can be clicked. No modals.
import { clamp } from './vmath.js';

const DEG = Math.PI / 180;
const SENS = 0.12;            // deg of aim per pixel of mouse travel
const DEAD = 10;              // px of travel (within ~0.6 s) before a resting mouse counts as taking control
const REST = 1.0, REST_MAX = 5, ON_AIM = 4 * DEG;

// world unit vector for a heading (deg, 0 = north = -Z, clockwise) and a pitch (rad, up +)
export function aimVector(hdgDeg, pitch, out = {}) {
  const h = hdgDeg * DEG, c = Math.cos(pitch);
  out.x = Math.sin(h) * c; out.y = Math.sin(pitch); out.z = -Math.cos(h) * c;
  return out;
}
// a world vector in the aircraft's body frame (x right, y up, forward -z): rotate by the inverse of ac.q
export function toBody(q, v, out = {}) {
  const x = -q.x, y = -q.y, z = -q.z, w = q.w;
  const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
  out.x = v.x + w * tx + (y * tz - z * ty); out.y = v.y + w * ty + (z * tx - x * tz); out.z = v.z + w * tz + (x * ty - y * tx);
  return out;
}
export function fromBody(q, v, out = {}) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
  out.x = v.x + w * tx + (y * tz - z * ty); out.y = v.y + w * ty + (z * tx - x * tz); out.z = v.z + w * tz + (x * ty - y * tx);
  return out;
}

const _L = {};
// The instructor: stick commands (aileron +1 roll right, elevator +1 nose up, rudder +1 yaw right) that fly the nose
// onto `aim` (a world unit vector). Far off the aim it rolls the aim over the canopy and pulls (bank-to-turn); within
// ~12° it blends to wings level so a held aim flies straight. Easy/Medium never pull past ~85 % of the stall alpha.
export function instruct(ac, aim, { hard = false } = {}) {
  const L = toBody(ac.q, aim, _L);
  let lx = L.x, ly = L.y;
  const fwd = -L.z, off = Math.acos(clamp(fwd, -1, 1));
  if (fwd < 0.25) { const n = Math.hypot(lx, ly); if (n > 1e-3) { lx /= n; ly /= n; } else { lx = 1; ly = 0; } }
  // jet-borne hover (D35): the stick is a turn / move command there, so the mouse only turns it
  if ((ac.vtol || 0) > 0.5) return { aileron: clamp(lx * 3, -1, 1), elevator: 0, rudder: 0, off };
  if (ac.onGround) {
    return { aileron: clamp(-(ac.bank || 0) * 2, -1, 1), elevator: clamp(ly * 4, -0.3, 1), rudder: clamp(lx * 3, -1, 1), off };
  }
  const infl = clamp(off / (12 * DEG), 0, 1);
  const level = clamp(-(ac.bank || 0) * 1.4, -1, 1);
  let aileron = level + (clamp(lx * 5, -1, 1) - level) * infl;
  // bank soft limit (Easy/Medium 70°, Hard 85°): no more roll into the turn past it, eased back over it
  const lim = (hard ? 85 : 70) * DEG, b = (ac.bank || 0) - (ac.w?.z || 0) * 0.3;   // bank 0.3 s ahead (a fast roller overshoots)
  if (Math.sign(aileron) === Math.sign(b) && Math.abs(b) > lim - 18 * DEG) aileron *= clamp((lim - Math.abs(b)) / (18 * DEG), -0.6, 1);
  let elevator = clamp(ly * 4.5, -0.6, 1);
  const P = ac.P || {};
  if (!hard && P.alphaStall && ac.alpha > P.alphaStall * 0.85) elevator = Math.min(elevator, 0);
  return { aileron, elevator, rudder: clamp(lx * 1.5, -0.6, 0.6), off };
}

// DOM + input side (browser only). getSettings().mouseAim turns it on; fine pointers only.
export function createMouseAim({ canvas, overlay, getSettings, isPlaying }) {
  const fine = () => { try { return matchMedia('(any-pointer: fine)').matches; } catch (e) { return false; } };
  const S = { hdg: 0, pitch: 0, engaged: false, lastMove: -1e9, acc: 0, accT: 0, locked: false, zoom: 1, seenAc: null, wantFirst: true };
  const now = () => performance.now() / 1000;
  const el = document.createElement('div');
  el.className = 'krz-maim';
  el.hidden = true;
  el.innerHTML = '<div class="krz-maim-aim"></div><div class="krz-maim-nose"></div><div class="krz-maim-tip">CLICK THE VIEW TO AIM WITH THE MOUSE · ESC FREES IT</div>';
  overlay.append(el);
  const aimEl = el.querySelector('.krz-maim-aim'), noseEl = el.querySelector('.krz-maim-nose'), tipEl = el.querySelector('.krz-maim-tip');
  const on = () => !!getSettings?.().mouseAim && fine();

  document.addEventListener('pointerlockchange', () => {
    const was = S.locked;
    S.locked = document.pointerLockElement === canvas; el.dataset.locked = S.locked ? '1' : '';
    if (was && !S.locked) S.unlockedAt = now();
  });
  // Esc only frees the mouse: it must not also open Settings (ui's Esc = pause) on the way out of the lock
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !on()) return;
    if (S.locked || now() - (S.unlockedAt ?? -1e9) < 1) { e.preventDefault(); if (S.locked) api.unlock(); }
  }, { capture: true });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !on() || !isPlaying?.() || S.locked) return;
    try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch (er) { /* no lock: the mouse stays a pointer */ }
  });
  document.addEventListener('mousemove', (e) => {
    if (!S.locked || !on()) return;
    const dx = e.movementX || 0, dy = e.movementY || 0, t = now();
    if (!S.engaged) {
      if (t - S.accT > 0.6) S.acc = 0;
      S.acc += Math.abs(dx) + Math.abs(dy); S.accT = t;
      if (S.acc < DEAD) return;
      S.engaged = true; S.acc = 0;
    }
    S.hdg = (S.hdg + dx * SENS + 360) % 360;
    S.pitch = clamp(S.pitch - dy * SENS * DEG, -75 * DEG, 75 * DEG);
    S.lastMove = t;
  });
  addEventListener('wheel', (e) => {
    if (!on() || !isPlaying?.() || e.target?.closest?.('.kz-pop,.krz-r-panel,[class*="sheet"]')) return;
    S.zoom = clamp(S.zoom * Math.exp(Math.sign(e.deltaY) * 0.12), 0.55, 2.4);
  }, { passive: true });

  const aim = {};
  const api = {
    el, state: S,
    get enabled() { return on(); },
    get engaged() { return on() && S.engaged; },
    get zoom() { return on() ? S.zoom : 1; },
    aimDir() { return aimVector(S.hdg, S.pitch, aim); },
    // a new flight / respawn: the aim starts on the nose
    reset() { S.engaged = false; S.acc = 0; S.zoom = 1; S.wantFirst = true; },
    release() { S.engaged = false; S.acc = 0; },
    // AUTO OFF with the mouse: keep flying where the nose points now (the aim already tracks it)
    hold() { S.engaged = true; S.lastMove = now(); },
    unlock() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* */ } },
    // per frame: manual stick axes from the instructor, or null (the AP / AUTO countdown has it)
    update(dt, ac, { autoOff = false, hard = false } = {}) {
      if (!on() || !ac) { if (S.locked) api.unlock(); S.engaged = false; return null; }
      if (!S.engaged) {
        // follow where the aeroplane is going, so the next mouse move starts from the nose
        const v = ac.vel, sp = Math.hypot(v.x, v.y, v.z);
        const h = sp > 12 ? (Math.atan2(v.x, -v.z) / DEG + 360) % 360 : ac.heading;
        const p = sp > 12 ? Math.asin(clamp(v.y / sp, -1, 1)) : ac.pitch || 0;
        const k = S.wantFirst ? 1 : 1 - Math.exp(-dt * 6);
        S.hdg = (S.hdg + (((h - S.hdg + 540) % 360) - 180) * k + 360) % 360; S.pitch += (p - S.pitch) * k; S.wantFirst = false;
        return null;
      }
      const out = instruct(ac, api.aimDir(), { hard });
      const rest = now() - S.lastMove;
      if (!autoOff && (rest > REST_MAX || (rest > REST && out.off < ON_AIM))) { S.engaged = false; return null; }
      return out;
    },
    // screen points (or null when behind the camera) for the aim and the nose
    paint(aimPt, nosePt, playing) {
      const show = on() && playing;
      if (el.hidden === show) el.hidden = !show;
      if (!show) return;
      el.dataset.engaged = S.engaged ? '1' : '';
      tipEl.hidden = S.locked;
      const put = (n, p) => { if (!p) { n.hidden = true; return; } n.hidden = false; n.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`; };
      put(aimEl, aimPt); put(noseEl, nosePt);
    },
  };
  return api;
}

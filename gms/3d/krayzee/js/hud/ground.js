// D21 DEMAND TAKEOFF + D22 Skip to runway: ground-only buttons in the bottom action slot.
// D19: Free Flight difficulty + aircraft chips, parked before the first take-off only, up in the top band out of the flight view.
// Any chip tap (even the selected one) or any flight control touch/key fades the whole set for this flight (Aaron, HUD4).
import { aircraftLockText } from '../ui/index.js';
import { HANGAR, SHORT } from '../ui/aircraft.js';
import { rects, slotX, startedOn } from './place.js';

const LOCK = '<svg viewBox="0 0 10 12" aria-hidden="true"><rect x="1" y="5" width="8" height="6.5" rx="1.3" fill="currentColor"/><path d="M3 5V3.4a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const lockOf = (a) => { try { return aircraftLockText(a); } catch (e) { return ''; } };
const FLIGHT = '.krz-stick-zone, .krz-thr-col, .krz-pad, .krz-gbtn, .krz-land';
const FLIGHT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyB', 'Equal', 'Minus', 'KeyF', 'KeyT']);
const AVOID = ['.krz-score', '.krz-top-l', '.krz-top-r', '#krz-hud', '.krz-r-tower', '.krz-warp', '.krz-r-subs', '.krz-r-btn', '.krz-land', '.krz-stick-base',
  '.krz-thr', '.krz-pad', '.krz-ground', '.krz-finish', '.krz-st-coach', '.krz-court', '.krz-net', '.krz-coach.in .krz-coach-bub'];

export function createGroundButtons(root, { chipRoot = root, onTakeoff, onSkip, onDifficulty, onAircraft, lockText = lockOf } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-ground';
  el.hidden = true;
  el.innerHTML = `<div class="krz-ground-row"><button type="button" class="krz-gbtn krz-gbtn-to" data-g="takeoff"><b>DEMAND TAKEOFF</b><small>Queue? How quaint.</small></button>
    <button type="button" class="krz-gbtn krz-gbtn-skip" data-g="skip"><b>SKIP TO RUNWAY</b></button></div>`;
  root.append(el);
  const chips = document.createElement('div');
  chips.className = 'krz-chips';
  chips.hidden = true;
  chips.innerHTML = `<div class="krz-diff" data-g="diff" hidden><span>DIFFICULTY</span><button type="button" data-d="easy">Easy</button><button type="button" data-d="medium">Medium</button><button type="button" data-d="hard">Hard</button></div>
    <div class="krz-diff krz-plane" data-g="plane" hidden><span>AIRCRAFT</span>${HANGAR.map((a) => `<button type="button" data-a="${a}">${SHORT[a]}</button>`).join('')}</div>
    <div class="krz-plane-why" data-g="why" hidden></div>`;
  chipRoot.append(chips);
  const to = el.querySelector('[data-g="takeoff"]'), skip = el.querySelector('[data-g="skip"]'), diff = chips.querySelector('[data-g="diff"]');
  const stop = (e) => e.stopPropagation();
  el.addEventListener('pointerdown', stop);
  chips.addEventListener('pointerdown', stop);
  // the buttons slide when DEMAND IT shows or goes above them: a tap within 0.5 s of that was aimed at what used to be there
  let movedAt = -1e9, lastY = null;
  const fresh = (e) => e.detail && performance.now() - movedAt < 500;
  to.addEventListener('click', (e) => { e.stopPropagation(); if (startedOn(to, e) && !fresh(e)) onTakeoff?.(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); if (startedOn(skip, e) && !fresh(e)) onSkip?.(); });
  const plane = chips.querySelector('[data-g="plane"]'), why = chips.querySelector('[data-g="why"]');
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
    place();
    requestAnimationFrame(() => why.classList.add('in'));
    b.classList.remove('nope'); b.getBoundingClientRect(); b.classList.add('nope');
    clearTimeout(whyT);
    whyT = setTimeout(() => { why.classList.remove('in'); setTimeout(() => { if (!why.classList.contains('in')) why.hidden = true; }, 220); }, 2600);
  }

  // dismissed: faded for this flight; held through the quit/replay an aircraft pick causes (carryUntil)
  let dismissed = '', carryUntil = 0, fadeT = 0, placeAt = 0, last = '';
  const chipsOn = () => !chips.hidden && !dismissed;
  function dismiss(why) {
    if (!chipsOn()) return;
    dismissed = why;
    chips.classList.add('gone');
    clearTimeout(fadeT);
    fadeT = setTimeout(() => { if (dismissed) chips.hidden = true; }, 360);
  }
  document.addEventListener('pointerdown', (e) => { if (chipsOn() && e.target?.closest?.(FLIGHT)) dismiss('control'); }, true);
  addEventListener('keydown', (e) => {
    if (!chipsOn() || e.repeat || !FLIGHT_KEYS.has(e.code) || e.target?.closest?.('input,textarea,select,[contenteditable]')) return;
    dismiss('key');
  }, true);

  plane.addEventListener('click', (e) => {
    const b = e.target.closest('button'), a = b?.dataset.a;
    if (!a) return;
    e.stopPropagation();
    paintLocks();
    if (b.dataset.locked) return explain(b);
    const change = b.getAttribute('aria-pressed') !== 'true';
    dismiss('pick');
    if (change) { carryUntil = performance.now() + 4000; onAircraft?.(a); }
  });
  diff.addEventListener('click', (e) => {
    const b = e.target.closest('button'), d = b?.dataset.d;
    if (!d) return;
    e.stopPropagation();
    const change = b.getAttribute('aria-pressed') !== 'true';
    dismiss('pick');
    if (change) onDifficulty?.(d);
  });

  // Top band, out of the flight view: portrait under the subtitles, landscape the top-left corner under the score.
  function place() {
    const W = innerWidth, H = innerHeight, port = H > W;
    chips.classList.toggle('stack', !port);
    const w = chips.offsetWidth, h = chips.offsetHeight;
    if (!w) return;
    const obs = rects(AVOID, 64);
    const ys = [...new Set(obs.filter((r) => r.top < H * 0.45).map((r) => Math.round(r.bottom + 8)))].filter((y) => y + h < H - 8).sort((a, b) => a - b);
    const lo = 8, hi = W - 8, want = port ? (W - w) / 2 : lo;
    let x = null, y = 0;
    for (y of ys) if ((x = slotX(obs, y, w, h, want, lo, hi)) !== null) break;
    if (x === null) { x = (W - w) / 2; y = Math.max(...obs.filter((r) => r.top < H * 0.3).map((r) => r.bottom), 60) + 8; }
    chips.style.left = `${Math.round(x)}px`; chips.style.top = `${Math.round(y)}px`;
  }
  addEventListener('resize', () => { placeAt = 0; });

  return {
    el, chips,
    set({ takeoff = false, skip: sk = false, difficulty = null, aircraft = null } = {}) {
      const offered = !!(difficulty || aircraft);
      if (!offered && dismissed && performance.now() > carryUntil) { dismissed = ''; chips.classList.remove('gone'); }
      const k = `${takeoff}|${sk}|${difficulty}|${aircraft}|${dismissed}`;
      if (k !== last) {
        last = k;
        to.hidden = !takeoff; skip.hidden = !sk; diff.hidden = !difficulty;
        for (const b of diff.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.d === difficulty));
        if (aircraft && plane.hidden) paintLocks();
        plane.hidden = !aircraft;
        if (!aircraft) { why.hidden = true; why.classList.remove('in'); }
        for (const b of plane.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.a === aircraft));
        el.hidden = !takeoff && !sk;
        if (!dismissed) { const was = chips.hidden; chips.hidden = !offered; if (was && offered) placeAt = 0; }
      }
      const now = performance.now();
      const y = el.hidden ? null : Math.round(el.getBoundingClientRect().top);
      if (y !== lastY) { lastY = y; movedAt = now; }
      if (chipsOn() && now > placeAt) { placeAt = now + 250; place(); }
    },
    get state() { const on = chipsOn(); return { takeoff: !to.hidden && !el.hidden, skip: !skip.hidden && !el.hidden, difficulty: diff.hidden || !on ? null : diff.querySelector('[aria-pressed="true"]')?.dataset.d, aircraft: plane.hidden || !on ? null : plane.querySelector('[aria-pressed="true"]')?.dataset.a,
      locked: [...plane.querySelectorAll('button[data-locked]')].map((b) => b.dataset.a), why: why.hidden ? '' : why.textContent, dismissed }; },
    get chipsOn() { return chipsOn(); },
    rearm() { dismissed = ''; carryUntil = 0; chips.classList.remove('gone'); last = ''; },
    refreshLocks: paintLocks,
  };
}

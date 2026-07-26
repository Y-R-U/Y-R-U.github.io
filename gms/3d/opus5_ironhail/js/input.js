// Raw input, unified across mouse and touch. The reticle is a screen-space
// point both schemes drive: the mouse sets it directly, a thumb drag on the
// right of the screen nudges it. Everything downstream only reads `input`.

import * as THREE from 'three';
import { IS_TOUCH } from './config.js';
import { clamp } from './utils.js';
import { AudioFX } from './audio.js';

export const input = {
  keys: {},
  move: new THREE.Vector2(0, 0),      // -1..1 screen-space drive vector
  aim: new THREE.Vector2(0, 0.06),    // NDC reticle position
  fire: false,
  joyActive: false,
  aimActive: false,
  zoomDelta: 0,
  pinchZoom: 0,
  actions: new Set(),                 // one-shot presses, drained by consume()
  aimSpeedMul: 1,
};

export function press(action) { input.actions.add(action); }
export function consume(action) {
  if (!input.actions.has(action)) return false;
  input.actions.delete(action);
  return true;
}
export function clearActions() { input.actions.clear(); }

let joyId = null, aimId = null;
let joyOrigin = { x: 0, y: 0 };
const pinch = { a: null, b: null, dist: 0 };
let sens = 1;
let aimSide = 'right';      // which half of the screen the aiming thumb owns
let invertY = false;

export function setSensitivity(s) { sens = s; }
export function setAimSide(side) { aimSide = side === 'left' ? 'left' : 'right'; }
export function setInvertY(on) { invertY = !!on; }
export function getAimSide() { return aimSide; }

// The drive stick keeps the outer 44% of its side; everything else — including
// the middle of the screen — belongs to the aiming thumb, because a reticle
// drag that runs out of room mid-sweep is worse than a stick that does.
function isDriveZone(clientX) {
  const frac = clientX / window.innerWidth;
  return aimSide === 'right' ? frac < 0.44 : frac > 0.56;
}

const KEY_ACTIONS = {
  KeyQ: 'drone', Tab: 'scope', KeyE: 'util', KeyF: 'mark', KeyR: 'recall',
  KeyM: 'mute', Escape: 'pause', KeyP: 'pause', KeyC: 'camera',
  Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3',
};

export function initInput(dom) {
  // ---- keyboard --------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    input.keys[e.code] = true;
    if (e.code === 'Space') { input.fire = true; e.preventDefault(); }
    if (e.code === 'Tab') e.preventDefault();
    const a = KEY_ACTIONS[e.code];
    if (a && !e.repeat) press(a);
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    if (e.code === 'Space') input.fire = false;
  });

  // ---- mouse -----------------------------------------------------------
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    input.aim.x = (e.clientX / window.innerWidth) * 2 - 1;
    input.aim.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  dom.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) press('util');
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) input.fire = false;
  });
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    input.zoomDelta += Math.sign(e.deltaY) * 0.09;
  }, { passive: true });

  // ---- touch: one side drives, the other aims (swappable in Settings) ---
  dom.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const driveSide = isDriveZone(t.clientX);
      if (driveSide && joyId === null) {
        joyId = t.identifier;
        joyOrigin = { x: t.clientX, y: t.clientY };
        input.joyActive = true;
        input.move.set(0, 0);
      } else if (!driveSide && aimId === null) {
        aimId = t.identifier;
        input.aimActive = true;
      }
    }
    if (e.touches.length === 2) {
      pinch.a = e.touches[0];
      pinch.b = e.touches[1];
      pinch.dist = Math.hypot(pinch.a.clientX - pinch.b.clientX, pinch.a.clientY - pinch.b.clientY);
    }
    e.preventDefault();
  }, { passive: false });

  dom.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        const dx = t.clientX - joyOrigin.x;
        const dy = t.clientY - joyOrigin.y;
        const max = Math.min(72, window.innerWidth * 0.14);
        const len = Math.hypot(dx, dy);
        const k = len > max ? max / len : 1;
        input.move.set((dx * k) / max, (dy * k) / max);
        setJoyVisual(joyOrigin.x, joyOrigin.y, dx * k, dy * k);
      } else if (t.identifier === aimId) {
        const prev = aimPrev[t.identifier];
        if (prev) {
          const k = 2.6 * sens * input.aimSpeedMul;
          const sx = (t.clientX - prev.x) / window.innerWidth * k;
          const sy = -(t.clientY - prev.y) / window.innerHeight * k;
          input.aim.x = clamp(input.aim.x + sx, -0.96, 0.96);
          input.aim.y = clamp(input.aim.y + (invertY ? -sy : sy), -0.6, 0.9);
        }
        aimPrev[t.identifier] = { x: t.clientX, y: t.clientY };
      }
      if (!aimPrev[t.identifier]) aimPrev[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
      if (pinch.dist) input.pinchZoom += (pinch.dist - d) * 0.004;
      pinch.dist = d;
    }
    e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        input.joyActive = false;
        input.move.set(0, 0);
        hideJoyVisual();
      }
      if (t.identifier === aimId) {
        aimId = null;
        input.aimActive = false;
      }
      delete aimPrev[t.identifier];
    }
    if (e.touches.length < 2) pinch.dist = 0;
  };
  dom.addEventListener('touchend', endTouch);
  dom.addEventListener('touchcancel', endTouch);

  // audio unlock on the first gesture
  const unlock = () => { AudioFX.init(); AudioFX.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchstart', unlock);
  window.addEventListener('keydown', unlock);
}

const aimPrev = {};

// ---------------------------------------------------------------------------
// Floating joystick visual (created lazily so index.html stays lean)
// ---------------------------------------------------------------------------

let joyEl = null, knobEl = null;

function ensureJoyVisual() {
  if (joyEl) return;
  joyEl = document.createElement('div');
  joyEl.id = 'joy-base';
  knobEl = document.createElement('div');
  knobEl.id = 'joy-knob';
  joyEl.appendChild(knobEl);
  document.body.appendChild(joyEl);
}

function setJoyVisual(ox, oy, dx, dy) {
  if (!IS_TOUCH) return;
  ensureJoyVisual();
  joyEl.style.display = 'block';
  joyEl.style.left = ox + 'px';
  joyEl.style.top = oy + 'px';
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

function hideJoyVisual() {
  if (joyEl) joyEl.style.display = 'none';
}

// Keyboard drive vector, folded in by the player controller.
export function keyboardMove(out) {
  let x = 0, y = 0;
  if (input.keys.KeyW || input.keys.ArrowUp) y -= 1;
  if (input.keys.KeyS || input.keys.ArrowDown) y += 1;
  if (input.keys.KeyA || input.keys.ArrowLeft) x -= 1;
  if (input.keys.KeyD || input.keys.ArrowRight) x += 1;
  out.set(x, y);
  return out;
}

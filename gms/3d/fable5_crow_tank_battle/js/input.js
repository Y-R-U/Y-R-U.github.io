// Raw input state: keyboard, mouse, touch joystick + fire button.

import * as THREE from 'three';
import { $ } from './utils.js';
import { AudioFX } from './audio.js';

export const input = {
  keys: {},
  mouse: new THREE.Vector2(0, 0),     // NDC
  firing: false,
  joy: new THREE.Vector2(),
  joyActive: false,
  touchFiring: false,
  taps: [],                           // pending battlefield taps {x, y}
};

export function initInput(rendererDom, { onToggleMute }) {
  window.addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
    if (e.code === 'Space') { input.firing = true; e.preventDefault(); }
    if (e.code === 'KeyM') onToggleMute();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    if (e.code === 'Space') input.firing = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    input.mouse.x = (e.clientX / innerWidth) * 2 - 1;
    input.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    const ch = $('crosshair');
    ch.style.left = e.clientX + 'px';
    ch.style.top = e.clientY + 'px';
  });

  rendererDom.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    input.firing = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    input.firing = false;
  });

  // Floating touch joystick: the base jumps to wherever the thumb lands in the
  // left zone. Only the first finger owns it; a second finger can't steal it.
  const zone = $('touch-left');
  const knob = $('joystick-knob');
  const base = $('joystick-base');
  const MAX = 50;
  const DEAD = 0.14;              // fraction of MAX ignored around the centre
  let touchId = null;
  let cx = 0, cy = 0;

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const zr = zone.getBoundingClientRect();
    const half = base.offsetWidth / 2;
    const x = Math.max(zr.left + half, Math.min(zr.right - half, t.clientX));
    const y = Math.max(zr.top + half, Math.min(zr.bottom - half, t.clientY));
    base.style.left = (x - zr.left - half) + 'px';
    base.style.top = (y - zr.top - half) + 'px';
    base.style.bottom = 'auto';
    base.classList.add('active');
    cx = x; cy = y;
    input.joyActive = true;
    input.joy.set(0, 0);
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      const k = len > MAX ? MAX / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const mag = Math.min(1, len / MAX);
      if (mag < DEAD) { input.joy.set(0, 0); continue; }
      const out = (mag - DEAD) / (1 - DEAD);
      input.joy.set((dx / len) * out, (dy / len) * out);
    }
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      touchId = null;
      input.joyActive = false;
      input.joy.set(0, 0);
      knob.style.transform = 'translate(0,0)';
      base.style.left = base.style.top = base.style.bottom = '';
      base.classList.remove('active');
    }
  };
  zone.addEventListener('touchend', end);
  zone.addEventListener('touchcancel', end);

  const fireBtn = $('touch-fire');
  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.touchFiring = true;
  }, { passive: false });
  fireBtn.addEventListener('touchend', () => { input.touchFiring = false; });
  fireBtn.addEventListener('touchcancel', () => { input.touchFiring = false; });

  // Short taps on the battlefield pick a target (consumed by PlayerController).
  const tapStart = new Map();
  rendererDom.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      tapStart.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now() });
    }
  }, { passive: true });
  rendererDom.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      const s = tapStart.get(t.identifier);
      tapStart.delete(t.identifier);
      if (!s) continue;
      if (performance.now() - s.t < 350 && Math.hypot(t.clientX - s.x, t.clientY - s.y) < 16) {
        input.taps.push({ x: t.clientX, y: t.clientY });
      }
    }
  }, { passive: true });

  // Audio unlock. Android only grants user activation on touchend/click (not
  // pointerdown/touchstart), so listen on all of them for the page lifetime.
  const unlock = () => { AudioFX.init(); AudioFX.resume(); };
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
}

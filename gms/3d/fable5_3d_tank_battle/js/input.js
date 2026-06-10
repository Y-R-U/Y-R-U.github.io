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

  // touch joystick
  const zone = $('touch-left');
  const knob = $('joystick-knob');
  const base = $('joystick-base');
  let touchId = null;
  let cx = 0, cy = 0;

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    input.joyActive = true;
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      const max = 50;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      input.joy.set((dx * k) / max, (dy * k) / max);
    }
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      touchId = null;
      input.joyActive = false;
      input.joy.set(0, 0);
      knob.style.transform = 'translate(0,0)';
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

  // audio unlock on first gesture
  const unlock = () => { AudioFX.init(); AudioFX.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

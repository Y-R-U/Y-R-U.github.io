import { h } from './util.js';
import * as I from './icons.js';

// Touch controls: fixed joystick bottom-left, look-drag anywhere else (not on a button), Jump / Scratch / Interact.
// Each pointer is tracked independently so joystick + look + buttons all work together.
export function createTouch(ui) {
  const controls = ui.controls;
  const knob = h('div.joy-knob');
  const base = h('div.joy-base', {}, h('div.joy-ring'), knob);
  const joy = h('div.joy-zone', {}, base);
  const look = h('div.look-layer');

  const jumpBtn = h('button.act-btn.btn-jump', { 'aria-label': 'Jump' }, h('span.act-ico', { html: I.jump() }), h('span.act-label', {}, 'Jump'));
  const scratchBtn = h('button.act-btn.btn-scratch', { 'aria-label': 'Scratch' }, h('span.act-ico', { html: I.claw() }), h('span.act-label', {}, 'Scratch'));
  const interactLbl = h('span.act-label', {}, '');
  const interactIco = h('span.act-ico', { html: I.hand() });
  const interactBtn = h('button.act-btn.btn-interact', { 'aria-label': 'Interact' }, interactIco, interactLbl);

  const el = h('div.touch-ui', {}, look, joy, jumpBtn, scratchBtn, interactBtn);

  let joyId = null, cx = 0, cy = 0, rad = 60;
  joy.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    e.preventDefault();
    joyId = e.pointerId;
    joy.setPointerCapture?.(e.pointerId);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2; rad = r.width * 0.42;
    base.classList.add('active');
    moveJoy(e);
  });
  function moveJoy(e) {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > rad) { dx *= rad / d; dy *= rad / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let x = dx / rad, y = -dy / rad;
    const m = Math.hypot(x, y);
    if (m < 0.12) { x = 0; y = 0; }
    controls.move.x = x; controls.move.y = y;
  }
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null; controls.move.x = 0; controls.move.y = 0;
    knob.style.transform = '';
    base.classList.remove('active');
  };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);
  joy.addEventListener('lostpointercapture', endJoy);

  const lookers = new Map();
  look.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    look.setPointerCapture?.(e.pointerId);
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
  });
  look.addEventListener('pointermove', (e) => {
    const p = lookers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
    controls._look.dx += dx; controls._look.dy += dy;
  });
  const endLook = (e) => {
    const p = lookers.get(e.pointerId);
    if (!p) return;
    lookers.delete(e.pointerId);
    if (p.moved < 14 && performance.now() - p.t < 350) ui.emit('tap', { x: e.clientX, y: e.clientY });
  };
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  function holdBtn(btn, down, up) {
    const ids = new Set();
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.setPointerCapture?.(e.pointerId);
      const first = ids.size === 0;
      ids.add(e.pointerId);
      btn.classList.add('is-pressed');
      if (first) down?.();
    });
    const rel = (e) => {
      if (!ids.delete(e.pointerId)) return;
      if (ids.size === 0) { btn.classList.remove('is-pressed'); up?.(); }
    };
    btn.addEventListener('pointerup', rel);
    btn.addEventListener('pointercancel', rel);
    btn.addEventListener('lostpointercapture', rel);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdBtn(jumpBtn, () => { controls.jumpHeld = true; ui.emit('jump'); }, () => { controls.jumpHeld = false; ui.emit('jumpUp'); });
  holdBtn(scratchBtn, () => {
    scratchBtn.classList.remove('swipe'); void scratchBtn.offsetWidth; scratchBtn.classList.add('swipe');
    ui.emit('scratch');
  }, () => ui.emit('scratchUp'));
  holdBtn(interactBtn, () => ui.emit('interact'), () => ui.emit('interactUp'));

  function setInteract(label) {
    if (label && label !== interactLbl.textContent) {
      interactLbl.textContent = label;
      interactIco.innerHTML = /eat|gobble|chomp|munch/i.test(label) ? I.forkKnife() : I.hand();
    }
    interactBtn.classList.toggle('show', !!label);
  }
  function reset() {
    joyId = null; lookers.clear();
    controls.move.x = 0; controls.move.y = 0; controls.jumpHeld = false;
    knob.style.transform = ''; base.classList.remove('active');
    for (const b of [jumpBtn, scratchBtn, interactBtn]) b.classList.remove('is-pressed');
  }
  return { el, setInteract, reset, buttons: { joystick: joy, jump: jumpBtn, scratch: scratchBtn, interact: interactBtn } };
}

// Keyboard + mouse + touch merged with ui.controls. Produces one frame-snapshot per update.
const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput({ canvas, ui, camera }) {
  const keys = new Set();
  const pending = { jump: false, jumpUp: false, scratch: false, interact: false, pause: false, any: false, click: null };
  let jumpHeldUi = false, interactHeldUi = false;
  const look = { dx: 0, dy: 0 };
  const listeners = new Map();
  const emit = (n, d) => listeners.get(n)?.forEach((f) => f(d));

  const input = {
    enabled: true,
    move: { x: 0, y: 0 },
    jumpPressed: false, jumpHeld: false, scratch: false, interact: false, any: false,
    lastInputTime: performance.now(),
    on(n, f) { (listeners.get(n) || listeners.set(n, new Set()).get(n)).add(f); return () => listeners.get(n).delete(f); },
    // interact.current decides whether Space means interact or jump (D9).
    hasInteractable: () => false,
    pickInteractable: () => null,     // (clientX, clientY) → interactable near that screen point, or null
    poll,
    clear() { keys.clear(); for (const k in pending) pending[k] = k === 'click' ? null : false; },
  };

  const typing = (e) => /input|textarea|select/i.test(e.target?.tagName || '');
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    input.lastInputTime = performance.now();
    pending.any = true;
    emit('anykey', e);
    if (e.repeat) { if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault(); return; }
    keys.add(e.code);
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (input.hasInteractable()) pending.interact = true; else pending.jump = true;
        break;
      case 'KeyJ': case 'KeyK': pending.scratch = true; break;
      case 'KeyE': case 'KeyF': case 'Enter': pending.interact = true; break;
      case 'Escape': case 'KeyP': pending.pause = true; emit('pause'); break;
    }
    if (MOVE_KEYS[e.code]) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') pending.jumpUp = true;
  });
  window.addEventListener('blur', () => keys.clear());

  // Mouse: left/right drag = look; a short left click = interact on a highlighted target, else Scratch.
  let drag = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    input.lastInputTime = performance.now();
    pending.any = true;
    emit('anypointer', e);
    if (e.pointerType === 'touch' && ui?.controls?.consumeLook) {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), btn: 0, touch: true, noLook: true };
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), btn: e.button, touch: e.pointerType === 'touch' };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.noLook) { look.dx += e.clientX - drag.x; look.dy += e.clientY - drag.y; }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const up = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy), dur = performance.now() - drag.t;
    if (drag.btn === 0 && moved < 10 && dur < 350) {
      const hit = input.pickInteractable(e.clientX, e.clientY);
      if (hit) pending.interact = true;
      else if (!drag.touch) pending.scratch = true;
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { if (drag?.id === e.pointerId) drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); camera?.zoom(e.deltaY); }, { passive: false });

  if (ui?.on) {
    ui.on('jump', () => { pending.any = true; jumpHeldUi = true; if (input.hasInteractable() && ui.controls?.jumpInteracts) pending.interact = true; else pending.jump = true; });
    ui.on('jumpUp', () => { jumpHeldUi = false; pending.jumpUp = true; });
    ui.on('scratch', () => { pending.any = true; pending.scratch = true; });
    ui.on('interact', () => { pending.any = true; pending.interact = true; interactHeldUi = true; });
    ui.on('interactUp', () => { interactHeldUi = false; });
  }

  function poll() {
    let x = 0, y = 0;
    for (const k of keys) { const m = MOVE_KEYS[k]; if (m) { x += m[0]; y += m[1]; } }
    const um = ui?.controls?.move;
    if (um && (Math.abs(um.x) > 0.01 || Math.abs(um.y) > 0.01)) { x += um.x; y += um.y; pending.any = true; input.lastInputTime = performance.now(); }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    input.move.x = x; input.move.y = y;
    if (len > 0.01) input.lastInputTime = performance.now();

    const ul = ui?.controls?.consumeLook?.();
    if (ul) { look.dx += ul.dx || 0; look.dy += ul.dy || 0; }

    input.jumpPressed = pending.jump;
    // UI buttons that never send jumpUp still get full jumps.
    input.jumpHeld = keys.has('Space') || jumpHeldUi || (pending.jump && !pending.jumpUp);
    if (pending.jumpUp) jumpHeldUi = false;
    input.scratch = pending.scratch;
    input.interact = pending.interact;
    // held Interact (Ch2 L9 "hold to glare"): E/F/Enter, Space, or the touch Interact button
    input.interactHeld = keys.has('KeyE') || keys.has('KeyF') || keys.has('Enter') || keys.has('Space') || interactHeldUi;
    input.any = pending.any || len > 0.01;
    input.look = { dx: look.dx, dy: look.dy };
    look.dx = 0; look.dy = 0;
    for (const k in pending) pending[k] = k === 'click' ? null : false;
    if (!input.enabled) {
      input.move.x = input.move.y = 0;
      input.jumpPressed = input.scratch = input.interact = false;
    }
    return input;
  }
  return input;
}

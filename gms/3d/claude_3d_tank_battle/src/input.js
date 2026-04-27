// Input system: keyboard, mouse, touch joystick.

export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export function createInput(canvas) {
  const state = {
    keys: new Set(),
    mouse: { x: 0, y: 0, hasMoved: false },
    firing: false,
    joystick: { x: 0, y: 0, active: false },
  };

  // Keyboard
  addEventListener('keydown', (e) => {
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
         'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    state.keys.add(e.code);
    if (e.code === 'Space') state.firing = true;
  });
  addEventListener('keyup', (e) => {
    state.keys.delete(e.code);
    if (e.code === 'Space') state.firing = false;
  });

  // Mouse
  addEventListener('mousemove', (e) => {
    state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
    state.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    state.mouse.hasMoved = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.firing = true;
  });
  addEventListener('mouseup', () => { state.firing = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch joystick + fire
  if (isTouch) wireTouch(state);

  return state;
}

function wireTouch(state) {
  const joystickBase = document.getElementById('joystick-base');
  const joystickKnob = document.getElementById('joystick-knob');
  const touchFire = document.getElementById('touch-fire');
  let joyId = null;
  let joyStart = { x: 0, y: 0 };

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const rect = joystickBase.getBoundingClientRect();
    joyStart.x = rect.left + rect.width / 2;
    joyStart.y = rect.top + rect.height / 2;
    state.joystick.active = true;
  });

  const joyMove = (e) => {
    if (joyId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const dx = t.clientX - joyStart.x;
      const dy = t.clientY - joyStart.y;
      const max = 55;
      const len = Math.sqrt(dx * dx + dy * dy);
      const kx = len > max ? (dx / len) * max : dx;
      const ky = len > max ? (dy / len) * max : dy;
      joystickKnob.style.transform = `translate(${kx - 30}px, ${ky - 30}px)`;
      state.joystick.x = kx / max;
      state.joystick.y = ky / max;
      break;
    }
  };
  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
        state.joystick.x = 0;
        state.joystick.y = 0;
        state.joystick.active = false;
      }
    }
  };
  joystickBase.addEventListener('touchmove', joyMove, { passive: false });
  joystickBase.addEventListener('touchend', joyEnd);
  joystickBase.addEventListener('touchcancel', joyEnd);

  touchFire.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.firing = true;
  });
  touchFire.addEventListener('touchend', (e) => {
    e.preventDefault();
    state.firing = false;
  });
  touchFire.addEventListener('touchcancel', () => { state.firing = false; });
}

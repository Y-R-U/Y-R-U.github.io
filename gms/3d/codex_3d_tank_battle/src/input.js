import * as THREE from 'three';

export function createInput(canvas, elements) {
  const state = {
    keys: new Set(),
    pointer: new THREE.Vector2(0, 0),
    move: new THREE.Vector3(),
    firePressed: false,
    fireHeld: false,
    stickPointer: null,
    stickCenter: { x: 0, y: 0 },
    lastPointerKind: 'mouse'
  };

  window.addEventListener('keydown', (event) => {
    state.keys.add(event.code);
    if (event.code === 'Space') {
      state.firePressed = true;
      state.fireHeld = true;
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
    if (event.code === 'Space') state.fireHeld = false;
  });

  window.addEventListener('pointermove', (event) => {
    if (state.stickPointer === event.pointerId) return;
    setPointer(event.clientX, event.clientY);
    state.lastPointerKind = event.pointerType || 'mouse';
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') {
      setPointer(event.clientX, event.clientY);
      state.firePressed = true;
      state.fireHeld = true;
    }
  });

  window.addEventListener('pointerup', () => {
    state.fireHeld = false;
  });

  elements.fireButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.firePressed = true;
    state.fireHeld = true;
  });

  elements.fireButton.addEventListener('pointerup', () => {
    state.fireHeld = false;
  });

  elements.stickZone.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.stickPointer = event.pointerId;
    elements.stickZone.setPointerCapture(event.pointerId);
    const rect = elements.stickZone.getBoundingClientRect();
    state.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateStick(event.clientX, event.clientY);
  });

  elements.stickZone.addEventListener('pointermove', (event) => {
    if (event.pointerId === state.stickPointer) {
      event.preventDefault();
      updateStick(event.clientX, event.clientY);
    }
  });

  elements.stickZone.addEventListener('pointerup', resetStick);
  elements.stickZone.addEventListener('pointercancel', resetStick);

  function setPointer(x, y) {
    state.pointer.x = (x / window.innerWidth) * 2 - 1;
    state.pointer.y = -(y / window.innerHeight) * 2 + 1;
  }

  function updateStick(x, y) {
    const dx = x - state.stickCenter.x;
    const dy = y - state.stickCenter.y;
    const max = 44;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, len / max);
    const nx = (dx / len) * scale;
    const ny = (dy / len) * scale;
    state.move.set(nx, 0, ny);
    elements.stickKnob.style.transform = `translate(calc(-50% + ${nx * max}px), calc(-50% + ${ny * max}px))`;
  }

  function resetStick(event) {
    if (event && event.pointerId !== state.stickPointer) return;
    state.stickPointer = null;
    state.move.set(0, 0, 0);
    elements.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  function frame() {
    const keyboard = new THREE.Vector3(
      (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0),
      0,
      (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0)
    );
    const mobile = state.move.clone();
    const move = keyboard.lengthSq() > 0 ? keyboard : mobile;
    if (move.lengthSq() > 1) move.normalize();
    const firePressed = state.firePressed;
    state.firePressed = false;
    return { move, pointer: state.pointer, firePressed, fireHeld: state.fireHeld };
  }

  return { state, frame };
}

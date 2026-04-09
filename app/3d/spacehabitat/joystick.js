/**
 * Virtual dual-joystick for mobile FPS controls.
 * Left stick = move (WASD), Right stick = look (mouse-look).
 * Only shows on touch devices when interior/roofview mode is active.
 */
const Joystick = (() => {
  const container = document.getElementById('joystick-container');
  const leftEl = document.getElementById('joy-left');
  const rightEl = document.getElementById('joy-right');
  const leftThumb = document.getElementById('joy-left-thumb');
  const rightThumb = document.getElementById('joy-right-thumb');

  // Output values: -1 to 1
  const state = {
    moveX: 0, moveY: 0,  // left stick
    lookX: 0, lookY: 0,  // right stick
  };

  let leftTouch = null;
  let rightTouch = null;
  let leftOrigin = null;
  let rightOrigin = null;

  const DEAD_ZONE = 8;  // px
  const MAX_DIST = 50;  // px max thumb travel

  let active = false;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  function show() {
    if (!isTouchDevice) return;
    active = true;
    container.classList.remove('hidden');
  }

  function hide() {
    active = false;
    container.classList.add('hidden');
    resetSticks();
  }

  function resetSticks() {
    state.moveX = state.moveY = state.lookX = state.lookY = 0;
    leftThumb.style.transform = 'translate(-50%, -50%)';
    rightThumb.style.transform = 'translate(-50%, -50%)';
    leftTouch = rightTouch = leftOrigin = rightOrigin = null;
  }

  function getState() { return state; }
  function isActive() { return active && isTouchDevice; }

  // ---- Touch handlers ----
  function onTouchStart(e) {
    if (!active) return;
    for (const t of e.changedTouches) {
      const x = t.clientX;
      const w = window.innerWidth;
      if (x < w / 2 && leftTouch === null) {
        leftTouch = t.identifier;
        leftOrigin = { x: t.clientX, y: t.clientY };
      } else if (x >= w / 2 && rightTouch === null) {
        rightTouch = t.identifier;
        rightOrigin = { x: t.clientX, y: t.clientY };
      }
    }
  }

  function onTouchMove(e) {
    if (!active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === leftTouch && leftOrigin) {
        const dx = t.clientX - leftOrigin.x;
        const dy = t.clientY - leftOrigin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > DEAD_ZONE) {
          const clamped = Math.min(dist, MAX_DIST);
          const nx = (dx / dist) * clamped;
          const ny = (dy / dist) * clamped;
          state.moveX = nx / MAX_DIST;
          state.moveY = -ny / MAX_DIST; // invert Y so up = forward
          leftThumb.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        } else {
          state.moveX = state.moveY = 0;
          leftThumb.style.transform = 'translate(-50%, -50%)';
        }
      }
      if (t.identifier === rightTouch && rightOrigin) {
        const dx = t.clientX - rightOrigin.x;
        const dy = t.clientY - rightOrigin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > DEAD_ZONE) {
          const clamped = Math.min(dist, MAX_DIST);
          const nx = (dx / dist) * clamped;
          const ny = (dy / dist) * clamped;
          state.lookX = nx / MAX_DIST;
          state.lookY = ny / MAX_DIST;
          rightThumb.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        } else {
          state.lookX = state.lookY = 0;
          rightThumb.style.transform = 'translate(-50%, -50%)';
        }
      }
    }
  }

  function onTouchEnd(e) {
    if (!active) return;
    for (const t of e.changedTouches) {
      if (t.identifier === leftTouch) {
        leftTouch = null;
        leftOrigin = null;
        state.moveX = state.moveY = 0;
        leftThumb.style.transform = 'translate(-50%, -50%)';
      }
      if (t.identifier === rightTouch) {
        rightTouch = null;
        rightOrigin = null;
        state.lookX = state.lookY = 0;
        rightThumb.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  // Bind globally (touches may start on canvas then slide onto joystick)
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return { show, hide, getState, isActive };
})();

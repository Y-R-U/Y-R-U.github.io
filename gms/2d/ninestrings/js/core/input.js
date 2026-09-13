// One thumb, one vector. Touch and keyboard both collapse to (moveX, moveY).
//
// The touch model is drag-anywhere: the first touch sets the origin wherever it
// lands, and the origin CHASES the thumb once it travels past the radius. A
// fixed on-screen stick runs out of travel and loses the player at the exact
// moment a wave closes in; a chasing origin never does.

const RADIUS = 72;      // CSS px for full deflection
const DEAD = 0.14;      // fraction of radius ignored

export function makeInput(el) {
  let moveX = 0, moveY = 0, active = false;
  const stick = { ox: 0, oy: 0, x: 0, y: 0, held: false };
  const keys = new Set();
  let touchId = -1;

  const setFromTouch = (px, py) => {
    let dx = px - stick.ox, dy = py - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      // drag the origin along behind the thumb
      stick.ox += dx * (1 - RADIUS / d);
      stick.oy += dy * (1 - RADIUS / d);
      dx = px - stick.ox; dy = py - stick.oy;
    }
    stick.x = px; stick.y = py;
    const n = Math.hypot(dx, dy) / RADIUS;
    if (n < DEAD) { moveX = 0; moveY = 0; active = false; return; }
    const k = Math.min(1, (n - DEAD) / (1 - DEAD)) / Math.max(1e-6, n / 1);
    moveX = (dx / RADIUS) * k;
    moveY = (dy / RADIUS) * k;
    const m = Math.hypot(moveX, moveY);
    if (m > 1) { moveX /= m; moveY /= m; }
    active = true;
  };

  const onDown = (e) => {
    if (touchId !== -1) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    touchId = e.changedTouches ? t.identifier : 0;
    stick.ox = t.clientX; stick.oy = t.clientY;
    stick.held = true;
    setFromTouch(t.clientX, t.clientY);
    if (e.cancelable) e.preventDefault();
  };
  const find = (e) => {
    if (!e.changedTouches) return e;
    for (const t of e.changedTouches) if (t.identifier === touchId) return t;
    return null;
  };
  const onMove = (e) => {
    if (touchId === -1) return;
    const t = find(e);
    if (!t) return;
    setFromTouch(t.clientX, t.clientY);
    if (e.cancelable) e.preventDefault();
  };
  const onUp = (e) => {
    if (touchId === -1) return;
    if (e.changedTouches && !find(e)) return;
    touchId = -1;
    stick.held = false;
    moveX = 0; moveY = 0; active = false;
  };

  const onKey = (e) => {
    const d = e.type === 'keydown';
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (d) keys.add(k); else keys.delete(k);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  };

  el.addEventListener('touchstart', onDown, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onUp, { passive: false });
  el.addEventListener('touchcancel', onUp, { passive: false });
  el.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onUp);

  return {
    get moveX() { return moveX; },
    get moveY() { return moveY; },
    get active() { return active; },
    stick,
    pressed(k) { return keys.has(k); },

    update() {
      if (touchId !== -1) return;   // touch wins while it is down
      let x = 0, y = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) y += 1;
      const m = Math.hypot(x, y);
      if (m > 0) { x /= m; y /= m; }
      moveX = x; moveY = y; active = m > 0;
    },

    // The bot in ?auto drives the same two numbers the player does, so the
    // gates exercise the real input path rather than a side door.
    inject(x, y) { moveX = x; moveY = y; active = (x || y) !== 0; },

    destroy() {
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
      el.removeEventListener('touchcancel', onUp);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onUp);
    },
  };
}

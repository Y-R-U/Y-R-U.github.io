import { clamp } from './math.js';

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'cast', 'interact', 'pause'];

/**
 * A key may drive more than one action. Up is the case that matters: it has to
 * stay on the analog axis (dash aims off it) AND jump, because DESIGN §6 has
 * always said W jumps and every player reaches for up first on a platformer.
 */
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: ['up', 'jump'], KeyW: ['up', 'jump'],
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyE: 'interact',
  KeyF: 'cast', KeyJ: 'cast',
  Escape: 'pause', KeyP: 'pause',
};

// standard gamepad mapping
const PAD_BUTTON = {
  0: 'jump',      // A
  1: 'dash',      // B
  2: 'cast',      // X
  3: 'interact',  // Y
  5: 'dash',      // RB
  7: 'cast',      // RT
  9: 'pause',     // start
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

const DEADZONE = 0.28;

export function createInput(canvas, view, bus) {
  const st = Object.create(null);
  for (const a of ACTIONS) st[a] = { raw: 0, held: false, pressed: false, released: false, pressLatch: 0, releaseLatch: 0 };

  // `raw` is a bitfield of sources so releasing the key doesn't cancel the gamepad.
  const SRC = { KEY: 1, POINTER: 2, PAD: 4, ZONE: 8, API: 16 };

  const input = {
    axisX: 0, axisY: 0,          // analog, -1..1
    pointerDown: false,
    pointerWorld: { x: 0, y: 0 },
    pointerScreen: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    lastSource: 'keyboard',      // 'keyboard' | 'pointer' | 'touch' | 'gamepad'
    touchActive: false,
    padIndex: -1,
    enabled: true,
  };

  /* ---- action plumbing ------------------------------------------------ */

  function set(action, src, on) {
    const s = st[action];
    if (!s) return;
    const before = s.raw;
    if (on) s.raw |= src; else s.raw &= ~src;
    if (!before && s.raw) s.pressLatch++;
    else if (before && !s.raw) s.releaseLatch++;
  }

  input.held = (a) => { const s = st[a]; return s ? s.held : false; };
  input.pressed = (a) => { const s = st[a]; return s ? s.pressed : false; };
  input.released = (a) => { const s = st[a]; return s ? s.released : false; };
  /** Consume a press so two systems can't both react to the same tap. */
  input.consume = (a) => { const s = st[a]; if (s) { s.pressed = false; s.pressLatch = 0; } };
  /** Drive an action from code (UI buttons, cutscenes). */
  input.setAction = (a, on) => set(a, SRC.API, !!on);

  /* ---- keyboard ------------------------------------------------------- */

  const onKey = (e, down) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (down && e.repeat) return;
    input.lastSource = 'keyboard';
    if (typeof a === 'string') set(a, SRC.KEY, down);
    else for (let i = 0; i < a.length; i++) set(a[i], SRC.KEY, down);
    // space/arrows scroll the page otherwise
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', () => {
    for (const a of ACTIONS) { st[a].raw = 0; st[a].releaseLatch++; }
    input.axisX = input.axisY = 0;
    input.pointerDown = false;
    input.aimVec = null;
    pointers.clear();
  });

  /* ---- virtual zones (registered by the UI agent) --------------------- */

  const zones = [];   // {id, rectFn, action, kind}
  const zoneRect = { x: 0, y: 0, w: 0, h: 0 };

  /**
   * action may be a normal action name, or 'move' for an analog stick region.
   * rectFn() returns {x,y,w,h} in CSS pixels; it is called on pointer-down only,
   * so it can be cheap-but-not-free.
   */
  input.registerZone = (id, rectFn, action, kind) => {
    const z = { id, rectFn, action, kind: kind || (action === 'move' ? 'stick' : 'button') };
    zones.push(z);
    return () => { const i = zones.indexOf(z); if (i >= 0) zones.splice(i, 1); };
  };
  input.clearZones = () => {
    zones.length = 0;
    for (const a of ACTIONS) set(a, SRC.ZONE, false);
    stickPointer = -1;
    input.axisX = input.axisY = 0;
  };
  input.zoneCount = () => zones.length;
  input.getZones = () => zones;

  function hitZone(x, y) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      const r = z.rectFn(zoneRect) || zoneRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return z;
    }
    return null;
  }

  /* ---- pointers (mouse + touch + pen through one path) ---------------- */

  const pointers = new Map();  // id -> {x,y,x0,y0,t0,zone,moved}
  let stickPointer = -1;
  let stickOx = 0, stickOy = 0, stickR = 90;
  const tapHandlers = [];
  input.onTap = (fn) => {
    tapHandlers.push(fn);
    return () => { const i = tapHandlers.indexOf(fn); if (i >= 0) tapHandlers.splice(i, 1); };
  };
  const tapEvt = { x: 0, y: 0, worldX: 0, worldY: 0, id: 0 };

  function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Aim authority. A finger cannot hold a crosshair while it is also moving and
   * jumping, so on touch the sim drives `aim` (auto-aim) unless the player is
   * actively pointing — a drag on the aim flank, or a tap out in the world.
   * Those grant manual authority for AIM_HOLD_MS, then it hands back.
   * Mouse and gamepad are always manual: they have a real second axis.
   */
  const AIM_HOLD_MS = 700;
  let aimHoldUntil = 0;
  input.holdAim = (ms) => { aimHoldUntil = Math.max(aimHoldUntil, performance.now() + (ms || AIM_HOLD_MS)); };
  input.aimIsManual = () => input.lastSource === 'pointer' || input.lastSource === 'gamepad'
    || !!input.aimVec || performance.now() < aimHoldUntil;

  /**
   * Aim as a DIRECTION rather than a point.
   *
   * A screen point is the wrong model for a thumb. The aim flank is the
   * bottom-right of the phone, so "drag down" put the finger down-and-RIGHT of
   * the caster and the shot went diagonally — you could not aim straight down
   * at all without putting a finger where the caster already is. A vector is
   * anchored to the caster (`setAimOrigin`), so down is down wherever the thumb
   * happens to be sitting.
   *
   * It has to be re-applied in `update()` rather than written once: the caster
   * moves, the camera scrolls, and `aim` is world-space.
   */
  const AIM_VEC_RANGE = 460;
  const aimVec = { x: 0, y: 0, src: '' };
  input.aimVec = null;                    // the same object when live, null when not
  input.setAimVector = (dx, dy, src) => {
    const m = Math.hypot(dx, dy);
    if (m < 0.0001) { input.aimVec = null; return; }
    aimVec.x = dx / m; aimVec.y = dy / m; aimVec.src = src || 'touch';
    input.aimVec = aimVec;
    input.holdAim(120);                   // short: the vector itself holds authority
  };
  input.clearAimVector = () => { input.aimVec = null; };

  function updateAim(x, y, manual) {
    input.pointerScreen.x = x; input.pointerScreen.y = y;
    view.toWorld(x, y, input.pointerWorld);
    input.aim.x = input.pointerWorld.x;
    input.aim.y = input.pointerWorld.y;
    if (manual) input.holdAim();
  }

  function onDown(e) {
    if (!input.enabled) return;
    const p = localXY(e);
    const touch = e.pointerType !== 'mouse';
    input.lastSource = touch ? 'touch' : 'pointer';
    if (touch) input.touchActive = true;
    const z = hitZone(p.x, p.y);
    const rec = { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now(), zone: z, moved: false };
    pointers.set(e.pointerId, rec);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }

    if (z) {
      if (z.kind === 'stick') {
        stickPointer = e.pointerId;
        const r = z.rectFn(zoneRect) || zoneRect;
        stickOx = p.x; stickOy = p.y;
        stickR = Math.max(36, Math.min(r.w, r.h) * 0.36);
      } else {
        set(z.action, SRC.ZONE, true);
      }
    } else {
      input.pointerDown = true;
      updateAim(p.x, p.y, true);
      set('cast', SRC.POINTER, true);
    }
    e.preventDefault();
  }

  function onMove(e) {
    const p = localXY(e);
    const rec = pointers.get(e.pointerId);
    if (!rec) {
      // a moving mouse is a real aim signal even with no button down — it also
      // takes aim authority back off the sim
      if (e.pointerType === 'mouse') { input.lastSource = 'pointer'; updateAim(p.x, p.y, true); }
      return;
    }
    rec.x = p.x; rec.y = p.y;
    if (Math.abs(p.x - rec.x0) > 12 || Math.abs(p.y - rec.y0) > 12) rec.moved = true;

    if (e.pointerId === stickPointer) {
      let dx = (p.x - stickOx) / stickR;
      let dy = (p.y - stickOy) / stickR;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      input.axisX = dx; input.axisY = dy;
      set('left', SRC.ZONE, dx < -0.22);
      set('right', SRC.ZONE, dx > 0.22);
      set('up', SRC.ZONE, dy < -0.35);
      set('down', SRC.ZONE, dy > 0.35);
    } else if (!rec.zone) {
      updateAim(p.x, p.y, true);
    }
    e.preventDefault();
  }

  function onUp(e) {
    const rec = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (!rec) return;

    if (e.pointerId === stickPointer) {
      stickPointer = -1;
      input.axisX = input.axisY = 0;
      set('left', SRC.ZONE, false); set('right', SRC.ZONE, false);
      set('up', SRC.ZONE, false); set('down', SRC.ZONE, false);
    } else if (rec.zone) {
      set(rec.zone.action, SRC.ZONE, false);
    } else {
      let anyFree = false;
      for (const r of pointers.values()) if (!r.zone) anyFree = true;
      if (!anyFree) {
        input.pointerDown = false;
        set('cast', SRC.POINTER, false);
      }
    }

    const dt = performance.now() - rec.t0;
    if (!rec.moved && dt < 350 && tapHandlers.length) {
      tapEvt.x = rec.x; tapEvt.y = rec.y; tapEvt.id = e.pointerId;
      const w = view.toWorld(rec.x, rec.y);
      tapEvt.worldX = w.x; tapEvt.worldY = w.y;
      for (let i = tapHandlers.length - 1; i >= 0; i--) tapHandlers[i](tapEvt);
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Belt and braces against iOS scroll/zoom; css touch-action:none does the rest.
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---- gamepad -------------------------------------------------------- */

  const padPrev = [];
  function pollPad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; input.padIndex = i; break; }
    if (!pad) {
      if (input.padIndex >= 0) {
        input.padIndex = -1;
        for (const a of ACTIONS) set(a, SRC.PAD, false);
      }
      return;
    }
    let any = false;
    for (const k in PAD_BUTTON) {
      const b = pad.buttons[k];
      const on = !!b && (b.pressed || b.value > 0.4);
      if (on) any = true;
      if (padPrev[k] !== on) { padPrev[k] = on; set(PAD_BUTTON[k], SRC.PAD, on); }
    }
    let ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (Math.abs(ax) < DEADZONE) ax = 0; else ax = (ax - Math.sign(ax) * DEADZONE) / (1 - DEADZONE);
    if (Math.abs(ay) < DEADZONE) ay = 0; else ay = (ay - Math.sign(ay) * DEADZONE) / (1 - DEADZONE);
    if (ax || ay) any = true;
    if (stickPointer < 0) {
      if (ax || ay || input.lastSource === 'gamepad') { input.axisX = ax; input.axisY = ay; }
      set('left', SRC.PAD, ax < -0.4);
      set('right', SRC.PAD, ax > 0.4);
      set('up', SRC.PAD, ay < -0.5);
      set('down', SRC.PAD, ay > 0.5);
    }
    // right stick aims, relative to whatever origin the sim gave us
    const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
    if (Math.hypot(rx, ry) > DEADZONE) {
      any = true;
      input.aim.x = aimOrigin.x + rx * 520;
      input.aim.y = aimOrigin.y + ry * 520;
    }
    if (any) input.lastSource = 'gamepad';
  }

  const aimOrigin = { x: 0, y: 0 };
  /** The sim calls this with the caster position so stick-aim has something to orbit. */
  input.setAimOrigin = (x, y) => { aimOrigin.x = x; aimOrigin.y = y; };

  /* ---- per-tick ------------------------------------------------------- */

  input.update = () => {
    pollPad();
    for (let i = 0; i < ACTIONS.length; i++) {
      const s = st[ACTIONS[i]];
      s.pressed = s.pressLatch > 0;
      s.released = s.releaseLatch > 0;
      s.pressLatch = 0;
      s.releaseLatch = 0;
      s.held = s.raw !== 0;
    }
    if (stickPointer < 0 && input.lastSource !== 'gamepad') {
      // keyboard drives the analog axis so callers can use one code path
      const kx = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      const ky = (input.held('down') ? 1 : 0) - (input.held('up') ? 1 : 0);
      input.axisX = clamp(kx, -1, 1);
      input.axisY = clamp(ky, -1, 1);
    }
    // keep the world-space pointer honest as the camera scrolls under a still finger
    if (input.pointerDown || input.lastSource !== 'gamepad') {
      view.toWorld(input.pointerScreen.x, input.pointerScreen.y, input.pointerWorld);
      // Only re-derive aim from the pointer while the pointer owns it. Without
      // this the auto-aim the sim wrote last tick was overwritten every frame by
      // wherever the last tap happened to land.
      if (input.lastSource !== 'gamepad' && input.aimIsManual() && !input.aimVec) {
        input.aim.x = input.pointerWorld.x;
        input.aim.y = input.pointerWorld.y;
      }
    }
    // A direction beats both the pointer and the sim's auto-aim, and is
    // re-projected every tick because the caster it hangs off keeps moving.
    if (input.aimVec) {
      input.aim.x = aimOrigin.x + aimVec.x * AIM_VEC_RANGE;
      input.aim.y = aimOrigin.y + aimVec.y * AIM_VEC_RANGE;
    }
  };

  /**
   * Drop every held input on the floor. A scene change is the one moment where
   * a latched bit can outlive the thing that set it: dying with a thumb on the
   * stick leaves `stickPointer` owned and the direction bit set, and if that
   * pointer's `pointerup` never arrives (the death modal takes the touch, the
   * browser cancels it, the finger lifts outside the window) the stick stays
   * owned — which also suppresses the keyboard axis fallback. Nothing else
   * clears it, so scene entry does.
   */
  input.releaseAll = () => {
    for (const a of ACTIONS) {
      const s = st[a];
      if (s.raw) s.releaseLatch++;
      s.raw = 0; s.held = false; s.pressed = false;
    }
    pointers.clear();
    stickPointer = -1;
    input.axisX = input.axisY = 0;
    input.pointerDown = false;
    input.aimVec = null;
  };

  input.destroy = () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  if (bus) bus.on('view:change', () => { /* zones are rect functions, nothing to recompute */ });

  return input;
}

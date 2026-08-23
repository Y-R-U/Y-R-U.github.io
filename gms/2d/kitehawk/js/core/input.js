import { clamp, easeOutCubic } from './math.js';
import { stickRadius, slotRect } from './viewprofile.js';

export const ACTIONS = ['pitchUp', 'pitchDown', 'slipLeft', 'slipRight', 'special', 'brake', 'pause'];

/**
 * One thumb (D3). Hold-and-slide anywhere in the lower 55% is the stick, the
 * throttle is automatic, the guns auto-fire, and one tap fires the loaded
 * special. There is no fire button and there must not be one.
 *
 * Keyboard and pad exist for the desk and for the harness; they are not the
 * design target. A key may drive more than one action.
 */
const KEYMAP = {
  ArrowUp: 'pitchUp', KeyW: 'pitchUp',
  ArrowDown: 'pitchDown', KeyS: 'pitchDown',
  ArrowLeft: 'slipLeft', KeyA: 'slipLeft',
  ArrowRight: 'slipRight', KeyD: 'slipRight',
  Space: 'special', KeyF: 'special', KeyJ: 'special',
  ShiftLeft: 'brake', ShiftRight: 'brake', KeyB: 'brake',
  Escape: 'pause', KeyP: 'pause',
};

const PAD_BUTTON = {
  0: 'special',   // A
  1: 'brake',     // B
  5: 'brake',     // RB
  7: 'special',   // RT
  9: 'pause',     // start
  12: 'pitchUp', 13: 'pitchDown', 14: 'slipLeft', 15: 'slipRight',
};

const DEADZONE = 0.28;         // pad stick
const STICK_DZ = 0.067;        // DESIGN §2.2 — 6 px on a 90 px radius
const STICK_EXP = 1.35;        // precision near centre without distant extremes
const RELEASE_S = 0.18;        // DESIGN §2.2 — instant release snaps the nose
const DT = 1 / 60;
const DOUBLE_TAP_MS = 280, DOUBLE_TAP_PX = 30;
const FLICK_MS = 160, FLICK_SPEED = 900;   // css px/s
const TAP_MS = 350, TAP_SLOP = 12;

export function createInput(canvas, view, bus, opts = {}) {
  /**
   * The forbidden implementations, shipped alongside the correct ones so the
   * touch suite can be shown to go red (D47, §8.3). `?inputbug=` selects one:
   *
   *   nocapture  lostpointercapture is NOT routed to onUp   -> the stick latches
   *              forever the first time the browser takes a touch away
   *   noblur     blur does not zero the actions             -> alt-tab with a
   *              thumb down and the action is held for the rest of the run
   *   norelease  releaseAll() is a no-op                    -> dying with a
   *              thumb on the stick carries the input into the next scene
   *   twitch     touchdown writes the axis immediately      -> putting a thumb
   *              down jerks the nose before you have moved
   *
   * They exist for `node tools/touch.mjs --falsify`. Never ship a build that
   * sets one; the default path is untouched.
   */
  const BUG = opts.bug || '';

  const st = Object.create(null);
  for (const a of ACTIONS) st[a] = { raw: 0, held: false, pressed: false, released: false, pressLatch: 0, releaseLatch: 0 };

  // `raw` is a BITFIELD OF SOURCES so releasing the key does not cancel the pad,
  // and a UI-driven action does not cancel a finger. Ported unchanged; it is the
  // reason the three pointer fixes below are sufficient rather than approximate.
  const SRC = { KEY: 1, POINTER: 2, PAD: 4, ZONE: 8, API: 16 };

  const input = {
    axisX: 0, axisY: 0,          // -1..1. axisY NEGATIVE (thumb up) = nose up (§6.4)
    axisRaw: { x: 0, y: 0 },     // before the deadzone/exponent shaping — for the debug overlay
    pointerDown: false,
    pointerWorld: { x: 0, y: 0 },
    pointerScreen: { x: 0, y: 0 },
    stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, r: 90 },
    lastSource: 'keyboard',
    touchActive: false,
    padIndex: -1,
    enabled: true,
    invertPitch: !!opts.invertPitch,
    holdToFly: !!opts.holdToFly,     // DESIGN §9.3 — latch on release instead of centring
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
  function pulse(action) { const s = st[action]; if (s) { s.pressLatch++; s.releaseLatch++; } }

  input.held = (a) => { const s = st[a]; return s ? s.held : false; };
  input.pressed = (a) => { const s = st[a]; return s ? s.pressed : false; };
  input.released = (a) => { const s = st[a]; return s ? s.released : false; };
  input.consume = (a) => { const s = st[a]; if (s) { s.pressed = false; s.pressLatch = 0; } };
  input.setAction = (a, on) => set(a, SRC.API, !!on);

  /* ---- zones ---------------------------------------------------------- */

  const zones = [];
  const zoneRect = { x: 0, y: 0, w: 0, h: 0 };

  input.registerZone = (id, rectFn, action, kind) => {
    const z = { id, rectFn, action, kind: kind || (action === 'stick' ? 'stick' : 'button') };
    zones.push(z);
    return () => { const i = zones.indexOf(z); if (i >= 0) zones.splice(i, 1); };
  };
  input.clearZones = () => {
    zones.length = 0;
    for (const a of ACTIONS) set(a, SRC.ZONE, false);
    stickPointer = -1;
    input.stick.active = false;
  };
  input.getZones = () => zones;
  input.zoneCount = () => zones.length;

  /** The default one-thumb layout: the profile's stickZone, nothing else. P7 replaces it. */
  const stickRect = { x: 0, y: 0, w: 0, h: 0 };
  input.installDefaultZones = () => {
    input.clearZones();
    return input.registerZone('stick', () => slotRect(view.profile.stickZone, view, stickRect), 'stick', 'stick');
  };

  function hitZone(x, y) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      const r = z.rectFn(zoneRect) || zoneRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return z;
    }
    return null;
  }

  /* ---- gesture subscribers -------------------------------------------- */

  const tapHandlers = [], dtapHandlers = [], flickHandlers = [];
  const sub = (list) => (fn) => { list.push(fn); return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }; };
  input.onTap = sub(tapHandlers);
  input.onDoubleTap = sub(dtapHandlers);
  input.onFlick = sub(flickHandlers);

  const tapEvt = { x: 0, y: 0, worldX: 0, worldY: 0, id: 0, inStick: false };
  const flickEvt = { dx: 0, dy: 0, speed: 0, x: 0, y: 0, inStick: false };
  let lastTapT = -1e9, lastTapX = 0, lastTapY = 0;

  function fire(list, evt) { for (let i = list.length - 1; i >= 0; i--) list[i](evt); }

  /* ---- pointers ------------------------------------------------------- */

  const pointers = new Map();
  let stickPointer = -1;
  let stickOx = 0, stickOy = 0, stickR = 90;
  let releaseT = 0, releaseFromX = 0, releaseFromY = 0;

  function localXY(e, out) {
    const r = canvas.getBoundingClientRect();
    out.x = e.clientX - r.left;
    out.y = e.clientY - r.top;
    return out;
  }
  const _p = { x: 0, y: 0 };

  /** R-12: DESIGN §2.2's 0.208-of-width, keeping the ported max(36, …) floor. */
  function currentStickR() { return stickRadius(view.w); }
  input.stickRadius = currentStickR;

  function shape(v) {
    const a = Math.abs(v);
    if (a < STICK_DZ) return 0;
    const t = (a - STICK_DZ) / (1 - STICK_DZ);
    return (v < 0 ? -1 : 1) * Math.pow(t, STICK_EXP);
  }

  function driveStick(x, y) {
    // Anchor slide: a thumb can never run out of screen at the bottom bezel,
    // which is the commonest failure of a fixed virtual stick on a tall phone.
    let dx = x - stickOx, dy = y - stickOy;
    const m = Math.hypot(dx, dy);
    if (m > stickR) {
      const k = (m - stickR) / m;
      stickOx += dx * k; stickOy += dy * k;
      dx = x - stickOx; dy = y - stickOy;
    }
    input.stick.ox = stickOx; input.stick.oy = stickOy;
    input.stick.x = x; input.stick.y = y; input.stick.r = stickR;
    input.axisRaw.x = clamp(dx / stickR, -1, 1);
    input.axisRaw.y = clamp(dy / stickR, -1, 1);
    input.axisX = shape(input.axisRaw.x);
    input.axisY = shape(input.axisRaw.y) * (input.invertPitch ? -1 : 1);
    setAxisBits();
  }

  function setAxisBits() {
    set('slipLeft', SRC.ZONE, input.axisX < -0.25);
    set('slipRight', SRC.ZONE, input.axisX > 0.25);
    set('pitchUp', SRC.ZONE, input.axisY < -0.30);
    set('pitchDown', SRC.ZONE, input.axisY > 0.30);
  }

  function onDown(e) {
    if (!input.enabled) return;
    const p = localXY(e, _p);
    const touch = e.pointerType !== 'mouse';
    input.lastSource = touch ? 'touch' : 'pointer';
    if (touch) input.touchActive = true;
    const z = hitZone(p.x, p.y);
    pointers.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now(), zone: z, moved: false });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }

    if (z && z.kind === 'stick' && stickPointer < 0) {
      stickPointer = e.pointerId;
      stickOx = p.x; stickOy = p.y;
      stickR = currentStickR();
      releaseT = 0;
      input.stick.active = true;
      // NO INPUT ON TOUCHDOWN (DESIGN §2.2). Putting a thumb down never twitches
      // the aircraft; the stick starts at dead centre wherever the thumb landed.
      if (BUG === 'twitch') { driveStick(p.x + 0.001, p.y - stickR * 0.9); } else {
        input.axisX = input.axisY = 0;
        input.axisRaw.x = input.axisRaw.y = 0;
        input.stick.ox = stickOx; input.stick.oy = stickOy;
        input.stick.x = p.x; input.stick.y = p.y; input.stick.r = stickR;
        setAxisBits();
      }
    } else if (z) {
      set(z.action, SRC.ZONE, true);
    } else {
      input.pointerDown = true;
      input.pointerScreen.x = p.x; input.pointerScreen.y = p.y;
      view.toWorld(p.x, p.y, input.pointerWorld);
    }
    e.preventDefault();
  }

  function onMove(e) {
    const rec = pointers.get(e.pointerId);
    const p = localXY(e, _p);
    if (!rec) {
      if (e.pointerType === 'mouse') {
        input.lastSource = 'pointer';
        input.pointerScreen.x = p.x; input.pointerScreen.y = p.y;
      }
      return;
    }
    rec.x = p.x; rec.y = p.y;
    if (Math.abs(p.x - rec.x0) > TAP_SLOP || Math.abs(p.y - rec.y0) > TAP_SLOP) rec.moved = true;

    if (e.pointerId === stickPointer) driveStick(p.x, p.y);
    else if (!rec.zone) {
      input.pointerScreen.x = p.x; input.pointerScreen.y = p.y;
      view.toWorld(p.x, p.y, input.pointerWorld);
    }
    e.preventDefault();
  }

  function onUp(e) {
    const rec = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (!rec) return;

    const now = performance.now();
    const dt = now - rec.t0;
    const dx = rec.x - rec.x0, dy = rec.y - rec.y0;
    const inStick = !!(rec.zone && rec.zone.kind === 'stick');

    if (e.pointerId === stickPointer) {
      stickPointer = -1;
      input.stick.active = false;
      if (input.holdToFly) {
        // latch: the stick stays where it was left (DESIGN §9.3)
        releaseT = 0;
      } else {
        releaseFromX = input.axisX; releaseFromY = input.axisY;
        releaseT = RELEASE_S;
      }
    } else if (rec.zone) {
      set(rec.zone.action, SRC.ZONE, false);
    } else {
      let anyFree = false;
      for (const r of pointers.values()) if (!r.zone) anyFree = true;
      if (!anyFree) input.pointerDown = false;
    }

    // flick — a fast short throw, whatever it was over
    if (dt > 0 && dt < FLICK_MS) {
      const speed = Math.hypot(dx, dy) / (dt / 1000);
      if (speed > FLICK_SPEED) {
        flickEvt.dx = dx; flickEvt.dy = dy; flickEvt.speed = speed;
        flickEvt.x = rec.x; flickEvt.y = rec.y; flickEvt.inStick = inStick;
        fire(flickHandlers, flickEvt);
      }
    }

    if (!rec.moved && dt < TAP_MS) {
      tapEvt.x = rec.x; tapEvt.y = rec.y; tapEvt.id = e.pointerId; tapEvt.inStick = inStick;
      const w = view.toWorld(rec.x, rec.y);
      tapEvt.worldX = w.x; tapEvt.worldY = w.y;
      fire(tapHandlers, tapEvt);

      if (now - lastTapT < DOUBLE_TAP_MS &&
          Math.abs(rec.x - lastTapX) < DOUBLE_TAP_PX && Math.abs(rec.y - lastTapY) < DOUBLE_TAP_PX) {
        fire(dtapHandlers, tapEvt);
        lastTapT = -1e9;
      } else {
        lastTapT = now; lastTapX = rec.x; lastTapY = rec.y;
      }

      // A tap OUTSIDE the stick zone fires the loaded special (§6.4). So does a
      // second finger tapping while the flying thumb stays put — the whole
      // reason there is exactly one special slot (DESIGN §2.4).
      if (!inStick && !rec.zone) pulse('special');
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  /* The up that never comes. `pressed` is a rising edge off `raw`, so an action
   * stuck ON can never fire again — and a touch whose pointerup goes missing
   * leaves exactly that. onDown captures every pointer to the canvas, so
   * whenever the browser takes one away it must tell us here, for any reason. */
  if (BUG !== 'nocapture') canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---- keyboard ------------------------------------------------------- */

  const onKey = (e, down) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (down && e.repeat) return;
    input.lastSource = 'keyboard';
    if (typeof a === 'string') set(a, SRC.KEY, down);
    else for (let i = 0; i < a.length; i++) set(a[i], SRC.KEY, down);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const onBlur = () => {
    // Alt-tabbing away with a thumb down used to leave the action latched for
    // the rest of the run. Zero everything; it is also the repair that cured
    // the lost-pointerup bug before lostpointercapture was routed here.
    for (const a of ACTIONS) { if (st[a].raw) st[a].releaseLatch++; st[a].raw = 0; }
    input.axisX = input.axisY = 0;
    input.axisRaw.x = input.axisRaw.y = 0;
    input.pointerDown = false;
    input.stick.active = false;
    stickPointer = -1;
    releaseT = 0;
    pointers.clear();
  };
  if (BUG !== 'noblur') window.addEventListener('blur', onBlur);

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
    if (stickPointer < 0 && releaseT <= 0) {
      if (ax || ay || input.lastSource === 'gamepad') {
        input.axisX = ax;
        input.axisY = ay * (input.invertPitch ? -1 : 1);
        input.axisRaw.x = ax; input.axisRaw.y = ay;
      }
    }
    if (any) input.lastSource = 'gamepad';
  }

  /* ---- per tick ------------------------------------------------------- */

  input.update = () => {
    pollPad();

    // Release ease. Instant centring reads as robotic and snaps the nose out of
    // a hard pull. DT is the fixed step — never performance.now() (§10 rule 8).
    if (stickPointer < 0 && releaseT > 0) {
      releaseT -= DT;
      const k = releaseT <= 0 ? 0 : 1 - easeOutCubic(1 - releaseT / RELEASE_S);
      input.axisX = releaseFromX * k;
      input.axisY = releaseFromY * k;
      input.axisRaw.x = input.axisRaw.y = 0;
      if (releaseT <= 0) { releaseT = 0; input.axisX = input.axisY = 0; }
      setAxisBits();
    }

    for (let i = 0; i < ACTIONS.length; i++) {
      const s = st[ACTIONS[i]];
      s.pressed = s.pressLatch > 0;
      s.released = s.releaseLatch > 0;
      s.pressLatch = 0;
      s.releaseLatch = 0;
      s.held = s.raw !== 0;
    }

    if (stickPointer < 0 && releaseT <= 0 && input.lastSource === 'keyboard') {
      const kx = (input.held('slipRight') ? 1 : 0) - (input.held('slipLeft') ? 1 : 0);
      const ky = (input.held('pitchDown') ? 1 : 0) - (input.held('pitchUp') ? 1 : 0);
      input.axisX = clamp(kx, -1, 1);
      input.axisY = clamp(ky, -1, 1) * (input.invertPitch ? -1 : 1);
      input.axisRaw.x = input.axisX; input.axisRaw.y = input.axisY;
    }

    if (input.pointerDown) view.toWorld(input.pointerScreen.x, input.pointerScreen.y, input.pointerWorld);
  };

  /**
   * MUST be called on every scene change. A scene change is the one moment a
   * latched bit can outlive the thing that set it: dying with a thumb on the
   * stick leaves the stick owned, and if that pointer's up never arrives the
   * stick stays owned — which also suppresses the keyboard fallback.
   */
  input.releaseAll = () => {
    if (BUG === 'norelease') return;
    for (const a of ACTIONS) {
      const s = st[a];
      if (s.raw) s.releaseLatch++;
      s.raw = 0; s.held = false; s.pressed = false;
    }
    pointers.clear();
    stickPointer = -1;
    releaseT = 0;
    input.axisX = input.axisY = 0;
    input.axisRaw.x = input.axisRaw.y = 0;
    input.pointerDown = false;
    input.stick.active = false;
  };

  input.destroy = () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('lostpointercapture', onUp);
  };

  // Zones are rect closures over `view`, so rotation re-derives them for free.
  if (bus) bus.on('view:change', () => { stickR = currentStickR(); input.stick.r = stickR; });

  return input;
}

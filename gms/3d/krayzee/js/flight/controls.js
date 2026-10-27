import { clamp, moveTo } from './vmath.js';
import { OVERRIDE } from './traffic.js';

const NOTCHES = [0, 1 / 3, 2 / 3, 1];
const EXPO = 0.45;
const expo = (x) => Math.sign(x) * (EXPO * Math.abs(x) ** 3 + (1 - EXPO) * Math.abs(x));
// D9: invertPitch false = stick/ArrowDown/S DOWN → nose UP. D10: stickRight false = stick on the LEFT.
// (UI migrates old saves; see docs/UI.md.)
export function flightPrefs(s = {}) {
  return { invert: !!s.invertPitch, side: s.stickRight ? 'right' : 'left' };
}

// Player input → per-axis "manual" values (null = released, autopilot has it).
export function createControls({ root, getSettings, getDifficulty, onView, onPause, onFullscreen, onThrottleAuto }) {
  const el = document.createElement('div');
  el.id = 'krz-controls';
  el.innerHTML = `
    <div class="krz-top krz-top-l"><button class="krz-btn krz-round" data-act="pause" aria-label="Pause and settings">${ICONS.pause}</button></div>
    <div class="krz-top krz-top-r">
      <button class="krz-btn krz-round" data-act="view" aria-label="Toggle cockpit or chase view">${ICONS.view}<span class="krz-btn-l">CHASE</span></button>
      <button class="krz-btn krz-round" data-act="fs" aria-label="Toggle fullscreen">${ICONS.fs}</button>
    </div>
    <div class="krz-stick-zone" data-zone="stick">
      <div class="krz-stick-base"><div class="krz-stick-knob"></div><span class="krz-stick-tag">AUTO</span></div>
    </div>
    <div class="krz-cluster">
      <div class="krz-thr-col">
        <button class="krz-btn krz-thr-auto" data-act="thrauto" aria-label="Hand the throttle back to the autopilot">AUTO</button>
        <div class="krz-thr" data-zone="thr" aria-label="Throttle">
          <div class="krz-thr-fill"></div><span class="krz-thr-l">THR</span><div class="krz-thr-thumb"><span class="krz-thr-v">0</span></div>
        </div>
      </div>
      <div class="krz-pad">
        <button class="krz-btn krz-sq" data-act="flaps"><b>FLAPS</b><span class="krz-flaps-v">0°</span></button>
        <button class="krz-btn krz-sq" data-hold="brake"><b>BRAKE</b></button>
        <button class="krz-btn krz-sq" data-hold="rudL" aria-label="Rudder left"><b>◀</b><span>RUD</span></button>
        <button class="krz-btn krz-sq" data-hold="rudR" aria-label="Rudder right"><b>▶</b><span>RUD</span></button>
      </div>
    </div>`;
  root.append(el);
  el.dataset.hand = flightPrefs(getSettings?.()).side;
  const $ = (s) => el.querySelector(s);
  const zone = $('.krz-stick-zone'), base = $('.krz-stick-base'), knob = $('.krz-stick-knob'), stickTag = $('.krz-stick-tag');
  const thr = $('.krz-thr'), thrThumb = $('.krz-thr-thumb'), thrFill = $('.krz-thr-fill'), thrV = $('.krz-thr-v'), thrAuto = $('.krz-thr-auto');

  const st = {
    stick: null, stickX: 0, stickY: 0, stickLive: false,
    thr: null, thrVal: 0,
    hold: { brake: false, rudL: false, rudR: false },
    flapsManual: null, flapsT: 0,
    keys: new Set(), kAil: 0, kEle: 0, kRud: 0, kThr: null, kThrT: 0,
    inject: null, injectUntil: 0,
    look: { x: 0, y: 0, active: false, id: null, lx: 0, ly: 0 },
    pad: { prev: [] }, visible: true,
  };

  // ---- stick ----
  // PLAYTEST_1 #5: ~54 px full throw was twitchy. Travel scales with the screen: ~94 px on a phone, 110 on desktop.
  // PERF #3: viewport cached on resize; reading innerWidth after paint's writes forced a layout every frame
  let VW = innerWidth, VH = innerHeight;
  addEventListener('resize', () => { VW = innerWidth; VH = innerHeight; });
  const R = () => Math.max(80, Math.min(110, Math.min(VW, VH) * 0.24));
  zone.addEventListener('pointerdown', (e) => {
    if (st.stick != null) return;
    e.preventDefault();
    zone.setPointerCapture?.(e.pointerId);
    st.stick = e.pointerId; st.stickLive = false;
    const zr = zone.getBoundingClientRect();
    st.cx = e.clientX; st.cy = e.clientY;
    base.style.left = (e.clientX - zr.left) + 'px'; base.style.top = (e.clientY - zr.top) + 'px';
    base.classList.add('krz-active');
    moveStick(e);
  });
  const moveStick = (e) => {
    if (e.pointerId !== st.stick) return;
    const r = R();
    let dx = (e.clientX - st.cx) / r, dy = (e.clientY - st.cy) / r;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    st.stickX = dx; st.stickY = dy;
    if (m > OVERRIDE.deadzone) st.stickLive = true;
    knob.style.transform = `translate(${dx * r}px, ${dy * r}px)`;
  };
  const endStick = (e) => {
    if (e.pointerId !== st.stick) return;
    st.stick = null; st.stickX = st.stickY = 0; st.stickLive = false;
    knob.style.transform = ''; base.style.left = base.style.top = '';
    base.classList.remove('krz-active');
  };
  zone.addEventListener('pointermove', moveStick);
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);
  zone.addEventListener('lostpointercapture', endStick);

  // ---- throttle ----
  const thrFrom = (e) => {
    const r = thr.getBoundingClientRect();
    st.thrVal = clamp(1 - (e.clientY - r.top - 14) / (r.height - 28), 0, 1);
  };
  thr.addEventListener('pointerdown', (e) => { e.preventDefault(); thr.setPointerCapture?.(e.pointerId); st.thr = e.pointerId; thrFrom(e); thr.classList.add('krz-active'); });
  thr.addEventListener('pointermove', (e) => { if (e.pointerId === st.thr) thrFrom(e); });
  const endThr = (e) => { if (e.pointerId === st.thr) { st.thr = null; thr.classList.remove('krz-active'); } };
  thr.addEventListener('pointerup', endThr); thr.addEventListener('pointercancel', endThr); thr.addEventListener('lostpointercapture', endThr);

  // ---- hold buttons / taps ----
  el.querySelectorAll('[data-hold]').forEach((b) => {
    const k = b.dataset.hold;
    const on = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); st.hold[k] = true; b.classList.add('krz-active'); };
    const off = () => { st.hold[k] = false; b.classList.remove('krz-active'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  let lastAc = null;
  const cycleFlaps = () => {
    const cur = st.flapsManual ?? lastAc?.ctl.flaps ?? 0;
    const i = NOTCHES.findIndex((n) => Math.abs(n - cur) < 0.05);
    st.flapsManual = NOTCHES[(i + 1) % NOTCHES.length];
    st.flapsT = FLAP_HOLD;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'flaps') cycleFlaps();
    else if (a === 'view') onView?.();
    else if (a === 'pause') onPause?.();
    else if (a === 'fs') onFullscreen?.();
    else if (a === 'thrauto') { api.releaseThrottle(); onThrottleAuto?.(); }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- look-around on empty screen (canvas) ----
  const canvas = document.querySelector('#krz-canvas');
  canvas?.addEventListener('pointerdown', (e) => {
    if (st.look.id != null) return;
    st.look.id = e.pointerId; st.look.active = true; st.look.lx = e.clientX; st.look.ly = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas?.addEventListener('pointermove', (e) => {
    if (e.pointerId !== st.look.id) return;
    const s = 3.2 / Math.max(innerWidth, innerHeight);
    st.look.x = clamp(st.look.x - (e.clientX - st.look.lx) * s, -2.6, 2.6);
    st.look.y = clamp(st.look.y - (e.clientY - st.look.ly) * s, -0.9, 1.0);
    st.look.lx = e.clientX; st.look.ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === st.look.id) { st.look.id = null; st.look.active = false; } };
  canvas?.addEventListener('pointerup', endLook); canvas?.addEventListener('pointercancel', endLook);

  // ---- keyboard ----
  const KEYMAP = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyB', 'Equal', 'Minus']);
  addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input,textarea,select,[contenteditable]')) return;
    if (KEYMAP.has(e.code)) { st.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === 'KeyF') cycleFlaps();
    else if (e.code === 'KeyC' || e.code === 'KeyV') onView?.();
    else if (e.code === 'KeyP') onPause?.();
    else if (e.code === 'KeyT') { api.releaseThrottle(); onThrottleAuto?.(); }
  });
  addEventListener('keyup', (e) => st.keys.delete(e.code));
  addEventListener('blur', () => st.keys.clear());

  function readPad() {
    const pads = navigator.getGamepads?.() || [];
    const p = [...pads].find((x) => x && x.connected);
    if (!p) return null;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const btn = (i) => !!p.buttons[i]?.pressed;
    const pressed = (i) => btn(i) && !st.pad.prev[i];
    const out = { ail: dz(p.axes[0] || 0), ele: dz(p.axes[1] || 0), rud: (btn(5) ? 1 : 0) - (btn(4) ? 1 : 0),
      thrUp: p.buttons[7]?.value || 0, thrDn: p.buttons[6]?.value || 0, brake: btn(0) };
    if (pressed(2)) cycleFlaps();
    if (pressed(3)) onView?.();
    if (pressed(9)) onPause?.();
    st.pad.prev = p.buttons.map((b) => b.pressed);
    return out;
  }

  // Full-stick roll rate per type (deg/s) and the D-spec bank soft-limit: ~60° on Easy/Medium, none on Hard. The limit
  // is a detent: at the limit, ease off and push full again within a second to roll past it (until back under 40°).
  const RATE = { c172: 45, tiger: 50, bathtub: 35 }, DEG = Math.PI / 180;
  const BANK_LIM = 60 * DEG, BANK_K = 2.6;
  function rollAssist(ail, ac, dt) {
    st.bankLimited = false;
    if (!ac || ac.onGround) { st.detent = null; return ail; }
    const rr = -(ac.w?.z || 0), b = ac.bank || 0, s = Math.sign(ail) || 1, sb = b * s;
    let a = ail - 0.22 * clamp(rr / 1.4, -1, 1) * (1 - Math.abs(ail) * 0.6);
    const P = ac.P || {}, auth = (P.maxRollRate || 1) * clamp((ac.speed || 0) / (P.vRef || 45), 0, 1.4);
    if (auth < 0.05) return a;
    let p = clamp(a * auth, -(RATE[ac.type] ?? 45) * DEG, (RATE[ac.type] ?? 45) * DEG);
    const d = st.detent ||= { side: 0, armed: 0, eased: 0, past: 0 };
    if (Math.abs(b) < 40 * DEG || Math.abs(ail) < 0.15) d.past = d.armed = 0;
    if ((getDifficulty?.() ?? getSettings?.().difficulty) !== 'hard' && d.past !== s) {
      const pmax = BANK_K * (BANK_LIM - sb);
      if (s * p > pmax) { p = s * pmax; st.bankLimited = sb > BANK_LIM - 6 * DEG; }
      const full = Math.abs(ail) > 0.9;
      if (d.armed === s && d.eased > 0 && full) { d.past = s; d.armed = 0; d.eased = 0; }
      else if (st.bankLimited && full) { d.armed = s; d.eased = 0; }
      else if (d.armed === s && Math.abs(ail) < 0.75) { d.eased += dt; if (d.eased > 1) d.armed = 0; }
    }
    return p / auth;
  }
  // PLAYTEST_3 #4: a held bank turns, it does not spiral. Back-pressure for the bank plus a sink damper, faded out as
  // the player pulls or pushes themselves; full on Easy/Medium, half on Hard; never near the stall.
  function pitchAssist(ele, ac) {
    if (!ac || ac.onGround || ac.stalled) return ele;
    const b = Math.min(Math.abs(ac.bank || 0), 75 * DEG), P = ac.P || {};
    if (b < 8 * DEG || (P.vs0 && ac.speed < P.vs0 * 1.2)) return ele;
    const k = (getDifficulty?.() ?? getSettings?.().difficulty) === 'hard' ? 0.5 : 1;
    const fade = clamp(1 - Math.abs(ele) / 0.5, 0, 1);
    const need = (1 / Math.max(Math.cos(b), 0.35) - 1) * 0.4 + clamp(-(ac.vs || 0) * 0.08, -0.15, 0.5);
    return ele + k * fade * clamp(need, -0.15, 0.75);
  }
  let safeT = 0;
  addEventListener('resize', () => { safeT = 3; });
  const api = {
    el, state: st,
    // Returns the manual axes for this frame given the player's aircraft.
    update(dt, ac) {
      lastAc = ac;
      const inv = flightPrefs(getSettings?.()).invert ? -1 : 1;
      const k = st.keys;
      const m = { aileron: null, elevator: null, rudder: null, throttle: null, flaps: null, brake: null };
      // touch stick
      if (st.stick != null && st.stickLive) {
        m.aileron = expo(st.stickX); m.elevator = expo(st.stickY) * inv;
        // on the ground the same thumb steers the nosewheel (unless a rudder button is held)
        if (ac.onGround) m.rudder = clamp(st.stickX * 1.2, -1, 1);
      }
      // keyboard axes (ramped)
      const ka = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
      const ke = ((k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0)) * inv;
      const kr = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
      st.kAil = moveTo(st.kAil, ka, dt * (ka ? 2.5 : 5));
      st.kEle = moveTo(st.kEle, ke, dt * (ke ? 2 : 5));
      st.kRud = moveTo(st.kRud, kr, dt * (kr ? 3 : 6));
      if (ka || ke || Math.abs(st.kAil) > 0.01 || Math.abs(st.kEle) > 0.01) { m.aileron = st.kAil; m.elevator = st.kEle; }
      if (kr || Math.abs(st.kRud) > 0.01) m.rudder = st.kRud;
      const kt = (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal') ? 1 : 0) - (k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus') ? 1 : 0);
      if (kt) { st.kThr = clamp((st.kThr ?? ac.ctl.throttle) + kt * dt * 0.7, 0, 1); st.kThrT = KEY_THR_HOLD; }
      else if (st.kThr != null && (st.kThrT -= dt) <= 0) st.kThr = null;
      if (st.kThr != null) m.throttle = st.kThr;
      if (k.has('KeyB')) m.brake = 1;
      // gamepad
      const p = readPad();
      if (p) {
        if (p.ail || p.ele) { m.aileron = p.ail; m.elevator = p.ele * inv; }
        if (p.rud) m.rudder = p.rud;
        if (p.thrUp > 0.05 || p.thrDn > 0.05) { st.kThr = clamp((st.kThr ?? ac.ctl.throttle) + (p.thrUp - p.thrDn) * dt * 0.8, 0, 1); st.kThrT = KEY_THR_HOLD; m.throttle = st.kThr; }
        if (p.brake) m.brake = 1;
      }
      // touch cluster
      if (st.thr != null) m.throttle = st.thrVal;
      if (st.hold.brake) m.brake = 1;
      const tr = (st.hold.rudR ? 1 : 0) - (st.hold.rudL ? 1 : 0);
      st.tRud = moveTo(st.tRud || 0, tr, dt * (tr ? 4 : 8));
      if (tr || Math.abs(st.tRud) > 0.01) m.rudder = st.tRud;
      if (st.flapsManual != null) { m.flaps = st.flapsManual; if ((st.flapsT -= dt) <= 0) st.flapsManual = null; }
      // test injection wins
      if (st.inject && performance.now() < st.injectUntil) for (const a in st.inject) m[a] = st.inject[a];
      else st.inject = null;
      // D35: in a hover the stick is a speed/turn command (STOVL flight computer), no bank or pitch assists
      if (m.aileron != null && !st.inject && !(ac?.vtol > 0.5)) { m.aileron = rollAssist(m.aileron, ac, dt); m.elevator = pitchAssist(m.elevator ?? 0, ac); }
      for (const a of ['aileron', 'elevator', 'rudder']) if (m[a] != null) m[a] = clamp(m[a], -1, 1);
      return m;
    },
    // thrAxis = the player's traffic axis: a manual or latched lever shows the PLAYER's setting, not the engine's
    paint(ac, modes, view, multiView = true, thrAxis = null) {
      const mine = modes.throttle === 'manual' || modes.throttle === 'latched';
      const lv = st.thr != null ? st.thrVal : mine && thrAxis ? thrAxis.val : ac.ctl.throttle;
      const t = Math.round(clamp(lv, 0, 1) * 200) / 200, P = st.paint ||= {};
      const set = (k, v, f) => { if (P[k] !== v) { P[k] = v; f(v); } };
      set('t', t, () => { thrThumb.style.bottom = `calc(${t * 100}% - ${t * 28}px)`; thrFill.style.height = `${t * 100}%`; thrV.textContent = Math.round(t * 100); });
      set('tm', modes.throttle, (v) => { thr.dataset.mode = v; });
      set('ta', mine, (v) => { thrAuto.dataset.on = v ? '1' : ''; });
      const man = modes.elevator === 'manual' || modes.aileron === 'manual';
      set('stag', man ? (st.bankLimited ? 'BANK 60°' : 'MANUAL') : modes.elevator === 'auto' && modes.aileron === 'auto' ? 'AUTO' : 'RESUMING', (v) => { stickTag.textContent = v; });
      set('bm', man ? 'manual' : modes.elevator === 'auto' ? 'auto' : 'wait', (v) => { base.dataset.mode = v; });
      const prefs = flightPrefs(getSettings?.());
      if (st.stick == null) {
        const k = R() * 0.5, x = Math.round(ac.ctl.aileron * k * 2) / 2, y = Math.round(ac.ctl.elevator * k * (prefs.invert ? -1 : 1) * 2) / 2;
        set('knob', x + ',' + y, () => { knob.style.transform = `translate(${x}px, ${y}px)`; });
      } else P.knob = null;
      set('fl', Math.round(ac.ctl.flaps * 30), (v) => { $('.krz-flaps-v').textContent = `${v}°`; });
      set('fm', modes.flaps, (v) => { $('[data-act="flaps"]').dataset.mode = v; });
      set('bk', modes.brake, (v) => { $('[data-hold="brake"]').dataset.mode = v; });
      set('rd', modes.rudder, (v) => { $('[data-hold="rudL"]').dataset.mode = v; $('[data-hold="rudR"]').dataset.mode = v; });
      set('vw', view, (v) => { $('[data-act="view"] .krz-btn-l').textContent = v === 'cockpit' ? 'COCKPIT' : v === 'center' ? 'CENTRE' : 'CHASE'; });
      set('mv', multiView, (v) => { $('[data-act="view"]').hidden = !v; });
      set('hand', prefs.side, (v) => { el.dataset.hand = v; });
      if ((safeT -= 1) <= 0) { safeT = 20; api.publishSafeZones(); }
    },
    // RADIO's layout vars (docs/RADIO.md), measured from the real control rects so side swaps stay correct.
    publishSafeZones() {
      const r = api.rects(), W = VW, H = VH, rs = document.documentElement.style;
      const hud = document.querySelector('#krz-hud')?.getBoundingClientRect();
      const vis = !el.hidden && r.stick && r.stick.width;
      if (hud && hud.height) rs.setProperty('--krz-hud-top', Math.round(hud.bottom) + 'px');
      if (r.topR) rs.setProperty('--krz-tr-top', Math.round(r.topR.bottom + 6) + 'px');
      if (!vis) return;
      const zones = [r.stick, r.thrCol || r.thr, r.pad].filter(Boolean);
      const top = Math.min(...zones.map((z) => z.top));
      const leftZ = zones.filter((z) => z.left + z.width / 2 < W / 2), rightZ = zones.filter((z) => z.left + z.width / 2 >= W / 2);
      const lw = leftZ.length ? Math.max(...leftZ.map((z) => z.right)) : 0;
      const rw = rightZ.length ? W - Math.min(...rightZ.map((z) => z.left)) : 0;
      const rh = rightZ.length ? H - Math.min(...rightZ.map((z) => z.top)) : 0;
      rs.setProperty('--krz-ctl-bottom', Math.round(H - top) + 'px');
      rs.setProperty('--krz-ctl-left', Math.round(lw) + 'px');
      rs.setProperty('--krz-ctl-right', Math.round(rw) + 'px');
      rs.setProperty('--krz-ctl-right-h', Math.round(rh) + 'px');
      rs.setProperty('--krz-tr-w', '78px');
      // D15: RADIO's button sits just above BRAKE (whichever side the cluster is on).
      if (r.brake?.width) {
        rs.setProperty('--krz-brake-cx', Math.round(r.brake.left + r.brake.width / 2) + 'px');
        rs.setProperty('--krz-brake-b', Math.round(H - r.brake.top) + 'px');
      }
      document.documentElement.dataset.krzHand = flightPrefs(getSettings?.()).side;
    },
    inject(c, ms = 1000) { st.inject = c; st.injectUntil = performance.now() + ms; },
    release() { st.inject = null; st.flapsManual = null; st.kThr = null; },
    releaseThrottle() { st.kThr = null; if (st.thr != null) { st.thr = null; thr.classList.remove('krz-active'); } },
    setVisible(v) { st.visible = v; el.hidden = !v; },
    look: st.look,
    rects() {
      const q = (s) => el.querySelector(s)?.getBoundingClientRect();
      return { stick: q('.krz-stick-zone'), thr: q('.krz-thr'), thrCol: q('.krz-thr-col'), thrAuto: q('.krz-thr-auto'), pad: q('.krz-pad'), brake: q('[data-hold="brake"]'), topL: q('.krz-top-l'), topR: q('.krz-top-r') };
    },
  };
  return api;
}

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  view: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  fs: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

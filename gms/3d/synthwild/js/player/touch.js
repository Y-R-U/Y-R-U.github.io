// Bedrock-style touch widgets: floating move stick, right-side look, action buttons, pinch = scale,
// two-finger drag = volume. All DOM lives in #ui-root under .swp-touch.

const CSS = `
.swp-touch{position:absolute;inset:0;pointer-events:none;z-index:4;user-select:none;-webkit-user-select:none;
  -webkit-touch-callout:none;font-family:system-ui,sans-serif}
.swp-touch.hide{display:none}
.swp-zone{position:absolute;inset:0;pointer-events:auto;touch-action:none;z-index:1}
.swp-btn{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;display:grid;place-items:center;z-index:3;
  background:radial-gradient(circle at 50% 35%,rgba(120,240,255,.16),rgba(10,24,44,.34) 70%);
  border:1.5px solid rgba(150,250,255,.42);box-shadow:0 0 12px rgba(80,230,255,.18),inset 0 0 10px rgba(120,240,255,.12);
  -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);transition:transform .08s,background .08s,border-color .08s}
.swp-btn svg{width:52%;height:52%;fill:none;stroke:#eaffff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;
  filter:drop-shadow(0 0 3px rgba(90,240,255,.7));opacity:.92}
.swp-btn.small{border-radius:14px}
.swp-btn.on{transform:scale(.92);background:radial-gradient(circle at 50% 35%,rgba(140,255,255,.5),rgba(20,80,110,.5) 75%);border-color:#bfffff}
.swp-btn.break{border-color:rgba(255,170,110,.55);box-shadow:0 0 12px rgba(255,140,70,.22),inset 0 0 10px rgba(255,160,90,.14)}
.swp-btn.break svg{stroke:#fff1e4;filter:drop-shadow(0 0 3px rgba(255,140,60,.8))}
.swp-btn.break.on{background:radial-gradient(circle at 50% 35%,rgba(255,190,130,.55),rgba(110,40,20,.5) 75%);border-color:#ffd2b0}
.swp-btn.toggled{border-color:#8dff9b;box-shadow:0 0 14px rgba(120,255,140,.45)}
.swp-stick{position:absolute;width:118px;height:118px;margin:-59px 0 0 -59px;border-radius:50%;pointer-events:none;z-index:2;
  border:1.5px solid rgba(150,250,255,.35);background:radial-gradient(circle,rgba(90,220,255,.10),rgba(10,24,44,.22) 70%);
  transition:opacity .2s}
.swp-stick.idle{opacity:.45}
.swp-stick.sprint{border-color:#ffe27a;box-shadow:0 0 18px rgba(255,220,100,.5)}
.swp-knob{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;
  background:radial-gradient(circle at 50% 35%,rgba(210,255,255,.75),rgba(60,190,230,.45) 70%);
  box-shadow:0 0 14px rgba(90,240,255,.6)}
.swp-touch.big .swp-btn{zoom:1.18}
`;

const ICON = {
  jump: '<path d="M12 19V6M6 11l6-6 6 6"/>',
  crouch: '<path d="M12 5v13M6 13l6 6 6-6"/>',
  break: '<path d="M5 19l8-8"/><path d="M10 6c3-2 7-1 9 2l-3 1-4-1z"/><path d="M15 3l1 3M20 13l-3-1"/>',
  place: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20"/>',
  inventory: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  view: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
};

// side: 'r' = anchored to the action side (right by default), 'l' = the stick side.
const LAYOUT = [
  // The right cluster stays inside ~200 px of the edge so it never covers the centred hotbar.
  { id: 'jump', side: 'r', x: 20, y: 20, s: 82, hold: 'jump' },
  { id: 'break', side: 'r', x: 116, y: 64, s: 68, hold: 'primary', look: true, cls: 'break' },
  { id: 'place', side: 'r', x: 36, y: 122, s: 68, hold: 'secondary', look: true },
  { id: 'crouch', side: 'l', x: 26, y: 178, s: 52, toggle: 'crouch' },
  // The HUD (lane 5) has its own wheel/bag/pause buttons; these show only when it is absent.
  { id: 'wheel', side: 'r', x: 16, y: -16, s: 48, ev: 'wheel', top: true, cls: 'small', hud: true },
  { id: 'inventory', side: 'r', x: 74, y: -16, s: 48, ev: 'inventory', top: true, cls: 'small', hud: true },
  { id: 'pause', side: 'l', x: 14, y: -14, s: 42, ev: 'pause', top: true, cls: 'small', hud: true },
  { id: 'view', side: 'l', x: 14, y: -14, s: 42, ev: 'toggleView', top: true, cls: 'small' },
  { id: 'undo', side: 'l', x: 14, y: -14, s: 42, ev: 'undo', top: true, cls: 'small', build: true },
  { id: 'redo', side: 'l', x: 14, y: -14, s: 42, ev: 'redo', top: true, cls: 'small', build: true },
  { id: 'paste', side: 'l', x: 14, y: -14, s: 42, ev: 'paste', top: true, cls: 'small', build: true, clip: true },
];

const STICK_R = 56;

export function createTouch(input, ctx) {
  const root = ctx.uiRoot || document.getElementById('ui-root') || document.body;
  if (!document.getElementById('swp-style')) {
    const st = document.createElement('style'); st.id = 'swp-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('div'); el.className = 'swp-touch hide';
  const zone = document.createElement('div'); zone.className = 'swp-zone';
  const stick = document.createElement('div'); stick.className = 'swp-stick idle';
  const knob = document.createElement('div'); knob.className = 'swp-knob';
  stick.appendChild(knob); el.append(zone, stick);
  root.appendChild(el);

  const btns = {};
  for (const L of LAYOUT) {
    const b = document.createElement('div');
    b.className = 'swp-btn ' + (L.cls || '');
    b.dataset.btn = L.id;
    b.innerHTML = `<svg viewBox="0 0 24 24">${ICON[L.id]}</svg>`;
    b.style.width = b.style.height = L.s + 'px';
    el.appendChild(b);
    btns[L.id] = { el: b, L };
  }

  const touches = new Map();     // id -> {kind, x, y, ...}
  const st = { stickId: null, sx: 0, sy: 0, vx: 0, vy: 0, sprint: false, crouch: false, gesture: null, left: false };

  function layout() {
    st.left = !!input.setting('leftHanded', false);
    const hud = !!ctx.ui?.hud, build = ctx.session?.mode === 'build', clip = !!ctx.brush?.tools?.clip;
    let row = 0;     // the top-left row packs whichever small buttons are showing
    for (const { el: b, L } of Object.values(btns)) {
      const hidden = (L.hud && hud) || (L.build && !build) || (L.clip && !clip);
      b.style.display = hidden ? 'none' : '';
      let x = L.x;
      if (L.side === 'l' && L.top && !hidden) x = 14 + 50 * row++;
      const right = (L.side === 'r') !== st.left;
      b.style.left = right ? '' : x + 'px';
      b.style.right = right ? x + 'px' : '';
      if (L.top) { b.style.top = -L.y + 'px'; b.style.bottom = ''; } else { b.style.bottom = L.y + 'px'; b.style.top = ''; }
    }
    el.classList.toggle('big', (input.setting('uiScale', 1) || 1) > 1.05);
    box = null;
    idleStick();
  }
  function idleStick() {
    const { w, h } = box || measure();
    stick.style.left = (st.left ? w - 96 : 96) + 'px';
    stick.style.top = (h - 96) + 'px';
    knob.style.transform = '';
    stick.classList.add('idle'); stick.classList.remove('sprint');
  }
  // The zone's rect, measured on layout/resize only: a layout read per touchmove would force a reflow each time.
  let box = null;
  const measure = () => { const r = el.getBoundingClientRect(); box = { l: r.left, t: r.top, w: r.width || innerWidth, h: r.height || innerHeight }; return box; };
  const isStickSide = x => {
    const w = (box || measure()).w;
    return st.left ? x > w * 0.6 : x < w * 0.4;
  };
  const local = t => { const b = box || measure(); return [t.clientX - b.l, t.clientY - b.t]; };

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    input.setDevice('touch');
    for (const t of e.changedTouches) {
      const [x, y] = local(t);
      if (st.stickId === null && isStickSide(x)) {
        st.stickId = t.identifier; st.sx = x; st.sy = y;
        const { w, h } = box || measure();
        st.sx = Math.min(Math.max(x, 64), w - 64); st.sy = Math.min(Math.max(y, 64), h - 64);
        stick.style.left = st.sx + 'px'; stick.style.top = st.sy + 'px';
        stick.classList.remove('idle');
        touches.set(t.identifier, { kind: 'stick' });
        moveStick(x, y);
      } else {
        touches.set(t.identifier, { kind: 'look', x, y });
        const looks = [...touches].filter(([, v]) => v.kind === 'look');
        if (looks.length === 2) {
          const [a, b] = looks.map(([, v]) => v);
          st.gesture = { ids: looks.map(([k]) => k), d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, kind: null, acc: 0 };
        }
      }
    }
  }, { passive: false });

  for (const { el: b, L } of Object.values(btns)) {
    b.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      input.setDevice('touch');
      for (const t of e.changedTouches) {
        const [x, y] = local(t);
        touches.set(t.identifier, { kind: 'btn', id: L.id, x, y });
        b.classList.add('on');
        if (L.hold) input.setHeld(L.hold, 'touch:' + L.id, true);
        if (L.toggle) { st.crouch = !st.crouch; input.setHeld('crouch', 'touch:crouch', st.crouch); b.classList.toggle('toggled', st.crouch); }
        if (L.ev) input.emit(L.ev);
      }
    }, { passive: false });
    b.addEventListener('mousedown', e => { if (L.ev) { e.stopPropagation(); input.emit(L.ev); } });
  }

  function moveStick(x, y) {
    let dx = x - st.sx, dy = y - st.sy;
    const d = Math.hypot(dx, dy);
    st.sprint = d > STICK_R * 1.3 && -dy > Math.abs(dx);
    const k = d > STICK_R ? STICK_R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    st.vx = dx / STICK_R; st.vy = -dy / STICK_R;
    stick.classList.toggle('sprint', st.sprint);
    input.setHeld('sprint', 'touch:stick', st.sprint);
  }

  const lookScale = () => 0.0062 * (input.setting('sensitivity', 1) || 1);

  addEventListener('touchmove', e => {
    let used = false;
    for (const t of e.changedTouches) {
      const o = touches.get(t.identifier);
      if (!o) continue;
      used = true;
      const [x, y] = local(t);
      if (o.kind === 'stick') { moveStick(x, y); continue; }
      const g = st.gesture;
      if (o.kind === 'look' && g && g.ids.includes(t.identifier)) {
        o.x = x; o.y = y;
        const [a, b] = g.ids.map(id => touches.get(id));
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (!g.kind) {
          const dd = Math.abs(d - g.d0), dc = Math.hypot(cx - g.cx, cy - g.cy);
          if (dd > 28 && dd > dc) { g.kind = 'pinch'; g.d0 = d; }
          else if (dc > 18) { g.kind = 'drag'; g.cx = cx; g.cy = cy; input.volumeDrag = true; }
        } else if (g.kind === 'pinch') {
          const steps = Math.trunc((d - g.d0) / 64);
          if (steps) { input.emit('scale', Math.sign(steps)); g.d0 += steps * 64; }
        } else {
          input.addLook((cx - g.cx) * lookScale(), (cy - g.cy) * lookScale());
          g.cx = cx; g.cy = cy;
        }
        continue;
      }
      if (o.kind === 'look' || (o.kind === 'btn' && btns[o.id].L.look)) {
        input.addLook((x - o.x) * lookScale(), (y - o.y) * lookScale());
        o.x = x; o.y = y;
      }
    }
    if (used && e.cancelable) e.preventDefault();
  }, { passive: false });

  const end = e => {
    for (const t of e.changedTouches) {
      const o = touches.get(t.identifier);
      if (!o) continue;
      touches.delete(t.identifier);
      if (o.kind === 'stick') { st.stickId = null; st.vx = st.vy = 0; st.sprint = false; input.setHeld('sprint', 'touch:stick', false); idleStick(); }
      else if (o.kind === 'btn') {
        const { el: b, L } = btns[o.id];
        b.classList.remove('on');
        if (L.hold) input.setHeld(L.hold, 'touch:' + L.id, false);
      }
      if (st.gesture?.ids.includes(t.identifier)) { st.gesture = null; input.volumeDrag = false; }
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  addEventListener('resize', () => setTimeout(layout, 50));
  ctx.settings?.on?.('leftHanded', layout);
  ctx.settings?.on?.('uiScale', layout);
  layout();

  return {
    el, btns,
    show(on) { el.classList.toggle('hide', !on); if (on) layout(); },
    reset() {
      touches.clear(); st.stickId = null; st.vx = st.vy = 0; st.gesture = null; input.volumeDrag = false;
      for (const { el: b } of Object.values(btns)) b.classList.remove('on');
      idleStick();
    },
    setCrouch(on) { st.crouch = on; input.setHeld('crouch', 'touch:crouch', on); btns.crouch.el.classList.toggle('toggled', on); },
    layout,
    update() {
      const key = `${!!ctx.ui?.hud}${ctx.session?.mode}${!!ctx.brush?.tools?.clip}`;
      if (key !== this._key) { this._key = key; layout(); }
      const h = ctx.brush?.tools?.history;
      if (h) { btns.undo.el.style.opacity = h.canUndo ? '' : '.35'; btns.redo.el.style.opacity = h.canRedo ? '' : '.35'; }
      const paused = !!ctx.session?.paused || !input.enabled || ctx.session?.playing === false;
      el.style.visibility = paused ? 'hidden' : '';
      if (paused && touches.size) this.reset();
      return [st.vx, st.vy];
    },
  };
}

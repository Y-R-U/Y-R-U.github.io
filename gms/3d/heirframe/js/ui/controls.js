import { h, clamp, haptic, store } from './core.js';
import { icon } from './icons.js';

const RADIUS = 52;
const DEAD = 0.12;

export function createControls(bus) {
  const el = h('div.hf-controls.hf-layer');
  const zone = h('div.hf-joyzone.hf-live');
  const base = h('div.hf-joy', { html: '<div class="rim"></div><div class="dir"></div><div class="knob"></div>' });
  const knob = base.querySelector('.knob'), dir = base.querySelector('.dir');
  zone.append(base);

  const cluster = h('div.hf-actions');
  const attack = h('button.hf-attack.hf-live', { 'aria-label': 'Attack', html: `<span class="ic">${icon('fist')}</span><kbd>F</kbd>` });
  const dodge = h('button.hf-skill.hf-dodge.hf-live', { 'aria-label': 'Dodge', html: `<span class="ic">${icon('dodge')}</span><i class="cd"></i><b class="t hf-num"></b><kbd>␣</kbd>` });
  const skillEls = [0, 1, 2, 3].map(i => h(`button.hf-skill.hf-live.s${i}`, { html: `<span class="ic"></span><i class="cd"></i><b class="t hf-num"></b><kbd>${i < 3 ? i + 1 : 'Q'}</kbd><span class="cost hf-num"></span>` }));
  skillEls[3].classList.add('hf-heir');
  const kit = h('button.hf-kit.hf-live.empty', { 'aria-label': 'Repair kit', html: `<span class="ic">${icon('heal')}</span><b class="n hf-num"></b><kbd>R</kbd>` });
  cluster.append(...skillEls, dodge, attack, kit);
  el.append(zone, cluster);

  const move = { x: 0, y: 0 };
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, t0: 0, moved: 0 };
  const keys = new Set();
  let skills = [];
  const skillState = [{}, {}, {}, {}];

  const api = {
    el,
    move,
    attackHeld: false,
    get sneak() { const m = Math.hypot(move.x, move.y); return m > 0 && m < .45; },
    setAttack({ icon: ic = 'fist', label } = {}) {
      attack.querySelector('.ic').innerHTML = icon(ic);
      if (label) attack.setAttribute('aria-label', label);
    },
    setSide(side) { el.classList.toggle('swap', side === 'right'); },
    keysDown: keys,
  };

  function homeJoy() {
    base.classList.remove('active');
    base.style.left = ''; base.style.top = '';
    knob.style.transform = ''; dir.style.opacity = '0';
  }

  function updateMove() {
    let x = 0, y = 0;
    if (joy.id != null) { x = joy.x; y = joy.y; }
    else {
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) { x *= .4; y *= .4; }
    }
    move.x = x; move.y = y;
  }
  api._updateMove = updateMove;

  zone.addEventListener('pointerdown', e => {
    if (joy.id != null) return;
    e.preventDefault(); e.stopPropagation();
    zone.setPointerCapture(e.pointerId);
    const zr = zone.getBoundingClientRect();
    const hs = parseFloat(el.parentElement?.style.getPropertyValue('--hs')) || 1;
    const m = (RADIUS + 20) * hs;
    joy.id = e.pointerId; joy.t0 = performance.now(); joy.moved = 0;
    joy.sx = e.clientX; joy.sy = e.clientY;
    joy.ox = clamp(e.clientX, zr.left + m, zr.right - m);
    joy.oy = clamp(e.clientY, zr.top + m, zr.bottom - m);
    base.style.left = `${joy.ox - zr.left}px`; base.style.top = `${joy.oy - zr.top}px`;
    base.classList.add('active');
    joy.x = joy.y = 0; joy.hs = hs;
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    const r = RADIUS * joy.hs;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    joy.moved = Math.max(joy.moved, Math.hypot(e.clientX - joy.sx, e.clientY - joy.sy));
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    knob.style.transform = `translate(${dx / joy.hs}px, ${dy / joy.hs}px)`;
    let mx = dx / r, my = dy / r;
    const m = Math.hypot(mx, my);
    if (m < DEAD) { mx = my = 0; dir.style.opacity = '0'; }
    else {
      const k = (m - DEAD) / (1 - DEAD) / m; mx *= k; my *= k;
      dir.style.opacity = String(Math.min(1, m * 1.4));
      dir.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    }
    joy.x = mx; joy.y = my;
    updateMove();
  });
  const endJoy = e => {
    if (e.pointerId !== joy.id) return;
    const quick = performance.now() - joy.t0 < 250 && joy.moved < 12;
    joy.id = null; joy.x = joy.y = 0;
    homeJoy(); updateMove();
    if (quick) bus.emit('tap', { x: e.clientX, y: e.clientY });
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
  zone.addEventListener('lostpointercapture', endJoy);

  function press(btn, down, up) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.classList.add('pressed'); haptic(10); down();
    });
    const end = e => { if (!btn.classList.contains('pressed')) return; btn.classList.remove('pressed'); up && up(); e.stopPropagation(); };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', e => e.stopPropagation());
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }

  press(attack, () => { api.attackHeld = true; bus.emit('attack'); }, () => { api.attackHeld = false; bus.emit('attackUp'); });
  press(kit, () => { if (kit.classList.contains('empty') || kit.classList.contains('cooling')) return deny(kit); bus.emit('kit'); });
  press(dodge, () => { if (dodge.classList.contains('cooling')) return deny(dodge); bus.emit('dodge'); });
  skillEls.forEach((b, i) => press(b, () => {
    const s = skills[i];
    if (!s) return;
    if (s.cd > 0 || s.ready === false) return deny(b);
    bus.emit('skill', s.id);
  }));

  function deny(b) {
    b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny');
    bus.emit('sfx', 'deny');
  }

  function paintCd(b, st, cd, cdMax) {
    const p = cd > 0 && cdMax > 0 ? clamp(cd / cdMax, 0, 1) : 0;
    if (st.p !== p) { b.style.setProperty('--p', p); st.p = p; }
    const t = cd > 0 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '';
    if (st.t !== t) { b.querySelector('.t').textContent = t; st.t = t; }
    const cooling = cd > 0;
    if (st.cooling && !cooling) { b.classList.remove('readyflash'); void b.offsetWidth; b.classList.add('readyflash'); }
    if (st.cooling !== cooling) { b.classList.toggle('cooling', cooling); st.cooling = cooling; }
  }

  api.setSkills = list => {
    skills = list || [];
    skillEls.forEach((b, i) => {
      const s = skills[i], st = skillState[i];
      b.classList.toggle('empty', !s);
      if (!s) return;
      if (st.icon !== s.icon) { b.querySelector('.ic').innerHTML = icon(s.icon || 'sparkle'); st.icon = s.icon; b.setAttribute('aria-label', s.label || s.id); }
      const cost = s.cost ? String(s.cost) : '';
      if (st.cost !== cost) { b.querySelector('.cost').textContent = cost; st.cost = cost; }
      if (s.key && st.key !== s.key) { b.querySelector('kbd').textContent = s.key; st.key = s.key; }
      const nr = s.ready === false;
      if (st.nr !== nr) { b.classList.toggle('noready', nr); st.nr = nr; }
      paintCd(b, st, s.cd || 0, s.cdMax || 0);
    });
  };
  let kitN = -1;
  api.setKit = (n, { cooling = false } = {}) => {
    if (n !== kitN) { kitN = n; kit.querySelector('.n').textContent = n > 0 ? String(n) : ''; kit.classList.toggle('empty', !(n > 0)); }
    kit.classList.toggle('cooling', !!cooling);
  };
  const dodgeState = {};
  api.setDodge = (cd, cdMax) => paintCd(dodge, dodgeState, cd || 0, cdMax || 0);

  api.onKey = (e, down) => {
    const k = e.code;
    if (/^(Key[WASD]|Arrow|Shift)/.test(k)) { down ? keys.add(k) : keys.delete(k); updateMove(); return !k.startsWith('Shift'); }
    if (e.repeat) return false;
    const map = {
      KeyF: attack, KeyJ: attack, Space: dodge, Digit1: skillEls[0], Digit2: skillEls[1], Digit3: skillEls[2],
      KeyK: skillEls[0], KeyL: skillEls[1], Semicolon: skillEls[2], KeyQ: skillEls[3], Digit4: skillEls[3], KeyR: kit,
    };
    const b = map[k];
    if (!b) return false;
    b.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { pointerId: 99, bubbles: true }));
    return true;
  };
  api.releaseAll = () => { keys.clear(); joy.id = null; joy.x = joy.y = 0; homeJoy(); updateMove(); };

  api.setSide(store.settings.joystick);
  api.setSkills([]);
  homeJoy();
  return api;
}

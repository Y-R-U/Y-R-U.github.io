// ui.js — HUD chrome: toasts, modals, the connect overlay, resume glow,
// speed pill, drive joystick. All popups are styled in-DOM (never alert()).

const $ = (id) => document.getElementById(id);

export const ui = {
  joy: { x: 0, y: 0 },
  handlers: {},

  init(handlers) {
    this.handlers = handlers;
    $('resume').addEventListener('click', (e) => { e.stopPropagation(); handlers.onResume(); });
    $('speed').addEventListener('click', (e) => { e.stopPropagation(); handlers.onSpeed(); });
    $('exitcar').addEventListener('click', (e) => { e.stopPropagation(); handlers.onExitCar(); });
    $('audio').addEventListener('click', (e) => { e.stopPropagation(); handlers.onAudio(); });
    $('chip').addEventListener('click', (e) => { e.stopPropagation(); handlers.onChipTap(); });
    $('modal-close').addEventListener('click', () => this.closeModal());
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) this.closeModal(); });
    this._joystick();
  },

  toast(text, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, ms);
  },

  modal({ title, body, mono = false }) {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    $('modal-body').classList.toggle('mono', mono);
    $('modal').classList.remove('hidden');
  },
  closeModal() { $('modal').classList.add('hidden'); },
  modalOpen() { return !$('modal').classList.contains('hidden'); },

  // the "decompiling" overlay while a world builds
  showConnect(uuid, lines) {
    const el = $('connect');
    el.classList.remove('hidden');
    $('connect-uuid').textContent = uuid;
    const out = $('connect-lines');
    out.innerHTML = '';
    let i = 0;
    const step = () => {
      if (i >= lines.length || el.classList.contains('hidden')) return;
      const [k, v] = lines[i++];
      const row = document.createElement('div');
      row.innerHTML = `<span class="ck">${k}</span><span class="cv">${v}</span>`;
      out.appendChild(row);
      setTimeout(step, 150);
    };
    setTimeout(step, 250);
  },
  hideConnect() { $('connect').classList.add('hidden'); },

  fade(toBlack, ms = 600) {
    const f = $('fade');
    f.style.transitionDuration = ms + 'ms';
    f.classList.toggle('black', toBlack);
    return new Promise((res) => setTimeout(res, ms));
  },

  setChip(uuid) { $('chip').textContent = uuid; },
  showChip(b) { $('chip').classList.toggle('hidden', !b); },
  showResume(b) { $('resume').classList.toggle('hidden', !b); },
  setSpeed(n) { $('speed').textContent = n + '×'; },
  showSpeed(b) { $('speed').classList.toggle('hidden', !b); },
  showExitCar(b) { $('exitcar').classList.toggle('hidden', !b); },
  showJoy(b) { $('joy').classList.toggle('hidden', !b); if (!b) { this.joy.x = 0; this.joy.y = 0; } },
  setAudioIcon(muted) { $('audio').textContent = muted ? '\u{1F507}' : '\u{1F50A}'; },

  poi(text) {
    const el = $('poi');
    if (text && el.dataset.cur !== text) {
      el.dataset.cur = text;
      el.textContent = text;
      el.classList.add('on');
    } else if (!text) {
      el.dataset.cur = '';
      el.classList.remove('on');
    }
  },

  _joystick() {
    const zone = $('joy'), knob = $('joy-knob');
    let pid = null, cx = 0, cy = 0;
    const R = 52;
    const set = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.joy.x = dx / R;
      this.joy.y = -dy / R;
    };
    zone.addEventListener('pointerdown', (e) => {
      pid = e.pointerId;
      const r = zone.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      set(e.clientX - cx, e.clientY - cy);
      zone.setPointerCapture(pid);
      e.stopPropagation();
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { set(e.clientX - cx, e.clientY - cy); e.stopPropagation(); } });
    const end = (e) => { if (e.pointerId === pid) { pid = null; set(0, 0); } };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  },
};

export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  ta.remove();
}

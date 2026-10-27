// Radio HUD (DESIGN §6): subtitle pills + log drawer, tower outrage badge, radio button with countdown ring, bark chips.

const RING_R = 33;
// MSGFIX: a finished line lingers 2.2 s (0.6 s while the player is busy: hand-flying, low, or a sheet is open; main.js
// sets html.krz-msg-busy). Only the newest card shows; older ones fold into its "+n" transcript badge (tap = log).
const HOLD = 2.2, HOLD_BUSY = 0.6;
const busy = () => document.documentElement.classList.contains('krz-msg-busy');
const holdFor = (h) => Math.min(h, busy() ? HOLD_BUSY : HOLD);
const RING_C = 2 * Math.PI * RING_R;
const LOG_MAX = 20;

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ICONS = {
  radio: '<path d="M9 4l14 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><rect x="4" y="10" width="24" height="18" rx="4" fill="currentColor"/><circle cx="12" cy="19" r="4.2" fill="#1b2230"/><rect x="19" y="15" width="6" height="2.4" rx="1" fill="#1b2230"/><rect x="19" y="20" width="6" height="2.4" rx="1" fill="#1b2230"/>',
  tower: '<path d="M12 29h8l-1.5-14h-5z" fill="currentColor"/><path d="M9 9h14l-2 6H11z" fill="currentColor"/><path d="M16 9V4" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="3.5" r="1.6" fill="currentColor"/>',
  crown: '<path d="M5 24l-1-14 7 6 5-9 5 9 7-6-1 14z" fill="currentColor"/><rect x="5" y="25" width="22" height="3" rx="1" fill="currentColor"/>',
  zap: '<path d="M18 3L7 18h7l-2 11 11-15h-7z" fill="currentColor"/>',
  chat: '<path d="M5 7h22v13H14l-6 5v-5H5z" fill="currentColor"/>',
  star: '<path d="M16 3l3.8 8 8.7 1-6.4 6 1.7 8.7L16 22.4 8.2 26.7 9.9 18 3.5 12l8.7-1z" fill="currentColor"/>',
  sorry: '<circle cx="16" cy="16" r="12" fill="currentColor"/><path d="M11 21q5-4 10 0" stroke="#1b2230" stroke-width="2" fill="none"/><circle cx="12" cy="13" r="1.6" fill="#1b2230"/><circle cx="20" cy="13" r="1.6" fill="#1b2230"/>',
  wave: '<path d="M10 28V12a2 2 0 014 0v8V6a2 2 0 014 0v14V8a2 2 0 014 0v14l2-4a2 2 0 013 2l-4 8a6 6 0 01-5 2h-3a5 5 0 01-5-4z" fill="currentColor"/>',
  plane: '<path d="M16 3c1.2 0 2 1 2 3v7l10 6v3l-10-3v6l3 2v2l-5-1-5 1v-2l3-2v-6L4 22v-3l10-6V6c0-2 .8-3 2-3z" fill="currentColor"/>',
  bump: '<circle cx="11" cy="16" r="6" fill="currentColor"/><circle cx="23" cy="16" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16 6v3M16 23v3M13 8l1 2M19 8l-1 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const icon = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true">${ICONS[k] || ICONS.chat}</svg>`;

// face: 0 Professional, 1 Strained, 2 Cracking, 3 Meltdown, 4 Royal Scandal.
export function faceSVG(face) {
  const skin = ['#f3cfa6', '#f4bf94', '#f6a07a', '#ff6a48', '#ff4a3a'][face];
  const mouth = [
    '<path d="M13 25 Q20 31 27 25" stroke="#3b1d14" stroke-width="2" fill="none" stroke-linecap="round"/>',
    '<path d="M14 27 L26 27" stroke="#3b1d14" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M12 27 Q14 24 16 27 T20 27 T24 27 T28 27" stroke="#3b1d14" stroke-width="2" fill="none" stroke-linecap="round"/>',
    '<ellipse cx="20" cy="28" rx="5" ry="4.2" fill="#3b1d14"/><ellipse cx="20" cy="30" rx="3" ry="1.5" fill="#e0475a"/>',
    '<ellipse cx="20" cy="28.5" rx="3.4" ry="3.6" fill="#3b1d14"/>',
  ][face];
  const eyes = [
    '<circle cx="15" cy="18" r="1.6" fill="#3b1d14"/><circle cx="25" cy="18" r="1.6" fill="#3b1d14"/>',
    '<path d="M12.5 18 h5 M22.5 18 h5" stroke="#3b1d14" stroke-width="2" stroke-linecap="round"/><path d="M12 14.5 l5 1 M28 14.5 l-5 1" stroke="#3b1d14" stroke-width="1.4" stroke-linecap="round"/>',
    '<circle cx="15" cy="18" r="2.6" fill="#fff" stroke="#3b1d14" stroke-width="1"/><circle cx="15" cy="18" r="1" fill="#3b1d14"/><circle cx="25" cy="18" r="2.6" fill="#fff" stroke="#3b1d14" stroke-width="1"/><circle cx="25" cy="18" r="1" fill="#3b1d14"/>',
    '<circle cx="15" cy="18" r="3.2" fill="#fff" stroke="#3b1d14" stroke-width="1"/><circle cx="15.6" cy="18.4" r="1" fill="#3b1d14"/><circle cx="25" cy="18" r="3.2" fill="#fff" stroke="#3b1d14" stroke-width="1"/><circle cx="24.4" cy="17.6" r="1" fill="#3b1d14"/><path d="M11 13 L18 15.5 M29 13 L22 15.5" stroke="#3b1d14" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M12.5 15.5 l5 5 m0 -5 l-5 5 M22.5 15.5 l5 5 m0 -5 l-5 5" stroke="#3b1d14" stroke-width="2" stroke-linecap="round"/>',
  ][face];
  const drop = (x, y) => `<path d="M${x} ${y} q2.4 3.8 0 5 q-2.4 -1.2 0 -5z" fill="#5ab8ff"/>`;
  const sweat = (face >= 2 ? drop(32, 12) : '') + (face >= 3 ? drop(8, 14) : '');
  const steam = face >= 3 ? '<g class="krz-steam" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"><path d="M6 7 q2 -2 0 -4"/><path d="M34 7 q-2 -2 0 -4"/><path d="M20 2.5 q2 -1.5 0 -3"/></g>' : '';
  const paper = face === 4 ? '<g transform="translate(25 25) rotate(-12)"><rect width="15" height="11" fill="#f4efe6" stroke="#3b1d14" stroke-width=".8"/><path d="M2 3h11M2 6h7M2 8.5h9" stroke="#3b1d14" stroke-width="1"/></g>' : '';
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${steam}<circle cx="20" cy="21" r="13" fill="${skin}" stroke="#3b1d14" stroke-width="1.4"/>${eyes}${mouth}<path d="M7 21 Q7 6 20 6 Q33 6 33 21" stroke="#2a2f3a" stroke-width="2.6" fill="none"/><rect x="4.5" y="18" width="5" height="8" rx="2" fill="#2a2f3a"/><rect x="30.5" y="18" width="5" height="8" rx="2" fill="#2a2f3a"/><path d="M8 26 Q10 32 15 31" stroke="#2a2f3a" stroke-width="1.6" fill="none"/>${sweat}${paper}</svg>`;
}

export function createRadioHud(parent, { onChoose, onOpenMenu, onClose } = {}) {
  const root = el('div', 'krz-radio');

  const subs = el('div', 'krz-r-subs');
  subs.setAttribute('aria-live', 'polite');
  const drawer = el('div', 'krz-r-drawer');
  drawer.hidden = true;
  drawer.innerHTML = '<div class="krz-r-drawer-head"><b>RADIO LOG</b><span>tap to close</span></div><div class="krz-r-drawer-list"></div>';
  const drawerList = drawer.querySelector('.krz-r-drawer-list');

  const tower = el('div', 'krz-r-tower');
  tower.innerHTML = '<div class="krz-r-face"></div><div class="krz-r-tower-txt"><b>TOWER</b><span></span><i class="krz-r-meter"><i></i></i></div>';

  const btn = el('button', 'krz-r-btn', `<svg class="krz-r-btn-ring" viewBox="0 0 72 72"><circle cx="36" cy="36" r="${RING_R}" class="krz-r-ring-fg" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>${icon('radio', 'krz-r-btn-ico')}<span class="krz-r-btn-lbl">RADIO</span><i class="krz-r-btn-cd"></i>`);
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Radio: bark at someone');
  const ringFg = btn.querySelector('.krz-r-ring-fg');

  const panel = el('div', 'krz-r-panel');
  panel.hidden = true;
  panel.innerHTML = '<div class="krz-r-head"><div class="krz-r-title"><b></b><span></span></div><span class="krz-r-secs"></span><button type="button" class="krz-r-x" aria-label="Close">&times;</button></div><div class="krz-r-chips"></div>';
  const chipsEl = panel.querySelector('.krz-r-chips');
  const secsEl = panel.querySelector('.krz-r-secs');

  root.append(subs, drawer, tower, panel, btn);
  parent.appendChild(root);

  const stop = (e) => e.stopPropagation();
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) for (const n of [panel, btn, subs, drawer]) n.addEventListener(ev, stop, { passive: true });
  btn.addEventListener('click', () => onOpenMenu?.());
  panel.querySelector('.krz-r-x').addEventListener('click', () => onClose?.());
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.krz-r-chip');
    if (b && !b.disabled) onChoose?.(+b.dataset.i);
  });

  let logOpen = false, logIdle = 0, swipeY = null, subtitlesOn = true;
  const setLog = (on) => { logOpen = on; drawer.hidden = !on; subs.classList.toggle('dim', on); logIdle = 0; if (on) drawerList.scrollTop = drawerList.scrollHeight; };
  subs.addEventListener('click', () => setLog(!logOpen));
  drawer.addEventListener('click', () => setLog(false));
  drawerList.addEventListener('scroll', () => (logIdle = 0), { passive: true });
  subs.addEventListener('pointerdown', (e) => (swipeY = e.clientY));
  subs.addEventListener('pointerup', (e) => { if (swipeY != null && e.clientY - swipeY > 30) setLog(true); swipeY = null; });

  let lastPill = null, recent = [];
  const header = (speaker, to) => `<b>${esc(speaker)}</b>${to ? `<span class="krz-r-arrow">&rarr;</span><span class="krz-r-to">${esc(to)}</span>` : ''}`;

  return {
    root,
    addLog({ speaker, to, color, text, isTower, isPlayer, tier }) {
      // PLAYTEST_1 B8: the same line twice in a row (two infractions together) shows once.
      const key = `${speaker}|${text}`, nowMs = performance.now();
      if (lastPill && lastPill.key === key && nowMs - lastPill.t < 6000 && lastPill.pill.isConnected) {
        lastPill.t = nowMs;
        const p0 = lastPill.pill;
        p0.classList.remove('out'); p0.classList.add('on-air', 'in');
        return { end(hold = 3.2) { hold = holdFor(hold); p0.classList.remove('on-air'); setTimeout(() => { if (lastPill?.pill !== p0 || performance.now() - lastPill.t >= hold * 1000 - 50) { p0.classList.add('out'); setTimeout(() => p0.remove(), 500); } }, hold * 1000); } };
      }
      const pill = el('div', `krz-r-pill${isTower ? ' is-tower' : ''}${isPlayer ? ' is-player' : ''} on-air`);
      pill.style.setProperty('--c', color || '#ffd75e');
      if (isTower) pill.dataset.tier = tier;
      pill.innerHTML = `<div class="krz-r-who">${isTower ? icon('tower', 'krz-r-tw') : '<i class="krz-r-dot"></i>'}${header(speaker, to)}<i class="krz-r-more" hidden></i></div><div class="krz-r-text">${esc(text)}</div>`;
      // older cards fold away; the newest counts the lines folded in the last few seconds
      const folded = [...subs.querySelectorAll('.krz-r-pill:not(.out)')];
      for (const o of folded) { o.classList.add('out'); setTimeout(() => o.remove(), 500); }
      const now = performance.now();
      recent = recent.filter((t) => now - t < 12000);
      recent.push(now);
      if (recent.length > 1) { const m = pill.querySelector('.krz-r-more'); m.textContent = `+${recent.length - 1}`; m.hidden = false; }
      subs.appendChild(pill);
      lastPill = { key, t: nowMs, pill };
      requestAnimationFrame(() => pill.classList.add('in'));
      const row = el('div', 'krz-r-row', `<div class="krz-r-who" style="--c:${esc(color || '#ffd75e')}">${header(speaker, to)}</div><div class="krz-r-text">${esc(text)}</div>`);
      drawerList.appendChild(row);
      while (drawerList.children.length > LOG_MAX) drawerList.firstChild.remove();
      if (logOpen) drawerList.scrollTop = drawerList.scrollHeight;
      return {
        end(hold = 3.2) {
          hold = holdFor(hold);
          pill.classList.remove('on-air');
          setTimeout(() => { pill.classList.add('out'); setTimeout(() => pill.remove(), 500); }, hold * 1000);
        },
      };
    },
    setComposure(face, label, outrage) {
      if (tower.dataset.face != face) {
        const up = tower.dataset.face != null && face > +tower.dataset.face;
        tower.dataset.face = face;
        tower.querySelector('.krz-r-face').innerHTML = faceSVG(face);
        if (up) { tower.classList.remove('jolt'); void tower.offsetWidth; tower.classList.add('jolt'); }
      }
      tower.querySelector('.krz-r-tower-txt span').textContent = label;
      tower.querySelector('.krz-r-meter i').style.width = `${Math.max(3, outrage)}%`;
    },
    setTowerTalking(on) { tower.classList.toggle('talking', !!on); },
    showChoices({ kind, title, subtitle, chips, countdown }) {
      panel.hidden = false;
      panel.dataset.kind = kind;
      root.classList.add('panel-open');
      btn.classList.toggle('counting', !!countdown);
      panel.querySelector('.krz-r-title b').textContent = title;
      panel.querySelector('.krz-r-title span').textContent = subtitle || '';
      secsEl.textContent = '';
      ringFg.style.strokeDashoffset = countdown ? '0' : String(RING_C);
      chipsEl.innerHTML = '';
      chips.forEach((c, i) => {
        const b = el('button', 'krz-r-chip');
        b.type = 'button';
        b.dataset.i = i;
        b.dataset.intent = c.intent;
        b.disabled = !!c.disabled;
        b.style.setProperty('--c', c.color || '#ffd75e');
        b.innerHTML = `${icon(c.icon, 'krz-r-chip-ico')}<span class="krz-r-chip-body"><span class="krz-r-lbl">${esc(c.label)}</span><span class="krz-r-tgt">&rarr; ${esc(c.targetName)}</span></span><span class="krz-r-k">${i + 1}</span>`;
        chipsEl.appendChild(b);
      });
      chipsEl.dataset.n = chips.length;
    },
    setCountdown(frac, left) {
      ringFg.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, frac))));
      secsEl.textContent = `${Math.max(0, Math.ceil(left))}s`;
      const urgent = left < 1.6;
      panel.classList.toggle('urgent', urgent);
      btn.classList.toggle('urgent', urgent);
    },
    hideChoices() {
      panel.hidden = true;
      root.classList.remove('panel-open');
      panel.classList.remove('urgent');
      btn.classList.remove('counting', 'urgent');
      ringFg.style.strokeDashoffset = String(RING_C);
    },
    flashChoice(i) { chipsEl.children[i]?.classList.add('picked'); },
    setButtonCooldown(frac) {
      btn.style.setProperty('--cd', Math.max(0, Math.min(1, frac)).toFixed(3));
      btn.classList.toggle('cooling', frac > 0);
    },
    update(dt) { if (logOpen && (logIdle += dt) > 6) setLog(false); },
    toggleLog() { setLog(!logOpen); },
    setSubtitles(on) { subtitlesOn = !!on; subs.hidden = !subtitlesOn; },
    setVisible(on) { root.hidden = !on; },
    dispose() { root.remove(); },
  };
}

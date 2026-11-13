import { CONFIG } from '../config.js';
import { createMinimap } from './minimap.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';
import { UI_ICON } from './kit.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const ICON = {
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="4.2"/><path d="M3.5 22c0-5.3 3.8-9 8.5-9s8.5 3.7 8.5 9z"/></svg>',
  crown: '<svg viewBox="0 0 32 24"><path d="M2 6l7 6 7-10 7 10 7-6-3 16H5z" fill="#ffd23a" stroke="#8a5a00" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="15" r="2.4" fill="#ff4d6d"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="8.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 9v5l3 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9 2.5h6M19 5.5l1.6 1.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  speed: '<svg viewBox="0 0 32 32"><circle cx="19" cy="6" r="3"/><path d="M14 10l6 1 3 5 4 1-1 2-5-1-2-3-2 4 4 3-1 8h-3l1-6-4-3-3 5-6 1v-3l4-1 4-8-3 0-2 3-2-1 3-5z"/><path d="M2 13h7M1 17h6M3 21h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  magnet: '<svg viewBox="0 0 32 32"><path d="M7 5h6v12a3 3 0 006 0V5h6v12a9 9 0 01-18 0z" fill="#ff3d4e"/><path d="M7 5h6v5H7zM19 5h6v5h-6z" fill="#e8eef5"/></svg>',
  double: '<svg viewBox="0 0 32 32"><text x="16" y="23" text-anchor="middle" font-size="19" font-weight="900" font-family="system-ui,sans-serif" fill="#fff">x2</text></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
const FX_LABEL = { speed: 'SPEED', magnet: 'MAGNET', double: 'x2 SIZE' };

export function createHud({ root, audio, getRenderer, onPause = () => {} }) {
  root.innerHTML = `
    <div class="badges"></div>
    <div class="floaters"></div>
    <div class="hud-tl">
      <div class="timer-row">
        <div class="timer pill">${ICON.clock}<span class="t">2:00</span></div>
        <button type="button" class="pause-btn round" aria-label="Pause">${UI_ICON.pause}</button>
      </div>
      <div class="kills pill">Kills: <b>0</b></div>
    </div>
    <div class="hud-tr">
      <div class="lb"></div>
      <div class="mm-wrap"><canvas class="mm"></canvas></div>
    </div>
    <div class="powerups"></div>
    <div class="edge-arrow hidden"><div class="ea-in"><span class="ea-crown">${ICON.crown}</span><b></b></div><i></i></div>
    <div class="toasts"></div>
    <div class="emotes"></div>
    <div class="countdown"></div>
    <div class="net-pill hidden"><i></i><span></span></div>
    <div class="dead-veil hidden"><div class="dv-title">ABSORBED!</div><div class="dv-sub"></div></div>`;
  const $ = (s) => root.querySelector(s);
  const timerEl = $('.timer'), timerT = $('.timer .t'), killsB = $('.kills b');
  const lb = $('.lb'), badgesEl = $('.badges'), floatersEl = $('.floaters'), toastsEl = $('.toasts');
  const countdownEl = $('.countdown'), powerEl = $('.powerups'), deadVeil = $('.dead-veil'), deadSub = $('.dv-sub');
  const edge = $('.edge-arrow'), edgeB = edge.querySelector('b'), edgeI = edge.querySelector('i');
  const pauseBtn = $('.pause-btn'), emotesEl = $('.emotes');
  pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); onPause(); });
  const minimap = createMinimap($('.mm'));

  let me = 0, rows = [], badges = [], meta = [], toastStyle = '', emotes = [];
  let lastTimer = '', lastKills = -1, lastCd = '';
  let recruitAcc = 0, recruitT = 0, stealIn = 0, stealOut = 0, lastLeadToast = -99, said30 = false;
  const fxEls = {};
  const proj = { x: 0, y: 0, visible: false };
  let hudOn = true, lbRows = 0, frameN = 0, pillScale = 1, lastPill = '';

  for (const k of ['speed', 'magnet', 'double']) {
    const d = document.createElement('div');
    d.className = 'pu pu-' + k;
    d.innerHTML = `<div class="pu-ring"><div class="pu-icon">${ICON[k]}</div></div><div class="pu-label">${FX_LABEL[k]}</div>`;
    powerEl.appendChild(d);
    fxEls[k] = { el: d, ring: d.querySelector('.pu-ring'), on: false };
  }

  function setMatch({ players, playerIndex = 0, map, league = null, plate = 'classic', badge = 'classic', toast: ts = 'classic' }) {
    me = playerIndex;
    meta = players;
    toastStyle = ' ts-' + ts;
    emotesEl.innerHTML = ''; emotes = [];
    lb.innerHTML = '';
    badgesEl.innerHTML = '';
    floatersEl.innerHTML = '';
    toastsEl.innerHTML = '';
    rows = players.map((p, i) => {
      const r = document.createElement('div');
      r.className = 'lb-row' + (i === me ? ' me plate-' + plate : '');
      r.style.setProperty('--c', hex(p.color));
      const tag = i === me ? (league != null ? `<span class="lb-lg">${badgeSvg(LEAGUES[league], 16)}</span>` : '') : p.flag ? `<span class="lb-flag">${esc(p.flag)}</span>` : '';
      r.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-ico">${ICON.person}</span>${tag}<span class="lb-name">${esc(p.name)}</span><span class="lb-n">0</span><span class="lb-crown">${ICON.crown}</span>`;
      lb.appendChild(r);
      return { el: r, rank: r.querySelector('.lb-rank'), n: r.querySelector('.lb-n'), lastN: -1, lastSlot: -1, lastRank: -1 };
    });
    badges = players.map((p, i) => {
      const b = document.createElement('div');
      b.className = 'badge hidden' + (i === me ? ' me bs-' + badge : '');
      b.style.setProperty('--c', hex(p.color));
      b.innerHTML = `<span class="b-crown">${ICON.crown}</span><span class="b-n">0</span>`;
      badgesEl.appendChild(b);
      return { el: b, n: b.querySelector('.b-n'), lastN: -1, shown: false, lead: false, x: -999, y: -999 };
    });
    minimap.setMap(map);
    lastTimer = ''; lastKills = -1; lastCd = ''; lastLeadToast = -99; said30 = false;
    recruitAcc = stealIn = stealOut = 0;
    for (const k in fxEls) { fxEls[k].on = false; fxEls[k].el.classList.remove('on'); }
    deadVeil.classList.add('hidden');
    edge.classList.add('hidden');
  }

  function toast(title, { sub = '', color = '', cls = '' } = {}) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    if (color) t.style.setProperty('--c', color);
    t.innerHTML = `<div class="toast-t">${title}</div>${sub ? `<div class="toast-s">${sub}</div>` : ''}`;
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 2) toastsEl.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, CONFIG.UI.toastTime * 1000);
  }

  function floater(text, x, y, cls = '') {
    if (floatersEl.children.length > 14) floatersEl.firstChild.remove();
    const f = document.createElement('div');
    f.className = 'floater ' + cls;
    f.textContent = text;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    floatersEl.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
  }

  function centreScreen(state, i, alpha) {
    const c = state.crowds[i];
    getRenderer().project(c.px + (c.x - c.px) * alpha, 2, c.pz + (c.z - c.pz) * alpha, proj);
    return proj;
  }

  // Badges sit over the far edge of the crowd disc (as seen from the camera), clear of the 3D crown.
  function crowdScreen(state, i, alpha, yOff = 0) {
    const r = getRenderer();
    const c = state.crowds[i];
    let yaw = 0;
    try { yaw = r.cameraYaw() || 0; } catch {}
    const back = c.radius * CONFIG.UI.badgeBack;
    const x = c.px + (c.x - c.px) * alpha - Math.sin(yaw) * back, z = c.pz + (c.z - c.pz) * alpha - Math.cos(yaw) * back;
    let y = CONFIG.UI.badgeHeight + yOff;
    if (state.leader === i && !r.debug2d) {
      let top = NaN;
      if (typeof r.crownTop === 'function') { try { top = r.crownTop(); } catch {} }
      y = Number.isFinite(top) ? Math.max(y, top + 0.6) : y + Math.max(0, CONFIG.UI.crownClear - c.radius * 0.45);
    }
    r.project(x, y, z, proj);
    return proj;
  }

  const name = (i) => `<span class="nm" style="--c:${hex(meta[i].color)}">${esc(meta[i].name)}</span>`;

  function onEvents(state, events) {
    for (const e of events) {
      switch (e.type) {
        case 'recruit':
          if (e.crowd === me) recruitAcc += e.n;
          break;
        case 'steal':
          if (e.to === me) stealIn += e.n;
          else if (e.from === me) stealOut += e.n;
          break;
        case 'elim':
          if (e.by === me) toast('ABSORBED', { sub: name(e.victim), cls: 'big' + toastStyle });
          else if (e.victim === me) { deadSub.innerHTML = 'by ' + name(e.by); deadVeil.classList.remove('hidden'); }
          break;
        case 'respawn':
          if (e.crowd === me) deadVeil.classList.add('hidden');
          break;
        case 'lead':
          if (state.time - lastLeadToast < 4 || state.duration - state.timeLeft < 8) break;
          if (e.crowd === me) { toast('TOOK THE LEAD!', { cls: 'gold' + toastStyle }); lastLeadToast = state.time; }
          else if (rows[me].lastRank === 1) { toast('LOST THE LEAD', { sub: name(e.crowd), cls: 'warn' }); lastLeadToast = state.time; }
          break;
        case 'pickup':
          if (e.crowd === me) toast(FX_LABEL[e.kind] + '!', { cls: 'pu-toast pu-' + e.kind });
          break;
      }
    }
  }

  function update(state, events, dt, alpha) {
    onEvents(state, events);
    const mc = state.crowds[me];

    const tl = Math.ceil(state.timeLeft);
    const tt = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    if (tt !== lastTimer) {
      lastTimer = tt; timerT.textContent = tt;
      timerEl.classList.toggle('hurry', state.phase === 'play' && tl <= 30);
      timerEl.classList.toggle('final', state.phase === 'play' && tl <= 10);
    }
    if (!said30 && state.phase === 'play' && state.timeLeft <= 30) { said30 = true; toast('30 SECONDS LEFT!', { cls: 'warn' }); }
    if (mc.kills !== lastKills) { lastKills = mc.kills; killsB.textContent = mc.kills; }

    let cd = '';
    if (state.phase === 'countdown') cd = String(Math.max(1, Math.ceil(state.countdownLeft)));
    else if (state.phase === 'play' && state.duration - state.timeLeft < 0.8) cd = 'GO!';
    else if (state.phase === 'play' && state.timeLeft <= 10 && state.timeLeft > 0) cd = 'T' + Math.ceil(state.timeLeft);
    if (cd !== lastCd) {
      lastCd = cd;
      countdownEl.className = 'countdown' + (cd.startsWith('T') ? ' final' : '');
      countdownEl.textContent = cd.startsWith('T') ? cd.slice(1) : cd;
      void countdownEl.offsetWidth;
      if (cd) countdownEl.classList.add('pop');
    }

    // Leaderboard: top N plus the player's row, sliding into place. Portrait shows fewer rows.
    const nRows = window.innerHeight > window.innerWidth ? CONFIG.UI.leaderboardRowsPortrait : CONFIG.UI.leaderboardRows;
    if (nRows !== lbRows) { lbRows = nRows; lb.style.setProperty('--rows', nRows); for (const r of rows) r.lastSlot = -1; }
    for (const c of state.crowds) {
      const r = rows[c.index];
      let slot = c.rank - 1;
      const hidden = slot >= nRows && c.index !== me;
      if (slot >= nRows && c.index === me) slot = nRows;
      if (hidden) slot = nRows;
      if (slot !== r.lastSlot || hidden !== r.hidden) {
        r.el.style.transform = `translateY(${slot * 100}%)`;
        r.el.classList.toggle('off', hidden);
        r.el.classList.toggle('sep', slot === nRows && !hidden);
        r.el.classList.toggle('first', c.rank === 1);
        r.lastSlot = slot; r.hidden = hidden;
      }
      if (c.rank !== r.lastRank) { r.rank.textContent = c.rank; r.lastRank = c.rank; }
      if (c.count !== r.lastN) { r.n.textContent = c.count; r.lastN = c.count; }
    }
    lb.classList.toggle('has-sep', mc.rank > nRows);

    // Pills and floaters shrink as the camera pulls out (pixels per metre at your crowd, viewport-normalised).
    if (hudOn && (frameN++ % 10) === 0 && mc.alive) {
      const r = getRenderer(), a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
      r.project(mc.x, 0, mc.z, a); r.project(mc.x + 10, 0, mc.z, b);
      const ppm = Math.hypot(b.x - a.x, b.y - a.y) / 10 * 390 / Math.max(1, Math.min(window.innerWidth, window.innerHeight));
      if (Number.isFinite(ppm)) {
        const target = Math.max(0.78, Math.min(1, 0.78 + 0.22 * (ppm - 4.5) / 11));
        pillScale += (target - pillScale) * 0.35;
        const v = pillScale.toFixed(2);
        if (v !== lastPill) { lastPill = v; badgesEl.style.setProperty('--bs', v); floatersEl.style.setProperty('--bs', v); emotesEl.style.setProperty('--bs', v); }
      }
    }

    // Count badges over every crowd.
    if (hudOn) {
      for (const c of state.crowds) {
        const b = badges[c.index];
        let show = c.alive;
        if (show) {
          crowdScreen(state, c.index, alpha);
          show = proj.visible && Number.isFinite(proj.x);
          const bx = proj.x, by = proj.y;
          centreScreen(state, c.index, alpha);
          const W = window.innerWidth, H = window.innerHeight;
          if (Number.isFinite(proj.x) && proj.x > 0 && proj.x < W && proj.y > 0 && proj.y < H) {
            // Crowd is on screen but its pill would be off the edge: pin the pill inside.
            proj.x = Math.min(W - 30, Math.max(30, Number.isFinite(bx) ? bx : proj.x));
            proj.y = Math.min(H - 10, Math.max(44, Number.isFinite(by) ? by : proj.y));
            show = true;
          } else { proj.x = bx; proj.y = by; }
        }
        if (show !== b.shown) { b.el.classList.toggle('hidden', !show); b.shown = show; }
        if (!show) continue;
        if (Math.abs(proj.x - b.x) > 0.3 || Math.abs(proj.y - b.y) > 0.3) {
          b.x = proj.x; b.y = proj.y;
          b.el.style.transform = `translate3d(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
        if (c.count !== b.lastN) {
          if (c.index === me && c.count > b.lastN && b.lastN > 0) { b.el.classList.remove('bump'); void b.el.offsetWidth; b.el.classList.add('bump'); }
          b.n.textContent = c.count; b.lastN = c.count;
        }
        const lead = state.leader === c.index && state.phase !== 'countdown' && !!getRenderer().debug2d;
        if (lead !== b.lead) { b.el.classList.toggle('lead', lead); b.lead = lead; }
      }
      edgeArrow(state);
    }

    // "+N" floaters, merged over a short window so a sweep reads as one number.
    recruitT += dt;
    if (recruitT >= CONFIG.UI.floaterWindow) {
      recruitT = 0;
      const p = centreScreen(state, me, alpha);
      if (p.visible && mc.alive) {
        if (recruitAcc > 0) floater('+' + recruitAcc, p.x + (Math.random() - 0.5) * 90, p.y + 30 + Math.random() * 20, mc.fx.double > 0 ? 'dbl' : '');
        if (stealIn > 0) floater('+' + stealIn, p.x + (Math.random() - 0.5) * 60, p.y + 10, 'gain');
        if (stealOut > 0) floater('-' + stealOut, p.x + (Math.random() - 0.5) * 60, p.y + 40, 'loss');
      }
      recruitAcc = stealIn = stealOut = 0;
    }

    for (const k in fxEls) {
      const f = fxEls[k], v = mc.alive ? mc.fx[k] : 0;
      const on = v > 0;
      if (on !== f.on) { f.on = on; f.el.classList.toggle('on', on); }
      if (on) f.ring.style.setProperty('--p', (v / CONFIG.SIM.fx[k].dur).toFixed(3));
    }

    if (hudOn) minimap.draw(state, me, getRenderer().cameraYaw(), alpha);
    if (emotes.length) drawEmotes(state, alpha);
  }

  // Speech bubbles over a crowd's count pill (human-feeling bots, and your own equipped emote).
  function emote(index, text) {
    if (!badges[index]) return;
    const e = document.createElement('div');
    e.className = 'emote' + (index === me ? ' mine' : '');
    e.textContent = text;
    emotesEl.appendChild(e);
    const it = { el: e, index, until: performance.now() + 2200 };
    emotes.push(it);
    while (emotes.length > 4) { emotes[0].el.remove(); emotes.shift(); }
  }
  function drawEmotes() {
    const t = performance.now();
    for (let i = emotes.length - 1; i >= 0; i--) {
      const it = emotes[i], b = badges[it.index];
      if (t > it.until || !b.shown) { it.el.remove(); emotes.splice(i, 1); continue; }
      it.el.style.transform = `translate3d(${b.x.toFixed(0)}px, ${(b.y - 34).toFixed(0)}px, 0) translate(-50%, -100%)`;
    }
  }

  let rectsAt = -1, rects = [];
  function panelRects() {
    const t = performance.now();
    if (t - rectsAt > 500) {
      rectsAt = t;
      rects = ['.hud-tl', '.lb', '.mm-wrap', '.powerups'].map((s) => root.querySelector(s).getBoundingClientRect()).filter((r) => r.width > 0);
    }
    return rects;
  }

  function edgeArrow(state) {
    const li = state.leader;
    const c = state.crowds[li];
    if (li === me || !c.alive || state.phase !== 'play') { edge.classList.add('hidden'); return; }
    getRenderer().project(c.x, 2, c.z, proj);
    const W = window.innerWidth, H = window.innerHeight;
    const inView = proj.visible && proj.x > 0 && proj.x < W && proj.y > 0 && proj.y < H;
    if (inView || !Number.isFinite(proj.x)) { edge.classList.add('hidden'); return; }
    const cx = W / 2, cy = H / 2;
    let dx = proj.x - cx, dy = proj.y - cy;
    if (!proj.visible && proj.behind) { dx = -dx; dy = -dy; }
    const m = 46;
    const k = Math.min(Math.abs((cx - m) / (dx || 1e-6)), Math.abs((cy - m) / (dy || 1e-6)));
    let x = cx + dx * k, y = cy + dy * k;
    // Slide along the screen edge until clear of HUD panels.
    for (const r of panelRects()) {
      if (x < r.left - 30 || x > r.right + 30 || y < r.top - 26 || y > r.bottom + 26) continue;
      const sideEdge = Math.abs(x - m) < 2 || Math.abs(x - (W - m)) < 2;
      if (sideEdge) y = (r.top + r.bottom) / 2 < cy ? r.bottom + 30 : r.top - 30;
      else x = (r.left + r.right) / 2 < cx ? r.right + 34 : r.left - 34;
    }
    edge.classList.remove('hidden');
    edge.style.setProperty('--c', hex(c.color));
    edge.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`;
    edgeI.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    if (edgeB.textContent !== String(c.count)) edgeB.textContent = c.count;
  }

  // Online: a crowd changed hands (late joiner) → its name in the board and toasts.
  function setName(i, n) {
    if (!meta[i]) return;
    meta[i] = { ...meta[i], name: n };
    const el = rows[i] && rows[i].el.querySelector('.lb-name');
    if (el) el.textContent = n;
  }
  const netPill = root.querySelector('.net-pill'), netText = netPill.querySelector('span');
  function setNet(text, tone = '') {
    netPill.classList.toggle('hidden', !text);
    if (!text) return;
    if (netText.textContent !== text) netText.textContent = text;
    netPill.dataset.tone = tone;
  }

  return {
    setMatch, update, toast, emote, setName, setNet,
    show(v) { root.classList.toggle('hidden', !v); },
    setHudVisible(v) { hudOn = v; root.classList.toggle('bare', !v); },
    resize() { minimap.resize(); },
  };
}

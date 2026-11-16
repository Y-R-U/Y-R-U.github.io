import { CONFIG } from '../config.js';
import { createMinimap } from './minimap.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';
import { UI_ICON } from './kit.js';
import { threatOf, outrightLeader } from './threat.js';

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
const HORDE = CONFIG.MODES.infection.hordeColor;
ICON.biohazard = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"/><path d="M12 2.5a5 5 0 00-2.8 9.2 5 5 0 005.6 0A5 5 0 0012 2.5zM4 15.5a5 5 0 008.1 4.6 5 5 0 00-2.8-4.9 5 5 0 00-5.3.3zM20 15.5a5 5 0 00-5.3-.3 5 5 0 00-2.8 4.9 5 5 0 008.1-4.6z" opacity=".9"/></svg>';
ICON.zone = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3"/><path d="M6.5 14l2-5 3.5 3 3.5-3 2 5z" fill="#ffd23a"/></svg>';
// Threat glyphs: shape as well as colour (bigger = up, smaller = down), so it reads without colour vision.
const TH_ICON = {
  danger: '<svg viewBox="0 0 12 12"><path d="M6 1.2L11.4 10.6H.6z"/></svg>',
  prey: '<svg viewBox="0 0 12 12"><path d="M6 10.8L.6 1.4h10.8z"/></svg>',
  even: '<svg viewBox="0 0 12 12"><path d="M1.5 3.2h9v2h-9zM1.5 6.8h9v2h-9z"/></svg>',
  ally: '<svg viewBox="0 0 12 12"><path d="M6 .8l4.8 1.7v3.6c0 2.7-2.1 4.4-4.8 5.1C3.3 10.5 1.2 8.8 1.2 6.1V2.5z"/></svg>',
};
const HUD_BREAK = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hudbreak') || '' : '';
const NB_MAX = HUD_BREAK === 'arrows' ? 0 : 4;
ICON.circle = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

// The zones the current mode draws: { x, z, r, color, style: 'crown'|'next'|'safe'|'safe-next' }.
// Crown zones are keyed by their plaza, so the "next" preview turns into the crown in place when the zone moves.
// colors: crowd colours by index (the crown glows in the holder's colour, gold when nobody holds it).
export function zonesOf(state, colors = null) {
  const out = [];
  const zid = (z) => `k${Math.round(z.x)},${Math.round(z.z)}`;
  if (state.mode === 'koth' && state.zone) {
    const h = state.zone.holder, hc = h >= 0 && colors && colors[h] != null ? colors[h] : 0xffd23a;
    out.push({ id: zid(state.zone), x: state.zone.x, z: state.zone.z, r: state.zone.r, color: hc, style: 'crown' });
    if (state.zoneNext) out.push({ id: zid(state.zoneNext), x: state.zoneNext.x, z: state.zoneNext.z, r: state.zoneNext.r, color: 0xffd23a, style: 'next' });
  } else if (state.mode === 'lcs' && state.circle) {
    const c = state.circle;
    out.push({ id: 'safe', x: c.x, z: c.z, r: c.r, color: 0x7fe3ff, style: 'safe' });
    if (c.nr < c.r - 0.5) out.push({ id: 'safe-next', x: c.nx, z: c.nz, r: c.nr, color: 0xffffff, style: 'safe-next' });
  }
  return out;
}
const fmtS = (t) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

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
      <div class="mode-pill pill hidden"><span class="mp-ico"></span><span class="mp-t"></span></div>
    </div>
    <div class="team-bar hidden"><span class="tb-a"><b></b><i></i></span><span class="tb-vs">VS</span><span class="tb-b"><i></i><b></b></span></div>
    <canvas class="zone-ring"></canvas>
    <div class="zone-warn hidden"><b>GET INSIDE THE CIRCLE!</b><span>Your crowd is bleeding away</span></div>
    <div class="hud-tr">
      <div class="lb"></div>
      <div class="mm-wrap"><canvas class="mm"></canvas></div>
    </div>
    <div class="powerups"></div>
    <div class="nb-arrows"></div>
    <div class="edge-arrow zone-arrow hidden"><div class="ea-in"><span class="ea-crown"></span><b></b></div><i><s></s></i></div>
    <div class="toasts"></div>
    <div class="emotes"></div>
    <div class="countdown"></div>
    <div class="net-pill hidden"><i></i><span></span></div>
    <div class="dead-veil hidden"><div class="dv-title">ABSORBED!</div><div class="dv-sub"></div></div>
    <div class="spec-chip hidden"><b>SPECTATING</b><span></span></div>`;
  const $ = (s) => root.querySelector(s);
  const timerEl = $('.timer'), timerT = $('.timer .t'), killsB = $('.kills b');
  const lb = $('.lb'), badgesEl = $('.badges'), floatersEl = $('.floaters'), toastsEl = $('.toasts');
  const countdownEl = $('.countdown'), powerEl = $('.powerups'), deadVeil = $('.dead-veil'), deadSub = $('.dv-sub');
  const arrowsEl = $('.nb-arrows');
  const arrows = [];
  for (let k = 0; k < NB_MAX + 1; k++) {
    const d = document.createElement('div');
    d.className = 'edge-arrow nb hidden';
    d.innerHTML = `<div class="ea-in"><span class="ea-crown">${ICON.crown}</span><span class="ea-th"></span><b></b></div><i><s></s></i>`;
    arrowsEl.appendChild(d);
    arrows.push({ el: d, th: d.querySelector('.ea-th'), b: d.querySelector('b'), i: d.querySelector('i'), shown: false, idx: -1, t: '', n: '', lead: false, x: -999, y: -999, a: 99, c: '' });
  }
  const pauseBtn = $('.pause-btn'), emotesEl = $('.emotes');
  pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); onPause(); });
  const minimap = createMinimap($('.mm'));
  const modePill = $('.mode-pill'), modeIco = $('.mp-ico'), modeT = $('.mp-t'), teamBar = $('.team-bar'), zoneWarn = $('.zone-warn');
  const ringCv = $('.zone-ring'), ringG = ringCv.getContext('2d');
  const zArrow = $('.zone-arrow'), zArrowB = zArrow.querySelector('b'), zArrowI = zArrow.querySelector('i'), zArrowIco = zArrow.querySelector('.ea-crown');
  let mode = 'classic', lastMode = '', zones = [], ringDrawn = false, dead = false, outT = 0, hitBy = -1, hitAt = -99;
  const specChip = $('.spec-chip'), specName = specChip.querySelector('span');

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

  function setMatch({ players, playerIndex = 0, map, league = null, plate = 'classic', badge = 'classic', toast: ts = 'classic', mode: md = 'classic' }) {
    me = playerIndex;
    meta = players;
    mode = md || 'classic';
    root.dataset.mode = mode;
    modePill.classList.toggle('hidden', mode === 'classic');
    modeIco.innerHTML = mode === 'koth' ? ICON.zone : mode === 'lcs' ? ICON.circle : mode === 'infection' ? ICON.biohazard : ICON.person;
    lastMode = '';
    teamBar.classList.toggle('hidden', mode !== 'teams');
    if (mode === 'teams') {
      const sides = CONFIG.MODES.teams.sides, mine = players[playerIndex].team ?? 0;
      teamBar.style.setProperty('--ca', hex(sides[0].colors[0])); teamBar.style.setProperty('--cb', hex(sides[1].colors[0]));
      teamBar.querySelector('.tb-a i').textContent = sides[0].name.toUpperCase() + (mine === 0 ? ' · YOU' : '');
      teamBar.querySelector('.tb-b i').textContent = (mine === 1 ? 'YOU · ' : '') + sides[1].name.toUpperCase();
    }
    zoneWarn.classList.add('hidden');
    zones = []; ringDrawn = false; dead = false; outT = 0; hitBy = -1; hitAt = -99;
    specChip.classList.add('hidden'); specName.textContent = ''; deadVeil.classList.remove('final');
    ringG.clearRect(0, 0, ringCv.width, ringCv.height);
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
      r.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-ico">${ICON.person}</span>${tag}<span class="lb-name">${esc(p.name)}</span><span class="lb-n">0</span><span class="lb-crown">${ICON.crown}</span><span class="lb-emo"></span>`;
      lb.appendChild(r);
      return { el: r, rank: r.querySelector('.lb-rank'), n: r.querySelector('.lb-n'), ico: r.querySelector('.lb-ico'), emo: r.querySelector('.lb-emo'), lastN: -1, lastSlot: -1, lastRank: -1, horde: false, out: false };
    });
    badges = players.map((p, i) => {
      const b = document.createElement('div');
      b.className = 'badge hidden' + (i === me ? ' me bs-' + badge : '');
      b.style.setProperty('--c', hex(p.color));
      b.innerHTML = `<span class="b-crown">${ICON.crown}</span><span class="b-n"><i class="b-th"></i><span class="b-v">0</span></span>`;
      badgesEl.appendChild(b);
      return { el: b, n: b.querySelector('.b-v'), pill: b.querySelector('.b-n'), th: b.querySelector('.b-th'), t: '', lastN: -1, shown: false, lead: false, x: -999, y: -999 };
    });
    minimap.setMap(map);
    lastTimer = ''; lastKills = -1; lastCd = ''; lastLeadToast = -99; said30 = false;
    recruitAcc = stealIn = stealOut = 0;
    for (const k in fxEls) { fxEls[k].on = false; fxEls[k].el.classList.remove('on'); }
    deadVeil.classList.add('hidden');
    for (const a of arrows) { a.shown = false; a.el.classList.add('hidden'); a.idx = -1; }
    measureFont(); rectsAt = -1;
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
  function crowdScreen(state, i, alpha, yOff = 0, lead = state.leader) {
    const r = getRenderer();
    const c = state.crowds[i];
    let yaw = 0;
    try { yaw = r.cameraYaw() || 0; } catch {}
    const back = c.radius * CONFIG.UI.badgeBack;
    const x = c.px + (c.x - c.px) * alpha - Math.sin(yaw) * back, z = c.pz + (c.z - c.pz) * alpha - Math.cos(yaw) * back;
    let y = CONFIG.UI.badgeHeight + yOff;
    if (lead === i && !r.debug2d) {
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
          else if (e.from === me) { stealOut += e.n; hitBy = e.to; hitAt = state.time; }
          break;
        case 'bleed':
          if (e.crowd === me) { hitBy = -1; hitAt = state.time; }
          break;
        case 'elim':
          if (e.by === me) toast('ABSORBED', { sub: name(e.victim), cls: 'big' + toastStyle });
          else if (e.victim === me) {
            if (mode === 'lcs') knockedOut(state, e.by);
            else {
              deadVeil.querySelector('.dv-title').textContent = 'ABSORBED!';
              deadSub.innerHTML = 'by ' + name(e.by);
              deadVeil.classList.remove('hidden', 'final');
            }
          }
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
        case 'infect':
          if (e.crowd === me) toast('INFECTED!', { sub: 'You are the horde now: hunt the survivors', cls: 'horde' });
          else if (e.by === me) toast('INFECTED', { sub: name(e.crowd), cls: 'horde' + toastStyle });
          else toast('', { sub: name(e.crowd) + ' joined the horde', cls: 'small' });
          break;
        case 'zone':
          toast('CROWN ZONE MOVED', { sub: 'Follow the gold ring', cls: 'gold small' });
          break;
        case 'shrink':
          toast('THE CIRCLE IS CLOSING', { sub: 'Get inside the white ring', cls: 'warn small' });
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
    if (mode !== 'classic') modeHud(state, mc);
    // The knock-out was missed (catch-up after a hidden tab, a late join): name whoever was last eating you.
    if (mode === 'lcs' && mc.out && !dead) knockedOut(state, state.time - hitAt < 2 ? hitBy : -1);
    if (dead) {
      const now = performance.now();
      if (state.phase === 'over') { if (!deadVeil.classList.contains('hidden') || !specChip.classList.contains('hidden')) { deadVeil.classList.add('hidden'); specChip.classList.add('hidden'); } }
      else if (now - outT > CONFIG.UI.outBanner * 1000) {
        if (!deadVeil.classList.contains('hidden')) { deadVeil.classList.add('hidden'); specChip.classList.remove('hidden'); }
        const L = state.crowds[state.leader], nm = L && L.alive && meta[L.index] ? meta[L.index].name : '';
        if (specName.textContent !== nm) specName.textContent = nm;
      }
    } else if (state.phase === 'over' && !deadVeil.classList.contains('hidden')) deadVeil.classList.add('hidden');

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
    const nRows = window.innerHeight > window.innerWidth || (window.innerHeight < 420 && window.innerWidth < 600) ? CONFIG.UI.leaderboardRowsPortrait : CONFIG.UI.leaderboardRows;
    if (nRows !== lbRows) { lbRows = nRows; lb.style.setProperty('--rows', nRows); for (const r of rows) r.lastSlot = -1; rectsAt = -1; }
    const king = state.phase === 'countdown' ? -1 : outrightLeader(state);
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
        r.lastSlot = slot; r.hidden = hidden;
      }
      if ((c.index === king) !== r.first) { r.first = c.index === king; r.el.classList.toggle('first', r.first); }
      if (c.rank !== r.lastRank) { r.rank.textContent = c.rank; r.lastRank = c.rank; }
      const v = rowValue(c);
      if (v !== r.lastN) { r.n.textContent = v; r.lastN = v; }
      if (!!c.horde !== r.horde) { r.horde = !!c.horde; r.el.classList.toggle('horde', r.horde); r.ico.innerHTML = r.horde ? ICON.biohazard : ICON.person; if (r.horde) r.el.style.setProperty('--c', hex(HORDE)); }
      if (!!c.out !== r.out) { r.out = !!c.out; r.el.classList.toggle('out', r.out); }
    }
    if ((mc.rank > nRows) !== lb.classList.contains('has-sep')) { lb.classList.toggle('has-sep', mc.rank > nRows); rectsAt = -1; }

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

    // Count labels over crowds on screen; edge arrows for the nearest ones off it (and the leader).
    if (hudOn) {
      indicators(state, alpha, mc);
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
      if (on !== f.on) { f.on = on; f.el.classList.toggle('on', on); rectsAt = -1; }
      if (on) f.ring.style.setProperty('--p', (v / CONFIG.SIM.fx[k].dur).toFixed(3));
    }

    zones = zonesOf(state);
    if (hudOn) minimap.draw(state, me, getRenderer().cameraYaw(), alpha, zones);
    if (hudOn && !(getRenderer().setZones)) drawRing(zones); else if (ringDrawn) { ringG.clearRect(0, 0, ringCv.width, ringCv.height); ringDrawn = false; }
    if (emotes.length) drawEmotes(state, alpha);
  }

  function knockedOut(state, by) {
    dead = true; outT = performance.now();
    deadVeil.querySelector('.dv-title').textContent = 'OUT!';
    deadSub.innerHTML = (by >= 0 && meta[by] ? 'Knocked out by ' + name(by) : 'The circle got you') + '<br><small>No respawns in Last Crowd Standing</small>';
    deadVeil.classList.add('final');
    deadVeil.classList.remove('hidden');
    specChip.classList.add('hidden');
  }

  function rowValue(c) {
    if (mode === 'koth') return Math.floor(c.score) + 's';
    if (mode === 'infection') return Math.floor(c.score);
    if (mode === 'lcs' && c.out) return 'OUT';
    return c.count;
  }

  function modeHud(state, mc) {
    let t = '', cls = '';
    if (mode === 'koth') {
      const z = state.zone, h = z ? z.holder : -1;
      t = `<b>${Math.floor(mc.score)}</b> pts · ` + (h === me ? '<em>YOU HOLD THE ZONE</em>' : h >= 0 ? `${esc(meta[h].name)} holds it` : 'zone free')
        + (state.zoneT <= CONFIG.MODES.koth.warn ? ` · moves ${Math.ceil(state.zoneT)}s` : '');
      cls = h === me ? 'hot' : '';
    } else if (mode === 'lcs') {
      const alive = state.crowds.filter((c) => !c.out).length, c = state.circle;
      t = `<b>${alive}</b> left · ` + (c && c.shrinkIn > 0 ? `circle shrinks in ${Math.ceil(c.shrinkIn)}s` : c && c.nr < c.r - 0.5 ? 'circle shrinking' : 'final circle');
      const outside = mc.alive && c && (mc.x - c.x) ** 2 + (mc.z - c.z) ** 2 > c.r * c.r;
      if (outside !== !zoneWarn.classList.contains('hidden')) zoneWarn.classList.toggle('hidden', !outside);
      cls = outside ? 'bad' : '';
    } else if (mode === 'infection') {
      const horde = state.crowds.filter((c) => c.horde).length;
      t = mc.horde ? `<em>HORDE</em> ${horde}/${state.crowds.length} · <b>${Math.floor(mc.score)}</b> pts · eat survivors` : `SURVIVOR <b>${Math.floor(mc.score)}</b> pts · horde ${horde}/${state.crowds.length}`;
      cls = mc.horde ? 'horde' : '';
    } else if (mode === 'teams' && state.teams) {
      t = `+${mc.boost > 0 ? ' BOOST' : ''}`;
      const a = state.teams[0].score, b = state.teams[1].score;
      const ab = teamBar.querySelector('.tb-a b'), bb = teamBar.querySelector('.tb-b b');
      if (ab.textContent !== String(a)) ab.textContent = a;
      if (bb.textContent !== String(b)) bb.textContent = b;
      teamBar.style.setProperty('--share', (a + b ? a / (a + b) : 0.5).toFixed(3));
      const mine = mc.team ?? 0;
      t = `<span class="tps"><span class="tp" style="color:${hex(CONFIG.MODES.teams.sides[0].colors[1])}">${a}</span> : <span class="tp" style="color:${hex(CONFIG.MODES.teams.sides[1].colors[1])}">${b}</span> · </span>`
        + (mc.boost > 0 ? '<em>MERGE BOOST</em>' : (mine === 0 ? a >= b : b >= a) ? 'your team leads' : 'your team trails');
    }
    const key = t + cls;
    if (key !== lastMode) { lastMode = key; modeT.innerHTML = t; modePill.dataset.tone = cls; }
  }

  // DOM fallback for the renderer's zones: each ring projected onto the ground with r.project.
  function drawRing(list) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    if (ringCv.width !== Math.round(W * dpr) || ringCv.height !== Math.round(H * dpr)) { ringCv.width = Math.round(W * dpr); ringCv.height = Math.round(H * dpr); }
    ringG.setTransform(1, 0, 0, 1, 0, 0);
    ringG.clearRect(0, 0, ringCv.width, ringCv.height);
    ringDrawn = list.length > 0;
    if (!ringDrawn) return;
    ringG.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = getRenderer(), p = { x: 0, y: 0, visible: false };
    const t = performance.now() / 1000;
    for (const z of list) {
      const n = Math.max(48, Math.min(160, Math.round(z.r * 1.2)));
      ringG.beginPath();
      let pen = false;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        r.project(z.x + Math.cos(a) * z.r, 0.15, z.z + Math.sin(a) * z.r, p);
        if (!p.visible || !Number.isFinite(p.x) || p.behind) { pen = false; continue; }
        if (pen) ringG.lineTo(p.x, p.y); else { ringG.moveTo(p.x, p.y); pen = true; }
      }
      const col = hex(z.color);
      const dashed = z.style === 'next' || z.style === 'safe-next';
      ringG.setLineDash(dashed ? [10, 8] : []);
      ringG.lineDashOffset = dashed ? -t * 24 : 0;
      ringG.lineCap = 'round';
      ringG.strokeStyle = 'rgba(8,10,24,.55)'; ringG.lineWidth = dashed ? 5 : 7; ringG.stroke();
      ringG.strokeStyle = col; ringG.globalAlpha = dashed ? 0.8 : 0.5 + 0.25 * Math.sin(t * 3); ringG.lineWidth = dashed ? 2.5 : 3.5; ringG.stroke();
      ringG.globalAlpha = 1;
    }
    ringG.setLineDash([]);
  }

  // Speech bubbles over a crowd's count pill (human-feeling bots, and your own equipped emote).
  // A crowd off screen gets the bubble on its leaderboard row instead.
  function emote(index, text) {
    if (!badges[index]) return;
    if (!badges[index].shown && index !== me) {
      const r = rows[index];
      if (!r || r.hidden) return;
      r.emo.textContent = text;
      r.el.classList.remove('emoting'); void r.el.offsetWidth; r.el.classList.add('emoting');
      clearTimeout(r.emoT); r.emoT = setTimeout(() => r.el.classList.remove('emoting'), 2400);
      return;
    }
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

  let rectsAt = -1, rects = [], joyShown = false, fs = 13;
  const joyEl = () => document.querySelector('.joy');
  function measureFont() { const v = parseFloat(getComputedStyle(root).fontSize); if (v > 0) fs = v; }
  // Everything an indicator must not cover: HUD panels, the joystick while it is up, the account badge.
  function panelRects() {
    const t = performance.now();
    const j = joyEl(), js = !!j && !j.classList.contains('hidden');
    if (js !== joyShown) { joyShown = js; rectsAt = -1; }
    if (t - rectsAt > 500) {
      rectsAt = t;
      const list = ['.hud-tl', '.lb', '.mm-wrap', '.powerups', '.team-bar', '.net-pill', '.zone-warn'].map((s) => root.querySelector(s).getBoundingClientRect());
      if (js) list.push(j.querySelector('.joy-base').getBoundingClientRect());
      const acc = document.getElementById('br8t-account'), fab = acc && acc.shadowRoot && acc.shadowRoot.querySelector('.fab');
      if (fab) list.push(fab.getBoundingClientRect());
      if (HUD_BREAK === 'avoid') list.length = 0;
      rects = list.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ l: r.left - 3, t: r.top - 3, r: r.right + 3, b: r.bottom + 3 }));
    }
    return rects;
  }
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  function clear(R, list, W, H) {
    if (R.l < 0 || R.t < 0 || R.r > W || R.b > H) return false;
    for (const o of list) if (hit(R, o)) return false;
    return true;
  }
  const blocked = [], dbg = [];
  let ppm = 0;

  // Label rect from its bottom-centre anchor; nudged out of anything it covers, or dropped (returns null).
  function placeLabel(x, y, hw, h, dn, W, H, force) {
    x = Math.min(W - hw - 2, Math.max(hw + 2, x)); y = Math.min(H - dn - 2, Math.max(h + 2, y));
    const R = { l: x - hw, r: x + hw, t: y - h, b: y + dn };
    if (clear(R, blocked, W, H)) return R;
    let best = null, bd = Infinity;
    const tryAround = (x0, y0, o, depth) => {
      for (const [nx, ny] of [[x0, o.t - dn - 1], [x0, o.b + h + 1], [o.l - hw - 1, y0], [o.r + hw + 1, y0]]) {
        const d = Math.abs(nx - x) + Math.abs(ny - y);
        if (d >= bd) continue;
        const C = { l: nx - hw, r: nx + hw, t: ny - h, b: ny + dn };
        if (clear(C, blocked, W, H)) { best = C; bd = d; continue; }
        if (depth > 0) for (const o2 of blocked) if (o2 !== o && hit(C, o2)) tryAround(nx, ny, o2, depth - 1);
      }
    };
    for (const o of blocked) if (hit(R, o)) tryAround(x, y, o, 1);
    return best || (force ? R : null);
  }

  // A point on the inset screen rectangle, by distance t clockwise from its top-left corner.
  function perim(t, m, W, H, out) {
    const w = W - 2 * m, h = H - 2 * m, P = 2 * (w + h);
    t = ((t % P) + P) % P;
    if (t < w) { out.x = m + t; out.y = m; } else if (t < w + h) { out.x = W - m; out.y = m + t - w; }
    else if (t < 2 * w + h) { out.x = W - m - (t - w - h); out.y = H - m; } else { out.x = m; out.y = H - m - (t - 2 * w - h); }
    return out;
  }
  function perimT(x, y, m, W, H) {
    const w = W - 2 * m, h = H - 2 * m;
    const dT = Math.abs(y - m), dR = Math.abs(x - (W - m)), dB = Math.abs(y - (H - m)), dL = Math.abs(x - m), mn = Math.min(dT, dR, dB, dL);
    if (mn === dT) return x - m;
    if (mn === dR) return w + (y - m);
    if (mn === dB) return w + h + (W - m - x);
    return 2 * w + h + (H - m - y);
  }
  const pt = { x: 0, y: 0 };
  // The pointer is a 1.15em x .9em box orbiting 1.4em..2.55em out from the arrow's centre.
  function arrowRect(x, y, hw, hh, top, ang, out) {
    const c = Math.cos(ang), s = Math.sin(ang);
    out.l = x - hw; out.r = x + hw; out.t = y - hh - top; out.b = y + hh;
    for (const u of [1.4, 2.55]) for (const v of [-0.45, 0.45]) {
      const px = x + (u * c - v * s) * fs, py = y + (u * s + v * c) * fs;
      if (px < out.l) out.l = px; if (px > out.r) out.r = px; if (py < out.t) out.t = py; if (py > out.b) out.b = py;
    }
    out.l -= 1; out.r += 1; out.t -= 1; out.b += 1;
    return out;
  }
  // Pin an arrow on the screen edge toward a projected point (tx, ty; behind = projected from behind the camera).
  // Slides along the edge until clear of the HUD and the other indicators. Returns { x, y, ang, R } or null.
  function placeEdge(tx, ty, behind, hw, hh, top, W, H) {
    const cx = W / 2, cy = H / 2;
    let dx = tx - cx, dy = ty - cy;
    if (behind) { dx = -dx; dy = -dy; }
    if (!dx && !dy) dy = 1;
    const m = Math.max(34, 2.45 * fs);
    const k = Math.min(Math.abs((cx - m) / (dx || 1e-6)), Math.abs((cy - m) / (dy || 1e-6)));
    const t0 = perimT(cx + dx * k, cy + dy * k, m, W, H), P = 2 * (W + H - 4 * m);
    const far = behind ? 1e5 : 1;
    const gx = behind ? cx + dx * far : tx, gy = behind ? cy + dy * far : ty;
    const R = { l: 0, t: 0, r: 0, b: 0 };
    for (let s = 0, step = Math.max(6, fs * 0.6); s * step < P / 2; s++) {
      for (const sg of s ? [1, -1] : [1]) {
        perim(t0 + sg * s * step, m, W, H, pt);
        const ang = Math.atan2(gy - pt.y, gx - pt.x);
        arrowRect(pt.x, pt.y, hw, hh, top, ang, R);
        if (clear(R, blocked, W, H)) return { x: pt.x, y: pt.y, ang, R };
      }
    }
    return null;
  }
  const ARW = (digits) => ({ hw: (1.95 + 0.6 * digits) * fs * 0.95 / 2 + 1, hh: 1.45 * fs * 0.95 / 2 + 1 });

  const cand = [], lab = [];
  function indicators(state, alpha, mc) {
    const r = getRenderer(), W = window.innerWidth, H = window.innerHeight;
    const lead = state.phase === 'countdown' ? -1 : outrightLeader(state);
    blocked.length = 0;
    for (const o of panelRects()) blocked.push(o);
    zoneArrow(state, mc);
    const meAlive = mc.alive;
    if (meAlive) {
      const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
      r.project(mc.x, 0, mc.z, a); r.project(mc.x + 10, 0, mc.z, b);
      const v = Math.hypot(b.x - a.x, b.y - a.y) / 10;
      if (Number.isFinite(v) && v > 0) ppm = v;
    }
    const range = ppm > 0 ? 1.3 * Math.hypot(W, H) / 2 / ppm : 0;
    const mx = mc.px + (mc.x - mc.px) * alpha, mz = mc.pz + (mc.z - mc.pz) * alpha;
    cand.length = 0; lab.length = 0; dbg.length = 0;
    for (const c of state.crowds) {
      const D = { index: c.index, kind: 'none', why: '', threat: '', on: false, range: false, d: 0, rect: null };
      dbg.push(D);
      const b = badges[c.index];
      if (!c.alive) { D.why = 'dead'; continue; }
      const t = c.index === me || !meAlive ? '' : threatOf(mc, c, mode, HUD_BREAK === 'threat' ? 0.5 : undefined);
      D.threat = t;
      centreScreen(state, c.index, alpha);
      const on = Number.isFinite(proj.x) && proj.visible && proj.x >= 0 && proj.x <= W && proj.y >= 0 && proj.y <= H;
      const ux = proj.x, uy = proj.y, behind = !proj.visible && !!proj.behind;
      const x = c.px + (c.x - c.px) * alpha, z = c.pz + (c.z - c.pz) * alpha;
      D.d = Math.max(0, Math.hypot(x - mx, z - mz) - c.radius - mc.radius);
      D.on = on;
      D.range = c.index !== me && meAlive && D.d <= range;
      if (on || c.index === me) {
        crowdScreen(state, c.index, alpha, 0, lead);
        lab.push({ c, b, t, D, x: Number.isFinite(proj.x) ? proj.x : ux, y: Number.isFinite(proj.y) ? proj.y : uy, ok: on || (proj.visible && Number.isFinite(proj.x)) });
      } else if (Number.isFinite(ux) && state.phase === 'play' && (D.range || c.index === lead)) {
        cand.push({ c, t, D, ux, uy, behind });
      } else D.why = D.range ? 'phase' : 'far';
    }

    // Labels: yours first, then nearest first; a label that cannot be placed clear is dropped (the farther one).
    lab.sort((p, q) => (p.c.index === me ? -1 : q.c.index === me ? 1 : p.D.d - q.D.d));
    const bs = pillScale;
    for (const L of lab) {
      const { c, b, D } = L;
      let R = null;
      if (L.ok) {
        const f = fs * bs * (c.index === me ? 1.4 : 1.15), digits = String(c.count).length;
        const hw = Math.max(2.6, 1.3 + 0.62 * digits) * f / 2 + (L.t ? 0.6 * f : 0) + 2, h = 1.5 * f + 2, dn = 0.45 * f + 1;
        const crownH = b.lead ? 1.45 * fs * bs : 0;
        R = placeLabel(L.x, L.y, hw, h + crownH, dn, W, H, c.index === me);
        if (R) {
          const ax = (R.l + R.r) / 2, ay = R.b - dn;
          if (Math.abs(ax - b.x) > 0.3 || Math.abs(ay - b.y) > 0.3) {
            b.x = ax; b.y = ay;
            b.el.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) translate(-50%, -100%)`;
          }
          blocked.push(R);
        }
      }
      const show = !!R;
      if (show !== b.shown) { b.el.classList.toggle('hidden', !show); b.shown = show; }
      D.kind = show ? 'label' : 'none'; D.why = show ? '' : 'overlap'; D.rect = R;
      if (show) badgeText(state, c, b, L.t, lead);
      else if (c.index !== me && state.phase === 'play') {
        // Under the HUD or boxed in: point at it from the screen edge instead.
        centreScreen(state, c.index, alpha);
        if (Number.isFinite(proj.x)) cand.push({ c, t: L.t, D, ux: proj.x, uy: proj.y, behind: false, near: true });
      }
    }
    for (const c of state.crowds) {
      const b = badges[c.index];
      if (b.shown && dbg[c.index].kind !== 'label') { b.el.classList.add('hidden'); b.shown = false; }
    }

    // Arrows: the leader always, plus the NB_MAX nearest within range.
    cand.sort((p, q) => p.D.d - q.D.d);
    let n = 0, k = 0;
    for (const A of cand) {
      const isLead = A.c.index === lead;
      if (!isLead && n >= NB_MAX && !A.near) { A.D.why = 'cap'; continue; }
      const digits = String(A.c.count).length, { hw, hh } = ARW(digits);
      const P = placeEdge(A.ux, A.uy, A.behind, hw, hh, isLead ? 1.05 * fs : 0, W, H);
      if (!P) { A.D.why = 'nospace'; continue; }
      if (!isLead) n++;
      blocked.push(P.R);
      A.D.kind = 'arrow'; A.D.rect = P.R; A.D.why = A.near ? 'under' : '';
      setArrow(arrows[k++], A, P, isLead);
    }
    for (; k < arrows.length; k++) if (arrows[k].shown) { arrows[k].shown = false; arrows[k].idx = -1; arrows[k].el.classList.add('hidden'); }
  }

  function badgeText(state, c, b, t, lead) {
    if (!!c.horde !== !!b.horde) { b.horde = !!c.horde; b.el.classList.toggle('horde', b.horde); b.el.style.setProperty('--c', hex(b.horde ? HORDE : meta[c.index].color)); }
    if (c.count !== b.lastN) {
      if (c.index === me && c.count > b.lastN && b.lastN > 0) { b.el.classList.remove('bump'); void b.el.offsetWidth; b.el.classList.add('bump'); }
      b.n.textContent = c.count; b.lastN = c.count;
    }
    if (t !== b.t) { b.t = t; b.el.dataset.th = t; b.th.innerHTML = t ? TH_ICON[t] : ''; }
    const ld = lead === c.index && !!getRenderer().debug2d;
    if (ld !== b.lead) { b.el.classList.toggle('lead', ld); b.lead = ld; }
  }

  function setArrow(a, A, P, isLead) {
    const c = A.c;
    if (!a.shown) { a.shown = true; a.el.classList.remove('hidden'); }
    a.idx = c.index;
    if (Math.abs(P.x - a.x) > 0.3 || Math.abs(P.y - a.y) > 0.3) { a.x = P.x; a.y = P.y; a.el.style.transform = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`; }
    if (Math.abs(P.ang - a.a) > 0.01) { a.a = P.ang; a.i.style.transform = `rotate(${P.ang.toFixed(3)}rad)`; }
    const t = A.t || 'even';
    if (t !== a.t) { a.t = t; a.el.dataset.th = t; a.th.innerHTML = TH_ICON[t]; }
    if (isLead !== a.lead) { a.lead = isLead; a.el.classList.toggle('lead', isLead); }
    const col = hex(c.horde ? HORDE : meta[c.index].color);
    if (col !== a.c) { a.c = col; a.el.style.setProperty('--cc', col); }
    const nn = String(c.count);
    if (nn !== a.n) { a.n = nn; a.b.textContent = nn; }
  }

  // King: the crown zone when it is off screen. LCS: the safe circle when you are outside it.
  function zoneArrow(state, mc) {
    let t = null, label = '', ico = '';
    if (mode === 'koth' && state.zone && state.phase === 'play') {
      t = state.zoneNext && state.zoneT < 3 ? state.zoneNext : state.zone; ico = ICON.zone; label = mc.alive ? Math.round(Math.hypot(t.x - mc.x, t.z - mc.z)) + 'm' : '';
    } else if (mode === 'lcs' && state.circle && mc.alive && state.phase === 'play') {
      const c = state.circle;
      if ((mc.x - c.x) ** 2 + (mc.z - c.z) ** 2 > c.r * c.r) { t = c; ico = ICON.circle; label = 'SAFE'; }
    }
    let P = null;
    if (t) {
      getRenderer().project(t.x, 2, t.z, proj);
      const W = window.innerWidth, H = window.innerHeight;
      const on = proj.visible && proj.x > 0 && proj.x < W && proj.y > 0 && proj.y < H;
      if (Number.isFinite(proj.x) && !on) {
        const { hw, hh } = ARW(label.length + 2);
        P = placeEdge(proj.x, proj.y, !proj.visible && !!proj.behind, hw, hh, 0, W, H);
      }
    }
    const show = !!P;
    if (show === zArrow.classList.contains('hidden')) zArrow.classList.toggle('hidden', !show);
    zoneRect = P ? P.R : null;
    if (!show) return;
    blocked.push(P.R);
    zArrow.style.transform = `translate3d(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px, 0)`;
    zArrowI.style.transform = `rotate(${P.ang.toFixed(3)}rad)`;
    if (zArrowIco.dataset.k !== mode) { zArrowIco.dataset.k = mode; zArrowIco.innerHTML = ico; }
    if (zArrowB.textContent !== label) zArrowB.textContent = label;
  }
  let zoneRect = null;

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
    get zones() { return zones; },
    get indicators() { return { list: dbg, zone: zoneRect, blockers: rects, fs }; },
    show(v) { root.classList.toggle('hidden', !v); },
    setHudVisible(v) { hudOn = v; root.classList.toggle('bare', !v); },
    resize() { minimap.resize(); measureFont(); rectsAt = -1; },
  };
}

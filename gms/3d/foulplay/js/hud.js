// Race HUD. The two meters that matter — SUSPICION and HYPE — sit where your
// eyes already are, and the attack button tells you what the stewards would
// make of pressing it *before* you press it.

import { $, clamp, clamp01, lerp, fmtTime, fmtGap, esc, ordinal } from './utils.js';
import { state } from './state.js';
import { profile } from './save.js';
import { STEWARD, HYPE, DRIVE, LOOP } from './config.js';
import { previewAttack, cooldownFrac, readySkills } from './attacks.js';
import { estimateRisk, hypeTier } from './stewards.js';
import { skillById } from './arsenal.js';
import { on } from './bus.js';

let el = {};
let mini = null;
let miniCtx = null;
let miniPath = null;
let feedItems = [];
let bannerT = 0;
let toastT = 0;
let riskT = 0;
let lastPos = 0;

export function initHud() {
  el = {
    hud: $('hud'),
    pos: $('hud-pos'), posTotal: $('hud-pos-total'),
    lap: $('hud-lap'), lapTotal: $('hud-lap-total'),
    speed: $('hud-speed'), speedUnit: $('hud-speed-unit'),
    suspFill: $('susp-fill'), suspVal: $('susp-val'), suspWrap: $('susp-wrap'),
    hypeFill: $('hype-fill'), hypeVal: $('hype-val'), hypeWrap: $('hype-wrap'),
    camWarn: $('cam-warn'), camDist: $('cam-dist'),
    boostBtn: $('btn-boost'), boostCount: $('boost-count'), boostFill: $('boost-fill'),
    atkBtn: $('btn-attack'), atkRing: $('atk-ring'), atkName: $('atk-name'), atkRisk: $('atk-risk'),
    banner: $('banner'), bannerText: $('banner-text'),
    toast: $('toast'),
    feed: $('feed'),
    order: $('order-list'),
    lapTime: $('lap-time'), bestTime: $('best-time'),
    hpFill: $('hp-fill'), partsLost: $('parts-lost'),
    minimap: $('minimap'),
    invest: $('investigation'),
    loopWarn: $('loop-warn'),
    flash: $('hit-flash'),
    grade: $('speed-arc'),
  };
  mini = el.minimap;
  miniCtx = mini ? mini.getContext('2d') : null;
  miniPath = null;
  feedItems = [];
  wireEvents();
}

function wireEvents() {
  on('steward:foul', ({ susp, clean, cover, skill }) => {
    if (clean) toast('RACING INCIDENT', 'good');
    else if (cover > 0.3) toast(`SEEN — +${Math.round(susp)} SUSPICION`, 'bad');
    else toast(`+${Math.round(susp)} SUSPICION`, 'warn');
    feed(`${skill ? skill.icon + ' ' + skill.name : 'FOUL'}`, clean ? 'good' : 'warn');
  });
  on('steward:investigating', () => banner('STEWARDS ARE REVIEWING', 'bad'));
  on('steward:verdict', ({ cleared, fine, text }) => {
    banner(text, cleared ? 'good' : 'bad');
    feed(cleared ? 'NO FURTHER ACTION' : `FINED $${fine.toLocaleString()}`, cleared ? 'good' : 'bad');
  });
  on('steward:rivalPenalty', ({ car }) => feed(`${car.name} PENALISED`, 'dim'));
  on('car:wreck', ({ car, by }) => {
    if (by && by.isPlayer) { feed(`${car.name} WRECKED`, 'good'); banner('WRECKED THEM', 'good'); }
    else if (car.isPlayer) banner('WIPEOUT', 'bad');
    else feed(`${car.name} IS OUT OF SHAPE`, 'dim');
  });
  on('car:partOff', ({ car, by }) => {
    if (by && by.isPlayer) feed(`${car.name} LOSES A PANEL`, 'good');
  });
  on('race:eliminated', ({ car }) => feed(`${car.name} ELIMINATED`, 'bad'));
  on('pickup:chest', ({ tier }) => toast('CRATE SECURED', 'good'));
  on('pickup:boost', () => toast('NITRO +1', 'good'));
  on('car:lap', ({ car }) => {
    if (car.isPlayer && car.lap >= 0) banner(`LAP ${clamp(car.lap + 1, 1, state.laps)}`, 'plain');
  });
  on('race:overtake', ({ position }) => toast(`P${position}`, 'good'));
  on('ai:attackedPlayer', ({ car, skill }) => feed(`${car.name}: ${skill.name}`, 'bad'));
  on('hype:gain', ({ why }) => { if (why) pulse(el.hypeWrap); });
  on('attack:notReady', () => toast('NOTHING READY', 'dim'));
  on('attack:noTarget', () => toast('NOBODY IN RANGE', 'dim'));
  on('race:bestLap', ({ lap }) => toast('BEST LAP ' + fmtTime(lap), 'good'));
}

// ---------------------------------------------------------------------------
export function showHud(v) {
  if (el.hud) el.hud.classList.toggle('hidden', !v);
  const pad = $('btn-pad');
  if (pad) pad.classList.toggle('hidden', !v);
}

export function updateHud(dt) {
  const p = state.player;
  if (!p || !el.hud) return;

  // --- position / lap ------------------------------------------------------
  setText(el.pos, p.position);
  setText(el.posTotal, state.cars.length);
  setText(el.lap, clamp(p.lap + 1, 1, state.laps));
  setText(el.lapTotal, state.laps);
  if (p.position !== lastPos) {
    pulse(el.pos.parentElement);
    lastPos = p.position;
  }

  // --- speed ---------------------------------------------------------------
  const kmh = Math.max(0, p.forwardSpeed) * (profile.settings.speedUnit === 'mph' ? 2.237 : 3.6);
  setText(el.speed, Math.round(kmh));
  setText(el.speedUnit, profile.settings.speedUnit === 'mph' ? 'MPH' : 'KM/H');
  if (el.grade) {
    const frac = clamp01(p.forwardSpeed / (DRIVE.topSpeed * DRIVE.boostMul));
    el.grade.style.setProperty('--v', frac.toFixed(3));
  }

  // --- suspicion / hype ----------------------------------------------------
  const suspPct = clamp01(state.suspicion / STEWARD.max) * 100;
  if (el.suspFill) el.suspFill.style.width = suspPct.toFixed(1) + '%';
  setText(el.suspVal, Math.round(state.suspicion));
  if (el.suspWrap) {
    el.suspWrap.classList.toggle('hot', state.suspicion > 70);
    el.suspWrap.classList.toggle('warn', state.suspicion > 40 && state.suspicion <= 70);
  }
  const hypePct = clamp01(state.hype / HYPE.max) * 100;
  if (el.hypeFill) el.hypeFill.style.width = hypePct.toFixed(1) + '%';
  const ht = hypeTier();
  setText(el.hypeVal, ht.name);
  if (el.hypeWrap) el.hypeWrap.style.setProperty('--hype', ht.css);

  // --- camera warning ------------------------------------------------------
  if (el.camWarn) {
    const live = state.inCameraCone;
    const near = state.nearestCam;
    const d = state.nearestCamDist;
    el.camWarn.classList.toggle('live', live);
    el.camWarn.classList.toggle('hidden', !(live || (near && d < STEWARD.camWarnDist && d > -10)));
    setText(el.camDist, live ? 'ON AIR' : `CAM ${Math.max(0, Math.round(d))}m`);
  }

  // --- investigation -------------------------------------------------------
  if (el.invest) {
    el.invest.classList.toggle('hidden', state.investigating <= 0);
    if (state.investigating > 0) {
      el.invest.style.setProperty('--k', (1 - state.investigating / STEWARD.investigateHold).toFixed(3));
    }
  }

  // --- loop warning --------------------------------------------------------
  if (el.loopWarn && state.track) {
    const loop = state.track.loopAhead(p.s, clamp((p.forwardSpeed || 0) * 2.2, 70, 400));
    const slow = loop && p.forwardSpeed < loop.minSpeed * LOOP.warnMargin && loop.dist > 6;
    el.loopWarn.classList.toggle('hidden', !slow);
  }

  // --- kit -----------------------------------------------------------------
  setText(el.boostCount, p.boosts);
  if (el.boostBtn) {
    el.boostBtn.classList.toggle('empty', p.boosts <= 0);
    el.boostBtn.classList.toggle('firing', p.boosting);
  }
  if (el.boostFill) el.boostFill.style.width = (clamp01(p.boostTime / (DRIVE.boostTime + p.stats.boostTime)) * 100) + '%';

  updateAttackButton(p, dt);

  // --- condition -----------------------------------------------------------
  if (el.hpFill) el.hpFill.style.width = (clamp01(p.hp / p.maxHp) * 100).toFixed(0) + '%';
  setText(el.partsLost, p.partsLost.length ? `-${p.partsLost.length} PARTS` : '');
  if (el.flash) el.flash.style.opacity = clamp01(p.hitFlash * 3).toFixed(2);

  // --- times ---------------------------------------------------------------
  setText(el.lapTime, fmtTime(state.raceTime));
  setText(el.bestTime, isFinite(p.bestLap) ? fmtTime(p.bestLap) : '--:--');

  updateOrder();
  updateMinimap();
  tickBanners(dt);
}

function updateAttackButton(p, dt) {
  if (!el.atkBtn) return;
  const cd = cooldownFrac(p);
  if (el.atkRing) el.atkRing.style.setProperty('--cd', cd.toFixed(3));

  riskT -= dt;
  if (riskT <= 0) {
    riskT = 0.1;
    const pv = previewAttack(p, state.cars);
    if (!pv) {
      el.atkBtn.className = 'pad-btn atk empty';
      setText(el.atkName, 'RELOADING');
      setText(el.atkRisk, '');
    } else if (!pv.target && pv.skill.band !== 'drop') {
      // Loaded, but nothing to point it at. Say so rather than showing a risk
      // rating for a press that will not fire.
      el.atkBtn.className = 'pad-btn atk waiting';
      setText(el.atkName, pv.skill.icon + ' ' + pv.skill.name);
      setText(el.atkRisk, 'NOBODY IN RANGE');
    } else {
      const risk = estimateRisk(p, pv.skill, pv.target ? pv.dist : null);
      el.atkBtn.className = 'pad-btn atk risk-' + risk.tier + (pv.target ? ' locked' : '');
      setText(el.atkName, pv.skill.icon + ' ' + pv.skill.name);
      setText(el.atkRisk,
        risk.tier === 'clean' ? 'LOOKS LIKE RACING'
          : risk.tier === 'low' ? 'LOW RISK'
            : risk.tier === 'mid' ? 'RISKY' : 'BLATANT');
    }
  }
}

// ---------------------------------------------------------------------------
function updateOrder() {
  if (!el.order) return;
  const p = state.player;
  const list = state.order;
  const rows = [];
  const show = new Set();
  for (let i = 0; i < Math.min(3, list.length); i++) show.add(list[i]);
  const pi = list.indexOf(p);
  for (let k = -1; k <= 1; k++) {
    const c = list[pi + k];
    if (c) show.add(c);
  }
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!show.has(c)) continue;
    const gap = c === p ? '' : gapText(p, c);
    rows.push(
      `<li class="${c.isPlayer ? 'me' : ''}${c.retired ? ' out' : ''}">
        <b>${i + 1}</b>
        <i style="background:${cssHex(c.livery.body)}"></i>
        <span>${esc(c.name)}</span>
        <em>${gap}</em>
      </li>`
    );
  }
  const html = rows.join('');
  if (el.order.__html !== html) {
    el.order.innerHTML = html;
    el.order.__html = html;
  }
}

function gapText(p, c) {
  if (!p || !state.track) return '';
  const d = (c.progress - p.progress);
  const v = Math.max(14, p.forwardSpeed);
  if (Math.abs(d) > state.track.length * 0.9) return '+1L';
  return (d > 0 ? '+' : '') + (d / v).toFixed(1);
}

function cssHex(h) { return '#' + (h >>> 0).toString(16).padStart(6, '0'); }

// ---------------------------------------------------------------------------
function updateMinimap() {
  if (!miniCtx || !state.track) return;
  const tr = state.track;
  const W = mini.width, H = mini.height;

  if (!miniPath) {
    const b = tr.bounds;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const scale = Math.min((W - 16) / (sx || 1), (H - 16) / (sz || 1));
    const ox = W / 2 - ((b.min.x + b.max.x) / 2) * scale;
    const oz = H / 2 - ((b.min.z + b.max.z) / 2) * scale;
    miniPath = { scale, ox, oz, pts: [] };
    const step = Math.max(1, Math.floor(tr.count / 190));
    for (let i = 0; i < tr.count; i += step) {
      miniPath.pts.push([tr.pos[i].x * scale + ox, tr.pos[i].z * scale + oz]);
    }
  }

  const g = miniCtx;
  g.clearRect(0, 0, W, H);
  g.lineWidth = 5.5;
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineJoin = 'round';
  g.beginPath();
  miniPath.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.stroke();

  // live cameras
  for (const cam of state.track.cams) {
    if (!cam.live) continue;
    const p = state.track.worldAt(cam.s, 0, 0);
    g.fillStyle = 'rgba(255,60,60,0.85)';
    g.beginPath();
    g.arc(p.x * miniPath.scale + miniPath.ox, p.z * miniPath.scale + miniPath.oz, 2.6, 0, 7);
    g.fill();
  }

  for (const c of state.cars) {
    if (!c.alive) continue;
    const x = c.worldPos.x * miniPath.scale + miniPath.ox;
    const y = c.worldPos.z * miniPath.scale + miniPath.oz;
    g.fillStyle = c.isPlayer ? '#ffffff' : cssHex(c.livery.body);
    g.beginPath();
    g.arc(x, y, c.isPlayer ? 4.2 : 3, 0, 7);
    g.fill();
    if (c.isPlayer) {
      g.strokeStyle = '#101418';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
export function banner(text, kind = 'plain', time = 1.7) {
  if (!el.banner) return;
  el.bannerText.textContent = text;
  el.banner.className = 'banner ' + kind;
  bannerT = time;
}

export function toast(text, kind = 'plain', time = 1.1) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.className = 'toast ' + kind;
  toastT = time;
}

export function feed(text, kind = 'plain') {
  if (!el.feed) return;
  feedItems.unshift({ text, kind, t: 4.2 });
  if (feedItems.length > 5) feedItems.pop();
  renderFeed();
}

function renderFeed() {
  el.feed.innerHTML = feedItems
    .map((f) => `<li class="${f.kind}">${esc(f.text)}</li>`).join('');
}

function tickBanners(dt) {
  if (bannerT > 0) {
    bannerT -= dt;
    el.banner.classList.toggle('show', bannerT > 0);
  }
  if (toastT > 0) {
    toastT -= dt;
    el.toast.classList.toggle('show', toastT > 0);
  }
  let dirty = false;
  for (let i = feedItems.length - 1; i >= 0; i--) {
    feedItems[i].t -= dt;
    if (feedItems[i].t <= 0) { feedItems.splice(i, 1); dirty = true; }
  }
  if (dirty) renderFeed();
}

function setText(node, v) {
  if (!node) return;
  const s = String(v);
  if (node.__v !== s) { node.textContent = s; node.__v = s; }
}

function pulse(node) {
  if (!node) return;
  node.classList.remove('pulse');
  void node.offsetWidth;
  node.classList.add('pulse');
}

export function resetHud() {
  miniPath = null;
  feedItems = [];
  lastPos = 0;
  if (el.feed) el.feed.innerHTML = '';
}

// Everything on screen during a battle: hull and reload bars, objective
// tracker, minimap, name tags, threat arrows, damage numbers, kill feed,
// the touch button pad and the scope/uplink overlays. No alerts, ever.

import * as THREE from 'three';
import { IS_TOUCH } from './config.js';
import { $, el, clamp, clamp01, fmtTime, fmtRank } from './utils.js';
import { camera } from './render.js';
import { state } from './state.js';
import { profile, worldRank } from './save.js';
import { tierFor } from './arsenal.js';
import { input, press } from './input.js';
import { terrainHeight } from './terrain.js';
import { props } from './props.js';
import { on } from './bus.js';
import { AudioFX } from './audio.js';

const _v = new THREE.Vector3();
let mini = null, miniCtx = null;
let handlers = {};
let bannerTimer = 0;
let toastTimer = 0;

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function initHUD(h) {
  handlers = h;
  mini = $('minimap');
  miniCtx = mini.getContext('2d');

  bindHold('btn-fire', (down) => { input.fire = down; });
  bindTap('btn-util', () => press('util'));
  bindTap('btn-drone', () => press('drone'));
  bindTap('btn-scope', () => press('scope'));
  bindTap('btn-mark', () => press('mark'));
  bindTap('btn-pause', () => handlers.onPause());

  buildTagPool();
  buildArrowPool();

  on('banner', ({ text, small }) => showBanner(text, small));
  on('toast', (text) => showToast(text));
  on('crit', ({ tank, kind }) => {
    if (tank.isPlayer) showToast(kind + ' DAMAGED');
    else if (state.player) showToast('ENEMY ' + kind + ' HIT');
  });
  on('utility', ({ label }) => showToast(label));
  on('player-hit', (e) => { floatDamage(e); hitMark(!e.tank.alive); });
  on('tank-killed', ({ victim, attacker }) => addFeed(attacker, victim));
  on('damage', (e) => { if (e.tank.isPlayer) flashHit(); });
  on('drone-down', () => showToast('UPLINK LOST'));
  on('drone-online', () => showToast('DRONE RELAUNCHED'));
  on('drone-contacts', (n) => showToast(n === 1 ? 'CONTACT MARKED' : n + ' CONTACTS MARKED'));
  on('drone-marked', (t) => showToast('TARGET PAINTED: ' + t.name));
  on('lightning', () => AudioFX.thunder());
}

function bindHold(id, fn) {
  const b = $(id);
  const down = (e) => { e.preventDefault(); b.classList.add('down'); fn(true); };
  const up = (e) => { e.preventDefault(); b.classList.remove('down'); fn(false); };
  b.addEventListener('touchstart', down, { passive: false });
  b.addEventListener('touchend', up);
  b.addEventListener('touchcancel', up);
  b.addEventListener('mousedown', down);
  b.addEventListener('mouseup', up);
  b.addEventListener('mouseleave', up);
}

function bindTap(id, fn) {
  const b = $(id);
  const go = (e) => {
    e.preventDefault();
    e.stopPropagation();
    b.classList.add('down');
    setTimeout(() => b.classList.remove('down'), 110);
    fn();
  };
  b.addEventListener('touchstart', go, { passive: false });
  b.addEventListener('click', (e) => { if (!IS_TOUCH) go(e); });
}

export function showHUD(on) {
  $('hud').classList.toggle('hidden', !on);
  document.body.classList.toggle('in-battle', !!on);
  $('btn-pad').classList.toggle('hidden', !on);
}

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------

let miniT = 0;

export function updateHUD(dt) {
  const p = state.player;
  if (!p) return;

  // hull
  const hp = clamp01(p.hpFrac);
  const fill = $('hull-fill');
  fill.style.width = (hp * 100) + '%';
  fill.classList.toggle('low', hp < 0.3);
  $('hull-text').textContent = Math.ceil(p.hp) + ' / ' + p.hpMax;

  // reload
  const rf = clamp01(p.reloadFrac);
  const rfill = $('reload-fill');
  rfill.style.width = (rf * 100) + '%';
  rfill.classList.toggle('ready', rf >= 1);
  $('reload-text').textContent = rf >= 1
    ? p.gun.short + ' · READY'
    : p.gun.short + ' · ' + Math.max(0, p.fireTimer).toFixed(1) + 's';

  // utility button
  const ub = $('btn-util');
  ub.querySelector('small').textContent = p.utilCharges != null ? p.utilCharges : '';
  ub.classList.toggle('spent', !p.utilCharges || p.utilCd > 0);

  // drone chip
  const d = state.drone;
  const dchip = $('drone-chip');
  if (d) {
    $('drone-fill').style.width = (d.alive ? d.hpFrac * 100 : 0) + '%';
    dchip.classList.toggle('down', !d.alive);
    $('drone-mode').textContent = d.alive
      ? (d.mode === 'scout' ? 'SCOUTING' : 'ORBIT')
      : 'REBUILD ' + Math.ceil(d.downTimer) + 's';
    $('btn-drone').classList.toggle('active', state.camMode === 'drone');
    $('btn-drone').classList.toggle('spent', !d.alive);
  }
  $('btn-scope').classList.toggle('active', state.camMode === 'scope');

  // wind — the arrow points the way the shells drift
  const w = state.wind;
  $('wind-arrow').style.transform = `rotate(${Math.atan2(w.x, -w.z) * 180 / Math.PI}deg)`;
  $('wind-text').textContent = w.speed.toFixed(1);

  // status effects
  updateStatus(p);

  // objective
  updateObjectiveUI();

  // reticle
  updateReticle(p);

  // world overlays
  updateTags();
  updateArrows();
  updateMarkers();

  // overlays
  $('scope-overlay').classList.toggle('hidden', state.camMode !== 'scope');
  $('drone-overlay').classList.toggle('hidden', state.camMode !== 'drone');

  // streak
  const st = $('streak');
  if (state.streak >= 2 && state.streakTimer > 0) {
    st.classList.remove('hidden');
    st.textContent = state.streak + '× STREAK';
  } else st.classList.add('hidden');

  // minimap at 12fps — it does not need 60
  miniT -= dt;
  if (miniT <= 0) { miniT = 0.08; drawMinimap(); }

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) $('banner').classList.add('hidden');
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.add('hidden');
  }
  updateFloaters(dt);
}

function updateStatus(p) {
  const row = $('status-row');
  const parts = [];
  if (p.trackTimer > 0) parts.push(['TRACKS', 'bad']);
  if (p.turretTimer > 0) parts.push(['TURRET', 'bad']);
  if (p.empTimer > 0) parts.push(['EMP', 'bad']);
  if (p.boostTimer > 0) parts.push(['NITRO', 'good']);
  if (p.smokeTimer > 0) parts.push(['CONCEALED', 'good']);
  if (p.healTimer > 0) parts.push(['REPAIRING', 'good']);
  const key = parts.map((x) => x[0]).join(',');
  if (key === row.dataset.key) return;
  row.dataset.key = key;
  row.textContent = '';
  for (const [label, cls] of parts) row.appendChild(el('span', 'status ' + cls, label));
}

function updateObjectiveUI() {
  const o = state.objective;
  if (!o) return;
  $('obj-label').textContent = o.label;
  let frac = 0, sub = '';
  switch (o.kind) {
    case 'survive':
      frac = clamp01(o.progress);
      sub = fmtTime(Math.max(0, o.timeLeft)) + ' REMAINING';
      break;
    case 'hold':
      frac = clamp01(o.progress);
      sub = o.inside
        ? fmtTime(Math.max(0, o.timeLeft)) + ' TO HOLD'
        : '⚠ LEAVE THE ZONE AND THE CLOCK STOPS';
      break;
    case 'escort':
      frac = clamp01(o.progress);
      sub = state.convoy
        ? 'HAULER ' + Math.ceil(state.convoy.hpFrac * 100) + '%'
        : '';
      break;
    case 'boss':
      frac = clamp01(o.progress);
      sub = state.boss && state.boss.alive
        ? state.boss.name + ' ' + Math.ceil(state.boss.hpFrac * 100) + '%'
        : '';
      break;
    default:
      frac = o.goal ? clamp01(o.progress / o.goal) : 0;
      sub = Math.max(0, Math.floor(o.progress)) + ' / ' + o.goal;
  }
  $('obj-fill').style.width = (frac * 100) + '%';
  $('obj-fill').classList.toggle('warn', o.kind === 'hold' && !o.inside);
  $('obj-sub').textContent = sub;
}

function updateReticle(p) {
  const r = $('reticle');
  const show = state.camMode !== 'drone';
  r.classList.toggle('hidden', !show);
  if (!show) return;
  const x = (input.aim.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-input.aim.y * 0.5 + 0.5) * window.innerHeight;
  r.style.transform = `translate(${x}px, ${y}px)`;
  r.classList.toggle('locked', !!state.lockTarget);
  r.classList.toggle('ready', p.fireTimer <= 0);
  r.classList.toggle('invalid', state.aimValid === false);
  const rng = $('ret-range');
  rng.textContent = state.aimRange ? Math.round(state.aimRange) + 'm' : '';
}

// ---------------------------------------------------------------------------
// Name tags
// ---------------------------------------------------------------------------

const TAG_POOL = 14;
const tags = [];
const placedTags = [];

function buildTagPool() {
  const cont = $('tags');
  cont.textContent = '';
  tags.length = 0;
  for (let i = 0; i < TAG_POOL; i++) {
    const tag = el('div', 'tag');
    const name = el('div', 'tag-name');
    const bar = el('div', 'tag-bar');
    const fill = el('i');
    bar.appendChild(fill);
    const meta = el('div', 'tag-meta');
    tag.append(name, bar, meta);
    tag.style.display = 'none';
    cont.appendChild(tag);
    tags.push({ tag, name, fill, meta });
  }
}

function updateTags() {
  const p = state.player;
  let used = 0;
  const list = [];
  for (const t of state.tanks) {
    if (!t.alive || t === p) continue;
    const hostile = t.faction !== p.faction;
    const spotted = t.spottedUntil > state.time;
    const d = t.pos.distanceTo(p.pos);
    if (hostile && !spotted && d > 82) continue;
    list.push({ t, d, spotted, hostile });
  }
  list.sort((a, b) => a.d - b.d);

  placedTags.length = 0;
  for (const item of list) {
    if (used >= TAG_POOL) break;
    const { t, d, spotted, hostile } = item;
    _v.copy(t.pos);
    _v.y += t.boss ? 4.6 : 3.4;
    _v.project(camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.04 || Math.abs(_v.y) > 1.04) continue;
    const sx = (_v.x * 0.5 + 0.5) * window.innerWidth;
    let sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    // a knot of contacts at similar range stacks instead of overprinting
    for (let pass = 0; pass < 4; pass++) {
      let clash = false;
      for (const p of placedTags) {
        if (Math.abs(p.x - sx) < 84 && Math.abs(p.y - sy) < 30) { clash = true; break; }
      }
      if (!clash) break;
      sy -= 30;
    }
    placedTags.push({ x: sx, y: sy });
    const e = tags[used++];
    e.tag.style.display = 'block';
    e.tag.style.transform = `translate(${sx}px, ${sy}px)`;
    e.tag.className = 'tag' + (hostile ? ' hostile' : ' friendly') +
      (spotted ? ' spotted' : '') + (t.boss ? ' boss' : '') +
      (t.markedUntil > state.time ? ' marked' : '');
    if (e.nameCache !== t.name) { e.name.textContent = t.name; e.nameCache = t.name; }
    e.name.style.color = t.accentCss;
    e.fill.style.width = (t.hpFrac * 100) + '%';
    const label = t.isConvoy ? 'HAULER' : (t.personality ? t.personality.label : '');
    e.meta.textContent = Math.round(d) + 'm' + (label ? ' · ' + label : '');
    const s = clamp(1.25 - d * 0.006, 0.66, 1.15);
    e.tag.style.setProperty('--s', s);
  }
  for (let i = used; i < TAG_POOL; i++) tags[i].tag.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Off-screen threat arrows
// ---------------------------------------------------------------------------

const ARROWS = 8;
const arrows = [];

function buildArrowPool() {
  const cont = $('arrows');
  cont.textContent = '';
  arrows.length = 0;
  for (let i = 0; i < ARROWS; i++) {
    const a = el('div', 'threat-arrow');
    a.style.display = 'none';
    cont.appendChild(a);
    arrows.push(a);
  }
}

function updateArrows() {
  const p = state.player;
  let used = 0;
  if (p && p.alive) {
    const near = [];
    for (const t of state.tanks) {
      if (!t.alive || t.faction === p.faction) continue;
      const d = t.pos.distanceTo(p.pos);
      if (d > 95) continue;
      if (!(t.spottedUntil > state.time) && d > 70) continue;
      near.push({ t, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { t, d } of near) {
      if (used >= ARROWS) break;
      _v.copy(t.pos);
      _v.y += 1.5;
      _v.project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.92 && Math.abs(_v.y) < 0.9;
      if (onScreen) continue;
      if (_v.z > 1) { _v.x *= -1; _v.y *= -1; }
      const s = Math.max(Math.abs(_v.x) / 0.9, Math.abs(_v.y) / 0.86, 1e-4);
      const nx = _v.x / s, ny = _v.y / s;
      const a = arrows[used++];
      a.style.display = 'block';
      a.style.borderLeftColor = t.accentCss;
      a.style.left = ((nx * 0.5 + 0.5) * window.innerWidth - 9) + 'px';
      a.style.top = ((-ny * 0.5 + 0.5) * window.innerHeight - 10) + 'px';
      a.style.transform = `rotate(${Math.atan2(-ny, nx) * 180 / Math.PI}deg)`;
      a.style.opacity = clamp(1 - d / 110, 0.35, 1);
    }
  }
  for (let i = used; i < ARROWS; i++) arrows[i].style.display = 'none';
}

// ---------------------------------------------------------------------------
// Objective markers in the world
// ---------------------------------------------------------------------------

const markerPool = [];
const MARKERS = 8;

function marker(i) {
  while (markerPool.length <= i) {
    const m = el('div', 'wmark');
    const icon = el('b');
    const dist = el('small');
    m.append(icon, dist);
    m.style.display = 'none';
    $('markers').appendChild(m);
    markerPool.push({ m, icon, dist });
  }
  return markerPool[i];
}

function updateMarkers() {
  const p = state.player;
  let used = 0;
  const items = [];
  const o = state.objective;
  if (o) {
    if (o.kind === 'demolish') {
      for (const pr of props) {
        if (pr.objective && pr.alive) {
          items.push({ pos: pr.grp.position, y: pr.h + 2, icon: '◎', cls: 'target' });
        }
      }
    } else if (o.kind === 'hold') {
      items.push({ pos: new THREE.Vector3(0, 0, 0), y: 6, icon: '◈', cls: 'zone' });
    } else if (o.kind === 'escort' && state.convoy && state.convoy.alive) {
      items.push({ pos: state.convoy.pos, y: 5, icon: '▣', cls: 'friend' });
      if (state.convoyGoal) {
        items.push({
          pos: new THREE.Vector3(state.convoyGoal.x, 0, state.convoyGoal.z),
          y: 5, icon: '⚑', cls: 'zone',
        });
      }
    }
  }
  for (const it of items) {
    if (used >= MARKERS) break;
    _v.copy(it.pos);
    _v.y = (it.pos.y || terrainHeight(it.pos.x, it.pos.z)) + it.y;
    const d = p ? _v.distanceTo(p.pos) : 0;
    _v.project(camera);
    if (_v.z > 1) continue;
    const e = marker(used++);
    e.m.style.display = 'block';
    e.m.className = 'wmark ' + it.cls;
    // keep markers clear of the hull panel (top left) and the minimap (top right)
    const mx = clamp((_v.x * 0.5 + 0.5) * window.innerWidth, 30, window.innerWidth - 30);
    let my = clamp((-_v.y * 0.5 + 0.5) * window.innerHeight, 60, window.innerHeight - 120);
    if (my < 190 && (mx < 260 || mx > window.innerWidth - 200)) my = 190;
    e.m.style.left = mx + 'px';
    e.m.style.top = my + 'px';
    e.icon.textContent = it.icon;
    e.dist.textContent = Math.round(d) + 'm';
  }
  for (let i = used; i < markerPool.length; i++) markerPool[i].m.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

const MAP_R = 118;   // world radius the minimap covers

function drawMinimap() {
  if (!miniCtx) return;
  const c = miniCtx;
  const W = mini.width, H = mini.height;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2 - 6) / MAP_R;
  c.clearRect(0, 0, W, H);

  // field
  c.fillStyle = 'rgba(8, 14, 18, 0.62)';
  c.beginPath();
  c.arc(cx, cy, W / 2 - 3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255, 194, 77, 0.35)';
  c.lineWidth = 1.5;
  c.stroke();

  const p = state.player;
  if (!p) return;

  // scenery as faint dots
  c.fillStyle = 'rgba(150, 150, 140, 0.3)';
  for (const pr of props) {
    if (!pr.alive || !pr.tall) continue;
    const x = cx + pr.grp.position.x * scale;
    const y = cy + pr.grp.position.z * scale;
    c.fillRect(x - 1, y - 1, 2, 2);
  }

  // hold zone
  const o = state.objective;
  if (o && o.kind === 'hold') {
    c.strokeStyle = 'rgba(106, 255, 200, 0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(cx, cy, o.zoneR * scale, 0, Math.PI * 2);
    c.stroke();
  }
  if (o && o.kind === 'demolish') {
    c.fillStyle = '#ffd750';
    for (const pr of props) {
      if (!pr.objective || !pr.alive) continue;
      const x = cx + pr.grp.position.x * scale;
      const y = cy + pr.grp.position.z * scale;
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    }
  }

  // drone uplink circle
  const d = state.drone;
  if (d && d.alive) {
    c.strokeStyle = 'rgba(106, 228, 255, 0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx + d.pos.x * scale, cy + d.pos.z * scale, d.spotR * scale, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#6ae4ff';
    c.beginPath();
    c.arc(cx + d.pos.x * scale, cy + d.pos.z * scale, 2.6, 0, Math.PI * 2);
    c.fill();
  }

  // contacts
  for (const t of state.tanks) {
    if (!t.alive || t === p) continue;
    const hostile = t.faction !== p.faction;
    const spotted = t.spottedUntil > state.time;
    const dist = t.pos.distanceTo(p.pos);
    if (hostile && !spotted && dist > 58) continue;
    const x = cx + t.pos.x * scale;
    const y = cy + t.pos.z * scale;
    c.fillStyle = hostile ? (spotted ? '#ff4a3a' : 'rgba(255,120,90,0.5)') : '#6affc8';
    c.beginPath();
    c.arc(x, y, t.boss ? 4.5 : 3, 0, Math.PI * 2);
    c.fill();
    if (t.markedUntil > state.time) {
      c.strokeStyle = '#ffd750';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // player arrow
  const px = cx + p.pos.x * scale;
  const py = cy + p.pos.z * scale;
  c.save();
  c.translate(px, py);
  c.rotate(-p.turretYaw + Math.PI);
  c.fillStyle = '#ffc24d';
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 5);
  c.lineTo(0, 3);
  c.lineTo(-4, 5);
  c.closePath();
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------------------
// Banner / toast / feed / damage numbers
// ---------------------------------------------------------------------------

export function showBanner(text, small = false) {
  const b = $('banner');
  const t = $('banner-text');
  t.textContent = text;
  t.classList.toggle('small', !!small);
  b.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  bannerTimer = 1.9;
}

export function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  toastTimer = 1.9;
}

export function flashHit() {
  const f = $('hit-flash');
  f.classList.remove('hidden');
  f.style.animation = 'none';
  void f.offsetWidth;
  f.style.animation = '';
}

function hitMark(kill) {
  const h = $('hitmark');
  h.className = kill ? 'kill' : '';
  h.style.animation = 'none';
  void h.offsetWidth;
  h.style.animation = '';
}

export function addFeed(attacker, victim) {
  const feed = $('feed');
  const row = el('div', 'feed-row');
  if (attacker && attacker !== victim) {
    const a = el('b', null, attacker.name);
    a.style.color = attacker.accentCss;
    row.append(a, el('span', 'feed-icon', ' ✖ '));
  } else {
    row.append(el('b', 'feed-env', 'THE FIELD'), el('span', 'feed-icon', ' ✖ '));
  }
  const v = el('b', null, victim.name);
  v.style.color = victim.accentCss;
  row.appendChild(v);
  if (attacker && attacker.isPlayer) row.classList.add('mine');
  feed.prepend(row);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => row.classList.add('fade'), 3400);
  setTimeout(() => row.remove(), 4200);
}

export function clearFeed() { $('feed').textContent = ''; }

const floaters = [];

function floatDamage({ tank, dmg, face, splash }) {
  if (dmg < 1) return;
  const f = el('div', 'floater' + (face === 'REAR' ? ' crit' : '') + (splash ? ' splash' : ''));
  f.textContent = Math.round(dmg) + (face && !splash ? ' ' + face : '');
  $('floaters').appendChild(f);
  _v.copy(tank.pos);
  _v.y += 3;
  floaters.push({ el: f, pos: _v.clone(), t: 0.95, off: 0 });
  if (floaters.length > 18) {
    const old = floaters.shift();
    old.el.remove();
  }
}

function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t -= dt;
    if (f.t <= 0) { f.el.remove(); floaters.splice(i, 1); continue; }
    f.off += dt * 26;
    _v.copy(f.pos);
    _v.y += f.off * 0.06;
    _v.project(camera);
    if (_v.z > 1) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.opacity = clamp01(f.t / 0.6);
    f.el.style.transform =
      `translate(${(_v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-_v.y * 0.5 + 0.5) * window.innerHeight - f.off}px)`;
  }
}

// Called once per battle start.
export function resetHUD() {
  clearFeed();
  for (const f of floaters) f.el.remove();
  floaters.length = 0;
  $('banner').classList.add('hidden');
  $('toast').classList.add('hidden');
  const rank = worldRank();
  const tier = tierFor(rank);
  $('hud-name').textContent = profile.name;
  const rc = $('hud-rank');
  rc.textContent = fmtRank(rank);
  rc.style.color = tier.colour;
  const p = state.player;
  if (p) {
    $('chip-hull').textContent = p.stats.chassis.name;
    $('chip-gun').textContent = p.gun.short;
  }
}

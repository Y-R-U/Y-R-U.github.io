// All DOM: HUD, leaderboard, neon name tags, kill feed, banners, popups and
// the callsign modal. No alerts, no prompts — ever.

import * as THREE from 'three';
import { NAME_POOL, IS_TOUCH } from './config.js';
import { $, clamp, pickRandom } from './utils.js';
import { camera } from './world.js';
import { state, aliveTanks } from './state.js';

const _v = new THREE.Vector3();
let handlers = {};

// ---------------------------------------------------------------------------
// Init / wiring
// ---------------------------------------------------------------------------

export function initUI(h) {
  handlers = h;

  $('btn-play').addEventListener('click', () => handlers.onPlay());
  $('btn-help').addEventListener('click', () => $('help-box').classList.toggle('hidden'));
  $('btn-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-spectate').addEventListener('click', () => handlers.onSpectate());
  $('btn-win-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-win-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-spec-retry').addEventListener('click', () => handlers.onRetry());
  $('btn-spec-menu').addEventListener('click', () => handlers.onMenu());
  $('btn-edit-name').addEventListener('click', () => openNameModal());
  $('btn-title-edit').addEventListener('click', () => openNameModal());
  $('btn-mute').addEventListener('click', () => handlers.onToggleMute());

  for (const pill of document.querySelectorAll('.mode-pill')) {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.mode-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      handlers.onModeChange(parseInt(pill.dataset.count, 10));
    });
  }

  // callsign modal
  $('btn-name-cancel').addEventListener('click', closeNameModal);
  $('btn-name-random').addEventListener('click', () => {
    $('name-input').value = pickRandom(NAME_POOL);
  });
  $('btn-name-save').addEventListener('click', saveNameFromModal);
  $('name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNameFromModal();
    if (e.key === 'Escape') closeNameModal();
    e.stopPropagation();   // don't let WASD drive the tank while typing
  });
  $('name-input').addEventListener('keyup', (e) => e.stopPropagation());

  buildArrowPool();
}

export function selectModePill(count) {
  document.querySelectorAll('.mode-pill').forEach((p) =>
    p.classList.toggle('selected', parseInt(p.dataset.count, 10) === count));
}

// ---------------------------------------------------------------------------
// Callsign modal
// ---------------------------------------------------------------------------

export function sanitizeName(raw) {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 10);
  return s.length >= 2 ? s : null;
}

function openNameModal() {
  $('name-input').value = state.playerName;
  $('name-modal').classList.remove('hidden');
  setTimeout(() => $('name-input').focus(), 50);
}

function closeNameModal() {
  $('name-modal').classList.add('hidden');
}

function saveNameFromModal() {
  const name = sanitizeName($('name-input').value);
  if (!name) {
    $('name-input').classList.add('shake');
    setTimeout(() => $('name-input').classList.remove('shake'), 400);
    return;
  }
  closeNameModal();
  handlers.onNameSave(name);
}

export function setPlayerNameUI(name) {
  $('player-name').textContent = name;
  $('title-name').textContent = name;
}

// ---------------------------------------------------------------------------
// Screens / HUD chrome
// ---------------------------------------------------------------------------

export function showTitle() {
  $('title-screen').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('leaderboard').classList.add('hidden');
  $('spectate-bar').classList.add('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
  hidePopups();
  clearTags();
  clearFeed();
}

export function showMatchHUD() {
  $('title-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('leaderboard').classList.remove('hidden');
  $('spectate-bar').classList.add('hidden');
  document.body.classList.add('playing');
  hidePopups();
  if (IS_TOUCH) {
    $('touch-left').classList.remove('hidden');
    $('touch-fire').classList.remove('hidden');
  } else {
    $('crosshair').classList.remove('hidden');
  }
}

export function hidePopups() {
  $('gameover-popup').classList.add('hidden');
  $('victory-popup').classList.add('hidden');
  $('name-modal').classList.add('hidden');
}

export function showDefeat({ place, total, kills, time, killer }) {
  $('go-place').textContent = '#' + place + ' / ' + total;
  $('go-kills').textContent = kills;
  $('go-time').textContent = time;
  $('go-killer').textContent = killer;
  $('gameover-popup').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
}

export function showVictory({ kills, time }) {
  $('win-kills').textContent = kills;
  $('win-time').textContent = time;
  $('victory-popup').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
}

export function showSpectateBar(name, place) {
  $('gameover-popup').classList.add('hidden');
  $('spec-name').textContent = name;
  $('spec-place').textContent = '#' + place;
  $('spectate-bar').classList.remove('hidden');
}

export function updateSpectateName(name) {
  $('spec-name').textContent = name;
}

export function updateMuteBtn(muted) {
  const b = $('btn-mute');
  b.classList.remove('hidden');
  b.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  b.classList.toggle('muted', muted);
}

// ---------------------------------------------------------------------------
// Banner / hit flash / zone status
// ---------------------------------------------------------------------------

export function showBanner(text, small) {
  const el = $('banner-text');
  el.textContent = text;
  el.classList.toggle('small', !!small);
  $('banner').classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

export function flashHit() {
  const el = $('hit-flash');
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

export function setZoneStatus(text, mode) {
  const el = $('zone-status');
  if (!text) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = text;
  el.classList.toggle('danger', mode === 'danger');
}

// ---------------------------------------------------------------------------
// HUD numbers
// ---------------------------------------------------------------------------

export function updateHUD() {
  $('alive-count').textContent = aliveTanks().length;
  const p = state.player;
  if (!p) return;
  const k = clamp(p.hp / 100, 0, 1);
  $('hp-fill').style.width = (k * 100) + '%';
  $('hp-fill').classList.toggle('low', k < 0.35);
  $('player-kills').textContent = p.kills;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export function updateLeaderboard() {
  const lb = $('leaderboard');
  lb.textContent = '';

  const header = document.createElement('div');
  header.className = 'lb-header';
  header.textContent = 'STANDINGS';
  lb.appendChild(header);

  const alive = state.tanks.filter((t) => t.alive)
    .sort((a, b) => b.kills - a.kills || b.hp - a.hp);
  const dead = state.tanks.filter((t) => !t.alive)
    .sort((a, b) => a.place - b.place);

  let rank = 1;
  for (const t of alive) {
    lb.appendChild(lbRow(t, rank++, true));
  }
  for (const t of dead) {
    lb.appendChild(lbRow(t, t.place, false));
  }
}

function lbRow(t, rank, alive) {
  const row = document.createElement('div');
  row.className = 'lb-row' + (alive ? '' : ' dead') + (t.isPlayer ? ' you' : '');

  const rk = document.createElement('span');
  rk.className = 'lb-rank';
  rk.textContent = alive ? rank : '☠';
  row.appendChild(rk);

  const name = document.createElement('span');
  name.className = 'lb-name';
  name.style.color = alive ? t.accentCss : '';
  name.textContent = t.name;
  row.appendChild(name);

  if (t.personality) {
    const pers = document.createElement('small');
    pers.className = 'lb-pers';
    pers.textContent = t.personality.label;
    row.appendChild(pers);
  }

  const kills = document.createElement('span');
  kills.className = 'lb-kills';
  kills.textContent = '⚔' + t.kills;
  row.appendChild(kills);

  if (alive) {
    const hp = document.createElement('span');
    hp.className = 'lb-hp';
    const fill = document.createElement('i');
    fill.style.width = clamp(t.hp, 0, 100) + '%';
    hp.appendChild(fill);
    row.appendChild(hp);
  } else {
    const place = document.createElement('span');
    place.className = 'lb-place';
    place.textContent = '#' + t.place;
    row.appendChild(place);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Kill feed
// ---------------------------------------------------------------------------

export function addFeed(attacker, victim) {
  const feed = $('feed');
  const row = document.createElement('div');
  row.className = 'feed-row';

  if (attacker && attacker !== victim) {
    const a = document.createElement('b');
    a.style.color = attacker.accentCss;
    a.textContent = attacker.name;
    row.appendChild(a);
    row.appendChild(document.createTextNode(' ⚡ '));
  } else {
    const s = document.createElement('b');
    s.className = 'feed-storm';
    s.textContent = 'STORM';
    row.appendChild(s);
    row.appendChild(document.createTextNode(' \u{1F300} '));
  }
  const v = document.createElement('b');
  v.style.color = victim.accentCss;
  v.textContent = victim.name;
  row.appendChild(v);

  feed.prepend(row);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => { row.classList.add('fade'); }, 3600);
  setTimeout(() => { row.remove(); }, 4400);
}

export function clearFeed() {
  $('feed').textContent = '';
}

// ---------------------------------------------------------------------------
// Name tags — neon stem rising from each tank to an underlined name
// ---------------------------------------------------------------------------

const tagMap = new Map();   // Tank -> element

export function buildTags() {
  clearTags();
  const cont = $('tags');
  for (const t of state.tanks) {
    const tag = document.createElement('div');
    tag.className = 'tag' + (t.isPlayer ? ' tag-you' : '');

    const stem = document.createElement('div');
    stem.className = 'tag-stem';
    stem.style.background = t.accentCss;
    stem.style.boxShadow = `0 0 6px ${t.accentCss}`;
    tag.appendChild(stem);

    const name = document.createElement('div');
    name.className = 'tag-name';
    name.style.color = t.accentCss;
    name.style.borderBottomColor = t.accentCss;
    name.style.textShadow = `0 0 8px ${t.accentCss}`;
    name.style.boxShadow = `0 6px 12px -8px ${t.accentCss}`;
    name.textContent = t.name;
    tag.appendChild(name);

    cont.appendChild(tag);
    tagMap.set(t, { tag, name });
  }
}

export function renameTag(tank, newName) {
  const entry = tagMap.get(tank);
  if (entry) entry.name.textContent = newName;
}

export function clearTags() {
  $('tags').textContent = '';
  tagMap.clear();
}

export function updateTags() {
  for (const [t, { tag, name }] of tagMap) {
    if (!t.alive) { tag.style.display = 'none'; continue; }
    _v.copy(t.pos);
    _v.y += 3.1;
    _v.project(camera);
    const behind = _v.z > 1;
    if (behind || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) {
      tag.style.display = 'none';
      continue;
    }
    tag.style.display = 'block';
    tag.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
    tag.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
    const dist = t.pos.distanceTo(camera.position);
    name.style.fontSize = clamp(16 - dist * 0.07, 10, 14) + 'px';
    tag.style.opacity = dist > 80 ? 0.5 : 1;
  }
}

// ---------------------------------------------------------------------------
// Off-screen enemy arrows (accent-colored)
// ---------------------------------------------------------------------------

const arrowEls = [];

function buildArrowPool() {
  const cont = $('arrows');
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'threat-arrow';
    el.style.display = 'none';
    cont.appendChild(el);
    arrowEls.push(el);
  }
}

export function updateArrows() {
  let used = 0;
  const p = state.player;
  if (p && p.alive && state.phase === 'playing') {
    const near = aliveTanks()
      .filter((t) => t !== p && t.pos.distanceTo(p.pos) < 45)
      .sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
    for (const t of near) {
      if (used >= arrowEls.length) break;
      _v.copy(t.pos);
      _v.y += 1;
      _v.project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.92;
      if (onScreen) continue;
      if (_v.z > 1) { _v.x *= -1; _v.y *= -1; }
      const s = Math.max(Math.abs(_v.x) / 0.9, Math.abs(_v.y) / 0.85, 0.0001);
      const nx = _v.x / s;
      const ny = _v.y / s;
      const el = arrowEls[used++];
      el.style.display = 'block';
      el.style.borderLeftColor = t.accentCss;
      el.style.filter = `drop-shadow(0 0 5px ${t.accentCss})`;
      el.style.left = ((nx * 0.5 + 0.5) * innerWidth - 8) + 'px';
      el.style.top = ((-ny * 0.5 + 0.5) * innerHeight - 9) + 'px';
      el.style.transform = `rotate(${Math.atan2(-ny, nx) * 180 / Math.PI}deg)`;
    }
  }
  for (let i = used; i < arrowEls.length; i++) arrowEls[i].style.display = 'none';
}

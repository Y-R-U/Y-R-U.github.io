// All DOM: HUD, banners, popups (never alert()), threat arrows, score pops.

import * as THREE from 'three';
import { $, clamp } from './utils.js';
import { camera } from './world.js';
import { state } from './state.js';
import { IS_TOUCH, VARIANTS } from './config.js';

let bannerTimer = null;

export function initUI({ onPlay, onRetry, onMenu, onToggleMute }) {
  $('btn-play').addEventListener('click', onPlay);
  $('btn-retry').addEventListener('click', onRetry);
  $('btn-menu').addEventListener('click', onMenu);
  $('btn-mute').addEventListener('click', onToggleMute);
  $('btn-help').addEventListener('click', () => {
    $('help-box').classList.toggle('hidden');
  });
  $('btn-mute').classList.remove('hidden');
  $('hi-score').textContent = state.best;
}

export function showTitle() {
  $('title-screen').classList.remove('hidden');
  $('gameover-popup').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('boss-bar').classList.add('hidden');
  $('crosshair').classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');
  document.body.classList.remove('playing');
  clearArrows();
}

export function showHUD() {
  $('title-screen').classList.add('hidden');
  $('gameover-popup').classList.add('hidden');
  $('help-box').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (IS_TOUCH) {
    $('touch-left').classList.remove('hidden');
    $('touch-fire').classList.remove('hidden');
  } else {
    $('crosshair').classList.remove('hidden');
    document.body.classList.add('playing');
  }
}

export function showGameOver({ score, best, wave, kills }) {
  $('go-score').textContent = score;
  $('go-hi').textContent = best;
  $('go-wave').textContent = wave;
  $('go-kills').textContent = kills;
  $('gameover-popup').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  $('boss-bar').classList.add('hidden');
  document.body.classList.remove('playing');
  clearArrows();
}

export function showBanner(text) {
  const b = $('banner');
  const t = $('banner-text');
  b.classList.remove('hidden');
  t.textContent = text;
  // restart the CSS animation
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 2300);
}

export function flashHit() {
  const f = $('hit-flash');
  f.classList.remove('hidden');
  f.style.animation = 'none';
  void f.offsetWidth;
  f.style.animation = '';
}

export function updateMuteBtn(muted) {
  $('btn-mute').textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  $('btn-mute').classList.toggle('muted', muted);
}

export function updateHUD(crowsLeft) {
  $('score').textContent = state.score;
  $('wave').textContent = state.wave;
  $('crows-left').textContent = crowsLeft;
  $('hi-score').textContent = Math.max(state.best, state.score);
  const fill = $('armor-fill');
  const frac = clamp(state.armor / 100, 0, 1);
  fill.style.width = (frac * 100) + '%';
  fill.classList.toggle('low', frac < 0.35);
}

export function showBossBar(show) {
  $('boss-bar').classList.toggle('hidden', !show);
}

export function updateBossBar(hp) {
  $('boss-fill').style.width = clamp(hp / VARIANTS.boss.hp, 0, 1) * 100 + '%';
}

// ---------------------------------------------------------------------------
// Floating score pops
// ---------------------------------------------------------------------------

const projV = new THREE.Vector3();

export function scorePop(worldPos, text) {
  projV.copy(worldPos).project(camera);
  if (projV.z > 1) return;
  const x = (projV.x * 0.5 + 0.5) * innerWidth;
  const y = (-projV.y * 0.5 + 0.5) * innerHeight;
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('popups').appendChild(el);
  requestAnimationFrame(() => {
    el.style.transition = 'transform 0.8s ease-out, opacity 0.8s ease-out';
    el.style.transform = 'translate(-50%, -120%)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 850);
}

// ---------------------------------------------------------------------------
// Off-screen threat arrows for crows that are aiming or diving
// ---------------------------------------------------------------------------

const arrowPool = [];

export function updateArrows(threats) {
  const holder = $('arrows');
  while (arrowPool.length < threats.length) {
    const a = document.createElement('div');
    a.className = 'threat-arrow';
    holder.appendChild(a);
    arrowPool.push(a);
  }
  const margin = 36;
  let used = 0;
  for (const c of threats) {
    projV.copy(c.pos).project(camera);
    const behind = projV.z > 1;
    let nx = behind ? -projV.x : projV.x;
    let ny = behind ? -projV.y : projV.y;
    if (!behind && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.92) continue;  // on screen
    const k = Math.max(Math.abs(nx), Math.abs(ny), 0.0001);
    nx /= k; ny /= k;
    const x = clamp((nx * 0.5 + 0.5) * innerWidth, margin, innerWidth - margin);
    const y = clamp((-ny * 0.5 + 0.5) * innerHeight, margin, innerHeight - margin);
    const ang = Math.atan2(y - innerHeight / 2, x - innerWidth / 2);
    const a = arrowPool[used++];
    a.style.display = 'block';
    a.style.left = (x - 8) + 'px';
    a.style.top = (y - 9) + 'px';
    a.style.transform = `rotate(${ang}rad)`;
  }
  for (let i = used; i < arrowPool.length; i++) arrowPool[i].style.display = 'none';
}

export function clearArrows() {
  for (const a of arrowPool) a.style.display = 'none';
}

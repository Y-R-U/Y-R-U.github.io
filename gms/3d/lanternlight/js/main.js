import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createGame } from './game.js';
import { CHAPTERS, loadLines } from './chapters.js';

const $ = (id) => document.getElementById(id);
const params = Object.fromEntries(new URLSearchParams(location.search));
const bootFill = $('bootFill');

function store(key, def) {
  let v = def;
  try { v = { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch (e) { /* storage blocked */ }
  return {
    data: v,
    set(k, val) { v[k] = val; try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
}

const mobile = matchMedia('(pointer: coarse)').matches;
const settings = store('lanternlight_settings', { music: 0.8, voice: 1, sfx: 0.8, subs: true, hq: !mobile });
const saveStore = store('lanternlight_save', { hero: 'ivy', unlocked: 0, done: false });
const save = {
  get hero() { return saveStore.data.hero; },
  set: (k, v) => saveStore.set(k, v),
  unlock(i) { if (i > saveStore.data.unlocked) saveStore.set('unlocked', i); },
};

async function boot() {
  bootFill.style.width = '20%';
  const manifest = await fetch('audio/vo/manifest.json').then((r) => r.json()).catch(() => ({}));
  loadLines(manifest);
  bootFill.style.width = '45%';
  const world = createWorld($('gl'), { bloom: params.lite === undefined, hq: settings.data.hq && params.lite === undefined });
  const audio = createAudio(settings.data);
  const ui = createUI(); ui.subsOn = settings.data.subs;
  bootFill.style.width = '70%';
  const G = createGame(world, audio, ui, save, params);
  window.__game = G;
  bootFill.style.width = '100%';

  let last = performance.now(), frames = 0;
  const scale = +(params.fast || 1);
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    G.update(dt * scale);
    frames++;
    requestAnimationFrame(loop);
  }
  G.showTitle();
  requestAnimationFrame(loop);
  window.__boot.ready = true;
  setTimeout(() => { ui.hide('boot'); if (params.ch === undefined) ui.show('title'); }, 400);

  const unlock = () => audio.init();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  const go = (from, to) => { ui.hide(from); ui.show(to); };
  $('btnBegin').onclick = () => { go('title', 'pick'); G.state = 'pick'; selectHero(save.hero); };
  $('btnPickBack').onclick = () => { go('pick', 'title'); G.state = 'title'; };
  function selectHero(k) {
    document.querySelectorAll('.pick-card').forEach((c) => c.classList.toggle('sel', c.dataset.hero === k));
    G.pickHero(k); $('btnGo').classList.remove('hidden');
  }
  document.querySelectorAll('.pick-card').forEach((c) => (c.onclick = () => selectHero(c.dataset.hero)));
  $('btnGo').onclick = () => { ui.hide('pick'); ui.fade(true); setTimeout(() => G.playIntro(), 800); };

  $('btnChapters').onclick = () => {
    const list = $('chapterList'); list.innerHTML = '';
    CHAPTERS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'btn ghost';
      b.innerHTML = `<small>${i + 1}</small> ${c.title}`;
      b.disabled = i > saveStore.data.unlocked;
      b.onclick = () => { ui.hide('chapters'); if (i === 0) { ui.fade(true); setTimeout(() => G.playIntro(), 800); } else G.beginFromChapter(i); };
      list.appendChild(b);
    });
    go('title', 'chapters');
  };
  $('btnChapBack').onclick = () => go('chapters', 'title');

  const bindRange = (id, key) => { const el = $(id); el.value = settings.data[key]; el.oninput = () => { settings.set(key, +el.value); audio.applyVolumes(); }; };
  bindRange('setMusic', 'music'); bindRange('setVoice', 'voice'); bindRange('setSfx', 'sfx');
  $('setSubs').checked = settings.data.subs; $('setSubs').onchange = (e) => { settings.set('subs', e.target.checked); ui.subsOn = e.target.checked; };
  $('setHQ').checked = settings.data.hq; $('setHQ').onchange = (e) => settings.set('hq', e.target.checked);
  $('btnSettings').onclick = () => go('title', 'settings');
  $('btnSetBack').onclick = () => { go('settings', 'title'); if (settings.data.hq !== world.renderer.shadowMap.enabled) location.reload(); };

  const pause = (p) => { G.setPaused(p); ui[p ? 'show' : 'hide']('pause'); };
  $('btnPause').onclick = () => pause(true);
  $('btnResume').onclick = () => pause(false);
  $('btnRestartChap').onclick = () => { pause(false); G.restartChapter(); };
  $('btnQuit').onclick = () => { pause(false); G.toTitle(); ui.show('title'); };
  $('btnRetry').onclick = () => G.retry();
  $('btnFailQuit').onclick = () => { ui.hide('fail'); G.toTitle(); ui.show('title'); };
  $('btnEndDone').onclick = () => { ui.hide('ending'); $('btnEndDone').classList.add('hidden'); G.toTitle(); ui.show('title'); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && (G.state === 'play')) pause(true); });

  const lamp = $('lampBtn');
  lamp.addEventListener('pointerdown', (e) => { e.stopPropagation(); G.shine(); G.lampHold(true); });
  const release = () => G.lampHold(false);
  lamp.addEventListener('pointerup', release); lamp.addEventListener('pointercancel', release); lamp.addEventListener('pointerleave', release);

  const cv = $('gl');
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0 }; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    const w = innerWidth;
    G.steer((dx / w) * 11, (-dy / innerHeight) * 12);
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dt = performance.now() - drag.t, dy = e.clientY - drag.y;
    if ((dt < 280 && drag.moved < 16) || (dy < -50 && dt < 350 && Math.abs(e.clientX - drag.x) < Math.abs(dy))) G.jump();
    drag = null;
  });

  const keys = {}; G.keys = keys;
  const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  window.addEventListener('keydown', (e) => {
    if (map[e.code]) keys[map[e.code]] = true;
    if (e.code === 'Space' || ((e.code === 'ArrowUp' || e.code === 'KeyW') && G.ch().mode !== 'glide' && G.ch().mode !== 'ride')) G.jump();
    if ((e.code === 'KeyF' || e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) { G.shine(); G.lampHold(true); }
    if (e.code === 'Escape' && G.state === 'play') pause(!G.paused);
  });
  window.addEventListener('keyup', (e) => {
    if (map[e.code]) keys[map[e.code]] = false;
    if (e.code === 'KeyF' || e.code === 'KeyE' || e.code === 'Enter') G.lampHold(false);
  });

  if (params.hero) G.pickHero(params.hero);
  if (params.ch !== undefined) {
    ui.hide('title');
    const i = +params.ch;
    if (i === 0 && params.intro !== undefined) G.playIntro(); else G.beginFromChapter(i);
  }
}

boot().catch((e) => { $('bootMsg').textContent = 'Could not start: ' + e.message; $('bootReload').classList.remove('hidden'); console.error(e); });

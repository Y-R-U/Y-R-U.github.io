// SKYPUTT app shell: renderer, theme loading (?theme=), title screen with hole select, the round,
// fullscreen, resize / orientation, and the frame loop.
//   URL params: ?theme=<id> (default sky, else greybox) · ?hole=<n> start a hole directly · ?q=low|high
//   ?fresh (reset saved progress) · ?noflyover
import * as THREE from 'three';
import { COURSES } from '../course/holes/index.js';
import { buildHole } from '../course/builder.js';
import { buildHoleView } from '../game/holeview.js';
import { CameraRig } from '../game/camera.js';
import { Hud, ICONS } from '../game/hud.js';
import { Round } from '../game/play.js';
import { sfx } from '../game/sfxbus.js';
import { Store } from './store.js';
import { renderTitle, showMap, openSettings } from './menus.js';
import { createAudio } from '../audio/index.js';
import { createCareer } from '../story/career.js';
import { createEvents } from '../events/screen.js';
import { featured, timeText, status, nowFrom } from '../events/events.js';
import { createMeta } from '../meta/meta.js';
import { createMetaScreens, tierBadge } from '../meta/screens.js';
import { TIERS, weekCountdown } from '../meta/ladder.js';
import { createOnline } from '../net/index.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const store = new Store();
if (params.has('fresh')) store.reset();
const quality = params.get('q') === 'low' || params.get('q') === 'high' ? params.get('q') : (store.settings().quality === 'low' ? 'low' : 'high');
document.body.dataset.quality = quality;

// Audio (js/audio, owned by the sound agent). Everything goes through the sfx bus.
let audio = null;
try { audio = createAudio({ sfx: store.settings().sfx, music: store.settings().music }); } catch (e) { console.warn('[skyputt] audio unavailable', e); }
sfx.on((name, p) => {
  if (!audio) return;
  if (name === 'roll') audio.roll(p.speed, p.surface);
  else if (name === 'stopRoll') audio.stopRoll();
  else audio.play(name, p);
});
const unlock = () => { try { audio?.unlock(); } catch { /* */ } };
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);
function applySettings(st) {
  try { audio?.setVolume({ sfx: st.sfx, music: st.music }); } catch { /* */ }
  document.body.classList.toggle('lefty', !!st.lefty);
}
applySettings(store.settings());

async function loadTheme(id, renderer) {
  const ctx = { THREE, renderer, quality };
  const fallback = (await import('../themes/greybox/index.js')).default(ctx);
  if (id === 'greybox') return { theme: fallback, fallback, id: 'greybox' };
  try {
    const mod = await import(`../themes/${id}/index.js`);
    const theme = mod.default(ctx);
    if (!theme || typeof theme !== 'object') throw new Error('createTheme returned nothing');
    return { theme, fallback, id };
  } catch (e) {
    console.warn(`[skyputt] theme "${id}" unavailable, using greybox:`, e);
    return { theme: fallback, fallback, id: 'greybox' };
  }
}

async function boot() {
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
  const rig = new CameraRig(camera);
  const hud = new Hud($('#hud'));

  // theme: ?theme= overrides the saved pick (D7 loader falls back to greybox)
  const first = await loadTheme(params.get('theme') || store.settings().theme || 'sky', renderer);
  const course = COURSES.sky;
  // M5 meta (ladder, coins, chests, shop). `?eventdate=YYYY-MM-DD` pins its clock too (week tests).
  const meta = createMeta(store, () => nowFrom());
  const app = { renderer, scene, camera, rig, theme: first.theme, fallback: first.fallback, quality, hud, canvas, themeId: first.id, fullscreen: null, store, audio, meta };
  app.openSettings = onClose => openSettings(store, { apply: applySettings, onClose, click: () => sfx.emit('click') });
  audio?.music.start(app.themeId);

  // ---- resize / orientation (D13): live, portrait and landscape
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w > h ? 50 : 62;   // portrait needs a taller view to see down the fairway
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 120));
  screen.orientation?.addEventListener?.('change', () => setTimeout(resize, 120));
  resize();

  app.fullscreen = setupFullscreen();

  // ---- title screen: hole 1 slowly orbiting behind the menu
  let titleView = null, round = null;
  function showTitle() {
    round = null;
    ensureTitleScene();
    renderTitle(store, course, app.themeId, setTheme);
    renderEventTile();
    renderMetaTiles();
    renderOnlineTile?.();
    $('#title').hidden = false;
  }
  function ensureTitleScene() {
    if (!titleView) {
      const hole = buildHole(course.holes[0]);
      titleView = buildHoleView(scene, hole, app.theme, app.fallback, { renderer, camera, quality });
      const c = titleView.info.bounds.getCenter(new THREE.Vector3()), sz = titleView.info.bounds.getSize(new THREE.Vector3());
      rig.mode = 'orbit'; rig.orbitT = 0.6;
      rig.orbitCenter = { x: c.x, y: c.y, z: c.z, r: Math.max(sz.x, sz.z) * 0.85 + 2 };
    }
  }
  // Theme picker: swap themes in place (dispose the old one, load the new, rebuild the title scene).
  let swapping = false;
  async function setTheme(id) {
    if (swapping || id === app.themeId) return;
    sfx.emit('click');
    store.setSetting('theme', id);
    await useTheme(id);
    showTitle();
  }
  // Load a theme without saving it (event rounds use their own skin, then restore the player's).
  async function useTheme(id) {
    if (id === app.themeId) return;
    swapping = true;
    titleView?.dispose(); titleView = null;
    try { if (app.theme !== app.fallback) app.theme.dispose?.(); app.fallback.dispose?.(); } catch { /* */ }
    const t = await loadTheme(id, renderer);
    Object.assign(app, { theme: t.theme, fallback: t.fallback, themeId: t.id });
    window.__skyputt.themeId = t.id;
    audio?.music.start(t.id);
    swapping = false;
  }
  const playerTheme = () => params.get('theme') || store.settings().theme || 'sky';
  function showCourseMap() {
    $('#title').hidden = true;
    showMap(store, course, {
      onHole: i => startRound(i, 'single'), onFront: () => startRound(0, 'round', 9), onNine: nine => startRound(nine.from, 'round', nine.to), onBack: showTitle,
      click: () => sfx.emit('click'),
    });
  }
  function startRound(i, mode = 'round', end = null) {
    $('#title').hidden = true; $('#map').hidden = true;
    titleView?.dispose(); titleView = null;
    round = new Round(app, course, i, { mode, end, onExit: () => { if (mode === 'single') { showTitle(); showCourseMap(); } else showTitle(); } });
    if (params.has('noflyover')) round.endFlyover();
    window.__skyputt.round = round;
  }
  // ---- career (M3 story)
  const career = createCareer({
    store, click: () => sfx.emit('click'), back: () => sfx.emit('back'),
    onBack: () => showTitle(),
    // play an event's holes as a round; resolves with the result, or null if the player quits
    // story2: a chapter / event may name a theme (the tour travels); the player's own is restored after
    startEvent: (ev, evCourse, { opponents, tips, ghosts, theme }) => new Promise(async resolve => {
      $('#title').hidden = true;
      if (theme) await useTheme(theme);
      titleView?.dispose(); titleView = null;
      const done = async res => { round = null; if (theme) await useTheme(playerTheme()); ensureTitleScene(); resolve(res); };
      round = new Round(app, evCourse, 0, {
        mode: 'round', opponents, tips, ghosts, label: ev.name,
        onComplete: res => done(res),
        onExit: () => done(null),
      });
      if (params.has('noflyover')) round.endFlyover();
      window.__skyputt.round = round;
    }),
  });
  $('#t-career').onclick = () => { sfx.emit('click'); $('#title').hidden = true; career.open(); };

  // ---- events (M4)
  const now = () => nowFrom();
  const events = createEvents({
    store, now, click: () => sfx.emit('click'),
    onBack: () => showTitle(),
    playEvent: (ev, evCourse, { ledger, currency }) => new Promise(async resolve => {
      $('#title').hidden = true;
      await useTheme(ev.theme);
      titleView?.dispose(); titleView = null;
      const done = async res => { round = null; await useTheme(playerTheme()); ensureTitleScene(); resolve(res); };
      round = new Round(app, evCourse, 0, { mode: 'round', label: ev.name, ledger, currency, onComplete: done, onExit: () => done(null) });
      if (params.has('noflyover')) round.endFlyover();
      window.__skyputt.round = round;
    }),
  });
  $('#t-events').onclick = () => { sfx.emit('click'); $('#title').hidden = true; events.list(); };
  function renderEventTile() {
    const ev = featured(now()), st = status(ev, now());
    $('#t-events').innerHTML = `<span class="et-ic">${ev.currency.icon}</span><span class="et-main"><b>${ev.name}</b><small>${timeText(ev, now())}</small></span><span class="badge ${st}">${st === 'live' ? 'Live' : st}</span>`;
  }
  // ---- ladder + shop (M5)
  const metaScreens = createMetaScreens({
    store, meta, click: () => sfx.emit('click'), sfx: (n, p) => sfx.emit(n, p),
    onBack: () => showTitle(), playerName: () => store.story().name || 'You',
  });
  function renderMetaTiles() {
    const L = meta.ladder(), claim = meta.unclaimed().length, chests = store.data.chests.queue.length;
    $('#t-ladder').innerHTML = `${tierBadge(L.tier, 30)}<span class="tm"><b>${TIERS[L.tier].name}</b><small>${claim ? 'Reward ready!' : `${L.points} pts · ${weekCountdown(nowFrom())}`}</small></span>${claim ? '<i class="dotn">!</i>' : ''}`;
    $('#t-shop').innerHTML = `<span class="tm-ic">${ICONS.coin}</span><span class="tm"><b>Shop</b><small>${store.data.coins | 0} coins</small></span>${chests ? `<i class="dotn">${chests}</i>` : ''}`;
  }
  $('#t-ladder').onclick = () => { sfx.emit('click'); $('#title').hidden = true; metaScreens.ladder(); };
  $('#t-shop').onclick = () => { sfx.emit('click'); $('#title').hidden = true; metaScreens.shop(store.data.chests.queue.length ? 'chests' : 'balls'); };

  // ---- online rooms (M6, js/net/): the online module builds its own OnlineRound
  const online = createOnline({
    app, store, click: () => sfx.emit('click'), onBack: () => showTitle(),
    hooks: {
      enter: async themeId => { $('#title').hidden = true; await useTheme(themeId || playerTheme()); titleView?.dispose(); titleView = null; },
      leave: async () => { round = null; await useTheme(playerTheme()); ensureTitleScene(); },
      setRound: r => { round = r; window.__skyputt.round = r; if (r && params.has('noflyover')) r.endFlyover(); },
    },
  });
  $('#t-online').onclick = () => { sfx.emit('click'); $('#title').hidden = true; online.open(); };
  function renderOnlineTile() {
    const h = online.hint();
    $('#t-online').innerHTML = `Online<small>${h ? `Rejoin room ${h.code}` : 'Friends, public rooms, ghost AIs'}</small>`;
  }
  $('#t-play').onclick = () => { sfx.emit('click'); startRound(0, 'round', course.nines?.[0]?.to); };
  $('#t-map').onclick = () => { sfx.emit('click'); showCourseMap(); };
  $('#t-settings').innerHTML = ICONS.gear;
  $('#t-settings').onclick = () => { sfx.emit('click'); app.openSettings(() => {}); };

  window.__skyputt = { app, THREE, course, store, audio, startRound, showCourseMap, setTheme, career, events, meta, metaScreens, online, get round() { return round; }, set round(r) { round = r; }, themeId: app.themeId };

  const startHole = parseInt(params.get('hole'), 10);
  if (startHole >= 1 && startHole <= course.holes.length) startRound(startHole - 1, 'single'); else showTitle();
  if (params.get('room')) { $('#title').hidden = true; online.open({ join: params.get('room') }); }   // invite link

  // ---- frame loop
  let last = performance.now(), t = 0, fpsN = 0, fpsT = 0;
  window.__skyputt.fps = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    if (round) round.update(dt, t);
    else if (titleView) { rig.update(dt, null, { center: rig.orbitCenter }); titleView.update(dt, t, t, null); }
    renderer.render(scene, camera);
    fpsN++; fpsT += dt; if (fpsT >= 1) { window.__skyputt.fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  });

  window.__booted = true;
  $('#boot').classList.add('gone');
  setTimeout(() => $('#boot').remove(), 500);
}

// Fullscreen toggle where the API works (Android Chrome, desktop); hidden on iOS Safari (D13).
function setupFullscreen() {
  const btn = $('#fs-btn');
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!req || !enabled) { btn.hidden = true; return null; }
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => { btn.innerHTML = isFs() ? ICONS.exitfs : ICONS.fullscreen; btn.setAttribute('aria-label', isFs() ? 'Exit fullscreen' : 'Fullscreen'); };
  const toggle = async () => {
    try {
      if (isFs()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await req.call(el, { navigationUI: 'hide' });
    } catch { /* not allowed here */ }
  };
  btn.hidden = false;
  btn.onclick = toggle;
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
  return toggle;
}

boot().catch(e => {
  console.error('[skyputt] boot failed', e);
  window.__bootFail?.('Something went wrong: ' + (e && e.message || e));
});

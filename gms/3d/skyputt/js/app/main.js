// SKYPUTT app shell: renderer, theme loading (?theme=), title screen with hole select, the round,
// fullscreen, resize / orientation, and the frame loop.
//   URL params: ?theme=<id> (default sky, else greybox) · ?hole=<n> start a hole directly · ?q=low
import * as THREE from 'three';
import { COURSES } from '../course/holes/index.js';
import { buildHole } from '../course/builder.js';
import { buildHoleView } from '../game/holeview.js';
import { CameraRig } from '../game/camera.js';
import { Hud, ICONS } from '../game/hud.js';
import { Round } from '../game/play.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const quality = params.get('q') === 'low' ? 'low' : 'high';

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

  const { theme, fallback, id: themeId } = await loadTheme(params.get('theme') || 'sky', renderer);
  const course = COURSES.sky;
  const app = { renderer, scene, camera, rig, theme, fallback, quality, hud, canvas, themeId, fullscreen: null };

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
    const hole = buildHole(course.holes[0]);
    titleView = buildHoleView(scene, hole, theme, fallback, { renderer, camera, quality });
    const c = titleView.info.bounds.getCenter(new THREE.Vector3()), s = titleView.info.bounds.getSize(new THREE.Vector3());
    rig.mode = 'orbit'; rig.orbitT = 0.6;
    rig.orbitCenter = { x: c.x, y: c.y, z: c.z, r: Math.max(s.x, s.z) * 0.85 + 2 };
    $('#title').hidden = false;
  }
  function startRound(i) {
    $('#title').hidden = true;
    titleView?.dispose(); titleView = null;
    round = new Round(app, course, i, { onExit: showTitle });
    window.__skyputt.round = round;
  }
  const holesEl = $('#t-holes');
  holesEl.innerHTML = course.holes.map((h, i) => `<button data-i="${i}" aria-label="Hole ${i + 1}: ${h.name}"><b>${i + 1}</b><small>Par ${h.par}</small></button>`).join('');
  holesEl.onclick = e => { const b = e.target.closest('button'); if (b) startRound(+b.dataset.i); };
  $('#t-play').onclick = () => startRound(0);

  window.__skyputt = { app, THREE, course, startRound, get round() { return round; }, set round(r) { round = r; }, themeId };

  const startHole = parseInt(params.get('hole'), 10);
  if (startHole >= 1 && startHole <= course.holes.length) startRound(startHole - 1); else showTitle();

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

import * as THREE from 'three';
import * as ui from './ui/index.js';
import * as audio from './audio/index.js';
import { buildWorld } from './world/airport.js';
import { createPlane } from './plane/index.js';
import { params, createRenderer, pickQuality, createFpsGovernor, followSun, showFatal, isMobile } from './core/renderer.js';
import { Aircraft } from './flight/aircraft.js';
import { Autopilot } from './flight/autopilot.js';
import { Traffic, AXES } from './flight/traffic.js';
import { circuitRoute, runwayEnd, fromRunway } from './flight/routes.js';
import * as layout from './world/layout.js';
import { createMarkers } from './assist/markers.js';
import { planLandAhead, createLandButton, collectTrees } from './assist/landahead.js';
const { STANDS } = layout;
import { createControls } from './flight/controls.js';
import { createFlightCamera, fitFov } from './flight/cameras.js';
import { createHUD } from './flight/hud.js';
import { createGameHUD } from './hud/index.js';
import { createAttract } from './flight/attract.js';
import { V3, Quat, KT, FT, clamp } from './flight/vmath.js';
import { createWiring } from './core/wiring.js';
import { loadCareer, finishZone, DEFAULT_SPOT } from './game/index.js';
import { createFX } from './fx/index.js';
import { createStory } from './story/index.js';
import { saveSettings, hasProfile } from './ui/store.js';

const AUTO = params.get('auto') === '1';
const SHOT = params.get('shot') === '1';
const TIMESCALE = Math.min(8, Math.max(0.1, +params.get('timescale') || 1));
const S = { mode: 'boot', paused: false, view: 'chase', player: null, log: [], respawnT: 0, startT: 0 };
let R, scene, camera, world, env, traffic, attract, controls, hud, ghud, markers, land, fcam, sunFollow, gov, wiring, career, engine = null, fx = null, story = null, SET = null;
// settings are read every frame; ui.getSettings() parses localStorage, so keep a copy (refreshed in onSettings)
const settings = () => (SET ||= ui.getSettings());
const aiVoices = new Map(), errSeen = new Set();
const tmpP = new V3(), tmpQ = new Quat();

const log = (type, data = {}) => { S.log.push({ t: +(performance.now() / 1000).toFixed(1), ...data, type }); if (S.log.length > 200) S.log.shift(); };

const nextPaint = () => new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 150); });

async function boot() {
  try { career = loadCareer(); } catch (e) { career = undefined; }
  ui.initUI({ onPlay, onSettings, onProfile, onResume, onQuit, onSound: (k) => audio.playUI(k), career, onOnline });
  try { ui.setOnlineAvailable?.(!!params.get('net')); } catch (e) { /* */ }
  ui.setLoading(0.05, 'Warming up the engines');
  try { audio.initAudio(); audio.setVolumes(ui.getSettings()); } catch (e) { console.warn('audio', e); }
  const set0 = settings();
  const qpick = pickQuality(set0.quality);
  const quality = qpick.tier;
  // Scene content (trees, decals, plane detail) is built once: auto uses high on desktop, low on phones (D6 steps the renderer).
  const contentQ = isMobile() ? 'low' : qpick.auto ? 'high' : quality; // PERF #7: phones never build desktop content
  S.contentQ = contentQ;
  S.view = params.get('view') || set0.view || viewList()[0];
  if (SHOT) document.documentElement.classList.add('krz-shot');

  const canvas = document.getElementById('krz-canvas');
  R = createRenderer(canvas, quality, { antialias: !(params.get('lite') === '1' || set0.quality === 'low') });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.4, 24000);
  const overlay = document.getElementById('krz-overlay');
  R.onResize.push((w, h) => { camera.aspect = w / h; if (S.mode === 'play') fcam.fit(); else fitFov(camera, 70, 45, 85); });
  R.resize();

  ui.setLoading(0.15, 'Painting the runway');
  await nextPaint();
  world = await buildWorld(scene, R.renderer, { quality: contentQ, onProgress: (f, label) => ui.setLoading(0.15 + 0.35 * f, label) });
  env = { groundHeightAt: world.groundHeightAt, surfaceAt: world.surfaceAt, colliders: world.colliders || [] };
  try { world.trees = collectTrees(world); } catch (e) { console.warn('collectTrees', e); }
  if (world.setQuality) {
    const setQ = R.setQuality;
    R.setQuality = (q) => { setQ(q); try { world.setQuality(q); } catch (e) { console.warn('world.setQuality', e); } try { fx?.setQuality(q); } catch (e) { /* */ } };
    try { world.setQuality(R.quality); } catch (e) { /* */ }
  }
  try { fx = createFX({ scene, camera, renderer: R.renderer, quality: R.quality, world }); } catch (e) { console.warn('fx', e); fx = null; }
  traffic = new Traffic(env);
  ui.setLoading(0.5, 'Waking the tower');
  await nextPaint();
  const overlayEl = document.getElementById('krz-overlay');
  hud = createHUD(overlayEl);
  hud.setVisible(false);
  ghud = createGameHUD(overlayEl, { getSettings: ui.getSettings, coachForce: params.get('coach') === '1', onTarget: (t) => { S.oppTarget = t; }, onFinish: demandIt, onTakeoff: demandTakeoff, onSkip: skipToRunway,
    onReel: (on) => { S.reelOpen = on; }, onDifficulty: setDifficulty, onAircraft: setAircraft });
  wiring = createWiring({ ui, audio, world, traffic, hud, ghud, career, log });
  attract = createAttract({ scene, traffic, env, createPlane, quality: contentQ, max: params.get('lite') === '1' ? 3 : 4,
    onRig: (rig) => applyEnv(rig), onSpawn: (e) => { wiring.addAI(e); fx?.track(e.ac.id, { rig: e.rig, ac: e.ac }); }, onDespawn: (e) => { wiring.removeAI(e); fx?.untrack(e.ac.id); }, activeEnd: () => wiring.activeEnd(), types: ['c172', 'c172', 'tiger', 'bathtub'] });
  await attract.start();
  ui.setLoading(0.8, 'Briefing the pilots');
  await nextPaint();

  controls = createControls({
    root: overlay, getSettings: settings,
    onView: () => { const v = viewList(); setView(v[(v.indexOf(S.view) + 1) % v.length]); },
    onPause: pause,
    onFullscreen: toggleFullscreen,
  });
  if (!document.fullscreenEnabled) controls.el.querySelector('[data-act="fs"]').hidden = true;
  controls.setVisible(false);
  // ASSIST (D12 markers, D13 LAND): docs/ASSIST.md §1
  const st0 = ui.getSettings();
  markers = createMarkers({ container: overlay, camera, units: st0.units, traffic: st0.trafficMarkers !== false, getOrigin: () => S.player?.ac.pos ?? camera.position });
  land = createLandButton({ container: overlay, stickRight: st0.stickRight, onPress: onLandPress });
  markers.setVisible(false); land.setVisible(false);
  fcam = createFlightCamera(camera, env);
  sunFollow = world.setShadowFocus ? (p) => world.setShadowFocus(p.x, p.z, S.player ? R.tier.shadowBox : 160) : followSun(world.sun, R);
  gov = createFpsGovernor(R, { enabled: qpick.auto });
  fitFov(camera, 70, 45, 85);
  attract.updateCamera(0.016, camera);
  // PERF #5: parallel compile (KHR_parallel_shader_compile) and a repaint of the loading bar instead of one frozen task
  try { await Promise.race([R.renderer.compileAsync ? R.renderer.compileAsync(scene, camera) : R.renderer.compile(scene, camera), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* compile is an optimisation only */ }

  try {
    story = createStory({
      game: window.__game, scene, camera, env, createPlane, prepareRig: applyEnv,
      getProfile: ui.getProfile, getLivery: ui.getLivery || ui.getProfile, getSettings: settings,
      quality: S.contentQ, parent: document.body, isOnline: () => S.playMode === 'online', log: (t, d) => log(t, d),
    });
  } catch (e) { console.warn('story', e); story = null; }
  hookStoryMenu();

  S.mode = 'attract';
  let last = performance.now();
  R.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const c0 = performance.now();
    try { frame(dt); S.cpuMs = performance.now() - c0; } catch (e) {
      const k = String(e);
      if (!errSeen.has(k)) { errSeen.add(k); console.error(e); log('error', { msg: k }); }
    }
  });
  window.__krayzeeReady = true;
  ui.setLoading(1, 'Cleared for take-off');
  if (AUTO || params.get('start') === 'free') { ui.enterGameplay(); onPlay('free'); }
  else if (story && params.get('mission')) { ui.enterGameplay(); startMission(+params.get('mission') || 1); }
  else if (story && (params.get('intro') === '1' || firstLaunch())) { ui.enterGameplay(); story.playIntro({ onDone: () => ui.showMenu() }); }
  else ui.showMenu();
}

export function applyEnv(rig) {
  if (!world?.envMap) return;
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) if (m && 'envMap' in m && !m.envMap && m.isMeshStandardMaterial) { m.envMap = world.envMap; m.needsUpdate = true; }
  });
}

// ---------------- play ----------------
async function onPlay(mode) {
  if (S.player || S.starting) return;
  S.starting = true;
  S.playMode = mode;
  try {
    const livery = ui.getLivery ? ui.getLivery() : ui.getProfile();
    const type = aircraftType();
    const rig = await createPlane({ type, livery, quality: S.contentQ === 'low' ? 'low' : 'high', cockpit: true, pilot: { gender: ui.getProfile().gender }, view: S.view });
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    applyEnv(rig);
    rig.setLivery?.(livery);
    scene.add(rig.root);
    const ac = new Aircraft({ id: 'player', type, dims: rig.dims });
    S.type = type;
    const ap = new Autopilot(ac);
    S.player = traffic.add({ aircraft: ac, ap, rig, player: true, name: livery.registration || 'PLAYER' });
    S.mode = 'play'; S.playMode = mode;
    placePlayer(S.lastStop);
    wiring.startPlay(mode, S.player);
    attachGame();
    S.everAir = false; S.reelT = 0;
    fx?.track('player', { rig, ac, player: true });
    story?.showWarp(mode !== 'online');
    controls.setVisible(!SHOT && !AUTO); hud.setVisible(!SHOT); ghud.setVisible(!SHOT);
    S.playT = 0; S.landT = 0; S.mkSig = '';
    markers.setVisible(!SHOT); land.setState('idle');
    showSpot(wiring.difficulty === 'hard');
    setView(S.view);
    try { engine?.dispose(); engine = audio.createEngineVoice({ gain: 1, priority: 1 }); } catch (e) { engine = null; }
    log('play', { mode });
  } finally { S.starting = false; }
}

// Per-game hooks (a new game object every play and on a difficulty change): FX celebrations, the D24 headline reel.
function attachGame() {
  const g = wiring.game;
  if (!g) return;
  if (fx) for (const k of ['combo', 'rankUp', 'protection']) g.on(k, (d) => { try { fx.onGameEvent(k, d, 'player'); } catch (e) { /* */ } });
  const later = () => { S.reelT = 1.6; };
  g.on('finished', later);
  g.on('banked', () => { if (S.player?.ac.onGround && S.everAir) later(); });
}
// Free Flight aircraft (TRAFFIC r3): C172, Tiger Moth, Royal Flying Bathtub. ?plane= wins, then settings.aircraft.
const FLYABLE = ['c172', 'tiger', 'bathtub'];
function aircraftType() {
  const q = params.get('plane');
  if (FLYABLE.includes(q)) return q;
  return S.playMode !== 'story' && FLYABLE.includes(settings().aircraft) ? settings().aircraft : 'c172';
}
async function setAircraft(t) {
  if (!FLYABLE.includes(t) || !S.player || S.playMode !== 'free' || S.everAir || t === S.type) return;
  SET = saveSettings({ ...settings(), aircraft: t });
  const mode = S.playMode;
  quitPlay();
  await onPlay(mode);
}
// D19: Free Flight difficulty, chosen on the ground before the first take-off (chips) or in Settings.
function setDifficulty(d, fromSettings = false) {
  const P = S.player;
  if (!fromSettings) { SET = saveSettings({ ...settings(), difficulty: d }); }
  if (!P || S.playMode !== 'free') return;
  const g = wiring.game?.state?.();
  if (S.everAir || (g && g.pending > 0)) { if (!fromSettings) hud.flash('DIFFICULTY APPLIES FROM YOUR NEXT FLIGHT', 'info'); return; }
  wiring.endPlay();
  wiring.startPlay(S.playMode, P);
  attachGame();
  showSpot(wiring.difficulty === 'hard');
  hud.flash(`${wiring.difficulty.toUpperCase()} · ${{ easy: 'FINISH NEAR ANY RUNWAY', medium: 'FINISH ON A RUNWAY OR THE APRON', hard: 'FINISH AT THE TERMINAL' }[wiring.difficulty]}`, 'info');
}
// Online (docs/ONLINE.md §15, docs/UI.md): live only with ?net= until the server is deployed. Flight sync (sendPlane/applyRemote)
// is not wired yet: a started room drops you into an 'online' session (no warp) — remote planes are the next step.
let net = null, lobby = null;
async function onOnline() {
  try {
    if (!lobby) {
      const [{ createNet }, { createLobby }] = await Promise.all([import('./net/index.js'), import('./net/lobby.js')]);
      net = createNet({ profile: () => ui.getProfile(), getToken: null });
      lobby = createLobby({ net, profile: () => ui.getProfile(), onStart: () => { lobby.show(false); ui.enterGameplay(); onPlay('online'); }, onClose: () => ui.showMenu() });
    }
    lobby.show(true);
  } catch (e) { console.warn('online', e); ui.toast?.('Online rooms', 'The radio mast is down. Try again later.'); ui.showMenu(); }
}
// D18 warp chip: under the tower badge in portrait, beside it in landscape (STORY's default mid-right sat on the action slot).
function placeWarp() {
  const w = story?.toggle?.el, t = document.querySelector('.krz-r-tower');
  if (!w || w.hidden || !t) return;
  const r = t.getBoundingClientRect();
  if (!r.width) return;
  const port = innerHeight > innerWidth;
  const top = port ? r.bottom + 10 : r.top, right = port ? innerWidth - r.right : innerWidth - r.left + 8;
  w.style.top = `${Math.round(top)}px`; w.style.right = `${Math.round(right)}px`; w.style.transform = 'none';
}
// STORY (docs/STORY.md): the menu's Story button, ?mission=N, ?intro=1.
function startMission(id = 1) {
  return onPlay('story').then(() => {
    if (!story || !S.player) return;
    story.startMission(id, {
      difficulty: settings().difficulty || 'easy',
      setTarget: (t) => { S.missionTarget = t; },
      onFail: () => { S.reelT = 0.4; },
      onExit: () => { story.endMission(); quitPlay(); ui.showMenu(); },
    });
  });
}
// D16: the intro plays by itself on the very first launch (no pilot yet, never seen); ?intro=0 and headless runs skip it.
function firstLaunch() {
  try { return params.get('intro') !== '0' && !/HeadlessChrome/.test(navigator.userAgent) && !hasProfile() && !story.introSeen(); } catch (e) { return false; }
}
function watchIntro() {
  if (!story || S.player || S.starting || story.intro) return;
  ui.enterGameplay();
  story.playIntro({ onDone: () => ui.showMenu() });
}
function hookStoryMenu() {
  if (!story) return;
  const bind = () => {
    const b = document.querySelector('.kz-btn[data-a="story"]');
    if (!b || b.dataset.krzStory) return !!b;
    b.dataset.krzStory = '1';
    const w = document.createElement('button');
    w.type = 'button'; w.className = 'krz-intro-link'; w.textContent = '▶ Watch the intro';
    w.addEventListener('click', (e) => { e.stopPropagation(); watchIntro(); });
    b.closest('.kz-grid')?.after(w);
    b.classList.remove('soon');
    b.querySelector('.kz-soon')?.remove();
    // capture phase: the menu's own handler would show its "coming soon" toast
    const go = (e) => {
      e.stopImmediatePropagation(); e.preventDefault();
      if (S.player || S.starting || story.intro) return;
      try { audio.playUI?.('confirm'); } catch (er) { /* */ }
      ui.enterGameplay();
      if (!story.introSeen()) story.playIntro({ onDone: () => startMission(1) });
      else startMission(1);
    };
    b.addEventListener('click', go, true); // click only: preventDefault on touchend would swallow the click itself
    return true;
  };
  if (!bind()) { const mo = new MutationObserver(() => { if (bind()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); }
}

function placePlayer(from = null) {
  const E = wiring.activeEnd();
  const e = runwayEnd(E);
  const [x, z] = from ? [from.x, from.z] : fromRunway(e, 12, 0);
  attract.clearAround(x, z, 160);
  for (const a of attract.ai) {
    const l = a.ap.leg;
    if (l?.kind === 'takeoff' && a.ap.sub !== 'climb' && a.ap.sub !== 'taxi') attract.despawn(a);
  }
  const ent = S.player;
  ent.ac.place({ x, z, heading: from ? from.heading : e.hdg }, env);
  ent.ap.setRoute(circuitRoute(E, { type: S.type || 'c172' }));
  fx?.reset('player');
  for (const k of AXES) { ent.axis[k].mode = 'auto'; ent.manual[k] = null; }
  controls.release();
  try { wiring.link?.placed(ent, 8); } catch (e) { /* */ }
  attract.seedRivals?.().catch?.(() => {});
  S.respawnT = 0;
}

function quitPlay() {
  if (!S.player) return;
  if (story?.mission) story.endMission(); else story?.showWarp(false);
  fx?.untrack('player');
  S.missionTarget = null; S.reelT = 0;
  traffic.remove(S.player);
  S.player.rig.dispose();
  S.player = null;
  wiring.endPlay();
  engine?.dispose(); engine = null;
  controls.setVisible(false); hud.setVisible(false); ghud.setVisible(false); showSpot(false);
  markers.setVisible(false); land.setVisible(false);
  S.mode = 'attract'; S.paused = false;
  fitFov(camera, 70, 45, 85);
}

const VIEWS = ['chase', 'center', 'cockpit'];
function viewList() {
  const v = (settings().views || VIEWS).filter((x) => VIEWS.includes(x));
  return v.length ? v : VIEWS;
}
function setView(v) {
  S.view = VIEWS.includes(v) ? v : 'chase';
  if (S.player) S.player.rig.setView(S.view);
  fcam?.setView(S.view);
  fx?.setView(S.view);
  if (S.mode !== 'play') fitFov(camera, 70, 45, 85);
}

function pause() {
  if (S.mode !== 'play') return;
  S.paused = true;
  try { audio.setVolumes({ ...ui.getSettings(), sfx: 0 }); } catch (e) { /* */ }
  // The radio freezes with the game (its queue only advances in wiring.update) and goes quiet and out of sight.
  try { audio.stopRadio?.(); } catch (e) { /* */ }
  wiring.radio?.setVisible(false);
  ui.openSettings();
}
function onResume() {
  S.paused = false;
  try { audio.setVolumes(ui.getSettings()); } catch (e) { /* */ }
  if (S.player) wiring.radio?.setVisible(true);
}
function onQuit() { quitPlay(); try { audio.setVolumes(ui.getSettings()); } catch (e) { /* */ } }
function onSettings(s) {
  wiring?.setMischief?.(s);
  const prevDiff = settings().difficulty;
  SET = null;
  if (S.player && s.difficulty && s.difficulty !== prevDiff) setDifficulty(s.difficulty, true);
  markers?.setOptions({ units: s.units, traffic: s.trafficMarkers !== false });
  land?.setSide(!!s.stickRight);
  if (s.view && s.view !== S.view && !params.get('view')) setView(s.view);
  const q = pickQuality(s.quality);
  gov.setAuto(q.auto);
  if (!q.auto && q.tier !== R.quality) R.setQuality(q.tier);
  if (!S.paused) try { audio.setVolumes(s); } catch (e) { /* */ }
}
function onProfile() {
  if (S.player && ui.getLivery) { S.player.rig.setLivery(ui.getLivery()); S.player.rig.setPilot?.({ gender: ui.getProfile().gender }); }
  wiring?.refreshProfile();
}

function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement) d.exitFullscreen?.().catch(() => {});
  else d.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

// ---------------- frame ----------------
function modesOf(ent) { return Object.fromEntries(AXES.map((k) => [k, ent.axis[k].mode])); }

function frame(dt) {
  const P = S.player;
  if (P && !S.paused) {
    const m = controls.update(dt, P.ac);
    if (AUTO && !controls.state.inject) for (const k of AXES) m[k] = null;
    Object.assign(P.manual, m);
  }
  let k = TIMESCALE;
  try { if (story) k *= story.simScale(S.paused || !!S.reelOpen); } catch (e) { /* warp is optional */ }
  S.simK = k;
  const alpha = S.paused ? traffic.acc / traffic.h : traffic.update(dt * k);
  if (!S.paused) { attract.update(dt * k); wiring.update(dt * k, P); }
  traffic.sync(alpha, S.paused ? 0 : dt, tmpP, tmpQ);
  for (const e of traffic.list) e.rig?.root.updateMatrixWorld();

  if (P) {
    fcam.update(dt, P.rig, P.ac, controls.look);
    handleEvents(P, dt);
    const status = P.ap.status();
    const modes = modesOf(P);
    hud.update(dt, P.ac, status, traffic.modeOf(P), modes, settings().units);
    controls.paint(P.ac, modes, S.view, viewList().length > 1);
    updateGameHUD(dt, P, modes);
  } else if (!story?.cameraOwned) attract.updateCamera(dt, camera);
  for (const e of traffic.list) if (!e.player) {
    if (fx) for (const ev of e.ac.events) try { fx.onAircraftEvent(e.ac.id, ev); } catch (er) { /* */ }
    e.ac.events.length = 0; e.ap?.events.splice(0);
  }
  try { fx?.update(S.paused ? 0 : dt * (S.simK || 1)); } catch (e) { /* effects never break the frame */ }
  try { story?.update(dt); } catch (e) { /* */ }
  if (net) try { net.tick(performance.now(), { ready: gov.fps > 40, parked: !P || (P.ac.onGround && P.ac.gs < 1) }); } catch (e) { /* */ }

  world.update?.(dt, camera);
  const focus = P ? P.rig.root.position : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(60));
  sunFollow(focus);
  updateAudio(dt);
  R.renderer.render(scene, camera);
  if (P) updateMarkers(P);
  gov.tick(dt, S.cpuMs || 0);
}

const _fwd = new THREE.Vector3();
const fmtPP = (n) => Math.round(n).toLocaleString('en-GB');
// D19: LANDED — DEMAND IT. Visible once landed and nearly stopped; greyed with a one-line reason outside the allowed area.
function finishZoneNow(P) {
  const ac = P.ac;
  return finishZone(wiring.difficulty, { x: ac.pos.x, z: ac.pos.z, surface: ac.surface }, DEFAULT_SPOT);
}
function updateFinish(P, g) {
  if (!g || !g.finishReady || P.ac.crashed || AUTO) { ghud.finish.set('hidden'); return; }
  const z = finishZoneNow(P);
  ghud.finish.set(z.ok ? 'ready' : 'greyed', z.ok ? (g.pending > 0 ? `Bank ${fmtPP(g.pending)} PP and finish` : 'Finish the flight') : z.reason);
}
function demandIt() {
  const P = S.player, g = wiring.game;
  if (!P || !g) return;
  const atStand = STANDS.some((s) => Math.hypot(P.ac.pos.x - s.position[0], P.ac.pos.z - s.position[2]) < 12);
  const r = g.demand(finishZoneNow(P), { atStand });
  log('demand', r);
  if (r.ok) {
    ghud.finish.set('hidden');
    try { P.ac.refuel?.(); } catch (e) { console.warn('refuel', e); }
    // D22: the next flight starts where this one stopped
    S.lastStop = { x: P.ac.pos.x, z: P.ac.pos.z, heading: P.ac.heading };
  }
}
// ---- ASSIST: LAND button (D13) ----
function planNow() {
  const ac = S.player.ac;
  return planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: ac.onGround,
    world, layout, avoid: traffic.list.filter((e) => e.ac !== ac && e.ac.onGround).map((e) => [e.ac.pos.x, e.ac.pos.z, 20]) });
}
function onLandPress(state) {
  const P = S.player; if (!P) return;
  if (state === 'active') return cancelLand();
  if (!P.ap.landAt) return land.setState('unavailable', 'AUTOPILOT NOT READY');
  let plan;
  try { plan = planNow(); } catch (e) { console.warn('planLandAhead', e); return land.setState('unavailable', 'NO FIELD AHEAD'); }
  if (plan.fail) return land.setState('unavailable', plan.hint);
  P.ap.landAt(plan);
  land.setState('active', plan.label);
  hud.flash(`LANDING · ${plan.label}`, 'info');
  log('landAt', { label: plan.label, kind: plan.kind });
}
function cancelLand() { try { S.player?.ap.cancelLand?.(); } catch (e) { /* */ } land.setState('idle'); }
function updateLand(dt, P) {
  const air = !P.ac.onGround && !P.ac.crashed;
  land.setVisible(!SHOT && !AUTO && (air || land.state === 'active'));
  if (land.state === 'active') {
    if (traffic.modeOf(P) === 'MANUAL') cancelLand();
    else if (P.ac.onGround && P.ac.gs < 2) land.setState('idle');
    return;
  }
  if (!air || (S.landT -= dt) > 0) return;
  S.landT = 2;
  try { const p = planNow(); land.setState(p.fail ? 'unavailable' : 'idle', p.fail ? p.hint : ''); } catch (e) { land.setState('unavailable', ''); }
}
// ---- ASSIST: markers (D12); the target is the live opportunity, else Hard's finishing spot, else the active runway ----
const mkTarget = { id: 'target', kind: 'target', label: '', worldPos: [0, 0, 0] };
function updateMarkers(P) {
  let t = S.oppTarget, label, pos;
  const mt = S.missionTarget;
  if (mt?.pos) { label = mt.label || 'TARGET'; pos = mt.pos; }
  else if (t) { label = t.label; pos = t.worldPos; }
  else if (wiring.difficulty === 'hard') { label = 'FINISH HERE'; pos = [DEFAULT_SPOT.x, 2, DEFAULT_SPOT.z]; }
  else { const e = runwayEnd(wiring.activeEnd()), pend = wiring.atc?.pendingRunway; label = pend && pend !== e.id ? `RWY ${e.id} → ${pend} SOON` : `RWY ${e.id}`; pos = [e.thr[0], 2, e.thr[1]]; }
  const sig = traffic.list.length + '|' + traffic.list.map((e) => e.ac.id).join(',');
  if (sig !== S.mkSig) {
    S.mkSig = sig;
    markers.set([
      ...traffic.list.filter((e) => e !== P).map((e) => (e.marker ??= { id: e.ac.id || wiring.idOf(e), kind: e.rival ? 'rival' : e.remote ? 'player' : 'traffic',
        label: wiring.nameOf(wiring.idOf(e)), color: e.rig?.livery?.().primary, worldPos: [0, 0, 0] })),
      mkTarget,
    ]);
  }
  mkTarget.label = label; mkTarget.worldPos[0] = pos[0]; mkTarget.worldPos[1] = pos[1]; mkTarget.worldPos[2] = pos[2];
  for (const e of traffic.list) if (e.marker) { const p = e.ac.pos; e.marker.worldPos[0] = p.x; e.marker.worldPos[1] = p.y + 1.5; e.marker.worldPos[2] = p.z; }
  markers.setVisible(!SHOT && !S.paused);
  markers.update();
}
// D21 / D22: TRAFFIC's autopilot calls (guarded until they exist)
function demandTakeoff() {
  const P = S.player; if (!P?.ap?.demandTakeoff) return;
  try { if (!(wiring.link?.demandTakeoff ? wiring.link.demandTakeoff(P) : P.ap.demandTakeoff())) { hud.flash('NO RUNWAY OPEN FOR YOUR GRACE', 'warn'); return; } } catch (e) { console.warn('demandTakeoff', e); return; }
  log('demandTakeoff', {});
  ghud.score.announce('BY ROYAL PREROGATIVE', 'Taking off. The queue may watch.');
}
function skipToRunway() {
  const P = S.player; if (!P) return;
  if (!P.ap?.skipToRunway) return;
  try { wiring.link?.skipToRunway ? wiring.link.skipToRunway(P) : P.ap.skipToRunway(wiring.activeEnd()); } catch (e) { console.warn('skipToRunway', e); return; }
  log('skipToRunway', {});
}
function updateGround(P, g) {
  const ac = P.ac, ap = P.ap, gsKt = ac.gs / KT;
  const onG = ac.onGround && !ac.crashed && !AUTO;
  const rolling = ap?.leg?.kind === 'takeoff' && (ap.sub === 'roll' || ap.sub === 'rotate' || gsKt > 30);
  const taxiing = ['taxi', 'hold', 'park'].includes(ap?.leg?.kind) || (ap?.leg?.kind === 'takeoff' && ap.sub === 'taxi');
  if (!ac.onGround) S.everAir = true;
  ghud.ground.set({
    takeoff: onG && !!ap?.demandTakeoff && !rolling && gsKt < 25 && !g?.finishReady,
    skip: onG && !!ap?.skipToRunway && taxiing && !rolling,
    difficulty: onG && S.playMode === 'free' && !S.everAir && !(g?.pending > 0) ? wiring.difficulty || 'easy' : null,
    aircraft: onG && S.playMode === 'free' && !S.everAir && !(g?.pending > 0) && !params.get('plane') ? S.type || 'c172' : null,
  });
}
// Hard: the designated finishing spot gets a ground ring + beacon (and ASSIST's target marker once wired).
let spotMark = null;
function showSpot(on) {
  if (on && !spotMark) {
    spotMark = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(DEFAULT_SPOT.r - 2.2, DEFAULT_SPOT.r, 64), new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; ring.renderOrder = 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 30;
    spotMark.add(ring, beam);
    spotMark.position.set(DEFAULT_SPOT.x, world.groundHeightAt(DEFAULT_SPOT.x, DEFAULT_SPOT.z), DEFAULT_SPOT.z);
    scene.add(spotMark);
  }
  if (spotMark) spotMark.visible = !!on;
}
function updateGameHUD(dt, P, modes) {
  const ac = P.ac;
  ghud.score.update(dt, { airborne: !ac.onGround, gsKt: ac.gs / KT });
  if (S.paused) return;
  S.playT += dt;
  const radioOpen = !!document.querySelector('.krz-r-panel:not([hidden])');
  const blocked = AUTO || SHOT || radioOpen || ['goal', 'stick'].includes(ghud.coach.active);
  camera.getWorldDirection(_fwd);
  const camHeading = (Math.atan2(_fwd.x, -_fwd.z) * 180 / Math.PI + 360) % 360;
  ghud.prompts.update(dt, {
    atc: wiring.atc, traffic, player: P, ac, end: wiring.activeEnd(), idOf: wiring.idOf, entOf: wiring.entOf, nameOf: wiring.nameOf,
    camera, camHeading, blocked: blocked || ghud.score.state.ceremony,
  });
  const g = wiring.game?.state?.();
  if ((S.warpT = (S.warpT || 0) - dt) <= 0) { S.warpT = 0.5; placeWarp(); }
  ghud.actions.hidden = !!S.reelOpen;
  if (S.reelT > 0 && (S.reelT -= dt) <= 0) { if (ghud.score.state.ceremony) S.reelT = 0.5; else ghud.headlines.reel(); }
  updateFinish(P, g);
  updateGround(P, g);
  updateLand(dt, P);
  ghud.coach.update(dt, {
    t: S.playT, manual: modes.elevator === 'manual' || modes.aileron === 'manual', mode: traffic.modeOf(P),
    pending: g?.pending || 0, barked: wiring.barked, banked: wiring.banked, blocked: AUTO || SHOT || radioOpen,
    stable: ac.onGround || (Math.abs(ac.bank) < 0.6 && Math.abs(ac.vs) < 6 && ac.agl > 40),
  });
}

// ATC/AP reason codes → words (PLAYTEST_1: raw "CROSSINGTRAFFIC" reached the HUD).
const REASONS = { spacing: 'too close behind traffic', runwayoccupied: 'runway occupied', traffic: 'traffic ahead', crossingtraffic: 'traffic on the crossing runway',
  runwayclosed: 'runway closed', notlinedup: 'not lined up', toohigh: 'too high', overshot: 'overshot', occupied: 'runway occupied', unstable: 'unstable approach' };
export function friendlyReason(r) {
  const raw = String(r || '').replace(/^ATC:\s*/i, '');
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  const w = REASONS[k] || raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return w.toUpperCase();
}

function handleEvents(P, dt) {
  const ac = P.ac;
  for (const ev of ac.events.splice(0)) {
    log(ev.type, ev);
    try { fx?.onAircraftEvent('player', ev); } catch (e) { /* */ }
    if (ev.type === 'fuelempty') hud.flash('OUT OF FUEL · GLIDE IT IN, YOUR GRACE', 'bad', 4);
    if (ev.type === 'touchdown') {
      try { audio.playTouchdown(clamp(ev.fpm / 900, 0.15, 1)); } catch (e) { /* */ }
      hud.flash(`${ev.grade.toUpperCase()} ${ev.bounce ? 'BOUNCE' : 'LANDING'} · ${ev.fpm} FPM${ev.surface !== 'runway' ? ' · ON THE ' + ev.surface.toUpperCase() : ''}`, ev.grade === 'hard' ? 'warn' : 'good');
      if (ev.grade === 'hard') fcam.kick(1);
    } else if (ev.type === 'crash') {
      try { audio.playCrash(1); } catch (e) { /* */ }
      fcam.kick(2.5);
      hud.flash(`CRASHED · ${ev.reason.toUpperCase()}`, 'bad', 3.5);
      S.respawnT = wiring.lastImpact?.gagSecs ?? 3.5;
    } else if (ev.type === 'tailstrike') hud.flash('TAIL STRIKE!', 'warn');
    else if (ev.type === 'impact' && ev.result === 'bounce') { fcam.kick(1.2); hud.flash('BOING!', 'warn', 1.2); }
    else if (ev.type === 'impact') fcam.kick(1.5);
  }
  for (const ev of P.ap.events.splice(0)) {
    log('ap.' + ev.type, ev);
    if (ev.type === 'goaround') hud.flash(`GO AROUND · ${friendlyReason(ev.reason)}`, 'warn');
    else if (ev.type === 'replan' && ev.to === 'approach') hud.flash(`AUTOPILOT · LANDING RUNWAY ${ev.end}`, 'info');
    else if (ev.type === 'recovery') hud.flash('AUTOPILOT · RECOVERING', 'warn');
  }
  if (ac.crashed && S.respawnT > 0 && (S.respawnT -= dt) <= 0) { placePlayer(); try { wiring.game?.respawn(); } catch (e) { /* */ } }
}

const _af = new THREE.Vector3(), _au = new THREE.Vector3(), ZERO = { x: 0, y: 0, z: 0 };
function updateAudio(dt) {
  try {
    if (!audio.isUnlocked?.()) return; // PERF #6: nothing to update until the context runs
    const fwd = camera.getWorldDirection(_af);
    const up = _au.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const P = S.player;
    audio.setListener({ position: camera.position, velocity: P ? P.ac.vel : ZERO, forward: fwd, up });
    const interior = S.view !== 'chase' && !!P;
    if (P && engine) {
      const ac = P.ac;
      engine.setRPM(ac.crashed ? 0 : ac.instruments().rpm, ac.eng);
      engine.setInterior(interior);
      engine.update(null, null, P.rig.root.position, ac.vel);
      audio.setWind(S.paused ? 0 : ac.speed / KT, { interior });
      const vs = P.ap._vstall();
      // D25: off by default; when on, only right at the stall (soft hum, see audio)
      audio.setStallHorn(settings().stallHorn && !ac.onGround && !S.paused && ac.agl > 3 ? clamp((vs * 1.03 + 3 * KT - ac.speed) / (3 * KT), 0, 1) : 0);
      audio.setRolling(ac.onGround && !S.paused ? ac.gs : 0, ac.surface, { interior });
      audio.setFlapsMotor(Math.abs(ac.flapsPos - ac.ctl.flaps) > 0.01);
    } else { audio.setWind(0); audio.setStallHorn(0); audio.setRolling(0, 'runway'); audio.setFlapsMotor(false); }
    for (const e of traffic.list) {
      if (e.player) continue;
      let v = aiVoices.get(e);
      if (!v) { v = audio.createEngineVoice({ gain: 0.8 }); if (!v) continue; aiVoices.set(e, v); }
      v.setRPM(e.ac.crashed ? 0 : e.ac.instruments().rpm, e.ac.eng);
      v.update(null, null, e.rig.root.position, e.ac.vel);
    }
    for (const [e, v] of aiVoices) if (!traffic.list.includes(e)) { v.dispose(); aiVoices.delete(e); }
  } catch (e) { /* audio must never break the frame */ }
}

// ---------------- test hooks ----------------
const summary = (e) => {
  const ac = e.ac;
  return {
    id: ac.id, name: e.name, player: e.player, x: +ac.pos.x.toFixed(1), z: +ac.pos.z.toFixed(1), alt: +ac.alt.toFixed(1), agl: +ac.agl.toFixed(1),
    speedKt: +(ac.speed / KT).toFixed(1), heading: +ac.heading.toFixed(1), pitch: +(ac.pitch * 57.3).toFixed(1), bank: +(ac.bank * 57.3).toFixed(1),
    vsFpm: Math.round(ac.vs / FT * 60), onGround: ac.onGround, crashed: ac.crashed, crashReason: ac.crashReason, surface: ac.surface,
    phase: e.ap?.phase, leg: e.ap?.leg?.kind, sub: e.ap?.sub, legIndex: e.ap?.i, apMode: traffic.modeOf(e), modes: modesOf(e), ctl: { ...ac.ctl },
    lastTouchdown: ac.lastTouchdown,
  };
};
window.__game = {
  get S() { return S; },
  state: () => ({
    mode: S.mode, paused: S.paused, view: S.view, quality: R?.quality, fps: gov ? +gov.fps.toFixed(1) : 0, shot: attract?.shot,
    activeEnd: wiring?.activeEnd(), game: wiring?.state(), player: S.player ? summary(S.player) : null, ai: traffic ? traffic.list.filter((e) => !e.player).map(summary) : [],
  }),
  setControls: (c, ms = 1000) => controls.inject(c, ms),
  release: () => controls.release(),
  teleport(o) {
    const P = S.player; if (!P) return false;
    P.ac.place({ x: o.x, z: o.z, alt: o.alt, heading: o.heading ?? 90, speed: (o.speedKt ?? 0) * KT, throttle: o.throttle, flaps: o.flaps }, env);
    P.ap.replan();
    try { wiring.link?.placed(P, 8); } catch (e) { /* */ }
    return true;
  },
  setView, start: (m = 'free') => { ui.enterGameplay(); return onPlay(m); }, quit: () => { quitPlay(); ui.showMenu(); },
  phase: () => S.player?.ap.phase,
  get aircraft() { return traffic ? traffic.list.map(summary) : []; },
  log: () => S.log.slice(),
  controlsRects: () => {
    const r = controls.rects();
    const o = {};
    for (const k in r) if (r[k] && k !== 'brake') o[k] = { x: r[k].x, y: r[k].y, w: r[k].width, h: r[k].height };
    return o;
  },
  get traffic() { return traffic; }, get renderer() { return R; }, get camera() { return camera; },
  get hud() { return ghud && { score: ghud.score.state, prompts: ghud.prompts.state, coach: ghud.coach.state, target: S.oppTarget || null }; },
  get wiring() { return wiring; }, get ghud() { return ghud; },
  get quality() { return { tier: R?.quality, auto: gov?.auto, fps: gov ? +gov.fps.toFixed(1) : 0, history: gov?.history || [] }; },
};

boot().catch((e) => {
  console.error(e);
  showFatal('The airfield failed to open', String(e && e.message || e));
});

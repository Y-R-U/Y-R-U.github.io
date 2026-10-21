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
import { createControls } from './flight/controls.js';
import { createFlightCamera, fitFov } from './flight/cameras.js';
import { createHUD } from './flight/hud.js';
import { createAttract } from './flight/attract.js';
import { V3, Quat, KT, FT, clamp } from './flight/vmath.js';
import { createWiring } from './core/wiring.js';
import { loadCareer } from './game/index.js';

const AUTO = params.get('auto') === '1';
const SHOT = params.get('shot') === '1';
const TIMESCALE = Math.min(8, Math.max(0.1, +params.get('timescale') || 1));
const S = { mode: 'boot', paused: false, view: 'chase', player: null, log: [], respawnT: 0, startT: 0 };
let R, scene, camera, world, env, traffic, attract, controls, hud, fcam, sunFollow, gov, wiring, career, engine = null;
const aiVoices = new Map(), errSeen = new Set();
const tmpP = new V3(), tmpQ = new Quat();

const log = (type, data = {}) => { S.log.push({ t: +(performance.now() / 1000).toFixed(1), ...data, type }); if (S.log.length > 200) S.log.shift(); };

async function boot() {
  try { career = loadCareer(); } catch (e) { career = undefined; }
  ui.initUI({ onPlay, onSettings, onProfile, onResume, onQuit, onSound: (k) => audio.playUI(k), career });
  ui.setLoading(0.05, 'Warming up the engines');
  try { audio.initAudio(); audio.setVolumes(ui.getSettings()); } catch (e) { console.warn('audio', e); }
  const settings = ui.getSettings();
  const qpick = pickQuality(settings.quality);
  const quality = qpick.tier;
  // Scene content (trees, decals, plane detail) is built once: auto uses high on desktop, low on phones (D6 steps the renderer).
  const contentQ = qpick.auto ? (isMobile() ? 'low' : 'high') : quality;
  S.contentQ = contentQ;
  S.view = params.get('view') || settings.view || viewList()[0];
  if (SHOT) document.documentElement.classList.add('krz-shot');

  const canvas = document.getElementById('krz-canvas');
  R = createRenderer(canvas, quality, { antialias: !(params.get('lite') === '1' || settings.quality === 'low') });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.4, 24000);
  const overlay = document.getElementById('krz-overlay');
  R.onResize.push((w, h) => { camera.aspect = w / h; if (S.mode === 'play') fcam.fit(); else fitFov(camera, 70, 45, 85); });
  R.resize();

  ui.setLoading(0.15, 'Painting the runway');
  world = await buildWorld(scene, R.renderer, { quality: contentQ });
  env = { groundHeightAt: world.groundHeightAt, surfaceAt: world.surfaceAt, colliders: world.colliders || [] };
  traffic = new Traffic(env);
  ui.setLoading(0.5, 'Waking the tower');
  const overlayEl = document.getElementById('krz-overlay');
  hud = createHUD(overlayEl);
  hud.setVisible(false);
  wiring = createWiring({ ui, audio, world, traffic, hud, career, log });
  attract = createAttract({ scene, traffic, env, createPlane, quality: contentQ, max: params.get('lite') === '1' ? 3 : 4,
    onRig: (rig) => applyEnv(rig), onSpawn: (e) => wiring.addAI(e), onDespawn: (e) => wiring.removeAI(e), activeEnd: () => wiring.activeEnd() });
  await attract.start();
  ui.setLoading(0.8, 'Briefing the pilots');

  controls = createControls({
    root: overlay, getSettings: ui.getSettings,
    onView: () => { const v = viewList(); setView(v[(v.indexOf(S.view) + 1) % v.length]); },
    onPause: pause,
    onFullscreen: toggleFullscreen,
  });
  if (!document.fullscreenEnabled) controls.el.querySelector('[data-act="fs"]').hidden = true;
  controls.setVisible(false);
  fcam = createFlightCamera(camera, env);
  sunFollow = world.setShadowFocus ? (p) => world.setShadowFocus(p.x, p.z, S.player ? R.tier.shadowBox : 160) : followSun(world.sun, R);
  gov = createFpsGovernor(R, { enabled: qpick.auto });
  fitFov(camera, 70, 45, 85);
  attract.updateCamera(0.016, camera);
  try { R.renderer.compile(scene, camera); } catch (e) { /* compile is an optimisation only */ }

  S.mode = 'attract';
  let last = performance.now();
  R.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try { frame(dt); } catch (e) {
      const k = String(e);
      if (!errSeen.has(k)) { errSeen.add(k); console.error(e); log('error', { msg: k }); }
    }
  });
  window.__krayzeeReady = true;
  ui.setLoading(1, 'Cleared for take-off');
  if (AUTO || params.get('start') === 'free') { ui.enterGameplay(); onPlay('free'); }
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
  try {
    const livery = ui.getLivery ? ui.getLivery() : ui.getProfile();
    const rig = await createPlane({ type: 'c172', livery, quality: S.contentQ === 'low' ? 'low' : 'high', cockpit: true, pilot: { gender: ui.getProfile().gender }, view: S.view });
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    applyEnv(rig);
    rig.setLivery?.(livery);
    scene.add(rig.root);
    const ac = new Aircraft({ id: 'player', dims: rig.dims });
    const ap = new Autopilot(ac);
    S.player = traffic.add({ aircraft: ac, ap, rig, player: true, name: livery.registration || 'PLAYER' });
    S.mode = 'play'; S.playMode = mode;
    placePlayer();
    wiring.startPlay(mode, S.player);
    controls.setVisible(!SHOT && !AUTO); hud.setVisible(!SHOT);
    setView(S.view);
    try { engine?.dispose(); engine = audio.createEngineVoice({ gain: 1, priority: 1 }); } catch (e) { engine = null; }
    log('play', { mode });
  } finally { S.starting = false; }
}

function placePlayer() {
  const E = wiring.activeEnd();
  const e = runwayEnd(E);
  const [x, z] = fromRunway(e, 12, 0);
  attract.clearAround(x, z, 160);
  for (const a of attract.ai) {
    const l = a.ap.leg;
    if (l?.kind === 'takeoff' && a.ap.sub !== 'climb' && a.ap.sub !== 'taxi') attract.despawn(a);
  }
  const ent = S.player;
  ent.ac.place({ x, z, heading: e.hdg }, env);
  ent.ap.setRoute(circuitRoute(E));
  for (const k of AXES) { ent.axis[k].mode = 'auto'; ent.manual[k] = null; }
  controls.release();
  S.respawnT = 0;
}

function quitPlay() {
  if (!S.player) return;
  traffic.remove(S.player);
  S.player.rig.dispose();
  S.player = null;
  wiring.endPlay();
  engine?.dispose(); engine = null;
  controls.setVisible(false); hud.setVisible(false);
  S.mode = 'attract'; S.paused = false;
  fitFov(camera, 70, 45, 85);
}

const VIEWS = ['chase', 'center', 'cockpit'];
function viewList() {
  const v = (ui.getSettings().views || VIEWS).filter((x) => VIEWS.includes(x));
  return v.length ? v : VIEWS;
}
function setView(v) {
  S.view = VIEWS.includes(v) ? v : 'chase';
  if (S.player) S.player.rig.setView(S.view);
  fcam?.setView(S.view);
  if (S.mode !== 'play') fitFov(camera, 70, 45, 85);
}

function pause() {
  if (S.mode !== 'play') return;
  S.paused = true;
  try { audio.setVolumes({ ...ui.getSettings(), sfx: 0 }); } catch (e) { /* */ }
  ui.openSettings();
}
function onResume() { S.paused = false; try { audio.setVolumes(ui.getSettings()); } catch (e) { /* */ } }
function onQuit() { quitPlay(); try { audio.setVolumes(ui.getSettings()); } catch (e) { /* */ } }
function onSettings(s) {
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
  const alpha = S.paused ? traffic.acc / traffic.h : traffic.update(dt * TIMESCALE);
  if (!S.paused) { attract.update(dt * TIMESCALE); wiring.update(dt * TIMESCALE, P); }
  traffic.sync(alpha, S.paused ? 0 : dt, tmpP, tmpQ);
  for (const e of traffic.list) e.rig?.root.updateMatrixWorld();

  if (P) {
    fcam.update(dt, P.rig, P.ac, controls.look);
    handleEvents(P, dt);
    const status = P.ap.status();
    const modes = modesOf(P);
    hud.update(dt, P.ac, status, traffic.modeOf(P), modes, ui.getSettings().units);
    controls.paint(P.ac, modes, S.view, viewList().length > 1);
  } else attract.updateCamera(dt, camera);
  for (const e of traffic.list) if (!e.player) { e.ac.events.length = 0; e.ap?.events.splice(0); }

  world.update?.(dt, camera);
  const focus = P ? P.rig.root.position : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(60));
  sunFollow(focus);
  updateAudio(dt);
  R.renderer.render(scene, camera);
  gov.tick(dt);
}

function handleEvents(P, dt) {
  const ac = P.ac;
  for (const ev of ac.events.splice(0)) {
    log(ev.type, ev);
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
    if (ev.type === 'goaround') hud.flash(`GO AROUND · ${ev.reason.toUpperCase()}`, 'warn');
    else if (ev.type === 'replan' && ev.to === 'approach') hud.flash(`AUTOPILOT · LANDING RUNWAY ${ev.end}`, 'info');
    else if (ev.type === 'recovery') hud.flash('AUTOPILOT · RECOVERING', 'warn');
  }
  if (ac.crashed && S.respawnT > 0 && (S.respawnT -= dt) <= 0) { placePlayer(); try { wiring.game?.respawn(); } catch (e) { /* */ } }
}

function updateAudio(dt) {
  try {
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const P = S.player;
    audio.setListener({ position: camera.position, velocity: P ? P.ac.vel : { x: 0, y: 0, z: 0 }, forward: fwd, up });
    const interior = S.view !== 'chase' && !!P;
    if (P && engine) {
      const ac = P.ac;
      engine.setRPM(ac.crashed ? 0 : ac.instruments().rpm, ac.eng);
      engine.setInterior(interior);
      engine.update(null, null, P.rig.root.position, ac.vel);
      audio.setWind(S.paused ? 0 : ac.speed / KT, { interior });
      const vs = P.ap._vstall();
      audio.setStallHorn(!ac.onGround && !S.paused ? clamp((vs * 1.08 + 5 * KT - ac.speed) / (5 * KT), 0, 1) : 0);
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
    return true;
  },
  setView, start: (m = 'free') => { ui.enterGameplay(); return onPlay(m); }, quit: () => { quitPlay(); ui.showMenu(); },
  phase: () => S.player?.ap.phase,
  get aircraft() { return traffic ? traffic.list.map(summary) : []; },
  log: () => S.log.slice(),
  controlsRects: () => {
    const r = controls.rects();
    const o = {};
    for (const k in r) if (r[k]) o[k] = { x: r[k].x, y: r[k].y, w: r[k].width, h: r[k].height };
    return o;
  },
  get traffic() { return traffic; }, get renderer() { return R; },
  get quality() { return { tier: R?.quality, auto: gov?.auto, fps: gov ? +gov.fps.toFixed(1) : 0, history: gov?.history || [] }; },
};

boot().catch((e) => {
  console.error(e);
  showFatal('The airfield failed to open', String(e && e.message || e));
});

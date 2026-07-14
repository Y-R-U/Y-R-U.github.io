// LONGSHOT — boot + state machine + the loop.
// URL flags: ?nosave ?lite ?shot (thumbnail stage) ?auto (soak-drive)
//            ?m=<missionId> ?cash=N ?seed=X ?time=day|dusk|night|rain ?nobcam

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FLAGS, LITE, VIEW, ECON, SCORE, RIFLES, SCOPES, AMMOS } from './config.js';
import { save, persist, grantCash } from './save.js';
import { buildCity, perchReach } from './city.js';
import { Population } from './people.js';
import { FX } from './fx.js';
import { ScopeRig } from './scope.js';
import { Walker } from './walk.js';
import { Controls } from './controls.js';
import { BulletCam } from './bulletcam.js';
import { MissionRun, convoyTyre } from './missions.js';
import { STORY, RANGE_DEF } from './story.js';
import { dailyDef, weeklyDef, endlessDef, recordDaily, recordWeekly, recordEndless } from './events.js';
import { UI } from './ui.js';
import { Markers } from './markers.js';
import { solve } from './ballistics.js';
import { $, clamp } from './utils.js';
import * as audio from './audio.js';

const T = THREE;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message).slice(0, 200)));
addEventListener('unhandledrejection', (e) => errors.push('rej:' + String(e.reason).slice(0, 200)));

// ── renderer ─────────────────────────────────────────────────────────────────
const renderer = new T.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(VIEW.fov, innerWidth / innerHeight, VIEW.near, VIEW.far);

let composer = null, bloomPass = null;
function applyQuality() {
  const lite = LITE || save.settings.quality === 'lite';
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.25 : 2));
  renderer.setSize(innerWidth, innerHeight);
  if (!lite && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.5, 0.4, 0.78);
    composer.addPass(bloomPass);
  }
  if (composer) composer.setSize(innerWidth, innerHeight);
  window._useComposer = !lite;
}
applyQuality();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});

// ── game state ───────────────────────────────────────────────────────────────
const G = {
  mode: 'boot',              // boot | title | mission
  city: null, pop: null, fx: null, mission: null,
  paused: false,
  titleT: 0,
  fps: 0, _fpsN: 0, _fpsT: 0,
  auto: FLAGS.has('auto'),
  noBcam: FLAGS.has('nobcam'),
  shot: FLAGS.has('shot'),
};

const rig = new ScopeRig(camera, scene);
const walker = new Walker(rig);
const bcam = new BulletCam(scene, camera, null);
const ui = new UI({
  startMission,
  abortMission: () => { G.paused = false; endMission({ won: false, reason: 'contract abandoned', score: 0, lines: [], shots: 0, hits: 0, headshots: 0, longest: 0, civKills: 0, time: 0, def: G.mission.def }, true); },
  resumeMission: () => { G.paused = false; },
  applyQuality,
});
const hud = ui.makeHud();
const markers = new Markers();

const controls = new Controls({
  look: (dx, dy) => rig.look(dx, dy),
  fire: () => G.mission && !G.paused && !bcam.active && G.mission.fire(),
  scopeToggle: () => {
    if (!G.mission || bcam.active) return;
    rig.toggleScope();
    hud.setScopedUI(rig.scoped);
    hud.setZoomLabel(rig.zoom);
    $('zoom-slider').value = Math.round(rig.zoomFrac * 100);
  },
  breath: (on) => rig.breathHold(on),
  mark: () => G.mission && !G.paused && !bcam.active && G.mission.mark(),
  pause: () => {
    if (!G.mission) return;
    G.paused = true;
    ui.settingsPopup(true);
  },
  zoomNudge: (d) => {
    if (!rig.scoped) return;
    rig.nudgeZoom(d);
    hud.setZoomLabel(rig.zoom);
    $('zoom-slider').value = Math.round(rig.zoomFrac * 100);
  },
  zoomFrac: (f) => { rig.setZoomFrac(f); hud.setZoomLabel(rig.zoom); },
});

// audio unlock on first gesture
let audioStarted = false;
addEventListener('pointerdown', () => {
  if (audioStarted) return;
  audioStarted = true;
  audio.init();
  if (G.mode === 'title') audio.musicStart('menu');
}, { once: false });

// ── loading helpers ──────────────────────────────────────────────────────────
function setLoad(f, tip) {
  $('load-fill').style.width = Math.round(f * 100) + '%';
  if (tip) $('load-tip').textContent = tip;
}

// ── title background city ────────────────────────────────────────────────────
function buildTitleCity() {
  disposeWorld();
  const time = FLAGS.get('time') || 'dusk';
  G.city = buildCity(scene, { seed: 'meridian-title', time });
  G.mode = 'title';
}
function disposeWorld() {
  if (G.mission) G.mission = null;
  if (G.pop) { G.pop.dispose(); G.pop = null; }
  if (G.fx) { G.fx.dispose(); G.fx = null; }
  if (G.city) { G.city.dispose(); G.city = null; }
}

// ── mission lifecycle ────────────────────────────────────────────────────────
async function startMission(def) {
  ui.hideAll();
  $('loading').classList.remove('hidden');
  setLoad(0.1, 'inserting…');
  controls.setEnabled(false);
  disposeWorld();
  audio.musicStop();

  const seed = FLAGS.get('seed') || def.seed || ('city:' + def.id);
  const time = FLAGS.get('time') || def.time || 'dusk';
  await new Promise(r => setTimeout(r, 30));    // let the loader paint
  // any contract with people on the street needs the sightline corridor cut
  const kinds = (def.setup?.targets || []).map(t => t.kind || 'plaza');
  const groundLOS = ['protect', 'convoy', 'endless', 'range'].includes(def.special) ||
    kinds.some(k => ['plaza', 'walk', 'bench', 'pair'].includes(k)) || !!def.setup?.identify;
  G.city = buildCity(scene, { seed, time, vantage: def.vantage || { dist: 250, height: 36 }, groundLOS });
  renderer.toneMappingExposure = G.city.time.exposure ?? 1.2;
  setLoad(0.45, 'reading the wind…');
  G.pop = new Population(scene, G.city, seed);
  G.fx = new FX(scene);
  bcam.fx = G.fx;

  const mission = new MissionRun(def, {
    scene, city: G.city, pop: G.pop, fx: G.fx, rig, bcam, hud,
    noBcam: G.noBcam,
    onEnd: (result) => endMission(result),
  });
  try {
    await mission.setup();
  } catch (err) {
    errors.push('setup:' + String(err && err.message || err).slice(0, 300));
    console.error(err);
  }
  setLoad(0.95, 'in position');
  // The shooter owns his roof: he can pace it, and toe the coping to look down.
  // Guarded, because setup() above is ALLOWED to fail — the catch keeps a broken
  // contract playable, and throwing here instead would strand the loading screen.
  if (mission.vantageB) {
    walker.setPerch(mission.vantageB, mission.roofY, rig.eye, G.city.vantage?.blockers || []);
  } else {
    walker.clear();
    errors.push('setup: no perch — walking disabled');
  }
  G.mission = mission;
  G.mode = 'mission';
  G.paused = false;
  rig.enabled = true;
  rig.setScoped(false);
  hud.setScopedUI(false);
  ui.hudShow(true);
  controls.setEnabled(true);
  $('loading').classList.add('hidden');
  audio.ambStart(clamp((def.wind?.[1] || 0) / 3, 0, 2));
  audio.musicStart('mission');
  // Tell the shooter where the job IS. The markers point at it; this says so.
  const n = mission.plates.length || mission.targets.length;
  const what = mission.plates.length ? `${n} steel plate${n === 1 ? '' : 's'}`
    : mission.identify ? 'the mark is hiding among the suits'
    : `${n} mark${n === 1 ? '' : 's'}`;
  hud.fixerSay(mission.identify
    ? 'Glass them all. Match the intel, then MARK ◈ the one that fits.'
    : `Follow the ◈ markers — ${what}. Scope in with ◎, hold breath 🫁, then fire ✛.`);
  setTimeout(() => {
    if (G.mission === mission && mission.state === 'active') {
      hud.toast('◈ markers show your targets · arrows point off-screen', '');
    }
  }, 5200);
  setTimeout(() => {
    if (G.mission === mission && mission.state === 'active') {
      hud.toast('👣 WALK the roof — go to the edge to see the street below', '');
    }
  }, 9000);
}

function endMission(result, aborted) {
  const def = result.def;
  G.lastResult = { id: def.id, won: result.won, reason: result.reason || null, score: result.score, shots: result.shots, hits: result.hits };
  controls.setEnabled(false);
  walker.clear();
  rig.enabled = false;
  rig.breathHold(false);
  rig.setScoped(false);
  hud.setScopedUI(false);
  markers.hideAll();
  ui.hudShow(false);
  audio.ambStop(); audio.musicStop();

  // rewards
  const won = result.won;
  const rec = save.missions[def.id] || (save.missions[def.id] = { score: 0, medal: null, done: false });
  const firstClear = won && !rec.done && !def.practice;
  let medal = null;
  if (won) {
    const par = def.par || 3000;
    medal = result.score >= par * SCORE.medals.gold ? 'gold'
      : result.score >= par * SCORE.medals.silver ? 'silver' : 'bronze';
  }
  const medalRank = { gold: 3, silver: 2, bronze: 1 };
  if (won) {
    rec.done = true;
    rec.score = Math.max(rec.score, result.score);
    if (!rec.medal || medalRank[medal] > medalRank[rec.medal]) rec.medal = medal;
  }
  let cash = 0;
  if (won && !def.practice) {
    cash = Math.round((def.pay || 0) + result.score * ECON.cashPerScore + (firstClear ? ECON.firstClear : 0));
    grantCash(cash);
  } else if (!won && def.contract === 'endless' && result.score > 0) {
    cash = Math.round(result.score * ECON.cashPerScore);   // the Nest banks on the way
    grantCash(cash);
  }
  // story unlock
  const idx = STORY.findIndex(s => s.id === def.id);
  if (won && idx >= 0) {
    save.storyAt = Math.max(save.storyAt, idx + 1);
    save.stats.cleared = Object.values(save.missions).filter(m => m.done).length;
  }
  // contract records
  if (def.contract === 'daily') recordDaily(result.score, won);
  if (def.contract === 'weekly') recordWeekly(result.score, won);
  if (def.contract === 'endless') recordEndless(result.score);
  persist();

  if (aborted) { backToMenus(def); return; }
  ui.renderResults(result, { cash, medal, firstClear },
    () => startMission(def),
    () => backToMenus(def));

  if (G.auto) {
    setTimeout(() => {
      if (!G.auto) return;              // a harness may have switched the bot off
      $('results').classList.add('hidden');
      const next = won && idx >= 0 && idx + 1 < STORY.length ? STORY[idx + 1] : def;
      startMission(next);
    }, 1800);
  }
}

function backToMenus(def) {
  disposeWorld();
  buildTitleCity();
  audio.musicStart('menu');
  if (def.contract) ui.renderContracts();
  else if (def.practice) ui.renderTitle();
  else ui.renderCampaign();
  ui.refreshCash();
}

// ── auto-drive (soak test / demo) ────────────────────────────────────────────
// A competent bot, not a flailing one: it leads movers by iterating the flight
// solution against their velocity, and takes the head when the body is armoured.
let autoT = 0;
const autoTrack = new Map();          // object -> { pos, vel }
function autoVel(key, pos, dt) {
  const prev = autoTrack.get(key);
  const vel = prev && dt > 0
    ? pos.clone().sub(prev.pos).divideScalar(dt)
    : new T.Vector3();
  if (prev) vel.lerp(prev.vel, 0.35);              // smooth
  autoTrack.set(key, { pos: pos.clone(), vel });
  return vel;
}
// aim point that intercepts a mover: converge on tof at the predicted spot
function autoIntercept(m, pos, vel) {
  let aim = pos.clone();
  for (let i = 0; i < 3; i++) {
    const sol = solve(rig.eye, aim, { v0: m.v0, wind: m.windVec() });
    aim = pos.clone().addScaledVector(vel, sol.tof);
  }
  return aim;
}
function autoDrive(dt) {
  const m = G.mission;
  if (!m || m.state !== 'active' || bcam.active) return;
  autoT -= dt;
  if (autoT > 0) return;
  const step = autoT + 0.55;          // real seconds since the last decision
  autoT = 0.55;
  rig.autoSteady = true;

  let aim = null, markFirst = false;
  // Head only when the body is armoured — a 15 cm sphere is an unforgiving aim
  // point on someone who is walking, and the lead is never perfect. Otherwise
  // centre mass, like a person would.
  const aimPoint = (p) =>
    p.group.position.clone().add(new T.Vector3(0, (p.armored ? 1.62 : 1.15) * p.scale, 0));
  const aimAt = (p, key) => {
    const at = aimPoint(p);
    // lead with the SAME velocity the ballistics sim displaces him by, or the
    // bot and the world disagree about where he'll be and it misses forever
    const vel = p.vel ? p.vel.clone() : autoVel(key, p.group.position, step);
    return vel.lengthSq() > 0.04 ? autoIntercept(m, at, vel) : at;
  };

  // Shoot at what you can actually SEE. A bot that empties the magazine into the
  // building a panicked mark just ran behind isn't testing the game, it's
  // testing concrete — and it reports contracts as unwinnable that a player
  // would simply switch targets on.
  const seen = (p) => m._losClear(p.group.position.clone().add(new T.Vector3(0, 1.5 * p.scale, 0)));
  const pickVisible = (list) => list.find(seen) || list[0];

  if (m.plates.length && m.plates.some(p => !p.hit)) {
    aim = m.plates.find(p => !p.hit).c;
  } else if (m.special.sniper?.alive) {
    aim = m.special.sniper.pos.clone().add(new T.Vector3(0, 0.4, 0));
  } else if (m.special.convoy && m.special.convoy.state === 'driving') {
    const cv = m.special.convoy;
    aim = autoIntercept(m, convoyTyre(cv), autoVel(cv, cv.car.position, step));
  } else if (m.special.protect && m.special.protect.killers.some(k => k.alive)) {
    const k = pickVisible(m.special.protect.killers.filter(k => k.alive));
    aim = aimAt(k, k);
  } else {
    const live = m.targets.filter(t => !t.dead && !t.escaped && t.person && t.person.alive && !t.person.hidden && !t.person.gone);
    const t = live.find(t => seen(t.person)) || live[0];
    if (t) {
      aim = aimAt(t.person, t.person);
      if (m.identify && !m.identify.confirmed) markFirst = true;
    }
  }
  if (!aim) return;
  // Marking reads a STRAIGHT ray (it's what your crosshair is over), while
  // firing needs the ballistic solution (aimed high for drop). Aim accordingly,
  // or the bot marks whatever stands behind the mark.
  const dir = markFirst
    ? aim.clone().sub(rig.eye).normalize()
    : solve(rig.eye, aim, { v0: m.v0, wind: m.windVec() }).dir;
  rig.yaw = Math.atan2(dir.x, dir.z);
  rig.pitch = Math.asin(clamp(dir.y, -1, 1));
  if (!rig.scoped) { rig.setScoped(true); hud.setScopedUI(true); }
  rig.setZoomFrac(0.6);
  rig.update(0);   // compose camera at the exact solution before acting
  if (markFirst) { m.mark(); return; }
  if (m.chamberT <= 0 && m.reloadT <= 0) m.fire();
}

// ── screenshot staging (?shot) ───────────────────────────────────────────────
async function stageShot() {
  $('loading').classList.add('hidden');
  // the thumbnail is a real firing position: perch, sightline, city beyond
  G.city = buildCity(scene, {
    seed: 'city:s02', time: 'dusk', vantage: { dist: 230, height: 38 }, groundLOS: true,
  });
  renderer.toneMappingExposure = G.city.time.exposure ?? 1.2;
  const b = G.city.vantageB;
  const roofY = b.h + 1.4;
  const yaw = Math.atan2(G.city.zone.x - b.cx, G.city.zone.z - b.cz);
  const reach = perchReach(Math.min(b.w, b.d), yaw);
  const eye = new T.Vector3(b.cx + Math.sin(yaw) * reach, roofY + 1.62, b.cz + Math.cos(yaw) * reach);
  G.city.setVantage(new T.Vector3(eye.x, roofY, eye.z), yaw, b);
  rig.setVantage(eye, yaw);
  rig.setLoadout(RIFLES[0], SCOPES[0], AMMOS[0], []);
  rig.enabled = true;
  rig.autoSteady = true;
  rig.pitch = -0.11;
  rig.yaw = yaw - 0.12;
  rig.update(0.016);
  G.mode = 'shot';
  window.__shotReady = true;
}

// ── the loop ─────────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  G._fpsN++; G._fpsT += dt;
  if (G._fpsT >= 1) { G.fps = Math.round(G._fpsN / G._fpsT); G._fpsN = 0; G._fpsT = 0; }

  const ts = bcam.active ? bcam.timeScale() : 1;

  if (!G.paused) {
    if (G.city) G.city.update(dt * ts, camera);
    if (G.fx) G.fx.update(dt);
    if (G.pop) G.pop.update(dt * ts, G.mission);

    if (G.mode === 'title' || G.mode === 'shot') {
      if (G.mode === 'title') {
        G.titleT += dt * 0.032;
        const r = 430, h = 170;
        camera.position.set(Math.cos(G.titleT) * r, h + Math.sin(G.titleT * 0.7) * 22, Math.sin(G.titleT) * r);
        camera.lookAt(0, 40, 0);
        if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
      }
    } else if (G.mode === 'mission' && G.mission) {
      if (G.auto) autoDrive(dt);
      G.mission.update(dt * ts);
      if (bcam.active) bcam.update(dt);
      else {
        // walk BEFORE the rig composes: rig.eye is the shot origin, and the
        // walker mutates it in place (MissionRun holds the same Vector3)
        if (!G.auto) walker.update(dt, controls.move, rig.yaw, rig.scoped);
        rig.update(dt);
      }
      if (bcam.active) markers.hideAll();
      else markers.update(G.mission.markerItems(), camera);
    }
  }

  if (window._useComposer && composer) composer.render();
  else renderer.render(scene, camera);
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  setLoad(0.2, 'building meridian city…');
  await new Promise(r => setTimeout(r, 30));
  if (G.shot) { await stageShot(); requestAnimationFrame(loop); return; }
  buildTitleCity();
  setLoad(0.9);
  ui.renderTitle();
  $('loading').classList.add('hidden');

  // debug / test jumps
  if (FLAGS.get('cash')) { save.cash = parseInt(FLAGS.get('cash'), 10) || save.cash; }
  const mid = FLAGS.get('m');
  if (mid) {
    const def = mid === 'range' ? RANGE_DEF
      : mid === 'daily' ? dailyDef() : mid === 'weekly' ? weeklyDef() : mid === 'endless' ? endlessDef()
      : STORY.find(s => s.id === mid);
    if (def) { save.storyAt = Math.max(save.storyAt, STORY.findIndex(s => s.id === mid)); startMission(def); }
  } else if (G.auto) {
    startMission(STORY[Math.min(save.storyAt, STORY.length - 1)]);
  }
  requestAnimationFrame(loop);
}

// test hooks
Object.defineProperty(window, '__state', {
  get: () => ({
    fps: G.fps, mode: G.mode, paused: G.paused,
    mission: G.mission ? {
      id: G.mission.def.id, state: G.mission.state, score: G.mission.score,
      targets: G.mission.targets.map(t => ({ dead: t.dead, escaped: t.escaped })),
      shots: G.mission.shots, hits: G.mission.hits, ammo: G.mission.ammoLeft,
      exposure: G.mission.exposure, time: Math.round(G.mission.time * 10) / 10,
      plates: G.mission.plates.map(p => p.hit),
    } : null,
    scoped: rig.scoped, zoom: Math.round(rig.zoom * 10) / 10,
    eye: { x: +rig.eye?.x.toFixed(2), y: +rig.eye?.y.toFixed(2), z: +rig.eye?.z.toFixed(2) },
    walk: walker.enabled ? { x: +walker.pos.x.toFixed(2), y: +walker.pos.y.toFixed(2), z: +walker.pos.z.toFixed(2), spd: +walker.speed.toFixed(2) } : null,
    people: G.pop ? G.pop.list.length : 0,
    cash: save.cash, storyAt: save.storyAt,
    bcam: bcam.active,
    lastResult: G.lastResult || null,
    errors,
  }),
});
window.__clearResult = () => { G.lastResult = null; };
window.__game = { startMission, rig, walker, bcam, controls, ui, save, STORY, RANGE_DEF, dailyDef, weeklyDef, endlessDef, setAuto: (on) => { G.auto = on; }, get mission() { return G.mission; }, get city() { return G.city; }, get pop() { return G.pop; }, solve };

boot();

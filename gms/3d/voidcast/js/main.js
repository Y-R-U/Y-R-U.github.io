// main.js — boot, renderer, screen flow and the master loop.

import * as THREE from 'three';
import { Run, RESULT } from './game.js';
import { Controls } from './controls.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { Cutscene } from './cutscene.js';
import { S, loadSave, save, addSubs, unlockSkin } from './save.js';
import { LEVELS, level, cutsceneBefore, cutsceneAfter, objectiveText } from './story.js';
import { rankForScore, rankTitle, START_RANK } from './ranking.js';
import { currentEvent, eventSpec, claim, EVENTS } from './events.js';
import { ACT_THEME, skin } from './palettes.js';
import { RENDER, VIEW } from './config.js';
import { makeRng, clamp, fmt, fmtTime, TAU } from './utils.js';
import * as A from './audio.js';

const qs = new URLSearchParams(location.search);
const FLAG = {
  lite: qs.has('lite'),
  auto: qs.has('auto'),
  shot: qs.has('shot'),
  level: qs.has('level') ? parseInt(qs.get('level'), 10) : 0,
  mode: qs.get('mode') || '',
  nocs: qs.has('nocs'),
};

const save0 = loadSave();
A.setSfxEnabled(save0.settings.sfx);

// ── renderer ────────────────────────────────────────────────────────────────

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !FLAG.lite, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.MAX_PIXEL_RATIO));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 3000);

function detectQuality() {
  const pref = S().settings.quality;
  const cores = navigator.hardwareConcurrency || 4;
  const px = (window.innerWidth * window.innerHeight) * Math.min(window.devicePixelRatio || 1, 2);
  let low = FLAG.lite;
  if (pref === 'low') low = true;
  else if (pref === 'high') low = FLAG.lite;
  else low = low || cores <= 4 || px > 3.2e6 && cores <= 6;
  return low
    ? { shadows: false, glow: true, lowTex: true, maxProps: 800, variants: 2, pixelRatio: 1.25 }
    : { shadows: RENDER.SHADOWS, glow: true, lowTex: false, maxProps: 1300, variants: 3, pixelRatio: RENDER.MAX_PIXEL_RATIO };
}
let quality = detectQuality();
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let W = 1, H = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

// ── shared systems ──────────────────────────────────────────────────────────

const controls = new Controls(stage, document.getElementById('stick'));
const fx = new FX(scene, camera, document.getElementById('fxlayer'), { lite: FLAG.lite });
const hud = new HUD(document.getElementById('hud'));
const cutscene = new Cutscene(renderer, {
  root: document.getElementById('cutscene'),
  text: document.getElementById('cs-text'),
  who: document.getElementById('cs-who'),
  title: document.getElementById('cs-title'),
});
const ctx = { scene, camera, renderer, fx, controls, hud };

let mode = 'boot';        // boot | home | play | cutscene
let run = null;
let demo = null;
let pendingAfter = null;

// ── screen flow ─────────────────────────────────────────────────────────────

const ui = new UI({
  startStory: (id) => startStory(id),
  startOneOff: () => startOneOff(),
  startEvent: (ev) => startEvent(ev),
  playCutscene: (id) => playCutscene(id, () => { ui.showOnly('story'); ui.renderStory(); }),
  skipCutscene: () => cutscene.skip(),
  pause: () => pauseRun(),
  resume: () => resumeRun(),
  restart: () => restartRun(),
  quit: () => quitRun(),
  skinChanged: () => { if (demo) applySkin(demo); },
  onScreen: (id) => { if (id === 'home') ensureDemo(); },
});

function setChrome(on) {
  document.getElementById('hud').classList.toggle('hidden', !on);
}

function stopRun() {
  if (run) { run.dispose(); run = null; }
  A.stopMusic();
}
function stopDemo() {
  if (demo) { demo.dispose(); demo = null; }
}

function applySkin(r) {
  const sk = skin(S().skin);
  r.player.setSkin(sk.a, sk.b);
}

// ── the home-screen demo ────────────────────────────────────────────────────

function ensureDemo() {
  if (run) return;
  if (demo) return;
  fx.reset();
  const rng = makeRng(Date.now() & 0x7fffffff);
  const themes = ['scrap', 'colony', 'hive', 'sanctum', 'verge'];
  const act = rng.int(0, 4);
  demo = new Run(ctx, {
    id: 'demo', kind: 'oneoff', name: 'demo', act,
    theme: themes[act], seed: (Math.random() * 1e9) >>> 0,
    radius: 96, time: 0, target: 0, rivals: 2, hazards: 1,
    density: 1, roads: act >= 2 ? 'dense' : 'normal', maxTier: 7, landmarks: 1,
  }, { demo: true, auto: true, quality, on: () => {} });
  demo.demoT = 0;
  setChrome(false);
}

// ── starting runs ───────────────────────────────────────────────────────────

function beginRun(spec, opts) {
  stopDemo();
  stopRun();
  fx.reset();
  controls.reset();
  ui.hideAll();
  setChrome(true);
  mode = 'play';
  run = new Run(ctx, spec, Object.assign({
    quality,
    auto: FLAG.auto,
    on: (type, data) => onRunEvent(type, data),
  }, opts || {}));
  applySkin(run);
  hud.reset(run);
  if (S().settings.music) A.startMusic(spec.theme, 92 + (spec.act || 0) * 4);
  const s = S();
  s.stats.runs++;
  save();
}

function onRunEvent(type, data) {
  switch (type) {
    case 'chat': hud.say(data.kind, data); break;
    case 'tierup': hud.banner('APERTURE — ' + data.name, 'good'); break;
    case 'hit': hud.banner('SIGNAL DISRUPTED', 'bad'); break;
    case 'toast': ui.toast(data.text, data.cls); break;
    case 'boon': ui.showBoon(data.choices, (b) => run.takeBoon(b)); break;
    case 'end': endRun(data); break;
    default: break;
  }
}

function startStory(id) {
  const lv = level(id);
  const cs = cutsceneBefore(id);
  const seen = S().story.seen;
  const go = () => beginRun(lv);
  if (cs && !seen[cs] && !FLAG.nocs) {
    seen[cs] = true; save();
    playCutscene(cs, go);
  } else go();
}

function startOneOff() {
  const s = S();
  const act = clamp(Math.floor((s.story.unlocked - 1) / 10), 0, 4);
  const seed = (Math.random() * 1e9) >>> 0;
  beginRun({
    id: 'oneoff', kind: 'oneoff', name: 'Open Contract', act,
    theme: ACT_THEME[act], seed,
    radius: 108 + act * 6, time: 150, target: 0,
    rivals: 2 + Math.min(2, act), hazards: Math.min(3, 1 + Math.floor(act / 2)),
    density: 1.1, roads: act >= 2 ? 'dense' : 'normal', maxTier: 7, landmarks: 1,
  });
}

function startEvent(ev) {
  beginRun(eventSpec(ev));
}

function playCutscene(id, done) {
  mode = 'cutscene';
  setChrome(false);
  ui.hideAll();
  const seen = S().story.seen;
  seen[id] = true; save();
  cutscene.play(id, () => {
    mode = run ? 'play' : 'home';
    if (done) done();
  });
}

// ── pause / quit ────────────────────────────────────────────────────────────

function pauseRun() {
  if (!run || run.over) return;
  run.paused = true;
  A.sfxUi(false);
  ui.showPause(run);
}
function resumeRun() {
  if (!run) return;
  if (!run.pendingBoon) run.paused = false;
}
function restartRun() {
  if (!run) return;
  const spec = run.spec;
  beginRun(spec);
}
function quitRun() {
  if (!run) return;
  run.abandon();
}

function goHome() {
  stopRun();
  fx.reset();
  setChrome(false);
  mode = 'home';
  ui.stack.length = 0;
  ui.showOnly('home');
  ensureDemo();
}

// ── run results ─────────────────────────────────────────────────────────────

function endRun(res) {
  const spec = run.spec;
  const s = S();
  setChrome(false);
  A.stopMusic();
  s.stats.props += res.eaten;
  s.stats.mass += res.mass;
  s.stats.landmarks += res.landmarks;
  if (res.combo > s.stats.bestCombo) s.stats.bestCombo = res.combo;
  if (res.viewers > s.stats.peakViewers) s.stats.peakViewers = res.viewers;
  addSubs(res.subs);

  if (spec.kind === 'story') return endStory(res, spec);
  if (spec.kind === 'event') return endEvent(res, spec);
  return endOneOff(res, spec);
}

function endStory(res, spec) {
  const s = S();
  const lv = level(spec.id);
  let stars = 0;
  if (res.result === RESULT.WIN) {
    stars = 1;
    if (res.pct >= lv.stars[1]) stars = 2;
    if (res.pct >= lv.stars[2]) stars = 3;
    const prev = s.story.stars[lv.id] || 0;
    if (stars > prev) s.story.stars[lv.id] = stars;
    if (lv.id + 1 > s.story.unlocked && lv.id < 50) s.story.unlocked = lv.id + 1;
    if (lv.id === 50) {
      s.story.done = true;
      if (unlockSkin('gold')) ui.toast('Guild Gold skin unlocked', 'good');
    }
    save();
  }
  const show = () => {
    const buttons = [];
    if (res.result === RESULT.WIN && lv.id < 50) {
      buttons.push({ label: 'NEXT CONTRACT', cls: 'prime', fn: () => startStory(lv.id + 1) });
      buttons.push({ label: 'Home', cls: 'ghost', fn: goHome });
    } else if (res.result === RESULT.WIN) {
      buttons.push({ label: 'HOME', cls: 'prime', fn: goHome });
    } else {
      buttons.push({ label: 'RETRY', cls: 'prime', fn: () => startStory(lv.id) });
      buttons.push({ label: 'Home', cls: 'ghost', fn: goHome });
    }
    ui.showResults(res, {
      kicker: res.result === RESULT.WIN ? 'CONTRACT COMPLETE' : res.result === RESULT.ABANDON ? 'BROADCAST ABANDONED' : 'QUOTA MISSED',
      title: `${String(lv.id).padStart(2, '0')} · ${lv.name}`,
      stars: res.result === RESULT.WIN ? stars : 0,
      totalMass: res.totalArea || 1,
      buttons,
    });
    stopRun();
  };
  const after = res.result === RESULT.WIN ? cutsceneAfter(lv.id) : null;
  if (after && !FLAG.nocs) {
    const keep = run;
    run = null;
    keep.dispose();
    playCutscene(after, () => { mode = 'home'; show(); });
  } else show();
}

function endOneOff(res, spec) {
  const s = S();
  const before = rankForScore(s.best.score);
  if (res.score > s.best.score) s.best.score = res.score;
  const after = rankForScore(s.best.score);
  s.best.rank = after;
  const awards = [];
  if (after <= 1_000_000 && unlockSkin('void')) awards.push('True Void skin unlocked');
  save();
  ui.showResults(res, {
    kicker: 'OPEN CONTRACT',
    title: rankTitle(after),
    rankBefore: before, rankAfter: after,
    totalMass: res.totalArea || 1,
    awards,
    buttons: [
      { label: 'RUN AGAIN', cls: 'prime', fn: () => startOneOff() },
      { label: 'Home', cls: 'ghost', fn: goHome },
    ],
  });
  stopRun();
}

function endEvent(res, spec) {
  const ev = spec.ev;
  const awards = claim(ev, res.score);
  ui.showResults(res, {
    kicker: 'LIMITED CONTRACT',
    title: ev.name,
    totalMass: res.totalArea || 1,
    awards,
    buttons: [
      { label: 'RUN AGAIN', cls: 'prime', fn: () => startEvent(ev) },
      { label: 'Home', cls: 'ghost', fn: goHome },
    ],
  });
  stopRun();
}

// ── loop ────────────────────────────────────────────────────────────────────

let last = performance.now();
let acc = 0, frames = 0, fpsAvg = 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.12) dt = 0.12;

  // rolling fps, used by the auto quality guard
  acc += dt; frames++;
  if (acc > 1) { fpsAvg = fpsAvg * 0.5 + (frames / acc) * 0.5; acc = 0; frames = 0; guardQuality(); }

  if (mode === 'cutscene') {
    cutscene.update(dt);
    cutscene.render(W, H);
    return;
  }

  const active = run || demo;
  if (active) {
    active.update(dt);
    if (demo && !run) {
      demo.demoT += dt;
      if (demo.sectorPct() > 90 || demo.demoT > 150) { stopDemo(); ensureDemo(); }
    }
  }
  fx.update(dt, W, H);
  if (run) hud.update(dt, run);
  renderer.render(scene, camera);
}

/** If the frame rate sags badly on a first run, drop to the low preset. */
function guardQuality() {
  if (quality.__downgraded || FLAG.shot) return;
  if (fpsAvg > 26 || S().settings.quality === 'high') return;
  quality = { shadows: false, glow: true, lowTex: true, maxProps: 800, variants: 2, pixelRatio: 1.15, __downgraded: true };
  renderer.setPixelRatio(1.15);
  renderer.shadowMap.enabled = false;
  ui.toast('Graphics lowered to keep it smooth');
}

// ── first-touch audio + boot ────────────────────────────────────────────────

function unlockAudio() {
  A.initAudio();
  A.resumeAudio();
  A.setSfxEnabled(S().settings.sfx);
  A.setMusicEnabled(S().settings.music);
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

const bootFill = document.getElementById('boot-fill');
const bootStatus = document.getElementById('boot-status');
const BOOT_STEPS = ['warming the aperture…', 'negotiating bandwidth…', 'generating sector…', 'going live'];

function boot() {
  let i = 0;
  const step = () => {
    bootFill.style.width = ((i + 1) / BOOT_STEPS.length * 100) + '%';
    bootStatus.textContent = BOOT_STEPS[i];
    i++;
    if (i < BOOT_STEPS.length) return setTimeout(step, 170);
    setTimeout(finishBoot, 220);
  };
  step();
}

function finishBoot() {
  document.getElementById('boot').classList.add('hidden');
  mode = 'home';
  ui.showOnly('home');
  ensureDemo();

  if (FLAG.level) { startStory(clamp(FLAG.level, 1, 50)); return; }
  if (FLAG.mode === 'oneoff') { startOneOff(); return; }
  if (FLAG.mode === 'event') { startEvent(currentEvent().ev); return; }
  if (FLAG.mode === 'demo') return;
}

requestAnimationFrame(frame);
boot();

// ── test hooks ──────────────────────────────────────────────────────────────

window.__game = {
  ui, get run() { return run; }, get demo() { return demo; },
  startStory, startOneOff, startEvent, goHome, playCutscene,
  levels: LEVELS, events: EVENTS,
  quality, renderer, scene, camera,
  grow(m) { if (run) { run.mass += m; run._recalc(); run._checkBoon(); } },
  boon() { if (run) { run.boonIndex = 0; run.viewers = 1e12; run._checkBoon(); } },
  hype(h) { if (run) { run.hype = h; run._recalc(); } },
  win() { if (run) run._finish(RESULT.WIN); },
  lose() { if (run) run._finish(RESULT.LOSE); },
};

Object.defineProperty(window, '__state', {
  get() {
    const r = run || demo;
    return {
      mode, fps: Math.round(fpsAvg),
      subs: S().subs,
      unlocked: S().story.unlocked,
      run: r ? {
        kind: r.spec.kind, name: r.spec.name, id: r.spec.id,
        viewers: Math.round(r.viewers), hype: +r.hype.toFixed(2),
        mass: Math.round(r.mass), radius: +r.player.radius.toFixed(2), tier: r.player.tier,
        clear: +r.clearPct().toFixed(2), sector: +r.sectorPct().toFixed(2),
        combo: r.combo, best: r.bestCombo, eaten: r.eatenCount,
        props: r.sector.props.length, alive: r.sector.props.filter((p) => !p.dead).length,
        rivals: r.rivals.map((x) => ({ n: x.name, m: Math.round(x.eatenMass), r: +x.hole.radius.toFixed(1) })),
        hazards: r.hazards.aliveCount(),
        time: +(r.timeLimit ? r.timeLeft : r.elapsed).toFixed(1),
        boons: r.boons.map((b) => b.id),
        over: r.over, paused: r.paused, pendingBoon: !!r.pendingBoon,
      } : null,
      cutscene: cutscene.playing ? { id: cutscene.id, shot: cutscene.shotI } : null,
    };
  },
});

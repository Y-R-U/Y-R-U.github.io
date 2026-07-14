// GRUDGE BUGS — boot, mode machine, the loop. Modes: menu (live 3D backdrop),
// cutscene (story intro), battle (quick/story). URL flags: ?lite ?shot ?auto
// ?fast ?ch=N ?seed=N ?nosave. window.__game / __state for headless tests.

import * as THREE from 'three';
import { CAM, AI, THEMES, ECON, FACTIONS } from './config.js';
import { $, mulberry32, pick } from './utils.js';
import * as save from './save.js';
import * as audio from './audio.js';
import * as voice from './voice.js';
import * as ui from './ui.js';
import { FX } from './fx.js';
import { CameraDirector } from './cameras.js';
import { Input } from './input.js';
import { Battle } from './game.js';
import { CHAPTERS, chapterTeams, starsFor, playDialog, playIntro } from './story.js';

const T = THREE;
const params = new URLSearchParams(location.search);
const FLAG = { lite: params.has('lite'), shot: params.has('shot'), auto: params.has('auto'), fast: params.has('fast') };
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

// ---------------- three boot ----------------
const container = $('game-container');
const renderer = new T.WebGLRenderer({ antialias: !FLAG.lite, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, FLAG.lite ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = T.SRGBColorSpace;
const profile = save.load();
const liteMode = FLAG.lite || profile.opts.lite;
renderer.shadowMap.enabled = !liteMode;
renderer.shadowMap.type = T.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 0.05, 260);
camera.position.set(10, 6, 10);

const cams = new CameraDirector(camera, renderer.domElement);
cams.shakeOn = profile.opts.shake;
const fx = new FX(scene, camera, renderer.domElement);
voice.init(camera, renderer.domElement);
const deps = { fx, cams, dom: renderer.domElement };

// ---------------- mode machine ----------------
let mode = 'boot';
let battle = null;         // live Battle (menu backdrop OR real fight)
let cutscene = null;
let dialogCtl = null;
let storyCh = null;        // active story chapter
let battleIsReal = false;

function disposeBattle() {
  if (battle) { battle.dispose(); battle = null; }
  fx.clear();
  voice.clear();
  battleIsReal = false;
}

function toMenu() {
  disposeBattle();
  cutscene = null;
  mode = 'menu';
  ui.hudVisible(false);
  ui.showScreen('menu');
  audio.music('menu');
  buildMenuStage();
  if (!FLAG.shot && !FLAG.auto) ui.maybeDaily();
}

function buildMenuStage() {
  battle = new Battle(scene, deps, {
    cinematic: true, theme: 'garden', seed: 12, lite: liteMode,
    teams: [
      { factionId: 'ants', count: 2, isAI: true, hat: profile.hat },
      { factionId: 'beetles', count: 2, isAI: true },
    ],
  });
  cams.setMode('menu', { center: new T.Vector3(0, 1.6, 0) });
}

// ---------------- battles ----------------
function resolveDiff(id) { return AI.diffs.find(d => d.id === id) || AI.diffs[1]; }

function startQuick(cfg) {
  disposeBattle();
  mode = 'battle'; battleIsReal = true;
  ui.showScreen(null);
  ui.hudVisible(true);
  audio.music('battle');
  const p = save.load();
  const themeId = cfg.theme === 'random' ? pick(Math.random, THEMES).id : cfg.theme;
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const others = FACTIONS.filter(f => f.id !== cfg.faction && !f.boss);
  const teams = [{ factionId: cfg.faction, count: cfg.size, isAI: FLAG.auto, hat: p.hat, diff: resolveDiff(cfg.diff) }];
  for (let i = 0; i < cfg.rivals; i++) {
    const f = others.splice(Math.floor(rng() * others.length), 1)[0];
    teams.push({ factionId: f.id, count: cfg.size, isAI: true, diff: resolveDiff(cfg.diff) });
  }
  battle = new Battle(scene, deps, {
    teams, theme: themeId, lite: liteMode,
    seed: params.get('seed') ? Number(params.get('seed')) : undefined,
    fast: FLAG.fast || FLAG.auto,
    replays: params.has('replays') ? 'force' : (profile.opts.replays && !FLAG.auto),
    onOver: (res) => onBattleOver(res, null, () => startQuick(cfg)),
    onHUD: (b) => ui.updateHUD(b),
    onPhase: (ph, bug) => onPhase(ph, bug),
  });
  ui.updateHUD(battle);
}

function startStory(ch) {
  disposeBattle();
  mode = 'battle'; battleIsReal = true;
  storyCh = ch;
  ui.showScreen(null);
  ui.hudVisible(true);
  audio.music('battle');
  const p = save.load();
  battle = new Battle(scene, deps, {
    cinematic: true,
    teams: chapterTeams(ch, p.faction, p.hat),
    theme: ch.theme, seed: ch.seed, lite: liteMode,
    sandwich: ch.sandwich, sandwichPos: ch.sandwichPos,
    suddenDeathRound: ch.suddenDeathRound,
    fast: FLAG.fast || FLAG.auto, replays: profile.opts.replays && !FLAG.auto,
    onOver: (res) => onBattleOver(res, ch, () => startStory(ch)),
    onHUD: (b) => ui.updateHUD(b),
    onPhase: (ph, bug) => onPhase(ph, bug),
  });
  ui.updateHUD(battle);
  if (FLAG.fast || FLAG.auto) battle.startTurns();
  else dialogCtl = playDialog(battle, ch.dialog, cams, () => { dialogCtl = null; battle.startTurns(); });
}

function onPhase(ph, bug) {
  if (ph === 'turn' && bug) {
    ui.turnBanner(bug);
    ui.updateHUD(battle);
    input.resetFreeCam();
  }
  if (ph === 'splash' && bug) save.load().stats.falls++;
}

function onBattleOver(res, ch, rematch) {
  const p = save.load();
  p.stats.battles++;
  if (res.playerWon) p.stats.wins++;
  const kills = res.kills?.[0] || 0;
  p.stats.kills += kills;
  let coins = ECON.battleBase + kills * ECON.perKill + (res.playerWon ? ECON.winBonus : 0);
  let stars = 0;
  let hasNext = false;
  if (ch && res.playerWon) {
    stars = starsFor(res);
    const prev = p.story[ch.id] || 0;
    if (!prev) coins += ECON.storyFirstClear;
    p.story[ch.id] = Math.max(prev, stars);
    hasNext = CHAPTERS.indexOf(ch) < CHAPTERS.length - 1;
  }
  p.coins += coins;
  save.save();
  if (FLAG.auto) { window.__result = res; return; }
  ui.hudVisible(false);
  ui.resultsModal(res, coins, stars, { isStory: !!ch, hasNext }, (i) => {
    if (ch && res.playerWon && hasNext && i === 0) return startStory(CHAPTERS[CHAPTERS.indexOf(ch) + 1]);
    if (!res.playerWon && i === 0) return rematch();
    if (res.playerWon && !ch && i === 1) return rematch();
    toMenu();
  });
}

function continueStory() {
  const p = save.load();
  const next = CHAPTERS.find(ch => !(p.story[ch.id] > 0)) || CHAPTERS[CHAPTERS.length - 1];
  startStory(next);
}

function runIntro(then) {
  disposeBattle();
  mode = 'cutscene';
  ui.showScreen(null);
  ui.hudVisible(false);
  audio.music('menu');
  cutscene = playIntro(scene, deps, () => {
    cutscene = null;
    save.load().introSeen = true;
    save.save();
    then();
  });
}

// ---------------- ui wiring ----------------
ui.init({
  startQuick,
  startStory: (ch) => {
    const p = save.load();
    if (!p.introSeen && ch.id === 's1') runIntro(() => startStory(ch));
    else startStory(ch);
  },
  continueStory,
  toMenu,
  getBattle: () => (battleIsReal ? battle : null),
  cams: () => cams,
  chapters: () => CHAPTERS,
  chapterCount: () => CHAPTERS.length,
  replayIntro: () => runIntro(() => toMenu()),
  skipCine: () => { cutscene?.skip(); dialogCtl?.skip(); },
});
const input = new Input(renderer.domElement, cams, () => (battleIsReal ? battle : null), ui);

// audio unlock on first gesture
window.addEventListener('pointerdown', () => {
  audio.init();
  audio.resume();
  audio.setSfx(profile.opts.sfx);
  audio.setMusic(profile.opts.music);
  if (mode === 'menu') audio.music('menu');
}, { once: true });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- boot path ----------------
$('boot').classList.add('hidden');
if (FLAG.shot) {
  // staged thumbnail: picnic showdown around the sandwich
  battle = new Battle(scene, deps, {
    cinematic: true, theme: 'picnic', seed: 77, lite: false,
    sandwich: 1.25, sandwichPos: { x: 0, z: -10 },
    teams: [
      { factionId: 'ants', count: 3, isAI: true, hat: 'cowboy' },
      { factionId: 'beetles', count: 3, isAI: true },
    ],
  });
  mode = 'shot';
  // frame the shooter → victim axis with the blast mid-frame
  const b0 = battle.teams[0].bugs[0];
  const p = battle.bugPos(b0);
  let e0 = battle.teams[1].bugs[0], bd = 1e9;
  for (const e of battle.teams[1].bugs) {
    const q = battle.bugPos(e);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) { bd = d; e0 = e; }
  }
  const q = battle.bugPos(e0);
  const dir = new T.Vector3(q.x - p.x, 0, q.z - p.z).normalize();
  const side = new T.Vector3(dir.z, 0, -dir.x);
  const camPos = new T.Vector3(p.x, p.y, p.z).addScaledVector(dir, -2.6).addScaledVector(side, 2.2);
  camPos.y = Math.max(p.y, q.y) + 1.7;
  const look = new T.Vector3((p.x + q.x) / 2, (p.y + q.y) / 2 + 0.4, (p.z + q.z) / 2);
  b0.faceDir = 1;
  cams.setMode('cine', { from: camPos, to: camPos.clone(), lookFrom: look, lookTo: look, dur: 30 });
  setTimeout(() => {
    voice.say(b0, 'taunt', { line: 'Ba-da-BOOM.' });
    fx.explosion({ x: q.x + 0.4, y: q.y + 0.45, z: q.z }, 1.9);
    e0.rig.flinchT = 0.6;
    setTimeout(() => { window.__shotReady = true; }, 130);
  }, 900);
} else if (FLAG.auto) {
  startQuick({ faction: 'ants', rivals: Number(params.get('rivals') || 1), size: 3, theme: 'random', diff: params.get('diff') || 'spicy' });
} else if (params.get('ch')) {
  const ch = CHAPTERS[Number(params.get('ch')) - 1] || CHAPTERS[0];
  startStory(ch);
} else {
  toMenu();
}

// ---------------- loop ----------------
const clock = new T.Clock();
let fps = 60, fpsAcc = 0, fpsN = 0;
function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const ts = ui.isPaused() ? 0 : cams.timeScale();
  const dt = raw * ts;
  if (cutscene) cutscene.update(raw);
  else if (battle) battle.update(dt, raw);
  fx.update(Math.max(dt, raw * 0.25));
  voice.update(raw);
  cams.update(dt, raw);
  if (battleIsReal) ui.tickHUD(battle);
  renderer.render(scene, camera);
}
frame();

// ---------------- test hooks ----------------
window.__game = {
  get battle() { return battle; }, get mode() { return mode; },
  cams, save, startQuick, startStory, CHAPTERS, ui,
};
window.__state = () => ({
  mode, fps: Math.round(fps),
  phase: battle?.phase, round: battle?.round, over: !!battle?.over,
  proj: battle?.projectiles?.length ?? 0, rags: battle?.rags?.length ?? 0,
  strike: !!battle?.strike, pend: battle?.pendingShards?.length ?? 0,
  ai: battle?._aiScript?.stage ?? null, act: battle?._active?.id ?? null,
  actAlive: battle?._active?.alive ?? null,
  winner: battle?.winner?.faction?.id ?? null,
  teams: battle ? battle.teams.map(t => ({
    f: t.faction.id, alive: t.bugs.filter(b => b.alive).length,
    hp: t.bugs.reduce((a, b) => a + (b.alive ? Math.max(0, b.hp) : 0), 0),
  })) : [],
  errors,
});

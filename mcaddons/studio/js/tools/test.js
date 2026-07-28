// Play — a small voxel Minecraft-like world that loads the child's ACTUAL add-on files.
// One file. See CLAUDE.md "module contract" + lib/geo.js + lib/anim.js + lib/molang.js.
import * as THREE from 'three';
import { fs } from '../core/fs.js';
import { bus } from '../core/bus.js';
import { el, toast, modal } from '../core/ui.js';
import { tour, say, award } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { lintProject, closest } from '../core/validate.js';
import { parseGeoFile, buildGeo, resetPose, makeTexture, makeMaterial } from '../lib/geo.js';
import { parseAnimFile, sampleAnim, applyPose, activeAnimations } from '../lib/anim.js';
import { titleCase } from '../lib/bedrock.js';

// ------------------------------------------------------------------ consts ---
const WORLD_SIZE = 48;      // X and Z
const WORLD_H = 20;         // Y
const CHUNK_W = 8;          // 48 / 8 = 6 chunks
const N_CHUNKS = WORLD_SIZE / CHUNK_W;
const SEA_LEVEL = 4;
const RAY_MAX = 5;
const MAX_MOBS = 14;
const GRAVITY = -28;
const JUMP_VEL = 8.6;
const WALK_SPEED = 4.3;
const CROUCH_SPEED = 1.4;
const EYE_H = 1.62, EYE_H_CROUCH = 1.25;
const PLAYER_H = 1.8, PLAYER_H_CROUCH = 1.4, PLAYER_HW = 0.3;
const CYCLE_SECONDS = 300; // one full day/night loop

const BLOCK = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5 };

const isTouch = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || navigator.maxTouchPoints > 0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// -------------------------------------------------------------------- CSS ---
const CSS = `
.tw-wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: #000; }
.tw-topbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; background: var(--panel); border-bottom: 2px solid #000; z-index: 5; }
.tw-topbar .tw-fps { margin-left: auto; font-family: var(--mono); font-size: .8em; color: var(--dim); padding: 0 6px; }
.tw-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #000; touch-action: none; }
.tw-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; }
.tw-crosshair {
  position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; transform: translate(-50%,-50%);
  pointer-events: none; z-index: 4;
}
.tw-crosshair::before, .tw-crosshair::after { content: ''; position: absolute; background: rgba(255,255,255,.85); box-shadow: 0 0 2px #000; }
.tw-crosshair::before { left: 8px; top: 2px; width: 2px; height: 14px; }
.tw-crosshair::after { top: 8px; left: 2px; height: 2px; width: 14px; }
.tw-bars { position: absolute; left: 12px; bottom: 90px; display: flex; flex-direction: column; gap: 5px; z-index: 4; width: 180px; }
.tw-bar { height: 12px; border-radius: 6px; background: rgba(0,0,0,.55); border: 2px solid #000; overflow: hidden; }
.tw-bar-fill { height: 100%; width: 100%; transition: width .15s; }
.tw-health .tw-bar-fill { background: linear-gradient(#ff6a5a,#c93a2c); }
.tw-hunger .tw-bar-fill { background: linear-gradient(#f0b93c,#c98a1c); }
.tw-hotbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; gap: 5px; z-index: 4; }
.tw-slot {
  width: 52px; height: 52px; border-radius: 8px; background: rgba(20,22,28,.78); border: 2px solid #000;
  box-shadow: inset 0 0 0 1px var(--edge2); display: grid; place-items: center; position: relative; cursor: pointer;
}
.tw-slot.on { border-color: var(--grass); box-shadow: inset 0 0 0 1px var(--grass), 0 0 8px rgba(108,195,73,.6); }
.tw-slot img, .tw-slot canvas { width: 34px; height: 34px; image-rendering: pixelated; }
.tw-slot .tw-slot-n { position: absolute; left: 3px; top: 2px; font-size: 9px; color: var(--dim); font-family: var(--mono); }
.tw-slot .tw-slot-label { position: absolute; bottom: -1px; left: 0; right: 0; font-size: 8px; text-align: center; color: var(--dim); background: rgba(0,0,0,.5); border-radius: 0 0 6px 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tw-mobbars { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.tw-mobbar { position: absolute; width: 46px; height: 6px; margin-left: -23px; border-radius: 4px; background: rgba(0,0,0,.6); border: 1px solid #000; overflow: hidden; }
.tw-mobbar i { display: block; height: 100%; background: linear-gradient(#7ccf58,#4a8c30); }
.tw-float { position: absolute; pointer-events: none; z-index: 6; font-weight: 800; font-size: 13px; color: #ff8f82; text-shadow: 0 1px 0 #000; transition: transform .5s, opacity .5s; }
.tw-cmdbtn { position: absolute; right: 10px; bottom: 12px; z-index: 5; }
.tw-cmdbar { position: absolute; left: 8px; right: 8px; bottom: 12px; z-index: 30; display: none; }
.tw-cmdbar.on { display: block; }
.tw-cmdbar input { width: 100%; font-family: var(--mono); }
.tw-cmdsuggest { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.tw-cmdsuggest span { background: var(--panel2); border: 1px solid var(--edge2); border-radius: 6px; padding: 3px 7px; font-size: .8em; font-family: var(--mono); cursor: pointer; color: var(--text); }
.tw-cmdsuggest span:hover { background: var(--panel3); }
.tw-death {
  position: absolute; inset: 0; z-index: 40; display: none; place-items: center; background: rgba(90,10,8,.55);
  flex-direction: column; gap: 14px; text-align: center;
}
.tw-death.on { display: flex; }
.tw-death h2 { font-size: 1.6em; color: #fff; text-shadow: 2px 2px 0 #000; }
.tw-log-panel { flex: 0 0 auto; max-height: 0; overflow: hidden; background: var(--panel); border-top: 2px solid #000; transition: max-height .2s; z-index: 6; }
.tw-log-panel.on { max-height: 40vh; overflow: auto; }
.tw-log-row { display: flex; gap: 8px; padding: 8px 12px; border-left: 3px solid var(--edge2); font-size: .86em; align-items: flex-start; }
.tw-log-row + .tw-log-row { border-top: 1px solid var(--edge); }
.tw-log-row.lv-error { border-left-color: var(--red); }
.tw-log-row.lv-warn { border-left-color: var(--gold); }
.tw-log-row.lv-tip { border-left-color: var(--sky); }
.tw-log-row b { display: block; }
.tw-log-row .tw-log-path { color: var(--dim); font-family: var(--mono); font-size: .82em; }
.tw-log-row .tw-log-fix { color: var(--grass); margin-top: 2px; }
.tw-log-empty { padding: 18px; text-align: center; color: var(--dim); }
.tw-badge { position: relative; }
.tw-badge .tw-count { position: absolute; top: -6px; right: -6px; background: var(--red); color: #fff; font-size: 10px; font-weight: 800; border-radius: 999px; min-width: 16px; height: 16px; display: grid; place-items: center; padding: 0 3px; border: 1px solid #000; }
.tw-joy { position: absolute; left: 22px; bottom: 90px; width: 96px; height: 96px; border-radius: 50%; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.35); z-index: 20; touch-action: none; }
.tw-joy-knob { position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; margin: -21px 0 0 -21px; border-radius: 50%; background: rgba(255,255,255,.35); border: 2px solid rgba(255,255,255,.6); }
.tw-lookzone { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; z-index: 10; touch-action: none; }
.tw-mbtn {
  position: absolute; z-index: 20; width: 62px; height: 62px; border-radius: 50%; background: rgba(255,255,255,.14);
  border: 2px solid rgba(255,255,255,.4); color: #fff; font-size: 22px; display: grid; place-items: center; touch-action: none;
}
.tw-mbtn:active { background: rgba(255,255,255,.3); }
.tw-btn-jump { right: 18px; bottom: 168px; }
.tw-btn-use { right: 96px; bottom: 96px; }
.tw-btn-break { right: 18px; bottom: 96px; }
/* mobile-only controls: hidden unless touch is detected at runtime (must come after the
   component rules above so it wins the cascade — same specificity, later wins). */
.tw-mobile { display: none !important; }
body.tw-is-touch .tw-mobile { display: block !important; }
body.tw-is-touch .tw-mbtn { display: grid !important; }
`;
let cssInjected = false;

// -------------------------------------------------------------- draw utils ---
function canvasTex(draw, size = 16) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speck(x, size, n, colors, minSz = 1, maxSz = 2) {
  const s = size / 16;
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[i % colors.length];
    const w = (minSz + ((i * 7) % (maxSz - minSz + 1))) * s;
    x.fillRect(((i * 13) % 16) * s, ((i * 9 + i) % 16) * s, w, w);
  }
}
const DRAW = {
  grass_top: (x, size) => { x.fillStyle = '#5aa83c'; x.fillRect(0, 0, size, size); speck(x, size, 10, ['#6cc349', '#4c8c30']); },
  grass_side: (x, size) => {
    const s = size / 16;
    x.fillStyle = '#8a6a3f'; x.fillRect(0, 0, size, size);
    speck(x, size, 6, ['#7d6039', '#987448']);
    x.fillStyle = '#5aa83c'; x.fillRect(0, 0, size, 5 * s);
    x.fillStyle = '#4c8c30'; for (let i = 0; i < 5; i++) x.fillRect(((i * 3) % 16) * s, (4) * s, 2 * s, 1 * s);
  },
  dirt: (x, size) => { x.fillStyle = '#7d6039'; x.fillRect(0, 0, size, size); speck(x, size, 12, ['#6b5230', '#8f7148']); },
  stone: (x, size) => { x.fillStyle = '#8b8e9c'; x.fillRect(0, 0, size, size); speck(x, size, 12, ['#797d8c', '#9a9dab']); },
  wood_top: (x, size) => {
    x.fillStyle = '#a9814f'; x.fillRect(0, 0, size, size);
    x.strokeStyle = '#7d6039'; x.lineWidth = Math.max(1, size / 16);
    const c = size / 2;
    for (let r = 2; r < size / 2; r += size / 8) { x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); }
  },
  wood_side: (x, size) => {
    const s = size / 16;
    x.fillStyle = '#7d6039'; x.fillRect(0, 0, size, size);
    x.fillStyle = '#8f7148';
    for (let i = 0; i < 16; i += 3) x.fillRect(i * s, 0, 1.5 * s, size);
  },
  leaves: (x, size) => { x.fillStyle = '#417a2c'; x.fillRect(0, 0, size, size); speck(x, size, 14, ['#5aa83c', '#2f5c1e'], 1, 3); },
  water: (x, size) => { x.fillStyle = 'rgba(70,120,210,.65)'; x.fillRect(0, 0, size, size); speck(x, size, 6, ['rgba(120,170,255,.5)']); },
  flower: (x, size) => {
    const s = size / 16; x.clearRect(0, 0, size, size);
    x.fillStyle = '#6cc349'; x.fillRect(7 * s, 9 * s, 2 * s, 6 * s);
    x.fillStyle = '#ff5a8c';
    [[6, 4], [8, 4], [5, 6], [9, 6], [7, 6]].forEach(([px, py]) => x.fillRect(px * s, py * s, 2 * s, 2 * s));
    x.fillStyle = '#ffd23c'; x.fillRect(7 * s, 6 * s, 2 * s, 2 * s);
  }
};
let MISSING_TEX = null, MISSING_MAT = null;
function missingTexture() {
  if (MISSING_TEX) return MISSING_TEX;
  MISSING_TEX = canvasTex((x, size) => {
    const h = size / 2;
    x.fillStyle = '#000'; x.fillRect(0, 0, size, size);
    x.fillStyle = '#e800e8'; x.fillRect(0, 0, h, h); x.fillRect(h, h, h, h);
  }, 16);
  return MISSING_TEX;
}
function missingMaterial() {
  if (MISSING_MAT) return MISSING_MAT;
  MISSING_MAT = new THREE.MeshLambertMaterial({ map: missingTexture(), side: THREE.DoubleSide });
  return MISSING_MAT;
}

// ------------------------------------------------------------------ state ---
let S = null; // everything about the current world lives here; rebuilt each show()

function freshState() {
  return {
    active: false, rafId: 0, clock: new THREE.Clock(),
    scene: null, camera: null, renderer: null,
    voxels: null, blocks: null, blockByName: null,
    customBlockDefs: [], customItemDefs: [], mobTypes: new Map(),
    allGeo: null, allAnims: null,
    chunkMeshes: [], materials: new Map(),
    flowerMesh: null, waterMesh: null, highlightBox: null,
    sunSprite: null, moonSprite: null, sunLight: null, hemiLight: null, skyMesh: null,
    dayTime: 0.28,
    player: null, keys: {}, yaw: 0, pitch: 0,
    pointerLocked: false, mode: 'creative',
    mobs: [], nextMobId: 1,
    hotbar: [], selected: 0,
    runtimeIssues: [], firstMobSpawned: false,
    worldBuilt: false, needsRescan: false,
    joy: { active: false, id: null, dx: 0, dy: 0 }, look: { active: false, id: null },
    fps: 60, fpsAcc: 0, fpsN: 0,
    domMobBars: new Map()
  };
}

function logRuntime(path, level, title, detail, fix) {
  S.runtimeIssues.push({ path: path || '(project)', level, title, detail, fix: fix || '' });
}

// -------------------------------------------------------------------- DOM ---
let dom = null;

function buildDOM(root) {
  if (!cssInjected) { document.head.appendChild(el('style', { text: CSS })); cssInjected = true; }
  if (isTouch) document.body.classList.add('tw-is-touch');

  const canvas = el('canvas.tw-canvas', { tabIndex: 0 });
  const crosshair = el('div.tw-crosshair');
  const healthFill = el('div.tw-bar-fill');
  const hungerFill = el('div.tw-bar-fill');
  const bars = el('div.tw-bars', {}, [
    el('div.tw-bar.tw-health', {}, [healthFill]),
    el('div.tw-bar.tw-hunger', {}, [hungerFill])
  ]);
  const hotbar = el('div.tw-hotbar');
  const mobbars = el('div.tw-mobbars');
  const floaters = el('div.tw-floaters', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 6 } });
  const cmdInput = el('input.field', { type: 'text', placeholder: '/summon mypack:blobby', autocomplete: 'off' });
  const cmdSuggest = el('div.tw-cmdsuggest');
  const cmdBar = el('div.tw-cmdbar', {}, [cmdInput, cmdSuggest]);
  const cmdBtn = el('button.iconbtn.tw-cmdbtn', { type: 'button', text: '/', title: 'Type a command', 'data-hint': 'Open the command bar — try /help.' });
  const deathScreen = el('div.tw-death', {}, [
    el('h2', { text: 'You died!' }),
    el('button.btn.good.big', { type: 'button', text: '🔁 Respawn', on: { click: () => respawn() } })
  ]);

  const joy = el('div.tw-joy.tw-mobile', {}, [el('div.tw-joy-knob')]);
  const look = el('div.tw-lookzone.tw-mobile');
  const btnJump = el('button.tw-mbtn.tw-btn-jump.tw-mobile', { type: 'button', text: '⤒' });
  const btnUse = el('button.tw-mbtn.tw-btn-use.tw-mobile', { type: 'button', text: '✋' });
  const btnBreak = el('button.tw-mbtn.tw-btn-break.tw-mobile', { type: 'button', text: '⛏' });

  const stage = el('div.tw-stage', {}, [
    canvas, crosshair, bars, hotbar, mobbars, floaters, cmdBar, cmdBtn, deathScreen,
    joy, look, btnJump, btnUse, btnBreak
  ]);

  const fps = el('span.tw-fps', { text: '60 FPS' });
  const logBadge = el('span.tw-count', { text: '0' });
  const btnLog = el('button.btn.tiny.ghost.tw-badge', { type: 'button', 'data-hint': 'Shows every mistake in your files — and how to fix it.' }, [
    el('span', { text: '📋 Content Log' }), logBadge
  ]);
  const topbar = el('div.tw-topbar', {}, [
    el('button.btn.tiny.primary', { type: 'button', text: '👾 Summon my mob', 'data-hint': 'Puts your custom mob in the world in front of you.', on: { click: () => summonMyMob() } }),
    el('button.btn.tiny', { type: 'button', text: '🎒 Give me my stuff', 'data-hint': 'Fills your hotbar with everything you made.', on: { click: () => { buildHotbar(); renderHotbar(); toast('Here is your stuff!', 'good'); } } }),
    el('button.btn.tiny', { type: 'button', text: '🌗 Day/Night', 'data-hint': 'Jumps to the other time of day.', on: { click: () => toggleDayNight() } }),
    el('button.btn.tiny', { type: 'button', text: '💀 Respawn', 'data-hint': 'Puts you back at full health.', on: { click: () => respawn() } }),
    el('button.btn.tiny', { type: 'button', text: '🔁 Rebuild world', 'data-hint': 'Makes a brand new island.', on: { click: () => rebuildWorld() } }),
    btnLog,
    fps
  ]);

  const logPanel = el('div.tw-log-panel');
  btnLog.addEventListener('click', () => { logPanel.classList.toggle('on'); });

  const wrap = el('div.tw-wrap', {}, [topbar, stage, logPanel]);
  root.appendChild(wrap);

  dom = { canvas, crosshair, healthFill, hungerFill, hotbar, mobbars, floaters, cmdInput, cmdSuggest, cmdBar, cmdBtn, deathScreen, fps, logPanel, logBadge, joy, joyKnob: joy.firstChild, look, btnJump, btnUse, btnBreak, stage };
  wireInput();
}

// ------------------------------------------------------------------ input ---
function wireInput() {
  const { canvas, cmdInput, cmdBar, cmdBtn, joy, joyKnob, look, btnJump, btnUse, btnBreak } = dom;

  canvas.addEventListener('click', () => {
    if (!S || !S.active || isTouch) return;
    if (dom.cmdBar.classList.contains('on')) return;
    canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => { if (S) S.pointerLocked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', e => {
    if (!S || !S.active || !S.pointerLocked) return;
    S.yaw -= e.movementX * 0.0022;
    S.pitch = clamp(S.pitch - e.movementY * 0.0022, -1.5, 1.5);
  });
  canvas.addEventListener('mousedown', e => {
    if (!S || !S.active) return;
    if (e.button === 0) doBreakAction();
    else if (e.button === 2) doUseAction();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (!S || !S.active) return;
    e.preventDefault();
    S.selected = (S.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    renderHotbar();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (!S || !S.active) return;
    if (document.activeElement === cmdInput) {
      if (e.key === 'Escape') closeCmdBar();
      return;
    }
    if (e.key === '/') { e.preventDefault(); openCmdBar(); return; }
    S.keys[e.code] = true;
    if (e.code >= 'Digit1' && e.code <= 'Digit9') { S.selected = e.code.charCodeAt(5) - 49; renderHotbar(); }
  });
  document.addEventListener('keyup', e => { if (S) S.keys[e.code] = false; });

  cmdInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { runCommand(cmdInput.value); cmdInput.value = ''; closeCmdBar(); }
    else if (e.key === 'Escape') closeCmdBar();
    else setTimeout(updateSuggest, 0);
  });
  cmdBtn.addEventListener('click', () => { dom.cmdBar.classList.contains('on') ? closeCmdBar() : openCmdBar(); });

  // hotbar clicks
  dom.hotbar.addEventListener('click', e => {
    const s = e.target.closest('.tw-slot'); if (!s) return;
    S.selected = parseInt(s.dataset.i, 10); renderHotbar();
  });

  // --------------------------------------------------------- mobile controls
  joy.addEventListener('pointerdown', e => {
    joy.setPointerCapture(e.pointerId);
    S.joy.active = true; S.joy.id = e.pointerId; S.joy.baseX = e.clientX; S.joy.baseY = e.clientY; S.joy.dx = 0; S.joy.dy = 0;
  });
  joy.addEventListener('pointermove', e => {
    if (!S.joy.active || e.pointerId !== S.joy.id) return;
    const r = 40;
    let dx = e.clientX - S.joy.baseX, dy = e.clientY - S.joy.baseY;
    const d = Math.hypot(dx, dy); if (d > r) { dx = dx / d * r; dy = dy / d * r; }
    S.joy.dx = dx / r; S.joy.dy = dy / r;
    joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const joyEnd = e => { if (e.pointerId !== S.joy.id) return; S.joy.active = false; S.joy.dx = 0; S.joy.dy = 0; joyKnob.style.transform = ''; };
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

  look.addEventListener('pointerdown', e => { look.setPointerCapture(e.pointerId); S.look.active = true; S.look.id = e.pointerId; S.look.lx = e.clientX; S.look.ly = e.clientY; });
  look.addEventListener('pointermove', e => {
    if (!S.look.active || e.pointerId !== S.look.id) return;
    const dx = e.clientX - S.look.lx, dy = e.clientY - S.look.ly;
    S.look.lx = e.clientX; S.look.ly = e.clientY;
    S.yaw -= dx * 0.0044; S.pitch = clamp(S.pitch - dy * 0.0044, -1.5, 1.5);
  });
  const lookEnd = e => { if (e.pointerId === S.look.id) S.look.active = false; };
  look.addEventListener('pointerup', lookEnd); look.addEventListener('pointercancel', lookEnd);

  btnJump.addEventListener('pointerdown', () => { S.keys['Space'] = true; });
  btnJump.addEventListener('pointerup', () => { S.keys['Space'] = false; });
  btnJump.addEventListener('pointercancel', () => { S.keys['Space'] = false; });
  btnUse.addEventListener('pointerdown', e => { e.preventDefault(); doUseAction(); });
  btnBreak.addEventListener('pointerdown', e => { e.preventDefault(); doBreakAction(); });

  window.addEventListener('resize', onResize);
}

function openCmdBar() {
  if (S.pointerLocked) document.exitPointerLock();
  dom.cmdBar.classList.add('on');
  dom.cmdInput.value = '/';
  setTimeout(() => { dom.cmdInput.focus(); dom.cmdInput.setSelectionRange(1, 1); }, 20);
  updateSuggest();
}
function closeCmdBar() { dom.cmdBar.classList.remove('on'); dom.cmdInput.blur(); dom.cmdSuggest.innerHTML = ''; }

function updateSuggest() {
  const v = dom.cmdInput.value;
  const parts = v.split(/\s+/);
  dom.cmdSuggest.innerHTML = '';
  let pool = null;
  if (/^\/summon$/i.test(parts[0]) && parts.length <= 2) pool = [...S.mobTypes.keys()];
  else if (/^\/give$/i.test(parts[0]) && parts.length <= 2) pool = [...S.customItemDefs.map(i => i.identifier), ...S.customBlockDefs.map(b => b.identifier)];
  else if (/^\/setblock$/i.test(parts[0]) && parts.length === 5) pool = [...S.blockByName.keys()].filter(k => k.includes(':'));
  if (!pool) return;
  const frag = parts[parts.length - 1] || '';
  const matches = pool.filter(id => id.toLowerCase().includes(frag.toLowerCase())).slice(0, 8);
  for (const m of matches) {
    dom.cmdSuggest.appendChild(el('span', {
      text: m, on: { click: () => { parts[parts.length - 1] = m; dom.cmdInput.value = parts.join(' ') + ' '; dom.cmdInput.focus(); updateSuggest(); } }
    }));
  }
}

function onResize() {
  if (!S || !S.renderer || !dom) return;
  const w = dom.stage.clientWidth, h = dom.stage.clientHeight;
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / (h || 1);
  S.camera.updateProjectionMatrix();
}

// ------------------------------------------------------------- project scan --
function scanCustomBlocks() {
  const terrain = fs.readJSON('RP/textures/terrain_texture.json');
  const out = [];
  for (const p of fs.findAll('BP/blocks/*.json')) {
    const j = fs.readJSON(p); const b = j && j['minecraft:block']; if (!b) continue;
    const id = b.description && b.description.identifier; if (!id) continue;
    const mi = b.components && b.components['minecraft:material_instances'];
    let texKey = null;
    if (mi) { const inst = mi['*'] || Object.values(mi)[0]; texKey = inst && inst.texture; }
    let pngPath = null;
    if (texKey && terrain && terrain.texture_data && terrain.texture_data[texKey]) {
      const entry = terrain.texture_data[texKey];
      const t = Array.isArray(entry.textures) ? entry.textures[0] : entry.textures;
      if (t) pngPath = 'RP/' + t + '.png';
    }
    if (texKey && !pngPath) logRuntime(p, 'error', 'Block picture not found', `"${id}" wants texture "${texKey}" but it is not registered or the file is missing.`, 'Check RP/textures/terrain_texture.json and paint the picture in Paint.');
    out.push({ identifier: id, path: p, pngPath, displayName: titleCase(id.split(':')[1] || id) });
  }
  return out;
}
function scanCustomItems() {
  const itemTex = fs.readJSON('RP/textures/item_texture.json');
  const out = [];
  for (const p of fs.findAll('BP/items/*.json')) {
    const j = fs.readJSON(p); const it = j && j['minecraft:item']; if (!it) continue;
    const id = it.description && it.description.identifier; if (!id) continue;
    const comps = it.components || {};
    const icon = comps['minecraft:icon'];
    const iconKey = typeof icon === 'string' ? icon : (icon && (icon.texture || icon.textures));
    let pngPath = null;
    if (iconKey && itemTex && itemTex.texture_data && itemTex.texture_data[iconKey]) {
      const entry = itemTex.texture_data[iconKey];
      const t = Array.isArray(entry.textures) ? entry.textures[0] : entry.textures;
      if (t) pngPath = 'RP/' + t + '.png';
    }
    if (iconKey && !pngPath) logRuntime(p, 'error', 'Item picture not found', `"${id}" wants icon "${iconKey}" but it is not registered or the file is missing.`, 'Check RP/textures/item_texture.json and paint the picture in Paint.');
    const food = comps['minecraft:food'];
    const dmg = comps['minecraft:damage'];
    out.push({
      identifier: id, path: p, pngPath,
      displayName: (comps['minecraft:display_name'] && comps['minecraft:display_name'].value) || titleCase(id.split(':')[1] || id),
      food: food ? { nutrition: food.nutrition ?? 4 } : null,
      damage: dmg ? (dmg.value ?? 6) : null
    });
  }
  return out;
}

function findGeoByIdentifier(name) {
  if (!name) return null;
  for (const [, models] of S.allGeo) for (const g of models) if (g.identifier === name) return g;
  return null;
}
function findAnimByIdentifier(name) {
  if (!name) return null;
  for (const [, anims] of S.allAnims) if (anims[name]) return anims[name];
  return null;
}

const KNOWN_COMPS = new Set([
  'minecraft:health', 'minecraft:movement', 'minecraft:scale', 'minecraft:collision_box', 'minecraft:physics',
  'minecraft:float', 'minecraft:fire_immune', 'minecraft:is_baby', 'minecraft:attack', 'minecraft:loot',
  'minecraft:behavior.random_stroll', 'minecraft:behavior.look_at_player', 'minecraft:behavior.panic',
  'minecraft:behavior.melee_attack', 'minecraft:behavior.nearest_attackable_target', 'minecraft:behavior.random_fly',
  'minecraft:movement.fly', 'minecraft:movement.basic', 'minecraft:navigation.walk', 'minecraft:navigation.fly',
  'minecraft:navigation.swim', 'minecraft:jump.static', 'minecraft:pushable', 'minecraft:nameable',
  'minecraft:despawn', 'minecraft:type_family', 'minecraft:persistent', 'minecraft:behavior.random_look_around',
  'minecraft:knockback_resistance', 'minecraft:can_climb'
]);

async function scanMobTypes() {
  S.allGeo = new Map(); S.allAnims = new Map();
  for (const p of fs.findAll('RP/models/**/*.json')) { const j = fs.readJSON(p); if (j) S.allGeo.set(p, parseGeoFile(j)); }
  for (const p of fs.findAll('RP/animations/*.json')) { const j = fs.readJSON(p); if (j) S.allAnims.set(p, parseAnimFile(j)); }

  const rpFiles = fs.findAll('RP/entity/*.json');
  const rpParsed = rpFiles.map(p => ({ p, d: (fs.readJSON(p) || {})['minecraft:client_entity'] })).filter(x => x.d);

  const types = new Map();
  for (const bp of fs.findAll('BP/entities/*.json')) {
    const j = fs.readJSON(bp); const e = j && j['minecraft:entity']; if (!e) continue;
    const id = e.description && e.description.identifier; if (!id) continue;
    const comps = e.components || {};
    const match = rpParsed.find(x => x.d.description && x.d.description.identifier === id);
    const type = { id, bpPath: bp, comps, rpPath: match ? match.p : null, rpDesc: match ? match.d.description : null };
    await resolveMobType(type);
    types.set(id, type);
  }
  S.mobTypes = types;
}

async function resolveMobType(type) {
  const c = type.comps;
  if (!type.rpDesc) { logRuntime(type.bpPath, 'error', 'Mob has no look', `"${type.id}" has no matching RP/entity file.`, 'It will show as a missing-texture cube here.'); }

  let material = null, missingGeo = false, missingTex = false, geoParsed = null;
  if (type.rpDesc) {
    const geoName = type.rpDesc.geometry && type.rpDesc.geometry.default;
    geoParsed = findGeoByIdentifier(geoName);
    if (!geoParsed) { missingGeo = true; logRuntime(type.rpPath, 'error', 'Model not found', `"${geoName}" is not in any RP/models file.`, 'Build it in the Model tool, or fix the name.'); }
    const texRel = type.rpDesc.textures && type.rpDesc.textures.default;
    const texPath = texRel ? 'RP/' + String(texRel).replace(/^\/*/, '') + '.png' : null;
    if (texPath && fs.exists(texPath)) {
      try { const img = await fs.image(texPath); material = makeMaterial(makeTexture(img)); }
      catch (e) { missingTex = true; }
    } else missingTex = true;
    if (missingTex) {
      material = missingMaterial();
      if (texRel) logRuntime(type.rpPath, 'error', 'Texture not found', `"${texRel}" -> ${texPath} does not exist.`, 'Paint it in the Paint tool.');
    }
  } else material = missingMaterial();

  const shortAnimMap = {};
  if (type.rpDesc && type.rpDesc.animations) {
    for (const [key, animId] of Object.entries(type.rpDesc.animations)) {
      const found = findAnimByIdentifier(animId);
      shortAnimMap[key] = found || null;
      if (!found) logRuntime(type.rpPath, 'warn', 'Animation not found', `"${animId}" for "${key}" was not found in RP/animations.`, 'Make it in the Animate tool, or fix the name.');
    }
  }
  const scriptsAnimate = type.rpDesc && type.rpDesc.scripts && type.rpDesc.scripts.animate;
  if (scriptsAnimate) for (const s of scriptsAnimate) {
    const k = typeof s === 'string' ? s : Object.keys(s)[0];
    if (!(k in shortAnimMap)) logRuntime(type.rpPath, 'warn', 'Animation is not listed', `scripts.animate runs "${k}" but it is not in the animations list.`, 'Add it to "animations" in the RP entity file first.');
  }

  Object.assign(type, { geoParsed, material, missingGeo, missingTex, shortAnimMap, scriptsAnimate });

  const health = c['minecraft:health']; type.maxHp = health ? (health.max ?? health.value ?? 20) : 20;
  const move = c['minecraft:movement']; type.speed = move ? Math.max(0.4, (move.value || 0.25) * 6) : 1.5;
  const scale = c['minecraft:scale']; type.scale = scale ? (scale.value || 1) : 1;
  if (c['minecraft:is_baby']) type.scale *= 0.5;
  const cb = c['minecraft:collision_box']; type.collW = cb ? cb.width : 0.6; type.collH = cb ? cb.height : 1.0;
  type.hasPhysics = !!c['minecraft:physics'];
  type.floats = !!c['minecraft:float'];
  const attack = c['minecraft:attack']; type.attackDamage = attack ? (attack.damage ?? 3) : 0;
  type.canMelee = !!c['minecraft:behavior.melee_attack'];
  type.targetsPlayer = !!c['minecraft:behavior.nearest_attackable_target'];
  type.hostile = type.canMelee && type.targetsPlayer;
  const nat = c['minecraft:behavior.nearest_attackable_target']; type.aggroRadius = nat ? (nat.within_radius ?? 16) : 16;
  type.canPanic = !!c['minecraft:behavior.panic'];
  type.canLook = !!c['minecraft:behavior.look_at_player'];
  type.flies = !!(c['minecraft:behavior.random_fly'] || c['minecraft:movement.fly']);
  const rf = c['minecraft:behavior.random_fly']; type.flyXZ = rf ? (rf.xz_dist ?? 10) : 10; type.flyY = rf ? (rf.y_dist ?? 5) : 5;
  const loot = c['minecraft:loot']; type.lootTablePath = loot && loot.table ? ('BP/' + loot.table) : null;
  if (type.lootTablePath && !fs.exists(type.lootTablePath)) logRuntime(type.bpPath, 'warn', 'Loot table missing', `"${type.lootTablePath}" was not found.`, 'Make it in the Files tool, or remove minecraft:loot.');

  for (const key of Object.keys(c)) {
    if (KNOWN_COMPS.has(key)) continue;
    if (!key.startsWith('minecraft:')) continue;
    logRuntime(type.bpPath, 'tip', 'Not simulated here', `"${key}" on "${type.id}" is not acted on by the test world.`, 'It will still be in your real add-on — this is just an approximation.');
  }
}

// ---------------------------------------------------------------- terrain ---
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123; return s - Math.floor(s); }
function smoothT(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const v00 = hash2(xi, zi), v10 = hash2(xi + 1, zi), v01 = hash2(xi, zi + 1), v11 = hash2(xi + 1, zi + 1);
  const u = smoothT(xf), v = smoothT(zf);
  return v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v;
}
function fbm(x, z) { return valueNoise(x * 0.09, z * 0.09) * 0.65 + valueNoise(x * 0.22, z * 0.22) * 0.25 + valueNoise(x * 0.5, z * 0.5) * 0.1; }

const CX = WORLD_SIZE / 2, CZ = WORLD_SIZE / 2, RADIUS = WORLD_SIZE * 0.42;
function heightAt(x, z) {
  const dx = x - CX, dz = z - CZ, d = Math.sqrt(dx * dx + dz * dz);
  const falloff = 1 - smoothT(clamp((d - RADIUS * 0.45) / (RADIUS * 0.55), 0, 1));
  const n = fbm(x, z);
  let h = SEA_LEVEL + Math.round(n * 7 * falloff);
  if (d > RADIUS) h = Math.max(1, SEA_LEVEL - Math.round((d - RADIUS) / 2) - 1);
  return clamp(h, 1, WORLD_H - 5);
}

function IDX(x, y, z) { return x + WORLD_SIZE * (z + WORLD_SIZE * y); }
function inBounds(x, y, z) { return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_H && z >= 0 && z < WORLD_SIZE; }
function blockAt(x, y, z) { if (!inBounds(x, y, z)) return BLOCK.AIR; return S.voxels[IDX(x, y, z)]; }
function isSolid(x, y, z) { const id = blockAt(x, y, z); const def = S.blocks[id]; return !!(def && def.solid); }
function setVoxel(x, y, z, id, onlyIfEmptyish) {
  if (!inBounds(x, y, z)) return;
  if (onlyIfEmptyish) { const cur = S.voxels[IDX(x, y, z)]; if (cur !== BLOCK.AIR && cur !== BLOCK.LEAVES) return; }
  S.voxels[IDX(x, y, z)] = id;
}
function getSurfaceY(x, z) {
  x = clamp(Math.round(x), 0, WORLD_SIZE - 1); z = clamp(Math.round(z), 0, WORLD_SIZE - 1);
  for (let y = WORLD_H - 1; y >= 0; y--) if (isSolid(x, y, z)) return y + 1;
  return 1;
}

function generateVoxels() {
  S.voxels = new Uint8Array(WORLD_SIZE * WORLD_SIZE * WORLD_H);
  for (let x = 0; x < WORLD_SIZE; x++) for (let z = 0; z < WORLD_SIZE; z++) {
    const h = heightAt(x, z);
    for (let y = 0; y < h; y++) {
      let id = BLOCK.STONE;
      if (y === h - 1) id = BLOCK.GRASS; else if (y >= h - 3) id = BLOCK.DIRT;
      S.voxels[IDX(x, y, z)] = id;
    }
  }
  // trees
  const trees = [];
  let tries = 0;
  while (trees.length < 11 && tries < 400) {
    tries++;
    const x = 4 + Math.floor(Math.random() * (WORLD_SIZE - 8)), z = 4 + Math.floor(Math.random() * (WORLD_SIZE - 8));
    const dx = x - CX, dz = z - CZ; if (Math.hypot(dx, dz) > RADIUS * 0.62) continue;
    const h = heightAt(x, z); if (h < SEA_LEVEL + 1) continue;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z });
    plantTree(x, h, z);
  }
  // rocks: a few surface knobs
  for (let i = 0; i < 6; i++) {
    const x = 3 + Math.floor(Math.random() * (WORLD_SIZE - 6)), z = 3 + Math.floor(Math.random() * (WORLD_SIZE - 6));
    const h = heightAt(x, z); if (h < 2) continue;
    setVoxel(x, h - 1, z, BLOCK.STONE);
    if (Math.random() < 0.6) setVoxel(x, h, z, BLOCK.STONE);
  }
  // flowers (decorative, non-voxel)
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(Math.random() * WORLD_SIZE), z = Math.floor(Math.random() * WORLD_SIZE);
    const h = heightAt(x, z);
    if (h < SEA_LEVEL + 1 || blockAt(x, h - 1, z) !== BLOCK.GRASS) continue;
    spots.push({ x: x + 0.5, y: h, z: z + 0.5 });
  }
  return spots;
}
function plantTree(x, h, z) {
  const trunk = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < trunk; i++) setVoxel(x, h + i, z, BLOCK.WOOD);
  const topY = h + trunk - 1;
  for (let ddx = -2; ddx <= 2; ddx++) for (let ddz = -2; ddz <= 2; ddz++) {
    if (Math.abs(ddx) + Math.abs(ddz) > 3) continue;
    for (let dy = -1; dy <= 1; dy++) {
      if (ddx === 0 && ddz === 0 && dy < 1) continue;
      if (Math.random() > 0.82) continue;
      setVoxel(x + ddx, topY + dy, z + ddz, BLOCK.LEAVES, true);
    }
  }
}

// ------------------------------------------------------------ block registry
function buildBlockRegistry() {
  const arr = [];
  arr[BLOCK.AIR] = { name: 'air', solid: false };
  arr[BLOCK.GRASS] = { name: 'grass', solid: true, faces: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } };
  arr[BLOCK.DIRT] = { name: 'dirt', solid: true, all: 'dirt' };
  arr[BLOCK.STONE] = { name: 'stone', solid: true, all: 'stone' };
  arr[BLOCK.WOOD] = { name: 'wood', solid: true, faces: { top: 'wood_top', side: 'wood_side', bottom: 'wood_top' } };
  arr[BLOCK.LEAVES] = { name: 'leaves', solid: true, all: 'leaves' };
  const byName = new Map(); arr.forEach((d, i) => d && byName.set(d.name, i));
  let nid = 20;
  for (const cb of S.customBlockDefs) {
    const id = nid++;
    arr[id] = { name: cb.identifier, solid: true, all: 'block:' + cb.identifier, custom: true, def: cb };
    byName.set(cb.identifier, id);
  }
  S.blocks = arr; S.blockByName = byName;
}

async function buildMaterials() {
  const mats = new Map();
  for (const key of ['grass_top', 'grass_side', 'dirt', 'stone', 'wood_top', 'wood_side', 'leaves']) {
    mats.set(key, new THREE.MeshLambertMaterial({ map: canvasTex(DRAW[key], 16), side: THREE.DoubleSide }));
  }
  mats.set('missing', missingMaterial());
  for (const cb of S.customBlockDefs) {
    const key = 'block:' + cb.identifier;
    if (cb.pngPath && fs.exists(cb.pngPath)) {
      try { const img = await fs.image(cb.pngPath); mats.set(key, makeMaterial(makeTexture(img))); }
      catch (e) { mats.set(key, mats.get('missing')); }
    } else mats.set(key, mats.get('missing'));
  }
  S.materials = mats;
}

// -------------------------------------------------------------- chunk mesh --
const FACE_DEFS = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], name: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]], name: 'side' },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], name: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], name: 'bottom' },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]], name: 'side' },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], name: 'side' }
];
function matKeyFor(def, faceName) { return def.faces ? def.faces[faceName] : def.all; }
function pushAll(dst, src) { for (let i = 0; i < src.length; i++) dst.push(src[i]); }

function buildChunkMesh(cx) {
  const x0 = cx * CHUNK_W, x1 = Math.min(WORLD_SIZE, x0 + CHUNK_W);
  const buckets = new Map();
  const bucket = key => { if (!buckets.has(key)) buckets.set(key, { pos: [], norm: [], uv: [], idx: [], vc: 0 }); return buckets.get(key); };

  for (let x = x0; x < x1; x++) for (let z = 0; z < WORLD_SIZE; z++) for (let y = 0; y < WORLD_H; y++) {
    const id = blockAt(x, y, z); const def = S.blocks[id]; if (!def || !def.solid) continue;
    for (const f of FACE_DEFS) {
      const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
      if (isSolid(nx, ny, nz)) continue;
      const key = matKeyFor(def, f.name) || 'missing';
      const bu = bucket(key);
      const vi = bu.vc;
      for (const co of f.corners) { bu.pos.push(x + co[0], y + co[1], z + co[2]); bu.norm.push(f.dir[0], f.dir[1], f.dir[2]); }
      bu.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      bu.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      bu.vc += 4;
    }
  }

  if (!buckets.size) return null;
  const geom = new THREE.BufferGeometry();
  const allPos = [], allNorm = [], allUV = [], allIdx = [], materials = [], groups = [];
  let vOffset = 0, iOffset = 0;
  for (const [key, bu] of buckets) {
    pushAll(allPos, bu.pos); pushAll(allNorm, bu.norm); pushAll(allUV, bu.uv);
    for (let i = 0; i < bu.idx.length; i++) allIdx.push(bu.idx[i] + vOffset);
    groups.push({ start: iOffset, count: bu.idx.length, mi: materials.length });
    materials.push(S.materials.get(key) || S.materials.get('missing'));
    vOffset += bu.vc; iOffset += bu.idx.length;
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(allNorm, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(allUV, 2));
  geom.setIndex(allIdx);
  for (const g of groups) geom.addGroup(g.start, g.count, g.mi);
  const mesh = new THREE.Mesh(geom, materials);
  mesh.userData.chunk = cx;
  return mesh;
}

function rebuildChunk(cx) {
  if (cx < 0 || cx >= N_CHUNKS) return;
  const old = S.chunkMeshes[cx];
  if (old) { S.scene.remove(old); old.geometry.dispose(); }
  const mesh = buildChunkMesh(cx);
  S.chunkMeshes[cx] = mesh;
  if (mesh) S.scene.add(mesh);
}
function rebuildAllChunks() { for (let cx = 0; cx < N_CHUNKS; cx++) rebuildChunk(cx); }
function rebuildChunksNear(x) {
  const cx = clamp(Math.floor(x / CHUNK_W), 0, N_CHUNKS - 1);
  rebuildChunk(cx);
  const localX = x - cx * CHUNK_W;
  if (localX === 0 && cx > 0) rebuildChunk(cx - 1);
  if (localX === CHUNK_W - 1 && cx < N_CHUNKS - 1) rebuildChunk(cx + 1);
}

function buildFlowers(spots) {
  if (S.flowerMesh) { S.scene.remove(S.flowerMesh); S.flowerMesh.geometry.dispose(); }
  if (!spots.length) return;
  const tex = canvasTex(DRAW.flower, 16);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .1, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(0.7, 0.7);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((s, i) => {
    m.makeRotationY(Math.random() * Math.PI);
    m.setPosition(s.x, s.y + 0.35, s.z);
    inst.setMatrixAt(i, m);
    const m2 = new THREE.Matrix4().makeRotationY(Math.PI / 2 + Math.random() * Math.PI);
    m2.setPosition(s.x, s.y + 0.35, s.z);
  });
  S.flowerMesh = inst;
  S.scene.add(inst);
}
function buildWater() {
  if (S.waterMesh) { S.scene.remove(S.waterMesh); }
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ map: canvasTex(DRAW.water, 16), transparent: true, opacity: 0.75 });
  mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(24, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(CX, SEA_LEVEL - 0.15, CZ);
  S.waterMesh = mesh; S.scene.add(mesh);
}

// ----------------------------------------------------------------- sky/sun --
function buildSky() {
  const geo = new THREE.SphereGeometry(300, 16, 12);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  S.skyMesh = mesh; S.scene.add(mesh);

  // Lights first: updateSkyColors() tints them, and it runs before this function returns.
  S.hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a3020, 0.7);
  S.scene.add(S.hemiLight);
  S.sunLight = new THREE.DirectionalLight(0xffffff, 1);
  S.scene.add(S.sunLight);
  S.scene.add(S.sunLight.target);
  updateSkyColors(true);

  const sunTex = canvasTex((x, size) => {
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.5, 'rgba(255,230,140,.8)'); g.addColorStop(1, 'rgba(255,230,140,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  }, 64);
  const moonTex = canvasTex((x, size) => {
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(220,230,255,1)'); g.addColorStop(0.6, 'rgba(200,210,240,.6)'); g.addColorStop(1, 'rgba(200,210,240,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  }, 64);
  S.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, depthWrite: false }));
  S.sunSprite.scale.set(40, 40, 1);
  S.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false }));
  S.moonSprite.scale.set(28, 28, 1);
  S.scene.add(S.sunSprite, S.moonSprite);
}
function skyPhase() {
  // 0..1 where 0=midnight,0.5=noon
  return S.dayTime;
}
function skyColorsFor(t) {
  const day = new THREE.Color(0x6fb0ff), sunset = new THREE.Color(0xff9a5a), night = new THREE.Color(0x0a1024);
  const horizonDay = new THREE.Color(0xbfe0ff), horizonSunset = new THREE.Color(0xffd39a), horizonNight = new THREE.Color(0x141a30);
  const sunAngle = Math.sin(t * Math.PI * 2 - Math.PI / 2); // -1 at midnight, +1 at noon
  const dayAmt = clamp((sunAngle + 0.15) / 0.35, 0, 1);
  const sunsetAmt = clamp(1 - Math.abs(sunAngle) / 0.3, 0, 1) * (1 - dayAmt * 0.4);
  let top = night.clone().lerp(day, dayAmt);
  let hor = horizonNight.clone().lerp(horizonDay, dayAmt);
  top = top.clone().lerp(sunset, sunsetAmt * 0.5);
  hor = hor.clone().lerp(horizonSunset, sunsetAmt);
  return { top, hor, dayAmt, sunAngle };
}
let lastSkyUpdate = -10;
function updateSkyColors(force) {
  const t = skyPhase();
  if (!force && Math.abs(t - lastSkyUpdate) < 0.01) return;
  lastSkyUpdate = t;
  const { top, hor, dayAmt } = skyColorsFor(t);
  const pos = S.skyMesh.geometry.attributes.position;
  const col = S.skyMesh.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 300;
    const f = clamp(y * 0.9 + 0.15, 0, 1);
    const c = hor.clone().lerp(top, f);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  S.scene.fog = new THREE.Fog(hor.getHex(), 40, 130);
  S.renderer.setClearColor(hor.getHex());
  S.hemiLight.intensity = 0.35 + dayAmt * 0.55;
  S.sunLight.intensity = 0.15 + dayAmt * 1.1;
  S.sunLight.color.set(dayAmt > 0.5 ? 0xffffff : 0xffb070);
}
function updateSunMoon() {
  const t = skyPhase();
  const ang = t * Math.PI * 2 - Math.PI / 2;
  const R = 200;
  const px = S.player ? S.player.x : CX, pz = S.player ? S.player.z : CZ;
  S.sunSprite.position.set(px + Math.cos(ang) * R, Math.sin(ang) * R, pz);
  S.moonSprite.position.set(px - Math.cos(ang) * R, -Math.sin(ang) * R, pz);
  S.sunLight.position.copy(S.sunSprite.position);
  S.sunLight.target.position.set(px, 0, pz);
  S.sunLight.target.updateMatrixWorld();
}
function toggleDayNight() {
  S.dayTime = S.dayTime > 0.25 && S.dayTime < 0.75 ? 0.78 : 0.28;
  updateSkyColors(true);
  toast(S.dayTime < 0.5 ? '☀️ Day' : '🌙 Night', 'good', 1200);
}

// ------------------------------------------------------------------ player --
function resetPlayer() {
  const sx = CX + 0.5, sz = CZ + 0.5;
  S.player = {
    x: sx, y: getSurfaceY(sx, sz) + 0.05, z: sz,
    vx: 0, vy: 0, vz: 0, onGround: false, crouching: false,
    hp: 20, maxHp: 20, hunger: 10, maxHunger: 10, hungerTimer: 0, invuln: 0, alive: true
  };
  S.yaw = 0; S.pitch = 0;
  dom.deathScreen.classList.remove('on');
}
function respawn() {
  resetPlayer();
  toast('Respawned!', 'good', 1200);
  dom.deathScreen.classList.remove('on');
}
function collidesAt(px, py, pz, hw, h) {
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - 1e-6);
  const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-6);
  const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - 1e-6);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (isSolid(x, y, z)) return true;
  return false;
}
function sweepAxis(base, delta, test) {
  if (delta === 0) return { value: base, hit: false };
  if (!test(base + delta)) return { value: base + delta, hit: false };
  let lo = 0, hi = delta;
  for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (test(base + mid)) hi = mid; else lo = mid; }
  return { value: base + lo, hit: true };
}
function updatePlayer(dt) {
  const p = S.player; if (!p.alive) return;
  p.crouching = !!S.keys['ShiftLeft'] || !!S.keys['ShiftRight'];
  const h = p.crouching ? PLAYER_H_CROUCH : PLAYER_H;

  let ix = 0, iz = 0;
  if (isTouch) { ix = S.joy.dx; iz = S.joy.dy; }
  else {
    if (S.keys['KeyW']) iz -= 1; if (S.keys['KeyS']) iz += 1;
    if (S.keys['KeyA']) ix -= 1; if (S.keys['KeyD']) ix += 1;
  }
  const im = Math.hypot(ix, iz);
  if (im > 1) { ix /= im; iz /= im; }
  const forward = { x: -Math.sin(S.yaw), z: -Math.cos(S.yaw) };
  const right = { x: Math.cos(S.yaw), z: -Math.sin(S.yaw) };
  let wx = forward.x * -iz + right.x * ix, wz = forward.z * -iz + right.z * ix;
  const wl = Math.hypot(wx, wz); if (wl > 0.001) { wx /= wl; wz /= wl; }
  const speed = p.crouching ? CROUCH_SPEED : WALK_SPEED;
  const magnitude = isTouch ? Math.min(1, im) : (im > 0 ? 1 : 0);
  p.vx = wx * speed * magnitude;
  p.vz = wz * speed * magnitude;

  p.vy += GRAVITY * dt;
  if (p.vy < -40) p.vy = -40;
  if (S.keys['Space'] && p.onGround) { p.vy = JUMP_VEL; p.onGround = false; sfx.play('click'); }

  const dy = p.vy * dt;
  let r = sweepAxis(p.y, dy, v => collidesAt(p.x, v, p.z, PLAYER_HW, h));
  if (r.hit && dy < 0) { p.onGround = true; if (p.fallSpeed && p.fallSpeed > 12 && S.mode === 'survival') damagePlayer(Math.round((p.fallSpeed - 12) * 1.2)); p.fallSpeed = 0; }
  else if (r.hit) { /* head bump */ } else { p.onGround = false; p.fallSpeed = Math.max(p.fallSpeed || 0, -p.vy); }
  if (r.hit) p.vy = 0;
  p.y = r.value;

  r = sweepAxis(p.x, p.vx * dt, v => collidesAt(v, p.y, p.z, PLAYER_HW, h)); p.x = r.value; if (r.hit) p.vx = 0;
  r = sweepAxis(p.z, p.vz * dt, v => collidesAt(p.x, p.y, v, PLAYER_HW, h)); p.z = r.value; if (r.hit) p.vz = 0;

  if (p.y < -12) respawn();

  // hunger
  if (S.mode === 'survival') {
    p.hungerTimer += dt;
    if (p.hungerTimer > 18) { p.hungerTimer = 0; p.hunger = Math.max(0, p.hunger - 1); }
    if (p.hunger <= 0 && p.hp > 1) { p.invuln -= dt; if (p.invuln <= 0) { damagePlayer(1); p.invuln = 2; } }
  }
  if (p.invuln > 0) p.invuln -= dt;

  const eyeH = p.crouching ? EYE_H_CROUCH : EYE_H;
  S.camera.position.set(p.x, p.y + eyeH, p.z);
  S.camera.rotation.order = 'YXZ';
  S.camera.rotation.set(S.pitch, S.yaw, 0);
}
function damagePlayer(amount) {
  const p = S.player; if (!p.alive || S.mode === 'creative') return;
  p.hp = Math.max(0, p.hp - amount);
  sfx.play('bad');
  if (p.hp <= 0) { p.alive = false; dom.deathScreen.classList.add('on'); }
}

// -------------------------------------------------------------- raycasting --
const raycaster = new THREE.Raycaster();
raycaster.far = RAY_MAX;
function pickTarget() {
  raycaster.far = RAY_MAX;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), S.camera);
  const targets = [...S.chunkMeshes.filter(Boolean)];
  const mobObjs = S.mobs.filter(m => m.alive).map(m => m.missingVisual ? m.mesh : m.built.root);
  const hits = raycaster.intersectObjects([...targets, ...mobObjs], true);
  if (!hits.length) return null;
  const hit = hits[0];
  let obj = hit.object;
  if (obj.userData.mobId != null || (obj.parent && findMobIdAncestor(obj))) {
    const mobId = obj.userData.mobId != null ? obj.userData.mobId : findMobIdAncestor(obj);
    const mob = S.mobs.find(m => m.id === mobId);
    if (mob) return { kind: 'mob', mob, distance: hit.distance };
  }
  if (!hit.face) return null;
  const n = hit.face.normal.clone().transformDirection(obj.matrixWorld).round();
  const bp = hit.point.clone().addScaledVector(n, -0.5).floor();
  return { kind: 'block', x: bp.x, y: bp.y, z: bp.z, nx: n.x, ny: n.y, nz: n.z, distance: hit.distance };
}
function findMobIdAncestor(obj) {
  let o = obj;
  while (o) { if (o.userData && o.userData.mobId != null) return o.userData.mobId; o = o.parent; }
  return null;
}

// --------------------------------------------------------------- hotbar/inv -
function buildHotbar() {
  const slots = [];
  for (const cb of S.customBlockDefs) { if (slots.length >= 9) break; slots.push({ kind: 'block', blockId: S.blockByName.get(cb.identifier), label: cb.displayName, custom: true }); }
  for (const it of S.customItemDefs) { if (slots.length >= 9) break; slots.push({ kind: 'item', item: it, label: it.displayName, custom: true }); }
  if (S.customBlockDefs.length + S.customItemDefs.length > 9) logRuntime('', 'tip', 'More than 9 custom things', 'Only the first 9 fit on the hotbar.', 'Everything is still in your files — just switch which ones show if you need to.');
  const fillers = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES];
  for (const f of fillers) { if (slots.length >= 9) break; slots.push({ kind: 'block', blockId: f, label: S.blocks[f].name }); }
  while (slots.length < 9) slots.push(null);
  S.hotbar = slots; S.selected = 0;
}
function slotIconNode(slot) {
  if (!slot) return null;
  if (slot.kind === 'block') {
    const def = S.blocks[slot.blockId];
    const c = document.createElement('canvas'); c.width = c.height = 32;
    if (def.custom && def.def.pngPath && fs.exists(def.def.pngPath)) {
      const img = new Image(); img.src = fs.dataURL(def.def.pngPath);
      img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 32, 32); };
      return c;
    }
    const key = def.faces ? def.faces.top : def.all;
    (DRAW[key] || DRAW.stone)(c.getContext('2d'), 32);
    return c;
  }
  if (slot.item.pngPath && fs.exists(slot.item.pngPath)) {
    const img = el('img', { src: fs.dataURL(slot.item.pngPath) });
    return img;
  }
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#e800e8'; x.fillRect(0, 0, 16, 16); x.fillRect(16, 16, 16, 16);
  return c;
}
function renderHotbar() {
  dom.hotbar.innerHTML = '';
  S.hotbar.forEach((slot, i) => {
    const s = el('div.tw-slot' + (i === S.selected ? '.on' : ''), { 'data-i': i });
    s.appendChild(el('span.tw-slot-n', { text: String(i + 1) }));
    if (slot) {
      const icon = slotIconNode(slot); if (icon) s.appendChild(icon);
      s.appendChild(el('span.tw-slot-label', { text: slot.label }));
    }
    dom.hotbar.appendChild(s);
  });
}

// ----------------------------------------------------------- break / place --
let lastActionTime = 0;
function doBreakAction() {
  const now = performance.now();
  if (now - lastActionTime < 180) return;
  lastActionTime = now;
  const t = pickTarget();
  if (!t) return;
  if (t.kind === 'mob') { hitMob(t.mob); return; }
  if (t.y <= 0) return; // keep a floor
  breakBlock(t.x, t.y, t.z);
}
function breakBlock(x, y, z) {
  if (!isSolid(x, y, z)) return;
  S.voxels[IDX(x, y, z)] = BLOCK.AIR;
  rebuildChunksNear(x);
  sfx.play('hit');
  floatText('+1', x + 0.5, y + 0.5, z + 0.5);
}
function doUseAction() {
  const now = performance.now();
  if (now - lastActionTime < 150) return;
  lastActionTime = now;
  const slot = S.hotbar[S.selected];
  if (!slot) return;
  if (slot.kind === 'item' && slot.item.food) {
    S.player.hunger = Math.min(S.player.maxHunger, S.player.hunger + Math.max(1, Math.round(slot.item.food.nutrition / 2)));
    sfx.play('good');
    toast(`Yum! +${slot.item.food.nutrition} food`, 'good', 1600);
    return;
  }
  if (slot.kind === 'block') {
    const t = pickTarget();
    if (!t || t.kind !== 'block') return;
    const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
    if (!inBounds(px, py, pz) || isSolid(px, py, pz)) return;
    const within = (px + 0.5 - S.player.x) ** 2 + (pz + 0.5 - S.player.z) ** 2 < 0.5 && py >= S.player.y - 0.2 && py <= S.player.y + PLAYER_H;
    if (within) return;
    S.voxels[IDX(px, py, pz)] = slot.blockId;
    rebuildChunksNear(px);
    sfx.play('place');
  }
}
function floatText(text, x, y, z, color) {
  const v = new THREE.Vector3(x, y, z).project(S.camera);
  if (v.z > 1) return;
  const w = dom.stage.clientWidth, h = dom.stage.clientHeight;
  const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
  const node = el('div.tw-float', { text, style: { left: sx + 'px', top: sy + 'px', color: color || '#ff8f82' } });
  dom.floaters.appendChild(node);
  requestAnimationFrame(() => { node.style.transform = 'translateY(-30px)'; node.style.opacity = '0'; });
  setTimeout(() => node.remove(), 550);
}

// -------------------------------------------------------------------- mobs --
function heldDamage() {
  const slot = S.hotbar[S.selected];
  if (slot && slot.kind === 'item' && slot.item.damage) return slot.item.damage;
  return 1;
}
function spawnMob(id, pos) {
  const type = S.mobTypes.get(id);
  if (!type) return null;
  if (S.mobs.filter(m => m.alive).length >= MAX_MOBS) {
    const oldest = S.mobs.find(m => m.alive);
    if (oldest) removeMob(oldest);
  }
  const mob = {
    id: S.nextMobId++, type,
    x: pos.x, y: pos.y, z: pos.z, yaw: Math.random() * Math.PI * 2,
    hp: type.maxHp, maxHp: type.maxHp, alive: true, dying: false, deathTimer: 0,
    hurtTimer: 0, panicTimer: 0, atkCooldown: 0, age: 0, spawnX: pos.x, spawnZ: pos.z,
    state: 'stroll', strollTimer: 1, horizSpeed: 0, onGround: true
  };
  if (type.missingGeo || !type.geoParsed) {
    mob.missingVisual = true;
    mob.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), missingMaterial());
    mob.mesh.userData.mobId = mob.id;
    S.scene.add(mob.mesh);
  } else {
    mob.built = buildGeo(type.geoParsed, type.material, { scale: type.scale });
    mob.built.root.traverse(o => { if (o.isMesh) o.userData.mobId = mob.id; });
    S.scene.add(mob.built.root);
  }
  S.mobs.push(mob);
  if (!S.firstMobSpawned) { S.firstMobSpawned = true; award('first-test'); }
  return mob;
}
function removeMob(mob) {
  const obj = mob.missingVisual ? mob.mesh : mob.built.root;
  S.scene.remove(obj);
  if (!mob.missingVisual) mob.built.meshes.forEach(m => m.geometry.dispose());
  const bar = S.domMobBars.get(mob.id); if (bar) { bar.remove(); S.domMobBars.delete(mob.id); }
  const i = S.mobs.indexOf(mob); if (i >= 0) S.mobs.splice(i, 1);
}
function hitMob(mob) {
  const dmg = heldDamage();
  mob.hp -= dmg; mob.hurtTimer = 0.35;
  const dx = mob.x - S.player.x, dz = mob.z - S.player.z, d = Math.hypot(dx, dz) || 1;
  mob.kx = dx / d * 5; mob.kz = dz / d * 5;
  sfx.play('hit');
  floatText('-' + dmg, mob.x, mob.y + 1.3, mob.z);
  if (mob.type.canPanic && !mob.type.hostile) { mob.panicTimer = 3; mob.state = 'panic'; }
  if (mob.hp <= 0) killMob(mob);
}
function killMob(mob) {
  mob.alive = false; mob.dying = true; mob.deathTimer = 0.4;
  if (mob.type.lootTablePath) {
    const table = fs.readJSON(mob.type.lootTablePath);
    const pools = table && table.pools;
    if (pools) for (const pool of pools) {
      const entries = pool.entries || []; if (!entries.length) continue;
      const totalW = entries.reduce((s, e) => s + (e.weight || 1), 0);
      let r = Math.random() * totalW, picked = entries[0];
      for (const e of entries) { const w = e.weight || 1; if (r < w) { picked = e; break; } r -= w; }
      if (picked && picked.name) {
        let count = 1;
        const fn = (picked.functions || []).find(f => f.function === 'set_count');
        if (fn && fn.count) count = fn.count.min + Math.floor(Math.random() * ((fn.count.max - fn.count.min) + 1));
        toast(`The mob dropped ${count} × ${picked.name.split(':').pop()}!`, 'good', 2200);
      }
    }
  }
}
function updateMobAI(mob, dt) {
  const t = mob.type;
  mob.age += dt;
  if (mob.hurtTimer > 0) { mob.hurtTimer -= dt; mob.x += (mob.kx || 0) * dt; mob.z += (mob.kz || 0) * dt; mob.kx = (mob.kx || 0) * 0.85; mob.kz = (mob.kz || 0) * 0.85; }
  if (mob.panicTimer > 0) { mob.panicTimer -= dt; mob.state = 'panic'; }
  else if (t.hostile) {
    const dist = Math.hypot(S.player.x - mob.x, S.player.z - mob.z);
    if (dist < t.aggroRadius && S.player.alive) mob.state = 'chase';
    else if (mob.state === 'chase') mob.state = 'stroll';
  } else if (mob.state !== 'stroll') mob.state = 'stroll';

  let targetX = mob.x, targetZ = mob.z, active = false, speedMul = 1;
  if (mob.state === 'panic') {
    const dx = mob.x - S.player.x, dz = mob.z - S.player.z, d = Math.hypot(dx, dz) || 1;
    targetX = mob.x + dx / d * 4; targetZ = mob.z + dz / d * 4; speedMul = 1.6; active = true;
  } else if (mob.state === 'chase') {
    targetX = S.player.x; targetZ = S.player.z; speedMul = 1.15; active = true;
  } else {
    mob.strollTimer -= dt;
    if (!mob.wanderTarget || mob.strollTimer <= 0) {
      const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5;
      mob.wanderTarget = { x: clamp(mob.spawnX + Math.cos(ang) * r, 1, WORLD_SIZE - 2), z: clamp(mob.spawnZ + Math.sin(ang) * r, 1, WORLD_SIZE - 2) };
      mob.strollTimer = 2.5 + Math.random() * 3.5;
    }
    targetX = mob.wanderTarget.x; targetZ = mob.wanderTarget.z; active = true;
  }

  const dx = targetX - mob.x, dz = targetZ - mob.z, dist = Math.hypot(dx, dz);
  let moveX = 0, moveZ = 0;
  if (active && dist > 0.35) {
    moveX = dx / dist; moveZ = dz / dist;
    mob.yaw = Math.atan2(-moveX, -moveZ);
  }
  const spd = (t.speed || 1.4) * speedMul;
  const moving = active && dist > 0.35;
  if (moving) { mob.x += moveX * spd * dt; mob.z += moveZ * spd * dt; }
  mob.horizSpeed = moving ? spd : 0;
  mob.x = clamp(mob.x, 1, WORLD_SIZE - 2); mob.z = clamp(mob.z, 1, WORLD_SIZE - 2);

  if (t.hasPhysics === false) { /* floats where placed */ }
  else if (t.flies) {
    if (!mob.flyTarget || Math.hypot(mob.x - mob.flyTarget.x, mob.y - mob.flyTarget.y, mob.z - mob.flyTarget.z) < 0.6 || mob.age > (mob.flyNext || 0)) {
      const gy = getSurfaceY(mob.spawnX, mob.spawnZ);
      mob.flyTarget = { x: mob.spawnX + (Math.random() * 2 - 1) * t.flyXZ, y: gy + t.flyY * 0.5 + Math.random() * t.flyY, z: mob.spawnZ + (Math.random() * 2 - 1) * t.flyXZ };
      mob.flyNext = mob.age + 3 + Math.random() * 3;
    }
    mob.y += (mob.flyTarget.y - mob.y) * Math.min(1, dt * 1.5);
    mob.onGround = false;
  } else {
    const gy = getSurfaceY(mob.x, mob.z);
    const targetY = t.floats ? Math.max(gy, SEA_LEVEL) : gy;
    mob.y += (targetY - mob.y) * Math.min(1, dt * 8);
    mob.onGround = true;
  }

  if (t.hostile && mob.state === 'chase' && S.player.alive) {
    const dp = Math.hypot(mob.x - S.player.x, mob.z - S.player.z);
    mob.atkCooldown -= dt;
    if (dp < 1.15 && mob.atkCooldown <= 0) { mob.atkCooldown = 1.0; damagePlayer(t.attackDamage || 3); }
  }
  if (t.canLook && !moving) {
    const dxp = S.player.x - mob.x, dzp = S.player.z - mob.z;
    if (Math.hypot(dxp, dzp) < 8) mob.yaw = Math.atan2(-dxp, -dzp);
  }
}
function mobCtx(mob) {
  return {
    'query.anim_time': mob.age, 'query.life_time': mob.age,
    'query.modified_move_speed': mob.horizSpeed, 'query.ground_speed': mob.horizSpeed,
    'query.is_on_ground': mob.onGround ? 1 : 0, 'query.health': mob.hp
  };
}
function updateMobVisual(mob, dt) {
  const obj = mob.missingVisual ? mob.mesh : mob.built.root;
  obj.position.set(mob.x, mob.y, mob.z);
  obj.rotation.y = mob.yaw;
  let sc = mob.type.scale || 1;
  if (mob.dying) { mob.deathTimer -= dt; sc *= Math.max(0, mob.deathTimer / 0.4); if (mob.deathTimer <= 0) { removeMob(mob); return; } }
  obj.scale.setScalar(sc);
  if (mob.missingVisual) return;
  if (mob.hurtTimer > 0) mob.built.meshes.forEach(m => { if (!m.userData.origColor) m.userData.origColor = m.material.color.getHex(); m.material.color.setHex(0xff5544); });
  else mob.built.meshes.forEach(m => { if (m.userData.origColor != null) m.material.color.setHex(m.userData.origColor); });

  resetPose(mob.built);
  const ctx = mobCtx(mob);
  let list;
  if (mob.type.scriptsAnimate) list = activeAnimations(mob.type.scriptsAnimate, mob.type.shortAnimMap, ctx);
  else {
    list = [];
    const moving = mob.horizSpeed > 0.05;
    if (!moving && mob.type.shortAnimMap.idle) list.push({ key: 'idle', weight: 1 });
    if (moving && mob.type.shortAnimMap.walk) list.push({ key: 'walk', weight: 1 });
  }
  for (const { key, weight } of list) {
    const anim = mob.type.shortAnimMap[key]; if (!anim) continue;
    const pose = sampleAnim(anim, mob.age, ctx);
    applyPose(mob.built, pose, weight);
  }
}
function updateMobHealthBars() {
  const alive = new Set();
  for (const mob of S.mobs) {
    if (mob.hp >= mob.maxHp && mob.hurtTimer <= 0 && !mob.dying) continue;
    alive.add(mob.id);
    let bar = S.domMobBars.get(mob.id);
    if (!bar) { bar = el('div.tw-mobbar', {}, [el('i')]); dom.mobbars.appendChild(bar); S.domMobBars.set(mob.id, bar); }
    const v = new THREE.Vector3(mob.x, mob.y + (mob.type.collH || 1) * (mob.type.scale || 1) + 0.35, mob.z).project(S.camera);
    if (v.z > 1) { bar.style.display = 'none'; continue; }
    bar.style.display = '';
    const w = dom.stage.clientWidth, h = dom.stage.clientHeight;
    bar.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
    bar.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
    bar.firstChild.style.width = clamp(mob.hp / mob.maxHp, 0, 1) * 100 + '%';
  }
  for (const [id, bar] of [...S.domMobBars]) if (!alive.has(id)) { bar.remove(); S.domMobBars.delete(id); }
}

function summonMyMob() {
  const first = [...S.mobTypes.keys()][0];
  if (!first) { toast('Make a mob first — try the Build tool!', 'warn'); return; }
  const mob = spawnMob(first, findSpawnSpotNearPlayer());
  if (mob) lookAtMob(mob);
  toast('Summoned ' + first + '!', 'good', 1600);
}

/**
 * Point the player at a mob. Read from the mob's settled position rather than the requested one —
 * spawning can push it up out of a hillside, and then "Summon" looks like it did nothing.
 */
function lookAtMob(mob) {
  const aim = () => {
    const dx = mob.x - S.player.x, dz = mob.z - S.player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    S.yaw = Math.atan2(-dx, -dz);
    S.pitch = clamp(Math.atan2((mob.y + 0.7) - (S.player.y + EYE_H), dist), -1.1, 1.1);
  };
  aim();
  requestAnimationFrame(aim);   // again once gravity has settled it
}

/** A spot in front of the player that is close to the player's own height, so it stays in view. */
function findSpawnSpotNearPlayer() {
  const base = S.yaw;
  let best = null;
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    for (const dist of [3, 4, 2.4, 5]) {
      const ang = base + turn;
      const x = S.player.x - Math.sin(ang) * dist;
      const z = S.player.z - Math.cos(ang) * dist;
      const y = getSurfaceY(x, z);
      const drop = Math.abs(y - S.player.y);
      const score = drop + turn * turn * 0.4;
      if (!best || score < best.score) best = { x, y, z, score };
      if (drop <= 1.2 && turn === 0) return { x, y, z };
    }
  }
  return best ? { x: best.x, y: best.y, z: best.z } : { x: S.player.x, y: S.player.y, z: S.player.z };
}

// ---------------------------------------------------------------- commands --
function runCommand(raw) {
  const text = raw.trim().replace(/^\//, '');
  if (!text) return;
  const parts = text.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  try {
    if (cmd === 'help') {
      modal({
        title: 'Commands', icon: '💬',
        body: el('div', {}, [
          '/summon <id> [x y z]', '/give <item> [count]', '/kill [@e|@s]', '/time set <day|night|number>',
          '/tp <x y z>', '/gamemode <creative|survival>', '/setblock <x y z> <block>', '/clear', '/help'
        ].map(t => el('p', { text: t, style: { fontFamily: 'var(--mono)' } }))),
        buttons: [{ label: 'Got it', kind: 'good' }]
      });
      return;
    }
    if (cmd === 'summon') {
      const id = parts[1];
      if (!id || !S.mobTypes.has(id)) {
        const near = id && closest(id, [...S.mobTypes.keys()]);
        toast(`There is no mob called ${id || '(nothing)'}` + (near ? ` — did you mean ${near}?` : ''), 'bad', 4200);
        return;
      }
      let pos;
      if (parts.length >= 5) pos = { x: parseFloat(parts[2]), y: parseFloat(parts[3]), z: parseFloat(parts[4]) };
      else { pos = { x: S.player.x - Math.sin(S.yaw) * 3, z: S.player.z - Math.cos(S.yaw) * 3 }; pos.y = getSurfaceY(pos.x, pos.z); }
      spawnMob(id, pos);
      toast('Summoned ' + id, 'good');
      return;
    }
    if (cmd === 'give') {
      const id = parts[1]; const count = parseInt(parts[2], 10) || 1;
      const item = S.customItemDefs.find(i => i.identifier === id);
      const block = S.customBlockDefs.find(b => b.identifier === id);
      if (!item && !block) {
        const near = id && closest(id, [...S.customItemDefs.map(i => i.identifier), ...S.customBlockDefs.map(b => b.identifier)]);
        toast(`There is no item called ${id || '(nothing)'}` + (near ? ` — did you mean ${near}?` : ''), 'bad', 4200);
        return;
      }
      const slotIdx = S.hotbar.findIndex(s => s && ((s.kind === 'item' && s.item === item) || (s.kind === 'block' && block && s.blockId === S.blockByName.get(block.identifier))));
      if (slotIdx < 0) {
        S.hotbar[S.selected] = item ? { kind: 'item', item, label: item.displayName, custom: true } : { kind: 'block', blockId: S.blockByName.get(block.identifier), label: block.displayName, custom: true };
      }
      renderHotbar();
      toast(`Gave you ${count} × ${id}`, 'good');
      return;
    }
    if (cmd === 'kill') {
      const arg = parts[1];
      if (arg === '@s') { S.player.hp = 0; S.player.alive = false; dom.deathScreen.classList.add('on'); toast('You killed yourself!', 'bad'); return; }
      const n = S.mobs.filter(m => m.alive).length;
      for (const m of [...S.mobs]) if (m.alive) killMob(m);
      toast(`Killed ${n} mob${n === 1 ? '' : 's'}.`, 'good');
      return;
    }
    if (cmd === 'time') {
      if (parts[1] !== 'set') { toast('Try: /time set day', 'bad'); return; }
      const v = parts[2];
      if (v === 'day') S.dayTime = 0.5; else if (v === 'night') S.dayTime = 0.0;
      else if (!Number.isNaN(parseFloat(v))) S.dayTime = ((parseFloat(v) / 24000) % 1 + 1) % 1;
      else { toast('Try /time set day, /time set night, or a tick number.', 'bad'); return; }
      updateSkyColors(true);
      toast('Time set.', 'good', 1200);
      return;
    }
    if (cmd === 'tp') {
      if (parts.length < 4) { toast('Try: /tp x y z', 'bad'); return; }
      S.player.x = parseFloat(parts[1]); S.player.y = parseFloat(parts[2]); S.player.z = parseFloat(parts[3]);
      S.player.vy = 0; toast('Teleported!', 'good', 1200);
      return;
    }
    if (cmd === 'gamemode') {
      const v = (parts[1] || '').toLowerCase();
      if (v !== 'creative' && v !== 'survival') { toast('Try: /gamemode creative  or  /gamemode survival', 'bad'); return; }
      S.mode = v; toast('Gamemode: ' + v, 'good', 1400);
      return;
    }
    if (cmd === 'setblock') {
      if (parts.length < 5) { toast('Try: /setblock x y z blockname', 'bad'); return; }
      const x = Math.round(parseFloat(parts[1])), y = Math.round(parseFloat(parts[2])), z = Math.round(parseFloat(parts[3]));
      const name = parts[4];
      if (!S.blockByName.has(name)) {
        const near = closest(name, [...S.blockByName.keys()]);
        toast(`There is no block called ${name}` + (near ? ` — did you mean ${near}?` : ''), 'bad', 4200);
        return;
      }
      if (!inBounds(x, y, z)) { toast('That is outside the test world.', 'bad'); return; }
      S.voxels[IDX(x, y, z)] = S.blockByName.get(name);
      rebuildChunksNear(x);
      toast('Placed ' + name, 'good', 1200);
      return;
    }
    if (cmd === 'clear') {
      buildHotbar(); renderHotbar();
      toast('Hotbar cleared and refilled with defaults.', 'good');
      return;
    }
    toast(`I do not know the command "/${cmd}". Try /help.`, 'bad', 3200);
  } catch (e) {
    toast('That command went wrong: ' + e.message, 'bad', 3200);
  }
}

// ------------------------------------------------------------- content log --
function refreshContentLog() {
  const rows = lintProject().concat(S.runtimeIssues);
  const order = { error: 0, warn: 1, tip: 2 };
  rows.sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
  dom.logPanel.innerHTML = '';
  if (!rows.length) { dom.logPanel.appendChild(el('div.tw-log-empty', { text: '✅ No problems found in this pack!' })); }
  for (const r of rows) {
    dom.logPanel.appendChild(el('div.tw-log-row.lv-' + r.level, {}, [
      el('div', { style: { flex: '1' } }, [
        el('b', { text: r.title }),
        el('div.tw-log-path', { text: r.path }),
        el('div', { text: r.detail }),
        r.fix ? el('div.tw-log-fix', { text: '→ ' + r.fix }) : null
      ])
    ]));
  }
  dom.logBadge.textContent = String(rows.length);
  dom.logBadge.parentElement.style.display = rows.length ? '' : 'none';
}

// ---------------------------------------------------------------- HUD/loop --
function updateHUD() {
  const p = S.player;
  dom.healthFill.style.width = clamp(p.hp / p.maxHp, 0, 1) * 100 + '%';
  dom.hungerFill.style.width = clamp(p.hunger / p.maxHunger, 0, 1) * 100 + '%';
}
function updateHighlight(target) {
  if (!S.highlightBox) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    S.highlightBox = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    S.scene.add(S.highlightBox);
  }
  if (target && target.kind === 'block') {
    S.highlightBox.visible = true;
    S.highlightBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  } else S.highlightBox.visible = false;
}

function tick() {
  if (!S || !S.active) return;
  const dt = Math.min(0.05, S.clock.getDelta());
  S.dayTime = (S.dayTime + dt / CYCLE_SECONDS) % 1;
  updateSkyColors(false);
  updateSunMoon();
  updatePlayer(dt);
  const target = pickTarget();
  updateHighlight(target);
  for (const mob of [...S.mobs]) { if (mob.alive || mob.dying) { if (mob.alive) updateMobAI(mob, dt); updateMobVisual(mob, dt); } }
  updateMobHealthBars();
  updateHUD();

  S.fpsAcc += dt; S.fpsN++;
  if (S.fpsAcc >= 0.5) { S.fps = Math.round(S.fpsN / S.fpsAcc); dom.fps.textContent = S.fps + ' FPS'; S.fpsAcc = 0; S.fpsN = 0; }

  S.renderer.render(S.scene, S.camera);
  S.rafId = requestAnimationFrame(tick);
}

// ------------------------------------------------------------------- build --
function clearChunkMeshes() {
  for (const m of S.chunkMeshes) if (m) { S.scene.remove(m); m.geometry.dispose(); }
  S.chunkMeshes = new Array(N_CHUNKS).fill(null);
}

/** Free the GPU objects made from the child's own pictures, but never the shared missing-texture
 *  material — every unresolved block, item and mob points at that one. */
function disposeProjectMaterials() {
  const keep = missingMaterial();
  const drop = m => { if (m && m !== keep) { if (m.map) m.map.dispose(); m.dispose(); } };
  if (S.materials) for (const [, m] of S.materials) drop(m);
  if (S.mobTypes) for (const [, t] of S.mobTypes) drop(t.material);
}

/** A block the child placed can outlive the definition it came from (they deleted that block in
 *  Build). Turn those orphaned voxels back into air rather than leaving invisible solid ghosts. */
function sanitiseVoxels() {
  if (!S.voxels) return;
  for (let i = 0; i < S.voxels.length; i++) if (S.voxels[i] && !S.blocks[S.voxels[i]]) S.voxels[i] = BLOCK.AIR;
}

/**
 * Re-read the add-on — blocks, items, mob types, pictures, hotbar, content log.
 * Deliberately leaves the terrain and the player alone: coming back from Paint must not bulldoze
 * the house they built.
 */
async function scanProject() {
  S.runtimeIssues = [];
  for (const m of [...S.mobs]) removeMob(m);   // they hold a stale type (and its material)
  clearChunkMeshes();                          // they hold the old block materials
  disposeProjectMaterials();

  S.customBlockDefs = scanCustomBlocks();
  S.customItemDefs = scanCustomItems();
  buildBlockRegistry();
  await buildMaterials();
  await scanMobTypes();

  sanitiseVoxels();
  if (S.voxels) rebuildAllChunks();
  buildHotbar(); renderHotbar();
  refreshContentLog();
  S.needsRescan = false;
}

/** Fresh terrain + a fresh spawn. Only on the first visit and on "Rebuild world". */
function generateTerrain() {
  const flowerSpots = generateVoxels();
  clearChunkMeshes();
  rebuildAllChunks();
  buildFlowers(flowerSpots);
  buildWater();
  for (const m of [...S.mobs]) removeMob(m);
  resetPlayer();
  S.worldBuilt = true;
}

async function buildWorld() {
  await scanProject();
  generateTerrain();
}

function rebuildWorld() {
  buildWorld().then(() => toast('New world!', 'good', 1200));
}

function ensureThree() {
  if (S.renderer) return;
  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 340);
  S.renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  buildSky();
  onResize();
  window.__world = S;   // debug hook, same idea as window.__game elsewhere in this repo
}

// ------------------------------------------------------------- rebuild hook --
let rescanTimer = null;

/** Something changed on disk. Re-read the pack (never the terrain), now if we are on screen and
 *  otherwise the next time we are opened. */
function noteFileChange() {
  if (!S) return;
  S.needsRescan = true;
  clearTimeout(rescanTimer);
  if (S.active) rescanTimer = setTimeout(() => { if (S && S.active && S.needsRescan) scanProject(); }, 600);
}

// -------------------------------------------------------------- lifecycle --
export default {
  id: 'test', title: 'Play', icon: '🎮',

  mount(root) {
    buildDOM(root);
    bus.on('file:change', noteFileChange);
    // A different add-on means a different everything — start that one from scratch.
    bus.on('project:open', () => { if (S) { S.worldBuilt = false; S.needsRescan = true; } });
  },

  async show() {
    if (!dom) return;
    if (!S) S = freshState();
    S.active = true;
    ensureThree();
    onResize();
    if (!S.worldBuilt) await buildWorld();
    else if (S.needsRescan) await scanProject();
    S.clock.getDelta();
    cancelAnimationFrame(S.rafId);
    S.rafId = requestAnimationFrame(tick);

    if (parseInt(dom.logBadge.textContent, 10) > 0) {
      say('I found a few things to fix in your files — tap <b>📋 Content Log</b> any time to see them!');
    }

    tour('test-intro', [
      { title: 'Welcome to Play!', text: 'This is a <b>practice world</b> that loads your real add-on files — it behaves almost like Minecraft, but is not the real game.' },
      { el: '.tw-hotbar', title: 'Your hotbar', text: 'Every block and item you made is here. Tap a slot, or use number keys.' },
      { el: '.tw-topbar button', title: 'Summon your mob', text: 'Puts your custom mob in the world so you can see it move.' },
      { title: 'Break & place', text: 'Left click (or the ⛏ button) breaks blocks and hits mobs. Right click (or ✋) places blocks and uses items.' },
      { title: 'Content Log', text: 'The 📋 Content Log button lists anything wrong with your files, and how to fix it.' }
    ], { tool: 'test' });
  },

  hide() {
    if (!S) return;
    S.active = false;
    cancelAnimationFrame(S.rafId);
    clearTimeout(rescanTimer);
    if (document.pointerLockElement) document.exitPointerLock();
    closeCmdBar();
  },

  onFileChange: noteFileChange
};

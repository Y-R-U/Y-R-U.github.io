// The level editor. Schematic 3D view (grid + road ribbons + markers) with a
// full-world preview toggle (👁). Tools: pan, road-drawing (tap cells to lay
// waypoints), no-build cell painting. Panel tabs: Roads / Waves / Settings.
//
// Save   → localStorage — appears under the game's Custom tab immediately.
// Export → downloads <id>.json; drop it in levels/ + add to levels/index.json
//          to promote it to a built-in level.
// ▶ Test → sessionStorage handoff to index.html?test=1 (game shows a
//          "Back to editor" button; the editor auto-saves its working copy).

import * as THREE from 'three';
import { CELL, CFG, THEMES, ENEMIES } from './config.js';
import { initAssets } from './assets.js';
import * as LV from './levels.js';
import { buildWorld } from './world.js';
import { createInput } from './input.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);
const setBoot = (m, f) => { $('boot-status').textContent = m; if (f != null) $('boot-bar').querySelector('i').style.width = `${f * 100}%`; };

const WIP_KEY = 'towered-editor-wip';
const threat = (t) => { const d = ENEMIES[t]; return d.hp + d.armor * 22 + (d.heal ? 130 : 0) + (d.regen ? 60 : 0); };

// ── state ────────────────────────────────────────────────────────────────────
let lv = null, tool = 'pan', activePath = 0, previewOn = false, previewWorld = null;
let dirty = null; // debounce timer

function defaultLevel() {
  return {
    id: `custom-${Date.now().toString(36)}`, name: 'My Battlefield', theme: 'meadow',
    grid: { w: 20, h: 14 },
    paths: [[[0, 7], [9, 7], [9, 4], [16, 4], [16, 10], [19, 10]]],
    blocked: [], decor: 0.55, gold: 280, lives: 20,
    waves: [
      { groups: [{ type: 'shambler', n: 6, gap: 1, delay: 0, path: 0 }] },
      { groups: [{ type: 'shambler', n: 8, gap: 0.9, delay: 0, path: 0 }, { type: 'rotter', n: 4, gap: 0.9, delay: 6, path: 0 }] },
      { groups: [{ type: 'bones', n: 8, gap: 0.8, delay: 0, path: 0 }, { type: 'rotter', n: 6, gap: 0.9, delay: 5, path: 0 }] },
      { groups: [{ type: 'raider', n: 6, gap: 1.1, delay: 0, path: 0 }, { type: 'shambler', n: 10, gap: 0.8, delay: 4, path: 0 }] },
    ],
    tip: '',
  };
}

// ── three.js scaffold ────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
$('game-container').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a12);
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 700);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(30, 50, 20);
scene.add(sun);

CFG.cam.phiMin = 0.1; // allow near-top-down for precise drawing
const schematic = new THREE.Group();
scene.add(schematic);

const input = createInput(renderer.domElement, camera, {
  onTapCell(cx, cz) {
    if (tool === 'path') {
      lv.paths[activePath] ??= [];
      const p = lv.paths[activePath];
      const last = p[p.length - 1];
      if (!last || last[0] !== cx || last[1] !== cz) { p.push([cx, cz]); mutate(); }
    } else if (tool === 'block') {
      const i = lv.blocked.findIndex(([x, z]) => x === cx && z === cz);
      if (i >= 0) lv.blocked.splice(i, 1); else lv.blocked.push([cx, cz]);
      mutate();
    }
  },
  onTapMiss() { /* outside grid */ },
});

// ── schematic rendering ──────────────────────────────────────────────────────
function disposeGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const o = g.children[i];
    o.traverse?.(c => { c.geometry?.dispose?.(); if (c.material?.map) c.material.map.dispose(); c.material?.dispose?.(); });
    g.remove(o);
  }
}

function numberSprite(n, color = '#ffd75e') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,10,6,0.75)';
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = color; g.font = '800 30px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(n, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.setScalar(0.9);
  sp.renderOrder = 20;
  return sp;
}

function ribbon(curve, width, color, y = 0.06) {
  const pts = curve.pts, n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, n - 1)], r = pts[Math.max(i - 1, 0)];
    const tx = q.x - r.x, tz = q.z - r.z;
    const L = Math.hypot(tx, tz) || 1;
    const nx = -tz / L * width / 2, nz = tx / L * width / 2;
    pos.set([p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz], i * 6);
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
}

function rebuildSchematic() {
  disposeGroup(schematic);
  schematic.visible = !previewOn;
  if (previewOn) return;
  const theme = THEMES[lv.theme];
  const gw = lv.grid.w * CELL, gh = lv.grid.h * CELL;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(gw + 24, gh + 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: theme.groundA, roughness: 1 }));
  schematic.add(ground);

  // grid lines
  const gpts = [];
  for (let x = 0; x <= lv.grid.w; x++) gpts.push(new THREE.Vector3(-gw / 2 + x * CELL, 0.02, -gh / 2), new THREE.Vector3(-gw / 2 + x * CELL, 0.02, gh / 2));
  for (let z = 0; z <= lv.grid.h; z++) gpts.push(new THREE.Vector3(-gw / 2, 0.02, -gh / 2 + z * CELL), new THREE.Vector3(gw / 2, 0.02, -gh / 2 + z * CELL));
  schematic.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gpts),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13 })));

  // roads
  lv.paths.forEach((p, pi) => {
    const isActive = pi === activePath && tool === 'path';
    if (p.length >= 2) {
      const curve = LV.buildCurve(lv, pi);
      schematic.add(ribbon(curve, CELL * 1.25, theme.path, 0.05 + pi * 0.005));
      if (isActive) schematic.add(ribbon(curve, CELL * 1.45, 0xffd75e, 0.045));
      // gate + castle markers
      const gate = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x8040ff }));
      gate.position.set(curve.start.x, 0.8, curve.start.z);
      schematic.add(gate);
      if (pi === 0) {
        const castle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), new THREE.MeshStandardMaterial({ color: 0xd8ae4e }));
        castle.position.set(curve.end.x, 0.9, curve.end.z);
        schematic.add(castle);
      }
    }
    p.forEach(([cx, cz], wi) => {
      const { x, z } = LV.cellToWorld(lv, cx, cz);
      const sp = numberSprite(wi + 1, isActive ? '#ffd75e' : '#b9ae94');
      sp.position.set(x, 1.3, z);
      schematic.add(sp);
    });
  });

  // blocked cells
  for (const [cx, cz] of lv.blocked) {
    const { x, z } = LV.cellToWorld(lv, cx, cz);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x50b050, transparent: true, opacity: 0.4, depthWrite: false }));
    m.position.set(x, 0.04, z);
    schematic.add(m);
  }
}

let previewTimer = null;
async function rebuildPreview() {
  if (previewWorld) { previewWorld.dispose(); previewWorld = null; }
  scene.background = new THREE.Color(0x141a12);
  scene.fog = null;
  if (!previewOn) { schematic.visible = true; rebuildSchematic(); return; }
  if (LV.validateLevel(lv).length) { setStatus('fix the errors to preview'); previewOn = false; $('ed-preview').classList.remove('on'); rebuildSchematic(); return; }
  schematic.visible = false;
  setStatus('building preview…');
  previewWorld = await buildWorld(scene, lv, { lite: false });
  setStatus('preview — 👁 to go back to editing');
}

// ── mutation pipeline ────────────────────────────────────────────────────────
function mutate() {
  try { localStorage.setItem(WIP_KEY, JSON.stringify(lv)); } catch { /* full */ }
  const errs = LV.validateLevel(lv);
  const errEl = $('ed-errors');
  if (errs.length) { errEl.textContent = `⚠ ${errs[0]}`; errEl.classList.add('show'); }
  else errEl.classList.remove('show');
  rebuildSchematic();
  if (previewOn) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(rebuildPreview, 500);
  }
  renderPanel();
}

function setStatus(msg) { $('ed-status').textContent = msg; }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ── panel: tabs ──────────────────────────────────────────────────────────────
let curTab = 'paths';
document.querySelectorAll('.ed-tabs button').forEach(b => {
  b.onclick = () => {
    curTab = b.dataset.tab;
    document.querySelectorAll('.ed-tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.ed-tabbody').forEach(x => x.classList.add('hidden'));
    $(`ed-tab-${curTab}`).classList.remove('hidden');
    renderPanel();
  };
});
$('ed-paneltoggle').onclick = () => $('ed-panel').classList.toggle('open');

function renderPanel() {
  if (curTab === 'paths') renderPaths();
  else if (curTab === 'waves') renderWaves();
  else renderSettings();
}

function renderPaths() {
  const host = $('ed-tab-paths');
  const chips = lv.paths.map((p, i) =>
    `<button class="ed-chip ${i === activePath ? 'on' : ''}" data-p="${i}">Road ${i + 1} · ${p.length} pts</button>`).join('');
  host.innerHTML = `
    <div class="ed-sec">Roads</div>
    <div class="ed-hint">Pick the 🛣️ tool, then tap cells on the grid to lay waypoints
    (enemies walk them in order; a smooth road is threaded through). The purple cone is
    the spawn portal, the gold block the castle. <b>All roads must end at the same cell.</b></div>
    <div class="ed-chipset">${chips}</div>
    <div class="ed-row" style="margin-top:12px">
      <button class="ed-btn" id="p-add">➕ New road</button>
      <button class="ed-btn" id="p-undo">↩ Undo point</button>
      <button class="ed-btn warn" id="p-del">🗑 Delete road</button>
    </div>
    <div class="ed-sec">No-build cells</div>
    <div class="ed-hint">Pick the 🌲 tool and tap cells to toggle scenery plots the player
    can't build on (${lv.blocked.length} placed).</div>`;
  host.querySelectorAll('[data-p]').forEach(b => {
    b.onclick = () => { activePath = +b.dataset.p; setTool('path'); mutate(); };
  });
  $('p-add').onclick = () => { lv.paths.push([]); activePath = lv.paths.length - 1; setTool('path'); mutate(); };
  $('p-undo').onclick = () => { lv.paths[activePath]?.pop(); mutate(); };
  $('p-del').onclick = () => {
    if (lv.paths.length <= 1) { toast('A level needs at least one road'); return; }
    lv.paths.splice(activePath, 1);
    for (const w of lv.waves) for (const g of w.groups) if (g.path >= lv.paths.length) g.path = 0;
    activePath = 0; mutate();
  };
}

function renderWaves() {
  const host = $('ed-tab-waves');
  const enemyOpts = (sel) => Object.entries(ENEMIES).map(([id, d]) =>
    `<option value="${id}" ${id === sel ? 'selected' : ''}>${d.icon} ${d.name}</option>`).join('');
  const cards = lv.waves.map((w, wi) => {
    const thr = w.groups.reduce((s, g) => s + threat(g.type) * g.n, 0);
    const rows = w.groups.map((g, gi) => `
      <div class="grp-row" data-w="${wi}" data-g="${gi}">
        <select class="g-type">${enemyOpts(g.type)}</select>
        <input class="g-n" type="number" min="1" max="40" value="${g.n}">
        <input class="g-gap" type="number" min="0.2" max="8" step="0.1" value="${g.gap}">
        <input class="g-delay" type="number" min="0" max="60" step="0.5" value="${g.delay || 0}">
        <input class="g-path" type="number" min="1" max="${lv.paths.length}" value="${(g.path || 0) + 1}">
        <button class="g-del">✕</button>
      </div>`).join('');
    return `<div class="wave-card">
      <div class="wave-head">Wave ${wi + 1}<span class="thr">threat ${thr}</span>
        <button class="w-add" data-w="${wi}" title="Add group">➕</button>
        <button class="w-del" data-w="${wi}" title="Delete wave">🗑</button></div>
      <div class="grp-lbl"><span>enemy</span><span>count</span><span>gap s</span><span>delay</span><span>road</span><span></span></div>
      ${rows}</div>`;
  }).join('');
  const total = lv.waves.reduce((s, w) => s + w.groups.reduce((x, g) => x + threat(g.type) * g.n, 0), 0);
  host.innerHTML = `
    <div class="ed-sec">Waves — total threat ${total}</div>
    <div class="ed-hint">Each wave is groups of enemies: how many, seconds between each,
    delay before the group starts, and which road they take. Bosses (👑) make it a boss wave.</div>
    ${cards}
    <button class="ed-btn" id="w-new" style="width:100%">➕ Add wave</button>`;

  host.querySelectorAll('.grp-row').forEach(row => {
    const g = lv.waves[+row.dataset.w].groups[+row.dataset.g];
    row.querySelector('.g-type').onchange = (e) => { g.type = e.target.value; mutate(); };
    row.querySelector('.g-n').onchange = (e) => { g.n = clamp(+e.target.value || 1, 1, 40); mutate(); };
    row.querySelector('.g-gap').onchange = (e) => { g.gap = clamp(+e.target.value || 1, 0.2, 8); mutate(); };
    row.querySelector('.g-delay').onchange = (e) => { g.delay = clamp(+e.target.value || 0, 0, 60); mutate(); };
    row.querySelector('.g-path').onchange = (e) => { g.path = clamp((+e.target.value || 1) - 1, 0, lv.paths.length - 1); mutate(); };
    row.querySelector('.g-del').onclick = () => {
      const w = lv.waves[+row.dataset.w];
      if (w.groups.length <= 1) { toast('A wave needs at least one group'); return; }
      w.groups.splice(+row.dataset.g, 1); mutate();
    };
  });
  host.querySelectorAll('.w-add').forEach(b => {
    b.onclick = () => { lv.waves[+b.dataset.w].groups.push({ type: 'shambler', n: 6, gap: 1, delay: 0, path: 0 }); mutate(); };
  });
  host.querySelectorAll('.w-del').forEach(b => {
    b.onclick = () => {
      if (lv.waves.length <= 1) { toast('A level needs at least one wave'); return; }
      lv.waves.splice(+b.dataset.w, 1); mutate();
    };
  });
  $('w-new').onclick = () => {
    const last = lv.waves[lv.waves.length - 1];
    lv.waves.push(JSON.parse(JSON.stringify(last)));
    mutate();
  };
}

function renderSettings() {
  const host = $('ed-tab-settings');
  const themeChips = Object.entries(THEMES).map(([id, t]) =>
    `<button class="ed-chip ${lv.theme === id ? 'on' : ''}" data-th="${id}">${t.name}</button>`).join('');
  host.innerHTML = `
    <div class="ed-sec">Realm</div>
    <div class="ed-chipset">${themeChips}</div>
    <div class="ed-sec">Battlefield</div>
    <div class="ed-row"><label>Grid width</label><input id="s-w" type="number" min="8" max="32" value="${lv.grid.w}"></div>
    <div class="ed-row"><label>Grid height</label><input id="s-h" type="number" min="6" max="24" value="${lv.grid.h}"></div>
    <div class="ed-row"><label>Decor</label><input id="s-decor" type="range" min="0" max="1" step="0.05" value="${lv.decor}"></div>
    <div class="ed-sec">Economy</div>
    <div class="ed-row"><label>Start gold</label><input id="s-gold" type="number" min="50" max="5000" step="10" value="${lv.gold}"></div>
    <div class="ed-row"><label>Hearts</label><input id="s-lives" type="number" min="1" max="99" value="${lv.lives}"></div>
    <div class="ed-sec">Loading tip</div>
    <div class="ed-row"><input id="s-tip" type="text" maxlength="90" placeholder="Shown when the level starts" value="${(lv.tip || '').replace(/"/g, '&quot;')}"></div>
    <div class="ed-hint" style="margin-top:16px">id: <b>${lv.id}</b><br><br>
    💾 Save puts this level in the game's <b>Custom</b> tab on this device.<br>
    ⬇ Export downloads JSON — to make it a built-in, drop the file into
    <b>levels/</b> and add its id to <b>levels/index.json</b>.</div>`;
  host.querySelectorAll('[data-th]').forEach(b => { b.onclick = () => { lv.theme = b.dataset.th; mutate(); }; });
  const num = (id, fn) => { $(id).onchange = (e) => { fn(+e.target.value); mutate(); }; };
  num('s-w', v => { lv.grid.w = clamp(v, 8, 32); input.setLevel(lv); });
  num('s-h', v => { lv.grid.h = clamp(v, 6, 24); input.setLevel(lv); });
  num('s-decor', v => { lv.decor = v; });
  num('s-gold', v => { lv.gold = clamp(v, 50, 5000); });
  num('s-lives', v => { lv.lives = clamp(v, 1, 99); });
  $('s-tip').onchange = (e) => { lv.tip = e.target.value; mutate(); };
}

// ── tools ────────────────────────────────────────────────────────────────────
function setTool(t) {
  tool = t;
  document.querySelectorAll('#ed-rail [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  setStatus({
    pan: 'drag to pan · wheel/pinch to zoom · right-drag/twist to orbit',
    path: `drawing Road ${activePath + 1} — tap cells to add waypoints`,
    block: 'tap cells to toggle no-build scenery',
  }[t]);
  rebuildSchematic();
}
document.querySelectorAll('#ed-rail [data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
$('ed-preview').onclick = () => {
  previewOn = !previewOn;
  $('ed-preview').classList.toggle('on', previewOn);
  rebuildPreview();
};

// ── top bar actions ──────────────────────────────────────────────────────────
$('ed-name').onchange = (e) => { lv.name = e.target.value || 'Untitled'; mutate(); };

$('ed-new').onclick = () => { lv = defaultLevel(); activePath = 0; syncAll(); toast('New level'); };

$('ed-save').onclick = () => {
  const errs = LV.validateLevel(lv);
  if (errs.length) { toast(`Can't save: ${errs[0]}`); return; }
  if (/^level\d\d$/.test(lv.id)) lv.id = `custom-${Date.now().toString(36)}`;  // don't shadow built-ins
  LV.saveCustomLevel(lv);
  toast(`Saved — "${lv.name}" is in the game's Custom tab`);
  mutate();
};

$('ed-export').onclick = () => {
  const blob = new Blob([JSON.stringify(lv, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${lv.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported JSON — drop into levels/ to make it built-in');
};

$('ed-import').onclick = () => $('ed-file').click();
$('ed-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    obj.id ||= `custom-${Date.now().toString(36)}`;
    lv = obj; activePath = 0; syncAll();
    toast(`Imported "${lv.name || lv.id}"`);
  } catch { toast('Not a valid level JSON'); }
  e.target.value = '';
};

$('ed-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(lv)); toast('Level JSON copied'); }
  catch { toast('Clipboard unavailable'); }
};

$('ed-test').onclick = () => {
  const errs = LV.validateLevel(lv);
  if (errs.length) { toast(`Can't test: ${errs[0]}`); return; }
  try { localStorage.setItem(WIP_KEY, JSON.stringify(lv)); } catch { /* ok */ }
  LV.setTestLevel(lv);
  location.href = 'index.html?test=1&nosave';
};

$('ed-load').onclick = async () => {
  const index = await LV.loadBuiltinIndex();
  const customs = Object.values(LV.customLevels());
  const rows = [
    ...customs.map(c => `<button data-kind="c" data-id="${c.id}">💾 ${c.name || c.id}<small>custom level</small></button>`),
    ...index.map((e, i) => `<button data-kind="b" data-id="${e.id}">🗺 ${i + 1}. ${e.name}<small>built-in — saving makes an editable copy</small></button>`),
  ].join('');
  $('modal-card').innerHTML = `<h2>Load level</h2><div class="mod-list">${rows}</div>
    <div class="mbtns"><button id="load-cancel">Cancel</button></div>`;
  $('modal').classList.remove('hidden');
  $('load-cancel').onclick = () => $('modal').classList.add('hidden');
  document.querySelectorAll('.mod-list button').forEach(b => {
    b.onclick = async () => {
      lv = b.dataset.kind === 'c'
        ? JSON.parse(JSON.stringify(LV.customLevels()[b.dataset.id]))
        : JSON.parse(JSON.stringify(await LV.loadBuiltin(b.dataset.id)));
      activePath = 0;
      $('modal').classList.add('hidden');
      syncAll();
      toast(`Loaded "${lv.name}"`);
    };
  });
};

function syncAll() {
  $('ed-name').value = lv.name || '';
  input.setLevel(lv);
  input.snap();
  previewOn = false;
  $('ed-preview').classList.remove('on');
  if (previewWorld) { previewWorld.dispose(); previewWorld = null; scene.fog = null; scene.background = new THREE.Color(0x141a12); }
  mutate();
}

// ── boot + loop ──────────────────────────────────────────────────────────────
window.__editor = { get lv() { return lv; }, setTool, mutate, input };

(async () => {
  setBoot('unpacking assets…', 0.3);
  try { await initAssets(() => setBoot('unpacking assets…', 0.6)); }
  catch (e) { setBoot(`failed: ${e.message}`, 0); throw e; }
  try { lv = JSON.parse(localStorage.getItem(WIP_KEY)) || defaultLevel(); }
  catch { lv = defaultLevel(); }
  if (!lv?.grid) lv = defaultLevel();
  $('boot').style.display = 'none';
  $('ed-panel').classList.add('open');
  syncAll();
  setTool('pan');

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    input.update(dt);
    previewWorld?.tick(dt, clock.elapsedTime);
    renderer.render(scene, camera);
  })();
})();

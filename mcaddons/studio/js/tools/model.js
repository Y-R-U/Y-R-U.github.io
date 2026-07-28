// Model — the Blockbench replacement. Boxes ("cubes") live inside parts ("bones") inside a
// .geo.json file. This tool edits that file directly: load -> parsed geo object -> Three.js
// preview via lib/geo.js -> write back with geoToJSON(). See studio/CLAUDE.md for the coordinate
// rules; every axis conversion in this file goes through lib/geo.js, never re-derived here.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { el, button, modal, confirmBox, promptBox, pickBox, toast, row, textField, select, toggle, clear } from '../core/ui.js';
import { fs } from '../core/fs.js';
import { bus } from '../core/bus.js';
import { settings, flag } from '../core/store.js';
import { tour, say, award } from '../core/coach.js';
import * as G from '../lib/geo.js';
import * as B from '../lib/bedrock.js';

// ---------------------------------------------------------------------- CSS ---
const CSS = `
.md-pane { flex: 1; min-height: 0; }
.md-top { flex-wrap: wrap; }
.md-top .grow-sel { min-width: 160px; flex: 1 1 200px; }
.md-shapes { gap: 6px; }
.md-shapes .btn.tiny { padding: 7px 10px; }
.md-split { flex: 1; min-height: 0; }
.md-tree, .md-props { display: flex; flex-direction: column; }
.md-tree-tools, .md-props-tools { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 10px 6px; }
.md-tree-list { flex: 1; overflow: auto; padding-bottom: 10px; }
.md-bone-row { display: flex; align-items: center; gap: 4px; padding: 7px 8px; cursor: pointer; border-left: 3px solid transparent; min-height: 40px; }
.md-bone-row:hover { background: var(--panel2); }
.md-bone-row.on { background: var(--panel3); border-left-color: var(--grass); color: #fff; }
.md-chev { width: 18px; text-align: center; color: var(--dim); flex: none; user-select: none; }
.md-bone-ico { flex: none; }
.md-bone-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-add-cube { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; border: 2px solid transparent; background: transparent; color: var(--dim); cursor: pointer; font-size: 1.05em; }
.md-add-cube:hover { background: var(--panel3); color: var(--grass); border-color: var(--edge); }
.md-cube-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-left: 3px solid transparent; font-size: .92em; color: var(--dim); min-height: 36px; }
.md-cube-row:hover { background: var(--panel2); color: var(--text); }
.md-cube-row.on { background: var(--panel3); border-left-color: var(--gold); color: #fff; }
.md-viewport { position: relative; flex: 1; min-height: 220px; background: linear-gradient(180deg,#141826 0%,#1a2036 55%,#0d1018 100%); }
.md-viewport canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.md-gizmo-bar { position: absolute; left: 10px; top: 10px; z-index: 5; display: flex; gap: 6px; background: rgba(15,17,24,.7); padding: 6px; border-radius: 10px; border: 2px solid #000; backdrop-filter: blur(2px); }
.md-gizmo-bar .iconbtn.on { box-shadow: 0 0 0 2px var(--grass); }
.md-step-bar { position: absolute; right: 10px; top: 10px; z-index: 5; display: flex; gap: 6px; background: rgba(15,17,24,.7); padding: 6px; border-radius: 10px; border: 2px solid #000; }
.md-vb-warn { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 10px; background: rgba(40,20,10,.92); border: 2px solid var(--gold); color: var(--gold); padding: 8px 12px; border-radius: 10px; font-size: .88em; max-width: 90%; }
.md-empty-overlay { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; background: rgba(10,11,16,.55); }
.md-numrow { display: grid; grid-template-columns: 1fr 30px minmax(0,64px) 30px; align-items: center; gap: 6px; margin-bottom: 8px; }
.md-numlabel { font-size: .84em; color: var(--dim); cursor: ew-resize; user-select: none; padding: 4px 2px; border-radius: 6px; }
.md-numlabel.dragging { background: var(--panel3); color: var(--grass); }
.md-numfield { width: 100%; padding: 7px 6px; text-align: center; font-family: var(--mono); font-size: .92em; color: var(--text); background: #0b0d12; border: 2px solid var(--edge2); border-radius: 7px; }
.md-stepbtn { width: 30px; height: 30px; border-radius: 7px; border: 2px solid #000; background: var(--panel2); color: var(--text); font-size: 1.05em; cursor: pointer; }
.md-stepbtn:active { transform: translateY(1px); }
.md-group-title { font-family: var(--pixel); font-size: 9px; color: var(--gold); padding: 12px 10px 8px; letter-spacing: .5px; }
.md-dirty-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grass); box-shadow: 0 0 6px var(--grass); }
.md-dirty-dot.dirty { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
.md-uv-canvas-wrap { display: flex; justify-content: center; padding: 6px; background: #0b0d12; border-radius: 10px; border: 2px solid var(--edge2); overflow: auto; }
.md-uv-canvas { image-rendering: pixelated; background: #000; }
@media (max-width: 900px) {
  .md-gizmo-bar { top: 6px; left: 6px; }
  .md-step-bar { top: 6px; right: 6px; }
}
`;

// -------------------------------------------------------------------- state ---
let $root, $modelWrap, $dirtyDot, $paintBtn, $treeList, $propsBody, $viewport, $canvas, $emptyOverlay, $vbWarn;

let renderer, scene, camera, orbit, gizmo, gizmoHelper, raycaster;
let material = null, texture = null, texturePath = null;
let geo = null;               // current parsed geo object (from lib/geo.js)
let currentPath = null;       // fs path of the .geo.json file
let currentIdx = 0;           // index within that file's geometry array (multi-model files)
let built = null;             // {root,bones,meshes,base,geo} from buildGeo()
let outlineMesh = null;
let pivotDot = null;
let vbHelper = null;
let selection = null;         // {type:'bone', bone} or {type:'cube', bone, cubeIndex}
let dirty = false;
let fineStep = flag.get('model:step', 1);
let gizmoMode = flag.get('model:gizmoMode', 'translate');
let showBounds = flag.get('model:showBounds', false);
let animating = false;
let resizeObs = null;

// ============================================================== life-cycle ===
function mount(root) {
  if (!document.getElementById('md-style')) {
    const s = el('style#md-style'); s.textContent = CSS; document.head.appendChild(s);
  }
  $root = root;
  root.classList.add('md-pane');

  // ---- top toolbar: model chooser + new + save ----
  $modelWrap = el('div.grow-sel');
  $dirtyDot = el('span.md-dirty-dot', { title: 'Saved' });
  $paintBtn = button('Paint me', {
    icon: '🖌️', kind: 'warn', hint: 'Your model has no picture yet. Tap here to paint one.',
    onClick: () => window.openTool && window.openTool('paint')
  });
  $paintBtn.style.display = 'none';

  const topBar = el('div.toolbar.md-top', {}, [
    $modelWrap,
    button('New model', { icon: '➕', kind: 'primary', hint: 'Start a brand new 3D model.', onClick: newModelFlow }),
    el('div.grow'),
    $paintBtn,
    $dirtyDot,
    button('Save', { icon: '💾', kind: 'good', hint: 'Saves your model into the file.', onClick: () => saveToFile(true) })
  ]);

  // ---- quick-add shapes row ----
  const shapeBar = el('div.toolbar.md-shapes');
  for (const s of QUICK_PARTS_LIST) {
    shapeBar.appendChild(button(s.label, {
      icon: s.icon, kind: 'ghost',
      hint: 'Adds a ' + s.label.toLowerCase() + '-shaped part where it makes sense.',
      onClick: () => quickAdd(s.key)
    }));
  }
  shapeBar.appendChild(el('div.sep'));
  shapeBar.appendChild(button('Mirror', { icon: '🪞', kind: 'ghost', hint: 'Makes a matching part on the other side (great for arms and legs).', onClick: mirrorSelected }));
  shapeBar.appendChild(button('Auto UV', { icon: '🧩', kind: 'ghost', hint: 'Repacks the picture layout so no boxes share the same pixels.', onClick: autoUV }));
  shapeBar.appendChild(button('UV map', { icon: '🗺️', kind: 'ghost', hint: 'Shows a flat map of where every box sits on the picture.', onClick: showUVMapPreview }));
  const advToggleWrap = el('span', { style: { marginLeft: 'auto' } });
  shapeBar.appendChild(advToggleWrap);

  // ---- split: tree | viewport | props ----
  const split = el('div.split.md-split');

  const treeTools = el('div.md-tree-tools', {}, [
    button('Add part', { icon: '➕', kind: 'ghost', hint: 'Adds a new moving part (like an arm or a tail).', onClick: addBoneFlow }),
    button('Add box', { icon: '🧊', kind: 'ghost', hint: 'Adds a new box to the selected part.', onClick: addCubeFlow }),
    button('Copy', { icon: '📋', kind: 'ghost', hint: 'Makes a copy of what is selected.', onClick: duplicateSelected }),
    button('Delete', { icon: '🗑️', kind: 'danger', hint: 'Removes what is selected.', onClick: deleteSelected }),
    button('Parent to…', { icon: '🔗', kind: 'ghost', hint: 'Attaches the selected part to a different part.', onClick: reparentFlow })
  ]);
  $treeList = el('div.md-tree-list');
  const treeSide = el('div.side.md-tree', {}, [el('div.side-title', { text: 'PARTS & BOXES' }), treeTools, $treeList]);

  $canvas = el('canvas');
  const gizmoBar = el('div.md-gizmo-bar');
  const modeBtns = {};
  for (const m of [['translate', '↔️', 'Move'], ['scale', '⤢', 'Resize'], ['rotate', '🔄', 'Rotate']]) {
    const b = el('button.iconbtn', { type: 'button', title: m[2], dataset: { hint: m[2] + ' the selected box.' }, text: m[1], on: { click: () => setGizmoMode(m[0]) } });
    modeBtns[m[0]] = b;
    gizmoBar.appendChild(b);
  }
  gizmoBar.appendChild(el('div.sep'));
  const boundsBtn = el('button.iconbtn', { type: 'button', title: 'Visible bounds', dataset: { hint: 'Shows the box the mob is allowed to stick out of. Outside it, the mob can vanish!' }, text: '📦', on: { click: () => { showBounds = !showBounds; flag.set('model:showBounds', showBounds); boundsBtn.classList.toggle('on', showBounds); updateBoundsHelper(); } } });
  boundsBtn.classList.toggle('on', showBounds);
  gizmoBar.appendChild(boundsBtn);
  $root._boundsBtn = boundsBtn;
  $root._gizmoModeBtns = modeBtns;

  const stepBar = el('div.md-step-bar');
  const chips = {};
  for (const st of [[1, '1'], [0.5, '½'], [0.25, '¼']]) {
    const c = el('button.chip', { type: 'button', text: st[1], on: { click: () => { fineStep = st[0]; flag.set('model:step', st[0]); syncStepChips(); } } });
    chips[st[0]] = c;
    stepBar.appendChild(c);
  }
  $root._stepChips = chips;
  syncStepChips();

  $emptyOverlay = el('div.md-empty-overlay', {}, [
    el('div.empty', {}, [
      el('div.big', { text: '🧱' }),
      el('h3', { text: 'No model yet' }),
      el('p', { text: 'Press "New model" up above to make your first one.' })
    ])
  ]);
  $vbWarn = el('div.md-vb-warn', {}, [
    el('span', { text: '⚠️ Part of your mob sticks outside its visible bounds — it may vanish when you look away!' }),
    button('Fix it', { kind: 'warn', onClick: fixBounds })
  ]);
  $vbWarn.style.display = 'none';

  $viewport = el('div.body.md-viewport', {}, [$canvas, gizmoBar, stepBar, $vbWarn, $emptyOverlay]);

  $propsBody = el('div');
  const propsSide = el('div.side.right.md-props', {}, [el('div.side-title', { text: 'NUMBERS' }), $propsBody]);

  split.append(treeSide, $viewport, propsSide);
  root.append(topBar, shapeBar, split);

  initThree();
  refreshModelOptions();
  syncGizmoModeButtons();
  bus.on('file:change', ({ path }) => handleFileChange(path));
  window.addEventListener('resize', onWinResize);
}

function syncStepChips() {
  if (!$root || !$root._stepChips) return;
  for (const [k, c] of Object.entries($root._stepChips)) c.classList.toggle('on', Math.abs(parseFloat(k) - fineStep) < 0.001);
}

async function show(args) {
  if (args && args.path) {
    await refreshModelOptions();
    loadModel(args.path + (args.idx != null ? '#' + args.idx : '#0'));
  } else if (!geo) {
    await refreshModelOptions();
    const last = flag.get('model:lastPath');
    const opts = modelOptions();
    if (last && opts.some(o => o.value === last)) loadModel(last);
    else if (opts.length) loadModel(opts[0].value);
    else showEmpty();
  }
  renderer && renderer.setAnimationLoop(loopFrame);
  animating = true;
  if (geo && !flag.get('tour:model-intro')) {
    setTimeout(() => tour('model-intro', [
      { title: 'Welcome to Model!', text: 'This is where you build your mob out of <b>boxes</b> and <b>parts</b>. Parts can move, boxes are the shapes on them.' },
      { el: '.md-shapes', title: 'Quick shapes', text: 'Tap one of these to add a ready-made part like a head or a leg.' },
      { el: '.md-gizmo-bar', title: 'Move it about', text: 'Pick a box, then use these to move, resize or rotate it right in the 3D view.' },
      { el: '.md-tree', title: 'Everything you have made', text: 'All your parts and boxes are listed here. Tap one to select it.' }
    ]), 500);
  }
}

function hide() {
  renderer && renderer.setAnimationLoop(null);
  animating = false;
  if (dirty) saveToFile(false);
}

function handleFileChange(path) {
  if (!path) return;
  if (path === texturePath) {
    loadTexture(geo && geo.identifier).then(() => fullRebuild());
  }
  if (/\.geo\.json$/.test(path) && $modelWrap) refreshModelOptions();
}

// ================================================================ three.js ===
function initThree() {
  scene = new THREE.Scene();
  const top = new THREE.Color('#26304a'), bottom = new THREE.Color('#0d1018');
  scene.background = top;

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0.6, 1.1, -2.4);

  renderer = new THREE.WebGLRenderer({ canvas: $canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.target.set(0, 0.6, 0);
  orbit.minDistance = 0.3;
  orbit.maxDistance = 20;

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 1.05);
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(2, 3.2, -1.4);
  scene.add(hemi, dir, new THREE.AmbientLight(0xffffff, 0.18));

  const grid = new THREE.GridHelper(1, 16, 0x4a5068, 0x262b38);
  scene.add(grid);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5c6480 }));
  outline.position.set(0, 0.5, 0);
  scene.add(outline);

  raycaster = new THREE.Raycaster();

  gizmo = new TransformControls(camera, renderer.domElement);
  gizmoHelper = gizmo.getHelper ? gizmo.getHelper() : gizmo;
  scene.add(gizmoHelper);
  gizmo.setMode(gizmoMode);
  gizmo.setTranslationSnap(G.UNIT);
  gizmo.setRotationSnap(THREE.MathUtils.degToRad(22.5));
  gizmo.visible = false;
  gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
  gizmo.addEventListener('objectChange', () => { if (gizmo.dragging) liveGizmoPreview(); });
  gizmo.addEventListener('mouseUp', commitGizmo);

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  resizeObs = new ResizeObserver(() => syncSize());
  resizeObs.observe($viewport);
  syncSize();
}

function syncSize() {
  if (!renderer || !$viewport) return;
  const w = Math.max(1, $viewport.clientWidth), h = Math.max(1, $viewport.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
function onWinResize() { syncSize(); }

function loopFrame() {
  orbit.update();
  renderer.render(scene, camera);
}

let downPt = null;
function onPointerDown(e) { downPt = { x: e.clientX, y: e.clientY }; }
function onPointerUp(e) {
  if (gizmo.dragging) { downPt = null; return; }
  if (!downPt) return;
  const dx = e.clientX - downPt.x, dy = e.clientY - downPt.y;
  downPt = null;
  if (Math.hypot(dx, dy) > 6) return; // was an orbit drag, not a tap
  if (!built) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(built.meshes, false);
  if (hits.length) {
    const m = hits[0].object;
    setSelection({ type: 'cube', bone: m.userData.bone, cubeIndex: m.userData.cubeIndex });
  }
}

function frameCamera() {
  if (!built) return;
  const { size, centre } = G.measure(built);
  // Fit the whole model in view with room to spare — a child should never open a model and
  // find it cropped by the panels.
  const dist = Math.max(size.x, size.y, size.z, 0.25) * 3.1 + 0.7;
  camera.position.set(centre.x + dist * 0.32, centre.y + size.y * 0.22 + 0.1, centre.z - dist);
  orbit.target.set(centre.x, centre.y, centre.z);
  orbit.update();
}

// ============================================================= model I/O ===
function modelOptions() {
  const out = [];
  for (const p of fs.findAll('RP/models/**/*.geo.json')) {
    let arr = [];
    try { arr = G.parseGeoFile(fs.readJSON(p)); } catch (e) { /* skip bad file */ }
    arr.forEach((g, i) => out.push({ value: p + '#' + i, label: (g.identifier || p).replace(/^geometry\./, '') + (arr.length > 1 ? ' (' + (i + 1) + ')' : ''), path: p }));
  }
  return out;
}

async function refreshModelOptions() {
  const opts = modelOptions();
  clear($modelWrap);
  if (!opts.length) {
    $modelWrap.appendChild(el('div.field-hint', { text: 'No models yet — press "New model" to make one.' }));
    showEmpty();
    return;
  }
  const value = (currentPath ? currentPath + '#' + currentIdx : opts[0].value);
  const has = opts.some(o => o.value === value);
  const sel = select(opts.map(o => ({ value: o.value, label: o.label })), has ? value : opts[0].value, v => loadModel(v));
  sel.dataset.hint = 'Pick which model you are editing.';
  $modelWrap.appendChild(sel);
}

function showEmpty() {
  geo = null; currentPath = null;
  if (built) { G.disposeBuilt(built); built = null; }
  selection = null;
  renderTree();
  renderProps();
  $emptyOverlay.style.display = 'flex';
  $paintBtn.style.display = 'none';
}

async function loadModel(value) {
  if (dirty) await saveToFile(false);
  const hash = value.lastIndexOf('#');
  const path = hash >= 0 ? value.slice(0, hash) : value;
  const idx = hash >= 0 ? parseInt(value.slice(hash + 1), 10) || 0 : 0;
  const json = fs.readJSON(path);
  if (!json) { toast('Could not open that model.', 'bad'); return; }
  let arr = [];
  try { arr = G.parseGeoFile(json); } catch (e) { toast('That model file looks broken.', 'bad'); return; }
  if (!arr[idx]) { toast('That model is missing.', 'bad'); return; }
  currentPath = path; currentIdx = idx; geo = arr[idx];
  selection = null;
  dirty = false; updateDirtyUI();
  $emptyOverlay.style.display = 'none';
  await loadTexture(geo.identifier);
  fullRebuild();
  frameCamera();
  flag.set('model:lastPath', path + '#' + idx);
}

function uniqueShort(base) {
  let s = base, n = 2;
  while (fs.exists(`RP/models/entity/${s}.geo.json`)) s = base + '_' + (n++);
  return s;
}

async function newModelFlow() {
  const name = await promptBox({ title: 'Name your new model', label: 'What are you making?', placeholder: 'e.g. dragon', icon: '🧱' });
  if (!name) return;
  const shape = await pickBox({
    title: 'Pick a starting shape', icon: '🧱', columns: 2, items: [
      { value: 'blob', icon: '🟢', label: 'Blob', desc: 'A simple friendly body with a head and two feet.' },
      { value: 'biped', icon: '🚶', label: 'Person', desc: 'Head, body, two arms and two legs — like a player.' },
      { value: 'quadruped', icon: '🐾', label: 'Animal', desc: 'Head, body and four legs — like a cow or wolf.' },
      { value: 'empty', icon: '📄', label: 'Empty', desc: 'Nothing yet — you build every part yourself.' }
    ]
  });
  if (!shape) return;
  const short = uniqueShort(B.safeName(name));
  const path = `RP/models/entity/${short}.geo.json`;
  const json = shape === 'empty' ? G.geoToJSON(G.newGeo('geometry.' + short)) : B.starterGeo(short, shape);
  fs.writeJSON(path, json);
  toast('Made ' + name + '!', 'good');
  await refreshModelOptions();
  loadModel(path + '#0');
}

async function saveToFile(announce) {
  if (!currentPath || !geo) return;
  try {
    const existing = fs.readJSON(currentPath);
    let allGeos = [];
    try { allGeos = G.parseGeoFile(existing) || []; } catch (e) { allGeos = []; }
    allGeos[currentIdx] = geo;
    const merged = { format_version: B.FORMAT.geo, 'minecraft:geometry': allGeos.map(g => G.geoToJSON(g)['minecraft:geometry'][0]) };
    fs.writeJSON(currentPath, merged);
    dirty = false; updateDirtyUI();
    award('first-model');
    if (announce) toast('Model saved!', 'good');
  } catch (e) { console.error(e); if (announce) toast('Could not save: ' + e.message, 'bad'); }
}

function setDirty(v) { dirty = v; updateDirtyUI(); }
function updateDirtyUI() {
  if (!$dirtyDot) return;
  $dirtyDot.classList.toggle('dirty', dirty);
  $dirtyDot.title = dirty ? 'Unsaved changes' : 'Saved';
}

// ============================================================= texture ===
async function loadTexture(identifier) {
  if (texture) { texture.dispose(); texture = null; }
  texturePath = identifier ? findEntityTexturePath(identifier) : null;
  let img = null;
  if (texturePath && fs.exists(texturePath)) { try { img = await fs.image(texturePath); } catch (e) { img = null; } }
  texture = img ? G.makeTexture(img) : null;
  material = G.makeMaterial(texture);
  $paintBtn.style.display = texture ? 'none' : '';
}

function findEntityTexturePath(identifier) {
  const files = [...new Set([...fs.findAll('RP/entity/*.entity.json'), ...fs.findAll('RP/entity/**/*.entity.json')])];
  for (const f of files) {
    const j = fs.readJSON(f);
    const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    if (!desc || !desc.geometry) continue;
    for (const [key, val] of Object.entries(desc.geometry)) {
      if (val === identifier) {
        const texVal = desc.textures && (desc.textures[key] !== undefined ? desc.textures[key] : desc.textures.default);
        if (texVal) return 'RP/' + String(texVal).replace(/^\/+/, '') + '.png';
      }
    }
  }
  return null;
}

// ========================================================== build / rebuild ===
function fullRebuild() {
  if (!geo) return;
  const keepSel = selection;
  if (built) G.disposeBuilt(built);
  built = G.buildGeo(geo, material);
  scene.add(built.root);
  setSelection(keepSel && findBone(keepSel.bone) ? (keepSel.type === 'cube' && findCube(keepSel.bone, keepSel.cubeIndex) ? keepSel : { type: 'bone', bone: keepSel.bone }) : null, true);
  renderTree();
  checkBounds();
  updateBoundsHelper();
}

function buildCubeGeometry(cube) {
  const inf = cube.inflate || 0;
  const w = Math.max(0.0001, Math.abs(cube.size[0]) + inf * 2);
  const h = Math.max(0.0001, Math.abs(cube.size[1]) + inf * 2);
  const d = Math.max(0.0001, Math.abs(cube.size[2]) + inf * 2);
  const bg = new THREE.BoxGeometry(w * G.UNIT, h * G.UNIT, d * G.UNIT);
  G.applyCubeUV(bg, cube, geo.tw, geo.th);
  return bg;
}

function findMeshFor(sel) {
  return built && sel && built.meshes.find(m => m.userData.bone === sel.bone && m.userData.cubeIndex === sel.cubeIndex);
}

/** Fast path: only this one box changed shape/position/uv — no structural change. */
function refreshCube(bone, cubeIndex) {
  const b = findBone(bone), cube = b && b.cubes[cubeIndex];
  const mesh = findMeshFor({ bone, cubeIndex });
  if (!b || !cube || !mesh) { fullRebuild(); return; }
  const needsHolder = !!(cube.rotation && cube.rotation.some(v => v));
  const hadHolder = !!mesh.userData.holder;
  if (needsHolder !== hadHolder) { fullRebuild(); return; }
  const oldGeo = mesh.geometry;
  mesh.geometry = buildCubeGeometry(cube);
  oldGeo.dispose();
  const centre = G.cubeCentre(cube);
  if (needsHolder) {
    const holder = mesh.userData.holder;
    const piv = cube.pivot || centre;
    holder.position.set((piv[0] - b.pivot[0]) * G.UNIT, (piv[1] - b.pivot[1]) * G.UNIT, -(piv[2] - b.pivot[2]) * G.UNIT);
    G.setBoneRotation(holder, cube.rotation);
    mesh.position.set((centre[0] - piv[0]) * G.UNIT, (centre[1] - piv[1]) * G.UNIT, -(centre[2] - piv[2]) * G.UNIT);
  } else {
    mesh.position.set((centre[0] - b.pivot[0]) * G.UNIT, (centre[1] - b.pivot[1]) * G.UNIT, -(centre[2] - b.pivot[2]) * G.UNIT);
  }
  refreshSelectionVisual();
  checkBounds();
}

function findBone(name) { return geo && geo.bones.find(b => b.name === name); }
function findCube(bone, idx) { const b = findBone(bone); return b && b.cubes[idx]; }
function getDescendants(name, acc = new Set()) {
  for (const b of geo.bones) if (b.parent === name && !acc.has(b.name)) { acc.add(b.name); getDescendants(b.name, acc); }
  return acc;
}
function uniqueBoneName(base) {
  let n = base, i = 2;
  while (findBone(n)) n = base + '_' + (i++);
  return n;
}

// ================================================================ tree UI ===
function renderTree() {
  clear($treeList);
  if (!geo) return;
  const byParent = new Map();
  for (const b of geo.bones) {
    const key = b.parent && findBone(b.parent) ? b.parent : '__ROOT__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(b);
  }
  const collapsed = $treeList._collapsed || ($treeList._collapsed = new Set());
  function renderLevel(parentKey, depth) {
    const kids = byParent.get(parentKey) || [];
    for (const b of kids) {
      const isOpen = !collapsed.has(b.name);
      const hasKids = (byParent.get(b.name) || []).length > 0 || b.cubes.length > 0;
      const row2 = el('div.md-bone-row', {
        style: { paddingLeft: (10 + depth * 16) + 'px' },
        on: { click: () => setSelection({ type: 'bone', bone: b.name }) }
      }, [
        el('span.md-chev', {
          text: hasKids ? (isOpen ? '▾' : '▸') : '',
          on: { click: (e) => { e.stopPropagation(); if (!hasKids) return; if (isOpen) collapsed.add(b.name); else collapsed.delete(b.name); renderTree(); } }
        }),
        el('span.md-bone-ico', { text: '🦴' }),
        el('span.md-bone-name', { text: b.name }),
        el('button.md-add-cube', { type: 'button', title: 'Add a box here', text: '➕', on: { click: (e) => { e.stopPropagation(); setSelection({ type: 'bone', bone: b.name }); addCubeFlow(); } } })
      ]);
      row2.classList.toggle('on', selection && selection.type === 'bone' && selection.bone === b.name);
      $treeList.appendChild(row2);
      if (isOpen) {
        b.cubes.forEach((c, ci) => {
          const cr = el('div.md-cube-row', {
            style: { paddingLeft: (26 + depth * 16) + 'px' },
            on: { click: () => setSelection({ type: 'cube', bone: b.name, cubeIndex: ci }) }
          }, [el('span', { text: '🧊' }), el('span', { text: 'Box ' + (ci + 1) })]);
          cr.classList.toggle('on', selection && selection.type === 'cube' && selection.bone === b.name && selection.cubeIndex === ci);
          $treeList.appendChild(cr);
        });
        renderLevel(b.name, depth + 1);
      }
    }
  }
  renderLevel('__ROOT__', 0);
  if (!geo.bones.length) $treeList.appendChild(el('div.empty', {}, [el('div.big', { text: '🦴' }), el('p', { text: 'No parts yet. Press "Add part" or use a quick shape above.' })]));
}

function setSelection(sel, skipTreeRender) {
  selection = sel;
  refreshSelectionVisual();
  if (!skipTreeRender) renderTree();
  renderProps();
  syncGizmo();
}

function refreshSelectionVisual() {
  if (outlineMesh) { outlineMesh.parent && outlineMesh.parent.remove(outlineMesh); outlineMesh.geometry.dispose(); outlineMesh = null; }
  if (pivotDot) { pivotDot.parent && pivotDot.parent.remove(pivotDot); pivotDot = null; }
  if (!selection || !built) return;
  if (selection.type === 'cube') {
    const mesh = findMeshFor(selection);
    if (mesh) {
      outlineMesh = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffe15a, depthTest: false }));
      outlineMesh.renderOrder = 999;
      mesh.add(outlineMesh);
    }
  } else if (selection.type === 'bone') {
    const g = built.bones.get(selection.bone);
    if (g) {
      pivotDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe15a, depthTest: false }));
      pivotDot.renderOrder = 999;
      g.add(pivotDot);
    }
  }
}

function syncGizmo() {
  if (!gizmo) return;
  if (selection && selection.type === 'cube') {
    const mesh = findMeshFor(selection);
    const obj = mesh && (mesh.userData.holder || mesh);
    if (obj) { gizmo.attach(obj); gizmo.visible = true; return; }
  }
  gizmo.detach();
  gizmo.visible = false;
}

function setGizmoMode(mode) {
  gizmoMode = mode; flag.set('model:gizmoMode', mode);
  gizmo.setMode(mode);
  syncGizmoModeButtons();
}
function syncGizmoModeButtons() {
  if (!$root || !$root._gizmoModeBtns) return;
  for (const [k, b] of Object.entries($root._gizmoModeBtns)) b.classList.toggle('on', k === gizmoMode);
}

// -------------------------------------------------------------- gizmo commit ---
function liveGizmoPreview() { /* visual only follows automatically; commit happens on mouseUp */ }

function commitGizmo() {
  if (!selection || selection.type !== 'cube') return;
  const b = findBone(selection.bone), cube = findCube(selection.bone, selection.cubeIndex);
  const mesh = findMeshFor(selection);
  if (!b || !cube || !mesh) return;
  const obj = mesh.userData.holder || mesh;
  if (gizmoMode === 'translate') {
    // Read the moved object's world offset from the bone's pivot — this works whether the
    // gizmo is attached to the plain mesh or to its rotation holder.
    const worldOffset = new THREE.Vector3();
    mesh.getWorldPosition(worldOffset);
    const boneWorld = new THREE.Vector3();
    built.bones.get(b.name).getWorldPosition(boneWorld);
    const rel = worldOffset.clone().sub(boneWorld);
    const centreModel = [b.pivot[0] + rel.x / G.UNIT, b.pivot[1] + rel.y / G.UNIT, b.pivot[2] - rel.z / G.UNIT];
    const size = cube.size;
    cube.origin = [snap(centreModel[0] - size[0] / 2), snap(centreModel[1] - size[1] / 2), snap(centreModel[2] - size[2] / 2)];
    // cube.pivot (the rotation pivot, if any) is left where it was — only the box's origin moves.
  } else if (gizmoMode === 'scale') {
    const s = obj.scale;
    cube.size = [Math.max(fineStep, snap(Math.abs(cube.size[0] * s.x))), Math.max(fineStep, snap(Math.abs(cube.size[1] * s.y))), Math.max(fineStep, snap(Math.abs(cube.size[2] * s.z)))];
    obj.scale.set(1, 1, 1);
  } else if (gizmoMode === 'rotate') {
    const centre = G.cubeCentre(cube);
    cube.rotation = [
      snap(-THREE.MathUtils.radToDeg(obj.rotation.x), 22.5),
      snap(-THREE.MathUtils.radToDeg(obj.rotation.y), 22.5),
      snap(THREE.MathUtils.radToDeg(obj.rotation.z), 22.5)
    ];
    cube.pivot = cube.pivot || centre;
    obj.rotation.set(0, 0, 0);
  }
  setDirty(true);
  if (gizmoMode === 'rotate') fullRebuild(); else refreshCube(selection.bone, selection.cubeIndex);
  renderProps();
}

function snap(v, step) {
  const s = step || fineStep;
  const r = Math.round(v / s) * s;
  return Math.round(r * 1000) / 1000;
}

// ============================================================= properties ===
function numRow(label, getVal, setVal, opts = {}) {
  const fmt = v => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };
  const input = el('input.md-numfield', { type: 'text', inputMode: 'decimal', value: fmt(getVal()) });
  function apply(v) { setVal(snap(v, opts.step)); input.value = fmt(getVal()); opts.onChange && opts.onChange(); }
  input.addEventListener('change', () => { const v = parseFloat(input.value); apply(isNaN(v) ? getVal() : v); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  const minus = el('button.md-stepbtn', { type: 'button', text: '−', on: { click: () => apply(getVal() - (opts.step || fineStep)) } });
  const plus = el('button.md-stepbtn', { type: 'button', text: '+', on: { click: () => apply(getVal() + (opts.step || fineStep)) } });
  const lbl = el('span.md-numlabel', { text: label, title: 'Drag left/right to change' });
  let drag = null;
  lbl.addEventListener('pointerdown', e => { drag = { x: e.clientX, v: getVal() }; lbl.setPointerCapture(e.pointerId); lbl.classList.add('dragging'); });
  lbl.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const step = opts.step || fineStep;
    apply(drag.v + Math.round(dx / 8) * step);
  });
  function endDrag() { if (drag) { drag = null; lbl.classList.remove('dragging'); } }
  lbl.addEventListener('pointerup', endDrag);
  lbl.addEventListener('pointercancel', endDrag);
  return el('div.md-numrow', {}, [lbl, minus, input, plus]);
}

function stepToggleRow() {
  const wrap = el('div.chips', { style: { margin: '2px 10px 12px' } });
  for (const st of [1, 0.5, 0.25]) {
    const c = el('button.chip' + (Math.abs(st - fineStep) < 0.001 ? '.on' : ''), {
      type: 'button', text: st === 1 ? '1' : st === 0.5 ? '½' : '¼',
      on: { click: () => { fineStep = st; flag.set('model:step', st); syncStepChips(); renderProps(); } }
    });
    wrap.appendChild(c);
  }
  return el('div', {}, [el('div.field-label', { text: 'Snap' }), wrap]);
}

function renderProps() {
  clear($propsBody);
  if (!geo) { $propsBody.appendChild(el('div.empty', {}, [el('div.big', { text: '📐' }), el('p', { text: 'Open or make a model first.' })])); return; }
  $propsBody.appendChild(el('div.md-props-tools', {}, [stepToggleRow()]));
  if (!selection) { $propsBody.appendChild(el('div.empty', {}, [el('div.big', { text: '👆' }), el('p', { text: 'Tap a part or a box on the left, or click one in the 3D view.' })])); return; }
  if (selection.type === 'bone') renderBoneProps(selection.bone);
  else renderCubeProps(selection.bone, selection.cubeIndex);
}

function renderBoneProps(name) {
  const b = findBone(name);
  if (!b) return;
  const wrap = el('div', { style: { padding: '0 10px' } });
  wrap.appendChild(el('div.md-group-title', { text: 'PART' }));
  wrap.appendChild(row('Name', textField(b.name, { attrs: { onchange: null } })));
  const nameInput = wrap.lastChild.querySelector('input');
  nameInput.addEventListener('change', () => {
    const v = B.safeName(nameInput.value || b.name).replace(/[^a-z0-9_]/g, '');
    if (!v || v === b.name) { nameInput.value = b.name; return; }
    if (findBone(v)) { toast('A part already has that name.', 'warn'); nameInput.value = b.name; return; }
    for (const other of geo.bones) if (other.parent === b.name) other.parent = v;
    const old = b.name; b.name = v;
    if (selection && selection.bone === old) selection.bone = v;
    setDirty(true); fullRebuild();
  });

  wrap.appendChild(el('div.md-group-title', { text: 'PIVOT (the point it spins around)' }));
  ['x', 'y', 'z'].forEach((ax, i) => {
    wrap.appendChild(numRow('Pivot ' + ax.toUpperCase(), () => b.pivot[i], v => { b.pivot[i] = v; }, { onChange: () => { setDirty(true); fullRebuild(); } }));
  });

  wrap.appendChild(el('div.md-group-title', { text: 'ROTATION' }));
  ['x', 'y', 'z'].forEach((ax, i) => {
    wrap.appendChild(numRow('Rotate ' + ax.toUpperCase(), () => b.rotation[i], v => { b.rotation[i] = v; }, { step: 22.5, onChange: () => { setDirty(true); fullRebuild(); } }));
  });

  wrap.appendChild(el('div.md-group-title', { text: 'PARENT' }));
  const opts = [{ value: '', label: '(none — top level)' }, ...geo.bones.filter(x => x.name !== name && !getDescendants(name).has(x.name)).map(x => ({ value: x.name, label: x.name }))];
  const sel = select(opts, b.parent || '', v => { b.parent = v || null; setDirty(true); fullRebuild(); });
  wrap.appendChild(row('Parent part', sel));

  $propsBody.appendChild(wrap);
}

function renderCubeProps(boneName, idx) {
  const b = findBone(boneName), cube = b && b.cubes[idx];
  if (!cube) return;
  const wrap = el('div', { style: { padding: '0 10px' } });
  wrap.appendChild(el('div.md-group-title', { text: 'BOX POSITION' }));
  ['x', 'y', 'z'].forEach((ax, i) => wrap.appendChild(numRow('Origin ' + ax.toUpperCase(), () => cube.origin[i], v => { cube.origin[i] = v; }, { onChange: () => { setDirty(true); refreshCube(boneName, idx); } })));

  wrap.appendChild(el('div.md-group-title', { text: 'BOX SIZE' }));
  const dims = ['Width', 'Height', 'Depth'];
  dims.forEach((lab, i) => wrap.appendChild(numRow(lab, () => cube.size[i], v => { cube.size[i] = Math.max(fineStep, v); }, { onChange: () => { setDirty(true); refreshCube(boneName, idx); } })));

  wrap.appendChild(el('div.md-group-title', { text: 'PICTURE (UV)' }));
  if (Array.isArray(cube.uv)) {
    wrap.appendChild(numRow('U', () => cube.uv[0], v => { cube.uv[0] = v; }, { onChange: () => { setDirty(true); refreshCube(boneName, idx); } }));
    wrap.appendChild(numRow('V', () => cube.uv[1], v => { cube.uv[1] = v; }, { onChange: () => { setDirty(true); refreshCube(boneName, idx); } }));
  } else {
    wrap.appendChild(el('div.field-hint', { text: 'This box uses per-face pictures — edit those in the JSON for now.' }));
  }
  wrap.appendChild(numRow('Inflate', () => cube.inflate || 0, v => { cube.inflate = v; }, { onChange: () => { setDirty(true); refreshCube(boneName, idx); } }));
  wrap.appendChild(row('Mirror picture', toggle(!!cube.mirror, v => { cube.mirror = v; setDirty(true); refreshCube(boneName, idx); }, cube.mirror ? 'On' : 'Off')));

  if (settings.get('advanced')) {
    wrap.appendChild(el('div.md-group-title', { text: 'ADVANCED: BOX ROTATION' }));
    const centre = G.cubeCentre(cube);
    if (!cube.rotation) cube.rotation = [0, 0, 0];
    if (!cube.pivot) cube.pivot = [...centre];
    ['x', 'y', 'z'].forEach((ax, i) => wrap.appendChild(numRow('Rotate ' + ax.toUpperCase(), () => cube.rotation[i], v => { cube.rotation[i] = v; }, { step: 22.5, onChange: () => { setDirty(true); fullRebuild(); } })));
    ['x', 'y', 'z'].forEach((ax, i) => wrap.appendChild(numRow('Pivot ' + ax.toUpperCase(), () => cube.pivot[i], v => { cube.pivot[i] = v; }, { onChange: () => { setDirty(true); fullRebuild(); } })));
  }

  $propsBody.appendChild(wrap);
}

// ============================================================ tree actions ===
async function addBoneFlow() {
  if (!geo) { toast('Make a model first.', 'warn'); return; }
  const name = await promptBox({ title: 'Name this part', label: 'What is it called?', placeholder: 'e.g. tail', icon: '🦴' });
  if (!name) return;
  const parent = selection ? selection.bone : null;
  const parentBone = parent && findBone(parent);
  let pivot = [0, 0, 0];
  if (parentBone) { const bb = boneBBox(parentBone); pivot = [bb.cx, bb.maxY, bb.cz]; }
  const bone = G.newBone(uniqueBoneName(B.safeName(name).replace(/[^a-z0-9_]/g, '') || 'part'), pivot, parent);
  geo.bones.push(bone);
  setDirty(true); fullRebuild();
  setSelection({ type: 'bone', bone: bone.name });
}

async function addCubeFlow() {
  if (!geo) return;
  let boneName = selection && selection.bone;
  if (!boneName) { toast('Pick a part first!', 'warn'); return; }
  const b = findBone(boneName);
  if (!b) return;
  let origin = [-2, 0, -2], size = [4, 4, 4];
  if (b.cubes.length) {
    const bb = boneBBox(b);
    origin = [bb.cx - 2, bb.maxY, bb.minZ];
    size = [4, 4, 4];
  } else {
    origin = [b.pivot[0] - 2, b.pivot[1], b.pivot[2] - 2];
  }
  const cube = G.newCube(origin, size, [0, 0]);
  b.cubes.push(cube);
  setDirty(true); fullRebuild();
  setSelection({ type: 'cube', bone: boneName, cubeIndex: b.cubes.length - 1 });
}

function duplicateSelected() {
  if (!selection) { toast('Pick something to copy first.', 'warn'); return; }
  if (selection.type === 'cube') {
    const b = findBone(selection.bone), cube = b.cubes[selection.cubeIndex];
    const copy = JSON.parse(JSON.stringify(cube));
    copy.origin = [copy.origin[0] + 1, copy.origin[1], copy.origin[2]];
    b.cubes.splice(selection.cubeIndex + 1, 0, copy);
    setDirty(true); fullRebuild();
    setSelection({ type: 'cube', bone: selection.bone, cubeIndex: selection.cubeIndex + 1 });
  } else {
    const b = findBone(selection.bone);
    const copy = JSON.parse(JSON.stringify(b));
    copy.name = uniqueBoneName(b.name + '_copy');
    copy.pivot = [copy.pivot[0] + 2, copy.pivot[1], copy.pivot[2]];
    const i = geo.bones.indexOf(b);
    geo.bones.splice(i + 1, 0, copy);
    setDirty(true); fullRebuild();
    setSelection({ type: 'bone', bone: copy.name });
  }
}

async function deleteSelected() {
  if (!selection) { toast('Nothing is selected.', 'warn'); return; }
  if (selection.type === 'cube') {
    const ok = await confirmBox({ title: 'Delete box?', body: 'This box will be gone for good.', danger: true, icon: '🗑️' });
    if (!ok) return;
    const b = findBone(selection.bone);
    b.cubes.splice(selection.cubeIndex, 1);
    setDirty(true);
    setSelection(null);
    fullRebuild();
  } else {
    const b = findBone(selection.bone);
    const ok = await confirmBox({ title: 'Delete "' + b.name + '"?', body: 'This part and its boxes will be gone. Any parts attached to it will move up to its parent.', danger: true, icon: '🗑️' });
    if (!ok) return;
    for (const other of geo.bones) if (other.parent === b.name) other.parent = b.parent;
    geo.bones = geo.bones.filter(x => x !== b);
    setDirty(true);
    setSelection(null);
    fullRebuild();
  }
}

async function reparentFlow() {
  if (!selection || selection.type !== 'bone') { toast('Pick a part first (not a box).', 'warn'); return; }
  const b = findBone(selection.bone);
  const banned = getDescendants(b.name);
  const items = [{ value: '', icon: '🚫', label: '(none — top level)' }, ...geo.bones.filter(x => x.name !== b.name && !banned.has(x.name)).map(x => ({ value: x.name, icon: '🦴', label: x.name }))];
  const val = await pickBox({ title: 'Attach "' + b.name + '" to…', icon: '🔗', items });
  if (val === null) return;
  b.parent = val || null;
  setDirty(true); fullRebuild();
}

// ============================================================== quick add ===
const QUICK_PARTS_LIST = [
  { key: 'head', icon: '😀', label: 'Head' },
  { key: 'body', icon: '🫁', label: 'Body' },
  { key: 'arm', icon: '💪', label: 'Arm' },
  { key: 'leg', icon: '🦵', label: 'Leg' },
  { key: 'wing', icon: '🪽', label: 'Wing' },
  { key: 'tail', icon: '🐴', label: 'Tail' },
  { key: 'ear', icon: '👂', label: 'Ear' },
  { key: 'horn', icon: '🦄', label: 'Horn' }
];

function boneBBox(b) {
  if (!b.cubes.length) return { minX: b.pivot[0] - 2, maxX: b.pivot[0] + 2, minY: b.pivot[1], maxY: b.pivot[1] + 4, minZ: b.pivot[2] - 2, maxZ: b.pivot[2] + 2, cx: b.pivot[0], cy: b.pivot[1] + 2, cz: b.pivot[2], w: 4, h: 4, d: 4 };
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of b.cubes) {
    minX = Math.min(minX, c.origin[0]); minY = Math.min(minY, c.origin[1]); minZ = Math.min(minZ, c.origin[2]);
    maxX = Math.max(maxX, c.origin[0] + c.size[0]); maxY = Math.max(maxY, c.origin[1] + c.size[1]); maxZ = Math.max(maxZ, c.origin[2] + c.size[2]);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
}

function quickAdd(key) {
  if (!geo) { toast('Make a model first.', 'warn'); return; }
  const parentBone = selection && findBone(selection.bone);
  const bb = parentBone ? boneBBox(parentBone) : { cx: 0, cy: 0, cz: 0, minX: -4, maxX: 4, minY: 0, maxY: 8, minZ: -4, maxZ: 4, w: 8, h: 8, d: 8 };
  let pivot, size, origin, name, parentName = parentBone ? parentBone.name : null;

  switch (key) {
    case 'head':
      size = [6, 6, 6];
      pivot = [bb.cx, bb.maxY, bb.cz];
      origin = [pivot[0] - size[0] / 2, pivot[1], pivot[2] - size[2] / 2];
      name = 'head'; break;
    case 'body':
      size = parentBone ? [8, 10, 6] : [8, 10, 6];
      pivot = parentBone ? [bb.cx, bb.maxY, bb.cz] : [0, 8, 0];
      origin = [pivot[0] - size[0] / 2, pivot[1], pivot[2] - size[2] / 2];
      name = 'body'; break;
    case 'arm': {
      const side = geo.bones.some(x => x.name.startsWith('arm_r')) ? -1 : 1;
      size = [3, Math.max(4, Math.round(bb.h * 0.9)), 3];
      pivot = [bb.maxX * (side > 0 ? 1 : -1) + (parentBone ? side * 0.5 : side * 5), bb.maxY - 1, bb.cz];
      if (!parentBone) pivot = [side * 5, 8, 0];
      origin = [pivot[0] - size[0] / 2, pivot[1] - size[1], pivot[2] - size[2] / 2];
      name = side > 0 ? 'arm_r' : 'arm_l'; break;
    }
    case 'leg': {
      const side = geo.bones.some(x => x.name.startsWith('leg_r')) ? -1 : 1;
      size = [4, Math.max(4, Math.round((parentBone ? bb.minY : 8))), 4];
      const legX = parentBone ? bb.cx + side * (bb.w * 0.22) : side * 2;
      const topY = parentBone ? bb.minY : 8;
      pivot = [legX, topY, bb.cz];
      size[1] = Math.max(2, topY);
      origin = [legX - size[0] / 2, 0, bb.cz - size[2] / 2];
      name = side > 0 ? 'leg_r' : 'leg_l'; break;
    }
    case 'wing': {
      const side = geo.bones.some(x => x.name.startsWith('wing_r')) ? -1 : 1;
      size = [1, 8, 12];
      pivot = [bb.maxX * (side > 0 ? 1 : -1) + (parentBone ? side * 0.5 : side * 4), bb.maxY - 2, bb.cz];
      if (!parentBone) pivot = [side * 4, 8, 0];
      origin = [pivot[0] - (side > 0 ? 0 : size[0]), pivot[1] - 2, pivot[2] - size[2] / 2];
      name = side > 0 ? 'wing_r' : 'wing_l'; break;
    }
    case 'tail':
      size = [3, 3, 8];
      pivot = [bb.cx, bb.cy, bb.minZ];
      origin = [pivot[0] - size[0] / 2, pivot[1] - size[1] / 2, pivot[2] - size[2]];
      name = 'tail'; break;
    case 'ear': {
      const side = geo.bones.some(x => x.name.startsWith('ear_r')) ? -1 : 1;
      size = [2, 3, 1];
      pivot = [bb.cx + side * (bb.w * 0.3 || 2), bb.maxY, bb.minZ + (bb.d || 4) * 0.2];
      origin = [pivot[0] - size[0] / 2, pivot[1], pivot[2] - size[2] / 2];
      name = side > 0 ? 'ear_r' : 'ear_l'; break;
    }
    case 'horn':
      size = [1, 4, 1];
      pivot = [bb.cx, bb.maxY, bb.cz];
      origin = [pivot[0] - size[0] / 2, pivot[1], pivot[2] - size[2] / 2];
      name = 'horn'; break;
    default: return;
  }
  size = size.map(v => Math.max(1, Math.round(v)));
  const bone = G.newBone(uniqueBoneName(name), pivot, parentName);
  bone.cubes.push(G.newCube(origin.map(v => Math.round(v)), size, [0, 0]));
  geo.bones.push(bone);
  setDirty(true); fullRebuild();
  setSelection({ type: 'bone', bone: bone.name });
  say('Added a ' + name.replace(/_[lr]$/, '') + '! Drag it into place with the Move tool, or use "Mirror" to make the matching side.', { ms: 5000 });
}

// ================================================================= mirror ===
function mirrorName(name) {
  if (/(^|_)left(_|$)/i.test(name)) return name.replace(/left/i, m => m[0] === 'L' ? 'Right' : 'right');
  if (/(^|_)right(_|$)/i.test(name)) return name.replace(/right/i, m => m[0] === 'R' ? 'Left' : 'left');
  if (/_l$/i.test(name)) return name.replace(/_l$/i, m => m === '_L' ? '_R' : '_r');
  if (/_r$/i.test(name)) return name.replace(/_r$/i, m => m === '_R' ? '_L' : '_l');
  if (/0$/.test(name)) return name.slice(0, -1) + '1';
  if (/1$/.test(name)) return name.slice(0, -1) + '0';
  return name + '_mirror';
}

function mirrorSelected() {
  if (!selection || selection.type !== 'bone') { toast('Pick a part (not a box) to mirror.', 'warn'); return; }
  const b = findBone(selection.bone);
  const copy = JSON.parse(JSON.stringify(b));
  copy.name = uniqueBoneName(mirrorName(b.name));
  copy.pivot[0] = -copy.pivot[0];
  if (copy.rotation) { copy.rotation[1] = -copy.rotation[1]; copy.rotation[2] = -copy.rotation[2]; }
  copy.cubes = copy.cubes.map(c => {
    const nc = JSON.parse(JSON.stringify(c));
    nc.origin[0] = -(c.origin[0] + c.size[0]);
    if (nc.rotation) { nc.rotation[1] = -nc.rotation[1]; nc.rotation[2] = -nc.rotation[2]; }
    if (nc.pivot) nc.pivot[0] = -nc.pivot[0];
    nc.mirror = !c.mirror;
    return nc;
  });
  const i = geo.bones.indexOf(b);
  geo.bones.splice(i + 1, 0, copy);
  setDirty(true); fullRebuild();
  setSelection({ type: 'bone', bone: copy.name });
  toast('Made a mirrored copy: ' + copy.name, 'good');
}

// ================================================================= auto uv ===
function cubeFootprint(cube) {
  const [w, h, d] = cube.size.map(v => Math.max(1, Math.round(Math.abs(v))));
  return { w: 2 * (w + d), h: h + d, cw: w, ch: h, cd: d };
}

function packRects(rects, maxWidth) {
  // simple shelf packer: sort tallest-first, fill rows up to maxWidth
  const order = rects.map((r, i) => ({ ...r, i })).sort((a, b) => b.h - a.h);
  let shelfY = 0, shelfX = 0, shelfH = 0, usedW = 0;
  const placed = new Array(rects.length);
  for (const r of order) {
    if (shelfX + r.w > maxWidth && shelfX > 0) { shelfY += shelfH; shelfX = 0; shelfH = 0; }
    placed[r.i] = { x: shelfX, y: shelfY };
    shelfX += r.w; shelfH = Math.max(shelfH, r.h); usedW = Math.max(usedW, shelfX);
  }
  return { placed, height: shelfY + shelfH, width: usedW };
}

function allCubesFlat() {
  const out = [];
  for (const b of geo.bones) b.cubes.forEach((c, ci) => out.push({ bone: b.name, cubeIndex: ci, cube: c }));
  return out;
}

function roundUp16(n) { return Math.max(16, Math.ceil(n / 16) * 16); }

async function autoUV() {
  if (!geo || !geo.bones.length) { toast('Add some boxes first.', 'warn'); return; }
  const list = allCubesFlat().filter(x => Array.isArray(x.cube.uv));
  if (!list.length) { toast('Nothing to pack — these boxes use per-face pictures.', 'warn'); return; }
  const rects = list.map(x => cubeFootprint(x.cube));
  const maxWidth = geo.tw || 64;
  const { placed, width, height } = packRects(rects, maxWidth);
  const newTw = roundUp16(width), newTh = roundUp16(height);
  const ok = await confirmBox({
    title: 'Auto UV', icon: '🧩',
    body: `Smallest picture size that fits every box: <b>${newTw} × ${newTh}</b> pixels (you have ${geo.tw} × ${geo.th}). Repack the boxes and update the picture size now?`,
    ok: 'Yes, repack', cancel: 'Cancel'
  });
  if (!ok) return;
  list.forEach((x, i) => { x.cube.uv = [placed[i].x, placed[i].y]; });
  geo.tw = newTw; geo.th = newTh;
  setDirty(true); fullRebuild();
  toast('Boxes repacked onto a ' + newTw + '×' + newTh + ' picture.', 'good');
}

function showUVMapPreview() {
  if (!geo) { toast('Open a model first.', 'warn'); return; }
  const scale = geo.tw <= 64 ? 6 : geo.tw <= 128 ? 4 : 2;
  const cv = el('canvas.md-uv-canvas', { width: geo.tw * scale, height: geo.th * scale });
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (texture && texture.image) { try { ctx.drawImage(texture.image, 0, 0, cv.width, cv.height); } catch (e) { /* ignore */ } }
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
  for (let x = 0; x <= geo.tw; x += 8) { ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, cv.height); ctx.stroke(); }
  for (let y = 0; y <= geo.th; y += 8) { ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(cv.width, y * scale); ctx.stroke(); }
  const colors = ['#ff8ad8', '#7ca8ff', '#6cc349', '#ffc83c', '#c08cff', '#ff5a49'];
  let ci = 0;
  for (const b of geo.bones) {
    for (const cube of b.cubes) {
      if (!Array.isArray(cube.uv)) continue;
      const col = colors[ci++ % colors.length];
      const rects = G.faceRects(cube);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (const r of rects) {
        const x0 = Math.min(r.x0, r.x1) * scale, x1 = Math.max(r.x0, r.x1) * scale;
        const y0 = Math.min(r.y0, r.y1) * scale, y1 = Math.max(r.y0, r.y1) * scale;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
      }
    }
  }
  modal({
    title: 'UV map — ' + geo.tw + '×' + geo.th, icon: '🗺️', wide: true,
    body: el('div.md-uv-canvas-wrap', {}, [cv]),
    buttons: [{ label: 'Close', kind: 'good', value: true }]
  });
}

// =========================================================== visible bounds ===
function updateBoundsHelper() {
  if (vbHelper) { vbHelper.parent && vbHelper.parent.remove(vbHelper); vbHelper = null; }
  if (!showBounds || !geo || !scene) return;
  const w = Math.max(0.1, geo.vbw), h = Math.max(0.1, geo.vbh);
  const vo = geo.vbo || [0, 1, 0];
  vbHelper = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, w)), new THREE.LineBasicMaterial({ color: 0x7ca8ff }));
  vbHelper.position.set(vo[0], vo[1], -vo[2]);
  scene.add(vbHelper);
}

function checkBounds() {
  if (!built || !geo) { $vbWarn.style.display = 'none'; return; }
  const box = new THREE.Box3().setFromObject(built.root);
  const w = Math.max(0.1, geo.vbw), h = Math.max(0.1, geo.vbh);
  const vo = geo.vbo || [0, 1, 0];
  const halfW = w / 2, halfH = h / 2;
  const minX = vo[0] - halfW, maxX = vo[0] + halfW;
  const minY = vo[1] - halfH, maxY = vo[1] + halfH;
  const minZ = -vo[2] - halfW, maxZ = -vo[2] + halfW;
  const eps = 0.01;
  const over = box.min.x < minX - eps || box.max.x > maxX + eps || box.min.y < minY - eps || box.max.y > maxY + eps || box.min.z < minZ - eps || box.max.z > maxZ + eps;
  $vbWarn.style.display = over ? 'flex' : 'none';
}

function fixBounds() {
  if (!built || !geo) return;
  const box = new THREE.Box3().setFromObject(built.root);
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const h = box.max.y - box.min.y;
  geo.vbw = Math.ceil((w + 0.3) * 2) / 2;
  geo.vbh = Math.ceil((h + 0.3) * 2) / 2;
  geo.vbo = [Math.round(((box.min.x + box.max.x) / 2) * 100) / 100, Math.round(((box.min.y + box.max.y) / 2) * 100) / 100, -Math.round(((box.min.z + box.max.z) / 2) * 100) / 100];
  setDirty(true);
  showBounds = true; flag.set('model:showBounds', true);
  if ($root && $root._boundsBtn) $root._boundsBtn.classList.add('on');
  updateBoundsHelper();
  checkBounds();
  toast('Visible bounds fixed!', 'good');
}

// ==================================================================== export ===
export default { id: 'model', title: 'Model', icon: '🧱', mount, show, hide, onFileChange: handleFileChange };

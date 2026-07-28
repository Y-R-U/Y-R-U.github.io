// Animate tool — the Blockbench "Animate" tab replacement.
// Pick a model + an animation file, pose bones on a timeline of keyframes ("poses you saved"),
// generate whole animations from one tap with Presets, and wire each animation onto the mob.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fs, baseName } from '../core/fs.js';
import { el, clear, toast, button, confirmBox, promptBox, select } from '../core/ui.js';
import { settings } from '../core/store.js';
import { tour, say, award } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { safeName, titleCase } from '../lib/bedrock.js';
import { parseGeoFile, buildGeo, resetPose, disposeBuilt, makeTexture, makeMaterial, measure } from '../lib/geo.js';
import { parseAnimFile, sampleAnim, applyPose, animsToJSON, newAnim, ensureBone, setKey, removeKey, keyTimes } from '../lib/anim.js';
import { checkMolang } from '../lib/molang.js';

// ----------------------------------------------------------------- layout ---
let PX_PER_SEC = 140;   // recomputed per render to fit the timeline width
const LABEL_W = 96;
const LERP_LABEL = { linear: 'Smooth', catmullrom: 'Curvy', step: 'Jump' };
const PRESET_DEFS = [
  { key: 'walk', icon: '🚶', label: 'Walk', gen: genWalk },
  { key: 'run', icon: '🏃', label: 'Run', gen: genRun },
  { key: 'idle', icon: '😌', label: 'Idle', gen: genIdle },
  { key: 'attack', icon: '⚔️', label: 'Attack', gen: genAttack },
  { key: 'jump', icon: '🦘', label: 'Jump', gen: genJump },
  { key: 'spin', icon: '🌀', label: 'Spin', gen: genSpin },
  { key: 'dance', icon: '💃', label: 'Dance', gen: genDance },
  { key: 'wave', icon: '👋', label: 'Wave', gen: genWave },
  { key: 'die', icon: '💀', label: 'Die', gen: genDie }
];

const CSS = `
.an-pane { width:100%; height:100%; display:flex; flex-direction:column; min-height:0; }
.an-top { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:8px 10px; background:var(--panel); border-bottom:2px solid #000; box-shadow: inset 0 -1px 0 var(--edge); }
.an-top .grp { display:flex; align-items:center; gap:5px; }
.an-top select.field { width:auto; min-width:120px; padding:8px 10px; font-size:.88em; }
.an-top .lbl { font-size:.78em; color:var(--dim); font-weight:700; margin-right:2px; }
.an-sep-v { width:2px; height:26px; background:var(--edge); margin:0 2px; }
.an-empty-wrap { flex:1; display:flex; align-items:center; justify-content:center; }
.an-split2 { flex:1; min-height:0; display:flex; }
.an-side { width:270px; flex:0 0 270px; background:var(--panel); border-right:2px solid #000; box-shadow:inset -1px 0 0 var(--edge); overflow-y:auto; padding:10px; }
.an-body2 { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }
.an-bonelist { display:flex; flex-direction:column; gap:2px; margin-bottom:12px; max-height:170px; overflow-y:auto; border:2px solid var(--edge); border-radius:8px; padding:4px; background:var(--bg2); }
.an-bone-item { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:.85em; }
.an-bone-item:hover { background:var(--panel2); }
.an-bone-item.on { background:var(--panel3); color:#fff; box-shadow:inset 0 0 0 1px var(--grass); }
.an-bone-item .dot { width:7px; height:7px; border-radius:50%; background:var(--edge2); flex:none; }
.an-bone-item.has .dot { background:var(--gold); }
.an-kindblock { margin-bottom:12px; border-top:1px solid var(--edge); padding-top:8px; }
.an-kindblock .kt { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.an-kindblock .kt b { font-size:.82em; color:var(--gold); font-family:var(--pixel); letter-spacing:.3px; font-size:9px; }
.an-fbtn { background:none; border:1px solid var(--edge2); color:var(--dim); border-radius:6px; font-size:.72em; padding:2px 6px; cursor:pointer; }
.an-fbtn.on { background:var(--violet); color:#1c0f2e; border-color:var(--violet); }
.an-axis { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
.an-axis-l { width:12px; font-size:.78em; color:var(--dim); font-weight:700; flex:none; }
.an-numslider { display:flex; align-items:center; gap:6px; flex:1; }
.an-numslider input.range { flex:1; }
.an-numslider input.an-num { width:56px; flex:none; padding:5px 6px; font-size:.8em; }
.an-formula { display:flex; flex-direction:column; gap:4px; }
.an-formula input.field { font-family:var(--mono); font-size:.78em; padding:6px 8px; }
.an-formula .err { color:var(--red); font-size:.72em; }
.an-posebtns { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
.an-presets { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.an-preset-btn { flex:1 1 76px; }
.an-viewport { flex:1; min-height:120px; position:relative; background:radial-gradient(circle at 50% 30%, #1b2f42, #0d0e13 72%); }
.an-viewport canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.an-vp-tag { position:absolute; left:10px; top:10px; background:rgba(15,17,22,.75); border:2px solid #000; border-radius:8px; padding:6px 10px; font-size:.82em; pointer-events:none; }
.an-timeline { flex:0 0 auto; height:230px; display:flex; flex-direction:column; background:var(--panel); border-top:2px solid #000; box-shadow: inset 0 1px 0 var(--edge); }
.an-tl-toolbar { display:flex; align-items:center; gap:8px; padding:6px 10px; flex-wrap:wrap; border-bottom:1px solid var(--edge); }
.an-tl-toolbar .lbl { font-size:.78em; color:var(--dim); }
.an-tl-toolbar input.field, .an-tl-toolbar select.field { width:auto; padding:6px 8px; font-size:.82em; }
.an-tl-time { font-family:var(--mono); font-size:.82em; color:var(--dim); margin-left:auto; }
.an-tl-scroll { flex:1; overflow:auto; position:relative; }
.an-tl-inner { position:relative; min-width:100%; }
.an-tl-ruler { display:flex; height:24px; position:sticky; top:0; z-index:3; background:var(--panel); border-bottom:1px solid var(--edge); }
.an-tl-ruler-gutter { width:96px; flex:0 0 96px; position:sticky; left:0; z-index:4; background:var(--panel); }
.an-tl-ruler-track { position:relative; flex:none; }
.an-tl-tick { position:absolute; top:0; bottom:0; border-left:1px solid var(--edge2); padding-left:3px; font-size:.7em; color:var(--dim); display:flex; align-items:flex-end; padding-bottom:2px; }
.an-tl-rows { }
.an-tl-row { display:flex; align-items:stretch; height:34px; border-bottom:1px solid var(--edge); position:relative; }
.an-tl-row.on { background:rgba(108,195,73,.06); }
.an-tl-label { width:96px; flex:0 0 96px; position:sticky; left:0; z-index:2; background:var(--panel); display:flex; align-items:center; padding:0 8px; font-size:.78em; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-right:1px solid var(--edge); }
.an-tl-row.on .an-tl-label { color:#fff; font-weight:700; }
.an-tl-track { position:relative; flex:none; }
.an-key { position:absolute; top:50%; width:40px; height:40px; margin-top:-20px; margin-left:0; background:none; border:none; cursor:grab; touch-action:none; padding:0; }
.an-key::after { content:''; position:absolute; left:50%; top:50%; width:13px; height:13px; background:var(--sky); border:2px solid #000; transform:translate(-50%,-50%) rotate(45deg); }
.an-key.on::after { background:var(--grass); box-shadow:0 0 0 4px rgba(108,195,73,.32); }
.an-playhead { position:absolute; top:0; bottom:0; width:2px; background:var(--red); z-index:5; pointer-events:none; }
.an-playhead-handle { position:absolute; top:-2px; left:50%; width:36px; height:20px; margin-left:-18px; background:var(--red); border:2px solid #000; border-radius:6px; cursor:grab; pointer-events:auto; touch-action:none; }
.an-keyopts { display:flex; align-items:center; gap:8px; padding:6px 10px; border-top:1px solid var(--edge); }
.an-lerp-chip { padding:6px 12px; }
.an-empty-tl { flex:1; display:flex; align-items:center; justify-content:center; color:var(--dim); font-size:.9em; text-align:center; padding:14px; }
.an-wirehint { font-size:.78em; color:var(--dim); }
@media (max-width: 900px) {
  .an-side { width:100%; flex:0 0 auto; max-height:44vh; border-right:none; border-bottom:2px solid #000; }
  .an-split2 { flex-direction:column; }
  .an-timeline { height:210px; }
}
`;
let cssInjected = false;

// ------------------------------------------------------------------ state ---
const state = {
  modelPath: null, geo: null, modelShort: null, built: null, texturePath: null,
  animPath: null, anims: {}, animName: null, get anim() { return this.animName ? this.anims[this.animName] : null; },
  time: 0, playing: false, snap: 0.05,
  selectedBone: null, selectedKey: null, autoKey: true, pendingPose: null,
  dirty: false, entityPath: null
};

// three.js bits, created once in mount()
let scene, camera, renderer, controls, groundDisc, boneHelper, rafId = null, lastT = 0, ro = null;

// dom refs
let $root, $modelSel, $fileSel, $animSel, $wireSel, $wireHint, $saveBtn, $saveDot;
let $side, $bonelist, $poseEmpty, $poseWrap, $posePresets;
let $viewportWrap, $vpTag, $tlWrap, $tlToolbar, $playBtn, $loopSel, $lenField, $snapField, $timeLbl;
let $rulerTrack, $rulerGutterSpacer, $rowsWrap, $tlInner, $playhead, $keyopts, $mainArea, $emptyOverlay;
const kindCtrl = {}; // rotation/position/scale -> {axes:[ns,ns,ns], fbtn, fwrap, finputs:[input,input,input], ferr}

// ===================================================================== mount
function mount(root) {
  if (!cssInjected) { document.head.appendChild(el('style', { text: CSS })); cssInjected = true; }
  $root = el('div.an-pane');
  root.appendChild($root);
  buildTop();
  $mainArea = el('div', { style: { flex: '1', minHeight: '0', display: 'flex' } });
  $root.appendChild($mainArea);
  buildScene(); // built exactly once — the renderer/scene live for the tool's whole lifetime
}

function buildTop() {
  // Built as bare <select>s (not via the ui.js select() helper) because rebuildSelect() below
  // re-populates them repeatedly and drives .onchange itself — using select() too would attach
  // a second, duplicate change listener that fires alongside it.
  $modelSel = el('select.field');
  rebuildSelect($modelSel, [{ value: '', label: 'No model yet' }], '', v => v && selectModel(v));
  $fileSel = el('select.field');
  rebuildSelect($fileSel, [], '', v => v && selectAnimFile(v));
  $animSel = el('select.field');
  rebuildSelect($animSel, [], '', v => v && selectAnimByName(v));
  $wireSel = select([
    { value: 'always', label: 'Always' }, { value: 'walk', label: 'When walking' },
    { value: 'attack', label: 'When attacking' }, { value: 'never', label: 'Never (testing)' }
  ], 'never', v => setWireMode(v));
  $wireHint = el('span.an-wirehint');
  $saveDot = el('span', { text: '', style: { color: 'var(--gold)', fontSize: '.8em' } });
  $saveBtn = button('Save', {
    icon: '💾', kind: 'good', hint: 'Saves your animations into the real animation file.',
    onClick: () => saveAnimFile(false)
  });

  const top = el('div.an-top', {}, [
    el('div.grp', {}, [el('span.lbl', { text: 'Model' }), $modelSel]),
    el('div.an-sep-v'),
    el('div.grp', {}, [el('span.lbl', { text: 'File' }), $fileSel]),
    el('div.an-sep-v'),
    el('div.grp', {}, [
      el('span.lbl', { text: 'Animation' }), $animSel,
      button('', { icon: '➕', hint: 'Make a brand new animation.', onClick: newAnimation }),
      button('', { icon: '✏️', hint: 'Rename this animation.', onClick: renameAnimation }),
      button('', { icon: '📋', hint: 'Duplicate this animation.', onClick: duplicateAnimation }),
      button('', { icon: '🗑️', hint: 'Delete this animation.', onClick: deleteAnimation })
    ]),
    el('div.an-sep-v'),
    el('div.grp#anWireRow', { dataset: { hint: 'Tell your mob when to play this animation.' } }, [
      el('span.lbl', { text: 'When does this play?' }), $wireSel, $wireHint
    ]),
    el('div', { style: { flex: '1' } }),
    $saveDot, $saveBtn
  ]);
  $root.appendChild(top);
}

// ---------------------------------------------------------------- 3D scene ---
function buildScene() {
  $viewportWrap = el('div#anViewport.an-viewport');
  $vpTag = el('div.an-vp-tag', { text: 'Tap the model to pick a part' });
  $viewportWrap.appendChild($vpTag);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $viewportWrap.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11131a);
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(0, 1.2, 2.6);

  const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1508, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(2, 3, 2.5);
  scene.add(hemi, dir, new THREE.AmbientLight(0xffffff, 0.25));

  const gg = new THREE.CircleGeometry(1, 32);
  const gm = new THREE.MeshBasicMaterial({ map: groundTexture(), transparent: true, depthWrite: false });
  groundDisc = new THREE.Mesh(gg, gm);
  groundDisc.rotation.x = -Math.PI / 2;
  scene.add(groundDisc);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(0, 0.8, 0);
  controls.minDistance = 0.4;
  controls.maxDistance = 12;

  ro = new ResizeObserver(() => resizeRenderer());
  ro.observe($viewportWrap);

  let downX = 0, downY = 0, downT = 0;
  renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
  renderer.domElement.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && performance.now() - downT < 450) pickBoneAt(e);
  });

  buildTimeline();

  $emptyOverlay = el('div.empty', {
    style: { position: 'absolute', inset: '0', zIndex: '50', background: 'var(--bg)', display: 'none' }
  }, [
    el('div.big', { text: '🤸' }),
    el('h3', { text: 'No models to animate yet' }),
    el('p', { text: 'Build a model first, then come back here to make it move.' }),
    button('Go to Model tool', { icon: '🧱', kind: 'primary', onClick: () => window.openTool && window.openTool('model') })
  ]);
  $viewportWrap.appendChild($emptyOverlay);

  $side = el('div.an-side');
  const bodyWrap = el('div.an-body2', {}, [$viewportWrap, $tlWrap]);
  const split = el('div.an-split2', { style: { flex: '1', minWidth: '0' } }, [$side, bodyWrap]);
  $mainArea.appendChild(split);
  buildSidePanel();
}

function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function resizeRenderer() {
  const w = $viewportWrap.clientWidth || 1, h = $viewportWrap.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function pickBoneAt(e) {
  if (!state.built) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(state.built.meshes, false);
  if (hits.length) { sfx.play('click'); selectBone(hits[0].object.userData.bone); }
}

function frameCamera() {
  const m = measure(state.built);
  // Negative Z so we watch the mob's face, not its back (north is -Z), and far enough out that
  // the short viewport between the toolbar and the timeline doesn't crop it.
  const dist = Math.max(1.6, m.size.length() * 2.1);
  camera.position.set(dist * 0.25, m.centre.y + m.size.y * 0.15, -dist);
  controls.target.set(0, m.centre.y, 0);
  controls.update();
  const gs = Math.max(0.6, m.size.x, m.size.z) * 1.7;
  groundDisc.position.set(m.centre.x, m.box.min.y - 0.01, m.centre.z);
  groundDisc.scale.set(gs, gs, gs);
}

// ------------------------------------------------------------- render loop --
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  const dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0;
  lastT = ts;
  if (state.playing && state.anim) {
    state.time += dt;
    const len = state.anim.length || 1;
    if (state.anim.loop === true) state.time = len > 0 ? ((state.time % len) + len) % len : 0;
    else if (state.time >= len) { state.time = len; state.playing = false; updatePlayBtn(); }
    updatePlayheadUI();
    refreshPosePanel();
  }
  controls.update();
  renderFrame();
  renderer.render(scene, camera);
}
function startLoop() { if (rafId == null) { lastT = 0; rafId = requestAnimationFrame(loop); } }
function stopLoop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

function renderFrame() {
  if (!state.built) return;
  resetPose(state.built);
  if (state.anim) {
    const pose = sampleAnim(state.anim, state.time, { 'query.modified_move_speed': 1, 'query.ground_speed': 1 });
    if (!state.autoKey && state.selectedBone && state.pendingPose) {
      pose[state.selectedBone] = { ...(pose[state.selectedBone] || {}), ...state.pendingPose };
    }
    applyPose(state.built, pose);
  }
  if (boneHelper) boneHelper.update();
}

// =============================================================== model list =
function listModels() {
  return [...new Set([...fs.findAll('RP/models/**/*.geo.json'), ...fs.findAll('RP/models/*.geo.json')])].sort();
}
function listAnimFiles() {
  return [...new Set([...fs.findAll('RP/animations/*.animation.json'), ...fs.findAll('RP/animations/**/*.animation.json')])].sort();
}
function findEntityForModel(geoIdentifier) {
  if (!geoIdentifier) return null;
  for (const p of fs.findAll('RP/entity/*.entity.json')) {
    const j = fs.readJSON(p);
    const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    const g = desc && desc.geometry && (desc.geometry.default || Object.values(desc.geometry)[0]);
    if (g === geoIdentifier) return p;
  }
  return null;
}
function findTextureForModel(geoIdentifier, modelPath) {
  const entPath = findEntityForModel(geoIdentifier);
  if (entPath) {
    const j = fs.readJSON(entPath);
    const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    const tex = desc && desc.textures && (desc.textures.default || Object.values(desc.textures)[0]);
    if (tex) return 'RP/' + String(tex).replace(/^\/+/, '') + '.png';
  }
  const short = baseName(modelPath).replace(/\.geo\.json$/, '');
  return fs.find(`RP/textures/entity/**/${short}.png`) || fs.find(`RP/textures/entity/${short}.png`) || null;
}

function refreshModelSelect() {
  const list = listModels();
  const opts = list.map(p => ({ value: p, label: baseName(p).replace(/\.geo\.json$/, '') }));
  rebuildSelect($modelSel, opts.length ? opts : [{ value: '', label: 'No models yet' }], state.modelPath || '', v => v && selectModel(v));
  if ($emptyOverlay) $emptyOverlay.style.display = list.length ? 'none' : 'flex';
}

function rebuildSelect(node, opts, value, onChange) {
  clear(node);
  for (const o of opts) node.appendChild(el('option', { value: o.value, text: o.label, selected: o.value === value }));
  node.value = value;
  node.onchange = () => onChange(node.value);
}

async function selectModel(path) {
  if (!fs.exists(path)) return;
  const list = parseGeoFile(fs.readJSON(path));
  if (!list.length) { toast('That model file has no shapes in it yet.', 'bad'); return; }
  state.modelPath = path;
  state.geo = list[0];
  state.modelShort = state.geo.identifier.replace(/^geometry\./, '');
  state.selectedBone = null; state.selectedKey = null; state.pendingPose = null;
  if (boneHelper) { scene.remove(boneHelper); boneHelper.geometry.dispose(); boneHelper.material.dispose(); boneHelper = null; }
  rebuildSelect($modelSel, listModels().map(p => ({ value: p, label: baseName(p).replace(/\.geo\.json$/, '') })), path, v => v && selectModel(v));
  await rebuildModel();
  // Always default to THIS model's own animation file (never keep the previous model's path,
  // which would still exist on disk and so looked "valid" if we tested it instead).
  const defPath = `RP/animations/${state.modelShort}.animation.json`;
  refreshFileSelect(defPath);
  selectAnimFile(defPath);
}

async function rebuildModel() {
  if (state.built) {
    const mat = state.built.meshes[0] && state.built.meshes[0].material;
    disposeBuilt(state.built);
    if (mat) { mat.map && mat.map.dispose(); mat.dispose(); }
    state.built = null;
  }
  let img = null;
  state.texturePath = findTextureForModel(state.geo.identifier, state.modelPath);
  if (state.texturePath && fs.exists(state.texturePath)) {
    try { img = await fs.image(state.texturePath); } catch (e) { img = null; }
  }
  const material = makeMaterial(img ? makeTexture(img) : null);
  state.built = buildGeo(state.geo, material);
  scene.add(state.built.root);
  frameCamera();
  refreshBoneList();
  refreshWireSelect();
}

function refreshFileSelect(defPath) {
  const files = listAnimFiles();
  const opts = files.map(p => ({ value: p, label: baseName(p) }));
  if (!files.includes(defPath)) opts.unshift({ value: defPath, label: baseName(defPath) + ' (new)' });
  rebuildSelect($fileSel, opts, state.animPath || defPath, v => v && selectAnimFile(v));
}

function selectAnimFile(path) {
  state.animPath = path;
  const json = fs.exists(path) ? fs.readJSON(path) : { animations: {} };
  state.anims = parseAnimFile(json) || {};
  const names = Object.keys(state.anims);
  state.animName = names[0] || null;
  state.time = 0; state.playing = false; state.selectedKey = null;
  state.dirty = false;
  refreshFileSelect(path);
  refreshAnimSelect();
  refreshWireSelect();
  refreshAll();
}

function refreshAnimSelect() {
  const names = Object.keys(state.anims);
  const opts = names.map(n => ({ value: n, label: niceAnimLabel(n) }));
  rebuildSelect($animSel, opts.length ? opts : [{ value: '', label: 'No animations yet' }], state.animName || '', v => v && selectAnimByName(v));
}
function niceAnimLabel(fullName) { return titleCase(fullName.split('.').pop()); }

function selectAnimByName(name) {
  state.animName = name;
  state.time = 0; state.playing = false; state.selectedKey = null;
  refreshAnimSelect();
  refreshWireSelect();
  refreshAll();
}

// ============================================================== side panel =
function buildSidePanel() {
  clear($side);
  $bonelist = el('div.an-bonelist');
  $poseEmpty = el('div', { text: 'Pick a part below (or tap the model) to pose it.', style: { color: 'var(--dim)', fontSize: '.85em', marginBottom: '10px' } });
  $poseWrap = el('div', { style: { display: 'none' } });
  buildPoseControls();
  $posePresets = el('div');
  buildPresets();

  $side.append(
    el('div.field-label', { text: 'Parts' }),
    $bonelist,
    $poseEmpty, $poseWrap,
    el('div.hr'),
    el('div.field-label', { text: 'Instant animations', id: 'anPresets' }),
    $posePresets
  );
}

function refreshBoneList() {
  clear($bonelist);
  if (!state.geo) return;
  const bones = state.geo.bones;
  const depthCache = new Map();
  const depthOf = name => {
    if (depthCache.has(name)) return depthCache.get(name);
    const b = bones.find(x => x.name === name);
    const d = (b && b.parent) ? 1 + depthOf(b.parent) : 0;
    depthCache.set(name, d); return d;
  };
  for (const b of bones) {
    const has = state.anim ? keyTimes(state.anim, b.name).length > 0 : false;
    const row = el('div.an-bone-item' + (b.name === state.selectedBone ? '.on' : '') + (has ? '.has' : ''), {
      style: { paddingLeft: (8 + depthOf(b.name) * 12) + 'px' },
      on: { click: () => selectBone(b.name) }
    }, [el('span.dot'), el('span', { text: b.name })]);
    $bonelist.appendChild(row);
  }
}

function selectBone(name) {
  state.selectedBone = name;
  state.pendingPose = null;
  state.selectedKey = null;
  if (boneHelper) { scene.remove(boneHelper); boneHelper.geometry.dispose(); boneHelper.material.dispose(); boneHelper = null; }
  const g = state.built && state.built.bones.get(name);
  if (g) { boneHelper = new THREE.BoxHelper(g, 0xffc83c); scene.add(boneHelper); }
  refreshBoneList();
  refreshPosePanel();
  refreshTimeline();
}

// ---- pose controls (rotation / position / scale, per-axis slider+number) ---
function buildPoseControls() {
  const autoRow = el('label.switch', {}, [
    el('input', { type: 'checkbox', checked: state.autoKey, on: { change: e => { state.autoKey = e.target.checked; state.pendingPose = null; refreshPosePanel(); } } }),
    el('span.slider'), el('span.switch-label', { text: 'Auto-key (save a pose as I move things)' })
  ]);
  const kindDefs = [
    { kind: 'rotation', title: 'ROTATION — how it is turned', min: -180, max: 180, step: 1, base: 0 },
    { kind: 'position', title: 'POSITION — how it is moved', min: -30, max: 30, step: 0.1, base: 0 },
    { kind: 'scale', title: 'SIZE — how big it is', min: 0.05, max: 3, step: 0.01, base: 1 }
  ];
  const blocks = kindDefs.map(d => buildKindBlock(d));
  const btnRow = el('div.an-posebtns', {}, [
    button('Save pose', { icon: '💾', kind: 'primary', hint: 'Saves what you see right now as a keyframe.', onClick: savePoseNow }),
    button('Reset this part', { icon: '↩️', kind: 'ghost', hint: 'Clears any saved pose for this part at this moment in time.', onClick: resetBoneAtTime })
  ]);
  $poseWrap.append(el('div', {}, [autoRow]), ...blocks.map(b => b.wrap), btnRow);
}

function buildKindBlock({ kind, title, min, max, step, base }) {
  const fbtn = button('ƒ(x)', { kind: 'ghost', title: 'Type a formula instead of using sliders (advanced).', onClick: () => toggleFormula(kind) });
  fbtn.classList.add('an-fbtn');
  const axesWrap = el('div');
  const axes = ['X', 'Y', 'Z'].map((letter, i) => {
    const ns = numSlider(min, max, step, base, v => onPoseChange(kind, i, v));
    axesWrap.appendChild(el('div.an-axis', {}, [el('span.an-axis-l', { text: letter }), ns.el]));
    return ns;
  });
  const finputs = ['X', 'Y', 'Z'].map((letter, i) => {
    const inp = el('input.field', { type: 'text', placeholder: `e.g. math.sin(query.anim_time * 360) * 20` });
    inp.addEventListener('input', () => onFormulaChange(kind, i, inp.value));
    return inp;
  });
  const ferr = el('div.err');
  const fwrap = el('div.an-formula', { style: { display: 'none' } }, [
    el('div.an-axis', {}, [el('span.an-axis-l', { text: 'X' }), finputs[0]]),
    el('div.an-axis', {}, [el('span.an-axis-l', { text: 'Y' }), finputs[1]]),
    el('div.an-axis', {}, [el('span.an-axis-l', { text: 'Z' }), finputs[2]]),
    ferr
  ]);
  kindCtrl[kind] = { axes, fbtn, fwrap, finputs, ferr, axesWrap };
  fbtn.style.display = settings.get('advanced') ? '' : 'none';
  const header = el('div.kt', {}, [el('b', { text: title }), fbtn]);
  const wrap = el('div.an-kindblock', {}, [header, axesWrap, fwrap]);
  return { wrap };
}

function numSlider(min, max, step, value, onChange) {
  const range = el('input.range', { type: 'range', min, max, step, value });
  const num = el('input.field.an-num', { type: 'number', min, max, step, value });
  const fire = v => { v = Math.min(max, Math.max(min, v)); range.value = v; num.value = round2(v); onChange(v); };
  range.addEventListener('input', () => fire(parseFloat(range.value)));
  num.addEventListener('change', () => fire(parseFloat(num.value) || 0));
  const wrap = el('span.an-numslider', {}, [range, num]);
  return { el: wrap, set(v) { range.value = v; num.value = round2(v); } };
}
function round2(v) { return Math.round(v * 100) / 100; }

function poseFor(anim, bone, time) {
  if (!anim || !bone) return { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1] };
  const p = sampleAnim(anim, time, { 'query.modified_move_speed': 1, 'query.ground_speed': 1 })[bone] || {};
  return { rotation: p.rotation || [0, 0, 0], position: p.position || [0, 0, 0], scale: p.scale || [1, 1, 1] };
}
function isFormula(anim, bone, kind) {
  const c = anim && anim.bones[bone] && anim.bones[bone][kind];
  return !!(c && c.static && c.static.some(v => typeof v === 'string'));
}

function refreshPosePanel() {
  const show = !!(state.anim && state.selectedBone);
  $poseEmpty.style.display = show ? 'none' : '';
  $poseWrap.style.display = show ? '' : 'none';
  if (!show) return;
  const pose = poseFor(state.anim, state.selectedBone, state.time);
  if (state.pendingPose) Object.assign(pose, state.pendingPose);
  for (const kind of ['rotation', 'position', 'scale']) {
    const c = kindCtrl[kind];
    const f = isFormula(state.anim, state.selectedBone, kind);
    c.axesWrap.style.display = f ? 'none' : '';
    c.fwrap.style.display = f ? '' : 'none';
    c.fbtn.classList.toggle('on', f);
    c.fbtn.style.display = settings.get('advanced') ? '' : 'none';
    if (!f) { pose[kind].forEach((v, i) => c.axes[i].set(v)); }
    else {
      const stat = state.anim.bones[state.selectedBone][kind].static;
      c.finputs.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = String(stat[i]); });
    }
  }
}

function currentLerpAt(anim, bone, kind, time) {
  const ch = anim.bones[bone] && anim.bones[bone][kind];
  if (ch && ch.keys) { const k = ch.keys.find(k => Math.abs(k.t - time) < 0.001); if (k) return k.lerp; }
  return 'linear';
}

function onPoseChange(kind, axis, v) {
  if (!state.anim || !state.selectedBone) return;
  const pose = poseFor(state.anim, state.selectedBone, state.time);
  if (state.pendingPose && state.pendingPose[kind]) pose[kind] = state.pendingPose[kind].slice();
  pose[kind][axis] = v;
  if (state.autoKey) {
    const lerp = currentLerpAt(state.anim, state.selectedBone, kind, state.time);
    setKey(state.anim, state.selectedBone, kind, state.time, pose[kind], lerp);
    markDirty();
    refreshTimeline();
    refreshBoneList();
  } else {
    state.pendingPose = state.pendingPose || {};
    state.pendingPose[kind] = pose[kind];
  }
}

function savePoseNow() {
  if (!state.anim || !state.selectedBone) return;
  const pose = poseFor(state.anim, state.selectedBone, state.time);
  if (state.pendingPose) Object.assign(pose, state.pendingPose);
  for (const kind of ['rotation', 'position', 'scale']) {
    if (isFormula(state.anim, state.selectedBone, kind)) continue;
    const lerp = currentLerpAt(state.anim, state.selectedBone, kind, state.time);
    setKey(state.anim, state.selectedBone, kind, state.time, pose[kind], lerp);
  }
  state.pendingPose = null;
  markDirty();
  refreshTimeline();
  refreshBoneList();
  toast('Pose saved!', 'good');
}

function resetBoneAtTime() {
  if (!state.anim || !state.selectedBone) return;
  let any = false;
  for (const kind of ['rotation', 'position', 'scale']) if (removeKey(state.anim, state.selectedBone, kind, state.time)) any = true;
  if (any) { markDirty(); refreshAll(); toast('Cleared that pose.', 'good'); }
  else toast('No saved pose here yet.', 'info');
}

function toggleFormula(kind) {
  if (!state.anim || !state.selectedBone) return;
  const bone = state.selectedBone;
  const already = isFormula(state.anim, bone, kind);
  if (already) {
    ensureBone(state.anim, bone)[kind] = null;
  } else {
    const existing = state.anim.bones[bone] && state.anim.bones[bone][kind];
    const hasKeys = existing && existing.keys && existing.keys.length;
    const go = () => {
      const start = poseFor(state.anim, bone, state.time)[kind];
      ensureBone(state.anim, bone)[kind] = { static: start.map(v => String(v)) };
      markDirty(); refreshPosePanel(); refreshTimeline();
    };
    if (hasKeys) {
      confirmBox({ title: 'Use a formula instead?', body: 'This swaps out the saved poses for this part with a typed formula. You can always turn it back off.', ok: 'Yes, use a formula', danger: true })
        .then(ok => { if (ok) go(); });
      return;
    }
    go();
  }
  markDirty();
  refreshPosePanel();
  refreshTimeline();
}

function onFormulaChange(kind, axis, text) {
  if (!state.anim || !state.selectedBone) return;
  const c = kindCtrl[kind];
  const err = checkMolang(text);
  c.ferr.textContent = err ? 'Hmm, that formula has a mistake: ' + err : '';
  const bone = ensureBone(state.anim, state.selectedBone);
  if (!bone[kind] || !bone[kind].static) bone[kind] = { static: [0, 0, 0].map((v, i) => i === axis ? text : v) };
  else bone[kind].static[axis] = text;
  markDirty();
}

// ------------------------------------------------------------------ presets
function buildPresets() {
  clear($posePresets);
  for (const def of PRESET_DEFS) {
    $posePresets.appendChild(el('button.btn.tiny.an-preset-btn', {
      type: 'button', title: 'Make a whole ' + def.label.toLowerCase() + ' animation for me!',
      on: { click: () => { sfx.play('good'); applyPreset(def); } }
    }, [el('span.btn-i', { text: def.icon }), el('span', { text: def.label })]));
  }
}

function applyPreset(def) {
  if (!state.built || !state.geo) { toast('Pick a model first!', 'warn'); return; }
  const { anim, used } = def.gen(state.geo.bones, state.modelShort);
  anim.name = uniqueAnimName(anim.name);
  state.anims[anim.name] = anim;
  state.animName = anim.name;
  state.time = 0; state.playing = false;
  markDirty();
  refreshAnimSelect();
  refreshWireSelect();
  refreshAll();
  const names = used.filter(Boolean);
  say(`I made ${state.modelShort} ${def.label.toLowerCase()}! I moved ${names.length} part${names.length === 1 ? '' : 's'}: ${names.join(', ')}.`);
}

function uniqueAnimName(base) {
  if (!state.anims[base]) return base;
  let i = 2; while (state.anims[`${base}_${i}`]) i++;
  return `${base}_${i}`;
}

function mkAnim(short, key, len, loop) { return newAnim(`animation.${short}.${key}`, len, loop); }
function classify(name) {
  const n = name.toLowerCase();
  if (/head/.test(n)) return 'head';
  if (/tail/.test(n)) return 'tail';
  if (/wing/.test(n)) return 'wing';
  if (/(arm|hand|claw|wrist)/.test(n)) return 'arm';
  if (/(leg|foot|feet|paw|hoof)/.test(n)) return 'leg';
  if (/ear/.test(n)) return 'ear';
  if (/(body|torso|chest|root|waist)/.test(n)) return 'body';
  return 'other';
}
function pickRole(bones, role) { return bones.filter(b => classify(b.name) === role); }
function bodyOf(bones) { return pickRole(bones, 'body')[0] || bones.find(b => !b.parent) || bones[0]; }
function rootOf(bones) { return bones.find(b => !b.parent) || bodyOf(bones); }
function sideSign(b, i) {
  const n = b.name.toLowerCase();
  if (/(^|[_\s])l(eft)?([_\s]|\d|$)/.test(n)) return 1;
  if (/(^|[_\s])r(ight)?([_\s]|\d|$)/.test(n)) return -1;
  if (b.pivot && Math.abs(b.pivot[0]) > 0.5) return Math.sign(b.pivot[0]);
  return i % 2 ? 1 : -1;
}
function addWave(anim, bone, kind, fn, len, steps = 8, lerp = 'catmullrom') {
  for (let i = 0; i <= steps; i++) { const u = i / steps; setKey(anim, bone, kind, +(u * len).toFixed(3), fn(u), lerp); }
}

function genWalk(bones, short) {
  const a = mkAnim(short, 'walk', 1, true);
  const legs = pickRole(bones, 'leg'), arms = pickRole(bones, 'arm');
  const used = [];
  legs.forEach((b, i) => { const s = sideSign(b, i); addWave(a, b.name, 'rotation', u => [s * 30 * Math.sin(2 * Math.PI * u), 0, 0], 1); used.push(b.name); });
  arms.forEach((b, i) => { const s = sideSign(b, i); addWave(a, b.name, 'rotation', u => [-s * 22 * Math.sin(2 * Math.PI * u), 0, 0], 1); used.push(b.name); });
  const body = bodyOf(bones);
  addWave(a, body.name, 'position', u => [0, Math.abs(Math.sin(2 * Math.PI * u)) * 1, 0], 1);
  used.push(body.name);
  const tail = pickRole(bones, 'tail')[0];
  if (tail) { addWave(a, tail.name, 'rotation', u => [0, 0, 10 * Math.sin(2 * Math.PI * u)], 1); used.push(tail.name); }
  return { anim: a, used };
}
function genRun(bones, short) {
  const len = 0.45;
  const a = mkAnim(short, 'run', len, true);
  const legs = pickRole(bones, 'leg'), arms = pickRole(bones, 'arm');
  const used = [];
  legs.forEach((b, i) => { const s = sideSign(b, i); addWave(a, b.name, 'rotation', u => [s * 45 * Math.sin(2 * Math.PI * u), 0, 0], len, 10); used.push(b.name); });
  arms.forEach((b, i) => { const s = sideSign(b, i); addWave(a, b.name, 'rotation', u => [-s * 35 * Math.sin(2 * Math.PI * u), 0, 0], len, 10); used.push(b.name); });
  const body = bodyOf(bones);
  addWave(a, body.name, 'position', u => [0, Math.abs(Math.sin(2 * Math.PI * u)) * 1.6, 0], len, 10);
  setKey(a, body.name, 'rotation', 0, [-14, 0, 0], 'linear');
  setKey(a, body.name, 'rotation', len, [-14, 0, 0], 'linear');
  used.push(body.name);
  return { anim: a, used };
}
function genIdle(bones, short) {
  const len = 2.4;
  const a = mkAnim(short, 'idle', len, true);
  const body = bodyOf(bones);
  addWave(a, body.name, 'position', u => [0, 0.3 * Math.sin(2 * Math.PI * u), 0], len, 12, 'catmullrom');
  const used = [body.name];
  const head = pickRole(bones, 'head')[0];
  if (head) {
    setKey(a, head.name, 'rotation', 0, [0, 0, 0], 'catmullrom');
    setKey(a, head.name, 'rotation', len * 0.45, [0, 0, 0], 'catmullrom');
    setKey(a, head.name, 'rotation', len * 0.55, [0, 18, 0], 'catmullrom');
    setKey(a, head.name, 'rotation', len * 0.75, [0, 18, 0], 'catmullrom');
    setKey(a, head.name, 'rotation', len * 0.9, [0, 0, 0], 'catmullrom');
    setKey(a, head.name, 'rotation', len, [0, 0, 0], 'catmullrom');
    used.push(head.name);
  }
  return { anim: a, used };
}
function genAttack(bones, short) {
  const len = 0.5;
  const a = mkAnim(short, 'attack', len, false);
  a.override = true;
  const arm = pickRole(bones, 'arm')[0];
  const body = bodyOf(bones);
  const used = [];
  if (arm) {
    setKey(a, arm.name, 'rotation', 0, [0, 0, 0], 'linear');
    setKey(a, arm.name, 'rotation', len * 0.3, [-45, 0, 0], 'linear');
    setKey(a, arm.name, 'rotation', len * 0.55, [70, 0, 0], 'linear');
    setKey(a, arm.name, 'rotation', len, [0, 0, 0], 'linear');
    used.push(arm.name);
  }
  setKey(a, body.name, 'rotation', 0, [0, 0, 0], 'linear');
  setKey(a, body.name, 'rotation', len * 0.55, [0, 0, (arm && sideSign(arm, 0) > 0) ? -8 : 8], 'linear');
  setKey(a, body.name, 'rotation', len, [0, 0, 0], 'linear');
  used.push(body.name);
  return { anim: a, used };
}
function genJump(bones, short) {
  const len = 0.6;
  const a = mkAnim(short, 'jump', len, false);
  const body = bodyOf(bones);
  setKey(a, body.name, 'position', 0, [0, 0, 0], 'catmullrom');
  setKey(a, body.name, 'position', len * 0.15, [0, -1, 0], 'catmullrom');
  setKey(a, body.name, 'position', len * 0.5, [0, 3, 0], 'catmullrom');
  setKey(a, body.name, 'position', len * 0.85, [0, -0.5, 0], 'catmullrom');
  setKey(a, body.name, 'position', len, [0, 0, 0], 'catmullrom');
  const legs = pickRole(bones, 'leg');
  legs.forEach(b => {
    setKey(a, b.name, 'rotation', 0, [0, 0, 0], 'catmullrom');
    setKey(a, b.name, 'rotation', len * 0.5, [40, 0, 0], 'catmullrom');
    setKey(a, b.name, 'rotation', len, [0, 0, 0], 'catmullrom');
  });
  return { anim: a, used: [body.name, ...legs.map(b => b.name)] };
}
function genSpin(bones, short) {
  const len = 1;
  const a = mkAnim(short, 'spin', len, false);
  const root = rootOf(bones);
  setKey(a, root.name, 'rotation', 0, [0, 0, 0], 'linear');
  setKey(a, root.name, 'rotation', len, [0, 360, 0], 'linear');
  return { anim: a, used: [root.name] };
}
function genDance(bones, short) {
  const len = 1.2;
  const a = mkAnim(short, 'dance', len, true);
  const body = bodyOf(bones);
  addWave(a, body.name, 'rotation', u => [0, 0, 18 * Math.sin(2 * Math.PI * u)], len, 10, 'catmullrom');
  addWave(a, body.name, 'position', u => [0, 0.6 * Math.abs(Math.sin(4 * Math.PI * u)), 0], len, 10, 'catmullrom');
  const used = [body.name];
  const arms = pickRole(bones, 'arm');
  arms.forEach((b, i) => { const s = sideSign(b, i); addWave(a, b.name, 'rotation', u => [s * 40 * Math.sin(2 * Math.PI * u + i), 0, 0], len, 10, 'catmullrom'); used.push(b.name); });
  const head = pickRole(bones, 'head')[0];
  if (head) { addWave(a, head.name, 'rotation', u => [0, 20 * Math.sin(4 * Math.PI * u), 0], len, 10, 'catmullrom'); used.push(head.name); }
  return { anim: a, used };
}
function genWave(bones, short) {
  const len = 1;
  const a = mkAnim(short, 'wave', len, false);
  const arm = pickRole(bones, 'arm')[0] || bodyOf(bones);
  const s = sideSign(arm, 0);
  setKey(a, arm.name, 'rotation', 0, [0, 0, 0], 'catmullrom');
  setKey(a, arm.name, 'rotation', len * 0.2, [0, 0, s * 140], 'catmullrom');
  setKey(a, arm.name, 'rotation', len * 0.35, [0, 0, s * 110], 'catmullrom');
  setKey(a, arm.name, 'rotation', len * 0.5, [0, 0, s * 140], 'catmullrom');
  setKey(a, arm.name, 'rotation', len * 0.65, [0, 0, s * 110], 'catmullrom');
  setKey(a, arm.name, 'rotation', len * 0.8, [0, 0, s * 140], 'catmullrom');
  setKey(a, arm.name, 'rotation', len, [0, 0, 0], 'catmullrom');
  return { anim: a, used: [arm.name] };
}
function genDie(bones, short) {
  const len = 1;
  const a = mkAnim(short, 'die', len, 'hold_on_last_frame');
  const root = rootOf(bones);
  setKey(a, root.name, 'rotation', 0, [0, 0, 0], 'catmullrom');
  setKey(a, root.name, 'rotation', len * 0.6, [95, 0, 0], 'catmullrom');
  setKey(a, root.name, 'rotation', len, [90, 0, 0], 'catmullrom');
  setKey(a, root.name, 'position', 0, [0, 0, 0], 'catmullrom');
  setKey(a, root.name, 'position', len, [0, -4, 0], 'catmullrom');
  return { anim: a, used: [root.name] };
}

// ============================================================== animations =
function newAnimation() {
  if (!state.geo) { toast('Pick a model first!', 'warn'); return; }
  promptBox({ title: 'New animation', label: 'What should we call it?', value: 'move', hint: 'e.g. wave, sleep, roar' })
    .then(v => {
      if (!v) return;
      const full = uniqueAnimName(`animation.${state.modelShort}.${safeName(v)}`);
      state.anims[full] = newAnim(full, 1, true);
      state.animName = full;
      state.time = 0;
      markDirty();
      refreshAnimSelect();
      refreshWireSelect();
      refreshAll();
    });
}
function renameAnimation() {
  if (!state.anim) return;
  const oldName = state.animName;
  const curSuffix = oldName.split('.').pop();
  promptBox({ title: 'Rename animation', label: 'New name', value: curSuffix })
    .then(v => {
      if (!v) return;
      const newName = uniqueAnimName(`animation.${state.modelShort}.${safeName(v)}`);
      if (newName === oldName) return;
      state.anims[newName] = state.anims[oldName];
      state.anims[newName].name = newName;
      delete state.anims[oldName];
      state.animName = newName;
      renameAnimEverywhere(oldName, newName);
      markDirty();
      refreshAnimSelect();
      refreshWireSelect();
      refreshAll();
    });
}
function duplicateAnimation() {
  if (!state.anim) return;
  const clone = JSON.parse(JSON.stringify(state.anim));
  const newName = uniqueAnimName(state.animName + '_copy');
  clone.name = newName;
  state.anims[newName] = clone;
  state.animName = newName;
  markDirty();
  refreshAnimSelect();
  refreshWireSelect();
  refreshAll();
  toast('Duplicated!', 'good');
}
function deleteAnimation() {
  if (!state.anim) return;
  const name = state.animName;
  confirmBox({ title: 'Delete this animation?', body: `"${niceAnimLabel(name)}" will be gone for good.`, danger: true, ok: 'Delete' })
    .then(ok => {
      if (!ok) return;
      delete state.anims[name];
      removeAnimEverywhere(name);
      state.animName = Object.keys(state.anims)[0] || null;
      state.time = 0; state.selectedKey = null;
      markDirty();
      refreshAnimSelect();
      refreshWireSelect();
      refreshAll();
    });
}

// ==================================================================== wire =
function wireKeyFor(entPath, animFullName) {
  const j = fs.readJSON(entPath);
  const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
  if (desc && desc.animations) for (const [k, v] of Object.entries(desc.animations)) if (v === animFullName) return k;
  return animFullName.split('.').pop();
}
function currentWireMode(entPath, animFullName) {
  const key = wireKeyFor(entPath, animFullName);
  const j = fs.readJSON(entPath);
  const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
  if (!desc) return 'never';
  const list = (desc.scripts && desc.scripts.animate) || [];
  for (const e of list) {
    if (typeof e === 'string' && e === key) return 'always';
    if (e && typeof e === 'object' && key in e) {
      const cond = String(e[key]);
      if (cond.includes('modified_move_speed')) return 'walk';
      if (cond.includes('target_distance')) return 'attack';
      return 'always';
    }
  }
  return 'never';
}
function wireAnimation(entPath, key, animFullName, mode) {
  const j = fs.readJSON(entPath) || {};
  j['minecraft:client_entity'] = j['minecraft:client_entity'] || { description: {} };
  const desc = j['minecraft:client_entity'].description = j['minecraft:client_entity'].description || {};
  desc.animations = desc.animations || {};
  desc.animations[key] = animFullName;
  desc.scripts = desc.scripts || {};
  let list = Array.isArray(desc.scripts.animate) ? desc.scripts.animate.slice() : [];
  list = list.filter(e => (typeof e === 'string' ? e !== key : !(e && typeof e === 'object' && key in e)));
  if (mode === 'always') list.push(key);
  else if (mode === 'walk') list.push({ [key]: 'query.modified_move_speed > 0.1' });
  else if (mode === 'attack') list.push({ [key]: 'query.target_distance > 0 && query.target_distance < 3' });
  if (list.length) desc.scripts.animate = list; else delete desc.scripts.animate;
  if (desc.scripts && Object.keys(desc.scripts).length === 0) delete desc.scripts;
  fs.writeJSON(entPath, j);
}
function renameAnimEverywhere(oldName, newName) {
  for (const p of fs.findAll('RP/entity/*.entity.json')) {
    const j = fs.readJSON(p);
    const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    if (!desc || !desc.animations) continue;
    let changed = false;
    for (const k of Object.keys(desc.animations)) if (desc.animations[k] === oldName) { desc.animations[k] = newName; changed = true; }
    if (changed) fs.writeJSON(p, j);
  }
}
function removeAnimEverywhere(name) {
  for (const p of fs.findAll('RP/entity/*.entity.json')) {
    const j = fs.readJSON(p);
    const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    if (!desc || !desc.animations) continue;
    let changed = false;
    for (const k of Object.keys(desc.animations)) {
      if (desc.animations[k] !== name) continue;
      delete desc.animations[k];
      changed = true;
      if (desc.scripts && Array.isArray(desc.scripts.animate)) {
        const before = desc.scripts.animate.length;
        desc.scripts.animate = desc.scripts.animate.filter(e => (typeof e === 'string' ? e !== k : !(e && typeof e === 'object' && k in e)));
        if (desc.scripts.animate.length !== before && !desc.scripts.animate.length) delete desc.scripts.animate;
      }
    }
    if (changed) fs.writeJSON(p, j);
  }
}
function refreshWireSelect() {
  if (!state.geo) { $wireSel.disabled = true; $wireHint.textContent = ''; return; }
  state.entityPath = findEntityForModel(state.geo.identifier);
  const ok = !!(state.entityPath && state.animName);
  $wireSel.disabled = !ok;
  if (!state.entityPath) { $wireHint.textContent = 'Make a mob that uses this model first (Build tool).'; $wireSel.value = 'never'; return; }
  if (!state.animName) { $wireHint.textContent = 'Pick an animation.'; $wireSel.value = 'never'; return; }
  $wireHint.textContent = '';
  $wireSel.value = currentWireMode(state.entityPath, state.animName);
}
function setWireMode(mode) {
  if (!state.entityPath || !state.animName) return;
  const key = wireKeyFor(state.entityPath, state.animName);
  wireAnimation(state.entityPath, key, state.animName, mode);
  toast('Updated when your mob plays this.', 'good');
}

// =============================================================== timeline ==
function buildTimeline() {
  $playBtn = button('', { icon: '▶️', hint: 'Play or pause.', onClick: togglePlay });
  const stopBtn = button('', { icon: '⏹️', hint: 'Stop and go back to the start.', onClick: stopAnim });
  $loopSel = select([
    { value: 'once', label: 'Once' }, { value: 'loop', label: 'Loop' }, { value: 'hold', label: 'Hold last pose' }
  ], 'loop', v => { if (state.anim) { state.anim.loop = v === 'loop' ? true : v === 'hold' ? 'hold_on_last_frame' : false; markDirty(); } });
  $lenField = el('input.field', { type: 'number', min: 0.1, step: 0.05, value: 1, style: { width: '70px' } });
  $lenField.addEventListener('change', () => {
    if (!state.anim) return;
    state.anim.length = Math.max(0.1, parseFloat($lenField.value) || 1);
    markDirty(); refreshTimeline();
  });
  $snapField = el('input.field', { type: 'number', min: 0.01, step: 0.01, value: state.snap, style: { width: '64px' } });
  $snapField.addEventListener('change', () => { state.snap = Math.max(0.01, parseFloat($snapField.value) || 0.05); });
  $timeLbl = el('span.an-tl-time');

  const toolbar = el('div.an-tl-toolbar', {}, [
    $playBtn, stopBtn,
    el('span.an-sep-v'),
    el('span.lbl', { text: 'Repeat' }), $loopSel,
    el('span.lbl', { text: 'Length (s)' }), $lenField,
    el('span.lbl', { text: 'Snap (s)' }), $snapField,
    $timeLbl
  ]);

  $rulerTrack = el('div.an-tl-ruler-track');
  const ruler = el('div.an-tl-ruler', {}, [el('div.an-tl-ruler-gutter'), $rulerTrack]);
  $rowsWrap = el('div.an-tl-rows');
  $playhead = el('div.an-playhead', {}, [el('div.an-playhead-handle')]);
  $tlInner = el('div.an-tl-inner', {}, [ruler, $rowsWrap, $playhead]);
  const scroller = el('div.an-tl-scroll', {}, [$tlInner]);

  $keyopts = el('div.an-keyopts', { style: { display: 'none' } });

  $tlWrap = el('div#anTimeline.an-timeline', {}, [toolbar, scroller, $keyopts]);

  $rulerTrack.addEventListener('pointerdown', e => startScrub(e));
  $playhead.querySelector('.an-playhead-handle').addEventListener('pointerdown', e => { e.stopPropagation(); startScrub(e); });

  function startScrub(e) {
    state.playing = false; updatePlayBtn();
    const move = ev => {
      const rect = $rulerTrack.getBoundingClientRect();
      const len = state.anim ? (state.anim.length || 1) : 1;
      const x = ev.clientX - rect.left;
      state.time = snapTime(Math.min(len, Math.max(0, x / PX_PER_SEC)));
      updatePlayheadUI();
      refreshPosePanel();
      refreshKeyOpts();
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); refreshTimeline(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
function snapTime(t) { const s = state.snap || 0.05; return Math.max(0, Math.round(t / s) * s); }

function togglePlay() { state.playing = !state.playing; updatePlayBtn(); }
function stopAnim() { state.playing = false; state.time = 0; updatePlayBtn(); refreshTimeline(); refreshPosePanel(); }
function updatePlayBtn() { $playBtn.querySelector('.btn-i').textContent = state.playing ? '⏸️' : '▶️'; }

function updatePlayheadUI() {
  const len = state.anim ? (state.anim.length || 1) : 1;
  const t = Math.min(len, Math.max(0, state.time));
  $playhead.style.left = (LABEL_W + t * PX_PER_SEC) + 'px';
  $timeLbl.textContent = t.toFixed(2) + 's / ' + len.toFixed(2) + 's';
}

function timelineBones() {
  if (!state.anim) return [];
  const withKeys = Object.keys(state.anim.bones).filter(b => keyTimes(state.anim, b).length > 0);
  const set = new Set(withKeys);
  if (state.selectedBone) set.add(state.selectedBone);
  return [...set];
}

function refreshTimeline() {
  if (!$tlInner) return;
  if (!state.anim) {
    clear($rowsWrap);
    $rowsWrap.appendChild(el('div.an-empty-tl', { text: 'No animation yet — make one with New, or tap a preset on the left!' }));
    $rulerTrack.style.width = '10px';
    $tlInner.style.width = (LABEL_W + 10) + 'px';
    $keyopts.style.display = 'none';
    $lenField.value = 1; $loopSel.value = 'loop';
    return;
  }
  $lenField.value = round2(state.anim.length || 1);
  $loopSel.value = state.anim.loop === true ? 'loop' : state.anim.loop === 'hold_on_last_frame' ? 'hold' : 'once';
  $snapField.value = state.snap;

  const len = Math.max(0.1, state.anim.length || 1);
  // Stretch the timeline to fill the space it has: a 1-second animation crammed into 140px is
  // impossible to tap keyframes on, especially with a finger.
  const avail = ($tlInner.parentElement ? $tlInner.parentElement.clientWidth : 900) - LABEL_W - 30;
  PX_PER_SEC = Math.max(80, Math.min(420, avail > 120 ? avail / len : 140));
  const trackW = Math.max(200, len * PX_PER_SEC);
  $tlInner.style.width = (LABEL_W + trackW) + 'px';
  clear($rulerTrack);
  $rulerTrack.style.width = trackW + 'px';
  for (let s = 0; s <= Math.ceil(len); s++) {
    $rulerTrack.appendChild(el('div.an-tl-tick', { style: { left: (s * PX_PER_SEC) + 'px' } }, [el('span', { text: s + 's' })]));
  }

  clear($rowsWrap);
  const bones = timelineBones();
  if (!bones.length) $rowsWrap.appendChild(el('div.an-empty-tl', { text: 'Pose a part to see keyframes here.' }));
  for (const bname of bones) {
    const row = el('div.an-tl-row' + (bname === state.selectedBone ? '.on' : ''));
    const label = el('div.an-tl-label', { text: bname, on: { click: () => selectBone(bname) } });
    const track = el('div.an-tl-track', { style: { width: trackW + 'px' } });
    for (const t of keyTimes(state.anim, bname)) {
      const isSel = state.selectedKey && state.selectedKey.bone === bname && Math.abs(state.selectedKey.time - t) < 0.001;
      const kbtn = el('button.an-key' + (isSel ? '.on' : ''), { type: 'button', style: { left: (t * PX_PER_SEC - 20) + 'px' } });
      wireKeyDrag(kbtn, bname, t);
      track.appendChild(kbtn);
    }
    row.append(label, track);
    $rowsWrap.appendChild(row);
  }
  updatePlayheadUI();
  refreshKeyOpts();
}

function wireKeyDrag(btn, bone, time) {
  let curTime = time, moved = false, startX = 0;
  btn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    try { btn.setPointerCapture(e.pointerId); } catch (er) {}
    startX = e.clientX; moved = false; curTime = time;
    state.playing = false; updatePlayBtn();
    const onMove = ev => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      curTime = snapTime(Math.max(0, time + dx / PX_PER_SEC));
      btn.style.left = (curTime * PX_PER_SEC - 20) + 'px';
    };
    const onUp = () => {
      btn.removeEventListener('pointermove', onMove);
      btn.removeEventListener('pointerup', onUp);
      if (moved && Math.abs(curTime - time) > 0.0001) { moveKeyTime(state.anim, bone, time, curTime); markDirty(); refreshTimeline(); refreshPosePanel(); }
      else { selectKey(bone, time); }
    };
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup', onUp);
  });
}
function moveKeyTime(anim, bone, oldT, newT) {
  const t = Math.round(newT * 1000) / 1000;
  for (const kind of ['rotation', 'position', 'scale']) {
    const ch = anim.bones[bone] && anim.bones[bone][kind];
    if (!ch || !ch.keys) continue;
    const k = ch.keys.find(k2 => Math.abs(k2.t - oldT) < 0.001);
    if (k) k.t = t;
    ch.keys.sort((a, b) => a.t - b.t);
  }
  anim.length = Math.max(anim.length || 0, t);
  if (state.selectedKey && state.selectedKey.bone === bone && Math.abs(state.selectedKey.time - oldT) < 0.001) state.selectedKey = { bone, time: t };
}

function selectKey(bone, time) {
  state.selectedKey = { bone, time };
  state.time = time;
  if (state.selectedBone !== bone) selectBone(bone); else { refreshTimeline(); refreshPosePanel(); }
}
function setLerpForKeyAt(anim, bone, time, lerp) {
  for (const kind of ['rotation', 'position', 'scale']) {
    const ch = anim.bones[bone] && anim.bones[bone][kind];
    if (ch && ch.keys) { const k = ch.keys.find(k2 => Math.abs(k2.t - time) < 0.001); if (k) k.lerp = lerp; }
  }
}
function refreshKeyOpts() {
  clear($keyopts);
  if (!state.selectedKey || !state.anim) { $keyopts.style.display = 'none'; return; }
  $keyopts.style.display = '';
  const { bone, time } = state.selectedKey;
  let cur = 'linear';
  for (const kind of ['rotation', 'position', 'scale']) {
    const ch = state.anim.bones[bone] && state.anim.bones[bone][kind];
    const k = ch && ch.keys && ch.keys.find(k2 => Math.abs(k2.t - time) < 0.001);
    if (k) { cur = k.lerp; break; }
  }
  $keyopts.append(
    el('span.lbl', { text: 'How it slides:' }),
    ...['linear', 'catmullrom', 'step'].map(mode => el('button.chip.an-lerp-chip' + (cur === mode ? '.on' : ''), {
      type: 'button', text: LERP_LABEL[mode],
      on: { click: () => { setLerpForKeyAt(state.anim, bone, time, mode); markDirty(); refreshKeyOpts(); refreshTimeline(); } }
    })),
    button('', {
      icon: '🗑️', kind: 'ghost', title: 'Delete this saved pose.',
      onClick: () => {
        for (const kind of ['rotation', 'position', 'scale']) removeKey(state.anim, bone, kind, time);
        state.selectedKey = null;
        markDirty(); refreshAll();
      }
    })
  );
}

// ================================================================== misc ===
function markDirty() { state.dirty = true; $saveDot.textContent = '●'; }
function saveAnimFile(explicit) {
  if (!state.animPath) return;
  if (!Object.keys(state.anims).length && !fs.exists(state.animPath)) { if (explicit) toast('Nothing to save yet — make an animation first!', 'warn'); return; }
  fs.writeJSON(state.animPath, animsToJSON(state.anims));
  state.dirty = false;
  $saveDot.textContent = '';
  award('first-anim');
  if (explicit) { toast('Saved!', 'good'); sfx.play('good'); }
  refreshFileSelect(state.animPath);
}

function refreshAll() {
  refreshBoneList();
  refreshPosePanel();
  refreshTimeline();
}

// =============================================================== lifecycle =
function show(args) {
  if (!$root) return;
  const models = listModels();
  refreshModelSelect();
  if (args && args.model && args.model !== state.modelPath && fs.exists(args.model)) selectModel(args.model);
  else if (!state.modelPath && models.length) selectModel(models[0]);
  else if (state.modelPath) { refreshWireSelect(); refreshAll(); }
  resizeRenderer();
  startLoop();
  tour('anim-intro', [
    { title: 'Welcome to Animate!', text: 'This is where your model learns to move. Pick a model up top, then tap a part to pose it.' },
    { el: '#anPresets', title: 'Instant animations', text: 'Tap one of these and I will build a whole animation for you — Walk, Dance, Wave and more!' },
    { el: '#anTimeline', title: 'The timeline', text: 'Each little diamond ◆ is a <b>keyframe</b> — a pose you saved. Drag the red bar to see time move.' },
    { el: '#anWireRow', title: 'Make it real', text: 'Pick when this should play on your mob — Always, When walking, or Never (just for testing).' }
  ]);
}
function hide() {
  stopLoop();
  if (state.dirty && settings.get('autosave') !== false) saveAnimFile(false);
}
function onFileChange(path) {
  if (!$root) return;
  if (path === '*') { refreshModelSelect(); if (state.modelPath) refreshFileSelect(state.animPath || `RP/animations/${state.modelShort}.animation.json`); return; }
  if (/^RP\/models\/.*\.geo\.json$/.test(path)) refreshModelSelect();
  if (/^RP\/entity\/.*\.entity\.json$/.test(path)) refreshWireSelect();
  if (path === state.modelPath) rebuildModel();
  if (state.texturePath && path === state.texturePath) rebuildModel();
}

export default { id: 'anim', title: 'Animate', icon: '🤸', mount, show, hide, onFileChange };

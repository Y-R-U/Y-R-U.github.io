// Paint — the Paint.NET replacement. A pixel-art texture editor for every .png in the pack:
// mob skins, item icons, block textures, the pack icon. The killer feature is the UV guide:
// if the open picture belongs to a mob, we find its matching geometry (lib/geo.js) and draw
// coloured boxes over the canvas showing exactly which square is which face of which part —
// so a child can paint a face and know it will land on the front of the head, not the back.
import { fs, baseName } from '../core/fs.js';
import { el, button, promptBox, pickBox, toast, toggle, slider, pickFile, clear } from '../core/ui.js';
import { settings, flag } from '../core/store.js';
import { tour, say, award } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { bus } from '../core/bus.js';
import { project } from '../core/project.js';
import { parseGeoFile, faceRects } from '../lib/geo.js';
import { itemTexture, terrainTexture } from '../lib/bedrock.js';

// ---------------------------------------------------------------------- CSS ---
const CSS = `
.pt-toolbar { flex-wrap: wrap; }
.pt-fileLabel { font-size: .95em; }
.pt-zoomLabel { font-family: var(--mono); font-size: .82em; color: var(--dim); min-width: 44px; text-align: center; }
.pt-savedTick { font-size: .82em; min-width: 76px; }
.pt-split { flex: 1; min-height: 0; }

.pt-sideHead { padding: 10px 12px 6px; }
.pt-groupTitle { font-size: .72em; text-transform: uppercase; letter-spacing: .5px; color: var(--dim2); padding: 10px 12px 4px; }
.pt-sideEmpty { padding: 14px 12px; color: var(--dim); font-size: .88em; line-height: 1.4; }
.pt-fileRow { min-height: 44px; }
.pt-thumb {
  width: 30px; height: 30px; border-radius: 5px; border: 1px solid var(--edge2); flex: none; object-fit: contain;
  background-image: linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%),
                     linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%);
  background-size: 8px 8px; background-position: 0 0, 4px 4px;
}

.pt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.pt-viewport { position: absolute; inset: 0; overflow: hidden; touch-action: none; background: var(--bg2); cursor: crosshair; }
.pt-viewport.pt-hand { cursor: grab; }
.pt-viewport.pt-panning { cursor: grabbing; }
.pt-stage {
  position: absolute; left: 0; top: 0;
  background-color: #232630;
  background-image: linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%),
                     linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%);
  background-size: 16px 16px; background-position: 0 0, 8px 8px;
}
.pt-canvas, .pt-uv { position: absolute; left: 0; top: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.pt-uv { pointer-events: none; }
.pt-gridLayer {
  position: absolute; inset: 0; pointer-events: none; display: none;
  background-image: linear-gradient(to right, rgba(255,255,255,.28) 1px, transparent 1px),
                     linear-gradient(to bottom, rgba(255,255,255,.28) 1px, transparent 1px);
}
.pt-labelLayer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.pt-uvlabel {
  position: absolute; font-family: var(--mono); font-size: 9px; font-weight: 700; color: #fff;
  text-shadow: 0 1px 2px #000, 0 0 3px #000; white-space: nowrap; transform: translateY(2px);
}
.pt-flash {
  position: absolute; border: 3px solid var(--gold); border-radius: 2px; pointer-events: none;
  box-shadow: 0 0 0 3px rgba(0,0,0,.6), 0 0 18px 4px rgba(255,200,60,.85);
  animation: pt-pulse .5s ease-in-out 4;
}
@keyframes pt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

.pt-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px; padding: 10px; }
.pt-tool {
  display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 46px; padding: 6px 2px;
  border: 2px solid #000; border-radius: 8px; background: var(--panel2); color: var(--text); cursor: pointer;
  font-size: 10px; font-family: var(--ui);
}
.pt-tool .pt-ic { font-size: 17px; }
.pt-tool:hover { background: var(--panel3); }
.pt-tool.on { background: var(--grass-d); border-color: var(--grass); color: #fff; }

.pt-section { padding: 10px 12px; border-top: 2px solid #000; box-shadow: inset 0 1px 0 var(--edge); }
.pt-section-title { font-size: .72em; text-transform: uppercase; letter-spacing: .5px; color: var(--dim2); margin-bottom: 8px; }
.pt-swatches { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.pt-swatchStack { position: relative; width: 44px; height: 44px; flex: none; }
.pt-swatch {
  position: absolute; width: 30px; height: 30px; border-radius: 7px; border: 2px solid #000; cursor: pointer;
  background-image: linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%),
                     linear-gradient(45deg,#2e3140 25%,transparent 25%,transparent 75%,#2e3140 75%);
  background-size: 8px 8px; background-position: 0 0, 4px 4px;
}
.pt-swatch i { position: absolute; inset: 0; border-radius: 5px; }
.pt-swatch.pri { left: 0; top: 0; z-index: 2; }
.pt-swatch.sec { left: 14px; top: 14px; z-index: 1; }
.pt-swap {
  width: 24px; height: 24px; border-radius: 50%; border: 2px solid #000; background: var(--panel2);
  color: var(--text); cursor: pointer; font-size: 11px; flex: none;
}
.pt-palette { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin-bottom: 10px; }
.pt-swatchbtn { width: 100%; aspect-ratio: 1; border-radius: 5px; border: 2px solid #000; cursor: pointer; padding: 0; }
.pt-swatchbtn.on { outline: 2px solid var(--gold); outline-offset: 1px; }
.pt-recent { display: flex; flex-wrap: wrap; gap: 5px; min-height: 22px; }
.pt-recent .pt-swatchbtn { width: 20px; height: 20px; }

@media (max-width: 900px) {
  .pt-tools { grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); }
  .pt-palette { grid-template-columns: repeat(6, 1fr); }
  .pt-recent .pt-swatchbtn { width: 26px; height: 26px; }
}
/* On a phone the picture must dominate: shrink the furniture so the canvas is not a letterbox. */
@media (max-width: 620px) {
  #pane-paint .toolbar { padding: 5px 7px; gap: 5px; }
  #pane-paint .toolbar .btn { padding: 7px 9px; font-size: .82em; gap: 4px; }
  #pane-paint .toolbar .iconbtn { width: 30px; height: 30px; }
  /* Tools go straight under the toolbar — you pick a picture once but change brush constantly. */
  #pane-paint .side.right { order: -1; max-height: 132px; }
  #pane-paint .side { max-height: 104px; }
  #pane-paint .pt-sideHead { padding: 6px 8px 4px; }
  #pane-paint .body { min-height: 44vh; }
  #pane-paint .pt-tools .pt-tool { padding: 6px 2px; font-size: .72em; }
}
`;

// A friendly 32-colour default palette: greys, dyes and a few earthy/skin tones.
const PALETTE = [
  '#000000', '#1d1d21', '#474f52', '#9d9d97', '#d4d0c8', '#f9fffe',
  '#701919', '#b02e26', '#f9801d', '#fed83d', '#80c71f', '#5e7c16',
  '#3ab3da', '#169c9c', '#3c44aa', '#8932b8', '#c74ebd', '#f38baa',
  '#835432', '#6d3610', '#7d7d7d', '#4c3e30', '#7a5230', '#2d5738',
  '#8fce00', '#e6da3b', '#ffb27d', '#c2b280', '#785a3f', '#ff6ec7',
  '#00e5ff', '#ffffff'
];
const FACE_NAMES = ['east', 'west', 'up', 'down', 'south', 'north'];
const FACE_COLORS = ['#ff5a49', '#7ca8ff', '#ffc83c', '#c08cff', '#6cc349', '#f38baa'];
const TOOL_DEFS = [
  { id: 'pencil', icon: '✏️', label: 'Pencil', hint: 'Draw one pixel at a time. Drag for a line.' },
  { id: 'eraser', icon: '🧽', label: 'Eraser', hint: 'Rub pixels away to see-through.' },
  { id: 'fill', icon: '🪣', label: 'Fill', hint: 'Pour a colour into a whole area.' },
  { id: 'line', icon: '📏', label: 'Line', hint: 'Drag to draw a straight line.' },
  { id: 'rect', icon: '▭', label: 'Box', hint: 'Drag to draw a box outline.' },
  { id: 'rectFill', icon: '⬛', label: 'Box+', hint: 'Drag to draw a solid box.' },
  { id: 'ellipse', icon: '⭕', label: 'Circle', hint: 'Drag to draw a circle outline.' },
  { id: 'ellipseFill', icon: '⚫', label: 'Circle+', hint: 'Drag to draw a solid circle.' },
  { id: 'eyedrop', icon: '💧', label: 'Pick', hint: 'Copy a colour already on the picture.' },
  { id: 'hand', icon: '✋', label: 'Move', hint: 'Drag to move around when zoomed in.' }
];

// -------------------------------------------------------------------- state ---
let active = false;
let curPath = null;
let dirty = false;
let autosaveTimer = null;
let geoCache = null;                 // matched geometry for the open mob texture, or null

let tool = flag.get('paint:tool') || 'pencil';
let brush = flag.get('paint:brush') || 1;
let mirrorX = !!flag.get('paint:mirror');
let alpha = flag.get('paint:alpha'); if (alpha == null) alpha = 255;
let primary = flag.get('paint:primary') || '#3c3c3c';
let secondary = flag.get('paint:secondary') || '#ffffff';
let recent = flag.get('paint:recent') || [];
let showUV = flag.get('paint:uv'); if (showUV == null) showUV = true;

let zoom = 8;
let pan = { x: 0, y: 0 };
const pointers = new Map();          // pointerId -> {x,y}
let mode = null;                     // null | 'draw' | 'pan' | 'pinch'
let panStart = null;
let pinch = null;
let spaceDown = false;
let lastPos = null;
let strokeColor = null;
let shapeStart = null;
let shapeBase = null;

// DOM refs, assigned in mount()
let canvas, ctx, overlay, octx, stage, viewport, gridLayer, labelLayer;
let sideList, emptyPanel, toolWrap, recentWrap, priSwatchI, secSwatchI;
let fileLabel, zoomLabel, savedTick, uvBtn, gridBtn, faceBtn, undoBtn, redoBtn, saveBtn, importBtn;
let colorInput, colorTarget = 'primary';

let undoStack = [], redoStack = [];

// ============================================================== life-cycle ===
function mount(root) {
  if (!document.getElementById('pt-style')) {
    const s = el('style#pt-style'); s.textContent = CSS; document.head.appendChild(s);
  }
  root.classList.add('pt-pane');

  fileLabel = el('b.pt-fileLabel', { text: 'No picture open' });
  zoomLabel = el('span.pt-zoomLabel', { text: '100%' });
  savedTick = el('span.pt-savedTick');
  uvBtn = el('button.iconbtn' + (showUV ? '.on' : ''), {
    type: 'button', id: 'ptUvBtn', text: '📐',
    dataset: { hint: 'Show squares for where each part goes on the mob.' },
    on: { click: () => { showUV = !showUV; flag.set('paint:uv', showUV); uvBtn.classList.toggle('on', showUV); sfx.play('click'); redrawOverlay(); } }
  });
  gridBtn = el('button.iconbtn' + (settings.get('grid') ? '.on' : ''), {
    type: 'button', text: '⊞',
    dataset: { hint: 'Show a light grid over every pixel (zoom in first).' },
    on: { click: () => { settings.set('grid', !settings.get('grid')); gridBtn.classList.toggle('on', settings.get('grid')); sfx.play('click'); redrawOverlay(); } }
  });
  faceBtn = button('Show me', { icon: '🎯', kind: 'ghost', hint: "Jump to the mob's face square.", onClick: showHeadFace });
  undoBtn = button('', { icon: '↩️', kind: 'ghost', hint: 'Undo the last change.', onClick: undo });
  redoBtn = button('', { icon: '↪️', kind: 'ghost', hint: 'Redo what you undid.', onClick: redo });
  importBtn = button('My picture', { icon: '📥', kind: 'ghost', hint: 'Bring in a photo or picture from your device.', onClick: importFromDevice });
  saveBtn = button('Save', { icon: '💾', kind: 'good', hint: 'Save this picture right now.', onClick: () => { clearTimeout(autosaveTimer); saveCurrent(); } });

  const toolbar = el('div.toolbar.pt-toolbar', {}, [
    fileLabel, el('div.grow'),
    button('', { icon: '➖', kind: 'ghost', hint: 'Zoom out.', onClick: () => zoomBy(1 / 1.35) }),
    zoomLabel,
    button('', { icon: '➕', kind: 'ghost', hint: 'Zoom in.', onClick: () => zoomBy(1.35) }),
    button('Fit', { icon: '🖼️', kind: 'ghost', hint: 'Zoom to fit the whole picture.', onClick: fitZoom }),
    el('div.sep'),
    gridBtn, uvBtn, faceBtn,
    el('div.sep'),
    undoBtn, redoBtn,
    el('div.sep'),
    importBtn, saveBtn, savedTick
  ]);

  // ---- left: pictures list ----
  const newBtn = button('New picture', { id: 'ptNewBtn', icon: '✨', kind: 'primary', hint: 'Make a brand new picture to paint.', onClick: newPictureWizard });
  sideList = el('div.pt-fileList');
  const sideLeft = el('div.side', {}, [
    el('div.side-title', { text: 'PICTURES' }),
    el('div.pt-sideHead', {}, [newBtn]),
    sideList
  ]);

  // ---- centre: canvas ----
  canvas = el('canvas.pt-canvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  overlay = el('canvas.pt-uv');
  octx = overlay.getContext('2d');
  gridLayer = el('div.pt-gridLayer');
  labelLayer = el('div.pt-labelLayer');
  stage = el('div.pt-stage', {}, [canvas, overlay, gridLayer, labelLayer]);
  viewport = el('div.pt-viewport', {}, [stage]);
  emptyPanel = el('div.empty', {}, [
    el('div.big', { text: '🖼️' }),
    el('h3', { text: 'No picture open yet' }),
    el('p', { text: 'Pick one on the left, or make a brand new one.' }),
    button('New picture', { icon: '✨', kind: 'primary', hint: 'Make a fresh picture to paint.', onClick: newPictureWizard })
  ]);
  const body = el('div.body.pt-body', {}, [viewport, emptyPanel]);

  // ---- right: tools + colours ----
  toolWrap = el('div.pt-tools');
  for (const t of TOOL_DEFS) {
    const b = el('button.pt-tool' + (tool === t.id ? '.on' : ''), {
      type: 'button', dataset: { hint: t.hint, tool: t.id }
    }, [el('span.pt-ic', { text: t.icon }), el('span', { text: t.label })]);
    b.addEventListener('click', () => selectTool(t.id));
    toolWrap.appendChild(b);
  }

  const brushChips = el('div.chips', { dataset: { hint: 'How thick your pencil, eraser, line and shapes are.' } });
  for (const n of [1, 2, 3, 4]) {
    const chip = el('div.chip' + (brush === n ? '.on' : ''), { text: n + 'px', dataset: { size: n } });
    chip.addEventListener('click', () => {
      brush = n; flag.set('paint:brush', n);
      for (const c of brushChips.children) c.classList.toggle('on', +c.dataset.size === n);
      sfx.play('click');
    });
    brushChips.appendChild(chip);
  }
  const mirrorToggle = toggle(mirrorX, v => { mirrorX = v; flag.set('paint:mirror', v); redrawOverlay(); }, 'Mirror X');
  mirrorToggle.dataset.hint = 'Paints the flipped pixel too — great for symmetrical faces.';

  colorInput = el('input', {
    type: 'color', style: { display: 'none' },
    on: { input: () => { if (colorTarget === 'primary') primary = colorInput.value; else secondary = colorInput.value; addRecent(colorInput.value); syncSwatches(); } }
  });
  const priSwatch = el('div.pt-swatch.pri', { dataset: { hint: 'Your main colour. Tap to change it.' } }, [el('i')]);
  priSwatchI = priSwatch.firstChild;
  priSwatch.addEventListener('click', () => { colorTarget = 'primary'; colorInput.value = primary; colorInput.click(); });
  const secSwatch = el('div.pt-swatch.sec', { dataset: { hint: 'Your second colour. Right-click with a tool to use it.' } }, [el('i')]);
  secSwatchI = secSwatch.firstChild;
  secSwatch.addEventListener('click', () => { colorTarget = 'secondary'; colorInput.value = secondary; colorInput.click(); });
  const swapBtn = el('button.pt-swap', { type: 'button', text: '⇄', dataset: { hint: 'Swap the two colours.' } });
  swapBtn.addEventListener('click', () => { const t = primary; primary = secondary; secondary = t; syncSwatches(); sfx.play('click'); });

  const paletteWrap = el('div.pt-palette');
  for (const hex of PALETTE) {
    const b = el('button.pt-swatchbtn', { type: 'button', style: { background: hex }, title: hex });
    b.addEventListener('click', () => { primary = hex; addRecent(hex); syncSwatches(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); secondary = hex; addRecent(hex); syncSwatches(); });
    paletteWrap.appendChild(b);
  }
  recentWrap = el('div.pt-recent');
  renderRecent();
  const alphaSlider = slider(alpha, {
    min: 0, max: 255, step: 1, format: v => Math.round(v / 255 * 100) + '%',
    onInput: v => { alpha = Math.round(v); flag.set('paint:alpha', alpha); syncSwatches(); }
  });
  alphaSlider.dataset.hint = 'How see-through your colour is.';

  const sideRight = el('div.side.right', {}, [
    el('div.side-title', { text: 'TOOLS' }),
    toolWrap,
    el('div.pt-section', {}, [el('div.pt-section-title', { text: 'Brush size' }), brushChips, el('div.hr'), mirrorToggle]),
    el('div.pt-section', {}, [
      el('div.pt-section-title', { text: 'Colours' }),
      el('div.pt-swatches', {}, [el('div.pt-swatchStack', {}, [priSwatch, secSwatch]), swapBtn]),
      paletteWrap,
      el('div.field-label', { text: 'Recent' }), recentWrap,
      el('div.hr'),
      el('div.field-label', { text: 'See-through' }), alphaSlider
    ])
  ]);

  root.append(toolbar, el('div.split.pt-split', {}, [sideLeft, body, sideRight]));

  syncSwatches();
  syncEmptyState();
  wireCanvasEvents();
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', () => { if (active) renderAll(); });
  bus.on('file:change', ({ path }) => onFileChange(path));
  bus.on('settings:change', ({ key }) => { if (key === 'grid' || key === '*') { gridBtn.classList.toggle('on', settings.get('grid')); redrawOverlay(); } });

  buildFileList();
}

async function show(args) {
  active = true;
  if (args && args.path && fs.exists(args.path)) {
    await openImage(args.path);
  } else if (!curPath) {
    buildFileList();
    const last = flag.get('paint:lastFile');
    if (last && fs.exists(last)) await openImage(last);
    else {
      // Never open on an empty easel: start on the mob skin, or any picture at all.
      const first = fs.findAll('RP/textures/entity/*.png')[0] || fs.list().find(p => /\.png$/i.test(p) && !/pack_icon/.test(p));
      if (first) await openImage(first);
    }
  }
  syncEmptyState();
  setTimeout(() => tour('paint-intro', [
    { title: 'Welcome to Paint! 🎨', text: 'This is where you colour the pictures your mobs, items and blocks wear.' },
    { el: '#ptNewBtn', title: 'Start here', text: 'Tap here to make a brand new picture.' },
    { el: '.pt-tools', title: 'Your tools', text: 'Pencil draws, Eraser rubs out, Fill pours a colour into a whole area.' },
    { el: '#ptUvBtn', title: 'See where it goes', text: 'Turn this on to see squares — colour inside one and it shows up on the right part of your mob!' }
  ]), 500);
}

function hide() {
  active = false;
  spaceDown = false;
  clearTimeout(autosaveTimer);
  if (curPath && dirty) saveCurrent();
}

function onFileChange(path) {
  if (!path) return;
  if (path === '*' || /\.png$/i.test(path)) buildFileList();
  if (path === '*') {
    if (curPath && !fs.exists(curPath)) { curPath = null; syncEmptyState(); }
    return;
  }
  if (path === curPath && !dirty) {
    fs.image(path).then(im => {
      canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
      overlay.width = canvas.width; overlay.height = canvas.height;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(im, 0, 0);
      renderAll();
    }).catch(() => {});
  }
  if (curPath && (/\.geo\.json$/i.test(path) || /\.entity\.json$/i.test(path))) {
    geoCache = findGeoForTexture(curPath);
    syncUVAvailability();
    redrawOverlay();
  }
}

// ============================================================ file list UI ===
function buildFileList() {
  clear(sideList);
  const pics = fs.list().filter(p => /\.png$/i.test(p)).sort();
  if (!pics.length) { sideList.appendChild(el('div.pt-sideEmpty', { text: 'No pictures yet — make one above!' })); return; }
  const groups = new Map();
  for (const p of pics) {
    let g = 'Other pictures';
    if (/^RP\/textures\/entity\//.test(p)) g = 'Mob skins';
    else if (/^RP\/textures\/items\//.test(p)) g = 'Item icons';
    else if (/^RP\/textures\/blocks\//.test(p)) g = 'Block textures';
    else if (/pack_icon\.png$/.test(p)) g = 'Pack icons';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  for (const g of ['Mob skins', 'Item icons', 'Block textures', 'Pack icons', 'Other pictures']) {
    const list = groups.get(g); if (!list || !list.length) continue;
    sideList.appendChild(el('div.pt-groupTitle', { text: g }));
    for (const p of list) sideList.appendChild(fileRow(p));
  }
}
function fileRow(p) {
  const thumb = el('img.pt-thumb', { src: fs.dataURL(p) || '', alt: '' });
  const row = el('div.list-item.pt-fileRow' + (p === curPath ? '.on' : ''), { dataset: { path: p } }, [
    thumb, el('span', { text: baseName(p).replace(/\.png$/i, '') })
  ]);
  row.addEventListener('click', () => openImage(p));
  return row;
}
function syncSideActive() {
  for (const row of sideList.querySelectorAll('.pt-fileRow')) row.classList.toggle('on', row.dataset.path === curPath);
}
function refreshThumbnail(p) {
  for (const row of sideList.querySelectorAll('.pt-fileRow')) {
    if (row.dataset.path === p) { const img = row.querySelector('img'); if (img) img.src = fs.dataURL(p); }
  }
}

// ============================================================== open / new ===
async function openImage(path) {
  if (curPath && dirty) { clearTimeout(autosaveTimer); await saveCurrent(); }
  let im;
  try { im = await fs.image(path); } catch (e) { toast('Could not open that picture.', 'bad'); return; }
  curPath = path;
  canvas.width = im.naturalWidth; canvas.height = im.naturalHeight;
  overlay.width = canvas.width; overlay.height = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(im, 0, 0);
  undoStack = []; redoStack = [];
  dirty = false; savedTick.textContent = '';
  geoCache = findGeoForTexture(path);
  flag.set('paint:lastFile', path);
  buildFileList();
  syncEmptyState();          // must come first — the viewport has no size while it is hidden,
  syncUVAvailability();      // which would centre the picture against a 0×0 box.
  syncUndoButtons();
  const storedZoom = flag.get('paint:zoom');
  zoom = storedZoom ? clamp(storedZoom, 0.5, 64) : computeFitZoom();
  centerImage();
  renderAll();
}

async function newPictureWizard() {
  const kind = await pickBox({
    title: 'What is this picture for?', icon: '🖼️',
    items: [
      { icon: '👾', label: 'Mob skin', desc: 'The picture your mob or animal wears.', value: 'mob' },
      { icon: '🗡️', label: 'Item icon', desc: 'The picture for something you can hold.', value: 'item' },
      { icon: '🟫', label: 'Block texture', desc: 'The picture for the sides of a block.', value: 'block' },
      { icon: '📦', label: 'Pack icon', desc: 'The picture people see for your whole add-on.', value: 'icon' }
    ]
  });
  if (!kind) return;

  let path, size;
  if (kind === 'icon') {
    path = 'RP/pack_icon.png'; size = 128;
  } else {
    const name = await promptBox({
      title: 'Name it', label: 'What should we call it?', placeholder: 'e.g. dragon', icon: '✏️',
      hint: 'Lowercase letters, numbers and _ only.',
      validate: v => !v ? 'Please type a name.' : !/^[a-z0-9_]+$/i.test(v) ? 'Use only letters, numbers and _' : null
    });
    if (!name) return;
    size = await pickBox({
      title: 'How big?', icon: '📐',
      items: [
        { icon: '🔹', label: '16 × 16', desc: 'Good for most items and blocks.', value: 16 },
        { icon: '🔷', label: '32 × 32', desc: 'A bit more detail.', value: 32 },
        { icon: '🔶', label: '64 × 64', desc: 'Great for mobs.', value: 64 },
        { icon: '🟥', label: '128 × 128', desc: 'Lots of detail for a big mob.', value: 128 }
      ]
    });
    if (!size) return;
    const slug = slugify(name);
    path = kind === 'mob' ? `RP/textures/entity/${slug}.png`
      : kind === 'item' ? `RP/textures/items/${slug}.png`
      : `RP/textures/blocks/${slug}.png`;
  }

  if (fs.exists(path)) { toast('That picture already exists — opening it.', 'warn'); await openImage(path); return; }
  const c = document.createElement('canvas'); c.width = size; c.height = size; // fully transparent
  await fs.writeCanvas(path, c);
  const short = baseName(path).replace(/\.png$/i, '');
  if (kind === 'item') registerItemTexture(short);
  if (kind === 'block') registerBlockTexture(short);
  buildFileList();
  await openImage(path);
  toast('New picture ready — start colouring!', 'good');
}

function registerItemTexture(short) {
  const p = 'RP/textures/item_texture.json';
  const packName = (project.current && project.current.name) || 'My Pack';
  let j = fs.readJSON(p);
  if (!j) j = itemTexture(packName, {});
  j.texture_data = j.texture_data || {};
  j.texture_data[short] = { textures: `textures/items/${short}` };
  fs.writeJSON(p, j);
}
function registerBlockTexture(short) {
  const p = 'RP/textures/terrain_texture.json';
  const packName = (project.current && project.current.name) || 'My Pack';
  let j = fs.readJSON(p);
  if (!j) j = terrainTexture(packName, {});
  j.texture_data = j.texture_data || {};
  j.texture_data[short] = { textures: `textures/blocks/${short}` };
  fs.writeJSON(p, j);
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'thing'; }

// ================================================================== import ===
async function importFromDevice() {
  if (!curPath) { toast('Open or make a picture first.', 'warn'); return; }
  const file = await pickFile('image/png,image/jpeg');
  if (!file) return;
  let im;
  try { im = await loadImageFile(file); } catch (e) { toast('Could not read that picture.', 'bad'); return; }
  const pw = im.naturalWidth || im.width, ph = im.naturalHeight || im.height;
  if (pw !== ph || !isPow2(pw) || !isPow2(ph)) {
    toast('That picture is not square or a size like 16/32/64 — it may look stretched.', 'warn', 4200);
  }
  pushUndo();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
  redrawOverlay();
  scheduleAutosave();
}
function loadImageFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    im.src = url;
  });
}
function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }

// =============================================================== save/undo ===
function syncEmptyState() {
  const has = !!curPath;
  viewport.style.display = has ? 'block' : 'none';
  emptyPanel.style.display = has ? 'none' : 'flex';
  fileLabel.textContent = has ? baseName(curPath) : 'No picture open';
  saveBtn.disabled = !has;
  importBtn.disabled = !has;
  syncSideActive();
  syncUndoButtons();
}
function syncUndoButtons() {
  undoBtn.disabled = !curPath || !undoStack.length;
  redoBtn.disabled = !curPath || !redoStack.length;
}
function syncUVAvailability() {
  const has = !!geoCache;
  uvBtn.disabled = !has;
  faceBtn.disabled = !has;
  uvBtn.title = has ? 'Show squares for where each part goes.' : 'No mob shape linked to this picture yet.';
}
function syncSavedTick(state) {
  if (state === 'dirty') { savedTick.textContent = '● Unsaved'; savedTick.style.color = 'var(--gold)'; }
  else {
    savedTick.textContent = '✓ Saved'; savedTick.style.color = 'var(--grass)';
    setTimeout(() => { if (savedTick.textContent === '✓ Saved') savedTick.textContent = ''; }, 2200);
  }
}
function scheduleAutosave() {
  dirty = true;
  syncSavedTick('dirty');
  syncUndoButtons();
  clearTimeout(autosaveTimer);
  if (settings.get('autosave') !== false) autosaveTimer = setTimeout(saveCurrent, 1500);
}
async function saveCurrent() {
  if (!curPath) return;
  await fs.writeCanvas(curPath, canvas);
  dirty = false;
  syncSavedTick('saved');
  refreshThumbnail(curPath);
  award('first-texture');
}

function pushUndo() {
  if (!curPath) return;
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}
function cancelStroke() {
  if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
  shapeStart = null; shapeBase = null;
  syncUndoButtons();
}
function undo() {
  if (!curPath || !undoStack.length) return;
  redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (redoStack.length > 40) redoStack.shift();
  ctx.putImageData(undoStack.pop(), 0, 0);
  redrawOverlay(); scheduleAutosave(); syncUndoButtons();
}
function redo() {
  if (!curPath || !redoStack.length) return;
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 40) undoStack.shift();
  ctx.putImageData(redoStack.pop(), 0, 0);
  redrawOverlay(); scheduleAutosave(); syncUndoButtons();
}

// ================================================================== colour ===
function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex) || [];
  const n = parseInt(m[1] || '3c3c3c', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); }
function addRecent(hex) {
  recent = [hex, ...recent.filter(h => h !== hex)].slice(0, 16);
  flag.set('paint:recent', recent);
  renderRecent();
}
function renderRecent() {
  clear(recentWrap);
  for (const hex of recent) {
    const b = el('button.pt-swatchbtn', { type: 'button', style: { background: hex }, title: hex });
    b.addEventListener('click', () => { primary = hex; syncSwatches(); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); secondary = hex; syncSwatches(); });
    recentWrap.appendChild(b);
  }
}
function syncSwatches() {
  priSwatchI.style.background = primary; priSwatchI.style.opacity = alpha / 255;
  secSwatchI.style.background = secondary; secSwatchI.style.opacity = alpha / 255;
  flag.set('paint:primary', primary); flag.set('paint:secondary', secondary);
}

// =================================================================== tools ===
function selectTool(id) {
  tool = id; flag.set('paint:tool', id);
  for (const b of toolWrap.querySelectorAll('.pt-tool')) b.classList.toggle('on', b.dataset.tool === id);
  viewport.classList.toggle('pt-hand', id === 'hand');
  sfx.play('click');
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function bresenham(x0, y0, x1, y1, cb) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    cb(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function plot(data, w, h, x, y, color, erase) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  if (erase) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; return; }
  const a = color.a / 255;
  if (a >= 1) { data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b; data[i + 3] = 255; return; }
  const da = data[i + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; return; }
  data[i] = Math.round((color.r * a + data[i] * da * (1 - a)) / outA);
  data[i + 1] = Math.round((color.g * a + data[i + 1] * da * (1 - a)) / outA);
  data[i + 2] = Math.round((color.b * a + data[i + 2] * da * (1 - a)) / outA);
  data[i + 3] = Math.round(outA * 255);
}
function stampBrush(data, w, h, cx, cy, size, color, erase) {
  const off = Math.floor((size - 1) / 2);
  const x0 = cx - off, y0 = cy - off;
  for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) plot(data, w, h, x0 + xx, y0 + yy, color, erase);
  if (mirrorX) {
    const mx0 = (w - size) - x0;
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) plot(data, w, h, mx0 + xx, y0 + yy, color, erase);
  }
}
function stampLine(p0, p1, color, erase) {
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bresenham(p0.x, p0.y, p1.x, p1.y, (x, y) => stampBrush(id.data, id.width, id.height, x, y, brush, color, erase));
  ctx.putImageData(id, 0, 0);
}
function drawRect(data, w, h, p0, p1, filled) {
  const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x);
  const y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
  if (filled) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) stampBrush(data, w, h, x, y, brush, strokeColor, false);
  } else {
    for (let x = x0; x <= x1; x++) { stampBrush(data, w, h, x, y0, brush, strokeColor, false); stampBrush(data, w, h, x, y1, brush, strokeColor, false); }
    for (let y = y0; y <= y1; y++) { stampBrush(data, w, h, x0, y, brush, strokeColor, false); stampBrush(data, w, h, x1, y, brush, strokeColor, false); }
  }
}
function drawEllipse(data, w, h, p0, p1, filled) {
  const x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x);
  const y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.max(0.5, (x1 - x0) / 2), ry = Math.max(0.5, (y1 - y0) / 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = (x - cx + 0.5) / rx, ny = (y - cy + 0.5) / ry;
    const d = nx * nx + ny * ny;
    if (filled ? d <= 1 : Math.abs(d - 1) < 0.28) stampBrush(data, w, h, x, y, brush, strokeColor, false);
  }
}
function drawShapePreview(p1) {
  const id = new ImageData(new Uint8ClampedArray(shapeBase.data), shapeBase.width, shapeBase.height);
  const data = id.data, w = id.width, h = id.height;
  if (tool === 'line') bresenham(shapeStart.x, shapeStart.y, p1.x, p1.y, (x, y) => stampBrush(data, w, h, x, y, brush, strokeColor, false));
  else if (tool === 'rect' || tool === 'rectFill') drawRect(data, w, h, shapeStart, p1, tool === 'rectFill');
  else if (tool === 'ellipse' || tool === 'ellipseFill') drawEllipse(data, w, h, shapeStart, p1, tool === 'ellipseFill');
  ctx.putImageData(id, 0, 0);
}
function floodFillAt(data, w, h, sx, sy, color) {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const idx = (sy * w + sx) * 4;
  const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];
  const nr = color.r, ng = color.g, nb = color.b, na = Math.round(color.a);
  if (tr === nr && tg === ng && tb === nb && ta === na) return;
  const seen = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i]) continue;
    const o = i * 4;
    if (data[o] !== tr || data[o + 1] !== tg || data[o + 2] !== tb || data[o + 3] !== ta) continue;
    seen[i] = 1;
    data[o] = nr; data[o + 1] = ng; data[o + 2] = nb; data[o + 3] = na;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}
function doFill(p, color) {
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  floodFillAt(id.data, id.width, id.height, p.x, p.y, color);
  if (mirrorX) {
    const mx = (id.width - 1) - p.x;
    if (mx !== p.x) floodFillAt(id.data, id.width, id.height, mx, p.y, color);
  }
  ctx.putImageData(id, 0, 0);
}
function pickColor(p, useSecondary) {
  if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return;
  const d = ctx.getImageData(p.x, p.y, 1, 1).data;
  const hex = rgbToHex(d[0], d[1], d[2]);
  if (useSecondary) secondary = hex; else primary = hex;
  addRecent(hex);
  syncSwatches();
}

// ================================================================ pointers ===
function wireCanvasEvents() {
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('contextmenu', e => e.preventDefault());
}
function clientToPixel(e) {
  const rect = viewport.getBoundingClientRect();
  const sx = e.clientX - rect.left - pan.x;
  const sy = e.clientY - rect.top - pan.y;
  return { x: Math.floor(sx / zoom), y: Math.floor(sy / zoom) };
}
function pinchInfoFrom(pts) {
  const [a, b] = pts;
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
}
function onPointerDown(e) {
  if (!curPath) return;
  if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    if (spaceDown || e.button === 1 || tool === 'hand') {
      mode = 'pan';
      panStart = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      viewport.classList.add('pt-panning');
    } else {
      mode = 'draw';
      beginStroke(e);
    }
  } else if (pointers.size === 2) {
    if (mode === 'draw') cancelStroke();
    mode = 'pinch';
    pinch = pinchInfoFrom([...pointers.values()]);
    viewport.classList.add('pt-panning');
  }
}
function onPointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'pan') {
    pan.x = panStart.px + (e.clientX - panStart.x);
    pan.y = panStart.py + (e.clientY - panStart.y);
    renderAll();
  } else if (mode === 'pinch' && pointers.size >= 2) {
    const pts = [...pointers.values()].slice(0, 2);
    const info = pinchInfoFrom(pts);
    const rect = viewport.getBoundingClientRect();
    const midX = info.midX - rect.left, midY = info.midY - rect.top;
    const oldMidX = pinch.midX - rect.left, oldMidY = pinch.midY - rect.top;
    const newZoom = clamp(zoom * (info.dist / Math.max(1, pinch.dist)), 0.5, 64);
    pan.x = midX - (oldMidX - pan.x) * (newZoom / zoom);
    pan.y = midY - (oldMidY - pan.y) * (newZoom / zoom);
    zoom = newZoom;
    pinch = info;
    flag.set('paint:zoom', zoom);
    renderAll();
  } else if (mode === 'draw') {
    continueStroke(e);
  }
}
function onPointerUp(e) {
  pointers.delete(e.pointerId);
  if (mode === 'draw' && pointers.size === 0) { endStroke(); mode = null; }
  else if (mode === 'pan' && pointers.size === 0) { mode = null; viewport.classList.remove('pt-panning'); }
  else if (mode === 'pinch') {
    if (pointers.size < 2) {
      viewport.classList.remove('pt-panning');
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        mode = 'pan'; panStart = { x: p.x, y: p.y, px: pan.x, py: pan.y };
        viewport.classList.add('pt-panning');
      } else mode = null;
    }
  }
}
function onWheel(e) {
  if (!curPath) return;
  e.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const factor = Math.pow(1.15, -e.deltaY / 100);
  const newZoom = clamp(zoom * factor, 0.5, 64);
  pan.x = mx - (mx - pan.x) * (newZoom / zoom);
  pan.y = my - (my - pan.y) * (newZoom / zoom);
  zoom = newZoom;
  flag.set('paint:zoom', zoom);
  renderAll();
}
function onKeyDown(e) {
  if (!active) return;
  if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'Space' && !e.repeat) { spaceDown = true; viewport.classList.add('pt-hand'); e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
}
function onKeyUp(e) {
  if (e.code === 'Space') { spaceDown = false; if (tool !== 'hand') viewport.classList.remove('pt-hand'); }
}

function beginStroke(e) {
  const p = clientToPixel(e);
  const useSecondary = e.button === 2;
  if (tool === 'eyedrop') { pickColor(p, useSecondary); mode = null; return; }
  pushUndo();
  const rgb = hexToRgb(useSecondary ? secondary : primary);
  strokeColor = { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
  lastPos = p;
  if (tool === 'pencil') stampLine(p, p, strokeColor, false);
  else if (tool === 'eraser') stampLine(p, p, null, true);
  else if (tool === 'fill') { doFill(p, strokeColor); finishMutatingStroke(); mode = null; }
  else { shapeStart = p; shapeBase = undoStack[undoStack.length - 1]; drawShapePreview(p); }
}
function continueStroke(e) {
  const p = clientToPixel(e);
  if (tool === 'pencil') { stampLine(lastPos, p, strokeColor, false); lastPos = p; }
  else if (tool === 'eraser') { stampLine(lastPos, p, null, true); lastPos = p; }
  else if (shapeStart) drawShapePreview(p);
}
function endStroke() {
  shapeStart = null; shapeBase = null;
  finishMutatingStroke();
}
function finishMutatingStroke() {
  redrawOverlay();
  scheduleAutosave();
}

// ================================================================== render ===
function computeFitZoom() {
  const rect = viewport.getBoundingClientRect();
  if (!canvas.width || !canvas.height || !rect.width || !rect.height) return 8;
  return clamp(Math.min((rect.width - 24) / canvas.width, (rect.height - 24) / canvas.height), 0.5, 64);
}
function centerImage() {
  const rect = viewport.getBoundingClientRect();
  pan.x = (rect.width - canvas.width * zoom) / 2;
  pan.y = (rect.height - canvas.height * zoom) / 2;
}
function zoomBy(factor) {
  if (!curPath) return;
  const rect = viewport.getBoundingClientRect();
  const midX = rect.width / 2, midY = rect.height / 2;
  const newZoom = clamp(zoom * factor, 0.5, 64);
  pan.x = midX - (midX - pan.x) * (newZoom / zoom);
  pan.y = midY - (midY - pan.y) * (newZoom / zoom);
  zoom = newZoom;
  flag.set('paint:zoom', zoom);
  renderAll();
}
function fitZoom() {
  if (!curPath) return;
  zoom = computeFitZoom();
  flag.set('paint:zoom', zoom);
  centerImage();
  renderAll();
}
function renderAll() {
  if (!curPath) return;
  stage.style.width = (canvas.width * zoom) + 'px';
  stage.style.height = (canvas.height * zoom) + 'px';
  stage.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  redrawOverlay();
}
function redrawOverlay() {
  if (!curPath) return;
  gridLayer.style.display = (settings.get('grid') && zoom >= 8) ? 'block' : 'none';
  gridLayer.style.backgroundSize = zoom + 'px ' + zoom + 'px';

  octx.clearRect(0, 0, overlay.width, overlay.height);
  clear(labelLayer);

  if (mirrorX) {
    octx.strokeStyle = 'rgba(255,255,255,.5)';
    octx.setLineDash([2, 2]);
    octx.beginPath(); octx.moveTo(canvas.width / 2, 0); octx.lineTo(canvas.width / 2, canvas.height); octx.stroke();
    octx.setLineDash([]);
  }

  if (showUV && geoCache) {
    for (const bone of geoCache.bones) {
      for (const cube of bone.cubes) {
        const rects = faceRects(cube);
        rects.forEach((r, i) => {
          const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
          const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
          if (x1 <= x0 || y1 <= y0) return;
          octx.strokeStyle = FACE_COLORS[i];
          octx.lineWidth = 1;
          octx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, y1 - y0 - 1));
          if (zoom >= 12) {
            labelLayer.appendChild(el('span.pt-uvlabel', {
              text: bone.name + ' ' + FACE_NAMES[i],
              style: { color: FACE_COLORS[i], left: (x0 * zoom + 3) + 'px', top: (y0 * zoom + 1) + 'px' }
            }));
          }
        });
      }
    }
  }
}

// ==================================================================== UV ===
function findGeoForTexture(path) {
  const w = canvas.width, h = canvas.height;
  let matchedId = null;
  if (path.startsWith('RP/')) {
    const rel = path.slice(3).replace(/\.png$/i, '');
    const files = [...new Set([...fs.findAll('RP/entity/*.entity.json'), ...fs.findAll('RP/entity/**/*.entity.json')])];
    outer:
    for (const f of files) {
      const j = fs.readJSON(f);
      const desc = j && j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
      if (!desc || !desc.geometry) continue;
      for (const [key, val] of Object.entries(desc.geometry)) {
        const texVal = desc.textures && (desc.textures[key] !== undefined ? desc.textures[key] : desc.textures.default);
        if (texVal === rel) { matchedId = val; break outer; }
      }
    }
  }
  const geoFiles = fs.findAll('RP/models/**/*.geo.json');
  if (matchedId) {
    for (const gf of geoFiles) for (const g of parseGeoFile(fs.readJSON(gf))) if (g.identifier === matchedId) return g;
  }
  for (const gf of geoFiles) for (const g of parseGeoFile(fs.readJSON(gf))) if (g.tw === w && g.th === h) return g;
  return null;
}

function showHeadFace() {
  if (!geoCache) { toast('This picture is not linked to a mob shape yet.', 'warn'); return; }
  const bone = geoCache.bones.find(b => /head/i.test(b.name)) || geoCache.bones[0];
  if (!bone || !bone.cubes.length) { toast('Could not find a head to show.', 'warn'); return; }
  const rects = faceRects(bone.cubes[0]);
  const r = rects[5]; // north, per FACE_NAMES
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
  const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  if (!showUV) { showUV = true; flag.set('paint:uv', true); uvBtn.classList.add('on'); }

  const rect = viewport.getBoundingClientRect();
  const targetZoom = clamp(Math.min(rect.width / (x1 - x0 + 8), rect.height / (y1 - y0 + 8)), 4, 48);
  zoom = targetZoom;
  const cx = (x0 + x1) / 2 * zoom, cy = (y0 + y1) / 2 * zoom;
  pan.x = rect.width / 2 - cx; pan.y = rect.height / 2 - cy;
  flag.set('paint:zoom', zoom);
  renderAll();
  flashRect(x0, y0, x1, y1);
  say(`This square is the <b>${bone.name}</b>'s <b>north</b> face — paint a face in here and it shows up on the front!`);
}
function flashRect(x0, y0, x1, y1) {
  const f = el('div.pt-flash', {
    style: { left: (x0 * zoom) + 'px', top: (y0 * zoom) + 'px', width: ((x1 - x0) * zoom) + 'px', height: ((y1 - y0) * zoom) + 'px' }
  });
  stage.appendChild(f);
  setTimeout(() => f.remove(), 2000);
}

// ==================================================================== export ===
export default { id: 'paint', title: 'Paint', icon: '🎨', mount, show, hide, onFileChange };

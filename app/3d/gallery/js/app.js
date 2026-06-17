// 3D asset gallery. Reads models/index.json, renders a filterable grid of
// thumbnails (one shared WebGL renderer snapshots each model lazily so we never
// exceed the browser's WebGL-context limit), and a click-through live orbit
// viewer. See build_index.py for how index.json is produced.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initAssets, loadGLB, atlasTex, specTex } from './assets.js';

const $ = (s, r = document) => r.querySelector(s);
const grid = $('#grid'), searchEl = $('#search');
const thumbCache = new Map();  // file -> dataURL

const state = { data: null, q: '', cats: new Set(), worlds: new Set(), tags: new Set(), allTags: false };

// ── shared-atlas material treatment (to match Unity's look) ───────────────
// The geometry-only GLBs carry no texture: colour comes purely from each
// vertex's UV position on ONE shared palette atlas. The gradient + specular
// atlases come from the protected pack (assets.js): atlasTex / specTex are
// live bindings set by initAssets() before any model renders. flipY=true (set
// there) reproduces the V-flip correction that makes the palette sample right.
const ATLAS_DIR = 'models_all';   // local-only raw cache (used for the copy-path hint)
function envFor(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}
function enhanceMaterials(root) {
  root.traverse(n => {
    if (!n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) {
      if (m.userData.pbrDone) continue;
      if (atlasTex) m.map = atlasTex;         // shared base-colour palette
      if (specTex) m.metalnessMap = specTex;  // only the metal swatch reads metallic
      m.metalness = 1.0;
      m.roughness = 0.62;                     // semi-gloss, ≈ the pack's 0.64 smoothness
      m.envMapIntensity = 1.0;
      m.needsUpdate = true;
      m.userData.pbrDone = !!(atlasTex && specTex);
    }
  });
}

// ── model loading + normalising ──────────────────────────────────────────
// Models come from the protected pack (assets.js range-fetches + decodes each
// GLB on demand and caches the parsed master, which we clone per thumbnail/view).
function loadModel(file) { return loadGLB(file); }
// center on origin, sit on ground (y=0), scale so max dimension == target
function normalize(obj, target = 1.0) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = target / maxDim;
  obj.scale.setScalar(s);
  obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  return size.y * s; // scaled height
}

// ── shared thumbnail renderer ────────────────────────────────────────────
const TH = 360;
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
thumbRenderer.setSize(TH, TH);
thumbRenderer.setPixelRatio(1);
thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
thumbRenderer.toneMappingExposure = 1.05;
const thumbScene = new THREE.Scene();
const thumbPivot = new THREE.Group();
thumbScene.add(thumbPivot);
addLights(thumbScene);
thumbScene.environment = envFor(thumbRenderer);
const thumbCam = new THREE.PerspectiveCamera(34, 1, 0.05, 100);

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x44505e, 0.95));
  const d = new THREE.DirectionalLight(0xffffff, 1.25);
  d.position.set(2.5, 4, 3);
  scene.add(d);
  const f = new THREE.DirectionalLight(0x9fc0ff, 0.45);
  f.position.set(-3, 1.5, -2);
  scene.add(f);
}
function frame(cam, height, dist = 2.0) {
  cam.position.set(dist * 0.9, height * 0.6 + dist * 0.5, dist);
  cam.lookAt(0, height * 0.45, 0);
}

let thumbBusy = Promise.resolve();
function makeThumb(file) {
  if (thumbCache.has(file)) return Promise.resolve(thumbCache.get(file));
  thumbBusy = thumbBusy.then(async () => {
    if (thumbCache.has(file)) return thumbCache.get(file);
    const master = await loadModel(file);
    const obj = master.clone(true);
    enhanceMaterials(obj);
    const h = normalize(obj, 1.0);
    thumbPivot.clear();
    thumbPivot.add(obj);
    thumbPivot.rotation.y = -0.7;
    frame(thumbCam, h);
    thumbRenderer.render(thumbScene, thumbCam);
    const url = thumbRenderer.domElement.toDataURL('image/png');
    thumbPivot.clear();
    thumbCache.set(file, url);
    return url;
  });
  return thumbBusy;
}

// lazily build thumbs as cards scroll into view
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target, file = img.dataset.file;
    io.unobserve(img);
    makeThumb(file).then(url => { img.src = url; img.classList.remove('ph'); img.textContent = ''; });
  }
}, { rootMargin: '300px' });

// ── filtering ────────────────────────────────────────────────────────────
function matches(it) {
  if (state.cats.size && !state.cats.has(it.category)) return false;
  if (state.worlds.size && !it.worlds.some(w => state.worlds.has(w))) return false;
  for (const t of state.tags) if (!it.tags.includes(t)) return false;
  if (state.q) {
    const hay = (it.title + ' ' + it.name + ' ' + it.category + ' ' + it.tags.join(' ')).toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function renderGrid() {
  const items = state.data.items.filter(matches);
  grid.innerHTML = '';
  $('#empty').classList.toggle('hidden', items.length > 0);
  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'card';
    const cached = thumbCache.get(it.file);
    card.innerHTML = `
      <img class="thumb${cached ? '' : ' ph'}" data-file="${it.file}" alt="${it.title}" ${cached ? `src="${cached}"` : ''}>
      <div class="cmeta">
        <div class="t" title="${it.title}">${it.title}</div>
        <div class="s"><span class="cat">${it.category}</span><span>${(it.tris ?? 0).toLocaleString()} tris</span></div>
      </div>`;
    if (!cached) { const img = card.querySelector('.thumb'); img.textContent = '⏳'; io.observe(img); }
    card.addEventListener('click', () => openViewer(it));
    grid.appendChild(card);
  }
  $('#counts').innerHTML = `<b>${items.length}</b> / ${state.data.count} assets`;
}

// ── filter chips ─────────────────────────────────────────────────────────
function chip(label, count, on, onClick, cls = '') {
  const c = document.createElement('div');
  c.className = 'chip' + (on ? ' on' : '') + (cls ? ' ' + cls : '');
  c.innerHTML = `${label}${count != null ? `<span class="n">${count}</span>` : ''}`;
  c.addEventListener('click', onClick);
  return c;
}
function countBy(items, key) {
  const m = new Map();
  for (const it of items) {
    const vals = Array.isArray(it[key]) ? it[key] : [it[key]];
    for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}
function buildFilters() {
  const d = state.data;
  const catCounts = countBy(d.items, 'category');
  const catWrap = $('#catfilters'); catWrap.innerHTML = '';
  for (const c of d.categories)
    catWrap.appendChild(chip(c, catCounts.get(c) || 0, state.cats.has(c), () => toggle(state.cats, c)));

  const worldCounts = countBy(d.items, 'worlds');
  const wWrap = $('#worldfilters'); wWrap.innerHTML = '';
  for (const w of d.worlds)
    wWrap.appendChild(chip(w, worldCounts.get(w) || 0, state.worlds.has(w), () => toggle(state.worlds, w)));

  // 1,500+ tags — only the most common are shown until "show all" is pressed
  // (every selected tag stays visible regardless of rank so filters never hide).
  const TOP = 50;
  const tagCounts = countBy(d.items, 'tags');
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = state.allTags ? tags
    : tags.filter(([t], i) => i < TOP || state.tags.has(t));
  const tWrap = $('#tagfilters'); tWrap.innerHTML = '';
  for (const [t, n] of shown)
    tWrap.appendChild(chip(t, n, state.tags.has(t), () => toggle(state.tags, t)));
  if (tags.length > TOP) {
    const more = chip(state.allTags ? 'fewer tags ▴' : `+${tags.length - TOP} more tags ▾`,
      null, false, () => { state.allTags = !state.allTags; buildFilters(); }, 'morebtn');
    tWrap.appendChild(more);
  }
}
function toggle(set, v) {
  set.has(v) ? set.delete(v) : set.add(v);
  buildFilters(); renderGrid();
}

// ── live orbit viewer ────────────────────────────────────────────────────
let vRenderer, vScene, vCam, vControls, vRAF, vPivot, vCurrent;
function ensureViewer() {
  if (vRenderer) return;
  const canvas = $('#vcanvas');
  vRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  vRenderer.outputColorSpace = THREE.SRGBColorSpace;
  vRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  vRenderer.toneMappingExposure = 1.05;
  vScene = new THREE.Scene();
  vPivot = new THREE.Group(); vScene.add(vPivot);
  addLights(vScene);
  vScene.environment = envFor(vRenderer);
  vCam = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  vControls = new OrbitControls(vCam, canvas);
  vControls.enableDamping = true; vControls.enablePan = false;
}
function sizeViewer() {
  const canvas = $('#vcanvas');
  const w = canvas.clientWidth || 420, h = canvas.clientHeight || 420;
  vRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  vRenderer.setSize(w, h, false);
  vCam.aspect = w / h; vCam.updateProjectionMatrix();
}
async function openViewer(it) {
  ensureViewer();
  $('#vtitle').textContent = it.title;
  $('#vcat').textContent = it.category;
  const dims = it.size ? it.size.map(n => n + 'm').join(' × ') : '—';
  $('#vmeta').innerHTML = `
    <dt>Triangles</dt><dd>${(it.tris ?? 0).toLocaleString()}</dd>
    <dt>Vertices</dt><dd>${(it.verts ?? 0).toLocaleString()}</dd>
    <dt>Size (W×H×D)</dt><dd>${dims}</dd>
    <dt>Worlds</dt><dd>${it.worlds.length ? it.worlds.join(', ') : '—'}</dd>`;
  $('#vtags').innerHTML = it.tags.map(t => `<span class="chip">${t}</span>`).join('');
  const rel = `app/3d/gallery/${ATLAS_DIR}/${it.file}`;
  $('#vpath').textContent = rel;
  $('#vcopy').onclick = () => { navigator.clipboard?.writeText(rel); $('#vcopy').textContent = 'Copied!'; setTimeout(() => $('#vcopy').textContent = 'Copy path', 1200); };

  $('#viewer').classList.remove('hidden');
  vPivot.clear();
  const master = await loadModel(it.file);
  const obj = master.clone(true);
  enhanceMaterials(obj);
  vCurrent = obj;
  const h = normalize(obj, 1.0);
  vPivot.add(obj);
  sizeViewer();
  frame(vCam, h, 2.1);
  vControls.target.set(0, h * 0.45, 0);
  vControls.update();
  cancelAnimationFrame(vRAF);
  const loop = () => { vControls.update(); vRenderer.render(vScene, vCam); vRAF = requestAnimationFrame(loop); };
  loop();
}
function closeViewer() { cancelAnimationFrame(vRAF); vRAF = 0; $('#viewer').classList.add('hidden'); if (vPivot) vPivot.clear(); }
$('#vclose').addEventListener('click', closeViewer);
$('.vbackdrop').addEventListener('click', closeViewer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
addEventListener('resize', () => { if (vRAF) sizeViewer(); });

// ── boot ─────────────────────────────────────────────────────────────────
searchEl.addEventListener('input', () => { state.q = searchEl.value.trim().toLowerCase(); renderGrid(); });
$('#clearall').addEventListener('click', () => {
  state.cats.clear(); state.worlds.clear(); state.tags.clear(); state.q = ''; searchEl.value = '';
  buildFilters(); renderGrid();
});

// Decode the pack (index + shared atlas) first, then load the metadata catalog
// and build the grid. The catalog is descriptive metadata (titles/tags/tris),
// not art, so it ships as plaintext alongside the obfuscated pack.
initAssets(thumbRenderer)
  .then(() => fetch('data/catalog.json').then(r => r.json()))
  .then(d => {
    state.data = d;
    $('#sub').textContent = d.source;
    searchEl.placeholder = `Search ${d.count} assets…`;
    buildFilters();
    renderGrid();
  }).catch(err => {
    grid.innerHTML = `<p style="color:#e07a62;padding:20px">Failed to load asset pack — ${err}</p>`;
  });

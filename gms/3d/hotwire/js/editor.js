// HOTWIRE level editor. Paints terrain tiles, places every pack object,
// parked cars, weapon pickups and HOTSPOTS (mission givers / shops / story
// triggers / portals — the extensibility points the game reads). Saves to
// localStorage (playable via ?level=custom:<id>), exports/imports JSON,
// ▶ Test boots the game on the level.

import * as THREE from 'three';
import { initAssets, model } from './assets.js';
import { buildGroundCanvas, makeIconSprite, TILE_COLORS } from './world.js';
import { customLevels, saveCustomLevel } from './save.js';
import { VEHICLES } from './vehicles.js';
import { WEAPONS } from './weapons.js';
import { BUILTIN, getLevel } from './levels.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);
const toast = (t) => { const e = $('toast'); e.textContent = t; e.style.opacity = 1; clearTimeout(e._t); e._t = setTimeout(() => e.style.opacity = 0, 1600); };

// object palette (logical pack names, grouped)
const PALETTE = {
  Buildings: ['bld_house_a', 'bld_house_b', 'bld_house_c', 'bld_house_d', 'bld_block_a', 'bld_block_b',
    'bld_office', 'bld_tower', 'bld_bank', 'bld_casino', 'bld_cinema', 'bld_hotel', 'bld_mall',
    'bld_police', 'bld_pgarage', 'bld_fire', 'bld_hospital', 'bld_diner', 'bld_nest', 'bld_garage', 'hangar'],
  Nature: ['tree_a', 'tree_b', 'palm_a', 'palm_b', 'bush', 'rock_a', 'rock_b'],
  Street: ['lamp', 'tlight', 'barrier', 'busstop', 'cone', 'hydrant', 'bench', 'bin', 'dumpster', 'sign_stop', 'atm', 'tirepile', 'crate'],
  Market: ['stall_pizza', 'stall_soda', 'stall_coffee', 'stall_burger'],
  Docks: ['cont_a', 'cont_b', 'cont_c', 'crane', 'ship', 'boat', 'plane', 'heli'],
};
const TERRAINS = [['g', 'Grass'], ['d', 'Dirt'], ['r', 'Road'], ['p', 'Pavement'], ['s', 'Sand'], ['w', 'Water']];
const HOT_KINDS = ['giver', 'shop', 'garage', 'race', 'story', 'portal'];
const HOT_ICONS = ['star', 'snake', 'mug', 'wrench', 'car', 'flag', 'anchor', 'sun', 'skull', 'cash', 'pin'];

// ── state ──
let level = null;             // working level JSON (ground as array of row strings)
let rows = [];                // ground as mutable array of arrays
const ST = {
  mode: 'terrain', terrain: 'r', brush: 2,
  objName: 'bld_house_a', rot: 0, scale: 1,
  carType: 'sedan', carLocked: false, gunW: 'pistol',
  hotKind: 'giver', selected: null,      // {list:'objects'|'cars'|'guns'|'hotspots', idx}
  undo: [],
};

// ── three ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121a22);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1200);
const cam = { x: 190, z: 190, dist: 160 };
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x51603f, 1.3));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(80, 120, 40);
scene.add(sun);

const root = new THREE.Group();
scene.add(root);
let groundMesh = null, groundCanvas = null, groundTex = null;
const markers = { objects: [], cars: [], guns: [], hotspots: [] };
let spawnMarker = null;
const cursor = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 28),
  new THREE.MeshBasicMaterial({ color: 0xffb03e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
cursor.rotation.x = -Math.PI / 2;
cursor.position.y = 0.1;
scene.add(cursor);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ═══════════ level lifecycle ═══════════
function blankLevel(id = 'mylevel', w = 64, h = 64) {
  return {
    id, name: id, w, h, tile: 4,
    ground: Array.from({ length: h }, () => 'g'.repeat(w)),
    objects: [], cars: [], guns: [], hotspots: [],
    spawn: { x: w * 2, z: h * 2, rot: 0 },
  };
}

async function setLevel(lv) {
  level = JSON.parse(JSON.stringify(lv));
  rows = level.ground.map(r => r.split(''));
  $('lvname').value = level.id;
  // ground
  if (groundMesh) { root.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh.material.dispose(); groundTex.dispose(); }
  groundCanvas = buildGroundCanvas(level);
  groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(level.w * level.tile, level.h * level.tile),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(level.w * level.tile / 2, 0, level.h * level.tile / 2);
  root.add(groundMesh);
  // markers
  for (const k of Object.keys(markers)) { for (const m of markers[k]) root.remove(m.g); markers[k] = []; }
  for (let i = 0; i < level.objects.length; i++) await addObjMarker(i);
  for (let i = 0; i < level.cars.length; i++) addCarMarker(i);
  for (let i = 0; i < level.guns.length; i++) addGunMarker(i);
  for (let i = 0; i < level.hotspots.length; i++) addHotMarker(i);
  refreshSpawnMarker();
  cam.x = level.spawn.x; cam.z = level.spawn.z;
  ST.selected = null;
  buildPanel();
  status();
}

async function addObjMarker(i) {
  const o = level.objects[i];
  let g;
  try {
    g = await model(o.m);
    g.rotation.y = o.rot || 0;
    g.scale.setScalar(o.s || 1);
  } catch {
    g = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
  }
  g.position.set(o.x, 0, o.z);
  root.add(g);
  markers.objects[i] = { g };
}
function labelBox(color, text, y = 2.2) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 4.6),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85 }));
  m.position.y = 0.8;
  g.add(m);
  const sp = makeIconSprite(text, 3);
  sp.position.y = y + 1;
  g.add(sp);
  return g;
}
function addCarMarker(i) {
  const c = level.cars[i];
  const g = labelBox(c.locked ? 0x8a4444 : 0x4d7ba3, '🚗');
  g.position.set(c.x, 0, c.z);
  g.rotation.y = c.rot || 0;
  root.add(g);
  markers.cars[i] = { g };
}
function addGunMarker(i) {
  const gn = level.guns[i];
  const g = makeIconSprite('🔫', 3);
  g.position.set(gn.x, 1.6, gn.z);
  root.add(g);
  markers.guns[i] = { g };
}
const HOT_GLYPH = { star: '⭐', snake: '🐍', mug: '☕', wrench: '🔧', car: '🚗', flag: '🏁', anchor: '⚓', sun: '🌴', skull: '💀', cash: '💰', pin: '📍' };
function addHotMarker(i) {
  const h = level.hotspots[i];
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.5, h.radius - 0.9), h.radius, 36),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  g.add(ring);
  const icon = makeIconSprite(HOT_GLYPH[h.icon] || '📍', 4);
  icon.position.y = 3.2;
  g.add(icon);
  g.position.set(h.x, 0, h.z);
  root.add(g);
  markers.hotspots[i] = { g };
}
function refreshSpawnMarker() {
  if (spawnMarker) root.remove(spawnMarker);
  spawnMarker = makeIconSprite('🚩', 4);
  spawnMarker.position.set(level.spawn.x, 2.4, level.spawn.z);
  root.add(spawnMarker);
}

function pushUndo() {
  syncGround();
  ST.undo.push(JSON.stringify(level));
  if (ST.undo.length > 60) ST.undo.shift();
}
async function undo() {
  const s = ST.undo.pop();
  if (!s) { toast('nothing to undo'); return; }
  await setLevel(JSON.parse(s));
  toast('undone');
}
function syncGround() { level.ground = rows.map(r => r.join('')); }

// ═══════════ terrain painting (incremental) ═══════════
function paintTile(c, r) {
  const px = groundCanvas.width / level.w;
  const b = groundCanvas.getContext('2d');
  for (let dr = -ST.brush + 1; dr < ST.brush; dr++)
    for (let dc = -ST.brush + 1; dc < ST.brush; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= level.w || rr >= level.h) continue;
      rows[rr][cc] = ST.terrain;
    }
  // redraw painted region + a border (for kerbs/dashes)
  const c0 = Math.max(0, c - ST.brush - 1), r0 = Math.max(0, r - ST.brush - 1);
  const c1 = Math.min(level.w - 1, c + ST.brush + 1), r1 = Math.min(level.h - 1, r + ST.brush + 1);
  syncGround();
  const patch = buildGroundCanvas(level, px);   // NOTE: simple + correct; fast enough at 64-96²
  b.drawImage(patch, c0 * px, r0 * px, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px,
    c0 * px, r0 * px, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px);
  groundTex.needsUpdate = true;
}

// ═══════════ input ═══════════
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function worldPoint(ev) {
  const ndc = new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, p);
  return p;
}

const pts = new Map();
let painting = false, panning = false, pinch0 = 0, dist0 = 0, dragSel = false;
renderer.domElement.addEventListener('pointerdown', (ev) => {
  try { renderer.domElement.setPointerCapture(ev.pointerId); } catch { }
  pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = cam.dist; painting = false; return; }
  if (ev.button === 2 || ev.button === 1) { panning = true; return; }
  const p = worldPoint(ev);
  if (!p) return;
  if (ST.mode === 'terrain') { pushUndo(); painting = true; paintTile(Math.floor(p.x / level.tile), Math.floor(p.z / level.tile)); }
  else if (ST.mode === 'erase') { eraseAt(p); }
  else if (ST.mode === 'spawn') { pushUndo(); level.spawn = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), rot: 0 }; refreshSpawnMarker(); toast('spawn set'); }
  else {
    // select existing first; else place new
    const hit = findAt(p, ST.mode);
    if (hit != null) { ST.selected = { list: ST.mode, idx: hit }; dragSel = true; buildPanel(); return; }
    placeAt(p);
  }
});
renderer.domElement.addEventListener('pointermove', (ev) => {
  const rec = pts.get(ev.pointerId);
  const p = worldPoint(ev);
  if (p) cursor.position.set(p.x, 0.1, p.z);
  if (!rec) return;
  const dx = ev.clientX - rec.x, dy = ev.clientY - rec.y;
  rec.x = ev.clientX; rec.y = ev.clientY;
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) cam.dist = clamp(dist0 * (pinch0 / Math.max(d, 1)), 30, 420);
    cam.x -= dx * cam.dist * 0.0011; cam.z -= dy * cam.dist * 0.0011;
    return;
  }
  if (panning) { cam.x -= dx * cam.dist * 0.0012; cam.z -= dy * cam.dist * 0.0012; return; }
  if (painting && p) paintTile(Math.floor(p.x / level.tile), Math.floor(p.z / level.tile));
  else if (dragSel && ST.selected && p) moveSelected(p);
});
const endPtr = (ev) => { pts.delete(ev.pointerId); painting = false; panning = false; dragSel = false; if (pts.size < 2) pinch0 = 0; };
renderer.domElement.addEventListener('pointerup', endPtr);
renderer.domElement.addEventListener('pointercancel', endPtr);
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 30, 420);
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { undo(); return; }
  const sel = ST.selected;
  if (!sel) return;
  if (e.key === 'Backspace' || e.key === 'Delete') deleteSelected();
  if (sel.list === 'objects' || sel.list === 'cars') {
    const item = level[sel.list][sel.idx];
    if (e.key === '[') { item.rot = (item.rot || 0) + Math.PI / 8; }
    if (e.key === ']') { item.rot = (item.rot || 0) - Math.PI / 8; }
    markers[sel.list][sel.idx].g.rotation.y = item.rot;
  }
});

function findAt(p, list) {
  const arr = level[list];
  let best = null, bd = 6 * 6;
  for (let i = 0; i < arr.length; i++) {
    const d = (arr[i].x - p.x) ** 2 + (arr[i].z - p.z) ** 2;
    const r = list === 'hotspots' ? Math.max(arr[i].radius, 4) ** 2 : bd;
    if (d < Math.min(bd, r)) { bd = d; best = i; }
  }
  return best;
}
function moveSelected(p) {
  const { list, idx } = ST.selected;
  const item = level[list][idx];
  item.x = +p.x.toFixed(1); item.z = +p.z.toFixed(1);
  markers[list][idx].g.position.set(item.x, list === 'guns' ? 1.6 : 0, item.z);
}
function deleteSelected() {
  const { list, idx } = ST.selected;
  pushUndo();
  root.remove(markers[list][idx].g);
  markers[list].splice(idx, 1);
  level[list].splice(idx, 1);
  ST.selected = null;
  buildPanel();
  toast('deleted');
}
function eraseAt(p) {
  for (const list of ['hotspots', 'cars', 'guns', 'objects']) {
    const i = findAt(p, list);
    if (i != null) { ST.selected = { list, idx: i }; deleteSelected(); return; }
  }
}
async function placeAt(p) {
  pushUndo();
  const x = +p.x.toFixed(1), z = +p.z.toFixed(1);
  if (ST.mode === 'objects') {
    level.objects.push({ m: ST.objName, x, z, rot: ST.rot, s: ST.scale });
    await addObjMarker(level.objects.length - 1);
  } else if (ST.mode === 'cars') {
    const d = { t: ST.carType, x, z, rot: ST.rot };
    if (ST.carLocked) d.locked = true;
    level.cars.push(d);
    addCarMarker(level.cars.length - 1);
  } else if (ST.mode === 'guns') {
    level.guns.push({ w: ST.gunW, x, z });
    addGunMarker(level.guns.length - 1);
  } else if (ST.mode === 'hotspots') {
    const id = 'hot' + (level.hotspots.length + 1);
    level.hotspots.push({ id, kind: ST.hotKind, x, z, radius: 6, label: id, icon: 'pin' });
    addHotMarker(level.hotspots.length - 1);
    ST.selected = { list: 'hotspots', idx: level.hotspots.length - 1 };
    buildPanel();
  }
  status();
}

// ═══════════ panel (context UI) ═══════════
function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild || d; }
function buildPanel() {
  const P = $('panel');
  P.innerHTML = '';
  const sel = ST.selected;

  if (ST.mode === 'terrain') {
    P.append(el('<h4>Terrain brush</h4>'));
    for (const [code, name] of TERRAINS) {
      const s = el(`<span class="swatch ${ST.terrain === code ? 'on' : ''}" title="${name}" style="background:${TILE_COLORS[code][0]}"></span>`);
      s.addEventListener('click', () => { ST.terrain = code; buildPanel(); });
      P.append(s);
    }
    P.append(el('<label>Brush size</label>'));
    const r = el(`<input type="range" min="1" max="5" step="1" value="${ST.brush}">`);
    r.addEventListener('input', () => ST.brush = +r.value);
    P.append(r);
    P.append(el('<div class="hint">Drag to paint. Roads auto-draw kerbs & lane dashes. Water slows and sinks cars.</div>'));
  }

  if (ST.mode === 'objects') {
    P.append(el('<h4>Place object</h4>'));
    for (const [cat, items] of Object.entries(PALETTE)) {
      P.append(el(`<h4>${cat}</h4>`));
      for (const m of items) {
        const b = el(`<button class="pal-item ${ST.objName === m ? 'on' : ''}">${m}</button>`);
        b.addEventListener('click', () => { ST.objName = m; ST.selected = null; buildPanel(); });
        P.append(b);
      }
    }
    P.append(el('<label>Rotation</label>'));
    const r = el(`<input type="range" min="0" max="6.28" step="0.196" value="${ST.rot}">`);
    r.addEventListener('input', () => ST.rot = +r.value);
    P.append(r);
    P.append(el('<label>Scale</label>'));
    const s = el(`<input type="range" min="0.5" max="2.5" step="0.05" value="${ST.scale}">`);
    s.addEventListener('input', () => ST.scale = +s.value);
    P.append(s);
    P.append(el('<div class="hint">Click empty ground to place, click an object to select/drag it. [ ] rotate · Del removes.</div>'));
  }

  if (ST.mode === 'cars') {
    P.append(el('<h4>Parked car</h4>'));
    for (const [id, def] of Object.entries(VEHICLES)) {
      const b = el(`<button class="pal-item ${ST.carType === id ? 'on' : ''}">${def.name} <span style="opacity:.5">(${id})</span></button>`);
      b.addEventListener('click', () => { ST.carType = id; buildPanel(); });
      P.append(b);
    }
    const lk = el(`<button class="pal-item ${ST.carLocked ? 'on' : ''}">🔒 locked (mission car)</button>`);
    lk.addEventListener('click', () => { ST.carLocked = !ST.carLocked; buildPanel(); });
    P.append(lk);
  }

  if (ST.mode === 'guns') {
    P.append(el('<h4>Weapon pickup</h4>'));
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (w.builtin) continue;
      const b = el(`<button class="pal-item ${ST.gunW === id ? 'on' : ''}">${w.name}</button>`);
      b.addEventListener('click', () => { ST.gunW = id; buildPanel(); });
      P.append(b);
    }
  }

  if (ST.mode === 'hotspots') {
    P.append(el('<h4>Hotspot kind</h4>'));
    for (const k of HOT_KINDS) {
      const b = el(`<button class="pal-item ${ST.hotKind === k ? 'on' : ''}">${k}</button>`);
      b.addEventListener('click', () => { ST.hotKind = k; buildPanel(); });
      P.append(b);
    }
    if (sel?.list === 'hotspots') {
      const h = level.hotspots[sel.idx];
      P.append(el('<h4>Selected hotspot</h4>'));
      const field = (label, key, type = 'text') => {
        P.append(el(`<label>${label}</label>`));
        const i = el(`<input type="${type}" value="${h[key] ?? ''}">`);
        i.addEventListener('change', () => {
          h[key] = type === 'number' ? +i.value : i.value;
          root.remove(markers.hotspots[sel.idx].g);
          addHotMarker(sel.idx);
        });
        P.append(i);
      };
      field('id', 'id'); field('label', 'label'); field('radius', 'radius', 'number');
      P.append(el('<label>kind</label>'));
      const ks = el(`<select>${HOT_KINDS.map(k => `<option ${h.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
      ks.addEventListener('change', () => h.kind = ks.value);
      P.append(ks);
      P.append(el('<label>icon</label>'));
      const ic = el(`<select>${HOT_ICONS.map(k => `<option ${h.icon === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`);
      ic.addEventListener('change', () => { h.icon = ic.value; root.remove(markers.hotspots[sel.idx].g); addHotMarker(sel.idx); });
      P.append(ic);
      P.append(el('<label>faction (giver: police/gang/civ)</label>'));
      const fc = el(`<input type="text" value="${h.faction || ''}">`);
      fc.addEventListener('change', () => h.faction = fc.value || undefined);
      P.append(fc);
      P.append(el('<label>portal → map id</label>'));
      const mp = el(`<input type="text" value="${h.map || ''}" placeholder="palmbay / docks / custom id">`);
      mp.addEventListener('change', () => h.map = mp.value || undefined);
      P.append(mp);
      P.append(el('<label>custom mission JSON (offered here)</label>'));
      const ta = el(`<textarea placeholder='{"title":"My Job","offer":{"text":"…"},"steps":[{"type":"goto","x":100,"z":100,"r":6,"label":"Go"}],"reward":200}'></textarea>`);
      ta.value = h.mission ? JSON.stringify(h.mission, null, 1) : '';
      ta.addEventListener('change', () => {
        if (!ta.value.trim()) { delete h.mission; toast('mission cleared'); return; }
        try { h.mission = JSON.parse(ta.value); h.mission.id = h.mission.id || h.id + '_m'; toast('mission attached ✓'); }
        catch (err) { toast('bad JSON: ' + err.message); }
      });
      P.append(ta);
      const del = el('<button class="delbtn">Delete hotspot</button>');
      del.addEventListener('click', deleteSelected);
      P.append(del);
    } else {
      P.append(el('<div class="hint">Click ground to drop a hotspot, then edit its properties here. "giver" opens mission boards, "shop"/"garage" open stores, "portal" jumps to another map, and a custom mission JSON makes it a playable job. See CLAUDE.md for the step schema.</div>'));
    }
  }

  if (ST.mode === 'spawn') P.append(el('<div class="hint">Click to set the player spawn point 🚩</div>'));
  if (ST.mode === 'erase') P.append(el('<div class="hint">Click any object / car / weapon / hotspot to remove it.</div>'));

  if (sel && sel.list !== 'hotspots' && level[sel.list]?.[sel.idx]) {
    const del = el(`<button class="delbtn">Delete selected ${sel.list.slice(0, -1)}</button>`);
    del.addEventListener('click', deleteSelected);
    P.append(del);
  }
}

function status() {
  $('status').textContent =
    `${level.w}×${level.h} · obj ${level.objects.length} · cars ${level.cars.length} · guns ${level.guns.length} · hotspots ${level.hotspots.length}`;
}

// ═══════════ toolbar ═══════════
document.querySelectorAll('#modes button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#modes button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    ST.mode = b.dataset.m;
    ST.selected = null;
    buildPanel();
  });
});
$('b-new').addEventListener('click', async () => {
  const id = $('lvname').value.trim() || 'mylevel';
  await setLevel(blankLevel(id));
  toast('new 64×64 level');
});
function refreshLoadList() {
  const sel = $('b-load');
  sel.innerHTML = '<option value="">Load…</option>';
  for (const b of BUILTIN) sel.append(el(`<option value="builtin:${b}">${b} (built-in)</option>`));
  for (const id of Object.keys(customLevels())) sel.append(el(`<option value="custom:${id}">${id}</option>`));
}
$('b-load').addEventListener('change', async (e) => {
  const v = e.target.value;
  if (!v) return;
  if (v.startsWith('builtin:')) await setLevel(await getLevel(v.slice(8)));
  else await setLevel(customLevels()[v.slice(7)]);
  e.target.value = '';
  toast('loaded');
});
$('b-save').addEventListener('click', () => {
  syncGround();
  level.id = $('lvname').value.trim() || level.id;
  level.name = level.name === level.id ? level.id : (level.name || level.id);
  if (saveCustomLevel(level)) { toast(`saved "${level.id}" — play via Custom`); refreshLoadList(); }
  else toast('save failed (storage full?)');
});
$('b-export').addEventListener('click', () => {
  syncGround();
  level.id = $('lvname').value.trim() || level.id;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(level)], { type: 'application/json' }));
  a.download = `${level.id}.json`;
  a.click();
});
$('b-import').addEventListener('click', () => $('importfile').click());
$('importfile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { await setLevel(JSON.parse(await f.text())); toast('imported'); }
  catch (err) { toast('bad file: ' + err.message); }
});
$('b-undo').addEventListener('click', undo);
$('b-test').addEventListener('click', () => {
  syncGround();
  level.id = $('lvname').value.trim() || level.id;
  if (!saveCustomLevel(level)) { toast('save failed'); return; }
  location.href = `./?level=custom:${encodeURIComponent(level.id)}&mode=free`;
});
$('b-back').addEventListener('click', () => location.href = './');

// ═══════════ boot ═══════════
(async () => {
  await initAssets();
  refreshLoadList();
  await setLevel(await getLevel('palmbay'));
  resize();
  const loop = () => {
    requestAnimationFrame(loop);
    camera.position.set(cam.x, cam.dist, cam.z + cam.dist * 0.45);
    camera.lookAt(cam.x, 0, cam.z);
    renderer.render(scene, camera);
  };
  loop();
  window.__editor = { get level() { return level; }, setLevel, ST };
})().catch(e => { console.error(e); toast('boot failed: ' + e.message); });

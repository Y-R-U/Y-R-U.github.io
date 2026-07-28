// Build — the "make something" wizards (the bridge. replacement) plus the component browser
// (the thing that makes advanced work possible) and the list of everything the child has made.
import { fs } from '../core/fs.js';
import { project } from '../core/project.js';
import { bus } from '../core/bus.js';
import { settings } from '../core/store.js';
import { el, clear, button, toast, confirmBox, promptBox, busy, row, textField, toggle } from '../core/ui.js';
import { tour, say, award } from '../core/coach.js';
import * as B from '../lib/bedrock.js';

const CSS = `
.bd-root { display:flex; flex-direction:column; flex:1; min-height:0; overflow:auto; padding:20px; gap:18px; }
.bd-h1 { font-family:var(--pixel); font-size:clamp(14px,3vw,22px); color:var(--grass); text-shadow:2px 2px 0 #1d3a12; margin-bottom:2px; }
.bd-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }
.bd-card { text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:6px; min-height:44px;
  background:linear-gradient(var(--panel2),var(--panel)); border:2px solid #000;
  box-shadow: inset 0 0 0 1px var(--edge), 0 3px 0 rgba(0,0,0,.45); border-radius:12px; padding:16px;
  color:var(--text); font-family:var(--ui); font-size:1em; transition:transform .1s; }
.bd-card:hover { transform:translateY(-2px); box-shadow: inset 0 0 0 1px var(--grass), 0 6px 0 rgba(0,0,0,.45); }
.bd-card-icon { font-size:2.1em; }
.bd-card b { font-size:1.03em; }
.bd-card small { color:var(--dim); line-height:1.4; }

.bd-things { display:flex; flex-direction:column; gap:10px; }
.bd-thing-list { display:flex; flex-direction:column; gap:8px; }
.bd-thing-row { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:10px;
  background:var(--panel2); border:2px solid var(--edge); flex-wrap:wrap; }
.bd-thing-icon { font-size:1.7em; flex:none; }
.bd-thing-info { flex:1; min-width:120px; }
.bd-thing-info small { display:block; color:var(--dim); font-family:var(--mono); font-size:.78em; }
.bd-thing-actions { display:flex; gap:6px; flex-wrap:wrap; }
.bd-thing-actions .btn { min-height:40px; }

.bd-wizard { max-width:640px; margin:0 auto; width:100%; display:flex; flex-direction:column; gap:16px; flex:1; }
.bd-wiz-head { display:flex; align-items:center; justify-content:space-between; }
.bd-wiz-title { font-family:var(--pixel); font-size:12px; color:var(--gold); }
.bd-x { background:none; border:none; color:var(--dim); font-size:1.3em; cursor:pointer; width:44px; height:44px; border-radius:8px; }
.bd-x:hover { background:var(--panel2); color:var(--text); }
.bd-dots { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; }
.bd-dots i { width:9px; height:9px; border-radius:50%; background:var(--edge2); display:block; }
.bd-dots i.on { background:var(--grass); }
.bd-dots i.done { background:var(--grass-d); }
.bd-q { font-size:1.25em; text-align:center; }
.bd-body-step { flex:1; display:flex; flex-direction:column; justify-content:center; gap:14px; min-height:160px; }
.bd-idprev { font-family:var(--mono); text-align:center; color:var(--grass); font-size:.95em; min-height:1.2em; }
.bd-wiz-nav { display:flex; align-items:center; gap:10px; }
.bd-wiz-nav .grow { flex:1; }
.bd-wiz-nav .btn { min-height:44px; }

.bd-choice-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; max-height:48vh; overflow:auto; padding:2px; }
.bd-choice { display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center;
  padding:16px 10px; min-height:44px; border-radius:12px; cursor:pointer; color:var(--text);
  background:var(--panel2); border:2px solid var(--edge); font-family:var(--ui); }
.bd-choice:hover { border-color:var(--sky); }
.bd-choice.on { border-color:var(--grass); background:var(--panel3); box-shadow: 0 0 0 2px var(--grass) inset; }
.bd-choice-icon { font-size:2em; }
.bd-choice small { color:var(--dim); }

.bd-level { display:flex; flex-direction:column; gap:16px; align-items:stretch; padding:0 6px; }
.bd-level-label { text-align:center; font-size:1.15em; font-weight:700; color:var(--gold); min-height:1.4em; }
.bd-hint2 { text-align:center; color:var(--dim); font-size:.9em; }

.bd-done { max-width:520px; margin:auto; text-align:center; display:flex; flex-direction:column;
  gap:14px; align-items:center; padding:20px; }
.bd-done-icon { font-size:4em; }
.bd-done-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.bd-done-actions .btn { min-height:44px; }

.bd-browse { display:flex; flex-direction:column; gap:16px; padding:4px; flex:1; min-height:0; }
.bd-browse-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.bd-comp-row { display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px;
  background:var(--panel2); border:2px solid var(--edge); flex-wrap:wrap; }
.bd-comp-info { flex:1; min-width:150px; }
.bd-comp-info small { display:block; color:var(--dim); }
.bd-comp-editor { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:2 1 220px; min-width:180px; }
.bd-comp-editor .range { min-width:80px; }
.bd-comp-raw { width:100%; min-height:90px; font-family:var(--mono); font-size:.85em; }

.bd-addpower { border-top:2px solid var(--edge); padding-top:14px; }
.bd-power-search { margin-bottom:10px; }
.bd-power-group { margin-bottom:10px; }
.bd-power-group-title { font-size:.8em; color:var(--dim); font-weight:700; text-transform:uppercase; margin-bottom:6px; letter-spacing:.4px; }
.bd-power-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; }
.bd-power-item:hover { background:var(--panel2); }
.bd-power-item .grow { flex:1; min-width:120px; }
.bd-power-item .btn { min-height:38px; }

@media (max-width:900px) {
  .bd-root { padding:14px; }
  .bd-thing-row { flex-direction:column; align-items:flex-start; }
  .bd-thing-actions { width:100%; }
  .bd-thing-actions .btn { flex:1; }
}
`;

function injectCSS() {
  if (!document.getElementById('build-css')) document.head.appendChild(el('style#build-css', { text: CSS }));
}

// ============================================================== state =======
let root;
let view = 'home';           // 'home' | 'wizard' | 'browse'
let wizardState = null;      // { kind, step, data, done, result, celebrated }
let browseState = null;      // { kind, short }

// ================================================================ kinds ======
const KIND = {
  mob: {
    files: short => ({
      bp: `BP/entities/${short}.json`,
      rp: `RP/entity/${short}.entity.json`,
      rc: `RP/render_controllers/${short}.render_controllers.json`,
      geo: `RP/models/entity/${short}.geo.json`,
      anim: `RP/animations/${short}.animation.json`,
      tex: `RP/textures/entity/${short}.png`,
      spawn: `BP/spawn_rules/${short}.json`,
      loot: `BP/loot_tables/entities/${short}.json`
    }),
    rootKey: 'minecraft:entity',
    langKeys: id => [`entity.${id}.name`, `item.spawn_egg.entity.${id}.name`]
  },
  item: {
    files: short => ({ bp: `BP/items/${short}.json`, tex: `RP/textures/items/${short}.png` }),
    rootKey: 'minecraft:item',
    langKeys: id => [`item.${id}`]
  },
  block: {
    files: short => ({ bp: `BP/blocks/${short}.json`, tex: `RP/textures/blocks/${short}.png` }),
    rootKey: 'minecraft:block',
    langKeys: id => [`tile.${id}.name`]
  }
};

const LANG_PATHS = ['RP/texts/en_US.lang', 'BP/texts/en_US.lang'];

function readLang(path) {
  const text = fs.readText(path) || '';
  const map = {};
  for (const line of text.split('\n')) {
    const m = /^([^=]+)=(.*)$/.exec(line);
    if (m) map[m[1]] = m[2];
  }
  return map;
}
function writeLangEverywhere(mutate) {
  for (const p of LANG_PATHS) {
    if (!fs.exists(p)) continue;
    const map = readLang(p);
    mutate(map);
    fs.write(p, B.langLines(map));
  }
}

function iconFor(t) {
  if (t.kind === 'mob') return '👾';
  if (t.kind === 'block') return '🟫';
  if (t.sub === 'food') return '🍎';
  if (t.sub === 'weapon') return '⚔️';
  return '💎';
}
function subKindOf(comps) {
  if (comps['minecraft:food']) return 'food';
  if (comps['minecraft:damage'] || comps['minecraft:durability']) return 'weapon';
  return 'item';
}
function displayNameFor(kind, id, short) {
  const lang = fs.readText('RP/texts/en_US.lang') || '';
  const key = kind === 'mob' ? `entity.${id}.name` : kind === 'item' ? `item.${id}` : `tile.${id}.name`;
  const m = new RegExp('^' + key.replace(/[.]/g, '\\.') + '=(.*)$', 'm').exec(lang);
  return m ? m[1] : B.titleCase(short);
}

function getThings() {
  const out = [];
  for (const p of fs.findAll('BP/entities/*.json')) {
    const j = fs.readJSON(p); const e = j && j['minecraft:entity']; if (!e) continue;
    const id = e.description.identifier; const short = id.split(':')[1];
    out.push({ kind: 'mob', short, id, name: displayNameFor('mob', id, short) });
  }
  for (const p of fs.findAll('BP/items/*.json')) {
    const j = fs.readJSON(p); const it = j && j['minecraft:item']; if (!it) continue;
    const id = it.description.identifier; const short = id.split(':')[1];
    const sub = subKindOf(it.components || {});
    out.push({ kind: 'item', sub, short, id, name: displayNameFor('item', id, short) });
  }
  for (const p of fs.findAll('BP/blocks/*.json')) {
    const j = fs.readJSON(p); const b = j && j['minecraft:block']; if (!b) continue;
    const id = b.description.identifier; const short = id.split(':')[1];
    out.push({ kind: 'block', short, id, name: displayNameFor('block', id, short) });
  }
  return out;
}
function nameTaken(kind, short) { return getThings().some(t => t.kind === kind && t.short === short); }

// ---------------------------------------------------------- registry files --
function readOrInit(path, initFn) { return fs.readJSON(path) || initFn(); }

/**
 * Swap a short name only where it stands on its own — "geometry.cow", "textures/entity/cow".
 * A plain substring swap would also rewrite "cow" inside "cowbell" and "scarecrow", quietly
 * corrupting unrelated identifiers the moment a child picks a short name.
 */
function swapWord(text, from, to) {
  return text.replace(new RegExp('\\b' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), to);
}

function updateRegistryReferences(kind, oldShort, newShort, oldId, newId) {
  const fixTex = t => typeof t === 'string' ? swapWord(t, oldShort, newShort) : t.map(x => swapWord(x, oldShort, newShort));
  if (kind === 'item') {
    const p = 'RP/textures/item_texture.json';
    const j = fs.readJSON(p);
    if (j && j.texture_data && j.texture_data[oldShort]) {
      const entry = j.texture_data[oldShort];
      delete j.texture_data[oldShort];
      if (entry.textures) entry.textures = fixTex(entry.textures);
      j.texture_data[newShort] = entry;
      fs.writeJSON(p, j);
    }
  } else if (kind === 'block') {
    const p = 'RP/textures/terrain_texture.json';
    const j = fs.readJSON(p);
    if (j && j.texture_data && j.texture_data[oldShort]) {
      const entry = j.texture_data[oldShort];
      delete j.texture_data[oldShort];
      if (entry.textures) entry.textures = fixTex(entry.textures);
      j.texture_data[newShort] = entry;
      fs.writeJSON(p, j);
    }
    const bp = 'RP/blocks.json';
    const bj = fs.readJSON(bp);
    if (bj && bj[oldId]) {
      const entry = bj[oldId];
      delete bj[oldId];
      if (entry.textures) entry.textures = swapWord(String(entry.textures), oldShort, newShort);
      bj[newId] = entry;
      fs.writeJSON(bp, bj);
    }
  }
}
function duplicateRegistryEntry(kind, short, newShort) {
  const p = kind === 'item' ? 'RP/textures/item_texture.json' : 'RP/textures/terrain_texture.json';
  const j = fs.readJSON(p); if (!j || !j.texture_data || !j.texture_data[short]) return;
  const entry = JSON.parse(JSON.stringify(j.texture_data[short]));
  if (entry.textures) entry.textures = typeof entry.textures === 'string' ? swapWord(entry.textures, short, newShort) : entry.textures.map(x => swapWord(x, short, newShort));
  j.texture_data[newShort] = entry;
  fs.writeJSON(p, j);
}
function duplicateBlocksJsonEntry(oldId, newId, short, newShort) {
  const bj = fs.readJSON('RP/blocks.json'); if (!bj || !bj[oldId]) return;
  const entry = JSON.parse(JSON.stringify(bj[oldId]));
  if (entry.textures) entry.textures = swapWord(String(entry.textures), short, newShort);
  bj[newId] = entry;
  fs.writeJSON('RP/blocks.json', bj);
}
function removeRegistryEntry(path, short) {
  const j = fs.readJSON(path); if (!j || !j.texture_data || !j.texture_data[short]) return;
  delete j.texture_data[short];
  fs.writeJSON(path, j);
}
function removeBlocksJsonEntry(id) {
  const j = fs.readJSON('RP/blocks.json'); if (!j || !j[id]) return;
  delete j[id];
  fs.writeJSON('RP/blocks.json', j);
}

// ------------------------------------------------------- rename/dup/delete --
function renameThing(kind, oldShort, newShort, newDisplay) {
  const K = KIND[kind];
  const ns = project.current.namespace;
  const oldId = `${ns}:${oldShort}`, newId = `${ns}:${newShort}`;
  const F = K.files(oldShort), NF = K.files(newShort);
  for (const k of Object.keys(F)) {
    const p = F[k]; if (!fs.exists(p)) continue;
    if (fs.isBinary(p)) { const b = fs.read(p); fs.delete(p); fs.write(NF[k], b); continue; }
    const txt = swapWord(fs.readText(p).split(oldId).join(newId), oldShort, newShort);
    fs.delete(p); fs.write(NF[k], txt);
  }
  updateRegistryReferences(kind, oldShort, newShort, oldId, newId);
  writeLangEverywhere(map => {
    for (const k of K.langKeys(oldId)) delete map[k];
    const nk = K.langKeys(newId);
    if (kind === 'mob') { map[nk[0]] = newDisplay; map[nk[1]] = 'Spawn ' + newDisplay; }
    else map[nk[0]] = newDisplay;
  });
}
function duplicateThing(kind, short) {
  const K = KIND[kind];
  const ns = project.current.namespace;
  const existing = new Set(getThings().filter(t => t.kind === kind).map(t => t.short));
  let newShort = B.safeName(short + '_copy'), n = 2;
  while (existing.has(newShort)) newShort = B.safeName(short + '_copy' + (n++));
  const oldId = `${ns}:${short}`, newId = `${ns}:${newShort}`;
  const F = K.files(short), NF = K.files(newShort);
  for (const k of Object.keys(F)) {
    const p = F[k]; if (!fs.exists(p)) continue;
    if (fs.isBinary(p)) { fs.write(NF[k], fs.read(p)); continue; }
    const txt = swapWord(fs.readText(p).split(oldId).join(newId), short, newShort);
    fs.write(NF[k], txt);
  }
  if (kind === 'item') duplicateRegistryEntry('item', short, newShort);
  if (kind === 'block') { duplicateRegistryEntry('block', short, newShort); duplicateBlocksJsonEntry(oldId, newId, short, newShort); }
  writeLangEverywhere(map => {
    const oldKeys = K.langKeys(oldId), newKeys = K.langKeys(newId);
    const base = map[oldKeys[0]] || B.titleCase(short);
    if (kind === 'mob') { map[newKeys[0]] = base + ' Copy'; map[newKeys[1]] = 'Spawn ' + base + ' Copy'; }
    else map[newKeys[0]] = base + ' Copy';
  });
  return newShort;
}
function deleteThing(kind, short) {
  const K = KIND[kind];
  const ns = project.current.namespace;
  const id = `${ns}:${short}`;
  const F = K.files(short);
  for (const p of Object.values(F)) if (fs.exists(p)) fs.delete(p);
  if (kind === 'item') removeRegistryEntry('RP/textures/item_texture.json', short);
  if (kind === 'block') { removeRegistryEntry('RP/textures/terrain_texture.json', short); removeBlocksJsonEntry(id); }
  writeLangEverywhere(map => { for (const k of K.langKeys(id)) delete map[k]; });
}
function updateDisplayName(kind, id, display) {
  const K = KIND[kind];
  writeLangEverywhere(map => {
    const keys = K.langKeys(id);
    if (kind === 'mob') { map[keys[0]] = display; map[keys[1]] = 'Spawn ' + display; }
    else map[keys[0]] = display;
  });
}

// ============================================================ pixel art =====
function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

function draw(w, h, fn) {
  return new Promise(resolve => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    fn(x, c);
    c.toBlob(async b => resolve(new Uint8Array(await b.arrayBuffer())), 'image/png');
  });
}

/** Paints a placeholder texture whose box-UV regions line up exactly with the given
 *  starter geometry (same source of truth used for the RP model — no guessing). */
function genMobTexture(short, geoObj) {
  const desc = geoObj['minecraft:geometry'][0];
  const tw = desc.description.texture_width, th = desc.description.texture_height;
  const hue = hashHue(short);
  const base = hsl(hue, 55, 55), dark = hsl(hue, 55, 36);
  return draw(tw, th, (x) => {
    x.clearRect(0, 0, tw, th);
    const painted = new Set();
    for (const bone of desc.bones) {
      for (const cube of bone.cubes || []) {
        if (!Array.isArray(cube.uv)) continue;
        const key = cube.uv.join(',');
        if (painted.has(key)) continue;
        painted.add(key);
        const [u, v] = cube.uv;
        const w = Math.abs(cube.size[0]), h = Math.abs(cube.size[1]), d = Math.abs(cube.size[2]);
        const W = 2 * (w + d), H = h + d;
        x.fillStyle = base; x.fillRect(u, v, W, H);
        x.fillStyle = dark; x.fillRect(u, v, W, d);
        if (bone.name === 'head') {
          const fx = u + d, fy = v + d;
          const ew = Math.max(1, Math.round(w * 0.14));
          x.fillStyle = '#12200c';
          x.fillRect(fx + w * 0.18, fy + h * 0.35, ew, ew);
          x.fillRect(fx + w * 0.68, fy + h * 0.35, ew, ew);
          x.fillStyle = '#fff';
          x.fillRect(fx + w * 0.18, fy + h * 0.35, Math.max(1, ew - 1), Math.max(1, ew - 1));
          x.fillRect(fx + w * 0.68, fy + h * 0.35, Math.max(1, ew - 1), Math.max(1, ew - 1));
          x.fillStyle = '#12200c';
          x.fillRect(fx + w * 0.32, fy + h * 0.66, Math.max(1, w * 0.3), Math.max(1, Math.round(h * 0.07)));
        } else if (bone.name === 'body') {
          for (let i = 0; i < Math.floor(W / 6); i++) {
            x.fillStyle = i % 2 ? hsl(hue, 55, 62) : hsl(hue, 55, 45);
            x.fillRect(u + 2 + (i * 6) % Math.max(1, W - 4), v + d + 2 + (i * 3) % Math.max(1, H - d - 4), 2, 2);
          }
        }
      }
    }
  });
}

function genItemIcon(short, sub) {
  const hue = hashHue(short);
  return draw(16, 16, (x) => {
    x.clearRect(0, 0, 16, 16);
    if (sub === 'food') {
      x.fillStyle = hsl(hue, 65, 55); x.fillRect(5, 6, 6, 5);
      x.fillRect(4, 7, 8, 3);
      x.fillStyle = hsl(hue, 70, 72); x.fillRect(6, 7, 2, 2);
      x.fillStyle = '#6cc349'; x.fillRect(7, 2, 2, 3);
    } else if (sub === 'weapon') {
      x.fillStyle = '#c7cbd6';
      for (let i = 0; i < 9; i++) x.fillRect(3 + i, 2 + Math.floor(i / 3), 1, 8 - Math.floor(i / 3));
      x.fillStyle = '#e7c25a'; x.fillRect(1, 10, 5, 1);
      x.fillStyle = '#7a5230'; x.fillRect(2, 11, 3, 3);
    } else if (sub === 'tool') {
      x.fillStyle = '#9aa0ab';
      x.fillRect(3, 2, 9, 4); x.fillRect(2, 3, 3, 3); x.fillRect(10, 2, 4, 3);
      x.fillStyle = '#7a5230'; x.fillRect(7, 6, 2, 8);
    } else {
      x.fillStyle = hsl(hue, 60, 55);
      x.fillRect(4, 3, 8, 3); x.fillRect(3, 6, 10, 4); x.fillRect(4, 10, 8, 3);
      x.fillStyle = hsl(hue, 60, 74); x.fillRect(6, 5, 4, 3);
    }
  });
}
function genBlockTexture(short) {
  const hue = hashHue(short);
  return draw(16, 16, (x) => {
    x.fillStyle = hsl(hue, 30, 32); x.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 28; i++) {
      x.fillStyle = i % 2 ? hsl(hue, 30, 40) : hsl(hue, 30, 26);
      x.fillRect((i * 7) % 16, (i * 5) % 16, 2, 2);
    }
  });
}

// ============================================================ level tables ===
const TOUGH_LEVELS = [
  { label: 'Squishy like a chicken', health: 4 },
  { label: 'Soft like a bunny', health: 6 },
  { label: 'Sturdy like a pig', health: 10 },
  { label: 'Tough like a cow', health: 16 },
  { label: 'Strong like a wolf', health: 24 },
  { label: 'Mighty like a zombie', health: 32 },
  { label: 'Tough like an Iron Golem', health: 100 }
];
const SPEED_LEVELS = [
  { label: 'Slow like a turtle', speed: 0.08 },
  { label: 'Gentle like a cow', speed: 0.15 },
  { label: 'Normal like a pig', speed: 0.25 },
  { label: 'Quick like a wolf', speed: 0.3 },
  { label: 'Fast like a horse', speed: 0.4 }
];
const NUTRITION_LEVELS = [
  { label: 'A little filling, like a carrot', nutrition: 3 },
  { label: 'Pretty filling, like bread', nutrition: 5 },
  { label: 'Very filling, like a baked potato', nutrition: 6 },
  { label: 'Super filling, like a steak', nutrition: 8 }
];
const DAMAGE_LEVELS = [
  { label: 'A light tap', damage: 3 },
  { label: 'A decent hit, like a stone sword', damage: 5 },
  { label: 'A strong hit, like an iron sword', damage: 6 },
  { label: 'A heavy hit, like a diamond sword', damage: 7 },
  { label: 'A massive hit, like netherite', damage: 8 }
];
const DURABILITY_LEVELS = [
  { label: 'Breaks fast, like wood', durability: 60 },
  { label: 'Holds up, like stone', durability: 132 },
  { label: 'Lasts a while, like iron', durability: 251 },
  { label: 'Lasts ages, like diamond', durability: 1562 },
  { label: 'Nearly forever, like netherite', durability: 2032 }
];
const DIG_LEVELS = [
  { label: 'Slow, like your bare hand', digSpeed: 1 },
  { label: 'OK, like a stone pickaxe', digSpeed: 4 },
  { label: 'Good, like an iron pickaxe', digSpeed: 6 },
  { label: 'Great, like a diamond pickaxe', digSpeed: 8 },
  { label: 'Super fast, like netherite', digSpeed: 9 }
];
const HARDNESS_LEVELS = [
  { label: 'Breaks in a flash, like leaves', hardness: 0.2 },
  { label: 'Quick, like dirt', hardness: 0.5 },
  { label: 'Normal, like stone', hardness: 1.5 },
  { label: 'Tough, like an iron block', hardness: 5 },
  { label: 'Takes forever, like obsidian', hardness: 50 }
];

// ================================================================ writers ====
async function writeMob(data) {
  const ns = project.current.namespace;
  const short = B.safeName(data.name);
  const id = `${ns}:${short}`;
  const shapeCard = data.shape || 'blob';
  const geoShape = shapeCard === 'bird' ? 'blob' : shapeCard;
  const tough = TOUGH_LEVELS[data.toughIdx ?? 2];
  const spd = SPEED_LEVELS[data.speedIdx ?? 2];
  const collision = geoShape === 'biped' ? { w: 0.6, h: 1.9 } : geoShape === 'quadruped' ? { w: 0.9, h: 1.3 } : { w: 0.8, h: 0.9 };
  const opts = { health: tough.health, speed: spd.speed, hostile: !!data.hostile, collision, floats: !data.hostile, flying: shapeCard === 'bird' };
  if (data.drop && data.drop.id) opts.drops = [data.drop.id];

  fs.writeJSON(`BP/entities/${short}.json`, B.entityBP(id, opts));
  fs.writeJSON(`RP/entity/${short}.entity.json`, B.entityRP(id, {
    geo: `geometry.${short}`, texture: `textures/entity/${short}`,
    anims: { idle: `animation.${short}.idle`, walk: `animation.${short}.walk` }
  }));
  fs.writeJSON(`RP/render_controllers/${short}.render_controllers.json`, B.renderController(id));
  const geoObj = B.starterGeo(short, geoShape);
  fs.writeJSON(`RP/models/entity/${short}.geo.json`, geoObj);
  fs.writeJSON(`RP/animations/${short}.animation.json`, B.starterAnims(short, geoShape));
  fs.write(`RP/textures/entity/${short}.png`, await genMobTexture(short, geoObj));
  if (data.spawn) fs.writeJSON(`BP/spawn_rules/${short}.json`, B.spawnRule(id, { hostile: !!data.hostile }));
  if (data.drop && data.drop.id) fs.writeJSON(`BP/loot_tables/entities/${short}.json`, B.lootTable([{ name: data.drop.id }]));

  const display = B.titleCase(data.name);
  writeLangEverywhere(map => { map[`entity.${id}.name`] = display; map[`item.spawn_egg.entity.${id}.name`] = 'Spawn ' + display; });
  return { short, id, display };
}

async function writeItem(data) {
  const ns = project.current.namespace;
  const short = B.safeName(data.name);
  const id = `${ns}:${short}`;
  const kind = data.kind || 'item';
  const display = B.titleCase(data.name);
  const opts = { displayName: display };
  if (kind !== 'item') opts.kind = kind;
  if (kind === 'food') opts.nutrition = NUTRITION_LEVELS[data.nutriIdx ?? 1].nutrition;
  if (kind === 'weapon') { opts.damage = DAMAGE_LEVELS[data.dmgIdx ?? 2].damage; opts.durability = DURABILITY_LEVELS[data.durIdx ?? 1].durability; }
  if (kind === 'tool') { opts.digSpeed = DIG_LEVELS[data.digIdx ?? 2].digSpeed; opts.durability = DURABILITY_LEVELS[data.durIdx ?? 1].durability; }

  fs.writeJSON(`BP/items/${short}.json`, B.itemBP(id, opts));
  fs.write(`RP/textures/items/${short}.png`, await genItemIcon(short, kind));
  const texPath = 'RP/textures/item_texture.json';
  const texJson = readOrInit(texPath, () => B.itemTexture(project.current.name, {}));
  texJson.texture_data = texJson.texture_data || {};
  texJson.texture_data[short] = { textures: `textures/items/${short}` };
  fs.writeJSON(texPath, texJson);

  writeLangEverywhere(map => { map[`item.${id}`] = display; });
  return { short, id, display };
}

async function writeBlock(data) {
  const ns = project.current.namespace;
  const short = B.safeName(data.name);
  const id = `${ns}:${short}`;
  const hardness = HARDNESS_LEVELS[data.hardIdx ?? 2].hardness;
  const opts = { hardness, transparent: !!data.seeThrough };
  if (data.glow) opts.light = 15;
  const display = B.titleCase(data.name);

  fs.writeJSON(`BP/blocks/${short}.json`, B.blockBP(id, opts));
  fs.write(`RP/textures/blocks/${short}.png`, await genBlockTexture(short));
  const terrainPath = 'RP/textures/terrain_texture.json';
  const terrainJson = readOrInit(terrainPath, () => B.terrainTexture(project.current.name, {}));
  terrainJson.texture_data = terrainJson.texture_data || {};
  terrainJson.texture_data[short] = { textures: `textures/blocks/${short}` };
  fs.writeJSON(terrainPath, terrainJson);
  const blocksPath = 'RP/blocks.json';
  const blocksJson = readOrInit(blocksPath, () => ({ format_version: [1, 1, 0] }));
  blocksJson[id] = { textures: short, sound: 'stone' };
  fs.writeJSON(blocksPath, blocksJson);

  writeLangEverywhere(map => { map[`tile.${id}.name`] = display; });
  return { short, id, display };
}

// ============================================================= wizard UI =====
function renderChoiceStep(wrap, options, data, key) {
  const grid = el('div.bd-choice-grid');
  for (const opt of options) {
    const on = data[key] === opt.value;
    grid.appendChild(el('button.bd-choice' + (on ? '.on' : ''), { type: 'button', on: { click: () => { data[key] = opt.value; render(); } } }, [
      el('span.bd-choice-icon', { text: opt.icon }),
      el('b', { text: opt.label }),
      opt.desc ? el('small', { text: opt.desc }) : null
    ]));
  }
  wrap.appendChild(grid);
}

function renderLevelStep(wrap, levels, data, key, def) {
  if (data[key] === undefined) data[key] = def ?? Math.floor(levels.length / 2);
  const labelEl = el('div.bd-level-label', { text: levels[data[key]].label });
  const input = el('input.range', { type: 'range', min: 0, max: levels.length - 1, step: 1, value: data[key] });
  input.addEventListener('input', () => {
    data[key] = parseInt(input.value, 10);
    labelEl.textContent = levels[data[key]].label;
  });
  wrap.appendChild(el('div.bd-level', {}, [input, labelEl]));
}

function renderDropStep(wrap, data) {
  const myItems = getThings().filter(t => t.kind === 'item');
  wrap.appendChild(el('div.bd-hint2', { text: 'Pick what it leaves behind when it is defeated.' }));
  const grid = el('div.bd-choice-grid');
  const addOpt = (value, icon, label, desc) => {
    const on = (data.drop ? data.drop.id : null) === value;
    grid.appendChild(el('button.bd-choice' + (on ? '.on' : ''), { type: 'button', on: { click: () => { data.drop = value ? { id: value } : null; render(); } } }, [
      el('span.bd-choice-icon', { text: icon }), el('b', { text: label }), desc ? el('small', { text: desc }) : null
    ]));
  };
  addOpt(null, '🚫', 'Nothing', 'No drop.');
  for (const it of myItems) addOpt(it.id, '🎒', it.name, 'Your own item.');
  for (const v of B.VANILLA_ITEMS) addOpt(v, '📦', B.titleCase(v));
  wrap.appendChild(grid);
}

function renderNameStep(wrap, data, refreshValidity, checkKind) {
  const ns = project.current.namespace;
  const input = textField(data.name || '', { placeholder: 'e.g. Ice Wolf' });
  const idPreview = el('div.bd-idprev');
  const err = el('div.field-err');
  const update = () => {
    data.name = input.value;
    const short = B.safeName(input.value || '');
    const trimmed = input.value.trim();
    idPreview.textContent = trimmed ? `${ns}:${short}` : '';
    err.textContent = trimmed && nameTaken(checkKind, short) ? 'You already have one called that — try another name.' : '';
    refreshValidity && refreshValidity();
  };
  input.addEventListener('input', update);
  wrap.append(row('What should we call it?', input, 'Big and friendly — you can change this later.'), idPreview, err);
  setTimeout(() => input.focus(), 30);
}
function nameStepValid(data, checkKind) {
  const s = B.safeName(data.name || '');
  if (!data.name || !s) return false;
  const id = `${project.current.namespace}:${s}`;
  return B.ID_RE.test(id) && !nameTaken(checkKind, s);
}

function mobSteps(data) {
  return [
    { title: 'What should we call it?', body: (wrap, d, rv) => renderNameStep(wrap, d, rv, 'mob'), valid: () => nameStepValid(data, 'mob') },
    { title: 'What shape is its body?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: 'blob', icon: '🟢', label: 'Blob', desc: 'A round friendly shape.' },
      { value: 'biped', icon: '🧍', label: 'Person', desc: 'Arms, legs and a head.' },
      { value: 'quadruped', icon: '🐾', label: 'Animal', desc: 'Four legs, like a dog.' },
      { value: 'bird', icon: '🐦', label: 'Bird', desc: 'A blob shape that flies.' }
    ], d, 'shape'), valid: () => !!data.shape },
    { title: 'Is it friendly or scary?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: false, icon: '😊', label: 'Friendly', desc: 'It will not attack you.' },
      { value: true, icon: '😈', label: 'Scary', desc: 'It will attack players.' }
    ], d, 'hostile'), valid: () => data.hostile !== undefined },
    { title: 'How tough is it?', body: (wrap, d) => renderLevelStep(wrap, TOUGH_LEVELS, d, 'toughIdx', 2), valid: () => true },
    { title: 'How fast does it move?', body: (wrap, d) => renderLevelStep(wrap, SPEED_LEVELS, d, 'speedIdx', 2), valid: () => true },
    { title: 'What does it drop?', body: (wrap, d) => renderDropStep(wrap, d), valid: () => true },
    { title: 'Should it appear in the world on its own?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: true, icon: '🌍', label: 'Yes', desc: 'It can spawn naturally.' },
      { value: false, icon: '🪄', label: 'No', desc: 'Only with /summon.' }
    ], d, 'spawn'), valid: () => data.spawn !== undefined }
  ];
}

function itemSteps(startKind, data) {
  const steps = [
    { title: 'What should we call it?', body: (wrap, d, rv) => renderNameStep(wrap, d, rv, 'item'), valid: () => nameStepValid(data, 'item') }
  ];
  if (startKind === 'item') {
    steps.push({ title: 'What does it do?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: 'item', icon: '💎', label: 'Just to collect', desc: 'A treasure or trophy.' },
      { value: 'food', icon: '🍎', label: 'Something to eat', desc: 'It fills you up.' },
      { value: 'weapon', icon: '⚔️', label: 'A weapon', desc: 'For fighting.' },
      { value: 'tool', icon: '⛏️', label: 'A tool', desc: 'For digging.' }
    ], d, 'kind'), valid: () => !!data.kind });
  } else if (startKind === 'weapontool') {
    steps.push({ title: 'Weapon or tool?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: 'weapon', icon: '⚔️', label: 'Weapon', desc: 'For fighting.' },
      { value: 'tool', icon: '⛏️', label: 'Tool', desc: 'For digging.' }
    ], d, 'kind'), valid: () => !!data.kind });
  } else {
    data.kind = 'food';
  }
  const kind = data.kind;
  if (kind === 'food') steps.push({ title: 'How filling is it?', body: (wrap, d) => renderLevelStep(wrap, NUTRITION_LEVELS, d, 'nutriIdx', 1), valid: () => true });
  if (kind === 'weapon') {
    steps.push({ title: 'How much damage does it do?', body: (wrap, d) => renderLevelStep(wrap, DAMAGE_LEVELS, d, 'dmgIdx', 2), valid: () => true });
    steps.push({ title: 'How long does it last?', body: (wrap, d) => renderLevelStep(wrap, DURABILITY_LEVELS, d, 'durIdx', 1), valid: () => true });
  }
  if (kind === 'tool') {
    steps.push({ title: 'How fast does it dig?', body: (wrap, d) => renderLevelStep(wrap, DIG_LEVELS, d, 'digIdx', 2), valid: () => true });
    steps.push({ title: 'How long does it last?', body: (wrap, d) => renderLevelStep(wrap, DURABILITY_LEVELS, d, 'durIdx', 1), valid: () => true });
  }
  return steps;
}

function blockSteps(data) {
  return [
    { title: 'What should we call it?', body: (wrap, d, rv) => renderNameStep(wrap, d, rv, 'block'), valid: () => nameStepValid(data, 'block') },
    { title: 'How hard is it to break?', body: (wrap, d) => renderLevelStep(wrap, HARDNESS_LEVELS, d, 'hardIdx', 2), valid: () => true },
    { title: 'Does it glow?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: true, icon: '✨', label: 'Yes', desc: 'It lights up like a torch.' },
      { value: false, icon: '⬛', label: 'No', desc: 'It stays dark.' }
    ], d, 'glow'), valid: () => data.glow !== undefined },
    { title: 'Can you see through it?', body: (wrap, d) => renderChoiceStep(wrap, [
      { value: true, icon: '🪟', label: 'Yes', desc: 'Like glass.' },
      { value: false, icon: '🧱', label: 'No', desc: 'Solid, like stone.' }
    ], d, 'seeThrough'), valid: () => data.seeThrough !== undefined }
  ];
}

const WIZ_META = {
  mob: { title: 'Make a Mob', steps: mobSteps },
  item: { title: 'Make an Item', steps: d => itemSteps('item', d) },
  food: { title: 'Make Food', steps: d => itemSteps('food', d) },
  weapontool: { title: 'Make a Weapon or Tool', steps: d => itemSteps('weapontool', d) },
  block: { title: 'Make a Block', steps: blockSteps }
};

function startWizard(kind) {
  wizardState = { kind, step: 0, data: {} };
  if (kind === 'food') wizardState.data.kind = 'food';
  view = 'wizard';
  render();
}
function cancelWizard() {
  confirmBox({ title: 'Stop making this?', body: 'Nothing will be saved.', ok: 'Yes, stop', cancel: 'Keep going', danger: true, icon: '❓' })
    .then(yes => { if (yes) { wizardState = null; view = 'home'; render(); } });
}

function renderWizardStep() {
  const wiz = WIZ_META[wizardState.kind];
  const steps = wiz.steps(wizardState.data);
  const step = steps[wizardState.step];
  const box = el('div.bd-wizard');
  const head = el('div.bd-wiz-head', {}, [
    el('div.bd-wiz-title', { text: wiz.title }),
    el('button.bd-x', { type: 'button', text: '✕', 'aria-label': 'Cancel', on: { click: cancelWizard } })
  ]);
  const dots = el('div.bd-dots', {}, steps.map((_, i) => el('i' + (i === wizardState.step ? '.on' : i < wizardState.step ? '.done' : ''))));
  const qTitle = el('h2.bd-q', { text: step.title });
  const body = el('div.bd-body-step');
  const nextBtn = button(wizardState.step === steps.length - 1 ? 'Finish! 🎉' : 'Next →', {
    kind: 'good',
    onClick: async () => {
      if (!step.valid()) { toast('Pick something first!', 'warn'); return; }
      if (wizardState.step === steps.length - 1) await finishWizard();
      else { wizardState.step++; render(); }
    }
  });
  const backBtn = button('← Back', { kind: 'ghost', onClick: () => { if (wizardState.step === 0) cancelWizard(); else { wizardState.step--; render(); } } });
  nextBtn.disabled = !step.valid();
  const refreshValidity = () => { nextBtn.disabled = !step.valid(); };
  step.body(body, wizardState.data, refreshValidity);
  const nav = el('div.bd-wiz-nav', {}, [backBtn, el('div.grow'), nextBtn]);
  box.append(head, dots, qTitle, body, nav);
  root.appendChild(box);
}

async function finishWizard() {
  const kind = wizardState.kind;
  const b = busy('Making it now…');
  try {
    let result;
    if (kind === 'mob') result = await writeMob(wizardState.data);
    else if (kind === 'block') result = await writeBlock(wizardState.data);
    else result = await writeItem(wizardState.data);
    wizardState.result = result;
    wizardState.done = true;
  } catch (e) {
    console.error(e);
    toast('Something went wrong making that: ' + e.message, 'bad', 5000);
  }
  b.done();
  render();
}

function renderWizardDone() {
  const r = wizardState.result;
  const kindWord = wizardState.kind === 'mob' ? 'mob' : wizardState.kind === 'block' ? 'block' : 'item';
  if (!r) { view = 'home'; wizardState = null; render(); return; }
  const box = el('div.bd-done', {}, [
    el('div.bd-done-icon', { text: kindWord === 'mob' ? '👾' : kindWord === 'block' ? '🟫' : '🎉' }),
    el('h2', { text: r.display + ' is ready!' }),
    el('div.bd-idprev', { text: r.id }),
    el('p', { style: { color: 'var(--dim)' }, text: 'It is real — open it in Files any time to see the JSON.' }),
    el('div.bd-done-actions', {}, [
      button('Paint it 🎨', { kind: 'primary', onClick: () => window.openTool('paint') }),
      button('Change its shape 🧱', { kind: 'primary', onClick: () => window.openTool('model') }),
      button('Play with it 🎮', { kind: 'good', onClick: () => window.openTool('test') })
    ]),
    button('Make another', { kind: 'ghost', onClick: () => { wizardState = null; view = 'home'; render(); } })
  ]);
  root.appendChild(box);
  if (!wizardState.celebrated) {
    wizardState.celebrated = true;
    award(kindWord === 'mob' ? 'first-mob' : kindWord === 'block' ? 'first-block' : 'first-item');
    say(`Nice! You made <b>${r.display}</b>. Want to give it a picture?`, {});
  }
}

// ============================================================= home view =====
const LANDING_CARDS = [
  { kind: 'mob', icon: '👾', label: 'Make a Mob', desc: 'A creature that walks, flies or swims.' },
  { kind: 'item', icon: '💎', label: 'Make an Item', desc: 'Something to hold or collect.' },
  { kind: 'food', icon: '🍎', label: 'Make Food', desc: 'Something to eat.' },
  { kind: 'weapontool', icon: '⚔️', label: 'Make a Weapon or Tool', desc: 'For fighting or digging.' },
  { kind: 'block', icon: '🟫', label: 'Make a Block', desc: 'Something to place in the world.' }
];

function renderHome() {
  const wrap = el('div.bd-home');
  wrap.appendChild(el('h1.bd-h1', { text: 'What do you want to make?' }));
  const cards = el('div.bd-cards');
  for (const c of LANDING_CARDS) {
    cards.appendChild(el('button.bd-card', { type: 'button', dataset: { hint: c.desc }, on: { click: () => startWizard(c.kind) } }, [
      el('span.bd-card-icon', { text: c.icon }), el('b', { text: c.label }), el('small', { text: c.desc })
    ]));
  }
  wrap.appendChild(cards);
  wrap.appendChild(renderThingsList());
  root.appendChild(wrap);
}

function tinyBtn(label, opts) { const b = button(label, opts); b.classList.add('tiny'); return b; }

function renderThingsList() {
  const things = getThings();
  const box = el('div.bd-things');
  box.appendChild(el('div.panel-title', { text: 'THINGS IN YOUR ADD-ON' }));
  if (!things.length) {
    box.appendChild(el('div.empty', {}, [el('span.big', { text: '🧰' }), el('h3', { text: 'Nothing yet' }), el('p', { text: 'Pick something above to make your first one!' })]));
    return box;
  }
  const list = el('div.bd-thing-list');
  for (const t of things) {
    list.appendChild(el('div.bd-thing-row', {}, [
      el('span.bd-thing-icon', { text: iconFor(t) }),
      el('div.bd-thing-info', {}, [el('b', { text: t.name }), el('small', { text: t.id })]),
      el('div.bd-thing-actions', {}, [
        tinyBtn('Edit', { icon: '✏️', kind: 'ghost', onClick: () => { view = 'browse'; browseState = { kind: t.kind, short: t.short }; render(); } }),
        tinyBtn('Rename', { icon: '🏷️', kind: 'ghost', onClick: () => doRename(t) }),
        tinyBtn('Duplicate', { icon: '📄', kind: 'ghost', onClick: () => doDuplicate(t) }),
        tinyBtn('Delete', { icon: '🗑️', kind: 'danger', onClick: () => doDelete(t) })
      ])
    ]));
  }
  box.appendChild(list);
  return box;
}

function doRename(t) {
  promptBox({
    title: 'Rename ' + t.name, label: 'New name', value: t.name, icon: '🏷️',
    validate: (v) => {
      const s = B.safeName(v);
      if (!s) return 'Type a name first.';
      if (s !== t.short && nameTaken(t.kind, s)) return 'You already have one called that.';
      return null;
    }
  }).then(v => {
    if (!v) return;
    const newShort = B.safeName(v);
    if (newShort === t.short) updateDisplayName(t.kind, t.id, v);
    else {
      renameThing(t.kind, t.short, newShort, v);
      if (browseState && browseState.kind === t.kind && browseState.short === t.short) browseState.short = newShort;
    }
    toast('Renamed!', 'good');
    render();
  });
}
function doDuplicate(t) {
  duplicateThing(t.kind, t.short);
  toast('Made a copy!', 'good');
  render();
}
async function doDelete(t) {
  const ok = await confirmBox({
    title: 'Delete ' + t.name + '?',
    body: 'This removes its picture, model, sounds and every file it uses. This cannot be undone.',
    ok: 'Delete for ever', danger: true, icon: '🗑️'
  });
  if (!ok) return;
  deleteThing(t.kind, t.short);
  if (browseState && browseState.kind === t.kind && browseState.short === t.short) browseState = null;
  toast('Deleted.', 'good');
  render();
}

// ========================================================== component browser
function numberRangeFor(v) {
  if (v <= 1) return [0, 1, 0.01];
  if (v <= 16) return [0, 16, 1];
  if (v <= 64) return [0, 64, 1];
  if (v <= 100) return [0, 100, 1];
  return [0, Math.ceil(v * 2), 1];
}
function simpleObjectFields(value) {
  const keys = Object.keys(value);
  if (keys.includes('value') && typeof value.value === 'number') {
    const out = [{ key: 'value', label: 'Amount', min: 0, max: Math.max(20, value.value * 3), step: value.value < 2 ? 0.01 : 1 }];
    if (keys.includes('max') && typeof value.max === 'number') out.push({ key: 'max', label: 'Max', min: 0, max: Math.max(20, value.max * 3), step: 1 });
    return out;
  }
  if (keys.includes('damage') && typeof value.damage === 'number') return [{ key: 'damage', label: 'Damage', min: 0, max: Math.max(20, value.damage * 3), step: 1 }];
  if (keys.includes('width') && keys.includes('height') && typeof value.width === 'number') return [
    { key: 'width', label: 'Width', min: 0.1, max: 4, step: 0.05 },
    { key: 'height', label: 'Height', min: 0.1, max: 4, step: 0.05 }
  ];
  if (keys.includes('seconds_to_destroy')) return [{ key: 'seconds_to_destroy', label: 'Seconds to break', min: 0, max: 60, step: 0.1 }];
  if (keys.includes('explosion_resistance')) return [{ key: 'explosion_resistance', label: 'Blast resistance', min: 0, max: 1000, step: 1 }];
  return null;
}

function buildValueEditor(container, value, onCommit, refreshWhole) {
  if (typeof value === 'boolean') {
    container.appendChild(toggle(value, (v) => onCommit(v)));
  } else if (typeof value === 'number') {
    const [min, max, step] = numberRangeFor(value);
    const label = el('span.slider-val', { text: String(value) });
    const input = el('input.range', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => { label.textContent = input.value; });
    input.addEventListener('change', () => onCommit(parseFloat(input.value)));
    container.append(input, label);
  } else if (typeof value === 'string') {
    const input = textField(value);
    input.addEventListener('change', () => onCommit(input.value));
    container.appendChild(input);
  } else if (value && typeof value === 'object') {
    if (settings.get('advanced')) {
      const ta = el('textarea.field.bd-comp-raw', { text: JSON.stringify(value, null, 2) });
      const saveBtn = tinyBtn('Save', {
        kind: 'good', onClick: () => {
          try { onCommit(JSON.parse(ta.value)); toast('Saved', 'good', 1200); }
          catch (e) { toast('That is not valid JSON — check the brackets and commas.', 'bad'); }
        }
      });
      container.append(ta, saveBtn);
    } else {
      const simple = simpleObjectFields(value);
      if (simple) {
        for (const f of simple) {
          const label = el('span.slider-val', { text: f.label + ': ' + value[f.key] });
          const input = el('input.range', { type: 'range', min: f.min, max: f.max, step: f.step, value: value[f.key] });
          input.addEventListener('input', () => { label.textContent = f.label + ': ' + input.value; });
          input.addEventListener('change', () => onCommit({ ...value, [f.key]: parseFloat(input.value) }));
          container.append(input, label);
        }
      } else {
        container.append(
          el('span', { style: { color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '.8em' }, text: JSON.stringify(value) }),
          tinyBtn('Show advanced editor', { kind: 'ghost', onClick: () => { settings.set('advanced', true); refreshWhole(); } })
        );
      }
    }
  } else {
    container.appendChild(el('span', { text: JSON.stringify(value) }));
  }
}

function renderCompRow(kind, path, j, comps, key, catKind, refreshWhole) {
  const cat = B.findComponent(key, catKind);
  const label = B.titleCase(key.replace('minecraft:', ''));
  const kid = cat ? cat.kid : 'A setting Minecraft uses for this.';
  const info = el('div.bd-comp-info', {}, [el('b', { text: label }), el('small', { text: kid })]);
  const editor = el('div.bd-comp-editor');
  buildValueEditor(editor, comps[key], (newVal) => { comps[key] = newVal; fs.writeJSON(path, j); }, refreshWhole);
  const removeBtn = tinyBtn('Remove', {
    icon: '🗑️', kind: 'danger', onClick: async () => {
      const ok = await confirmBox({ title: 'Remove this power?', body: `"${label}" will be turned off.`, ok: 'Remove', danger: true, icon: '🗑️' });
      if (!ok) return;
      delete comps[key];
      fs.writeJSON(path, j);
      refreshWhole();
    }
  });
  return el('div.bd-comp-row', {}, [info, editor, removeBtn]);
}

function addPower(kind, short, comp, refreshWhole) {
  const K = KIND[kind];
  const path = K.files(short).bp;
  const j = fs.readJSON(path); if (!j) return;
  const root2 = j[K.rootKey];
  root2.components = root2.components || {};
  root2.components[comp.id] = JSON.parse(JSON.stringify(comp.value));
  fs.writeJSON(path, j);
  toast('Added ' + B.titleCase(comp.id.replace('minecraft:', '')) + '!', 'good');
  refreshWhole();
}

function renderAddPower(kind, short, catKind, existingKeys, refreshWhole) {
  const box = el('div.bd-addpower');
  box.appendChild(el('div.panel-title', { text: '+ ADD A POWER' }));
  const search = textField('', { placeholder: 'Search powers…' });
  box.appendChild(el('div.bd-power-search', {}, [search]));
  const resultsBox = el('div');
  box.appendChild(resultsBox);
  function renderResults() {
    clear(resultsBox);
    const q = search.value.trim().toLowerCase();
    const avail = B.COMPONENTS.filter(c => (catKind === 'entity' ? !c.for : c.for === catKind) && !existingKeys.has(c.id));
    const filtered = q ? avail.filter(c => c.id.includes(q) || c.kid.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : avail;
    const groups = {};
    for (const c of filtered) (groups[c.group] = groups[c.group] || []).push(c);
    for (const g of Object.keys(groups).sort()) {
      const gBox = el('div.bd-power-group');
      gBox.appendChild(el('div.bd-power-group-title', { text: g }));
      for (const c of groups[g]) {
        gBox.appendChild(el('div.bd-power-item', {}, [
          el('div.grow', {}, [el('b', { text: B.titleCase(c.id.replace('minecraft:', '')) }), el('small', { style: { color: 'var(--dim)', display: 'block' }, text: c.kid })]),
          tinyBtn('+ Add', { kind: 'good', onClick: () => addPower(kind, short, c, refreshWhole) })
        ]));
      }
      resultsBox.appendChild(gBox);
    }
    if (!filtered.length) resultsBox.appendChild(el('div', { style: { color: 'var(--dim)', padding: '10px' }, text: 'No powers found.' }));
  }
  search.addEventListener('input', renderResults);
  renderResults();
  return box;
}

function renderBrowse() {
  const wrap = el('div.bd-browse');
  if (!browseState || !browseState.short) {
    wrap.appendChild(el('h1.bd-h1', { text: 'Pick something to work on' }));
    const things = getThings();
    if (!things.length) {
      wrap.appendChild(el('div.empty', {}, [el('span.big', { text: '🧰' }), el('h3', { text: 'Nothing yet' }), el('p', { text: 'Make a mob, item or block first.' }), button('Back to Build', { kind: 'good', onClick: () => { view = 'home'; render(); } })]));
    } else {
      const list = el('div.bd-thing-list');
      for (const t of things) {
        list.appendChild(el('div.bd-thing-row', { style: { cursor: 'pointer' }, on: { click: () => { browseState = { kind: t.kind, short: t.short }; render(); } } }, [
          el('span.bd-thing-icon', { text: iconFor(t) }), el('div.bd-thing-info', {}, [el('b', { text: t.name }), el('small', { text: t.id })])
        ]));
      }
      wrap.appendChild(list);
    }
    root.appendChild(wrap);
    return;
  }
  const kind = browseState.kind, short = browseState.short;
  const K = KIND[kind];
  const path = K.files(short).bp;
  const j = fs.readJSON(path);
  if (!j) {
    wrap.appendChild(el('div.empty', {}, [el('p', { text: 'That file is missing or broken. Try the Files tool to fix it, or make a new one.' }), button('← Back', { kind: 'ghost', onClick: () => { browseState = null; render(); } })]));
    root.appendChild(wrap);
    return;
  }
  const root2 = j[K.rootKey];
  const id = root2.description.identifier;
  const display = displayNameFor(kind, id, short);
  const catKind = kind === 'mob' ? 'entity' : kind;
  const comps = root2.components || (root2.components = {});

  wrap.appendChild(el('div.bd-browse-head', {}, [
    button('← Back', { kind: 'ghost', onClick: () => { browseState = null; render(); } }),
    el('span.bd-thing-icon', { text: iconFor({ kind, sub: subKindOf(comps) }) }),
    el('div', {}, [el('b', { text: display }), el('div.bd-idprev', { text: id })])
  ]));

  const compKeys = Object.keys(comps).sort();
  const list = el('div', {});
  for (const key of compKeys) list.appendChild(renderCompRow(kind, path, j, comps, key, catKind, render));
  wrap.appendChild(list);
  wrap.appendChild(renderAddPower(kind, short, catKind, new Set(compKeys), render));
  root.appendChild(wrap);
}

// ================================================================= render ====
function render() {
  if (!root) return;
  clear(root);
  root.classList.add('bd-root');
  if (view === 'wizard' && wizardState) {
    if (wizardState.done) renderWizardDone(); else renderWizardStep();
  } else if (view === 'browse') {
    renderBrowse();
  } else {
    view = 'home';
    renderHome();
  }
}

// =================================================================== module ==
function mount(rootEl) {
  root = rootEl;
  injectCSS();
  bus.on('project:open', () => { if (view !== 'wizard') render(); });
  bus.on('file:change', () => { if (view === 'home') render(); });
}
function show(args) {
  if (args && args.browse) { wizardState = null; view = 'browse'; browseState = args.browse; }
  else if (!wizardState) view = 'home';
  render();
  tour('build-intro', [
    { title: 'Welcome to Build!', text: 'This is where you make mobs, items and blocks. Pick a card and I will ask a few easy questions.' },
    { el: '.bd-cards', title: 'Pick something', text: 'Tap a card to start. You can cancel any time with the ✕.' },
    { el: '.bd-things', title: 'Everything you make', text: 'Shows up down here — you can edit, rename, copy or delete it any time.' }
  ], { tool: 'build' });
}
function hide() {}
function onFileChange() { if (view === 'home') render(); }

export default { id: 'build', title: 'Build', icon: '✨', mount, show, hide, onFileChange };

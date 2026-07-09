// Level editor: paint/erase land, drop empire bases, towers, villages and
// starting armies. Previews through the real state + territory pipeline so
// you see exactly the borders and claims the map will start with.
import { CFG } from './config.js';
import { key, unkey, disc, hexDist } from './hex.js';
import { makeState } from './state.js';
import { recalcTerritory } from './rules.js';
import { basesConnected } from './mapgen.js';
import { buildBoard, syncBuildings, syncArmies, fitCamera } from './render.js';
import { CustomMaps } from './save.js';
import { showModal, toast } from './ui.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const MAXR = 14;
const KINDS = [
  ['land', '🟩', 'Land'], ['erase', '🌊', 'Erase'],
  ['base', '🏰', 'Base'], ['wood', '🗼', 'Wood'], ['stone', '🏯', 'Stone'],
  ['mortar', '💥', 'Mortar'], ['village', '🏘️', 'Village'], ['army', '⚔️', 'Army'],
];

const ed = {
  active: false,
  tool: 'land',        // land | erase | base | wood | stone | mortar | village | army
  slot: 0,             // which empire colour pieces belong to (-1 = neutral, villages only)
  armyLvl: 1,
  brush: 0,            // disc radius for land/erase
  land: new Set(),
  bases: new Map(),    // slot -> key
  pieces: new Map(),   // key -> { slot, kind, level }
  name: '',
  id: null,
  dirty: false,
};
let H = null;          // {onExit, onTest}
let rebuildQueued = false;

export const editorActive = () => ed.active;
export const editorPainting = () => ed.active && (ed.tool === 'land' || ed.tool === 'erase');

export function openEditor(handlers, existing = null) {
  H = handlers;
  Object.assign(ed, { active: true, tool: 'land', slot: 0, armyLvl: 1, brush: 0 });
  if (existing) {
    ed.id = existing.id;
    ed.name = existing.name;
    ed.land = new Set(existing.land.map(([q, r]) => key(q, r)));
    ed.bases = new Map(existing.bases.map((b, i) => [i, key(b[0], b[1])]));
    // stored pieces reference empire idx == position in bases array == slot here
    ed.pieces = new Map((existing.pieces || []).map(([q, r, owner, kind, level]) =>
      [key(q, r), { slot: owner, kind, level: level || 1 }]));
  } else {
    ed.id = 'map-' + Date.now().toString(36);
    ed.name = '';
    ed.land = new Set(disc(0, 0, 5).map(([q, r]) => key(q, r)));
    ed.bases = new Map();
    ed.pieces = new Map();
  }
  ed.dirty = false;
  $('editor-ui').classList.remove('hidden');
  $('ed-name').value = ed.name;
  $('ed-name').oninput = () => { ed.name = $('ed-name').value; ed.dirty = true; };
  $('ed-back').onclick = () => { Sfx.tap(); exitEditor(); };
  $('ed-menu').onclick = () => { Sfx.tap(); edMenu(); };
  renderTools();
  rebuild(true);
}

export function closeEditorUI() {
  ed.active = false;
  $('editor-ui').classList.add('hidden');
}

function exitEditor() {
  if (ed.dirty) {
    showModal({
      title: 'Leave the editor?',
      body: '<p>Unsaved changes will be lost.</p>',
      buttons: [
        { label: 'Save & Leave', primary: true, onTap: () => { if (saveMap(true)) { closeEditorUI(); H.onExit(); } } },
        { label: 'Discard', danger: true, onTap: () => { closeEditorUI(); H.onExit(); } },
        { label: 'Stay' },
      ],
    });
  } else { closeEditorUI(); H.onExit(); }
}

// ---------- tools tray ----------
function renderTools() {
  const tray = $('ed-tools');
  tray.innerHTML = '';
  const mk = (html, on, onTap, title = '') => {
    const b = document.createElement('button');
    b.className = 'ed-tool' + (on ? ' on' : '');
    b.innerHTML = html;
    b.title = title;
    b.onclick = () => { Sfx.tap(); onTap(); };
    tray.appendChild(b);
    return b;
  };
  for (const [id, ico, label] of KINDS) {
    mk(`${ico} ${label}`, ed.tool === id, () => {
      ed.tool = id;
      if (ed.slot === -1 && id !== 'village' && id !== 'land' && id !== 'erase') ed.slot = 0;
      renderTools();
    });
  }
  if (ed.tool === 'army') {
    mk('−', false, () => { ed.armyLvl = Math.max(1, ed.armyLvl - 1); renderTools(); });
    mk(`Lv ${ed.armyLvl}`, true, () => {});
    mk('+', false, () => { ed.armyLvl = Math.min(CFG.armyMax, ed.armyLvl + 1); renderTools(); });
  }
  if (ed.tool === 'land' || ed.tool === 'erase') {
    mk(ed.brush === 0 ? '🖌 1' : '🖌 7', false, () => { ed.brush = ed.brush === 0 ? 1 : 0; renderTools(); },
      'brush size');
  }
  // empire colour picker for piece tools
  if (!['land', 'erase'].includes(ed.tool)) {
    const row = document.createElement('div');
    row.style.cssText = 'flex-basis:100%;display:flex;gap:7px;justify-content:center;padding-top:2px';
    for (let i = 0; i < CFG.maxEmpires; i++) {
      const b = document.createElement('button');
      b.className = 'ed-tool' + (ed.slot === i ? ' on' : '');
      b.style.padding = '7px 10px';
      b.innerHTML = `<span class="dot" style="background:${CFG.colors[i].css}"></span>${ed.bases.has(i) ? '🏰' : ''}`;
      b.title = i === 0 ? 'Player' : 'Rival ' + i;
      b.onclick = () => { Sfx.tap(); ed.slot = i; renderTools(); };
      row.appendChild(b);
    }
    if (ed.tool === 'village') {
      const n = document.createElement('button');
      n.className = 'ed-tool' + (ed.slot === -1 ? ' on' : '');
      n.style.padding = '7px 10px';
      n.innerHTML = `<span class="dot" style="background:#8b9779"></span>free`;
      n.title = 'Neutral village — belongs to whoever claims the hex';
      n.onclick = () => { Sfx.tap(); ed.slot = -1; renderTools(); };
      row.appendChild(n);
    }
    tray.appendChild(row);
  }
}

function edMenu() {
  showModal({
    title: '🛠️ Map actions',
    body: `<p>${ed.land.size} hexes · ${ed.bases.size} bases · ${ed.pieces.size} extra pieces</p>
      <p style="opacity:.75;font-size:13px">The ${CFG.colors[0].name} base is the player start. Each map needs 2+ bases connected by land. Towers, villages and armies are optional extras.</p>`,
    buttons: [
      { label: '▶ Test Play', primary: true, onTap: () => { const m = validate(); if (m) { saveMap(true); H.onTest(m); } } },
      { label: '💾 Save', onTap: () => saveMap() },
      { label: '📤 Export', onTap: exportJson },
      { label: '📥 Import', onTap: importJson },
      { label: 'Close' },
    ],
  });
}

// slot -> empire index (position in slot-sorted bases array)
function slotIndexMap() {
  const slots = [...ed.bases.keys()].sort((a, b) => a - b);
  const m = new Map(slots.map((s, i) => [s, i]));
  m.set(-1, -1);
  return m;
}

function validate(silent = false) {
  const baseArr = [...ed.bases.entries()].sort((a, b) => a[0] - b[0]);
  const bases = baseArr.map(([, k]) => unkey(k));
  const land = [...ed.land].map(unkey);
  const bad = (msg) => { if (!silent) { Sfx.error(); toast(msg); } return null; };
  if (land.length < 25) return bad('Paint more land — at least 25 hexes');
  if (bases.length < 2) return bad('Place at least 2 bases (player + a rival)');
  if (!ed.bases.has(0)) return bad(`Place the player base (${CFG.colors[0].name.toLowerCase()})`);
  for (const [, k] of ed.bases) if (!ed.land.has(k)) return bad('A base is standing in water');
  if (!basesConnected(land, bases)) return bad('All bases must connect by land');
  const s2i = slotIndexMap();
  const pieces = [];
  for (const [k, p] of ed.pieces) {
    if (!ed.land.has(k)) continue;                 // orphaned by erasing — drop
    if (p.slot !== -1 && !s2i.has(p.slot)) {
      return bad(`A ${p.kind} belongs to an empire with no base — give ${colorName(p.slot)} a base or remove it`);
    }
    const [q, r] = unkey(k);
    pieces.push([q, r, s2i.get(p.slot), p.kind, p.level || 1]);
  }
  return {
    id: ed.id, name: ed.name.trim() || 'Untitled Map',
    land, bases, pieces, created: Date.now(),
  };
}

const colorName = (slot) => slot < 0 ? 'neutral' : CFG.colors[slot].name;

function saveMap(silent = false) {
  const m = validate(silent);
  if (!m) return false;
  CustomMaps.save(m);
  ed.dirty = false;
  if (!silent) { Sfx.upgrade(); toast('Saved — find it under Skirmish ▸ Custom'); }
  return true;
}

function exportJson() {
  const m = validate();
  if (!m) return;
  const json = JSON.stringify(m);
  const card = showModal({
    title: '📤 Export map',
    body: `<p>Copy this anywhere safe:</p><textarea readonly></textarea>`,
    buttons: [{ label: 'Copy', primary: true, onTap: () => navigator.clipboard?.writeText(json).then(() => toast('Copied')) }, { label: 'Close' }],
  });
  card.querySelector('textarea').value = json;
}

function importJson() {
  const card = showModal({
    title: '📥 Import map',
    body: `<p>Paste a map JSON:</p><textarea></textarea>`,
    buttons: [{
      label: 'Import', primary: true, onTap: () => {
        try {
          const m = JSON.parse(card.querySelector('textarea').value);
          if (!Array.isArray(m.land) || !Array.isArray(m.bases)) throw 0;
          ed.land = new Set(m.land.map(([q, r]) => key(q, r)));
          ed.bases = new Map(m.bases.map((b, i) => [i, key(b[0], b[1])]));
          ed.pieces = new Map((m.pieces || []).map(([q, r, owner, kind, level]) =>
            [key(q, r), { slot: owner, kind, level: level || 1 }]));
          ed.name = m.name || 'Imported Map';
          $('ed-name').value = ed.name;
          ed.dirty = true;
          renderTools(); rebuild(true);
          toast('Imported');
        } catch { Sfx.error(); toast('That JSON did not look like a map'); }
      },
    }, { label: 'Cancel' }],
  });
}

// ---------- painting & placing ----------
export function editorPaintAt(q, r) {
  if (hexDist(0, 0, q, r) > MAXR + 2) return;
  let changed = false;
  const cells = ed.brush === 0 ? [[q, r]] : disc(q, r, 1);
  if (ed.tool === 'land') {
    for (const [cq, cr] of cells) {
      const k = key(cq, cr);
      if (hexDist(0, 0, cq, cr) <= MAXR && !ed.land.has(k)) { ed.land.add(k); changed = true; }
    }
  } else if (ed.tool === 'erase') {
    for (const [cq, cr] of cells) {
      const k = key(cq, cr);
      if (ed.land.delete(k)) {
        changed = true;
        ed.pieces.delete(k);
        for (const [slot, bk] of ed.bases) if (bk === k) ed.bases.delete(slot);
      }
    }
  }
  if (changed) { ed.dirty = true; rebuild(); }
}

export function editorTapAt(q, r) {
  const k = key(q, r);
  if (ed.tool === 'land' || ed.tool === 'erase') { editorPaintAt(q, r); return; }
  if (!ed.land.has(k)) { Sfx.error(); toast('Pieces need land under them'); return; }

  // clear anything already on the tile
  const hadBase = [...ed.bases.entries()].find(([, bk]) => bk === k);
  const hadPiece = ed.pieces.get(k);

  if (ed.tool === 'base') {
    if (hadBase && hadBase[0] === ed.slot) { ed.bases.delete(ed.slot); }   // toggle off
    else {
      if (hadBase) ed.bases.delete(hadBase[0]);
      ed.pieces.delete(k);
      ed.bases.set(ed.slot, k);      // one base per slot — moves if placed again
    }
  } else {
    const wanted = { slot: ed.slot, kind: ed.tool, level: ed.armyLvl };
    if (hadPiece && hadPiece.kind === wanted.kind && hadPiece.slot === wanted.slot &&
        (wanted.kind !== 'army' || hadPiece.level === wanted.level)) {
      ed.pieces.delete(k);           // toggle off
    } else {
      if (hadBase) ed.bases.delete(hadBase[0]);
      ed.pieces.set(k, wanted);
    }
  }
  ed.dirty = true;
  Sfx.build();
  renderTools();
  rebuild();
}

// ---------- preview via the real pipeline ----------
function rebuild(refit = false) {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    const land = [...ed.land].sort().map(unkey);
    const baseArr = [...ed.bases.entries()].sort((a, b) => a[0] - b[0]);
    const s2i = slotIndexMap();
    const pieces = [];
    for (const [k, p] of ed.pieces) {
      if (!ed.land.has(k)) continue;
      if (p.slot !== -1 && !s2i.has(p.slot)) continue;   // shown once its empire has a base
      const [q, r] = unkey(k);
      pieces.push([q, r, s2i.get(p.slot), p.kind, p.level || 1]);
    }
    const mapDef = {
      name: ed.name || 'Editor', land,
      bases: baseArr.map(([, k]) => unkey(k)),
      pieces, treeChance: 0.1,
    };
    const empires = baseArr.map(([slot]) => ({
      name: slot === 0 ? 'You' : 'Empire ' + (slot + 1),
      colorIdx: slot, isAI: slot !== 0,
    }));
    const st = makeState(mapDef, empires, 'editor-preview');
    recalcTerritory(st);
    ed.preview = st;
    buildBoard(st);
    syncBuildings(st);
    syncArmies(st);
    if (refit) fitCamera(1.2);
  });
}

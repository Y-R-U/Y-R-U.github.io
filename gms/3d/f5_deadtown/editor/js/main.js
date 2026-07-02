// Deadtown Level Editor — full authoring tool over the same SQLite DB the game
// plays from. Select/move/rotate/scale/duplicate/delete objects, place typed
// hotspots (exit/dialog/item/note/trigger) with dialog + exit-target editing,
// zombie spawn zones, pickups and the player start; edit bounds/env/roads/
// ambient; edit the mission chain; undo/redo (100 deep); named level versions
// with restore; validation; publish-to-snapshot; save + play. All popups are
// custom modals — never alert().

import * as THREE from 'three';
import { initAssets } from '../../js/assets.js';
import { api } from './api.js';
import { createEditorScene } from './scene.js';
import { CATALOG, MARKERS, PICKUPS, WEAPON_IDS, AMMO_IDS, ZOMBIE_TYPES, HOTSPOT_TYPES, ENV_PRESETS, FLOORS } from './catalog.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const uid = (p) => `${p}_${Date.now().toString(36)}${(Math.random() * 1296 | 0).toString(36)}`;
const deg = (r) => Math.round((r || 0) * 180 / Math.PI);
const rad = (d) => (d || 0) * Math.PI / 180;

// ── toasts + modal ───────────────────────────────────────────────────────────
function toast(msg, err = false) {
  const t = el('div', 'toast' + (err ? ' err' : ''), msg);
  $('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, err ? 4200 : 2200);
}
function modal(title, body, buttons) {
  const wrap = $('modal-wrap'), m = $('modal');
  m.innerHTML = '';
  m.appendChild(el('h3', null, title));
  m.appendChild(body);
  const bs = el('div', 'm-btns');
  return new Promise(resolve => {
    for (const b of buttons) {
      const btn = el('button', b.cls || '', b.label);
      btn.onclick = () => { if (b.keep !== true) wrap.classList.add('hidden'); resolve(b.value); };
      bs.appendChild(btn);
    }
    m.appendChild(bs);
    wrap.classList.remove('hidden');
  });
}
const confirmBox = (title, text, okLabel = 'OK') => {
  const b = el('div'); b.appendChild(el('p', null, text));
  return modal(title, b, [{ label: 'Cancel', value: false }, { label: okLabel, value: true, cls: 'danger' }]);
};

// ── state ────────────────────────────────────────────────────────────────────
let doc = null;               // current level document (source of truth)
let levels = [];              // [{id,name}]
let dirty = false;
let undoStack = [], redoStack = [];
let sel = null;               // { kind, uid }
let placing = null;           // armed palette item
let snapOn = true, dragSnapped = false;
let scene = null;
const targetCache = new Map();   // level id -> doc (for exit-target hotspot lists)

const snap = (v) => snapOn ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100;
function markDirty(on = true) { dirty = on; $('dirty-dot').classList.toggle('on', on); refreshStatus(); }
function refreshStatus() {
  $('status-level').textContent = doc ? `${doc.name} (${doc.id}) · ${doc.kind} · ${doc.bounds.hx}×${doc.bounds.hz}m` : '';
  $('status-msg').textContent = placing ? `placing: ${placing.name} (Esc to stop)` : (sel ? `selected: ${sel.kind} ${sel.uid}` : 'drag = move · shift-drag/RMB = pan · wheel = zoom · P = 3D');
}

// entity lookup within doc
function listOf(kind) {
  return kind === 'object' ? doc.objects : kind === 'pickup' ? doc.pickups
    : kind === 'hotspot' ? doc.hotspots : kind === 'spawn' ? doc.spawns : null;
}
function entity(kind, id) {
  if (kind === 'start') return doc.playerStart;
  return (listOf(kind) || []).find(e => e.uid === id);
}

// ── history ──────────────────────────────────────────────────────────────────
function snapshot() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) { toast('Nothing to undo'); return; }
  redoStack.push(JSON.stringify(doc));
  doc = JSON.parse(undoStack.pop());
  scene.loadDoc(doc);
  select(null, null);
  markDirty();
  toast('↩ undid');
}
function redo() {
  if (!redoStack.length) { toast('Nothing to redo'); return; }
  undoStack.push(JSON.stringify(doc));
  doc = JSON.parse(redoStack.pop());
  scene.loadDoc(doc);
  select(null, null);
  markDirty();
  toast('↪ redid');
}
// standard mutation: snapshot → change → refresh
function mutate(fn, { refresh = null, rebuild = false, inspect = true } = {}) {
  snapshot();
  fn(doc);
  markDirty();
  if (rebuild) scene.loadDoc(doc);
  else if (refresh) scene.refresh(refresh[0], refresh[1]);
  if (inspect) renderInspector();
}

// ── selection + inspector ────────────────────────────────────────────────────
function select(kind, id) {
  sel = id == null && kind !== 'start' ? null : { kind, uid: kind === 'start' ? 'start' : id };
  scene.select(sel?.kind, sel?.uid);
  renderInspector();
  refreshStatus();
}

function row(label, input) {
  const r = el('div', 'f-row');
  r.appendChild(el('label', null, label));
  r.appendChild(input);
  return r;
}
function num(label, get, set, step = 0.5) {
  const i = el('input'); i.type = 'number'; i.step = step; i.value = get() ?? 0;
  i.addEventListener('change', () => set(parseFloat(i.value) || 0));
  return row(label, i);
}
function text(label, get, set) {
  const i = el('input'); i.type = 'text'; i.value = get() || '';
  i.addEventListener('change', () => set(i.value));
  return row(label, i);
}
function area(label, get, set) {
  const r = el('div', 'f-row wide');
  r.appendChild(el('label', null, label));
  const i = el('textarea'); i.value = get() || '';
  i.addEventListener('change', () => set(i.value));
  r.appendChild(i);
  return r;
}
function check(label, get, set) {
  const i = el('input'); i.type = 'checkbox'; i.checked = !!get();
  i.addEventListener('change', () => set(i.checked));
  return row(label, i);
}
function sel_(label, options, get, set) {
  const s = el('select');
  for (const o of options) {
    const op = el('option', null, o.label ?? o);
    op.value = o.value ?? o;
    s.appendChild(op);
  }
  s.value = get() ?? options[0]?.value ?? options[0];
  s.addEventListener('change', () => set(s.value));
  return row(label, s);
}

function renderInspector() {
  const box = $('inspector');
  box.innerHTML = '';
  if (!doc) return;
  if (!sel) {
    box.appendChild(el('div', 'f-empty', 'Nothing selected.\nClick an entity, or pick something from the palette to place.'));
    return;
  }
  const e = entity(sel.kind, sel.uid);
  if (!e) { box.appendChild(el('div', 'f-empty', 'Selection is gone.')); return; }
  const K = sel.kind, U = sel.uid;
  const R = (opts = {}) => ({ refresh: [K, U], ...opts });
  const M = (fn, opts) => mutate(fn, R(opts));

  if (K === 'object') {
    box.appendChild(el('div', 'f-title', `object · ${e.model}`));
    box.appendChild(text('label', () => e.label, v => M(() => { e.label = v || undefined; })));
    box.appendChild(num('x', () => e.x, v => M(() => { e.x = v; })));
    box.appendChild(num('z', () => e.z, v => M(() => { e.z = v; })));
    box.appendChild(num('y (lift)', () => e.y || 0, v => M(() => { e.y = v || undefined; }), 0.1));
    box.appendChild(num('rot °', () => deg(e.rot), v => M(() => { e.rot = rad(v); }), 5));
    box.appendChild(num('scale', () => e.scale || 1, v => M(() => { e.scale = v || 1; }), 0.05));
    box.appendChild(el('div', 'f-sub', 'collision'));
    box.appendChild(sel_('type', ['none', 'circle', 'box'], () => e.collide?.type || 'none', v => M(() => {
      e.collide = v === 'none' ? { type: 'none' } : v === 'circle' ? { type: 'circle', r: e.collide?.r || 1 } : { type: 'box', hx: e.collide?.hx || 2, hz: e.collide?.hz || 2 };
    })));
    if (e.collide?.type === 'circle') box.appendChild(num('radius', () => e.collide.r, v => M(() => { e.collide.r = v; }), 0.1));
    if (e.collide?.type === 'box') {
      box.appendChild(num('half x', () => e.collide.hx, v => M(() => { e.collide.hx = v; }), 0.5));
      box.appendChild(num('half z', () => e.collide.hz, v => M(() => { e.collide.hz = v; }), 0.5));
      box.appendChild(el('div', 'mini', 'labelled boxes appear on the minimap'));
    }
  } else if (K === 'pickup') {
    box.appendChild(el('div', 'f-title', `pickup · ${e.kind}`));
    box.appendChild(sel_('kind', ['weapon', 'ammo', 'medkit'], () => e.kind, v => M(() => {
      e.kind = v;
      if (v === 'weapon' && !e.item) e.item = 'pistol';
      if (v === 'ammo') { e.ammo = e.ammo || '9mm'; e.n = e.n || 24; }
    })));
    if (e.kind === 'weapon') box.appendChild(sel_('weapon', WEAPON_IDS, () => e.item, v => M(() => { e.item = v; })));
    if (e.kind === 'ammo') {
      box.appendChild(sel_('ammo', AMMO_IDS, () => e.ammo, v => M(() => { e.ammo = v; })));
      box.appendChild(num('rounds', () => e.n, v => M(() => { e.n = Math.round(v); }), 1));
    }
    box.appendChild(num('x', () => e.x, v => M(() => { e.x = v; })));
    box.appendChild(num('z', () => e.z, v => M(() => { e.z = v; })));
  } else if (K === 'hotspot') {
    box.appendChild(el('div', 'f-title', `hotspot · ${e.type}`));
    box.appendChild(sel_('type', HOTSPOT_TYPES, () => e.type, v => M(() => { e.type = v; defaultsForType(e); })));
    box.appendChild(text('label', () => e.label, v => M(() => { e.label = v; })));
    box.appendChild(num('x', () => e.x, v => M(() => { e.x = v; })));
    box.appendChild(num('z', () => e.z, v => M(() => { e.z = v; })));
    box.appendChild(num('radius', () => e.r, v => M(() => { e.r = v; }), 0.2));
    box.appendChild(check('once only', () => e.once, v => M(() => { e.once = v || undefined; })));
    box.appendChild(text('sets flag', () => e.sets, v => M(() => { e.sets = v || undefined; })));
    box.appendChild(text('requires flag', () => e.requires, v => M(() => { e.requires = v || undefined; })));

    if (e.type === 'exit') {
      box.appendChild(el('div', 'f-sub', 'exit target'));
      const lvlRow = sel_('level', levels.map(l => ({ value: l.id, label: `${l.name} (${l.id})` })), () => e.target?.level, v => M(() => { e.target = { level: v, hotspot: e.target?.hotspot || '' }; renderTargetHotspots(); }, { inspect: false }));
      box.appendChild(lvlRow);
      const hsRow = row('hotspot', el('select'));
      box.appendChild(hsRow);
      const hsSel = hsRow.querySelector('select');
      async function renderTargetHotspots() {
        hsSel.innerHTML = '';
        const tid = e.target?.level;
        if (!tid) return;
        let tdoc = tid === doc.id ? doc : targetCache.get(tid);
        if (!tdoc) { try { tdoc = (await api.level(tid)).data; targetCache.set(tid, tdoc); } catch { return; } }
        for (const h of (tdoc.hotspots || []).filter(h => h.type === 'exit')) {
          const op = el('option', null, `${h.uid}${h.label ? ' · ' + h.label : ''}`);
          op.value = h.uid;
          hsSel.appendChild(op);
        }
        if (e.target?.hotspot) hsSel.value = e.target.hotspot;
      }
      hsSel.addEventListener('change', () => M(() => { e.target.hotspot = hsSel.value; }, { inspect: false }));
      renderTargetHotspots();
      box.appendChild(area('locked msg', () => e.lockedMsg, v => M(() => { e.lockedMsg = v || undefined; })));
      box.appendChild(el('div', 'mini', 'arriving players spawn at the target hotspot, nudged inward. The barrier ring opens a gap around exits near the edge.'));
    } else if (e.type === 'dialog') {
      box.appendChild(el('div', 'f-sub', 'dialog lines'));
      const wrap = el('div');
      (e.lines || []).forEach((L, i) => {
        const r = el('div', 'line-row');
        const who = el('input', 'who'); who.type = 'text'; who.placeholder = 'speaker'; who.value = L.speaker || '';
        who.addEventListener('change', () => M(() => { L.speaker = who.value; }, { inspect: false }));
        const txt = el('textarea'); txt.placeholder = 'line…'; txt.value = L.text || '';
        txt.addEventListener('change', () => M(() => { L.text = txt.value; }, { inspect: false }));
        const del = el('button', null, '✕');
        del.onclick = () => M(() => e.lines.splice(i, 1));
        const up = el('button', null, '↑');
        up.onclick = () => { if (i > 0) M(() => { const t = e.lines[i - 1]; e.lines[i - 1] = e.lines[i]; e.lines[i] = t; }); };
        r.append(who, txt, up, del);
        wrap.appendChild(r);
      });
      box.appendChild(wrap);
      const add = el('button', null, '+ line');
      add.onclick = () => M(() => { e.lines = e.lines || []; e.lines.push({ speaker: '', text: '' }); });
      box.appendChild(add);
    } else if (e.type === 'item') {
      box.appendChild(area('found text', () => e.text, v => M(() => { e.text = v; })));
      box.appendChild(el('div', 'f-sub', 'gives'));
      (e.gives || []).forEach((gv, i) => {
        const r = el('div', 'line-row');
        const kind = el('select');
        for (const k of ['weapon', 'ammo', 'medkit']) { const o = el('option', null, k); o.value = k; kind.appendChild(o); }
        kind.value = gv.kind;
        kind.addEventListener('change', () => M(() => { gv.kind = kind.value; if (gv.kind === 'weapon' && !gv.item) gv.item = 'pistol'; if (gv.kind === 'ammo' && !gv.ammo) { gv.ammo = '9mm'; gv.n = 30; } }));
        r.appendChild(kind);
        if (gv.kind === 'weapon') {
          const w = el('select');
          for (const k of WEAPON_IDS) { const o = el('option', null, k); o.value = k; w.appendChild(o); }
          w.value = gv.item || 'pistol';
          w.addEventListener('change', () => M(() => { gv.item = w.value; }, { inspect: false }));
          r.appendChild(w);
        } else if (gv.kind === 'ammo') {
          const a = el('select');
          for (const k of AMMO_IDS) { const o = el('option', null, k); o.value = k; a.appendChild(o); }
          a.value = gv.ammo || '9mm';
          a.addEventListener('change', () => M(() => { gv.ammo = a.value; }, { inspect: false }));
          const n = el('input'); n.type = 'number'; n.value = gv.n || 30; n.style.width = '64px';
          n.addEventListener('change', () => M(() => { gv.n = parseInt(n.value) || 0; }, { inspect: false }));
          r.append(a, n);
        } else {
          const n = el('input'); n.type = 'number'; n.value = gv.n || 1; n.style.width = '64px';
          n.addEventListener('change', () => M(() => { gv.n = parseInt(n.value) || 1; }, { inspect: false }));
          r.appendChild(n);
        }
        const del = el('button', null, '✕');
        del.onclick = () => M(() => e.gives.splice(i, 1));
        r.appendChild(del);
        box.appendChild(r);
      });
      const add = el('button', null, '+ give');
      add.onclick = () => M(() => { e.gives = e.gives || []; e.gives.push({ kind: 'ammo', ammo: '9mm', n: 30 }); });
      box.appendChild(add);
      box.appendChild(el('div', 'mini', 'tip: found weapons should come with LOTS of ammo'));
    } else if (e.type === 'note') {
      box.appendChild(area('note text', () => e.text, v => M(() => { e.text = v; })));
    } else if (e.type === 'trigger') {
      box.appendChild(el('div', 'f-sub', 'trigger (fires on enter — invisible in game)'));
      box.appendChild(sel_('event', ['wave'], () => e.event || 'wave', v => M(() => { e.event = v; })));
      const P = e.params = e.params || { count: 4, types: ['walker'], r: 16 };
      box.appendChild(num('count', () => P.count, v => M(() => { P.count = Math.round(v); }), 1));
      box.appendChild(num('spawn ring r', () => P.r, v => M(() => { P.r = v; }), 1));
      box.appendChild(typesPicker(P));
    }
  } else if (K === 'spawn') {
    box.appendChild(el('div', 'f-title', 'zombie spawn zone'));
    box.appendChild(num('x', () => e.x, v => M(() => { e.x = v; })));
    box.appendChild(num('z', () => e.z, v => M(() => { e.z = v; })));
    box.appendChild(num('radius', () => e.r, v => M(() => { e.r = v; }), 0.5));
    box.appendChild(num('count', () => e.count, v => M(() => { e.count = Math.round(v); }), 1));
    box.appendChild(num('max alive', () => e.maxAlive, v => M(() => { e.maxAlive = Math.round(v); }), 1));
    box.appendChild(check('respawn', () => e.respawn, v => M(() => { e.respawn = v; })));
    box.appendChild(num('rate (s)', () => e.rate, v => M(() => { e.rate = v; }), 0.5));
    box.appendChild(el('div', 'f-sub', 'types'));
    box.appendChild(typesPicker(e));
  } else if (K === 'start') {
    box.appendChild(el('div', 'f-title', 'player start'));
    box.appendChild(num('x', () => e.x, v => M(() => { e.x = v; })));
    box.appendChild(num('z', () => e.z, v => M(() => { e.z = v; })));
    box.appendChild(num('yaw °', () => deg(e.yaw), v => M(() => { e.yaw = rad(v); }), 15));
  }

  if (K !== 'start') {
    const btns = el('div', 'f-btns');
    const dup = el('button', null, '⧉ duplicate (⌘D)');
    dup.onclick = duplicateSel;
    const del = el('button', 'danger', '🗑 delete (⌫)');
    del.onclick = deleteSel;
    btns.append(dup, del);
    box.appendChild(btns);
  }

  function typesPicker(holder) {
    const wrap = el('div');
    for (const t of ZOMBIE_TYPES) {
      const r = el('div', 'f-row');
      const c = el('input'); c.type = 'checkbox';
      c.checked = (holder.types || []).includes(t);
      c.addEventListener('change', () => M(() => {
        holder.types = holder.types || [];
        if (c.checked) holder.types.push(t);
        else holder.types = holder.types.filter(x => x !== t);
        if (!holder.types.length) holder.types = ['walker'];
      }, { inspect: false }));
      r.appendChild(el('label', null, t));
      r.appendChild(c);
      wrap.appendChild(r);
    }
    return wrap;
  }
}

function defaultsForType(h) {
  if (h.type === 'exit' && !h.target) { h.target = { level: doc.id, hotspot: '' }; h.r = h.r || 2.4; }
  if (h.type === 'dialog' && !h.lines) { h.lines = [{ speaker: '', text: '' }]; h.once = true; }
  if (h.type === 'item' && !h.gives) { h.gives = []; h.text = h.text || ''; h.once = true; }
  if (h.type === 'trigger' && !h.params) { h.params = { count: 4, types: ['walker'], r: 16 }; h.once = true; }
}

function duplicateSel() {
  if (!sel || sel.kind === 'start') return;
  const e = entity(sel.kind, sel.uid);
  if (!e) return;
  const copy = JSON.parse(JSON.stringify(e));
  copy.uid = uid(sel.kind[0]);
  copy.x = (copy.x || 0) + 2; copy.z = (copy.z || 0) + 2;
  mutate(d => listOf(sel.kind).push(copy), { refresh: [sel.kind, copy.uid] });
  select(sel.kind, copy.uid);
}
function deleteSel() {
  if (!sel || sel.kind === 'start') return;
  const k = sel.kind, u = sel.uid;
  mutate(d => {
    const arr = listOf(k);
    const i = arr.findIndex(e => e.uid === u);
    if (i >= 0) arr.splice(i, 1);
  }, { refresh: [k, u] });
  select(null, null);
}

// ── level settings pane ──────────────────────────────────────────────────────
function renderLevelPane() {
  const box = $('levelpane');
  box.innerHTML = '';
  if (!doc) return;
  const RB = { rebuild: true, inspect: false };
  const M = (fn) => { mutate(fn, RB); renderLevelPane(); };
  box.appendChild(el('div', 'f-title', 'level'));
  box.appendChild(text('name', () => doc.name, v => M(() => { doc.name = v; })));
  box.appendChild(sel_('kind', ['outdoor', 'interior'], () => doc.kind, v => M(() => { doc.kind = v; doc.env.preset = v === 'interior' ? 'interior' : 'dusk'; doc.env.floor = v === 'interior' ? 'wood' : 'street'; })));
  box.appendChild(el('div', 'f-sub', 'bounds (sealed barrier)'));
  box.appendChild(num('half x', () => doc.bounds.hx, v => M(() => { doc.bounds.hx = Math.max(6, v); }), 1));
  box.appendChild(num('half z', () => doc.bounds.hz, v => M(() => { doc.bounds.hz = Math.max(6, v); }), 1));
  box.appendChild(el('div', 'mini', 'players can ONLY leave through exit hotspots — the ring opens gaps at exits near the edge'));
  box.appendChild(el('div', 'f-sub', 'environment'));
  box.appendChild(sel_('preset', ENV_PRESETS, () => doc.env.preset, v => M(() => { doc.env.preset = v; })));
  box.appendChild(sel_('floor', FLOORS, () => doc.env.floor, v => M(() => { doc.env.floor = v; })));
  box.appendChild(text('floor tint', () => doc.env.floorColor, v => M(() => { doc.env.floorColor = v || null; })));
  box.appendChild(check('day cycle', () => doc.env.dayCycle, v => M(() => { doc.env.dayCycle = v; })));
  if (doc.kind === 'interior') box.appendChild(num('wall h', () => doc.env.wallH || 0.55, v => M(() => { doc.env.wallH = v; }), 0.05));

  if (doc.kind === 'outdoor') {
    box.appendChild(el('div', 'f-sub', 'roads'));
    const R = doc.roads = doc.roads || { vert: [], horiz: [], half: 4.6, sidewalk: 1.8 };
    const list = (label, key) => text(label, () => (R[key] || []).join(', '), v => M(() => {
      R[key] = v.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    }));
    box.appendChild(list('N–S at x', 'vert'));
    box.appendChild(list('E–W at z', 'horiz'));
    box.appendChild(num('half width', () => R.half, v => M(() => { R.half = v; }), 0.2));
    box.appendChild(num('sidewalk', () => R.sidewalk, v => M(() => { R.sidewalk = v; }), 0.2));
  }

  box.appendChild(el('div', 'f-sub', 'ambient horde'));
  const hasAmb = !!doc.ambient;
  box.appendChild(check('enabled', () => hasAmb, v => M(() => { doc.ambient = v ? { maxAlive: 10, types: ['walker', 'woman'], rate: 6, growth: true } : null; })));
  if (doc.ambient) {
    const A = doc.ambient;
    box.appendChild(num('max alive', () => A.maxAlive, v => M(() => { A.maxAlive = Math.round(v); }), 1));
    box.appendChild(num('rate (s)', () => A.rate, v => M(() => { A.rate = v; }), 0.5));
    box.appendChild(check('grows w/ kills', () => A.growth, v => M(() => { A.growth = v; })));
    box.appendChild(text('types', () => (A.types || []).join(', '), v => M(() => { A.types = v.split(',').map(s => s.trim()).filter(s => ZOMBIE_TYPES.includes(s)); if (!A.types.length) A.types = ['walker']; })));
  }
}

// ── palette ──────────────────────────────────────────────────────────────────
function buildPalette() {
  const body = $('pal-body');
  body.innerHTML = '';
  const item = (icon, name, arm) => {
    const b = el('button', 'pal-item');
    b.append(el('span', 'ic', icon), el('span', null, name));
    b.onclick = () => armPlacement({ ...arm, name, button: b });
    body.appendChild(b);
    return b;
  };
  body.appendChild(el('div', 'pal-cat', '⭐ Markers'));
  for (const m of MARKERS) item(m.icon, m.name, m);
  body.appendChild(el('div', 'pal-cat', '🎁 Pickups'));
  for (const p of PICKUPS) item(p.icon, p.name, p);
  for (const cat of CATALOG) {
    body.appendChild(el('div', 'pal-cat', cat.cat));
    for (const it of cat.items) item('▫️', it.name, { kind: 'object', item: it });
  }
}
function armPlacement(p) {
  document.querySelectorAll('.pal-item.armed').forEach(b => b.classList.remove('armed'));
  if (placing?.name === p.name) { placing = null; scene.setGhost(false); $('place-hint').classList.add('hidden'); refreshStatus(); return; }
  placing = p;
  p.button?.classList.add('armed');
  const r = p.kind === 'spawn' ? 6 : p.kind === 'hotspot' ? 2.4 : p.kind === 'object' && p.item.collide?.type === 'box' ? Math.hypot(p.item.collide.hx, p.item.collide.hz) : 1.2;
  scene.setGhost(true, r);
  $('place-hint').textContent = `Click to place: ${p.name} — Esc to stop`;
  $('place-hint').classList.remove('hidden');
  refreshStatus();
}
function disarm() {
  placing = null;
  document.querySelectorAll('.pal-item.armed').forEach(b => b.classList.remove('armed'));
  scene.setGhost(false);
  $('place-hint').classList.add('hidden');
  refreshStatus();
}

function placeAt(x, z) {
  const p = placing;
  if (!p) return;
  if (p.kind === 'start') {
    mutate(d => { d.playerStart = { ...(d.playerStart || { yaw: 0 }), x, z }; }, { refresh: ['start', 'start'] });
    select('start', 'start');
    disarm();
    return;
  }
  let ent = null;
  if (p.kind === 'object') {
    ent = { uid: uid('o'), model: p.item.model, x, z, rot: 0, scale: 1, collide: JSON.parse(JSON.stringify(p.item.collide || { type: 'none' })) };
    if (p.item.y) ent.y = p.item.y;
  } else if (p.kind === 'pickup') {
    ent = { uid: uid('p'), kind: p.pkind, x, z };
    if (p.pkind === 'weapon') ent.item = 'pistol';
    if (p.pkind === 'ammo') { ent.ammo = '9mm'; ent.n = 24; }
  } else if (p.kind === 'hotspot') {
    ent = { uid: uid('h'), type: p.type, x, z, r: p.type === 'trigger' ? 4 : 2.4, label: '' };
    defaultsForType(ent);
  } else if (p.kind === 'spawn') {
    ent = { uid: uid('s'), x, z, r: 6, types: ['walker'], count: 4, maxAlive: 5, respawn: true, rate: 6 };
  }
  if (!ent) return;
  const arrKey = p.kind === 'object' ? 'objects' : p.kind === 'pickup' ? 'pickups' : p.kind === 'hotspot' ? 'hotspots' : 'spawns';
  mutate(d => { d[arrKey] = d[arrKey] || []; d[arrKey].push(ent); }, { refresh: [p.kind, ent.uid] });
  select(p.kind, ent.uid);
}

// ── level open/save/create ───────────────────────────────────────────────────
async function refreshLevelList(keep) {
  levels = await api.levels();
  const s = $('level-select');
  s.innerHTML = '';
  for (const l of levels) {
    const o = el('option', null, `${l.name} (${l.id})`);
    o.value = l.id;
    s.appendChild(o);
  }
  if (keep) s.value = keep;
}
async function openLevel(id) {
  if (dirty) {
    const go = await confirmBox('Unsaved changes', `"${doc.name}" has unsaved changes. Discard them and open ${id}?`, 'Discard & open');
    if (!go) { $('level-select').value = doc.id; return; }
  }
  const r = await api.level(id);
  doc = r.data;
  doc.id = doc.id || id;
  undoStack = []; redoStack = [];
  targetCache.clear();
  scene.loadDoc(doc);
  select(null, null);
  renderLevelPane();
  markDirty(false);
  $('level-select').value = id;
  history.replaceState(null, '', `?level=${id}`);
  toast(`📂 ${doc.name}`);
}
async function saveLevel(quiet = false) {
  if (!doc) return;
  try {
    await api.saveLevel(doc.id, doc.name, doc);
    markDirty(false);
    await refreshLevelList(doc.id);
    if (!quiet) toast('💾 saved');
  } catch (e) { toast('save failed: ' + e.message, true); }
}

function newLevelBody(init = {}) {
  const b = el('div');
  const idI = el('input'); idI.type = 'text'; idI.placeholder = 'e.g. mall'; idI.value = init.id || '';
  const nameI = el('input'); nameI.type = 'text'; nameI.placeholder = 'e.g. Northgate Mall'; nameI.value = init.name || '';
  const kindS = el('select');
  for (const k of ['outdoor', 'interior']) { const o = el('option', null, k); o.value = k; kindS.appendChild(o); }
  const hxI = el('input'); hxI.type = 'number'; hxI.value = init.hx || 40;
  const hzI = el('input'); hzI.type = 'number'; hzI.value = init.hz || 40;
  b.append(row('id', idI), row('name', nameI), row('kind', kindS), row('half x', hxI), row('half z', hzI));
  b._get = () => ({ id: idI.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'), name: nameI.value.trim(), kind: kindS.value, hx: parseFloat(hxI.value) || 40, hz: parseFloat(hzI.value) || 40 });
  return b;
}
function templateDoc({ id, name, kind, hx, hz }) {
  return {
    id, name, kind,
    bounds: { hx, hz },
    env: kind === 'interior'
      ? { preset: 'interior', floor: 'wood', floorColor: '#6e4f30', dayCycle: false, wallH: 0.55 }
      : { preset: 'dusk', floor: 'street', floorColor: null, dayCycle: true },
    roads: kind === 'outdoor' ? { vert: [0], horiz: [], half: 4.6, sidewalk: 1.8 } : null,
    playerStart: { x: 0, z: 0, yaw: 0 },
    objects: [], pickups: [], spawns: [], hotspots: [],
    ambient: null,
  };
}
async function newLevel() {
  const body = newLevelBody();
  const ok = await modal('New level', body, [{ label: 'Cancel', value: false }, { label: 'Create', value: true }]);
  if (!ok) return;
  const v = body._get();
  if (!v.id || !v.name) { toast('id and name required', true); return; }
  try {
    await api.createLevel(v.id, v.name, templateDoc(v));
    await refreshLevelList(v.id);
    dirty = false;
    await openLevel(v.id);
  } catch (e) { toast('create failed: ' + e.message, true); }
}
async function duplicateLevel() {
  if (!doc) return;
  const body = newLevelBody({ id: doc.id + '-copy', name: doc.name + ' copy', hx: doc.bounds.hx, hz: doc.bounds.hz });
  const ok = await modal('Duplicate level', body, [{ label: 'Cancel', value: false }, { label: 'Duplicate', value: true }]);
  if (!ok) return;
  const v = body._get();
  const copy = JSON.parse(JSON.stringify(doc));
  copy.id = v.id; copy.name = v.name;
  try {
    await api.createLevel(v.id, v.name, copy);
    await refreshLevelList(v.id);
    dirty = false;
    await openLevel(v.id);
  } catch (e) { toast('duplicate failed: ' + e.message, true); }
}
async function deleteLevel() {
  if (!doc) return;
  const go = await confirmBox('Delete level', `Really delete "${doc.name}" (${doc.id}) and all its versions? Exits in other levels that point here will dangle.`, 'Delete forever');
  if (!go) return;
  await api.deleteLevel(doc.id);
  await refreshLevelList();
  dirty = false;
  if (levels.length) await openLevel(levels[0].id);
  toast('🗑 deleted');
}

// ── versions ─────────────────────────────────────────────────────────────────
async function versionsModal() {
  if (!doc) return;
  const body = el('div');
  const nameI = el('input'); nameI.type = 'text'; nameI.placeholder = 'version name (e.g. "before boss arena")';
  const saveB = el('button', null, '📌 Save current as version');
  const listW = el('div'); listW.style.marginTop = '12px';
  body.append(row('name', nameI), saveB, listW);
  async function renderList() {
    listW.innerHTML = '';
    const vs = await api.versions(doc.id);
    if (!vs.length) { listW.appendChild(el('div', 'mini', 'No versions yet. Save one before risky edits.')); return; }
    const table = el('table');
    for (const v of vs) {
      const tr = el('tr');
      tr.appendChild(el('td', 'vrow-name', v.name));
      tr.appendChild(el('td', 'mini', new Date(v.created_at).toLocaleString()));
      const td = el('td');
      const rb = el('button', null, '⟲ restore');
      rb.onclick = async () => {
        const go = await confirmBox('Restore version', `Replace the current "${doc.name}" with version "${v.name}"? The current state is auto-snapshotted first.`, 'Restore');
        if (!go) return;
        await api.restore(doc.id, v.vid);
        dirty = false;
        await openLevel(doc.id);
        $('modal-wrap').classList.add('hidden');
        toast(`⟲ restored "${v.name}"`);
      };
      const db = el('button', 'danger', '✕');
      db.onclick = async () => { await api.deleteVersion(v.vid); renderList(); };
      td.append(rb, document.createTextNode(' '), db);
      tr.appendChild(td);
      table.appendChild(tr);
    }
    listW.appendChild(table);
  }
  saveB.onclick = async () => {
    if (dirty) await saveLevel(true);
    await api.saveVersion(doc.id, nameI.value.trim() || `snapshot ${new Date().toLocaleString()}`);
    nameI.value = '';
    renderList();
    toast('📌 version saved');
  };
  renderList();
  await modal(`Versions — ${doc.name}`, body, [{ label: 'Close', value: true }]);
}

// ── missions editor ──────────────────────────────────────────────────────────
async function missionsModal() {
  let cfg = (await api.getConfig('game')) || { startLevel: doc?.id, title: 'DEADTOWN', subtitle: '', missions: [] };
  const body = el('div');
  const meta = el('div');
  meta.appendChild(text('title', () => cfg.title, v => { cfg.title = v; }));
  meta.appendChild(text('subtitle', () => cfg.subtitle, v => { cfg.subtitle = v; }));
  meta.appendChild(sel_('start level', levels.map(l => ({ value: l.id, label: l.name })), () => cfg.startLevel, v => { cfg.startLevel = v; }));
  const listW = el('div'); listW.style.marginTop = '10px';
  body.append(meta, listW);
  const TYPES = ['flag', 'weapon', 'kills', 'level'];
  function render() {
    listW.innerHTML = '';
    cfg.missions.forEach((m, i) => {
      const r = el('div', 'mission-row');
      const head = el('div', 'mission-head');
      head.appendChild(el('span', null, `#${i + 1} · ${m.id || ''}`));
      const hb = el('span');
      const up = el('button', null, '↑'); up.onclick = () => { if (i > 0) { const t = cfg.missions[i - 1]; cfg.missions[i - 1] = m; cfg.missions[i] = t; render(); } };
      const dn = el('button', null, '↓'); dn.onclick = () => { if (i < cfg.missions.length - 1) { const t = cfg.missions[i + 1]; cfg.missions[i + 1] = m; cfg.missions[i] = t; render(); } };
      const del = el('button', 'danger', '✕'); del.onclick = () => { cfg.missions.splice(i, 1); render(); };
      hb.append(up, dn, del);
      head.appendChild(hb);
      r.appendChild(head);
      r.appendChild(text('id', () => m.id, v => { m.id = v; }));
      r.appendChild(text('title', () => m.title, v => { m.title = v; }));
      r.appendChild(text('hint', () => m.hint, v => { m.hint = v || undefined; }));
      r.appendChild(sel_('type', TYPES, () => m.type, v => { m.type = v; render(); }));
      if (m.type === 'flag') r.appendChild(text('flag', () => m.flag, v => { m.flag = v; }));
      if (m.type === 'weapon') r.appendChild(sel_('weapon', WEAPON_IDS, () => m.weapon, v => { m.weapon = v; }));
      if (m.type === 'kills') r.appendChild(num('kills ≥', () => m.n, v => { m.n = Math.round(v); }, 1));
      if (m.type === 'level') r.appendChild(sel_('level', levels.map(l => ({ value: l.id, label: l.name })), () => m.level, v => { m.level = v; }));
      const rw = m.reward = m.reward || {};
      r.appendChild(num('🩹 medkits', () => rw.medkit || 0, v => { rw.medkit = Math.round(v) || undefined; }, 1));
      r.appendChild(sel_('ammo kind', ['—', ...AMMO_IDS], () => rw.ammo || '—', v => { rw.ammo = v === '—' ? undefined : v; }));
      r.appendChild(num('ammo n', () => rw.n || 0, v => { rw.n = Math.round(v) || undefined; }, 5));
      listW.appendChild(r);
    });
    const add = el('button', null, '+ mission');
    add.onclick = () => { cfg.missions.push({ id: uid('m'), title: 'New mission', type: 'kills', n: 10 }); render(); };
    listW.appendChild(add);
  }
  render();
  const ok = await modal('Mission chain (config: game)', body, [{ label: 'Cancel', value: false }, { label: '💾 Save missions', value: true }]);
  if (ok) {
    cfg.missions.forEach(m => { if (m.reward && !m.reward.medkit && !m.reward.ammo) delete m.reward; });
    await api.putConfig('game', cfg);
    toast('🎯 missions saved');
  }
}

// ── validation ───────────────────────────────────────────────────────────────
async function validate() {
  if (!doc) return;
  const issues = [];
  const inB = (x, z) => Math.abs(x) <= doc.bounds.hx && Math.abs(z) <= doc.bounds.hz;
  const add = (sev, msg, selKind, selUid) => issues.push({ sev, msg, selKind, selUid });
  if (!doc.playerStart) add('err', 'No player start');
  else if (!inB(doc.playerStart.x, doc.playerStart.z)) add('err', 'Player start is outside bounds', 'start', 'start');
  const seen = new Set();
  for (const [kind, arr] of [['object', doc.objects], ['pickup', doc.pickups], ['hotspot', doc.hotspots], ['spawn', doc.spawns]]) {
    for (const e of (arr || [])) {
      if (seen.has(e.uid)) add('err', `Duplicate uid ${e.uid}`, kind, e.uid);
      seen.add(e.uid);
      if (!inB(e.x, e.z)) add('warn', `${kind} ${e.uid} is outside bounds`, kind, e.uid);
    }
  }
  const exits = (doc.hotspots || []).filter(h => h.type === 'exit');
  if (!exits.length) add('warn', 'No exit hotspots — this level is a dead end');
  for (const h of exits) {
    if (!h.target?.level) { add('err', `Exit ${h.uid} has no target level`, 'hotspot', h.uid); continue; }
    if (!levels.some(l => l.id === h.target.level)) { add('err', `Exit ${h.uid} targets missing level "${h.target.level}"`, 'hotspot', h.uid); continue; }
    let tdoc = h.target.level === doc.id ? doc : targetCache.get(h.target.level);
    if (!tdoc) { try { tdoc = (await api.level(h.target.level)).data; targetCache.set(h.target.level, tdoc); } catch { } }
    if (tdoc && !(tdoc.hotspots || []).some(x => x.uid === h.target.hotspot)) add('err', `Exit ${h.uid} targets missing hotspot "${h.target.hotspot}" in ${h.target.level}`, 'hotspot', h.uid);
  }
  for (const h of (doc.hotspots || [])) {
    if (h.type === 'dialog' && !(h.lines || []).some(l => l.text)) add('warn', `Dialog ${h.uid} has no lines`, 'hotspot', h.uid);
    if (h.type === 'item' && !(h.gives || []).length) add('warn', `Item hotspot ${h.uid} gives nothing`, 'hotspot', h.uid);
  }
  const body = el('div');
  if (!issues.length) body.appendChild(el('p', null, '✅ No issues found.'));
  for (const i of issues) {
    const d = el('div', 'issue' + (i.sev === 'err' ? ' err' : ''), `${i.sev === 'err' ? '⛔' : '⚠️'} ${i.msg}`);
    if (i.selUid) d.onclick = () => { $('modal-wrap').classList.add('hidden'); select(i.selKind, i.selUid); };
    body.appendChild(d);
  }
  await modal(`Validation — ${issues.length} issue${issues.length === 1 ? '' : 's'}`, body, [{ label: 'Close', value: true }]);
}

// ── boot + wiring ────────────────────────────────────────────────────────────
async function boot() {
  try { await api.ping(); } catch {
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100%;text-align:center;line-height:1.7"><div><h2>⚠️ Server not running</h2><p>The editor needs the Go server.<br><code>cd gms/3d/f5_deadtown && ./run.sh</code><br>then reload this page.</p></div></div>';
    return;
  }
  const container = $('viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  await initAssets(renderer, () => {});

  scene = createEditorScene({
    container, renderer,
    callbacks: {
      snap,
      onSelect: (k, u) => select(k, u),
      onPlace: (x, z) => placeAt(snap(x), snap(z)),
      onMoveLive: (kind, id, x, z) => {
        if (!dragSnapped) { snapshot(); dragSnapped = true; }
        const e = entity(kind, id);
        if (e) { e.x = x; e.z = z; markDirty(); }
      },
      onMoveEnd: (kind, id) => {
        dragSnapped = false;
        scene.refresh(kind, id);
        renderInspector();
      },
    },
  });

  buildPalette();
  await refreshLevelList();
  const want = new URLSearchParams(location.search).get('level');
  const first = (want && levels.some(l => l.id === want)) ? want : levels[0]?.id;
  if (first) await openLevel(first);
  renderLevelPane();

  // toolbar
  $('level-select').addEventListener('change', e => openLevel(e.target.value));
  $('btn-new').onclick = newLevel;
  $('btn-dup').onclick = duplicateLevel;
  $('btn-del').onclick = deleteLevel;
  $('btn-save').onclick = () => saveLevel();
  $('btn-undo').onclick = undo;
  $('btn-redo').onclick = redo;
  $('btn-snap').onclick = () => { snapOn = !snapOn; $('btn-snap').classList.toggle('on', snapOn); };
  $('btn-grid').onclick = () => { const on = $('btn-grid').classList.toggle('on'); scene.setGridVisible(on); };
  $('btn-cam').onclick = () => { const m = scene.toggleCamera(); $('btn-cam').textContent = m === 'top' ? '🎥 top' : '🎥 3D'; };
  $('btn-frame').onclick = () => scene.frame();
  $('btn-versions').onclick = versionsModal;
  $('btn-missions').onclick = missionsModal;
  $('btn-validate').onclick = validate;
  $('btn-publish').onclick = async () => {
    try { const r = await api.publish(); toast(`📤 published ${r.levels} levels to data/snapshot/game.json`); }
    catch (e) { toast('publish failed: ' + e.message, true); }
  };
  $('btn-play').onclick = async () => {
    await saveLevel(true);
    window.open(`${location.protocol}//${location.hostname}:8901/?level=${doc.id}&nosave`, 'f5dt_play');
  };

  // sidebar tabs
  document.querySelectorAll('.side-tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.side-tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('inspector').classList.toggle('on', b.dataset.tab === 'inspect');
    $('levelpane').classList.toggle('on', b.dataset.tab === 'level');
    if (b.dataset.tab === 'level') renderLevelPane();
  });

  // keyboard
  addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveLevel(); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (e.key === 'Escape') { disarm(); select(null, null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
    if (e.key.toLowerCase() === 'g') { $('btn-snap').click(); return; }
    if (e.key.toLowerCase() === 'p') { $('btn-cam').click(); return; }
    if (e.key.toLowerCase() === 'f') { scene.frame(); return; }
    if (!sel) return;
    const ent = entity(sel.kind, sel.uid);
    if (!ent) return;
    const nudge = snapOn ? 0.5 : 0.1;
    const mv = { ArrowUp: [0, -nudge], ArrowDown: [0, nudge], ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0] }[e.key];
    if (mv) {
      e.preventDefault();
      mutate(() => { ent.x = Math.round((ent.x + mv[0]) * 100) / 100; ent.z = Math.round((ent.z + mv[1]) * 100) / 100; }, { refresh: [sel.kind, sel.uid] });
      return;
    }
    if (sel.kind === 'object') {
      if (e.key.toLowerCase() === 'r') mutate(() => { ent.rot = (ent.rot || 0) + rad(e.shiftKey ? -15 : 15); }, { refresh: [sel.kind, sel.uid] });
      if (e.key === '[') mutate(() => { ent.scale = Math.max(0.1, (ent.scale || 1) * 0.95); }, { refresh: [sel.kind, sel.uid] });
      if (e.key === ']') mutate(() => { ent.scale = (ent.scale || 1) * 1.05; }, { refresh: [sel.kind, sel.uid] });
    }
  });

  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  window.__ed = {
    get doc() { return doc; }, get dirty() { return dirty; }, get sel() { return sel; },
    get undoDepth() { return undoStack.length; }, get levels() { return levels; },
    select, placeAt, saveLevel, openLevel, api,
  };
}

boot();

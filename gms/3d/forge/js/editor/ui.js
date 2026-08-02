// The editor's sheet: a thumb-sized bottom panel with three tabs. It renders from the editor's
// state and sends every change straight back to it — nothing here is remembered.

import { TYPES, TYPE_IDS, footprint } from './scene.js';
import { ZONE_IDS, zone } from '../world/zones.js';
import { exportScene, importScene, slots, saveSlot, loadSlot, deleteSlot } from './store.js';

export function buildSheet(ed) {
  const toggle = el('button', 'ed-toggle', '✎');
  toggle.title = 'Level editor';
  const sheet = el('div', 'ed-sheet');
  sheet.innerHTML = `
    <div class="ed-tabs">
      <button data-tab="place">Place</button>
      <button data-tab="obj">Object</button>
      <button data-tab="scene">Scene</button>
      <button class="ed-close" data-act="close">✕</button>
    </div>
    <div class="ed-body"></div>`;
  document.body.append(toggle, sheet);

  const body = sheet.querySelector('.ed-body');
  let tab = 'place';

  const ui = {
    sync() {
      sheet.classList.toggle('open', !!ed.on);
      toggle.classList.toggle('on', !!ed.on);
      if (!ed.on) return;
      if (ed.selected && tab === 'place') tab = 'obj';
      for (const b of sheet.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
      body.innerHTML = { place: placeTab, obj: objTab, scene: sceneTab }[tab](ed);
    },
  };

  toggle.onclick = () => ed.toggle();

  sheet.addEventListener('click', e => {
    const t = e.target.closest('[data-tab], [data-act], [data-brush], [data-zone], [data-slot]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; ui.sync(); return; }
    if (t.dataset.brush) { ed.brush.type = t.dataset.brush; ed.armed = null; ui.sync(); return; }
    if (t.dataset.zone) {
      if (ed.selected && tab === 'obj') ed.setZone(t.dataset.zone);
      else ed.brush.zone = t.dataset.zone;
      ui.sync();
      return;
    }
    if (t.dataset.slot) { slotAction(ed, t.dataset.act, t.dataset.slot); ui.sync(); return; }
    act(ed, ui, t.dataset.act);
  });

  sheet.addEventListener('input', e => {
    const k = e.target.dataset.param;
    if (k === 'ry') { ed.rotateTo(+e.target.value * Math.PI / 180); }
    else if (k) ed.setParam(k, +e.target.value);
    else if (e.target.dataset.name !== undefined) ed.doc.name = e.target.value;
    const out = e.target.parentElement.querySelector('em');
    if (out && k) out.textContent = fmt(+e.target.value);
  });

  sheet.addEventListener('change', () => ed.save());

  // the readout is the point of the Scene tab, so keep it live while it is open
  setInterval(() => {
    if (!ed.on || tab !== 'scene') return;
    const s = body.querySelector('[data-live]');
    if (s) s.textContent = drawLine(ed);
  }, 500);

  ui.sync();
  return ui;
}

function act(ed, ui, name) {
  if (name === 'close') ed.toggle(false);
  if (name === 'arm') { ed.armed = ed.brush.type; ui.sync(); }
  if (name === 'delete') ed.remove();
  if (name === 'dup') ed.duplicate();
  if (name === 'deselect') ed.deselect();
  if (name === 'undo') ed.undo();
  if (name === 'export') exportScene(ed.doc);
  if (name === 'import') importScene().then(doc => doc && ed.swapScene(doc));
  if (name === 'demo') ed.resetToDemo();
  if (name === 'saveas') { saveSlot(ed.doc.name || 'Scene', ed.doc); ed.save(); ui.sync(); }
  if (name === 'spin') { ed.rotateTo(ed.selected.ry + Math.PI / 12); ui.sync(); }
}

function slotAction(ed, name, key) {
  if (name === 'slotload') { const d = loadSlot(key); if (d) ed.swapScene(d); }
  if (name === 'slotdel') deleteSlot(key);
}

function placeTab(ed) {
  const armed = ed.armed;
  return `
    ${chips('Zone', ZONE_IDS.map(z => ({ v: z, label: zone(z).label, on: ed.brush.zone === z })), 'zone')}
    ${chips('Kind', TYPE_IDS.map(t => ({ v: t, label: TYPES[t].label, on: ed.brush.type === t })), 'brush')}
    <div class="ed-grp">
      <button class="ed-big ${armed ? 'armed' : ''}" data-act="arm">
        ${armed ? 'Tap the ground to drop it' : `＋ Place a ${TYPES[ed.brush.type].label.toLowerCase()}`}
      </button>
      <p class="ed-hint">Tap any building to select it. Drag a selected building to move it.</p>
    </div>`;
}

function objTab(ed) {
  const o = ed.selected;
  if (!o) return `<div class="ed-grp"><p class="ed-hint">Nothing selected. Tap a building.</p></div>`;
  const deg = Math.round(o.ry * 180 / Math.PI);
  const [hw, hd] = footprint(o);
  return `
    <div class="ed-grp ed-head">
      <b>${TYPES[o.type].label} #${o.id}</b>
      <span>${o.x.toFixed(1)}, ${o.z.toFixed(1)} · ${(hw * 2).toFixed(1)}×${(hd * 2).toFixed(1)} m</span>
    </div>
    <div class="ed-grp ed-acts">
      <button data-act="spin">⟳ 15°</button>
      <button data-act="dup">Duplicate</button>
      <button data-act="deselect">Done</button>
      <button class="ed-danger" data-act="delete">Delete</button>
    </div>
    ${chips('Zone', ZONE_IDS.map(z => ({ v: z, label: zone(z).label, on: o.zone === z })), 'zone')}
    <div class="ed-grp">
      ${slider({ key: 'ry', label: 'Rotation', min: -180, max: 180, step: 1 }, deg)}
      ${TYPES[o.type].params.map(s => slider(s, o.p[s.key])).join('')}
    </div>`;
}

function sceneTab(ed) {
  const saved = Object.keys(slots());
  const counts = TYPE_IDS.map(t => `${ed.doc.objects.filter(o => o.type === t).length} ${TYPES[t].label.toLowerCase()}`);
  return `
    <div class="ed-grp">
      <label class="row"><span>Name</span><input data-name value="${esc(ed.doc.name || '')}"></label>
      <p class="ed-hint">${ed.doc.objects.length} objects — ${counts.join(', ')}</p>
      <p class="ed-hint" data-live>${drawLine(ed)}</p>
    </div>
    <div class="ed-grp ed-acts">
      <button data-act="undo">Undo</button>
      <button data-act="saveas">Save copy</button>
      <button data-act="export">Export file</button>
      <button data-act="import">Import file</button>
      <button class="ed-danger" data-act="demo">Reset to demo</button>
    </div>
    ${saved.length ? `<div class="ed-grp"><h4>Saved</h4>${saved.map(n => `
      <div class="ed-slot"><span>${esc(n)}</span>
        <button data-slot="${esc(n)}" data-act="slotload">Load</button>
        <button data-slot="${esc(n)}" data-act="slotdel" class="ed-danger">✕</button>
      </div>`).join('')}</div>` : ''}`;
}

function drawLine(ed) {
  const s = ed.stats();
  const state = ed.selected ? 'editing — 1 object lifted out of its batch' : 'committed';
  return `${s.calls} draw calls, ${(s.tris / 1000).toFixed(0)}k tris (${state})`;
}

function chips(title, items, attr) {
  return `<div class="ed-grp"><h4>${title}</h4><div class="ed-chips">${items
    .map(i => `<button data-${attr}="${i.v}" class="${i.on ? 'on' : ''}">${i.label}</button>`).join('')}</div></div>`;
}

function slider(s, value) {
  return `<label class="row range">
      <span>${s.label}<em>${fmt(value)}</em></span>
      <input type="range" data-param="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}">
    </label>`;
}

const fmt = v => (Number.isInteger(v) ? v : v.toFixed(1));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

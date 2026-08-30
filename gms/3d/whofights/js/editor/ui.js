// The editor's sheet: a thumb-sized bottom panel with three tabs. It renders from the editor's
// state and sends every change straight back to it — nothing here is remembered.

import { TYPES, TYPE_IDS, footprint } from './scene.js';
import { ZONE_IDS, zone } from '../world/zones.js';
import { exportScene, importScene, slots, saveSlot, loadSlot, deleteSlot, storageError } from './store.js';

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
    <div class="ed-bar"></div>
    <div class="ed-body"></div>`;
  document.body.append(toggle, sheet);

  const body = sheet.querySelector('.ed-body');
  const bar = sheet.querySelector('.ed-bar');
  let tab = 'place';
  let shown = null;

  const ui = {
    sync() {
      sheet.classList.toggle('open', !!ed.on);
      toggle.classList.toggle('on', !!ed.on);
      if (!ed.on) return;
      bar.innerHTML = barHTML(ed);
      // follow a new selection to the Object tab, but only on the change — otherwise the other
      // tabs are unreachable for as long as anything is selected
      const sel = ed.selected ? ed.selected.id : null;
      if (sel && sel !== shown) tab = 'obj';
      shown = sel;
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
    if (t.dataset.slot) return slotAction(ed, ui, t.dataset.act, t.dataset.slot);
    act(ed, ui, t.dataset.act);
  });

  sheet.addEventListener('input', e => {
    const k = e.target.dataset.param;
    const s = e.target.dataset.string;
    if (k === 'ry') { ed.rotateTo(+e.target.value * Math.PI / 180); }
    else if (k) ed.setParam(k, +e.target.value);
    else if (s && ed.selected) ed.setObjectString(ed.selected.id, s, e.target.value);
    else if (e.target.dataset.name !== undefined) { ed.doc.name = e.target.value; ed.saveSoon(); }
    const out = e.target.parentElement.querySelector('em');
    if (out && k) out.textContent = fmt(+e.target.value);
  });

  // a slider release / a field blur is the moment to stop debouncing and get it on disk
  sheet.addEventListener('change', e => {
    // Lettering is baked to a texture, so it is redrawn when the field is left, not per keystroke.
    if (e.target.dataset.string && ed.selected) return ed.rebuildObject(ed.selected.id);
    ed.saveNow();
  });

  // the readout is the point of the Scene tab, so keep it live while it is open
  setInterval(() => {
    if (!ed.on || tab !== 'scene') return;
    const s = body.querySelector('[data-live]');
    if (s) s.textContent = drawLine(ed);
  }, 500);

  ui.sync();
  return ui;
}

// The bar under the tabs carries anything the editor needs to say: a pending confirmation
// first, then a standing storage failure, then the last notice.
function barHTML(ed) {
  const q = ed.question;
  if (q) {
    return `<div class="ed-ask"><p>${esc(q.text)}</p><div class="ed-acts">
      <button data-act="no">Cancel</button>
      <button class="ed-danger" data-act="yes">${esc(q.yes)}</button></div></div>`;
  }
  if (!ed.storageOK()) {
    return `<div class="ed-warn">Not saving — ${esc(storageError())}. Use <b>Export file</b> to keep this scene.</div>`;
  }
  if (ed.notice) return `<div class="ed-note"><span>${esc(ed.notice)}</span><button data-act="dismiss">✕</button></div>`;
  return '';
}

function act(ed, ui, name) {
  if (name === 'close') ed.toggle(false);
  if (name === 'yes') ed.answer(true);
  if (name === 'no') ed.answer(false);
  if (name === 'dismiss') { ed.notice = null; ui.sync(); }
  if (name === 'arm') { ed.armed = ed.armed ? null : ed.brush.type; ui.sync(); }
  if (name === 'delete') ed.remove();
  if (name === 'dup') ed.duplicate();
  if (name === 'deselect') ed.deselect();
  if (name === 'undo') ed.undo();
  if (name === 'redo') ed.redo();
  if (name === 'export') exportScene(ed.doc);
  if (name === 'import') importFile(ed);
  if (name === 'demo') ed.ask('Reset to the demo scene? This one is kept as the copy “Before reset”.', () => ed.resetToDemo(), 'Reset');
  if (name === 'saveas') saveCopy(ed);
  if (name === 'rubble' && ed.selected) ed.setRubble(!ed.selected.rubble);
  if (name === 'spin' && ed.selected) { ed.rotateTo(ed.selected.ry + Math.PI / 12); ui.sync(); }
}

function slotAction(ed, ui, name, key) {
  if (name === 'slotload') {
    const r = loadSlot(key);
    if (!r) return ed.flash(`“${key}” is not there any more.`);
    if (!r.doc) return ed.flash(`“${key}” could not be read — ${r.error}.`);
    ed.ask(`Load “${key}”?${changed(r)} This scene is kept as the copy “Before load”.`,
      () => ed.swapScene(r.doc, 'load'), 'Load');
  }
  if (name === 'slotdel') {
    ed.ask(`Delete the saved copy “${key}”? That cannot be undone.`, () => {
      if (!deleteSlot(key)) ed.flash(`Could not delete “${key}” — ${storageError()}.`);
      ui.sync();
    }, 'Delete');
  }
}

function importFile(ed) {
  importScene().then(r => {
    if (!r) return;
    if (!r.doc) return ed.flash(`Not imported — ${r.error}.`);
    ed.ask(`Load “${r.doc.name}”?${changed(r)} This scene is kept as the copy “Before import”.`,
      () => ed.swapScene(r.doc, 'import'), 'Load');
  });
}

function saveCopy(ed) {
  const name = (ed.doc.name || 'Scene').trim() || 'Scene';
  const write = () => ed.flash(saveSlot(name, ed.doc)
    ? `Saved the copy “${name}”.`
    : `Copy not saved — ${storageError()}.`);
  if (slots().includes(name)) ed.ask(`Replace the saved copy “${name}”?`, write, 'Replace');
  else write();
}

function changed(r) {
  const bits = [r.dropped ? `${r.dropped} object${r.dropped > 1 ? 's' : ''} dropped` : '', ...r.warnings].filter(Boolean);
  return bits.length ? ` (${bits.join('; ')})` : '';
}

function placeTab(ed) {
  const armed = ed.armed;
  return `
    ${chips('Tone', ZONE_IDS.map(z => ({ v: z, label: zone(z).label, on: ed.brush.zone === z })), 'zone')}
    ${chips('Kind', TYPE_IDS.map(t => ({ v: t, label: TYPES[t].label, on: ed.brush.type === t })), 'brush')}
    <div class="ed-grp">
      <button class="ed-big ${armed ? 'armed' : ''}" data-act="arm">
        ${armed ? 'Tap the ground to drop it' : `＋ Place a ${TYPES[ed.brush.type].label.toLowerCase()}`}
      </button>
      <p class="ed-hint">${armed
        ? 'Tap this button again to cancel.'
        : 'Tap any building to select it. Drag a selected building to move it.'}</p>
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
    ${chips(`Tone — this district is ${zone(ed.doc.districts[o.dist]?.zone || 'neutral').label.toLowerCase()}`,
      ZONE_IDS.map(z => ({ v: z, label: zone(z).label, on: o.zone === z })), 'zone')}
    ${TYPES[o.type].rubble ? `<div class="ed-grp"><h4>Debris</h4><div class="ed-chips">
      <button data-act="rubble" class="${o.rubble ? 'on' : ''}">${o.rubble ? 'Rubble on' : 'Rubble off'}</button>
    </div></div>` : ''}
    ${(TYPES[o.type].strings || []).map(s => `<div class="ed-grp">
      <label class="wf-row"><span>${s.label}</span>
        <input data-string="${s.key}" maxlength="120" value="${esc(o.p[s.key] ?? s.def)}"></label>
    </div>`).join('')}
    <div class="ed-grp">
      ${slider({ key: 'ry', label: 'Rotation', min: -180, max: 180, step: 1 }, deg)}
      ${TYPES[o.type].params.map(s => slider(s, o.p[s.key])).join('')}
    </div>`;
}

function sceneTab(ed) {
  const saved = slots();
  const counts = TYPE_IDS.map(t => `${ed.doc.objects.filter(o => o.type === t).length} ${TYPES[t].label.toLowerCase()}`);
  return `
    <div class="ed-grp">
      <label class="wf-row"><span>Name</span><input data-name value="${esc(ed.doc.name || '')}"></label>
      <p class="ed-hint">${ed.doc.objects.length} objects — ${counts.join(', ')}</p>
      <p class="ed-hint" data-live>${drawLine(ed)}</p>
    </div>
    <div class="ed-grp ed-acts">
      <button data-act="undo">Undo</button>
      <button data-act="redo">Redo</button>
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
  return `<label class="wf-row range">
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

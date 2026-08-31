// The level editor tab: which level you are editing, the hotspots in it, where the player starts,
// and the tone and lettering of what is standing in it.
//
// The world editor (js/editor/) is the thing that places buildings; this wraps it. Objects moved
// out there are mirrored back into data/levels/<id>.json through ctx.data, so one ctrl+S writes
// the file the game actually reads.

import { registerTab } from '../hub.js';
import { h, btn, field, row, select, text, num, check, clear } from '../level/dom.js';
import * as io from '../level/levelio.js';
import * as hp from '../level/hotspot.js';
import { HotspotOverlay } from '../level/overlay.js';
import { worldSession } from '../level/pick.js';
import { ZONE_IDS, zone } from '../../world/zones.js';
import { TYPES } from '../../editor/scene.js';
import { clearScene } from '../../editor/store.js';
import { validatePred } from '../../game/predicate.js';
import { BARK_CATEGORIES } from '../data.js';

const LAST = 'wf.dev.level.id';
const SUBS = [['hotspots', 'Hotspots'], ['start', 'Start & level'], ['objects', 'Objects & tone']];

const S = {
  ctx: null, host: null, id: null, sub: 'hotspots',
  sel: new Set(), primary: null, objSel: new Set(),
  overlay: null, offs: [], mirrorOff: null, ask: null, mirrorArmed: false, drift: null,
};

const TAB = { id: 'level', label: 'Level editor', order: 10, mount, unmount };
registerTab(TAB);

const doc = () => S.ctx?.data.get('levels', S.id) || null;
const liveId = () => window.__wf?.level?.id ?? null;
const isLive = () => !!S.id && S.id === liveId();
const ed = () => window.__wf?.editor || null;
const edit = (fn, label, coalesce = false) => S.ctx.data.mutate('levels', S.id, fn, { label, coalesce });

async function mount(el, ctx) {
  ensureCSS();
  S.ctx = ctx;
  S.host = el;
  const [index] = await Promise.all([
    ctx.data.load('levelIndex'), ctx.data.load('characters'),
    ctx.data.load('conversations'), ctx.data.load('music'),
  ]);
  const ids = await ctx.data.levelIds();
  const want = localStorage.getItem(LAST);
  S.id = ids.includes(want) ? want : (ids.includes(liveId()) ? liveId() : (index?.[0]?.id || ids[0]));
  if (!S.id) S.id = 'academy';
  await ctx.data.load('levels', S.id);
  S.ids = ids;

  ensureOverlay();
  armMirror();
  paint();

  S.offs.push(ctx.data.onAny(({ kind, id, why }) => {
    if (kind === 'levels' && id === S.id) { applyToWorld(); syncOverlay(); }
    // A repaint mid-keystroke would take the caret with it, and the field already holds the value.
    // Only a text field earns that: a button or a select that changed the document needs the
    // redraw, and skipping it is how an action card silently fails to appear.
    if (why === 'set' && typingInPanel()) return refreshChrome();
    paint();
  }));
  S.onKey = e => onKey(e);
  addEventListener('keydown', S.onKey, true);
  applyToWorld();
  syncOverlay();
}

const typingInPanel = () => {
  const a = document.activeElement;
  return !!a && !!S.host?.contains(a)
    && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox'));
};

function unmount() {
  for (const off of S.offs) off?.();
  S.offs = [];
  S.mirrorOff?.();
  S.mirrorOff = null;
  removeEventListener('keydown', S.onKey, true);
  S.host = null;
  S.ask = null;
}

function ensureCSS() {
  const href = new URL('../level/level.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${href}"]`)) {
    document.head.appendChild(h('link', { rel: 'stylesheet', href }));
  }
}

function ensureOverlay() {
  const app = S.ctx.app;
  if (S.overlay || !app?.scene) return;
  S.overlay = new HotspotOverlay(app, S.ctx.world || window.__wf?.world, {
    characterAt: id => window.__wf?.characters?.at(id) || null,
  });
  const api = {
    get visible() { return !!S.overlay?.visible; },
    show: on => S.overlay?.show(on),
    toggle: () => S.overlay?.toggle(),
    refresh: () => syncOverlay(),
    list: () => doc()?.hotspots || [],
    level: () => S.id,
  };
  if (window.__wf) window.__wf.hotspots = api;
  if (window.__wfDev) window.__wfDev.hotspots = api;
}

function refs() {
  const d = S.ctx.data;
  return {
    characters: d.get('characters')?.characters || {},
    conversations: d.get('conversations')?.nodes || {},
    levelIds: S.ids || [],
    musicSets: (d.get('music')?.sets || []).map(s => s.id),
  };
}

function nameMap() {
  const r = refs();
  return {
    conversations: Object.fromEntries(Object.entries(r.conversations).map(([k, v]) => [k, v?.name || k])),
    characters: Object.fromEntries(Object.entries(r.characters).map(([k, v]) => [k, v?.name || k])),
  };
}

function problems() {
  const r = refs();
  const m = new Map();
  for (const hs of doc()?.hotspots || []) m.set(hs.id, hp.hotspotProblems(hs, r));
  return m;
}

// ── the world, kept in step ────────────────────────────────────────────────────────────────────

// Only the fields the world editor does not own: replacing `objects` on the live document would
// pull the geometry out from under the builder mid-frame.
function applyToWorld() {
  const d = doc();
  const live = window.__wf?.level;
  if (!d || !isLive() || !live) return;
  // The runtime is handed the loaded form, not the authored one: a hotspot half-typed in the
  // inspector must not reach it with no trigger and no actions array.
  live.hotspots = (d.hotspots || []).map((x, i) => hp.normaliseHotspot(x, i)).filter(Boolean);
  live.start = d.start;
  live.name = d.name;
  live.music = d.music;
  window.__wf?.game?.hotspots?.load(live.hotspots);
}

function armMirror() {
  const e = ed();
  S.drift = null;
  S.mirrorArmed = false;
  if (!e?.onChange) return;
  if (!isLive()) { S.drift = liveId() ? 'other' : null; return; }
  S.mirrorArmed = io.sameAsLoaded(doc(), e.doc.objects);
  if (!S.mirrorArmed) S.drift = 'objects';
  S.mirrorOff?.();
  S.mirrorOff = e.onChange(d => {
    if (!S.mirrorArmed || !isLive() || io.sameAsLoaded(doc(), d.objects)) return;
    edit(x => { x.objects = io.exportObjects(d.objects); }, 'moved in the world', true);
  });
}

function pullFromWorld() {
  const e = ed();
  if (!e) return;
  edit(d => { d.objects = io.exportObjects(e.doc.objects); }, 'pull from the world editor');
  S.mirrorArmed = true;
  S.drift = null;
  S.ctx.toast('the world editor’s objects are now in this file — not saved to disk yet', 'warn');
  paint();
}

function syncOverlay() {
  if (!S.overlay) return;
  S.overlay.set(isLive() ? (doc()?.hotspots || []) : [], { selected: S.sel, problems: problems() });
}

// ── painting ───────────────────────────────────────────────────────────────────────────────────

function paint() {
  if (!S.host) return;
  clear(S.host);
  S.host.append(nowBar());
  if (S.ask) S.host.append(S.ask);
  const warn = driftBanner();
  if (warn) S.host.append(warn);
  S.host.append(h('div', { class: 'lv-sub' },
    SUBS.map(([id, label]) => btn(label, () => { S.sub = id; paint(); }, S.sub === id ? 'on' : ''))));
  S.host.append({ hotspots: hotspotPanel, start: startPanel, objects: objectPanel }[S.sub]());
}

function refreshChrome() {
  const bar = S.host?.querySelector('.lv-now');
  if (bar) bar.replaceWith(nowBar());
}

// "You are editing this level" — the loudest thing on the screen, and the tab's own name in the
// hub's nav, because a tool that edits the wrong file looks exactly like one that works.
function nowBar() {
  const d = doc();
  const dirty = S.ctx.data.dirty('levels', S.id);
  const short = String(d?.name || S.id || '');
  TAB.label = `Level · ${short.length > 20 ? `${short.slice(0, 19)}…` : short}`;
  S.ctx.hub.registerTab(TAB);
  return h('div', { class: 'lv-now' },
    h('div', {},
      h('div', { class: 'lv-eyebrow', text: 'YOU ARE EDITING' }),
      h('h2', { text: d?.name || S.id || '—' })),
    h('code', { text: S.ctx.data.fileOf('levels', S.id) }),
    h('span', { class: `lv-chip ${dirty ? 'dirty' : 'ok'}`,
      text: dirty ? 'unsaved changes' : `saved · from ${S.ctx.data.source('levels', S.id) || '—'}` }),
    isLive()
      ? h('span', { class: 'lv-chip ok', text: 'this is the level the game has loaded' })
      : h('span', { class: 'lv-chip bad', text: liveId() ? `the game is showing ${liveId()}` : 'no world loaded' }),
    h('span', { class: 'lv-grow' }),
    btn('Save', save, 'primary'),
    btn('Switch level…', pickLevel),
    btn('Rename…', renameLevel),
    btn('Duplicate…', duplicateLevel),
    btn('Delete…', deleteLevel, 'danger'));
}

function driftBanner() {
  if (S.drift === 'other') {
    return h('div', { class: 'lv-warn' },
      h('b', { text: 'The game has a different level loaded. ' }),
      `Hotspots and world picking work on ${liveId()}, not on ${S.id}. You can still edit this
       file, but nothing you draw will be drawn in the world.`,
      row(btn(`Open ${liveId()} instead`, () => switchTo(liveId())),
        btn(`Load ${S.id} in the game`, () => reloadInto(S.id))));
  }
  if (S.drift === 'objects') {
    return h('div', { class: 'lv-warn' },
      h('b', { text: 'The world editor is showing objects this file does not have. ' }),
      `The world editor keeps its own copy in this browser (localStorage “wf.scene”) and that copy
       wins at boot, so the file on disk is not what you are looking at. Nothing is mirrored back
       until you say which one is right.`,
      row(btn('Pull the world’s objects into this file', pullFromWorld, 'primary'),
        btn('Discard the browser copy and reload', discardWorldCopy, 'danger')));
  }
  return null;
}

function discardWorldCopy() {
  confirmAsk('Discard the browser copy?',
    'The world editor’s local copy is thrown away and the page reloads from the file on disk. Anything moved in the world and never pulled into a file is lost.',
    'Discard and reload', () => { clearScene(); location.reload(); });
}

// ── level management ───────────────────────────────────────────────────────────────────────────

function askRow(title, node, actions) {
  S.ask = h('div', { class: 'lv-warn' }, h('b', { text: title }), h('div', { class: 'lv-row' }, node, actions));
  paint();
  S.host?.querySelector('.lv-warn input')?.focus();
}

function closeAsk() { S.ask = null; paint(); }

function textAsk(title, value, label, onOk) {
  let v = value;
  const input = text(v, x => { v = x; }, { placeholder: title });
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); closeAsk(); onOk(v); } };
  askRow(title, input, [btn(label, () => { closeAsk(); onOk(v); }, 'primary'), btn('Cancel', closeAsk)]);
}

function confirmAsk(title, detail, label, onOk) {
  askRow(title, h('span', { class: 'lv-hint', text: detail }),
    [btn(label, () => { closeAsk(); onOk(); }, 'danger'), btn('Cancel', closeAsk)]);
}

function pickLevel() {
  const list = h('div', { class: 'lv-row' }, (S.ids || []).map(id =>
    btn(id === S.id ? `${id} (open)` : id, () => { closeAsk(); switchTo(id); }, id === S.id ? 'primary' : '')));
  askRow('Switch to which level?', list, [btn('New level…', () => { closeAsk(); newLevel(); }), btn('Cancel', closeAsk)]);
}

function switchTo(id) {
  if (id === S.id) return;
  const go = async () => {
    S.id = id;
    localStorage.setItem(LAST, id);
    S.sel.clear();
    S.objSel.clear();
    S.primary = null;
    await S.ctx.data.load('levels', id);
    armMirror();
    applyToWorld();
    syncOverlay();
    paint();
  };
  if (!S.ctx.data.dirty('levels', S.id)) return go();
  askRow(`${S.id} has unsaved changes.`, h('span', { class: 'lv-hint', text: 'Switching keeps them in this browser, but the file on disk stays as it is.' }),
    [btn('Save, then switch', async () => { closeAsk(); await save(); go(); }, 'primary'),
      btn('Switch anyway', () => { closeAsk(); go(); }),
      btn('Stay here', closeAsk)]);
}

function reloadInto(id) {
  const url = new URL(location.href);
  url.searchParams.set('level', id);
  confirmAsk(`Reload the game into ${id}?`, 'The page reloads. Anything unsaved in any tab is lost.',
    'Reload', () => { location.href = url.toString(); });
}

function newLevel() {
  textAsk('Name the new level', 'New level', 'Create', async name => {
    if (!String(name).trim()) return S.ctx.toast('a level needs a name', 'bad');
    const ids = await S.ctx.data.levelIds();
    const id = io.deriveId(name, ids);
    // A level only half-made — an unsaved draft in this browser — still owns its id, so say so
    // rather than letting a silent "-2" turn up in the filename.
    if (id !== io.slugify(name)) {
      S.ctx.toast(`“${io.slugify(name)}” is already taken, so this one is “${id}”`, 'warn');
    }
    const d = io.seedLevel(id, String(name).trim());
    S.ctx.data.set('levels', d, id, { label: `new level ${id}` });
    await writeIndex(d);
    const r = await S.ctx.data.save('levels', id);
    S.ids = await S.ctx.data.levelIds();
    S.ctx.toast(r.ok ? `created ${id} — ${r.where === 'server' ? r.path : 'in this browser only'}` : `not created: ${r.error}`,
      r.ok ? 'good' : 'bad');
    switchTo(id);
  });
}

function duplicateLevel() {
  textAsk('Name the copy', `${doc()?.name || S.id} copy`, 'Duplicate', async name => {
    const ids = await S.ctx.data.levelIds();
    const id = io.deriveId(name, ids);
    const d = io.duplicateLevel(doc(), id, String(name).trim() || id);
    S.ctx.data.set('levels', d, id, { label: `duplicate to ${id}` });
    await writeIndex(d);
    await S.ctx.data.save('levels', id);
    S.ids = await S.ctx.data.levelIds();
    switchTo(id);
  });
}

function renameLevel() {
  textAsk('Rename this level', doc()?.name || S.id, 'Rename', async name => {
    const n = String(name).trim();
    if (!n) return;
    edit(d => { d.name = n; }, 'rename level');
    await writeIndex({ ...doc(), name: n });
    await save();
    S.ctx.toast(`renamed to “${n}” — the id stays ${S.id}, so nothing pointing at it breaks`, 'good');
  });
}

// The id is the filename, the index key, every character's place.level and every goto target, so
// this rewrites all four. The dev server has no delete route, so the old file stays on disk — said
// out loud rather than left to be discovered, the same way deleteLevel says it.
function changeLevelId() {
  const from = S.id;
  textAsk(`Change the id of “${doc()?.name || from}”`, from, 'Change it', async raw => {
    const to = io.slugify(raw);
    if (!to || to === from) return;
    if ((S.ids || []).includes(to)) return S.ctx.toast(`${to} already exists`, 'bad');
    const levels = Object.fromEntries((S.ids || [])
      .map(id => [id, S.ctx.data.get('levels', id)]).filter(([, v]) => v));
    const r = io.retargetLevel(from, to, {
      index: S.ctx.data.get('levelIndex') || [], levels, characters: refs().characters,
    });
    if (!r.doc) return S.ctx.toast(`${from} is not loaded — open it first`, 'bad');

    S.ctx.data.set('levels', r.doc, to, { label: `${from} → ${to}` });
    S.ctx.data.set('levelIndex', r.index, null, { label: 'level index' });
    for (const [lid, d] of Object.entries(r.gotos)) S.ctx.data.set('levels', d, lid, { label: `retarget ${lid}` });
    if (r.characters) {
      S.ctx.data.mutate('characters', null, d => { d.characters = r.characters; }, { label: `${from} → ${to}` });
    }

    const writes = [S.ctx.data.save('levels', to), S.ctx.data.save('levelIndex'),
      ...Object.keys(r.gotos).map(lid => S.ctx.data.save('levels', lid)),
      ...(r.characters ? [S.ctx.data.save('characters')] : [])];
    const bad = (await Promise.all(writes)).filter(w => !w.ok);
    S.ctx.toast(bad.length
      ? `${bad.length} of ${writes.length} files did not save — ${bad[0].error}`
      : `now ${to}${r.notes.length ? `, and moved ${r.notes.join(', ')}` : ''}. `
        + `data/levels/${from}.json is still on disk — remove it by hand.`,
      bad.length ? 'bad' : 'warn');
    S.ids = await S.ctx.data.levelIds();
    S.id = null;
    switchTo(to);
  });
}

async function writeIndex(d) {
  const idx = S.ctx.data.get('levelIndex') || [];
  S.ctx.data.set('levelIndex', io.indexUpsert(idx, io.indexEntry(d)), null, { label: 'level index' });
  return S.ctx.data.save('levelIndex');
}

function deleteLevel() {
  const impact = io.deleteImpact(S.id, {
    index: S.ctx.data.get('levelIndex') || [],
    levels: Object.fromEntries((S.ids || []).map(id => [id, S.ctx.data.get('levels', id)]).filter(([, v]) => v)),
    characters: refs().characters,
  });
  const detail = impact.length ? `This breaks: ${impact.join('; ')}.` : 'Nothing else points at it.';
  confirmAsk(`Delete “${doc()?.name || S.id}”?`, detail, 'Yes, delete it', () => {
    confirmAsk('Are you sure? Asking twice on purpose.',
      'It is taken out of data/levels/index.json so the game stops loading it. The dev server has no delete route, so the JSON file itself stays on disk until you remove it by hand.',
      `Delete ${S.id} for good`, async () => {
        const idx = io.indexRemove(S.ctx.data.get('levelIndex') || [], S.id);
        S.ctx.data.set('levelIndex', idx, null, { label: `remove ${S.id} from the index` });
        const r = await S.ctx.data.save('levelIndex');
        S.ctx.toast(r.ok
          ? `${S.id} is out of the index. Remove data/levels/${S.id}.json by hand to finish the job.`
          : `index not written: ${r.error}`, r.ok ? 'warn' : 'bad');
        S.ids = (await S.ctx.data.levelIds()).filter(i => i !== S.id);
        const next = idx[0]?.id || S.ids[0];
        if (next) { S.id = null; switchTo(next); } else paint();
      });
  });
}

async function save() {
  const r = await S.ctx.data.save('levels', S.id);
  if (r.ok && r.problems?.length) S.ctx.toast(`saved with ${r.problems.length} validation problems`, 'warn');
  paint();
  return r;
}

// ── hotspots ───────────────────────────────────────────────────────────────────────────────────

function hotspotPanel() {
  const d = doc();
  const list = d?.hotspots || [];
  const probs = problems();
  const broken = [...probs.values()].filter(p => p.length).length;

  const bar = row(
    btn('＋ Circle', () => drawNew('circle'), 'primary'),
    btn('＋ Rect', () => drawNew('rect'), 'primary'),
    btn('＋ On a character', attachNew),
    h('span', { class: 'lv-grow' }),
    h('span', { class: `lv-chip ${broken ? 'bad' : 'ok'}`,
      text: `${list.length} hotspot${list.length === 1 ? '' : 's'}${broken ? ` · ${broken} broken` : ''}` }),
    btn(S.overlay?.visible ? 'Hide overlay' : 'Show overlay',
      () => { S.overlay?.toggle(); paint(); }, S.overlay?.visible ? '' : 'primary'));

  const rows = list.map((hs, i) => {
    const p = probs.get(hs.id) || [];
    const b = h('button', { class: `lv-hs ${S.sel.has(hs.id) ? 'on' : ''}`,
      onclick: e => selectRow(hs.id, i, e) },
      h('span', { class: 'lv-sw', style: { background: hp.hex(hp.colourOf(hs, p)) } }),
      h('span', { class: 'lv-nm' }, h('b', { text: hs.name || hs.id }),
        h('em', { text: hp.summarise(hs, nameMap()) })),
      h('span', { class: 'lv-tg', text: hs.attach ? `${hs.trigger} · @${hs.attach}` : hs.trigger }));
    return b;
  });

  return h('div', {},
    bar,
    h('div', { class: 'lv-hint', style: { margin: '8px 0' } },
      'Click to select · cmd/ctrl-click adds · shift-click a range · arrows nudge · Delete removes'),
    h('div', { class: 'lv-cols' },
      h('div', { class: 'lv-list' }, rows.length ? rows : h('div', { class: 'lv-none', text: 'No hotspots yet. Draw one on the ground, or attach one to a character.' })),
      h('div', { class: 'lv-insp' }, inspector(probs))));
}

function selectRow(id, i, e) {
  const list = doc()?.hotspots || [];
  if (e.shiftKey && S.primary) {
    const a = list.findIndex(x => x.id === S.primary), b = i;
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) S.sel.add(list[k].id);
  } else if (e.metaKey || e.ctrlKey) {
    S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id);
  } else {
    S.sel.clear();
    S.sel.add(id);
  }
  S.primary = id;
  syncOverlay();
  paint();
}

const selected = () => (doc()?.hotspots || []).find(x => x.id === S.primary) || null;

function withHotspot(id, fn, label, coalesce) {
  edit(d => {
    const t = (d.hotspots || []).find(x => x.id === id);
    if (t) fn(t);
  }, label, coalesce);
}

async function drawNew(kind) {
  if (!isLive()) return S.ctx.toast('load this level in the game before drawing in it', 'bad');
  const shape = await worldSession(S.ctx, {
    mode: 'draw', kind,
    hint: kind === 'rect' ? 'Drag out a rectangle on the ground.' : 'Press at the centre and pull out the radius.',
    onDraft: s => S.overlay?.setDraft(s, 0x6cc0ff),
  });
  if (!shape) return;
  addHotspot({ shape, attach: null });
}

function attachNew() {
  const cast = refs().characters;
  const ids = Object.keys(cast).filter(id => cast[id]?.body && cast[id].body !== 'none');
  if (!ids.length) return S.ctx.toast('no character in data/characters.json has a body to stand next to', 'bad');
  let who = ids[0];
  askRow('Which character?', select(ids.map(id => ({ v: id, label: `${cast[id].name} (${id})` })), who, v => { who = v; }),
    [btn('Add', () => { closeAsk(); addHotspot({ attach: who, r: 3, name: `Speak to ${cast[who].name}`, trigger: 'interact' }); }, 'primary'),
      btn('Cancel', closeAsk)]);
}

function addHotspot(over) {
  const list = doc()?.hotspots || [];
  const name = over.name || (over.attach ? `Near ${over.attach}` : 'New hotspot');
  const id = hp.newHotspotId(name, list.map(x => x.id));
  const hs = {
    id, name,
    attach: over.attach || null,
    r: over.attach ? (over.r || 3) : 0,
    shape: over.shape || null,
    trigger: over.trigger || 'enter',
    once: false, cooldown: 0, if: null, actions: [],
  };
  edit(d => { (d.hotspots ||= []).push(hs); }, `add ${id}`);
  S.sel.clear();
  S.sel.add(id);
  S.primary = id;
  syncOverlay();
  paint();
  S.host?.querySelector('[data-role=hsname]')?.focus();
}

async function editShapeInWorld() {
  const hs = selected();
  if (!hs || hs.attach) return;
  if (!isLive()) return S.ctx.toast('load this level in the game to drag it about', 'bad');
  await worldSession(S.ctx, {
    mode: 'edit',
    hint: `Drag the handles of “${hs.name}”.`,
    shape: () => (selected() || {}).shape,
    onHandle: (handle, x, z) => {
      const cur = selected();
      if (!cur) return;
      const next = hp.dragHandle(cur.shape, handle, x, z);
      withHotspot(cur.id, t => { t.shape = next; }, 'drag hotspot', true);
      S.overlay?.reshape(cur.id, next);
    },
    onCommit: () => syncOverlay(),
    onClick: (x, z) => {
      const hit = hp.pickHotspot(doc()?.hotspots || [], x, z, id => window.__wf?.characters?.at(id) || null);
      if (!hit) return;
      S.sel.clear();
      S.sel.add(hit.id);
      S.primary = hit.id;
      syncOverlay();
    },
  });
  paint();
}

function nudge(dx, dz) {
  for (const id of S.sel) {
    const hs = (doc()?.hotspots || []).find(x => x.id === id);
    if (!hs?.shape) continue;
    withHotspot(id, t => { t.shape = hp.moveShape(t.shape, dx, dz); }, 'nudge hotspot', true);
  }
  syncOverlay();
}

function removeSelected() {
  const ids = [...S.sel];
  if (!ids.length) return;
  confirmAsk(`Delete ${ids.length} hotspot${ids.length > 1 ? 's' : ''}?`,
    ids.join(', '), 'Delete', () => {
      edit(d => { d.hotspots = (d.hotspots || []).filter(x => !ids.includes(x.id)); }, 'delete hotspots');
      S.sel.clear();
      S.primary = null;
      syncOverlay();
      paint();
    });
}

function duplicateSelected(invert = false) {
  const hs = selected();
  if (!hs) return;
  const list = doc().hotspots || [];
  const copy = JSON.parse(JSON.stringify(hs));
  copy.name = invert ? `${hs.name} — otherwise` : `${hs.name} copy`;
  copy.id = hp.newHotspotId(copy.name, list.map(x => x.id));
  if (invert) copy.if = hs.if === null ? ['not', ['flag', 'set.me']] : (hs.if?.[0] === 'not' ? hs.if[1] : ['not', hs.if]);
  else if (copy.shape) copy.shape = hp.moveShape(copy.shape, 2, 2);
  edit(d => { d.hotspots.push(copy); }, invert ? 'add the opposite hotspot' : 'duplicate hotspot');
  S.sel.clear();
  S.sel.add(copy.id);
  S.primary = copy.id;
  syncOverlay();
  paint();
}

function onKey(e) {
  const overlayEl = document.getElementById('wf-dev');
  if (!S.host || !overlayEl || overlayEl.classList.contains('hidden') || overlayEl.classList.contains('lv-away')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
  if (S.sub !== 'hotspots' || !S.sel.size) return;
  const step = e.shiftKey ? 0.1 : e.altKey ? 2 : 0.5;
  const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (move) { e.preventDefault(); e.stopPropagation(); return nudge(move[0], move[1]); }
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); removeSelected(); }
}

// ── the inspector ──────────────────────────────────────────────────────────────────────────────

function inspector(probs) {
  const hs = selected();
  if (!hs) return h('div', { class: 'lv-none', text: 'Nothing selected. Pick a hotspot, or draw a new one.' });
  const r = refs();
  const p = probs.get(hs.id) || [];
  const set = (fn, label, coalesce) => withHotspot(hs.id, fn, label, coalesce);

  const out = h('div', {});
  if (S.sel.size > 1) {
    out.append(h('div', { class: 'lv-warn' },
      `${S.sel.size} selected — arrows nudge and Delete removes all of them. The fields below edit “${hs.name}”.`));
  }
  if (p.length) out.append(h('div', { class: 'lv-probs', text: p.map(x => `• ${x}`).join('\n') }));

  out.append(h('div', { class: 'lv-card' },
    h('h3', { text: 'What it is' }),
    field('Name', h('input', { type: 'text', value: hs.name || '', data: { role: 'hsname' },
      oninput: e => set(t => { t.name = e.target.value; }, 'rename hotspot', true) })),
    field('Id', h('code', { text: hs.id }), btn('Change…', () => renameHotspot(hs))),
    row(btn('Duplicate', () => duplicateSelected(false)),
      btn('Add the opposite (inverted if)', () => duplicateSelected(true)),
      btn('Delete', removeSelected, 'danger'))));

  out.append(whereCard(hs, set, r));
  out.append(whenCard(hs, set));
  out.append(predicateCard(hs, set));
  out.append(actionsCard(hs, set, r));
  return out;
}

function renameHotspot(hs) {
  textAsk('New id for this hotspot', hs.id, 'Change', v => {
    const id = String(v).trim();
    const taken = (doc().hotspots || []).map(x => x.id).filter(x => x !== hs.id);
    if (!id || taken.includes(id)) return S.ctx.toast('that id is empty or already used', 'bad');
    edit(d => { const t = d.hotspots.find(x => x.id === hs.id); if (t) t.id = id; }, 'rename hotspot id');
    S.sel.delete(hs.id);
    S.sel.add(id);
    S.primary = id;
    syncOverlay();
    paint();
  });
}

function whereCard(hs, set, r) {
  const cast = r.characters;
  const attachIds = Object.keys(cast);
  const card = h('div', { class: 'lv-card' }, h('h3', { text: 'Where it is' }),
    row(
      btn('A place on the ground', () => set(t => {
        t.attach = null;
        t.r = 0;
        t.shape = t.shape || { k: 'circle', x: playerAt().x, z: playerAt().z, r: 4 };
      }, 'place hotspot'), hs.attach ? '' : 'primary'),
      btn('On a character', () => set(t => {
        t.attach = t.attach || attachIds[0] || '';
        t.r = t.r || 3;
      }, 'attach hotspot'), hs.attach ? 'primary' : '')));

  if (hs.attach) {
    card.append(
      field('Character', select(attachIds.map(id => ({ v: id, label: `${cast[id]?.name || id} (${id})` })),
        hs.attach, v => set(t => { t.attach = v; }, 'attach hotspot'))),
      field('Reach', num(hs.r || 2.5, v => set(t => { t.r = Math.max(0.5, v); }, 'hotspot reach', true), { step: 0.5, min: 0.5 }), h('span', { class: 'lv-hint', text: 'metres' })),
      h('div', { class: 'lv-hint', text: 'The circle follows them about. This is how “clicking on a person” is authored — set the trigger below to interact or click.' }));
    return card;
  }

  const s = hs.shape || { k: 'circle', x: 0, z: 0, r: 4 };
  card.append(row(
    btn('Circle', () => set(t => { t.shape = hp.circleFrom(hp.centreOf(s), { x: hp.centreOf(s).x + hp.radiusOf(s), z: hp.centreOf(s).z }); }, 'circle hotspot'), s.k === 'circle' ? 'primary' : ''),
    btn('Rectangle', () => set(t => {
      const c = hp.centreOf(s), rr = hp.radiusOf(s);
      t.shape = hp.rectFrom({ x: c.x - rr, z: c.z - rr }, { x: c.x + rr, z: c.z + rr });
    }, 'rect hotspot'), s.k === 'rect' ? 'primary' : ''),
    h('span', { class: 'lv-grow' }),
    btn('Move & resize in the world', editShapeInWorld, 'primary'),
    btn('Draw it again', async () => {
      const shape = await worldSession(S.ctx, { mode: 'draw', kind: s.k,
        hint: 'Drag out the new shape.', onDraft: x => S.overlay?.setDraft(x, 0x6cc0ff) });
      if (shape) { set(t => { t.shape = shape; }, 'redraw hotspot'); syncOverlay(); paint(); }
    })));

  const f = (label, key, step = 0.5) => field(label,
    num(s[key], v => set(t => { t.shape = { ...t.shape, [key]: v }; }, 'hotspot size', true), { step }));
  if (s.k === 'circle') card.append(row(f('Centre x', 'x'), f('z', 'z'), f('Radius', 'r')));
  else card.append(row(f('x from', 'x0'), f('to', 'x1')), row(f('z from', 'z0'), f('to', 'z1')));
  // Walking to the spot and pressing this beats dragging roughly and then typing three numbers,
  // which was the only way to place one precisely.
  card.append(row(
    btn('Put it where I am stood', () => {
      const p = playerAt();
      set(t => { t.shape = hp.moveShape(t.shape, p.x - hp.centreOf(t.shape).x, p.z - hp.centreOf(t.shape).z); },
        'hotspot to the player');
      syncOverlay();
      paint();
    }),
    h('span', { class: 'lv-hint', text: `the player is at ${playerAt().x}, ${playerAt().z}` })));
  return card;
}

function whenCard(hs, set) {
  return h('div', { class: 'lv-card' }, h('h3', { text: 'When it fires' }),
    field('Trigger', select(hp.TRIGGERS, hs.trigger, v => set(t => { t.trigger = v; }, 'hotspot trigger')),
      h('span', { class: 'lv-hint', text: TRIGGER_NOTE[hs.trigger] || '' })),
    field('Repeat', check('only once, ever', hs.once, v => set(t => { t.once = v; }, 'hotspot once')),
      h('span', { class: 'lv-hint', text: 'cooldown' }),
      num(hs.cooldown || 0, v => set(t => { t.cooldown = Math.max(0, v); }, 'hotspot cooldown', true), { step: 0.5, min: 0 }),
      h('span', { class: 'lv-hint', text: 'seconds between firings' })));
}

const TRIGGER_NOTE = {
  enter: 'the moment the player crosses in',
  exit: 'the moment the player leaves',
  click: 'tapped, or the reach prompt',
  interact: 'the reach prompt / interact button',
  always: 'every frame the player is inside — use a cooldown',
};

// The locked-door pattern is a predicate and its inverse, so the common shapes are buttons and the
// raw array is still there underneath for anything else.
function predicateCard(hs, set) {
  const p = hs.if;
  const kind = p === null || p === undefined ? 'always'
    : Array.isArray(p) && p[0] === 'flag' && p.length === 2 ? 'flagOn'
      : Array.isArray(p) && p[0] === 'not' && Array.isArray(p[1]) && p[1][0] === 'flag' ? 'flagOff'
        : Array.isArray(p) && p[0] === 'item' ? 'item' : 'custom';
  const flagName = kind === 'flagOn' ? p[1] : kind === 'flagOff' ? p[1][1] : '';
  const card = h('div', { class: 'lv-card' }, h('h3', { text: 'Only if' }));

  card.append(field('Condition', select([
    { v: 'always', label: 'always — no condition' },
    { v: 'flagOn', label: 'a flag is set' },
    { v: 'flagOff', label: 'a flag is not set' },
    { v: 'item', label: 'the player has an item' },
    { v: 'custom', label: 'something else (raw predicate)' },
  ], kind, v => set(t => {
    if (v === 'always') t.if = null;
    else if (v === 'flagOn') t.if = ['flag', flagName || 'door.unlocked'];
    else if (v === 'flagOff') t.if = ['not', ['flag', flagName || 'door.unlocked']];
    else if (v === 'item') t.if = ['item', 'key', 1];
    else t.if = t.if ?? ['all'];
  }, 'hotspot condition'))));

  if (kind === 'flagOn' || kind === 'flagOff') {
    card.append(field('Flag', text(flagName, v => set(t => {
      t.if = kind === 'flagOn' ? ['flag', v] : ['not', ['flag', v]];
    }, 'hotspot condition', true), { placeholder: 'door.unlocked' })));
  } else if (kind === 'item') {
    card.append(row(field('Item', text(p[1] || '', v => set(t => { t.if = ['item', v, p[2] ?? 1]; }, 'hotspot condition', true))),
      field('at least', num(p[2] ?? 1, v => set(t => { t.if = ['item', p[1] || '', v]; }, 'hotspot condition', true), { step: 1, min: 1 }))));
  } else if (kind === 'custom') {
    const ta = h('textarea', { spellcheck: false, value: JSON.stringify(p) });
    const err = h('div', { class: 'lv-hint' });
    ta.oninput = () => {
      let v;
      try { v = JSON.parse(ta.value); } catch (e) { err.textContent = `not JSON — ${e.message}`; return; }
      const bad = validatePred(v);
      err.textContent = bad.length ? bad.join('; ') : 'valid';
      if (!bad.length) set(t => { t.if = v; }, 'hotspot condition', true);
    };
    card.append(ta, err,
      h('div', { class: 'lv-hint', text: 'Terms: all, any, not, quest, flag, item, day, hour — js/game/predicate.js' }));
  }
  return card;
}

// ── actions ────────────────────────────────────────────────────────────────────────────────────

function actionsCard(hs, set, r) {
  const card = h('div', { class: 'lv-card' }, h('h3', { text: 'Then, in order' }));
  const acts = hs.actions || [];
  acts.forEach((a, i) => card.append(actionCard(hs, a, i, set, r)));
  if (!acts.length) card.append(h('div', { class: 'lv-none', text: 'Nothing happens yet — add an action.' }));
  card.append(row(...hp.VERB_IDS.map(k =>
    btn(`＋ ${k}`, () => set(t => { (t.actions ||= []).push(hp.newAction(k)); }, `add ${k}`)))));
  return card;
}

function actionCard(hs, a, i, set, r) {
  const upd = fn => set(t => { fn(t.actions[i]); }, `edit ${a.k}`, true);
  const card = h('div', { class: 'lv-act', style: { borderLeftColor: hp.hex(hp.VERB_COLOUR[a.k] || hp.BROKEN_COLOUR) } },
    row(h('span', { class: 'lv-n', text: `${i + 1}.` }),
      select(hp.VERB_IDS, a.k, v => set(t => { t.actions[i] = hp.newAction(v); }, 'change action')),
      h('span', { class: 'lv-grow' }),
      btn('↑', () => set(t => { if (i > 0) [t.actions[i - 1], t.actions[i]] = [t.actions[i], t.actions[i - 1]]; }, 'reorder actions')),
      btn('↓', () => set(t => { if (i < t.actions.length - 1) [t.actions[i + 1], t.actions[i]] = [t.actions[i], t.actions[i + 1]]; }, 'reorder actions')),
      btn('⧉', () => set(t => { t.actions.splice(i + 1, 0, JSON.parse(JSON.stringify(a))); }, 'duplicate action')),
      btn('✕', () => set(t => { t.actions.splice(i, 1); }, 'remove action'), 'danger')));

  if (a.k === 'say') {
    const nodes = Object.entries(r.conversations).map(([id, n]) => ({ v: id, label: `${n?.name || id} — ${id}` }));
    const missing = a.node && !r.conversations[a.node];
    card.append(field('Conversation', select(nodes, a.node, v => upd(x => { x.node = v; }), { placeholder: '— pick a node —' })),
      row(btn(missing ? `Create “${a.node}” →` : 'Edit this conversation →', () => editConversation(a.node), 'primary'),
        btn('New node…', () => newConversationNode(node => upd(x => { x.node = node; }))),
        missing
          // A conversation rename does not rewrite level hotspots, so this is the state a hotspot
          // is left in afterwards: say so, and the picker above is how it gets repointed.
          ? h('span', { class: 'lv-probs', style: { margin: '0', padding: '4px 8px' },
            text: `there is no node “${a.node}” — pick another above, or create it` })
          : null));
  }
  if (a.k === 'goto') {
    const target = a.level;
    card.append(field('Level', select((S.ids || []).map(id => ({ v: id, label: id })), target,
      v => upd(x => { x.level = v; }), { placeholder: '— pick a level —' })));
    const at = a.at || { x: 0, z: 0, yaw: Math.PI };
    card.append(row(
      field('Land at x', num(at.x, v => upd(x => { x.at = { ...at, x: v }; }))),
      field('z', num(at.z, v => upd(x => { x.at = { ...at, z: v }; }))),
      field('facing°', num(io.yawDegrees(at.yaw ?? Math.PI), v => upd(x => { x.at = { ...at, yaw: v * Math.PI / 180 }; }), { step: 5 }))));
    card.append(row(
      target === liveId()
        ? btn('Pick the landing point in the world', async () => {
          const g = await worldSession(S.ctx, { mode: 'point', facing: true,
            hint: 'Click where the player lands.', onDraft: s => S.overlay?.setDraft(s, 0xffa23a) });
          if (g) upd(x => { x.at = { x: +g.at.x.toFixed(2), z: +g.at.z.toFixed(2), yaw: io.yawTowards(g.at, g.look) }; });
          paint();
        }, 'primary')
        : h('span', { class: 'lv-hint', text: target ? `Load ${target} in the game to click its landing point.` : '' }),
      target ? btn(`Use ${target}’s player start`, () => {
        const e = (S.ctx.data.get('levelIndex') || []).find(x => x.id === target);
        const st = e?.start || S.ctx.data.get('levels', target)?.start;
        if (!st) return S.ctx.toast(`${target} has no start in the index`, 'bad');
        upd(x => { x.at = { x: st.x, z: st.z, yaw: st.yaw }; });
        paint();
      }) : null));
  }
  if (a.k === 'music') {
    const sets = (S.ctx.data.get('music')?.sets || []).map(s => ({ v: s.id, label: `${s.label || s.id} (${s.id})` }));
    card.append(field('Set', select(sets, a.stop ? '' : a.set, v => upd(x => { delete x.stop; x.set = v; }), { placeholder: '— pick a set —' })),
      field('or', check('stop the music', !!a.stop, v => upd(x => { if (v) { x.stop = true; delete x.set; } else { delete x.stop; x.set = ''; } }))),
      sets.length ? null : h('div', { class: 'lv-hint', text: 'data/music.json has no sets yet — the audio agent is filling them in. Authoring one now is fine; the id is the contract.' }));
  }
  if (a.k === 'flag') {
    card.append(row(field('Flag', text(a.name || '', v => upd(x => { x.name = v; }), { placeholder: 'academy.doorway.seen' })),
      field('Value', select([{ v: 'true', label: 'true' }, { v: 'false', label: 'false' }],
        String(a.value ?? true), v => upd(x => { x.value = v === 'true'; })))));
  }
  if (a.k === 'bark') {
    const ids = Object.keys(r.characters);
    card.append(row(field('Who', select(ids.map(id => ({ v: id, label: r.characters[id]?.name || id })), a.who,
      v => upd(x => { x.who = v; }), { placeholder: '— pick —' })),
    field('Category', select(BARK_CATEGORIES, a.category || 'idle', v => upd(x => { x.category = v; })))));
  }
  if (a.k === 'event') {
    const ta = h('textarea', { spellcheck: false, value: JSON.stringify(a.data || {}) });
    const err = h('div', { class: 'lv-hint' });
    ta.oninput = () => {
      try { const v = JSON.parse(ta.value); err.textContent = ''; upd(x => { x.data = v; }); }
      catch (e) { err.textContent = `not JSON — ${e.message}`; }
    };
    card.append(field('Name', text(a.name || '', v => upd(x => { x.name = v; }), { placeholder: 'academy.doorway' })),
      field('Data', ta), err,
      h('div', { class: 'lv-hint', text: 'Dispatched on window.__wf.game.bus as a CustomEvent.' }));
  }
  return card;
}

// The handoff to the conversation tab, agreed with its owner. hub.show() drops any second
// argument, so the node id goes through their own entry point; a node that does not exist yet
// opens their "create it" banner, which is why nothing is pre-created here.
function editConversation(nodeId) {
  if (!nodeId) return S.ctx.toast('pick a conversation node first, or make a new one', 'warn');
  window.__wfConvo?.open(nodeId);
  if (window.__wfDev) window.__wfDev.jump = { tab: 'convo', node: nodeId, from: 'level', level: S.id, at: Date.now() };
  S.ctx.hub.show('convo');
}

function newConversationNode(onMade) {
  const base = `${S.id}.${(selected()?.name || 'talk').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
  textAsk('Id for the new conversation node', base, 'Use this id', v => {
    const id = String(v).trim();
    if (!id) return;
    onMade(id);
    paint();
    editConversation(id);
  });
}

// ── start & level ──────────────────────────────────────────────────────────────────────────────

const playerAt = () => {
  const p = window.__wf?.player?.pos;
  return p ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2) } : { x: 0, z: 0 };
};

function startPanel() {
  const d = doc();
  const st = d?.start || { x: 0, z: 0, yaw: Math.PI };
  const setStart = (fn, label) => edit(x => { x.start = { ...x.start, ...fn(x.start) }; }, label, true);
  const sets = (S.ctx.data.get('music')?.sets || []).map(s => ({ v: s.id, label: `${s.label || s.id} (${s.id})` }));
  const idx = S.ctx.data.get('levelIndex') || [];
  const pos = idx.findIndex(e => e.id === S.id);

  return h('div', {},
    h('div', { class: 'lv-card' }, h('h3', { text: 'Where the player starts' }),
      row(btn('Set it by clicking in the world', async () => {
        if (!isLive()) return S.ctx.toast('load this level in the game first', 'bad');
        const g = await worldSession(S.ctx, { mode: 'point', facing: true,
          hint: 'Click where the player spawns.', onDraft: s => S.overlay?.setDraft(s, 0x66dd88) });
        if (!g) return;
        edit(x => { x.start = { x: +g.at.x.toFixed(2), z: +g.at.z.toFixed(2), yaw: io.yawTowards(g.at, g.look) }; }, 'set the player start');
        paint();
      }, 'primary'),
      btn('Put it where the player is standing', () => {
        const p = window.__wf?.player;
        if (!p) return S.ctx.toast('no player in the world', 'bad');
        edit(x => { x.start = { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +(p.moveYaw ?? p.yaw).toFixed(5) }; }, 'set the player start');
        paint();
      }),
      btn('Send the player there now', () => {
        const p = window.__wf?.player;
        if (!p) return;
        p.pos.x = st.x;
        p.pos.z = st.z;
        p.pos.y = p.groundY(st.x, st.z);
        p.yaw = p.camYaw = p.moveYaw = st.yaw;
      })),
      row(field('x', num(st.x, v => setStart(() => ({ x: v }), 'player start'))),
        field('z', num(st.z, v => setStart(() => ({ z: v }), 'player start'))),
        field('facing°', num(io.yawDegrees(st.yaw), v => setStart(() => ({ yaw: v * Math.PI / 180 }), 'player start'), { step: 5 }))),
      h('div', { class: 'lv-hint', text: 'Facing 180° looks down −z, which is towards the academy. The index carries a copy of this, so it is written to both files.' })),

    h('div', { class: 'lv-card' }, h('h3', { text: 'The level' }),
      field('Name', text(d?.name || '', v => edit(x => { x.name = v; }, 'rename level', true))),
      field('Default music', select(sets, d?.music || '', v => edit(x => { x.music = v || null; }, 'level music'), { placeholder: '— none —' })),
      field('Id', h('code', { text: S.id }), btn('Change it…', changeLevelId),
        h('span', { class: 'lv-hint', text: 'the id is the filename, the index key and every goto target — all of them are rewritten' })),
      field('Opens first?', h('span', { class: 'lv-hint',
        text: pos === 0 ? 'yes — this is index[0], the level the game boots into' : `no — it is #${pos + 1} in data/levels/index.json` }),
      btn('Move up', () => moveInIndex(-1)), btn('Move down', () => moveInIndex(1)))),

    h('div', { class: 'lv-card' }, h('h3', { text: 'Write it out' }),
      row(btn('Save this level', save, 'primary'),
        btn('Save the index too', async () => { await writeIndex(doc()); paint(); }),
        btn('Revert to the file on disk', () => {
          const r = S.ctx.data.revert('levels', S.id);
          S.ctx.toast(r.ok ? 'reverted' : r.error, r.ok ? 'good' : 'bad');
          paint();
        }),
        btn('Download a copy', () => S.ctx.data.download('levels', S.id)))));
}

function moveInIndex(delta) {
  const idx = S.ctx.data.get('levelIndex') || [];
  S.ctx.data.set('levelIndex', io.indexMove(idx, S.id, delta), null, { label: 'reorder levels' });
  S.ctx.data.save('levelIndex').then(() => paint());
}

// ── objects: tone and lettering ────────────────────────────────────────────────────────────────

function objectPanel() {
  const d = doc();
  const objs = d?.objects || [];
  const e = ed();
  const canBuild = isLive() && !!e;

  const wrap = h('div', {});
  if (!canBuild) {
    wrap.append(h('div', { class: 'lv-warn' },
      'This level is not the one the game has loaded, so changes here go into the file but nothing rebuilds on screen.'));
  }

  const picked = objs.filter(o => S.objSel.has(o.id));
  const allAre = z => picked.length && picked.every(o => o.zone === z);
  const tone = row(h('span', { class: 'lv-hint', text: `${S.objSel.size} selected · tone:` }),
    ...ZONE_IDS.map(z => btn(zone(z).label, () => setTone(z), allAre(z) ? 'primary' : '')),
    h('span', { class: 'lv-grow' }),
    btn('Pick one in the world', pickObjectInWorld, canBuild ? 'primary' : ''),
    btn('Select all', () => { for (const o of objs) S.objSel.add(o.id); paint(); }),
    btn('Clear', () => { S.objSel.clear(); paint(); }));
  wrap.append(tone);
  wrap.append(h('div', { class: 'lv-hint', style: { margin: '8px 0' } },
    'Tone is the stone and timber set an object is dressed in — light, neutral or dark. It is per object, so a pale castle can stand in a neutral district.'));

  const list = h('div', { class: 'lv-list', style: { flex: '0 0 380px' } }, objs.map(o => {
    const dz = d.districts?.[o.dist]?.zone || 'neutral';
    return h('button', { class: `lv-hs ${S.objSel.has(o.id) ? 'on' : ''}`,
      onclick: ev => {
        if (!(ev.metaKey || ev.ctrlKey || ev.shiftKey)) S.objSel.clear();
        S.objSel.has(o.id) ? S.objSel.delete(o.id) : S.objSel.add(o.id);
        if (canBuild) e.selectById(o.id);
        paint();
      } },
    h('span', { class: 'lv-sw', style: { background: TONE_SWATCH[o.zone] || '#888' } }),
    h('span', { class: 'lv-nm' }, h('b', { text: `#${o.id} ${TYPES[o.type]?.label || o.type}` }),
      h('em', { text: `${o.x.toFixed(1)}, ${o.z.toFixed(1)} · ${zone(o.zone).label} in a ${zone(dz).label.toLowerCase()} district${o.zone === dz ? '' : ' — override'}` })),
    h('span', { class: 'lv-tg', text: o.lod || 'auto' }));
  }));

  const boards = io.textObjects(d);
  const right = h('div', { class: 'lv-insp' },
    h('div', { class: 'lv-card' }, h('h3', { text: 'Lettering' }),
      boards.length ? boards.map(b => field(`#${b.id} ${b.label}`,
        h('input', { type: 'text', value: b.value, maxlength: 120,
          oninput: ev => setBoardText(b, ev.target.value),
          onchange: () => canBuild && e.rebuildObject(b.id) }),
        b.inside ? h('span', { class: 'lv-hint', text: `inside #${b.inside}` }) : null))
        : h('div', { class: 'lv-none', text: 'No signs or billboards in this level.' }),
      h('div', { class: 'lv-hint', text: 'The board is redrawn when you leave the field — the lettering is baked to a texture.' })));

  wrap.append(h('div', { class: 'lv-cols' }, list, right));
  return wrap;
}

const TONE_SWATCH = { light: '#e8e0cf', neutral: '#b9a888', dark: '#5a5560' };

function setTone(z) {
  const ids = [...S.objSel];
  if (!ids.length) return S.ctx.toast('select an object first', 'warn');
  const e = ed();
  if (isLive() && e) {
    const n = e.setZoneMany(ids, z);
    S.ctx.toast(`${n} object${n === 1 ? '' : 's'} retoned ${zone(z).label.toLowerCase()}`, 'good');
    return;
  }
  edit(d => { for (const o of d.objects) if (S.objSel.has(o.id)) o.zone = z; }, 'retone objects');
  paint();
}

function setBoardText(b, v) {
  const e = ed();
  if (isLive() && e?.setObjectString(b.id, b.key, v)) return;
  edit(d => { const o = d.objects.find(x => x.id === b.id); if (o) o.p[b.key] = String(v).slice(0, 120); }, 'board text', true);
}

async function pickObjectInWorld() {
  if (!isLive() || !ed()) return S.ctx.toast('load this level in the game first', 'bad');
  await worldSession(S.ctx, {
    mode: 'edit',
    hint: 'Click a building to select it.',
    shape: () => null,
    onClick: () => {},
    onObject: o => { S.objSel.clear(); S.objSel.add(o.id); ed().select(o); },
  });
  paint();
}

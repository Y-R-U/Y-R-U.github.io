// The live save document: flags, items, quests, settings, and the slots savestore.js keeps.
// Editing is the point of the panel, so everything that cannot be undone asks first.

import { blank } from '../../../game/save.js';
import { slots, saveSlot, loadSlot, deleteSlot, clear as clearSave, load as loadSave } from '../../../game/savestore.js';
import { handles } from '../game.js';
import { h, section, table, button, danger, clear, download, num } from '../ui.js';

export const panel = {
  id: 'save',
  label: 'Save',

  mount(el, ctx) {
    const head = h('div');
    const flags = h('div');
    const items = h('div');
    const settings = h('div');
    const slotBox = h('div');
    const importBox = h('textarea');
    importBox.placeholder = 'paste a save document here, then press Replace';
    importBox.style.minHeight = '120px';

    el.append(
      section('Live save', head),
      h('div', 'dbg-cols',
        section('Flags', flags),
        section('Items & quests', items)),
      section('Settings', settings),
      section('Slots', slotBox),
      section('Import / reset', importBox, (() => {
        const r = h('div', 'row');
        r.append(
          danger('Replace the live save', () => replace(ctx, importBox, paint)),
          button('Export', '', () => {
            const doc = docOf(ctx);
            if (!doc) return ctx.toast('no save', 'warn');
            download(`wf-save-${Date.now()}.json`, JSON.stringify(doc, null, 2));
          }),
          danger('Reset to a new save', () => {
            const g = handles(ctx);
            if (!g.session) return ctx.toast('no session', 'warn');
            Object.assign(g.session.doc, blank(Date.now()));
            g.session.doc.level = g.level?.id || null;
            g.session.applySettings?.();
            g.session.autosave?.flush?.();
            ctx.toast('save reset', 'good');
            paint();
          }),
          danger('Clear browser save', () => {
            clearSave();
            ctx.toast('wf.save deleted', 'good');
            paint();
          }),
        );
        return r;
      })()));

    function paint() {
      const g = handles(ctx);
      const doc = docOf(ctx);
      clear(head);
      if (!doc) return void head.append(h('div', 'empty', 'no session — start the game, then reopen this'));
      const stored = loadSave();
      head.append(table(null, [
        ['level', doc.level || '—'],
        ['position', doc.at ? `${num(doc.at.x, 1)}, ${num(doc.at.z, 1)} · yaw ${num(doc.at.yaw, 2)}` : 'not written yet'],
        ['played', `${(doc.played / 60).toFixed(1)} min`],
        ['created', doc.created ? new Date(doc.created).toLocaleString() : '—'],
        ['autosave', g.session?.autosave
          ? `${g.session.autosave.writes} writes, ${g.session.autosave.skipped} skipped${g.session.autosave.blocked ? ' · BLOCKED' : ''}`
          : '—'],
        ['in localStorage', stored?.doc
          ? { html: `yes — ${stored.warnings?.length ? stored.warnings.join('; ') : 'clean'}`, cls: 'good' }
          : { html: stored?.error || 'nothing stored', cls: 'warnc' }],
      ]));
      const bar = h('div', 'row');
      bar.append(
        button('Force autosave now', 'primary', () => {
          const ok = g.session?.autosave?.flush?.();
          ctx.toast(ok ? 'written to localStorage' : 'nothing changed since the last write', ok ? 'good' : '');
          paint();
        }),
        button('Reload the panel', '', paint));
      head.append(bar);

      paintFlags(doc);
      paintItems(doc);
      clear(settings).append(table(['setting', 'value'], Object.entries(doc.settings || {})
        .map(([k, v]) => [k, String(v)])));
      paintSlots(doc);
    }

    function paintFlags(doc) {
      clear(flags);
      const list = Object.entries(doc.flags || {});
      for (const [k, v] of list) {
        const row = h('div', 'dbg-flag');
        const box = h('input');
        box.type = 'checkbox';
        box.checked = v !== false && v !== 0 && v !== '';
        box.onchange = () => { doc.flags[k] = box.checked; ctx.toast(`${k} = ${box.checked}`); };
        row.append(box, h('span', null, k), h('span', 'dim', typeof v));
        row.append(danger('✕', () => {
          delete doc.flags[k];
          paintFlags(doc);
        }, 'sure?'));
        flags.append(row);
      }
      if (!list.length) flags.append(h('div', 'dim', 'no flags set'));
      const add = h('div', 'row');
      const name = h('input');
      name.type = 'text';
      name.placeholder = 'flag name';
      add.append(name, button('Set true', '', () => {
        const n = name.value.trim();
        if (!n) return;
        doc.flags[n] = true;
        name.value = '';
        paintFlags(doc);
      }));
      flags.append(add);
    }

    function paintItems(doc) {
      clear(items).append(
        h('h3', 'dbg-note', 'items'),
        table(null, Object.entries(doc.items || {}).map(([k, v]) => [k, String(v)])),
        h('h3', 'dbg-note', 'quests'),
        table(null, Object.entries(doc.quests || {}).map(([k, v]) => [k, `${v.s} (${v.n})`])));
      if (!Object.keys(doc.items || {}).length && !Object.keys(doc.quests || {}).length) {
        items.append(h('div', 'dim', 'nothing carried, nothing started'));
      }
    }

    function paintSlots(doc) {
      clear(slotBox);
      const names = slots();
      slotBox.append(table(['slot', ''], names.map(n => [n, {
        html: '<span class="dim">use the buttons below</span>',
      }])));
      const bar = h('div', 'row');
      const name = h('input');
      name.type = 'text';
      name.placeholder = 'slot name';
      bar.append(name,
        button('Save to slot', '', () => {
          const n = name.value.trim();
          if (!n) return ctx.toast('name the slot first', 'warn');
          ctx.toast(saveSlot(n, doc) ? `saved slot ${n}` : 'slot write failed', 'good');
          paintSlots(doc);
        }));
      for (const n of names) {
        bar.append(danger(`Load ${n}`, () => {
          const r = loadSlot(n);
          if (!r?.doc) return ctx.toast(r?.error || 'slot is empty', 'bad');
          Object.assign(docOf(ctx), r.doc);
          handles(ctx).session?.applySettings?.();
          ctx.toast(`loaded slot ${n} — walk a step for it to settle`, 'good');
          paint();
        }));
        bar.append(danger(`✕ ${n}`, () => {
          deleteSlot(n);
          paintSlots(doc);
        }, 'sure?'));
      }
      slotBox.append(bar);
    }

    paint();
  },
};

const docOf = ctx => handles(ctx).session?.doc || null;

function replace(ctx, box, paint) {
  const doc = docOf(ctx);
  if (!doc) return ctx.toast('no session', 'warn');
  let raw;
  try { raw = JSON.parse(box.value); } catch (e) { return ctx.toast(`not JSON: ${e.message}`, 'bad'); }
  // Through the game's own normaliser, so a hand-written document cannot put a value in the save
  // that the game would never have written itself.
  import('../../../game/save.js').then(({ normalise }) => {
    const r = normalise(raw);
    if (!r.doc) return ctx.toast(r.error, 'bad');
    Object.assign(doc, r.doc);
    handles(ctx).session?.applySettings?.();
    ctx.toast(`replaced${r.warnings.length ? ` — ${r.warnings.join('; ')}` : ''}`, 'good');
    paint();
  });
}

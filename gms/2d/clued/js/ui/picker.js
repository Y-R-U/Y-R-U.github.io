// Theme picker: "All" by default, or a Theme -> packs tree with multi-select. Unsupported packs are greyed with a reason.
import { h } from './kit.js?v=202610050144';
import { getIndex } from '../core/packs.js?v=202610050144';
import { supportsPack } from '../formats/registry.js?v=202610050144';

export function themePicker(host, { fmt, selected = 'all', kids = false, onChange = () => {} } = {}) {
  const index = getIndex();
  let sel = selected === 'all' || !Array.isArray(selected) ? 'all' : new Set(selected);
  const why = id => {
    const info = index.packs[id];
    if (!info) return 'Missing';
    if (kids && info.kidsSafe === false) return 'Not in kids mode';
    return fmt ? supportsPack(fmt, info, { kids }) : true;
  };
  const okIds = Object.keys(index.packs).filter(id => why(id) === true);
  if (sel !== 'all') { sel = new Set([...sel].filter(id => okIds.includes(id))); if (!sel.size) sel = 'all'; }

  const sumIco = h('span.ts-ico', {}, '🌈');
  const sumTxt = h('span.ts-txt');
  const toggle = h('button.btn.small', { type: 'button' }, 'Choose themes');
  const summary = h('div.theme-sum', {}, sumIco, sumTxt, toggle);
  const tree = h('div.tree', { hidden: true });
  const panel = h('div.panel.picker', {}, summary, tree);
  host.append(panel);

  toggle.addEventListener('click', () => { tree.hidden = !tree.hidden; toggle.textContent = tree.hidden ? 'Choose themes' : 'Done'; if (!tree.hidden) draw(); });

  function value() { return sel === 'all' ? 'all' : [...sel]; }
  function drawSummary() {
    if (sel === 'all') {
      sumIco.textContent = '🌈';
      const n = okIds.filter(id => !index.packs[id].virtual).length;
      sumTxt.innerHTML = `<b>All themes</b><small>${n} pack${n === 1 ? '' : 's'} can play this</small>`;
    } else {
      const names = [...sel].map(id => index.packs[id]?.title).filter(Boolean);
      sumIco.textContent = index.packs[[...sel][0]]?.icon || '🎯';
      sumTxt.innerHTML = '';
      sumTxt.append(h('b', {}, `${names.length} pack${names.length === 1 ? '' : 's'}`), h('small', {}, names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '')));
    }
  }
  function set(next) {
    sel = next;
    if (sel !== 'all' && !sel.size) sel = 'all';
    drawSummary(); draw(); onChange(value());
  }
  function draw() {
    if (tree.hidden) return;
    const open = new Set([...tree.querySelectorAll('.th.open')].map(n => n.dataset.theme));
    tree.innerHTML = '';
    const allTick = h('input.tick', { type: 'checkbox', 'aria-label': 'All themes' });
    allTick.checked = sel === 'all';
    allTick.addEventListener('change', () => set(allTick.checked ? 'all' : new Set()));
    tree.append(h('label.tree-all', {}, allTick, h('span', {}, '🌈 All themes'), h('small.muted', { style: { marginLeft: 'auto' } }, 'mixes everything')));
    for (const t of index.themes) {
      const ids = t.packs.filter(id => index.packs[id]);
      if (!ids.length) continue;
      const usable = ids.filter(id => why(id) === true);
      const on = sel === 'all' ? [] : usable.filter(id => sel.has(id));
      const tt = h('input.tick', { type: 'checkbox', 'aria-label': t.title, disabled: !usable.length });
      tt.checked = on.length > 0 && on.length === usable.length;
      if (on.length && on.length < usable.length) tt.classList.add('part');
      tt.addEventListener('change', () => {
        const s = sel === 'all' ? new Set() : new Set(sel);
        usable.forEach(id => (tt.checked ? s.add(id) : s.delete(id)));
        set(s);
      });
      const exp = h('button.th-exp', { type: 'button', 'aria-label': `Show ${t.title} packs` }, '›');
      const box = h('div.th', { class: open.has(t.id) ? 'open' : '', dataset: { theme: t.id } },
        h('div.th-row', {}, tt, h('span.th-ico', {}, t.icon || '•'), h('span.th-name', {}, t.title),
          h('span.th-count', {}, usable.length < ids.length ? `${usable.length}/${ids.length}` : `${ids.length}`), exp));
      exp.addEventListener('click', () => box.classList.toggle('open'));
      box.querySelector('.th-name').addEventListener('click', () => box.classList.toggle('open'));
      const list = h('div.th-packs');
      for (const id of ids) {
        const info = index.packs[id];
        const w = why(id);
        const pt = h('input.tick', { type: 'checkbox', disabled: w !== true, 'aria-label': info.title });
        pt.checked = w === true && sel !== 'all' && sel.has(id);
        pt.addEventListener('change', () => {
          const s = sel === 'all' ? new Set() : new Set(sel);
          pt.checked ? s.add(id) : s.delete(id);
          set(s);
        });
        list.append(h('label.pk', { class: w === true ? '' : 'off' }, pt, h('span', {}, info.icon || '•'),
          h('span.pk-name', {}, info.title, w === true ? null : h('span.pk-why', {}, w))));
      }
      box.append(list);
      tree.append(box);
    }
  }
  drawSummary();
  return { value, el: panel, usableCount: okIds.length };
}

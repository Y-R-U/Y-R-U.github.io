// Theme picker: "All" by default, or a Theme -> packs tree with multi-select. Packs that can't play this format are
// hidden (and themes left empty); one quiet line at the bottom lists them, grouped by reason, for the curious.
import { h } from './kit.js?v=202610100547';
import { getIndex } from '../core/packs.js?v=202610100547';
import { supportsPack, NOT_ENOUGH } from '../formats/registry.js?v=202610100547';

const shortWhy = (w, kids) => (w === NOT_ENOUGH ? (kids ? 'Not enough easy questions for this game yet' : 'Too few questions for this game yet') : w);

// [{ reason, packs: [{ id, title, icon }…] }] for packs this format can't use (kids mode leaves out grown-up packs entirely).
export function hiddenPacks(index, why, kids) {
  const groups = new Map();
  for (const t of index.themes) for (const id of t.packs) {
    const info = index.packs[id];
    if (!info || (kids && info.kidsSafe === false)) continue;
    const w = why(id);
    if (w === true) continue;
    const r = shortWhy(w, kids);
    if (!groups.has(r)) groups.set(r, []);
    if (!groups.get(r).some(p => p.id === id)) groups.get(r).push({ id, title: info.title, icon: info.icon });
  }
  return [...groups].map(([reason, packs]) => ({ reason, packs })).sort((a, b) => b.packs.length - a.packs.length);
}

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
  const hidden = fmt ? hiddenPacks(index, why, kids) : [];
  let hidOpen = false;

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
      const usable = t.packs.filter(id => index.packs[id] && why(id) === true);
      if (!usable.length) continue;
      const on = sel === 'all' ? [] : usable.filter(id => sel.has(id));
      const tt = h('input.tick', { type: 'checkbox', 'aria-label': t.title });
      tt.checked = on.length > 0 && on.length === usable.length;
      if (on.length && on.length < usable.length) tt.classList.add('part');
      tt.addEventListener('change', () => {
        const s = sel === 'all' ? new Set() : new Set(sel);
        usable.forEach(id => (tt.checked ? s.add(id) : s.delete(id)));
        set(s);
      });
      const exp = h('button.th-exp', { type: 'button', 'aria-label': `Show ${t.title} packs` }, '›');
      const box = h('div.th', { class: open.has(t.id) ? 'open' : '', dataset: { theme: t.id } },
        h('div.th-row', {}, tt, h('span.th-ico', {}, t.icon || '•'), h('span.th-name', {}, t.title), h('span.th-count', {}, `${usable.length}`), exp));
      exp.addEventListener('click', () => box.classList.toggle('open'));
      box.querySelector('.th-name').addEventListener('click', () => box.classList.toggle('open'));
      const list = h('div.th-packs');
      for (const id of usable) {
        const info = index.packs[id];
        const pt = h('input.tick', { type: 'checkbox', 'aria-label': info.title });
        pt.checked = sel !== 'all' && sel.has(id);
        pt.addEventListener('change', () => {
          const s = sel === 'all' ? new Set() : new Set(sel);
          pt.checked ? s.add(id) : s.delete(id);
          set(s);
        });
        list.append(h('label.pk', {}, pt, h('span', {}, info.icon || '•'), h('span.pk-name', {}, info.title)));
      }
      box.append(list);
      tree.append(box);
    }
    if (hidden.length) tree.append(hiddenNote());
  }
  function hiddenNote() {
    const n = hidden.reduce((a, g) => a + g.packs.length, 0);
    const more = h('div.hid-list', { hidden: !hidOpen },
      ...hidden.map(g => h('p.hid-g', {}, h('b', {}, g.reason), g.packs.map(p => p.title).join(', '))));
    const btn = h('button.hid-more', { type: 'button', 'aria-expanded': String(hidOpen) },
      `${n} more topic${n === 1 ? '' : 's'} ${n === 1 ? "doesn't" : "don't"} suit this game`, h('span.hid-caret', {}, hidOpen ? '▴' : '▾'));
    btn.addEventListener('click', () => {
      hidOpen = !hidOpen; more.hidden = !hidOpen;
      btn.setAttribute('aria-expanded', String(hidOpen)); btn.lastChild.textContent = hidOpen ? '▴' : '▾';
    });
    return h('div.hid', {}, btn, more);
  }
  drawSummary();
  return { value, el: panel, usableCount: okIds.length };
}

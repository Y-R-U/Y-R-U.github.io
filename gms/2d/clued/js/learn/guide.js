// Field guide: theme → pack browser and the filterable photo grid.
import { h } from '../ui/kit.js?v=202610071327';
import { header, go } from '../ui/app.js?v=202610071327';
import { getIndex } from '../core/packs.js?v=202610071327';
import { themeTree, getPack, itemsFor, refOf, thumb, catValues, norm, kidsOn, hasAudio, factRows } from './data.js?v=202610071327';
import { packPct, getMastery, getCards, itemLevel } from './model.js?v=202610071327';
import { ring, notice, emptyState } from './ui.js?v=202610071327';
import { factText } from '../formats/registry.js?v=202610071327';

export function guideHome(el) {
  const kids = kidsOn();
  el.append(header(kids ? 'Picture book' : 'Field guide'));
  const m = getMastery(), c = getCards();
  const tree = themeTree({ kids, need: p => kids ? p.caps?.img > 0 : true });
  if (!tree.length) { el.append(emptyState('📭', 'No packs yet', 'Content packs are still on their way.')); return; }
  for (const t of tree) {
    const sec = h('section.l-theme', {},
      h('div.l-theme-head', {}, h('h2.sec-title', {}, `${t.icon} ${t.title}`),
        t.packs.length > 1 ? h('button.btn.small', { type: 'button', dataset: { theme: t.id }, onclick: () => go('l-pack', { theme: t.id }) }, 'See all ›') : null),
      h('div.l-packs', {}, ...t.packs.map(p => h('button.l-pk', { type: 'button', dataset: { pack: p.id }, onclick: () => go('l-pack', { id: p.id }) },
        h('span.pk-ico', {}, p.icon || '❓'),
        h('span.pk-txt', {}, h('b', {}, p.title), h('small', {}, `${p.items} ${p.items === 1 ? 'entry' : 'entries'}${p.caps?.audio ? ' · 🔊' : ''}`)),
        ring(packPct(p.id, p.items, m, c), { size: 40 })))));
    el.append(sec);
  }
}

/* ---------- grid ---------- */

const memory = new Map();   // per grid key: { q, filters, sort, open, scroll }

function buckets(values, meta) {
  const vs = [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (vs.length < 4) return null;
  const nice = x => {
    if (meta.type === 'year') return Math.round(x / (Math.abs(x) > 1500 ? 10 : 50)) * (Math.abs(x) > 1500 ? 10 : 50);
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(x) || 1)));
    return Math.round(x / p * 2) / 2 * p;
  };
  const all = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const cuts = [...new Set([0.25, 0.5, 0.75].map(q => nice(all[Math.floor(q * (all.length - 1))])))].filter(x => x > all[0] && x <= all[all.length - 1]);
  if (!cuts.length) return null;
  const fmt = v => (meta.type === 'year' ? String(v) : factText({ ...meta, unit: '' }, v).trim());
  const unit = meta.type === 'num' && meta.unit ? ' ' + meta.unit : '';
  const out = [];
  for (let i = 0; i <= cuts.length; i++) {
    const lo = i ? cuts[i - 1] : -Infinity, hi = i < cuts.length ? cuts[i] : Infinity;
    const label = lo === -Infinity ? `${meta.type === 'year' ? 'Before' : 'Under'} ${fmt(hi)}${unit}`
      : hi === Infinity ? `${meta.type === 'year' ? fmt(lo) + ' on' : fmt(lo) + unit + '+'}` : `${fmt(lo)}–${fmt(hi)}${unit}`;
    out.push({ label, test: v => v >= lo && v < hi });
  }
  return out;
}

// Filter definitions derived from factsMeta (bool / cat / num / year) plus level and sound.
export function deriveFilters(pack, items) {
  const defs = [];
  for (const [key, meta] of Object.entries(pack.factsMeta || {})) {
    if (key === 'kids') continue;
    const vals = items.map(it => it.facts?.[key]).filter(v => v != null && v !== '');
    if (vals.length < 3) continue;
    if (meta.type === 'bool') {
      if (new Set(vals.map(Boolean)).size < 2) continue;
      defs.push({ key, label: meta.label || key, kind: 'chips', opts: [{ label: meta.yes || 'Yes', test: v => v === true }, { label: meta.no || 'No', test: v => v === false }] });
    } else if (meta.type === 'cat') {
      const counts = new Map();
      for (const v of vals) for (const c of catValues(meta, v)) counts.set(c, (counts.get(c) || 0) + 1);
      if (counts.size < 2) continue;
      const order = meta.values?.length ? meta.values.filter(v => counts.has(v)) : [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
      const opts = order.map(v => ({ label: v, count: counts.get(v), test: x => catValues(meta, x).includes(v) }));
      defs.push({ key, label: meta.label || key, kind: opts.length <= 8 ? 'chips' : 'select', opts });
    } else if (meta.type === 'num' || meta.type === 'year') {
      const b = buckets(vals, meta);
      if (b) defs.push({ key, label: meta.label || key, kind: 'chips', opts: b });
    }
  }
  const diffs = new Set(items.map(it => it.difficulty).filter(Boolean));
  if (diffs.size > 1) defs.push({ key: '_lvl', label: 'Level', kind: 'chips', get: it => it.difficulty || 2,
    opts: [['Easy', 1], ['Medium', 2], ['Hard', 3]].filter(([, d]) => diffs.has(d)).map(([label, d]) => ({ label, test: v => v === d })) });
  if (items.some(hasAudio) && !items.every(hasAudio)) defs.push({ key: '_snd', label: 'Sound', kind: 'chips', get: it => hasAudio(it), opts: [{ label: '🔊 Has sound', test: v => v }] });
  return defs;
}

export async function packGrid(el, params, cur) {
  const kids = kidsOn();
  const idx = getIndex();
  const key = params.id ? 'p:' + params.id : 't:' + params.theme;
  const theme = params.theme ? themeTree({ kids }).find(t => t.id === params.theme) : null;
  const ids = params.id ? [params.id] : (theme?.packs || []).map(p => p.id);
  const title = params.id ? `${idx?.packs?.[params.id]?.icon || ''} ${idx?.packs?.[params.id]?.title || params.id}` : `${theme?.icon || ''} All ${theme?.title || ''}`;
  el.append(header(title.trim()));
  const loading = h('p.muted.center', {}, 'Loading…');
  el.append(loading);
  const packs = (await Promise.all(ids.map(id => getPack(id).catch(() => null)))).filter(Boolean);
  loading.remove();
  const entries = [];
  for (const p of packs) for (const it of itemsFor(p, kids)) entries.push({ pack: p, item: it, ref: refOf(p, it) });
  if (!entries.length) { el.append(emptyState('🫙', 'Nothing here yet', kids ? 'No easy pictures in this pack yet.' : 'This pack has no entries.')); return; }

  const st = memory.get(key) || { q: '', filters: {}, sort: 'name', open: false, scroll: 0 };
  memory.set(key, st);
  const single = packs.length === 1 ? packs[0] : null;
  for (const n of new Set(packs.map(p => p.notice).filter(Boolean))) el.append(notice(n));

  const defs = single ? deriveFilters(single, entries.map(e => e.item)) : [];
  if (!single && packs.length > 1) defs.push({ key: '_pack', label: 'Pack', kind: 'chips', get: (it, e) => e.pack.id, opts: packs.map(p => ({ label: `${p.icon || ''} ${p.title}`, test: v => v === p.id })) });

  // toolbar
  const search = h('input.field.l-search', { type: 'search', placeholder: kids ? 'Find…' : 'Search…', 'aria-label': 'Search', value: st.q });
  const fBtn = h('button.chip.l-fbtn', { type: 'button', 'aria-expanded': String(st.open) }, '⚙︎ Filters');
  const sortSel = h('select.l-sort', { 'aria-label': 'Sort' }, h('option', { value: 'name' }, 'A–Z'));
  const numKeys = single ? Object.entries(single.factsMeta || {}).filter(([k, m]) => (m.type === 'num' || m.type === 'year') && entries.some(e => e.item.facts?.[k] != null)) : [];
  for (const [k, m] of numKeys) {
    sortSel.append(h('option', { value: k + ':d' }, `${m.higherLabel || m.label} first`));
  }
  sortSel.append(h('option', { value: '_learn' }, 'Least learned'));
  sortSel.value = [...sortSel.options].some(o => o.value === st.sort) ? st.sort : 'name';
  const count = h('span.l-count.muted.tiny');
  const panel = h('div.l-filters', { hidden: !st.open });
  const tools = h('div.l-tools', {}, search, defs.length && !kids ? fBtn : null, h('label.l-sortw', {}, sortSel));
  el.append(h('div.l-toolbar', {}, tools, panel, count));
  if (kids) sortSel.parentNode.hidden = true;

  for (const d of defs) {
    const row = h('div.l-frow', {}, h('div.l-flabel', {}, d.label));
    const sel = st.filters[d.key] || (st.filters[d.key] = []);
    if (d.kind === 'select') {
      const s = h('select.l-fsel', { 'aria-label': d.label }, h('option', { value: '' }, 'Any'), ...d.opts.map((o, i) => h('option', { value: String(i) }, `${o.label} (${o.count})`)));
      s.value = sel.length ? String(sel[0]) : '';
      s.addEventListener('change', () => { st.filters[d.key] = s.value === '' ? [] : [+s.value]; apply(); });
      row.append(s);
    } else {
      const chips = h('div.chips');
      d.opts.forEach((o, i) => {
        const c = h('button.chip', { type: 'button', class: sel.includes(i) ? 'on' : '', 'aria-pressed': String(sel.includes(i)) }, o.label);
        c.addEventListener('click', () => {
          const a = st.filters[d.key];
          const at = a.indexOf(i);
          if (at >= 0) a.splice(at, 1); else a.push(i);
          c.classList.toggle('on', at < 0); c.setAttribute('aria-pressed', String(at < 0));
          apply();
        });
        chips.append(c);
      });
      row.append(chips);
    }
    panel.append(row);
  }
  if (defs.length) panel.append(h('button.btn.ghost.small', { type: 'button', onclick: () => { st.filters = {}; st.q = ''; memory.set(key, st); go('l-pack', params, { replace: true }); } }, 'Clear all'));
  fBtn.addEventListener('click', () => { st.open = !st.open; panel.hidden = !st.open; fBtn.setAttribute('aria-expanded', String(st.open)); });

  // grid: every cell built once; filtering toggles `hidden`, sorting re-appends
  const m = getMastery(), c = getCards();
  const grid = h('div.l-grid', { class: entries.some(e => thumb(e.item)) ? '' : 'text' });
  for (const e of entries) {
    const img = thumb(e.item);
    const lv = itemLevel(e.ref, m, c);
    const cell = h('button.l-cell', { type: 'button', dataset: { ref: e.ref }, class: img ? '' : 'noimg' });
    if (img) {
      const wide = /flag/i.test(img.src) || (img.w && img.h && img.w / img.h > 1.9);
      const im = h('img', { src: img.src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false', class: wide ? 'wide' : '' });
      im.addEventListener('error', () => cell.classList.add('broken'), { once: true });
      cell.append(h('span.c-img', {}, im));
    } else {
      const sub = factRows(e.pack, e.item).find(r => r.meta.type !== 'num')?.text || e.item.blurb || '';
      cell.append(h('span.c-ico', {}, e.pack.icon || '❓'), h('span.c-sub', {}, sub));
    }
    cell.append(h('span.c-name', {}, e.item.name));
    if (lv) cell.append(h('span.c-lv', { class: 'lv' + lv, title: ['', 'Seen', 'Learning', 'Learned'][lv] }));
    e.cell = cell;
    e.hay = norm([e.item.name, ...(e.item.alt || []), e.item.sci || '', ...Object.values(e.item.facts || {}).filter(v => typeof v === 'string')].join(' '));
    e.lv = lv;
    grid.append(cell);
  }
  grid.addEventListener('click', ev => {
    const cell = ev.target.closest('.l-cell');
    if (!cell) return;
    st.scroll = el.scrollTop;
    const list = shown.map(e => e.ref);
    go('l-item', { ref: cell.dataset.ref, list });
  });
  el.append(grid);
  const none = h('div', { hidden: true }, emptyState('🔍', 'No matches', 'Try fewer filters.'));
  el.append(none);

  let shown = entries;
  function apply() {
    st.q = search.value;
    const q = norm(search.value.trim());
    const act = defs.map(d => [d, st.filters[d.key] || []]).filter(([, s]) => s.length);
    shown = entries.filter(e => {
      if (q && !e.hay.includes(q)) return false;
      for (const [d, s] of act) {
        const v = d.get ? d.get(e.item, e) : e.item.facts?.[d.key];
        if (!s.some(i => d.opts[i]?.test(v))) return false;
      }
      return true;
    });
    const [sk] = st.sort.split(':');
    const sorted = [...shown].sort(st.sort === 'name' ? (a, b) => a.item.name.localeCompare(b.item.name)
      : st.sort === '_learn' ? (a, b) => a.lv - b.lv || a.item.name.localeCompare(b.item.name)
      : (a, b) => (Number(b.item.facts?.[sk]) || -Infinity) - (Number(a.item.facts?.[sk]) || -Infinity));
    shown = sorted;
    const vis = new Set(shown);
    for (const e of entries) e.cell.hidden = !vis.has(e);
    for (const e of sorted) grid.append(e.cell);
    count.textContent = shown.length === entries.length ? `${entries.length} entries` : `Showing ${shown.length} of ${entries.length}`;
    const nAct = act.length;
    fBtn.textContent = nAct ? `⚙︎ Filters (${nAct})` : '⚙︎ Filters';
    fBtn.classList.toggle('on', nAct > 0);
    none.hidden = shown.length > 0;
  }
  let tmr = 0;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(apply, 120); });
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; apply(); });
  apply();
  if (st.scroll) setTimeout(() => { el.scrollTop = st.scroll; }, 0);
  return () => { st.scroll = el.scrollTop; };
}

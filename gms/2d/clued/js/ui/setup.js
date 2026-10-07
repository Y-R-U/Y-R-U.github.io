// Format grid + per-game setup (themes, count, options, difficulty, timer).
import { h } from './kit.js?v=202610071242';
import { defineScreen, go, header } from './app.js?v=202610071242';
import { listFormats, getFormat, defaultOpts } from '../formats/registry.js?v=202610071242';
import { getIndex } from '../core/packs.js?v=202610071242';
import { supportedPackIds, formatAvailable } from '../core/spec.js?v=202610071242';
import { getSettings, getLast, setLast, ANSWER_TIMES } from '../core/store.js?v=202610071242';
import { themePicker } from './picker.js?v=202610071242';
import { STRUCTURES } from '../structures/index.js?v=202610071242';
import { sfx } from './fx.js?v=202610071242';
import { favControls } from './favs.js?v=202610071242';
import { favKey } from './favmodel.js?v=202610071242';

export const DIFFS = [[0, 'Mixed'], [1, 'Easy'], [2, 'Medium'], [3, 'Hard']];

export function formatsFor(structure) {
  const st = STRUCTURES[structure] || {};
  return listFormats().filter(f => !f.hidden && (!st.formatFilter || st.formatFilter(f)));
}

defineScreen('formats', (el, { structure = 'quick', onPick = null, title = null }) => {
  const st = STRUCTURES[structure] || STRUCTURES.quick;
  const kids = !!getSettings().kids;
  const index = getIndex();
  el.append(header(title || (structure === 'quick' ? 'Pick a format' : st.title)));
  if (structure !== 'quick' && st.blurb) el.append(h('p.muted.center', { style: { marginTop: '0', marginBottom: '12px' } }, st.blurb));
  const fmts = formatsFor(structure)
    .map(f => ({ f, n: formatAvailable(f, index, { kids }) ? Math.max(1, supportedPackIds(f, index, { kids }).length) : 0 }))
    .sort((a, b) => (b.n > 0) - (a.n > 0) || (kids ? (b.f.kids ? 1 : 0) - (a.f.kids ? 1 : 0) : 0));
  const grid = h('div.tiles');
  for (const { f, n } of fmts) {
    grid.append(h('button.tile', {
      type: 'button', class: n ? '' : 'off', disabled: !n, dataset: { format: f.id },
      onclick: () => { sfx('button'); onPick ? onPick(f) : go('setup', { structure, format: f.id }); },
    }, h('span.t-ico', {}, f.icon), h('span.t-title', {}, f.title), h('span.t-blurb', {}, f.blurb || ''),
      n ? null : h('span.t-why', {}, kids ? 'No kids packs yet' : 'No packs yet'),
      kids && f.kids ? h('span.t-tag', {}, 'kids') : null));
  }
  if (!fmts.length) grid.append(h('p.muted', {}, 'No formats loaded.'));
  el.append(grid);
});

function chipRow(values, labels, current, onPick) {
  const row = h('div.chips');
  values.forEach((v, i) => {
    const c = h('button.chip', { type: 'button', class: String(v) === String(current) ? 'on' : '', dataset: { v: String(v) } }, labels ? labels[i] : String(v));
    c.addEventListener('click', () => { row.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); onPick(v); sfx('button'); });
    row.append(c);
  });
  return row;
}

function switchEl(checked, onChange, label) {
  const inp = h('input', { type: 'checkbox', 'aria-label': label });
  inp.checked = !!checked;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('span.switch', {}, inp, h('i'));
}

// Builds the option panel for one format, with favourite picks (quick picks above, ♥ save control below).
export function optionsPanel(host, fmt, { structure = 'quick', last = null, showCount = true, showTimer = true, showDifficulty = true, kids = false, favs = true } = {}) {
  const s = getSettings();
  const index = getIndex();
  let v, picker;
  const wrap = h('div.opt-wrap');
  let fav = null;
  const changed = () => fav && fav.refresh();

  function build(last) {
    wrap.replaceChildren();
    v = {
      packs: last?.packs || 'all',
      count: last?.count || 10,
      opts: { ...defaultOpts(fmt), ...(last?.opts || {}) },
      difficulty: last?.difficulty ?? 0,
      timer: typeof last?.timer === 'number' ? last.timer : kids ? 0 : s.timerSec,
    };
    picker = fmt.packless
      ? (wrap.append(h('div.panel.picker', {}, h('div.theme-sum', {}, h('span.ts-ico', {}, '🗺️'), h('span.ts-txt', {}, h('b', {}, 'Built-in world map'), h('small', {}, 'Natural Earth borders, no theme to pick'))))), { value: () => 'all' })
      : themePicker(wrap, { fmt, selected: v.packs, kids, onChange: p => { v.packs = p; changed(); } });
    const panel = h('div.panel', { style: { marginTop: '14px' } });
    if (showCount) {
      const custom = h('input.field.custom-n', { type: 'number', min: 3, max: 50, value: v.count, inputmode: 'numeric', 'aria-label': 'Custom count', hidden: [5, 10, 20].includes(v.count) });
      custom.addEventListener('input', () => { v.count = Math.max(3, Math.min(50, +custom.value || 10)); changed(); });
      const row = chipRow([5, 10, 20, 'custom'], ['5', '10', '20', 'Custom'], [5, 10, 20].includes(v.count) ? v.count : 'custom', x => {
        custom.hidden = x !== 'custom';
        if (x === 'custom') { custom.focus(); v.count = +custom.value || 15; } else v.count = x;
        changed();
      });
      row.append(custom);
      panel.append(h('div.opt', {}, h('div.opt-label', {}, 'Questions'), row));
    }
    for (const o of fmt.options || []) {
      if (kids && o.kidsHide) continue;
      if (o.type === 'bool') {
        panel.append(h('div.opt-row', {}, h('span.lbl', {}, o.label, o.help ? h('small', {}, o.help) : null), switchEl(v.opts[o.key], x => { v.opts[o.key] = x; changed(); }, o.label)));
      } else if (o.values) {
        let values = o.values, labels = o.labels;
        if (kids && o.kidsValues) { const keep = values.map((x, i) => [x, labels?.[i]]).filter(([x]) => o.kidsValues.includes(x)); values = keep.map(k => k[0]); labels = labels ? keep.map(k => k[1]) : null; }
        if (kids && o.kidsDefault != null && !(last?.opts && o.key in last.opts)) v.opts[o.key] = o.kidsDefault;
        if (!values.includes(v.opts[o.key])) v.opts[o.key] = kids && o.kidsDefault != null ? o.kidsDefault : values.includes(o.default) ? o.default : values[0];
        panel.append(h('div.opt', { dataset: { opt: o.key } }, h('div.opt-label', {}, o.label), chipRow(values, labels, v.opts[o.key], x => { v.opts[o.key] = x; changed(); })));
      }
    }
    if (showDifficulty && !kids) {
      panel.append(h('div.opt', { dataset: { opt: 'difficulty' } }, h('div.opt-label', {}, 'Difficulty'), chipRow(DIFFS.map(d => d[0]), DIFFS.map(d => d[1]), v.difficulty, x => {
        v.difficulty = x;
        const ans = (fmt.options || []).find(o => o.key === 'answers');
        if (ans && x === 1 && ans.values.includes(3) && v.opts.answers > 3) {
          v.opts.answers = 3;
          panel.querySelectorAll('.opt').forEach(o => { if (o.firstChild.textContent === ans.label) o.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === '3')); });
        }
        changed();
      })));
    }
    if (showTimer) {
      const times = kids ? [0, 20, 30] : ANSWER_TIMES;
      if (!times.includes(v.timer)) v.timer = kids ? 0 : 10;
      panel.append(h('div.opt', { dataset: { opt: 'timer' } }, h('div.opt-label', {}, 'Answer time', h('small.muted.tiny', {}, kids ? 'A gentle timer, if you like' : 'Faster answers score more')),
        chipRow(times, times.map(t => (t ? `${t}s` : 'Off')), v.timer, x => { v.timer = x; changed(); })));
    }
    if (kids) panel.append(h('p.muted.tiny', { style: { margin: '8px 0 0' } }, '🧸 Kids mode: easy questions, big pictures, no timer, read aloud.'));
    if (panel.childNodes.length) wrap.append(panel);
  }

  // Only the fields this screen shows: a fav saved from the pub quiz builder (no timer) leaves the timer alone elsewhere.
  const snap = () => {
    const o = { packs: picker.value(), opts: { ...v.opts } };
    if (showCount) o.count = v.count;
    if (showDifficulty && !kids) o.difficulty = v.difficulty;
    if (showTimer) o.timer = v.timer;
    return o;
  };
  build(last);
  if (favs) {
    fav = favControls({
      key: favKey(fmt, kids), fmt, kids, index, snap, timerDefault: kids ? 0 : s.timerSec,
      apply: c => {
        const cur = { packs: picker.value(), count: v.count, opts: { ...v.opts }, difficulty: v.difficulty, timer: v.timer };
        build({ ...cur, ...c, opts: { ...cur.opts, ...c.opts } });
        wrap.classList.remove('fav-applied'); void wrap.offsetWidth; wrap.classList.add('fav-applied');
      },
    });
    host.append(fav.quick, wrap, fav.save);
  } else host.append(wrap);
  return {
    value: () => ({ format: fmt.id, packs: picker.value(), count: v.count, opts: { ...v.opts }, difficulty: kids ? 1 : v.difficulty, timer: v.timer, kids }),
    save: () => setLast(kids ? `${fmt.id}:kids` : fmt.id, { packs: picker.value(), count: v.count, opts: v.opts, difficulty: v.difficulty, timer: v.timer }),
  };
}

defineScreen('setup', (el, { structure = 'quick', format = 'mc' }) => {
  const st = STRUCTURES[structure] || STRUCTURES.quick;
  const fmt = getFormat(format);
  const kids = !!getSettings().kids;
  el.append(header(st.title));
  if (!fmt) { el.append(h('p.panel', {}, `Format "${format}" isn't available.`)); return; }
  el.append(h('div.setup-head', {}, h('span.fh-ico', {}, structure === 'ladder' ? '🪜' : fmt.icon),
    h('div', {}, h('h2', {}, structure === 'ladder' ? 'The Ladder' : fmt.title), h('p', {}, structure === 'ladder' ? '15 questions, easy to fiendish. 50:50, skip and hint once each.' : (st.blurb || fmt.blurb)))));
  const body = h('div');
  el.append(body);
  const panel = optionsPanel(body, fmt, {
    structure, kids, last: getLast(kids ? `${fmt.id}:kids` : fmt.id),
    showCount: st.count !== false, showTimer: st.timer !== false, showDifficulty: st.difficulty !== false,
  });
  const start = h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'start' } }, structure === 'quick' ? "Let's go!" : `Start ${st.title}`);
  start.addEventListener('click', () => {
    sfx('button');
    panel.save();
    st.start({ ...panel.value(), structure });
  });
  el.append(h('div.start-bar', {}, start));
});

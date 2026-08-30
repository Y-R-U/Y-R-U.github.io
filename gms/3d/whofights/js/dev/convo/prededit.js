// A predicate builder that can only build predicates js/game/predicate.js evaluates.
//
// `read` is a getter, not a value: a text field edits in place without a repaint, so every handler
// has to start from what the document says now rather than from what it said when it was drawn.

import { h, select } from './dom.js';
import { TERM_SPECS, TERMS, blankPred } from './preds.js';
import { validatePred } from '../../game/predicate.js';

const LIVE = { keep: true, coalesce: true };

export function predEditor(read, write, { flags = [] } = {}) {
  const pred = read();
  const wrap = h('div', { class: 'convo-pred' });
  const term = Array.isArray(pred) ? pred[0] : '';
  wrap.append(h('div', { class: 'row', style: 'margin-bottom:4px' },
    h('span', { class: 'dim', text: 'if' }),
    select([['', 'always'], ...TERMS.map(t => [t, TERM_SPECS[t].label])], term,
      t => write(t ? blankPred(t) : null))));

  const spec = TERM_SPECS[term];
  if (!spec) return wrap;

  if (spec.nest === 'many') {
    pred.slice(1).forEach((_, i) => {
      const row = h('div', { class: 'row', style: 'margin:0' });
      row.append(predEditor(() => read()[i + 1],
        (v, o) => write([term, ...read().slice(1).map((x, j) => (j === i ? v : x))], o), { flags }));
      row.append(h('button', { class: 'convo-mini danger', text: '✕',
        onclick: () => write([term, ...read().slice(1).filter((_x, j) => j !== i)]) }));
      wrap.append(row);
    });
    wrap.append(select([['', '＋ add condition…'], ...TERMS.map(t => [t, TERM_SPECS[t].label])], '',
      t => t && write([term, ...read().slice(1), blankPred(t)]), { class: 'convo-mini' }));
  } else if (spec.nest === 'one') {
    wrap.append(predEditor(() => read()[1] ?? null, (v, o) => write(['not', v], o), { flags }));
  } else {
    const row = h('div', { class: 'row', style: 'margin:0' });
    spec.args.forEach((arg, i) => {
      const set = (v, o) => write(read().map((x, j) => (j === i + 1 ? v : x)), o);
      const value = pred[i + 1];
      row.append(h('span', { class: 'dim', text: arg.name }));
      if (arg.type === 'bool') {
        row.append(h('label', { class: 'dim' },
          h('input', { type: 'checkbox', checked: value !== false, onchange: e => set(e.target.checked, LIVE) }), ' true'));
      } else if (arg.type === 'enum') {
        row.append(select(arg.options.map(o => [o, o]), value ?? arg.options[0], v => set(v, LIVE), { class: 'convo-mini' }));
      } else if (arg.type === 'number') {
        row.append(h('input', { type: 'number', value: value ?? 0, style: 'width:80px',
          oninput: e => set(+e.target.value || 0, LIVE) }));
      } else {
        row.append(h('input', { type: 'text', value: value ?? '', style: 'width:220px',
          list: term === 'flag' && flags.length ? 'convo-flagnames' : null,
          oninput: e => set(e.target.value, LIVE) }));
      }
    });
    wrap.append(row);
  }

  const bad = validatePred(pred, 'if');
  if (bad.length) wrap.append(h('div', { class: 'convo-vo bad', text: bad[0] }));
  return wrap;
}

export const flagDatalist = flags =>
  h('datalist', { id: 'convo-flagnames' }, flags.map(f => h('option', { value: f })));

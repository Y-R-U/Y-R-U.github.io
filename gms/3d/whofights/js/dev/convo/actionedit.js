// The `sets` editor — DEV_CONTRACT §10 verbs, and only those.
// `read` is a getter for the same reason as in prededit.js: an in-place text edit must not be
// applied on top of a stale copy of the list.

import { h, select } from './dom.js';
import { VERB_IDS, validateAction } from '../../game/actions.js';
import { BARK_CATEGORIES } from '../data.js';

const LIVE = { keep: true, coalesce: true };

const blank = k =>
  k === 'say' ? { k, node: '' }
  : k === 'goto' ? { k, level: '', at: { x: 0, z: 0, yaw: 0 } }
  : k === 'music' ? { k, set: '' }
  : k === 'bark' ? { k, who: '', category: 'idle' }
  : k === 'event' ? { k, name: '', data: {} }
  : { k: 'flag', name: '', value: true };

export function actionList(read, E, write) {
  const list = read() || [];
  const wrap = h('div', { class: 'convo-col' });
  list.forEach((a, i) => wrap.append(actionRow(a, i, read, E, write)));
  wrap.append(h('div', { class: 'row', style: 'margin:0' },
    select([['', '＋ add effect…'], ...VERB_IDS.map(k => [k, k])], '',
      k => k && write([...(read() || []), blank(k)]), { class: 'convo-mini' })));
  return wrap;
}

function actionRow(a, i, read, E, write) {
  const set = (patch, opts) => write((read() || []).map((x, j) => (j === i ? { ...x, ...patch } : x)), opts);
  const row = h('div', { class: 'row', style: 'margin:0 0 4px' },
    h('span', { class: 'convo-badge', text: a.k }));

  if (a.k === 'flag') {
    row.append(
      h('input', { type: 'text', value: a.name || '', placeholder: 'flag name', style: 'width:230px',
        list: 'convo-flagnames', oninput: e => set({ name: e.target.value }, LIVE) }),
      h('label', { class: 'dim' },
        h('input', { type: 'checkbox', checked: a.value !== false, onchange: e => set({ value: e.target.checked }, LIVE) }),
        ' true'));
  } else if (a.k === 'say') {
    row.append(select([['', '— node —'], ...Object.keys(E.doc.nodes).map(id => [id, id])], a.node || '',
      v => set({ node: v })));
  } else if (a.k === 'goto') {
    row.append(select([['', '— level —'], ...E.levels.map(l => [l.id, l.id])], a.level || '', v => set({ level: v })));
    for (const k of ['x', 'z', 'yaw']) {
      row.append(h('span', { class: 'dim', text: k }), h('input', {
        type: 'number', step: '0.5', style: 'width:74px', value: a.at?.[k] ?? 0,
        oninput: e => set({ at: { ...(a.at || {}), [k]: +e.target.value || 0 } }, LIVE),
      }));
    }
  } else if (a.k === 'music') {
    row.append(
      h('input', { type: 'text', value: a.set || '', placeholder: 'music set id', style: 'width:180px',
        oninput: e => set({ set: e.target.value }, LIVE) }),
      h('label', { class: 'dim' },
        h('input', { type: 'checkbox', checked: a.stop === true, onchange: e => set({ stop: e.target.checked || undefined }) }),
        ' stop'));
  } else if (a.k === 'bark') {
    row.append(
      select([['', '— who —'], ...Object.keys(E.cast).map(id => [id, id])], a.who || '', v => set({ who: v })),
      select(BARK_CATEGORIES.map(c => [c, c]), a.category || 'idle', v => set({ category: v })));
  } else if (a.k === 'event') {
    row.append(
      h('input', { type: 'text', value: a.name || '', placeholder: 'event name', style: 'width:200px',
        oninput: e => set({ name: e.target.value }, LIVE) }),
      h('input', { type: 'text', value: JSON.stringify(a.data || {}), placeholder: '{}', style: 'width:200px',
        oninput: e => { try { set({ data: JSON.parse(e.target.value) }, LIVE); } catch { /* mid-typing */ } } }));
  }

  const bad = validateAction(a, 'effect');
  if (bad.length) row.append(h('span', { class: 'convo-vo bad', text: bad[0].replace(/^effect: /, '') }));
  row.append(h('button', { class: 'convo-mini danger', text: '✕', title: 'remove',
    onclick: () => write((read() || []).filter((_, j) => j !== i)) }));
  return row;
}

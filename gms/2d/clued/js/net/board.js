// Scoreboards and podium for rooms and challenges. All text goes in via textContent (h() kids).
import { h, fmtNum } from '../ui/kit.js?v=1';

export const ordinal = n => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const MEDAL = ['🥇', '🥈', '🥉'];

// rows: [{ id, name, score, correct, last?, signed? }] sorted best first.
// Kids rooms show the top 3 plus your own row, stars instead of points, no rank for anyone else.
export function scoreboard(rows, { meId = null, kids = false, top = 5, deltas = false } = {}) {
  const list = h('ol.net-board');
  const meIdx = rows.findIndex(r => r.id === meId);
  const limit = kids ? 3 : top;
  const shown = rows.slice(0, limit);
  const addRow = (r, i, gap = false) => {
    if (gap) list.append(h('li.net-row.gap', {}, '⋯'));
    const me = r.id === meId;
    const rank = kids ? (i < 3 ? MEDAL[i] : '⭐') : i < 3 ? MEDAL[i] : String(i + 1);
    const delta = deltas && r.last ? r.last.points : null;
    list.append(h('li.net-row', { class: me ? 'me' : '', style: { '--i': i } },
      h('span.rk', {}, rank),
      h('span.nm', {}, r.name + (me ? ' (you)' : '')),
      kids ? h('span.dl', {}, '') : delta != null ? h('span.dl', { class: delta ? '' : 'zero' }, delta ? `+${fmtNum(delta)}` : '+0') : h('span.dl'),
      h('span.pt', {}, kids ? h('span.stars', {}, `${r.correct || 0} ⭐`) : fmtNum(r.score))));
  };
  shown.forEach((r, i) => addRow(r, i));
  if (meIdx >= limit) addRow(rows[meIdx], meIdx, true);
  return list;
}

export function podium(rows, { kids = false } = {}) {
  const wrap = h('div.net-podium');
  const order = [1, 0, 2];
  for (const i of order) {
    const r = rows[i];
    wrap.append(h('div.net-step', { class: `p${i + 1}` },
      r ? h('span.medal', {}, MEDAL[i]) : h('span.medal', {}, ''),
      h('span.who', {}, r ? r.name : ''),
      h('span.pts', {}, r ? (kids ? `${r.correct || 0} ⭐` : `${fmtNum(r.score)} pts`) : ''),
      h('div.blk', {}, r ? String(i + 1) : '')));
  }
  return wrap;
}

// Chip row for a small set of choices. onPick(value).
export function choiceChips(values, labels, current, onPick) {
  const row = h('div.chips');
  values.forEach((v, i) => {
    const c = h('button.chip', { type: 'button', class: v === current ? 'on' : '', dataset: { v: String(v) } }, labels[i]);
    c.addEventListener('click', () => { row.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); onPick(v); });
    row.append(c);
  });
  return row;
}

export function timingPanel({ answerSec, gapSec, onChange }) {
  const v = { answerSec, gapSec };
  return h('div.panel.stack.net-timing', {},
    h('div', { dataset: { opt: 'answer' } }, h('div.opt-label', {}, 'Time to answer'),
      choiceChips([3, 5, 10, 15, 20, 30], ['3 s', '5 s', '10 s', '15 s', '20 s', '30 s'], answerSec, x => { v.answerSec = x; onChange({ ...v }, 'answerSec'); })),
    h('div', { dataset: { opt: 'gap' } }, h('div.opt-label', {}, 'Before the next question'),
      choiceChips([3, 5, 10, 0], ['3 s', '5 s', '10 s', 'Host taps Next'], gapSec, x => { v.gapSec = x; onChange({ ...v }, 'gapSec'); })));
}

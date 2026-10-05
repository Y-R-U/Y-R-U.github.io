// Scoreboards and podium for rooms and challenges. All text goes in via textContent (h() kids).
import { h, fmtNum } from '../ui/kit.js?v=202610051408';

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

// Async progressive scoring (DESIGN): per question, the winner is correct with the lowest stage, ties by time.
// detail = [[correct 0/1, stage, ms], …] in question order.
export const detailOf = answers => (answers || []).slice().sort((a, b) => a.i - b.i)
  .map(a => [a.correct ? 1 : 0, a.stage || 0, Math.round(a.ms || 0)]);

export function questionWinners(players, n) {
  const wins = players.map(() => 0), winners = [];
  for (let q = 0; q < n; q++) {
    let best = -1;
    players.forEach((p, k) => {
      const d = p.detail?.[q];
      if (!d || !d[0]) return;
      const b = best >= 0 ? players[best].detail[q] : null;
      if (!b || d[1] < b[1] || (d[1] === b[1] && d[2] < b[2])) best = k;
    });
    winners.push(best);
    if (best >= 0) wins[best]++;
  }
  return { winners, wins };
}

function stageText(q, s) {
  if (!q || !(q.stages >= 2)) return '';
  if (Array.isArray(q.stageLabels) && q.stageLabels[s]) return q.stageLabels[s];
  return q.format === 'ladder' ? `clue ${s + 1}` : `step ${s + 1}/${q.stages}`;
}

// players: [{ name, me?, detail }]; questions: the played set (for stage labels).
export function comparison(players, questions) {
  const withDetail = players.filter(p => Array.isArray(p.detail) && p.detail.length);
  if (withDetail.length < 2) return null;
  const n = questions.length;
  const { winners, wins } = questionWinners(withDetail, n);
  const rows = [];
  for (let q = 0; q < n; q++) {
    const qq = questions[q];
    const chips = withDetail.map((p, k) => {
      const d = p.detail[q];
      const txt = !d ? '–' : d[0] ? ['✓', stageText(qq, d[1]), `${(d[2] / 1000).toFixed(1)}s`].filter(Boolean).join(' ') : '✗';
      return h('span.net-cmp-chip', { class: `${winners[q] === k ? 'win' : ''} ${d && d[0] ? '' : 'miss'}` },
        h('b', {}, p.me ? 'You' : p.name), ' ', txt);
    });
    rows.push(h('li.net-cmp-row', {}, h('div.net-cmp-q', {}, `${q + 1}. ${String(qq?.prompt || '').slice(0, 70)}`), h('div.net-cmp-chips', {}, ...chips)));
  }
  return h('details.panel.net-cmp', {},
    h('summary', {}, h('b', {}, 'Question by question'), h('span.muted', {}, ' · ' + withDetail.map((p, k) => `${p.me ? 'You' : p.name} ${wins[k]}`).join(' · '))),
    h('p.tiny.muted', {}, 'Each question goes to whoever got it right with the least revealed; ties go to the faster answer.'),
    h('ol.net-cmp-list', {}, ...rows));
}

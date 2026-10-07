import { h, fmtNum, countUp } from './kit.js?v=202610071242';
import { defineScreen, go, reset } from './app.js?v=202610071242';
import { recordGame, getSettings } from '../core/store.js?v=202610071242';
import { confetti, sfx, haptic, reducedMotion } from './fx.js?v=202610071242';
import { addStars, kidsProgress } from './stickers.js?v=202610071242';
import { shareText } from './share.js?v=202610071242';
import { loadNet } from './net.js?v=202610071242';

let matchDone = () => {};
export const setMatchCompleted = fn => { matchDone = fn; };

function verdict(pct, kids) {
  if (kids) return pct >= 70 ? ['🏆', 'Superstar!'] : pct >= 40 ? ['🌟', 'Brilliant!'] : ['🎈', 'Well played!'];
  if (pct >= 90) return ['🏆', 'Genius!'];
  if (pct >= 70) return ['🌟', 'Great game!'];
  if (pct >= 40) return ['👍', 'Not bad!'];
  return ['💪', 'Keep at it!'];
}

const answerText = q => {
  if (!q) return '';
  if (q.answerText != null) return q.answerText;
  if (Array.isArray(q.options) && Number.isInteger(q.answer)) return q.options[q.answer]?.text ?? '';
  if (typeof q.answer === 'boolean') return q.answer ? 'True' : 'False';
  return Array.isArray(q.answer) ? q.answer.join(' → ') : String(q.answer ?? '');
};

defineScreen('results', (el, params) => {
  const { result: r, structure = 'quick', title = 'Results', spec, daily, replay } = params;
  const kids = !!(spec?.kids || getSettings().kids && structure !== 'party');
  const total = r.answered || r.total || 0;
  const pct = total ? Math.round(100 * r.correct / total) : 0;
  let newStickers = [];
  if (!params._recorded) {
    params._recorded = true;
    if (!r.aborted && !r.duel) {
      recordGame({ structure, score: r.score, answers: r.answers || [] });
      if (kids && r.stars) newStickers = addStars(r.stars);
      try { matchDone(); } catch (e) {}
    }
    params._newStickers = newStickers;
  } else newStickers = params._newStickers || [];

  const multi = (r.players || []).length > 1;
  const board = multi ? [...r.players].sort((a, b) => b.score - a.score) : null;
  let [badge, head] = verdict(pct, kids);
  if (r.duel) { const [a, b] = r.players; badge = '⚔️'; head = a.score === b.score ? "It's a draw!" : `${(a.score > b.score ? a : b).name} wins!`; }
  else if (multi) { badge = '🏆'; head = `${board[0].name} wins!`; }
  else if (r.ladder) { badge = r.ladder.cleared >= 15 ? '👑' : '🪜'; head = r.ladder.cleared >= 15 ? 'Top of the ladder!' : `${r.ladder.cleared} rung${r.ladder.cleared === 1 ? '' : 's'} climbed`; }

  const scoreEl = h('div.res-score', {}, '0');
  const shownScore = kids && !multi && !r.ladder ? (r.stars || 0) : (r.score || 0);
  el.append(h('div.res', {},
    h('div.muted', { style: { marginTop: '18px' } }, title),
    h('div.res-badge', {}, badge),
    h('h1.res-title', {}, head),
    r.duel || multi ? null : scoreEl,
    r.ladder && r.ladder.fell && r.ladder.cleared > 0 ? h('p.muted', {}, `Fell off. You keep the safe-rung total.`) : null,
    board ? h('div.board', {}, ...board.map((p, i) => h('div.board-row', {}, h('span.pos', {}, ['🥇', '🥈', '🥉'][i] || `${i + 1}`), h('span', {}, p.name), h('span.sc', {}, fmtNum(p.score))))) : null,
    r.duel ? null : h('div.res-stats', {},
      h('div.rs', {}, h('b', {}, `${r.correct}/${total}`), h('small', {}, 'right')),
      h('div.rs', {}, h('b', {}, `${pct}%`), h('small', {}, 'accuracy')),
      h('div.rs', {}, h('b', {}, `${r.bestStreak || 0}`), h('small', {}, 'best streak'))),
  ));
  const res = el.querySelector('.res');
  if (kids) {
    const kp = kidsProgress();
    res.append(h('div.panel', {}, h('div', { html: `⭐ <b>+${r.stars || 0} stars</b> · ${kp.stars} total` }),
      newStickers.length ? h('div', { style: { marginTop: '8px' } }, 'New sticker!') : h('div.muted.tiny', {}, `${kp.next} more star${kp.next === 1 ? '' : 's'} for the next sticker`),
      h('div.sticker-shelf', {}, ...kp.stickers.slice(0, Math.max(8, kp.have + 2)).map((x, i) => h('span.sticker', { class: (i < kp.have ? '' : 'locked') + (newStickers.includes(x) ? ' new' : '') }, x)))));
  }
  if (daily) {
    res.append(h('div.panel', { style: { marginTop: '12px' } },
      h('div.share-grid', {}, [...(daily.text.split('\n').slice(2, -1).join('\n'))].join('')),
      daily.first ? null : h('p.muted.tiny', {}, 'Replay: your first result today is the one that counts.'),
      h('button.btn.sun.wide', { type: 'button', dataset: { act: 'share' }, onclick: () => shareText(daily.text, 'Clued Daily') }, '📤 Share result')));
    res.querySelector('.share-grid').style.whiteSpace = 'pre-line';
  }
  const actions = h('div.res-actions');
  if (replay) actions.append(h('button.btn.primary.big', { type: 'button', dataset: { act: 'again' }, onclick: () => replay() }, 'Play again'));
  const chal = h('button.btn.grape', { type: 'button', hidden: true, dataset: { act: 'challenge' } }, '⚔️ Challenge a friend');
  actions.append(chal, h('button.btn', { type: 'button', dataset: { act: 'home' }, onclick: () => reset('home') }, 'Home'));
  res.append(actions);
  if (!kids && !multi && !r.duel && spec && r.questions?.length && !r.aborted) {
    loadNet().then(net => {
      if (!net?.createChallenge) return;
      chal.hidden = false;
      chal.onclick = () => net.createChallenge(window.__cluedCtx, { spec, questions: r.questions, score: r.score, answers: r.answers });
    });
  }
  if (r.questions?.length && r.answers?.length) {
    const qs = new Map(r.questions.map(q => [q.id, q]));
    const det = h('details', {}, h('summary.btn.small', { style: { listStyle: 'none' } }, 'Review answers'));
    const list = h('div.res-list');
    for (const a of r.answers) {
      const q = qs.get(a.qid);
      list.append(h('div.res-q', { class: a.correct ? '' : 'bad' }, h('span.m', {}, a.correct ? '✓' : '✗'),
        h('div', {}, h('div', {}, q?.prompt || ''), h('div.a', {}, answerText(q))), h('span.p', {}, a.points ? `+${fmtNum(a.points)}` : '')));
    }
    det.append(list);
    res.append(det);
  }
  const reduced = reducedMotion();
  countUp(scoreEl, shownScore, 900, reduced);
  if (kids && !multi && !r.ladder) scoreEl.dataset.stars = '1';
  if (pct >= 70 || multi || r.duel || (kids && r.correct)) { setTimeout(() => confetti(), 250); sfx('fanfare'); haptic('win'); }

}, { pester: true });

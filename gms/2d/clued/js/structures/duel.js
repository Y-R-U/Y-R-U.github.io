// Duel: two players, one device. Portrait = top half flipped; landscape = left vs right. First right answer scores.
import { specFor, fmtTitle } from './common.js?v=202610071438';
import { prepare } from './session.js?v=202610071438';
import { defineScreen, go, back } from '../ui/app.js?v=202610071438';
import { h, choiceGrid, mediaBox, onKey } from '../ui/kit.js?v=202610071438';
import { confirmPop } from '../ui/popup.js?v=202610071438';
import { sfx, haptic } from '../ui/fx.js?v=202610071438';

const asChoice = q => {
  if (q.format === 'tf') return { ...q, options: [{ text: 'True' }, { text: 'False' }], answer: q.answer ? 0 : 1 };
  if (Array.isArray(q.options) && Number.isInteger(q.answer)) return q;
  return null;
};
const KEYS = [['1', '2', '3', '4', '5', '6'], ['7', '8', '9', '0', '-', '=']];

defineScreen('duel', async (el, { spec, choice, names = ['Red', 'Teal'] }) => {
  let questions;
  try { questions = (await prepare(spec, el)).questions.map(asChoice).filter(Boolean); } catch (e) { questions = []; }
  el.innerHTML = '';
  if (!questions.length) { el.append(h('div.panel.error-panel', {}, h('h2', {}, 'No duel questions'), h('button.btn.primary', { onclick: () => back() }, 'Back'))); return; }
  const score = [0, 0];
  let stopped = false, idx = -1, timer = null;
  const halves = [0, 1].map(p => h('div.duel-half', { class: `p${p + 1}` },
    h('div.dh-top', {}, h('span', {}, names[p]), h('span.dh-score', {}, '0')), h('div.dh-prompt'), h('div.dh-ch'), h('div.dh-flash')));
  const mid = h('div.duel-mid');
  const root = h('div.duel', {}, halves[0], mid, halves[1]);
  el.append(root);
  let grids = [];
  const offKeys = onKey(e => {
    for (const p of [0, 1]) { const k = KEYS[p].indexOf(e.key); if (k >= 0 && grids[p]) { grids[p].pick(k); return true; } }
  });

  const flash = (p, text) => { const f = halves[p].querySelector('.dh-flash'); f.textContent = text; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); };

  function next() {
    clearTimeout(timer);
    grids.forEach(g => g.destroy());
    idx++;
    if (stopped) return;
    if (idx >= questions.length) return finish();
    const q = questions[idx];
    mid.innerHTML = '';
    const quit = h('button.icon-btn.quit', { type: 'button', 'aria-label': 'Quit', onclick: async () => { if (await confirmPop('Quit the duel?', '', 'Quit', 'Keep playing', true)) { stopped = true; back(); } } }, '✕');
    const m = mediaBox(q.media);
    mid.append(quit, m || '', h('div.dm-prompt', {}, `${idx + 1}/${questions.length} · ${q.prompt}`), h('div.dm-n', {}, `${idx + 1} / ${questions.length}`));
    const locked = [false, false];
    halves.forEach(x => { x.querySelector('.dh-prompt').textContent = q.prompt; });
    window.__cluedDuel = { answer: q.answer, i: idx };
    let over = false;
    grids = [0, 1].map(p => {
      halves[p].classList.remove('locked');
      const host = halves[p].querySelector('.dh-ch');
      host.innerHTML = '';
      const g = choiceGrid(host, q.options, {
        images: q.data?.layout === 'images', keys: false,
        onPick(i) {
          if (over || locked[p]) return;
          if (i === q.answer) {
            over = true; score[p]++; halves[p].querySelector('.dh-score').textContent = score[p];
            flash(p, 'Point! ✓'); sfx('correct'); haptic('correct');
            halves.forEach(x => x.classList.remove('locked')); grids.forEach(x => { x.lock(); x.mark(q.answer, -1); });
            timer = setTimeout(next, 1500);
          } else {
            locked[p] = true; halves[p].classList.add('locked'); g.buttons[i].classList.add('wrong');   // not mark(): it reveals picture names to the other player flash(p, 'Locked out'); sfx('wrong'); haptic('wrong');
            if (locked[0] && locked[1]) { over = true; halves.forEach(x => x.classList.remove('locked')); grids.forEach(x => { x.lock(); x.mark(q.answer, -1); }); timer = setTimeout(next, 1700); }
          }
        },
      });
      return g;
    });
    timer = setTimeout(() => { if (!over) { over = true; grids.forEach(x => { x.lock(); x.mark(q.answer, -1); }); timer = setTimeout(next, 1500); } }, 15000);
  }

  function finish() {
    offKeys();
    const players = names.map((n, i) => ({ name: n, score: score[i], correct: score[i] }));
    go('results', {
      structure: 'duel', title: `Duel · ${fmtTitle(spec.rounds[0].format)}`, spec, choice, replay: () => duelStructure.start(choice),
      result: { score: Math.max(...score), correct: score[0] + score[1], answered: questions.length, total: questions.length, answers: [], players, duel: true, questions },
    }, { replace: true, skipGuard: true });
  }
  next();
  return () => { stopped = true; clearTimeout(timer); offKeys(); grids.forEach(g => g.destroy()); };
}, { cls: 'scr-play' });

const duelStructure = {
  id: 'duel', title: 'Duel', icon: '⚔️', blurb: 'First right answer scores. Turn the phone sideways!', timer: false,
  formatFilter: f => (f.tags || []).includes('choice'),
  start(c) { go('duel', { spec: specFor('duel', c), choice: c }); },
};
export default duelStructure;

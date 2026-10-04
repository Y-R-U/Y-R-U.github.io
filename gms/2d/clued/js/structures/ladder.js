import { playSpec } from './session.js?v=1';
import { specFor } from './common.js?v=1';
import { LADDER_RUNGS, ladderBanked } from '../core/scoring.js?v=1';
import { go } from '../ui/app.js?v=1';
import { fmtNum } from '../ui/kit.js?v=1';

const ladder = {
  id: 'ladder', title: 'Ladder', icon: '🪜', blurb: '15 rising questions. Lifelines: 50:50, skip, hint.', count: false, difficulty: false,
  start(c) {
    const base = { format: 'mc', packs: c.packs, opts: { ...c.opts }, count: 5 };
    const rounds = c.kids ? [1, 1, 1].map(d => ({ ...base, difficulty: d })) : [1, 2, 3].map(d => ({ ...base, difficulty: d }));
    playSpec(specFor('ladder', c, rounds), {
      title: 'The Ladder', choice: c, replay: () => ladder.start(c), prepare: { sparesRatio: 0.6 },
      cfg: (questions, spares) => {
        const list = questions.slice();
        return {
          questions: list, total: 15, timer: c.timer, lifelines: ['fifty', 'skip', 'hint'], noStreak: true,
          label: (i, q, s) => `Rung ${Math.min(15, s.correct + 1)} · ${fmtNum(LADDER_RUNGS[Math.min(14, s.correct)])}`,
          scoreFn: (res, q, s) => LADDER_RUNGS[s.correct] - (LADDER_RUNGS[s.correct - 1] || 0),
          onSkip: s => {
            const cur = list[s.i];
            const k = spares.findIndex(x => x.round === cur.round);
            if (k >= 0) list.splice(s.i + 1, 0, spares.splice(k, 1)[0]);
          },
          stopWhen: s => { const a = s.answers[s.answers.length - 1]; return (a && !a.correct && !a.skipped) || s.correct >= 15; },
        };
      },
      onDone(res, out) {
        const last = res.answers[res.answers.length - 1];
        const fell = last && !last.correct && !last.skipped;
        const cleared = res.correct;
        const score = c.kids ? cleared : fell ? ladderBanked(cleared) : (LADDER_RUNGS[cleared - 1] || 0);
        go('results', { ...out, result: { ...res, score, ladder: { cleared, fell } } }, { replace: true, skipGuard: true });
      },
    });
  },
};
export default ladder;

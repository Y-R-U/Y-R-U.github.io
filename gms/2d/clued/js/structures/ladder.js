import { playSpec } from './session.js?v=202610081134';
import { specFor } from './common.js?v=202610081134';
import { LADDER_RUNGS, ladderBanked } from '../core/scoring.js?v=202610081134';
import { go } from '../ui/app.js?v=202610081134';
import { fmtNum } from '../ui/kit.js?v=202610081134';

// Runner settings for a ladder run; challenge replays reuse them (no spares there, so skip just moves on).
function ladderCfg(list, spares = [], timer) {
  return {
    questions: list, total: 15, ...(timer !== undefined ? { timer } : {}), lifelines: ['fifty', 'skip', 'hint'], noStreak: true,
    label: (i, q, s) => `Rung ${Math.min(15, s.correct + 1)} · ${fmtNum(LADDER_RUNGS[Math.min(14, s.correct)])}`,
    scoreFn: (res, q, s) => LADDER_RUNGS[s.correct] - (LADDER_RUNGS[s.correct - 1] || 0),
    onSkip: s => {
      const cur = list[s.i];
      const k = spares.findIndex(x => x.round === cur.round);
      if (k >= 0) list.splice(s.i + 1, 0, spares.splice(k, 1)[0]);
    },
    stopWhen: s => { const a = s.answers[s.answers.length - 1]; return (a && !a.correct && !a.skipped) || s.correct >= 15; },
  };
}

export function ladderResult(res, kids) {
  const last = res.answers[res.answers.length - 1];
  const fell = !!(last && !last.correct && !last.skipped);
  const cleared = res.correct;
  return { score: kids ? cleared : fell ? ladderBanked(cleared) : (LADDER_RUNGS[cleared - 1] || 0), ladder: { cleared, fell } };
}

const ladder = {
  id: 'ladder', title: 'Ladder', icon: '🪜', blurb: '15 rising questions. Lifelines: 50:50, skip, hint.', count: false, difficulty: false,
  start(c) {
    const base = { format: 'mc', packs: c.packs, opts: { ...c.opts }, count: 5 };
    const rounds = c.kids ? [1, 1, 1].map(d => ({ ...base, difficulty: d })) : [1, 2, 3].map(d => ({ ...base, difficulty: d }));
    playSpec(specFor('ladder', c, rounds), {
      title: 'The Ladder', choice: c, replay: () => ladder.start(c), prepare: { sparesRatio: 0.6 },
      cfg: (questions, spares) => ladderCfg(questions.slice(), spares, c.timer),
      onDone(res, out) {
        go('results', { ...out, result: { ...res, ...ladderResult(res, c.kids) } }, { replace: true, skipGuard: true });
      },
    });
  },
  // challenge links replay the exact set with the same rules and final score (js/structures/index.js replayCfg)
  replay: {
    cfg: (spec, questions) => ladderCfg(questions),
    score: (res, spec) => ladderResult(res, spec.kids).score,
  },
};
export default ladder;

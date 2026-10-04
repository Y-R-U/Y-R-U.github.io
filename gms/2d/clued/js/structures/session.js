// Shared game flow: build questions from a spec, preflight media, run them, go to results.
import { buildQuestions } from '../core/spec.js?v=1';
import { urlsOf, preflight, swapFailed } from '../core/media.js?v=1';
import { createRunner } from './runner.js?v=1';
import { defineScreen, go, back, current } from '../ui/app.js?v=1';
import { h } from '../ui/kit.js?v=1';
import { toast } from '../ui/popup.js?v=1';

const TIPS = [
  'Keys 1–6 pick an answer, Enter moves on.',
  'Answer streaks add up to +50% points.',
  'Faster answers score more when the timer is on.',
  'Every picture has a credit: tap ⓘ after answering.',
  'Try the Daily: the same 10 questions for everyone today.',
  'Kids mode: bigger pictures, no timer, and stickers to collect.',
];

// Renders a progress screen into el. Returns { questions, spares, dropped }.
export async function prepare(spec, el, { sparesRatio = 0.4 } = {}) {
  el.innerHTML = '';
  const bar = h('div.pf-bar', {}, h('i'));
  const txt = h('div.muted', {}, 'Picking questions…');
  el.append(h('div.pf', {}, h('div.pf-ico', {}, '🔎'), h('h2', {}, 'Getting ready'), bar, txt,
    h('p.pf-tip', {}, TIPS[Math.floor(Math.random() * TIPS.length)])));
  const { questions, spares } = await buildQuestions(spec, { sparesRatio });
  const urls = urlsOf(questions);
  let result = { questions, spares, dropped: 0 };
  if (urls.length) {
    txt.textContent = `Loading pictures and sounds… 0/${urls.length}`;
    const { failed } = await preflight(urls, (d, t) => {
      bar.firstChild.style.width = `${Math.round(100 * d / Math.max(1, t))}%`;
      txt.textContent = `Loading pictures and sounds… ${d}/${t}`;
    });
    if (failed.size) {
      const spareUrls = urlsOf(spares);
      const sf = spareUrls.length ? (await preflight(spareUrls.slice(0, 60))).failed : new Set();
      const all = new Set([...failed, ...sf, ...spareUrls.slice(60)]);
      result = { ...swapFailed(questions, spares, all), spares };
      console.warn('[clued] media failed', [...failed]);
    }
  }
  bar.firstChild.style.width = '100%';
  return result;
}

// params: { spec, questions?, structure, title, cfg(questions, spares) -> runner cfg, onDone(result, ctx) }
defineScreen('play', async (el, params, cur) => {
  let questions = params.questions, spares = [];
  if (!questions) {
    try {
      const r = await prepare(params.spec, el, params.prepare);
      questions = r.questions; spares = r.spares;
      if (r.dropped) toast(`${r.dropped} question${r.dropped === 1 ? '' : 's'} skipped (media didn't load)`);
    } catch (e) {
      console.error(e);
      el.innerHTML = '';
      el.append(h('div.panel.error-panel', {}, h('h2', {}, 'No game this time'), h('p.muted', {}, e.message || String(e)),
        h('button.btn.primary', { onclick: () => back() }, 'Back')));
      return;
    }
  }
  if (cur !== current()) return;
  if (!questions.length) {
    el.innerHTML = '';
    el.append(h('div.panel.error-panel', {}, h('h2', {}, 'Not enough questions'), h('p.muted', {}, 'Try more themes or another format.'),
      h('button.btn.primary', { onclick: () => back() }, 'Back')));
    return;
  }
  el.innerHTML = '';
  const cfg = { ...(params.cfg ? params.cfg(questions, spares) : {}) };
  const run = createRunner(el, {
    kids: !!params.spec?.kids, difficulty: params.spec?.rounds?.[0]?.difficulty || 0,
    ...cfg, questions: cfg.questions || questions,
  });
  window.__cluedRun = run;
  run.done.then(res => {
    window.__cluedRun = null;
    if (res.reason === 'stop') return;
    if (res.reason === 'quit') { back(); return; }
    const out = { ...params, result: res };
    if (params.onDone) params.onDone(res, out); else go('results', out, { replace: true, skipGuard: true });
  });
  return { cleanup: () => run.stop('stop'), guard: run.guard };
}, { cls: 'scr-play' });

export function playSpec(spec, opts = {}) {
  return go('play', { spec, structure: spec.structure, ...opts });
}

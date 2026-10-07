// Shared game flow: build questions from a spec, preflight media, run them, go to results.
import { buildQuestions } from '../core/spec.js?v=202610071438';
import { getFormat } from '../formats/registry.js?v=202610071438';
import { urlsOf, preflight, swapFailed, questionFailed } from '../core/media.js?v=202610071438';
import { createRunner } from './runner.js?v=202610071438';
import { defineScreen, go, back, current } from '../ui/app.js?v=202610071438';
import { h } from '../ui/kit.js?v=202610071438';
import { toast } from '../ui/popup.js?v=202610071438';

const TIPS = [
  'Keys 1–6 pick an answer, Enter moves on.',
  'Answer streaks add up to +50% points.',
  'Faster answers score more when the timer is on.',
  'Every picture has a credit: tap ⓘ after answering.',
  'Try the Daily: the same 10 questions for everyone today.',
  'Kids mode: bigger pictures, no timer, and stickers to collect.',
];

// Lets formats refresh their media before preflight (e.g. listen re-resolves stale Apple previews).
export async function prepareFormats(questions) {
  const byFmt = new Map();
  for (const q of questions) byFmt.set(q.format, [...(byFmt.get(q.format) || []), q]);
  await Promise.all([...byFmt].map(async ([id, qs]) => {
    try { await getFormat(id)?.prepare?.(qs); } catch (e) { console.warn('[clued] prepare failed', id, e); }
  }));
}

// Renders a progress screen into el. Returns { questions, spares, dropped }.
// Slow or rate-limited picture hosts must not empty a round: failed questions are swapped for spares that loaded
// (same round), and a round left under 60% gets a slower second try before anything is dropped.
export async function prepare(spec, el, { sparesRatio = 0.8 } = {}) {
  el.innerHTML = '';
  const bar = h('div.pf-bar', {}, h('i'));
  const txt = h('div.muted', {}, 'Picking questions…');
  el.append(h('div.pf', {}, h('div.pf-ico', {}, '🔎'), h('h2', {}, 'Getting ready'), bar, txt,
    h('p.pf-tip', {}, TIPS[Math.floor(Math.random() * TIPS.length)])));
  const { questions, spares } = await buildQuestions(spec, { sparesRatio });
  await prepareFormats(questions);
  const urls = urlsOf(questions);
  let result = { questions, spares, dropped: 0 };
  const show = label => (d, t) => {
    bar.firstChild.style.width = `${Math.round(100 * d / Math.max(1, t))}%`;
    txt.textContent = `${label} ${d}/${t}`;
  };
  if (urls.length) {
    txt.textContent = `Loading pictures and sounds… 0/${urls.length}`;
    const { failed } = await preflight(urls, show('Loading pictures and sounds…'));
    if (failed.size) {
      console.warn('[clued] media failed', [...failed]);
      const need = questions.filter(q => questionFailed(q, failed)).length;
      const cand = spares.filter(s => !questionFailed(s, failed)).slice(0, need * 3 + 6);
      const spareUrls = urlsOf(cand);
      const sf = spareUrls.length ? (await preflight(spareUrls, show(`Swapping ${need} that didn't load…`))).failed : new Set();
      let bad = new Set([...failed, ...sf]);
      let r = swapFailed(questions, cand, bad);
      if (thinRounds(spec, r.questions).length) {
        // second chance: the slow ones again, fewer at a time and with a long timeout
        const retry = [...failed].filter(u => questions.some(q => questionFailed(q, new Set([u]))));
        const again = await preflight(retry, show('Slow connection, still loading…'), { concurrency: 3, timeoutMs: 20000 });
        bad = new Set([...bad].filter(u => !again.ok.has(u)));
        r = swapFailed(questions, cand, bad);
      }
      const used = new Set(r.questions.map(q => q.id));
      result = { ...r, spares: spares.filter(s => !used.has(s.id) && !questionFailed(s, bad)) };
    }
  }
  bar.firstChild.style.width = '100%';
  return result;
}

// Rounds holding fewer than 60% of the questions they asked for.
export function thinRounds(spec, questions) {
  return (spec.rounds || []).map((r, i) => i).filter(i => questions.filter(q => q.round === i).length < 0.6 * (spec.rounds[i].count || 1));
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

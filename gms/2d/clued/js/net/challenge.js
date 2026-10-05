// Challenge links: "beat my score on this exact set". Create from a results screen, play via ?c=ID.
import { h, fmtNum } from '../ui/kit.js?v=202610050139';
import { defineScreen, header, current, reset } from '../ui/app.js?v=202610050139';
import { popup, toast } from '../ui/popup.js?v=202610050139';
import { sfx, confetti } from '../ui/fx.js?v=202610050139';
import { getSettings } from '../core/store.js?v=202610050139';
import { createRunner } from '../structures/runner.js?v=202610050139';
import { replayCfg, replayScore } from '../structures/index.js?v=202610050139';
import { challenges, friendly } from './api.js?v=202610050139';
import { suggestedName, rememberName, tidyName, MAX_NAME } from './ident.js?v=202610050139';
import { openShare, challengeUrl, shareOrCopy } from './share.js?v=202610050139';
import { scoreboard, ordinal, detailOf, comparison } from './board.js?v=202610050139';
import { ensureStyles, setQuery } from './util.js?v=202610050139';
import { ensureFormats } from './room.js?v=202610050139';
import { openSignIn } from './signin.js?v=202610050139';
import { linkChallengeShare } from './linkchallenge.js?v=202610050139';

const MAX_SET = 500 * 1024;

async function askName(title = 'Your name') {
  const n = await suggestedName();
  const input = h('input.field', { type: 'text', maxlength: String(MAX_NAME), autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name' });
  input.value = n;
  setTimeout(() => input.focus(), 60);
  const ok = await popup({ title, body: h('div.stack', {}, input, h('p.tiny.muted', {}, 'Shown on the leaderboard.')),
    actions: [{ label: 'Cancel', value: false }, { label: 'Continue', value: true, primary: true }] });
  const v = tidyName(input.value);
  if (!ok || !v) return null;
  rememberName(v);
  return v;
}

// out = the results-screen params: { spec, title, choice, result: { score, correct, total, answers, questions } }
export async function createChallenge(out) {
  ensureStyles();
  const r = out?.result;
  if (!r?.questions?.length) { toast('Nothing to share from this game'); return null; }
  const name = await askName('Challenge a friend');
  if (!name) return null;
  const spec = { ...(out.spec || {}), timer: out.choice?.timer ?? out.spec?.timer ?? (out.spec?.kids ? false : getSettings().timer) };
  const questions = r.questions;
  if (JSON.stringify(questions).length > MAX_SET) { toast('This game is too big to share'); return null; }
  const ms = (r.answers || []).reduce((s, a) => s + (a.ms || 0), 0);
  try {
    const res = await challenges.create({ name, title: out.title || '', spec, questions, score: Math.round(r.score || 0), correct: r.correct || 0, ms, detail: detailOf(r.answers) });
    const url = challengeUrl(res.id);
    const kids = !!spec.kids;
    openShare({ url, heading: 'Challenge a friend', title: 'Clued challenge',
      text: kids ? `I got ${r.correct} stars on Clued! Can you beat me?` : `I scored ${fmtNum(r.score)} on Clued${out.title ? ` (${out.title})` : ''}. Can you beat me?` });
    return { id: res.id, url };
  } catch (e) {
    // The server path is refused (sign-in level, daily cap, paused): the serverless link always works.
    const signin = e.code === 'signin_required';
    const pick = await popup({
      title: signin ? 'Sign in for a leaderboard' : 'Leaderboard challenges are busy',
      body: h('p', {}, signin ? 'Leaderboard challenges need a free br8t sign-in right now. You can still send a link challenge: it works without the server.'
        : `${friendly(e)} You can still send a link challenge: it works without the server.`),
      actions: [...(signin ? [{ label: 'Sign in', value: 'signin' }] : []), { label: 'Send a link challenge', value: 'link', primary: true }],
    });
    if (pick === 'signin') openSignIn();
    if (pick === 'link') return linkChallengeShare(out, name);
    return null;
  }
}

// A ready-made button for A's results screen.
export function challengeButton(out, cls = 'btn grape wide') {
  return h('button', { type: 'button', class: cls, dataset: { act: 'challenge' }, onclick: () => createChallenge(out) }, '⚔️ Challenge a friend');
}

// You, the creator and the top few, for the per-question comparison.
function cmpPlayers(scores, meId) {
  const pick = [scores.find(s => s.id === meId), scores.find(s => s.creator), ...scores.slice(0, 4)].filter(Boolean);
  return [...new Map(pick.map(s => [s.id, { name: s.name, me: s.id === meId, detail: s.detail }])).values()].slice(0, 5);
}

defineScreen('challenge', async (el, { id }, cur) => {
  ensureStyles();
  setQuery('c', id);
  el.append(header('Challenge'));
  const body = h('div.net-wrap', {}, h('div.net-wait', {}, 'Loading challenge', h('span.dots')));
  el.append(body);
  let c;
  try {
    [c] = await Promise.all([challenges.get(id), ensureFormats()]);
  } catch (e) {
    if (cur !== current()) return;
    setQuery('c', null);
    body.replaceChildren(h('div.panel.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '🤔'), h('h2', {}, 'Challenge not found'), h('p', {}, friendly(e))),
      h('button.btn.primary.wide', { type: 'button', onclick: () => reset('home') }, 'Home'));
    return;
  }
  if (cur !== current()) return;
  const kids = !!c.spec?.kids;
  let run = null;

  function intro() {
    el.classList.remove('playing');
    el.innerHTML = '';
    const name = h('input.field', { type: 'text', maxlength: String(MAX_NAME), autocomplete: 'nickname', placeholder: 'Your name', 'aria-label': 'Your name', id: 'net-cname' });
    suggestedName().then(n => { if (!name.value && n && document.activeElement !== name) name.value = n; });
    const err = h('p.net-err', { role: 'alert' });
    const form = h('form.net-form', {}, h('label', { for: 'net-cname' }, 'Your name'), name, err, h('button.btn.go.big.wide', { type: 'submit', dataset: { act: 'play' } }, 'Play'));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = tidyName(name.value);
      if (!n) { err.textContent = 'Type a name first.'; name.focus(); return; }
      rememberName(n);
      play(n);
    });
    el.append(header('Challenge'), h('div.net-wrap', {},
      h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '⚔️'),
        h('h2', {}, `${c.name} challenges you!`),
        h('p', {}, [c.title, `${c.total} question${c.total === 1 ? '' : 's'}`, `${c.plays} play${c.plays === 1 ? '' : 's'}`].filter(Boolean).join(' · ')),
        h('div.net-badges', {}, h('span.net-badge', {}, kids ? `Stars to beat: ${(c.scores.find(s => s.creator) || {}).correct ?? '?'} ⭐` : `Score to beat: ${fmtNum(c.score)}`),
          kids ? h('span.net-badge.kids', {}, '🧸 Kids') : null)),
      c.scores.length ? h('div.panel.stack', {}, h('h3', {}, 'Leaderboard'), scoreboard(c.scores, { kids, top: 5 })) : null,
      h('div.panel', {}, form)));
  }

  function play(name) {
    el.innerHTML = '';
    el.classList.add('playing');
    const qs = JSON.parse(JSON.stringify(c.questions));
    run = createRunner(el, {
      questions: qs, kids, mode: 'challenge',
      difficulty: c.spec?.rounds?.[0]?.difficulty || 0,
      ...(c.spec && typeof c.spec.timer === 'boolean' ? { timer: c.spec.timer } : {}),
      ...replayCfg(c.spec, qs),
    });
    run.done.then(res => {
      res.score = replayScore(c.spec, res);
      const r = run;
      run = null;
      if (cur !== current() || r === null) return;
      if (res.aborted) { intro(); return; }
      submit(name, res);
    });
  }

  async function submit(name, res) {
    el.classList.remove('playing');
    el.innerHTML = '';
    const wrap = h('div.net-wrap', {}, h('div.net-wait', {}, 'Saving your score', h('span.dots')));
    el.append(header('Challenge', { backBtn: false }), wrap);
    const ms = (res.answers || []).reduce((s, a) => s + (a.ms || 0), 0);
    let r;
    try {
      r = await challenges.submit(id, { name, score: Math.round(res.score || 0), correct: res.correct || 0, ms, detail: detailOf(res.answers) });
    } catch (e) {
      wrap.replaceChildren(h('div.panel.net-hero', {}, h('h2', {}, 'Score not saved'), h('p', {}, friendly(e))),
        h('button.btn.primary.wide', { type: 'button', onclick: () => submit(name, res) }, 'Try again'),
        h('button.btn.wide', { type: 'button', onclick: () => reset('home') }, 'Home'));
      return;
    }
    const beat = kids ? res.correct > ((c.scores.find(s => s.creator) || {}).correct ?? Infinity) : res.score > c.score;
    if (r.rank === 1 || beat) { confetti(); sfx('fanfare'); }
    const url = challengeUrl(id);
    wrap.replaceChildren(
      h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, beat ? '🏆' : '🎯'),
        h('h2', {}, kids ? `You got ${res.correct} ⭐` : beat ? `You beat ${c.name}!` : `${fmtNum(res.score)} pts`),
        h('p', {}, kids ? `${res.correct} of ${res.total} right. Brilliant playing!` : `${ordinal(r.rank)} of ${r.plays} · ${res.correct}/${res.total} right`)),
      h('div.panel.stack', {}, h('h3', {}, 'Leaderboard'), scoreboard(r.scores, { meId: r.id, kids, top: 10 })),
      comparison(cmpPlayers(r.scores, r.id), c.questions),
      h('div.net-actions', {},
        h('button.btn.go.wide', { type: 'button', onclick: () => shareOrCopy({ url, title: 'Clued challenge', text: kids ? `I got ${res.correct} stars on this Clued challenge!` : `I scored ${fmtNum(res.score)} on this Clued challenge. Your turn!` }) }, 'Share this challenge'),
        h('button.btn.wide', { type: 'button', onclick: () => intro() }, 'Play again'),
        h('button.btn.ghost.wide', { type: 'button', onclick: () => { setQuery('c', null); reset('home'); } }, 'Home')));
  }

  intro();
  return {
    cleanup() { if (run) { const r = run; run = null; r.stop('stop'); } setQuery('c', null); },
    guard: async () => (run ? run.guard() : true),
  };
}, { cls: 'scr-challenge' });

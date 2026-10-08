// Serverless link challenges: the URL hash carries the GameSpec (with its seed), BUILD and a chain of
// up to 8 { name, score }. The receiver regenerates the identical set locally, plays it, and gets a
// reply link with their score appended. No server, no caps; works on Pages.
import { playUrl } from './share.js?v=202610081134';
import { h, fmtNum } from '../ui/kit.js?v=202610081134';
import { defineScreen, header, current, reset } from '../ui/app.js?v=202610081134';
import { toast } from '../ui/popup.js?v=202610081134';
import { sfx, confetti } from '../ui/fx.js?v=202610081134';
import { BUILD } from '../build.js?v=202610081134';
import { getSettings } from '../core/store.js?v=202610081134';
import { hashString } from '../core/rng.js?v=202610081134';
import { createRunner } from '../structures/runner.js?v=202610081134';
import { replayCfg, replayScore } from '../structures/index.js?v=202610081134';
import { prepare } from '../structures/session.js?v=202610081134';
import { suggestedName, rememberName, tidyName, MAX_NAME } from './ident.js?v=202610081134';
import { openShare, shareOrCopy } from './share.js?v=202610081134';
import { ordinal, detailOf, comparison } from './board.js?v=202610081134';
import { ensureStyles } from './util.js?v=202610081134';
import { ensureFormats } from './room.js?v=202610081134';
import { recordGame, summarize, playSecs } from '../core/stats.js?v=202610081134';

const MAX_CHAIN = 8;
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

// 'z' + deflate-raw when CompressionStream exists, else 'j' + plain JSON.
export async function encodePayload(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) {}
  }
  return 'j' + b64u(raw);
}

export async function decodePayload(s) {
  const kind = s[0], bytes = unb64u(s.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

const setHash = s => { try { history.replaceState(history.state, '', location.pathname + location.search + (s ? `#lc=${s}` : '')); } catch (e) {} };
export const setFingerprint = qs => hashString(qs.map(q => q.id).join('|')).toString(36);

function linkFor(code) {
  return `${playUrl().href}#lc=${code}`;
}

function cleanEntry(e) {
  const out = { n: tidyName(e?.n) || 'Player', s: Math.max(0, Math.round(+e?.s || 0)), r: Math.max(0, Math.round(+e?.r || 0)) };
  if (Array.isArray(e?.d) && e.d.length <= 200) out.d = e.d.map(x => (Array.isArray(x) ? [x[0] ? 1 : 0, Math.max(0, +x[1] || 0), Math.max(0, +x[2] || 0)] : [0, 0, 0]));
  return out;
}

// out = results params { spec, title, choice, result: { score, correct, questions } }
export async function createLinkChallenge(out, name, chain = []) {
  const r = out.result;
  const spec = { ...(out.spec || {}) };
  const payload = {
    v: 1, b: BUILD, t: String(out.title || '').slice(0, 60), s: spec, f: setFingerprint(r.questions || []),
    tm: out.choice?.timer ?? spec.timer ?? (spec.kids ? false : getSettings().timer),
    c: [...chain, { n: name, s: Math.round(r.score || 0), r: r.correct || 0, d: detailOf(r.answers) }].slice(-MAX_CHAIN),
  };
  return linkFor(await encodePayload(payload));
}

export async function linkChallengeShare(out, name) {
  try {
    const url = await createLinkChallenge(out, name);
    openShare({ url, heading: 'Link challenge', title: 'Clued challenge', text: `Beat my ${fmtNum(out.result.score || 0)} on Clued!` });
    return { url };
  } catch (e) {
    toast('Couldn’t make the link');
    return null;
  }
}

export async function openLinkChallenge(hash, go) {
  const m = /lc=([A-Za-z0-9_-]+)/.exec(hash || location.hash);
  if (!m) return false;
  go('linkchallenge', { code: m[1] });
  return true;
}

defineScreen('linkchallenge', async (el, { code }, cur) => {
  ensureStyles();
  setHash(code);
  el.append(header('Challenge'));
  const body = h('div.net-wrap', {}, h('div.net-wait', {}, 'Opening the challenge', h('span.dots')));
  el.append(body);
  let p;
  try {
    p = await decodePayload(code);
    if (!p || p.v !== 1 || !p.s?.rounds || !Array.isArray(p.c)) throw new Error('bad');
    p.c = p.c.slice(-MAX_CHAIN).map(cleanEntry);
    await ensureFormats();
  } catch (e) {
    setHash(null);
    body.replaceChildren(h('div.panel.net-hero', {}, h('h2', {}, 'This link is broken'), h('p', {}, 'The challenge link looks cut short. Ask for it again.')),
      h('button.btn.primary.wide', { type: 'button', onclick: () => reset('home') }, 'Home'));
    return;
  }
  if (cur !== current()) return;
  const kids = !!p.s.kids;
  const first = p.c[0], best = p.c.reduce((a, b) => (b.s > a.s ? b : a), p.c[0]);
  let run = null;

  function intro() {
    el.classList.remove('playing');
    el.innerHTML = '';
    const name = h('input.field', { type: 'text', maxlength: String(MAX_NAME), autocomplete: 'nickname', placeholder: 'Your name', id: 'net-lname', 'aria-label': 'Your name' });
    suggestedName().then(n => { if (!name.value && n && document.activeElement !== name) name.value = n; });
    const err = h('p.net-err', { role: 'alert' });
    const form = h('form.net-form', {}, h('label', { for: 'net-lname' }, 'Your name'), name, err, h('button.btn.go.big.wide', { type: 'submit', dataset: { act: 'play' } }, 'Play'));
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const n = tidyName(name.value);
      if (!n) { err.textContent = 'Type a name first.'; return; }
      rememberName(n);
      play(n);
    });
    el.append(header('Challenge'), h('div.net-wrap', {},
      h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '⚔️'),
        h('h2', {}, p.c.length > 1 ? `${best.n} leads with ${kids ? `${best.r} ⭐` : fmtNum(best.s)}` : `${first.n} challenges you!`),
        h('p', {}, [p.t, kids ? `Stars to beat: ${best.r}` : `Score to beat: ${fmtNum(best.s)}`].filter(Boolean).join(' · '))),
      p.b !== BUILD ? h('p.net-note', {}, '⚠️ This link was made with a different version of Clued, so the questions may differ slightly.') : null,
      chainBoard(p.c, null),
      h('div.panel', {}, form)));
  }

  function chainBoard(chain, meIdx) {
    const rows = chain.map((e, i) => ({ ...e, i })).sort((a, b) => (kids ? b.r - a.r : b.s - a.s));
    return h('ol.net-board', {}, ...rows.map((e, k) => h('li.net-row', { class: e.i === meIdx ? 'me' : '', style: { '--i': k } },
      h('span.rk', {}, ['🥇', '🥈', '🥉'][k] || String(k + 1)), h('span.nm', {}, e.n + (e.i === meIdx ? ' (you)' : '')), h('span.dl'),
      h('span.pt', {}, kids ? `${e.r} ⭐` : fmtNum(e.s)))));
  }

  async function play(name) {
    el.innerHTML = '';
    const prog = h('div.net-wrap');
    el.append(header('Challenge'), prog);
    let questions;
    try {
      questions = (await prepare(p.s, prog)).questions;
    } catch (e) {
      prog.replaceChildren(h('div.panel.net-hero', {}, h('h2', {}, 'Couldn’t build the questions'), h('p', {}, e.message || '')),
        h('button.btn.primary.wide', { type: 'button', onclick: intro }, 'Back'));
      return;
    }
    if (cur !== current()) return;
    if (p.f && setFingerprint(questions) !== p.f) toast('Heads up: a few questions differ from the sender’s set');
    el.innerHTML = '';
    el.classList.add('playing');
    run = createRunner(el, { questions, kids, mode: 'challenge', difficulty: p.s.rounds?.[0]?.difficulty || 0, ...(typeof p.tm === 'boolean' ? { timer: p.tm } : {}), ...replayCfg(p.s, questions) });
    run.done.then(async res => {
      res.score = replayScore(p.s, res);
      run = null;
      if (cur !== current()) return;
      if (res.aborted) { intro(); return; }
      const chain = [...p.c, { n: name, s: Math.round(res.score || 0), r: res.correct || 0, d: detailOf(res.answers) }];
      const shown = chain.slice(-MAX_CHAIN), meIdx = shown.length - 1;
      const reply = await createLinkChallenge({ spec: p.s, title: p.t, choice: { timer: p.tm }, result: { ...res, questions } }, name, p.c);
      const rank = [...shown].sort((a, b) => (kids ? b.r - a.r : b.s - a.s)).findIndex(e => e === shown[meIdx]) + 1;
      recordGame(summarize('linkchallenge', res, { spec: p.s, kids, secs: playSecs(), players: shown.length, placing: rank }));
      if (rank === 1) { confetti(); sfx('fanfare'); }
      el.classList.remove('playing');
      el.innerHTML = '';
      el.append(header('Challenge', { backBtn: false }), h('div.net-wrap', {},
        h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, rank === 1 ? '🏆' : '🎯'),
          h('h2', {}, kids ? `You got ${res.correct} ⭐` : `${fmtNum(res.score)} pts`),
          h('p', {}, `${ordinal(rank)} of ${shown.length} · ${res.correct}/${res.total} right`)),
        chainBoard(shown, meIdx),
        comparison(shown.map((e, i) => ({ name: e.n, me: i === meIdx, detail: e.d })), questions),
        h('div.net-actions', {},
          h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'reply' }, onclick: () => shareOrCopy({ url: reply, title: 'Clued challenge', text: kids ? `I got ${res.correct} stars. Your turn!` : `I scored ${fmtNum(res.score)}. Your turn!` }) }, 'Send your score back'),
          h('button.btn.wide', { type: 'button', onclick: () => openShare({ url: reply, heading: 'Pass it on', text: 'Can you beat us?' }) }, 'Show QR code'),
          h('button.btn.ghost.wide', { type: 'button', onclick: () => { setHash(null); reset('home'); } }, 'Home'))));
    });
  }

  intro();
  return {
    cleanup() { if (run) { const r = run; run = null; r.stop('stop'); } setHash(null); },
    guard: async () => (run ? run.guard() : true),
  };
}, { cls: 'scr-challenge' });

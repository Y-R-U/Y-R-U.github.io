// Live room screen: lobby → synced questions (driven through A's runner) → scoreboards → podium.
import { h, fmtNum } from '../ui/kit.js?v=202610051408';
import { defineScreen, reset, header, current } from '../ui/app.js?v=202610051408';
import { confirmPop, toast } from '../ui/popup.js?v=202610051408';
import { sfx, confetti } from '../ui/fx.js?v=202610051408';
import { createRunner } from '../structures/runner.js?v=202610051408';
import { prepare, prepareFormats } from '../structures/session.js?v=202610051408';
import { basePoints, streakMultiplier, stageMultiplier } from '../core/scoring.js?v=202610051408';
import { urlsOf, preflight } from '../core/media.js?v=202610051408';
import { randomSeed } from '../core/rng.js?v=202610051408';
import { listFormats } from '../formats/registry.js?v=202610051408';
import { loadFormats } from '../formats/index.js?v=202610051408';
import { friendly } from './api.js?v=202610051408';
import { getTransport } from './transport.js?v=202610051408';
import { sharePanel, joinUrl, p2pUrl } from './share.js?v=202610051408';
import { scoreboard, podium, ordinal, timingPanel } from './board.js?v=202610051408';
import { ensureStyles, dropSeat, setQuery, gapLabel, TRUST_HINT, mmss } from './util.js?v=202610051408';

const DIFF = ['Mixed', 'Easy', 'Medium', 'Hard'];
let formatsP = null;
export const ensureFormats = () => formatsP || (formatsP = listFormats().length > 2 ? Promise.resolve() : loadFormats().catch(() => {}));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const eligible = st => st.players.filter(p => !p.late && p.online).length;
const hostName = st => st.players.find(p => p.host)?.name || 'the host';

defineScreen('room', async (el, { code, key, st: initial, via = 'server' }, cur) => {
  const T = getTransport(via);
  const serverNow = T.now;
  ensureStyles();
  setQuery(via === 'p2p' ? 'p2p' : 'join', code);
  await ensureFormats();
  const ctx = { st: null, game: -1, run: null, view: '', waiters: [], qcache: new Map(), live: null, asking: null, wasHost: null, timers: new Set(), ended: false };
  const every = (fn, ms) => { const id = setInterval(fn, ms); ctx.timers.add(id); return id; };

  const linkDot = h('div.net-link-dot', { hidden: true }, 'Reconnecting…');
  document.body.append(linkDot);
  T.syncClock();
  every(() => T.syncClock(3), 60000);
  const onVis = () => { if (!document.hidden) { sub.refresh(); T.syncClock(3); } };
  document.addEventListener('visibilitychange', onVis);

  function setView(name) {
    if (ctx.view === name && name !== 'play') return false;
    ctx.view = name;
    el.classList.toggle('playing', name === 'play');
    if (name !== 'play') el.innerHTML = '';
    return true;
  }

  function waitFor(pred) {
    if (ctx.st && pred(ctx.st)) return Promise.resolve(ctx.st);
    return new Promise(res => ctx.waiters.push(st => (pred(st) ? (res(st), true) : false)));
  }

  function onState(st) {
    if (cur !== current()) return;
    ctx.st = st;
    window.__cluedRoom = { code, st, view: ctx.view, link: sub?.mode };
    if (ctx.wasHost === false && st.you.host) { toast('You’re the host now'); sfx('join'); }
    ctx.wasHost = st.you.host;
    if (st.game !== ctx.game) { stopRunner(); ctx.game = st.game; ctx.qcache.clear(); }
    ctx.waiters = ctx.waiters.filter(w => !w(st));
    if (st.phase === 'lobby') { stopRunner(); showLobby(st); return; }
    if (st.phase === 'final') { stopRunner(); showFinal(st); return; }
    if (ctx.run) {
      syncStages(st);
      updateLive(st);
      if (st.phase === 'reveal' && ctx.asking === st.q) { ctx.asking = null; ctx.run.timeUp(); }
    } else if (st.phase === 'question' && st.you.joinedQ <= st.q) {
      startRunner(st);
    } else {
      showBetween(st);
    }
    if (st.phase === 'reveal') prefetch(st.q + 1);
  }

  function onEnd(why) {
    ctx.ended = true;
    stopRunner();
    dropSeat(code);
    setQuery('join', null);
    if (why === 'bad_key') { reset('join', { code, fresh: true }); return; }
    setView('ended');
    const kicked = why === 'kicked';
    el.append(header('Clued online', { backBtn: false }),
      h('div.net-wrap', {}, h('div.panel.net-hero', {},
        h('div', { style: { fontSize: '54px' } }, kicked ? '👋' : '🏁'),
        h('h2', {}, kicked ? 'You were removed' : 'This room has ended'),
        h('p', {}, kicked ? 'The host removed you from this room.' : 'Rooms close after 6 hours without play.')),
        h('button.btn.primary.wide', { type: 'button', onclick: () => reset('home') }, 'Home')));
  }

  let lobbyRefs = null, finalShown = -1;
  const sub = T.subscribe(code, key, { onState, onEnd, onLink: up => { linkDot.hidden = up; } });
  if (initial) sub.push(initial);

  /* -------------------------------------------------------------- lobby */
  function showLobby(st) {
    if (setView('lobby') || !lobbyRefs) {
      const url = via === 'p2p' ? p2pUrl(code) : joinUrl(code);
      const players = h('div.net-players');
      const count = h('div.net-count');
      const actions = h('div.net-actions.net-sticky');
      const settings = h('div');
      const badges = h('div.net-badges');
      el.append(header('Game lobby', { right: h('button.icon-btn', { type: 'button', 'aria-label': 'Leave room', onclick: leave }, '🚪') }),
        h('div.net-wrap.wide', {},
          h('div.net-hero', {}, h('h2', {}, st.title || 'Clued online'), badges),
          h('div.net-lobby-grid', {},
            h('div.panel', {}, sharePanel({ url, code, title: 'Join my Clued game', text: `Join my Clued game! Code ${code}`, big: true }),
              h('p.net-note', { style: { margin: '10px 0 0' } }, 'Scan the code or open the link, type a name, and you’re in.'),
              h('p.net-note', { style: { margin: '6px 0 0' } }, TRUST_HINT), T.lobbyNote ? T.lobbyNote(code, st) : null),
            h('div.stack', {}, h('div.panel.stack', {}, count, players), settings, actions))));
      lobbyRefs = { players, count, actions, settings, badges };
    }
    const r = lobbyRefs;
    r.badges.replaceChildren(...[
      h('span.net-badge', {}, `${st.total} question${st.total === 1 ? '' : 's'}`),
      h('span.net-badge.diff', {}, st.p2p ? '📡 Device room' : st.public ? '🌍 Public' : '🔒 Private'),
      st.kids ? h('span.net-badge.kids', {}, '🧸 Kids game') : null,
      !st.kids && st.difficulty ? h('span.net-badge.diff', {}, DIFF[st.difficulty] || '') : null].filter(Boolean));
    r.count.textContent = `${st.players.length} player${st.players.length === 1 ? '' : 's'}`;
    r.players.replaceChildren(...st.players.map(p => h('span.net-player', { class: `${p.id === st.you.id ? 'me' : ''} ${p.online ? '' : 'off'}`, dataset: { id: p.id } },
      p.host ? h('span.crown', { title: 'Host' }, '👑') : null,
      h('span.nm', {}, p.name),
      st.you.host && p.id !== st.you.id ? h('button.kick', { type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => kick(p) }, '×') : null)));
    const timingKey = `${st.you.host}|${st.answerSec}|${st.gapSec}`;
    if (r.timingKey !== timingKey) {
      r.timingKey = timingKey;
      r.settings.replaceChildren();
      if (st.you.host) {
        r.settings.append(timingPanel({ answerSec: st.answerSec, gapSec: st.gapSec,
          onChange: (v, which) => T.host(code, key, 'settings', { [which]: v[which] }).then(s => sub.push(s)).catch(e => toast(friendly(e))) }));
      } else {
        r.settings.append(h('div.net-badges', {}, h('span.net-badge.diff', {}, `⏱ ${st.answerSec} s to answer`), h('span.net-badge.diff', {}, `Next: ${gapLabel(st.gapSec)}`)));
      }
    }
    r.actions.replaceChildren();
    if (st.you.host) {
      r.actions.append(h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'start' }, onclick: e => hostAct('start', e.currentTarget) },
        st.players.length > 1 ? `Start game · ${st.players.length} players` : 'Start game'));
      if (st.players.length < 2) r.actions.append(h('p.net-note', {}, 'Waiting for friends to join… you can also start solo.'));
    } else if (!st.startAt) {
      r.actions.append(h('div.net-wait', {}, `Waiting for ${hostName(st)} to start`, h('span.dots')));
    }
    if (st.startAt) {
      const cd = h('div.net-wait.net-startcd');
      r.actions.append(cd);
      const tick = () => {
        if (!cd.isConnected) { clearInterval(id); ctx.timers.delete(id); return; }
        cd.textContent = `Game starts in ${mmss(st.startAt - serverNow())}`;
      };
      const id = every(tick, 500);
      tick();
    }
  }

  async function kick(p) {
    if (!(await confirmPop(`Remove ${p.name}?`, 'They’ll be taken out of this room.', 'Remove', 'Cancel', true))) return;
    T.host(code, key, 'kick', { playerId: p.id }).then(s => sub.push(s)).catch(e => toast(friendly(e)));
  }

  async function hostAct(action, btn, extra) {
    if (btn) btn.disabled = true;
    try { sub.push(await T.host(code, key, action, extra)); } catch (e) { toast(friendly(e)); if (btn) btn.disabled = false; }
  }

  /* ------------------------------------------------- questions (runner) */
  function stopRunner() {
    if (ctx.run) { try { ctx.run.stop('stop'); } catch (e) {} }
    ctx.run = null; ctx.live = null; ctx.asking = null;
  }

  function startRunner(st) {
    const base = st.q, total = st.total, game = st.game;
    setView('play');
    el.innerHTML = '';
    const qs = Array.from({ length: total - base }, (_, i) => ({ format: '_pending', id: `pending:${base + i}` }));
    const run = createRunner(el, {
      questions: qs, kids: st.kids, difficulty: st.difficulty, mode: 'online', timer: true, total: total - base,
      now: serverNow,
      deadlineFor: i => (ctx.st.q === base + i && ctx.st.phase === 'question' ? ctx.st.qDeadline : 0),
      limitFor: () => ctx.st.limitMs || 10000,
      label: i => `${base + i + 1} / ${total}`,
      before: (i, q) => beforeQ(base + i, q, run),
      onQuestion: i => {
        ctx.asking = base + i;
        syncStages(ctx.st);
        const s = ctx.st;
        if (s.q !== base + i || s.phase !== 'question' || s.you.last) setTimeout(() => { if (ctx.asking === base + i) { ctx.asking = null; run.timeUp(); } }, 60);
      },
      scoreFn: () => basePoints({ timed: !ctx.st.kids, remaining: Math.max(0, ctx.st.qDeadline - serverNow()), limit: ctx.st.limitMs || 20000 }),
      onAnswer: rec => sendAnswer(base + rec.i, rec, run),
      requestMore: i => T.vote(code, key, base + i).then(s => sub.push(s)).catch(e => { if (e.status !== 409) toast(friendly(e)); }),
      revealExtra: rec => liveBox(base + rec.i),
      waitNext: i => waitFor(s => s.game !== game || s.phase === 'final' || s.phase === 'lobby' || (s.phase !== 'lobby' && s.q > base + i)),
      waitLabel: ' ',
      onQuit: leave,
    });
    ctx.run = run;
    run.state.score = st.you ? (st.players.find(p => p.id === st.you.id)?.score || 0) : 0;
    run.done.then(() => { if (ctx.run === run) ctx.run = null; });
  }

  async function beforeQ(a, q, run) {
    const st = await waitFor(s => s.phase !== 'lobby' && s.q >= a);
    if (ctx.run !== run) return;
    let data = null;
    for (let tries = 0; !data && tries < 6 && ctx.run === run; tries++) {
      try { data = await getQuestion(a); } catch (e) {
        ctx.qcache.delete(a);
        if (e.status === 404 && st.q > a) break;
        await sleep(600 * (tries + 1));
      }
    }
    for (const k of Object.keys(q)) delete q[k];
    Object.assign(q, data ? data.question : { format: 'mc', prompt: 'This question didn’t load.', options: [{ text: 'Skip' }], answer: 0 });
    if (data) await prepareFormats([q]);
    if (ctx.st.q === a && ctx.st.phase === 'question') await countdown(a, run);
  }

  function countdown(a, run) {
    return new Promise(res => {
      const stage = el.querySelector('.stage');
      const n = h('div.n');
      const box = h('div.net-count3', {}, h('div', {}, n, h('p', {}, `Question ${a + 1} of ${ctx.st.total}`)));
      if (stage) { stage.innerHTML = ''; stage.append(box); }
      let last = null;
      const tick = () => {
        const left = ctx.st.qStart - serverNow();
        if (left <= 0 || ctx.run !== run || ctx.st.q !== a) { clearInterval(id); ctx.timers.delete(id); box.remove(); res(); return; }
        const s = Math.ceil(left / 1000);
        if (s !== last) { last = s; n.textContent = String(s); sfx('tick'); }
      };
      const id = every(tick, 80);
      tick();
    });
  }

  // Progressive questions: mirror the server's stage, votes and lock into the runner.
  function syncStages(st) {
    const run = ctx.run;
    if (!run || st.phase !== 'question' || !st.stages || ctx.asking !== st.q) return;
    if (st.stage > run.stage) run.setStage(st.stage, st.qDeadline, st.limitMs);
    run.setVotes(st.votes, st.needed, st.you.voted);
    if (st.locked) run.lockStages();
  }

  function getQuestion(i) {
    if (!ctx.qcache.has(i)) ctx.qcache.set(i, T.question(code, key, i));
    return ctx.qcache.get(i);
  }

  function prefetch(i) {
    if (!ctx.st || i >= ctx.st.total || ctx.qcache.has(i)) return;
    getQuestion(i).then(async d => { await prepareFormats([d.question]); return preflight(urlsOf([d.question])); }).catch(() => ctx.qcache.delete(i));
  }

  async function sendAnswer(a, rec, run) {
    if (ctx.asking === a) ctx.asking = null;
    if (rec.timeout || rec.skipped) { updateLive(ctx.st); return; }
    const sm = rec.stages ? stageMultiplier(rec.stage, rec.stages) : 1; // the server applies its own stage
    const base = (rec.correct ? rec.points / streakMultiplier(rec.streak) : rec.points) / sm;
    const body = { q: a, given: rec.given, correct: rec.correct, points: Math.round(base || 0), ms: Math.max(0, Math.round(serverNow() - ctx.st.qStart)) };
    for (let tries = 0; tries < 3; tries++) {
      try {
        const r = await T.answer(code, key, body);
        if (ctx.run === run) run.state.score = r.score;
        sub.push(r.state);
        return;
      } catch (e) {
        if (e.code === 'too_late') { toast('Too late: that answer didn’t count'); return; }
        if (e.status && e.status < 500 && e.status !== 429) return;
        await sleep(500);
      }
    }
  }

  function liveBox(a) {
    const box = h('div.net-live.stack');
    ctx.live = { a, box };
    updateLive(ctx.st);
    return box;
  }

  function updateLive(st) {
    const L = ctx.live;
    if (!L || !st || st.q !== L.a) return;
    const me = st.players.find(p => p.id === st.you.id);
    if (ctx.run && me) ctx.run.state.score = me.score;
    if (st.phase === 'question') {
      L.box.replaceChildren(h('div.net-wait', {}, `Waiting for others · ${st.answered}/${eligible(st)} answered`, h('span.dots')));
      return;
    }
    L.box.replaceChildren(...revealParts(st));
  }

  // Server-side result, scoreboard and host controls, shared by the runner reveal and the between view.
  function revealParts(st) {
    const me = st.players.find(p => p.id === st.you.id);
    const out = [];
    if (st.you.last && !st.kids) out.push(h('div.net-wait', {}, `+${fmtNum(st.you.last.points)} pts · ${ordinal(st.you.rank)} of ${st.players.length}`));
    else if (st.kids && me) out.push(h('div.net-wait', {}, `You have ${me.correct} ⭐`));
    out.push(scoreboard(st.players, { meId: st.you.id, kids: st.kids, deltas: true, top: 5 }));
    out.push(nextControls(st));
    return out;
  }

  function nextControls(st) {
    const last = st.q + 1 >= st.total;
    const auto = h('div.net-auto');
    const wrap = h('div.stack', {}, auto);
    if (st.auto && st.revealAt) {
      const bar = h('div.net-gap', {}, h('i'));
      wrap.prepend(bar);
      const total = (st.gapSec || 5) * 1000;
      const tick = () => {
        const left = Math.max(0, st.revealAt - serverNow());
        const s = Math.ceil(left / 1000);
        bar.firstChild.style.transform = `scaleX(${Math.min(1, left / total)})`;
        auto.textContent = last ? `Final results in ${s}…` : `Next question in ${s}…`;
        if (!auto.isConnected) { clearInterval(id); ctx.timers.delete(id); }
      };
      const id = every(tick, 100);
      tick();
    } else if (!st.you.host) auto.textContent = `Waiting for ${hostName(st)}…`;
    if (st.you.host) {
      wrap.append(h('div.net-next', {},
        h('button.btn.go', { type: 'button', dataset: { act: 'next' }, onclick: e => hostAct('next', e.currentTarget) }, last ? 'Final results' : 'Next question ›')));
    }
    return wrap;
  }

  /* --------------------------------------- between (late join / rejoin) */
  function showBetween(st) {
    setView('between');
    el.innerHTML = '';
    const late = st.phase === 'question';
    const body = h('div.net-wrap');
    el.append(header(`Question ${Math.min(st.q + 1, st.total)} of ${st.total}`, { right: h('button.icon-btn', { type: 'button', 'aria-label': 'Leave room', onclick: leave }, '🚪') }), body);
    if (late) {
      body.append(h('div.panel.net-hero', {}, h('div', { style: { fontSize: '54px' } }, '🎉'),
        h('h2', {}, 'You’re in!'), h('p', {}, st.q + 1 < st.total ? 'You’ll play from the next question.' : 'This is the last question; you’ll see the results.')),
        h('div.net-wait', {}, `Others are answering · ${st.answered}/${eligible(st)}`, h('span.dots')),
        scoreboard(st.players, { meId: st.you.id, kids: st.kids, top: 5 }));
    } else {
      body.append(h('h2.center', {}, 'Scores so far'), ...revealParts(st));
    }
  }

  /* -------------------------------------------------------------- final */
  function showFinal(st) {
    if (setView('final') === false && finalShown === st.game) { updateFinal(st); return; }
    finalShown = st.game;
    el.innerHTML = '';
    const wrap = h('div.net-wrap');
    el.append(header('Final results', { right: h('button.icon-btn', { type: 'button', 'aria-label': 'Leave room', onclick: leave }, '🚪') }), wrap);
    ctx.finalWrap = wrap;
    updateFinal(st);
    const me = st.players.findIndex(p => p.id === st.you.id);
    if (me === 0 || st.kids) { confetti(); sfx('fanfare'); }
  }

  function updateFinal(st) {
    const wrap = ctx.finalWrap;
    if (!wrap) return;
    const meRow = st.players.find(p => p.id === st.you.id);
    const parts = [podium(st.players, { kids: st.kids })];
    if (st.kids) {
      parts.push(h('div.panel.net-hero', {}, h('h2', {}, meRow ? `You got ${meRow.correct} ⭐` : 'Well played!'), h('p', {}, 'Great playing, everyone!')));
      parts.push(scoreboard(st.players, { meId: st.you.id, kids: true }));
    } else {
      if (meRow) parts.push(h('div.net-wait', {}, `You finished ${ordinal(st.you.rank)} with ${fmtNum(meRow.score)} pts · ${meRow.correct}/${st.total} right · best streak ${meRow.best}`));
      parts.push(scoreboard(st.players, { meId: st.you.id, top: 60 }));
    }
    const actions = h('div.net-actions');
    if (st.you.host) actions.append(h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'again' }, onclick: e => playAgain(st, e.currentTarget) }, 'Play again'));
    else if (st.closed) actions.append(h('div.net-wait', {}, st.hostLost ? 'Lost the host’s device: these are the last scores.' : 'The host closed the room.'));
    else actions.append(h('div.net-wait', {}, `${hostName(st)} can start another round`, h('span.dots')));
    actions.append(h('button.btn.wide', { type: 'button', onclick: leave }, 'Leave room'));
    parts.push(actions);
    wrap.replaceChildren(...parts);
  }

  async function playAgain(st, btn) {
    btn.disabled = true;
    const spec = { ...(st.spec || {}), seed: randomSeed() };
    const overlay = h('div.panel');
    btn.after(overlay);
    try {
      const r = await prepare(spec, overlay);
      if (!r.questions.length) throw new Error('No questions');
      await hostAct('again', null, { spec, title: st.title, questions: r.questions });
    } catch (e) {
      toast(friendly(e));
      btn.disabled = false;
    }
    overlay.remove();
  }

  /* -------------------------------------------------------------- leave */
  async function confirmLeave() {
    if (ctx.ended) return true;
    const host = ctx.st?.you?.host && ctx.st.players.length > 1;
    if (!(await confirmPop('Leave this room?', host ? (ctx.st.p2p ? 'This device is hosting: the game ends for everyone.' : 'Someone else will become the host.') : 'You can rejoin with the link while the room is open.', 'Leave', 'Stay', true))) return false;
    ctx.ended = true;
    try { await T.leave(code, key); } catch (e) {}
    dropSeat(code);
    setQuery('join', null);
    return true;
  }
  async function leave() {
    if (await confirmLeave()) reset('home');
  }

  return {
    cleanup() {
      ctx.ended = true;
      sub.close();
      stopRunner();
      ctx.timers.forEach(id => clearInterval(id));
      document.removeEventListener('visibilitychange', onVis);
      linkDot.remove();
      ctx.waiters = [];
      window.__cluedRoom = null;
    },
    guard: confirmLeave,
  };
}, { cls: 'scr-room' });

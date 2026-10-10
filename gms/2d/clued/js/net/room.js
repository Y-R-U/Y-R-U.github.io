// Live room screen: lobby → synced questions (driven through A's runner) → scoreboards → podium.
import { h, fmtNum } from '../ui/kit.js?v=202610100431';
import { defineScreen, reset, header, current } from '../ui/app.js?v=202610100431';
import { confirmPop, toast } from '../ui/popup.js?v=202610100431';
import { sfx, confetti } from '../ui/fx.js?v=202610100431';
import { createRunner } from '../structures/runner.js?v=202610100431';
import { prepare, prepareFormats } from '../structures/session.js?v=202610100431';
import { basePoints, streakMultiplier, stageMultiplier } from '../core/scoring.js?v=202610100431';
import { urlsOf, preflight } from '../core/media.js?v=202610100431';
import { randomSeed } from '../core/rng.js?v=202610100431';
import { listFormats } from '../formats/registry.js?v=202610100431';
import { loadFormats } from '../formats/index.js?v=202610100431';
import { friendly } from './api.js?v=202610100431';
import { getTransport } from './transport.js?v=202610100431';
import { sharePanel, joinUrl, p2pUrl } from './share.js?v=202610100431';
import { scoreboard, podium, ordinal, timingPanel, roundsTable, pointsBreakdown } from './board.js?v=202610100431';
import { streakOption } from '../ui/streakopt.js?v=202610100431';
import { roundAt, specRound, annotateTimes, fitSet } from './roundset.js?v=202610100431';
import { roundTitle, roundThemes } from '../structures/rounds.js?v=202610100431';
import { getFormat } from '../formats/registry.js?v=202610100431';
import { ensureStyles, dropSeat, setQuery, gapLabel, TRUST_HINT, mmss } from './util.js?v=202610100431';
import { trackRoom } from '../core/stats.js?v=202610100431';

const DIFF = ['Mixed', 'Easy', 'Medium', 'Hard'];
let formatsP = null;
export const ensureFormats = () => formatsP || (formatsP = listFormats().length > 2 ? Promise.resolve() : loadFormats().catch(() => {}));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const eligible = st => st.players.filter(p => !p.late && p.online).length;
const hostName = st => st.players.find(p => p.host)?.name || 'the host';
const byScore = ps => ps.slice().sort((a, b) => b.score - a.score);

// Display info for round ordinal `ord` of a multi-round room.
function roundInfo(st, ord) {
  const r = specRound(st, ord) || {};
  const f = getFormat(r.format);
  const size = st.roundSizes[ord];
  return { n: ord + 1, of: st.roundSizes.length, size, icon: f?.icon || '❓', title: r.format ? roundTitle(r) : `Round ${ord + 1}`,
    sub: `${r.format ? roundThemes(r, st.kids) : ''} · ${size} question${size === 1 ? '' : 's'}`.replace(/^ · /, '') };
}

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
    trackRoom(st, code, via);
    window.__cluedRoom = { code, st, view: ctx.view, link: sub?.mode };
    if (ctx.wasHost === false && st.you.host) { toast('You’re the host now'); sfx('join'); }
    ctx.wasHost = st.you.host;
    if (st.game !== ctx.game) { stopRunner(); ctx.game = st.game; ctx.qcache.clear(); }
    ctx.waiters = ctx.waiters.filter(w => !w(st));
    if (st.phase === 'lobby') { stopRunner(); showLobby(st); return; }
    if (st.phase === 'final') { stopRunner(); showFinal(st); return; }
    if (ctx.run) {
      syncStages(st);
      // the opening moved (media hold) after this question rendered: keep the ring on the server's deadline
      if (st.phase === 'question' && ctx.asking === st.q && ctx.deadline !== st.qDeadline) { ctx.deadline = st.qDeadline; ctx.run.setDeadline(st.qDeadline, st.limitMs); }
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
  // Tell the room this client reports when each question's media is loaded, so openings can wait for it (TIMING.md).
  try { T.ready?.(code, key, -1)?.catch(() => {}); } catch (e) {}

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
      const rlist = h('ol.net-rlist');
      el.querySelector('.net-hero').append(rlist);
      lobbyRefs = { players, count, actions, settings, badges, rlist };
    }
    const r = lobbyRefs;
    const rkey = JSON.stringify([st.game, st.roundSizes]);
    if (r.rkey !== rkey) {
      r.rkey = rkey;
      r.rlist.replaceChildren(...(st.roundSizes || []).map((_, k) => { const R = roundInfo(st, k); return h('li', {}, h('span.ri', {}, R.icon), h('b', {}, R.title), h('small', {}, R.sub)); }));
    }
    const nr = st.roundSizes?.length || 1;
    r.badges.replaceChildren(...[
      nr > 1 ? h('span.net-badge', {}, `${nr} rounds`) : null,
      h('span.net-badge', {}, `${st.total} question${st.total === 1 ? '' : 's'}`),
      h('span.net-badge.diff', {}, st.p2p ? '📡 Device room' : st.public ? '🌍 Public' : '🔒 Private'),
      st.kids ? h('span.net-badge.kids', {}, '🧸 Kids game') : null,
      !st.kids && st.difficulty ? h('span.net-badge.diff', {}, DIFF[st.difficulty] || '') : null].filter(Boolean));
    r.count.textContent = `${st.players.length} player${st.players.length === 1 ? '' : 's'}`;
    r.players.replaceChildren(...st.players.map(p => h('span.net-player', { class: `${p.id === st.you.id ? 'me' : ''} ${p.online ? '' : 'off'}`, dataset: { id: p.id } },
      p.host ? h('span.crown', { title: 'Host' }, '👑') : null,
      h('span.nm', {}, p.name),
      st.you.host && p.id !== st.you.id ? h('button.kick', { type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => kick(p) }, '×') : null)));
    const streakOn = st.streakBonus !== false;
    const timingKey = `${st.you.host}|${st.answerSec}|${st.gapSec}|${streakOn}`;
    if (r.timingKey !== timingKey) {
      r.timingKey = timingKey;
      r.settings.replaceChildren();
      if (st.you.host) {
        const panel = timingPanel({ answerSec: st.answerSec, gapSec: st.gapSec,
          onChange: (v, which) => T.host(code, key, 'settings', { [which]: v[which] }).then(s => sub.push(s)).catch(e => toast(friendly(e))) });
        if (!st.kids) panel.append(streakOption(streakOn, v => T.host(code, key, 'settings', { streak: v }).then(s => sub.push(s)).catch(e => toast(friendly(e)))));
        r.settings.append(panel);
      } else {
        r.settings.append(h('div.net-badges', {}, h('span.net-badge.diff', {}, `⏱ ${st.answerSec} s to answer`), h('span.net-badge.diff', {}, `Next: ${gapLabel(st.gapSec)}`),
          st.kids ? null : h('span.net-badge.diff', { dataset: { badge: 'streak' } }, streakOn ? '🔥 Streaks add points' : '🔥 Streaks just for show')));
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
      noStreak: st.streakBonus === false,
      now: serverNow,
      deadlineFor: i => (ctx.st.q === base + i && ctx.st.phase === 'question' ? ctx.st.qDeadline : 0),
      limitFor: () => ctx.st.limitMs || 10000,
      label: i => { const R = roundAt(ctx.st, base + i); return R ? `Round ${R.ord + 1} · ${R.pos + 1}/${R.size}` : `${base + i + 1} / ${total}`; },
      before: (i, q) => beforeQ(base + i, q, run),
      onQuestion: i => {
        ctx.asking = base + i;
        syncStages(ctx.st);
        const s = ctx.st;
        if (s.q !== base + i || s.phase !== 'question' || s.you.last) setTimeout(() => { if (ctx.asking === base + i) { ctx.asking = null; run.timeUp(); } }, 60);
      },
      scoreFn: () => basePoints({ timed: !ctx.st.kids, remaining: Math.max(0, ctx.st.qDeadline - serverNow()), limit: ctx.st.limitMs || 20000 }),
      onAnswer: rec => sendAnswer(base + rec.i, rec, run),
      stagesAuto: true, // progressive stages auto-advance for everyone (server/host timer); no voting in rooms
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
    // Replace the previous reveal (and its Next button) at once: a stale tap on it used to end this question
    // during its lead-in, so everyone got "Time's up" at the start (TIMING.md). Load while counting down.
    const counting = ctx.st.q === a && ctx.st.phase === 'question' ? countdown(a, run) : null;
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
    // formats that preload their own media (listen) refresh stale URLs while loading: skip their extra HEAD round trip
    if (data && !getFormat(q.format)?.preload) await prepareFormats([q]);
    if (data && ctx.run === run) {
      preloadMedia(q).then(() => { if (ctx.run === run && T.ready) T.ready(code, key, a).then(s => s && sub.push(s)).catch(() => {}); });
    }
    if (counting) await counting;
  }

  // Fetch + decode the question's media during the lead-in, so it plays the moment the question opens.
  function preloadMedia(q) {
    const fmt = getFormat(q.format);
    const job = fmt?.preload ? Promise.resolve().then(() => fmt.preload(q)) : preflight(urlsOf([q]));
    return Promise.race([job.catch(() => {}), sleep(12000)]);
  }

  function countdown(a, run) {
    return new Promise(res => {
      const stage = el.querySelector('.stage');
      const n = h('div.n');
      const R = roundAt(ctx.st, a);
      const ptxt = el.querySelector('.prog-txt');
      if (R && ptxt) ptxt.textContent = `Round ${R.ord + 1} · ${R.pos + 1}/${R.size}`;
      const box = R?.first ? roundCard(ctx.st, R, n) : h('div.net-count3', {}, h('div', {}, n, h('p', {}, `Question ${a + 1} of ${ctx.st.total}`)));
      const wait = h('p.net-hold', { hidden: true }, 'Waiting for everyone’s question to load…');
      (box.querySelector('.nr-in') || box.firstChild || box).append(wait);
      if (stage) { stage.innerHTML = ''; stage.append(box); }
      let last = null;
      const tick = () => {
        const left = ctx.st.qStart - serverNow();
        if ((left <= 0 && !ctx.st.hold) || ctx.run !== run || ctx.st.q !== a || ctx.st.phase !== 'question') { clearInterval(id); ctx.timers.delete(id); box.remove(); res(); return; }
        wait.hidden = !ctx.st.hold;
        const s = ctx.st.hold ? '…' : Math.max(1, Math.ceil(left / 1000));
        if (s !== last) { last = s; n.textContent = String(s); if (!ctx.st.hold) sfx('tick'); }
      };
      const id = every(tick, 80);
      tick();
    });
  }

  // Shown during the longer lead-in before each round's first question: what's next, and the scores so far.
  function roundCard(st, R, n) {
    const I = roundInfo(st, R.ord);
    return h('div.net-count3.net-round', { dataset: { round: String(R.ord) } }, h('div.nr-in', {},
      h('div.nr-kick', {}, `Round ${I.n} of ${I.of}`),
      h('div.nr-ico', {}, I.icon),
      h('h2.nr-name', {}, I.title),
      h('p.nr-sub', {}, I.sub),
      R.ord > 0 ? scoreboard(byScore(st.players), { meId: st.you.id, kids: st.kids, top: 3 }) : null,
      h('div.nr-go', {}, h('span', {}, 'Starts in'), n)));
  }

  // Progressive questions: mirror the server's auto-advancing stage into the runner.
  function syncStages(st) {
    const run = ctx.run;
    if (!run || st.phase !== 'question' || !st.stages || ctx.asking !== st.q) return;
    if (st.stage > run.stage) run.setStage(st.stage, st.qDeadline, st.limitMs);
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
    const base = (rec.correct && ctx.st.streakBonus !== false ? rec.points / streakMultiplier(rec.streak) : rec.points) / sm;
    // ms against the server's question start (not this device's render), so equal taps score equally
    const body = { q: a, given: rec.given, correct: rec.correct, points: Math.round(base || 0), ms: Math.max(0, Math.round(serverNow() - ctx.st.qStart)) };
    if (rec.detail && typeof rec.detail.played === 'number') body.replays = Math.max(0, rec.detail.played - 1);
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
    // the runner's card shows a local estimate; the server's points (and the breakdown below) are the real ones
    const pts = el.querySelector('.rv-head .pts');
    if (pts && st.you.last) pts.textContent = `+${fmtNum(st.you.last.points)}`;
  }

  // Server-side result, scoreboard and host controls, shared by the runner reveal and the between view.
  function revealParts(st) {
    const me = st.players.find(p => p.id === st.you.id);
    const R = roundAt(st, st.q);
    const endOfRound = R?.last && st.phase === 'reveal';
    const out = [];
    const streakBonus = st.streakBonus !== false;
    if (st.you.last && !st.kids) {
      out.push(h('div.net-wait', {}, `+${fmtNum(st.you.last.points)} pts · ${ordinal(st.you.rank)} of ${st.players.length}`));
      const why = pointsBreakdown(st.you.last, { streakBonus });
      if (why) out.push(h('div.net-why', { dataset: { why: '1' } }, why));
    }
    else if (st.kids && me) out.push(h('div.net-wait', {}, `You have ${me.correct} ⭐`));
    if (endOfRound) out.push(h('div.net-round-end', { dataset: { roundEnd: String(R.ord) } }, h('b', {}, `End of round ${R.ord + 1} of ${R.n}`),
      R.ord + 1 < R.n ? h('span', {}, `Next: ${roundInfo(st, R.ord + 1).title}`) : h('span', {}, 'Final results next')));
    out.push(scoreboard(st.players, { meId: st.you.id, kids: st.kids, deltas: true, top: 5, round: endOfRound ? R.ord : null, streakBonus }));
    out.push(nextControls(st));
    return out;
  }

  function nextControls(st) {
    const last = st.q + 1 >= st.total;
    const R = roundAt(st, st.q);
    const nextRound = !last && R?.last ? R.ord + 2 : 0;
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
        auto.textContent = last ? `Final results in ${s}…` : nextRound ? `Round ${nextRound} in ${s}…` : `Next question in ${s}…`;
        if (!auto.isConnected) { clearInterval(id); ctx.timers.delete(id); }
      };
      const id = every(tick, 100);
      tick();
    } else if (!st.you.host) auto.textContent = `Waiting for ${hostName(st)}…`;
    if (st.you.host) {
      wrap.append(h('div.net-next', {},
        h('button.btn.go', { type: 'button', dataset: { act: 'next' }, onclick: e => hostAct('next', e.currentTarget, { q: st.q }) }, last ? 'Final results' : nextRound ? `Round ${nextRound} ›` : 'Next question ›')));
    }
    return wrap;
  }

  /* --------------------------------------- between (late join / rejoin) */
  function showBetween(st) {
    setView('between');
    el.innerHTML = '';
    const late = st.phase === 'question';
    const body = h('div.net-wrap');
    const RB = roundAt(st, Math.min(st.q, st.total - 1));
    el.append(header(RB ? `Round ${RB.ord + 1} · Q${RB.pos + 1}/${RB.size}` : `Question ${Math.min(st.q + 1, st.total)} of ${st.total}`, { right: h('button.icon-btn', { type: 'button', 'aria-label': 'Leave room', onclick: leave }, '🚪') }), body);
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
      if (st.roundSizes?.length > 1) parts.push(roundsTable(st.players, st.roundSizes.map((_, k) => roundInfo(st, k)), { meId: st.you.id }));
    }
    const actions = h('div.net-actions');
    if (st.you.host) actions.append(h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'again' }, onclick: e => playAgain(st, e.currentTarget) }, 'Play again'));
    else if (st.closed) actions.append(h('div.net-wait', {}, st.hostLost ? 'Lost the host’s device: these are the last scores.' : 'The host closed the room.'));
    else actions.append(h('div.net-wait', {}, `${hostName(st)} can start another game`, h('span.dots')));
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
      await hostAct('again', null, { spec, title: st.title, questions: fitSet(annotateTimes(r.questions, getFormat)) });
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

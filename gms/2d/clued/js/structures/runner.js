// The question runner: plays a list of questions with HUD, timer, reveal and scoring.
// Every structure uses it, and lane S drives it for online rooms and challenge links. API in docs/notes/A.md.
import { getFormat } from '../formats/registry.js?v=202610100431';
import { createTimer } from '../core/timer.js?v=202610100431';
import { basePoints, withStreak, stageMultiplier, progressiveLimit, stageExtendMs, PROGRESSIVE_CAP } from '../core/scoring.js?v=202610100431';
import { creditsOf, urlsOf, preflight } from '../core/media.js?v=202610100431';
import { getSettings } from '../core/store.js?v=202610100431';
import { h, esc, onKey, countUp, fmtNum } from '../ui/kit.js?v=202610100431';
import { popup, confirmPop } from '../ui/popup.js?v=202610100431';
import { sfx, haptic, reducedMotion } from '../ui/fx.js?v=202610100431';
import { speak, stopSpeaking, questionSpeech, canSpeak } from '../ui/speech.js?v=202610100431';

const KIND_RIGHT = ['Brilliant!', 'You got it!', 'Super!', 'Yes!', 'Amazing!'];
const KIND_WRONG = ['Good try!', 'Nearly!', 'Nice guess!', 'Ooh, close!'];
const RIGHT = ['Correct!', 'Nailed it!', 'Spot on!', 'Yes!', 'Right!'];
const WRONG = ['Not quite', 'Nope', 'Unlucky', 'Wrong'];

// Styles for the shared Show-more button and the ring's "+5s" (lane S; kept here so the runner stays self-contained).
function stageStyles() {
  if (document.getElementById('runner-stage-css')) return;
  const st = document.createElement('style');
  st.id = 'runner-stage-css';
  st.textContent = '.more-btn{margin-left:auto;min-height:38px}.more-btn[hidden]{display:none}.more-btn.locked{background:#e9e4f5}' +
    '.ring{position:relative}.ring-plus{position:absolute;left:50%;top:-6px;transform:translateX(-50%);font-weight:900;font-size:13px;color:var(--good,#1fbf6a);' +
    'animation:ringplus 1.2s ease-out forwards;pointer-events:none;white-space:nowrap}@keyframes ringplus{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-18px)}}';
  document.head.append(st);
}

export function createRunner(host, cfg = {}) {
  stageStyles();
  const settings = getSettings();
  const kidsAll = !!cfg.kids;
  let kids = kidsAll;   // per question: party mixes kids and grown-up players
  const questions = cfg.questions || [];
  const players = (cfg.players || [{ name: cfg.playerName || 'You' }]).map(p => ({ name: p.name || p, score: 0, correct: 0, streak: 0, bestStreak: 0, kids: !!p.kids }));
  // cfg.timer: seconds (0 = off) or a boolean (use the settings default length)
  const timedFor = k => (typeof cfg.timer === 'number' ? cfg.timer > 0 : cfg.timer ?? (k ? false : settings.timerSec > 0));
  const limitFor = q => cfg.timeLimit || (typeof cfg.timer === 'number' && cfg.timer > 0 ? cfg.timer * 1000 : 0) || q.timeLimit || (settings.timerSec || 10) * 1000;
  const nowFn = cfg.now || Date.now;   // online: a server-synced clock
  let fullLimit = 0;
  // Progressive stages (lane S): current question's stage, vote display and lock. See docs/notes/S.md.
  const sg = { n: 0, stage: 0, locked: false, votes: 0, needed: 0, voted: false, subs: new Set(), kidsTimer: null, answerMs: 0, startAt: 0, deadline: 0 };
  const lifelines = new Set(cfg.lifelines || []);
  const state = {
    i: -1, score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0,
    lives: kidsAll ? null : (cfg.lives ?? null), maxLives: cfg.lives ?? null, answers: [], players, done: false, aborted: false,
    stars: 0, deadlineLeft: cfg.deadline || 0,
  };

  let resolveDone, ctrl = null, answerResolve = null, nextResolve = null, finished = false;
  const done = new Promise(r => (resolveDone = r));
  const timer = createTimer({ onTick: (r, lim) => drawTimer(r, lim), onEnd: () => onTimeout() });
  const clock = cfg.deadline ? createTimer({ onTick: r => { state.deadlineLeft = r; drawClock(r); }, onEnd: () => finish('time') }) : null;

  host.innerHTML = '';
  const root = h('div.play', { class: kidsAll ? 'kids' : '' });
  const hud = h('header.hud');
  const ring = h('div.ring', { hidden: true, 'aria-label': 'Time left', html: '<svg viewBox="0 0 44 44"><circle class="rb" cx="22" cy="22" r="18"/><circle class="rf" cx="22" cy="22" r="18"/></svg><b></b>' });
  const RING_LEN = 2 * Math.PI * 18;
  const stage = h('div.stage');
  const reveal = h('div.reveal', { 'aria-live': 'polite' });
  root.append(hud, stage);
  host.append(root);

  // HUD
  const quitBtn = h('button.icon-btn.quit', { type: 'button', 'aria-label': 'Quit', onclick: () => quit() }, '✕');
  const prog = h('div.prog', {}, h('div.prog-bar', {}, h('i')), h('span.prog-txt'));
  const scoreEl = h('div.score', {}, h('b', {}, '0'), h('small', {}, kidsAll ? '⭐' : 'pts'));
  const row2 = h('div.hud-row2');
  const playerChip = h('span.player-chip');
  const streakEl = h('span.streak');
  const livesEl = h('span.lives');
  const clockEl = h('span.clock');
  const moreBtn = h('button.btn.small.sun.more-btn', { type: 'button', hidden: true, dataset: { act: 'more' }, onclick: () => requestMore() });
  const speakBtn = canSpeak() ? h('button.icon-btn.speak', { type: 'button', 'aria-label': 'Read aloud', onclick: () => readAloud() }, '🔊') : null;
  const lifeBox = h('span.lifelines');
  const used = new Set();
  for (const [id, icon, label] of [['fifty', '½', '50:50'], ['skip', '⤼', 'Skip'], ['hint', '💡', 'Hint']]) {
    if (!lifelines.has(id)) continue;
    lifeBox.append(h('button.lifeline', { type: 'button', dataset: { id }, 'aria-label': label, onclick: () => useLifeline(id) }, h('span', {}, icon), h('small', {}, label)));
  }
  hud.append(h('div.hud-row1', {}, cfg.quit === false ? h('span.bar-gap') : quitBtn, prog, h('div.hud-right', {}, speakBtn || '', ring, scoreEl)));
  row2.append(playerChip, streakEl, livesEl, clockEl, lifeBox, moreBtn);
  hud.append(row2);

  const offKeys = onKey(e => {
    if ((e.key === 'Enter' || e.key === ' ') && reveal.classList.contains('show') && !cfg.waitNext) { advance(); return true; }
  });

  function drawHud() {
    const q = questions[state.i];
    const total = cfg.total || questions.length;
    const shown = Math.min(state.i + 1, total);
    prog.querySelector('i').style.width = `${(100 * Math.max(0, state.i) / Math.max(1, total))}%`;
    prog.querySelector('.prog-txt').textContent = cfg.label ? cfg.label(state.i, q, state) : `${shown} / ${total}`;
    const p = players[playerOf(state.i)];
    const shownScore = players.length > 1 ? p.score : state.score;
    countUp(scoreEl.querySelector('b'), kidsAll ? state.stars : shownScore, 500, reducedMotion());
    playerChip.textContent = players.length > 1 ? p.name : '';
    playerChip.hidden = players.length < 2;
    const st = players.length > 1 ? p.streak : state.streak;
    streakEl.innerHTML = st >= 2 ? `🔥<b>${st}</b>` : '';
    streakEl.classList.toggle('hot', st >= 3);
    livesEl.innerHTML = state.lives != null ? Array.from({ length: state.maxLives }, (_, k) => `<i class="${k < state.lives ? '' : 'lost'}">♥</i>`).join('') : '';
    lifeBox.querySelectorAll('.lifeline').forEach(b => { b.disabled = used.has(b.dataset.id); });
    row2.hidden = !(players.length > 1 || st >= 2 || state.lives != null || cfg.deadline || lifelines.size || (sg.n && !cfg.stagesAuto));
  }
  function drawTimer(r) {
    const k = fullLimit ? Math.max(0, Math.min(1, r / fullLimit)) : 0;
    ring.querySelector('.rf').style.strokeDashoffset = String(RING_LEN * (1 - k));
    ring.querySelector('b').textContent = String(Math.ceil(r / 1000));
    const low = k > 0 && (r < 3500 || k < 0.25);
    ring.classList.toggle('low', low);
    if (low && !ring._ticked) { ring._ticked = true; sfx('timerLow'); }
  }
  function drawClock(r) {
    const s = Math.ceil(r / 1000);
    clockEl.textContent = `⏱ ${s}s`;
    clockEl.classList.toggle('low', s <= 10);
  }
  const playerOf = i => (cfg.playerOf ? cfg.playerOf(i) : players.length > 1 ? Math.max(0, i) % players.length : 0);

  function readAloud() {
    const q = questions[state.i];
    if (q) speak(questionSpeech(q), { kids });
  }

  const api = {
    get opts() { return questions[state.i]?.opts || cfg.opts || {}; },
    mode: cfg.mode || 'solo', kids: kidsAll, difficulty: cfg.difficulty || 0, timed: false,
    rng: Math.random,
    timer: {
      start: ms => { fullLimit = ms; ring.hidden = false; timer.start(ms); }, remaining: () => timer.remaining(), stop: () => timer.stop(),
      pause: () => timer.pause(), resume: () => timer.resume(), get limit() { return timer.limit; },
      get full() { return fullLimit; }, get running() { return timer.running; },
    },
    sfx, haptic,
    preload: urls => preflight(urls),
    speak: text => speak(text, { kids }),
    answer(res) { if (answerResolve) { const r = answerResolve; answerResolve = null; r(res || {}); } },
    get stage() { return sg.stage; },
    get stages() { return sg.n; },
    get stageLocked() { return sg.locked; },
    onStage(cb) { sg.subs.add(cb); return () => sg.subs.delete(cb); },
    requestMore() { requestMore(); },
    reveal(html) { extraReveal.push(html); },
  };
  let extraReveal = [];

  async function play() {
    if (clock) clock.start(cfg.deadline);
    for (state.i = 0; state.i < questions.length && !finished; state.i++) {
      if (cfg.stopWhen && cfg.stopWhen(state)) break;
      const q = questions[state.i];
      if (cfg.before) { clock?.pause(); await cfg.before(state.i, q, state); clock?.resume(); if (finished) break; }
      const rec = await ask(q);
      if (finished) break;
      if (!rec) continue;
      const last = state.lives === 0 || !!(cfg.stopWhen && cfg.stopWhen(state)) || state.i + 1 >= questions.length;
      await showReveal(q, rec, last);
      if (finished) break;
      if (cfg.waitNext) await cfg.waitNext(state.i, rec, state);
      else await waitAdvance(rec);
      if (last && state.i + 1 < questions.length) break;
    }
    finish(state.lives === 0 ? 'lives' : 'end');
  }

  function ask(q) {
    // Formats' timers/loops/audio must not leak into the next question (lane AU request).
    if (ctrl) { try { ctrl.destroy && ctrl.destroy(); } catch (e) {} ctrl = null; }
    return new Promise(resolve => {
      reveal.classList.remove('show', 'good', 'bad');
      reveal.innerHTML = '';
      root.classList.remove('revealed', 'rv-inline');
      extraReveal = [];
      ring._ticked = false;
      drawHud();
      const fmt = getFormat(q.format);
      kids = kidsAll || !!q.kids;
      api.kids = kids;
      api.difficulty = q.kids ? 1 : (cfg.difficulty || 0);
      root.classList.toggle('kids', kids);
      stage.innerHTML = '';
      stage.scrollTop = 0;
      stage.classList.remove('in');
      void stage.offsetWidth;
      stage.classList.add('in');
      if (!fmt) { stage.append(h('p.panel', {}, `Missing format "${q.format}"`)); setTimeout(() => resolve(null), 800); return; }
      const t0 = performance.now();
      const ext = cfg.deadlineFor ? cfg.deadlineFor(state.i, q) : 0;
      let limit = (cfg.limitFor && cfg.limitFor(state.i, q)) || limitFor(q);
      const useTimer = !!ext || (timedFor(kids) && !cfg.deadline);
      // Slow formats (boards, typing) declare timeScale so the player's one-tap answer time stretches; online rooms sync deadlines instead.
      if (!ext && !cfg.limitFor && api.mode !== 'online' && fmt.timeScale) {
        let k = 1;
        try { k = typeof fmt.timeScale === 'function' ? fmt.timeScale(q) : fmt.timeScale; } catch (e) {}
        if (k > 1 && isFinite(k)) limit = Math.round(limit * k);
      }
      resetStages(q, limit);
      if (sg.n && !ext && !cfg.limitFor) limit = progressiveLimit(limit);
      api.timed = useTimer;
      answerResolve = res => {
        const remaining = timer.remaining();
        timer.stop();
        resolve(record(q, res, { remaining, limit, timedNow: useTimer, ms: performance.now() - t0 }));
      };
      onTimeoutFn = () => {
        if (!answerResolve) return;
        try { ctrl?.timeout && ctrl.timeout(); } catch (e) {}
        const r = answerResolve; answerResolve = null;
        resolve(record(q, { correct: false, given: null, detail: 'timeout' }, { remaining: 0, limit, timedNow: true, ms: limit, timeout: true }));
        void r;
      };
      skipFn = () => {
        if (!answerResolve) return;
        answerResolve = null; timer.stop();
        resolve(record(q, { correct: false, given: null, detail: 'skip' }, { remaining: 0, limit, ms: performance.now() - t0, skipped: true }));
      };
      try {
        ctrl = null;
        ctrl = fmt.render(stage, q, api) || {};
      } catch (e) {
        console.error('[clued] render failed', q.format, e);
        stage.append(h('p.panel', {}, 'This question could not be shown.'));
        setTimeout(() => skipFn(), 900);
        return;
      }
      ring.hidden = !useTimer || !!fmt.manualTimer;   // manual-timer formats show it when they call api.timer.start
      ring.querySelector('.rf').style.strokeDasharray = String(RING_LEN);
      fullLimit = limit;
      drawMore();
      if (ext) timer.start(Math.max(0, ext - nowFn()));
      else if (useTimer && !fmt.manualTimer) timer.start(limit);
      if (kids || settings.readAloud) setTimeout(readAloud, 250);
      cfg.onQuestion && cfg.onQuestion(state.i, q, state);
    });
  }
  let onTimeoutFn = null, skipFn = null;
  function onTimeout() { onTimeoutFn && onTimeoutFn(); }

  /* Progressive stages: the runner owns the stage, the Show-more button (solo/party only) and the multiplier.
     Solo: requestMore advances at once (kids: auto every 4 s). Online (cfg.stagesAuto): no button; the room/host
     advances stages on a timer and the room calls run.setStage from its state. cfg.requestMore (voting) is legacy. */
  function resetStages(q, answerMs) {
    clearInterval(sg.kidsTimer);
    Object.assign(sg, { n: q.stages >= 2 ? q.stages : 0, stage: 0, locked: false, votes: 0, needed: 0, voted: false, kidsTimer: null,
      answerMs, startAt: performance.now() });
    sg.subs = new Set();
    api.moreButton = !!sg.n; // formats (listen) hide their own Show-more when the runner draws the shared one
    if (sg.n && kids && !cfg.requestMore && !cfg.stagesAuto) sg.kidsTimer = setInterval(() => { if (answerResolve && !sg.locked && sg.stage < sg.n - 1) setStage(sg.stage + 1); }, cfg.kidsStageMs || 4000);
    drawMore();
  }
  function drawMore() {
    moreBtn.hidden = !sg.n || !!cfg.stagesAuto;
    if (moreBtn.hidden) return;
    row2.hidden = false;
    const last = sg.stage >= sg.n - 1;
    const online = !!cfg.requestMore;
    moreBtn.disabled = sg.locked || last || !answerResolve || (online && sg.voted);
    moreBtn.classList.toggle('locked', sg.locked);
    moreBtn.textContent = sg.locked ? 'Locked 🔒' : last ? 'All shown' : online && sg.needed ? `Show more 👀 (${sg.votes}/${sg.needed})` : 'Show more 👀';
  }
  function requestMore() {
    if (!sg.n || cfg.stagesAuto || sg.locked || sg.stage >= sg.n - 1 || !answerResolve) return;
    if (cfg.requestMore) {
      if (sg.voted) return;
      sg.voted = true; sg.votes++;
      drawMore();
      try { cfg.requestMore(state.i, questions[state.i], sg.stage); } catch (e) { console.error(e); }
    } else setStage(sg.stage + 1);
  }
  function flourish(ms) {
    if (ms < 500) return;
    const f = h('span.ring-plus', {}, `+${Math.round(ms / 1000)}s`);
    ring.append(f);
    setTimeout(() => f.remove(), 1200);
  }
  // deadline/limitMs: online, the server's new deadline (absolute, room clock) and full ring length.
  function setStage(next, deadline, limitMs) {
    if (!sg.n || next <= sg.stage) return;
    sg.stage = Math.min(sg.n - 1, next);
    sg.votes = 0; sg.voted = false;
    if (answerResolve && timer.running) {
      const before = timer.remaining();
      if (deadline) {
        if (limitMs) fullLimit = limitMs;
        timer.start(Math.max(0, deadline - nowFn()));
      } else {
        const elapsed = performance.now() - sg.startAt;
        const want = Math.min(Math.max(before, stageExtendMs(sg.answerMs)), PROGRESSIVE_CAP - elapsed);
        if (want > before) { fullLimit = elapsed + want; timer.start(want); }
      }
      flourish(timer.remaining() - before);
    }
    if (answerResolve) sfx('reveal');
    drawMore();
    for (const cb of [...sg.subs]) { try { cb(sg.stage); } catch (e) { console.error(e); } }
  }
  function lockStages() {
    if (!sg.n || sg.locked) return;
    sg.locked = true;
    clearInterval(sg.kidsTimer);
    drawMore();
  }

  function record(q, res, t) {
    const pi = playerOf(state.i);
    const p = players[pi];
    const correct = !!res.correct;
    const streak = correct ? (players.length > 1 ? p.streak : state.streak) + 1 : 0;
    let points = 0;
    if (correct) {
      const base = res.points != null ? res.points
        : cfg.scoreFn ? cfg.scoreFn(res, q, state) : basePoints({ timed: t.timedNow, remaining: t.remaining, limit: t.limit });
      points = (cfg.noStreak ? base : withStreak(base, streak)) * (cfg.multiplier ? cfg.multiplier(state.i, q, state) : 1);
    } else if (res.partial && res.points) points = res.points;
    if (sg.n) points = Math.round(points * stageMultiplier(sg.stage, sg.n));
    const rec = {
      i: state.i, qid: q.id, format: q.format, round: q.round, correct, points, given: res.given ?? null,
      detail: res.detail, ms: Math.round(t.ms), streak, player: pi, timeout: !!t.timeout, skipped: !!t.skipped,
      ...(sg.n ? { stage: sg.stage, stages: sg.n } : {}),
    };
    lockStages();
    if (!t.skipped) state.answered++;
    if (correct) {
      state.correct++; p.correct++; state.stars++;
      sfx(streak >= 3 ? 'streak' : 'correct'); haptic('correct');
    } else if (!t.skipped) {
      sfx('wrong'); haptic('wrong');
      if (state.lives != null && !kids) state.lives = Math.max(0, state.lives - 1);
    }
    state.score += points; p.score += points;
    state.streak = players.length > 1 ? state.streak : streak;
    if (players.length > 1) p.streak = streak;
    p.bestStreak = Math.max(p.bestStreak, streak);
    state.bestStreak = Math.max(state.bestStreak, streak);
    state.answers.push(rec);
    try { cfg.onAnswer && cfg.onAnswer(rec, state); } catch (e) { console.error(e); }
    drawHud();
    return rec;
  }

  function answerLine(q) {
    if (q.answerText != null) return q.answerText;
    if (Array.isArray(q.options) && typeof q.answer === 'number') { const o = q.options[q.answer]; return o?.text ?? String(o); }
    if (typeof q.answer === 'boolean') return q.answer ? 'True' : 'False';
    return Array.isArray(q.answer) ? q.answer.join(' → ') : String(q.answer ?? '');
  }

  function showReveal(q, rec, last = false) {
    stopSpeaking();
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const good = rec.correct;
    const title = rec.skipped ? 'Skipped' : rec.timeout ? (kids ? 'Out of time!' : "Time's up") : good ? pick(kids ? KIND_RIGHT : RIGHT) : pick(kids ? KIND_WRONG : WRONG);
    const pts = good ? (kids ? '<span class="star-pop">⭐</span>' : `<span class="pts">+${fmtNum(rec.points)}</span>`) : '';
    // Tall boards (format flag revealInline) get a one-line result under the board with Next beside it; answerOnBoard
    // formats already mark the right answer on the board, so the long "Answer:" line is left out.
    const fmt = getFormat(q.format) || {};
    const inline = !!fmt.revealInline;
    const ans = good || (fmt.answerOnBoard && !rec.skipped && !rec.timeout) ? '' : `<div class="rv-answer">${kids ? 'The answer is' : 'Answer:'} <b>${esc(answerLine(q))}</b></div>`;
    const credits = creditsOf(q);
    reveal.innerHTML = '';
    reveal.className = `reveal ${good ? 'good' : 'bad'}${inline ? ' inline' : ''}`;
    const head = h('div.rv-head', { html: `<span class="rv-mark">${good ? '✓' : rec.skipped ? '⤼' : kids ? '♥' : '✗'}</span><span class="rv-title">${esc(title)}</span>${pts}` });
    const card = h('div.rv-card', {},
      h('div.rv-q', {}, q.prompt || ''),
      head,
      ans ? h('div', { html: ans }) : null,
      q.explain ? h('p.rv-explain', {}, q.explain) : null,
      ...extraReveal.map(x => (typeof x === 'string' ? h('div.rv-extra', { html: x }) : x)),
      cfg.revealExtra ? (v => (v == null ? null : typeof v === 'string' ? h('div.rv-extra', { html: v }) : v))(cfg.revealExtra(rec, state)) : null);
    const row = h('div.rv-row');
    if (credits.length) row.append(h('button.icon-btn.info', { type: 'button', 'aria-label': 'Media credits', onclick: () => showCredits(credits) }, 'ⓘ'));
    if (!cfg.waitNext) row.append(h('button.btn.primary.next', { type: 'button', onclick: () => advance() }, last ? 'Finish' : 'Next ›'));
    else row.append(h('span.rv-wait', {}, cfg.waitLabel || 'Waiting for the host…'));
    if (inline) head.append(row); else card.append(row);
    reveal.append(card);
    stage.append(reveal);
    root.classList.add('revealed');
    root.classList.toggle('rv-inline', inline);
    requestAnimationFrame(() => {
      stage.style.setProperty('--rv-h', `${card.offsetHeight}px`);
      reveal.classList.add('show');
      // only as far as needed to bring the card (and Next) into view, so as much of the board as possible stays on screen
      const over = card.getBoundingClientRect().bottom + 24 - stage.getBoundingClientRect().bottom;
      if (over > 0) stage.scrollTo({ top: stage.scrollTop + over, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    if (kids && good) speak(title, { kids }); else if (kids) speak(`${title} The answer is ${answerLine(q)}`, { kids });
    return Promise.resolve();
  }

  function showCredits(list) {
    popup({
      title: 'Media credits',
      body: list.map(c => `<p class="credit">${esc(c.credit || 'Unknown')} · ${esc(c.license || '')}${c.page ? ` · <a href="${esc(c.page)}" target="_blank" rel="noopener">source</a>` : ''}</p>`).join(''),
    });
  }

  function waitAdvance(rec) {
    return new Promise(r => {
      nextResolve = r;
      const auto = cfg.autoNext != null ? (typeof cfg.autoNext === 'function' ? cfg.autoNext(rec, state) : cfg.autoNext) : 0;
      if (auto) setTimeout(() => { if (nextResolve === r) advance(); }, auto);
    });
  }
  function countdown(to, label = 'Next question in') {
    const end = to > 1e11 ? to : nowFn() + to * 1000;
    const total = Math.max(1, end - nowFn());
    const bar = h('div.next-count', {}, h('span'), h('div.nc-bar', {}, h('i')));
    (reveal.querySelector('.rv-card') || stage).append(bar);
    return new Promise(res => {
      const tick = () => {
        const left = end - nowFn();
        if (finished || left <= 0 || !bar.isConnected) { bar.remove(); res(); return; }
        bar.firstChild.textContent = `${label} ${Math.ceil(left / 1000)}…`;
        bar.querySelector('i').style.transform = `scaleX(${left / total})`;
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function advance() { if (nextResolve) { const r = nextResolve; nextResolve = null; r(); } }

  async function useLifeline(id) {
    if (used.has(id) || !answerResolve) return;
    used.add(id);
    const q = questions[state.i];
    if (id === 'fifty') {
      if (ctrl?.eliminate) ctrl.eliminate(Math.max(1, (q.options?.length || 4) - 2));
    } else if (id === 'skip') {
      if (cfg.onSkip) { cfg.onSkip(state); }
      skipFn && skipFn();
    } else if (id === 'hint') {
      const text = (ctrl?.hint && ctrl.hint()) || q.hint || (q.explain ? 'Think about: ' + q.explain.split(/[.;]/)[0].replace(new RegExp(esc(answerLine(q)), 'ig'), '…') : 'No hint for this one');
      stage.querySelector('.hint-bubble')?.remove();
      stage.prepend(h('div.hint-bubble', {}, '💡 ', text));
    }
    drawHud();
  }

  async function quit() {
    if (finished) return;
    if (cfg.onQuit) { cfg.onQuit(); return; }
    timer.pause(); clock?.pause();
    const ok = await confirmPop('Quit this game?', 'Your progress in this game will be lost.', 'Quit', 'Keep playing', true);
    timer.resume(); clock?.resume();
    if (ok) finish('quit');
  }

  function finish(reason) {
    if (finished) return;
    finished = true;
    state.done = true;
    state.aborted = reason === 'quit' || reason === 'stop';
    timer.stop(); clock?.stop(); stopSpeaking(); offKeys(); clearInterval(sg.kidsTimer);
    try { ctrl?.destroy && ctrl.destroy(); } catch (e) {}
    if (answerResolve) { const r = answerResolve; answerResolve = null; r({ correct: false, detail: reason }); }
    advance();
    resolveDone({
      reason, aborted: state.aborted, score: state.score, correct: state.correct, answered: state.answered,
      total: questions.length, answers: state.answers, bestStreak: state.bestStreak, stars: state.stars,
      players: players.map(p => ({ ...p })), questions,
    });
  }

  queueMicrotask(play);

  return {
    done, state,
    next: () => { if (answerResolve) { try { ctrl?.timeout && ctrl.timeout(); } catch (e) {} skipFn && skipFn(); } advance(); },
    stop: (reason = 'stop') => finish(reason),
    controller: () => ctrl,
    current: () => questions[state.i],
    answer: x => { if (ctrl?.choose) ctrl.choose(x); },
    // Online: count the current question down to an absolute (server-synced) time instead of a local limit.
    setDeadline(absMs, limitMs) {
      if (!answerResolve) return;
      if (limitMs) fullLimit = limitMs;
      ring.hidden = false;
      timer.start(Math.max(0, absMs - nowFn()));
    },
    // Progressive stages, driven by the room (lane S): see docs/notes/S.md.
    setStage: (stage, deadline, limitMs) => setStage(stage, deadline, limitMs),
    setVotes(votes, needed, voted) { if (!sg.n) return; sg.votes = votes; sg.needed = needed; sg.voted = !!voted; drawMore(); },
    lockStages: () => lockStages(),
    get stage() { return sg.stage; },
    // Online: the server says time is up. Locks input and records a timeout if still unanswered.
    timeUp: () => onTimeout(),
    // "Next question in 3…2…1". `to` is seconds, or an absolute ms time (server clock). Resolves when it ends.
    countdown: (to, label) => countdown(to, label),
    guard: async () => { if (finished) return true; await quit(); return finished; },
  };
}

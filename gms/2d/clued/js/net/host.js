// Host setup (server rooms and device rooms): a list of rounds (＋ Add round → ♥ favourite or format → themes),
// 10 questions each by default, plus the room-wide settings (answer time, gap, private/public, auto-start).
import { h } from '../ui/kit.js?v=202610171247';
import { defineScreen, go, header, current } from '../ui/app.js?v=202610171247';
import { toast } from '../ui/popup.js?v=202610171247';
import { saveSetPrompt, pickSet, copyRounds } from './sets.js?v=202610171247';
import { getFormat, defaultOpts } from '../formats/registry.js?v=202610171247';
import { getSettings, getLast, read, write } from '../core/store.js?v=202610171247';
import { makeSpec } from '../core/spec.js?v=202610171247';
import { randomSeed } from '../core/rng.js?v=202610171247';
import { prepare } from '../structures/session.js?v=202610171247';
import { roundCard, moveItem, registerRoundList, addRound, roundTitle, usable } from '../structures/rounds.js?v=202610171247';
import { rooms, friendly } from './api.js?v=202610171247';
import { rememberName, tidyName } from './ident.js?v=202610171247';
import { ensureStyles, saveSeat, TRUST_HINT, START_CHOICES, startLabel } from './util.js?v=202610171247';
import { timingPanel, choiceChips } from './board.js?v=202610171247';
import { streakOption } from '../ui/streakopt.js?v=202610171247';
import { getTransport, canHostFromDevice, fallback, hasTransport } from './transport.js?v=202610171247';
import { signInPrompt, isSignedIn, pausedText, busyText, allowanceNote, noGamesPanel } from './signin.js?v=202610171247';
import { allowanceState, outOfGames } from './pass.js?v=202610171247';
import { offerTopUp, wantsSheet } from './topup.js?v=202610171247';
import { ensureFormats } from './room.js?v=202610171247';
import { nameField } from './join.js?v=202610171247';
import { surprise } from '../structures/pubquiz.js?v=202610171247';
import { annotateTimes, fitSet, MAX_QUESTIONS } from './roundset.js?v=202610171247';
import { mySetting, saveMySetting, specLocal, resolveLocal } from '../core/local.js?v=202610171247';
import { localChip, localLine, localTotal, localReady } from '../ui/local.js?v=202610171247';

const KEY = 'clued.online';   // { rounds, kidsRounds }: the last hosted round list, per mode
const MAX_ROUNDS = 8;
const COUNT = 10;

let HS = null;
function hostState() {
  const kids = !!getSettings().kids;
  if (HS && HS.kids === kids) return HS;
  const saved = read(KEY) || {};
  const list = saved[kids ? 'kidsRounds' : 'rounds'];
  HS = { kids, rounds: Array.isArray(list) ? list.filter(r => r && typeof r.format === 'string') : [], name: '',
    // New rooms default to streaks "just for show": the quicker correct answer always scores more (TIMING.md);
    // the host's last choice is remembered.
    timing: { answerSec: kids ? 20 : 10, gapSec: 5, streak: saved.streak === true }, vis: { public: false, startIn: 120 }, local: null };
  return HS;
}
function saveHost() {
  const saved = read(KEY) || {};
  saved[HS.kids ? 'kidsRounds' : 'rounds'] = HS.rounds;
  write(KEY, saved);
}
registerRoundList('online', { get: () => hostState().rounds, save: saveHost, count: COUNT, local: () => hostState().local });

function defaultRound(kids, format = 'mc') {
  const fmt = getFormat(format) || getFormat('mc') || usable(kids)[0];
  const last = format !== 'mc' ? getLast(kids ? `${fmt.id}:kids` : fmt.id) : null;
  const opts = { ...defaultOpts(fmt), ...(last?.opts || {}) };
  if (kids) for (const o of fmt.options || []) if (o.kidsDefault != null && !(last?.opts && o.key in last.opts)) opts[o.key] = o.kidsDefault;
  return { format: fmt.id, packs: last?.packs || 'all', count: COUNT, opts, difficulty: kids ? 1 : (last?.difficulty || 0) };
}

const total = rounds => rounds.reduce((n, r) => n + (r.count || 0), 0);

function roomTitle(rounds) {
  if (rounds.length === 1) return roundTitle(rounds[0]);
  return `${rounds.length}-round quiz`;   // the lobby lists the rounds themselves
}

// params: {} (rounds from last time), { format } (one round of it), { spec, title } (a prepared spec, e.g. a pub quiz).
// via: 'p2p' hosts from this device (lane P2P): no public listing, no server status.
defineScreen('host', async (el, params, cur) => {
  const { format, spec: given, title: givenTitle, via = 'server' } = params;
  ensureStyles();
  const loading = h('div.net-wrap.net-loading', {}, h('div.net-wait', {}, 'Loading', h('span.dots')));
  el.append(loading);
  await ensureFormats();
  await localReady;
  loading.remove();
  const S = hostState();
  if (!S.local) S.local = mySetting();
  const kids = S.kids;
  if (!params.seeded) {
    params.seeded = true;   // params live on the back stack: seed once, not on every return from the round editor
    if (given?.rounds?.length) S.rounds = given.rounds.map(r => ({ ...r, count: r.count || COUNT, opts: { ...(r.opts || {}) } }));
    else if (format) S.rounds = [defaultRound(kids, format)];
    S.title = given ? givenTitle : '';
    if (given || format) S.setName = '';
    if (given || format) saveHost();
  }
  S.rounds = S.rounds.filter(r => getFormat(r.format));
  if (!S.rounds.length) { S.rounds.push(defaultRound(kids)); saveHost(); }
  const device = via === 'p2p' && hasTransport('p2p');
  el.append(header(device ? 'Host from this device' : 'Host a game'));
  const body = h('div.net-wrap.host-wrap');
  el.append(body);
  const statusNote = h('div');
  const name = nameField(S.name);
  name.addEventListener('input', () => { S.name = name.value; });
  const err = h('p.net-err', { role: 'alert' });
  body.append(statusNote, h('div.panel.net-form', {}, h('label', {}, 'Your name'), name));

  const sum = h('p.rounds-sum');
  const locSum = h('span.loc-sum', { dataset: { loc: 'total' } });
  const list = h('div.rounds', { dataset: { list: 'online' } });
  const setBar = h('div.set-bar');
  // the room's local focus is the host's choice; editing it here also becomes the host's own setting
  const locChip = localChip(() => S.local, next => { S.local = saveMySetting(next); }, () => draw());
  const surpriseBtn = h('button.btn.small', { type: 'button', dataset: { act: 'surprise' }, onclick: () => {
    S.rounds = surprise(randomSeed(), kids);
    S.setName = '';
    saveHost();
    drawSetBar();
    draw();
  } }, '🎲 Surprise me');
  body.append(h('div', {}, h('div.rounds-head', {}, h('h3.sec-title', {}, 'Rounds'), sum), setBar,
    h('div.loc-bar', { style: { justifyContent: 'space-between' } }, surpriseBtn, locChip), list));
  function drawSetBar() {
    setBar.replaceChildren(
      h('button.btn.small', { type: 'button', dataset: { act: 'sets-load' }, onclick: async () => {
        const set = await pickSet(kids);
        if (set) {
          S.rounds = copyRounds(set.rounds).filter(r => getFormat(r.format));
          if (!S.rounds.length) S.rounds.push(defaultRound(kids));
          Object.assign(S.timing, set.timing || {});
          if (set.local !== undefined) S.local = resolveLocal(set.local || { level: 'off' });
          S.setName = set.name;
          saveHost();
          toast(`Loaded “${set.name}”`);
          go('host', { ...params, seeded: true }, { replace: true });   // re-render so the timing panel shows the set's times
        } else drawSetBar();
      } }, '📂 Sets'),
      h('button.btn.small', { type: 'button', dataset: { act: 'sets-save' }, onclick: async () => {
        const nm = await saveSetPrompt({ kids, rounds: S.rounds, timing: S.timing, name: S.setName || '', local: specLocal(S.local) || null });
        if (!nm) return;
        S.setName = nm;
        drawSetBar();
      } }, '💾 Save set'),
      ...(S.setName ? [h('span.set-name', {}, S.setName)] : []));
  }
  drawSetBar();
  function draw() {
    const n = S.rounds.length;
    sum.textContent = `${n} round${n === 1 ? '' : 's'} · ${total(S.rounds)} questions${total(S.rounds) > MAX_QUESTIONS ? ` (max ${MAX_QUESTIONS}: the biggest rounds get trimmed)` : ''}`;
    sum.append(locSum);
    localTotal(locSum, S.rounds, S.local, { kids, prefix: ' · ' });
    locChip.redraw();
    list.replaceChildren(...S.rounds.map((r, i) => roundCard(r, {
      i, n, extra: localLine(r, S.local, { kids, count: r.count || COUNT,
        onKeep: () => { r.localOk = true; saveHost(); draw(); },
        onChange: () => go('pqround', { idx: i, format: r.format, list: 'online' }) }),
      onEdit: () => go('pqround', { idx: i, format: r.format, list: 'online' }),
      onRemove: n > 1 ? () => { S.rounds.splice(i, 1); saveHost(); draw(); } : null,
      onMove: dir => { if (moveItem(S.rounds, i, dir)) { saveHost(); draw(); } },
    })));
    if (n < MAX_ROUNDS) list.append(h('button.btn.wide.big.add-round', { type: 'button', dataset: { act: 'add-round' }, onclick: async () => { if (await addRound('online', kids)) draw(); } }, '＋ Add round'));
    if (n > 1) list.append(h('button.btn.small', { type: 'button', dataset: { act: 'rounds-reset' }, style: { alignSelf: 'center' }, onclick: () => { S.rounds = [defaultRound(kids)]; saveHost(); draw(); } }, 'Start over with one round'));
  }
  draw();

  const tp = timingPanel({ ...S.timing, onChange: v => Object.assign(S.timing, { answerSec: v.answerSec, gapSec: v.gapSec }) });
  if (!kids) tp.append(streakOption(S.timing.streak, v => { S.timing.streak = v; const saved = read(KEY) || {}; saved.streak = v; write(KEY, saved); }));
  body.append(h('h3.sec-title', {}, 'Room settings'), tp);
  const startRow = h('div', { hidden: !S.vis.public, dataset: { opt: 'start' } }, h('div.opt-label', {}, 'Start'),
    choiceChips(START_CHOICES, START_CHOICES.map(startLabel), S.vis.startIn, x => { S.vis.startIn = x; }));
  if (!device) body.append(h('div.panel.stack.net-timing', {},
    h('div', { dataset: { opt: 'vis' } }, h('div.opt-label', {}, 'Who can join'),
      choiceChips([false, true], ['🔒 Private: link or code', '🌍 Public: listed online'], S.vis.public, x => { S.vis.public = x; startRow.hidden = !x; })),
    startRow));
  if (kids) body.append(h('p.net-note', {}, '🧸 Kids game: easy questions, a gentle timer and stars instead of points.'));
  const btn = h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'create' } }, 'Create room');
  const status = h('div');
  const allow = h('div', { dataset: { box: 'allowance' } });
  body.append(allow, err, btn, status, h('p.net-note', {}, TRUST_HINT));
  const T = getTransport(device ? 'p2p' : 'server');
  const statusP = device ? null : rooms.status();
  // Online games spend the host's daily allowance (free games + free top-ups; unlimited with a br8t Pass).
  const limited = (statusP || rooms.status()).then(s => !!s.allowance).catch(() => false);
  async function showAllowance() {
    if (!(await limited)) return null;
    if (!(await isSignedIn())) {
      if (cur === current()) allow.replaceChildren(h('p.net-note', { dataset: { allowance: 'signin' } }, '🔐 Hosting online games needs a free br8t sign-in: free games every day, unlimited with a br8t Pass.'));
      return null;
    }
    const a = await allowanceState();
    if (cur === current()) allow.replaceChildren(...(a ? [outOfGames(a) ? noGamesPanel(a, () => btn.click()) : allowanceNote(a)] : []));
    return a;
  }
  showAllowance();
  if (device) statusNote.append(h('p.net-note', {}, '📡 No server: this device runs the room for up to 8 players. Keep this tab open and on screen while you play.'));
  else statusP.then(s => {
    if (s.level >= 3) statusNote.append(h('p.net-note', {}, pausedText));
    else if (s.level >= 1) isSignedIn().then(ok => { if (!ok) statusNote.append(h('p.net-note', {}, '🔐 Hosting needs a free br8t sign-in right now; you’ll be asked when you create the room.')); });
  }).catch(() => {});

  // Creates the room, handling every refusal inline: sign-in, public slots full, busy/paused (+ device fallback).
  async function createWith(opts) {
    try {
      const res = await T.create(opts);
      saveSeat(res.code, { key: res.playerKey, id: res.playerId, via: T.id, host: true });
      rememberName(opts.hostName);
      go('room', { code: res.code, key: res.playerKey, st: res.room, via: T.id }, { replace: true, skipGuard: true });
    } catch (e) {
      if (cur !== current()) return;
      if (e.code === 'signin_required') {
        if (await signInPrompt(status, 'host')) return createWith(opts);
        return;
      }
      const box = h('div.panel.stack', {}, h('b', {}, e.code === 'public_full' ? 'Public games are full' : e.code === 'paused' ? 'Paused' : 'Busy'),
        h('p.muted', { style: { margin: 0 } }, e.code === 'public_full' ? 'All public game slots are busy right now. Make it a private game and share the link instead?'
          : e.code === 'paused' ? pausedText : e.code === 'busy' ? busyText : friendly(e)));
      if (e.code === 'public_full') box.append(h('button.btn.go.wide', { type: 'button', dataset: { act: 'private' }, onclick: () => { box.remove(); createWith({ ...opts, public: false }); } }, 'Create a private game'));
      if ((e.code === 'busy' || e.code === 'paused') && canHostFromDevice()) {
        box.append(h('button.btn.sun.wide', { type: 'button', dataset: { act: 'device' }, onclick: () => fallback.host(opts) }, 'Host from your device instead'));
      }
      status.replaceChildren(box);
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', async () => {
    const n = tidyName(name.value);
    if (!n) { err.textContent = 'Type your name first.'; name.focus(); return; }
    err.textContent = '';
    btn.disabled = true;
    if (await limited) {
      if (!(await isSignedIn()) && !(await signInPrompt(status, 'start'))) { btn.disabled = false; return; }
      const a = await showAllowance();
      if (outOfGames(a)) {
        // the sheet offers a free top-up; Yes carries straight on with creating the room
        const more = wantsSheet(a) && (await offerTopUp(a)) === 'yes';
        if (cur !== current()) return;
        if (!more) { btn.disabled = false; allow.scrollIntoView?.({ block: 'center' }); return; }
        showAllowance();
      }
    }
    const rounds = S.rounds.filter(r => getFormat(r.format));
    // formats may tune for rooms (lane AU) via opts.online; round titles ride along for the round cards
    const spec = makeSpec('online', rounds.map(r => ({
      format: r.format, packs: r.packs, count: r.count || COUNT, difficulty: kids ? 1 : (r.difficulty || 0),
      opts: { ...(r.opts || {}), online: true, ...(kids ? { kids: true } : {}) }, ...(r.title ? { title: r.title } : {}),
    })), randomSeed(), { kids, local: specLocal(S.local) });
    spec.streak = S.timing.streak ? 'on' : 'off';
    const title = S.title || roomTitle(rounds);
    try {
      const r = await prepare(spec, status, { fresh: true });
      if (cur !== current()) return;
      if (!r.questions.length) throw new Error('Not enough questions for those themes. Try more themes.');
      const questions = fitSet(annotateTimes(r.questions, getFormat));
      if (questions.length < r.questions.length) toast(`Trimmed to ${questions.length} questions to fit`);
      status.replaceChildren();
      await createWith({ hostName: n, spec, title, questions, ...S.timing, ...S.vis });
    } catch (e) {
      status.replaceChildren();
      err.textContent = friendly(e);
      btn.disabled = false;
    }
  });
});

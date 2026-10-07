// Online hub, join-by-name screen and host setup. Joining needs only a name.
import { h } from '../ui/kit.js?v=202610071242';
import { defineScreen, go, header, current } from '../ui/app.js?v=202610071242';
import { toast } from '../ui/popup.js?v=202610071242';
import { sfx } from '../ui/fx.js?v=202610071242';
import { getFormat } from '../formats/registry.js?v=202610071242';
import { getSettings, getLast } from '../core/store.js?v=202610071242';
import { optionsPanel } from '../ui/setup.js?v=202610071242';
import { specFor, fmtTitle } from '../structures/common.js?v=202610071242';
import { prepare } from '../structures/session.js?v=202610071242';
import { rooms, friendly } from './api.js?v=202610071242';
import { suggestedName, rememberName, tidyName, MAX_NAME } from './ident.js?v=202610071242';
import { ensureStyles, saveSeat, loadSeat, dropSeat, cleanCode, validCode, setQuery, TRUST_HINT, START_CHOICES, startLabel, mmss } from './util.js?v=202610071242';
import { timingPanel, choiceChips } from './board.js?v=202610071242';
import { packInfo } from '../core/packs.js?v=202610071242';
import { getTransport, canHostFromDevice, fallback, hasTransport } from './transport.js?v=202610071242';
import { signInPrompt, isSignedIn, pausedText, busyText } from './signin.js?v=202610071242';
import { ensureFormats } from './room.js?v=202610071242';

const MAX_SET = 500 * 1024;

function nameField(value = '') {
  const input = h('input.field', { type: 'text', maxlength: String(MAX_NAME), autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Your name', 'aria-label': 'Your name', dataset: { field: 'name' } });
  input.value = value;
  suggestedName().then(n => { if (!input.value && n && document.activeElement !== input) input.value = n; });
  return input;
}

function codeField(value = '') {
  const input = h('input.field.code', { type: 'text', maxlength: '5', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', placeholder: 'CODE', 'aria-label': 'Room code', dataset: { field: 'code' } });
  input.value = value;
  input.addEventListener('input', () => { const c = cleanCode(input.value); if (c !== input.value) input.value = c; });
  return input;
}

/* ---------------------------------------------------------------- hub */
function publicCard(r, offset) {
  const fmts = (r.formats || []).map(f => getFormat(f)?.title || f).join(', ');
  const packs = (r.packs || []).map(p => (p === 'all' ? 'All themes' : packInfo(p)?.title || p)).slice(0, 4).join(', ');
  const when = h('span.net-when');
  const tick = () => {
    if (r.phase !== 'lobby') when.textContent = `In progress · Q${r.q + 1}/${r.total}`;
    else if (r.startAt) when.textContent = `Starts in ${mmss(r.startAt - (Date.now() + offset))}`;
    else when.textContent = 'Host will start';
  };
  tick();
  return { el: h('button.net-pub', { type: 'button', dataset: { code: r.code }, onclick: () => go('join', { code: r.code }) },
    h('div.net-pub-top', {}, h('b', {}, r.title || fmts || 'Clued game'), when),
    h('div.net-pub-sub', {}, [fmts, packs].filter(Boolean).join(' · ')),
    h('div.net-pub-meta', {},
      h('span', {}, `👑 ${r.host || '?'}`),
      h('span', {}, `👥 ${r.players} waiting`),
      r.kids ? h('span.net-badge.kids', {}, '🧸 Kids') : r.difficulty ? h('span.net-badge.diff', {}, ['Mixed', 'Easy', 'Medium', 'Hard'][r.difficulty]) : null,
      h('span', {}, `⏱ ${r.answerSec}s`))), tick };
}

defineScreen('online', (el, params, cur) => {
  ensureStyles();
  const code = codeField();
  const err = h('p.net-err', { role: 'alert' });
  const pubList = h('div.net-pubs', {}, h('div.net-wait', {}, 'Looking for public games', h('span.dots')));
  const joinForm = h('form.net-form', {}, h('label', {}, 'Join with a code'), code, err, h('button.btn.primary.wide', { type: 'submit' }, 'Join'));
  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const c = cleanCode(code.value);
    if (!validCode(c)) { err.textContent = 'Codes are 5 letters and numbers.'; code.focus(); return; }
    go('join', { code: c });
  });
  el.append(header('Play online'),
    h('div.net-wrap', {},
      h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '🌐'), h('h2', {}, 'Play with friends'), h('p', {}, 'Host a game and share the link. Friends type a name and they’re in. No sign-in needed.')),
      h('div.panel.stack', {}, h('h3', {}, 'Host a game'), h('p.muted', { style: { margin: 0 } }, 'Pick a format and themes, then share the link or QR code.'),
        h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'host' }, onclick: () => go('formats', { structure: 'quick', title: 'Host: pick a format', onPick: f => go('host', { format: f.id }) }) }, 'Host a game'),
        hasTransport('p2p') ? h('button.btn.wide', { type: 'button', dataset: { act: 'host-device' }, onclick: () => go('formats', { structure: 'quick', title: 'Host from this device', onPick: f => go('host', { format: f.id, via: 'p2p' }) }) }, '📡 Host from this device (no server)') : null,
        hasTransport('p2p') ? h('p.net-note', { style: { margin: 0 } }, 'Device rooms need no server: your phone or laptop runs the game for up to 8 players.') : null),
      h('div.panel', {}, joinForm),
      h('div.stack', {}, h('h3.sec-title', {}, 'Public games'), pubList),
      h('p.net-note', {}, 'Challenge links: finish any game and tap “Challenge a friend” to share the same questions.')));
  let cards = [], stop = false, timer = null;
  async function load() {
    if (stop) return;
    try {
      const d = await rooms.listPublic();
      if (stop || cur !== current()) return;
      const offset = d.now - Date.now();
      cards = d.rooms.map(r => publicCard(r, offset));
      pubList.replaceChildren(...(cards.length ? cards.map(c => c.el) : [h('p.net-note', {}, 'No public games right now. Host one and pick “Public”.')]));
    } catch (e) {
      pubList.replaceChildren(h('p.net-note', {}, friendly(e)));
    }
    timer = setTimeout(load, document.hidden ? 15000 : 5000);
  }
  const ticker = setInterval(() => cards.forEach(c => c.tick()), 500);
  load();
  return () => { stop = true; clearTimeout(timer); clearInterval(ticker); };
});

/* --------------------------------------------------------------- join */
defineScreen('join', async (el, { code: raw = '', fresh = false, via = 'server' }, cur) => {
  ensureStyles();
  const T = getTransport(via);
  const code = cleanCode(raw);
  el.append(header('Join a game'));
  const body = h('div.net-wrap');
  el.append(body);
  const busy = msg => body.replaceChildren(h('div.net-wait', {}, msg, h('span.dots')));

  if (!validCode(code)) { body.append(codeEntry('')); return; }
  const seat = !fresh && loadSeat(code);
  if (seat?.key) {
    busy('Rejoining');
    try {
      const r = await getTransport(seat.via).join(code, '', seat.key);
      if (cur !== current()) return;
      go('room', { code, key: r.playerKey, st: r.room, via: seat.via }, { replace: true, skipGuard: true });
      return;
    } catch (e) {
      if (e.code !== 'network') dropSeat(code);
      if (e.code === 'room_not_found') { notFound(); return; }
    }
  }
  busy('Finding the room');
  let info;
  try { info = await T.peek(code); } catch (e) {
    if (cur !== current()) return;
    if (e.code === 'room_not_found' && via === 'server' && hasTransport('p2p')) { go('join', { code, via: 'p2p' }, { replace: true }); return; }
    if (e.code === 'room_not_found') notFound();
    else body.replaceChildren(h('div.panel.net-hero', {}, h('h2', {}, 'Can’t connect'), h('p', {}, friendly(e))),
      h('button.btn.primary.wide', { type: 'button', onclick: () => go('join', { code }, { replace: true }) }, 'Try again'));
    return;
  }
  if (cur !== current()) return;
  const name = nameField();
  const err = h('p.net-err', { role: 'alert' });
  const btn = h('button.btn.go.big.wide', { type: 'submit', dataset: { act: 'join' } }, 'Join game');
  const signBox = h('div');
  const form = h('form.net-form', {}, h('label', { for: 'net-name' }, 'Your name'), name, err, btn, signBox);
  name.id = 'net-name';
  const phase = info.phase === 'lobby' ? `${info.players} player${info.players === 1 ? '' : 's'} waiting`
    : info.phase === 'final' ? 'This game just finished; you’ll be in for the next round'
      : `Game in progress: you’ll join from the next question`;
  body.replaceChildren(
    h('div.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '🔎'),
      h('h2', {}, info.host ? `Join ${info.host}’s game` : 'Join the game'),
      h('p', {}, info.title ? `${info.title} · ` : '', phase),
      h('div.net-badges', {}, h('span.net-badge', {}, `Room ${code}`))),
    h('div.panel', {}, form),
    h('p.net-note', {}, 'No sign-in needed. Your name is shown to the other players.'));
  setTimeout(() => { if (!name.value) name.focus({ preventScroll: true }); }, 80);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = tidyName(name.value);
    if (!n) { err.textContent = 'Type a name first.'; name.focus(); return; }
    btn.disabled = true; err.textContent = '';
    try {
      const r = await T.join(code, n);
      saveSeat(code, { key: r.playerKey, id: r.playerId, via: T.id });
      rememberName(n);
      sfx('join');
      go('room', { code, key: r.playerKey, st: r.room, via: T.id }, { replace: true, skipGuard: true });
    } catch (ex) {
      btn.disabled = false;
      if (ex.code === 'signin_required') {
        err.textContent = '';
        if (await signInPrompt(signBox, 'join')) form.requestSubmit();
        return;
      }
      err.textContent = ex.code === 'busy' ? busyText : friendly(ex);
    }
  });

  function notFound() {
    setQuery('join', null);
    body.replaceChildren(h('div.panel.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '🤔'), h('h2', {}, 'Room not found'),
      h('p', {}, `No game with code ${code} is open. It may have ended, or the code has a typo.`)), codeEntry(''));
  }

  function codeEntry(v) {
    const c = codeField(v);
    const e2 = h('p.net-err', { role: 'alert' });
    const f = h('form.net-form.panel', {}, h('label', {}, 'Room code'), c, e2, h('button.btn.primary.wide', { type: 'submit' }, 'Find game'));
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const cc = cleanCode(c.value);
      if (!validCode(cc)) { e2.textContent = 'Codes are 5 letters and numbers.'; return; }
      go('join', { code: cc }, { replace: true });
    });
    return f;
  }
});

/* --------------------------------------------------------------- host */
// params: { format } (from the format grid) or { spec, title } (from another screen, e.g. a pub quiz builder).
// via: 'p2p' hosts from this device (lane P2P): no public listing, no server status.
defineScreen('host', async (el, { format, spec: given, title: givenTitle, via = 'server' }, cur) => {
  ensureStyles();
  await ensureFormats();
  const kids = !!getSettings().kids;
  const fmt = format ? getFormat(format) : null;
  const device = via === 'p2p' && hasTransport('p2p');
  el.append(header(device ? 'Host from this device' : 'Host a game'));
  const body = h('div.net-wrap');
  el.append(body);
  const name = nameField();
  const err = h('p.net-err', { role: 'alert' });
  body.append(h('div.panel.net-form', {}, h('label', {}, 'Your name'), name));
  let panel = null;
  if (fmt) {
    body.append(h('div.setup-head', {}, h('span.fh-ico', {}, fmt.icon), h('div', {}, h('h2', {}, fmt.title), h('p', {}, fmt.blurb || ''))));
    const opts = h('div');
    body.append(opts);
    panel = optionsPanel(opts, fmt, { structure: 'quick', kids, last: getLast(fmt.id), showTimer: false });
  } else if (given) {
    body.append(h('div.panel', {}, h('h3', {}, givenTitle || 'Your game'), h('p.muted', {}, `${(given.rounds || []).length} round${(given.rounds || []).length === 1 ? '' : 's'}`)));
  } else {
    body.append(h('p.panel', {}, 'Pick a format first.'));
    return;
  }
  const timing = { answerSec: kids ? 20 : 10, gapSec: 5 };
  body.append(timingPanel({ ...timing, onChange: v => Object.assign(timing, v) }));
  const vis = { public: false, startIn: 120 };
  const startRow = h('div', { hidden: true, dataset: { opt: 'start' } }, h('div.opt-label', {}, 'Start'),
    choiceChips(START_CHOICES, START_CHOICES.map(startLabel), vis.startIn, x => { vis.startIn = x; }));
  if (!device) body.append(h('div.panel.stack.net-timing', {},
    h('div', { dataset: { opt: 'vis' } }, h('div.opt-label', {}, 'Who can join'),
      choiceChips([false, true], ['🔒 Private: link or code', '🌍 Public: listed online'], false, x => { vis.public = x; startRow.hidden = !x; })),
    startRow));
  const btn = h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'create' } }, 'Create room');
  const status = h('div');
  body.append(err, btn, status, h('p.net-note', {}, TRUST_HINT));
  const T = getTransport(device ? 'p2p' : 'server');
  const statusNote = h('div');
  body.insertBefore(statusNote, body.firstChild.nextSibling);
  if (device) statusNote.append(h('p.net-note', {}, '📡 No server: this device runs the room for up to 8 players. Keep this tab open and on screen while you play.'));
  else rooms.status().then(s => {
    if (s.level >= 3) statusNote.append(h('p.net-note', {}, pausedText));
    else if (s.level >= 1) isSignedIn().then(ok => { if (!ok) statusNote.append(h('p.net-note', {}, '🔐 Hosting needs a free br8t sign-in right now; you’ll be asked when you create the room.')); });
  }).catch(() => {});

  // Creates the room, handling every refusal inline: sign-in, public slots full, busy/paused (+ device fallback).
  async function createWith(opts) {
    try {
      const res = await T.create(opts);
      saveSeat(res.code, { key: res.playerKey, id: res.playerId, via: T.id });
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
    let spec = given ? { ...given, rounds: (given.rounds || []).map(r => ({ ...r, opts: { ...(r.opts || {}), online: true } })) } : given, title = givenTitle;
    if (panel) {
      panel.save();
      const c = panel.value();
      spec = specFor('online', c);
      if (kids) spec.rounds.forEach(r => { r.opts = { ...r.opts, kids: true }; r.difficulty = 1; });
      spec.rounds.forEach(r => { r.opts = { ...r.opts, online: true }; }); // formats may tune for rooms (lane AU)
      title = fmtTitle(c.format);
    }
    try {
      const r = await prepare(spec, status);
      if (cur !== current()) return;
      if (!r.questions.length) throw new Error('Not enough questions for those themes. Try more themes.');
      let questions = r.questions;
      while (questions.length > 1 && JSON.stringify(questions).length > MAX_SET) questions = questions.slice(0, -1);
      if (questions.length < r.questions.length) toast(`Trimmed to ${questions.length} questions to fit`);
      status.replaceChildren();
      await createWith({ hostName: n, spec, title, questions, ...timing, ...vis });
    } catch (e) {
      status.replaceChildren();
      err.textContent = friendly(e);
      btn.disabled = false;
    }
  });
});

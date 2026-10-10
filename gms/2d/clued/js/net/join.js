// Online hub, join-by-name screen and host setup. Joining needs only a name.
import { h } from '../ui/kit.js?v=202610101826';
import { defineScreen, go, header, current } from '../ui/app.js?v=202610101826';
import { sfx } from '../ui/fx.js?v=202610101826';
import { toast } from '../ui/popup.js?v=202610101826';
import { getFormat } from '../formats/registry.js?v=202610101826';
import { rooms, friendly } from './api.js?v=202610101826';
import { suggestedName, rememberName, tidyName, MAX_NAME } from './ident.js?v=202610101826';
import { ensureStyles, saveSeat, loadSeat, dropSeat, cleanCode, validCode, setQuery, mmss, myRooms, forgetRoom } from './util.js?v=202610101826';
import { packInfo } from '../core/packs.js?v=202610101826';
import { getTransport, hasTransport } from './transport.js?v=202610101826';
import { signInPrompt, busyText } from './signin.js?v=202610101826';


export function nameField(value = '') {
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

/* ------------------------------------------------------- your rooms */
const PHASE = { lobby: ['In the lobby', 'lobby'], question: ['Playing', 'playing'], reveal: ['Playing', 'playing'], final: ['Finished', 'finished'] };
function ageText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'just made' : m < 60 ? `${m} min old` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min ` : ''}old`;
}

// Server rooms this device created or holds a seat in (device rooms die with their tab). Fetched live; rooms that
// are gone, ended or no longer know our key are forgotten silently.
function yourRooms(cur) {
  const list = h('div.net-mine-list.stack');
  const sec = h('div.net-mine', { hidden: true, dataset: { sec: 'mine' } }, h('h3.sec-title', {}, 'Your rooms'), list);
  let offset = 0, busy = false;
  function card(r, seat) {
    const [ph, cls] = PHASE[r.phase] || [r.phase, ''];
    const canEnd = r.isHost || r.owner;
    const role = r.isHost ? '👑 You host' : r.left && !r.players ? 'You left · nobody in it' : r.left ? `You left · 👑 ${r.host || '?'} hosts`
      : r.owner ? `You made it · 👑 ${r.host || '?'} hosts` : `👑 ${r.host || '?'}`;
    const acts = h('div.mr-acts');
    const row = h('div.net-myroom', { dataset: { code: r.code } },
      h('div.mr-top', {}, h('span.mr-code', {}, r.code), h('span.mr-title', {}, r.title || 'Clued game'),
        h('span.mr-phase', { class: cls }, r.phase === 'question' || r.phase === 'reveal' ? `${ph} · Q${r.q + 1}/${r.total}` : ph)),
      h('div.mr-meta', {}, [role, r.players ? `👥 ${r.players} player${r.players === 1 ? '' : 's'}${r.online ? ` (${r.online} online)` : ''}` : null,
        r.public ? '🌍 Public' : '🔒 Private', ageText(Date.now() + offset - r.created)].filter(Boolean).join(' · ')),
      acts);
    const err = msg => { row.querySelector('.net-err')?.remove(); row.append(h('p.net-err', { role: 'alert' }, msg)); };
    acts.append(h('button.btn.small', { type: 'button', dataset: { act: 'rejoin' }, onclick: () => go('join', { code: r.code }) }, 'Rejoin'));
    if (canEnd) {
      let armed = null;
      const b = h('button.btn.small', { type: 'button', dataset: { act: 'end-room' } }, 'End room');
      b.onclick = async () => {
        if (!armed) {   // two-tap confirm, inline
          b.classList.add('armed'); b.textContent = 'End for everyone?';
          armed = setTimeout(() => { armed = null; b.classList.remove('armed'); b.textContent = 'End room'; }, 4000);
          return;
        }
        clearTimeout(armed);
        b.disabled = true; b.textContent = 'Ending…';
        try {
          await rooms.end(r.code, seat.key);
          forgetRoom(r.code); dropSeat(r.code);
          row.remove(); toast(`Room ${r.code} ended`);
          sec.hidden = !list.children.length;
        } catch (e) {
          if (e.code === 'room_not_found' || e.code === 'bad_key') { forgetRoom(r.code); row.remove(); sec.hidden = !list.children.length; return; }
          b.disabled = false; b.classList.remove('armed'); b.textContent = 'End room'; armed = null; err(friendly(e));
        }
      };
      acts.append(b);
    } else {
      acts.append(h('button.btn.small', { type: 'button', dataset: { act: 'leave-room' }, onclick: async e => {
        e.currentTarget.disabled = true;
        try { await rooms.leave(r.code, seat.key); } catch (x) {}
        forgetRoom(r.code); dropSeat(r.code);
        row.remove(); toast(`Left room ${r.code}`);
        sec.hidden = !list.children.length;
      } }, 'Leave'));
    }
    return row;
  }
  async function load() {
    const mine = myRooms();
    const codes = Object.keys(mine).filter(c => mine[c]?.key);
    if (!codes.length) { sec.hidden = true; return; }
    if (busy || list.querySelector('.armed, :disabled')) return;   // don't redraw under a pending tap
    busy = true;
    try {
      const d = await rooms.mine(codes.map(code => ({ code, key: mine[code].key })));
      if (cur !== current()) return;
      offset = d.now - Date.now();
      const gone = (d.gone || []).concat(d.rooms.filter(r => r.left && !r.owner).map(r => r.code));
      if (gone.length) forgetRoom(...gone);
      const live = d.rooms.filter(r => !gone.includes(r.code)).sort((a, b) => b.created - a.created);
      list.replaceChildren(...live.map(r => card(r, mine[r.code])));
      sec.hidden = !live.length;
    } catch (e) { /* offline: keep what's shown */ }
    finally { busy = false; }
  }
  return { el: sec, load };
}

defineScreen('online', (el, params, cur) => {
  ensureStyles();
  const code = codeField();
  const err = h('p.net-err', { role: 'alert' });
  const mineSec = yourRooms(cur);
  const pubList = h('div.net-pubs', {}, h('div.net-wait', {}, 'Looking for public games', h('span.dots')));
  const pubSec = h('div.stack', {}, h('h3.sec-title', {}, 'Public games'), pubList);
  const live = h('button.net-livechip', { type: 'button', hidden: true, onclick: () => pubSec.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
  const joinForm = h('form.net-form', {}, h('label', {}, 'Join with a code'), code, err, h('button.btn.primary.wide', { type: 'submit' }, 'Join'));
  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const c = cleanCode(code.value);
    if (!validCode(c)) { err.textContent = 'Codes are 5 letters and numbers.'; code.focus(); return; }
    go('join', { code: c });
  });
  el.append(header('Play online'),
    h('div.net-wrap', {},
      h('div.net-hero', {}, live, h('div', { style: { fontSize: '48px' } }, '🌐'), h('h2', {}, 'Play with friends'), h('p', {}, 'Host a game and share the link. Friends type a name and they’re in. No sign-in needed.')),
      mineSec.el,
      h('div.panel.stack', {}, h('h3', {}, 'Host a game'), h('p.muted', { style: { margin: 0 } }, 'Add rounds, pick themes (or a ♥ favourite) for each, then share the link or QR code.'),
        h('button.btn.go.big.wide', { type: 'button', dataset: { act: 'host' }, onclick: () => go('host') }, 'Host a game'),
        hasTransport('p2p') ? h('button.btn.wide', { type: 'button', dataset: { act: 'host-device' }, onclick: () => go('host', { via: 'p2p' }) }, '📡 Host from this device (no server)') : null,
        hasTransport('p2p') ? h('p.net-note', { style: { margin: 0 } }, 'Device rooms need no server: your phone or laptop runs the game for up to 8 players.') : null),
      h('div.panel', {}, joinForm),
      pubSec,
      h('p.net-note', {}, 'Challenge links: finish any game and tap “Challenge a friend” to share the same questions.')));
  let cards = [], stop = false, timer = null;
  async function load() {
    if (stop) return;
    try {
      const d = await rooms.listPublic();
      if (stop || cur !== current()) return;
      const offset = d.now - Date.now();
      cards = d.rooms.map(r => publicCard(r, offset));
      live.hidden = !cards.length;
      live.textContent = `🟢 ${cards.length} public game${cards.length === 1 ? '' : 's'} open`;
      pubList.replaceChildren(...(cards.length ? cards.map(c => c.el) : [h('p.net-note', {}, 'No public games right now. Host one and pick “Public”.')]));
    } catch (e) {
      pubList.replaceChildren(h('p.net-note', {}, friendly(e)));
    }
    timer = setTimeout(load, document.hidden ? 15000 : 5000);
  }
  const ticker = setInterval(() => cards.forEach(c => c.tick()), 500);
  load();
  mineSec.load();
  const mineTimer = setInterval(() => { if (!document.hidden) mineSec.load(); }, 10000);
  return () => { stop = true; clearTimeout(timer); clearInterval(ticker); clearInterval(mineTimer); };
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
      if (e.code !== 'network') dropSeat(code, true);
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
  if (info.ended) {
    setQuery('join', null);
    body.replaceChildren(h('div.panel.net-hero', {}, h('div', { style: { fontSize: '48px' } }, '🏁'), h('h2', {}, 'The host ended this room'),
      h('p', {}, `Room ${code} isn’t taking players any more.`)), codeEntry(''));
    return;
  }
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
      h('p', {}, info.title ? `${info.title} · ` : '', info.rounds > 1 ? `${info.rounds} rounds · ` : '', phase),
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

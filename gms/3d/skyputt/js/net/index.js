// Online (M6, PLAN 2.9): the screens around a round — home (name, quick play, create, join by
// code, public rooms), the create form, the room lobby (invite code + share link, players, host
// options, start) — and the hand-off to OnlineGame for play. DOM in #online.
//
//   const online = createOnline({ app, store, hooks: { enter, leave, setRound }, click, onBack });
//   online.open({ join: 'ABC23K' })
import { net, CHEAT_WARNING, readHint } from './net.js';
import { OnlineGame } from './game.js';
import { renderForm } from './form.js';
import { defaultOpts, quickOpts, wireOpts, holesFor, helpersLabel, clockLabel, personalityName, rankForSkill, shareLink } from './rooms.js';
import { THEME_LIST } from '../app/menus.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const themeName = id => THEME_LIST.find(t => t.id === id)?.name || id;
const ERR = {
  no_room: 'No room with that code.', in_play: 'That room has already started.', room_full: 'That room is full.',
  too_many_rooms: 'Too many open rooms from your network. Close one first.', lobby_full: 'The server is full right now. Try again soon.',
  paused: 'Online play is paused for maintenance.', rate_limited: 'Slow down a little and try again.', offline: 'Can’t reach the online server.',
  timeout: 'The server didn’t answer. Try again.', bad_name: 'That name isn’t allowed.', update: 'This room uses holes your game doesn’t have yet. Reload to update.',
  need_players: 'Add a ghost AI or wait for a friend.', unavailable: 'Online play isn’t available here yet.',
};
const errText = e => ERR[e?.code] || e?.message || 'Something went wrong.';

export function createOnline({ app, store, hooks, click = () => {}, onBack }) {
  const el = $('#online');
  let view = null, game = null, draft = null, msg = '', editOpen = false, optsT = 0, cdT = 0;
  const name = () => store.settings().netName || store.story().name || net.me?.name || '';

  function show(html) { el.innerHTML = `<div class="card net-card-main">${html}</div>`; el.hidden = false; }
  function hide() { el.hidden = true; el.innerHTML = ''; clearInterval(cdT); }
  const head = (title, sub = '') => `<div class="net-head"><button class="round" data-a="back" aria-label="Back">${BACK}</button>
    <div><div class="map-title">${esc(title)}</div>${sub ? `<div class="map-sub">${sub}</div>` : ''}</div>
    <span class="net-dot ${net.state}" title="${esc(net.state)}"></span></div>`;

  // ---- net events
  net.on('state', () => { const d = el.querySelector('.net-dot'); if (d) d.className = `net-dot ${net.state}`; });
  net.on('lobby', () => { if (view === 'home') renderRooms(); });
  net.on('room', ({ room }) => {
    if (game || !room) return;
    if (room.state === 'lobby') { if (view === 'lobby' || view === 'home' || view === 'create') lobby(); }
    else startGame(room);
  });
  net.on('roomClosed', m => {
    if (game) return;
    if (view === 'lobby') { msg = m.reason === 'left' ? '' : 'The room closed.'; home(); }
  });

  async function open({ join } = {}) {
    msg = '';
    if (!net.configured) return soon();
    show(`${head('Online')}<div class="net-spin"></div><div class="card-note">Connecting…</div>`);
    view = 'connecting';
    wire();
    try {
      const w = await net.connect({ name: name() });
      if (w.room) return w.room.state === 'lobby' ? lobby() : startGame(w.room);
      if (join) return joinCode(join);
      home();
    } catch (e) {
      show(`${head('Online')}<div class="card-note bad">${esc(errText(e))}</div>
        <div class="card-note">Online play needs the SKYPUTT server${location.hostname.match(/^(192\.168|10\.|localhost|127\.)/) ? ' (tools/server_run.sh on port 8098)' : ''}.</div>
        <button class="btn primary" data-a="retry">Try again</button>`);
      view = 'error';
    }
  }

  function soon() {
    view = 'soon';
    show(`${head('Online')}<div class="card-title">Coming soon</div>
      <div class="card-note">Play mini golf with friends: private rooms with an invite code, a public list, quick play, and ghost AIs to fill the empty seats.</div>
      <div class="card-note">Online play is being tested and will open here soon.</div>
      <button class="btn primary" data-a="back">Back</button>`);
    wire();
  }

  // ---- home
  function home() {
    view = 'home'; editOpen = false;
    show(`${head('Online', `${net.lobby ? `${net.lobby.online} online · ${net.lobby.playing} playing` : 'Mini golf with friends'}`)}
      ${msg ? `<div class="card-note bad">${esc(msg)}</div>` : ''}
      <label class="row net-name"><span>Your name</span><input type="text" data-k="name" maxlength="20" placeholder="Golfer" value="${esc(name())}"></label>
      <button class="btn primary big" data-a="quick">Quick play<small>4 players · 3 holes · ghost AIs fill empty seats</small></button>
      <button class="btn" data-a="create">Create a room</button>
      <div class="net-join"><input type="text" data-k="code" maxlength="6" placeholder="Room code" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btn" data-a="join">Join</button></div>
      <div class="net-sec">Open rooms</div>
      <div class="net-rooms"></div>
      <div class="card-note net-warn">${esc(CHEAT_WARNING)}</div>`);
    msg = '';
    renderRooms();
    net.subscribeLobby(true).catch(() => {});
    wire();
  }
  function renderRooms() {
    const box = el.querySelector('.net-rooms');
    if (!box) return;
    const rooms = net.lobby?.rooms || [];
    box.innerHTML = rooms.length ? rooms.map(r => `<button class="net-room" data-code="${esc(r.code)}">
        <span class="sw" style="background:${THEME_LIST.find(t => t.id === r.theme)?.swatch || '#456'}"></span>
        <span class="rm"><b>${esc(r.name || `${r.host}’s room`)}</b><small>${r.holes} holes · ${esc(themeName(r.theme))} · ${esc(helpersLabel(r.helpers))}${r.shotClock ? ` · ${r.shotClock}s clock` : ''}</small></span>
        <span class="pl">${r.players}/${r.max}</span></button>`).join('')
      : '<div class="card-note">No open rooms right now. Make one, or try Quick play.</div>';
  }

  // ---- create
  function create() {
    view = 'create';
    draft = draft || defaultOpts({ theme: app.themeId === 'greybox' ? 'sky' : app.themeId });
    show(`${head('Create a room')}<div class="net-form"></div>
      <button class="btn primary" data-a="make">Create room</button>`);
    draft = renderForm(el.querySelector('.net-form'), draft, { onChange: o => { draft = o; }, click });
    wire();
  }

  // ---- lobby (in a room, before the round)
  function lobby() {
    const r = net.room;
    if (!r) return home();
    if (r.state !== 'lobby') return startGame(r);
    view = 'lobby';
    const host = r.host === r.you, o = r.opts;
    const humans = r.seats.filter(s => s.kind === 'human').length;
    const ai = r.quick ? o.max - humans : Math.min(o.ai.count, o.max - humans);
    const empty = Math.max(0, o.max - humans - ai);
    const hostName = r.seats[r.host]?.name;
    show(`${head(o.name || (r.quick ? 'Quick play' : host || !hostName ? 'Your room' : `${hostName}’s room`), `${o.holes.length} holes · ${esc(themeName(o.theme))}`)}
      <div class="net-code"><small>${o.public ? 'Public room · code' : 'Invite code'}</small><b>${esc(r.code)}</b>
        <div class="net-share"><button class="btn" data-a="share">Share link</button><button class="btn" data-a="copy">Copy code</button></div></div>
      ${r.quick ? '<div class="card-note net-cd"></div>' : ''}
      <div class="net-sec">Players</div>
      <div class="net-players">${r.seats.map(s => `<div class="np ${s.i === r.you ? 'me' : ''}"><i style="background:${s.color}"></i><span>${esc(s.name)}${s.i === r.you ? ' (you)' : ''}</span>${s.i === r.host ? '<em class="host">host</em>' : ''}${!s.online ? '<em class="away">away</em>' : ''}</div>`).join('')}
        ${ai ? `<div class="np ai"><i></i><span>+ ${ai} ghost AI${ai === 1 ? '' : 's'}</span><em>${esc(personalityName(o.ai.personality))} · ${esc(rankForSkill(o.ai.skill).name)}</em></div>` : ''}
        ${empty ? `<div class="np open"><i></i><span>${empty} open seat${empty === 1 ? '' : 's'}</span></div>` : ''}</div>
      <div class="net-sum">${esc(helpersLabel(o.helpers))} · ${esc(clockLabel(o.shotClock))}</div>
      ${host ? `<button class="btn" data-a="edit">${editOpen ? 'Hide options' : 'Room options'}</button><div class="net-form" ${editOpen ? '' : 'hidden'}></div>` : ''}
      ${host ? `<button class="btn primary" data-a="start" ${humans + ai < 2 ? 'disabled' : ''}>${humans + ai < 2 ? 'Add a ghost AI or a friend' : 'Start round'}</button>` : '<div class="card-note">Waiting for the host to start…</div>'}
      <button class="btn ghost" data-a="leave">Leave room</button>
      <div class="card-note net-warn">${esc(CHEAT_WARNING)}</div>`);
    if (host && editOpen) {
      const cur = { ...structuredClone(o), holeSet: matchSet(o) };
      renderForm(el.querySelector('.net-form'), cur, { quick: r.quick, humans, click, onChange: v => { clearTimeout(optsT); optsT = setTimeout(() => net.setOpts(wireOpts(v)).catch(e => toast(errText(e))), 350); } });
    }
    if (r.quick) {
      const tick = () => { const s = Math.max(0, Math.ceil((r.startAt - net.serverNow()) / 1000)); const c = el.querySelector('.net-cd'); if (c) c.textContent = s > 0 ? `Starting in ${s}s · ghost AIs fill the empty seats` : 'Starting…'; };
      clearInterval(cdT); cdT = setInterval(tick, 500); tick();
    }
    wire();
  }
  // which hole-set id the room's holes are (for the form)
  function matchSet(o) {
    for (const id of ['0-3', '3-3', '6-3', '9-3', '12-3', '15-3', '0-9', '9-9', '0-18']) {
      const hs = holesFor(o.course, id);
      if (hs.length === o.holes.length && hs.every((h, i) => h.id === o.holes[i].id)) return id;
    }
    return 'r3';
  }

  function toast(t) {
    let n = el.querySelector('.net-toast');
    if (!n) { n = document.createElement('div'); n.className = 'card-note bad net-toast'; el.querySelector('.card')?.prepend(n); }
    n.textContent = t;
  }

  async function joinCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return toast('Type the room code first.');
    try { await net.joinRoom(code); lobby(); }   // holes are checked when the round starts (courseForRoom)
    catch (e) { msg = errText(e); home(); }
  }

  async function startGame(room) {
    if (game) return;
    hide(); view = 'game';
    net.subscribeLobby(false).catch(() => {});
    game = new OnlineGame({
      app, net, store, hooks,
      onEnd: (reason, r) => {
        game = null;
        if (reason === 'lobby' && net.room) { el.hidden = false; return lobby(); }
        msg = reason === 'closed' ? 'The room closed.' : '';
        home();
      },
    });
    try { await game.begin(room); }
    catch (e) {
      console.warn('[skyputt] online game failed to start', e);
      const g = game; game = null;
      try { await net.leaveRoom(); } catch { /* */ }
      try { await g?.end('error'); } catch { /* */ }
      msg = errText(e); home();
    }
  }

  // ---- one delegated click handler per render
  function wire() {
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (b.dataset.code) { click(); return joinCode(b.dataset.code); }
      if (!a) return;
      click();
      switch (a) {
        case 'back':
          if (view === 'create') return home();
          if (view === 'lobby') { try { await net.leaveRoom(); } catch { /* */ } return home(); }
          net.subscribeLobby(false).catch(() => {});
          hide(); view = null;
          if (!net.room) net.close();
          return onBack?.();
        case 'retry': return open();
        case 'quick':
          b.disabled = true;
          try { await net.quick(wireOpts(quickOpts({ theme: app.themeId === 'greybox' ? 'sky' : app.themeId }))); lobby(); }
          catch (err) { b.disabled = false; toast(errText(err)); }
          return;
        case 'create': return create();
        case 'make':
          b.disabled = true;
          try { await net.createRoom(wireOpts(draft)); lobby(); }
          catch (err) { b.disabled = false; toast(errText(err)); }
          return;
        case 'join': return joinCode(el.querySelector('[data-k=code]')?.value);
        case 'edit': editOpen = !editOpen; return lobby();
        case 'start':
          b.disabled = true;
          try { await net.start(); } catch (err) { b.disabled = false; toast(errText(err)); }
          return;
        case 'leave': try { await net.leaveRoom(); } catch { /* */ } return home();
        case 'share': return share();
        case 'copy': return copy(net.room?.code, b);
      }
    };
    const nm = el.querySelector('[data-k=name]');
    if (nm) nm.onchange = async () => {
      const v = nm.value.trim();
      if (!v) return;
      try { const n = await net.rename(v); store.setSetting('netName', n); nm.value = n; } catch (err) { toast(errText(err)); nm.value = name(); }
    };
    const code = el.querySelector('[data-k=code]');
    if (code) code.onkeydown = e => { if (e.key === 'Enter') joinCode(code.value); };
  }

  async function share() {
    const r = net.room; if (!r) return;
    const url = shareLink(r.code), text = `Play SKYPUTT mini golf with me! Room ${r.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'SKYPUTT', text, url }); return; } } catch { /* cancelled */ }
    copy(url, el.querySelector('[data-a=share]'));
  }
  async function copy(text, btn) {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = t; }, 1400); } }
    catch { toast(text); }
  }

  return {
    open, net,
    get game() { return game; },
    get view() { return view; },
    hint: readHint,
  };
}

// Online (online agent): plug-in screen for #/online/* (registered in main.js PLUGINS).
//
//   #/online                 home: warning, allowance, ratings, tabs Play | Lobby | Leaderboard
//   #/online/seek/<tc>       quick match waiting screen (cancel)
//   #/online/room/<code>     my room waiting for an opponent (code, share link, cancel)
//   #/online/join/<code>     a shared link / typed code: room preview + Join
//   #/online/game/<id>       the online game (online_game.js)
//
// All server traffic goes through js/app/net.js (server agent). Rules for its use:
// docs/notes/server.md "How the ui should use net.js".
import { h, esc, icon, toast, openSheet, segmented, bindSegmented, fmtInt } from '../ui.js';
import { getSettings, setSettings } from '../store.js';
import { CHEAT_WARNING, FRIENDS_TIP } from '../net.js';
import { play } from '../sound.js';
import {
  net, ensureCss, CATS, catName, tcLabel, tcFull, ratingTxt, playerAvatar, allowanceChip, outOfGames,
  outOfGamesSheet, openAccount, buyPass, handleError, connBanner, nameOf,
} from './online_common.js';
import { mountGame } from './online_game.js';

const TC_GROUPS = [
  { group: 'Bullet', items: ['1+0', '2+1'] },
  { group: 'Blitz', items: ['3+0', '3+2', '5+0', '5+3'] },
  { group: 'Rapid', items: ['10+0', '10+5', '15+10'] },
  { group: 'Classical', items: ['30+0'] },
  { group: 'Unlimited', items: ['unlimited'] },
];
const COLOR_OPTS = [
  { value: 'w', label: '<i class="kdot w"></i>White' }, { value: 'random', label: '<i class="kdot r"></i>Random' },
  { value: 'b', label: '<i class="kdot b"></i>Black' },
];

let appRef = null;
let homeTab = 'play';
let found = null;            // {game} just paired, shown on the waiting screen before the board opens
let inWaiting = false;       // a waiting screen is up (it shows "opponent found" itself)

// ---------- global wiring (once) ----------
let wired = false;
function wire(app) {
  if (wired) return;
  wired = true;
  // a page parked in the back/forward cache must not look connected to the server (and to the opponent)
  window.addEventListener('pagehide', e => { if (e.persisted && net.state !== 'idle') { net._parked = true; net.close(); } });
  window.addEventListener('pageshow', e => { if (e.persisted && net._parked) { net._parked = false; connectOnce().catch(() => {}); } });
  net.on('start', ({ game }) => {
    if (!game) return;
    const onlineHere = location.hash.startsWith('#/online');
    // a bot game in progress keeps the screen; tell the player instead
    if (!onlineHere && app.route === 'game' && app.canPester && !app.canPester()) {
      toast(`Your online game vs ${opp(game).name} has started! Open Online to play.`, { ms: 5000 });
      return;
    }
    play('start');
    if (inWaiting) { found = game; document.dispatchEvent(new CustomEvent('gambit-online-found')); return; }
    app.go(`#/online/game/${game.id}`);
  });
}
const opp = g => (g.you === 'w' ? g.black : g.white) || {};

function connectOnce() {
  const name = getSettings().onlineName || '';
  return net.connect(name ? { name } : {});
}

// ---------- mount ----------
export function mount(el, ctx) {
  appRef = ctx.app;
  wire(ctx.app);
  el.classList.add('ol');
  const rest = (ctx.params.rest || '').split('/');
  const [sub, arg] = [rest[0] || '', rest.slice(1).join('/')];
  const cleanups = [];
  let left = false;
  const ui = h('<div class="ol-wrap"><div class="ol-loading"><div class="boot-spin"></div><span>Connecting to the online server…</span></div></div>');
  el.appendChild(ui);
  if (sub === 'game') el.classList.add('ol-gamewrap');

  let inner = null;
  const start = () => {
    if (left) return;
    try {
      if (sub === 'game') inner = mountGame(ui, ctx, arg);
      else if (sub === 'seek') inner = seekScreen(ui, ctx, arg);
      else if (sub === 'room') inner = roomScreen(ui, ctx, arg.toUpperCase());
      else if (sub === 'join') inner = joinScreen(ui, ctx, arg.toUpperCase());
      else if (sub === 'leaders' || sub === 'lobby') { homeTab = sub; inner = homeScreen(ui, ctx); }
      else inner = homeScreen(ui, ctx);
    } catch (e) { console.error('[gambit] online screen', e); ui.textContent = 'This screen could not load.'; }
  };
  if (sub !== 'game') ctx.setTop({ title: 'Play Online', back: '#/home' });

  let slow = setTimeout(() => {
    if (left || net.state === 'open') return;
    const l = ui.querySelector('.ol-loading');
    if (l) l.innerHTML = `<div class="ol-offline">${icon('globe')}<h3>Can’t reach the online server</h3>
      <p>Still trying… Check your connection. Bots and puzzles work offline.</p>
      <div class="ol-row"><a class="btn btn-ghost" href="#/play/bot">${icon('robot')} Play a bot</a></div></div>`;
  }, 8000);
  Promise.all([ensureCss(), connectOnce()]).then(() => { clearTimeout(slow); start(); })
    .catch(e => { clearTimeout(slow); if (left) return; console.warn('[gambit] online connect', e && e.code);
      const off = net.on('welcome', () => { off(); start(); }); cleanups.push(off);
      const l = ui.querySelector('.ol-loading');
      if (l) l.innerHTML = `<div class="ol-offline">${icon('globe')}<h3>Can’t reach the online server</h3><p>Retrying in the background. Bots and puzzles work offline.</p></div>`;
    });

  return {
    leave() {
      left = true; clearTimeout(slow);
      cleanups.forEach(f => f());
      try { inner && inner.leave && inner.leave(); } catch (e) { console.warn(e); }
    },
  };
}

// ---------- home ----------
function homeScreen(root, ctx) {
  const offs = [];
  let lb = { cat: getSettings().onlineLbCat || 'blitz', rows: null, err: null };
  const rated = () => getSettings().onlineRated !== false;

  const el = h(`<div class="ol-home">
    <div class="ol-connbar"></div>
    <div class="ol-me card card-accent"></div>
    <div class="ol-live"></div>
    <div class="warn ol-warn">${icon('info')}<span>${esc(CHEAT_WARNING)}</span></div>
    <div class="tabs ol-tabs" role="tablist">
      <a role="tab" data-tab="play">Play</a><a role="tab" data-tab="lobby">Lobby</a><a role="tab" data-tab="leaders">Leaderboard</a>
    </div>
    <div class="ol-tab"></div>
  </div>`);
  root.replaceChildren(el);

  function renderMe() {
    const me = net.me || {}, r = net.ratings || {};
    el.querySelector('.ol-me').innerHTML = `
      <div class="ol-me-top">${playerAvatar(me, { size: 'md', me: true })}
        <div class="ol-me-id"><small>${me.anon ? 'Playing as a guest' : 'Signed in'}</small>
          <b>${esc(me.name || 'Player')}</b></div>
        <button class="tb-btn" data-act="rename" aria-label="Change your online name" title="Change name">${icon('settings')}</button>
      </div>
      <div class="ol-ratings">${CATS.map(c => { const x = r[c.id] || {}; return `<div title="${x.prov ? 'Provisional: settles after a few more games' : ''}">
        <small>${c.short || c.name}</small><b>${ratingTxt(x.r ? Math.round(x.r) : 1500, x.prov !== false)}</b><em>${x.games ? `${x.games} game${x.games === 1 ? '' : 's'}` : 'new'}</em></div>`; }).join('')}</div>
      <p class="ol-prov-note">? = provisional rating: it settles after a few games.</p>
      ${allowanceChip(net.allowance)}`;
  }
  function renderLive() {
    const live = [...net.games.values()].filter(g => g.status === 'playing');
    el.querySelector('.ol-live').innerHTML = live.map(g => { const o = opp(g); return `<div class="continue card card-accent ol-cont">
      ${playerAvatar(o, { size: 'lg' })}
      <div class="continue-txt"><small>Online game in progress</small><b>vs ${nameOf(o)} <span class="elo">${ratingTxt(o.rating, o.prov)}</span></b>
        <span>${esc(tcFull(g.tc))} · ${g.rated ? 'Rated' : 'Casual'} · move ${Math.floor((g.moves || []).length / 2) + 1}</span></div>
      <div class="continue-btns"><a class="btn btn-primary" href="#/online/game/${esc(g.id)}">${icon('play')} Return to game</a></div></div>`; }).join('');
  }
  function renderConn() { el.querySelector('.ol-connbar').innerHTML = connBanner(); }

  function renderTab() {
    el.querySelectorAll('.ol-tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === homeTab));
    const body = el.querySelector('.ol-tab');
    if (homeTab === 'play') body.innerHTML = playTab();
    else if (homeTab === 'lobby') body.innerHTML = lobbyTab();
    else body.innerHTML = leadersTab();
    if (homeTab === 'leaders' && !lb.rows && !lb.err && !lb.loading) loadLb();
  }
  function seekingCount(tc) { return (net.lobby && net.lobby.seeking && net.lobby.seeking[tc]) || 0; }
  function playTab() {
    return `<h3 class="sect">Quick match</h3>
      <div class="ol-ratedrow">${segmented('rated', [{ value: 'true', label: 'Rated' }, { value: 'false', label: 'Casual' }], String(rated()))}</div>
      <div class="tc-groups">${TC_GROUPS.map(g => `<div class="tc-group"><small>${icon('clock')} ${g.group}</small>
        <div class="tc-chips">${g.items.map(tc => { const n = seekingCount(tc); return `<button class="chip ol-tc" data-tc="${tc}">${tcLabel(tc)}${n ? `<i class="ol-seekn" title="${n} waiting">${n}</i>` : ''}</button>`; }).join('')}</div></div>`).join('')}</div>
      <h3 class="sect">Play a friend</h3>
      <div class="card ol-friend">
        <p>${icon('user')}<span>${esc(FRIENDS_TIP)}</span></p>
        <button class="btn btn-primary" data-act="friend">${icon('play')} Create a private room</button>
        <form class="ol-code" autocomplete="off"><input name="code" maxlength="8" placeholder="Have a code?" aria-label="Room code" autocapitalize="characters" spellcheck="false"><button class="btn btn-ghost" type="submit">Join</button></form>
      </div>
      ${lobbyStats()}`;
  }
  function lobbyStats() {
    const l = net.lobby;
    return l ? `<p class="fine">${fmtInt(l.online || 0)} online · ${fmtInt(l.playing || 0)} playing now</p>` : '';
  }
  function lobbyTab() {
    const rooms = (net.lobby && net.lobby.rooms) || [];
    const mine = net.me && net.me.pid;
    return `<div class="ol-lobby-head"><h3 class="sect">Open rooms</h3><button class="btn btn-primary btn-sm" data-act="create">${icon('play')} Create room</button></div>
      ${rooms.length ? `<ul class="ol-rooms">${rooms.map(r => `<li>
        ${playerAvatar(r.host, { size: 'sm' })}
        <span class="ol-rn"><b>${esc(r.name || `${r.host?.name || 'Player'}'s game`)}</b>
          <small>${ratingTxt(r.host?.rating, r.host?.prov)} · ${esc(tcFull(r.tc))} · ${r.rated ? 'Rated' : 'Casual'}${r.color && r.color !== 'random' ? ` · host plays ${r.color === 'w' ? 'White' : 'Black'}` : ''}</small></span>
        ${r.host && r.host.pid === mine ? `<a class="btn btn-ghost btn-sm" href="#/online/room/${esc(r.code)}">Yours</a>` : `<button class="btn btn-primary btn-sm" data-join="${esc(r.code)}">Join</button>`}
      </li>`).join('')}</ul>` : `<div class="ol-empty card">${icon('globe')}<p>No open rooms right now.</p><small>Create one, or try a quick match.</small></div>`}
      ${lobbyStats()}`;
  }
  function leadersTab() {
    const rows = lb.rows;
    return `<div class="ol-lbcats">${segmented('lbcat', CATS.map(c => ({ value: c.id, label: c.name })), lb.cat)}</div>
      ${lb.err ? `<div class="ol-empty card"><p>Could not load the leaderboard.</p></div>`
        : !rows ? '<div class="ol-empty card"><div class="boot-spin"></div></div>'
        : rows.length ? `<ol class="lb ol-lb">${rows.map(r => `<li class="${net.me && r.pid === net.me.pid ? 'you' : ''}">
            <span class="lb-rank">${r.rank}</span>${playerAvatar(r, { size: 'sm' })}
            <span class="lb-name">${esc(r.name)}${net.me && r.pid === net.me.pid ? ' <em>you</em>' : ''}<small>${r.wins}W ${r.draws}D ${r.losses}L</small></span>
            <span class="lb-score">${Math.round(r.rating)}</span></li>`).join('')}</ol>`
        : `<div class="ol-empty card">${icon('trophy')}<p>No ${catName(lb.cat).toLowerCase()} players on the board yet.</p><small>Be the first: play a few rated games while signed in.</small></div>`}
      <p class="fine">Only signed-in players with an established (non-provisional) rating are listed.</p>
      <div class="warn">${icon('info')}<span>${esc(CHEAT_WARNING)}</span></div>`;
  }
  async function loadLb() {
    lb.loading = true;
    const cat = lb.cat;
    try { const r = await net.leaderboard(cat, 50); if (lb.cat === cat) { lb.rows = r.rows || []; lb.err = null; } }
    catch (e) { if (lb.cat === cat) lb.err = e; }
    lb.loading = false;
    if (homeTab === 'leaders') renderTab();
  }

  function guard() {
    if (outOfGames(net.allowance)) { outOfGamesSheet(net.allowance); return false; }
    return true;
  }

  el.addEventListener('click', async e => {
    const tab = e.target.closest('.ol-tabs a');
    if (tab) { e.preventDefault(); homeTab = tab.dataset.tab; play('tap'); renderTab(); return; }
    const tc = e.target.closest('[data-tc]');
    if (tc) { play('tap'); if (guard()) ctx.go(`#/online/seek/${tc.dataset.tc}`); return; }
    const j = e.target.closest('[data-join]');
    if (j) { play('tap'); if (guard()) ctx.go(`#/online/join/${j.dataset.join}`); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'signin') openAccount();
    else if (act === 'pass') buyPass();
    else if (act === 'friend') { if (guard()) createRoomSheet(ctx, { public: false }); }
    else if (act === 'create') { if (guard()) createRoomSheet(ctx, { public: true }); }
    else if (act === 'rename') renameSheet(renderMe);
  });
  el.addEventListener('submit', e => {
    e.preventDefault();
    const code = String(new FormData(e.target).get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { toast('Enter the room code your friend sent you'); return; }
    ctx.go(`#/online/join/${code}`);
  });
  bindSegmented(el, (name, v) => {
    if (name === 'rated') setSettings({ onlineRated: v === 'true' });
    if (name === 'lbcat') { lb = { cat: v, rows: null, err: null }; setSettings({ onlineLbCat: v }); renderTab(); }
  });

  renderConn(); renderMe(); renderLive(); renderTab();
  offs.push(net.on('allowance', renderMe), net.on('welcome', () => { renderMe(); renderLive(); }),
    net.on('state', renderConn), net.on('end', renderLive),
    net.on('lobby', () => { if (homeTab !== 'leaders') { const sy = document.querySelector('#view')?.scrollTop; renderTab(); if (sy != null) document.querySelector('#view').scrollTop = sy; } }));
  net.subscribeLobby(true).catch(() => {});
  net.myRatings().then(renderMe).catch(() => {});
  return { leave() { offs.forEach(f => f()); net.subscribeLobby(false).catch(() => {}); } };
}

function renameSheet(after) {
  const sh = openSheet(`<form class="ol-rename"><div class="sheet-head"><h3>Your online name</h3><button type="button" class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <p class="hint-txt">Shown to your opponents. Used for your next games.</p>
    <input name="n" maxlength="24" value="${esc(net.me?.name || '')}" aria-label="Name" autocomplete="nickname">
    <button class="btn btn-primary btn-xl" type="submit">Save</button></form>`);
  const f = sh.el.querySelector('form');
  setTimeout(() => f.n.focus(), 250);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const n = f.n.value.trim();
    if (!n) return;
    try { const got = await net.rename(n); setSettings({ onlineName: got }); sh.close(); toast(`You are now ${got}`); after && after(); }
    catch (err) { handleError(err); }
  });
}

// ---------- create room ----------
function createRoomSheet(ctx, { public: pub }) {
  const s = getSettings();
  let opt = { tc: s.onlineTc || '10+0', rated: s.onlineRated !== false, public: pub, color: 'random' };
  const sh = openSheet(`<div class="ol-create">
    <div class="sheet-head"><h3>${pub ? 'Create a room' : 'Play a friend'}</h3><button class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <p class="hint-txt">${pub ? 'Your room shows in the lobby until someone joins.' : 'You get a code and a link to send. Only people with it can join.'}</p>
    <h3 class="sect">Time control</h3>
    <div class="tc-groups">${TC_GROUPS.map(g => `<div class="tc-group"><small>${g.group}</small>
      <div class="tc-chips">${g.items.map(tc => `<button class="chip${tc === opt.tc ? ' on' : ''}" data-ctc="${tc}">${tcLabel(tc)}</button>`).join('')}</div></div>`).join('')}</div>
    <h3 class="sect">Game</h3>
    ${segmented('rated', [{ value: 'true', label: 'Rated' }, { value: 'false', label: 'Casual' }], String(opt.rated))}
    <div style="height:8px"></div>
    ${segmented('vis', [{ value: 'true', label: `${icon('globe')} Public` }, { value: 'false', label: `${icon('lock')} Private` }], String(opt.public))}
    <h3 class="sect">You play</h3>
    ${segmented('color', COLOR_OPTS, opt.color)}
    <button class="btn btn-primary btn-xl ol-create-go" data-act="go">${icon('play')} Create room</button>
  </div>`, { cls: 'ol-sheet' });
  bindSegmented(sh.el, (n, v) => {
    if (n === 'rated') opt.rated = v === 'true';
    if (n === 'vis') opt.public = v === 'true';
    if (n === 'color') opt.color = v;
  });
  sh.el.addEventListener('click', async e => {
    const c = e.target.closest('[data-ctc]');
    if (c) { opt.tc = c.dataset.ctc; sh.el.querySelectorAll('[data-ctc]').forEach(x => x.classList.toggle('on', x === c)); return; }
    const go = e.target.closest('[data-act="go"]'); if (!go || go.disabled) return;
    go.disabled = true;
    try {
      const room = await net.createRoom(opt);
      setSettings({ onlineTc: opt.tc });
      sh.close();
      ctx.go(`#/online/room/${room.code}`);
    } catch (err) { go.disabled = false; handleError(err); }
  });
}

// ---------- waiting: shared "opponent found" card ----------
function foundCard(g) {
  const o = opp(g), me = g.you === 'w' ? g.white : g.black;
  return `<div class="ol-found">
    <small>Opponent found</small>
    <div class="ol-vs">
      <div>${playerAvatar(me, { size: 'lg', me: true })}<b>${nameOf(me)}</b><span class="elo">${ratingTxt(me.rating, me.prov)}</span></div>
      <i>vs</i>
      <div>${playerAvatar(o, { size: 'lg' })}<b>${nameOf(o)}</b><span class="elo">${ratingTxt(o.rating, o.prov)}</span></div>
    </div>
    <p>You play <b>${g.you === 'w' ? 'White' : 'Black'}</b> · ${esc(tcFull(g.tc))} · ${g.rated ? 'Rated' : 'Casual'}</p>
  </div>`;
}
function onFound(root, ctx) {
  const fn = () => {
    const g = found; found = null;
    if (!g) return;
    const card = root.querySelector('.ol-wait-card');
    if (card) card.innerHTML = foundCard(g);
    root.querySelectorAll('[data-act="cancel"]').forEach(b => { b.hidden = true; });
    setTimeout(() => ctx.go(`#/online/game/${g.id}`), 1400);
  };
  document.addEventListener('gambit-online-found', fn);
  return () => document.removeEventListener('gambit-online-found', fn);
}

// ---------- quick match ----------
function seekScreen(root, ctx, tc) {
  const rated = getSettings().onlineRated !== false;
  const info = net.tcs.find(t => t.id === tc);
  if (!info) { ctx.go('#/online'); return null; }
  inWaiting = true;
  const t0 = Date.now();
  let started = false, cancelled = false;
  const el = h(`<div class="ol-wait">
    <div class="ol-connbar"></div>
    <div class="ol-wait-card card card-accent">
      <div class="ol-radar"><span></span><span></span><span></span>${icon('globe')}</div>
      <h2>Finding an opponent…</h2>
      <p class="ol-wait-tc"><b>${esc(tcFull(info))}</b> · ${rated ? 'Rated' : 'Casual'}</p>
      <p class="ol-wait-sub"><span class="ol-elapsed">0:00</span> · <span class="ol-others"></span></p>
    </div>
    <button class="btn btn-ghost btn-xl" data-act="cancel">${icon('x')} Cancel</button>
    <div class="warn">${icon('info')}<span>${esc(CHEAT_WARNING)}</span></div>
  </div>`);
  root.replaceChildren(el);
  ctx.setTop({ title: 'Quick match', sub: esc(tcFull(info)), back: '#/online' });
  const offs = [onFound(el, ctx)];
  const others = () => {
    const n = Math.max(0, ((net.lobby?.seeking || {})[tc] || 0) - (net.seek ? 1 : 0));
    const o = el.querySelector('.ol-others'); if (!o) return;
    o.textContent = n ? `${n} other${n === 1 ? '' : 's'} waiting` : 'Waiting for players';
  };
  const conn = () => { el.querySelector('.ol-connbar').innerHTML = connBanner(); };
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const e = el.querySelector('.ol-elapsed'); if (e) e.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
  offs.push(net.on('lobby', others), net.on('state', conn),
    net.on('start', () => { started = true; }),
    net.on('seek', ({ seek, reason }) => {
      if (seek || started || cancelled) return;
      if (reason === 'no_games_left') { outOfGamesSheet(); ctx.go('#/online'); }
      else if (reason && reason !== 'matched') { toast('The search stopped. Try again.'); ctx.go('#/online'); }
    }));
  others(); conn();
  net.subscribeLobby(true).catch(() => {});
  (net.seek && net.seek.tc === tc ? Promise.resolve() : net.quickMatch(tc, { rated }))
    .catch(e => { if (cancelled) return; handleError(e); ctx.go('#/online'); });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-act="cancel"]')) { play('tap'); ctx.go('#/online'); }
  });
  return {
    leave() {
      inWaiting = false; cancelled = true;
      clearInterval(timer); offs.forEach(f => f());
      if (!started && net.seek) net.cancelQuickMatch().catch(() => {});
      net.subscribeLobby(false).catch(() => {});
    },
  };
}

// ---------- my room (private code / public room) ----------
function shareUrl(code) { return `${location.origin}${location.pathname}#/online/join/${code}`; }
function roomScreen(root, ctx, code) {
  const room = net.rooms.get(code);
  if (!room) { toast('That room is closed'); ctx.go('#/online'); return null; }
  inWaiting = true;
  let started = false;
  const url = shareUrl(code);
  const canShare = !!navigator.share && matchMedia('(pointer: coarse)').matches;
  const el = h(`<div class="ol-wait">
    <div class="ol-connbar"></div>
    <div class="ol-wait-card card card-accent">
      <small class="ol-kicker">${room.public ? 'Public room · in the lobby' : 'Private room'}</small>
      <h2>${room.public ? 'Waiting for an opponent…' : 'Send this code to a friend'}</h2>
      <div class="ol-codebox"><span class="ol-code-txt" aria-label="Room code">${esc(code)}</span>
        <button class="btn btn-ghost btn-sm" data-act="copycode">Copy</button></div>
      <div class="ol-link"><input readonly value="${esc(url)}" aria-label="Invite link"><button class="btn btn-primary btn-sm" data-act="copy">Copy link</button></div>
      ${canShare ? `<button class="btn btn-primary btn-xl" data-act="share">${icon('user')} Share invite</button>` : ''}
      <p class="ol-wait-tc"><b>${esc(tcFull(room.tc))}</b> · ${room.rated ? 'Rated' : 'Casual'} · you play ${room.color === 'w' ? 'White' : room.color === 'b' ? 'Black' : 'a random colour'}</p>
      <p class="ol-wait-sub"><span class="ol-dots"><i></i><i></i><i></i></span> The game starts as soon as they join.</p>
    </div>
    <button class="btn btn-ghost btn-xl" data-act="cancel">${icon('x')} Close room</button>
    <p class="fine">${esc(FRIENDS_TIP)}</p>
  </div>`);
  root.replaceChildren(el);
  ctx.setTop({ title: room.public ? 'Your room' : 'Play a friend', sub: esc(tcFull(room.tc)), back: '#/online' });
  const offs = [onFound(el, ctx), net.on('start', () => { started = true; }),
    net.on('state', () => { el.querySelector('.ol-connbar').innerHTML = connBanner(); }),
    net.on('roomClosed', m => {
      if (m.code !== code || started || m.reason === 'started') return;
      toast(m.reason === 'expired' ? 'The room expired' : m.reason === 'no_games_left' ? 'No online games left today' : 'The room was closed', { ms: 3000 });
      ctx.go('#/online');
    })];
  const copy = async (txt, what) => {
    try { await navigator.clipboard.writeText(txt); toast(`${what} copied`); }
    catch { const i = el.querySelector('.ol-link input'); i.select(); toast('Select and copy the link'); }
  };
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    play('tap');
    if (a.dataset.act === 'copy') copy(url, 'Link');
    if (a.dataset.act === 'copycode') copy(code, 'Code');
    if (a.dataset.act === 'share') {
      try { await navigator.share({ title: 'GAMBIT chess', text: `Play me at chess on GAMBIT! Room code ${code}`, url }); } catch { /* cancelled */ }
    }
    if (a.dataset.act === 'cancel') ctx.go('#/online');
  });
  el.querySelector('.ol-link input').addEventListener('focus', e => e.target.select());
  return {
    leave() {
      inWaiting = false;
      offs.forEach(f => f());
      if (!started && net.rooms.has(code)) net.closeRoom(code).catch(() => {});
    },
  };
}

// ---------- join by code / link ----------
function joinScreen(root, ctx, code) {
  let left = false, started = false;
  inWaiting = true;
  const el = h(`<div class="ol-wait"><div class="ol-connbar"></div><div class="ol-wait-card card card-accent"><div class="boot-spin"></div><p>Looking up room ${esc(code)}…</p></div></div>`);
  root.replaceChildren(el);
  ctx.setTop({ title: 'Join a game', sub: `Room ${esc(code)}`, back: '#/online' });
  const offs = [onFound(el, ctx), net.on('start', () => { started = true; })];
  const card = el.querySelector('.ol-wait-card');
  const fail = msg => {
    card.innerHTML = `<div class="ol-offline">${icon('x')}<h3>${esc(msg)}</h3><p>Ask your friend for a new code, or play someone else.</p>
      <div class="ol-row"><a class="btn btn-primary" href="#/online">${icon('globe')} Online home</a></div></div>`;
  };
  net.peekRoom(code).then(room => {
    if (left) return;
    if (room.host && net.me && room.host.pid === net.me.pid) { ctx.go(`#/online/room/${code}`); return; }
    const hc = room.color === 'w' ? 'b' : room.color === 'b' ? 'w' : 'random';
    card.innerHTML = `<small class="ol-kicker">${room.public ? 'Public room' : 'Private room'}</small>
      <div class="ol-host">${playerAvatar(room.host, { size: 'xl' })}</div>
      <h2>${nameOf(room.host)} <span class="elo">${ratingTxt(room.host?.rating, room.host?.prov)}</span></h2>
      <p class="ol-wait-tc">invites you to <b>${esc(tcFull(room.tc))}</b> · ${room.rated ? 'Rated' : 'Casual'}</p>
      <p class="ol-wait-sub">You play ${hc === 'w' ? '<b>White</b>' : hc === 'b' ? '<b>Black</b>' : 'a random colour'}</p>
      <button class="btn btn-primary btn-xl" data-act="join">${icon('play')} Join game</button>
      ${allowanceLine()}`;
  }).catch(e => { if (!left) fail(e.code === 'no_room' ? 'That room is closed or the code is wrong' : 'Could not find that room'); });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-act="join"]'); if (!b || b.disabled) return;
    if (outOfGames(net.allowance)) { outOfGamesSheet(); return; }
    b.disabled = true; b.innerHTML = 'Joining…';
    try { await net.joinRoom(code); }
    catch (err) {
      b.disabled = false; b.innerHTML = `${icon('play')} Join game`;
      if (err.code === 'no_room' || err.code === 'host_busy' || err.code === 'host_no_games') fail(err.code === 'no_room' ? 'That room is closed' : 'The host can’t start this game right now');
      else handleError(err);
    }
  });
  return { leave() { left = true; inWaiting = false; offs.forEach(f => f()); void started; } };
}
function allowanceLine() {
  const a = net.allowance;
  if (!a || a.unlimited) return '';
  return `<p class="fine">${Math.max(0, a.remaining)} of ${a.perDay} online games left today</p>`;
}

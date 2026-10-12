// The ARENA panel: who you are, the modes, the lobby, friend links, the connect screen with
// the real ping, and the result card. Hidden unless the arena server answers its probe.

import { ArenaClient } from './client.js';
import { NetFight, loadoutOf } from './fight.js';
import { GhostMatch, ghostSnap, ghostSave, ghostPower, pickGhosts, ghostBattle } from './ghost.js';
import { createBoards } from './boards.js';

const NAME_KEY = 'ragdojo.arena.name';
const DEVICE_KEY = 'ragdojo.arena.device';
const FRIENDS_KEY = 'ragdojo.arena.friends';

/**
 * The arena's modes, in the order the PLAY tab lists them. A mode with `live: true` gets
 * FIND A FIGHT (waits in the lobby with its id as the game type) and FRIEND LINK; the rest
 * show "coming soon". Flip `live` here when a mode ships. `short` labels its leaderboard tab.
 */
export const MODES = [
  { id: 'duel', name: '1v1 · BEST OF 3', short: '1v1', desc: 'live, against a real person', lanDesc: 'on your home network', live: true },
  { id: 'bandana', name: 'STEAL THE BANDANA', short: 'BANDANA', desc: 'grab the golden bandana and hold it', live: false },
  { id: 'hill', name: 'KING OF THE HILL', short: 'HILL', desc: 'hold the ledge alone', live: false },
  { id: 'lms', name: 'LAST MAN STANDING', short: 'LMS', desc: 'up to 8 on one page', live: false },
];
const TABS = [['play', 'PLAY'], ['ghosts', 'GHOSTS'], ['boards', 'BOARDS']];
const PAY_API = '/api/br8t/';
const qs = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Signal bars for a ping: 5 green = good, 2-3 yellow = average, 1 red = bad. */
export function barsFor(ms) {
  if (!(ms > 0)) return 0;
  return ms <= 60 ? 5 : ms <= 100 ? 4 : ms <= 160 ? 3 : ms <= 250 ? 2 : 1;
}
export function barsHTML(ms, label = '') {
  const n = barsFor(ms);
  const tone = n >= 4 ? 'good' : n >= 2 ? 'ok' : n === 1 ? 'bad' : 'none';
  let h = `<span class="bars ${tone}" title="${n ? `about ${Math.round(ms)} ms` : 'measuring'}" data-bars="${n}">`;
  for (let i = 1; i <= 5; i++) h += `<i class="${i <= n ? 'on' : ''}" style="height:${4 + i * 3}px"></i>`;
  return h + `</span>${label ? `<span class="ms">${label}</span>` : ''}`;
}

/**
 * Where the arena lives. games.br8t.com: its own origin, behind Caddy. A 192.* host (family
 * LAN, the same rule as the purchase skip): the arena server on that machine — same origin
 * when lan.sh serves the page, else the sibling port. Localhost source: the dev port.
 */
export function arenaBase({ dev, lan }) {
  if (dev && qs.get('arena')) return [qs.get('arena')];
  const path = '/gms/2d/ragdojo/arena';
  if (location.hostname === 'games.br8t.com') return [location.origin + path];
  if (lan) return [location.origin + path, `${location.protocol}//${location.hostname}:8017${path}`];
  if (dev) return [`http://127.0.0.1:8017${path}`];
  return [];
}

export function mountArena(h) {
  const $ = (id) => document.getElementById(id);
  const btn = $('btnArena'), body = $('arenaBody');
  const lan = !!h.lan;
  let base = null, client = null, view = 'home', fight = null, offer = null, matchId = null;
  let lobby = [], friend = null, result = null, note = '', allowanceLine = '', oppAccepted = false, oppRematch = false;
  let wantRematch = false, myAccepted = false, pingT = 0;
  let tab = 'play', ghosts = null, ghostErr = '', ghostFight = null, ghostResult = null, uploadedFor = '';
  const boards = createBoards({
    base: () => base, token,
    types: () => MODES.filter((m) => m.live),
    paint: () => { if (tab === 'boards' && TABBED.has(view)) paint(); },
  });
  const TABBED = new Set(['home', 'msg', 'joining']);
  const tabsEl = document.createElement('div');
  tabsEl.className = 'tabs arenatabs';
  tabsEl.setAttribute('role', 'tablist');
  body?.before(tabsEl);

  const device = store.get(DEVICE_KEY) || (() => { const d = Math.random().toString(36).slice(2, 12); store.set(DEVICE_KEY, d); return d; })();
  let name = store.get(NAME_KEY) || '';

  async function token() {
    if (lan) return 'lan:' + device;
    if (h.dev && qs.get('arenauid')) return 'dev:' + qs.get('arenauid');
    const a = h.account()?.auth;
    if (!a?.user) return '';
    try { return (await a.getIdToken()) || ''; } catch { return ''; }
  }

  async function probe() {
    for (const b of arenaBase({ dev: h.dev, lan })) {
      if (await ArenaClient.probe(b)) { base = b; break; }
    }
    btn.classList.toggle('hidden', !base);
    if (base && qs.get('vs')) { open(); join(qs.get('vs')); }
    return !!base;
  }

  async function ensure() {
    if (client?.connected || client?.inMatch) return client;
    client = new ArenaClient(base);
    wire(client);
    // The server answers hello with `me` once it has checked the token; until then we are anonymous.
    const me = new Promise((res) => { const f = () => { client.off('me', f); res(); }; client.on('me', f); setTimeout(res, 6000); });
    await client.connect({ name, tok: await token(), loadout: loadoutOf(h.getSave()) });
    await me;
    return client;
  }

  function wire(c) {
    c.on('me', (m) => { if (!name) { name = m.name; } paint(); });
    c.on('err', (m) => {
      if (m.code === 'allowance') { note = `<span class="warn">${esc(m.msg)}</span> <button class="btn small" data-a="upgrade">SUPPORT / PASS</button>`; view = 'home'; }
      else { note = `<span class="warn">${esc(m.msg)}</span>`; if (view === 'lobby' || view === 'joining') view = 'home'; }
      paint();
    });
    c.on('lobby', (m) => { lobby = m.players || []; paint(); });
    c.on('friend', (m) => { friend = m; view = 'friend'; paint(); });
    c.on('offer', (m) => {
      offer = m; matchId = m.match; oppAccepted = myAccepted = false; view = 'offer'; open(); paint();
      if (m.friend) rememberFriends(m.peers || []);
      // Measure the real ping now, before anyone accepts. NetFight pings once the fight runs.
      clearInterval(pingT);
      pingT = setInterval(() => { if (view !== 'offer' || !client) { clearInterval(pingT); return; } client.pingLinks(performance.now(), 250); }, 250);
    });
    c.on('accepted', () => { oppAccepted = true; paint(); });
    c.on('rtt', () => { if (view === 'offer') paint(); });
    c.on('link', () => { if (view === 'offer') paint(); });
    c.on('go', (g) => startRound(g));
    c.on('result', (r) => {
      result = r; matchId = r.match; wantRematch = oppRematch = false;
      setTimeout(() => { stopFight(); view = 'result'; open(); paint(); refreshAllowance(); }, fight ? 600 : 0);
    });
    c.on('rematch', () => { oppRematch = true; paint(); });
    c.on('away', () => { if (fight) fight.awayNote = 'opponent disconnected — waiting for them…'; });
    c.on('back', () => { if (fight) fight.awayNote = ''; });
    c.on('reconnecting', (on) => { if (fight) fight.awayNote = on ? 'reconnecting…' : ''; });
    for (const ev of ['void', 'cancel', 'left']) {
      c.on(ev, (m) => {
        const why = { declined: 'They declined.', timeout: 'Timed out.', allowance: 'No free battles left today.', disagree: 'The two results did not match, so this one is void.', draws: 'Too many draws — void.' }[m.why] ||
          (ev === 'left' ? 'Your opponent left.' : 'The match ended.');
        msg(why);
      });
    }
    c.on('closed', () => msg('Lost the connection to the arena.'));
  }

  function msg(text) { stopFight(); offer = null; view = 'msg'; note = esc(text); open(); paint(); }

  function startRound(g) {
    if (fight) fight.destroy();
    void uploadGhost(g.match);
    matchId = g.match;
    fight = new NetFight({
      client, go: g, loadout: loadoutOf(h.getSave()), dev: h.dev || lan,
      onStall: () => {},
    });
    if (g.freeLeft >= 0) allowanceLine = `${g.freeLeft} free battle${g.freeLeft === 1 ? '' : 's'} left today`;
    h.overlay(null);
    h.startNetFight(fight);
  }

  function stopFight() {
    if (!fight) return;
    fight.destroy();
    fight = null;
    h.endNetFight();
  }

  async function refreshAllowance() {
    if (lan || h.dev) return;
    const a = h.account()?.auth;
    if (!a?.signedIn) { allowanceLine = ''; return; }
    try {
      const r = await fetch(PAY_API + 'allowance?game=ragdojo', { headers: { Authorization: `Bearer ${await a.getIdToken()}` }, cache: 'no-store' });
      if (!r.ok) return;
      const s = await r.json();
      allowanceLine = s.unlimited ? 'unlimited arena battles (br8t Pass)' : `${s.remaining} of ${s.perDay} free arena battles left today`;
      paint();
    } catch { /* not deployed yet: show nothing */ }
  }

  function open() { h.overlay('arena'); paint(); }

  async function find(type = 'duel') {
    note = '';
    await ensure();
    client.wait(type);
    client.lobby(true);
    view = 'lobby';
    paint();
  }
  async function makeFriend(type = 'duel') { note = ''; await ensure(); client.friend(type); }

  // ── ghosts ──────────────────────────────────────────────────────────────
  function friends() { try { return JSON.parse(store.get(FRIENDS_KEY) || '[]'); } catch { return []; } }
  function rememberFriends(peers) {
    const list = [...new Set([...peers.map((p) => p.name).filter(Boolean), ...friends()])].slice(0, 30);
    store.set(FRIENDS_KEY, JSON.stringify(list));
  }

  /** Every arena match leaves your ghost behind: your loadout and name, nothing else. */
  async function uploadGhost(match) {
    if (!base || uploadedFor === match) return;
    uploadedFor = match;
    const tok = await token();
    if (!tok) return;
    try {
      await fetch(base + '/ghost', {
        method: 'POST', cache: 'no-store',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: client?.me?.name || name, snap: ghostSnap(h.getSave()) }),
      });
    } catch { /* a missed upload just leaves the older ghost */ }
  }

  async function loadGhosts() {
    ghostErr = ''; ghosts = null; paint();
    try {
      const tok = await token();
      const r = await fetch(base + '/ghosts', { cache: 'no-store', headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (!r.ok) throw new Error(r.status);
      const all = (await r.json()).ghosts || [];
      const mine = ghostPower(ghostSave(ghostSnap(h.getSave())));
      ghosts = pickGhosts(all, mine, friends(), 8);
    } catch { ghostErr = 'The ghosts are out haunting somewhere else — try again in a bit.'; }
    if (tab === 'ghosts') paint();
  }

  function startGhost(g) {
    ghostResult = null;
    const m = new GhostMatch({
      ghost: g, save: h.getSave(), seed: (Math.random() * 1e6) | 0,
      onEnd: (result, mm) => {
        if (ghostFight !== mm || h.currentMatch() !== mm) return;   // quit from pause: nothing to report
        ghostFight = null;
        ghostResult = { g, result, dealt: Math.round(mm.damageDealt), taken: Math.round(mm.damageTaken), battle: ghostBattle(result, mm) };
        // For events marked "any battle" (js/events): src 'ghost', never ranked. Not wired yet.
        try { window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: ghostResult.battle })); } catch {}
        h.endNetFight();
        view = 'ghostResult';
        open();
      },
    });
    m.ghost = true;
    ghostFight = m;
    h.overlay(null);
    h.startNetFight({ match: m, sheetLevel: m.level });
    m.say('GHOST FIGHT', 1.8);
  }

  function ghostRows() {
    if (ghostErr) return `<p class="fine">${esc(ghostErr)}</p>`;
    if (!ghosts) return `<p class="fine">calling up the ghosts…</p>`;
    if (!ghosts.length) return `<p class="fine">No ghosts yet. Every arena match leaves the player's ghost behind — play one and yours will haunt someone else.</p>`;
    const tag = { friend: 'friend', near: 'about your level', stronger: 'stronger' };
    return `<div class="lobby ghosts">` + ghosts.map((g, i) =>
      `<div class="lrow"><span class="ghosttag">GHOST</span><span class="lname">${esc(g.name)}<small>${g.battles ? `${g.wins}–${g.losses}` : 'unranked'} · ${tag[g.why]}</small></span><button class="btn small" data-a="ghost" data-i="${i}">FIGHT</button></div>`).join('') + `</div>`;
  }
  async function join(code) { note = ''; try { await ensure(); client.join(code); view = 'joining'; paint(); } catch { msg('Could not reach the arena.'); } }

  function linkInfo() {
    const peer = offer?.peers?.[0];
    const l = peer && client?.link(peer.id);
    if (!l) return { ms: 0, direct: false, measured: false };
    return { ms: l.rtt, direct: l.direct, measured: l.rttN >= 2 };
  }

  function paintTabs() {
    const show = TABBED.has(view);
    tabsEl.classList.toggle('hidden', !show);
    if (show) tabsEl.innerHTML = TABS.map(([id, label]) => `<button class="tab${tab === id ? ' on' : ''}" data-tab="${id}" role="tab" aria-selected="${tab === id}">${label}</button>`).join('');
  }

  function paint() {
    if (!body) return;
    paintTabs();
    const me = client?.me;
    let html = '';
    if (TABBED.has(view) && tab === 'ghosts') {
      html += `<p class="fine">A ghost is an AI fighting with a real player's moves and skills. Practice only: never ranked, no ink, and it doesn't use a free battle.</p>`;
      html += ghostRows();
    } else if (TABBED.has(view) && tab === 'boards') {
      html += boards.html();
    } else if (view === 'ghostResult') {
      const R = ghostResult, won = R.result === 'win';
      html += `<h3 class="${won ? 'win' : 'lose'}">${won ? 'YOU WIN' : 'YOU LOSE'}</h3>
        <p class="vs">YOU <small>vs</small> <span class="ghosttag">GHOST</span> ${esc(R.g.name)}</p>
        <div class="rows">${[['Damage dealt', R.dealt], ['Damage taken', R.taken]].map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <p class="fine">Ghost fight — practice only. Not ranked, no ink, no free battle used.</p>
        <div class="vicbtns"><button class="btn big" data-a="ghostAgain">FIGHT AGAIN</button><button class="btn" data-a="ghostList">OTHER GHOSTS</button></div>`;
    } else if (view === 'home' || view === 'msg' || view === 'joining') {
      if (view === 'msg' || view === 'joining') html += `<p class="arenanote">${view === 'joining' ? 'Joining your friend…' : note}</p>`;
      html += `<div class="toggle"><span>Your name</span><input id="arenaName" maxlength="20" value="${esc(name)}" placeholder="type a name" autocomplete="off"></div>`;
      if (view !== 'msg' && note) html += `<p class="arenanote">${note}</p>`;
      if (allowanceLine) html += `<p class="fine">${esc(allowanceLine)}</p>`;
      const canLobby = lan || !me || me.lobby;
      for (const m of MODES) {
        if (!m.live) { html += `<div class="mode soon"><div><b>${m.name}</b><small>${m.desc}</small></div><span class="soonTag">coming soon</span></div>`; continue; }
        html += `<div class="mode"><div><b>${m.name}</b><small>${lan && m.lanDesc ? m.lanDesc : m.desc}</small></div>
          <button class="btn" data-a="find" data-mode="${m.id}"${canLobby ? '' : ' disabled'}>FIND A FIGHT</button>
          <button class="btn" data-a="friend" data-mode="${m.id}">FRIEND LINK</button></div>`;
      }
      if (!canLobby) html += `<p class="fine">Sign in (the account button) to fight strangers. Friend links work without an account.</p>`;
      html += `<div class="mode"><div><b><span class="ghosttag">GHOST</span> FIGHTS</b><small>a real player's ghost, any time — never ranked</small></div>
        <button class="btn" data-a="ghosts">SEE GHOSTS</button></div>`;
    } else if (view === 'lobby') {
      html += `<p class="fine">You are listed — anyone can challenge you. Or pick someone:</p>`;
      html += `<div class="lobby">` + (lobby.length ? lobby.map((p) =>
        `<div class="lrow">${barsHTML(p.est)}<span class="lname">${esc(p.name)}</span><button class="btn small" data-a="challenge" data-id="${esc(p.id)}">FIGHT</button></div>`).join('')
        : `<p class="fine">Nobody else is waiting yet…</p>`) + `</div>`;
      html += `<div class="vicbtns"><button class="btn" data-a="stop">STOP WAITING</button></div>`;
    } else if (view === 'friend') {
      const url = `${location.origin}${location.pathname}?vs=${friend.code}`;
      html += `<p>Send this to a friend. The fight starts when they open it.</p>
        <div class="code">${esc(friend.code)}</div><input id="arenaLink" readonly value="${esc(url)}">
        <div class="vicbtns"><button class="btn" data-a="copy">COPY LINK</button>${navigator.share ? '<button class="btn" data-a="share">SHARE</button>' : ''}<button class="btn" data-a="stop">CANCEL</button></div>
        <p class="fine">waiting for your friend…</p>`;
    } else if (view === 'offer') {
      const p = offer.peers[0] || {};
      const L = linkInfo();
      const est = lobby.find((x) => x.id === p.id)?.est || 0;
      const bars = L.measured ? barsHTML(L.ms, `${Math.round(L.ms)} ms${L.direct ? '' : ' · relay, slower connection'}`) : barsHTML(est, 'measuring the real ping…');
      html += `<p class="vs">YOU <small>vs</small> ${esc(p.name)}${offer.friend ? '' : ''}</p>
        <div class="ping" id="arenaPing">${bars}</div>
        <p class="fine">${offer.counted ? 'Counts for the leaderboards.' : 'Friendly — not ranked.'} Best of three.</p>
        <div class="vicbtns"><button class="btn big" data-a="accept"${myAccepted ? ' disabled' : ''}>${myAccepted ? 'ACCEPTED' : 'ACCEPT'}</button><button class="btn" data-a="decline">DECLINE</button></div>
        <p class="fine">${oppAccepted ? `${esc(p.name)} accepted ✓` : `waiting for ${esc(p.name)}…`}</p>`;
    } else if (view === 'result') {
      const won = result.winner === result.you;
      const sc = result.score || [];
      html += `<h3 class="${won ? 'win' : 'lose'}">${won ? 'YOU WIN' : 'YOU LOSE'} ${sc[result.you] ?? 0} – ${sc[(result.you + 1) % sc.length] ?? 0}</h3>`;
      if (result.forfeit) html += `<p class="fine">${won ? 'Your opponent left — a forfeit counts as their loss.' : 'You left the match — that counts as a forfeit.'}</p>`;
      const s = result.stats;
      if (s) html += `<div class="rows">${[['Arena wins', s.wins], ['Losses', s.losses], ['Win streak', `${s.streak} (best ${s.bestStreak})`], ['Knockouts', s.kos], ['Battles today', s.today]].map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
      else html += `<p class="fine">${lan ? '' : 'Not ranked — sign in to appear on the leaderboards.'}</p>`;
      if (allowanceLine) html += `<p class="fine">${esc(allowanceLine)}</p>`;
      html += `<div class="vicbtns"><button class="btn big" data-a="rematch"${wantRematch ? ' disabled' : ''}>${wantRematch ? 'WAITING…' : 'REMATCH'}</button><button class="btn" data-a="leave">DONE</button></div>`;
      if (oppRematch) html += `<p class="fine">They want a rematch!</p>`;
    }
    body.innerHTML = html;
    const nm = $('arenaName');
    if (nm) nm.onchange = () => {
      name = nm.value.trim().slice(0, 20);
      store.set(NAME_KEY, name);
      if (client?.connected) client.setName(name);
    };
  }

  function setTab(t) {
    tab = t;
    if (view === 'msg') view = 'home';
    paint();
    if (t === 'ghosts') loadGhosts();
    if (t === 'boards') boards.refresh();
  }
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    h.click();
    setTab(b.dataset.tab);
  });

  body?.addEventListener('click', async (e) => {
    const bb = e.target.closest('[data-b],[data-bt]');
    if (bb && boards.click(bb)) { h.click(); return; }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    h.click();
    const a = b.dataset.a;
    try {
      if (a === 'ghosts') { setTab('ghosts'); return; }
      if (a === 'ghost') { const g = ghosts?.[+b.dataset.i]; if (g) startGhost(g); return; }
      if (a === 'ghostAgain') { startGhost(ghostResult.g); return; }
      if (a === 'ghostList') { view = 'home'; setTab('ghosts'); return; }
      if (a === 'find') await find(b.dataset.mode);
      else if (a === 'friend') await makeFriend(b.dataset.mode);
      else if (a === 'challenge') { client.challenge(b.dataset.id); }
      else if (a === 'stop') { client?.unwait(); client?.leave(); client?.lobby(false); view = 'home'; paint(); }
      else if (a === 'copy') { try { await navigator.clipboard.writeText($('arenaLink').value); b.textContent = 'COPIED'; } catch { $('arenaLink').select(); } }
      else if (a === 'share') { navigator.share({ title: 'RAGDOJO', text: 'Fight me in RAGDOJO', url: $('arenaLink').value }).catch(() => {}); }
      else if (a === 'accept') { myAccepted = true; client.accept(matchId, await token()); paint(); }
      else if (a === 'decline') { client.decline(matchId); view = 'home'; paint(); }
      else if (a === 'rematch') { wantRematch = true; client.rematch(matchId); paint(); }
      else if (a === 'leave') { client.leave(); view = 'home'; paint(); }
      else if (a === 'upgrade') { h.openUpgrade(); }
    } catch { msg('Could not reach the arena.'); }
  });

  btn?.addEventListener('click', () => {
    h.click();
    if (view === 'msg' || view === 'ghostResult') view = 'home';
    open(); refreshAllowance();
    if (tab === 'ghosts') loadGhosts();
    if (tab === 'boards') boards.refresh();
  });
  $('btnArenaClose')?.addEventListener('click', () => {
    h.click();
    // Closing leaves whatever you were waiting in; a fight in progress is not closed from here.
    if (client && !fight && view !== 'result') { client.unwait(); if (view !== 'home') client.leave(); client.lobby(false); view = 'home'; }
    if (view === 'ghostResult') view = 'home';
    h.overlay(null);
  });

  return {
    probe,
    /** QUIT mid-fight: leaving is a forfeit, which is the point. */
    quit() { if (client) client.leave(); stopFight(); view = 'home'; },
    get fight() { return fight; },
    get client() { return client; },
    get ghostFight() { return ghostFight; },
    get lastGhost() { return ghostResult?.battle || null; },
    /** Switch the panel's tab ('play' | 'ghosts' | 'boards'). */
    tab: setTab,
  };
}

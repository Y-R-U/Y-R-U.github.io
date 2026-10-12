// The ARENA panel: who you are, the modes, the lobby, friend links, the connect screen with
// the real ping, and the result card. Hidden unless the arena server answers its probe.

import { ArenaClient } from './client.js';
import { NetFight, loadoutOf } from './fight.js';

const NAME_KEY = 'ragdojo.arena.name';
const DEVICE_KEY = 'ragdojo.arena.device';
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

  async function find() {
    note = '';
    await ensure();
    client.wait('duel');
    client.lobby(true);
    view = 'lobby';
    paint();
  }
  async function makeFriend() { note = ''; await ensure(); client.friend('duel'); }
  async function join(code) { note = ''; try { await ensure(); client.join(code); view = 'joining'; paint(); } catch { msg('Could not reach the arena.'); } }

  function linkInfo() {
    const peer = offer?.peers?.[0];
    const l = peer && client?.link(peer.id);
    if (!l) return { ms: 0, direct: false, measured: false };
    return { ms: l.rtt, direct: l.direct, measured: l.rttN >= 2 };
  }

  function paint() {
    if (!body) return;
    const me = client?.me;
    let html = '';
    if (view === 'home' || view === 'msg' || view === 'joining') {
      if (view === 'msg' || view === 'joining') html += `<p class="arenanote">${view === 'joining' ? 'Joining your friend…' : note}</p>`;
      html += `<div class="toggle"><span>Your name</span><input id="arenaName" maxlength="20" value="${esc(name)}" placeholder="type a name" autocomplete="off"></div>`;
      if (view !== 'msg' && note) html += `<p class="arenanote">${note}</p>`;
      if (allowanceLine) html += `<p class="fine">${esc(allowanceLine)}</p>`;
      const canLobby = lan || !me || me.lobby;
      html += `<div class="mode"><div><b>1v1 · BEST OF 3</b><small>${lan ? 'on your home network' : 'live, against a real person'}</small></div>
        <button class="btn" data-a="find"${canLobby ? '' : ' disabled'}>FIND A FIGHT</button>
        <button class="btn" data-a="friend">FRIEND LINK</button></div>`;
      if (!canLobby) html += `<p class="fine">Sign in (the account button) to fight strangers. Friend links work without an account.</p>`;
      for (const [t, d] of [['STEAL THE BANDANA', 'grab the golden bandana and hold it'], ['KING OF THE HILL', 'hold the ledge alone'],
        ['LAST MAN STANDING', 'up to 8 on one page'], ['GHOSTS', 'fight a real player’s ghost — never ranked']]) {
        html += `<div class="mode soon"><div><b>${t}</b><small>${d}</small></div><span class="soonTag">coming soon</span></div>`;
      }
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

  body?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    h.click();
    const a = b.dataset.a;
    try {
      if (a === 'find') await find();
      else if (a === 'friend') await makeFriend();
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

  btn?.addEventListener('click', () => { h.click(); if (view === 'msg') view = 'home'; open(); refreshAllowance(); });
  $('btnArenaClose')?.addEventListener('click', () => {
    h.click();
    // Closing leaves whatever you were waiting in; a fight in progress is not closed from here.
    if (client && !fight && view !== 'result') { client.unwait(); if (view !== 'home') client.leave(); client.lobby(false); view = 'home'; }
    h.overlay(null);
  });

  return {
    probe,
    /** QUIT mid-fight: leaving is a forfeit, which is the point. */
    quit() { if (client) client.leave(); stopFight(); view = 'home'; },
    get fight() { return fight; },
    get client() { return client; },
  };
}

// Online UI: the Online sheet (quick match / create / join by code), the room lobby, and the Online
// leaderboard tab. All in-game DOM, nothing blocks: every sheet closes with the X, the backdrop or Escape.
import { h, esc, hex, num, UI_ICON } from './kit.js';
import { ICON } from './hud.js';

export const GLOBE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

const STATUS = {
  idle: ['', 'Not connected'],
  connecting: ['wait', 'Connecting…'],
  reconnecting: ['wait', 'Reconnecting…'],
  online: ['ok', 'Online'],
  unavailable: ['bad', 'Online play is not available right now. Play still works: it is against the ladder.'],
  old: ['bad', 'THRONG was updated. Reload the page to play online.'],
  replaced: ['bad', 'You opened online play in another tab.'],
};

export function statusLine(net) {
  const [tone, text] = STATUS[net.status] || STATUS.idle;
  return `<div class="on-status" data-tone="${tone}"><i></i><span>${esc(text)}</span>${net.status === 'unavailable' ? '<button type="button" class="on-retry">Retry</button>' : ''}</div>`;
}

export function renderOnline(body, { app, close }) {
  const net = app.net;
  const code = net.pendingCode || '';
  body.innerHTML = `
    <div class="on-stat-wrap">${statusLine(net)}</div>
    <label class="name-field"><span>Your name</span>
      <input type="text" class="on-name" maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Your name" value="${esc(app.save.name)}"></label>
    <button type="button" class="btn btn-primary on-quick">QUICK MATCH</button>
    <p class="on-hint">Real players from anywhere. Bots fill the empty spots, and a quick match starts within about 8 s.</p>
    <div class="on-row">
      <button type="button" class="btn btn-ghost on-create">CREATE ROOM</button>
      <div class="on-join"><input type="text" class="on-code" maxlength="6" placeholder="CODE" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}"><button type="button" class="btn btn-ghost on-go">JOIN</button></div>
    </div>
    <p class="on-err hidden"></p>
    <p class="ld-note">Online matches are not rated on the ladder. Your best crowd and wins go on the Online leaderboard.</p>`;
  const $ = (s) => body.querySelector(s);
  const name = $('.on-name'), codeEl = $('.on-code'), err = $('.on-err');
  const commitName = () => { const v = name.value.trim().slice(0, 14); if (v !== app.save.name) { app.save.name = v; app.persist(); app.changed(); } };
  name.addEventListener('change', commitName);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.on-go').click(); });
  const busy = (on) => body.querySelectorAll('.btn').forEach((b) => { b.disabled = on; });
  const run = (p) => {
    commitName();
    err.classList.add('hidden');
    busy(true);
    app.audio.ui();
    p().then(() => close()).catch((e) => { busy(false); err.textContent = e.message || String(e); err.classList.remove('hidden'); });
  };
  $('.on-quick').addEventListener('click', () => run(() => net.quick()));
  $('.on-create').addEventListener('click', () => run(() => net.create()));
  $('.on-go').addEventListener('click', () => {
    const c = codeEl.value.trim();
    if (c.length < 5) { err.textContent = 'Type the 6-letter room code.'; err.classList.remove('hidden'); codeEl.focus(); return; }
    run(() => net.join(c));
  });
  const wire = () => { const r = body.querySelector('.on-retry'); if (r) r.addEventListener('click', () => net.connect(true)); };
  wire();
  net.sheetUpdate = () => { if (!body.isConnected) { net.sheetUpdate = null; return; } $('.on-stat-wrap').innerHTML = statusLine(net); wire(); };
  if (code && !app.save.name) requestAnimationFrame(() => name.focus());
  net.connect();
}

// The room lobby: who is in, who hosts, ready / start for private rooms, code + share link.
export function createRoomLobby({ root, app }) {
  const el = h(`<section class="screen olobby hidden">
    <div class="lb-card ol-card">
      <div class="ol-head"><span class="ol-ico">${GLOBE}</span><div><div class="ol-t"></div><div class="ol-sub"></div></div></div>
      <div class="ol-code hidden"><span>Room code</span><b></b>
        <div class="ol-share"><button type="button" class="btn btn-ghost ol-copy">Copy link</button><button type="button" class="btn btn-ghost ol-native hidden">Share</button></div>
        <input class="ol-link" readonly tabindex="-1"></div>
      <ol class="lby-list ol-list"></ol>
      <p class="on-err hidden"></p>
      <div class="ol-btns">
        <button type="button" class="btn btn-ghost ol-ready hidden">READY</button>
        <button type="button" class="btn btn-primary ol-start hidden">START</button>
        <button type="button" class="btn btn-ghost ol-leave">LEAVE</button>
      </div>
    </div>
  </section>`);
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  let room = null, got = 0, timer = 0, ready = false, lastList = '';
  const net = () => app.net;
  $('.ol-leave').addEventListener('click', () => { app.audio.ui(); net().leaveRoom(); });
  $('.ol-ready').addEventListener('click', () => { app.audio.ui(); ready = !ready; net().ready(ready); });
  $('.ol-start').addEventListener('click', () => {
    app.audio.ui();
    $('.ol-start').disabled = true;
    net().start().catch((e) => error(e.message)).finally(() => { $('.ol-start').disabled = false; });
  });
  const link = () => net().shareLink(room.code);
  $('.ol-copy').addEventListener('click', async () => {
    const b = $('.ol-copy');
    try { await navigator.clipboard.writeText(link()); }
    catch { const i = $('.ol-link'); i.value = link(); i.select(); try { document.execCommand('copy'); } catch {} }
    b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = 'Copy link'; }, 1600);
  });
  if (navigator.share) {
    $('.ol-native').classList.remove('hidden');
    $('.ol-native').addEventListener('click', () => {
      navigator.share({ title: 'THRONG', text: `Join my THRONG room: ${room.code}`, url: link() }).catch(() => {});
    });
  }

  function error(msg) { const e = $('.on-err'); e.textContent = msg || ''; e.classList.toggle('hidden', !msg); }

  function render() {
    if (!room) return;
    const you = net().you, me = room.members.find((m) => m.id === (you && you.id));
    const isHost = room.host === (you && you.id);
    const quick = room.quick;
    $('.ol-t').textContent = quick ? 'QUICK MATCH' : 'PRIVATE ROOM';
    let sub;
    if (room.state === 'playing') sub = me && me.crowd >= 0 ? 'Joining the match…' : 'A match is on. You are in the next one.';
    else if (quick) {
      const left = Math.max(0, Math.ceil((room.startAt - room.now - (performance.now() - got)) / 1000));
      sub = left > 0 ? `Starting in ${left} s… bots fill the empty spots` : 'Starting…';
    } else sub = isHost ? 'Share the code, then press Start. Bots fill the empty spots.' : 'Waiting for the host to start';
    $('.ol-sub').textContent = sub;
    $('.ol-code').classList.toggle('hidden', quick);
    $('.ol-code b').textContent = room.code;
    $('.ol-link').value = quick ? '' : link();
    const humans = room.members.length, bots = Math.max(0, (room.max || 8) - humans);
    const html = room.members.map((m, i) => `<li class="slot in${m.id === (you && you.id) ? ' me' : ''}${m.online ? '' : ' off'}" style="--c:${hex(TEAM[i % TEAM.length])}">
        <span class="sl-flag">${m.host ? ICON.crown : ''}</span>
        <span class="sl-name">${esc(m.name)}${m.id === (you && you.id) ? ' <small>(you)</small>' : ''}${m.online ? '' : ' <small>· reconnecting</small>'}</span>
        <span class="ol-tag">${m.host ? 'HOST' : quick ? '' : m.ready ? `${UI_ICON.check}` : ''}</span></li>`).join('')
      + (bots ? `<li class="slot ol-bots"><span class="sl-flag"></span><span class="sl-name">+${bots} bot${bots > 1 ? 's' : ''} fill the city</span></li>` : '');
    if (html !== lastList) { lastList = html; $('.ol-list').innerHTML = html; }
    $('.ol-ready').classList.toggle('hidden', quick || isHost || room.state !== 'lobby');
    ready = !!(me && me.ready);
    $('.ol-ready').classList.toggle('on', ready);
    $('.ol-ready').innerHTML = ready ? `${UI_ICON.check} READY` : 'READY';
    const nReady = room.members.filter((m) => m.ready && !m.host).length, others = room.members.length - 1;
    $('.ol-start').classList.toggle('hidden', quick || !isHost || room.state !== 'lobby');
    $('.ol-start').textContent = others ? `START (${nReady}/${others} ready)` : 'START WITH BOTS';
  }

  return {
    show(r) {
      room = r; got = performance.now(); error(''); lastList = '';
      render();
      el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('in');
      clearInterval(timer);
      timer = setInterval(render, 250);
    },
    update(r) { room = r; got = performance.now(); render(); },
    error,
    hide() { clearInterval(timer); el.classList.add('hidden'); el.classList.remove('in'); },
    get open() { return !el.classList.contains('hidden'); },
  };
}
const TEAM = [0x2f7bff, 0xff3a3a, 0xffbf1a, 0x9b4dff, 0x2fd14a, 0xff8320, 0xff58c0, 0x19d3e6];

// Ladder sheet, Online tab: daily / weekly / all-time boards from the server.
export function renderOnlineBoards(body, { app }) {
  const net = app.net;
  let period = net.boardPeriod || 'day', kind = net.boardKind || 'best';
  body.innerHTML = `
    <div class="seg-row"><div class="seg ob-p">${[['day', 'Today'], ['week', 'This week'], ['all', 'All time']].map(([k, l]) => `<button type="button" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="seg ob-k">${[['best', 'Best crowd'], ['wins', 'Wins']].map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join('')}</div></div>
    <ol class="ld-list ob-list"><li class="gap">Loading…</li></ol>
    <p class="ld-note">Real players only: the host's result, confirmed by another player in the match. Days and weeks start at 00:00 UTC.</p>`;
  const list = body.querySelector('.ob-list');
  async function load() {
    body.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === period));
    body.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
    net.boardPeriod = period; net.boardKind = kind;
    list.innerHTML = '<li class="gap">Loading…</li>';
    try {
      const d = await net.boards(period, kind);
      if (!body.isConnected) return;
      const mine = net.you && net.you.pid;
      const rows = d.rows.map((r) => `<li class="${r.pid === mine ? 'me' : ''}"><span class="ld-rk">${num(r.rank)}</span><span class="ld-n">${esc(r.name)}</span><span class="ld-r">${num(r.value)}</span></li>`);
      if (d.me && !d.rows.some((r) => r.pid === mine)) rows.push(`<li class="gap">⋯</li><li class="me"><span class="ld-rk">${num(d.me.rank)}</span><span class="ld-n">${esc(app.save.name || 'You')}</span><span class="ld-r">${num(d.me.value)}</span></li>`);
      list.innerHTML = rows.join('') || `<li class="gap">No ${kind === 'wins' ? 'wins' : 'results'} yet ${period === 'day' ? 'today' : period === 'week' ? 'this week' : ''}. Be the first.</li>`;
    } catch (e) {
      if (body.isConnected) list.innerHTML = '<li class="gap">The online leaderboard is not reachable right now.</li>';
    }
  }
  body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { period = b.dataset.p; app.audio.ui(); load(); }));
  body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; app.audio.ui(); load(); }));
  load();
}

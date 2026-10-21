// Online lobby screen: create / join by code / quick join / public list, room options (host), player list
// with titles, voices and callsigns, the voice picker (first to pick gets it), ready and start.
// Self-contained: mounts its own root and injects its CSS; reuses the menu's kz-btn/kz-seg look from ui.css.
import { el, esc, onTap, injectCss, ICON } from '../ui/dom.js';
import { VOICES } from '../ui/voices.js';
import { TYPE_IDS, ROOM_TYPES, HOST_OPTIONS, defaultsFor, normalise, fixedKeys, summary, canDecree, canRanked } from './options.js';
import { helloFromProfile } from './index.js';

const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
export const spokenCall = (n) => `${DIGITS[Math.floor(n / 10)]}-${DIGITS[n % 10]}`;
const voiceName = (id) => VOICES.find((v) => v.id === id)?.name || id;

export function createLobby({ net, profile = () => ({}), onStart, onClose, parent = document.body } = {}) {
  injectCss();
  injectLobbyCss();
  const node = el(`<section class="kzn" aria-label="Online lobby">
    <header class="kzn-top">
      <button class="kzn-back" data-a="back" aria-label="Back">${ICON.close}</button>
      <h1><small>The Kingdom of Krayzee</small>Online Court</h1>
      <span class="kzn-pill" data-s="conn">Connecting…</span>
    </header>
    <div class="kzn-msg" role="status" aria-live="polite"></div>
    <div class="kzn-body"></div>
  </section>`);
  parent.append(node);
  const body = node.querySelector('.kzn-body');
  const msgEl = node.querySelector('.kzn-msg');
  const pill = node.querySelector('[data-s="conn"]');
  let view = 'home', editing = null, rooms = [], started = false, msgTimer = 0;
  const offs = [];

  const say = (text, ms = 3200) => {
    msgEl.textContent = text;
    msgEl.classList.toggle('on', !!text);
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => msgEl.classList.remove('on'), ms);
  };
  const myRank = () => helloFromProfile(profile()).rank;

  function go(v) { view = v; render(); }

  function render() {
    node.dataset.view = view;
    if (view === 'home') renderHome();
    else if (view === 'create') renderCreate();
    else renderRoom();
  }

  // ------------------------------------------------------------------ home
  function renderHome() {
    body.innerHTML = `<div class="kzn-col">
      <button class="kz-btn primary" data-a="quick">Quick join <small>busiest court nearby</small></button>
      <div class="kzn-row">
        <button class="kz-btn" data-a="create">${ICON.crown}Create a room</button>
      </div>
      <div class="kzn-card">
        <label class="kzn-lbl" for="kzn-code">Join with a code</label>
        <div class="kz-input"><input id="kzn-code" class="mono" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234">
          <button class="kz-btn" data-a="join">Join</button></div>
      </div>
      <div class="kzn-card">
        <div class="kzn-lbl">Public rooms <button class="kzn-link" data-a="refresh">Refresh</button></div>
        <ul class="kzn-list" data-s="rooms"></ul>
      </div>
    </div>`;
    const code = body.querySelector('#kzn-code');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode(); });
    const joinCode = () => { const c = code.value.trim(); if (c.length !== 6) { code.classList.add('bad'); say('Room codes have 6 letters and numbers.'); return; } code.classList.remove('bad'); net.join(c); };
    bind({ quick: () => net.quick(), create: () => { editing = normalise(defaultsFor('court'), myRank()); go('create'); }, join: joinCode, refresh: () => net.list() });
    renderRooms();
  }

  function renderRooms() {
    const ul = body.querySelector('[data-s="rooms"]');
    if (!ul) return;
    if (!rooms.length) { ul.innerHTML = '<li class="kzn-empty">No public rooms right now. Create one, or Quick join to open one.</li>'; return; }
    ul.innerHTML = rooms.map((r) => {
      const s = summary(r.set);
      const meta = r.meta?.crown ? `♛ ${esc(r.meta.crown)}${r.meta.left ? `, ${Math.floor(r.meta.left / 60)}:${String(r.meta.left % 60).padStart(2, '0')} left` : ''}` : (r.phase === 'flight' ? 'In flight' : 'In the lobby');
      return `<li><button class="kzn-room" data-room="${esc(r.id)}" ${r.open ? '' : 'disabled'}>
        <span class="kzn-room-name">${esc(r.name)}</span><span class="kzn-room-n">${r.n}/${r.max}</span>
        <span class="kzn-room-sub">${esc(s.name)} · ${esc(s.parts.slice(0, 2).join(' · '))}</span><span class="kzn-room-meta">${meta}</span></button></li>`;
    }).join('');
    ul.querySelectorAll('[data-room]').forEach((b) => onTap(b, () => net.join({ id: b.dataset.room })));
  }

  // ------------------------------------------------------------------ create / edit options
  function renderCreate() {
    const inRoom = !!net.room, s = editing, fixed = fixedKeys(s.type), H = HOST_OPTIONS;
    const seg = (key, opts, label, fmt = (x) => x) => fixed.includes(key) ? `<div class="kzn-opt"><span class="kzn-lbl">${label}</span><span class="kzn-fixed">${esc(fmt(s[key]))} <em>set by the room type</em></span></div>`
      : `<div class="kzn-opt"><span class="kzn-lbl">${label}</span><div class="kz-seg wide" data-k="${key}">${opts.map((o) => `<button data-v="${esc(String(o))}" aria-pressed="${String(s[key]) === String(o)}">${esc(fmt(o))}</button>`).join('')}</div></div>`;
    body.innerHTML = `<div class="kzn-col wide">
      ${inRoom ? '' : `<div class="kzn-card"><label class="kzn-lbl" for="kzn-name">Room name</label><div class="kz-input"><input id="kzn-name" maxlength="${H.roomName.maxLen}" placeholder="${esc((profile().name || 'Pilot') + "'s court")}"></div>
        <div class="kzn-opt"><span class="kzn-lbl">Who can join</span><div class="kz-seg wide" data-k="_priv"><button data-v="0" aria-pressed="true">Public</button><button data-v="1" aria-pressed="false">Private (code only)</button></div></div></div>`}
      <div class="kzn-types">${TYPE_IDS.map((id) => `<button class="kzn-type" data-type="${id}" aria-pressed="${s.type === id}"><b>${esc(ROOM_TYPES[id].name)}</b><span>${esc(ROOM_TYPES[id].blurb)}</span></button>`).join('')}</div>
      <div class="kzn-card">
        ${seg('protection', H.protection, 'Protection', (x) => ({ rubber: 'impossiRubber', partial: 'Partial', realistic: 'Realistic' }[x] || x))}
        ${s.protection === 'partial' ? seg('partialStart', H.partialStartPct, 'Partial starts at', (x) => `${x}%`) : ''}
        ${seg('traffic', H.traffic, 'AI traffic')}
        ${s.type === 'coronation' ? seg('target', H.target, 'Target', (x) => Number(x).toLocaleString('en')) : s.type === 'joust' ? '' : seg('minutes', H.minutes, 'Time limit', (x) => (Number(x) ? `${x} min` : 'None'))}
        ${s.type === 'joust' ? '' : seg('maxPlayers', [2, 3, 4, 5, 6, 7, 8], 'Players')}
        ${seg('runway', H.runway, 'Runway', (x) => (x === 'wind' ? 'Wind' : x))}
        ${seg('outrageGain', H.outrageGain, 'Tower outrage', (x) => `×${x}`)}
        ${seg('voices', H.voices, 'Voices', (x) => (x === 'first_come' ? 'First to pick' : 'Duplicates OK'))}
        ${canRanked(myRank()) ? seg('ranked', [false, true], 'Ranked', (x) => (String(x) === 'true' ? 'Ranked' : 'Casual')) : ''}
        ${canDecree(myRank()) ? `<div class="kzn-opt"><span class="kzn-lbl">Royal Decrees</span><div class="kzn-decrees">${Object.entries(H.decrees).map(([id, t]) => `<button class="kzn-chip" data-decree="${id}" aria-pressed="${s.decrees.includes(id)}" title="${esc(t)}">${esc(id.replace(/_/g, ' '))}</button>`).join('')}</div></div>` : ''}
      </div>
      <div class="kzn-foot"><button class="kz-btn ghost" data-a="cancel">Cancel</button><button class="kz-btn primary" data-a="ok">${inRoom ? 'Save options' : 'Create room'}</button></div>
    </div>`;
    let priv = false;
    body.querySelectorAll('.kz-seg[data-k]').forEach((g) => g.querySelectorAll('button').forEach((b) => onTap(b, () => {
      const k = g.dataset.k, raw = b.dataset.v;
      if (k === '_priv') { priv = raw === '1'; g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); return; }
      const v = raw === 'true' ? true : raw === 'false' ? false : /^-?[\d.]+$/.test(raw) ? Number(raw) : raw;
      editing = normalise({ ...editing, [k]: v }, myRank());
      const keep = priv;
      renderCreate();
      if (keep) body.querySelector('[data-k="_priv"] [data-v="1"]')?.click();
    }, 'tick')));
    body.querySelectorAll('[data-type]').forEach((b) => onTap(b, () => { editing = normalise(defaultsFor(b.dataset.type), myRank()); renderCreate(); }, 'tick'));
    body.querySelectorAll('[data-decree]').forEach((b) => onTap(b, () => {
      const id = b.dataset.decree, d = new Set(editing.decrees);
      d.has(id) ? d.delete(id) : d.add(id);
      editing = normalise({ ...editing, decrees: [...d] }, myRank());
      b.setAttribute('aria-pressed', d.has(id));
    }, 'tick'));
    bind({
      cancel: () => go(net.room ? 'room' : 'home'),
      ok: () => {
        if (net.room) { net.setOptions(editing); go('room'); return; }
        net.create({ name: body.querySelector('#kzn-name')?.value || '', priv, set: editing });
      },
    });
  }

  // ------------------------------------------------------------------ room
  function renderRoom() {
    const r = net.room;
    if (!r) { go('home'); return; }
    const me = net.me, host = net.isHost, s = summary(r.set);
    const others = r.members.filter((m) => m.id !== net.id && !m.away);
    const need = Math.floor((r.members.length - 1) / 2) + 1;
    const airborne = r.phase === 'flight';
    body.innerHTML = `<div class="kzn-col wide">
      <div class="kzn-card kzn-roomhead">
        <div><div class="kzn-roomname">${esc(r.name)}</div><div class="kzn-roomsub">${esc(s.name)} · ${esc(s.parts.join(' · '))}${r.set.decrees?.length ? ` · ${esc(r.set.decrees.length)} decree${r.set.decrees.length > 1 ? 's' : ''}` : ''}</div></div>
        <div class="kzn-code"><span class="kzn-lbl">${r.priv ? 'Private code' : 'Room code'}</span><b data-s="code">${esc(r.code || '')}</b><button class="kzn-link" data-a="share">Copy link</button></div>
      </div>
      <div class="kzn-split">
        <div class="kzn-card">
          <div class="kzn-lbl">Pilots <span>${r.members.length}/${r.max}</span></div>
          <ul class="kzn-players">${r.members.map((m) => {
            const isHost = m.id === r.host, isMe = m.id === net.id;
            const canKick = !isMe && (r.priv ? r.owner === net.id : true);
            return `<li data-id="${esc(m.id)}" class="${isMe ? 'me' : ''} ${m.away ? 'away' : ''}">
              <span class="kzn-crown" title="${isHost ? 'Host' : ''}">${isHost ? ICON.crown : ''}</span>
              <span class="kzn-pl"><b><i>${esc(m.title || '')}</i> ${esc(m.name)}</b><small>${esc(voiceName(m.voice))} · ${esc(spokenCall(m.call))}${m.away ? ' · reconnecting' : ''}${isHost ? ' · host' : ''}</small></span>
              <span class="kzn-rdy" data-s="rdy">${m.rdy ? 'READY' : ''}</span>
              ${canKick ? `<button class="kzn-link kzn-kick" data-kick="${esc(m.id)}">${r.priv ? 'Remove' : `Vote out${m.kv ? ` ${m.kv}/${need}` : ''}`}</button>` : ''}
            </li>`;
          }).join('')}</ul>
        </div>
        <div class="kzn-card">
          <div class="kzn-lbl">Your radio voice <span>${r.set.voices === 'duplicates_allowed' ? 'duplicates allowed' : 'first to pick gets it'}</span></div>
          ${airborne ? '<p class="kzn-note">Voices change only in the lobby or while parked.</p>' : ''}
          <div class="kzn-voices">${VOICES.map((v) => {
            const holder = r.set.voices === 'duplicates_allowed' ? null : r.members.find((m) => m.voice === v.id && m.id !== net.id);
            const mine = me?.voice === v.id;
            return `<button class="kzn-voice" data-v="${v.id}" aria-pressed="${mine}" ${holder ? 'data-taken="1"' : ''} ${(holder || airborne) && !mine ? 'disabled' : ''}>
              <b>${esc(v.name)}</b><small>${holder ? `Taken by ${esc(holder.name)}` : mine ? 'Yours' : 'Free'}</small></button>`;
          }).join('')}</div>
        </div>
      </div>
      <div class="kzn-foot">
        <button class="kz-btn ghost" data-a="leave">Leave</button>
        ${host && !airborne ? '<button class="kz-btn" data-a="options">Options</button>' : ''}
        ${airborne ? '<button class="kz-btn primary" data-a="fly">Fly</button>'
          : host ? `<button class="kz-btn primary" data-a="start" ${others.length ? '' : 'data-solo="1"'}>Start${others.length ? '' : ' alone'}</button>`
            : `<button class="kz-btn primary" data-a="ready" aria-pressed="${!!me?.rdy}">${me?.rdy ? 'Ready ✓' : 'Ready'}</button>`}
      </div>
    </div>`;
    body.querySelectorAll('[data-v]').forEach((b) => onTap(b, () => { if (!b.disabled && b.getAttribute('aria-pressed') !== 'true') net.claim(b.dataset.v); }, 'tick'));
    body.querySelectorAll('[data-kick]').forEach((b) => onTap(b, () => { r.priv ? net.kick(b.dataset.kick) : net.vote(b.dataset.kick); say(r.priv ? 'Removed.' : 'Vote counted.'); }));
    bind({
      leave: () => { net.leave(); go('home'); net.list(); },
      options: () => { editing = normalise(r.set, myRank()); go('create'); },
      start: () => net.setPhase('flight'),
      ready: () => net.ready(!me?.rdy),
      fly: () => startNow(),
      share: () => {
        const url = `${location.origin}${location.pathname.replace(/tools\/net\/[^/]*$/, '')}?room=${r.code}`;
        navigator.clipboard?.writeText(url).then(() => say('Link copied.'), () => say(url, 8000));
      },
    });
  }

  function startNow() {
    if (started || !net.room) return;
    started = true;
    onStart?.(net.room);
  }

  function bind(map) {
    body.querySelectorAll('[data-a]').forEach((b) => { if (map[b.dataset.a]) onTap(b, () => map[b.dataset.a](b)); });
  }

  // ------------------------------------------------------------------ net events
  const setPill = () => {
    const sum = net.linkSummary?.();
    const txt = !net.connected ? (net.net.reconnect ? 'Reconnecting…' : 'Offline') : !net.room ? 'Connected' : sum?.alone ? 'Alone in the room' : sum ? `${sum.relayed ? 'Relayed' : 'Direct'} · ${sum.rtt || '–'} ms` : 'Connected';
    pill.textContent = txt;
    pill.dataset.state = !net.connected ? 'off' : sum && sum.relayed ? 'relay' : 'ok';
  };
  offs.push(
    net.on('connected', () => { setPill(); if (!net.room) net.list(); }),
    net.on('rooms', (m) => { rooms = m.rooms || []; if (view === 'home') renderRooms(); }),
    net.on('joined', (r) => { started = false; go('room'); if (r.phase === 'flight') startNow(); }),
    net.on('room', () => { if (view === 'room') renderRoom(); setPill(); }),
    net.on('phase', (p) => { if (p === 'flight') startNow(); else started = false; }),
    net.on('host', (h) => { if (h.me) say('You are now the host: the sky runs on your device.'); }),
    net.on('claim', (m) => { if (!m.ok) say(m.why === 'airborne' ? 'Land and park first to change voice.' : `${voiceName(m.voice)} is taken${m.byName ? ` by ${m.byName}` : ''}.`); }),
    net.on('error', (m) => say(m.msg || 'Something went wrong.')),
    net.on('kicked', (m) => { say(m.msg || 'You left the room.', 5000); go('home'); }),
    net.on('left', () => { if (view === 'room') go('home'); }),
    net.on('link', setPill),
    net.on('reconnecting', setPill),
    net.on('disconnected', () => { setPill(); say('Lost the room server. Check your connection.'); }),
  );
  onTap(node.querySelector('[data-a="back"]'), () => {
    if (view === 'create') { go(net.room ? 'room' : 'home'); return; }
    onClose?.();
  }, 'back');
  const pillTimer = setInterval(setPill, 1000);

  render();
  net.connect().then(() => { setPill(); const code = new URLSearchParams(location.search).get('room'); if (code && !net.room) net.join(code); })
    .catch(() => { setPill(); say('Could not reach the room server.'); });

  return {
    node,
    show(on) { node.classList.toggle('on', on); if (on) render(); },
    get view() { return view; },
    destroy() { clearInterval(pillTimer); offs.forEach((f) => f()); node.remove(); },
  };
}

function injectLobbyCss() {
  if (document.getElementById('kzn-css')) return;
  const st = document.createElement('style');
  st.id = 'kzn-css';
  st.textContent = `
.kzn { position: fixed; inset: 0; z-index: 40; display: none; flex-direction: column; overflow: hidden; color: var(--kz-ink, #fbf6ea);
  font-family: var(--kz-sans, system-ui, sans-serif); -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent;
  padding: calc(10px + var(--kz-st, 0px)) calc(16px + var(--kz-sr, 0px)) calc(12px + var(--kz-sb, 0px)) calc(16px + var(--kz-sl, 0px));
  background: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(226, 176, 74, .16), transparent 70%), linear-gradient(180deg, #0a1230 0%, #111d47 55%, #1a1840 100%); }
.kzn.on { display: flex; }
.kzn *, .kzn *::before, .kzn *::after { box-sizing: border-box; }
.kzn button { font-family: inherit; color: inherit; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.kzn-top { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; flex: none; }
.kzn-top h1 { margin: 0; flex: 1; font: italic 400 clamp(26px, 7vw, 36px)/1 var(--kz-serif, Georgia, serif); color: var(--kz-gold2, #f7dc8f); }
.kzn-top h1 small { display: block; font: 600 10px/1.4 var(--kz-sans, sans-serif); font-style: normal; letter-spacing: .24em; text-transform: uppercase; color: var(--kz-dim, #cbc2ad); white-space: nowrap; }
@media (max-width: 420px) { .kzn-top h1 small { letter-spacing: .12em; font-size: 9px; } }
.kzn-back { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid var(--kz-line, rgba(247,220,143,.26)); background: rgba(255,255,255,.05); cursor: pointer; display: grid; place-items: center; }
.kzn-back svg { width: 18px; height: 18px; }
.kzn-pill { flex: none; padding: 5px 10px; border-radius: 20px; font: 600 10.5px/1.2 var(--kz-sans, sans-serif); letter-spacing: .08em; text-transform: uppercase;
  background: rgba(255,255,255,.08); border: 1px solid var(--kz-line2, rgba(255,255,255,.1)); white-space: nowrap; }
.kzn-pill[data-state="ok"] { color: #a6f0b8; border-color: rgba(120, 220, 150, .35); }
.kzn-pill[data-state="relay"] { color: #ffd88a; border-color: rgba(255, 200, 100, .4); }
.kzn-pill[data-state="off"] { color: #ffb3bf; }
.kzn-msg { min-height: 0; max-height: 0; overflow: hidden; transition: max-height .25s, padding .25s; border-radius: 10px; background: rgba(200, 36, 63, .2);
  font: 500 13.5px/1.35 var(--kz-sans, sans-serif); padding: 0 12px; flex: none; }
.kzn-msg.on { max-height: 80px; padding: 8px 12px; margin-bottom: 8px; }
.kzn-body { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
.kzn-col { max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.kzn-col.wide { max-width: 980px; }
.kzn-row { display: flex; gap: 10px; } .kzn-row > * { flex: 1; }
.kzn-card { border-radius: 16px; border: 1px solid var(--kz-line, rgba(247,220,143,.26)); background: var(--kz-glass, rgba(11,17,40,.74)); padding: 12px; min-width: 0; }
.kzn-lbl { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 600 11px/1.3 var(--kz-sans, sans-serif); letter-spacing: .16em;
  text-transform: uppercase; color: var(--kz-dim, #cbc2ad); margin-bottom: 8px; }
.kzn-lbl span { letter-spacing: .04em; color: var(--kz-faint, #978f7d); text-transform: none; font-weight: 500; }
.kzn-link { border: 0; background: none; padding: 6px 4px; cursor: pointer; font: 600 11px var(--kz-sans, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: var(--kz-gold2, #f7dc8f); min-height: 36px; }
.kzn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.kzn-empty { color: var(--kz-faint, #978f7d); font: italic 15px/1.35 var(--kz-serif, Georgia, serif); padding: 4px 2px; }
.kzn-room { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; text-align: left; padding: 10px 12px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--kz-line2, rgba(255,255,255,.1)); background: rgba(0,0,0,.25); min-height: 56px; }
.kzn-room:disabled { opacity: .45; cursor: default; }
.kzn-room-name { font: 400 19px/1.1 var(--kz-serif, Georgia, serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kzn-room-n { font: 700 13px var(--kz-sans, sans-serif); color: var(--kz-gold2, #f7dc8f); }
.kzn-room-sub, .kzn-room-meta { font: 12px/1.3 var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); }
.kzn-room-meta { text-align: right; color: var(--kz-gold2, #f7dc8f); }
.kzn-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.kzn-type { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 10px 12px; border-radius: 14px; cursor: pointer; min-height: 72px;
  border: 1px solid var(--kz-line2, rgba(255,255,255,.1)); background: rgba(0,0,0,.25); }
.kzn-type b { font: italic 400 19px/1.05 var(--kz-serif, Georgia, serif); }
.kzn-type span { font: 12px/1.3 var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); }
.kzn-type[aria-pressed="true"] { border-color: var(--kz-gold, #e2b04a); background: linear-gradient(180deg, rgba(226,176,74,.2), rgba(226,176,74,.05)); }
.kzn-opt { margin-bottom: 10px; } .kzn-opt:last-child { margin-bottom: 0; }
.kzn-opt .kz-seg { flex-wrap: wrap; } .kzn-opt .kz-seg button { min-width: 0; flex: 1 1 auto; font: 600 12px var(--kz-sans, sans-serif); }
.kzn-fixed { font: italic 16px var(--kz-serif, Georgia, serif); } .kzn-fixed em { font: 11px var(--kz-sans, sans-serif); color: var(--kz-faint, #978f7d); margin-left: 6px; }
.kzn-decrees { display: flex; flex-wrap: wrap; gap: 6px; }
.kzn-chip { min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--kz-line, rgba(247,220,143,.26)); background: rgba(0,0,0,.25); cursor: pointer; font: 600 12px var(--kz-sans, sans-serif); text-transform: capitalize; }
.kzn-chip[aria-pressed="true"] { background: linear-gradient(180deg, #f7dc8f, #d6a33d); color: #2a1a02; }
.kzn-foot { display: flex; gap: 10px; position: sticky; bottom: -8px; padding: 18px 0 8px; margin-top: -8px; background: linear-gradient(180deg, rgba(19, 27, 66, 0), #141b45 45%); }
.kzn .kz-btn:not(.primary):not(.ghost) { background-color: var(--kz-glass, rgba(11, 17, 40, .74)); }
.kzn-foot .kz-btn { flex: 1; } .kzn-foot .kz-btn.primary { flex: 2; }
.kzn-roomhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.kzn-roomname { font: 400 26px/1.05 var(--kz-serif, Georgia, serif); }
.kzn-roomsub { font: 12.5px/1.4 var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); text-transform: capitalize; }
.kzn-code { text-align: right; } .kzn-code .kzn-lbl { justify-content: flex-end; margin-bottom: 2px; }
.kzn-code b { display: block; font: 700 26px/1 ui-monospace, Menlo, monospace; letter-spacing: .14em; color: var(--kz-gold2, #f7dc8f); }
.kzn-split { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 760px) { .kzn-split { grid-template-columns: minmax(280px, 1fr) 1.3fr; } }
.kzn-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.kzn-players li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: rgba(0,0,0,.25); border: 1px solid transparent; min-height: 52px; }
.kzn-players li.me { border-color: var(--kz-line, rgba(247,220,143,.26)); }
.kzn-players li.away { opacity: .55; }
.kzn-crown { width: 20px; flex: none; color: var(--kz-gold2, #f7dc8f); } .kzn-crown svg { width: 20px; height: 20px; display: block; }
.kzn-pl { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.kzn-pl b { font: 400 19px/1.1 var(--kz-serif, Georgia, serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kzn-pl b i { color: var(--kz-gold2, #f7dc8f); }
.kzn-pl small { font: 12px/1.3 var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); }
.kzn-rdy { font: 700 10px var(--kz-sans, sans-serif); letter-spacing: .14em; color: #a6f0b8; }
.kzn-kick { color: #ffb3bf; font-size: 10px; }
.kzn-note { margin: 0 0 8px; font: italic 14px var(--kz-serif, Georgia, serif); color: var(--kz-dim, #cbc2ad); }
.kzn-voices { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
.kzn-voice { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 8px 10px; border-radius: 12px; cursor: pointer; min-height: 52px;
  border: 1px solid var(--kz-line2, rgba(255,255,255,.1)); background: rgba(0,0,0,.25); }
.kzn-voice b { font: italic 400 17px/1.1 var(--kz-serif, Georgia, serif); }
.kzn-voice small { font: 11.5px var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kzn-voice[aria-pressed="true"] { border-color: var(--kz-gold, #e2b04a); background: linear-gradient(180deg, rgba(226,176,74,.22), rgba(226,176,74,.06)); }
.kzn-voice[data-taken] { opacity: .42; filter: grayscale(.8); }
.kzn-voice:disabled { cursor: default; }
@media (orientation: landscape) and (max-height: 520px) {
  .kzn-top h1 { font-size: 24px; } .kzn-top h1 small { display: none; }
  .kzn-roomname { font-size: 21px; } .kzn-code b { font-size: 21px; }
}`;
  document.head.append(st);
}

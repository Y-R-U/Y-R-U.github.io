// Online lobby screen: create / join by code / quick join / public list, room options (host), player list
// with titles, voices and callsigns, the voice picker (first to pick gets it), ready and start.
// Self-contained: mounts its own root and injects its CSS; reuses the menu's kz-btn/kz-seg look from ui.css.
import { el, esc, onTap, injectCss, ICON } from '../ui/dom.js';
import { VOICES } from '../ui/voices.js';
import { TYPE_IDS, ROOM_TYPES, HOST_OPTIONS, defaultsFor, normalise, fixedKeys, summary, canDecree, canRanked } from './options.js';
import { helloFromProfile, accountToken } from './index.js';
import { access } from '../game/access.js';
import { ACCESS } from '../../data/access.js';
import { passCard, ensurePassCss } from '../ui/pass.js';
import { openAccountPanel } from '../ui/account.js';

const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
export const spokenCall = (n) => `${DIGITS[Math.floor(n / 10)]}-${DIGITS[n % 10]}`;
const voiceName = (id) => VOICES.find((v) => v.id === id)?.name || id;
const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 38 L2 10 L18 22 L32 4 L46 22 L62 10 L58 38 Z" fill="currentColor"/><circle cx="2" cy="10" r="3" fill="currentColor"/><circle cx="32" cy="4" r="3.4" fill="currentColor"/><circle cx="62" cy="10" r="3" fill="currentColor"/></svg>';
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LIST_MS = 10000, QUICK_MS = 8000;

// Public list meta line (§7): "Baroness Dirk · 4:12 left" behind a crown, counted down from when the list arrived.
export function roomMeta(r, ageS = 0) {
  if (!r.open) return { text: r.phase === 'flight' && r.set?.type === 'joust' ? 'Joust under way' : r.n >= r.max ? 'Full' : 'Closed to you', crown: false };
  const left = r.meta?.left ? Math.max(0, r.meta.left - ageS) : 0;
  if (r.phase === 'flight' && r.meta?.crown) return { text: `${r.meta.crown}${left ? ` · ${clock(left)} left` : ''}`, crown: true };
  if (r.phase === 'flight') return { text: left ? `In flight · ${clock(left)} left` : 'In flight · join mid-session', crown: false };
  if (r.phase === 'podium') return { text: 'Crowning the winner', crown: false };
  return { text: 'In the lobby · join now', crown: false };
}

export function createLobby({ net, profile = () => ({}), onStart, onClose, parent = document.body } = {}) {
  injectCss();
  injectLobbyCss();
  ensurePassCss();
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
  let view = 'home', editing = null, rooms = [], roomsAt = 0, stats = null, started = false, msgTimer = 0, quickT = 0, sheet = null;
  const myVotes = new Set();
  const offs = [];
  // ACCESS (D36, docs/ACCESS.md): sign-in to host/join, the free daily online games, the br8t Pass card
  const A = access();
  let tokOk = null, gate = null, gateCard = null, lastEntry = null, signinRetry = false;
  const needSignIn = () => !!net.net?.access?.signin && tokOk === false;
  const counting = () => !!net.net?.access?.counting;
  async function checkTok() { const was = tokOk; tokOk = !!(await accountToken()); if (was !== tokOk && view === 'home') renderHome(); return tokOk; }
  function entry(fn) {
    if (needSignIn()) { gate = 'signin'; renderHome(); return; }
    lastEntry = fn; signinRetry = false; fn();
  }
  function allowText() {
    const a = A.allowanceState;
    if (!counting()) return A.enforcing || A.live ? '' : 'br8t Pass coming soon. Online is free for now.';
    if (a?.unlimited || A.pass) return 'Unlimited online games with your br8t Pass.';
    if (a && a.remaining >= 0) return `<b>${a.remaining} of ${a.perDay}</b> free online games left today`;
    return `${ACCESS.onlinePerDay} free online games a day. Each new room you join uses one.`;
  }
  function paintGate() {
    const slot = body.querySelector('[data-s="gate"]');
    gateCard?.destroy(); gateCard = null;
    if (!slot) return;
    slot.innerHTML = '';
    if (gate === 'signin' || needSignIn()) {
      slot.innerHTML = `<div class="kzn-card kzp kzp-navy kzp-sign"><div class="kzp-crest">${ICON.crown}</div><small class="kzp-k">The Online Court</small>
        <h4>Sign in to fly with other royals</h4><p>The Court admits signed-in royals only, so your rank, wins and br8t Pass follow you to any device. Free Flight and the story need no account.</p>
        <div class="kzp-btns"><button type="button" data-a="signin">Sign in</button></div></div>`;
      const b = slot.querySelector('[data-a="signin"]');
      onTap(b, () => { if (!openAccountPanel()) say('Use the account button (top right) to sign in.'); });
      return;
    }
    if (gate === 'nogames' && counting() && !A.pass) {
      gateCard = passCard({ reason: 'online', skin: 'navy', onBack: () => { gate = null; renderHome(); }, backLabel: 'Back' });
      slot.append(gateCard.el);
    }
  }
  function paintAllow() {
    const el = body.querySelector('[data-s="allow"]');
    if (!el) return;
    const t = allowText();
    el.hidden = !t;
    el.innerHTML = t;
    el.dataset.left = String(A.allowanceState?.remaining ?? '');
  }

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
    const locked = needSignIn();
    body.innerHTML = `<div class="kzn-col">
      <div data-s="gate"></div>
      <p class="kzp-line kzn-allow" data-s="allow" hidden></p>
      ${locked ? '' : `<button class="kz-btn primary" data-a="quick" ${quickT ? 'aria-busy="true" disabled' : ''}>${quickT ? 'Finding a court…' : 'Quick join'} <small>${quickT ? 'one moment' : 'busiest court nearby, or a new one'}</small></button>
      <div class="kzn-row">
        <button class="kz-btn" data-a="create">${ICON.crown}Create a room</button>
      </div>
      <div class="kzn-card">
        <label class="kzn-lbl" for="kzn-code">Join with a code</label>
        <div class="kz-input"><input id="kzn-code" class="mono" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234">
          <button class="kz-btn" data-a="join">Join</button></div>
      </div>`}
      <div class="kzn-card">
        <div class="kzn-lbl"><div>Public rooms <small data-s="online"></small></div><button class="kzn-link" data-a="refresh">Refresh</button></div>
        <ul class="kzn-list" data-s="rooms"></ul>
      </div>
      ${saverRow()}
    </div>`;
    paintGate(); paintAllow();
    const code = body.querySelector('#kzn-code') || document.createElement('input');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode(); });
    const joinCode = () => { const c = code.value.trim(); if (c.length !== 6) { code.classList.add('bad'); say('Room codes have 6 letters and numbers.'); return; } code.classList.remove('bad'); entry(() => net.join(c)); };
    bind({ quick: quickJoin, create: () => { if (needSignIn()) { gate = 'signin'; renderHome(); return; } editing = normalise(defaultsFor('court'), myRank()); go('create'); }, join: joinCode, refresh: () => net.list() });
    bindSaver();
    renderRooms();
  }

  function quickJoin() {
    if (quickT) return;
    if (needSignIn()) { entry(() => {}); return; }
    entry(() => net.quick());
    quickT = setTimeout(() => { quickT = 0; if (view === 'home') { renderHome(); say('No answer from the room server. Try again.'); } }, QUICK_MS);
    if (view === 'home') renderHome();
  }
  const quickDone = () => { if (!quickT) return; clearTimeout(quickT); quickT = 0; if (view === 'home') renderHome(); };

  const saverRow = () => `<div class="kzn-card kzn-saver"><div class="kz-row"><span>Data saver<small>Fewer traffic updates for slow or metered connections</small></span>
    <button class="kz-switch" role="switch" data-a="saver" aria-checked="${!!net.saver}" aria-label="Data saver"></button></div></div>`;
  function bindSaver() {
    const sw = body.querySelector('[data-a="saver"]');
    if (!sw) return;
    onTap(sw, () => { net.setSaver?.(!net.saver); sw.setAttribute('aria-checked', String(!!net.saver)); say(net.saver ? 'Data saver on: the host sends you fewer traffic updates.' : 'Data saver off.', 2400); }, 'tick');
  }

  function renderRooms() {
    const ul = body.querySelector('[data-s="rooms"]');
    if (!ul) return;
    const on = body.querySelector('[data-s="online"]');
    if (on) on.textContent = stats?.online ? `${stats.online} online` : '';
    if (!rooms.length) { ul.innerHTML = '<li class="kzn-empty">No public rooms right now. Create one, or Quick join to open one.</li>'; return; }
    const age = (performance.now() - roomsAt) / 1000;
    ul.innerHTML = rooms.map((r) => {
      const s = summary(r.set), m = roomMeta(r, age);
      return `<li><button class="kzn-room" data-room="${esc(r.id)}" ${r.open ? '' : 'disabled'}>
        <span class="kzn-room-name">${esc(r.name)}</span><span class="kzn-room-n">${r.n}/${r.max}</span>
        <span class="kzn-room-sub">${esc(s.name)} · ${esc(s.parts.slice(0, 2).join(' · '))}</span><span class="kzn-room-meta" data-phase="${esc(r.phase)}">${m.crown ? `<i class="kzn-mc">${CROWN}</i>` : ''}${esc(m.text)}</span></button></li>`;
    }).join('');
    ul.querySelectorAll('[data-room]').forEach((b) => onTap(b, () => entry(() => net.join({ id: b.dataset.room }))));
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
        const name = body.querySelector('#kzn-name')?.value || '';
        if (needSignIn()) { gate = 'signin'; go('home'); return; }
        lastEntry = () => net.create({ name, priv, set: editing }); signinRetry = false; lastEntry();
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
            const canKick = !isMe && (r.priv ? r.owner === net.id : true), voted = myVotes.has(m.id);
            return `<li data-id="${esc(m.id)}" class="${isMe ? 'me' : ''} ${m.away ? 'away' : ''}">
              <span class="kzn-crown" title="${isHost ? 'Host' : ''}">${isHost ? ICON.crown : ''}</span>
              <span class="kzn-pl"><b><i>${esc(m.title || '')}</i> ${esc(m.name)}</b><small>${esc(voiceName(m.voice))} · ${esc(spokenCall(m.call))}${m.away ? ' · reconnecting' : ''}${isHost ? ' · host' : ''}${isMe && m.kv ? ` · <em class="kzn-against">${m.kv} vote${m.kv > 1 ? 's' : ''} to remove you</em>` : ''}</small></span>
              <span class="kzn-rdy" data-s="rdy">${m.rdy ? 'READY' : ''}</span>
              ${canKick ? `<button class="kzn-link kzn-kick" data-kick="${esc(m.id)}" ${voted ? 'disabled aria-pressed="true"' : ''}>${r.priv ? 'Remove' : voted ? `Voted ${m.kv || 1}/${need}` : `Vote out${m.kv ? ` ${m.kv}/${need}` : ''}`}</button>` : ''}
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
      ${saverRow()}
      <div class="kzn-foot">
        <button class="kz-btn ghost" data-a="leave">Leave</button>
        ${host && !airborne ? '<button class="kz-btn" data-a="options">Options</button>' : ''}
        ${airborne ? '<button class="kz-btn primary" data-a="fly">Fly</button>'
          : host ? `<button class="kz-btn primary" data-a="start" ${others.length ? '' : 'data-solo="1"'}>Start${others.length ? '' : ' alone'}</button>`
            : `<button class="kz-btn primary" data-a="ready" aria-pressed="${!!me?.rdy}">${me?.rdy ? 'Ready ✓' : 'Ready'}</button>`}
      </div>
    </div>`;
    body.querySelectorAll('[data-v]').forEach((b) => onTap(b, () => { if (!b.disabled && b.getAttribute('aria-pressed') !== 'true') net.claim(b.dataset.v); }, 'tick'));
    body.querySelectorAll('[data-kick]').forEach((b) => onTap(b, () => { if (!b.disabled) kickSheet(b.dataset.kick); }));
    bindSaver();
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

  // Kick / vote-out confirmation (§8): an in-lobby sheet, never a browser dialog.
  function kickSheet(id) {
    const r = net.room, m = r?.members.find((x) => x.id === id);
    if (!m) return;
    closeSheet();
    const need = Math.floor((r.members.length - 1) / 2) + 1, have = m.kv || 0;
    const s = el(`<div class="kzn-sheet" role="dialog" aria-modal="true" aria-labelledby="kzn-sheet-h"><div class="kzn-sheet-card">
      <h2 id="kzn-sheet-h"></h2><p></p>
      <div class="kzn-foot"><button class="kz-btn ghost" data-k="no">Cancel</button><button class="kz-btn primary danger" data-k="yes"></button></div></div></div>`);
    s.querySelector('h2').textContent = r.priv ? `Remove ${m.name}?` : `Vote to remove ${m.name}?`;
    s.querySelector('p').textContent = r.priv ? 'They leave at once and cannot rejoin this room.'
      : `A majority of the other royals must agree: ${need} vote${need > 1 ? 's' : ''}, ${have} so far. If it passes they cannot rejoin this room.`;
    s.querySelector('[data-k="yes"]').textContent = r.priv ? 'Remove' : 'Vote to remove';
    node.append(s);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); } };
    document.addEventListener('keydown', onKey, true);
    sheet = { el: s, id, off: () => document.removeEventListener('keydown', onKey, true) };
    onTap(s.querySelector('[data-k="no"]'), closeSheet, 'back');
    onTap(s.querySelector('[data-k="yes"]'), () => {
      closeSheet();
      if (!net.room?.members.some((x) => x.id === id)) return;
      if (net.room.priv) { net.kick(id); say(`${m.name} was removed.`); }
      else { net.vote(id); myVotes.add(id); say(have + 1 >= need ? `${m.name} was voted out.` : `Vote counted: ${have + 1} of ${need}.`); }
      if (view === 'room') renderRoom();
    });
    s.addEventListener('click', (e) => { if (e.target === s) closeSheet(); });
    s.querySelector('[data-k="no"]').focus({ preventScroll: true });
  }
  function closeSheet() { if (!sheet) return; sheet.off(); sheet.el.remove(); sheet = null; }

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
    net.on('connected', () => { setPill(); if (!net.room) net.list(); checkTok().then(() => { if (counting()) A.allowance().then(() => view === 'home' && paintAllow()); if (view === 'home') renderHome(); }); }),
    net.on('rooms', (m) => { rooms = m.rooms || []; roomsAt = performance.now(); stats = { players: m.players, online: m.online, region: m.region }; if (view === 'home') renderRooms(); }),
    net.on('joined', (r) => { started = false; myVotes.clear(); closeSheet(); quickDone(); go('room'); if (r.phase === 'flight') startNow(); }),
    net.on('room', (r) => {
      for (const id of myVotes) if (!r.members.some((m) => m.id === id)) myVotes.delete(id);
      if (sheet && !r.members.some((m) => m.id === sheet.id)) closeSheet();
      if (view === 'room') renderRoom();
      setPill();
    }),
    net.on('phase', (p) => { if (p === 'flight') startNow(); else started = false; }),
    net.on('host', (h) => { if (h.me) say('You are now the host: the sky runs on your device.'); }),
    net.on('claim', (m) => { if (!m.ok) say(m.why === 'airborne' ? 'Land and park first to change voice.' : `${voiceName(m.voice)} is taken${m.byName ? ` by ${m.byName}` : ''}.`); }),
    net.on('error', (m) => {
      quickDone();
      // ACCESS: a refused entry gets a card on the home view, never a dialog
      if (m.code === 'nogames') { gate = 'nogames'; A.noteAllowance(m.allowance); go('home'); return; }
      if (m.code === 'signin') {
        // Our token may simply not have been checked yet (signed in a moment ago): send it and try once more.
        checkTok().then((has) => { if (has && lastEntry && !signinRetry) { signinRetry = true; net.hello(); setTimeout(() => lastEntry?.(), 900); } else { gate = 'signin'; go('home'); } });
        return;
      }
      say(m.msg || 'Something went wrong.');
    }),
    net.on('allowance', (a) => { A.noteAllowance(a); if (view === 'home') paintAllow(); }),
    net.on('kicked', (m) => { closeSheet(); say(m.msg || 'You left the room.', 5000); go('home'); }),
    net.on('left', () => { closeSheet(); myVotes.clear(); if (view === 'room') go('home'); }),
    net.on('link', setPill),
    net.on('reconnecting', setPill),
    net.on('disconnected', () => { setPill(); say('Lost the room server. Check your connection.'); }),
  );
  onTap(node.querySelector('[data-a="back"]'), () => {
    if (view === 'create') { go(net.room ? 'room' : 'home'); return; }
    onClose?.();
  }, 'back');
  // Pill each second; the public list refreshes every 10 s while it is on screen, and its clocks count down between.
  let listAt = 0;
  const pillTimer = setInterval(() => {
    setPill();
    if (view !== 'home' || !node.classList.contains('on') || net.room) return;
    if (performance.now() - listAt > LIST_MS && net.connected) { listAt = performance.now(); net.list(); }
    else if (rooms.some((r) => r.meta?.left)) renderRooms();
  }, 1000);

  // ACCESS: signing in (or out) while the lobby is open sends the new token and repaints the gate.
  const Qs = new URLSearchParams(location.search);
  if (!Qs.has('noaccount') && !Qs.get('uid')) import('/lib/auth/auth.js').then(({ auth }) => offs.push(auth.onChange(() => { net.hello(); checkTok().then((ok) => { if (ok && gate === 'signin') gate = null; if (view === 'home') renderHome(); if (counting()) A.allowance().then(() => view === 'home' && paintAllow()); }); }))).catch(() => {});
  offs.push(A.on(() => { if (view === 'home') { paintAllow(); if (gate === 'nogames' && A.pass) { gate = null; renderHome(); } } }));
  A.probe();
  render();
  net.connect().then(() => { setPill(); const code = new URLSearchParams(location.search).get('room'); if (code && !net.room) net.join(code); })
    .catch(() => { setPill(); say('Could not reach the room server.'); });

  return {
    node,
    show(on) { node.classList.toggle('on', on); if (!on) closeSheet(); if (on) { checkTok(); if (counting()) A.allowance().then(() => view === 'home' && paintAllow()); render(); } },
    get view() { return view; },
    destroy() { clearInterval(pillTimer); clearTimeout(quickT); closeSheet(); offs.forEach((f) => f()); node.remove(); },
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
.kzn-room-meta { grid-column: 1 / -1; color: var(--kz-gold2, #f7dc8f); display: flex; align-items: center; gap: 5px; min-width: 0; }
.kzn-room-n { justify-self: end; } .kzn-room-sub { grid-column: 1 / -1; }
.kzn-lbl small { margin-left: 6px; font: 500 11px var(--kz-sans, sans-serif); letter-spacing: .04em; text-transform: none; color: var(--kz-faint, #978f7d); }
.kzn-room-meta[data-phase="lobby"] { color: #a6f0b8; }
.kzn-room:disabled .kzn-room-meta { color: var(--kz-dim, #cbc2ad); }
.kzn-mc { display: grid; flex: none; } .kzn-mc svg { width: 15px; height: 11px; filter: drop-shadow(0 0 3px rgba(226,179,60,.6)); }
.kzn [aria-busy="true"] { opacity: .75; cursor: progress; }
.kzn-saver { padding: 4px 12px; }
.kzn-against { font-style: normal; color: #ffb3bf; }
.kzn-kick:disabled { color: var(--kz-faint, #978f7d); cursor: default; }
.kzn-sheet { position: absolute; inset: 0; z-index: 2; display: flex; align-items: flex-end; justify-content: center; padding: 16px; background: rgba(6, 10, 30, .6);
  animation: kzn-fade .18s ease-out; }
.kzn-sheet-card { width: min(440px, 100%); border-radius: 18px; border: 1px solid var(--kz-gold, #e2b04a); background: linear-gradient(180deg, #16244f, #111a3c);
  padding: 16px 16px 4px; box-shadow: 0 -8px 40px rgba(0,0,0,.5); animation: kzn-up .26s cubic-bezier(.2, 1.2, .4, 1); }
.kzn-sheet h2 { margin: 0 0 6px; font: italic 400 26px/1.1 var(--kz-serif, Georgia, serif); color: var(--kz-gold2, #f7dc8f); overflow-wrap: anywhere; }
.kzn-sheet p { margin: 0; font: 14px/1.4 var(--kz-sans, sans-serif); color: var(--kz-dim, #cbc2ad); }
.kzn-sheet .kzn-foot { position: static; margin: 0; padding: 14px 0 12px; background: none; }
.kzn-sheet .kz-btn.danger { background: linear-gradient(180deg, #e0566c, #b3243c); color: #fff; border-color: transparent; }
@media (orientation: landscape) and (max-height: 520px) { .kzn-sheet { align-items: center; } }
@keyframes kzn-fade { from { opacity: 0; } }
@keyframes kzn-up { from { opacity: 0; transform: translateY(24px); } }
@media (prefers-reduced-motion: reduce) { .kzn-sheet, .kzn-sheet-card { animation: none; } }
.kzn-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.kzn-allow { margin: 0 4px; display: block; text-align: center; } .kzn-allow[hidden] { display: none; }
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

// The EVENTS panel: every running event with its time left, Vines & Ladders and the picture
// reveal, rivals from the server, and the prizes. Battles arrive as `ragdojo:battle` window
// events (campaign fights from main.js, ghost and arena results from net/panel.js) and are
// banked into `save.events` — the run save, so cloud sync carries it. Works with no server;
// with one, the server's recomputed state wins (server/events.go).

import { activeEvents, parseEventId, pointsFor, today } from './index.js';
import * as V from './vines.js';
import * as R from './reveal.js';
import * as E from './state.js';
import { VinesView, RevealView } from './render.js?v=20261014-walk';
import { createEventsNet, deviceId, arenaName } from './net.js';
import { drawOverlay } from './overlay.js';
import { SHEET_W, GROUND_Y } from '../config.js';
import { isRotated } from '../input.js';

const SHORT = { 'vines-day': 'VINES', 'reveal-week': 'PICTURE', 'vines-month': 'SCROLLS', 'reveal-month': 'MONTHLY', halloween: 'SPOOKY' };
// Relative to the page (index.html sits at the game root), not this module: the release
// build bundles this file into js/main.js, where a module-relative path would point elsewhere.
// Only the manifest is public (choices, name box); the pictures come from the arena server a
// square at a time (server/eventart.go). With no server every event shows the drawn picture.
const ART = (f) => new URL('assets/events/' + f, document.baseURI).href;
const cellRect = (c, W, H) => {
  const col = c % R.GRID, row = Math.floor(c / R.GRID);
  const x0 = Math.floor((col * W) / R.GRID), y0 = Math.floor((row * H) / R.GRID);
  return [x0, y0, Math.floor(((col + 1) * W) / R.GRID) - x0, Math.floor(((row + 1) * H) / R.GRID) - y0];
};
/** Rivals are keyed by the server's opaque per-event id; two players may share a name. */
const rkey = (r) => r.rid || r.name;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const order = (a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

let current = null;   // the mounted panel, for drawEventBackdrop

function fmtLeft(ms) {
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60;
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h >= 1 ? `${h}h ${m}m left` : `${Math.max(1, m)}m left`;
}

export function mountEvents(h) {
  const $ = (id) => document.getElementById(id);
  const btn = $('btnEvents'), panel = $('events'), tabsEl = $('evTabs'), body = $('evBody');
  if (!btn || !panel || !body) return null;
  injectCSS();
  body.innerHTML = '<div class="evstage" id="evStage"><canvas id="evCanvas"></canvas></div><div class="evside" id="evSide"></div>';
  const stage = $('evStage'), cv = $('evCanvas'), side = $('evSide');
  const g = cv.getContext('2d');
  const net = createEventsNet({ dev: h.dev, lan: h.lan, account: h.account });
  const vview = new VinesView(), rview = new RevealView();
  const boards = new Map(), rivals = new Map(), arts = new Map(), srvArt = new Map();
  let manifest = { pictures: {} };
  let tab = null, note = '', raf = 0, last = 0, laidFor = '', online = false;
  const timers = new Map();

  // ── state: lives in the run save (S.events / S.eventPrizes), so cloud sync carries it ──
  const S = () => h.getSave();
  const st = () => E.load(S().events);
  const setSt = (next) => { S().events = next; h.persist(); };
  function prizes() {
    const s = S();
    if (!s.eventPrizes || !Array.isArray(s.eventPrizes.bgs)) s.eventPrizes = { bgs: [], bg: '' };
    return s.eventPrizes;
  }
  const now = () => Date.now() + net.skew;
  const pass = () => !!h.hasPass();
  const boardFor = (id) => { if (!boards.has(id)) boards.set(id, V.makeBoard(id)); return boards.get(id); };
  const art = (id) => manifest.pictures?.[id] || null;
  /** Real art is up only when the manifest lists it AND the server says it holds it. */
  const artOn = (id) => !!art(id) && srvArt.get(id) === true;
  const choicesOf = (id) => (artOn(id) && art(id).choices?.length === R.CHOICES ? art(id).choices : []);
  const uidOf = (id) => E.evState(st(), id).uid || net.localUid();
  const meOf = (id) => { const e = E.evState(st(), id); return { uid: e.uid || net.localUid(), points: E.turnPoints(e), rolls: e.rolls | 0 }; };

  // ── event art: tiles for opened squares, the whole picture at 25 ──────────────────────
  function artOf(id) {
    if (!arts.has(id)) {
      const a = art(id) || {}, c = document.createElement('canvas');
      c.width = a.w || 1024; c.height = a.h || 640;
      arts.set(id, { c, g: c.getContext('2d'), have: new Set(), busy: new Set(), full: false, triedFull: false, ver: 0 });
    }
    return arts.get(id);
  }
  const redraw = (id) => { if (isOpen() && (tab === id || tab === 'prizes')) paintSide(); };
  function fetchArt(id, open) {
    if (!art(id) || !net.online) return;
    const A = artOf(id);
    if (A.full) return;
    // Everything open: the whole picture. Nothing known (a prize whose event was pruned): ask once.
    if (open.length >= R.CELLS || (!open.length && !A.triedFull)) {
      if (A.busy.has('full')) return;
      A.busy.add('full'); A.triedFull = true;
      void net.full(id).then((bm) => {
        A.busy.delete('full');
        if (bm) { A.g.drawImage(bm, 0, 0, A.c.width, A.c.height); A.full = true; A.ver++; redraw(id); }
      });
      return;
    }
    for (const cell of open) {
      if (A.have.has(cell) || A.busy.has(cell) || cell < 0 || cell >= R.CELLS) continue;
      A.busy.add(cell);
      void net.tile(id, cell).then((bm) => {
        A.busy.delete(cell);
        if (!bm) return;
        const [x, y, w, h] = cellRect(cell, A.c.width, A.c.height);
        A.g.drawImage(bm, x, y, w, h);
        A.have.add(cell); A.ver++;
      });
    }
  }

  /** The art as far as this player has opened it, with their name written in (overlay.js). */
  function imageOf(id) {
    const a = art(id), A = arts.get(id);
    if (!a || !A) return null;
    const name = arenaName();
    if (A.comp && A.compVer === A.ver && A.compName === name) return A.comp;
    if (!a.overlay) return A.c;
    const c = A.comp || document.createElement('canvas');
    c.width = A.c.width; c.height = A.c.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(A.c, 0, 0);
    g.save();
    if (!A.full) { g.beginPath(); for (const cell of A.have) g.rect(...cellRect(cell, c.width, c.height)); g.clip(); }
    drawOverlay(g, c.width, c.height, a.overlay, name);
    g.restore();
    A.comp = c; A.compVer = A.ver; A.compName = name;
    return c;
  }
  const shownImage = (id) => (artOn(id) ? (artOf(id), imageOf(id)) : null);
  const wholeOf = (id, ev) => (artOn(id) ? !!arts.get(id)?.full : R.complete(ev));

  fetch(ART('manifest.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (m && m.pictures && typeof m.pictures === 'object') { manifest = m; if (isOpen()) paint(); }
  }).catch(() => {});

  // ── battles in ─────────────────────────────────────────────────────────────────────
  // Probed now so the first battle is already stamped on the server's clock.
  void net.probe();
  addEventListener('ragdojo:battle', (e) => {
    const d = e.detail || {};
    // Dispatchers stamp with this device's clock; events run on the server's (net.skew), so a
    // phone set a day behind still fights in today's events.
    const at = (Number.isFinite(+d.at) && +d.at > 0 ? +d.at : Date.now()) + net.skew;
    const b = { id: d.id || `camp:${deviceId()}:${at}`, at, src: d.src === 'arena' ? 'arena' : 'campaign', won: !!d.won, oppDmg: +d.oppDmg || 0 };
    const before = st();
    const after = E.recordBattle(before, b);
    const hit = Object.keys(after.ev).filter((k) => after.ev[k].b.some((x) => x[0] === b.id) && !(before.ev[k]?.b || []).some((x) => x[0] === b.id));
    if (!hit.length) return;
    setSt(after);
    // Banked everywhere (a lapsed Pass loses nothing); announced only where it shows.
    const shown = hit.filter((k) => !locked(k));
    if (shown.length) d.award = { pts: pointsFor(b), events: shown.length };
    paintButton();
    if (isOpen()) paintSide();
    for (const id of hit) void sync(id);
  });

  // ── the server ─────────────────────────────────────────────────────────────────────
  async function sync(id) {
    const p = parseEventId(id);
    if (!p || (p.def.pass && !pass())) return;
    if (!(await net.probe())) { online = false; return; }
    const cur = E.evState(st(), id);
    const sent = new Set(cur.b.map((x) => x[0]));
    const r = await net.sync({ event: id, name: arenaName() || 'PLAYER', b: cur.b, rolls: cur.rolls | 0, open: cur.open || [] });
    if (r.status !== 200 || !r.data) {
      online = false;
      if (r.status === 0) srvArt.delete(id);
      if (r.status === 429) later(id, 600);
      if (tab === id && isOpen()) paintSide();
      return;
    }
    online = true;
    adopt(id, r.data, sent);
  }
  // One timer per event: a retry for one event must not cancel another's.
  const later = (id, ms) => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => sync(id), ms)); };
  const syncSoon = (id) => later(id, 450);

  /** The server's recomputed state wins; anything recorded while the request was out is kept. */
  function adopt(id, d, sent) {
    const p = parseEventId(id);
    const s = st(), cur = E.evState(s, id);
    const srv = Array.isArray(d.b) ? d.b : [];
    const extra = cur.b.filter((x) => !sent.has(x[0]) && !srv.some((y) => y[0] === x[0]));
    const next = { ...cur, uid: d.uid || cur.uid, b: [...srv, ...extra].sort(order) };
    const banked = E.pointsOf(next);
    if (p.def.kind === 'vines') next.rolls = Math.min(banked, Math.max(d.rolls | 0, cur.rolls | 0));
    else {
      if (typeof d.art === 'boolean') srvArt.set(id, d.art);
      const cap = Math.min(R.CELLS, Math.floor(banked / p.def.cost));
      const open = [...(d.open || []), ...(cur.open || []).filter((c) => !(d.open || []).includes(c))];
      next.open = open.slice(0, cap);
      next.guesses = [...new Set([...(d.guesses || []), ...(cur.guesses || [])])];
      next.solved = !!d.solved || !!cur.solved;
      next.bonus = Math.max(d.bonus | 0, cur.bonus | 0);
    }
    setSt(E.setEv(s, id, next));
    if (Array.isArray(d.rivals)) {
      const old = rivals.get(id);
      rivals.set(id, d.rivals);
      if (old && tab === id && isOpen() && laidFor.startsWith(id + '|')) {
        const was = new Map(old.map((r) => [rkey(r), r.pos]));
        vview.rivalsMove(d.rivals.filter((r) => was.has(rkey(r))).map((r) => ({ key: rkey(r), from: was.get(rkey(r)), to: r.pos })));
      }
    }
    payRewards(id);
    if (p.def.kind === 'reveal' && artOn(id)) fetchArt(id, Array.isArray(d.open) ? d.open : []);
    // The whole panel, not just the side: a solved picture adds the PRIZES tab.
    if (tab === id && isOpen()) paint();
  }

  // ── rewards ────────────────────────────────────────────────────────────────────────
  function payRewards(id) {
    const p = parseEventId(id);
    if (!p || p.def.kind !== 'reveal' || locked(id)) return;
    const ev = E.evState(st(), id);
    const owed = R.rewardsOwed(p.def, ev, artOn(id) ? 'art' : 'placeholder');
    if (!owed.length) return;
    for (const r of owed) {
      if (r.kind === 'ink') h.addInk(r.amount);
      if (r.kind === 'arenaBackground') {
        const pz = prizes();
        if (!pz.bgs.some((b) => b.id === id)) pz.bgs.push({ id, title: `${p.def.title} · ${p.win.key}`, art: artOn(id) });
      }
    }
    setSt(E.setEv(st(), id, { ...ev, claimed: [...ev.claimed, ...owed.map((r) => r.id)] }));
  }
  const payAll = () => { for (const id of Object.keys(st().ev)) payRewards(id); };

  // ── actions ────────────────────────────────────────────────────────────────────────
  function roll() {
    const id = tab, p = id && id !== 'prizes' ? parseEventId(id) : null;
    if (!p || p.def.kind !== 'vines' || vview.busy() || locked(id)) return;
    const ev = E.evState(st(), id), uid = uidOf(id), board = boardFor(id), pts = E.turnPoints(ev);
    const r = V.takeRoll(board, uid, id, pts, ev.rolls | 0);
    if (!r.move) { say(V.positionAfterRolls(board, uid, id, ev.rolls | 0).pos === V.SQUARES ? 'you are home — square 100!' : 'no rolls banked — win a fight to bank some'); return; }
    setSt(E.setEv(st(), id, { ...ev, uid, rolls: r.rolls }));
    vview.walk(r.move);
    const m = r.move;
    say(`rolled a ${m.roll}${m.link ? (m.link.kind === 'ladder' ? ' — up a ladder!' : ' — down a vine') : ''}${m.bounced ? ' (bounced off 100)' : ''}${r.turnEnded ? ' · turn over, everyone moves' : ''}`);
    if (r.turnEnded) void sync(id); else syncSoon(id);
    paintSide();
  }

  function uncover(cell) {
    const id = tab, p = id && id !== 'prizes' ? parseEventId(id) : null;
    if (!p || p.def.kind !== 'reveal' || locked(id)) return false;
    const ev = E.evState(st(), id);
    const r = R.uncover(p.def, ev, E.pointsOf(ev), cell);
    if (!r.ok) { if (r.why === 'points') say('not enough points — win a fight to earn some'); return false; }
    setSt(E.setEv(st(), id, r.st));
    payRewards(id);
    syncSoon(id);
    paint();
    return true;
  }

  /** Only the server can check a guess: no answer ships, so offline there is no guess bonus. */
  async function guess(choice) {
    const id = tab, p = id && id !== 'prizes' ? parseEventId(id) : null;
    if (!p || p.def.kind !== 'reveal' || locked(id)) return;
    const ev = E.evState(st(), id);
    if (!R.canGuess(ev, artOn(id)) || ev.guesses.includes(choice)) return;
    const r = (await net.probe()) ? await net.guess(id, 'art', choice) : { status: 0 };
    if (r.status === 200 && r.data) {
      online = true;
      adopt(id, r.data, new Set(ev.b.map((x) => x[0])));
      say(r.data.guessable === false ? 'this picture cannot be guessed right now' : r.data.right ? `yes — ${choice}!` : `not ${choice.toLowerCase()}`);
    } else if (r.status === 409) say(r.data?.error === 'picture changed' ? 'this picture was just updated — reload the game to see it'
      : r.data?.error === 'play first' ? 'fight once in this event first' : 'no guesses left');
    else say('guessing needs the arena server — try again when you are online');
  }

  function useBackground(id) {
    const pz = prizes();
    pz.bg = pz.bg === id ? '' : id;
    h.persist();
    paintSide();
  }

  // ── panel ──────────────────────────────────────────────────────────────────────────
  const isOpen = () => panel.classList.contains('show');
  const locked = (id) => { const p = parseEventId(id); return !!p && p.def.pass && !pass(); };
  const say = (s) => { note = s; const el = $('evNote'); if (el) el.textContent = s; };

  function events() { return activeEvents(now(), { pass: pass() }); }

  function paintButton() {
    btn.classList.toggle('new', !E.seenToday(st(), today()));
  }

  function open(id = null) {
    const list = events();
    if (id) tab = id;
    if (!tab || (tab !== 'prizes' && !list.some((a) => a.id === tab))) tab = list[0]?.id || null;
    note = '';
    setSt(E.markSeen(E.prune(st(), now()), today()));
    payAll();
    paintButton();
    h.overlay('events');
    laidFor = '';
    paint();
    for (const a of list) if (!a.locked) void sync(a.id);
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function setTab(id) { tab = id; note = ''; laidFor = ''; paint(); if (id !== 'prizes') void sync(id); }

  function paint() { paintTabs(); layout(); paintSide(); }

  function paintTabs() {
    const list = events();
    const pz = prizes();
    tabsEl.innerHTML = list.map((a) =>
      `<button class="tab${tab === a.id ? ' on' : ''}" data-ev="${esc(a.id)}">${a.locked ? '🔒 ' : ''}${SHORT[a.def.id] || a.def.title}</button>`).join('') +
      (pz.bgs.length ? `<button class="tab${tab === 'prizes' ? ' on' : ''}" data-ev="prizes">PRIZES</button>` : '');
  }

  function layout() {
    const w = stage.clientWidth, hgt = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = `${tab}|${w}|${hgt}|${dpr}`;
    if (key === laidFor || !w || !hgt) return;
    laidFor = key;
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    const area = { x: 0, y: 0, w, h: hgt };
    const p = tab && tab !== 'prizes' ? parseEventId(tab) : null;
    // A resize keeps a walk in progress; only a different board drops it.
    if (p?.def.kind === 'vines') { if (vview.tab !== tab) { vview.anim = []; vview.rivalAnim = []; vview.tab = tab; } vview.layout(area, boardFor(tab), dpr); }
    rview.layout(area);
    laidFor = `${tab}|${w}|${hgt}|${dpr}`;
  }

  function frame(t) {
    if (!isOpen()) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    layout();
    const dpr = cv.width / Math.max(1, stage.clientWidth);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, stage.clientWidth, stage.clientHeight);
    const p = tab && tab !== 'prizes' ? parseEventId(tab) : null;
    if (!p) { drawPrizes(); return; }
    const lock = locked(tab);
    if (p.def.kind === 'vines') {
      const me = meOf(tab);
      vview.draw(g, dt, t / 1000, { myPos: V.positionAfterRolls(boardFor(tab), me.uid, tab, me.rolls).pos, rivals: (rivals.get(tab) || []).map((r) => ({ ...r, key: rkey(r) })), dim: lock });
    } else {
      const ev = E.evState(st(), tab);
      rview.draw(g, { img: shownImage(tab), open: ev.open, whole: wholeOf(tab, ev), dim: lock });
    }
  }

  function drawPrizes() {
    const pz = prizes(), b = pz.bgs.find((x) => x.id === pz.bg) || pz.bgs[pz.bgs.length - 1];
    if (!b) return;
    rview.draw(g, { img: prizeImage(b), open: [], whole: true });
  }

  function vinesSide(a) {
    const id = a.id, ev = E.evState(st(), id), me = meOf(id), board = boardFor(id);
    const turns = V.turnsOf(board, id, me);
    const left = V.rollsLeftInTurn(board, me.uid, id, me.points, me.rolls);
    const waiting = Math.max(0, V.rollsBanked(me.points) - me.rolls - left);
    const pos = V.positionAfterRolls(board, me.uid, id, me.rolls).pos;
    const rv = rivals.get(id) || [];
    return `<div class="evstat">square <b>${pos}</b> · turn <b>${turns + (left ? 1 : 0)}</b> · <b>${E.pointsOf(ev)}</b> pts</div>
      <div class="evrollrow"><button class="btn big" id="evRoll"${left && pos !== 100 ? '' : ' disabled'}>ROLL</button>
      <span class="evsmall">${left ? `${left} roll${left === 1 ? '' : 's'} left this turn` : pos === 100 ? 'home!' : 'win a fight for more rolls'}${waiting ? ` · +${waiting} banked` : ''}</span></div>
      <div class="evnote" id="evNote">${esc(note)}</div>
      <div class="evhead2">RIVALS <small>shown up to your turn ${turns}</small></div>
      ${rv.length ? `<div class="evriv">${rv.map((r) => `<div class="${r.friend ? 'f' : ''}">${r.friend ? '★ ' : ''}${esc(r.name)} <span>sq ${r.pos}</span></div>`).join('')}</div>`
        : `<p class="evsmall">${online ? 'Nobody else has played this one yet.' : 'Rivals show up here when you are online and signed in.'}</p>`}`;
  }

  function revealSide(a) {
    const id = a.id, def = a.def, ev = E.evState(st(), id), pts = E.pointsOf(ev);
    const gl = R.guessesLeft(ev), choices = choicesOf(id), real = artOn(id);
    const pz = prizes(), bg = pz.bgs.find((b) => b.id === id);
    const full = ev.open.length >= R.CELLS, done = real ? full : R.complete(ev);
    const can = R.canGuess(ev, real);
    const why = !ev.b.length ? 'fight once in this event to guess' : `${gl} guess${gl === 1 ? '' : 'es'} left · early = more ink`;
    const ask = !real ? (done ? '' : '<p class="evsmall">A practice picture: uncover it for the prize. Guessing pays ink on the real event pictures.</p>')
      : ev.solved || full ? '' : `<div class="evhead2">WHAT IS IT? <small>${why}</small></div>
      <div class="evchoices">${choices.map((c) => `<button class="btn${ev.guesses.includes(c) ? ' tried' : ''}" data-guess="${esc(c)}"${!can || ev.guesses.includes(c) ? ' disabled' : ''}>${esc(c)}</button>`).join('')}</div>`;
    return `<div class="evstat"><b>${R.left(def, ev, pts)}</b> pts to spend · ${def.cost} a square · ${ev.open.length}/25 open</div>
      <div class="evnote" id="evNote">${esc(note || (done ? '' : 'tap a square to uncover it'))}</div>
      ${ask}
      ${ev.solved ? `<p class="evwin" id="evSolved">Solved! +${ev.bonus} ink${real && !full ? ' · keep uncovering to see it all' : ''}</p>` : ''}
      ${bg ? `<p class="evwin">Picture unlocked as an arena background <button class="btn small" data-bg="${esc(id)}">${pz.bg === id ? 'IN USE ✓' : 'USE IT'}</button></p>` : ''}`;
  }

  function paintSide() {
    const list = events();
    if (tab === 'prizes') {
      const pz = prizes();
      side.innerHTML = `<div class="evtitle">PRIZES</div><p class="evsmall">Finished pictures, for the arena and menu background.</p>` +
        pz.bgs.map((b) => `<div class="evprize"><span>${esc(b.title)}</span><button class="btn small" data-bg="${esc(b.id)}">${pz.bg === b.id ? 'IN USE ✓' : 'USE'}</button></div>`).join('') +
        `<div class="evprize"><span>plain paper</span><button class="btn small" data-bg=""${pz.bg ? '' : ' disabled'}>${pz.bg ? 'USE' : 'IN USE ✓'}</button></div>`;
      return;
    }
    const a = list.find((x) => x.id === tab);
    if (!a) { side.innerHTML = '<p class="evsmall">No events are running right now.</p>'; return; }
    const head = `<div class="evtitle">${esc(a.def.title)}</div>
      <div class="evtags"><span class="evtag ${a.def.pass ? 'pass' : 'free'}">${a.def.pass ? 'PASS' : 'FREE'}</span>
      <span class="evtag any">${a.def.anyBattle ? 'ANY BATTLE' : 'ARENA ONLY'}</span><span class="evsmall">${fmtLeft(a.win.end - now())}</span></div>`;
    if (a.locked) {
      side.innerHTML = head + `<p class="evlock">A br8t Pass event. Battles count here for Pass holders — the free events count for everyone.</p>
        <button class="btn small" id="evPass">SUPPORT / PASS</button>`;
      return;
    }
    const how = `<p class="evsmall evhow">win 3 · close loss 2 · loss 1${a.def.anyBattle ? ' · campaign fights count (10 a day)' : ' · arena battles only'}</p>`;
    side.innerHTML = head + (a.def.kind === 'vines' ? vinesSide(a) : revealSide(a)) + how;
  }

  // ── input ──────────────────────────────────────────────────────────────────────────
  btn.addEventListener('click', () => { h.click(); open(); });
  $('btnEventsClose')?.addEventListener('click', () => { h.click(); h.overlay(null); });
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (!b) return; h.click(); setTab(b.dataset.ev); });
  side.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    h.click();
    if (t.id === 'evRoll') roll();
    else if (t.id === 'evPass') h.openUpgrade();
    else if (t.dataset.guess !== undefined) void guess(t.dataset.guess);
    else if (t.dataset.bg !== undefined) useBackground(t.dataset.bg);
  });
  cv.addEventListener('pointerdown', (e) => {
    const p = tab && tab !== 'prizes' ? parseEventId(tab) : null;
    if (p?.def.kind !== 'reveal') return;
    const r = cv.getBoundingClientRect();
    // The app is rotated 90° in portrait: undo it for this canvas's own coordinates.
    const rot = isRotated();
    const x = rot ? e.clientY - r.top : e.clientX - r.left, y = rot ? r.right - e.clientX : e.clientY - r.top;
    const cell = rview.cellAt(x, y);
    if (cell >= 0 && uncover(cell)) h.click();
  });
  addEventListener('resize', () => { if (isOpen()) { laidFor = ''; paint(); } });

  /** A finished picture: the art as far as the server lets this player see it, or the drawn one. */
  function prizeImage(b) {
    if (!b.art) return rview.placeholderCanvas();
    if (!arts.get(b.id)?.full) fetchArt(b.id, E.evState(st(), b.id).open || []);
    const A = arts.get(b.id);
    return A && (A.full || A.have.size) ? imageOf(b.id) : null;
  }

  paintButton();
  current = {
    background() {
      const pz = prizes(), b = pz.bgs.find((x) => x.id === pz.bg);
      return b ? prizeImage(b) : null;
    },
    mergeInto(next, prev) {
      next.events = E.adoptMerge(next?.events, prev?.events);
      const a = prev?.eventPrizes?.bgs || [], b = next?.eventPrizes?.bgs || [];
      next.eventPrizes = { bgs: [...b, ...a.filter((x) => !b.some((y) => y.id === x.id))], bg: next?.eventPrizes?.bg ?? prev?.eventPrizes?.bg ?? '' };
      if (next === S()) payAll();
    },
  };
  const api = {
    open, roll, uncover, guess, sync, setTab, net, picture: imageOf, artOn, arts,
    get tab() { return tab; }, get state() { return st(); }, get rivals() { return rivals; },
    get online() { return online; }, get manifest() { return manifest; }, vview, rview,
  };
  if (h.dev) window.__events = api;
  return api;
}

/** Carry this device's event progress into a save adopted from the cloud. */
export function mergeEventsInto(next, prev) { current?.mergeInto(next, prev); }

/** A finished picture behind the arena and the menu fights, faint, like a poster on the page. */
export function drawEventBackdrop(ctx, m) {
  if (!current || !m || !(m.demo || m.net || m.ghost)) return;
  const img = current.background();
  if (!img) return;
  const w = 1180, hh = w / 1.6, x = (SHEET_W - w) / 2, y = Math.max(20, GROUND_Y - hh - 6);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(img, x, y, w, hh);
  ctx.restore();
}

function injectCSS() {
  if (document.getElementById('evCSS')) return;
  const s = document.createElement('style');
  s.id = 'evCSS';
  s.textContent = `
#btnEvents { position: relative; }
#btnEvents.new::after { content: ''; position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%;
  background: #c0392b; border: 2px solid #fdfaf1; }
#events .sheet.evsheet { width: min(860px, 97vw); height: min(92vh, 560px); max-height: 92vh; }
#events .sheethead { gap: 8px; }
#events .sheethead h2 { margin: 0; }
#evTabs { flex: 1; margin: 0; gap: 4px; }
#evTabs .tab { font-size: 17px; padding: 3px 10px; }
.evbody { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; margin-top: 4px; }
.evstage { flex: 1 1 56%; min-width: 0; position: relative; border: 2px solid rgba(32,36,44,.35); border-radius: 8px 5px 9px 6px; overflow: hidden; touch-action: none; }
.evstage canvas { position: absolute; inset: 0; display: block; }
.evside { flex: 1 1 44%; min-width: 0; overflow-y: auto; text-align: left; font-size: 17px; line-height: 1.25; padding-right: 2px; }
.evtitle { font-family: var(--font-b); font-size: 30px; line-height: 1; }
.evtags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 3px 0 6px; }
.evtag { font-size: 13px; border: 1.5px solid currentColor; border-radius: 8px 5px 9px 4px; padding: 0 6px; }
.evtag.free { color: #2f5c39; } .evtag.pass { color: #8c50c6; } .evtag.any { color: var(--blue); }
.evsmall { font-size: 14px; color: var(--ink-soft); }
.evstat { font-size: 17px; margin: 2px 0; } .evstat b { font-size: 21px; font-variant-numeric: tabular-nums; }
.evrollrow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
.evrollrow .btn.big { font-size: 26px; padding: 6px 26px; }
.evnote { min-height: 20px; color: var(--blue); font-size: 16px; }
.evhead2 { font-size: 14px; letter-spacing: 1px; color: var(--ink-soft); border-bottom: 2px solid rgba(32,36,44,.25); margin: 6px 0 3px; }
.evhead2 small { letter-spacing: 0; margin-left: 6px; }
.evriv { columns: 2; column-gap: 12px; font-size: 15px; }
.evriv .f { color: var(--blue); } .evriv span { opacity: .7; }
.evchoices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 4px 0; }
.evchoices .btn { font-size: 15px; padding: 6px 6px; line-height: 1.1; min-height: 40px; }
.evchoices .btn.tried { text-decoration: line-through; }
.evwin { color: #2f5c39; font-size: 16px; margin: 6px 0; }
.evlock { font-size: 16px; margin: 8px 0; }
.evhow { margin-top: 8px; }
.evprize { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px dashed rgba(32,36,44,.25); }
#events .btn.small { font-size: 15px; padding: 4px 12px; }
.rows .r.evaward, .fine.evaward { color: #8c50c6; border-bottom: none; }
@media (max-height: 470px) {
  #events .sheet.evsheet { height: 92vh; }
  .evtitle { font-size: 24px; } .evside { font-size: 15px; }
  .evstat { font-size: 15px; } .evstat b { font-size: 18px; }
  .evrollrow .btn.big { font-size: 21px; padding: 4px 20px; }
  .evnote { font-size: 14px; min-height: 17px; }
  .evchoices .btn { font-size: 13px; padding: 4px 5px; }
  #evTabs .tab { font-size: 15px; padding: 2px 8px; }
}
@media (orientation: portrait) and (max-width: 860px) {
  #events .sheet.evsheet { width: 97vh; height: calc(100vw - 24px); max-height: calc(100vw - 24px); padding: 8px 12px 10px; }
  #events h2 { font-size: 26px; }
  .evtitle { font-size: 24px; } .evside { font-size: 15px; }
  #evTabs .tab { font-size: 15px; padding: 2px 8px; }
  .evrollrow .btn.big { font-size: 21px; padding: 4px 20px; }
  .evchoices .btn { font-size: 13px; padding: 4px 5px; }
}`;
  document.head.appendChild(s);
}

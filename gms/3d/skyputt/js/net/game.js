// OnlineGame: one online round in progress. Owns the OnlineRound, the relay wiring (net events →
// ghosts), the host's AI driver and the in-game overlays: players strip, shot clock, "waiting for
// others", the scoreboard between holes and the final results.
import { OnlineRound } from './round.js';
import { AIDriver } from './driver.js';
import { courseForRoom, makeInventory } from './rooms.js';
import { CHEAT_WARNING } from './net.js';
import { sfx } from '../game/sfxbus.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ORD = ['1st', '2nd', '3rd'];
const ordinal = n => ORD[n - 1] || `${n}th`;
const vsPar = d => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

export class OnlineGame {
  // hooks: { enter(themeId), leave(), setRound(r) } from main.js · onEnd(reason, room) back to the screens
  constructor({ app, net, store, hooks, onEnd }) {
    Object.assign(this, { app, net, store, hooks, onEnd });
    this.room = null; this.round = null; this.offs = []; this.myDone = null; this.cardKind = null; this._stripT = 0;
  }

  get you() { return this.room?.you ?? -1; }
  mySeat() { return this.room?.seats?.[this.you] || null; }
  isHost() { return !!this.room && this.room.host === this.room.you && this.you >= 0; }
  sharedTime() { return this.room?.holeAt ? (this.net.serverNow() - this.room.holeAt) / 1000 : 0; }
  parTo(n) { return this.room.opts.holes.slice(0, n).reduce((a, h) => a + h.par, 0); }

  async begin(room) {
    this.room = room;
    const course = courseForRoom(room.opts);
    if (!course) throw Object.assign(new Error('This room uses holes your game doesn’t have yet. Reload the page to update.'), { code: 'update' });
    this.course = course;
    await this.hooks.enter(room.opts.theme);
    this.mount();
    const on = (t, f) => this.offs.push(this.net.on(t, f));
    on('room', e => this.onRoom(e));
    on('shot', m => { this.patch(m.seat, { flying: true }); this.round?.onRemoteShot(m); });
    on('result', m => this.onResult(m));
    on('mulligan', m => { this.patch(m.seat, { strokes: m.strokes, pos: m.to, mull: false }); this.round?.onRemoteMulligan(m); this.renderStrip(true); });
    on('roomClosed', m => this.end(m.reason === 'left' ? 'left' : 'closed'));
    on('state', s => this.renderStrip(true, s));
    const me = this.mySeat();
    this.driver = new AIDriver(this);
    this.round = new OnlineRound(this.app, course, room.hole, {
      game: this, inventory: makeInventory(room.opts.helpers, me?.uses, this.store),
      helpersOff: room.opts.helpers?.mode === 'off', onExit: () => {},
    });
    this.hooks.setRound(this.round);
    if (room.state === 'ended') this.showResults();
    else if (room.phase === 'board') this.showBoard();
    this.renderStrip(true);
  }

  // ---- server pushes
  onRoom({ room, ev }) {
    const wasHost = this.isHost();
    this.room = room;
    if (room.state === 'lobby') return this.end('lobby');   // host chose "Play again"
    if (!wasHost && this.isHost() && room.state === 'playing') this.app.hud.banner('You are the host now <small>you run the ghost AIs</small>', 'good', 2200);
    if (ev === 'holeStart') {
      this.hideCard(); this.myDone = null; this.driver.reset();
      this.round.loadHole(room.hole);
    } else if (ev === 'holeEnd') this.showBoard();
    else if (ev === 'end') this.showResults();
    else if (ev === 'resume') {
      if (room.state === 'ended') this.showResults();
      else if (room.phase === 'board') this.showBoard();
      else if (this.round.index !== room.hole) { this.hideCard(); this.round.loadHole(room.hole); }
    } else if (this.cardKind === 'board') this.showBoard();
    this.renderStrip(true);
  }
  onResult(m) {
    this.patch(m.seat, { strokes: m.strokes, pos: m.to, done: m.done, picked: m.picked, flying: false, n: m.n + 1 });
    this.round?.onRemoteResult(m);
    if (m.done && m.seat !== this.you && m.hole === this.room.hole) {
      const s = this.room.seats[m.seat];
      if (s && m.state === 'cup' && m.strokes === 1) this.app.hud.banner(`${esc(s.name)}: HOLE IN ONE!`, 'ace', 1600);
    }
    this.renderStrip(true);
  }
  patch(i, cur) {
    const s = this.room?.seats?.[i];
    if (!s) return;
    for (const [k, v] of Object.entries(cur)) if (v !== undefined) s.cur[k] = v;
  }

  // ---- sends (OnlineRound and the AI driver)
  sendShot(m) {
    this.patch(m.seat ?? this.you, { flying: true, mull: true });
    this.net.shot(m).catch(e => this.syncErr(e, 'shot'));
  }
  sendResult(m) {
    const i = m.seat ?? this.you;
    this.patch(i, { flying: false, n: m.n + 1, pos: m.state === 'cup' ? null : m.to });
    this.net.result(m).then(r => { this.patch(i, { strokes: r.strokes, done: r.done, picked: r.picked }); this.renderStrip(true); })
      .catch(e => this.syncErr(e, 'result'));
    this.renderStrip(true);
  }
  sendMulligan(m) {
    this.net.mulligan(m).then(r => this.patch(this.you, { strokes: r.strokes, pos: r.to, mull: false })).catch(e => this.syncErr(e, 'mulligan'));
  }
  syncErr(e, what) {
    console.warn(`[skyputt] online ${what} refused:`, e.code || e.message);
    if (['offline', 'timeout'].includes(e.code)) return;
    this.net.resync().then(room => { if (room) this.onRoom({ room, ev: 'resume' }); }).catch(() => {});
  }

  // ---- OnlineRound callbacks
  onHoleLoaded() { this.renderStrip(true); }
  onMyHoleDone(info) {
    this.myDone = info;
    this.patch(this.you, { done: true, picked: info.picked, strokes: info.strokes });
    this.renderStrip(true);
  }
  frame(round, dt) {
    if (this.isHost()) this.driver.update(round);
    this._stripT += dt;
    if (this._stripT > 0.25) this.renderStrip();
  }
  clock(left, lim) {
    if (!this.el) return;
    const el = this.el.clock;
    if (left == null) { el.hidden = true; return; }
    el.hidden = false;
    const s = Math.max(0, Math.ceil(left));
    if (el._s !== s) { el._s = s; el.innerHTML = `<i style="--k:${(left / lim).toFixed(3)}"></i><b>${s}</b>`; el.classList.toggle('low', s <= 5); }
  }

  // ---- overlays
  mount() {
    const root = document.createElement('div');
    root.id = 'net-ov';
    root.innerHTML = `<div class="net-strip"></div><div class="net-clock" hidden></div><div class="net-wait" hidden></div>
      <div class="net-conn" hidden>Reconnecting…</div><div class="card-wrap net-card" hidden></div>`;
    document.body.appendChild(root);
    this.el = { root, strip: root.querySelector('.net-strip'), clock: root.querySelector('.net-clock'), wait: root.querySelector('.net-wait'),
      conn: root.querySelector('.net-conn'), card: root.querySelector('.net-card') };
  }
  renderStrip(force = false, connState) {
    if (!this.el || !this.room) return;
    this._stripT = 0;
    const r = this.room, seats = r.seats || [];
    if (connState) this.el.conn.hidden = connState === 'open';
    const holePar = r.opts.holes[r.hole]?.par ?? 3;
    const html = seats.map(s => {
      const c = s.cur || {};
      const tag = s.kind === 'ai' ? '<em>AI</em>' : s.left ? '<em>left</em>' : s.ctrl === 'ai' ? '<em class="away">AI stand-in</em>' : !s.online ? '<em class="away">away</em>' : '';
      const sc = c.done ? (c.picked ? `${c.strokes}*` : `✓${c.strokes}`) : c.flying ? `<span class="roll">${c.strokes + 1}</span>` : `${c.strokes}`;
      return `<div class="ns ${s.i === r.you ? 'me' : ''} ${c.done ? 'done' : ''}"><i style="background:${s.color}"></i><span>${esc(s.name)}</span>${tag}${s.i === r.host ? '<em class="host">host</em>' : ''}<b>${r.phase === 'play' ? sc : s.total}</b></div>`;
    }).join('');
    if (force || html !== this._stripHtml) { this.el.strip.innerHTML = html; this._stripHtml = html; }
    const w = this.el.wait;
    if (this.myDone && r.phase === 'play') {
      const left = seats.filter(s => !s.cur.done).map(s => s.name);
      const d = this.myDone;
      w.innerHTML = `<b>${esc(d.label || scoreLabel(d.strokes, holePar, d.picked))}</b>${d.points ? ` · +${d.points} ladder pts` : ''}<small>${left.length ? `Waiting for ${esc(left.slice(0, 3).join(', '))}${left.length > 3 ? ` +${left.length - 3}` : ''}…` : 'Hole complete'}</small>`;
      w.hidden = false;
    } else w.hidden = true;
  }
  hideCard() { this.cardKind = null; if (this.el) { this.el.card.hidden = true; this.el.card.innerHTML = ''; } clearInterval(this._cardT); }
  card(kind, html) {
    this.cardKind = kind;
    const c = this.el.card;
    c.innerHTML = `<div class="card net-board">${html}</div>`;
    c.hidden = false;
    this.app.hud.hideCard();
    return c;
  }

  showBoard() {
    const r = this.room, h = r.hole, par = r.opts.holes[h].par, me = this.mySeat();
    const rows = [...r.seats].sort((a, b) => a.total - b.total || a.i - b.i);
    const parTot = this.parTo(h + 1);
    const ready = r.seats.filter(s => s.kind === 'human' && !s.left && s.online);
    const nReady = ready.filter(s => s.next).length;
    const c = this.card('board', `
      <div class="card-kicker">Hole ${h + 1} of ${r.opts.holes.length} · Par ${par}</div>
      <div class="card-title">Scoreboard</div>
      <table class="scores net-table"><tr><th></th><th></th><th>Hole</th><th>Total</th></tr>
      ${rows.map((s, k) => { const sc = s.scores[h], rk = rows.findIndex(x => x.total === s.total) + 1; return `<tr class="${s.i === r.you ? 'you' : ''}"><td class="rk">${rk}</td><td class="nm"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}${s.kind === 'ai' ? ' <em>AI</em>' : ''}</td>
        <td class="${sc < par ? 'under' : sc > par ? 'over' : ''}">${sc}${s.picked[h] ? '*' : ''}</td><td>${s.total} <small>${vsPar(s.total - parTot)}</small></td></tr>`; }).join('')}</table>
      <button class="btn primary" data-a="next" ${me?.next ? 'disabled' : ''}>${me?.next ? `Ready ✓ (${nReady}/${ready.length})` : 'Next hole'}</button>
      <div class="card-note net-count"></div>`);
    c.querySelector('[data-a=next]').onclick = e => { sfx.emit('click'); e.target.disabled = true; e.target.textContent = 'Ready ✓'; this.net.next().catch(() => {}); };
    const tick = () => { const s = Math.max(0, Math.ceil((r.nextAt - this.net.serverNow()) / 1000)); const el = c.querySelector('.net-count'); if (el) el.textContent = `Next hole in ${s}s`; };
    clearInterval(this._cardT); this._cardT = setInterval(tick, 500); tick();
  }

  showResults() {
    const r = this.room, n = r.opts.holes.length, parTot = this.parTo(n);
    const rows = [...r.seats].sort((a, b) => a.total - b.total || a.i - b.i);
    let rank = 0, prev = null;
    const ranks = rows.map((s, k) => { if (s.total !== prev) { rank = k + 1; prev = s.total; } return rank; });
    const myRank = ranks[rows.findIndex(s => s.i === r.you)] || 0, tied = ranks.filter(k => k === myRank).length > 1;
    const c = this.card('results', `
      <div class="card-kicker">${esc(r.opts.courseName || 'Online')} · ${n} hole${n === 1 ? '' : 's'}</div>
      <div class="card-title ${myRank === 1 ? 'ace' : ''}">${myRank === 1 ? (tied ? 'Joint winner!' : 'You win!') : myRank ? `You came ${tied ? 'joint ' : ''}${ordinal(myRank)}` : 'Results'}</div>
      <ol class="net-podium">${rows.map((s, k) => `<li class="p${ranks[k]} ${s.i === r.you ? 'you' : ''}"><span class="pl">${ordinal(ranks[k])}</span><i class="dot" style="background:${s.color}"></i><span class="nm">${esc(s.name)}${s.kind === 'ai' ? ' <em>AI</em>' : ''}</span><b>${s.total}</b><small>${vsPar(s.total - parTot)}</small></li>`).join('')}</ol>
      <div class="net-scroll"><table class="scores net-holes"><tr><th>Hole</th>${r.opts.holes.map((h, i) => `<th>${i + 1}</th>`).join('')}<th>Tot</th></tr>
        <tr><td>Par</td>${r.opts.holes.map(h => `<td>${h.par}</td>`).join('')}<td>${parTot}</td></tr>
        ${rows.map(s => `<tr class="${s.i === r.you ? 'you' : ''}"><td class="nm"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</td>${s.scores.map((v, i) => `<td class="${v < r.opts.holes[i].par ? 'under' : v > r.opts.holes[i].par ? 'over' : ''}">${v}${s.picked[i] ? '*' : ''}</td>`).join('')}<td>${s.total}</td></tr>`).join('')}</table></div>
      <div class="card-note net-warn">${esc(CHEAT_WARNING)}</div>
      ${this.isHost() ? '<button class="btn primary" data-a="again">Play again</button>' : '<div class="card-note">The host can start another round.</div>'}
      <button class="btn ghost" data-a="leave">Leave room</button>`);
    if (myRank === 1) sfx.emit('holeInOne'); else sfx.emit('par');
    const again = c.querySelector('[data-a=again]');
    if (again) again.onclick = () => { sfx.emit('click'); again.disabled = true; this.net.again().catch(e => { again.disabled = false; console.warn(e); }); };
    c.querySelector('[data-a=leave]').onclick = () => { sfx.emit('click'); this.leave(); };
  }

  confirmLeave() {
    const playing = this.room?.state === 'playing';
    const c = this.card('confirm', `<div class="card-title">Leave the room?</div>
      <div class="card-note">${playing ? 'A ghost AI will finish your round for you. You can’t come back to this round.' : 'You can join another room afterwards.'}</div>
      <button class="btn primary" data-a="stay">Stay</button><button class="btn ghost" data-a="leave">Leave</button>`);
    c.querySelector('[data-a=stay]').onclick = () => { sfx.emit('click'); this.hideCard(); if (this.room.phase === 'board') this.showBoard(); else if (this.room.state === 'ended') this.showResults(); };
    c.querySelector('[data-a=leave]').onclick = () => { sfx.emit('click'); this.leave(); };
  }
  async leave() {
    try { await this.net.leaveRoom(); } catch { /* offline: the server times us out */ }
    this.end('left');
  }

  async end(reason) {
    if (this.ended) return;
    this.ended = true;
    this.offs.forEach(f => f()); this.offs = [];
    clearInterval(this._cardT);
    this.driver?.dispose();
    const room = this.room;
    if (this.round) { this.round.dispose(); this.round = null; }
    this.hooks.setRound(null);
    this.el?.root.remove(); this.el = null;
    await this.hooks.leave();
    this.onEnd?.(reason, room);
  }
}

function scoreLabel(strokes, par, picked) {
  if (picked) return 'Picked up';
  if (strokes === 1) return 'Hole in one!';
  return { '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey' }[strokes - par] ?? `${strokes} strokes`;
}

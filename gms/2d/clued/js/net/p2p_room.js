// Device-hosted room logic: a port of server/rooms.go + scoring.go so the host's tab can be the room
// server. Pure (no DOM, no network), so tools/p2p_test.mjs runs it in node. State shape = the server's.
import { stageMultiplier, withStreak, progressiveLimit, stageExtendMs, PROGRESSIVE_CAP } from '../core/scoring.js?v=202610071327';
export { stageMultiplier, withStreak };

export const MAX_PLAYERS = 8;
export const LEAD_IN_MS = 3000;
export const GRACE_MS = 500;
export const ONLINE_MS = 6000;           // a dropped data channel counts as online this long (refresh/rejoin)
const DEFAULT_ANSWER = 10000, DEFAULT_GAP = 5000, KIDS_ANSWER = 20000, MAX_BASE = 500;
export const KIDS_STAGE_MS = 4000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ANSWER_CHOICES = [3, 5, 10, 15, 20, 30], GAP_CHOICES = [3, 5, 10];

export const PARTIAL = new Set(['ladder', 'pin-drop', 'number', 'blitz60', 'match', 'connect', 'sort', 'neighbours', 'order', 'chain']);
export const LONG = { connect: 120000, blitz60: 60000, match: 60000, ladder: 60000, sort: 45000, neighbours: 45000, order: 40000, chain: 60000, 'pin-drop': 30000, type: 30000 };

const rnd = (alpha, n, rand) => Array.from({ length: n }, () => alpha[Math.floor(rand() * alpha.length)]).join('');
export const newCode = (rand = Math.random) => rnd(CODE_ALPHABET, 5, rand);
const newKey = rand => rnd('abcdefghijklmnopqrstuvwxyz0123456789', 24, rand);

export const stagesOf = q => (q && Number(q.stages) >= 2 ? Math.min(20, Math.floor(Number(q.stages))) : 0);

// Base points before the streak bonus (scoring.go basePoints, plus the stage multiplier).
export function basePoints(format, correct, clientPoints, ms, limitMs, timed, mult = 1) {
  let base;
  if (PARTIAL.has(format) && typeof clientPoints === 'number') {
    base = !Number.isFinite(clientPoints) || clientPoints < 0 ? 0 : Math.min(clientPoints, MAX_BASE);
  } else if (!correct) base = 0;
  else if (!timed || limitMs <= 0) base = 100;
  else base = Math.min(MAX_BASE, 100 + Math.round(400 * Math.max(0, limitMs - ms) / limitMs));
  return Math.round(base * mult);
}


// mc (index) and tf (bool) are re-checked; everything else trusts the client's claim.
export function verifyCorrect(q, given, claimed) {
  if (!q || (q.format !== 'mc' && q.format !== 'tf') || q.answer == null || given == null) return !!claimed;
  const a = q.answer, g = given;
  if (typeof a === 'string' && typeof g === 'string') return a.trim().toLowerCase() === g.trim().toLowerCase();
  if (typeof a === 'boolean' && typeof g === 'boolean') return a === g;
  if (typeof a === 'number' && typeof g === 'number') return a === g;
  return !!claimed;
}

export function specInfo(spec) {
  let kids = !!spec?.kids, diff = spec?.difficulty || 0;
  for (const r of spec?.rounds || []) {
    kids = kids || !!r?.opts?.kids;
    if (!diff) diff = r?.difficulty || 0;
  }
  return { kids, diff: kids ? 1 : diff };
}

const BAD_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f<>]', 'g');
const tidy = s => String(s || '').replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, 20);

function dedupe(name, taken) {
  if (!taken(name)) return name;
  for (let n = 2; ; n++) {
    const suf = ` ${n}`, c = name.slice(0, 20 - suf.length).trim() + suf;
    if (!taken(c)) return c;
  }
}

const err = (code, message) => ({ error: code, message: message || code.replace(/_/g, ' ') });

export class P2PRoom {
  constructor({ code, spec = {}, title = '', questions = [], answerSec, gapSec, lateJoin = true, maxPlayers = MAX_PLAYERS, now = Date.now, rand = Math.random, onChange = null } = {}) {
    this.now = now; this.rand = rand; this.onChange = onChange;
    this.code = code || newCode(rand);
    this.maxPlayers = maxPlayers;
    this.players = []; this.hostId = ''; this.nextOrder = 0;
    this.phase = 'lobby'; this.q = -1; this.qStart = 0; this.qDeadline = 0; this.revealAt = 0;
    this.auto = true; this.revealMs = DEFAULT_GAP; this.answerMs = DEFAULT_ANSWER;
    this.ver = 0; this.game = 0; this.noLate = !lateJoin; this.closed = false;
    this.stage = 0; this.stageAt = 0; this.votes = new Set(); this.locked = false;
    this.load(spec, title, questions);
    if (this.kids) this.answerMs = KIDS_ANSWER;
    this.setTiming(answerSec, gapSec);
  }

  load(spec, title, questions) {
    this.spec = spec || {}; this.title = tidy(title).slice(0, 60) || ''; this.questions = questions || [];
    const { kids, diff } = specInfo(this.spec);
    this.kids = kids; this.diff = diff;
  }

  limitFor(q) {
    let ms = this.answerMs > 0 ? this.answerMs : DEFAULT_ANSWER;
    const long = LONG[q?.format];
    if (long && long > ms) ms = long;
    return stagesOf(q) ? Math.max(ms, progressiveLimit(this.answerMs)) : ms;
  }

  // Progressive questions stretch their deadline as stages open; the ring re-targets (scoring keeps the initial limit).
  curLimit() { const q = this.questions[this.q]; return stagesOf(q) ? this.qDeadline - this.qStart : this.limitFor(q); }

  setTiming(answerSec, gapSec) {
    if (ANSWER_CHOICES.includes(answerSec)) this.answerMs = answerSec * 1000;
    if (gapSec === 0) this.auto = false;
    else if (GAP_CHOICES.includes(gapSec)) { this.auto = true; this.revealMs = gapSec * 1000; }
  }

  changed() { this.ver++; this.onChange && this.onChange(this); }
  player(id) { return this.players.find(p => p.id === id) || null; }
  byKey(key) { return key ? this.players.find(p => p.key === key) || null : null; }
  active() { return this.players.filter(p => !p.gone); }
  isOnline(p, now = this.now()) { return !p.gone && (p.local || p.conns > 0 || now - p.seen < ONLINE_MS); }

  addPlayer(rawName, { local = false } = {}) {
    const name0 = tidy(rawName);
    if (!name0) return err('name_required', 'Type a name first.');
    if (this.closed) return err('room_not_found');
    if (this.noLate && (this.phase === 'question' || this.phase === 'reveal')) return err('started');
    const act = this.active();
    if (act.length >= this.maxPlayers) return err('room_full');
    const name = dedupe(name0, n => act.some(p => p.name.toLowerCase() === n.toLowerCase()));
    const joinedQ = this.phase === 'question' || this.phase === 'reveal' ? this.q + 1 : this.phase === 'final' ? this.questions.length : 0;
    const p = { id: rnd(CODE_ALPHABET, 6, this.rand), name, key: newKey(this.rand), score: 0, correct: 0, streak: 0, best: 0,
      joinedQ, order: this.nextOrder++, answers: {}, gone: false, kicked: false, seen: this.now(), conns: 0, local };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.changed();
    return { player: p };
  }

  rejoin(key) {
    const p = this.byKey(key);
    if (!p) return err('bad_key');
    if (p.kicked) return err('kicked');
    p.gone = false; p.seen = this.now();
    this.changed();
    return { player: p };
  }

  // Data channel open/close bookkeeping (online dots, early end).
  connect(p, delta) { p.conns = Math.max(0, p.conns + delta); p.seen = this.now(); this.changed(); }

  start() { if (this.phase !== 'lobby') return err('already_started'); this.advance(); return {}; }

  advance() {
    const now = this.now();
    this.stage = 0; this.votes = new Set(); this.locked = false;
    if (this.q + 1 >= this.questions.length) return this.finish();
    this.q++;
    this.phase = 'question';
    this.qStart = now + LEAD_IN_MS;
    this.stageAt = this.qStart;
    this.qDeadline = this.qStart + this.limitFor(this.questions[this.q]);
    this.revealAt = 0;
    this.changed();
  }

  reveal() {
    this.phase = 'reveal';
    this.revealAt = this.now() + this.revealMs;
    for (const p of this.players) if (!p.gone && p.joinedQ <= this.q && !p.answers[this.q]) p.streak = 0;
    this.changed();
  }

  finish() {
    this.phase = 'final';
    this.qStart = this.qDeadline = this.revealAt = 0;
    this.changed();
  }

  // Eligible = online players who joined before this question.
  eligible(now = this.now()) { return this.players.filter(p => p.joinedQ <= this.q && this.isOnline(p, now)); }

  allAnswered(now = this.now()) {
    const e = this.eligible(now);
    return e.length > 0 && e.every(p => p.answers[this.q]);
  }

  // Connected players who can still answer this question, and how many of them voted.
  voteNeed(now = this.now()) {
    let votes = 0, needed = 0;
    for (const p of this.eligible(now)) {
      if (p.answers[this.q]) continue;
      needed++;
      if (this.votes.has(p.id)) votes++;
    }
    return { votes, needed };
  }

  // Advance and extend: deadline = max(current, now + max(5 s, answer/2)), never past start + 90 s.
  setStage(st, now = this.now()) {
    this.stage = st; this.stageAt = now; this.votes = new Set();
    const ext = now + stageExtendMs(this.answerMs);
    this.qDeadline = Math.min(Math.max(this.qDeadline, ext), this.qStart + PROGRESSIVE_CAP);
    this.changed();
  }

  checkVotes(now = this.now()) {
    const { votes, needed } = this.voteNeed(now);
    if (needed > 0 && votes >= needed) { this.setStage(this.stage + 1, now); return true; }
    return false;
  }

  vote(p, q) {
    const now = this.now(), n = stagesOf(this.questions[this.q]);
    if (this.phase !== 'question' || q !== this.q) return err('not_open');
    if (!n) return err('not_progressive');
    if (now < this.qStart) return err('not_open');
    if (this.locked) return err('locked');
    if (this.stage >= n - 1) return err('last_stage');
    if (p.joinedQ > this.q || p.answers[this.q]) return err('cannot_vote');
    this.votes.add(p.id);
    this.changed();
    const advanced = this.checkVotes(now);
    return { advanced, stage: this.stage, deadline: this.qDeadline };
  }

  answer(p, a) {
    const now = this.now();
    if (this.phase !== 'question' || a.q !== this.q) return err('not_open');
    if (p.joinedQ > this.q) return err('late_join');
    if (p.answers[this.q]) return err('already_answered');
    if (now < this.qStart - 500) return err('not_open');
    if (now > this.qDeadline + GRACE_MS) return err('too_late');
    const q = this.questions[this.q], limit = this.limitFor(q);
    const serverMs = now - this.qStart;
    let ms = serverMs;
    if (typeof a.ms === 'number' && a.ms >= 0 && a.ms <= serverMs + 300) ms = Math.round(a.ms);
    ms = Math.max(0, Math.min(ms, limit));
    const correct = verifyCorrect(q, a.given, a.correct);
    const n = stagesOf(q);
    const stage = n ? this.stage : 0;
    const base = basePoints(q?.format, correct, typeof a.points === 'number' ? a.points : undefined, ms, limit, !this.kids, stageMultiplier(stage, n));
    if (correct) { p.streak++; p.correct++; p.best = Math.max(p.best, p.streak); } else p.streak = 0;
    const pts = correct ? withStreak(base, p.streak) : base;
    const given = JSON.stringify(a.given ?? null).length > 2048 ? null : a.given;
    const rec = { given, correct, points: pts, ms, stage };
    p.answers[this.q] = rec;
    p.score += pts;
    p.seen = now;
    if (n) this.locked = true;
    if (this.allAnswered(now)) this.reveal(); else this.changed();
    return { answer: rec };
  }

  remove(p, kicked = false) {
    p.gone = true;
    p.kicked = p.kicked || kicked;
    this.changed();
  }

  hostAction(p, action, extra = {}) {
    if (p.id !== this.hostId || p.gone) return err('not_host');
    switch (action) {
      case 'start': return this.start();
      case 'next':
        if (this.phase === 'lobby' || this.phase === 'reveal') this.advance();
        else if (this.phase === 'question') this.reveal();
        else return err('finished');
        return {};
      case 'end': this.finish(); return {};
      case 'kick': {
        const t = this.player(extra.playerId);
        if (!t || t.gone || t.id === p.id) return err('no_player');
        this.remove(t, true);
        return {};
      }
      case 'host': return err('not_supported', 'The host is the device running the room.');
      case 'settings':
        if (this.phase === 'question' && extra.answerSec != null) return err('in_question', 'Change the answer time between questions.');
        if (typeof extra.auto === 'boolean') this.auto = extra.auto;
        this.setTiming(extra.answerSec, extra.gapSec);
        if (typeof extra.lateJoin === 'boolean') this.noLate = !extra.lateJoin;
        this.changed();
        return {};
      case 'again': {
        if (!Array.isArray(extra.questions) || !extra.questions.length) return err('bad_questions');
        this.players = this.players.filter(x => !x.gone);
        for (const x of this.players) Object.assign(x, { score: 0, correct: 0, streak: 0, best: 0, joinedQ: 0, answers: {} });
        this.load(extra.spec, extra.title, extra.questions);
        Object.assign(this, { phase: 'lobby', q: -1, qStart: 0, qDeadline: 0, revealAt: 0, stage: 0, votes: new Set(), locked: false });
        this.game++;
        this.changed();
        return {};
      }
      default: return err('not_found');
    }
  }

  // Host leaving: the game ends for everyone with the scores so far.
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.phase !== 'final') this.finish(); else this.changed();
  }

  // Clock-driven transitions; call every ~250 ms.
  tick(now = this.now()) {
    if (this.closed) return;
    if (this.phase === 'question') {
      const n = stagesOf(this.questions[this.q]);
      if (n && !this.locked && this.stage < n - 1 && now >= this.qStart) {
        if (this.kids && now - this.stageAt >= KIDS_STAGE_MS) this.setStage(this.stage + 1, now);
        else if (this.votes.size) this.checkVotes(now);   // a non-voter dropped: the rest may now be enough
      }
      if (now > this.qDeadline + GRACE_MS) this.reveal();
      else if (now >= this.qStart && this.allAnswered(now)) this.reveal();
    } else if (this.phase === 'reveal' && this.auto && this.revealAt && now >= this.revealAt) this.advance();
  }

  question(p, i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.questions.length || (i > this.q + 1 && p.id !== this.hostId)) return err('not_yet');
    return { i, game: this.game, question: this.questions[i] };
  }

  peek() {
    return { code: this.code, phase: this.phase, players: this.active().length, host: this.player(this.hostId)?.name || '',
      title: this.title, total: this.questions.length, q: this.q, max: this.maxPlayers, closed: this.closed };
  }

  stateFor(viewer) {
    const now = this.now();
    const inQ = this.phase === 'question' || this.phase === 'reveal';
    const q = inQ ? this.questions[this.q] : null;
    const n = stagesOf(q);
    const s = { code: this.code, ver: this.ver, now, phase: this.phase, q: this.q, total: this.questions.length, game: this.game,
      auto: this.auto, answerSec: this.answerMs / 1000, gapSec: this.auto ? this.revealMs / 1000 : 0, title: this.title,
      kids: this.kids, difficulty: this.diff, public: false, lateJoin: !this.noLate, spec: this.spec, hostId: this.hostId,
      answered: 0, players: [], p2p: true };
    if (inQ) Object.assign(s, { qStart: this.qStart, qDeadline: this.qDeadline, limitMs: this.curLimit() });
    if (this.phase === 'reveal' && this.auto) s.revealAt = this.revealAt;
    if (n) Object.assign(s, { stages: n, stage: this.stage, locked: this.locked, ...this.voteNeed(now) });
    if (this.closed) s.closed = true;
    const showLast = this.phase === 'reveal' || this.phase === 'final';
    let act = this.active();
    if (showLast) act = act.slice().sort((a, b) => b.score - a.score || a.order - b.order);
    for (const p of act) {
      const a = this.q >= 0 ? p.answers[this.q] : null;
      const row = { id: p.id, name: p.name, score: p.score, correct: p.correct, streak: p.streak, best: p.best,
        online: this.isOnline(p, now), host: p.id === this.hostId, answered: !!a };
      if (this.q >= 0 && p.joinedQ > this.q) row.late = true;
      if (a) { s.answered++; if (showLast) row.last = { correct: a.correct, points: a.points, ms: a.ms }; }
      s.players.push(row);
    }
    if (viewer) {
      const a = this.q >= 0 ? viewer.answers[this.q] : null;
      s.you = { id: viewer.id, name: viewer.name, host: viewer.id === this.hostId, joinedQ: viewer.joinedQ,
        rank: 1 + act.filter(p => p.score > viewer.score).length };
      if (this.votes.has(viewer.id)) s.you.voted = true;
      if (viewer.kicked) s.you.kicked = true;
      if (viewer.gone) s.you.gone = true;
      if (a) { s.you.last = { correct: a.correct, points: a.points, ms: a.ms }; if (a.stage) s.you.stage = a.stage; }
    }
    return s;
  }

  // Host refresh: the room survives in sessionStorage and resumes under the same peer id.
  snapshot() {
    const { code, players, hostId, nextOrder, phase, q, qStart, qDeadline, revealAt, stageAt, auto, revealMs, answerMs, ver, game, noLate, stage, locked, spec, title, questions } = this;
    return { code, players: players.map(p => ({ ...p, conns: 0 })), hostId, nextOrder, phase, q, qStart, qDeadline, revealAt, stageAt, auto, revealMs,
      answerMs, ver, game, noLate, stage, locked, votes: [...this.votes], spec, title, questions };
  }

  static restore(snap, opts = {}) {
    const r = new P2PRoom({ ...opts, code: snap.code, spec: snap.spec, title: snap.title, questions: snap.questions });
    const { votes, players, ...rest } = snap;
    Object.assign(r, rest, { votes: new Set(votes || []), players: players.map(p => ({ ...p, conns: 0, seen: r.now() })) });
    return r;
  }
}

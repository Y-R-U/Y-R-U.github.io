// One online round. The master's browser runs the real Match; every other browser sends its
// stick and taps, and draws what the master streams back.
//
// Master: guest inputs apply on arrival (they have already travelled half a round trip), and
// the master's OWN inputs are held back by the same half round trip, so hosting is not an
// advantage. Snapshots go out 30 times a second; every fx/sfx/announcement call the master's
// Match makes is recorded and replayed on the guests, so a hit looks and sounds the same.
//
// Guest: opponents are drawn from snapshots interpolated a little in the past (the buffer
// adapts to measured jitter). The guest's own fighter is simulated locally from its own
// input — walking, jumping, ducking and swinging all respond at once — and nudged toward the
// master's position. Whenever the master says it is not simply standing (hit, floored,
// getting up, dead) the master's body is drawn instead, and prediction resumes once it is up.

import { Match } from '../match.js';
import { Fighter } from '../fighter.js';
import { Projectile } from '../projectile.js';
import { derive, MOVE_SETS, moveStats, ranksFor, SHEET_W, GROUND_Y } from '../config.js';
import { sfx } from '../audio.js';
import * as haptic from '../haptic.js';
import { NPTS } from '../ragdoll.js';
import { handText } from '../ui.js';
import * as W from './wire.js';
import * as Modes from './modes.js';
import { ObjectiveBrain, objectiveFor } from './objective.js';

const STEP = 1 / 120;
const SNAP_MS = 1000 / 30;
const INPUT_MS = 1000 / 30;
const COUNTDOWN = 3;
const END_HOLD = 2.2;            // seconds of slow-mo before a round is reported
const MAX_SELF_DELAY = 100;      // ms; the master never handicaps itself more than this
const BODY_R = 19;
const LIGHT = MOVE_SETS.light;
const SLOT_RANK = [3, 6, 1, 7, 2, 5, 4, 8];
// No yellow in Steal the Bandana: the golden bandana has to be the only gold on the page.
const SLOT_RANK_GOLDLESS = [3, 6, 4, 7, 2, 5, 8, 0];
const READY_WAIT = 5000;         // ms the master waits for every guest before starting anyway
const RTT_EVERY = 2000;
const STRIKE_BUFFER = 0.15;     // s: a tap just before a swing ends still lands, on every screen
const STALL_MS = 3000;           // no master snapshot for this long: tell the server
const STALL_EVERY = 2000;
const qs = new URLSearchParams(location.search);

/** The gesture slots a save owns in ANY move set — online everyone fights with LIGHT's kinds. */
export function loadoutOf(save) {
  const out = new Set([0]);
  for (const set of Object.values(MOVE_SETS)) {
    for (const m of set) if (save?.moves?.[m.id]?.owned) out.add(W.GESTURES.indexOf(m.gesture));
  }
  out.delete(-1);
  return [...out].sort((a, b) => a - b);
}

/** Same body for everyone, no perks: specials you own, at their base strength. */
export function pvpSave(loadout) {
  const moves = {};
  for (const i of loadout || [0]) {
    const m = LIGHT.find((x) => x.gesture === W.GESTURES[i]);
    if (m) moves[m.id] = { owned: true, power: 0, cd: 0 };
  }
  return { theme: 'light', perks: {}, moves, settings: {}, seen: { punch: true, power: true }, carryDark: false };
}

/** The gesture slots a pvpSave can use: what a keyframe carries so a new master knows everyone's moves. */
export function loadoutOfPvp(save) {
  return Object.keys(save?.moves || {}).map((id) => W.GESTURES.indexOf(LIGHT.find((m) => m.id === id)?.gesture)).filter((i) => i >= 0).sort((a, b) => a - b);
}

export function arenaLevel(seed, mode = 'duel') {
  return { idx: 200 + (seed % 6), tier: 0, kind: 'arena', event: null, enemies: [], reward: 0,
    dojo: 'The Arena', title: mode === 'duel' ? 'best of three' : Modes.MODES[mode].name.toLowerCase() };
}

const moveFor = (save, slot) => {
  const m = LIGHT.find((x) => x.gesture === W.GESTURES[slot]);
  return m ? moveStats(save, m.id) : null;
};

/**
 * How each mode is won lives in modes.js: `verdict` reads a quantised view that the master
 * builds from its Match and a guest builds from the master's last snapshot, so an honest
 * table always reports the same thing. Scores are per slot and travel in every snapshot.
 */
export const RULES = Object.fromEntries(Object.keys(Modes.MODES).map((k) => [k, {
  verdict: (m, timeUp) => Modes.verdict(Modes.viewOf(m, timeUp)),
  update: (m, dt) => Modes.update(m, dt),
}]));

export class PvpMatch extends Match {
  constructor(o) {
    super({ level: o.level, save: o.saves[o.you] });
    this.saves = o.saves;
    this.you = o.you;
    const mode = Modes.MODES[o.mode] ? o.mode : 'duel';
    const n = o.seats.length;
    const R = ranksFor('light');
    const ranks = mode === 'bandana' ? SLOT_RANK_GOLDLESS : SLOT_RANK;
    const xs = mode === 'duel' ? null : Modes.spawnXs(n, o.seed || 0);
    this.all = o.seats.map((s, i) => {
      const stats = derive(this.saves[i]);
      const x = xs ? xs[i] : n === 1 ? SHEET_W / 2 : 560 + (SHEET_W - 1120) * (i / (n - 1));
      const f = new Fighter({
        isPlayer: i === o.you, name: i === o.you ? 'YOU' : s.name, rank: R[ranks[i] % R.length],
        hp: stats.maxHp * (o.hpScale || 1), dmg: 8 * stats.atkMul, speed: stats.speed, jump: stats.jump,
        scale: 1, facing: x < SHEET_W / 2 ? 1 : -1, stats,
      });
      f.place(x, GROUND_Y);
      f.slot = i;
      f.netName = s.name;
      return f;
    });
    this.player = this.all[o.you];
    this.enemies = this.all.filter((f) => f !== this.player);
    // Match.build() sets these; ours replaces it. A NaN camera draws an empty page.
    this.camX = SHEET_W / 2; this.camY = GROUND_Y - 200; this.camZ = 1;
    this.phase = W.PHASE.WAIT;
    this.clock = COUNTDOWN;
    this.roundSecs = o.roundSecs || Modes.MODES[mode].secs;
    this.timeUp = false;
    this.verdict = null;
    this.rules = RULES[mode];
    this.scores = this.all.map(() => 0);
    Modes.setup(this, mode);
    this.hazards.push(new Modes.ModeLayer(this));
    this.onLand = (a, t, def) => Modes.onLand(this, a, t, def);
  }

  build() { this.all = []; this.enemies = []; this.brains = []; this.player = null; }
  updateCoach() { this.coach = null; }

  begin() { this.phase = W.PHASE.COUNT; this.clock = COUNTDOWN; this.say('3', 0.9); }

  update(dt) {
    if (this.phase === W.PHASE.COUNT) {
      const was = Math.ceil(this.clock);
      this.clock -= dt;
      const now = Math.ceil(this.clock);
      if (this.clock <= 0) { this.phase = W.PHASE.FIGHT; this.clock = this.roundSecs; this.say('FIGHT!', 1.2); }
      else if (now !== was) this.say(String(now), 0.9);
    } else if (this.phase === W.PHASE.FIGHT) {
      this.clock = Math.max(0, this.clock - dt);
      if (!this.over) this.rules.update(this, dt);
      this.bufferedStrikes();
    }
    // Online, hit-stop is only a picture: the sim never pauses, because a guest predicting its
    // own swing cannot see the master's freeze coming. Screens hold the frame instead (main.js).
    const hs = this.fx.hitstop;
    this.fx.hitstop = 0;
    super.update(dt, null);
    this.fx.hitstop = Math.max(this.fx.hitstop, hs - dt);
  }

  /** A tap that lands while the fighter is still busy waits up to STRIKE_BUFFER for it to free up. */
  bufferedStrikes() {
    if (!this.strikeQ) return;
    for (const slot of Object.keys(this.strikeQ)) {
      const f = this.all[slot], until = this.strikeQ[slot];
      if (!f || f.gone || this.time > until) { delete this.strikeQ[slot]; continue; }
      if (f.canAct && f.strike()) { sfx.whoosh(); delete this.strikeQ[slot]; }
    }
  }

  /** Applies one player's action on the master. Specials are checked against what they own. */
  act(slot, a) {
    const f = this.all[slot];
    if (!f || f.gone || this.phase !== W.PHASE.FIGHT || this.over) return;
    if (a === W.ACT.STRIKE) {
      if (f.strike()) sfx.whoosh();
      else if (!f.dead) (this.strikeQ = this.strikeQ || {})[slot] = this.time + STRIKE_BUFFER;
      return;
    }
    if (a === W.ACT.JUMP) { f.jump(); return; }
    const m = moveFor(this.saves[slot], a - W.ACT.SPECIAL);
    if (m && f.special(m)) {
      sfx.whoosh();
      this.fx.text(f.x, f.y - 165, m.name, { col: '#2f6ad0', size: 26 });
    }
  }

  /** Once the round is decided nobody can change it: a quit during the slow-mo is not an elimination. */
  eliminate(slot) { if (!this.over) Modes.eliminate(this, slot); }

  checkEnd(dt) {
    if (this.over) { this.endT += dt; return; }
    if (this.phase !== W.PHASE.FIGHT) return;
    const timeUp = this.clock <= 0;
    Modes.stampOuts(this);
    const v = this.rules.verdict(this, timeUp);
    if (!v) return;
    if (v.overtime) {
      this.overtime = true;
      this.clock = this.modeDef.overtime;
      this.say('OVERTIME!', 2);
      sfx.ko();
      return;
    }
    this.finishWith(v, timeUp);
  }

  finishWith(v, timeUp) {
    // Freeze the outcome: nothing that lands during the slow-mo may change what everyone reports.
    for (const f of this.all) f.invuln = 1e9;
    this.over = true;
    this.phase = W.PHASE.OVER;
    this.timeUp = timeUp;
    this.result = 'pvp';
    this.verdict = v;
    this.endT = 0;
    this.slowmo = 1.4;
    sfx.ko();
    const w = this.all[v.winner];
    const [kx] = (w ? (this.ffa ? w : this.all.find((f) => f !== w) || w) : this.player).rag.centre();
    const word = this.ffa ? (w ? (w === this.player ? 'YOU WIN!' : `${w.netName} WINS`) : 'DRAW')
      : v.ko ? 'K.O.' : v.winner < 0 ? 'DRAW' : 'TIME!';
    this.fx.text(kx, GROUND_Y - 190, word, { col: '#c0392b', size: this.ffa ? 52 : 64, life: 2.2, vy: -30 });
    this.fx.shakeBy(20);
  }
}

// ── keyframes ─────────────────────────────────────────────────────────────
// Everything needed to rebuild a Match from scratch on another browser and carry on: what
// host migration (multi-player modes) will use when the master drops. Snapshots are the
// 30/s drawing stream; a keyframe goes out once a second on the reliable lane.
const F_KEYS = ['x', 'y', 'vx', 'vy', 'facing', 'onGround', 'hp', 'maxHp', 'mode', 'gain', 'staggerT', 'downT',
  'getupT', 'hitFlash', 'invuln', 'blocking', 'guardBroken', 'duckDrop', 'dead', 'anim', 'animT', 'spin',
  'comboIdx', 'comboWindow', 'combo', 'comboTimer', 'stunT', 'launchFrom', 'poseLock', 'brokeGuard', 'tailPhase',
  'gone', 'out', 'respawnT'];
// Full precision: rounding a timer by a millisecond moves the frame an attack ends on.
const r3 = (v) => v;

export function matchState(m) {
  return {
    v: 1, time: r3(m.time), phase: m.phase, clock: r3(m.clock), timeUp: m.timeUp, over: m.over,
    scores: m.scores.slice(), verdict: m.verdict, endT: r3(m.endT), slowmo: r3(m.slowmo), hitstop: r3(m.fx.hitstop),
    mode: m.modeId, overtime: !!m.overtime, outSeq: m.outSeq | 0, obj: m.obj ? { ...m.obj } : null,
    lo: (m.saves || []).map(loadoutOfPvp),
    fighters: m.all.map((f) => {
      const o = {};
      for (const k of F_KEYS) o[k] = r3(f[k]);
      o.cd = Object.fromEntries(Object.entries(f.cd).map(([k, v]) => [k, r3(v)]));
      o.attack = f.attack ? { key: f.attack.key, def: f.attack.def, t: r3(f.attack.t), fired: f.attack.fired,
        hit: [...f.attack.hitSet].map((id) => m.all.findIndex((x) => x.id === id)), dive: !!f.attack.dive } : null;
      o.rag = ['x', 'y', 'px', 'py'].map((k) => Array.from(f.rag[k], r3));
      o.grounded = f.rag.grounded;
      return o;
    }),
    projs: m.projectiles.map((p) => ({ type: p.type, x: r3(p.x), y: r3(p.y), vx: r3(p.vx), vy: r3(p.vy), owner: m.all.indexOf(p.owner),
      dmg: p.dmg, kb: p.kb, life: r3(p.life), rot: r3(p.rot), spin: p.spin, bounces: p.bounces, fuse: r3(p.fuse), netId: p.netId })),
  };
}

export function applyState(m, st) {
  Object.assign(m, { time: st.time, phase: st.phase, clock: st.clock, timeUp: st.timeUp, over: st.over,
    scores: st.scores.slice(), verdict: st.verdict, endT: st.endT, slowmo: st.slowmo,
    overtime: !!st.overtime, outSeq: st.outSeq | 0, obj: st.obj ? { ...st.obj } : null });
  if (Array.isArray(st.lo) && m.saves) st.lo.forEach((lo, i) => { if (Array.isArray(lo)) m.saves[i] = pvpSave(lo); });
  m.fx.hitstop = st.hitstop || 0;
  st.fighters.forEach((o, i) => {
    const f = m.all[i];
    if (!f) return;
    for (const k of F_KEYS) f[k] = o[k];
    f.cd = { ...o.cd };
    f.attack = o.attack ? { key: o.attack.key, def: o.attack.def, t: o.attack.t, fired: o.attack.fired,
      hitSet: new Set(o.attack.hit.map((j) => m.all[j]?.id).filter(Boolean)), dive: o.attack.dive } : null;
    ['x', 'y', 'px', 'py'].forEach((k, j) => f.rag[k].set(o.rag[j]));
    f.rag.grounded = o.grounded;
  });
  m.projectiles = st.projs.map((p) => Object.assign(new Projectile({ type: p.type, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
    owner: m.all[p.owner], dmg: p.dmg, kb: p.kb }), { life: p.life, rot: p.rot, spin: p.spin, bounces: p.bounces, fuse: p.fuse, netId: p.netId, ownerSlot: p.owner }));
}

/** A scripted player for the headless gates: walks in, swings, ducks, jumps, casts — and plays the objective. */
function botInput(m, me, t, state) {
  const out = { moveX: 0, block: false, acts: [] };
  if (me.dead) return out;
  const g = objectiveFor(m, me);
  const pool = g ? g.targets : m.all.filter((f) => f !== me && !f.dead && !f.gone);
  const opp = pool.filter((f) => !f.dead).sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
  if (g && (!opp || Math.abs(opp.x - me.x) > 150 || g.flee)) {
    const dx = g.goX - me.x;
    out.moveX = Math.abs(dx) < 18 ? 0 : Math.sign(dx);
    if (t > state.next) {
      state.next = t + 0.28 + Math.random() * 0.25;
      const blocked = m.all.some((o) => o !== me && !o.dead && Math.sign(o.x - me.x) === out.moveX && Math.abs(o.x - me.x) < 70);
      if (blocked || (g.loose && m.obj && m.obj.y < me.y - 110 && Math.abs(m.obj.x - me.x) < 60)) out.acts.push(W.ACT.JUMP);
      else if (opp && Math.abs(opp.x - me.x) < 90) out.acts.push(W.ACT.STRIKE);
    }
    return out;
  }
  if (!opp) return out;
  const dx = opp.x - me.x, d = Math.abs(dx);
  out.moveX = d > 66 ? Math.sign(dx) : (Math.sin(t * 1.7 + state.seed) > 0.75 ? -Math.sign(dx) : 0);
  if (t > state.next) {
    state.next = t + 0.28 + Math.random() * 0.25;
    if (d < 95) out.acts.push(Math.random() < 0.18 ? W.ACT.SPECIAL : W.ACT.STRIKE);
    else if (Math.random() < 0.06) out.acts.push(W.ACT.JUMP);
  }
  out.block = d < 110 && Math.sin(t * 2.3 + state.seed) > 0.93;
  return out;
}

/** The game canvas's aspect, so a crowd's camera can fit everyone across the screen. */
function screenAspect() {
  const c = typeof document !== 'undefined' && document.getElementById ? document.getElementById('game') : null;
  return c && c.clientHeight ? c.clientWidth / c.clientHeight : 16 / 9;
}

/**
 * Damage taken per fighter, whole percent, from the quantised HP every client sees — part of the
 * agreed report, so the server can score how close a loss was (event points) without trusting anyone.
 */
export function dmgOf(mp, view) {
  return view.map((f) => Math.max(0, Math.min(100, Math.round(100 * (1 - f.hp / (mp.all[f.slot]?.maxHp || 100))))));
}

/** The mode block that rides on every snapshot. */
function modeBlock(mp) {
  return { mode: Modes.MODES[mp.modeId].id, overtime: mp.overtime, obj: mp.obj };
}

function hudLines(mp, extra) {
  const secs = Math.ceil(mp.phase === W.PHASE.FIGHT || mp.phase === W.PHASE.OVER ? mp.clock : mp.roundSecs);
  const time = `${mp.overtime ? 'OVERTIME ' : ''}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const left = mp.all.filter((f) => !f.dead && !f.gone).length;
  const title = mp.modeId === 'lms' ? `LAST MAN STANDING  ·  ${left} of ${mp.all.length} left`
    : mp.modeId === 'bandana' ? `STEAL THE BANDANA  ·  first to ${mp.modeDef.target}s`
    : 'KING OF THE HILL  ·  hold it alone';
  return { title, dojo: extra ? `${time}  ·  ${extra}` : time };
}

export class NetFight {
  /**
   * @param o {client, go, loadout, onReported(), onStall(why)}
   */
  constructor(o) {
    this.client = o.client;
    this.go = o.go;
    this.mode = Modes.MODES[o.go.mode] ? o.go.mode : 'duel';
    this.matchId = o.go.match;
    this.round = o.go.round;
    this.you = o.go.you;
    this.masterSlot = o.go.master;
    this.isMaster = this.you === this.masterSlot;
    this.ids = o.go.seats.map((s) => s.id);
    this.masterId = this.ids[this.masterSlot];
    this.gone = new Set((o.go.out || []).map((v, i) => (v ? i : -1)).filter((i) => i >= 0));
    this.onReported = o.onReported || (() => {});
    this.onStall = o.onStall || (() => {});
    const loadouts = o.go.seats.map((_, i) => (i === this.you ? o.loadout : [0, 1, 2, 3, 4, 5, 6, 7]));
    this.saves = loadouts.map(pvpSave);
    this.sheetLevel = arenaLevel(o.go.arena, this.mode);
    this.level = { ...this.sheetLevel };
    const dev = !!o.dev;
    this.bot = dev && qs.get('arenabot') === '1' ? { seed: Math.random() * 6, next: 0 } : null;
    this.match = new PvpMatch({
      level: this.level, saves: this.saves, you: this.you, seats: o.go.seats, mode: this.mode, seed: o.go.arena,
      hpScale: dev && +qs.get('arenahp') > 0 ? +qs.get('arenahp') : 1,
      roundSecs: dev && +qs.get('arenasecs') > 0 ? +qs.get('arenasecs') : 0,
    });
    this.match.net = this;
    this.match.hudSave = this.saves[this.you];
    for (const s of this.gone) this.match.eliminate(s);
    this.ready = new Set();
    this.acc = 0;
    this.reported = false;
    this.lastHeard = this.t0 = performance.now();
    this.lastSnap = 0; this.snapSeq = 0;
    this.lastInput = 0; this.inputSeq = 0; this.lastSent = null;
    this.actSeq = 0;
    this.pendingActs = [];
    this.ownQ = [];
    this.projId = 0;
    this.buf = [];
    this.offset = null; this.jitter = 0;
    this.hist = [];
    this.authority = true;
    this.liveRun = 0;
    this.predT = 0; this.strikeAt = 0;
    this.sentAt = new Map();
    this.corr = 0;
    this.lastRtts = 0;
    this.projViews = new Map();
    this.prevHp = null;
    this.m = {
      role: this.isMaster ? 'master' : 'guest', snaps: 0, snapT0: 0, underruns: 0, frames: 0,
      delay: 0, rtt: 0, direct: false, corrections: 0, reseeds: 0, maxErr: 0, sent: 0, shown: {}, made: {}, migrations: 0,
    };
    this._onData = (peer, bytes) => this.onData(peer, bytes);
    this.client.on('data', this._onData);
    if (this.isMaster) this.record();
    else this.sendReady();
    if (dev) window.__net = this;
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.readyT);
    this.client.off('data', this._onData);
    if (this.sfxOrig) Object.assign(sfx, this.sfxOrig);
    if (window.__net === this) window.__net = null;
  }

  // ── shared ──────────────────────────────────────────────────────────────
  peers() { return this.ids.filter((_, i) => i !== this.you && !this.gone.has(i)); }
  rtt() {
    // A guest only talks to the master; the master to everyone.
    let r = 0, direct = true;
    const ids = this.isMaster ? this.peers() : [this.masterId];
    for (const id of ids) { const l = this.client.link(id); if (l) { r = Math.max(r, l.rtt); direct = direct && l.direct; } else direct = false; }
    this.m.rtt = Math.round(r);
    this.m.direct = direct;
    return r;
  }

  onData(peer, bytes) {
    if (this.dead || !this.ids.includes(peer)) return;
    this.lastHeard = performance.now();
    const k = bytes[0];
    if (k === W.KIND.JSON) { const msg = W.unjson(bytes); if (msg && msg.round === this.round && msg.match === this.matchId) this.onEvent(peer, msg); return; }
    if (this.isMaster) {
      const slot = this.ids.indexOf(peer);
      if (k === W.KIND.INPUT) {
        const inp = W.unInput(bytes);
        const cur = this.remote?.[slot];
        // Unordered lane: never let an older stick position overwrite a newer one.
        inp.at = performance.now();
        if (!cur || ((inp.seq - cur.seq) & 0xffff) < 0x8000) (this.remote = this.remote || {})[slot] = inp;
      } else if (k === W.KIND.ACT) this.match.act(slot, W.unAct(bytes).a);
    } else if (k === W.KIND.SNAP && peer === this.masterId) {
      const s = W.unSnap(bytes);
      if (s) this.onSnap(s);
    }
  }

  onEvent(peer, e) {
    if (this.isMaster) {
      if (e.e === 'ready') {
        const slot = this.ids.indexOf(peer);
        this.saves[slot] = pvpSave(Array.isArray(e.loadout) ? e.loadout.filter((i) => i >= 0 && i < 8) : [0]);
        this.match.saves[slot] = this.saves[slot];
        this.ready.add(slot);
        this.broadcast({ e: 'begin' });
        if (this.match.phase === W.PHASE.WAIT && this.peers().every((id) => this.ready.has(this.ids.indexOf(id)))) this.match.begin();
      }
      return;
    }
    if (peer !== this.masterId) return;
    if (e.e === 'begin') { this.begun = true; clearTimeout(this.readyT); }
    else if (e.e === 'fx') this.replay(e.l);
    else if (e.e === 'state') this.keyframe = e.s;
    else if (e.e === 'end') this.guestEnd();
  }

  broadcast(obj, lane = 'r') {
    const b = W.json({ ...obj, match: this.matchId, round: this.round });
    for (const id of this.peers()) this.client.send(id, lane, b);
  }

  sendReady() {
    if (this.dead || this.begun || this.isMaster) return;
    this.client.send(this.masterId, 'r', W.json({ e: 'ready', match: this.matchId, round: this.round, loadout: loadoutOfPvp(this.saves[this.you]) }));
    this.readyT = setTimeout(() => this.sendReady(), 1000);
  }

  /** A resumed socket hears this round's go again: keep the fight, catch up on master and leavers. */
  resync(g) {
    this.suspended = false;
    (g.out || []).forEach((o, i) => { if (o) this.onOut(i); });
    if (g.master !== this.masterSlot) this.migrate(g.master);
  }

  /** A room master whose tab was hidden: the server has handed the room on. Step nothing until
   * the resumed socket's go says who runs it now (us, as a guest, in all likelihood). */
  suspend() { if (this.mode !== 'duel' && this.isMaster) this.suspended = true; }

  /** The server: this seat left (or never came back). Its fighter is out for good. */
  onOut(slot) {
    if (slot === this.you || this.gone.has(slot)) return;
    this.gone.add(slot);
    if (this.isMaster) this.match.eliminate(slot);
  }

  /**
   * The server picked a new master (the old one dropped). If it is us, rebuild the Match from
   * the last keyframe, bring it up to the newest snapshot, and carry on as master.
   */
  migrate(master, goneSlot = -1) {
    if (goneSlot >= 0 && goneSlot !== this.you) this.gone.add(goneSlot);
    if (master === this.masterSlot || master < 0 || master >= this.ids.length) return;
    const was = this.isMaster;
    this.masterSlot = master;
    this.masterId = this.ids[master];
    this.isMaster = this.you === master;
    this.m.role = this.isMaster ? 'master' : 'guest';
    this.m.migrations++;
    if (this.isMaster && !was) this.takeOver();
    else if (!this.isMaster) {
      if (was) this.unrecord();
      // A new clock to sync to, and a new body of truth for our own fighter. The feel numbers
      // restart too; the hand-over gap is measured on its own.
      this.gapFrom = this.buf.length ? this.buf[this.buf.length - 1].recv : performance.now();
      Object.assign(this.m, { snaps: 0, snapT0: 0, underruns: 0, frames: 0 });
      this.buf = []; this.offset = null; this.late = 0; this.jitter = 0;
      this.overSnap = null; this.overAt = 0; this.endHeard = false;
      this.authority = true; this.liveRun = 0; this.hist = []; this.begun = true;
      this.keyframe = null;
      clearTimeout(this.readyT);
    }
  }

  takeOver() {
    const mp = this.match;
    const B = this.buf, s = B[B.length - 1], prev = B[B.length - 2];
    if (this.keyframe) applyState(mp, this.keyframe);
    if (s) patchFromSnap(mp, s, prev);
    for (const slot of this.gone) mp.eliminate(slot);
    this.saves = mp.saves;
    this.record();
    this.remote = {};
    this.ready = new Set(this.ids.map((_, i) => i));
    this.begun = true;
    this.acc = 0;
    this.lastSnap = 0; this.lastKey = 0;
    this.ownQ = []; this.ownNow = null;
    this.projId = Math.max(0, ...mp.projectiles.map((p) => p.netId | 0));
    // The old master may have gone while the round was already decided.
    if (s && s.phase === W.PHASE.OVER && !mp.verdict) {
      const v = Modes.verdict(Modes.viewOfSnap(this.overSnap || s, this.mode)) || { winner: -1, ko: false };
      mp.over = true; mp.verdict = v; mp.endT = END_HOLD - 0.4;
    }
    if (mp.phase === W.PHASE.WAIT) mp.begin();
    this.broadcast({ e: 'state', s: matchState(mp) });
  }

  /** From main.js: a tap on the punch half, or a keyboard strike. */
  strike() { this.localAct(W.ACT.STRIKE); }
  gesture(g) { const i = W.GESTURES.indexOf(g); if (i >= 0) this.localAct(W.ACT.SPECIAL + i); }

  localAct(a) {
    const mp = this.match;
    if (mp.phase !== W.PHASE.FIGHT || mp.over || mp.player.dead) return;
    if (a >= W.ACT.SPECIAL && !moveFor(this.saves[this.you], a - W.ACT.SPECIAL)) {
      mp.fx.text(mp.player.x, mp.player.y - 150, 'NOT LEARNED', { col: '#9aa0ad', size: 22 });
      return;
    }
    if (this.isMaster) { this.pendingActs.push(a); return; }
    this.client.send(this.masterId, 'r', W.act(++this.actSeq, a));
    if (a >= W.ACT.SPECIAL) haptic.gesture();
    // Predict it: the swing starts on this screen now; the master decides what it hits.
    const me = mp.player;
    if (this.authority) return;
    if (a === W.ACT.STRIKE) { if (me.strike()) sfx.whoosh(); else this.strikeAt = this.predT + STRIKE_BUFFER; }
    else if (a === W.ACT.JUMP) me.jump();
    else { const m = moveFor(this.saves[this.you], a - W.ACT.SPECIAL); if (m && me.special(m)) sfx.whoosh(); }
  }

  /** Called every frame by main.js instead of Match.update. */
  step(dt, input) {
    if (this.dead) return;
    const now = performance.now();
    this.m.frames++;
    const mp = this.match;
    mp.aspect = screenAspect();
    let inp = input ? { moveX: input.moveX, block: input.block, acts: input.jump ? [W.ACT.JUMP] : [] } : { moveX: 0, block: false, acts: [] };
    if (this.bot && mp.phase === W.PHASE.FIGHT) {
      inp = botInput(mp, mp.player, mp.time, this.bot);
      inp.acts = inp.acts.map((a) => (a === W.ACT.SPECIAL ? W.ACT.SPECIAL + (Math.random() < 0.5 ? 0 : 1) : a));
    }
    if (this.suspended) return;
    if (this.isMaster) this.stepMaster(dt, now, inp);
    else this.stepGuest(dt, now, inp);
    this.client.pingLinks(now, 500);
    if (now - this.lastRtts > RTT_EVERY && this.mode !== 'duel') { this.lastRtts = now; this.client.sendRtts(this.matchId); }
    if (now - this.lastHeard > 10000 && !this.stalled) { this.stalled = true; this.onStall('stalled'); }
    if (!this.isMaster) this.watchMaster(now);
    const r = this.m.rtt;
    const net = this.peers().length ? (this.m.direct ? `${r} ms` : `relay ${r} ms · slower connection`) : '';
    if (this.mode === 'duel') {
      const score = this.go.score.slice();
      mp.level.title = `ROUND ${this.round}  ·  ${score[this.you]} – ${score[(this.you + 1) % score.length]}`;
      const secs = Math.ceil(mp.phase === W.PHASE.FIGHT || mp.phase === W.PHASE.OVER ? mp.clock : mp.roundSecs);
      mp.level.dojo = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}  ·  ` + net;
    } else Object.assign(mp.level, hudLines(mp, net));
  }

  /**
   * A guest whose master has gone quiet (tab hidden, phone locked, frozen) tells the server, which
   * decides: hand-over in a room, the 1v1 forfeit rule. Repeated while it lasts; ms 0 when it ends.
   */
  watchMaster(now) {
    const mp = this.match;
    // Just handed over: the new master's silence counts from the hand-over.
    const last = this.buf.length ? this.buf[this.buf.length - 1].recv : this.gapFrom || 0;
    const running = this.begun && last && !this.reported && (mp.phase === W.PHASE.COUNT || mp.phase === W.PHASE.FIGHT);
    const quiet = running ? now - last : 0;
    if (quiet > STALL_MS) {
      if (!this.stallSent || now - this.stallSent >= STALL_EVERY) { this.stallSent = now; this.m.stalls = (this.m.stalls || 0) + 1; this.client.stall(this.matchId, quiet); }
      this.masterQuiet = quiet;
    } else if (this.stallSent) {
      this.stallSent = 0; this.masterQuiet = 0;
      this.client.stall(this.matchId, 0);
    }
  }

  // ── master ──────────────────────────────────────────────────────────────
  record() {
    if (this.rec) return;
    const rec = this.rec = [];
    const fx = this.match.fx;
    this.fxOrig = {};
    for (const k of ['burst', 'shakeBy', 'stop', 'spawn', 'text', 'mark', 'scuff']) {
      const own = Object.prototype.hasOwnProperty.call(fx, k) ? fx[k] : undefined;
      this.fxOrig[k] = own;
      const orig = fx[k].bind(fx);
      fx[k] = (...a) => { rec.push(['fx', k, ...a]); return orig(...a); };
    }
    const say = this.match.say.bind(this.match);
    this.sayOrig = Object.prototype.hasOwnProperty.call(this.match, 'say') ? this.match.say : undefined;
    this.match.say = (t, s) => { rec.push(['say', t, s]); say(t, s); };
    this.sfxOrig = {};
    for (const k of Object.keys(sfx)) {
      if (typeof sfx[k] !== 'function') continue;
      const orig = this.sfxOrig[k] = sfx[k];
      sfx[k] = (...a) => { if (!this.dead) rec.push(['sfx', k, ...a]); return orig.apply(sfx, a); };
    }
  }

  /** Demoted to guest (a hand-over while we were hidden or stalled): stop recording for broadcast. */
  unrecord() {
    if (!this.rec) return;
    const fx = this.match.fx;
    for (const [k, v] of Object.entries(this.fxOrig || {})) { if (v === undefined) delete fx[k]; else fx[k] = v; }
    if (this.sayOrig === undefined) delete this.match.say; else this.match.say = this.sayOrig;
    if (this.sfxOrig) Object.assign(sfx, this.sfxOrig);
    this.rec = null; this.sfxOrig = null;
  }

  stepMaster(dt, now, inp) {
    const mp = this.match;
    if (mp.phase === W.PHASE.WAIT && (!this.peers().length || now - this.t0 > READY_WAIT)) mp.begin();
    const delay = Math.min(MAX_SELF_DELAY, this.rtt() / 2);
    this.m.delay = Math.round(delay);
    // Equalise: our own input waits half a round trip, as the guest's did on the way here.
    this.ownQ.push({ at: now, moveX: inp.moveX, block: inp.block, acts: [...inp.acts, ...this.pendingActs] });
    this.pendingActs = [];
    let own = this.ownNow || { moveX: 0, block: false };
    while (this.ownQ.length && this.ownQ[0].at <= now - delay) {
      const q = this.ownQ.shift();
      own = q;
      for (const a of q.acts) mp.act(this.you, a);
    }
    this.ownNow = own;
    for (const p of mp.projectiles) if (p.netId == null) { p.netId = ++this.projId & 0xff; p.ownerSlot = mp.all.indexOf(p.owner); }

    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      if (mp.phase === W.PHASE.FIGHT && !mp.over) {
        mp.all.forEach((f, i) => {
          // A player we have not heard from for half a second stands idle (dropped, tab hidden).
          const r = this.remote?.[i];
          const s = i === this.you ? own : (r && now - r.at < 500 ? r : { moveX: 0, block: false });
          f.move(s.moveX, STEP);
          f.setBlock(s.block);
        });
      }
      mp.update(STEP);
      this.acc -= STEP;
    }
    // Paced on an accumulator, not "time since last": at 60 fps the latter fires every third
    // frame (16.7 + 16.7 < 33.3) and the guest gets 20 snapshots a second instead of 30.
    if (mp.phase !== W.PHASE.WAIT && now - this.lastSnap >= SNAP_MS - 1) {
      this.lastSnap = Math.max(this.lastSnap + SNAP_MS, now - SNAP_MS);
      const seq = ++this.snapSeq & 0xffff;
      const fighters = mp.all.map((f, i) => ({
        slot: i, f, ack: this.remote?.[i]?.seq || 0, score: mp.scores[i],
        cds: W.GESTURES.map((g) => { const m = LIGHT.find((x) => x.gesture === g); return m ? f.cooldown(m.id) : 0; }),
      }));
      // Wall clock, not mp.time: slow-mo and hitstop stretch game time, and the guest
      // interpolates against arrival times.
      const b = W.snap(seq, (now - this.t0) / 1000, mp.phase, mp.clock, mp.timeUp, fighters, mp.projectiles, modeBlock(mp));
      for (const id of this.peers()) this.client.send(id, 'u', b);
      this.m.sent++;
      if (window.__net === this) this.m.made[seq] = Date.now();
      if (this.rec.length) this.flushRec();
      if (now - (this.lastKey || 0) >= 1000) { this.lastKey = now; this.broadcast({ e: 'state', s: matchState(mp) }); }
    }
    if (mp.over && mp.endT >= END_HOLD && !this.reported) {
      this.reported = true;
      if (this.rec.length) this.flushRec();
      this.broadcast({ e: 'end' });
      this.client.report(this.matchId, this.round, mp.verdict.winner, mp.verdict.ko, mp.verdict.place,
        dmgOf(mp, Modes.viewOf(mp, mp.timeUp).fighters));
      this.m.verdict = mp.verdict;
      if (window.__net === this) window.__lastVerdict = { ...mp.verdict, clock: mp.clock };
      this.onReported(mp.verdict);
    }
  }

  flushRec() {
    const round = (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
    let l = this.rec.splice(0);
    if (l.length > 160) l = l.filter((e) => e[1] !== 'scuff' && e[1] !== 'spawn').slice(-160);
    this.broadcast({ e: 'fx', l: JSON.parse(JSON.stringify(l, round)) });
  }

  // ── guest ───────────────────────────────────────────────────────────────
  replay(list) {
    const mp = this.match;
    for (const [kind, k, ...a] of list || []) {
      if (kind === 'fx' && typeof mp.fx[k] === 'function') mp.fx[k](...a);
      else if (kind === 'say') mp.say(k, a[0]);
      else if (kind === 'sfx' && typeof sfx[k] === 'function' && k !== 'whoosh') sfx[k](...a);
    }
  }

  onSnap(s) {
    const now = performance.now();
    if (!this.m.snapT0) this.m.snapT0 = now;
    if (this.gapFrom) { this.m.handoverMs = Math.round(now - this.gapFrom); this.gapFrom = 0; }
    this.m.snaps++;
    this.begun = true;
    clearTimeout(this.readyT);
    // Master clock -> ours. Take the fastest arrival quickly, drift slowly otherwise; the
    // spread of the rest is the jitter that sizes the buffer.
    const sample = s.t - now / 1000;
    if (this.offset === null) this.offset = sample;
    const dev = sample - this.offset;
    if (dev > 0) this.offset += dev * 0.5; else this.offset += dev * 0.02;
    this.jitter = this.jitter * 0.9 + Math.abs(dev) * 0.1;
    // The buffer has to cover the LATE tail, not the average: a decaying peak of lateness.
    this.late = Math.max((this.late || 0) * 0.995, -dev);
    s.recv = now;
    const last = this.buf[this.buf.length - 1];
    if (last && ((s.seq - last.seq) & 0xffff) >= 0x8000) return;   // older than what we hold
    this.buf.push(s);
    if (this.buf.length > 40) this.buf.shift();
    this.reconcile(s, now);
    this.feedback(s);
    // The FIRST end-of-round snapshot is the result; later ones may show a quitter's body dropping.
    if (s.phase === W.PHASE.OVER) { this.overSnap = this.overSnap || s; this.overAt = this.overAt || now; }
  }

  feedback(s) {
    const hp = s.fighters.map((f) => f.hp);
    if (this.prevHp) {
      for (const F of s.fighters) {
        const was = this.prevHp[F.slot];
        if (was == null || F.hp >= was) continue;
        if (F.slot === this.you) haptic.took(0.6); else haptic.hit(0.6);
      }
    }
    this.prevHp = hp;
  }

  reconcile(s, now) {
    const me = this.match.player;
    const F = s.fighters.find((f) => f.slot === this.you);
    if (!F) return;
    me.hp = F.hp;
    me.dead = F.dead;
    W.GESTURES.forEach((g, i) => {
      const m = LIGHT.find((x) => x.gesture === g);
      if (m && F.cds[i] > me.cooldown(m.id) + 0.15) me.cd[m.id] = F.cds[i];
    });
    const standing = F.mode === 'live' && s.phase !== W.PHASE.OVER && !F.dead;
    if (!standing) { this.authority = true; this.liveRun = 0; return; }
    if (this.authority) {
      if (++this.liveRun >= 2) { this.reseed(me, F); this.authority = false; this.m.reseeds++; }
      return;
    }
    // The snapshot says which of our stick inputs the master had last applied (`ack`). It had
    // been running on it for up to one input interval: compare with where WE were then.
    const sent = this.sentAt.get(F.ack);
    const at = sent != null ? sent + INPUT_MS / 2 : now - this.rtt();
    const h = this.histAt(at);
    if (!h) return;
    const ex = F.x - h.x, ey = F.y - h.y;
    this.m.maxErr = Math.max(this.m.maxErr, Math.abs(ex));
    if (Math.abs(ex) > 90 || Math.abs(ey) > 90) { this.reseed(me, F); this.m.reseeds++; return; }
    const c = ex * 0.25;
    this.corr += c;
    for (const e of this.hist) e.x += c;
    if (Math.abs(ex) > 4) this.m.corrections++;
  }

  histAt(t) {
    const H = this.hist;
    if (!H.length || t < H[0].t) return null;
    for (let i = H.length - 1; i >= 0; i--) {
      if (H[i].t <= t) {
        const b = H[i + 1];
        if (!b) return H[i];
        const u = (t - H[i].t) / (b.t - H[i].t || 1);
        return { x: H[i].x + (b.x - H[i].x) * u, y: H[i].y + (b.y - H[i].y) * u };
      }
    }
    return null;
  }

  reseed(me, F) {
    me.x = F.x; me.y = F.y; me.vx = F.vx; me.vy = F.vy;
    me.facing = F.facing; me.onGround = F.onGround;
    me.mode = 'live'; me.gain = 1; me.attack = null; me.blocking = F.blocking; me.poseLock = false;
    me.anim = F.anim; me.animT = F.animT; me.duckDrop = F.duckDrop;
    for (let i = 0; i < NPTS; i++) {
      me.rag.x[i] = me.rag.px[i] = F.pts[i * 2];
      me.rag.y[i] = me.rag.py[i] = F.pts[i * 2 + 1];
    }
    this.hist = [];
    this.corr = 0;
  }

  stepGuest(dt, now, inp) {
    const mp = this.match;
    const me = mp.player;
    const latest = this.buf[this.buf.length - 1];
    if (latest) {
      mp.phase = latest.phase; mp.clock = latest.clock; mp.timeUp = latest.timeUp; mp.over = latest.phase === W.PHASE.OVER;
      mp.overtime = !!latest.overtime;
    }
    this.rtt();

    // Stick -> master, 30/s and on every change.
    const send = { moveX: Math.round(inp.moveX * 100) / 100, block: !!inp.block };
    const changed = !this.lastSent || send.moveX !== this.lastSent.moveX || send.block !== this.lastSent.block;
    if (changed || now - this.lastInput >= INPUT_MS - 1) {
      this.lastInput = Math.max(this.lastInput + INPUT_MS, now - INPUT_MS);
      this.lastSent = send;
      this.client.send(this.masterId, 'u', W.input(++this.inputSeq, send.moveX, send.block));
      this.sentAt.set(this.inputSeq & 0xffff, now);
      if (this.sentAt.size > 120) this.sentAt.delete(this.sentAt.keys().next().value);
    }
    for (const a of inp.acts) this.localAct(a);

    // Our own fighter, predicted.
    const fighting = mp.phase === W.PHASE.FIGHT && !mp.over;
    if (!this.authority) {
      this.acc = Math.min(this.acc + dt, 0.1);
      while (this.acc >= STEP) {
        this.predT += STEP;
        if (this.strikeAt) {
          if (!fighting || this.predT > this.strikeAt) this.strikeAt = 0;
          else if (me.canAct && me.strike()) { sfx.whoosh(); this.strikeAt = 0; }
        }
        if (fighting) { me.move(send.moveX, STEP); me.setBlock(send.block); }
        me.update(STEP, mp.world, null);
        this.separateMe();
        this.acc -= STEP;
      }
      this.hist.push({ t: now, x: me.x, y: me.y });
      while (this.hist.length > 90) this.hist.shift();
    }

    // Everyone the master owns: interpolated a little in the past.
    const iv = Math.max(SNAP_MS, this.snapInterval());
    const delay = Math.min(220, Math.max(45, iv * 1.25 + (this.late || 0) * 1000 + 8));
    this.m.delay = Math.round(delay);
    if (this.offset !== null && this.buf.length) {
      const rt = now / 1000 + this.offset - delay / 1000;
      this.render(rt, now);
    }
    if (!this.authority) this.faceMe();

    mp.time += dt;
    if (mp.announceT > 0) mp.announceT -= dt;
    if (mp.introT > 0) mp.introT -= dt;
    for (const h of mp.hazards) h.update && h.update(dt);
    mp.fx.update(dt, GROUND_Y);
    mp.flair.update(dt);
    mp.camera(dt);

    if (this.overSnap && !this.reported && (this.endHeard || now - this.overAt > (END_HOLD + 1.5) * 1000)) this.guestEnd();
  }

  snapInterval() {
    const B = this.buf;
    if (B.length < 4) return SNAP_MS;
    return (B[B.length - 1].recv - B[B.length - 4].recv) / 3;
  }

  render(rt, now) {
    const mp = this.match, B = this.buf;
    let i = B.length - 1;
    while (i > 0 && B[i - 1].t > rt) i--;
    let a, b, u;
    if (i === 0) { a = b = B[0]; u = 0; }
    else if (B[i].t <= rt) {
      // Past the newest snapshot: hold rather than guess, and count it.
      a = b = B[B.length - 1]; u = 0;
      this.m.underruns++;
    } else { a = B[i - 1]; b = B[i]; u = (rt - a.t) / (b.t - a.t || 1); }
    if (window.__net === this) for (const s of B) if (s.t <= rt && !(s.seq in this.m.shown)) this.m.shown[s.seq] = Date.now();
    for (const F1 of b.fighters) {
      const f = mp.all[F1.slot];
      if (!f) continue;
      f.gone = !!F1.gone; f.out = F1.out | 0; f.respawnT = F1.respawnT || 0;
      mp.scores[F1.slot] = F1.score || 0;
      if (f === mp.player && !this.authority) continue;
      const F0 = a.fighters.find((x) => x.slot === F1.slot) || F1;
      for (let k = 0; k < NPTS; k++) {
        f.rag.px[k] = f.rag.x[k]; f.rag.py[k] = f.rag.y[k];
        f.rag.x[k] = F0.pts[k * 2] + (F1.pts[k * 2] - F0.pts[k * 2]) * u;
        f.rag.y[k] = F0.pts[k * 2 + 1] + (F1.pts[k * 2 + 1] - F0.pts[k * 2 + 1]) * u;
      }
      f.x = F0.x + (F1.x - F0.x) * u;
      f.y = F0.y + (F1.y - F0.y) * u;
      f.vx = F1.vx; f.vy = F1.vy;
      f.facing = F1.facing; f.mode = F1.mode; f.dead = F1.dead; f.blocking = F1.blocking; f.onGround = F1.onGround;
      f.hitFlash = F1.hitFlash; f.hp = F1.hp; f.combo = F1.combo; f.anim = F1.anim; f.animT = F1.animT;
      f.tailPhase += 0.016 * (6 + Math.abs(f.vx) * 0.02);
    }
    if (b.obj) {
      const o0 = a.obj || b.obj;
      mp.obj = { ...b.obj };
      if (b.obj.y != null && o0.y != null && o0.holder === b.obj.holder) { mp.obj.x = o0.x + (b.obj.x - o0.x) * u; mp.obj.y = o0.y + (b.obj.y - o0.y) * u; }
      // At rest on the floor: the drawing bobs it.
      if (mp.obj.y != null) mp.obj.vy = Math.abs(b.obj.y - o0.y) < 0.5 ? 0 : 1;
    }
    // Projectiles: matched by id across the pair, drawn where they were at render time.
    const seen = new Set();
    for (const p1 of b.projs) {
      const p0 = a.projs.find((x) => x.id === p1.id) || p1;
      let v = this.projViews.get(p1.id);
      if (!v) { v = new Projectile({ type: p1.type, x: p1.x, y: p1.y, vx: 1, vy: 0 }); this.projViews.set(p1.id, v); }
      v.x = p0.x + (p1.x - p0.x) * u; v.y = p0.y + (p1.y - p0.y) * u; v.rot = p1.rot; v.fuse = p1.fuse;
      v.netId = p1.id; v.ownerSlot = p1.owner;
      seen.add(p1.id);
    }
    for (const id of [...this.projViews.keys()]) if (!seen.has(id)) this.projViews.delete(id);
    mp.projectiles = [...this.projViews.values()];
  }

  /** Our predicted body against the bodies the master drew: walk into them, stop. */
  separateMe() {
    const me = this.match.player;
    if (!me.onGround || me.mode !== 'live') return;
    for (const o of this.match.enemies) {
      if (o.dead || !o.onGround || o.mode === 'down') continue;
      const dx = me.x - o.x, min = BODY_R * 2;
      if (Math.abs(dx) >= min) continue;
      const s = Math.sign(dx) || (me.facing > 0 ? -1 : 1);
      me.x = o.x + s * min;
      if (me.vx * s < 0) me.vx = 0;
    }
  }

  faceMe() {
    const me = this.match.player;
    if (me.attack || me.mode !== 'live') return;
    let best = null, bd = Infinity;
    for (const o of this.match.enemies) { if (o.dead) continue; const d = Math.abs(o.x - me.x); if (d < bd) { bd = d; best = o; } }
    if (best && bd >= 4) me.facing = best.x > me.x ? 1 : -1;
  }

  guestEnd() {
    this.endHeard = true;
    if (this.reported || !this.overSnap) return;
    this.reported = true;
    const v = Modes.verdict(Modes.viewOfSnap(this.overSnap, this.mode)) || { winner: -1, ko: false };
    if (v.overtime) Object.assign(v, { winner: -1, ko: false });
    this.m.verdict = v;
    if (window.__net === this) window.__lastVerdict = { ...v, clock: this.overSnap.clock };
    this.client.report(this.matchId, this.round, v.winner, v.ko, v.place, dmgOf(this.match, Modes.viewOfSnap(this.overSnap, this.mode).fighters));
    if (v.winner === this.you) haptic.win(); else haptic.ko();
    this.onReported(v);
  }

  /** Extra HUD: only what the campaign HUD cannot say. */
  drawHUD(ctx, vw, vh) {
    const mp = this.match;
    Modes.drawModeHUD(ctx, vw, vh, mp);
    if (mp.phase === W.PHASE.WAIT || (!this.isMaster && !this.begun)) {
      handText(ctx, this.mode === 'duel' ? 'waiting for your opponent…' : 'waiting for everyone…', vw / 2, vh * 0.42, 30, '#3a4050', 'center');
    }
    if (mp.ffa && mp.player.dead && mp.phase === W.PHASE.FIGHT) {
      const f = mp.player;
      const t = f.respawnT > 0 ? `back in ${Math.ceil(f.respawnT)}…` : mp.modeId === 'lms' ? 'you are out — watching to the end' : '';
      if (t) handText(ctx, t, vw / 2, vh * 0.3, 30, '#c0392b', 'center');
    }
    const n = this.hudNote();
    if (n) handText(ctx, n, vw / 2, vh * 0.5, 26, '#c0392b', 'center');
  }

  // 10 s of our own stall reports: a QUIT is the master's forfeit if the server also stopped
  // hearing it (serverSilent, from its reply), otherwise no result for either of us.
  hudNote() {
    const q = this.masterQuiet;
    if (q >= 10000 + STALL_MS && this.mode === 'duel') {
      return this.serverSilent ? 'their game stopped answering — QUIT now counts as their forfeit' : 'no picture from their game — QUIT ends it with no result';
    }
    return this.awayNote || (this.suspended ? 'reconnecting…' : q ? (this.mode !== 'duel' ? 'the host stopped answering — handing over…' : 'their game stopped answering — waiting…')
      : this.stalled ? 'connection stalled…' : '');
  }

  stats() {
    const secs = this.m.snapT0 ? (performance.now() - this.m.snapT0) / 1000 : 0;
    return { ...this.m, shown: undefined, made: undefined, snapRate: secs > 0 ? +(this.m.snaps / secs).toFixed(1) : 0,
      underrunPct: this.m.frames ? +(100 * this.m.underruns / this.m.frames).toFixed(1) : 0,
      jitterMs: +(this.jitter * 1000).toFixed(1), phase: this.match.phase, authority: this.authority };
  }
}

/**
 * A new master brings the keyframe (up to a second old) forward to the newest snapshot it
 * holds: where everyone is, how hurt, who is down, the scores and the objective. The verlet
 * velocity comes from the last two snapshots so a flying body keeps flying.
 */
export function patchFromSnap(mp, s, prev) {
  mp.phase = s.phase; mp.clock = s.clock; mp.timeUp = s.timeUp; mp.overtime = !!s.overtime;
  if (s.phase === W.PHASE.OVER) mp.over = true;
  const dt = prev && s.t > prev.t ? s.t - prev.t : SNAP_MS / 1000;
  for (const F of s.fighters) {
    const f = mp.all[F.slot];
    if (!f) continue;
    const P0 = prev?.fighters.find((x) => x.slot === F.slot);
    Object.assign(f, { x: F.x, y: F.y, vx: F.vx, vy: F.vy, hp: F.hp, dead: F.dead, facing: F.facing, onGround: F.onGround,
      blocking: F.blocking, anim: F.anim, animT: F.animT, duckDrop: F.duckDrop, gone: !!F.gone, out: F.out | 0, respawnT: F.respawnT || 0 });
    if (f.mode !== F.mode) {
      f.mode = F.mode;
      if (F.mode === 'down' || F.mode === 'dead') { f.gain = 0; f.attack = null; f.downT = F.mode === 'dead' ? 999 : 0.2; }
      else if (F.mode === 'live') { f.gain = 1; f.poseLock = false; }
      else if (F.mode === 'getup') f.getupT = Math.min(f.getupT || 0.2, 0.2);
    }
    if (!F.attacking) f.attack = null;
    for (let k = 0; k < NPTS; k++) {
      const x = F.pts[k * 2], y = F.pts[k * 2 + 1];
      const vx = P0 ? (x - P0.pts[k * 2]) / dt * STEP : 0, vy = P0 ? (y - P0.pts[k * 2 + 1]) / dt * STEP : 0;
      f.rag.x[k] = x; f.rag.y[k] = y; f.rag.px[k] = x - vx; f.rag.py[k] = y - vy;
    }
    mp.scores[F.slot] = F.score || 0;
  }
  mp.outSeq = Math.max(mp.outSeq | 0, ...s.fighters.map((F) => F.out | 0));
  if (s.obj && mp.obj) {
    const o = mp.obj;
    o.holder = s.obj.holder;
    o.x = s.obj.x;
    if (s.obj.y != null) {
      const p = prev?.obj;
      o.y = s.obj.y;
      o.vx = p && p.y != null ? (s.obj.x - p.x) / dt : 0;
      o.vy = p && p.y != null ? (s.obj.y - p.y) / dt : 0;
    } else Object.assign(o, { w: s.obj.w, next: s.obj.next, t: s.obj.t, contested: s.obj.contested });
  }
  const live = new Set(s.projs.map((p) => p.id));
  mp.projectiles = mp.projectiles.filter((p) => live.has(p.netId & 0xff));
  for (const p of mp.projectiles) { const q = s.projs.find((x) => x.id === (p.netId & 0xff)); if (q) { p.x = q.x; p.y = q.y; } }
}

/**
 * Practice: the same Match a real online round runs, on this device only, against bots that
 * play the objective. `?mode=bandana&bots=3` or the arena panel's PRACTICE.
 */
export class LocalFight {
  constructor({ mode = 'lms', bots = 3, save = null, skill = 0.55, onDone = () => {} }) {
    this.mode = Modes.MODES[mode] && mode !== 'duel' ? mode : 'lms';
    const n = Math.max(1, Math.min(7, bots | 0)) + 1;
    this.you = 0;
    const seats = [{ name: 'YOU' }, ...['Biro', 'Rubber', 'Crayon', 'Staple', 'Inkpot', 'Ruler', 'Tippex'].slice(0, n - 1).map((name) => ({ name }))];
    const loadouts = seats.map((_, i) => (i === 0 ? loadoutOf(save) : [0, 1, 2, 3, 4, 5, 6, 7]));
    this.saves = loadouts.map(pvpSave);
    const seed = (Math.random() * 1e6) | 0;
    this.sheetLevel = arenaLevel(seed, this.mode);
    this.level = { ...this.sheetLevel };
    this.match = new PvpMatch({ level: this.level, saves: this.saves, you: 0, seats, mode: this.mode, seed });
    this.match.net = this;
    this.match.hudSave = this.saves[0];
    this.brains = this.match.all.map((f, i) => (i === 0 ? null : new ObjectiveBrain(f, skill + Math.random() * 0.1,
      LIGHT.filter((m) => loadouts[i].includes(W.GESTURES.indexOf(m.gesture))).map((m) => m.id), this.saves[i])));
    this.onDone = onDone;
    this.acc = 0;
    this.match.begin();
    if (typeof window !== 'undefined') window.__net = this;
  }

  strike() { this.act(W.ACT.STRIKE); }
  gesture(g) { const i = W.GESTURES.indexOf(g); if (i >= 0) this.act(W.ACT.SPECIAL + i); }
  act(a) {
    const mp = this.match;
    if (a >= W.ACT.SPECIAL && !moveFor(this.saves[0], a - W.ACT.SPECIAL)) {
      mp.fx.text(mp.player.x, mp.player.y - 150, 'NOT LEARNED', { col: '#9aa0ad', size: 22 });
      return;
    }
    if (a >= W.ACT.SPECIAL) haptic.gesture();
    mp.act(0, a);
  }

  step(dt, input) {
    const mp = this.match;
    mp.aspect = screenAspect();
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      if (mp.phase === W.PHASE.FIGHT && !mp.over) {
        if (input) { mp.player.move(input.moveX, STEP); mp.player.setBlock(input.block); }
        this.brains.forEach((b) => b && b.update(STEP, mp));
      }
      mp.update(STEP);
      this.acc -= STEP;
    }
    if (input && input.jump) mp.act(0, W.ACT.JUMP);
    Object.assign(mp.level, hudLines(mp, 'practice'));
    if (mp.over && mp.endT >= END_HOLD + 1.2 && !this.done) { this.done = true; this.onDone(mp.verdict); }
  }

  drawHUD(ctx, vw, vh) {
    const mp = this.match;
    Modes.drawModeHUD(ctx, vw, vh, mp);
    if (mp.player.dead && mp.phase === W.PHASE.FIGHT) {
      const f = mp.player;
      const t = f.respawnT > 0 ? `back in ${Math.ceil(f.respawnT)}…` : mp.modeId === 'lms' ? 'you are out — watching to the end' : '';
      if (t) handText(ctx, t, vw / 2, vh * 0.3, 30, '#c0392b', 'center');
    }
    if (mp.over && mp.verdict) {
      const p = mp.verdict.place ? mp.verdict.place[0] : 0;
      const v = mp.verdict;
      handText(ctx, v.winner === 0 ? 'YOU WIN!' : v.winner < 0 && p <= 1 ? 'a draw' : p ? `you came ${Modes.ordinal(p)}` : 'a draw', vw / 2, vh * 0.3, 40, '#c0392b', 'center');
    }
  }

  destroy() { this.dead = true; if (typeof window !== 'undefined' && window.__net === this) window.__net = null; }
}

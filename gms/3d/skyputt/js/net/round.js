// OnlineRound: the normal Round (js/game/play.js) with the online bits on top.
//  * everyone plays the same hole at once; the obstacle clock is shared (server hole start time)
//  * my shots are relayed as they happen (input + ball state + helpers) and reported when the ball
//    stops; other balls (players and ghost AIs) replay as translucent GhostBalls via the physics
//  * shot clock (auto putt of zero power = +1 stroke when it runs out), no Restart, the menu
//    doesn't pause the round, the hole ends when the server says so (everyone done)
//  * helper counts come from the room's helper mode (makeInventory)
//  * ball hits (room opts.collide, notes/ballhit.md): my shot is simulated against the other seats'
//    resting balls; the relay carries that list (`balls`) so every replay knocks them identically, and
//    my result reports where they ended (`knocks`). The server moves a knocked ball only if it hasn't
//    moved since; everyone then gets a `knock` event. A shot that will knock MY ball (seen by replaying
//    it) freezes my ball ('knocked' state) and plays the knock on it until the server confirms.
//  * polish3, the taster rule (as events, notes/events4.md + polish3.md): rooms are social and the host
//    picks any course, locks or not. A room hole never records a best / stars and never marks a hole
//    finished, so it unlocks nothing on your solo map; a hole of a course you haven't opened (or the
//    gate hole of one) says so on your hole card. Ladder points and star coins pay as for any hole.
import * as THREE from 'three';
import { BALL_R } from '../engine/constants.js';
import { Round } from '../game/play.js';
import { scoreName } from '../game/hud.js';
import { sfx } from '../game/sfxbus.js';
import { GhostBall } from '../ai/ghost.js';
import { ballState } from '../ai/round.js';
import { starsFor, COINS_PER_CRYSTAL } from '../app/store.js';
import { Replayer, targetBalls } from './replay.js';
import { tasterCourse } from '../events/access.js';

let PENDING = null;   // the OnlineGame, handed to overrides that run inside super()

export class OnlineRound extends Round {
  // game: OnlineGame (js/net/game.js) · inventory: makeInventory(...) · index: the room's hole
  constructor(app, course, index, { game, inventory, onExit, helpersOff = false }) {
    PENDING = game;
    super(app, course, index, { mode: 'round', onExit, inventory, label: 'Online' });
    PENDING = null;
    this.helpersOff = helpersOff;
    if (helpersOff) app.hud.el.tray.hidden = true;
  }
  get og() { return this._og || (this._og = PENDING); }

  loadHole(i) {
    this.disposeGhosts();
    super.loadHole(i);
    const og = this.og, room = og.room;
    this.shotN = 0; this.reported = true; this.flyN = -1; this.readyAt = 0; this.clockWarned = false;
    this.replayer = null;
    this.peers = new Map();
    this.collide = room.opts?.collide === true;   // the room's rule (an older server never sends it: pass through)
    this.otherSeats = []; this.incoming = null;
    this.world.time = og.sharedTime();
    // rejoin mid-hole: put my ball back where the server has it
    const me = og.mySeat();
    if (me && room.hole === i) {
      this.shotN = me.cur.n;
      if (me.cur.pos) this.placeBall(me.cur.pos);
      this.strokes = me.cur.strokes;
      this.app.hud.setStrokes(this.strokes, this.maxStrokes);
      if (me.cur.done) { this.state = 'done'; this.ballMesh.visible = false; this.app.hud.hint(false); }
      else if (me.cur.flying) { this.state = 'waiting'; this.app.hud.hint(true, 'Your last shot is still rolling…'); }
    }
    for (const s of room.seats) if (s.i !== og.you) this.addGhost(s);
    og.onHoleLoaded(this);
  }

  placeBall(p) {
    this.ball.place(p[0], p[1], p[2]);
    this.ballMesh.position.set(p[0], p[1], p[2]);
    this.app.rig.snap(new THREE.Vector3(p[0], p[1], p[2]), this.fairwayYaw());
  }

  // ---- ghosts (other seats)
  addGhost(s) {
    const g = new GhostBall({ color: s.color, opacity: 0.72, label: s.name });
    g.userData.noOcclude = true;
    g.label = makeLabel(s.name, s.color);
    g.add(g.label);
    const t = this.hole.tee, p = s.cur.pos || [t.x, t.y, t.z];
    g.place(p);
    if (s.cur.done) g.ball.visible = false;
    this.app.scene.add(g);
    this.peers.set(s.i, { ball: g, final: null, onDone: null, pending: null });
  }
  // (the AI driver waits while a seat's ball is replaying, about to be knocked, or in my live shot)
  ghostBusy(i) { const gh = this.peers.get(i); return !!gh && (gh.ball.playing || !!gh.pending || this.otherSeats.includes(i)); }

  // ---- ball hits
  // The resting balls a shot by `seat` from `from` ({x,y,z}) is simulated against, in seat order:
  // seats that have left the tee, aren't holed, aren't rolling or about to be knocked, and don't
  // overlap the shooter. My own ball counts when it rests (an AI seat the host runs can hit it).
  targetsFor(seat, from) {
    if (!this.collide) return [];
    const out = [], room = this.og.room, me = this.og.you;
    for (const s of room.seats) {
      if (s.i === seat || s.cur.done || s.cur.flying) continue;
      let p;
      if (s.i === me) {
        if (this.incoming || this.ball.state !== 'rest' || !(this.state === 'ready' || this.state === 'flyover') || !this.shotN) continue;
        p = [this.ball.px, this.ball.py, this.ball.pz];
      } else {
        const gh = this.peers.get(s.i);
        if (!gh || !s.cur.pos || gh.ball.playing || gh.pending || this.otherSeats.includes(s.i)) continue;
        p = s.cur.pos;
      }
      if (Math.hypot(p[0] - from.x, p[1] - from.y, p[2] - from.z) < 2 * BALL_R + 0.002) continue;
      out.push({ seat: s.i, n: s.cur.n, x: p[0], y: p[1], z: p[2] });
    }
    return out;
  }
  // A shot (relayed, or one of the host's AI seats) that knocks balls: play each knock on the struck
  // ghost (or freeze + animate my own ball) until the server's `knock` event or the shooter's result.
  playKnocks(by, n, knocks) {
    for (const k of knocks || []) {
      if (k.seat === this.og.you) {
        if (!(this.state === 'ready' || this.state === 'flyover' || this.state === 'knocked')) continue;   // mid-putt: the server sorts it
        if (this.state === 'flyover') this.endFlyover();
        this.state = 'knocked';
        this.aim.guide.hide(); this.app.hud.hint(false); this.refreshHelpers();
        this.incoming = { by, n, ...k, t: 0, from: [this.ball.px, this.ball.py, this.ball.pz] };
        continue;
      }
      const gh = this.peers.get(k.seat);
      if (!gh) continue;
      gh.pending = { by, n };
      this.playGhost(k.seat, { path: k.path, hz: k.hz, state: k.state, from: k.from, to: k.to });
    }
  }
  // The shooter's shot is settled (its result arrived / our reply came back): any knock it predicted
  // that the server didn't confirm is off — those balls go back where the server has them.
  shotSettled(by, n) {
    const room = this.og.room;
    for (const [i, gh] of this.peers) {
      if (!gh.pending || gh.pending.by !== by || gh.pending.n !== n) continue;
      gh.pending = null;
      const s = room.seats[i];
      gh.final = { state: s.cur.done ? 'cup' : 'rest', to: s.cur.pos };
      if (!gh.ball.playing) this.applyFinal(gh);
    }
    const inc = this.incoming;
    if (inc && inc.by === by && inc.n === n) {
      this.incoming = null;
      const p = inc.from;
      this.ball.place(p[0], p[1], p[2]); this.ballMesh.visible = true;
      if (this.state === 'knocked') { this.state = 'ready'; this.refreshHelpers(); }
    }
  }
  // Server: seat m.seat's ball was knocked by m.by (state rest | oob | cup, to, n = its new shot number).
  onKnock(m) {
    if (m.hole !== this.index) return;
    const by = this.og.room.seats[m.by]?.name || 'someone';
    if (m.seat !== this.og.you) {
      const gh = this.peers.get(m.seat);
      if (!gh) return;
      gh.pending = null;
      if (this.otherSeats.includes(m.seat)) return;   // my own live shot: placed when it settled
      gh.final = { state: m.state, to: m.to };
      if (!gh.ball.playing) this.applyFinal(gh);
      if (m.state === 'cup') this.app.hud.banner(`${esc(this.og.room.seats[m.seat]?.name)} knocked in by ${esc(by)}!`, 'good', 1400);
      else if (m.state === 'oob') this.app.hud.banner(`${esc(this.og.room.seats[m.seat]?.name)} knocked out by ${esc(by)} <small>+1</small>`, '', 1400);
      return;
    }
    // my ball
    const wasRolling = this.state === 'rolling';
    this.incoming = null;
    this.shotN = m.n;
    this.last = null;   // no Mulligan of a shot whose ball someone else moved
    if (wasRolling) {   // my putt crossed their knock on the server: theirs came first, mine is void
      this.reported = true; this.others = []; this.otherSeats = []; this._settle = [];
      this.endShot();
      sfx.emit('stopRoll');
    }
    this.strokes = m.strokes;
    this.app.hud.setStrokes(this.strokes, this.maxStrokes);
    if (m.state === 'cup') {
      this.ball.state = 'cup'; this.ballMesh.visible = false;
      this.app.hud.banner(`Knocked in by ${esc(by)}! <small>holed in ${m.strokes}</small>`, 'good', 1800);
      sfx.emit('cupDrop');
      this.reported = true;   // nothing to report: the server already has it
      this.finishHole(false);
      return;
    }
    const p = m.to;
    if (p) { this.ball.place(p[0], p[1], p[2]); this.ballMesh.position.set(p[0], p[1], p[2]); this.ballMesh.visible = true; }
    if (this.state === 'knocked' || wasRolling) this.state = 'ready';
    if (m.state === 'oob') {   // knocked out: back to my spot, +1 to me (the server counted it)
      this.holeNotes.push(`Knocked out by ${by} +1`);
      this.app.hud.banner(`Knocked out by ${esc(by)} <small>+1 stroke</small>`, 'bad', 1800);
      sfx.emit('fall');
      if (m.done) { this.reported = true; this.finishHole(true); return; }   // that was par + 4: picked up
    } else this.app.hud.banner(`Knocked by ${esc(by)}!${wasRolling ? ' <small>your putt didn’t count</small>' : ''}`, wasRolling ? 'bad' : '', 1600);
    if (this.state === 'ready') this.app.rig.setGoalYaw(this.fairwayYaw());
    this.refreshHelpers();
  }
  // my knocked ball rolls along the predicted path (the physics ball moves; Round draws + rolls it)
  animateIncoming(dt) {
    const inc = this.incoming;
    if (!inc?.path) return;
    const p = inc.path, n = p.length / 3;
    inc.t += dt;
    const f = Math.min(n - 1, inc.t * (inc.hz || 30)), i = Math.floor(f), k = f - i, a = i * 3, b = Math.min(n - 1, i + 1) * 3;
    const b0 = this.ball;
    b0.px = p[a] + (p[b] - p[a]) * k; b0.py = p[a + 1] + (p[b + 1] - p[a + 1]) * k; b0.pz = p[a + 2] + (p[b + 2] - p[a + 2]) * k;
    if (f >= n - 1 && inc.state !== 'rest') this.ballMesh.visible = false;   // dropped / fell: wait for the server
  }
  playGhost(i, shot, onDone) {
    const gh = this.peers.get(i);
    if (!gh) { onDone?.(); return; }
    gh.final = null; gh.onDone = onDone || null;
    gh.ball.play(shot, { onDone: () => { const f = gh.onDone; gh.onDone = null; f?.(); if (gh.final) this.applyFinal(gh); } });
  }
  // A shot another client relayed: replay it with the physics.
  onRemoteShot(m) {
    if (m.hole !== this.index || !this.peers.has(m.seat)) return;
    try {
      this.replayer = this.replayer || new Replayer(this.hole);
      const r = this.replayer.shot(m);
      this.playGhost(m.seat, r);
      if (r.knocks.length) this.playKnocks(m.seat, m.n, r.knocks);
    } catch (e) { console.warn('[skyputt] replay failed', e); }
  }
  onRemoteResult(m) {
    if (m.hole !== this.index) return;
    this.shotSettled(m.seat, m.n);
    if (m.seat === this.og.you) return this.onMyResultFromServer(m);
    const gh = this.peers.get(m.seat);
    if (!gh) return;
    gh.final = m;
    if (!gh.ball.playing) this.applyFinal(gh);
  }
  onRemoteMulligan(m) {
    const gh = this.peers.get(m.seat);
    if (!gh || m.hole !== this.index) return;
    gh.final = null;
    const t = this.hole.tee;
    gh.ball.place(m.to || [t.x, t.y, t.z]);
  }
  applyFinal(gh) {
    const m = gh.final; gh.final = null;
    const t = this.hole.tee, to = m.to || [t.x, t.y, t.z];
    if (m.state === 'cup' || m.picked) { gh.ball.ball.visible = false; return; }
    gh.ball.place(to);
  }
  // My seat was played by an AI stand-in while I was away; its shot just landed.
  onMyResultFromServer(m) {
    this.shotN = m.n + 1;
    this.strokes = m.strokes;
    this.app.hud.setStrokes(this.strokes, this.maxStrokes);
    if (m.to) this.placeBall(m.to);
    if (m.done) { this.state = 'done'; this.ballMesh.visible = !!m.to && !m.picked && m.state !== 'cup'; this.og.onMyHoleDone({ strokes: m.strokes, picked: m.picked }); return; }
    if (this.state === 'waiting') { this.state = 'ready'; this.app.hud.hint(false); this.refreshHelpers(); }
  }
  disposeGhosts() {
    if (!this.peers) return;
    for (const gh of this.peers.values()) {
      gh.ball.removeFromParent(); gh.ball.dispose();
      gh.ball.label?.material.map?.dispose(); gh.ball.label?.material.dispose();
    }
    this.peers.clear();
  }

  // ---- my shots
  shoot(vx, vz, power = 0.5) {
    if (this.state !== 'ready') return;
    const ball = ballState(this.ball), t0 = this.world.time, A = this.armed;
    const mods = {};
    for (const k of ['magnet', 'sticky', 'guard', 'ghost', 'steady', 'power']) if (A[k]) mods[k] = true;
    if (this.sight) mods.sight = this.sight;
    const balls = this.targetsFor(this.og.you, ball);
    super.shoot(vx, vz, power);
    if (this.state !== 'rolling') return;
    this.reported = false; this.flyN = this.shotN;
    this.others = targetBalls(balls).map(t => t.ball);
    this.otherSeats = balls.map(t => t.seat);
    this.og.sendShot({ hole: this.index, n: this.shotN, vx, vz, t0, aim: Math.atan2(vx, -vz), power, mods, ball, ...(balls.length ? { balls } : {}) });
  }
  report(state) {
    if (this.reported) return;
    this.reported = true;
    const b = this.ball;
    const to = state === 'oob' ? [b.rest.x, b.rest.y, b.rest.z] : [b.px, b.py, b.pz];
    // where my shot left the balls it knocked (a ball knocked out goes back to its spot; the server gives its owner +1)
    const knocks = [];
    this.others.forEach((o, k) => {
      if (o.knockedBy == null) return;
      const st = o.state === 'cup' || o.state === 'oob' ? o.state : 'rest';
      knocks.push({ seat: this.otherSeats[k], state: st, to: st === 'oob' ? [o.rest.x, o.rest.y, o.rest.z] : [o.px, o.py, o.pz] });
    });
    this.og.sendResult({ hole: this.index, n: this.flyN, state, to, ...(knocks.length ? { knocks } : {}) });
    for (const k of knocks) {   // show them where they ended now (the server's knock event confirms)
      const gh = this.peers.get(k.seat);
      if (!gh) continue;
      if (k.state === 'cup') gh.ball.ball.visible = false; else gh.ball.place(k.to);
    }
    this.others = []; this.otherSeats = [];
    this.shotN = this.flyN + 1;
  }
  // the server's reply to a result with knocks: any it dropped go back to the server's spot
  knocksConfirmed(hole, sent, taken) {
    if (hole !== this.index) return;
    for (const k of sent) {
      if (taken.some(t => t.seat === k.seat)) continue;
      if (k.seat === this.og.you) continue;
      const gh = this.peers.get(k.seat), s = this.og.room.seats[k.seat];
      if (!gh || !s || gh.ball.playing) continue;
      gh.final = { state: s.cur.done ? 'cup' : 'rest', to: s.cur.pos };
      this.applyFinal(gh);
    }
  }
  // my live shot moves the struck peers' ghosts
  syncOthers() {
    this.others.forEach((o, k) => {
      if (o.knockedBy == null) return;
      const gh = this.peers.get(this.otherSeats[k]);
      if (!gh || gh.ball.playing) return;
      const g = gh.ball;
      if (o.state === 'cup' || o.state === 'oob') { g.ball.visible = false; return; }
      g.ball.position.set(o.px, o.py, o.pz);
      if (o.state === 'moving') g._pushHist();
    });
  }
  // knocks by my shot: banners
  onOtherEvents(k, evs) {
    super.onOtherEvents(k, evs);
    for (const e of evs) {
      const name = esc(this.og.room.seats[this.otherSeats[k]]?.name || '');
      if (e.type === 'cup') { this.app.hud.banner(`You knocked ${name} in!`, 'good', 1400); sfx.emit('cupDrop'); }
      else if (e.type === 'oob') this.app.hud.banner(`${name} knocked out <small>+1 to them</small>`, '', 1400);
    }
  }
  onRest() { this.report('rest'); super.onRest(); }
  returnToRest() { this.report('oob'); super.returnToRest(); }
  useMulligan() {
    if (this.state !== 'ready' || !this.last) return;
    super.useMulligan();
    if (!this.last) this.og.sendMulligan({ hole: this.index });   // it went through (last cleared)
  }

  // The ball is in (or picked up): tell the server, collect the ladder points, then watch / wait.
  finishHole(picked) {
    if (this.state === 'done') return;
    if (!picked) this.report('cup');
    this.state = 'done';
    this.refreshHelpers();
    const def = this.def, store = this.app.store;
    const strokes = picked ? this.maxStrokes : this.strokes;
    if (picked) this.ballMesh.visible = false;
    const stars = starsFor(strokes, def.par, picked);
    if (!picked && strokes === 1) this.aces++;
    const crystalCoins = this.holeGems * COINS_PER_CRYSTAL;
    if (crystalCoins) store.addCoins(crystalCoins);
    const meta = this.app.meta?.onHole({ id: def.id, par: def.par, strokes, picked, stars }) || null;
    this.scores[this.index] = { hole: this.index + 1, par: def.par, strokes, picked };
    const tc = tasterCourse(store, def.id);   // (nothing is recorded or unlocked here: see the header)
    if (tc) this.holeNotes.push(`Taster: ${tc.name} stays locked on your map`);
    this.og.onMyHoleDone({ strokes, picked, label: scoreName(strokes, def.par, picked), notes: this.holeNotes, points: meta?.points || 0, coins: crystalCoins + (meta?.coins || 0) });
  }

  keepsProgress() { return false; }   // polish3: online play never writes solo progress

  // Online the menu never pauses play: other players (and the shot clock) keep going.
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.app.hud.pause({
      title: 'Menu', note: 'The round keeps going while this is open.',
      onResume: () => { this.paused = false; },
      onRestart: null, quitLabel: 'Leave room',
      onQuit: () => { this.paused = false; this.og.confirmLeave(); },
      onSettings: () => this.app.openSettings(() => { this.aim.lookSens = this.app.store.settings().camSens ?? 1; this.paused = false; this.pause(); }),
      fsButton: this.app.fullscreen,
    });
  }
  tapHelper(id) { if (!this.helpersOff) super.tapHelper(id); }

  update(dt, t) {
    const p = this.paused; this.paused = false;   // physics and the fly-over run under the menu
    super.update(dt, t);
    this.paused = p;
    // keep the obstacle clock on the shared hole clock (except while my ball rolls on its own,
    // or Steady Hands is armed and slows it for me)
    if (this.state !== 'rolling' && !this.armed.steady && !this.ballsMoving()) this.world.time = this.og.sharedTime();
    if (this.others.length) this.syncOthers();
    if (this.state === 'knocked') this.animateIncoming(dt);
    if (this.peers) for (const gh of this.peers.values()) { gh.ball.update(dt); if (gh.ball.label) gh.ball.label.position.copy(gh.ball.ball.position).y += 0.17; gh.ball.label.visible = gh.ball.ball.visible; }
    this.shotClock();
    this.og.frame(this, dt);
  }

  shotClock() {
    const lim = this.og.room?.opts.shotClock || 0;
    if (!lim || this.state !== 'ready') { this.readyAt = 0; this.og.clock(null); return; }
    const now = performance.now();
    if (!this.readyAt) { this.readyAt = now; this.clockWarned = false; }
    const left = lim - (now - this.readyAt) / 1000;
    this.og.clock(left, lim);
    if (left <= 5 && !this.clockWarned) { this.clockWarned = true; sfx.emit('aimTick', { power: 1 }); }
    if (left <= 0) {
      this.readyAt = 0;
      this.app.hud.banner('Shot clock! <small>+1 stroke</small>', 'bad', 1400);
      this.aim.guide.hide();
      this.shoot(0, 0, 0);
    }
  }

  dispose() {
    super.dispose();
    this.disposeGhosts();
    this.app.hud.el.tray.hidden = false;
  }
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A name tag floating above a ghost ball.
function makeLabel(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px Fredoka, system-ui, sans-serif';
  const w = Math.min(248, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(10,18,40,.62)';
  g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc((256 - w) / 2 + 18, 32, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(name, (256 - w) / 2 + 30, 33, w - 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // constant on-screen size (sizeAttenuation off): readable near and far
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.15, 0.0375, 1);
  s.renderOrder = 5;
  s.userData.noOcclude = true;
  return s;
}

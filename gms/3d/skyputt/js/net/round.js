// OnlineRound: the normal Round (js/game/play.js) with the online bits on top.
//  * everyone plays the same hole at once; the obstacle clock is shared (server hole start time)
//  * my shots are relayed as they happen (input + ball state + helpers) and reported when the ball
//    stops; other balls (players and ghost AIs) replay as translucent GhostBalls via the physics
//  * shot clock (auto putt of zero power = +1 stroke when it runs out), no Restart, the menu
//    doesn't pause the round, the hole ends when the server says so (everyone done)
//  * helper counts come from the room's helper mode (makeInventory)
import * as THREE from 'three';
import { Round } from '../game/play.js';
import { scoreName } from '../game/hud.js';
import { sfx } from '../game/sfxbus.js';
import { GhostBall } from '../ai/ghost.js';
import { ballState } from '../ai/round.js';
import { starsFor, COINS_PER_CRYSTAL } from '../app/store.js';
import { Replayer } from './replay.js';

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
    this.peers.set(s.i, { ball: g, final: null, onDone: null });
  }
  ghostBusy(i) { return !!this.peers.get(i)?.ball.playing; }
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
      this.playGhost(m.seat, this.replayer.shot(m));
    } catch (e) { console.warn('[skyputt] replay failed', e); }
  }
  onRemoteResult(m) {
    if (m.hole !== this.index) return;
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
    super.shoot(vx, vz, power);
    if (this.state !== 'rolling') return;
    this.reported = false; this.flyN = this.shotN;
    this.og.sendShot({ hole: this.index, n: this.shotN, vx, vz, t0, aim: Math.atan2(vx, -vz), power, mods, ball });
  }
  report(state) {
    if (this.reported) return;
    this.reported = true;
    const b = this.ball;
    const to = state === 'oob' ? [b.rest.x, b.rest.y, b.rest.z] : [b.px, b.py, b.pz];
    this.og.sendResult({ hole: this.index, n: this.flyN, state, to });
    this.shotN = this.flyN + 1;
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
    this.og.onMyHoleDone({ strokes, picked, label: scoreName(strokes, def.par, picked), points: meta?.points || 0, coins: crystalCoins + (meta?.coins || 0) });
  }

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
    if (this.state !== 'rolling' && !this.armed.steady) this.world.time = this.og.sharedTime();
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

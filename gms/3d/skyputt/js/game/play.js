// Round controller: hole flow (flyover → ready → rolling → rest / cup / out → done), strokes,
// pickups, helpers (Long Sight, Mulligan + the M5 one-shot helpers), stars/coins/progress, ladder
// points (app.meta), the fixed-step physics loop, ball visuals + cosmetics, the chase camera goal and
// every sound (through the sfx bus).
import * as THREE from 'three';
import { DT, BALL_R, CUP_R, MAT } from '../engine/constants.js';
import { Ball } from '../engine/physics.js';
import { stepBalls, anyMoving } from '../engine/sim.js';
import { buildHole, makeWorld } from '../course/builder.js';
import { frameAt } from '../course/frames.js';
import { buildHoleView } from './holeview.js';
import { AimInput } from './aim.js';
import { sfx } from './sfxbus.js';
import { COINS_PER_CRYSTAL } from '../app/store.js';
import { HELPERS, HELPER_BY_ID, helperName, STEADY_CLOCK, POWER_TEE } from '../meta/helpers.js';
import { makeSkinnedBall, disposeBall, Trail } from '../meta/cosmetics.js';

const MAX_STEPS_PER_FRAME = 48;   // 0.2 s of sim; longer hitches are dropped, not caught up
const PICKUP_R = 0.15;
const FLY_T = 3.2;                // hole fly-over length (s)
const MAX_SIGHT = 3;              // Long Sight stacks per shot

export class Round {
  // app: { renderer, scene, camera, rig, theme, fallback, quality, hud, canvas, fullscreen, store }
  // mode: 'round' (play on to the last hole, then the scorecard) | 'single' (one hole, then the map)
  // Story events add: onComplete(result) instead of the scorecard, opponents [{ name, colour, scores }]
  // shown on every hole card, and tips (hint lines at each hole start).
  constructor(app, course, startIndex = 0, { onExit, mode = 'round', onComplete = null, opponents = null, tips = null, label = null, ledger = null, currency = null, ghosts = null, inventory = null, end = null, doneLabel = null, collide = null } = {}) {
    this.app = app;
    this.inv = inventory || app.store;   // helper counts: the save, or an online room's own (js/net)
    this.course = course; this.onExit = onExit; this.mode = mode;
    this.onComplete = onComplete; this.opponents = opponents; this.tips = tips; this.label = label;
    this.doneLabel = doneLabel;   // the last hole card's button with onComplete (daily: 'Back to the daily')
    this.used = Object.fromEntries(HELPERS.map(h => [h.id, 0]));
    this.armed = {};   // one-shot helpers armed for the next shot (kind 'pre'), consumed on arming
    // pickups pay out once per (hole, index); event rounds pass their own ledger + currency
    this.ledger = ledger || app.store.ledger();
    this.currency = currency;   // { icon, name } in event rounds: pickups are event currency, not coins
    this.aces = 0;
    this.ghosts = ghosts;   // [{ name, colour, shots: [per hole: shot list | null] }] → GhostBall replays (js/ai/ghost.js)
    // Ball hits (notes/ballhit.md): `others` are the other REAL balls on this hole (engine Balls) that
    // my shots can knock (online peers). Empty in single player. A rival ghost (this.ghost.sim, js/ai/
    // ghostsim.js) joins the same step when ball hits are on. A shot isn't over (no
    // next putt, no report) until every ball has stopped: `whenSettled` queues what waits for that.
    this.collide = collide ?? (app.store.settings().ballHit !== false);
    this.others = [];
    this._settle = [];
    this.index = startIndex; this.startIndex = startIndex;
    // a round plays to `end` (exclusive): one nine of an 18-hole course (story2); default = the last hole
    this.end = Math.min(course.holes.length, end ?? course.holes.length);
    this.scores = [];
    this.gems = 0;
    this.paused = false;
    const cos = app.store.data.cosmetics || {};
    this.ballMesh = makeSkinnedBall(cos.ball);
    this.ballMesh.visible = false;
    app.scene.add(this.ballMesh);
    this.trail = new Trail(app.scene, cos.trail);
    this.aim = new AimInput({
      el: app.canvas, rig: app.rig,
      canReady: () => this.state === 'ready' && !this.paused,
      getBall: () => this.ball, world: null,
      onShoot: (vx, vz, power) => this.shoot(vx, vz, power),
      onAimChange: a => this.onAim(a),
      getTargets: () => this.guideTargets(),
    });
    this.aim.lookSens = app.store.settings().camSens ?? 1;
    const hud = app.hud;
    hud.el.pause.onclick = () => { sfx.emit('click'); this.pause(); };
    hud.el.look.onclick = () => { sfx.emit('click'); this.aim.lookMode = !this.aim.lookMode; hud.setLook(this.aim.lookMode); if (!this.aim.lookMode) app.rig.lookPitch = 0; };
    hud.onHelper = id => this.tapHelper(id);
    hud.setLook(false);
    hud.show(true);
    this._skip = () => { if (this.state === 'flyover') this.endFlyover(); };
    app.canvas.addEventListener('pointerdown', this._skip);
    this._lastPow = 0;
    this.loadHole(this.index);
  }

  get def() { return this.course.holes[this.index]; }

  loadHole(i) {
    const app = this.app;
    this.refundArmed();
    this.view?.dispose();
    this.index = i;
    const def = this.def;
    const hole = this.hole = buildHole(def);
    this.world = makeWorld(hole);
    this.aim.world = this.world;
    this.buildGuardMesh(hole);
    this.trail.clear();
    this.view = buildHoleView(app.scene, hole, app.theme, app.fallback, { renderer: app.renderer, camera: app.camera, quality: app.quality });
    this.ball = new Ball(hole.tee.x, hole.tee.y, hole.tee.z);
    this.others = []; this._settle = [];
    this.holeNotes = [];   // lines for the hole card ("Knocked out by Carl +1")
    this.ballMesh.visible = true;
    this.ballMesh.position.set(hole.tee.x, hole.tee.y, hole.tee.z);
    this.ballMesh.scale.setScalar(1);
    this.strokes = 0;
    this.holeGems = 0;
    this.maxStrokes = def.par + 4;   // D10
    this.last = null;                // for Mulligan
    this.sight = 0;
    this.aim.guideLevel = 0;
    this.acc = 0;
    this.timer = 0;
    app.rig.mode = 'follow';
    app.rig.zoom = 1;
    app.rig.occluders = this.view.occluders;
    app.rig.snap(new THREE.Vector3(hole.tee.x, hole.tee.y, hole.tee.z), this.fairwayYaw());
    const hud = app.hud;
    hud.setHole(i + 1, this.course.holes.length, def.par);
    hud.setStrokes(0, this.maxStrokes);
    hud.setGems(this.gems);
    this.refreshHelpers();
    for (const p of this.view.pickups) if (this.ledger.has(def.id, p.index)) { p.taken = true; p.obj.visible = false; }
    hud.setGems(this.gems, this.currency?.icon);
    this.view.update(0, 0, 0, this.ballPos());
    sfx.emit('stopRoll');
    this.loadGhost(i);
    // fly-over: cup → tee, tap to skip
    this.state = 'flyover';
    this.flyT = 0;
    this.flyPath = flyPath(hole);
    this.refreshHelpers();
    hud.banner(`<small>${this.label ? this.label + ' · ' : ''}Hole ${i + 1} · Par ${def.par}</small>${def.name}`, 'intro', 2600);
    hud.hint(true, 'Tap to skip');
  }

  // Rival ghost: replay their recorded shots for this hole as a translucent ball, alongside your play.
  async loadGhost(i) {
    this.ghost?.ball.removeFromParent(); this.ghost?.ball.dispose?.(); this.ghost = null;
    const g = this.ghosts?.find(x => x.shots?.[i]?.length);
    if (!g) return;
    // a replayed hole starts from the recorded score again (a knock may have changed it last time)
    if (g.scores) { g.recScores = g.recScores || g.scores.slice(); g.scores[i] = g.recScores[i]; g.total = g.scores.reduce((a, v) => a + (v | 0), 0); }
    try {
      const { GhostBall, GhostPlayer } = await import('../ai/ghost.js');
      const GS = this.collide ? await import('../ai/ghostsim.js') : null;
      const AI = this.collide ? await import('../ai/index.js') : null;
      if (this.index !== i || !this.view) return;   // hole changed while loading
      const ball = new GhostBall({ color: g.colour || '#ffffff', label: g.name, opacity: 0.75 });
      this.app.scene.add(ball);
      this.ghost = { ball, player: new GhostPlayer(ball, { shots: g.shots[i] }, { gap: 1.4 }), name: g.name, src: g };
      // ball hits on: the ghost is a ball the physics can hit; knocked off its line it plays on with
      // the AI at its own level (its recorded skill, or one estimated from its recorded score)
      if (GS) {
        const def = this.def;
        const golfer = AI.golferFor({ id: g.id, name: g.name, personality: g.personality || 'pro',
          skill: g.skill ?? ghostSkill(g.scores?.[i], def.par) }, hashSeed(`${g.name}:${def.id}`));
        const client = AI.aiClient();
        const plan = (st, t0) => client.shot(def, golfer, st, { t0, budgetScale: 0.5 }).then(r => ({ aim: r.shot.aim, power: r.shot.power, t0: r.t0 }));
        this.ghost.sim = new GS.GhostSim({ shots: g.shots[i], maxStrokes: def.par + 4, golfer, tee: this.hole.tee, plan });
        this.ghost.finishSync = () => {
          const pl = new AI.Planner(this.hole);
          return GS.finishSync(this.ghost.sim, this.world, (st, t) => { const r = AI.takeShot(pl, golfer, st, t, golfer.ticket(), { trace: false, budgetScale: 0.5 }); return { aim: r.shot.aim, power: r.shot.power, t0: r.t0 }; }, this.world.time);
        };
      }
    } catch (e) { console.warn('[skyputt] ghost unavailable', e); }
  }

  endFlyover() {
    if (this.state !== 'flyover') return;
    this.state = 'ready';
    this.app.hud.hint(true, this.tips?.[this.index] || this.tips?.[0] || 'Drag back anywhere to aim · release to putt');
    this.refreshHelpers();
  }

  ballPos() { return { x: this.ball.px, y: this.ball.py, z: this.ball.pz }; }

  // Heading from the ball toward the fairway ~2.5 m ahead (or the cup when it's close).
  fairwayYaw() {
    const h = this.hole, b = this.ball;
    const dc = Math.hypot(h.cup.x - b.px, h.cup.z - b.pz);
    let tx, tz;
    if (dc < 3.2) { tx = h.cup.x; tz = h.cup.z; }
    else {
      let best = Infinity, s = 0;
      for (const f of h.frames) { const d = (f.p[0] - b.px) ** 2 + 4 * (f.p[1] - b.py) ** 2 + (f.p[2] - b.pz) ** 2; if (d < best) { best = d; s = f.s; } }
      const cupS = h.frames[h.frames.findIndex(f => f.cupRow)].s + 0.2;
      const f = frameAt(h.frames, Math.min(cupS, s + 2.5));
      if (f.loop) {
        // look straight down the loop's entry, not across at its exit
        const i0 = h.frames.findIndex(q => q.loop && q.piece === f.piece);
        const E = h.frames[Math.max(0, i0 - 1)], lp = h.frames[i0];
        const inLoop = h.frames.findIndex(q => q.s >= s) >= i0 && s <= h.frames.findLast(q => q.loop && q.piece === f.piece).s;
        const src = inLoop ? h.frames.find(q => q.s > s && !q.loop) || E : E;
        tx = src.p[0] + src.f[0] * 2; tz = src.p[2] + src.f[2] * 2;
        if (!inLoop) { tx = lp.p[0] + E.f[0] * 1.5; tz = lp.p[2] + E.f[2] * 1.5; }
      } else { tx = f.p[0]; tz = f.p[2]; }
    }
    return Math.atan2(tx - b.px, -(tz - b.pz));
  }

  onAim(a) {
    this.app.hud.power(a);
    if (a.active) this.app.hud.hint(false);
    if (a.active && !a.cancel && Math.abs(a.power - this._lastPow) >= 0.04) { sfx.emit('aimTick', { power: a.power }); this._lastPow = a.power; }
    if (!a.active) this._lastPow = 0;
  }

  shoot(vx, vz, power = 0.5) {
    if (this.state !== 'ready') return;
    this.applyMods();   // a fresh copy of the armed mods for this roll (Ghost Ball starts armed)
    const rig = this.app.rig;
    rig.yaw += rig.lookYaw; rig.lookYaw = 0; rig.lookPitch = 0;
    rig.goalYaw = rig.yaw;
    const b = this.ball;
    this.last = { x: b.px, y: b.py, z: b.pz, strokes: this.strokes };
    this.strokes++;
    this.app.hud.setStrokes(this.strokes, this.maxStrokes);
    this.app.hud.hint(false);
    this.world.shoot(b, vx, vz);
    this.state = 'rolling';
    this.overCup = false; this.lipped = false;
    this.aim.guide.hide();
    this.sight = 0; this.aim.guideLevel = 0;
    this.refreshHelpers();
    sfx.emit('putt', { power });
  }

  // ---- helpers
  refreshHelpers() {
    this.app.hud.setHelpers({
      counts: this.inv.helpers(), sight: this.sight, armed: this.armed,
      canPre: this.state === 'ready' || this.state === 'flyover', canMull: this.state === 'ready' && !!this.last,
    });
  }
  tapHelper(id) {
    if (id === 'longSight') return this.useLongSight();
    if (id === 'mulligan') return this.useMulligan();
    if (HELPER_BY_ID[id]?.kind === 'pre') this.togglePre(id);
  }
  // One-shot helpers: tap to arm (uses one), tap again before shooting to take it back (refunded).
  togglePre(id) {
    if (!(this.state === 'ready' || this.state === 'flyover')) return;
    const name = helperName(id);
    if (this.armed[id]) {
      delete this.armed[id]; this.used[id]--;
      this.inv.giveHelper(id);
      this.app.hud.banner(`${name} off`, '', 800);
      sfx.emit('back');
    } else {
      if (!this.inv.useHelper(id)) { this.app.hud.banner(`No ${name} left`, 'bad', 1200); sfx.emit('back'); return; }
      this.endFlyover();
      this.armed[id] = true; this.used[id]++;
      this.app.hud.banner(`${name}! <small>${id === 'power' ? 'more power this shot' : 'next shot'}</small>`, 'good', 1000);
      sfx.emit('click');
    }
    this.applyMods();
    this.refreshHelpers();
  }
  // Push the armed helpers into the sim: ball.mods (magnet / sticky / guard / ghost), the obstacle
  // clock (Steady Hands) and the aim's power cap (Power Tee). The guide line traces with them too.
  applyMods() {
    const A = this.armed, b = this.ball;
    const any = A.magnet || A.sticky || A.guard || A.ghost;
    if (b) b.mods = any ? { magnet: !!A.magnet, sticky: !!A.sticky, guard: !!A.guard, ghost: A.ghost ? 1 : 0, ghostId: -1 } : null;
    if (this.world) this.world.clock = A.steady ? STEADY_CLOCK : 1;
    this.aim.powerMul = A.power ? POWER_TEE : 1;
    if (this.guardMesh) this.guardMesh.visible = !!A.guard;
    const m = this.ballMesh.material, ghost = !!A.ghost;
    if (m.transparent !== ghost) { m.transparent = ghost; m.opacity = ghost ? 0.5 : 1; m.needsUpdate = true; }
  }
  // The shot is over (rest / cup / out): the one-shot helpers are spent.
  endShot() {
    if (!Object.keys(this.armed).length) return;
    this.armed = {};
    this.applyMods();
    this.refreshHelpers();
  }
  // Armed but never shot (hole restarted / quit / next hole): give them back.
  refundArmed() {
    if (this.state !== 'rolling') for (const id of Object.keys(this.armed)) { this.inv.giveHelper(id); this.used[id]--; }
    this.armed = {};   // (mid-roll they were already spent)
    if (this.ball) this.applyMods();
  }
  // Bumper Guard rails: a glowing see-through mesh over the guard colliders, shown while armed.
  buildGuardMesh(hole) {
    if (this.guardMesh) { this.app.scene.remove(this.guardMesh); this.guardMesh.geometry.dispose(); this.guardMesh.material.dispose(); this.guardMesh = null; }
    const q = hole.guards?.quads;
    if (!q?.length) return;
    const pos = new Float32Array(q.length * 18), uv = new Float32Array(q.length * 12);
    q.forEach((P, k) => {
      [0, 1, 2, 0, 2, 3].forEach((j, n) => { pos.set(P[j], k * 18 + n * 3); uv.set([0, j >= 2 ? 1 : 0], k * 12 + n * 2); });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float y = clamp(vUv.y, 0.0, 1.0); float a = 0.22 + 0.7 * smoothstep(0.75, 1.0, y) + 0.1 * sin(uTime * 4.0 + y * 6.0);
          gl_FragColor = vec4(vec3(0.45, 0.9, 1.0) * a, a); }`,
    });
    this.guardMesh = new THREE.Mesh(geo, mat);
    this.guardMesh.renderOrder = 4; this.guardMesh.visible = false; this.guardMesh.userData.noOcclude = true; this.guardMesh.frustumCulled = false;
    this.app.scene.add(this.guardMesh);
  }
  useLongSight() {
    if (!(this.state === 'ready' || this.state === 'flyover') || this.sight >= MAX_SIGHT) return;
    if (!this.inv.useHelper('longSight')) { this.app.hud.banner('No Long Sight left', 'bad', 1200); sfx.emit('back'); return; }
    this.endFlyover();
    this.sight++; this.used.longSight++;
    this.aim.guideLevel = this.sight;
    sfx.emit('click');
    this.app.hud.banner(`Long Sight ×${this.sight}`, 'good', 900);
    this.refreshHelpers();
  }
  useMulligan() {
    if (this.state !== 'ready' || !this.last) return;
    if (!this.inv.useHelper('mulligan')) { this.app.hud.banner('No Mulligans left', 'bad', 1200); sfx.emit('back'); return; }
    const L = this.last;
    this.ball.place(L.x, L.y, L.z);
    this.ballMesh.position.set(L.x, L.y, L.z);
    this.app.rig.focus.set(L.x, L.y, L.z);
    this.strokes = L.strokes;
    this.last = null; this.used.mulligan++;
    this.app.hud.setStrokes(this.strokes, this.maxStrokes);
    this.app.rig.setGoalYaw(this.fairwayYaw());
    this.app.hud.banner('Mulligan! <small>shot undone</small>', 'good', 1100);
    sfx.emit('back');
    this.refreshHelpers();
  }

  pause() {
    if (this.paused || this.state === 'done') return;
    this.paused = true;
    this.app.hud.pause({
      onResume: () => { this.paused = false; },
      onRestart: () => { this.paused = false; this.scores.length = Math.min(this.scores.length, this.index); this.gems -= this.holeGems; this.loadHole(this.index); },
      onQuit: () => { this.paused = false; this.exit(); },
      onSettings: () => this.app.openSettings(() => { this.aim.lookSens = this.app.store.settings().camSens ?? 1; this.paused = false; this.pause(); }),
      fsButton: this.app.fullscreen,
    });
  }

  exit() { this.dispose(); this.onExit?.(); }

  dispose() {
    this.refundArmed();
    this.app.hud.onHelper = null;
    this.app.hud.tipHide?.();
    this.aim.dispose();
    this.app.canvas.removeEventListener('pointerdown', this._skip);
    this.view?.dispose(); this.view = null;
    this.ghost?.ball.removeFromParent(); this.ghost?.ball.dispose?.(); this.ghost = null;
    this.app.rig.occluders = null;
    this.app.scene.remove(this.ballMesh);
    disposeBall(this.ballMesh);
    this.trail.dispose();
    if (this.guardMesh) { this.app.scene.remove(this.guardMesh); this.guardMesh.geometry.dispose(); this.guardMesh.material.dispose(); this.guardMesh = null; }
    sfx.emit('stopRoll');
    this.app.hud.show(false);
    this.app.hud.hideCard();
  }

  // ---- per frame
  update(dt, t) {
    const app = this.app, b = this.ball, w = this.world;
    if (!this.paused) {
      this.acc = Math.min(this.acc + dt, MAX_STEPS_PER_FRAME * DT);
      while (this.acc >= DT) {
        this.acc -= DT;
        const others = this.others, gs = this.ghost?.sim || null;
        if (gs) { gs.pose(w.time); b.noHit = this.strokes === 0 && b.state === 'rest'; }   // (a teed-up ball never collides)
        if ((others.length || gs) && (this.state === 'rolling' || b.state === 'moving' || anyMoving(others) || gs?.ball.state === 'moving')) {
          // several real balls: one shared fixed step (engine/sim.js stepBalls — the replays use it too)
          const all = this._all || (this._all = []);
          all.length = 0; all.push(b, ...others);
          if (gs) all.push(gs.ball);
          stepBalls(w, all, w.time, this.collide);
          if (gs) gs.after(w.time);
          if (b.state === 'moving' && (this.state === 'ready' || this.state === 'flyover')) this.bumped();
          if (b.events.length) this.onEvents(b.events);
          b.events.length = 0;
          for (let k = 0; k < others.length; k++) if (others[k].events.length) { this.onOtherEvents(k, others[k].events); others[k].events.length = 0; }
          if (this.state === 'rolling') { this.checkPickups(); this.checkLip(); }
        } else if (this.state === 'rolling') {
          w.stepBall(b, w.time);
          if (b.events.length) this.onEvents(b.events);
          b.events.length = 0;
          this.checkPickups();
          this.checkLip();
        }
        if (gs?.events.length) this.onGhostEvents(gs);
        if (this._settle.length && !this.ballsMoving()) this.flushSettled();
        w.time += DT * w.clock;   // Steady Hands slows the obstacle clock (poses are a pure function of it)
      }
    }
    // ball visual: position + roll
    const m = this.ballMesh;
    if (this.state === 'sinking') {
      this.timer += dt;
      const k = Math.min(1, this.timer / 0.35);
      const cx = this.hole.cup.x, cz = this.hole.cup.z;
      m.position.x += (cx - m.position.x) * Math.min(1, dt * 12);
      m.position.z += (cz - m.position.z) * Math.min(1, dt * 12);
      m.position.y = Math.max(this.hole.cup.y - 0.16 + BALL_R, this.sinkY0 - k * k * 0.12);
      if (this.timer > 0.9 && !this.ballsMoving()) this.finishHole(false);
    } else if (this.state !== 'oob' || this.timer < 0.05) {
      const dx = b.px - m.position.x, dz = b.pz - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5) {
        _axis.set(dz, 0, -dx).normalize();   // up x travel
        _q.setFromAxisAngle(_axis, dist / BALL_R);
        m.quaternion.premultiply(_q);
      }
      m.position.set(b.px, b.py, b.pz);
    }
    if (this.state === 'oob') {
      this.timer += dt;
      if (this.timer > 1.0 && !this.ballsMoving()) this.returnToRest();
    }
    // rolling sound
    if (this.state === 'rolling') sfx.emit('roll', { speed: b.supported ? b.speed() : 0, surface: b.surf });
    // camera
    const rig = app.rig;
    const rolling = this.state === 'rolling';
    if (rolling) {
      const hs = Math.hypot(b.vx, b.vz);
      if (hs > 0.6 && b.py > this.hole.killY + 1) rig.setGoalYaw(Math.atan2(b.vx, -b.vz));
    }
    _v.set(b.px, b.py, b.pz);
    if (this.state === 'sinking') _v.copy(m.position);
    rig.update(dt, _v, { rolling, frozen: this.aim.aim.active });
    if (this.state === 'flyover') this.updateFlyover(dt);
    else rig.avoidOcclusion(_v, dt);
    // guide line while aiming
    if (this.state === 'ready') this.aim.updateGuide(app.scene, w.time); else this.aim.guide.hide();
    this.view.update(dt, t, w.time, this.ballPos());
    if (this.ghost && !this.paused) {
      if (this.ghost.sim?.mode === 'live') this.drawLiveGhost(dt);   // knocked off its record: drawn from the sim
      else this.ghost.player.update(dt, w.time);   // on the obstacle clock (ai/ghost.js)
    }
    this.trail.update(dt, m.position, this.state === 'rolling' && b.speed() > 0.15);
    if (this.guardMesh?.visible) this.guardMesh.material.uniforms.uTime.value = t;
  }

  updateFlyover(dt) {
    if (!this.paused) this.flyT += dt;
    const u = Math.min(1, this.flyT / FLY_T);
    const cam = this.app.camera;
    // the rig has already placed the camera at its normal pose; blend from the fly path into it
    _rigPos.copy(cam.position); _rigLook.copy(this.app.rig.target);
    flyPose(this.flyPath, u, _flyPos, _flyLook);
    const k = smooth(Math.max(0, (u - 0.72) / 0.28));
    cam.position.lerpVectors(_flyPos, _rigPos, k);
    _flyLook.lerp(_rigLook, k);
    cam.lookAt(_flyLook);
    if (u >= 1) this.endFlyover();
  }

  onEvents(evs) {
    for (const e of evs) {
      if (this.state === 'bumped' && this.onBumpedEvent(e)) continue;
      switch (e.type) {
        case 'cup': {
          this.state = 'sinking'; this.timer = 0; this.sinkY0 = this.ball.py;
          const ace = this.strokes === 1;
          this._settle.length = 0;   // (a ball re-woken after its rest event: that rest is void)
          this.whenSettled(() => this.endShot());
          this.app.hud.banner(ace ? 'HOLE IN ONE!' : 'In the cup!', ace ? 'ace' : 'good', 1500);
          sfx.emit('stopRoll'); sfx.emit('cupDrop');
          const d = this.strokes - this.def.par;
          setTimeout(() => sfx.emit(ace ? 'holeInOne' : d < 0 ? 'birdie' : d === 0 ? 'par' : 'bogey'), 500);
          break;
        }
        case 'oob':
          this.state = 'oob'; this.timer = 0;
          this._settle.length = 0;
          this.whenSettled(() => this.endShot());
          this.strokes++;  // D9: +1 stroke
          this.app.hud.setStrokes(this.strokes, this.maxStrokes);
          this.app.hud.banner('Out of bounds <small>+1 stroke</small>', 'bad', 1400);
          sfx.emit('stopRoll'); sfx.emit('fall');
          break;
        case 'rest': sfx.emit('stopRoll'); this.whenSettled(() => { if (this.ball.state === 'rest' && this.state === 'rolling') { this.endShot(); this.onRest(); } }); break;
        case 'ball': if (e.speed > 0.15) sfx.emit('wall', { speed: Math.min(3, e.speed * 1.4), material: 'stone' }); break;
        case 'wall': sfx.emit('wall', { speed: e.speed, material: 'stone' }); break;
        case 'guard': sfx.emit('bumper', { speed: e.speed * 0.6 }); break;
        case 'ghost': this.app.hud.banner('Ghosted through!', 'good', 900); sfx.emit('boost'); break;
        case 'obstacle': sfx.emit(e.mat === MAT.BUMPER ? 'bumper' : e.mat === MAT.BLADE ? 'windmillHit' : 'wall', { speed: e.speed, material: 'stone' }); break;
        case 'rim': case 'cup-hit': sfx.emit('cupRattle'); break;
        case 'boost': sfx.emit('boost'); break;
        case 'land': if (e.speed > 1.2) sfx.emit('wall', { speed: e.speed * 0.5, material: 'wood' }); break;
      }
    }
  }

  // ---- ball hits: my resting ball knocked by a ghost (no stroke; rules in notes/ballhit.md)
  bumped() {
    if (this.state === 'flyover') this.endFlyover();
    this.state = 'bumped';
    this.aim.guide.hide(); this.app.hud.hint(false); this.refreshHelpers();
    this.last = null;   // no Mulligan back past someone else's knock
    this.app.hud.banner(`Knocked by ${this.ghost?.name || 'a ball'}!`, '', 1200);
  }
  onBumpedEvent(e) {
    const back = () => { this.state = 'ready'; this.app.rig.setGoalYaw(this.fairwayYaw()); this.refreshHelpers(); };
    if (e.type === 'rest') { sfx.emit('stopRoll'); back(); return true; }
    if (e.type === 'oob') {   // knocked out: back where it was hit, +1 to me (the owner) — as for my own ball
      const r = this.ball.rest, by = this.ghost?.name || 'a ball';
      this.ball.place(r.x, r.y, r.z); this.ballMesh.position.set(r.x, r.y, r.z);
      this.strokes++;
      this.app.hud.setStrokes(this.strokes, this.maxStrokes);
      this.app.hud.banner(`Knocked out by ${by} <small>+1 stroke</small>`, 'bad', 1600);
      this.holeNotes.push(`Knocked out by ${by} +1`);
      sfx.emit('fall');
      if (this.strokes >= this.maxStrokes) { this.finishHole(true); return true; }
      back(); return true;
    }
    if (e.type === 'cup') {   // knocked in: holed at your current strokes
      this.state = 'sinking'; this.timer = 0; this.sinkY0 = this.ball.py;
      this.app.hud.banner('Knocked in!', 'good', 1500);
      sfx.emit('stopRoll'); sfx.emit('cupDrop');
      return true;
    }
    return false;   // sounds etc. as usual
  }
  onGhostEvents(gs) {
    for (const e of gs.events) {
      if (e.type === 'diverge') this.app.hud.banner(`${this.ghost.name}<small>knocked off their line</small>`, '', 1400);
      else if (e.type === 'oob' && e.knocked) { this.app.hud.banner(`${this.ghost.name} knocked out <small>+1 to them</small>`, '', 1400); this.holeNotes.push(`${this.ghost.name}: knocked out +1`); }
      else if (e.type === 'cup' && gs.mode === 'live') sfx.emit('cupDrop', { volume: 0.5 });
    }
    gs.events.length = 0;
  }
  drawLiveGhost(dt) {
    const G = this.ghost, gb = G.ball, sb = G.sim.ball;
    if (!G.live) { G.live = true; gb.done = true; gb.onDone = null; gb._setOpacity(1); gb.ball.visible = true; }
    if (sb.state === 'cup') { gb.fade = Math.max(0, (gb.fade ?? 1) - dt * 2.5); gb._setOpacity(gb.fade); if (gb.fade <= 0) gb.ball.visible = false; }
    gb.ball.position.set(sb.px, sb.py, sb.pz);
    if (sb.state === 'moving') gb._pushHist(); else gb.update(dt);
  }
  // The hole is over for me: a ghost knocked off its line plays the rest of its hole headlessly and
  // its score for the hole becomes what it really took (an undisturbed one keeps its record).
  settleGhost() {
    const G = this.ghost;
    if (!G?.sim || G.settled || G.sim.mode !== 'live') return;
    G.settled = true;
    let r;
    try { r = G.sim.done ? G.sim.result() : G.finishSync(); } catch (e) { console.warn('[skyputt] ghost finish failed', e); return; }
    const g = G.src;
    if (g?.scores) { g.scores[this.index] = r.strokes; g.total = g.scores.reduce((a, v) => a + (v | 0), 0); }
  }

  // ---- ball hits: other real balls on the hole
  // Resting balls my next putt would collide with, for the aim guide's contact marker (read-only; the
  // shot itself is simulated as before). Online rooms use the same list the shot is relayed with.
  guideTargets() {
    if (!this.collide) return null;
    const b = this.ball, out = [];
    if (typeof this.targetsFor === 'function') {   // OnlineRound (js/net/round.js)
      for (const t of this.targetsFor(this.og.you, { x: b.px, y: b.py, z: b.pz })) out.push([t.x, t.y, t.z]);
      return out;
    }
    const gs = this.ghost?.sim || null;
    if (gs && this.strokes === 0) return null;   // a teed-up ball never collides with the ghost (update loop: noHit)
    const ok = o => o.state === 'rest' && !o.noHit && Math.hypot(o.px - b.px, o.py - b.py, o.pz - b.pz) >= 2 * BALL_R + 0.002;
    for (const o of this.others) if (ok(o)) out.push([o.px, o.py, o.pz]);
    if (gs && ok(gs.ball)) out.push([gs.ball.px, gs.ball.py, gs.ball.pz]);
    return out;
  }
  ballsMoving() { return this.ball.state === 'moving' || (this.others.length > 0 && anyMoving(this.others)); }
  whenSettled(fn) { if (!this.ballsMoving() && !this._settle.length) fn(); else this._settle.push(fn); }
  flushSettled() { const q = this._settle; this._settle = []; for (const fn of q) fn(); }
  // events of other ball k (knocked / ball / rest / cup / oob); subclasses show them
  onOtherEvents(k, evs) {
    for (const e of evs) if (e.type === 'ball' && e.other > k + 1 && e.speed > 0.15)   // (pairs with my ball sound from mine)
      sfx.emit('wall', { speed: Math.min(3, e.speed * 1.4), material: 'stone' });
  }

  // lip-out: the ball dipped over the cup and came out again
  checkLip() {
    const b = this.ball, c = this.hole.cup;
    const dh = Math.hypot(b.px - c.x, b.pz - c.z);
    if (dh < CUP_R && b.py < c.y + BALL_R * 0.92) this.overCup = true;
    else if (this.overCup && dh > CUP_R + BALL_R && !this.lipped) { this.lipped = true; this.overCup = false; sfx.emit('lipOut'); }
  }

  onRest() {
    if (this.strokes >= this.maxStrokes) { this.finishHole(true); return; }
    this.state = 'ready';
    this.app.rig.setGoalYaw(this.fairwayYaw());
    this.refreshHelpers();
  }

  returnToRest() {
    const r = this.ball.rest;
    this.ball.place(r.x, r.y, r.z);
    this.ballMesh.position.set(r.x, r.y, r.z);
    this.app.rig.focus.set(r.x, r.y, r.z);
    if (this.strokes >= this.maxStrokes) { this.finishHole(true); return; }
    this.state = 'ready';
    this.app.rig.setGoalYaw(this.fairwayYaw());
    this.refreshHelpers();
  }

  checkPickups() {
    const b = this.ball;
    for (const p of this.view.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.p.x - b.px, p.p.y - b.py, p.p.z - b.pz);
      if (d < PICKUP_R) {
        p.taken = true; this.gems++; this.holeGems++;
        this.ledger.add(this.def.id, p.index);
        this.app.hud.setGems(this.gems, this.currency?.icon); sfx.emit('pickup');
      }
    }
  }

  finishHole(picked) {
    if (this.state === 'done') return;
    this.settleGhost();
    this.state = 'done';
    this.refreshHelpers();
    const def = this.def, store = this.app.store;
    const strokes = picked ? this.maxStrokes : this.strokes;
    this.scores[this.index] = { hole: this.index + 1, par: def.par, strokes, picked, ...(this.holeNotes?.length ? { notes: this.holeNotes.slice() } : {}) };
    if (picked) this.ballMesh.visible = false;
    const { stars, newBest } = store.recordHole(def.id, strokes, def.par, picked);
    store.markFinished(def.id);
    if (!picked && strokes === 1) this.aces++;
    const crystalCoins = this.currency ? 0 : this.holeGems * COINS_PER_CRYSTAL;
    if (crystalCoins) store.addCoins(crystalCoins);
    // M5: ladder points + coins for playing the hole, a chest every few 3-star holes
    const meta = this.app.meta?.onHole({ id: def.id, par: def.par, strokes, picked, stars }) || null;
    const coins = crystalCoins + (meta?.coins || 0);
    let reward = null;
    if (stars === 3) {   // a 3-star hole earns a helper (whichever you hold fewest of)
      const h = store.helpers();
      reward = HELPERS.reduce((a, x) => ((h[x.id] | 0) < (h[a] | 0) ? x.id : a), 'longSight');
      store.giveHelper(reward);
    }
    const n = this.course.holes.length;
    const last = this.index >= this.end - 1;
    const fullRound = this.startIndex === 0 || !!this.course.nines?.some(x => x.from === this.startIndex);
    const roundBonus = last && this.mode === 'round' && fullRound && this.app.meta ? this.app.meta.onRound({ holes: this.end - this.startIndex }) : null;
    const nextOpen = !last && store.unlockedCount(this.course) > this.index + 1;
    const onNext = () => {
      if (this.onComplete && last) { const res = this.result(); this.dispose(); this.onComplete(res); return; }
      if (this.mode === 'round') { if (!last) this.loadHole(this.index + 1); else this.showScorecard(); }
      else if (nextOpen) this.loadHole(this.index + 1);
      else this.exit();
    };
    stars && [0, 1, 2].slice(0, stars).forEach(k => setTimeout(() => sfx.emit('star', { n: k + 1 }), 700 + k * 350));
    if (coins || roundBonus?.coins) setTimeout(() => sfx.emit('coin'), 700 + stars * 350 + 100);
    if (meta?.chest) setTimeout(() => sfx.emit('holeInOne'), 900 + stars * 350);
    this.app.hud.holeDone({
      hole: this.index + 1, n, name: def.name, par: def.par, strokes, picked, gems: this.holeGems,
      stars, coins: coins + (roundBonus?.coins || 0), newBest, reward, totalCoins: store.data.coins,
      ladder: meta && { points: meta.points, streak: meta.streak }, chest: meta?.chest, roundBonus,
      nextLabel: this.mode === 'round' ? (last ? (this.doneLabel || 'Scorecard') : 'Next hole') : (nextOpen ? 'Next hole' : 'Course map'),
      onMap: this.mode === 'single' ? () => this.exit() : null,
      rivals: this.opponents?.map(o => ({ name: o.name, colour: o.colour, strokes: o.scores[this.index],
        total: o.scores.slice(0, this.index + 1).reduce((a, b) => a + b, 0) })),
      youTotal: this.scores.filter(Boolean).reduce((a, r) => a + r.strokes, 0),
      currency: this.currency, notes: this.holeNotes,
    }, onNext);
  }

  // Event result for the story: per-hole scores, stars, gems and helper use.
  result() {
    const rows = this.scores.filter(Boolean);
    return { rows, total: rows.reduce((a, r) => a + r.strokes, 0), par: rows.reduce((a, r) => a + r.par, 0),
      stars: rows.reduce((a, r) => a + (r.picked ? 0 : r.strokes < r.par ? 3 : r.strokes === r.par ? 2 : 1), 0),
      gems: this.gems, aces: this.aces, used: { ...this.used } };
  }

  showScorecard() {
    const rows = this.scores.filter(Boolean);
    const nine = this.course.nines && this.course.nines.find(x => x.from === this.startIndex && x.to === this.end);
    this.app.hud.scorecard({ course: this.course.name + (nine ? ' · ' + nine.name : ''), rows, gems: this.gems }, {
      onAgain: () => { this.scores = []; this.gems = 0; this.loadHole(this.startIndex ?? 0); },
      onTitle: () => this.exit(),
    });
  }

  // Test hook: shoot at an absolute heading (degrees, 0 = -Z).
  debugShoot(headingDeg, speed) {
    this.endFlyover();
    const a = headingDeg * Math.PI / 180;
    this.shoot(Math.sin(a) * speed, -Math.cos(a) * speed);
  }
}

// ---- fly-over path: main-track frames (no loop interiors) from the cup back to the tee
function flyPath(hole) {
  const fr = hole.frames.filter(f => !f.loop);
  const cupS = hole.frames.find(f => f.cupRow).s + 0.2;
  const teeS = hole.teeFrame.s ?? 0.45;
  return { fr, cupS, teeS };
}
function posAt(fp, s, out) {
  const fr = fp.fr;
  let i = fr.findIndex(f => f.s >= s);
  if (i <= 0) { const p = fr[Math.max(0, i)].p; return out.set(p[0], p[1], p[2]); }
  const a = fr[i - 1], b = fr[i], k = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return out.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
}
function flyPose(fp, u, pos, look) {
  const e = smooth(u);
  const s = fp.cupS + (fp.teeS - fp.cupS) * e;
  posAt(fp, s, _a);
  // heading along the fairway (toward the cup) over a 3 m window so curves don't whip the view
  posAt(fp, Math.min(fp.cupS, s + 1.0), _b);
  posAt(fp, Math.max(0, s - 2.0), look);
  _b.sub(look); _b.y = 0;
  if (_b.lengthSq() < 1e-6) _b.set(0, 0, -1);
  _b.normalize();
  look.copy(_a).addScaledVector(_b, 1.4);
  const h = 1.5 + 1.4 * (1 - e);
  pos.copy(_a).addScaledVector(_b, -(1.6 + 1.2 * (1 - e))).add(_up.set(0, h, 0));
}
const smooth = t => t * t * (3 - 2 * t);
// a ghost's level when the record doesn't carry one: from its recorded score on the hole vs par
const ghostSkill = (strokes, par) => (strokes ? Math.max(0.05, Math.min(0.9, 0.55 - 0.18 * (strokes - par))) : 0.45);
const hashSeed = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const _axis = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const _rigPos = new THREE.Vector3(), _rigLook = new THREE.Vector3(), _flyPos = new THREE.Vector3(), _flyLook = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3();

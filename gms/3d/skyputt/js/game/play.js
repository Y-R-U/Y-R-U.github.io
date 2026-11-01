// Round controller: hole flow (ready → rolling → rest / cup / out), strokes, pickups, the fixed-step
// physics loop, ball visuals and the chase camera goal.
import * as THREE from 'three';
import { DT, BALL_R, CUP_R } from '../engine/constants.js';
import { World, Ball } from '../engine/physics.js';
import { buildHole } from '../course/builder.js';
import { frameAt } from '../course/frames.js';
import { buildHoleView, makeBall } from './holeview.js';
import { AimInput } from './aim.js';

const MAX_STEPS_PER_FRAME = 48;   // 0.2 s of sim; longer hitches are dropped, not caught up
const PICKUP_R = 0.15;

export class Round {
  // app: { renderer, scene, camera, rig, theme, fallback, quality, hud, canvas, fullscreen }
  constructor(app, course, startIndex = 0, { onExit } = {}) {
    this.app = app; this.course = course; this.onExit = onExit;
    this.index = startIndex; this.startIndex = startIndex;
    this.scores = [];
    this.gems = 0;
    this.paused = false;
    this.ballMesh = makeBall();
    this.ballMesh.visible = false;
    app.scene.add(this.ballMesh);
    this.aim = new AimInput({
      el: app.canvas, rig: app.rig,
      canReady: () => this.state === 'ready' && !this.paused,
      getBall: () => this.ball, world: null,
      onShoot: (vx, vz, power) => this.shoot(vx, vz, power),
      onAimChange: a => { app.hud.power(a); if (a.active) app.hud.hint(false); },
    });
    const hud = app.hud;
    hud.el.pause.onclick = () => this.pause();
    hud.el.look.onclick = () => { this.aim.lookMode = !this.aim.lookMode; hud.setLook(this.aim.lookMode); if (!this.aim.lookMode) app.rig.lookPitch = 0; };
    hud.setLook(false);
    hud.show(true);
    this.loadHole(this.index);
  }

  get def() { return this.course.holes[this.index]; }

  loadHole(i) {
    const app = this.app;
    this.view?.dispose();
    this.index = i;
    const def = this.def;
    const hole = this.hole = buildHole(def);
    this.world = new World({ tris: hole.colliders.tris, mats: hole.colliders.mats, cup: hole.cup, kinematics: hole.kinematics, killY: hole.killY });
    this.aim.world = this.world;
    this.view = buildHoleView(app.scene, hole, app.theme, app.fallback, { renderer: app.renderer, camera: app.camera, quality: app.quality });
    this.ball = new Ball(hole.tee.x, hole.tee.y, hole.tee.z);
    this.ballMesh.visible = true;
    this.ballMesh.position.set(hole.tee.x, hole.tee.y, hole.tee.z);
    this.ballMesh.scale.setScalar(1);
    this.strokes = 0;
    this.holeGems = 0;
    this.maxStrokes = def.par + 4;   // D10
    this.state = 'ready';
    this.acc = 0;
    this.timer = 0;
    app.rig.mode = 'follow';
    app.rig.zoom = 1;
    app.rig.snap(new THREE.Vector3(hole.tee.x, hole.tee.y, hole.tee.z), this.fairwayYaw());
    const hud = app.hud;
    hud.setHole(i + 1, this.course.holes.length, def.par);
    hud.setStrokes(0, this.maxStrokes);
    hud.setGems(this.gems);
    hud.banner(`<small>Hole ${i + 1} · Par ${def.par}</small>${def.name}`, 'intro', 2200);
    hud.hint(true, 'Drag back anywhere to aim · release to putt');
    this.view.update(0, 0, 0, this.ballPos());
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

  shoot(vx, vz) {
    if (this.state !== 'ready') return;
    const rig = this.app.rig;
    rig.yaw += rig.lookYaw; rig.lookYaw = 0; rig.lookPitch = 0;
    rig.goalYaw = rig.yaw;
    this.strokes++;
    this.app.hud.setStrokes(this.strokes, this.maxStrokes);
    this.app.hud.hint(false);
    this.world.shoot(this.ball, vx, vz);
    this.state = 'rolling';
    this.aim.guide.hide();
  }

  pause() {
    if (this.paused || this.state === 'done') return;
    this.paused = true;
    this.app.hud.pause({
      onResume: () => { this.paused = false; },
      onRestart: () => { this.paused = false; this.scores.length = Math.min(this.scores.length, this.index); this.gems -= this.holeGems; this.loadHole(this.index); },
      onQuit: () => { this.paused = false; this.exit(); },
      fsButton: this.app.fullscreen,
    });
  }

  exit() { this.dispose(); this.onExit?.(); }

  dispose() {
    this.aim.dispose();
    this.view?.dispose(); this.view = null;
    this.app.scene.remove(this.ballMesh);
    this.ballMesh.geometry.dispose(); this.ballMesh.material.map?.dispose(); this.ballMesh.material.dispose();
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
        if (this.state === 'rolling') {
          w.stepBall(b, w.time);
          if (b.events.length) this.onEvents(b.events);
          b.events.length = 0;
          this.checkPickups();
        }
        w.time += DT;
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
      if (this.timer > 0.9) this.finishHole(false);
    } else if (this.state !== 'oob' || this.timer < 0.05) {
      const dx = b.px - m.position.x, dy = b.py - m.position.y, dz = b.pz - m.position.z;
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
      if (this.timer > 1.0) this.returnToRest();
    }
    // camera goal
    const rig = app.rig;
    const rolling = this.state === 'rolling';
    if (rolling) {
      const hs = Math.hypot(b.vx, b.vz);
      if (hs > 0.6 && b.py > this.hole.killY + 1) rig.setGoalYaw(Math.atan2(b.vx, -b.vz));
    }
    _v.set(b.px, b.py, b.pz);
    if (this.state === 'sinking') _v.copy(m.position);
    rig.update(dt, _v, { rolling, frozen: this.aim.aim.active });
    // guide line while aiming
    if (this.state === 'ready') this.aim.updateGuide(app.scene, w.time); else this.aim.guide.hide();
    this.view.update(dt, t, w.time, this.ballPos());
  }

  onEvents(evs) {
    for (const e of evs) {
      if (e.type === 'cup') {
        this.state = 'sinking'; this.timer = 0; this.sinkY0 = this.ball.py;
        const ace = this.strokes === 1;
        this.app.hud.banner(ace ? 'HOLE IN ONE!' : 'In the cup!', ace ? 'ace' : 'good', 1500);
      } else if (e.type === 'oob') {
        this.state = 'oob'; this.timer = 0;
        this.strokes++;  // D9: +1 stroke
        this.app.hud.setStrokes(this.strokes, this.maxStrokes);
        this.app.hud.banner('Out of bounds <small>+1 stroke</small>', 'bad', 1400);
      } else if (e.type === 'rest') {
        this.onRest();
      }
    }
  }

  onRest() {
    if (this.strokes >= this.maxStrokes) { this.finishHole(true); return; }
    this.state = 'ready';
    this.app.rig.setGoalYaw(this.fairwayYaw());
  }

  returnToRest() {
    const r = this.ball.rest;
    this.ball.place(r.x, r.y, r.z);
    this.ballMesh.position.set(r.x, r.y, r.z);
    this.app.rig.focus.set(r.x, r.y, r.z);
    if (this.strokes >= this.maxStrokes) { this.finishHole(true); return; }
    this.state = 'ready';
    this.app.rig.setGoalYaw(this.fairwayYaw());
  }

  checkPickups() {
    const b = this.ball;
    for (const p of this.view.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.p.x - b.px, p.p.y - b.py, p.p.z - b.pz);
      if (d < PICKUP_R) { p.taken = true; this.gems++; this.holeGems++; this.app.hud.setGems(this.gems); }
    }
  }

  finishHole(picked) {
    if (this.state === 'done') return;
    this.state = 'done';
    const def = this.def;
    const strokes = picked ? this.maxStrokes : this.strokes;
    this.scores[this.index] = { hole: this.index + 1, par: def.par, strokes, picked };
    if (picked) this.ballMesh.visible = false;
    const last = this.index >= this.course.holes.length - 1;
    this.app.hud.holeDone({ hole: this.index + 1, n: this.course.holes.length, name: def.name, par: def.par, strokes, picked, gems: this.holeGems, last }, () => {
      if (!last) this.loadHole(this.index + 1);
      else this.showScorecard();
    });
  }

  showScorecard() {
    const rows = this.scores.filter(Boolean);
    this.app.hud.scorecard({ course: this.course.name, rows, gems: this.gems }, {
      onAgain: () => { this.scores = []; this.gems = 0; this.loadHole(this.startIndex ?? 0); },
      onTitle: () => this.exit(),
    });
  }

  // Test hook: shoot at an absolute heading (degrees, 0 = -Z) or relative to the camera.
  debugShoot(headingDeg, speed) {
    const a = headingDeg * Math.PI / 180;
    this.shoot(Math.sin(a) * speed, -Math.cos(a) * speed);
  }
}

const _axis = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// Mission engine. A mission = data: spawned props (cars/guards/guns) + a
// sequence of STEPS the player clears in order. Story nodes and side jobs
// all run through here; the editor can author custom missions with the same
// schema (see CLAUDE.md).
//
// Step types: msg · goto · getincar · deliver · destroy · smash · escape ·
// survive · tail · race · give (reward mid-mission)

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, rand, fmtTime } from './utils.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

export class Missions {
  constructor(ctx) {
    this.ctx = ctx;             // {world, vehicles, weapons, pickups, actors, police, traffic, player, ui}
    this.active = null;
    this.beacon = this._makeBeacon();
    ctx.scene.add(this.beacon.g);
    this.onComplete = null;     // (def, timeTaken) — story advancement + rewards hook
    this.onFail = null;
    this.marker = null;         // {x,z} for the minimap
    this.smashCount = 0;
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 26, 18, 1, true), pillarMat);
    pillar.position.y = 13;
    g.add(pillar);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(ring);
    g.visible = false;
    return { g, pillar, ring };
  }

  setBeacon(x, z, color = 0xffd76a) {
    if (x == null) { this.beacon.g.visible = false; this.marker = null; return; }
    this.beacon.g.visible = true;
    this.beacon.g.position.set(x, 0, z);
    this.beacon.pillar.material.color.set(color);
    this.beacon.ring.material.color.set(color);
    this.marker = { x, z };
  }

  get running() { return !!this.active; }

  async start(def) {
    if (this.active) return false;
    const st = {
      def, i: -1, t: 0, stepT: 0,
      time: def.time || 0,
      spawned: { cars: new Map(), actors: [], guns: [] },
      raceState: null, tailState: null,
      failed: false,
    };
    this.active = st;
    this.smashCount = 0;

    // spawn mission props
    const c = this.ctx;
    for (const sc of def.spawns?.cars || []) {
      const v = await c.vehicles.spawn(sc.type, sc.x, sc.z, sc.rot || 0, { locked: !!sc.locked, id: sc.id });
      if (sc.role) v.roleTag = sc.role;
      if (sc.ai) v.driver = 'ai';
      if (sc.hpMul) { v.maxHp *= sc.hpMul; v.hp = v.maxHp; }
      st.spawned.cars.set(sc.id, v);
    }
    for (const ga of def.spawns?.guards || []) {
      const a = c.actors.spawn(ga.kind || 'gang', ga.x, ga.z, { behavior: ga.behavior || 'guard', weapon: ga.weapon, engageR: ga.engageR });
      st.spawned.actors.push(a);
    }
    for (const gg of def.spawns?.guns || []) {
      st.spawned.guns.push(await c.pickups.add('gun', gg.x, gg.z, { w: gg.w, once: true }));
    }

    if (def.brief?.length) await c.ui.dialogue(def.brief);
    c.ui.banner(def.title, '');
    audio.stinger(true);
    this._advance();
    return true;
  }

  _advance() {
    const st = this.active;
    if (!st) return;
    st.i++;
    st.stepT = 0;
    const step = st.def.steps[st.i];
    if (!step) { this._succeed(); return; }
    const c = this.ctx;
    switch (step.type) {
      case 'msg':
        this.setBeacon(null);
        c.ui.dialogue(step.lines).then(() => { if (this.active === st) this._advance(); });
        break;
      case 'goto': case 'deliver':
        this.setBeacon(step.x, step.z);
        c.ui.banner(st.def.title, step.label || (step.type === 'deliver' ? 'Deliver it' : 'Get there'));
        break;
      case 'getincar': {
        const v = st.spawned.cars.get(step.carId);
        if (v) { v.locked = false; this.setBeacon(v.x, v.z); }
        c.ui.banner(st.def.title, step.label || 'Get in the car');
        break;
      }
      case 'destroy': {
        c.ui.banner(st.def.title, step.label || 'Destroy the targets');
        const first = st.spawned.cars.get(step.targets[0]);
        if (first) this.setBeacon(first.x, first.z, 0xff5f4a);
        break;
      }
      case 'smash':
        this.smashCount = 0;
        this.setBeacon(step.x, step.z, 0xff5f4a);
        c.ui.banner(st.def.title, `${step.label || 'Smash'} 0/${step.count}`);
        break;
      case 'escape':
        this.setBeacon(null);
        c.ui.banner(st.def.title, step.label || 'Lose the heat!');
        break;
      case 'survive':
        this.setBeacon(null);
        c.ui.banner(st.def.title, step.label || `Survive ${step.seconds}s`);
        break;
      case 'tail': {
        const v = st.spawned.cars.get(step.carId);
        st.tailState = { alarm: 0, wp: 0, done: false, v };
        c.ui.banner(st.def.title, step.label || 'Tail the target — not too close');
        break;
      }
      case 'race': {
        st.raceState = {
          cp: 0,
          rivals: (step.rivalIds || []).map(id => ({ v: st.spawned.cars.get(id), cp: 0 })),
        };
        this.setBeacon(step.checkpoints[0][0], step.checkpoints[0][1], 0x9adfff);
        c.ui.banner(st.def.title, `Checkpoint 1/${step.checkpoints.length}`);
        break;
      }
      case 'give':
        c.ui.toast(step.text || '+', 'info');
        step.run?.(this.ctx);
        this._advance();
        break;
      default:
        this._advance();
    }
  }

  notifySmash(s) {
    const st = this.active;
    if (!st) return;
    const step = st.def.steps[st.i];
    if (step?.type !== 'smash') return;
    if (step.names && !step.names.includes(s.name)) return;
    this.smashCount++;
    this.ctx.ui.banner(st.def.title, `${step.label || 'Smash'} ${Math.min(this.smashCount, step.count)}/${step.count}`);
    if (this.smashCount >= step.count) this._advance();
  }

  fail(reason) {
    const st = this.active;
    if (!st || st.failed) return;
    st.failed = true;
    audio.stinger(false);
    this._cleanup(false);
    this.onFail?.(st.def, reason);
  }

  _succeed() {
    const st = this.active;
    if (!st) return;
    audio.stinger(true);
    this._cleanup(true);
    this.onComplete?.(st.def, st.t);
  }

  _cleanup(success) {
    const st = this.active;
    const c = this.ctx;
    this.active = null;
    this.setBeacon(null);
    c.ui.banner(null);
    c.ui.timer(null);
    // remove mission cars the player isn't sitting in
    for (const [, v] of st.spawned.cars) {
      if (c.player.car === v) { if (success && st.def.keepCar) continue; }
      if (c.player.car !== v) c.vehicles.remove(v);
    }
    for (const a of st.spawned.actors) c.actors.remove(a);
  }

  tick(dt) {
    const st = this.active;
    if (!st) return;
    st.t += dt;
    st.stepT += dt;
    const c = this.ctx;
    const p = c.player;
    const step = st.def.steps[st.i];
    if (!step) return;

    // global mission timer
    if (st.time > 0) {
      const left = st.time - st.t;
      c.ui.timer(left);
      if (left <= 0) { this.fail('Out of time'); return; }
    }

    switch (step.type) {
      case 'goto': {
        if (step.onFoot && p.mode !== 'foot') break;
        if (step.inCar && p.mode !== 'car') break;
        const d2 = (p.x - step.x) ** 2 + (p.z - step.z) ** 2;
        if (d2 < (step.r || 6) ** 2) this._advance();
        break;
      }
      case 'getincar': {
        const v = st.spawned.cars.get(step.carId);
        if (!v || v.dead) { this.fail('The car was destroyed'); break; }
        this.setBeacon(v.x, v.z);
        if (p.car === v) this._advance();
        break;
      }
      case 'deliver': {
        const v = step.carId ? st.spawned.cars.get(step.carId) : p.car;
        if (step.carId && (!v || v.dead)) { this.fail('The cargo was destroyed'); break; }
        if (step.minHpFrac && v && v.hp / v.maxHp < step.minHpFrac) { this.fail('The cargo took too much damage'); break; }
        if (p.mode !== 'car' || (step.carId && p.car !== v)) break;
        const d2 = (p.x - step.x) ** 2 + (p.z - step.z) ** 2;
        if (d2 < (step.r || 6) ** 2) this._advance();
        break;
      }
      case 'destroy': {
        let alive = null;
        for (const id of step.targets) {
          const v = st.spawned.cars.get(id);
          if (v && !v.dead) { alive = v; break; }
        }
        if (!alive) this._advance();
        else {
          this.setBeacon(alive.x, alive.z, 0xff5f4a);
          if (step.fleeing) {
            const input = c.vehicles.aiInput(alive, alive.x + Math.sin(alive.yaw + 0.4) * 30, alive.z + Math.cos(alive.yaw + 0.4) * 30, 0.85);
            c.vehicles.step(alive, dt, input);
          }
        }
        break;
      }
      case 'escape':
        if (c.police.stars === 0) this._advance();
        break;
      case 'survive': {
        c.ui.banner(st.def.title, `${step.label || 'Survive'} — ${fmtTime(Math.max(0, step.seconds - st.stepT))}`);
        if (st.stepT >= step.seconds) this._advance();
        break;
      }
      case 'tail': {
        const ts = st.tailState;
        const v = ts.v;
        if (!v || v.dead) { this.fail('You lost the target'); break; }
        // drive the target along its route
        const wp = step.route[ts.wp];
        if (wp) {
          const input = c.vehicles.aiInput(v, wp[0], wp[1], step.speed || 0.5);
          c.vehicles.step(v, dt, input);
          if (input.dist < 7) ts.wp++;
        } else { this._advance(); break; }
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        this.setBeacon(v.x, v.z, 0x9adfff);
        if (d < step.min) { ts.alarm += dt * 0.45; c.ui.banner(st.def.title, '⚠ TOO CLOSE — back off'); }
        else if (d > step.max) { ts.alarm += dt * 0.28; c.ui.banner(st.def.title, '⚠ Losing them — keep up'); }
        else { ts.alarm = Math.max(0, ts.alarm - dt * 0.25); c.ui.banner(st.def.title, step.label || 'Tail the van'); }
        if (ts.alarm >= 1) this.fail(d < step.min ? 'They spotted you' : 'You lost them');
        break;
      }
      case 'race': {
        const rs = st.raceState;
        const cps = step.checkpoints;
        // player checkpoint
        const cur = cps[rs.cp];
        if (cur) {
          const d2 = (p.x - cur[0]) ** 2 + (p.z - cur[1]) ** 2;
          if (d2 < (step.r || 9) ** 2) {
            rs.cp++;
            audio.pickup();
            if (rs.cp >= cps.length) { this._advance(); break; }
            this.setBeacon(cps[rs.cp][0], cps[rs.cp][1], 0x9adfff);
            c.ui.banner(st.def.title, `Checkpoint ${rs.cp + 1}/${cps.length}`);
          }
        }
        // rivals
        for (const r of rs.rivals) {
          if (!r.v || r.v.dead) continue;
          const rcp = cps[r.cp];
          if (!rcp) { this.fail('A rival beat you to the line'); break; }
          const input = c.vehicles.aiInput(r.v, rcp[0], rcp[1], step.rivalSpeed || 0.8);
          c.vehicles.step(r.v, dt, input);
          if (input.dist < 8) r.cp++;
        }
        break;
      }
    }

    // shared fail conditions
    if (!p.alive) this.fail('You got wasted');
    if (st.def.maxStars != null && c.police.stars > st.def.maxStars) this.fail('Too much heat — job blown');
    if (st.def.failIfCarDead) {
      const v = st.spawned.cars.get(st.def.failIfCarDead);
      if (v?.dead) this.fail('The car was destroyed');
    }
  }
}

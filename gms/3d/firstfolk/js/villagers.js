// The little folk. Fully autonomous: a think-loop picks tasks (jobs.js), A*
// paths walk them there, procedural body-space poses act them out, and the
// day/night rhythm rules everything — work by day, pray at dusk, sleep by the
// fire, eat at dawn. Carried goods are real props; deaths leave gravestones.

import * as THREE from 'three';
import { CFG, JOB_MODELS, GRID } from './config.js';
import { model, loadRigGltf } from './assets.js';
import { buildRig, qx, qy, qz } from './rig.js';
import { worldToCell } from './terrain.js';
import { dispatch } from './jobs.js';
import * as FX from './fx.js';
import { rand, pick, clamp, lerp, lerpAngle, dist2 } from './utils.js';

const gltfCache = new Map();
const rigGltf = (n) => { if (!gltfCache.has(n)) gltfCache.set(n, loadRigGltf(n)); return gltfCache.get(n); };

const NAME_A = ['Bram', 'Etta', 'Wynn', 'Osric', 'Maeve', 'Tam', 'Idra', 'Col', 'Ryla', 'Ffion',
  'Bede', 'Sorrel', 'Hew', 'Anya', 'Garrick', 'Liss', 'Odo', 'Petra', 'Rook', 'Sela',
  'Torv', 'Una', 'Vann', 'Wren', 'Yara', 'Ash', 'Berrin', 'Cade', 'Della', 'Eron'];
let nameIdx = Math.floor(Math.random() * 30);
const genName = () => NAME_A[(nameIdx++) % NAME_A.length];

export function createVillagers(game) {
  const V = { list: [], nextId: 1 };
  const { T, W, PF, scene } = game;

  // ── spawning / retraining ───────────────────────────────────────────────────
  V.spawn = async (job = 'villager', x = 0, z = 0, adult = true, modelName = null) => {
    const mn = modelName || pick(JOB_MODELS[adult ? job : 'child']);
    const gltf = await rigGltf(mn);
    const rig = buildRig(gltf.scene, { scale: adult ? 0.98 : 0.6 });
    const v = {
      id: V.nextId++, name: genName(), job, modelName: mn, rig, adult,
      x, z, yaw: rand(0, Math.PI * 2), phase: rand(0, 10),
      hp: job === 'guard' ? CFG.villager.guardHp : CFG.villager.hp,
      hunger: 1, growT: 0, state: 'idle', anim: 'idle',
      path: null, pathI: 0, pathWait: 0, task: null, carry: null, carryMesh: null,
      thinkT: rand(0, 0.6), workT: 0, ate: true, prayerSpot: null,
      employedAt: null, fleeT: 0, target: null, atkT: 0, dead: false, bob: 0,
    };
    v.maxHp = v.hp;
    rig.group.position.set(x, T.heightAt(x, z), z);
    scene.add(rig.group);
    V.list.push(v);
    return v;
  };

  // swap the body when a job (or adulthood) changes
  V.retrain = async (v, job, building = null) => {
    if (v.dead) return;
    v.job = job;
    v.employedAt = building;
    const mn = pick(JOB_MODELS[job] || JOB_MODELS.villager);
    if (mn !== v.modelName || !v.adult) {
      const gltf = await rigGltf(mn);
      const rig = buildRig(gltf.scene, { scale: 0.98 });
      rig.group.position.copy(v.rig.group.position);
      rig.group.rotation.y = v.rig.group.rotation.y;
      scene.remove(v.rig.group);
      scene.add(rig.group);
      v.rig = rig; v.modelName = mn; v.adult = true;
      if (v.carry) attachCarry(v, v.carry.type);
    }
    v.maxHp = job === 'guard' ? CFG.villager.guardHp : CFG.villager.hp;
    v.hp = Math.min(v.maxHp, v.hp + 10);
    clearTask(v);
  };

  V.pop = () => V.list.filter(v => !v.dead).length;
  V.adults = () => V.list.filter(v => !v.dead && v.adult);
  V.unemployed = () => V.list.filter(v => !v.dead && v.adult && v.job === 'villager');
  V.jobCounts = () => {
    const c = {};
    for (const v of V.list) if (!v.dead) c[v.adult ? v.job : 'child'] = (c[v.adult ? v.job : 'child'] || 0) + 1;
    return c;
  };

  // ── carrying ────────────────────────────────────────────────────────────────
  const CARRY_PROPS = { wood: ['log', 0.85], stone: ['rocks_small', 0.8], food: ['crate', 0.42] };
  async function attachCarry(v, type) {
    if (v.carryMesh) { v.rig.group.remove(v.carryMesh); v.carryMesh = null; }
    const [mn, s] = CARRY_PROPS[type] || CARRY_PROPS.wood;
    const m = await model(mn);
    m.scale.setScalar(s);
    m.position.set(0, 1.05, 0.42);
    if (type === 'wood') m.rotation.z = Math.PI / 2;
    v.rig.group.add(m);
    v.carryMesh = m;
  }
  V.giveCarry = (v, type, n) => { v.carry = { type, n }; attachCarry(v, type); };
  V.dropCarry = (v, asDrop = true) => {
    if (!v.carry) return;
    if (asDrop) W.spawnDrop(v.carry.type, v.carry.n, v.x + rand(-0.5, 0.5), v.z + rand(-0.5, 0.5));
    if (v.carryMesh) { v.rig.group.remove(v.carryMesh); v.carryMesh = null; }
    v.carry = null;
  };
  V.deliver = (v) => {
    if (!v.carry) return;
    game.addStock(v.carry.type, v.carry.n, v.x, T.heightAt(v.x, v.z) + 2.2, v.z);
    if (v.carryMesh) { v.rig.group.remove(v.carryMesh); v.carryMesh = null; }
    v.carry = null;
  };

  // tool (axe) shown while chopping
  let axeProto = null;
  model('axe').then(m => { axeProto = m; });
  function setTool(v, on) {
    if (on && !v.toolMesh && axeProto) {
      const m = axeProto.clone(true);
      m.scale.setScalar(0.65);
      m.rotation.set(Math.PI / 2, 0, 0);
      m.position.set(0, 0.12, 0.06);
      v.rig.handAttach.add(m);
      v.toolMesh = m;
    } else if (!on && v.toolMesh) {
      v.rig.handAttach.remove(v.toolMesh);
      v.toolMesh = null;
    }
  }

  // ── movement ────────────────────────────────────────────────────────────────
  V.walkTo = (v, x, z, relax = false) => {
    v.pathWait = 1;
    const token = {};
    v._pfToken = token;
    PF.request(v.x, v.z, x, z, (path) => {
      if (v._pfToken !== token) return;      // superseded by a newer request
      v.pathWait = 0;
      if (!path) { clearTask(v); return; }
      v.path = path; v.pathI = 1;
    }, relax, v);
  };
  const arrived = (v) => !v.path && !v.pathWait;

  function stepAlong(v, dt) {
    if (!v.path) return;
    const p = v.path[v.pathI];
    if (!p) { v.path = null; return; }
    const dx = p.x - v.x, dz = p.z - v.z;
    const d = Math.hypot(dx, dz);
    let sp = (v.state === 'flee' || v.job === 'guard' && v.target ? CFG.villager.runSpeed : CFG.villager.speed) * game.workMul();
    if (T.onLey(v.x, v.z)) {
      sp *= CFG.villager.leylineBoost;
      game.addFaith(CFG.villager.leyTrickle * dt);
    }
    if (!v.adult) sp *= 0.8;
    if (d < 0.25) {
      v.pathI++;
      if (v.pathI >= v.path.length) v.path = null;
      return;
    }
    const st = Math.min(d, sp * dt);
    v.x += (dx / d) * st;
    v.z += (dz / d) * st;
    v.yaw = lerpAngle(v.yaw, Math.atan2(dx, dz), Math.min(1, dt * 9));
    // terrain edited under our path? repath — unless it's the final stop right
    // beside us (blocked target cells: sites, the fire), then just arrive.
    const { cx, cz } = worldToCell(p.x, p.z);
    if (!T.walkable(cx, cz)) {
      if (v.pathI >= v.path.length - 1 && d < 2.6) { v.path = null; return; }
      const end = v.path[v.path.length - 1];
      v.path = null;
      V.walkTo(v, end.x, end.z);
    }
  }

  // ── poses ───────────────────────────────────────────────────────────────────
  function pose(v, t) {
    const P = v.rig.parts, ph = v.phase, DR = v.rig.DOWN_R, DL = v.rig.DOWN_L;
    const a = v.anim;
    let bob = 0;
    const moving = !!v.path;
    if (a === 'walk' || (moving && a !== 'sit' && a !== 'sleep')) {
      const run = v.state === 'flee' || (v.job === 'guard' && v.target);
      const sp = run ? 11 : 7.5, amp = run ? 0.72 : 0.5;
      const sw = Math.sin(t * sp + ph) * amp;
      P.rLeg?.apply(qx(sw)); P.lLeg?.apply(qx(-sw));
      P.rKnee?.apply(qx(Math.max(0, -sw) * 0.9)); P.lKnee?.apply(qx(Math.max(0, sw) * 0.9));
      if (v.carry) {
        P.rArm?.apply(qx(-1.15).multiply(DR)); P.lArm?.apply(qx(-1.15).multiply(DL));
        P.rElb?.apply(qx(-0.9)); P.lElb?.apply(qx(-0.9));
      } else if (run) {
        P.rArm?.apply(qz(-1.15).multiply(qx(0.3 * Math.sin(t * 10)))); P.lArm?.apply(qz(1.15).multiply(qx(-0.3 * Math.sin(t * 10))));
        P.rElb?.apply(qx(-0.8)); P.lElb?.apply(qx(-0.8));
      } else {
        P.rArm?.apply(qx(-sw * 0.7).multiply(DR)); P.lArm?.apply(qx(sw * 0.7).multiply(DL));
        P.rElb?.apply(qx(-0.25)); P.lElb?.apply(qx(-0.25));
      }
      P.head?.apply(qy(Math.sin(t * 0.9 + ph) * 0.08));
      bob = Math.abs(Math.sin(t * sp + ph)) * 0.05;
    } else if (a === 'chop') {
      const k = (t * 1.05 + ph) % 1;                       // windup then strike
      const ang = k < 0.62 ? lerp(-0.7, -2.3, k / 0.62) : lerp(-2.3, -0.7, (k - 0.62) / 0.38);
      P.rArm?.apply(qx(ang).multiply(DR)); P.lArm?.apply(qx(ang).multiply(DL));
      P.rElb?.apply(qx(-0.45)); P.lElb?.apply(qx(-0.45));
      P.rLeg?.apply(qx(0.18)); P.lLeg?.apply(qx(-0.18));
      P.rKnee?.apply(qx(0.12)); P.lKnee?.apply(qx(0.22));
      P.head?.apply(qx(0.15));
      if (v._swingPrev !== undefined && v._swingPrev < 0.62 && k >= 0.62) v.onSwing?.();
      v._swingPrev = k;
    } else if (a === 'hammer') {
      const k = Math.sin(t * 9 + ph);
      P.rArm?.apply(qx(-1.5 + k * 0.55).multiply(DR));
      P.lArm?.apply(qx(-0.6).multiply(DL));
      P.rElb?.apply(qx(-0.5)); P.lElb?.apply(qx(-0.7));
      P.rLeg?.apply(qx(0.14)); P.lLeg?.apply(qx(-0.14));
      P.head?.apply(qx(0.2));
      if (v._swingPrev !== undefined && v._swingPrev <= 0.92 && k > 0.92) v.onSwing?.();
      v._swingPrev = k;
    } else if (a === 'sow') {
      const k = Math.sin(t * 3 + ph);
      P.rArm?.apply(qx(-0.9).multiply(qy(k * 0.5)).multiply(DR));
      P.lArm?.apply(qx(-0.3).multiply(DL));
      P.rElb?.apply(qx(-0.6)); P.lElb?.apply(qx(-0.2));
      P.head?.apply(qx(0.32));
      P.rLeg?.apply(qx(0.1)); P.lLeg?.apply(qx(-0.1));
    } else if (a === 'pray') {
      const sway = Math.sin(t * 1.6 + ph) * 0.12;
      P.rArm?.apply(qz(-1.3 + sway * 0.4).multiply(qx(0.1)));
      P.lArm?.apply(qz(1.3 - sway * 0.4).multiply(qx(0.1)));
      P.rElb?.apply(qx(-0.3)); P.lElb?.apply(qx(-0.3));
      P.head?.apply(qx(-0.34 + sway * 0.5));
      P.rLeg?.apply(qx(0.02)); P.lLeg?.apply(qx(-0.02));
      bob = Math.sin(t * 1.6 + ph) * 0.02;
    } else if (a === 'sit' || a === 'sleep') {
      P.rLeg?.apply(qx(-1.35)); P.lLeg?.apply(qx(-1.35));
      P.rKnee?.apply(qx(1.15)); P.lKnee?.apply(qx(1.15));
      P.rArm?.apply(qx(-0.25).multiply(DR)); P.lArm?.apply(qx(-0.25).multiply(DL));
      P.rElb?.apply(qx(-0.5)); P.lElb?.apply(qx(-0.5));
      P.head?.apply(qx(a === 'sleep' ? 0.52 : 0.12 + Math.sin(t + ph) * 0.05));
      bob = -0.42;
    } else if (a === 'fight') {
      const k = (t * 1.6 + ph) % 1;
      const ang = k < 0.5 ? lerp(-0.5, -2.1, k * 2) : lerp(-2.1, -0.5, (k - 0.5) * 2);
      P.rArm?.apply(qx(ang).multiply(DR));
      P.lArm?.apply(qx(-0.7).multiply(DL));
      P.rElb?.apply(qx(-0.4)); P.lElb?.apply(qx(-0.8));
      P.rLeg?.apply(qx(0.3)); P.lLeg?.apply(qx(-0.3));
      P.rKnee?.apply(qx(0.1)); P.lKnee?.apply(qx(0.35));
      bob = Math.abs(Math.sin(t * 3.2)) * 0.03;
    } else if (a === 'aim') {                              // guard bow
      P.rArm?.apply(qx(-1.5).multiply(DR));
      P.lArm?.apply(qx(-1.5).multiply(qz(0.35)).multiply(DL));
      P.rElb?.apply(qx(-1.1));
      P.lElb?.apply(qx(-0.1));
      P.head?.apply(qy(0.05));
    } else if (a === 'cheer') {
      const k = Math.abs(Math.sin(t * 5 + ph));
      P.rArm?.apply(qz(-1.35 + k * 0.25));
      P.lArm?.apply(qz(1.35 - k * 0.25));
      P.rElb?.apply(qx(-0.3)); P.lElb?.apply(qx(-0.3));
      bob = k * 0.12;
    } else {  // idle
      const sway = Math.sin(t * 1.1 + ph) * 0.05;
      P.rLeg?.apply(qx(sway)); P.lLeg?.apply(qx(-sway));
      P.rArm?.apply(qx(sway * 1.5).multiply(DR)); P.lArm?.apply(qx(-sway * 1.5).multiply(DL));
      P.rElb?.apply(qx(-0.2)); P.lElb?.apply(qx(-0.2));
      P.head?.apply(qy(Math.sin(t * 0.5 + ph) * 0.3).multiply(qx(Math.sin(t * 0.33 + ph) * 0.06)));
    }
    v.bob = bob;
  }
  let lastDt = 1 / 60;

  // ── tasks ───────────────────────────────────────────────────────────────────
  function clearTask(v) {
    if (v.task) {
      v.task.release?.();
      v.task = null;
    }
    v.onSwing = null;
    setTool(v, false);
    if (v.anim !== 'idle') v.anim = 'idle';
  }
  V.clearTask = clearTask;

  V.assignTask = (v, task) => {
    clearTask(v);
    v.task = task;
    v.state = 'goto';
    V.walkTo(v, task.x, task.z, task.relax);
  };

  // ── damage / death ──────────────────────────────────────────────────────────
  V.damage = (v, dmg, from = null) => {
    if (v.dead) return;
    v.hp -= dmg;
    FX.burst(v.x, T.heightAt(v.x, v.z) + 1.2, v.z, { color: 0xc23b2a, n: 6, spread: 1, up: 1.6, size: 0.35, life: 0.5 });
    if (v.hp <= 0) { kill(v); return; }
    if (v.job !== 'guard') {
      v.state = 'flee'; v.fleeT = 5;
      clearTask(v);
      const s = game.safeSpot();
      V.walkTo(v, s.x + rand(-3, 3), s.z + rand(-3, 3));
    } else if (from) v.target = from;
  };
  async function kill(v) {
    v.dead = true;
    v.deathT = 0;
    V.dropCarry(v, true);
    clearTask(v);
    game.onDeath?.(v);
    const g = await model('gravestone');
    g.scale.setScalar(0.8);
    g.position.set(v.x, T.heightAt(v.x, v.z), v.z);
    g.rotation.y = rand(0, Math.PI * 2);
    scene.add(g);
    setTimeout(() => scene.remove(g), 60000);
  }

  // ── the think loop ──────────────────────────────────────────────────────────
  function think(v) {
    if (game.celebration) { clearTask(v); v.path = null; v.anim = 'cheer'; v.state = 'idle'; return; }
    const phase = W.phase();
    // everyone breakfasts at dawn — guards included
    if (phase === 'dawn' && !v.ate) {
      if (game.stocks.food > 0) {
        game.stocks.food -= 1;
        v.hunger = 1;
        FX.floater(v.x, T.heightAt(v.x, v.z) + 2, v.z, '🍎');
      }
      v.ate = true;
    }
    // threats override everything but guard duty
    if (v.state === 'flee') return;
    if (v.job === 'guard') { guardThink(v); return; }
    if (game.R?.anyNear(v.x, v.z, 8)) {
      v.state = 'flee'; v.fleeT = 4;
      clearTask(v);
      const s = game.safeSpot();
      V.walkTo(v, s.x + rand(-3, 3), s.z + rand(-3, 3));
      return;
    }

    if (phase === 'pray' && v.adult) {
      if (v.state !== 'praying') {
        clearTask(v);
        const spot = game.prayerSpot(v);
        v.prayerSpot = spot;
        v.state = 'praying';
        V.walkTo(v, spot.x, spot.z);
      } else if (arrived(v)) {
        v.anim = 'pray';
        game.addFaith(CFG.villager.prayFaith * (v.prayerSpot?.temple ? CFG.villager.templeMul : 1) * 0.6);
        if (Math.random() < 0.5) FX.moteAt(v.x, T.heightAt(v.x, v.z) + 1.6, v.z);
      }
      return;
    }
    if (phase === 'sleep') {
      if (v.state !== 'sleeping') {
        if (v.state !== 'praying' || arrived(v)) {
          v.state = 'sleeping';
          v.anim = 'sleep';
          v.path = null;
        }
      } else v.hp = Math.min(v.maxHp, v.hp + 0.02);
      return;
    }
    if (phase === 'dawn') {
      if (v.state === 'sleeping' || v.state === 'praying') { v.state = 'idle'; v.anim = 'idle'; }
    }
    // work day
    if (v.state === 'sleeping' || v.state === 'praying') { v.state = 'idle'; v.anim = 'idle'; }
    if (!v.adult) { childThink(v); return; }
    if (v.task) { execTask(v); return; }
    dispatch(game, v);      // jobs.js picks something (sets v.task or wander)
  }

  function childThink(v) {
    if (!v.path && Math.random() < 0.35) {
      const s = game.safeSpot();
      V.walkTo(v, s.x + rand(-7, 7), s.z + rand(-7, 7));
    }
  }

  function guardThink(v) {
    // engage nearest threat in sight
    const th = game.nearestThreat?.(v.x, v.z, 24);
    if (th) {
      v.target = th;
      const d = Math.hypot(th.x - v.x, th.z - v.z);
      if (d > CFG.villager.guardRange * 0.85) {
        if (!v.path) V.walkTo(v, th.x, th.z);
        v.anim = 'walk';
      } else {
        v.path = null;
        v.anim = 'aim';
        v.yaw = Math.atan2(th.x - v.x, th.z - v.z);
        if (v.atkT <= 0) {
          v.atkT = CFG.villager.guardCd;
          game.shootArrow(v, th);
        }
      }
      return;
    }
    v.target = null;
    if (v.task) { execTask(v); return; }
    // patrol between post and the fire
    if (!v.path && Math.random() < 0.4) {
      const post = v.employedAt;
      const s = game.safeSpot();
      const p = Math.random() < 0.5 && post ? { x: post.x + rand(-5, 5), z: post.z + rand(-5, 5) } : { x: s.x + rand(-8, 8), z: s.z + rand(-8, 8) };
      V.walkTo(v, p.x, p.z);
    }
  }

  function execTask(v) {
    const tk = v.task;
    if (!tk) return;
    if (v.state === 'goto') {
      if (arrived(v)) {
        v.state = 'working';
        v.workT = 0;
        v.anim = tk.anim || 'idle';
        if (tk.anim === 'chop') setTool(v, true);
        v.onSwing = tk.onSwing || null;
        tk.onStart?.(v);
      }
      return;
    }
    if (v.state === 'working') {
      v.workT += thinkDt * game.workMul();
      if (v.workT >= tk.dur) {
        const done = tk.onDone?.(v);
        if (done === 'keep') { v.workT = 0; return; }
        if (v.task === tk) {          // no chained task was assigned inside onDone
          v.task = null;
          v.onSwing = null;
          setTool(v, false);
          v.state = 'idle';
          v.anim = 'idle';
        }
      }
    }
  }

  // ── frame update ────────────────────────────────────────────────────────────
  let thinkDt = 0.55;
  V.tick = (dt, t) => {
    lastDt = dt;
    for (let i = V.list.length - 1; i >= 0; i--) {
      const v = V.list[i];
      const g = v.rig.group;
      if (v.dead) {
        v.deathT += dt;
        g.rotation.x = Math.min(Math.PI / 2, v.deathT * 2.5);
        if (v.deathT > 2.2) g.position.y -= dt * 0.7;
        if (v.deathT > 3.6) { scene.remove(g); V.list.splice(i, 1); }
        continue;
      }
      // needs
      v.hunger -= dt / (CFG.day.length * 1.35);
      if (v.hunger < 0) {
        v.hunger = 0;
        v.hp -= CFG.villager.starveDps * dt;
        if (v.hp <= 0) { kill(v); continue; }
      }
      if (v.atkT > 0) v.atkT -= dt;
      if (v.fleeT > 0) {
        v.fleeT -= dt;
        if (v.fleeT <= 0 && v.state === 'flee') { v.state = 'idle'; v.anim = 'idle'; }
      }
      // grow up
      if (!v.adult) {
        v.growT += dt;
        const k = clamp(v.growT / CFG.villager.growTime, 0, 1);
        g.scale.setScalar(lerp(0.6, 0.98, k) / 0.98);
        if (k >= 1) V.retrain(v, 'villager');
      }
      // think
      v.thinkT -= dt;
      if (v.thinkT <= 0) {
        v.thinkT = thinkDt + rand(0, 0.25);
        try { think(v); } catch (e) { console.error('think', e); clearTask(v); }
      }
      // move + pose + place
      stepAlong(v, dt);
      if (v.path) v.anim = v.carry ? 'carry' : 'walk';
      else if (v.anim === 'walk' || v.anim === 'carry') v.anim = 'idle';
      pose(v, t);
      g.position.set(v.x, T.heightAt(v.x, v.z) + v.bob, v.z);
      if (!v.path || v.anim === 'aim') g.rotation.y = v.yaw;
      else g.rotation.y = v.yaw;
    }
  };

  // reset daily flags at each new day
  V.onNewDay = () => { for (const v of V.list) v.ate = false; };

  // ── save / load ─────────────────────────────────────────────────────────────
  V.serialize = () => V.list.filter(v => !v.dead).map(v => ({
    j: v.job, m: v.modelName, x: +v.x.toFixed(1), z: +v.z.toFixed(1),
    hp: Math.round(v.hp), hu: +v.hunger.toFixed(2), a: v.adult ? 1 : 0, g: Math.round(v.growT),
    e: v.employedAt ? v.employedAt.id : 0,
  }));
  V.loadState = async (data, buildingById) => {
    for (const v of V.list) scene.remove(v.rig.group);
    V.list.length = 0;
    for (const d of data) {
      const v = await V.spawn(d.j, d.x, d.z, !!d.a, d.a ? d.m : null);
      v.hp = d.hp; v.hunger = d.hu; v.growT = d.g;
      if (d.e && buildingById(d.e)) v.employedAt = buildingById(d.e);
    }
  };

  return V;
}

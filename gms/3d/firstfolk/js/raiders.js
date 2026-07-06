// Threats. Age III: wolf packs slink out of the dark woods at night. Age IV+:
// a viking longboat beaches at dawn — raiders march on the stockpile, steal
// goods, torch what they pass, and row away. Guards, watchfires and Smite are
// the answer. Breaking a raid pays faith.

import * as THREE from 'three';
import { CFG, SEA } from './config.js';
import { model, loadRigGltf } from './assets.js';
import { buildRig, qx, qy, qz } from './rig.js';
import { worldToCell } from './terrain.js';
import * as FX from './fx.js';
import { rand, pick, clamp, lerp, lerpAngle, dist2 } from './utils.js';

export function createRaiders(game) {
  const { scene, T, W, PF } = game;
  const R = { threats: [], raidActive: false, boat: null, raidsBroken: 0 };

  // ── wolves ──────────────────────────────────────────────────────────────────
  R.spawnWolves = async (n) => {
    // slink in from a far forest edge
    let ox = -60, oz = -40;
    const tr = W.trees[Math.floor(Math.random() * W.trees.length)];
    if (tr && dist2(tr.x, tr.z, T.camp.x, T.camp.z) > 35 * 35) { ox = tr.x; oz = tr.z; }
    for (let i = 0; i < n; i++) {
      const m = await model('wolf');
      m.scale.setScalar(1.15);
      const x = ox + rand(-4, 4), z = oz + rand(-4, 4);
      m.position.set(x, T.heightAt(x, z), z);
      scene.add(m);
      R.threats.push({
        kind: 'wolf', x, z, yaw: 0, hp: CFG.wolves.hp, mesh: m,
        state: 'seek', target: null, path: null, pathI: 0, repathT: 0, atkT: 0, phase: rand(0, 9),
      });
    }
    game.ui?.toast('🐺 Wolves prowl the night…', true);
    game.AU?.sfx.wolf();
  };

  // ── raids ───────────────────────────────────────────────────────────────────
  R.launchRaid = async (n) => {
    if (R.raidActive) return;
    R.raidActive = true;
    // find open water in the direction away from the crag
    let ang = Math.atan2(T.camp.z, T.camp.x);
    let anchor = null, shore = null;
    for (let a = 0; a < Math.PI * 2 && !anchor; a += 0.22) {
      const dir = ang + a;
      for (let r = 30; r < 95; r += 2) {
        const x = T.camp.x + Math.cos(dir) * r, z = T.camp.z + Math.sin(dir) * r;
        if (Math.abs(x) > 92 || Math.abs(z) > 92) break;
        if (T.heightAt(x, z) < -1.2) {
          anchor = { x, z };
          const sx = T.camp.x + Math.cos(dir) * (r - 7), sz = T.camp.z + Math.sin(dir) * (r - 7);
          shore = { x: sx, z: sz };
          break;
        }
      }
    }
    if (!anchor) { R.raidActive = false; return; }

    const boat = await model('boat');
    boat.scale.setScalar(0.5);
    const far = { x: anchor.x * 1.9, z: anchor.z * 1.9 };
    boat.position.set(far.x, SEA + 0.1, far.z);
    scene.add(boat);
    R.boat = { mesh: boat, x: far.x, z: far.z, anchor, shore, state: 'arriving', aboard: 0, expected: n, t: 0 };
    game.ui?.banner('⚔️ RAIDERS!\nA longship darkens the water', true);
    game.AU?.sfx.raidHorn();

    // spawn the crew once beached (handled in tick when boat arrives)
    R.boat.spawnCrew = async () => {
      for (let i = 0; i < n; i++) {
        const mn = pick(['man_viking', 'woman_viking']);
        const gltf = await loadRigGltf(mn);
        const rig = buildRig(gltf.scene, { scale: 1.02, tint: 0xd8c8c0 });
        const x = shore.x + rand(-2, 2), z = shore.z + rand(-2, 2);
        rig.group.position.set(x, Math.max(T.heightAt(x, z), SEA), z);
        scene.add(rig.group);
        R.threats.push({
          kind: 'raider', x, z, yaw: 0, hp: CFG.raiders.hp, rig, mesh: rig.group,
          state: 'march', path: null, pathI: 0, repathT: 0, atkT: 0, workT: 0,
          loot: 0, torcher: i % 3 === 2, phase: rand(0, 9),
        });
      }
    };
  };

  R.alive = () => R.threats.filter(t => t.hp > 0);
  R.nearestThreat = (x, z, maxD = 30) => {
    let best = null, bd = maxD * maxD;
    for (const t of R.threats) {
      if (t.hp <= 0) continue;
      const d = dist2(x, z, t.x, t.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  R.anyNear = (x, z, r) => {
    for (const t of R.threats) if (t.hp > 0 && dist2(x, z, t.x, t.z) < r * r) return true;
    return false;
  };
  R.smiteAt = (x, z, r) => {
    let hits = 0;
    for (const t of R.threats) {
      if (t.hp > 0 && dist2(x, z, t.x, t.z) < r * r) { R.damage(t, 200); hits++; }
    }
    return hits;
  };
  R.damage = (t, dmg, from = null) => {
    if (t.hp <= 0) return;
    t.hp -= dmg;
    FX.burst(t.x, T.heightAt(t.x, t.z) + 1, t.z, { color: 0xc23b2a, n: 5, spread: 0.9, up: 1.4, size: 0.3, life: 0.45 });
    if (t.hp <= 0) die(t);
    else if (from && t.kind === 'raider') t.aggro = from;
  };
  function die(t) {
    t.hp = 0;
    FX.burst(t.x, T.heightAt(t.x, t.z) + 0.8, t.z, { color: 0x8a8a8a, n: 14, spread: 1.6, up: 2.4, size: 0.5, life: 0.8 });
    if (t.loot > 0) W.spawnDrop('wood', Math.ceil(t.loot / 2), t.x, t.z);
    scene.remove(t.mesh);
    R.threats.splice(R.threats.indexOf(t), 1);
    game.addFaith(2);
    game.AU?.sfx.threatDie();
    if (t.kind === 'raider') checkRaidOver();
  }

  function checkRaidOver() {
    if (!R.raidActive) return;
    const left = R.threats.filter(t => t.kind === 'raider' && t.hp > 0).length;
    if (left === 0 && R.boat && R.boat.state !== 'arriving') {
      R.boat.state = 'leaving';
      if (R.boat.aboard === 0) {
        R.raidsBroken++;
        game.addFaith(10);
        game.ui?.banner('🛡 RAID BROKEN!\nThe folk sing your name', false);
        game.AU?.sfx.victory();
      }
    }
  }

  // walk helper shared by wolves and raiders
  function walk(t, dt, speed, tx, tz) {
    t.repathT -= dt;
    if ((!t.path || t.repathT <= 0) && !t.pfPending) {
      t.repathT = 1.6;
      t.pfPending = true;
      PF.request(t.x, t.z, tx, tz, (p) => { t.pfPending = false; t.path = p; t.pathI = 1; }, true, t);
    }
    if (!t.path) return false;
    const p = t.path[t.pathI];
    if (!p) { t.path = null; return true; }
    const dx = p.x - t.x, dz = p.z - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) { t.pathI++; if (t.pathI >= t.path.length) { t.path = null; return true; } return false; }
    const st = Math.min(d, speed * dt);
    t.x += (dx / d) * st; t.z += (dz / d) * st;
    t.yaw = lerpAngle(t.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    return false;
  }

  function raiderPose(t, tm) {
    const P = t.rig.parts, ph = t.phase, DR = t.rig.DOWN_R, DL = t.rig.DOWN_L;
    if (t.state === 'fight' || t.state === 'steal' || t.state === 'torch') {
      const k = (tm * 1.4 + ph) % 1;
      const ang = k < 0.5 ? lerp(-0.5, -2.2, k * 2) : lerp(-2.2, -0.5, (k - 0.5) * 2);
      P.rArm?.apply(qx(ang).multiply(DR));
      P.lArm?.apply(qx(-0.6).multiply(DL));
      P.rElb?.apply(qx(-0.4)); P.lElb?.apply(qx(-0.7));
      P.rLeg?.apply(qx(0.25)); P.lLeg?.apply(qx(-0.25));
      return Math.abs(Math.sin(tm * 2.8)) * 0.03;
    }
    const sp = 6.5, sw = Math.sin(tm * sp + ph) * 0.55;
    P.rLeg?.apply(qx(sw)); P.lLeg?.apply(qx(-sw));
    P.rKnee?.apply(qx(Math.max(0, -sw) * 0.9)); P.lKnee?.apply(qx(Math.max(0, sw) * 0.9));
    P.rArm?.apply(qx(-sw * 0.8 - 0.15).multiply(DR)); P.lArm?.apply(qx(sw * 0.8 - 0.15).multiply(DL));
    P.rElb?.apply(qx(-0.35)); P.lElb?.apply(qx(-0.35));
    P.head?.apply(qy(Math.sin(tm * 0.7 + ph) * 0.15));
    return Math.abs(Math.sin(tm * sp + ph)) * 0.045;
  }

  // ── per-frame ───────────────────────────────────────────────────────────────
  R.tick = (dt, tm) => {
    // the boat
    if (R.boat) {
      const b = R.boat;
      b.t += dt;
      if (b.state === 'arriving') {
        const dx = b.anchor.x - b.x, dz = b.anchor.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) { b.state = 'landed'; b.spawnCrew(); }
        else { b.x += (dx / d) * dt * 6; b.z += (dz / d) * dt * 6; }
        b.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      } else if (b.state === 'leaving') {
        const dx = b.x - T.camp.x, dz = b.z - T.camp.z;
        const d = Math.hypot(dx, dz);
        b.x += (dx / d) * dt * 7; b.z += (dz / d) * dt * 7;
        b.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
        if (d > 150) { scene.remove(b.mesh); R.boat = null; R.raidActive = false; }
      }
      if (b.mesh) {
        b.mesh.position.set(b.x, SEA + 0.1 + Math.sin(tm * 1.1) * 0.16, b.z);
        b.mesh.rotation.z = Math.sin(tm * 0.9) * 0.03;
      }
    }

    const phase = W.phase();
    for (const t of [...R.threats]) {
      if (t.hp <= 0) continue;
      if (t.kind === 'wolf') tickWolf(t, dt, phase);
      else tickRaider(t, dt, tm);
      // place mesh
      const gy = Math.max(T.heightAt(t.x, t.z), SEA - 0.1);
      if (t.rig) {
        t.mesh.position.set(t.x, gy + raiderPose(t, tm), t.z);
        t.mesh.rotation.y = t.yaw;
      } else {
        t.mesh.position.set(t.x, gy + Math.abs(Math.sin(tm * 8 + t.phase)) * 0.08, t.z);
        t.mesh.rotation.y = t.yaw;
      }
      if (t.atkT > 0) t.atkT -= dt;
    }
  };

  function tickWolf(t, dt, phase) {
    if (phase === 'dawn' || phase === 'work') {
      // slink away and vanish
      t.state = 'leave';
      const arrivedEdge = walk(t, dt, CFG.wolves.speed * 0.9, t.x * 1.6 || 60, t.z * 1.6 || 60);
      if (arrivedEdge || Math.abs(t.x) > 88 || Math.abs(t.z) > 88) {
        scene.remove(t.mesh);
        R.threats.splice(R.threats.indexOf(t), 1);
      }
      return;
    }
    // hunt villagers outside the firelight
    const safe = game.safeSpot();
    let target = null, bd = 1e9;
    for (const v of game.V.list) {
      if (v.dead) continue;
      if (dist2(v.x, v.z, safe.x, safe.z) < 13 * 13) continue;    // firelight protects
      const d = dist2(t.x, t.z, v.x, v.z);
      if (d < bd) { bd = d; target = v; }
    }
    if (!target) {
      // lurk in a circle around the camp
      if (!t.lurk || Math.random() < 0.01) {
        const a = rand(0, Math.PI * 2);
        t.lurk = { x: safe.x + Math.cos(a) * 24, z: safe.z + Math.sin(a) * 24 };
      }
      walk(t, dt, CFG.wolves.speed * 0.55, t.lurk.x, t.lurk.z);
      return;
    }
    if (bd > 1.7 * 1.7) {
      walk(t, dt, CFG.wolves.speed, target.x, target.z);
    } else {
      t.yaw = Math.atan2(target.x - t.x, target.z - t.z);
      if (t.atkT <= 0) {
        t.atkT = CFG.wolves.atkCd;
        game.V.damage(target, CFG.wolves.dmg, t);
        game.AU?.sfx.bite();
      }
    }
  }

  function tickRaider(t, dt, tm) {
    const fire = game.safeSpot();
    // fight back the nearest guard in reach
    const foe = t.aggro && !t.aggro.dead ? t.aggro : null;
    if (foe && dist2(t.x, t.z, foe.x, foe.z) < 2.2 * 2.2) {
      t.state = 'fight';
      t.yaw = Math.atan2(foe.x - t.x, foe.z - t.z);
      if (t.atkT <= 0) {
        t.atkT = CFG.raiders.atkCd;
        game.V.damage(foe, CFG.raiders.dmg, t);
        game.AU?.sfx.clash();
      }
      return;
    }
    if (t.state === 'fight') t.state = t.loot > 0 ? 'return' : 'march';

    if (t.state === 'march') {
      if (t.torcher) {
        // torchers head for the nearest standing building
        let best = null, bd = 1e9;
        for (const b of game.B.list) {
          if (b.type === 'fire' || (b.state !== 'done' && b.state !== 'blessing')) continue;
          const d = dist2(t.x, t.z, b.x, b.z);
          if (d < bd) { bd = d; best = b; }
        }
        if (best && bd < 3.5 * 3.5) { t.state = 'torch'; t.workT = 0; t.victim = best; return; }
        if (best) { walk(t, dt, CFG.raiders.speed, best.x, best.z); return; }
      }
      const arrived = walk(t, dt, CFG.raiders.speed, fire.x, fire.z);
      if (arrived || dist2(t.x, t.z, fire.x, fire.z) < 3.5 * 3.5) { t.state = 'steal'; t.workT = 0; }
    } else if (t.state === 'steal') {
      t.workT += dt;
      if (t.workT > 2.6) {
        const s = game.stocks;
        const grab = Math.min(CFG.raiders.steal, (s.wood || 0) + (s.food || 0));
        let left = grab;
        const w = Math.min(s.wood, left); s.wood -= w; left -= w;
        const f = Math.min(s.food, left); s.food -= f;
        t.loot = grab;
        if (grab > 0) game.ui?.toast(`Raiders stole ${grab} goods!`, true);
        t.state = 'return';
      }
    } else if (t.state === 'torch') {
      t.workT += dt;
      if (t.workT > 2.2) {
        if (t.victim && game.B.list.includes(t.victim)) {
          game.B.ignite(t.victim);
          game.ui?.toast(`${t.victim.def?.name || 'A building'} is burning!`, true);
          game.AU?.sfx.fireWhoosh();
        }
        t.torcher = false;
        t.state = 'march';
      }
    } else if (t.state === 'return') {
      const b = R.boat;
      const bx = b ? b.shore.x : t.x, bz = b ? b.shore.z : t.z;
      const arrived = walk(t, dt, CFG.raiders.speed * 1.15, bx, bz);
      if (arrived || dist2(t.x, t.z, bx, bz) < 2.5 * 2.5) {
        scene.remove(t.mesh);
        R.threats.splice(R.threats.indexOf(t), 1);
        if (b) b.aboard++;
        checkRaidOver();
      }
    }
  }

  // called on phase changes from main
  R.onDusk = () => {
    const packs = R.threats.filter(t => t.kind === 'wolf').length;
    if (packs < 5 && game.state.age >= CFG.wolves.from && Math.random() < CFG.wolves.chance) {
      R.spawnWolves(Math.min(5 - packs, 2 + Math.floor(game.state.age / 2) + Math.floor(W.day / 10)));
    }
  };
  R.maybeRaid = () => {
    if (game.state.age < CFG.raiders.from || R.raidActive) return;
    if (W.day >= (game.state.nextRaidDay || 0)) {
      game.state.nextRaidDay = W.day + Math.round(rand(CFG.raiders.everyDays[0], CFG.raiders.everyDays[1]));
      R.launchRaid(3 + (game.state.age - 4) * 2 + Math.floor(W.day / 8));
    }
  };

  R.clearAll = () => {
    for (const t of [...R.threats]) { scene.remove(t.mesh); }
    R.threats.length = 0;
    if (R.boat) { scene.remove(R.boat.mesh); R.boat = null; }
    R.raidActive = false;
  };

  return R;
}

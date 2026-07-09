// Vehicles: defs, arcade kinematic driving (steer-toward-stick), collisions
// (buildings block harmlessly, props smash, cars trade paint + damage),
// damage smoke → fire → boom, enter/exit, and a reusable AI driver used by
// police, gangs, traffic and race rivals.

import * as THREE from 'three';
import { model } from './assets.js';
import { CFG } from './config.js';
import { clamp, angDiff, lerpAngle, rand, circleOBB } from './utils.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

// stats: top (m/s), accel (m/s²), grip (steer responsiveness ×), hp, mass ×
export const VEHICLES = {
  beater:   { name: 'Rusty Vega',   m: 'v_beater',   price: 0,     top: 16, accel: 9,  grip: 1.0,  hp: 90,  mass: 1.0, desc: "Rico's loaner. It runs. Mostly." },
  sedan:    { name: 'Commuter',     m: 'v_sedan',    price: 900,   top: 18, accel: 10, grip: 1.05, hp: 110, mass: 1.0, desc: 'Honest wheels for honest work.' },
  taxi:     { name: 'Palm Cab',     m: 'v_taxi',     price: 1400,  top: 19, accel: 11, grip: 1.2,  hp: 110, mass: 1.0, desc: 'Turns on a dime, smells of pine.' },
  pickup:   { name: 'Workhorse',    m: 'v_pickup',   price: 2200,  top: 18, accel: 10, grip: 0.95, hp: 150, mass: 1.35, desc: 'Props barely slow it down.' },
  hippie:   { name: 'Peace Wagon',  m: 'v_hippie',   price: 2600,  top: 16, accel: 8,  grip: 0.9,  hp: 140, mass: 1.25, desc: 'Good vibes, questionable brakes.' },
  van:      { name: 'Long Van',     m: 'v_van',      price: 3800,  top: 17, accel: 9,  grip: 0.85, hp: 190, mass: 1.5,  desc: "Serpent-spec panel van. Roomy." },
  sport:    { name: 'Viper GT',     m: 'v_sport',    price: 9500,  top: 26, accel: 16, grip: 1.3,  hp: 100, mass: 0.95, desc: 'Casino-valet bait. Very fast.' },
  formula:  { name: 'Dust Devil',   m: 'v_formula',  price: 16000, top: 30, accel: 20, grip: 1.45, hp: 60,  mass: 0.8,  desc: 'The airfield legend. Fragile rocket.' },
  police:   { name: 'Cruiser',      m: 'v_police',   price: 7000,  top: 22, accel: 13, grip: 1.15, hp: 150, mass: 1.15, desc: 'Cops look twice before chasing this.' },
  tow:      { name: 'Hook & Haul',  m: 'v_tow',      price: 4200,  top: 15, accel: 8,  grip: 0.8,  hp: 240, mass: 1.8,  desc: 'A rolling wall with a winch.' },
  bus:      { name: 'School Run',   m: 'v_bus',      price: 6500,  top: 14, accel: 6,  grip: 0.6,  hp: 320, mass: 2.6,  desc: 'Plows through everything politely.' },
  fire:     { name: 'Big Red',      m: 'v_fire',     price: 12000, top: 16, accel: 8,  grip: 0.7,  hp: 380, mass: 2.4,  weapon: 'watercannon', desc: 'Built-in water cannon. Cools tempers.' },
  military: { name: 'Warthog 6x6',  m: 'v_military', price: 22000, top: 17, accel: 10, grip: 0.85, hp: 420, mass: 2.2,  weapon: 'mg', desc: 'Army surplus. Mounted MG included.' },
  golf:     { name: 'Putt-Putt',    m: 'v_golf',     price: 300,   top: 11, accel: 12, grip: 1.5,  hp: 45,  mass: 0.5,  desc: "The people's champion." },
  armored:  { name: 'Money Box',    m: 'v_armored',  price: 30000, top: 15, accel: 7,  grip: 0.75, hp: 500, mass: 2.5,  desc: "Dane's dirty-cash fortress." },
};

const MODEL_YAW = 0;   // pack vehicles' forward axis correction (tuned by test)

export class Vehicles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.indicator = this._makeIndicator();
    scene.add(this.indicator);
    this.onSmash = null;      // (smashable) -> void  (heat/cash hooks)
    this.onCarHit = null;     // (a, b, relSpeed) -> void
    this.onExplode = null;    // (veh) -> void
  }

  _makeIndicator() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#8adfff';
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(18, 30); g.lineTo(48, 62); g.lineTo(78, 30);
    g.lineTo(78, 46); g.lineTo(48, 80); g.lineTo(18, 46); g.closePath();
    g.stroke(); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.6, 1.6, 1);
    sp.visible = false;
    sp.renderOrder = 50;
    return sp;
  }

  async spawn(type, x, z, rot = 0, { locked = false, paint = null, id = null, hpMul = 1 } = {}) {
    const def = VEHICLES[type] || VEHICLES.sedan;
    const group = await model(def.m, { ownMaterial: true });
    group.rotation.y = rot + MODEL_YAW;
    group.position.set(x, 0, z);
    this.scene.add(group);
    const size = group.userData.size || new THREE.Vector3(2, 1.6, 4.4);
    if (paint) this.paint(group, paint);
    const veh = {
      id: id || `${type}_${Math.floor(rand(0, 1e6))}`,
      type, def, group, size,
      x, z, yaw: rot, speed: 0,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      driver: null,           // null | 'player' | 'ai'
      ai: null, locked,
      weapon: def.weapon || null,
      radius: Math.max(size.x, size.z) * 0.32,
      halfLen: size.z * 0.36,
      dead: false, sunk: false,
      nitroT: 0, nitroCd: 0,
      smokeT: 0, roleTag: null, // 'traffic' | 'police' | 'gang' | null
      bounce: 0,
    };
    this.list.push(veh);
    return veh;
  }

  paint(group, color) {
    group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(color ? new THREE.Color(color) : new THREE.Color(0xffffff)); } });
  }

  remove(veh) {
    this.scene.remove(veh.group);
    const i = this.list.indexOf(veh);
    if (i >= 0) this.list.splice(i, 1);
  }

  nearestEnterable(x, z, range = CFG.foot.enterRange) {
    let best = null, bd = range * range;
    for (const v of this.list) {
      if (v.locked || v.dead || v.driver) continue;
      const dx = v.x - x, dz = v.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ── the arcade step. input = {x,z,mag,nitro} desired world dir ──
  step(veh, dt, input) {
    if (veh.dead) return;
    const def = veh.def;
    const terrain = this.world.terrainAt(veh.x, veh.z);
    const terrF = CFG.drive.offroadFactor[terrain] ?? 1;
    let top = def.top * terrF;
    // upgrades hook (player.js sets veh.upg = {topMul, gripMul, ...})
    if (veh.upg) top *= veh.upg.topMul;
    let accel = def.accel * (veh.upg?.accMul || 1);
    let grip = def.grip * (veh.upg?.gripMul || 1);

    // nitro
    if (veh.nitroCd > 0) veh.nitroCd -= dt;
    if (input?.nitro && veh.nitroT <= 0 && veh.nitroCd <= 0 && veh.upg?.nitro) {
      veh.nitroT = CFG.drive.nitroTime; veh.nitroCd = CFG.drive.nitroCd;
    }
    if (veh.nitroT > 0) {
      veh.nitroT -= dt; top *= CFG.drive.nitroBoost; accel *= 1.8;
      fx.puff(veh.x - Math.sin(veh.yaw) * veh.halfLen, 0.5, veh.z - Math.cos(veh.yaw) * veh.halfLen,
        { color: 0x9adfff, size: 1.2, up: 0.4, spread: 0.4, t: 0.4, growK: 1.4 });
    }

    let steering = 0;
    if (input && input.mag > 0.05) {
      const desYaw = Math.atan2(input.x, input.z);
      const d = angDiff(veh.yaw, desYaw);
      const absD = Math.abs(d);
      // stick pulled against motion at low speed → reverse
      const wantRev = absD > 2.30 && veh.speed < 4;
      if (wantRev) {
        veh.speed = Math.max(veh.speed - accel * 1.2 * dt, -CFG.drive.reverseTop * input.mag * terrF);
        steering = clamp(-d, -1, 1) * 0.7;
      } else {
        const throttle = clamp(Math.cos(d), -0.35, 1) * input.mag;
        veh.speed += throttle * accel * dt;
        steering = clamp(d, -1.35, 1.35);
      }
      const speedK = clamp(Math.abs(veh.speed) / 7, 0.15, 1);   // can't spin in place
      const turnFall = 1 / (1 + Math.abs(veh.speed) * 0.05);    // stable at speed
      veh.yaw += steering * CFG.drive.turnBase * grip * speedK * turnFall * dt * Math.sign(veh.speed || 1);
    }
    // drag + clamps
    const drag = CFG.drive.drag + (input && input.mag > 0.05 ? 0 : 6);
    veh.speed -= Math.sign(veh.speed) * Math.min(Math.abs(veh.speed), drag * dt * (veh.speed > top ? 4 : 1));
    veh.speed = clamp(veh.speed, -CFG.drive.reverseTop, Math.max(top, veh.speed - 20 * dt));

    // integrate
    const fx_ = Math.sin(veh.yaw), fz = Math.cos(veh.yaw);
    let nx = veh.x + fx_ * veh.speed * dt;
    let nz = veh.z + fz * veh.speed * dt;

    // ── building collisions (two probe circles, no damage) ──
    let bounced = false;
    for (const off of [veh.halfLen, -veh.halfLen]) {
      const px = nx + fx_ * off, pz = nz + fz * off;
      const res = this.world.collide(px, pz, veh.radius);
      if (res.hit) {
        nx += res.x - px; nz += res.z - pz;
        bounced = true;
      }
    }
    if (bounced) {
      if (Math.abs(veh.speed) > 6) {
        audio.crash(Math.min(1, Math.abs(veh.speed) / 22));
        fx.sparks(new THREE.Vector3(nx + fx_ * veh.halfLen, 0.7, nz + fz * veh.halfLen), 5);
        if (veh.driver === 'player') this.onShake?.(Math.abs(veh.speed) * 0.05);
      }
      veh.speed *= -CFG.drive.wallBounce * 0.6;
    }

    // ── smashables ──
    for (const s of this.world.smashables) {
      if (s.dead) continue;
      const dx = nx - s.x, dz = nz - s.z;
      const rr = veh.radius + veh.halfLen * 0.7 + s.r;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (Math.abs(veh.speed) >= CFG.drive.smashSpeed) {
        s.dead = true;
        fx.flingProp(s.obj, fx_ * veh.speed * 0.6 + rand(-2, 2), fz * veh.speed * 0.6 + rand(-2, 2));
        audio.smashSound();
        veh.speed *= s.hp > 30 ? 0.72 : 0.94;
        this.onSmash?.(s, veh);
      } else if (Math.abs(veh.speed) > 0.5) {
        veh.speed *= 0.85;   // nudging a prop slowly just squishes you against it
      }
    }

    // ── car-vs-car ──
    for (const o of this.list) {
      if (o === veh || o.dead) continue;
      const dx = nx - o.x, dz = nz - o.z;
      const rr = veh.radius + o.radius + Math.min(veh.halfLen, o.halfLen) * 0.6;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nxx = dx / d, nzz = dz / d;
      const overlap = rr - d;
      const mSum = veh.def.mass + o.def.mass;
      nx += nxx * overlap * (o.def.mass / mSum);
      nz += nzz * overlap * (o.def.mass / mSum);
      o.x -= nxx * overlap * (veh.def.mass / mSum);
      o.z -= nzz * overlap * (veh.def.mass / mSum);
      const rel = Math.abs(veh.speed) + Math.abs(o.speed) * 0.4;
      if (rel > 4) {
        const dmg = rel * CFG.drive.ramDamage;
        this.damage(o, dmg * (veh.def.mass / o.def.mass), veh);
        this.damage(veh, dmg * 0.35 * (o.def.mass / veh.def.mass), o);
        o.speed += veh.speed * 0.35 * (veh.def.mass / mSum);
        veh.speed *= 0.55;
        audio.crash(Math.min(1, rel / 24));
        fx.sparks(new THREE.Vector3((nx + o.x) / 2, 0.8, (nz + o.z) / 2), 7);
        this.onCarHit?.(veh, o, rel);
        if (veh.driver === 'player' || o.driver === 'player') this.onShake?.(rel * 0.045);
      }
    }

    veh.x = nx; veh.z = nz;

    // ── terrain feedback ──
    const spd = Math.abs(veh.speed);
    if (terrain === 'w') {
      if (spd > 1 && Math.random() < 0.5) fx.splash(veh.x, veh.z);
      this.damage(veh, CFG.drive.waterDps * dt, null, true);
      veh.speed *= 1 - 1.8 * dt;
    } else if (terrF < 1 && spd > CFG.drive.dustSpeed) {
      const bx = veh.x - fx_ * veh.halfLen, bz = veh.z - fz * veh.halfLen;
      if (Math.random() < spd / 14) fx.dust(bx, bz, terrain, spd / def.top);
    }
    // hard cornering smoke on tarmac
    if (terrF >= 1 && spd > 12 && Math.abs(steering) > 0.9) {
      const bx = veh.x - fx_ * veh.halfLen, bz = veh.z - fz * veh.halfLen;
      if (Math.random() < 0.5) fx.tyreSmoke(bx, bz);
      veh.skidding = true;
    } else veh.skidding = false;

    // damage smoke / fire
    const frac = veh.hp / veh.maxHp;
    veh.smokeT -= dt;
    if (frac < 0.6 && veh.smokeT <= 0) {
      veh.smokeT = frac < 0.35 ? 0.05 : 0.13;
      const sx = veh.x + fx_ * veh.halfLen * 0.6, sz = veh.z + fz * veh.halfLen * 0.6;
      fx.damageSmoke(sx, veh.size.y * 0.75, sz, frac < 0.35);
      if (frac < 0.18) fx.firePuff(sx, veh.size.y * 0.55, sz);
    }

    // sync visual
    veh.group.position.set(veh.x, veh.sunk ? -0.9 : 0, veh.z);
    veh.group.rotation.y = veh.yaw + MODEL_YAW;
    // cartoon lean into corners + accel squat
    const lean = clamp(steering, -1, 1) * clamp(spd / def.top, 0, 1);
    veh.group.rotation.z = lerpAngle(veh.group.rotation.z, -lean * 0.09, 1 - Math.exp(-8 * dt));
    veh.group.rotation.x = lerpAngle(veh.group.rotation.x, -clamp(veh.speed / top || 0, -1, 1) * 0.02, 1 - Math.exp(-6 * dt));
  }

  damage(veh, amt, from = null, silent = false) {
    if (veh.dead || amt <= 0) return;
    const armor = veh.upg?.armorMul || 1;
    veh.hp -= amt / armor;
    if (veh.hp <= 0) {
      veh.hp = 0; veh.dead = true;
      const inWater = this.world.terrainAt(veh.x, veh.z) === 'w';
      if (inWater) {
        veh.sunk = true;
        fx.splash(veh.x, veh.z, true);
      } else {
        fx.explosion(veh.x, 0.5, veh.z, 4 + veh.def.mass * 1.5);
        audio.explosion(veh.def.mass > 1.6);
        // scorch the wreck
        veh.group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
        // AOE to neighbours
        for (const o of this.list) {
          if (o === veh || o.dead) continue;
          const d2 = (o.x - veh.x) ** 2 + (o.z - veh.z) ** 2;
          if (d2 < 64) this.damage(o, 55 * (1 - Math.sqrt(d2) / 8), veh);
        }
      }
      this.onExplode?.(veh, from);
    }
  }

  repair(veh, amt) { veh.hp = Math.min(veh.maxHp, veh.hp + amt); }

  // ── reusable AI steering: head to (tx,tz), avoid blockers with feelers ──
  aiInput(veh, tx, tz, speedScale = 1) {
    let dx = tx - veh.x, dz = tz - veh.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist; dz /= dist;
    // feeler: probe ahead; if inside a blocker, try 40° left/right
    const ahead = 5 + Math.abs(veh.speed) * 0.55;
    const fxx = Math.sin(veh.yaw), fzz = Math.cos(veh.yaw);
    const bl = (x, z) => {
      for (const b of this.world.colliders) {
        if (Math.abs(x - b.x) > b.hw + 2.4 || Math.abs(z - b.z) > b.hh + 2.4) continue;
        if (circleOBB(x, z, veh.radius, b)) return true;
      }
      return false;
    };
    if (bl(veh.x + fxx * ahead, veh.z + fzz * ahead)) {
      const l = { x: Math.sin(veh.yaw - 0.8), z: Math.cos(veh.yaw - 0.8) };
      const r = { x: Math.sin(veh.yaw + 0.8), z: Math.cos(veh.yaw + 0.8) };
      const lFree = !bl(veh.x + l.x * ahead, veh.z + l.z * ahead);
      const rFree = !bl(veh.x + r.x * ahead, veh.z + r.z * ahead);
      if (lFree && !rFree) { dx = l.x; dz = l.z; }
      else if (rFree && !lFree) { dx = r.x; dz = r.z; }
      else if (rFree) { dx = (dx + r.x); dz = (dz + r.z); const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; }
      else { dx = -fxx; dz = -fzz; }   // boxed in: back out
    }
    return { x: dx, z: dz, mag: speedScale, dist };
  }

  // bouncing indicator above the nearest enterable car
  tickIndicator(dt, playerPos, onFoot) {
    const v = onFoot ? this.nearestEnterable(playerPos.x, playerPos.z) : null;
    this.indicatorTarget = v;
    if (v) {
      this.indicator.visible = true;
      const t = performance.now() / 1000;
      this.indicator.position.set(v.x, v.size.y + 1.5 + Math.abs(Math.sin(t * 3.2)) * 0.5, v.z);
    } else this.indicator.visible = false;
  }

  clearAll() {
    for (const v of [...this.list]) this.remove(v);
  }
}

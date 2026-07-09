// Weapons + pickups. No gun models anywhere — a weapon is a stat row, a
// muzzle flash, a projectile streak and a hit reaction. Both the on-foot
// character and any car can hold one. Unlimited ammo, cooldown-gated.

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, rand, angDiff } from './utils.js';
import { model } from './assets.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

export const WEAPONS = {
  pistol:  { name: 'Pistol',      cd: 0.42, dmg: 14, speed: 55, range: 44, color: 0xffe9a8, glyph: 'P',  chip: '#d8d8d8' },
  smg:     { name: 'SMG',         cd: 0.11, dmg: 7,  speed: 65, range: 40, spread: 0.07, color: 0xffe9a8, glyph: 'S', chip: '#9adfff' },
  shotgun: { name: 'Shotgun',     cd: 0.95, dmg: 8,  speed: 50, range: 24, pellets: 6, spread: 0.30, color: 0xffd2a8, glyph: 'SG', chip: '#ffb066' },
  rifle:   { name: 'Rifle',       cd: 1.05, dmg: 42, speed: 110, range: 80, color: 0xd2ffb0, glyph: 'R', chip: '#b6e88a' },
  rocket:  { name: 'Rockets',     cd: 1.60, dmg: 70, speed: 34, range: 75, aoe: 6, color: 0xffb066, glyph: 'RK', chip: '#ff8a66' },
  flamer:  { name: 'Flamer',      cd: 0.05, dmg: 3.6, range: 12, cone: true, color: 0xff9a2e, glyph: 'FL', chip: '#ffd23e' },
  mg:      { name: 'Mounted MG',  cd: 0.09, dmg: 9,  speed: 80, range: 48, spread: 0.05, color: 0xffe9a8, glyph: 'MG', chip: '#c8ffc8', builtin: true },
  watercannon: { name: 'Water Cannon', cd: 0.05, dmg: 1.2, range: 15, cone: true, water: true, push: 26, color: 0xbfe6f5, glyph: 'WC', chip: '#bfe6f5', builtin: true },
};

export class Weapons {
  constructor(scene, world, vehicles) {
    this.scene = scene; this.world = world; this.vehicles = vehicles;
    this.shots = [];
    this.groups = new Map();   // name -> { list: () => [{x,z,y?,r?,alive}], onHit(a, dmg, owner) }
    this.geo = new THREE.SphereGeometry(0.14, 6, 5);
    this.rocketGeo = new THREE.SphereGeometry(0.3, 6, 5);
  }
  targetGroup(name, spec) { this.groups.set(name, spec); }

  // snap yaw onto the juiciest target in a cone (mobile aim assist)
  assist(x, z, yaw, range, owner) {
    let best = null, bestScore = 0.4;   // min cone ≈ 23°
    const consider = (tx, tz, weight = 1) => {
      const d = Math.hypot(tx - x, tz - z);
      if (d > range || d < 1.5) return;
      const dy = Math.atan2(tx - x, tz - z);
      const off = Math.abs(angDiff(yaw, dy));
      if (off > 0.6) return;
      const score = (1 - off / 0.6) * (1 - d / (range * 1.4)) * weight;
      if (score > bestScore) { bestScore = score; best = dy; }
    };
    for (const v of this.vehicles.list) {
      if (v.dead || v.driver === 'player') continue;
      if (owner === 'player' && !v.roleTag && !v.driver) continue;   // don't magnetise onto parked cars
      consider(v.x, v.z, v.roleTag ? 1.2 : 0.6);
    }
    for (const [gn, g] of this.groups) {
      if (gn === 'player' && owner === 'player') continue;
      if (gn !== 'player' && owner !== 'player') continue;
      for (const a of g.list()) if (a.alive) consider(a.x, a.z, 1.4);
    }
    return best ?? yaw;
  }

  fire(x, y, z, yaw, weaponId, owner = 'player') {
    const w = WEAPONS[weaponId];
    if (!w) return;
    const muzzle = new THREE.Vector3(x, y, z);
    fx.muzzleFlash(muzzle);
    if (w.cone) {
      // cone weapons: pure particles + immediate wide-arc damage query
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      if (w.water) { fx.waterJet(x, y, z, dx, dz); if (Math.random() < 0.2) audio.flame(); }
      else { fx.flameJet(x, y, z, dx, dz); if (Math.random() < 0.25) audio.flame(); }
      this._coneHit(x, z, yaw, w, owner);
      return;
    }
    audio.gunshot(weaponId);
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = yaw + (w.spread ? rand(-w.spread, w.spread) : 0) + (n > 1 ? (i - n / 2) * 0.06 : 0);
      const isRocket = weaponId === 'rocket';
      const m = new THREE.Mesh(isRocket ? this.rocketGeo : this.geo,
        new THREE.MeshBasicMaterial({ color: w.color }));
      m.position.set(x, y, z);
      this.scene.add(m);
      this.shots.push({
        m, x, z, y, yaw: a, spd: w.speed, dmg: w.dmg, range: w.range,
        traveled: 0, owner, w, alive: true,
      });
    }
  }

  _coneHit(x, z, yaw, w, owner) {
    const hitArc = (tx, tz) => {
      const d = Math.hypot(tx - x, tz - z);
      if (d > w.range || d < 0.5) return 0;
      const off = Math.abs(angDiff(yaw, Math.atan2(tx - x, tz - z)));
      return off < 0.45 ? 1 - d / w.range : 0;
    };
    for (const v of this.vehicles.list) {
      if (v.dead) continue;
      if (owner === 'player' && v.driver === 'player') continue;
      const k = hitArc(v.x, v.z);
      if (k > 0) {
        this.vehicles.damage(v, w.dmg * k, owner);
        if (w.push) { const dy = Math.atan2(v.x - x, v.z - z); v.x += Math.sin(dy) * w.push * k * 0.016; v.z += Math.cos(dy) * w.push * k * 0.016; }
        this._notifyVehHit(v, owner);
      }
    }
    for (const [gn, g] of this.groups) {
      if (gn === 'player' && owner === 'player') continue;
      if (gn !== 'player' && owner !== 'player') continue;
      for (const a of g.list()) {
        if (!a.alive) continue;
        const k = hitArc(a.x, a.z);
        if (k > 0) g.onHit(a, w.dmg * k * 1.6, owner, yaw);
      }
    }
    for (const s of this.world.smashables) {
      if (s.dead) continue;
      const k = hitArc(s.x, s.z);
      if (k > 0) { s.hp -= w.dmg * k; if (s.hp <= 0) this._smash(s, yaw); }
    }
  }

  _smash(s, yaw) {
    s.dead = true;
    fx.flingProp(s.obj, Math.sin(yaw) * 6 + rand(-2, 2), Math.cos(yaw) * 6 + rand(-2, 2));
    audio.smashSound();
    this.vehicles.onSmash?.(s, null);
  }

  _notifyVehHit(v, owner) { this.onVehicleShot?.(v, owner); }

  tick(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const step = s.spd * dt;
      s.traveled += step;
      const dx = Math.sin(s.yaw), dz = Math.cos(s.yaw);
      s.x += dx * step; s.z += dz * step;
      s.m.position.set(s.x, s.y, s.z);
      let dead = s.traveled >= s.range;

      // buildings stop shots
      if (!dead) {
        for (const b of this.world.colliders) {
          if (b.edge || !b.tall) continue;
          if (Math.abs(s.x - b.x) > b.hw + 0.4 || Math.abs(s.z - b.z) > b.hh + 0.4) continue;
          // point-in-OBB check in box space
          const sn = Math.sin(-b.rot), cs = Math.cos(-b.rot);
          const lx = (s.x - b.x) * cs - (s.z - b.z) * sn, lz = (s.x - b.x) * sn + (s.z - b.z) * cs;
          if (Math.abs(lx) < b.hw && Math.abs(lz) < b.hh) { dead = true; fx.sparks(s.m.position, 3, 0xcccccc); break; }
        }
      }
      // vehicles
      if (!dead) {
        for (const v of this.vehicles.list) {
          if (v.dead) continue;
          if (s.owner === 'player' && v.driver === 'player') continue;
          if (s.owner !== 'player' && (v.roleTag === 'police' || v.roleTag === 'gang') && s.owner !== 'gang') continue;
          const rr = v.radius + v.halfLen * 0.55;
          if ((v.x - s.x) ** 2 + (v.z - s.z) ** 2 < rr * rr) {
            this.vehicles.damage(v, s.dmg, s.owner);
            this._notifyVehHit(v, s.owner);
            fx.sparks(s.m.position, 4);
            dead = true; break;
          }
        }
      }
      // actors
      if (!dead) {
        for (const [gn, g] of this.groups) {
          if (gn === 'player' && s.owner === 'player') continue;
          if (gn !== 'player' && s.owner !== 'player') continue;
          for (const a of g.list()) {
            if (!a.alive) continue;
            const r = a.r || 0.8;
            if ((a.x - s.x) ** 2 + (a.z - s.z) ** 2 < r * r) {
              g.onHit(a, s.dmg, s.owner, s.yaw);
              dead = true; break;
            }
          }
          if (dead) break;
        }
      }
      // smashables
      if (!dead) {
        for (const sm of this.world.smashables) {
          if (sm.dead) continue;
          if ((sm.x - s.x) ** 2 + (sm.z - s.z) ** 2 < (sm.r + 0.3) ** 2) {
            sm.hp -= s.dmg;
            if (sm.hp <= 0) this._smash(sm, s.yaw);
            dead = true; break;
          }
        }
      }
      if (dead) {
        if (s.w.aoe) {
          fx.explosion(s.x, s.y, s.z, s.w.aoe);
          audio.explosion(false);
          for (const v of this.vehicles.list) {
            if (v.dead) continue;
            const d2 = (v.x - s.x) ** 2 + (v.z - s.z) ** 2;
            if (d2 < s.w.aoe ** 2) {
              this.vehicles.damage(v, s.dmg * (1 - Math.sqrt(d2) / s.w.aoe), s.owner);
              this._notifyVehHit(v, s.owner);
            }
          }
          for (const [gn, g] of this.groups) {
            for (const a of g.list()) {
              if (!a.alive) continue;
              const d2 = (a.x - s.x) ** 2 + (a.z - s.z) ** 2;
              if (d2 < s.w.aoe ** 2) g.onHit(a, s.dmg * (1 - Math.sqrt(d2) / s.w.aoe), s.owner, s.yaw);
            }
          }
        }
        if (s.traveled >= s.range && !s.w.aoe) fx.sparks(s.m.position, 2, 0x888888);
        this.scene.remove(s.m);
        s.m.material.dispose();
        this.shots.splice(i, 1);
      } else if (s.w === WEAPONS.rocket || s.w.aoe) {
        fx.puff(s.x, s.y, s.z, { color: 0x9a9aa2, size: 0.8, up: 0.5, spread: 0.1, t: 0.5, growK: 1.4 });
      }
    }
  }

  clear() {
    for (const s of this.shots) { this.scene.remove(s.m); s.m.material.dispose(); }
    this.shots = [];
  }
}

// ═════════════ pickups: weapons, cash, repair, health ═════════════

function chipSprite(glyph, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(18, 18, 92, 92, 24); g.fill(); g.stroke();
  g.fillStyle = '#18202a';
  g.font = `900 ${glyph.length > 1 ? 44 : 62}px -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyph, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.5, 1.5, 1);
  return sp;
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.time = 0;
  }

  async add(kind, x, z, data = {}) {
    let obj;
    if (kind === 'gun') obj = chipSprite(WEAPONS[data.w].glyph, WEAPONS[data.w].chip);
    else if (kind === 'cash') obj = chipSprite('$', '#8ef0b2');
    else if (kind === 'wrench') { obj = await model('wrench'); obj.scale.setScalar(1.6); }
    else if (kind === 'medkit') { obj = await model('medkit'); obj.scale.setScalar(1.4); }
    obj.position.set(x, 1.1, z);
    this.scene.add(obj);
    const p = { kind, x, z, obj, data, respawn: data.respawn ?? 20, hidden: false, t: 0 };
    this.list.push(p);
    return p;
  }

  // try to collect at (x,z); returns the pickup or null. radius generous for cars.
  collect(x, z, r = CFG.foot.pickupRange) {
    for (const p of this.list) {
      if (p.hidden) continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) {
        p.hidden = true; p.t = 0;
        p.obj.visible = false;
        fx.collectBurst(new THREE.Vector3(p.x, 1.2, p.z), p.kind === 'cash' ? 0x8ef0b2 : 0x9adfff);
        if (p.data.once) {
          this.scene.remove(p.obj);
          this.list.splice(this.list.indexOf(p), 1);
        }
        return p;
      }
    }
    return null;
  }

  tick(dt) {
    this.time += dt;
    for (const p of this.list) {
      if (p.hidden) {
        p.t += dt;
        if (p.t > p.respawn) { p.hidden = false; p.obj.visible = true; }
        continue;
      }
      p.obj.position.y = 1.1 + Math.sin(this.time * 2.4 + p.x * 0.7) * 0.22;
      if (!p.obj.isSprite) p.obj.rotation.y += dt * 2.2;
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.obj);
    this.list = [];
  }
}

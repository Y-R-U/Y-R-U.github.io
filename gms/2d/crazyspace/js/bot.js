// bot.js — AI controller. Sets ship.cmd each frame via FSM + steering.

import { TILE, BULLET } from './config.js';
import { rand, randInt, clamp, angleDiff, angleTo, TAU, dist } from './util.js';

export class Bot {
  constructor(ship, skill = 0.6) {
    this.ship = ship;
    this.skill = clamp(skill + rand(-0.12, 0.12), 0.25, 0.98);
    this.target = null;
    this.retarget = 0;
    this.roam = null;
    this.roamTimer = 0;
    this.fireJitter = 0;
    this.objectiveBias = rand(0.3, 0.75); // how objective-focused this bot is
    this.desiredRange = rand(220, 360);
  }

  think(dt, game) {
    const s = this.ship;
    const c = s.cmd;
    c.fireGun = c.fireBomb = c.fireSpecial = false;
    c.turn = 0; c.thrust = 0; c.aimAngle = null; c.aimMag = 0;
    if (!s.alive) return;

    this.retarget -= dt;
    if (this.retarget <= 0 || (this.target && (!this.target.alive))) {
      this.target = this._pickTarget(game);
      this.retarget = 0.2 + rand(0, 0.25);
    }
    this.fireJitter -= dt;

    const lowEnergy = s.energy < s.maxEff() * 0.32;
    const tgt = this.target;
    const tgtDist = tgt ? dist(s.x, s.y, tgt.x, tgt.y) : Infinity;

    // objective hint from the game mode (CTF base/flag, KOTH zone…)
    const obj = game.mode.objectiveFor ? game.mode.objectiveFor(s, game) : null;

    let desired = s.angle, thrust = 0.0, point = null;

    // ---- decide goal ----
    if (lowEnergy && tgt && tgtDist < 460) {
      // FLEE away from threat, grab a green if handy
      const green = this._nearestPrize(game, 520);
      if (green) point = green;
      else { desired = angleTo(tgt.x, tgt.y, s.x, s.y); thrust = 1; }
    } else if (obj && (s.carryingFlag || Math.random() < this.objectiveBias)) {
      point = obj;
    } else if (tgt && tgtDist < 720) {
      // ATTACK
      const aim = this._lead(s, tgt);
      desired = angleTo(s.x, s.y, aim.x, aim.y) + this._aimError();
      const facing = Math.abs(angleDiff(s.angle, angleTo(s.x, s.y, tgt.x, tgt.y)));
      // keep range
      if (tgtDist > this.desiredRange + 90) thrust = 1;
      else if (tgtDist < this.desiredRange - 90) { desired = angleTo(tgt.x, tgt.y, s.x, s.y); thrust = 0.8; }
      else { thrust = 0.35 + Math.sin(game.time * 2 + this.id) * 0.2; }

      // shooting
      const aligned = Math.abs(angleDiff(s.angle, angleTo(s.x, s.y, aim.x, aim.y))) < 0.18 + (1 - this.skill) * 0.12;
      if (aligned && tgtDist < 560 && this.fireJitter <= 0 && s.energy > s.def.gunCost * 2) {
        c.fireGun = true;
        this.fireJitter = (0.12 + (1 - this.skill) * 0.25);
      }
      if (aligned && tgtDist < 360 && s.bombs > 0 && s.energy > s.def.bombCost * 1.4 && Math.random() < 0.012 + this.skill * 0.02) {
        c.fireBomb = true;
      }
      // specials: repel when something is close, burst when in melee
      if (tgtDist < 150 && s.specialAmmo > 0 && Math.random() < 0.04) c.fireSpecial = true;
      else if (this._incomingThreat(game) && s.def.special === 'repel' && s.specialAmmo > 0 && Math.random() < 0.5) c.fireSpecial = true;
    } else {
      // WANDER / COLLECT
      const green = this._nearestPrize(game, 900);
      if (green) point = green;
      else {
        this.roamTimer -= dt;
        if (!this.roam || this.roamTimer <= 0) { this.roam = game.world.randomOpenPoint(5); this.roamTimer = rand(3, 6); }
        point = this.roam;
      }
    }

    if (point) { desired = angleTo(s.x, s.y, point.x, point.y); thrust = 1; }

    // ---- wall avoidance ----
    desired = this._avoidWalls(game, desired, thrust);

    c.aimAngle = desired;
    c.aimMag = clamp(thrust, 0, 1);
  }

  get id() { return this.ship.id; }

  _aimError() {
    const e = (1 - this.skill) * 0.4;
    return rand(-e, e);
  }

  _pickTarget(game) {
    const s = this.ship;
    let best = null, bestD = Infinity;
    for (const o of game.ships) {
      if (o === s || !o.alive) continue;
      if (!game.areEnemies(s, o)) continue;
      const d = dist(s.x, s.y, o.x, o.y);
      const score = d - (o.shieldTime > 0 ? -300 : 0); // avoid shielded
      if (score < bestD) { bestD = score; best = o; }
    }
    return best;
  }

  _nearestPrize(game, maxD) {
    const s = this.ship;
    let best = null, bestD = maxD * maxD;
    for (const p of game.prizes) {
      const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _incomingThreat(game) {
    const s = this.ship;
    for (const b of game.bullets) {
      if (b.team === s.team) continue;
      const dx = s.x - b.x, dy = s.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 200 * 200) continue;
      // heading roughly toward us?
      if (b.vx * dx + b.vy * dy > 0) return true;
    }
    return false;
  }

  _lead(s, tgt) {
    const projSpeed = BULLET.speed;
    const d = dist(s.x, s.y, tgt.x, tgt.y);
    let t = d / projSpeed;
    // one refinement step
    const px = tgt.x + tgt.vx * t, py = tgt.y + tgt.vy * t;
    t = dist(s.x, s.y, px, py) / projSpeed;
    return { x: tgt.x + tgt.vx * t, y: tgt.y + tgt.vy * t };
  }

  _clearAhead(world, x, y, angle, dist) {
    const steps = 5, step = dist / steps;
    let cx = x, cy = y;
    const dx = Math.cos(angle) * step, dy = Math.sin(angle) * step;
    for (let i = 0; i < steps; i++) {
      cx += dx; cy += dy;
      if (world.isSolidPx(cx, cy)) return false;
    }
    return true;
  }

  _avoidWalls(game, desired, thrust) {
    const s = this.ship;
    const look = TILE * 4.5;
    if (this._clearAhead(game.world, s.x, s.y, desired, look)) return desired;
    // scan outward for the nearest clear heading
    for (let off = 0.35; off <= Math.PI; off += 0.35) {
      for (const sgn of [1, -1]) {
        const a = desired + sgn * off;
        if (this._clearAhead(game.world, s.x, s.y, a, look)) return a;
      }
    }
    return desired;
  }
}

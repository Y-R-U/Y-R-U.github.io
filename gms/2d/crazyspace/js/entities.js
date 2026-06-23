// entities.js — ships, projectiles, prizes, flags, particles.

import {
  TILE, BULLET, BOMB, MINE, BURST, REPEL, PRIZE_CAPS, RESPAWN_DELAY, PALETTE,
} from './config.js';
import {
  clamp, rand, randInt, TAU, rotateToward, angleDiff, sign, uid,
} from './util.js';
import * as Spr from './sprites.js';

// ----------------------------------------------------------------- particles
export class Particles {
  constructor(cap = 1400) { this.cap = cap; this.list = []; }

  _add(p) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }

  burst(x, y, color, power = 1, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = rand(TAU), s = rand(40, 320) * power;
      this._add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.3, 0.7) * power, max: 0.7, r: rand(2, 5) * power,
        color, kind: 'spark', drag: 2.5,
      });
    }
    // shock ring
    this._add({ x, y, vx: 0, vy: 0, life: 0.4 * power, max: 0.4 * power, r: 6, color, kind: 'ring', grow: 380 * power });
  }

  hit(x, y, color, dir) {
    for (let i = 0; i < 6; i++) {
      const a = dir + rand(-0.9, 0.9), s = rand(60, 220);
      this._add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.35), max: 0.35, r: rand(1.5, 3), color, kind: 'spark', drag: 3 });
    }
  }

  trail(x, y, color, size = 3) {
    this._add({ x, y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.35, max: 0.35, r: size, color, kind: 'spark', drag: 4 });
  }

  ring(x, y, color, r0, grow, life) {
    this._add({ x, y, vx: 0, vy: 0, life, max: life, r: r0, color, kind: 'ring', grow });
  }

  warp(x, y, color) {
    for (let i = 0; i < 22; i++) {
      const a = rand(TAU), d = rand(40, 120);
      this._add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.5, vy: -Math.sin(a) * d * 2.5, life: 0.4, max: 0.4, r: rand(2, 4), color, kind: 'spark', drag: 1.5 });
    }
    this.ring(x, y, color, 90, -200, 0.45);
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      if (p.kind === 'ring') { p.r += p.grow * dt; if (p.r < 0) p.r = 0; }
      else {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'ring') {
        ctx.globalAlpha = a * 0.8;
        ctx.lineWidth = 2 + a * 3;
        ctx.strokeStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        const g = Spr.glow(p.color, p.r * 2.2);
        ctx.drawImage(g, p.x - p.r * 2.2, p.y - p.r * 2.2, p.r * 4.4, p.r * 4.4);
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ projectiles
export class Bullet {
  constructor(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = opts.radius; this.dmg = opts.dmg; this.team = opts.team;
    this.owner = opts.owner; this.life = opts.life; this.bounces = opts.bounces || 0;
    this.color = opts.color; this.alive = true; this.kind = 'bullet';
  }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.isSolidPx(nx, ny)) {
      if (this.bounces > 0) {
        const hx = world.isSolidPx(nx, this.y), hy = world.isSolidPx(this.x, ny);
        if (hx) this.vx = -this.vx;
        if (hy) this.vy = -this.vy;
        if (!hx && !hy) { this.vx = -this.vx; this.vy = -this.vy; }
        this.bounces--;
      } else { this.alive = false; }
    } else { this.x = nx; this.y = ny; }
  }
  draw(ctx) {
    const r = this.radius;
    const g = Spr.glow(this.color, r * 3);
    ctx.drawImage(g, this.x - r * 3, this.y - r * 3, r * 6, r * 6);
    const w = Spr.glow('#ffffff', r * 1.3);
    ctx.drawImage(w, this.x - r * 1.3, this.y - r * 1.3, r * 2.6, r * 2.6);
  }
}

export class Bomb {
  constructor(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = opts.radius; this.dmg = opts.dmg; this.blast = opts.blast;
    this.team = opts.team; this.owner = opts.owner; this.life = opts.life;
    this.color = PALETTE.bomb; this.alive = true; this.exploded = false; this.kind = 'bomb';
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.exploded = true; this.alive = false; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.isSolidPx(nx, ny)) { this.exploded = true; this.alive = false; }
    else { this.x = nx; this.y = ny; }
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(this.t * 22) * 0.18;
    const r = this.radius * pulse;
    const o = Spr.orb(this.color, r);
    const s = r * 4.4;
    ctx.drawImage(o, this.x - s / 2, this.y - s / 2, s, s);
  }
}

export class Mine {
  constructor(x, y, opts) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.radius = MINE.radius; this.dmg = opts.dmg; this.blast = MINE.blast;
    this.team = opts.team; this.owner = opts.owner; this.life = MINE.life;
    this.arm = 0.6; this.alive = true; this.exploded = false; this.kind = 'mine';
    this.t = 0;
  }
  update(dt) { this.t += dt; this.arm -= dt; this.life -= dt; if (this.life <= 0) { this.exploded = true; this.alive = false; } }
  draw(ctx) {
    const pulse = 0.6 + Math.abs(Math.sin(this.t * 4)) * 0.4;
    const o = Spr.orb('#ff3d6e', this.radius);
    const s = this.radius * 4;
    ctx.globalAlpha = pulse; ctx.drawImage(o, this.x - s / 2, this.y - s / 2, s, s); ctx.globalAlpha = 1;
  }
}

// ----------------------------------------------------------------------- prize
export class Prize {
  constructor(x, y, type, label) {
    this.x = x; this.y = y; this.type = type; this.label = label;
    const a = rand(TAU), s = rand(20, 70);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.radius = 11; this.life = rand(16, 26); this.alive = true; this.t = rand(TAU);
  }
  update(dt, world) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (world.isSolidPx(nx, ny)) {
      if (world.isSolidPx(nx, this.y)) this.vx = -this.vx;
      if (world.isSolidPx(this.x, ny)) this.vy = -this.vy;
    } else { this.x = nx; this.y = ny; }
  }
  draw(ctx) {
    const blink = this.life < 4 ? (Math.sin(this.t * 16) > 0 ? 1 : 0.25) : 1;
    const bob = Math.sin(this.t * 3) * 2;
    ctx.globalAlpha = blink;
    const sp = Spr.prize(PALETTE.prize, this.radius);
    const s = this.radius * 4.8;
    ctx.drawImage(sp, this.x - s / 2, this.y - s / 2 + bob, s, s);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------ flag
export class Flag {
  constructor(team, x, y) {
    this.team = team; this.homeX = x; this.homeY = y;
    this.x = x; this.y = y; this.state = 'home'; this.carrier = null;
    this.radius = 16; this.dropTimer = 0;
  }
}

// ------------------------------------------------------------------------ ship
export class Ship {
  constructor(def, team, opts = {}) {
    this.def = def; this.team = team;
    this.id = uid();
    this.name = opts.name || def.name;
    this.isPlayer = !!opts.isPlayer;
    this.isBot = !!opts.isBot;
    this.color = opts.color;     // {color, glow, dark}
    this.radius = def.radius;
    this.spriteShape = def.shape;

    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.angle = -Math.PI / 2;
    this.cmd = { turn: 0, thrust: 0, aimAngle: null, aimMag: 0, fireGun: false, fireBomb: false, fireSpecial: false };

    this.alive = true; this.respawnTimer = 0;
    this.gunCd = 0; this.bombCd = 0; this.specialCd = 0;
    this.shieldTime = opts.spawnShield || 0;
    this.flashTime = 0; this.thrustVisual = 0;

    this.stats = { kills: 0, deaths: 0, score: 0, caps: 0, returns: 0 };
    this.carryingFlag = null;

    this.resetLoadout();
    this.energy = this.maxEff();
  }

  resetLoadout() {
    const d = this.def;
    this.guns = d.guns; this.bombs = d.bombs;
    this.multifire = !!d.multifire; this.bounce = false;
    this.energyBonus = 0; this.rechargeBonus = 0; this.thrustBonus = 0;
    this.speedBonus = 0; this.rotationBonus = 0;
    this.specialAmmo = 3; this.bounty = 0;
  }

  maxEff() { return this.def.maxEnergy + this.energyBonus; }
  get thrustForce() { return this.def.thrust + this.thrustBonus; }
  get topSpeed() { return this.def.top + this.speedBonus; }
  get turnSpeed() { return this.def.turn + this.rotationBonus; }
  get rechargeRate() { return this.def.recharge + this.rechargeBonus; }

  spawn(x, y, angle = -Math.PI / 2) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.angle = angle;
    this.alive = true; this.respawnTimer = 0;
    this.resetLoadout();
    this.energy = this.maxEff();
    this.shieldTime = 2.2; this.gunCd = this.bombCd = this.specialCd = 0;
    this.carryingFlag = null;
  }

  update(dt, game) {
    if (!this.alive) { this.respawnTimer -= dt; return; }

    // timers
    this.gunCd = Math.max(0, this.gunCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);

    const c = this.cmd;
    // steering: aim (joystick / bot) takes priority over discrete turn
    let accel = 0;
    if (c.aimAngle !== null && c.aimAngle !== undefined) {
      this.angle = rotateToward(this.angle, c.aimAngle, this.turnSpeed * dt);
      accel = c.aimMag;
    } else {
      this.angle += c.turn * this.turnSpeed * dt;
      accel = c.thrust;
    }

    if (accel !== 0) {
      const f = this.thrustForce * (accel < 0 ? 0.55 : 1) * accel;
      this.vx += Math.cos(this.angle) * f * dt;
      this.vy += Math.sin(this.angle) * f * dt;
      this.thrustVisual = clamp(Math.abs(accel), 0, 1);
      if (accel > 0.2 && Math.random() < 0.8) {
        const bx = this.x - Math.cos(this.angle) * this.radius;
        const by = this.y - Math.sin(this.angle) * this.radius;
        game.particles.trail(bx, by, this.color.glow, 2.5);
      }
    } else this.thrustVisual *= 0.85;

    // light friction keeps it controllable while preserving drift
    const fr = Math.max(0, 1 - 0.5 * dt);
    this.vx *= fr; this.vy *= fr;
    // clamp speed
    const sp = Math.hypot(this.vx, this.vy);
    const max = this.topSpeed;
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }

    this.x += this.vx * dt; this.y += this.vy * dt;
    game.world.resolveCircle(this);

    // recharge
    this.energy = Math.min(this.maxEff(), this.energy + this.rechargeRate * dt);

    // firing
    if (c.fireGun) this.fireGun(game);
    if (c.fireBomb) this.fireBomb(game);
    if (c.fireSpecial) this.fireSpecial(game);
  }

  noseDir(angle = this.angle) { return { x: Math.cos(angle), y: Math.sin(angle) }; }

  fireGun(game) {
    if (this.gunCd > 0) return;
    const cost = this.def.gunCost;
    if (this.energy < cost) return;
    this.energy -= cost;
    this.gunCd = 1 / this.def.fireRate;
    const lvl = this.guns;
    const dmg = this.def.gunDmg * BULLET.levelDmg[lvl];
    const radius = BULLET.levelRadius[lvl];
    const spd = BULLET.speed;
    const d = this.noseDir();
    const px = this.x + d.x * (this.radius + 4), py = this.y + d.y * (this.radius + 4);
    const angles = this.multifire ? [-0.14, 0, 0.14] : [0];
    for (const off of angles) {
      const a = this.angle + off;
      const vx = this.vx + Math.cos(a) * spd, vy = this.vy + Math.sin(a) * spd;
      game.bullets.push(new Bullet(px, py, vx, vy, {
        radius, dmg, team: this.team, owner: this.id, life: BULLET.life,
        bounces: this.bounce ? 2 : 0, color: this.color.color,
      }));
    }
    game.audio && game.audio.gun(lvl);
  }

  fireBomb(game) {
    if (this.bombCd > 0 || this.bombs < 1) return;
    const cost = this.def.bombCost;
    if (this.energy < cost) return;
    const speed = Math.hypot(this.vx, this.vy);
    this.energy -= cost;
    this.bombCd = 1 / this.def.bombRate;
    const lvl = this.bombs;
    const d = this.noseDir();
    const px = this.x + d.x * (this.radius + 6), py = this.y + d.y * (this.radius + 6);
    if (speed < 45) {
      // lay a mine when nearly stationary
      game.mines.push(new Mine(px, py, { dmg: this.def.bombDmg * BOMB.levelDmg[lvl] * 1.3, team: this.team, owner: this.id }));
      game.audio && game.audio.mine();
      return;
    }
    const vx = this.vx + d.x * BOMB.speed, vy = this.vy + d.y * BOMB.speed;
    game.bombs.push(new Bomb(px, py, vx, vy, {
      radius: BOMB.radius, dmg: this.def.bombDmg * BOMB.levelDmg[lvl],
      blast: BOMB.blast[lvl], team: this.team, owner: this.id, life: BOMB.life,
    }));
    game.audio && game.audio.bomb();
  }

  fireSpecial(game) {
    if (this.specialCd > 0 || this.specialAmmo <= 0) return;
    this.specialCd = 0.7; this.specialAmmo--;
    if (this.def.special === 'repel') {
      game.repels.push({ x: this.x, y: this.y, r: 0, life: REPEL.life, team: this.team, owner: this.id });
      game.particles.ring(this.x, this.y, this.color.glow, 20, REPEL.radius / REPEL.life, REPEL.life);
      game.audio && game.audio.repel();
    } else {
      // burst
      for (let i = 0; i < BURST.count; i++) {
        const a = (i / BURST.count) * TAU;
        game.bullets.push(new Bullet(this.x, this.y, this.vx + Math.cos(a) * BURST.speed, this.vy + Math.sin(a) * BURST.speed, {
          radius: BURST.radius, dmg: BURST.dmg, team: this.team, owner: this.id,
          life: BURST.life, bounces: 0, color: '#ffffff',
        }));
      }
      game.particles.ring(this.x, this.y, '#ffffff', 10, 500, 0.3);
      game.audio && game.audio.burst();
    }
  }

  damage(amt, game, attackerId) {
    if (!this.alive || this.shieldTime > 0) return;
    this.energy -= amt;
    this.flashTime = 0.12;
    if (this.energy <= 0) this.kill(game, attackerId);
  }

  kill(game, attackerId) {
    this.alive = false; this.vx = 0; this.vy = 0;
    this.respawnTimer = RESPAWN_DELAY;
    this.stats.deaths++;
    game.onKill(attackerId, this);
  }

  applyPrize(type) {
    const C = PRIZE_CAPS;
    let msg = '';
    switch (type) {
      case 'gun': if (this.guns < this.def.maxGuns) { this.guns++; msg = 'Gun L' + this.guns; } else { this.energy = this.maxEff(); msg = 'Recharged'; } break;
      case 'bomb': if (this.bombs < this.def.maxBombs) { this.bombs++; msg = 'Bomb L' + this.bombs; } else { msg = '+Special'; this.specialAmmo = Math.min(8, this.specialAmmo + 1); } break;
      case 'energy': this.energyBonus = Math.min(C.energyBonus, this.energyBonus + 150); this.energy += 150; msg = 'Max Energy+'; break;
      case 'recharge': this.rechargeBonus = Math.min(C.rechargeBonus, this.rechargeBonus + 45); msg = 'Recharge+'; break;
      case 'thrust': this.thrustBonus = Math.min(C.thrustBonus, this.thrustBonus + 95); msg = 'Thrust+'; break;
      case 'speed': this.speedBonus = Math.min(C.speedBonus, this.speedBonus + 22); msg = 'Speed+'; break;
      case 'rotation': this.rotationBonus = Math.min(C.rotationBonus, this.rotationBonus + 0.3); msg = 'Rotation+'; break;
      case 'multifire': this.multifire = true; msg = 'Multifire'; break;
      case 'bounce': this.bounce = true; msg = 'Bounce'; break;
      case 'burst': case 'repel': case 'rocket': this.specialAmmo = Math.min(8, this.specialAmmo + 1); msg = '+Special'; break;
      case 'fullcharge': this.energy = this.maxEff(); msg = 'Full Charge'; break;
      case 'shield': this.shieldTime = Math.max(this.shieldTime, 6); msg = 'Shields'; break;
      default: msg = ''; // dud
    }
    this.bounty++;
    return msg;
  }

  draw(ctx, game) {
    if (!this.alive) return;
    const flick = this.energy / this.maxEff() < 0.22 && Math.sin(game.time * 30) > 0;
    // thrust flame
    if (this.thrustVisual > 0.15) {
      const back = this.angle + Math.PI;
      const fx = this.x + Math.cos(back) * (this.radius + 2);
      const fy = this.y + Math.sin(back) * (this.radius + 2);
      const fl = (this.radius + 6) * (0.6 + this.thrustVisual * 0.9) * (0.85 + Math.random() * 0.3);
      const g = Spr.glow(this.color.glow, fl);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g, fx - fl, fy - fl, fl * 2, fl * 2);
      ctx.restore();
    }
    // shield
    if (this.shieldTime > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(game.time * 10) * 0.12;
      ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // body — sprite art points +x, so rotate straight to facing angle
    const sprite = Spr.ship(this.spriteShape, this.color, this.radius);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (flick) ctx.globalAlpha = 0.5;
    if (this.flashTime > 0) ctx.globalCompositeOperation = 'lighter';
    const s = sprite.width;
    ctx.drawImage(sprite, -s / 2, -s / 2);
    ctx.restore();
  }
}

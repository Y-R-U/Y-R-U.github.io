// game.js — world simulation, collisions, camera, render orchestration.

import {
  SHIPS, TEAMS, TILE, PALETTE, PRIZE_MAX, PRIZE_SPAWN, PRIZES, REPEL,
} from './config.js';
import {
  clamp, rand, randInt, pick, weighted, NAMES, TAU, dist, lerp, fmtTime,
} from './util.js';
import { generateMap } from './world.js';
import { Ship, Particles, Prize } from './entities.js';
import { Bot } from './bot.js';
import { createMode } from './modes.js';
import { Starfield } from './starfield.js';
import * as Spr from './sprites.js';

function ffaColor(h) {
  return { color: `hsl(${h},90%,62%)`, glow: `hsl(${h},100%,80%)`, dark: `hsl(${h},75%,30%)` };
}

export class Game {
  constructor({ input, audio, modeKey, shipKey, difficulty = 0.6 }) {
    this.input = input;
    this.audio = audio;
    this.modeKey = modeKey;
    this.shipKey = shipKey;
    this.difficulty = difficulty;

    this.world = generateMap(modeKey);
    this.mode = createMode(modeKey, this);
    this.starfield = new Starfield();
    this.particles = new Particles();

    this.ships = [];
    this.bullets = [];
    this.bombs = [];
    this.mines = [];
    this.prizes = [];
    this.repels = [];
    this.flags = [];
    this.zone = null;
    this.shipById = new Map();

    this.killFeed = [];
    this.popups = [];
    this.banner = null;

    this.time = 0;
    this.matchTime = this.mode.def.time;
    this.state = 'playing';
    this.prizeTimer = 1.0;
    this.onEnd = null;

    this.camera = { x: 0, y: 0, zoom: 1, shake: 0, sx: 0, sy: 0 };

    this._buildRoster();
    this.mode.init();
    // seed some prizes
    for (let i = 0; i < 14; i++) this._spawnPrize();
  }

  _buildRoster() {
    const botCount = this.mode.def.bots;
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    const usedHue = [];

    // player
    const playerColor = this.mode.ffa ? TEAMS[0] : TEAMS[0];
    const player = new Ship(SHIPS[this.shipKey], 0, { isPlayer: true, name: 'You', color: playerColor });
    this.player = player;
    this._addShip(player, 0);

    // team balancing for team modes
    const counts = [1, 0];
    const shipKeys = Object.keys(SHIPS);

    for (let i = 0; i < botCount; i++) {
      let team, color;
      if (this.mode.ffa) {
        team = 1000 + i; // unique
        const h = (i * 47 + 20) % 360; usedHue.push(h);
        color = ffaColor(h);
      } else {
        team = counts[0] <= counts[1] ? 0 : 1;
        counts[team]++;
        color = TEAMS[team];
      }
      const def = SHIPS[pick(shipKeys)];
      const bot = new Ship(def, team, { isBot: true, name: names[i % names.length], color });
      bot.ai = new Bot(bot, this.difficulty);
      this._addShip(bot, team);
    }
  }

  _addShip(ship, team) {
    const p = this.world.spawnFor(team);
    ship.spawn(p.x, p.y, rand(TAU));
    this.ships.push(ship);
    this.shipById.set(ship.id, ship);
  }

  areEnemies(a, b) { return this.mode.areEnemies(a, b); }

  popup(text, x, y, color = '#fff', scale = 1) {
    this.popups.push({ text, x, y, color, scale, life: 1.1, max: 1.1 });
  }
  bigEvent(text) { this.banner = { text, life: 2.6 }; this.audio && this.audio.bigEvent(); }
  addShake(a) { this.camera.shake = Math.max(this.camera.shake, a); }

  setViewport(W, H) {
    this.W = W; this.H = H;
    this.camera.zoom = clamp(Math.min(W, H) / (15 * TILE), 0.55, 1.45);
  }

  // ----------------------------------------------------------------- update
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    if (this.state === 'playing') {
      this.matchTime -= dt;
      if (this.matchTime <= 0) { this.matchTime = 0; this.mode.onTimeUp(); }
      this._updateShips(dt);
      this._updateProjectiles(dt);
      this._updateRepels(dt);
      this.mode.update(dt);
      this._updatePrizes(dt);
    }

    this.particles.update(dt);
    this._updateEphemera(dt);
    this._updateCamera(dt);
  }

  _updateShips(dt) {
    for (const s of this.ships) {
      if (s.isPlayer && s.alive) {
        const it = this.input.intent();
        s.cmd.aimAngle = it.aimAngle; s.cmd.aimMag = it.aimMag;
        s.cmd.turn = it.turn; s.cmd.thrust = it.thrust;
        s.cmd.fireGun = it.fireGun; s.cmd.fireBomb = it.fireBomb;
        s.cmd.fireSpecial = this.input.consumePressed('special');
      } else if (s.ai) {
        s.ai.think(dt, this);
      }
      s.update(dt, this);
      if (!s.alive && s.respawnTimer <= 0) this._respawn(s);
    }
  }

  _respawn(s) {
    const p = this.world.spawnFor(s.team);
    s.spawn(p.x, p.y, rand(TAU));
    this.particles.warp(p.x, p.y, s.color.glow);
    if (s.isPlayer && this.audio) this.audio.respawn();
  }

  _updateProjectiles(dt) {
    const W = this.world;
    // bullets
    for (const b of this.bullets) {
      b.update(dt, W);
      if (!b.alive) continue;
      for (const s of this.ships) {
        if (!s.alive || s.team === b.team) continue;
        if (dist(b.x, b.y, s.x, s.y) < s.radius + b.radius) {
          if (s.shieldTime > 0) { this.particles.hit(b.x, b.y, '#9fe8ff', Math.atan2(b.vy, b.vx)); }
          else { s.damage(b.dmg, this, b.owner); this.particles.hit(b.x, b.y, s.color.glow, Math.atan2(b.vy, b.vx)); this._hitSound(s); }
          b.alive = false;
          break;
        }
      }
    }
    // bombs
    for (const b of this.bombs) {
      b.update(dt, W);
      if (b.alive) {
        for (const s of this.ships) {
          if (!s.alive || s.team === b.team) continue;
          if (dist(b.x, b.y, s.x, s.y) < s.radius + b.radius) { b.exploded = true; b.alive = false; break; }
        }
      }
      if (b.exploded) this._explode(b.x, b.y, b.blast, b.dmg, b.team, b.owner, 1.0);
    }
    // mines
    for (const m of this.mines) {
      m.update(dt);
      if (m.alive && m.arm <= 0) {
        for (const s of this.ships) {
          if (!s.alive || s.team === m.team) continue;
          if (dist(m.x, m.y, s.x, s.y) < s.radius + 26) { m.exploded = true; m.alive = false; break; }
        }
      }
      if (m.exploded) this._explode(m.x, m.y, m.blast, m.dmg, m.team, m.owner, 1.1);
    }
    this.bullets = this.bullets.filter(b => b.alive);
    this.bombs = this.bombs.filter(b => b.alive);
    this.mines = this.mines.filter(b => b.alive);
  }

  _explode(x, y, blast, dmg, team, owner, power) {
    this.particles.burst(x, y, PALETTE.bomb, 1.3 * power, 22);
    this.particles.ring(x, y, '#ffd98b', 12, blast / 0.32, 0.32);
    this.addShake(7 * power);
    this.audio && this.audio.explosion(power);
    for (const s of this.ships) {
      if (!s.alive || s.team === team) continue;
      const d = dist(x, y, s.x, s.y);
      if (d < blast) {
        const fall = 1 - d / blast;
        s.damage(dmg * (0.35 + 0.65 * fall), this, owner);
      }
    }
  }

  _hitSound(s) {
    // only play near the camera to avoid noise
    if (dist(s.x, s.y, this.camera.x, this.camera.y) < 700 && this.audio) this.audio.hit();
  }

  _updateRepels(dt) {
    for (const rp of this.repels) {
      rp.life -= dt;
      const R = REPEL.radius;
      for (const s of this.ships) {
        if (!s.alive || s.id === rp.owner) continue;
        const d = dist(rp.x, rp.y, s.x, s.y);
        if (d < R && d > 0.1) {
          const f = REPEL.force * (1 - d / R) * dt;
          s.vx += (s.x - rp.x) / d * f;
          s.vy += (s.y - rp.y) / d * f;
        }
      }
      for (const arr of [this.bullets, this.bombs]) {
        for (const b of arr) {
          if (b.team === rp.team) continue;
          const d = dist(rp.x, rp.y, b.x, b.y);
          if (d < R && d > 0.1) {
            const f = REPEL.force * 2.4 * (1 - d / R) * dt;
            b.vx += (b.x - rp.x) / d * f;
            b.vy += (b.y - rp.y) / d * f;
          }
        }
      }
    }
    this.repels = this.repels.filter(r => r.life > 0);
  }

  _spawnPrize() {
    const p = this.world.randomOpenPoint(4);
    const def = weighted(PRIZES);
    this.prizes.push(new Prize(p.x, p.y, def.type, def.label));
  }

  _updatePrizes(dt) {
    this.prizeTimer -= dt;
    if (this.prizeTimer <= 0 && this.prizes.length < PRIZE_MAX) { this._spawnPrize(); this.prizeTimer = PRIZE_SPAWN; }
    for (const p of this.prizes) {
      p.update(dt, this.world);
      if (!p.alive) continue;
      for (const s of this.ships) {
        if (!s.alive) continue;
        if (dist(p.x, p.y, s.x, s.y) < s.radius + p.radius) {
          const msg = s.applyPrize(p.type);
          this.particles.burst(p.x, p.y, PALETTE.prize, 0.5, 8);
          if (s.isPlayer) { if (msg) this.popup(msg, s.x, s.y - 6, PALETTE.prize); this.audio && this.audio.pickup(); }
          p.alive = false;
          break;
        }
      }
    }
    this.prizes = this.prizes.filter(p => p.alive);
  }

  // called by Ship.kill
  onKill(attackerId, victim) {
    const killer = this.shipById.get(attackerId);
    this.particles.burst(victim.x, victim.y, victim.color.glow, 1.6, 30);
    this.particles.burst(victim.x, victim.y, '#ffffff', 1.0, 14);
    this.particles.ring(victim.x, victim.y, victim.color.glow, 10, 520, 0.4);
    this.addShake(victim.isPlayer ? 14 : 8);
    this.audio && this.audio.explosion(victim.isPlayer ? 1.4 : 1);

    // drop a few greens
    const n = clamp(2 + (victim.bounty / 2 | 0), 2, 7);
    for (let i = 0; i < n; i++) {
      const def = weighted(PRIZES);
      const a = rand(TAU), d = rand(8, 36);
      this.prizes.push(new Prize(victim.x + Math.cos(a) * d, victim.y + Math.sin(a) * d, def.type, def.label));
    }
    this.mode.onKill(killer, victim);
  }

  endMatch(text) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winnerText = text;
    this.banner = { text, life: 9999 };
    if (this.onEnd) this.onEnd(text);
  }

  _updateEphemera(dt) {
    for (const p of this.popups) { p.life -= dt; p.y -= 22 * dt; }
    this.popups = this.popups.filter(p => p.life > 0);
    for (const k of this.killFeed) k.t -= dt;
    while (this.killFeed.length > 6) this.killFeed.shift();
    this.killFeed = this.killFeed.filter(k => k.t > 0);
    if (this.banner && this.banner.life < 100) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
  }

  _updateCamera(dt) {
    const c = this.camera;
    const tx = this.player.x, ty = this.player.y;
    c.x = lerp(c.x, tx, 1 - Math.pow(0.0008, dt));
    c.y = lerp(c.y, ty, 1 - Math.pow(0.0008, dt));
    c.shake = Math.max(0, c.shake - c.shake * 9 * dt - 6 * dt);
    c.sx = rand(-1, 1) * c.shake;
    c.sy = rand(-1, 1) * c.shake;
  }

  // ----------------------------------------------------------------- render
  render(ctx, W, H) {
    const c = this.camera;
    this.starfield.render(ctx, c, W, H);

    ctx.save();
    ctx.translate(W / 2 + c.sx, H / 2 + c.sy);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);

    const view = {
      x0: c.x - W / 2 / c.zoom, y0: c.y - H / 2 / c.zoom,
      x1: c.x + W / 2 / c.zoom, y1: c.y + H / 2 / c.zoom,
    };

    this._drawWalls(ctx, view);
    this._drawObjectives(ctx);
    for (const p of this.prizes) p.draw(ctx);
    for (const m of this.mines) m.draw(ctx);
    for (const b of this.bombs) b.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const s of this.ships) s.draw(ctx, this);
    this.particles.draw(ctx);
    this._drawPopups(ctx);

    ctx.restore();
  }

  _drawWalls(ctx, view) {
    const W = this.world;
    const c0 = Math.max(0, (view.x0 / TILE) | 0), c1 = Math.min(W.cols - 1, (view.x1 / TILE | 0) + 1);
    const r0 = Math.max(0, (view.y0 / TILE) | 0), r1 = Math.min(W.rows - 1, (view.y1 / TILE | 0) + 1);
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (!W.isSolid(cc, r)) continue;
        const x = cc * TILE, y = r * TILE;
        const g = ctx.createLinearGradient(x, y, x, y + TILE);
        g.addColorStop(0, '#39459b');
        g.addColorStop(1, PALETTE.wall);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
        // bright edges on exposed faces
        ctx.strokeStyle = PALETTE.wallEdge;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (!W.isSolid(cc, r - 1)) { ctx.moveTo(x, y + 1); ctx.lineTo(x + TILE, y + 1); }
        if (!W.isSolid(cc, r + 1)) { ctx.moveTo(x, y + TILE - 1); ctx.lineTo(x + TILE, y + TILE - 1); }
        if (!W.isSolid(cc - 1, r)) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + TILE); }
        if (!W.isSolid(cc + 1, r)) { ctx.moveTo(x + TILE - 1, y); ctx.lineTo(x + TILE - 1, y + TILE); }
        ctx.stroke();
      }
    }
  }

  _drawObjectives(ctx) {
    // zone (KOTH)
    if (this.zone) {
      const z = this.zone;
      const holder = this.mode.holder;
      const col = holder === 0 ? TEAMS[0].color : holder === 1 ? TEAMS[1].color : (this.mode.contested ? '#ffae42' : '#7a86c8');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, 'rgba(0,0,0,0)');
      g.addColorStop(1, col);
      ctx.globalAlpha = 0.25; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // bases
    for (const b of this.world.bases) {
      const t = TEAMS[b.team];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 50);
      g.addColorStop(0, t.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.4; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, 50, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = t.color; ctx.globalAlpha = 0.8; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, 38, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // flags
    for (const f of this.flags) {
      const t = TEAMS[f.team];
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.strokeStyle = '#dfe6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 12); ctx.stroke();
      const wave = Math.sin(this.time * 6) * 3;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(16 + wave, -10); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
      if (f.state !== 'home') {
        ctx.globalCompositeOperation = 'lighter';
        const g = Spr.glow(t.glow, 26);
        ctx.drawImage(g, -26, -26, 52, 52);
      }
      ctx.restore();
    }
  }

  _drawPopups(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.round(13 * p.scale)}px system-ui`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  // sorted scoreboard rows
  scoreboard() {
    const rows = this.ships.map(s => ({
      name: s.name, isPlayer: s.isPlayer, team: s.team, color: s.color.color,
      kills: s.stats.kills, deaths: s.stats.deaths, caps: s.stats.caps, score: s.stats.score,
    }));
    rows.sort((a, b) => (b.score + b.kills) - (a.score + a.kills) || b.kills - a.kills);
    return rows;
  }
}

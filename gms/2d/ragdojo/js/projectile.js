import { stroke, circle, rect, INK } from './ink.js';
import { GRAVITY } from './config.js';

export class Projectile {
  constructor(o) {
    this.type = o.type;            // band | bomb | crumb
    this.x = o.x; this.y = o.y;
    this.vx = o.vx; this.vy = o.vy;
    this.owner = o.owner;
    this.dmg = o.dmg;
    this.kb = o.kb;
    this.life = o.life ?? 4;
    this.rot = 0;
    this.spin = (o.vx > 0 ? 1 : -1) * 12;
    this.bounces = this.type === 'band' ? 2 : 0;
    this.dead = false;
    this.seed = (Math.random() * 1e6) | 0;
    this.fuse = this.type === 'bomb' ? 1.35 : 0;
  }

  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += GRAVITY * (this.type === 'band' ? 0.55 : 0.8) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.y > world.groundY - 6) {
      this.y = world.groundY - 6;
      if (this.bounces-- > 0) { this.vy *= -0.52; this.vx *= 0.7; }
      else if (this.type === 'bomb') { this.vy *= -0.25; this.vx *= 0.5; }
      else { this.dead = true; this.explode = false; }
    }
    if (this.x < world.minX || this.x > world.maxX) this.vx *= -0.6;
    if (this.type === 'bomb') { this.fuse -= dt; if (this.fuse <= 0) this.dead = true; }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (this.type === 'band') {
      ctx.strokeStyle = '#c8683f';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6.5, 0, 0, 6.283);
      ctx.stroke();
    } else if (this.type === 'bomb') {
      const puff = this.fuse < 0.4 ? 1 + (0.4 - this.fuse) * 1.4 : 1;
      ctx.fillStyle = '#e8b7bd';
      ctx.strokeStyle = '#7a4048';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-13 * puff, -8 * puff, 26 * puff, 16 * puff, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9dbe8';
      ctx.fillRect(-13 * puff, -8 * puff, 8 * puff, 16 * puff);
      ctx.strokeRect(-13 * puff, -8 * puff, 8 * puff, 16 * puff);
    } else {
      ctx.fillStyle = '#d8cfae';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
}

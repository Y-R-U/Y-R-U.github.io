import { stroke, circle, rect, INK } from './ink.js';
import { GRAVITY } from './config.js';

export class Projectile {
  constructor(o) {
    this.type = o.type;            // band | bomb | crumb | knife | slug
    this.x = o.x; this.y = o.y;
    this.vx = o.vx; this.vy = o.vy;
    this.owner = o.owner;
    this.dmg = o.dmg;
    this.kb = o.kb;
    this.life = o.life ?? (this.type === 'slug' ? 1.4 : 4);
    this.rot = 0;
    this.spin = (o.vx > 0 ? 1 : -1) * (this.type === 'knife' ? 26 : this.type === 'slug' ? 0 : 12);
    this.bounces = this.type === 'band' ? 2 : 0;
    this.spinRate = this.type === 'knife' ? 26 : 0;
    this.dead = false;
    this.seed = (Math.random() * 1e6) | 0;
    this.fuse = this.type === 'bomb' ? 1.35 : 0;
  }

  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    // A slug does not drop over the width of a sheet of paper; a knife barely does.
    const drop = { band: 0.55, knife: 0.30, slug: 0 }[this.type] ?? 0.8;
    this.vy += GRAVITY * drop * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.y > world.groundY - 6) {
      this.y = world.groundY - 6;
      if (this.bounces-- > 0) { this.vy *= -0.52; this.vx *= 0.7; }
      // A bag of flour goes off when it lands, not a second later once everyone has walked
      // away from it.
      else { this.dead = true; }
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
    } else if (this.type === 'knife') {
      // A blade: a straight spine with a short guard across it.
      ctx.strokeStyle = '#20242c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
      ctx.moveTo(-4, -4); ctx.lineTo(-4, 4);
      ctx.stroke();
    } else if (this.type === 'slug') {
      // A streak rather than an object — you never really see the shot.
      ctx.strokeStyle = '#20242c';
      ctx.lineWidth = 3.2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(-26, 0); ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#d8cfae';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Brother entities: pathed movement, WASD nudging, and cute top-down drawing.
import { TILE, CFG } from './config.js';
import { tileCenter, worldToTile, isFloor, nearestFloor } from './map.js';
import { findPath } from './pathfind.js';

const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

function canStand(x, y) {
  const rad = TILE * 0.28;
  for (const [ox, oy] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad], [0, 0]]) {
    const t = worldToTile(x + ox, y + oy);
    if (!isFloor(t.c, t.r)) return false;
  }
  return true;
}

export class Brother {
  constructor(bro, role, isHuman) {
    this.bro = bro;            // BROS.older / BROS.younger
    this.role = role;          // 'p1' | 'p2'
    this.isHuman = isHuman;
    this.pos = { x: 0, y: 0 };
    this.path = [];            // remaining waypoints (world coords)
    this.facing = { x: 0, y: 1 };
    this.speed = CFG.walkSpeed;
    this.hidden = false;
    this.spot = null;          // SPOTS entry being hidden in
    this.frozen = false;       // coughing → can't move
    this.moving = false;
    this.anim = 0;
    this.coughT = 0;
  }

  setTile(c, r) { const p = tileCenter(c, r); this.pos.x = p.x; this.pos.y = p.y; this.path = []; }
  get tile() { return worldToTile(this.pos.x, this.pos.y); }

  goTo(c, r) {
    const t = this.tile;
    const dest = nearestFloor(c, r);
    const tiles = findPath(t.c, t.r, dest.c, dest.r);
    this.path = tiles.slice(1).map(n => tileCenter(n.c, n.r));
    return this.path.length > 0 || (dest.c === t.c && dest.r === t.r);
  }
  goToSpot(s) { return this.goTo(s.c, s.r); }
  stop() { this.path = []; }
  get arrived() { return this.path.length === 0; }
  atTile(c, r) { const t = this.tile; return t.c === c && t.r === r; }

  nudge(dx, dy, dt) {
    if (this.frozen || this.hidden || (!dx && !dy)) return;
    this.path = [];
    const sp = this.speed * dt;
    const nx = this.pos.x + dx * sp, ny = this.pos.y + dy * sp;
    if (canStand(nx, this.pos.y)) this.pos.x = nx;
    if (canStand(this.pos.x, ny)) this.pos.y = ny;
    this.facing = norm(dx, dy);
    this.moving = true;
  }

  update(dt) {
    if (this.frozen || this.hidden) { this.moving = false; this.anim += dt * 5; return; }
    if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.pos.x, dy = wp.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < CFG.reachEps) { this.path.shift(); this.moving = this.path.length > 0; }
      else {
        const sp = Math.min(this.speed * dt, d);
        this.pos.x += dx / d * sp; this.pos.y += dy / d * sp;
        this.facing = { x: dx / d, y: dy / d };
        this.moving = true;
      }
    } else this.moving = false;
    this.anim += dt * (this.moving ? 12 : 3);
  }

  draw(ctx, alpha = 1) { drawBrother(ctx, this, alpha); }
}

function drawBrother(ctx, b, alpha) {
  const s = b.bro.scale;
  const headR = TILE * 0.30 * s;
  const bodyR = TILE * 0.34 * s;
  const ang = Math.atan2(b.facing.y, b.facing.x);
  const step = b.moving ? Math.sin(b.anim) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;

  // ground shadow (unrotated)
  ctx.fillStyle = 'rgba(0,0,0,.20)';
  ctx.beginPath();
  ctx.ellipse(b.pos.x, b.pos.y + bodyR * 0.55, bodyR * 1.05, bodyR * 0.62, 0, 0, 7);
  ctx.fill();

  ctx.translate(b.pos.x, b.pos.y);
  ctx.rotate(ang);

  // legs / shoes (poke toward forward, bob while walking)
  ctx.fillStyle = '#3a2c22';
  for (const side of [-1, 1]) {
    const fx = headR * 0.25 + side * step * headR * 0.45;
    ctx.beginPath();
    ctx.ellipse(fx, side * bodyR * 0.42, headR * 0.34, headR * 0.24, 0, 0, 7);
    ctx.fill();
  }

  // body (shirt)
  ctx.fillStyle = b.bro.shirt;
  ctx.beginPath();
  ctx.ellipse(-bodyR * 0.12, 0, bodyR, bodyR * 0.92, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = b.bro.shirtDark;          // back/shading
  ctx.beginPath();
  ctx.ellipse(-bodyR * 0.55, 0, bodyR * 0.5, bodyR * 0.82, 0, 0, 7);
  ctx.fill();

  // arms
  ctx.fillStyle = b.bro.skin;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(-bodyR * 0.05, side * bodyR * 0.95, headR * 0.34, 0, 7);
    ctx.fill();
  }

  // head (hair seen from above)
  const hx = bodyR * 0.5;
  ctx.fillStyle = b.bro.hair;
  ctx.beginPath(); ctx.arc(hx, 0, headR, 0, 7); ctx.fill();
  ctx.fillStyle = b.bro.hairLit;            // top highlight + cowlick
  ctx.beginPath(); ctx.arc(hx - headR * 0.25, -headR * 0.2, headR * 0.55, 0, 7); ctx.fill();

  // face peeking forward
  ctx.fillStyle = b.bro.skin;
  ctx.beginPath();
  ctx.ellipse(hx + headR * 0.55, 0, headR * 0.5, headR * 0.72, 0, 0, 7);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#2a1d2a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + headR * 0.78, side * headR * 0.34, headR * 0.13, 0, 7);
    ctx.fill();
  }

  ctx.restore();
}

// A tucked-in marker for a hidden brother (shown only to whoever owns it).
export function drawTucked(ctx, b) {
  const x = (b.spot.c + 0.5) * TILE, y = (b.spot.r + 0.5) * TILE;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = `${Math.round(TILE * 0.5)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🙈', x, y - TILE * 0.05);
  // tiny feet poking out
  ctx.fillStyle = '#3a2c22';
  ctx.beginPath();
  ctx.ellipse(x - 5, y + TILE * 0.28, 4, 3, 0, 0, 7);
  ctx.ellipse(x + 5, y + TILE * 0.28, 4, 3, 0, 0, 7);
  ctx.fill();
  ctx.restore();
}

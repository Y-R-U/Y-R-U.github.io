// world.js — tile map, wall collision, procedural symmetric maps, spawns.

import { TILE } from './config.js';
import { clamp, rand, randInt, pick, sign } from './util.js';

export class World {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.w = cols * TILE;
    this.h = rows * TILE;
    this.solid = new Uint8Array(cols * rows);
    this.spawns = [];   // array of {x,y,team} ; team -1 = any
    this.bases = [];    // {team,x,y,r}
    this.zone = null;   // {x,y,r} for KOTH
  }

  idx(c, r) { return r * this.cols + c; }
  inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  isSolid(c, r) { return !this.inBounds(c, r) || this.solid[this.idx(c, r)] === 1; }
  isSolidPx(x, y) {
    return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  set(c, r, v = 1) { if (this.inBounds(c, r)) this.solid[this.idx(c, r)] = v; }
  rect(c0, r0, w, h, v = 1) {
    for (let r = r0; r < r0 + h; r++)
      for (let c = c0; c < c0 + w; c++) this.set(c, r, v);
  }
  clearCircle(cx, cy, rad) { // px
    const c0 = Math.floor((cx - rad) / TILE), c1 = Math.floor((cx + rad) / TILE);
    const r0 = Math.floor((cy - rad) / TILE), r1 = Math.floor((cy + rad) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const dx = c * TILE + TILE / 2 - cx, dy = r * TILE + TILE / 2 - cy;
        if (dx * dx + dy * dy < rad * rad && c > 1 && r > 1 && c < this.cols - 2 && r < this.rows - 2)
          this.set(c, r, 0);
      }
  }

  // Resolve a circular entity against solid tiles. Returns true if it bounced.
  resolveCircle(e, restitution = 0.28) {
    const r = e.radius;
    let bounced = false;
    const c0 = Math.floor((e.x - r) / TILE), c1 = Math.floor((e.x + r) / TILE);
    const r0 = Math.floor((e.y - r) / TILE), r1 = Math.floor((e.y + r) / TILE);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (!this.isSolid(cc, rr)) continue;
        const tx = cc * TILE, ty = rr * TILE;
        const nx = clamp(e.x, tx, tx + TILE);
        const ny = clamp(e.y, ty, ty + TILE);
        let dx = e.x - nx, dy = e.y - ny;
        let d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        let normx, normy, pen;
        if (d < 0.0001) {
          // center inside tile: push out along the nearest face
          const left = e.x - tx, right = tx + TILE - e.x;
          const top = e.y - ty, bottom = ty + TILE - e.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) { normx = -1; normy = 0; }
          else if (m === right) { normx = 1; normy = 0; }
          else if (m === top) { normx = 0; normy = -1; }
          else { normx = 0; normy = 1; }
          pen = r + m;
        } else {
          normx = dx / d; normy = dy / d; pen = r - d;
        }
        e.x += normx * pen; e.y += normy * pen;
        const vn = e.vx * normx + e.vy * normy;
        if (vn < 0) {
          e.vx -= (1 + restitution) * vn * normx;
          e.vy -= (1 + restitution) * vn * normy;
          bounced = true;
        }
      }
    }
    return bounced;
  }

  randomOpenPoint(margin = 3) {
    for (let i = 0; i < 200; i++) {
      const c = randInt(margin, this.cols - margin);
      const r = randInt(margin, this.rows - margin);
      if (!this.isSolid(c, r) && !this.isSolid(c + 1, r) && !this.isSolid(c, r + 1))
        return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
    }
    return { x: this.w / 2, y: this.h / 2 };
  }

  spawnFor(team) {
    const opts = this.spawns.filter(s => s.team === team || s.team === -1);
    const list = opts.length ? opts : this.spawns;
    const s = pick(list) || { x: this.w / 2, y: this.h / 2 };
    return { x: s.x + rand(-TILE, TILE), y: s.y + rand(-TILE, TILE) };
  }
}

// ---- Map generation -------------------------------------------------------

function border(w, t = 2) {
  w.rect(0, 0, w.cols, t);
  w.rect(0, w.rows - t, w.cols, t);
  w.rect(0, 0, t, w.rows);
  w.rect(w.cols - t, 0, t, w.rows);
}

// place a block + its point-symmetric twin (keeps 2-team / FFA fair)
function symBlock(w, c, r, bw, bh) {
  w.rect(c, r, bw, bh);
  w.rect(w.cols - c - bw, w.rows - r - bh, bw, bh);
}

function scatterAsteroids(w, count, region) {
  for (let i = 0; i < count; i++) {
    const c = randInt(region.c0, region.c1);
    const r = randInt(region.r0, region.r1);
    const bw = randInt(2, 5), bh = randInt(2, 5);
    symBlock(w, c, r, bw, bh);
  }
}

export function generateMap(modeKey) {
  let cols, rows;
  switch (modeKey) {
    case 'ctf': cols = 150; rows = 92; break;
    case 'team': cols = 124; rows = 104; break;
    case 'koth': cols = 112; rows = 112; break;
    default: cols = 116; rows = 116; // deathmatch
  }
  const w = new World(cols, rows);
  border(w, 2);

  const cx = (cols / 2) | 0, cy = (rows / 2) | 0;

  if (modeKey === 'ctf' || modeKey === 'team') {
    // two ends with bases left / right
    scatterAsteroids(w, 12, { c0: 8, c1: cols * 0.4, r0: 6, r1: rows - 8 });
    // central cover lattice
    for (let i = -2; i <= 2; i++) {
      const r = cy + i * 9;
      symBlock(w, cx - 8, r - 1, 3, 3);
      symBlock(w, cx - 1, r - 1, 2, 6);
    }
    const bx0 = 9, bx1 = cols - 9;
    const baseY = cy;
    w.bases = [
      { team: 0, x: bx0 * TILE, y: baseY * TILE, r: 90 },
      { team: 1, x: bx1 * TILE, y: baseY * TILE, r: 90 },
    ];
    // partial enclosure (U facing center) around each base
    for (const [bx, dir] of [[bx0, 1], [bx1, -1]]) {
      const back = bx - dir * 5;
      w.rect(Math.min(back, bx), baseY - 6, 1, 13); // back wall
      w.rect(Math.min(back, bx) + (dir > 0 ? 0 : 0), baseY - 6, 5, 1);
      w.rect(Math.min(back, bx), baseY + 5, 5, 1);
    }
    // spawn points clustered per team end
    for (let i = 0; i < 8; i++) {
      w.spawns.push({ team: 0, x: (12 + rand(0, 14)) * TILE, y: (10 + rand(0, rows - 20)) * TILE });
      w.spawns.push({ team: 1, x: (cols - 12 - rand(0, 14)) * TILE, y: (10 + rand(0, rows - 20)) * TILE });
    }
  } else if (modeKey === 'koth') {
    scatterAsteroids(w, 16, { c0: 8, c1: cols - 8, r0: 8, r1: rows / 2 - 6 });
    // central hill ring with 4 gaps
    const zr = 7;
    for (let a = 0; a < 360; a += 6) {
      const rad = a * Math.PI / 180;
      if (Math.abs(Math.sin(rad)) > 0.92 || Math.abs(Math.cos(rad)) > 0.92) continue; // gaps
      const c = Math.round(cx + Math.cos(rad) * zr);
      const r = Math.round(cy + Math.sin(rad) * zr);
      w.set(c, r);
    }
    w.zone = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2, r: (zr - 1) * TILE };
    w.clearCircle(w.zone.x, w.zone.y, (zr - 1.5) * TILE);
    for (let i = 0; i < 12; i++) w.spawns.push({ team: -1, ...w.randomOpenPoint(6) });
  } else {
    // deathmatch — organic scatter + a few corridors
    scatterAsteroids(w, 22, { c0: 6, c1: cols - 6, r0: 6, r1: rows / 2 });
    for (let i = 0; i < 4; i++) {
      const c = randInt(10, cols - 14), r = randInt(10, rows - 14);
      symBlock(w, c, r, randInt(6, 10), 2);
    }
    for (let i = 0; i < 14; i++) w.spawns.push({ team: -1, ...w.randomOpenPoint(5) });
  }

  // make sure bases / spawns / zone are not walled in
  for (const b of w.bases) w.clearCircle(b.x, b.y, b.r * 0.7);
  for (const s of w.spawns) w.clearCircle(s.x, s.y, TILE * 2.2);
  if (w.zone) w.clearCircle(w.zone.x, w.zone.y, w.zone.r);

  return w;
}

// Event boards drawn in ink: the Vines & Ladders board with its walking stick man, rivals and
// die, and the picture-reveal grid. Used by the game's EVENTS panel and by dev/events.html.
// Everything is drawn in CSS pixels inside an `area` rect of whatever canvas it is given.

import { stroke, line, circle, rect, hatch, splat, INK } from '../ink.js';
import { Ragdoll } from '../ragdoll.js';
import { POSE, fk, sample } from '../poses.js';
import { drawFighter, drawShadow } from '../draw.js';
import { RANKS } from '../config.js';
import { CELLS, GRID } from './reveal.js';

const FONT = '"Patrick Hand", cursive';
const RIVAL_COL = ['#2d5fb5', '#c8463f', '#3d6b3a', '#8c50c6', '#d08a1e', '#8a5a33', '#1d8a8a'];

export function drawDie(g, x, y, s, n, seed) {
  g.save(); g.fillStyle = 'rgba(255,253,244,0.9)'; g.fillRect(x, y, s, s); g.restore();
  rect(g, x, y, s, s, { w: 2.4, seed });
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]],
    5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]] }[n] || [];
  g.fillStyle = INK; for (const [u, v] of P) { g.beginPath(); g.arc(x + u * s, y + v * s, s * 0.08, 0, 6.283); g.fill(); }
}

const fighterOf = (scale, seed, rank, extra = {}) => ({ rag: new Ragdoll(scale), scale, facing: 1, rank, seed, armed: false, hp: 100, maxHp: 100,
  hitFlash: 0, isPlayer: true, dead: false, tailPhase: 1, ...extra });

/**
 * The board. `walk(move)` queues a roll's animation; `rivalsMove(list)` makes rivals hop once
 * the walker has finished (the only moment anyone else moves); `draw()` each frame.
 */
export class VinesView {
  constructor() {
    this.me = fighterOf(1, 3, RANKS[4]);
    this.anim = []; this.rivalAnim = []; this.walkT = 0; this.lastDie = null; this.dieSpin = 0;
    this.board = null; this.img = null; this.L = null;
  }

  layout(area, board, dpr) {
    const cs = Math.max(8, Math.floor(Math.min((area.w - 70) / 10.6, (area.h - 26) / 10)));
    this.L = { ...area, cs, bx: Math.round(area.x + (area.w - cs * 10) / 2 + cs * 0.3), by: Math.round(area.y + (area.h - cs * 10) / 2) };
    this.board = board;
    this.img = this.bake(dpr);
  }

  centre(s) {
    const { bx, by, cs } = this.L;
    if (s <= 0) return [bx - cs * 0.62, by + cs * 9.5];
    const r = Math.floor((s - 1) / 10); let c = (s - 1) % 10; if (r % 2) c = 9 - c;
    return [bx + c * cs + cs / 2, by + (9 - r) * cs + cs / 2];
  }

  vinePts(a, b, seed) {
    const [x0, y0] = this.centre(a), [x1, y1] = this.centre(b), cs = this.L.cs;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    const waves = Math.max(1.5, len / (cs * 1.3)), amp = cs * 0.28;
    return Array.from({ length: 41 }, (_, i) => {
      const t = i / 40, o = Math.sin(t * Math.PI * 2 * waves + seed) * amp * Math.sin(t * Math.PI);
      return [x0 + dx * t + nx * o, y0 + dy * t + ny * o];
    });
  }

  bake(dpr) {
    const { x: ax, y: ay, w: aw, h: ah, bx, by, cs } = this.L;
    const c = document.createElement('canvas');
    c.width = Math.ceil((ax + aw) * dpr); c.height = Math.ceil((ay + ah) * dpr);
    const b = c.getContext('2d'); b.scale(dpr, dpr);
    b.save(); b.globalCompositeOperation = 'multiply';
    for (let s = 1; s <= 100; s++) {
      const [x, y] = this.centre(s);
      if (s % 2 === 0) { b.fillStyle = 'rgba(160,150,120,0.10)'; b.fillRect(x - cs / 2, y - cs / 2, cs, cs); }
    }
    for (let i = 0; i <= 10; i++) {
      line(b, bx + i * cs, by - 2, bx + i * cs, by + cs * 10 + 2, { w: i % 10 ? 1.2 : 2.4, passes: 1, wob: 0.6, seed: 40 + i, a: i % 10 ? 0.45 : 0.9 });
      line(b, bx - 2, by + i * cs, bx + cs * 10 + 2, by + i * cs, { w: i % 10 ? 1.2 : 2.4, passes: 1, wob: 0.6, seed: 90 + i, a: i % 10 ? 0.45 : 0.9 });
    }
    b.font = `${Math.round(cs * 0.27)}px ${FONT}`; b.fillStyle = 'rgba(32,36,44,0.55)';
    for (let s = 1; s <= 100; s++) { const [x, y] = this.centre(s); b.fillText(String(s), x - cs * 0.44, y - cs * 0.2); }
    for (const [i, [a, z]] of this.board.ladders.entries()) {
      const [x0, y0] = this.centre(a), [x1, y1] = this.centre(z);
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len * cs * 0.13, ny = dx / len * cs * 0.13;
      const col = '#6b4a2b';
      line(b, x0 + nx, y0 + ny, x1 + nx, y1 + ny, { w: 2.2, col, seed: 300 + i, wob: 0.7 });
      line(b, x0 - nx, y0 - ny, x1 - nx, y1 - ny, { w: 2.2, col, seed: 400 + i, wob: 0.7 });
      const n = Math.max(2, Math.round(len / (cs * 0.32)));
      for (let k = 1; k < n; k++) { const t = k / n; line(b, x0 + dx * t + nx, y0 + dy * t + ny, x0 + dx * t - nx, y0 + dy * t - ny, { w: 1.6, col, passes: 1, seed: 500 + i * 30 + k }); }
    }
    for (const [i, [a, z]] of this.board.vines.entries()) {
      const pts = this.vinePts(a, z, i * 1.7);
      stroke(b, pts, { w: 3.2, col: '#3d6b3a', seed: 600 + i, wob: 0.8, step: 6 });
      for (let k = 4; k < pts.length - 2; k += 6) {
        const [x, y] = pts[k];
        b.fillStyle = 'rgba(61,107,58,0.55)'; b.beginPath();
        b.ellipse(x + (k % 12 ? 4 : -4), y, cs * 0.11, cs * 0.05, k, 0, 6.283); b.fill();
      }
      const [hx, hy] = pts[0]; b.fillStyle = '#3d6b3a'; b.beginPath(); b.ellipse(hx, hy, cs * 0.12, cs * 0.09, 0, 0, 6.283); b.fill();
    }
    const [fx, fy] = this.centre(100);
    stroke(b, [[fx - cs * 0.15, fy + cs * 0.3], [fx - cs * 0.15, fy - cs * 0.32]], { w: 2, seed: 9 });
    stroke(b, [[fx - cs * 0.15, fy - cs * 0.32], [fx + cs * 0.3, fy - cs * 0.2], [fx - cs * 0.15, fy - cs * 0.08]], { w: 2, col: '#c8463f', seed: 10 });
    b.restore();
    return c;
  }

  busy() { return this.anim.length > 0; }
  /** Seconds of walking still queued. */
  queued() { return this.anim.reduce((t, x) => t + x.dur - (x.t || 0), 0); }

  walk(m) {
    let prev = m.from;
    for (const s of m.path) { this.anim.push({ kind: 'walk', a: this.centre(prev), b: this.centre(s), dur: 0.26 }); prev = s; }
    if (m.link) this.anim.push(m.link.kind === 'ladder'
      ? { kind: 'climb', a: this.centre(m.link.from), b: this.centre(m.link.to), dur: 0.55 + Math.abs(m.link.to - m.link.from) * 0.012 }
      : { kind: 'slide', pts: this.vinePts(m.link.from, m.link.to, this.board.vines.findIndex((v) => v[0] === m.link.from) * 1.7), dur: 0.9 });
    this.lastDie = m.roll; this.dieSpin = 0.45;
  }

  /** Rivals hop from `from` to `to` once the walker is done. `key` identifies a rival. */
  rivalsMove(list) {
    const wait = -this.queued() - 0.1;
    this.rivalAnim = list.filter((r) => r.from !== r.to).map((r) => ({ key: r.key, a: this.centre(r.from), b: this.centre(r.to), t: wait }));
  }

  /** `rivals`: [{ key, name, pos, friend }]; `myPos`: where the walker rests. */
  draw(g, dt, now, { myPos, rivals = [], dim = false }) {
    const L = this.L;
    g.drawImage(this.img, 0, 0, L.x + L.w, L.y + L.h);
    const ra = new Map(this.rivalAnim.map((r) => [r.key, r]));
    rivals.forEach((r, i) => {
      let [x, y] = this.centre(r.pos);
      const a = ra.get(r.key);
      if (a) { const t = Math.max(0, Math.min(1, a.t / 0.5)); x = a.a[0] + (a.b[0] - a.a[0]) * t; y = a.a[1] + (a.b[1] - a.a[1]) * t - Math.sin(t * Math.PI) * L.cs * 0.3; }
      const ang = i * 2.399, off = L.cs * 0.26;
      x += Math.cos(ang) * off; y += Math.sin(ang) * off * 0.7;
      const col = RIVAL_COL[i % RIVAL_COL.length];
      g.save(); g.globalAlpha = 0.85; g.fillStyle = 'rgba(255,253,244,0.9)'; g.beginPath(); g.arc(x, y, L.cs * 0.2, 0, 6.283); g.fill(); g.restore();
      circle(g, x, y, L.cs * 0.2, { w: r.friend ? 2.4 : 1.6, col, seed: i * 13, passes: 1 });
      g.font = `${Math.round(L.cs * 0.3)}px ${FONT}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((r.name || '?')[0], x, y + 1); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    });
    for (const a of this.rivalAnim) a.t += dt;
    this.rivalAnim = this.rivalAnim.filter((a) => a.t < 0.5);

    this.walkT += dt;
    let x, y, pose = 'guard', poseT = 0;
    const me = this.me;
    if (this.anim.length) {
      const s = this.anim[0]; s.t = (s.t || 0) + dt; const u = Math.min(1, s.t / s.dur);
      if (s.kind === 'walk') { x = s.a[0] + (s.b[0] - s.a[0]) * u; y = s.a[1] + (s.b[1] - s.a[1]) * u - Math.sin(u * Math.PI) * L.cs * 0.12; pose = 'walk'; poseT = this.walkT; me.facing = s.b[0] >= s.a[0] ? 1 : -1; }
      else if (s.kind === 'climb') { x = s.a[0] + (s.b[0] - s.a[0]) * u; y = s.a[1] + (s.b[1] - s.a[1]) * u; pose = 'walk'; poseT = this.walkT * 1.6; }
      else { const k = Math.min(s.pts.length - 1, Math.floor(u * (s.pts.length - 1))); [x, y] = s.pts[k]; pose = 'hurt'; }
      if (u >= 1) this.anim.shift();
    } else [x, y] = this.centre(myPos);
    this.walkerAt = [x, y];
    const k = L.cs / 115;
    const p = pose === 'walk' ? sample('walk', poseT) : (POSE[pose] || POSE.guard);
    me.rag.place(0, 0, fk(p, me.facing, 1));
    g.save(); g.translate(x, y + L.cs * 0.02); g.scale(k, k);
    drawFighter(g, me, now);
    g.restore();
    if (this.lastDie) {
      this.dieSpin = Math.max(0, this.dieSpin - dt);
      const s = L.cs * 0.8, dx = L.bx - L.cs * 0.95, dy = L.by + L.cs * 0.2;
      const spin = this.dieSpin > 0;
      drawDie(g, dx, dy, s, spin ? 1 + Math.floor(now * 1000 / 70) % 6 : this.lastDie, spin ? Math.floor(now * 1000 / 70) : 4);
    }
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.62)'; g.fillRect(L.x, L.y, L.w, L.h); g.restore(); }
  }
}

/** The 5×5 picture. `img` is approved art; without it the code-drawn placeholder (a flying kick). */
export class RevealView {
  constructor() {
    this.picMe = fighterOf(1.6, 77, RANKS[4]);
    this.picFoe = fighterOf(1.4, 91, RANKS[7], { isPlayer: false, facing: -1 });
    this.placeholder = null;
  }

  layout(area) {
    const w = Math.min(area.w - 8, (area.h - 8) * 1.6), h = Math.round(w / 1.6);
    this.r = { x: Math.round(area.x + (area.w - w) / 2), y: Math.round(area.y + (area.h - h) / 2), w: Math.round(w), h };
  }

  /** The placeholder as a 1024×640 canvas — also what an unlocked placeholder background shows. */
  placeholderCanvas() {
    if (this.placeholder) return this.placeholder;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, 1024, 640);
    g.scale(1024 / 640, 1024 / 640);
    circle(g, 520, 90, 46, { w: 3, seed: 5, col: '#c8463f' });
    stroke(g, [[20, 330], [620, 330]], { w: 3, seed: 6 });
    this.picMe.rag.place(250, 205, fk(POSE.kickHit || POSE.guard, 1, 1.6));
    this.picFoe.rag.place(420, 230, fk(POSE.hurt || POSE.guard, -1, 1.4));
    drawShadow(g, this.picFoe, 330); drawFighter(g, this.picFoe, 0); drawFighter(g, this.picMe, 0);
    for (let i = 0; i < 5; i++) line(g, 80, 150 + i * 22, 170, 160 + i * 20, { w: 2, seed: 70 + i, a: 0.6 });
    splat(g, 380, 190, 9, 4, '#c8463f', 0.7);
    this.placeholder = c;
    return c;
  }

  cellAt(x, y) {
    const p = this.r;
    if (!p || x < p.x || y < p.y || x >= p.x + p.w || y >= p.y + p.h) return -1;
    return Math.floor((y - p.y) / (p.h / GRID)) * GRID + Math.floor((x - p.x) / (p.w / GRID));
  }

  draw(g, { img = null, open = [], whole = false, dim = false }) {
    const p = this.r;
    g.save(); g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
    g.drawImage(img || this.placeholderCanvas(), p.x, p.y, p.w, p.h);
    g.restore();
    rect(g, p.x - 3, p.y - 3, p.w + 6, p.h + 6, { w: 2.6, seed: 12 });
    const cw = p.w / GRID, ch = p.h / GRID;
    for (let i = 0; i < CELLS; i++) {
      if (whole || open.includes(i)) continue;
      const x = p.x + (i % GRID) * cw, y = p.y + Math.floor(i / GRID) * ch;
      g.fillStyle = '#efe8d4'; g.fillRect(x, y, cw + 0.5, ch + 0.5);
      hatch(g, x + 3, y + 3, cw - 6, ch - 6, { gap: 9, seed: i * 7, a: 0.22, w: 1.4 });
      rect(g, x + 1, y + 1, cw - 2, ch - 2, { w: 1.4, passes: 1, seed: i * 3, a: 0.6 });
      g.font = `${Math.round(ch * 0.36)}px ${FONT}`; g.fillStyle = 'rgba(32,36,44,0.6)';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x + cw / 2, y + ch / 2);
    }
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.55)'; g.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8); g.restore(); }
  }
}

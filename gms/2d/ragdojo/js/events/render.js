// Event boards drawn in ink: the Vines & Ladders board with its walking stick man, rivals and
// die, the picture-reveal grid, THE TOWER and the STORY track. Used by the game's EVENTS panel
// and by dev/events.html.
// Everything is drawn in CSS pixels inside an `area` rect of whatever canvas it is given.

import { stroke, line, circle, rect, hatch, splat, INK } from '../ink.js';
import { Ragdoll } from '../ragdoll.js';
import { POSE, fk, sample } from '../poses.js';
import { drawFighter, drawShadow } from '../draw.js';
import { RANKS } from '../config.js';
import { CELLS, GRID } from './reveal.js';
import { FLOORS } from './tower.js?v=20261014-ev';

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

  // Steps hold squares, not pixels, so a re-layout mid-walk (a phone toolbar resize) keeps the walk.
  walk(m) {
    if (m.path.length) this.anim.push({ kind: 'walk', sq: [m.from, ...m.path], dur: 0.3 + m.path.length * 0.24 });
    if (m.link) {
      this.anim.push({ kind: 'wait', at: m.link.from, dur: 0.2 });
      this.anim.push(m.link.kind === 'ladder'
        ? { kind: 'climb', a: m.link.from, b: m.link.to, dur: 0.7 + Math.abs(m.link.to - m.link.from) * 0.014 }
        : { kind: 'slide', a: m.link.from, b: m.link.to, vine: this.board.vines.findIndex((v) => v[0] === m.link.from), dur: 1.1 });
    }
    this.lastDie = m.roll; this.dieSpin = 0.45;
  }

  /** Where the walker is `u` (0–1) through step `s`. */
  stepAt(s, u) {
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const ease = u * u * (3 - 2 * u);
    if (s.kind === 'walk') {
      const f = ease * (s.sq.length - 1), i = Math.min(s.sq.length - 2, Math.floor(f));
      return lerp(this.centre(s.sq[i]), this.centre(s.sq[i + 1]), f - i);
    }
    if (s.kind === 'wait') return this.centre(s.at);
    if (s.kind === 'climb') return lerp(this.centre(s.a), this.centre(s.b), ease);
    const pts = this.vinePts(s.a, s.b, s.vine * 1.7), f = u * u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f));
    return lerp(pts[i], pts[i + 1], f - i);
  }

  /** A red arrow bobbing over the resting walker, so you can find yourself on a busy board. */
  drawArrow(g, x, y, now) {
    const cs = this.L.cs, a = Math.min(1, this.idleT / 0.25);
    if (a <= 0) return;
    const tip = y - cs * 0.8 - Math.abs(Math.sin(now * 4.2)) * cs * 0.35, w = cs * 0.36, hh = cs * 0.36, tail = cs * 0.5;
    const pts = [[x, tip], [x - w, tip - hh], [x - w * 0.42, tip - hh], [x - w * 0.42, tip - hh - tail],
      [x + w * 0.42, tip - hh - tail], [x + w * 0.42, tip - hh], [x + w, tip - hh], [x, tip]];
    g.save(); g.globalAlpha = a;
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
    g.fillStyle = '#c8463f'; g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.restore();
  }

  /** Rivals hop from `from` to `to` once the walker is done. `key` identifies a rival. */
  rivalsMove(list) {
    const wait = -this.queued() - 0.1;
    this.rivalAnim = list.filter((r) => r.from !== r.to).map((r) => ({ key: r.key, a: r.from, b: r.to, t: wait }));
  }

  /** `rivals`: [{ key, name, pos, friend }]; `myPos`: where the walker rests. */
  draw(g, dt, now, { myPos, rivals = [], dim = false }) {
    const L = this.L;
    g.drawImage(this.img, 0, 0, L.x + L.w, L.y + L.h);
    const ra = new Map(this.rivalAnim.map((r) => [r.key, r]));
    rivals.forEach((r, i) => {
      let [x, y] = this.centre(r.pos);
      const a = ra.get(r.key);
      if (a) {
        const t = Math.max(0, Math.min(1, a.t / 0.5)), [ax, ay] = this.centre(a.a), [bx, by] = this.centre(a.b);
        x = ax + (bx - ax) * t; y = ay + (by - ay) * t - Math.sin(t * Math.PI) * L.cs * 0.3;
      }
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
      const was = this.walkerAt;
      [x, y] = this.stepAt(s, u);
      if (s.kind === 'walk') { pose = 'walk'; poseT = this.walkT; if (was && Math.abs(x - was[0]) > 0.05) me.facing = x > was[0] ? 1 : -1; }
      else if (s.kind === 'climb') { pose = 'walk'; poseT = this.walkT * 1.6; }
      else if (s.kind === 'slide') pose = 'hurt';
      if (u >= 1) this.anim.shift();
      this.idleT = 0;
    } else { [x, y] = this.centre(myPos); this.idleT = (this.idleT || 0) + dt; }
    this.walkerAt = [x, y];
    const k = L.cs / 115;
    const p = pose === 'walk' ? sample('walk', poseT).p : (POSE[pose] || POSE.guard);
    me.rag.place(0, 0, fk(p, me.facing, 1));
    g.save(); g.translate(x, y + L.cs * 0.02); g.scale(k, k);
    drawFighter(g, me, now);
    g.restore();
    if (!this.anim.length) this.drawArrow(g, x, y, now);
    if (this.lastDie) {
      this.dieSpin = Math.max(0, this.dieSpin - dt);
      const s = L.cs * 0.8, dx = L.bx - L.cs * 0.95, dy = L.by + L.cs * 0.2;
      const spin = this.dieSpin > 0;
      drawDie(g, dx, dy, s, spin ? 1 + Math.floor(now * 1000 / 70) % 6 : this.lastDie, spin ? Math.floor(now * 1000 / 70) : 4);
    }
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.62)'; g.fillRect(L.x, L.y, L.w, L.h); g.restore(); }
  }
}

/** The 5×5 picture. `img` is approved art (opened tiles); without it the code-drawn practice picture. */
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

/**
 * THE TOWER: twelve floors as a pyramid, floor 1 the wide base. `climb(from, to)` animates the
 * stick man between floors after a fight; rivals sit on their floors as initials.
 */
export class TowerView {
  constructor() { this.me = fighterOf(1, 5, RANKS[0]); this.anim = null; this.img = null; this.L = null; this.t = 0; }

  layout(area, dpr) {
    const top = 34, fh = Math.max(10, Math.floor((area.h - top - 8) / FLOORS)), base = area.y + area.h - 6;
    const wMax = Math.min(area.w - 16, fh * 22), wMin = Math.max(fh * 3.2, wMax * 0.2);
    this.L = { ...area, fh, base, wMax, wMin, cx: area.x + area.w / 2 };
    this.img = this.bake(dpr);
  }

  /** The band of floor `f` (1-based): its left x, top y, width. */
  band(f) {
    const { fh, base, wMax, wMin, cx } = this.L, u = (f - 1) / (FLOORS - 1), w = wMax - (wMax - wMin) * u;
    return { x: cx - w / 2, y: base - f * fh, w, h: fh };
  }

  bake(dpr) {
    const L = this.L, c = document.createElement('canvas');
    c.width = Math.ceil((L.x + L.w) * dpr); c.height = Math.ceil((L.y + L.h) * dpr);
    const b = c.getContext('2d'); b.scale(dpr, dpr);
    b.save(); b.globalCompositeOperation = 'multiply';
    line(b, L.x + 4, L.base, L.x + L.w - 4, L.base, { w: 2.6, seed: 700 });
    for (let f = 1; f <= FLOORS; f++) {
      const r = this.band(f);
      if (f % 2) { b.fillStyle = 'rgba(160,150,120,0.10)'; b.fillRect(r.x, r.y, r.w, r.h); }
      rect(b, r.x, r.y, r.w, r.h, { w: f === FLOORS ? 2.6 : 1.8, seed: 710 + f, wob: 0.6 });
      b.font = `${Math.round(Math.min(18, r.h * 0.6))}px ${FONT}`; b.fillStyle = 'rgba(32,36,44,0.6)'; b.textBaseline = 'middle';
      b.fillText(String(f), r.x + 5, r.y + r.h / 2 + 1);
      b.strokeStyle = 'rgba(32,36,44,0.4)'; b.lineWidth = 1.2;
      for (let k = 1; k < Math.floor(r.w / (r.h * 2.6)); k++) if ((k + f) % 3 === 0) b.strokeRect(Math.round(r.x + k * r.h * 2.6) + 0.5, Math.round(r.y + r.h * 0.3) + 0.5, Math.round(r.h * 0.42), Math.round(r.h * 0.4));
    }
    b.textBaseline = 'alphabetic';
    const r1 = this.band(1);
    rect(b, L.cx - r1.h * 0.32, r1.y + r1.h * 0.2, r1.h * 0.64, r1.h * 0.8, { w: 1.6, seed: 760 });
    const t = this.band(FLOORS), px = t.x + t.w * 0.86;
    stroke(b, [[px, t.y], [px, t.y - 30]], { w: 2, seed: 770 });
    stroke(b, [[px, t.y - 30], [px + 22, t.y - 24], [px, t.y - 17]], { w: 2, col: '#c8463f', seed: 771 });
    b.restore();
    return c;
  }

  /** Where the climber stands on floor `f`. */
  spot(f) { const r = this.band(f); return [r.x + r.w * (f === FLOORS ? 0.42 : 0.3), r.y + r.h - 2]; }

  climb(from, to) { if (from !== to) this.anim = { from, to, t: 0, dur: 0.5 + Math.abs(to - from) * 0.35 }; }
  busy() { return !!this.anim; }

  /** `floor` where the climber rests; `rivals`: [{ key, name, floor, friend }]; `tops`: TOPs won. */
  draw(g, dt, now, { floor, rivals = [], tops = 0, dim = false }) {
    const L = this.L;
    g.drawImage(this.img, 0, 0, L.x + L.w, L.y + L.h);
    const perFloor = new Map();
    rivals.forEach((r, i) => {
      const f = Math.max(1, Math.min(FLOORS, r.floor | 0)), k = perFloor.get(f) || 0; perFloor.set(f, k + 1);
      const b = this.band(f), rr = Math.min(b.h * 0.36, 11), x = b.x + b.w - rr - 4 - k * (rr * 2.2), y = b.y + b.h / 2;
      if (x < b.x + b.w * 0.5) return;
      const col = RIVAL_COL[i % RIVAL_COL.length];
      g.save(); g.fillStyle = 'rgba(255,253,244,0.9)'; g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill(); g.restore();
      circle(g, x, y, rr, { w: r.friend ? 2.2 : 1.4, col, seed: i * 13, passes: 1 });
      g.font = `${Math.round(rr * 1.4)}px ${FONT}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((r.name || '?')[0], x, y + 1); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    });
    let [x, y] = this.spot(floor), pose = 'guard', poseT = 0;
    if (this.anim) {
      const a = this.anim; a.t += dt; const u = Math.min(1, a.t / a.dur), e = u * u * (3 - 2 * u);
      const [x0, y0] = this.spot(a.from), [x1, y1] = this.spot(a.to);
      x = x0 + (x1 - x0) * e; y = y0 + (y1 - y0) * e - Math.sin(e * Math.PI) * L.fh * 0.4;
      pose = a.to > a.from ? 'walk' : 'hurt'; poseT = a.t;
      if (u >= 1) this.anim = null;
    } else if (floor === FLOORS && tops > 0) pose = 'victory';
    const k = Math.max(L.fh * 2.2, 26) / 140;
    const p = pose === 'walk' ? sample('walk', poseT).p : pose === 'victory' ? sample('victory', now).p : (POSE[pose] || POSE.guard);
    this.me.rag.place(0, 0, fk(p, 1, 1));
    g.save(); g.translate(x, y - 58 * k); g.scale(k, k); drawFighter(g, this.me, now); g.restore();
    if (tops > 0) {
      const t = this.band(FLOORS);
      g.font = `${Math.round(Math.min(20, L.fh * 0.9))}px ${FONT}`; g.fillStyle = '#c8463f'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(`TOP ×${tops}`, t.x - 8, t.y + t.h / 2); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    }
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.62)'; g.fillRect(L.x, L.y, L.w, L.h); g.restore(); }
  }
}

/**
 * STORY: one chapter's track of circles, winding up the stage, with the walker; or a chapter's
 * picture. `walkTo(circle)` queues steps; the circle index is the walker's resting place.
 */
export class StoryView {
  constructor() { this.me = fighterOf(1, 9, RANKS[0]); this.L = null; this.pts = []; this.steps = []; this.walkT = 0; this.at = 0; }

  layout(area, n) {
    this.L = area; this.n = n;
    const pad = Math.max(22, Math.min(area.w, area.h) * 0.09), swings = 2.5, N = 400;
    const path = Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      return [area.x + area.w / 2 + Math.sin(t * Math.PI * swings - Math.PI / 2) * (area.w / 2 - pad * 1.3), area.y + area.h - pad - t * (area.h - pad * 2)];
    });
    const len = [0];
    for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = len[N];
    this.pts = Array.from({ length: n + 1 }, (_, k) => {
      const d = (k / n) * total; let i = 1; while (i < N && len[i] < d) i++;
      const u = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u];
    });
    this.r = Math.max(6, Math.min(16, (total / n) * 0.3, pad * 0.6));
  }

  /** Walk from the resting circle to `to` (0 = start, n = the chapter's end). */
  walkTo(to) { const from = this.steps.length ? this.steps[this.steps.length - 1].b : this.at; for (let c = from; c < to; c++) this.steps.push({ a: c, b: c + 1, t: 0 }); }
  busy() { return this.steps.length > 0; }

  drawTrack(g, dt, now, { walked, dim = false, title = '' }) {
    const { pts, r } = this, L = this.L;
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], d = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / d, uy = (y1 - y0) / d;
      line(g, x0 + ux * r, y0 + uy * r, x1 - ux * r, y1 - uy * r, { w: 1.6, passes: 1, seed: 800 + k, a: 0.5, wob: 0.6 });
    }
    pts.forEach(([x, y], k) => {
      if (k === pts.length - 1) {
        g.save(); g.fillStyle = 'rgba(255,253,244,0.95)'; g.fillRect(x - r * 1.4, y - r * 1.1, r * 2.8, r * 2.2); g.restore();
        rect(g, x - r * 1.4, y - r * 1.1, r * 2.8, r * 2.2, { w: 2.4, seed: 870, col: '#c8463f' });
        g.font = `${Math.round(r * 1.3)}px ${FONT}`; g.fillStyle = '#c8463f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y + 1);
      } else {
        const done = k > 0 && k <= walked;
        if (done) { g.save(); g.globalAlpha = 0.28; g.fillStyle = INK; g.beginPath(); g.arc(x, y, r * 0.8, 0, 6.283); g.fill(); g.restore(); }
        circle(g, x, y, r, { w: k === 0 ? 2.4 : 1.8, seed: 900 + k, passes: 1, col: k === 0 ? '#2d5fb5' : INK });
        if (k > 0 && r >= 9) { g.font = `${Math.round(r * 0.9)}px ${FONT}`; g.fillStyle = 'rgba(32,36,44,0.6)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k), x, y + 1); }
      }
    });
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    if (title) { g.font = `${Math.round(Math.max(14, r * 1.2))}px ${FONT}`; g.fillStyle = 'rgba(32,36,44,0.75)'; g.fillText(title, L.x + 8, L.y + 20); }
    this.walkT += dt;
    let x, y, pose = 'guard', face = 1;
    if (this.steps.length) {
      const s = this.steps[0]; s.t += dt; const u = Math.min(1, s.t / 0.32);
      const [x0, y0] = pts[s.a], [x1, y1] = pts[s.b];
      x = x0 + (x1 - x0) * u; y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * r * 0.8; pose = 'walk'; face = x1 >= x0 ? 1 : -1;
      if (u >= 1) { this.steps.shift(); this.at = s.b; }
    } else [x, y] = pts[Math.min(this.at, pts.length - 1)];
    const k = (r * 4.2) / 140;
    const p = pose === 'walk' ? sample('walk', this.walkT).p : POSE.guard;
    this.me.rag.place(0, 0, fk(p, face, 1));
    g.save(); g.translate(x, y - r * 0.2 - 58 * k); g.scale(k, k); drawFighter(g, this.me, now); g.restore();
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.62)'; g.fillRect(L.x, L.y, L.w, L.h); g.restore(); }
  }

  /** A chapter's picture, fitted and framed. */
  drawPage(g, img, { dim = false } = {}) {
    const L = this.L, w = Math.min(L.w - 12, (L.h - 12) * 1.6), h = w / 1.6, x = L.x + (L.w - w) / 2, y = L.y + (L.h - h) / 2;
    g.drawImage(img, x, y, w, h);
    rect(g, x - 3, y - 3, w + 6, h + 6, { w: 2.6, seed: 990 });
    if (dim) { g.save(); g.fillStyle = 'rgba(247,242,227,0.62)'; g.fillRect(L.x, L.y, L.w, L.h); g.restore(); }
  }
}

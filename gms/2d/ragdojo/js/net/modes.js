// The online modes' rules. Pure apart from the drawing at the bottom: the master's PvpMatch
// runs setup/update/onLand, and every client decides the result with the same verdict() on
// the same quantised view (what the master saw, or what its last snapshot said).
//
//   duel     1v1 rounds, best of 3 (the server counts rounds)
//   lms      last man standing, 2-8, no respawns, placements by elimination order
//   bandana  steal the bandana: holding the golden bandana scores seconds; a heavy hit knocks it loose
//   hill     king of the hill: standing in the zone ALONE scores; the zone moves every 20 s

import { SHEET_W, GROUND_Y, WALL_PAD, GRAVITY } from '../config.js';
import { P } from '../ragdoll.js';
import { stroke, circle, hatch, rnd } from '../ink.js';
import { FONT, handText } from '../ui.js';

export const MODES = {
  duel:    { id: 0, name: '1v1', secs: 60 },
  lms:     { id: 1, name: 'LAST MAN STANDING', secs: 150, ffa: true },
  bandana: { id: 2, name: 'STEAL THE BANDANA', secs: 100, target: 20, respawn: 3, overtime: 30, ffa: true },
  hill:    { id: 3, name: 'KING OF THE HILL', secs: 100, respawn: 3, overtime: 30, ffa: true, zoneW: 250, every: 20, warn: 4 },
};
export const MODE_BY_ID = Object.keys(MODES);
export const MULTI = ['lms', 'bandana', 'hill'];
/** Heavy and special hits: the same line that breaks a guard knocks the bandana loose. */
export const KNOCK_STAGGER = 0.8;
export const SPAWN_INVULN = 1.5;
export const GOLD = { key: 'gold', name: 'Gold', col: '#f0b51c', edge: '#7a5200' };
const MIN_X = WALL_PAD + 60, MAX_X = SHEET_W - WALL_PAD - 60;
const GRAB_R = 36;

const q10 = (v) => Math.round(v * 10) / 10;

/** Even spacing across the page; which slot stands where is shuffled by the match seed. */
export function spawnXs(n, seed = 0) {
  if (n <= 2) {
    const xs = [560, SHEET_W - 560];
    return seed & 1 ? xs.reverse().slice(0, n) : xs.slice(0, n);
  }
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(MIN_X + (MAX_X - MIN_X) * ((i + 0.5) / n));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd(seed * 31 + i) * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export function setup(m, modeId) {
  const M = MODES[modeId];
  m.modeId = modeId;
  m.modeDef = M;
  m.ffa = !!M.ffa;
  m.fitAll = !!M.ffa;
  m.overtime = false;
  m.outSeq = 0;
  m.obj = null;
  if (modeId === 'bandana') m.obj = { x: SHEET_W / 2, y: GROUND_Y - 560, vx: 0, vy: 0, holder: -1, grabT: 0, last: -1, lastT: 0 };
  if (modeId === 'hill') m.obj = { x: SHEET_W / 2, w: M.zoneW, next: null, t: M.every, holder: -1, contested: false };
  for (const f of m.all) { f.gone = false; f.out = 0; f.respawnT = 0; f.baseRank = f.rank; }
}

/** One fixed step on the master, FIGHT phase only. */
/** Number the knockouts in the order they happened. Also run right before a verdict: the last KO lands mid-tick. */
export function stampOuts(m) {
  if (!m.modeDef?.ffa || m.modeDef.respawn) return;
  for (const f of m.all) if (f.dead && !f.out && !f.gone) f.out = ++m.outSeq;
}

export function update(m, dt) {
  const M = m.modeDef;
  if (!M || !M.ffa) return;
  stampOuts(m);
  for (const f of m.all) {
    if (M.respawn && f.dead && !f.gone) {
      if (f.respawnT <= 0) f.respawnT = M.respawn;
      else if ((f.respawnT -= dt) <= 0) respawn(m, f);
    }
  }
  if (m.modeId === 'bandana') bandanaStep(m, dt);
  if (m.modeId === 'hill') hillStep(m, dt);
}

function bandanaStep(m, dt) {
  const b = m.obj;
  if (b.holder >= 0) {
    const h = m.all[b.holder];
    if (!h || h.dead || h.gone) { drop(m, h, 0); return; }
    b.x = h.rag.x[P.HEAD]; b.y = h.rag.y[P.HEAD];
    m.scores[b.holder] += dt;
    return;
  }
  b.grabT -= dt; b.lastT -= dt;
  b.vy += GRAVITY * 0.8 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const floor = GROUND_Y - 8;
  if (b.y >= floor) {
    b.y = floor;
    b.vy = Math.abs(b.vy) > 140 ? -b.vy * 0.35 : 0;
    b.vx *= Math.pow(0.02, dt);
  }
  if (b.x < MIN_X - 40) { b.x = MIN_X - 40; b.vx = Math.abs(b.vx) * 0.5; }
  if (b.x > MAX_X + 40) { b.x = MAX_X + 40; b.vx = -Math.abs(b.vx) * 0.5; }
  if (b.grabT > 0) return;
  let best = null, bd = GRAB_R;
  for (const f of m.all) {
    if (f.dead || f.gone || f.mode === 'down' || f.mode === 'dead') continue;
    if (f.slot === b.last && b.lastT > 0) continue;
    for (let i = 0; i < f.rag.x.length; i++) {
      const d = Math.hypot(f.rag.x[i] - b.x, f.rag.y[i] - b.y);
      if (d < bd) { bd = d; best = f; }
    }
  }
  if (best) {
    b.holder = best.slot;
    b.vx = b.vy = 0;
    m.fx.text(best.x, best.y - 170, best === m.player ? 'YOU HAVE IT!' : 'GOT IT!', { col: '#b07c00', size: 28 });
  }
}

/** The holder lets go. `power` is the hit's knockback: the bandana flies the way they were hit. */
export function drop(m, h, power, dir = 0) {
  const b = m.obj;
  if (!b || b.holder < 0) return;
  b.last = b.holder;
  b.lastT = 1.0;
  b.grabT = 0.35;
  b.holder = -1;
  if (h) { b.x = h.rag.x[P.HEAD]; b.y = h.rag.y[P.HEAD]; }
  const d = dir || (Math.random() < 0.5 ? -1 : 1);
  b.vx = d * (260 + power * 0.35);
  b.vy = -480 - power * 0.12;
}

export function onLand(m, attacker, target, def) {
  const b = m.obj;
  if (m.modeId !== 'bandana' || !b || b.holder !== target.slot) return;
  if ((def.stagger ?? 0) < KNOCK_STAGGER) return;
  const dir = Math.sign(target.x - attacker.x) || target.facing;
  drop(m, target, def.kb || 300, dir);
  m.fx.text(target.x, target.y - 170, 'KNOCKED LOOSE!', { col: '#c0392b', size: 28 });
}

function hillStep(m, dt) {
  const M = m.modeDef, z = m.obj;
  z.t -= dt;
  if (z.t <= M.warn && z.next == null) {
    const opts = [];
    for (let i = 0; i < 7; i++) {
      const x = MIN_X + M.zoneW / 2 + (MAX_X - MIN_X - M.zoneW) * (i / 6);
      if (Math.abs(x - z.x) > 380) opts.push(x);
    }
    z.next = opts[Math.floor(Math.random() * opts.length)];
  }
  if (z.t <= 0) { z.x = z.next ?? z.x; z.next = null; z.t = M.every; m.say('THE HILL MOVED!', 1.4); }
  const inside = m.all.filter((f) => !f.dead && !f.gone && f.mode !== 'down' && Math.abs(f.x - z.x) <= z.w / 2);
  z.contested = inside.length > 1;
  z.holder = inside.length === 1 ? inside[0].slot : -1;
  if (z.holder >= 0) m.scores[z.holder] += dt;
}

function respawn(m, f) {
  const foes = m.all.filter((o) => o !== f && !o.dead && !o.gone);
  let bx = SHEET_W / 2, bd = -1;
  for (let i = 0; i < 7; i++) {
    const x = MIN_X + (MAX_X - MIN_X) * (i / 6);
    if (m.modeId === 'hill' && Math.abs(x - m.obj.x) < m.obj.w / 2 + 40) continue;
    const d = foes.length ? Math.min(...foes.map((o) => Math.abs(o.x - x))) : 1e9;
    if (d > bd) { bd = d; bx = x; }
  }
  Object.assign(f, { dead: false, mode: 'live', gain: 1, hp: f.maxHp, attack: null, staggerT: 0, downT: 0, getupT: 0,
    stunT: 0, blocking: false, guardBroken: 0, poseLock: false, respawnT: 0, launchFrom: null, combo: 0 });
  f.place(bx, GROUND_Y);
  f.invuln = SPAWN_INVULN;
  m.fx.burst(bx, GROUND_Y - 60, 30);
  m.fx.text(bx, GROUND_Y - 230, f === m.player ? 'BACK IN!' : 'BACK!', { col: '#2f6ad0', size: 24 });
}

/** A player who left is out for good: their fighter drops, and anything they held goes loose. */
export function eliminate(m, slot) {
  const f = m.all[slot];
  if (!f || f.gone) return;
  f.gone = true;   // bandanaStep drops anything a dead or gone holder had
  if (!f.dead) { f.hp = 0; f.dead = true; f.goDown(0, 3, true); }
  if (!f.out) f.out = ++m.outSeq;
  f.respawnT = 0;
}

// ── the result ──────────────────────────────────────────────────────────
/** What everyone can see: HP and scores at 1/10, who is down, out or gone. */
export function viewOf(m, timeUp) {
  return {
    mode: m.modeId, timeUp: !!timeUp, overtime: !!m.overtime, holder: m.obj ? m.obj.holder : -1,
    fighters: m.all.map((f, i) => ({ slot: i, hp: q10(f.hp), dead: !!f.dead, gone: !!f.gone, out: f.out | 0, score: q10(m.scores[i] || 0) })),
  };
}

export function viewOfSnap(s, modeId) {
  return {
    mode: modeId, timeUp: s.timeUp, overtime: !!s.overtime, holder: s.obj ? s.obj.holder : -1,
    fighters: s.fighters.map((F) => ({ slot: F.slot, hp: q10(F.hp), dead: F.dead, gone: !!F.gone, out: F.out | 0, score: q10(F.score || 0) })),
  };
}

/**
 * null while the fight goes on; {overtime: true} when time is up on a tie in a mode that plays
 * on; otherwise {winner (-1 = draw), ko, place[slot] (1 = first)}.
 */
export function verdict(v) {
  const M = MODES[v.mode] || MODES.duel;
  const fs = v.fighters;
  const here = fs.filter((f) => !f.gone);
  if (v.mode === 'duel' || v.mode === 'lms') {
    const alive = fs.filter((f) => !f.dead && !f.gone);
    let winner = null, ko = false;
    if (alive.length === 1) { winner = alive[0].slot; ko = true; }
    else if (alive.length === 0) winner = -1;
    else if (v.timeUp) {
      let top = -1;
      for (const f of alive) {
        const s = Math.round(f.hp * 10);
        if (s > top) { top = s; winner = f.slot; } else if (s === top) winner = -1;
      }
    }
    if (winner === null) return null;
    // Standing at the end by HP; everyone out by how long they lasted.
    const key = (f) => (f.dead || f.gone ? 1e6 - (f.out || 0) : -Math.round(f.hp * 10));
    const order = [...fs].sort((a, b) => key(a) - key(b) || a.slot - b.slot);
    if (winner >= 0) order.sort((a, b) => (b.slot === winner) - (a.slot === winner));
    return { winner, ko, place: placeOf(fs, order) };
  }
  // Scoring modes.
  const pts = (f) => Math.round(f.score * 10);
  let top = -1, leaders = [];
  for (const f of here) {
    if (pts(f) > top) { top = pts(f); leaders = [f.slot]; } else if (pts(f) === top) leaders.push(f.slot);
  }
  const order = [...fs].sort((a, b) => (a.gone - b.gone) || pts(b) - pts(a) || a.slot - b.slot);
  let winner = null;
  if (here.length === 1) winner = here[0].slot;
  else if (M.target && top >= M.target * 10) winner = leaders[0];
  else if (v.overtime && leaders.length === 1 && top > 0) winner = leaders[0];
  else if (v.timeUp) {
    if (leaders.length === 1) winner = leaders[0];
    else if (!v.overtime && M.overtime) return { overtime: true };
    else winner = leaders.includes(v.holder) ? v.holder : -1;
  }
  if (winner === null) return null;
  if (winner >= 0) order.sort((a, b) => (b.slot === winner) - (a.slot === winner));
  return { winner, ko: false, place: placeOf(fs, order) };
}

function placeOf(fs, order) {
  const place = fs.map(() => 0);
  order.forEach((f, i) => { place[f.slot] = i + 1; });
  return place;
}

// ── drawing (world space, via Match.hazards so main.js draws it in the right layers) ──
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
export const ordinal = (n) => ORD[n - 1] || `${n}th`;

export class ModeLayer {
  constructor(m) { this.m = m; this.dead = false; this.t = 0; }
  update(dt) { this.t += dt; }
  threatens() { return false; }
  threatX() { return null; }

  drawBack(ctx) {
    const m = this.m;
    const b = m.obj;
    // The holder's own bandana turns gold — drawn by draw.js, so it moves with the head.
    for (const f of m.all) f.rank = m.modeId === 'bandana' && b && b.holder === f.slot ? GOLD : f.baseRank || f.rank;
    if (m.modeId === 'hill' && b) this.drawHill(ctx, b);
  }

  drawHill(ctx, z) {
    const m = this.m;
    const y = GROUND_Y, x0 = z.x - z.w / 2;
    const king = z.holder >= 0 ? m.all[z.holder] : null;
    const col = z.contested ? '#c0392b' : king ? (king === m.player ? '#2f6ad0' : '#b07c00') : '#6b5a2a';
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (z.next != null) {
      const nx = z.next - z.w / 2;
      for (let i = 0; i < 9; i++) {
        const a = nx + (z.w / 9) * i;
        stroke(ctx, [[a, y - 4], [a + z.w / 18, y - 4]], { w: 3, passes: 1, wob: 0.6, seed: 900 + i, col: '#6b5a2a', a: 0.7 });
      }
      ctx.font = `700 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6b5a2a';
      ctx.fillText(`hill moves here in ${Math.max(0, Math.ceil(z.t))}`, z.next, y + 40);
    }
    // A paper ledge: a low hatched step with a pennant, drawn like the rest of the page.
    hatch(ctx, x0, y - 16, z.w, 18, { col, a: 0.45, gap: 9, seed: 41 });
    stroke(ctx, [[x0 - 6, y + 2], [x0, y - 16], [x0 + z.w, y - 16], [x0 + z.w + 6, y + 2]], { w: 3.4, passes: 2, wob: 0.8, seed: 42, col, a: 0.95 });
    const px = z.x, top = y - 150 - Math.sin(this.t * 3) * 3;
    stroke(ctx, [[px, y - 16], [px, top]], { w: 3, passes: 1, wob: 0.5, seed: 43, col: '#3a3f47', a: 0.9 });
    const wave = Math.sin(this.t * 5) * 6;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(px, top); ctx.quadraticCurveTo(px + 30, top + 6 + wave, px + 58, top + 16 + wave * 0.5); ctx.lineTo(px, top + 34); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `700 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    const word = z.contested ? 'CONTESTED' : king ? (king === m.player ? 'YOURS' : 'TAKEN') : 'THE HILL';
    ctx.fillText(word, px, y + 40 + (z.next != null && Math.abs(z.next - z.x) < 10 ? 28 : 0));
    ctx.restore();
  }

  drawFront(ctx) {
    const m = this.m, b = m.obj;
    if (m.modeId === 'bandana' && b) this.drawBandana(ctx, b);
    if (m.ffa) this.drawTags(ctx);
  }

  drawBandana(ctx, b) {
    const t = this.t;
    ctx.save();
    if (b.holder >= 0) {
      // A halo of short gold rays around the holder's head: the one figure to chase.
      const h = this.m.all[b.holder];
      if (h && !h.dead) {
        const hx = h.rag.x[P.HEAD], hy = h.rag.y[P.HEAD];
        ctx.globalCompositeOperation = 'multiply';
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2 + t * 1.6;
          const r0 = 22 + Math.sin(t * 6 + i) * 2, r1 = 34 + Math.sin(t * 5 + i * 2) * 4;
          stroke(ctx, [[hx + Math.cos(a) * r0, hy + Math.sin(a) * r0], [hx + Math.cos(a) * r1, hy + Math.sin(a) * r1]],
            { w: 3, passes: 1, wob: 0.4, seed: 70 + i, col: '#d99a00', a: 0.9, step: 6 });
        }
        circle(ctx, h.x, GROUND_Y + 2, 26, { w: 2.5, passes: 1, wob: 0.8, seed: 77, col: '#d99a00', a: 0.7 });
      }
      ctx.restore();
      return;
    }
    // Loose: a knotted gold cloth that bobs and glints where it lies.
    const bob = b.vy === 0 ? Math.sin(t * 4) * 4 - 6 : 0;
    const x = b.x, y = b.y + bob;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = GOLD.col;
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 10); ctx.quadraticCurveTo(x - 10, y - 2, x, y);
    ctx.quadraticCurveTo(x - 10, y + 4, x - 24, y + 12); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 26, y - 12); ctx.quadraticCurveTo(x + 10, y - 2, x, y);
    ctx.quadraticCurveTo(x + 12, y + 4, x + 28, y + 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    stroke(ctx, [[x - 26, y - 10], [x, y], [x - 24, y + 12], [x - 26, y - 10]], { w: 2.4, passes: 1, wob: 0.6, seed: 81, col: GOLD.edge, a: 0.9, step: 5 });
    stroke(ctx, [[x + 26, y - 12], [x, y], [x + 28, y + 8], [x + 26, y - 12]], { w: 2.4, passes: 1, wob: 0.6, seed: 82, col: GOLD.edge, a: 0.9, step: 5 });
    circle(ctx, x, y, 7, { w: 2.2, passes: 1, wob: 0.4, seed: 83, col: GOLD.edge, a: 0.9 });
    const glint = (Math.sin(t * 3) + 1) / 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      stroke(ctx, [[x + Math.cos(a) * 36, y + Math.sin(a) * 30], [x + Math.cos(a) * (46 + glint * 8), y + Math.sin(a) * (38 + glint * 6)]],
        { w: 2.6, passes: 1, wob: 0.3, seed: 90 + i, col: '#d99a00', a: 0.5 + glint * 0.4, step: 5 });
    }
    ctx.restore();
  }

  /** In a crowd the intro tags are not enough: every opponent keeps a small name, and the dead a countdown. */
  drawTags(ctx) {
    const m = this.m;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.textAlign = 'center';
    for (const f of m.all) {
      if (f === m.player && !f.dead) continue;
      const hx = f.dead ? f.rag.centre()[0] : f.rag.x[P.HEAD];
      const hy = f.dead ? GROUND_Y - 70 : f.rag.y[P.HEAD] - 34 * f.scale;
      let text = f === m.player ? 'YOU' : (f.netName || f.name);
      if (f.gone) text += ' · left';
      else if (f.dead && f.respawnT > 0) text += ` · back in ${Math.ceil(f.respawnT)}`;
      else if (f.dead && f.out) text += ' · out';
      ctx.font = `700 ${f.dead ? 20 : 22}px ${FONT}`;
      ctx.fillStyle = f === m.player ? '#2f6ad0' : f.dead ? '#8a8f9a' : '#a8322c';
      ctx.globalAlpha = f.dead ? 0.8 : 0.95;
      ctx.fillText(text.length > 18 ? text.slice(0, 17) + '…' : text, hx, hy);
    }
    ctx.restore();
  }
}

/** Screen space: the scoreboard down the right edge, and your own status. */
export function drawModeHUD(ctx, vw, vh, m) {
  if (!m.ffa) return;
  const pad = Math.max(14, vw * 0.028);
  const M = m.modeDef;
  const rows = m.all.map((f, i) => ({ f, i, s: m.scores[i] || 0 }));
  const scoring = m.modeId !== 'lms';
  if (scoring) rows.sort((a, b) => b.s - a.s || a.i - b.i);
  else rows.sort((a, b) => (a.f.dead - b.f.dead) || (b.f.out - a.f.out) || b.f.hp / b.f.maxHp - a.f.hp / a.f.maxHp);
  const lead = Math.max(1, M.target || rows[0].s || 1);
  const x1 = vw - pad - 8, rh = Math.max(19, Math.min(24, vh * 0.055));
  let y = pad + 112;   // under the ENEMY bar and its 'N LEFT' line
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const shown = rows.slice(0, vh < 420 ? 5 : 8);
  if (!shown.some((r) => r.f === m.player)) shown[shown.length - 1] = rows.find((r) => r.f === m.player);
  for (const r of shown) {
    const me = r.f === m.player;
    const col = me ? '#2f6ad0' : r.f.dead ? '#9aa0ad' : '#3a4050';
    const name = me ? 'YOU' : (r.f.netName || r.f.name).slice(0, 9);
    const held = m.obj && m.obj.holder === r.i;
    const val = scoring ? `${Math.floor(r.s)}s` : r.f.dead ? (r.f.gone ? 'left' : 'out') : `${Math.round(100 * r.f.hp / r.f.maxHp)}%`;
    handText(ctx, val, x1, y, rh * 0.86, col, 'right');
    const bw = Math.min(90, vw * 0.1), bx = x1 - 46 - bw;
    if (scoring) {
      stroke(ctx, [[bx, y - rh * 0.3], [bx + bw, y - rh * 0.3]], { w: rh * 0.5, passes: 1, wob: 0.3, seed: 300 + r.i, col: '#e9e3d0', a: 1, step: 12 });
      const u = Math.min(1, r.s / lead);
      if (u > 0.01) stroke(ctx, [[bx, y - rh * 0.3], [bx + bw * u, y - rh * 0.3]], { w: rh * 0.5, passes: 1, wob: 0.3, seed: 310 + r.i, col: held ? '#e0a400' : me ? '#6d9be0' : '#b9b3a2', a: 1, step: 12 });
    }
    handText(ctx, (held ? '★ ' : '') + name, bx - 8, y, rh * 0.86, held ? '#a87700' : col, 'right');
    y += rh + 2;
  }
  if (M.target) handText(ctx, `first to ${M.target}s`, x1, y + 2, rh * 0.72, '#9aa0ad', 'right', 400);
  ctx.restore();
}

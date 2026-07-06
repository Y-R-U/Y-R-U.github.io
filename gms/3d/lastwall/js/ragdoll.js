// LASTWALL — verlet ragdolls. Particles + distance constraints; meshes of a
// humanoid are detached from their joint pivots and follow particle segments.
// Handles: wall-top floor, parapet collision (with gaps → falls), slam damage,
// long drops, get-up for survivors, dismemberment, corpse budget.
import * as THREE from 'three';
import { CFG } from './config.js';
import { inRect, clampRects } from './utils.js';

const GRAV = -30, ITER = 3, DOWN = new THREE.Vector3(0, -1, 0);
let ctx = null; // { scene, rects, cb:{slam, fall, land, getup}, }
const rags = [];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export function initRagdolls(scene, rects, cb) { ctx = { scene, rects, cb }; rags.length = 0; }
export function setRects(rects) { if (ctx) ctx.rects = rects; }
export const ragCount = () => rags.length;

const J = ['hip','neck','head','shL','shR','elbL','elbR','handL','handR','kneeL','kneeR','footL','footR'];
const CONS = [ // [a, b, stiff]
  ['neck','head',1],['hip','neck',1],
  ['neck','shL',1],['neck','shR',1],['shL','shR',1],['hip','shL',.9],['hip','shR',.9],
  ['shL','elbL',1],['elbL','handL',1],['shR','elbR',1],['elbR','handR',1],
  ['hip','kneeL',1],['kneeL','footL',1],['hip','kneeR',1],['kneeR','footR',1],
];
// mesh follows segment a→b; frac = midpoint position along segment
const SEGS = [
  ['head','neck','head',.55],['chest','hip','neck',.68],['pelvis','hip','neck',.08],
  ['uarmL','shL','elbL',.5],['farmL','elbL','handL',.5],['uarmR','shR','elbR',.5],['farmR','elbR','handR',.5],
  ['thighL','hip','kneeL',.55],['shinL','kneeL','footL',.5],['thighR','hip','kneeR',.55],['shinR','kneeR','footR',.5],
];

// impulse: THREE.Vector3 world velocity kick. ent: owning entity (or null). opts: {keepOn, dead, spin}
export function spawnRagdoll(h, impulse, ent = null, opts = {}) {
  const j = h.joints();
  const pts = {}, cons = [];
  for (const n of J) {
    const p = j[n];
    pts[n] = { x: p.x, y: p.y, z: p.z, px: p.x - impulse.x * 0.016, py: p.y - impulse.y * 0.016, pz: p.z - impulse.z * 0.016, r: n === 'head' ? .17 * h.s : .12 * h.s };
  }
  // slight per-particle impulse variance = tumble
  const sp = opts.spin ?? 1;
  for (const n of J) { pts[n].px += (Math.random() - .5) * .05 * sp; pts[n].pz += (Math.random() - .5) * .05 * sp; }
  for (const [a, b, st] of CONS) {
    const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z;
    cons.push({ a: pts[a], b: pts[b], len: Math.sqrt(dx * dx + dy * dy + dz * dz), st });
  }
  // detach meshes → scene root, remember original locals for get-up
  const meshes = [];
  for (const [part, a, b, frac] of SEGS) {
    const P = h.parts[part]; if (!P) continue;
    const m = P.pivot; // move the whole pivot (mesh + extras like eyes/foot ride along)
    m.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    m.matrixWorld.decompose(wp, wq, ws);
    meshes.push({ part, m, a: pts[a], b: pts[b], frac, parent: m.parent, lp: m.position.clone(), lq: m.quaternion.clone(), gone: false });
    ctx.scene.attach(m);
  }
  h.group.visible = false; // body shell hidden while ragdolling (meshes are the body)
  const rag = {
    h, ent, pts, cons, meshes, t: 0, still: 0, dead: !!opts.dead, keepOn: !!opts.keepOn,
    falling: false, fellAt: 0, done: false, landed: false,
    hipRect: null, slamCd: 0,
  };
  rags.push(rag);
  trimRags();
  return rag;
}

function trimRags() {
  let dead = rags.filter(r => r.dead);
  while (dead.length > CFG.maxRagdolls) {
    const r = dead.shift();
    despawn(r, true);
  }
}

export function despawn(rag, fade = false) {
  if (rag.done) return; rag.done = true;
  for (const s of rag.meshes) { if (!s.gone) ctx.scene.remove(s.m); }
  const i = rags.indexOf(rag); if (i >= 0) rags.splice(i, 1);
  if (rag.ent && rag.ent.onRagdollGone) rag.ent.onRagdollGone(rag);
}

// pop a part free (head/farmL/farmR/shinL/shinR): cut its constraint, kick its tip particle
export function dismember(rag, part) {
  const cut = { head: ['neck', 'head'], farmL: ['elbL', 'handL'], farmR: ['elbR', 'handR'], shinL: ['kneeL', 'footL'], shinR: ['kneeR', 'footR'] }[part];
  if (!cut) return false;
  const uarmCut = { farmL: ['shL', 'elbL'], farmR: ['shR', 'elbR'] }[part];
  rag.cons = rag.cons.filter(c => {
    const isCut = (c.a === rag.pts[cut[0]] && c.b === rag.pts[cut[1]]) || (c.a === rag.pts[cut[1]] && c.b === rag.pts[cut[0]]);
    return !isCut;
  });
  if (part === 'head') rag.cons = rag.cons.filter(c => c.a !== rag.pts.head && c.b !== rag.pts.head);
  const tip = rag.pts[cut[1]];
  tip.px = tip.x - (Math.random() - .5) * .5; tip.py = tip.y - .4; tip.pz = tip.z - (Math.random() - .5) * .5;
  if (uarmCut) { /* forearm flies; upper arm stays */ }
  return true;
}

function collideParticle(p, rag, dt) {
  const top = CFG.wallH;
  let on = false, rect = null;
  for (const r of ctx.rects) { if (!r.dead && inRect(r, p.x, p.z, 0.1)) { on = true; rect = r; break; } }
  if (on && p.y < top + p.r) {
    // floor + friction
    const vy = p.y - p.py;
    if (vy < -0.12 && ctx.cb.land && !rag.landedSnd) { rag.landedSnd = true; setTimeout(() => rag.landedSnd = false, 300); ctx.cb.land(p, vy / dt); }
    p.y = top + p.r;
    p.px = p.x - (p.x - p.px) * 0.72; p.pz = p.z - (p.z - p.pz) * 0.72; p.py = p.y + vy * -0.25;
  }
  // parapet edges (only when near wall top band)
  if (on && p.y < top + 2.2) {
    for (const e of rect.edges) {
      const c = e.axis === 'x' ? p.x : p.z;      // coordinate across the edge
      const a = e.axis === 'x' ? p.z : p.x;      // coordinate along the edge
      if (Math.abs(c - e.at) > p.r + 0.28) continue;
      if (a < e.lo || a > e.hi) continue;
      let solid = false;
      for (const s of e.segs) if (a >= s[0] && a <= s[1]) { solid = true; break; }
      if (!solid && !rag.keepOn) continue;       // a gap → can pass (unless keepOn)
      // push inside + slam check
      const before = e.axis === 'x' ? (p.x - p.px) : (p.z - p.pz);
      const spd = Math.abs(before) / dt;
      const inside = e.at + e.inward * (p.r + 0.28);
      if (e.axis === 'x') { p.x = inside; p.px = p.x + before * 0.4; } else { p.z = inside; p.pz = p.z + before * 0.4; }
      if (spd > CFG.slamSpeed && rag.slamCd <= 0) { rag.slamCd = 0.35; if (ctx.cb.slam) ctx.cb.slam(rag, p, spd); }
    }
  }
  if (!on && !rag.falling && p === rag.pts.hip) {
    if (rag.keepOn) { // player-alive: clamp back (invisible safety) — should rarely trigger
      const c = clampRects(ctx.rects, p.x, p.z, 0.4);
      p.x = c.x; p.z = c.z;
    } else {
      rag.falling = true; rag.fellAt = rag.t;
      if (ctx.cb.fall) ctx.cb.fall(rag);
    }
  }
  // ground far below
  if (p.y < 0.4) { p.y = 0.4; p.px = p.x - (p.x - p.px) * 0.5; p.pz = p.z - (p.z - p.pz) * 0.5; p.py = p.y - (p.y - p.py) * -0.2; }
}

export function tickRagdolls(dt) {
  if (!ctx) return;
  const sub = 2, h = dt / sub;
  for (let ri = rags.length - 1; ri >= 0; ri--) {
    const rag = rags[ri];
    rag.t += dt; rag.slamCd -= dt;
    for (let s = 0; s < sub; s++) {
      for (const n of J) {
        const p = rag.pts[n];
        const vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.998, vz = (p.z - p.pz) * 0.995;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += vx; p.y += vy + GRAV * h * h; p.z += vz;
      }
      for (let it = 0; it < ITER; it++) {
        for (const c of rag.cons) {
          const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y, dz = c.b.z - c.a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
          const off = (d - c.len) / d * 0.5 * c.st;
          c.a.x += dx * off; c.a.y += dy * off; c.a.z += dz * off;
          c.b.x -= dx * off; c.b.y -= dy * off; c.b.z -= dz * off;
        }
        for (const n of J) collideParticle(rag.pts[n], rag, h);
      }
    }
    // meshes follow segments
    for (const seg of rag.meshes) {
      if (seg.gone) continue;
      // pivots sit AT the joint with the mesh offset below, so: pivot at particle a,
      // -Y oriented along a→b (roll is ignored — reads fine at this poly count)
      _v.set(seg.b.x - seg.a.x, seg.b.y - seg.a.y, seg.b.z - seg.a.z).normalize();
      seg.m.position.set(seg.a.x, seg.a.y, seg.a.z);
      _q.setFromUnitVectors(DOWN, _v);
      seg.m.quaternion.copy(_q);
    }
    // stillness → outcome
    const hip = rag.pts.hip;
    const spd = Math.hypot(hip.x - hip.px, hip.y - hip.py, hip.z - hip.pz) / dt;
    if (spd < 1.2) rag.still += dt; else rag.still = 0;
    if (rag.falling && hip.y < 1.2 && !rag.landed) { rag.landed = true; if (ctx.cb.splat) ctx.cb.splat(rag); }
    if (!rag.dead && !rag.falling && rag.still > CFG.player.getupTime && ctx.cb.getup) { ctx.cb.getup(rag); continue; }
    if (rag.dead && (rag.still > 7 || (rag.landed && rag.t - rag.fellAt > 3))) { fadeOut(rag, dt); }
  }
}

function fadeOut(rag) {
  rag.fade = (rag.fade || 1) - 0.02;
  for (const s of rag.meshes) s.m.position.y -= 0.012;
  if (rag.fade <= 0) despawn(rag);
}

// restore meshes onto the humanoid rig (get-up / respawn reuse)
export function reattach(rag) {
  for (const s of rag.meshes) {
    if (s.gone) continue;
    s.parent.add(s.m);
    s.m.position.copy(s.lp); s.m.quaternion.copy(s.lq);
  }
  rag.h.group.visible = true;
  const i = rags.indexOf(rag); if (i >= 0) rags.splice(i, 1);
  rag.done = true;
  return { x: rag.pts.hip.x, z: rag.pts.hip.z };
}

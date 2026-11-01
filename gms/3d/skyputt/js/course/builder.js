// Hole builder: hole data (D6, theme-independent) → frames → mesh groups + colliders + features.
// Node-safe (no THREE). The game turns `geo` groups into THREE meshes with theme materials.
import { BALL_R, CUP_R, CUP_DEPTH, WALL_H, WALL_T, FLOOR_T, MAT } from '../engine/constants.js';
import { v3, pathFrames, loopFrames, lerpFrame, frameAt } from './frames.js';
import { buildFeature } from './features.js';

const FRINGE = 0.09;      // fringe band next to walls (visual only)
const CUPA = 0.2;         // half-size of the square cut out of the floor around the cup
const TRIM_H = 0.025;
const SURF_MAT = { grass: MAT.GRASS, sand: MAT.SAND, ice: MAT.ICE, sticky: MAT.STICKY, boost: MAT.BOOST, bridge: MAT.BRIDGE };
const SURF_GEO = { grass: 'grass', sand: 'sand', ice: 'ice', sticky: 'grass', boost: 'boost', bridge: 'bridge' };

// ---------- accumulators ----------
export class Geo {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
  vert(p, n, uv) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); return this.pos.length / 3 - 1; }
  // quad a,b,c,d (in loop order) with per-vertex normals; wound so the face points along `want`
  quad(P, N, UV, want) {
    const e1 = v3.sub(P[1], P[0]), e2 = v3.sub(P[2], P[0]);
    const flip = v3.dot(v3.cross(e1, e2), want) < 0;
    const i = P.map((p, k) => this.vert(p, N[k], UV[k]));
    if (!flip) this.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
    else this.idx.push(i[0], i[2], i[1], i[0], i[3], i[2]);
  }
  tri(P, N, UV, want) {
    const flip = v3.dot(v3.cross(v3.sub(P[1], P[0]), v3.sub(P[2], P[0])), want) < 0;
    const i = P.map((p, k) => this.vert(p, N[k], UV[k]));
    if (!flip) this.idx.push(i[0], i[1], i[2]); else this.idx.push(i[0], i[2], i[1]);
  }
  get empty() { return this.idx.length === 0; }
}

export class Col {
  constructor() { this.t = []; this.m = []; }
  tri(a, b, c, mat) { this.t.push(...a, ...b, ...c); this.m.push(mat); }
  quad(P, mat) { this.tri(P[0], P[1], P[2], mat); this.tri(P[0], P[2], P[3], mat); }
  // oriented box: centre, axes (unit) ex/ey/ez, half sizes; faces = which faces to include
  box(c, ex, ey, ez, h, mat, geo = null, faces = 'xXyYzZ') {
    const corner = (sx, sy, sz) => v3.add(c, v3.add(v3.mul(ex, sx * h[0]), v3.add(v3.mul(ey, sy * h[1]), v3.mul(ez, sz * h[2]))));
    const F = {
      x: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1], v3.mul(ex, -1)],
      X: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], ex],
      y: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], v3.mul(ey, -1)],
      Y: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], ey],
      z: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], v3.mul(ez, -1)],
      Z: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], ez],
    };
    for (const k of faces) {
      const f = F[k]; const P = f.slice(0, 4).map(s => corner(...s));
      if (mat !== null) this.quad(P, mat);
      if (geo) { const g = typeof geo === 'function' ? geo(k) : geo; if (g) g.quad(P, [f[4], f[4], f[4], f[4]], [[0, 0], [1, 0], [1, 1], [0, 1]], f[4]); }
    }
  }
}

// ---------- main ----------
export function buildHole(def) {
  // 1. pieces → frames
  let frames = [];
  let pieceNo = 0;
  for (const pc of def.pieces) {
    let fr;
    if (pc.type === 'path') {
      const pts = pc.points.map(q => ({ ...q }));
      if (frames.length) {          // start where the previous piece ended
        const e = frames[frames.length - 1].p;
        Object.assign(pts[0], { x: e[0], y: e[1], z: e[2] });
      }
      fr = pathFrames(pts, pieceNo);
    } else if (pc.type === 'loop') {
      fr = loopFrames(frames[frames.length - 1], pc, pieceNo);
    } else throw new Error('unknown piece ' + pc.type);
    if (frames.length) frames.pop();  // the new piece's first frame replaces the joint
    frames.push(...fr);
    pieceNo++;
  }
  let s = 0;
  frames.forEach((f, i) => { if (i) s += v3.len(v3.sub(f.p, frames[i - 1].p)); f.s = s; });
  const total = s;

  // 2. cup: cut one row-interval exactly [sc - CUPA, sc + CUPA]
  const sc = def.cup.s < 0 ? total + def.cup.s : def.cup.s;
  {
    const a = frameAt(frames, sc - CUPA), b = frameAt(frames, sc + CUPA);
    frames = frames.filter(f => f.s <= sc - CUPA - 0.04 || f.s >= sc + CUPA + 0.04);
    let k = frames.findIndex(f => f.s > sc);
    frames.splice(k, 0, { ...a, s: sc - CUPA, cupRow: true }, { ...b, s: sc + CUPA });
  }
  const cupRow = frames.findIndex(f => f.cupRow);
  const cf = lerpFrame(frames[cupRow], frames[cupRow + 1], 0.5);
  const cup = { x: cf.p[0], y: cf.p[1], z: cf.p[2] };

  const geo = {};
  const G = name => geo[name] || (geo[name] = new Geo());
  const col = new Col();

  // 3. floor rows
  const hwOf = f => f.w / 2;
  const cols = f => {
    const hw = hwOf(f), a = Math.min(CUPA, (hw - FRINGE) * 0.6);
    return [-hw, -(hw - FRINGE), -a, a, hw - FRINGE, hw];
  };
  const rowPts = frames.map(f => cols(f).map(x => v3.mad(f.p, f.l, x)));
  for (let i = 0; i < frames.length - 1; i++) {
    const A = frames[i], B = frames[i + 1];
    if (!A.floor) continue;
    const ca = cols(A), cb = cols(B);
    const mat = SURF_MAT[A.surf] ?? MAT.GRASS;
    for (let c = 0; c < 5; c++) {
      if (i === cupRow && c === 2) continue;
      const P = [rowPts[i][c], rowPts[i][c + 1], rowPts[i + 1][c + 1], rowPts[i + 1][c]];
      const fringe = (c === 0 && A.wr) || (c === 4 && A.wl);
      const gname = A.surf === 'grass' && fringe ? 'fringe' : (SURF_GEO[A.surf] || 'grass');
      G(gname).quad(P, [A.u, A.u, B.u, B.u], [[ca[c], A.s], [ca[c + 1], A.s], [cb[c + 1], B.s], [cb[c], B.s]], A.u);
      col.quad(P, mat);
    }
    // underside
    const th = A.loop ? 0.03 : FLOOR_T, thB = B.loop ? 0.03 : FLOOR_T;
    const dn = [v3.mad(rowPts[i][0], A.u, -th), v3.mad(rowPts[i][5], A.u, -th), v3.mad(rowPts[i + 1][5], B.u, -thB), v3.mad(rowPts[i + 1][0], B.u, -thB)];
    const nd = v3.mul(A.u, -1);
    G('under').quad(dn, [nd, nd, nd, nd], [[0, A.s], [A.w, A.s], [B.w, B.s], [0, B.s]], nd);
  }
  // gap ends: slab faces where the floor stops/starts
  for (let i = 0; i < frames.length; i++) {
    const F = frames[i];
    const before = i > 0 ? frames[i - 1].floor : false, here = i < frames.length - 1 ? F.floor : false;
    if (before === here) continue;
    if (i === 0 || i === frames.length - 1) continue; // track ends are capped by end walls
    const out = here ? v3.mul(F.f, -1) : F.f;
    const P = [rowPts[i][0], rowPts[i][5], v3.mad(rowPts[i][5], F.u, -FLOOR_T), v3.mad(rowPts[i][0], F.u, -FLOOR_T)];
    G('under').quad(P, [out, out, out, out], [[0, 0], [F.w, 0], [F.w, FLOOR_T], [0, FLOOR_T]], out);
    col.quad(P, MAT.WALL);
    const T = [v3.mad(rowPts[i][0], F.u, 0.004), v3.mad(rowPts[i][5], F.u, 0.004), v3.mad(rowPts[i][5], F.u, -TRIM_H), v3.mad(rowPts[i][0], F.u, -TRIM_H)].map(p => v3.mad(p, out, 0.004));
    G('trim').quad(T, [out, out, out, out], [[0, 0], [F.w, 0], [F.w, 1], [0, 1]], out);
  }

  // 4. walls / open-edge skirts, per side (sg = +1 left, -1 right)
  for (const sg of [1, -1]) {
    const has = i => i >= 0 && i < frames.length - 1 && frames[i].floor && (sg > 0 ? frames[i].wl : frames[i].wr);
    for (let i = 0; i < frames.length - 1; i++) {
      const A = frames[i], B = frames[i + 1];
      if (!A.floor) continue;
      const side = F => v3.mul(F.l, sg);
      const edge = (F, k) => rowPts[k][sg > 0 ? 5 : 0];
      const eA = edge(A, i), eB = edge(B, i + 1), sA = side(A), sB = side(B);
      if (has(i)) {
        const ibA = eA, ibB = eB;
        const itA = v3.mad(eA, A.u, WALL_H), itB = v3.mad(eB, B.u, WALL_H);
        const otA = v3.mad(itA, sA, WALL_T), otB = v3.mad(itB, sB, WALL_T);
        const obA = v3.mad(eA, sA, WALL_T), obB = v3.mad(eB, sB, WALL_T);
        const thA = A.loop ? 0.03 : FLOOR_T, thB = B.loop ? 0.03 : FLOOR_T;
        const odA = v3.mad(obA, A.u, -thA), odB = v3.mad(obB, B.u, -thB);
        const inA = v3.mul(sA, -1), inB = v3.mul(sB, -1);
        const uvs = (h0, h1) => [[A.s, h0], [B.s, h0], [B.s, h1], [A.s, h1]];
        G('wall').quad([ibA, ibB, itB, itA], [inA, inB, inB, inA], uvs(0, WALL_H), inA);
        G('wallTop').quad([itA, itB, otB, otA], [A.u, B.u, B.u, A.u], [[A.s, 0], [B.s, 0], [B.s, 1], [A.s, 1]], A.u);
        G('wall').quad([odA, odB, otB, otA], [sA, sB, sB, sA], uvs(-thA, WALL_H), sA);
        col.quad([ibA, ibB, itB, itA], MAT.WALL);
        col.quad([itA, itB, otB, otA], MAT.WALL);
        col.quad([obA, obB, otB, otA], MAT.WALL);
        // gold trim: a thin band at the top of both faces
        const tr = (pa, pb, n0, n1) => G('trim').quad(
          [v3.mad(pa, n0, 0.004), v3.mad(pb, n1, 0.004), v3.mad(v3.mad(pb, n1, 0.004), B.u, -TRIM_H), v3.mad(v3.mad(pa, n0, 0.004), A.u, -TRIM_H)],
          [n0, n1, n1, n0], [[A.s, 0], [B.s, 0], [B.s, 1], [A.s, 1]], n0);
        tr(otA, otB, sA, sB);
        tr(itA, itB, inA, inB);
        // end caps where the wall starts / stops
        if (!has(i - 1)) {
          const n = v3.mul(A.f, -1), P = [ibA, obA, otA, itA];
          G('wall').quad([v3.mad(ibA, A.u, -thA), odA, otA, itA], [n, n, n, n], [[0, 0], [1, 0], [1, 1], [0, 1]], n);
          col.quad(P, MAT.WALL);
        }
        if (!has(i + 1)) {
          const n = B.f, P = [ibB, obB, otB, itB];
          G('wall').quad([v3.mad(ibB, B.u, -thB), odB, otB, itB], [n, n, n, n], [[0, 0], [1, 0], [1, 1], [0, 1]], n);
          col.quad(P, MAT.WALL);
        }
      } else {
        // open edge: slab skirt + trim
        const thA = A.loop ? 0.03 : FLOOR_T, thB = B.loop ? 0.03 : FLOOR_T;
        const P = [eA, eB, v3.mad(eB, B.u, -thB), v3.mad(eA, A.u, -thA)];
        G('under').quad(P, [sA, sB, sB, sA], [[A.s, 0], [B.s, 0], [B.s, thB], [A.s, thA]], sA);
        col.quad(P, MAT.WALL);
        const T = [v3.mad(eA, A.u, 0.003), v3.mad(eB, B.u, 0.003), v3.mad(eB, B.u, -TRIM_H), v3.mad(eA, A.u, -TRIM_H)];
        G('trim').quad([v3.mad(T[0], sA, 0.004), v3.mad(T[1], sB, 0.004), v3.mad(T[2], sB, 0.004), v3.mad(T[3], sA, 0.004)], [sA, sB, sB, sA], [[A.s, 0], [B.s, 0], [B.s, 1], [A.s, 1]], sA);
      }
    }
  }

  // 5. end walls across the track at the start and the end
  const endWall = (F, dir) => {
    const hw = hwOf(F) + WALL_T;
    const c = v3.mad(v3.mad(F.p, F.f, dir * WALL_T / 2), F.u, (WALL_H - FLOOR_T) / 2);
    const g = k => (k === 'Y' ? G('wallTop') : k === 'y' ? null : G('wall'));
    col.box(c, F.l, F.u, F.f, [hw, (WALL_H + FLOOR_T) / 2, WALL_T / 2], MAT.WALL, g, 'xXYzZ');
    const tn = v3.mul(F.f, -dir);
    const top = v3.mad(c, F.u, (WALL_H + FLOOR_T) / 2);
    const inner = v3.mad(top, F.f, -dir * (WALL_T / 2 + 0.004));
    G('trim').quad([v3.mad(inner, F.l, hw), v3.mad(inner, F.l, -hw), v3.mad(v3.mad(inner, F.l, -hw), F.u, -TRIM_H), v3.mad(v3.mad(inner, F.l, hw), F.u, -TRIM_H)], [tn, tn, tn, tn], [[0, 0], [1, 0], [1, 1], [0, 1]], tn);
  };
  if (def.capStart !== false) endWall(frames[0], -1);
  if (def.capEnd !== false) endWall(frames[frames.length - 1], 1);

  // 6. cup: ring patch between the square cut and the circle, rim, inner pot
  {
    const A = frames[cupRow], B = frames[cupRow + 1];
    const ca = cols(A), cb = cols(B);
    const c00 = v3.mad(A.p, A.l, ca[2]), c10 = v3.mad(A.p, A.l, ca[3]), c01 = v3.mad(B.p, B.l, cb[2]), c11 = v3.mad(B.p, B.l, cb[3]);
    const bil = (x, y) => v3.lerp(v3.lerp(c00, c10, x), v3.lerp(c01, c11, x), y); // x across (0 = -a), y along
    const M = 32, up = [0, 1, 0];
    const C = [cup.x, cup.y, cup.z];
    const L = cf.l, Fw = cf.f;
    const inner = [], outer = [];
    for (let k = 0; k < M; k++) {
      const ph = (k / M) * Math.PI * 2;
      const cx = Math.cos(ph), cy = Math.sin(ph);
      inner.push(v3.mad(C, L, cx * CUP_R, Fw, cy * CUP_R));
      const t = 1 / Math.max(Math.abs(cx), Math.abs(cy));
      outer.push(bil((cx * t + 1) / 2, (cy * t + 1) / 2));
    }
    const rim = [];
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      const P = [inner[k], inner[k2], outer[k2], outer[k]];
      G('grass').quad(P, [up, up, up, up], P.map(p => [v3.dot(v3.sub(p, C), L), cf.s + v3.dot(v3.sub(p, C), Fw)]), up);
      col.quad(P, MAT.RIM);     // the ring's inner edge is the lip
      // rim ring (visual) and pot wall
      const r0 = inner[k], r1 = inner[k2];
      const ro0 = v3.mad(C, v3.norm(v3.sub(r0, C)), CUP_R + 0.018), ro1 = v3.mad(C, v3.norm(v3.sub(r1, C)), CUP_R + 0.018);
      G('cupRim').quad([v3.mad(r0, up, 0.002), v3.mad(r1, up, 0.002), v3.mad(ro1, up, 0.002), v3.mad(ro0, up, 0.002)], [up, up, up, up], [[0, 0], [1, 0], [1, 1], [0, 1]], up);
      const n0 = v3.norm(v3.sub(C, r0)), n1 = v3.norm(v3.sub(C, r1));
      G('cupHole').quad([v3.mad(r0, up, 0.002), v3.mad(r1, up, 0.002), v3.mad(r1, up, -CUP_DEPTH), v3.mad(r0, up, -CUP_DEPTH)], [n0, n1, n1, n0], [[k / M, 0], [(k + 1) / M, 0], [(k + 1) / M, 1], [k / M, 1]], v3.lerp(n0, n1, 0.5));
      G('cupHole').tri([v3.mad(C, up, -CUP_DEPTH), v3.mad(r0, up, -CUP_DEPTH), v3.mad(r1, up, -CUP_DEPTH)], [up, up, up], [[0, 0], [1, 0], [1, 1]], up);
      rim.push(r0);
    }
  }

  // 7. tee + features
  const teeS = def.tee?.s ?? 0.45;
  const tf = frameAt(frames, teeS);
  const tee = { x: tf.p[0] + tf.u[0] * BALL_R, y: tf.p[1] + tf.u[1] * BALL_R, z: tf.p[2] + tf.u[2] * BALL_R };
  const kinematics = [], features = [];
  const ctx = { frames, col, G, frameAt: s0 => frameAt(frames, s0 < 0 ? total + s0 : s0), kinematics, total };
  for (const ft of def.features || []) features.push(buildFeature(ft, ctx));
  // loops are features for the skin too
  for (const [i, pc] of def.pieces.entries()) {
    if (pc.type !== 'loop') continue;
    const fi = frames.findIndex(f => f.piece === i);
    const E = frames[Math.max(0, fi - 1)];
    features.push({ type: 'loop', p: E.p, basis: [E.l, [0, 1, 0], E.f], opts: { radius: pc.radius ?? 0.45, width: pc.width ?? 0.5, sideShift: pc.shift ?? 0.8 } });
  }

  // 8. bounds, theme path info
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const g of Object.values(geo)) for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
  const mainFrames = frames.filter(f => !f.loop);
  return {
    id: def.id, name: def.name, par: def.par,
    frames, total, geo, cup, tee, teeFrame: tf, cupFrame: cf,
    colliders: { tris: Float64Array.from(col.t), mats: Uint8Array.from(col.m) },
    kinematics, features,
    bounds: { min: mn, max: mx },
    killY: mn[1] - 1.2,
    path: mainFrames.map(f => f.p), widths: mainFrames.map(f => f.w), floor: mainFrames.map(f => f.floor),
  };
}

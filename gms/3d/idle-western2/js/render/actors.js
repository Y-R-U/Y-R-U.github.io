import * as THREE from 'three';
import { fxRegistry } from './fx.js?v=20261004g';
import { createEventArt } from './eventart.js?v=20261004g';
import { createSpectacle } from './spectacle/director.js?v=20261004g';
import { heroTidy, heroTidyDone, heroNearCut } from './cameras.js?v=20261004g';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(),
  _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _w = new THREE.Vector3();

export const LINE_TINT = {};
const WALK_COLORS = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0xf4a261, 0x8ecae6, 0xc77dff];
const SHADOW_R = { walker: 0.45, courier: 0.7, van: 1.5, boat: 0, drone: 0.5 };
const MAX = 80;

function hash01(n) {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function templates(kit, data) {
  const T = {};
  // Western shipments (R3): the van is a covered wagon behind a mule, the courier a cowboy on horseback; both face +x.
  let b = kit.builder(data.palette || {});
  b.ao(0.25);
  const canvas = { c: 0xffffff, r: 0.85 }, plank = { c: '#a8714a', r: 0.8 }, dark = { c: '#4a2f22', r: 0.8 }, mule = { c: '#8f7a68', r: 0.8 };
  b.slab(plank, -0.4, 0.7, 0, 3.2, 0.55, 1.6, { round: 0.06 });
  b.ball(canvas, -0.4, 1.35, 0, 0.95, { sx: 1.75, sz: 0.88, sy: 1.0, smooth: true });
  for (const x of [-1.5, 0.7]) for (const z of [-0.86, 0.86]) b.cyl(dark, x, 0.6, z, 0.6, 0.1, 0, { rx: Math.PI / 2, sides: 12, taper: 1 });
  b.slab(dark, 1.5, 0.7, 0, 1.0, 0.08, 0.1);
  b.ball(mule, 2.3, 1.05, 0, 0.42, { sx: 1.5, smooth: true });
  b.ball(mule, 2.95, 1.5, 0, 0.2, { sx: 1.6, smooth: true });
  for (const s of [-1, 1]) b.cone(mule, 2.85, 1.7, s * 0.1, 0.06, 0.28, 0);
  for (const [x, z] of [[1.95, -0.15], [1.95, 0.15], [2.6, -0.15], [2.6, 0.15]]) b.cyl(mule, x, 0, z, 0.08, 0.8, 0, { sides: 6 });
  T.van = b.finish().geometry;

  b = kit.builder(data.palette || {});
  b.ao(0.2);
  const coat = { c: '#8a5232', r: 0.75 }, mane = { c: '#3b2a24', r: 0.8 }, shirt = { c: '#b5483a', r: 0.8 }, jeans = { c: '#4a5878', r: 0.8 }, hat = { c: '#7a5236', r: 0.8 };
  b.ball(coat, 0, 1.0, 0, 0.42, { sx: 1.6, smooth: true });
  b.slab(coat, 0.55, 1.05, 0, 0.32, 0.62, 0.28, { rz: -0.6, round: 0.1 });
  b.ball(coat, 0.85, 1.55, 0, 0.2, { sx: 1.6, sy: 0.9, smooth: true }).ball({ c: '#e9d8c0', r: 0.7 }, 1.1, 1.5, 0, 0.12, { sy: 0.85 });
  for (const z of [-0.07, 0.07]) b.cone(mane, 0.78, 1.72, z, 0.05, 0.14, 0);
  b.ball(mane, -0.72, 0.95, 0, 0.1, { sy: 2.6, rz: -0.6 });
  for (const [x, z] of [[0.42, -0.16], [0.42, 0.16], [-0.42, -0.16], [-0.42, 0.16]]) b.cyl(coat, x, 0, z, 0.08, 0.85, 0, { sides: 6, taper: 1.15 });
  b.slab(dark, 0, 1.36, 0, 0.6, 0.1, 0.62, { round: 0.04 });
  for (const z of [-0.2, 0.2]) b.slab(jeans, 0.05, 0.95, z, 0.14, 0.5, 0.14, { round: 0.05 });
  b.slab(shirt, -0.05, 1.4, 0, 0.34, 0.5, 0.38, { round: 0.12 });
  b.ball({ c: '#efb98f', r: 0.7 }, -0.03, 2.05, 0, 0.17);
  b.cyl(hat, -0.03, 2.15, 0, 0.34, 0.04, 0, { sides: 12, taper: 1 }).cyl(hat, -0.03, 2.17, 0, 0.17, 0.22, 0, { sides: 10, taper: 0.9 });
  T.courier = b.finish().geometry;

  b = kit.builder(data.palette || {});
  b.ao(0);
  b.box(0xffffff, 0, -0.05, 0, 3.4, 0.55, 1.3).box(0xffffff, 1.85, -0.05, 0, 0.6, 0.45, 0.8).box(0xe63946, 0, 0.45, 0, 3.42, 0.12, 1.32);
  b.box(0xf1faee, -0.4, 0.5, 0, 1.3, 0.85, 1.0).box(0x9fd6e8, 0.27, 0.8, 0, 0.06, 0.35, 0.8).cyl(0xb07a4f, 0.5, 0.5, 0, 0.06, 1.9);
  T.boat = b.finish().geometry;

  b = kit.builder(data.palette || {});
  b.ao(0);
  b.box(0x2b2d42, 0, 0, 0, 0.6, 0.2, 0.6).box(0x2b2d42, 0, 0.05, 0, 1.4, 0.06, 0.08).box(0x2b2d42, 0, 0.05, 0, 0.08, 0.06, 1.4);
  for (const [x, z] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) b.disc(0xbfe3f2, x, 0.12, z, 0.3, 0.03);
  b.box(0xffbf69, 0, -0.42, 0, 0.42, 0.36, 0.42);
  T.drone = b.finish().geometry;

  b = kit.builder(data.palette || {});
  b.ao(0);
  b.box(0x3d405b, -0.09, 0, 0, 0.13, 0.48, 0.15).box(0x3d405b, 0.09, 0, 0, 0.13, 0.48, 0.15).box(0xffffff, 0, 0.46, 0, 0.36, 0.48, 0.22);
  b.box(0xffffff, -0.23, 0.5, 0, 0.09, 0.42, 0.11).box(0xffffff, 0.23, 0.5, 0, 0.09, 0.42, 0.11).ball(0xf2c6a0, 0, 1.16, 0, 0.21);
  b.box(0x4a3426, 0, 1.28, -0.02, 0.36, 0.12, 0.34).box(0xffbf69, 0, 0.62, 0.2, 0.3, 0.26, 0.2);
  T.walker = b.finish().geometry;
  return T;
}

export function createActors(world, kit, data) {
  for (const l of data.lines || []) LINE_TINT[l.id] = l.tint ?? 0xffffff;
  const scene = world.scene;
  const T = templates(kit, data);
  const meshes = {};
  for (const k of ['van', 'courier', 'boat', 'drone']) {
    const m = new THREE.InstancedMesh(T[k], kit.materials.lambertVCInst, MAX);
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    for (let i = 0; i < MAX; i++) m.setColorAt(i, _c.set(0xffffff));
    m.name = 'actors:' + k;
    scene.add(m);
    meshes[k] = m;
  }
  let walkers, aAnim = null;
  if (kit.materials.crowd) {
    walkers = kit.crowd({ count: MAX, colors: kit.OUTFITS || WALK_COLORS, blobs: false }).mesh;
    aAnim = walkers.geometry.attributes.aAnim || null;
  }
  if (!aAnim) {
    walkers = new THREE.InstancedMesh(T.walker, kit.materials.lambertVCInst, MAX);
    for (let i = 0; i < MAX; i++) walkers.setColorAt(i, _c.set(WALK_COLORS[i % WALK_COLORS.length]));
  }
  walkers.frustumCulled = false;
  walkers.count = 0;
  walkers.visible = false;
  walkers.name = 'actors:walker';
  scene.add(walkers);
  const blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(blobGeo, kit.materials.basicBlob, MAX);
  blobs.frustumCulled = false;
  blobs.count = 0;
  blobs.renderOrder = 1;
  blobs.name = 'actors:blob';
  scene.add(blobs);
  const coin = kit.builder({});
  coin.ao(0).disc({ c: '#ffc93c', r: 0.3, m: 0.35, g: 0.45 }, 0, -0.5, 0, 1, 1);
  const marks = new THREE.InstancedMesh(coin.geometry(), kit.materials.lambertVCInst, 16);
  marks.frustumCulled = false;
  marks.count = 0;
  
  marks.name = 'actors:mark';
  scene.add(marks);
  const EVMAX = 6;
  const art = createEventArt(world, kit);
  const live = new Map();
  const tips = [];
  const evRecs = Array.from({ length: EVMAX }, () => ({ id: '', lineId: '', kind: '', x: 0, y: 0, z: 0, h: 0, left: 1, u: 1, x0: 0, parkedAt: 0, seed: 0, px: 0, py: 0, pz: 0, pr: 1 }));
  let nev = 0;
  // Line-less events (pigeon, wallet, parade, lucky) live in the hero shot: placed inside the current frustum,
  // re-placed when the director cuts away, never within reach of another event.
  const free = new Map(), camPrev = new THREE.Vector3();
  let camSpeed = 0, camSettled = true;
  const _a = new THREE.Vector3(), _n = new THREE.Vector3();
  function rayGround(cam, nx, ny, h, out) {
    _a.set(nx, ny, 0.5).unproject(cam);
    _n.copy(_a).sub(cam.position).normalize();
    if (_n.y > -0.02) return null;
    const k = (h - cam.position.y) / _n.y;
    out.copy(_n).multiplyScalar(k).add(cam.position);
    const b = world.bounds;
    if (b && (out.x < b.x0 + 2 || out.x > b.x1 - 2 || out.z < b.z0 + 2 || out.z > b.z1 - 2)) return null;
    return out;
  }
  const ndc = (cam, x, y, z) => _a.set(x, y, z).project(cam);
  const inFrame = (v, m = 0.92) => v.z < 1 && Math.abs(v.x) <= m && Math.abs(v.y) <= m;
  function clear(cam, x, y, z, selfId) {
    const p = ndc(cam, x, y, z), px = p.x, py = p.y;
    for (let i = 0; i < nev; i++) {
      const e = evRecs[i];
      if (e.id === selfId) continue;
      if (Math.hypot(e.x - x, e.z - z) < 5) return false;
      const q = ndc(cam, e.x, e.y, e.z);
      if (Math.hypot(q.x - px, q.y - py) < 0.32) return false;
    }
    for (const [id, q] of free) if (id !== selfId && q.mode && q.mode !== 'spot' && nearPath(cam, q, px, py)) return false;
    return true;
  }
  function nearPath(cam, q, px, py) {
    const a = ndc(cam, q.a[0], q.mode === 'march' ? 2.4 : q.a[1], q.a[2]), ax = a.x, ay = a.y;
    const b = ndc(cam, q.b[0], q.mode === 'march' ? 2.4 : q.b[1], q.b[2]), dx = b.x - ax, dy = b.y - ay;
    const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + dx * k - px, ay + dy * k - py) < 0.24;
  }
  const order = (n, seed) => Array.from({ length: n }, (_, i) => i).sort((a, b) => hash01(seed * 31 + a) - hash01(seed * 31 + b));
  function placeFree(e, p) {
    const cam = world.heroRig?.camera;
    if (!cam) return false;
    cam.updateMatrixWorld();
    const seed = (p.n = (p.n || 0) + 1) * 97 + (parseInt(String(e.id).replace(/\D/g, ''), 10) || 0);
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    const ak = e.art || e.kind;
    if (ak === 'pigeon' || ak === 'tumbleweed') {
      const roll = ak === 'tumbleweed', rows = roll ? [-0.2, -0.35, -0.05, -0.5] : [0.3, 0.15, 0, 0.42, -0.12], hh = roll ? 0.6 : 4.2;
      for (const i of order(rows.length, seed)) {
        const ny = rows[i], dir = hash01(seed + i) < 0.5 ? 1 : -1;
        if (!rayGround(cam, -0.72 * dir, ny, hh, A) || !rayGround(cam, 0.72 * dir, ny + (roll ? 0.03 : 0.06), hh, B)) continue;
        if (!pathClear(cam, A, B, e.id)) continue;
        return setPath(p, roll ? 'roll' : 'fly', A, B, Math.max(roll ? 5 : 7, A.distanceTo(B) / (roll ? 2.6 : 3.2)));
      }
    }
    if ((e.art || e.kind) === 'parade') {
      let lo = Infinity, hi = -Infinity;
      const cx = cam.position.x;
      for (let x = cx - 90; x <= cx + 90; x += 1.5) {
        const v = ndc(cam, x, 0.5, S.z);
        if (inFrame(v, 0.8) && v.y < 0.55 && v.y > -0.75) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
      if (hi - lo >= 10) {
        const dir = hash01(seed) < 0.5 ? 1 : -1;
        A.set(dir > 0 ? lo : hi, 0.12, S.z + 0.6); B.set(dir > 0 ? hi : lo, 0.12, S.z + 0.6);
        return setPath(p, 'march', A, B, Math.max(8, (hi - lo) / 1.6));
      }
      for (const ny of [-0.25, -0.05, -0.4]) {
        if (rayGround(cam, -0.6, ny, 0, A) && rayGround(cam, 0.6, ny, 0, B)) {
          A.y = B.y = 0.12;
          return setPath(p, 'march', A, B, Math.max(8, A.distanceTo(B) / 1.6));
        }
      }
    }
    const NX = [-0.5, -0.25, 0, 0.25, 0.5], NY = [-0.45, -0.25, -0.05, 0.12];
    for (const i of order(NX.length * NY.length, seed)) {
      if (!rayGround(cam, NX[i % NX.length], NY[(i / NX.length) | 0], 0, A)) continue;
      if (!clear(cam, A.x, 1.8, A.z, e.id)) continue;
      A.y = 1.8;
      return setPath(p, 'spot', A, A, 1);
    }
    return false;
  }
  function setPath(p, mode, A, B, dur) {
    p.mode = mode; p.a = A.toArray(); p.b = B.toArray(); p.dur = dur; p.t0 = time; p.off = 0; p.redo = false;
    if (mode === 'march') for (const q of free.values()) if (q !== p && q.mode && crosses(world.heroRig.camera, p, q.a, q.mode === 'spot' ? q.a : q.b)) q.redo = true;
    return true;
  }
  // Does segment a→b (sampled) come within reach of q's path on screen?
  function crosses(cam, q, a, b) {
    for (let k = 0; k <= 4; k++) {
      const u = k / 4, v = ndc(cam, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
      if (nearPath(cam, q, v.x, v.y)) return true;
    }
    return false;
  }
  function pathClear(cam, A, B, selfId) {
    const a = A.toArray(), b = B.toArray();
    for (const [id, q] of free) if (id !== selfId && q.mode && crosses(cam, q.mode === 'spot' ? { mode: 'fly', a: q.a, b: q.a } : q, a, b)) return false;
    return true;
  }
  function freePos(p, out) {
    const ph = ((time - p.t0) / p.dur) % 2, u = ph < 1 ? ph : 2 - ph, k = u * u * (3 - 2 * u);
    const a = p.a, b = p.b;
    out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k;
    if (p.mode === 'fly') out[1] += Math.sin(time * 2.6) * 0.35;
    if (p.mode === 'roll') out[1] = 0.55 + Math.abs(Math.sin(time * 4.5)) * 0.7;
    if (p.mode === 'march') out[1] = 2.4;
    p.dirx = (b[0] - a[0]) * (ph < 1 ? 1 : -1); p.dirz = (b[2] - a[2]) * (ph < 1 ? 1 : -1);
    return out;
  }
  function updateFree(e, dt) {
    let p = free.get(e.id);
    if (!p) { p = { cur: [0, 0, 0] }; free.set(e.id, p); if (!placeFree(e, p)) { free.delete(e.id); return null; } }
    freePos(p, p.cur);
    const cam = world.heroRig?.camera;
    if (p.redo) { p.redo = false; if (placeFree(e, p)) freePos(p, p.cur); }
    if (cam && !inFrame(ndc(cam, p.cur[0], p.cur[1], p.cur[2]), 0.97)) {
      p.off += dt;
      if (camSettled && p.off > 0.15 && placeFree(e, p)) freePos(p, p.cur);
    } else p.off = 0;
    return p;
  }

  const walkClip = kit.CLIP?.carry ?? 1;
  const S = data.street;
  const roadEdge = S.z - S.width / 2;
  const recs = Array.from({ length: MAX }, () => ({ id: 0, tipId: null, lineId: '', kind: '', x: 0, y: 0, z: 0, h: 0, s: 0, pick: false, tipped: false, on: false }));
  let nrec = 0, frame = 0, filledFrame = -1, filledLine = undefined, time = 0;
  const paths = new Map();
  const place = { stage: '', u: 0 };

  function polyline(plot, key, localPts) {
    const ck = plot.id + key;
    let c = paths.get(ck);
    if (c && c.matrixVersion === plot.group.matrixWorld.elements[12] + plot.group.matrixWorld.elements[14]) return c;
    plot.group.updateMatrixWorld();
    const pts = localPts.map(([x, z]) => { _w.set(x, 0, z).applyMatrix4(plot.group.matrixWorld); return [_w.x, _w.z]; });
    c = segs(pts);
    c.matrixVersion = plot.group.matrixWorld.elements[12] + plot.group.matrixWorld.elements[14];
    paths.set(ck, c);
    return c;
  }

  function segs(pts) {
    const lens = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); len += l; }
    return { pts, lens, len };
  }

  function along(c, u, r) {
    let d = Math.max(0, Math.min(1, u)) * c.len;
    for (let i = 0; i < c.lens.length; i++) {
      const l = c.lens[i];
      if (d <= l || i === c.lens.length - 1) {
        const k = l > 0 ? Math.min(1, d / l) : 0, a = c.pts[i], b = c.pts[i + 1];
        r.x = a[0] + (b[0] - a[0]) * k;
        r.z = a[1] + (b[1] - a[1]) * k;
        r.dx = b[0] - a[0];
        r.dz = b[1] - a[1];
        return r;
      }
      d -= l;
    }
    return r;
  }

  function exitLocal(plot, kind) {
    const pa = plot.pileAnchor || [0, 0, 0];
    if (kind === 'boat') return plot.exitWater || [[pa[0], pa[2]], [pa[0], -2.6], [plot.bounds.w / 2 + 1, -2.6]];
    return plot.exit || [[pa[0], pa[2]], [plot.bounds.w / 2, plot.bounds.d / 2 + 1]];
  }

  const roadTmp = { pts: [[0, 0], [0, 0], [0, 0], [0, 0]], lens: [0, 0, 0], len: 0 };
  function roadPath(s, gx, gz) {
    const dir = s.x1 >= gx ? 1 : -1;
    let lane;
    if (s.kind === 'walker') lane = roadEdge + (dir > 0 ? 0.45 : 1.0);
    else if (s.kind === 'boat') lane = gz;
    else lane = S.z + (dir > 0 ? -1.35 : 1.35) * (s.kind === 'courier' ? 1.25 : 1);
    const turn = s.kind === 'boat' ? 0.01 : 2.5;
    const P = roadTmp.pts;
    P[0][0] = gx; P[0][1] = gz;
    P[1][0] = gx + dir * turn; P[1][1] = lane;
    P[2][0] = s.x1 - dir * (s.kind === 'van' ? 2.5 : 0.01); P[2][1] = lane;
    P[3][0] = s.x1; P[3][1] = s.kind === 'van' && s.dest !== 'east' && s.dest !== 'west' ? gz : lane;
    let len = 0;
    for (let i = 1; i < 4; i++) { roadTmp.lens[i - 1] = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); len += roadTmp.lens[i - 1]; }
    roadTmp.len = len;
    return roadTmp;
  }

  const pt = { x: 0, z: 0, dx: 1, dz: 0 };
  function placeEvent(e, r, dt) {
    r.id = e.id; r.kind = e.art || e.kind; r.lineId = e.lineId || 'hub';
    r.seed = (parseInt(String(e.id).replace(/\D/g, ''), 10) || 0) * 1.37 % 6.283;
    const span = Math.max(0.001, e.expires - e.born);
    r.left = Math.max(0, Math.min(1, (e.expires - time) / span));
    if (!e.lineId) {
      const p = updateFree(e, dt);
      if (!p) return false;
      r.x = p.cur[0]; r.z = p.cur[2];
      r.y = p.mode === 'fly' || p.mode === 'roll' ? p.cur[1] : 0.1;
      if (p.dirx || p.dirz) r.h = Math.atan2(p.dirx, p.dirz);
    } else {
      const plot = world.plots.get(e.lineId);
      if (!plot) return false;
      const w = plot.bounds?.w || 14;
      const ak = e.art || e.kind;
      const local = ak === 'limo' ? null : ak === 'bulk' ? [w * 0.27, 3.5] : [0, 3.3];
      if (local) {
        _w.set(local[0], 0, local[1]).applyMatrix4(plot.group.matrixWorld);
        r.x = _w.x; r.z = _w.z; r.h = Math.PI;
      } else {
        _w.set(-1.8, 0, 4.3).applyMatrix4(plot.group.matrixWorld);
        r.x = _w.x; r.z = _w.z; r.h = Math.PI / 2; r.x0 = r.x - 26;
        r.u = Math.max(0, Math.min(1, (time - e.born) / 2.6));
        r.parkedAt = e.born + 2.6;
      }
      r.y = 0.1;
    }
    if (r.kind !== 'limo') r.u = 1;
    if ((r.kind === 'pigeon' || r.kind === 'wallet' || r.kind === 'tumbleweed') && fxRegistry.current && dt > 0) {
      r.trail = (r.trail || 0) + dt;
      if (r.trail > (r.kind === 'wallet' ? 0.6 : 0.14)) { r.trail = 0; fxRegistry.current.sparkle([r.x, r.y - 0.2, r.z], 1, r.kind === 'wallet' ? 0.4 : 0.5); }
    }
    r.px = r.x; r.py = r.y + 1; r.pz = r.z; r.pr = 1.5;
    return true;
  }

  const api = {
    meshes,
    kit,
    street: data.street,
    get count() { return nrec; },
    update(shipments, simTime) {
      frame++;
      const dt = Math.max(0, Math.min(0.25, simTime - time));
      time = simTime;
      const hc = world.heroRig?.camera;
      if (hc && dt > 0) {
        camSpeed += (hc.position.distanceTo(camPrev) / dt - camSpeed) * Math.min(1, dt * 12);
        camPrev.copy(hc.position);
        camSettled = camSpeed < 3;
      }
      nrec = 0;
      for (const s of shipments.list) {
        if (nrec >= MAX) break;
        const plot = world.plots.get(s.lineId);
        if (!plot) continue;
        shipments.place(s, simTime, place);
        if (place.stage === 'arrived') continue;
        const r = recs[nrec++];
        r.id = s.id; r.tipId = s.tipId; r.lineId = s.lineId; r.kind = s.kind; r.pick = !!s.pick; r.tipped = !!s.tipped;
        const ex = polyline(plot, s.kind === 'boat' ? ':w' : ':l', exitLocal(plot, s.kind));
        let y = s.kind === 'boat' ? 0.02 : 0.12, env = 1;
        if (place.stage === 'plot') {
          along(ex, place.u, pt);
          env = Math.min(1, place.u / 0.12);
          if (s.kind === 'drone') y = 0.6 + 6.4 * place.u;
        } else {
          const end = ex.pts[ex.pts.length - 1];
          along(roadPath(s, end[0], end[1]), place.u, pt);
          env = Math.min(1, (1 - place.u) / 0.07);
          if (s.kind === 'drone') {
            const x0 = end[0];
            pt.x = x0 + (s.x1 - x0) * place.u;
            pt.z = end[1] + (S.z - end[1]) * place.u;
            pt.dx = s.x1 - x0; pt.dz = 0.001;
            y = 7 - 6.4 * Math.max(0, (place.u - 0.8) / 0.2) ** 2;
          }
        }
        r.x = pt.x; r.z = pt.z; r.y = y + (s.kind === 'courier' ? Math.abs(Math.sin(simTime * 9 + s.id)) * 0.04 : 0);
        r.h = s.kind === 'walker' ? Math.atan2(pt.dx, pt.dz) : Math.atan2(-pt.dz, pt.dx);
        r.s = Math.max(0, env);
      }
      const g = shipments.game;
      nev = 0;
      const active = g?.state?.events?.active || [];
      for (const id of free.keys()) if (!active.some((e) => e.id === id)) free.delete(id);
      for (const e of active) {
        if (nev >= EVMAX) break;
        if (e.special) continue;
        const r = evRecs[nev];
        if (!placeEvent(e, r, dt)) continue;
        nev++;
      }
      live.clear();
      for (let i = 0; i < nev; i++) live.set(evRecs[i].id, evRecs[i]);
    },
    // World point to hang a marker or DOM bubble on: an event ({lineId}) or a lineId; null if unknown.
    anchor(what, out = []) {
      const lv = what && typeof what === 'object' && live.get(what.id);
      if (lv) { out[0] = lv.px; out[1] = lv.py + 0.6; out[2] = lv.pz; return out; }
      if (what && typeof what === 'object' && !what.lineId && what.id) {
        const p = free.get(what.id) || (what.kind && updateFree(what, 0));
        if (p) { out[0] = p.cur[0]; out[1] = p.cur[1]; out[2] = p.cur[2]; return out; }
      }
      const id = typeof what === 'string' ? what : what?.lineId || 'hub';
      const plot = world.plots.get(id);
      if (!plot) return null;
      _w.set(0, Math.min(plot.bounds?.h || 5, 6) + 1.2, 1.2).applyMatrix4(plot.group.matrixWorld);
      out[0] = _w.x; out[1] = _w.y; out[2] = _w.z;
      return out;
    },
    // Writes instance buffers for one camera; null = hero (everything), lineId = that line's actors only.
    fill(line, cam = null) {
      if (filledFrame === frame && filledLine === line) return;
      filledFrame = frame;
      filledLine = line;
      const hero = !line && cam && cam === world.heroRig?.camera ? cam : null;
      let nv = 0, nc = 0, nb = 0, nd = 0, nw = 0, ns = 0, nm = 0;
      for (let i = 0; i < nrec; i++) {
        const r = recs[i];
        r.on = false;
        if (line && r.lineId !== line) continue;
        if (r.s <= 0.001) continue;
        if (hero && r.kind !== 'boat' && r.kind !== 'drone' && heroNearCut(hero, r.x, r.y, r.z, OCC_R[r.kind] || 0)) continue;
        r.on = true;
        const sc = r.s;
        if (r.kind === 'walker') {
          _q.setFromAxisAngle(_y, r.h);
          const bob = aAnim ? 0 : Math.abs(Math.sin(time * 7 + r.id)) * 0.07;
          _m.compose(_p.set(r.x, r.y + bob, r.z), _q, _s.setScalar(1.35 * sc));
          walkers.setMatrixAt(nw, _m);
          if (aAnim) aAnim.setXYZ(nw, walkClip, r.id * 1.7, 6.5);
          nw++;
        } else {
          const m = meshes[r.kind];
          _q.setFromAxisAngle(_y, r.h);
          const base = r.kind === 'van' ? 0.62 : r.kind === 'boat' ? 0.9 : r.kind === 'drone' ? 0.9 : 0.85;
          _m.compose(_p.set(r.x, r.y, r.z), _q, _s.setScalar(base * sc));
          const n = r.kind === 'van' ? nv++ : r.kind === 'courier' ? nc++ : r.kind === 'boat' ? nb++ : nd++;
          m.setMatrixAt(n, _m);
          if (r.kind === 'van') m.setColorAt(n, _c.set(LINE_TINT[r.lineId] || 0xffffff));
        }
        const sr = SHADOW_R[r.kind];
        if (sr) {
          _m.makeScale(sr * sc * (r.kind === 'van' ? 1.3 : 1), 1, sr * sc * (r.kind === 'van' ? 0.8 : 1)).setPosition(r.x, 0.04, r.z);
          blobs.setMatrixAt(ns++, _m);
        }
        if (r.pick && !r.tipped && nm < 16) {
          _q.setFromAxisAngle(_y, time * 3 + r.id);
          _m.compose(_p.set(r.x, r.y + 2.45 + Math.sin(time * 4 + r.id) * 0.12, r.z), _q, _s.set(0.32 * sc, 0.06, 0.32 * sc));
          _q.setFromAxisAngle(_p.set(1, 0, 0), Math.PI / 2);
          _m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(_q));
          marks.setMatrixAt(nm++, _m);
        }
      }
      tips.length = 0;
      for (let i = 0; i < nrec; i++) if (recs[i].on && recs[i].pick && !recs[i].tipped && recs[i].s > 0.5) tips.push(recs[i]);
      art.fill(line, evRecs, nev, tips, time);
      const set = (m, n) => { m.count = n; m.visible = n > 0; if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
      set(meshes.van, nv); set(meshes.courier, nc); set(meshes.boat, nb); set(meshes.drone, nd);
      set(walkers, nw); set(blobs, ns); set(marks, nm);
      if (nw && aAnim) aAnim.needsUpdate = true;
    },
    find(id) {
      for (let i = 0; i < nrec; i++) if (recs[i].id === id) return recs[i];
      return null;
    },
    pick(ray, only) {
      let best = null;
      for (let i = 0; i < nev; i++) {
        const e = evRecs[i];
        if (only && e.lineId !== only) continue;
        _w.set(e.px, e.py, e.pz);
        const dist = _w.distanceTo(ray.origin), rad = Math.max(e.pr * 1.5, 2.4, dist * 0.065);
        if (ray.distanceSqToPoint(_w) > rad * rad) continue;
        if (!best || dist < best.dist) best = { kind: 'event', id: e.id, eventId: e.id, lineId: e.lineId, point: [e.px, e.py, e.pz], dist };
      }
      for (let i = 0; i < nrec; i++) {
        const r = recs[i];
        if (!r.pick || r.tipped || r.s < 0.5 || (only && r.lineId !== only)) continue;
        _w.set(r.x, r.y + 1, r.z);
        const d2 = ray.distanceSqToPoint(_w);
        const dist = _w.distanceTo(ray.origin), rad = Math.max(2.1, dist * 0.05);
        if (d2 > rad * rad) continue;
        if (!best || dist < best.dist) best = { kind: 'courier', actor: r.kind, id: r.tipId, courierId: r.tipId, shipmentId: r.id, lineId: r.lineId, point: [r.x, r.y + 1, r.z], dist };
      }
      return best;
    },
  };

  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    prev.call(this, renderer, sc, camera, rt);
    heroTidy(world, camera, wired);
    api.fill(camera.userData.iw2Line || null, camera);
  };
  const prevAfter = scene.onAfterRender;
  scene.onAfterRender = function (renderer, sc, camera, rt) {
    prevAfter?.call(this, renderer, sc, camera, rt);
    heroTidyDone();
  };

  queueMicrotask(() => {
    const g = globalThis.__iw2;
    if (g && g.game) wireRenderCore({ game: g.game, host: g.host, world, shipments: g.shipments, actors: api, fx: fxRegistry.current, bus: g.bus });
  });
  return api;
}

let wired = null;
// Spectacle occluder radii (cameras.heroNearCut): covered wagon + mule, rider, walker.
const OCC_R = { van: 2.6, courier: 1.6, walker: 0.6 };
const STREET_FALLBACK = (world) => world.street || { x0: -24, x1: 300, z: 7.5, width: 8 };
// One call wires render core to the game: courier picking, director inputs, fx triggers. Idempotent.
export function wireRenderCore({ game, host, world, shipments, actors, fx, bus }) {
  if (!game || wired === game) return false;
  wired = game;
  if (host && actors) {
    host.addPicker(actors.pick);
    host.setAnchorProvider?.(actors.anchor);
  }
  if (host?.markShadow) for (const k of ['bought', 'unlocked', 'milestone']) game.on(k, (e) => e?.lineId && host.markShadow(e.lineId));
  world.heroRig?.attach?.({ game, shipments, world, bus });
  if (actors?.kit && !world.spectacle && !/[?&]nospectacle/.test(globalThis.location?.search || '')) {
    try {
      world.spectacle = createSpectacle({ world, kit: actors.kit, host, game, bus, fx, street: actors.street || STREET_FALLBACK(world) });
      host?.onFrame((dt, now, vis) => world.spectacle.update(dt, now, vis));
    } catch (e) { console.error('[spectacle] failed to start', e); }
  }
  if (!fx) return true;
  fx.setMotionPref(() => !!game.state.settings?.reducedMotion);
  host?.onFrame((dt, now, vis, q) => fx.setScale(q?.fx ?? 1));
  const at = (id, local) => fx.plotPos(id, local);
  game.on('bought', (e) => {
    if (!e?.lineId || e.kind === 'level' && e.qty === 1 && Math.random() < 0.5) return;
    fx.pop(e.lineId, 'small');
    const p = at(e.lineId, [0, 1.5, 1]);
    if (p) fx.sparkle(p, 8, 4);
  });
  game.on('unlocked', (e) => {
    fx.pop(e.lineId, 'big');
    const p = at(e.lineId, [0, 0, 1]);
    if (p) { fx.ring(p, 10); fx.burst(p, 14); fx.sparkle(p, 22, 7); }
  });
  game.on('milestone', (e) => fx.flash(e.lineId));
  game.on('harvest', (e) => {
    const pl = world.plots.get(e.lineId);
    const p = pl && at(e.lineId, pl.pileAnchor);
    if (p) { fx.burst(p, 16); fx.sparkle(p, 12, 2); }
  });
  game.on('courierTap', (e) => {
    const r = actors?.find(e.shipmentId);
    if (r) { fx.burst([r.x, r.y + 1, r.z], 10); fx.sparkle([r.x, r.y, r.z], 8, 1.5); }
  });
  game.on('event:claim', (e) => {
    const id = e?.event?.lineId;
    const p = id && at(id, [0, 1, 1]);
    if (p) fx.sparkle(p, 16, 5);
  });
  return true;
}

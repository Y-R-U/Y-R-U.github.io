// LASTWALL — seeded level generator. A level is a union of axis-aligned rects
// (spans + tower plazas + spurs) on top of a great wall. Produces meshes,
// physics edges (parapet segs w/ gaps), cracks (collapsible spans), pickups,
// spawn/climb points and waypoints. Main travel direction is NORTH (-Z).
import * as THREE from 'three';
import { CFG, LITE } from './config.js';
import { mulberry32 } from './utils.js';
import { mat } from './models.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.userData.shared = true; // never dispose on level teardown
let stoneTex = null, stoneSideTex = null;

function makeStone(light) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = light ? '#5c5046' : '#4a4038'; g.fillRect(0, 0, 256, 256);
  const rr = mulberry32(7);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const off = (y % 2) * 16;
    const v = 0.82 + rr() * 0.36;
    g.fillStyle = `rgb(${(light ? 104 : 82) * v | 0},${(light ? 90 : 71) * v | 0},${(light ? 76 : 60) * v | 0})`;
    g.fillRect(x * 32 + off + 2, y * 32 + 2, 28, 28);
    if (rr() < .12) { g.fillStyle = 'rgba(20,12,8,.35)'; g.fillRect(x * 32 + off + rr() * 20, y * 32 + rr() * 20, 8, 8); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function slabMat(w, l, top) {
  if (!stoneTex) { stoneTex = makeStone(true); stoneSideTex = makeStone(false); }
  const t = (top ? stoneTex : stoneSideTex).clone();
  t.needsUpdate = true; t.repeat.set(Math.max(1, w / 4), Math.max(1, l / 4));
  return new THREE.MeshLambertMaterial({ map: t });
}

const R = (x0, z0, x1, z1) => ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), edges: [], dead: false });
const overlaps = (a, b, m = 0) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.z0 - m < b.z1 && a.z1 + m > b.z0;

// ---------- geometry builders ----------
function wallBody(rect, group, sink = 0) {
  const w = rect.x1 - rect.x0, l = rect.z1 - rect.z0, H = CFG.wallH;
  const body = new THREE.Group();
  const side = new THREE.Mesh(BOX, slabMat(Math.max(w, l), H, false));
  side.scale.set(w, H, l); side.position.set((rect.x0 + rect.x1) / 2, H / 2 - sink, (rect.z0 + rect.z1) / 2);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, l), slabMat(w, l, true));
  top.rotation.x = -Math.PI / 2; top.position.set((rect.x0 + rect.x1) / 2, H + 0.01 - sink, (rect.z0 + rect.z1) / 2);
  top.receiveShadow = !LITE;
  body.add(side, top); group.add(body);
  return body;
}

// subtract neighbours from a rect edge → parapet intervals
function freeIntervals(rect, rects, axis, at, lo, hi) {
  let ivs = [[lo, hi]];
  for (const q of rects) {
    if (q === rect) continue;
    let qlo, qhi, touches;
    if (axis === 'x') { touches = q.x0 - 0.2 <= at && q.x1 + 0.2 >= at; qlo = q.z0; qhi = q.z1; }
    else { touches = q.z0 - 0.2 <= at && q.z1 + 0.2 >= at; qlo = q.x0; qhi = q.x1; }
    if (!touches) continue;
    const next = [];
    for (const [a, b] of ivs) {
      if (qhi <= a || qlo >= b) { next.push([a, b]); continue; }
      if (qlo > a) next.push([a, qlo]);
      if (qhi < b) next.push([qhi, b]);
    }
    ivs = next;
  }
  return ivs.filter(([a, b]) => b - a > 0.8);
}

// ---------- main ----------
export function buildLevel(seed, n) {
  const rng = mulberry32(seed);
  const G = CFG.gen, W = CFG.wallW, TW = CFG.towerW, H = CFG.wallH;
  const group = new THREE.Group();
  const rects = [], cracks = [], pickups = [], spawns = [], climbs = [], waypoints = [], crates = [], merlonSpots = [];
  const bodies = new Map(); // rect → mesh group (for crack collapse)

  let cx = 0, cz = 0;               // cursor (center of path)
  const start = { x: 0, z: -6 };
  waypoints.push({ x: 0, z: 0 });

  // start plaza
  let prev = R(-TW / 2, -TW / 2, TW / 2, TW / 2);
  rects.push(prev);

  const spanCount = G.spansMain(n);
  let forksLeft = n >= 3 ? (rng.chance(G.forkChance) ? 1 : 0) + (n >= 8 && rng.chance(0.3) ? 1 : 0) : 0;
  let spursLeft = 2;

  for (let i = 0; i < spanCount; i++) {
    const L = rng.range(G.spanLen[0], G.spanLen[1]);
    const isFork = forksLeft > 0 && i >= 1 && i < spanCount - 1 && rng.chance(0.55);
    // pick direction: mostly N, sometimes a 1-span E/W jog (then next span N)
    let dir = 0; // 0=N
    if (!isFork && i > 0 && rng.chance(0.3)) dir = rng.pick([1, 3]); // E/W jog
    const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0, dz = dir === 0 ? -1 : 0;

    if (isFork) {
      forksLeft--;
      // straight risky span A→B (crack!) + detour A→C→D→B
      const bz = cz - TW / 2 - L - TW / 2;
      // spans overlap plazas by 2 so the padded walkable union has no seams
      const straight = R(cx - W / 2, cz - TW / 2 + 2, cx + W / 2, bz + TW / 2 - 2);
      const off = (rng.chance(0.5) ? 1 : -1) * (TW + rng.range(14, 22));
      // detour: from A plaza sideways (c1), then north (cN), then back into B plaza (cBack)
      const c1 = R(Math.min(cx, cx + off) - W / 2, cz - W / 2, Math.max(cx, cx + off) + W / 2, cz + W / 2);
      const cN = R(cx + off - W / 2, bz - W / 2, cx + off + W / 2, cz + W / 2);
      const cBack = R(Math.min(cx, cx + off) - W / 2, bz - W / 2, Math.max(cx, cx + off) + W / 2, bz + W / 2);
      const B = R(cx - TW / 2, bz - TW / 2, cx + TW / 2, bz + TW / 2);
      rects.push(straight, c1, cN, cBack, B);
      // crack on the straight span, 40% along
      const crackZ = cz - TW / 2 - L * rng.range(0.3, 0.5);
      // split straight: rectA (south of crack, collapses) / rectB
      const rectA = R(straight.x0, crackZ, straight.x1, straight.z1);
      const rectB = R(straight.x0, straight.z0, straight.x1, crackZ);
      rects.splice(rects.indexOf(straight), 1);
      rects.push(rectA, rectB);
      cracks.push({ axis: 'z', at: crackZ, dir: -1, rectA, x0: straight.x0, x1: straight.x1, done: false });
      // loot on the safe route + extra spawns there
      pickups.push({ x: cx + off, z: (cz + bz) / 2, type: 'loot', rng: rng() });
      spawns.push({ x: cx + off, z: cz - 10 }, { x: cx + off, z: bz + 10 }, { x: cx, z: crackZ - 8 });
      // reward behind the crack (risky fast lane)
      pickups.push({ x: cx, z: crackZ - rng.range(4, 8), type: 'loot', rng: rng() });
      waypoints.push({ x: cx, z: bz });
      cz = bz; prev = B;
      continue;
    }

    // normal span from prev plaza edge (2m overlap into BOTH plazas — no seams)
    let sx0, sz0, sx1, sz1, nx = cx, nz = cz;
    if (dir === 0) { sx0 = cx - W / 2; sx1 = cx + W / 2; sz1 = cz - TW / 2 + 2; nz = cz - TW / 2 - L - TW / 2; sz0 = nz + TW / 2 - 2; }
    else { sz0 = cz - W / 2; sz1 = cz + W / 2; nx = cx + dx * (TW / 2 + L + TW / 2); if (dx > 0) { sx0 = cx + TW / 2 - 2; sx1 = nx - TW / 2 + 2; } else { sx1 = cx - TW / 2 + 2; sx0 = nx + TW / 2 - 2; } }
    let span = R(sx0, sz0, sx1, sz1);
    // collision with existing? fall back to N
    if (rects.some(q => overlaps(span, q, 4))) {
      if (dir !== 0) { i--; continue; }
    }
    const plaza = R(nx - TW / 2, nz - TW / 2, nx + TW / 2, nz + TW / 2);
    if (rects.some(q => overlaps(plaza, q, 2))) { // rare dead-end: stop early
      break;
    }
    rects.push(span, plaza);
    // spawn points along span
    const segs = Math.floor(L / 14);
    for (let s = 1; s <= segs; s++) {
      const t = s / (segs + 1);
      spawns.push({ x: sx0 + (sx1 - sx0) * (dir === 0 ? 0.5 : t), z: sz0 + (sz1 - sz0) * (dir === 0 ? t : 0.5) });
    }
    if (rng.chance(CFG.director.ambushChance)) climbs.push({ x: (sx0 + sx1) / 2, z: (sz0 + sz1) / 2, edge: rng.chance(0.5) ? 'lo' : 'hi', axis: dir === 0 ? 'x' : 'z' });
    // sprinkle pickups
    if (rng.chance(0.5)) pickups.push({ x: (sx0 + sx1) / 2 + rng.range(-2, 2), z: (sz0 + sz1) / 2 + rng.range(-3, 3), type: rng.chance(0.42) ? 'boost' : rng.chance(0.5) ? 'med' : 'serum', rng: rng() });
    // crates
    const nCr = rng.int(1, 3);
    for (let k = 0; k < nCr; k++) crates.push({ x: rng.range(sx0 + 1.4, sx1 - 1.4), z: rng.range(sz0 + 1.4, sz1 - 1.4), boom: rng.chance(0.25) });

    // spur (dead-end loot branch) off the new plaza
    if (spursLeft > 0 && rng.chance(G.spurChance) && i < spanCount - 1) {
      spursLeft--;
      const sd = rng.pick([1, -1]);
      const slen = rng.range(16, 24);
      const spur = R(sd > 0 ? nx + TW / 2 - 2 : nx - TW / 2 - slen, nz - W / 2, sd > 0 ? nx + TW / 2 + slen : nx - TW / 2 + 2, nz + W / 2);
      if (!rects.some(q => overlaps(spur, q, 3))) {
        const pad2 = sd > 0 ? R(spur.x1 - 2, nz - 7, spur.x1 + 13, nz + 7) : R(spur.x0 - 13, nz - 7, spur.x0 + 2, nz + 7);
        if (!rects.some(q => overlaps(pad2, q, 3))) {
          rects.push(spur, pad2);
          pickups.push({ x: (pad2.x0 + pad2.x1) / 2, z: nz, type: 'loot', rng: rng() });
          if (rng.chance(0.35)) pickups.push({ x: (pad2.x0 + pad2.x1) / 2 + 2.5, z: nz + 2.5, type: 'super', rng: rng() });
          spawns.push({ x: (spur.x0 + spur.x1) / 2, z: nz });
        }
      }
    }
    waypoints.push({ x: nx, z: nz });
    cx = nx; cz = nz; prev = plaza;
  }

  // ---------- meshes + physics edges ----------
  for (const rect of rects) {
    bodies.set(rect, wallBody(rect, group));
    // 4 edges: N(z0), S(z1), W(x0), E(x1)
    const eds = [
      { axis: 'z', at: rect.z0, lo: rect.x0, hi: rect.x1, inward: 1, tangent: 'x' },
      { axis: 'z', at: rect.z1, lo: rect.x0, hi: rect.x1, inward: -1, tangent: 'x' },
      { axis: 'x', at: rect.x0, lo: rect.z0, hi: rect.z1, inward: 1, tangent: 'z' },
      { axis: 'x', at: rect.x1, lo: rect.z0, hi: rect.z1, inward: -1, tangent: 'z' },
    ];
    for (const e of eds) {
      const ivs = freeIntervals(rect, rects, e.axis, e.at, e.lo, e.hi);
      if (!ivs.length) continue;
      const segs = [];
      for (const [a, b] of ivs) {
        // crenellation: merlon 1.5 wide every merlonGap; occasional broken stretch
        let p = a + 0.4, broken = 0;
        while (p + 1.5 < b) {
          if (broken > 0) { broken--; p += CFG.merlonGap; continue; }
          if (rng.chance(0.07)) { broken = rng.int(1, 3); continue; }
          segs.push([p, p + 1.5]);
          merlonSpots.push({ e, at: p + 0.75, rect });
          p += CFG.merlonGap;
        }
      }
      e.segs = segs;
      rect.edges.push(e);
    }
  }

  // merlons: one InstancedMesh (crack-A merlons get their own group for collapse)
  const merlonGeo = new THREE.BoxGeometry(1.5, 1.7, 0.55);
  const merlonM = slabMat(3, 3, false);
  const mainSpots = merlonSpots.filter(s => !cracks.some(c => c.rectA === s.rect));
  const im = new THREE.InstancedMesh(merlonGeo, merlonM, Math.max(1, mainSpots.length));
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sc1 = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  mainSpots.forEach((s, idx) => {
    const x = s.e.axis === 'z' ? s.at : s.e.at + s.e.inward * 0.28;
    const z = s.e.axis === 'z' ? s.e.at + s.e.inward * 0.28 : s.at;
    pv.set(x, H + 0.85, z);
    m4.compose(pv, s.e.axis === 'x' ? qy : q0, sc1);
    im.setMatrixAt(idx, m4);
  });
  im.castShadow = !LITE; group.add(im);
  for (const c of cracks) {
    const spots = merlonSpots.filter(s => s.rect === c.rectA);
    const cg = new THREE.Group();
    for (const s of spots) {
      const mm = new THREE.Mesh(merlonGeo, merlonM);
      const x = s.e.axis === 'z' ? s.at : s.e.at + s.e.inward * 0.28;
      const z = s.e.axis === 'z' ? s.e.at + s.e.inward * 0.28 : s.at;
      mm.position.set(x, H + 0.85, z); if (s.e.axis === 'x') mm.rotation.y = Math.PI / 2;
      cg.add(mm);
    }
    group.add(cg);
    c.groupA = new THREE.Group(); c.groupA.add(cg); // body added below
    c.bodyA = bodies.get(c.rectA);
    c.merlons = cg;
    // crack visual: dark jagged strip across the span
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(c.x1 - c.x0, 1.1), mat(0x120c08));
    strip.rotation.x = -Math.PI / 2; strip.rotation.z = 0.02;
    strip.position.set((c.x0 + c.x1) / 2, H + 0.03, c.at);
    group.add(strip);
  }

  // crates + explosive barrels
  const crateM = mat(0x6e4a2a), boomM = mat(0x7a2818, 0xff5a2a, .4);
  for (const cr of crates) {
    const mesh = new THREE.Mesh(BOX, cr.boom ? boomM : crateM);
    const s = cr.boom ? 1.1 : 1.3;
    mesh.scale.set(s, s, s); mesh.position.set(cr.x, H + s / 2, cr.z);
    mesh.rotation.y = rng.range(0, 1.5); mesh.castShadow = !LITE;
    group.add(mesh);
    cr.mesh = mesh; cr.hp = 20; cr.r = 0.9; cr.dead = false;
  }

  // braziers on plazas (emissive — bloom does the lighting lie)
  const brazM = mat(0x3a3430), fireM = mat(0xff7a2a, 0xff9a3a, 2.2);
  for (const wp of waypoints) {
    for (const [ox, oz] of [[-TW / 2 + 2, -TW / 2 + 2], [TW / 2 - 2, TW / 2 - 2], [-TW / 2 + 2, TW / 2 - 2], [TW / 2 - 2, -TW / 2 + 2]]) {
      if (rng.chance(0.5)) continue;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.34, .22, 1.1, 6), brazM);
      b.position.set(wp.x + ox, H + .55, wp.z + oz);
      const f = new THREE.Mesh(new THREE.SphereGeometry(.3, 6, 5), fireM);
      f.position.y = .7; b.add(f); f.userData.flame = true;
      group.add(b);
    }
  }

  // banners on some merlons
  const bannerM = new THREE.MeshLambertMaterial({ color: 0x7c2b16, side: THREE.DoubleSide });
  for (let i = 0; i < Math.min(8, mainSpots.length); i++) {
    const s = mainSpots[Math.floor(rng() * mainSpots.length)];
    const x = s.e.axis === 'z' ? s.at : s.e.at + s.e.inward * 0.28;
    const z = s.e.axis === 'z' ? s.e.at + s.e.inward * 0.28 : s.at;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3.4, 5), brazM);
    pole.position.set(x, H + 3.2, z);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), bannerM);
    cloth.position.set(0, -0.6, 0.02); cloth.userData.banner = true;
    pole.add(cloth); group.add(pole);
  }

  // gates. gz = the exit arch line — walking through it completes the level
  buildGate(group, start.x, 13, false);           // behind start (clear of the camera)
  const exitGate = buildGate(group, cx, cz - TW / 2 - 1, true);
  const endGate = { x: cx, z: cz, gz: cz - TW / 2 - 1, rect: prev, gate: exitGate, opened: false };

  // materialize pickups
  for (const p of pickups) p.y = H + 1.0;

  return { group, rects, cracks, pickups, spawns, climbs, waypoints, crates, start, endGate, seed, n, bodies };
}

function buildGate(group, x, z, isExit) {
  const W = CFG.wallW, H = CFG.wallH;
  const g = new THREE.Group();
  const towerM = slabMat(6, H + 8, false);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(BOX, towerM);
    t.scale.set(4, H + 9, 4); t.position.set(sx * (W / 2 + 1.6), (H + 9) / 2, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 4), mat(0x2c2018));
    cap.position.set(sx * (W / 2 + 1.6), H + 10.4, 0); cap.rotation.y = Math.PI / 4;
    g.add(t, cap);
  }
  const arch = new THREE.Mesh(BOX, towerM);
  arch.scale.set(W + 3, 3, 3.4); arch.position.set(0, H + 5.4, 0);
  g.add(arch);
  // portcullis grid
  const bars = new THREE.Group();
  const barM = mat(isExit ? 0x2c4438 : 0x38302a, isExit ? 0x35ff88 : 0, isExit ? .35 : 0);
  for (let i = -3; i <= 3; i++) {
    const b = new THREE.Mesh(BOX, barM); b.scale.set(.16, 5.4, .16); b.position.set(i * 1.4, H + 2.7, 0); bars.add(b);
  }
  g.add(bars); g.userData.bars = bars;
  const lampM = mat(0x203828, isExit ? 0x35ff88 : 0xff5a2a, 1.8);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(.28, 6, 5), lampM); l.position.set(sx * (W / 2 + 1.6), H + 3.4, 1.6); g.add(l); }
  g.position.set(x, 0, z);
  group.add(g);
  return g;
}

// collapse a crack's south portion: hide solid, mark rect dead, return debris origin box
export function collapseCrack(crack) {
  crack.done = true;
  crack.rectA.dead = true;
  crack.bodyA.visible = false;
  crack.merlons.visible = false;
  return { x0: crack.rectA.x0, x1: crack.rectA.x1, z0: crack.rectA.z0, z1: crack.rectA.z1 };
}

// Spooky Hollow theme — buildEnvironment: night sky, crag under the course, lava falls, jack-o'-lanterns,
// graves, fences, gargoyles, cauldron, haunted mansion, skull rock, bats, fog wisps, lightning.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, rng, distToPath, disposeTree, mat } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, buildLavaFalls, buildFoliage, roundRock, spikes } from './island.js';
import { buildMansion, buildSkullRock, buildCrag } from './backdrop.js';
import { pumpkin, gravestone, fence, gargoylePillar, candles, cauldron, deadTree } from './props.js';
import { makeBillboards } from './billboards.js';
import { wispAtlasTexture, batTexture, boltTexture, fadeTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);

function courseFrame(info) {
  const path = info.path;
  const tee = info.tee || path[0], cup = info.cup || path[path.length - 1];
  const fwd = new THREE.Vector3(cup.x - tee.x, 0, cup.z - tee.z);
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const center = info.bounds.getCenter(new THREE.Vector3());
  let fmin = Infinity, fmax = -Infinity, rmin = Infinity, rmax = -Infinity;
  const v = new THREE.Vector3();
  for (const p of path) {
    v.subVectors(p, center);
    const f = v.dot(fwd), r = v.dot(right);
    fmin = Math.min(fmin, f); fmax = Math.max(fmax, f); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
  }
  const size = Math.max(fmax - fmin, rmax - rmin, 4);
  const basis = new THREE.Matrix4().makeBasis(right, UP, fwd.clone().negate()); // local +z faces back toward the tee
  // view: the direction the play camera looks from the tee (first ~3 m of the path); differs from fwd on hairpins
  let k = 0, acc = 0;
  while (k < path.length - 1 && acc < 3) { acc += path[k + 1].distanceTo(path[k]); k++; }
  const view = new THREE.Vector3(path[k].x - path[0].x, 0, path[k].z - path[0].z);
  if (view.lengthSq() < 1e-6) view.copy(fwd); else view.normalize();
  const viewRight = new THREE.Vector3().crossVectors(view, UP).normalize();
  const viewBasis = new THREE.Matrix4().makeBasis(viewRight, UP, view.clone().negate());
  return { tee, cup, fwd, right, center, fmin, fmax, rmin, rmax, size, minY: info.bounds.min.y, basis, view, viewRight, viewBasis,
    /** offsets in the view frame (right, up, ahead) from the course centre */
    atV(lx, ly, lz) { return center.clone().addScaledVector(viewRight, lx).addScaledVector(UP, ly).addScaledVector(view, lz); },
    at(lx, ly, lz) { return center.clone().addScaledVector(right, lx).addScaledVector(UP, ly).addScaledVector(fwd, lz); } };
}

/** Deterministic lightning: a double flicker every ~6–13 s. Returns 0..1. */
function flashAt(t) {
  const period = 9.5;
  const k = Math.floor(t / period);
  const h = Math.abs(Math.sin(k * 127.1) * 43758.5453) % 1;
  const start = k * period + h * 5;
  const dt = t - start;
  if (dt < 0 || dt > 0.5) return 0;
  const a = Math.exp(-dt * 22) + 0.8 * Math.exp(-Math.max(0, dt - 0.16) * 14) * (dt > 0.16 ? 1 : 0);
  return Math.min(1, a);
}

export function buildEnvironment(scene, info, M, quality) {
  const hi = quality !== 'low';
  const I = M.internal;
  const root = new THREE.Group(); root.name = 'spooky.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const r = rng(13);
  const bucketMats = {
    vc: I.vc, gloss: I.vcGloss, metal: I.vcMetal, cloth: I.vcCloth, rock: I.vcRock,
    face: I.faceGlow, ember: I.emberGlow, green: I.greenGlow, candle: I.candle, win: I.windowGlow,
  };
  const disposables = [];

  // ---------- crag under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const course = buildCourseRock(path, widths, hi, floor);
  const rockList = course.geometry ? [course.geometry] : [];
  for (let i = 0; i < (hi ? 10 : 4); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const sp = [];
    spikes(sp, f.p.x, f.p.y, f.p.z, (f.el + f.er) * 0.8, f.d, 1, 100 + i);
    rockList.push(...sp);
  }
  let rockMinY = info.bounds.min.y - 4;
  if (course.geometry) { course.geometry.computeBoundingBox(); rockMinY = Math.min(info.bounds.min.y, course.geometry.boundingBox.min.y); }
  frame.minY = rockMinY;

  // ---------- sky, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality);
  const fog = scene.fog;

  // helper: is (x,z) clear of the fairway by `pad` m?
  const clear = (x, z, pad) => { const { d, i } = distToPath(path, x, z); return d >= (widths[i] ?? 1.5) / 2 + pad; };

  // ---------- lava falls off the course crag (few, toward the camera side) ----------
  const fallSpots = [];
  {
    const nF = course.frames.length, cands = [];
    const back = frame.fwd.clone().negate();
    for (let k = Math.floor(nF * 0.15); k < nF * 0.88; k += 2) {
      const f = course.frames[k];
      for (const side of [-1, 1]) {
        const dir = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
        const ext = side < 0 ? f.el : f.er;
        const p = f.p.clone().addScaledVector(dir, ext).add(new THREE.Vector3(0, -0.12, 0));
        if (!clear(p.x + dir.x * 0.8, p.z + dir.z * 0.8, 0.5)) continue;
        cands.push({ p, dir, f, score: dir.dot(back) * 0.5 + Math.abs(dir.dot(frame.right)) * 0.6 + r() * 0.3 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (fallSpots.length >= (hi ? 2 : 1)) break;
      if (fallSpots.some(s => s.p.distanceTo(c.p) < 4)) continue;
      fallSpots.push({ p: c.p, dir: c.dir, width: 0.5 + r() * 0.3, length: c.f.d * 1.5 + 6 });
    }
  }

  // ---------- near props ----------
  const near = new Buckets();
  const glowItems = [], emberItems = [], candleTips = [];
  const avoid = [];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const camGuess = frame.tee.clone().addScaledVector(frame.fwd, -2.5);

  // jack-o'-lanterns along the course (alternating sides), faces turned toward the tee side
  {
    let acc = 0, total = 0, side = 1, n = 0;
    const spacing = hi ? 2.6 : 3.6;
    for (let i = 1; i < path.length; i++) {
      const seg = path[i].distanceTo(path[i - 1]);
      acc += seg; total += seg;
      if (acc < spacing || total < 1.8) continue;
      if (floor && floor[i] === false) continue;
      acc = 0;
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const rx = -t.z * side, rz = t.x * side;
      const w = (widths[i] ?? 1.5) / 2;
      const x = path[i].x + rx * (w + 0.32), z = path[i].z + rz * (w + 0.32);
      side = -side;
      if (!clear(x, z, 0.24)) continue;
      const p = new THREE.Vector3(x, path[i].y - 0.03, z);
      const pr = 0.09 + r() * 0.05;
      const Mx = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(p, camGuess) + (r() - 0.5) * 0.6));
      pumpkin(near, Mx, pr);
      glowItems.push({ p: [p.x, p.y + pr * 0.8, p.z], w: pr * 5, a: 0.5, color: [1, 0.55, 0.15] });
      avoid.push({ x, z, r: pr + 0.12 });
      if (n++ % 2 === 0) {
        const cp = new THREE.Vector3(x + t.x * 0.2, p.y, z + t.z * 0.2);
        if (clear(cp.x, cp.z, 0.2)) {
          const tips = candles(near, new THREE.Matrix4().makeTranslation(cp.x, cp.y, cp.z), 0.1, 2 + (r() * 2 | 0), n);
          for (const tp of tips) candleTips.push(tp.add(cp));
        }
      }
    }
  }

  // the tee: gargoyle pillars, big pumpkins and candles (like the ref)
  const w0 = (widths[0] ?? 1.5) / 2;
  const teeLight = new THREE.PointLight(0xff8a30, hi ? 1.6 : 1.2, 3.2, 1.6);
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, 0.25);
      if (clear(pp.x, pp.z, 0.22)) {
        gargoylePillar(near, new THREE.Matrix4().makeTranslation(pp.x, pp.y - 0.02, pp.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(pp, frame.tee.clone().addScaledVector(frame.fwd, 1.5)))), 0.5, 0.2);
        avoid.push({ x: pp.x, z: pp.z, r: 0.3 });
        glowItems.push({ p: [pp.x, pp.y + 0.62, pp.z], w: 0.18, a: 0.6, color: [1, 0.5, 0.15] });
      }
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.36)).addScaledVector(frame.fwd, -0.3);
      if (clear(pk.x, pk.z, 0.2)) {
        const pr = 0.16;
        pumpkin(near, new THREE.Matrix4().makeTranslation(pk.x, pk.y - 0.03, pk.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(pk, camGuess) + s * 0.3)), pr);
        glowItems.push({ p: [pk.x, pk.y + 0.12, pk.z], w: 0.8, a: 0.45, color: [1, 0.55, 0.15] });
        avoid.push({ x: pk.x, z: pk.z, r: 0.25 });
        const cp = pk.clone().addScaledVector(frame.fwd, 0.28).addScaledVector(frame.right, -s * 0.05);
        if (clear(cp.x, cp.z, 0.12)) {
          const tips = candles(near, new THREE.Matrix4().makeTranslation(cp.x, cp.y - 0.03, cp.z), 0.16, 3, s + 2);
          for (const tp of tips) candleTips.push(tp.add(cp).add(new THREE.Vector3(0, -0.03, 0)));
        }
      }
    }
    teeLight.position.copy(frame.tee).addScaledVector(frame.fwd, -0.2).add(new THREE.Vector3(0, 0.45, 0));
    root.add(teeLight);
  }

  // cauldron beside the course around 55% along, on the side with most room
  let brew = null;
  {
    for (const k of [0.55, 0.4, 0.7, 0.3]) {
      const i = Math.floor(path.length * k);
      const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      let done = false;
      for (const side of [1, -1]) {
        const w = (widths[i] ?? 1.5) / 2;
        const x = path[i].x - t.z * side * (w + 0.55), z = path[i].z + t.x * side * (w + 0.55);
        if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
        if (floor && floor[i] === false) continue;
        const cpos = new THREE.Vector3(x, path[i].y - 0.03, z);
        const top = cauldron(near, new THREE.Matrix4().makeTranslation(cpos.x, cpos.y, cpos.z), 0.2);
        brew = top.add(cpos);
        avoid.push({ x, z, r: 0.35 });
        done = true; break;
      }
      if (done) break;
    }
    if (brew) {
      glowItems.push({ p: [brew.x, brew.y + 0.05, brew.z], w: 1.0, a: 0.45, color: [0.35, 1, 0.5] });
      for (let i = 0; i < (hi ? 14 : 6); i++) {
        emberItems.push({ p: [brew.x + (r() - 0.5) * 0.25, brew.y, brew.z + (r() - 0.5) * 0.25], w: 0.05 + r() * 0.05, a: 0.9, color: [0.5, 1, 0.55], phase: r(), drift: 0.35 + r() * 0.3 });
      }
    }
  }

  // gravestones and dead trees on the island top
  {
    let tries = hi ? 140 : 60, placed = 0;
    while (tries-- > 0 && placed < (hi ? 16 : 7)) {
      const f = course.frames[2 + Math.floor(r() * (course.frames.length - 4))];
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.15) * (0.55 + r() * 0.45);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.32) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.15)) continue;
      const Mx = new THREE.Matrix4().makeTranslation(x, f.p.y - 0.03, z).multiply(new THREE.Matrix4().makeRotationY(yawTo({ x, z }, camGuess) + (r() - 0.5) * 0.8))
        .multiply(mat(0, 0, 0, (r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25));
      if (placed % 5 === 4) deadTree(near, Mx, 0.9 + r() * 0.6, r);
      else gravestone(near, Mx, 0.16 + r() * 0.1, (r() * 3) | 0);
      avoid.push({ x, z, r: 0.2 });
      placed++;
    }
  }

  // iron fences along the outer rim of the crag (short runs, skipping near the tee so the camera sees in)
  {
    const fr = course.frames;
    const runs = hi ? 6 : 3;
    for (let k = 0; k < runs; k++) {
      const i0 = Math.floor((0.12 + 0.8 * k / runs) * fr.length);
      const side = k % 2 ? 1 : -1;
      const pts = [];
      for (let j = i0; j < Math.min(fr.length, i0 + 5); j++) {
        const f = fr[j], ext = (side < 0 ? f.el : f.er) - 0.12;
        const x = f.p.x - f.t.z * side * ext, z = f.p.z + f.t.x * side * ext;
        if (!clear(x, z, 0.2)) break;
        pts.push(new THREE.Vector3(x, f.p.y - 0.03, z));
      }
      for (let j = 0; j < pts.length - 1; j++) fence(near, pts[j], pts[j + 1], 0.32, 0.11);
    }
  }
  near.build(bucketMats, root, { castShadow: true, receiveShadow: false });

  // ---------- foliage ----------
  avoid.push({ x: frame.tee.x, z: frame.tee.z, r: w0 + 0.55 }, ...fallSpots.map(s => ({ x: s.p.x, z: s.p.z, r: s.width + 0.3 })));
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid)) { root.add(o); }

  // ---------- backdrop ----------
  const back = new Buckets();
  const backRocks = [];
  const manP = frame.atV(frame.size * 0.15 + 16, 6, frame.size * 0.5 + 95);
  const manM = new THREE.Matrix4().makeTranslation(manP.x, manP.y, manP.z).multiply(frame.viewBasis);
  buildMansion(back, manM, hi);
  {
    const g = roundRock(11, 14, 5, hi); g.applyMatrix4(manM); backRocks.push(g);
    const sp = []; spikes(sp, 0, -2, 0, 11, 14, hi ? 5 : 3, 55);
    for (const s of sp) { s.applyMatrix4(manM); backRocks.push(s); }
  }
  // skull rock on the left, part way down the hole
  const skP = frame.atV(-frame.size * 0.5 - 12, -1, 4);
  const skM = new THREE.Matrix4().makeTranslation(skP.x, skP.y, skP.z)
    .multiply(new THREE.Matrix4().makeRotationY(Math.atan2(frame.tee.x - skP.x, frame.tee.z - skP.z) + 0.35));
  fallSpots.push(buildSkullRock(back, backRocks, skM, 5, 9, hi));
  const crags = [
    [frame.rmax + 14, -3, frame.fmax * 0.4, 3.5, 6, 'graves'],
    [frame.rmax + 12, -9, frame.fmin + 4, 2.6, 4, 'trees'],
    [frame.rmin - 13, -10, frame.fmin + 2, 2.6, 4.5, 'pumpkins'],
    [frame.rmin - 30, 7, frame.fmax + 32, 5, 9, 'tower'],
    [frame.rmax + 38, 6, frame.fmax + 30, 5, 9, 'graves'],
    [-34, 16, frame.fmax + 105, 7, 12, 'tower'],
    [42, -1, frame.fmax + 80, 5, 8, 'trees'],
    [-18, -8, frame.fmin - 30, 4, 6, 'graves'],
    [24, 2, frame.fmin - 40, 5, 8, 'trees'],
  ];
  crags.slice(0, hi ? crags.length : 5).forEach(([lx, ly, lz, R, D, kind], k) => {
    buildCrag(back, backRocks, frame.basis, frame.at(lx, ly, lz), R, D, kind, 300 + k * 17, hi);
  });
  const backMeshes = back.build(bucketMats, root, { castShadow: false, receiveShadow: false });
  void backMeshes;

  // ---------- rock (course crag + backdrop crags in one mesh) ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'spooky.rock';
  }

  // ---------- lava falls ----------
  const falls = buildLavaFalls(fallSpots, hi);
  root.add(falls.mesh);
  for (const s of fallSpots) {
    for (let i = 0; i < (hi ? 10 : 4); i++) {
      emberItems.push({ p: [s.p.x + s.dir.x * (0.3 + r() * 0.6) + (r() - 0.5) * s.width, s.p.y - r() * 1.5, s.p.z + s.dir.z * (0.3 + r() * 0.6)],
        w: 0.06 + r() * 0.08, a: 1, color: [1, 0.55, 0.15], phase: r(), drift: 1.2 + r() * 1.5 });
    }
  }

  // ---------- billboards ----------
  // candle + pumpkin + mansion window glows (flicker)
  for (const p of candleTips) glowItems.push({ p: [p.x, p.y, p.z], w: 0.14, a: 0.7, color: [1, 0.75, 0.4] });
  for (const [x, y, z, w] of [[0, 2.2, 4.4, 5], [0, 6, 3.4, 7], [-6, 4, 2.8, 4], [6, 4, 2.8, 4], [0, 14, -1, 5]]) {
    glowItems.push({ p: new THREE.Vector3(x, y, z).applyMatrix4(manM), w, a: 0.3, color: [1, 0.6, 0.25] });
  }
  const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
  glowMesh.name = 'spooky.glows';
  root.add(glowMesh);

  const lavaGlow = makeBillboards(falls.mistItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
  lavaGlow.name = 'spooky.lavaGlow';
  root.add(lavaGlow);

  if (emberItems.length) {
    const embers = makeBillboards(emberItems, { map: M.tex.glow, additive: true, mode: 'rise', fog, uniforms: M.uniforms });
    embers.name = 'spooky.embers';
    root.add(embers);
  }

  // fireflies / will-o'-wisps (green) around the course
  const spark = [];
  for (let i = 0; i < (hi ? 50 : 20); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = r() * 2 - 1;
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.6)).add(new THREE.Vector3(0, 0.25 + r() * 1.6, 0));
    spark.push({ p, w: 0.05 + r() * 0.06, a: 0.9, color: r() < 0.7 ? [0.5, 1, 0.6] : [1, 0.7, 0.35], phase: r(), drift: 0.12 + r() * 0.2 });
  }
  const sparkMesh = makeBillboards(spark, { map: M.tex.glow, additive: true, mode: 'sparkle', fog, uniforms: M.uniforms });
  sparkMesh.name = 'spooky.wisps';
  root.add(sparkMesh);

  // fog wisps: low drifting streaks around and below the course
  const wispTex = wispAtlasTexture(hi ? 256 : 128);
  disposables.push(wispTex);
  const wisps = [];
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  for (let i = 0; i < (hi ? 26 : 10); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = r() < 0.5 ? -1 : 1;
    const rr = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
    const out = Math.max(f.el, f.er) + 0.8 + r() * 3;
    const p = f.p.clone().addScaledVector(rr, out).add(new THREE.Vector3(0, -0.3 - r() * 2.5, 0));
    const w = 2.5 + r() * 3;
    wisps.push({ p, w, h: w * 0.4, uv: cell((r() * 4) | 0), color: [0.62, 0.72, 0.85], a: 0.55, phase: r(), drift: 0.8 + r() * 1.2 });
  }
  for (let i = 0; i < (hi ? 22 : 10); i++) {        // big banks lower down and far out
    const a = r() * Math.PI * 2, d = frame.size * 0.6 + 8 + r() * 60;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, rockMinY - 2 + r() * 10, Math.sin(a) * d));
    const w = 12 + r() * 20;
    wisps.push({ p, w, h: w * 0.4, uv: cell((r() * 4) | 0), color: [0.45, 0.6, 0.72], a: 0.6, phase: r(), drift: 3 + r() * 4 });
  }
  const eye = frame.tee.clone().addScaledVector(frame.fwd, -4).add(new THREE.Vector3(0, 4, 0));
  wisps.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const wispMesh = makeBillboards(wisps, { map: wispTex, mode: 'drift', fog, uniforms: M.uniforms, renderOrder: 2 });
  wispMesh.name = 'spooky.fogWisps';
  root.add(wispMesh);

  // bats: a swarm across the moon and a few circling the mansion and the course
  const batTex = batTexture(128, 64);
  disposables.push(batTex);
  const bats = [];
  const moonC = frame.center.clone().addScaledVector(sky.moonDir, 120);
  for (let i = 0; i < (hi ? 16 : 8); i++) {
    const p = moonC.clone().add(new THREE.Vector3((r() - 0.5) * 30, (r() - 0.5) * 22, (r() - 0.5) * 30));
    bats.push({ p, w: 2.4 + r() * 1.6, h: 1.2 + r() * 0.8, color: [1, 1, 1], a: 1, phase: r(), drift: 6 + r() * 14 });
  }
  for (let i = 0; i < (hi ? 8 : 4); i++) {
    const p = manP.clone().add(new THREE.Vector3((r() - 0.5) * 6, 14 + r() * 8, (r() - 0.5) * 6));
    bats.push({ p, w: 1.0 + r() * 0.6, h: 0.5 + r() * 0.3, color: [1, 1, 1], a: 1, phase: r(), drift: 5 + r() * 8 });
  }
  for (let i = 0; i < (hi ? 6 : 3); i++) {
    const p = frame.center.clone().add(new THREE.Vector3((r() - 0.5) * 4, 3 + r() * 3, (r() - 0.5) * 4));
    bats.push({ p, w: 0.35 + r() * 0.2, h: 0.18 + r() * 0.1, color: [1, 1, 1], a: 1, phase: r(), drift: frame.size * 0.35 + r() * 3 });
  }
  const batMesh = makeBillboards(bats, { map: batTex, mode: 'bat', uniforms: M.uniforms, renderOrder: 1 });
  batMesh.name = 'spooky.bats';
  root.add(batMesh);

  // ---------- lightning bolts (far, toward flashDir) ----------
  const boltTex = boltTexture(128, 512);
  disposables.push(boltTex);
  const boltMat = new THREE.MeshBasicMaterial({ map: boltTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const boltGeo = new THREE.PlaneGeometry(14, 56);
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.position.copy(frame.center).addScaledVector(sky.flashDir, 170).add(new THREE.Vector3(0, 6, 0));
  bolt.lookAt(frame.center.x, bolt.position.y, frame.center.z);
  bolt.renderOrder = -5; bolt.name = 'spooky.bolt'; bolt.frustumCulled = false;
  root.add(bolt);

  // ---------- cup beacon: pale green ghost light so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x9effc0, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'spooky.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      const flash = flashAt(t);
      sky.update(dt, t, info.camera, flash);
      M.animated.tick(dt, t);
      falls.update(t);
      boltMat.opacity = flash > 0.05 ? flash : 0;
      bolt.visible = flash > 0.05;
      teeLight.intensity = (hi ? 1.6 : 1.2) * (0.82 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 4.3 + 0.7) + 0.08 * Math.sin(t * 17.3));
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      falls.dispose?.();
      teeLight.dispose();
      sky.dispose();
    },
  };
}

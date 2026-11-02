// Candy Land theme — buildEnvironment: a pastel day sky with a rainbow, a layer cake under the course
// with frosting drips and chocolate pouring off it, lollipops / cupcakes / gumdrops / candy canes along
// the course, a candy castle and small cake islands in the distance, cotton-candy clouds, sugar sparkles
// and a light drift of sprinkles. Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, rng, distToPath, disposeTree, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseCake, buildDrips, buildChocoFalls, buildFoliage, roundCake, roundDrips, spikes } from './island.js';
import { buildCastle, buildIsle } from './backdrop.js';
import { lollipop, cupcake, gumdrop, candyCane, iceCream, POP_COLS, GUM_COLS } from './props.js';
import { buildSprinkles } from './sprinkles.js';
import { makeBillboards } from './billboards.js';
import { cloudAtlasTexture, fadeTexture } from './textures.js';

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
  const view = info.viewDir ? new THREE.Vector3(info.viewDir.x, 0, info.viewDir.z) : fwd.clone();
  if (view.lengthSq() < 1e-6) view.copy(fwd); else view.normalize();
  const viewRight = new THREE.Vector3().crossVectors(view, UP).normalize();
  const viewBasis = new THREE.Matrix4().makeBasis(viewRight, UP, view.clone().negate());
  let vmin = Infinity, vmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const p of path) { v.subVectors(p, center); const f = v.dot(view), r = v.dot(viewRight); vmin = Math.min(vmin, f); vmax = Math.max(vmax, f); wmin = Math.min(wmin, r); wmax = Math.max(wmax, r); }
  return { tee, cup, fwd, right, center, size, minY: info.bounds.min.y, view, viewRight, viewBasis, vmin, vmax, wmin, wmax,
    atV(lx, ly, lz) { return center.clone().addScaledVector(viewRight, lx).addScaledVector(UP, ly).addScaledVector(view, lz); } };
}

export function buildEnvironment(scene, info, M, quality) {
  const hi = quality !== 'low';
  const I = M.internal;
  const root = new THREE.Group(); root.name = 'candy.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(31);
  const bucketMats = {
    vc: I.vc, gloss: I.vcGloss, frost: I.vcFrost, sugar: I.vcSugar, metal: I.vcMetal, candy: I.candy, swirl: I.swirl,
    cloth: I.vcCloth, win: I.windowGlow, cherry: I.cherryGlow, cake: I.vcRock, drip: I.vcFrost,
  };
  const disposables = [];

  // ---------- the cake under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const course = buildCourseCake(path, widths, hi, floor, voids);
  const cakeList = course.geometry ? [course.geometry] : [];
  for (let i = 0; i < (hi ? 8 : 3); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const sp = [];
    spikes(sp, f.p.x, f.p.y - 1.5, f.p.z, (f.el + f.er) * 0.8, f.d, 1, 100 + i);
    cakeList.push(...sp);
  }
  let rockMinY = info.bounds.min.y - 4;
  if (course.geometry) { course.geometry.computeBoundingBox(); rockMinY = Math.min(info.bounds.min.y, course.geometry.boundingBox.min.y); }
  frame.minY = rockMinY;
  const dripB = new Buckets();
  for (const g of buildDrips(course.frames, hi, voids)) dripB.addRaw('drip', g);

  // ---------- sky, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality);
  const fog = scene.fog;

  const clear = (x, z, pad) => {
    const { d, i } = distToPath(path, x, z);
    return d >= (widths[i] ?? 1.5) / 2 + pad && !inVoid(voids, x, z, 0.12) && distToLines(branches, x, z) >= 0.5;
  };

  // ---------- chocolate pouring over the cake edge (on the sides the camera sees) ----------
  const fallSpots = [];
  {
    const nF = course.frames.length, cands = [];
    const back = frame.view.clone().negate();
    for (let k = Math.floor(nF * 0.15); k < nF * 0.88; k += 2) {
      const f = course.frames[k];
      for (const side of [-1, 1]) {
        const dir = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
        const ext = side < 0 ? f.el : f.er;
        const p = f.p.clone().addScaledVector(dir, ext * 1.06).add(new THREE.Vector3(0, -0.1, 0));
        if (!clear(p.x + dir.x * 0.8, p.z + dir.z * 0.8, 0.5)) continue;
        cands.push({ p, dir, f, score: dir.dot(back) * 0.4 + Math.abs(dir.dot(frame.viewRight)) * 0.7 + r() * 0.3 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (fallSpots.length >= (hi ? 2 : 1)) break;
      if (fallSpots.some(s => s.p.distanceTo(c.p) < 4)) continue;
      fallSpots.push({ p: c.p, dir: c.dir, width: 0.45 + r() * 0.25, length: c.f.d + 4 });
    }
  }

  // ---------- near props ----------
  const near = new Buckets();
  const avoid = [];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const camGuess = frame.tee.clone().addScaledVector(frame.view, -2.5);
  const Mat = (p, yaw = 0) => new THREE.Matrix4().makeTranslation(p.x, p.y - 0.03, p.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  let popN = 0;
  const addPop = (p, h = 0.55) => {
    lollipop(near, Mat(p, yawTo(p, camGuess)), h, h * 0.24, POP_COLS[popN++ % POP_COLS.length]);
    avoid.push({ x: p.x, z: p.z, r: 0.18 });
  };

  // along the course, alternating sides: lollipops, with cupcakes / gumdrop clusters / candy canes between
  {
    let acc = 0, total = 0, side = 1, n = 0;
    const spacing = hi ? 2.0 : 3.0;
    for (let i = 1; i < path.length; i++) {
      const seg = path[i].distanceTo(path[i - 1]);
      acc += seg; total += seg;
      if (acc < spacing || total < 1.6) continue;
      if (floor && floor[i] === false) continue;
      acc = 0;
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const rx = -t.z * side, rz = t.x * side;
      const w = (widths[i] ?? 1.5) / 2;
      const kind = n % 4;
      const off = kind === 1 ? 0.42 : 0.3;
      const x = path[i].x + rx * (w + off), z = path[i].z + rz * (w + off);
      side = -side;
      if (!clear(x, z, kind === 1 ? 0.28 : 0.22)) continue;
      const p = new THREE.Vector3(x, path[i].y, z);
      n++;
      if (kind === 0 || kind === 2) addPop(p, 0.5 + r() * 0.15);
      else if (kind === 1) { cupcake(near, Mat(p, r() * 6), 0.3 + r() * 0.1, { rnd: r, lo: !hi }); avoid.push({ x, z, r: 0.2 }); }
      else {
        if (r() < 0.5) {
          for (let k = 0; k < 3; k++) gumdrop(near, Mat(p.clone().add(new THREE.Vector3((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2))), 0.05 + r() * 0.03, GUM_COLS[(k + n) % GUM_COLS.length], !hi);
        } else candyCane(near, Mat(p, yawTo(p, camGuess) + Math.PI / 2), 0.36, 0.018, 12);
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two big lollipops flanking it, gumdrops and an ice-cream cone behind
  const w0 = (widths[0] ?? 1.5) / 2;
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.36)).addScaledVector(frame.fwd, 0.2);
      if (clear(pp.x, pp.z, 0.18)) addPop(pp, 0.75);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        for (let k = 0; k < 3; k++) gumdrop(near, Mat(pk.clone().add(new THREE.Vector3((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25))), 0.06 + r() * 0.03, GUM_COLS[(k * 2 + (s > 0 ? 1 : 0)) % GUM_COLS.length], !hi);
        avoid.push({ x: pk.x, z: pk.z, r: 0.28 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.35)) { iceCream(near, Mat(tp, yawTo(tp, camGuess)), 0.85, { rnd: r, lo: !hi }); avoid.push({ x: tp.x, z: tp.z, r: 0.3 }); }
  }

  // a giant cupcake beside the course around 55% along, on the side with most room
  {
    let done = false;
    for (const k of [0.55, 0.4, 0.7, 0.3, 0.8]) {
      const i = Math.floor(path.length * k);
      if (floor && floor[i] === false) continue;
      const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      for (const side of [1, -1]) {
        const w = (widths[i] ?? 1.5) / 2;
        const x = path[i].x - t.z * side * (w + 0.6), z = path[i].z + t.x * side * (w + 0.6);
        if (!clear(x, z, 0.45) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
        cupcake(near, Mat(new THREE.Vector3(x, path[i].y, z), r() * 6), 0.9, { rnd: r, lo: !hi, liner: 0xff4f9a, frost: 0xfff1dc });
        avoid.push({ x, z, r: 0.42 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // scattered on the frosting: lollipops, cupcakes, ice-cream cones, candy canes
  {
    let tries = hi ? 140 : 60, placed = 0;
    while (tries-- > 0 && placed < (hi ? 10 : 4)) {
      const f = course.frames[2 + Math.floor(r() * (course.frames.length - 4))];
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.2) * (0.6 + r() * 0.4);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.18)) continue;
      const p = new THREE.Vector3(x, f.p.y, z);
      const kind = placed % 4;
      if (kind === 0) addPop(p, 0.6 + r() * 0.35);
      else if (kind === 1) { cupcake(near, Mat(p, r() * 6), 0.32 + r() * 0.15, { rnd: r, lo: !hi }); avoid.push({ x, z, r: 0.22 }); }
      else if (kind === 2) { iceCream(near, Mat(p, r() * 6), 0.5 + r() * 0.2, { rnd: r, lo: !hi }); avoid.push({ x, z, r: 0.18 }); }
      else { candyCane(near, Mat(p, r() * 6), 0.35 + r() * 0.15, 0.018, 12); avoid.push({ x, z, r: 0.15 }); }
      placed++;
    }
  }
  {
    const built = near.build(bucketMats, root, { castShadow: true, receiveShadow: false });
    for (const k of ['metal', 'win', 'cherry']) if (built[k]) built[k].castShadow = false;
  }

  // ---------- foliage: gumdrops + cotton-candy trees ----------
  avoid.push({ x: frame.tee.x, z: frame.tee.z, r: w0 + 0.5 }, ...fallSpots.map(s => ({ x: s.p.x, z: s.p.z, r: s.width + 0.3 })));
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid, voids, branches, { sugar: I.sugarInst, tree: I.vcSugar })) root.add(o);

  // ---------- backdrop ----------
  const back = new Buckets();
  const backCakes = [], backDrips = [];
  const casP = frame.atV(frame.wmax * 0.2 + 8, -5, frame.vmax + 70);
  const casM = new THREE.Matrix4().makeTranslation(casP.x, casP.y, casP.z).multiply(frame.viewBasis);
  const casGlows = buildCastle(back, casM, hi);
  {
    const { geometry, L } = roundCake(12, 22, 5, hi); geometry.applyMatrix4(casM); backCakes.push(geometry);
    const sp = []; spikes(sp, 0, -L * 1.5, 0, 12, 22, hi ? 6 : 3, 55);
    for (const s of sp) { s.applyMatrix4(casM); backCakes.push(s); }
    roundDrips(backDrips, casM, 12, L, hi ? 26 : 14, 57);
    // a chocolate river pours off the front of the castle island
    for (const [sx, w] of [[-0.45, 2.2]]) {
      const dir = frame.view.clone().negate().addScaledVector(frame.viewRight, sx).normalize();
      fallSpots.push({ p: casP.clone().addScaledVector(dir, 11.2).add(new THREE.Vector3(0, -0.2, 0)), dir, width: w, length: 20 });
    }
  }
  const isles = [
    [frame.wmin - 15, -2, frame.vmax * 0.3 + 4, 3.6, 6, 'lollipops'],
    [frame.wmax + 16, 1, frame.vmax + 10, 4, 7, 'cupcake'],
    [frame.wmin - 12, -10, frame.vmin + 2, 2.6, 4.5, 'gumdrops'],
    [frame.wmax + 13, -8, frame.vmin + 6, 2.6, 4, 'icecream'],
    [frame.wmin - 32, 6, frame.vmax + 30, 5, 9, 'donut'],
    [frame.wmax + 40, 8, frame.vmax + 36, 5.5, 10, 'canes'],
    [-34, 16, frame.vmax + 110, 7, 12, 'lollipops'],
    [44, -1, frame.vmax + 82, 5, 8, 'cupcake'],
    [-18, -8, frame.vmin - 30, 4, 6, 'gumdrops'],
    [24, 2, frame.vmin - 40, 5, 8, 'icecream'],
  ];
  isles.slice(0, hi ? isles.length : 6).forEach(([lx, ly, lz, R, D, kind], k) => {
    buildIsle(back, backCakes, backDrips, frame.viewBasis, frame.atV(lx, ly, lz), R, D, kind, 300 + k * 17, hi);
  });
  for (const m of Object.values(back.build(bucketMats, root, { castShadow: false, receiveShadow: false }))) m.name = 'back.' + m.name;
  for (const g of backDrips) dripB.addRaw('drip', g);

  // ---------- cake (course + backdrop islands) in one mesh, drips in one mesh ----------
  {
    const b = new Buckets();
    for (const g of cakeList) b.addRaw('cake', g);
    for (const g of backCakes) b.addRaw('cake', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.cake.name = 'candy.cake';
    const db = dripB.build(bucketMats, root, { castShadow: false, receiveShadow: true });
    if (db.drip) db.drip.name = 'candy.drips';
  }

  // ---------- chocolate falls ----------
  const falls = buildChocoFalls(fallSpots, hi);
  root.add(falls.mesh);

  // ---------- billboards ----------
  const glowItems = casGlows.map(p => ({ p, w: 2.2, a: 0.12, color: [1, 0.85, 0.6] }));
  if (glowItems.length) {
    const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
    glowMesh.name = 'candy.glows';
    root.add(glowMesh);
  }
  // sugar sparkles glinting around the course
  const spark = [];
  const SPK = [[1, 0.85, 0.95], [1, 0.95, 0.7], [0.8, 0.95, 1], [1, 1, 1]];
  for (let i = 0; i < (hi ? 46 : 18); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5);
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.3)).add(new THREE.Vector3(0, 0.2 + r() * 1.6, 0));
    spark.push({ p, w: 0.05 + r() * 0.06, a: 0.95, color: SPK[i % SPK.length], phase: r(), drift: 0.1 + r() * 0.15 });
  }
  const sparkMesh = makeBillboards(spark, { map: M.tex.sparkle, additive: true, mode: 'sparkle', fog, uniforms: M.uniforms });
  sparkMesh.name = 'candy.sparkles';
  root.add(sparkMesh);

  // cotton-candy clouds drifting below and around the islands (pink and sky-blue floss)
  const cloudTex = cloudAtlasTexture(hi ? 256 : 128);
  disposables.push(cloudTex);
  const clouds = [];
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  const FLOSS = [[1, 0.78, 0.9], [0.8, 0.9, 1], [1, 0.92, 0.96], [0.9, 0.82, 1]];
  for (let i = 0; i < (hi ? 12 : 5); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = r() < 0.5 ? -1 : 1;
    const rr = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
    const p = f.p.clone().addScaledVector(rr, Math.max(f.el, f.er) + 1.5 + r() * 4).add(new THREE.Vector3(0, -f.d * (0.5 + r() * 0.6) - 2.5, 0));
    const w = 5 + r() * 6;
    clouds.push({ p, w, h: w * 0.5, uv: cell((r() * 4) | 0), color: FLOSS[i % 4], a: 0.85, phase: r(), drift: 0.6 + r() * 1.0 });
  }
  for (let i = 0; i < (hi ? 22 : 10); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.6 + 12 + r() * 70;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, rockMinY - 3 + r() * 12, Math.sin(a) * d));
    const w = 14 + r() * 22;
    clouds.push({ p, w, h: w * 0.45, uv: cell((r() * 4) | 0), color: FLOSS[i % 4], a: 0.9, phase: r(), drift: 3 + r() * 4 });
  }
  const eye = frame.tee.clone().addScaledVector(frame.view, -4).add(new THREE.Vector3(0, 4, 0));
  clouds.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const cloudMesh = makeBillboards(clouds, { map: cloudTex, mode: 'drift', fog, uniforms: M.uniforms, renderOrder: 2 });
  cloudMesh.name = 'candy.clouds';
  root.add(cloudMesh);

  // drifting sprinkles around the camera
  const sprink = buildSprinkles(hi ? 220 : 90, hi ? 12 : 10, fog);
  root.add(sprink.mesh);

  // ---------- cup beacon: a soft pink beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff9ad0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'candy.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
      sprink.update(t, info.camera);
      falls.update(t);
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      falls.dispose?.();
      sprink.dispose();
      sky.dispose();
    },
  };
}

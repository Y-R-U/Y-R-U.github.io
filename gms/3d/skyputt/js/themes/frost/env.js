// Frost Fair theme — buildEnvironment: blue-hour sky with aurora and moon, a snowy crag under the course
// with icicles and frozen falls, lanterns / decorated trees / presents / candy canes / a snowman along the
// course, an ice palace and snowy crags in the distance, Santa's sleigh, falling snow, twinkling lights.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, rng, distToPath, disposeTree, mat, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, buildIcicles, buildFrozenFalls, buildFoliage, roundRock, spikes } from './island.js';
import { buildPalace, buildCrag } from './backdrop.js';
import { christmasTree, snowman, presentPile, candyCane, lantern, COLORS } from './props.js';
import { buildFlight } from './sleigh.js';
import { buildSnow } from './snow.js';
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
  const basis = new THREE.Matrix4().makeBasis(right, UP, fwd.clone().negate());   // local +z faces back toward the tee
  // view: the camera's heading at the tee (engine info.viewDir); differs from tee→cup on hairpins
  const view = info.viewDir ? new THREE.Vector3(info.viewDir.x, 0, info.viewDir.z) : fwd.clone();
  if (view.lengthSq() < 1e-6) view.copy(fwd); else view.normalize();
  const viewRight = new THREE.Vector3().crossVectors(view, UP).normalize();
  const viewBasis = new THREE.Matrix4().makeBasis(viewRight, UP, view.clone().negate());
  let vmin = Infinity, vmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const p of path) { v.subVectors(p, center); const f = v.dot(view), r = v.dot(viewRight); vmin = Math.min(vmin, f); vmax = Math.max(vmax, f); wmin = Math.min(wmin, r); wmax = Math.max(wmax, r); }
  return { tee, cup, fwd, right, center, fmin, fmax, rmin, rmax, size, minY: info.bounds.min.y, basis, view, viewRight, viewBasis, vmin, vmax, wmin, wmax,
    /** offsets in the view frame (right, up, ahead) from the course centre */
    atV(lx, ly, lz) { return center.clone().addScaledVector(viewRight, lx).addScaledVector(UP, ly).addScaledVector(view, lz); } };
}

export function buildEnvironment(scene, info, M, quality) {
  const hi = quality !== 'low';
  const I = M.internal;
  const root = new THREE.Group(); root.name = 'frost.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(24);
  const bucketMats = {
    vc: I.vc, gloss: I.vcGloss, metal: I.vcMetal, snow: I.vcSnow, candy: I.candy, cloth: I.vcCloth,
    bulbA: I.bulbA, bulbB: I.bulbB, star: I.starGlow, win: I.windowGlow, nose: I.noseGlow, ice: I.vcIce, rock: I.vcRock,
  };
  const disposables = [];

  // ---------- snowy crag under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const course = buildCourseRock(path, widths, hi, floor, voids);
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
  const ice = new Buckets();
  for (const g of buildIcicles(course.frames, hi, voids)) ice.addRaw('ice', g);

  // ---------- sky, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality);
  const fog = scene.fog;

  // helper: is (x,z) clear of the fairway by `pad` m (and out of voids / off branch tracks)?
  const clear = (x, z, pad) => {
    const { d, i } = distToPath(path, x, z);
    return d >= (widths[i] ?? 1.5) / 2 + pad && !inVoid(voids, x, z, 0.12) && distToLines(branches, x, z) >= 0.5;
  };

  // ---------- frozen waterfalls off the course crag (toward the camera side) ----------
  const fallSpots = [];
  {
    const nF = course.frames.length, cands = [];
    const back = frame.view.clone().negate();
    for (let k = Math.floor(nF * 0.15); k < nF * 0.88; k += 2) {
      const f = course.frames[k];
      for (const side of [-1, 1]) {
        const dir = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
        const ext = side < 0 ? f.el : f.er;
        const p = f.p.clone().addScaledVector(dir, ext).add(new THREE.Vector3(0, -0.1, 0));
        if (!clear(p.x + dir.x * 0.8, p.z + dir.z * 0.8, 0.5)) continue;
        cands.push({ p, dir, f, score: dir.dot(back) * 0.5 + Math.abs(dir.dot(frame.viewRight)) * 0.6 + r() * 0.3 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (fallSpots.length >= (hi ? 2 : 1)) break;
      if (fallSpots.some(s => s.p.distanceTo(c.p) < 4)) continue;
      fallSpots.push({ p: c.p, dir: c.dir, width: 0.6 + r() * 0.3, length: c.f.d * 1.1 + 3 });
    }
  }

  // ---------- near props ----------
  const near = new Buckets();
  const glowItems = [], twinkles = [];
  const avoid = [];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const camGuess = frame.tee.clone().addScaledVector(frame.view, -2.5);
  const addLantern = (p) => {
    const c = lantern(near, new THREE.Matrix4().makeTranslation(p.x, p.y - 0.03, p.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(p, camGuess))));
    glowItems.push({ p: [p.x + c.x, p.y - 0.03 + c.y, p.z + c.z], w: 0.6, a: 0.55, color: [1, 0.72, 0.35] });
    avoid.push({ x: p.x, z: p.z, r: 0.2 });
  };
  const addTreeGlows = (pts, w = 0.12) => {
    pts.forEach((p, k) => (k === 0 ? glowItems.push({ p: [p.x, p.y, p.z], w: w * 3, a: 0.6, color: [1, 0.9, 0.5] })
      : twinkles.push({ p: [p.x, p.y, p.z], w, a: 0.85, color: k % 2 ? [1, 0.6, 0.4] : [0.6, 0.9, 1], phase: r(), drift: 0 })));
  };

  // along the course, alternating sides: lanterns, with a small tree / presents / candy cane between
  {
    let acc = 0, total = 0, side = 1, n = 0;
    const spacing = hi ? 2.2 : 3.2;
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
      const off = kind === 1 ? 0.48 : 0.3;
      const x = path[i].x + rx * (w + off), z = path[i].z + rz * (w + off);
      side = -side;
      if (!clear(x, z, kind === 1 ? 0.3 : 0.22)) continue;
      const p = new THREE.Vector3(x, path[i].y, z);
      n++;
      if (kind === 0 || kind === 2) addLantern(p);
      else if (kind === 1) {
        const h = 0.55 + r() * 0.3;
        addTreeGlows(christmasTree(near, new THREE.Matrix4().makeTranslation(x, p.y - 0.03, z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)), h, { rnd: r }), 0.05);
        avoid.push({ x, z, r: h * 0.36 + 0.05 });
      } else {
        if (r() < 0.5) presentPile(near, new THREE.Matrix4().makeTranslation(x, p.y - 0.03, z).multiply(new THREE.Matrix4().makeRotationY(r() * 6)), 0.1, r, 3);
        else candyCane(near, new THREE.Matrix4().makeTranslation(x, p.y - 0.03, z).multiply(new THREE.Matrix4().makeRotationY(yawTo(p, camGuess) + Math.PI / 2)), 0.32, 0.016, 12);
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two lanterns flanking it, presents and a decorated tree behind (like the ref)
  const w0 = (widths[0] ?? 1.5) / 2;
  const teeLight = new THREE.PointLight(0xffb060, hi ? 1.5 : 1.1, 3.4, 1.6);
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.36)).addScaledVector(frame.fwd, 0.2);
      if (clear(pp.x, pp.z, 0.18)) addLantern(pp);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        presentPile(near, new THREE.Matrix4().makeTranslation(pk.x, pk.y - 0.03, pk.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(pk, camGuess) + s * 0.4)), 0.13, r, 4);
        avoid.push({ x: pk.x, z: pk.z, r: 0.28 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.35)) {
      addTreeGlows(christmasTree(near, new THREE.Matrix4().makeTranslation(tp.x, tp.y - 0.03, tp.z), 1.05, { rnd: r }), 0.07);
      avoid.push({ x: tp.x, z: tp.z, r: 0.45 });
    }
    teeLight.position.copy(frame.tee).addScaledVector(frame.fwd, -0.2).add(new THREE.Vector3(0, 0.5, 0));
    root.add(teeLight);
  }

  // a big snowman beside the course around 55% along, on the side with most room
  {
    let done = false;
    for (const k of [0.55, 0.4, 0.7, 0.3, 0.8]) {
      const i = Math.floor(path.length * k);
      if (floor && floor[i] === false) continue;
      const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      for (const side of [1, -1]) {
        const w = (widths[i] ?? 1.5) / 2;
        const x = path[i].x - t.z * side * (w + 0.55), z = path[i].z + t.x * side * (w + 0.55);
        if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
        const sp = new THREE.Vector3(x, path[i].y - 0.03, z);
        snowman(near, new THREE.Matrix4().makeTranslation(sp.x, sp.y, sp.z).multiply(new THREE.Matrix4().makeRotationY(yawTo(sp, camGuess))), 0.95);
        avoid.push({ x, z, r: 0.35 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // decorated trees, presents and candy canes scattered on the island top
  {
    let tries = hi ? 140 : 60, placed = 0;
    while (tries-- > 0 && placed < (hi ? 12 : 5)) {
      const f = course.frames[2 + Math.floor(r() * (course.frames.length - 4))];
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.18) * (0.6 + r() * 0.4);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.18)) continue;
      const Mx = new THREE.Matrix4().makeTranslation(x, f.p.y - 0.03, z).multiply(new THREE.Matrix4().makeRotationY(r() * 6.28));
      const kind = placed % 3;
      if (kind === 0) { const h = 0.7 + r() * 0.5; addTreeGlows(christmasTree(near, Mx, h, { rnd: r }), 0.06); avoid.push({ x, z, r: h * 0.36 }); }
      else if (kind === 1) { presentPile(near, Mx, 0.1 + r() * 0.05, r, 3 + (r() * 2 | 0)); avoid.push({ x, z, r: 0.25 }); }
      else { candyCane(near, Mx, 0.3 + r() * 0.15, 0.016, 12); avoid.push({ x, z, r: 0.15 }); }
      placed++;
    }
  }
  {
    const built = near.build(bucketMats, root, { castShadow: true, receiveShadow: false });
    // only the bulky props cast shadows (saves the shadow pass re-drawing bulbs, stars, trims)
    for (const k of ['bulbA', 'bulbB', 'star', 'win', 'metal', 'candy', 'ice']) if (built[k]) built[k].castShadow = false;
  }

  // ---------- foliage ----------
  avoid.push({ x: frame.tee.x, z: frame.tee.z, r: w0 + 0.5 }, ...fallSpots.map(s => ({ x: s.p.x, z: s.p.z, r: s.width + 0.3 })));
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid, voids, branches, I.vc)) root.add(o);

  // ---------- backdrop ----------
  const back = new Buckets();
  const backRocks = [], backIce = [];
  const palP = frame.atV(frame.wmax * 0.2 + 8, -5, frame.vmax + 70);
  const palM = new THREE.Matrix4().makeTranslation(palP.x, palP.y, palP.z).multiply(frame.viewBasis);
  const palGlows = buildPalace(back, palM, hi);
  {
    const g = roundRock(12, 22, 5, hi); g.applyMatrix4(palM); backRocks.push(g);
    const sp = []; spikes(sp, 0, -3, 0, 12, 22, hi ? 6 : 3, 55);
    for (const s of sp) { s.applyMatrix4(palM); backRocks.push(s); }
    // the palace's own frozen falls, spilling off the front of its crag
    for (const [sx, w] of [[-0.5, 1.8], [0.55, 1.3]]) {
      const dir = frame.view.clone().negate().addScaledVector(frame.viewRight, sx).normalize();
      fallSpots.push({ p: palP.clone().addScaledVector(dir, 10.4).add(new THREE.Vector3(0, -0.3, 0)), dir, width: w, length: 16 });
    }
  }
  const crags = [
    [frame.wmin - 15, -2, frame.vmax * 0.3 + 4, 3.6, 6, 'snowman'],
    [frame.wmax + 16, 1, frame.vmax + 10, 4, 7, 'village'],
    [frame.wmin - 12, -10, frame.vmin + 2, 2.6, 4.5, 'presents'],
    [frame.wmax + 13, -8, frame.vmin + 6, 2.6, 4, 'trees'],
    [frame.wmin - 32, 6, frame.vmax + 30, 5, 9, 'trees'],
    [frame.wmax + 40, 8, frame.vmax + 36, 5.5, 10, 'canes'],
    [-34, 16, frame.vmax + 110, 7, 12, 'trees'],
    [44, -1, frame.vmax + 82, 5, 8, 'village'],
    [-18, -8, frame.vmin - 30, 4, 6, 'trees'],
    [24, 2, frame.vmin - 40, 5, 8, 'presents'],
  ];
  const cragGlows = [];
  crags.slice(0, hi ? crags.length : 6).forEach(([lx, ly, lz, R, D, kind], k) => {
    cragGlows.push(...buildCrag(back, backRocks, backIce, frame.viewBasis, frame.atV(lx, ly, lz), R, D, kind, 300 + k * 17, hi));
  });
  back.build(bucketMats, root, { castShadow: false, receiveShadow: false });
  for (const g of backIce) ice.add('ice', g, COLORS.ice);

  // ---------- rock (course crag + backdrop crags in one mesh), ice in one mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'frost.rock';
    const ib = ice.build(bucketMats, root, { castShadow: false });
    if (ib.ice) ib.ice.name = 'frost.icicles';
  }

  // ---------- frozen falls ----------
  const falls = buildFrozenFalls(fallSpots, hi, M.uniforms);
  root.add(falls.mesh);

  // ---------- billboards ----------
  for (const p of palGlows) glowItems.push({ p, w: 4.5, a: 0.3, color: [1, 0.72, 0.4] });
  for (const p of cragGlows.filter((_, k) => k % 2 === 0)) glowItems.push({ p, w: 1.6, a: 0.35, color: [1, 0.85, 0.5] });
  const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
  glowMesh.name = 'frost.glows';
  root.add(glowMesh);

  // twinkling: tree lights + ice glints on the falls + slow glitter drifting around the course
  const spark = [...twinkles, ...falls.sparkItems];
  for (let i = 0; i < (hi ? 40 : 16); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = (r() < 0.5 ? -1 : 1) * (0.75 + r() * 0.5);
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.4)).add(new THREE.Vector3(0, 0.3 + r() * 1.6, 0));
    spark.push({ p, w: 0.03 + r() * 0.04, a: 0.9, color: r() < 0.6 ? [0.75, 0.9, 1] : [1, 0.85, 0.55], phase: r(), drift: 0.1 + r() * 0.15 });
  }
  const sparkMesh = makeBillboards(spark, { map: M.tex.glow, additive: true, mode: 'sparkle', fog, uniforms: M.uniforms });
  sparkMesh.name = 'frost.twinkles';
  root.add(sparkMesh);

  // moonlit cloud banks drifting below and around the islands
  const cloudTex = cloudAtlasTexture(hi ? 256 : 128);
  disposables.push(cloudTex);
  const clouds = [];
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  for (let i = 0; i < (hi ? 12 : 5); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = r() < 0.5 ? -1 : 1;
    const rr = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
    const p = f.p.clone().addScaledVector(rr, Math.max(f.el, f.er) + 1.5 + r() * 4).add(new THREE.Vector3(0, -f.d * (0.5 + r() * 0.6) - 1.5, 0));
    const w = 5 + r() * 6;
    clouds.push({ p, w, h: w * 0.5, uv: cell((r() * 4) | 0), color: [0.36, 0.42, 0.66], a: 0.6, phase: r(), drift: 0.6 + r() * 1.0 });
  }
  for (let i = 0; i < (hi ? 22 : 10); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.6 + 12 + r() * 70;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, rockMinY - 3 + r() * 9, Math.sin(a) * d));
    const w = 14 + r() * 22;
    clouds.push({ p, w, h: w * 0.45, uv: cell((r() * 4) | 0), color: [0.3, 0.36, 0.6], a: 0.7, phase: r(), drift: 3 + r() * 4 });
  }
  const eye = frame.tee.clone().addScaledVector(frame.view, -4).add(new THREE.Vector3(0, 4, 0));
  clouds.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const cloudMesh = makeBillboards(clouds, { map: cloudTex, mode: 'drift', fog, uniforms: M.uniforms, renderOrder: 2 });
  cloudMesh.name = 'frost.clouds';
  root.add(cloudMesh);

  // falling snow around the camera
  const snow = buildSnow(hi ? 700 : 280, hi ? 14 : 11, M.tex.flake, fog);
  root.add(snow.mesh);

  // ---------- Santa's sleigh ----------
  const flight = buildFlight(frame, bucketMats, M.tex.glow, fog, M.uniforms, hi);
  root.add(flight.group, flight.trail);

  // ---------- cup beacon: a soft gold beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'frost.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
      snow.update(t, info.camera);
      flight.update(t);
      teeLight.intensity = (hi ? 1.5 : 1.1) * (0.88 + 0.07 * Math.sin(t * 8.1) * Math.sin(t * 3.7 + 0.7) + 0.05 * Math.sin(t * 15.3));
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      falls.dispose?.();
      snow.dispose();
      teeLight.dispose();
      sky.dispose();
    },
  };
}

// Sky Isles theme — buildEnvironment: sky, island under the course, waterfalls, foliage, lanterns,
// backdrop set pieces, flyers, clouds and sparkles. Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, rng, distToPath, disposeTree, mat, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, buildWaterfalls, buildFoliage, roundRock, spikes } from './island.js';
import { buildCastle, buildSmallIsland, buildBridge, IRON } from './backdrop.js';
import { buildAirship, buildBalloons } from './flyers.js';
import { makeBillboards } from './billboards.js';
import { cloudAtlasTexture, fadeTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);

function courseFrame(info) {
  const path = info.path;
  const tee = info.tee || path[0], cup = info.cup || path[path.length - 1];
  // engine M2 info.viewDir = the camera's heading at the tee: backdrops go where the player looks
  // (tee→cup is sideways on hairpin holes like 7).
  const fwd = info.viewDir ? new THREE.Vector3(info.viewDir.x, 0, info.viewDir.z) : new THREE.Vector3(cup.x - tee.x, 0, cup.z - tee.z);
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
  return { tee, cup, fwd, right, center, fmin, fmax, rmin, rmax, size, minY: info.bounds.min.y, basis,
    /** local (right, up, forward) offsets → world */
    at(lx, ly, lz) { return center.clone().addScaledVector(right, lx).addScaledVector(UP, ly).addScaledVector(fwd, lz); } };
}

export function buildEnvironment(scene, info, M, quality) {
  const hi = quality !== 'low';
  const I = M.internal;
  const root = new THREE.Group(); root.name = 'sky.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const r = rng(7);
  const bucketMats = { vc: I.vc, gold: I.gold, glow: I.windowGlow, vcRock: I.vcRock, vcCloth: I.vcCloth, vcMetal: I.vcMetal, blue: I.blueGlow };

  // ---------- island under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const voids = info.voids || [], branches = info.branches || [];
  const course = buildCourseRock(path, widths, hi, floor, voids);
  const rockList = course.geometry ? [course.geometry] : [];
  // hanging spikes under the course
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

  // ---------- waterfalls ----------
  const fallSpots = [];
  {
    // candidates on both sides; prefer outward directions the play camera (behind the tee) can see
    const nF = course.frames.length, cands = [];
    const back = frame.fwd.clone().negate();
    for (let k = Math.floor(nF * 0.12); k < nF * 0.9; k += 2) {
      const f = course.frames[k];
      for (const side of [-1, 1]) {
        const dir = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
        const ext = side < 0 ? f.el : f.er;
        const p = f.p.clone().addScaledVector(dir, ext).add(new THREE.Vector3(0, -0.1, 0));
        const { d, i } = distToPath(path, p.x + dir.x * 0.8, p.z + dir.z * 0.8);
        if (d < (widths[i] ?? 1.5) / 2 + 0.5) continue;
        if (inVoid(voids, p.x + dir.x * 0.8, p.z + dir.z * 0.8, 0.3)) continue;
        cands.push({ p, dir, f, score: dir.dot(back) * 0.6 + Math.abs(dir.dot(frame.right)) * 0.5 + r() * 0.3 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (fallSpots.length >= (hi ? 3 : 2)) break;
      if (fallSpots.some(s => s.p.distanceTo(c.p) < 3.5)) continue;
      fallSpots.push({ p: c.p, dir: c.dir, width: 0.8 + r() * 0.4, length: c.f.d * 1.5 + 7 });
    }
  }

  // ---------- lanterns along the course ----------
  const lanterns = [];
  {
    let acc = 0, total = 0, side = 1;
    const spacing = hi ? 2.8 : 4;
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
      const x = path[i].x + rx * (w + 0.3), z = path[i].z + rz * (w + 0.3);
      const dd = distToPath(path, x, z);
      if (dd.d < (widths[dd.i] ?? 1.5) / 2 + 0.24) { side = -side; continue; }
      // engine M2: never in a void, never on / beside a branch track (the plank on hole 7)
      if (inVoid(voids, x, z, 0.15) || distToLines(branches, x, z) < 0.5) { side = -side; continue; }
      lanterns.push(new THREE.Vector3(x, path[i].y, z));
      side = -side;
    }
    // a pair flanking the tee
    const w0 = (widths[0] ?? 1.5) / 2;
    for (const s of [-1, 1]) lanterns.push(frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, 0.15));
  }
  const near = new Buckets();
  for (const p of lanterns) {
    const m = (x, y, z, s) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(mat(x, y, z, 0, 0, 0, s));
    near.add('vc', new THREE.BoxGeometry(0.13, 0.06, 0.13), 0xcfc2ae, m(0, 0.03, 0));
    near.add('vc', new THREE.CylinderGeometry(0.018, 0.024, 0.4, 6), IRON, m(0, 0.26, 0));
    near.add('gold', new THREE.BoxGeometry(0.1, 0.02, 0.1), null, m(0, 0.455, 0));
    near.add('glow', new THREE.BoxGeometry(0.075, 0.1, 0.075), null, m(0, 0.515, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) near.add('gold', new THREE.BoxGeometry(0.012, 0.11, 0.012), null, m(x * 0.042, 0.515, z * 0.042));
    near.add('gold', new THREE.ConeGeometry(0.075, 0.06, 4), null, m(0, 0.6, 0, [1, 1, 1]).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)));
    near.add('gold', new THREE.SphereGeometry(0.014, 6, 4), null, m(0, 0.64, 0));
  }
  near.build(bucketMats, root, { castShadow: true, receiveShadow: false });

  // ---------- course rock mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('vcRock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.vcRock.name = 'sky.courseRock';
  }

  // ---------- foliage ----------
  const avoid = [
    { x: frame.tee.x, z: frame.tee.z, r: (widths[0] ?? 1.5) / 2 + 0.55 },
    ...lanterns.map(p => ({ x: p.x, z: p.z, r: 0.22 })),
    ...fallSpots.map(s => ({ x: s.p.x, z: s.p.z, r: s.width + 0.2 })),
  ];
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid, voids, branches)) root.add(o);

  // ---------- backdrop: castle + islands + bridge ----------
  const back = new Buckets();
  const backRocks = [];
  const castleP = frame.at(frame.rmax * 0.2 + 6, 2, frame.fmax + 62);
  const castleM = new THREE.Matrix4().makeTranslation(castleP.x, castleP.y, castleP.z).multiply(frame.basis);
  buildCastle(back, castleM, hi);
  {
    const g = roundRock(13, 24, 5, hi); g.applyMatrix4(castleM); backRocks.push(g);
    const sp = []; spikes(sp, 0, -3, 0, 13, 24, hi ? 6 : 3, 55);
    for (const s of sp) { s.applyMatrix4(castleM); backRocks.push(s); }
    for (const [sx, w] of [[-0.45, 1.6], [0.5, 1.2]]) {
      const dir = frame.fwd.clone().negate().addScaledVector(frame.right, sx).normalize();
      fallSpots.push({ p: castleP.clone().addScaledVector(dir, 10.2).add(new THREE.Vector3(0, -0.4, 0)), dir, width: w, length: 34 });
    }
  }
  const isl = [
    [frame.rmin - 16, -4, frame.fmax * 0.3, 3.5, 6, 'temple'],
    [frame.rmax + 18, 0, frame.fmax + 10, 4, 7, 'arch'],
    [frame.rmin - 12, -11, frame.fmin + 2, 2.6, 4.5, 'trees'],
    [frame.rmax + 13, -9, frame.fmin + 6, 2.6, 4, 'trees'],
    [frame.rmin - 34, 6, frame.fmax + 30, 5, 9, 'ruins'],
    [frame.rmax + 40, 9, frame.fmax + 38, 5.5, 10, 'tower'],
    [-30, 18, frame.fmax + 110, 7, 12, 'tower'],
    [40, -2, frame.fmax + 85, 5, 8, 'trees'],
    [frame.rmin - 60, 12, frame.fmax + 60, 6, 9, 'trees'],
    [-16, -8, frame.fmin - 30, 4, 6, 'trees'],
    [22, 2, frame.fmin - 40, 5, 8, 'ruins'],
  ];
  const islandTops = [];
  isl.slice(0, hi ? isl.length : 6).forEach(([lx, ly, lz, R, D, kind], k) => {
    const p = frame.at(lx, ly, lz);
    islandTops.push({ p, R });
    buildSmallIsland(back, backRocks, frame.basis, p, R, D, kind, 300 + k * 17, hi);
  });
  if (hi) {
    // bridge from the arch island toward the castle island
    const a = islandTops[1].p.clone(), c = castleP.clone();
    const dir = c.clone().sub(a).setY(0).normalize();
    buildBridge(back, a.clone().addScaledVector(dir, islandTops[1].R * 0.7).setY(a.y + 0.05),
      c.clone().addScaledVector(dir, -10.5).setY(c.y + 1.25), hi);
  }
  for (const g of backRocks) back.addRaw('vcRock', g);
  back.build(bucketMats, root, { castShadow: false, receiveShadow: false });

  // ---------- waterfalls (course + castle) ----------
  const falls = buildWaterfalls(fallSpots, hi);
  root.add(falls.mesh);

  // ---------- flyers ----------
  const airship = buildAirship(bucketMats, hi);
  airship.scale.setScalar(0.9);
  root.add(airship);
  const shipR = frame.size * 0.5 + 34, shipY = frame.center.y + 11;
  const balloonPl = [];
  const nB = hi ? 6 : 3;
  for (let i = 0; i < nB; i++) {
    const left = i % 2 === 0;
    const lx = left ? frame.rmin - 8 - r() * 26 : frame.rmax + 8 + r() * 26;
    balloonPl.push({ p: frame.at(lx, 3 + r() * 14, frame.fmin + r() * (frame.fmax - frame.fmin + 45)), s: 2.2 + r() * 1.8 });
  }
  const balloons = buildBalloons(bucketMats, balloonPl, hi);
  root.add(balloons.group);

  // ---------- billboards: clouds ----------
  const cloudTex = cloudAtlasTexture(hi ? 512 : 256);
  const clouds = [];
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  const tint = (p) => {
    const d = new THREE.Vector3().subVectors(p, frame.center).setY(0).normalize();
    const az = d.dot(new THREE.Vector3(sky.sunDir.x, 0, sky.sunDir.z).normalize()) * 0.5 + 0.5;
    return [0.86 + az * 0.2, 0.86 + az * 0.08, 0.98 - az * 0.08];
  };
  const addCloud = (p, w) => clouds.push({ p, w, h: w * 0.62, uv: cell((r() * 4) | 0), color: tint(p), a: 0.95 });
  const ring = (n, dmin, dmax, ymin, ymax, wmin, wmax) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = dmin + r() * (dmax - dmin);
      const w = wmin + r() * (wmax - wmin);
      const y = Math.max(ymin + r() * (ymax - ymin), sky.seaY + w * 0.36 + 0.5); // never cut by the opaque cloud sea
      addCloud(frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d)), w);
    }
  };
  const cy = frame.center.y;
  ring(hi ? 30 : 14, frame.size * 0.6 + 14, 150, sky.seaY + 2, rockMinY - 1, 16, 42);     // below, around
  ring(hi ? 14 : 7, 70, 190, cy - 8, cy + 14, 30, 64);                                       // framing, far
  for (let i = 0; i < (hi ? 10 : 4); i++) {                                                  // wisps under the island
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const p = f.p.clone().add(new THREE.Vector3((r() - 0.5) * 8, -f.d * (0.6 + r() * 0.8) - 2, (r() - 0.5) * 8));
    addCloud(p, 7 + r() * 9);
  }
  // castle base clouds
  for (let i = 0; i < (hi ? 6 : 3); i++) {
    const w = 18 + r() * 16;
    const p = castleP.clone().add(new THREE.Vector3((r() - 0.5) * 30, -16 - r() * 10, (r() - 0.5) * 30));
    p.y = Math.max(p.y, sky.seaY + w * 0.36 + 0.5);
    addCloud(p, w);
  }
  const eye = frame.tee.clone().addScaledVector(frame.fwd, -4).add(new THREE.Vector3(0, 4, 0));
  clouds.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const cloudMesh = makeBillboards(clouds, { map: cloudTex, fog, uniforms: M.uniforms, renderOrder: 0 });
  cloudMesh.name = 'sky.clouds';
  root.add(cloudMesh);

  // ---------- billboards: glows, sparkles, mist ----------
  const glowItems = [];
  for (const p of lanterns) glowItems.push({ p: [p.x, p.y + 0.515, p.z], w: 0.55, a: 0.55, color: [1, 0.72, 0.35] });
  // castle halos
  for (const [x, y, z, w] of [[0, 3, 5.6, 7], [0, 7.2, 3, 8], [-5.2, 7, 3.6, 4], [5.2, 7, 3.6, 4], [0, 14, 0.5, 6]]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(castleM);
    glowItems.push({ p, w, a: 0.35, color: [1, 0.7, 0.4] });
  }
  const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
  glowMesh.name = 'sky.glows';
  root.add(glowMesh);

  const spark = [];
  for (let i = 0; i < (hi ? 80 : 30); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const side = r() * 2 - 1;
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.6)).add(new THREE.Vector3(0, 0.25 + r() * 1.8, 0));
    const gold = r() < 0.6;
    spark.push({ p, w: 0.05 + r() * 0.07, a: 0.9, color: gold ? [1, 0.82, 0.45] : [0.5, 0.85, 1], phase: r(), drift: 0.12 + r() * 0.2 });
  }
  // bigger slow motes in the distance
  for (let i = 0; i < (hi ? 24 : 8); i++) {
    const p = frame.at((r() - 0.5) * 60, -4 + r() * 18, frame.fmin + r() * (frame.fmax - frame.fmin + 40));
    spark.push({ p, w: 0.25 + r() * 0.3, a: 0.6, color: [1, 0.85, 0.6], phase: r(), drift: 0.8 });
  }
  const sparkMesh = makeBillboards(spark, { map: M.tex.glow, additive: true, mode: 'sparkle', fog, uniforms: M.uniforms });
  sparkMesh.name = 'sky.sparkles';
  root.add(sparkMesh);

  const mistMesh = makeBillboards(falls.mistItems, { map: M.tex.glow, mode: 'mist', fog, uniforms: M.uniforms, renderOrder: 2 });
  mistMesh.name = 'sky.mist';
  root.add(mistMesh);

  // beacon beam over the cup so it reads from far away (the flag skin is only pole + cloth)
  const beamFade = fadeTexture(64);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4.5, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.25, 0)); beam.renderOrder = 5; beam.name = 'sky.cupBeam';
  root.add(beam);

  scene.add(root);

  const tan = new THREE.Vector3();
  let shipA = 2.35;
  function placeShip(t) {
    shipA = 2.35 - t * 0.008;
    const c = Math.cos(shipA), s = Math.sin(shipA);
    airship.position.copy(frame.center).addScaledVector(frame.right, c * shipR).addScaledVector(frame.fwd, s * shipR);
    airship.position.y = shipY + Math.sin(t * 0.3) * 0.4;
    tan.copy(frame.right).multiplyScalar(s).addScaledVector(frame.fwd, -c); // d/dθ of position, moving with -θ
    airship.rotation.set(0, Math.atan2(-tan.z, tan.x), Math.sin(t * 0.25) * 0.02);
    airship.userData.prop.rotation.x = t * 6;
  }
  placeShip(0);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
      falls.update(t);
      placeShip(t);
      balloons.update(t);
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      cloudTex.dispose();
      sky.dispose();
    },
  };
}


// Star Station theme — buildEnvironment: deep space (star field, nebula, a big ringed planet and a moon,
// all in one dome shader), the station platform under the course (deck plates, a white hull with glowing
// edge strips, an asteroid underneath), beacon pylons / light posts / cargo / dishes along the course, the
// main orbital station and a solar array farm in the distance (along info.viewDir), small floating
// platforms, an instanced field of slowly drifting asteroids and blinking beacon lights.
// Draw-call budget: dome 1, rock 1, near props ≤ 4, backdrop ≤ 4, asteroids 1, glows 1, beacons 1, cup beam 1.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, ALIAS_HI, ALIAS_LO, rng, distToPath, disposeTree, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, spikes, buildAsteroids, asteroidGeometry } from './island.js';
import { buildStation, buildArrayFarm, buildIsle } from './backdrop.js';
import { beaconPylon, lightPost, crate, canisters, dish, antenna, solarPanel, bollard, terminal } from './props.js';
import { makeBillboards } from './billboards.js';
import { fadeTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const TEAL = [0.35, 1, 0.95], RED = [1, 0.32, 0.28], AMBER = [1, 0.72, 0.3], WHITE = [0.85, 0.95, 1];

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
  const root = new THREE.Group(); root.name = 'star.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(53);
  const bucketMats = { vc: I.vc, panel: I.vcPanel, gloss: I.vcGloss, metal: I.vcMetal, glow: I.glow, win: I.windowGlow, rock: I.vcRock };
  const disposables = [];
  const glowItems = [], blinkItems = [];
  const glow = (p, w, color = TEAL, a = 0.5) => glowItems.push({ p, w, a, color });
  const blink = (p, w, color = RED, phase = r(), per = 1) => blinkItems.push({ p, w, a: 1, color, phase, drift: per });

  // ---------- the station platform under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const course = buildCourseRock(path, widths, hi, floor, voids);
  const rockList = course.geometry ? [course.geometry] : [];
  for (let i = 0; i < (hi ? 6 : 3) && course.frames.length; i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const sp = [];
    spikes(sp, f.p.x, f.p.y - 1.2, f.p.z, (f.el + f.er) * 0.8, f.d, 1, 100 + i);
    rockList.push(...sp);
  }
  if (course.geometry) { course.geometry.computeBoundingBox(); frame.minY = Math.min(info.bounds.min.y, course.geometry.boundingBox.min.y); }

  // ---------- space, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality);
  const fog = scene.fog;

  const clear = (x, z, pad) => {
    const { d, i } = distToPath(path, x, z);
    return d >= (widths[i] ?? 1.5) / 2 + pad && !inVoid(voids, x, z, 0.12) && distToLines(branches, x, z) >= 0.5;
  };

  // ---------- near props ----------
  const alias = hi ? ALIAS_HI : ALIAS_LO;
  const near = new Buckets(alias);
  const avoid = [];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const camGuess = frame.tee.clone().addScaledVector(frame.view, -2.5);
  const Mat = (p, yaw = 0) => new THREE.Matrix4().makeTranslation(p.x, p.y - 0.03, p.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const Wp = (Mx, v) => v.clone().applyMatrix4(Mx);
  let pyN = 0;
  const addPylon = (p, h = 0.5) => {
    const Mx = Mat(p, r() * 6);
    blink(Wp(Mx, beaconPylon(near, Mx, h, !hi)), h * 0.9, pyN++ % 3 === 2 ? AMBER : TEAL, r(), 1);
    avoid.push({ x: p.x, z: p.z, r: 0.14 });
  };
  const addLight = (p, h = 0.7) => {
    const Mx = Mat(p, yawTo(p, frame.cup));
    glow(Wp(Mx, lightPost(near, Mx, h)), 0.5, WHITE, 0.45);
    avoid.push({ x: p.x, z: p.z, r: 0.14 });
  };

  // along the course, alternating sides: pylons and light posts, cargo / bollards / terminals between
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
      const off = kind === 3 ? 0.36 : 0.28;
      const x = path[i].x + rx * (w + off), z = path[i].z + rz * (w + off);
      side = -side;
      if (!clear(x, z, kind === 3 ? 0.24 : 0.2)) continue;
      const p = new THREE.Vector3(x, path[i].y, z);
      n++;
      if (kind === 0) addPylon(p, 0.42 + r() * 0.12);
      else if (kind === 2) addLight(p, 0.62 + r() * 0.1);
      else if (kind === 1) { glow(Wp(Mat(p), bollard(near, Mat(p), 0.18)), 0.16, AMBER, 0.5); avoid.push({ x, z, r: 0.1 }); }
      else {
        const q = r();
        if (q < 0.4) crate(near, Mat(p, yawTo(p, camGuess) + (r() - 0.5) * 0.6), 0.26, n % 2);
        else if (q < 0.7) canisters(near, Mat(p, r() * 6), 0.28, 3, !hi);
        else { const Mx = Mat(p, yawTo(p, camGuess)); glow(Wp(Mx, terminal(near, Mx, 0.28)), 0.22, [0.4, 0.9, 1], 0.4); }
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two beacon pylons flanking it, cargo behind, an antenna mast beside
  const w0 = (widths[0] ?? 1.5) / 2;
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.3)).addScaledVector(frame.fwd, 0.15);
      if (clear(pp.x, pp.z, 0.16)) addPylon(pp, 0.55);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        if (s < 0) crate(near, Mat(pk, yawTo(pk, camGuess)), 0.32, 0);
        else canisters(near, Mat(pk, r() * 6), 0.32, 3, !hi);
        avoid.push({ x: pk.x, z: pk.z, r: 0.26 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.3)) { const Mx = Mat(tp); blink(Wp(Mx, antenna(near, Mx, 1.1)), 0.5, RED, 0.3, 1.4); avoid.push({ x: tp.x, z: tp.z, r: 0.2 }); }
  }

  // an antenna dish with solar panels beside the course around 55% along
  {
    let done = false;
    for (const k of [0.55, 0.4, 0.7, 0.3, 0.8]) {
      const i = Math.floor(path.length * k);
      if (floor && floor[i] === false) continue;
      const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
      const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      for (const side of [1, -1]) {
        const w = (widths[i] ?? 1.5) / 2;
        const x = path[i].x - t.z * side * (w + 0.62), z = path[i].z + t.x * side * (w + 0.62);
        if (!clear(x, z, 0.45) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
        const p = new THREE.Vector3(x, path[i].y, z);
        const Mx = Mat(p, yawTo(p, camGuess) + Math.PI);
        glow(Wp(Mx, dish(near, Mx, 0.7, !hi)), 0.18, RED, 0.8);
        const sp = p.clone().addScaledVector(t, 0.55);
        if (clear(sp.x, sp.z, 0.3)) solarPanel(near, Mat(sp, yawTo(sp, camGuess)), 0.5, 0.34, 3);
        const tp = p.clone().addScaledVector(t, -0.5);
        if (clear(tp.x, tp.z, 0.25)) { const Tm = Mat(tp, yawTo(tp, camGuess)); glow(Wp(Tm, terminal(near, Tm, 0.3)), 0.22, [0.4, 0.9, 1], 0.4); }
        avoid.push({ x, z, r: 0.5 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // scattered on the deck: bollards, canisters, crates, solar panels
  {
    let tries = hi ? 120 : 50, placed = 0;
    while (tries-- > 0 && placed < (hi ? 8 : 4)) {
      const f = course.frames[2 + Math.floor(r() * Math.max(1, course.frames.length - 4))];
      if (!f) break;
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.2) * (0.6 + r() * 0.4);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.18)) continue;
      if (Math.hypot(x - frame.tee.x, z - frame.tee.z) < 2.6) continue;   // keep the camera's view from the tee clear
      const p = new THREE.Vector3(x, f.p.y, z);
      const kind = placed % 4;
      if (kind === 0) { glow(Wp(Mat(p), bollard(near, Mat(p), 0.2)), 0.16, AMBER, 0.5); avoid.push({ x, z, r: 0.1 }); }
      else if (kind === 1) { canisters(near, Mat(p, r() * 6), 0.26, 2, !hi); avoid.push({ x, z, r: 0.16 }); }
      else if (kind === 2) { crate(near, Mat(p, r() * 6), 0.24 + r() * 0.08, placed % 2); avoid.push({ x, z, r: 0.2 }); }
      else { solarPanel(near, Mat(p, yawTo(p, camGuess)), 0.44, 0.3, 2); avoid.push({ x, z, r: 0.2 }); }
      placed++;
    }
  }
  near.build(bucketMats, root, { castShadow: true, receiveShadow: false });

  // ---------- backdrop ----------
  const back = new Buckets(alias);
  const backRocks = [];
  // the main station: ahead along viewDir, right of centre, a little above the course
  {
    const sp = frame.atV(frame.wmax * 0.3 + 30, 9, frame.vmax + 88);
    const sM = new THREE.Matrix4().makeTranslation(sp.x, sp.y, sp.z).multiply(frame.viewBasis)
      .multiply(new THREE.Matrix4().makeRotationY(0.6)).multiply(new THREE.Matrix4().makeRotationZ(0.18)).multiply(new THREE.Matrix4().makeRotationX(0.12));
    const st = buildStation(back, sM, hi);
    glowItems.push(...st.glows); for (const b of st.blinks) blinkItems.push({ ...b, a: 1, drift: 1.3 });
  }
  // the solar array farm: ahead-left, lower
  {
    const ap = frame.atV(frame.wmin * 0.4 - 34, -3, frame.vmax + 70);
    const aM = new THREE.Matrix4().makeTranslation(ap.x, ap.y, ap.z).multiply(frame.viewBasis).multiply(new THREE.Matrix4().makeRotationY(-0.5));
    const af = buildArrayFarm(back, aM, hi);
    glowItems.push(...af.glows); for (const b of af.blinks) blinkItems.push({ ...b, a: 1, drift: 1.1 });
  }
  const isles = [
    [frame.wmin - 12, -3, frame.vmax * 0.3 + 4, 2.2, 3.2, 'beacons'],
    [frame.wmax + 13, -2, frame.vmax + 6, 2.6, 3.6, 'dish'],
    [frame.wmin - 16, -7, frame.vmin + 6, 1.8, 2.6, 'crates'],
    [frame.wmax + 16, -6, frame.vmin + 9, 1.8, 2.6, 'solar'],
    [frame.wmin - 28, 3, frame.vmax + 22, 3.6, 5, 'tower'],
    [frame.wmax + 30, 2, frame.vmax + 16, 3.4, 5, 'crates'],
    [34, -8, frame.vmax + 34, 3.2, 4.5, 'dish'],
    [-16, -9, frame.vmin - 20, 3, 4, 'beacons'],
  ];
  isles.slice(0, hi ? 7 : 5).forEach(([lx, ly, lz, R, D, kind], k) => {
    const lp = frame.atV(lx, ly, lz);
    const res = buildIsle(back, backRocks, frame.viewBasis, lp, R, D, kind, 300 + k * 17, hi);
    glowItems.push(...res.glows); for (const b of res.blinks) blinkItems.push({ ...b, a: 1, drift: 1 });
  });
  // a few big lone asteroids far out (static, in the rock mesh)
  for (let i = 0; i < (hi ? 4 : 2); i++) {
    const a = (i / 4) * Math.PI * 2 + r(), d = frame.size * 0.5 + 45 + r() * 40;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, -10 + r() * 22, Math.sin(a) * d));
    const geometry = asteroidGeometry(4 + r() * 5, 500 + i);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r() * 6, r() * 6, r()))));
    backRocks.push(geometry);
  }
  for (const m of Object.values(back.build(bucketMats, root, { castShadow: false, receiveShadow: false }))) m.name = 'back.' + m.name;

  // ---------- rock (course hull + spikes + platforms) in one mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'star.rock';
  }

  // ---------- drifting asteroids (one instanced mesh, animated in the vertex shader) ----------
  {
    const pts = [];
    const nA = hi ? 36 : 18;
    for (let i = 0; i < nA; i++) {
      const a = r() * Math.PI * 2, d = frame.size * 0.5 + 10 + r() * 45;
      const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, -9 + r() * 16, Math.sin(a) * d));
      // keep them off the camera's sight line from behind the tee
      if (p.distanceTo(camGuess) < 6) continue;
      pts.push({ x: p.x, y: p.y, z: p.z, s: d > 32 ? 0.4 + r() * r() * 2.2 : 0.15 + r() * r() * 0.5 });
    }
    root.add(buildAsteroids(pts, I.asteroid, hi));
  }

  // ---------- billboards: soft glows and blinking beacons ----------
  if (glowItems.length) {
    const gm = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'static', fog, uniforms: M.uniforms });
    gm.name = 'star.glows';
    root.add(gm);
  }
  if (blinkItems.length) {
    const bm = makeBillboards(blinkItems, { map: M.tex.flare, additive: true, mode: 'blink', fog, uniforms: M.uniforms });
    bm.name = 'star.beacons';
    root.add(bm);
  }

  // ---------- cup beacon: a soft teal beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x60fff0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'star.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      sky.dispose();
    },
  };
}

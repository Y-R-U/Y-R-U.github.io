// Volcano Forge theme — buildEnvironment: a smoky orange-red sky over a lava sea, a basalt island under the
// course with molten seams and lava pouring off it, braziers / brass lanterns / basalt columns / obsidian
// crystals / anvils along the course, an erupting volcano and a dwarven forge in the distance (along
// info.viewDir), small basalt islands, smoke banks, rising embers and falling ash.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, rng, distToPath, disposeTree, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, buildLavaFalls, buildFoliage, roundIsland, spikes } from './island.js';
import { volcanoGeometry, buildForge, buildIsle } from './backdrop.js';
import { brazier, lanternPost, anvil, crystals, columns, emberVent, hammer, ingots } from './props.js';
import { buildEmbers } from './embers.js';
import { makeBillboards } from './billboards.js';
import { smokeAtlasTexture, fadeTexture } from './textures.js';

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
  const root = new THREE.Group(); root.name = 'volcano.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(31);
  const bucketMats = {
    vc: I.vc, stone: I.vcStone, gloss: I.vcGloss, metal: I.vcMetal, ember: I.ember, win: I.windowGlow,
    cloth: I.vcCloth, rock: I.vcRock, lava: I.lava,
  };
  const disposables = [];
  const glowItems = [], smokeItems = [], sparkItems = [];
  const glow = (p, w, color = [1, 0.55, 0.18], a = 0.5) => glowItems.push({ p, w, a, color });

  // ---------- the basalt island under the course ----------
  const floor = Array.isArray(info.floor) && info.floor.length === path.length ? info.floor : null;
  const course = buildCourseRock(path, widths, hi, floor, voids);
  const rockList = course.geometry ? [course.geometry] : [];
  for (let i = 0; i < (hi ? 8 : 3) && course.frames.length; i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    const sp = [];
    spikes(sp, f.p.x, f.p.y - 1.5, f.p.z, (f.el + f.er) * 0.8, f.d, 1, 100 + i);
    rockList.push(...sp);
  }
  let rockMinY = info.bounds.min.y - 4;
  if (course.geometry) { course.geometry.computeBoundingBox(); rockMinY = Math.min(info.bounds.min.y, course.geometry.boundingBox.min.y); }
  frame.minY = rockMinY;

  // ---------- sky, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality);
  const fog = scene.fog;

  const clear = (x, z, pad) => {
    const { d, i } = distToPath(path, x, z);
    return d >= (widths[i] ?? 1.5) / 2 + pad && !inVoid(voids, x, z, 0.12) && distToLines(branches, x, z) >= 0.5;
  };

  // ---------- lava pouring over the island edge (on the sides the camera sees) ----------
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
        cands.push({ p, dir, f, ext, score: dir.dot(back) * 0.4 + Math.abs(dir.dot(frame.viewRight)) * 0.7 + r() * 0.3 });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      if (fallSpots.length >= (hi ? 2 : 1)) break;
      if (fallSpots.some(s => s.p.distanceTo(c.p) < 4)) continue;
      fallSpots.push({ p: c.p, dir: c.dir, width: 0.4 + r() * 0.25, length: c.f.d + 5, f: c.f, ext: c.ext });
    }
  }

  // ---------- near props ----------
  const near = new Buckets();
  const avoid = [];
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const camGuess = frame.tee.clone().addScaledVector(frame.view, -2.5);
  const Mat = (p, yaw = 0) => new THREE.Matrix4().makeTranslation(p.x, p.y - 0.03, p.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const W = (Mx, v) => v.clone().applyMatrix4(Mx);
  const addBrazier = (p, h = 0.42) => {
    const Mx = Mat(p, r() * 6);
    const f = brazier(near, Mx, h, !hi);
    const fp = W(Mx, f);
    glow(fp, h * 1.5, [1, 0.5, 0.15], 0.55);
    sparkItems.push({ p: fp, w: 0.035, a: 1, color: [1, 0.6, 0.2], phase: r(), drift: 0.9 });
    avoid.push({ x: p.x, z: p.z, r: 0.2 });
  };
  const addLantern = (p, h = 0.62) => {
    const Mx = Mat(p, yawTo(p, camGuess) + Math.PI / 2);
    const g = lanternPost(near, Mx, h, !hi);
    glow(W(Mx, g), h * 0.6, [1, 0.72, 0.35], 0.6);
    avoid.push({ x: p.x, z: p.z, r: 0.16 });
  };

  // along the course, alternating sides: braziers and lanterns, with basalt columns / crystals / anvils between
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
      const off = kind === 1 ? 0.4 : 0.3;
      const x = path[i].x + rx * (w + off), z = path[i].z + rz * (w + off);
      side = -side;
      if (!clear(x, z, kind === 1 ? 0.26 : 0.22)) continue;
      const p = new THREE.Vector3(x, path[i].y, z);
      n++;
      if (kind === 0) addBrazier(p, 0.4 + r() * 0.08);
      else if (kind === 2) addLantern(p, 0.6 + r() * 0.1);
      else if (kind === 1) { columns(near, Mat(p, r() * 6), 0.3 + r() * 0.15, r, hi ? 5 : 3); avoid.push({ x, z, r: 0.2 }); }
      else {
        if (r() < 0.5) crystals(near, Mat(p, r() * 6), 0.2 + r() * 0.1, r, hi ? 4 : 3);
        else anvil(near, Mat(p, yawTo(p, camGuess) + Math.PI / 2), 0.26, true);
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two braziers flanking it, ingots and crystals behind, a lantern post beside
  const w0 = (widths[0] ?? 1.5) / 2;
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.34)).addScaledVector(frame.fwd, 0.2);
      if (clear(pp.x, pp.z, 0.18)) addBrazier(pp, 0.5);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        if (s < 0) ingots(near, Mat(pk, yawTo(pk, camGuess)), 0.4);
        else crystals(near, Mat(pk, r() * 6), 0.24, r, hi ? 4 : 3);
        avoid.push({ x: pk.x, z: pk.z, r: 0.26 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.3)) addLantern(tp, 0.85);
  }

  // a giant anvil on its block and a hammer beside the course around 55% along, on the side with most room
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
        anvil(near, Mat(p, yawTo(p, camGuess) + Math.PI / 2), 0.62, true);
        const hp = p.clone().addScaledVector(t, 0.42);
        if (clear(hp.x, hp.z, 0.3)) hammer(near, Mat(hp, yawTo(hp, camGuess)), 0.55);
        avoid.push({ x, z, r: 0.45 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // scattered on the crust: basalt columns, crystals, ember vents, lava pools
  const lavaPools = new Buckets();
  {
    let tries = hi ? 140 : 60, placed = 0;
    while (tries-- > 0 && placed < (hi ? 10 : 4)) {
      const f = course.frames[2 + Math.floor(r() * Math.max(1, course.frames.length - 4))];
      if (!f) break;
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.2) * (0.6 + r() * 0.4);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.4) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.18)) continue;
      const p = new THREE.Vector3(x, f.p.y, z);
      const kind = placed % 4;
      if (kind === 0) { columns(near, Mat(p, r() * 6), 0.45 + r() * 0.3, r, hi ? 5 : 3); avoid.push({ x, z, r: 0.25 }); }
      else if (kind === 1) { crystals(near, Mat(p, r() * 6), 0.3 + r() * 0.15, r, hi ? 4 : 3); avoid.push({ x, z, r: 0.2 }); }
      else if (kind === 2) {
        const Mx = Mat(p, 0); const v = emberVent(near, Mx, 0.36);
        const vp = W(Mx, v);
        glow(vp, 0.4, [1, 0.45, 0.12], 0.6);
        smokeItems.push({ p: vp, w: 0.5, a: 0.5, color: [0.3, 0.26, 0.24], phase: r(), drift: 1.6, uvk: (r() * 4) | 0 });
        avoid.push({ x, z, r: 0.2 });
      } else {
        const rr = 0.18 + r() * 0.16;
        const g = new THREE.CircleGeometry(rr, 14); g.rotateX(-Math.PI / 2);
        lavaPools.add('lava', g, null, mat4(p.x, f.p.y - 0.02, p.z, r() * 6, [1, 1, 0.6 + r() * 0.5]), true);
        const rim = new THREE.TorusGeometry(rr, 0.03, 3, 14); rim.rotateX(Math.PI / 2);
        lavaPools.add('stone', rim, 0x2a2624, mat4(p.x, f.p.y - 0.02, p.z, 0, [1, 1, 1]));
        glow(new THREE.Vector3(p.x, f.p.y + 0.06, p.z), rr * 3, [1, 0.45, 0.12], 0.4);
        avoid.push({ x, z, r: rr + 0.12 });
      }
      placed++;
    }
  }
  {
    const built = near.build(bucketMats, root, { castShadow: true, receiveShadow: false });
    for (const k of ['ember', 'win']) if (built[k]) built[k].castShadow = false;
    const lp = lavaPools.build(bucketMats, root, { receiveShadow: true });
    if (lp.lava) lp.lava.name = 'volcano.lavaPools';
  }

  // ---------- foliage: basalt columns, obsidian crystals, charred trees ----------
  avoid.push({ x: frame.tee.x, z: frame.tee.z, r: w0 + 0.5 }, ...fallSpots.map(s => ({ x: s.p.x, z: s.p.z, r: s.width + 0.3 })));
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid, voids, branches, { stone: I.stoneInst, crystal: I.crystalInst })) root.add(o);

  // lava fall sources: a glowing notch in the lip
  for (const s of fallSpots) {
    glow(s.p.clone().addScaledVector(s.dir, 0.3).add(new THREE.Vector3(0, -0.3, 0)), 1.2, [1, 0.45, 0.12], 0.5);
    glow(s.p.clone().addScaledVector(s.dir, 1.0).add(new THREE.Vector3(0, -s.length * 0.5, 0)), 2.6, [1, 0.4, 0.1], 0.25);
  }

  // ---------- backdrop ----------
  const back = new Buckets();
  const backRocks = [];
  const lavaFar = [];
  // the volcano: far ahead along viewDir, a little right, rising out of the lava sea
  {
    // peak ~5° above the horizon from the tee camera (portrait's top edge is ~8°), plume above it
    const dist = frame.vmax + 230;
    const vp = frame.atV(frame.wmax * 0.3 + 22, 0, dist);
    vp.y = sky.seaY - 4;
    const peakY = frame.tee.y + 3 + Math.tan(5 * Math.PI / 180) * (dist + 4);
    const H = Math.max(30, peakY - vp.y), RB = H * 0.72;
    const vM = new THREE.Matrix4().makeTranslation(vp.x, vp.y, vp.z).multiply(frame.viewBasis);
    const v = volcanoGeometry(H, RB, hi, 5);
    v.rock.applyMatrix4(vM); backRocks.push(v.rock);
    v.lava.applyMatrix4(vM); lavaFar.push(v.lava);
    const cp = v.crater.clone().applyMatrix4(vM);
    glow(cp.clone().add(new THREE.Vector3(0, 2, 0)), v.RC * 4.5, [1, 0.42, 0.1], 0.55);
    glow(cp.clone().add(new THREE.Vector3(0, 6, 0)), v.RC * 9, [1, 0.32, 0.08], 0.22);
    for (const s of v.streams) glow(s.clone().applyMatrix4(vM), 9, [1, 0.38, 0.1], 0.2);
    // eruption plume: dark smoke columns rising and spreading, embers thrown up
    const nP = hi ? 22 : 12;
    for (let i = 0; i < nP; i++) {
      smokeItems.push({ p: cp.clone().add(new THREE.Vector3((r() - 0.5) * 5, 1 + r() * 3, (r() - 0.5) * 5)), w: 18 + r() * 14,
        a: 0.92, color: [0.16 + r() * 0.05, 0.1, 0.085], phase: i / nP, drift: 40 + r() * 16, uvk: (r() * 4) | 0 });
    }
    for (let i = 0; i < (hi ? 30 : 14); i++) {
      sparkItems.push({ p: cp.clone().add(new THREE.Vector3((r() - 0.5) * 6, 4 + r() * 18, (r() - 0.5) * 6)), w: 0.7 + r() * 0.6,
        a: 1, color: [1, 0.5 + r() * 0.3, 0.15], phase: r(), drift: 4 + r() * 4 });
    }
  }
  // the forge: on its own island along the view, left of centre
  {
    const fp = frame.atV(frame.wmin * 0.4 - 16, -4, frame.vmax + 62);
    const fM = new THREE.Matrix4().makeTranslation(fp.x, fp.y, fp.z).multiply(frame.viewBasis)
      .multiply(new THREE.Matrix4().makeRotationY(0.45));
    const forge = buildForge(back, fM, hi);
    const { geometry } = roundIsland(12.5, 20, 7, hi); geometry.applyMatrix4(fM); backRocks.push(geometry);
    const sp = []; spikes(sp, 0, -1.5 * Math.max(1, 12.5 * 0.22), 0, 12.5, 20, hi ? 6 : 3, 55);
    for (const s of sp) { s.applyMatrix4(fM); backRocks.push(s); }
    for (const g of forge.glows) glowItems.push(g);
    for (const s of forge.smoke) for (let i = 0; i < (hi ? 7 : 4); i++) {
      smokeItems.push({ p: s.clone(), w: 3 + r() * 2, a: 0.75, color: [0.22, 0.17, 0.15], phase: i / (hi ? 7 : 4), drift: 16 + r() * 6, uvk: (r() * 4) | 0 });
    }
    lavaFar.push(forge.lavaStrip);
    const pourP = forge.pourP.clone();
    fallSpots.push({ p: pourP.add(new THREE.Vector3(0, -0.1, 0)), dir: forge.pourDir, width: 1.4, length: 24 });
  }
  const isles = [
    [frame.wmin - 14, -2, frame.vmax * 0.3 + 4, 3.4, 6, 'crystals'],
    [frame.wmax + 15, 1, frame.vmax + 10, 3.8, 7, 'braziers'],
    [frame.wmin - 11, -10, frame.vmin + 2, 2.6, 4.5, 'columns'],
    [frame.wmax + 12, -8, frame.vmin + 6, 2.6, 4, 'vent'],
    [frame.wmin - 34, 5, frame.vmax + 28, 4.6, 9, 'anvil'],
    [frame.wmax + 38, 6, frame.vmax + 40, 5, 10, 'trees'],
    [44, -1, frame.vmax + 80, 5, 8, 'columns'],
    [-18, -8, frame.vmin - 30, 4, 6, 'crystals'],
    [24, 2, frame.vmin - 40, 5, 8, 'braziers'],
  ];
  isles.slice(0, hi ? isles.length : 6).forEach(([lx, ly, lz, R, D, kind], k) => {
    for (const g of buildIsle(back, backRocks, frame.viewBasis, frame.atV(lx, ly, lz), R, D, kind, 300 + k * 17, hi)) glowItems.push(g);
  });
  for (const m of Object.values(back.build(bucketMats, root, { castShadow: false, receiveShadow: false }))) m.name = 'back.' + m.name;

  // ---------- rock (course + backdrop islands + volcano) in one mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'volcano.rock';
    const lb = new Buckets();
    for (const g of lavaFar) lb.addRaw('lava', g);
    const lv = lb.build({ lava: I.lavaFar }, root, {});
    if (lv.lava) lv.lava.name = 'back.lava';
  }

  // ---------- lava falls ----------
  const falls = buildLavaFalls(fallSpots, hi);
  root.add(falls.mesh);

  // ---------- billboards ----------
  if (glowItems.length) {
    const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'flicker', fog, uniforms: M.uniforms });
    glowMesh.name = 'volcano.glows';
    root.add(glowMesh);
  }
  // sparks rising off braziers and the crater
  for (let i = 0; i < (hi ? 30 : 12); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    if (!f) break;
    const side = (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5);
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.4)).add(new THREE.Vector3(0, -0.4 - r() * 1.2, 0));
    sparkItems.push({ p, w: 0.05 + r() * 0.04, a: 1, color: [1, 0.5 + r() * 0.3, 0.15], phase: r(), drift: 1.5 + r() * 1.5 });
  }
  if (sparkItems.length) {
    const sparkMesh = makeBillboards(sparkItems, { map: M.tex.spark, additive: true, mode: 'rise', fog, uniforms: M.uniforms });
    sparkMesh.name = 'volcano.sparks';
    root.add(sparkMesh);
  }

  // smoke: plume, chimneys, vents (rising), plus banks of smoke drifting below and around the islands
  const smokeTex = smokeAtlasTexture(hi ? 256 : 128);
  disposables.push(smokeTex);
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  const eye = frame.tee.clone().addScaledVector(frame.view, -4).add(new THREE.Vector3(0, 4, 0));
  if (smokeItems.length) {
    for (const s of smokeItems) s.uv = cell(s.uvk || 0);
    smokeItems.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
    const sm = makeBillboards(smokeItems, { map: smokeTex, mode: 'smoke', fog, uniforms: M.uniforms, renderOrder: 2 });
    sm.name = 'volcano.smoke';
    root.add(sm);
  }
  const banks = [];
  const BANK = [[0.32, 0.18, 0.14], [0.26, 0.15, 0.13], [0.4, 0.2, 0.14]];
  for (let i = 0; i < (hi ? 10 : 5); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    if (!f) break;
    const side = r() < 0.5 ? -1 : 1;
    const rr = new THREE.Vector3(-f.t.z * side, 0, f.t.x * side);
    const p = f.p.clone().addScaledVector(rr, Math.max(f.el, f.er) + 1.5 + r() * 4).add(new THREE.Vector3(0, -f.d * (0.5 + r() * 0.6) - 2.5, 0));
    const w = 5 + r() * 6;
    banks.push({ p, w, h: w * 0.5, uv: cell((r() * 4) | 0), color: BANK[i % 3], a: 0.7, phase: r(), drift: 0.6 + r() * 1.0 });
  }
  for (let i = 0; i < (hi ? 18 : 8); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.6 + 14 + r() * 70;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, rockMinY - 4 + r() * 10, Math.sin(a) * d));
    const w = 16 + r() * 22;
    banks.push({ p, w, h: w * 0.4, uv: cell((r() * 4) | 0), color: BANK[i % 3], a: 0.75, phase: r(), drift: 3 + r() * 4 });
  }
  banks.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const bankMesh = makeBillboards(banks, { map: smokeTex, mode: 'drift', fog, uniforms: M.uniforms, renderOrder: 2 });
  bankMesh.name = 'volcano.smokeBanks';
  root.add(bankMesh);

  // rising embers and falling ash around the camera
  const parts = buildEmbers(hi ? 150 : 60, hi ? 130 : 50, hi ? 12 : 10, fog);
  root.add(parts.group);

  // ---------- cup beacon: a soft orange beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff9040, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'volcano.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
      parts.update(t, info.camera);
      falls.update(t);
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      falls.dispose?.();
      parts.dispose();
      sky.dispose();
    },
  };
}

function mat4(x, y, z, yaw, s) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(...s));
}

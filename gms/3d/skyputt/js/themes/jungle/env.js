// Jungle Temple theme — buildEnvironment: a misty rainforest sky (haze, sun, cloud wisps, ridge
// silhouettes, a canopy sea below — one dome shader), the stone temple terrace under the course (mossy
// paving, carved blocks with gold inlay, stepped setbacks, earth and roots), stelae / torches / braziers /
// ferns / idols along the course, rope rails where the course crosses a void, a stepped pyramid and a
// waterfall gorge in the distance (along info.viewDir), giant trees, small ruin terraces, swaying
// lianas, fireflies, drifting pollen, parrots and toucans, mist.
// Draw-call budget: dome 1, rock 1, near props ≤ 5, backdrop ≤ 4, lianas 1, waterfall 1, glows 1,
// flames 1, fireflies 1, pollen 1 (high), birds 1, mist 1, cup beam 1.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, ALIAS_HI, ALIAS_LO, rng, distToPath, disposeTree, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, spikes } from './island.js';
import { buildPyramid, buildGorge, bigTree, buildRuin } from './backdrop.js';
import { stele, torch, brazier, idol, brokenColumn, urns, boulder, fern, broadLeaf, banana, bush, COLORS as K } from './props.js';
import { makeBillboards } from './billboards.js';
import { fadeTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const FLAME = [1, 0.62, 0.22], GOLD = [1, 0.8, 0.4], FIREFLY = [0.75, 1, 0.35], POLLEN = [1, 0.95, 0.7];

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

/** Instanced lianas: crossed alpha ribbons hanging from their anchor (top at y = 0, uv.y = 1 at the top). */
function buildLianas(list, material, hi) {
  const segs = hi ? 6 : 4;
  const a = new THREE.PlaneGeometry(0.14, 1, 1, segs); a.translate(0, -0.5, 0);
  const b2 = a.clone(); b2.rotateY(Math.PI / 2);
  const pos = [], uv = [], idx = [];
  for (const g of [a, b2]) {
    const o = pos.length / 3;
    pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + o);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, material, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const r = rng(77);
  list.forEach((l, i) => {
    q.setFromEuler(e.set(0, r() * Math.PI, 0));
    const w = 0.8 + Math.min(2.5, l.len * 0.12);
    m.compose(new THREE.Vector3(l.p.x, l.p.y, l.p.z), q, new THREE.Vector3(w, l.len, w));
    im.setMatrixAt(i, m);
  });
  im.count = list.length;
  im.frustumCulled = false;
  im.name = 'jungle.lianas';
  return im;
}

export function buildEnvironment(scene, info, M, quality) {
  const hi = quality !== 'low';
  const I = M.internal;
  const root = new THREE.Group(); root.name = 'jungle.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(61);
  const bucketMats = { vc: I.vc, stone: I.vcStone, gold: I.vcGold, glow: I.glow, leaf: I.leaf, rock: I.vcRock };
  const disposables = [];
  const glowItems = [], flameItems = [], lianas = [], mists = [], falls = [];
  const glow = (p, w, color = GOLD, a = 0.4) => glowItems.push({ p, w, a, color });
  const flame = (p, w = 0.3) => { flameItems.push({ p, w, h: w * 1.3, a: 0.9, color: FLAME }); glow(p, w * 2.4, FLAME, 0.18); };
  const take = (o) => { glowItems.push(...o.glows); for (const f of o.flames) flame(f, 1.2); lianas.push(...o.lianas); mists.push(...o.mists); falls.push(...o.falls); };

  // ---------- the temple terrace under the course ----------
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

  // ---------- sky, lights, fog ----------
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
  const addTorch = (p, h = 0.6) => { const Mx = Mat(p); flame(Wp(Mx, torch(near, Mx, h)), 0.12); avoid.push({ x: p.x, z: p.z, r: 0.1 }); };
  const addBrazier = (p, h = 0.34) => { const Mx = Mat(p, r() * 6); flame(Wp(Mx, brazier(near, Mx, h, !hi)), 0.18); avoid.push({ x: p.x, z: p.z, r: 0.14 }); };
  const addPlant = (p, k) => {
    const Mx = Mat(p, r() * 6);
    if (k === 0) fern(near, Mx, 0.26 + r() * 0.1, !hi);
    else if (k === 1) broadLeaf(near, Mx, 0.32 + r() * 0.1, !hi);
    else if (k === 2) bush(near, Mx, 0.3 + r() * 0.1, !hi);
    else banana(near, Mx, 0.6 + r() * 0.25, !hi);
    avoid.push({ x: p.x, z: p.z, r: 0.18 });
  };

  // along the course, alternating sides: stelae, torches, plants, then urns / boulders / columns
  {
    let acc = 0, total = 0, side = 1, n = 0;
    const spacing = hi ? 1.7 : 2.6;
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
      const kind = n % 5;
      const off = kind === 2 ? 0.34 : 0.27;
      const x = path[i].x + rx * (w + off), z = path[i].z + rz * (w + off);
      side = -side;
      if (!clear(x, z, kind === 2 ? 0.22 : 0.18)) continue;
      const p = new THREE.Vector3(x, path[i].y, z);
      n++;
      if (kind === 0) { stele(near, Mat(p, yawTo(p, camGuess)), 0.42 + r() * 0.16); avoid.push({ x, z, r: 0.14 }); }
      else if (kind === 1) addTorch(p, 0.5 + r() * 0.12);
      else if (kind === 2) addPlant(p, n % 4);
      else if (kind === 3) addPlant(p, (n + 1) % 4);
      else {
        const q = r();
        if (q < 0.35) urns(near, Mat(p, r() * 6), 0.22, 2, !hi);
        else if (q < 0.7) boulder(near, Mat(p, r() * 6), 0.12 + r() * 0.06);
        else brokenColumn(near, Mat(p, r() * 6), 0.4, !hi);
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two torches flanking it, urns and a fern behind, a stele beside
  const w0 = (widths[0] ?? 1.5) / 2;
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.28)).addScaledVector(frame.fwd, 0.15);
      if (clear(pp.x, pp.z, 0.14)) addTorch(pp, 0.62);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        if (s < 0) urns(near, Mat(pk, r() * 6), 0.26, 2, !hi); else fern(near, Mat(pk, r() * 6), 0.34, !hi);
        avoid.push({ x: pk.x, z: pk.z, r: 0.26 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.3)) { stele(near, Mat(tp, yawTo(tp, camGuess)), 0.8); avoid.push({ x: tp.x, z: tp.z, r: 0.2 }); }
  }

  // an idol shrine beside the course around 55% along: the idol, a brazier either side
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
        const p = new THREE.Vector3(x, path[i].y, z);
        const Mx = Mat(p, yawTo(p, path[i]));
        glow(Wp(Mx, idol(near, Mx, 0.42)), 0.14, [0.5, 1, 0.7], 0.6);
        for (const e of [-1, 1]) { const bp = p.clone().addScaledVector(t, e * 0.42); if (clear(bp.x, bp.z, 0.25)) addBrazier(bp); }
        avoid.push({ x, z, r: 0.5 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // scattered on the terrace: ferns, bushes, boulders, urns, broad leaves
  {
    let tries = hi ? 140 : 60, placed = 0;
    while (tries-- > 0 && placed < (hi ? 12 : 6)) {
      const f = course.frames[2 + Math.floor(r() * Math.max(1, course.frames.length - 4))];
      if (!f) break;
      const side = r() < 0.5 ? -1 : 1;
      const ext = side < 0 ? f.el : f.er;
      const lat = (ext - 0.15) * (0.6 + r() * 0.4);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      if (!clear(x, z, 0.35) || avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.16)) continue;
      if (Math.hypot(x - frame.tee.x, z - frame.tee.z) < 2.4) continue;   // keep the camera's view from the tee clear
      const p = new THREE.Vector3(x, f.p.y, z);
      const kind = placed % 4;
      if (kind === 3) { boulder(near, Mat(p, r() * 6), 0.1 + r() * 0.08); avoid.push({ x, z, r: 0.14 }); }
      else addPlant(p, (placed + 2) % 4);
      placed++;
    }
  }

  // rope rails where the course or a branch crosses a void (the rope-and-plank bridges)
  {
    const rails = (pts, off) => {
      if (pts.length < 2) return;
      const tan = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); };
      for (const s of [-1, 1]) {
        const top = [], low = [];
        const len = pts.reduce((a, p, i) => a + (i ? p.distanceTo(pts[i - 1]) : 0), 0);
        let acc = 0;
        pts.forEach((p, i) => {
          if (i) acc += p.distanceTo(pts[i - 1]);
          const t = tan(i), o = typeof off === 'number' ? off : off[i];
          const sag = Math.sin(Math.PI * acc / Math.max(len, 0.01)) * Math.min(0.08, len * 0.02);
          const q = p.clone().add(new THREE.Vector3(-t.z * s * o, 0, t.x * s * o));
          top.push(q.clone().add(new THREE.Vector3(0, 0.2 - sag, 0)));
          low.push(q.clone().add(new THREE.Vector3(0, 0.08 - sag * 0.5, 0)));
        });
        for (const line of [top, low]) {
          const cv = new THREE.CatmullRomCurve3(line);
          near.add('vc', new THREE.TubeGeometry(cv, Math.max(4, Math.round(len * 5)), 0.008, 3, false), 0xc8a870, null);
        }
        for (const k of [0, pts.length - 1]) {
          const t = tan(k), o = typeof off === 'number' ? off : off[k];
          const q = pts[k].clone().add(new THREE.Vector3(-t.z * s * o, 0, t.x * s * o));
          near.add('vc', new THREE.CylinderGeometry(0.018, 0.022, 0.3, 5), K.wood, new THREE.Matrix4().makeTranslation(q.x, q.y + 0.12, q.z));
        }
      }
    };
    // path runs inside a void
    let run = [], offs = [];
    const flush = () => { if (run.length >= 3) rails(run, offs); run = []; offs = []; };
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if ((!floor || floor[i] !== false) && inVoid(voids, p.x, p.z, 0)) { run.push(p.clone()); offs.push((widths[i] ?? 0.5) / 2 + 0.03); }
      else flush();
    }
    flush();
    for (const L of branches) {
      const pts = L.map(q => new THREE.Vector3(q[0], q[1], q[2]));
      if (pts.length >= 2 && pts.filter(p => inVoid(voids, p.x, p.z, 0)).length >= Math.max(1, pts.length / 3)) rails(pts, 0.24);
    }
  }
  near.build(bucketMats, root, { castShadow: true, receiveShadow: false });

  // lianas over the terrace edges (they hang down the stepped sides)
  {
    const nE = hi ? 26 : 12;
    const fr = course.frames;
    for (let k = 0; k < nE * 3 && lianas.length < nE && fr.length; k++) {
      const f = fr[Math.floor(r() * fr.length)];
      const side = r() < 0.5 ? -1 : 1, ext = (side < 0 ? f.el : f.er) * 1.05;
      const x = f.p.x - f.t.z * side * ext, z = f.p.z + f.t.x * side * ext;
      if (inVoid(voids, x, z, 0.15) || distToLines(branches, x, z) < 0.5) continue;
      const { d, i } = distToPath(path, x, z);
      if (d < (widths[i] ?? 1.5) / 2 + 0.3) continue;
      lianas.push({ p: new THREE.Vector3(x, f.p.y - 0.04, z), len: 0.5 + r() * 1.2 });
    }
  }

  // ---------- backdrop ----------
  const back = new Buckets(hi ? { gold: 'stone' } : { stone: 'vc', gold: 'vc', leaf: 'leaf' });
  const backRocks = [];
  // the stepped pyramid: ahead along viewDir, left of centre, rising out of the canopy
  {
    const pp = frame.atV(frame.wmin * 0.4 - 32, -16, frame.vmax + 72);
    const pM = new THREE.Matrix4().makeTranslation(pp.x, pp.y, pp.z).multiply(frame.viewBasis).multiply(new THREE.Matrix4().makeRotationY(-0.35));
    take(buildPyramid(back, pM, hi));
  }
  // the waterfall gorge: ahead-right
  {
    const gp = frame.atV(frame.wmax * 0.3 + 30, 0, frame.vmax + 58);
    const gM = new THREE.Matrix4().makeTranslation(gp.x, gp.y, gp.z).multiply(frame.viewBasis).multiply(new THREE.Matrix4().makeRotationY(-0.4));
    take(buildGorge(back, backRocks, gM, hi));
  }
  // giant trees framing the view (bases far below in the canopy)
  const trees = [
    [frame.wmin - 22, -26, frame.vmax + 20, 44], [frame.wmax + 24, -26, frame.vmax + 26, 42],
    [frame.wmin - 17, -24, frame.vmax * 0.5 + 6, 40], [frame.wmax + 19, -24, frame.vmax * 0.6 + 4, 38],
    [frame.wmin - 18, -22, frame.vmin + 2, 34], [frame.wmax + 19, -22, frame.vmin + 5, 36],
    [frame.wmin - 30, -24, frame.vmax + 44, 46],
  ];
  trees.slice(0, hi ? 7 : 4).forEach(([lx, ly, lz, H], k) => {
    const tp = frame.atV(lx, ly, lz);
    const t = bigTree(back, new THREE.Matrix4().makeTranslation(tp.x, tp.y, tp.z).multiply(new THREE.Matrix4().makeRotationY(k * 1.3)), H, hi, 400 + k);
    if (k >= 4) t.lianas.length = 0;   // the trees beside the tee: no lianas across the camera's view
    take(t);
  });
  const ruins = [
    [frame.wmin - 11, -3, frame.vmax * 0.3 + 4, 2.2, 3.2, 'stelae'],
    [frame.wmax + 12, -2, frame.vmax + 6, 2.6, 3.6, 'shrine'],
    [frame.wmin - 15, -6, frame.vmin + 7, 1.8, 2.6, 'garden'],
    [frame.wmax + 15, -5, frame.vmin + 9, 1.8, 2.6, 'columns'],
    [frame.wmin - 26, 2, frame.vmax + 20, 3.4, 5, 'idol'],
    [frame.wmax + 28, 1, frame.vmax + 14, 3.2, 4.5, 'garden'],
  ];
  ruins.slice(0, hi ? 6 : 4).forEach(([lx, ly, lz, R, D, kind], k) => {
    take(buildRuin(back, backRocks, frame.viewBasis, frame.atV(lx, ly, lz), R, D, kind, 300 + k * 17, hi));
  });
  for (const m of Object.values(back.build(bucketMats, root, { castShadow: false, receiveShadow: false }))) m.name = 'back.' + m.name;

  // ---------- rock (course terrace + roots + ruins + cliffs) in one mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'jungle.rock';
  }

  // ---------- waterfall ----------
  if (falls.length) {
    const b = new Buckets();
    for (const g of falls) b.addRaw('fall', g);
    const built = b.build({ fall: I.waterfall }, root, {});
    built.fall.renderOrder = 2; built.fall.name = 'jungle.waterfall';
  }

  // ---------- lianas (one instanced mesh, swaying in the vertex shader) ----------
  if (lianas.length) root.add(buildLianas(lianas, I.liana, hi));

  // ---------- billboards ----------
  const B = (items, opts, name) => { if (!items.length) return; const m = makeBillboards(items, { fog, uniforms: M.uniforms, ...opts }); m.name = name; root.add(m); };
  B(glowItems, { map: M.tex.glow, additive: true, mode: 'static' }, 'jungle.glows');
  B(flameItems, { map: M.tex.glow, additive: true, mode: 'flicker' }, 'jungle.flames');
  // fireflies round the course edges, low over the terrace
  {
    const items = [];
    const n = hi ? 34 : 16;
    for (let i = 0; i < n * 3 && items.length < n && course.frames.length; i++) {
      const f = course.frames[Math.floor(r() * course.frames.length)];
      const side = r() < 0.5 ? -1 : 1, lat = (side < 0 ? f.el : f.er) * (0.7 + r() * 0.6);
      const x = f.p.x - f.t.z * side * lat, z = f.p.z + f.t.x * side * lat;
      items.push({ p: [x, f.p.y + 0.2 + r() * 1.0, z], w: 0.07, a: 0.9, color: FIREFLY, drift: 0.25 + r() * 0.3 });
    }
    B(items, { map: M.tex.glow, additive: true, mode: 'sparkle' }, 'jungle.fireflies');
  }
  // drifting pollen in the light (high only)
  if (hi) {
    const items = [];
    for (let i = 0; i < 60; i++) {
      const p = frame.center.clone().add(new THREE.Vector3((r() - 0.5) * (frame.size + 6), -0.5 + r() * 4, (r() - 0.5) * (frame.size + 6)));
      items.push({ p, w: 0.025 + r() * 0.025, a: 0.55, color: POLLEN, drift: 0.6 + r() * 1.2 });
    }
    B(items, { map: M.tex.glow, additive: true, mode: 'drift' }, 'jungle.pollen');
  }
  // parrots and toucans circling over the canopy
  {
    const items = [];
    const n = hi ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const p = frame.atV((r() - 0.5) * 50, 6 + r() * 10, frame.vmax + 12 + r() * 40);
      const row = i % 2;
      items.push({ p, w: 1.8 + r() * 0.8, uv: row ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], a: 1, phase: r(), drift: 5 + r() * 8 });
    }
    B(items, { map: M.tex.bird, additive: false, mode: 'bat' }, 'jungle.birds');
  }
  // mist: spray at the foot of the fall, low puffs drifting under the terrace
  {
    const items = mists.map((p, i) => ({ p, w: 7 + (i % 3) * 2, a: 0.35, color: [1, 1, 0.97], drift: 4 }));
    const nM = hi ? 10 : 5;
    for (let i = 0; i < nM; i++) {
      const a = r() * Math.PI * 2, d = frame.size * 0.4 + 2 + r() * 6;
      items.push({ p: frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, frame.minY - 1 + r() * 2, Math.sin(a) * d)), w: 6 + r() * 5, a: 0.3, color: [0.95, 0.97, 0.9], drift: 1.5 });
    }
    B(items, { map: M.tex.mist, additive: false, mode: 'smoke' }, 'jungle.mist');
  }

  // ---------- cup beacon: a soft gold beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'jungle.cupBeam';
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

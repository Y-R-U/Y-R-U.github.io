// Sunken Reef theme — buildEnvironment: a blue-green water dome with god-rays from the surface, a sandy
// seabed far below, a reef pinnacle under the course (sea-grass top, coral-crusted rock, spires down to
// the sand), ship lanterns / glowing anemones / broken temple columns / amphorae / clams along the course,
// a sunken ship and a ruined temple in the distance (along info.viewDir), small reef outcrops, kelp,
// schools of fish, bubble streams, drifting plankton and silt.
// Returns { update(dt, t), dispose() }.
import * as THREE from 'three';
import { Buckets, ALIAS_HI, ALIAS_LO, rng, distToPath, disposeTree, inVoid, distToLines } from './util.js';
import { buildSky } from './sky.js';
import { buildCourseRock, buildFoliage, roundIsland, spikes, spires } from './island.js';
import { buildShip, buildTemple, buildIsle } from './backdrop.js';
import { anemone, clam, amphora, brokenColumn, fallenDrum, lanternPost, barrel, chest, brainCoral, tubeSponges, starfish, COLORS } from './props.js';
import { buildParticles } from './particles.js';
import { buildFish } from './fish.js';
import { buildRays } from './rays.js';
import { makeBillboards } from './billboards.js';
import { cloudAtlasTexture, fadeTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const GLOW_PINK = [1, 0.5, 0.8], GLOW_CYAN = [0.45, 1, 0.9], GLOW_AMBER = [1, 0.8, 0.45];

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
  const root = new THREE.Group(); root.name = 'reef.environment';
  const frame = courseFrame(info);
  const path = info.path, widths = info.widths && info.widths.length ? info.widths : path.map(() => 1.5);
  const voids = info.voids || [], branches = info.branches || [];
  const r = rng(37);
  const bucketMats = {
    vc: I.vc, stone: I.vcStone, gloss: I.vcGloss, metal: I.vcMetal, glow: I.glow, win: I.windowGlow,
    cloth: I.vcCloth, rock: I.vcRock, wood: I.vcWood, coral: I.vc,
  };
  const disposables = [];
  const glowItems = [], bubbleItems = [];
  const glow = (p, w, color = GLOW_CYAN, a = 0.5) => glowItems.push({ p, w, a, color });
  const bubbles = (p, n, h, w = 0.05) => { for (let i = 0; i < n; i++) bubbleItems.push({ p: p.clone(), w: w * (0.6 + r() * 0.8), a: 0.9, color: [0.85, 1, 1], phase: r(), drift: h * (0.7 + r() * 0.6) }); };

  // ---------- the reef rock under the course ----------
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

  // ---------- water, seabed, lights, fog ----------
  const sky = buildSky(scene, info, frame, quality, M.tex.caustic);
  const fog = scene.fog;
  const bedY = sky.seaY;

  // spires from the seabed up under the reef: it stands on the sand instead of floating
  {
    const pts = [];
    const nF = course.frames.length;
    for (let k = 2; k < nF - 2; k += Math.max(3, Math.floor(nF / (hi ? 9 : 5)))) {
      const f = course.frames[k];
      pts.push({ x: f.p.x + (r() - 0.5) * 0.6, z: f.p.z + (r() - 0.5) * 0.6, y: f.p.y - f.d * 0.75, w: Math.max(0.8, (f.el + f.er) * 0.42) });
    }
    spires(rockList, pts, bedY - 0.5, 77);
  }

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
  const W = (Mx, v) => v.clone().applyMatrix4(Mx);
  let anN = 0;
  const addAnemone = (p, s = 0.3) => {
    const Mx = Mat(p, r() * 6);
    const k = anN++;
    const g = anemone(near, Mx, s, k, !hi);
    glow(W(Mx, g), s * 2.2, k % 3 === 1 ? GLOW_CYAN : k % 3 === 2 ? GLOW_AMBER : GLOW_PINK, 0.45);
    avoid.push({ x: p.x, z: p.z, r: 0.18 });
  };
  const addLantern = (p, h = 0.62) => {
    const Mx = Mat(p, yawTo(p, camGuess) + Math.PI / 2);
    const g = lanternPost(near, Mx, h, !hi);
    glow(W(Mx, g), h * 0.6, GLOW_CYAN, 0.6);
    avoid.push({ x: p.x, z: p.z, r: 0.16 });
  };

  // along the course, alternating sides: lanterns and anemones, with columns / amphorae / clams between
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
      if (kind === 0) addAnemone(p, 0.26 + r() * 0.08);
      else if (kind === 2) addLantern(p, 0.6 + r() * 0.1);
      else if (kind === 1) { brokenColumn(near, Mat(p, r() * 6), 0.42 + r() * 0.22, r, !hi); avoid.push({ x, z, r: 0.2 }); }
      else {
        const q = r();
        if (q < 0.35) amphora(near, Mat(p, r() * 6), 0.24, r() < 0.5, !hi);
        else if (q < 0.7) { const Mx = Mat(p, yawTo(p, camGuess)); const pp = clam(near, Mx, 0.26, !hi); glow(W(Mx, pp), 0.18, [0.9, 0.95, 1], 0.5); }
        else brainCoral(near, Mat(p, r() * 6), 0.13, [0xd8a070, 0xe08a9a, 0xb0a0d0][n % 3], !hi);
        avoid.push({ x, z, r: 0.2 });
      }
    }
  }

  // the tee: two anemones flanking it, an amphora and a clam behind, a lantern post beside
  const w0 = (widths[0] ?? 1.5) / 2;
  {
    for (const s of [-1, 1]) {
      const pp = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.34)).addScaledVector(frame.fwd, 0.2);
      if (clear(pp.x, pp.z, 0.18)) addAnemone(pp, 0.32);
      const pk = frame.tee.clone().addScaledVector(frame.right, s * (w0 + 0.42)).addScaledVector(frame.fwd, -0.35);
      if (clear(pk.x, pk.z, 0.2)) {
        if (s < 0) amphora(near, Mat(pk, r() * 6), 0.3, false, !hi);
        else { const Mx = Mat(pk, yawTo(pk, camGuess)); const pp = clam(near, Mx, 0.3, !hi); glow(W(Mx, pp), 0.2, [0.9, 0.95, 1], 0.5); }
        avoid.push({ x: pk.x, z: pk.z, r: 0.26 });
      }
    }
    const tp = frame.tee.clone().addScaledVector(frame.right, w0 + 0.75).addScaledVector(frame.fwd, 0.6);
    if (clear(tp.x, tp.z, 0.3)) addLantern(tp, 0.85);
  }

  // a fallen temple column and a treasure chest beside the course around 55% along
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
        const p = new THREE.Vector3(x, path[i].y, z);
        brokenColumn(near, Mat(p, r() * 6), 0.9, r, !hi);
        const hp = p.clone().addScaledVector(t, 0.5);
        if (clear(hp.x, hp.z, 0.3)) {
          const Mx = Mat(hp, yawTo(hp, camGuess));
          const cg = chest(near, Mx, 0.24);
          glow(W(Mx, cg), 0.3, GLOW_AMBER, 0.5);
        }
        const bp = p.clone().addScaledVector(t, -0.5);
        if (clear(bp.x, bp.z, 0.3)) fallenDrum(near, Mat(bp, yawTo(bp, camGuess) + 1.2), 0.36, !hi);
        avoid.push({ x, z, r: 0.5 });
        done = true; break;
      }
      if (done) break;
    }
  }

  // scattered on the reef top: brain corals, tube sponges, starfish, barrels, bubble vents
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
      const kind = placed % 5;
      if (kind === 0) { brainCoral(near, Mat(p, r() * 6), 0.15 + r() * 0.08, [0xd8a070, 0xe08a9a, 0x9ab070][placed % 3], !hi); avoid.push({ x, z, r: 0.22 }); }
      else if (kind === 1) { tubeSponges(near, Mat(p, r() * 6), 0.3 + r() * 0.15, r, hi ? 4 : 3, [0xb070c0, 0xe0a050, 0xff7a9a][placed % 3]); avoid.push({ x, z, r: 0.2 }); }
      else if (kind === 2) { starfish(near, Mat(p, r() * 6), 0.08, r() < 0.5 ? COLORS.star : COLORS.star2); avoid.push({ x, z, r: 0.12 }); }
      else if (kind === 3) { barrel(near, Mat(p, r() * 6), 0.26, r() < 0.6, !hi); avoid.push({ x, z, r: 0.2 }); }
      else { bubbles(p.clone().add(new THREE.Vector3(0, 0.02, 0)), hi ? 6 : 3, 3.5, 0.04); glow(p.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.2, GLOW_CYAN, 0.35); avoid.push({ x, z, r: 0.15 }); }
      placed++;
    }
  }
  {
    const built = near.build(bucketMats, root, { castShadow: true, receiveShadow: false });
    for (const k of ['glow', 'win']) if (built[k]) built[k].castShadow = false;
  }

  // ---------- backdrop ----------
  const back = new Buckets({ ...alias, gloss: 'vc' });   // 30-60 m away: gloss reads as vc
  const backRocks = [];
  const kelpPts = [];
  // the sunken ship: ahead along viewDir, right of centre, listing on the seabed
  {
    const sp = frame.atV(frame.wmax * 0.3 + 16, 0, frame.vmax + 34);
    sp.y = bedY - 0.8;
    const sM = new THREE.Matrix4().makeTranslation(sp.x, sp.y, sp.z).multiply(frame.viewBasis)
      .multiply(new THREE.Matrix4().makeRotationY(2.3)).multiply(new THREE.Matrix4().makeRotationX(0.22)).multiply(new THREE.Matrix4().makeRotationZ(-0.06));
    const ship = buildShip(back, sM, hi);
    for (const g of ship.glows) glowItems.push(g);
    for (const b of ship.bubbles) bubbles(b, hi ? 8 : 4, 16, 0.22);
  }
  // the ruined temple: ahead, left of centre, on a low rise of the seabed
  {
    const tp = frame.atV(frame.wmin * 0.4 - 20, 0, frame.vmax + 52);
    tp.y = bedY + 0.2;
    const tM = new THREE.Matrix4().makeTranslation(tp.x, tp.y, tp.z).multiply(frame.viewBasis).multiply(new THREE.Matrix4().makeRotationY(0.5));
    const temple = buildTemple(back, tM, hi);
    for (const g of temple.glows) glowItems.push(g);
    for (const b of temple.bubbles) bubbles(b, hi ? 6 : 3, 18, 0.25);
    const { geometry } = roundIsland(13, 4, 7, hi);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(tp.x, tp.y - 0.1, tp.z).multiply(frame.viewBasis));
    backRocks.push(geometry);
  }
  const isles = [
    // the four nearest sit well out to the sides and low: landscape's wide view sees them beside the tee
    [frame.wmin - 22, -6, frame.vmax * 0.3 + 6, 2.6, 4.5, 'anemones'],
    [frame.wmax + 28, -6, frame.vmax + 12, 2.6, 4.5, 'kelp'],
    [frame.wmin - 24, -12, frame.vmin + 8, 2.0, 3.5, 'clams'],
    [frame.wmax + 24, -11, frame.vmin + 12, 2.0, 3.5, 'corals'],
    [frame.wmin - 36, 0, frame.vmax + 30, 3.4, 6.5, 'columns'],
    [frame.wmax + 40, 1, frame.vmax + 18, 3.8, 7.5, 'amphorae'],
    [40, -1, frame.vmax + 70, 4.6, 8, 'kelp'],
    [-16, -5, frame.vmin - 26, 3.6, 6, 'anemones'],
    [22, 0, frame.vmin - 34, 4.6, 8, 'corals'],
  ];
  // the 9th outcrop sits behind the camera (only the fly-over saw it): high draws 8, low 6
  isles.slice(0, hi ? 8 : 6).forEach(([lx, ly, lz, R, D, kind], k) => {
    const lp = frame.atV(lx, ly, lz);
    for (const g of buildIsle(back, backRocks, frame.viewBasis, lp, R, D, kind, 300 + k * 17, hi, kelpPts)) glowItems.push(g);
    // a spire down to the seabed under each outcrop
    spires(backRocks, [{ x: lp.x, z: lp.z, y: lp.y - D * 0.45, w: R * 0.95 }], bedY - 0.5, 400 + k);
    for (let j = 0; j < (hi ? 3 : 2); j++) {
      const a = r() * 6.28;
      kelpPts.push({ x: lp.x + Math.cos(a) * R * 1.4, y: bedY, z: lp.z + Math.sin(a) * R * 1.4, h: Math.max(3, lp.y - bedY - 0.5) * (0.6 + r() * 0.4) });
    }
  });
  for (const m of Object.values(back.build(bucketMats, root, { castShadow: false, receiveShadow: false }))) m.name = 'back.' + m.name;
  // far kelp forest on the seabed round the backdrop (joins the reef's kelp: one instanced mesh, swaying)
  for (let i = 0; i < (hi ? 20 : 14); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.5 + 8 + r() * 40;
    kelpPts.push({ x: frame.center.x + Math.cos(a) * d, y: bedY, z: frame.center.z + Math.sin(a) * d, h: 4 + r() * 6 });
  }
  for (const k of kelpPts) k.rot = r() * 6.28;

  // ---------- foliage: branch corals, sea fans, sponges, kelp ----------
  avoid.push({ x: frame.tee.x, z: frame.tee.z, r: w0 + 0.5 });
  for (const o of buildFoliage(course.frames, path, widths, hi, avoid, voids, branches, { coral: I.coralInst, kelp: I.kelp }, bedY, kelpPts)) root.add(o);

  // ---------- rock (course + spires + outcrops) in one mesh ----------
  {
    const b = new Buckets();
    for (const g of rockList) b.addRaw('rock', g);
    for (const g of backRocks) b.addRaw('rock', g);
    const built = b.build(bucketMats, root, { receiveShadow: true });
    built.rock.name = 'reef.rock';
  }

  // ---------- billboards ----------
  if (glowItems.length) {
    const glowMesh = makeBillboards(glowItems, { map: M.tex.glow, additive: true, mode: 'static', fog, uniforms: M.uniforms });
    glowMesh.name = 'reef.glows';
    root.add(glowMesh);
  }
  // bubble streams rising off the reef's flanks too
  for (let i = 0; i < (hi ? 6 : 3); i++) {
    const f = course.frames[Math.floor(r() * course.frames.length)];
    if (!f) break;
    const side = r() < 0.5 ? -1 : 1;
    const rr = new THREE.Vector3(-f.t.z, 0, f.t.x);
    const p = f.p.clone().addScaledVector(rr, side * (Math.max(f.el, f.er) + 0.3)).add(new THREE.Vector3(0, -0.6 - r() * 1.5, 0));
    if (inVoid(voids, p.x, p.z, 0.3)) continue;
    bubbles(p, hi ? 7 : 4, 5, 0.05);
  }
  if (bubbleItems.length) {
    const bm = makeBillboards(bubbleItems, { map: M.tex.bubble, mode: 'bubble', fog, uniforms: M.uniforms, renderOrder: 2 });
    bm.name = 'reef.bubbleStreams';
    root.add(bm);
  }

  // silt clouds drifting low round the reef's foot and over the seabed (blue-green, soft)
  const cloudTex = cloudAtlasTexture(hi ? 256 : 128);
  disposables.push(cloudTex);
  const cell = (k) => { const u0 = (k % 2) * 0.5, row = Math.floor(k / 2); return [u0, 1 - (row + 1) * 0.5, u0 + 0.5, 1 - row * 0.5]; };
  const eye = frame.tee.clone().addScaledVector(frame.view, -4).add(new THREE.Vector3(0, 4, 0));
  const banks = [];
  const BANK = [[0.5, 0.75, 0.75], [0.42, 0.68, 0.72], [0.62, 0.8, 0.74]];
  for (let i = 0; i < (hi ? 10 : 5); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.4 + 3 + r() * 12;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
    p.y = bedY + 0.5 + r() * 2;
    const w = 6 + r() * 8;
    banks.push({ p, w, h: w * 0.35, uv: cell((r() * 4) | 0), color: BANK[i % 3], a: 0.45, phase: r(), drift: 1 + r() * 2 });
  }
  for (let i = 0; i < (hi ? 12 : 6); i++) {
    const a = r() * Math.PI * 2, d = frame.size * 0.6 + 18 + r() * 60;
    const p = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, bedY + 1 + r() * 5 - frame.center.y, Math.sin(a) * d));
    const w = 16 + r() * 20;
    banks.push({ p, w, h: w * 0.35, uv: cell((r() * 4) | 0), color: BANK[i % 3], a: 0.5, phase: r(), drift: 3 + r() * 4 });
  }
  banks.sort((a, b) => b.p.distanceTo(eye) - a.p.distanceTo(eye));
  const bankMesh = makeBillboards(banks, { map: cloudTex, mode: 'drift', fog, uniforms: M.uniforms, renderOrder: 2 });
  bankMesh.name = 'reef.silt';
  root.add(bankMesh);

  // ---------- god-rays from the surface ----------
  {
    const down = sky.sunDir.clone().negate();
    const shafts = [];
    const N = hi ? 14 : 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + r() * 0.5, d = 2 + r() * (frame.size * 0.6 + 10);
      const len = 18 + r() * 14;
      const base = frame.center.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      base.y = frame.center.y - 2 - r() * 3;
      const top = base.clone().addScaledVector(down, -len * 0.7);
      shafts.push({ p: top, len, w: 0.6 + r() * 1.6, a: 0.07 + r() * 0.07, phase: r() });
    }
    const rays = buildRays(shafts, down, fog, M.uniforms);
    disposables.push(rays);
    root.add(rays.mesh);
  }

  // ---------- schools of fish ----------
  let fish = null;
  {
    const schools = [];
    const FC = [[0xffd040, 0xffe070], [0x40a0ff, 0x60c0ff, 0x3080e0], [0xff8030, 0xffffff], [0xc8d8e0, 0xa8c0d0], [0x70e0c0, 0x40c0a0], [0xff70a0, 0xffd0e0]];
    const nNear = hi ? 4 : 2, nFar = hi ? 3 : 2;
    for (let i = 0; i < nNear; i++) {
      const side = i % 2 ? -1 : 1;
      const along = (i + 0.5) / nNear;
      const p = frame.atV(side * ((frame.wmax - frame.wmin) * 0.5 + 3.5 + r() * 3), 1.0 + r() * 1.5, frame.vmin + (frame.vmax - frame.vmin) * along + 2);
      schools.push({ c: p, R: 1.4 + r() * 1.2, n: hi ? 10 : 8, size: 0.09 + r() * 0.04, speed: 0.6 + r() * 0.3, colors: FC[i % FC.length] });
    }
    for (let i = 0; i < nFar; i++) {
      const p = frame.atV((r() - 0.5) * 50, 2 + r() * 6, frame.vmax + 18 + r() * 30);
      schools.push({ c: p, R: 4 + r() * 4, n: hi ? 7 : 6, size: 0.3 + r() * 0.2, speed: 1.2 + r() * 0.6, colors: FC[(i + 3) % FC.length] });
    }
    fish = buildFish(schools, fog, 11);
    root.add(fish.mesh);
    disposables.push(fish);
  }

  // drifting bubbles and plankton around the camera
  const parts = buildParticles(hi ? 70 : 0, hi ? 160 : 80, hi ? 12 : 10, fog);   // low: plankton only (one draw; the bubble streams still rise)
  root.add(parts.group);

  // ---------- cup beacon: a soft aqua beam so the cup reads from far away ----------
  const beamFade = fadeTexture(64);
  disposables.push(beamFade);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.13, 4, 16, 1, true);
  const buv = beamGeo.attributes.uv; for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x70fff0, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false, alphaMap: beamFade, toneMapped: false }));
  beam.position.copy(frame.cup).add(new THREE.Vector3(0, 2.0, 0)); beam.renderOrder = 5; beam.name = 'reef.cupBeam';
  root.add(beam);

  scene.add(root);

  return {
    root,
    update(dt, t) {
      sky.update(dt, t, info.camera);
      M.animated.tick(dt, t);
      parts.update(t, info.camera);
      fish?.update(t);
    },
    dispose() {
      scene.remove(root);
      const keep = new Set([...Object.values(M.materials), ...Object.values(I), ...Object.values(M.tex)]);
      disposeTree(root, keep);
      for (const d of disposables) d.dispose();
      parts.dispose();
      sky.dispose();
    },
  };
}

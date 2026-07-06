// The living island: day/night sky + sun/moon/stars, fog, themed decor
// scatter (choppable trees, berry bushes, rocks, wildflowers), loose-goods
// drops, and ambient sheep & deer. Time of day drives everything — villagers
// read W.phase to know when to work, pray and sleep.

import * as THREE from 'three';
import { CELL, GRID, HALF, SEA, CFG } from './config.js';
import { model, sharedMat } from './assets.js';
import { rigMats } from './rig.js';
import { cellToWorld, worldToCell, cellIdx, inIsle } from './terrain.js';
import { rand, pick, clamp, lerp, hash2, fbm, mesh, M } from './utils.js';

// day-cycle palette keyframes: [dayT, skyTop, horizon, fog, sun, sunI, hemiI, night]
const PAL = [
  [0.000, 0x0b1026, 0x14203a, 0x0a1420, 0x9db8ff, 0.00, 0.22, 1],
  [0.045, 0x1a2038, 0x4a3a50, 0x241d30, 0xffb060, 0.05, 0.28, 0.8],
  [0.090, 0x4a6a9a, 0xf0a35e, 0xc98a5e, 0xffb060, 0.62, 0.55, 0.15],
  [0.160, 0x7fb2e0, 0xcfe4ee, 0xbcd4de, 0xfff2d8, 1.05, 0.85, 0],
  [0.340, 0x7fb8e8, 0xd5ecf5, 0xc6dee8, 0xfff6e0, 1.18, 0.95, 0],
  [0.520, 0x78a9dc, 0xd8e2d0, 0xc8d4c4, 0xffeecc, 1.00, 0.85, 0],
  [0.575, 0x5a6aa8, 0xff9a4e, 0xd98a5a, 0xff9040, 0.50, 0.55, 0.15],
  [0.625, 0x232b52, 0x7a4a68, 0x3a3050, 0xffb060, 0.10, 0.32, 0.7],
  [0.700, 0x0b1026, 0x14203a, 0x0a1420, 0x9db8ff, 0.00, 0.22, 1],
  [1.000, 0x0b1026, 0x14203a, 0x0a1420, 0x9db8ff, 0.00, 0.22, 1],
];

const TREE_TYPES = ['tree_beech', 'tree_birch', 'tree_birch_t', 'tree_spruce', 'tree_conifer'];

export async function createWorld(scene, T, { lite = false } = {}) {
  const W = {
    group: new THREE.Group(), lite,
    dayT: 0.16, day: 1, workMul: 1,
    trees: [], bushes: [], drops: [], animals: [], smallRefs: [],
    tickers: [],
  };
  scene.add(W.group);

  // ── sky ─────────────────────────────────────────────────────────────────────
  const skyC = document.createElement('canvas');
  skyC.width = 2; skyC.height = 256;
  const skyG = skyC.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xc6dee8, 150, 380);

  const hemi = new THREE.HemisphereLight(0xbfd8ec, 0x54633c, 0.8);
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.1);
  const moon = new THREE.DirectionalLight(0x93aaff, 0.16);
  sun.position.set(60, 90, 40);
  moon.position.set(-50, 70, -30);
  if (!lite) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110;
    sc.near = 10; sc.far = 400;
    sun.shadow.bias = -0.0012;
  }
  W.group.add(hemi, sun, moon);
  W.sun = sun;

  // stars
  const starN = 500;
  const sp = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.12, 1.4);
    const r = 330;
    sp[i * 3] = Math.cos(a) * Math.cos(e) * r;
    sp[i * 3 + 1] = Math.sin(e) * r;
    sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const cA = new THREE.Color(), cB = new THREE.Color(), cTop = new THREE.Color(), cHor = new THREE.Color(), cFog = new THREE.Color();
  let nightness = 0;
  function applyTime() {
    const t = W.dayT;
    let i = 0;
    while (PAL[i + 1][0] < t) i++;
    const a = PAL[i], b = PAL[i + 1];
    const k = (t - a[0]) / (b[0] - a[0] + 1e-9);
    cTop.set(a[1]).lerp(cB.set(b[1]), k);
    cHor.set(a[2]).lerp(cB.set(b[2]), k);
    cFog.set(a[3]).lerp(cB.set(b[3]), k);
    cA.set(a[4]).lerp(cB.set(b[4]), k);
    const sunI = lerp(a[5], b[5], k), hemiI = lerp(a[6], b[6], k);
    nightness = lerp(a[7], b[7], k);

    const g = skyG.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${cTop.getHexString()}`);
    g.addColorStop(0.58, `#${cHor.getHexString()}`);
    g.addColorStop(1, `#${cFog.getHexString()}`);
    skyG.fillStyle = g;
    skyG.fillRect(0, 0, 2, 256);
    skyTex.needsUpdate = true;

    scene.fog.color.copy(cFog);
    sun.color.copy(cA);
    sun.intensity = sunI * 1.15;
    hemi.intensity = hemiI;
    hemi.color.copy(cTop).lerp(new THREE.Color(0xffffff), 0.3);
    moon.intensity = nightness * 0.22;
    starMat.opacity = nightness * 0.9;

    // sun arc across the day, moon across the night
    const D = CFG.day;
    const df = clamp((t - D.sunrise) / (D.sunset + 0.05 - D.sunrise), 0, 1);
    const ang = Math.PI * (1 - df);
    sun.position.set(Math.cos(ang) * 140, Math.sin(ang) * 120 + 8, 55);
    const nf = t > D.dusk ? (t - D.dusk) / (1 - D.dusk + D.sunrise) : (t + 1 - D.dusk) / (1 - D.dusk + D.sunrise);
    const mang = Math.PI * (1 - clamp(nf, 0, 1));
    moon.position.set(Math.cos(mang) * 120, Math.sin(mang) * 100 + 10, -60);

    // water picks up the sky
    T.water.material.color.copy(new THREE.Color(0x2a6f95)).lerp(cTop, 0.35);

    // the environment map knows no night — dim it by darkness or everything
    // stays noon-bright and the ocean glares white
    const envI = 0.12 + (1 - nightness) * 0.88;
    if (sharedMat) sharedMat.envMapIntensity = envI;
    T.mat.envMapIntensity = envI * 0.9;
    T.water.material.envMapIntensity = envI * 0.45;
    for (const m of rigMats) m.envMapIntensity = envI;
  }
  W.isNight = () => nightness > 0.5;
  W.nightness = () => nightness;
  W.phase = () => {
    const t = W.dayT, D = CFG.day;
    if (t >= D.dusk && t < D.prayEnd) return 'pray';
    if (t >= D.prayEnd || t < D.sunrise) return 'sleep';
    if (t >= D.sunrise && t < D.morning) return 'dawn';
    return 'work';
  };

  // ── decor ───────────────────────────────────────────────────────────────────
  const seed = T.seed;
  W.treeId = 1;

  async function makeTree(type, x, z, stage = 'grown', grow = 0) {
    const m = await model(type);
    const tr = {
      id: W.treeId++, type, x, z, mesh: m, stage, grow,
      baseH: T.heightAt(x, z), falling: 0, claimedBy: null,
    };
    const s = stage === 'sapling' ? 0.22 : rand(1.15, 1.7);
    m.scale.setScalar(s * (type === 'tree_birch_t' ? 1.2 : 1));
    tr.fullScale = stage === 'sapling' ? rand(1.15, 1.5) : s;
    m.position.set(x, tr.baseH, z);
    m.rotation.y = rand(0, Math.PI * 2);
    W.group.add(m);
    W.trees.push(tr);
    const { cx, cz } = worldToCell(x, z);
    if (stage === 'grown' && inIsle(cx, cz)) T.obstacle[cellIdx(cx, cz)] = 1;
    return tr;
  }

  async function makeBush(x, z, food = CFG.econ.bushFood) {
    const m = await model('bush_big');
    m.scale.setScalar(rand(1.3, 1.7));
    const h = T.heightAt(x, z);
    m.position.set(x, h, z);
    m.rotation.y = rand(0, Math.PI * 2);
    // berries: little red dots that vanish when foraged
    const berries = new THREE.Group();
    const bmat = new THREE.MeshStandardMaterial({ color: 0xd83a2a, roughness: 0.5, emissive: 0x481008 });
    const bgeo = new THREE.SphereGeometry(0.11, 6, 5);
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(bgeo, bmat);
      const a = rand(0, Math.PI * 2), rr = rand(0.35, 0.75);
      b.position.set(Math.cos(a) * rr, rand(0.5, 1.15), Math.sin(a) * rr);
      berries.add(b);
    }
    m.add(berries);
    W.group.add(m);
    const bush = { x, z, mesh: m, berries, food, regrow: 0, claimedBy: null };
    berries.visible = food > 0;
    W.bushes.push(bush);
    const { cx, cz } = worldToCell(x, z);
    if (inIsle(cx, cz)) T.obstacle[cellIdx(cx, cz)] = 1;
    return bush;
  }

  async function genDecor() {
    const jobs = [];
    const camp = T.camp;
    let treeBudget = lite ? 95 : 150, bushBudget = 20, rockBudget = lite ? 22 : 36, smallBudget = lite ? 40 : 90;
    // trees in fbm forest patches
    for (let cz = 2; cz < GRID - 2 && treeBudget > 0; cz += 1) {
      for (let cx = 2; cx < GRID - 2 && treeBudget > 0; cx += 1) {
        const { x, z } = cellToWorld(cx, cz);
        const h = T.cellH(cx, cz), sl = T.cellSlope(cx, cz);
        if (h < 0.8 || h > 7 || sl > 0.7) continue;
        if (Math.hypot(x - camp.x, z - camp.z) < 15) continue;
        const forest = fbm(cx * 0.045, cz * 0.045, 3, seed + 21);
        if (forest < 0.56) continue;
        if (hash2(cx, cz, 31) > 0.34) continue;
        const type = h < 2.4 ? pick(['tree_beech', 'tree_birch', 'tree_beech']) :
          h < 4.5 ? pick(['tree_birch_t', 'tree_beech', 'tree_spruce']) :
            pick(['tree_spruce', 'tree_conifer']);
        treeBudget--;
        jobs.push(makeTree(type, x + rand(-0.6, 0.6), z + rand(-0.6, 0.6)));
      }
    }
    // berry bushes on meadow fringes
    for (let i = 0; i < 900 && bushBudget > 0; i++) {
      const a = hash2(i, 1, seed + 41) * Math.PI * 2, r = 9 + hash2(i, 2, seed + 41) * 26;
      const x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r;
      const { cx, cz } = worldToCell(x, z);
      if (!inIsle(cx, cz) || T.obstacle[cellIdx(cx, cz)]) continue;
      const h = T.cellH(cx, cz);
      if (h < 0.7 || h > 3.2 || T.cellSlope(cx, cz) > 0.4) continue;
      bushBudget--;
      jobs.push(makeBush(x, z));
    }
    // rocks on the crag + scattered stones
    for (let i = 0; i < 2600 && rockBudget > 0; i++) {
      const x = (hash2(i, 3, seed + 51) - 0.5) * 2 * (HALF - 8), z = (hash2(i, 4, seed + 51) - 0.5) * 2 * (HALF - 8);
      const { cx, cz } = worldToCell(x, z);
      if (!inIsle(cx, cz) || T.obstacle[cellIdx(cx, cz)]) continue;
      const h = T.cellH(cx, cz);
      if (h < 0.4) continue;
      const rocky = T.isRock(cx, cz) || h > 6.5;
      if (!rocky && hash2(i, 5, seed) > 0.06) continue;
      rockBudget--;
      jobs.push((async () => {
        const m = await model(pick(['rock_large', 'rock_sharp', 'rocks_small', 'stone_big', 'rock_pillar']));
        m.scale.setScalar(rand(0.7, 1.6));
        m.position.set(x, T.heightAt(x, z), z);
        m.rotation.y = rand(0, Math.PI * 2);
        W.group.add(m);
        W.smallRefs.push({ mesh: m, x, z });
        if (inIsle(cx, cz)) T.obstacle[cellIdx(cx, cz)] = 1;
      })());
    }
    // grass / flowers / mushrooms (non-blocking)
    for (let i = 0; i < 2600 && smallBudget > 0; i++) {
      const x = (hash2(i, 6, seed + 61) - 0.5) * 2 * (HALF - 10), z = (hash2(i, 7, seed + 61) - 0.5) * 2 * (HALF - 10);
      const { cx, cz } = worldToCell(x, z);
      if (!inIsle(cx, cz)) continue;
      const h = T.cellH(cx, cz);
      if (h < 0.6 || h > 6 || T.cellSlope(cx, cz) > 0.5) continue;
      if (hash2(i, 8, seed) > 0.5) continue;
      smallBudget--;
      jobs.push((async () => {
        const m = await model(pick(['grass_g', 'grass_g', 'flower_red', 'mushroom']));
        m.scale.setScalar(rand(0.8, 1.4));
        m.position.set(x, T.heightAt(x, z), z);
        m.rotation.y = rand(0, Math.PI * 2);
        m.castShadow = false;
        W.group.add(m);
        W.smallRefs.push({ mesh: m, x, z });
      })());
    }
    await Promise.all(jobs);
  }

  // ── ambient animals (decorative) ────────────────────────────────────────────
  async function genAnimals() {
    const defs = [
      { m: 'sheep', n: lite ? 3 : 6, home: { x: T.camp.x - 16, z: T.camp.z - 6 }, r: 14, s: 0.9 },
      { m: 'deer', n: lite ? 2 : 4, home: { x: -30, z: -10 }, r: 20, s: 1.0 },
    ];
    for (const d of defs) {
      for (let i = 0; i < d.n; i++) {
        const m = await model(d.m);
        m.scale.setScalar(d.s * rand(0.85, 1.15));
        const x = d.home.x + rand(-d.r, d.r), z = d.home.z + rand(-d.r, d.r);
        m.position.set(x, T.heightAt(x, z), z);
        W.group.add(m);
        W.animals.push({ mesh: m, home: d.home, r: d.r, tx: x, tz: z, wait: rand(0, 4), speed: rand(0.5, 0.9) });
      }
    }
  }

  // ── loose goods (hauled by villagers) ───────────────────────────────────────
  const DROP_MODEL = { wood: ['logs', 0.85], stone: ['rocks_small', 0.95], food: ['crate', 0.55] };
  W.spawnDrop = async (type, n, x, z) => {
    const [mn, s] = DROP_MODEL[type] || DROP_MODEL.wood;
    const m = await model(mn);
    m.scale.setScalar(s);
    m.position.set(x, Math.max(T.heightAt(x, z), SEA + 0.02), z);
    m.rotation.y = rand(0, Math.PI * 2);
    W.group.add(m);
    const d = { type, n, x, z, mesh: m, claimedBy: null };
    W.drops.push(d);
    return d;
  };
  W.removeDrop = (d) => {
    const i = W.drops.indexOf(d);
    if (i >= 0) W.drops.splice(i, 1);
    if (d.mesh) W.group.remove(d.mesh);
  };

  // ── trees: chop / plant / sprout ────────────────────────────────────────────
  W.fellTree = (tr, giveWood = true) => {
    if (tr.stage === 'falling' || tr.stage === 'gone') return;
    tr.stage = 'falling';
    tr.fallT = 0;
    tr.fallDir = rand(0, Math.PI * 2);
    tr.giveWood = giveWood;
    const { cx, cz } = worldToCell(tr.x, tr.z);
    if (inIsle(cx, cz) && T.obstacle[cellIdx(cx, cz)] === 1) T.obstacle[cellIdx(cx, cz)] = 0;
  };
  W.plantSapling = async (x, z) => {
    const type = pick(TREE_TYPES);
    return makeTree(type, x, z, 'sapling', 0);
  };
  W.sproutAt = async (wx, wz, r, n = 8) => {
    let made = 0;
    for (let i = 0; i < 60 && made < n; i++) {
      const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * r;
      const x = wx + Math.cos(a) * rr, z = wz + Math.sin(a) * rr;
      const { cx, cz } = worldToCell(x, z);
      if (!inIsle(cx, cz) || T.obstacle[cellIdx(cx, cz)] || !T.isLand(cx, cz)) continue;
      const tr = await makeTree(pick(TREE_TYPES), x, z, 'sapling', CFG.econ.saplingGrow * 0.55);
      tr.mesh.scale.setScalar(0.4);
      made++;
    }
    return made;
  };
  W.nearestTree = (x, z, maxD = 999, unclaimed = true) => {
    let best = null, bd = maxD * maxD;
    for (const tr of W.trees) {
      if (tr.stage !== 'grown' || (unclaimed && tr.claimedBy)) continue;
      const d = (tr.x - x) ** 2 + (tr.z - z) ** 2;
      if (d < bd) { bd = d; best = tr; }
    }
    return best;
  };
  W.nearestBush = (x, z, maxD = 999) => {
    let best = null, bd = maxD * maxD;
    for (const b of W.bushes) {
      if (b.food <= 0 || b.claimedBy) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  // ── terrain edits: re-seat, drown, uproot ───────────────────────────────────
  W.onTerrainEdit = (rect) => {
    const inRect = (x, z) => {
      const { cx, cz } = worldToCell(x, z);
      return cx >= rect.cx0 && cx <= rect.cx1 && cz >= rect.cz0 && cz <= rect.cz1;
    };
    for (const tr of [...W.trees]) {
      if (tr.stage === 'gone' || !inRect(tr.x, tr.z)) continue;
      const h = T.heightAt(tr.x, tr.z);
      if (Math.abs(h - tr.baseH) > CFG.sculpt.uprootDelta || h < 0.12) {
        W.fellTree(tr, true);                        // uprooted → free logs
      } else {
        tr.baseH = h;
        tr.mesh.position.y = h;
      }
    }
    for (const b of [...W.bushes]) {
      if (!inRect(b.x, b.z)) continue;
      const h = T.heightAt(b.x, b.z);
      if (h < 0.12) {
        W.group.remove(b.mesh);
        W.bushes.splice(W.bushes.indexOf(b), 1);
        const { cx, cz } = worldToCell(b.x, b.z);
        if (inIsle(cx, cz) && T.obstacle[cellIdx(cx, cz)] === 1) T.obstacle[cellIdx(cx, cz)] = 0;
      } else b.mesh.position.y = h;
    }
    for (const s of W.smallRefs) if (inRect(s.x, s.z)) s.mesh.position.y = T.heightAt(s.x, s.z);
    for (const d of W.drops) if (inRect(d.x, d.z)) d.mesh.position.y = Math.max(T.heightAt(d.x, d.z), SEA + 0.02);
    for (const a of W.animals) a.mesh.position.y = T.heightAt(a.mesh.position.x, a.mesh.position.z);
  };

  // ── tick ────────────────────────────────────────────────────────────────────
  W.tick = (dt, t) => {
    W.dayT += dt / CFG.day.length;
    if (W.dayT >= 1) { W.dayT -= 1; W.day++; W.onNewDay?.(W.day); }
    applyTime();
    T.tick(dt, t, W.isNight());

    // falling trees
    for (const tr of [...W.trees]) {
      if (tr.stage === 'falling') {
        tr.fallT += dt;
        const k = Math.min(1, tr.fallT / 1.3);
        tr.mesh.rotation.set(Math.sin(tr.fallDir) * k * k * 1.5, tr.mesh.rotation.y, Math.cos(tr.fallDir) * k * k * 1.5);
        if (tr.fallT > 1.3) tr.mesh.position.y -= dt * 1.6;
        if (tr.fallT > 2.4) {
          tr.stage = 'gone';
          W.group.remove(tr.mesh);
          W.trees.splice(W.trees.indexOf(tr), 1);
          if (tr.giveWood) W.spawnDrop('wood', CFG.econ.treeWood, tr.x, tr.z);
        }
      } else if (tr.stage === 'sapling') {
        tr.grow += dt;
        const k = Math.min(1, tr.grow / CFG.econ.saplingGrow);
        tr.mesh.scale.setScalar(lerp(0.22, tr.fullScale, k));
        if (k >= 1) {
          tr.stage = 'grown';
          const { cx, cz } = worldToCell(tr.x, tr.z);
          if (inIsle(cx, cz) && !T.obstacle[cellIdx(cx, cz)]) T.obstacle[cellIdx(cx, cz)] = 1;
        }
      }
    }
    // bushes regrow
    for (const b of W.bushes) {
      if (b.food <= 0) {
        b.regrow += dt;
        if (b.regrow > CFG.econ.bushRegrow) { b.food = CFG.econ.bushFood; b.regrow = 0; b.berries.visible = true; }
      }
    }
    // ambient animals wander
    for (const a of W.animals) {
      const m = a.mesh;
      if (a.wait > 0) { a.wait -= dt; continue; }
      const dx = a.tx - m.position.x, dz = a.tz - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        a.wait = rand(2, 7);
        for (let i = 0; i < 6; i++) {
          const nx = a.home.x + rand(-a.r, a.r), nz = a.home.z + rand(-a.r, a.r);
          const { cx, cz } = worldToCell(nx, nz);
          if (inIsle(cx, cz) && T.isLand(cx, cz) && T.cellSlope(cx, cz) < 0.5) { a.tx = nx; a.tz = nz; break; }
        }
        continue;
      }
      m.position.x += (dx / d) * a.speed * dt;
      m.position.z += (dz / d) * a.speed * dt;
      m.position.y = T.heightAt(m.position.x, m.position.z) + Math.abs(Math.sin(t * 7 + a.r)) * 0.05;
      m.rotation.y = Math.atan2(dx, dz);
    }
    for (const fn of W.tickers) fn(dt, t);
  };

  // ── save / load ─────────────────────────────────────────────────────────────
  W.serialize = () => ({
    dayT: W.dayT, day: W.day,
    trees: W.trees.filter(t => t.stage !== 'gone').map(t => [t.type, +t.x.toFixed(1), +t.z.toFixed(1), t.stage === 'sapling' ? 1 : 0, Math.round(t.grow)]),
    bushes: W.bushes.map(b => [+b.x.toFixed(1), +b.z.toFixed(1), b.food, Math.round(b.regrow)]),
    drops: W.drops.map(d => [d.type, d.n, +d.x.toFixed(1), +d.z.toFixed(1)]),
  });
  W.loadState = async (data) => {
    W.dayT = data.dayT; W.day = data.day;
    for (const tr of [...W.trees]) {
      W.group.remove(tr.mesh);
      const { cx, cz } = worldToCell(tr.x, tr.z);
      if (inIsle(cx, cz) && T.obstacle[cellIdx(cx, cz)] === 1) T.obstacle[cellIdx(cx, cz)] = 0;
    }
    W.trees.length = 0;
    for (const b of [...W.bushes]) {
      W.group.remove(b.mesh);
      const { cx, cz } = worldToCell(b.x, b.z);
      if (inIsle(cx, cz) && T.obstacle[cellIdx(cx, cz)] === 1) T.obstacle[cellIdx(cx, cz)] = 0;
    }
    W.bushes.length = 0;
    for (const d of [...W.drops]) W.removeDrop(d);
    const jobs = [];
    for (const [type, x, z, sap, grow] of data.trees)
      jobs.push(makeTree(type, x, z, sap ? 'sapling' : 'grown', grow).then(tr => {
        if (tr.stage === 'sapling') tr.mesh.scale.setScalar(lerp(0.22, tr.fullScale, Math.min(1, grow / CFG.econ.saplingGrow)));
      }));
    for (const [x, z, food, regrow] of data.bushes)
      jobs.push(makeBush(x, z, food).then(b => { b.regrow = regrow; b.berries.visible = food > 0; }));
    for (const [type, n, x, z] of data.drops) jobs.push(W.spawnDrop(type, n, x, z));
    await Promise.all(jobs);
  };

  await Promise.all([genDecor(), genAnimals()]);
  applyTime();
  return W;
}

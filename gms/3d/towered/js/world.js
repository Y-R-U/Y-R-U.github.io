// The battlefield: painted ground + road canvas, themed decor scatter, the
// castle you defend, spawn gates (skull cave in the Ashlands), sky/fog/light
// rig per theme, and ambient particles (snow / embers).

import * as THREE from 'three';
import { CELL, THEMES } from './config.js';
import { model } from './assets.js';
import { buildCurve, rasterizePaths, cellToWorld, inGrid, cellKey } from './levels.js';
import { hash2, mesh, M } from './utils.js';

const MARGIN = 6; // decorated cells beyond the grid on each side

export async function buildWorld(scene, level, { lite = false } = {}) {
  const theme = THEMES[level.theme] || THEMES.meadow;
  const w = {
    level, theme, group: new THREE.Group(), lite,
    curves: level.paths.map((_, i) => buildCurve(level, i)),
    tickers: [],
  };
  scene.add(w.group);
  w.pathCells = rasterizePaths(level, w.curves);
  w.blockedCells = new Set(level.blocked?.map(([x, z]) => cellKey(x, z)) || []);

  buildSkyAndLight(scene, w);
  buildGround(w);
  const jobs = [decorate(w), buildCastle(w), buildGates(w)];
  if (theme.torches && !lite) jobs.push(buildTorches(w));
  await Promise.all(jobs);
  if ((theme.snow || theme.embers) && !lite) buildParticles(w);

  w.tick = (dt, t) => { for (const fn of w.tickers) fn(dt, t); };
  w.dispose = () => {
    scene.remove(w.group);
    w.group.traverse(o => { o.geometry?.dispose?.(); });
    scene.fog = null;
  };
  return w;
}

export const isBuildable = (w, cx, cz) =>
  inGrid(w.level, cx, cz) && !w.pathCells.has(cellKey(cx, cz)) && !w.blockedCells.has(cellKey(cx, cz));

// ── sky + light ──────────────────────────────────────────────────────────────
function buildSkyAndLight(scene, w) {
  const t = w.theme;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, t.sky); grad.addColorStop(0.62, t.horizon); grad.addColorStop(1, t.fog);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
  scene.fog = new THREE.Fog(new THREE.Color(t.fog), t.fogFar * 0.35, t.fogFar);

  const hemi = new THREE.HemisphereLight(t.sky, t.groundA, t.hemi);
  const amb = new THREE.AmbientLight(t.amb, t.ambI);
  const sun = new THREE.DirectionalLight(t.sun, t.sunI);
  const span = Math.max(w.level.grid.w, w.level.grid.h) * CELL * 0.75;
  sun.position.set(span * 0.9, span * 1.15, span * 0.55);
  if (!w.lite) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -span * 1.3; sc.right = span * 1.3; sc.top = span * 1.3; sc.bottom = -span * 1.3;
    sc.near = 1; sc.far = span * 4;
    sun.shadow.bias = -0.0008;
  }
  // soft fill from the opposite side so west faces don't go black
  const fill = new THREE.DirectionalLight(t.sun, t.sunI * 0.22);
  fill.position.set(-span, span * 0.6, -span * 0.4);
  w.group.add(hemi, amb, sun, fill);
}

// ── ground: one painted canvas (base + blotches + the road) ────────────────
function buildGround(w) {
  const { level, theme } = w;
  const gw = level.grid.w * CELL, gh = level.grid.h * CELL;
  const extent = Math.max(gw, gh) + MARGIN * 2 * CELL;
  const size = 1024, pxu = size / extent;
  const toPx = (x, z) => [size / 2 + x * pxu, size / 2 + z * pxu];

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = theme.groundA;
  g.fillRect(0, 0, size, size);

  // organic blotches + speckle grain
  for (let i = 0; i < 260; i++) {
    const rx = hash2(i, 1) * size, rz = hash2(i, 2) * size, r = 12 + hash2(i, 3) * 46;
    g.fillStyle = theme.groundB;
    g.globalAlpha = 0.16 + hash2(i, 4) * 0.22;
    g.beginPath(); g.arc(rx, rz, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = i % 3 ? theme.speckle : theme.groundB;
    g.globalAlpha = 0.12 + hash2(i, 5) * 0.2;
    g.fillRect(hash2(i, 6) * size, hash2(i, 7) * size, 2.2, 2.2);
  }
  g.globalAlpha = 1;

  // the road: dark edge under, lighter body over, worn centre line
  g.lineCap = 'round'; g.lineJoin = 'round';
  const drawPath = (width, style, alpha = 1) => {
    g.strokeStyle = style; g.globalAlpha = alpha; g.lineWidth = width * pxu;
    for (const curve of w.curves) {
      g.beginPath();
      curve.pts.forEach((p, i) => {
        const [px, pz] = toPx(p.x, p.z);
        i ? g.lineTo(px, pz) : g.moveTo(px, pz);
      });
      g.stroke();
    }
  };
  drawPath(CELL * 1.6, theme.pathEdge, 0.9);
  drawPath(CELL * 1.28, theme.path, 1);
  drawPath(CELL * 0.5, theme.pathEdge, 0.14);
  // wheel-rut speckle on the road
  for (const curve of w.curves) {
    for (let i = 0; i < curve.pts.length; i += 3) {
      const p = curve.pts[i];
      const [px, pz] = toPx(p.x + (hash2(i, 8) - 0.5) * 1.6, p.z + (hash2(i, 9) - 0.5) * 1.6);
      g.fillStyle = theme.pathEdge; g.globalAlpha = 0.25;
      g.fillRect(px, pz, 2.5, 2.5);
    }
  }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ground = mesh(
    new THREE.PlaneGeometry(extent, extent).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
  );
  ground.castShadow = false;
  w.ground = ground;
  w.group.add(ground);

  // horizon skirt fading into the fog
  const skirt = mesh(
    new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
    M(new THREE.Color(theme.groundB).multiplyScalar(0.92)), 0, -0.06, 0, false,
  );
  skirt.receiveShadow = false;
  w.group.add(skirt);
}

// ── decor: blocked cells get big set-dressing, the margin ring a forest ─────
async function decorate(w) {
  const { level, theme } = w;
  const density = level.decor ?? 0.5;
  const placements = [];

  // blocked cells inside the grid — guaranteed decoration (they read as "no build")
  for (const key of w.blockedCells) {
    const [cx, cz] = key.split(',').map(Number);
    placements.push({ cx, cz, big: true });
  }
  // margin ring around the grid
  for (let cx = -MARGIN; cx < level.grid.w + MARGIN; cx++) {
    for (let cz = -MARGIN; cz < level.grid.h + MARGIN; cz++) {
      if (inGrid(level, cx, cz)) continue;
      const edge = Math.max(
        cx < 0 ? -cx : cx - level.grid.w + 1,
        cz < 0 ? -cz : cz - level.grid.h + 1, 1);
      const p = (0.1 + edge * 0.09) * (0.4 + density) * (w.lite ? 0.45 : 1);
      if (hash2(cx, cz, 11) < p) placements.push({ cx, cz, big: hash2(cx, cz, 12) > 0.35 });
    }
  }

  const weighted = [];
  for (const d of theme.decor) for (let i = 0; i < d.w; i++) weighted.push(d);
  const smalls = theme.decor.filter(d => d.m.startsWith('grass') || d.m === 'mushroom' || d.m.startsWith('bush'));

  await Promise.all(placements.map(async ({ cx, cz, big }) => {
    const table = big ? weighted : (smalls.length ? smalls : weighted);
    const d = table[Math.floor(hash2(cx, cz, 13) * table.length)];
    const inst = await model(d.m);
    const { x, z } = cellToWorld(level, cx, cz);
    inst.position.set(
      x + (hash2(cx, cz, 14) - 0.5) * CELL * 0.7, 0,
      z + (hash2(cx, cz, 15) - 0.5) * CELL * 0.7);
    inst.rotation.y = hash2(cx, cz, 16) * Math.PI * 2;
    const s = d.s[0] + hash2(cx, cz, 17) * (d.s[1] - d.s[0]);
    inst.scale.setScalar(s);
    w.group.add(inst);
  }));

  // a couple of landmark props deep in the margin
  const props = (theme.props || []).slice(0, w.lite ? 2 : 4);
  const corners = [
    [-MARGIN + 1.6, level.grid.h * 0.25], [level.grid.w + MARGIN - 2.6, level.grid.h * 0.7],
    [level.grid.w * 0.7, -MARGIN + 1.6], [level.grid.w * 0.2, level.grid.h + MARGIN - 2.6],
  ];
  await Promise.all(props.map(async (name, i) => {
    try {
      const inst = await model(name);
      const [cx, cz] = corners[i % corners.length];
      const { x, z } = cellToWorld(level, cx, cz);
      inst.position.set(x, 0, z);
      inst.rotation.y = hash2(i, 21) * Math.PI * 2;
      w.group.add(inst);
    } catch { /* prop not in pack — skip */ }
  }));
}

// ── the castle (end of path 0; all paths should converge there) ─────────────
async function buildCastle(w) {
  const curve = w.curves[0];
  const castle = await model('castle');
  const size = castle.userData.size;
  const scl = (CELL * 5.2) / Math.max(size.x, size.z);
  castle.scale.setScalar(scl);
  const yaw = Math.atan2(curve.castleDir.x, curve.castleDir.z);
  const pos = curve.end.clone().addScaledVector(curve.castleDir.clone().negate(), CELL * 2.6);
  castle.position.set(pos.x, 0, pos.z);
  castle.rotation.y = yaw;
  w.group.add(castle);
  w.castlePos = pos;

  const flag = await model('flag_big');
  flag.scale.setScalar(1.1);
  flag.position.set(pos.x, size.y * scl * 0.98, pos.z);
  w.group.add(flag);
  w.castleFlag = flag;
}

// ── spawn gates: arch + swirling dark portal (skull cave in the Ashlands) ───
async function buildGates(w) {
  w.gates = [];
  await Promise.all(w.curves.map(async (curve, i) => {
    const isSkull = w.theme.name === 'Ashlands';
    const gate = await model(isSkull ? 'skull_cave' : 'gate');
    const size = gate.userData.size;
    const scl = (CELL * (isSkull ? 2.6 : 1.9)) / Math.max(size.x, 0.001);
    gate.scale.setScalar(scl);
    // face down the path (gateDir points away from the path, out the back)
    const yaw = Math.atan2(-curve.gateDir.x, -curve.gateDir.z);
    const pos = curve.start.clone().addScaledVector(curve.gateDir, CELL * 1.15);
    gate.position.set(pos.x, 0, pos.z);
    gate.rotation.y = yaw;
    w.group.add(gate);

    // swirling portal disc in the arch
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let a = 0; a < 720; a += 4) {
      const rr = (a / 720) * 56;
      const x = 64 + Math.cos(a * 0.10472) * rr, y = 64 + Math.sin(a * 0.10472) * rr;
      g.fillStyle = a % 8 ? 'rgba(140,60,220,0.8)' : 'rgba(40,10,80,0.9)';
      g.beginPath(); g.arc(x, y, 5 - rr / 18, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(CELL * 0.62, 24),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.position.set(pos.x, CELL * 0.72, pos.z);
    disc.rotation.y = yaw;
    w.group.add(disc);
    const glow = new THREE.PointLight(0x9040ff, w.lite ? 0 : 14, CELL * 4.5);
    glow.position.set(pos.x, 1.4, pos.z);
    w.group.add(glow);
    w.tickers.push((dt) => { disc.rotation.z += dt * 1.6; });
    w.gates.push({ pos, disc });
  }));
}

// ── ashlands torches along the road ─────────────────────────────────────────
async function buildTorches(w) {
  const curve = w.curves[0];
  const n = Math.min(5, Math.floor(curve.total / (CELL * 7)));
  const pos = new THREE.Vector3(), tan = new THREE.Vector3();
  const lights = [];
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    const s = curve.total * (i + 0.5) / n;
    curve.posAt(s, pos, tan);
    const side = i % 2 ? 1 : -1;
    const t = await model('torch');
    t.position.set(pos.x - tan.z * side * CELL * 0.95, 0, pos.z + tan.x * side * CELL * 0.95);
    w.group.add(t);
    const l = new THREE.PointLight(0xff8830, 9, CELL * 4);
    l.position.copy(t.position).y = 1.7;
    w.group.add(l);
    lights.push({ l, phase: i * 1.7 });
  }));
  w.tickers.push((dt, t) => {
    for (const { l, phase } of lights) l.intensity = 8 + Math.sin(t * 11 + phase) * 2 + Math.sin(t * 23 + phase) * 1;
  });
}

// ── ambient particles: snow falls, embers rise ──────────────────────────────
function buildParticles(w) {
  const { level, theme } = w;
  const n = 340;
  const gw = level.grid.w * CELL + 20, gh = level.grid.h * CELL + 20;
  const posArr = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    posArr[i * 3] = (Math.random() - 0.5) * gw;
    posArr[i * 3 + 1] = Math.random() * 14;
    posArr[i * 3 + 2] = (Math.random() - 0.5) * gh;
    seeds[i] = Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const mat = new THREE.PointsMaterial({
    color: theme.snow ? 0xffffff : 0xff9840, size: theme.snow ? 0.16 : 0.12,
    transparent: true, opacity: theme.snow ? 0.9 : 0.8, depthWrite: false,
    blending: theme.snow ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  w.group.add(pts);
  const dir = theme.snow ? -1 : 1, speed = theme.snow ? 1.6 : 0.9;
  w.tickers.push((dt, t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      a[i * 3 + 1] += dir * speed * dt * (0.6 + (seeds[i] % 1));
      a[i * 3] += Math.sin(t * 0.8 + seeds[i]) * dt * 0.5;
      if (dir < 0 && a[i * 3 + 1] < 0) a[i * 3 + 1] = 14;
      if (dir > 0 && a[i * 3 + 1] > 12) a[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  });
}

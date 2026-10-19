// Static world: the platform slab, baked ground, feature buildings, yard decor, the skyline and the city far below.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { BUILDERS } from './buildings.js';
import { cityTex, adTex } from './textures.js';

// platform bounds (x across the screen, z towards the camera)
export const PLAT = { x0: -34, x1: 34, z0: -64, z1: 46 };
export const LAYOUT = {
  hq:       { x: 0,   z: -44, ry: 0 },
  arena:    { x: 17,  z: -21, ry: -0.2 },
  story:    { x: -17, z: -22, ry: 0.25 },
  recruit:  { x: 0,   z: -2,  ry: 0 },
  events:   { x: 20,  z: 13,  ry: -0.35 },
  workshop: { x: -18, z: 13,  ry: 0.2 },
  squad:    { x: 2,   z: 29,  ry: -0.06 },
};
const SCRAP = { x: -20, z: 36 };
export const BSCALE = 1.35;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const nearFeature = (x, z, r) => Object.values(LAYOUT).some((L) => Math.hypot(L.x - x, L.z - z) < r);

// baked ground: plating + markings (color) and glowing walkways (emissive), one texture over the whole slab
function groundTextures(stage) {
  const S = 14, W = (PLAT.x1 - PLAT.x0) * S, H = (PLAT.z1 - PLAT.z0) * S;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const e = document.createElement('canvas'); e.width = W; e.height = H;
  const g = c.getContext('2d'), ge = e.getContext('2d'), r = rng(5 + stage);
  const P = (x, z) => [(x - PLAT.x0) * S, (z - PLAT.z0) * S];
  g.fillStyle = '#3a4456'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 4 * S) for (let x = 0; x < W; x += 4 * S) {
    const v = 58 + r() * 14 | 0; g.fillStyle = `rgb(${v},${v + 5},${v + 14})`; g.fillRect(x + 1, y + 1, 4 * S - 2, 4 * S - 2);
  }
  g.strokeStyle = 'rgba(8,10,16,0.9)'; g.lineWidth = 2;
  for (let y = 0; y < H; y += 4 * S) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = 0; x < W; x += 4 * S) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  // grime + oil stains, heavier while the company is a scrapyard
  for (let i = 0; i < [320, 200, 140, 110][stage]; i++) {
    const [x, y] = P(PLAT.x0 + r() * 68, PLAT.z0 + r() * 110), rad = 10 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${stage ? '5,6,10' : '30,18,8'},0.4)`); gr.addColorStop(1, 'rgba(5,6,10,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const stripe = (x0, y0, x1, y1, w) => {
    g.save(); g.beginPath(); g.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || w, Math.abs(y1 - y0) || w); g.clip();
    g.fillStyle = stage ? '#d9a300' : '#8a6a10'; g.fillRect(0, 0, W, H); g.fillStyle = '#15171c';
    for (let k = -H; k < W + H; k += 28) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 14, 0); g.lineTo(k + 14 + H, H); g.lineTo(k + H, H); g.fill(); }
    g.restore();
  };
  stripe(0, 6, W, 6 + 14, 14); stripe(0, H - 20, W, H - 6, 14); stripe(6, 0, 20, H, 14); stripe(W - 20, 0, W - 6, H, 14);
  const hub = LAYOUT.recruit;
  const glowLine = (pts, color, width, a0 = 1) => {
    for (const [lw, a] of [[width * 5, 0.12], [width * 2.2, 0.35], [width, 1]]) {
      ge.strokeStyle = color; ge.globalAlpha = a * a0; ge.lineWidth = lw; ge.lineJoin = 'round'; ge.beginPath();
      pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? ge.lineTo(px, py) : ge.moveTo(px, py); }); ge.stroke();
    }
    ge.globalAlpha = 1;
    g.strokeStyle = 'rgba(70,90,120,0.6)'; g.lineWidth = width * 10; g.beginPath();
    pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
  };
  const spokes = { hq: '#4f9dff', story: '#38e8ff', arena: '#ff4fd8', events: '#ffb547', workshop: '#ffd34d', squad: '#5cf2a6' };
  // walkways light up as the compound grows: stage 0 only has dim painted lanes
  const wa = [0.25, 0.75, 1, 1][stage];
  for (const [id, col] of Object.entries(spokes)) {
    const L = LAYOUT[id];
    glowLine([[hub.x, hub.z], [hub.x + (L.x - hub.x) * 0.5, hub.z], [L.x, L.z + (L.z < hub.z ? 8 : -8)]], col, 3, wa);
  }
  if (stage) glowLine([[-29, -58], [29, -58], [29, 40], [-29, 40], [-29, -58]], '#38e8ff', 1.5, wa);
  ge.strokeStyle = '#38e8ff'; ge.lineWidth = 1.5;
  for (let i = 0; i < [8, 30, 46, 60][stage]; i++) {
    let x = PLAT.x0 + 4 + r() * 60, z = PLAT.z0 + 4 + r() * 100; const [sx, sy] = P(x, z);
    ge.globalAlpha = 0.25 + r() * 0.35; ge.beginPath(); ge.moveTo(sx, sy);
    for (let j = 0; j < 3; j++) { if (r() < 0.5) x += (r() - 0.5) * 12; else z += (r() - 0.5) * 12; const [px, py] = P(x, z); ge.lineTo(px, py); }
    ge.stroke(); const [ex, ey] = P(x, z); ge.fillStyle = '#38e8ff'; ge.fillRect(ex - 2, ey - 2, 4, 4);
  }
  ge.globalAlpha = 1;
  g.strokeStyle = 'rgba(220,230,240,0.3)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { const [x, y] = P(-10 + i * 3.4, 36); g.strokeRect(x, y, 3 * S, 5 * S); }
  const mk = (tx, x, z, size, col) => { const [px, py] = P(x, z); g.save(); g.translate(px, py); g.fillStyle = col; g.font = `900 ${size * S}px "Orbitron","Arial Black",sans-serif`; g.textAlign = 'center'; g.fillText(tx, 0, 0); g.restore(); };
  mk('ZONE 7', -27, -4, 2.2, 'rgba(220,230,240,0.22)');
  const ct = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: ct(c), emissive: ct(e) };
}

function buildPlatform(k, stage, env) {
  const W = PLAT.x1 - PLAT.x0, D = PLAT.z1 - PLAT.z0, cx = (PLAT.x0 + PLAT.x1) / 2, cz = (PLAT.z0 + PLAT.z1) / 2;
  const gt = groundTextures(stage);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({
    map: gt.map, emissiveMap: gt.emissive, emissive: 0xffffff, emissiveIntensity: 2.6, metalness: 0.5, roughness: 0.22, envMap: env, envMapIntensity: 1.0,
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz);
  ground.matrixAutoUpdate = false; ground.updateMatrix();
  k.at(0, 0);
  k.box('dark', W, 5, D, cx, -5, cz, 0, 6);
  for (const y of [-0.4, -2.6]) {
    k.box('cyan', W + 0.3, 0.22, 0.3, cx, y, PLAT.z1 + 0.05); k.box('cyan', W + 0.3, 0.22, 0.3, cx, y, PLAT.z0 - 0.05);
    k.box('cyan', 0.3, 0.22, D, PLAT.x0 - 0.05, y, cz); k.box('cyan', 0.3, 0.22, D, PLAT.x1 + 0.05, y, cz);
  }
  for (let x = PLAT.x0 + 4; x < PLAT.x1; x += 8) k.box('amber', 1.2, 0.5, 0.1, x, -1.6, PLAT.z1 + 0.06);
  for (let x = PLAT.x0 + 2; x < PLAT.x1; x += 4) { k.box('hull', 0.2, 1.1, 0.2, x, 0, PLAT.z1 - 0.6); k.box('hull', 0.2, 1.1, 0.2, x, 0, PLAT.z0 + 0.6); }
  for (let z = PLAT.z0 + 2; z < PLAT.z1; z += 4) { k.box('hull', 0.2, 1.1, 0.2, PLAT.x0 + 0.6, 0, z); k.box('hull', 0.2, 1.1, 0.2, PLAT.x1 - 0.6, 0, z); }
  k.box('white', W - 1.2, 0.1, 0.1, cx, 1.1, PLAT.z1 - 0.6); k.box('white', 0.1, 0.1, D - 1.2, PLAT.x0 + 0.6, 1.1, cz); k.box('white', 0.1, 0.1, D - 1.2, PLAT.x1 - 0.6, 1.1, cz);
  for (const [x, z] of [[PLAT.x0 + 6, PLAT.z1 - 8], [PLAT.x1 - 6, PLAT.z1 - 8], [PLAT.x0 + 6, PLAT.z0 + 10], [PLAT.x1 - 6, PLAT.z0 + 10], [cx, cz]]) {
    k.box('dark', 6, 150, 6, x, -155, z); k.box('cyan', 0.3, 140, 0.3, x + 3.05, -150, z + 3.05);
  }
  return ground;
}

function container(k, x, z, ry, y, key, len = 6) {
  k.at(x, z, ry, y);
  k.box(key, len, 2.6, 2.5, 0, 0, 0);
  for (let i = 1; i < 8; i++) k.box(key, 0.08, 2.3, 2.58, -len / 2 + i * len / 8, 0.15, 0);
  k.box('dark', len + 0.1, 0.18, 2.6, 0, 2.5, 0);
  k.at(0, 0);
}

function buildDecor(k, stage, fx) {
  const r = rng(21);
  const cKeys = ['orangep', 'rust', 'teal', 'redp', 'mustard', 'bluep'];
  // scrap yard: a big messy salvage pile at stage 0..1, tidied into cargo + a second pad later
  if (stage <= 1) {
    const piles = stage ? 16 : 26;
    for (let i = 0; i < piles; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 8, x = SCRAP.x + Math.cos(a) * d * 1.3, z = SCRAP.z + Math.sin(a) * d * 0.8, s = 0.6 + r() * 1.6 * (1 - d / 10);
      k.at(0, 0);
      if (r() < 0.2) k.add('tire', new THREE.TorusGeometry(0.6, 0.24, 6, 12), x, 0.3 + r() * 1.2, z, Math.PI / 2 + (r() - 0.5), r() * 3, 0);
      else k.boxR(['rust', 'grime', 'steel', 'oxide'][r() * 4 | 0], s * (1 + r()), s * 0.6, s, x, s * 0.25 + (1 - d / 8) * 1.1, z, (r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
    }
    for (let i = 0; i < 6; i++) k.cyl(i % 2 ? 'rust' : 'paint', 0.45, 0.45, 1.2, SCRAP.x + 8 + (i % 3) * 1, 0, SCRAP.z - 5 + (i / 3 | 0) * 1, 10);
    // the scrapped mech hulk lying in the pile
    k.boxR('rust', 3, 2.2, 2.4, SCRAP.x - 2, 1.2, SCRAP.z + 1, 0.2, 0.6, 0.4);
    k.boxR('rust', 1.4, 1.4, 1.4, SCRAP.x - 0.2, 0.8, SCRAP.z + 2.6, 0.5, 0.2, 0.1);
    k.boxR('oxide', 0.7, 3.5, 0.7, SCRAP.x - 4, 0.8, SCRAP.z - 0.5, 1.2, 0.3, 0);
    // salvage crane over the pile
    k.box('hazard', 0.5, 9, 0.5, SCRAP.x + 6, 0, SCRAP.z + 4); k.boxR('hazard', 9, 0.4, 0.4, SCRAP.x + 2, 9, SCRAP.z + 3, 0, 0.35, 0.08);
    k.box('steel', 0.05, 3, 0.05, SCRAP.x - 1.6, 6, SCRAP.z + 1.4); k.box('dark', 1.4, 0.6, 1.4, SCRAP.x - 1.6, 5.4, SCRAP.z + 1.4);
    fx.beacons.push(new THREE.Vector3(SCRAP.x + 6, 9.8, SCRAP.z + 4));
    fx.signs.push({ text: 'SALVAGE', color: '#ff8a2a', x: SCRAP.x + 6, y: 6.8, z: SCRAP.z + 4.4, h: 2.2, flicker: true });
  } else {
    for (let i = 0; i < 9; i++) container(k, SCRAP.x - 8 + (i % 3) * 0.2, SCRAP.z + 1 + (i % 3) * 2.7, 0, (i / 3 | 0) * 2.6, cKeys[i % 6], 6);
    const vx = SCRAP.x + 5, vz = SCRAP.z - 1;
    if (stage < 3) {
      k.cyl('dark', 5.5, 5.8, 0.4, vx, 0, vz, 28); k.torus('cyan', 5.6, 0.08, vx, 0.42, vz);
      fx.pads.push(new THREE.Vector3(vx, 0.45, vz));
    } else {
      // flagship: raised octagonal VIP pad, gold rings, light posts and a red carpet to the yard lane
      k.cyl('light', 6.3, 6.8, 0.75, vx, 0, vz, 8); k.cyl('dark', 5.7, 5.7, 0.06, vx, 0.75, vz, 32);
      k.torus('amber', 5.95, 0.13, vx, 0.8, vz, Math.PI / 2, 48); k.torus('amber', 6.85, 0.08, vx, 0.25, vz, Math.PI / 2, 8);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = vx + Math.cos(a) * 7.6, z = vz + Math.sin(a) * 7.6; k.box('white_p', 0.3, 2.2, 0.3, x, 0, z); k.box('amber', 0.55, 0.35, 0.55, x, 2.2, z); }
      k.box('redp', 3.2, 0.06, 10, vx + 6.6, 0, vz - 7.6, -0.75); k.box('amber', 0.14, 0.08, 10, vx + 5.4, 0, vz - 8.7, -0.75); k.box('amber', 0.14, 0.08, 10, vx + 7.8, 0, vz - 6.5, -0.75);
      fx.vipPad = new THREE.Vector3(vx, 0.85, vz);
      fx.pools.push({ x: vx, z: vz, r: 10, c: 0xffc860, a: 0.5 });
      fx.signs.push({ text: 'VIP', color: '#ffd34d', x: vx, y: 10.5, z: vz - 6.5, h: 4.6 });
    }
  }
  // flagship banners: an avenue of company banners up to the HQ and two hung off the HQ podium (cloth sway in flagship.js)
  if (stage >= 3) {
    for (const [x, z, s] of [[-5.5, -19.5, 1], [5.5, -19.5, 1], [-5.5, -25.5, 1], [5.5, -25.5, 1], [-7.5, 39.5, 1.25], [17.5, 39.5, 1.25]]) {
      const H = 10 * s;
      k.box('dark', 0.32, H + 0.3, 0.32, x, 0, z); k.box('amber', 3.2 * s, 0.18, 0.18, x, H, z + 0.15); k.box('amber', 0.5, 0.5, 0.5, x, H + 0.3, z);
      fx.banners.push({ x, y: H - 0.05, z: z + 0.25, w: 2.8 * s, h: 7 * s, ry: 0 });
      fx.pools.push({ x, z: z + 2, r: 4, c: 0x4f9dff, a: 0.35 });
    }
    for (const x of [-7.2, 7.2]) { k.box('amber', 2.8, 0.18, 0.4, x, 7.25, -35.6); fx.banners.push({ x, y: 7.2, z: -35.55, w: 2.4, h: 5.4, ry: 0 }); }
  }
  // container walls hemming the yard in: many at stage 0 (cramped), fewer as the deck is cleared
  const walls = [
    [-30, -8, Math.PI / 2], [-30, -2, Math.PI / 2], [-30, 22, Math.PI / 2], [30, -4, Math.PI / 2], [30, 24, Math.PI / 2], [30, -34, Math.PI / 2],
    [-30, -38, Math.PI / 2], [-24, 42, 0], [24, 41, 0], [-8, 41, 0.05], [13, -56, 0], [-13, -57, 0], [30, 2, Math.PI / 2], [-30, 4, Math.PI / 2],
  ];
  const nW = [14, 9, 6, 4][stage];
  walls.slice(0, nW).forEach(([x, z, ry], i) => {
    const h = stage === 0 ? 1 + (i % 3 === 0) + (i % 5 === 0) : 1 + (i % 4 === 0);
    for (let j = 0; j < h; j++) container(k, x + (j ? 0.15 : 0), z + (j ? 0.3 : 0), ry + j * 0.04, j * 2.6, cKeys[(i + j * 2) % 6], 6);
  });
  // stage 0: a tarp-covered prefab, a forklift, pallets, extra junk piles between features
  if (stage === 0) {
    k.at(-27, 34, 0.3);
    k.box('grime', 6, 2.8, 4, 0, 0, 0); k.gable('tarp2', 6.6, 4.6, 1.4, 0, 2.8, 0);
    k.box('warm', 1.2, 1.4, 0.06, 1.5, 0.4, 2.04); k.at(0, 0);
    // forklift
    k.at(-8, 30, 0.6); k.box('hazard', 1.6, 1.2, 2.4, 0, 0.3, 0); k.box('dark', 1.4, 1.4, 0.15, 0, 1.5, -0.3); for (const x of [-0.5, 0.5]) k.box('steel', 0.1, 2.4, 0.1, x, 0, 1.3);
    k.box('steel', 1.2, 0.08, 1.4, 0, 0.2, 1.9); k.cyl('tire', 0.35, 0.35, 0.3, 0.9, 0, 0.8, 10); k.at(0, 0);
    for (const [x, z, n] of [[10, 34, 9], [24, 30, 7], [-5, -24, 6], [25, -6, 8], [-28, -48, 8], [26, -50, 6], [12, 12, 5]]) {
      for (let i = 0; i < n; i++) k.boxR(['rust', 'grime', 'steel', 'oxide'][i % 4], 0.6 + r() * 1.4, 0.5 + r() * 0.6, 0.6 + r(), x + (r() - 0.5) * 4, 0.3 + r() * 0.4, z + (r() - 0.5) * 3, (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
    }
    for (const [x, z] of [[4, 8], [-8, -10], [14, -34]]) { for (let i = 0; i < 3; i++) k.box('tarp2', 1.3, 0.15, 1.1, x + i * 0.1, i * 0.16, z); }
  }
  // string lights between poles over the yard lanes and fire barrels (stage 0..1: the outpost's lived-in glow)
  if (stage <= 1) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const poles = stage === 0 ? [[-10, 2], [-3, 10], [6, 10], [12, 2], [10, -12], [-9, -12]] : [[-10, 2], [-3, 10], [6, 10], [12, 2]];
    poles.forEach(([x, z]) => k.box('dark', 0.15, 4.6, 0.15, x, 0, z));
    for (let i = 0; i < poles.length - (stage === 0 ? 0 : 1); i++) { const a = poles[i], b = poles[(i + 1) % poles.length]; fx.festoons.push([V(a[0], 4.5, a[1]), V(b[0], 4.5, b[1]), 0.9]); }
    for (const [x, z] of stage === 0 ? [[-14, 24], [9, 32], [-24, -16], [14, -8]] : [[-14, 24], [9, 34]]) {
      k.cyl('rust', 0.45, 0.4, 1.1, x, 0, z, 10); fx.fires.push(new THREE.Vector3(x, 1.1, z)); fx.vents.push(new THREE.Vector3(x, 2.2, z));
      fx.pools.push({ x, z, r: 5, c: 0xff8a30, a: 0.7 });
    }
  }
  // crates + barrels scattered by buildings
  for (let i = 0; i < [16, 18, 22, 26][stage]; i++) {
    const x = PLAT.x0 + 3 + r() * 62, z = PLAT.z0 + 4 + r() * 100;
    if (nearFeature(x, z, 10) || Math.abs(x) < 3) continue;
    if (r() < 0.6) k.box(['orangep', 'steel', 'mustard', 'teal'][r() * 4 | 0], 1.2, 1.2, 1.2, x, 0, z, r() * 3); else k.cyl('rust', 0.45, 0.45, 1.2, x, 0, z, 8);
  }
  // lamp posts along the walkways (more of them as the compound grows)
  const lamps = [[-8, -2], [8, -2], [-4, -16], [4, -16], [-4, 12], [4, 12], [12, -2], [-12, -2], [-4, -30], [4, -30]];
  for (const [x, z] of lamps.slice(0, [4, 8, 10, 10][stage])) {
    k.box('dark', 0.25, 5, 0.25, x, 0, z); k.box('white', 0.9, 0.2, 0.5, x, 5, z);
    fx.pools.push({ x, z, r: 6, c: 0xbfe6ff, a: 0.35 });
  }
  if (stage === 0) for (const [x, z] of [[-10, 18], [12, 30], [8, -12]]) { k.box('dark', 0.2, 6, 0.2, x, 0, z); k.box('warm', 0.8, 0.4, 0.3, x, 6, z + 0.2); fx.pools.push({ x, z: z + 2, r: 6, c: 0xffc080, a: 0.45 }); }
  const featurePool = { hq: 0x4f9dff, story: 0x38e8ff, arena: 0xff4fd8, events: 0xffb547, workshop: 0xff9a3a, squad: 0x5cf2a6, recruit: 0xa77bff };
  for (const [id, col] of Object.entries(featurePool)) {
    const L = LAYOUT[id]; fx.pools.push({ x: L.x, z: L.z + (id === 'recruit' ? 0 : 9), r: id === 'recruit' ? 14 : 11, c: col, a: stage ? 0.4 : 0.22 });
  }
  for (let i = 0; i < 8; i++) fx.pools.push({ x: PLAT.x0 + 4 + r() * 60, z: PLAT.z0 + 6 + r() * 96, r: 5 + r() * 6, c: r() < 0.6 ? 0xff8a3a : 0x38e8ff, a: 0.25 });
  for (const [x, z] of [[-28, -30], [28, -42], [27, 30]]) { k.box('dark', 2.5, 1.4, 2.5, x, 0, z); k.cyl('grime', 0.7, 0.7, 0.1, x, 1.4, z, 12); fx.vents.push(new THREE.Vector3(x, 1.6, z)); }
  fx.searchlights.push(new THREE.Vector3(PLAT.x0 + 2, 1, PLAT.z0 + 2), new THREE.Vector3(PLAT.x1 - 2, 1, PLAT.z0 + 2));
  if (stage >= 1) fx.searchlights.push(new THREE.Vector3(PLAT.x1 - 2, 1, PLAT.z1 - 3));
  if (stage >= 3) fx.searchlights.push(new THREE.Vector3(PLAT.x0 + 2, 1, PLAT.z1 - 3));
  for (const s of fx.searchlights) { k.box('dark', 1.6, 1, 1.6, s.x, 0, s.z); k.cyl('steel', 0.5, 0.6, 1, s.x, 1, s.z, 8); }
}

// skyline: three depth layers of stepped towers behind and around the platform, neon crowns, holo billboards
function buildSkyline(k, ads) {
  const r = rng(77);
  const towers = [];
  for (let i = 0; i < 12; i++) towers.push({ x: (i % 2 ? 1 : -1) * (66 + r() * 50), z: -90 + (i >> 1) * 22 + r() * 10, h: -50 + r() * 50, w: 12 + r() * 12, layer: 0 });
  for (let i = 0; i < 24; i++) { const a = -Math.PI * 0.85 + (i / 24) * Math.PI * 0.7 + (r() - 0.5) * 0.08; const d = 210 + r() * 110; towers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 50, h: -60 + r() * 75, w: 14 + r() * 16, layer: 1 }); }
  for (let i = 0; i < 22; i++) { const a = -Math.PI * 0.9 + (i / 22) * Math.PI * 0.8 + (r() - 0.5) * 0.1; const d = 340 + r() * 220; towers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d - 50, h: 10 + r() * (r() < 0.25 ? 170 : 90), w: 22 + r() * 28, layer: 2 }); }
  const base = -170, neon = ['cyan', 'pink', 'purple', 'blue', 'cyan', 'pink'];
  for (const t of towers) {
    const ry = (r() - 0.5) * 0.5, dd = 0.7 + r() * 0.5;
    k.at(t.x, t.z, ry);
    k.tint = [r(), 0.25 + r() * 0.4, r() < 0.6 ? 0.75 : 0.2];
    // 1..3 setback tiers
    const tiers = t.layer === 0 ? 1 : 1 + (r() * 2.6 | 0);
    let y = base, w = t.w, d = t.w * dd;
    const total = t.h - base;
    for (let i = 0; i < tiers; i++) {
      const h = i === tiers - 1 ? t.h - y : total * (0.55 + r() * 0.15) / (i + 1);
      k.box('facade', w, h, d, 0, y, 0);
      k.box('dark', w + 0.6, 0.8, d + 0.6, 0, y + h - 0.8, 0);
      y += h; if (i < tiers - 1) { w *= 0.68 + r() * 0.12; d *= 0.68 + r() * 0.12; }
    }
    const nk = neon[r() * 6 | 0];
    if (r() < 0.6) { const cw = w * (0.5 + r() * 0.2), ch = 4 + r() * 10; k.box('dark', cw, ch, cw, 0, y, 0); k.rim(nk, cw + 0.3, cw + 0.3, 0, y + ch, 0, 0.5); y += ch; }
    else k.rim(nk, w + 0.3, d + 0.3, 0, y, 0, 0.6);
    if (r() < 0.7) k.box(neon[r() * 6 | 0], 0.5, (t.h - base) * 0.85, 0.5, (r() < 0.5 ? 1 : -1) * t.w / 2, base, t.w * dd / 2);
    if (t.layer >= 1 && r() < 0.55) k.box('dark', 1.0, 18 + r() * 40, 1.0, 0, y, 0);
    k.tint = null; k.at(0, 0);
    if (t.layer >= 1 && r() < 0.4) ads.push({ x: t.x, y: t.h - 14 - r() * 30, z: t.z, off: t.w * dd / 2 + 0.6, w: t.w * 0.8, h: t.w * (0.45 + r() * 0.4), ry, i: ads.length });
  }
}

export function buildCompound({ stage, mats, env, liveBays = false }) {
  const root = new THREE.Group();
  const fx = { beacons: [], vents: [], sparks: [], searchlights: [], pads: [], padTop: 0.3, V: THREE.Vector3, pools: [], signs: [], festoons: [], fires: [], bays: [], banners: [], vipPad: null, liveBays };
  const features = {};
  const S = BSCALE;
  for (const [id, L] of Object.entries(LAYOUT)) {
    // built around the origin then placed + scaled, so the builders stay in a small readable unit space
    const k = new Kit(); const b = { x: 0, z: 0, ry: L.ry }; k.at(0, 0, L.ry);
    const n0 = { b: fx.beacons.length, v: fx.vents.length, s: fx.sparks.length, p: fx.pools.length, bay: fx.bays.length, pad: fx.pads.length };
    const info = BUILDERS[id](k, b, stage, mats.normal, fx);
    const toWorld = (v) => { v.applyAxisAngle(new THREE.Vector3(0, 1, 0), L.ry).multiplyScalar(S); v.x += L.x; v.z += L.z; };
    fx.beacons.slice(n0.b).forEach(toWorld); fx.vents.slice(n0.v).forEach(toWorld); fx.sparks.slice(n0.s).forEach(toWorld);
    fx.pads.slice(n0.pad).forEach(toWorld);
    for (const bay of fx.bays.slice(n0.bay)) { toWorld(bay.pos); bay.pos.y = 0; bay.ry += L.ry; }
    const c = Math.cos(L.ry), s = Math.sin(L.ry);
    for (const p of fx.pools.slice(n0.p)) { const x = p.x * c + p.z * s, z = -p.x * s + p.z * c; p.x = L.x + x * S; p.z = L.z + z * S; p.r *= S; }
    const g = k.build(mats.normal);
    g.name = id;
    for (const d of info.dyn) g.add(d);
    g.position.set(L.x, 0, L.z); g.scale.setScalar(S);
    root.add(g);
    const [sw, sd] = info.size;
    const rad = Math.hypot(sw, sd) / 2 * S;
    features[id] = {
      id, group: g, update: info.update,
      anchor: new THREE.Vector3(L.x, info.anchorY * S, L.z),
      box: new THREE.Box3(new THREE.Vector3(L.x - rad * 0.75, 0, L.z - rad * 0.75), new THREE.Vector3(L.x + rad * 0.75, info.anchorY * S, L.z + rad * 0.75)),
    };
  }
  if (fx.padTop) fx.padTop *= S;
  fx.pads.unshift(new THREE.Vector3(LAYOUT.recruit.x, fx.padTop + 0.05, LAYOUT.recruit.z));

  const sk = new Kit();
  const ground = buildPlatform(sk, stage, env);
  const slab = sk.build(mats.normal);
  const dk = new Kit(); buildDecor(dk, stage, fx);
  const decor = dk.build(mats.normal);
  root.add(ground, slab, decor);
  decor.traverse((o) => o.layers.enable(1));

  const sky = new Kit(); const ads = []; buildSkyline(sky, ads);
  const skyline = sky.build(mats.normal);
  // billboards merged per texture (6 draw calls max)
  const byTex = {};
  for (const a of ads) {
    const g = new THREE.PlaneGeometry(a.w, a.h);
    g.translate(0, 0, a.off); g.rotateY(a.ry); g.translate(a.x, a.y, a.z);
    (byTex[a.i % 6] ||= []).push(g);
  }
  for (const [ki, list] of Object.entries(byTex)) {
    const geo = list.length > 1 ? mergeAll(list) : list[0];
    skyline.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: adTex(+ki), color: new THREE.Color(1.3, 1.3, 1.3), fog: true })));
  }
  root.add(skyline);

  const ct = cityTex(); ct.repeat.set(5, 5);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshBasicMaterial({ map: ct, color: new THREE.Color(1.2, 1.2, 1.3) }));
  city.rotation.x = -Math.PI / 2; city.position.y = -170;
  root.add(city);
  return { root, features, fx, ground, skyline };
}

function mergeAll(list) {
  let n = 0; for (const g of list) n += g.index ? g.index.count : g.attributes.position.count;
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// Feature buildings, one builder per feature id, each with 4 growth stages (0 scrapyard outpost .. 3 flagship).
// Builders add static parts to a Kit (merged per material later) and return {anchorY, size, dyn: [Object3D], update?(t, dt)}.
// Units are local metres before BSCALE; local +z faces the camera.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { holoTex, logoTex, padTex, bladeTex, screenTex } from './textures.js';

function holoPlane(texInfo, height, color, opacity = 0.95) {
  const mat = new THREE.MeshBasicMaterial({ map: texInfo.tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: new THREE.Color(color).multiplyScalar(1.6), fog: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * texInfo.aspect, height), mat);
  m.userData.holo = opacity;
  return m;
}
function decal(tex, size, color = 0xffffff, opacity = 1) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(color).multiplyScalar(1.4) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2; m.userData.holo = opacity; m.userData.noReflect = true;
  return m;
}
function placeDyn(obj, b, x, y, z, ry = 0) {
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  obj.position.set(b.x + x * c + z * s, y, b.z - x * s + z * c);
  obj.rotation.y += ry + b.ry;
  return obj;
}
// a moving part built with the kit (so it shares the merged materials and the locked swap)
function dynKit(mats, fn) { const k = new Kit(); fn(k); return k.build(mats); }
const toW = (fx, x, y, z) => new (fx.V)(x, y, z);
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- reusable pieces ----------
function container(k, x, z, ry, y = 0, key = 'paint', len = 6, doorLight = null) {
  k.sub(x, z, ry, () => {
    k.box(key, len, 2.6, 2.5, 0, 0, 0);
    for (let i = 1; i < 8; i++) k.box(key, 0.08, 2.3, 2.58, -len / 2 + i * len / 8, 0.15, 0);
    k.box('dark', len + 0.1, 0.18, 2.6, 0, 2.5, 0); k.box('dark', len + 0.1, 0.18, 2.6, 0, 0, 0);
    k.box('dark', 0.1, 2.5, 2.4, len / 2 + 0.02, 0.05, 0);
    if (doorLight) k.box(doorLight, 0.06, 0.06, 1.2, len / 2 + 0.1, 2.2, 0);
  }, y);
}
function antenna(k, x, y, z, h, beacons, fx) {
  k.cyl('steel', 0.06, 0.12, h, x, y, z, 6);
  k.box('steel', 0.8, 0.06, 0.06, x, y + h * 0.7, z); k.box('steel', 0.5, 0.06, 0.06, x, y + h * 0.85, z);
  beacons?.push(toW(fx, x, y + h + 0.15, z));
}
function lattice(k, key, x, y, z, w, h, step = 1.6) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(key, 0.16, h, 0.16, x + sx * w / 2, y, z + sz * w / 2);
  for (let yy = step; yy < h; yy += step) {
    k.box(key, w, 0.1, 0.1, x, y + yy, z + w / 2); k.box(key, w, 0.1, 0.1, x, y + yy, z - w / 2);
    k.box(key, 0.1, 0.1, w, x + w / 2, y + yy, z); k.box(key, 0.1, 0.1, w, x - w / 2, y + yy, z);
    k.boxR(key, 0.07, step * 1.25, 0.07, x, y + yy - step / 2, z + w / 2, 0, 0, Math.atan2(w, step) * (yy / step % 2 ? 1 : -1));
  }
}
// AC units / vents laid out in a tidy row with fans on top
function roofUnits(k, w, d, y, fx, n = 3, z = 0) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n;
    k.box('steel', 1.8, 0.9, 1.4, x, y, z); k.cyl('grime', 0.5, 0.5, 0.06, x, y + 0.9, z, 12); k.box('dark', 0.9, 0.04, 0.08, x, y + 0.97, z);
  }
  k.box('dark', w * 0.85, 0.22, 0.22, 0, y + 0.1, z - 1.3);
  fx.vents.push(toW(fx, -w / 2 + w / n / 2, y + 1.1, z));
}
function floodlight(k, x, z, h, fx, key = 'warm') {
  k.box('dark', 0.18, h, 0.18, x, 0, z); k.box('dark', 1.2, 0.12, 0.12, x, h, z);
  k.box(key, 0.42, 0.28, 0.2, x - 0.4, h + 0.1, z + 0.1); k.box(key, 0.42, 0.28, 0.2, x + 0.4, h + 0.1, z + 0.1);
  fx.pools.push({ x, z: z + 3, r: h * 0.9, c: 0xffc890, a: 0.35 });
}
function barrels(k, x, z, n, seed = 1, key = 'rust') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) k.cyl(i % 3 === 2 ? 'paint' : key, 0.4, 0.4, 1.1, x + (i % 3) * 0.85 + r() * 0.1, 0, z + (i / 3 | 0) * 0.85, 10);
}
function junk(k, x, z, rad, n, seed) {
  const r = rng(seed), keys = ['rust', 'grime', 'steel', 'rust', 'oxide', 'tire'];
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * rad, s = 0.5 + r() * 1.3 * (1 - d / rad * 0.6), key = keys[r() * keys.length | 0];
    if (key === 'tire') k.add('tire', new THREE.TorusGeometry(0.55, 0.22, 6, 12), x + Math.cos(a) * d, 0.25 + r() * 0.6, z + Math.sin(a) * d, Math.PI / 2 + (r() - 0.5) * 0.8, r() * 3, 0);
    else k.boxR(key, s * (1 + r()), s * 0.55, s, x + Math.cos(a) * d, s * 0.25 + (1 - d / rad) * 0.5, z + Math.sin(a) * d, (r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
  }
}
function fence(k, pts, h = 1.8, key = 'steel') {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / 2.5));
    for (let j = 0; j <= n; j++) k.box(key, 0.1, h, 0.1, x0 + (x1 - x0) * j / n, 0, z0 + (z1 - z0) * j / n);
    for (const y of [h * 0.5, h]) k.box(key, 0.05, 0.05, L, (x0 + x1) / 2, y, (z0 + z1) / 2, a);
  }
}
// a tarp stretched over arched ribs (open at +z)
function tarpShelter(k, w, len, h, key = 'tarp', x = 0, z = 0) {
  const g = new THREE.CylinderGeometry(w / 2, w / 2, len, 14, 1, true, -Math.PI / 2, Math.PI);
  g.scale(1, 1, h / (w / 2));
  k.add(key, g, x, 0, z, -Math.PI / 2, 0, 0);
  for (let i = 0; i <= 3; i++) k.add('dark', new THREE.TorusGeometry(w / 2 + 0.03, 0.07, 4, 14, Math.PI).scale(1, h / (w / 2), 1), x, 0, z - len / 2 + i * len / 3, 0, 0, 0);
}
// chunky mech silhouette (~4.3 m * s), optionally stripped for repair
function mech(k, x, z, ry, s = 1, key = 'dark', stripped = false, y = 0) {
  k.sub(x, z, ry, () => {
    const B = (kk, w, h, d, px, py, pz, rx = 0, rz = 0) => k.boxR(kk, w * s, h * s, d * s, px * s, py * s, pz * s, rx, 0, rz);
    for (const sx of [-1, 1]) {
      B(key, 0.8, 0.35, 1.2, sx * 0.75, 0.18, 0.1);           // foot
      B(key, 0.55, 1.3, 0.6, sx * 0.75, 0.95, 0, -0.12);      // shin
      B(key, 0.65, 1.1, 0.7, sx * 0.7, 2.0, -0.08, 0.2);      // thigh
      B(key, 0.9, 0.9, 1.0, sx * 1.35, 3.45, 0);              // shoulder
      if (!(stripped && sx > 0)) B(key, 0.45, 1.3, 0.5, sx * 1.45, 2.5, 0.15, -0.3); // arm
    }
    B(key, 1.5, 0.5, 0.9, 0, 2.6, 0);                         // pelvis
    B(key, 1.9, 1.3, 1.3, 0, 3.4, 0);                         // chest
    B(stripped ? 'rust' : key, 0.8, 0.55, 0.8, 0, 4.25, 0.1); // head
    k.box(stripped ? 'amber' : 'cyan', 0.55 * s, 0.1 * s, 0.05 * s, 0, 4.2 * s, 0.52 * s);
    if (!stripped) k.cylR('steel', 0.18 * s, 1.6 * s, -1.45 * s, 2.2 * s, 0.7 * s, Math.PI / 2 - 0.3, 0, 0, 8);
    else B('steel', 0.3, 0.3, 1.2, 1.3, 3.2, 0.4);
  }, y);
}
// tilt-rotor VTOL facing +z (~9 m long), nacelles vertical
function vtol(k, key = 'navy', lights = true, stripe = null) {
  k.box(key, 2.0, 1.4, 6.5, 0, 0.9, 0); k.boxR(key, 1.7, 1.0, 1.8, 0, 1.6, 3.8, 0.35, 0, 0);
  if (stripe) { k.box(stripe, 2.04, 0.3, 4.2, 0, 1.5, -0.2); for (const sx of [-1, 1]) k.box(stripe, 1.6, 0.27, 0.5, sx * 2.6, 1.72, -1.1); k.box(stripe, 0.16, 0.6, 1.0, 0, 2.6, -5.4); }
  k.boxR('glass', 1.5, 0.6, 1.4, 0, 2.15, 2.9, 0.4, 0, 0);
  k.boxR(key, 1.3, 0.9, 3.2, 0, 1.75, -4.4, -0.15, 0, 0);
  for (const sx of [-1, 1]) {
    k.box(key, 3.2, 0.25, 1.6, sx * 2.6, 1.7, -0.6);
    k.cyl('steel', 0.55, 0.6, 1.9, sx * 4.3, 1.0, -0.6, 12);
    k.cyl('dark', 0.35, 0.35, 0.5, sx * 4.3, 2.9, -0.6, 10);
    k.boxR(key, 0.12, 1.4, 1.0, sx * 0.6, 2.6, -5.5, 0, 0, sx * 0.35);
    k.box('dark', 0.25, 0.9, 0.25, sx * 0.7, 0, 1.2); k.box('dark', 0.25, 0.9, 0.25, sx * 0.7, 0, -2.2);
    if (lights) k.box(sx < 0 ? 'red' : 'green', 0.15, 0.15, 0.15, sx * 4.9, 1.9, -0.6);
  }
  if (lights) { k.box('cyan', 2.02, 0.08, 4, 0, 1.35, 0); k.box('orange', 0.08, 0.08, 2.5, 0, 2.37, -4.2); }
}
function rotor(mats, r = 1.9) {
  return dynKit(mats, (q) => { for (let i = 0; i < 3; i++) q.boxR('dark', r * 2, 0.04, 0.22, 0, 0, 0, 0, i * Math.PI / 3, 0); q.cyl('steel', 0.2, 0.2, 0.2, 0, -0.1, 0, 8); });
}
function dishPart(mats, r = 2.2) {
  return dynKit(mats, (q) => {
    q.add('light', new THREE.CylinderGeometry(r, r * 0.25, r * 0.35, 18, 1), 0, 0.7, 0, 0.75, 0, 0); q.add('cyan', new THREE.TorusGeometry(r, 0.06, 4, 24), 0, 0.7, 0, Math.PI / 2 + 0.75, 0, 0);
    q.cylR('steel', 0.06, r * 0.9, 0, 0.9, r * 0.35, Math.PI / 2 - 0.6, 0, 0, 5);
    q.box('cyan', 0.16, 0.16, 0.16, 0, 1.1, r * 0.7);
    q.cyl('steel', 0.35, 0.5, 0.9, 0, -0.9, 0, 10); q.box('dark', 0.8, 0.5, 0.6, 0, -0.1, 0);
  });
}
// holo map table: round table + projected cone + a slowly spinning terrain hologram
// the table itself goes into the building's static kit (it never moves); only the holograms are separate meshes
function holoTable(k, x, y, z, r = 1.4, color = '#38e8ff') {
  const g = new THREE.Group();
  k.cyl('dark', r, r * 0.8, 0.9, x, y, z, 20); k.torus('cyan', r, 0.06, x, y + 0.92, z, Math.PI / 2, 24);
  const map = holoPlane({ tex: padTex(color, ''), aspect: 1 }, r * 2.1, color, 0.9);
  map.rotation.x = -Math.PI / 2; map.position.y = 1.25; map.userData.noReflect = true; g.add(map);
  const map2 = holoPlane({ tex: logoTex(color), aspect: 1 }, r * 1.1, color, 0.8);
  map2.position.y = 1.9; g.add(map2);
  g.userData.spin = (t) => { map.rotation.z = t * 0.4; map2.rotation.y = t * 0.8; map2.position.y = 1.9 + Math.sin(t * 1.4) * 0.12; };
  return g;
}
// warm light pouring out of an opening (an emissive back plane the silhouettes stand against)
function glowWall(k, w, h, x, y, z, ry = 0, key = 'bay') { k.panel(key === 'warm' ? 'bay' : key === 'pink' ? 'baypink' : key, w, h, x, y, z, ry, 0); }

export const BUILDERS = {
  // ======================= HQ: company tower + NIGHTSHIFT sign =======================
  hq(k, b, st, mats, fx) {
    const dyn = [];
    let flicker = null, top;
    if (st === 0) {
      // two stacked portacabins, external stair, a rooftop scaffold carrying a flickering neon sign
      k.box('concrete', 10, 0.4, 7, 0, 0, 0);
      k.box('white_p', 8, 2.8, 3.2, -0.6, 0.4, 0.6); k.box('dark', 8.2, 0.2, 3.4, -0.6, 3.2, 0.6);
      k.panel('win', 5.5, 1.1, -0.6, 1.5, 2.22, 0, 1.4);
      k.box('white_p', 6.5, 2.6, 3, 0.2, 3.4, -0.2, 0.06); k.box('dark', 6.7, 0.2, 3.2, 0.2, 6, -0.2, 0.06);
      k.panel('winmix', 4, 0.9, 0.3, 4.5, 1.32, 0.06, 1.4);
      for (let i = 0; i < 6; i++) k.box('steel', 1.2, 0.12, 0.6, 4.3, 0.5 + i * 0.5, 2.2 - i * 0.45);
      k.box('steel', 0.1, 3.2, 0.1, 4.9, 0.4, 2.2);
      lattice(k, 'steel', -1.2, 6.2, -0.4, 1.0, 2.0, 1.0); lattice(k, 'steel', 2.2, 6.2, -0.4, 1.0, 2.0, 1.0);
      k.box('dark', 7.4, 0.25, 0.4, 0.5, 8.2, -0.4);
      antenna(k, 3.4, 6.2, -1.2, 4.5, fx.beacons, fx);
      k.box('steel', 1.4, 0.9, 1.2, -3, 6.2, -1);
      fx.vents.push(toW(fx, -3, 7.2, -1));
      const sign = holoPlane(holoTex('NIGHTSHIFT', '#4f9dff', { sub: '', w: 512, h: 120, frame: false }), 2.1, '#8fc4ff', 1);
      dyn.push(placeDyn(sign, b, 0.5, 9.4, -0.2));
      flicker = sign;
      fx.pools.push({ x: -0.6, z: 4.5, r: 5, c: 0xffc890, a: 0.4 });
      top = 9.5;
      return {
        anchorY: top + 2.5, size: [10, 7], dyn,
        update(t) { const u = t % 8.3, off = (u > 6.9 && u < 7.5 && Math.sin(t * 57) < 0.1) || (u > 7.9 && u < 8.0); flicker.material.opacity = flicker.userData.holo * (off ? 0.12 : 1); },
      };
    }
    // podium + shaft with setbacks; tiers [w, h, d]
    const tiers = st === 1 ? [[12, 4.5, 9], [9, 5, 7]] : st === 2 ? [[14, 5, 11], [9, 14, 8], [7, 4, 6]] : [[16, 5.5, 12], [10, 18, 9], [8, 7, 7], [5, 3.5, 5]];
    let y = 0;
    tiers.forEach(([w, h, d], i) => {
      k.box(i === 0 ? 'light' : 'navy', w, h, d, 0, y, 0);
      // floor-banded interior-lit windows with mullion strips between, cool upper office floors
      k.bands(i === 0 ? 'win' : (i % 2 ? 'wincool' : 'winmix'), w, d, y + (i === 0 ? 1.2 : 0.4), y + h - 0.5, 2.4);
      k.box('dark', w + 0.4, 0.35, d + 0.4, 0, y + h - 0.35, 0);
      if (i > 0) k.edges('blue', w + 0.25, d + 0.25, y, h, 0.12, true);
      k.rim(i === tiers.length - 1 ? 'cyan' : 'blue', w + 0.4, d + 0.4, 0, y + h, 0, 0.14);
      y += h;
    });
    // entrance canopy + lobby glow
    const d0 = tiers[0][2];
    k.box('dark', 6, 0.35, 2.6, 0, 3.0, d0 / 2 + 1.2); k.box('cyan', 6, 0.1, 0.1, 0, 3.0, d0 / 2 + 2.5);
    glowWall(k, 4, 2.6, 0, 0.2, d0 / 2 + 0.06, 0, 'warm');
    fx.pools.push({ x: 0, z: d0 / 2 + 4, r: 7, c: 0xffd0a0, a: 0.5 });
    // vertical NIGHTSHIFT blade sign hung off the shaft front corner
    const [w1, h1, dd1] = tiers[1];
    const bladeH = Math.min(h1 * 0.92, 15);
    k.box('dark', 0.25, bladeH + 0.6, 0.25, w1 / 2 - 0.6, tiers[0][1] + (h1 - bladeH) / 2 - 0.3, dd1 / 2 + 0.9);
    const blade = holoPlane({ tex: bladeTex('NIGHTSHIFT', '#4f9dff').tex, aspect: bladeTex('NIGHTSHIFT', '#4f9dff').aspect }, bladeH, '#6fb0ff', 1);
    blade.material.blending = THREE.NormalBlending; blade.material.color.setScalar(1.5); blade.userData.reflect = true;
    dyn.push(placeDyn(blade, b, w1 / 2 - 0.6, tiers[0][1] + h1 / 2, dd1 / 2 + 1.06));
    roofUnits(k, tiers[0][0] * 0.6, 2, tiers[0][1], fx, 3, -tiers[0][2] / 2 + 1.2);
    top = y;
    if (st === 1) {
      antenna(k, 2.5, y, -1.5, 5, fx.beacons, fx);
      const sign = holoPlane(holoTex('NIGHTSHIFT', '#4f9dff', { sub: 'CONTRACTING', w: 512, h: 150 }), 2.4, '#4f9dff');
      dyn.push(placeDyn(sign, b, -0.5, y + 1.6, 1.5));
      k.box('dark', 8, 0.25, 0.3, -0.5, y + 0.2, 1.5); for (const x of [-3.5, 2.5]) k.box('steel', 0.15, 1.2, 0.15, x, y, 1.5);
      return { anchorY: y + 3.2, size: [12, 9], dyn };
    }
    // crown: spire + rotating holo ring + logo
    antenna(k, 0, y, 0, st === 3 ? 13 : 8, fx.beacons, fx);
    antenna(k, 1.8, y, 1.2, 3, fx.beacons, fx);
    const ringG = dynKit(mats, (q) => { q.torus('blue', st === 3 ? 6.5 : 5.2, 0.12, 0, 0, 0, Math.PI / 2, 48); q.torus('cyan', st === 3 ? 7.1 : 5.7, 0.06, 0, 0, 0, Math.PI / 2, 48); });
    const ry0 = y - tiers[tiers.length - 1][1] * 0.5;
    dyn.push(placeDyn(ringG, b, 0, ry0, 0));
    const logo = holoPlane({ tex: logoTex('#4f9dff'), aspect: 1 }, st === 3 ? 6 : 4.5, '#4f9dff', 0.9);
    dyn.push(placeDyn(logo, b, 0, y + (st === 3 ? 4.2 : 3), 0));
    return {
      anchorY: y * 0.66, size: [tiers[0][0], tiers[0][2]], dyn,
      update(t) { ringG.rotation.y = t * 0.25; ringG.position.y = ry0 + Math.sin(t * 0.8) * 0.4; logo.rotation.y = t * 0.6; },
    };
  },

  // ======================= OPERATIONS: mission-command tower, dish, holo table =======================
  story(k, b, st, mats, fx) {
    const dyn = [];
    let top, dishY, dishX, dishZ, dishR, table;
    if (st === 0) {
      // two stacked containers turned into an ops shack, awning over a field holo table
      container(k, 0, 0, 0, 0, 'teal', 6, 'cyan'); container(k, 0.5, -0.2, 0.06, 2.6, 'orangep');
      k.panel('wincool', 3.2, 1.0, 0.5, 3.4, 1.1, 0.06, 1.2);
      k.box('cyan', 5.6, 0.1, 0.1, 0.5, 5.15, 1.1);
      k.box('tarp2', 5.5, 0.1, 3.4, -0.4, 2.7, 3.0, 0); for (const x of [-3, 2.2]) k.box('steel', 0.1, 2.7, 0.1, x, 0, 4.6);
      k.box('steel', 1.4, 1.0, 1.0, 3.6, 0, 2.6); k.box('green', 0.3, 0.1, 0.05, 3.6, 0.7, 3.12);
      antenna(k, -2.4, 5.2, -0.6, 4.5, fx.beacons, fx); antenna(k, 2.6, 5.2, -0.8, 2.6, fx.beacons, fx);
      for (let i = 0; i < 4; i++) k.cylR('tire', 0.05, 2.2, -2.4 + i * 0.3, 1.5 + i * 0.25, -1.2, 0.3, 0, 1.2, 4);
      table = holoTable(k, -0.4, 0, 3.0, 0.9); dyn.push(placeDyn(table, b, -0.4, 0, 3.0));
      dishX = 1.5; dishY = 5.6; dishZ = -0.3; dishR = 1.3; top = 6.5;
      fx.pools.push({ x: -0.4, z: 3.2, r: 4, c: 0x38e8ff, a: 0.5 });
    } else {
      // command block, a square shaft and a flared control cab with slanted glass; holo table on the front terrace
      const W = st === 1 ? 11 : 13, D = st === 1 ? 8 : 9.5, H = st === 1 ? 4.2 : 5;
      k.box('light', W, H, D, 0, 0, 0);
      k.bands('wincool', W, D, 0.9, H - 0.4, 2.2);
      k.box('dark', W + 0.4, 0.4, D + 0.4, 0, H, 0); k.rim('cyan', W + 0.4, D + 0.4, 0, H + 0.4, 0, 0.14);
      const S = st === 1 ? 4 : st === 2 ? 4.6 : 5.2, SH = st === 1 ? 5 : st === 2 ? 10 : 14, sx = -W / 2 + S / 2 + 1, sz = -D / 2 + S / 2 + 0.8;
      // octagonal shaft with lit strips, flared octagonal control cab wrapped in a band of lit glass
      k.cyl('navy', S * 0.5, S * 0.6, SH, sx, H + 0.4, sz, 8);
      for (const f of [0.35, 0.7]) { const bg = new THREE.CylinderGeometry(S * 0.5 + 0.06 + (1 - f) * S * 0.1 * 0, S * 0.5 + 0.06 + S * 0.1 * 0.3, 1.1, 8, 1, true); const u2 = bg.attributes.uv; for (let j = 0; j < u2.count; j++) u2.setX(j, u2.getX(j) * 4); k.add('wincool', bg, sx, H + 0.4 + SH * f, sz); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 8; k.box('cyan', 0.12, SH - 0.6, 0.12, sx + Math.sin(a) * S * 0.56, H + 0.6, sz + Math.cos(a) * S * 0.56); }
      const cy = H + 0.4 + SH, cw = S + 2.4, cr = cw * 0.62;
      k.cyl('dark', cr * 0.8, S * 0.5, 1.2, sx, cy - 1.2, sz, 8);
      const band = new THREE.CylinderGeometry(cr + 0.05, cr * 0.82, 2.0, 8, 1, true);
      const bu = band.attributes.uv; for (let j = 0; j < bu.count; j++) bu.setX(j, bu.getX(j) * 6);
      k.add('wincool', band, sx, cy + 1.0, sz);
      k.cyl('navy', cr * 0.82, cr * 0.82, 0.3, sx, cy, sz, 8);
      k.cyl('navy', cr + 0.5, cr + 0.3, 0.5, sx, cy + 2.0, sz, 8); k.torus('cyan', cr + 0.5, 0.1, sx, cy + 2.5, sz, Math.PI / 2, 8);
      k.torus('cyan', cr * 0.84, 0.07, sx, cy + 0.2, sz, Math.PI / 2, 8);
      k.cyl('steel', 0.7, 0.9, 1.2, sx, cy + 2.5, sz, 8);
      antenna(k, sx - 1.2, cy + 2.75, sz - 1, st === 3 ? 7 : 4.5, fx.beacons, fx); antenna(k, sx + 1.3, cy + 2.75, sz - 1.2, 3, fx.beacons, fx);
      dishX = sx; dishY = cy + 5.0; dishZ = sz; dishR = st === 1 ? 1.8 : 2.2;
      if (st >= 2) { // second dish on the block roof, comms array
        const d2 = dishPart(mats, 1.6); dyn.push(placeDyn(d2, b, W / 2 - 2, H + 1.4, -D / 2 + 2)); d2.userData.sp = -0.35;
        for (let i = 0; i < 3; i++) antenna(k, W / 2 - 1 - i * 1.2, H + 0.4, D / 2 - 1.5, 2 + i, fx.beacons, fx);
      }
      roofUnits(k, W * 0.35, 2, H + 0.4, fx, 2, -D / 2 + 1.6);
      // terrace holo table
      table = holoTable(k, W / 2 - 3.2, H + 0.4, D / 2 - 2.8, st === 1 ? 1.6 : 2.0); dyn.push(placeDyn(table, b, W / 2 - 3.2, H + 0.4, D / 2 - 2.8));
      fx.pools.push({ x: 0, z: D / 2 + 3.5, r: 7, c: 0x38e8ff, a: 0.45 });
      top = cy + 4;
    }
    const dish = dishPart(mats, dishR * 1.1);
    dyn.push(placeDyn(dish, b, dishX, dishY, dishZ));
    const extra = dyn.filter((d) => d.userData.sp);
    return {
      anchorY: top + 1.5, size: st === 0 ? [7, 6] : [12, 9], dyn,
      update(t) { dish.rotation.y = b.ry + Math.sin(t * 0.25) * 1.2; for (const e of extra) e.rotation.y = b.ry + t * e.userData.sp; table.userData.spin(t); },
    };
  },

  // ======================= ARENA: dome, light ring, big screen =======================
  arena(k, b, st, mats, fx) {
    const dyn = [];
    if (st === 0) {
      // a fight ring of tyres and cage posts in an empty lot, one floodlight, a dead screen on a scaffold
      k.box('concrete', 14, 0.15, 14, 0, 0, 0);
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; k.add('tire', new THREE.TorusGeometry(0.6, 0.25, 6, 12), Math.cos(a) * 4.2, 0.4, Math.sin(a) * 4.2, Math.PI / 2, 0, 0); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box('steel', 0.14, 2.6, 0.14, Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4); }
      k.torus('steel', 5.4, 0.05, 0, 2.6, 0, Math.PI / 2, 24);
      lattice(k, 'rust', -4, 0, -5.5, 1.2, 5, 1.25); k.box('grime', 5, 2.8, 0.25, -4, 5, -5.5); k.panel('windim', 4.4, 2.2, -4, 5.3, -5.35, 0, 1.1, 2.2);
      floodlight(k, 5.5, -4.5, 6.5, fx);
      barrels(k, 4, 3.5, 5, 3);
      const sign = holoPlane(holoTex('ARENA', '#ff4fd8', { sub: 'COMING SOON', w: 384, h: 150 }), 1.8, '#ff4fd8', 0.85);
      dyn.push(placeDyn(sign, b, 0, 2.6, 0));
      return { anchorY: 8, size: [12, 12], dyn };
    }
    const screen = (w, x, y, z) => {
      k.box('dark', w + 0.5, w * 0.56 + 0.5, 0.4, x, y - 0.25, z - 0.2);
      k.rim('pink', w + 0.5, 0.4, x, y + w * 0.56 + 0.25, z - 0.2, 0.1);
      const s = holoPlane({ tex: screenTex().tex, aspect: screenTex().aspect }, w * 0.56, '#ffffff', 1);
      s.material.blending = THREE.NormalBlending; s.material.color.setScalar(1.25); s.userData.reflect = true;
      dyn.push(placeDyn(s, b, x, y + w * 0.28, z + 0.02));
      return s;
    };
    if (st === 1) {
      // open sparring pit with tiered stands, four light masts and a big screen
      k.cyl('dark', 7.5, 8, 1, 0, 0, 0, 28);
      k.torus('pink', 7.6, 0.1, 0, 1.02, 0, Math.PI / 2, 48);
      const pad = decal(padTex('#ff4fd8'), 12, 0xffffff, 0.9); dyn.push(placeDyn(pad, b, 0, 1.05, 0));
      for (let i = 0; i < 3; i++) { k.add('steel', new THREE.CylinderGeometry(9 + i * 1.3, 9 + i * 1.3, 0.8, 28, 1, true, Math.PI * 0.75, Math.PI * 1.5), 0, 0.4 + i * 0.8, 0); }
      k.torus('pink', 12, 0.08, 0, 3.3, 0, Math.PI / 2, 40, Math.PI * 1.5, -Math.PI * 0.25);
      for (const [x, z] of [[-9, -8], [9, -8], [-9, 8], [9, 8]]) { k.box('dark', 0.35, 9, 0.35, x, 0, z); k.box('white', 1.8, 0.5, 0.6, x, 9, z); fx.beacons.push(toW(fx, x, 9.8, z)); }
      lattice(k, 'dark', 0, 0, -11.5, 1.2, 4, 1.3);
      screen(8, 0, 4, -11);
      return { anchorY: 10, size: [16, 20], dyn };
    }
    // dome on a drum, rib arcs, a pink light ring at the eave and an orbiting ring, big screen over the gate
    const R = st === 2 ? 8 : 9.5;
    k.cyl('light', R + 0.6, R + 1.2, 2.6, 0, 0, 0, 36);
    k.panel('win', 6, 1, -R * 0.6, 0.8, R + 0.95, 0.6, 1.0, 1);
    k.torus('pink', R + 0.75, 0.14, 0, 2.6, 0, Math.PI / 2, 48);
    k.torus('pink', R + 1.25, 0.08, 0, 0.6, 0, Math.PI / 2, 48);
    k.add('glass', new THREE.SphereGeometry(R, 36, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.6, 0);
    for (let i = 0; i < 12; i++) k.add(i % 3 ? 'navy' : 'pink', new THREE.TorusGeometry(R + 0.05, i % 3 ? 0.14 : 0.08, 4, 24, Math.PI / 2), 0, 2.6, 0, 0, i / 12 * Math.PI * 2, 0);
    k.torus('navy', R * 0.72, 0.18, 0, 2.6 + R * 0.69, 0, Math.PI / 2, 32); k.torus('purple', R * 0.72, 0.07, 0, 2.8 + R * 0.69, 0, Math.PI / 2, 32);
    k.cyl('navy', 2, 2.6, 1.4, 0, 2.4 + R, 0, 16); k.torus('pink', 2.1, 0.08, 0, 3.8 + R, 0, Math.PI / 2, 20);
    fx.beacons.push(toW(fx, 0, 4.4 + R, 0));
    // gate block + screen
    k.box('navy', 7, 5.5, 3.2, 0, 0, R + 0.4); k.box('pink', 5, 0.14, 0.14, 0, 5.5, R + 2.05); glowWall(k, 3.6, 3, 0, 0.3, R + 2.04, 0, 'pink');
    screen(st === 3 ? 7 : 6, 0, 6.2, R + 1.6);
    fx.pools.push({ x: 0, z: R + 6, r: 8, c: 0xff4fd8, a: 0.6 });
    const inner = decal(padTex('#ff4fd8'), R * 1.4, 0xffffff, 0.7); dyn.push(placeDyn(inner, b, 0, 2.7, 0));
    const orbit = dynKit(mats, (q) => { q.torus('pink', R + 2.2, 0.07, 0, 0, 0, Math.PI / 2, 56); for (let i = 0; i < 4; i++) q.box('white', 0.5, 0.25, 0.5, Math.cos(i * 1.57) * (R + 2.2), 0, Math.sin(i * 1.57) * (R + 2.2)); });
    dyn.push(placeDyn(orbit, b, 0, R * 0.5, 0)); orbit.rotation.x = 0.12;
    if (st === 3) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; k.box('dark', 0.5, 13, 0.5, Math.cos(a) * (R + 3.5), 0, Math.sin(a) * (R + 3.5)); k.box('white', 1.2, 0.5, 0.5, Math.cos(a) * (R + 3.5), 13, Math.sin(a) * (R + 3.5)); fx.beacons.push(toW(fx, Math.cos(a) * (R + 3.5), 13.8, Math.sin(a) * (R + 3.5))); }
    return { anchorY: R + 5, size: [R * 2, R * 2], dyn, update(t) { inner.rotation.z = t * 0.3; orbit.rotation.y = b.ry + t * 0.15; orbit.position.y = R * 0.68 + Math.sin(t * 0.5) * 0.6; } };
  },

  // ======================= SPECIAL OPS: hangar with a VTOL =======================
  events(k, b, st, mats, fx) {
    const dyn = [];
    if (st === 0) {
      // bare hangar frame half under tarp, a VTOL hulk under a tarp, an orange beacon
      for (let i = 0; i < 4; i++) k.add('rust', new THREE.TorusGeometry(5, 0.14, 4, 16, Math.PI), 0, 0, -4 + i * 2.6, 0, 0, 0);
      for (const sx of [-1, 1]) k.box('rust', 0.12, 0.12, 7.8, sx * 3.5, 3.6, -0.1);
      tarpShelter(k, 10, 5.2, 5, 'tarp', 0, -2.7);
      k.sub(0, 1, 0, () => { k.box('tarp2', 2.4, 1.6, 7, 0, 0.3, 0); k.box('tarp2', 8.6, 0.5, 1.8, 0, 1.4, -0.4); k.boxR('tarp2', 1.6, 1.0, 2.2, 0, 1.4, -3.4, -0.2, 0, 0); });
      barrels(k, 4.2, 3, 4, 7, 'paint'); junk(k, -5.5, 3, 2.2, 8, 13);
      antenna(k, 5, 0, -3.5, 7, fx.beacons, fx);
      const sign = holoPlane(holoTex('SPECIAL OPS', '#ffb547', { sub: 'OFFLINE', w: 512, h: 160 }), 1.6, '#ffb547', 0.85);
      dyn.push(placeDyn(sign, b, 0, 6, 0.5));
      return { anchorY: 7.5, size: [10, 9], dyn };
    }
    // low wide hangar with an arched roof, lit open bay, VTOL on the apron pad, comms mast + mission board
    const L = st === 1 ? 10 : 12, W = st === 1 ? 11 : 13, H = st === 1 ? 4 : 4.8;
    k.box('navy', W, H, L, 0, 0, -3);
    const roofG = new THREE.CylinderGeometry(W / 2, W / 2, L, 18, 1, false, -Math.PI / 2, Math.PI); roofG.scale(1, 1, 0.45);
    k.add('navy', roofG, 0, H, -3, -Math.PI / 2, 0, 0);
    for (const a2 of [-0.5, 0, 0.5]) { const yy = H + Math.cos(a2) * W * 0.225, xx = Math.sin(a2) * W / 2; k.box(a2 ? 'amber' : 'orange', 0.14, 0.14, L * 0.96, xx, yy, -3); }
    for (let i = 0; i < 4; i++) k.box('win', 1.4, 0.1, 1.6, (i % 2 ? 1 : -1) * W * 0.18, H + W * 0.205, -3 - L / 2 + 1.6 + i * (L - 3) / 3);
    for (let i = 0; i <= 4; i++) k.add('dark', new THREE.TorusGeometry(W / 2 + 0.04, 0.1, 4, 18, Math.PI).scale(1, 0.45, 1), 0, H, -3 - L / 2 + i * L / 4, 0, 0, 0);
    glowWall(k, W * 0.75, H * 0.85, 0, 0, -3 + L / 2 + 0.06, 0, 'warm');
    k.box('hazard', W, 0.4, 0.3, 0, H - 0.4, -3 + L / 2 + 0.1); k.box('orange', W * 0.8, 0.1, 0.1, 0, H - 0.5, -3 + L / 2 + 0.3);
    k.edges('orange', W + 0.1, L + 0.1, 0, H, 0.12, true);
    for (let i = 0; i < 5; i++) k.box(i % 2 ? 'orange' : 'white', 0.4, 0.15, 0.4, -W / 2 + 1 + i * (W - 2) / 4, H + 0.05, -3 + L / 2 - 0.4);
    // apron pad
    k.cyl('dark', 5.2, 5.4, 0.2, 0, 0, 6.5, 28); k.torus('orange', 5.25, 0.08, 0, 0.22, 6.5, Math.PI / 2, 40);
    const pad = decal(padTex('#ffb547', 'S'), 9.4, 0xffffff, 0.75); dyn.push(placeDyn(pad, b, 0, 0.24, 6.5));
    // VTOL on the pad (bobbing on idle with spinning rotors from stage 2)
    // light hull + hazard stripes + engine glow so the craft reads at phone size against the dark hangar
    const craft = dynKit(mats, (q) => { vtol(q, 'light', true, 'hazard'); for (const sx of [-1, 1]) q.cyl('amber', 0.5, 0.5, 0.05, sx * 4.3, 0.98, -0.6, 12); q.box('cyan', 1.4, 0.06, 0.06, 0, 2.47, 2.6); });
    craft.scale.setScalar(1.25);
    dyn.push(placeDyn(craft, b, 0, 0.2, 6.5, 0.4));
    const rotors = [];
    for (const sx of [-1, 1]) { const r = rotor(mats, 1.9); r.position.set(sx * 4.3, 3.35, -0.6); craft.add(r); rotors.push(r); }
    // comms mast + mission board
    lattice(k, 'dark', W / 2 + 1.5, 0, -6, 1.2, st === 3 ? 14 : 10, 1.4);
    antenna(k, W / 2 + 1.5, st === 3 ? 14 : 10, -6, 3, fx.beacons, fx);
    k.box('dark', 5.6, 3, 0.35, -W / 2 + 1.8, H + 1.2, -6, 0.3); for (const x of [-W / 2 + 0.2, -W / 2 + 3.4]) k.box('steel', 0.2, 1.4, 0.2, x, H, -6.4);
    const board = holoPlane(holoTex('SPECIAL OPS', '#ffb547', { sub: st >= 2 ? 'WEEKLY RAID LIVE' : 'DAILY OPS', w: 512, h: 220 }), 2.6, '#ffb547', 0.95);
    dyn.push(placeDyn(board, b, -W / 2 + 1.8, H + 2.7, -5.75, 0.3));
    fx.pools.push({ x: 0, z: L / 2 - 1, r: 7, c: 0xffb070, a: 0.5 }, { x: 0, z: 6.5, r: 6, c: 0xffb547, a: 0.35 });
    roofUnits(k, W * 0.5, 2, H + W * 0.22, fx, 2, -5);
    const live = st >= 2;
    return {
      anchorY: H + 7, size: [W, L + 6], dyn,
      update(t, dt) {
        for (const r of rotors) r.rotation.y += dt * (live ? 18 : 0.4);
        craft.position.y = live ? 0.2 + Math.max(0, Math.sin(t * 0.18)) * 3.5 + Math.sin(t * 1.7) * 0.08 : 0.2;
        board.material.opacity = 0.85 + Math.sin(t * 9) * 0.04 + (Math.sin(t * 0.7) > 0.97 ? -0.4 : 0);
      },
    };
  },

  // ======================= WORKSHOP: crane, sparks, gantry =======================
  workshop(k, b, st, mats, fx) {
    const dyn = [];
    if (st === 0) {
      // the old mech under repair in an open scaffold, an A-frame hoist, work lights, a tarp lean-to and junk
      k.box('concrete', 12, 0.12, 9, 0, 0, 0);
      mech(k, 0, 0.5, 0.2, 1.05, 'mustard', true, 0.12);
      k.box('dark', 0.12, 6.4, 0.12, 2.9, 0, 3.2); k.boxR('white', 0.8, 0.35, 0.5, 2.4, 6.3, 2.8, 0.6, 0.6, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('hazard', 0.14, 5.6, 0.14, sx * 2.4, 0, sz * 1.8 + 0.5);
      for (const y of [2, 4]) { k.box('steel', 4.9, 0.12, 0.6, 0, y, 2.3); k.box('steel', 4.9, 0.12, 0.6, 0, y, -1.3); }
      k.boxR('hazard', 0.2, 7.5, 0.2, -4.6, 3.4, 0.5, 0, 0, -0.32); k.boxR('hazard', 0.2, 7.5, 0.2, -1.2, 3.4, 0.5, 0, 0, 0.32); k.box('hazard', 4.2, 0.3, 0.3, -2.9, 6.9, 0.5);
      k.box('steel', 0.04, 1.5, 0.04, -2.9, 5.4, 0.5); k.box('rust', 1.6, 1.1, 1.1, -2.9, 4.3, 0.5);
      k.box('tarp', 4, 0.08, 3.4, 4.6, 2.6, -1.8, 0); k.boxR('tarp', 4, 0.08, 1.4, 4.6, 1.9, -0.1, -0.9, 0, 0);
      k.box('steel', 2.4, 0.9, 1.0, 4.6, 0, -2.4); k.box('red', 0.4, 0.4, 0.05, 4.2, 0.4, -1.88);
      floodlight(k, -4.8, 3.6, 4.5, fx); floodlight(k, 4.8, 3.2, 3.6, fx);
      junk(k, -4.5, -3, 2.4, 10, 31); barrels(k, 3.5, 2.5, 3, 4);
      fx.sparks.push(toW(fx, 0.9, 3.4, 1.2), toW(fx, -0.8, 1.8, 1.0));
      fx.pools.push({ x: 0, z: 1.5, r: 6, c: 0xffa040, a: 0.5 });
      return { anchorY: 7.5, size: [11, 9], dyn };
    }
    // industrial shed with a sawtooth roof of lit skylights, open bay, overhead gantry outside, a tower crane from stage 2
    const L = [0, 12, 14, 16][st], D = 9, H = st === 1 ? 5 : 6;
    k.box('steel', L, H, D, -2, 0, -1);
    // sawtooth roof: each tooth slopes up toward the camera and ends in a lit vertical skylight facing it
    const teeth = 3, td = D / teeth, rise = 1.6, sa = Math.atan2(rise, td);
    for (let i = 0; i < teeth; i++) {
      const zc = -1 - D / 2 + (i + 0.5) * td;
      k.boxR('navy', L + 0.3, 0.22, td / Math.cos(sa), -2, H + rise / 2, zc, -sa, 0, 0);
      const gl = new THREE.PlaneGeometry(L * 0.96, rise * 0.85); const uv = gl.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * L / 6);
      k.add('win', gl, -2, H + rise * 0.47, zc + td / 2 - 0.08);
      k.box('yellow', L, 0.08, 0.08, -2, H + rise, zc + td / 2 - 0.05);
    }
    for (const sx of [-1, 1]) k.box('steel', 0.3, rise, D, -2 + sx * L / 2, H, -1);
    glowWall(k, 4.6, H * 0.8, -2 + L / 2 - 3, 0, -1 + D / 2 + 0.06, 0, 'warm');
    k.box('hazard', 5.2, 0.3, 0.3, -2 + L / 2 - 3, H * 0.8, -1 + D / 2 + 0.12);
    k.panel('win', L * 0.4, 1.0, -2 - L / 4, H * 0.55, -1 + D / 2 + 0.05, 0, 1.2);
    k.sub(-2, -1, 0, () => k.edges('yellow', L + 0.1, D + 0.1, 0, H, 0.12, true));
    // gantry over the outdoor repair cradle (rails + bridge + trolley that travels)
    const gx = L / 2 + 1, gw = 7;
    for (const z of [-2.5, 4.5]) { for (const x of [gx - gw / 2, gx + gw / 2]) k.box('hazard', 0.45, 7, 0.45, x, 0, z); k.box('hazard', gw + 0.5, 0.5, 0.5, gx, 7, z); }
    mech(k, gx, 1, -0.3, 0.95, 'paint', true, 0);
    k.box('dark', 3.8, 0.4, 3.2, gx, 0, 1);
    const bridge = dynKit(mats, (q) => {
      q.box('hazard', 0.5, 0.5, 7.4, 0, 0, 0); q.box('dark', 1, 0.6, 1, 0, -0.6, 0); q.box('steel', 0.05, 2.4, 0.05, 0, -3, 0); q.box('dark', 0.8, 0.3, 0.8, 0, -3.3, 0); q.box('amber', 0.2, 0.1, 0.2, 0, 0.5, 0);
    });
    dyn.push(placeDyn(bridge, b, gx, 6.75, 1)); const bridge0 = bridge.position.clone(), bdir = new THREE.Vector3(Math.sin(b.ry), 0, Math.cos(b.ry));
    fx.sparks.push(toW(fx, gx + 0.8, 3.3, 0.6), toW(fx, -2 + L / 2 - 3, 1.2, -1 + D / 2 + 0.5));
    fx.pools.push({ x: gx, z: 3, r: 7, c: 0xffb060, a: 0.45 }, { x: -2 + L / 2 - 3, z: D / 2 + 3, r: 6, c: 0xffa040, a: 0.45 });
    fx.vents.push(toW(fx, -2 - L / 2 + 1.5, H + 1.2, -3));
    let jib = null;
    if (st >= 2) {
      const cx = -2 - L / 2 - 2, cz = -4, CH = st === 3 ? 22 : 18;
      lattice(k, 'hazard', cx, 0, cz, 1.4, CH, 1.4);
      k.box('dark', 2, 1.5, 2, cx, CH, cz);
      jib = dynKit(mats, (q) => {
        q.box('hazard', 14, 0.6, 0.8, 5, 0, 0); q.box('hazard', 5, 0.6, 0.8, -2.5, 0, 0); q.box('concrete', 2, 1.5, 1.4, -4.2, -1, 0);
        q.box('hazard', 0.3, 3, 0.3, 0, 0.5, 0); q.boxR('steel', 0.04, 9, 0.04, 4.5, 1.4, 0, 0, 0, 1.25); q.boxR('steel', 0.04, 3.4, 0.04, -1.5, 1.4, 0, 0, 0, -1.0);
        q.box('steel', 0.05, 6, 0.05, 9, -6, 0); q.box('rust', 1.6, 1.0, 1.6, 9, -7, 0); q.box('red', 0.25, 0.25, 0.25, 11.8, 0.4, 0);
      });
      dyn.push(placeDyn(jib, b, cx, CH + 1.8, cz));
      fx.beacons.push(toW(fx, cx, CH + 3.8, cz));
    }
    const sign = holoPlane(holoTex('WORKSHOP', '#ffd34d', { w: 512, h: 128 }), 1.4, '#ffd34d');
    dyn.push(placeDyn(sign, b, -2 - L / 4, H + 2.4, -1 + D / 2 - 0.6));
    return {
      anchorY: H + 4, size: [L + 6, D], dyn,
      update(t) {
        bridge.position.copy(bridge0).addScaledVector(bdir, Math.sin(t * 0.3) * 2.2);
        if (jib) jib.rotation.y = b.ry + Math.sin(t * 0.07) * 1.4 + 0.6;
      },
    };
  },

  // ======================= BARRACKS: hangar, big doors, mech inside, warm interior =======================
  squad(k, b, st, mats, fx) {
    const dyn = [];
    if (st === 0) {
      // tarp half pulled back off a prefab frame: the squad's one mech kneels in the open half under a work lamp
      k.box('concrete', 10, 0.12, 9, 0, 0, 0.5);
      tarpShelter(k, 8, 4.4, 4.8, 'tarp', 0, -1.8);
      for (let i = 0; i < 3; i++) k.add('dark', new THREE.TorusGeometry(4.03, 0.08, 4, 14, Math.PI).scale(1, 4.8 / 4, 1), 0, 0, 1.2 + i * 1.3, 0, 0, 0);
      k.add('grime', new THREE.CircleGeometry(4, 14, 0, Math.PI).scale(1, 4.8 / 4, 1), 0, 0, -4, 0, 0, 0);
      glowWall(k, 6, 3.8, 0, 0, -3.9, 0, 'warm');
      // the squad's hero unit (js/hub/squad.js) stands in the open half; static stand-in only when live units are off
      if (fx.liveBays) fx.bays.push({ pos: toW(fx, 0, 0.12, 1.6), ry: 0.1 }); else mech(k, 0, 1.4, 0.15, 0.95, 'paint', false, -0.55);
      k.box('dark', 0.12, 5.6, 0.12, 3.2, 0, 3.6); k.boxR('warm', 0.7, 0.35, 0.5, 2.7, 5.5, 3.2, 0.5, 0.6, 0);
      container(k, -6.4, -0.3, Math.PI / 2, 0, 'orangep', 6, 'green'); container(k, 6.4, -0.3, Math.PI / 2, 0, 'teal', 6, 'green');
      container(k, -6.4, -0.3, Math.PI / 2 + 0.05, 2.6, 'redp');
      k.panel('win', 1.8, 0.7, -5.1, 3.6, -0.3, Math.PI / 2, 0.9); k.panel('win', 1.8, 0.7, -5.1, 1.0, -0.3, Math.PI / 2, 0.9); k.panel('win', 1.8, 0.7, 5.1, 1.0, -0.3, -Math.PI / 2, 0.9);
      for (let i = 0; i < 6; i++) k.box('steel', 0.9, 0.1, 0.5, -4.6, 0.4 + i * 0.4, 2.8 - i * 0.35);
      k.box('green', 2.4, 0.1, 0.1, -6.4, 5.3, 1.0);
      barrels(k, 4.2, 3.4, 3, 9, 'paint');
      fx.pools.push({ x: 0.5, z: 3.2, r: 6.5, c: 0xffc080, a: 0.7 });
      fx.vents.push(toW(fx, 6.4, 2.8, -2));
      return { anchorY: 7, size: [14, 7], dyn };
    }
    // hangar: gabled roof, bays with big doors; one open on the lit interior and a mech, the rest shut with hazard edges
    const bays = st === 3 ? 4 : 3, bw = 4.6, W = bays * bw + 1, D = 9, H = st === 1 ? 6 : 7, RC = 3.2, DH = H * 0.8;
    k.box('steel', W, H, D - RC, 0, 0, -RC / 2);
    k.box('steel', W, H - DH, RC, 0, DH, D / 2 - RC / 2);
    for (const sx of [-1, 1]) k.box('steel', 0.5, DH, RC, sx * (W / 2 - 0.25), 0, D / 2 - RC / 2);
    k.gable('navy', W + 0.6, D + 0.8, 1.8, 0, H, 0);
    k.box('green', W + 0.7, 0.12, 0.12, 0, H + 1.8, 0); k.box('green', W + 0.2, 0.1, 0.1, 0, H + 0.02, D / 2 + 0.42);
    for (let i = 0; i < bays; i++) {
      const x = -W / 2 + 0.5 + bw * (i + 0.5), open = i === 1 || (st >= 2 && i === bays - 1);
      if (i > 0) k.box('dark', 0.4, DH, RC, x - bw / 2, 0, D / 2 - RC / 2);
      k.box('green', bw - 0.4, 0.14, 0.14, x, DH + 0.05, D / 2 + 0.1);
      if (open) {
        glowWall(k, bw - 0.4, DH, x, 0, D / 2 - RC + 0.03, 0, 'warm');
        k.box('dark', bw - 0.4, 0.9, 0.35, x, DH - 0.9, D / 2 - 0.2);           // door rolled up
        if (fx.liveBays) fx.bays.push({ pos: toW(fx, x, 0, D / 2 + 0.3), ry: 0 }); else mech(k, x, D / 2 - 0.2, 0, 1.0, 'steel', false);
        fx.pools.push({ x, z: D / 2 + 3.5, r: 5.5, c: 0xffc080, a: 0.6 });
      } else {
        k.box('grime', bw - 0.4, DH, 0.15, x, 0, D / 2 - 0.1);
        for (let yy = 0.6; yy < DH; yy += 0.6) k.box('dark', bw - 0.4, 0.05, 0.2, x, yy, D / 2 - 0.08);
        k.box('hazard', bw - 0.4, 0.4, 0.2, x, 0, D / 2 - 0.06);
      }
      k.box(open ? 'amber' : 'green', 0.4, 0.4, 0.1, x, DH + 0.4, D / 2 + 0.05);
    }
    k.panel('win', W * 0.9, 0.9, 0, H * 0.88 + 0.1, -D / 2 - 0.05, Math.PI, 1.2);
    let topY = H + 1.9;
    if (st >= 2) {
      // crew quarters block riding the roof
      const qw = W * 0.45, qx = -W * 0.22;
      k.box('light', qw, 4.2, D * 0.55, qx, H + 1.2, -0.8); k.bands('win', qw, D * 0.55, H + 1.9, H + 5, 2.2);
      k.rim('green', qw, D * 0.55, qx, H + 5.4, -0.8, 0.14); topY = H + 5.4;
      roofUnits(k, qw * 0.8, 1.6, H + 5.4, fx, 2, -0.8);
    }
    if (st === 3) { fx.pads.push(toW(fx, W * 0.3, H + 2.25, 0)); k.cyl('dark', 3, 3, 0.4, W * 0.3, H + 1.8, 0, 20); const p = decal(padTex('#5cf2a6', 'H'), 5.6, 0xffffff, 0.9); dyn.push(placeDyn(p, b, W * 0.3, H + 2.25, 0)); }
    fx.vents.push(toW(fx, W / 2 - 1.5, H + 1.7, -D / 2 + 1.5));
    const sign = holoPlane(holoTex('BARRACKS', '#5cf2a6', { w: 512, h: 128 }), 1.5, '#5cf2a6');
    dyn.push(placeDyn(sign, b, W * 0.2, topY + 1.2, D / 2 - 1.5));
    return { anchorY: topY + 2.5, size: [W, D], dyn };
  },

  // ======================= RECRUITMENT: drop-pod landing pad + beacon =======================
  recruit(k, b, st, mats, fx) {
    const dyn = [];
    const R = [4.5, 6, 7, 7.5][st], h = st >= 2 ? 1.4 : st === 1 ? 0.5 : 0.08;
    let beam = null, beaconHead = null;
    if (st === 0) {
      // a painted circle on the deck, cones, a pole beacon and a scorched pod that came down hard
      const pad = decal(padTex('#a77bff', ''), R * 2, 0xffffff, 0.45); dyn.push(placeDyn(pad, b, 0, 0.08, 0));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cyl('orange', 0.02, 0.22, 0.6, Math.cos(a) * (R + 0.5), 0, Math.sin(a) * (R + 0.5), 6); }
      k.box('steel', 0.18, 5, 0.18, -R - 1.4, 0, -1.5); k.box('purple', 0.5, 0.5, 0.5, -R - 1.4, 5, -1.5); fx.beacons.push(toW(fx, -R - 1.4, 5.8, -1.5));
      k.sub(R + 1.6, -2, 0.4, () => { k.boxR('grime', 1.8, 2.6, 1.8, 0, 1.0, 0, 0.35, 0, 0.2); k.box('purple', 0.6, 0.12, 0.05, 0, 1.4, 0.95); });
      k.box('hull', 2.6, 2.4, 2, -R - 3.6, 0, 1.5); k.panel('win', 1.8, 0.9, -R - 3.6, 1.1, 2.52, 0, 0.9); k.rim('purple', 2.6, 2, -R - 3.6, 2.4, 1.5, 0.1);
      fx.padTop = h;
      return { anchorY: 6, size: [R * 2, R * 2], dyn };
    }
    k.cyl('dark', R, R + 0.4, h, 0, 0, 0, 36);
    k.torus('purple', R + 0.15, 0.1, 0, h + 0.02, 0, Math.PI / 2, 48);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.box('white', 0.3, 0.08, 0.3, Math.cos(a) * (R - 0.4), h, Math.sin(a) * (R - 0.4)); }
    const pad = decal(padTex('#a77bff', 'R'), R * 2 - 0.6, 0xffffff, 0.85); dyn.push(placeDyn(pad, b, 0, h + 0.04, 0));
    // landed drop pod on a cradle at the pad edge: cone capsule, fins, hatch light
    const pod = (px, pz, s) => k.sub(px, pz, 0.6, () => {
      k.box('dark', 2.6 * s, 0.5 * s, 2.6 * s, 0, 0, 0);
      k.cyl('light', 0.8 * s, 1.3 * s, 2.8 * s, 0, 0.5 * s, 0, 12); k.cyl('grime', 1.35 * s, 1.1 * s, 0.6 * s, 0, 0.5 * s, 0, 12);
      k.cyl('steel', 0.2 * s, 0.8 * s, 0.9 * s, 0, 3.3 * s, 0, 10);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; k.boxR('navy', 0.1 * s, 1.6 * s, 0.9 * s, Math.cos(a) * 1.2 * s, 1.5 * s, Math.sin(a) * 1.2 * s, 0, -a, 0); }
      k.panel('wincool', 0.7 * s, 1.0 * s, 0, 1.4 * s, 1.08 * s, 0, 0.35);
      k.box('purple', 1.6 * s, 0.1 * s, 0.1 * s, 0, 2.6 * s, 0.75 * s);
    }, h);
    pod(R - 1.8, -R + 2.2, 1);
    if (st >= 2) pod(-R + 1.8, -R + 2.4, 0.9);
    // beacon mast with a rotating head and an upward light column
    const mx = -R - 1.6, mz = -R * 0.4, MH = st === 1 ? 8 : st === 2 ? 11 : 13;
    lattice(k, 'dark', mx, 0, mz, 0.9, MH, 1.2);
    beaconHead = dynKit(mats, (q) => { q.box('purple', 0.5, 0.5, 1.6, 0, 0, 0.5); q.box('dark', 0.7, 0.7, 0.7, 0, 0, 0); });
    dyn.push(placeDyn(beaconHead, b, mx, MH + 0.4, mz));
    fx.beacons.push(toW(fx, mx, MH + 1.2, mz));
    if (st >= 2) {
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; k.box('light', 0.8, 3, 0.8, Math.cos(a) * (R + 1), 0, Math.sin(a) * (R + 1)); k.box('purple', 0.84, 0.2, 0.84, Math.cos(a) * (R + 1), 2.6, Math.sin(a) * (R + 1)); fx.beacons.push(toW(fx, Math.cos(a) * (R + 1), 3.3, Math.sin(a) * (R + 1))); }
      k.box('dark', 2.4, h, 4, R + 1, 0, 0);
    }
    if (st === 3) { // holo ring hovering over the pad
      beam = dynKit(mats, (q) => { q.torus('purple', R * 0.8, 0.08, 0, 0, 0, Math.PI / 2, 48); q.torus('white', R * 0.62, 0.04, 0, 0.6, 0, Math.PI / 2, 40); });
      dyn.push(placeDyn(beam, b, 0, h + 6, 0));
    }
    // kiosk
    k.box('hull', 3, 3.2, 2.5, R + 3, 0, R * 0.5); k.panel('win', 2.4, 1.3, R + 3, 1.4, R * 0.5 + 1.28, 0, 1.2); k.rim('purple', 3, 2.5, R + 3, 3.2, R * 0.5, 0.12);
    fx.padTop = h;
    return { anchorY: 7, size: [R * 2, R * 2], dyn, update(t) { beaconHead.rotation.y = b.ry + t * 1.6; if (beam) { beam.rotation.y = -t * 0.4; beam.position.y = h + 6 + Math.sin(t * 0.9) * 0.5; } } };
  },
};

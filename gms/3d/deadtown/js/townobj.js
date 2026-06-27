// The town: apocalypse buildings around the street grid, wrecked cars, street
// lamps, barriers and scatter — all PolyPerfect GLBs. Returns collider shapes
// (circles + boxes), the building list (for the minimap) and door interactables
// that link to interiors.js areas. BUILDINGS is authoring data: a future
// session grows the map by adding rows here (+ matching interiors).

import * as THREE from 'three';
import { model as loadModel } from './assets.js';
import { rand, pick } from './utils.js';
import { ROADS } from './world.js';

// hx/hz = collision half-extents (footprint). door = local +z offset to the
// doormat (where you stand to enter); interior = the area id (interiors.js).
const BUILDINGS = [
  { model: 'bld_family_a', x: 0,   z: 40,  rot: Math.PI,        scale: 1.0, hx: 6, hz: 5, door: -6, interior: 'home',   label: 'Home' },
  { model: 'bld_house_a',  x: -22, z: -6,  rot: Math.PI / 2,    scale: 1.0, hx: 6, hz: 6, door: 7,  interior: 'store',  label: 'Corner Store' },
  { model: 'bld_police',   x: 28,  z: -22, rot: 0,              scale: 1.0, hx: 8, hz: 7, door: 9,  interior: 'police', label: 'Police Armory' },
  { model: 'bld_cafe',     x: -28, z: 18,  rot: Math.PI / 2,    scale: 1.0, hx: 6, hz: 5, door: 7,  interior: null,     locked: true, label: 'Café' },
  { model: 'bld_burger',   x: 30,  z: 24,  rot: -Math.PI / 2,   scale: 1.0, hx: 6, hz: 5, door: -7, interior: null,     locked: true, label: 'Burger Joint' },
  { model: 'bld_block',    x: 18,  z: 42,  rot: Math.PI,        scale: 1.0, hx: 8, hz: 6, door: -7, interior: null,     locked: true, label: 'Apartments' },
  { model: 'bld_house_b',  x: -20, z: 40,  rot: Math.PI,        scale: 1.0, hx: 6, hz: 6, door: -7, interior: null,     locked: true, label: 'House' },
  { model: 'bld_family_b', x: 44,  z: 6,   rot: -Math.PI / 2,   scale: 1.0, hx: 6, hz: 5, door: -7, interior: null,     locked: true, label: 'House' },
  { model: 'bld_cabin',    x: -44, z: -22, rot: Math.PI / 4,    scale: 1.0, hx: 5, hz: 5, door: 6,  interior: null,     locked: true, label: 'Cabin' },
  { model: 'bld_carwash',  x: 44,  z: -42, rot: 0,              scale: 1.0, hx: 7, hz: 6, door: 8,  interior: null,     locked: true, label: 'Car Wash' },
];

const offRoad = (x, z, pad = 1) => {
  for (const rx of ROADS.vert) if (Math.abs(x - rx) < ROADS.half + pad) return false;
  for (const rz of ROADS.horiz) if (Math.abs(z - rz) < ROADS.half + pad) return false;
  return true;
};

export function buildTown(scene, world) {
  const group = new THREE.Group();
  scene.add(group);
  const circles = [];           // {x,z,r}
  const boxes = [];             // {x,z,hx,hz}
  const interactables = [];     // door prompts
  const buildings = [];         // {x,z,hx,hz,locked,label} for the minimap
  const animated = [];          // {obj, fn} flickering lamps etc.

  // ── buildings ──
  for (const b of BUILDINGS) {
    const holder = new THREE.Group();
    holder.position.set(b.x, 0, b.z); holder.rotation.y = b.rot;
    group.add(holder);
    loadModel(b.model).then(m => { m.scale.setScalar(b.scale); holder.add(m); });
    boxes.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz });
    buildings.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, locked: b.locked, label: b.label });
    // doormat in world space (door offset is along the building's local +z)
    const dz = b.door;
    const wx = b.x + Math.sin(b.rot) * dz;
    const wz = b.z + Math.cos(b.rot) * dz;
    const s = Math.sign(dz) || 1;                     // outward normal (centre→door)
    interactables.push({
      kind: 'door', interior: b.interior, locked: b.locked, label: b.label,
      verb: b.locked ? `🚪 ${b.label} — barricaded` : `🚪 Enter ${b.label}`,
      pos: new THREE.Vector3(wx, 0, wz), range: 3.2,
      nx: s * Math.sin(b.rot), nz: s * Math.cos(b.rot),
    });
  }

  // ── street lamps along the road centre-lines ──
  loadModel('lamp_road').then(tmpl => {
    const place = (x, z) => { const m = tmpl.clone(true); m.scale.setScalar(1.0); m.position.set(x, 0, z); m.rotation.y = rand(0, 6.28); group.add(m); circles.push({ x, z, r: 0.5 }); };
    for (const x of ROADS.vert) for (let z = -50; z <= 50; z += 20) place(x + ROADS.half + 1.4, z + 5);
    for (const z of ROADS.horiz) for (let x = -50; x <= 50; x += 22) place(x + 6, z + ROADS.half + 1.4);
  });
  // lamp glow lights (a few, cheap)
  for (const [x, z] of [[ROADS.half + 1.4, 5], [-ROADS.half - 1.4, 25], [30 + ROADS.half + 1.4, -15], [-30 + ROADS.half + 1.4, 5]]) {
    const L = new THREE.PointLight(0xffcf88, 1.1, 16, 2); L.position.set(x, 4.2, z); group.add(L);
    animated.push({ obj: L, fn: (t) => { L.intensity = 0.9 + Math.sin(t * 13 + x) * 0.25 * (Math.random() < 0.04 ? 0 : 1); } });
  }

  // ── wrecked vehicles on the roads ──
  const wrecks = ['car_wreck', 'car_wreck_b', 'car_broken', 'car_police', 'bus_wreck'];
  const carSpots = [
    [0, -10, 0.4], [-30, 8, 1.2], [30, -2, -0.7], [6, 24, 1.6], [-6, -24, 0.2],
    [30, 36, 2.4], [-30, -34, 0.9], [0, 14, -1.1], [-2, -40, 0.5], [30, 14, 1.9],
  ];
  loadModelsThen(wrecks, (models) => {
    carSpots.forEach(([x, z, rot], i) => {
      const m = models[i % models.length].clone(true);
      m.position.set(x, 0, z); m.rotation.y = rot; m.scale.setScalar(1.0); group.add(m);
      circles.push({ x, z, r: 2.4 });
    });
  });

  // ── barricades around the police station + scattered barriers ──
  loadModel('barrier').then(tmpl => {
    const row = (cx, cz, horiz, n) => { for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 2.6; const x = cx + (horiz ? o : 0), z = cz + (horiz ? 0 : o); const m = tmpl.clone(true); m.position.set(x, 0, z); m.rotation.y = horiz ? 0 : Math.PI / 2; group.add(m); circles.push({ x, z, r: 1.2 }); } };
    row(28, -13, true, 5);            // police front barricade
    row(-8, 0, false, 3);
    row(12, -2, true, 3);
  });

  // ── scatter: barrels, crates, bins, road signs (off-road, with colliders) ──
  const scatter = ['barrel', 'crate', 'bin', 'barrier_traf', 'barricade'];
  loadModelsThen(scatter, (models) => {
    let placed = 0, tries = 0;
    while (placed < 46 && tries < 400) {
      tries++;
      const x = rand(-52, 52), z = rand(-52, 52);
      if (!offRoad(x, z, -1.5)) { /* allow some on sidewalks */ }
      if (boxes.some(b => Math.abs(x - b.x) < b.hx + 2 && Math.abs(z - b.z) < b.hz + 2)) continue;
      const m = models[(Math.random() * models.length) | 0].clone(true);
      m.position.set(x, 0, z); m.rotation.y = rand(0, 6.28); m.scale.setScalar(1.0); group.add(m);
      circles.push({ x, z, r: 0.85 });
      placed++;
    }
  });

  return {
    group, interactables, buildings,
    colliders: { circles, boxes },
    tick(dt, t) { for (const a of animated) a.fn(t); },
  };
}

// load several models, then run cb once with the resolved array (keeps draw
// order stable + avoids N separate async closures).
function loadModelsThen(names, cb) {
  Promise.all(names.map(n => loadModel(n))).then(cb);
}

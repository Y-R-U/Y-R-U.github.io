import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { createBoulevardGround } from './bl_ground.js';
import { buildCanyon, COOL, COOL_DARK } from './bl_city.js';
import { planter, lamp, holoPillar, kiosk, warehousePad, railing } from './plaza.js';
import { bench, cafe, bollard, totems } from './furnish.js';
import { locker, stall, relay, dumpster } from './sites.js';
import { addTree, addShrubs } from './foliage.js';
import { HOLO_ART } from './holo.js';
import { createBreakables } from './breakables.js';
import { createWaterMaterial } from './water.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Brightline Boulevard (ref_boulevard_blue): a long glass canyon along Z (north = -Z, the default camera view).
// West: shop arcade under a deep canopy, podium + megatowers, the curved BRIGHTER billboard.
// East: a glass rail over a drop to a lower avenue, towers rising from it (HARMONY panel), a market balcony
// and a raised terrace. North: the Lumen forecourt deck. The street and towers run on well past the play bounds.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BL_LAYOUT = {
  bounds: { x0: -40, x1: 34, z0: -105, z1: 100 },
  shopX: -24, arcadeEdge: 15.2, edgeE: 15.6, lowY: -26,
  alleys: [[-50, -42], [38, 44]],
  market: { x0: 16, x1: 32, z0: -70, z1: -44 },
  terrace: { x0: 16, x1: 32, z0: 60, z1: 92, y: 2.4, stairs: [20, 28], padZ0: 48 },
  deck: { x0: -14, x1: 14, z0: -105, z1: -92, y: 2.0, stairs: [-5, 5], rampZ1: -87 },
  lobby: { z: -20 },
  billboard: { cx: -62, cz: -55, r: 42, th0: 62 * Math.PI / 180, th1: 118 * Math.PI / 180, y: 17, h: 18 },
  spawn: { x: 0, z: 84 },
  relay: { x: 0, z: 93 },
  kiosk: { x: -10.5, z: 80, rot: 0.6 },
  pad: { x: 10.5, z: 78 },
};

function forecourt(ctx, L) {
  const { batch, M, col, scene } = ctx;
  const D = L.deck, w = D.x1 - D.x0, cx = (D.x0 + D.x1) / 2;
  const deck = new THREE.Mesh(box(w, D.y, D.z1 - D.z0 + 1, cx, D.y / 2, (D.z0 + D.z1) / 2 - 0.5), M.terrace);
  const uv = deck.geometry.attributes.uv, p = deck.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 5, p.getZ(i) / 5);
  deck.receiveShadow = true; deck.castShadow = true; deck.layers.enable(REFLECT_LAYER); scene.add(deck);
  const [s0, s1] = D.stairs;
  for (const [a, b] of [[D.x0, s0], [s1, D.x1]]) {
    const ww = b - a, mx = (a + b) / 2;
    batch.put(box(ww, D.y, 0.5), M.stone, V(mx, D.y / 2, D.z1));
    batch.put(box(ww, 0.08, 0.54), M.gold, V(mx, D.y - 0.04, D.z1));
    batch.put(box(ww - 0.4, 0.06, 0.05), M.blueGlow, V(mx, 0.3, D.z1 + 0.27), 0, null, { cast: false });
    col.box(mx, D.z1, ww / 2, 0.3, 0, 'deckWall');
    railing(ctx, [[a, D.z1 - 0.1], [b, D.z1 - 0.1]], D.y);
  }
  const n = 10, run = (L.deck.rampZ1 - D.z1) / n, rise = D.y / n;
  for (let i = 0; i < n; i++) {
    batch.add(box(s1 - s0, D.y - rise * i, run, (s0 + s1) / 2, (D.y - rise * i) / 2, D.z1 + run * (i + 0.5)), M.stoneUpper);
    batch.put(box(s1 - s0, 0.02, 0.05), M.gold, V((s0 + s1) / 2, D.y - rise * i + 0.005, D.z1 + run * i + 0.03), 0, null, { cast: false });
  }
  for (const sx of [s0 - 0.25, s1 + 0.25]) { batch.put(box(0.5, D.y + 0.7, L.deck.rampZ1 - D.z1), M.stone, V(sx, (D.y + 0.7) / 2, (D.z1 + L.deck.rampZ1) / 2)); col.box(sx, (D.z1 + L.deck.rampZ1) / 2, 0.3, (L.deck.rampZ1 - D.z1) / 2, 0, 'stairWall'); }
  col.height({ kind: 'rampZ', x0: s0, x1: s1, z0: D.z1, z1: L.deck.rampZ1, y0: D.y, y1: 0 });
  col.height({ kind: 'flat', x0: D.x0, x1: D.x1, z0: D.z0 - 1, z1: D.z1, y: D.y });
  // side slivers between the deck and the arcade / rail are closed off
  col.box(-14.6, (D.z0 + D.z1) / 2, 0.6, (D.z1 - D.z0) / 2 + 0.3, 0, 'deckSide');
  col.box(14.8, (D.z0 + D.z1) / 2, 0.8, (D.z1 - D.z0) / 2 + 0.3, 0, 'deckSide');
  railing(ctx, [[D.x0 + 0.2, D.z1 - 0.2], [D.x0 + 0.2, D.z0 - 0.2], [D.x1 - 0.2, D.z0 - 0.2], [D.x1 - 0.2, D.z1 - 0.2]], D.y);
  // deck dressing: planters, benches, a telescope-style viewer at the rail
  for (const x of [-10, 10]) { planter(ctx, x, -100, 4.5, 1.6, 0, 300 + x, 1, D.y); }
  for (const x of [-4, 4]) { const seats = bench(ctx, x, -97.5, Math.PI, D.y); ctx.gather.push({ x, z: -97.5, kind: 'sit', seats, y: D.y }); }
  lamp(ctx, -13, -93, D.y); lamp(ctx, 13, -93, D.y);
}

function terrace(ctx, L) {
  const { batch, M, col, scene } = ctx;
  const T = L.terrace, w = T.x1 - T.x0, d = T.z1 - T.z0, cx = (T.x0 + T.x1) / 2;
  const deck = new THREE.Mesh(box(w, 0.3, d, cx, T.y - 0.15, (T.z0 + T.z1) / 2), M.terrace);
  const uv = deck.geometry.attributes.uv, p = deck.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 5, p.getZ(i) / 5);
  deck.receiveShadow = true; deck.layers.enable(REFLECT_LAYER); scene.add(deck);
  batch.put(box(0.6, T.y, d), M.stone, V(T.x0 + 0.3, T.y / 2, (T.z0 + T.z1) / 2));
  batch.put(box(0.64, 0.08, d), M.gold, V(T.x0 + 0.3, T.y - 0.04, (T.z0 + T.z1) / 2));
  batch.put(box(0.05, 0.06, d - 0.4), M.blueGlow, V(T.x0 - 0.02, 0.3, (T.z0 + T.z1) / 2), 0, null, { cast: false });
  const [s0, s1] = T.stairs;
  for (const [a, b] of [[T.x0, s0], [s1, T.x1]]) {
    const ww = b - a, mx = (a + b) / 2;
    batch.put(box(ww, T.y, 0.5), M.stone, V(mx, T.y / 2, T.z0));
    batch.put(box(ww, 0.08, 0.54), M.gold, V(mx, T.y - 0.04, T.z0));
    col.box(mx, T.z0, ww / 2, 0.3, 0, 'terraceWall');
    railing(ctx, [[a, T.z0 + 0.15], [b, T.z0 + 0.15]], T.y);
  }
  const z0 = T.z0 - 10, n = 12, run = 10 / n, rise = T.y / n;
  for (let i = 0; i < n; i++) {
    batch.add(box(s1 - s0, rise * (i + 1), run, (s0 + s1) / 2, rise * (i + 1) / 2, z0 + run * (i + 0.5)), M.stoneUpper);
    batch.put(box(s1 - s0, 0.02, 0.05), M.gold, V((s0 + s1) / 2, rise * (i + 1) + 0.005, z0 + run * i + 0.03), 0, null, { cast: false });
  }
  for (const sx of [s0 - 0.25, s1 + 0.25]) { batch.put(box(0.5, T.y + 0.7, 10), M.stone, V(sx, (T.y + 0.7) / 2, z0 + 5)); col.box(sx, z0 + 5, 0.3, 5, 0, 'stairWall'); }
  col.height({ kind: 'rampZ', x0: s0, x1: s1, z0, z1: T.z0, y0: 0, y1: T.y });
  col.height({ kind: 'flat', x0: T.x0, x1: T.x1 + 1, z0: T.z0, z1: T.z1 + 1, y: T.y });
  // dressing: a café, planters with trees, benches facing the drop, lamps
  planter(ctx, 29, 66, 1.6, 7, 0, 211, 1, T.y);
  planter(ctx, 29, 86, 1.6, 7, 0, 212, 1, T.y);
  for (const z of [72, 80]) { const seats = bench(ctx, 29.6, z, Math.PI / 2 + Math.PI, T.y); ctx.gather.push({ x: 29.6, z, kind: 'sit', seats, y: T.y }); }
  lamp(ctx, 17.4, 64, T.y); lamp(ctx, 17.4, 88, T.y);
  ctx.gather.push({ x: 22, z: 70, kind: 'talk', y: T.y }, { x: 23, z: 84, kind: 'talk', y: T.y });
}

function circus(ctx) {
  const { batch, M, col, scene, time } = ctx;
  // Unity fountain: a wide shallow basin, gold rings orbiting a lit core
  batch.put(lathe([[0, 0], [5.2, 0], [5.3, 0.1], [5.3, 0.55], [5.0, 0.62], [4.8, 0.4], [0, 0.4]], 48), M.stoneUpper, V(0, 0, 0));
  batch.put(new THREE.TorusGeometry(5.28, 0.05, 6, 64).rotateX(Math.PI / 2), M.gold, V(0, 0.6, 0), 0, null, { cast: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.85, 48).rotateX(-Math.PI / 2), createWaterMaterial(ctx, { color: 0x1d4f66, reflect: true }));
  water.position.y = 0.45; water.layers.enable(REFLECT_LAYER); scene.add(water);
  batch.add(cyl(0.5, 0.9, 1.6, 0, 0.3, 0, 20), M.stoneUpper);
  const rings = new THREE.Group();
  const ringM = M.goldSolid;
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.55, 0.07, 8, 64), ringM);
    r.rotation.set(0.5 + i * 0.7, i * 1.1, 0); r.castShadow = true; r.layers.enable(REFLECT_LAYER); rings.add(r);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), M.coreGlow);
  core.layers.enable(REFLECT_LAYER); rings.add(core);
  rings.position.set(0, 3.6, 0); scene.add(rings);
  ctx.updaters.push((dt, t) => { rings.children.forEach((r, i) => { if (i < 3) { r.rotation.y += dt * (0.25 + i * 0.12); r.rotation.x += dt * 0.1 * (i - 1); } }); rings.position.y = 3.6 + Math.sin(t * 0.8) * 0.12; });
  col.circle(0, 0, 5.45, 'fountain');
  for (let a = 0; a < 360; a += 30) if (a % 90 !== 0) bollard(ctx, Math.sin(a * Math.PI / 180) * 7.4, Math.cos(a * Math.PI / 180) * 7.4);
  for (const a of [45, 135, 225, 315]) {
    const t = a * Math.PI / 180, x = Math.sin(t) * 9.6, z = Math.cos(t) * 9.6;
    const seats = bench(ctx, x, z, t + Math.PI);
    ctx.gather.push({ x, z, kind: 'sit', seats });
  }
}

function buildBrightline(ctx, onProgress = () => {}) {
  const L = BL_LAYOUT, { M, col } = ctx;
  ctx.gather ||= [];
  // every stone piece (shared helpers included) takes Brightline's cool tint
  const add = ctx.batch.add;
  ctx.batch.add = (g, mat, o = {}) => add(g, mat, !o.color && (mat === M.stoneUpper || mat === M.stone) ? { ...o, color: mat === M.stone ? COOL_DARK : COOL } : o);
  const m = L.market, t = L.terrace;
  createBoulevardGround(ctx, [
    [L.shopX, L.edgeE + 0.4, -430, 430],
    [L.edgeE + 0.4, m.x1, m.z0, m.z1],
    [L.edgeE + 0.4, t.x1, t.padZ0, t.z0],
    ...L.alleys.map(([a, b]) => [L.bounds.x0 + 1.5, L.shopX, a, b]),
  ], L);
  onProgress(0.45, 'Polishing the boulevard…');
  buildCanyon(ctx, L);
  onProgress(0.6, 'Lighting the billboards…');
  forecourt(ctx, L);
  terrace(ctx, L);
  circus(ctx);

  // east edge collision: the drop is closed except the market balcony, the pad below the terrace and the terrace
  col.custom((x, z, r) => {
    if (x + r < L.edgeE + 0.1) return false;
    if (z - r > m.z0 + 0.3 && z + r < m.z1 - 0.3 && x + r < m.x1 - 0.3) return false;
    if (z - r > t.padZ0 + 0.3 && z < t.z0 + 0.2 && x + r < t.x1 - 0.3) return false;
    if (z >= t.z0 - 0.2 && z + r < t.z1 - 0.3 && x - r > t.x0 + 0.6 && x + r < t.x1 - 0.3) return false;
    return true;
  });

  // median: planters with trees, lamps, benches, holo pillars, totems
  for (const z of [62, 36, -26, -50, -74]) {
    planter(ctx, 0, z, 2.2, 9, 0, 40 + z, 2);
    for (const s of [-1, 1]) { const x = s * 2.05, seats = bench(ctx, x, z, s * Math.PI / 2); ctx.gather.push({ x, z, kind: 'sit', seats }); }
  }
  for (let z = -86; z <= 90; z += 12) {
    if (Math.abs(z) < 12) continue;
    lamp(ctx, -9.5, z); lamp(ctx, 9.5, z + 6);
  }
  holoPillar(ctx, -11.5, 18, HOLO_ART.ad('NEXUS', 'ONE CITY • ONE MIND', 4), 0.3);
  holoPillar(ctx, 11.5, -14, HOLO_ART.ad('CONCORD', 'YOUR PLACE IS PREPARED', 6), -0.3);
  holoPillar(ctx, 12, -80, HOLO_ART.ad('HIREFRAME', 'RENT A BODY TODAY', 9, '#3a2a10'), -0.3);
  totems(ctx, [[-12.8, 60, Math.PI / 2, 0, 1], [12.8, 44, -Math.PI / 2, 2, 3], [-12.8, -62, Math.PI / 2, 1, 3], [12.8, -38, -Math.PI / 2, 0, 2]]);
  // arcade: cafés, lockers
  cafe(ctx, -19.4, -8, Math.PI / 2);
  cafe(ctx, -19.4, 26, Math.PI / 2);
  cafe(ctx, -19.4, 62, Math.PI / 2);
  locker(ctx, -22.9, 10, Math.PI / 2);
  locker(ctx, 14.9, -22, -Math.PI / 2);
  locker(ctx, 13.2, 97.6, Math.PI);
  // market balcony
  for (const [x, z, r, h] of [[29.6, -64, -Math.PI / 2, 1], [29.6, -57, -Math.PI / 2, 0], [29.6, -50, -Math.PI / 2, 1], [21, -67.6, 0, 0]]) stall(ctx, x, z, r, h);
  ctx.gather.push({ x: 23, z: -56, kind: 'talk' }, { x: 21.5, z: -50, kind: 'talk' });
  // alleys: dumpsters
  dumpster(ctx, -34.5, -44.4, 0); dumpster(ctx, -35, 42.6, 0);
  // south end: flower beds + bollards closing the play area
  for (const x of [-12, -4, 4, 12]) {
    batch3(ctx, x, 99.2);
  }
  kiosk(ctx);
  warehousePad(ctx);
  relay(ctx, L.relay.x, L.relay.z);
  ctx.gather.push({ x: -6, z: 70, kind: 'talk' }, { x: 6, z: 20, kind: 'talk' }, { x: -6, z: -12, kind: 'talk' }, { x: 5, z: -62, kind: 'talk' },
    { x: -19, z: 44, kind: 'talk' }, { x: -19, z: -30, kind: 'talk' }, { x: 7, z: 52, kind: 'talk' }, { x: -7, z: -88, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: -31, z: -47.5, stack: 1 }, { kind: 'crate', x: -28.6, z: -44, rot: 0.4 }, { kind: 'crate', x: -36.5, z: -48, stack: 1, rot: 0.2 },
    { kind: 'crate', x: -31.5, z: 40, rot: 0.3 }, { kind: 'crate', x: -36.2, z: 39.6, stack: 1 },
    { kind: 'crate', x: 30.4, z: -46.2, rot: 0.2 }, { kind: 'crate', x: 18, z: -46, stack: 1 }, { kind: 'crate', x: 30.2, z: 51, rot: 0.5 },
    { kind: 'vending', x: -23.2, z: -86, rot: Math.PI / 2 }, { kind: 'vending', x: -23.2, z: -37, rot: Math.PI / 2 }, { kind: 'vending', x: -23.2, z: 4, rot: Math.PI / 2 },
    { kind: 'vending', x: -23.2, z: 49, rot: Math.PI / 2 }, { kind: 'vending', x: -23.2, z: 76, rot: Math.PI / 2 },
    { kind: 'holo', x: -6.5, z: 48, rot: 0.3 }, { kind: 'holo', x: 6.5, z: -38, rot: -0.3 }, { kind: 'holo', x: -6.5, z: -64, rot: 0.3 },
    { kind: 'holo', x: 6.5, z: 30, rot: -0.3 }, { kind: 'holo', x: -8, z: -94.5, rot: 0, y: L.deck.y },
  ]);

  const S = [
    ['bl_plaza_south', 'plaza', 0, 72, 7], ['bl_circus', 'plaza', 0, 12, 6], ['bl_plaza_north', 'plaza', 0, -62, 6], ['bl_boulevard_mid', 'plaza', -6, -36, 6],
    ['bl_market', 'market', 23, -57, 6], ['bl_market_arcade', 'market', -19, 30, 4],
    ['bl_locker_arcade', 'locker', -21.4, 10, 2.5], ['bl_locker_east', 'locker', 13.4, -22, 2.5], ['bl_locker_south', 'locker', 13.2, 96, 2.5],
    ['bl_alley_n', 'alley', -32, -46, 3], ['bl_alley_s', 'alley', -32, 41, 2.5],
    ['bl_rooftop_terrace', 'rooftop', 23, 76, 6], ['bl_rooftop_deck', 'rooftop', 0, -98, 5],
    ['bl_lobby_lumen', 'lobby', -20, -20, 4], ['bl_lobby_deck', 'lobby', 6, -101, 3],
    ['bl_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['bl_spawn_alley_n', 'spawn_edge', -36, -46, 3], ['bl_spawn_alley_s', 'spawn_edge', -36, 41, 2.5], ['bl_spawn_north', 'spawn_edge', 10, -100, 3], ['bl_spawn_south', 'spawn_edge', -8, 97, 3],
    ['bl_vantage_terrace', 'vantage', 29, 90, 2.5], ['bl_vantage_balcony', 'vantage', 30, -58, 2.5], ['bl_vantage_deck', 'vantage', 0, -103, 3],
    ['bl_hide_alley', 'hide', -36.5, -44, 2], ['bl_hide_market', 'hide', 31, -68, 2], ['bl_hide_arcade', 'hide', -22.8, -60, 2], ['bl_hide_planter', 'hide', 2.6, -50, 1.5],
    ['bl_npc_circus', 'npc', 8.5, 6, 1.5], ['bl_npc_arcade', 'npc', -17, -8, 1.5], ['bl_npc_market', 'npc', 20, -52, 1.5], ['bl_npc_terrace', 'npc', 24, 70, 1.5], ['bl_npc_deck', 'npc', -6, -95, 1.5],
    ['bl_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['bl_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'brightline', indoor: false }));
}

function batch3(ctx, x, z) {
  const { batch, M, col } = ctx;
  batch.put(box(5.6, 0.5, 1.2), M.stoneUpper, V(x, 0.25, z));
  batch.put(box(5.5, 0.04, 1.1), M.gold, V(x, 0.5, z), 0, null, { cast: false });
  addShrubs(batch, M, x, 0.5, z, 5.2, 1.0, 0, (x * 7) | 0, 9);
  col.box(x, z, 2.8, 0.6, 0, 'bed');
}

const CROWD = {
  loops: [
    [[-8, 88], [-8, 50], [-8, 20], [-8, -20], [-8, -60], [-8, -84], [7, -84], [7, -40], [7, 0], [7, 40], [7, 88]],
    [[-19, 80], [-19, 40], [-19, 0], [-19, -40], [-19, -84], [-13, -84], [-13, 0], [-13, 80]],
    [[12, -48], [24, -46], [26, -62], [14, -66]],
    [[11, 52], [24, 53], [24, 72], [22, 88], [18, 70], [24, 58]],
    [[-8, 4], [0, -8], [8, 4], [0, 14]],
    [[-4, 60], [5, 30], [-5, 4], [5, -30], [-4, -60], [5, -80]],
    [[-9, -80], [0, -98], [9, -80]],
  ],
  talk: [[-6, 46], [6, 22], [-6, -6], [6, -44], [-18, 16], [-18, -46], [20, -60], [4, 86], [-4, 74], [8, -70]],
};

export const BRIGHTLINE = {
  id: 'brightline', name: 'Brightline Boulevard', layout: BL_LAYOUT, bounds: BL_LAYOUT.bounds, build: buildBrightline, crowd: CROWD, batchCell: 96,
  ambience: {
    sun: [1.0, 0.9, 0.78], sunI: 3.6, hemiSky: 0xa8c8ff, hemiGround: 0x3c4450, hemiI: 0.26,
    fog: [0.50, 0.60, 0.74], fogDensity: 0.0006, env: 0.8,
    gain: [0.97, 1.0, 1.05], lift: [0.0, 0.004, 0.012], sat: 1.12, contrast: 1.16,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8] }),
};

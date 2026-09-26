import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { HOLO_ART, createHoloMaterial, faceCamera } from './holo.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function locker(ctx, x, z, rot) {
  const { batch, M, col } = ctx;
  batch.put(box(3.2, 2.6, 0.9), M.stoneUpper, V(x, 1.3, z), rot);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const lx = -1.15 + i * 0.77, ly = 0.55 + j * 0.72;
    batch.put(box(0.66, 0.6, 0.06), j === 1 && i === 2 ? M.blueGlow : M.darkMetal, V(x + lx * c + 0.46 * s, ly, z - lx * s + 0.46 * c), rot, null, { cast: false });
  }
  batch.put(box(3.3, 0.1, 1.0), M.gold, V(x, 2.62, z), rot);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.38), createHoloMaterial(HOLO_ART.sign('NEXUS PARCEL'), { bright: 2.6, alpha: 0.9, time: ctx.time }));
  sign.position.set(x + 0.5 * s, 3.1, z + 0.5 * c); sign.rotation.y = rot; sign.layers.enable(REFLECT_LAYER);
  ctx.scene.add(sign); faceCamera(ctx, sign);
  col.box(x, z, 1.65, 0.5, rot, 'locker');
}

function stall(ctx, x, z, rot, hue) {
  const { batch, M, col } = ctx;
  batch.put(box(2.6, 1.0, 1.1), M.stoneUpper, V(x, 0.5, z), rot);
  batch.put(box(2.7, 0.06, 1.2), M.gold, V(x, 1.02, z), rot);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-1.3, 1.3]) batch.put(box(0.08, 2.75, 0.08), M.chrome, V(x + k * c - 0.7 * s, 1.37, z - k * s - 0.7 * c), rot);
  const aw = new THREE.BoxGeometry(3.0, 0.08, 1.9); aw.rotateX(-0.22);
  batch.put(aw, hue ? M.canopyA : M.canopyB, V(x - 0.05 * s, 2.62, z - 0.05 * c), rot);
  batch.put(box(3.02, 0.14, 0.06), M.gold, V(x + 0.93 * s, 2.42, z + 0.93 * c), rot, null, { cast: false });
  batch.put(box(2.2, 0.35, 0.05), M.warmGlow, V(x + 0.56 * s, 0.75, z + 0.56 * c), rot, null, { cast: false });
  for (let i = 0; i < 4; i++) batch.put(new THREE.IcosahedronGeometry(0.14, 0), i % 2 ? M.gold : M.blueGlow, V(x + (i - 1.5) * 0.5 * c, 1.18, z - (i - 1.5) * 0.5 * s), i, null, { cast: false });
  col.box(x, z, 1.35, 0.6, rot, 'stall');
}

function relay(ctx, x, z) {
  const { batch, M, col, scene } = ctx;
  batch.put(lathe([[0, 0], [1.3, 0], [1.3, 0.15], [0.5, 0.35], [0.35, 4.2], [0.6, 4.4], [0, 4.4]], 24), M.stoneUpper, V(x, 0, z));
  batch.put(new THREE.TorusGeometry(0.9, 0.08, 8, 40), M.gold, V(x, 3.2, z));
  batch.put(new THREE.TorusGeometry(0.9, 0.05, 8, 40).rotateY(Math.PI / 2), M.blueGlow, V(x, 3.2, z), 0, null, { cast: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), createHoloMaterial(HOLO_ART.sign('TRANSIT RELAY'), { bright: 2.8, alpha: 0.9, time: ctx.time }));
  sign.position.set(x, 4.9, z); sign.layers.enable(REFLECT_LAYER); scene.add(sign); faceCamera(ctx, sign);
  const ring = ctx.makePadRing(1.6, [0.5, 0.9, 1.0], true); ring.position.set(x, 0.02, z); scene.add(ring);
  col.circle(x, z, 0.6, 'relay');
  ctx.interactables.push({ id: 'relay', label: 'Transit Relay', x, z, r: 2.4 });
}

function dumpster(ctx, x, z, rot) {
  const { batch, M, col } = ctx;
  batch.put(box(2.2, 1.3, 1.2), M.dumpster, V(x, 0.65, z), rot);
  batch.put(box(2.3, 0.1, 1.3), M.darkMetal, V(x, 1.35, z), rot);
  col.box(x, z, 1.15, 0.65, rot, 'dumpster');
}

function crate(ctx, x, z, s = 1, y = 0, rot = 0) {
  const { batch, M, col } = ctx;
  batch.put(box(1.2 * s, 1.0 * s, 1.2 * s), M.crate, V(x, y + 0.5 * s, z), rot);
  batch.put(box(1.24 * s, 0.08, 1.24 * s), M.darkMetal, V(x, y + 0.9 * s, z), rot, null, { cast: false });
  if (!y) col.box(x, z, 0.62 * s, 0.62 * s, rot, 'crate');
}

// Service lanes, the loading yard, lockers, market and relay, plus the tagged `sites` list for missions.
export function buildSites(ctx) {
  const { batch, M, col } = ctx;
  // NW service lane
  batch.put(box(5, 6, 0.6), M.stone, V(-33.5, 3, -86.3));
  batch.put(box(2.2, 3, 0.1), M.shopGlow, V(-33.5, 1.6, -85.95), 0, null, { cast: false });
  col.box(-33.5, -91, 3, 5, 0, 'laneEnd');
  dumpster(ctx, -35, -76, Math.PI / 2); crate(ctx, -32.2, -82, 0.9); crate(ctx, -32.2, -82, 0.7, 0.9, 0.4);
  for (let z = -70; z > -86; z -= 4) batch.put(box(0.25, 0.25, 4), M.darkMetal, V(-35.7, 4.5, z), 0, null, { cast: false });
  // NE lane + yard
  batch.put(box(15, 7, 0.8), M.stone, V(33.5, 3.5, -97.2));
  batch.put(box(0.8, 7, 18), M.stone, V(40.8, 3.5, -88.5));
  batch.put(box(6, 4.2, 0.12), M.shopGlow, V(33, 2.2, -96.75), 0, null, { cast: false });
  batch.put(box(6.4, 0.3, 0.3), M.gold, V(33, 4.45, -96.7));
  for (const [x, z, s, st] of [[28, -84, 1, 2], [29.4, -84, 1, 1], [38, -83, 1.2, 1], [37.6, -93, 1, 2], [28.5, -93.5, 1.1, 1], [36, -90, 0.8, 0]]) {
    crate(ctx, x, z, s, 0, 0.2 * st);
    for (let k = 1; k <= st - 1; k++) crate(ctx, x, z, s * 0.85, k * s, 0.3 * k);
  }
  dumpster(ctx, 29, -71, Math.PI / 2);
  batch.add(cyl(0.25, 0.3, 9, 39.6, 0, -95.5, 10), M.darkMetal);
  batch.put(box(0.4, 0.4, 9), M.gold, V(39.6, 9, -91.5), 0, null, { cast: false });
  batch.put(box(0.15, 5, 0.15), M.darkMetal, V(39.6, 6.5, -87.5), 0, null, { cast: false });

  locker(ctx, -26, 31, Math.PI * 0.85);
  locker(ctx, 36.5, -30, -Math.PI / 2);
  locker(ctx, -12.5, -80.8, 0);
  const mk = [[-24, -32, 0.55, 1], [-28, -38, 0.75, 0], [-18, -38, 0.3, 0], [-22, -45, 0.2, 1]];
  for (const [x, z, r, h] of mk) stall(ctx, x, z, r, h);
  relay(ctx, 27, 29);

  const T = ctx.layout.terrace;
  const S = [
    ['plaza_center', 'plaza', 0, 18, 8], ['plaza_west', 'plaza', -22, 4, 6], ['plaza_east', 'plaza', 24, -4, 6], ['boulevard_mid', 'plaza', 0, -52, 6],
    ['fountain_plaza', 'fountain', 0, 0, 8], ['fountain_falls', 'fountain', -47, -57, 6],
    ['park_terrace', 'park', -6, 64, 8], ['park_ring', 'park', -18, 16, 5],
    ['market_row', 'market', -22, -38, 7],
    ['locker_sw', 'locker', -25.4, 32.2, 2.5], ['locker_east', 'locker', 35.2, -30, 2.5], ['locker_hall', 'locker', -12.5, -79.4, 2.5],
    ['alley_nw', 'alley', -33.5, -76, 3], ['alley_ne', 'alley', 29.5, -74, 3],
    ['rooftop_terrace_w', 'rooftop', -38, 52, 6], ['rooftop_terrace_e', 'rooftop', 26, 52, 6],
    ['warehouse_yard', 'warehouse', 33, -88, 6],
    ['lobby_hall', 'lobby', 0, -78, 5], ['lobby_atrium', 'lobby', -38, 8, 4],
    ['relay', 'relay', 27, 31.5, 2.5],
    ['spawn_nw_lane', 'spawn_edge', -33.5, -84, 3], ['spawn_ne_yard', 'spawn_edge', 34, -94, 3], ['spawn_sw_terrace', 'spawn_edge', -46, 76, 3], ['spawn_se_terrace', 'spawn_edge', 32, 76, 3],
    ['overlook_n', 'vantage', 46, -42, 3], ['overlook_s', 'vantage', 46, 8, 3], ['vantage_terrace', 'vantage', 0, 40, 3],
    ['hide_market', 'hide', -30, -44, 2], ['hide_colonnade', 'hide', -44, 20, 2], ['hide_yard', 'hide', 37, -86, 2], ['hide_lane', 'hide', -34.5, -80, 2],
    ['npc_fountain', 'npc', 7.5, 8, 1.5], ['npc_kiosk', 'npc', -12, 16, 1.5], ['npc_boulevard', 'npc', -8, -44, 1.5], ['npc_terrace', 'npc', 10, 46, 1.5], ['npc_overlook', 'npc', 44, -38, 1.5],
    ['contract_terminal', 'terminal', ctx.layout.kiosk.x, ctx.layout.kiosk.z, 3], ['warehouse_link', 'link_pad', ctx.layout.pad.x, ctx.layout.pad.z, 2.6],
  ];
  const sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'aurum_plaza', indoor: false }));
  ctx.sites = sites;
  return sites;
}

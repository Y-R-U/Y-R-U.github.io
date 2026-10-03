// ⛵ Boatyard: a hull is built on the berth (ribs → planks → paint), the tower crane lowers the mast, and the finished
// yacht slides down the slipway and sails out. L1 shed → L25 steel gantry + floodlights → L100 superyacht hangar.
import * as THREE from 'three';
import { hullGeo, extras, flock, post, swag, ripple, linkVan, LINK_BAY, fq, seaPlane } from './fishchips.js?v=20261004b';

const QZ = -8.2, WY = -0.55;

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'boatyard', line, palette, rng, seed: 41,
    colors: {
      accent: '#e44b3c', timber: '#8b6a4e', timber2: '#6f533d', teak: '#b98a5e', rope: '#d8bf8a', navy: '#3f5577', crane: '#f2b84b',
      shed: '#9cc3d6', shed2: '#e8d3a8', concrete: '#d3cabd', rail: { c: '#7d7f8c', r: 0.35, m: 0.6 }, steel: { c: '#c8ccd2', r: 0.3, m: 0.7 },
      sail: '#fbf8f2', spark: { c: '#fff2a8', r: 0.3, g: 3.0 }, flood: { c: '#fff1c4', r: 0.3, g: -2 },
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const HX = 0.6, HZ = -4.4, SX = -8.0, SZ = -5.8, HS = 1.32;

  slipway(b);
  slipway(lot);
  shed(b, SX, SZ);
  for (const x of [-11.2, -8.6, 4.8, 7.2, 10.6]) post(b, x, QZ + 0.35, 0.9);
  swag(b, [7.2, 0.62, QZ + 0.35], [10.6, 0.62, QZ + 0.35]);
  swag(b, [-11.2, 0.62, QZ + 0.35], [-8.6, 0.62, QZ + 0.35]);
  for (const [x, z, r, a] of [[-5.2, -13.0, 1.5, 0.8], [9.6, -15.6, 1.2, 2.6], [4.6, -18.5, 1.0, 4.4]]) ripple(b, kit, x, z, r, { a0: a });
  foam(b);
  const sea = seaPlane(kit, P, { x1: 13.5 + 34, fade1: 28 });
  sea.hull(0, 6.4, -11.6, 0.15, 2.9, 1.05, 1, 0);
  yacht(b, 6.4, -11.6, 0.15, { sail: false, hull: '#4f8fb5' });
  timberStack(b, -3.4, -2.2);
  b.slab('timber2', -3.4, 0.82, -2.2, 0.9, 0.04, 2.4, { round: 0.01 });
  K.crate(b, -1.6, -1.8, { ry: 0.3 });
  K.lamp(b, 11.6, -5.0);
  K.planter(b, -11.6, -3.8, { s: 0.9, flowers: true });
  sawhorse(b, -3.6, -5.2, 0.3);
  drums(b, 3.6, 0.9);
  coil(b, 5.0, 1.6);
  dinghy(b, 6.6, 0.4);

  // L25: two floodlight masts flanking the berth, signal-flag bunting from the shed
  {
    for (const [x, z] of [[HX - 2.6, -7.5], [HX + 2.7, -7.5]]) {
      t1.slab('concrete', x, 0, z, 0.7, 0.3, 0.7, { round: 0.08 });
      t1.cyl('#5f6b7e', x, 0.25, z, 0.13, 5.2, 0, { sides: 9, taper: 0.7 });
      for (let i = 0; i < 6; i++) t1.slab('crane', x, 0.5 + i * 0.8, z + 0.13, 0.05, 0.05, 0.05, { round: 0.02, noAo: true });
      t1.slab('#5f6b7e', x, 5.35, z, 1.5, 0.14, 0.18, { round: 0.05 });
      for (const s of [-1, 1]) {
        t1.slab('#3a3f4c', x + s * 0.5, 5.0, z + 0.05, 0.46, 0.4, 0.38, { round: 0.1, rx: -0.5 });
        t1.slab('flood', x + s * 0.5, 4.98, z + 0.24, 0.36, 0.28, 0.04, { rx: -0.5, noAo: true, round: 0.04 });
      }
      t1.ball('accent', x, 5.55, z, 0.09, { detail: 0, g: 0.6 });
    }
    K.bunting(t1, [HX - 2.6, 4.6, -7.5], [HX + 2.7, 4.6, -7.5], { sag: 0.8, colors: ['#e44b3c', '#f6d35c', '#4f8fb5', '#fbf8f2', '#3f5577'] });
  }

  // L100: superyacht hangar on piles over the water, a sleek bow nosing out
  {
    const x = -6.4, z = -13.4;
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) t2.cyl('timber2', x - 3.3 + i * 2.2, WY - 1.4, z + s * 2.8, 0.18, 1.6, 0, { aoBase: -1.3, sides: 7 });
    t2.slab('concrete', x, WY + 0.15, z, 7.4, 0.3, 6.2, { aoBase: -1.3, round: 0.08 });
    t2.slab('#f6f1e7', x, WY + 0.4, z + 2.9, 7.0, 3.1, 0.2, { aoBase: -1.3, round: 0.08 });
    t2.slab('#f6f1e7', x - 3.4, WY + 0.4, z, 0.2, 3.1, 5.8, { aoBase: -1.3, round: 0.08 });
    t2.add(S.prism(13, 1, 1, 1), '#e8eef0', { aoBase: -1.3, x: x - 3.5, y: WY + 3.4, z, sx: 3.0, sy: 7.0, sz: 2.4, rz: -Math.PI / 2, r: 0.4, m: 0.3 });
    for (let i = 0; i < 4; i++) t2.slab('#c9483f', x - 2.6 + i * 1.75, WY + 3.4 + 2.35, z, 0.12, 0.12, 5.8, { aoBase: -1.3, round: 0.03 });
    t2.slab('window', x, WY + 1.9, z + 3.02, 5.6, 0.7, 0.04, { aoBase: -1.3, noAo: true, g: -0.9 });
    t2.add(hullGeo(kit, { len: 6.5, beam: 2.6, depth: 1.6, rise: 0.3, top: '#fbf8f2', stripe: '#2f3a3c', bottom: '#2f3a3c', deck: '#b98a5e' }), null, { aoBase: -1.3, x: x + 1.2, y: WY - 0.5, z: z - 0.4, r: 0.3 });
    t2.slab('#2f3a3c', x + 2.6, WY + 1.1, z - 0.4, 1.8, 0.7, 1.7, { aoBase: -1.3, round: 0.25, taper: 0.25 });
    t2.slab('accent', x - 1.2, WY + 3.6, z + 3.05, 1.8, 0.5, 0.06, { aoBase: -1.3, round: 0.06 });
  }

  // For sale: weedy berth, a sign, a broken dinghy
  K.signPost(lot, HX + 2.4, HZ + 2.6, { c: 'white', w: 1.0 });
  lot.ball('accent', HX + 2.4, 1.45, HZ + 2.72, 0.12, { detail: 0 });
  lot.add(hullGeo(kit, { len: 2.6, beam: 1.1, depth: 0.5, rise: 0.12, top: '#c9bfae', stripe: '#a99d8c', bottom: '#8e8494', deck: '#8b6a4e', n: 7 }), null, { x: HX, y: 0.05, z: HZ, ry: 0.4, rz: 0.15 });

  // Hull on the berth: one mesh, geometry per build stage (spark flicker = two rib variants)
  const mk = (fn) => { const d = kit.builder(P.pal); fn(d); return d.geometry(); };
  const G = {
    ribsA: mk((d) => { ribs(d); sparks(d, 0); }), ribsB: mk((d) => { ribs(d); sparks(d, 1); }),
    planks: mk((d) => planked(d)), paint: mk((d) => painted(d, false)), rigged: mk((d) => painted(d, true)), sailing: mk((d) => { painted(d, true); sailUp(d); }),
  };
  const hull = new THREE.Mesh(G.ribsA, kit.materials.uber);
  hull.castShadow = hull.receiveShadow = true;
  P.group.add(hull);
  const thr = extras(kit, P, P.pal, [
    (e) => { cradle(e, 5.0, HZ, 0.8); e.add(hullGeo(kit, { len: 3.6, beam: 1.5, depth: 1.0, rise: 0.25, top: '#b98a5e', stripe: '#a5774f', bottom: '#9c6b45', deck: '#c79a6b', n: 9 }), null, { x: 5.0, y: 0.5, z: HZ, ry: Math.PI / 2, r: 0.6 }); },
    (e) => { ladder(e, HX - 1.75, HZ + 0.4, 0.3); paintKit(e, HX - 2.2, HZ - 1.6); },
    (e) => { kit.vehicles.van(e, 9.4, -0.6, Math.PI, 'navy'); e.slab('timber2', 11.7, 0.45, -0.6, 2.4, 0.12, 1.2, { round: 0.04 }); for (const s of [-1, 1]) e.add(S.drum(9, 0.28, 0.16), 'dark', { x: 11.9, y: 0.28, z: -0.6 + s * 0.62, rx: Math.PI / 2 }); },
    () => {},
    (e) => { e.slab('shed2', -1.6, 0, -1.4, 1.3, 1.3, 1.1, { round: 0.1 }); e.add(K.roofGeo(1.1, 1.3, 0.5, { col: S.rgb('#c9483f'), over: 0.12, overZ: 0.1 }), null, { x: -1.6, y: 1.3, z: -1.4, ry: Math.PI / 2 }); e.add(S.drum(11, 0.3, 0.7), 'crane', { x: -1.6, y: 0.62, z: -0.7, rx: 0 }); },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => { for (let i = 0; i < 6; i++) e.slab(i % 2 ? 'teak' : '#c79a6b', -9.8, i * 0.13, -6.8 + (i % 2) * 0.05, 2.8, 0.12, 0.3 + (i % 3) * 0.05, { round: 0.03, ry: 0.08 * (i % 2) }); },
    (e) => { const cs = ['#e44b3c', '#4f8fb5', '#f2b84b', '#7fbf7a', '#f2a6bd']; for (let i = 0; i < 7; i++) e.cyl(cs[i % 5], -3.0 + (i % 4) * 0.36 + (i > 3 ? 0.18 : 0), i > 3 ? 0.42 : 0, -2.9 + (i % 2) * 0.1, 0.16, 0.4, 0, { sides: 9, taper: 1 }); },
    (e) => { e.slab('timber', 3.4, 0, -1.6, 0.12, 3.2, 0.12, { round: 0.03 }); const m = new S.Mesh(); m.tri([3.45, 0.4, -1.6], [3.45, 3.1, -1.6], [5.0, 0.5, -1.6], S.rgb('#e44b3c')); m.tri([5.0, 0.5, -1.62], [3.45, 3.1, -1.62], [3.45, 0.4, -1.62], S.rgb('#c9483f')); e.add(m.geo(), null, { r: 0.7, noAo: true }); },
    (e) => { e.add(hullGeo(kit, { len: 3.4, beam: 1.4, depth: 0.8, rise: 0.3, top: '#e44b3c', stripe: '#fbf8f2', bottom: '#2f3a3c', deck: '#b98a5e', n: 9 }), null, { x: -1.4, y: WY - 0.3, z: -11.6, ry: 0.3, r: 0.35 }); e.slab('white', -1.6, WY + 0.5, -11.55, 1.2, 0.5, 1.0, { aoBase: -1.3, round: 0.12, taper: 0.15, ry: 0.3 }); },
  ]);

  const tw = kit.builder(P.pal);
  tw.slab('timber2', 0, 0.28, 0, 2.3, 0.08, 0.7, { round: 0.03 });
  for (const s of [-1, 1]) tw.add(S.drum(9, 0.2, 0.12), 'dark', { x: -0.3, y: 0.2, z: s * 0.42, rx: Math.PI / 2 });
  tw.slab('timber2', 1.4, 0.24, 0, 0.6, 0.06, 0.08, { round: 0.02 });
  tw.add(hullGeo(kit, { len: 2.2, beam: 0.9, depth: 0.5, rise: 0.15, top: '#fbf8f2', stripe: '#e44b3c', bottom: '#4f8fb5', deck: '#b98a5e', n: 7 }), null, { y: 0.36, r: 0.35 });
  tw.cyl('white', 0.1, 0.8, 0, 0.03, 1.6, 0, { sides: 5 });
  tw.slab('white', -0.1, 0.8, 0, 0.6, 0.35, 0.5, { round: 0.1, taper: 0.2 });
  P.pile({ at: [8.2, 0, -5.2], ry: Math.PI / 2, geo: tw.geometry({ ao: 0.2, aoH: 0.6 }), size: 0.95, max: 6, layout: [[1.6, 0, 0.4, 0], [1.6, 0, -0.9, 0], [-0.8, 0, 0.4, 0], [-0.8, 0, -0.9, 0], [-3.2, 0, 0.4, 0], [-3.2, 0, -0.9, 0]], range: [0, 1] });

  const gulls = flock(kit, P, 2, 'gull');
  const van = linkVan(kit, P);
  van.position.set(LINK_BAY.boatyard[0], 0, LINK_BAY.boatyard[1]);
  van.rotation.y = 0;
  const staff = P.crowd({ count: 5, seed: 11, scale: 1.36 });
  staff.look(0, { top: '#f2b84b', bot: '#3f5577', style: 1, hair: 0, skin: 2, acc: 0 }).body(0, 1.2, 0.85, 0.95);
  staff.look(1, { top: '#4f8fb5', bot: '#3f5577', style: 3, hair: 5, skin: 1 }).body(1, 1.2, 0.85, 0.92);
  staff.look(2, { top: '#e44b3c', bot: '#3f5577', style: 2, hair: 3, skin: 4 }).body(2, 1.2, 0.85, 0.9);
  staff.look(3, { top: '#7fb5a8', style: 0, hair: 1, skin: 0 }).body(3, 1.15, 0.85, 0.8);
  staff.look(4, { top: '#f6f1e7', style: 4, hair: 6, skin: 3 }).body(4, 1.2, 0.85, 0.92);
  const folk = P.crowd({ count: 4, seed: 33, scale: 1.36 });
  P.walkers(folk, { ids: [0, 1, 2], paths: [[[-12, -0.8], [12, -1.2]], [[12, -2.0], [-12, -1.0]], [[-3, -1.6], [6, -2.4]]], speed: 0.9, loop: 'wrap', ownedOnly: false });

  let stageKey = '';

  return Object.assign(P.done({
    w: 13.5, cardW: 16.5, d: 9, h: 5,
    camera: { pos: [-7.4, 12.0, 8.4], look: [-0.1, 1.0, -5.4], fov: 32 },
    exitWater: [[HX, -14], [HX + 3, -19], [12, -20]],
    exit: [[HX, HZ], [HX, -1], [12, 3.6]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      const t = time;
      const per = Math.max(18, (stats?.cycleSec ?? 6) * 5);
      const ph = owned ? (t % per) / per : 0.3;
      let key, x = HX, y = 0.5, z = HZ, ry = Math.PI / 2, rx = 0;
      if (ph < 0.24) key = (t * 9) % 2 < 1 ? 'ribsA' : 'ribsB';
      else if (ph < 0.46) key = 'planks';
      else if (ph < 0.66) key = 'paint';
      else key = 'rigged';
      if (ph >= 0.72 && ph < 0.86) {
        const u = (ph - 0.72) / 0.14, e = u * u;
        z = HZ - e * 10.5;
        const zr = Math.min(z, QZ + 0.2);
        y = z > QZ + 0.2 ? 0.5 : Math.max(WY - 0.45, 0.5 - (QZ + 0.2 - zr) * 0.32);
        rx = z < QZ + 0.4 && y > WY - 0.44 ? 0.3 : 0;
      } else if (ph >= 0.86) {
        const u = (ph - 0.86) / 0.14;
        key = 'sailing';
        z = HZ - 10.5 - u * 26; x = HX + u * u * 14; ry = Math.PI / 2 - u * 0.5;
        y = WY - 0.45 + Math.sin(t * 1.4) * 0.05;
      }
      if (key !== stageKey) { stageKey = key; hull.geometry = G[key]; }
      if (owned && z < QZ - 1.2) sea.hull(1, x, z, ry, 2.6 * HS, 1.0 * HS, 1, key === 'sailing' ? 0.8 : 0); else sea.off(1);
      if (owned && (stats?.boosts ?? 0) >= 4) sea.hull(2, -1.4, -11.6, 0.3, 1.8, 0.75, 1, 0); else sea.off(2);
      if (ctx.vt >= 2) sea.hull(3, -5.2, -13.8, 0, 3.3, 1.35, 1, 0); else sea.off(3);
      hull.visible = owned;
      hull.position.set(x, y, z);
      hull.scale.setScalar(HS);
      hull.rotation.set(0, ry, 0);
      hull.rotation.z = -rx;
      const sup = stats?.supply;
      van.visible = owned && !!sup?.on && sup.from === 'boatyard' && sup.phase > 0.45 && sup.phase < 0.6;
      thr.show(owned ? stats?.sigmaUpgrades ?? 0 : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);

      if (owned) {
        const building = ph < 0.7;
        staff.set(0, HX - 2.0, 0.02, HZ - 0.4, Math.PI / 2 - 0.5, building ? 3 : 4, 0, 5.5);
        staff.set(1, HX + 0.4, 0.02, HZ + 4.2, Math.PI - 0.3, building ? 3 : 4, 1.2, 4.2);
        if ((stats?.sigmaUpgrades ?? 0) >= 4) staff.set(2, SX + 0.6, 0.02, SZ - 0.2, 0.3, 7, 0.5, 3); else staff.hide(2);
        if (stats?.kid) staff.set(3, HX - 1.0, 0.02, HZ + 2.2, 0.4, 3, 2.2, 4); else staff.hide(3);
        const cw = (t * 0.3) % 2, cx2 = cw < 1 ? cw : 2 - cw;
        staff.set(4, -3.4 + cx2 * 2.6, 0.02, -3.2 - cx2 * 0.4, cw < 1 ? Math.PI / 2 : -Math.PI / 2, 2, 0, 4.6);
      } else for (let i = 0; i < 5; i++) staff.hide(i);
      for (let i = 0; i < 2; i++) {
        const a = t * (0.3 + i * 0.1) + i * 2;
        gulls.set(i, 2 + Math.cos(a) * (6 + i * 2), 7 + i + Math.sin(a * 2) * 0.4, -12 + Math.sin(a) * 4, -a, 0.6 + Math.abs(Math.sin(t * 6 + i)) * 0.6, 0.35, 1);
      }
      gulls.commit();
    },
  }), { focus: [0.5, -5.5] });

  function slipway(B) {
    for (const s of [-1, 1]) B.slab('rail', HX + s * 0.7, 0.0, HZ + 0.6, 0.14, 0.1, 5.6, { round: 0.03, taper: 0 });
    B.slab('concrete', HX, -0.02, HZ + 0.6, 2.4, 0.06, 5.8, { round: 0.03, taper: 0 });
    const L = 8.2, z0 = QZ + 0.3, drop = 2.2, a = Math.atan2(drop, L);
    B.slab('concrete', HX, 0.12 - drop / 2, z0 - L / 2, 2.6, 0.3, Math.hypot(L, drop), { aoBase: -2.4, round: 0.05, taper: 0, rx: -a });
    for (const s of [-1, 1]) B.slab('rail', HX + s * 0.7, 0.28 - drop / 2, z0 - L / 2, 0.14, 0.1, Math.hypot(L, drop), { aoBase: -2.4, round: 0.03, taper: 0, rx: -a });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) B.cyl('timber2', HX + s * 1.15, WY - 1.6, z0 - 1.8 - i * 2.0, 0.14, 1.4 + (3 - i) * 0.4, 0, { aoBase: -2.4, sides: 7 });
    cradle(B, HX, HZ, HS);
  }

  function cradle(B, x, z, s) {
    for (const dz of [-1.6, 0, 1.6]) {
      B.slab('timber2', x, 0.02, z + dz * s, 1.9 * s, 0.22, 0.32, { round: 0.04 });
      for (const sd of [-1, 1]) B.slab('timber', x + sd * 0.62 * s, 0.2, z + dz * s, 0.22, 0.42 * s, 0.26, { round: 0.04, rz: sd * 0.4 });
    }
  }

  function shed(B, x, z) {
    const W = 3.8, D = 3.2, H = 2.6, T = 0.2;
    B.slab('concrete', x, 0, z, W + 0.2, 0.12, D + 0.2, { round: 0.04 });
    B.slab('shed', x, 0.1, z - D / 2 + T / 2, W, H, T, { round: 0.06, taper: 0 });
    for (const s of [-1, 1]) B.slab('shed', x + s * (W / 2 - T / 2), 0.1, z, T, H, D, { round: 0.06, taper: 0 });
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) B.slab('#86b1c7', x + s * (W / 2 + 0.01), 0.15, z - D / 2 + 0.2 + i * 0.4, 0.04, H - 0.1, 0.06, { round: 0.01, taper: 0, noAo: true });
    B.add(K.roofGeo(W, D, 1.4, { col: S.rgb('#c9483f'), over: 0.3, overZ: 0.3 }), null, { x, y: H + 0.1, z });
    const gm = new S.Mesh();
    gm.tri([-W / 2, 0, 0], [W / 2, 0, 0], [0, 1.4, 0], S.rgb('#9cc3d6'));
    gm.tri([W / 2, 0, -0.03], [-W / 2, 0, -0.03], [0, 1.4, -0.03], S.rgb('#9cc3d6'));
    B.add(gm.geo(), null, { x, y: H + 0.1, z: z + D / 2 - 0.02, noAo: true });
    B.add(gm.geo(), null, { x, y: H + 0.1, z: z - D / 2 + 0.02, ry: Math.PI, noAo: true });
    B.slab('timber2', x, H - 0.25, z + D / 2, W, 0.3, 0.16, { round: 0.04 });
    // ship's wheel sign on the gable
    const wy = H + 0.65, wz = z + D / 2 + 0.06;
    B.cyl('timber', x, wy, wz, 0.42, 0.06, 0, { sides: 11, rx: Math.PI / 2 });
    B.cyl('#f6d35c', x, wy, wz + 0.04, 0.3, 0.06, 0, { sides: 11, rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; B.slab('timber', x, wy - 0.03, wz + 0.08, 1.0, 0.06, 0.05, { round: 0.02, rz: a }); }
    // inside: workbench, oars, hanging lamp, half-built dinghy on trestles
    B.slab('timber', x - 0.8, 0.1, z - D / 2 + 0.6, 2.2, 0.85, 0.6, { round: 0.04 });
    for (let i = 0; i < 4; i++) B.slab('#4f4a5c', x - 1.6 + i * 0.5, 1.4, z - D / 2 + 0.24, 0.06, 0.4, 0.03, { round: 0.01 });
    for (let i = 0; i < 3; i++) B.slab('timber', x + 1.6, 0.2, z - 0.6 + i * 0.25, 0.08, 2.0, 0.12, { round: 0.03, rz: 0.12 });
    B.cone({ c: '#f2b84b', g: 0.6 }, x, H - 0.45, z, 0.25, 0.22, 0, { sides: 7 });
    sawhorse(B, x - 0.6, z + 0.6, 0);
    sawhorse(B, x + 0.8, z + 0.6, 0);
    B.add(hullGeo(kit, { len: 2.4, beam: 0.95, depth: 0.45, rise: 0.12, top: '#c79a6b', stripe: '#b98a5e', bottom: '#a5774f', deck: '#c79a6b', n: 7 }), null, { x: x + 0.1, y: 0.62, z: z + 0.6, rx: Math.PI, ry: 0.05, r: 0.7 });
  }

  function sawhorse(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    B.slab('timber', 0, 0.58, 0, 0.12, 0.08, 1.0, { parent: M, round: 0.02 });
    for (const dz of [-0.4, 0.4]) for (const s of [-1, 1]) B.slab('timber2', s * 0.12, 0, dz, 0.06, 0.62, 0.06, { parent: M, round: 0.01, rz: s * 0.25 });
  }

  function timberStack(B, x, z) {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3 - (i > 2 ? 1 : 0); j++) B.slab(i % 2 ? 'timber' : '#a5774f', x - 0.3 + j * 0.32, i * 0.16, z, 0.3, 0.15, 2.6, { round: 0.03, ry: (B.rnd() - 0.5) * 0.04 });
  }

  function foam(B) {
    const m = new S.Mesh(), col = S.rgb('#f4fbf8'), y = WY + 0.035;
    for (let i = 0; i < 9; i++) {
      const a0 = Math.PI * (0.05 + i * 0.1), a1 = a0 + 0.08, r = 1.9 + (i % 2) * 0.35, cz = -11.2;
      fq(m, [HX + Math.cos(a0) * r, y, cz - Math.sin(a0) * r * 0.5], [HX + Math.cos(a1) * r, y, cz - Math.sin(a1) * r * 0.5], [HX + Math.cos(a1) * (r + 0.16), y, cz - Math.sin(a1) * (r + 0.16) * 0.5], [HX + Math.cos(a0) * (r + 0.16), y, cz - Math.sin(a0) * (r + 0.16) * 0.5], col);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const zz = -9.6 - i * 2.0; fq(m, [HX + s * 1.3, y, zz - 0.06], [HX + s * 1.75, y, zz - 0.25], [HX + s * 1.75, y, zz - 0.13], [HX + s * 1.3, y, zz + 0.06], col); }
    B.add(m.geo(), null, { r: 0.5, noAo: true, g: 0.1 });
  }

  function drums(B, x, z) {
    for (const [dx, dz, c] of [[0, 0, '#4f8fb5'], [0.62, 0.15, '#e44b3c'], [0.25, -0.55, '#4f8fb5']]) {
      B.cyl(c, x + dx, 0, z + dz, 0.3, 0.86, 0, { sides: 9, taper: 1 });
      for (const h of [0.2, 0.62]) B.cyl('#2f3a3c', x + dx, h, z + dz, 0.31, 0.04, 0, { sides: 9, taper: 1, noAo: true });
    }
    B.contact(x + 0.3, z - 0.1, 1.6, 1.3, { k: 0.7 });
  }

  function coil(B, x, z) {
    for (let i = 0; i < 3; i++) B.cyl('rope', x, i * 0.1, z, 0.42 - i * 0.06, 0.1, 0, { sides: 11, taper: 1 });
    B.cyl('#cdb27e', x, 0.29, z, 0.12, 0.02, 0, { sides: 9 });
  }

  function dinghy(B, x, z) {
    sawhorse(B, x - 0.7, z, Math.PI / 2);
    sawhorse(B, x + 0.7, z, Math.PI / 2);
    B.add(hullGeo(kit, { len: 2.6, beam: 1.1, depth: 0.5, rise: 0.12, top: '#7fbfb0', stripe: '#fbf8f2', bottom: '#e9c46a', deck: '#b98a5e', n: 7 }), null, { x, y: 1.12, z, rx: Math.PI, r: 0.5 });
    B.contact(x, z, 2.6, 1.3, { k: 0.6 });
  }

  function ladder(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    for (const s of [-1, 1]) B.slab('timber', s * 0.22, 0, 0, 0.07, 2.3, 0.07, { parent: M, round: 0.02, rz: s * 0.04, rx: -0.25 });
    for (let i = 0; i < 6; i++) B.slab('timber2', 0, 0.3 + i * 0.36, -0.08 - i * 0.09, 0.44, 0.05, 0.06, { parent: M, round: 0.01 });
  }

  function paintKit(B, x, z) {
    for (const [dx, dz, c] of [[0, 0, '#e44b3c'], [0.42, 0.1, '#4f8fb5'], [0.2, 0.42, '#fbf8f2']]) {
      B.cyl(c, x + dx, 0, z + dz, 0.17, 0.36, 0, { sides: 9, taper: 1 });
      B.cyl('steel', x + dx, 0.36, z + dz, 0.18, 0.04, 0, { sides: 9, taper: 1 });
    }
    B.slab('timber', x - 0.3, 0.38, z + 0.3, 0.06, 0.04, 0.5, { round: 0.01, rx: 0.5 });
  }

  function ribs(d) {
    const len = 5.2, beam = 2.0, D = 1.25;
    d.slab('timber2', 0, 0, 0, len, 0.16, 0.18, { round: 0.04 });
    d.slab('timber2', len / 2 - 0.05, 0, 0, 0.18, D + 0.35, 0.16, { round: 0.04, rz: -0.25 });
    d.slab('timber2', -len / 2 + 0.08, 0, 0, 0.16, D, 1.4, { round: 0.04 });
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9, x = -len / 2 + t * len;
      const B2 = (beam / 2) * (t < 0.55 ? 0.82 + 0.18 * Math.sin((t / 0.55) * Math.PI / 2) : Math.max(0.08, Math.cos(((t - 0.55) / 0.45) * Math.PI / 2)));
      for (const s of [-1, 1]) {
        d.slab('timber', x, 0.12, s * B2 * 0.42, 0.1, 0.1, B2 * 0.9, { round: 0.02, rx: s * -0.45, taper: 0 });
        d.slab('timber', x, 0.35, s * B2 * 0.96, 0.1, D - 0.3, 0.1, { round: 0.02, rx: s * -0.12, taper: 0 });
      }
    }
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const t0 = i / 4, t1 = (i + 1) / 4, xa = -len / 2 + t0 * len, xb = -len / 2 + t1 * len;
      const Bf = (t) => (beam / 2) * (t < 0.55 ? 0.82 + 0.18 * Math.sin((t / 0.55) * Math.PI / 2) : Math.max(0.08, Math.cos(((t - 0.55) / 0.45) * Math.PI / 2)));
      const za = Bf(t0), zb = Bf(t1);
      d.slab('#c79a6b', (xa + xb) / 2, D - 0.05, s * (za + zb) / 2, Math.hypot(xb - xa, zb - za), 0.1, 0.1, { round: 0.02, taper: 0, ry: -s * Math.atan2(zb - za, xb - xa) });
    }
  }

  function sparks(d, k) {
    const pts = k ? [[0.4, 1.0, 0.95], [-1.2, 0.7, -0.9]] : [[-0.6, 1.05, 0.98], [1.1, 0.5, -0.85]];
    for (const [x, y, z] of pts) {
      d.ball('spark', x, y, z, 0.09, { detail: 0 });
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + k; d.slab('spark', x + Math.cos(a) * 0.18, y + Math.abs(Math.sin(a)) * 0.15, z, 0.2, 0.02, 0.02, { rz: a, round: 0.005, noAo: true }); }
    }
  }

  function planked(d) {
    d.add(hullGeo(kit, { len: 5.2, beam: 2.0, depth: 1.25, rise: 0.3, top: '#c79a6b', stripe: '#b98a5e', bottom: '#a5774f', deck: '#8b6a4e', n: 11 }), null, { r: 0.7 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) d.slab('#a5774f', -1.6 + i * 1.0, 0.25 + i * 0.0, s * 0.99, 0.9, 0.04, 0.02, { round: 0.01, taper: 0, noAo: true });
  }

  function painted(d, rig) {
    d.add(hullGeo(kit, { len: 5.2, beam: 2.0, depth: 1.25, rise: 0.3, top: '#d6493e', stripe: '#fbf8f2', bottom: '#33456b', deck: '#e2c49a', n: 11 }), null, { r: 0.3 });
    d.slab('#fbf8f2', -0.5, 1.2, 0, 1.8, 0.45, 1.2, { round: 0.14, taper: 0.12 });
    for (const s of [-1, 1]) d.slab('glass', -0.5, 1.35, s * 0.58, 1.2, 0.18, 0.04, { round: 0.03, noAo: true });
    d.slab('#e8d3a8', -1.8, 1.0, 0, 1.0, 0.3, 1.1, { round: 0.06 });
    trim(d, 5.2, 1.0, 1.25, {});
    if (rig) {
      for (const [x1, y1] of [[2.55, 1.55], [-2.5, 1.35]]) stay(d, [0.4, 5.55, 0], [x1, y1, 0]);
      d.cyl('white', 0.4, 1.2, 0, 0.06, 4.4, 0, { sides: 7, taper: 0.6 });
      d.slab('white', -0.6, 2.0, 0, 2.0, 0.08, 0.08, { round: 0.02 });
      d.slab('#e44b3c', -0.6, 2.12, 0, 1.9, 0.16, 0.16, { round: 0.06 });
      d.slab('#e44b3c', 0.6, 5.4, 0, 0.4, 0.2, 0.02, { round: 0.01 });
    }
  }

  function sailUp(d) {
    const m = new S.Mesh(), c = S.rgb('#fbf8f2'), c2 = S.rgb('#f2c14e');
    m.tri([0.35, 2.2, 0.02], [0.35, 5.5, 0.02], [-1.6, 2.15, 0.02], c);
    m.tri([-1.6, 2.15, -0.02], [0.35, 5.5, -0.02], [0.35, 2.2, -0.02], c);
    m.tri([0.5, 1.5, 0.02], [2.3, 1.4, 0.02], [0.5, 4.9, 0.02], c2);
    m.tri([0.5, 4.9, -0.02], [2.3, 1.4, -0.02], [0.5, 1.5, -0.02], c2);
    d.add(m.geo(), null, { r: 0.7, noAo: true });
    const w = new S.Mesh(), col = S.rgb('#f4fbf8');
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x0 = -2.6 - i * 1.2, z0 = s * (0.5 + i * 0.4), w0 = 0.1;
      fq(w, [x0, 0.42, z0 - w0], [x0 - 1.1, 0.42, z0 + s * 0.4 - w0], [x0 - 1.1, 0.42, z0 + s * 0.4 + w0], [x0, 0.42, z0 + w0], col);
    }
    d.add(w.geo(), null, { r: 0.5, noAo: true, g: 0.1 });
  }

  function yacht(B, x, z, ry, o) {
    const M = S.matrix({ pos: [x, WY - 0.42, z], ry });
    B.add(hullGeo(kit, { len: 5.6, beam: 2.0, depth: 1.2, rise: 0.3, top: o.hull, stripe: '#fbf8f2', bottom: '#2f3a3c', deck: '#b98a5e', n: 11 }), null, { aoBase: -1.3, parent: M, r: 0.3 });
    B.slab('#fbf8f2', -0.5, 1.15, 0, 1.9, 0.45, 1.2, { aoBase: -1.3, parent: M, round: 0.14, taper: 0.12 });
    B.cyl('white', 0.4, 1.15, 0, 0.06, 6.2, 0, { aoBase: -1.3, parent: M, sides: 7, taper: 0.6 });
    B.slab('#4f8fb5', -0.6, 2.1, 0, 2.0, 0.18, 0.18, { aoBase: -1.3, parent: M, round: 0.06 });
    trim(B, 5.6, 1.0, 1.2, { aoBase: -1.3, parent: M });
    for (const [x1, y1] of [[2.75, 1.5], [-2.7, 1.3]]) stay(B, [0.4, 7.3, 0], [x1, y1, 0], { aoBase: -1.3, parent: M });
  }

  function trim(B, len, beam, D, o) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) B.cyl('#dfe3e6', -len * 0.4 + i * len * 0.14, D - 0.02, s * beam * 0.43 * (i > 4 ? 0.7 : 1), 0.022, 0.48, 0, { ...o, sides: 5, taper: 1 });
      B.slab('#dfe3e6', -len * 0.05, D + 0.44, s * beam * 0.43, len * 0.72, 0.03, 0.03, { ...o, round: 0.01, noAo: true });
      for (let i = 0; i < 3; i++) B.cyl('#2f3a3c', -0.95 + i * 0.45, D + 0.17, s * 0.61, 0.06, 0.03, 0, { ...o, sides: 9, taper: 1, rx: Math.PI / 2 });
      B.slab('#dfe3e6', len * 0.36, D + 0.05, s * 0.18, 0.06, 0.5, 0.06, { ...o, round: 0.02, rx: s * 0.25 });
    }
    B.slab('#dfe3e6', len * 0.4, D + 0.5, 0, 0.06, 0.05, 0.46, { ...o, round: 0.02 });
  }

  function stay(B, a, c, o = {}) {
    const dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy);
    B.slab('#cfd4d8', (a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 0.01, 0, L, 0.02, 0.02, { ...o, round: 0.005, taper: 0, noAo: true, rz: Math.atan2(dy, dx) });
  }
}

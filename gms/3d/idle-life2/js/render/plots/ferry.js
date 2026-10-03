// ⛴️ Ferry: ticket booth, turnstile and a chunky red ferry that boards at the quay, sails out across the bay and back.
// The ferry is a plot part, so the hero view sees the same boat. L1 quay → L25 shelter + flags → L100 terminal + bigger ferry.
import * as THREE from 'three';
import { extras, flock, post, swag, lights, ripple, linkVan, LINK_BAY, fq, seaPlane } from './fishchips.js?v=20261004b';

const QZ = -8.2, WY = -0.55;
const DOCK = [-1.4, -12.6];
const TORI = new Map();

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'ferry', line, palette, rng, seed: 31,
    colors: {
      accent: '#e44b3c', red: '#d9483c', timber: '#8b6a4e', timber2: '#6f533d', rope: '#d8bf8a', navy: '#3f5577', booth: '#f6f1e7',
      sea: '#9cc3d6', glassD: { c: '#4f7f96', r: 0.1, m: 0.25 }, funnel: '#e44b3c', orange: '#f28c3c', steel: { c: '#c8ccd2', r: 0.3, m: 0.7 },
      flagA: '#e44b3c', flagB: '#4f8fb5', ticket: '#f2c14e', wake: { c: '#f4fbf8', r: 0.5, g: 0.15 }, rock: '#c9c0b6', rock2: '#b3aaa4', deck: '#d8c6a4', deck2: '#c4ae8a', cabinLit: { c: '#7a5a46', r: 0.6, g: -1.5 },
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const BX = 5.3, BZ = -6.3, TX = 2.9, TZ = -7.7, GX = 0.9;

  quayEdge(b);
  quayEdge(lot);
  const sea = seaPlane(kit, P);
  breakwater(b, -10.5, 4.5, -23.5);
  for (const [x, z, r, a] of [[-9.8, -15.5, 1.3, 0.3], [9.0, -14.6, 1.0, 2.2], [2.6, -19.5, 1.5, 4.1], [-4.0, -20.5, 1.1, 1]]) ripple(b, kit, x, z, r, { a0: a });
  booth(b, BX, BZ);
  gangway(b, GX);
  K.lamp(b, -9.6, -6.9);
  K.lamp(b, 9.4, -7.2);
  for (const [x, z] of [[-5.4, -6.8], [-2.8, -7.0]]) K.bench(b, x, z, { ry: 0.05, wood: 'timber' });
  K.planter(b, -8.6, -4.4, { s: 1.1, flowers: true });
  K.planter(b, -7.6, -6.7, { s: 0.75 });
  K.planter(b, 9.6, -4.8, { s: 0.95, flowers: true });
  for (const [x, z, ry, s] of [[8.6, -7.0, 0.4, 1], [9.4, -6.6, -0.2, 0.8]]) K.crate(b, x, z, { ry, s });
  K.crate(b, 8.9, -6.8, { ry: 0.1, y: 0.47, s: 0.75 });
  for (const sz of [-1, 1]) {
    b.cyl('steel', TX + sz * 0.55, 0, TZ, 0.07, 1.0, 0, { sides: 7, taper: 1 });
    b.slab('steel', TX + sz * 1.1, 0.85, TZ, 1.1, 0.06, 0.06, { round: 0.02 });
  }
  b.cyl('#3e3a44', TX, 0, TZ, 0.16, 1.05, 0, { sides: 9, taper: 0.9 });
  b.cyl('ticket', TX, 1.05, TZ, 0.18, 0.08, 0, { sides: 9 });
  aboard(b, -1.9, -5.2);
  trolley(b, 2.4, -5.9, 0.4);

  // L25: flags + bunting along the quay, timetable board, a glazed waiting room at the west end
  for (const x of [4.4, 10.2]) { t1.cyl('white', x, 0, QZ + 0.75, 0.05, 3.4, 0, { sides: 5 }); t1.ball('flagA', x, 3.42, QZ + 0.75, 0.07, { detail: 0 }); }
  K.bunting(t1, [4.4, 3.2, QZ + 0.75], [10.2, 3.2, QZ + 0.75], { sag: 0.5, colors: ['#e44b3c', '#f6f1e7', '#4f8fb5', '#f2c14e'] });
  t1.slab('navy', 3.9, 0, -4.2, 0.1, 2.0, 0.1, { round: 0.02 });
  t1.slab('navy', 3.9, 1.2, -4.15, 1.1, 0.8, 0.08, { round: 0.04 });
  for (let i = 0; i < 4; i++) t1.slab(i % 2 ? '#f2c14e' : '#f6f1e7', 3.9, 1.35 + i * 0.15, -4.1, 0.8, 0.05, 0.02, { round: 0.01, noAo: true });

  // L100: pastel terminal with a clock tower, east of the booth
  {
    const x = 9.6, z = -1.8;
    t2.slab('stone', x, 0, z, 4.2, 0.3, 3.0, { round: 0.06 });
    t2.slab('#9cc3d6', x, 0.3, z, 4.0, 3.0, 2.8, { round: 0.14, taper: 0.02 });
    t2.slab('trim', x, 3.25, z, 4.3, 0.2, 3.1, { round: 0.06 });
    t2.slab('glass', x - 2.02, 0.5, z, 0.06, 2.0, 2.0, { round: 0.03, noAo: true });
    t2.slab('window', x - 2.05, 1.3, z, 0.03, 1.0, 1.8, { noAo: true, g: -0.9 });
    t2.slab('#f6f1e7', x + 0.8, 3.4, z - 0.3, 1.4, 2.6, 1.4, { round: 0.1, taper: 0.06 });
    t2.disc('white', x + 0.8, 5.0, z + 0.41, 0.45, 0.06, { rx: Math.PI / 2 });
    t2.slab('#2a2a33', x + 0.8, 4.95, z + 0.46, 0.04, 0.32, 0.02, { round: 0.01 });
    t2.slab('#2a2a33', x + 0.88, 5.0, z + 0.46, 0.2, 0.04, 0.02, { round: 0.01 });
    t2.add(K.roofGeo(1.4, 1.4, 1.0, { col: S.rgb('#c9483f'), over: 0.15, overZ: 0.15 }), null, { x: x + 0.8, y: 6.0, z: z - 0.3 });
    t2.awning('accent', x - 2.4, 2.8, z, 2.6, 0.9, -Math.PI / 2, { alt: 'white' });
  }

  // For sale: chained-off quay, a dinghy and a sign
  K.signPost(lot, BX, BZ + 1.6, { c: 'white', w: 1.0 });
  K.crate(lot, BX - 1.4, BZ + 0.2, { ry: 0.2 });
  lot.ball('accent', BX, 1.45, BZ + 1.72, 0.12, { detail: 0 });

  // Ferry: one mesh, geometry swaps for docked / sailing (wake) / L100
  const geo = (big) => { const d = kit.builder(P.pal); ferryGeo(d, big); return d.geometry(); };
  const G = [geo(false), geo(true)];
  const mkFerry = () => {
    const m = new THREE.Mesh(G[0], kit.materials.uber);
    m.castShadow = m.receiveShadow = true;
    P.group.add(m);
    return m;
  };
  const ferries = [mkFerry(), mkFerry()];
  const turn = P.dynamic((d) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      d.cyl('steel', 0, 0, 0, 0.035, 0.6, a, { sides: 5, taper: 1, rz: -Math.PI / 2 });
    }
  }, { tier: 0 });
  turn.position.set(TX, 0.85, TZ);

  const route = new THREE.CatmullRomCurve3([
    [DOCK[0], DOCK[1]], [-6.5, -12.7], [-10, -15.5], [-11, -24], [-11, -60], [-9, -110], [-2, -122], [6, -112], [9, -70], [9.5, -32], [8.5, -17], [4.5, -12.4],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();

  const thr = extras(kit, P, P.pal, [
    (e) => boothWindow(e, BX + 2.4, BZ - 0.9),
    (e) => { K.bench(e, -8.4, -6.5, { ry: 0.3, wood: 'timber' }); },
    (e) => { const cx = 7.6, cz = -3.6; e.cyl('iron', cx, 0, cz, 0.07, 3.0, 0, { sides: 7 }); e.disc('white', cx, 3.1, cz + 0.15, 0.42, 0.1, { rx: Math.PI / 2 }); e.slab('#2a2a33', cx, 3.05, cz + 0.23, 0.04, 0.3, 0.02, { round: 0.01 }); e.slab('#2a2a33', cx + 0.06, 3.1, cz + 0.23, 0.2, 0.04, 0.02, { round: 0.01 }); },
    () => {},
    (e) => { for (const x of [-9.6, 9.4]) e.ball('bulb', x, 3.9, x < 0 ? -6.9 : -7.2, 0.12, { detail: 0, g: 1.4 }); lights(e, [-9.6, 3.4, -6.9], [-2, 2.9, QZ + 0.6], 9, 0.4); lights(e, [-2, 2.9, QZ + 0.6], [9.4, 3.4, -7.2], 11, 0.45); },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => anchor(e, 6.4, -3.2),
    (e) => { for (let i = 0; i < 3; i++) { e.slab('timber', 1.6 + i * 0.75, 0, -4.0, 0.1, 1.1, 0.1, { round: 0.02 }); ring(e, 1.6 + i * 0.75, 0.8, -3.92); } },
    (e) => { cafeCart(e, 2.0, -2.2); K.umbrella(e, -0.4, -1.4, { c: 'flagB', r: 1.0 }); K.table(e, -0.4, -1.4, { c: 'white', chair: 'flagB' }); },
    (e) => { e.slab('timber2', 6.8, 0, -2.0, 2.0, 0.2, 1.3, { round: 0.06 }); e.cyl('#e9c46a', 7.2, 0.2, -1.8, 0.3, 0.4, 0, { sides: 11, taper: 1 }); e.disc('white', 7.2, 0.6, -1.8, 0.28, 0.02); },
  ]);

  // waiting passengers = the stock (sat on the quay benches facing the street, then a boarding line at the gangway)
  const wait = P.crowd({ count: 8, seed: 21, scale: 1.36 });
  const waitSpots = [[-5.8, -6.62, 0.05, 5], [-5.0, -6.6, 0.05, 5], [-3.2, -6.82, 0.05, 5], [-2.4, -6.8, 0.05, 5], [GX + 0.2, -6.9, -0.4, 0], [GX - 0.6, -6.4, 0.3, 0], [-1.8, -6.6, 0.6, 6], [-5.3, -5.0, -0.5, 0]];
  const staff = P.crowd({ count: 5, seed: 7, scale: 1.36 });
  staff.look(0, { top: '#3f5577', style: 1, hair: 3, skin: 2 }).body(0, 1.2, 0.8, 0.9);
  staff.look(1, { top: '#3f5577', style: 2, hair: 0, skin: 4 }).body(1, 1.2, 0.8, 0.92);
  staff.look(2, { top: '#7fb5a8', style: 0, hair: 1, skin: 0 }).body(2, 1.15, 0.85, 0.8);
  staff.look(3, { top: '#e44b3c', style: 3, hair: 2, skin: 1 }).body(3, 1.2, 0.85, 0.92);
  staff.look(4, { top: '#f2c14e', style: 4, hair: 5, skin: 3 }).body(4, 1.2, 0.85, 0.92);
  const folk = P.crowd({ count: 7, seed: 15, scale: 1.36 });
  let docked = [true, false];
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4, 5, 6], spawn: [[12.5, -4.6], [12.5, -3.6]], counter: [BX + 1.45, BZ + 0.15], dir: [1, 0.22], gap: 0.82, faceCounter: -Math.PI / 2 + 0.45,
    exit: [[BX + 1.4, TZ + 0.1], [TX + 0.7, TZ], [TX - 0.7, TZ], [GX, QZ + 0.2], [GX, QZ - 1.6], [GX, DOCK[1] + 1.9], [GX - 0.8, DOCK[1] + 1.2]],
    serve: (s) => (docked[0] || docked[1] ? Math.max(0.9, Math.min(2.6, s?.cycleSec ?? 2)) : 1e9),
    carry: false,
  });
  const gulls = flock(kit, P, 2, 'gull');
  const van = linkVan(kit, P);
  van.position.set(LINK_BAY.ferry[0], 0, LINK_BAY.ferry[1]);
  van.rotation.y = 0;
  let turnTo = 0, served = 0;
  const DOCK_T = 0.3;

  return Object.assign(P.done({
    w: 13.5, cardW: 18.2, d: 9, h: 4.5,
    camera: { pos: [-7.0, 13.2, 8.1], look: [0.4, 1.6, -11.6], fov: 32 },
    exit: [[GX, QZ - 1.4]],
    pileAnchor: [-5.2, 0, -5.4],
    exitWater: [[DOCK[0] - 6, DOCK[1] - 1], [-14.5, -15], [-17, -20]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, vt = ctx.vt;
      const t = time;
      const two = owned && (stats?.sigmaUpgrades ?? 0) >= 4;
      const cyc = 46;
      for (let k = 0; k < 2; k++) {
        const f = ferries[k];
        f.visible = owned && (k === 0 || two);
        if (!f.visible) { docked[k] = false; sea.off(k); continue; }
        const ph = ((t / cyc) + k * 0.5) % 1;
        let u, sail = false;
        if (ph < DOCK_T) { u = 0; docked[k] = true; }
        else { docked[k] = false; const v = (ph - DOCK_T) / (1 - DOCK_T); u = easeSail(v); sail = v > 0.04 && v < 0.96; }
        route.getPointAt(u % 1, _p);
        route.getTangentAt(u % 1, _t);
        const bob = Math.sin(t * 1.1 + k * 2) * 0.06;
        f.position.set(_p.x, WY - 0.62 + bob, _p.z);
        f.rotation.set(Math.sin(t * 0.8 + k) * 0.02, Math.atan2(-_t.z, _t.x), Math.sin(t * 0.9 + k) * 0.02 + (sail ? 0.02 : 0));
        f.geometry = G[vt >= 2 ? 1 : 0];
        const big = vt >= 2;
        sea.hull(k, _p.x, _p.z, f.rotation.y, big ? 6.1 : 5.4, big ? 2.45 : 2.3, 1, sail ? 1 : 0);
      }
      if (q.served !== served) { served = q.served; turnTo += (Math.PI * 2) / 3; }
      turn.rotation.y += (turnTo - turn.rotation.y) * Math.min(1, dt * 6);

      const sup = stats?.supply;
      van.visible = owned && !!sup?.on && sup.from === 'ferry' && sup.phase > 0.45 && sup.phase < 0.6;
      thr.show(owned ? Math.min(stats?.sigmaUpgrades ?? 0, 5) : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);

      const n = owned ? Math.round((stats?.stockRatio ?? 0) * waitSpots.length) : 0;
      waitSpots.forEach(([x, z, h, clip], i) => {
        if (i < n) wait.set(i, x, 0.02, z, h, clip, i * 0.7, 1.5); else wait.hide(i);
      });
      if (owned) {
        staff.set(0, BX + 0.75, 0.15, BZ - 0.1, Math.PI / 2, 0, 0, 1);
        const dk = docked[0] || docked[1];
        if (dk) staff.set(1, GX + 0.85, 0.02, QZ + 0.35, -0.9, 4, 0.5, 2.6); else staff.set(1, GX + 1.1, 0.02, QZ + 0.6, -0.3, 0, 0, 1);
        if (stats?.kid) staff.set(2, TX + 0.2, 0.02, TZ + 0.9, -0.5, 3, 1.1, 3); else staff.hide(2);
        if ((stats?.boosts ?? 0) >= 4) { staff.set(3, 1.6, 0.02, -1.6, -0.6, 4, 0, 3.4); staff.set(4, 2.6, 0.02, -1.4, 0.2, 3, 1.3, 5.5); } else { staff.hide(3); staff.hide(4); }
      } else for (let i = 0; i < 5; i++) staff.hide(i);

      for (let i = 0; i < 2; i++) {
        const a = t * (0.35 + i * 0.12) + i * 3;
        gulls.set(i, -1 + Math.cos(a) * (5 + i * 2), 5.6 + i * 0.8 + Math.sin(a * 2) * 0.4, -15 + Math.sin(a) * 3, -a, 0.6 + Math.abs(Math.sin(t * 6 + i)) * 0.6, 0.35, 1.1);
      }
      gulls.commit();
    },
  }), { focus: [-0.6, -8.0] });

  function easeSail(v) {
    const a = 0.12;
    if (v < a) return (v * v) / (2 * a) / (1 - a);
    if (v > 1 - a) return 1 - ((1 - v) * (1 - v)) / (2 * a) / (1 - a);
    return (v - a / 2) / (1 - a);
  }

  function quayEdge(B) {
    for (const x of [-9.4, -6.0, -2.6, 4.4, 7.4, 10.4]) post(B, x, QZ + 0.35, 0.95);
    swag(B, [-9.4, 0.66, QZ + 0.35], [-6.0, 0.66, QZ + 0.35]);
    swag(B, [-6.0, 0.66, QZ + 0.35], [-2.6, 0.66, QZ + 0.35]);
    swag(B, [4.4, 0.66, QZ + 0.35], [7.4, 0.66, QZ + 0.35]);
    swag(B, [7.4, 0.66, QZ + 0.35], [10.4, 0.66, QZ + 0.35]);
    for (let x = -11; x < 11; x += 2.6) if (Math.abs(x - GX) > 1.4) B.slab('#2f3a3c', x, WY - 0.4, QZ - 1.55, 0.7, 0.6, 0.18, { aoBase: -1.3, round: 0.06 });
  }

  function quayFoam(B) {
    const m = new S.Mesh(), col = S.rgb('#f4fbf8'), y = WY + 0.035;
    let x = -12.5;
    while (x < 12.5) {
      const L = 0.5 + B.rnd() * 1.3, z = QZ - 1.62 - B.rnd() * 0.22, w = 0.1 + B.rnd() * 0.08;
      fq(m, [x, y, z - w], [x + L, y, z - w * 0.6], [x + L, y, z + w * 0.6], [x, y, z + w], col);
      if (B.rnd() < 0.5) { const z2 = z - 0.35 - B.rnd() * 0.2; fq(m, [x + 0.2, y, z2 - 0.04], [x + L * 0.7, y, z2 - 0.03], [x + L * 0.7, y, z2 + 0.03], [x + 0.2, y, z2 + 0.04], col); }
      x += L + 0.25 + B.rnd() * 0.5;
    }
    B.add(m.geo(), null, { r: 0.5, noAo: true, g: 0.1 });
  }

  function breakwater(B, x0, x1, z) {
    for (let x = x0; x <= x1; x += 1.25) {
      const s = 0.9 + B.rnd() * 0.5;
      B.ball(B.rnd() < 0.5 ? 'rock' : 'rock2', x + (B.rnd() - 0.5) * 0.4, WY - 0.2, z + 1.0 + (B.rnd() - 0.5) * 0.3, 0.8 * s, { sy: 0.7, detail: 0 });
      B.ball(B.rnd() < 0.5 ? 'rock' : 'rock2', x + (B.rnd() - 0.5) * 0.4, WY - 0.2, z - 1.0 + (B.rnd() - 0.5) * 0.3, 0.8 * s, { sy: 0.7, detail: 0 });
    }
    B.slab('stone', (x0 + x1) / 2, WY - 0.6, z, x1 - x0 + 0.8, 1.2, 1.7, { aoBase: -1.3, round: 0.1, taper: 0.05 });
    for (const [x, zz] of [[x0, z], [x1, z]]) ripple(B, kit, x + (x === x0 ? -0.8 : 0.9), zz, 1.2, { a0: x * 0.3, turns: 1.2 });
    const m = new S.Mesh(), col = S.rgb('#f4fbf8'), y = WY + 0.04;
    for (let x = x0 - 0.4; x < x1 + 0.4; x += 0.9) for (const s of [-1, 1]) { const zz = z + s * (1.75 + B.rnd() * 0.25), L = 0.5 + B.rnd() * 0.3; fq(m, [x, y, zz - 0.07], [x + L, y, zz - 0.05], [x + L, y, zz + 0.05], [x, y, zz + 0.07], col); }
    B.add(m.geo(), null, { r: 0.5, noAo: true, g: 0.1 });
    const bx = x0 - 0.4;
    B.cyl('stone', bx, WY + 0.6, z, 0.95, 0.5, 0, { sides: 9, taper: 0.95 });
    for (let i = 0; i < 4; i++) B.cyl(i % 2 ? 'white' : 'red', bx, WY + 1.1 + i * 0.85, z, 0.55 - i * 0.05, 0.85, 0, { sides: 9, taper: 0.97 });
    B.cyl('#2a2a33', bx, WY + 4.5, z, 0.48, 0.12, 0, { sides: 9 });
    B.cyl({ c: '#fff1c4', r: 0.2, g: -2 }, bx, WY + 4.62, z, 0.3, 0.5, 0, { sides: 9, taper: 1 });
    B.cone('red', bx, WY + 5.12, z, 0.5, 0.5, 0, { sides: 9 });
    B.ball('white', bx, WY + 5.65, z, 0.08, { detail: 0 });
  }

  function gangway(B, x) {
    const z0 = QZ + 0.35, z1 = DOCK[1] + 2.15, y0 = 0.08, y1 = 0.55, L = z0 - z1, a = Math.atan2(y1 - y0, L);
    B.slab('timber', x, (y0 + y1) / 2 - 0.06, (z0 + z1) / 2, 1.3, 0.12, Math.hypot(L, y1 - y0), { round: 0.03, rx: a });
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; B.slab('timber2', x, y0 + (y1 - y0) * t + 0.03, z0 - L * t, 1.26, 0.03, 0.06, { round: 0.01, taper: 0, rx: a }); }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) { const t = i / 3; B.cyl('white', x + s * 0.6, y0 + (y1 - y0) * t, z0 - L * t, 0.035, 0.9, 0, { sides: 5, taper: 1 }); }
      B.slab('white', x + s * 0.6, (y0 + y1) / 2 + 0.88, (z0 + z1) / 2, 0.07, 0.07, Math.hypot(L, y1 - y0), { round: 0.02, rx: a });
    }
    for (const s of [-1, 1]) for (const zz of [QZ - 1.75, DOCK[1] + 2.4]) post(B, x + s * 0.85, zz, 1.1, { y: WY - 0.45 });
  }

  function aboard(B, x, z) {
    for (const s of [-1, 1]) B.slab('navy', x + s * 0.6, 0, z, 0.1, 2.0, 0.1, { round: 0.02 });
    B.slab('flagB', x, 0.95, z + 0.03, 1.4, 1.0, 0.1, { round: 0.06 });
    B.slab('booth', x, 0.98, z + 0.09, 1.25, 0.86, 0.02, { round: 0.04, noAo: true });
    B.slab('red', x, 1.12, z + 0.11, 0.9, 0.16, 0.02, { round: 0.05, noAo: true, taper: 0.3 });
    B.slab('booth', x - 0.05, 1.28, z + 0.11, 0.45, 0.16, 0.02, { round: 0.03, noAo: true });
    B.slab('red', x + 0.1, 1.42, z + 0.11, 0.12, 0.18, 0.02, { round: 0.02, noAo: true });
    for (let i = 0; i < 3; i++) B.slab('flagB', x - 0.4 + i * 0.4, 1.0, z + 0.11, 0.3, 0.04, 0.02, { round: 0.01, noAo: true });
    B.slab('navy', x, 1.62, z + 0.11, 1.1, 0.14, 0.02, { round: 0.02, noAo: true });
  }

  function trolley(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    B.slab('steel', 0, 0.2, 0, 1.2, 0.06, 0.7, { parent: M, round: 0.02 });
    B.slab('steel', -0.6, 0.2, 0, 0.06, 1.0, 0.7, { parent: M, round: 0.02 });
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.3, 0.3]) B.add(S.drum(9, 0.1, 0.05), 'dark', { parent: M, x: sx, y: 0.1, z: sz, rx: Math.PI / 2 });
    B.slab('#e44b3c', -0.15, 0.26, 0, 0.75, 0.45, 0.55, { parent: M, round: 0.08 });
    B.slab('#4f8fb5', 0.25, 0.26, 0.02, 0.5, 0.55, 0.45, { parent: M, round: 0.08 });
    B.slab('#f2c14e', -0.1, 0.71, 0, 0.55, 0.32, 0.42, { parent: M, round: 0.08 });
    B.slab('#2f3a3c', -0.1, 1.03, 0, 0.2, 0.08, 0.05, { parent: M, round: 0.02 });
    B.contact(x, z, 1.4, 0.9, { ry, k: 0.7 });
  }

  function booth(B, x, z) {
    B.slab('stone2', x, 0, z, 2.4, 0.2, 2.1, { round: 0.05 });
    B.slab('booth', x, 0.15, z, 2.0, 2.4, 1.7, { round: 0.12, taper: 0.03 });
    B.slab('#4a3a3e', x + 0.99, 1.0, z + 0.15, 0.05, 0.85, 1.0, { round: 0.03 });
    B.slab('glass', x + 1.01, 1.0, z + 0.15, 0.04, 0.78, 0.92, { round: 0.02, noAo: true });
    B.slab('window', x + 0.97, 1.05, z + 0.15, 0.03, 0.7, 0.85, { noAo: true, g: -0.8 });
    B.slab('red', x + 1.18, 0.9, z + 0.15, 0.4, 0.08, 1.3, { round: 0.03 });
    B.slab('red', x + 1.02, 0.25, z + 0.15, 0.1, 0.65, 1.2, { round: 0.04 });
    B.slab('ticket', x + 0.4, 2.05, z + 0.88, 1.6, 0.36, 0.06, { round: 0.04 });
    for (let i = 0; i < 4; i++) B.slab('navy', x - 0.15 + i * 0.3, 2.13, z + 0.92, 0.2, 0.2, 0.02, { round: 0.03, noAo: true });
    B.slab('glass', x - 0.3, 1.0, z + 0.86, 0.9, 0.7, 0.04, { round: 0.02, noAo: true });
    B.slab('window', x - 0.3, 1.05, z + 0.84, 0.8, 0.6, 0.02, { noAo: true, g: -0.8 });
    B.add(S.hip(2.4, 2.1, 0.95, { over: 0.25 }), 'red', { x, y: 2.55, z, r: 0.7 });
    B.cyl('white', x, 3.45, z, 0.05, 0.6, 0, { sides: 5 });
    B.slab('flagA', x + 0.28, 3.75, z, 0.5, 0.3, 0.02, { round: 0.01 });
    ring(B, x - 1.02, 1.3, z + 0.2, Math.PI / 2);
    B.awning('red', x + 1.35, 2.45, z + 0.15, 1.4, 0.6, -Math.PI / 2, { alt: 'white', drop: 0.2 });
  }

  function boothWindow(B, x, z) {
    B.slab('booth', x, 0, z, 1.2, 2.2, 1.2, { round: 0.1, taper: 0.03 });
    B.slab('glass', x, 0.95, z + 0.61, 0.8, 0.7, 0.04, { round: 0.02, noAo: true });
    B.slab('red', x, 0.85, z + 0.75, 1.0, 0.07, 0.3, { round: 0.03 });
    B.add(S.hip(1.4, 1.4, 0.6, { over: 0.15 }), 'red', { x, y: 2.2, z, r: 0.7 });
  }

  function waitRoom(B, x, z) {
    B.slab('stone2', x, 0, z, 2.8, 0.2, 2.2, { round: 0.05 });
    B.slab('#f6f1e7', x, 0.15, z - 0.6, 2.6, 2.3, 0.9, { round: 0.1 });
    B.slab('glass', x, 0.3, z + 0.4, 2.4, 1.9, 0.04, { round: 0.02, noAo: true });
    for (const s of [-1, 1]) B.slab('navy', x + s * 1.2, 0.15, z + 0.4, 0.1, 2.3, 0.1, { round: 0.02 });
    B.slab('#4f8fb5', x, 2.45, z - 0.1, 3.0, 0.14, 2.1, { round: 0.05, rx: 0.06 });
    for (let i = 0; i < 6; i++) B.slab(i % 2 ? '#f6f1e7' : '#4f8fb5', x - 1.25 + i * 0.5, 2.36, z + 0.98, 0.5, 0.22, 0.05, { round: 0.02 });
  }

  function ring(B, x, y, z, ry = 0) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.ball(i % 2 ? 'white' : 'accent', x + Math.cos(a) * 0.26 * Math.cos(ry), y + Math.sin(a) * 0.26, z - Math.cos(a) * 0.26 * Math.sin(ry), 0.1, { detail: 0, sx: 1.3 });
    }
  }

  function anchor(B, x, z) {
    B.slab('stone', x, 0, z, 1.2, 0.35, 1.0, { round: 0.08 });
    B.slab('navy', x, 0.35, z, 0.16, 1.6, 0.16, { round: 0.04 });
    B.slab('navy', x, 1.62, z, 0.7, 0.14, 0.14, { round: 0.04 });
    B.cyl('navy', x, 1.95, z, 0.18, 0.08, 0, { sides: 9, rx: Math.PI / 2 });
    for (const s of [-1, 1]) B.slab('navy', x + s * 0.32, 0.45, z, 0.6, 0.16, 0.16, { round: 0.05, rz: s * 0.7 });
  }

  function cafeCart(B, x, z) {
    B.slab('#f2c14e', x, 0.3, z, 1.5, 0.9, 0.8, { round: 0.12 });
    B.awning('flagB', x, 2.0, z + 0.2, 1.7, 0.9, 0, { alt: 'white', drop: 0.3 });
    for (const s of [-1, 1]) B.cyl('iron', x + s * 0.7, 1.2, z - 0.25, 0.03, 0.8, 0, { sides: 5 });
    for (const s of [-1, 1]) B.add(S.drum(9, 0.3, 0.1), 'dark', { x: x + s * 0.5, y: 0.3, z: z + 0.42, rx: Math.PI / 2 });
    B.cyl('steel', x + 0.4, 1.2, z, 0.12, 0.3, 0, { sides: 7 });
  }

  // bow = +x. Waterline at local y 0.62.
  function ferryGeo(d, big) {
    const len = big ? 12.0 : 10.6, beam = big ? 4.7 : 4.4, D = 2.3;
    d.add(ferryHull(len, beam, D), null, { r: 0.38 });
    d.slab('deck', -len * 0.06, D - 0.1, 0, len * 0.8, 0.12, beam * 0.86, { round: 0.05, taper: 0 });
    for (let i = 0; i < 9; i++) d.slab(i % 2 ? 'deck' : 'deck2', -len * 0.44 + i * len * 0.09, D + 0.02, 0, 0.04, 0.012, beam * 0.84, { round: 0.005, taper: 0, noAo: true });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = -len * 0.34 + i * len * 0.13, z = s * (beam / 2 + 0.005);
        torus(d, '#f6f1e7', x, 1.3, z, 0.2, 0.05);
        d.cyl('glassD', x, 1.3, z - s * 0.02, 0.17, 0.06, 0, { sides: 11, taper: 1, rx: Math.PI / 2 });
      }
    }
    const cl = len * 0.56, cx = -len * 0.1, cw = beam * 0.8, y0 = D, ch = 1.75;
    d.slab('white', cx, y0, 0, cl, ch, cw, { round: 0.36, taper: 0.05 });
    d.slab('red', cx, y0, 0, cl + 0.06, 0.32, cw + 0.06, { round: 0.12, taper: 0.02 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const wx = cx - cl * 0.36 + i * cl * 0.18;
        if (i === 2) continue;
        d.slab('#f6f1e7', wx, y0 + 0.52, s * (cw * 0.5 - 0.02), 0.82, 0.86, 0.08, { round: 0.16 });
        d.slab('glassD', wx, y0 + 0.6, s * (cw * 0.5 + 0.015), 0.64, 0.68, 0.05, { round: 0.14, noAo: true });
        d.slab('cabinLit', wx, y0 + 0.31, s * (cw * 0.5 + 0.03), 0.56, 0.2, 0.02, { round: 0.06, noAo: true });
      }
      d.slab('navy', cx, y0 + 0.08, s * (cw * 0.5 + 0.02), 0.8, 1.45, 0.06, { round: 0.18 });
      d.slab('#f2c14e', cx + 0.24, y0 + 0.75, s * (cw * 0.5 + 0.06), 0.06, 0.06, 0.04, { round: 0.02 });
      torus(d, '#e44b3c', cx - cl * 0.47, y0 + 0.95, s * (cw * 0.5 + 0.08), 0.26, 0.08, {}, '#f6f1e7');
    }
    for (let i = 0; i < 3; i++) {
      d.slab('#f6f1e7', cx + cl * 0.5 + 0.01, y0 + 0.52, -cw * 0.3 + i * cw * 0.3, 0.08, 0.8, cw * 0.24, { round: 0.12 });
      d.slab('glassD', cx + cl * 0.5 + 0.04, y0 + 0.6, -cw * 0.3 + i * cw * 0.3, 0.05, 0.64, cw * 0.19, { round: 0.1, noAo: true });
    }
    const y1 = y0 + ch;
    d.slab('#eef2f2', cx, y1 - 0.06, 0, cl + 0.4, 0.16, cw + 0.4, { round: 0.08 });
    d.slab('deck', cx, y1 + 0.1, 0, cl + 0.2, 0.02, cw + 0.2, { round: 0.02, taper: 0, noAo: true });
    rails(d, cx, y1 + 0.1, cl + 0.25, cw + 0.25, 0.62);
    const wx = cx + cl * 0.26, ww = 2.4, wh = 1.3, wd = cw * 0.8;
    d.slab('white', wx, y1 + 0.1, 0, ww, wh, wd, { round: 0.3, taper: 0.07 });
    d.slab('glassD', wx + ww / 2 - 0.08, y1 + 0.62, 0, 0.12, 0.5, wd * 0.82, { round: 0.1, noAo: true, rz: 0.22 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) d.slab('glassD', wx - 0.7 + i * 0.66, y1 + 0.66, s * wd * 0.5, 0.5, 0.46, 0.05, { round: 0.1, noAo: true });
    d.slab('red', wx, y1 + 0.1 + wh - 0.04, 0, ww + 0.5, 0.2, wd + 0.5, { round: 0.1, taper: -0.04 });
    d.slab('red', wx, y1 + 0.1 + wh + 0.12, 0, ww * 0.7, 0.12, wd * 0.6, { round: 0.06 });
    const my = y1 + wh + 0.3;
    d.cyl('white', wx - 0.2, my, 0, 0.07, 1.9, 0, { sides: 7, taper: 0.7 });
    d.slab('white', wx - 0.2, my + 1.3, 0, 0.1, 0.08, 1.1, { round: 0.02 });
    d.slab('#e9eef0', wx - 0.2, my + 0.8, 0, 0.9, 0.08, 0.16, { round: 0.03 });
    d.ball('bulb', wx - 0.2, my + 1.95, 0, 0.09, { detail: 0 });
    for (const s of [-1, 1]) d.ball(s > 0 ? '#4cd06a' : '#e44b3c', wx + 0.4, y1 + 0.95, s * (wd / 2 + 0.08), 0.08, { detail: 0, g: 0.8 });
    d.slab('flagA', wx - 0.55, my + 1.55, 0, 0.6, 0.36, 0.02, { round: 0.01 });
    d.slab('flagB', wx - 0.2, my + 1.28, 0.55, 0.32, 0.22, 0.02, { round: 0.01 });
    const fx = cx - cl * 0.24;
    d.cyl('funnel', fx, y1 + 0.1, 0, 0.62, 1.95, 0, { sides: 13, taper: 0.88, sx: 1.3 });
    d.cyl('#f6f1e7', fx, y1 + 0.95, 0, 0.6, 0.42, 0, { sides: 13, taper: 0.97, sx: 1.3 });
    d.cyl('flagB', fx, y1 + 1.07, 0, 0.6, 0.16, 0, { sides: 13, taper: 0.99, sx: 1.31 });
    d.cyl('#2a2a33', fx, y1 + 1.92, 0, 0.56, 0.2, 0, { sides: 13, taper: 0.94, sx: 1.3 });
    d.cyl('#1d1d24', fx, y1 + 2.1, 0, 0.42, 0.03, 0, { sides: 13, taper: 1, sx: 1.3, noAo: true });
    for (const s of [-1, 1]) {
      const bz = s * (cw * 0.5 - 0.35), bx = cx - cl * 0.36;
      d.ball('orange', bx, y1 + 0.55, bz, 0.34, { sx: 2.5, sy: 0.72, detail: 1, smooth: true });
      d.slab('#f6f1e7', bx, y1 + 0.62, bz, 1.4, 0.06, 0.4, { round: 0.03 });
      for (const k of [-0.55, 0.55]) d.cyl('#c8ccd2', bx + k, y1 + 0.1, bz, 0.04, 0.6, 0, { sides: 5, taper: 1 });
    }
    for (let i = 0; i < 2; i++) bench(d, cx - cl * 0.06 + i * 0.95, y1 + 0.1, 0, Math.PI / 2);
    d.slab('deck2', len * 0.3, D - 0.02, 0, len * 0.14, 0.05, beam * 0.5, { round: 0.03 });
    d.add(S.drum(9, 0.22, 0.9), '#5d6470', { x: len * 0.27, y: D + 0.24, z: 0 });
    for (const z of [-0.6, 0.6]) d.cyl('#2a2a33', len * 0.36, D - 0.05, z, 0.12, 0.3, 0, { sides: 7 });
    d.cyl('white', len * 0.46, D - 0.1, 0, 0.04, 1.4, 0, { sides: 5, taper: 0.7 });
    d.slab('flagB', len * 0.46 - 0.24, D + 1.05, 0, 0.44, 0.28, 0.02, { round: 0.01 });
    d.cyl('white', -len * 0.47, D - 0.1, 0, 0.04, 1.6, 0, { sides: 5, taper: 0.7 });
    d.slab('flagA', -len * 0.47 - 0.3, D + 1.15, 0, 0.56, 0.34, 0.02, { round: 0.01 });
    for (const s of [-1, 1]) {
      d.slab('#2a2a33', len * 0.38, 1.85, s * beam * 0.36, 0.42, 0.42, 0.06, { round: 0.12, ry: s * 0.55 });
      d.slab('#f6f1e7', -len * 0.2, D + 0.62, s * (beam * 0.47), len * 0.42, 0.07, 0.07, { round: 0.03 });
      for (let i = 0; i < 6; i++) d.cyl('#f6f1e7', -len * 0.4 + i * len * 0.084, D - 0.1, s * beam * 0.47, 0.03, 0.72, 0, { sides: 5, taper: 1 });
    }
    if (big) {
      d.slab('white', cx - 0.6, y1 + 0.1, 0, cl * 0.34, 0.95, cw * 0.66, { round: 0.22, taper: 0.05 });
      for (const s of [-1, 1]) d.slab('glassD', cx - 0.6, y1 + 0.42, s * cw * 0.33, cl * 0.28, 0.4, 0.05, { round: 0.08, noAo: true });
      for (let i = 0; i < 9; i++) d.ball('bulb', -len * 0.42 + i * len * 0.1, y1 + 2.4 + 0.9 * (1 - Math.abs(i - 4) / 4), 0, 0.07, { detail: 0, g: 1.2 });
    }
  }

  function ferryHull(len, beam, D) {
    const WL = 0.62, n = 22, rings = [];
    const prof = [[1.0, D, 'white'], [1.0, D - 0.26, 'dark'], [1.05, D - 0.34, 'dark'], [1.05, D - 0.52, 'red'], [1.0, D - 0.6, 'red'], [0.99, WL + 0.34, 'white'], [0.985, WL + 0.2, 'navy'], [0.95, WL - 0.05, 'navy'], [0.82, WL * 0.45, 'navy'], [0.5, 0.1, 'navy'], [0, 0, 'navy']];
    const C = { white: S.rgb('#f6f1e7'), dark: S.rgb('#2e2b33'), red: S.rgb('#d9483c'), navy: S.rgb('#3f5577'), deck: S.rgb('#c9b79a') };
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = -len / 2 + t * len;
      const B = (beam / 2) * (t < 0.12 ? 0.8 + 0.2 * Math.sin((t / 0.12) * Math.PI / 2) : t < 0.6 ? 1 : Math.max(0.03, Math.pow(Math.cos(((t - 0.6) / 0.4) * Math.PI / 2), 0.7)));
      const sheer = 0.55 * Math.pow(Math.max(0, (t - 0.55) / 0.45), 2) + 0.12 * Math.pow(Math.max(0, (0.15 - t) / 0.15), 2);
      const keel = D * 0.18 * Math.pow(Math.max(0, (t - 0.75) / 0.25), 1.5) + 0.12 * Math.pow(Math.max(0, (0.1 - t) / 0.1), 1.2);
      const ring = [];
      for (const [f, y] of prof) {
        const yy = y >= D - 0.6 ? y + sheer : y < WL ? keel + y * (1 - keel / WL) : y;
        const flare = 1 + (y > WL ? 0.06 * Math.max(0, (t - 0.6) / 0.4) * (y - WL) / D : 0);
        ring.push([x, yy, B * f * flare]);
      }
      const side = ring.slice();
      const out = [...side, ...side.slice(0, -1).reverse().map(([a, b2, c]) => [a, b2, -c])];
      out.push([x, D + sheer, -B * 0.97], [x, D + sheer, B * 0.97]);
      rings.push(out.reverse());
    }
    const L = rings[0].length, np = prof.length;
    const colOf = (i) => {
      const k = L - 2 - i;
      if (k < 0 || k >= L - 1) return C.deck;
      if (k < np - 1) return C[prof[k][2]];
      if (k < 2 * np - 2) return C[prof[2 * np - 3 - k][2]];
      return C.deck;
    };
    const g = S.loft(rings, { col: (r, i) => (r < 0 || r >= rings.length ? C.red : colOf(i)) });
    return S.smooth(g, 2);
  }

  function rails(B, x, y, l, w, h) {
    for (const s of [-1, 1]) {
      B.slab('white', x, y + h, s * w / 2, l, 0.07, 0.07, { round: 0.03 });
      B.slab('white', x, y + h * 0.5, s * w / 2, l, 0.03, 0.03, { round: 0.01, noAo: true });
      for (let i = 0; i <= 8; i++) B.cyl('white', x - l / 2 + (i * l) / 8, y, s * w / 2, 0.03, h, 0, { sides: 5, taper: 1 });
      B.slab('white', x + s * l / 2, y + h, 0, 0.07, 0.07, w, { round: 0.03 });
    }
    for (const s of [-1, 1]) torus(B, '#e44b3c', x - l * 0.2, y + h * 0.5, s * (w / 2 + 0.05), 0.24, 0.07, {}, '#f6f1e7');
  }

  function bench(B, x, y, z, ry) {
    const M = S.matrix({ pos: [x, y, z], ry });
    B.slab('timber', 0, 0.36, 0, 1.4, 0.07, 0.4, { parent: M, round: 0.03 });
    B.slab('timber', 0, 0.42, -0.2, 1.4, 0.4, 0.06, { parent: M, round: 0.03 });
    for (const s of [-1, 1]) B.slab('navy', s * 0.6, 0, 0, 0.06, 0.38, 0.36, { parent: M, round: 0.02 });
  }

  function torus(B, slot, x, y, z, R, r, o = {}, stripe = null) {
    const key = `${R}:${r}:${stripe}`;
    let g = TORI.get(key);
    if (!g) {
      g = new THREE.TorusGeometry(R, r, 6, 16).toNonIndexed();
      g.deleteAttribute('uv');
      if (stripe) {
        const p = g.attributes.position, a = S.rgb(slot), w = S.rgb(stripe), c = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i += 3) {
          const cx2 = p.getX(i) + p.getX(i + 1) + p.getX(i + 2), cy2 = p.getY(i) + p.getY(i + 1) + p.getY(i + 2);
          const q = Math.floor(((Math.atan2(cy2, cx2) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? w : a;
          for (let k = 0; k < 3; k++) c.set(q, (i + k) * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      TORI.set(key, g);
    }
    B.add(g, stripe ? null : slot, { x, y, z, rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, noAo: true, r: 0.45 });
  }
  function ringOn(B, x, y, z, s) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.ball(i % 2 ? 'white' : 'accent', x + Math.cos(a) * 0.24, y + Math.sin(a) * 0.24, z + s * 0.04, 0.09, { detail: 0, sx: 1.3 }); }
  }
}

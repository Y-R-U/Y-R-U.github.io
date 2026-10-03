// 💻 App Studio: a garage startup with its doors rolled up. Devs type at glowing screens, the server rack blinks,
// and finished apps float out as bright icon cubes into a little cloud. L1 garage → L25 glass office → L100 campus + slide.
import * as THREE from 'three';
import { extras, lights } from './fishchips.js?v=20261004a';
import { nightSign, blade } from './boutique.js?v=20261004a';

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'appstudio', line, palette, rng, seed: 71,
    colors: {
      accent: '#7b61ff', stock: '#7b61ff', garage: '#f2a77c', garage2: '#d9875f', slate: '#55607a', ink: '#3a3346', desk: '#f1dcb8', cream: '#fff4e4', floorW: { c: '#f0d6aa', g: 0.06 }, inner: { c: '#fff1dc', g: 0.14 }, glassO: { c: '#a9d9ee', r: 0.08, m: 0.2, g: -0.9 }, lilac: '#c7b4ec',
      screen: { c: '#7fe0ff', r: 0.3, g: 1.5 }, screen2: { c: '#b49cff', r: 0.3, g: 1.5 }, led: { c: '#7dff9a', r: 0.3, g: 3 }, ledR: { c: '#ff6a7a', r: 0.3, g: 3 },
      board: '#fbf8f2', stickY: '#ffe066', stickP: '#ff9fc6', stickB: '#8fd4ff', bean: '#f29a5c', glassT: { c: '#a9cbe0', r: 0.08, m: 0.25 },
      neonA: { c: '#9b7bff', r: 0.4, g: -2.4 }, neonC: { c: '#5fe0ff', r: 0.4, g: -2.4 }, cloud: '#fbfbff', solar: { c: '#3b4a78', r: 0.2, m: 0.5 },
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const GX = -0.8, GZ = -6.0, W = 8.2, D = 5.0, H = 3.7, FZ = GZ + D / 2;
  const DESKS = [[GX - 2.4, FZ - 0.95], [GX - 0.3, FZ - 1.05], [GX + 1.9, FZ - 0.95]];
  const OUTBOX = [GX + 3.0, 0.62, FZ + 1.0];

  garage(b);
  for (const [x, z] of DESKS.slice(0, 2)) desk(b, x, z, 'screen');
  rack(b, GX + 3.3, FZ - 3.6);
  sofa(b, GX - 2.6, GZ - D / 2 + 1.0);
  K.planter(b, GX - 4.9, FZ + 0.9, { s: 1.1, flowers: true });
  K.planter(b, GX + 4.8, FZ + 0.9, { s: 1.0, flowers: true });
  K.roundTree(b, GX - 5.6, FZ - 2.6, { s: 0.95 });
  bikeRack(b, 5.4, -1.6);
  b.contact(GX, GZ + 0.1, W + 1.0, D + 0.9, { k: 0.9 });

  // L25: glass office block to the right, logo cube on the roof, lit floors
  {
    const x = 6.0, z = -10.6, w = 4.6, d = 4.0, h = 6.2;
    t1.slab('stone', x, 0, z, w + 0.3, 0.3, d + 0.3, { round: 0.06 });
    t1.slab('lilac', x, 0.3, z, w, h, d, { round: 0.2, taper: 0.02 });
    for (let f = 0; f < 3; f++) {
      t1.slab('glassO', x, 0.75 + f * 1.95, z + d / 2 + 0.01, w - 0.6, 1.3, 0.06, { round: 0.06, noAo: true });
      for (let c = 0; c < 4; c++) t1.slab('cream', x - (w - 0.6) / 2 + c * ((w - 0.6) / 3), 0.7 + f * 1.95, z + d / 2 + 0.04, 0.09, 1.4, 0.06, { round: 0.02, taper: 0 });
      t1.slab('cream', x, 0.62 + f * 1.95, z + d / 2 + 0.05, w - 0.4, 0.12, 0.12, { round: 0.04, taper: 0 });
    }
    t1.slab('cream', x, h + 0.3, z, w + 0.3, 0.3, d + 0.3, { round: 0.08 });
    t1.slab('accent', x, h + 0.6, z + 0.6, 1.0, 1.0, 1.0, { round: 0.22, ry: 0.5 });
    t1.slab('white', x, h + 0.92, z + 0.6, 0.5, 0.36, 1.04, { round: 0.1, ry: 0.5 });
    lights(t1, [GX + W / 2 - 0.1, H + 0.6, FZ - 0.1], [x - w / 2 + 0.2, 3.0, z + d / 2], 7, 0.3);
  }

  // L100: campus tower on the left with a spiral tube slide and a rooftop garden
  {
    const x = -7.6, z = -11.2, r = 2.3, h = 9.0;
    t2.slab('stone', x, 0, z, 5.0, 0.3, 5.0, { round: 0.08 });
    t2.add(S.prism(11, 1, 0.94, 1), 'glassT', { x, y: 0.3, z, sx: r, sy: h, sz: r, r: 0.08, m: 0.25 });
    for (let f = 1; f < 4; f++) t2.cyl('#eef2f4', x, 0.3 + f * 2.25, z, r * (1.02 - f * 0.015), 0.18, 0, { sides: 11, taper: 1 });
    t2.cyl('#eef2f4', x, h + 0.3, z, r * 0.98, 0.3, 0, { sides: 11, taper: 1 });
    for (let i = 0; i < 6; i++) K.bush(t2, x + Math.cos(i) * 1.2, z + Math.sin(i) * 1.2, { s: 0.55, y: h + 0.6, flowers: i % 2 === 0 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25, a = t * Math.PI * 3.2 + 0.6, rr = r + 0.75, y = 4.8 - t * 4.4;
      t2.ball(i % 2 ? '#ffd166' : '#ff9f43', x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, 0.42, { detail: 1, sy: 0.8 });
    }
  }

  // For sale: closed roller doors
  lot.slab('stone', GX, 0, GZ, W, 0.3, D, { round: 0.06 });
  lot.slab('#b8c9c8', GX, 0.3, GZ, W - 0.3, 3.0, D - 0.3, { round: 0.12 });
  for (let i = 0; i < 8; i++) lot.slab('#d6dedd', GX - 1.9, 0.4 + i * 0.32, FZ - 0.1, 3.4, 0.2, 0.05, { round: 0.03 });
  K.signPost(lot, GX + 2.6, FZ + 1.2, { c: 'white', w: 1.0 });
  lot.ball('accent', GX + 2.6, 1.45, FZ + 1.32, 0.12, { detail: 0 });

  // App icon cubes: floating up from the screens into the cloud (one instanced draw)
  const icon = (b2) => {
    b2.slab('#ffffff', 0, -0.5, 0, 1, 1, 1, { round: 0.26, taper: 0 });
    b2.ball('#ffffff', 0, 0, 0.5, 0.22, { sz: 0.25, detail: 0 });
  };
  const ib = kit.builder(P.pal);
  icon(ib);
  const ig = ib.geometry({ ao: 0 });
  const tintGeo = (g, front) => {
    const a = g.clone(), pos = a.attributes.position, col = a.attributes.color;
    for (let i = 0; i < col.count; i++) if (pos.getZ(i) < 0.49 || Math.abs(pos.getX(i)) > 0.3 || Math.abs(pos.getY(i)) > 0.3) col.setXYZ(i, col.getX(i) * front[0], col.getY(i) * front[1], col.getZ(i) * front[2]);
    return a;
  };
  const N = 6;
  const cubes = new THREE.InstancedMesh(ig, kit.materials.uber, N);
  cubes.castShadow = false;
  cubes.frustumCulled = false;
  P.group.add(cubes);
  const APP = ['#7b61ff', '#ff6b8b', '#2ec4b6', '#ffb703', '#3a86ff', '#8ac926'];
  const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  for (let i = 0; i < N; i++) cubes.setColorAt(i, _c.set(APP[i]));

  // Server rack LEDs: three blink patterns, swapped geometry (one draw)
  const ledGeo = [0, 1, 2].map((k) => {
    const lb = kit.builder(P.pal);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
      const on = ((r * 7 + c * 3 + k * 5) % 4) !== 0;
      if (on) lb.ball(((r + c + k) % 5) ? 'led' : 'ledR', -0.18 + c * 0.18, 0.25 + r * 0.3, 0, 0.035, { detail: 0 });
    }
    return lb.geometry({ ao: 0 });
  });
  const leds = new THREE.Mesh(ledGeo[0], kit.materials.uber);
  leds.position.set(GX + 3.3, 0.3, FZ - 3.6 + 0.37);
  P.group.add(leds);
  const leds2 = new THREE.Mesh(ledGeo[1], kit.materials.uber);

  const thr = extras(kit, P, P.pal, [
    (e) => desk(e, DESKS[2][0], DESKS[2][1], 'screen2'),
    (e) => { e.slab('ink', GX + 0.6, 1.3, GZ - D / 2 + 0.36, 1.9, 1.15, 0.08, { round: 0.05 }); e.slab('screen2', GX + 0.6, 1.36, GZ - D / 2 + 0.41, 1.75, 1.0, 0.02, { noAo: true }); for (let i = 0; i < 4; i++) e.slab(['#ff6b8b', '#ffb703', '#2ec4b6', '#3a86ff'][i], GX + 0.05 + i * 0.37, 1.62, GZ - D / 2 + 0.43, 0.26, 0.26, 0.02, { round: 0.06, noAo: true, g: 0.8 }); },
    (e) => { rack(e, GX + 2.6, FZ - 3.6); e.ball('cloud', GX + 2.6, 2.4, FZ - 3.3, 0.18, { sx: 1.6, sz: 0.4, detail: 1 }); },
    (e) => { e.cyl('ink', GX - 2.4, H + 0.6, GZ - 0.2, 0.06, 1.2, 0, { sides: 5 }); e.cyl('ink', GX - 0.4, H + 0.6, GZ - 0.2, 0.06, 1.2, 0, { sides: 5 }); e.slab('ink', GX - 1.4, H + 1.6, GZ - 0.2, 2.8, 1.3, 0.16, { round: 0.08 }); e.slab({ c: '#ff6b8b', g: 1.2 }, GX - 1.9, H + 1.75, GZ - 0.1, 0.9, 0.9, 0.04, { round: 0.2 }); for (let i = 0; i < 5; i++) e.ball({ c: '#ffe066', g: 1.5 }, GX - 1.0 + i * 0.2, H + 2.1, GZ - 0.1, 0.07, { detail: 0 }); },
    (e) => { e.cyl('stone', 3.6, 0, -2.0, 0.6, 0.6, 0, { sides: 9 }); e.ball('#5fb7e8', 3.6, 1.35, -2.0, 0.6, { detail: 1, smooth: true }); for (let i = 0; i < 4; i++) e.ball('#8fd06a', 3.6 + Math.cos(i * 1.9) * 0.45, 1.35 + Math.sin(i * 2.3) * 0.35, -2.0 + Math.sin(i * 1.9) * 0.3, 0.22, { sz: 0.5, detail: 0 }); e.cyl('gold', 3.6, 0.6, -2.0, 0.05, 0.4, 0, { sides: 5 }); },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => { e.slab('desk', GX - 3.4, 0.32, FZ - 3.7, 1.2, 0.9, 0.6, { round: 0.04 }); e.slab('#c8ccd2', GX - 3.4, 1.22, FZ - 3.75, 0.5, 0.55, 0.4, { round: 0.08 }); e.cyl('ink', GX - 3.25, 1.22, FZ - 3.5, 0.06, 0.12, 0, { sides: 7 }); e.ball({ c: '#ff8a5c', g: 0.8 }, GX - 3.55, 1.6, FZ - 3.55, 0.04, { detail: 0 }); },
    (e) => { const x = GX + 0.6, z = FZ - 0.6; e.ball('#f6f1f8', x, 0.9, z, 0.32, { detail: 1, smooth: true, sy: 1.1 }); e.slab('ink', x, 0.98, z + 0.26, 0.42, 0.2, 0.04, { round: 0.06 }); e.ball({ c: '#7fe0ff', g: 2 }, x - 0.1, 1.04, z + 0.29, 0.04, { detail: 0 }); e.ball({ c: '#7fe0ff', g: 2 }, x + 0.1, 1.04, z + 0.29, 0.04, { detail: 0 }); e.cyl('ink', x, 1.25, z, 0.015, 0.25, 0, { sides: 3 }); e.ball({ c: '#ff6b8b', g: 1.5 }, x, 1.52, z, 0.05, { detail: 0 }); e.ball({ c: '#9b7bff', g: 0.4 }, x, 0.45, z, 0.18, { sy: 0.3, detail: 0 }); },
    (e) => { const x = GX - 3.6, z = FZ - 2.2; e.slab('#6a4fd6', x, 0.32, z, 0.75, 1.75, 0.65, { round: 0.06 }); e.slab('ink', x, 1.15, z + 0.3, 0.6, 0.5, 0.08, { round: 0.03, rx: -0.2 }); e.slab({ c: '#ff9fc6', g: 1.4 }, x, 1.18, z + 0.34, 0.5, 0.4, 0.02, { rx: -0.2, noAo: true }); e.slab({ c: '#ffe066', g: 1.2 }, x, 1.82, z + 0.3, 0.7, 0.16, 0.06, { round: 0.03 }); },
    (e) => { const x = GX + 2.4, y = H + 0.75, z = GZ; e.ball('#fbf6ff', x, y + 0.7, z, 0.55, { sx: 1.5, detail: 1, smooth: true }); e.ball('#fbf6ff', x + 0.8, y + 1.2, z, 0.3, { detail: 1, smooth: true }); e.cone('#ffd166', x + 0.95, y + 1.45, z, 0.07, 0.45, 0, { sides: 5, rz: -0.4 }); for (const s of [-1, 1]) for (const f of [-1, 1]) e.cyl('#fbf6ff', x + f * 0.45, y, z + s * 0.25, 0.08, 0.45, 0, { sides: 5 }); for (let i = 0; i < 4; i++) e.ball(['#ff9fc6', '#b49cff', '#8fd4ff', '#ffe066'][i], x - 0.7 - i * 0.12, y + 0.85 - i * 0.12, z, 0.12, { detail: 0 }); },
  ]);
  const night = nightSign(kit, P, GX + 2.4, 2.6, FZ + 0.12, 0, '#7fe0ff');

  const ob = kit.builder(P.pal);
  icon(ob);
  const outboxGeo = tintGeo(ob.geometry({ ao: 0.1 }), S.rgb('#7b61ff'));
  outbox(b, OUTBOX[0], OUTBOX[2]);
  P.pile({ at: OUTBOX, geo: outboxGeo, size: 0.34, max: 10, cols: 4, layout: 'pyramid', range: [0, 1] });

  const staff = P.crowd({ count: 6, seed: 13, scale: 1.36 });
  const devLooks = [{ top: '#3a86ff', style: 2, hair: 4, skin: 2 }, { top: '#ff6b8b', style: 1, hair: 5, skin: 0 }, { top: '#2ec4b6', style: 3, hair: 0, skin: 4 }, { top: '#ffb703', style: 0, hair: 1, skin: 1 }, { top: '#7fb5a8', style: 0, hair: 1, skin: 0 }, { top: '#9b7bff', style: 4, hair: 3, skin: 3 }];
  devLooks.forEach((l, i) => staff.look(i, l).body(i, 1.2, 0.85, i === 4 ? 0.8 : 0.92));
  const folk = P.crowd({ count: 3, seed: 47, scale: 1.36 });
  P.walkers(folk, { ids: [0, 1, 2], paths: [[[-12.5, -2.5], [12.5, -2.7]], [[12.5, -2.9], [-12.5, -2.7]]], speed: 1.1, loop: 'wrap', ownedOnly: false });
  let ledT = 0, ledK = 0;
  void leds2;

  return Object.assign(P.done({
    w: 13.5, cardW: 14.0, d: 9, h: 6,
    camera: { pos: [-4.4, 7.8, 10.4], look: [-0.4, 2.0, -4.8], fov: 32 },
    pileAnchor: OUTBOX,
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, t = time;
      leds.visible = cubes.visible = owned;
      ledT += dt;
      if (ledT > 0.18) { ledT = 0; ledK = (ledK + 1) % 3; leds.geometry = ledGeo[ledK]; }
      const per = Math.max(3, (stats?.cycleSec ?? 3) * 1.6);
      const nd = (stats?.sigmaUpgrades ?? 0) >= 1 ? 3 : 2;
      for (let i = 0; i < N; i++) {
        const u = ((t / per) + i / N) % 1;
        const [dx, dz] = DESKS[i % nd];
        const v = Math.min(1, u / 0.8), e = v * v * (3 - 2 * v);
        const x = dx + (OUTBOX[0] - dx) * e, z = dz + 0.2 + (OUTBOX[2] + 0.2 - dz) * e;
        const y = 1.45 + (OUTBOX[1] + 0.9 - 1.45) * e + Math.sin(v * Math.PI) * 1.2;
        const sc = u < 0.8 ? 0.1 + Math.min(1, v * 5) * 0.14 : 0.24 * (1 - (u - 0.8) / 0.2);
        _e.set(0.3, t * 1.5 + i, 0.15);
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(Math.max(0.001, sc)));
        cubes.setMatrixAt(i, _m);
      }
      cubes.instanceMatrix.needsUpdate = true;
      thr.show(owned ? stats?.sigmaUpgrades ?? 0 : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);
      night.show(owned && stats?.nightActive ? 1 : 0);
      if (!owned) { for (let i = 0; i < 6; i++) staff.hide(i); return; }
      const thrN = stats?.sigmaUpgrades ?? 0;
      staff.set(0, DESKS[0][0], 0.34, DESKS[0][1] - 0.62, 0.25, 5, 0, 1);
      staff.set(1, DESKS[1][0], 0.34, DESKS[1][1] - 0.62, -0.15, 5, 0.6, 1);
      if (thrN >= 1) staff.set(2, DESKS[2][0], 0.34, DESKS[2][1] - 0.62, -0.35, 5, 1.1, 1); else staff.hide(2);
      const wb = Math.sin(t * 0.25) > 0;
      staff.set(3, GX - 1.2, 0.34, GZ - D / 2 + 0.95, wb ? Math.PI - 0.7 : Math.PI * 0.6, wb ? 3 : 4, 0.4, wb ? 3 : 2);
      if (stats?.kid) staff.set(4, GX - 3.3, 0.34, FZ - 0.3, 0.4, 5, 0, 1); else staff.hide(4);
      if ((stats?.boosts ?? 0) >= 3) staff.set(5, GX - 3.6, 0.34, FZ - 1.5, Math.PI, 3, 0.2, 7); else staff.hide(5);
    },
  }), { focus: [0.0, -5.0] });

  function garage(B) {
    B.slab('stone', GX, 0, GZ, W + 0.4, 0.34, D + 0.4, { round: 0.08 });
    B.slab('floorW', GX, 0.32, GZ, W - 0.4, 0.04, D - 0.4, { round: 0.02, taper: 0 });
    for (let i = 0; i < 9; i++) B.slab(i % 2 ? '#e3c697' : 'floorW', GX - W / 2 + 0.6 + i * 0.88, 0.35, GZ, 0.84, 0.01, D - 0.5, { round: 0.005, taper: 0, noAo: true });
    B.slab('garage', GX, 0.3, GZ - D / 2 + 0.15, W, H, 0.3, { round: 0.08, taper: 0 });
    B.slab('inner', GX, 0.36, GZ - D / 2 + 0.31, W - 0.6, H - 0.4, 0.03, { round: 0.02, taper: 0 });
    for (const s of [-1, 1]) {
      B.slab('garage', GX + s * (W / 2 - 0.2), 0.3, GZ, 0.4, H, D, { round: 0.1, taper: 0.01 });
      B.slab('inner', GX + s * (W / 2 - 0.41), 0.36, GZ, 0.03, H - 0.4, D - 0.6, { round: 0.02, taper: 0 });
      for (let i = 0; i < 9; i++) B.slab('garage2', GX + s * (W / 2 + 0.01), 0.45, GZ - D / 2 + 0.4 + i * 0.52, 0.04, H - 0.3, 0.1, { round: 0.02, noAo: true });
    }
    for (const s of [-1, 1]) {
      B.slab('garage2', GX + s * (W / 2 - 0.12), 0.3, FZ + 0.06, 0.5, H - 0.2, 0.5, { round: 0.1, taper: 0.02 });
      B.slab('garage2', GX + s * (W / 2 - 0.12), 0.3, GZ - D / 2 + 0.2, 0.5, H - 0.2, 0.5, { round: 0.1, taper: 0.02 });
    }
    B.slab('garage2', GX, 0.3, GZ - D / 2 - 0.02, W + 0.1, 0.42, 0.36, { round: 0.06, taper: 0 });
    for (const s of [-1, 1]) B.slab('garage2', GX + s * (W / 2 + 0.02), 0.3, GZ, 0.44, 0.42, D + 0.1, { round: 0.06, taper: 0 });
    B.slab('cream', GX, H - 0.12, FZ + 0.12, W + 0.3, 0.16, 0.36, { round: 0.06, taper: 0 });
    for (let i = 0; i < 17; i++) B.slab('cream', GX - W / 2 + 0.3 + i * ((W - 0.6) / 16), H - 0.24, FZ + 0.24, 0.12, 0.1, 0.1, { round: 0.02, noAo: true });
    // two open bays: thick piers, cream frames, rolled-up doors
    B.slab('garage', GX, H - 0.5, FZ - 0.2, W, 0.5, 0.4, { round: 0.08, taper: 0 });
    B.slab('garage', GX + 0.3, 0.3, FZ - 0.2, 0.55, H - 0.5, 0.4, { round: 0.06, taper: 0 });
    for (const [x0, x1] of [[GX - W / 2 + 0.4, GX + 0.02], [GX + 0.58, GX + W / 2 - 0.4]]) {
      const cx = (x0 + x1) / 2, w = x1 - x0;
      B.slab('cream', cx, H - 0.68, FZ + 0.02, w + 0.16, 0.12, 0.1, { round: 0.04 });
      for (const sx of [x0, x1]) B.slab('cream', sx, 0.3, FZ + 0.02, 0.12, H - 0.9, 0.1, { round: 0.04 });
      B.cyl('#f6efe6', cx, H - 0.88, FZ - 0.22, 0.2, w - 0.1, 0, { sides: 9, taper: 1, rz: -Math.PI / 2 });
      B.slab('#e6dccf', cx, H - 0.98, FZ - 0.05, w - 0.1, 0.08, 0.04, { round: 0.02 });
    }
    for (let i = 0; i < 3; i++) { const x = GX - 2.4 + i * 2.4; B.cyl('ink', x, H - 0.85, GZ, 0.012, 0.5, 0, { sides: 3 }); B.cone({ c: '#ffcf85', r: 0.4, g: 1.1 }, x, H - 1.15, GZ, 0.26, 0.24, 0, { sides: 9, rx: Math.PI }); }
    // back wall: whiteboard with stickies, a neon </>, shelves
    B.slab('board', GX - 1.4, 1.1, GZ - D / 2 + 0.36, 2.6, 1.3, 0.05, { round: 0.03 });
    const st = ['stickY', 'stickP', 'stickB'];
    for (let i = 0; i < 9; i++) B.slab(st[i % 3], GX - 2.4 + (i % 5) * 0.45, 1.35 + Math.floor(i / 5) * 0.5 + (i % 2) * 0.06, GZ - D / 2 + 0.4, 0.3, 0.3, 0.02, { round: 0.01, rz: (i % 3 - 1) * 0.08, noAo: true });
    const nx = GX + 1.6, ny = 2.45, nz = GZ - D / 2 + 0.38;
    B.slab('neonA', nx - 0.42, ny, nz, 0.06, 0.4, 0.04, { rz: -0.6, round: 0.02, noAo: true });
    B.slab('neonA', nx - 0.42, ny - 0.22, nz, 0.06, 0.4, 0.04, { rz: 0.6, round: 0.02, noAo: true });
    B.slab('neonC', nx, ny - 0.25, nz, 0.06, 0.75, 0.04, { rz: -0.4, round: 0.02, noAo: true });
    B.slab('neonA', nx + 0.42, ny, nz, 0.06, 0.4, 0.04, { rz: 0.6, round: 0.02, noAo: true });
    B.slab('neonA', nx + 0.42, ny - 0.22, nz, 0.06, 0.4, 0.04, { rz: -0.6, round: 0.02, noAo: true });
    for (let i = 0; i < 2; i++) { B.slab('desk', GX + 1.6, 0.9 + i * 0.55, GZ - D / 2 + 0.5, 1.8, 0.06, 0.32, { round: 0.02 }); for (let k = 0; k < 4; k++) B.slab(['#ff6b8b', '#ffb703', '#7b61ff', '#2ec4b6'][(k + i) % 4], GX + 0.95 + k * 0.35, 0.96 + i * 0.55, GZ - D / 2 + 0.5, 0.12, 0.38, 0.26, { round: 0.02 }); }
    // roof: cream parapet, one big app-icon sign, two planters
    B.slab('garage2', GX, H, GZ, W + 0.25, 0.25, D + 0.25, { round: 0.06 });
    for (let i = 0; i < 10; i++) B.slab(i % 2 ? '#d9b48c' : '#cfa57c', GX - W / 2 + 0.55 + i * ((W - 1.1) / 9), H + 0.25, GZ, (W - 1.1) / 9 - 0.04, 0.05, D - 0.5, { round: 0.015, taper: 0, noAo: true });
    for (const [x, z, w, d] of [[GX, FZ - 0.05, W + 0.25, 0.3], [GX, GZ - D / 2 + 0.05, W + 0.25, 0.3], [GX - W / 2 + 0.02, GZ, 0.3, D], [GX + W / 2 - 0.02, GZ, 0.3, D]]) B.slab('cream', x, H + 0.2, z, w, 0.42, d, { round: 0.08, taper: 0 });
    K.umbrella(B, GX - 2.6, GZ - 0.6, { c: 'accent', r: 1.1, ry: 0.3, parent: S.matrix({ pos: [0, H + 0.3, 0] }) });
    bean(B, GX - 3.2, GZ + 0.5, H + 0.3, '#ff9f68');
    bean(B, GX - 1.9, GZ + 0.7, H + 0.3, '#5ec8c0');
    K.planter(B, GX + 0.4, GZ - 1.5, { y: H + 0.3, s: 1.0, flowers: true });
    K.bush(B, GX - 3.6, GZ - 1.6, { y: H + 0.3, s: 0.6, flowers: true });
    for (const x of [GX - W / 2 + 0.3, GX + 0.9]) B.cyl('ink', x, H + 0.4, FZ - 0.1, 0.035, 1.5, 0, { sides: 5 });
    lights(B, [GX - W / 2 + 0.3, H + 1.85, FZ - 0.1], [GX + 0.9, H + 1.85, FZ - 0.1], 9, 0.28, { r: 0.075 });
    const lx = GX + 2.5, lz = FZ - 0.5, ly = H + 0.32;
    for (const s of [-1, 1]) B.slab('ink', lx + s * 0.45, ly - 0.05, lz - 0.25, 0.1, 0.6, 0.1, { round: 0.03 });
    B.slab('accent', lx, ly + 0.4, lz, 1.5, 1.5, 0.26, { round: 0.42, rx: -0.08 });
    B.slab('#9b84ff', lx, ly + 0.54, lz + 0.12, 1.2, 1.2, 0.04, { round: 0.34, rx: -0.08, noAo: true });
    B.ball({ c: '#ffffff', g: 0.4 }, lx - 0.24, ly + 1.22, lz + 0.06, 0.12, { sz: 0.4, detail: 0 });
    B.ball({ c: '#ffffff', g: 0.4 }, lx + 0.24, ly + 1.22, lz + 0.06, 0.12, { sz: 0.4, detail: 0 });
    for (let i = 0; i < 5; i++) { const a = Math.PI * (1.15 + i * 0.175); B.ball({ c: '#ffffff', g: 0.4 }, lx + Math.cos(a) * 0.36, ly + 0.95 + Math.sin(a) * 0.26, lz + 0.18, 0.055, { detail: 0 }); }
    // fascia: ink sign band with the app tiles
    B.slab('ink', GX - 2.0, H - 0.44, FZ + 0.03, 3.3, 0.36, 0.1, { round: 0.06 });
    for (let i = 0; i < 4; i++) B.slab(['#ff6b8b', '#ffb703', '#2ec4b6', '#3a86ff'][i], GX - 3.2 + i * 0.6, H - 0.41, FZ + 0.1, 0.28, 0.28, 0.05, { round: 0.08, g: -1.2 });
  }

  function desk(B, x, z, scr) {
    B.slab('desk', x, 0.95, z, 1.55, 0.08, 0.78, { round: 0.03 });
    for (const s of [-1, 1]) B.slab('ink', x + s * 0.7, 0.34, z, 0.06, 0.62, 0.68, { round: 0.02 });
    B.slab('#c9cdd6', x, 1.03, z - 0.05, 0.62, 0.03, 0.42, { round: 0.02 });
    B.slab('#c9cdd6', x, 1.04, z - 0.27, 0.62, 0.42, 0.03, { round: 0.02, rx: -0.28 });
    B.slab(scr, x, 1.06, z - 0.29, 0.54, 0.34, 0.01, { noAo: true, rx: -0.28 });
    B.ball({ c: '#ffffff', g: 0.5 }, x, 1.25, z - 0.21, 0.05, { sz: 0.3, detail: 0, rx: -0.28 });
    B.cyl('#ffffff', x + 0.55, 1.03, z + 0.1, 0.06, 0.13, 0, { sides: 7 });
    B.ball('#5aa35a', x - 0.58, 1.12, z + 0.15, 0.13, { detail: 0 });
    B.cyl('#e98a5a', x - 0.58, 1.0, z + 0.15, 0.09, 0.12, 0, { sides: 7 });
    B.cyl('ink', x, 0.34, z - 0.62, 0.22, 0.05, 0, { sides: 7 });
    B.cyl('ink', x, 0.38, z - 0.62, 0.04, 0.36, 0, { sides: 5 });
    B.slab('#4f5d8a', x, 0.72, z - 0.62, 0.48, 0.08, 0.45, { round: 0.04 });
    B.slab('#4f5d8a', x, 0.78, z - 0.86, 0.48, 0.55, 0.07, { round: 0.04 });
  }

  function outbox(B, x, z) {
    B.slab('cream', x, 0, z, 1.6, 0.6, 1.0, { round: 0.1 });
    B.slab('accent', x, 0.58, z, 1.7, 0.06, 1.1, { round: 0.03 });
    B.slab('ink', x, 0.2, z + 0.51, 1.0, 0.24, 0.02, { round: 0.03 });
    B.contact(x, z, 2.0, 1.3, { k: 0.8 });
  }

  function rack(B, x, z) {
    B.slab('ink', x, 0.3, z, 0.7, 2.1, 0.7, { round: 0.06 });
    B.slab('#3d4157', x, 0.4, z + 0.34, 0.6, 1.9, 0.03, { round: 0.02, noAo: true });
    for (let i = 0; i < 6; i++) B.slab('#232535', x, 0.48 + i * 0.3, z + 0.36, 0.56, 0.04, 0.02, { noAo: true });
  }

  function sofa(B, x, z) {
    B.slab('#ef8f7a', x, 0.34, z, 2.0, 0.45, 0.85, { round: 0.14 });
    B.slab('#ef8f7a', x, 0.7, z - 0.33, 2.0, 0.6, 0.25, { round: 0.12 });
    for (const s of [-1, 1]) B.slab('#e47a66', x + s * 0.95, 0.7, z, 0.22, 0.38, 0.85, { round: 0.1 });
    for (const s of [-1, 1]) B.slab('#f6d35c', x + s * 0.45, 0.82, z - 0.1, 0.5, 0.36, 0.14, { round: 0.1 });
  }

  function bean(B, x, z, y = 0, c = 'bean') {
    B.ball(c, x, y + 0.3, z, 0.45, { sy: 0.6, detail: 1, smooth: true });
    B.ball(c, x - 0.05, y + 0.5, z - 0.22, 0.3, { sy: 0.7, detail: 1, smooth: true });
  }

  function bikeRack(B, x, z) {
    for (let i = 0; i < 3; i++) B.cyl('ink', x - 0.6 + i * 0.6, 0, z, 0.04, 0.8, 0, { sides: 5 });
    B.slab('ink', x, 0.78, z, 1.3, 0.05, 0.05, { round: 0.02 });
    for (const s of [-1, 1]) B.add(S.drum(11, 0.32, 0.05), '#2a2a33', { x: x - 0.3 + s * 0.45, y: 0.32, z: z + 0.35, rx: 0, ry: 0 });
    B.slab('#ff6b8b', x - 0.3, 0.55, z + 0.35, 0.95, 0.06, 0.06, { round: 0.02, rz: 0.15 });
  }
}

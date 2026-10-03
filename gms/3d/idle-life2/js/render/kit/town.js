// The static town around the plots: streets, pavements, backdrop districts, river + bridge, quays, the far coast.
// Output is a handful of merged chunks (one draw each) split by x so the frustum and shadow passes cull them.
import * as S from './shape.js?v=20261004b';
import * as props from './props.js?v=20261004b';
import { WATER_Y } from './terrain.js?v=20261004b';
import { contactMesh } from './build.js?v=20261004b';

export function buildTown(kit, data, field, pal, districtPal) {
  const { STREET: ST, DISTRICT_SPAN: SPAN, RIVER_X } = data;
  const CELL = 44, X0 = ST.x0 - 120;
  const dOf = (x) => (x < SPAN.oldtown[1] + 3 ? 'oldtown' : x < (SPAN.suburbs[1] + SPAN.harbour[0]) / 2 ? 'suburbs' : x < (SPAN.harbour[1] + SPAN.downtown[0]) / 2 ? 'harbour' : 'downtown');
  const cells = new Map();
  const B = (x, z = 0) => {
    const k = Math.floor((x - X0) / CELL) + ':' + (z < -32 ? 'n' : z > 16 ? 's' : 'm');
    if (!cells.has(k)) cells.set(k, kit.builder(Object.assign({}, pal, districtPal[dOf(x)] || {}), { seed: 100 + cells.size * 31 }));
    return cells.get(k);
  };
  const gcells = new Map();
  const G = (x, z = 0) => {
    const k = Math.floor((x - X0) / CELL) + ':' + (z < -32 ? 'n' : z > 16 ? 's' : 'm');
    if (!gcells.has(k)) gcells.set(k, kit.builder(Object.assign({}, pal, districtPal[dOf(x)] || {}), { seed: 500 + gcells.size * 17 }));
    return gcells.get(k);
  };
  const far = kit.builder(pal, { seed: 999 });
  const lamps = [];
  const life = { pigeonSpots: [], joggerPaths: [], gullSpots: [], benches: [] };
  const rz = ST.z, hw = ST.width / 2;
  const roadN = rz - hw, roadS = rz + hw;
  const river0 = RIVER_X - 9, river1 = RIVER_X + 9;
  const segs = [[ST.x0 - 60, river0], [river1, ST.x1 + 80]];

  // ---- the street
  for (const [a, c] of segs) {
    for (let x = a; x < c; x += 30) {
      const xb = Math.min(c, x + 30), b = B((x + xb) / 2);
      const ot = (x + xb) / 2 < SPAN.oldtown[1] + 4;
      if (ot) props.paving(G((x + xb) / 2), (x + xb) / 2, rz, xb - x, ST.width, { colors: ['#d8c6bd', '#d2c0b9', '#dccbc0', '#d5c4bf', '#cfc0bc', '#d3c6c8', '#cfc8bd'], tone: 0.86, moss: { n: 0.55, s: 0.55 }, y: -0.04 });
      else {
        b.slab('road', (x + xb) / 2, -0.1, rz, xb - x, 0.12, ST.width, { round: 0.02, taper: 0 });
        for (let d = x + 1; d < xb - 1; d += 4.5) b.slab('roadLine', d + 1, 0.0, rz, 2, 0.035, 0.16, { round: 0.01, taper: 0, noAo: true });
      }
      for (const z of [roadN, roadS]) b.slab('kerb', (x + xb) / 2, -0.08, z, xb - x, 0.22, 0.32, { round: 0.06, taper: 0 });
      const pv = ot ? null : (x + xb) / 2 < SPAN.harbour[0] - 6 ? ['#e9e2d6', '#e3dacd', '#efe7dc'] : (x + xb) / 2 < SPAN.downtown[0] - 6 ? ['#e6d8c2', '#dccdb6', '#eadfcb'] : ['#e7dfe3', '#ddd5dc', '#ece6ea'];
      props.paving(G((x + xb) / 2), (x + xb) / 2, roadS + 1.6, xb - x, 2.9, { colors: pv || pal.cobbles, moss: { n: 0.4, s: 0.9 }, y: 0 });
    }
  }
  for (const [x, w] of [[27 + 12 + 1.5, 3], [SPAN.downtown[0] + 40, 3]]) {
    for (let i = 0; i < 7; i++) B(x).slab('roadLine', x, 0.02, roadN + 0.5 + i * 0.85, w, 0.04, 0.45, { round: 0.01, taper: 0, noAo: true });
  }

  // ---- bridge
  {
    const b = B(RIVER_X - 1);
    const L = river1 - river0 + 4;
    b.slab('stone', RIVER_X, -0.32, rz, L, 0.34, ST.width + 3.2, { round: 0.08, taper: 0 });
    props.paving(G(RIVER_X - 1), RIVER_X, rz, L, ST.width, { colors: ['#d8c6bd', '#d2c0b9', '#dccbc0'], tone: 0.86, moss: { n: 0.5, s: 0.5 }, y: -0.04 });
    for (const s of [-1, 1]) {
      const z = rz + s * (hw + 1.2);
      b.slab('stone', RIVER_X, 0, z, L, 0.9, 0.55, { round: 0.12, taper: 0.04 });
      b.slab('trim', RIVER_X, 0.88, z, L + 0.2, 0.14, 0.7, { round: 0.05, taper: 0 });
      for (const ex of [river0 - 2, river1 + 2]) {
        b.slab('stone', ex, 0, z, 0.9, 1.35, 0.9, { round: 0.1, taper: 0.06 });
        b.ball('trim', ex, 1.48, z, 0.28, { detail: 1 });
      }
      lamps.push(props.lamp(b, RIVER_X, z, {}));
      props.bunting(b, [river0 - 2, 1.4, z], [RIVER_X, 3.4, z], { sag: 0.5 });
      props.bunting(b, [RIVER_X, 3.4, z], [river1 + 2, 1.4, z], { sag: 0.5 });
    }
    for (const s of [-1, 1]) {
      const sx = RIVER_X + s * 3.2;
      b.slab('stone2', sx, -3.6, rz, 1.4, 3.3, ST.width + 2.4, { round: 0.2, taper: -0.05 });
    }
    b.add(archGeo(river1 - river0 - 1, 2.6, ST.width + 3.0), 'stone', { x: RIVER_X, y: -3.1, z: rz, r: 0.85 });
  }

  // ---- pavement / ground in front of and behind the plots, per district
  const ot = SPAN.oldtown, sb = SPAN.suburbs, hb = SPAN.harbour, dt = SPAN.downtown;
  for (let x = ST.x0 - 50; x < ot[1] + 2; x += 22) {
    const xb = Math.min(ot[1] + 2, x + 22), g = G((x + xb) / 2);
    props.paving(g, (x + xb) / 2, -1.25, xb - x, 11.5, { moss: { n: 0.6, s: 0.35 }, mossW: 1.1, y: -0.02 });
    props.paving(g, (x + xb) / 2, -7.75, xb - x, 1.5, { colors: ['#efe6dc', '#e8ddd2', '#f3ebe2', '#e6dcd6'], tone: 0.97, moss: { n: 0.8 }, mossW: 0.6, y: 0.0 });
    props.edging(g, [x, 0, -7.0], [xb, 0, -7.0], { c: '#e9dfd3', w: 0.3, h: 0.14, y: 0.02 });
  }
  for (let k = 0; k < 3; k++) oldTownGap(k * 27 + 13.5);
  for (let x = sb[0] - 4; x < sb[1] + 4; x += 26) {
    const xb = Math.min(sb[1] + 4, x + 26), b = B((x + xb) / 2);
    props.paving(G((x + xb) / 2), (x + xb) / 2, 3.1, xb - x, 2.8, { colors: ['#ece6dc', '#e5ddd1', '#f1ebe2', '#e9e1e6', '#e3e6da'], moss: { n: 1, s: 0.5 }, y: 0 });
    props.edging(b, [x, 0, 1.65], [xb, 0, 1.65], { c: '#e4dccf', w: 0.26, h: 0.12 });
  }
  for (let x = hb[0] - 8; x < hb[1] + 8; x += 26) {
    const xb = Math.min(hb[1] + 8, x + 26), b = B((x + xb) / 2);
    props.paving(G((x + xb) / 2), (x + xb) / 2, -1.9, xb - x, 12.6, { colors: ['#e6d8c2', '#dccdb6', '#eadfcb', '#d9cbb8', '#e3d2c6', '#d6d0c0'], moss: { n: 0.35, s: 0.3 }, y: 0 });
  }
  for (let x = dt[0] - 8; x < ST.x1 + 40; x += 26) {
    const xb = Math.min(ST.x1 + 40, x + 26), b = B((x + xb) / 2);
    props.paving(G((x + xb) / 2), (x + xb) / 2, -8, xb - x, 25, { colors: ['#e7dfe3', '#ddd5dc', '#ece6ea', '#e2dbe6', '#e4e0d6', '#dcd8e6'], moss: 0.2, y: 0 });
  }

  // ---- quay wall + harbour dressing
  {
    const b = B((hb[0] + hb[1]) / 2), q = data.QUAY;
    b.slab('stone2', (q.x0 + q.x1) / 2, WATER_Y - 2.5, q.z - 0.6, q.x1 - q.x0, 2.6, 1.6, { round: 0.12, taper: 0 });
    b.slab('stone', (q.x0 + q.x1) / 2, 0, q.z - 0.2, q.x1 - q.x0 + 0.4, 0.22, 1.0, { round: 0.08, taper: 0 });
    for (let x = q.x0 + 4; x < q.x1; x += 9) { props.bollard(b, x, q.z + 0.1, { c: 'iron' }); life.gullSpots.push([x, 0.75, q.z + 0.1]); }
    for (const [x, z, c] of [[q.x0 + 6, q.z - 7, 'blue'], [q.x0 + 30, q.z - 12, 'red'], [q.x1 - 18, q.z - 9, 'teal'], [q.x1 + 10, q.z - 22, 'yellow']]) {
      kit.vehicles.boat(b, x, z, 0.2 + (x % 3) * 0.3, 'white', 4.2, { y: WATER_Y - 0.35, stripe: c });
    }
    const lx = (hb[0] + hb[1]) / 2 + 10, lz = q.z - 46;
    b.add(S.blob(6, 1, { jitter: 0.25, rng: rngOf(4) }), 'stone2', { x: lx, y: WATER_Y - 1.5, z: lz, sy: 0.45 });
    b.cyl('white', lx, 0.8, lz, 1.6, 9, 0, { sides: 9, taper: 0.72 });
    for (let i = 0; i < 3; i++) b.cyl('red', lx, 2.2 + i * 2.6, lz, 1.5 - i * 0.18, 1.0, 0, { sides: 9, taper: 0.95 });
    b.cyl('glass', lx, 9.8, lz, 0.9, 1.3, 0, { sides: 9, taper: 1, g: 0.6 });
    b.cone('red', lx, 11.1, lz, 1.3, 1.4, 0, { sides: 9 });
    lamps.push([lx, 10.4, lz]);
  }

  // ---- Old Town backdrop: two terrace rows facing the street, a church, trees
  {
    const rows = [{ z: -11, f: [2, 3], d: 5 }, { z: -24, f: [3, 3], d: 6 }];
    for (const r of rows) {
      let x = ST.x0 - 48;
      while (x < ot[1] - 2) {
        const w = 3.6 + rngOf(x * 7 + r.z)() * 1.8;
        const b = B(x + w / 2, r.z);
        const f = r.f[0] + (rngOf(x)() < 0.5 ? 0 : r.f[1] - r.f[0]);
        const hr = rngOf(x * 13 + r.z * 3);
        const ww = [0.72, 0.6, 0.9, 0.72][Math.floor(hr() * 4)];
        props.house(b, x + w / 2, r.z + (hr() - 0.5) * 0.9, { w, d: r.d, floors: f + (hr() < 0.18 ? 1 : 0), fh: 2.2 + hr() * 0.45, pitch: 0.55 + hr() * 0.5, ww, wh: ww > 0.8 ? 0.9 : ww < 0.65 ? 1.15 : 0.98, quoins: hr() < 0.35, band: hr() < 0.4, chimneys: 1 + (hr() < 0.4 ? 1 : 0), dormer: hr() < 0.5 ? undefined : false, ridgeX: rngOf(x * 3)() < 0.45, shop: r.z === -11 && rngOf(x * 5)() < 0.35 ? { awning: ['accent', 'teal', 'blue', 'pink'][Math.floor(rngOf(x)() * 4)] } : null, shutters: rngOf(x * 11)() < 0.3, boxes: true, lite: true, sides: false });
        x += w + 0.08;
      }
    }
    const b = B(48);
    const cx = 48, cz = -44;
    b.slab('stone', cx, 0, cz, 7, 6.5, 12, { round: 0.15, taper: 0.02 });
    b.add(props.roofGeo(7, 12, 3.8, { col: S.rgb('#8a8fd0') }), null, { x: cx, y: 6.6, z: cz });
    b.slab('stone', cx, 0, cz + 7, 3.4, 13, 3.4, { round: 0.12, taper: 0.06 });
    b.cone('#8a8fd0', cx, 12.9, cz + 7, 2.5, 6.5, 0.3, { sides: 7, curve: 1.3 });
    b.ball('gold', cx, 19.5, cz + 7, 0.25, { detail: 0 });
    b.disc('white', cx, 9.5, cz + 8.72, 0.8, 0.1, { rx: Math.PI / 2 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) props.windowUnit(b, cx + s * 3.52, 2 + (i % 1) * 2, cz - 3 + i * 3, { ry: s * Math.PI / 2, w: 0.8, h: 2.2, frame: 'trim' });
    for (let i = 0; i < 16; i++) {
      const r = rngOf(i * 13 + 5);
      const x = ST.x0 - 40 + r() * (ot[1] - ST.x0 + 30), z = -34 - r() * 18;
      if (Math.abs(x - cx) < 6 && Math.abs(z - cz) < 9) continue;
      props.roundTree(B(x), x, z, { s: 1.1 + r() * 0.5 });
    }
    for (let x = ST.x0 - 40; x < ot[1] - 4; x += 18) lamps.push(props.lamp(B(x), x + 9, -7.6, {}));
    for (let x = ST.x0 - 40; x < ot[1] - 10; x += 18) props.bunting(B(x + 9), [x + 9, 3.2, -7.6], [x + 27, 3.2, -7.6], { sag: 0.7 });
  }

  // ---- Suburbs backdrop: detached pastel houses, lawns, fences, gardens
  {
    const rowsZ = [-20, -40, -60];
    let k = 0;
    for (const zr of rowsZ) for (let x = sb[0] - 2; x < sb[1] - 2; x += 15.5) {
      const r = rngOf(x * 17 + zr);
      const hx = x + 6 + r() * 3, hz = zr + (r() - 0.5) * 3;
      const b = B(hx, hz);
      props.house(b, hx, hz, { w: 5.2 + r() * 1.5, d: 5.4, floors: 1 + (r() < 0.6 ? 1 : 0), fh: 2.5, ridgeX: r() < 0.5, lite: true, shutters: r() < 0.5, boxes: r() < 0.4 });
      props.picket(b, hx - 6.5, hz + 6, hx + 6.5, hz + 6, {});
      props.roundTree(b, hx + 5 + r(), hz - 2 + r() * 3, { s: 0.9 + r() * 0.4 });
      props.bush(b, hx - 4.5, hz + 4.2, { flowers: true, s: 0.9 });
      props.bush(b, hx + 3.6, hz + 4.4, { s: 0.8 });
      b.slab('pave', hx, -0.02, hz + 4.8, 1.2, 0.08, 2.6, { round: 0.04, taper: 0 });
      if (k++ % 3 === 0) kit.vehicles.car(b, hx - 4.5, hz + 1.5, Math.PI / 2, ['blue', 'orange', 'teal', 'pink'][k % 4], {});
    }
    for (let x = sb[0]; x < sb[1]; x += 14) { const b = B(x); lamps.push(props.lamp(b, x + 7, -6, {})); props.hedge(b, x + 1, -7.5, x + 12, -7.5, { h: 0.8 }); }
    for (let i = 0; i < 12; i++) { const r = rngOf(i * 7 + 99); const x = sb[0] + r() * (sb[1] - sb[0]), z = -72 - r() * 30; props.roundTree(B(x, z), x, z, { s: 1.1 + r() * 0.5 }); }
  }

  // ---- Downtown backdrop: soft pastel glass towers
  {
    let x = dt[0] - 4;
    let i = 0;
    while (x < ST.x1 + 60) {
      const r = rngOf(x * 3 + 1);
      const w = 8 + r() * 6, d = 8 + r() * 4, h = 14 + r() * 30 * (i % 3 === 1 ? 1.2 : 0.8);
      tower(B(x + w / 2, -20), x + w / 2, -16 - d / 2 - r() * 6, w, d, h, ['#cfe3f0', '#f2dad6', '#e3dcf2', '#d6efe6', '#f5e6cc'][i % 5], r);
      if (r() < 0.5) tower(B(x + w / 2, -45), x + w / 2 + (r() - 0.5) * 4, -40 - r() * 14, w * 0.9, d, h * 1.4, ['#bcd6ea', '#e9cfd8', '#d8d2ee'][i % 3], r);
      x += w + 3 + r() * 4;
      i++;
    }
    for (let x2 = dt[0]; x2 < ST.x1 + 20; x2 += 11) { const b = B(x2); props.roundTree(b, x2, -11 + (x2 % 2), { s: 0.8, cluster: false }); b.cyl('stone', x2, 0, -11, 1.0, 0.45, 0, { sides: 9 }); }
    for (let x2 = dt[0]; x2 < ST.x1 + 20; x2 += 18) lamps.push(props.lamp(B(x2), x2 + 5, -9, { h: 4 }));
  }

  // ---- south side of the street, whole length: trees, lamps, benches, low cottages
  for (let x = ST.x0 - 40; x < ST.x1 + 60; x += 9) {
    if (x > river0 - 4 && x < river1 + 4) continue;
    const b = B(x), r = rngOf(x * 5 + 7);
    if ((x / 9) % 2 === 0) lamps.push(props.lamp(b, x, roadS + 0.6, {}));
    else props.roundTree(b, x + r() * 2, roadS + 5.2 + r() * 2, { s: 0.85 + r() * 0.3 });
    if (r() < 0.3) { props.bench(b, x + 4, roadS + 3.4, { ry: Math.PI }); life.benches.push([x + 4, roadS + 3.4]); }
    if (r() < 0.25) props.planter(b, x + 2.5, roadS + 2.6, { flowers: true });
  }
  for (let x = ST.x0 - 40; x < ST.x1 + 60; x += 7 + rngOf(x)() * 6) {
    if (x > river0 - 8 && x < river1 + 8) continue;
    const r = rngOf(x * 9 + 2);
    const b = B(x);
    props.house(B(x, 30), x, roadS + 15 + r() * 6, { ry: Math.PI + (r() - 0.5) * 0.12, w: 4 + r() * 1.5, d: 5, floors: 1 + (r() < 0.4 ? 1 : 0), lite: true, sides: false, door: false });
  }

  // ---- river banks dressing
  {
    const b = B(RIVER_X - 1);
    for (let z = -60; z < 80; z += 7) for (const s of [-1, 1]) {
      if (Math.abs(z - rz) < 9) continue;
      const r = rngOf(z * 7 + s);
      if (r() < 0.55) props.bush(b, RIVER_X + s * (11 + r() * 3), z, { s: 0.8 + r() * 0.4 });
      else props.roundTree(b, RIVER_X + s * (12 + r() * 3), z, { s: 0.9 + r() * 0.3 });
    }
  }

  // ---- far: hills scatter + the Coast teaser across the bay
  {
    const { x0, x1, z0, z1 } = data.WORLD_BOUNDS;
    for (let i = 0; i < 260; i++) {
      const r = rngOf(i * 31 + 7);
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      const h = field.height(x, z);
      if (h < 1.2 || (Math.abs(z - 7.5) < 60 && x > ST.x0 - 50 && x < ST.x1 + 40)) continue;
      if (r() < 0.45) props.pineTree(far, x, z, { y: h - 0.2, s: 1.4 + r() * 1.2, lod: true });
      else props.roundTree(far, x, z, { y: h - 0.2, s: 1.3 + r() * 1.0, lod: true });
    }
    for (let x = 140; x < x1; x += 18) {
      const r = rngOf(x);
      const zc = interp(data.COAST, x) - 12 - r() * 10;
      const h = field.height(x, zc);
      if (h < 0.3) continue;
      if (r() < 0.55) props.house(far, x, zc, { y: h, ry: (r() - 0.5) * 0.4, w: 6 + r() * 4, d: 5, floors: 2 + Math.floor(r() * 3), wall: ['#fbf1dc', '#f6d6c4', '#e6f2ee'][Math.floor(r() * 3)], roof: ['#e3a066', '#6fbfb2', '#d9786a'][Math.floor(r() * 3)], lite: true, sides: false, attic: false, chimneys: 0 });
      for (let j = 0; j < 2; j++) props.cypress(far, x + 5 + j * 3, zc + 6 + r() * 4, { y: field.height(x + 5 + j * 3, zc + 6) - 0.2, s: 1.4 });
    }
  }

  // ---- infill so the map reads as a town: more rows north and south, tree clusters in the fields
  for (const [zr, ry] of [[roadS + 34, Math.PI], [roadS + 50, Math.PI], [-40, 0], [-54, 0]]) {
    for (let x = ST.x0 - 60; x < ST.x1 + 70; x += 0) {
      const r = rngOf(x * 13 + zr);
      const w = 4 + r() * 3;
      x += w + 1.5 + r() * 6;
      if (x > river0 - 10 && x < river1 + 10) continue;
      if (zr < 0 && x > sb[0] - 6 && x < ST.x1 + 70) continue;
      const dz = dOf(x);
      if (dz === 'downtown' && zr > 0) { tower(B(x, zr), x, zr + 2, w + 3, 8, 9 + r() * 12, ['#f2dad6', '#e3dcf2', '#d6efe6'][Math.floor(r() * 3)], r); continue; }
      props.house(B(x, zr), x, zr + (r() - 0.5) * 2, { ry: ry + (r() - 0.5) * 0.1, w, d: 5, floors: 1 + (r() < 0.5 ? 1 : 0), lite: true, sides: false, door: false, chimneys: 1 });
      if (r() < 0.4) props.roundTree(B(x, zr), x + w / 2 + 1.2, zr + (ry ? -4 : 4), { s: 0.8 + r() * 0.5, cluster: false });
    }
  }
  for (let c = 0; c < 70; c++) {
    const r = rngOf(c * 57 + 3);
    const cx = data.WORLD_BOUNDS.x0 + r() * (data.WORLD_BOUNDS.x1 - data.WORLD_BOUNDS.x0), cz = data.WORLD_BOUNDS.z0 + r() * (data.WORLD_BOUNDS.z1 - data.WORLD_BOUNDS.z0);
    if (Math.abs(cz - 7.5) < 62 && cx > ST.x0 - 60 && cx < ST.x1 + 60) continue;
    if (field.wet(cx, cz) > 0.01) continue;
    const n = 4 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, rr = Math.sqrt(r()) * (5 + n);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, h = field.height(x, z);
      if (field.wet(x, z) > 0.01) continue;
      const sc = i === 0 ? 1.8 : 0.9 + r() * 0.7;
      if (r() < 0.5) props.pineTree(far, x, z, { y: h - 0.2, s: sc * 1.2, lod: true }); else props.roundTree(far, x, z, { y: h - 0.2, s: sc, lod: true });
    }
  }

  // life anchors
  life.pigeonSpots.push([-4, -3], [20, -5], [60, -5.5], [RIVER_X - 14, 1.5], [sb[0] + 30, 1.8], [dt[0] + 20, -5]);
  life.joggerPaths.push([[ST.x0 - 30, roadS + 1.6], [ST.x1 + 30, roadS + 1.6]]);

  const chunks = [...cells.entries()].map(([k, b]) => { const m = b.finish(); m.name = 'town:' + k; return m; });
  const ground = [...gcells.entries()].map(([k, b]) => { const m = b.finish({ cast: false }); m.name = 'ground:' + k; return m; });
  const farMesh = far.finish({ cast: false });
  farMesh.name = 'town:far';
  const rows = [...cells.values(), ...gcells.values()].flatMap((b) => b.contacts);
  const out = [...chunks, ...ground, farMesh];
  if (rows.length) out.push(contactMesh(kit.materials, rows));
  return { chunks: out, lamps, life };

  // Between Old Town plots: a kerbed tree planter, flowers, a bench and bollards so the cobbles never run on unbroken.
  function oldTownGap(x) {
    const b = B(x), r = rngOf(x * 3 + 1);
    b.slab('#e2d6c8', x, 0, -4.6, 2.6, 0.34, 2.6, { round: 0.1, taper: 0.03 });
    b.slab('dirt', x, 0.2, -4.6, 2.2, 0.16, 2.2, { round: 0.06, taper: 0 });
    b.contact(x, -4.6, 2.6, 2.6, { k: 0.7 });
    props.roundTree(b, x, -4.6, { s: 1.0 + r() * 0.2, y: 0.3 });
    for (let i = 0; i < 6; i++) b.ball(b.palette.flowers[i % 5], x - 0.9 + (i % 3) * 0.9 + r() * 0.2, 0.42, -5.5 + Math.floor(i / 3) * 1.8, 0.09, { detail: 0 });
    props.bench(b, x, -2.3, { ry: 0 });
    life.benches.push([x, -2.3]);
    props.planter(b, x - 1.0, 1.6, { flowers: true, s: 0.9 });
    props.bollard(b, x + 0.6, 3.9, {});
    props.bollard(b, x - 0.6, 3.9, {});
  }
}

function tower(b, x, z, w, d, h, glass, r) {
  const floors = Math.max(4, Math.round(h / 3.2));
  b.slab('stone', x, 0, z, w + 0.6, 1.2, d + 0.6, { round: 0.15, taper: 0 });
  b.slab({ c: glass, r: 0.12, m: 0.25 }, x, 1.0, z, w, h, d, { round: 0.35, taper: 0.03 });
  for (let f = 1; f < floors; f++) b.slab('trim', x, 1 + f * (h / floors) - 0.12, z, w * (1 - 0.03 * f / floors) + 0.12, 0.2, d * (1 - 0.03 * f / floors) + 0.12, { round: 0.08, taper: 0 });
  const cols = Math.max(2, Math.round(w / 2.4));
  for (let c = 0; c <= cols; c++) {
    const fx = -w / 2 + (c / cols) * w;
    b.slab('trim', x + fx * 0.985, 1, z + d / 2 * 0.985 + 0.02, 0.14, h * 0.99, 0.12, { round: 0.03, taper: 0 });
  }
  for (let f = 0; f < floors; f++) if (r() < 0.35) b.slab('window', x + (r() - 0.5) * w * 0.6, 1.3 + f * (h / floors), z + d / 2 + 0.03, w * 0.3, h / floors * 0.55, 0.04, { round: 0.02, taper: 0, noAo: true });
  b.slab('trim', x, 1 + h, z, w * 0.98, 0.5, d * 0.98, { round: 0.12, taper: 0.02 });
  if (r() < 0.6) b.slab('metal', x + (r() - 0.5) * w * 0.4, 1.5 + h, z, w * 0.35, 1.4, d * 0.3, { round: 0.12 });
  if (r() < 0.4) b.cyl('wood2', x - w * 0.25, 1.5 + h, z + d * 0.2, 0.9, 1.6, 0, { sides: 9 });
}

function archGeo(span, rise, depth) {
  const m = new S.Mesh();
  const n = 9, col = S.rgb('#d8cbbd'), under = S.rgb('#b7a99a');
  const pt = (t) => { const a = Math.PI * t; return [-Math.cos(a) * span / 2, Math.sin(a) * rise, 0]; };
  for (let i = 0; i < n; i++) {
    const a = pt(i / n), c = pt((i + 1) / n);
    const D = depth / 2;
    m.quad([a[0], a[1], D], [c[0], c[1], D], [c[0], c[1], -D], [a[0], a[1], -D], under);
    m.quad([a[0], a[1], D], [a[0], rise + 0.6, D], [c[0], rise + 0.6, D], [c[0], c[1], D], col);
    m.quad([c[0], c[1], -D], [c[0], rise + 0.6, -D], [a[0], rise + 0.6, -D], [a[0], a[1], -D], col);
  }
  return m.geo();
}

export function rngOf(seed) {
  let a = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t * t * (3 - 2 * t);
  }
  return pts[pts.length - 1][1];
}

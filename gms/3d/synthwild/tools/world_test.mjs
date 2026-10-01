// node tools/world_test.mjs  — lane 1 world tests (storage, setBox, light, raycast, gen determinism, persistence, perf)
import { World, UNLOADED } from '../js/world/world.js';
import { BLOCKS, BLOCK, TILES, OPACITY, EMIT, SOLID } from '../js/data/blocks.js';
import { newSection, refineCell, tryCollapse, refinedCount, REFINED } from '../js/world/section.js';
import { encodeSection, decodeSection } from '../js/world/persist.js';
import { makeTerrain } from '../js/world/terrain.js';
import { buildColumn } from '../js/world/column.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const section = (name) => console.log('-', name);
const B = BLOCK;

section('registry');
{
  const keys = new Set();
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i];
    ok(b && b.id === i, 'dense id ' + i);
    ok(!keys.has(b.key), 'unique key ' + b.key); keys.add(b.key);
    for (const f of ['top', 'side', 'bottom']) ok(TILES[b.tile[f]], `tile ${b.key}.${f}`);
  }
  ok(BLOCKS.length >= 37, 'block count ' + BLOCKS.length);
  ok(BLOCKS[B.GLOWBULB].light === 14 && BLOCKS[B.LUMEN_BLOOM].light === 10, 'light values');
  for (const t of TILES) ok(/^#[0-9a-f]{6}$/i.test(t.base) && /^#[0-9a-f]{6}$/i.test(t.accent) && t.pattern, 'tile hint ' + t.name);
}

section('storage refine/collapse + codec');
{
  const s = newSection(0, 0, 0);
  s.cells[5] = B.BASALT_MATRIX;
  const sub = refineCell(s, 5);
  ok(s.cells[5] & REFINED, 'refined flag');
  ok(sub.every((m) => m === B.BASALT_MATRIX), 'refine copies material');
  sub[3] = B.GLOWBULB;
  ok(!tryCollapse(s, 5), 'mixed cell stays refined');
  sub[3] = B.BASALT_MATRIX;
  ok(tryCollapse(s, 5) && s.cells[5] === B.BASALT_MATRIX && s.free.length === 1, 'collapse back to uniform');
  const sub2 = refineCell(s, 9); sub2[0] = 7;
  ok((s.cells[9] & 0x7fff) === 0, 'free slot reused');
  s.cells.fill(B.LOAM_MESH, 1000, 2000);
  const d = decodeSection(encodeSection(s));
  let same = true;
  for (let i = 0; i < 4096; i++) {
    const a = s.cells[i], b = d.cells[i];
    if ((a & REFINED) !== (b & REFINED)) same = false;
    else if (a & REFINED) { if (s.subs[a & 0x7fff].join() !== d.subs[b & 0x7fff].join()) same = false; }
    else if (a !== b) same = false;
  }
  ok(same, 'section codec round trip');
}

section('gen determinism (same seed, different seed, unaligned origin vs chunks)');
{
  const t1 = makeTerrain('alpha'), t2 = makeTerrain('alpha'), t3 = makeTerrain('beta');
  const a = t1.genColumn(3, -2).cells, b = t2.genColumn(3, -2).cells, c = t3.genColumn(3, -2).cells;
  ok(a.every((v, i) => v === b[i]), 'same seed identical');
  ok(!a.every((v, i) => v === c[i]), 'different seed differs');
  // generating at an origin offset by 8 must equal the halves of two aligned chunks: proves trees/caves/ores
  // are pure functions of world position and cross borders seamlessly
  let checked = 0, mism = 0, crossTree = 0;
  for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
    const A = t1.genColumn(cx, cz).cells, Bc = t1.genColumn(cx + 1, cz).cells, M = t1.genColumn(cx + 0.5, cz).cells;
    for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ref = x < 8 ? A[(x + 8) + z * 16 + y * 256] : Bc[(x - 8) + z * 16 + y * 256];
      const v = M[x + z * 16 + y * 256];
      checked++;
      if (v !== ref) mism++;
      if ((x === 7 || x === 8) && (v === B.SOLAR_LEAVES || v === B.CARBON_LOG)) crossTree++;
    }
  }
  ok(mism === 0, `offset-origin gen matches aligned chunks (${mism} mismatches of ${checked})`);
  ok(crossTree > 50, 'trees actually straddle borders in the sample: ' + crossTree);
}

section('world gen + spawn + biomes');
const W = new World({ seed: 'test-seed', sync: true });
const [spx, spy, spz] = W.spawn;
W.ensureArea(spx, spz, 3);
{
  ok(W.isReady(spx, spz), 'spawn chunk ready');
  ok(W.biomeAt(spx, spz) === 'shore', 'spawn on the shore: ' + W.biomeAt(spx, spz));
  ok(W.surfaceY(spx, spz) === spy && spy > 32, 'spawn surface on land above sea ' + spy);
  ok(W.waterLevelAt(spx, spz) === 0, 'spawn is dry');
  let biomes = new Set();
  for (let r = 0; r < 220; r += 8) for (let a = 0; a < 6.28; a += 0.4) biomes.add(W.terrain.column(Math.round(spx + Math.cos(a) * r), Math.round(spz + Math.sin(a) * r)).biome);
  ok(biomes.has(0) && biomes.has(1) && (biomes.has(2) || biomes.has(6)), 'forest, shore and ocean all near spawn');
  ok(W.terrain.column(Math.floor(spx), Math.floor(spz)).biome === 1 && [...biomes].every((b) => b <= 2 || b === 6), 'only forest/shore/ocean near spawn: ' + [...biomes]);
  // count features in a forest area
  let found = { leaves: 0, vine: 0, bloom: 0, kelp: 0, ore: 0, water: 0 };
  const tt = W.terrain;
  for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) {
    const c = tt.genColumn(cx, cz).cells;
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (v === B.SOLAR_LEAVES) found.leaves++;
      else if (v === B.DATA_VINE) found.vine++;
      else if (v === B.LUMEN_BLOOM) found.bloom++;
      else if (v === B.SERVER_KELP) found.kelp++;
      else if (v === B.WATER) found.water++;
      else if (v >= B.ORE_CARBON && v <= B.ORE_QUBIT) found.ore++;
    }
  }
  ok(Object.values(found).every((n) => n > 20), 'features present ' + JSON.stringify(found));
}

section('M2 biomes, caves, ores, flora');
{
  const t = makeTerrain('m2-biomes');
  const count = new Array(7).fill(0);
  let maxH = 0;
  for (let z = -6000; z <= 6000; z += 40) for (let x = -6000; x <= 6000; x += 40) {
    const c = t.column(x, z);
    count[c.biome]++;
    if (c.biome === 4) maxH = Math.max(maxH, c.h);
  }
  ok(count.every((n) => n > 150), 'all 7 biomes common over 12 km: ' + count.join(','));
  ok(maxH >= 95, 'mountain peaks reach ' + maxH);
  // find one column of each new biome and generate around it
  const find = (b) => { for (let z = -6000; z <= 6000; z += 40) for (let x = -6000; x <= 6000; x += 40) { const c = t.column(x, z); if (c.biome === b && (b === 6 || !c.water)) { let ok2 = true; for (const [dx, dz] of [[24, 0], [-24, 0], [0, 24], [0, -24]]) if (t.column(x + dx, z + dz).biome !== b) ok2 = false; if (ok2) return [x, z]; } } return null; };
  const tally = (cx0, cz0, n) => {
    const f = {};
    for (let cz = cz0 - n; cz <= cz0 + n; cz++) for (let cx = cx0 - n; cx <= cx0 + n; cx++) {
      const g = t.genColumn(cx, cz);
      for (let i = 0; i < g.cells.length; i++) f[g.cells[i]] = (f[g.cells[i]] || 0) + 1;
    }
    return f;
  };
  const des = find(3), mtn = find(4), pla = find(5), deep = find(6);
  ok(des && mtn && pla && deep, 'found desert/mountain/plains/deep ocean ' + JSON.stringify([des, mtn, pla, deep]));
  let f = tally(des[0] >> 4, des[1] >> 4, 4);
  ok(f[B.GLASS_SPIRE] > 10 && f[B.MIRROR_SANDSTONE] > 100, `desert spires ${f[B.GLASS_SPIRE]}, sandstone ${f[B.MIRROR_SANDSTONE]}`);
  f = tally(mtn[0] >> 4, mtn[1] >> 4, 3);
  ok(f[B.FIBRE_STONE] > 1000, 'fibre stone ' + f[B.FIBRE_STONE]);
  f = tally(pla[0] >> 4, pla[1] >> 4, 3);
  ok(f[B.CRYSTAL_TURF] > 500 && f[B.PRISM_FLOWER] > 10, `plains turf ${f[B.CRYSTAL_TURF]}, prism ${f[B.PRISM_FLOWER]}`);
  f = tally(deep[0] >> 4, deep[1] >> 4, 3);
  ok(f[B.SEABED_NODE] > 5 && f[B.KELP_BULB] > 5, `deep: nodes ${f[B.SEABED_NODE]}, kelp bulbs ${f[B.KELP_BULB]}`);
  let ruins = 0, snow = 0;
  for (let z = -3000; z <= 3000 && !(ruins && snow); z += 16) for (let x = -3000; x <= 3000 && !(ruins && snow); x += 16) {
    const c = t.column(x, z);
    if (!ruins && c.biome === 3) { const g = t.genColumn(x >> 4, z >> 4).cells; if (g.includes(B.MIRROR_TILE)) ruins++; }
    if (!snow && c.biome === 4 && c.h > 92) { const g = t.genColumn(x >> 4, z >> 4).cells; if (g.includes(B.FROST_LATTICE)) snow++; }
  }
  ok(ruins && snow, `found a mirror-tile ruin (${ruins}) and frost-lattice snowcap (${snow})`);
  // caves + ore depth profile over a land patch
  const ores = { [B.ORE_CARBON]: [], [B.ORE_FERRITE]: [], [B.ORE_AURUM]: [], [B.ORE_QUBIT]: [] };
  let caveAir = 0, solid = 0, glow = 0, moss = 0;
  for (let cz = -8; cz < 8; cz++) for (let cx = -8; cx < 8; cx++) {
    const g = t.genColumn(cx + (mtn[0] >> 4), cz + (mtn[1] >> 4));
    for (let i = 0; i < g.cells.length; i++) {
      const v = g.cells[i], y = i >> 8, h = g.heights[i & 255];
      if (y >= h - 7 || y < 3) continue;
      if (v === 0) caveAir++; else solid++;
      if (ores[v]) ores[v].push(y);
      if (v === B.GLOWCAP) glow++; else if (v === B.FILAMENT_MOSS) moss++;
    }
  }
  const avg = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
  const [c, fe, au, qu] = [B.ORE_CARBON, B.ORE_FERRITE, B.ORE_AURUM, B.ORE_QUBIT].map((k) => ores[k]);
  console.log(`  caves ${(100 * caveAir / (caveAir + solid)).toFixed(1)}% of underground; ores n/avgY carbon ${c.length}/${avg(c).toFixed(0)} ferrite ${fe.length}/${avg(fe).toFixed(0)} aurum ${au.length}/${avg(au).toFixed(0)} qubit ${qu.length}/${avg(qu).toFixed(0)}; glowcaps ${glow}, moss ${moss}`);
  ok(caveAir / (caveAir + solid) > 0.02 && caveAir / (caveAir + solid) < 0.2, 'cave volume sane');
  ok(c.length > fe.length && fe.length > au.length && au.length > qu.length && qu.length > 0, 'ore rarity order');
  ok(avg(c) > avg(fe) && avg(fe) > avg(au) && avg(au) > avg(qu), 'ore depth order');
  ok(qu.every((y) => y < 15) && au.every((y) => y < 34), 'deep ores stay deep');
  ok(glow > 20 && moss > 20, 'cave flora present');
}

section('structures');
{
  const t = makeTerrain('m2-biomes');
  const all = t.structuresNear(0, 0, 6000);
  const by = {};
  for (const st of all) (by[st.kind] ||= []).push(st);
  ok(['outpost', 'vault', 'observatory', 'ruin'].every((k) => by[k] && by[k].length >= 3), 'all structure kinds exist: ' + Object.entries(by).map(([k, v]) => k + ' ' + v.length).join(', '));
  // outpost density over forest + plains land
  let land = 0, samples = 0;
  for (let z = -6000; z <= 6000; z += 50) for (let x = -6000; x <= 6000; x += 50) { samples++; const b = t.column(x, z).biome; if (b === 0 || b === 5) land++; }
  const perOutpost = Math.sqrt((land / samples) * Math.PI * 36e6 / by.outpost.length);
  console.log(`  ${all.length} structures within 6 km; one outpost per ${perOutpost.toFixed(0)} x ${perOutpost.toFixed(0)} m of forest/plains`);
  ok(perOutpost > 200 && perOutpost < 450, 'outposts about 1 per 300x300 m');
  const contents = (st, r = 1) => {
    const f = {};
    for (let cz = (st.pos[2] >> 4) - r; cz <= (st.pos[2] >> 4) + r; cz++) for (let cx = (st.pos[0] >> 4) - r; cx <= (st.pos[0] >> 4) + r; cx++) {
      const c = t.genColumn(cx, cz).cells;
      for (let i = 0; i < c.length; i++) f[c[i]] = (f[c[i]] || 0) + 1;
    }
    return f;
  };
  const o = contents(by.outpost[0]);
  ok(o[B.CACHE] >= 1 && o[B.FABRICATOR] >= 1 && o[B.GLOWBULB] >= 1 && o[B.LIGHT_PANEL] >= 1, 'outpost has cache, fabricator, glowbulb, light');
  const v = by.vault[0], vc = contents(v);
  ok(vc[B.CACHE] >= 1 && vc[B.CLEARGLASS] > 40, 'vault has cache and glass dome');
  const Wv = new World({ seed: 'm2-biomes', sync: true });
  Wv.ensureArea(v.pos[0], v.pos[2], 1);
  ok(Wv.getCell(Math.floor(v.pos[0]), v.pos[1], Math.floor(v.pos[2])) === B.CACHE && Wv.getCell(Math.floor(v.pos[0]), v.pos[1] + 1, Math.floor(v.pos[2])) === 0
    && Wv.getCell(Math.floor(v.pos[0]), v.pos[1] + 7, Math.floor(v.pos[2])) === B.WATER, 'vault interior is dry under the sea');
  ok(Wv.blockLight(v.pos[0] + 1, v.pos[1] + 0.5, v.pos[2]) >= 10, 'vault interior is lit');
  const ob = contents(by.observatory[0]);
  ok(ob[B.CACHE] >= 1 && ob[B.NEON_COBALT] >= 3, 'observatory has cache and telescope');
  let ruinCaches = 0;
  for (const rr of by.ruin.slice(0, 20)) { const f = contents(rr, 0); if (f[B.CACHE]) ruinCaches++; }
  ok(ruinCaches > 0 && ruinCaches < 20, 'some ruins have a cache: ' + ruinCaches + '/20');
  // structures straddle chunk borders consistently
  let mism = 0;
  for (const st of [by.outpost[0], by.outpost[1], v, by.observatory[0], by.ruin[0]]) {
    const ccx = st.pos[0] >> 4, ccz = st.pos[2] >> 4;
    for (let cz = ccz - 1; cz <= ccz + 1; cz++) for (let cx = ccx - 1; cx <= ccx; cx++) {
      const A = t.genColumn(cx, cz).cells, Bc = t.genColumn(cx + 1, cz).cells, M = t.genColumn(cx + 0.5, cz).cells;
      for (let i = 0; i < M.length; i++) {
        const x = i & 15, rest = i - x;
        if (M[i] !== (x < 8 ? A[rest + x + 8] : Bc[rest + x - 8])) mism++;
      }
    }
  }
  ok(mism === 0, 'structures identical across chunk borders: ' + mism);
  // the near spawn of the default seed has something to find
  const Ws = new World({ seed: 'synthwild', sync: true });
  const ns = Ws.structuresNear(Ws.spawn[0], Ws.spawn[2], 600);
  console.log('  nearest structures to the synthwild spawn:', ns.slice(0, 3).map((q) => q.kind + '@' + q.dist.toFixed(0) + 'm').join(', '));
  ok(ns.length > 0 && ns[0].dist < 400, 'something to explore within 400 m of spawn');
}

section('starter outpost');
{
  for (const seed of ['synthwild', 'kids', 'test-seed', 'm2-biomes', 'alpha', 'beta']) {
    const t = makeTerrain(seed);
    const sp = t.spawnPoint();
    const st = t.structuresNear(sp[0], sp[2], 200).find((q) => q.starter);
    ok(st && st.kind === 'starter' && st.dist >= 55 && st.dist <= 125, `${seed}: starter outpost ${st ? st.dist.toFixed(0) + ' m' : 'missing'} from spawn`);
    if (!st) continue;
    const Ws = new World({ seed, sync: true });
    Ws.ensureArea(st.pos[0], st.pos[2], 1);
    const [qx, qy, qz] = st.cache;
    ok(Ws.getCell(qx, qy, qz) === B.CACHE, `${seed}: reported cache position holds a cache`);
    let fab = 0, glow = 0, beacon = 0;
    for (let y = qy - 1; y < qy + 24; y++) for (let z = qz - 6; z < qz + 6; z++) for (let x = qx - 6; x < qx + 6; x++) {
      const v = Ws.getCell(x, y, z);
      if (v === B.FABRICATOR) fab++; else if (v === B.GLOWBULB) glow++; else if (v === B.LIGHT_PANEL && y >= qy + 14) beacon++;
    }
    ok(fab === 1 && glow >= 2 && beacon >= 1, `${seed}: starter has fabricator, glowbulbs and a lit antenna (${fab},${glow},${beacon})`);
    ok(!t.structuresNear(st.pos[0], st.pos[2], 40).some((q) => q !== st && !q.starter), `${seed}: nothing else crowds the starter`);
    // spawn kit: blooms + exposed carbon within 30 m
    let blooms = 0, carbon = 0;
    Ws.ensureArea(sp[0], sp[2], 2);
    for (let y = sp[1] - 4; y < sp[1] + 10; y++) for (let z = Math.floor(sp[2]) - 30; z <= sp[2] + 30; z++) for (let x = Math.floor(sp[0]) - 30; x <= sp[0] + 30; x++) {
      if ((x - sp[0]) ** 2 + (z - sp[2]) ** 2 > 900) continue;
      const v = Ws.getCell(x, y, z);
      if (v === B.LUMEN_BLOOM) blooms++;
      else if (v === B.ORE_CARBON && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => Ws.getCell(x + a, y + b, z + c) === 0)) carbon++;
    }
    ok(blooms >= 5 && carbon >= 2, `${seed}: spawn kit within 30 m (${blooms} blooms, ${carbon} exposed carbon)`);
  }
}

section('no small floating terrain islands');
{
  const Wm = new World({ seed: 'synthwild', sync: true });
  Wm.ensureArea(1568, -3808, 3);
  const R = 2, X0 = ((1568 >> 4) - R) * 16, Z0 = ((-3808 >> 4) - R) * 16, N = (2 * R + 1) * 16, H = 128;
  const id = (x, y, z) => (x - X0) + (z - Z0) * N + y * N * N;
  const solid = new Uint8Array(N * N * H), seen = new Uint8Array(N * N * H);
  for (let y = 0; y < H; y++) for (let z = Z0; z < Z0 + N; z++) for (let x = X0; x < X0 + N; x++) {
    const v = Wm.getCell(x, y, z);
    solid[id(x, y, z)] = (v === -1 || (v > 0 && SOLID[v])) ? 1 : 0;
  }
  const q = [];
  for (let i = 0; i < N * N; i++) if (solid[i]) { seen[i] = 1; q.push(i); }
  const each6 = (i, f) => {
    const x = i % N, z = Math.floor(i / N) % N, y = Math.floor(i / (N * N));
    if (x > 0) f(i - 1); if (x < N - 1) f(i + 1); if (z > 0) f(i - N); if (z < N - 1) f(i + N);
    if (y > 0) f(i - N * N); if (y < H - 1) f(i + N * N);
  };
  for (let h = 0; h < q.length; h++) each6(q[h], (j) => { if (solid[j] && !seen[j]) { seen[j] = 1; q.push(j); } });
  let small = 0;
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || seen[i]) continue;
    const c = [i]; seen[i] = 1; let edge = false;
    for (let h = 0; h < c.length; h++) {
      const x = c[h] % N, z = Math.floor(c[h] / N) % N;
      if (!x || !z || x === N - 1 || z === N - 1) edge = true;
      each6(c[h], (j) => { if (solid[j] && !seen[j]) { seen[j] = 1; c.push(j); } });
    }
    if (!edge && c.length < 20) small++;
  }
  ok(small <= 1, 'mountain area has (almost) no small floating islands: ' + small);
}

section('generated water never sits next to air');
{
  const t = makeTerrain('synthwild');
  let lake = null;
  for (let r = 50; r < 3000 && !lake; r += 37) for (let a = 0; a < 6.28 && !lake; a += 0.3) {
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    if (t.column(x, z).lake) lake = [x, z];
  }
  const vault = t.structuresNear(0, 0, 3000).find((q) => q.kind === 'vault');
  const sites = [[...t.spawnPoint()].filter((_, i) => i !== 1), lake, [vault.pos[0], vault.pos[2]]];
  let open = 0, cells = 0;
  for (const [sx, sz] of sites) {
    const Ww = new World({ seed: 'synthwild', sync: true });
    Ww.ensureArea(sx, sz, 2);
    for (const c of Ww.chunks.values()) {
      if (!Ww.neighborsReady(c.cx, c.cz)) continue;
      for (let y = 1; y < 127; y++) for (let z = c.cz * 16; z < c.cz * 16 + 16; z++) for (let x = c.cx * 16; x < c.cx * 16 + 16; x++) {
        const v = Ww.getCell(x, y, z);
        if (v !== B.WATER && v !== B.SERVER_KELP && v !== B.KELP_BULB) continue;
        cells++;
        if ([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].some(([a, b, d]) => Ww.getCell(x + a, y + b, z + d) === 0)) open++;
      }
    }
  }
  ok(lake && cells > 10000 && open === 0, `no open water faces (${open} of ${cells} water cells; spawn, lake, vault)`);
}

section('setBox modes');
{
  // build area: high in the air above spawn so it is clean
  const bx = Math.floor(spx) * 4, by = 90 * 4, bz = Math.floor(spz) * 4;
  // 8x8x8 aligned fill must not refine
  let r = W.setBox([bx, by, bz], [bx + 32, by + 32, bz + 32], B.POLYMER_BRICK, 'fill');
  ok(r.changed === 32 * 32 * 32, 'fill changed count ' + r.changed);
  let refined = 0;
  for (const s of W.sections.values()) if (s) refined += refinedCount(s);
  ok(refined === 0, 'aligned 8^3 fill left no refined cells');
  ok(W.getCell(bx / 4 + 3, 93, bz / 4 + 3) === B.POLYMER_BRICK, 'filled cell');
  // break it all back, check removed counts
  r = W.setBox([bx, by, bz], [bx + 32, by + 32, bz + 32], 0, 'fill');
  ok(r.removed.length === 1 && r.removed[0].mat === B.POLYMER_BRICK && r.removed[0].count === 32768 && r.removed[0].blocks === 512, 'removed counts ' + JSON.stringify(r.removed));
  // sub placement refines then collapses
  r = W.setBox([bx, by, bz], [bx + 1, by + 1, bz + 1], B.GLOWBULB, 'fill');
  ok(W.getCell(bx / 4, by / 4, bz / 4) === -1 && W.getSub(bx, by, bz) === B.GLOWBULB, 'quarter placement refines');
  ok(W.blockLight(bx / 4 + 0.5, by / 4 + 0.5, bz / 4 + 0.5) === 14, 'refined glowbulb emits');
  W.setBox([bx, by, bz], [bx + 4, by + 4, bz + 4], B.CLEARGLASS, 'fill');
  ok(W.getCell(bx / 4, by / 4, bz / 4) === B.CLEARGLASS, 'full-cell overwrite collapses');
  W.setBox([bx, by, bz], [bx + 2, by + 4, bz + 4], 0, 'fill');
  W.setBox([bx, by, bz], [bx + 2, by + 4, bz + 4], B.CLEARGLASS, 'fill');
  ok(W.getCell(bx / 4, by / 4, bz / 4) === B.CLEARGLASS, 'refill halves collapses');
  W.setBox([bx, by, bz], [bx + 4, by + 4, bz + 4], 0, 'fill');
  // hollow: 3x3x3 units, wall 4 subs
  W.setBox([bx, by, bz], [bx + 12, by + 12, bz + 12], B.BASALT_MATRIX, 'hollow');
  ok(W.getSub(bx + 5, by + 5, bz + 5) === 0 && W.getSub(bx, by + 5, bz + 5) === B.BASALT_MATRIX, 'hollow interior air, wall solid');
  ok(W.getCell(bx / 4 + 1, by / 4 + 1, bz / 4 + 1) === 0, 'hollow interior is a uniform air cell');
  // shell leaves interior untouched
  W.setBox([bx + 4, by + 4, bz + 4], [bx + 8, by + 8, bz + 8], B.LUMEN_BLOOM, 'fill');
  W.setBox([bx, by, bz], [bx + 12, by + 12, bz + 12], B.LATTICE_PLANKS, 'shell');
  ok(W.getCell(bx / 4 + 1, by / 4 + 1, bz / 4 + 1) === B.LUMEN_BLOOM && W.getCell(bx / 4, by / 4, bz / 4) === B.LATTICE_PLANKS, 'shell keeps interior');
  // replace: only non-air
  W.setBox([bx, by, bz], [bx + 12, by + 12, bz + 12], 0, 'fill');
  W.setBox([bx, by, bz], [bx + 4, by + 4, bz + 4], B.LOAM_MESH, 'fill');
  r = W.setBox([bx, by, bz], [bx + 8, by + 8, bz + 8], B.MIRROR_SAND, 'replace');
  ok(W.getCell(bx / 4, by / 4, bz / 4) === B.MIRROR_SAND && W.getCell(bx / 4 + 1, by / 4, bz / 4) === 0, 'replace only non-air');
  ok(r.removed[0].mat === B.LOAM_MESH && r.removed[0].count === 64, 'replace reports removed');
  // fine hollow with wall 1 sub on an unaligned box
  W.setBox([bx + 1, by + 1, bz + 1], [bx + 7, by + 7, bz + 7], B.FABRICATOR, 'hollow', { wall: 1 });
  ok(W.getSub(bx + 1, by + 3, bz + 3) === B.FABRICATOR && W.getSub(bx + 3, by + 3, bz + 3) === 0, 'fine hollow');
  W.setBox([bx, by, bz], [bx + 12, by + 12, bz + 12], 0, 'fill');
  let left = 0;
  for (let y = by / 4; y < by / 4 + 3; y++) for (let z = bz / 4; z < bz / 4 + 3; z++) for (let x = bx / 4; x < bx / 4 + 3; x++) if (W.getCell(x, y, z) !== 0) left++;
  ok(left === 0, 'cleared');
  // plant support: breaking the ground under a bloom pops it
  const gx = Math.floor(spx) + 3, gz = Math.floor(spz) + 3, gy = W.surfaceY(gx, gz);
  W.setBox([gx * 4, gy * 4, gz * 4], [gx * 4 + 4, gy * 4 + 4, gz * 4 + 4], B.LUMEN_BLOOM, 'fill');
  r = W.setBox([gx * 4, (gy - 1) * 4, gz * 4], [gx * 4 + 4, gy * 4, gz * 4 + 4], 0, 'fill');
  ok(W.getCell(gx, gy, gz) === 0 && r.removed.some((e) => e.mat === B.LUMEN_BLOOM), 'unsupported bloom removed');
  ok(W.getCell(gx, 0, gz) === B.COREPLATE, 'floor intact');
  // sapling grows into a real tree; blocked trunk grows nothing
  {
    const sx2 = Math.floor(spx) - 14, sz2 = Math.floor(spz) + 9, sy2 = W.surfaceY(sx2, sz2);
    W.setBox([sx2 * 4, sy2 * 4, sz2 * 4], [sx2 * 4 + 4, sy2 * 4 + 4, sz2 * 4 + 4], B.BIO_SAPLING, 'fill');
    W.setBox([(sx2 + 2) * 4, (sy2 + 4) * 4, sz2 * 4], [(sx2 + 3) * 4, (sy2 + 5) * 4, sz2 * 4 + 4], B.POLYMER_BRICK, 'fill');
    const n = W.growTree(sx2, sy2, sz2);
    ok(n > 20 && W.getCell(sx2, sy2, sz2) === B.CARBON_LOG && W.getCell(sx2, sy2 + 3, sz2) === B.CARBON_LOG, 'sapling grew a tree: ' + n);
    ok(W.getCell(sx2 + 2, sy2 + 4, sz2) === B.POLYMER_BRICK, 'tree spares player blocks');
    W.setBox([sx2 * 4 + 40, (sy2 + 2) * 4, sz2 * 4], [sx2 * 4 + 44, (sy2 + 3) * 4, sz2 * 4 + 4], B.POLYMER_BRICK, 'fill');
    const sy3 = W.surfaceY(sx2 + 10, sz2);
    W.setBox([(sx2 + 10) * 4, (sy3 + 2) * 4, sz2 * 4], [(sx2 + 11) * 4, (sy3 + 3) * 4, sz2 * 4 + 4], B.POLYMER_BRICK, 'fill');
    ok(W.growTree(sx2 + 10, sy3, sz2) === 0, 'no room → no tree');
  }
  // climb rail on a wall pops when its wall is broken
  const rx = gx + 6, rz = gz, ry = W.surfaceY(rx, rz) + 3;
  W.setBox([rx * 4, ry * 4, rz * 4], [rx * 4 + 4, ry * 4 + 4, rz * 4 + 4], B.POLYMER_BRICK, 'fill');
  W.setBox([(rx + 1) * 4, ry * 4, rz * 4], [(rx + 2) * 4, ry * 4 + 4, rz * 4 + 4], B.CLIMB_RAIL, 'fill');
  ok(JSON.stringify(W.railFace(rx + 1, ry, rz)) === '[1,0,0]', 'rail faces away from its wall');
  ok(!W.isSolidSub((rx + 1) * 4, ry * 4, rz * 4) && W.skyLight(rx + 1.5, ry + 0.5, rz + 0.5) === 15, 'rail: no collision, no shadow');
  r = W.setBox([rx * 4, ry * 4, rz * 4], [rx * 4 + 4, ry * 4 + 4, rz * 4 + 4], 0, 'fill');
  ok(W.getCell(rx + 1, ry, rz) === 0 && r.removed.some((e) => e.mat === B.CLIMB_RAIL), 'rail pops with its wall');

  r = W.setBox([gx * 4, 0, gz * 4], [gx * 4 + 4, 4, gz * 4 + 4], 0, 'fill');
  ok(r.changed === 0 && W.getCell(gx, 0, gz) === B.COREPLATE, 'coreplate floor immutable');
}

section('water flows into a hole next to the sea');
{
  // find a shallow sea column near spawn
  let hit = null;
  for (let r = 0; r < 60 && !hit; r++) for (let a = 0; a < 6.28 && !hit; a += 0.1) {
    const x = Math.round(spx + Math.cos(a) * r), z = Math.round(spz + Math.sin(a) * r);
    if (!W.isChunkLoaded((x - 1) >> 4, z >> 4) || !W.isChunkLoaded((x + 1) >> 4, z >> 4)) continue;
    for (const dx of [1, -1]) {
      if (W.getCell(x, 31, z) === B.WATER && W.getCell(x + dx, 31, z) > 0 && W.getCell(x + dx, 31, z) !== B.WATER && W.getCell(x + dx, 31, z) !== B.SERVER_KELP && W.getCell(x + dx, 32, z) !== B.WATER) { hit = [x, dx, z]; break; }
    }
  }
  ok(!!hit, 'found a shoreline column');
  if (hit) {
    const [x, dx, z] = hit, y = 31;
    W.setBox([(x + dx) * 4, y * 4, z * 4], [(x + dx + 1) * 4, (y + 1) * 4, z * 4 + 4], 0, 'fill');
    ok(W.getCell(x + dx, y, z) === B.WATER, 'hole flooded ' + JSON.stringify([hit, W.getCell(x + dx, y, z), W.getCell(x, y, z), W.isChunkLoaded((x+dx)>>4, z>>4)]));
    W.setBox([(x + dx) * 4, (y + 1) * 4, z * 4], [(x + dx + 1) * 4, (y + 2) * 4, z * 4 + 4], 0, 'fill');
    ok(W.getCell(x + dx, y + 1, z) === 0, 'no flooding above sea level');
  }
}

section('readBox / writeBox (undo + paste)');
{
  const Wb = new World({ seed: 'copy', sync: true });
  const [qx, , qz] = Wb.spawn;
  Wb.ensureArea(qx, qz, 2);
  const x = Math.floor(qx) * 4, z = Math.floor(qz) * 4, y = Wb.surfaceY(qx, qz) * 4;
  const min = [x - 9, y - 10, z - 7], max = [x + 23, y + 18, z + 13];
  Wb.setBox([x + 1, y + 1, z + 1], [x + 3, y + 2, z + 2], B.NEON_LIME, 'fill'); // some refined cells
  const snap = Wb.readBox(min, max);
  ok(snap.data.length === 32 * 28 * 20 && !snap.unloaded, 'readBox size');
  ok(snap.data[(x + 1 - min[0]) + (z + 1 - min[2]) * 32 + (y + 1 - min[1]) * 32 * 20] === B.NEON_LIME, 'readBox reads subs');
  const light0 = Wb.serialize();
  Wb.setBox([x, y - 8, z], [x + 16, y + 8, z + 8], B.POLYMER_BRICK, 'fill');
  Wb.setBox([x + 2, y, z + 2], [x + 5, y + 3, z + 3], 0, 'fill');
  Wb.setBox([x - 4, y + 4, z - 4], [x + 20, y + 5, z + 10], B.GLOWBULB, 'fill');
  const r = Wb.writeBox(min, max, snap.data);
  const back = Wb.readBox(min, max);
  ok(back.data.every((v, i) => v === snap.data[i]), 'undo restores every sub');
  ok(r.changed > 0 && r.removed.some((e) => e.mat === B.POLYMER_BRICK), 'undo reports what it removed');
  const W2 = World.deserialize(JSON.parse(JSON.stringify(Wb.serialize())), { sync: true });
  W2.ensureArea(qx, qz, 2);
  let ld = 0;
  for (let yy = (min[1] >> 2) - 4; yy < (max[1] >> 2) + 4; yy++) for (let zz = (min[2] >> 2) - 4; zz < (max[2] >> 2) + 4; zz++)
    for (let xx = (min[0] >> 2) - 4; xx < (max[0] >> 2) + 4; xx++) if (Wb._lget(xx, yy, zz) !== W2._lget(xx, yy, zz)) ld++;
  ok(ld === 0, 'light after undo equals recompute: ' + ld);
  // aligned paste of a whole-cell copy stays uniform; skipAir keeps what is there
  const src = Wb.readBox([x - 16, y - 16, z - 16], [x + 16, y + 16, z + 16]);
  Wb.writeBox([x - 16, y + 48, z - 16], [x + 16, y + 80, z + 16], src.data);
  let refined = 0;
  for (const sct of Wb.sections.values()) if (sct && sct.sy === ((y + 64) >> 6)) refined += refinedCount(sct);
  ok(refined <= 2, 'aligned paste stays uniform (only the copied refined cells): ' + refined);
  Wb.setBox([x, y + 120, z], [x + 4, y + 124, z + 4], B.CACHE, 'fill');
  const air = new Uint8Array(4 * 4 * 4);
  Wb.writeBox([x, y + 120, z], [x + 4, y + 124, z + 4], air, { skipAir: true });
  ok(Wb.getSub(x, y + 120, z) === B.CACHE, 'skipAir paste does not carve');
}

section('placed water falls and spreads (bounded)');
{
  const Wf = new World({ seed: 'pour', sync: true });
  const [fx, , fz] = Wf.spawn;
  Wf.ensureArea(fx, fz, 2);
  const x = Math.floor(fx), z = Math.floor(fz);
  // a flat brick floor with a 6-high pillar, water poured on top of the pillar
  const y = Wf.surfaceY(x, z) + 1;
  Wf.setBox([(x - 8) * 4, y * 4, (z - 8) * 4], [(x + 9) * 4, (y + 1) * 4, (z + 9) * 4], B.POLYMER_BRICK, 'fill');
  Wf.setBox([(x - 8) * 4, (y + 1) * 4, (z - 8) * 4], [(x + 9) * 4, (y + 12) * 4, (z + 9) * 4], 0, 'fill');
  Wf.setBox([x * 4, (y + 1) * 4, z * 4], [x * 4 + 4, (y + 6) * 4, z * 4 + 4], B.POLYMER_BRICK, 'fill');
  const r = Wf.setBox([x * 4, (y + 6) * 4, z * 4], [x * 4 + 4, (y + 7) * 4, z * 4 + 4], B.WATER, 'fill');
  let floorWater = 0, far = 0;
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
    if (Wf.getCell(x + dx, y + 1, z + dz) === B.WATER) { floorWater++; if (Math.abs(dx) + Math.abs(dz) > 5) far++; }
  }
  ok(Wf.getCell(x + 1, y + 6, z) === B.WATER && Wf.getCell(x + 1, y + 1, z) === B.WATER, 'water spreads off the pillar and falls');
  ok(floorWater > 10 && far === 0, `pool on the floor is bounded: ${floorWater} cells`);
  ok(r.removed.length === 0, 'pouring reports nothing removed');
  Wf.setBox([(x + 6) * 4, (y + 1) * 4, z * 4], [(x + 7) * 4, (y + 2) * 4, z * 4 + 4], B.WATER, 'fill', { flow: false });
  ok(Wf.getCell(x + 6, y + 1, z) === B.WATER && Wf.getCell(x + 7, y + 1, z) === 0, 'flow:false places a still cell');
}

section('light: incremental == full recompute');
{
  const x = Math.floor(spx), z = Math.floor(spz), y = W.surfaceY(x, z);
  ok(W.skyLight(x + 0.5, y + 0.5, z + 0.5) === 15, 'open sky 15');
  // roof over the spawn: dark below, glowbulb lights it
  W.setBox([(x - 3) * 4, (y + 3) * 4, (z - 3) * 4], [(x + 4) * 4, (y + 4) * 4, (z + 4) * 4], B.POLYMER_BRICK, 'fill');
  ok(W.skyLight(x + 0.5, y + 0.5, z + 0.5) < 15, 'roof shades: ' + W.skyLight(x + 0.5, y + 0.5, z + 0.5));
  W.setBox([x * 4, (y + 2) * 4, z * 4], [x * 4 + 4, (y + 3) * 4, z * 4 + 4], B.GLOWBULB, 'fill');
  ok(W.blockLight(x + 0.5, y + 2.5, z + 0.5) === 14 && W.blockLight(x + 2.5, y + 2.5, z + 0.5) === 12, 'glowbulb falloff');
  // dig a shaft and a tunnel, then compare against a fresh world loaded from the save (full recompute)
  W.setBox([(x + 6) * 4, (y - 12) * 4, z * 4], [(x + 7) * 4, (y + 1) * 4, z * 4 + 4], 0, 'fill');
  W.setBox([(x + 6) * 4, (y - 12) * 4, z * 4], [(x + 14) * 4, (y - 10) * 4, z * 4 + 4], 0, 'fill');
  W.setBox([(x + 13) * 4, (y - 12) * 4, z * 4], [(x + 13) * 4 + 4, (y - 11) * 4, z * 4 + 4], B.GLOWBULB, 'fill');
  W.setBox([(x - 3) * 4, (y + 3) * 4, (z - 3) * 4], [(x + 1) * 4, (y + 4) * 4, (z + 4) * 4], 0, 'fill'); // open half the roof
  const save = W.serialize();
  const W2 = World.deserialize(JSON.parse(JSON.stringify(save)), { sync: true });
  W2.ensureArea(spx, spz, 3);
  let diff = 0, n = 0, firstDiff = null;
  for (let yy = y - 20; yy < y + 10; yy++) for (let zz = z - 20; zz < z + 20; zz++) for (let xx = x - 20; xx < x + 24; xx++) {
    n++;
    const a = W._lget(xx, yy, zz), b = W2._lget(xx, yy, zz);
    if (a !== b) { diff++; firstDiff ||= [xx, yy, zz, a.toString(16), b.toString(16)]; }
    if (W.getCell(xx, yy, zz) !== W2.getCell(xx, yy, zz)) diff++;
  }
  ok(diff === 0, `incremental light/cells match recompute (${diff} diffs of ${n}) ${firstDiff || ''}`);
}

section('light: time-sliced relight of a huge stamp, and a brute-force reference');
{
  const Wd = new World({ seed: 'slice', sync: true });
  const [ax, , az] = Wd.spawn;
  Wd.ensureArea(ax, az, 2);
  const bx = Math.floor(ax) * 4 - 64, bz = Math.floor(az) * 4 - 64;
  const t0 = performance.now();
  Wd.setBox([bx, 100 * 4, bz], [bx + 128, 108 * 4, bz + 128], B.POLYMER_BRICK, 'fill');
  const tEdit = performance.now() - t0;
  ok(Wd.lightPending(), 'huge stamp defers its relight');
  let frames = 0, worst = 0;
  while (Wd.lightPending() && frames < 500) { const t = performance.now(); Wd.update(ax, az, 2); worst = Math.max(worst, performance.now() - t); frames++; }
  console.log(`  32x2x32-unit stamp: edit ${tEdit.toFixed(1)} ms, relit over ${frames} frames, worst frame ${worst.toFixed(1)} ms`);
  ok(!Wd.lightPending() && frames >= 3, 'relight spread over several frames and finished');
  const W3 = World.deserialize(JSON.parse(JSON.stringify(Wd.serialize())), { sync: true });
  W3.ensureArea(ax, az, 2);
  let diff = 0;
  for (const [key, s] of Wd.sections) {
    const s3 = W3.sections.get(key);
    if (!s || !s3) { if ((s && s3 === null) || (s === null && s3)) { const a = s || s3; if (a.light.some((v) => v !== 0xf0)) diff++; } continue; }
    for (let i = 0; i < 4096; i++) if (s.light[i] !== s3.light[i]) diff++;
  }
  ok(diff === 0, 'sliced relight equals recompute: ' + diff);

  // brute-force fixpoint over 3x3 chunks of deep ocean (emissive kelp bulbs + seabed nodes) after a dig
  const t = makeTerrain('synthwild');
  let deepAt = null;
  for (let z = -4000; z <= 4000 && !deepAt; z += 64) for (let x = -4000; x <= 4000 && !deepAt; x += 64) if (t.column(x, z).biome === 6 && t.column(x + 40, z).biome === 6) deepAt = [x, z];
  const Wr = new World({ seed: 'synthwild', sync: true });
  Wr.ensureArea(deepAt[0], deepAt[1], 1);
  const gx = deepAt[0], gz = deepAt[1], gy = Wr.surfaceY(gx, gz);
  Wr.setBox([(gx + 3) * 4, 4, gz * 4], [(gx + 4) * 4, (gy + 1) * 4, gz * 4 + 4], 0, 'fill');
  Wr.setBox([gx * 4, (gy + 4) * 4, (gz - 2) * 4], [(gx + 6) * 4, (gy + 5) * 4, (gz + 3) * 4], B.GLOWBULB, 'fill');
  ok(lightReferenceDiffs(Wr) === 0, 'world light equals brute-force reference');
}

section('raycast');
{
  let x, z, y;
  for (let k = 4; k < 40; k++) {
    x = Math.floor(spx) - k; z = Math.floor(spz) - 6; y = W.surfaceY(x + 0.5, z + 0.5);
    if (y > 32 && W.getCell(x, y, z) === 0 && W.getCell(x, y - 1, z) > 0 && W.getCell(x, y + 1, z) === 0) break;
  }
  const hit = W.raycast([x + 0.5, y + 3, z + 0.5], [0, -1, 0], 10);
  ok(hit && hit.normal[1] === 1 && Math.abs(hit.dist - 3) < 1e-6 && hit.sub[1] === y * 4 - 1, 'down ray hits top face ' + JSON.stringify(hit));
  W.setBox([x * 4 + 1, (y + 1) * 4 + 2, z * 4 + 1], [x * 4 + 2, (y + 1) * 4 + 3, z * 4 + 2], B.NEON_CYAN, 'fill');
  const h2 = W.raycast([x - 2, (y + 1) + 2.5 / 4, z + 1.5 / 4], [1, 0, 0], 10);
  ok(h2 && h2.mat === B.NEON_CYAN && h2.normal[0] === -1 && h2.sub[0] === x * 4 + 1, 'ray hits a single sub ' + JSON.stringify(h2 && h2.sub));
  ok(W.raycast([x + 0.5, 120, z + 0.5], [0, 1, 0], 50) === null, 'ray to sky misses');
  ok(W.isSolidSub(x * 4 + 1, (y + 1) * 4 + 2, z * 4 + 1) && !W.isSolidSub(x * 4, (y + 1) * 4 + 2, z * 4), 'isSolidSub fine');
  ok(W.surfaceY(x + 0.3, z + 0.3) === y + 1 + 3 / 4 && W.surfaceY(x + 0.1, z + 0.1) === y, 'surfaceY sub precise');
  let t0 = performance.now();
  for (let k = 0; k < 10000; k++) W.raycast([spx, spy + 1.6, spz], [Math.cos(k), -0.3, Math.sin(k)], 8);
  console.log(`  raycast 8u: ${((performance.now() - t0) / 10000 * 1000).toFixed(1)} µs`);
}

section('serialize size, unload/reload keeps edits');
{
  const save = W.serialize();
  const json = JSON.stringify(save);
  console.log(`  save after the test edits: ${Object.keys(save.sections).length} sections, ${json.length} bytes JSON`);
  ok(Object.keys(save.sections).length > 0 && json.length < 6000, `save small: ${Object.keys(save.sections).length} sections, ${json.length} bytes`);
  const x = Math.floor(spx), z = Math.floor(spz), y = W.surfaceY(x, z);
  const before = W.getCell(x, y + 2, z);
  W.update(spx + 16 * 40, spz, 3); // walk far away: spawn chunks unload into the mods stash
  ok(!W.isChunkLoaded(x >> 4, z >> 4) && W.mods.size > 0, 'unloaded with edits stashed');
  ok(JSON.stringify(W.serialize()) === json, 'serialize identical while unloaded');
  W.ensureArea(spx, spz, 1);
  ok(W.getCell(x, y + 2, z) === before && before === B.GLOWBULB, 'edits survive reload');
}

section('mesh payload');
{
  const cx = Math.floor(spx) >> 4, cz = Math.floor(spz) >> 4, sy = Math.floor(spy) >> 4;
  W.ensureArea(spx, spz, 2);
  const p = W.meshPayload(cx, sy, cz);
  ok(p && !p.empty && p.cells.length === 18 ** 3 && p.light.length === 18 ** 3, 'payload shape');
  const lx = 5, ly = 7, lz = 9;
  const idx = (x, y, z) => (x + 1) + (z + 1) * 18 + (y + 1) * 324;
  ok(p.cells[idx(lx, ly, lz)] === W.sections.get(`${cx},${sy},${cz}`).cells[lx + lz * 16 + ly * 256] || (p.cells[idx(lx, ly, lz)] & REFINED), 'center matches');
  ok(p.cells[idx(-1, 3, 4)] === (W.getCell(cx * 16 - 1, sy * 16 + 3, cz * 16 + 4) & 0xffff) || W.getCell(cx * 16 - 1, sy * 16 + 3, cz * 16 + 4) === -1, 'border -x matches');
  ok(p.light[idx(16, 16, 16)] === W._lget(cx * 16 + 16, sy * 16 + 16, cz * 16 + 16), 'corner light matches');
  const pb = W.meshPayload(cx, 0, cz);
  ok(pb.cells[idx(4, -1, 4)] === B.COREPLATE, 'below world = coreplate');
  // an edge chunk shows UNLOADED on its open side
  let edge = null;
  for (const c of W.chunks.values()) if (!W.isChunkLoaded(c.cx + 1, c.cz)) { edge = c; break; }
  const pe = W.meshPayload(edge.cx, 2, edge.cz);
  ok(pe.empty || pe.cells[idx(16, 4, 4)] === UNLOADED, 'unloaded neighbour marked');
  let t0 = performance.now();
  for (let k = 0; k < 200; k++) W.meshPayload(cx, sy, cz);
  console.log(`  meshPayload: ${((performance.now() - t0) / 200).toFixed(3)} ms`);
}

section('dirty notifications');
{
  const got = new Set();
  W.onSectionDirty((k) => got.add(k));
  const x = Math.floor(spx), z = Math.floor(spz), y = W.surfaceY(x, z);
  W.setBox([x * 4, (y + 6) * 4, z * 4], [x * 4 + 4, (y + 7) * 4, z * 4 + 4], B.LIGHT_PANEL, 'fill');
  ok(got.has(`${x >> 4},${(y + 6) >> 4},${z >> 4}`), 'edited section dirty');
  ok(got.size < 12, 'single edit dirties few sections: ' + got.size);
}

section('perf');
{
  const t = makeTerrain('perf');
  for (let i = 0; i < 10; i++) buildColumn(t, i, 50, null);
  let g = 0, tot = 0, n = 0;
  const cpu0 = process.cpuUsage();
  for (let cz = -6; cz < 6; cz++) for (let cx = -6; cx < 6; cx++) { const { msg } = buildColumn(t, cx, cz, null); g += msg.genMs; tot += msg.totalMs; n++; }
  const cpu = process.cpuUsage(cpu0), cpuMs = (cpu.user + cpu.system) / 1000 / n;
  console.log(`  column gen ${(g / n).toFixed(2)} ms, gen+light ${(tot / n).toFixed(2)} ms wall, ${cpuMs.toFixed(2)} ms CPU (node, ${n} cols)`);
  const Wp = new World({ seed: 'perf', sync: true });
  const ta = performance.now();
  Wp.ensureArea(0, 0, 6);
  console.log(`  ensureArea r6 (${Wp.chunks.size} chunks incl. main-thread merge): ${(performance.now() - ta).toFixed(0)} ms, apply avg ${(Wp.stats.applyMs / Wp.stats.generated).toFixed(2)} ms`);
  const tb = performance.now();
  const s = Wp.setBox([0, 200, 0], [128, 264, 128], B.BASALT_MATRIX, 'fill');
  console.log(`  setBox 32x16x32 units fill (relight deferred): ${(performance.now() - tb).toFixed(1)} ms (${s.changed} subs)`);
  const tf = performance.now();
  Wp.finishLight();
  console.log(`  (its deferred relight run to completion in one go: ${(performance.now() - tf).toFixed(1)} ms)`);
  const sy0 = Wp.surfaceY(40, 40);
  const td = performance.now();
  Wp.setBox([160, sy0 * 4, 160], [192, sy0 * 4 + 32, 192], B.POLYMER_BRICK, 'fill');
  const te = performance.now();
  Wp.setBox([160, sy0 * 4, 160], [192, sy0 * 4 + 32, 192], 0, 'fill');
  console.log(`  8x8x8 stamp on the ground: place ${(te - td).toFixed(1)} ms, break ${(performance.now() - te).toFixed(1)} ms`);
  const tc = performance.now();
  Wp.setBox([5, 201, 5], [6, 202, 6], 0, 'fill');
  console.log(`  single-sub break: ${(performance.now() - tc).toFixed(2)} ms`);
  ok(cpuMs < 4, 'column under 4 ms CPU in node: ' + cpuMs.toFixed(2));
}

function lightReferenceDiffs(W) {
  const cs = [...W.chunks.values()];
  const X0 = Math.min(...cs.map((c) => c.cx)) * 16, X1 = (Math.max(...cs.map((c) => c.cx)) + 1) * 16;
  const Z0 = Math.min(...cs.map((c) => c.cz)) * 16, Z1 = (Math.max(...cs.map((c) => c.cz)) + 1) * 16;
  const NX = X1 - X0, NZ = Z1 - Z0, H = 128, id = (x, y, z) => (x - X0) + (z - Z0) * NX + y * NX * NZ;
  const sky = new Int8Array(NX * NZ * H), blk = new Int8Array(NX * NZ * H), op = new Int8Array(NX * NZ * H);
  const ld = (x, z) => W.isChunkLoaded(x >> 4, z >> 4);
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
    let l = 15;
    for (let y = H - 1; y >= 0; y--) {
      const v = W.getCell(x, y, z), o = v === -1 ? 0 : OPACITY[v], i = id(x, y, z);
      op[i] = o; l = o >= 15 ? 0 : Math.max(0, l - o); sky[i] = l; blk[i] = v === -1 ? 0 : EMIT[v];
    }
  }
  const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H; y++) for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
      if (!ld(x, z)) continue;
      const i = id(x, y, z), o = op[i];
      if (o >= 15) continue;
      let bs = sky[i], bb = blk[i];
      for (const [dx, dy, dz] of D) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < X0 || nx >= X1 || nz < Z0 || nz >= Z1 || ny < 0 || !ld(nx, nz)) continue;
        let ns = 15, nb = 0;
        if (ny < H) { const j = id(nx, ny, nz); ns = sky[j]; nb = blk[j]; }
        const s = dy === 1 ? ns - o : ns - 1 - o, b = nb - 1 - o;
        if (s > bs) bs = s;
        if (b > bb) bb = b;
      }
      if (bs !== sky[i] || bb !== blk[i]) { sky[i] = bs; blk[i] = bb; changed = true; }
    }
  }
  let d = 0;
  for (let y = 0; y < H; y++) for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++)
    if (ld(x, z) && W._lget(x, y, z) !== ((sky[id(x, y, z)] << 4) | blk[id(x, y, z)])) d++;
  return d;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

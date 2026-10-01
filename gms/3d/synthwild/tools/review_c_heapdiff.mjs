// R3 reviewer C: find what the mini-game cycle retains. Runs title -> mini-game -> quit cycles, takes heap snapshots
// after forced GC, diffs constructor counts/self sizes between two snapshots, and prints retainer paths for samples
// of the biggest growers.
//   node --max-old-space-size=8192 tools/review_c_heapdiff.mjs [ids=ctf,siege] [--cycles 4] [--port 9336]
import fs from 'node:fs';
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PORT = +opt('port', 9336);
const CYCLES = +opt('cycles', 4);
const IDS = (argv.find((a) => !a.startsWith('--') && isNaN(+a)) || 'ctf,siege').split(',');
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const OUT = new URL('./qa_out/review_c/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

async function snapshot(pg, file) {
  const chunks = [];
  const off = pg.on('HeapProfiler.addHeapSnapshotChunk', (p) => chunks.push(p.chunk));
  await pg.send('HeapProfiler.collectGarbage');
  await pg.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }, undefined, 600000);
  off();
  const s = chunks.join('');
  fs.writeFileSync(file, s);
  return JSON.parse(s);
}

function index(snap) {
  const m = snap.snapshot.meta, nf = m.node_fields, ef = m.edge_fields;
  const NF = nf.length, EF = ef.length;
  const nTypes = m.node_types[0], eTypes = m.edge_types[0];
  const iType = nf.indexOf('type'), iName = nf.indexOf('name'), iId = nf.indexOf('id'), iSize = nf.indexOf('self_size'), iEC = nf.indexOf('edge_count');
  const eiType = ef.indexOf('type'), eiName = ef.indexOf('name_or_index'), eiTo = ef.indexOf('to_node');
  const N = snap.nodes, E = snap.edges, S = snap.strings;
  const count = N.length / NF;
  const firstEdge = new Uint32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) { firstEdge[i] = e; e += N[i * NF + iEC] * EF; firstEdge[i + 1] = e; }
  const name = (i) => { const t = nTypes[N[i * NF + iType]]; const n = S[N[i * NF + iName]]; return t === 'object' || t === 'closure' || t === 'native' ? (t === 'closure' ? 'closure:' + n : n) : '(' + t + ')' + (t === 'string' || t === 'number' ? '' : ''); };
  return { NF, EF, N, E, S, count, firstEdge, iType, iId, iSize, eiType, eiName, eiTo, nTypes, eTypes, name };
}

function agg(ix) {
  const by = new Map();
  for (let i = 0; i < ix.count; i++) {
    const k = ix.name(i);
    const v = by.get(k) || [0, 0];
    v[0]++; v[1] += ix.N[i * ix.NF + ix.iSize];
    by.set(k, v);
  }
  return by;
}

function retainers(ix, targets, maxDepth = 14) {
  // reverse edges only for what we need: build full reverse index (memory heavy but fine)
  const rev = new Map();
  const { N, E, NF, EF, eiTo, eiType, eiName, eTypes, S } = ix;
  for (let i = 0; i < ix.count; i++) {
    for (let e = ix.firstEdge[i]; e < ix.firstEdge[i + 1]; e += EF) {
      const t = eTypes[E[e + eiType]];
      if (t === 'weak' || t === 'shortcut') continue;
      const to = E[e + eiTo] / NF;
      let arr = rev.get(to); if (!arr) rev.set(to, arr = []);
      const nm = t === 'element' || t === 'hidden' ? '[' + E[e + eiName] + ']' : S[E[e + eiName]];
      arr.push(i, nm, t);
    }
  }
  const paths = [];
  for (const start of targets) {
    // BFS towards a GC root (the synthetic root is node 0); prefer non-internal edges
    const prev = new Map([[start, null]]);
    let q = [start], found = -1;
    for (let d = 0; d < maxDepth && q.length && found < 0; d++) {
      const nq = [];
      for (const n of q) {
        const r = rev.get(n) || [];
        for (let k = 0; k < r.length; k += 3) {
          const from = r[k];
          if (prev.has(from)) continue;
          prev.set(from, [n, r[k + 1], r[k + 2]]);
          if (from === 0 || /^\(GC roots\)|^\(Global handles\)|^Window/.test(ix.name(from))) { found = from; break; }
          nq.push(from);
        }
        if (found >= 0) break;
      }
      q = nq;
    }
    if (found < 0) { paths.push(['(no root within depth) ' + ix.name(start)]); continue; }
    const path = [];
    let cur = found;
    while (cur !== start) {
      const p = prev.get(cur);
      // prev maps child -> [towardsStart node, edge name, type] in reverse: walk from root back to start
      const [n, en] = p;
      path.push(`${ix.name(cur)} --${en}-->`);
      cur = n;
    }
    path.push(ix.name(start));
    paths.push(path);
  }
  return paths;
}

const port = await launch(PORT, ['--use-angle=metal', '--js-flags=--expose-gc', '--enable-precise-memory-info']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'title'`, { timeout: 60000 });
  await pg.send('HeapProfiler.enable');
  const S = 'window.__game.ctx.ui.shell';
  const heaps = [];
  const snaps = [];
  for (let c = 0; c < CYCLES; c++) {
    for (const id of IDS) {
      await pg.eval(`${S}.playMinigame('${id}')`, { timeout: 90000 });
      await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 });
      await sleep(3500);
      await pg.eval(`(async()=>{ await ${S}.quit(); })()`, { timeout: 60000 });
      await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });
    }
    await pg.eval('(async()=>{ for (let i=0;i<3;i++){ gc(); await new Promise(r=>setTimeout(r,200)); } })()');
    const heap = await pg.eval('Math.round(performance.memory.usedJSHeapSize/1048576*10)/10');
    heaps.push(heap);
    console.log('cycle', c, 'heap MB', heap);
    if (c === 1 || c === CYCLES - 1) snaps.push(await snapshot(pg, `${OUT}heap_c${c}.heapsnapshot`));
  }
  const counts = await pg.game(`return { listenersApprox: null, timers: null, scene: C.scene.children.length, mobsExtra: C.game.mobs.extra.size, busHandlers: C.bus._h ? Object.fromEntries(Object.entries(C.bus._h).map(([k, v]) => [k, v.length ?? v.size])) : null };`);
  console.log('page', JSON.stringify(counts));
  const [a, b] = snaps.map(index);
  const A = agg(a), B = agg(b);
  const diff = [];
  for (const [k, v] of B) { const o = A.get(k) || [0, 0]; diff.push([k, v[0] - o[0], v[1] - o[1]]); }
  diff.sort((x, y) => y[2] - x[2]);
  console.log('cycles between snapshots:', CYCLES - 2, 'x', IDS.join('+'));
  console.log('TOP GROWTH by self size (name, +count, +bytes):');
  for (const d of diff.slice(0, 40)) console.log('  ', d[0].slice(0, 80), d[1], (d[2] / 1048576).toFixed(2) + ' MB');
  // retainer paths for a few objects of the top growers that are "interesting" (named constructors)
  const want = diff.filter((d) => !/^\(|^system|^Array$|^Object$|^closure:$/.test(d[0]) && d[1] > 0).slice(0, 8).map((d) => d[0]);
  const idsA = new Set(); for (let i = 0; i < a.count; i++) idsA.add(a.N[i * a.NF + a.iId]);
  for (const w of want) {
    const samples = [];
    for (let i = 0; i < b.count && samples.length < 2; i++) if (b.name(i) === w && !idsA.has(b.N[i * b.NF + b.iId])) samples.push(i);
    if (!samples.length) continue;
    console.log('\nRETAINERS of new', w);
    for (const p of retainers(b, samples)) console.log('   ', p.slice(-12).join(' '));
  }
  console.log('heaps', heaps);
} finally { stopBrowser(PORT); }

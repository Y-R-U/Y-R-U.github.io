// node tools/world_bench.mjs: warm per-biome column gen+light timing (seed synthwild landmarks)
import { makeTerrain } from '../js/world/terrain.js';
import { buildColumn } from '../js/world/column.js';
const t = makeTerrain('synthwild');
for (let i = 0; i < 200; i++) buildColumn(t, 300 + i, 300, null); // warm JIT
for (const [name, X, Z] of [['spawn/forest+shore', 0, 0], ['mountains', 1568, -3808], ['desert+ruin', -3400, -3992], ['deep ocean', -2592, -4000], ['plains', -800, -4000]]) {
  const res = [];
  for (let pass = 0; pass < 3; pass++) {
    let tot = 0, g = 0, n = 0;
    const t2 = makeTerrain('synthwild'); // fresh caches (worm/lake/ruin) each pass, like a new region
    for (let cz = -5; cz < 5; cz++) for (let cx = -5; cx < 5; cx++) { const { msg } = buildColumn(t2, (X >> 4) + cx, (Z >> 4) + cz, null); tot += msg.totalMs; g += msg.genMs; n++; }
    res.push([tot / n, g / n]);
  }
  res.sort((a, b) => a[0] - b[0]);
  console.log(name.padEnd(20), 'gen+light', res[0][0].toFixed(2), 'ms (gen', res[0][1].toFixed(2) + ')', ' median', res[1][0].toFixed(2));
}

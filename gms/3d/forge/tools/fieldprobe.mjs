#!/usr/bin/env node
// Measures the analytic world without a renderer: how far the rendered grid strays from
// heightAt, whether the river stays monotonic and above its bed, and how long the roads are.

import {
  X0, X1, Z0, Z1, TOWNS, waterY, creekZ, creekHalf, creekBank, CHANNEL, landAt, carve, heightAt,
  buildLandGrid, sampleGrid, NX, NZ, XS, ZS, ROADS, roadPoints, roadLine, polyLength, CROSSINGS,
  townAt, depthAt,
} from '../js/world/field.js';

const hg = buildLandGrid();
const surfaceY = (x, z) => sampleGrid(hg, x, z) + carve(x, z);
const inTown = (x, z) => TOWNS.some(t => Math.abs(x - t.cx) <= t.hw && Math.abs(z - t.cz) <= t.hd);

function agreement(pick, n = 40000) {
  let worst = 0, sum = 0, at = null;
  const all = [];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    if (!pick(x, z)) continue;
    const d = Math.abs(surfaceY(x, z) - heightAt(x, z));
    sum += d; all.push(d);
    if (d > worst) { worst = d; at = [x.toFixed(1), z.toFixed(1)]; }
  }
  all.sort((a, b) => a - b);
  const q = f => +(all[Math.min(all.length - 1, Math.floor(all.length * f))] ?? 0).toFixed(4);
  return { n: all.length, max: +worst.toFixed(4), p999: q(0.999), p99: q(0.99), p90: q(0.9), mean: +(sum / Math.max(1, all.length)).toFixed(4), at };
}

const bandOf = (x, z) => {
  const dz = Math.abs(z - creekZ(x));
  if (dz < creekBank(x)) return 'river';
  return inTown(x, z) ? 'town' : 'open';
};

console.log('grid', `${NX}x${NZ} = ${NX * NZ} verts, ${(NX - 1) * (NZ - 1) * 2} tris`);
console.log('agreement all   ', agreement(() => true));
console.log('agreement town  ', agreement((x, z) => bandOf(x, z) === 'town'));
console.log('agreement river ', agreement((x, z) => bandOf(x, z) === 'river'));
console.log('agreement open  ', agreement((x, z) => bandOf(x, z) === 'open'));

// roads: seated on surfaceY, so measure the step between adjacent stations and how far the
// centreline strays from the water line at each crossing
console.log('\nroads');
for (const r of ROADS) {
  const line = roadLine(roadPoints(r), 2.2);
  let worstStep = 0, atStep = null, sub = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const d = Math.abs(surfaceY(b[0], b[1]) - surfaceY(a[0], a[1]));
    if (d > worstStep) { worstStep = d; atStep = b.map(v => +v.toFixed(0)); }
    if (depthAt(b[0], b[1]) > 0.02 && !CROSSINGS.some(c => Math.abs(b[0] - c.x) < 30)) sub++;
  }
  console.log(` ${r.id.padEnd(13)} ${polyLength(line).toFixed(0).padStart(5)} m  ` +
    `worst step ${worstStep.toFixed(2)} m at ${atStep}  underwater stations off-ford ${sub}`);
}

console.log('\ncrossings');
for (const c of CROSSINGS) {
  const cz = creekZ(c.x);
  console.log(` ${c.label.padEnd(13)} x=${c.x} z=${cz.toFixed(1)} half=${creekHalf(c.x).toFixed(1)}` +
    ` depth=${CHANNEL(c.x).toFixed(2)} water=${waterY(c.x).toFixed(2)}` +
    ` bank=${(landAt(c.x, cz + creekBank(c.x, 6) + 2) - waterY(c.x)).toFixed(2)} above water`);
}

// the river: monotone fall, never ponding, bed always under the surface
console.log('\nriver profile');
let lastW = Infinity, ponds = 0, dry = 0, worstBed = 0;
for (let x = X0; x <= X1; x += 2) {
  const w = waterY(x);
  if (w > lastW + 1e-9) ponds++;
  lastW = w;
  const cz = creekZ(x);
  const bed = heightAt(x, cz);
  if (bed >= w) dry++;
  worstBed = Math.max(worstBed, w - bed);
}
console.log(` ponding stations ${ponds}, dry-centreline stations ${dry}, deepest ${worstBed.toFixed(2)} m`);
console.log(` fall ${waterY(X0).toFixed(2)} → ${waterY(X1).toFixed(2)} = ${(waterY(X0) - waterY(X1)).toFixed(2)} m`);

console.log('\ntowns');
for (const t of TOWNS) {
  const m = townAt(t.cx, t.cz);
  let lo = Infinity, hi = -Infinity, steep = 0, n = 0;
  for (let x = t.cx - t.hw * 0.6; x <= t.cx + t.hw * 0.6; x += 4) {
    for (let z = t.cz - t.hd * 0.6; z <= t.cz + t.hd * 0.6; z += 4) {
      if (Math.abs(z - creekZ(x)) < creekBank(x) + 20) continue;
      const h = heightAt(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      const g = Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
      if (g > 0.35) steep++;
      n++;
    }
  }
  console.log(` ${t.id.padEnd(8)} centre ${heightAt(t.cx, t.cz).toFixed(2)}` +
    ` pad ${(waterY(t.cx) + 1.35 + t.pad[0]).toFixed(2)} water ${waterY(t.cx).toFixed(2)}` +
    `  mask ${m.m.toFixed(3)} edge+fade ${townAt(t.cx + t.hw + 70, t.cz).m.toFixed(4)}` +
    `  inner60% relief ${(hi - lo).toFixed(2)} m, ${(100 * steep / n).toFixed(1)}% steeper than 1:2.9`);
}
const between = [(TOWNS[0].cx + TOWNS[1].cx) / 2, (TOWNS[1].cx + TOWNS[2].cx) / 2];
console.log(' mask midway between towns', between.map(x => townAt(x, -20).m.toFixed(4)).join(' / '));

// the seam: an extremum of the field along a whole column would show as a ridge
let worstCol = 0, colAt = 0;
for (let x = -40; x <= 40; x += 0.5) {
  let s = 0;
  for (let z = -160; z <= 160; z += 4) s += landAt(x + 1, z) - 2 * landAt(x, z) + landAt(x - 1, z);
  s = Math.abs(s) / 81;
  if (s > worstCol) { worstCol = s; colAt = x; }
}
console.log(`\ncolumn curvature peak near x=0: ${worstCol.toFixed(4)} at x=${colAt}`);

// data/areas.json is the contract for where things are; this reports the ground under each of
// its shapes so a conflict with the terrain shows up as a number rather than at authoring time.
import { readFileSync } from 'node:fs';
const areas = JSON.parse(readFileSync(new URL('../data/areas.json', import.meta.url)));
console.log('\nareas.json');
for (const a of areas) {
  const s = a.shape;
  const pts = [];
  if (s.k === 'circle') {
    for (let i = 0; i < 12; i++) {
      for (const r of [0, s.r * 0.6, s.r]) pts.push([s.x + Math.cos(i / 12 * 6.283) * r, s.z + Math.sin(i / 12 * 6.283) * r]);
    }
  } else {
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) pts.push([s.x0 + (s.x1 - s.x0) * i / 6, s.z0 + (s.z1 - s.z0) * j / 6]);
  }
  let lo = Infinity, hi = -Infinity, g = 0, wet = 0;
  for (const [x, z] of pts) {
    const h = heightAt(x, z);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    g = Math.max(g, Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4);
    if (h < waterY(x)) wet++;
  }
  console.log(` ${a.id.padEnd(16)} relief ${(hi - lo).toFixed(2).padStart(6)} m  worst slope 1:${(1 / Math.max(g, 1e-3)).toFixed(1).padStart(6)}  ${wet}/${pts.length} under water`);
}

// The demo scene, as a document. A generator rather than a literal because the layout is 24
// buildings a district of seeded jitter — but its output is ordinary data, and once it has run
// the editor treats it like any other scene.
//
// Call it after `setCameras()`: the layout skips anything standing inside a scenario keep-out.

import { rng, span } from '../world/details.js';
import { ZONE_IDS } from '../world/zones.js';
import { CENTERS, creekZ, nearCamera } from '../world/terrain.js';
import { SCENE_VERSION, district, footprint } from './scene.js';
import { seedDocument } from './build.js';

export function demoScene(terrain) {
  const doc = { version: SCENE_VERSION, name: 'Demo', districts: [], objects: [] };
  const skips = ZONE_IDS.map((zone, di) => layout(doc, terrain, zone, di, CENTERS[di]));
  doc.objects.forEach((o, i) => { o.id = i + 1; });
  return seedDocument(doc, skips);
}

function layout(doc, terrain, zone, di, cx) {
  let draws = 0;
  const stream = rng(0x2f1a71 + di * 977);
  const R = () => { draws++; return stream(); };

  const kerbs = [];
  // A slot inside a camera keep-out still draws its RNG and still gets a kerb; it just never
  // becomes an object. Ids are handed out in demoScene() once the whole list exists.
  const put = (type, x, z, ry, p, extra) => {
    const o = { id: 0, dist: di, zone, type, x, z, ry, seed: 0, p, ...extra };
    if (!nearCamera(x, z)) doc.objects.push(o);
    return o;
  };

  const cz = creekZ(cx);
  const road = [
    [cx - 3.0, -27], [cx - 1.4, -15], [cx + 2.0, 1], [cx + 1.4, 17],
    [cx - 1.8, 31], [cx - 0.6, cz - 9], [cx - 0.2, cz + 10],
  ];
  const roadX = zz => {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      if (zz >= a[1] && zz <= b[1]) return a[0] + (b[0] - a[0]) * (zz - a[1]) / (b[1] - a[1]);
    }
    return zz < road[0][1] ? road[0][0] : road[road.length - 1][0];
  };

  put('wallRun', cx, -34, 0, { length: 56, height: 9, thickness: 2.4 }, { rubble: true });
  for (const s of [-1, 1]) {
    put('tower', cx + s * 26, -34, 0, { radius: 4.5, height: 20 + s * 1.6, sides: 12 });
  }

  // a thin campanile inside the town — the cheapest break in a low roofline
  const camX = cx + (di === 1 ? 11.5 : -12.5), camZ = -3 + di * 4;
  put('tower', camX, camZ, span(R, 0, 3), { radius: 2.3, height: 23 + di * 1.5, sides: 8 }, { fp: [3.2, 3.2] });

  // Terraced rows either side of the street: detailed frontage, cheap blocks behind.
  // Nothing north of -19: the strip between the town and the wall is the raking corridor
  // wall_day and gate_night both look down, and it is what makes the wall read as a wall.
  const rows = [
    { side: -1, z0: -19, z1: 33, setback: span(R, 0.6, 1.4), real: 1 },
    { side: 1, z0: -17, z1: 31, setback: span(R, 1.1, 2.2), real: 1 },
  ];
  for (const row of rows) {
    const plan = [];
    let zz = row.z0, guard = 0;
    while (zz < row.z1 && guard++ < 16) {
      const gable = R() < 0.34;
      const w = span(R, 6.2, 10.5), d = span(R, 6.0, 8.6), h = span(R, 4.6, 9.4);
      const along = gable ? d : w, across = gable ? w : d;
      const cxr = roadX(zz + along / 2);
      plan.push({
        w, d, h, along, across, cxr,
        x: cxr + row.side * (4.4 + row.setback + across / 2 + span(R, 0, 1.5)),
        z: zz + along / 2,
        ry: (row.side < 0 ? Math.PI / 2 : -Math.PI / 2) + (gable ? Math.PI / 2 : 0) + span(R, -0.11, 0.11),
        back: R() < 0.75,
      });
      zz += along + (R() < 0.68 ? span(R, 0.1, 0.9) : span(R, 2.6, 6.5));
    }
    // detail goes to the ends of the row, which is what every scenario camera looks at —
    // skipping any slot that a camera keep-out is going to delete anyway
    const cand = [plan.length - 1, plan.length - 2, 0, 1, 2]
      .filter(i => i >= 0 && i < plan.length && !nearCamera(plan[i].x, plan[i].z));
    const detail = new Set(cand.slice(0, row.real + 2));
    const want = Math.min(plan.length, row.real + 2);
    let g2 = 0;
    while (detail.size < want && g2++ < 40) detail.add(Math.floor(R() * plan.length));

    for (const [n, p] of plan.entries()) {
      const o = detail.has(n)
        ? put('house', p.x, p.z, p.ry, { w: p.w, d: p.d, h: p.h })
        : put('mass', p.x, p.z, p.ry, { w: p.w, d: p.d, h: p.h });
      // the kerb's top follows the house's padded footprint but a block's bare plan — an
      // asymmetry with no reason beyond reproducing the shipped street exactly
      const half = detail.has(n) ? footprint(o) : [p.w / 2, p.d / 2];
      kerbs.push({
        x: p.cxr + row.side * (4.4 + row.setback * 0.4), z: p.z, len: p.along, side: row.side,
        top: terrain.range(p.x, p.z, half[0], half[1], p.ry).hi,
      });
      if (p.back) {
        const bw = span(R, 5.5, 9), bd = span(R, 5.5, 8);
        const bx = p.x + row.side * (p.across / 2 + bd / 2 + span(R, 1.3, 3.6));
        const bz = p.z + span(R, -2.5, 2.5);
        const bh = span(R, 4.0, 7.6);
        put('mass', bx, bz, p.ry + span(R, -0.35, 0.35), { w: bw, d: bd, h: bh });
      }
    }
  }

  // a third file set back from the street, filling the block interiors
  for (let k = 0; k < 6; k++) {
    const w = span(R, 5.5, 9), d = span(R, 5.5, 8);
    const side = k % 2 ? 1 : -1;
    const x = cx + side * span(R, 17, 24);
    const z = -13 + k * 7.5 + span(R, -2.5, 2.5);
    const h = span(R, 4.2, 8.2);
    put('mass', x, z, span(R, -0.5, 0.5), { w, d, h });
  }

  // the hall: one big mass so the town has a centre of gravity
  const hallX = cx + (di === 1 ? -13.5 : 13), hallZ = 14 + span(R, -3, 3);
  put('house', hallX, hallZ, span(R, -0.2, 0.2) + (di === 1 ? 0.35 : -0.35),
    { w: 14.5, d: 10.5, h: 10.5 }, { fp: [8, 6] });

  doc.districts.push(district(zone, cx, {
    seed: 0x2f1a71 + di * 977, road, kerbs,
    bridge: { x: cx - 0.6, z: cz, halfSpan: 5.6 },
  }));
  return draws;
}

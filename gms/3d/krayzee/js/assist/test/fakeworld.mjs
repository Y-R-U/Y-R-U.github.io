// A node stand-in for buildWorld(): same layout, AIRPORT-like obstacles (terminal, hangars, tower, town, lake, woods, hills).
import * as layout from '../../world/layout.js';

const { RUNWAYS, TAXIWAYS, APRON, TERMINAL, TOWER, TAXIWAY_WIDTH, headingToVec } = layout;
const LAKE = { x: -1500, z: -1250, rx: 340, rz: 210 };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function fakeWorld({ seed = 7, extra = [] } = {}) {
  const r = rng(seed);
  const colliders = [];
  const box = (x0, z0, x1, z1, h, kind) => colliders.push({ min: [x0, 0, z0], max: [x1, h, z1], kind });
  const [tx, , tz] = TERMINAL.center;
  box(tx - TERMINAL.size[0] / 2, tz - TERMINAL.size[1] / 2, tx + TERMINAL.size[0] / 2, tz + TERMINAL.size[1] / 2, 30, 'terminal');
  box(240, -300, 300, -250, 14, 'hangar'); box(320, -300, 380, -250, 14, 'hangar');
  box(TOWER.position[0] - 5, TOWER.position[2] - 5, TOWER.position[0] + 5, TOWER.position[2] + 5, TOWER.height, 'tower');
  for (let gx = -560; gx <= 260; gx += 64) for (let gz = -1300; gz >= -1760; gz -= 46) for (const off of [-14, 14]) {
    if (r() < 0.15) continue;
    box(gx + off - 5, gz - 4, gx + off + 5, gz + 4, 7, 'house');
  }
  // a few farms out in the fields
  for (let k = 0; k < 40; k++) {
    const a = r() * 6.28, d = 1200 + r() * 2400, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(z) < 600 && Math.abs(x) < 1100) continue;
    box(x - 8, z - 6, x + 8, z + 6, 8, 'house');
  }
  for (const e of extra) colliders.push(e);
  const trees = [];
  for (let c = 0; c < 70; c++) {
    const a = r() * 6.28, d = 700 + Math.pow(r(), 0.7) * 3000, cx = Math.cos(a) * d * 1.2, cz = Math.sin(a) * d;
    if (Math.abs(cz) < 560 && Math.abs(cx) < 900) continue;
    for (let k = 0; k < 14; k++) trees.push([cx + (r() - 0.5) * 90, cz + (r() - 0.5) * 90, 11]);
  }
  for (let x = -1100; x < 1100; x += 17) for (const z of [-560, 470]) if (r() < 0.8) trees.push([x, z, 11]);

  const inLake = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1;
  const inRw = (x, z, cx, cz, h, len, w) => {
    const [dx, dz] = headingToVec(h), rx = x - cx, rz = z - cz;
    return Math.abs(rx * dx + rz * dz) <= len / 2 && Math.abs(-rx * dz + rz * dx) <= w / 2;
  };
  const buildings = colliders.filter((c) => c.kind !== 'mast');
  function surfaceAt(x, z) {
    for (const c of buildings) if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) return 'building';
    for (const rw of RUNWAYS) if (inRw(x, z, rw.center[0], rw.center[2], rw.heading, rw.length, rw.width)) return 'runway';
    for (const tw of TAXIWAYS) for (let i = 1; i < tw.points.length; i++) {
      const a = tw.points[i - 1], b = tw.points[i];
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const h = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
      if (inRw(x, z, cx, cz, h, L + TAXIWAY_WIDTH, TAXIWAY_WIDTH)) return 'taxiway';
    }
    const [ax, , az] = APRON.center;
    if (Math.abs(x - ax) <= APRON.size[0] / 2 && Math.abs(z - az) <= APRON.size[1] / 2) return 'apron';
    if (inLake(x, z)) return 'water';
    return 'grass';
  }
  function groundHeightAt(x, z) {
    const d = Math.hypot(x, z);
    if (d <= 3800) return 0;
    const k = Math.min(1, (d - 3800) / 3500);
    return k * k * (3 - 2 * k) * (60 + 140 * (0.5 + 0.5 * Math.sin(x / 900) * Math.cos(z / 1100)));
  }
  return { surfaceAt, groundHeightAt, colliders, trees, runwayAt: () => null, LAKE };
}
export { layout };

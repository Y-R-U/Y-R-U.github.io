// Stand-in for js/world/map.js (lane R). Same interface; used by node tests and as the
// browser fallback when the real map module is missing or throws.
import { createRng } from '../js/sim/rng.js';

export function generateMap(seed = 1) {
  const rng = createRng('stubmap:' + seed);
  const size = 240, half = size / 2, cell = 40, street = 16;
  const obstacles = [], plazas = [], spawns = [];
  const centres = [-100, -60, -20, 20, 60, 100];
  const plazaCells = new Set(['-20,-20', '20,-20', '-20,20', '20,20', '-100,60', '60,-100', '100,100', '-60,-100']);
  for (const cx of centres) for (const cz of centres) {
    if (plazaCells.has(cx + ',' + cz)) continue;
    const bw = cell - street;
    if (rng.chance(0.3)) {
      const split = rng.range(0.35, 0.65) * bw;
      obstacles.push({ type: 'rect', x: cx - bw / 2 + split / 2, z: cz, w: split, d: bw });
      obstacles.push({ type: 'rect', x: cx + split / 2, z: cz, w: bw - split, d: bw });
    } else {
      obstacles.push({ type: 'rect', x: cx, z: cz, w: bw, d: bw });
    }
  }
  plazas.push({ x: 0, z: 0, r: 30 });
  obstacles.push({ type: 'circle', x: 0, z: 0, r: 4.5 });
  plazas.push({ x: -100, z: 60, r: 17 }, { x: 60, z: -100, r: 17 }, { x: 100, z: 100, r: 17 }, { x: -60, z: -100, r: 17 });
  obstacles.push({ type: 'circle', x: 100, z: 100, r: 3 });
  for (const sx of [-80, -40, 0, 40, 80]) for (const sz of [-80, -40, 0, 40, 80]) {
    if (Math.abs(sx) <= 40 && Math.abs(sz) <= 40 && !(Math.abs(sx) === 40 && Math.abs(sz) === 40)) continue;
    spawns.push({ x: sx, z: sz });
  }
  const walkable = (x, z) => {
    if (x < -half || x > half || z < -half || z > half) return false;
    for (const o of obstacles) {
      if (o.type === 'rect') {
        if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return false;
      } else if ((x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return false;
    }
    return true;
  };
  return { seed, size, obstacles, spawns, plazas, walkable, stub: true };
}

import { createMaterials } from './materials.js?v=20261004c';
import { createBuilder } from './build.js?v=20261004c';
import { createCrowd, crowdMaterial, CLIP, OUTFITS, PANTS } from './crowd.js?v=20261004c';
import { createPile, stockUnit } from './piles.js?v=20261004c';
import { GEO } from './geo.js?v=20261004c';
import { basePlot, createPlot, FIT } from './plotbase.js?v=20261004c';
import * as vehicles from './vehicles.js?v=20261004c';
import * as props from './props.js?v=20261004c';
import * as shape from './shape.js?v=20261004c';
import { makeRng, noise2 } from './rng.js?v=20261004c';

export function createKit() {
  const materials = createMaterials();
  materials.crowd = crowdMaterial(materials.shared);
  const kit = {
    materials,
    FIT,
    geo: GEO,
    vehicles,
    props,
    shape,
    CLIP, OUTFITS, PANTS,
    makeRng, noise2,
    builder: (palette, o) => createBuilder(materials, palette, o),
    crowd: (opts) => createCrowd(materials, opts),
    pile: (opts) => createPile(materials, opts),
    stockUnit: (kind, palette, color) => stockUnit(materials, kind, palette, color),
    plot: (opts) => createPlot(kit, opts),
    basePlot: (opts, decorate) => basePlot(kit, opts, decorate),
    setTime(t) { materials.uTime.value = t; },
    setNight(n) { materials.uNight.value = n; },
    setLamps(list) {
      const u = materials.uLamps.value;
      for (let i = 0; i < u.length; i++) {
        const l = list[i];
        if (l) u[i].set(l[0], l[1], l[2], l[3] ?? 1); else u[i].set(0, -999, 0, 0);
      }
    },
    setLight(l) {
      for (const m of materials.uberAll) m.envMapIntensity = l.envK ?? 0.15;
      if (materials.crowd) materials.crowd.envMapIntensity = (l.envK ?? 0.15) * 1.4;
      materials.uRim.value.set(l.sheen || l.sky.horizon).multiplyScalar(0.16);
      materials.uRimCrowd.value.set(l.sheen || l.sky.horizon).multiplyScalar(0.55 + 0.55 * (l.night || 0));
      materials.uBounce.value.set(l.bounce || '#000000').multiplyScalar(l.bounceK || 0);
      materials.uLampK.value = (l.lamps || 0) * 2.6;
    },
  };
  return kit;
}

import { createMaterials } from './materials.js?v=20261004e';
import { createBuilder } from './build.js?v=20261004e';
import { createCrowd, crowdMaterial, createCrowdPool, CROWD_LAYER, EXPR, rigVertexCount, CLIP, OUTFITS, PANTS, HAT, HAT_TYPES, HAT_SEAT, HAT_COLORS, ACC, STACHE, CHARACTERS, hatGeometry, hatForTier, hatForPomfrey } from './crowd.js?v=20261004e';
import { createGhosts } from './ghost.js?v=20261004e';
import { createPile, stockUnit } from './piles.js?v=20261004e';
import { GEO } from './geo.js?v=20261004e';
import { basePlot, createPlot, FIT } from './plotbase.js?v=20261004e';
import * as vehicles from './vehicles.js?v=20261004e';
import * as props from './props.js?v=20261004e';
import * as shape from './shape.js?v=20261004e';
import { makeRng, noise2 } from './rng.js?v=20261004e';
import * as western from './western.js?v=20261004e';
import { createSigns } from './signs.js?v=20261004e';
import { SURF } from './build.js?v=20261004e';
import { createPlotBatch } from './plotbatch.js?v=20261004e';

export function createKit() {
  const materials = createMaterials();
  materials.crowd = crowdMaterial(materials.shared);
  materials.crowdPool = createCrowdPool(materials);
  const kit = {
    materials,
    FIT,
    geo: GEO,
    vehicles,
    props,
    shape,
    western,
    SURF,
    SKINS: western.SKINS,
    signs: createSigns(materials),
    plotBatch: createPlotBatch(),
    CLIP, OUTFITS, PANTS, ACC, STACHE, CHARACTERS, EXPR, CROWD_LAYER,
    crowdPool: materials.crowdPool, rigVertexCount,
    hats: { geometry: hatGeometry, HAT, TYPES: HAT_TYPES, SEAT: HAT_SEAT, COLORS: HAT_COLORS, forTier: hatForTier, forPomfrey: hatForPomfrey },
    makeRng, noise2,
    builder: (palette, o) => createBuilder(materials, palette, o),
    crowd: (opts) => createCrowd(materials, opts),
    ghost: (opts) => createGhosts(materials, opts),
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
      materials.uRim.value.set(l.sheen || l.sky.horizon).multiplyScalar(0.24);
      materials.uRimCrowd.value.set(l.sheen || l.sky.horizon).multiplyScalar(0.55 + 0.1 * (l.night || 0));
      materials.uBounce.value.set(l.bounce || '#000000').multiplyScalar(l.bounceK || 0);
      materials.uLampK.value = (l.lamps || 0) * 2.6;
      const az = l.sun.azimuth * Math.PI / 180, el = l.sun.elevation * Math.PI / 180;
      materials.uSunDir.value.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      materials.uSunCol.value.set(l.sun.color).multiplyScalar(l.sun.intensity * 0.06 * (1 - 0.7 * (l.night || 0)));
    },
  };
  return kit;
}

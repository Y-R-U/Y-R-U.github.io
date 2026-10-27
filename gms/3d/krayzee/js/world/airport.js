import * as THREE from 'three';
import { Builder, inRect } from './util.js';
import { createSky, createLights, bakeEnvironment, setShadowFocus, SUN_DIR } from './env.js';
import { createTerrain, createLake, inLake, lakeDist, airfieldMask, SHADE_EXTENT, CASTLE, setTerrainSite } from './terrain.js';
import { buildTown } from './town.js';
import { buildTrees, shadeTexture } from './trees.js';
import { buildAirfieldEdge, BlockGrid } from './land.js';
import { decalAtlas } from './textures.js';
import { buildPavement, APRON_RECT, HANGAR_APRON, TOWER_PAD, ROADS, CAR_PARK } from './pavement.js';
import { buildLights } from './lights.js';
import { buildTerminal, buildHangars } from './terminal.js';
import { buildTower } from './tower.js';
import { buildSigns, buildWindsocks, buildVehicles, buildFlagpoles, buildFlags, buildScenery } from './props.js';
import { FRAMES, SEGMENTS } from './geom.js';
import { AIRPORT } from './layout.js';
import { buildSite } from './site.js';
import { disposeWorld } from './dispose.js';

const aa = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

// MAP: opts.airport (default: the active layout airport). C-Tower 1 is built here; every other airport by js/world/site.js.
export async function buildWorld(scene, renderer, opts = {}) {
  const def = opts.airport || AIRPORT;
  if (def && def.scenery?.biome !== 'royal') return buildSite(scene, renderer, def, opts);
  setTerrainSite(null);
  let quality = ['low', 'medium', 'high'].includes(opts.quality) ? opts.quality : 'high';
  const timings = {};
  let tm = performance.now();
  const mark = (k) => { const n = performance.now(); timings[k] = Math.round(n - tm); tm = n; };
  // opts.onProgress(fraction 0..1, stage) is called between build stages, and then the build yields a frame so the
  // loading bar can paint (no single task runs the whole build). Without onProgress (or opts.yield) it never yields.
  const yields = !!(opts.onProgress || opts.yield);
  const step = async (f, label) => {
    try { opts.onProgress?.(f, label); } catch (e) { /* */ }
    if (!yields) return;
    const y0 = performance.now();
    await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
    tm += performance.now() - y0;
  };
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const sky = createSky(quality);
  root.add(sky);
  const env = bakeEnvironment(renderer, sky);
  const { hemi, sun } = createLights(scene, quality);

  mark('sky');
  await step(0.03, 'terrain');
  const terrain = createTerrain(renderer, quality);
  mark('terrain');
  const lake = createLake(renderer, env);
  root.add(terrain.mesh, lake.mesh);

  mark('lake');
  await step(0.2, 'pavement');
  const atlas = decalAtlas(renderer);
  const pave = buildPavement(renderer, quality, atlas);
  root.add(...pave.meshes);
  await step(0.36, 'buildings');

  const B = {
    matte: new Builder(), metal: new Builder(), glass: new Builder(), decal: new Builder(true), lit: new Builder(), flags: [],
  };
  B.matteMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const colliders = [];
  colliders.push(...buildTerminal(B, atlas));
  colliders.push(...buildHangars(B));
  const tower = buildTower(B, atlas, quality);
  colliders.push(...tower.colliders);
  buildSigns(B, atlas);
  buildVehicles(B);
  buildFlagpoles(B, atlas);
  mark('airport');
  await step(0.54, 'town');
  // the village church and the castle get their own meshes so they cull (and skip the shadow pass) away from them
  const TB = { matte: new Builder(), metal: new Builder(), flags: B.flags, matteMaterial: B.matteMaterial };
  const town = buildTown(TB, atlas, quality, terrain.heightAt);
  mark('town');
  colliders.push(...town.colliders);
  root.add(...town.objects);
  const edge = buildAirfieldEdge(quality);
  root.add(...edge.objects);
  const socks = buildWindsocks(B);
  const flags = buildFlags(B.flags, atlas.texture);

  const matte = new THREE.Mesh(B.matte.build(), B.matteMaterial);
  matte.castShadow = matte.receiveShadow = true;
  matte.name = 'buildings';
  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMap: env, envMapIntensity: 1.1 });
  const metal = new THREE.Mesh(B.metal.build(), metalMat);
  metal.castShadow = metal.receiveShadow = true;
  metal.name = 'metal';
  const townMatte = new THREE.Mesh(TB.matte.build(), B.matteMaterial), townMetal = new THREE.Mesh(TB.metal.build(), metalMat);
  townMatte.name = 'townBuildings'; townMetal.name = 'townMetal';
  for (const m of [townMatte, townMetal]) { m.castShadow = m.receiveShadow = true; root.add(m); }
  const glass = new THREE.Mesh(B.glass.build(), new THREE.MeshStandardMaterial({
    vertexColors: true, color: '#4d6a70', roughness: 0.04, metalness: 0.3, envMap: env, envMapIntensity: 1.4,
    transparent: true, opacity: 0.4, depthWrite: false,
  }));
  glass.renderOrder = 2;
  const lit = new THREE.Mesh(B.lit.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  lit.name = 'interiors';
  root.add(lit);
  glass.name = 'glass';
  const decals = new THREE.Mesh(B.decal.build(), new THREE.MeshStandardMaterial({
    map: atlas.texture, alphaTest: 0.5, roughness: 0.6, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.22,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  decals.name = 'signs';
  root.add(matte, metal, glass, decals, flags.mesh, socks.mesh, tower.group);

  // Low tier: the merged airport buildings (~15k tris) leave the shadow pass; a box per collider casts instead.
  const PB = new Builder();
  for (const c of colliders) {
    if (!['terminal', 'hangar', 'tower'].includes(c.kind)) continue;
    PB.box((c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2, c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2], [1, 1, 1]);
  }
  const shadowProxy = new THREE.Mesh(PB.build(), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  shadowProxy.name = 'shadowProxy';
  shadowProxy.castShadow = true;
  root.add(shadowProxy);
  const applyShadowTier = (q) => {
    const low = q === 'low';
    matte.castShadow = metal.castShadow = !low;
    shadowProxy.visible = low;
  };
  applyShadowTier(quality);

  const lights = buildLights(quality);
  root.add(...lights.objects);

  const block = new BlockGrid();
  for (const p of town.paths) block.line(p.pts, p.w / 2 + 5);
  for (const h of town.houses) block.disc(h.x, h.z, Math.max(h.w || 10, h.d || 10) * 0.6 + 2);
  for (const c of colliders) block.rect(c.min[0] - 3, c.min[2] - 3, c.max[0] + 3, c.max[2] + 3);
  block.rect(town.green.x0 + 14, town.green.z0 + 14, town.green.x1 - 14, town.green.z1 - 14);
  block.disc(CASTLE.x, CASTLE.z, 140);
  const noGo = (x, z) => {
    if (airfieldMask(x, z) > 0) return true;
    for (const F of FRAMES) {
      const rx = x - F.cx, rz = z - F.cz;
      const a = Math.abs(rx * F.dx + rz * F.dz) - F.L / 2, b = Math.abs(-rx * F.dz + rz * F.dx);
      if (a > 0 && a < 3200 && b < 160 + a * 0.15) return true;
    }
    if (lakeDist(x, z) < 1.1 || ROADS.some((r) => aa(r, x, z, 7))) return true;
    return block.has(x, z);
  };
  mark('meshes');
  await step(0.58, 'trees');
  const trees = await buildTrees(renderer, quality, { heightAt: terrain.heightAt, noGo, extra: [...town.treeSpots, ...edge.trees], pause: (f) => step(0.58 + 0.3 * f, 'trees') });
  mark('trees');
  root.add(trees.group);
  await step(0.88, 'shade');
  terrain.uniforms.uShade.value = shadeTexture(SHADE_EXTENT, quality === 'low' ? 1024 : 2048, trees, town.boxes, town.houses.filter((h) => h.type !== 'barn'));
  mark('shade');
  const scenery = buildScenery(quality);
  root.add(...scenery.objects);
  colliders.push(...scenery.colliders);

  const buildingBoxes = colliders.filter((c) => c.kind !== 'mast');
  function surfaceAt(x, z) {
    for (const c of buildingBoxes) if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) return 'building';
    for (const F of FRAMES) if (inRect(x, z, F.rect)) return 'runway';
    for (const S of SEGMENTS) if (inRect(x, z, S.rect)) return 'taxiway';
    for (const F of FRAMES) if (inRect(x, z, F.strip)) return 'runway';
    if (aa(APRON_RECT, x, z) || aa(HANGAR_APRON, x, z) || aa(TOWER_PAD, x, z) || aa(CAR_PARK, x, z) || ROADS.some((r) => aa(r, x, z))) return 'apron';
    if (inLake(x, z)) return 'water';
    return 'grass';
  }
  function runwayAt(x, z) {
    for (const F of FRAMES) if (inRect(x, z, F.rect)) return F.id;
    return null;
  }

  const wind = { from: opts.windFrom ?? 240, kt: opts.windKt ?? 9 };
  const windVec = flags.uniforms.uWind.value;
  function setWind(from, kt) {
    wind.from = from; wind.kt = kt;
    const t = (from + 180) * Math.PI / 180;
    windVec.set(Math.sin(t), -Math.cos(t));
  }
  setWind(wind.from, wind.kt);

  let time = 0;
  function update(dt, camera) {
    time += dt;
    if (camera) {
      sky.position.copy(camera.position);
      lights.update(camera, renderer.getPixelRatio());
    }
    sky.material.uniforms.uTime.value = time;
    lake.uniforms.uTime.value = time;
    if (camera) { trees.update(camera); scenery.update(camera); town.update(camera); }
    flags.uniforms.uTime.value = time;
    socks.update(time, wind.from, wind.kt);
    tower.update(dt, time, camera);
  }

  function setQuality(q) {
    if (!['low', 'medium', 'high'].includes(q) || q === quality) return;
    quality = q;
    trees.setQuality(q);
    scenery.setQuality(q);
    town.setQuality(q);
    applyShadowTier(q);
    terrain.uniforms.uBump.value = q === 'low' ? 0 : 1;
    const size = q === 'low' ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }

  try { opts.onProgress?.(1, 'done'); } catch (e) { /* */ }
  return {
    update,
    setQuality,
    get quality() { return quality; },
    treeStats: trees.stats,
    groundHeightAt: terrain.heightAt,
    surfaceAt,
    runwayAt,
    colliders,
    sun,
    hemi,
    envMap: env,
    wind,
    setWind,
    setShadowFocus: (x, z, r) => setShadowFocus(sun, x, z, r),
    sunDir: SUN_DIR.clone(),
    tower: { cab: tower.cab, crew: tower.crew },
    papi: lights.papi,
    root,
    airport: def?.id || 'royal',
    dispose: () => { trees.dispose(); disposeWorld(scene, root, { lights: [hemi, sun], uniformSets: [terrain.uniforms, lake.uniforms, flags.uniforms], textures: [env] }); },
    debug: { terrain, trees, lake, timings },
  };
}

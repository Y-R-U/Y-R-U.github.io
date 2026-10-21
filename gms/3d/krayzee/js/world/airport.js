import * as THREE from 'three';
import { Builder, inRect } from './util.js';
import { createSky, createLights, bakeEnvironment, setShadowFocus, SUN_DIR } from './env.js';
import { createTerrain, createLake, inLake, airfieldMask } from './terrain.js';
import { decalAtlas } from './textures.js';
import { buildPavement, APRON_RECT, HANGAR_APRON, TOWER_PAD, ROADS, CAR_PARK } from './pavement.js';
import { buildLights } from './lights.js';
import { buildTerminal, buildHangars } from './terminal.js';
import { buildTower } from './tower.js';
import { buildSigns, buildWindsocks, buildVehicles, buildFlagpoles, buildFlags, buildScenery } from './props.js';
import { FRAMES, SEGMENTS } from './geom.js';

const aa = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

export async function buildWorld(scene, renderer, opts = {}) {
  const quality = opts.quality === 'low' ? 'low' : 'high';
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const sky = createSky(quality);
  root.add(sky);
  const env = bakeEnvironment(renderer, sky);
  const { hemi, sun } = createLights(scene, quality);

  const terrain = createTerrain(renderer, quality);
  root.add(terrain.mesh, createLake());

  const atlas = decalAtlas(renderer);
  const pave = buildPavement(renderer, quality, atlas);
  root.add(...pave.meshes);

  const B = {
    matte: new Builder(), metal: new Builder(), glass: new Builder(), decal: new Builder(true), flags: [],
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
  const socks = buildWindsocks(B);
  const flags = buildFlags(B.flags, atlas.texture);

  const matte = new THREE.Mesh(B.matte.build(), B.matteMaterial);
  matte.castShadow = matte.receiveShadow = true;
  matte.name = 'buildings';
  const metal = new THREE.Mesh(B.metal.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85, envMap: env, envMapIntensity: 1.1 }));
  metal.castShadow = metal.receiveShadow = true;
  metal.name = 'metal';
  const glass = new THREE.Mesh(B.glass.build(), new THREE.MeshStandardMaterial({
    vertexColors: true, color: '#3d6670', roughness: 0.04, metalness: 0.35, envMap: env, envMapIntensity: 1.6,
    transparent: true, opacity: 0.5, depthWrite: false,
  }));
  glass.renderOrder = 2;
  glass.name = 'glass';
  const decals = new THREE.Mesh(B.decal.build(), new THREE.MeshStandardMaterial({
    map: atlas.texture, alphaTest: 0.5, roughness: 0.6, emissive: '#ffffff', emissiveMap: atlas.texture, emissiveIntensity: 0.22,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  decals.name = 'signs';
  root.add(matte, metal, glass, decals, flags.mesh, socks.mesh, tower.group);

  const lights = buildLights(quality);
  root.add(...lights.objects);

  const noGo = (x, z, pad) => {
    if (airfieldMask(x, z) > 0) return true;
    for (const F of FRAMES) {
      const rx = x - F.cx, rz = z - F.cz;
      const a = Math.abs(rx * F.dx + rz * F.dz) - F.L / 2, b = Math.abs(-rx * F.dz + rz * F.dx);
      if (a > 0 && a < 3200 && b < 160 + a * 0.15) return true;
    }
    if (inLake(x, z) || ROADS.some((r) => aa(r, x, z, pad))) return true;
    if (x > -620 && x < 300 && z < -1250 && z > -1800) return true;
    return false;
  };
  const scenery = buildScenery(quality, noGo);
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
    flags.uniforms.uTime.value = time;
    socks.update(time, wind.from, wind.kt);
    tower.update(dt, time, camera);
  }

  return {
    update,
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
  };
}

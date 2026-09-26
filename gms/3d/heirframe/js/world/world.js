import * as THREE from 'three';
import { createRenderer, createPost } from '../engine/renderer.js';
import { installFog, createSky, buildEnvironment, SUN_DIR, SUN_COLOR, HAZE_COLOR } from '../engine/atmosphere.js';
import { createPlanarReflection, REFLECT_LAYER } from '../fx/reflection.js';
import { createPadRing, createJetMaterial, createMotes, createSkyShadows } from '../fx/effects.js';
import { createMaterials } from './materials.js';
import { createBatcher } from './batch.js';
import { createCollision } from './collision.js';
import { createGround } from './ground.js';
import { buildPlaza } from './plaza.js';
import { buildAtrium } from './atrium.js';
import { buildBlocks } from './blocks.js';
import { buildVista } from './vista.js';
import { buildSkyline } from './skyline.js';
import { buildTraffic } from './traffic.js';
import { buildSites } from './sites.js';
import { swayFoliage, fadeMaterial } from './foliage.js';
import { D2R } from './geo.js';

export const LAYOUT = {
  bounds: { x0: -58, x1: 47.5, z0: -97, z1: 79 },
  balconies: [[-42, 7], [8, 7]],
  atrium: { cx: -8, cz: -6, th0: 205 * D2R, th1: 325 * D2R },
  terrace: { z: 38, y: 2.4, x0: -50, x1: 36, stairs: [-10, 10], stairZ0: 32 },
  fountain: { x: 0, z: 0 },
  kiosk: { x: -15, z: 13, rot: 0.6 },
  pad: { x: 15, z: 15 },
  spawn: { x: 0, z: 24 },
};

const _v = new THREE.Vector3(), _b = new THREE.Vector2();

export function createWorld(canvas, { quality, toneMapping = 'aces', onProgress = () => {} } = {}) {
  const tier = quality;
  installFog();
  const renderer = createRenderer(canvas, tier, toneMapping);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE_COLOR.clone(), 0.0007);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 3000);
  camera.layers.enable(REFLECT_LAYER);

  const time = { value: 0 };
  const pxScale = { value: 1 };
  const reflection = createPlanarReflection(renderer, { scale: tier.reflect, planeY: 0, samples: tier.name === 'high' ? 4 : 0 });
  scene.add(createSky());
  scene.environment = buildEnvironment(renderer, tier.envSize);
  scene.environmentIntensity = 0.75;
  onProgress(0.2, 'Lighting the sky…');

  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.3);
  sun.position.copy(SUN_DIR).multiplyScalar(90);
  sun.layers.enable(REFLECT_LAYER);
  sun.target.layers.enable(REFLECT_LAYER);
  if (tier.shadowMap) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    const S = 22;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
  }
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x8a7358, 0.15);
  hemi.layers.enable(REFLECT_LAYER);
  scene.add(hemi);

  const M = createMaterials(reflection, tier);
  const fade = { uFadeC: { value: new THREE.Vector2(-9999, -9999) }, uFadeR: { value: 0 }, uFadeZ: { value: 0 } };
  swayFoliage(M.foliage, time, fade);
  fadeMaterial(M.bark, fade);
  const col = createCollision(LAYOUT.bounds);
  const batch = createBatcher({ cell: 56 });
  const ctx = {
    scene, renderer, M, batch, col, tier, time, pxScale, reflection, layout: LAYOUT,
    updaters: [], interactables: [], cache: {}, stats: {},
    jetMaterial: createJetMaterial(time),
    makePadRing: (r, c, busy) => createPadRing(time, r, c, busy),
  };
  onProgress(0.35, 'Laying the marble…');
  createGround(ctx);
  buildPlaza(ctx);
  onProgress(0.5, 'Raising the Atrium…');
  buildAtrium(ctx);
  buildBlocks(ctx);
  buildVista(ctx);
  buildSites(ctx);
  onProgress(0.65, 'Building the skyline…');
  buildSkyline(ctx);
  buildTraffic(ctx);
  const built = batch.build(scene);
  ctx.stats.staticMeshes = built.meshes; ctx.stats.staticTris = built.tris;
  const motes = createMotes(time, pxScale, tier.name === 'low' ? 80 : 220);
  scene.add(motes);
  const skyShadows = createSkyShadows(time, tier.name === 'low' ? 2 : 5);
  scene.add(skyShadows.mesh);
  const shadowAnchor = new THREE.Vector3();

  const post = createPost(renderer, scene, camera, tier);

  const world = {
    renderer, scene, camera, sun, post, reflection, tier, ctx, time, collision: col,
    district: { id: 'aurum_plaza', name: 'Aurum Plaza', city: 'Halcyon', bounds: LAYOUT.bounds, layout: LAYOUT },
    sites: ctx.sites,
    spawnPoints: { player: new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z), kiosk: new THREE.Vector3(LAYOUT.kiosk.x, 0, LAYOUT.kiosk.z + 2.5), pad: new THREE.Vector3(LAYOUT.pad.x, 0, LAYOUT.pad.z) },
    interactables: ctx.interactables,
    groundAt: (x, z) => col.groundAt(x, z),
    blocked: (x, z, r) => col.blocked(x, z, r),
    focus: new THREE.Vector3(),
    fade,
    // screen-space see-through circle around a world point (the player)
    setFadeTarget(p) {
      const v = _v.copy(p); v.y += 1.0;
      const depth = -v.clone().applyMatrix4(camera.matrixWorldInverse).z;
      v.project(camera);
      const b = renderer.getDrawingBufferSize(_b);
      fade.uFadeC.value.set((v.x * 0.5 + 0.5) * b.x, (v.y * 0.5 + 0.5) * b.y);
      fade.uFadeR.value = b.y * 0.2; fade.uFadeZ.value = depth;
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const b = renderer.getDrawingBufferSize(new THREE.Vector2());
      reflection.setSize(b.x, b.y);
      post.setSize(w, h, dpr);
      pxScale.value = b.y / (2 * Math.tan(camera.fov * D2R / 2));
    },
    update(dt) {
      time.value += dt;
      for (const u of ctx.updaters) u(dt, time.value);
      // shadow frustum follows the focus, snapped to texels to stop shimmering
      if (sun.castShadow) {
        const f = world.focus, texel = (2 * 22) / tier.shadowMap;
        const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
        sun.target.position.set(fx, f.y, fz);
        sun.position.set(fx + SUN_DIR.x * 90, f.y + SUN_DIR.y * 90, fz + SUN_DIR.z * 90);
        sun.target.updateMatrixWorld();
      }
      motes.material.uniforms.uCenter.value.copy(world.focus);
      shadowAnchor.set(Math.round(world.focus.x / 60) * 60, 0, Math.round(world.focus.z / 60) * 60);
      skyShadows.update(dt, shadowAnchor);
    },
    render(dt) {
      renderer.info.reset();
      reflection.update(scene, camera);
      post.render(dt);
    },
  };
  world.resize(innerWidth, innerHeight, tier.dpr);
  onProgress(0.8, 'Waking the citizens…');
  return world;
}

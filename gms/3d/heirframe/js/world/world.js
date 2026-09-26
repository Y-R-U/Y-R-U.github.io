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
import { buildFurnish } from './furnish.js';
import { buildBackdrop } from './backdrop.js';
import { createBillboards } from './holo.js';
import { swayFoliage, fadeMaterial, makeLeafAtlas, createLeafMaterial, FADE_GLSL } from './foliage.js';
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
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x8a7358, 0.3);
  hemi.layers.enable(REFLECT_LAYER);
  scene.add(hemi);

  const M = createMaterials(reflection, tier);
  const fade = { uFadeA: { value: new THREE.Vector3() }, uFadeB: { value: new THREE.Vector3() }, uFadeOn: { value: 0 } };
  let fadeSet = false;
  swayFoliage(M.foliage, time, fade);
  M.leaves = createLeafMaterial(makeLeafAtlas(), time, fade);
  // anything tall enough to stand between the camera and the player dithers away around them
  for (const k of ['bark', 'chrome', 'darkMetal', 'gold', 'stone', 'stoneUpper', 'glassRail', 'canopyA', 'warmGlow', 'blueGlow', 'facade', 'facadeWarm', 'shopGlow', 'uber']) fadeMaterial(M[k], fade);
  const col = createCollision(LAYOUT.bounds);
  const batch = createBatcher({ cell: 56, uber: /[?&]nouber/.test(location.search) ? null : M.uber });
  const ctx = {
    scene, renderer, M, batch, col, tier, time, pxScale, reflection, layout: LAYOUT,
    updaters: [], interactables: [], cache: {}, stats: {}, gather: [], billboards: [],
    jetMaterial: createJetMaterial(time),
    makePadRing: (r, c, busy) => createPadRing(time, r, c, busy),
  };
  onProgress(0.35, 'Laying the marble…');
  createGround(ctx);
  buildPlaza(ctx);
  buildFurnish(ctx);
  onProgress(0.5, 'Raising the Atrium…');
  buildAtrium(ctx);
  buildBlocks(ctx);
  buildVista(ctx);
  buildBackdrop(ctx);
  buildSites(ctx);
  onProgress(0.65, 'Building the skyline…');
  buildSkyline(ctx);
  buildTraffic(ctx);
  const built = batch.build(scene);
  // holo signs/posters fade out (alpha) instead of dithering
  scene.traverse((o) => {
    const m = o.material;
    if (!m?.isShaderMaterial || !m.uniforms?.uBright || m.userData.faded) return;
    m.userData.faded = true;
    Object.assign(m.uniforms, fade);
    m.fragmentShader = m.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + FADE_GLSL)
      .replace('#include <fog_fragment>', 'gl_FragColor.a *= 1.0 - 0.85 * hfFade( vFogWorldPos, vFogDepth );\n#include <fog_fragment>');
  });
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
    billboards: createBillboards(ctx),
    spawnPoints: { player: new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z), kiosk: new THREE.Vector3(LAYOUT.kiosk.x, 0, LAYOUT.kiosk.z + 2.5), pad: new THREE.Vector3(LAYOUT.pad.x, 0, LAYOUT.pad.z) },
    interactables: ctx.interactables,
    groundAt: (x, z) => col.groundAt(x, z),
    blocked: (x, z, r) => col.blocked(x, z, r),
    focus: new THREE.Vector3(),
    fade,
    // see-through capsule from the camera to a world point (the player); call every frame, or the fade switches off
    setFadeTarget(p) {
      fade.uFadeB.value.set(p.x, p.y + 1.0, p.z);
      fadeSet = true;
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
      camera.getWorldDirection(_v); _v.y = 0;
      const lead = _v.lengthSq() > 1e-6 ? _v.normalize() : _v.set(0, 0, 0);
      for (const m of ctx.faceCam || []) m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
      // shadow frustum follows the focus (led a little toward where the camera looks), snapped to texels to stop shimmering
      if (sun.castShadow) {
        const f = world.focus, texel = (2 * 22) / tier.shadowMap;
        const fx = Math.round((f.x + lead.x * 6) / texel) * texel, fz = Math.round((f.z + lead.z * 6) / texel) * texel;
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
      fade.uFadeOn.value = 0;
      reflection.update(scene, camera);
      camera.getWorldPosition(fade.uFadeA.value);
      fade.uFadeOn.value = fadeSet ? 1 : 0; fadeSet = false;
      // the skyline only shows in the mirror while the view's top edge is below the horizon
      camera.getWorldDirection(_v);
      const hideSky = Math.asin(Math.max(-1, Math.min(1, _v.y))) + camera.fov * D2R * 0.5 < -0.04;
      if (hideSky) for (const m of ctx.farSky || []) m.visible = false;
      post.render(dt);
      if (hideSky) for (const m of ctx.farSky || []) m.visible = true;
    },
  };
  world.resize(innerWidth, innerHeight, tier.dpr);
  onProgress(0.8, 'Waking the citizens…');
  return world;
}

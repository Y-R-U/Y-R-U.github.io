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
import { bakeGroundAO, MAX_CONTACTS } from './groundao.js';
import { LIVE_ROBOTS } from '../actors/robots.js';
import { BRIGHTLINE } from './brightline.js';
import { createRelayFx } from '../fx/relay.js';
import { createBreakables } from './breakables.js';

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

function buildAurum(ctx, onProgress) {
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
}

// Everything a district changes about the light. Aurum = the P1 look, unchanged.
const AURUM_AMBIENCE = {
  sun: [SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b], sunI: 3.3, hemiSky: 0xbcd4ff, hemiGround: 0x8a7358, hemiI: 0.3,
  fog: [HAZE_COLOR.r, HAZE_COLOR.g, HAZE_COLOR.b], fogDensity: 0.00055, env: 0.75,
  gain: [1.05, 1.0, 0.93], lift: [0.01, 0.006, 0.0], sat: 1.16, contrast: 1.14,
};

export const DISTRICT_DEFS = {
  aurum_plaza: {
    id: 'aurum_plaza', name: 'Aurum Plaza', layout: LAYOUT, bounds: LAYOUT.bounds, build: buildAurum, ambience: AURUM_AMBIENCE,
    spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [27, 31.5] }),
  },
  brightline: BRIGHTLINE,
};
export const DISTRICT_IDS = Object.keys(DISTRICT_DEFS);


export function createWorld(canvas, { quality, toneMapping = 'aces', onProgress = () => {}, district = null } = {}) {
  const tier = quality;
  const Q = new URLSearchParams(location.search);
  district = district || Q.get('district') || 'aurum_plaza';
  if (!DISTRICT_DEFS[district]) district = 'aurum_plaza';
  installFog();
  const renderer = createRenderer(canvas, tier, toneMapping);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE_COLOR.clone(), 0.00055);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 3000);
  camera.layers.enable(REFLECT_LAYER);

  const time = { value: 0 };
  const pxScale = { value: 1 };
  const reflection = createPlanarReflection(renderer, { scale: tier.reflect, planeY: 0, samples: tier.mirrorMsaa || 0 });
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
  M.leaves.name = 'leaves';
  // anything tall enough to stand between the camera and the player dithers away around them
  for (const k of ['bark', 'chrome', 'darkMetal', 'gold', 'stone', 'stoneUpper', 'glassRail', 'canopyA', 'warmGlow', 'blueGlow', 'facade', 'facadeWarm', 'shopGlow', 'uber']) fadeMaterial(M[k], fade, { a2c: tier.msaa > 0 });
  const col = createCollision(LAYOUT.bounds);
  const jetMaterial = createJetMaterial(time);
  const makePadRing = (r, c, busy) => createPadRing(time, r, c, busy);
  // materials/textures that outlive a district
  const shared = new Set([jetMaterial]);
  for (const k in M) if (M[k]?.isMaterial) shared.add(M[k]);
  const sharedTex = new Set();
  for (const m of shared) for (const v of Object.values(m)) if (v?.isTexture) sharedTex.add(v);
  for (const k in M.stoneTex) for (const v of Object.values(M.stoneTex[k])) if (v?.isTexture) sharedTex.add(v);

  const near = [];
  const motes = createMotes(time, pxScale, tier.name === 'low' ? 80 : 220);
  scene.add(motes);
  const skyShadows = createSkyShadows(time, tier.name === 'low' ? 2 : 5);
  scene.add(skyShadows.mesh);
  const shadowAnchor = new THREE.Vector3();

  const post = createPost(renderer, scene, camera, tier);
  const relayFx = createRelayFx(post);
  const listeners = [];
  const expQ = Q.get('exp');

  // ---- districts: every static thing lives under one Group with its own ctx (collision is reset in place) ----
  let D = null;
  function applyAmbience(a) {
    sun.color.setRGB(...a.sun); sun.intensity = a.sunI;
    hemi.color.set(a.hemiSky); hemi.groundColor.set(a.hemiGround); hemi.intensity = a.hemiI;
    scene.fog.color.setRGB(...a.fog); scene.fog.density = a.fogDensity;
    scene.environmentIntensity = a.env;
    const g = post.grade.uniforms;
    g.uGain.value.set(...a.gain); g.uLift.value.set(...a.lift); g.uSat.value = a.sat; g.uContrast.value = a.contrast;
    if (!expQ && a.exposure) renderer.toneMappingExposure = a.exposure;
    else if (!expQ) renderer.toneMappingExposure = 0.85;
  }
  function disposeDistrict(d) {
    scene.remove(d.group);
    const mats = new Set(), texs = new Set();
    d.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) if (!shared.has(m)) mats.add(m);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v?.isTexture && !sharedTex.has(v)) texs.add(v);
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture && !sharedTex.has(u.value)) texs.add(u.value);
      m.dispose();
    }
    for (const t of texs) t.dispose();
    for (const t of Object.values(d.ctx.cache)) t?.isTexture && t.dispose();
    d.ctx.groundAOBake?.rt.dispose();
    for (const f of d.ctx.disposers || []) f();
  }
  function buildDistrict(id, progress = () => {}) {
    const t0 = performance.now();
    const def = DISTRICT_DEFS[id];
    const group = new THREE.Group();
    group.name = 'district:' + id;
    scene.add(group);
    col.reset(def.bounds);
    const ctx = {
      scene: group, root: scene, renderer, camera, M, col, tier, time, pxScale, reflection, layout: def.layout, district: id,
      batch: createBatcher({ cell: def.batchCell || 56, uber: /[?&]nouber/.test(location.search) ? null : M.uber }),
      updaters: [], interactables: [], cache: {}, stats: {}, gather: [], billboards: [], faceCam: [], farSky: [], disposers: [],
      jetMaterial, makePadRing,
    };
    def.build(ctx, progress);
    const built = ctx.batch.build(group);
    // holo signs/posters fade out (alpha) instead of dithering
    group.traverse((o) => {
      const m = o.material;
      if (!m?.isShaderMaterial || !m.uniforms?.uBright || m.userData.faded) return;
      m.userData.faded = true;
      Object.assign(m.uniforms, fade);
      m.fragmentShader = m.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + FADE_GLSL)
        .replace('#include <fog_fragment>', 'gl_FragColor.a *= 1.0 - 0.85 * hfFade( vFogWorldPos, vFogDepth );\n#include <fog_fragment>');
    });
    ctx.stats.staticMeshes = built.meshes; ctx.stats.staticTris = built.tris;
    if (ctx.groundAO && !/[?&]noao/.test(location.search)) {
      const ao = bakeGroundAO(renderer, scene, def.bounds, { root: group });
      ctx.groundAO.tAO.value = ao.texture; ctx.groundAO.uAOMat.value.copy(ao.uvMat); ctx.groundAO.uAOOn.value = 1;
      ctx.stats.groundAO = { meshes: ao.meshes, size: ao.size }; ctx.groundAOBake = ao;
    }
    const L = def.layout, sp = def.spawnPoints(L);
    const v = (p) => new THREE.Vector3(p[0], col.groundAt(p[0], p[1]), p[1]);
    const d = {
      id, def, group, ctx,
      info: { id, name: def.name, city: 'Halcyon', bounds: def.bounds, layout: L, crowd: def.crowd || null },
      spawnPoints: Object.fromEntries(Object.entries(sp).map(([k, p]) => [k, v(p)])),
      billboards: createBillboards(ctx),
    };
    ctx.breakables ||= createBreakables(ctx, []);
    ctx.stats.buildMs = Math.round(performance.now() - t0);
    applyAmbience(def.ambience);
    return d;
  }

  const world = {
    renderer, scene, camera, sun, hemi, post, reflection, tier, time, collision: col,
    get ctx() { return D.ctx; },
    districts: DISTRICT_IDS,
    district: null, sites: null, billboards: null, spawnPoints: null, interactables: null, breakables: null,
    groundAt: (x, z) => col.groundAt(x, z),
    blocked: (x, z, r) => col.blocked(x, z, r),
    focus: new THREE.Vector3(),
    fade,
    // fn(world, districtId) after every district swap (crowd re-homes itself here)
    onDistrict(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    // Swap districts in place: disposes the old geometry/materials/textures, builds the new one, re-points
    // sites/interactables/collision/spawnPoints/billboards/breakables and applies its light. Synchronous; returns build ms.
    loadDistrict(id, { compile = true } = {}) {
      if (!DISTRICT_DEFS[id]) throw new Error('unknown district ' + id);
      const t0 = performance.now();
      if (D) disposeDistrict(D);
      D = buildDistrict(id);
      world.district = D.info; world.sites = D.ctx.sites || []; world.interactables = D.ctx.interactables;
      world.spawnPoints = D.spawnPoints; world.billboards = D.billboards; world.breakables = D.ctx.breakables || null;
      if (compile && world.ready) renderer.compile(scene, camera);
      for (const f of listeners.slice()) { try { f(world, id); } catch (e) { console.error('onDistrict listener failed', e); } }
      return Math.round(performance.now() - t0);
    },
    // Light-tunnel transition: streaks + zoom blur to white, swap at the peak (onSwap(world) → place the player there),
    // then back out. Resolves when the view is clear. toId === current district just plays the tunnel.
    relayTransition(toId, { onSwap = null, inS = 0.85, holdS = 0.15, outS = 0.9 } = {}) {
      return relayFx.run({ inS, holdS, outS, swap: () => {
        const ms = toId && toId !== D.id ? world.loadDistrict(toId) : 0;
        onSwap?.(world, toId);
        return ms;
      } });
    },
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
      relayFx.update(dt);
      const ctx = D.ctx;
      for (const u of ctx.updaters) u(dt, time.value);
      camera.getWorldDirection(_v); _v.y = 0;
      const lead = _v.lengthSq() > 1e-6 ? _v.normalize() : _v.set(0, 0, 0);
      for (const m of ctx.faceCam) m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
      // shadow frustum follows the focus (led a little toward where the camera looks), snapped to texels to stop shimmering
      if (sun.castShadow) {
        const f = world.focus, texel = (2 * 22) / tier.shadowMap;
        const fx = Math.round((f.x + lead.x * 6) / texel) * texel, fz = Math.round((f.z + lead.z * 6) / texel) * texel;
        sun.target.position.set(fx, f.y, fz);
        sun.position.set(fx + SUN_DIR.x * 90, f.y + SUN_DIR.y * 90, fz + SUN_DIR.z * 90);
        sun.target.updateMatrixWorld();
      }
      motes.material.uniforms.uCenter.value.copy(world.focus);
      // soft contact disks under the robots nearest the focus
      if (ctx.groundAO) {
        near.length = 0;
        for (const b of LIVE_ROBOTS) {
          if (b.hover || !b.root.parent || !b.root.visible) continue;
          const p = b.root.getWorldPosition(_v);
          if (p.y > 0.3 || p.y < -0.3) continue;
          const d = (p.x - world.focus.x) ** 2 + (p.z - world.focus.z) ** 2;
          if (d < 900) near.push([d, p.x, p.z, b.radius]);
        }
        near.sort((a, b) => a[0] - b[0]);
        const C = ctx.groundAO.uContacts.value;
        for (let i = 0; i < MAX_CONTACTS; i++) { const n = near[i]; if (n) C[i].set(n[1], n[2], n[3] * 2.2); else C[i].z = 0; }
      }
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
      const far = D.ctx.farSky;
      if (hideSky) for (const m of far) m.visible = false;
      post.render(dt);
      if (hideSky) for (const m of far) m.visible = true;
    },
  };
  onProgress(0.35, 'Laying the marble…');
  world.loadDistrict(district, { compile: false });
  world.ready = true;
  world.resize(innerWidth, innerHeight, tier.dpr);
  onProgress(0.8, 'Waking the citizens…');
  return world;
}

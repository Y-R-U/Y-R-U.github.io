// The renderer. CONTRACTS §11: makeRenderer(canvas) -> { resize(), draw(world, alpha, events) }.
// Also accepts { gl, hud } so main.js can hand over both canvases (D14).
//
// Draw order is the scene graph plus renderOrder, matching ART.md §3: sky, cloud bands, distant
// skyline, mid ridge, terrain, props, actors, projectiles, FX, HUD (separate canvas).

import * as THREE from 'three';
import { makeScene } from './scene.js';
import { makePost } from './post.js';
import { resolvePalette, paletteKey } from './palette.js';
import { curveU } from './materials.js';
import { VH } from './camera.js';

const qs = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } };

export function makeRenderer(arg, opts = {}) {
  const canvas = arg && arg.gl ? arg.gl : arg;
  const hud = arg && arg.hud ? arg.hud : opts.hud || null;
  const q = qs();
  const preserve = q.get('preserve') === '1' || !!opts.preserve;
  const dprCap = q.has('dpr') ? Number(q.get('dpr')) : 2;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve, stencil: false,
  });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;   // the composer renders several times per frame

  const S = makeScene();
  const post = makePost(renderer, S.scene, S.camApi.cam);

  let pal = null, key = '', terrainRef = null, W = 1, H = 1, dpr = 1;
  let last = 0, tSec = 0;
  let bloomOn = false, reduce = false;
  const stats = { fps: 60, ms: 16, drawCalls: 0, tris: 0, chunks: 0, particles: 0, palette: '', dpr: 1, size: '' };

  function usePalette(p, k) {
    pal = p; key = k;
    S.lighting.setPalette(p);
    S.sky.setPalette(p, k);
    S.clouds.setPalette(p, k);
    S.backdrop.setPalette(p, k);
    S.terrain.setPalette(p, k);
    S.actors.setPalette(p, k);
    S.explosions.setPalette(p, k);
    S.fx.setPalette(p, k);
    S.debris.setPalette(p);
    post.setPalette(p);
    renderer.toneMappingExposure = p.post.exposure;
    stats.palette = k;
  }

  function resize() {
    const el = canvas;
    const cw = el.clientWidth || el.width || 844;
    const ch = el.clientHeight || el.height || 390;
    dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    W = cw; H = ch;
    renderer.setPixelRatio(dpr);
    renderer.setSize(cw, ch, false);
    S.camApi.resize(cw, ch);
    S.sky.fit();
    S.explosions.fitWhite();
    S.clouds.refit();
    S.backdrop.refit();
    S.terrain.refit();
    post.resize(cw * dpr, ch * dpr);
    if (hud && (hud.width !== Math.round(cw * dpr) || hud.height !== Math.round(ch * dpr))) {
      hud.width = Math.round(cw * dpr); hud.height = Math.round(ch * dpr);
    }
    stats.dpr = dpr;
    stats.size = `${cw}x${ch}`;
  }

  const api = {
    renderer, scene: S.scene, camera: S.camApi.cam, camApi: S.camApi, parts: S, stats,

    resize,

    /** World -> CSS px, for the HUD overlay canvas (D14). Includes the horizon curve. */
    project(x, y, z) { return S.camApi.project(x, y, z || 0); },
    unproject(sx, sy) { return S.camApi.unproject(sx, sy); },
    scale() { return S.camApi.scale; },

    setQuality({ bloom, reduceEffects } = {}) {
      if (bloom !== undefined) { bloomOn = !!bloom; post.setEnabled(bloomOn); if (pal) post.setPalette(pal); }
      if (reduceEffects !== undefined) { reduce = !!reduceEffects; S.explosions.setReduce(reduce); }
    },
    quality() { return { bloom: bloomOn, reduceEffects: reduce }; },

    /** Fire an explosion straight into the FX layer (used by the lab, and by tests). */
    boom(x, y, r, o) { S.explosions.boom(x, y, r, o); },

    draw(world, alpha = 1, events = null) {
      const now = performance.now();
      let dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      if (dt > 0.1) dt = 0.1;
      tSec += dt;
      stats.ms = stats.ms * 0.9 + dt * 1000 * 0.1;
      stats.fps = 1000 / Math.max(0.001, stats.ms);

      if (!world) return;
      const lvl = world.level || {};
      const k = paletteKey(lvl.biome || 'farmland', lvl.timeOfDay || 'dawn', lvl.weather || 'clear');
      if (k !== key) usePalette(resolvePalette(lvl.biome, lvl.timeOfDay, lvl.weather), k);

      if (world.terrain && world.terrain !== terrainRef) {
        terrainRef = world.terrain;
        S.terrain.setTerrain(terrainRef);
        S.actors.setTerrain(terrainRef);
        S.debris.setTerrain(terrainRef);
        S.fx.setTerrain(terrainRef);
      }

      S.fx.events(events || world.events, world);

      const wc = world.cam || { x: 0, y: -100, vw: S.camApi.vw };
      const boomShake = S.explosions.update(dt, wc.x + S.camApi.vw / 2, S.camApi.vw);
      const sk = (wc.shakeMag || 0) + boomShake * 26;
      const shX = (wc.shakeX || 0) + (Math.random() - 0.5) * sk;
      const shY = (wc.shakeY || 0) + (Math.random() - 0.5) * sk;
      const { cx, cy } = S.camApi.apply(wc, shX, shY);

      curveU.uCurveK.value = S.camApi.curveK;
      curveU.uCamX.value = cx;
      curveU.uCamD.value = S.camApi.D;

      S.lighting.update(S.camApi.cam.position, S.camApi.vw);
      S.sky.update(cx, cy);
      S.clouds.update(cx, cy);
      S.backdrop.update(cx, cy);
      S.terrain.update(cx, cy, S.camApi.vw, tSec);
      S.actors.update(world, alpha, dt);
      S.debris.update(dt, cx, S.camApi.vw);
      S.fx.update(world, alpha, dt);

      renderer.info.reset();
      if (post.enabled()) post.render(); else renderer.render(S.scene, S.camApi.cam);
      stats.drawCalls = renderer.info.render.calls;
      stats.tris = renderer.info.render.triangles;
      stats.chunks = S.terrain.chunkCount();
      const c = S.explosions.counts();
      stats.particles = c.fire + c.smoke;
    },

    dispose() {
      S.sky.dispose(); S.clouds.dispose(); S.backdrop.dispose(); S.terrain.dispose();
      S.actors.dispose(); S.explosions.dispose(); S.debris.dispose(); S.fx.dispose();
      post.dispose(); renderer.dispose();
    },
  };

  resize();
  return api;
}

export { VH };

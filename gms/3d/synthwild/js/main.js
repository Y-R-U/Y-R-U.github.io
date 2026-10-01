// SYNTHWILD boot: renderer, ctx, every lane's init in order, and the frame loop.
import * as THREE from 'three';
import { createBus } from './core/bus.js';
import { createRng } from './core/rng.js';
import { createSky } from './render/sky.js';
import { createChunkRenderer } from './render/chunks.js';
import { createFx } from './render/fx.js';
import { createSwimmers } from './render/swimmers.js';
import { createPost } from './render/post.js';

const Q = new URLSearchParams(location.search);
const flags = {
  auto: Q.get('auto') === '1',
  shot: Q.get('shot') === '1',
  lite: Q.get('lite') === '1',
  fps: Q.get('fps') === '1' || Q.get('shot') === '1',
  seed: Q.get('seed'),
  mode: Q.get('mode'),
  t: Q.has('t') ? parseFloat(Q.get('t')) : null,
  cam: Q.get('cam'),   // x,y,z,yaw,pitch: fixed photo camera
  rd: Q.has('rd') ? parseInt(Q.get('rd'), 10) : null,
  quality: Q.get('q'),
  noshell: Q.get('noshell') === '1',
};
const isMobile = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad/i.test(navigator.userAgent);

async function optional(path, pick) {
  try {
    const m = await import(path);
    return pick(m) ?? null;
  } catch (e) {
    console.warn(`[main] optional module ${path} unavailable:`, e?.message || e);
    reportBootError(`${path}: ${e?.message || e}`);
    return null;
  }
}
function reportBootError(msg) { window.__bootErrors = window.__bootErrors || []; window.__bootErrors.push(msg); }

const STUB_SETTINGS = (() => {
  const v = { renderDistance: isMobile ? 6 : 8, quality: isMobile ? 'med' : 'high', fov: 75, showFps: false };
  return { get: (k) => v[k], set: (k, x) => { v[k] = x; }, on: () => () => {} };
})();

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui-root');
const bus = createBus();
const ctx = {
  THREE, canvas, uiRoot, bus, flags, isMobile,
  rng: createRng(flags.seed ?? 'synthwild'),
  renderer: null, scene: null, camera: null,
  world: null, render: null, sky: null, fx: null,
  input: null, player: null, brush: null, game: null,
  ui: null, audio: null, settings: STUB_SETTINGS, api: null,
  session: { meta: null, mode: 'survival', paused: false, playing: false },
  stats: { fps: 0, ms: 0, cpu: 0, calls: 0, tris: 0 },
  engine: null,
};

function quality() {
  if (flags.quality) return flags.quality;
  if (flags.lite) return 'low';
  return ctx.settings.get('quality') || (isMobile ? 'med' : 'high');
}
function pixelRatio(q) {
  const dpr = window.devicePixelRatio || 1;
  if (q === 'low') return Math.min(dpr, 1);
  if (q === 'med') return Math.min(dpr, isMobile ? 1.25 : 1.5);
  return Math.min(dpr, isMobile ? 1.5 : 2);
}

let BLOCKS_MOD = null, WorldClass = null;
let swimmers = null, post = null, shell = null, photo = null;
let fpsEl = null;

async function boot() {
  const settings = await optional('./ui/settings.js', (m) => m.settings || m.default);
  if (settings) { ctx.settings = settings; settings.init?.(ctx); }

  const q = quality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'high' && !isMobile, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(pixelRatio(q));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x88c8ff);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(ctx.settings.get('fov') || 75, window.innerWidth / window.innerHeight, 0.05, 900);
  camera.position.set(0, 50, 0);
  scene.add(camera);
  Object.assign(ctx, { renderer, scene, camera });

  BLOCKS_MOD = await import('./data/blocks.js');
  ctx.api = await optional('./net/api.js', (m) => m.api || m.default);
  ctx.api?.init?.(ctx);

  ctx.sky = createSky(ctx);
  ctx.render = createChunkRenderer(ctx, BLOCKS_MOD);
  ctx.fx = createFx(ctx);
  const waterIds = new Uint8Array(256);
  for (const b of BLOCKS_MOD.BLOCKS) if (b && (b.liquid || b.waterlogged)) waterIds[b.id] = 1;
  swimmers = createSwimmers(ctx, (w, x, y, z) => { const m = w.getCell(x, y, z); return m > 0 && m < 256 && waterIds[m] === 1; });
  post = createPost(ctx);
  applyQuality();

  const worldMod = await optional('./world/world.js', (m) => m);
  WorldClass = worldMod?.World ?? null;
  if (worldMod?.SEA != null) ctx.sky.uniforms.uSeaLevel.value = worldMod.SEA - 0.125;

  ctx.input = await optional('./player/input.js', (m) => m.input || m.default);
  ctx.player = await optional('./player/player.js', (m) => m.player || m.default);
  ctx.brush = await optional('./player/brush.js', (m) => m.brush || m.default);
  const gameMod = await optional('./game/index.js', (m) => m);
  ctx.audio = await optional('./audio/audio.js', (m) => m.audio || m.default);
  const shellMod = flags.noshell ? null : await optional('./ui/ui.js', (m) => m.ui || m.default);

  safe('input.init', () => ctx.input?.init?.(ctx));
  safe('player.init', () => ctx.player?.init?.(ctx));
  safe('brush.init', () => ctx.brush?.init?.(ctx));
  safe('game.init', () => { if (gameMod?.init) ctx.game = gameMod.init(ctx) || ctx.game; });
  safe('audio.init', () => ctx.audio?.init?.(ctx));

  ctx.engine = engine;
  window.__game = { ctx, engine, THREE, flags, photo: setPhoto, stats: ctx.stats, get post() { return post; } };

  if (ctx.settings.on) {
    ctx.settings.on('renderDistance', () => applyQuality());
    ctx.settings.on('quality', () => applyQuality(true));
    ctx.settings.on('fov', (v) => { camera.fov = v; camera.updateProjectionMatrix(); });
  }
  window.addEventListener('resize', onResize);
  onResize();

  if (shellMod) {
    shell = shellMod;
    ctx.ui = shell;
    safe('ui.init', () => shell.init?.(ctx, engine));
  }
  if (flags.cam) {
    const v = flags.cam.split(',').map(Number);
    setPhoto(v[0], v[1], v[2], v[3] || 0, v[4] || 0);
  }
  requestAnimationFrame(frame);
  window.__bootReady = true;
  document.getElementById('boot')?.remove();
  if (!shell || flags.shot || flags.auto || flags.cam) {
    const seed = flags.seed ?? 'synthwild';
    await engine.start({ id: 'dev', name: 'Dev World', seed, mode: flags.mode || 'survival' }, null);
    if (flags.shot) await settle();
  }
}

const failCounts = new Map();
function safe(label, fn) {
  try { return fn(); } catch (e) {
    // per-frame calls fail every frame: log the first and then every 600th, so the console and memory stay sane
    const n = failCounts.get(label) || 0;
    failCounts.set(label, n + 1);
    if (n % 600 === 0) { console.error(`[main] ${label} failed (x${n + 1})`, e); if (!n) reportBootError(`${label}: ${e.message}`); }
  }
}

function applyQuality(rebuild) {
  const q = quality();
  const rd = flags.rd ?? (ctx.settings.get('renderDistance') || (isMobile ? 6 : 8));
  ctx.render.setRenderDistance(rd);
  // fog sits just inside the render distance so chunk edges never show
  const far = rd * 16;
  ctx.sky.setFog(far * 0.45, far * 0.95);
  if (ctx.renderer) { ctx.renderer.setPixelRatio(pixelRatio(q)); onResize(); }
  if (rebuild) { ctx.render.setQuality(q); ctx.sky.setQuality(q); }
  post?.setEnabled(q === 'high');
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  ctx.renderer.setSize(w, h, false);
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
  post?.setSize(w, h);
}

function setPhoto(x, y, z, yaw = 0, pitch = 0) {
  if (x == null) { photo = null; return; }
  photo = { x, y, z, yaw, pitch };
}

// ---------------------------------------------------------------------------------------------------
const engine = {
  get ctx() { return ctx; },
  async start(meta = {}, save = null) {
    if (ctx.world) engine.stop();
    const mode = meta.mode || save?.mode || 'survival';
    ctx.session.meta = meta;
    ctx.session.mode = mode;
    ctx.session.paused = false;
    ctx.session.playing = false;
    if (!WorldClass) throw new Error('world module missing');
    const world = save?.world && WorldClass.deserialize
      ? WorldClass.deserialize(save.world)
      : new WorldClass({ seed: meta.seed ?? save?.world?.seed ?? 'synthwild', mode });
    ctx.world = world;
    ctx.render.setWorld(world);
    ctx.sky.setTime(flags.t ?? save?.time ?? 0.12);
    ctx.fx.clear();
    bus.emit('load:progress', { p: 0.05, label: 'Seeding terrain' });
    const sp = world.spawn || [0.5, 40, 0.5];
    const target = save?.player?.pos || sp;
    world.update(target[0], target[2], ctx.render.renderDistance + 1);
    try { world.ensureArea?.(target[0], target[2], 1); } catch (e) { console.error(e); }
    safe('player.load', () => {
      if (save?.player && ctx.player?.load) ctx.player.load(save.player);
      else ctx.player?.spawn?.(sp[0], sp[2]);
    });
    if (!ctx.player) ctx.camera.position.set(sp[0], sp[1] + 6, sp[2]);
    safe('game.start', () => ctx.game?.start?.(save?.game ?? null));
    ctx.session.playing = true;
    bus.emit('game:start', { meta, mode });
    await settle(2, 9000);
    bus.emit('load:progress', { p: 1, label: 'Ready' });
    return ctx;
  },
  stop() {
    const data = engine.save();
    ctx.session.playing = false;
    bus.emit('game:stop', { meta: ctx.session.meta });
    ctx.render.setWorld(null);
    try { ctx.world?.dispose?.(); } catch (e) { console.error(e); }
    ctx.world = null;
    ctx.fx.clear();
    return data;
  },
  save() {
    if (!ctx.world) return null;
    const out = { v: 1, mode: ctx.session.mode, time: ctx.sky.time01, world: ctx.world.serialize() };
    safe('player.serialize', () => { out.player = ctx.player?.serialize?.() ?? null; });
    safe('game.save', () => { out.game = ctx.game?.save?.() ?? null; });
    return out;
  },
  // Small JPEG data URL of the current view, for world thumbnails (rendered and read in the same task).
  thumbnail(w = 320, h = 180) {
    if (post?.enabled) post.render(); else ctx.renderer.render(ctx.scene, ctx.camera);
    const src = ctx.renderer.domElement;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const sa = src.width / src.height, da = w / h;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sa > da) { sw = sh * da; sx = (src.width - sw) / 2; } else { sh = sw / da; sy = (src.height - sh) / 2; }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  },
  pause(p = true) { ctx.session.paused = p; bus.emit(p ? 'game:pause' : 'game:resume', {}); },
};

async function settle(r = 2, timeout = 12000) {
  const t0 = performance.now();
  let ok = 0;
  while (performance.now() - t0 < timeout) {
    await new Promise((res) => setTimeout(res, 100));
    const cam = ctx.camera.position;
    const ready = ctx.world?.isReady?.(cam.x, cam.z) && ctx.render.isSettled(r);
    bus.emit('load:progress', { p: Math.min(0.95, 0.1 + (performance.now() - t0) / timeout), label: 'Growing the wild' });
    if (ready && ++ok > 3) break;
  }
  window.__shotReady = true;
}

// ---------------------------------------------------------------------------------------------------
let last = performance.now(), acc = 0, frames = 0, idleFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const cpu0 = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const paused = ctx.session.paused;
  const playing = ctx.session.playing && ctx.world;

  safe('input.update', () => ctx.input?.update?.(dt));
  if (playing && !paused) {
    if (photo) {
      ctx.camera.position.set(photo.x, photo.y, photo.z);
      ctx.camera.rotation.set(photo.pitch, photo.yaw, 0, 'YXZ');
    } else {
      safe('player.update', () => ctx.player?.update?.(dt));
      safe('brush.update', () => ctx.brush?.update?.(dt));
    }
    safe('game.update', () => ctx.game?.update?.(dt));
  }
  if (ctx.world) {
    const p = ctx.player?.pos && !photo ? ctx.player.pos : ctx.camera.position;
    safe('world.update', () => ctx.world.update(p.x, p.z, ctx.render.renderDistance + 1));
  }
  ctx.sky.update(paused ? 0 : dt);
  ctx.render.update(ctx.camera);
  swimmers?.update(dt);
  ctx.fx.update(dt);
  safe('ui.update', () => ctx.ui?.update?.(dt));
  safe('audio.update', () => ctx.audio?.update?.(dt));

  // nothing to draw behind the title screen: render a couple of frames, then idle the GPU
  if (ctx.world) idleFrames = 0;
  if (idleFrames++ < 2) {
    if (post?.enabled) post.render();
    else ctx.renderer.render(ctx.scene, ctx.camera);
  }

  ctx.stats.cpu = ctx.stats.cpu * 0.95 + (performance.now() - cpu0) * 0.05;
  const info = ctx.renderer.info.render;
  ctx.stats.calls = info.calls; ctx.stats.tris = info.triangles;
  frames++; acc += dt;
  if (acc >= 0.5) {
    ctx.stats.fps = frames / acc; ctx.stats.ms = (acc / frames) * 1000;
    frames = 0; acc = 0;
    drawFps();
  }
}

function drawFps() {
  if (!flags.fps) { if (fpsEl) fpsEl.style.display = 'none'; return; }
  if (!fpsEl) {
    fpsEl = document.createElement('div');
    fpsEl.style.cssText = 'position:fixed;left:6px;top:4px;z-index:50;font:11px/1.3 ui-monospace,monospace;color:#bff;background:rgba(0,20,40,.45);padding:2px 6px;border-radius:4px;pointer-events:none;white-space:pre';
    document.body.appendChild(fpsEl);
  }
  fpsEl.style.display = 'block';
  const s = ctx.stats, r = ctx.render.stats;
  fpsEl.textContent = `${s.fps.toFixed(0)} fps  ${s.ms.toFixed(1)} ms  cpu ${s.cpu.toFixed(1)}  calls ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k\ncols ${r.columns}  secs ${r.sections}  quads ${(r.quads / 1000).toFixed(0)}k  q ${r.pending}/${r.inflight}  fx ${ctx.fx.count}`;
}

boot().catch((e) => {
  console.error('[main] boot failed', e);
  reportBootError(`boot: ${e?.message || e}`);
  const el = document.getElementById('boot-msg');
  if (el) el.textContent = 'Synthwild failed to start: ' + (e?.message || e);
});

export { engine as game, ctx };

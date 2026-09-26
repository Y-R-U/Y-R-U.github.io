import * as THREE from 'three';
import { detectQuality, createGovernor } from './engine/quality.js';
import { createWorld } from './world/world.js';
import { createCameraRig } from './engine/camera.js';
import { createInput } from './engine/input.js';
import { createDevpad } from './engine/devpad.js';
import { createPlayerController, placeholderBody, enableReflect } from './engine/player.js';
import { createCrowd } from './world/crowd.js';

const Q = new URLSearchParams(location.search);
const flags = {
  q: Q.get('q'), shot: Q.get('shot'), auto: Q.has('auto') && Q.get('auto') !== '0', perf: Q.has('perf') && Q.get('perf') !== '0',
  tm: Q.get('tm') || 'aces', noui: Q.has('noui'), norobots: Q.has('norobots'),
};
const boot = document.getElementById('boot');
const progress = (p, msg) => { boot.querySelector('.fill').style.width = (p * 100).toFixed(0) + '%'; if (msg) boot.querySelector('.msg').textContent = msg; };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
if (flags.shot) document.body.classList.add('shot');

async function tryImport(path) { try { return await import(path); } catch (e) { console.warn('optional module unavailable:', path, e.message); return null; } }

async function start() {
  const tier = detectQuality(flags.q);
  progress(0.05, 'Calibrating optics…');
  await frame();
  const canvas = document.getElementById('game');
  const world = createWorld(canvas, { quality: tier, toneMapping: flags.tm, onProgress: progress });
  await frame();
  const rig = createCameraRig(world.camera, { zoom: 0.35 });
  // gameplay framing: closer Diablo angle so the rental reads on a 915x412 phone; <0.35 still dips into the vista view
  rig.keys = [[0, 7.5, 26, 50], [0.35, 9.2, 52, 36], [0.7, 15, 54, 40], [1, 27, 58, 38]];
  rig.setZoom(0.35);
  const input = createInput(canvas, world.camera, world, rig);

  // UI (optional until the ui agent ships ui.js)
  let ui = null, pad = null;
  if (!flags.noui && !flags.shot) {
    const mod = await tryImport('./ui/ui.js');
    if (mod?.ui) { try { ui = mod.ui; ui.mount(document.getElementById('ui-root')); } catch (e) { console.warn('ui.mount failed', e); ui = null; } }
  }
  if (!ui && !flags.shot) pad = createDevpad(document.body);

  // Player + crowd (robots optional until the robots agent ships)
  const robots = flags.norobots ? null : await tryImport('./actors/robots.js');
  let actor;
  try { actor = robots?.createRobot ? robots.createRobot({ kind: 'rental', seed: 1, quality: tier.name }) : placeholderBody(); }
  catch (e) { console.warn('rental robot failed', e); actor = placeholderBody(); }
  enableReflect(actor.root);
  world.scene.add(actor.root);
  const player = createPlayerController(world, actor);
  const sp = world.spawnPoints.player;
  player.teleport(sp.x, sp.z, Math.PI);
  let crowd = null;
  if (robots?.createRobot) crowd = createCrowd(world, robots.createRobot, tier.crowd, tier.name);

  // Tap marker
  const marker = world.ctx.makePadRing(0.7, [1.0, 0.85, 0.5], true);
  marker.visible = false; world.scene.add(marker);
  input.onTap = (g) => { player.setTarget(g); marker.position.set(g.x, g.y + 0.03, g.z); marker.visible = true; };
  let near = null;

  // Screenshot / demo presets
  const SHOTS = {
    1: { player: [3, 12, Math.PI * 0.85] },
    2: { player: [-2, 20, Math.PI], cam: { pos: [10, 3.2, 34], look: [-6, 12, -40], fov: 55 } },
    3: { player: [44, 8, Math.PI / 2], cam: { pos: [34, 7, 20], look: [70, 6, -60], fov: 52 } },
    4: { player: [-4, -46, Math.PI], zoom: 0.25 },
    5: { player: [-20, 26, Math.PI * 0.8], cam: { pos: [-6, 9, 40], look: [-40, 10, -20], fov: 52 } },
  };
  const shot = flags.shot ? SHOTS[flags.shot] || SHOTS[1] : null;
  if (shot) {
    player.teleport(shot.player[0], shot.player[1], shot.player[2]);
    if (shot.cam) rig.fixed = { pos: new THREE.Vector3(...shot.cam.pos), look: new THREE.Vector3(...shot.cam.look), fov: shot.cam.fov };
    if (shot.zoom !== undefined) rig.setZoom(shot.zoom);
  }
  // Gameplay runtime (D13): js/game/game.js may export createGame(api) → { update(dt), ... }.
  // main.js stays boot + frame loop; everything mission/combat/AI lives behind this hook.
  const gameMod = await tryImport('./game/game.js');
  let runtime = null;
  const api = { THREE, world, rig, input, player, crowd, ui, robots, flags, tier, marker };
  if (gameMod?.createGame && !flags.shot) { try { runtime = await gameMod.createGame(api); } catch (e) { console.error('game runtime failed to start', e); } }
  if (runtime) {
    // the runtime owns taps (it also engages enemies) and interactables
    input.onTap = (g, e) => runtime.tapWorld?.(e.clientX, e.clientY);
  } else {
    ui?.on?.('tap', (s) => { const g = input.groundFromScreen(s.x, s.y); if (g) input.onTap(g); });
    ui?.on?.('interact', () => { if (near) ui.panel?.open?.(near.id, {}); });
  }

  const AUTO = [[0, 22], [-14, 14], [-18, -8], [-4, -30], [-2, -60], [8, -70], [10, -40], [28, -20], [44, -42], [32, 6], [44, 8], [22, 22], [0, 30], [0, 50], [-30, 52], [-12, 36]];
  let autoIdx = 0;

  rig.target.copy(player.pos); rig.snap();
  const governor = createGovernor(tier, (dpr) => world.resize(innerWidth, innerHeight, dpr));
  if (flags.shot) governor.enabled = false;
  addEventListener('resize', () => world.resize(innerWidth, innerHeight, governor.dpr));

  const perfEl = document.getElementById('perf');
  if (flags.perf) perfEl.style.display = 'block';
  const stats = { fps: 0, ms: 0, calls: 0, tris: 0, frames: 0 };
  let last = performance.now(), acc = 0, accN = 0, perfT = 0, runtimeErr = false;

  const game = window.__game = {
    THREE, world, rig, input, player, crowd, flags, tier, governor, stats, ui, get runtime() { return runtime; },
    get moveTarget() { return player.moveTarget; },
    get state() { return runtime?.state ?? 'free'; },
    snapshot: () => runtime?.snapshot?.() ?? null,
    get near() { return near; },
    teleport: (x, z, yaw) => { player.teleport(x, z, yaw); rig.target.copy(player.pos); rig.snap(); },
    info: () => ({ ...stats, dpr: governor.dpr, tier: tier.name, gpu: tier.gpu, static: world.ctx.stats, programs: world.renderer.info.programs?.length }),
  };

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let stick = { x: 0, y: 0 };
    if (ui?.controls?.move) stick = { x: ui.controls.move.x, y: -ui.controls.move.y };
    else if (pad?.active) stick = pad.move;
    if (!ui) { const k = input.keyVector(); if (k.x || k.y) stick = k; }
    if (flags.auto && !runtime && !player.moveTarget) {
      const [x, z] = AUTO[autoIdx++ % AUTO.length];
      player.setTarget({ x, z });
    }
    if (runtime?.update) {
      try { runtime.update(dt, stick); } catch (e) { if (!runtimeErr) { runtimeErr = true; console.error('runtime update failed', e); } player.update(dt, stick); }
    } else player.update(dt, stick);
    if (!player.moveTarget) marker.visible = false;
    crowd?.update(dt, player.pos);

    if (!runtime) {
      near = null;
      for (const it of world.interactables) if (Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < it.r) near = it;
      if (ui?.interact) near ? ui.interact.show(near.label) : ui.interact.hide();
    }

    rig.target.copy(player.pos);
    rig.update(dt);
    world.focus.copy(player.pos);
    if (!rig.fixed) world.setFadeTarget(player.pos);
    world.update(dt);
    world.render(dt);

    const ri = world.renderer.info.render;
    stats.calls = ri.calls; stats.tris = ri.triangles; stats.frames++;
    acc += dt; accN++;
    if (acc >= 0.5) { stats.fps = accN / acc; stats.ms = acc / accN * 1000; acc = 0; accN = 0; }
    governor.tick(dt);
    if (flags.perf && (perfT += dt) > 0.25) {
      perfT = 0;
      perfEl.textContent = `${stats.fps.toFixed(0)} fps  ${stats.ms.toFixed(1)} ms\ncalls ${stats.calls}  tris ${(stats.tris / 1000).toFixed(0)}k\ndpr ${governor.dpr.toFixed(2)}  ${tier.name}  refl ${world.reflection.enabled ? tier.reflect : 'off'}`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame((t) => { last = t; tick(t); });
  await frame(); await frame();
  progress(1, 'Welcome to Concord.');
  window.__heirframeReady = true;
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 900);
}

start().catch((e) => {
  console.error(e);
  window.__bootErrors?.push(String(e?.message || e));
  boot.classList.add('failed');
  boot.querySelector('.msg').textContent = 'Something went wrong starting the city: ' + (e?.message || e);
});

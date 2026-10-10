import * as THREE from '../vendor/three/three.module.js';
import { createRenderer } from './core/renderer.js';
import { createPost } from './core/post.js';
import { createCamera } from './core/camera.js';
import { createController } from './core/controller.js';
import { createInput } from './core/input.js';
import { createInteract } from './core/interact.js';
import { createScratch } from './core/scratch.js';
import { createDirector } from './core/director.js';
import { createGame } from './core/game.js';
import { createEvents } from './core/events.js';
import { createNames } from './core/names.js';
import { save } from './core/save.js';
import { detectQuality, isTouch } from './core/quality.js';
import { createDev } from './core/dev.js';
import * as stubs from './core/stubs.js';
import { selfTest } from './core/selftest.js';
import { castUpdate } from './game/cast2.js';

const boot = window.__boot || { progress() {}, ready() {}, fail() {} };
const qs = new URLSearchParams(location.search);
const params = {
  level: qs.get('level'), skip: qs.get('skip') === '1', dev: qs.get('dev') === '1', shot: qs.get('shot') === '1',
  nointro: qs.get('nointro') === '1', nogate: qs.get('nogate') === '1', ch2: qs.get('ch2') === '1', stub: (qs.get('stub') || '').split(',').filter(Boolean),
};
const lanes = {};
// A lane that never settles must not hang the boot: race it against a timer and fall back to a stub.
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out after ' + ms / 1000 + 's')), ms))]);

// Lanes load independently; a missing or broken module falls back to a stub instead of hanging the boot.
async function load(name, path, pick, stub) {
  if (params.stub.includes(name) || params.stub.includes('all')) { lanes[name] = 'stub (forced)'; return stub(); }
  try {
    const m = await within(import(path), 15000, 'import');
    const v = pick(m);
    if (!v) throw new Error('export missing');
    lanes[name] = 'real';
    return v;
  } catch (e) {
    console.warn(`[boot] ${name} → stub:`, e.message);
    lanes[name] = 'stub (' + e.message.replace(/https?:\/\/[^\s]*\/mal\/garfield\//g, '').slice(0, 80) + ')';
    return stub();
  }
}

async function main() {
  boot.progress(0.05, 'Finding the cat…');
  const quality = detectQuality(save.data.settings.quality);
  const canvas = document.getElementById('gl');
  const R = createRenderer(canvas, quality);
  const post = createPost(R);
  const events = createEvents();

  boot.progress(0.1, 'Fluffing the cushions…');
  const [ui, audio, levelsMod] = await Promise.all([
    load('ui', './ui/ui.js', (m) => m.ui || m.default, stubs.stubUI),
    load('audio', './audio/audio.js', (m) => m.audio || m.default, () => stubs.stubAudio),
    load('levels', './levels/index.js', (m) => (m.levels ? m : m.default?.levels ? m.default : null), stubs.stubLevels),
  ]);
  ui.mount?.(document.getElementById('ui-root'));
  if (ui.settings?.set) ui.settings.set(save.data.settings);
  boot.progress(0.25, 'Building the house…');

  const world = await load('world', './world/world.js', (m) => m.createWorld, () => stubs.stubWorld)
    .then((f) => within(Promise.resolve(f({ renderer: R.renderer, quality })), 25000, 'createWorld'))
    .catch((e) => { console.error('[world]', e); lanes.world = 'stub (create failed: ' + e.message + ')'; return stubs.stubWorld(); });
  boot.progress(0.6, 'Waking Garfield up (this may take a while)…');

  const mk = async (name, path, fn, kind) => {
    const create = await load(name, path, (m) => m[fn], () => () => stubs.stubActor(kind));
    try { return await within(Promise.resolve(create({ quality })), 20000, 'create'); } catch (e) {
      console.error(`[${name}]`, e); lanes[name] = 'stub (create failed: ' + e.message + ')'; return stubs.stubActor(kind);
    }
  };
  const [garfield, jon] = await Promise.all([
    mk('garfield', './actors/garfield.js', 'createGarfield', 'garfield'),
    mk('jon', './actors/jon.js', 'createJon', 'jon'),
  ]);
  boot.progress(0.85, 'Hiding the lasagna…');
  world.scene.add(garfield.root);
  if (jon) world.scene.add(jon.root);

  const camera = createCamera(R);
  camera.setWorld(world);
  const names = createNames(save, audio);
  const input = createInput({ canvas, ui, camera });
  const controller = createController({ actor: garfield, world, events, camera });
  controller.actor = garfield;
  const interact = createInteract({ scene: world.scene, events, ui, camera: camera.camera });
  const scratch = createScratch({ garfield, events, audio });
  scratch.setJon(jon);
  const director = createDirector({ camera, ui, audio, world, controller, input, events, names });
  // a "not yet" hint (e.g. Scratch his face first!) must not steal Space from jumping
  input.hasInteractable = () => !!interact.current && !director.active && !ui.hud?.state?.interactHint;
  input.pickInteractable = (x, y) => interact.pick(x, y);
  ui.on?.('tap', (p) => { if (game.state === 'play' && !director.active && interact.pick(p.x, p.y)) interact.trigger('tap'); });
  ui.on?.('sfx', (n) => audio.sfx?.(n));
  const gp = () => garfield.root.position;
  events.on('jump', () => audio.sfx?.('jump', { pos: gp(), vol: 0.6, rate: 0.95 + Math.random() * 0.1 }));
  events.on('land', (e) => { if (e.fallH > 0.3) audio.sfx?.('land', { pos: gp(), vol: Math.min(1, 0.35 + e.fallH * 0.4) }); });
  events.on('bonk', () => { audio.sfx?.('boing', { pos: gp(), vol: 0.7 }); camera.shake(0.12); });
  events.on('knockback', () => audio.sfx?.('yowl', { pos: gp(), vol: 0.6 }));
  audio.setListener?.(camera.camera);
  camera.setTarget(garfield.root);
  post.setScene(world.scene, camera.camera);

  const frameFns = new Set();
  const sys = { THREE, R, post, world, camera, controller, garfield, jon, director, input, interact, scratch, ui, audio, save, events, names, params, levelsMod, lanes,
    onFrame: (fn) => { frameFns.add(fn); return () => frameFns.delete(fn); } };
  const game = createGame(sys);

  applySettings(save.data.settings);
  function applySettings(s) {
    camera.sensitivity = s.camSens ?? 1;
    camera.invertY = !!s.invertY;
    audio.setVolumes?.({ music: s.music, sfx: s.sfx, voice: s.voice });
    audio.setMusicOn?.(s.musicOn !== false);
    const q = detectQuality(s.quality);
    if (q !== R.quality) { R.setQuality(q); post.rebuild(); }
  }
  ui.on?.('settings', (s) => { save.data.settings = { ...save.data.settings, ...s }; save.write(); applySettings(save.data.settings); });

  const unlock = () => { try { audio.unlock?.(); } catch {} };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  // Compile shaders before the reveal so the first frames don't hitch.
  boot.progress(0.92, 'Polishing the food bowl…');
  try { await within(R.renderer.compileAsync(world.scene, camera.camera), 8000, 'compile'); } catch {}

  const dev = params.dev ? createDev(sys, game) : null;
  const clock = new THREE.Clock();
  let fps = 60, frames = 0, fpsT = 0;
  const gpPos = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    R.renderer.info.reset();
    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (game.state === 'play' && !document.hidden && !params.shot) R.adapt(fps, dt);

    const inp = input.poll();
    const playing = game.state === 'play' && !game.paused;
    const blocked = ui.isBlocking?.() && !(ui.current === 'hud');

    if (!game.paused) {
      if (playing && !director.active && !blocked) {
        camera.look(inp.look.dx, inp.look.dy);
        if (inp.interact && !interact.trigger()) { /* nothing in range */ }
        if (inp.scratch) scratch.trigger();
      } else if (playing && director.active) {
        if (inp.look.dx || inp.look.dy) {}
      }
      if (!sys.simulating) controller.update(dt, playing && !blocked ? inp : null);
      scratch.update(dt);
      director.update(dt);
      game.update(dt);
      for (const fn of frameFns) fn(dt);
      garfield.update(dt);
      jon?.update(dt);
      castUpdate(sys, dt);
      interact.update(dt, playing && !director.active && !controller.locked ? garfield.root.position : null);
      ui.hud?.set && playing && Math.random() < 0.1 && ui.hud.set({ belly: controller.belly });
      world.update?.(dt, camera.camera, garfield.root.position);
    }
    camera.update(game.paused ? 0 : dt, { moving: controller.speed > 0.4, speed: controller.speed, grounded: controller.grounded });
    post.render();
    dev?.update(dt, fps);
    sys.fps = fps;
  }

  window.__game = {
    sys, lanes, get state() { return game.state; }, get paused() { return game.paused; },
    get level() { return game.level; }, get ctx() { return game.ctx; }, get fps() { return fps; },
    get info() { const i = R.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, quality: R.quality }; },
    get pos() { return garfield.root.position.toArray().map((v) => +v.toFixed(3)); },
    skipCutscene: () => director.skip(),
    goLevel: (n) => game.startLevel(n),
    menu: () => game.menu(), chapter: (n) => game.chapter(n), intro: () => game.intro(), story: () => game.story(false),
    win: () => game.win(),
    teleport: (x, y, z, rotY) => controller.teleport(new THREE.Vector3(x, y, z), rotY),
    save,
    selfTest() { return selfTest(window.__game); },
    // Deterministic controller sim for tests: steps [{t, x, y, jump}] at fixed 60 Hz, returns a trace.
    sim(steps, { every = 6 } = {}) {
      sys.simulating = true;
      const out = [], dt = 1 / 60;
      let held = false, f = 0;
      try {
        for (const st of steps) {
          const n = Math.round((st.t ?? 0.5) / dt);
          for (let i = 0; i < n; i++, f++) {
            const press = !!st.jump && !held;
            held = !!st.jump;
            controller.update(dt, { move: { x: st.x || 0, y: st.y || 0 }, jumpPressed: press, jumpHeld: held, any: true });
            if (f % every === 0) out.push([f, ...garfield.root.position.toArray().map((v) => +v.toFixed(3)), controller.surfaceId, controller.grounded ? 'g' : 'a'].join(' '));
          }
        }
      } finally { sys.simulating = false; }
      out.push('END ' + garfield.root.position.toArray().map((v) => +v.toFixed(3)).join(' ') + ' ' + controller.surfaceId);
      return out;
    },
  };

  frame();
  boot.progress(1, 'Ready!');
  boot.ready();
  // Start gate on every visit: audio (and fullscreen) need a user gesture. Test hooks bypass it.
  if (!(params.level || params.skip || params.nogate || params.shot)) {
    await ui.gate?.show?.({ onGo: () => {
      unlock();
      if (ui.isTouch && ui.fullscreen?.supported && !ui.fullscreen.isOn) ui.fullscreen.toggle();
    } });
  }
  await game.start();
  if (params.shot) document.documentElement.classList.add('shot-mode');
}

main().catch((e) => {
  console.error('[boot]', e);
  boot.fail('Something broke while loading: ' + (e?.message || e) + '. A reload usually fixes it.');
});

import * as THREE from '../../vendor/three/three.module.js';
import { createEvents } from './events.js';
import { bestShot } from '../game/shots.js';

const FOOD = { 1: 'steak', 2: 'steak', 7: 'steak', 3: 'lasagna', 5: 'lasagna', 6: 'lasagna', 10: 'lasagna', 4: 'meatloaf', 8: 'meatloaf', 9: 'meatloaf' };

// State machine: boot → intro (first launch) → menu → chapter → level (opening → play → win) → complete.
export function createGame(sys) {
  const { world, camera, controller, garfield, jon, director, input, interact, scratch, ui, audio, save, events, names, params } = sys;
  const L = sys.levelsMod;
  const game = {
    state: 'boot', paused: false, levelN: 0, level: null, ctx: null, time: 0,
    menuOrbit() {
      const c = world.anchors.get('cam_menu');
      if (c) camera.cut({ pos: c.pos, look: c.look || c.target || c.pos });
      else {
        const t = world.anchors.get('tableTop')?.pos || new THREE.Vector3(4.4, 0.76, 8.8);
        camera.orbit({ center: new THREE.Vector3(t.x, 0.8, t.z - 0.2), radius: 1.9, height: 0.9, speed: 0.045, start: Math.PI * 0.9, look: new THREE.Vector3(t.x, 0.7, t.z) });
      }
    },
  };
  let levelEvents = null, scoped = [], winning = false, levelToken = 0;

  // ---------- menus ----------
  async function menu() {
    teardownLevel();
    game.state = 'menu';
    audio.music?.('menu', { fade: 1 });
    showActors(false);
    game.menuOrbit();
    const first = !save.data.chapterUnlockSeen;
    ui.screen('title');
    const p = ui.menu.show({ see3D: true, chapters: [{ id: 1, title: 'Chapter One', subtitle: 'Food', locked: false, justUnlocked: first }] });
    if (first) { await p; save.set({ chapterUnlockSeen: true }); }
  }
  function chapter() {
    teardownLevel();
    game.state = 'chapter';
    showActors(false);
    game.menuOrbit();
    const d = save.data;
    const justN = d.levelsUnlocked > (d.levelUnlockSeen || 0) ? d.levelsUnlocked : 0;
    const levels = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return { n, food: FOOD[n], locked: n > d.levelsUnlocked, done: d.levelsDone.includes(n), justUnlocked: n === justN };
    });
    ui.screen('chapter');
    ui.chapter.show({ levels, see3D: true, onPick: (n) => { if (n <= save.data.levelsUnlocked) startLevel(n); } });
    if (justN) save.set({ levelUnlockSeen: justN });
  }

  ui.on?.('chapter', () => { if (game.state === 'menu') chapter(); });
  ui.on?.('back', () => { if (game.state === 'chapter') menu(); });

  // ---------- intro ----------
  async function intro() {
    game.state = 'intro';
    teardownLevel();
    ui.screen('none');
    showActors(true);
    world.exterior?.show(true);
    world.reset?.();
    world.setFood?.('steak');
    const ctx = makeCtx(0, null);
    try { await L.playIntro?.(ctx); } catch (e) { console.error('[intro]', e); }
    world.exterior?.show(false);
    save.set({ introSeen: true });
    await menu();
  }

  // ---------- level ----------
  function makeCtx(n, level) {
    levelEvents = createEvents();
    // Core events are forwarded into the per-level emitter so level listeners die with the level.
    const fwd = ['scratch', 'jump', 'land', 'interact', 'idle', 'input', 'knockback', 'bonk', 'cutscene', 'highlight'];
    scoped.push(...fwd.map((n) => events.on(n, (d) => levelEvents.emit(n, d))));
    const regI = interact.register.bind(interact), regS = scratch.register.bind(scratch);
    const ctx = {
      THREE, renderer: sys.R.renderer, world, anchors: world.anchors, camera, controller, garfield, jon,
      director, input, ui, audio, save, names, levelN: n, level, quality: sys.R.quality, skip: !!params.skip,
      events: levelEvents, time: 0, get paused() { return game.paused; },
      interact: Object.create(interact, { register: { value: (def) => { const u = regI(def); scoped.push(u); return u; } } }),
      scratch: Object.create(scratch, { register: { value: (def) => { const u = regS(def); scoped.push(u); return u; } } }),
      objectives: [],
      setObjectives(list) {
        ctx.objectives = list.map((t) => (typeof t === 'string' ? { text: names.apply(t), done: false } : { ...t, text: names.apply(t.text) }));
        ui.hud?.set?.({ objectives: ctx.objectives });
      },
      objective(i, done = true) {
        if (!ctx.objectives[i] || ctx.objectives[i].done === done) return;
        ctx.objectives[i] = { ...ctx.objectives[i], done };
        ui.hud?.set?.({ objectives: ctx.objectives.map((o) => ({ ...o })) });
        if (done) audio.sfx?.('pop');
      },
      win: () => win(),
      every: (secs, fn) => { let t = 0; const off = sys.onFrame((dt) => { if (!game.paused && (t += dt) >= secs) { t = 0; fn(); } }); scoped.push(off); return off; },
    };
    game.ctx = ctx;
    return ctx;
  }

  function teardownLevel() {
    levelToken++;
    if (director.active) director.skip();
    const lvl = game.level, ctx = game.ctx;
    if (lvl && ctx) { try { lvl.teardown?.(ctx); } catch (e) { console.error('[teardown]', e); } }
    for (const u of scoped) { try { u(); } catch {} }
    scoped = [];
    levelEvents?.clear();
    game.level = null;
    game.paused = false;
    winning = false;
    ui.hud?.set?.({ objectives: [], interactLabel: null, chaseTimer: null });
  }

  async function startLevel(n, opts = {}) {
    n = THREE.MathUtils.clamp(n | 0, 1, 10);
    const level = L.levels?.[n] || L.levels?.[n - 1];
    if (!level) { console.error('no level', n); return menu(); }
    // fade out first, then tear down: prop/actor resets (chair, vase, pan) happen behind black, never on screen
    const pre = ++levelToken;
    ui.screen('none');
    await Promise.race([Promise.resolve(ui.fade?.(true, 0.25)), new Promise((r) => setTimeout(r, 1200))]);
    if (pre !== levelToken) return;
    teardownLevel();
    const token = levelToken;
    game.state = 'level'; game.levelN = n; game.level = level; game.time = 0;
    sys.lastLevel = n;
    world.exterior?.show(false);
    world.reset?.();
    world.setFood?.(level.food || FOOD[n]);
    showActors(true);
    const sp = world.anchors.get('playerSpawn'), js = world.anchors.get('jonSpawn');
    controller.teleport(sp?.pos || new THREE.Vector3(3, 0, 3), sp?.rotY ?? 0);
    controller.lock(true);
    if (jon && jon.root.parent !== world.scene) { if (jon.leaveSeat) jon.leaveSeat(world.scene); else world.scene.attach(jon.root); }
    if (js && jon) { jon.root.position.copy(js.pos); jon.root.rotation.y = js.rotY ?? 0; jon.setMove?.(0); jon.play?.('idle'); }
    controller.setBelly(save.data.belly ?? 0.3);
    camera.setTarget(garfield.root);
    camera.snapBehind(garfield.root.rotation.y);
    const ctx = makeCtx(n, level);
    ctx.setObjectives(level.objectives || []);
    const t0 = performance.now();
    try {
      // Setup is normally synchronous; a slow async one only gets a warning, never abandoned.
      let warn = setTimeout(() => console.warn('[level.setup] still running after 15 s'), 15000);
      await Promise.resolve(level.setup?.(ctx));
      clearTimeout(warn);
    } catch (e) { console.error('[level.setup]', e); sys.lanes['L' + n + ' setup'] = 'ERR ' + e.message; }
    sys.timings = { ...(sys.timings || {}), setup: Math.round(performance.now() - t0) };
    if (token !== levelToken) return;
    ui.hud?.set?.({ belly: controller.belly });
    ui.fade?.(false, 0.35);
    const skipCuts = params.skip || opts.skipOpening;
    audio.music?.('cutscene', { fade: 0.8 });
    if (!skipCuts) {
      try { await L.playOpening?.(ctx); } catch (e) { console.error('[opening]', e); }
      if (token !== levelToken) return;
      try { await level.intro?.(ctx); } catch (e) { console.error('[intro]', e); }
      if (token !== levelToken) return;
    }
    if (director.active) await new Promise((r) => { const iv = setInterval(() => { if (!director.active || token !== levelToken) { clearInterval(iv); r(); } }, 50); });
    if (token !== levelToken) return;
    ui.screen('hud');
    ui.hud?.set?.({ objectives: ctx.objectives, belly: controller.belly });
    camera.follow({ dur: 0.5 });
    controller.lock(false);
    input.enabled = true;
    audio.music?.('sneak', { fade: 1.2 });
    game.state = 'play';
    sys.timings.toPlay = Math.round(performance.now() - t0);
    events.emit('levelStart', { n });
    ctx.started = true;
  }

  async function win() {
    if (winning || !game.level) return;
    winning = true;
    const n = game.levelN, ctx = game.ctx, token = levelToken;
    game.state = 'won';
    controller.lock(true);
    input.enabled = false;
    controller.setBelly(Math.min(1, controller.belly + 0.15));
    save.data.belly = controller.belly;
    save.markDone(n);
    ui.hud?.set?.({ belly: controller.belly });
    audio.music?.('victory', { fade: 0.4 });
    garfield.setExpression?.('happy');
    // Celebrate with the camera swung round to Garfield's face.
    const gp = garfield.root.position, ry = garfield.root.rotation.y;
    // (bestShot keeps the camera out of walls/ceiling, e.g. when he eats on top of the fridge)
    const look = new THREE.Vector3(gp.x, gp.y + 0.3, gp.z);
    const pose = ctx ? bestShot(ctx, look, { dist: 1.4, h: 0.25, prefer: ry, min: 0.8 }) : null;
    // turn him to face the lens (in front of the fridge the best spot is beside him)
    if (pose) garfield.root.rotation.y = Math.atan2(pose.pos.x - gp.x, pose.pos.z - gp.z);
    const end = pose || { pos: new THREE.Vector3(gp.x + Math.sin(ry) * 1.3, gp.y + 0.55, gp.z + Math.cos(ry) * 1.3), look };
    // cut straight to his face and push in (a dolly from the follow cam swept through/behind him)
    camera.cut({ pos: look.clone().lerp(end.pos, 1.15), look: end.look || look, fov: 50 });
    camera.shot({ ...end, fov: 50 }, { dur: 1.4, ease: 'out' });
    await Promise.race([Promise.resolve(garfield.play?.('celebrate', { once: true })), new Promise((r) => setTimeout(r, 2200))]);
    if (token !== levelToken) return;
    const nextUnlocked = n < 10;
    let choice;
    if (n === 10 && ui.chapterComplete) {
      const first = await ui.complete.show({ level: n, food: game.level.food || FOOD[n], nextUnlocked: false, title: game.level.title });
      if (token !== levelToken) return;
      if (first === 'replay') return startLevel(n);
      audio.music?.('fanfare', { fade: 0.3 });
      choice = await ui.chapterComplete.show({ chapter: 'Chapter One', subtitle: 'Food' });
      if (token !== levelToken) return;
      if (choice === 'menu') return menu();
    } else {
      choice = await ui.complete.show({ level: n, food: game.level.food || FOOD[n], nextUnlocked, title: game.level.title });
    }
    if (token !== levelToken) return;
    if (choice === 'next' && nextUnlocked) startLevel(n + 1);
    else if (choice === 'replay') startLevel(n);
    else chapter();
  }

  // ---------- pause ----------
  function pause() {
    if (game.state !== 'play' || game.paused || winning) return;
    if (ui.isBlocking?.() && !ui.pause?.isOpen) return;
    game.paused = true;
    input.clear();
    audio.duck?.(true);
    if (!ui.pause?.isOpen) ui.pause?.open?.();
  }
  function resume() {
    if (!game.paused) return;
    game.paused = false;
    audio.duck?.(false);
  }
  ui.on?.('pause', () => { if (game.state === 'play') { game.paused = true; input.clear(); } });
  ui.on?.('resume', resume);
  ui.on?.('restart', () => { if (game.levelN) startLevel(game.levelN); });
  ui.on?.('exit', () => chapter());
  ui.on?.('skip', () => director.skip());
  input.on('pause', () => {
    if (director.active && game.state !== 'play') return director.skip();
    if (game.paused) return;
    pause();
  });

  ui.on?.('replayIntro', () => intro());
  ui.on?.('resetProgress', () => { save.reset(); controller.setBelly(0.3); menu(); });

  function showActors(on) {
    garfield.root.visible = on;
    if (jon) jon.root.visible = on;
  }

  // ---------- per frame ----------
  let idleT = 0;
  game.update = (dt) => {
    const ctx = game.ctx;
    if (game.state !== 'play' || game.paused) return;
    game.time += dt; if (ctx) ctx.time = game.time;
    if (input.any) { idleT = 0; events.emit('input'); }
    else if ((idleT += dt) > 8) { idleT = 0; events.emit('idle', { secs: 8 }); }
    try { game.level?.update?.(ctx, dt); } catch (e) { console.error('[level.update]', e); }
    save.data.belly = controller.belly;
  };
  game.levelActive = () => ['play', 'won'].includes(game.state) || (director.active && game.state === 'level');

  game.start = async () => {
    if (params.level) return startLevel(+params.level);
    if (!save.data.introSeen && !params.nointro) return intro();
    return menu();
  };
  Object.assign(game, { menu, chapter, intro, startLevel, win, pause, resume, teardownLevel });
  return game;
}

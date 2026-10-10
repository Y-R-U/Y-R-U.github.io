import * as THREE from '../../vendor/three/three.module.js';
import { createEvents } from './events.js';
import { bestShot } from '../game/shots.js';
import { hideCast } from '../game/cast2.js';

const FOOD = { 1: 'steak', 2: 'steak', 7: 'steak', 3: 'lasagna', 5: 'lasagna', 6: 'lasagna', 10: 'lasagna', 4: 'meatloaf', 8: 'meatloaf', 9: 'meatloaf' };
const C2_ICON = { 1: 'steak', 2: 'paw', 3: 'paw', 4: 'meatloaf', 5: 'paw', 6: 'paw', 7: 'claw', 8: 'paw', 9: 'paw', 10: 'paw' };

// Chapter Two ships behind this gate (manager): until true, Ch1-complete saves keep the locked 'Coming Soon' and the
// unlock-anim save flags stay unset. ?ch2=1 overrides for testing.
export const CH2_READY = true;

// Level ids: 1..10 (Chapter One), 'c2:1'..'c2:10', 'fp1', 'fp2', 'arena'.
export function levelInfo(id) {
  if (typeof id === 'number' || /^\d+$/.test(String(id))) { const n = THREE.MathUtils.clamp(+id | 0, 1, 10); return { key: n, ch: 1, n }; }
  const m = /^c2[:\-_](\d+)$/.exec(String(id));
  if (m) { const n = THREE.MathUtils.clamp(+m[1], 1, 10); return { key: 'c2:' + n, ch: 2, n }; }
  if (id === 'fp1') return { key: 'fp1', ch: 1, n: 0, free: true };
  if (id === 'fp2') return { key: 'fp2', ch: 2, n: 0, free: true };
  if (id === 'arena') return { key: 'arena', ch: 0, n: 0, free: true, arena: true };
  return { key: 1, ch: 1, n: 1 };
}

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
  let levelEvents = null, scoped = [], winning = false, levelToken = 0, titleSung = false;

  // ---------- menus ----------
  async function menu() {
    teardownLevel();
    game.state = 'menu';
    audio.music?.(titleSung ? 'menu' : 'title', { fade: 1 });
    titleSung = true;
    showActors(false);
    game.menuOrbit();
    const d = save.data;
    const first = !d.chapterUnlockSeen;
    const chapters = [{ id: 1, title: 'Chapter One', subtitle: 'Food', locked: false, justUnlocked: first }];
    // Chapter Two / Arena only appear once their modules exist (a deploy mid-wave can't expose a half-built chapter)
    const ch2On = CH2_READY || !!params.ch2;
    const ch2Ready = save.ch1Complete && ch2On, arenaReady = !!d.arenaUnlocked && ch2On;
    const ch2New = ch2Ready && !d.ch2MenuSeen, arenaNew = arenaReady && !d.arenaSeen;
    if (ch2Ready) chapters.push({ id: 2, title: 'Chapter Two', subtitle: 'Odie and Lyman', fromTitle: 'Coming Soon', justUnlocked: ch2New });
    if (arenaReady) chapters.push({ id: 'arena', title: 'Arena', kind: 'arena', justUnlocked: arenaNew });
    ui.screen('title');
    const p = ui.menu.show({ see3D: true, chapters });
    if (first || ch2New || arenaNew) {
      await p;
      save.set({ chapterUnlockSeen: true, ...(ch2New ? { ch2MenuSeen: true } : {}), ...(arenaNew ? { arenaSeen: true } : {}) });
    }
  }
  function chapter(ch = game.chapterN || 1) {
    teardownLevel();
    if (ch === 2 && !save.data.ch2IntroSeen) return story(true);
    game.state = 'chapter';
    game.chapterN = ch;
    showActors(false);
    game.menuOrbit();
    const d = save.data;
    ui.screen('chapter');
    if (ch === 2) {
      const c = d.ch2;
      const justN = c.levelsUnlocked > (c.levelUnlockSeen || 0) ? c.levelsUnlocked : 0;
      const levels = Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return { n, icon: C2_ICON[n], locked: n > c.levelsUnlocked, done: c.levelsDone.includes(n), justUnlocked: n === justN };
      });
      const freeNew = save.ch2Complete && !d.ch2FreeSeen;
      ui.chapter.show({ levels, see3D: true, title: 'Chapter Two: Odie and Lyman',
        onPick: (n) => { if (n <= save.data.ch2.levelsUnlocked) startLevel('c2:' + n); },
        side: { label: 'Free Play', locked: !save.ch2Complete, justUnlocked: freeNew, onPick: () => startLevel('fp2') },
        story: { onPick: () => story(false) } });
      if (justN) { c.levelUnlockSeen = justN; save.write(); }
      if (freeNew) save.set({ ch2FreeSeen: true });
      return;
    }
    const justN = d.levelsUnlocked > (d.levelUnlockSeen || 0) ? d.levelsUnlocked : 0;
    const levels = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return { n, food: FOOD[n], locked: n > d.levelsUnlocked, done: d.levelsDone.includes(n), justUnlocked: n === justN };
    });
    const freeNew = save.ch1Complete && !d.ch1FreeSeen;
    ui.chapter.show({ levels, see3D: true, title: 'Chapter One: Food',
      onPick: (n) => { if (n <= save.data.levelsUnlocked) startLevel(n); },
      side: save.ch1Complete ? { label: 'Free Play', lockedLabel: 'Coming Soon', justUnlocked: freeNew, onPick: () => startLevel('fp1') } : { label: 'Coming Soon', locked: true } });
    if (justN) save.set({ levelUnlockSeen: justN });
    if (freeNew) save.set({ ch1FreeSeen: true });
  }

  // Chapter Two's opening story (D15): automatic the first time, '▶ Story' replays it.
  async function story(first) {
    teardownLevel();
    const token = ++levelToken;
    game.state = 'intro';
    ui.screen('none');
    await Promise.race([Promise.resolve(ui.fade?.(true, 0.3)), new Promise((r) => setTimeout(r, 1200))]);
    showActors(true);
    world.exterior?.show(false);
    world.setChapter?.(2);
    world.reset?.();
    const ctx = makeCtx(0, null);
    ctx.levelKey = 'story';
    ui.fade?.(false, 0.5);
    try { await L.playStory?.(ctx); } catch (e) { console.error('[story]', e); }
    try { await ctx.cleanup?.(); } catch {}
    if (token !== levelToken) return;
    if (first) save.set({ ch2IntroSeen: true });
    ui.fade?.(false, 0.4);
    chapter(2);
  }

  // D25: opponent select, no difficulty levels. Harder fights will be new opponents (unlocked by later chapters).
  async function arenaMenu() {
    const v = await ui.opponents?.({ opponents: [
      { id: 'odie', label: 'Odie', icon: 'dog' },
      { id: 'next', locked: true, lockedText: 'Play through chap four to unlock' },
    ] });
    if (v && game.state === 'menu') startLevel('arena', { opponent: v });
  }

  ui.on?.('chapter', (id) => {
    if (game.state !== 'menu') return;
    if (id === 'arena') return arenaMenu();
    chapter(id === 2 ? 2 : 1);
  });
  ui.on?.('back', () => { if (game.state === 'chapter') menu(); });

  // ---------- intro ----------
  async function intro() {
    game.state = 'intro';
    teardownLevel();
    ui.screen('none');
    showActors(true);
    world.exterior?.show(true);
    world.setChapter?.(1);
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
    ui.hud?.set?.({ objectives: [], interactLabel: null, chaseTimer: null, freePlay: null, arenaScore: null, hold: null });
  }

  async function startLevel(id, opts = {}) {
    const info = levelInfo(id);
    const n = info.n;
    const level = L.levels?.[info.key] || (info.ch === 1 ? L.levels?.[n - 1] : null);
    if (!level) { console.error('no level', id); return info.ch === 2 ? chapter(2) : menu(); }
    // fade out first, then tear down: prop/actor resets (chair, vase, pan) happen behind black, never on screen
    const pre = ++levelToken;
    ui.screen('none');
    await Promise.race([Promise.resolve(ui.fade?.(true, 0.25)), new Promise((r) => setTimeout(r, 1200))]);
    if (pre !== levelToken) return;
    teardownLevel();
    hideCast(sys);
    const token = levelToken;
    game.state = 'level'; game.levelN = n; game.levelKey = info.key; game.levelInfo = info; game.level = level; game.time = 0;
    game.levelOpts = opts;
    if (info.ch) game.chapterN = info.ch;
    sys.lastLevel = info.key;
    world.exterior?.show(false);
    world.setChapter?.(info.ch === 2 || info.arena ? 2 : 1);
    world.reset?.();
    const food = level.food || (info.ch === 1 && n ? FOOD[n] : null);
    if (food) world.setFood?.(food);
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
    ctx.levelKey = info.key; ctx.levelInfo = info; ctx.opts = opts;
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
      if (info.ch === 1 && !info.free) try { await L.playOpening?.(ctx); } catch (e) { console.error('[opening]', e); }
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
    // Ch2 can have its own tracks (arena, sneak2) once media lands them; anything missing falls back to 'sneak'
    const names = audio.musicNames || [];
    const want = level.music || (info.ch === 2 ? 'sneak2' : 'sneak');
    ctx.music = names.includes(want) ? want : 'sneak';   // what a chase hands back to (humanAI)
    audio.music?.(ctx.music, { fade: 1.2 });
    game.state = 'play';
    sys.timings.toPlay = Math.round(performance.now() - t0);
    events.emit('levelStart', { n, key: info.key });
    ctx.started = true;
  }

  async function win() {
    if (winning || !game.level) return;
    const info = game.levelInfo || levelInfo(game.levelN);
    if (info.free) return;
    if (info.ch === 2) return win2(info);
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
    else chapter(1);
  }

  function celebrateShot(ctx) {
    const gp = garfield.root.position, ry = garfield.root.rotation.y;
    const look = new THREE.Vector3(gp.x, gp.y + 0.3, gp.z);
    const pose = ctx ? bestShot(ctx, look, { dist: 1.4, h: 0.25, prefer: ry, min: 0.8 }) : null;
    if (pose) garfield.root.rotation.y = Math.atan2(pose.pos.x - gp.x, pose.pos.z - gp.z);
    const end = pose || { pos: new THREE.Vector3(gp.x + Math.sin(ry) * 1.3, gp.y + 0.55, gp.z + Math.cos(ry) * 1.3), look };
    camera.cut({ pos: look.clone().lerp(end.pos, 1.15), look: end.look || look, fov: 50 });
    camera.shot({ ...end, fov: 50 }, { dur: 1.4, ease: 'out' });
  }

  // Chapter Two win: no belly unless the level ate something (level.eats); L10 → Chapter Two complete.
  async function win2(info) {
    winning = true;
    const n = info.n, ctx = game.ctx, token = levelToken, level = game.level;
    game.state = 'won';
    controller.lock(true);
    input.enabled = false;
    if (level.eats) { controller.setBelly(Math.min(1, controller.belly + 0.15)); save.data.belly = controller.belly; ui.hud?.set?.({ belly: controller.belly }); }
    save.markDone2(n);
    audio.music?.('victory', { fade: 0.4 });
    if (!level.noCelebrate) {
      garfield.setExpression?.('happy');
      celebrateShot(ctx);
      await Promise.race([Promise.resolve(garfield.play?.('celebrate', { once: true })), new Promise((r) => setTimeout(r, 2200))]);
    }
    if (token !== levelToken) return;
    const food = level.eats ? (level.food || 'steak') : 'none';
    if (n === 10 && ui.chapterComplete) {
      const first = await ui.complete.show({ level: n, food, nextUnlocked: false, title: level.title });
      if (token !== levelToken) return;
      if (first === 'replay') return startLevel('c2:10');
      audio.music?.('fanfare', { fade: 0.3 });
      const choice = await ui.chapterComplete.show({ chapter: 'Chapter Two', subtitle: 'Odie and Lyman', foods: false, cheer: `${names.garfield || 'Garfield'} out-smarted Odie AND Lyman. Every single time.` });
      if (token !== levelToken) return;
      if (choice === 'replay') return startLevel('c2:10');
      return menu();
    }
    const choice = await ui.complete.show({ level: n, food, nextUnlocked: true, title: level.title });
    if (token !== levelToken) return;
    if (choice === 'next') startLevel('c2:' + (n + 1));
    else if (choice === 'replay') startLevel('c2:' + n);
    else chapter(2);
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
  ui.on?.('restart', () => { if (game.levelKey) startLevel(game.levelKey, game.levelOpts || {}); });
  ui.on?.('exit', () => { if (game.levelInfo?.arena) menu(); else chapter(game.levelInfo?.ch || 1); });
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
    if (!on) hideCast(sys);
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
    if (params.level) return startLevel(params.level);
    if (!save.data.introSeen && !params.nointro) return intro();
    return menu();
  };
  Object.assign(game, { menu, chapter, intro, story, startLevel, win, pause, resume, teardownLevel, arenaMenu });
  return game;
}

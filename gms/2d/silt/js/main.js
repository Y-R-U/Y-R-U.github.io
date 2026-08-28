import { createViewport } from './core/viewport.js';
import { createInput } from './core/input.js';
import { createSave, SAVE_KEYS } from './core/save.js';
import { World, SIM_HZ, DEFAULT_CFG } from './sim/world.js';
import { Bot } from './ai/bot.js';

const q = new URLSearchParams(location.search);
const TEST = q.has('auto') || q.has('soak');
const MAX_STEPS = 5;             // never spiral: drop sim time rather than frames

const canvas = document.getElementById('game');
const view = createViewport(canvas, { cols: DEFAULT_CFG.cols, rows: DEFAULT_CFG.rows });
const save = createSave();

let R = null, UI = null, AUDIO = null, MODES = null, INPUT = null;
let world = null, bot = null, mode = null;
let state = 'boot';
let acc = 0, last = 0, frames = 0, fpsT = 0, fps = 0;
let attractBot = null;

const fail = (msg) => {
  const el = document.getElementById('callout');
  if (el) { el.textContent = msg; el.hidden = false; }
  console.error(msg);
};

/** Lanes land at different times; the game must boot with any of them missing. */
async function loadOptional(path, fallback) {
  try { return await import(path); } catch (e) { console.warn('optional module missing:', path, e.message); return fallback; }
}

async function boot() {
  const gfx = await loadOptional('./gfx/renderer.js', null);
  if (gfx && gfx.createRenderer) {
    const quality = q.get('q') || save.settings.quality || 'auto';
    R = await gfx.createRenderer(canvas, { preserveDrawingBuffer: q.has('preserve'), quality });
  } else {
    const dbg = await import('./core/debugdraw.js');
    R = await dbg.createRenderer(canvas);
    console.warn('SILT: using the PLACEHOLDER Canvas2D renderer — js/gfx/renderer.js not present yet.');
  }
  R.resize(view.w, view.h, view.dpr);
  view.onResize((v) => R.resize(v.w, v.h, v.dpr));

  const audioMod = await loadOptional('./audio/index.js', null);
  AUDIO = audioMod && audioMod.createAudio ? audioMod.createAudio() : {
    unlock: async () => {}, music() {}, sfx() {}, duck() {}, setVolume() {},
  };
  try { AUDIO.setVolume(save.settings.music, save.settings.sfx); } catch (e) {}
  window.addEventListener('pointerdown', () => { AUDIO.unlock && AUDIO.unlock(); }, { once: true });
  window.addEventListener('keydown', () => { AUDIO.unlock && AUDIO.unlock(); }, { once: true });

  MODES = await loadOptional('./modes/index.js', null);

  const uiMod = await loadOptional('./ui/index.js', null);
  if (uiMod && uiMod.createUI) {
    UI = uiMod.createUI({
      onStart: (id, opts) => startGame(id, opts),
      onPause: () => { if (state === 'play') state = 'pause'; },
      onResume: () => { if (state === 'pause') state = 'play'; },
      onQuit: () => startAttract(),
    });
  }

  INPUT = createInput(canvas, view, {
    onMove: (d) => { if (state === 'play' && world) world.moveBy(d); },
    onRotate: () => { if (state === 'play' && world && world.rotate()) AUDIO.sfx('rotate'); },
    onHardDrop: () => { if (state === 'play' && world) { world.hardDrop(); AUDIO.sfx('drop'); } },
    onSoftDrop: (v) => { if (state === 'play' && world) world.softDrop = v; },
  });

  if (!TEST) {
    import('./cloud.js').then((m) => { window.SiltCloud = m; }).catch(() => {});
  }

  if (q.has('auto')) startGame(q.get('mode') || 'flow', { seed: +q.get('seed') || undefined, auto: true });
  else startAttract();

  last = performance.now();
  requestAnimationFrame(frame);
}

function modeList() {
  if (MODES && MODES.MODES) return MODES.MODES;
  return [{ id: 'flow', name: 'FLOW', worldCfg: {} }];
}

function findMode(id) {
  return modeList().find((m) => m.id === id) || modeList()[0];
}

/** 'auto' follows the mode; anything else is an explicit player override. */
function biomeFor(m) {
  const pref = save.settings.biome;
  if (pref && pref !== 'auto') return pref;
  return (m && m.biome) || 'dune';
}

function applyBiome(name) {
  try { R.setBiome && R.setBiome(name); } catch (e) { try { R.setBiome && R.setBiome('dune'); } catch (e2) {} }
  AUDIO.music && AUDIO.music(name, { fade: 900 });
}

function makeWorld(m, opts = {}) {
  const cfg = MODES && MODES.configFor
    ? { ...MODES.configFor(m.id, opts), ...opts }
    : { ...(m.worldCfg || {}), ...opts };
  if (cfg.seed === undefined) cfg.seed = (Math.random() * 1e9) | 0;
  const w = new World(cfg);
  view.setBoard(w.g.cols, w.g.rows);
  return w;
}

const api = {
  get rng() { return world.rng; },
  biome: (n) => applyBiome(n),
  shake: () => {},
  banner: (t) => UI && UI.banner && UI.banner(t),
  setGravity: (x, y) => world.setGravity(x, y),
  sfx: (n, mag) => AUDIO.sfx(n, mag),
};

/**
 * Title screen: the bot plays a random mode behind the buttons.
 *
 * Only modes whose board is the STANDARD width are eligible. The attract screen
 * reloads into a different mode each visit, and a mode with a narrower board
 * letterboxes to a thin column — so the title screen appeared to change width at
 * random between visits, which reads as broken rather than varied. Filtering by
 * the most common width is self-correcting: a mode re-enters the rotation the
 * moment its board matches, without anyone having to maintain a list here.
 */
function attractCandidates() {
  const all = modeList();
  const widthOf = (m) => (MODES && MODES.configFor ? MODES.configFor(m.id, {}).cols : (m.worldCfg && m.worldCfg.cols) || DEFAULT_CFG.cols);
  const tally = new Map();
  for (const m of all) {
    const w = widthOf(m);
    tally.set(w, (tally.get(w) || 0) + 1);
  }
  let standard = DEFAULT_CFG.cols, best = -1;
  for (const [w, n] of tally) if (n > best) { best = n; standard = w; }
  // alchemy is excluded regardless: it is level-driven and has no endless run
  const list = all.filter((m) => m.id !== 'alchemy' && widthOf(m) === standard);
  return list.length ? list : all.filter((m) => m.id !== 'alchemy');
}

function startAttract() {
  const list = attractCandidates();
  mode = list[(Math.random() * list.length) | 0];
  world = makeWorld(mode, { seed: (Math.random() * 1e9) | 0 });
  applyBiome(biomeFor(mode));
  if (MODES && MODES.startMode) MODES.startMode(mode, world, api); else if (mode.onStart) mode.onStart(world, api);
  attractBot = new Bot(world);
  bot = null;
  state = 'attract';
  if (window.SiltCloud && window.SiltCloud.setPlaying) window.SiltCloud.setPlaying(false);
  UI && UI.show('attract');
}

function startGame(id, opts = {}) {
  mode = findMode(id);
  world = makeWorld(mode, opts);
  applyBiome(biomeFor(mode));
  if (MODES && MODES.startMode) MODES.startMode(mode, world, api); else if (mode.onStart) mode.onStart(world, api);
  bot = opts.auto ? new Bot(world) : null;
  attractBot = null;
  state = 'play';
  if (window.SiltCloud && window.SiltCloud.setPlaying) window.SiltCloud.setPlaying(true);
  UI && UI.show('hud');
}

function endGame() {
  state = 'over';
  if (window.SiltCloud && window.SiltCloud.setPlaying) window.SiltCloud.setPlaying(false);
  const isBest = save.recordGame(mode.id, world.score, world.chains, world.cellsCleared);
  const a = world.alchemy;
  const won = !!(a && a.won);
  if (won && a.id) save.recordLevel(a.id, a.stars || 1);
  AUDIO.sfx(won ? 'chain' : 'fail', won ? 800 : undefined);
  if (window.SiltCloud && window.SiltCloud.gameFinished) window.SiltCloud.gameFinished();
  UI && UI.results({
    score: world.score, chains: world.chains, best: save.bestFor(mode.id), isBest,
    mode: mode.name, modeId: mode.id,
    won, alchemy: a || null,
    stars: won ? (a.stars || 1) : 0,
    bestStars: a && a.id ? save.starsFor(a.id) : 0,
  });
}

function simTick() {
  const before = world.chains;
  world.tick();
  if (world.chains > before) AUDIO.sfx('chain', world.lastChainSize);
  // Delegate to the modes lane's reference host loop: world.tick -> onChain ->
  // onTick. onTick running LAST is what lets the scorer diff world.score across
  // a tick boundary, so it stays correct if the engine's own award is retuned.
  if (mode && MODES && MODES.stepMode) MODES.stepMode(mode, world, api, before);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }

  if (state === 'play' || state === 'attract') {
    acc += dt;
    let n = 0;
    while (acc >= 1 / SIM_HZ && n < MAX_STEPS) {
      acc -= 1 / SIM_HZ;
      n++;
      if (state === 'attract') {
        attractBot.update();
        simTick();
        if (world.over) { startAttract(); break; }
      } else {
        if (bot) bot.update();
        simTick();
        if (world.over) { endGame(); break; }
      }
    }
    if (n >= MAX_STEPS) acc = 0;
  }

  if (world && R) R.draw(world, { view, t: now / 1000, biome: save.settings.biome, state });
  if (UI && UI.setHud && state === 'play') {
    UI.setHud({
      score: world.score, chains: world.chains, combo: world.combo,
      next: world.nextPiece, mode: mode.name, modeId: mode.id,
      hud: mode.hud,
      // modes publish their own state; the shell shows what it recognises
      tide: world.tide, hourglass: world.hourglass, alchemy: world.alchemy, zen: world.zen,
    });
  }
}

// ---- test hooks. A lazy getter can never go stale, which a snapshot object can.
Object.defineProperty(window, '__state', {
  get() {
    if (!world) return { boot: true, state };
    const s = world.snapshot();
    const rs = R && R.stats ? R.stats() : {};
    return { ...s, state, fps: +fps.toFixed(1), mode: mode && mode.id, placeholder: !!(R && R.placeholder), gfx: rs };
  },
});
window.__game = {
  get world() { return world; },
  get audio() { return AUDIO; },
  setQuality(v) { try { R.setQuality && R.setQuality(v); } catch (e) {} },
  /** Poke the sand on the attract screen. Goes through grid.set so the ledger stays honest. */
  pour(gx, gy, mat, tint) {
    if (!world) return 0;
    const g = world.g;
    const x = Math.round(gx), y = Math.round(gy), r = 3;
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = x + dx, py = y + dy;
      if (!g.inb(px, py)) continue;
      const i = g.idx(px, py);
      if (g.mat[i] !== 0) continue;
      g.set(i, mat || world.cfg.mat, tint || (1 + (world.rng.int(world.cfg.tints))));
      n++;
    }
    return n;
  },
  get view() { return view; },
  get renderer() { return R; },
  start: startGame, attract: startAttract, save,
  get input() { return INPUT; },
  startLevel(n) { return startGame('alchemy', { level: n | 0 }); },
  step(n = 1) { for (let i = 0; i < n; i++) simTick(); },
  modes: () => modeList().map((m) => m.id),
};

boot().catch((e) => fail('SILT failed to boot: ' + (e && e.message ? e.message : e)));

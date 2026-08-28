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

let ctxRestores = 0;

/**
 * A LOST GPU CONTEXT IS OTHERWISE PERMANENT, SILENT AND INVISIBLE.
 *
 * Backgrounding a tab, a recycled GPU process under memory pressure, a driver
 * reset — all routine on a phone. The renderer stops drawing the moment it
 * sees `webglcontextlost` and nothing ever clears that flag, so the canvas
 * goes black for good while the sim keeps ticking at 60Hz, the HUD keeps
 * updating and the score keeps climbing on a board nobody can see. No error,
 * no callout, and every boot check stays green: the fps counter measures
 * requestAnimationFrame, which has nothing to do with pixels.
 *
 * Rebuilding through the same factory the boot path uses is the whole fix. The
 * renderer holds its GL resources in closure state, so there is nothing to
 * restore piecemeal — the context object is the same one after a restore, and
 * a fresh renderer simply allocates fresh resources on it. The lost renderer's
 * handles die with it.
 *
 * ?ctxbug=1 skips this, so tools/boot.mjs can watch the recovery check go red.
 * Never ship a build that sets it.
 */
function watchContext(gfx) {
  if (!gfx || !gfx.createRenderer || q.has('ctxbug')) return;
  let rebuilding = false;
  canvas.addEventListener('webglcontextrestored', async () => {
    if (rebuilding) return;
    rebuilding = true;
    try {
      const quality = q.get('q') || save.settings.quality || 'auto';
      R = await gfx.createRenderer(canvas, { preserveDrawingBuffer: q.has('preserve'), quality });
      R.resize(view.w, view.h, view.dpr);
      applyBiome(biomeFor(mode));
      ctxRestores++;
    } catch (e) {
      fail('SILT lost the GPU context and could not rebuild it: ' + (e && e.message ? e.message : e));
    } finally { rebuilding = false; }
  });
}

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
  watchContext(gfx);

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
      onQuit: () => { recordAbandoned(); startAttract(); },
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

  // Number.isFinite, not `|| undefined`: ?seed=0 is a legitimate seed and the
  // truthiness test silently handed it a random one instead. A test hook that
  // quietly does something else is worse than one that is missing.
  const qSeed = +q.get('seed');
  if (q.has('auto')) startGame(q.get('mode') || 'flow',
    { seed: q.has('seed') && Number.isFinite(qSeed) ? qSeed : undefined, auto: true });
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

/**
 * Screen shake, which the shipped game did not have.
 *
 * Six modes call api.shake() on a chain or a flip, CONTRACTS.md lists it in
 * both the mode api and the draw opts, and js/gfx/renderer.js implements it
 * fully — but main.js stubbed the api out AND never passed `shake` to draw(),
 * so every one of those calls went nowhere. It looked wired because dev/gfx.html
 * drives it correctly; the only host that never did was the game.
 */
let shakeAmt = 0;

const api = {
  get rng() { return world.rng; },
  biome: (n) => applyBiome(n),
  shake: (v) => { shakeAmt = Math.min(1, shakeAmt + (v || 0)); },
  banner: (t) => UI && UI.banner && UI.banner(t),
  setGravity: (x, y) => world.setGravity(x, y),
  sfx: (n, mag) => AUDIO.sfx(n, mag),
};

/**
 * Title screen: the bot plays a random mode behind the buttons.
 *
 * Only modes whose board fills a comparable share of the screen are eligible.
 * The attract screen reloads into a different mode each visit, and a board with
 * a much narrower aspect letterboxes to a thin column — so the title screen
 * appeared to change width at random between visits, which reads as broken
 * rather than varied.
 *
 * Judged on ASPECT, not column count: what the player sees is the fitted board,
 * and the two are not the same thing. JELLY is 88 columns against everything
 * else's 112 yet fills 99% of the width, because it is also shorter. A column
 * count test excluded it for a difference nobody can see.
 */
function attractCandidates() {
  const all = modeList().filter((m) => m.id !== 'alchemy');   // level-driven, no endless run
  // ?attract=<id> pins the title screen to one mode. A test that has to wait
  // for a random pick to land on the mode it is about is a flaky test.
  const forced = q.get('attract');
  if (forced) { const one = all.filter((m) => m.id === forced); if (one.length) return one; }
  const aspectOf = (m) => {
    const c = MODES && MODES.configFor ? MODES.configFor(m.id, {}) : (m.worldCfg || DEFAULT_CFG);
    return (c.cols || DEFAULT_CFG.cols) / (c.rows || DEFAULT_CFG.rows);
  };
  let widest = 0;
  for (const m of all) widest = Math.max(widest, aspectOf(m));
  const list = all.filter((m) => aspectOf(m) >= widest * 0.85);
  return list.length ? list : all;
}

/**
 * A title screen must never show the sim in trouble.
 *
 * ZEN is a sandbox and a sandbox has no fail state, so its ceiling VENTS: top
 * out and it erases the top 26 rows and plays on. That is right for a player
 * painting in it and wrong on the attract loop, where it reads as a band of
 * sand being sliced flat over and over while the run never ends. The board
 * filling up ENDS an attract run whatever the mode chooses to do about it.
 *
 * Read from the mode's own published state, not from a reach-in: `world.over`
 * cannot be used here because HOURGLASS legitimately clears it during the
 * settle window after every flip, and the title screen would restart on each
 * turn of the glass.
 */
function attractExhausted() {
  return !!(world.zen && world.zen.vented > 0);
}

let attractRuns = 0;   // how many title-screen runs this session; __state.runs
let held = false;      // __game.hold(true): the host loop stops stepping the sim

function startAttract() {
  attractRuns++;
  const list = attractCandidates();
  // Not the mode that just ended, when there is anything else to show. A title
  // screen that reloads into the same mode reads as a game that only has one.
  const pool = mode && list.length > 1 ? list.filter((m) => m.id !== mode.id) : list;
  mode = pool[(Math.random() * pool.length) | 0] || list[0];
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

/**
 * A run you walked away from still happened.
 *
 * `recordGame` only ran from endGame(), so quitting from the pause card threw
 * the whole run away — a playtester finished a session with three runs and
 * fourteen chains recorded against ten runs and thirty-six chains actually
 * played, and read the counters as broken. They were honest about a definition
 * nobody would guess.
 */
function recordAbandoned() {
  if (state !== 'play' && state !== 'pause') return;
  if (!world || !mode || world.over) return;
  if (world.chains === 0 && world.score === 0) return;   // nothing happened; not a run
  save.recordGame(mode.id, world.score, world.chains, world.cellsCleared);
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

/**
 * A tick you can feel — and only if the player asked for one.
 *
 * `settings.haptics` shipped reading "a tick on landing and on a chain" and was
 * wired to nothing: the only vibrate() call in the tree was the toggle's own
 * confirmation buzz, and nothing ever read the flag. iOS Safari has no
 * navigator.vibrate at all, which is why js/ui/settings.js now hides the row
 * rather than offering a switch that cannot do anything.
 */
function haptic(ms) {
  if (save.settings.haptics === false) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not permitted */ }
}

/**
 * WHERE the chain went, in board coordinates the shell can use directly.
 *
 * The payout rises off the band that ignited rather than out of the middle of
 * the screen, and the shell must not go looking in the grid for that — it is a
 * pure function of the sim, so the sim publishes it. Normalised 0..1 across the
 * board, which is the only form that survives a mode changing the grid size.
 *
 * A chain is a connected component spanning both walls, so its centroid is
 * always mid-board horizontally; the y is the part that carries information.
 */
let lastChainAt = null;

function markChain() {
  const cells = world.clears.lastChain;
  if (!cells || !cells.length) { lastChainAt = null; return; }
  const g = world.g;
  let sx = 0, sy = 0;
  for (let k = 0; k < cells.length; k++) { const i = cells[k]; sx += i % g.cols; sy += (i / g.cols) | 0; }
  lastChainAt = {
    x: (sx / cells.length) / g.cols,
    y: (sy / cells.length) / g.rows,
    size: world.lastChainSize,
  };
}

function simTick() {
  const before = world.chains;
  // land() nulls the piece and returns; the next spawn is a whole tick later,
  // so this transition is the landing and cannot be confused with a respawn.
  const hadPiece = !!world.piece;
  world.tick();
  if (hadPiece && !world.piece && !world.over) { AUDIO.sfx('land'); if (state === 'play') haptic(8); }
  if (world.chains > before) {
    AUDIO.sfx('chain', world.lastChainSize);
    if (state === 'play') haptic(Math.min(38, 12 + world.lastChainSize / 90));
    markChain();
  }
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

  if (!held && (state === 'play' || state === 'attract')) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / SIM_HZ && n < MAX_STEPS) {
      acc -= 1 / SIM_HZ;
      n++;
      if (state === 'attract') {
        attractBot.update();
        simTick();
        // ?attractbug=vent leaves the exhausted board running, so tools/boot.mjs
        // can watch this check go red. Never ship a build that sets it.
        if (world.over || (attractExhausted() && !q.has('attractbug'))) { startAttract(); break; }
      } else {
        if (bot) bot.update();
        simTick();
        if (world.over) { endGame(); break; }
      }
    }
    if (n >= MAX_STEPS) acc = 0;
  }

  shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
  // `acc * SIM_HZ` is the fraction of a tick the renderer is between frames.
  // It shipped hardcoded to 1, which is the "always exactly on a tick" lie.
  if (world && R) {
    R.draw(world, { view, t: now / 1000, biome: save.settings.biome, state, shake: shakeAmt },
      Math.max(0, Math.min(1, acc * SIM_HZ)));
  }
  if (UI && UI.setHud && state === 'play') {
    UI.setHud({
      score: world.score, chains: world.chains, combo: world.combo,
      next: world.nextPiece, mode: mode.name, modeId: mode.id,
      hud: mode.hud,
      // modes publish their own state; the shell shows what it recognises
      tide: world.tide, hourglass: world.hourglass, alchemy: world.alchemy, zen: world.zen,
      chain: lastChainAt,
    });
  }
}

// ---- test hooks. A lazy getter can never go stale, which a snapshot object can.
Object.defineProperty(window, '__state', {
  get() {
    if (!world) return { boot: true, state };
    const s = world.snapshot();
    const rs = R && R.stats ? R.stats() : {};
    return { ...s, state, fps: +fps.toFixed(1), mode: mode && mode.id, runs: attractRuns,
      restores: ctxRestores, placeholder: !!(R && R.placeholder), gfx: rs };
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
  /** Re-apply the biome the CURRENT mode wants — what settings' Auto asks for. */
  applyBiome: () => applyBiome(biomeFor(mode)),
  start: startGame, attract: startAttract, save,
  get input() { return INPUT; },
  startLevel(n) { return startGame('alchemy', { level: n | 0 }); },
  /**
   * PARK THE HOST LOOP so a tool can step the sim itself.
   *
   * Without this, a harness that drives the world with step() while the page's
   * own ?auto bot is still running has TWO bots issuing moves into one world.
   * They fight over the same piece and the run is neither the tool's nor the
   * game's — which is exactly what made a star count come out as 2 on one run
   * and 3 on the next from the same seed.
   */
  hold(v) { held = !!v; return held; },
  step(n = 1) { for (let i = 0; i < n; i++) simTick(); },
  modes: () => modeList().map((m) => m.id),
};

boot().catch((e) => fail('SILT failed to boot: ' + (e && e.message ? e.message : e)));

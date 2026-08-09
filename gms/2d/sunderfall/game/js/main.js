import { createRenderer, LAYER } from './gfx/renderer.js';
import { createParticles } from './gfx/particles.js';
import { createAssets } from './gfx/texture.js';
import { createViewport } from './core/viewport.js';
import { createInput } from './core/input.js';
import { createBus } from './core/events.js';
import { createRNG } from './core/rng.js';
import { createLoop, DT } from './core/loop.js';
import { clamp, damp, lerp } from './core/math.js';

export { LAYER, DT };

/* ------------------------------------------------------------------ *
 * Optional modules. Other agents own these; main must boot without
 * them. Each entry lists the export main will use if the file exists.
 * ------------------------------------------------------------------ */
const OPTIONAL = {
  intro: { paths: ['./intro/index.js', './intro/intro.js'], pick: 'runIntro' },
  sim: { paths: ['./sim/index.js', './sim/world.js'], pick: 'createPlayScene' },
  ui: { paths: ['./ui/index.js', './ui/hud.js'], pick: 'createUI' },
  spells: { paths: ['./spells/registry.js'], pick: 'SPELLS' },
  story: { paths: ['./story/script.js'], pick: 'SCRIPT' },
  audio: { paths: ['./core/audio.js'], pick: 'createAudio' },
};

async function tryImport(paths) {
  for (const p of paths) {
    try {
      return await import(p);
    } catch (e) {
      if (!/Failed to fetch|not found|404|Cannot find|Importing a module script failed/i.test(String(e))) {
        console.warn('[main] module', p, 'exists but threw:', e);
      }
    }
  }
  return null;
}

/** Silent no-op audio so nothing has to null-check ctx.audio. */
function stubAudio() {
  const noop = () => {};
  return {
    stub: true, ready: false, muted: false,
    play: noop, sfx: noop, music: noop, stopMusic: noop,
    setVolume: noop, resume: noop, unlock: noop,
  };
}

/* ------------------------------------------------------------------ *
 * Scene machine
 * ------------------------------------------------------------------ */

function createSceneMachine(ctx) {
  const scenes = new Map();
  let current = null;
  let currentName = '';
  let switching = null;

  const m = {
    get name() { return currentName; },
    get current() { return current; },
    register(name, scene) { scenes.set(name, scene); return m; },
    has(name) { return scenes.has(name); },

    async go(name, params) {
      if (switching) await switching;
      const next = scenes.get(name);
      if (!next) { console.error('[scene] unknown:', name); return; }
      switching = (async () => {
        if (current && current.exit) { try { current.exit(); } catch (e) { console.error(e); } }
        current = null;
        currentName = name;
        if (next.enter) await next.enter(ctx, params || {});
        current = next;
        ctx.bus.emit('scene:change', { name, params });
      })();
      await switching;
      switching = null;
    },

    update(dt) { if (current && current.update) current.update(dt); },
    render(alpha) { if (current && current.render) current.render(alpha); },
  };
  return m;
}

/* ------------------------------------------------------------------ *
 * Demo scene — stands in for sim/ until that module lands.
 * ------------------------------------------------------------------ */

function createDemoScene(ctx) {
  const { R, P, input, view, rng } = ctx;
  const cam = { x: 0, y: -230, zoom: 1 };
  const hero = { x: 0, y: -170, vx: 0, vy: 0, px: 0, py: -170 };
  const KEY = { x: 180, y: 40 };
  let t = 0;

  // Static scenery lives in a flat SoA so the render walk allocates nothing.
  const CAP = 12000;
  const b = {
    n: 0,
    x: new Float32Array(CAP), y: new Float32Array(CAP), w: new Float32Array(CAP), h: new Float32Array(CAP),
    rot: new Float32Array(CAP), r: new Float32Array(CAP), g: new Float32Array(CAP),
    bl: new Float32Array(CAP), a: new Float32Array(CAP),
    layer: new Uint8Array(CAP), add: new Uint8Array(CAP), par: new Float32Array(CAP), tex: new Array(CAP),
  };
  const put = (tex, x, y, w, h, rot, r, g, bb, a, layer, add, par) => {
    const i = b.n++;
    b.tex[i] = tex; b.x[i] = x; b.y[i] = y; b.w[i] = w; b.h[i] = h; b.rot[i] = rot;
    b.r[i] = r; b.g[i] = g; b.bl[i] = bb; b.a[i] = a;
    b.layer[i] = layer; b.add[i] = add ? 1 : 0; b.par[i] = par;
  };

  const CREST_N = 80, CX0 = -3400, CDX = 6800 / (CREST_N - 1);
  const crest = new Float32Array(CREST_N);
  const GA = [0.225, 0.205, 0.19, 1], GB = [0.10, 0.095, 0.105, 1];

  function tree(x, gy, h, tw, layer, par, tint, cr, cn) {
    const lean = rng.range(-0.08, 0.08);
    const toKey = KEY.x > x ? 1 : -1;
    const rim = [tint[0] * 2.6 + 0.06, tint[1] * 2.1 + 0.04, tint[2] * 1.6 + 0.03];
    let px = x, py = gy, ang = lean;
    for (let i = 0; i < 8; i++) {
      const k = i / 8;
      const sh = (h / 8) * 1.28;
      const wd = lerp(tw, tw * 0.34, k * k * 0.7 + k * 0.3);
      ang += rng.range(-0.055, 0.055);
      const nx = px + Math.sin(ang) * sh, ny = py - Math.cos(ang) * sh;
      const mx = (px + nx) * 0.5, my = (py + ny) * 0.5;
      put(R.white, mx, my, wd, sh * 1.1, ang, tint[0] * 0.72, tint[1] * 0.72, tint[2] * 0.8, 1, layer, false, par);
      put(R.white, mx + toKey * wd * 0.4, my, wd * 0.2, sh * 1.1, ang, rim[0], rim[1], rim[2], 0.55, layer, false, par);
      px = nx; py = ny;
    }
    put(R.blob, x, gy, tw * 3, tw * 1.1, 0, tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.7, 0.9, layer, false, par);
    const cx = x + Math.sin(lean) * h * 0.94, cy = gy - h * 0.99;
    for (let i = 0; i < cn; i++) {
      const a2 = rng.angle(), rad = Math.pow(rng.next(), 0.55);
      const dx = Math.cos(a2) * rad * cr * 1.5;
      const dy = Math.sin(a2) * rad * cr * 0.85 - rad * cr * 0.25;
      const s = cr * rng.range(0.42, 0.85) * (1 - rad * 0.3);
      const k = rng.range(0.85, 1.15) * (1 - (dy / (cr * 0.9)) * 0.5);
      put(R.blob, cx + dx, cy + dy, s * rng.range(1.1, 1.7), s, rng.angle(),
        tint[0] * k, tint[1] * k, tint[2] * k * 1.05, rng.range(0.7, 1), layer, false, par);
    }
  }

  function build() {
    b.n = 0;
    for (let i = 0; i < CREST_N; i++) {
      const x = CX0 + i * CDX;
      crest[i] = 130 + Math.sin(x * 0.0016) * 26 + Math.sin(x * 0.0053 + 2.1) * 14;
    }
    for (let i = 0; i < 220; i++) {
      const s = rng.range(2, 7);
      put(R.blob, rng.range(-3000, 3000), rng.range(-1100, -320), s, s, 0,
        rng.range(0.7, 1), rng.range(0.8, 1), 1, rng.range(0.2, 0.9), LAYER.SKY, true, 0.05);
    }
    for (let i = 0; i < 34; i++) {
      const s = rng.range(160, 360);
      put(R.blob, rng.range(-3400, 3400), -250 + rng.range(-70, 40), s * 2.4, s * 1.2, 0,
        0.30, 0.38, 0.56, rng.range(0.35, 0.7), LAYER.BG_FAR, false, 0.12);
    }
    for (let i = 0; i < 40; i++) {
      tree(rng.range(-3400, 3400), rng.range(-195, -150), rng.range(200, 285), rng.range(14, 22),
        LAYER.BG_FAR, 0.20, [0.26, 0.33, 0.48], rng.range(52, 84), 10);
    }
    for (let i = 0; i < 28; i++) {
      tree(rng.range(-3000, 3000), rng.range(-95, -45), rng.range(330, 440), rng.range(26, 40),
        LAYER.BG_MID, 0.42, [0.115, 0.165, 0.265], rng.range(92, 132), 16);
    }
    for (let i = 0; i < 16; i++) {
      tree(rng.range(-2600, 2600), rng.range(0, 46), rng.range(470, 600), rng.range(42, 66),
        LAYER.BG_NEAR, 0.72, [0.062, 0.088, 0.155], rng.range(140, 195), 22);
    }
    for (let i = 0; i < 130; i++) {
      const s = rng.range(110, 400);
      put(R.blob, rng.range(-3000, 3000), rng.range(150, 400), s * 2, s * 0.55, 0,
        0.14, 0.13, 0.135, rng.range(0.35, 0.85), LAYER.TERRAIN, false, 1);
    }
    for (let i = 0; i < 850; i++) {
      const hh = rng.range(38, 130);
      put(R.streak, rng.range(-2800, 2800), rng.range(95, 420) - hh * 0.44, hh * 0.24, hh,
        rng.range(-0.5, 0.5), 0.18, 0.25, 0.15, rng.range(0.55, 1), LAYER.TERRAIN_FRONT, false, 1);
    }
    for (const fx of [-2100, -1350, -700, 620, 1280, 1980]) {
      tree(fx + rng.range(-90, 90), rng.range(300, 380), rng.range(1500, 2000), rng.range(115, 180),
        LAYER.FG_OCCLUDE, 1.35, [0.055, 0.062, 0.09], rng.range(280, 380), 12);
    }
    for (let i = 0; i < 60; i++) {
      const s = rng.range(130, 330);
      put(R.blob, rng.range(-2800, 2800), rng.range(-900, -680), s * 1.7, s, rng.angle(),
        0.05, 0.058, 0.085, rng.range(0.7, 1), LAYER.FG_OCCLUDE, false, 1.35);
    }
  }

  function burst(x, y) {
    R.fx.shockwave(x, y, 0.95);
    R.fx.shake(0.5, 0.5);
    R.fx.chroma(0.8, 0.3);
    R.fx.flash(1.0, 0.6, 0.28, 0.18, 0.1);
    R.fx.timeScale(0.06, 0.055);
    P.emit({
      x, y, count: 240, speed: 820, speedVar: 540, life: 0.78, lifeVar: 0.4,
      size: 24, sizeEnd: 2, color: [1, 0.9, 0.55, 1], color2: [1, 0.2, 0.05, 0],
      gravity: 1000, drag: 2.3, add: true, glow: 0.5, stretch: 1.4, collide: true,
    });
    P.emit({
      x, y, count: 70, speed: 220, speedVar: 180, life: 1.7, lifeVar: 0.8,
      size: 50, sizeEnd: 220, color: [0.5, 0.44, 0.42, 0.36], color2: [0.18, 0.19, 0.24, 0],
      gravity: -70, drag: 1.4, fadeIn: 0.12,
    });
  }

  return {
    async enter() {
      build();
      // calibrated in engine-test.html — see HANDOFF for why these numbers
      R.setAmbient(0.095, 0.125, 0.215);
      R.setHaze(0.24, 0.34, 0.54);
      R.setClearColor(0.030, 0.038, 0.070);
      R.fx.vignette(0.70);
      R.fx.bloom = 0.62;
      R.fx.threshold = 0.85;
      R.fx.contrast = 1.14;
      R.fx.saturation = 1.06;
      R.setLayer(LAYER.SKY, { haze: 0, shade: 0.35 });
      R.setLayer(LAYER.BG_FAR, { haze: 0.34, response: 0.14 });
      R.setLayer(LAYER.BG_MID, { haze: 0.15, response: 0.34 });
      R.setLayer(LAYER.BG_NEAR, { haze: 0.07, response: 0.70 });
      R.setLayer(LAYER.FG_OCCLUDE, { response: 0.28, mul: [0.42, 0.46, 0.58] });
      P.setTerrainQuery((x, y) => y > 132);
      view.setCamera(cam);
    },

    update(dt) {
      t += dt;
      hero.px = hero.x; hero.py = hero.y;
      const ax = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      const ay = (input.held('down') ? 1 : 0) - (input.held('up') ? 1 : 0);
      hero.vx = damp(hero.vx, ax * 620, 0.0006, dt);
      hero.vy = damp(hero.vy, ay * 520, 0.0006, dt);
      hero.x += hero.vx * dt;
      hero.y = clamp(hero.y + hero.vy * dt, -820, 40);
      cam.x = damp(cam.x, hero.x, 0.0015, dt);
      cam.y = damp(cam.y, hero.y - 60, 0.004, dt);
      input.setAimOrigin(hero.x, hero.y);

      if (input.pressed('cast') || input.pressed('jump')) burst(input.aim.x, input.aim.y);

      P.emit({
        x: KEY.x + rng.spread(22), y: KEY.y - 10, count: 2, vx: 0, vy: -1, vSpread: 0.55,
        speed: 130, speedVar: 90, life: 1.7, lifeVar: 0.9, size: 9, sizeEnd: 1,
        color: [1, 0.78, 0.36, 1], color2: [1, 0.22, 0.05, 0],
        gravity: -110, drag: 0.9, add: true, glow: 0.4,
      });
      P.update(dt);
    },

    render(alpha) {
      const hx = lerp(hero.px, hero.x, alpha);
      const hy = lerp(hero.py, hero.y, alpha);
      R.begin(cam);

      const skyTop = [0.042, 0.058, 0.145, 1];
      const skyMid = [0.105, 0.145, 0.275, 1];
      const skyLow = [0.205, 0.25, 0.345, 1];
      const skyFloor = [0.14, 0.155, 0.205, 1];
      const L = -4600, Rr = 4600;
      const band = (y0, c0, y1, c1) => {
        R.tri(L, y0, c0, Rr, y0, c0, Rr, y1, c1, LAYER.SKY, { parallax: 0.05 });
        R.tri(L, y0, c0, Rr, y1, c1, L, y1, c1, LAYER.SKY, { parallax: 0.05 });
      };
      band(-2400, skyTop, -840, skyMid);
      band(-840, skyMid, -140, skyLow);
      band(-140, skyLow, 1400, skyFloor);

      for (let i = 0; i < CREST_N - 1; i++) {
        const x0 = CX0 + i * CDX, x1 = x0 + CDX;
        R.tri(x0, crest[i], GA, x1, crest[i + 1], GA, x1, 1100, GB, LAYER.TERRAIN);
        R.tri(x0, crest[i], GA, x1, 1100, GB, x0, 1100, GB, LAYER.TERRAIN);
      }

      for (let i = 0; i < b.n; i++) {
        R.spriteRaw(b.tex[i], 0, 0, 1, 1, b.x[i], b.y[i], b.w[i], b.h[i], b.rot[i],
          b.r[i], b.g[i], b.bl[i], b.a[i], b.layer[i], b.add[i] === 1, b.par[i]);
      }

      const fl = 0.86 + Math.sin(t * 13.3) * 0.08 + Math.sin(t * 27.1) * 0.05;
      for (let i = 0; i < 5; i++) {
        const k = i / 5;
        const wob = Math.sin(t * (7 + i * 2.3) + i) * 14 * (1 - k);
        R.sprite({
          tex: R.blob, x: KEY.x + wob, y: KEY.y - 40 - k * 130 * fl,
          w: (150 - k * 90) * fl, h: (210 - k * 110) * fl,
          r: 1, g: lerp(0.72, 0.35, k), b: lerp(0.32, 0.08, k), a: lerp(0.95, 0.35, k),
          layer: LAYER.FX, add: true,
        });
      }
      R.sprite({ tex: R.blob, x: KEY.x, y: KEY.y + 44, w: 320, h: 90, r: 0.09, g: 0.06, b: 0.05, a: 0.9, layer: LAYER.ACTORS });

      P.render();

      R.sprite({ tex: R.blob, x: hx, y: hy, w: 170, h: 170, r: 0.6, g: 0.82, b: 1, a: 0.7, layer: LAYER.FX, add: true });
      R.sprite({ tex: R.disc, x: hx, y: hy, w: 30, h: 30, r: 1, g: 1, b: 1, a: 1, layer: LAYER.FX, add: true });

      R.light({ x: KEY.x, y: KEY.y - 40, radius: 1250, r: 1, g: 0.68, b: 0.38, intensity: 2.3, flicker: 0.30 });
      R.light({ x: KEY.x, y: KEY.y - 10, radius: 420, r: 1, g: 0.88, b: 0.62, intensity: 2.2, flicker: 0.20 });
      R.light({ x: hx, y: hy, radius: 700, r: 0.55, g: 0.8, b: 1, intensity: 1.4, flicker: 0.06 });
      R.light({ x: cam.x + 700, y: -430, radius: 2100, r: 0.48, g: 0.62, b: 1, intensity: 0.30, soft: 1, parallax: 0.05 });

      R.end();
    },

    exit() { P.clear(); },
  };
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  const canvas = document.getElementById('game');
  const bootEl = document.getElementById('boot');
  const noteEl = document.getElementById('boot-note');
  const note = (s) => { if (noteEl) noteEl.textContent = s; };

  const bus = createBus();
  const view = createViewport(canvas, bus);

  let R;
  try {
    R = await createRenderer(canvas);
  } catch (e) {
    console.error(e);
    if (noteEl) { noteEl.className = 'boot-note err'; noteEl.textContent = 'This browser can’t run SUNDERFALL — it needs WebGL2.'; }
    return;
  }

  const P = createParticles(R);
  const input = createInput(canvas, view, bus);
  const rng = createRNG('sunderfall');
  const assets = createAssets(R.gl, '');

  const ctx = {
    R, P, input, view, bus, rng, assets,
    audio: stubAudio(),
    LAYER,
    DT,
    dom: {
      stage: document.getElementById('stage'),
      ui: document.getElementById('ui-root'),
      intro: document.getElementById('intro-root'),
    },
    debug: new URLSearchParams(location.search).has('debug'),
  };

  function applyView() {
    R.resize(view.w, view.h, view.dpr, view.worldW);
  }
  applyView();
  view.onResize(applyView);

  const scenes = createSceneMachine(ctx);
  ctx.scenes = scenes;
  ctx.go = (n, p) => scenes.go(n, p);
  // published early so test harnesses can inspect the engine during the intro
  window.__sunderfall = ctx;

  note('loading modules');
  const mods = {};
  for (const key of Object.keys(OPTIONAL)) {
    mods[key] = await tryImport(OPTIONAL[key].paths);
  }
  ctx.mods = mods;

  if (mods.audio && mods.audio.createAudio) {
    try { ctx.audio = await mods.audio.createAudio(ctx); } catch (e) { console.warn('[main] audio failed', e); }
  }
  if (mods.spells && mods.spells.SPELLS) ctx.spells = mods.spells.SPELLS;
  if (mods.story) ctx.story = mods.story;

  let ui = null;
  if (mods.ui && mods.ui.createUI) {
    try { ui = await mods.ui.createUI(ctx); } catch (e) { console.warn('[main] ui failed', e); }
  }
  ctx.ui = ui;

  let playScene = null;
  if (mods.sim && mods.sim.createPlayScene) {
    try { playScene = await mods.sim.createPlayScene(ctx); } catch (e) { console.error('[main] sim failed, using demo', e); }
  }
  scenes.register('play', playScene || createDemoScene(ctx));

  /* The death screen's two buttons emitted these and nothing listened, so the
     only way out of a dead run was reloading the page. `play` rebuilds the
     whole level in enter(), so re-entering it IS the restart. */
  let restarting = false;

  /* The first time the ward is used, it explains itself — otherwise "Again"
     silently hands back two thirds of a run and the player never learns that
     the old man paid for it. Once per session; the ward speaks from around the
     boy, which is where it lives. */
  let wardTold = false;
  const WARD_LINES = [
    { at: 1400, who: 'vayne', text: 'I bound a ward to your life, boy. Before the rest of me went.' },
    { at: 5200, who: 'vayne', text: 'It gives back what it can. Not all of it. Never all of it.' },
    { at: 9200, who: 'rook', text: 'You could have led with that.' },
  ];
  function tellWard() {
    if (wardTold) return;
    wardTold = true;
    for (const l of WARD_LINES) {
      setTimeout(() => {
        const p = ctx.world && ctx.world.player;
        if (p && p.alive && scenes.name === 'play') bus.emit('bark', { who: l.who, text: l.text, priority: 3 });
      }, l.at);
    }
  }

  bus.on('ui:restart', async () => {
    if (restarting) return;
    restarting = true;
    try {
      if (ui && ui.reset) ui.reset();
      // Vayne's ward (DESIGN §5, revised): spells and their ranks survive, and
      // he keeps two thirds of his levels with a floor of 3.
      const sys = ctx.spellSystem;
      if (sys && sys.softReset) sys.softReset();
      R.fx.timeScale(1, 0);
      await scenes.go('play');
      tellWard();
    } finally { restarting = false; }
  });
  /* The other death button. It used to reload the page, which happened to be a
     total wipe — but nothing said so, so the two buttons read as the same thing
     with different flavour text. Same wipe, done in place: no reload, no second
     asset load, and the label now says what it costs. */
  bus.on('ui:quit', async () => {
    if (restarting) return;
    restarting = true;
    try {
      if (ui && ui.reset) ui.reset();
      const sys = ctx.spellSystem;
      if (sys && sys.hardReset) sys.hardReset();
      else if (sys && sys.softReset) sys.softReset();
      R.fx.timeScale(1, 0);
      await scenes.go('play');
    } finally { restarting = false; }
  });

  scenes.register('gameover', {
    async enter() { bus.emit('player:died', {}); },
    update() {}, render() { R.begin({ x: 0, y: 0, zoom: 1 }); R.end(); },
  });

  const loop = createLoop({
    getTimeScale: () => R.fx.getTimeScale(),
    update(dt) {
      input.update();
      // `ui:pause` was emitted and nobody listened, so no overlay has ever
      // actually stopped the world: the pause menu, the spell offer and the
      // death screen all ran the sim underneath themselves. Choosing a spell
      // mid-fight got the player killed while they read the cards.
      if (!(ui && ui.blocked)) scenes.update(dt);
      if (ui && ui.update) ui.update(dt);
    },
    render(alpha, real) {
      R.tick(real);
      scenes.render(alpha);
      if (ui && ui.render) ui.render(alpha);
    },
  });
  ctx.loop = loop;

  // the intro owns its own canvas and resolves when done or skipped
  const params = new URLSearchParams(location.search);
  const skipIntro = params.has('nointro') || params.get('scene') === 'play';
  if (!skipIntro && mods.intro && mods.intro.runIntro) {
    try {
      ctx.dom.intro.classList.add('active');
      bootEl.classList.add('gone');
      let bail;
      const watchdog = new Promise((res) => {
        // a broken intro must never brick the game; 90s is far past any real one
        bail = setTimeout(() => { console.warn('[main] intro watchdog fired'); res(); }, 90000);
      });
      await Promise.race([
        mods.intro.runIntro(ctx.dom.intro, { skip: () => bus.emit('intro:done', { skipped: true }) }),
        watchdog,
      ]);
      clearTimeout(bail);
      bus.emit('intro:done', {});
    } catch (e) {
      console.warn('[main] intro failed', e);
    } finally {
      ctx.dom.intro.classList.remove('active');
      ctx.dom.intro.replaceChildren();
    }
  }

  await scenes.go(params.get('scene') || 'play');
  loop.start();

  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 600);

  window.__sunderfall = ctx;
  console.info('[sunderfall] engine up —', R.hasFloat ? 'HDR targets' : 'LDR fallback',
    '| worldW', view.worldW, '|', view.mode);
}

boot().catch((e) => {
  console.error('[sunderfall] boot failed', e);
  const n = document.getElementById('boot-note');
  if (n) { n.className = 'boot-note err'; n.textContent = String(e && e.message || e); }
});

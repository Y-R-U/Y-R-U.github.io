/**
 * Boot, `ctx` assembly and the scene machine (§6) — and, at P10, a game.
 *
 * The eight scenes of §6 are `boot title hangar brief play pause debrief map`.
 * `play` is `js/modes/story.js` driving the shipping sim with a real thumb on
 * it; every other scene is painted chrome over the same world. Nothing here
 * re-implements a flight model, an AI, a crate, a camera or a HUD element —
 * `tools/pages/hud.html` proved that arrangement and this scene is its
 * successor, which is the only arrangement in which what you are looking at is
 * what the gates measured (D72).
 *
 * `ctx.player` and `ctx.entities` remain the seam the harness and the
 * orientation gate drive; the play scene fills them from the run.
 *
 * Query switches, all off by default:
 *   ?scene=          start somewhere other than `boot`
 *   ?level=a1-04     which level `play` loads
 *   ?nosave          save reads and writes off (every gate passes it)
 *   ?debug           the §8.2 overlay, wired to window.__state
 *   ?auto=bot        the shipping AI flies the player — for a headless gate run
 *   ?sky=0           flat clear colour instead of P3's painted sky
 *   ?seed= ?quality= ?slew= ?margin= ?track= ?frame= ?enforce=0 ?inputbug=
 */

import { createRenderer, LAYER } from './gfx/renderer.js';
import { createParticles } from './gfx/particles.js';
import { createAssets, makePaper } from './gfx/texture.js';
import { createSky, loadRamps } from './gfx/sky.js';
import { createClouds } from './gfx/clouds.js';
import { planeRig } from './gfx/rigs/plane.js';
import { makeCrateRig } from './gfx/rigs/crate.js';
import { makeCanopyRig, breathe } from './gfx/rigs/canopy.js';

import { createBus } from './core/events.js';
import { createViewport } from './core/viewport.js';
import { createCamera } from './core/camera.js';
import { createInput } from './core/input.js';
import { createRNG } from './core/rng.js';
import { createLoop, DT } from './core/loop.js';
import { createQuality } from './core/quality.js';
import { createSave } from './core/save.js';
import { createDebug } from './core/debug.js';
import { createAudio } from './core/audio.js';
import { bandIdAt, altitudeFeet } from './core/bands.js';
import { M_PER_WU } from './core/math.js';

import { createLevel } from './data/level.js';

import { framingContributions } from './sim/entities.js';
import { HULL_M } from './sim/damage.js';
import { leadPoint, offNose, GUNS } from './sim/weapons.js';

import { createHUD, hudState } from './ui/hud.js';
import { createScreens, SCREEN_TIMING } from './ui/screens.js';
import { INK } from './ui/theme.js';

import { createStoryRun, STORY } from './modes/story.js';

export const SCENES = ['boot', 'title', 'hangar', 'brief', 'play', 'pause', 'debrief', 'map'];

const HULL_WU = HULL_M / M_PER_WU;
/** The rig def is ~66 of its own units nose to tail; R-10's drawn hull is 66 wu. */
const RIG_SCALE = HULL_WU / 66;

/**
 * The levels P9 shipped, in campaign order. There are four of a hundred and
 * they are NOT contiguous, which is why the save carries a list of unlocked ids
 * rather than a high-water index. P11 replaces this with the act files' own
 * `levels` arrays once the other 96 exist.
 */
const CAMPAIGN = ['a1-01', 'a1-04', 'a1-12', 'a2-05'];

const LIGHTS = [{ dx: -0.55, dy: -0.84, intensity: 1.0, r: 1.00, g: 0.93, b: 0.78 }];
const RAMP = { key: '#C9CEC4', fill: '#7E8A8C', shadow: '#2E3639', accent: '#C2582A' };

export async function boot(opts = {}) {
  const q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const canvas = document.getElementById('gl');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');

  const bus = createBus();
  const R = await createRenderer(canvas, { preserveDrawingBuffer: q.has('preserve') });
  const P = createParticles(R);
  const view = createViewport(canvas, bus);
  const save = createSave(bus);
  save.load();

  const s = save.data.settings;
  const cam = createCamera(view, {
    bias: s.zoomBias,
    // falsification switches, off by default — see docs/P2_NOTES.md
    slew: q.get('slew') || undefined,
    margin: q.get('margin') || undefined,
    track: q.get('track') || undefined,
    frame: q.get('frame') || undefined,
    enforce: q.get('enforce') !== '0',
  });
  view.setCamera(cam);

  const input = createInput(canvas, view, bus, { invertPitch: s.invertPitch, holdToFly: s.holdToFly, bug: q.get('inputbug') || '' });
  input.installDefaultZones();

  const quality = createQuality(bus, { low: s.lowDetail || q.get('quality') === 'low' });
  const rng = createRNG(q.get('seed') || 'kitehawk');
  /**
   * D7's control. `?audiobug=await` ships the FORBIDDEN version of the audio
   * boot: it waits for `assets/audio/manifest.json` and refuses to continue
   * without it. With the folder absent — which is the shipped state — that arm
   * must fail to reach `title`, which is what makes "it boots with the folder
   * renamed away" a measurement rather than a restatement of the obvious.
   */
  if (q.get('audiobug') === 'await') {
    const r = await fetch('assets/audio/manifest.json');
    if (!r.ok) throw new Error('audiobug=await: no assets/audio/manifest.json');
    await r.json();
  }
  const audio = await createAudio({ audio: { disabled: q.has('noaudio') } });
  audio.setVolume('master', s.volume.master);

  const assets = createAssets(R.gl, '');

  R.setGrain(makePaper(R.gl), 1 / 256, 0.15);
  R.fx.gLoadRebase();

  const scenes = Object.create(null);
  let current = null, currentName = '';

  const ctx = {
    R, P, input, view, cam, bus, rng, audio, save, quality, assets,
    LAYER, DT,
    dom: { stage, ui },
    debug: q.has('debug'),
    player: null,        // the play scene owns this; the harness sets it directly
    entities: [],
    scenes,
    get scene() { return currentName; },
    go,
  };

  /**
   * `input.releaseAll()` on EVERY scene change is §6's rule and the reason is
   * that a latched bit outliving its owner is how a scene change hands the next
   * scene a thumb that is not there.
   */
  async function go(name, params) {
    const next = scenes[name];
    if (!next) { console.warn('[main] no such scene: ' + name); return; }
    if (current && current.exit) current.exit();
    input.releaseAll();
    input.clearZones();
    /**
     * The stick zone is reinstalled on EVERY scene, menus included, and that is
     * deliberate rather than lazy: `input.onTap` fires whether or not the touch
     * landed in a zone, so a menu still gets its taps, and `tools/touch.mjs`
     * (15 asserts) and `tools/orient.mjs` (7) drive `index.html` at whatever
     * scene it happens to be in. A scene machine that quietly removed the stick
     * would turn both of those suites green-by-vacuum.
     */
    input.installDefaultZones();
    currentName = name;
    current = next;
    bus.emit('scene:change', { name, params });
    if (next.enter) await next.enter(ctx, params);
  }

  /* --- the flat, JSON-safe snapshot every later gate asserts on (§8.2) --- */
  const state = {
    tick: 0, fps: 0, frameMs: 0,
    drawCalls: 0, sprites: 0, tris: 0, particles: 0, lights: 0,
    scene: '',
    view: { mode: 'portrait', w: 0, h: 0, dpr: 1, worldW: 0, worldH: 0, scale: 1 },
    cam: { x: 0, y: 0, zoom: 1, zoomTarget: 1, reason: '', boxW: 0, boxH: 0, members: 0 },
    input: { axisX: 0, axisY: 0, stickActive: false, stickR: 0, source: 'keyboard' },
    entities: { total: 0, hostile: 0, crates: 0 },
    player: { alive: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, angle: 0, band: 'mud', altFt: 0 },
    bands: {},
    audio: { ready: false, available: false, voices: 0, oneShots: 0 },
    quality: { low: false },
    story: { level: '', t: 0, progress: 0, kills: 0, crates: 0, over: false, result: '' },
    errors: [],
  };
  window.__state = state;

  const pushErr = (m) => { if (state.errors.length < 64) state.errors.push(String(m)); };
  window.addEventListener('error', (e) => pushErr(e.message || e));
  window.addEventListener('unhandledrejection', (e) => pushErr((e.reason && e.reason.message) || e.reason));

  /* ------------------------------------------------------------ the sky --- */
  /**
   * P3's painted sky, from the shipping modules. It is loaded ONCE at boot and
   * shared by every scene: a menu over a flat rectangle is a menu nobody has
   * looked at, and the title screen is the first thing a player sees.
   *
   * Nothing here reaches a CDN (D6). Every asset is same-origin and every one of
   * them is allowed to be missing — `assets/audio/` empty is a stated
   * requirement (D7) and the atlases are treated the same way, because a boot
   * that hangs on a 404 is the failure mode this rule exists to prevent.
   */
  let sky = null, clouds = null, skyAct = 1;
  if (q.get('sky') !== '0') {
    try {
      const man = await fetch('assets/atlas.json').then((r) => r.json());
      const ramps = await loadRamps(R, 'assets/');
      const loadImg = (src) => new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src;
      });
      const tex = async (src, o) => R.createTexture(await loadImg('assets/' + src), o || {});
      const a = { luts: ramps.luts, strips: {} };
      for (const [k, at] of Object.entries(man.atlases))
        try { a[k] = { ...at, tex: await tex(at.image) }; } catch { console.warn('[boot] missing atlas', k); }
      for (const [k, sp] of Object.entries(man.strips))
        try { a.strips[k] = { ...sp, tex: await tex(sp.image, { repeat: false }) }; } catch { console.warn('[boot] missing strip', k); }
      try { R.setGrain(await tex('paper.png', { repeat: true }), 2.1, 0.30); } catch { /* the runtime paper stands in */ }
      Object.assign(assets, a);
      sky = createSky(R, a);
      clouds = createClouds(R, a, { seed: 7 });
      sky.setAct(1, 'd');
    } catch (e) { console.warn('[boot] sky unavailable, falling back to flat', e); sky = null; }
  }
  if (!sky) {
    R.setGrain(makePaper(R.gl, 256, 3), 1 / 128, 0.22);
    R.setAmbient(0.62, 0.65, 0.72);
    R.setClearColor(0.44, 0.54, 0.64);
  }
  R.fx.bloom = 0;

  function drawWorldBackdrop() {
    if (sky) {
      const b = sky.update(cam.x, cam.y, cam.zoom, DT);
      sky.drawSky();
      clouds.drawMid(cam.x, cam.y, b.cloudMid, sky.hazeRGB(), Math.min(0.85, b.haze * 0.9));
      sky.drawGround(cam.x, cam.y, skyAct);
      clouds.drawNear(cam.x, cam.y, b.cloudNear, b.fg);
    } else {
      R.poly([-40000, 0, 40000, 0, 40000, 4000, -40000, 4000], [0.30, 0.29, 0.24], LAYER.GROUND);
    }
  }

  /* ------------------------------------------------------- the level data - */

  const levelCache = new Map();
  async function loadLevel(id) {
    if (levelCache.has(id)) return levelCache.get(id);
    const raw = await fetch(`data/levels/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`data/levels/${id}.json -> HTTP ${r.status}`);
      return r.json();
    });
    const lvl = createLevel(raw);
    levelCache.set(id, lvl);
    return lvl;
  }

  /* ---------------------------------------------------------- the chrome -- */

  const screens = createScreens(ctx, {});

  /**
   * Where the camera sits when nothing is flying.
   *
   * It matters more than it sounds: `cam.update(null)` leaves the camera at the
   * world origin, which is the GROUND, so the first build of the title screen
   * was a menu over a trench and a black lower half. The menus park it in Belt —
   * the act's home band — and drift it eastward at a fraction of cruise, so the
   * painted sky and the parallax are doing something behind the type.
   */
  /**
   * `baseY -3400` (510 m, upper Deck) and act 2's palette are chosen by LOOKING
   * at the six candidates in `shots/p10/sky/`, not picked: act 1 at Belt is a
   * flat grey wash with no cloud in the frame at all — correct for the act, and
   * a bad first thing to see — while act 2 at 510 m puts the painted cumulus
   * deck behind the type. The menu backdrop is not a mission and does not have
   * to be the mission's act.
   */
  const MENU_CAM = { x: 0, y: -3400, baseY: -3400, vx: 26, vy: 0, angle: 0, hull: HULL_WU };
  const menuSky = () => { skyAct = 2; if (sky) sky.setAct(2, 'd'); };
  function driftMenuCam(dt) {
    MENU_CAM.x += MENU_CAM.vx * dt;
    MENU_CAM.y = MENU_CAM.baseY + Math.sin(MENU_CAM.x / 900) * 90;
    ctx.player = MENU_CAM;
  }
  let hud = null;                       // built lazily: only `play` needs one

  /**
   * Menu taps. One subscription for the life of the app, dispatched to whatever
   * scene is current — a per-scene `onTap` would have to be unsubscribed on
   * exit, and a forgotten unsubscribe is the same class of leak as a latched
   * input bit.
   */
  input.onTap((e) => {
    if (!current || !current.tap) return;
    const b = screens.hit(e.x, e.y);
    current.tap(b, e);
  });

  const callout = (msg) => {
    const el = document.getElementById('callout');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(callout._t);
    callout._t = setTimeout(() => { el.hidden = true; }, 4000);
  };
  if (save.corrupt) callout('Saved progress could not be read and has been reset.');

  /* =========================================================== the scenes = */

  let pendingLevel = q.get('level') || CAMPAIGN[0];

  /**
   * boot — one frame of nothing, then the title. Assets are already in.
   *
   * `?scene=boot` HOLDS here instead of advancing, and that is the harness seam
   * §6 always intended: `ctx.player` and `ctx.entities` are writable, nothing
   * overwrites them, and `scenes.boot.update` can be replaced wholesale. Every
   * scene the player ever sees drives those two fields itself, so a suite that
   * scripts a world has to be somewhere that does not.
   */
  scenes.boot = {
    async enter() { if (q.get('scene') !== 'boot') await go('title'); },
    update() {}, render() {},
  };

  scenes.title = {
    t: 0,
    async enter() { this.t = 0; menuSky(); },
    update(dt) { this.t += dt; driftMenuCam(dt); },
    render() {
      drawWorldBackdrop();
      const c = screens.column();
      screens.begin(0.28);
      const midY = c.y + c.h * 0.40;
      screens.heading('KITEHAWK', midY - 26, view.mode === 'portrait' ? 40 : 52);
      screens.line('altitude is the fight', midY + 8, { size: 14, a: 0.7 });
      const last = save.data.story.lastPlayed;
      screens.button('play', last ? 'CONTINUE' : 'FLY', c.x + c.w / 2, midY + 74, Math.min(260, c.w - 40), { primary: true, size: 20 });
      screens.button('map', 'MISSIONS', c.x + c.w / 2, midY + 128, Math.min(200, c.w - 60), { size: 15 });
      screens.button('hangar', 'HANGAR', c.x + c.w / 2, midY + 174, Math.min(200, c.w - 60), { size: 15 });
    },
    tap(b) {
      if (!b) return;
      if (b.id === 'play') { pendingLevel = save.data.story.lastPlayed || CAMPAIGN[0]; go('brief', { id: pendingLevel }); }
      else if (b.id === 'map') go('map');
      else if (b.id === 'hangar') go('hangar');
    },
  };

  scenes.map = {
    rows: [],
    async enter() {
      menuSky();
      this.rows = [];
      for (const id of CAMPAIGN) {
        const lvl = await loadLevel(id).catch((e) => { console.warn('[map]', e); return null; });
        if (!lvl) continue;
        const rec = save.data.levels[id] || { stars: [], runs: 0 };
        this.rows.push({ id, name: lvl.name, act: lvl.act,
                         unlocked: save.isUnlocked(id), stars: lvl.stars.map((c) => rec.stars.includes(c.id)) });
      }
    },
    update(dt) { driftMenuCam(dt); },
    render() {
      drawWorldBackdrop();
      screens.begin(0.42);
      const c = screens.column();
      screens.heading('MISSIONS', c.y + 34, 22);
      const top = c.y + 68;
      const gap = Math.min(52, (c.h - 120) / Math.max(1, this.rows.length));
      for (let i = 0; i < this.rows.length; i++) {
        const r = this.rows[i];
        const y = top + i * gap + gap * 0.5;
        screens.button('lvl', `${r.id.toUpperCase()}  ${r.name}`, c.x + c.w / 2 - 30, y,
                       c.w - 90, { data: r.unlocked ? r.id : '', disabled: !r.unlocked, size: 15,
                                   h: Math.min(TAPH(gap), gap) });
        screens.stars(r.stars, c.x + c.w - 26, y, 6);
      }
      screens.button('back', 'BACK', c.x + c.w / 2, c.y + c.h - 30, 140, { size: 14 });
    },
    tap(b) {
      if (!b) return;
      if (b.id === 'back') go('title');
      // A locked row carries no id, so it cannot be entered. Dimming it and then
      // letting the tap through would make the lock a decoration.
      else if (b.id === 'lvl' && b.data) go('brief', { id: b.data });
    },
  };

  scenes.hangar = {
    async enter() { menuSky(); },
    update(dt) { driftMenuCam(dt); },
    render() {
      drawWorldBackdrop();
      screens.begin(0.42);
      const c = screens.column();
      screens.heading('HANGAR', c.y + 34, 22);
      const h = save.data.hangar, e = save.data.economy;
      let y = c.y + 84;
      screens.line(`airframe   ${h.airframe}`, y, { size: 15 }); y += 26;
      screens.line(`scrip ${e.scrip}    crates ${e.crates}`, y, { size: 15, col: INK.brass }); y += 34;
      screens.line('Upgrades, loadout and the ace roster are P13.', y, { size: 13, a: 0.55 }); y += 20;
      screens.line('This screen is a placeholder and is not good enough to ship.', y, { size: 13, a: 0.55 });
      screens.button('back', 'BACK', c.x + c.w / 2, c.y + c.h - 30, 140, { size: 14 });
    },
    tap(b) { if (b && b.id === 'back') go('title'); },
  };

  scenes.brief = {
    t: 0, level: null, err: '',
    async enter(_c, p) {
      this.t = 0; this.err = '';
      const id = (p && p.id) || pendingLevel;
      pendingLevel = id;
      try { this.level = await loadLevel(id); }
      catch (e) { this.level = null; this.err = String(e.message || e); console.warn('[brief]', e); }
      if (this.level) { skyAct = this.level.act; if (sky) sky.setAct(this.level.act, this.level.weather.timeOfDay === 'night' ? 'n' : 'd'); }
    },
    update(dt) {
      this.t += dt;
      driftMenuCam(dt);
      if (this.level && this.t >= SCREEN_TIMING.brief) go('play', { id: pendingLevel });
    },
    render() {
      drawWorldBackdrop();
      screens.begin(0.46);
      const c = screens.column();
      const L = this.level;
      if (!L) {
        screens.heading('MISSION UNAVAILABLE', c.y + c.h * 0.4, 20);
        screens.line(this.err, c.y + c.h * 0.4 + 30, { size: 12, col: INK.danger });
        screens.button('back', 'BACK', c.x + c.w / 2, c.y + c.h * 0.4 + 80, 160, { size: 15 });
        return;
      }
      let y = c.y + c.h * 0.28;
      screens.line(`${L.id.toUpperCase()}   ACT ${L.act}`, y, { size: 13, a: 0.6 }); y += 30;
      screens.heading(L.name.toUpperCase(), y, 28); y += 40;
      const obj = L.objectives.map(objectiveText).filter(Boolean);
      for (const o of obj) { screens.line(o, y, { size: 14 }); y += 22; }
      screens.button('go', 'FLY', c.x + c.w / 2, c.y + c.h - 54, Math.min(240, c.w - 40), { primary: true, size: 19 });
    },
    tap(b) {
      if (b && b.id === 'back') return go('map');
      go('play', { id: pendingLevel });
    },
  };

  /* ------------------------------------------------------------- PLAY ----- */

  const box = [];
  const LEAD = { x: 0, y: 0, t: 0, range: 0 };
  const crateRigs = new Map();
  const canopies = new Map();

  scenes.play = {
    run: null, level: null, again: 0, err: '',
    async enter(_c, p) {
      // Resuming from `pause` re-enters this scene with the run intact. Building
      // a fresh one here would silently restart the mission on every pause —
      // which reads as a bug in the pause button, not in the scene machine.
      if (p && p.resume && this.run) { if (hud) hud.canvas.style.display = ''; return; }
      const againCard = !!(p && p.again);
      const id = (p && p.id) || pendingLevel;
      pendingLevel = id;
      this.again = againCard ? STORY.againSecs : 0;
      this.err = '';
      let lvl = null;
      try { lvl = await loadLevel(id); }
      catch (e) {
        // Reported and deferred by one frame. Calling `go` from inside `enter`
        // re-enters the scene machine while it is still mid-change.
        this.err = String(e.message || e);
        console.warn('[play]', e);
        callout('That mission could not be loaded.');
        return;
      }
      this.level = lvl;
      skyAct = lvl.act;
      if (sky) sky.setAct(lvl.act, lvl.weather.timeOfDay === 'night' ? 'n' : 'd');

      const auto = q.get('auto') || '';
      // `?levelseed=` seeds the MISSION directly, so a browser run and a node
      // run of the same number are the same mission. Without it the browser
      // forks the app RNG and the two can never be compared.
      // Numeric when it looks numeric: `createRNG(207)` and `createRNG('207')`
      // are different streams, so a browser run and a node run of "seed 207"
      // would silently be two different missions.
      const lsRaw = q.get('levelseed');
      const ls = lsRaw === null ? null : (/^-?\d+$/.test(lsRaw) ? Number(lsRaw) : lsRaw);
      this.run = createStoryRun({ rng: ls !== null ? createRNG(ls) : rng.fork('story:' + id), bus }, lvl, {
        pilot: auto === 'bot' ? 'ai' : 'human',
        advisor: auto === 'thumb',
        bug: q.get('storybug') || '',
      });
      ctx.entities = this.run.world.live;
      ctx.player = null;

      /**
       * §7.3's own socket, wired at the app layer because `js/sim/` may not
       * import `js/gfx/` (corecheck) — so nothing inside the sim can hand the
       * particle system the terrain it just generated. This is the one line
       * P9 left for P10.
       */
      P.setTerrainQuery(this.run.terrain.query);

      if (!hud) {
        hud = createHUD(ctx, {
          speakers: { lead: { name: 'Flight Lead', colour: '#d8c08a' } },
          onSpecial: () => { const pl = this.run && this.run.player; if (pl && pl.specialAmmo > 0) pl.specialAmmo--; },
          onEngage: () => {
            const f = this.run && this.run.field;
            if (f) f.engage[1] = f.engage[1] === 'cut' ? 'deny' : f.engage[1] === 'deny' ? 'none' : 'cut';
          },
        });
      }
      hud.canvas.style.display = '';
      hud.cards.clear();
      // §7.1's radio, in text. D7: the game is fully playable with assets/audio/
      // empty, so every spoken line is a card first and a voice second.
      hud.cards.push({ id: id + '.open', speaker: 'lead', kind: 'radio', text: briefLine(lvl) });
    },
    exit() {
      if (hud) hud.canvas.style.display = 'none';
    },
    update(dt) {
      const run = this.run;
      if (!run) { if (this.err) { this.err = ''; go('map'); } return; }
      /**
       * §9.4: **restart is a 1.2 s "again" card, not a modal and not a menu.**
       * The run is already built and seated; the card is 1.2 s of not stepping
       * it. Nothing is dismissed, nothing takes focus and nothing has to be
       * navigated back out of — which is the whole difference between this and
       * a "retry?" dialog.
       */
      if (this.again > 0) { this.again -= dt; return; }
      run.setStick(input.axisX, input.axisY);
      run.step(dt);
      const pf = run.player.flight;
      ctx.player = PLAYER_VIEW(pf, ctx.player);

      cam.clearTracked();
      framingContributions(run.world, run.player, box, view.profile.admitWu);
      for (const m of box) cam.track(m.id, m.x, m.y, m.w, m.h, m.weight);
      cam.setPlayerControl(input.stick.active);

      state.story.level = run.level.id;
      state.story.t = +run.state.t.toFixed(2);
      state.story.progress = +run.state.progress.toFixed(3);
      state.story.kills = run.state.kills;
      state.story.crates = run.field.stats.playerBanked;
      state.story.over = run.state.over;
      state.story.result = run.state.result;

      if (run.state.over) go('debrief', { id: run.level.id, summary: run.summary() });
    },
    render() {
      const run = this.run;
      drawWorldBackdrop();
      if (!run) return;
      drawTerrain(run.terrain);
      drawAircraft(run.world);
      drawCrates(run.field);
    },
    /** The HUD is a second canvas, so it is drawn after `R.end()` — see `frame`. */
    hudFrame() {
      const run = this.run;
      if (!run || !hud) return;
      const st = hud.state;
      hudState(st, run.world, run.player, cam, view, {
        ramp: RAMP,
        objective: objectiveHUD(run),
        wind: run.field.wind[0] ? run.field.wind[0][1] : 0,
        windShear: 0,
        engage: run.field.engage[1],
        specialAmmoMax: 3, specialGlyph: 'S',
        predictImpact: true,
      });
      const tgt = run.player.target;
      if (tgt && !tgt.dead) {
        leadPoint(run.player.flight, tgt, LEAD);
        st.lead = LEAD;
        st.leadInCone = Math.abs(offNose(run.player.flight, LEAD.x, LEAD.y))
          <= (run.player.gun ? run.player.gun.fireCone : GUNS.coneHalf);
      } else { st.lead = null; st.leadInCone = false; }
      hud.update(DT);
      hud.render(st);

      if (this.again > 0) {
        const a = Math.min(1, this.again / (STORY.againSecs * 0.4));
        screens.begin(0.34 * a);
        const c = screens.column();
        screens.heading('AGAIN', c.y + c.h * 0.44, 34);
      }
    },
    tap(b, e) {
      // A tap in the top-right corner pauses. There is no pause BUTTON on the
      // glass: ART §10 allows no floating furniture, and a corner is a target
      // that costs nothing to draw and cannot be hit by a flying thumb.
      if (e && e.x > view.w - 64 && e.y < 64) go('pause', { from: 'play' });
      void b;
    },
    get againLeft() { return this.again; },
  };

  scenes.pause = {
    async enter() {},
    update() {},
    render() {
      // The world is still drawn — a pause is the same screen dimmed, never a
      // panel over a blank one.
      drawWorldBackdrop();
      const run = scenes.play.run;
      if (run) { drawTerrain(run.terrain); drawAircraft(run.world); drawCrates(run.field); }
      screens.begin(0.50);
      const c = screens.column();
      screens.heading('PAUSED', c.y + c.h * 0.32, 26);
      screens.button('resume', 'RESUME', c.x + c.w / 2, c.y + c.h * 0.32 + 60, Math.min(220, c.w - 60), { primary: true, size: 18 });
      screens.button('restart', 'RESTART', c.x + c.w / 2, c.y + c.h * 0.32 + 112, Math.min(180, c.w - 80), { size: 15 });
      screens.button('quit', 'MISSIONS', c.x + c.w / 2, c.y + c.h * 0.32 + 158, Math.min(180, c.w - 80), { size: 15 });
    },
    tap(b) {
      if (!b) return;
      if (b.id === 'resume') { go('play', { resume: true }); }
      else if (b.id === 'restart') { const id = pendingLevel; scenes.play.run = null; go('play', { id, again: true }); }
      else if (b.id === 'quit') { scenes.play.run = null; go('map'); }
    },
  };

  scenes.debrief = {
    summary: null, id: '', next: '',
    update(dt) { driftMenuCam(dt); },
    async enter(_c, p) {
      this.summary = (p && p.summary) || null;
      this.id = (p && p.id) || pendingLevel;
      if (!this.summary) return;
      const i = CAMPAIGN.indexOf(this.id);
      const next = i >= 0 && i + 1 < CAMPAIGN.length ? CAMPAIGN[i + 1] : '';
      this.next = this.summary.won ? next : '';
      save.recordRun(this.id, this.summary, next);
      save.flush();
      for (const u of this.summary.unscored)
        console.warn(`[debrief] ${this.id}: objective "${u}" is NOT SCORED by this shell — P11/P12 own it`);
    },
    render() {
      drawWorldBackdrop();
      screens.begin(0.52);
      const c = screens.column();
      const r = this.summary;
      if (!r) { screens.heading('—', c.y + c.h * 0.4, 22); return; }
      let y = c.y + c.h * 0.16;
      screens.heading(r.won ? 'OBJECTIVE COMPLETE' : r.deaths ? 'SHOT DOWN' : 'MISSION FAILED',
                      y, view.mode === 'portrait' ? 20 : 26);
      y += 34;
      screens.stars(r.stars.map((x) => x.got), c.x + c.w / 2, y, 10); y += 30;
      screens.line(`${r.time.toFixed(1)} s     ${r.kills} down     ${r.cratesCaught} crates`, y, { size: 14 }); y += 22;
      screens.line(`+${r.scrip + r.crateValue} scrip     −${r.repair} repairs`, y, { size: 13, col: INK.brass }); y += 22;
      for (const st of r.stars) { screens.line(`${st.got ? '★' : '·'}  ${st.desc}`, y, { size: 12, a: st.got ? 1 : 0.45 }); y += 17; }
      if (r.unscored.length) { screens.line(`not scored yet: ${r.unscored.join(', ')}`, y, { size: 11, a: 0.45, col: INK.warn }); y += 17; }
      /**
       * A won mission offers NEXT first. Without it the only way on is
       * MISSIONS -> pick the row that just unlocked, which is a player being
       * asked to navigate a menu to keep playing.
       */
      const ids = this.next ? ['again', 'next', 'map'] : ['again', 'map'];
      const labels = { again: 'AGAIN', next: 'NEXT', map: 'MISSIONS' };
      const bw = Math.min(150, (c.w - 40) / ids.length);
      for (let i = 0; i < ids.length; i++) {
        const x = c.x + c.w / 2 + (i - (ids.length - 1) / 2) * (bw + 14);
        screens.button(ids[i], labels[ids[i]], x, c.y + c.h - 34, bw,
                       { primary: ids[i] === (this.next ? 'next' : 'again'), size: 16, data: this.next });
      }
    },
    tap(b) {
      if (!b) return;
      if (b.id === 'again') { const id = this.id; scenes.play.run = null; go('play', { id, again: true }); }
      else if (b.id === 'next' && this.next) { const id = this.next; scenes.play.run = null; go('brief', { id }); }
      else if (b.id === 'map') { scenes.play.run = null; go('map'); }
    },
  };

  for (const n of SCENES) if (!scenes[n]) scenes[n] = { async enter() {}, update() {}, render() {} };

  /**
   * PUBLISHED LAST, ON PURPOSE. `window.__kh` used to be assigned before the
   * atlases were awaited, so `tools/orient.mjs` — which waits on
   * `window.__kh && window.__kh.cam` and then writes `ctx.scenes.boot.update` —
   * won the race against the scene table and died with "Cannot set properties
   * of undefined". A harness seam that exists before the thing it is a seam FOR
   * is worse than one that arrives late.
   */
  window.__kh = ctx;

  /* ------------------------------------------------------- draw helpers -- */

  const GND = [0.21, 0.23, 0.19];
  const GND_LO = [0.13, 0.14, 0.12];
  function drawTerrain(terrain) {
    /**
     * The silhouette the gate reasons about IS the silhouette drawn (W5's rule,
     * one system over): both are `terrain.yAt`.
     *
     * Two triangles per span, NOT one polygon. `R.poly` is documented convex and
     * a skyline is the least convex thing in the game — a ridge line fed to it
     * comes out as a fan through the terrain with sky wedges under the peaks.
     */
    const halfW = view.worldW / cam.zoom * 0.5;
    const x0 = cam.x - halfW - 80, x1 = cam.x + halfW + 80;
    const step = Math.max(14, (x1 - x0) / 110);
    const base = 500;
    let px = x0, py = terrain.yAt(x0);
    for (let x = x0 + step; x <= x1 + step; x += step) {
      const y = terrain.yAt(x);
      R.tri(px, py, GND, x, y, GND, x, base, GND_LO, LAYER.GROUND_MID, { parallax: 1, parallaxY: 1 });
      R.tri(px, py, GND, x, base, GND_LO, px, base, GND_LO, LAYER.GROUND_MID, { parallax: 1, parallaxY: 1 });
      px = x; py = y;
    }
  }

  function drawAircraft(world) {
    for (let i = 0; i < world.live.length; i++) {
      const e = world.live[i];
      const f = e.flight;
      const scheme = e.dead ? 'wreck' : e.side === 1 ? 'player' : (e.type && e.type.id) || 'kestrel';
      R.drawRig(planeRig(scheme), f.sx / M_PER_WU, f.sy / M_PER_WU, f.theta, RIG_SCALE, LIGHTS, LAYER.ACTORS,
                f.roll < 0 ? { flipY: true } : undefined);
    }
  }

  function drawCrates(field) {
    for (let i = 0; i < field.crates.length; i++) {
      const c = field.crates[i];
      if (!c.alive || c.landed) continue;
      if (!crateRigs.has(c.kind)) crateRigs.set(c.kind, makeCrateRig(c.kind));
      R.drawRig(crateRigs.get(c.kind), field.crateX(c) / M_PER_WU, field.crateY(c) / M_PER_WU,
                c.cut ? c.t * 3.1 : c.ph * 0.6, RIG_SCALE, LIGHTS, LAYER.ACTORS);
      if (!c.cut) {
        if (!canopies.has(i)) canopies.set(i, makeCanopyRig());
        const can = canopies.get(i);
        breathe(can, c.t + i, 0.035);
        R.drawRig(can, c.sx / M_PER_WU, c.sy / M_PER_WU, c.ph * 0.35, RIG_SCALE, LIGHTS, LAYER.ACTORS);
      }
    }
  }

  const PV = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hull: HULL_WU };
  function PLAYER_VIEW(f) {
    PV.x = f.sx / M_PER_WU; PV.y = f.sy / M_PER_WU;
    PV.vx = f.svx / M_PER_WU; PV.vy = f.svy / M_PER_WU;
    PV.angle = f.theta;
    return PV;
  }

  function TAPH(gap) { return Math.max(44, gap - 4); }

  function objectiveText(o) {
    if (o.type === 'reach') return `Reach the far end — ${Math.round(o.x * M_PER_WU / 100) / 10} km`;
    if (o.type === 'destroy' && o.what === 'aircraft') return `Shoot down ${o.n}`;
    if (o.type === 'destroy') return `Destroy the ${o.ref || o.what}`;
    if (o.type === 'collect') return `Recover ${o.n} crates`;
    if (o.type === 'gates') return `Fly ${o.n} gates`;
    if (o.type === 'survive') return 'Come back';
    return '';
  }
  function objectiveHUD(run) {
    if (run.crateGoal) return `CRATES ${run.field.stats.playerBanked}/${run.crateGoal}`;
    if (run.killGoal) return `DOWN ${run.state.kills}/${run.killGoal}`;
    return `${Math.round(run.state.progress * 100)}%`;
  }
  function briefLine(lvl) {
    const o = lvl.objectives.find((x) => x.type !== 'reach' && x.type !== 'survive');
    if (!o) return 'Patrol the line and come home.';
    if (o.type === 'collect') return `Get the silk. ${o.n} of them.`;
    if (o.type === 'destroy' && o.what === 'aircraft') return `${o.n} of them up here. Clear it.`;
    if (o.type === 'destroy') return 'That is the target. Take it down.';
    return 'Follow the line.';
  }

  function snapshot() {
    state.tick = tick;
    state.fps = loop.fps; state.frameMs = loop.ms;
    state.drawCalls = R.stats.drawCalls; state.sprites = R.stats.sprites;
    state.tris = R.stats.tris; state.lights = R.stats.lights;
    state.particles = P.count;
    state.scene = currentName;
    state.view.mode = view.mode; state.view.w = view.w; state.view.h = view.h; state.view.dpr = view.dpr;
    state.view.worldW = view.worldW; state.view.worldH = view.worldH; state.view.scale = view.scale;
    state.cam.x = cam.x; state.cam.y = cam.y; state.cam.zoom = cam.zoom;
    state.cam.zoomTarget = cam.zoomTarget; state.cam.reason = cam.zoomReason;
    state.cam.boxW = cam.box.w; state.cam.boxH = cam.box.h; state.cam.members = cam.memberCount;
    state.input.axisX = input.axisX; state.input.axisY = input.axisY;
    state.input.stickActive = input.stick.active; state.input.stickR = input.stickRadius();
    state.input.source = input.lastSource;
    const p = ctx.player;
    state.player.alive = !!p;
    if (p) {
      state.player.x = p.x; state.player.y = p.y;
      state.player.vx = p.vx || 0; state.player.vy = p.vy || 0;
      state.player.speed = Math.hypot(p.vx || 0, p.vy || 0);
      state.player.angle = p.angle || 0;
      state.player.band = bandIdAt(p.y);
      state.player.altFt = altitudeFeet(p.y);
    }
    let hostile = 0, crates = 0;
    const ents = ctx.entities || [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e && e.kind === 'crate') crates++; else if (e && (e.hostile || e.side === -1)) hostile++;
    }
    state.entities.total = ents.length;
    state.entities.hostile = hostile;
    state.entities.crates = scenes.play.run ? scenes.play.run.field.crates.filter((c) => c.alive).length : crates;
    state.audio.ready = !!audio.ready; state.audio.available = !!audio.available;
    const rep = audio.report ? audio.report() : null;
    state.audio.voices = (rep && rep.sources && rep.sources.live) || 0;
    state.audio.oneShots = (rep && rep.oneShotVoices) || 0;
    state.quality.low = quality.low;
  }

  /* --- the loop --------------------------------------------------------- */

  let tick = 0;
  const dbg = createDebug(ctx);

  function update() {
    tick++;
    input.update();
    if (current && current.update) current.update(DT);
    // camera runs AFTER the sim and before render — it is a consumer, never an input
    cam.update(ctx.player, DT);
    // the listener follows the CAMERA, not the player: what you hear is what is
    // in frame, and at zoom 0.78 that is 89 m of sky rather than 69
    audio.setListener(cam.x, cam.y, (view.worldW / cam.zoom) * 0.5);
    audio.update(DT);
  }

  function render(alpha, dtReal) {
    R.tick(dtReal);
    R.begin(cam);
    for (const L of LIGHTS) R.light(L);
    if (current && current.render) current.render(alpha, dtReal);
    R.end();
    // The screen canvas is cleared by whoever draws into it; a scene that draws
    // no chrome must still clear last frame's, or a menu ghosts over the fight.
    if (current === scenes.play) { screens.begin(0); scenes.play.hudFrame(); }
    quality.frame(dtReal * 1000, dtReal);
    snapshot();
    dbg.render();
  }

  const loop = createLoop({ update, render });
  ctx.loop = loop;

  R.resize(view.w, view.h, view.dpr, view.worldH);
  bus.on('view:change', () => { R.resize(view.w, view.h, view.dpr, view.worldH); });

  // Auto quality is OFF under a harness run: a preset that flips mid-gate makes
  // two runs incomparable, and every gate passes ?nosave.
  if (!q.has('nosave') && !q.has('quality')) quality.auto(true);

  audio.followCamera(true);

  /* ------------------------------------------------- the harness surface -- */
  window.__p10 = {
    get scene() { return currentName; },
    get run() { return scenes.play.run; },
    get buttons() { return screens.buttons.map((b) => ({ id: b.id, data: b.data, x: b.x, y: b.y, w: b.w, h: b.h })); },
    go, screens, save, campaign: CAMPAIGN,
    /** Menu-backdrop knobs, so the framing can be chosen by looking rather than guessed. */
    menuCam: MENU_CAM,
    setSky(act, st) { skyAct = act; if (sky) sky.setAct(act, st || 'd'); },
    tapButton(id) {
      const b = screens.buttons.find((x) => x.id === id);
      if (!b) return null;
      if (current && current.tap) current.tap(b, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      return { id: b.id, data: b.data };
    },
    /** #gl and the two 2D layers composited — the HUD is not on the GL canvas. */
    shot() {
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const g2 = c.getContext('2d');
      g2.drawImage(canvas, 0, 0);
      if (hud && hud.canvas.style.display !== 'none') g2.drawImage(hud.canvas, 0, 0, c.width, c.height);
      g2.drawImage(screens.canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    summary() { return scenes.play.run ? scenes.play.run.summary() : null; },
    setStick(x, y) { if (scenes.play.run) scenes.play.run.setStick(x, y); },
    /** `?auto=thumb`: what a competent pilot wants, for a driver to put a thumb on. */
    get wantAxis() { return scenes.play.run ? scenes.play.run.wantAxis : { x: 0, y: 0 }; },
    get stick() { return { r: input.stickRadius(), active: input.stick.active, x: input.stick.x, y: input.stick.y, ox: input.stick.ox, oy: input.stick.oy }; },
    /** The live stick zone and special slot, for a driver that puts a real thumb on them. */
    zones() {
      const z = input.getZones()[0];
      const r = {};
      const sp = ctx.layout && ctx.layout.special;
      return { stick: z ? (z.rectFn(r) || r) : null, special: sp ? { x: sp.x, y: sp.y, w: sp.w, h: sp.h, cx: sp.cx, cy: sp.cy } : null };
    },
    get engage() { return scenes.play.run ? scenes.play.run.field.engage[1] : ''; },
  };

  await go(q.get('scene') || 'boot');
  loop.start();

  return ctx;
}

export default boot;

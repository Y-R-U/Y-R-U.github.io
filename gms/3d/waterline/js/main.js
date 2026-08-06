// Boot + wiring. FROZEN after W0 — a component that needs new wiring asks, it does not edit.
// Everything below constructs a system from BUILD_PLAN §1 and hands it to the test hook. The
// systems themselves are stubs; replacing a stub means editing that module, never this file.

import * as THREE from 'three';
import { App } from './engine/app.js';
import { Post } from './engine/post.js';
import { defineScenario, getScenario, scenarioList, frameCamera } from './scenarios.js';
import { configureMaterials } from './world/materials/index.js';
import { configure as configureTextures } from './world/textures/bake.js';
import { buildSky } from './world/sky.js';
import { buildLighting } from './world/lighting.js';
import { buildOcean } from './world/ocean.js';
import { buildBridge } from './world/bridge.js';
import { buildBridgeLights } from './world/bridgeLights.js';
import { buildTable } from './world/table.js';
import { buildShip } from './world/ship.js';
import { buildFleet } from './world/fleet.js';
import { fireShell, arcHeight } from './world/shell.js';
import { createVFX } from './world/vfx/index.js';
import './world/vfx/gun.js';
import './world/vfx/impact.js';
import './world/vfx/fire.js';
import './world/vfx/round.js';
import { Rig } from './cine/rig.js';
import { Director } from './cine/director.js';
import { registerSequences } from './cine/sequences.js';
import { createCaption } from './cine/caption.js';
import { buildHUD } from './ui/hud.js';
import { buildSetup } from './ui/setup.js';
import { buildLadder } from './ui/ladder.js';
import { buildOverlay } from './ui/overlay.js';
import { createSave } from './save.js';
import * as net from './net/multiplayer.js';
import * as sim from './sim/index.js';
import { MODES } from './config.js';

const app = new App(document.getElementById('stage'));
const hook = app.expose();

configureMaterials(app.quality);
configureTextures(app.quality);

document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);

const save = createSave();

const sky = buildSky(app.quality, app.renderer);
const lighting = app.add(buildLighting(app.quality, sky));
const ocean = app.add(buildOcean(app.quality));
const bridge = app.add(buildBridge(app.quality));
const bridgeLights = app.add(buildBridgeLights(app.quality));
const table = buildTable(MODES.classic.w, MODES.classic.h);
bridge.tableAnchor.add(table.object3D);

const ship = app.add(buildShip('cruiser', app.quality, 4));
// W0's scaffold hull. Every scored scenario hides it by root name and the fleet builds its own
// ships, so in a real match it is 13 main + 10 shadow calls that change zero pixels (Wave C
// measured it on a frozen clock). `boot` turns it back on.
ship.object3D.visible = false;
const fleet = app.add(buildFleet(app.quality));
const vfx = app.add(createVFX(app));

app.scene.background = sky.background;
app.scene.environment = sky.env;
app.scene.fog = lighting.fog;

const rig = new Rig(app);
const director = new Director(rig);
registerSequences(director, { bridge, ocean, ship, fleet });
app.add({ update: dt => director.update(dt) });

const uiMount = document.getElementById('ui');
const hud = buildHUD(uiMount);
const setup = buildSetup(uiMount);
const ladderUI = buildLadder(uiMount, save);
const overlay = buildOverlay(uiMount);
const caption = createCaption(uiMount);

app.post = new Post(app);
app.post.registerKnobs(app.quality);

// Live getter, not a snapshot: component modules register their scenarios at import time and the
// list must stay true after that.
Object.defineProperty(hook, 'scenarios', { get: scenarioList, enumerable: true, configurable: true });
hook.setScenario = id => getScenario(id)?.setup(app);
hook.seek = (id, t, ctx) => director.seek(id, t, ctx);
hook.pace = mode => director.setPace(mode);
hook.world = { sky, lighting, ocean, bridge, bridgeLights, table, ship, fleet };
hook.cine = { rig, director, caption, fireShell, arcHeight };
hook.vfx = { alive: () => vfx.alive(), clear: () => vfx.clear(), emit: vfx };
hook.net = net;
hook.save = save;
hook.sim = {
  ...sim,
  game: () => game,
  view: side => sim.view(game, side),
  place: (side, list) => sim.placeFleet(game, side, list),
  fire: (side, shot) => sim.fire(game, side, shot),
  ai: side => sim.aiMove(game, side),
  newGame(opts) { game = sim.newGame(opts); return game; },
  // Delegating, not reimplementing: when C5 lands these, the hook works with no edit to this
  // frozen file.
  autoplay: (turns, opts) => (game = sim.autoplay(game, turns, opts)),
  events: () => sim.events(game),
  setBoard: (side, ships) => sim.setBoard(game, side, ships),
};
hook.ui = {
  screen: () => overlay.screen,
  go: name => overlay.show(name),
  tap: (r, c) => table.showGhost([{ r, c }]),
  arm: kind => hud.arm(kind),
  confirm: () => hud.root.querySelector('[data-fire]').click(),
  hud, setup, ladder: ladderUI, overlay, caption,
};

let game = null;

// W0's own scenario, and the only one this file owns. Every plate-scored shot is registered by
// the component that builds it, from that component's own module.
defineScenario({
  id: 'boot',
  label: 'W0 scaffold — every system constructed',
  ref: null,
  setup(a) {
    ship.object3D.visible = true;
    lighting.setTime(16.5);   // off-noon, so the shadow pass is visible and not straight down
    a.scene.background = sky.background;
    a.scene.environment = sky.env;
    frameCamera(a, { pos: [46, 26, 62], look: [0, 8, 0], fov: 48 });
  },
});

const params = new URLSearchParams(location.search);
if (params.has('preset')) app.quality.usePreset(params.get('preset'));
for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
if (params.has('dpr')) hook.setDprCap(+params.get('dpr'));

// shotmode keys off the PRESENCE of ?shot=, not off finding the scenario. A sequence-only capture
// (--at names a sequence id, not a scenario) must still hide the HUD, or the perf readout and the
// ordnance buttons end up in a sheet the blind critic then scores.
const shotId = params.get('shot');
if (shotId && !params.has('hud')) document.body.classList.add('shotmode');

// ?seed / ?turn come from shot.mjs and must be consumed HERE, because this file freezes: a
// component cannot add the wiring later. Autoplay is a sim stub today; when C5 lands it, a
// turn-30 board becomes shootable with no further change to main.js.
const seed = params.has('seed') ? +params.get('seed') : undefined;
const turn = params.has('turn') ? +params.get('turn') : 0;
if (seed !== undefined || turn) {
  try { hook.sim.autoplay(turn, { seed }); }
  catch (e) { console.warn(`?seed/?turn ignored: ${e.message}`); }
}

const shot = shotId ? getScenario(shotId) : null;
// A scenario may load something. Returning the promise routes it through the ready gate, so the
// harness cannot screenshot a half-built shot.
if (shot) { const p = shot.setup(app); if (p?.then) app.loading(p); }
else frameCamera(app, { pos: [46, 26, 62], look: [0, 8, 0], fov: 48 });

app.start();
document.getElementById('boot').classList.add('gone');

import { App } from './engine/app.js';
import { Post } from './engine/post.js';
import { Backdrop } from './world/backdrop.js';
import { Lighting } from './world/lighting.js';
import { World, ReachScene, coldOpenKeys, reachLighting, registerBackdropScenarios, registerStationScenarios, registerPlanetScenarios, registerBeltScenarios, registerFleetScenarios } from './world/scene.js';
import { registerMaterialKnobs } from './world/materials.js';
import { registerFxKnobs } from './world/fx.js';
import { registerAtmosKnobs } from './world/atmos.js';
import { registerShipKnobs } from './world/kit/ship.js';
import { registerStationKnobs } from './world/kit/station.js';
import { registerPlanetKnobs } from './world/kit/planet.js';
import { registerBeltKnobs } from './world/kit/belt.js';
import { buildKnobs } from './ui/knobs.js';
import { showroom, buildShowroom } from './showroom/index.js';
import { registerEntries } from './showroom/entries.js';
import { getScenario, allScenarios } from './scenarios.js';
import { camera, flyBy } from './world/camera.js';
import { createSimView } from './ui/simview.js';
import { panels } from './ui/panels.js';
import { buildHud } from './ui/hud.js';
import { registerStoryEntries } from './ui/story.js';
import { intro } from './ui/intro.js';
import './ui/screens.js';

const app = new App(document.getElementById('stage'));
app.expose();

registerMaterialKnobs(app.quality);
registerFxKnobs(app.quality);
registerBeltKnobs(app.quality);
registerAtmosKnobs(app.quality, app);
const backdrop = app.add(new Backdrop('tamber'));
const world = app.add(new World());
const lighting = app.add(new Lighting(backdrop, 'tamber'));

world.bind(backdrop, lighting);
registerShipKnobs(app.quality, backdrop);
registerStationKnobs(app.quality);
registerPlanetKnobs(app.quality);
registerBackdropScenarios(app, world);
registerBeltScenarios(app, world);
registerStationScenarios(app, world);
registerPlanetScenarios(app, world);
registerFleetScenarios(app, world);
// after the scenarios so the bloom knob's first apply finds a scene to rebuild the path for
app.post = new Post(app);
app.post.registerKnobs(app.quality);
buildKnobs(app);
buildShowroom(app);
camera.attach(app);
registerEntries(app, world, backdrop);

const sim = createSimView({ seed: 1001 });
panels.attach({ sim });
registerStoryEntries();

const params = new URLSearchParams(location.search);
const shot = params.has('shot') ? getScenario(params.get('shot')) : null;
const live = !shot && !params.has('sr');

let reach = null;
const hud = buildHud(sim, {
  onFocus: () => {
    camera.enable(true);
    camera.setTouchEnabled(true);
    if (camera.rig?.home) return camera.resetView();
    camera.focus(reach ? reach.focusTarget('ledger') : world.subject, { dist: 620, phi: Math.PI * 0.40 });
  },
});

// ── the tick clock ───────────────────────────────────────────────────────────
// One tick is one week. Speed only changes the wall-clock gap between whole ticks, so a run at ×4
// resolves exactly the same as the same run at ×1 and a fast-forward can never desync.

const clock = {
  acc: 0,
  update(dt) {
    if (!reach) return;
    const speed = sim.speed;
    if (speed <= 0 || sim.over) { reach.setTickPhase(reach.phase || 0); return; }
    const gap = sim.tickSeconds / speed;
    clock.acc += dt;
    // a backgrounded tab must not dump twenty weeks into one frame
    let budget = 2;
    while (clock.acc >= gap && budget-- > 0) { clock.acc -= gap; sim.tick(); }
    if (clock.acc >= gap) clock.acc = 0;
    const f = Math.max(0, Math.min(1, clock.acc / gap));
    reach.setTickPhase(f);
    hud.setTickProgress(f);
  },
};
app.add(clock);

// hud.react is already subscribed to the sim; this is the 3D's own subscription and nothing else
// in here reads state.
sim.on((kind, payload) => {
  if (kind === 'tick') { reach?.react(payload.events); panels.refresh(); }
  else if (kind === 'reset') { clock.acc = 0; reach?.seed(sim.state.ships); }
});

// sweeping off a panel entry onto a scene must not leave the fixture sheet sitting over it
showroom.onRun(e => {
  if (e.group !== 'panel' && e.group !== 'story' && panels.isOpen()) { panels.closeAll(); panels.useLive(); }
});

// Every entry is orbitable, and every entry knows the framing it was authored with, so the
// reset button means something no matter which one you are standing in.
showroom.onAfterRun(() => {
  camera.enable(true);
  camera.setTouchEnabled(true);
  requestAnimationFrame(() => camera.markHome());
});
document.getElementById('sr-reset').onclick = () => { camera.setTouchEnabled(true); camera.resetView(); };

Object.assign(window.__mono, {
  world, backdrop, lighting, showroom, camera, sim, panels, hud,
  reach: null,
  clock,
  scenarios: allScenarios().map(s => ({ id: s.id, label: s.label, ref: s.ref })),
  setScenario: id => getScenario(id)?.setup(app),
  missing: () => showroom.missing(),
});

if (params.has('preset')) app.quality.usePreset(params.get('preset'));

if (shot) {
  shot.setup(app);
  if (!params.has('hud')) document.body.classList.add('shotmode');
}

// ── the live game ────────────────────────────────────────────────────────────

if (live) {
  // theta matters: the default inherits whatever angle the camera was left on, which put the
  // star directly behind Ledger and recentring returned a wall of orange.
  const HOME = () => ({ object: reach.focusTarget('ledger'), dist: 900, phi: Math.PI * 0.42, theta: 1.2 });
  reachLighting(app.quality);
  reach = new ReachScene(app, world);
  window.__mono.reach = reach;
  world.setLive(reach);
  reach.seed(sim.state.ships);

  // a scenario borrows the stage; this is how the player gets the running company back
  showroom.register({
    id: 'live_reach', group: 'misc', label: 'Tamber Reach — the live game', note: 'back to the running company',
    run: ctx => {
      reachLighting(ctx.app.quality);
      world.resumeLive();
      camera.enable(true);
      camera.setTouchEnabled(true);
      camera.markHome(HOME());
      camera.resetView(0);
    },
  });

  camera.onTap((hit, hits) => {
    const t = reach.siteAt(hit, hits);
    if (!t) return;
    if (t.kind === 'ship') return panels.open('assign', { ship: t.ship });
    if (t.site === 'kestrel') return panels.open('assign', { ship: rigId(), dest: 'kestrel' });
    if (t.site === 'ledger') return panels.open('holdings', { tab: 'station' });
    if (t.site === 'ossian') return panels.open('market');
    if (t.site === 'drayyard') return panels.open('quarterly');
  });

  // §1 beat 1 — down Ledger's spine, out, and round until the belt fills the frame.
  camera.enable(true);
  camera.setTouchEnabled(false);
  sim.setSpeed(0);
  hud.ticker(sim.content.get('system', 'tamber').ticker, 9000);
  const skip = () => camera.stopFly();
  addEventListener('pointerdown', function once(e) {
    if (e.target.closest('#ui, #sheet, #knobs, #showroom, #intro')) return;
    removeEventListener('pointerdown', once);
    skip();
  });
  const coldOpen = flyBy(app, { ms: 11000, keys: coldOpenKeys() }).then(() => {
    camera.setTouchEnabled(true);
    camera.markHome(HOME());
    if (sim.speed === 0 && sim.week === 0) sim.setSpeed(1);
  });

  intro.start({ app, sim, panels, hud, camera, reach, showroom, coldOpen, skip });
}

// after the scenario, so --set=knob=value on the command line still wins
for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
if (params.has('dpr')) window.__mono.setDprCap(+params.get('dpr'));
if (params.has('perf')) document.body.classList.add('perf-on');
if (params.has('showroom')) showroom.open();
if (params.has('sr')) showroom.run(params.get('sr'));
if (params.has('speed')) sim.setSpeed(+params.get('speed'));
if (params.has('panel')) panels.open(params.get('panel'));

const rigId = () => (sim.state.ships.find(s => sim.shipDef(s)?.mine > 0) || sim.state.ships[0])?.id;

app.start();
document.getElementById('boot').classList.add('gone');
window.__mono.ready = true;

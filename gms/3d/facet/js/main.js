import { App } from './engine/app.js';
import { Lighting } from './world/lighting.js';
import { World } from './world/world.js';
import { buildPanel } from './editor/panel.js';
import { getScenario, allScenarios } from './scenarios.js';
import { startGame } from './game/game.js';

const app = new App(document.getElementById('stage'));
app.expose();

const lighting = app.add(new Lighting());
const world = app.add(new World(app));
// The palette owns the terrain and prop colours as well as the light, so changing it is a rebuild.
app.onPalette = p => world.setPalette(p.id);
world.registerKnobs(app.quality, app);

buildPanel(app);
startGame(app, world);

window.__facet.world = world;
window.__facet.lighting = lighting;
window.__facet.report = () => world.report;
window.__facet.scenarios = allScenarios().map(s => ({ id: s.id, label: s.label, pal: s.pal }));
window.__facet.setScenario = id => getScenario(id)?.setup(app);

const params = new URLSearchParams(location.search);
const shot = params.has('shot') ? getScenario(params.get('shot')) : null;
if (shot) {
  shot.setup(app);
  app.rig.enabled = false;
  if (!params.has('hud')) document.body.classList.add('shotmode');
}
if (params.has('preset')) app.quality.usePreset(params.get('preset'));
for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
if (params.has('dpr')) window.__facet.setDprCap(+params.get('dpr'));

app.start();
document.getElementById('boot').classList.add('gone');
window.__facet.ready = true;

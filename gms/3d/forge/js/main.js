import { App } from './engine/app.js';
import { Lighting } from './world/lighting.js';
import { Demo } from './world/demo.js';
import { buildPanel } from './editor/panel.js';
import { buildEditor } from './editor/editor.js';
import { Post } from './engine/post.js';
import { getScenario, allScenarios } from './scenarios.js';
import { People } from './world/people.js';
import { Chickens } from './world/chicken.js';
import { Player } from './player.js';
import { Doors } from './world/doors.js';
import * as stairs from './world/stairs.js';
import { walkStep, groundAt } from './world/colliders.js';
import { Input } from './input.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const app = new App(document.getElementById('stage'));
app.expose();

const lighting = app.add(new Lighting());
const demo = app.add(new Demo());
const people = app.add(new People(demo.terrain));
const chickens = app.add(new Chickens(demo.terrain));

const controls = new OrbitControls(app.camera, app.renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// Doors runs before the player: it owns the script that moves him and the arm length the
// camera reads this frame.
const player = new Player(people, new Input(), controls);
const doors = app.add(new Doors(demo, player, lighting, [demo.object3D, people.object3D]));
app.add(player);

app.post = new Post(app);
app.post.registerKnobs(app.quality);

buildPanel(app);

window.__forge.people = people;
window.__forge.chickens = chickens;
window.__forge.player = player;
window.__forge.doors = doors;
window.__forge.walk = { walkStep, groundAt };
window.__forge.stairs = stairs;
window.__forge.scenarios = allScenarios().map(s => ({ id: s.id, label: s.label, ref: s.ref, zone: s.zone }));
window.__forge.setScenario = id => getScenario(id)?.setup(app);

buildEditor(app, demo, controls);

const params = new URLSearchParams(location.search);
const shot = params.has('shot') ? getScenario(params.get('shot')) : null;
// OrbitControls.update() calls lookAt(target) unconditionally, so leaving it in the loop
// silently overrode every scenario's `look` with (0, 4, 0).
if (shot) {
  shot.setup(app);
  controls.enabled = false;
  player.controls = null;
  if (!params.has('hud')) document.body.classList.add('shotmode');
} else {
  player.enabled = true;
}
if (params.has('preset')) app.quality.usePreset(params.get('preset'));
for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
if (params.has('dpr')) window.__forge.setDprCap(+params.get('dpr'));

app.start();
document.getElementById('boot').classList.add('gone');
window.__forge.ready = true;

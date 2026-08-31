import { App } from './engine/app.js';
import { Post } from './engine/post.js';
import { Lighting } from './world/lighting.js';
import { World, startDoc } from './world/world.js';
import { People } from './world/people.js';
import { Dummies } from './world/dummies.js';
import { Doors } from './world/doors.js';
import { Props } from './world/props.js';
import { Player } from './player.js';
import { Input } from './input.js';
import * as stairs from './world/stairs.js';
import { walkStep, groundAt } from './world/colliders.js';
import { buildPanel, refreshPanel } from './editor/panel.js';
import { buildEditor } from './editor/editor.js';
import { getScenario, allScenarios } from './scenarios.js';
import { loadIndex, loadLevel, pickLevel } from './game/level.js';
import { loadCast, Characters } from './game/characters.js';
import { Session } from './game/session.js';
import { parseAt, startPos } from './game/save.js';
import { load } from './game/savestore.js';
import { installMusic } from './game/music.js';
import { gameHost } from './game/ui.js';
import { bootMode, playing } from './game/boot.js';
import { install as installFailure, watchBoot, fail, RELOAD } from './game/failure.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bootDev } from './dev/boot.js';
import { isLocal } from './dev/gate.js';

installFailure();

const params = new URLSearchParams(location.search);
const local = isLocal();
const mode = bootMode(params, local);

// Top-level await, above app.start(): the level document *is* the world, so there is nothing to
// build until it has loaded, and a render is of the world the game actually shows.
const index = await loadIndex();
const entry = pickLevel(index, params);
const level = await loadLevel(entry.id);
for (const w of level.warnings) console.warn(`level ${entry.id}: ${w}`);
if (level.dropped) console.warn(`level ${entry.id}: dropped ${level.dropped} bad entries`);
const { doc, saved } = startDoc(level.doc, entry.id);

const app = new App(document.getElementById('stage'));
app.expose();

const lighting = app.add(new Lighting());
const world = app.add(new World(doc, saved));
const people = app.add(new People(world.terrain));
const dummies = app.add(new Dummies(world.terrain));

const controls = new OrbitControls(app.camera, app.renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// Doors runs before the player: it owns the script that moves him and the arm length the camera
// reads this frame. The crowd is *not* hidden while inside — the greeter in the hall is an
// ordinary placed figure standing at those world coordinates, and hiding the rig hides her too.
const player = new Player(people, new Input(), controls);
const doors = app.add(new Doors(world, player, lighting, [world.object3D]));
app.add(player);
app.add(new Props(world.terrain, []));

// `?at=` is how gotoLevel hands the next level a doorway to arrive at, and the autosave's own
// `at` is where the last session left him. Neither applies under ?shot= or in the editor, where
// the authored start is what makes a render reproducible.
const at = playing(mode)
  ? startPos(doc.start, parseAt(params.get('at')), load()?.doc, doc.id)
  : doc.start;
player.pos.set(at.x, 0, at.z);
player.pos.y = player.groundY(player.pos.x, player.pos.z);
player.yaw = player.camYaw = player.moveYaw = at.yaw ?? doc.start.yaw;

app.post = new Post(app);
app.post.registerKnobs(app.quality);

buildPanel(app);

const cast = await loadCast().catch(e => {
  console.warn(`characters: nobody placed — ${e.message}`);
  return { cast: {}, warnings: [] };
});
for (const w of cast.warnings) console.warn(`characters: ${w}`);
const characters = new Characters(cast.cast, { people, dummies, world, level: doc.id });

Object.assign(window.__wf, {
  world, people, dummies, player, doors, characters, level: doc,
  walk: { walkStep, groundAt },
  stairs,
  scenarios: [],
  setScenario: id => getScenario(id)?.setup(app),
});

world.registerScenarios(doors);
window.__wf.scenarios = allScenarios().map(s => ({ id: s.id, label: s.label, zone: s.zone }));

// The scene editor is a dev tool: it is not built at all off a local origin, so there is nothing
// for ?editor or a CSS override to reach. The Level tab drives it through window.__wf.editor and
// is behind the same gate.
if (local) buildEditor(app, world, controls);

const shot = mode === 'shot' ? getScenario(params.get('shot')) : null;

// `rebuild: true` knobs change vertex counts, so they only take effect once the world is built
// again. Never under ?shot= — a rebuild landing between setup and capture would make the render
// non-reproducible.
if (!shot) {
  let pending = 0;
  app.quality.onRebuild(() => {
    clearTimeout(pending);
    pending = setTimeout(() => { world.rebuild(); }, 220);
  });
}

if (shot) {
  shot.setup(app);
  controls.enabled = false;
  player.controls = null;
  if (!params.has('hud')) document.body.classList.add('shotmode');
} else if (playing(mode)) {
  player.enabled = true;
  watchBoot(() => window.__wf?.ready);
  play().catch(e => fail(`The game could not start: ${e.message}. ${RELOAD}`));
}

async function play() {
  const host = gameHost();
  const conversations = await fetch('data/conversations.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  const names = Object.fromEntries(Object.entries(cast.cast).map(([id, c]) => [id, c.name]));
  const session = new Session(app, player, {
    host, level: doc, characters, names, world, doors,
    conversations: conversations?.nodes || {},
  });
  window.__wf.game = session;
  installMusic({ level: doc, session });
  app.systems.push({ update: dt => session.update(dt) });
  applyParams();
  refreshPanel();
}

// Re-applied once the session's knobs exist.
function applyParams() {
  if (params.has('preset')) app.quality.usePreset(params.get('preset'));
  for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
  if (params.has('dpr')) window.__wf.setDprCap(+params.get('dpr'));
}
applyParams();

app.start();
document.getElementById('boot').classList.add('gone');
window.__wf.ready = true;

// js/dev/ is the dev-tools agent's directory. Only gate.js is fetched on a live origin; the hub
// and its tabs load on demand behind the DEV button. Not under ?shot=: there is no game to author
// there, and the button was being baked into every reference render.
if (!shot) bootDev({ app, world, player, dummies, doors, characters });

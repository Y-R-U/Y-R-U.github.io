import { App } from './engine/app.js';
import { Lighting } from './world/lighting.js';
import { Demo } from './world/demo.js';
import { buildPanel, refreshPanel } from './editor/panel.js';
import { buildEditor } from './editor/editor.js';
import { Post } from './engine/post.js';
import { getScenario, allScenarios } from './scenarios.js';
import { People } from './world/people.js';
import { Chickens } from './world/chicken.js';
import { Player } from './player.js';
import { Doors } from './world/doors.js';
import { Spells } from './world/spell.js';
import * as stairs from './world/stairs.js';
import { walkStep, groundAt } from './world/colliders.js';
import { Input } from './input.js';
import { Session } from './game/session.js';
import { Slate } from './game/slate.js';
import { gameHost } from './game/ui.js';
import { bootMode, playing } from './game/boot.js';
import { blank } from './game/save.js';
import { hasSave } from './game/savestore.js';
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
// After the player: it reads the staff position the swing just produced.
const spells = app.add(new Spells(player, demo.terrain));

app.post = new Post(app);
app.post.registerKnobs(app.quality);

buildPanel(app);

window.__forge.people = people;
window.__forge.chickens = chickens;
window.__forge.player = player;
window.__forge.doors = doors;
window.__forge.spells = spells;
window.__forge.walk = { walkStep, groundAt };
window.__forge.stairs = stairs;
window.__forge.scenarios = allScenarios().map(s => ({ id: s.id, label: s.label, ref: s.ref, zone: s.zone }));
window.__forge.setScenario = id => getScenario(id)?.setup(app);

buildEditor(app, demo, controls);

const params = new URLSearchParams(location.search);
const mode = bootMode(params);
const shot = mode === 'shot' ? getScenario(params.get('shot')) : null;

// The one boot decision: under ?shot= and in the editor no game system is constructed at all, so
// a scenario's `time` stays the last word and the render stays reproducible.
// OrbitControls.update() calls lookAt(target) unconditionally, so leaving it in the loop
// silently overrode every scenario's `look` with (0, 4, 0).
if (shot) {
  shot.setup(app);
  controls.enabled = false;
  player.controls = null;
  if (!params.has('hud')) document.body.classList.add('shotmode');
} else if (playing(mode)) {
  player.enabled = true;
  play();
}

// Stand-in NPCs until Track D places the cast: the nearest wandering figures answer to the cast
// ids, so the context button and `talk` are real. Walking figures carry no cached x.
const CAST = ['bel', 'rell', 'wick_ww', 'marrin', 'sedge', 'alder'];
function targets() {
  const out = [];
  const idle = people.active?.filter(a => a.x !== undefined) || [];
  idle.slice(0, CAST.length).forEach((a, i) => {
    out.push({ id: CAST[i], kind: 'talk', label: 'talk', x: a.x, z: a.z, range: 4 });
  });
  return out;
}

async function play() {
  const host = gameHost();
  const fresh = !hasSave();
  const campaign = fresh
    ? await new Slate({ host, doc: blank(0) }).show()
    : null;
  const session = app.add(new Session(app, player, {
    fresh,
    campaign,
    world: {
      rev: () => demo.builder?.doc?.rev | 0,
      groundAt: (x, z, y) => groundAt(x, z, y),
      walkStep,
      targets,
      doorIndex: () => (doors.state === 'in' ? doors.activeIndex ?? null : null),
      jumpDoor: i => { doors.jump(i); return true; },
    },
  }));
  window.__forge.game = session;
  window.__forge.clock = session.clock;
  applyParams();
  refreshPanel();
  await session.start(params);
}

// Re-applied once the session's knobs exist: in play mode they are registered after the slate,
// which is after this file has run to the bottom.
function applyParams() {
  if (params.has('preset')) app.quality.usePreset(params.get('preset'));
  for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
  if (params.has('dpr')) window.__forge.setDprCap(+params.get('dpr'));
}
applyParams();

app.start();
document.getElementById('boot').classList.add('gone');
window.__forge.ready = true;

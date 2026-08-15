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
import { Vermin } from './world/vermin.js';
import { Spawner } from './game/spawner.js';
import { Props } from './world/props.js';
import { Cast } from './world/cast.js';
import { loadPlacements } from './game/placement.js';
import { Slate } from './game/slate.js';
import { gameHost } from './game/ui.js';
import { bootMode, playing } from './game/boot.js';
import { blank } from './game/save.js';
import { hasSave, load } from './game/savestore.js';
import { install as installFailure, watchBoot, fail, RELOAD } from './game/failure.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

installFailure();

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

// Declared before anything can start a frame. On a resume `play()` reaches `new Session` with no
// await, so app.start()'s first — synchronous — frame calls world.tick, and hooks closing over a
// `const` declared further down throw a temporal dead zone ReferenceError that aborts this file.
// `app.add` is only for the knobs: the session ticks the spawner, not the frame loop, and it stays
// inert until `play()` arms it, which never happens under ?shot= or in the editor.
const vermin = app.add(new Vermin(demo.terrain));
const spawner = app.add(new Spawner({
  rig: vermin, player,
  ground: (x, z) => groundAt(x, z, 0),
  // A step against itself: the walker is only pushed when it began inside a collider.
  blocked: (x, z) => walkStep(x, z, x, z, groundAt(x, z, 0)).hit,
}));

// Top-level await, above app.start() and above the boot overlay lifting: props are world geometry
// rather than game state, so they are in `?shot=` and in the editor too, and every render and every
// perf number is of the world the game actually shows. `loadPlacements` settles each file on its
// own and warns; this catch is for a file that parses and then throws on its way through.
const placed = await loadPlacements().catch(e => {
  console.warn(`props: nothing placed — ${e.message}`);
  return { props: [], cast: [] };
});
const props = app.add(new Props(demo.terrain, placed.props));
const cast = new Cast(people, placed.cast);

app.post = new Post(app);
app.post.registerKnobs(app.quality);

buildPanel(app);

window.__forge.demo = demo;
window.__forge.people = people;
window.__forge.chickens = chickens;
window.__forge.player = player;
window.__forge.doors = doors;
window.__forge.spells = spells;
window.__forge.vermin = vermin;
window.__forge.spawner = spawner;
window.__forge.props = props;
window.__forge.cast = cast;
window.__forge.walk = { walkStep, groundAt };
window.__forge.stairs = stairs;
window.__forge.scenarios = allScenarios().map(s => ({ id: s.id, label: s.label, ref: s.ref, zone: s.zone }));
window.__forge.setScenario = id => getScenario(id)?.setup(app);

buildEditor(app, demo, controls);

const params = new URLSearchParams(location.search);
const mode = bootMode(params);
const shot = mode === 'shot' ? getScenario(params.get('shot')) : null;

// `rebuild: true` knobs change vertex counts, so they only take effect once the world is built
// again. Debounced because they are sliders: dragging one fires on every step and a rebuild is
// ~200 ms. Never under ?shot= — the render must be the world the scenario asked for, and a
// rebuild landing between setup and capture would make the shot non-reproducible.
if (!shot) {
  let pending = 0;
  app.quality.onRebuild(() => {
    clearTimeout(pending);
    pending = setTimeout(() => { demo.rebuild(); }, 220);
  });
}

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
  // Never armed under ?shot= or in the editor: a bar appearing over a slow software render would
  // be in the PNG.
  watchBoot(() => window.__forge?.ready);
  play().catch(e => fail(`The game could not start: ${e.message}. ${RELOAD}`));
}

// The placed cast and the placed props. The ambient crowd is still there and still nameless — a
// wandering figure no longer answers to Bel.
function targets() {
  return props.targets().concat(cast.targets());
}

// Can the player's cast reach that creature? Deliberately the bolt's own question, asked the same
// way — horizontal, from the chest, against the same collider set with the same padding as
// `Spells.reach()` — so damage cannot land somewhere the bolt visibly stops.
const EYE = 1.35;
function sight(from, to) {
  const c = player.colliders;
  if (!c) return true;
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  return c.hit(from.x, from.y + EYE, from.z, dx / d, 0, dz / d, d, 0.12) >= d - 1e-3;
}

async function play() {
  const host = gameHost();
  const fresh = !hasSave();
  // The slate is first run *and* chapter select: a save whose campaign is finished comes back to
  // it to pick the next one, on the same character. Any other save goes straight into the world.
  const doc = fresh ? blank(0) : load()?.doc;
  const between = !!doc && doc.campaign.done.includes(doc.campaign.current);
  const campaign = fresh || between
    ? await new Slate({ host, doc: doc || blank(0) }).show()
    : null;
  const session = app.add(new Session(app, player, {
    fresh,
    campaign,
    world: {
      rev: () => demo.builder?.doc?.rev | 0,
      groundAt: (x, z, y) => groundAt(x, z, y),
      walkStep,
      targets,
      interact: (id, verb) => props.use(id, verb),
      arm: id => props.arm(id),
      doorIndex: () => (doors.state === 'in' ? doors.activeIndex ?? null : null),
      jumpDoor: i => { doors.jump(i); return true; },
      tick: dt => spawner.tick(dt),
      freeze: v => { vermin.frozen = v; },
      foes: () => spawner.foes(),
      sight,
      hit: (foe, damage) => spawner.hit(foe, damage),
      strikes: () => spawner.take(),
      aggro: (radius, pos) => spawner.aggro(radius, pos),
      respawn: (kind, n) => spawner.respawn(kind, n),
      watch: () => spawner.watch(),
    },
  }));
  window.__forge.game = session;
  window.__forge.clock = session.clock;
  applyParams();
  refreshPanel();
  await session.start(params);
  // The areas and the quest packs are the spawn plan, so nothing is placed until they have loaded.
  spawner.arm(session.quests.areas, session.quests.defs, () => session.doc.quests);
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

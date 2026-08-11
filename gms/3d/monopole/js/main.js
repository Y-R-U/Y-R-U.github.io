import { App } from './engine/app.js';
import { Post } from './engine/post.js';
import { Backdrop } from './world/backdrop.js';
import { Lighting } from './world/lighting.js';
import { World, ReachScene, introShots, reachLighting, verdictLighting, registerBackdropScenarios, registerStationScenarios, registerPlanetScenarios, registerBeltScenarios, registerFleetScenarios } from './world/scene.js';
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
import { camera } from './world/camera.js';
import { RoomScene, roomShots, quartersLighting, registerRoomScenarios } from './world/room.js';
import { updateShowcase } from './world/showcase.js';
import content from './sim/content.js';
import { createSimView } from './ui/simview.js';
import { panels } from './ui/panels.js';
import { buildHud } from './ui/hud.js';
import { createClock } from './ui/clock.js';
import { registerStoryEntries } from './ui/story.js';
import { newRun } from './ui/storypool.js';
import { intro } from './ui/intro.js';
import { verdict } from './ui/verdict.js';
import { gate } from './ui/gate.js';
import { chooseOrigin } from './ui/origin.js';
import { quarters } from './ui/quarters.js';
import { terminal } from './ui/terminal.js';
import { yard } from './ui/yard.js';
import { roomnav } from './ui/roomnav.js';
import { nav } from './ui/nav.js';
import { inspect } from './ui/inspect.js';
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
registerRoomScenarios(app, world);
// after the scenarios so the bloom knob's first apply finds a scene to rebuild the path for
app.post = new Post(app);
app.post.registerKnobs(app.quality);
buildKnobs(app);
buildShowroom(app);
camera.attach(app);
registerEntries(app, world, backdrop);

const sim = createSimView({ seed: 1001 });
panels.attach({ sim });
// which of each tactic's four real cases this run tells — reseeded whenever the run is
newRun(sim.seed);
sim.on(kind => { if (kind === 'reset') newRun(sim.seed); });
registerStoryEntries();

const params = new URLSearchParams(location.search);
const shot = params.has('shot') ? getScenario(params.get('shot')) : null;
const live = !shot && !params.has('sr');

let reach = null;
const hud = buildHud(sim, {
  onQuarters: () => quarters.toggle(),
  onFocus: () => {
    camera.enable(true);
    camera.setTouchEnabled(true);
    if (camera.rig?.home) return camera.resetView();
    camera.focus(reach ? reach.focusTarget('ledger') : world.subject, { dist: 620, phi: Math.PI * 0.40 });
  },
});

// One tick is one week, and a week only goes by when something is happening — see js/ui/clock.js.
const clock = createClock({
  sim,
  scene: () => reach,
  onState: (c, f) => { hud.setClock(c, f); },
});
app.add(clock);
hud.attachClock(clock);

// hud.react is already subscribed to the sim; this is the 3D's own subscription and nothing else
// in here reads state.
sim.on((kind, payload) => {
  if (kind === 'tick') { reach?.react(payload.events); panels.refresh(); terminal.refresh(); }
  else if (kind === 'reset') {
    reach?.seed(sim.state.ships);
    // a resumed save can be living somewhere else entirely, and the room is built once at boot
    quarters.setTier(sim.state.quarters || 'dockbox');
  }
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
  world, backdrop, lighting, showroom, camera, sim, panels, hud, nav,
  quarters, terminal, yard, verdict, verdictBeats: content.verdict.beats,
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

  // Your quarters, parented into the live scene so what is in the window is the real station,
  // the real planet and the real traffic. Hidden until you go in.
  const room = new RoomScene(app, world, { tier: sim.state.quarters || 'dockbox' });
  reach.group.add(room.group);
  room.group.visible = false;
  app.add({ update: dt => { room.update(dt); updateShowcase(dt); } });
  quarters.attach({ app, camera, room, tierId: sim.state.quarters || 'dockbox', home: HOME });
  terminal.attach({ app, world, camera, sim });
  yard.attach({ app, world, camera, sim, onLeave: () => nav.back() });
  roomnav.attach({ onTerminal: () => terminal.open() });

  showroom.register({
    id: 'terminal_live', group: 'misc', label: 'The terminal', note: 'the fullscreen room terminal',
    run: () => quarters.enter().then(() => terminal.open()),
  });

  showroom.register({
    id: 'quarters_live', group: 'misc', label: 'Your quarters', note: 'the room you actually live in',
    run: () => quarters.enter(),
  });

  // A tap identifies something; it does not commit the player to a panel. The card names it and
  // offers the panel as one of its buttons. The two things in the room are checked first —
  // ReachScene.siteAt knows nothing about either and would report the station behind them.
  inspect.attach({ sim, camera, reach });
  camera.onTap((hit, hits) => {
    if (quarters.inside) {
      if (hits?.some(h => h.object.userData?.terminal)) return terminal.open();
      if (hits?.some(h => h.object.userData?.window)) return roomnav.atWindow();
      return;
    }
    inspect.show(reach.siteAt(hit, hits));
  });

  // The clock does not start and the fingers do not reach the 3D until the front of the game
  // hands over. `begin()` is still the only place the company starts.
  const shots = introShots();
  camera.enable(true);
  camera.setTouchEnabled(false);
  sim.setSpeed(0);

  const startGame = (profile = null) => {
    intro.start({
      app, sim, panels, hud, camera, reach, showroom, shots, profile,
      // the ruling already did the framing the four cards used to do
      cards: !profile,
      begin: () => {
        camera.setTouchEnabled(true);
        // The handover must not yank the camera out of anywhere the player has already gone, and
        // that now includes the room the front of the game hands over into — cancelling the move
        // or re-homing on the system framing would both undo it mid-flight.
        if (quarters.inside) {
          quarters.applyLimits();
        } else {
          camera.cancelMove();
          camera.markHome(HOME());
          camera.resetView(1500);
        }
        hud.ticker(sim.content.get('system', 'tamber').ticker, 9000);
        if (sim.speed === 0 && sim.week === 0) sim.setSpeed(1);
      },
    });
  };

  // A returning player with a save skips straight past the ruling and the origin — both are
  // things you decide once. `?front=1` forces them back for testing, `?front=0` skips them.
  const front = params.get('front');
  const fresh = front === '1' || (front !== '0' && !hasSave());

  // The ruling happens somewhere else. Ledger, Dray Yard and the belt stay dark for it, and what
  // the camera walks up to instead is Meridian's own parked fleet — built for this and thrown away
  // on the beat that names the Reach, which is why that beat is a hard cut. The switch back to the
  // live lighting rides along: the ruling pushes the ship kit's rim key four kilometres out to
  // reach the fleet at all, and the star system does not want it there.
  let local = [];
  let here = false;
  // Split out of playRuling so the gate has something to stand on: the title card sits over the
  // ruling's own first framing, four kilometres off the fleet, rather than over whatever the
  // camera happened to be looking at while the scene built.
  const armRuling = () => {
    local = ['ledger', 'drayyard', 'kestrel'].map(id => reach.sites[id]).filter(Boolean);
    here = false;
    for (const o of local) o.visible = false;
    reach.showMeridian();
    verdictLighting(app.quality);
    const first = content.verdict.opening;
    camera.setFrom(first.pos, first.look, first.fov);
  };
  const reveal = () => {
    if (here) return;
    here = true;
    reach.hideMeridian();
    reachLighting(app.quality);
    for (const o of local) o.visible = true;
  };
  const playRuling = (sound = false) => {
    armRuling();
    return verdict.play({ camera, sound, onBeat: b => { if (b.here) reveal(); } }).finally(reveal);
  };
  // so tools/front.mjs --flow=keys can stand in both halves of the ruling and shoot the camera
  // keys where they land, rather than wherever a move happened to be when the shutter went
  Object.assign(window.__mono, { armRuling, revealRuling: reveal });

  showroom.register({
    id: 'cold_open', group: 'misc', label: 'The verdict — cold open',
    note: 'the Alliance ruling that opened the Reach',
    run: () => { camera.setTouchEnabled(false); playRuling(true).then(() => camera.setTouchEnabled(true)); },
  });

  // Back walks the chain the player walked in: a terminal screen, the terminal, the room, the
  // system, and then a card offering to carry on rather than closing the game.
  nav.start();

  if (!fresh) {
    const saved = readProfile();
    if (saved) { sim.profile = saved; sim.origin = saved.origin; }
    camera.setFrom(shots[0].pos, shots[0].look, shots[0].fov);
    startGame(saved);
  } else {
    document.body.classList.add('front');
    // The ruling is read aloud, and a browser will not make a sound until somebody has touched the
    // page — so the one card in the whole front of the game that asks to be tapped goes here, and
    // `?mute=1` walks straight past it into the silent cut the tooling has always screenshotted.
    const quiet = params.get('mute') === '1';
    armRuling();
    (quiet ? Promise.resolve(false) : gate.ask())
      .then(sound => playRuling(sound))
      .then(() => chooseOrigin({ seed: sim.seed }))
      .then(profile => {
        sim.reset(sim.seed, { origin: profile.origin, profile });
        writeProfile(profile);
        reach.seed(sim.state.ships);
        document.body.classList.remove('front');
        // The ruling's last framing is a hundred metres off the dock the rented box is cut into,
        // so going straight in from there is one continuous move rather than a cut. You end the
        // front of the game standing in the room you live in, which is the thing the rest of it
        // keeps sending you back to.
        quarters.enter('enter', 2200);
        startGame(profile);
      });
  }
}

function hasSave() {
  try { return !!localStorage.getItem('monopole.save.v1'); } catch { return false; }
}

function readProfile() {
  try { return JSON.parse(localStorage.getItem('monopole.profile.v1') || 'null'); } catch { return null; }
}

function writeProfile(p) {
  try { localStorage.setItem('monopole.profile.v1', JSON.stringify(p)); } catch { /* private mode */ }
}

// after the scenario, so --set=knob=value on the command line still wins
for (const [k, v] of params) if (app.quality.knobs.has(k)) app.quality.set(k, isNaN(+v) ? v : +v);
if (params.has('dpr')) window.__mono.setDprCap(+params.get('dpr'));
if (params.has('perf')) document.body.classList.add('perf-on');
if (params.has('showroom')) showroom.open();
if (params.has('sr')) showroom.run(params.get('sr'));
if (params.has('speed')) sim.setSpeed(+params.get('speed'));
if (params.has('panel')) panels.open(params.get('panel'));

app.start();
document.getElementById('boot').classList.add('gone');
window.__mono.ready = true;

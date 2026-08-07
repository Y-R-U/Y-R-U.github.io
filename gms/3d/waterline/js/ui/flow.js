// The match controller — C7. New file in pass 1, declared in HANDOFF_UI.
//
// main.js is frozen and builds the four UI modules without wiring them to each other, so this is
// where they meet. Each module calls register() at build time; when all four are up we boot one
// frame later, by which point main.js has finished and window.__waterline is fully populated.
//
// It never boots under ?shot=. That is the second half of the "the HUD is absent from a scored
// capture" guarantee — the first half is `body.shotmode #ui { display: none }` in style.css. A
// capture therefore has no game running at all, not merely a hidden one.

import * as sim from '../sim/index.js';
import * as net from '../net/multiplayer.js';
import { buildTable } from '../world/table.js';
import { GRADES } from '../world/sky.js';
import { MODES, UI } from '../config.js';
import { createAim } from './aim.js';
import { createPresenter } from './present.js';
import { buildLayoutPanel } from './layout.js';

const TIERS = sim.TIER_NAMES;

const parts = {};
let booted = false;

export function register(name, api) {
  parts[name] = api;
  if (!booted && parts.hud && parts.setup && parts.ladder && parts.overlay) {
    booted = true;
    // A microtask, not rAF: it runs the instant main.js's module body finishes and does not need
    // the tab to be visible.
    queueMicrotask(() => { try { boot(); } catch (e) { console.error('[waterline] ui boot failed', e); } });
  }
}

// A private layout seed drawn from real entropy (D8). Never derived from ?seed, never logged, never
// put in the URL: whoever holds the link must not be able to reconstruct the enemy fleet.
function entropy() {
  const a = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(a);
  else a[0] = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
  return a[0] % 0x7ffffffe + 1;
}

export const flow = {
  screen: null,
  game: null,
  cfg: null,
  view: null,
  busy: false,
};

let hook, app, save, hud, setup, ladderUI, overlay, aim, present, layout;
let table = null;                 // the table sized to THIS match
let dramaSeed = 0;                // the seed the DISPLAYED enemy fleet is drawn from (§7)
const tables = new Map();         // one per grid size; main.js builds the 10x10 one

function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('shot')) return;

  hook = window.__waterline;
  app = hook.app;
  save = hook.save;
  ({ hud, setup, ladder: ladderUI, overlay } = parts);

  document.body.classList.add('wl-play');
  if (params.has('perf') || params.has('hud')) document.body.classList.add('wl-perf');

  tables.set(`${MODES.classic.w}x${MODES.classic.h}`, hook.world.table);
  table = hook.world.table;

  aim = createAim({
    app, hook,
    getTable: () => table,
    getGame: () => flow.game,
    canAim: () => flow.game?.phase === 'AIM' && flow.game.sideToMove === 0 && !flow.busy,
    onGhost: (shot, cells) => {
      hud.setArmed(cells, shot && label(shot, cells), shot && wasted(cells));
    },
    onCommit: shot => fire(shot),
  });
  present = createPresenter({ hook, getTable: () => table, settings });
  // main.js is frozen and builds four UI modules; this is a fifth, so it is built from here. It
  // lives inside #ui, which is what keeps aim.js from raycasting the chart under it.
  layout = buildLayoutPanel(hud.root.parentNode);

  hud.bind({
    onArm: kind => armKind(kind),
    onConfirm: () => aim.commit(),
    onPause: () => pause(),
    onFleet: () => openLayout(),
  });
  setup.bind({
    onResume: () => resumeMatch(),
    onDiscard: () => { clearMatch(); showTitle(); },
    onQuick: manual => beginSingle({ ...MODES.classic, mode: 'classic', tier: 2 }, manual),
    onCustom: () => showCustom(),
    onCustomStart: (cfg, manual) => { save.set('custom', cfg); beginSingle({ ...cfg, mode: 'custom' }, manual); },
    onTournament: () => showLadder(),
    onMultiplayer: () => showMultiplayer(),
    onSettings: () => showSettings(),
    onPlaced: placements => startMatch(flow.cfg, placements),
    onBack: () => showTitle(),
  });
  ladderUI.bind({
    onFight: (rung, manual) => beginLadder(rung, manual),
    onBack: () => showTitle(),
    onReset: () => resetLadder(),
  });

  // Hold anywhere to fast-forward — not skip; the result still lands (BUILD_PLAN §7.4).
  const stage = document.getElementById('stage');
  const ff = on => { if (flow.busy) present.rate(on ? UI.fastForward : 1); };
  stage.addEventListener('pointerdown', () => ff(true));
  addEventListener('pointerup', () => ff(false));
  addEventListener('pointercancel', () => ff(false));

  addEventListener('resize', () => { if (flow.screen === 'play' && !flow.busy) aim.frame(); });

  // On a phone the tab is backgrounded far more often than it is closed, and `pagehide` is the
  // only one of the three that fires reliably on iOS. All three are cheap and idempotent.
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveMatch(); });
  addEventListener('pagehide', saveMatch);
  addEventListener('beforeunload', saveMatch);

  app.add({ update: dt => tickDusk(dt) });

  // The env map is a render target, so a lost GL context takes it and three cannot re-upload a
  // texture that has no pixels in JS. main.js read `sky.env` — a getter — once at boot and never
  // again, so the reassignment has to happen from here.
  app.onRestore(() => { app.scene.environment = hook.world.sky.refreshEnv(); });

  // main.js's hook.sim.* closes over a `game` that only its own newGame() sets, and a resumed match
  // never goes through it. That file is frozen, so the accessor is repointed here instead.
  const priorGame = hook.sim.game;
  hook.sim.game = () => flow.game ?? priorGame?.();

  hook.flow = debugHandle();
  if (!save.available) {
    overlay.note('Private browsing: this session will play fine, but progress will not be saved.');
  }
  showTitle();
}

const settings = () => save.get('settings', { cine: 'auto', place: 'auto', sound: true, flyout: 'on' });
// A save written before P3 has no `flyout` key, so anything that is not an explicit 'off' is on.
const flyoutOn = () => settings().flyout !== 'off';

const label = (shot, cells) => `${coord(shot.r, shot.c, shot.kind)} · ${cells.length} cell${cells.length > 1 ? 's' : ''}`;

// Firing into a cell you have already resolved is legal, wasted and — before this — unremarked.
// The sim already redacts, so `grid` is only what this side is entitled to know.
function wasted(cells) {
  const v = flow.view;
  if (!v || !cells?.length) return null;
  const n = cells.filter(c => v.grid[c.r * v.w + c.c] !== sim.UNKNOWN).length;
  if (!n) return null;
  return n === cells.length
    ? (n === 1 ? 'Already fired here' : 'Every cell here is already resolved')
    : `${n} of ${cells.length} already resolved`;
}

// Battleship coordinates: columns are letters, rows are 1-based. A heavy anchor sits on a lattice
// corner, so it is named for the cell it is the top-left of, with a hyphen.
function coord(r, c, kind) {
  const letter = String.fromCharCode(65 + c);
  return kind === 'heavy' ? `${letter}${r + 1}–${String.fromCharCode(66 + c)}${r + 2}` : `${letter}${r + 1}`;
}

// ── screens ──────────────────────────────────────────────────────────────────────────────────

function go(name) {
  flow.screen = name;
  document.body.dataset.screen = name;
  setup.hideAll();
  ladderUI.hide();
  overlay.hide();
  overlay.clearSlates();
  layout.close();
  hud.cue(false);
  document.body.classList.remove('wl-cine');
  hud.show(name === 'play');
  if (name !== 'play') aim.setActive(false);
}

function showTitle() {
  endMatch();
  go('title');
  setup.showTitle({
    ladder: save.get('ladder', null),
    stats: save.get('stats', null),
    multiplayer: net.describe(),
    resume: storedMatch(),
  });
  parkCamera();
}

function showCustom() {
  go('custom');
  setup.showCustom(save.get('custom', null) || { ...MODES.custom, tier: 2 });
}

function showLadder() {
  go('ladder');
  ladderUI.render(ladderState());
}

function showMultiplayer() {
  overlay.panel({
    id: 'mp',
    title: 'Multiplayer',
    body: net.reason(),
    actions: [{ label: 'Back', value: 'back', primary: true }],
  });
}

function showSettings() {
  const s = settings();
  overlay.panel({
    id: 'settings',
    title: 'Settings',
    fields: [
      { key: 'cine', label: 'Cinematics', type: 'select', value: s.cine,
        options: [['auto', 'Auto (shorten as the match runs)'], ['full', 'Always full'], ['off', 'Off — stay on the table']] },
      { key: 'place', label: 'Fleet', type: 'select', value: s.place,
        options: [['auto', 'Auto-place'], ['manual', 'Place it myself']] },
      { key: 'flyout', label: 'Fly-out', type: 'select', value: flyoutOn() ? 'on' : 'off',
        options: [['on', 'Watch the fleet re-form'], ['off', 'Change the layout without it']] },
    ],
    actions: [
      { label: 'Reset progress', value: 'reset' },
      { label: 'Done', value: 'done', primary: true },
    ],
    onChange: (key, value) => save.patch('settings', { [key]: value }),
  }).then(v => { if (v === 'reset') confirmReset(); });
}

function confirmReset() {
  overlay.panel({
    id: 'reset',
    title: 'Reset progress?',
    body: 'This clears the tournament ladder, the record of your play the top opponent learns from, and every setting.',
    actions: [{ label: 'Keep it', value: 'no', primary: true }, { label: 'Reset', value: 'yes', danger: true }],
  }).then(v => {
    if (v !== 'yes') return;
    save.clear();
    overlay.toast('Progress cleared');
    showTitle();
  });
}

// ── the ladder ───────────────────────────────────────────────────────────────────────────────

const ladderState = () => save.get('ladder', null) || sim.newLadder();

function resetLadder() {
  save.set('ladder', sim.newLadder());
  save.set('memory', null);
  overlay.toast('Tournament reset');
  showLadder();
}

function beginLadder(rung, manual) {
  const cfg = sim.rungConfig(rung);
  beginSingle({
    mode: 'ladder', rung, name: cfg.name, tier: cfg.tier,
    w: cfg.w, h: cfg.h, fleet: cfg.fleet, ordnance: cfg.ordnance,
  }, manual);
}

// ── starting a match ─────────────────────────────────────────────────────────────────────────

function beginSingle(cfg, manual) {
  const why = sim.fleetLegal(cfg.w, cfg.h, cfg.fleet);
  if (why) { overlay.toast(why); return; }
  flow.cfg = cfg;
  const wantManual = manual ?? settings().place === 'manual';
  if (wantManual) { go('place'); setup.showPlace(cfg); return; }
  startMatch(cfg, null);
}

function startMatch(cfg, placements) {
  const mem = cfg.mode === 'ladder' ? loadMemory() : null;
  const opts = {
    w: cfg.w, h: cfg.h, fleet: [...cfg.fleet],
    seed: entropy(),
    layoutSeed: entropy(),      // private (D8) — drawn here, kept here, never in the URL
    tiers: [null, cfg.tier ?? 2],
    first: 0,
    localSide: 0,
    ordnance: cfg.ordnance ?? undefined,
    memories: [null, mem],
  };
  let game;
  try { game = build(opts, placements); }
  catch (e) { overlay.toast(e.reason || e.message); return; }
  clearMatch();
  dramaSeed = entropy();
  enterMatch(game, cfg, true);
}

// Everything a match needs on screen, whether it was just built or just read back off disk.
function enterMatch(game, cfg, flyover) {
  flow.game = game;
  flow.cfg = cfg;
  const name = cfg.mode === 'ladder' ? cfg.name : TIERS[cfg.tier ?? 2];

  useTable(cfg.w, cfg.h);
  // Cinematics off means no flyover to open under a noon sky, so there is nothing for the blend to
  // arrive from — it would be 4 s of the sky changing over a board already being played.
  playScene(flyover && settings().cine !== 'off');
  go('play');
  present.reset();
  const v = refresh();
  layoutFleets(v);
  aim.setKind('shell');
  aim.setActive(true);
  aim.frame();
  hud.setOpponent(name);
  overlay.toast(`${cfg.w}×${cfg.h} · ${cfg.fleet.length} ships · ${name}`);
  opening(flyover);
}

// The opening flyover, then the loop. Awaited rather than raced: `open()` resolves immediately when
// cinematics are off or a sequence is missing. A resumed match takes the settle without the
// flyover — six seconds of establishing shot is for arriving, not for coming back.
async function opening(flyover) {
  flow.busy = true;
  hud.setBusy(true);
  aim.release();
  await present.open(flyover);
  if (flyover && settings().cine !== 'off') beginDusk();
  flow.busy = false;
  hud.setBusy(false);
  nextTurn();
  maybeCue();
}

// Nobody else lays the fleets out, and every cinematic beat asks the fleet where a cell is.
// Side 0 is where your ships really are. Side 1 is DRAMATISED and must be: the sim will not tell us
// where the enemy's ships are, and that is exactly what D2's caption is for. It is drawn from its
// own seed, which leaks nothing about the layout seed and is stored with the match so a resume
// puts the enemy back where the player last saw them.
// Runs whatever the cinematic setting is: side 0 carries the flagship the bridge is built into, so
// skipping it leaves the room floating with nothing under it (D30).
function layoutFleets(v) {
  const f = hook.world.fleet;
  try {
    const mine = v.ships.map(s => ({ id: s.id, len: s.len, ...corner(s.cells) }));
    const theirs = sim.packedPlacement(sim.makeRng(dramaSeed || entropy()), v.w, v.h, v.fleet)
      .map((p, i) => ({ id: i, len: p.len, r: p.r, c: p.c, dir: p.dir }));
    f.layout(0, { fleet: mine });
    f.layout(1, { fleet: theirs });
  } catch (e) { console.warn('[waterline] fleet layout', e); }
}

const corner = cells => ({
  r: cells[0].r,
  c: cells[0].c,
  dir: cells.length > 1 && cells[1].r === cells[0].r ? 'h' : 'v',
});

// ── the fleet layout editor, and the fly-out on save (D33) ───────────────────────────────────
//
// D33: `setBoard` is legal in AIM while your own board is untouched. The phase check was never the
// cheat; being fired on is. So the panel is editable for what is in practice your whole first turn,
// and after that it still opens — read-only, with the reason on screen. A dead control that gives
// no reason is worse than no control.

function layoutLocked() {
  const g = flow.game, v = flow.view;
  if (!g || !v) return 'No battle is running.';
  if (g.phase !== 'AIM') return 'This battle is over.';
  if (v.ownGrid.some(x => x !== sim.UNKNOWN)) {
    return 'The enemy has your range. Your fleet is committed for the rest of this battle.';
  }
  // Turn 0 and busy is the opening flyover, not a shot — saying a round is in the air would be a
  // lie, and the reason line is the whole point of the read-only panel.
  if (flow.busy) {
    return v.turns ? 'A shot is still in the air. The fleet can be moved once it lands.'
      : 'Wait for the bridge to settle.';
  }
  if (g.sideToMove !== 0) return 'The enemy is firing. Wait for your move.';
  return null;
}

function openLayout() {
  const v = flow.view;
  if (!v || flow.screen !== 'play' || layout.isOpen()) return;
  save.patch('seen', { fleet: true });
  hud.cue(false);
  const why = layoutLocked();
  aim.setActive(false);
  layout.open({
    w: v.w, h: v.h, fleet: [...v.fleet],
    ships: v.ships.map(s => ({ len: s.len, ...corner(s.cells) })),
    grid: v.ownGrid,
    editable: !why,
    reason: why || '',
    onSave: list => { saveLayout(list); },
    // `busy` means a beat or the fly-out closed it, and that owner restores the camera itself.
    onClose: reason => { if (reason !== 'save' && !flow.busy) afterLayout(); },
  });
}

// Everything the editor changed, committed in one call. The sim is the authority: if it refuses,
// nothing in the world moves and the player is told why.
async function saveLayout(list) {
  const g = flow.game;
  const before = flow.view.ships.map(s => corner(s.cells));
  try { sim.setBoard(g, 0, list); }
  catch (e) { overlay.toast(e.reason || e.message); afterLayout(); return; }
  const v = refresh();
  saveMatch();
  const moved = list.some((s, i) => s.r !== before[i].r || s.c !== before[i].c || s.dir !== before[i].dir);
  if (moved) await flyout(v);
  else overlay.toast('Fleet unchanged');
  afterLayout();
}

// Leave the bridge, watch the escorts take their new stations, come back. The flagship carries the
// room and does not move (D34) — that is the shot, not a limitation.
async function flyout(v) {
  const fleet = hook.world.fleet;
  const ms = UI.layout.reformMs;
  const mine = v.ships.map(s => ({ id: s.id, len: s.len, ...corner(s.cells) }));
  let move;
  try { move = fleet.reform(0, { fleet: mine }, { ms }); }
  catch (e) { console.warn('[waterline] reform', e); layoutFleets(v); return; }

  const director = hook.cine?.director;
  if (!flyoutOn() || settings().cine === 'off' || !director?.has?.('fleet_reform')) {
    move.finish();
    overlay.toast('Fleet re-formed');
    return;
  }

  flow.busy = true;
  hud.setBusy(true);
  aim.setActive(false);
  aim.release();
  const controls = overlay.cutscene({
    label: 'Skip',
    option: "Don't show this again",
    checked: !flyoutOn(),
    onSkip: () => { try { director.skip(); } catch {} },
    onOption: on => save.patch('settings', { flyout: on ? 'off' : 'on' }),
  });
  // The HUD is the room's instrument panel, not the film's — it has no business over a shot of the
  // sea. One class, so the HUD's own state machine is untouched and it comes back as it was.
  document.body.classList.add('wl-cine');
  try {
    const b = move.bounds;
    const sun = hook.world.sky.sunDir;
    await director.play('fleet_reform', {
      cx: b.cx, cz: b.cz, radius: b.radius, ms,
      aspect: app.camera.aspect || 1.78,
      sunX: sun?.x, sunZ: sun?.z,
      start: () => move.start(),
    });
  } catch (e) {
    console.warn('[waterline] fly-out', e);
  } finally {
    document.body.classList.remove('wl-cine');
    controls.close();
    // Skipped or watched, the ships end on their new stations. This is the line that makes the two
    // paths land the same board.
    move.finish();
  }
}

function afterLayout() {
  flow.busy = false;
  hud.setBusy(false);
  if (flow.screen !== 'play') return;
  aim.take();
  aim.setActive(true);
  try { app.quality.set('exposure', UI.aimExposure); } catch {}
  refresh();
}

// Once per player, not once per match, and only while the box would actually do something. `seen`
// is written when it is SHOWN, not when it is used: a player who ignored it once has been told.
function maybeCue() {
  if (save.get('seen', {}).fleet) return;
  if (flow.screen !== 'play' || layoutLocked()) return;
  setTimeout(() => {
    if (flow.screen !== 'play' || layoutLocked() || save.get('seen', {}).fleet) return;
    hud.cue(true);
    save.patch('seen', { fleet: true });
  }, UI.layout.cueDelayMs);
}

function build(opts, placements) {
  const g = hook.sim.newGame(opts);
  sim.placeFleet(g, 0, placements ?? null);
  sim.placeFleet(g, 1, null);
  return g;
}

function endMatch() {
  flow.game = null;
  flow.view = null;
  aim?.setActive(false);
  try { hook?.world.fleet.clearMarks(); } catch {}
}

// ── resume ───────────────────────────────────────────────────────────────────────────────────
//
// A phone backgrounds a tab constantly, and pass 1 lost the match every time it did. The sim is
// pure and `serialize`/`deserialize` are declared invariants, so a match is exactly its serialized
// game plus the config it was started from and the seed the dramatised enemy fleet was drawn from.
// Nothing else here is state.

const RESUME_V = 1;

function saveMatch() {
  const g = flow.game;
  if (!g || !flow.cfg || g.phase === 'OVER' || flow.screen !== 'play') return;
  try {
    save.set('match', { v: RESUME_V, game: sim.serialize(g), cfg: flow.cfg, drama: dramaSeed, at: Date.now() });
  } catch (e) {
    console.warn('[waterline] could not store the match', e);
  }
}

function clearMatch() {
  try { save.set('match', null); } catch {}
}

// What the title screen shows, or null. Reading it is also where a save this build cannot use gets
// thrown away — a resume the player taps and that then fails is worse than one never offered.
function storedMatch() {
  const rec = save.get('match', null);
  if (!rec || rec.v !== RESUME_V) { if (rec) clearMatch(); return null; }
  try {
    const g = sim.deserialize(rec.game);
    const days = (Date.now() - (rec.at || 0)) / 86400000;
    if (g.phase === 'OVER' || !rec.cfg?.fleet || !(days < UI.resumeMaxDays)) { clearMatch(); return null; }
    const v = sim.view(g, 0);
    return {
      name: rec.cfg.mode === 'ladder' ? rec.cfg.name : TIERS[rec.cfg.tier ?? 2],
      mode: rec.cfg.mode,
      turns: v.turns,
      yours: v.ships.filter(s => !s.sunk).length,
      theirs: v.enemyShips.length ? v.enemyShips.filter(s => !s.sunk).length : v.fleet.length,
      fleet: v.fleet.length,
    };
  } catch { clearMatch(); return null; }
}

function resumeMatch() {
  const rec = save.get('match', null);
  let g;
  try { g = sim.deserialize(rec.game); }
  catch (e) {
    clearMatch();
    overlay.toast(e.reason || 'That saved match could not be read');
    showTitle();
    return;
  }
  dramaSeed = rec.drama || entropy();
  enterMatch(g, rec.cfg, false);
}

// One table per grid size. main.js builds the 10x10 one and parents it to bridge.tableAnchor;
// table.js keeps its own pump list, so a second table animates without any wiring.
function useTable(w, h) {
  const key = `${w}x${h}`;
  let t = tables.get(key);
  if (!t) {
    t = buildTable(w, h);
    hook.world.bridge.tableAnchor.add(t.object3D);
    tables.set(key, t);
  }
  for (const [k, other] of tables) other.object3D.visible = k === key;
  table = t;
  // C6's presenter reads `hook.world.table` for its pulses, and main.js froze that at the classic
  // 10×10 instance. Repointing it is how a 12×12 ladder rung pulses the table it is played on.
  hook.world.table = t;
  return t;
}

// ── the scene the game is played in ──────────────────────────────────────────────────────────

// `fromNoon` opens the match under a midday sky for the flyover; `duskScene()` is still applied
// first so the end state is reached by exactly one code path (D32).
function playScene(fromNoon) {
  const { bridge, bridgeLights } = hook.world;
  dusking = null;
  try {
    duskScene();
    if (fromNoon) noonScene();
    bridge.setEnv(0.16);
    bridge.setHaze(0x2a2018, 0.055);
    bridge.setCrewRim(0x4a3a3c, 1.0);
    bridge.setPlotter(false);
    bridgeLights.useRig('bridge');
    table.setLook('holo');
    // The instruments are a third of what makes the table read as real, and they also sit on top of
    // playable cells — the parallel rule alone covers four. Off while a match is running; C2 moving
    // them into the chart bleed would get them back.
    table.setClutter(false);
    app.quality.set('exposure', UI.aimExposure);
    // C1's framing placeholder and W0's stand-in cruiser both sit where the room is.
    for (const o of [...app.scene.children]) {
      if (o.name.startsWith('_ph') || o.name.startsWith('_bd')) app.scene.remove(o);
      if (o.name === 'ship') o.visible = false;
    }
  } catch (e) { console.warn('[waterline] play scene', e); }
}

// The look the match is played at and every bridge shot is authored against. setSun mutates
// GRADES.dusk, which is why this runs before anything reads that grade as a blend target.
function duskScene() {
  const { sky, lighting, ocean } = hook.world;
  sky.setGrade('dusk');
  sky.setSun(23, 1.9);
  lighting.setGrade('dusk');
  ocean.setSeaState(null);
}

function noonScene() {
  const { lighting, ocean } = hook.world;
  lighting.setGrade('noon');
  // Dusk's sea held across the whole opening: `state` indexes SEA_STATES, so a blended grade can
  // only ever step between two of them, and that step doubles the wave height in one frame.
  ocean.setSeaState(GRADES.dusk.sea.state);
}

// Aaron, on a phone: the flyover's orange water reads as broken because nothing in frame explains
// it; from inside the bridge the same grade "looks amazing". So the sky states its hour and turns
// (D32). Deliberately not awaited — the board is live behind it and a tap must land.
let dusking = null;

function beginDusk() {
  const o = UI.opening;
  overlay.slate(o.log, o.logNote, o.slateMs);
  dusking = { el: 0, hold: o.holdMs / 1000, ms: o.blendMs / 1000 };
}

function tickDusk(dt) {
  if (!dusking) return;
  dusking.el += dt;
  const u = (dusking.el - dusking.hold) / dusking.ms;
  if (u <= 0) return;
  if (u >= 1) { dusking = null; duskScene(); return; }
  const t = u * u * (3 - 2 * u);
  hook.world.sky.blend('noon', 'dusk', t);
}

function parkCamera() {
  try { aim?.parkWide(); } catch {}
}

// ── the turn loop ────────────────────────────────────────────────────────────────────────────

function refresh() {
  const g = flow.game;
  if (!g) return;
  const v = sim.view(g, 0);
  flow.view = v;
  table.setState(v);
  hud.setState(v, {
    yours: g.sideToMove === 0 && g.phase === 'AIM',
    busy: flow.busy,
    kinds: kindAvailability(v),
  });
  return v;
}

function kindAvailability(v) {
  return sim.KINDS.map(k => ({
    kind: k,
    charges: k === 'shell' ? Infinity : v.ordnance[k],
    start: k === 'shell' ? Infinity : v.ordnanceStart[k],
    enabled: k === 'shell' || v.ordnance[k] > 0,
  }));
}

function armKind(kind) {
  const v = flow.view;
  if (v && kind !== 'shell' && !v.ordnance[kind]) { overlay.toast('No charges left'); return false; }
  aim.setKind(kind);
  refresh();
  return true;
}

async function fire(shot) {
  const g = flow.game;
  if (!g || flow.busy || g.phase !== 'AIM' || g.sideToMove !== 0) return;
  const why = sim.whyIllegal(g, 0, shot);
  if (why) { overlay.toast(why); return; }
  let events;
  try { events = sim.fire(g, 0, shot); }
  catch (e) { overlay.toast(e.reason || e.message); return; }
  aim.clear();
  hud.setArmed(null);
  save.bump('stats', 'shots');
  if (events.some(e => e.t === 'result' && e.hit && !e.repeat)) save.bump('stats', 'hits');
  if (events.some(e => e.t === 'sunk')) save.bump('stats', 'sunk');
  await beat(events, 0);
}

async function enemyTurn() {
  const g = flow.game;
  if (!g || flow.busy || g.phase !== 'AIM' || g.sideToMove !== 1) return;
  let events;
  try { events = sim.fire(g, 1, sim.aiMove(g, 1)); }
  catch (e) { console.error('[waterline] enemy turn', e); overlay.toast('The enemy fire-control failed'); return; }
  await beat(events, 1);
}

async function beat(events, by) {
  flow.busy = true;
  layout.close();
  hud.cue(false);
  aim.setActive(false);
  aim.release();
  hud.setBusy(true);
  refresh();
  try { await present.play(events, by, flow.game); }
  catch (e) { console.warn('[waterline] presenter', e); }
  present.rate(1);
  flow.busy = false;
  hud.setBusy(false);
  const v = refresh();
  if (flow.game?.phase === 'OVER') { finish(v); return; }
  saveMatch();
  await sleep(UI.turnGapMs);
  nextTurn();
}

// The busy guard is load-bearing, not defensive. Measured: a second shot fired inside the 260 ms
// gap between beats starts a new beat, and this function — resuming from the OLD beat's sleep —
// then also starts the enemy's. Two presentations ran at once and finish() was called twice, which
// closed the result panel and dropped the player on the title screen.
function nextTurn() {
  const g = flow.game;
  if (!g || flow.busy || g.phase !== 'AIM') return;
  if (g.sideToMove === 0) {
    // D25 — the sequence is over, so the camera comes back here. `bridge_return` only runs after
    // YOUR shot, so after an enemy volley this is also what brings the camera in off the water.
    aim.take();
    aim.setActive(true);
    try { app.quality.set('exposure', UI.aimExposure); } catch {}
    refresh();
  } else {
    aim.setActive(false);
    enemyTurn();
  }
}

// ── the end of a match ───────────────────────────────────────────────────────────────────────

function finish(v) {
  const g = flow.game;
  const won = v.winner === 0;
  const cfg = flow.cfg;
  clearMatch();
  save.bump('stats', 'games');
  save.bump('stats', won ? 'wins' : 'losses');

  let after = null;
  if (cfg.mode === 'ladder') {
    after = sim.applyLadderResult(ladderState(), won);
    save.set('ladder', after);
    learn(g);
  }

  const lines = [
    `${v.turns} shots fired`,
    `${v.enemyShips.filter(s => s.sunk).length} of ${v.fleet.length} enemy ships sunk`,
    `${v.ships.filter(s => s.sunk).length} of ${v.fleet.length} of yours lost`,
  ];
  if (after) {
    lines.push(after.complete && won && after.rung === sim.ladderRungs.length
      ? 'Campaign complete'
      : `Rung ${after.rung} · ${sim.rungConfig(after.rung).name}`);
  }

  go('result');
  // The last beat leaves the camera at an impact, which is a dark hull filling the frame. Bring it
  // back to the board so the result reads against the game's own look and the finished chart.
  aim.take();
  overlay.panel({
    id: won ? 'win' : 'loss',
    title: won ? 'Enemy fleet destroyed' : 'Fleet lost',
    subtitle: cfg.mode === 'ladder' ? cfg.name : TIERS[cfg.tier ?? 2],
    body: lines,
    actions: [
      cfg.mode === 'ladder'
        ? { label: 'Tournament', value: 'ladder', primary: true }
        : { label: 'Fight again', value: 'again', primary: true },
      { label: 'Menu', value: 'menu' },
    ],
  }).then(a => {
    if (a === 'again') { const c = flow.cfg; endMatch(); beginSingle(c, null); }
    else if (a === 'ladder') { endMatch(); showLadder(); }
    else showTitle();
  });
}

function pause() {
  if (!flow.game) return;
  overlay.panel({
    id: 'pause',
    title: 'Paused',
    body: 'Leaving keeps this match — it will be waiting on the title screen.',
    actions: [
      { label: 'Resume', value: 'resume', primary: true },
      { label: 'Settings', value: 'settings' },
      { label: 'Leave', value: 'leave' },
      { label: 'Give up', value: 'quit', danger: true },
    ],
  }).then(a => {
    if (a === 'settings') showSettings();
    else if (a === 'leave') { saveMatch(); showTitle(); }
    else if (a === 'quit') { clearMatch(); showTitle(); }
    else { overlay.hide(); }
  });
}

// ── aiMemory (the decision is written up in HANDOFF_UI) ──────────────────────────────────────
//
// Wired, and only for the tournament. A hand-edited or stale save must never brick a match, so
// what comes out of storage is validated by the sim before it is handed to newGame and dropped
// silently if it is not a Memory. `memoryProblem` is the sim's own check and is now exported, so
// this is the documented path rather than pass 1's drop-and-retry around a missing export.

function loadMemory() {
  const raw = save.get('memory', null);
  if (!raw) return null;
  const why = sim.memoryProblem(raw);
  if (!why) return raw;
  save.set('memory', null);
  console.warn('[waterline] stored opponent memory dropped:', why);
  return null;
}

function learn(g) {
  try {
    const layout = sim.revealedLayout(g, 0);
    if (!layout) return;
    let mem = loadMemory() || sim.newMemory();
    mem = sim.observeLayout(mem, g.w, g.h, layout);
    mem = sim.observeShots(mem, g.w, g.h, sim.shotHistory(g, 0));
    save.set('memory', mem);
  } catch (e) { console.warn('[waterline] memory', e); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A named handle for the harness. `window.__waterline.flow` is the whole game state machine.
export function debugHandle() {
  return {
    flow, get game() { return flow.game; },
    screen: () => flow.screen,
    quick: manual => beginSingle({ ...MODES.classic, mode: 'classic', tier: 2 }, manual),
    start: (cfg, placements) => startMatch(cfg, placements),
    ladder: rung => beginLadder(rung, false),
    aimAt: (r, c, kind) => { if (kind) hud.arm(kind); return aim.setAnchor(r, c, kind); },
    fire: shot => fire(shot ?? aim.shot()),
    view: () => (flow.game ? sim.view(flow.game, 0) : null),
    title: () => showTitle(),
    dusking: () => dusking,
    openLayout: () => openLayout(),
    layoutLocked: () => layoutLocked(),
    layoutPanel: () => layout,
    saveLayout: list => saveLayout(list),
    stored: () => storedMatch(),
    resume: () => resumeMatch(),
    persist: () => saveMatch(),
  };
}

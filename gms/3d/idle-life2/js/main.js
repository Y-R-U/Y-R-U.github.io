import { BUILD } from './core/version.js?v=20261004a';
import { flags } from './core/flags.js?v=20261004a';
import { createBus } from './core/bus.js?v=20261004a';
import { lifecycle } from './core/lifecycle.js?v=20261004a';
import { DISTRICTS } from './data/districts.js?v=20261004a';
import { LINES } from './data/lines.js?v=20261004a';
import { MANAGERS } from './data/managers.js?v=20261004a';
import { ITEMS } from './data/items.js?v=20261004a';
import { EVENTS, EVENT_GAP } from './data/events.js?v=20261004a';
import { HOUSING } from './data/housing.js?v=20261004a';
import { CONTRACTS } from './data/contracts.js?v=20261004a';
import { SEASONS } from './data/seasons.js?v=20261004a';
import { ACHIEVEMENTS } from './data/achievements.js?v=20261004a';
import { PALETTE, DISTRICT_PALETTES } from './data/palette.js?v=20261004a';
import { PLOTS, STREET, ROAD_GRAPH, HOME_ANCHOR } from './data/plots.js?v=20261004a';
import { createGame } from './state/game.js?v=20261004a';
import { createSaveStore } from './state/save.js?v=20261004a';
import { createShipments } from './state/shipments.js?v=20261004a';
import { createRenderHost } from './render/host.js?v=20261004a';
import { createKit } from './render/kit/index.js?v=20261004a';
import { createWorld } from './render/world.js?v=20261004a';
import { createActors, wireRenderCore } from './render/actors.js?v=20261004a';
import { createFx } from './render/fx.js?v=20261004a';
import { createLife } from './render/life.js?v=20261004a';
import hollowsEve from './render/season/hollows-eve.js?v=20261004a';
import { createUI } from './ui/app.js?v=20261004a';

const gameData = {
  build: BUILD, lines: LINES, districts: DISTRICTS, managers: MANAGERS, items: ITEMS, events: EVENTS, eventGap: EVENT_GAP,
  housing: HOUSING, contracts: CONTRACTS, seasons: SEASONS, achievements: ACHIEVEMENTS,
};
const worldData = {
  lines: LINES, plots: PLOTS, street: STREET, roadGraph: ROAD_GRAPH, homeAnchor: HOME_ANCHOR,
  palette: PALETTE, districtPalettes: DISTRICT_PALETTES,
};

const bus = createBus();
const store = createSaveStore(localStorage);
if (flags.reset) store.clear();
const loaded = flags.nosave ? { ok: false } : store.load();
const save = loaded.ok ? loaded.state : null;
if (!loaded.ok && loaded.reason && loaded.reason !== 'empty') console.warn('[il2] save not loaded:', loaded.reason);

const seed = flags.seed ?? save?.seed ?? (Date.now() % 2147483647);
const game = createGame({ data: gameData, save, seed, nowWall: () => Date.now(), allowCheat: flags.debug || flags.demo });
let bootReport = null;
if (save && save.savedAt) bootReport = game.advanceOffline(Math.max(0, (Date.now() - save.savedAt) / 1000));
if (flags.demo) game.act('cheat', { cash: 2e5, unlockAll: true, managers: true, levels: 60 });

const shipments = createShipments(game, gameData);
const host = createRenderHost({ lifecycle, flags, bus });
const kit = createKit();
const world = createWorld({ kit, data: worldData });
const actors = createActors(world, kit, worldData);
const fx = createFx(world, kit);
const life = createLife(world, kit);
wireRenderCore({ game, host, world, shipments, actors, fx, bus });
hollowsEve.install(world, { kit, game });
host.setWorld(world);
if (flags.focus && world.plots.has(flags.focus)) world.heroRig.pin(flags.focus);

host.onFrame((dt, now, visibleLines) => {
  world.update(dt, game, shipments, visibleLines, host.debug.tier);
  actors.update(shipments, game.simTime);
  fx.update(dt);
  life.update(dt, game.state);
});

game.on('pileSold', ({ lineId }) => {
  const p = world.plots.get(lineId);
  if (p) fx.burst([p.group.position.x + p.pileAnchor[0], 0, p.group.position.z + p.pileAnchor[2]]);
});

const ui = createUI({ game, host, bus, data: gameData });
ui.mount(document.getElementById('root'));
if (bootReport) ui.showOffline(bootReport);
if (loaded.fromBackup || store.quarantined) ui.toast("💾 Old save couldn't be read — kept a copy", { ms: 6000 });
if (store.persistence === 'off' && loaded.reason === 'future') ui.toast('🔄 Newer save found — tap ⚙️ › reload', { ms: 8000 });
shipments.reseed(game.simTime);

function persist() {
  if (flags.nosave || window.__il2?.persistOff) return;
  store.write(game.serialize());
}
let dirty = false;
for (const t of ['bought', 'unlocked', 'pileSold']) game.on(t, () => { dirty = true; store.arm(); });
let soonTimer = 0;
for (const t of ['retired', 'life:beat', 'district', 'contract', 'season', 'item']) game.on(t, () => {
  store.arm();
  clearTimeout(soonTimer);
  soonTimer = setTimeout(persist, 1000);
});
setInterval(() => { if (dirty || game.state.cash > 0) { persist(); dirty = false; } }, 10000);
lifecycle.on('suspend', persist);
lifecycle.on('pagehide', persist);
lifecycle.on('resume', ({ awaySec }) => {
  const r = game.advanceOffline(awaySec);
  shipments.reseed(game.simTime);
  ui.showOffline(r);
  host.markDirty('*');
  kick();
});

let last = 0, rafId = 0, lastLoop = 0;
const il2 = { game, host, ui, lifecycle, world, shipments, bus, flags, BUILD, ready: false };
window.__il2 = il2;

function loop(now) {
  rafId = requestAnimationFrame(loop);
  lastLoop = performance.now();
  const dt = last ? Math.min(1, (now - last) / 1000) : 0;
  last = now;
  game.tick(dt * flags.fast);
  shipments.update(game.simTime);
  host.render(now);
  ui.update(now);
  if (!il2.ready && host.debug.presented > 0) {
    il2.ready = true;
    window.__il2Boot?.();
  }
}
function kick() {
  cancelAnimationFrame(rafId);
  last = 0;
  rafId = requestAnimationFrame(loop);
}
bus.on('host:stall', () => { if (performance.now() - lastLoop > 1000) kick(); });
kick();

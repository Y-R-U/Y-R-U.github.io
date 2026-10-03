import { BUILD } from './core/version.js?v=20261004b';
import { flags } from './core/flags.js?v=20261004b';
import { createBus } from './core/bus.js?v=20261004b';
import { lifecycle } from './core/lifecycle.js?v=20261004b';
import { DISTRICTS, COURIER } from './data/districts.js?v=20261004b';
import { LINES } from './data/lines.js?v=20261004b';
import { MANAGERS } from './data/managers.js?v=20261004b';
import { EVENTS, EVENT_GAP, SPECIAL_GAP } from './data/events.js?v=20261004b';
import { PALETTE, DISTRICT_PALETTES } from './data/palette.js?v=20261004b';
import { PLOTS, STREET, ROAD_GRAPH, HUB_ANCHOR } from './data/plots.js?v=20261004b';
import { createGame } from './state/game.js?v=20261004b';
import { createSaveStore } from './state/save.js?v=20261004b';
import { createShipments } from './state/shipments.js?v=20261004b';
import { createRenderHost } from './render/host.js?v=20261004b';
import { createKit } from './render/kit/index.js?v=20261004b';
import { createWorld } from './render/world.js?v=20261004b';
import { createActors, wireRenderCore } from './render/actors.js?v=20261004b';
import { createFx } from './render/fx.js?v=20261004b';
import { createUI } from './ui/app.js?v=20261004b';

const gameData = {
  build: BUILD, lines: LINES, districts: DISTRICTS, courier: COURIER, managers: MANAGERS, events: EVENTS, eventGap: EVENT_GAP, specialGap: SPECIAL_GAP,
};
const worldData = {
  lines: LINES, plots: PLOTS, street: STREET, roadGraph: ROAD_GRAPH, hubAnchor: HUB_ANCHOR,
  palette: PALETTE, districtPalettes: DISTRICT_PALETTES,
};

const bus = createBus();
const store = createSaveStore(localStorage);
if (flags.reset) store.clear();
const loaded = flags.nosave ? { ok: false } : store.load();
const save = loaded.ok ? loaded.state : null;
if (!loaded.ok && loaded.reason && loaded.reason !== 'empty') console.warn('[iw2] save not loaded:', loaded.reason);

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
wireRenderCore({ game, host, world, shipments, actors, fx, bus });
host.setWorld(world);
if (flags.focus && world.plots.has(flags.focus)) world.heroRig.pin(flags.focus);
host.setHeroHot(() => {
  const r = world.heroRig, sp = world.spectacle;
  if (r.orbit?.busy || r.shooting || r.mode === 'cutin') return true;
  if (!sp) return false;
  if ('hot' in sp) return !!sp.hot;
  const k = sp.scenes;
  for (let i = 0; i < k.length; i++) if (k[i] !== 'gag') return true;
  return false;
});

host.onFrame((dt, now, visibleLines) => {
  world.update(dt, game, shipments, visibleLines, host.debug.tier);
  actors.update(shipments, game.simTime);
  fx.update(dt);
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
  if (flags.nosave || window.__iw2?.persistOff) return;
  store.write(game.serialize());
}
let dirty = false;
for (const t of ['bought', 'unlocked', 'pileSold']) game.on(t, () => { dirty = true; store.arm(); });
let soonTimer = 0;
for (const t of ['district', 'beat']) game.on(t, () => {
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
const iw2 = { game, host, ui, lifecycle, world, shipments, bus, flags, BUILD, ready: false };
window.__iw2 = iw2;

function loop(now) {
  rafId = requestAnimationFrame(loop);
  lastLoop = performance.now();
  const dt = last ? Math.min(1, (now - last) / 1000) : 0;
  last = now;
  game.tick(dt * flags.fast);
  shipments.update(game.simTime);
  host.render(now);
  ui.update(now);
  if (!iw2.ready && host.debug.presented > 0) {
    iw2.ready = true;
    window.__iw2Boot?.();
  }
}
function kick() {
  cancelAnimationFrame(rafId);
  last = 0;
  rafId = requestAnimationFrame(loop);
}
bus.on('host:stall', () => { if (performance.now() - lastLoop > 1000) kick(); });
kick();

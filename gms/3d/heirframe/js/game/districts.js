import { createNav } from './nav.js';

export const DISTRICT_NAMES = { aurum_plaza: 'Aurum Plaza', brightline: 'Brightline Boulevard', terraces: 'Verdant Terraces', arcology: 'Nexus Arcology', arcology_servers: 'Arcology Server Floor', portside: 'Portside', stacks: 'The Stacks', home: 'Home · Pod 4471', spine: 'The Spine' };
const NAMES = DISTRICT_NAMES;
const AMBIENT = { aurum_plaza: 'plaza', brightline: 'boulevard', terraces: 'park', arcology: 'interior', arcology_servers: 'interior' };
const EMITTERS = { aurum_plaza: [['fountain', 0, 0, 1], ['waterfall', -47, -62, 1], ['waterfall', 66, -96, 1.2], ['fountain', -47, -57, 0.6]], brightline: [['traffic', 0, -60, 0.8], ['crowd', 0, 20, 0.7]],
  terraces: [['wind', 0, 0, 0.6], ['fountain', 0, -30, 0.7]], arcology: [['holo', 0, 0, 0.6], ['machine', 0, -30, 0.5]], arcology_servers: [['machine', 0, 0, 0.9]] };

// District travel (P2b world API): the Transit Relay interactable, contract-driven hops, and the swap cleanup
// (player to the relay, strays and mission props cleared, nav rebuilt, sites re-registered with the sim).
export function createDistricts(G, ctx) {
  const { world, sim, ui, audio, player, rig } = ctx;
  let emitters = [];
  const D = { busy: false };

  function ambience(id) {
    for (const e of emitters) e?.stop?.();
    audio.ambient(AMBIENT[id] || 'city');
    emitters = (EMITTERS[id] || []).map(([k, x, z, level]) => audio.emitter(k, { x, z, level }));
  }

  // every district swap (relay, save resume, story jumps): nothing from the old district may survive it
  function cleanup(w, id) {
    G.enemies.clear(() => true);
    for (const d of [...G.enemies.decoys]) G.enemies.removeDecoy(d);
    G.props.collectAll(ctx.onLootCollect);
    if (!G.runner.active) G.props.clearMission();
    G.props.bindWorld();
    G.boss?.end();
    G.heat?.reset?.();
    G.combat?.reset();
    G.nav = ctx.nav = createNav(world);
    G.runner.reset?.();
    sim.setSites(id, world.sites);
    player.setTarget?.(null);
    G.near = null;
    ambience(id);
  }
  const unsub = world.onDistrict ? world.onDistrict(cleanup) : null;

  let arrive = 'relay';
  function onSwap(w, id) {
    if (!unsub) cleanup(w, id);
    const sp = world.spawnPoints[arrive] || world.spawnPoints.relay || world.spawnPoints.player;
    const p = ctx.nav.nearest(sp.x, sp.z + 2.5) || sp;
    player.teleport(p.x, p.z, Math.PI);
    rig.target.copy(player.pos); rig.snap();
    G.log?.push?.(`district ${id}`);
  }

  // hop to another district through the relay tunnel; resolves true when there
  async function travel(id, { reason = 'relay', via = 'relay' } = {}) {
    if (D.busy || !world.loadDistrict) return false;
    if (world.district?.id === id) return true;
    if (via === 'lift') sim.unlockDistrict(id);   // the lift bank is always open between Arcology floors
    // lifts (and the dev start-point list) go even where the sim has no district entry (B4, Home)
    const r = via !== 'relay' ? (sim.travel(id).ok ? { ok: true } : { ok: true, soft: true }) : sim.travel(id);
    if (!r.ok) {
      ui?.toast(r.reason === 'heat' ? 'Transit Relays locked' : 'District locked', 'bad', { sub: r.reason === 'heat' ? 'Lose some Heat first (4★ locks the relays)' : 'The story opens it' });
      audio.sfx('ui_deny');
      return false;
    }
    D.busy = true;
    player.frozen = true;
    audio.sfx('contract_accept', { vol: 0.6 });
    arrive = via === 'dev' ? 'player' : via;
    try { await (via === 'lift' && world.liftTransition ? world.liftTransition(id, { onSwap }) : world.relayTransition(id, { onSwap })); }
    catch (e) { console.error('relay failed', e); }
    player.frozen = false;
    D.busy = false;
    ui?.toast(NAMES[id] || id, 'info', { sub: reason === 'contract' ? 'Contract site' : via === 'lift' ? 'Lift' : via === 'dev' ? 'Dev start point' : 'Transit Relay' });
    return true;
  }

  // Arcology lift pads: {id:'lift', to}
  function lift(it) {
    const to = it?.to;
    if (!to) return;
    if (G.runner.active) { ui?.toast('Finish your contract first', 'warn', { sub: 'The job is on this floor' }); return; }
    travel(to, { via: 'lift' });
  }

  // the relay kiosk: pick a destination among unlocked districts
  async function relayMenu() {
    if (G.runner.active) { ui?.toast('Finish your contract first', 'warn', { sub: 'The relay takes you off the job' }); return; }
    const here = world.district?.id || 'aurum_plaza';
    const opts = sim.state.districts.unlocked.filter((d) => d !== here && (world.districts || []).includes(d));
    if (!opts.length) { ui?.toast('Transit Relay', 'info', { sub: 'Other districts open as the story unfolds' }); return; }
    const labels = opts.map((d) => NAMES[d] || d).concat('Stay here');
    const i = await ui.dialogue.show({ speaker: 'Transit Relay', role: 'Nexus Transit', portrait: { kind: 'chrome', seed: 31 }, text: 'Destination?', choices: labels });
    if (i >= 0 && i < opts.length) travel(opts[i]);
  }

  // start: build the district the save was in
  function boot() {
    const want = sim.state.districts.current;
    if (G.keepDistrict && world.district) { cleanup(world, world.district.id); return; }   // dev start point: stay where the world booted
    if (want && world.district && want !== world.district.id && world.loadDistrict && (world.districts || []).includes(want)) {
      world.loadDistrict(want);
      onSwap(world, want);
    } else {
      sim.setSites(world.district?.id || 'aurum_plaza', world.sites);
      ambience(world.district?.id || 'aurum_plaza');
    }
  }

  return { travel, lift, relayMenu, boot, get busy() { return D.busy; }, get id() { return world.district?.id || 'aurum_plaza'; } };
}

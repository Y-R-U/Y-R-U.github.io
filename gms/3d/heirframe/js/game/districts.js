import { createNav } from './nav.js';

export const DISTRICT_NAMES = { aurum_plaza: 'Aurum Plaza', brightline: 'Brightline Boulevard', terraces: 'Verdant Terraces', arcology: 'Nexus Arcology', arcology_servers: 'Arcology Server Floor', portside: 'Portside', stacks: 'The Stacks', home: 'Home · Pod 4471', spine: 'The Spine', hullside: 'Hullside', meridian: 'Meridian Wreck', helm: 'The Helm', landfall: 'Verdance Landfall' };
const NAMES = DISTRICT_NAMES;
const AMBIENT = { aurum_plaza: 'plaza', brightline: 'boulevard', terraces: 'park', arcology: 'interior', arcology_servers: 'interior', portside: 'city', stacks: 'undercity', home: 'interior', spine: 'warehouse', hullside: null, meridian: null, helm: 'interior', landfall: 'park' };
const EMITTERS = { aurum_plaza: [['fountain', 0, 0, 1], ['waterfall', -47, -62, 1], ['waterfall', 66, -96, 1.2], ['fountain', -47, -57, 0.6]], brightline: [['traffic', 0, -60, 0.8], ['crowd', 0, 20, 0.7]],
  terraces: [['wind', 0, 0, 0.6], ['fountain', 0, -30, 0.7]], arcology: [['holo', 0, 0, 0.6], ['machine', 0, -30, 0.5]], arcology_servers: [['machine', 0, 0, 0.9]],
  portside: [['wind', 0, 60, 0.7], ['machine', 32, 68, 0.6]], stacks: [['machine', 0, -84, 0.7], ['machine', 5, 20, 0.4], ['wind', -5, 40, 0.4]], home: [['room', 0, 0, 0.6]],
  spine: [['machine', -31, 22, 0.9], ['machine', -31, -18, 0.9], ['machine', -31, -56, 0.9], ['waterfall', 14, 50, 0.6], ['waterfall', -14, 20, 0.6], ['waterfall', 14, -30, 0.6], ['waterfall', -14, -66, 0.6]],
  hullside: [], meridian: [['machine', 0, 0, 0.25]], helm: [['holo', 0, -76, 0.8], ['room', 0, 0, 0.5]], landfall: [['wind', 0, 0, 0.7], ['machine', 34, 40, 0.3]] };

// District travel (P2b world API): the Transit Relay interactable, contract-driven hops, and the swap cleanup
// (player to the relay, strays and mission props cleared, nav rebuilt, sites re-registered with the sim).
export function createDistricts(G, ctx) {
  const { world, sim, ui, audio, player, rig } = ctx;
  let emitters = [];
  const D = { busy: false };

  function ambience(id) {
    for (const e of emitters) e?.stop?.();
    audio.ambient(id in AMBIENT ? AMBIENT[id] : 'city');   // null = vacuum: no bed at all
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
    spawnResidents(id);
  }
  const unsub = world.onDistrict ? world.onDistrict(cleanup) : null;

  // district residents gameplay owns (Round 5b): Rook at his Stacks stall — rumours and the Clean Slate
  // + the informants (P4): Big Kettle after A1-M4 (Aurum, by the boulevard), Halloran after A4-M2 (Arcology offices)
  const RESIDENTS = {
    stacks: [{ id: 'rook', site: 'st_npc_rook', kind: 'civ_worker', seed: 13, label: 'Rook · Parts & Rumours' }],
    aurum_plaza: [{ id: 'kettle', site: 'npc_boulevard', kind: 'boss_kettle', seed: 4, label: 'Big Kettle · informant', after: 'a1_m4', sit: true }],
    arcology: [{ id: 'halloran', site: 'ax_npc_offices', kind: 'boss_halloran', seed: 6, label: 'Halloran · informant', after: 'a4_m2' }],
    // P5: Lyra, freed (phase 4 = warm eyes), after A5-M5: on Meridian by the dock, and in the Helm once it is open
    meridian: [{ id: 'lyra', site: 'mr_npc_dock', kind: 'seraph', tier: 3, phase: 4, seed: 5, label: 'Lyra Vael · your mother', after: 'a5_m5' }],
    helm: [{ id: 'lyra', site: 'hl_npc_lyra', kind: 'seraph', tier: 3, phase: 4, seed: 5, label: 'Lyra Vael · your mother', after: 'a6_m5' },
      { id: 'mara_helm', site: 'hl_npc_mara', kind: 'civ_worker', seed: 11, label: 'Mara Quill', after: 'a6_m5' }],
  };
  D.residents = [];
  function spawnResidents(id) {
    for (const r of D.residents) { world.scene.remove(r.bot.root); r.bot.dispose?.(); }
    D.residents = [];
    for (const def of RESIDENTS[id] || []) {
      if (def.after && !sim.state.story.done.includes(def.after)) continue;
      const st = world.sites.find((x) => x.id === def.site);
      if (!st || !ctx.robots?.createRobot) continue;
      let bot;
      try { bot = ctx.robots.createRobot({ kind: def.kind, tier: def.tier || 0, seed: def.seed, quality: ctx.tier?.name || 'high' }); } catch (e) { continue; }
      if (def.phase) bot.setPhase?.(def.phase);
      const p = ctx.nav?.nearest(st.x, st.z) || st;
      bot.root.position.set(p.x, world.groundAt(p.x, p.z), p.z);
      bot.root.rotation.y = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
      bot.play(def.sit ? 'sit' : 'idle', { loop: true });
      world.scene.add(bot.root);
      D.residents.push({ ...def, bot, x: p.x, z: p.z, r: 2.4 });
    }
  }

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
  async function travel(id, { reason = 'relay', via = 'relay', spawn = null, quiet = false } = {}) {
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
    arrive = spawn || (via === 'dev' ? 'player' : via === 'door' ? (id === 'home' ? 'player' : 'home') : via);
    try { await ((via === 'lift' || via === 'door' || via === 'passage') && world.liftTransition ? world.liftTransition(id, { onSwap }) : world.relayTransition(id, { onSwap })); }
    catch (e) { console.error('relay failed', e); }
    player.frozen = false;
    D.busy = false;
    if (!quiet) ui?.toast(NAMES[id] || id, 'info', { sub: reason === 'contract' ? 'Contract site' : via === 'lift' ? 'Lift' : via === 'door' ? (id === 'home' ? 'Lullaby Rest · Pod 4471' : 'The Stacks') : via === 'dev' ? 'Dev start point' : 'Transit Relay' });
    return true;
  }

  // the Stacks hostel door ↔ Home (Pod 4471): {id:'home', to:'home'} / {id:'door', to:'stacks'}
  function door(it) {
    if (!it?.to) return;
    if (G.runner.active) { ui?.toast('Finish your contract first', 'warn'); return; }
    travel(it.to, { via: 'door' });
  }
  // story-gated connectors between the Act 4–6 districts: {id:'passage', to, story?} (P5w)
  const PASSAGE_SPAWN = { 'spine>hullside': 'airlock', 'hullside>spine': 'firmament', 'hullside>meridian': 'dock', 'meridian>hullside': 'spur' };
  function passage(it) {
    if (!it?.to) return;
    if (G.runner.active && G.runner.mission?.district !== it.to) { ui?.toast('Finish your contract first', 'warn'); return; }
    if (it.story && !sim.state.story.done.includes(it.story) && sim.state.story.mission !== it.story) { ui?.toast(it.label || 'Sealed', 'bad', { sub: 'The story opens this way' }); audio.sfx('ui_deny'); return; }
    sim.unlockDistrict(it.to);
    travel(it.to, { via: 'passage', spawn: PASSAGE_SPAWN[`${world.district?.id}>${it.to}`] || 'relay' });
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
  function update(dt) { for (const r of D.residents) r.bot.update(dt); }

  function boot() {
    const want = sim.state.districts.current;
    if (G.keepDistrict && world.district) { cleanup(world, world.district.id); return; }   // dev start point: stay where the world booted
    if (want && world.district && want !== world.district.id && world.loadDistrict && (world.districts || []).includes(want)) {
      world.loadDistrict(want);
      onSwap(world, want);
    } else {
      sim.setSites(world.district?.id || 'aurum_plaza', world.sites);
      ambience(world.district?.id || 'aurum_plaza');
      spawnResidents(world.district?.id);
    }
  }

  return { respawnResidents: () => spawnResidents(world.district?.id), travel, lift, door, passage, relayMenu, boot, update, get residents() { return D.residents; }, get busy() { return D.busy; }, get id() { return world.district?.id || 'aurum_plaza'; } };
}

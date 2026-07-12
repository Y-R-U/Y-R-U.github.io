// Interaction + gathering. Scans world Interactables for the nearest in
// range, shows a context prompt, and runs the action on trigger (tap it /
// press E / Space). Channelled actions (chop, mine, fish, cook, smelt, smith)
// show a progress bar, cancel if you walk off, and auto-repeat RS-style while
// the node is up and the pack has room. Every gather is skill-gated and
// tool-gated: better axes/pickaxes work faster, levels raise success rates.

import { rand } from './utils.js';
import { ITEMS } from './items.js';
import { XP, LEVEL_REQ } from './skills.js';

export function createInteraction(player, world, getInteractables, bus) {
  let active = null;           // { kind, t, dur, label, onDone, repeat }

  const api = {
    current: null,
    get busy() { return !!active; },
    get channelInfo() { return active ? { kind: active.kind, t: +active.t.toFixed(2), dur: active.dur, label: active.label } : null; },

    update(dt, t) {
      // channelled action in progress
      if (active) {
        if (player.moving || !player.alive) return cancel();
        active.t += dt;
        bus.channel?.(active.label, Math.min(1, active.t / active.dur));
        if (active.t >= active.dur) {
          const a = active; active = null; bus.channel?.(null, 0);
          a.onDone();
          if (a.repeat && !player.moving && !active) a.repeat();
        }
        return;
      }

      // nearest interactable in range
      let best = null, bd = 1e9;
      for (const it of getInteractables()) {
        const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
        if (d < it.range && d < bd) { bd = d; best = it; }
      }
      // fallback: offer firemaking when idle with logs + tinderbox in the pack
      if (!best && !player.moving && player.hasItem('tinderbox') &&
          (player.hasItem('logs') || player.hasItem('oak_logs'))) {
        best = { kind: 'lightfire', verb: '🔥 Light a fire', pos: player.pos.clone(), range: 99 };
      }
      api.current = best;
      bus.prompt?.(best ? promptText(best) : null);
    },

    trigger() {
      if (active || !api.current || !player.alive) return;
      doInteract(api.current);
    },
    cancel,
    // smelt/smith are triggered from their UI panels
    smelt: (recipe) => smeltOne(recipe),
    smith: (recipe) => smithOne(recipe),
  };

  function cancel() { if (active) { active = null; bus.channel?.(null, 0); } }

  function channel(kind, label, dur, onDone, repeat) {
    active = { kind, t: 0, dur, label, onDone, repeat };
    bus.channel?.(label, 0);
  }

  // still close enough to keep working this node? (guards the auto-repeats)
  const near = (it) => Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z) <= (it.range || 3) + 0.4;

  function promptText(it) {
    if (it.kind === 'chop') {
      if (!player.bestTool('axe')) return '🪓 Chop (you need an axe)';
      if (it.tree === 'oak' && player.level('woodcutting') < LEVEL_REQ.oak_tree) return `🪓 Oak (Woodcutting ${LEVEL_REQ.oak_tree})`;
      if (!it.ready) return '🌱 (a stump — it will regrow)';
    }
    if (it.kind === 'mine') {
      if (!player.bestTool('pickaxe')) return '⛏️ Mine (you need a pickaxe)';
      if (it.ore === 'iron' && player.level('mining') < LEVEL_REQ.iron_rock) return `⛏️ Iron (Mining ${LEVEL_REQ.iron_rock})`;
      if (!it.ready) return '🪨 (mined out — it will replenish)';
    }
    if (it.kind === 'fish') {
      if (it.method === 'net' && !player.hasItem('small_net')) return '🕸️ Fish (you need a small net)';
      if (it.method === 'rod' && !player.hasItem('fishing_rod')) return '🎣 Fish (you need a fishing rod)';
      if (it.method === 'rod' && player.level('fishing') < LEVEL_REQ.trout_spot) return `🎣 Trout (Fishing ${LEVEL_REQ.trout_spot})`;
    }
    return it.verb;
  }

  function doInteract(it) {
    switch (it.kind) {
      case 'shop': return bus.openShop?.();
      case 'bank': return bus.openBank?.();
      case 'smelt': return bus.openSmelt?.();
      case 'smith': return bus.openSmith?.();
      case 'talk': return bus.talk?.(it);
      case 'chop': return chop(it);
      case 'mine': return mine(it);
      case 'fish': return fish(it);
      case 'cook': return cook(it);
      case 'lightfire': return bus.lightFire?.();
    }
  }

  // ── woodcutting ──
  function chop(it) {
    const axe = player.bestTool('axe');
    if (!axe) return bus.toast?.('🪓 You need an axe to chop trees.');
    if (!it.ready) return bus.toast?.('🌱 Only a stump remains.');
    const lvl = player.level('woodcutting');
    const oak = it.tree === 'oak';
    if (oak && lvl < LEVEL_REQ.oak_tree) return bus.toast?.(`🪓 You need Woodcutting ${LEVEL_REQ.oak_tree} for oaks.`);
    const dur = (oak ? 3.6 : 2.6) / (axe.speed || 1) / (1 + lvl * 0.012);
    channel('chop', oak ? 'Chopping oak…' : 'Chopping…', dur, () => {
      if (!it.ready) return;
      const id = oak ? 'oak_logs' : 'logs';
      if (!player.addItem(id, 1)) return;
      player.addXp('woodcutting', XP.chop[id]);
      bus.toast?.(`🪵 You get some ${oak ? 'oak ' : ''}logs.`);
      bus.sfx?.('chop');
      bus.chopped?.(it);
      // normal trees fall after one log (like RS); oaks keep giving for a while
      if (!oak || Math.random() < 0.35) it.deplete(oak ? rand(14, 25) : rand(8, 14));
    }, () => { if (near(it) && it.ready && player.slotsUsed() < 28) chop(it); });
  }

  // ── mining ──
  function mine(it) {
    const pick = player.bestTool('pickaxe');
    if (!pick) return bus.toast?.('⛏️ You need a pickaxe to mine.');
    if (!it.ready) return bus.toast?.('🪨 The rock is mined out.');
    const lvl = player.level('mining');
    const iron = it.ore === 'iron';
    if (iron && lvl < LEVEL_REQ.iron_rock) return bus.toast?.(`⛏️ You need Mining ${LEVEL_REQ.iron_rock} for iron.`);
    const dur = (iron ? 3.8 : 2.8) / (pick.speed || 1) / (1 + lvl * 0.012);
    channel('mine', 'Mining…', dur, () => {
      if (!it.ready) return;
      const id = `${it.ore}_ore`;
      if (!player.addItem(id, 1)) return;
      player.addXp('mining', XP.mine[id]);
      bus.toast?.(`${ITEMS[id].icon} You get some ${ITEMS[id].name.toLowerCase()}.`);
      bus.sfx?.('chop');
      bus.mined?.(it);
      it.deplete(iron ? rand(15, 25) : rand(6, 11));
    });
  }

  // ── fishing ──
  function fish(it) {
    const net = it.method === 'net';
    if (net && !player.hasItem('small_net')) return bus.toast?.('🕸️ You need a small net.');
    if (!net && !player.hasItem('fishing_rod')) return bus.toast?.('🎣 You need a fishing rod.');
    const lvl = player.level('fishing');
    if (!net && lvl < LEVEL_REQ.trout_spot) return bus.toast?.(`🎣 You need Fishing ${LEVEL_REQ.trout_spot} to catch trout.`);
    const dur = Math.max(1.6, 3.6 - lvl * 0.05);
    channel('fish', 'Fishing…', dur, () => {
      const chance = Math.min(0.92, 0.5 + lvl * 0.02);
      if (Math.random() < chance) {
        const id = net ? 'raw_shrimp' : 'raw_trout';
        if (!player.addItem(id, 1)) return;
        player.addXp('fishing', XP.fish[id]);
        bus.toast?.(`${ITEMS[id].icon} You catch ${net ? 'a shrimp' : 'a trout'}!`);
        bus.sfx?.('pick');
        bus.fished?.(id);
      } else {
        bus.toast?.('🎣 You fail to catch anything…');
      }
    }, () => { if (near(it) && player.slotsUsed() < 28) fish(it); });   // keep casting
  }

  // ── cooking (at a fire or the campfire cooker) ──
  function cook(it) {
    const raw = player.items.find(s => ITEMS[s.id]?.raw);
    if (!raw) return bus.toast?.('🍳 You have nothing raw to cook.');
    const def = ITEMS[raw.id];
    const lvl = player.level('cooking');
    if (lvl < (def.cookLvl || 1)) return bus.toast?.(`🍳 You need Cooking ${def.cookLvl} for ${def.name.toLowerCase()}.`);
    channel('cook', `Cooking ${def.name.replace('Raw ', '').toLowerCase()}…`, 1.8, () => {
      player.removeItem(raw.id, 1);
      const burnCh = Math.max(0, 0.35 - (lvl - (def.cookLvl || 1)) * 0.03);
      if (Math.random() < burnCh) {
        player.addItem('burnt_food', 1);
        bus.toast?.('🌚 You accidentally burn it!');
      } else {
        player.addItem(def.cooksTo, 1);
        player.addXp('cooking', XP.cook[raw.id] || 30);
        bus.toast?.(`🍴 You cook the ${ITEMS[def.cooksTo].name.toLowerCase()}.`);
        bus.cooked?.(def.cooksTo);
      }
      bus.sfx?.('pick');
    }, () => { if (near(it) && player.items.find(s => ITEMS[s.id]?.raw)) cook(it); });  // keep cooking
  }

  // ── smelting (from the furnace panel) ──
  function smeltOne(r) {
    if (player.level('smithing') < r.lvl) return bus.toast?.(`🔥 You need Smithing ${r.lvl}.`);
    for (const [id, n] of Object.entries(r.needs))
      if (player.countItem(id) < n) return bus.toast?.(`${ITEMS[id].icon} You need ${n}× ${ITEMS[id].name}.`);
    channel('smelt', `Smelting ${r.name.toLowerCase()}…`, 2.2, () => {
      for (const [id, n] of Object.entries(r.needs)) player.removeItem(id, n);
      if (r.fail && Math.random() < r.fail) {
        bus.toast?.('💨 The ore crumbles — no bar this time.');
      } else {
        player.addItem(r.id, 1);
        player.addXp('smithing', r.xp);
        bus.toast?.(`${r.icon} You smelt a ${r.name.toLowerCase()}.`);
        bus.smelted?.(r.id);
      }
      bus.sfx?.('pick');
    });
  }

  // ── smithing (from the anvil panel) ──
  function smithOne(r) {
    const def = ITEMS[r.id];
    if (!player.hasItem('hammer')) return bus.toast?.('🔨 You need a hammer.');
    if (player.level('smithing') < r.lvl) return bus.toast?.(`🔨 You need Smithing ${r.lvl}.`);
    if (player.countItem(r.bar) < r.bars) return bus.toast?.(`${ITEMS[r.bar].icon} You need ${r.bars}× ${ITEMS[r.bar].name}.`);
    channel('smith', `Smithing ${def.name.toLowerCase()}…`, 2.4, () => {
      player.removeItem(r.bar, r.bars);
      player.addItem(r.id, 1);
      player.addXp('smithing', 25 * r.bars);
      bus.toast?.(`${def.icon} You hammer out a ${def.name.toLowerCase()}!`);
      bus.smithed?.(r.id);
      bus.sfx?.('chop');
    });
  }

  return api;
}

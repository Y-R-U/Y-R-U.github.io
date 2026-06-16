// Interaction + gathering. Scans world Interactables for the nearest in range,
// shows a context prompt, and runs the action on trigger (tap it / press E /
// Space). Channelled actions (fish, cook, chop) show a progress bar and cancel
// if you walk off. Also handles automatic water refill near the river/well.
//
// Skill notes: fishing IS a skill (xp + better catch rate). Woodcutting and
// firemaking are NOT skills — they only need an axe / tinderbox to be owned.

import * as THREE from 'three';
import { rand } from './utils.js';
import { ITEMS } from './items.js';
import { levelForXp } from './skills.js';
import { SITES } from './config.js';

export function createInteraction(player, world, getInteractables, bus) {
  let active = null;           // { kind, t, dur, label, onDone, repeat }
  let nearWaterFlag = false;
  const wellPos = new THREE.Vector3(SITES.well.x, 0, SITES.well.z);

  const api = {
    current: null,
    get busy() { return !!active; },

    update(dt, t) {
      // auto water refill
      const nw = world.nearWater(player.pos.x, player.pos.z) ||
        Math.hypot(player.pos.x - wellPos.x, player.pos.z - wellPos.z) < 2.6;
      if (nw && player.water < 99.5) {
        player.water = 100;
        if (!nearWaterFlag) bus.toast?.('💧 You refill your waterskin and drink your fill.');
      }
      nearWaterFlag = nw;

      // channelled action in progress
      if (active) {
        if (player.moving || !player.alive) return cancel();
        active.t += dt;
        bus.channel?.(active.label, Math.min(1, active.t / active.dur));
        if (active.t >= active.dur) {
          const a = active; active = null; bus.channel?.(null, 0);
          a.onDone();
          if (a.repeat && !player.moving) a.repeat();
        }
        return;
      }

      // nearest interactable in range
      let best = null, bd = 1e9;
      for (const it of getInteractables()) {
        const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
        if (d < it.range && d < bd) { bd = d; best = it; }
      }
      // fall back to fishing anywhere on the bank when holding a rod
      if (!best && nw && player.hasItem('fishing_rod') && !player.moving) {
        best = { kind: 'fish', verb: '🎣 Fish here', pos: new THREE.Vector3(player.pos.x, 0, player.pos.z), range: 99 };
      }
      api.current = best;
      bus.prompt?.(best ? promptText(best) : null);
    },

    trigger() {
      if (active || !api.current || !player.alive) return;
      doInteract(api.current);
    },
    cancel,
  };

  function cancel() { if (active) { active = null; bus.channel?.(null, 0); } }

  function channel(kind, label, dur, onDone, repeat) {
    active = { kind, t: 0, dur, label, onDone, repeat };
    bus.channel?.(label, 0);
  }

  function promptText(it) {
    if (it.kind === 'chop' && !player.hasItem('axe')) return '🪓 Chop tree (need an Axe)';
    if (it.kind === 'fish' && !player.hasItem('fishing_rod')) return '🎣 Fish (need a Fishing Rod)';
    if ((it.kind === 'forage' || it.kind === 'mushroom') && !it.ready) return '🌱 (regrowing…)';
    return it.verb;
  }

  function doInteract(it) {
    switch (it.kind) {
      case 'store': return bus.openShop?.();
      case 'dungeon': return bus.toggleDungeon?.();
      case 'leave_dungeon': return bus.toggleDungeon?.();
      case 'chest': return bus.openChest?.(it);
      case 'forage': return forage(it, 'apple', '🍎 You pick a ripe apple.');
      case 'mushroom': return forage(it, 'mushroom', '🍄 You pick a mushroom.');
      case 'chop': return chop(it);
      case 'fish': return fish(it);
      case 'cook': return cook();
    }
  }

  function forage(it, id, msg) {
    if (!it.ready) return bus.toast?.('🌱 It needs time to regrow.');
    it.ready = false; it.regrow = rand(18, 36);
    player.addItem(id, 1);
    bus.toast?.(msg);
    bus.sfx?.('pick');
  }

  function chop(it) {
    if (!player.hasItem('axe')) return bus.toast?.('🪓 You need an axe to chop wood.');
    if (!it.ready) return bus.toast?.('🌱 Only a stump remains.');
    channel('chop', 'Chopping…', 2.2, () => {
      const n = 1 + (Math.random() < 0.4 ? 1 : 0);
      player.addItem('logs', n);
      it.ready = false; it.regrow = rand(25, 45);
      if (it.group) it.group.visible = false;
      bus.toast?.(`🪵 You get ${n} log${n > 1 ? 's' : ''}.`);
      bus.sfx?.('chop');
      bus.chopped?.(n);
    });
  }

  function fish(it) {
    if (!player.hasItem('fishing_rod')) return bus.toast?.('🎣 You need a fishing rod.');
    const lvl = levelForXp(player.skills.fishing.xp);
    const dur = Math.max(1.8, 4.2 - lvl * 0.12);
    channel('fish', 'Fishing…', dur, () => {
      const chance = Math.min(0.92, 0.45 + lvl * 0.035);
      if (Math.random() < chance) {
        player.addItem('fish_raw', 1);
        player.addXp('fishing', 18);
        bus.toast?.('🐟 You catch a fish!');
        bus.sfx?.('pick');
        bus.fished?.();
      } else {
        bus.toast?.('🎣 The fish got away…');
      }
    }, () => { if (player.hasItem('fishing_rod')) fish(it); });   // auto-recast
  }

  function cook() {
    const raw = player.items.find(s => ITEMS[s.id]?.raw);
    if (!raw) return bus.toast?.('🍳 You have nothing raw to cook.');
    const def = ITEMS[raw.id];
    channel('cook', `Cooking ${def.name}…`, 1.6, () => {
      player.removeItem(raw.id, 1);
      if (Math.random() < 0.12) { bus.toast?.('🔥 You burnt it!'); }
      else { player.addItem(def.cooksTo, 1); bus.toast?.(`🍴 You cook ${ITEMS[def.cooksTo].name}.`); bus.cooked?.(); }
      bus.sfx?.('pick');
    }, () => { if (player.items.find(s => ITEMS[s.id]?.raw)) cook(); });  // keep cooking
  }

  return api;
}

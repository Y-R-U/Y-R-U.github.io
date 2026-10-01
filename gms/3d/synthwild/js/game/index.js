// ctx.game: inventory, survival stats, drops, Memory Caches and mobs. init(ctx) builds it; main.js calls update(dt).
import { BLOCKS, BLOCK } from '../data/blocks.js';
import { createItems } from '../data/items.js';
import { Inventory, HOTBAR } from './inventory.js';
import { Survival, TUNING } from './survival.js';
import { Mobs } from './mobs/index.js';
import { Drops } from './drops.js';
import { Stations } from './stations/index.js';
import { Projectiles } from './projectiles.js';
import { Farm } from './farm.js';
import { Journal } from './journal/index.js';
import { difficultyOf, MOB_SOURCES } from '../data/difficulty.js';
import { fell } from './felling.js';
import * as rules from './rules.js';
import { lightAt, liquidAt } from './env.js';

const STUB_SETTINGS = {
  vals: { noFallDamage: false, keepInventory: false, toolsNeverBreak: false, peaceful: false, alwaysDay: false, mobGrief: false, buildMobs: false },
  get(k) { return this.vals[k]; },
  on() { return () => {}; },
};
const START_KIT = [['fabricator', 1]];
const EYE = 1.62;

export function init(ctx) {
  const bus = ctx.bus;
  const items = createItems(BLOCKS);
  const inv = new Inventory(items, bus);
  const survival = new Survival(bus);
  const S = () => ctx.settings || STUB_SETTINGS;

  const game = {
    items, inv, survival, rules,
    mobs: null, drops: null, stations: null, projectiles: null, farm: null, journal: null,
    bow: { drawing: false, t: 0, charge: 0, lastCharge: 0, noAmmo: false },
    spawnPoint: null,
    stash: null,
    peak: null,
    last: null,
    respawnT: 0,

    get creative() { return ctx.session?.mode === 'build'; },
    get minigame() { return ctx.session?.mode === 'minigame'; },
    get mgSurvival() { return game.minigame && !!ctx.session?.mgSurvival; },
    get difficulty() { return ctx.session?.meta?.difficulty || 'normal'; },
    get diff() { return difficultyOf(game.difficulty); },
    nights: 0,
    get firstNight() { return game.nights <= 1; },

    breakTime(mat, held = inv.held(), scale = 1) {
      if (game.minigame && !ctx.session?.mgBreak) return Infinity;
      return rules.breakTime(BLOCKS, mat, held, { creative: game.creative, scale });
    },
    canHarvest(mat, held = inv.held()) { return game.creative || rules.canHarvest(BLOCKS[mat], held); },
    dropsFor(mat, count, held = inv.held()) { return rules.dropsFor(BLOCKS, mat, count, held); },
    meleeDamage(held = inv.held()) { return rules.meleeDamage(held); },

    // Player melee on a mob (lane 3 calls this, or mobs.hit directly).
    attack(mob, dir) {
      const ok = game.mobs.hit(mob, game.meleeDamage(), dir, 'player');
      if (ok) {
        survival.spend(TUNING.costAttack);
        const t = inv.held()?.item?.tool;
        if (t) inv.wear(inv.sel, t.type === 'blade' ? 1 : 2, S().get('toolsNeverBreak'));
      }
      return ok;
    },

    hurtPlayer(amount, src, knock = null) {
      if (game.creative || survival.dead || (game.minigame && !game.mgSurvival)) return 0;
      if (MOB_SOURCES.has(src)) {
        const m = game.diff.mobDmg;
        if (!m) return 0;
        amount = Math.max(1, Math.round(amount * m));
      }
      const got = survival.damage(amount, src, { dir: knock });
      if (got && knock) playerKnock(knock);
      return got;
    },

    setSpawn(pos) { game.spawnPoint = { x: pos.x, y: pos.y, z: pos.z }; bus?.emit?.('player:spawnSet', game.spawnPoint); },

    // Sleep pod: sets the respawn point and skips the night.
    sleep(pos) {
      game.setSpawn(pos);
      if (ctx.sky?.isNight && ctx.sky.setTime) ctx.sky.setTime(0.27);
      bus?.emit?.('player:sleep', { pos });
    },

    respawn() {
      if (!survival.dead) return;
      survival.revive();
      if (game.spawnPoint && !game.stations.podAt(game.spawnPoint)) {
        game.spawnPoint = null;
        game.stations.say('Your Sleep Pod is gone, so your suit rebooted at the landing site.', 'warn');
      }
      const ws = ctx.world?.spawn;
      const sp = game.spawnPoint || (ws ? { x: ws[0], y: ws[1], z: ws[2] } : { x: 0.5, y: ctx.world?.surfaceY?.(0.5, 0.5) ?? 40, z: 0.5 });
      playerTeleport(sp);
      if (!game.minigame) game.mobs.calm(sp);
      game.peak = null;
      game.respawnT = 0;
      bus?.emit?.('player:respawn', { pos: sp });
    },

    // Secondary on a block (lane 3 calls this before placing). true = a station took the action.
    useBlock(hit) { return (!survival.dead && game.farm.use(hit, inv.held())) || game.stations.useBlock(hit); },

    // Test hook: spawn a mob `dist` units in front of the player.
    spawnMob(kind, dist = 4) {
      const P = ctx.player, b = body();
      if (!b) return null;
      const yaw = P?.yaw ?? 0;
      const x = b.x - Math.sin(yaw) * dist, z = b.z - Math.cos(yaw) * dist;
      const y = ctx.world?.surfaceY?.(x, z) ?? b.y;
      return game.mobs.spawn(kind, x, y, z);
    },

    // Called by main.js when a world starts. saveData = what save() returned (or null for a new world).
    start(saveData = null) {
      game.drops.clear();
      game.mobs.clear();
      game.stations.clear();
      game.projectiles.clear();
      game.farm.clear();
      game.journal.reset();
      survival.reset();
      inv.clear();
      game.spawnPoint = null;
      game.nights = 0; game.wasNight = false;
      game.stash = null;
      game.peak = null;
      game.last = null;
      game.modeSeen = null;
      if (saveData) game.load(saveData);
      else if (!game.creative) for (const [k, n] of START_KIT) inv.add(items.id(k), n);
      syncMode();
      // a save taken on the death screen: reboot now rather than load a ghost
      if (survival.dead) game.respawn();
    },

    save() {
      return {
        v: 1,
        stats: survival.serialize(),
        inv: inv.serialize(),
        stash: game.stash,
        caches: game.drops.serializeCaches(),
        stations: game.stations.serialize(),
        farm: game.farm.serialize(),
        journal: game.journal.serialize(),
        spawn: game.spawnPoint,
        nights: game.nights,
      };
    },
    load(d) {
      if (!d) return;
      survival.load(d.stats);
      inv.load(d.inv);
      game.stash = d.stash || null;
      game.spawnPoint = d.spawn || null;
      game.nights = d.nights || 0;
      game.wasNight = !!ctx.sky?.isNight;
      game.drops.loadCaches(d.caches);
      game.stations.load(d.stations);
      game.farm.load(d.farm);
      game.journal.load(d.journal);
    },

    update(dt) {
      dt = Math.min(dt, 0.1);
      syncMode();
      if (ctx.session?.paused) return;
      const p = pstate();
      if (!p) return;
      const st = S();
      const sky = ctx.sky;
      const isNight = !!sky?.isNight && !st.get('alwaysDay');
      if (isNight && !game.wasNight) game.nights++;
      game.wasNight = isNight;
      const alwaysDay = st.get('alwaysDay');
      const daylight = alwaysDay ? 1 : sky?.daylight01 ?? 1;
      const L = lightAt(ctx.world, p.x, p.y + EYE, p.z);
      const last = game.last;
      const moved = last ? Math.hypot(p.x - last.x, p.z - last.z) / Math.max(dt, 1e-4) : 0;
      game.last = { x: p.x, y: p.y, z: p.z };

      if (game.minigame && !game.mgSurvival) survival.tick(dt, { creative: true });
      else if (!game.creative && !survival.dead) {
        // Fall damage: track the peak height while airborne.
        if (p.onGround || p.inWater || p.flying || p.climbing) {
          if (game.peak != null && p.onGround && !p.inWater && !p.flying && !p.climbing) {
            const dmg = survival.fallDamage(game.peak - p.y);
            if (dmg > 0 && !st.get('noFallDamage')) game.hurtPlayer(dmg, 'fall');
          }
          game.peak = null;
        } else game.peak = Math.max(game.peak ?? p.y, p.y);
        if (ctx.input?.pressed?.('jump') && p.onGround) survival.spend(TUNING.costJump);

        survival.tick(dt, {
          creative: false, peaceful: st.get('peaceful'), daylight,
          skyLight: L.sky, blockLight: L.block, moving: moved > 0.6, sprinting: p.sprinting,
          drain: game.diff.drain, starveFloor: game.diff.starveFloor, regenEvery: game.diff.regenEvery,
          swimming: p.inWater, eyeInWater: p.eyeInWater,
        });
        eatTick(dt);
        bowTick(dt, p);
      } else if (game.creative) { bowTick(dt, p); survival.tick(dt, { creative: true }); }

      if (survival.dead) {
        game.respawnT += dt;
        if ((game.minigame ? game.respawnT > 2 : !(ctx.ui?.handlesDeath ?? !!ctx.ui) && game.respawnT > 3)) { game.respawn(); return; }
      }
      game.drops.update(dt, p, inv);
      game.mobs.update(dt, p, st, alwaysDay ? { isNight: false, daylight01: 1 } : sky);
      game.projectiles.update(dt, p);
      game.stations.update(dt);
      game.farm.update(dt);
      game.journal.update(dt);
    },
  };

  function syncMode() {
    const c = game.creative;
    if (game.modeSeen === c) return;
    const first = game.modeSeen == null;
    game.modeSeen = c;
    if (c) {
      if (!first || inv.slots.some(Boolean)) game.stash = inv.serialize();
      inv.creative = true;
      inv.clear();
      inv.fillCreativeHotbar(items.palette().slice(0, HOTBAR));
    } else {
      inv.creative = false;
      if (game.stash) { inv.load(game.stash); game.stash = null; }
    }
  }

  function bowTick(dt, p) {
    const h = inv.held(), B = game.bow;
    const isBow = h?.item?.tool?.type === 'bow';
    const holding = isBow && ctx.input?.held?.secondary && !ctx.input?.modal && !game.stations.isOpen && !survival.dead;
    const ammo = items.id('pulse_charge');
    if (holding) {
      if (!B.drawing) {
        if (!game.creative && inv.count(ammo) < 1) {
          B.noAmmo = true;
          if (!B.warned) { B.warned = true; bus?.emit?.('player:noAmmo', { id: ammo }); game.stations.say('No Pulse Charges. Fabricate some from carbon + a rod.', 'warn'); }
          return;
        }
        B.drawing = true; B.t = 0; B.noAmmo = false;
        ctx.audio?.sfx?.('bowDraw');
      }
      B.t += dt;
      B.charge = Math.min(1, B.t / 1.0);
      return;
    }
    B.warned = false;
    if (!B.drawing) return;
    const c = B.charge;
    B.lastCharge = c;
    B.drawing = false; B.t = 0; B.charge = 0;
    if (c < 0.15 || !isBow) return;
    const dir = ctx.camera.getWorldDirection(new ctx.THREE.Vector3());
    const from = { x: p.x + dir.x * 0.5, y: p.y + EYE - 0.1 + dir.y * 0.5, z: p.z + dir.z * 0.5 };
    const sp = 14 + 26 * c;
    game.projectiles.fire(from, { x: dir.x * sp, y: dir.y * sp, z: dir.z * sp },
      { owner: 'player', dmg: Math.max(1, Math.round(1 + 8 * c * c)), gravity: 8 });
    if (!game.creative) inv.removeId(ammo, 1);
    inv.wear(inv.sel, 1, S().get('toolsNeverBreak'));
    survival.spend(TUNING.costAttack);
    ctx.audio?.sfx?.('bowFire', { charge: c });
    bus?.emit?.('player:fire', { charge: c });
  }

  function eatTick(dt) {
    const h = inv.held();
    const holding = h?.item?.food && ctx.input?.held?.secondary && !ctx.input?.modal && !ctx.ui?.isOpen?.();
    if (!holding) { survival.stopEat(); return; }
    if (survival.holdEat(h.item, dt) === 'done') inv.consume(1);
  }

  // ---- player adapter: tolerant of lane 3's shape until its API is final ----
  function body() {
    const P = ctx.player;
    return P ? P.body || P.pos || P.position || P : null;
  }
  const lookV = new ctx.THREE.Vector3();
  function pstate() {
    const P = ctx.player, b = body();
    if (!b || b.x == null) return null;
    const onGround = P.onGround ?? b.onGround ?? false;
    const inWater = P.inWater ?? liquidAt(ctx.world, b.x, b.y + 0.4, b.z);
    const eyeInWater = P.eyeInWater ?? P.headInWater ?? liquidAt(ctx.world, b.x, b.y + EYE, b.z);
    const dir = ctx.camera?.getWorldDirection ? ctx.camera.getWorldDirection(lookV) : null;
    return { x: b.x, y: b.y, z: b.z, onGround, inWater, eyeInWater, flying: !!P.flying, climbing: !!P.climbing, dir,
      sprinting: P.sprinting ?? ctx.input?.held?.sprint ?? false, dead: survival.dead };
  }
  function playerKnock(k) {
    const P = ctx.player;
    if (!P) return;
    if (P.knock) return P.knock(k.x, k.y, k.z);
    const v = P.vel || P.velocity || P.body?.vel;
    if (v) { v.x += k.x; v.y = Math.max(v.y, k.y); v.z += k.z; }
  }
  function playerTeleport(pos) {
    const P = ctx.player;
    if (P?.teleport) return P.teleport(pos.x, pos.y, pos.z);
    const b = body();
    if (b) { b.x = pos.x; b.y = pos.y; b.z = pos.z; }
    const v = P?.vel || P?.velocity;
    if (v) { v.x = v.y = v.z = 0; }
  }

  game.mobs = new Mobs(ctx, game);
  game.drops = new Drops(ctx, game);
  game.stations = new Stations(ctx, game);
  game.projectiles = new Projectiles(ctx, game);
  game.farm = new Farm(ctx, game);
  game.journal = new Journal(ctx, game);

  bus?.on?.('block:break', (ev) => {
    if (game.creative) return;
    game.drops.onBreak(ev);
    game.stations.onBreak(ev);
    if (ev.src === 'emp' || ev.leaf) return;
    survival.spend(TUNING.costBreak);
    const t = inv.held()?.item?.tool;
    if (t) inv.wear(inv.sel, 1, S().get('toolsNeverBreak'));
    if (ev.src !== 'fell' && ev.minSub && ev.removed?.some((r) => r.mat === BLOCK.CARBON_LOG && r.count >= 64)) {
      const size = ev.maxSub.map((v, i) => v - ev.minSub[i]);
      const saw = t?.type === 'saw';
      if (size.every((v) => v === 4) && (saw || (!t && S().get('treeFelling') !== false))) fell(ctx, ev.minSub[0] >> 2, ev.minSub[1] >> 2, ev.minSub[2] >> 2);
    }
  });
  bus?.on?.('game:stop', () => { game.mobs.clear(); game.drops.clear(); game.stations.clear(); game.projectiles.clear(); survival.stopEat(); });
  bus?.on?.('block:place', (ev) => { game.stations.onPlace(ev); game.farm.onPlace(ev); });
  bus?.on?.('player:death', () => {
    const p = pstate();
    if (!p || S().get('keepInventory')) return;
    const slots = inv.takeBackpack();
    if (slots.length) game.drops.addCache({ x: p.x, y: p.y, z: p.z }, slots);
  });

  ctx.game = game;
  current = game;
  syncMode();
  return game;
}

let current = null;
export function update(dt) { current?.update(dt); }

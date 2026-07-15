// Trolling Addon — behavior script
// Speed Minecart boosts, Skin Mock Stalker/Hunter AI, Chunk Miner, Pure Sky drops.
import { world, system, ItemStack, EntityDamageCause, GameMode } from "@minecraft/server";

const CART = "trolling:speed_minecart";
const MOCKER = "trolling:skin_mocker";
const STALKER = "trolling:skin_stalker";
const HUNTER = "trolling:skin_hunter";
const SKY_BLOCK = "trolling:pure_sky_block";
const GOD_PICK = "trolling:god_pickaxe";
const CHUNK_PICK = "trolling:chunk_miner";

const MOCK_DROPS = {
  [MOCKER]: "trolling:skin_mocker_item",
  [STALKER]: "trolling:skin_stalker_item",
  [HUNTER]: "trolling:skin_hunter_item",
};
const MOCK_TYPES = new Set(Object.keys(MOCK_DROPS));

const PLACERS = {
  "trolling:speed_minecart_item": { entity: CART, railOnly: true },
  "trolling:skin_mocker_item": { entity: MOCKER },
  "trolling:skin_stalker_item": { entity: STALKER },
  "trolling:skin_hunter_item": { entity: HUNTER },
};

const RAILS = new Set([
  "minecraft:rail",
  "minecraft:golden_rail",
  "minecraft:detector_rail",
  "minecraft:activator_rail",
]);

const FACE_OFFSETS = {
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 },
  West: { x: -1, y: 0, z: 0 },
};

const DIMS = ["overworld", "nether", "the_end"];

const HITS_TO_BREAK = 5; // punch/mine a mock entity this many times to break it
const STALK_MIN = 30; // minimum stalking distance (blocks)
const WALK_SPEED = 0.21; // ~player walk, blocks/tick
const CHASE_SPEED = 0.34; // faster than sprint — you cannot outrun it forever
const MAX_CART_SPEED = 4.0; // blocks/tick = 80 m/s. Very high.
const WOOD_SWORD_DMG = 5; // Bedrock wooden sword damage
const FUSE_MIN_TICKS = 600; // hunter turns after 30s..150s near its prey
const FUSE_MAX_TICKS = 3000;

let tickCount = 0;

// ---------------------------------------------------------------- helpers

function playSound(dim, id, loc) {
  try {
    dim.playSound(id, loc);
  } catch {}
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function isAirLike(typeId) {
  return (
    typeId === "minecraft:air" ||
    typeId === "minecraft:water" ||
    typeId === "minecraft:flowing_water" ||
    typeId === "minecraft:short_grass" ||
    typeId === "minecraft:tall_grass" ||
    typeId === "minecraft:tallgrass" ||
    typeId === "minecraft:snow_layer"
  );
}

function safeGetEntities(dim, type) {
  try {
    return dim.getEntities({ type });
  } catch {
    return [];
  }
}

function getHeldItem(p) {
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    const idx = p.selectedSlotIndex ?? p.selectedSlot ?? 0;
    return inv?.getItem(idx);
  } catch {
    return undefined;
  }
}

function isPickaxeId(id) {
  return id.endsWith("_pickaxe") || id === GOD_PICK || id === CHUNK_PICK;
}

function actionBar(p, msg) {
  try {
    p.onScreenDisplay.setActionBar(msg);
  } catch {}
}

function consumeOne(p, typeId) {
  try {
    if (p.getGameMode() === GameMode.creative) return;
  } catch {}
  try {
    const inv = p.getComponent("minecraft:inventory")?.container;
    const idx = p.selectedSlotIndex ?? p.selectedSlot ?? 0;
    const it = inv?.getItem(idx);
    if (!it || it.typeId !== typeId) return;
    if (it.amount <= 1) inv.setItem(idx, undefined);
    else {
      it.amount -= 1;
      inv.setItem(idx, it);
    }
  } catch {}
}

function faceToward(e, loc) {
  try {
    const dx = loc.x - e.location.x;
    const dz = loc.z - e.location.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.01) return;
    const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
    e.setRotation({ x: 0, y: yaw });
  } catch {}
}

// Rough "does this player see that point" — view cone + block raycast.
function canSee(p, loc) {
  try {
    const head = p.getHeadLocation();
    const dx = loc.x - head.x;
    const dy = loc.y - head.y;
    const dz = loc.z - head.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 96) return false;
    if (d < 1.5) return true;
    const dir = { x: dx / d, y: dy / d, z: dz / d };
    const view = p.getViewDirection();
    if (view.x * dir.x + view.y * dir.y + view.z * dir.z < 0.2) return false;
    const hit = p.dimension.getBlockFromRay(head, dir, {
      maxDistance: Math.min(Math.ceil(d), 96),
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    });
    if (!hit) return true;
    const hb = hit.block.location;
    const hd = Math.hypot(hb.x + 0.5 - head.x, hb.y + 0.5 - head.y, hb.z + 0.5 - head.z);
    return hd > d - 1.0;
  } catch {
    return true; // if we can't tell, assume seen — no cheaty teleports
  }
}

function eyeOf(e) {
  return { x: e.location.x, y: e.location.y + 1.5, z: e.location.z };
}

function groundY(dim, x, refY, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = Math.floor(refY) + 8; y > Math.floor(refY) - 12; y--) {
    try {
      const below = dim.getBlock({ x: bx, y: y - 1, z: bz });
      const feet = dim.getBlock({ x: bx, y, z: bz });
      const head = dim.getBlock({ x: bx, y: y + 1, z: bz });
      if (!below || !feet || !head) continue;
      if (!isAirLike(below.typeId) && below.typeId !== "minecraft:lava" && isAirLike(feet.typeId) && isAirLike(head.typeId)) {
        return y;
      }
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- movement

function moveToward(e, dest, speed) {
  try {
    const loc = e.location;
    const dx = dest.x - loc.x;
    const dz = dest.z - loc.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.4) return;
    const nx = dx / L;
    const nz = dz / L;
    const v = e.getVelocity();
    e.applyImpulse({ x: (nx * speed - v.x) * 0.35, y: 0, z: (nz * speed - v.z) * 0.35 });
    // hop over 1-block obstacles, like a player jumping
    if (Math.abs(v.y) < 0.02) {
      const fx = Math.floor(loc.x + nx * 0.8);
      const fy = Math.floor(loc.y);
      const fz = Math.floor(loc.z + nz * 0.8);
      const foot = e.dimension.getBlock({ x: fx, y: fy, z: fz });
      const head = e.dimension.getBlock({ x: fx, y: fy + 1, z: fz });
      if (foot && !isAirLike(foot.typeId) && head && isAirLike(head.typeId)) {
        e.applyImpulse({ x: nx * 0.08, y: 0.5, z: nz * 0.08 });
      }
    }
  } catch {}
}

// Every 40 ticks, sample position; "stuck" = tried to move but barely got anywhere.
function stuckCheck(e) {
  try {
    if (tickCount % 40 !== 0) return e.getDynamicProperty("trolling:isStuck") === true;
    const last = e.getDynamicProperty("trolling:lastPos");
    const now = e.location;
    let stuckNow = false;
    if (typeof last === "string") {
      const parts = last.split(",").map(Number);
      stuckNow = Math.hypot(now.x - parts[0], now.y - parts[1], now.z - parts[2]) < 1.5;
    }
    e.setDynamicProperty("trolling:lastPos", `${now.x},${now.y},${now.z}`);
    e.setDynamicProperty("trolling:isStuck", stuckNow);
    return stuckNow;
  } catch {
    return false;
  }
}

// Teleport rules: only FROM a spot no non-placer player sees, only TO a spot no
// non-placer player sees. The placer is the one player allowed to watch it blink.
function tryStealthTeleport(e, dim, target, playersHere, ownerId, ringMin, ringMax) {
  try {
    const watchers = playersHere.filter((p) => p.id !== ownerId);
    if (watchers.some((p) => canSee(p, eyeOf(e)))) return false;
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = ringMin + Math.random() * (ringMax - ringMin);
      const x = target.location.x + Math.cos(ang) * r;
      const z = target.location.z + Math.sin(ang) * r;
      const y = groundY(dim, x, target.location.y, z);
      if (y === null) continue;
      if (watchers.some((p) => canSee(p, { x, y: y + 1.5, z }))) continue;
      e.teleport({ x, y, z });
      e.setDynamicProperty("trolling:isStuck", false);
      return true;
    }
  } catch {}
  return false;
}

// ---------------------------------------------------------------- mock AI

function stalkTick(e, dim, target, playersHere, ownerId, d) {
  faceToward(e, target.location); // always staring
  if (d < STALK_MIN - 2) {
    // player closed the gap — retreat to keep the 30-block minimum
    const away = {
      x: e.location.x * 2 - target.location.x,
      y: e.location.y,
      z: e.location.z * 2 - target.location.z,
    };
    moveToward(e, away, WALK_SPEED);
    if (stuckCheck(e)) tryStealthTeleport(e, dim, target, playersHere, ownerId, STALK_MIN + 3, STALK_MIN + 14);
  } else if (d > STALK_MIN + 5) {
    moveToward(e, target.location, WALK_SPEED);
    if (stuckCheck(e)) tryStealthTeleport(e, dim, target, playersHere, ownerId, STALK_MIN + 1, STALK_MIN + 10);
  }
  // inside the 28..35 band: hold position and stare
}

function chaseTick(e, dim, prey, playersHere, ownerId) {
  const d = dist(prey.location, e.location);
  faceToward(e, prey.location);
  if (d > 2.0) {
    moveToward(e, prey.location, CHASE_SPEED);
    if (stuckCheck(e)) tryStealthTeleport(e, dim, prey, playersHere, ownerId, 6, 14);
    return;
  }
  const cd = e.getDynamicProperty("trolling:atkCd") ?? 0;
  if (tickCount < cd) return;
  e.setDynamicProperty("trolling:atkCd", tickCount + 20);
  try {
    prey.applyDamage(WOOD_SWORD_DMG, { cause: EntityDamageCause.entityAttack, damagingEntity: e });
    playSound(dim, "game.player.hurt", prey.location);
  } catch {}
}

function mockTick(e, dim, isHunter) {
  try {
    const ownerId = e.getDynamicProperty("trolling:owner");
    const playersHere = world.getAllPlayers().filter((p) => p.dimension.id === dim.id);
    const others = playersHere.filter((p) => p.id !== ownerId);
    if (others.length === 0) return; // nobody to stalk — stand like a Skin Mocker

    let target = null;
    let best = Infinity;
    for (const p of others) {
      const d = dist(p.location, e.location);
      if (d < best) {
        best = d;
        target = p;
      }
    }

    let mode = e.getDynamicProperty("trolling:mode") ?? "stalk";

    if (isHunter && mode !== "chase") {
      let fuse = e.getDynamicProperty("trolling:fuse");
      if (fuse === undefined) {
        fuse = FUSE_MIN_TICKS + Math.floor(Math.random() * (FUSE_MAX_TICKS - FUSE_MIN_TICKS));
        e.setDynamicProperty("trolling:fuse", fuse);
      }
      if (best < 48) {
        const t = (e.getDynamicProperty("trolling:stalkTicks") ?? 0) + 1;
        e.setDynamicProperty("trolling:stalkTicks", t);
        if (t >= fuse) {
          mode = "chase";
          e.setDynamicProperty("trolling:mode", "chase");
          e.setDynamicProperty("trolling:prey", target.id);
          playSound(dim, "mob.enderman.stare", target.location);
        }
      }
    }

    if (isHunter && mode === "chase") {
      const preyId = e.getDynamicProperty("trolling:prey");
      const prey = others.find((p) => p.id === preyId);
      if (!prey) {
        // prey left or died — go back to lurking with a fresh random fuse
        e.setDynamicProperty("trolling:mode", "stalk");
        e.setDynamicProperty("trolling:stalkTicks", 0);
        e.setDynamicProperty("trolling:fuse", undefined);
        e.setDynamicProperty("trolling:prey", undefined);
        return;
      }
      chaseTick(e, dim, prey, playersHere, ownerId);
      return;
    }

    stalkTick(e, dim, target, playersHere, ownerId, best);
  } catch {}
}

// ---------------------------------------------------------------- minecart

function isPoweredRail(b) {
  try {
    return b !== undefined && b.typeId === "minecraft:golden_rail" && b.permutation.getState("rail_data_bit") === true;
  } catch {
    return false;
  }
}

function boostCart(cart) {
  try {
    const loc = cart.location;
    const dim = cart.dimension;
    const bx = Math.floor(loc.x);
    const by = Math.floor(loc.y);
    const bz = Math.floor(loc.z);
    let rail;
    try {
      rail = dim.getBlock({ x: bx, y: by, z: bz });
      if (!isPoweredRail(rail)) rail = dim.getBlock({ x: bx, y: by - 1, z: bz });
    } catch {
      return;
    }
    if (!isPoweredRail(rail)) return;
    const v = cart.getVelocity();
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.05 || speed >= MAX_CART_SPEED) return;
    // every powered rail pass stacks more speed on top
    const boost = Math.min(0.3 + speed * 0.5, MAX_CART_SPEED - speed);
    cart.applyImpulse({ x: (v.x / speed) * boost, y: 0, z: (v.z / speed) * boost });
  } catch {}
}

// ---------------------------------------------------------------- chunk miner

const activeChunks = new Set();

function clearLayer(dim, cx, cz, y) {
  for (let x = cx; x < cx + 16; x++) {
    for (let z = cz; z < cz + 16; z++) {
      try {
        const b = dim.getBlock({ x, y, z });
        if (!b) continue;
        const t = b.typeId;
        if (t === "minecraft:air" || t === "minecraft:bedrock") continue;
        b.setType("minecraft:air");
      } catch {}
    }
  }
}

function startChunkClear(dim, loc) {
  const cx = Math.floor(loc.x / 16) * 16;
  const cz = Math.floor(loc.z / 16) * 16;
  const key = `${dim.id}:${cx}:${cz}`;
  if (activeChunks.has(key)) return;
  activeChunks.add(key);
  let range;
  try {
    range = dim.heightRange;
  } catch {
    range = { min: -64, max: 320 };
  }
  let y = range.max - 1;
  const handle = system.runInterval(() => {
    try {
      // 3 layers a tick, top to bottom — the whole chunk pours away like sand
      for (let n = 0; n < 3 && y >= range.min; n++, y--) {
        clearLayer(dim, cx, cz, y);
        if (y % 8 === 0) playSound(dim, "dig.sand", { x: cx + 8, y, z: cz + 8 });
      }
      if (y < range.min) {
        system.clearRun(handle);
        activeChunks.delete(key);
      }
    } catch {
      system.clearRun(handle);
      activeChunks.delete(key);
    }
  }, 1);
}

// ---------------------------------------------------------------- events

// Place Speed Minecart / Skin Mock entities from their items
world.afterEvents.itemUseOn.subscribe((ev) => {
  try {
    const player = ev.source;
    const itemStack = ev.itemStack;
    if (!player || player.typeId !== "minecraft:player" || !itemStack) return;
    const def = PLACERS[itemStack.typeId];
    if (!def) return;
    const dim = player.dimension;
    const block = ev.block;
    let pos;
    if (def.railOnly) {
      if (!RAILS.has(block.typeId)) {
        actionBar(player, "§cPlace the Speed Minecart on a rail");
        return;
      }
      pos = { x: block.location.x + 0.5, y: block.location.y + 0.4, z: block.location.z + 0.5 };
    } else {
      const off = FACE_OFFSETS[String(ev.blockFace)] ?? { x: 0, y: 1, z: 0 };
      pos = {
        x: block.location.x + off.x + 0.5,
        y: block.location.y + off.y,
        z: block.location.z + off.z + 0.5,
      };
    }
    let ent;
    try {
      ent = dim.spawnEntity(def.entity, pos);
    } catch {
      return;
    }
    try {
      ent.setDynamicProperty("trolling:owner", player.id);
      ent.setDynamicProperty("trolling:ownerName", player.name);
      if (def.entity !== CART) {
        ent.nameTag = player.name; // it wears your name. that's the mock.
        faceToward(ent, player.location);
      }
    } catch {}
    consumeOne(player, itemStack.typeId);
    playSound(dim, def.railOnly ? "step.stone" : "dig.stone", pos);
  } catch {}
});

// Punch/mine the mock entities to break them; only a pickaxe gets the item back
world.afterEvents.entityHitEntity.subscribe((ev) => {
  try {
    const atk = ev.damagingEntity;
    const vic = ev.hitEntity;
    if (!atk || atk.typeId !== "minecraft:player") return;
    if (!vic || !MOCK_TYPES.has(vic.typeId)) return;
    const hits = (vic.getDynamicProperty("trolling:hits") ?? 0) + 1;
    if (hits < HITS_TO_BREAK) {
      vic.setDynamicProperty("trolling:hits", hits);
      playSound(vic.dimension, "dig.stone", vic.location);
      actionBar(atk, `§7Breaking... ${hits}/${HITS_TO_BREAK}`);
      return;
    }
    const dropId = MOCK_DROPS[vic.typeId];
    const loc = vic.location;
    const dim = vic.dimension;
    const held = getHeldItem(atk);
    const gotPick = held !== undefined && isPickaxeId(held.typeId);
    try {
      vic.remove();
    } catch {
      try {
        vic.kill();
      } catch {}
    }
    playSound(dim, "dig.wood", loc);
    if (gotPick) {
      try {
        dim.spawnItem(new ItemStack(dropId, 1), { x: loc.x, y: loc.y + 0.5, z: loc.z });
        actionBar(atk, "§aBroken — item dropped");
      } catch {}
    } else {
      actionBar(atk, "§cBroken — mine it with a pickaxe to keep the item");
    }
  } catch {}
});

// Chunk Miner: cancel the normal break, then erase the whole chunk (no drops)
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  try {
    const item = ev.itemStack;
    if (!item || item.typeId !== CHUNK_PICK) return;
    const dim = ev.block.dimension;
    const loc = { x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };
    ev.cancel = true;
    system.run(() => startChunkClear(dim, loc));
  } catch {}
});

// Pure Sky Block only drops itself when mined with a diamond pickaxe
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  try {
    if (ev.brokenBlockPermutation?.type?.id !== SKY_BLOCK) return;
    const tool = ev.itemStackAfterBreak;
    if (!tool || tool.typeId !== "minecraft:diamond_pickaxe") return;
    const l = ev.block.location;
    ev.dimension.spawnItem(new ItemStack(SKY_BLOCK, 1), { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 });
  } catch {}
});

// ---------------------------------------------------------------- main loop

system.runInterval(() => {
  tickCount++;
  for (const dimId of DIMS) {
    let dim;
    try {
      dim = world.getDimension(dimId);
    } catch {
      continue;
    }
    if (tickCount % 2 === 0) {
      for (const cart of safeGetEntities(dim, CART)) boostCart(cart);
    }
    for (const e of safeGetEntities(dim, STALKER)) mockTick(e, dim, false);
    for (const e of safeGetEntities(dim, HUNTER)) mockTick(e, dim, true);
  }
}, 1);

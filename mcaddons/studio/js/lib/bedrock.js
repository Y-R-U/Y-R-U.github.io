// Bedrock knowledge: version constants, file templates, and the component catalog
// that powers the component browser, the wizards and the checker.

export const FORMAT = {
  engine: [1, 21, 0],
  manifest: 2,
  entityBP: '1.21.0',
  entityRP: '1.10.0',
  item: '1.21.10',
  block: '1.21.0',
  geo: '1.12.0',
  anim: '1.8.0',
  rc: '1.10.0',
  ac: '1.10.0',
  spawn: '1.8.0',
  loot: '1.21.0',
  recipe: '1.21.0'
};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const ID_RE = /^[a-z0-9_]+:[a-z0-9_]+$/;
export const NAME_RE = /^[a-z0-9_]+$/;

export function safeName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'thing';
}
export function titleCase(s) {
  return String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ------------------------------------------------------------- manifests ---
export function manifest({ name, description, kind, uuidHeader, uuidModule, dependsOn, scripts }) {
  const m = {
    format_version: FORMAT.manifest,
    header: {
      name, description,
      uuid: uuidHeader || uuid(),
      version: [1, 0, 0],
      min_engine_version: FORMAT.engine
    },
    modules: [{
      type: kind === 'bp' ? (scripts ? 'script' : 'data') : 'resources',
      uuid: uuidModule || uuid(),
      version: [1, 0, 0],
      ...(scripts ? { language: 'javascript', entry: 'scripts/main.js' } : {})
    }]
  };
  if (dependsOn) m.dependencies = [{ uuid: dependsOn, version: [1, 0, 0] }];
  if (scripts) m.dependencies = [...(m.dependencies || []), { module_name: '@minecraft/server', version: '1.13.0' }];
  return m;
}

// ------------------------------------------------------------ entity (BP) ---
/**
 * opts: {health, speed, attack, hostile, tame, flying, floats, scale, isFire, drops[],
 *        family[], collision:{w,h}, ridable, breeds, panics, follows:'wheat'…}
 */
export function entityBP(id, opts = {}) {
  const o = {
    health: 20, speed: 0.25, attack: 3, hostile: false, scale: 1,
    collision: { w: 0.9, h: 1.8 }, family: [], ...opts
  };
  const comps = {
    'minecraft:type_family': { family: [id.split(':')[1], ...(o.hostile ? ['monster'] : ['mob']), ...o.family] },
    'minecraft:collision_box': { width: o.collision.w, height: o.collision.h },
    'minecraft:health': { value: o.health, max: o.health },
    'minecraft:movement': { value: o.speed },
    'minecraft:navigation.walk': { can_path_over_water: true, avoid_water: !o.swims, avoid_damage_blocks: true },
    'minecraft:movement.basic': {},
    'minecraft:jump.static': {},
    'minecraft:can_climb': {},
    'minecraft:physics': {},
    'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
    'minecraft:nameable': {}
  };
  // Match vanilla: monsters fade away when you walk off, animals stay put. A friendly mob a child
  // has just made and named vanishing 40 blocks later reads as "my add-on is broken".
  if (o.hostile) comps['minecraft:despawn'] = { despawn_from_distance: {} };
  else comps['minecraft:persistent'] = {};
  if (o.scale !== 1) comps['minecraft:scale'] = { value: o.scale };
  if (o.flying) {
    delete comps['minecraft:navigation.walk'];
    comps['minecraft:navigation.fly'] = { can_path_over_water: true };
    comps['minecraft:movement.fly'] = {};
    comps['minecraft:behavior.random_fly'] = { priority: 5, xz_dist: 15, y_dist: 5, y_offset: 0, can_land_on_trees: true };
  }
  if (o.floats) comps['minecraft:float'] = {};
  if (o.fireImmune) comps['minecraft:fire_immune'] = {};
  if (o.hostile) {
    comps['minecraft:attack'] = { damage: o.attack };
    comps['minecraft:behavior.melee_attack'] = { priority: 3, track_target: true, speed_multiplier: 1.2 };
    comps['minecraft:behavior.nearest_attackable_target'] = {
      priority: 2, must_see: true, reselect_targets: true, within_radius: 24,
      entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }]
    };
  }
  if (o.panics !== false && !o.hostile) comps['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.6 };
  comps['minecraft:behavior.random_stroll'] = { priority: 6, speed_multiplier: 1 };
  comps['minecraft:behavior.look_at_player'] = { priority: 7, look_distance: 8, probability: 0.02 };
  comps['minecraft:behavior.random_look_around'] = { priority: 8 };
  if (o.follows) comps['minecraft:behavior.follow_owner'] = { priority: 4, speed_multiplier: 1, start_distance: 10, stop_distance: 2 };
  if (o.tame) {
    comps['minecraft:tameable'] = { probability: 0.33, tame_items: o.tameItems || ['bone'], tame_event: { event: 'minecraft:on_tame', target: 'self' } };
  }
  if (o.rideable) comps['minecraft:rideable'] = { seat_count: 1, family_types: ['player'], seats: { position: [0, o.collision.h * 0.6, 0] } };
  if (o.drops && o.drops.length) comps['minecraft:loot'] = { table: `loot_tables/entities/${id.split(':')[1]}.json` };

  return {
    format_version: FORMAT.entityBP,
    'minecraft:entity': {
      description: {
        identifier: id,
        is_spawnable: true,
        is_summonable: true,
        is_experimental: false,
        ...(o.runtimeIdentifier ? { runtime_identifier: o.runtimeIdentifier } : {})
      },
      component_groups: {},
      components: comps,
      events: {}
    }
  };
}

// ------------------------------------------------------------ entity (RP) ---
export function entityRP(id, { geo, texture, anims = {}, mat = 'entity_alphatest', spawnEgg }) {
  const short = id.split(':')[1];
  const out = {
    format_version: FORMAT.entityRP,
    'minecraft:client_entity': {
      description: {
        identifier: id,
        materials: { default: mat },
        textures: { default: texture || `textures/entity/${short}` },
        geometry: { default: geo || `geometry.${short}` },
        animations: anims,
        scripts: Object.keys(anims).length ? { animate: pickAnimateList(anims) } : {},
        render_controllers: ['controller.render.' + short],
        spawn_egg: spawnEgg || { base_color: '#6cc349', overlay_color: '#ffc83c' }
      }
    }
  };
  return out;
}
function pickAnimateList(anims) {
  const list = [];
  if (anims.idle) list.push('idle');
  if (anims.walk) list.push({ walk: 'query.modified_move_speed > 0.1' });
  for (const k of Object.keys(anims)) if (k !== 'idle' && k !== 'walk') list.push(k);
  return list;
}

export function renderController(id) {
  const short = id.split(':')[1];
  return {
    format_version: FORMAT.rc,
    render_controllers: {
      ['controller.render.' + short]: {
        geometry: 'Geometry.default',
        materials: [{ '*': 'Material.default' }],
        textures: ['Texture.default']
      }
    }
  };
}

// ----------------------------------------------------------------- items ----
export function itemBP(id, opts = {}) {
  const short = id.split(':')[1];
  const c = {
    'minecraft:icon': opts.iconAsObject ? { texture: short } : short,
    'minecraft:display_name': { value: opts.displayName || titleCase(short) },
    'minecraft:max_stack_size': opts.stack ?? 64
  };
  if (opts.kind === 'food') {
    c['minecraft:food'] = { nutrition: opts.nutrition ?? 4, saturation_modifier: 'normal', can_always_eat: !!opts.alwaysEat };
    c['minecraft:use_modifiers'] = { use_duration: 1.6, movement_modifier: 0.35 };
    c['minecraft:use_animation'] = 'eat';
    c['minecraft:max_stack_size'] = opts.stack ?? 16;
  }
  if (opts.kind === 'tool' || opts.kind === 'weapon') {
    c['minecraft:max_stack_size'] = 1;
    c['minecraft:damage'] = { value: opts.damage ?? 6 };
    c['minecraft:durability'] = { max_durability: opts.durability ?? 250 };
    c['minecraft:hand_equipped'] = true;
    c['minecraft:enchantable'] = { value: 14, slot: opts.kind === 'weapon' ? 'sword' : 'pickaxe' };
    if (opts.kind === 'tool') c['minecraft:digger'] = {
      use_efficiency: true,
      destroy_speeds: [{ block: { tags: "q.any_tag('stone','metal')" }, speed: opts.digSpeed ?? 8 }]
    };
  }
  if (opts.fuel) c['minecraft:fuel'] = { duration: opts.fuel };
  if (opts.glint) c['minecraft:glint'] = true;
  if (opts.wearable) c['minecraft:wearable'] = { slot: 'slot.armor.head', protection: opts.protection ?? 2 };
  return { format_version: FORMAT.item, 'minecraft:item': { description: { identifier: id, menu_category: { category: opts.category || 'items', group: opts.group || undefined } }, components: c } };
}

// ---------------------------------------------------------------- blocks ----
export function blockBP(id, opts = {}) {
  const short = id.split(':')[1];
  const c = {
    'minecraft:destructible_by_mining': { seconds_to_destroy: opts.hardness ?? 1.5 },
    'minecraft:destructible_by_explosion': { explosion_resistance: opts.blast ?? 3 },
    'minecraft:map_color': opts.mapColor || '#7f7f7f',
    'minecraft:geometry': opts.geometry || 'minecraft:geometry.full_block',
    'minecraft:material_instances': {
      '*': { texture: short, render_method: opts.transparent ? 'blend' : 'opaque', ambient_occlusion: true, face_dimming: true }
    }
  };
  if (opts.light) c['minecraft:light_emission'] = opts.light;
  if (opts.friction != null) c['minecraft:friction'] = opts.friction;
  if (opts.loot) c['minecraft:loot'] = opts.loot;
  return {
    format_version: FORMAT.block,
    'minecraft:block': {
      description: { identifier: id, menu_category: { category: opts.category || 'construction' } },
      components: c
    }
  };
}

// -------------------------------------------------------------- geometry ----
/** A simple 4-legged / biped starter model — real Bedrock geometry, not a stub. */
export function starterGeo(short, shape = 'blob') {
  const g = {
    format_version: FORMAT.geo,
    'minecraft:geometry': [{
      description: {
        identifier: 'geometry.' + short,
        texture_width: 64, texture_height: 64,
        visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 1, 0]
      },
      bones: []
    }]
  };
  const B = g['minecraft:geometry'][0].bones;
  if (shape === 'biped') {
    B.push({ name: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] });
    B.push({ name: 'head', parent: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] });
    B.push({ name: 'leg0', parent: 'body', pivot: [-2, 12, 0], cubes: [{ origin: [-4, 0, -2], size: [4, 12, 4], uv: [0, 16] }] });
    B.push({ name: 'leg1', parent: 'body', pivot: [2, 12, 0], cubes: [{ origin: [0, 0, -2], size: [4, 12, 4], uv: [0, 16], mirror: true }] });
    B.push({ name: 'arm0', parent: 'body', pivot: [-5, 22, 0], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }] });
    B.push({ name: 'arm1', parent: 'body', pivot: [5, 22, 0], cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 16], mirror: true }] });
  } else if (shape === 'quadruped') {
    B.push({ name: 'body', pivot: [0, 12, 0], rotation: [90, 0, 0], cubes: [{ origin: [-4, 8, -8], size: [8, 16, 8], uv: [16, 16] }] });
    B.push({ name: 'head', parent: 'body', pivot: [0, 16, -8], cubes: [{ origin: [-4, 12, -14], size: [8, 8, 6], uv: [0, 0] }] });
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 2 : -6, z = i < 2 ? -6 : 5;
      B.push({ name: 'leg' + i, parent: 'body', pivot: [x + 2, 8, z + 2], cubes: [{ origin: [x, 0, z], size: [4, 8, 4], uv: [0, 16] }] });
    }
  } else { // blob — friendliest thing to start from. Feet sit exactly on y=0, or the mob sinks
           // into the floor and pokes out of its visible bounds.
    B.push({ name: 'body', pivot: [0, 8, 0], cubes: [{ origin: [-6, 3, -6], size: [12, 10, 12], uv: [0, 20] }] });
    B.push({ name: 'head', parent: 'body', pivot: [0, 13, 0], cubes: [{ origin: [-5, 13, -5], size: [10, 8, 10], uv: [0, 0] }] });
    B.push({ name: 'legL', parent: 'body', pivot: [-3, 3, 0], cubes: [{ origin: [-5, 0, -2], size: [4, 3, 4], uv: [0, 42] }] });
    B.push({ name: 'legR', parent: 'body', pivot: [3, 3, 0], cubes: [{ origin: [1, 0, -2], size: [4, 3, 4], uv: [0, 42], mirror: true }] });
  }
  return g;
}

/** Idle bob + walk cycle that works on any of the starter shapes. */
export function starterAnims(short, shape = 'blob') {
  const a = { format_version: FORMAT.anim, animations: {} };
  a.animations[`animation.${short}.idle`] = {
    loop: true, animation_length: 2,
    bones: {
      head: { rotation: { '0.0': [0, 0, 0], '1.0': [-4, 8, 0], '2.0': [0, 0, 0] } },
      body: { position: { '0.0': [0, 0, 0], '1.0': [0, 0.4, 0], '2.0': [0, 0, 0] } }
    }
  };
  const legs = shape === 'quadruped' ? ['leg0', 'leg1', 'leg2', 'leg3']
    : shape === 'biped' ? ['leg0', 'leg1', 'arm0', 'arm1'] : ['legL', 'legR'];
  const bones = {};
  legs.forEach((n, i) => {
    const phase = i % 2 ? 'math.cos' : 'math.sin';
    bones[n] = { rotation: [`${phase}(query.anim_time * 720) * 25`, 0, 0] };
  });
  bones.body = { position: { '0.0': [0, 0, 0], '0.25': [0, 0.8, 0], '0.5': [0, 0, 0], '0.75': [0, 0.8, 0], '1.0': [0, 0, 0] } };
  a.animations[`animation.${short}.walk`] = { loop: true, animation_length: 1, bones };
  return a;
}

// -------------------------------------------------------------- misc files --
export function langLines(entries) {
  return Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}
export function itemTexture(packName, entries) {
  return { resource_pack_name: packName, texture_name: 'atlas.items', texture_data: entries };
}
export function terrainTexture(packName, entries) {
  return { resource_pack_name: packName, texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: entries };
}
export function spawnRule(id, opts = {}) {
  return {
    format_version: FORMAT.spawn,
    'minecraft:spawn_rules': {
      description: { identifier: id, population_control: opts.hostile ? 'monster' : 'animal' },
      conditions: [{
        'minecraft:spawns_on_surface': {},
        'minecraft:brightness_filter': opts.hostile ? { min: 0, max: 7, adjust_for_weather: true } : { min: 7, max: 15, adjust_for_weather: false },
        'minecraft:difficulty_filter': { min: 'easy', max: 'hard' },
        'minecraft:weight': { default: opts.weight ?? 8 },
        'minecraft:herd': { min_size: 1, max_size: opts.herd ?? 3 },
        'minecraft:biome_filter': { test: 'has_biome_tag', operator: '==', value: opts.biome || 'overworld' }
      }]
    }
  };
}
export function lootTable(items) {
  return {
    pools: [{
      rolls: 1,
      entries: items.map(it => ({ type: 'item', name: it.name, weight: it.weight ?? 1, functions: [{ function: 'set_count', count: { min: it.min ?? 1, max: it.max ?? 1 } }] }))
    }]
  };
}

// ------------------------------------------------------ component catalog ---
// Used by the component browser (the bridge. replacement) and the checker.
// `kid` is the one-sentence plain-English description shown in the UI.
export const COMPONENTS = [
  // movement & body
  { id: 'minecraft:health', group: 'Body', kid: 'How many hearts it has (2 health = 1 heart).', value: { value: 20, max: 20 } },
  { id: 'minecraft:movement', group: 'Body', kid: 'How fast it walks. 0.25 is a normal cow.', value: { value: 0.25 } },
  { id: 'minecraft:collision_box', group: 'Body', kid: 'How wide and tall it is for bumping into things.', value: { width: 0.9, height: 1.8 } },
  { id: 'minecraft:scale', group: 'Body', kid: 'Makes the whole mob bigger or smaller.', value: { value: 1 } },
  { id: 'minecraft:physics', group: 'Body', kid: 'Gravity and collisions apply to it. Almost every mob needs this.', value: {} },
  { id: 'minecraft:knockback_resistance', group: 'Body', kid: 'How hard it is to push around when hit.', value: { value: 0.5 } },
  { id: 'minecraft:fire_immune', group: 'Body', kid: 'Fire and lava do not hurt it.', value: true },
  { id: 'minecraft:is_baby', group: 'Body', kid: 'Marks it as a baby version.', value: {} },
  { id: 'minecraft:can_climb', group: 'Body', kid: 'It can climb ladders and vines.', value: {} },
  { id: 'minecraft:float', group: 'Body', kid: 'It floats instead of sinking in water.', value: {} },
  { id: 'minecraft:breathable', group: 'Body', kid: 'What it can breathe in.', value: { total_supply: 15, suffocate_time: 0, breathes_air: true, breathes_water: false } },
  // navigation & movement style
  { id: 'minecraft:movement.basic', group: 'Moving', kid: 'Normal walking movement.', value: {} },
  { id: 'minecraft:movement.fly', group: 'Moving', kid: 'It flies instead of walking.', value: {} },
  { id: 'minecraft:movement.jump', group: 'Moving', kid: 'It hops along like a rabbit.', value: { jump_delay: [0.5, 1] } },
  { id: 'minecraft:navigation.walk', group: 'Moving', kid: 'How it works out a path on the ground.', value: { can_path_over_water: true, avoid_damage_blocks: true } },
  { id: 'minecraft:navigation.fly', group: 'Moving', kid: 'How it works out a path in the air.', value: { can_path_over_water: true } },
  { id: 'minecraft:navigation.swim', group: 'Moving', kid: 'How it works out a path in water.', value: { can_path_over_water: false } },
  { id: 'minecraft:jump.static', group: 'Moving', kid: 'It can jump one block up.', value: {} },
  // behaviours
  { id: 'minecraft:behavior.random_stroll', group: 'Behaviour', kid: 'Wanders around on its own.', value: { priority: 6, speed_multiplier: 1 } },
  { id: 'minecraft:behavior.look_at_player', group: 'Behaviour', kid: 'Turns its head to look at you.', value: { priority: 7, look_distance: 8, probability: 0.02 } },
  { id: 'minecraft:behavior.random_look_around', group: 'Behaviour', kid: 'Looks around now and then.', value: { priority: 8 } },
  { id: 'minecraft:behavior.melee_attack', group: 'Behaviour', kid: 'Runs at its target and hits it.', value: { priority: 3, track_target: true } },
  { id: 'minecraft:behavior.nearest_attackable_target', group: 'Behaviour', kid: 'Chooses who to attack.', value: { priority: 2, must_see: true, within_radius: 24, entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }] } },
  { id: 'minecraft:behavior.panic', group: 'Behaviour', kid: 'Runs away when it gets hurt.', value: { priority: 1, speed_multiplier: 1.6 } },
  { id: 'minecraft:behavior.follow_owner', group: 'Behaviour', kid: 'Follows the player who tamed it.', value: { priority: 4, speed_multiplier: 1, start_distance: 10, stop_distance: 2 } },
  { id: 'minecraft:behavior.tempt', group: 'Behaviour', kid: 'Follows a player holding a certain item.', value: { priority: 4, speed_multiplier: 1.2, items: ['wheat'] } },
  { id: 'minecraft:behavior.avoid_mob_type', group: 'Behaviour', kid: 'Runs away from certain mobs.', value: { priority: 3, entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 8 }] } },
  { id: 'minecraft:behavior.float', group: 'Behaviour', kid: 'Swims up so it does not drown.', value: { priority: 0 } },
  { id: 'minecraft:behavior.random_fly', group: 'Behaviour', kid: 'Flies about randomly.', value: { priority: 5, xz_dist: 15, y_dist: 5 } },
  { id: 'minecraft:behavior.hurt_by_target', group: 'Behaviour', kid: 'Fights back when hit.', value: { priority: 1 } },
  { id: 'minecraft:behavior.stay_while_sitting', group: 'Behaviour', kid: 'Stays put when told to sit.', value: { priority: 3 } },
  // interaction
  { id: 'minecraft:attack', group: 'Fighting', kid: 'How much damage its hit does.', value: { damage: 3 } },
  { id: 'minecraft:tameable', group: 'People', kid: 'You can tame it with an item.', value: { probability: 0.33, tame_items: ['bone'] } },
  { id: 'minecraft:rideable', group: 'People', kid: 'You can ride it.', value: { seat_count: 1, family_types: ['player'], seats: { position: [0, 1, 0] } } },
  { id: 'minecraft:breedable', group: 'People', kid: 'Two of them can make a baby.', value: { require_tame: false, breeds_with: [], breed_items: ['wheat'] } },
  { id: 'minecraft:interact', group: 'People', kid: 'Something happens when you use an item on it.', value: { interactions: [] } },
  { id: 'minecraft:nameable', group: 'People', kid: 'You can name it with a name tag.', value: {} },
  { id: 'minecraft:loot', group: 'People', kid: 'What it drops when it dies.', value: { table: 'loot_tables/entities/thing.json' } },
  { id: 'minecraft:type_family', group: 'People', kid: 'Groups it belongs to, e.g. monster.', value: { family: ['mob'] } },
  { id: 'minecraft:despawn', group: 'People', kid: 'It disappears when nobody is nearby.', value: { despawn_from_distance: {} } },
  { id: 'minecraft:persistent', group: 'People', kid: 'It never disappears on its own.', value: {} },
  // items
  { id: 'minecraft:icon', group: 'Item', kid: 'Which picture the item uses.', value: 'my_item', for: 'item' },
  { id: 'minecraft:display_name', group: 'Item', kid: 'The name shown in the game.', value: { value: 'My Item' }, for: 'item' },
  { id: 'minecraft:max_stack_size', group: 'Item', kid: 'How many fit in one slot.', value: 64, for: 'item' },
  { id: 'minecraft:food', group: 'Item', kid: 'Makes it edible and says how filling it is.', value: { nutrition: 4, saturation_modifier: 'normal' }, for: 'item' },
  { id: 'minecraft:damage', group: 'Item', kid: 'Extra damage when you hit with it.', value: { value: 6 }, for: 'item' },
  { id: 'minecraft:durability', group: 'Item', kid: 'How many uses before it breaks.', value: { max_durability: 250 }, for: 'item' },
  { id: 'minecraft:hand_equipped', group: 'Item', kid: 'Held like a tool instead of a block.', value: true, for: 'item' },
  { id: 'minecraft:glint', group: 'Item', kid: 'Gives it the enchanted shimmer.', value: true, for: 'item' },
  { id: 'minecraft:fuel', group: 'Item', kid: 'It can be burned in a furnace.', value: { duration: 20 }, for: 'item' },
  { id: 'minecraft:wearable', group: 'Item', kid: 'It can be worn in an armour slot.', value: { slot: 'slot.armor.head' }, for: 'item' },
  { id: 'minecraft:use_animation', group: 'Item', kid: 'The animation when you hold use — eat, drink, bow.', value: 'eat', for: 'item' },
  // blocks
  { id: 'minecraft:destructible_by_mining', group: 'Block', kid: 'How long it takes to break.', value: { seconds_to_destroy: 1.5 }, for: 'block' },
  { id: 'minecraft:destructible_by_explosion', group: 'Block', kid: 'How well it survives explosions.', value: { explosion_resistance: 3 }, for: 'block' },
  { id: 'minecraft:material_instances', group: 'Block', kid: 'Which texture goes on which side.', value: { '*': { texture: 'my_block', render_method: 'opaque' } }, for: 'block' },
  { id: 'minecraft:geometry', group: 'Block', kid: 'The 3D shape of the block.', value: 'minecraft:geometry.full_block', for: 'block' },
  { id: 'minecraft:light_emission', group: 'Block', kid: 'How much light it gives off (0–15).', value: 15, for: 'block' },
  { id: 'minecraft:friction', group: 'Block', kid: 'How slippery it is. 0.98 is ice.', value: 0.6, for: 'block' },
  { id: 'minecraft:map_color', group: 'Block', kid: 'Its colour on a map.', value: '#7f7f7f', for: 'block' },
  { id: 'minecraft:collision_box', group: 'Block', kid: 'The invisible box you bump into.', value: { origin: [-8, 0, -8], size: [16, 16, 16] }, for: 'block' },
  { id: 'minecraft:loot', group: 'Block', kid: 'What it drops when broken.', value: 'loot_tables/blocks/my_block.json', for: 'block' }
];

// Real components we do not put in the browser (too niche or too fiddly for a child to edit by
// hand) but which must not be flagged as typos by the checker.
export const KNOWN_EXTRA = new Set([
  'minecraft:pushable', 'minecraft:despawn', 'minecraft:burns_in_daylight', 'minecraft:conditional_bandwidth_optimization',
  'minecraft:equipment', 'minecraft:equippable', 'minecraft:leashable', 'minecraft:balloonable', 'minecraft:boostable',
  'minecraft:hurt_on_condition', 'minecraft:damage_sensor', 'minecraft:environment_sensor', 'minecraft:timer',
  'minecraft:spell_effects', 'minecraft:transformation', 'minecraft:variant', 'minecraft:mark_variant',
  'minecraft:skin_id', 'minecraft:color', 'minecraft:color2', 'minecraft:teleport', 'minecraft:angry',
  'minecraft:sittable', 'minecraft:shooter', 'minecraft:projectile', 'minecraft:explode', 'minecraft:inventory',
  'minecraft:economy_trade_table', 'minecraft:trade_table', 'minecraft:scaffolding_climber', 'minecraft:home',
  'minecraft:water_movement', 'minecraft:underwater_movement', 'minecraft:lava_movement', 'minecraft:flying_speed',
  'minecraft:horse.jump_strength', 'minecraft:rail_movement', 'minecraft:rail_sensor', 'minecraft:input_ground_controlled',
  'minecraft:player.saturation', 'minecraft:player.exhaustion', 'minecraft:player.level', 'minecraft:player.experience',
  'minecraft:loot', 'minecraft:entity_sensor', 'minecraft:ageable', 'minecraft:breathable', 'minecraft:knockback_resistance',
  'minecraft:follow_range', 'minecraft:attack_cooldown', 'minecraft:on_death', 'minecraft:on_hurt', 'minecraft:on_target_acquired',
  'minecraft:on_target_escape', 'minecraft:on_friendly_anger', 'minecraft:spawn_entity', 'minecraft:area_attack',
  'minecraft:preferred_path', 'minecraft:dweller', 'minecraft:giveable', 'minecraft:combat_regeneration',
  'minecraft:block_climber', 'minecraft:body_rotation_blocked', 'minecraft:hide', 'minecraft:game_event_movement_tracking',
  'minecraft:custom_hit_test', 'minecraft:managed_wandering_trader', 'minecraft:physics', 'minecraft:is_stackable',
  'minecraft:is_baby', 'minecraft:is_charged', 'minecraft:is_saddled', 'minecraft:is_sheared', 'minecraft:is_tamed',
  'minecraft:is_illager_captain', 'minecraft:is_ignited', 'minecraft:can_fly', 'minecraft:can_power_jump',
  'minecraft:instant_despawn', 'minecraft:ambient_sound_interval', 'minecraft:entity_armor_equipment_slot_mapping'
]);

export const COMPONENT_MAP = new Map(COMPONENTS.map(c => [c.id + (c.for || 'entity'), c]));
export function findComponent(id, kind = 'entity') {
  return COMPONENT_MAP.get(id + kind) || COMPONENTS.find(c => c.id === id) || null;
}

// Vanilla items a child is likely to reference — used to sanity-check loot/recipes.
export const VANILLA_ITEMS = ['stick', 'diamond', 'iron_ingot', 'gold_ingot', 'emerald', 'apple', 'bread', 'bone', 'string',
  'leather', 'feather', 'coal', 'redstone', 'stone', 'dirt', 'cobblestone', 'oak_planks', 'glass', 'wheat', 'carrot',
  'potato', 'sugar', 'egg', 'milk_bucket', 'ender_pearl', 'blaze_rod', 'slime_ball', 'gunpowder', 'obsidian', 'netherite_ingot'];

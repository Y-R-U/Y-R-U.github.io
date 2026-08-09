/**
 * Key resolution and the fallback chain.
 *
 * Five modules call `audio.sfx()` and they were all written without seeing this file.
 * The contract that makes that survivable: **an unknown key never produces silence.**
 * It resolves to the nearest sensible relative — a school-correct spell sound, a
 * generic creature event, the right material's break — and gets logged once so the
 * gap is visible in `audio.missingKeys()` rather than mysteriously inaudible.
 *
 * Canonical namespaces:
 *   <material>_<event>        stone_break, glass_tinkle, ...  (flat: sim/materials.js owns these)
 *   spell.<id>.<event>        cast | travel | impact | loop
 *   spell.@<school>.<event>   the school generic, used as the spell fallback
 *   enemy.<id>.<event>        spawn | tell | attack | hit | death
 *   player.<event>            step[.mat] | jump | land[.hard] | dash | hurt | death | cast | heal
 *   ui.<event>                click hover confirm back deny error levelup spell_learn ...
 *   impact.soft|hard|heavy    explosion.small|big   collapse.start|land   whoosh.small|big
 *   amb.<event>               ambience one-shots (owned by ambience.js)
 */

/** Mirrors `MAT[m].sfx` from sim/materials.js. Duplicated deliberately: audio must not
 *  fail to load because the sim module is mid-edit by another agent. */
export const MAT_SFX = [
  { crack: 'stone_crack', break: 'stone_break', debris: 'stone_debris', burn: 'wood_burn', step: 'stone', name: 'masonry' },
  { crack: 'rock_crack', break: 'rock_break', debris: 'rock_debris', burn: 'wood_burn', step: 'rock', name: 'rock' },
  { crack: 'wood_crack', break: 'wood_break', debris: 'wood_debris', burn: 'wood_burn', step: 'wood', name: 'timber' },
  { crack: 'leaf_rustle', break: 'leaf_burst', debris: 'leaf_fall', burn: 'leaf_burn', step: 'leaf', name: 'foliage' },
  { crack: 'glass_crack', break: 'glass_break', debris: 'glass_tinkle', burn: null, step: 'glass', name: 'glass' },
  { crack: 'metal_dent', break: 'metal_break', debris: 'metal_clang', burn: null, step: 'metal', name: 'metal' },
  { crack: 'bone_crack', break: 'bone_break', debris: 'bone_clatter', burn: null, step: 'bone', name: 'bone' },
  { crack: 'dirt_crack', break: 'dirt_break', debris: 'dirt_fall', burn: 'wood_burn', step: 'dirt', name: 'earth' },
  { crack: 'flesh_hit', break: 'flesh_burst', debris: 'gib', burn: 'flesh_burn', step: 'flesh', name: 'flesh' },
];

const MAT_ALIAS = {
  masonry: 0, brick: 0, stone: 0, mortar: 0,
  rock: 1, boulder: 1,
  timber: 2, wood: 2, plank: 2, log: 2,
  foliage: 3, leaf: 3, leaves: 3, bush: 3, tree: 3,
  glass: 4,
  metal: 5, iron: 5, steel: 5,
  bone: 6, skull: 6,
  earth: 7, dirt: 7, soil: 7, grass: 7, mud: 7,
  flesh: 8, meat: 8, body: 8,
};

export const SCHOOLS = ['fire', 'storm', 'earth', 'decay', 'void', 'life'];

/** Guess a school from a spell id nobody registered. Beats the alternative (silence). */
const SCHOOL_HINTS = [
  ['fire', ['ember', 'pyre', 'cinder', 'flame', 'fire', 'burn', 'blaze', 'scorch', 'ash', 'meteor']],
  ['storm', ['spark', 'storm', 'gale', 'lightn', 'thunder', 'shock', 'bolt', 'wind', 'arc', 'static']],
  ['earth', ['stone', 'quake', 'sunder', 'thorn', 'bulwark', 'rock', 'boulder', 'root', 'shard', 'spike', 'wall']],
  ['decay', ['acid', 'blight', 'blood', 'rot', 'plague', 'spore', 'venom', 'poison', 'corrode', 'wither']],
  ['void', ['void', 'mirror', 'null', 'shadow', 'dark', 'rift', 'seam', 'warp', 'blink', 'tear']],
  ['life', ['grave', 'life', 'heal', 'bloom', 'ward', 'bless', 'soul', 'spirit', 'raise']],
];

export function guessSchool(id) {
  const s = String(id).toLowerCase();
  if (SCHOOLS.includes(s)) return s;
  for (const [school, words] of SCHOOL_HINTS) {
    for (const w of words) if (s.includes(w)) return school;
  }
  return null;
}

const SPELL_EVENT = {
  cast: 'cast', fire: 'cast', shoot: 'cast', launch: 'cast', start: 'cast', begin: 'cast',
  charge: 'cast', windup: 'cast', arrive: 'cast',
  travel: 'travel', fly: 'travel', loop: 'loop', sustain: 'loop', beam: 'loop', tick: 'travel',
  trail: 'travel', fade: 'travel', drip: 'travel', burn: 'loop',
  impact: 'impact', hit: 'impact', explode: 'impact', boom: 'impact', burst: 'impact', end: 'impact',
  detonate: 'impact', land: 'impact', fork: 'impact', finale: 'impact', strike: 'impact',
  erupt: 'impact', impale: 'impact', crush: 'impact', implode: 'impact', raise: 'impact',
  consume: 'impact', shrapnel: 'impact', eat: 'impact', release: 'impact', crack: 'impact',
  slam: 'impact', split: 'impact',
};

const ENEMY_EVENT = {
  spawn: 'spawn', appear: 'spawn', arrive: 'spawn', summon: 'spawn', emerge: 'spawn', birth: 'spawn',
  tell: 'tell', telegraph: 'tell', windup: 'tell', charge: 'tell', warn: 'tell', alert: 'tell',
  attack: 'attack', swipe: 'attack', bite: 'attack', shoot: 'attack', fire: 'attack', slam: 'attack',
  cast: 'attack', lunge: 'attack', loose: 'attack', smash: 'attack', spray: 'attack', drop: 'attack',
  rend: 'attack', lash: 'attack', grasp: 'attack', drag: 'attack', rain: 'attack', swing: 'attack',
  hit: 'hit', hurt: 'hit', damage: 'hit', pain: 'hit', ping: 'hit',
  death: 'death', die: 'death', died: 'death', kill: 'death',
  phase: 'phase', roar: 'roar', tear: 'tear',
};

const ENEMY_IDS = ['husk', 'sporeling', 'thornhound', 'gloamarcher', 'stonewarden', 'wispmaw', 'oozelord', 'sunderwraith', 'theseam'];

/**
 * The enemy and spell modules name their sounds with underscores and short creature
 * words (`warden_slam`, `hound_charge`, `spell_emberbolt_fork`). Rather than ask five
 * agents to rewrite their call sites, the resolver speaks that dialect too.
 */
const FLAT_CREATURE = {
  husk: 'husk', minion: 'husk',
  sporeling: 'sporeling', spore: 'sporeling',
  hound: 'thornhound', thornhound: 'thornhound',
  archer: 'gloamarcher', gloamarcher: 'gloamarcher',
  warden: 'stonewarden', stonewarden: 'stonewarden',
  wisp: 'wispmaw', wispmaw: 'wispmaw',
  ooze: 'oozelord', oozelord: 'oozelord', elite: 'oozelord',
  wraith: 'sunderwraith', sunderwraith: 'sunderwraith',
  seam: 'theseam', theseam: 'theseam', boss: 'theseam',
};

/** Direct aliases: names other modules are likely to reach for. */
export const ALIAS = {
  step: 'player.step', footstep: 'player.step', 'player.footstep': 'player.step',
  jump: 'player.jump', land: 'player.land', dash: 'player.dash', lift: 'player.lift',
  hurt: 'player.hurt', death: 'player.death', die: 'player.death',
  'player.die': 'player.death', 'player.land.soft': 'player.land',
  cast: 'player.cast', heal: 'player.heal',
  pickup: 'ui.pickup', 'pickup.shard': 'ui.pickup_shard', 'pickup.focus': 'ui.pickup_focus',
  shard: 'ui.pickup_shard', xp: 'ui.xp',
  levelup: 'ui.levelup', 'player.level': 'ui.levelup', 'level.up': 'ui.levelup',
  'spell.learn': 'ui.spell_learn', 'spell.levelup': 'ui.spell_levelup',
  'circle.ready': 'ui.circle_ready', 'ui.ready': 'ui.circle_ready',
  click: 'ui.click', hover: 'ui.hover', confirm: 'ui.confirm', back: 'ui.back',
  error: 'ui.error', deny: 'ui.deny', pause: 'ui.pause', unpause: 'ui.unpause',
  gameover: 'ui.gameover', 'game.over': 'ui.gameover',
  explosion: 'explosion.small', explode: 'explosion.small', boom: 'explosion.big',
  impact: 'impact.hard', thud: 'impact.soft', whoosh: 'whoosh.small',
  collapse: 'collapse.start', rubble: 'collapse.land',
  fire: 'fire.loop', burn: 'fire.loop', acid: 'acid.loop', slime: 'slime.loop',
  wind: 'wind.gust',
  'terrain.break': 'dirt_break', 'prop.break': 'wood_break',
  roar: 'enemy.theseam.roar',

  // --- the enemy + spell modules' own vocabulary (see fx.js / spells/*) ---------
  // Generic per-hit and per-death keys carry no creature id, so they resolve to body
  // sounds rather than a voice; the correct creature voice is played from the
  // `enemy:died` bus hook, and the two layer instead of doubling.
  enemy_hurt: 'enemy.husk.hit',
  enemy_die: 'flesh_burst',
  elite_die: 'impact.heavy',
  enemy_gib: 'gib',
  corpse_flop: 'flesh_hit',
  armour_ping: 'metal_dent',
  metal_ring: 'metal_clang',
  bolt_hit: 'impact.hard',
  glob_splash: 'spell.@fire.impact',
  slime_splat: 'flesh_hit',
  ooze_split: 'flesh_burst',
  sporeling_burst: 'enemy.sporeling.death',
  gravewake_raise: 'spell.gravewake.impact',
  shard_pickup: 'ui.pickup_shard',
  level_up: 'ui.levelup',
  level_up_circle: 'ui.spell_learn',
  spell_fizzle: 'player.focus_low',
  spell_acid_drip: 'acid.loop',
};

/**
 * @param has  (key) => bool, the bank's membership test
 * @returns    { resolve(key, opts) -> string|null, missing: Set, matKey(mat, ev) }
 */
export function createResolver(has) {
  const cache = new Map();
  const missing = new Set();

  function matKey(mat, ev = 'break') {
    const m = typeof mat === 'number' ? MAT_SFX[mat] : MAT_SFX[MAT_ALIAS[String(mat).toLowerCase()] ?? 1];
    if (!m) return null;
    return m[ev] || m.break;
  }

  function tryKeys(...list) {
    for (const k of list) if (k && has(k)) return k;
    return null;
  }

  function derive(raw) {
    const key = String(raw).trim().toLowerCase().replace(/[:\/\\]+/g, '.').replace(/\s+/g, '');
    if (has(key)) return key;
    if (ALIAS[key] && has(ALIAS[key])) return ALIAS[key];

    // --- the underscore dialect: spell_emberbolt_fork, warden_slam, hound_charge --
    const u = key.split('_');
    if (u.length >= 3 && (u[0] === 'spell' || u[0] === 'magic')) {
      const id = u[1];
      const ev = SPELL_EVENT[u.slice(2).join('_')] || SPELL_EVENT[u[2]] || 'impact';
      const direct = tryKeys(`spell.${id}.${ev}`, `spell.${id}.impact`, `spell.${id}.cast`);
      if (direct) return direct;
      const s = guessSchool(id) || 'arcane';
      return tryKeys(`spell.@${s}.${ev}`, `spell.@${s}.impact`, 'spell.@arcane.impact');
    }
    if (u.length >= 2 && FLAT_CREATURE[u[0]]) {
      const id = FLAT_CREATURE[u[0]];
      const ev = ENEMY_EVENT[u[1]] || 'attack';
      const k = tryKeys(`enemy.${id}.${ev}`, `enemy.${id}.attack`);
      if (k) return k;
    }

    const p = key.split('.');

    // --- spells -----------------------------------------------------------
    if (p[0] === 'spell' || p[0] === 'spells' || p[0] === 'magic') {
      const id = p[1] || '';
      const ev = SPELL_EVENT[p[2]] || (p[2] ? 'impact' : 'cast');
      const direct = tryKeys(`spell.${id}.${ev}`, `spell.${id}.impact`, `spell.${id}.cast`);
      if (direct) return direct;
      const school = guessSchool(id) || guessSchool(key);
      const s = school || 'arcane';
      return tryKeys(`spell.@${s}.${ev}`, `spell.@${s}.impact`, 'spell.@arcane.impact');
    }

    // --- enemies ----------------------------------------------------------
    if (p[0] === 'enemy' || p[0] === 'mob' || p[0] === 'npc' || p[0] === 'boss') {
      const id = p[0] === 'boss' ? 'theseam' : (p[1] || '');
      const evRaw = p[0] === 'boss' ? (p[1] || 'attack') : (p[2] || 'hit');
      const ev = ENEMY_EVENT[evRaw] || 'hit';
      const direct = tryKeys(`enemy.${id}.${ev}`);
      if (direct) return direct;
      // partial id match — 'enemy.husk_elite.death' should still sound like a husk
      for (const e of ENEMY_IDS) if (id.includes(e) || e.includes(id)) {
        const k = tryKeys(`enemy.${e}.${ev}`);
        if (k) return k;
      }
      return tryKeys(`enemy.husk.${ev}`, 'enemy.husk.hit');
    }

    // --- player -----------------------------------------------------------
    if (p[0] === 'player' || p[0] === 'rook') {
      if (p[1] === 'step' || p[1] === 'footstep') {
        return tryKeys(`player.step.${p[2]}`, 'player.step');
      }
      return tryKeys(`player.${p.slice(1).join('.')}`, `player.${p[1]}`, 'player.hurt');
    }

    // --- explicit material namespace: mat.timber.break --------------------
    if (p[0] === 'mat' || p[0] === 'material') {
      const mi = MAT_ALIAS[p[1]];
      if (mi !== undefined) {
        const ev = ['crack', 'break', 'debris', 'burn'].includes(p[2]) ? p[2] : 'break';
        return tryKeys(matKey(mi, ev), matKey(mi, 'break'));
      }
    }

    // --- flat material form: timber_break, brick_crack --------------------
    const us = key.split('_');
    if (us.length >= 2) {
      const mi = MAT_ALIAS[us[0]];
      if (mi !== undefined) {
        const ev = ['crack', 'break', 'debris', 'burn'].includes(us[1]) ? us[1] : 'break';
        const k = tryKeys(matKey(mi, ev), matKey(mi, 'break'));
        if (k) return k;
      }
    }

    // --- ui ----------------------------------------------------------------
    if (p[0] === 'ui' || p[0] === 'menu' || p[0] === 'hud') {
      return tryKeys(`ui.${p.slice(1).join('.')}`, `ui.${p[1]}`, 'ui.click');
    }

    // --- ambience -----------------------------------------------------------
    if (p[0] === 'amb' || p[0] === 'ambient') {
      return tryKeys(`amb.${p.slice(1).join('.')}`, 'amb.creak');
    }

    // --- loose word matching before we give up -----------------------------
    if (/explo|blast|detonat/.test(key)) return 'explosion.small';
    if (/collaps|topple|fall/.test(key)) return 'collapse.land';
    if (/whoosh|swing|swish|dash/.test(key)) return 'whoosh.small';
    if (/heavy|slam|crush/.test(key)) return 'impact.heavy';
    if (/hit|impact|thud|bump|knock/.test(key)) return 'impact.hard';
    if (/break|shatter|smash/.test(key)) return 'stone_break';
    if (/crack|chip/.test(key)) return 'stone_crack';
    if (/debris|rubble|chunk/.test(key)) return 'stone_debris';
    if (/burn|flame|sizzle/.test(key)) return 'fire.loop';
    if (/click|tap|button|select/.test(key)) return 'ui.click';
    const school = guessSchool(key);
    if (school) return `spell.@${school}.impact`;
    return 'impact.soft';
  }

  return {
    missing,
    matKey,
    /** Cached; the fallback walk happens once per distinct unknown key. */
    resolve(raw) {
      if (raw == null) return null;
      let r = cache.get(raw);
      if (r !== undefined) return r;
      const exact = typeof raw === 'string' && has(raw);
      r = exact ? raw : derive(raw);
      if (!exact) {
        missing.add(String(raw));
        if (missing.size <= 40) console.info('[audio] unmapped key "%s" -> "%s"', raw, r);
      }
      cache.set(raw, r);
      return r;
    },
    clear() { cache.clear(); },
  };
}

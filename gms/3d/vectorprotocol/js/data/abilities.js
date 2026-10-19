// Ability defs (js/sim/SCHEMA.md AbilityDef). Human text + VFX briefs: docs/ROSTER.md.
const SELF = { side: 'self', pick: 'self' };
const ALLIES = { side: 'ally', pick: 'all' };
const LOWEST_ALLY = { side: 'ally', pick: 'lowest_hp_ally' };
const LANE = { side: 'enemy', pick: 'lane' };

const dmg = (mult, o = {}) => ({ type: 'damage', mult, ...o });
const st = (status, duration, o = {}) => ({ type: 'status', status, duration, ...o });
const shield = (pctMax, duration = 8, o = {}) => ({ type: 'shield', pctMax, duration, ...o });

const atk = (id, name, icon, delivery, effects, target = LANE, perLevel = { mult: 0.08 }) =>
  ({ id, name, icon, kind: 'attack', target, delivery, effects, perLevel });
const pas = (id, name, icon, trigger, effects, o = {}) =>
  ({ id, name, icon, kind: 'passive', trigger, effects, perLevel: { amount: 0.02, chance: 0.02, duration: 0.2 }, ...o });
const aura = (id, name, icon, mods, to = ALLIES) =>
  ({ id, name, icon, kind: 'passive', trigger: 'aura', aura: { mods, to }, perLevel: { amount: 0.01 } });
const od = (id, name, icon, target, delivery, effects, perLevel = { mult: 0.1 }) =>
  ({ id, name, icon, kind: 'overdrive', target, delivery, effects, perLevel });

const MELEE = { type: 'melee' };
const BEAM = { type: 'beam' };
const AREA = { type: 'area', windup: 0.4 };
const proj = (speed = 10) => ({ type: 'projectile', speed });

const list = [
  // ───────── CORPORATE ─────────
  // warden
  atk('baton_strike', 'Baton Strike', 'baton', MELEE, [dmg(1.0), st('shock', 0.8, { chance: 0.15 })]),
  pas('riot_protocol', 'Riot Protocol', 'shield', 'wave_start', [shield(0.10, 10, { target: SELF })]),
  od('lockdown', 'Lockdown', 'lock', LANE, MELEE, [dmg(1.8), st('stun', 2), st('taunt', 3, { target: SELF })]),
  // bulwark
  atk('shield_bash', 'Shield Bash', 'bash', MELEE, [dmg(1.0)]),
  pas('bulwark_protocol', 'Bulwark Protocol', 'shield', 'wave_start', [shield(0.15, 10, { target: SELF })]),
  od('aegis_wall', 'Aegis Wall', 'wall', ALLIES, AREA, [shield(0.18, 8), st('taunt', 4, { target: SELF }), st('fortify', 4, { target: SELF })], { amount: 0.02 }),
  // citadel
  atk('flak_cannon', 'Flak Cannon', 'cannon', MELEE, [dmg(0.9)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  aura('hardpoint', 'Hardpoint', 'fortify', { dr: 0.04 }),
  od('fortress_mode', 'Fortress Mode', 'dome', ALLIES, AREA, [shield(0.10, 8), st('fortify', 4), st('taunt', 4, { target: SELF })], { amount: 0.02 }),
  // paladin (L)
  atk('arc_blade', 'Arc Blade', 'blade', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('oath_of_steel', 'Oath of Steel', 'oath', 'low_hp', [shield(0.20, 10, { target: SELF }), st('overclock', 6, { target: SELF })], { threshold: 0.4, once: true }),
  od('judgement_arc', 'Judgement Arc', 'arc', { side: 'enemy', pick: 'lane_all' }, MELEE, [dmg(2.1), st('expose', 4), shield(0.15, 8, { target: SELF })], { mult: 0.12 }),

  // gunner
  atk('rotary_burst', 'Rotary Burst', 'gatling', proj(16), [dmg(0.8)]),
  pas('suppressive_fire', 'Suppressive Fire', 'slow', 'every_n', [st('slow', 2, { target: LANE })], { n: 5 }),
  od('suppression', 'Suppression', 'hail', { side: 'enemy', pick: 'frontline' }, proj(18), [dmg(1.4), st('slow', 3)]),
  // lancer
  atk('rail_shot', 'Rail Shot', 'rail', proj(14), [dmg(1.0)]),
  pas('steady_aim', 'Steady Aim', 'aim', 'every_n', [{ type: 'mods', mods: { crit: 1 }, duration: 0.5, target: SELF }], { n: 4 }),
  od('piercing_lance', 'Piercing Lance', 'lance', { side: 'enemy', pick: 'lane_all' }, BEAM, [dmg(2.6, { pierce: true })], { mult: 0.15 }),
  // meridian
  atk('long_shot', 'Long Shot', 'scope', proj(20), [dmg(1.25)]),
  pas('designator', 'Designator', 'marked', 'on_attack', [st('marked', 4, { target: LANE })], { chance: 0.25 }),
  od('orbital_designator', 'Orbital Designator', 'orbital', { side: 'enemy', pick: 'highest_atk' }, BEAM, [dmg(3.4), st('marked', 5)], { mult: 0.2 }),
  // executor (L)
  atk('railcannon', 'Railcannon', 'rail', proj(16), [dmg(1.1)]),
  pas('hostile_takeover', 'Hostile Takeover', 'charge', 'on_kill', [{ type: 'charge', amount: 25, target: SELF }]),
  od('termination_order', 'Termination Order', 'target', { side: 'enemy', pick: 'lowest_hp', count: 3 }, BEAM, [dmg(2.2)], { mult: 0.15 }),

  // patch
  atk('mend_beam', 'Mend Beam', 'heal', BEAM, [{ type: 'heal', mult: 0.9 }], LOWEST_ALLY),
  pas('nanite_field', 'Nanite Field', 'regen', 'interval', [st('regen', 3, { mult: 0.15, target: ALLIES })], { every: 6 }),
  od('triage_field', 'Triage Field', 'cross', ALLIES, AREA, [{ type: 'heal', mult: 1.4 }, { type: 'cleanse', count: 2 }], { mult: 0.12 }),
  // aegis
  atk('hardlight_bolt', 'Hardlight Bolt', 'bolt', proj(11), [dmg(0.9)]),
  pas('projector', 'Projector', 'hex', 'wave_start', [shield(0.08, 12, { target: ALLIES })]),
  od('barrier_matrix', 'Barrier Matrix', 'matrix', ALLIES, AREA, [shield(0.24, 8), st('fortify', 3)], { amount: 0.02 }),
  // arbiter
  atk('directive_pulse', 'Directive Pulse', 'pulse', proj(10), [dmg(1.0), st('weaken', 3, { chance: 0.2 })]),
  aura('chain_of_command', 'Chain of Command', 'command', { atk: 0.09 }),
  od('executive_override', 'Executive Override', 'override', ALLIES, AREA, [st('haste', 5), st('overclock', 5)], { duration: 0.5 }),
  // paragon (L)
  atk('satellite_ping', 'Satellite Ping', 'satellite', BEAM, [dmg(1.0)]),
  pas('orbital_uplink', 'Orbital Uplink', 'charge', 'battle_start', [{ type: 'charge', amount: 30, target: SELF }]),
  od('satellite_lance', 'Satellite Lance', 'orbital', { side: 'enemy', pick: 'column' }, AREA, [dmg(2.2), st('emp', 3), { type: 'charge', amount: -20 }], { mult: 0.15 }),

  // ───────── ROGUE ─────────
  // scrapper
  atk('piston_punch', 'Piston Punch', 'fist', MELEE, [dmg(1.0)]),
  pas('adrenal_burn', 'Adrenal Burn', 'rage', 'low_hp', [st('overclock', 8, { target: SELF }), st('fortify', 6, { target: SELF })], { threshold: 0.6, once: true }),
  od('haymaker', 'Haymaker', 'fist', LANE, MELEE, [dmg(2.4), st('stun', 1.5)], { mult: 0.15 }),
  // riot
  atk('slug_shot', 'Slug Shot', 'shotgun', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.25 }),
  pas('riot_line', 'Riot Line', 'taunt', 'wave_start', [st('taunt', 3, { target: SELF }), st('fortify', 3, { target: SELF })]),
  od('breach_and_hold', 'Breach & Hold', 'breach', { side: 'enemy', pick: 'frontline' }, MELEE, [dmg(1.2), st('weaken', 4), st('taunt', 4, { target: SELF }), st('fortify', 4, { target: SELF })]),
  // juggernaut
  atk('saw_ram', 'Saw Ram', 'saw', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('momentum', 'Momentum', 'shock', 'every_n', [st('shock', 0.8, { target: LANE })], { n: 4 }),
  od('ram_rush', 'Ram Rush', 'ram', { side: 'enemy', pick: 'column' }, MELEE, [dmg(1.8), st('stun', 1.2)], { mult: 0.12 }),
  // warlord (L)
  atk('chainblade', 'Chainblade', 'saw', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('blood_money', 'Blood Money', 'skull', 'on_kill', [{ type: 'heal', pctMax: 0.15, target: SELF }, { type: 'charge', amount: 20, target: SELF }]),
  od('frenzy', 'Frenzy', 'vortex', { side: 'enemy', pick: 'adjacent' }, MELEE, [dmg(1.1), dmg(1.1), { type: 'heal', pctMax: 0.15, target: SELF }], { mult: 0.1 }),

  // rattler
  atk('smg_burst', 'SMG Burst', 'smg', proj(16), [dmg(0.8)]),
  pas('cheap_shots', 'Cheap Shots', 'charge', 'on_crit', [{ type: 'charge', amount: 5, target: SELF }]),
  od('spray_and_pray', 'Spray & Pray', 'spray', { side: 'enemy', pick: 'random', count: 8 }, proj(18), [dmg(0.65)], { mult: 0.06 }),
  // barb
  atk('needle_burst', 'Needle Burst', 'needle', proj(12), [dmg(0.9)]),
  pas('venom_rounds', 'Venom Rounds', 'venom', 'on_crit', [st('burn', 3, { mult: 0.3, target: LANE })]),
  od('thornstorm', 'Thornstorm', 'thorns', { side: 'enemy', pick: 'lane_all' }, proj(14), [dmg(1.4), st('burn', 4, { mult: 0.3, stacks: 2 })], { mult: 0.12 }),
  // tarantula
  atk('twin_cannon', 'Twin Cannon', 'cannon', proj(10), [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.25 }),
  pas('dug_in', 'Dug In', 'fortify', 'wave_start', [st('fortify', 6, { target: SELF })]),
  od('bombard', 'Bombard', 'mortar', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.0), st('expose', 4)], { mult: 0.08 }),
  // widowmaker (L)
  atk('long_rifle', 'Long Rifle', 'scope', proj(20), [dmg(1.15)]),
  pas('ghost_net', 'Ghost Net', 'stealth', 'wave_start', [st('stealth', 4, { target: SELF })]),
  od('last_light', 'Last Light', 'snipe', { side: 'enemy', pick: 'lowest_hp' }, BEAM, [dmg(4.0, { pierce: true })], { mult: 0.25 }),

  // sparkplug
  atk('arc_zap', 'Arc Zap', 'zap', BEAM, [dmg(0.9)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('live_wire', 'Live Wire', 'shock', 'on_attack', [st('shock', 0.8, { target: LANE })], { chance: 0.15 }),
  od('arc_surge', 'Arc Surge', 'chain', { side: 'enemy', pick: 'random', count: 5 }, BEAM, [dmg(1.15), st('shock', 1, { chance: 0.5 })], { mult: 0.08, chance: 0.04 }),
  // jammer
  atk('static_burst', 'Static Burst', 'static', proj(10), [dmg(0.8), { type: 'charge', amount: -6 }]),
  pas('signal_jam', 'Signal Jam', 'emp', 'interval', [st('emp', 2, { target: { side: 'enemy', pick: 'random' } })], { every: 8 }),
  od('blackout', 'Blackout', 'emp', { side: 'enemy', pick: 'all' }, AREA, [dmg(0.6), st('emp', 3), { type: 'charge', amount: -25 }], { mult: 0.06, duration: 0.3 }),
  // pyre
  atk('pyre_orb', 'Pyre Orb', 'fire', proj(7), [dmg(0.7), st('burn', 3, { mult: 0.25 })]),
  aura('kindling', 'Kindling', 'fire', { dmg: 0.06 }),
  od('inferno', 'Inferno', 'fire', { side: 'enemy', pick: 'all' }, AREA, [dmg(0.55), st('burn', 4, { mult: 0.25, stacks: 2 })], { mult: 0.06 }),
  // kingpin (L)
  atk('drone_sting', 'Drone Sting', 'drone', proj(12), [dmg(1.1)], { side: 'enemy', pick: 'random' }),
  aura('protection_racket', 'Protection Racket', 'crit', { crit: 0.08, atk: 0.04 }),
  od('swarm_contract', 'Swarm Contract', 'swarm', { side: 'enemy', pick: 'random', count: 10 }, proj(12), [dmg(0.7), st('overclock', 4, { target: ALLIES })], { mult: 0.05 }),

  // ───────── EXPERIMENTAL ─────────
  // husk
  atk('grav_slam', 'Grav Slam', 'slam', MELEE, [dmg(0.9)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('reconstitute', 'Reconstitute', 'regen', 'interval', [{ type: 'heal', pctMax: 0.07, target: SELF }], { every: 6 }),
  od('fold_in', 'Fold In', 'fold', SELF, AREA, [{ type: 'heal', pctMax: 0.3 }, st('taunt', 4), st('fortify', 3)], { amount: 0.03 }),
  // phase
  atk('phase_strike', 'Phase Strike', 'phase', MELEE, [dmg(1.0)]),
  pas('phase_skin', 'Phase Skin', 'fortify', 'on_damaged', [st('fortify', 1.5, { target: SELF })], { chance: 0.15 }),
  od('phase_shift', 'Phase Shift', 'blink', { side: 'enemy', pick: 'frontline' }, MELEE, [dmg(1.4), st('slow', 3), st('taunt', 4, { target: SELF }), st('fortify', 4, { target: SELF })]),
  // monolith
  atk('gravity_maul', 'Gravity Maul', 'slam', MELEE, [dmg(0.9)], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('mass_anchor', 'Mass Anchor', 'anchor', 'low_hp', [st('fortify', 6, { target: SELF })], { threshold: 0.4, once: true }),
  od('event_horizon', 'Event Horizon', 'void', { side: 'enemy', pick: 'all' }, AREA, [dmg(0.8), st('slow', 4), st('taunt', 4, { target: SELF })], { mult: 0.08 }),
  // leviathan (L)
  atk('cable_lash', 'Cable Lash', 'cable', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.4 }),
  pas('abyssal_hull', 'Abyssal Hull', 'shield', 'wave_start', [shield(0.20, 12, { target: SELF })]),
  od('abyssal_grip', 'Abyssal Grip', 'grip', { side: 'enemy', pick: 'frontline' }, MELEE, [dmg(1.6), st('stun', 2)], { mult: 0.12 }),

  // needle
  atk('prism_dart', 'Prism Dart', 'dart', BEAM, [dmg(0.85)]),
  pas('overcharge', 'Overcharge', 'charge', 'battle_start', [{ type: 'charge', amount: 20, target: SELF }]),
  od('prism_volley', 'Prism Volley', 'volley', { side: 'enemy', pick: 'random', count: 4 }, proj(16), [dmg(1.0)], { mult: 0.08 }),
  // prism
  atk('prism_bolt', 'Prism Bolt', 'bolt', BEAM, [dmg(1.0)]),
  aura('refraction', 'Refraction', 'prism', { crit: 0.08 }),
  od('refraction_beam', 'Refraction Beam', 'prism', { side: 'enemy', pick: 'random', count: 4 }, BEAM, [dmg(1.6)], { mult: 0.1 }),
  // specter
  atk('ghost_round', 'Ghost Round', 'ghost', proj(18), [dmg(1.15)]),
  pas('null_shell', 'Null Shell', 'stealth', 'wave_start', [st('stealth', 3, { target: SELF })]),
  od('spectrum_snipe', 'Spectrum Snipe', 'snipe', { side: 'enemy', pick: 'backline' }, BEAM, [dmg(3.2), st('expose', 4)], { mult: 0.2 }),
  // seraph (L)
  atk('light_lance', 'Light Lance', 'lance', proj(18), [dmg(1.0)]),
  pas('halo_choir', 'Halo Choir', 'wings', 'on_kill', [st('haste', 4, { target: SELF }), { type: 'charge', amount: 15, target: SELF }]),
  od('choir_of_lances', 'Choir of Lances', 'lances', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.15), st('marked', 4)], { mult: 0.1 }),

  // wisp
  atk('wisp_spark', 'Wisp Spark', 'spark', proj(11), [dmg(0.9)]),
  pas('tether', 'Tether', 'heal', 'interval', [{ type: 'heal', mult: 1.0, target: LOWEST_ALLY }], { every: 7 }),
  od('flicker', 'Flicker', 'motes', ALLIES, AREA, [{ type: 'charge', amount: 35 }, st('haste', 5)], { amount: 0.03 }),
  // oracle
  atk('null_orb', 'Null Orb', 'orb', proj(8), [dmg(0.9), st('slow', 2, { chance: 0.25 })]),
  aura('foresight', 'Foresight', 'eye', { charge: 0.08 }),
  od('orb_cascade', 'Orb Cascade', 'orbs', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.15), st('slow', 3), { type: 'charge', amount: -15 }], { mult: 0.08 }),
  // halo
  atk('null_pulse', 'Null Pulse', 'pulse', proj(9), [dmg(0.85)]),
  pas('bubble_ward', 'Bubble Ward', 'bubble', 'interval', [shield(0.18, 8, { target: LOWEST_ALLY })], { every: 7 }),
  od('stasis_bubble', 'Stasis Bubble', 'bubble', ALLIES, AREA, [shield(0.24, 8), { type: 'cleanse', count: 2 }, st('regen', 6, { mult: 0.3 })], { amount: 0.02 }),
  // singularity (L)
  atk('void_bolt', 'Void Bolt', 'void', proj(9), [dmg(1.0)]),
  pas('event_well', 'Event Well', 'weaken', 'every_n', [st('weaken', 3, { target: LANE })], { n: 3 }),
  od('collapse', 'Collapse', 'singularity', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.6), st('slow', 4), { type: 'charge', amount: -30 }], { mult: 0.12 }),

  // ───────── ENEMY-ONLY ─────────
  atk('drone_zap', 'Zap', 'zap', proj(10), [dmg(1.0)]),
  pas('none', '—', 'none', 'battle_start', []),
  od('self_destruct', 'Overload', 'boom', { side: 'enemy', pick: 'lane', splash: 0.5 }, MELEE, [dmg(2.0)]),
  pas('boss_enrage', 'Enrage Protocol', 'rage', 'low_hp', [st('overclock', 30, { target: SELF }), shield(0.15, 10, { target: SELF })], { threshold: 0.5, once: true }),
  pas('boss_reinforce', 'Call Reinforcements', 'shield', 'low_hp', [shield(0.12, 10, { target: ALLIES }), st('haste', 8, { target: ALLIES })], { threshold: 0.5, once: true }),
  od('boss_cataclysm', 'Cataclysm', 'boom', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.5), st('stun', 1)], { mult: 0.1 }),
  // ───────── FANTASY REALM (D21, enemy-only) ─────────
  atk('longsword_cut', 'Longsword Cut', 'sword', MELEE, [dmg(1.0)]),
  pas('oathbound', 'Oathbound', 'oath', 'wave_start', [st('fortify', 4, { target: SELF }), st('taunt', 3, { target: SELF })]),
  od('shieldwall_charge', 'Shieldwall Charge', 'charge', { side: 'enemy', pick: 'frontline' }, MELEE, [dmg(1.4), st('stun', 1), st('fortify', 4, { target: SELF })]),
  atk('scythe_sweep', 'Scythe Sweep', 'scythe', MELEE, [dmg(1.0)], { side: 'enemy', pick: 'lane', splash: 0.4 }),
  pas('bloodrage', 'Bloodrage', 'rage', 'low_hp', [st('overclock', 10, { target: SELF })], { threshold: 0.5, once: true }),
  od('gore_charge', 'Gore Charge', 'horns', { side: 'enemy', pick: 'column' }, MELEE, [dmg(1.9), st('stun', 1.5)], { mult: 0.12 }),
  atk('root_slam', 'Root Slam', 'root', MELEE, [dmg(0.9), st('slow', 2, { chance: 0.3 })], { side: 'enemy', pick: 'lane', splash: 0.3 }),
  pas('deep_roots', 'Deep Roots', 'regen', 'interval', [{ type: 'heal', pctMax: 0.04, target: SELF }], { every: 6 }),
  od('grasp_of_ages', 'Grasp of Ages', 'vines', { side: 'enemy', pick: 'frontline' }, AREA, [dmg(1.2), st('stun', 2), { type: 'heal', pctMax: 0.15, target: SELF }], { mult: 0.1 }),
  atk('longbow', 'Longbow', 'bow', proj(16), [dmg(1.05)]),
  pas('keen_eye', 'Keen Eye', 'aim', 'every_n', [{ type: 'mods', mods: { crit: 1 }, duration: 0.5, target: SELF }], { n: 3 }),
  od('arrow_rain', 'Arrow Rain', 'arrows', { side: 'enemy', pick: 'all' }, AREA, [dmg(1.1)], { mult: 0.08 }),
  atk('pounce', 'Pounce', 'claw', MELEE, [dmg(0.75)], { side: 'enemy', pick: 'backline' }),
  aura('pack_hunter', 'Pack Hunter', 'pack', { crit: 0.05 }),
  od('ember_howl', 'Ember Howl', 'howl', { side: 'enemy', pick: 'adjacent' }, AREA, [dmg(1.6), st('burn', 4, { mult: 0.3, stacks: 2 })], { mult: 0.1 }),
  od('frost_lunge', 'Frost Lunge', 'frost', { side: 'enemy', pick: 'backline' }, MELEE, [dmg(2.2), st('slow', 4)], { mult: 0.15 }),
  atk('lumen_bolt', 'Lumen Bolt', 'staff', proj(11), [dmg(0.85)]),
  pas('verdant_bloom', 'Verdant Bloom', 'regen', 'interval', [st('regen', 3, { mult: 0.15, target: ALLIES })], { every: 7 }),
  od('sanctuary_grove', 'Sanctuary Grove', 'grove', ALLIES, AREA, [{ type: 'heal', mult: 1.2 }, st('regen', 6, { mult: 0.2 }), { type: 'cleanse', count: 2 }], { mult: 0.1 }),
  atk('hex_bolt', 'Hex Bolt', 'hex', proj(9), [dmg(0.9), st('weaken', 3, { chance: 0.25 })]),
  aura('war_drums', 'War Drums', 'drum', { atk: 0.06 }),
  od('blood_totem', 'Blood Totem', 'totem', ALLIES, AREA, [st('overclock', 5), st('haste', 3)], { duration: 0.5 }),
];

export const ABILITIES = Object.fromEntries(list.map((a) => [a.id, a]));
export default ABILITIES;

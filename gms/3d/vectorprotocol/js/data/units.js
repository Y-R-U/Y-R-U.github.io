// Player-recruitable units (js/sim/SCHEMA.md UnitDef). docs/ROSTER.md mirrors this file
// (fantasy / visual / od_vfx are design-only fields; the sim ignores them).
// realm: 'scifi' | 'fantasy' (D21). Fantasy units live in enemies.js until made recruitable.
// Base stats: role template × small per-unit tweaks. Rarity mostly = start rank + max rank (economy).

const T = {
  tank: { hp: 1250, atk: 58, def: 55, spd: 1.6, crit: 0.05, critDmg: 0.5 },
  archer: { hp: 900, atk: 104, def: 30, spd: 1.2, crit: 0.1, critDmg: 0.5 },
  mage: { hp: 880, atk: 84, def: 30, spd: 1.5, crit: 0.05, critDmg: 0.5 },
};
// Global damage tempo knob: raises ATK (and so heals) vs HP. Tuned with the balance probe so an even
// 3v3 lasts ~25–40 s and tanky heal squads don't time out (75 s wave limit).
export const ATK_SCALE = 1.55;
const RB = { common: 1.0, rare: 1.08, epic: 1.16, legendary: 1.25 };

function U(id, name, title, role, faction, rarity, tweak, [attack, passive, overdrive], meta) {
  const t = T[role], k = RB[rarity];
  const base = {
    hp: Math.round(t.hp * k * (tweak.hp || 1)),
    atk: Math.round(t.atk * k * (tweak.atk || 1) * ATK_SCALE),
    def: Math.round(t.def * k * (tweak.def || 1)),
    spd: tweak.spd || t.spd,
    crit: tweak.crit ?? t.crit,
    critDmg: tweak.critDmg ?? t.critDmg,
  };
  return {
    id, name, title, role, faction, rarity, realm: 'scifi', model: id, base,
    growth: { hp: 0.09, atk: 0.08, def: 0.06 },
    attack, passive, overdrive,
    chargeRate: tweak.chargeRate || (role === 'tank' ? 1.25 : 1.0),
    ...meta,
  };
}

const list = [
  // ════════ CORPORATE (cyan) — clean white/navy plate, panel lines, hex hardlight, logos ════════
  U('warden', 'WARDEN-3', 'Security Patrol Frame', 'tank', 'corporate', 'common', { def: 1.05 },
    ['baton_strike', 'riot_protocol', 'lockdown'], {
      fantasy: 'Mall-cop chassis bought at surplus auction. Still says PROPERTY OF HALVORSEN on the back.',
      visual: { size: 'M', loco: 'biped', silhouette: 'squat, wide-stanced, boxy torso, small domed head with a single visor slit', weapon: 'stun baton (right) + round riot buckler (left forearm)', signature: 'roof-mounted amber/cyan light bar on the shoulders', colors: 'off-white panels, navy joints, cyan visor', tiers: 'R0–1 scuffed paint, dented buckler · R2 full panels + chest number decal · R3 hardlight edge on the buckler' },
      od_vfx: 'Baton crackles, slams the floor: a cyan shock ring races down the lane; the target is boxed in a glowing hex cage for the stun.',
    }),
  U('bulwark', 'BULWARK', 'Siege Guard', 'tank', 'corporate', 'rare', { hp: 0.98, def: 1.03, spd: 1.7, chargeRate: 1.3 },
    ['shield_bash', 'bulwark_protocol', 'aegis_wall'], {
      launch: true, ref: 'player front-near: blue shield heavy',
      fantasy: 'Corporate siege guard. Built to stand in a doorway and make it someone else\'s problem.',
      visual: { size: 'L', loco: 'biped', silhouette: 'hunched gorilla-heavy, huge shoulders, short thick legs, head sunk between pauldrons', weapon: 'tower shield taller than its torso (left), short piston arm (right)', signature: 'shield face with yellow-orange chevron stripes and a glowing cyan core slit', colors: 'deep blue + gunmetal, yellow chevrons, cyan eye + chest core', tiers: 'R1 base · R2 extra shoulder plating + vents · R3 shield edge emissive · R4 hex hardlight projector on the shield, cyan rim lights' },
      od_vfx: 'Plants the shield; a wall of translucent cyan hex cells unfolds sideways across the whole front line, cells lighting in a ripple; shields snap onto every ally.',
    }),
  U('citadel', 'CITADEL', 'Mobile Fortress', 'tank', 'corporate', 'epic', { hp: 0.98, def: 1.04, atk: 0.9, spd: 1.9, chargeRate: 1.35 },
    ['flak_cannon', 'hardpoint', 'fortress_mode'], {
      fantasy: 'A tracked bunker with opinions. Deploys a dome and dares you.',
      visual: { size: 'XL', loco: 'tracked', silhouette: 'low wide tank hull, raised turret-torso with a short twin flak cannon, two folded stabiliser legs at the back', weapon: 'twin short flak barrels', signature: 'dome-shaped hex emitter on the roof', colors: 'white + navy, cyan track glow, hazard stripes on the plough', tiers: 'R2 base · R3 side skirts + antenna · R4 emitter halo · R5 animated cyan track lights + hardlight skirt' },
      od_vfx: 'Stabiliser legs slam down, dust; a hex dome rises over the squad, panels locking in with flashes; dome pulses then fades to a faint shimmer.',
    }),
  U('paladin', 'SOVEREIGN PALADIN', 'Board-Level Asset', 'tank', 'corporate', 'legendary', { atk: 0.94, def: 0.98, hp: 0.9, spd: 1.4, crit: 0.1, chargeRate: 1.2 },
    ['arc_blade', 'oath_of_steel', 'judgement_arc'], {
      launch: true, ref: 'player front-mid: gold legendary blade unit',
      fantasy: 'A gold-plated knight built for a CEO\'s honour guard. Nobody remembers which CEO.',
      visual: { size: 'L', loco: 'biped', silhouette: 'heroic knight proportions, broad chest, tapered waist, swept crest helmet', weapon: 'energy longsword (right), small kite shield (left)', signature: 'gold fin-cape of layered plates down the back; triangle emblem on chest', colors: 'polished gold + black under-suit, white-gold emissive blade', tiers: 'R3 base · R4 crest + cape gets more plates · R5 blade trails light, floating gold sigil behind the head' },
      od_vfx: 'Blade extends into a 6 m gold greatsword; overhead slash; a gold crescent wave rolls down the whole lane, floor cracks light up gold behind it.',
    }),

  U('gunner', 'GUNNER', 'Suppression Unit', 'archer', 'corporate', 'common', { hp: 1.05, atk: 0.9, def: 1.15, spd: 1.0, crit: 0.08 },
    ['rotary_burst', 'suppressive_fire', 'suppression'], {
      launch: true, starter: true, ref: 'player back-near: dark heavy gunner',
      fantasy: 'Decommissioned riot-control gunner. Its rotary barrel has never once been cleaned.',
      visual: { size: 'M', loco: 'biped', silhouette: 'bulky upper body, forward-leaning, backpack ammo drum, low helmet with twin sensor eyes', weapon: 'big rotary cannon held at the hip, ammo belt to the backpack', signature: 'ammo belt arc + drum', colors: 'matte black/gunmetal, cyan eye lights, cyan barrel tips', tiers: 'R0–1 base · R2 armoured belt cover + shoulder lamp · R3 glowing cyan heat rings on the barrels' },
      od_vfx: 'Barrels spin white-hot; a two-second hose of cyan tracers sweeps the enemy front line left→right, brass casings spray, sparks on every hit.',
    }),
  U('lancer', 'LANCER', 'Precision Rail', 'archer', 'corporate', 'rare', { atk: 1.06, spd: 1.3, crit: 0.12, critDmg: 0.6 },
    ['rail_shot', 'steady_aim', 'piercing_lance'], {
      launch: true, ref: 'player back-far: white sleek rifle archer',
      fantasy: 'Kestrel Dynamics\' marksman frame. Hits what it looks at. Looks at everything.',
      visual: { size: 'M', loco: 'biped', silhouette: 'slim, long-legged, digitigrade, swept-back blade fins on the shoulders/head', weapon: 'long rail rifle longer than its body', signature: 'swept back fins + long barrel = a clear arrow shape', colors: 'gloss white + light grey, cyan accents on fins and barrel coils', tiers: 'R1 base · R2 fins lengthen, scope added · R3 barrel coils glow · R4 hardlight fins, cyan trail on idle' },
      od_vfx: 'Kneels; rifle unfolds side fins; cyan charge builds at the muzzle for 0.4 s; a thick rail beam punches through the whole lane with a shock ring at the muzzle and a lingering ion trail.',
    }),
  U('meridian', 'MERIDIAN', 'Orbital Spotter', 'archer', 'corporate', 'epic', { atk: 1.12, hp: 0.95, def: 0.9, spd: 1.8, crit: 0.15, critDmg: 0.8 },
    ['long_shot', 'designator', 'orbital_designator'], {
      fantasy: 'A hovering sniper platform that also has the satellite on speed-dial.',
      visual: { size: 'M', loco: 'hover', silhouette: 'no legs: a floating chassis with an extremely long barrel, two vertical stabiliser rings around the body', weapon: 'ultra-long sniper barrel', signature: 'twin spinning rings + red-cyan laser dot', colors: 'white + silver, cyan rings', tiers: 'R2 base · R3 rings gain light segments · R4 holo scope readouts · R5 third ring + hover particle trail' },
      od_vfx: 'Rises 1 m, rings spin up; a laser dot paints the strongest enemy; its shot and a thin orbital beam from the sky hit at the same instant — white flash, scorched hex.',
    }),
  U('executor', 'EXECUTOR', 'Hostile Takeover Unit', 'archer', 'corporate', 'legendary', { atk: 1.12, def: 1.0, spd: 1.4, crit: 0.15, critDmg: 0.7 },
    ['railcannon', 'hostile_takeover', 'termination_order'], {
      fantasy: 'Restructuring, delivered at 9 km/s.',
      visual: { size: 'L', loco: 'biped', silhouette: 'tall, elegant, long coat-tail plates, shoulder-mounted railcannon on a boom', weapon: 'shoulder railcannon + wrist pistol', signature: 'coat-tail plates and a gold monocle sensor', colors: 'gold + white + black, cyan muzzle', tiers: 'R3 base · R4 coat plates gain emissive edges · R5 floating holo-contract panels orbit it' },
      od_vfx: 'Railcannon unfolds; three gold beams in quick succession at the three weakest enemies; each hit stamps a gold holographic "TERMINATED" glyph.',
    }),

  U('patch', 'PATCH', 'Field Medic Drone', 'mage', 'corporate', 'common', { hp: 0.9, atk: 0.95, spd: 1.5 },
    ['mend_beam', 'nanite_field', 'triage_field'], {
      launch: true, fantasy: 'A clinic drone that got lost on the way to the hospital and found a job.',
      visual: { size: 'S', loco: 'hover', silhouette: 'round body the size of a beach ball, four thin articulated repair arms underneath, one big lens', weapon: 'repair beam emitter', signature: 'glowing cross/plus hologram above it', colors: 'white + mint/cyan, green-cyan beam', tiers: 'R0–1 base · R2 extra arm pair + side lamps · R3 rotating holo-cross ring' },
      od_vfx: 'Arms spread; the holo-cross expands into a dome over the squad; green-cyan nanite sparkles rain down; debuff icons pop off as sparks.',
    }),
  U('aegis', 'AEGIS', 'Hardlight Projector', 'mage', 'corporate', 'rare', { def: 1.2, hp: 1.15, atk: 1.2, spd: 1.5 },
    ['hardlight_bolt', 'projector', 'barrier_matrix'], {
      fantasy: 'Halvorsen\'s bodyguard interface. It protects the asset. You are, temporarily, the asset.',
      visual: { size: 'M', loco: 'biped', silhouette: 'slender upright biped with a large disc mounted on its back like a halo', weapon: 'palm emitters', signature: 'back disc that detaches and spins', colors: 'white + pale blue, cyan disc rim', tiers: 'R1 base · R2 disc gains hex segments · R3 disc floats free behind it · R4 twin discs' },
      od_vfx: 'The disc lifts and spins overhead; beams lance from it to every ally; hex bubbles snap on around each one.',
    }),
  U('arbiter', 'ARBITER', 'Command Node', 'mage', 'corporate', 'epic', { hp: 1.1, atk: 1.1 },
    ['directive_pulse', 'chain_of_command', 'executive_override'], {
      fantasy: 'Middle management, perfected. Its drones make sure everyone hits quota.',
      visual: { size: 'M', loco: 'biped', silhouette: 'tall thin biped, long arms, tall narrow head; four small drones orbit at shoulder height', weapon: 'staff-like antenna', signature: 'ring of 4 orbiting command drones', colors: 'navy + white, cyan drones', tiers: 'R2 base · R3 drones gain trails · R4 holo-org-chart panels · R5 6 drones' },
      od_vfx: 'Drones form a ring overhead; cyan order glyphs drop onto every ally; ally plates pulse and their attack anims speed up.',
    }),
  U('paragon', 'PARAGON', 'Orbital Oracle', 'mage', 'corporate', 'legendary', { atk: 1.25, hp: 1.1 },
    ['satellite_ping', 'orbital_uplink', 'satellite_lance'], {
      fantasy: 'Its other half is in orbit. Both halves are disappointed in you.',
      visual: { size: 'M', loco: 'hover', silhouette: 'floating robed figure, no legs, six small mirror satellites orbiting in a tilted ring', weapon: 'mirror satellites', signature: 'tilted ring of six mirror plates', colors: 'gold + white + cyan', tiers: 'R3 base · R4 robe plates multiply · R5 satellites leave light trails, ground halo' },
      od_vfx: 'Satellites shoot up out of frame; a gold-white column comes down from the sky and sweeps across the enemy column; scorched glowing line stays for 1 s.',
    }),

  // ════════ ROGUE (orange) — red/black scrap, spikes, exhaust, hazard paint, graffiti ════════
  U('scrapper', 'SCRAPPER', 'Pit Brawler', 'tank', 'rogue', 'common', { atk: 1.15, def: 0.95, hp: 1.0, spd: 1.4, chargeRate: 1.2 },
    ['piston_punch', 'adrenal_burn', 'haymaker'], {
      launch: true, starter: true, ref: 'enemy front-far: red brawler',
      fantasy: 'Pit-fight veteran rebuilt out of three other pit-fight veterans.',
      visual: { size: 'L', loco: 'biped', silhouette: 'ape-like: oversized forearms and fists, small head low between shoulders, two exhaust stacks on the back', weapon: 'piston fists', signature: 'giant fists + smoking exhaust stacks', colors: 'red + rust, black joints, orange eyes, chipped white numbers', tiers: 'R0–1 mismatched plates, one arm bare · R2 matched red plating + knuckle spikes · R3 glowing orange piston cores, flames from stacks' },
      od_vfx: 'Fist pulls back, stacks belch orange flame; rocket-assisted punch; orange shockwave, target skids back on its plate.',
    }),
  U('riot', 'RIOT', 'Line Breaker', 'tank', 'rogue', 'rare', { hp: 1.05, def: 1.08, chargeRate: 1.3 },
    ['slug_shot', 'riot_line', 'breach_and_hold'], {
      launch: true, ref: 'enemy front-near: red shield tank',
      fantasy: 'Stole a riot shield from the cops. Kept the cops\' shotgun too.',
      visual: { size: 'L', loco: 'biped', silhouette: 'tall armoured biped behind a slab shield with a gun-slot, bulky shoulders', weapon: 'slab shield with a shotgun barrel through a notch', signature: 'white-trimmed slab shield with a red stencil skull', colors: 'red + white trim, black, orange visor', tiers: 'R1 base · R2 spikes on shield rim · R3 shield heat-glow edges · R4 twin shotgun barrels + exhaust' },
      od_vfx: 'Slams the shield edge into the floor (sparks), fires a shotgun blast through the gap: wide red-orange cone across the enemy front; shield glows hot.',
    }),
  U('juggernaut', 'JUGGERNAUT', 'Demolition Rig', 'tank', 'rogue', 'epic', { hp: 1.15, def: 1.12, atk: 1.0, spd: 1.9, chargeRate: 1.35 },
    ['saw_ram', 'momentum', 'ram_rush'], {
      fantasy: 'A demolition rig the gangs pointed at people instead of buildings.',
      visual: { size: 'XL', loco: 'tracked', silhouette: 'bulldozer hull with a raised cab-head, front plough with a spinning circular saw', weapon: 'plough + saw blade', signature: 'giant spinning saw + double exhaust', colors: 'orange + black hazard stripes, red lamps', tiers: 'R2 base · R3 spikes on plough + chains · R4 saw glows orange-hot · R5 flame vents along hull' },
      od_vfx: 'Engines roar (exhaust plume), lunges forward one hex and back; saw sparks; an orange impact wave hits the whole enemy column.',
    }),
  U('warlord', 'WARLORD', 'Gang Sovereign', 'tank', 'rogue', 'legendary', { atk: 1.25, hp: 1.04, spd: 1.3, crit: 0.12 },
    ['chainblade', 'blood_money', 'frenzy'], {
      fantasy: 'Runs six gangs. Personally.',
      visual: { size: 'L', loco: 'biped', silhouette: 'towering, horned helm, broad trapezoid torso, long arms', weapon: 'twin chainblades', signature: 'horns + twin chainblades with glowing teeth', colors: 'gold + black + orange teeth glow', tiers: 'R3 base · R4 trophy plates on shoulders · R5 burning horn tips, ember particles' },
      od_vfx: 'Chainblades rev, teeth glow orange; spinning double cleave into the target and its neighbours; red-orange vortex of sparks and debris.',
    }),

  U('rattler', 'RATTLER', 'Street Gun', 'archer', 'rogue', 'common', { atk: 0.96, spd: 0.9, crit: 0.14 },
    ['smg_burst', 'cheap_shots', 'spray_and_pray'], {
      fantasy: 'Two SMGs, zero trigger discipline.',
      visual: { size: 'S', loco: 'biped', silhouette: 'lanky, thin limbs, slouched, bandolier across chest, hood-like head cowl', weapon: 'dual SMGs', signature: 'hood cowl + dual guns', colors: 'black + orange, graffiti tags', tiers: 'R0–1 base · R2 extended mags + scarf cloth strip · R3 orange glowing tags' },
      od_vfx: 'Wild tracer fan from both SMGs, ricochet sparks everywhere, eight random hits.',
    }),
  U('barb', 'BARB', 'Needle Hunter', 'archer', 'rogue', 'rare', { atk: 1.02, spd: 1.2, crit: 0.15 },
    ['needle_burst', 'venom_rounds', 'thornstorm'], {
      launch: true, ref: 'enemy back-near: black-red spiky archer',
      fantasy: 'Fires poisoned flechettes. Looks like it\'s made of them.',
      visual: { size: 'M', loco: 'biped', silhouette: 'thin angular biped, back covered in long red spines like a porcupine, crouched hunter stance', weapon: 'long needle rifle', signature: 'red back spines (fan out on Overdrive)', colors: 'black + blood red, orange-red eye slit', tiers: 'R1 base · R2 more spines · R3 spines glow red at the tips · R4 spines animate/flex' },
      od_vfx: 'Spines flare open; a storm of red flechettes streams down the lane; targets bristle with glowing spikes and start to burn.',
    }),
  U('tarantula', 'TARANTULA', 'Siege Walker', 'archer', 'rogue', 'epic', { hp: 1.2, def: 1.45, atk: 1.04, spd: 1.5 },
    ['twin_cannon', 'dug_in', 'bombard'], {
      launch: true, ref: 'enemy back-mid: black quad spider gunner',
      fantasy: 'An artillery spider. The Red Ledger\'s favourite argument.',
      visual: { size: 'L', loco: 'quad', silhouette: 'low spider: four long jointed legs, flat armoured body, twin cannons on top', weapon: 'twin cannons on a turret', signature: 'four legs + orange eye cluster', colors: 'black + gunmetal, orange eyes and vent glow', tiers: 'R2 base · R3 leg spikes + side armour · R4 third cannon (mortar) · R5 glowing orange leg joints' },
      od_vfx: 'Legs splay and anchor; cannons tilt up; an artillery salvo arcs high and lands on every enemy slot — orange impacts, smoke columns.',
    }),
  U('widowmaker', 'WIDOWMAKER', 'Ghost Contract', 'archer', 'rogue', 'legendary', { atk: 1.2, spd: 1.6, crit: 0.2, critDmg: 0.8 },
    ['long_rifle', 'ghost_net', 'last_light'], {
      fantasy: 'If you see it, it was hired to be seen.',
      visual: { size: 'M', loco: 'biped', silhouette: 'tall, thin, long legs, tattered cloak of panels, long rifle', weapon: 'anti-materiel rifle', signature: 'panel cloak + single gold eye', colors: 'black + gold, orange muzzle', tiers: 'R3 base · R4 cloak shimmer shader · R5 gold eye leaves a trail, cloak edges glow' },
      od_vfx: 'Cloak shimmers to invisible; battle dims 0.3 s; a single gold-orange shot leaves a lingering line; target\'s HP bar shatters.',
    }),

  U('sparkplug', 'SPARKPLUG', 'Back-Alley Tesla', 'mage', 'rogue', 'common', { atk: 1.15, hp: 1.05, spd: 1.3 },
    ['arc_zap', 'live_wire', 'arc_surge'], {
      fantasy: 'Wired itself to a stolen substation. Still plugged in, somehow.',
      visual: { size: 'M', loco: 'biped', silhouette: 'hunched, two tall tesla coils on the back, cables trailing to the ground', weapon: 'hand electrodes', signature: 'twin coils with arcing between them', colors: 'rust + orange, blue-white electricity', tiers: 'R0–1 base · R2 third coil · R3 constant idle arcs' },
      od_vfx: 'Coils glow; lightning jumps between five enemies in a chain; crackling arcs, blue-white flashes.',
    }),
  U('jammer', 'JAMMER', 'Signal Pirate', 'mage', 'rogue', 'rare', { hp: 1.12, atk: 1.1, spd: 1.5 },
    ['static_burst', 'signal_jam', 'blackout'], {
      launch: true, fantasy: 'Pirate radio on treads. Its broadcast is: nothing works.',
      visual: { size: 'M', loco: 'tracked', silhouette: 'small tracked chassis, tall telescoping antenna mast with a dish, two stubby arms', weapon: 'dish emitter', signature: 'tall mast + dish (the tallest thin silhouette in the roster)', colors: 'orange + black, white-blue static glow', tiers: 'R1 base · R2 second dish · R3 holo static rings around the mast · R4 mast extends higher with blinking beacons' },
      od_vfx: 'Mast extends, dish spins; a white-blue ring-shaped EMP shockwave rolls over the enemy side; enemy lights flicker off; brief HUD glitch.',
    }),
  U('pyre', 'PYRE', 'Napalm Artist', 'mage', 'rogue', 'epic', { atk: 1.08, hp: 1.05, spd: 1.6 },
    ['pyre_orb', 'kindling', 'inferno'], {
      fantasy: 'Calls itself an artist. Its medium is everything you own.',
      visual: { size: 'M', loco: 'biped', silhouette: 'stocky biped with big fuel tanks on its back and a flamer arm', weapon: 'mortar-flamer arm', signature: 'back fuel tanks + pilot flame', colors: 'black + orange, flame glow', tiers: 'R2 base · R3 extra tanks · R4 heat-haze aura · R5 molten seams' },
      od_vfx: 'Canisters launch from the back, burst into a carpet of fire across the enemy board; heat haze; flame columns rise.',
    }),
  U('kingpin', 'KINGPIN', 'Swarm Boss', 'mage', 'rogue', 'legendary', { atk: 1.2, hp: 1.08 },
    ['drone_sting', 'protection_racket', 'swarm_contract'], {
      fantasy: 'Never fights. Has people for that. Small, buzzing people.',
      visual: { size: 'L', loco: 'hover', silhouette: 'hovering throne-pod with a seated torso, hive racks on both sides', weapon: 'scrap drone swarm', signature: 'throne + drone hive racks', colors: 'gold + black + orange', tiers: 'R3 base · R4 bigger hive racks · R5 drones constantly orbit' },
      od_vfx: 'Hive racks open; ~20 scrap drones pour out like hornets, zip across the enemy side with tracers, then return.',
    }),

  // ════════ EXPERIMENTAL (purple) — black glass, floating segments, violet seams, crystals ════════
  U('husk', 'HUSK', 'Prototype Shell', 'tank', 'experimental', 'common', { hp: 1.1, def: 1.05, atk: 1.05 },
    ['grav_slam', 'reconstitute', 'fold_in'], {
      fantasy: 'A lab prototype that keeps reassembling itself. Nobody told it to.',
      visual: { size: 'M', loco: 'hover', silhouette: 'legless floating torso, arms made of separated floating segments, gaps glowing violet', weapon: 'gravity fists', signature: 'visible gaps between floating body parts', colors: 'black glass + violet seams', tiers: 'R0–1 base · R2 more segments, tighter gaps · R3 crystal shoulder growths' },
      od_vfx: 'Segments collapse inward into a sphere, purple glow, then burst back out restored.',
    }),
  U('phase', 'PHASE', 'Blink Guard', 'tank', 'experimental', 'rare', { hp: 1.12, def: 1.15, atk: 1.05, chargeRate: 1.3 },
    ['phase_strike', 'phase_skin', 'phase_shift'], {
      launch: true, fantasy: 'It is in three places. Two of them are lying.',
      visual: { size: 'L', loco: 'hover', silhouette: 'heavy hovering wedge torso with two big arms, no legs, a thruster skirt underneath', weapon: 'phase fists', signature: 'afterimage shimmer + thruster skirt glow', colors: 'dark violet + black, magenta seams', tiers: 'R1 base · R2 arm blades · R3 constant faint afterimage · R4 floating crystal shards orbit' },
      od_vfx: 'Body splits into three offset afterimages, blinks through the enemy front line and back; purple phase-scar lines on every target.',
    }),
  U('monolith', 'MONOLITH', 'Gravity Obelisk', 'tank', 'experimental', 'epic', { hp: 1.15, def: 1.2, atk: 0.88, spd: 1.8, chargeRate: 1.35 },
    ['gravity_maul', 'mass_anchor', 'event_horizon'], {
      fantasy: 'Found at the bottom of a lab elevator shaft. Hums in a key that makes glass nervous.',
      visual: { size: 'XL', loco: 'hover', silhouette: 'tall floating black obelisk with a glowing eye, four slab "arms" orbiting it', weapon: 'orbiting slabs', signature: 'the tallest monolithic shape on the board', colors: 'black + violet + faint gold glyphs', tiers: 'R2 base · R3 glyphs animate · R4 six slabs · R5 gravity-lens distortion around it' },
      od_vfx: 'Obelisk lifts; slabs spin fast; a gravity-lens distortion sphere settles over the enemy side; debris pulled inward; enemies lean towards it.',
    }),
  U('leviathan', 'LEVIATHAN', 'Abyssal Hull', 'tank', 'experimental', 'legendary', { hp: 1.12, def: 1.1, atk: 1.05 },
    ['cable_lash', 'abyssal_hull', 'abyssal_grip'], {
      fantasy: 'A deep-sea salvage frame that came back up different.',
      visual: { size: 'XL', loco: 'hover', silhouette: 'huge hovering squid-like hull, many cable tentacles hanging below', weapon: 'cable tentacles', signature: 'tentacle cables + bioluminescent spots', colors: 'gold + deep violet, cyan-violet spots', tiers: 'R3 base · R4 more cables · R5 cables glow and ripple constantly' },
      od_vfx: 'Cables shoot across the board, wrap enemy front-liners in purple glowing coils and crush (flash) — they stay bound for the stun.',
    }),

  U('needle', 'NEEDLE', 'Prism Drone', 'archer', 'experimental', 'common', { hp: 1.0, atk: 1.04, spd: 1.0, crit: 0.14 },
    ['prism_dart', 'overcharge', 'prism_volley'], {
      fantasy: 'A lab targeting drone with a crush on whatever it targets.',
      visual: { size: 'S', loco: 'hover', silhouette: 'small diamond-shaped drone with a single big lens and two little fin wings', weapon: 'prism lens', signature: 'diamond body + lens', colors: 'black + violet lens', tiers: 'R0–1 base · R2 extra fins · R3 orbiting mini-prisms' },
      od_vfx: 'Drone spins; lens fires four thin violet darts in a fan at random enemies.',
    }),
  U('prism', 'PRISM', 'Spectrum Lancer', 'archer', 'experimental', 'rare', { atk: 1.18, spd: 1.4, critDmg: 0.7 },
    ['prism_bolt', 'refraction', 'refraction_beam'], {
      launch: true, fantasy: 'Splits light. Splits armour. Splits opinions.',
      visual: { size: 'M', loco: 'hover', silhouette: 'floating triangular prism body with two slim arms and no legs, point-down', weapon: 'core prism beam', signature: 'inverted triangle body with a glowing crystal core', colors: 'black glass + violet, spectrum (violet→cyan) beam', tiers: 'R1 base · R2 prism splits into 3 floating facets · R3 rainbow caustics · R4 floating halo of shards' },
      od_vfx: 'Body rotates; the beam splits into a spectrum and bounces between four targets; each hit leaves a crystal shard that fades.',
    }),
  U('specter', 'SPECTER', 'Null Sniper', 'archer', 'experimental', 'epic', { atk: 1.12, spd: 1.6, crit: 0.18, critDmg: 0.8 },
    ['ghost_round', 'null_shell', 'spectrum_snipe'], {
      fantasy: 'Only exists in the instant it fires.',
      visual: { size: 'M', loco: 'biped', silhouette: 'very thin stilt-legged biped, long neck, long rifle; hovering-feet (toes don\'t touch the plate)', weapon: 'null rifle', signature: 'stilt legs + wavering cloak shimmer', colors: 'black + pale violet, translucent at the edges', tiers: 'R2 base · R3 cloak shimmer shader · R4 ghost trail on idle · R5 orbiting null orbs' },
      od_vfx: 'Fully cloaks (shimmer), reappears with a purple muzzle flash; the ghost-trail round curves over the front line into the back row.',
    }),
  U('seraph', 'SERAPH', 'Choir Engine', 'archer', 'experimental', 'legendary', { atk: 1.10, spd: 1.3, crit: 0.15 },
    ['light_lance', 'halo_choir', 'choir_of_lances'], {
      fantasy: 'The lab called it a weapons platform. It calls itself a choir.',
      visual: { size: 'L', loco: 'hover', silhouette: 'floating angelic figure, four large blade-wings, halo ring behind the head', weapon: 'light lances', signature: 'four blade wings + halo', colors: 'gold + white + violet light', tiers: 'R3 base · R4 wings gain light edges · R5 six wings, feather-particle trail' },
      od_vfx: 'Wings spread; a dozen light lances materialise in a halo above, rain diagonally onto every enemy; gold-violet pillars of light.',
    }),

  U('wisp', 'WISP', 'Mote Core', 'mage', 'experimental', 'common', { hp: 1.08, atk: 1.1, spd: 1.4 },
    ['wisp_spark', 'tether', 'flicker'], {
      fantasy: 'A loose reactor core that decided it liked people.',
      visual: { size: 'S', loco: 'hover', silhouette: 'glowing orb inside two crossed gyroscope rings, small and bobbing', weapon: 'sparks', signature: 'orb + gyro rings', colors: 'violet + white core', tiers: 'R0–1 base · R2 third ring · R3 mote particle cloud' },
      od_vfx: 'Orb splits into a cloud of motes that streak into each ally\'s core; their plates flare purple.',
    }),
  U('oracle', 'ORACLE', 'Null Orb Weaver', 'mage', 'experimental', 'rare', { atk: 1.2, hp: 1.05, spd: 1.4 },
    ['null_orb', 'foresight', 'orb_cascade'], {
      launch: true, ref: 'player back-mid: purple orb mage',
      fantasy: 'Runs the battle a thousand times before it starts. Hates all but one of them.',
      visual: { size: 'M', loco: 'biped', silhouette: 'slender feminine-cut biped, horn-like head crest, arms raised, two orbs floating at its hands', weapon: 'twin null orbs', signature: 'two big glowing violet orbs + crest', colors: 'dark violet + black, bright violet orbs and seams', tiers: 'R1 base · R2 crest grows, orbs get rings · R3 orbs orbit when idle · R4 third orb + glowing runes on the floor plate' },
      od_vfx: 'Orbs swell to 2× and fly over the enemy side, spiral, and detonate into violet implosion bursts; floor tiles under enemies crack with violet light.',
    }),
  U('halo', 'HALO', 'Stasis Mother', 'mage', 'experimental', 'epic', { hp: 1.15, def: 1.15, atk: 1.1, spd: 1.5 },
    ['null_pulse', 'bubble_ward', 'stasis_bubble'], {
      launch: true, ref: 'enemy back-far: purple bubble-shield mage',
      fantasy: 'Wraps its friends in time-stopped bubbles. Sometimes forgets to let them out.',
      visual: { size: 'M', loco: 'hover', silhouette: 'tall floating mantis-like figure with long thin arms, sits inside a permanent translucent bubble', weapon: 'palm emitters', signature: 'its own violet bubble shield always visible', colors: 'violet + black, translucent bubble with hex moiré', tiers: 'R2 base · R3 bubble gets hex pattern · R4 orbiting stasis motes · R5 double bubble layers' },
      od_vfx: 'Huge translucent violet bubbles inflate over every ally, surfaces ripple with hex moiré; cleansed debuffs pop out as sparks.',
    }),
  U('singularity', 'SINGULARITY', 'Collapse Engine', 'mage', 'experimental', 'legendary', { atk: 1.26, hp: 1.04 },
    ['void_bolt', 'event_well', 'collapse'], {
      fantasy: 'Its core is a very small, very angry black hole.',
      visual: { size: 'M', loco: 'hover', silhouette: 'floating ring-shaped body with a black sphere core, two crescent "arms"', weapon: 'void core', signature: 'black sphere + gold accretion ring', colors: 'gold + violet + black', tiers: 'R3 base · R4 accretion ring particles · R5 light-bending distortion around the core' },
      od_vfx: 'A black sphere with a gold accretion ring appears mid-enemy board; light bends; enemies lean in; implodes with a gold-white ring flash.',
    }),
];

export const UNITS = Object.fromEntries(list.map((u) => [u.id, u]));
export const LAUNCH_SET = list.filter((u) => u.launch).map((u) => u.id);
export const STARTERS = list.filter((u) => u.starter).map((u) => u.id);
export default UNITS;

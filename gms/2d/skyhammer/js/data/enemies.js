// Enemy actor rows. `kind` must be one of CONTRACTS §5.
// spawns[].kind in levels.js/levels_gen.js is the KEY into this table (an enemy id,
// e.g. 'hut'), not the ent kind — the ent's kind/tag/shape all come from the row here.
// Grouped by the act that introduces them; later acts keep spawning earlier rows too.

export const ENEMIES = {
  // ==== act 1 (WW2 Europe, tutorial) ====
  hut:      { kind:'ground', name:'Hut',       hp:60,   w:46, h:34, money:15, tag:'light',  shape:'hut' },
  bunker:   { kind:'ground', name:'Bunker',    hp:220,  w:60, h:38, money:30, tag:'bunker', shape:'bunker' },
  depot:    { kind:'ground', name:'Fuel Depot',hp:180,  w:70, h:56, money:45, tag:'depot',  shape:'depot', chain:1 },
  factory:  { kind:'ground', name:'Factory',   hp:520,  w:150, h:96, money:90, tag:'depot',  shape:'factory' },
  tank:     { kind:'ground', name:'Panzer',    hp:160,  w:56, h:26, money:40, tag:'armour', shape:'tank', moves:34, shoots:'flakLight' },
  radar:    { kind:'ground', name:'Radar',     hp:140,  w:52, h:74, money:55, tag:'radar',  shape:'radar' },
  flakLight:{ kind:'flak', name:'AA Nest',     hp:90,   w:40, h:32, money:35, rof:1.3, shellSpeed:640, dmg:9,  range:900,  shape:'aa' },
  flakHeavy:{ kind:'flak', name:'88mm',        hp:200,  w:58, h:44, money:70, rof:2.2, shellSpeed:820, dmg:24, range:1500, shape:'aa88', flakBurst:1 },
  scout:    { kind:'fighter', name:'Scout',    hp:55,  w:44, h:16, money:45, cruise:420, turnRate:2.2, gun:'mg_303', ai:'chase', shape:'e_biplane' },
  ju87:     { kind:'fighter', name:'Stuka',    hp:90,  w:52, h:18, money:60, cruise:400, turnRate:1.8, gun:'mg_303', ai:'bomber', shape:'e_stuka' },
  bf109:    { kind:'fighter', name:'Interceptor', hp:130, w:50, h:16, money:80, cruise:540, turnRate:3.0, gun:'mg_50', ai:'dogfight', shape:'e_fighter' },
  bomber:   { kind:'fighter', name:'Heavy Bomber', hp:420, w:130, h:34, money:180, cruise:330, turnRate:0.9, gun:'mg_50', ai:'straight', shape:'e_bomber' },
  balloon:  { kind:'balloon', name:'Supply Balloon', hp:1, w:38, h:52, money:35, shape:'balloon', drift:18 },

  // ==== act 2 (WW2 Europe, escalation — bigger raids, coastlines, carriers) ====
  halftrack:{ kind:'ground', name:'Half-track',hp:140,  w:52, h:28, money:50, tag:'armour', shape:'halftrack', moves:40, shoots:'flakLight' },
  railyard: { kind:'ground', name:'Railyard',  hp:300,  w:130, h:60, money:70, tag:'depot',  shape:'railyard', chain:1 },
  uboat:    { kind:'ground', name:'U-Boat',    hp:260,  w:110, h:34, money:80, tag:'armour', shape:'uboat' },
  fw190:    { kind:'fighter', name:'Falke',    hp:150, w:52, h:16, money:90,  cruise:580, turnRate:3.2, gun:'mg_50', ai:'dogfight', shape:'e_fw190' },
  he111:    { kind:'fighter', name:'Raider',   hp:480, w:140, h:36, money:200, cruise:350, turnRate:0.8, gun:'mg_50', ai:'straight', shape:'e_he111' },
  balloon_gold:{ kind:'balloon', name:'Gilded Balloon', hp:1, w:40, h:56, money:90, shape:'balloon_gold', drift:22 },

  // ==== act 3 (the drift begins — prototype jets turn up in a "WW2" war) ====
  sam_site: { kind:'flak', name:'SAM Battery', hp:260,  w:60, h:46, money:95, rof:0.8, shellSpeed:1400, dmg:40, range:1600, shape:'sam' },
  comms_tower:{ kind:'ground', name:'Comms Tower', hp:200, w:54, h:100, money:70, tag:'radar', shape:'tower' },
  convoy_truck:{ kind:'ground', name:'Convoy Truck', hp:100, w:48, h:26, money:35, tag:'light', shape:'truck', moves:46 },
  proto_jet:{ kind:'fighter', name:'Prototype Jet', hp:200, w:56, h:16, money:140, cruise:700, turnRate:3.4, gun:'cannon20', ai:'dogfight', shape:'e_protojet' },
  mig_ghost:{ kind:'fighter', name:'Ghost Interceptor', hp:240, w:54, h:16, money:150, cruise:760, turnRate:3.6, gun:'cannon20', ai:'chase', shape:'e_mig' },

  // ==== act 4 (full jet age — supersonic proxy war) ====
  reactor:  { kind:'ground', name:'Reactor',   hp:700,  w:140, h:110, money:140, tag:'depot', shape:'reactor', chain:1 },
  laser_turret:{ kind:'flak', name:'Laser Turret', hp:320, w:56, h:50, money:120, rof:0.6, shellSpeed:2000, dmg:55, range:1700, shape:'laser' },
  aa_carrier:{ kind:'ground', name:'AA Carrier', hp:340, w:150, h:60, money:130, tag:'armour', shape:'aacarrier', moves:30, shoots:'flakHeavy' },
  jet_fighter:{ kind:'fighter', name:'Jet Fighter', hp:320, w:58, h:18, money:200, cruise:860, turnRate:3.8, gun:'cannon30', ai:'dogfight', shape:'e_jet' },
  stealth_drone:{ kind:'fighter', name:'Stealth Drone', hp:180, w:44, h:14, money:170, cruise:820, turnRate:4.0, gun:'mg_50', ai:'chase', shape:'e_drone' },

  // ==== act 5 (faintly cyberpunk near-future) ====
  drone_hive:{ kind:'ground', name:'Drone Hive', hp:380,  w:120, h:90, money:150, tag:'depot', shape:'hive', chain:1 },
  mech_walker:{ kind:'ground', name:'Mech Walker', hp:450, w:80, h:100, money:160, tag:'armour', shape:'mech', moves:60, shoots:'flakHeavy' },
  plasma_nest:{ kind:'flak', name:'Plasma Nest', hp:400,  w:60, h:52, money:170, rof:0.5, shellSpeed:2400, dmg:70, range:1800, shape:'plasma_aa' },
  cyber_interceptor:{ kind:'fighter', name:'Cyber Interceptor', hp:420, w:60, h:18, money:260, cruise:980, turnRate:4.2, gun:'gatling', ai:'dogfight', shape:'e_cyberjet' },
  drone_swarm:{ kind:'fighter', name:'Swarm Drone', hp:60, w:30, h:14, money:70, cruise:900, turnRate:4.5, gun:'mg_50', ai:'chase', shape:'e_swarmdrone' },

  // ==== bosses — one per act, multi-part per CONTRACTS §5. `parts[]` entries are
  // { id, dx, dy, hp, w, h, tag, shape, weak?, shoots? } offsets from the boss ent's x/y.
  // Destroying every non-weak part (or the weak `core` alone, once exposed) ends the fight;
  // exact trigger order is SIM's call — this is the content the fight is built from. ====
  boss_ironduke:{ kind:'boss', name:'The Iron Duke', hp:0, w:420, h:220, money:2200, tag:'boss', shape:'boss_zeppelin',
    parts:[
      { id:'engineL', dx:-170, dy:10,  hp:220, w:64, h:44, tag:'engine', shape:'boss_engine' },
      { id:'engineR', dx:170,  dy:10,  hp:220, w:64, h:44, tag:'engine', shape:'boss_engine' },
      { id:'turretF', dx:-50,  dy:70,  hp:180, w:50, h:36, tag:'turret', shoots:'flakLight', shape:'boss_turret' },
      { id:'turretB', dx:60,   dy:70,  hp:180, w:50, h:36, tag:'turret', shoots:'flakLight', shape:'boss_turret' },
      { id:'core',    dx:0,    dy:-20, hp:520, w:150, h:90, tag:'core', weak:true, shape:'boss_core' },
    ] },
  boss_leviathan:{ kind:'boss', name:'Leviathan', hp:0, w:520, h:160, money:4200, tag:'boss', shape:'boss_battleship',
    parts:[
      { id:'bowGun',  dx:-210, dy:30, hp:260, w:56, h:40, tag:'turret', shoots:'flakHeavy', shape:'boss_turret' },
      { id:'sternGun',dx:210,  dy:30, hp:260, w:56, h:40, tag:'turret', shoots:'flakHeavy', shape:'boss_turret' },
      { id:'midGunL', dx:-40,  dy:50, hp:180, w:48, h:34, tag:'turret', shoots:'flakLight', shape:'boss_turret' },
      { id:'midGunR', dx:40,   dy:50, hp:180, w:48, h:34, tag:'turret', shoots:'flakLight', shape:'boss_turret' },
      { id:'bridge',  dx:0,    dy:0,  hp:700, w:120, h:100, tag:'core', weak:true, shape:'boss_bridge' },
    ] },
  boss_blacksigma:{ kind:'boss', name:'Black Sigma', hp:0, w:340, h:140, money:7600, tag:'boss', shape:'boss_protobomber',
    parts:[
      { id:'podL',   dx:-120, dy:0,  hp:300, w:60, h:40, tag:'engine', shape:'boss_pod' },
      { id:'podR',   dx:120,  dy:0,  hp:300, w:60, h:40, tag:'engine', shape:'boss_pod' },
      { id:'chinGun',dx:0,    dy:60, hp:220, w:56, h:36, tag:'turret', shoots:'sam_site', shape:'boss_turret' },
      { id:'cockpit',dx:0,    dy:-10,hp:900, w:130, h:80, tag:'core', weak:true, shape:'boss_cockpit' },
    ] },
  boss_behemoth:{ kind:'boss', name:'Behemoth', hp:0, w:600, h:200, money:13500, tag:'boss', shape:'boss_fortress',
    parts:[
      { id:'engine1', dx:-240, dy:20, hp:340, w:60, h:44, tag:'engine', shape:'boss_engine' },
      { id:'engine2', dx:-80,  dy:20, hp:340, w:60, h:44, tag:'engine', shape:'boss_engine' },
      { id:'engine3', dx:80,   dy:20, hp:340, w:60, h:44, tag:'engine', shape:'boss_engine' },
      { id:'engine4', dx:240,  dy:20, hp:340, w:60, h:44, tag:'engine', shape:'boss_engine' },
      { id:'turretTop',dx:0,   dy:80, hp:260, w:60, h:40, tag:'turret', shoots:'laser_turret', shape:'boss_turret' },
      { id:'hull',    dx:0,    dy:-20,hp:1400, w:180, h:110, tag:'core', weak:true, shape:'boss_hull' },
    ] },
  boss_orbitalmother:{ kind:'boss', name:'ORBITAL MOTHER', hp:0, w:460, h:260, money:26000, tag:'boss', shape:'boss_platform',
    parts:[
      { id:'nodeA',  dx:-180, dy:60, hp:400, w:64, h:50, tag:'turret', shoots:'plasma_nest', shape:'boss_node' },
      { id:'nodeB',  dx:180,  dy:60, hp:400, w:64, h:50, tag:'turret', shoots:'plasma_nest', shape:'boss_node' },
      { id:'nodeC',  dx:0,    dy:100,hp:400, w:64, h:50, tag:'turret', shoots:'plasma_nest', shape:'boss_node' },
      { id:'shield', dx:0,    dy:0,  hp:900, w:200, h:120, tag:'shield', shape:'boss_shield' },
      { id:'core',   dx:0,    dy:-30,hp:2200, w:160, h:100, tag:'core', weak:true, shape:'boss_core2' },
    ] },
};

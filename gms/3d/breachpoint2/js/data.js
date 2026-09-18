/* BREACHPOINT II — §DATA.  Pure tables, no dependencies, loaded first.
   §TIERS   enemy stat tiers + boss multipliers
   §LAYOUTS per-level container maps — one yard, five mazes
   §LEVELS  campaign level table (layout + insertion point per level)
   §UPGRADES six upgrade tracks + the weapon unlock ladder
   Everything here is published on window.BP2 for profile.js and engine.js. */
(function(){
'use strict';
const BP2 = window.BP2 = window.BP2 || {};
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);

/* ---------------------------- §TIERS — enemy stat tiers ------------ */
/* apPen is subtracted from the player's armour absorb fraction: a high-tier
   round goes through plating that a militia round would bounce off. */
const TIERS = {
  paint:   {id:'paint',   label:'TARGET',   hp:60,  dmg:5,  apPen:0.00, dmgTakenMul:1.00, accuracy:0.30, reaction:1.10},
  militia: {id:'militia', label:'MILITIA',  hp:80,  dmg:9,  apPen:0.00, dmgTakenMul:1.00, accuracy:0.42, reaction:0.85},
  regular: {id:'regular', label:'REGULAR',  hp:100, dmg:12, apPen:0.10, dmgTakenMul:1.00, accuracy:0.55, reaction:0.65},
  veteran: {id:'veteran', label:'VETERAN',  hp:130, dmg:15, apPen:0.18, dmgTakenMul:0.90, accuracy:0.66, reaction:0.52},
  shock:   {id:'shock',   label:'SHOCK',    hp:170, dmg:18, apPen:0.26, dmgTakenMul:0.82, accuracy:0.76, reaction:0.42},
  praetor: {id:'praetor', label:'PRAETOR',  hp:220, dmg:22, apPen:0.34, dmgTakenMul:0.74, accuracy:0.85, reaction:0.34}
};
const BOSS_MUL = {hp:2.2, dmg:1.25, apPen:0.10, dmgTakenMul:0.85, scale:1.18};
// accuracy 0.30 -> 1.42x aim error, 0.85 -> 0.54x
const tierErrMul = acc => 1.9 - acc*1.6;

/* ---------------------------- §LAYOUTS — per-level container maps --
   One yard, five mazes. Each layout is the COMPLETE container list for the
   levels that use it; §WORLD merges each one into its own mesh set and only
   the active layout is visible, so N layouts cost the same to draw as one.
   `pal` is five indices into CONTAINER_COLORS and `ci` indexes `pal` — five,
   exactly, because a layout renders as (one mesh per palette colour) + (one
   frame mesh) and the world budget is built around that count. A stack takes
   pal[(ci+s) % 5] per slab, so every layout also reads as its own palette.
   Placement: [x, z, stack, rot (0 = long axis X, 1 = long axis Z), ci].     */
const LAYOUTS = [
  { id:0, name:'YARD', pal:[0,1,2,3,4], cons:[
    // two parallel N-S rows: the original CQB corridor
    [8.4,-15.2,1,1,0],[8.4,-9.1,1,1,1],[8.4,-3.0,2,1,2],[8.4,3.1,1,1,0],[8.4,9.2,1,1,1],
    [14.6,-12.4,1,1,2],[14.6,-6.3,2,1,3],[14.6,-0.2,1,1,0],[14.6,5.9,1,1,1],[14.6,12.0,1,1,2],
    // yard scatter
    [-6.5,-20.5,1,0,0],[1.6,-24.2,2,0,3],[-13.5,-17.0,1,0,4],[-3.5,16.4,1,0,1],
    [4.6,22.0,1,1,2],[-14.0,20.5,2,0,0],[20.5,-14.5,1,1,0],[24.2,4.0,1,0,3],
    [19.4,12.6,1,1,4],[24.6,-22.5,1,0,1],[-22.0,15.0,1,0,2],[9.0,-25.5,1,0,0]
  ]},
  { id:1, name:'THE STACKS', pal:[1,2,4,5,0], cons:[
    // lanes run EAST-WEST, so every approach crosses the map sideways
    [-12,-14,2,0,0],[-3,-14,1,0,1],[6,-14,2,0,2],[15,-14,1,0,3],
    [-8,-4.9,1,0,4],[1,-4.9,2,0,0],[10,-4.9,1,0,1],
    [-2,4.2,1,0,2],[7,4.2,2,0,3],[16,4.2,1,0,4],
    [-12,13,1,0,0],[-3,13,2,0,1],[6,13,1,0,2],[15,13,2,0,3],
    [-6,21.5,1,0,4],[3,21.5,2,0,0],[12,21.5,1,0,1],
    // the blinder: 3-high along the building's east face, so the parapet
    // cannot see into the lanes and the fight has to happen on the ground
    [-13.2,-10.2,3,1,2],[-13.2,-4.0,3,1,3],[-13.2,10.6,3,1,4],
    // flanks
    [20.5,-20,1,1,0],[20.8,8,2,1,1],[-20,-23,1,0,2],[-24,12,1,1,3]
  ]},
  { id:2, name:'OPEN GROUND', pal:[3,4,0,2,5], cons:[
    // everything is pushed to the edges: a bare middle, and the parapet
    // overlooks all of it. The high ground is the answer on this one.
    // the west edge is three SHORT blocks, not a wall: a long wall parallel to
    // the perimeter makes a dead channel that the A* can reach into and not
    // out of, and anything spawned in it stands still for the whole round.
    [-22,-20,2,0,0],[-22,11,1,0,1],[-22,21,1,0,2],
    [-11,26,1,0,0],[-2,26,2,0,1],[7,26,1,0,2],[19,26,2,0,3],
    [-20,-26,1,0,4],[-11,-26,2,0,0],[-2,-26,1,0,1],[7,-26,2,0,2],
    // P5c: the north quay block used to sit at z=20. Its north face (z 23.03)
    // and the [19,26] block's east face (x 22.03) left a 1.75 m diagonal slot
    // that A* — 0.75 m cells, 0.44 m agent inflation, no corner cutting —
    // could not thread, so the SE quay corner was a 3-cell dead end the PLAYER
    // could walk into and nothing could follow him into. Moved south.
    [23.2,-24,1,1,3],[23.2,5,2,1,4],[23.2,18,1,1,0],
    // three lonely blocks in the open — the only cover in the middle
    [12,-12,1,0,1],[10.5,10,1,1,2],[-2,-18,1,0,3]
  ]},
  { id:3, name:'THE FUNNEL', pal:[5,4,1,3,2], cons:[
    // one diagonal spine from the south-west to the north-east, with two
    // gaps in it: crossing sides is a commitment, not a stroll
    [-12,-22,2,0,0],[-6.5,-19,2,1,1],[-4,-14,2,0,2],[2,-11,2,1,3],
    [10,-3,2,1,4],[12,2,2,0,0],[18,5.5,2,1,1],[20,10.5,2,0,2],
    // north pocket
    [-11,14,1,0,3],[-8,18.5,2,0,4],[0,14,1,1,0],[8,20,1,0,1],
    // south / east pockets
    [-22,-16,1,0,2],[16,-22,2,1,3],[20,-8,1,1,4],[23.5,22,1,1,0],
    // west approach cover, clear of the building
    [-19,-24,1,0,1],[-24,20,1,1,2]
  ]},
  { id:4, name:'QUAY WALL', pal:[0,3,5,1,4], cons:[
    // a rampart across the dock approach with two gates, and a swept
    // killing field between the yard and the quay
    [20,-24,2,1,0],[20,-17.5,2,1,1],[20,-4,2,1,2],[20,2.5,2,1,3],
    [20,15,2,1,4],[20,21.5,2,1,0],
    [23,-3,1,1,1],[23.4,-20,1,1,2],[23.4,10,1,1,3],
    // forward outposts in the open ground
    [6,-14,1,0,4],[2,8,1,0,0],[10,20,2,1,1],[-6,-24,1,0,2],[-18,-20,2,0,3],
    [-16,10.5,1,0,4],[-24,-24,1,1,0],[-3,-9,1,1,1]
  ]}
];

/* ---------------------------- §LEVELS — campaign table -------------
   `spTarget` is the SOFT power target the hub and the armoury read: "you
   should have earned about this much by now". P5c MEASURED what a clean
   first playthrough actually pays (kills 10 x level, +6 a headshot, +120 a
   boss, first clear 250 x level, up to +60 accuracy, +100 flawless, and the
   drill's flat 300) by driving every level to a real clear. Career SP on
   ARRIVAL at each level: L1 300 · L2 700 · L3 1560 · L4 2830 · L5 4450 ·
   L6 6570 · L7 9190 · L8 12400. Every target is ~65% of that, so the
   recommendation is always reachable without replaying anything — the old
   L8 11000 was 89% of a perfect run and left the readout stuck on
   "under-equipped". L7 is the one exception, and says why below.        */
/* objective and light are carried for the campaign phase; every level is
   played as 'eliminate' until the objective logic lands. */
const LEVELS = [
  {id:0, name:'TRAINING GROUND', sub:'PAINTBALL YARD · LIVE DRILL', layout:0, insert:{x:1.5,z:24.5,yaw:0}, objective:'eliminate',
   roster:[{tier:'paint',count:2}], time:0, light:'day', maxAttackers:1, spTarget:0, paintball:true},
  {id:1, name:'THE DOCK', sub:'SECTOR 7 · QUAYSIDE', layout:0, insert:{x:-12,z:16,yaw:-1.135}, objective:'capture',
   roster:[{tier:'militia',count:5}], time:240, light:'day', maxAttackers:2, spTarget:0,
   zone:{x:18,z:2,r:9}, hold:20},
  {id:2, name:'CONTAINER ROW', sub:'SECTOR 7 · STACKS', layout:1, insert:{x:11.5,z:-26,yaw:Math.PI}, objective:'eliminate',
   roster:[{tier:'regular',count:6},{tier:'regular',boss:true,name:'SERGEANT'}],
   time:210, light:'overcast', maxAttackers:2, spTarget:450},
  {id:3, name:'THE OVERLOOK', sub:'SECTOR 7 · PARAPET', layout:2, insert:{x:-19.5,z:0,y:4.4,yaw:-1.399}, objective:'hold',
   roster:[{tier:'regular',count:9},{tier:'regular',boss:true,name:'CAPTAIN'}],
   time:210, light:'dusk', maxAttackers:3, spTarget:1000, zone:{x:-8,z:-2,r:7}, hold:45},
  {id:4, name:'NIGHTFALL', sub:'SECTOR 7 · BLACK HOURS', layout:3, insert:{x:-24,z:-2,yaw:-1.5708}, objective:'eliminate',
   roster:[{tier:'veteran',count:9},{tier:'veteran',boss:true,name:'WARDEN'}],
   time:210, light:'night', maxAttackers:3, spTarget:1800},
  {id:5, name:'SUPPLY LINE', sub:'SECTOR 7 · CONVOY', layout:4, insert:{x:24,z:18,yaw:1.5708}, objective:'waves',
   roster:[{tier:'veteran',count:12},{tier:'veteran',boss:true,name:'QUARTERMASTER'}],
   // P5c (coordinator's call): L4 NIGHTFALL is night, L5 is day + haze. The same
   // raw threat with better visibility would make L5 play EASIER than L4 — a real
   // inversion, not a modelling artefact. The lever is bodies, never TIERS.
   time:240, light:'haze', maxAttackers:4, spTarget:2900, waves:2},
  {id:6, name:'THE SIEGE', sub:'SECTOR 7 · LAST YARD', layout:1, insert:{x:1,z:0,yaw:0}, objective:'waves',
   roster:[{tier:'shock',count:14},{tier:'shock',boss:true,name:'ARBITER'}],
   time:240, light:'fog', maxAttackers:4, spTarget:4300, waves:3},
  {id:7, name:'BLACKOUT', sub:'SECTOR 7 · NO LIGHTS', layout:3, insert:{x:-26,z:-26,yaw:-2.356}, objective:'eliminate',
   roster:[{tier:'shock',count:14},{tier:'shock',boss:true,name:'UMBRA'},{tier:'shock',boss:true,name:'NOCTIS'}],
   // L6 and L7 are the SAME threat to the model (shock, 4 attackers), so any
   // budget gap that crosses a rank-cost boundary makes L7 read EASIER than L6.
   // 4900 keeps both on the same optimal build, which is why it is the one
   // target below the 65%-of-earnings line the rest of the table follows.
   time:240, light:'nightfog', maxAttackers:4, spTarget:4900},
  {id:8, name:'BREACHPOINT', sub:'SECTOR 7 · THE MARSHAL', layout:4, insert:{x:24,z:-26,yaw:Math.PI}, objective:'eliminate',
   roster:[{tier:'praetor',count:18},{tier:'praetor',boss:true,name:'THE MARSHAL'}],
   time:300, light:'storm', maxAttackers:4, spTarget:8000},
  {id:9, name:'ENDLESS', sub:'NO EXTRACTION', layout:0, insert:{x:1.5,z:24.5,yaw:0}, objective:'waves', endless:true,
   roster:[{tier:'praetor',count:12},{tier:'praetor',boss:true,name:'THE MARSHAL'}],
   time:0, light:'rotate', maxAttackers:4, spTarget:8000}
];
const CAMPAIGN_LEVELS = LEVELS.filter(l=>!l.endless).length;   // 9
const levelById = n => LEVELS[clamp(n|0, 0, LEVELS.length-1)];

/* ---------------------------- §UPGRADES — six tracks --------------- */
const UPG_COSTS = [150,350,700,1300,2200];
const UPGRADES = {
  vitality:{name:'VITALITY', blurb:'MAXIMUM HEALTH', costs:UPG_COSTS, ranks:[
    {maxHp:100},{maxHp:125},{maxHp:150},{maxHp:180},{maxHp:215},{maxHp:260}]},
  plating:{name:'PLATING', blurb:'ARMOUR POOL · ABSORB · REGEN', costs:UPG_COSTS, ranks:[
    {pool:50, absorb:0.50, delay:6.0, regen:0},
    {pool:90, absorb:0.58, delay:5.2, regen:8},
    {pool:140,absorb:0.66, delay:4.4, regen:12},
    {pool:200,absorb:0.74, delay:3.6, regen:16},
    {pool:270,absorb:0.82, delay:2.8, regen:22},
    {pool:350,absorb:0.90, delay:2.0, regen:30}]},
  marksman:{name:'MARKSMAN', blurb:'WEAPON DAMAGE', costs:UPG_COSTS, ranks:[
    {dmg:1.00},{dmg:1.08},{dmg:1.17},{dmg:1.27},{dmg:1.38},{dmg:1.50}]},
  steady:{name:'STEADY', blurb:'AIM ASSIST · SPREAD', costs:UPG_COSTS, ranks:[
    {assist:1.0,spread:1.00},{assist:1.25,spread:0.94},{assist:1.5,spread:0.88},
    {assist:1.8,spread:0.82},{assist:2.1,spread:0.76},{assist:2.5,spread:0.70}]},
  logistics:{name:'LOGISTICS', blurb:'MAGAZINE · RESERVE · RELOAD', costs:UPG_COSTS, ranks:[
    {mag:1.0,reserve:1.0,reload:1.00},{mag:1.1,reserve:1.2,reload:0.94},
    {mag:1.2,reserve:1.4,reload:0.88},{mag:1.35,reserve:1.6,reload:0.82},
    {mag:1.5,reserve:1.9,reload:0.76},{mag:1.7,reserve:2.2,reload:0.70}]},
  mobility:{name:'MOBILITY', blurb:'SPRINT · DOUBLE JUMP · LANDING', costs:UPG_COSTS, ranks:[
    {sprint:1.00,dblJump:false,fallImmune:false},
    {sprint:1.05,dblJump:false,fallImmune:false},
    {sprint:1.10,dblJump:true, fallImmune:false},
    {sprint:1.16,dblJump:true, fallImmune:false},
    {sprint:1.22,dblJump:true, fallImmune:false},
    {sprint:1.30,dblJump:true, fallImmune:true}]}
};
const UPG_TRACKS = Object.keys(UPGRADES);
// upg() reads the live profile, so it lives in profile.js — this file stays
// dependency-free tables.

const WEAPON_UNLOCK = {
  rifle:   {cost:0,    level:0},
  pistol:  {cost:400,  level:1},
  shotgun: {cost:1200, level:3},
  sniper:  {cost:2600, level:5}
};

Object.assign(BP2, {
  TIERS, BOSS_MUL, tierErrMul, LAYOUTS,
  LEVELS, CAMPAIGN_LEVELS, levelById,
  UPG_COSTS, UPGRADES, UPG_TRACKS, WEAPON_UNLOCK
});
})();

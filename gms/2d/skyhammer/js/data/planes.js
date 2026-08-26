// The player's aircraft ladder. `turnRate` is the Manoeuvrability stat; see CONTRACTS §3b.
// 9 tiers over 100 levels ~= a new tier every 8-12 levels once upgrade spend is accounted
// for — see js/data/economy.js for the affordability table this was checked against.

export const PLANES = [
  { id:'kestrel',  name:'Kestrel',     era:'ww2',    tier:1, price:0,
    hp:100, cruise:430, stall:210, landSpeed:247, vmax:760,  turnRate:2.6, slots:2,
    mainGun:'mg_303',   len:120, shape:'biplane',  livery:'olive' },
  { id:'harrier1', name:'Harrow',      era:'ww2',    tier:2, price:1400,
    hp:150, cruise:490, stall:230, landSpeed:271, vmax:860,  turnRate:2.9, slots:3,
    mainGun:'mg_50',    len:132, shape:'monoplane', livery:'grey' },
  { id:'tempest',  name:'Tempest',     era:'ww2',    tier:3, price:4200,
    hp:220, cruise:560, stall:260, landSpeed:306, vmax:980,  turnRate:3.2, slots:4,
    mainGun:'cannon20', len:146, shape:'fighter',   livery:'navy' },
  { id:'meteor',   name:'Meteor',      era:'jet',    tier:4, price:9000,
    hp:260, cruise:620, stall:270, landSpeed:318, vmax:1050, turnRate:3.4, slots:4,
    mainGun:'cannon25', len:152, shape:'jet',       livery:'raf-grey',
    note:'First jet off the line. The RAF asked for a fighter. This is closer to a shed with a pilot in it.' },
  { id:'sabre',    name:'Sabre',       era:'jet',    tier:5, price:16000,
    hp:300, cruise:680, stall:300, landSpeed:354, vmax:1180, turnRate:3.6, slots:4,
    mainGun:'cannon30', len:158, shape:'jet',       livery:'silver' },
  { id:'vampire',  name:'Vampire',     era:'jet',    tier:6, price:26000,
    hp:360, cruise:740, stall:320, landSpeed:377, vmax:1280, turnRate:3.8, slots:4,
    mainGun:'vulcan',   len:164, shape:'jet3',      livery:'slate' },
  { id:'phantom',  name:'Revenant',    era:'jet',    tier:7, price:40000,
    hp:420, cruise:790, stall:340, landSpeed:401, vmax:1420, turnRate:3.9, slots:4,
    mainGun:'gatling',  len:176, shape:'jet2',      livery:'charcoal' },
  { id:'specter',  name:'Specter',     era:'future', tier:8, price:58000,
    hp:500, cruise:840, stall:360, landSpeed:424, vmax:1550, turnRate:4.0, slots:4,
    mainGun:'railgun',  len:184, shape:'stealth',   livery:'matte-black',
    note:'Nobody in the squadron knows who built it or why it has no visible engine.' },
  { id:'vector',   name:'Vector',      era:'future', tier:9, price:80000,
    hp:600, cruise:900, stall:380, landSpeed:448, vmax:1700, turnRate:4.2, slots:4,
    mainGun:'plasma',   len:190, shape:'delta',     livery:'white' },
];

export const UPGRADES = [
  { id:'armor',  name:'Armour',        max:20, step:(v)=>v*14,  base:180 },
  { id:'speed',  name:'Speed',         max:20, step:(v)=>v*11,  base:160 },
  { id:'turn',   name:'Manoeuvre',     max:20, step:(v)=>v*0.045, base:200 },
  { id:'gun',    name:'Gun Damage',    max:20, step:(v)=>v*1.6, base:150 },
  { id:'ammo',   name:'Ordnance Load', max:10, step:(v)=>v*1,   base:260 },
];

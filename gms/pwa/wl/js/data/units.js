// Unit type definitions and city production tables
export const UNIT_TYPES = {
  MILITIA:    { id:'MILITIA',    name:'Militia',         attack:1, defense:1, move:4, cost:0,   strength:1,  flying:false, siege:false, desc:'Conscripted fighters' },
  LIGHT_INF:  { id:'LIGHT_INF',  name:'Light Infantry',  attack:2, defense:1, move:4, cost:10,  strength:2,  flying:false, siege:false, desc:'Fast foot soldiers' },
  HEAVY_INF:  { id:'HEAVY_INF',  name:'Heavy Infantry',  attack:3, defense:2, move:3, cost:20,  strength:3,  flying:false, siege:false, desc:'Armored warriors' },
  ARCHERS:    { id:'ARCHERS',    name:'Archers',         attack:2, defense:1, move:4, cost:15,  strength:2,  flying:false, siege:false, ranged:true, desc:'Ranged attackers' },
  CAVALRY:    { id:'CAVALRY',    name:'Cavalry',         attack:3, defense:1, move:6, cost:25,  strength:3,  flying:false, siege:false, desc:'Mounted warriors' },
  WOLF_RIDER: { id:'WOLF_RIDER', name:'Wolf Riders',     attack:4, defense:2, move:6, cost:40,  strength:4,  flying:false, siege:false, desc:'Savage mounted warriors' },
  CATAPULT:   { id:'CATAPULT',   name:'Catapult',        attack:5, defense:1, move:2, cost:35,  strength:3,  flying:false, siege:true,  desc:'Destroys city walls' },
  GIANT:      { id:'GIANT',      name:'Giant',           attack:5, defense:3, move:3, cost:60,  strength:5,  flying:false, siege:false, desc:'Massive warrior' },
  WIZARD:     { id:'WIZARD',     name:'Wizard',          attack:6, defense:4, move:4, cost:120, strength:6,  flying:false, siege:false, desc:'Powerful battle mage' },
  DRAGON:     { id:'DRAGON',     name:'Dragon',          attack:8, defense:6, move:9, cost:200, strength:8,  flying:true,  siege:false, desc:'Legendary winged beast' },
};

// What each city type can produce and earn per turn
export const CITY_PRODUCTION = {
  village: {
    gold: 2,
    units: ['MILITIA', 'LIGHT_INF', 'ARCHERS'],
    maxGarrison: 4,
    label: 'Village',
  },
  town: {
    gold: 4,
    units: ['MILITIA', 'LIGHT_INF', 'HEAVY_INF', 'ARCHERS', 'CAVALRY'],
    maxGarrison: 6,
    label: 'Town',
  },
  city: {
    gold: 8,
    units: ['MILITIA', 'LIGHT_INF', 'HEAVY_INF', 'ARCHERS', 'CAVALRY', 'WOLF_RIDER', 'CATAPULT', 'GIANT'],
    maxGarrison: 8,
    label: 'City',
  },
  capital: {
    gold: 12,
    units: ['MILITIA', 'LIGHT_INF', 'HEAVY_INF', 'ARCHERS', 'CAVALRY', 'WOLF_RIDER', 'CATAPULT', 'GIANT', 'WIZARD', 'DRAGON'],
    maxGarrison: 8,
    label: 'Capital',
  },
  ruins: {
    gold: 0,
    units: [],
    maxGarrison: 0,
    label: 'Ruins',
  },
  temple: {
    gold: 3,
    units: ['MILITIA', 'LIGHT_INF'],
    maxGarrison: 4,
    label: 'Temple',
  },
};

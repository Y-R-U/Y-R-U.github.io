// LASTWALL — weapon definitions. Starters are unlimited (tiered via meta);
// temp weapons are ammo/time limited pickups; supers are absurd + slow recharge.
// kb = impulse at base damage; total impulse scales with the damage multiplier,
// so damage boosts literally launch things (the whole point of the game).

export const WEAPONS = {
  // melee starters (meta tier 0..2)
  pipe:     { name: 'PIPE',      type: 'melee', dmg: 24, kb: 12, cd: 0.48, range: 2.7, arc: 1.1 },
  bat:      { name: 'SPIKED BAT',type: 'melee', dmg: 38, kb: 20, cd: 0.5,  range: 2.9, arc: 1.2 },
  sledge:   { name: 'SLEDGE',    type: 'melee', dmg: 62, kb: 34, cd: 0.72, range: 3.1, arc: 1.3 },
  // gun starters (meta tier 0..2)
  scrap:    { name: 'SCRAPSHOT', type: 'gun',   dmg: 13, kb: 5,  cd: 0.42, range: 26, spread: 0.03 },
  repeater: { name: 'REPEATER',  type: 'gun',   dmg: 16, kb: 6,  cd: 0.3,  range: 30, spread: 0.03 },
  longiron: { name: 'LONGIRON',  type: 'gun',   dmg: 44, kb: 18, cd: 0.65, range: 40, spread: 0.01, pierce: 2 },
  // temp pickups
  scatter:  { name: 'SCATTERGUN',type: 'gun',   dmg: 9,  kb: 9,  cd: 0.7,  range: 14, spread: 0.14, pellets: 7, ammo: 24, temp: true },
  stitcher: { name: 'STITCHER',  type: 'gun',   dmg: 8,  kb: 3,  cd: 0.085,range: 24, spread: 0.05, ammo: 140, temp: true },
  flame:    { name: 'FLAME LANCE',type:'flame', dmg: 34, kb: 2,  cd: 0.1,  range: 9,  time: 10, temp: true, burn: 3 },
  // superweapons (one slot, recharge seconds)
  maul:     { name: 'GRAVITY MAUL', type: 'super', dmg: 220, kb: 95, radius: 9,  recharge: 45, super: true },
  howler:   { name: 'HOWLER CANNON',type: 'super', dmg: 90,  kb: 70, cone: 0.6, range: 26, recharge: 70, super: true, lift: 14 },
};

export const MELEE_TIERS = ['pipe', 'bat', 'sledge'];
export const GUN_TIERS = ['scrap', 'repeater', 'longiron'];
export const TEMP_POOL = ['scatter', 'stitcher', 'flame'];
export const SUPER_POOL = ['maul', 'howler'];

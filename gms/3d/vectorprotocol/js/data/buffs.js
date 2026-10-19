// Consumable pre-battle buffs (one per battle). Workshop sells them; events/arena drop them.
export const BUFFS = {
  stim_pack: { id: 'stim_pack', name: 'Stim Pack', icon: 'stim', desc: '+15% ATK for one battle', mods: { atk: 0.15 }, cost: { credits: 400 }, battles: 1, unlock: 'm2_l3' },
  plating_kit: { id: 'plating_kit', name: 'Plating Kit', icon: 'plate', desc: '+15% HP for one battle', mods: { hp: 0.15 }, cost: { credits: 400 }, battles: 1, unlock: 'm2_l3' },
  capacitor: { id: 'capacitor', name: 'Capacitor', icon: 'cap', desc: '+25% Overdrive charge for one battle', mods: { charge: 0.25 }, cost: { credits: 600 }, battles: 1, unlock: 'm3_l1' },
  aegis_cell: { id: 'aegis_cell', name: 'Aegis Cell', icon: 'shield', desc: '-10% damage taken for one battle', mods: { dr: 0.10 }, cost: { credits: 800 }, battles: 1, unlock: 'm4_l1' },
  targeting_suite: { id: 'targeting_suite', name: 'Targeting Suite', icon: 'aim', desc: '+12% crit chance, +20% crit damage for one battle', mods: { crit: 0.12, critDmg: 0.20 }, cost: { credits: 800 }, battles: 1, unlock: 'm4_l1' },
  overclock_core: { id: 'overclock_core', name: 'Overclock Core', icon: 'overclock', desc: '+20% ATK, +10% HP for one battle (raid/arena drop only)', mods: { atk: 0.20, hp: 0.10 }, cost: null, battles: 1 },
};
export default BUFFS;

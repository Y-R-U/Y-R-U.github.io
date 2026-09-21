// One stat block per enemy type. `armour` is a flat fraction off incoming damage and does NOT
// apply to fire or flame — the heavy is meant to send you reaching for a grenade or a flamer,
// not for another rifle.
export const SOLDIERS={
 blue:{hp:100,speed:3.4},
 red:{hp:65,speed:2.5},
 grunt:{hp:65,speed:2.5,armour:0,weapon:'rifle',name:'Pvt. Other',label:'grunt'},
 heavy:{hp:170,speed:1.5,armour:.46,weapon:'rifle',damageBonus:.34,name:'Sgt. Slab',label:'heavy'},
 rusher:{hp:34,speed:5.4,armour:0,weapon:'bayonet',name:'Pvt. Whippet',label:'rusher'}
};
export const pickKind=(mix,i)=>!mix||!mix.length?'grunt':mix[i%mix.length];

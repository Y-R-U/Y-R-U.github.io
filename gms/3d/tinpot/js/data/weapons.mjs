// `cone` is the half-angle in radians. A cone weapon has no projectile: it hits everything in
// the wedge in front of the man, including his own side, and leaves fire on the ground where it
// lands. `tank` is what goes off when its owner dies holding it.
export const WEAPONS={
 rifle:{id:'rifle',name:'Rifle',icon:'⌁',range:12,cadence:.72,accuracy:.72,damage:25,speed:70},
 grenade:{id:'grenade',name:'Grenade',icon:'●',range:16,cadence:3.8,accuracy:1,damage:115,speed:12,radius:4.2,fuse:1.7},
 bayonet:{id:'bayonet',name:'Bayonet',icon:'†',range:2.4,cadence:1,accuracy:.95,damage:42,speed:60},
 flamer:{id:'flamer',name:'Flamer',icon:'≋',range:7.4,cadence:.4,accuracy:1,damage:8.5,speed:40,cone:.46,pool:1.9,poolLife:3.2,tank:{radius:5.4,damage:150}}
};

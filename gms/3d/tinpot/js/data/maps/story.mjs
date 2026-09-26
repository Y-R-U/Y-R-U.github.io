// Each territory has its own seed, corridor, cover and landmark silhouette.
const territory=(id,name,seed,corridor,bend,theme,tint)=>({id,name,seed,corridor,bend,theme,tint,width:64,depth:84,spawn:{x:0,z:10},goal:{x:-1,z:-19},depot:{x:0,z:5},cover:[{id:0,type:'wall',x:-4,z:0,radius:.9,hp:180},{id:1,type:'cart',x:4,z:8,radius:.8,hp:90},{id:2,type:'rock',x:4,z:-11,radius:1,hp:220},{id:3,type:'log',x:-4,z:-17,radius:.9,hp:90}]});
export const STORY_MAPS={
 orchard:territory('orchard','01 / Marmalade Mile',3017,8,1.5,'orchard',0xa29349),
 village:territory('village','02 / Little Piddle',4081,8.5,1,'village',0x9b8860),
 quarry:territory('quarry','02 / Chalk & Awe',5023,7.5,2,'quarry',0xb2aa8d),
 junction:territory('junction','03 / Platform Eleven',6089,8,1,'rail',0x81734f),
 marsh:territory('marsh','04 / Soggy Bottom',7039,7.5,2.4,'marsh',0x51766b),
 ridge:territory('ridge','04 / Mount Improbable',8087,7,2.8,'radio',0x9a8262),
 ministry:territory('ministry','05 / Ministry of Plenty',9011,9,1,'ministry',0x909b83),
 capital:territory('capital','06 / The Last Kettle',10037,9,1,'capital',0xaa965d)
};

for(const map of Object.values(STORY_MAPS)){
 for(let i=0;i<4;i++)map.cover.push({id:10+i,type:'landmark',theme:map.theme,x:(i%2?-1:1)*9,z:9-Math.floor(i/2)*22,radius:2.1,hp:99999});
}

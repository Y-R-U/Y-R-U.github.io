import {LANDMARKS,hash32} from './world.mjs';
import {SEED} from './config.mjs';
const pages=[
 ['lantern','Someone kept this light for boats they would never meet. Tonight it still finds you.'],
 ['bells','The wind knows three notes. It never plays them in the same order.'],
 ['crown','The crown broke long before the charts were drawn. The sea kept both halves.'],
 ['cinder','Every step remembers a different tide. The highest still waits for the water.'],
 ['needle','From far away it looks like a sail. Up close, it is still going nowhere.'],
 ['orchard','Six trees lean toward the last warm light. There is room here for another memory.'],
];
export const ATLAS=Object.freeze(LANDMARKS.map((island,i)=>Object.freeze({...island,art:pages[i][0],postcard:pages[i][1],number:i+1})));
const adjectives=['Amber','Quiet','Salt','Copper','Evening','Pale','Hidden','Drifting','Warm','Silver','Wild','Distant'];
const nouns=['Rest','Cove','Cairn','Reach','Haven','Rock','Garden','Crown','Watch','Key','Steps','Orchard'];
export function islandName(island){return island.landmark||adjectives[hash32(SEED,island.cx,island.cz,31)%12]+' '+nouns[hash32(SEED,island.cx,island.cz,32)%12];}

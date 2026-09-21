import {UPGRADES} from '../data/upgrades.mjs';
export function offer(c,id){const item=UPGRADES.find(u=>u.id===id);if(!item)return null;const level=c.upgrades[id]||0,cost=item.cost*(id==='slots'?1:level+1);return {...item,level,cost,locked:c.mission<item.gate,maxed:level>=item.max,affordable:c.credits>=cost};}
export function purchase(c,id){const o=offer(c,id);if(!o||o.locked||o.maxed||!o.affordable)return false;c.credits-=o.cost;c.upgrades[id]=(c.upgrades[id]||0)+1;return true;}
export function assign(c,slot,id){if(!c.roster.some(m=>m.id===id&&m.alive)||slot<0||slot>=c.slots.length)return false;const other=c.slots.indexOf(id),old=c.slots[slot];c.slots[slot]=id;if(other>=0&&other!==slot)c.slots[other]=old;return true;}

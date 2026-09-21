import {rng} from './rng.mjs';
import {centre,corridorWidth} from './landscape.mjs';
export function treeLayout(map){const r=rng(map.seed+1),trees=[];
 // species 0 broadleaf · 1 conifer · 2 low scrub · 3 bare dead trunk
 function add(x,z,edge=false){const shade=r(),species=edge?(shade<.42?2:shade<.78?0:1):(shade<.36?1:shade<.72?0:shade<.9?2:3),size=edge?.62+r()*.4:1;
  const emergent=species!==2&&r()<.14?1.55+r()*.35:1;
  const height=(species===1?5.8+r()*3.2:species===2?1.7+r()*1.5:species===3?5+r()*2.6:4.4+r()*2.9)*size*emergent;
  const radius=(species===1?1.15+r()*.55:species===2?1.25+r()*.75:species===3?.55+r()*.3:1.15+r()*.75)*size*(emergent>1?1.35:1);
  trees.push({id:trees.length,x,z,species,height,radius,shade,hp:100,burn:0,dead:false});}
 for(let z=-map.depth/2+1;z<map.depth/2;z+=2.05)for(let x=-map.width/2+1;x<map.width/2;x+=2.05){const xx=x+(r()-.5)*1.2,zz=z+(r()-.5)*1.2,edge=Math.abs(xx-centre(zz,map))-corridorWidth(zz,map);if(edge<0)continue;add(xx,zz,edge<2.3);}
 // islands of trees standing in the open ground, so the corridor is never one clear lane
 for(const [x,z] of [[-3.8,5.5],[-4.6,6.4],[3.8,-9],[4.7,-10.5],[-5.6,-22],[2.6,3.4],[3.7,2.2],[2.2,1.5],[-3.2,-15.4],[-2.2,-16.3],[5.2,20.5],[4.2,21.6],[-4.9,27]])add(x,z,true);
 return trees;
}
export function createGrid(map,trees,cover=map.cover||[]){
 const width=map.width,depth=map.depth,blocked=new Uint8Array(width*depth);
 const index=(x,z)=>{const xx=Math.floor(x+width/2),zz=Math.floor(z+depth/2);return xx<0||zz<0||xx>=width||zz>=depth?-1:zz*width+xx;};
 const point=i=>({x:i%width-width/2+.5,z:Math.floor(i/width)-depth/2+.5});
 const neighbours=i=>{const x=i%width,z=Math.floor(i/width);return [x>0?i-1:-1,x<width-1?i+1:-1,z>0?i-width:-1,z<depth-1?i+width:-1].filter(n=>n>=0);};
 function rebuild(){blocked.fill(0);for(const t of [...trees,...cover]){if(t.dead)continue;for(let z=Math.floor(t.z-1);z<=Math.ceil(t.z+1);z++)for(let x=Math.floor(t.x-1);x<=Math.ceil(t.x+1);x++){const i=index(x,z);if(i>=0){const p=point(i);if(Math.hypot(p.x-t.x,p.z-t.z)<(t.radius||1)*.7+.45)blocked[i]=1;}}}}
 function nearest(x,z){let i=index(Math.max(-width/2,Math.min(width/2-.01,x)),Math.max(-depth/2,Math.min(depth/2-.01,z)));if(!blocked[i])return i;const seen=new Set([i]),q=[i];for(let j=0;j<q.length;j++)for(const n of neighbours(q[j])){if(seen.has(n))continue;if(!blocked[n])return n;seen.add(n);q.push(n);}return -1;}
 function flow(x,z){const target=nearest(x,z),dist=new Int32Array(width*depth).fill(-1);if(target<0)return {target,dist};dist[target]=0;const q=[target];for(let j=0;j<q.length;j++)for(const n of neighbours(q[j]))if(!blocked[n]&&dist[n]<0){dist[n]=dist[q[j]]+1;q.push(n);}return {target,dist};}
 function route(from,x,z){const f=flow(x,z);let i=index(from.x,from.z);if(i<0||f.dist[i]<0)return [];const path=[];while(i!==f.target){const n=neighbours(i).find(n=>f.dist[n]===f.dist[i]-1);if(n===undefined)break;i=n;path.push(point(i));}return path;}
 rebuild();return {width,depth,blocked,index,point,nearest,neighbours,flow,route,rebuild};
}

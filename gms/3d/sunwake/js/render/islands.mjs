import * as THREE from 'three';
import {SHORE_TOP,SHORE_BOTTOM,APRON_TOP} from '../core/world.mjs';
import {islandField,TERRACE_EDGES,saturate,smoothstep} from '../core/island-shape.mjs';
import {MARINE_LIMITS,SETTLEMENT_LIMITS,ISLAND_VISIBILITY,AERIAL} from '../core/visual-config.mjs';
import {HORIZON_FADE,QUALITY} from '../core/config.mjs';
import {createSettlementGeometry} from './settlements.mjs';
import {skyGLSL,waveGLSL} from './shaders.mjs';
// One merged, flat-shaded, vertex-coloured mesh per island: one draw each.
// Nothing above water may sit outside the collision circle, so every radial
// variation only ever cuts inward. The wall touches `radius` wherever its
// vertical fluting is at zero relief, so shore contact still looks honest.
//
// TASKS D1: the old build was a stack of concentric discs — a wedding cake.
// This one is a heightfield over the disc instead. Terraces are contours of a
// 2-D noise field put through a piecewise-linear step curve, so no two rims
// share a centre; treads tilt; one seeded sector has no terrace at all.
const BASE_COLOURS={
  wet:new THREE.Color('#7e8b83'),
  wall:new THREE.Color('#f3e4c3'),
  lip:new THREE.Color('#fcf2da'),
  stone:new THREE.Color('#dcb98d'),
  riser:new THREE.Color('#9a7150'),
  shade:new THREE.Color('#877b99'),
  green:new THREE.Color('#526b50'),
  moss:new THREE.Color('#6d7f52'),
};
export const ISLAND_LOD=Object.freeze([
  Object.freeze({segments:96,rings:9,bands:4,plants:1}),
  Object.freeze({segments:48,rings:5,bands:3,plants:.55}),
  Object.freeze({segments:24,rings:5,bands:2,plants:0}),
]);

export function createIslandGeometry(island,lod=0,plantLimit=240){
  const detail=ISLAND_LOD[Math.max(0,Math.min(ISLAND_LOD.length-1,lod|0))];
  // Seeded geology, shared by every LOD; authored Cinder keeps its iron colour.
  const geology=island.landmark==='Cinder Steps'?1:(island.seed>>>5)%4;
  const rock=[['#e2ccaa','#f7e9cd','#9e795b','#596c5b'],
    ['#ae6d4e','#dfad78','#744639','#465c50'],
    ['#697879','#a5ad9f','#414f55','#405b52'],
    ['#c2b8a1','#eee4cb','#817c71','#657555']][geology];
  const COLOURS={...BASE_COLOURS,stone:new THREE.Color(rock[0]),wall:new THREE.Color(rock[0]),
    lip:new THREE.Color(rock[1]),riser:new THREE.Color(rock[2]),wet:new THREE.Color(rock[3])};
  const AS=detail.segments;
  const field=islandField(island,{harbour:true}),{R,peak,wallRadius,wallTop,notch,stain,heightAt}=field;
  const positions=[],colours=[],temp=new THREE.Color();
  // Rings run counter-clockwise in (x,z); with Y up that makes (a,c,b) the
  // outward/upward face. Getting this backwards renders the near wall invisible
  // and you look straight through the island at the sea inside it.
  const push=(a,b,c,colour,tint=0)=>{
    temp.copy(colour);if(tint)temp.lerp(COLOURS.shade,tint);
    for(const p of [a,c,b]){positions.push(p[0],p[1],p[2]);colours.push(temp.r,temp.g,temp.b);}
  };
  const quad=(a,b,c,d,colour,tint=0)=>{push(a,b,c,colour,tint);push(a,c,d,colour,tint);};
  const angleAt=i=>i/AS*Math.PI*2;
  const at=(a,r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];

  // Submerged decorative apron, entirely below the lowest trough.
  for(let i=0;i<AS;i++){
    const a=angleAt(i),b=angleAt(i+1);
    const o=R+4*(.5+.5*Math.sin(2*a+.7)),o2=R+4*(.5+.5*Math.sin(2*b+.7));
    quad(at(a,wallRadius(a),APRON_TOP),at(a,o,SHORE_BOTTOM),at(b,o2,SHORE_BOTTOM),at(b,wallRadius(b),APRON_TOP),COLOURS.shade,.35);
  }

  // The solid wall. Still a cylinder at the collision radius, but fluted
  // inward, undercut at the waterline, and with a wandering top edge between
  // SHORE_TOP (the hard floor — no crest may ever expose a gap) and +3.5 m.
  const wallProfile=a=>{
    const wr=wallRadius(a),n=notch(a),top=wallTop(a),st=stain(a);
    const levels=[[SHORE_BOTTOM,wr,COLOURS.wet],[-.55,wr-.35*n,COLOURS.wet],[st,wr-n,COLOURS.wet],
      [st+(top-st)*.62,wr-.35*n,COLOURS.wall],[top-.22-.34*(.5+.5*Math.sin(7*a+1.9)),wr-.10*n,COLOURS.wall],[top,wr,COLOURS.lip]];
    return detail.bands>=4?levels:detail.bands===3?[levels[0],levels[2],levels[3],levels[5]]:[levels[0],levels[5]];
  };
  for(let i=0;i<AS;i++){
    const a=angleAt(i),b=angleAt(i+1),pa=wallProfile(a),pb=wallProfile(b);
    // Grooves are darker than the ribs between them, which is what makes the
    // fluting read at all on a face the sun never reaches.
    const groove=field.flute(a)/.60;
    const grain=.34*(.5+.5*Math.sin(23*a+.9))+.22*(.5+.5*Math.sin(11*a-2.4))+.16*(.5+.5*Math.sin(53*a+.3));
    for(let l=0;l<pa.length-1;l++)
      quad(at(a,pa[l][1],pa[l][0]),at(b,pb[l][1],pb[l][0]),at(b,pb[l+1][1],pb[l+1][0]),at(a,pa[l+1][1],pa[l+1][0]),
        pa[l+1][2],(pa[l+1][2]===COLOURS.wet?.22:.30)*(.22+.78*groove)+.16*grain);
  }

  // Terrain: a heightfield over the disc. Rings are placed per bearing, with a
  // tight pair either side of each terrace contour, so a terrace edge is a
  // near-vertical face whose plan shape wanders with the noise instead of a
  // lathe-turned circle. Ring 0 is exactly the wall top: rim and wall share it.
  const SMAX=.985,DU=.008,LEDGE=.030;
  // Far LOD used to collapse the terrain to a single cone from the wall top to
  // the summit, which is why two islands 900 m off looked like the same smudge:
  // they literally were the same triangle fan. It now runs the coarse ring
  // scheme, so the far skyline is the island's own heightfield — its ridges,
  // its cliff sector, its lopsided summit. 24 segments x 7 rings.
  const edgesUsed=lod>=1?TERRACE_EDGES.slice(0,2):TERRACE_EDGES;
  const treads=lod===0?1:0,summits=lod===0?2:1;
  const RINGS=2+edgesUsed.length*(treads+2)+summits;
  const riserBand=new Array(RINGS-1).fill(false);
  for(let e=0;e<edgesUsed.length;e++)riserBand[2+e*(treads+2)+treads]=true;
  const edgeScratch=[],stations=[];
  function buildStations(a){
    const w=field.terraceWeight(a),edges=field.edgeStations(a,edgeScratch);
    stations.length=0;stations.push(0,LEDGE);
    let prev=LEDGE;
    for(let e=0;e<edgesUsed.length;e++){
      const c=Math.min(SMAX,Math.max(prev+2*DU+1e-3,edges[e]));
      for(let t=1;t<=treads;t++)stations.push(prev+(c-DU-prev)*t/(treads+1));
      stations.push(c-DU,c+DU);prev=c+DU;
    }
    for(let t=1;t<=summits;t++)stations.push(prev+(SMAX-prev)*t/summits);
    // Fade to even spacing across the un-terraced face, so the two schemes meet
    // without a crack and the cliff sector has no step in it.
    for(let k=0;k<RINGS;k++){
      const even=Math.pow(k/(RINGS-1),1.15)*SMAX;
      stations[k]=even+(stations[k]-even)*(w/.92);
    }
    for(let k=1;k<RINGS;k++)stations[k]=Math.max(stations[k],stations[k-1]+1e-4);
    return stations;
  }
  {
  const rings=[];for(let k=0;k<RINGS;k++)rings.push([]);
  for(let i=0;i<AS;i++){
    const a=angleAt(i),wr=wallRadius(a),cos=Math.cos(a),sin=Math.sin(a);
    buildStations(a);
    for(let k=0;k<RINGS;k++){
      const r=wr*(1-stations[k]),x=cos*r,z=sin*r;
      rings[k].push([x,k===0?wallTop(a):heightAt(x,z),z]);
    }
  }
  const summit=heightAt(0,0);
  const shade=y=>saturate((y-SHORE_TOP)/Math.max(peak-SHORE_TOP,1e-6));
  for(let k=0;k<RINGS-1;k++)for(let i=0;i<AS;i++){
    const j=(i+1)%AS,o=rings[k],n=rings[k+1];
    const rise=Math.max(Math.abs(n[i][1]-o[i][1]),Math.abs(n[j][1]-o[j][1]));
    const run=Math.hypot(n[i][0]-o[i][0],n[i][2]-o[i][2])+1e-6;
    const steep=riserBand[k]?smoothstep(.35,1.1,rise/run):0;
    const lift=shade(o[i][1]),mottle=field.mottle(o[i][0],o[i][2]);
    // Level tread = weathered scrub over pale rock; steep = bare shadowed riser.
    const scrub=saturate(.55+.9*mottle)*(1-steep);
    temp.copy(COLOURS.stone).lerp(COLOURS.riser,steep).lerp(COLOURS.lip,(1-steep)*(.42*lift+.12)).lerp(COLOURS.moss,.38*scrub);
    quad(o[i],o[j],n[j],n[i],temp,.05+.26*steep+.12*lift+.06*mottle);
  }
  const last=rings[RINGS-1];
  for(let i=0;i<AS;i++)push(last[i],last[(i+1)%AS],[0,summit,0],COLOURS.lip,.10+.14*shade(last[i][1]));

  }

  // One readable crown feature per profile, seated on the actual terrain.
  const crownAngle=field.rnd()*Math.PI*2,crownReach=R*.10*field.rnd();
  const cx=Math.cos(crownAngle)*crownReach,cz=Math.sin(crownAngle)*crownReach;
  const base=heightAt(cx,cz)-.5;
  const ring=(n,r,y)=>{const out=[];for(let s=0;s<n;s++){const a=s/n*Math.PI*2;out.push([cx+Math.cos(a)*r,y,cz+Math.sin(a)*r]);}return out;};
  // Authored crowns survive every terrain LOD and stay well inside the shore.
  const brass=new THREE.Color('#c49b51'),dark=new THREE.Color('#445b48'),ember=new THREE.Color('#ffd185');
  function column(x,z,y,r0,r1,h,colour,n=8){
    const lower=[],upper=[];
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;lower.push([x+Math.cos(a)*r0,y,z+Math.sin(a)*r0]);upper.push([x+Math.cos(a)*r1,y+h,z+Math.sin(a)*r1]);}
    for(let k=0;k<n;k++){const j=(k+1)%n;quad(lower[k],lower[j],upper[j],upper[k],colour,.12*(k%3));push(upper[k],upper[j],[x,y+h,z],colour);}
  }
  function block(x,z,y,w,d,h,colour){
    const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2];
    const top=p=>[p[0],p[1]+h,p[2]],ring=[a,b,c,e];
    for(let k=0;k<4;k++)quad(ring[k],ring[(k+1)%4],top(ring[(k+1)%4]),top(ring[k]),colour);
    quad(top(a),top(b),top(c),top(e),colour);
  }
  if(island.landmark==='Lantern Key'){
    column(cx,cz,base,2.7,2.1,9,COLOURS.lip);column(cx,cz,base+9,3.1,3.1,.7,COLOURS.wall);
    column(cx,cz,base+9.7,1.6,1.6,2,ember);column(cx,cz,base+11.7,3,0,1.6,brass);
  }else if(island.landmark==='Bell Garden'){
    for(const x of [-6,6])column(cx+x,cz,base,1,1,9,COLOURS.lip,6);
    block(cx,cz,base+8.5,15,2,1.2,COLOURS.lip);
    for(let k=0;k<3;k++){const x=cx+(k-1)*4,y=base+4.5+(k%2)*.8;column(x,cz,y+1.5,.14,.14,2.5-(k%2)*.8,brass,5);column(x,cz,y,1.4,.55,2,brass);column(x,cz,y-.5,.25,.25,1,brass,5);}
  }else if(island.landmark==='Split Crown'){
    for(const [x,h]of [[-4,17],[4.5,20]])column(cx+x,cz,base,3.2,.9,h,COLOURS.lip,5);
  }else if(island.landmark==='Cinder Steps'){
    const rust=new THREE.Color('#b5683f');
    for(let k=0;k<3;k++)column(cx,cz,base+k*1.1,5-k,5-k,1.1,rust,7);
    column(cx,cz,base+3.3,1.5,2.8,1.2,brass,7);column(cx,cz,base+4.5,1.8,0,3.8,ember,5);
  }else if(island.landmark==='White Needle'){
    column(cx,cz,base,2.6,.12,24,COLOURS.lip,7);
  }else if(island.landmark==='Last Orchard'){
    column(cx,cz,base,2.6,1.3,3,COLOURS.stone,6);
    for(let k=0;k<6;k++){const a=k/6*Math.PI*2,x=cx+Math.cos(a)*8,z=cz+Math.sin(a)*8,y=heightAt(x,z)-.2;
      column(x,z,y,.45,.35,3,COLOURS.riser,5);
      const n=6;for(let j=0;j<n;j++){const a=j/n*Math.PI*2,b=(j+1)/n*Math.PI*2;push([x+Math.cos(a)*1.65,y+1,z+Math.sin(a)*1.65],[x+Math.cos(b)*1.65,y+1,z+Math.sin(b)*1.65],[x-2.4,y+10,z],dark,.1*(j%3));}
    }
  }else if(island.profile==='mesa'){                                   // a squat stone tower
    const n=lod===2?6:8,h=island.height*.55+3,lower=ring(n,2.2,base),upper=ring(n,1.7,base+h);
    for(let s=0;s<n;s++){const t=(s+1)%n;quad(lower[s],lower[t],upper[t],upper[s],COLOURS.lip,.10+.30*(s%2));
      push(upper[s],upper[t],[cx,base+h+1.1,cz],COLOURS.wall,.2);}
  }else if(island.profile==='split'){                            // a leaning spire
    const h=island.height*.9+4,lower=ring(7,2.6,base),tip=[cx+Math.cos(crownAngle)*1.4,base+h,cz+Math.sin(crownAngle)*1.4];
    for(let s=0;s<7;s++)push(lower[s],lower[(s+1)%7],tip,COLOURS.lip,.08+.34*(s%3)/2);
  }else{                                                         // a cairn
    for(let s=0;s<(lod===2?2:4);s++){
      const n=lod===2?4:6,r0=2.4-s*.5,y=base+s*1.05,lower=ring(n,r0,y),upper=ring(n,r0*.8,y+.95);
      for(let k=0;k<n;k++){const t=(k+1)%n;quad(lower[k],lower[t],upper[t],upper[k],COLOURS.stone,.12+.26*(k%2));}
    }
  }

  // Offset sea stacks and tilted fins break ordinary skylines, even at far LOD.
  // Their footprints stay deep inside the solid shore circle.
  if(!island.landmark){
    const count=island.profile==='split'?3:island.profile==='mesa'?2:1;
    for(let i=0;i<count;i++){
      const a=crownAngle+i*2.1,reach=R*(.28+i*.07),x=Math.cos(a)*reach,z=Math.sin(a)*reach;
      const y=heightAt(x,z)-1,h=peak*(island.profile==='split'?.65:.32)*(1-i*.16);
      const lower=[],upper=[];
      for(let k=0;k<5;k++){const t=k/5*Math.PI*2;lower.push([x+Math.cos(t)*3,y,z+Math.sin(t)*2]);upper.push([x+Math.cos(t)*1.1+1.8,y+h,z+Math.sin(t)*.85]);}
      for(let k=0;k<5;k++){const j=(k+1)%5;quad(lower[k],lower[j],upper[j],upper[k],COLOURS.stone,.08+k*.035);push(upper[k],upper[j],[x+1.8,y+h+.5,z],COLOURS.lip);}
    }
  }

  // A few weathered outcrops, so the plateau is broken rock rather than a lawn.
  const outcrops=detail.plants>0?Math.round(3+R/22):0;
  for(let i=0;i<outcrops;i++){
    const a=field.rnd()*Math.PI*2,reach=R*(.18+field.rnd()*.52);
    const ox=Math.cos(a)*reach,oz=Math.sin(a)*reach,ground=heightAt(ox,oz)-.3;
    const rx=1.4+field.rnd()*2.6,h=1.1+field.rnd()*2.4,spin=field.rnd()*Math.PI;
    const lower=[],upper=[];
    for(let k=0;k<5;k++){
      const t=spin+k/5*Math.PI*2,rr=rx*(.7+.5*Math.sin(3*t+a));
      lower.push([ox+Math.cos(t)*rr,ground,oz+Math.sin(t)*rr]);
      upper.push([ox+Math.cos(t)*rr*.55,ground+h,oz+Math.sin(t)*rr*.62]);
    }
    for(let k=0;k<5;k++){const t=(k+1)%5;quad(lower[k],lower[t],upper[t],upper[k],COLOURS.lip,.14+.26*(k%2));
      push(upper[k],upper[t],[ox,ground+h+.35,oz],COLOURS.stone,.10);}
  }

  // Wave-worn talus teeth interrupt the rim without extending the collider.
  if(lod<2)for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2+(island.seed%23)*.11,r=R-2.4;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,y=wallTop(a)-.8,h=1.2+1.9*(.5+.5*Math.sin(i*7.3+crownAngle));
    column(x,z,y,1.6,.65,h,COLOURS.stone,5);
  }

  // Sparse olive scrub and leaning cypresses, all well inside the wall.
  const plants=island.landmark==='Last Orchard'?0:Math.min(plantLimit,Math.round((9+R/3.2)*detail.plants));
  for(let i=0;i<plants;i++){
    const angle=field.rnd()*Math.PI*2,reach=R*(.12+field.rnd()*.58);
    const x=Math.cos(angle)*reach,z=Math.sin(angle)*reach,ground=heightAt(x,z)-.4;
    const cypress=field.rnd()<.42,lean=(field.rnd()-.5)*.35;
    const height=cypress?2.2+field.rnd()*2.6:.8+field.rnd()*.9,width=cypress?.45+field.rnd()*.2:.9+field.rnd()*.7;
    const tip=[x+lean*height,ground+height,z+lean*height*.6],tint=field.rnd()*.3;
    for(let s=0;s<5;s++){
      const a=s/5*Math.PI*2,b=(s+1)/5*Math.PI*2;
      push([x+Math.cos(a)*width,ground,z+Math.sin(a)*width],[x+Math.cos(b)*width,ground,z+Math.sin(b)*width],tip,cypress?COLOURS.green:COLOURS.moss,tint);
    }
  }

  const settlement=createSettlementGeometry(island,lod),rockVertices=positions.length/3;
  const glow=new Float32Array(rockVertices+settlement.attributes.position.count);
  glow.set(settlement.attributes.glow.array,rockVertices);
  // 1 on every settlement vertex, 0 on rock. The aerial-perspective pass in
  // createIslandMaterial uses it to hold roofs, walls and the harbour mast back
  // from the silhouette treatment, so a far island keeps readable structure.
  const built=new Float32Array(glow.length).fill(1,rockVertices);
  for(const v of settlement.attributes.position.array)positions.push(v);
  for(const v of settlement.attributes.color.array)colours.push(v);
  const settlementTriangles=settlement.userData.triangles;settlement.dispose();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('glow',new THREE.BufferAttribute(glow,1));
  geometry.setAttribute('built',new THREE.BufferAttribute(built,1));
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData={triangles:positions.length/9,settlementTriangles,lod,ornaments:plants+(island.landmark==='Last Orchard'?6:0)};
  return geometry;
}

// D2: the water fades to skyColor(horizontal) over HORIZON_FADE, in linear
// space before tone mapping. THREE.Fog is a flat colour applied after tone
// mapping, so an island fading with it left a visible straight seam against
// the sea. Islands now run the identical fade, from the identical constants.
export function createIslandMaterial(skyUniforms,waterUniforms){
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,flatShading:true});
  material.fog=false;
  material.onBeforeCompile=shader=>{
    for(const key of ['uSun','uHorizon','uZenith','uHaze','uSunColor','uCloud','uCloudTime','uCloudEnabled','uWeather'])shader.uniforms[key]=skyUniforms[key];
    if(waterUniforms){shader.uniforms.uPhases=waterUniforms.uPhases;shader.uniforms.uCenter=waterUniforms.uCenter;}
    shader.vertexShader='attribute float glow;attribute float built;varying float vGlow;varying float vBuilt;varying vec3 vShoreWorld;varying vec3 vRockLocal;\n'+shader.vertexShader
      .replace('#include <project_vertex>',`#include <project_vertex>
        vec4 rockPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
        rockPosition=instanceMatrix*rockPosition;
        #endif
        vShoreWorld=(modelMatrix*rockPosition).xyz;vRockLocal=position;vGlow=glow;vBuilt=built;`);
    shader.fragmentShader='varying float vGlow;varying float vBuilt;varying vec3 vShoreWorld;varying vec3 vRockLocal;\n'+skyGLSL+(waterUniforms?'uniform vec2 uCenter;\n'+waveGLSL:'')+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        float grain=sin(vRockLocal.y*5.8+sin(vRockLocal.x*.47)*2.+sin(vRockLocal.z*.41)*2.);
        diffuseColor.rgb*=.97+.03*grain;
        ${waterUniforms?`if(vShoreWorld.y<2.){float wetHeight=waveSurface(vShoreWorld.xz,vShoreWorld.xz-uCenter,true).x;
        float wash=1.-smoothstep(wetHeight+.05,wetHeight+.55,vShoreWorld.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,.65,.66),wash*.65);}`:''}
      `)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n totalEmissiveRadiance+=vColor*vGlow;`)
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
  vec3 shoreRay=vec3(vShoreWorld.x-cameraPosition.x,0.,vShoreWorld.z-cameraPosition.z);
  float range=length(shoreRay);
  float elevated=smoothstep(1.6,5.0,vRockLocal.y);
  // AERIAL PERSPECTIVE, in the order it happens in air. Land this far away is
  // BACKLIT: its own surface loses its diffuse lift and cools toward a dark
  // silhouette a long way before the airlight bleaches it out. The first build
  // went straight to the airlight, which is why a 900 m island measured 170.6
  // mean luminance against a 173.0 sky and simply was not there. Withheld from
  // the waterline (elevated), so the sea haze still meets the rock exactly
  // where D2 put it and no seam comes back.
  float aerial=elevated*smoothstep(${AERIAL.range[0].toFixed(1)},${AERIAL.range[1].toFixed(1)},range);
  vec3 lit=gl_FragColor.rgb;
  float grey=dot(lit,vec3(.299,.587,.114));
  // Roofs, walls and the harbour mast keep most of their own colour and most of
  // their brightness: the island goes to silhouette, the settlement stays a set
  // of marks ON it. That is what reads as structure rather than as a smudge.
  vec3 keep=mix(lit,vec3(grey),1.-mix(${AERIAL.chroma.toFixed(3)},${AERIAL.builtChroma.toFixed(3)},vBuilt));
  // Rock whose bearing is near the sun keeps an ember cast; rock away from it
  // goes blue-violet. Two far islands on different bearings are then different
  // colours, not the same grey lozenge.
  float sunward=pow(max(dot(normalize(shoreRay),normalize(vec3(uSun.x,0.,uSun.z))),0.),3.);
  vec3 cool=vec3(${AERIAL.cool.map(v=>v.toFixed(3)).join(',')}),warm=vec3(${AERIAL.warm.map(v=>v.toFixed(3)).join(',')});
  gl_FragColor.rgb=mix(lit,keep*mix(cool,warm,sunward),aerial*${AERIAL.strength.toFixed(3)}*(1.-${AERIAL.built.toFixed(3)}*vBuilt));
  // Warm top-light on upward faces. Flat-shaded, so the world normal straight
  // off the screen derivatives is the exact face normal, no extra varying.
  vec3 faceNormal=normalize(cross(dFdx(vShoreWorld),dFdy(vShoreWorld)));
  faceNormal*=sign(dot(faceNormal,cameraPosition-vShoreWorld)+1e-6);
  gl_FragColor.rgb+=uSunColor*(aerial*${AERIAL.crest.toFixed(3)}*smoothstep(.25,.90,faceNormal.y));
  float coastFade=smoothstep(${HORIZON_FADE[0].toFixed(1)},${HORIZON_FADE[1].toFixed(1)},range);
  float skylineFade=.30*smoothstep(${ISLAND_VISIBILITY.fadeStart.toFixed(1)},900.0,range)
    +.70*smoothstep(940.0,${ISLAND_VISIBILITY.fadeEnd.toFixed(1)},range);
  // Waterline still reaches the exact sea haze; elevated roofs/crowns stay legible.
  float islandFade=mix(coastFade,skylineFade,elevated);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,skyColor(normalize(shoreRay),false),islandFade);`);
  };
  return material;
}

// M5 streaming. Build within 1,000 m nearest-first, evict past 1,150 m, at most
// two work items and 2 ms of mesh building per frame, three LOD tiers with
// hysteresis, and a bounded geometry pool so sailing a circuit does not rebuild.
// Pending meshes never mean pending colliders: collision reads world.queryIslands
// directly and does not know this module exists.
export const BUILD_RANGE=1000,EVICT_RANGE=1150,LOD_EDGES=[160,420],LOD_HYSTERESIS=24,GEOMETRY_POOL=40;
const now=()=>(typeof performance!=='undefined'?performance.now():Date.now());

export function createIslandsView(world,skyUniforms,options={}){
  const budget=options.budget??2,maxItems=options.items??2;
  const build=options.build??BUILD_RANGE,evict=options.evict??EVICT_RANGE;
  const group=new THREE.Group(),material=createIslandMaterial(skyUniforms,options.waterUniforms);
  const live=new Map();                 // island id -> {island,mesh,lod,triangles}
  const pool=new Map();                 // "id@lod" -> geometry, insertion-ordered
  const queue=[],list=[];
  let triangles=0,built=0,evictions=0,lastBuild=0,pending=0,tier='standard';

  const poolKey=(island,lod,plants)=>island.id+'@'+lod+'@'+plants;
  function takeGeometry(island,lod,plants){
    const key=poolKey(island,lod,plants),cached=pool.get(key);
    if(cached){pool.delete(key);return cached;}
    const start=now();
    const geometry=createIslandGeometry(island,lod,plants);geometry.userData.plantLimit=plants;
    lastBuild=now()-start;built++;
    return geometry;
  }
  function recycle(island,lod,geometry){
    pool.set(poolKey(island,lod,geometry.userData.plantLimit),geometry);
    while(pool.size>GEOMETRY_POOL){
      const oldest=pool.keys().next().value;
      pool.get(oldest).dispose();pool.delete(oldest);
    }
  }
  function lodFor(gap,current){
    let lod=0;
    for(let i=0;i<LOD_EDGES.length;i++){
      // An island already at the coarser tier holds it until it comes a full
      // hysteresis band closer. Widening the edge instead makes it oscillate.
      if(gap>LOD_EDGES[i]-(current!==undefined&&current>i?LOD_HYSTERESIS:0))lod=i+1;
    }
    return lod;
  }
  function drop(entry){
    group.remove(entry.mesh);triangles-=entry.triangles;
    recycle(entry.island,entry.lod,entry.mesh.geometry);
  }
  function install(island,lod,plants){
    const existing=live.get(island.id);
    if(existing)drop(existing);
    const geometry=takeGeometry(island,lod,plants);
    const mesh=existing?existing.mesh:new THREE.Mesh(geometry,material);
    mesh.geometry=geometry;mesh.frustumCulled=true;
    mesh.userData={island,lod};
    const entry={island,mesh,lod,plants,triangles:geometry.userData.triangles};
    live.set(island.id,entry);group.add(mesh);triangles+=entry.triangles;
    return entry;
  }
  function place(entry,origin){entry.mesh.position.set(entry.island.x-origin.x,0,entry.island.z-origin.z);}

  return {group,material,setQuality(value){tier=value;},
    get triangles(){return triangles;},get meshes(){return [...live.values()].map(e=>e.mesh);},
    get count(){return live.size;},get pending(){return pending;},
    stats(){const all=[...pool.values(),...[...live.values()].map(e=>e.mesh.geometry)];return {geometryBytes:all.reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0),0),ornaments:[...live.values()].filter(e=>e.mesh.visible).reduce((n,e)=>n+e.mesh.geometry.userData.ornaments,0),islands:live.size,triangles,pending,built,evictions,pooled:pool.size,lastBuildMs:lastBuild,
      lods:[...live.values()].reduce((n,e)=>{n[e.lod]=(n[e.lod]||0)+1;return n;},[0,0,0])};},
    update(origin,x=origin.x,z=origin.z){
      const near=world.nearby(x,z,build,list);
      for(const [id,entry] of live){
        if(Math.hypot(entry.island.x-x,entry.island.z-z)-entry.island.radius<=evict)continue;
        drop(entry);live.delete(id);evictions++;
      }
      queue.length=0;
      let ornaments=QUALITY[tier].ornaments;
      for(const island of near){
        const entry=live.get(island.id);
        const lod=lodFor(Math.hypot(island.x-x,island.z-z)-island.radius,entry?.lod);
        const reserved=island.landmark==='Last Orchard'?6:0;
        const plants=tier==='emergency'?0:Math.min(Math.max(0,ornaments-reserved),lod===2?0:Math.round((9+island.radius/3.2)*ISLAND_LOD[lod].plants));ornaments-=plants+reserved;
        if(!entry||entry.lod!==lod||entry.plants!==plants)queue.push({island,lod,plants});
      }
      pending=queue.length;
      const start=now();
      for(let done=0;done<queue.length&&done<maxItems;done++){
        if(done>0&&now()-start>=budget)break;              // always land one item
        install(queue[done].island,queue[done].lod,queue[done].plants);pending--;
      }
      // Fully hazed islands need no draw. Bounds also protect pathological dense fixtures.
      let draws=0,visiblePlants=0,visibleTriangles=0;
      const ordered=[...live.values()].sort((a,b)=>Math.hypot(a.island.x-x,a.island.z-z)-Math.hypot(b.island.x-x,b.island.z-z));
      for(const entry of ordered){place(entry,origin);const gap=Math.hypot(entry.island.x-x,entry.island.z-z)-entry.island.radius;
        entry.mesh.visible=gap<ISLAND_VISIBILITY.range&&draws<QUALITY[tier].drawCap-12&&visiblePlants+entry.mesh.geometry.userData.ornaments<=QUALITY[tier].ornaments&&visibleTriangles+entry.triangles<QUALITY[tier].triangleCap-QUALITY[tier].segments*(2*QUALITY[tier].bands.reduce((n,b)=>n+b[0],0)-1)-MARINE_LIMITS[tier].reserve-SETTLEMENT_LIMITS[tier].reserve;
        if(entry.mesh.visible){draws++;visiblePlants+=entry.mesh.geometry.userData.ornaments;visibleTriangles+=entry.triangles;}
      }
      return pending;
    },
    dispose(){
      for(const entry of live.values()){group.remove(entry.mesh);entry.mesh.geometry.dispose();}
      for(const geometry of pool.values())geometry.dispose();
      live.clear();pool.clear();material.dispose();triangles=0;
    }};
}

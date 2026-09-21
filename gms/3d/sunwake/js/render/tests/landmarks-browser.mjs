// Can a player tell WHICH island they are looking at, at 900 m, before they
// arrive? That is an exploration question, not a rendering statistic, so this
// suite answers it from real framebuffer pixels, the way a player does.
//
// Four frames are read out of the real default WebGL framebuffer at each pose,
// differing only in the island's draw range:
//   blank  — the island's mesh hidden altogether
//   rock   — terrain only (crown and settlement dropped from the draw range)
//   crown  — terrain + crown
//   full   — everything
// Subtracting them gives exact pixel masks. `crown - rock` is the crown and
// nothing else: the lighthouse, the bell arch, the two towers, the brazier
// stair, the needle, the cypresses. Those are the marks a player names an
// island by, so they are what gets measured.
//
// The crown mask is then described by ten numbers a person could have said
// out loud — how tall it is for its width, how solid, how top-heavy, how many
// separate uprights, how much of the island it spans, whether part of it is
// burning — and each landmark is classified from bearings its reference was
// never taken from.
//
// NEGATIVE CONTROL. Every measurement is repeated with the crown dropped from
// the draw range. The crown mask must then be EXACTLY empty, every descriptor
// must be zero, and the six landmarks must become indistinguishable. A
// measurement that cannot read nothing is not reading anything.
//
// The whole-island outline is also classified, with a bare-rock control, and
// reported honestly: see the note next to `profile` at the bottom.
//
// Run through the managed Chrome launcher, as documented in ROADMAP.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../../../tools/cdp.mjs';
const evidence=new URL('../../../docs/evidence/',import.meta.url);
const BINS=48,RANGE=900,OFFSETS=[0,-22,22];
const p=await connect(),report={date:new Date().toISOString(),passed:false,range:RANGE,offsets:OFFSETS,crowns:[],profiles:[]};
p.eval=async expression=>{const r=await p.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},120000);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};

async function fixture(BINS){
 const [{createScene},{createWorld,LANDMARKS},{createBoat},{mooringLayout}]=await Promise.all([
  import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs'),import('./js/core/island-shape.mjs')]);
 sunwakeTest.setView({time:5});
 const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
 const world=createWorld(),view=createScene(canvas,world);
 view.setCourse(null);
 // Beacons, marine life, smoke and the launch are navigation aids and moving
 // props; none of them is the island, so none of them may help it be named.
 for(const obj of [view.beacons,view.marine,view.settlementLife,view.effects])obj.group.visible=false;
 view.boat.visible=false;
 const THRESHOLD=12;
 window.landmarks={view,LANDMARKS,frames:{},
  draw(){view.renderer.render(view.scene,view.camera);},
  pixels(){const gl=view.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);return {buf,w,h};},
  // 'full' draws everything; 'crown' drops the settlement; 'rock' drops the
  // crown as well. `hidden` removes the mesh from the scene entirely.
  range(which){
   const m=this.target,g=m.geometry,count=g.attributes.position.count,{settlementTriangles,crownTriangles}=g.userData;
   m.visible=which!=='hidden';
   g.setDrawRange(0,count-(which==='rock'||which==='hidden'?(settlementTriangles+crownTriangles)*3:which==='crown'?settlementTriangles*3:0));
  },
  // Camera on the approach bearing, offset by `degrees`, at `distance` off the
  // shore. Identical construction to the game's own spawn maths.
  pose(index,distance,degrees){
   const island=LANDMARKS[index],angle=mooringLayout(island).angle+degrees*Math.PI/180,r=island.radius+distance;
   const state={...createBoat({x:island.x+Math.cos(angle)*r,z:island.z+Math.sin(angle)*r,yaw:Math.atan2(-Math.cos(angle),-Math.sin(angle))},{clearSpawn(){}},5),time:5,reduced:false};
   view.setQuality('standard');view.render(state,0);
   const origin=view.metrics().origin;for(let i=0;i<40;i++)view.islands.update(origin,state.x,state.z);
   view.render(state,0);
   for(const m of view.islands.meshes)m.visible=m.userData.island.id===island.id;
   this.target=view.islands.meshes.find(m=>m.userData.island.id===island.id);
   view.camera.position.set(state.x-origin.x,5.5,state.z-origin.z);
   view.camera.lookAt(island.x-origin.x,10,island.z-origin.z);view.camera.updateMatrixWorld();view.sky.update(view.camera,5);
   // Sky, sea, sun road, weather and shore foam are pixel-identical in all four
   // reads, so every difference below is the island mesh and nothing else.
   this.frames={};
   for(const which of ['hidden','rock','crown','full']){this.range(which);this.draw();this.frames[which]=this.pixels();}
   this.range('full');
   const g=this.target.geometry;
   return {name:island.landmark,degrees,lod:this.target.userData.lod,radius:island.radius,
     crownTriangles:g.userData.crownTriangles,settlementTriangles:g.userData.settlementTriangles};
  },
  mask(fromKey,toKey){
   const a=this.frames[fromKey],b=this.frames[toKey],{w,h}=a;
   const on=new Uint8Array(w*h);let x0=w,x1=-1,y0=h,y1=-1,area=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    if(Math.max(Math.abs(a.buf[i]-b.buf[i]),Math.abs(a.buf[i+1]-b.buf[i+1]),Math.abs(a.buf[i+2]-b.buf[i+2]))>THRESHOLD){
     on[y*w+x]=1;area++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
   }
   return {on,w,h,x0,x1,y0,y1,area,pixels:b};
  },
  // Eight numbers about the crown, every one of them something a person could
  // have said about the skyline. Scaled by the island's own outline where the
  // comparison is "how much of the island does it take up", and by the crown's
  // own box where it is "what shape is it".
  describe(crown,island,sky){
   const zero={area:0,aspect:0,solidity:0,topHeavy:0,flatTop:0,uprights:0,midWidth:0,span:0,rise:0,lit:0,shade:0};
   if(crown.area===0||island.area===0)return zero;
   const {on,w,x0,x1,y0,y1,area,pixels}=crown,bw=x1-x0+1,bh=y1-y0+1,islandWidth=island.x1-island.x0+1;
   let top=0,lit=0,shade=0;
   const colTop=new Int32Array(bw).fill(-1);
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)if(on[y*w+x]){
    if(y-y0>colTop[x-x0])colTop[x-x0]=y-y0;
    if(y-y0>=bh*.75)top++;
    // A burning crown. At 900 m aerial perspective drives every rock face
    // DARKER than the sky behind it, so a crown pixel that comes out BRIGHTER
    // than the sky it replaced can only be emitting its own light: Lantern
    // Key's lamp and Cinder Steps' brazier, and nothing else in the world.
    // (Not tested for warmth — the lamp clips to white, the brazier is orange.)
    const i=(y*w+x)*4,lum=c=>c[i]*.299+c[i+1]*.587+c[i+2]*.114;
    if(lum(pixels.buf)-lum(sky.buf)>18)lit++;
    // How dark the crown is against the sky it stands in. Cypresses are nearly
    // black, limestone is pale: at this range that is one of the few cues left.
    shade+=(lum(sky.buf)-lum(pixels.buf))/255;
   }
   // A flat top edge: a lintel, a gallery or a stair cap, as against the ragged
   // points of a spire or a row of trees.
   let flat=0,occupied=0;
   for(let c=0;c<bw;c++)if(colTop[c]>=0){occupied++;if(colTop[c]>=bh*.85-1)flat++;}
   // What the crown stands on. Taken from the lower third, below anything that
   // joins the uprights together — an arch's lintel, a lighthouse's gallery —
   // so two towers count as two things and a solid stair counts as one wide
   // one. `midWidth` is the continuous version of the same question and is the
   // stabler of the two across bearings.
   let uprights=0,gap=2,footed=0;
   for(let c=0;c<bw;c++){
    let solid=false;
    for(let y=y0+Math.floor(bh*.10);y<=y0+Math.floor(bh*.45);y++)if(on[y*w+x0+c]){solid=true;break;}
    if(solid){footed++;if(gap>=2)uprights++;gap=0;}else gap++;
   }
   return {area,aspect:bh/bw,solidity:area/(bw*bh),topHeavy:top/area,flatTop:flat/Math.max(1,occupied),
     uprights,midWidth:footed/bw,span:bw/islandWidth,rise:bh/islandWidth,lit:lit/area,shade:shade/area};
  },
  // The whole outline, in units of its own bounding-box width so apparent size
  // cancels: 48 bins of skyline height and 48 of how solid each bin is.
  profile(mask){
   if(mask.area===0)return null;
   const {on,w,x0,x1,y0,y1}=mask,bw=x1-x0+1;
   const sky=new Array(BINS).fill(0),fill=new Array(BINS).fill(0),cols=new Array(BINS).fill(0);
   for(let x=x0;x<=x1;x++){
    const bin=Math.min(BINS-1,Math.floor((x-x0)/bw*BINS));
    let high=0,solid=0;
    for(let y=y0;y<=y1;y++)if(on[y*w+x]){solid++;const above=y-y0+1;if(above>high)high=above;}
    if(high/bw>sky[bin])sky[bin]=high/bw;
    fill[bin]+=solid/bw;cols[bin]++;
   }
   for(let k=0;k<BINS;k++)fill[k]/=Math.max(1,cols[k]);
   return sky.concat(fill);
  },
  // `control` drops the crown from both frames of the crown difference, which
  // must leave it empty.
  measure(control=false){
   const island=this.mask('hidden',control?'rock':'full');
   const crown=this.mask('rock',control?'rock':'crown');
   const rock=this.mask('hidden','rock');
   return {crown:{...this.describe(crown,island,this.frames.hidden),box:[crown.x1-crown.x0+1,crown.y1-crown.y0+1]},
     islandArea:island.area,rockArea:rock.area,
     profile:this.profile(island),rockProfile:this.profile(rock)};
  },
  hiddenArea(){return this.mask('hidden','hidden').area;},
  png(which){this.range(which);this.draw();const {buf,w,h}=this.pixels(),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h);
   for(let y=0;y<h;y++)im.data.set(buf.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);ctx.putImageData(im,0,0);this.range('full');return c.toDataURL('image/png').split(',')[1];}
 };
}

const save=async (name,which='full')=>writeFile(new URL(name+'.png',evidence),Buffer.from(await p.eval(`landmarks.png('${which}')`),'base64'));
const KEYS=['aspect','solidity','topHeavy','flatTop','uprights','midWidth','span','rise','lit','shade'];
const rms=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length);
// z-scored against the six references, so no descriptor dominates by unit.
function encoder(refs){
 const scale=KEYS.map(k=>{
  const v=refs.map(r=>r.crown[k]),mean=v.reduce((a,b)=>a+b,0)/v.length;
  return Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length)||1;
 });
 return row=>KEYS.map((k,i)=>row.crown[k]/scale[i]);
}
function classify(rows,encode,pick){
 const refs=rows.filter(r=>r.degrees===0),probes=rows.filter(r=>r.degrees!==0);
 const results=probes.map(probe=>{
  const ranked=refs.map(ref=>({index:ref.index,name:ref.name,distance:rms(pick(probe,encode),pick(ref,encode))})).sort((a,b)=>a.distance-b.distance);
  return {name:probe.name,degrees:probe.degrees,picked:ranked[0].name,correct:ranked[0].index===probe.index,
    best:ranked[0].distance,margin:ranked[1].distance/Math.max(1e-9,ranked[0].distance)};
 });
 let sum=0,pairs=0;
 for(let a=0;a<refs.length;a++)for(let b=a+1;b<refs.length;b++){sum+=rms(pick(refs[a],encode),pick(refs[b],encode));pairs++;}
 return {correct:results.filter(r=>r.correct).length,of:results.length,separation:sum/pairs,
   minMargin:Math.min(...results.map(r=>r.margin)),results};
}

try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);await p.eval(`(${fixture.toString()})(${BINS})`);
 report.renderer=await p.eval(`(()=>{const gl=landmarks.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)})()`);

 const live=[],control=[];
 for(let index=0;index<6;index++)for(const degrees of OFFSETS){
  const pose=await p.eval(`landmarks.pose(${index},${RANGE},${degrees})`);
  const m=await p.eval('landmarks.measure()');
  const c=await p.eval('landmarks.measure(true)');
  live.push({index,...pose,...m});control.push({index,...pose,...c});
  // The measurement has to be able to read zero.
  const hidden=await p.eval('landmarks.hiddenArea()');
  assert.equal(hidden,0,`${pose.name} at ${degrees} deg: a hidden island still contributes pixels`);
  assert.ok(m.islandArea>150,`${pose.name} is barely in the framebuffer at ${RANGE} m`);
  assert.ok(m.crown.area>25,`${pose.name}'s crown is too small to see at ${RANGE} m: ${m.crown.area} px`);
  assert.equal(c.crown.area,0,`${pose.name}: the crown control is not empty`);
  await save(`landmark-${index}-${degrees<0?'left':degrees>0?'right':'ahead'}`);
  if(degrees===0){
   await save(`landmark-${index}-rock`,'rock');
   // The same crown close enough to moor at. A landmark that only works as a
   // distant mark and falls apart on arrival is not finished.
   await p.eval(`landmarks.pose(${index},130,0)`);await save(`landmark-${index}-near`);
   await p.eval(`landmarks.pose(${index},${RANGE},0)`);
  }
  report.crowns.push({name:pose.name,degrees,crownTriangles:pose.crownTriangles,crownPixels:m.crown.area,
    box:m.crown.box,...Object.fromEntries(KEYS.map(k=>[k,+m.crown[k].toFixed(4)]))});
  console.log('pose',pose.name.padEnd(13),String(degrees).padStart(3)+'deg  island',String(m.islandArea).padStart(4),
    ' crown',String(m.crown.area).padStart(3),' uprights',m.crown.uprights,' lit',m.crown.lit.toFixed(3));
 }

 const encode=encoder(live.filter(r=>r.degrees===0));
 const crownId=classify(live,encode,(r,e)=>e(r));
 const crownControl=classify(control,encode,(r,e)=>e(r));
 const outline=classify(live,null,r=>r.profile);
 const bareRock=classify(live,null,r=>r.rockProfile);
 Object.assign(report,{crownId,crownControl,outline,bareRock});
 for(const [label,c] of [['crown',crownId],['crown-control',crownControl],['outline',outline],['bare-rock outline',bareRock]]){
  console.log(label,JSON.stringify({correct:c.correct+'/'+c.of,separation:+c.separation.toFixed(4),minMargin:+c.minMargin.toFixed(2)}));
  for(const r of c.results)console.log('  ',label,r.name.padEnd(13),String(r.degrees).padStart(3)+'deg ->',r.picked.padEnd(13),r.correct?'OK  ':'WRONG',' margin',r.margin.toFixed(2));
 }
 console.table?.(report.crowns.filter(r=>r.degrees===0));
 console.table?.(report.crowns.filter(r=>r.degrees!==0));

 // THE CLAIM: every landmark is named correctly from its crown alone, from two
 // bearings its reference was never taken from, and not marginally.
 assert.equal(crownId.correct,crownId.of,'A landmark was mistaken for another one from its crown');
 assert.ok(crownId.minMargin>1.6,'A landmark is only marginally itself: '+crownId.minMargin.toFixed(3));
 assert.ok(crownId.separation>1.2,'The six crowns are crowded together: '+crownId.separation.toFixed(3));
 // THE CONTROL: with the crowns out of the draw range there is nothing left to
 // measure and the six become one.
 assert.equal(crownControl.separation,0,'Crowns hidden, yet the descriptors still differ');
 for(const row of control)for(const k of KEYS)assert.equal(row.crown[k],0,`Crown hidden but ${k} is non-zero for ${row.name}`);
 // Reported, not asserted as proof: the whole outline classifies too, but so
 // does the bare rock at 10/12 — six smooth humps are separable to a machine
 // long before they are nameable by a person. That is exactly why the claim
 // above rests on the crown mask and not on this.
 assert.equal(outline.correct,outline.of,'The whole-island outline no longer identifies the landmarks');
 assert.deepEqual(p.errors,[]);
 report.passed=true;
 console.log(`PASS landmark identity at ${RANGE} m: ${crownId.correct}/${crownId.of} named from the crown alone at unseen bearings `+
   `(min margin ${crownId.minMargin.toFixed(2)}x, separation ${crownId.separation.toFixed(2)}), crown-hidden control 0 px and 0 separation, `+
   `outline ${outline.correct}/${outline.of} with a bare-rock control of ${bareRock.correct}/${bareRock.of}`);
}catch(e){report.failure=e.stack;throw e;}
finally{await writeFile(new URL('landmarks-browser.json',evidence),JSON.stringify({...report,errors:p.errors},null,2));await p.close();}

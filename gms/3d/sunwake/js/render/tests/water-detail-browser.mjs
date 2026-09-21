// The sea between roughly 120 and 400 m. The geometric wave fades are pulled
// in hard — the main swell stops being displaced at 116 m — because that is
// what keeps the TASKS C1 rectangular shelves dead, and none of that is touched
// here. What is touched is the per-pixel filter on the ANALYTIC wave slopes in
// the fragment shader, which was twelve times stronger in the exponent than a
// box-filtered sinusoid calls for and had flattened the mid field to ripple
// noise. TASKS C1 asked for exactly this compensation: "carry the shading
// further out than the geometry".
//
// Adding contrast to a band of sea is easy; adding contrast that is really
// there is not. So the question this suite answers is not "is there more
// detail" but "is the detail true", and it answers it by rendering the SAME
// frame at three times the resolution and box-downsampling it. The
// supersampled frame is the ground truth. Anything the 1x frame shows that the
// 3x frame does not is aliasing, and aliasing is what shimmers when the boat
// moves — which no single screenshot can show you.
//
//   structure  RMS of the high-pass of the band: how much detail is visible.
//   alias      mean |1x - downsampled 3x| over the band: how much of it is a lie.
//
// NEGATIVE CONTROL: uMidDetail=0 kills the macro slopes past 150 m and nothing
// else. Mid-band structure must collapse with it, and the near field (20-60 m)
// must not move at all — which is also what proves the measuring window is
// where it is claimed to be.
//
// Run through the managed Chrome launcher, as documented in ROADMAP.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../../../tools/cdp.mjs';
import {MID_WAVE_FILTER} from '../../core/visual-config.mjs';
const evidence=new URL('../../../docs/evidence/',import.meta.url);
const HEADINGS=[['west',Math.PI],['east',0],['north',-Math.PI/2]];
const p=await connect(),report={date:new Date().toISOString(),passed:false,filter:MID_WAVE_FILTER,bands:{mid:[120,400],near:[20,60]},samples:[]};
p.eval=async expression=>{const r=await p.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},180000);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};

async function fixture(){
 const [{createScene},{createWorld},{createBoat}]=await Promise.all([
  import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs')]);
 sunwakeTest.setView({time:5});
 const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
 const world=createWorld(),view=createScene(canvas,world);
 view.setCourse(null);
 for(const obj of [view.beacons,view.marine,view.settlementLife,view.effects])obj.group.visible=false;
 view.boat.visible=false;
 const THREE=await import('three');
 window.water={view,base:null,
  draw(){view.renderer.render(view.scene,view.camera);},
  raw(){const gl=view.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);return {buf,w,h};},
  // Open water well away from every island, so only the sea is measured.
  pose(yaw){
   const state={...createBoat({x:0,z:0,yaw},world,5),time:5,reduced:false};
   view.setQuality('standard');view.render(state,0);
   view.islands.group.visible=false;
   const origin=view.metrics().origin;
   this.eye=new THREE.Vector3(state.x-origin.x,5.5,state.z-origin.z);
   this.forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
   view.camera.position.copy(this.eye);
   view.camera.lookAt(this.eye.x+this.forward.x*400,1.2,this.eye.z+this.forward.z*400);
   view.camera.updateMatrixWorld();view.sky.update(view.camera,5);
   const gl=view.renderer.getContext();
   this.base={ratio:view.renderer.getPixelRatio(),w:gl.drawingBufferWidth,h:gl.drawingBufferHeight};
   return {yaw,...this.base};
  },
  // Screen rows of the water at two ranges, from the real projection matrix —
  // not from an assumed camera height or an assumed field of view.
  rows(from,to){
   const at=d=>{
    const v=new THREE.Vector3(this.eye.x+this.forward.x*d,0,this.eye.z+this.forward.z*d).project(view.camera);
    return (v.y*.5+.5);                       // 0 at the bottom of the frame
   };
   const a=at(from),b=at(to);return [Math.min(a,b),Math.max(a,b)];
  },
  scale(ratio){
   const {w,h,ratio:was}=this.base;
   view.renderer.setPixelRatio(ratio/was*view.renderer.getPixelRatio());
   view.renderer.setSize(w/was,h/was,false);
  },
  // Box-downsample an NxN supersampled read to the 1x grid.
  shrink(big,n){
   const w=big.w/n,h=big.h/n,out=new Uint8Array(w*h*4);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
    let sum=0;for(let j=0;j<n;j++)for(let i=0;i<n;i++)sum+=big.buf[(((y*n+j)*big.w)+(x*n+i))*4+c];
    out[(y*w+x)*4+c]=Math.round(sum/(n*n));
   }
   return {buf:out,w,h};
  },
  // RMS of the vertical high-pass: the detail a player can actually see at this
  // range, with the smooth body gradient removed.
  structure(frame,band){
   const {buf,w,h}=frame,y0=Math.max(4,Math.floor(band[0]*h)),y1=Math.min(h-5,Math.ceil(band[1]*h));
   const x0=Math.floor(w*.2),x1=Math.ceil(w*.8);let sum=0,n=0;
   const lum=(x,y)=>{const i=(y*w+x)*4;return buf[i]*.299+buf[i+1]*.587+buf[i+2]*.114;};
   for(let y=y0;y<=y1;y++)for(let x=x0;x<x1;x++){
    let mean=0;for(let k=-3;k<=3;k++)mean+=lum(x,y+k);
    const high=lum(x,y)-mean/7;sum+=high*high;n++;
   }
   return Math.sqrt(sum/Math.max(1,n));
  },
  difference(a,b,band){
   const {w,h}=a,y0=Math.max(4,Math.floor(band[0]*h)),y1=Math.min(h-5,Math.ceil(band[1]*h));
   const x0=Math.floor(w*.2),x1=Math.ceil(w*.8);let sum=0,n=0;
   for(let y=y0;y<=y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4;
    sum+=(Math.abs(a.buf[i]-b.buf[i])+Math.abs(a.buf[i+1]-b.buf[i+1])+Math.abs(a.buf[i+2]-b.buf[i+2]))/3;n++;}
   return sum/Math.max(1,n);
  },
  measure(detail,mid,near){
   view.water.uniforms.uMidDetail.value=detail;
   this.scale(1);this.draw();const one=this.raw();
   this.scale(3);this.draw();const truth=this.shrink(this.raw(),3);
   this.scale(1);
   view.water.uniforms.uMidDetail.value=1;
   return {mid:{structure:this.structure(one,mid),alias:this.difference(one,truth,mid)},
     near:{structure:this.structure(one,near),alias:this.difference(one,truth,near)}};
  },
  png(detail=1){
   view.water.uniforms.uMidDetail.value=detail;this.scale(1);this.draw();
   const {buf,w,h}=this.raw(),c=document.createElement('canvas');c.width=w;c.height=h;
   const ctx=c.getContext('2d'),im=ctx.createImageData(w,h);
   for(let y=0;y<h;y++)im.data.set(buf.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);ctx.putImageData(im,0,0);
   view.water.uniforms.uMidDetail.value=1;return c.toDataURL('image/png').split(',')[1];}
 };
}
const save=async (name,detail=1)=>writeFile(new URL(name+'.png',evidence),Buffer.from(await p.eval(`water.png(${detail})`),'base64'));

try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);await p.eval(`(${fixture.toString()})()`);
 report.renderer=await p.eval(`(()=>{const gl=water.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)})()`);
 for(const [name,yaw] of HEADINGS){
  const pose=await p.eval(`water.pose(${yaw})`);
  const mid=await p.eval('water.rows(120,400)'),near=await p.eval('water.rows(20,60)');
  const live=await p.eval(`water.measure(1,${JSON.stringify(mid)},${JSON.stringify(near)})`);
  const off=await p.eval(`water.measure(0,${JSON.stringify(mid)},${JSON.stringify(near)})`);
  const row={heading:name,yaw,pose,midRows:mid,nearRows:near,
    mid:{live:live.mid,off:off.mid,gain:live.mid.structure/off.mid.structure,truth:live.mid.alias/live.mid.structure},
    near:{live:live.near,off:off.near}};
  report.samples.push(row);
  await save(`water-mid-${name}`);await save(`water-mid-${name}-control`,0);
  console.log(name.padEnd(6),
   'mid structure',live.mid.structure.toFixed(3),'->control',off.mid.structure.toFixed(3),
   '| gain',row.mid.gain.toFixed(2)+'x',
   '| alias',live.mid.alias.toFixed(3),'(control',off.mid.alias.toFixed(3)+')',
   '| alias/structure',row.mid.truth.toFixed(3),
   '| near',live.near.structure.toFixed(3),'vs',off.near.structure.toFixed(3));

  // The detail is really there: the mid band gains real contrast.
  assert.ok(row.mid.gain>1.45,`${name}: the mid field barely changed (${row.mid.gain.toFixed(2)}x)`);
  // And it is true detail, not aliasing: most of what the 1x frame shows is
  // also in the supersampled frame.
  assert.ok(row.mid.truth<.5,`${name}: too much of the mid field is aliasing (${row.mid.truth.toFixed(3)})`);
  // Adding it did not make the frame less faithful than the control did.
  assert.ok(live.mid.alias<off.mid.alias+.8,`${name}: aliasing rose by ${(live.mid.alias-off.mid.alias).toFixed(3)}`);
  // The control isolates the mid field: the near sea is untouched by it.
  assert.ok(Math.abs(live.near.structure-off.near.structure)<.02*live.near.structure,
    `${name}: the mid-field control moved the near field too`);
 }
 assert.deepEqual(p.errors,[]);
 report.passed=true;
 const worst=report.samples.reduce((a,b)=>a.mid.truth>b.mid.truth?a:b);
 console.log(`PASS mid-field water: structure up ${Math.min(...report.samples.map(s=>s.mid.gain)).toFixed(2)}-`+
  `${Math.max(...report.samples.map(s=>s.mid.gain)).toFixed(2)}x against its own control, worst alias/structure `+
  `${worst.mid.truth.toFixed(3)} on ${worst.heading}, near field unmoved`);
}catch(e){report.failure=e.stack;throw e;}
finally{await writeFile(new URL('water-detail-browser.json',evidence),JSON.stringify({...report,errors:p.errors},null,2));await p.close();}

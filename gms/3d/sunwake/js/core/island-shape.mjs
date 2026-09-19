// Pure island shape maths: no THREE, no DOM, no Math.random. The renderer and
// the Node harness both import this exact file, so the silhouette the suites
// measure is the silhouette that is drawn.
import {SHORE_TOP} from './world.mjs';
// [input span, output rise], alternating tread and riser. Risers are only 2% of
// field span, so a terrace edge is a near-vertical face rather than a ramp.
// Three treads (D1 caps the visible steps at three) with unequal riser heights
// of 20 / 26 / 32 percent, and a summit plateau.
const TERRACE=[[.24,.05],[.02,.20],[.28,.06],[.02,.26],[.26,.05],[.02,.32],[.16,.06]];
// Field values at the middle of each riser: where a terrace edge falls.
export const TERRACE_EDGES=Object.freeze([.25,.55,.83]);
function terraceCurve(f){
  let inAcc=0,outAcc=0;
  for(const [span,rise] of TERRACE){
    if(f<=inAcc+span)return outAcc+(f-inAcc)/span*rise;
    inAcc+=span;outAcc+=rise;
  }
  return 1;
}
export const saturate=v=>v<0?0:v>1?1:v;
export const smoothstep=(a,b,v)=>{const t=saturate((v-a)/(b-a));return t*t*(3-2*t);};
// Seeded 2-D value noise. Pure integer hashing: no Math.random, so an island
// generated in a different session or a different query order is identical.
function makeNoise(seed){
  const hash=(x,y)=>{
    let n=Math.imul(x|0,0x27d4eb2f)^Math.imul(y|0,0x165667b1)^seed;
    n=Math.imul(n^(n>>>15),0x2545f491);n^=n>>>13;n=Math.imul(n,0x3b2ae1cb);n^=n>>>16;
    return (n>>>0)/2147483648-1;
  };
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
    const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    const lo=hash(xi,yi)+(hash(xi+1,yi)-hash(xi,yi))*u;
    const hi=hash(xi,yi+1)+(hash(xi+1,yi+1)-hash(xi,yi+1))*u;
    return lo+(hi-lo)*v;
  };
}

// Everything shape-related for one island, shared by the mesh builder and the
// scatter. Deterministic from island.seed alone.
export function islandField(island){
  let seed=(island.seed>>>0)||1;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const R=island.radius,peak=Math.max(island.height,4.5);
  // D1: the wall top wanders between the hard floor and +3.5 m. Keeping the
  // low end well above SHORE_TOP is what makes it read as a sea cliff.
  const topHi=Math.min(3.5,SHORE_TOP+.62*(peak-SHORE_TOP)),topLo=SHORE_TOP+.45*(topHi-SHORE_TOP);
  // Vertical fluting: integer cycle counts keep it exactly periodic in 2pi.
  const fa=3+Math.floor(rnd()*3),fb=7+Math.floor(rnd()*4),fp=rnd()*Math.PI*2,fq=rnd()*Math.PI*2;
  const ta=2+Math.floor(rnd()*2),tb=5+Math.floor(rnd()*3),tp=rnd()*Math.PI*2,tq=rnd()*Math.PI*2;
  const np=rnd()*Math.PI*2,sp=rnd()*Math.PI*2;
  const cliffDir=rnd()*Math.PI*2,tiltDir=rnd()*Math.PI*2,lobeDir=rnd()*Math.PI*2;
  const cliffX=Math.cos(cliffDir),cliffZ=Math.sin(cliffDir);
  const tiltX=Math.cos(tiltDir)/R,tiltZ=Math.sin(tiltDir)/R;
  const lobeX=Math.cos(lobeDir)*R*.42,lobeZ=Math.sin(lobeDir)*R*.42;
  const noiseA=makeNoise((island.seed^0x9e3779b9)|0),noiseB=makeNoise((island.seed^0x51ed270b)|0);
  const nax=rnd()*64,naz=rnd()*64,nbx=rnd()*64,nbz=rnd()*64;
  // Spread across the radius so the three terrace contours land well apart.
  const ease=island.profile==='mesa'?t=>Math.pow(t,.80):island.profile==='split'?t=>Math.pow(t,1.10):t=>Math.pow(t,1.45);
  // 0 to 0.45 m of relief, at zero over broad arcs so the wall genuinely
  // touches the collision circle.
  const flute=a=>.60*Math.max(0,.62*Math.sin(fa*a+fp)+.38*Math.sin(fb*a+fq));
  const notch=a=>.09+.15*(.5+.5*Math.sin(3*a+np));           // wave-cut undercut
  const wallRadius=a=>R-flute(a);
  const wallTop=a=>topLo+(topHi-topLo)*saturate(.5+.5*(.6*Math.sin(ta*a+tp)+.4*Math.sin(tb*a+tq)));
  // The tide band reaches above still water: crests wash it to +1.27 m.
  const stain=a=>.72+.34*Math.sin(2.5*a+sp);
  let meanTop=0;for(let i=0;i<48;i++)meanTop+=wallTop(i/48*Math.PI*2);meanTop/=48;
  const split=island.profile==='split';
  const lobeField=(x,z)=>{
    if(!split)return 1;
    const s=R*R*.20;
    const a=Math.exp(-((x-lobeX)**2+(z-lobeZ)**2)/s),b=Math.exp(-((x+lobeX)**2+(z+lobeZ)**2)/s);
    return .54+.46*Math.min(1,a+b);
  };
  // How terraced this bearing is. Zero across a seeded sector, which becomes a
  // single tall face with no step in it at all.
  const terraceWeight=a=>.92*(1-smoothstep(.5,.97,Math.cos(a)*cliffX+Math.sin(a)*cliffZ));
  // The geological field: 0 at the shore rim, 1 at the summit. Terrace edges
  // are its contours, which wander with the noise, so no two rims are concentric.
  function fieldAt(x,z){
    const r=Math.hypot(x,z),a=Math.atan2(z,x),wr=wallRadius(a);
    const u=saturate(1-r/Math.max(wr,1e-6));
    return saturate(ease(u)+(.30*noiseA(x*.055+nax,z*.055+naz)+.15*noiseB(x*.125+nbx,z*.125+nbz))*Math.min(1,u*6)*(1-.3*u));
  }
  // Height of the rock surface at an island-local point. Guaranteed to be at
  // or above the wall top, so the sea can never show through the rim, and
  // independent of theta at the centre.
  function heightAt(x,z){
    const r=Math.hypot(x,z),a=Math.atan2(z,x),wr=wallRadius(a);
    const u=saturate(1-r/Math.max(wr,1e-6));
    const rim=wallTop(a)+(meanTop-wallTop(a))*u*u;
    const f=fieldAt(x,z),w=terraceWeight(a);
    // The un-terraced sector is a single steep face that tops out on a plateau,
    // not a dome: it must read as one tall wall of rock from the water.
    const shaped=saturate(f/.45)*(1-w)+terraceCurve(f)*w;
    const tilt=1+.22*(x*tiltX+z*tiltZ);               // a few degrees of dip
    // Rubble, so a tread is weathered rock rather than a machined disc.
    const rough=.05*Math.min(1,u*8)*noiseB(x*.30+naz,z*.30+nax);
    // Never below the hard floor: the sea must not show through the rock.
    return Math.max(SHORE_TOP,rim+(peak-rim)*(shaped*lobeField(x,z)*tilt+rough));
  }
  // Where each terrace edge crosses this bearing, as a fraction of the radius
  // inward from the rim. Scanned outward-in; 1 means the island never gets that
  // high on this bearing, which collapses that step against the summit.
  function edgeStations(a,out=[]){
    out.length=0;
    const cos=Math.cos(a),sin=Math.sin(a),wr=wallRadius(a);
    const at=u=>fieldAt(cos*wr*(1-u),sin*wr*(1-u));
    let index=0,previousU=0;
    for(let step=1;step<=28&&index<TERRACE_EDGES.length;step++){
      const u=step/28,f=at(u);
      while(index<TERRACE_EDGES.length&&f>=TERRACE_EDGES[index]){
        let lo=previousU,hi=u;
        for(let bisect=0;bisect<5;bisect++){const mid=(lo+hi)/2;if(at(mid)>=TERRACE_EDGES[index])hi=mid;else lo=mid;}
        out.push(hi);index++;
      }
      previousU=u;
    }
    while(out.length<TERRACE_EDGES.length)out.push(1);
    return out;
  }
  return {R,peak,topLo,topHi,rnd,flute,wallRadius,wallTop,notch,stain,heightAt,fieldAt,meanTop,terraceWeight,edgeStations,
    mottle:(x,z)=>noiseB(x*.21+nbz,z*.21+nbx)};
}


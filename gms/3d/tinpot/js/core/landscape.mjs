// Pure. No three, no DOM. Shared by the pathing grid and the renderer so the corridor the
// player walks is exactly the corridor they can see.
const bell=(t,w)=>Math.exp(-((t/w)**2));
export const centre=(z,map)=>Math.sin(z*.062)*map.bend*1.25+Math.sin(z*.23+.5)*1.5+Math.sin(z*.135-1.1)*1.1;
export const corridorWidth=(z,map)=>map.corridor
 +Math.sin(z*.21)*1.5+Math.sin(z*.085+2.1)*1.2
 +3.2*bell(z+3,6.5)+2.6*bell(z-26,5.5)+2.1*bell(z+30,6)
 -1.8*bell(z-13,3)-1.6*bell(z+20,3.6);
export const groundNoise=(x,z)=>.5+Math.sin(x*.41+Math.sin(z*.19)*2)*.23+Math.cos(z*.31-x*.17)*.18;
export const groundNoise2=(x,z)=>.5+Math.sin(x*.155-z*.27+1.7)*.27+Math.cos(z*.115+x*.205-.8)*.21;
export const track=(z,map)=>centre(z,map)*.62+Math.sin(z*.28)*1.5+Math.sin(z*.041+1.3)*2.0;
export const trackWidth=z=>1.15+.32*Math.sin(z*.6)+.3*Math.sin(z*.17+2);
export const smooth=(a,b,t)=>{const x=Math.min(1,Math.max(0,(t-a)/((b-a)||1e-6)));return x*x*(3-2*x);};

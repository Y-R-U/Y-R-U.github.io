// shaders.js — every pixel of the site comes out of these eight programs.
// Scenes, in scroll order: sun → core → walk → escape → space → sky → iris → outro.
// All coordinates use st = (fragXY - res/2) / res.y  →  y in [-.5,.5], x aspect-scaled.

const HEAD = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;   // backing-store px, origin bottom-left
uniform float uAlpha;   // scene crossfade weight
uniform float uQ;       // local scene progress 0..1
uniform float uMotion;  // reduced-motion scalar (1 normal, ~.25 reduced)
out vec4 O;
`;

const LIB = `
float ss(float a,float b,float x){return smoothstep(a,b,x);}
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec2  h22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
float vn(vec2 p){
  vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);
  for(int i=0;i<5;i++){v+=a*vn(p);p=R*p*2.03;a*=.5;}
  return v;
}
float fbm3(vec2 p){
  float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);
  for(int i=0;i<3;i++){v+=a*vn(p);p=R*p*2.03;a*=.5;}
  return v;
}
vec2 vor(vec2 p,float t){
  vec2 i=floor(p),f=fract(p);float md=8.,mh=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y));vec2 o=h22(i+g);
    o=.5+.42*sin(t+6.2831*o);
    vec2 r=g+o-f;float d=dot(r,r);
    if(d<md){md=d;mh=h12(i+g);}
  }
  return vec2(sqrt(md),mh);
}
float stars(vec2 st,float sc,float th,vec2 off){
  vec2 p=st*sc+off;
  vec2 i=floor(p),f=fract(p);
  vec2 o=h22(i);
  float d=length(f-.3-.4*o);
  float m=h12(i+7.7);
  float b=ss(th,1.,m);
  float tw=.72+.28*sin(uTime*(1.+2.5*m)+m*44.);
  return b*tw*ss(.09,.0,d);
}
vec3 sunramp(float h){
  vec3 c=mix(vec3(.045,.004,.001),vec3(.44,.052,.008),ss(0.,.38,h));
  c=mix(c,vec3(1.,.42,.06),ss(.38,.74,h));
  c=mix(c,vec3(1.,.82,.50),ss(.74,1.08,h));
  c=mix(c,vec3(1.,.97,.90),ss(1.08,1.55,h));
  return c;
}
vec3 grade(vec3 c,vec2 st){
  c*=1.-.40*dot(st,st);                                  // vignette
  c+= (h12(gl_FragCoord.xy+fract(uTime*.61)*337.)-.5)*.030; // grain + dither
  return clamp(c,0.,1.);
}
vec2 ST(){return (gl_FragCoord.xy-.5*uRes)/uRes.y;}
vec2 MO(){return (uMouse-.5*uRes)/uRes.y;}
`;

// ————————————————————————————— SUN — the hero. full-bleed photosphere.
const SUN = `
uniform float uZoom;
uniform float uBoost;
void main(){
  vec2 st=ST();
  vec2 p=st/uZoom;
  vec2 m=MO();
  vec2 dm=p-m;float d2=dot(dm,dm);
  float infl=exp(-d2*14.)*uMotion;
  float th=infl*.7;                             // cursor stirs a gentle vortex
  float cs=cos(th),sn=sin(th);
  p=m+mat2(cs,-sn,sn,cs)*dm;
  float t=uTime*.055;
  vec2 q=vec2(fbm(p*2.2+vec2(t,0.)),fbm(p*2.2+vec2(-t,3.3)));
  float v=fbm(p*3.6+q*2.4);
  float fil=1.-abs(2.*fbm(p*4.6+q*3.+vec2(0.,t*1.6))-1.);  // licking filaments
  float heat=v*.90+pow(fil,3.)*.62-.12+.20*infl;
  float sp=fbm(p*1.15+vec2(31.7,9.2));          // sunspot pair, drifting slowly
  heat-=.55*ss(.68,.80,sp);
  heat=(heat-.5)*1.35+.42;                      // contrast — darks go black, peaks white
  heat+=.04*sin(uTime*.5+p.x*3.);
  heat+=uBoost;
  vec3 col=sunramp(heat);
  col+=vec3(1.,.6,.25)*infl*.08;
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— CORE — inside the furnace.
const CORE = `
uniform float uBoost;
uniform float uDim;
void main(){
  vec2 st=ST();vec2 m=MO();
  float rr=length(st);
  vec2 p=st*(1.+.10*sin(uTime*.9-rr*7.)*uMotion);   // pressure pulses
  float t=uTime*.09;
  vec2 q=vec2(fbm(p*3.4+vec2(t,0.)),fbm(p*3.4+vec2(-t,3.3)));
  float v=fbm(p*5.5+q*2.4);
  float fil=1.-abs(2.*fbm(p*7.+q*3.+vec2(0.,t*2.))-1.);
  float heat=v*.92+pow(fil,3.)*.78-rr*.55+uBoost;
  vec3 col=sunramp(heat);
  col+=vec3(.55,.5,.62)*exp(-rr*rr*6.)*(.42+.22*sin(uTime*1.3)); // x-ray white heart
  col*=uDim;
  vec2 dm=st-m;
  col+=vec3(.9,.7,.5)*exp(-dot(dm,dm)*30.)*.14*uMotion;
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— WALK — radiative zone; photon glow lives here,
// the trail itself is a separate point pass drawn on top.
const WALK = `
uniform vec2  uPhoton;   // photon position, st-space
uniform float uRise;     // 0..1 — plasma thinning as it climbs
void main(){
  vec2 st=ST();vec2 m=MO();
  vec2 p=st*1.35;
  float t=uTime*.05;
  vec2 q=vec2(fbm(p*2.6+vec2(t,1.)),fbm(p*2.6+vec2(4.,-t)));
  float v=fbm(p*3.8+q*2.2);
  vec3 col=sunramp(v*.9-.10)*mix(.34,.18,uRise);
  col=mix(col,col*vec3(1.,.72,.55),uRise*.5);
  vec2 c=vor(p*6.+q,uTime*.1);
  col*=.80+.20*ss(.1,.5,c.x);
  vec2 dp=st-uPhoton;
  float d2=dot(dp,dp);
  col+=vec3(1.,.92,.72)*exp(-d2*2400.)*1.25;   // the photon, white-hot
  col+=vec3(1.,.55,.20)*exp(-d2*170.)*.45;
  col+=vec3(1.,.35,.10)*exp(-d2*30.)*.13;
  vec2 dm=st-m;
  col+=vec3(.8,.45,.2)*exp(-dot(dm,dm)*40.)*.10*uMotion;
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— ESCAPE — pulling away from the sun at c.
const ESCAPE = `
uniform float uFlash;
void main(){
  vec2 st=ST();
  float q=uQ;
  float e=1.-pow(1.-q,2.2);
  float R=mix(2.1,.15,e);
  vec2 C=vec2(0.,mix(-.06,.10,e));
  vec2 rel=st-C;
  float d=length(rel);
  float ang=atan(rel.y,rel.x);
  vec3 col=vec3(0.);
  float sf=ss(.30,.85,q);                                  // stars fade in
  col+=vec3(.85,.9,1.)*stars(st,22.,.965,vec2(1.7))*sf;
  col+=vec3(.9,.9,1.)*stars(st,38.,.975,vec2(9.1))*sf*.7;
  float t=uTime*.06;
  float ns=fbm(vec2(cos(ang),sin(ang))*3.+vec2(t*2.,0.))*.6+fbm(st*4.+t)*.4;
  float edge=R*(1.+.035*ns);
  float disc=1.-ss(edge*.985,edge*1.015,d);
  // disc interior — real photosphere texture in disc-local coordinates
  vec2 pc=rel/max(R,.15);
  vec2 q2=vec2(fbm(pc*2.5+t),fbm(pc*2.5+vec2(4.,0.)-t));
  float dv=fbm(pc*3.5+q2*1.8);
  float fil=pow(1.-abs(2.*fbm(pc*5.+q2*2.2)-1.),2.5);
  vec2 cg=vor(pc*14.+q2*2.,uTime*.1);
  float lanes=ss(.28,.52,cg.x);
  float hh=dv*1.05+fil*.5-lanes*.2;
  float limb=1.-.55*pow(clamp(d/max(edge,1e-3),0.,1.),3.);   // limb darkening
  vec3 dcol=sunramp(((hh-.5)*1.25+.62)*limb+.10);
  col=mix(col,dcol,disc);
  float glow=exp(-(d-edge)*mix(2.5,9.,e))*(1.-disc);       // corona
  float stream=pow(1.-abs(2.*fbm(vec2(ang*2.2,uTime*.05))-1.),3.);
  col+=vec3(1.,.55,.18)*glow*(.5+.65*stream);
  col+=vec3(1.,.8,.5)*exp(-max(d-edge,0.)*20.)*(1.-disc)*.8;
  // light-speed streaks, quantised by angle, racing outward
  float lane=floor(ang*90.);
  float sk=h12(vec2(lane,3.))*ss(.12,.55,q)*(1.-ss(.72,1.,q));
  float rad=fract(d*2.-uTime*1.5*uMotion-h12(vec2(lane,9.)));
  col+=vec3(.85,.88,1.)*step(.94,sk)*ss(.80,1.,rad)*ss(.25,1.1,d)*.6;
  col+=vec3(1.,.9,.75)*uFlash;                             // breakout flash
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— SPACE — starfield, sun astern, planet flybys.
const SPACE = `
uniform vec2 uSunPos;
uniform vec4 uPA;   // xy pos, z radius, w type (0 mercury / 1 venus / 2 earth)
uniform vec4 uPB;
vec4 planet(vec2 st,vec4 P,float spin,inout vec3 add){
  if(P.z<=0.) return vec4(0.);
  vec2 dd=(st-P.xy)/P.z;
  float r=length(dd);
  if(r>2.2) return vec4(0.);
  float type=P.w;
  vec3 atmoC = type<.5 ? vec3(0.) : (type<1.5 ? vec3(.95,.85,.6) : vec3(.45,.7,1.));
  if(r>=1.){
    add+=atmoC*exp(-(r-1.)*7.)*.35;
    return vec4(0.);
  }
  vec3 n=vec3(dd,sqrt(max(0.,1.-r*r)));
  float cs=cos(spin),sn=sin(spin);
  vec3 nr=vec3(n.x*cs+n.z*sn,n.y,-n.x*sn+n.z*cs);
  vec2 s=vec2(abs(atan(nr.z,nr.x)),asin(clamp(nr.y,-1.,1.)));
  vec3 base;float landm=0.;
  if(type<.5){                       // mercury: scorched, cratered
    float f=fbm(s*3.1);
    base=mix(vec3(.22,.20,.19),vec3(.44,.39,.34),f);
    vec2 c=vor(s*6.,0.);
    base*=.72+.38*ss(.05,.3,c.x);
    base*=.9+.2*fbm(s*9.);
  }else if(type<1.5){                // venus: acid cream, banded
    float band=fbm(vec2(s.x*1.4,s.y*5.)+fbm(s*2.)*1.2);
    base=mix(vec3(.72,.57,.38),vec3(.97,.90,.74),band);
  }else{                             // earth
    float cont=fbm(s*2.4+vec2(17.,3.));
    landm=ss(.50,.55,cont);
    vec3 ocean=mix(vec3(.02,.12,.30),vec3(.05,.22,.45),fbm(s*5.));
    vec3 land=mix(vec3(.10,.22,.10),vec3(.45,.38,.22),fbm(s*6.+9.));
    base=mix(ocean,land,landm);
    base=mix(base,vec3(.90,.92,.95),ss(.74,.92,abs(nr.y)));
    float cl=ss(.55,.80,fbm(s*3.4+vec2(uTime*.008,41.)));
    base=mix(base,vec3(.95,.97,1.),cl*.85);
  }
  vec3 l=normalize(vec3(-.22,.18,.94));   // sun is behind us — worlds face us lit
  float dif=clamp(dot(n,l),0.,1.);
  vec3 col=base*(.16+.95*dif)*vec3(1.06,.97,.88);   // warm key light
  col+=atmoC*pow(1.-n.z,2.6)*.5;
  if(type>1.5) col+=vec3(1.,.95,.85)*pow(max(dot(reflect(-l,n),vec3(0,0,1)),0.),40.)*(1.-landm)*.5;
  return vec4(col,1.-ss(.985,1.,r));
}
void main(){
  vec2 st=ST();
  vec2 m=MO()*.05;                                  // cursor parallax
  vec3 col=vec3(0.);
  col+=vec3(.85,.90,1.)*stars(st+m*.4,20.,.962,vec2(3.1));
  col+=vec3(.90,.92,1.)*stars(st+m*.7,34.,.972,vec2(8.7))*.75;
  col+=vec3(1.)*stars(st+m*1.1,55.,.985,vec2(5.4))*.55;
  col+=vec3(.09,.10,.15)*pow(1.-abs(dot(st,normalize(vec2(.7,.3)))),3.)*fbm3(st*3.)*.8;
  vec2 ds=st-uSunPos;
  float dsl=length(ds);
  col+=vec3(1.,.85,.60)*exp(-dsl*22.)*1.4;          // the sun, astern
  col+=vec3(1.,.60,.25)*exp(-dsl*6.)*.35;
  col+=vec3(1.,.75,.40)*exp(-abs(ds.y)*90.)*exp(-abs(ds.x)*7.)*.5;
  vec3 add=vec3(0.);
  vec4 pb=planet(st,uPB,uTime*.015,add);
  col=mix(col,pb.rgb,pb.a);
  vec4 pa=planet(st,uPA,uTime*.02,add);
  col=mix(col,pa.rgb,pa.a);
  col+=add;
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— SKY — the last 100 km. Rayleigh's toll booth.
const SKY = `
void main(){
  vec2 st=ST();vec2 m=MO();
  float q=uQ;
  float h=st.y+.5;
  float day=ss(0.,.45,q);                            // space-black → full day
  vec3 top=mix(vec3(.008,.015,.05),vec3(.10,.32,.68),day);
  vec3 mid=mix(vec3(.02,.04,.10),vec3(.34,.61,.92),day);
  vec3 hor=mix(vec3(.07,.05,.06),vec3(.93,.90,.82),day);
  vec3 col=mix(mix(hor,mid,ss(0.,.45,h)),top,ss(.45,1.05,h));
  float sf=1.-day;                                   // stars die as air thickens
  col+=vec3(.9,.92,1.)*stars(st,26.,.97,vec2(4.4))*sf*sf;
  vec2 spos=vec2(-.24,mix(.34,.10,ss(0.,.7,q)));
  float dsl=length(st-spos);
  col+=vec3(1.,.93,.80)*exp(-dsl*30.)*1.6;
  col+=vec3(1.,.80,.50)*exp(-dsl*4.5)*.4*day;
  float ang=atan(st.y-spos.y,st.x-spos.x);
  float ray=pow(1.-abs(2.*fbm(vec2(ang*3.5,uTime*.03))-1.),4.);
  col+=vec3(1.,.9,.7)*ray*exp(-dsl*2.4)*.30*day;     // god rays
  for(int i=0;i<3;i++){                              // three cloud decks
    float fi=float(i);
    vec2 cp=st*vec2(1.6+fi*.9,2.6+fi*1.4)+vec2(uTime*(.006+.004*fi)*uMotion+fi*13.7,q*(.6+.4*fi));
    float c=fbm(cp);
    float band=ss(.06,.52,h)*(1.-ss(.55,1.2,h));
    float cl=ss(.58,.80,c)*band;
    col=mix(col,mix(vec3(1.),hor,.2),cl*(.5-.13*fi)*day);
  }
  vec2 g=st*22.;vec2 gi=floor(g);vec2 gf=fract(g);   // blue photons scattering off
  float mh=h12(gi);
  vec2 mo=.5+.35*vec2(sin(uTime*(2.+mh*3.)*uMotion+mh*40.),cos(uTime*(1.5+mh*2.)*uMotion+mh*20.));
  col+=vec3(.45,.65,1.)*ss(.06,.0,length(gf-mo))*step(.975,mh)*.5*day;
  vec2 dm=st-m;                                      // your cursor scatters light
  col+=vec3(.55,.75,1.)*exp(-dot(dm,dm)*25.)*.20*uMotion*day;
  O=vec4(grade(col,st),uAlpha);
}`;

// ————————————————————————————— IRIS — arrival. the destination is a reader.
const IRIS = `
uniform float uPupil;
uniform float uFlash;
uniform float uZoomI;
void main(){
  vec2 stg=ST();
  vec2 st=stg/uZoomI;
  float r=length(st);
  float a=atan(st.y,st.x);
  float am=abs(a);                                   // mirrored — seamless
  float w=fbm(vec2(am*2.5,r*4.))*.5;
  float fib=fbm(vec2(r*13.-w*2.,am*4.2+w));
  float fib2=1.-abs(2.*fbm(vec2(r*22.+w,am*7.))-1.);
  vec3 cIn=vec3(.80,.55,.25);                        // amber collar
  vec3 cMid=vec3(.34,.42,.27);                       // hazel green
  vec3 cOut=vec3(.15,.22,.20);
  float pr=uPupil;
  float t01=clamp((r-(pr+.02))/(.60-(pr+.02)),0.,1.);
  vec3 iris=mix(cIn,cMid,ss(.08,.5,t01));
  iris=mix(iris,cOut,ss(.55,1.,t01));
  iris*=.55+.85*fib;
  iris+=vec3(.9,.75,.5)*pow(fib2,3.)*.28*(1.-t01);
  vec2 cc=vor(vec2(cos(a),sin(a))*2.4+r*3.2,0.);
  iris*=.80+.25*ss(.08,.4,cc.x);                     // crypts
  iris+=vec3(.7,.5,.25)*(1.-ss(0.,.09,abs(r-(pr+.10))))*.16; // collarette
  iris*=1.-.65*ss(.46,.60,r);                        // limbal ring
  float pup=1.-ss(pr*.94,pr*1.05,r);
  vec3 col=mix(iris,vec3(.005,.004,.004),pup);
  col+=vec3(.9,.6,.3)*(1.-ss(0.,.035,abs(r-pr)))*.20;
  col=mix(col,vec3(.012,.010,.010),ss(.60,.68,r));   // room falls away
  col*=1.-.38*ss(.14,.46,st.y);                      // eyelid shadow
  vec2 hp=st-vec2(-.16,.18);
  col+=vec3(1.)*exp(-dot(hp,hp)*160.)*.8;            // wet highlight
  vec2 hp2=st-vec2(.10,-.22);
  col+=vec3(.6,.7,.8)*exp(-dot(hp2,hp2)*400.)*.25;
  float fl=uFlash;                                   // the photon arrives
  if(fl>0.001){
    vec2 dir=normalize(vec2(-.6,-.45));
    vec2 o=vec2(.55,.42);
    vec2 rel=st-o;
    float along=dot(rel,dir);
    float perp=abs(dot(rel,vec2(-dir.y,dir.x)));
    float seg=ss(0.,.1,along)*(1.-ss(.7,.8,along));
    col+=vec3(1.,.9,.7)*exp(-perp*90.)*seg*fl*2.2;
    col+=vec3(1.,.85,.6)*fl*.22;
  }
  col*=.97+.05*fbm(vec2(am*3.,r*6.)+uTime*.15*uMotion);
  O=vec4(grade(col,stg),uAlpha);
}`;

// ————————————————————————————— OUTRO — old light, quiet dark.
const OUTRO = `
void main(){
  vec2 st=ST();
  vec2 m=MO()*.03;
  vec3 col=vec3(.004,.004,.006);
  float t=uTime*.004*uMotion;
  col+=vec3(.75,.80,.95)*stars(st+m+vec2(t,0.),22.,.968,vec2(2.2))*.5;
  col+=vec3(.80,.82,1.)*stars(st+m*1.6+vec2(t*1.7,0.),40.,.978,vec2(7.5))*.35;
  col+=vec3(.5,.35,.2)*exp(-pow(st.y+.62,2.)*9.)*.30;  // the sun, behind you now
  O=vec4(grade(col,st),uAlpha);
}`;

const build = (body) => HEAD + LIB + body;

export const FRAGS = {
  sun: build(SUN),
  core: build(CORE),
  walk: build(WALK),
  escape: build(ESCAPE),
  space: build(SPACE),
  sky: build(SKY),
  iris: build(IRIS),
  outro: build(OUTRO),
};

// ————————————————————————————— point stream: the random-walk trail.
export const POINT_VS = `#version 300 es
layout(location=0) in vec3 aP;   // x, y (sim space), birth time
uniform vec2  uRes;
uniform vec2  uCam;
uniform float uNow;
uniform vec2  uCur;   // cursor, sim space
uniform float uScale; // px scale
out float vAge;
void main(){
  float age=clamp((uNow-aP.z)/6.0,0.,1.);
  vAge=age;
  vec2 st=aP.xy-uCam;
  vec2 dm=st-uCur;
  float push=exp(-dot(dm,dm)*90.)*.05;      // cursor shoulders the plasma aside
  st+=normalize(dm+1e-5)*push;
  vec2 ndc=st*2.0*vec2(uRes.y/uRes.x,1.0);
  gl_Position=vec4(ndc,0.,1.);
  gl_PointSize=mix(9.0,1.5,age)*uScale;
}`;

export const POINT_FS = `#version 300 es
precision highp float;
in float vAge;
uniform float uA;
out vec4 O;
void main(){
  vec2 d=gl_PointCoord*2.-1.;
  float r2=dot(d,d);
  if(r2>1.) discard;
  float fall=exp(-r2*3.0);
  vec3 c=mix(vec3(1.0,.85,.60),vec3(.9,.25,.05),vAge);
  float a=(1.-vAge);a*=a;
  O=vec4(c*fall*a*.5*uA,0.);   // additive
}`;

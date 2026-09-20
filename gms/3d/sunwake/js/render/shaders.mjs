import {WAVES,MAX_HEIGHT,MAX_VERTICAL_SPEED,FOAM_HEIGHT} from '../core/waves.mjs';
import {CHOP_SHIFTS,HORIZON_FADE} from '../core/config.mjs';
const f=value=>Number(value).toFixed(12);
// Both production water and the GPU probe call this exact generated function.
export const waveGLSL=/* glsl */`
uniform float uPhases[4];
vec4 waveSurface(vec2 p,vec2 radial,bool lod){
  vec4 result=vec4(0.);float radius=length(radial);vec2 radialDirection=radial/max(radius,.0001);
  ${WAVES.map((w,i)=>`{
    vec2 d=vec2(${f(w.x)},${f(w.z)});float q=${f(w.k)}*dot(d,p)+uPhases[${i}];
    float fraction=clamp((radius-${f(w.fade[0])})/${f(w.fade[1]-w.fade[0])},0.,1.);
    float fade=lod?1.-fraction*fraction*(3.-2.*fraction):1.;
    float fadeDerivative=lod?-6.*fraction*(1.-fraction)/${f(w.fade[1]-w.fade[0])}:0.;
    float h=${f(w.amplitude)}*sin(q),c=${f(w.amplitude)}*cos(q);
    result.x+=h*fade;result.yz+=c*${f(w.k)}*d*fade+h*fadeDerivative*radialDirection;result.w-=c*${f(w.omega)}*fade;
  }`).join('\n')}
  return result;
}
`;
export const skyGLSL = /* glsl */`
uniform vec3 uSun, uHorizon, uZenith, uHaze, uSunColor;
uniform sampler2D uCloud;
uniform float uCloudTime;
uniform float uCloudEnabled;
// One scalar for every horizon weather term, so a suite can render the exact
// same frame with it at 0 and prove the measurement is the weather and not
// frame-to-frame noise. The sun never moves: this is cloud, not a clock.
uniform float uWeather;
vec3 skyColor(vec3 ray, bool disc) {
  float altitude=max(ray.y,0.0);
  float west=pow(max(dot(normalize(vec3(ray.x,0.001,ray.z)),normalize(vec3(uSun.x,0.,uSun.z))),0.0),4.0);
  vec3 horizon=mix(uHaze,uHorizon,0.35+0.65*west);
  vec3 color=mix(horizon,uZenith,pow(smoothstep(0.0,0.85,altitude),0.55));
  float alignment=dot(ray,uSun);
  color+=uSunColor*(0.26*exp((alignment-1.0)*55.0)+0.15*exp((alignment-1.0)*450.0));
  vec2 cloudUV=vec2(atan(ray.z,ray.x)/6.2831853+uCloudTime,ray.y*1.8);
  float noise=0.;
  if(uCloudEnabled>.5)noise=texture2D(uCloud,cloudUV*vec2(2.,2.)).r*.65+texture2D(uCloud,cloudUV*vec2(5.,4.)).r*.35;
  float bands=exp(-pow((altitude-.20)/.037,2.))+0.65*exp(-pow((altitude-.32)/.048,2.))+0.35*exp(-pow((altitude-.52)/.065,2.));
  float clouds=smoothstep(.44,.65,noise)*bands*smoothstep(.04,.13,altitude);
  color=mix(color,mix(uHaze*.75,uHorizon*1.1,west),clouds*.5);
  if(uCloudEnabled>.5&&uWeather>.001){
    // Horizon weather. Every term is analytic on integer harmonics of the
    // azimuth, so it is exactly periodic in 2pi: no texture, no extra draw and
    // no seam at +/-pi (which a texture lookup on atan() would give, because the
    // wrap makes the derivative enormous and drops it to the coarsest mip).
    float azimuth=atan(ray.z,ray.x),lap=uCloudTime*6.2831853;
    float toSun=max(dot(normalize(vec3(ray.x,0.0001,ray.z)),normalize(vec3(uSun.x,0.,uSun.z))),0.);
    // 1. A bank of cloud actually sitting ON the horizon. The existing band set
    //    starts at 0.04 altitude, so the strip the islands live in was a flat
    //    wash with nothing in it to give the distance any scale.
    float bankNoise=.5+.5*(.55*sin(azimuth*5.+lap*1.4)+.30*sin(azimuth*11.-1.7)+.15*sin(azimuth*23.+2.3));
    float bank=exp(-pow((altitude-.032)/.030,2.))*smoothstep(.36,.68,bankNoise);
    color=mix(color,mix(uHaze*.84,uHorizon*1.2,west),bank*.42*uWeather);
    // 2. Crepuscular shafts raked off the sun, gated to the sun's quarter.
    float rake=.5+.5*sin(azimuth*17.+1.1)*sin(azimuth*6.+lap*2.2);
    float shaft=pow(toSun,6.)*smoothstep(.03,.30,altitude)*(1.-smoothstep(.30,.64,altitude))*rake;
    color+=uSunColor*shaft*.14*uWeather;
    // 3. One squall, a full lap of the compass per cloud wrap (~35 min), so a
    //    long voyage watches it arrive, cross and leave. The veil is at full
    //    strength at altitude 0 on purpose: the sea's own haze is
    //    skyColor(horizontal), so sky and water darken together under it with
    //    no line between them.
    float off=abs(atan(sin(azimuth-lap),cos(azimuth-lap)));
    float ragged=.26+.09*sin(azimuth*21.+3.7)+.04*sin(azimuth*47.-1.2);
    float across=1.-smoothstep(ragged*.42,ragged,off);
    float veil=across*(1.-smoothstep(.12,.34,altitude));
    float head=across*exp(-pow((altitude-.17)/.090,2.));
    color=mix(color,mix(uHaze,uZenith,.42)*.58,(veil*.44+head*.36)*uWeather);
  }
  if(disc) {float edge=fwidth(alignment)*1.2;float sun=smoothstep(cos(radians(.8))-edge,cos(radians(.8))+edge,alignment);color=mix(color,uSunColor*5.,sun);}
  // The sea haze uses precisely skyColor(horizontal,false).
  return color;
}
`;
export const fullscreenVertex=/* glsl */`varying vec2 vClip;void main(){vClip=position.xy;gl_Position=vec4(position.xy,1.,1.);}`;
export const waterVertex=/* glsl */`
uniform vec2 uCenter;
varying vec3 vPosition;varying vec4 vWave;
${waveGLSL}
void main(){
  vec2 p=position.xz+uCenter;vWave=waveSurface(p,position.xz,true);
  vec2 shift=vec2(0.);mat2 jacobian=mat2(1.);float radius=length(position.xz);vec2 radial=position.xz/max(radius,.0001);
  ${WAVES.slice(0,2).map((w,i)=>`{
    vec2 d=vec2(${f(w.x)},${f(w.z)});float q=${f(w.k)}*dot(d,p)+uPhases[${i}];
    float s=clamp((radius-${f(w.fade[0])})/${f(w.fade[1]-w.fade[0])},0.,1.);float fade=1.-s*s*(3.-2.*s);float df=-6.*s*(1.-s)/${f(w.fade[1]-w.fade[0])};
    shift+=${f(CHOP_SHIFTS[i])}*d*cos(q)*fade;
    vec2 derivative=${f(CHOP_SHIFTS[i])}*(-${f(w.k)}*sin(q)*d*fade+cos(q)*df*radial);
    jacobian+=outerProduct(d,derivative);
  }`).join('\n')}
  // Inverse-transpose of the horizontal Jacobian keeps crests' normals correct.
  vWave.yz=transpose(inverse(jacobian))*vWave.yz;
  vPosition=vec3(p.x+shift.x,vWave.x,p.y+shift.y);gl_Position=projectionMatrix*viewMatrix*vec4(vPosition,1.);
}
`;
export const waterFragment=/* glsl */`
${skyGLSL}
${waveGLSL}
uniform vec3 uDeep,uLit,uFoam,uShallow;
uniform sampler2D uRipple;uniform vec4 uRippleOffset;uniform float uRippleLayers;
uniform vec2 uCenter;
uniform int uShoreCount;uniform vec3 uShores[8];
varying vec3 vPosition;varying vec4 vWave;
void main(){
  vec3 V=normalize(cameraPosition-vPosition);float distanceXZ=length(vPosition.xz-cameraPosition.xz);
  float rippleFade=1.-smoothstep(160.,450.,distanceXZ);
  vec2 r1=texture2D(uRipple,vPosition.xz/5.+uRippleOffset.xy).rg*2.-1.;
  mat2 rotation=mat2(.390731128,.920504853,-.920504853,.390731128);
  vec2 r2=vec2(0.);if(uRippleLayers>1.5)r2=texture2D(uRipple,rotation*vPosition.xz/2.3+uRippleOffset.zw).rg*2.-1.;
  // Chain rule: the rotated texture's slopes rotate back into world XZ.
  vec2 macro=vec2(0.);
  // Filter macro slopes per pixel as well as by range; flat geometry must not
  // reintroduce an aliased horizon through high-frequency grazing reflections.
  ${WAVES.map((w,i)=>`{vec2 d=vec2(${f(w.x)},${f(w.z)});float q=${f(w.k)}*dot(d,vPosition.xz)+uPhases[${i}];float footprint=fwidth(q);macro+=${f(w.amplitude*w.k)}*d*cos(q)*exp(-.5*footprint*footprint);}`).join('\n')}
  macro*=mix(1.,.16,smoothstep(70.,240.,distanceXZ));
  vec2 baseSlope=mix(vWave.yz,macro,smoothstep(20.,70.,distanceXZ))*(1.-smoothstep(100.,450.,distanceXZ));
  vec2 slope=baseSlope+rippleFade*(r1*.065+transpose(rotation)*r2*.035);
  vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
  float NoV=max(dot(N,V),.0001),NoL=max(dot(N,uSun),.0001);
  float fresnel=.02+.98*pow(1.-clamp(NoV,0.,1.),5.);
  float facing=clamp(.5+dot(N,uSun)*1.5,0.,1.);
  vec3 body=mix(uDeep,uLit,.24+.65*facing);
  float shore=10000.;if(length(vPosition.xz-uCenter)<180.)for(int i=0;i<8;i++){if(i>=uShoreCount)break;shore=min(shore,length(vPosition.xz-uShores[i].xy)-uShores[i].z);}
  body=mix(body,uShallow,smoothstep(-6.,-1.,shore)*(1.-smoothstep(0.,4.,shore))*.6);
  vec3 reflected=skyColor(reflect(-V,N),false);
  vec3 color=mix(body,reflected,fresnel);
  color+=uShallow*.12*pow(max(dot(-V,uSun),0.),3.)*smoothstep(${f(MAX_HEIGHT*.2)},${f(MAX_HEIGHT*.85)},vWave.x);
  vec3 H=normalize(V+uSun);float NoH=max(dot(N,H),0.),VoH=max(dot(V,H),0.);
  float roughness=mix(.18,.42,smoothstep(80.,450.,distanceXZ));
  float alpha=roughness*roughness;
  vec3 dnx=dFdx(N),dny=dFdy(N);float variance=.25*(dot(dnx,dnx)+dot(dny,dny));
  float alpha2=clamp(alpha*alpha+variance,.0001,1.);
  float denom=NoH*NoH*(alpha2-1.)+1.;float D=alpha2/(3.14159265*denom*denom);
  float k=(roughness+1.)*(roughness+1.)/8.;
  float Gv=NoV/(NoV*(1.-k)+k),Gl=NoL/(NoL*(1.-k)+k);
  float F=.02+.98*pow(1.-VoH,5.);
  color+=uSunColor*3.*D*Gv*Gl*F/(4.*NoV*NoL+.0001)*NoL;
  float crest=smoothstep(${f(FOAM_HEIGHT)},${f(MAX_HEIGHT)},vWave.x)*smoothstep(0.,${f(MAX_VERTICAL_SPEED*.6)},vWave.w)*.15;
  float foamWidth=mix(.35,1.1,clamp(.5+.25*vWave.x+.25*r1.x,0.,1.));
  // Water inside a shore circle is hidden by the wall, but it must not be a
  // blinding white disc if a sliver ever shows: foam only exists outside.
  float shoreFoam=smoothstep(-.9,-.15,shore)*(1.-smoothstep(foamWidth*.4,foamWidth,max(shore,0.)))*(.42+.32*r1.y);
  color=mix(color,uFoam,clamp(crest+shoreFoam,0.,.8));
  vec3 horizon=skyColor(normalize(vec3(vPosition.x-cameraPosition.x,0.,vPosition.z-cameraPosition.z)),false);
  color=mix(color,horizon,smoothstep(${f(HORIZON_FADE[0])},${f(HORIZON_FADE[1])},distanceXZ));
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

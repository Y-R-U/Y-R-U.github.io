import * as THREE from '../../vendor/three/three.module.js';

// Fur shader: orange/cream/pink tones from the baked `tone` attribute, tabby stripes computed from
// bind-pose coordinates (they ride the skin), fine fur noise, sheen and a soft rim.
const NOISE = /* glsl */`
float gh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(gh(i),gh(i+vec3(1,0,0)),f.x),mix(gh(i+vec3(0,1,0)),gh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gh(i+vec3(0,0,1)),gh(i+vec3(1,0,1)),f.x),mix(gh(i+vec3(0,1,1)),gh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float segD(vec3 p, vec3 a, vec3 b, out float t){ vec3 pa=p-a, ba=b-a; t=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*t); }
float band(float d, float w){ float aa = fwidth(d)*0.8+0.0006; return 1.0-smoothstep(w-aa, w+aa, d); }
`;

const STRIPES = /* glsl */`
// branch-free so fwidth() stays valid everywhere
float furStripes(vec3 p, float limb, vec3 rn){
  float n = vnoise(p*90.0)-0.5;
  float n2 = vnoise(p*23.0+7.0)-0.5;
  float m = 0.0, t;
  vec3 q = p; q.x = abs(q.x);
  // body bands wrapping from the spine down the flanks
  {
    float a = atan(q.x, q.y-0.2) / 1.5708;
    float zz = q.z + 0.03*a + n*0.006 + n2*0.012;
    float sp = 0.072;
    float k = (zz + 0.29) / sp;
    float id = floor(k + 0.5);
    float d = abs(k - id) * sp;
    float w = 0.0165 * (1.0 - smoothstep(0.5, 1.3, a)) * (0.8 + 0.2*sin(id*2.3));
    float reg = step(-0.5, id) * step(id, 5.5) * smoothstep(0.13, 0.16, q.y) * (1.0 - limb);
    reg *= smoothstep(-0.8, -0.5, rn.z) * (1.0 - smoothstep(0.6, 0.95, a) * smoothstep(-0.2, -0.5, rn.z));                         // no bullseye rings on the rear face
    w *= 1.0 - 0.45 * smoothstep(-0.12, -0.26, q.z) * smoothstep(0.35, 0.8, a);
    m = max(m, band(d, w) * reg);
  }
  // leg rings, outer side only
  {
    float k = (q.y + n*0.008) / 0.052;
    float rearRing = max(smoothstep(-0.6, -0.2, rn.z), step(0.1, q.y));
    float d = abs(fract(k)-0.5)*0.052;
    float reg = smoothstep(0.5, 0.8, limb) * smoothstep(0.065, 0.11, q.x) * step(0.07, q.y);
    m = max(m, band(d, 0.0085) * reg * rearRing);
  }
  // head: spherical coords around the skull centre (lon 0 = front)
  {
    vec3 v = p - vec3(0.0, 0.41, 0.235);
    float lon = atan(v.x, v.z), lat = atan(v.y, length(v.xz));
    float head = smoothstep(0.2, 0.15, length(v * vec3(1.0, 1.0, 0.9))) * step(0.12, p.z + 0.1);
    float u = clamp((lat - 0.6) / 0.8, 0.0, 1.0);
    float on = smoothstep(0.58, 0.64, lat) * step(lat, 1.5);
    float fw = 0.07 * (0.3 + 0.7*u);
    m = max(m, band(abs(lon) + n*0.03, fw) * on * head);
    m = max(m, band(abs(abs(lon) - 0.42*u - 0.1) + n*0.03, fw*0.85) * on * head * step(0.04, u));
    // cheek streaks on the sides of the face
    float side = abs(lon);
    float cu = clamp((side - 0.9) / 0.75, 0.0, 1.0);
    float cOn = smoothstep(0.88, 0.95, side) * step(side, 1.7);
    float cw = 0.065 * (1.0 - 0.6*cu) * smoothstep(0.0, 0.2, cu);
    m = max(m, band(abs(lat - 0.16 + 0.06*cu) + n*0.03, cw) * cOn * head);
    m = max(m, band(abs(lat + 0.08 + 0.02*cu) + n*0.03, cw*0.9) * cOn * head);
  }
  // tail rings + dark tip
  {
    float best = 1e3, s = 0.0, acc = 0.0, tot = 0.0;
    for (int i = 0; i < 6; i++) tot += length(uTail[i+1]-uTail[i]);
    for (int i = 0; i < 6; i++) {
      float L = length(uTail[i+1]-uTail[i]);
      float d = segD(p, uTail[i], uTail[i+1], t);
      if (d < best) { best = d; s = (acc + t*L)/tot; }
      acc += L;
    }
    float reg = smoothstep(-0.28, -0.31, p.z);
    float k = s*5.5 + 0.2 + n*0.2;
    float d = abs(fract(k)-0.5);
    m = max(m, band(d, 0.2) * step(0.1, s) * reg);
    m = max(m, smoothstep(0.88, 0.93, s) * reg);
  }
  return m;
}
`;

export function createFurMaterial({ tailPts, quality = 'high', shell = -1, shared = null } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.78, metalness: 0,
    sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffb070),
    specularIntensity: 0.25,
  });
  const uniforms = shared ? { ...shared, uShell: { value: shell } } : {
    uShell: { value: shell }, uShellLen: { value: 0.006 },
    uOrange: { value: new THREE.Color(0xe8781c) },
    uOrange2: { value: new THREE.Color(0xf59433) },
    uCream: { value: new THREE.Color(0xfbe6c2) },
    uPink: { value: new THREE.Color(0xf09aa0) },
    uStripe: { value: new THREE.Color(0x1c0d06) },
    uRim: { value: new THREE.Color(0xffd29a) },
    uRimStr: { value: 0.35 },
    uTail: { value: tailPts.map((p) => new THREE.Vector3(...p)) },
  };
  mat.userData.uniforms = uniforms;
  const isShell = shell >= 0;
  if (isShell) { mat.alphaTest = 0.5; mat.sheen = 0; }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    if (isShell) {
      sh.vertexShader = '#define SHELL\n' + sh.vertexShader;
      sh.fragmentShader = '#define SHELL\n' + sh.fragmentShader;
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef SHELL\ntransformed += normalize(objectNormal) * uShellLen * uShell;\n#endif')
      .replace('#include <common>', '#include <common>\nuniform float uShell, uShellLen;\nattribute vec3 tone;\nvarying vec3 vTone;\nvarying vec3 vRest;\nvarying vec3 vRestN;')
      .replace('#include <morphnormal_vertex>', '#include <morphnormal_vertex>\nvRestN = objectNormal;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvRest = transformed;\nvTone = tone;\n#ifdef USE_MORPHTARGETS\nvTone.z *= 1.0 - smoothstep(0.004, 0.02, length(transformed - position));\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uOrange, uOrange2, uCream, uPink, uStripe, uRim; uniform float uRimStr, uShell; uniform vec3 uTail[7];
varying vec3 vTone; varying vec3 vRest; varying vec3 vRestN;
${NOISE}
${STRIPES}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float fn = vnoise(vRest*260.0)*0.6 + vnoise(vRest*70.0)*0.4;
  vec3 base = mix(uOrange, uOrange2, smoothstep(0.15, 0.45, vRest.y) * 0.6 + (fn-0.5)*0.5);
  float st = furStripes(vRest, vTone.z, normalize(vRestN)) * (1.0 - smoothstep(0.25, 0.7, vTone.x));
  base = mix(base, uCream, vTone.x);
  base = mix(base, uPink, vTone.y);
  base = mix(base, uStripe, st * 0.97);
  base *= 0.9 + 0.2*fn;
#ifdef SHELL
  vec3 cell = floor(vRest * 900.0);
  float h = gh(cell) * 0.75 + gh(floor(vRest * 400.0) + 3.0) * 0.25;
  vec3 fq = (vRest - vec3(0.0, 0.4, 0.37)) / vec3(0.11, 0.09, 0.07);
  float face = 1.0 - smoothstep(0.7, 1.1, length(fq));
  float cut = 0.4 + uShell * 0.55 + face;
  if (h < cut - 0.08) discard;
  diffuseColor.a = smoothstep(cut - 0.08, cut + 0.02, h);
  base *= mix(0.82, 1.08, uShell);
#endif
  diffuseColor.rgb = base;
}`)
      .replace('#include <opaque_fragment>', `{
  float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += uRim * diffuseColor.rgb * pow(fr, 2.2) * uRimStr;
  outgoingLight += diffuseColor.rgb * 0.06;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => isShell ? 'garfield-fur-shell-v4' : 'garfield-fur-v4';
  return mat;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fogUniforms } from './shared.js';
import { GeoWriter, C, mul } from './geo.js';

const FOG_ALPHA = /* glsl */`
#include <tonemapping_fragment>
#include <colorspace_fragment>
#if defined(USE_FOG) && !defined(FOG_EXP2)
  gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
`;

function quadGeo() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

// ---------- ground decals: team rings, zone floors and pickup pads in one instanced draw ----------
// styles: 0 solid, 1 dashed, 2 double, 3 flame, 4 pulse | 5 crown zone, 6 safe circle, 7 danger zone, 8 capture zone | 9 pickup pad
// | 10 next crown zone, 11 next safe circle (dashed previews)
export const RING_STYLES = { solid: 0, dashed: 1, double: 2, flame: 3, pulse: 4 };
export const ZONE_STYLES = { crown: 5, safe: 6, danger: 7, capture: 8, next: 10, 'safe-next': 11 };
function decalGeo(seg = 32) {
  // disc + one annulus; aP = (dir.x, dir.z, rho). Centre vertices carry their segment's direction so the safe
  // circle can fold the disc into a thin band around its edge.
  const P = [], I = [];
  const LV = [0, 0.72, 1.0];
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2, am = (k + 0.5) / seg * Math.PI * 2;
    const v = (a, r) => { P.push(Math.cos(a), Math.sin(a), r); return P.length / 3 - 1; };
    const c = v(am, 0);
    const r0a = v(a0, LV[1]), r0b = v(a1, LV[1]), r1a = v(a0, LV[2]), r1b = v(a1, LV[2]);
    I.push(c, r0b, r0a, r0a, r0b, r1b, r0a, r1b, r1a);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('aP', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(P.length), 3));
  g.setIndex(I);
  return g;
}
const DECAL_VERT = /* glsl */`
  attribute vec3 aP; attribute vec4 iR; attribute vec4 iC; attribute float iS; attribute vec2 iX;
  varying vec2 vUv; varying vec4 vC; varying float vR; varying float vS; varying vec2 vW; varying vec2 vX;
  #include <fog_pars_vertex>
  void main() {
    float R = max(iR.z, 0.5);
    vec2 dir = aP.xy;
    float rw;
    if ((iS > 5.5 && iS < 6.5) || iS > 10.5) {
      float band = iS > 10.5 ? 2.5 : clamp(R * 0.25, 3.0, 9.0);
      rw = aP.z < 0.5 ? R - band : aP.z < 0.9 ? R - band : R + band;
      rw = max(rw, 0.0);
    } else {
      float ext = iS > 8.5 ? 1.0 : 1.0 + max(1.6, R * 0.22) * (iS > 2.5 && iS < 3.5 ? 2.4 : 1.0) / R;
      if (iS > 4.5 && (iS < 8.5 || iS > 9.5)) ext = 1.0 + 2.5 / R;
      rw = aP.z * R * ext;
    }
    vUv = dir * rw / R; vR = R; vC = vec4(iC.rgb, iR.w * iC.w); vS = iS; vX = iX;
    vec3 w = vec3(iR.x + dir.x * rw, iS > 4.5 && (iS < 8.5 || iS > 9.5) ? 0.05 : 0.06, iR.y + dir.y * rw);
    vW = w.xz;
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
export function createRings(max, shared) {
  const g = decalGeo(32);
  const a = new Float32Array(max * 4), c = new Float32Array(max * 4), st = new Float32Array(max), x = new Float32Array(max * 2);
  const ia = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
  const ic = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
  const is = new THREE.InstancedBufferAttribute(st, 1).setUsage(THREE.DynamicDrawUsage);
  const ix = new THREE.InstancedBufferAttribute(x, 2).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iR', ia); g.setAttribute('iC', ic); g.setAttribute('iS', is); g.setAttribute('iX', ix);
  g.instanceCount = 0;
  const atlas = iconAtlas();
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uInfo: shared.uInfo, uInfoXf: shared.uInfoXf, uAtlas: { value: atlas }, uYaw: shared.uYaw, uSafeCol: shared.uSafeCol },
    vertexShader: DECAL_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uInfo; uniform vec4 uInfoXf; uniform sampler2D uAtlas; uniform float uYaw; uniform vec3 uSafeCol;
      varying vec2 vUv; varying vec4 vC; varying float vR; varying float vS; varying vec2 vW; varying vec2 vX;
      #include <fog_pars_fragment>
      float gl1(float x, float w) { float q = x / w; return exp(-q * q); }
      void main() {
        float d = length(vUv);
        float ang = atan(vUv.y, vUv.x);
        vec3 col;
        if (vS > 9.5) {
          float xm = (d - 1.0) * vR;
          float n = max(12.0, floor(6.2832 * vR / 4.0));
          float u = fract(ang / 6.2832 * n - uTime * 0.08);
          float dash = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.5, 0.58, u));
          float line = gl1(xm, 0.2) * 1.4 * dash + gl1(xm, 1.0) * 0.12;
          float fill = vS < 10.5 ? step(d, 1.0) * 0.035 : 0.0;
          col = vC.rgb * (line + fill) * (0.75 + 0.25 * sin(uTime * 3.0)) * vC.a;
        } else if (vS > 8.5) {
          if (d > 1.0) discard;
          float ring = gl1(d - 0.78, 0.05) * 1.6 + gl1(d - 0.78, 0.2) * 0.4;
          float inner = (1.0 - smoothstep(0.0, 0.7, d)) * 0.35;
          float dash = step(0.5, fract(ang * 1.909 + uTime * 0.4)) * gl1(d - 0.9, 0.03);
          float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
          vec2 rt = vec2(cos(uYaw), -sin(uYaw)), up = vec2(-sin(uYaw), -cos(uYaw));
          vec2 iuv = vec2(dot(vUv, rt), dot(vUv, up)) / 0.62 * 0.5 + 0.5;
          float icon = 0.0;
          if (iuv.x > 0.04 && iuv.x < 0.96 && iuv.y > 0.04 && iuv.y < 0.96) icon = texture2D(uAtlas, vec2((iuv.x + vX.x) / 3.0, iuv.y)).a;
          col = (vC.rgb * (ring + inner + dash) * pulse + mix(vC.rgb, vec3(1.0), 0.6) * icon * 1.4) * vC.a;
        } else if (vS > 4.5) {
          float xm = (d - 1.0) * vR;
          float t = uTime;
          if (vS < 5.5 || vS > 7.5) {
            // crown / capture: bright gold (or team) rim, inner ring, slow rays, progress arc for capture
            float rim = gl1(xm, 0.28) * 1.7 + gl1(xm, 1.6) * 0.55 + gl1(xm + 1.3, 0.12) * 0.8;
            float rays = pow(max(0.5 + 0.5 * sin(ang * 14.0 + t * 0.35), 0.0), 6.0) * smoothstep(0.15, 0.9, d) * step(d, 1.0) * 0.22;
            float rings = (0.5 + 0.5 * sin(d * vR * 1.6 - t * 2.2)) * step(d, 1.0) * 0.07 * smoothstep(0.1, 0.6, d);
            float fill = step(d, 1.0) * 0.045;
            float k = 1.0;
            if (vS > 7.5) {
              float a01 = fract(-ang / 6.2831853 + 0.25);
              float on = step(a01, vX.x);
              k = mix(0.35, 1.25, on);
              rim += gl1(xm - 1.0, 0.25) * on * 1.4;
            }
            float pulse = 0.85 + 0.15 * sin(t * 3.0);
            col = vC.rgb * ((rim * k + rays + rings + fill) * pulse) * vC.a;
          } else if (vS < 6.5) {
            // safe circle edge: crisp light line, hazard stripes outside sweeping inward
            float line = gl1(xm, 0.22) * 2.0 + gl1(xm, 1.2) * 0.5;
            float inside = (1.0 - smoothstep(-6.0, 0.0, -xm)) * 0.0 + smoothstep(-5.0, 0.0, xm) * step(xm, 0.0) * 0.12;
            float u = (ang * vR + xm) * 0.22 + t * 0.6;
            float stripe = smoothstep(0.45, 0.5, fract(u)) * (1.0 - smoothstep(0.95, 1.0, fract(u)));
            float outer = step(0.0, xm) * exp(-xm / 5.0);
            col = (vC.rgb * (line + inside) + uSafeCol * (outer * (0.25 + 0.45 * stripe))) * vC.a;
          } else {
            // danger: red hazard disc
            float u = (vW.x + vW.y) * 0.35 + t * 0.4;
            float stripe = smoothstep(0.45, 0.52, fract(u)) * (1.0 - smoothstep(0.93, 1.0, fract(u)));
            float rim = gl1(xm, 0.3) * (1.4 + 0.6 * sin(t * 6.0)) + gl1(xm, 1.5) * 0.4;
            col = vC.rgb * (rim + step(d, 1.0) * (0.1 + 0.45 * stripe)) * vC.a;
          }
        } else {
          float lw = max(0.14, vR * 0.012) / vR;
          float gw = max(0.9, vR * 0.09) / vR;
          float x = (d - 1.0);
          float line = exp(-x * x / (lw * lw));
          float glow = exp(-x * x / (gw * gw)) * (x > 0.0 ? 0.55 : 0.45);
          float fill = (1.0 - smoothstep(0.2, 1.02, d)) * 0.08;
          float spark = pow(max(0.5 + 0.5 * sin(ang * 6.0 - uTime * 1.6), 0.0), 8.0) * line;
          float rp = fract(uTime * 0.45);
          float rx = d - rp;
          float ripple = exp(-rx * rx / 0.0025) * (1.0 - rp) * 0.35 * step(d, 1.0);
          vec3 hot = vec3(0.0);
          if (vS > 0.5 && vS < 1.5) {
            float n = max(10.0, floor(6.2832 * vR / 3.2));
            float u = fract(ang / 6.2832 * n + uTime * 0.12);
            float m = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.54, 0.6, u));
            line *= m * 1.3; glow *= 0.5; spark = 0.0;
          } else if (vS > 1.5 && vS < 2.5) {
            float x2 = d - (1.0 - max(0.7, vR * 0.06) / vR);
            line = line + exp(-x2 * x2 / (lw * lw * 0.7)) * 0.85;
          } else if (vS > 2.5 && vS < 3.5) {
            float n1 = 0.5 + 0.5 * sin(ang * 9.0 + uTime * 5.0), n2 = 0.5 + 0.5 * sin(ang * 23.0 - uTime * 8.3 + 1.7), n3 = 0.5 + 0.5 * sin(ang * 4.0 - uTime * 2.1);
            float h = (0.25 + 0.75 * n1 * n2 + 0.35 * n3) * max(1.3, vR * 0.13) / vR;
            float tongue = x > 0.0 ? exp(-x / max(h, 1e-3)) : exp(-x * x / (gw * gw * 0.3));
            glow = tongue * 0.9;
            hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.75, 0.3), exp(-x * x / (lw * lw * 2.0))) * tongue * 0.3;
            spark *= 0.5;
          } else if (vS > 3.5) {
            float p = 0.5 + 0.5 * sin(uTime * 5.5);
            line *= 0.7 + 0.8 * p; glow *= 0.6 + 0.9 * p;
            float rp2 = fract(uTime * 0.9), rx2 = d - 1.0 - rp2 * 0.35;
            ripple += exp(-rx2 * rx2 / 0.0012) * (1.0 - rp2) * 0.6;
          }
          if (mod(vX.y, 2.0) > 0.5) { float hp = 0.5 + 0.5 * sin(uTime * 3.0); line += exp(-(x + 0.05) * (x + 0.05) / (lw * lw * 0.5)) * 0.5 * hp; }
          float v = line * 1.5 + glow * 0.45 + fill + spark * 1.2 + ripple;
          col = (vC.rgb * v + hot) * vC.a;
        }
        vec2 iuv = (vW - uInfoXf.xy) * uInfoXf.zw;
        float open = texture2D(uInfo, iuv).a;
        float k = vS > 4.5 && (vS < 8.5 || vS > 9.5) ? mix(0.35, 1.0, open) : mix(0.08, 1.0, open);
        gl_FragColor = vec4(col * k, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  // ghost: crowd rings seen through buildings (only fragments behind something already drawn: the city)
  const gg = new THREE.InstancedBufferGeometry();
  gg.index = g.index;
  for (const k of ['aP', 'position', 'iR', 'iC', 'iS', 'iX']) gg.setAttribute(k, g.getAttribute(k));
  gg.instanceCount = 0;
  const gmat = new THREE.ShaderMaterial({
    fog: true, transparent: false, depthWrite: false, depthFunc: THREE.GreaterDepth, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: DECAL_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying vec4 vC; varying float vR; varying float vS; varying vec2 vW; varying vec2 vX;
      #include <fog_pars_fragment>
      void main() {
        if (vX.y < 1.5) discard;
        float d = length(vUv), x = (d - 1.0) * vR;
        float line = exp(-x * x / 0.09) + exp(-x * x / 1.4) * 0.3;
        float h = fract((vW.x - vW.y) * 0.6);
        float hatch = step(d, 1.0) * smoothstep(0.42, 0.5, h) * (1.0 - smoothstep(0.5, 0.58, h)) * 0.22;
        gl_FragColor = vec4(vC.rgb * (line * 0.9 + hatch + step(d, 1.0) * 0.06) * vC.a * 0.75, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const ghost = new THREE.Mesh(gg, gmat);
  ghost.frustumCulled = false;
  ghost.renderOrder = 0.5;
  let nCrowd = 0;
  return {
    mesh, ghost,
    set(i, x0, z, r, alpha, col, inten = 1, style = 0, ex = 0, ey = 0) {
      a[i * 4] = x0; a[i * 4 + 1] = z; a[i * 4 + 2] = r; a[i * 4 + 3] = alpha;
      c[i * 4] = col.r; c[i * 4 + 1] = col.g; c[i * 4 + 2] = col.b; c[i * 4 + 3] = inten;
      st[i] = style; x[i * 2] = ex; x[i * 2 + 1] = ey;
    },
    markCrowds(n) { nCrowd = n; },
    commit(n) { g.instanceCount = n; gg.instanceCount = nCrowd; ia.needsUpdate = true; ic.needsUpdate = true; is.needsUpdate = true; ix.needsUpdate = true; },
  };
}

// ---------- zone walls: safe-circle wall of light, crown / capture light columns, danger fence ----------
export function createZoneWalls(max, shared) {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true);
  cyl.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = cyl.index;
  g.setAttribute('position', cyl.getAttribute('position'));
  g.setAttribute('uv', cyl.getAttribute('uv'));
  const a = new Float32Array(max * 4), c = new Float32Array(max * 4);
  const ia = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
  const ic = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iZ', ia); g.setAttribute('iZc', ic);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec4 iZ; attribute vec4 iZc; varying vec2 vUv; varying vec4 vC; varying float vR; varying float vH; varying float vG;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vC = iZc; vR = iZ.z; vH = iZ.w;
        vec3 w = vec3(iZ.x + position.x * iZ.z, position.y * iZ.w, iZ.y + position.z * iZ.z);
        vec3 V = normalize(cameraPosition - w);
        vG = smoothstep(0.05, 0.4, abs(dot(normalize(vec3(position.x, 0.0, position.z)), V)));
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec4 vC; varying float vR; varying float vH; varying float vG;
      #include <fog_pars_fragment>
      void main() {
        float y = vUv.y, u = vUv.x * 6.2831853 * vR;
        float style = floor(vC.a), alpha = fract(vC.a) * 2.0;
        float a;
        if (style < 5.5 || style > 7.5) {
          float rays = 0.55 + 0.45 * sin(u * 0.9 + uTime * 0.8) * sin(u * 0.37 - uTime * 0.5);
          a = pow(max(1.0 - y, 0.0), 2.2) * rays * 0.22;
        } else if (style < 6.5) {
          float bands = 0.6 + 0.4 * sin(u * 0.5 - uTime * 2.0);
          float scan = exp(-pow((fract(y * 1.5 - uTime * 0.35) - 0.5) / 0.08, 2.0)) * 0.35;
          a = ((pow(max(1.0 - y, 0.0), 1.6) * 0.32 + scan * (1.0 - y) * 0.6) * bands + exp(-y * 30.0) * 0.45) * (gl_FrontFacing ? 1.0 : 0.55);
        } else {
          a = pow(max(1.0 - y, 0.0), 3.0) * (0.5 + 0.5 * sin(uTime * 7.0)) * 0.5;
        }
        gl_FragColor = vec4(vC.rgb * a * alpha * vG, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 7;
  return {
    mesh,
    set(i, x, z, r, h, col, style, alpha) {
      a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = r; a[i * 4 + 3] = h;
      c[i * 4] = col.r; c[i * 4 + 1] = col.g; c[i * 4 + 2] = col.b; c[i * 4 + 3] = style + Math.min(0.999, Math.max(0, alpha) * 0.5);
    },
    commit(n) { g.instanceCount = n; mesh.visible = n > 0; ia.needsUpdate = true; ic.needsUpdate = true; },
  };
}

// ---------- precipitation: rain streaks, snow flakes, wind-blown leaves, confetti; positions are all in the shader ----------
export const PRECIP = { rain: 1, snow: 2, wind: 3, confetti: 4 };
export function createPrecip(max, shared) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(max * 4);
  for (let i = 0; i < max; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
  g.setAttribute('iS', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = 0;
  const U = {
    uTime: shared.uTime, uMode: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(60, 40, 60) },
    uWindV: { value: new THREE.Vector2(0, 0) }, uSize: { value: 1 }, uNear: { value: 30 }, uLit: { value: new THREE.Color(1, 1, 1) }, uDens: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), ...U },
    vertexShader: /* glsl */`
      attribute vec4 iS;
      uniform float uTime; uniform float uMode; uniform vec3 uCenter; uniform vec3 uBox; uniform vec2 uWindV; uniform float uSize; uniform float uDens; uniform float uNear;
      varying vec2 vUv; varying float vA; varying vec3 vTint;
      #include <fog_pars_vertex>
      vec3 wrap(vec3 p) {
        vec3 b2 = uBox * 2.0;
        return uCenter + (fract((p - uCenter + uBox) / b2) * b2 - uBox);
      }
      void main() {
        vUv = position.xy; vTint = vec3(1.0);
        float fall = uMode < 1.5 ? 22.0 : uMode < 2.5 ? 1.6 : uMode < 3.5 ? 0.5 : 2.2;
        vec2 wv = uWindV * (uMode < 1.5 ? 0.25 : 1.0);
        float t = uTime;
        vec3 p = vec3(iS.x * 997.0, 0.0, iS.y * 991.0) + vec3(wv.x * t, 0.0, wv.y * t);
        if (uMode > 1.5) { p.x += sin(t * (0.7 + iS.w) + iS.z * 40.0) * (uMode > 2.5 ? 2.5 : 0.8); p.z += cos(t * (0.6 + iS.z) + iS.w * 30.0) * (uMode > 2.5 ? 2.5 : 0.8); }
        p = wrap(vec3(p.x, 0.0, p.z));
        p.y = uMode > 2.5 && uMode < 3.5 ? 0.25 + fract(iS.z * 7.0) * 4.0 + 1.6 * sin(t * (1.5 + iS.w) + iS.x * 40.0) * fract(iS.w * 3.0) : (1.0 - fract(iS.z + t * fall / (uBox.y * 2.0))) * uBox.y * 2.0;
        p.y = max(p.y, 0.05);
        vec3 cam = cameraPosition;
        vec3 V = normalize(cam - p);
        vec3 w;
        float keep = step(iS.w, uDens) * smoothstep(uNear * 0.45, uNear, length(cam - p));
        if (uMode < 1.5) {
          vec3 vel = normalize(vec3(wv.x, -fall, wv.y));
          vec3 side = normalize(cross(vel, V));
          float L = 0.55 * uSize, W = 0.018 * uSize;
          w = p + side * position.x * W - vel * position.y * L;
          vA = 0.26 * keep; vTint = vec3(0.75, 0.82, 0.95);
        } else {
          vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float S = (uMode < 2.5 ? 0.09 : uMode < 3.5 ? 0.16 : 0.12) * uSize * (0.7 + 0.6 * iS.w);
          float a = t * (1.0 + iS.x * 3.0) + iS.y * 30.0;
          vec2 q = vec2(position.x, position.y * 2.0 - 1.0);
          if (uMode > 2.5) q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * vec2(1.0, 0.55 + 0.45 * sin(a * 1.7));
          w = p + rt * q.x * S + up * q.y * S;
          vA = (uMode < 2.5 ? 0.85 : 1.0) * keep;
          if (uMode > 2.5 && uMode < 3.5) vTint = iS.x < 0.18 ? vec3(0.92, 0.9, 0.84) : mix(vec3(0.55, 0.3, 0.08), vec3(0.85, 0.55, 0.12), iS.y);
          if (uMode > 3.5) vTint = iS.x < 0.25 ? vec3(1.0, 0.25, 0.3) : iS.x < 0.5 ? vec3(1.0, 0.85, 0.2) : iS.x < 0.75 ? vec3(0.25, 0.7, 1.0) : vec3(0.4, 1.0, 0.5);
        }
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uMode; uniform vec3 uLit;
      varying vec2 vUv; varying float vA; varying vec3 vTint;
      #include <fog_pars_fragment>
      void main() {
        if (vA < 0.01) discard;
        float a = vA;
        if (uMode < 1.5) a *= (1.0 - abs(vUv.x)) * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
        else if (uMode < 2.5) { vec2 q = vec2(vUv.x, vUv.y * 2.0 - 1.0); a *= 1.0 - smoothstep(0.3, 1.0, length(q)); }
        if (a < 0.01) discard;
        gl_FragColor = vec4(vTint * uLit, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.visible = false;
  return { mesh, U, max, setCount(n) { g.instanceCount = Math.min(max, n); mesh.visible = n > 0; } };
}

// ---------- glow points (lamp halos, sparks) ----------
const POINT_VERT = /* glsl */`
attribute float aSize;
attribute vec4 aCol;
uniform float uScale;
uniform float uFlip;
uniform float uTime;
uniform float uHaloK;
varying vec4 vCol;
#ifdef SHAPES
attribute vec2 aShape;
varying vec2 vShape;
#endif
#include <fog_pars_vertex>
void main() {
  vec3 p = position; p.y *= uFlip;
  vCol = aCol;
#ifdef SHAPES
  vShape = aShape;
#endif
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uHaloK * uScale / max(-mvPosition.z, 0.1);
  #include <fog_vertex>
}`;
const POINT_FRAG = /* glsl */`
varying vec4 vCol;
#ifdef SHAPES
uniform sampler2D uShapes;
uniform float uTime;
varying vec2 vShape;
#endif
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
#ifdef SHAPES
  if (vShape.x > 0.5) {
    float a = vShape.y + uTime * (vShape.x > 4.5 && vShape.x < 5.5 ? 5.0 : vShape.x > 1.5 && vShape.x < 2.5 ? 2.0 : 0.0);
    vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
    vec2 uv = clamp(r * 0.5 + 0.5, 0.0, 1.0);
    float m = texture2D(uShapes, vec2((uv.x + vShape.x - 1.0) / 7.0, 1.0 - uv.y)).a;
    if (m < 0.02) discard;
    gl_FragColor = vec4(vCol.rgb * m * vCol.a, 1.0);
    ${FOG_ALPHA}
    return;
  }
#endif
  if (d > 1.0) discard;
  float core = exp(-d * 9.0);
  float halo = (1.0 - d) * (1.0 - d) * 0.35;
  gl_FragColor = vec4(vCol.rgb * (core + halo) * vCol.a, 1.0);
  ${FOG_ALPHA}
}`;

// 6 white sprites in a row: star, petal, heart, bolt, confetti, puff
function shapeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 448; cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff';
  const at = (k, f) => { x.save(); x.translate(k * 64 + 32, 32); f(); x.restore(); };
  at(0, () => { x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 6 : 28; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill(); });
  at(1, () => { x.beginPath(); x.ellipse(0, 0, 12, 24, 0.5, 0, Math.PI * 2); x.fill(); });
  at(2, () => { x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-34, 0, -20, -28, 0, -10); x.bezierCurveTo(20, -28, 34, 0, 0, 22); x.fill(); });
  at(3, () => { x.beginPath(); x.moveTo(8, -30); x.lineTo(-14, 4); x.lineTo(0, 4); x.lineTo(-8, 30); x.lineTo(16, -6); x.lineTo(2, -6); x.closePath(); x.fill(); });
  at(4, () => { x.fillRect(-14, -8, 28, 16); });
  at(5, () => { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.fill(); });
  at(6, () => { const g = x.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-1.5, -30, 3, 60); });
  const t = new THREE.CanvasTexture(cv);
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

function pointsMaterial(shared, flip = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, fog: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uScale: shared.uPointScale, uFlip: { value: flip }, uTime: shared.uTime, uHaloK: shared.uHaloK || { value: 1 } },
  });
}

export function createHalos(data, shared, hc = [1.0, 0.48, 0.16, 0.6]) {
  const n = data.length / 4;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = data[i * 4]; pos[i * 3 + 1] = data[i * 4 + 1]; pos[i * 3 + 2] = data[i * 4 + 2];
    size[i] = data[i * 4 + 3];
    col[i * 4] = hc[0]; col[i * 4 + 1] = hc[1]; col[i * 4 + 2] = hc[2]; col[i * 4 + 3] = hc[3];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  const pts = new THREE.Points(g, pointsMaterial(shared, 1));
  pts.frustumCulled = false; pts.renderOrder = 6;
  const rg = new THREE.BufferGeometry();
  const rcol = col.slice();
  for (let i = 0; i < n; i++) rcol[i * 4 + 3] = hc[3] * 0.75;
  rg.setAttribute('position', g.getAttribute('position'));
  rg.setAttribute('aSize', g.getAttribute('aSize'));
  rg.setAttribute('aCol', new THREE.BufferAttribute(rcol, 4));
  const refl = new THREE.Points(rg, pointsMaterial(shared, -1));
  refl.frustumCulled = false; refl.renderOrder = -3;
  return { points: pts, reflection: refl };
}

export function createParticles(max, shared) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), col = new Float32Array(max * 4), shp = new Float32Array(max * 2);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), size0 = new Float32Array(max);
  const grav = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const sa = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const ha = new THREE.BufferAttribute(shp, 2).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('aSize', sa); g.setAttribute('aCol', ca); g.setAttribute('aShape', ha);
  g.setDrawRange(0, 0);
  const pmat = pointsMaterial(shared, 1);
  pmat.defines = { SHAPES: 1 };
  pmat.uniforms.uShapes = { value: shapeAtlas() };
  const pts = new THREE.Points(g, pmat);
  pts.frustumCulled = false; pts.renderOrder = 8;
  let top = 0, cursor = 0, alive = 0, dirtyShape = false;
  return {
    points: pts,
    get alive() { return alive; },
    get top() { return top; },
    emit(x, y, z, vx, vy, vz, r, gr, b, sz, lf, gravity = 9, shape = 0, spin = 0) {
      let i = cursor;
      for (let k = 0; k < max; k++) { if (life[i] <= 0) break; i = (i + 1) % max; }
      cursor = (i + 1) % max;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      col[i * 4] = r; col[i * 4 + 1] = gr; col[i * 4 + 2] = b; col[i * 4 + 3] = 1;
      size0[i] = sz; size[i] = sz; life[i] = lf; maxLife[i] = lf; grav[i] = gravity;
      shp[i * 2] = shape; shp[i * 2 + 1] = spin;
      if (i + 1 > top) top = i + 1;
      dirtyShape = true;
    },
    update(dt) {
      let hi = 0; alive = 0;
      for (let i = 0; i < top; i++) {
        if (life[i] <= 0) { size[i] = 0; continue; }
        life[i] -= dt;
        const t = Math.max(0, life[i] / maxLife[i]);
        vel[i * 3 + 1] -= grav[i] * dt;
        const drag = Math.exp(-dt * 1.2);
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.3; }
        col[i * 4 + 3] = Math.min(1, t * 2.5);
        size[i] = size0[i] * (0.4 + 0.6 * t);
        if (life[i] <= 0) size[i] = 0;
        hi = i + 1; alive++;
      }
      top = hi;
      g.setDrawRange(0, top);
      pa.needsUpdate = sa.needsUpdate = ca.needsUpdate = true;
      pa.clearUpdateRanges(); pa.addUpdateRange(0, top * 3);
      sa.clearUpdateRanges(); sa.addUpdateRange(0, top);
      ca.clearUpdateRanges(); ca.addUpdateRange(0, top * 4);
      if (dirtyShape) { ha.needsUpdate = true; ha.clearUpdateRanges(); ha.addUpdateRange(0, top * 2); dirtyShape = false; }
    },
    burst(x, z, col, n, speed = 6, size = 0.9, up = 6) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        this.emit(x, 0.8 + Math.random(), z, Math.cos(a) * s, up * (0.4 + Math.random() * 0.8), Math.sin(a) * s,
          col.r * 2, col.g * 2, col.b * 2, size * (0.6 + Math.random() * 0.8), 0.7 + Math.random() * 0.6);
      }
    },
  };
}

// ---------- water + jets ----------
export function createWater(list, jets, shared) {
  const geos = [];
  for (const w of list) {
    const c = new THREE.CircleGeometry(w.r, 40);
    c.rotateX(-Math.PI / 2);
    const n = c.attributes.position.count;
    const l = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { l[i * 3] = c.attributes.position.getX(i); l[i * 3 + 1] = c.attributes.position.getZ(i); l[i * 3 + 2] = w.r; }
    c.setAttribute('aL', new THREE.BufferAttribute(l, 3));
    c.deleteAttribute('uv');
    c.translate(w.x, w.y, w.z);
    geos.push(c);
  }
  const wg = mergeGeometries(geos);
  const wmat = new THREE.ShaderMaterial({
    fog: true, uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec3 aL; varying vec3 vL; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vL = aL; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vL; varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vL.xy);
        float rr = d / max(vL.z, 0.01);
        float w1 = sin(d * 4.5 - uTime * 2.6) * 0.5 + 0.5;
        float w2 = sin(vW.x * 2.3 + uTime * 1.3) * sin(vW.z * 2.7 - uTime * 1.1) * 0.5 + 0.5;
        float caust = pow(max(w1 * w2, 0.0), 3.0);
        vec3 deep = vec3(0.0, 0.07, 0.42);
        vec3 bright = vec3(0.05, 0.55, 1.6);
        vec3 col = mix(bright, deep, smoothstep(0.0, 1.0, rr) * 0.8) * (0.7 + 0.4 * w1);
        col += vec3(0.3, 0.8, 1.6) * caust * 0.8;
        col += vec3(0.3, 0.75, 1.5) * smoothstep(0.88, 1.0, rr) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(wg, wmat);
  water.renderOrder = 1;

  const jg = [];
  for (const j of jets) {
    const c = j.ring ? new THREE.CylinderGeometry(j.r * 1.6, j.r * 0.4, j.h, 16, 1, true) : new THREE.CylinderGeometry(j.r * 0.5, j.r, j.h, 8, 1, true);
    c.translate(j.x, j.y + j.h / 2, j.z);
    jg.push(c);
    if (!j.ring) {
      const top = new THREE.CylinderGeometry(j.r * 3.2, j.r * 0.6, j.h * 0.45, 10, 1, true);
      top.translate(j.x, j.y + j.h * 0.85, j.z);
      jg.push(top);
    }
  }
  const jgeo = mergeGeometries(jg);
  const jmat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        float streak = sin(vUv.x * 50.0 + sin(vUv.y * 6.0) * 2.0) * 0.5 + 0.5;
        float flow = sin(vUv.y * 18.0 + uTime * 9.0 + vUv.x * 20.0) * 0.5 + 0.5;
        float a = pow(max(vUv.y, 0.0), 0.6) * (0.25 + 0.75 * streak * flow) * smoothstep(1.0, 0.75, vUv.y);
        gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * a * 0.9, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const jetMesh = new THREE.Mesh(jgeo, jmat);
  jetMesh.renderOrder = 7;
  return { water, jets: jetMesh, jetList: jets };
}

// ---------- crown ----------
function crownGeo() {
  const G = new GeoWriter();
  const gold = C(0xf2a200), deep = C(0xa85e00);
  const n = 10, r = 0.85;
  G.cyl(0, 0, 0, 0.5, r, r * 1.08, n, gold, { top: false, colFn: (k) => (k % 2 ? gold : mul(gold, 0.85)) });
  G.cyl(0, 0, -0.08, 0.06, r * 1.04, r * 1.04, n, deep, { top: false });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const a0 = a - 0.42, a1 = a + 0.42;
    const p = (an, y, rr) => [Math.cos(an) * rr, y, Math.sin(an) * rr];
    const tip = p(a, 1.25, r * 1.14);
    G.tri(p(a1, 0.5, r * 1.08), p(a0, 0.5, r * 1.08), tip, gold);
    G.tri(p(a0, 0.5, r * 1.0), p(a1, 0.5, r * 1.0), tip, deep);
    G.blob(tip[0], tip[1] + 0.08, tip[2], 0.13, C(0xffd060), Math.random, 1);
    const gem = p(a + Math.PI / 5, 0.26, r * 1.1);
    G.blob(gem[0], gem[1], gem[2], 0.12, k % 2 ? C(0xff2040) : C(0x2050ff), Math.random, 1);
  }
  return G.build();
}

export function createCrown(shared) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uSunDir: shared.uSunDir, uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec3 color; varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() { vC = color; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir; uniform float uTime; varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
        float dif = max(dot(N, uSunDir), 0.0);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, uSunDir), 0.0), 24.0) + pow(max(R.y, 0.0), 6.0) * 0.6;
        float rim = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 2.0);
        vec3 col = vC * (0.35 + 0.75 * dif + 0.45 * max(N.y, 0.0)) + vec3(1.0, 0.75, 0.35) * spec * 0.9 + vC * rim * 0.9 + vC * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const crown = new THREE.Mesh(crownGeo(), mat);
  group.add(crown);
  const shaftGeo = new THREE.CylinderGeometry(1.1, 1.8, 1, 20, 1, true);
  shaftGeo.translate(0, 0.5, 0);
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uA: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(max(abs(dot(normalize(vN), V)), 0.0), 1.5);
        float rays = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 1.5) * sin(vUv.x * 17.0 - uTime);
        float a = edge * rays * pow(max(vUv.y, 0.0), 1.6) * smoothstep(0.25, 0.7, vUv.y) * smoothstep(1.0, 0.85, vUv.y) * 0.7 * uA;
        gl_FragColor = vec4(vec3(1.0, 0.58, 0.12) * a, 1.0);
      }`,
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.renderOrder = 9;
  crown.renderOrder = 10;
  return { group, crown, shaft, shaftMat };
}

// ---------- pickups ----------
function iconAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  // speed: double chevron
  x.lineWidth = 16;
  for (const y of [70, 100]) { x.beginPath(); x.moveTo(30, y); x.lineTo(64, y - 34); x.lineTo(98, y); x.stroke(); }
  // magnet
  x.lineWidth = 22;
  x.beginPath(); x.moveTo(128 + 34, 28); x.lineTo(128 + 34, 66); x.arc(128 + 64, 66, 30, Math.PI, 0, true); x.lineTo(128 + 94, 28); x.stroke();
  x.fillRect(128 + 22, 18, 24, 18); x.fillRect(128 + 82, 18, 24, 18);
  // x2
  x.font = 'bold 76px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('x2', 256 + 64, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export const PICKUP_COL = { speed: new THREE.Color(0x2a8cff), magnet: new THREE.Color(0xff3048), double: new THREE.Color(0xa64dff) };
export const KIND_IDX = { speed: 0, magnet: 1, double: 2 };

export function createPickups(max, shared) {
  const atlas = iconAtlas();
  const g = quadGeo();
  const a = new Float32Array(max * 4), c = new Float32Array(max * 4);
  const ia = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
  const ic = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iP', ia); g.setAttribute('iC', ic);
  g.instanceCount = 0;
  const padMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uAtlas: { value: atlas }, uYaw: shared.uYaw },
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iC; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_vertex>
      void main() { float R = 2.6 * iP.w; vUv = position.xz; vC = iC; vK = iP.z;
        vec3 w = vec3(iP.x + position.x * R, 0.08, iP.y + position.z * R);
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uYaw; uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        if (d > 1.0) discard;
        float q1 = (d - 0.78) / 0.05, q2 = (d - 0.78) / 0.2, q3 = (d - 0.9) / 0.03;
        float ring = exp(-q1 * q1) * 1.6 + exp(-q2 * q2) * 0.4;
        float inner = smoothstep(0.7, 0.0, d) * 0.35;
        float ang = atan(vUv.y, vUv.x);
        float dash = step(0.5, fract(ang * 1.909 + uTime * 0.4)) * exp(-q3 * q3);
        float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
        vec2 rt = vec2(cos(uYaw), -sin(uYaw)), up = vec2(-sin(uYaw), -cos(uYaw));
        vec2 iuv = vec2(dot(vUv, rt), dot(vUv, up)) / 0.62 * 0.5 + 0.5;
        float icon = 0.0;
        if (iuv.x > 0.04 && iuv.x < 0.96 && iuv.y > 0.04 && iuv.y < 0.96) icon = texture2D(uAtlas, vec2((iuv.x + vK) / 3.0, iuv.y)).a;
        vec3 col = vC.rgb * (ring + inner + dash) * pulse + mix(vC.rgb, vec3(1.0), 0.6) * icon * 1.4;
        gl_FragColor = vec4(col * vC.a, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const pads = new THREE.Mesh(g, padMat);
  pads.frustumCulled = false; pads.renderOrder = 4;

  const bg = new THREE.InstancedBufferGeometry();
  const cyl = new THREE.CylinderGeometry(1.5, 1.9, 1, 16, 1, true);
  cyl.translate(0, 0.5, 0);
  bg.index = cyl.index;
  bg.setAttribute('position', cyl.getAttribute('position'));
  bg.setAttribute('uv', cyl.getAttribute('uv'));
  bg.setAttribute('normal', cyl.getAttribute('normal'));
  bg.setAttribute('iP', ia); bg.setAttribute('iC', ic);
  bg.instanceCount = 0;
  const beamMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iC; varying vec2 vUv; varying vec4 vC; varying float vE;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vC = iC;
        vec3 w = vec3(iP.x + position.x * iP.w, position.y * 6.5 * iP.w, iP.y + position.z * iP.w);
        vec3 V = normalize(cameraPosition - w);
        vE = abs(dot(normalize(vec3(normal.x, 0.0, normal.z)), V));
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec4 vC; varying float vE;
      #include <fog_pars_fragment>
      void main() {
        float streak = 0.5 + 0.5 * sin(vUv.x * 60.0 + uTime * 0.7);
        float rise = fract(vUv.y * 2.0 - uTime * 0.8);
        float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.35 + 0.65 * streak) * (0.6 + 0.4 * rise) * pow(max(vE, 0.0), 0.7) * 0.7;
        gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const beams = new THREE.Mesh(bg, beamMat);
  beams.frustumCulled = false; beams.renderOrder = 5;

  const ig = quadGeo();
  ig.setAttribute('iP', ia); ig.setAttribute('iC', ic);
  ig.instanceCount = 0;
  const uIconS = { value: 1.4 };
  const iconMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uAtlas: { value: atlas }, uIconS },
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iC; uniform float uTime; uniform float uIconS; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_vertex>
      void main() { vUv = vec2(position.x, -position.z); vC = iC; vK = iP.z;
        float S = uIconS * iP.w;
        vec3 c = vec3(iP.x, 2.2 + 1.6 * S + 0.25 * S * sin(uTime * 2.4 + iP.x), iP.y);
        vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 w = c + rt * vUv.x * S + up * vUv.y * S;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        float aa = fwidth(d) * 1.5;
        float disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
        if (disc <= 0.0) discard;
        float ring = smoothstep(0.78 - aa, 0.78, d);
        vec2 iuv = vUv / 0.62 * 0.5 + 0.5;
        float icon = 0.0;
        if (iuv.x > 0.02 && iuv.x < 0.98 && iuv.y > 0.02 && iuv.y < 0.98) icon = texture2D(uAtlas, vec2((iuv.x + vK) / 3.0, iuv.y)).a;
        vec3 bg = mix(vC.rgb * 0.42, vC.rgb * 0.7, smoothstep(0.8, -0.6, vUv.y));
        vec3 col = mix(bg, vec3(1.0), max(ring * 0.95, icon));
        gl_FragColor = vec4(col, disc * min(1.0, vC.a));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const icons = new THREE.Mesh(ig, iconMat);
  icons.frustumCulled = false; icons.renderOrder = 11;
  return {
    pads, beams, icons,
    setView(d) { uIconS.value = Math.min(3.4, Math.max(1.2, d / 36)); },
    set(i, x, z, kind, alpha, scale = 1) {
      const col = PICKUP_COL[kind] || PICKUP_COL.speed;
      a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = KIND_IDX[kind] ?? 0; a[i * 4 + 3] = scale;
      c[i * 4] = col.r * 1.6; c[i * 4 + 1] = col.g * 1.6; c[i * 4 + 2] = col.b * 1.6; c[i * 4 + 3] = alpha;
    },
    commit(n) { g.instanceCount = n; bg.instanceCount = n; ig.instanceCount = n; ia.needsUpdate = true; ic.needsUpdate = true; },
  };
}

// ---------- pigeons: small flocks on plazas that scatter when a crowd comes near ----------
export function createPigeons(map, shared, perFlock = 12) {
  const flocks = [];
  for (const p of map.plazas || []) {
    const r = Math.min(p.r * 0.75, 30);
    flocks.push({ x: p.x, z: p.z, r, inner: (p.central ? 10 : 6) });
  }
  const n = flocks.length * perFlock;
  const P = [], A = [];
  const tri = (a, b, c, part) => { for (const v of [a, b, c]) { P.push(...v); A.push(part); } };
  tri([0, 0.12, 0.2], [-0.07, 0.1, -0.1], [0.07, 0.1, -0.1], 0);
  tri([0, 0.12, 0.2], [0.07, 0.1, -0.1], [0, 0.04, -0.05], 0);
  tri([0, 0.12, 0.2], [0, 0.04, -0.05], [-0.07, 0.1, -0.1], 0);
  tri([0, 0.1, -0.1], [-0.05, 0.11, -0.22], [0.05, 0.11, -0.22], 0);
  tri([0, 0.16, 0.24], [-0.03, 0.12, 0.17], [0.03, 0.12, 0.17], 3);
  tri([0.04, 0.12, 0.08], [0.04, 0.12, -0.08], [0.3, 0.12, -0.02], 1);
  tri([-0.04, 0.12, -0.08], [-0.04, 0.12, 0.08], [-0.3, 0.12, -0.02], 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  const ip = new Float32Array(n * 4), iff = new Float32Array(n * 4);
  const aP = new THREE.InstancedBufferAttribute(ip, 4).setUsage(THREE.DynamicDrawUsage);
  const aF = new THREE.InstancedBufferAttribute(iff, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iP', aP); g.setAttribute('iF', aF);
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uSkyCol: shared.uSkyCol, uLampCol: shared.uLampCol },
    vertexShader: /* glsl */`
      attribute float aPart; attribute vec4 iP; attribute vec4 iF;
      uniform float uTime; uniform vec3 uSkyCol; uniform vec3 uLampCol; varying vec3 vC;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position * 2.0;
        float fly = iF.y;
        if (aPart > 0.5 && aPart < 2.5) {
          float side = aPart < 1.5 ? 1.0 : -1.0;
          float a = fly > 0.5 ? sin(uTime * 26.0 + iF.x) * 1.1 : 1.35;
          float x = p.x * side;
          p.x = side * x * cos(a); p.y += x * sin(a) * (fly > 0.5 ? 1.0 : 0.15);
        }
        if (fly < 0.5) p.yz = mat2(cos(iF.z), -sin(iF.z), sin(iF.z), cos(iF.z)) * (p.yz - vec2(0.15, 0.0)) + vec2(0.15, 0.0);
        float c = cos(iP.w), s = sin(iP.w);
        vec3 w = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) + iP.xyz;
        float shade = iF.w;
        vC = (shade > 0.85 ? vec3(0.8, 0.79, 0.76) : mix(vec3(0.3, 0.32, 0.38), vec3(0.5, 0.52, 0.56), shade)) * (uSkyCol * 1.4 + uLampCol * 0.35);
        if (aPart > 2.5) vC *= 0.55;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC;
      #include <fog_pars_fragment>
      void main() { gl_FragColor = vec4(vC, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  const B = [];
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spot = (f, b) => {
    for (let k = 0; k < 8; k++) {
      const a = rnd() * Math.PI * 2, rr = f.inner + rnd() * (f.r - f.inner);
      b.tx = f.x + Math.cos(a) * rr; b.tz = f.z + Math.sin(a) * rr;
      if (!map.walkable || map.walkable(b.tx, b.tz)) return;
    }
  };
  flocks.forEach((f, fi) => {
    const cx = f.x + (rnd() - 0.5) * f.r, cz = f.z + (rnd() - 0.5) * f.r;
    for (let k = 0; k < perFlock; k++) {
      const b = { f, fi, x: cx + (rnd() - 0.5) * 4, z: cz + (rnd() - 0.5) * 4, y: 0, yaw: rnd() * 6.28, vx: 0, vy: 0, vz: 0, state: 0, t: rnd() * 3, peck: 0, shade: rnd(), ph: rnd() * 6.28, tx: 0, tz: 0 };
      if (map.walkable && !map.walkable(b.x, b.z)) { spot(f, b); b.x = b.tx; b.z = b.tz; }
      B.push(b);
    }
  });
  function update(dt, crowds) {
    dt = Math.min(dt, 0.05);
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.state === 0) {
        let threat = null, td = 1e9;
        for (const c of crowds) {
          if (!c || !c.alive) continue;
          const d = Math.hypot(b.x - c.x, b.z - c.z) - (c.visR || 1);
          if (d < td) { td = d; threat = c; }
        }
        if (threat && td < 5) {
          b.state = 1; b.t = 0;
          const dx = b.x - threat.x, dz = b.z - threat.z, l = Math.hypot(dx, dz) || 1;
          const a = Math.atan2(dz, dx) + (rnd() - 0.5) * 1.2;
          b.vx = Math.cos(a) * (6 + rnd() * 3); b.vz = Math.sin(a) * (6 + rnd() * 3); b.vy = 4 + rnd() * 2;
          spot(b.f, b);
          void l;
        } else {
          b.t -= dt;
          if (b.t < 0) { b.t = 0.6 + rnd() * 2.5; b.peck = rnd() < 0.5 ? 0.35 : 0; if (rnd() < 0.3) b.yaw += (rnd() - 0.5) * 2; }
          b.peck = Math.max(0, b.peck - dt);
        }
      } else {
        b.t += dt;
        const climb = b.t < 2.5;
        const dx = b.tx - b.x, dz = b.tz - b.z, dist = Math.hypot(dx, dz);
        const sp = climb ? 9 : Math.min(9, dist * 1.2 + 1);
        const k = 1 - Math.exp(-dt * 1.5);
        b.vx += ((dx / (dist || 1)) * sp - b.vx) * k; b.vz += ((dz / (dist || 1)) * sp - b.vz) * k;
        const wantY = climb ? 9 : Math.min(9, dist * 0.6);
        b.vy += (wantY - b.y) * dt * 2 - b.vy * dt * 1.5;
        b.x += b.vx * dt; b.y = Math.max(0, b.y + b.vy * dt); b.z += b.vz * dt;
        b.yaw = Math.atan2(b.vx, b.vz);
        if (!climb && dist < 0.6 && b.y < 0.3) { b.state = 0; b.y = 0; b.t = 1 + rnd() * 2; b.vx = b.vy = b.vz = 0; }
      }
      ip[i * 4] = b.x; ip[i * 4 + 1] = b.y; ip[i * 4 + 2] = b.z; ip[i * 4 + 3] = b.yaw;
      iff[i * 4] = b.ph; iff[i * 4 + 1] = b.state; iff[i * 4 + 2] = b.peck > 0 ? 0.7 : 0; iff[i * 4 + 3] = b.shade;
    }
    aP.needsUpdate = true; aF.needsUpdate = true;
  }
  return { mesh, update, count: n };
}

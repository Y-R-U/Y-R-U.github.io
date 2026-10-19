import * as THREE from 'three';

// Stealth shimmer (sim status `stealth`, e.g. WIDOWMAKER's Ghost Net): while cloaked, every material slot of the unit's skinned
// mesh is swapped for one additive fresnel "heat-haze" shader, so the robot reads as a faint glassy outline with scan bands.
// Same draw-call count; the mirror/shadow proxy is hidden so the reflection doesn't give it away.
const uTime = { value: 0 };
const VS = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(normalMatrix * objectNormal); vV = -mvPosition.xyz; vY = transformed.y;
}`;
const FS = /* glsl */`
uniform vec3 uColor; uniform float uA, uTime;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float wave = 0.5 + 0.5 * sin(vY * 9.0 - uTime * 3.2);
  float scan = 0.75 + 0.25 * sin(vY * 70.0 - uTime * 14.0);
  float glint = pow(0.5 + 0.5 * sin(vY * 2.5 - uTime * 1.7), 24.0);
  vec3 c = mix(uColor, vec3(0.85, 0.95, 1.0), f * 0.4) * (0.025 + f * 0.6 + glint * 0.25) * (0.45 + 0.55 * wave) * scan;
  gl_FragColor = vec4(c * uA, 1.0);
}`;

export function tickStealth(t) { uTime.value = t; }

export function setStealth(unit, on, { color, proxy } = {}) {
  const m = unit?.mesh;
  if (!m || !!unit._vpStealth === on) return false;
  if (on) {
    if (!unit._vpCloak) {
      unit._vpCloak = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color ?? 0x9fd8ff).multiplyScalar(0.35).lerp(new THREE.Color(0.35, 0.6, 0.9), 0.55) }, uA: { value: 1 }, uTime },
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
    }
    unit._vpMats = m.material;
    m.material = Array.isArray(m.material) ? m.material.map(() => unit._vpCloak) : unit._vpCloak;
    unit._vpShadow = m.castShadow; m.castShadow = false;
    if (proxy) proxy.visible = false;
  } else {
    m.material = unit._vpMats; m.castShadow = unit._vpShadow;
    if (proxy) proxy.visible = true;
  }
  unit._vpStealth = on;
  return true;
}

export function disposeStealth(unit) { unit?._vpCloak?.dispose(); }

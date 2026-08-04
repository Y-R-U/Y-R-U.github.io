// planet() — Ossian, the gas giant that backs half the shots.
//
// A lit sphere with a texture on it is not a planet. What sells one is the limb: a thin, very
// bright arc where the atmosphere is edge-on to the camera and near-edge-on to the star, and a
// terminator that falls all the way to black. So the body shader spends almost everything on
// those two terms and almost nothing on the bands, and a second, slightly larger additive shell
// carries the scatter that spills off the disc.
//
// Depth range: near 1 / far 14–48 km and no logarithmic buffer, so this is a scaled proxy —
// a few-thousand-metre sphere a few thousand metres out, not a real 60 000 km planet. Scenarios
// place it; `radius` is in metres in the scene, not in planet units.

import * as THREE from 'three';
import { system } from '../palettes.js';

const SUN = { value: new THREE.Vector3(0, 0, -1) };
const TINT = { value: new THREE.Color(1, 0.85, 0.7) };
const KNOB = { rim: 1, band: 1, term: 1, scatter: 1, edge: 5.5, tint: 0, albedo: 1 };
const PALE = new THREE.Color(0.86, 0.90, 1.0);
const BODIES = [];

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.7); return fract(p.x * p.y); }
float vn2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vn2(p); p *= 2.07; a *= 0.5; } return s; }
`;

const BODY_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vWP;
uniform vec3 uSun, uDeep, uMid, uHot, uRimCol;
uniform float uRim, uBand, uTerm, uSeed, uScat;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  float ndl = dot(N, uSun);
  float ndv = dot(N, V);

  // bands run in latitude and are sheared by a slow warp, so they are not stripes
  float lat = N.y;
  float warp = fbm(vec2(N.x * 2.2 + uSeed, N.z * 2.2)) - 0.5;
  float b = lat * 13.0 + warp * 2.4;
  float bands = 0.5 + 0.5 * sin(b * 3.14159);
  bands = mix(bands, fbm(vec2(b * 2.0, N.x * 3.0 + N.z * 3.0 + uSeed)), 0.30);
  bands = clamp((bands - 0.5) * 2.1 + 0.5, 0.0, 1.0);
  float storm = smoothstep(0.55, 0.95, fbm(vec2(N.x * 5.5 - uSeed, N.z * 5.5 + lat * 4.0)));
  vec3 albedo = mix(uDeep, uMid, clamp(bands * uBand, 0.0, 1.0));
  albedo = mix(albedo, uHot, storm * 0.5 * uBand);

  // terminator: a narrow wrap so the day side rolls into black instead of clipping at 0
  float day = smoothstep(-0.12 * uTerm, 0.34 * uTerm, ndl);
  // limb darkening on the lit side — the disc must not be a flat pancake
  float limbDark = pow(clamp(ndv, 0.0, 1.0), 0.42);
  vec3 col = albedo * day * limbDark * 1.15;

  // the rim: grazing view AND grazing light. Both, or it becomes an outline round the whole disc.
  // 3.4 spread the rim over most of a crescent and painted the whole visible face one
  // orange; the arc has to stay thin or it is not a limb, it is a wash
  float graze = pow(1.0 - clamp(ndv, 0.0, 1.0), 7.0);
  float fwd = smoothstep(-0.45, 0.55, ndl);
  col += uRimCol * (uRim * graze * fwd * 4.2);
  // forward scatter through the atmosphere just inside the terminator
  col += uRimCol * (uScat * 0.55 * pow(1.0 - clamp(ndv, 0.0, 1.0), 3.0)
    * smoothstep(-0.10, 0.30, ndl) * (1.0 - smoothstep(0.30, 0.85, ndl)));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // the terminator ramp crosses a whole screen at under a hundredth per pixel, which is far below
  // what 8 bits can hold — without a dither it comes out as stair-steps
  gl_FragColor.rgb += (h21(gl_FragCoord.xy) - 0.5) * (2.2 / 255.0);
}`;

// The halo shell: a slightly larger sphere drawn back-face-only and additively, so the scatter
// spills *outside* the body's silhouette. That overspill is what a real limb looks like and it is
// the one thing a sphere alone can never give you.
const HALO_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vWP;
uniform vec3 uSun, uRimCol;
uniform float uRim, uEdge;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  float ndl = dot(N, uSun);
  float edge = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uEdge);
  float lit = smoothstep(-0.35, 0.5, ndl);
  gl_FragColor = vec4(uRimCol * (uRim * edge * lit), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (h21(gl_FragCoord.xy + 7.0) - 0.5) * (2.2 / 255.0);
}`;

const VERT = `
varying vec3 vN; varying vec3 vWP;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const PLANETS = {
  ossian: {
    radius: 4200, seg: 144, seed: 1.7,
    deep: '#241a13', mid: '#9a6236', hot: '#e0ac6e',
  },
};

export const allPlanets = () => Object.keys(PLANETS);

export function planet(planetId, { seed = 0 } = {}) {
  const p = PLANETS[planetId] || PLANETS.ossian;
  const sys = system('tamber');
  const lin = c => new THREE.Color(c).convertSRGBToLinear();

  const body = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: BODY_FRAG, fog: false,
    uniforms: {
      uSun: SUN, uRimCol: TINT,
      uDeep: { value: lin(p.deep) }, uMid: { value: lin(p.mid) }, uHot: { value: lin(p.hot) },
      uRim: { value: KNOB.rim }, uBand: { value: KNOB.band }, uTerm: { value: KNOB.term },
      uScat: { value: KNOB.scatter }, uSeed: { value: p.seed + seed * 0.37 },
    },
  });

  const halo = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: HALO_FRAG, fog: false,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.BackSide,
    uniforms: { uSun: SUN, uRimCol: TINT, uRim: { value: KNOB.scatter }, uEdge: { value: KNOB.edge } },
  });

  const g = new THREE.Group();
  g.name = `planet:${planetId}`;
  const sphere = new THREE.SphereGeometry(p.radius, p.seg, p.seg / 2);
  const m = new THREE.Mesh(sphere, body);
  // the halo silhouette is the outermost edge in frame; at 48 segments its facets are the
  // stair-steps a critic reads on the terminator
  const h = new THREE.Mesh(new THREE.SphereGeometry(p.radius * 1.035, 144, 72), halo);
  h.renderOrder = 2;
  g.add(m, h);
  g.userData.radius = p.radius;
  g.userData.planetId = planetId;
  BODIES.push({ body, halo, sys });
  return g;
}

export function registerPlanetKnobs(q) {
  const G = 'Planet';
  const set = (k, u, v) => { KNOB[k] = v; for (const b of BODIES) if (b.body.uniforms[u]) b.body.uniforms[u].value = v; };
  q.register({ key: 'planetRim', label: 'Limb brightness', type: 'range', min: 0, max: 4, step: 0.02, default: 1.0, group: G },
    v => set('rim', 'uRim', v));
  q.register({ key: 'planetScatter', label: 'Rim scatter', type: 'range', min: 0, max: 4, step: 0.02, default: 1.0, group: G },
    v => { KNOB.scatter = v; for (const b of BODIES) { b.body.uniforms.uScat.value = v; b.halo.uniforms.uRim.value = v; } });
  q.register({ key: 'planetHalo', label: 'Halo tightness', type: 'range', min: 1.5, max: 14, step: 0.1, default: 5.5, group: G },
    v => { KNOB.edge = v; for (const b of BODIES) b.halo.uniforms.uEdge.value = v; });
  q.register({ key: 'planetBands', label: 'Band contrast', type: 'range', min: 0, max: 2, step: 0.02, default: 1.0, group: G },
    v => set('band', 'uBand', v));
  q.register({ key: 'planetTerm', label: 'Terminator softness', type: 'range', min: 0.2, max: 4, step: 0.02, default: 1.0, group: G },
    v => set('term', 'uTerm', v));
  // the limb takes the star's own hue, and Tamber is a K-type orange. A plate whose planet is a
  // pale grey-blue crescent needs the arc off the palette without unfreezing the palette.
  q.register({ key: 'planetTint', label: 'Limb toward white', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: G },
    v => { KNOB.tint = v; applyTint(); });
}

let lastTint = new THREE.Color(1, 0.85, 0.7);

function applyTint() {
  TINT.value.copy(lastTint).lerp(PALE, KNOB.tint);
}

// The star is the key here as much as anywhere: the limb only exists where the light grazes.
export function updatePlanetLighting(backdrop) {
  if (!backdrop) return;
  // backdrop.dir points *at* the star, which is exactly the "toward the sun" vector a shader wants.
  // A planet is lit by the star, never by the swung key — take the key and a scene that swings it
  // round to front-light its hulls also front-lights the planet, and the crescent disappears.
  SUN.value.copy(backdrop.dir).normalize();
  lastTint.set(backdrop.sys.starTint).convertSRGBToLinear();
  applyTint();
}

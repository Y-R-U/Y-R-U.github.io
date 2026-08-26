// Shared materials, the screen-space horizon curve, and the player rim light.
//
// THE CURVE. ART.md §1: the horizon is a shallow arc across the whole screen, not a ruled line.
// We get it by bending world y in the vertex shader by a term quadratic in the point's
// CAMERA-RELATIVE x. Because the camera is unrotated (pure side-on), view x == worldX - camX,
// so the maths is exact and cheap. The `curveN` factor divides out perspective so a background
// layer bends by the same number of SCREEN pixels as the gameplay plane — without it, distant
// layers curve far too hard.
//
// Shadows are deliberately NOT curved: the depth pass and the receiver's shadow coordinate are
// both computed from uncurved world space, so the shadow is painted onto the surface and bends
// WITH it. Curving one side only is what would break them.

import * as THREE from 'three';

export const curveU = {
  uCurveK: { value: 0 },
  uCamX: { value: 0 },
  uCamD: { value: 2550 },
};

const CURVE_DECL = `
uniform float uCurveK; uniform float uCamX; uniform float uCamD;
`;

const CURVE_BODY = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
vec4 curveWorld = modelMatrix * mvPosition;
float curveN = uCamD / max(120.0, uCamD - curveWorld.z);
float curveDx = curveWorld.x - uCamX;
curveWorld.y -= uCurveK * curveN * curveDx * curveDx;
mvPosition = viewMatrix * curveWorld;
gl_Position = projectionMatrix * mvPosition;
`;

/** Every world-layer material goes through this. Sky and clouds do not (they are camera-locked). */
export function patchCurve(mat) {
  if (mat.userData.curved) return mat;
  mat.userData.curved = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uCurveK = curveU.uCurveK;
    shader.uniforms.uCamX = curveU.uCamX;
    shader.uniforms.uCamD = curveU.uCamD;
    shader.vertexShader = CURVE_DECL + shader.vertexShader.replace('#include <project_vertex>', CURVE_BODY);
  };
  mat.customProgramCacheKey = () => 'curve';
  return mat;
}

/**
 * A rim light that tracks the camera: `1 - |N·V|` is exactly the silhouette edge from wherever
 * the camera is. This is half of ART.md §2 — the player's warm edge against any background.
 */
export function patchRim(mat, colHex, k = 0.8, key = 'rim') {
  const col = new THREE.Color(colHex);
  mat.userData.rim = { value: k };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uRimCol = { value: col };
    shader.uniforms.uRimK = mat.userData.rim;
    shader.fragmentShader = 'uniform vec3 uRimCol; uniform float uRimK;\n' + shader.fragmentShader
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb += uRimCol * uRimK * pow(rimF, 3.4);
      }`);
  };
  const base = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => (base ? base() : '') + key;
  return mat;
}

/**
 * A per-material aerial-perspective blend: `mix(colour, haze, k)` in the fragment. Used to sit
 * enemy aircraft further back in the air than the player without moving them off the gameplay
 * plane. Preferred over an emissive lift, which ADDS light and flattens the shading; a mix keeps
 * the form and only reduces the contrast, which is what real distance does.
 */
export function patchHaze(mat, key = 'haze') {
  mat.userData.haze = { value: new THREE.Color(0xffffff) };
  mat.userData.hazeK = { value: 0 };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uHazeCol = mat.userData.haze;
    shader.uniforms.uHazeK = mat.userData.hazeK;
    shader.fragmentShader = 'uniform vec3 uHazeCol; uniform float uHazeK;\n' + shader.fragmentShader
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, uHazeK);`);
  };
  const base = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => (base ? base() : '') + key;
  return mat;
}

export function makeTex(canvas, { repeatX = 1, repeatY = 1, wrapX = false, wrapY = false, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = wrapY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(repeatX, repeatY);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** One place that owns disposable GPU objects so a palette swap cannot leak. */
export function makeBin() {
  const items = [];
  return {
    keep(o) { items.push(o); return o; },
    dispose() { for (const o of items) { try { o.dispose && o.dispose(); } catch { /* already gone */ } } items.length = 0; },
  };
}

export const MAT = {
  /** Terrain, hills, water body — smooth, cheap, fogged, shadow-receiving. */
  ground(extra = {}) {
    return patchCurve(new THREE.MeshLambertMaterial({ vertexColors: true, fog: true, ...extra }));
  },
  /** Structures, vehicles, debris — flat-shaded low poly with a faint sheen on metal. */
  prop(extra = {}) {
    return patchCurve(new THREE.MeshPhongMaterial({
      vertexColors: true, flatShading: true, shininess: 12, specular: 0x1a1a18, fog: true, ...extra,
    }));
  },
  /** Aircraft — same, but never fogged; the plane must not haze out (ART.md §2). */
  aircraft(extra = {}) {
    return patchCurve(new THREE.MeshPhongMaterial({
      vertexColors: true, flatShading: true, shininess: 26, specular: 0x2a2a26, fog: false, ...extra,
    }));
  },
  /** Additive FX. No fog, no depth write, never lit. */
  additive(map, extra = {}) {
    return new THREE.MeshBasicMaterial({
      map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      fog: false, toneMapped: true, ...extra,
    });
  },
  alpha(map, extra = {}) {
    return new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, fog: false, ...extra,
    });
  },
};
